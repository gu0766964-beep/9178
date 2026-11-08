/* 无尽割草 · 云下发模块（cloud.js）
 *
 * 职责：
 * 1. 游戏一起动就从云端拉 manifest.json（版本号 + 文件列表）做版本比对
 * 2. 云端版本高就逐文件下载，存入 IndexedDB，然后 reload 进入 ?mowPatch=1 模式
 * 3. 没更新 / 下载失败就降级到本地 APK 资源
 * 4. 对外暴露 window.__mowAsset()，游戏内所有资源路径都从云或本地解析
 */
;(function () {
  'use strict'

  /* ========= 可覆盖的云端地址（Android 打包时只关流逝这） ========= */
  var C = window.__mowCloudConfig || {}
  var MANIFEST_URL = C.manifestUrl || 'https://raw.githubusercontent.com/gu0766964-beep/9178/main/cloud/manifest.json'
  var CDN = C.cdn || 'https://raw.githubusercontent.com/gu0766964-beep/9178/main/'

  /* ========= 本地存储 Key ========= */
  var VERSION_KEY = 'mow.cloud.version'       // 已安装的云端版本
  var MANIFEST_KEY = 'mow.cloud.manifest'     // 最后一次 manifest 原文
  var STATE_KEY = 'mow.cloud.state'           // local | cdn | patched | offline
  var DB_NAME = 'mow_cloud'
  var DB_VER = 1
  var STORE = 'files'
  var META_STORE = 'meta'
  var SCRIPTS = ['sim', 'render', 'main']     // 必须按顺序加载

  /* ------------------ IndexedDB 层 ------------------ */
  var db = null

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER)
      req.onupgradeneeded = function (e) {
        var d = e.target.result
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'path' })
        if (!d.objectStoreNames.contains(META_STORE)) d.createObjectStore(META_STORE, { keyPath: 'key' })
      }
      req.onsuccess = function (e) { db = e.target.result; resolve(db) }
      req.onerror = function (e) { db = null; reject(e.target.error) }
    })
  }

  function putFile(path, data) {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error('db not open'))
      var tx = db.transaction(STORE, 'readwrite')
      tx.onerror = function () { reject(tx.error) }
      tx.oncomplete = function () { resolve() }
      tx.objectStore(STORE).put({ path: path, data: data, ts: Date.now() })
    })
  }

  function getFile(path) {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error('db not open'))
      var tx = db.transaction(STORE, 'readonly')
      tx.onerror = function () { reject(tx.error) }
      tx.oncomplete = function () { resolve() }
      var req = tx.objectStore(STORE).get(path)
      req.onsuccess = function (e) {
        var r = e.target.result
        resolve(r ? r.data : null)
      }
      req.onerror = function (e) { reject(e.target.error) }
    })
  }

  function clearStore() {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error('db not open'))
      var tx = db.transaction(STORE, 'readwrite')
      tx.onerror = function () { reject(tx.error) }
      tx.oncomplete = function () { resolve() }
      tx.objectStore(STORE).clear()
    })
  }

  function metaPut(key, value) {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error('db not open'))
      var tx = db.transaction(META_STORE, 'readwrite')
      tx.onerror = function () { reject(tx.error) }
      tx.oncomplete = function () { resolve() }
      tx.objectStore(META_STORE).put({ key: key, value: value })
    })
  }

  function metaGet(key) {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error('db not open'))
      var tx = db.transaction(META_STORE, 'readonly')
      tx.onerror = function () { reject(tx.error) }
      tx.oncomplete = function () { resolve() }
      var req = tx.objectStore(META_STORE).get(key)
      req.onsuccess = function (e) {
        var r = e.target.result
        resolve(r ? r.value : null)
      }
      req.onerror = function (e) { reject(e.target.error) }
    })
  }

  /* ------------------ fetch 工具 ------------------ */
  function get(url, as) {
    as = as || 'text'
    return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status + ' ' + url)
        return r[as]()
      })
  }

  /* ------------------ manifest 层 ------------------ */
  var cachedManifest = null

  function parseManifest(raw) {
    var m
    try { m = JSON.parse(raw) } catch (e) { return null }
    if (!m.versionCode) return null
    return {
      versionCode: Number(m.versionCode),
      versionName: String(m.versionName || ''),
      cdn: m.cdn || CDN,
      files: m.files || {},
    }
    /* 得到清单格式化版本 */
  }

  function localVersion() {
    try { return Number(localStorage.getItem(VERSION_KEY) || 0) } catch (e) { return 0 }
  }

  function setVersion(v) {
    try { localStorage.setItem(VERSION_KEY, String(v)) } catch (e) {}
  }

  /* ------------------ 版本检测 + 文件下载 ------------------ */
  async function checkForUpdate() {
    /* 1. 尝试拉取最新 manifest */
    var raw = null
    try { raw = await get(MANIFEST_URL + '?v=' + Date.now() + '&r=' + (Math.random() | 0)) }
    catch (e) { console.warn('[cloud] 拉取 manifest 失败（离线）: ' + e.message) }
    var m = raw ? parseManifest(raw) : null
    /* 2. 拉不到就用本地保留 */
    if (!m) {
      try {
        var s = localStorage.getItem(MANIFEST_KEY)
        if (s) m = parseManifest(s)
      } catch (e) { }
    }
    if (!m) return null
    /* 3. 版本没高过时不需要更新 */
    if (localVersion() >= m.versionCode) return null
    return m
  }

  /* 逐文件下载，存入 IndexedDB */
  async function downloadFiles(m) {
    var ok = []
    var bad = []
    var items = Object.keys(m.files)
    for (var i = 0; i < items.length; i++) {
      var p = items[i]
      var en = m.files[p]
      var url = en.url || m.cdn + p
      var data = null
      try {
        data = await get(url, 'text')
      } catch (e) {
        console.warn('[cloud] 下载 %s 失败: %s', p, e.message)
        bad.push(p)
        continue
      }
      try { await putFile(p, data) }
      catch (e) { bad.push(p); continue }
      try { await metaPut(p + '.url', en.url || m.cdn + p) } catch (e) { }
      try { await metaPut(p + '.md', en.md5 || '') } catch (e) { }
      ok.push(p)
    }
    return { ok: ok, bad: bad }
  }

  /* 安装新的云端版本 */
  async function installPatched(m) {
    try { await setVersion(m.versionCode) } catch (e) { }
    try { await metaPut(STATE_KEY, 'patched') } catch (e) { }
    try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(m)) } catch (e) { }
    return true
  }

  /* ------------------ 脚本加载 ------------------ */
  /* 按顺序执行脚本（sim -> render -> main） */
  async function loadScriptText(text) {
    if (!text) return null
    /* 精确的基因与 window 分配 */
    eval(text)
    return text
  }

  async function loadPatchedScripts() {
    var list = []
    for (var i = 0; i < SCRIPTS.length; i++) {
      var p = SCRIPTS[i] + '.js'
      var data = null
      try { data = await getFile(p) } catch (e) { }
      if (data) { try { await loadScriptText(data) } catch (e) { console.warn('[cloud] patch 脚本执行失败: ' + p) } }
      list.push(p)
    }
    return list
  }

  async function loadLocalScripts() {
    var list = []
    for (var i = 0; i < SCRIPTS.length; i++) {
      var p = SCRIPTS[i] + '.js'
      var url = location.protocol + '//' + location.host + location.pathname + 'game/' + p
      var text = null
      try { text = await get(url, 'text') }
      catch (e) { console.warn('[cloud] 本地脚本加载失败: ' + p); continue }
      try { await loadScriptText(text) }
      catch (e) { console.warn('[cloud] 脚本执行失败: ' + p) }
      list.push(p)
    }
    return list
  }

  /* ------------------ 资源 URL 解析（对外 API） ------------------ */
  /* __mowAsset('music/yuai.mp3')  → APK 本地 / CDN（已安装的云端版本文件） */
  function mowAsset(path) {
    var p = String(path || '')
    if (!p) return p
    var m = null
    try {
      var s = localStorage.getItem(MANIFEST_KEY)
      if (s) m = parseManifest(s)
    } catch (e) { }
    if (m) {
      var en = m.files[p]
      if (en) {
        var url = en.url || m.cdn + p
        if (typeof url === 'string' && url) return url
      }
    }
    /* fallback：APK 本机 */
    return p
  }

  /* 暴露 API 到全局 */
  window.__mowAsset = mowAsset

  /* 标记状态 */
  function markState(s) {
    try { metaPut(STATE_KEY, s) } catch (e) { }
  }

  /* ------------------ 入口 ------------------ */
  async function init() {
    console.log('[debug] init 被调用')
    var state = 'local'
    try { state = await metaGet(STATE_KEY) } catch (e) { }
    if (!state) state = 'local'

    var fromPatch = location.search.indexOf('mowPatch=1') >= 0

    /* .Asset 云版本 */
    if (fromPatch || state === 'patched') {
      try { await openDB() } catch (e) { openErr(); return }
      await loadPatchedScripts()
      markState('patched')
      return
    }

    if (state === 'cdn') {
      /* 首回下载结束，reload 进入 patched 态 */
      await markState('patched')
      location.assign(location.pathname + '?mowPatch=1')
      return
    }

    /* ---- 正常本地启动 ---- */
    try { await openDB() } catch (e) { return }
    var m = null
    try { m = await checkForUpdate() } catch (e) { m = null }
    if (!m) {
      /* 没有更新或者无网络 → 本地启动 */
      markState('local')
      await loadLocalScripts()
      return
    }
    /* 有更新 → 下载文件 */
    markState('cdn')
    var r = await downloadFiles(m)
    /* 关键文件下载失败就回滚 */
    if (r.bad.length > 0 && r.ok.length === 0) {
      markState('local')
      await loadLocalScripts()
      return
    }
    await installPatched(m)
    location.assign(location.pathname + '?mowPatch=1')
  }

  function openErr() {
    /* IndexedDB 不可用 → 全部本地 */
    markState('local')
    window.__mowState = 'local'
  }

  /* 页面加载完再启动 */
  if (document.readyState === 'complete') init()
  else window.addEventListener('load', init)
})()
