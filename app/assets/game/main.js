/* 无尽割草 · 主控：输入、HUD、流程、音效、设置、商店、音乐 */
;(function () {
  'use strict'

  var Sim = window.MowSim
  var canvas = document.getElementById('stage')
  var renderer = new window.MowRenderer(canvas)

  var el = {}
  ;[
    'timer', 'kills', 'level', 'coins', 'hpFill', 'hpText', 'xpFill', 'xpText', 'weaponRow',
    'hud', 'joystick', 'stick', 'startScreen', 'levelScreen', 'overScreen', 'cards', 'lvlTitle',
    'bestTime', 'bestKills', 'resTime', 'resKills', 'resLevel', 'newBest', 'toast', 'diag',
    'pauseBtn', 'topRight', 'soundBtn', 'musicFile',
    'pauseScreen', 'resumeBtn', 'restartBtn', 'setBtn', 'quitBtn', 'settleBtn', 'shopBtn1', 'setBtn1',
    'settingsScreen', 'swSfx', 'swMusic', 'swAuto', 'segJoy', 'setBackBtn',
    'shopScreen', 'coinBal', 'shopList', 'shopBackBtn', 'resCoins',
    'gShopScreen', 'gCoinBal', 'gShopList', 'gShopBackBtn',
    'attackBtn', 'waveTop', 'enemyLeft', 'playlist', 'musicAddBtn', 'skipBtn', 'continueBtn',
    'musicBtn', 'musicEntry', 'musicCard', 'musicBackBtn', 'segMode', 'nowPlaying',
    'prevTrackBtn', 'nextTrackBtn', 'modeTrackBtn',
    'cheatScreen', 'cheatInput', 'cheatOkBtn', 'cheatBackBtn', 'cheatMsg',
    'noticeScreen', 'noticeVer', 'noticeAdd', 'noticeFix', 'noticeFixHead', 'noticeDl', 'noticeOk', 'noticeBackBtn', 'noticeTags', 'noticeHistoryBtn',
    'noticeHistoryScreen', 'noticeHistoryVer', 'noticeHistoryList', 'noticeHistoryBackBtn', 'noticeOkHistory',
    'noticeCloudNoticeBtn', 'noticeCloudDot',
    'noticeEntryBtn', 'noticeEntryDot',
    'cloudNoticeHistoryScreen', 'cloudHistoryVer', 'cloudHistoryList', 'cloudHistoryBackBtn', 'cloudHistoryOk',
    'updateScreen', 'updTitle', 'updVer', 'updTags', 'updAdd', 'updFix', 'updAddHead', 'updFixHead', 'updDl', 'updOk',
    'aboutScreen', 'aboutBtn', 'aboutBackBtn', 'aboutOk',
    'updBtn',
    'diffScreen', 'diffList', 'diffTip', 'diffBackBtn',
    'jobScreen', 'jobList', 'jobBackBtn', 'jobBtn', 'curJob',
    'bgVideo',
  ].forEach(function (id) {
    el[id] = document.getElementById(id)
  })
  el.stick = document.querySelector('#joystick .stick')

  var DEBUG = /[?&]debug=1/.test(location.search)
  if (DEBUG) el.diag.classList.add('on')

  /* ---------------- 持久化：最佳纪录 / 设置 / 金币 / 升级 ---------------- */
  var BEST_KEY = 'mow.best.v1'
  var SET_KEY = 'mow.settings.v1'
  var COIN_KEY = 'mow.coins.v1'
  var UP_KEY = 'mow.upgrades.v1'
  var SAVE_KEY = 'mow.save.v1'
  var DIFF_KEY = 'mow.diff.v1'
  var JOBS_KEY = 'mow.jobs.v1'
  var JOB_KEY = 'mow.job.v1'

  var best = { time: 0, kills: 0 }
  var lastDiff = 'normal'
  try { var ld = JSON.parse(localStorage.getItem(DIFF_KEY) || '""'); if (ld && Sim.DIFFS[ld]) lastDiff = ld } catch (e) {}
  var settings = { sfx: true, music: true, joy: 'float', auto: true }
  var wallet = 0
  var upgrades = { armor: 0, swift: 0, sharp: 0, luck: 0, revive: 0, vigor: 0, greed: 0, lowhp: 0 }
  // 已解锁职业列表与当前选择（默认游侠；其余靠闯关成就或金币购买解锁）
  var unlocked = ['ranger']
  var currentJob = 'ranger'

  function load() {
    try {
      var b = JSON.parse(localStorage.getItem(BEST_KEY) || 'null')
      if (b && typeof b.time === 'number') best = { time: b.time, kills: b.kills | 0 }
      var st = JSON.parse(localStorage.getItem(SET_KEY) || 'null')
      if (st) settings = {
        sfx: st.sfx !== false,
        music: st.music !== false,
        joy: st.joy === 'fixed' ? 'fixed' : 'float',
        auto: st.auto !== false,
      }
      var c = parseInt(localStorage.getItem(COIN_KEY) || '0', 10)
      if (isFinite(c) && c > 0) wallet = c
      var u = JSON.parse(localStorage.getItem(UP_KEY) || 'null')
      if (u) for (var k in upgrades) if (typeof u[k] === 'number') upgrades[k] = u[k]
      var jl = JSON.parse(localStorage.getItem(JOBS_KEY) || 'null')
      if (jl && jl.length) {
        unlocked = jl.filter(function (j) { return !!(Sim.CLASSES && Sim.CLASSES[j]) })
        if (!unlocked.length) unlocked = ['ranger']
      }
      var cj = localStorage.getItem(JOB_KEY) || ''
      if (Sim.CLASSES && Sim.CLASSES[cj] && unlocked.indexOf(cj) >= 0) currentJob = cj
    } catch (e) {}
  }
  function saveAll() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best))
      localStorage.setItem(SET_KEY, JSON.stringify(settings))
      localStorage.setItem(COIN_KEY, String(wallet))
      localStorage.setItem(UP_KEY, JSON.stringify(upgrades))
      localStorage.setItem(JOBS_KEY, JSON.stringify(unlocked))
      localStorage.setItem(JOB_KEY, currentJob)
    } catch (e) {}
  }
  load()

  var state = Sim.create({ seed: (Date.now() & 0xffffffff), view: viewSize(), upgrades: upgrades })
  var phase = 'menu'
  var acc = 0
  var last = 0
  var hudAcc = 0
  var diagAcc = 0
  var fps = 60
  var frames = 0
  var fpsAcc = 0
  var brightness = 0
  var pausedByUser = false
  var saveAcc = 0
  var weaponSig = ''
  var input = { x: 0, y: 0 }
  var keys = {}
  var coinBanked = false
  var skipShown = false

  function viewSize() {
    return { w: window.innerWidth, h: window.innerHeight }
  }

  /* ---------------- 音效（WebAudio 合成） ---------------- */
  var actx = null

  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { actx = null }
    }
    if (actx && actx.state === 'suspended') actx.resume()
    return actx
  }

  function blip(freq, dur, type, gain, slideTo) {
    if (!settings.sfx) return
    try {
      var ac = audio()
      if (!ac) return
      var o = ac.createOscillator()
      var g = ac.createGain()
      o.type = type || 'square'
      o.frequency.setValueAtTime(freq, ac.currentTime)
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), ac.currentTime + dur)
      g.gain.setValueAtTime(gain == null ? 0.05 : gain, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur)
      o.connect(g)
      g.connect(ac.destination)
      o.start()
      o.stop(ac.currentTime + dur + 0.02)
    } catch (e) { /* 音频不可用时静默降级，不影响按钮逻辑 */ }
  }

  var sfx = {
    click: function () { blip(520, 0.07, 'triangle', 0.07) },
    level: function () { blip(520, 0.09, 'triangle', 0.08); setTimeout(function () { blip(780, 0.12, 'triangle', 0.08) }, 90); setTimeout(function () { blip(1040, 0.16, 'triangle', 0.07) }, 190) },
    hurt: function () { blip(190, 0.16, 'sawtooth', 0.07, 90) },
    kill: function () { blip(880, 0.04, 'square', 0.025) },
    boss: function () { blip(120, 0.5, 'sawtooth', 0.09, 60) },
    over: function () { blip(320, 0.5, 'sawtooth', 0.09, 70) },
    coin: function () { blip(1040, 0.06, 'triangle', 0.06); setTimeout(function () { blip(1560, 0.09, 'triangle', 0.05) }, 50) },
  }

  function syncSoundBtn() {
    el.soundBtn.textContent = settings.sfx ? '🔊' : '🔇'
  }
  /* 游戏内按钮即时响应：Android WebView 在多指触屏期间会抑制 click 合成，
     按住摇杆的同时点按钮会无反应，因此按钮改为 pointerdown 立即触发，
     click 仅作兜底（400ms 内已触发过则忽略，防重复）。 */
  function tap(el, fn) {
    if (!el) return
    var fired = 0
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.stopPropagation()
      fired = Date.now()
      fn()
    })
    el.addEventListener('click', function () {
      if (Date.now() - fired < 400) return
      fn()
    })
  }
  tap(el.soundBtn, function () {
    settings.sfx = !settings.sfx
    saveAll()
    syncSoundBtn()
    if (settings.sfx) sfx.click()
  })

  /* ---------------- 背景音乐：内置曲 + 玩家导入 + 播放列表 ---------------- */
  // 内置曲：一首 WebAudio 合成的循环 BGM（零体积）+ 一首打包进 APK 的 MP3
  var BUILTIN_ID = '__builtin__'
  var BUILTIN_TRACKS = [
    { id: BUILTIN_ID, name: '内置 · 极夜回廊', builtin: 'synth' },
    { id: '__builtin_yuai__', name: '内置 · 雨爱', builtin: 'file', url: 'music/yuai.mp3' },
    { id: '__builtin_onemore__', name: '内置 · One More Last Time', builtin: 'file', url: 'music/onemore.mp3' },
    { id: '__builtin_geiniya__', name: '内置 · 给你呀', builtin: 'file', url: 'music/geiniya.mp3' },
    { id: '__builtin_twg__', name: '内置 · 滕王阁小曲', builtin: 'file', url: 'music/tengwangge.mp3' },
    { id: '__builtin_zhidui__', name: '内置 · 只对你有感觉', builtin: 'file', url: 'music/zhidui.mp3' },
    { id: '__builtin_bjj__', name: '内置 · 不将就', builtin: 'file', url: 'music/bujiangjiu.m4a' },
    { id: '__builtin_nzj__', name: '内置 · 你最近过的还好吗', builtin: 'file', url: 'music/nizuijin.mp3' },
    { id: '__builtin_di57__', name: '内置 · 第57次取消发送', builtin: 'file', url: 'music/di57.mp3' },
    { id: '__builtin_wml__', name: '内置 · 我们俩', builtin: 'file', url: 'music/womenlia.mp3' },
    { id: '__builtin_mss__', name: '内置 · 魔术师', builtin: 'file', url: 'music/moshoushi.mp3' },
  ]
  var musicEl = null
  var musicTrackId = ''
  var musicTrackName = ''
  var tracks = []          // [{id, name, url, builtin, objUrl}]
  var currentIdx = -1
  // 播放模式：order 顺序 / repeat 单曲循环 / random 随机
  var MODE_KEY = 'mow.musicmode.v1'
  var musicMode = 'order'
  try {
    var mm = localStorage.getItem(MODE_KEY)
    if (mm === 'repeat' || mm === 'random') musicMode = mm
  } catch (e) {}
  var musicFrom = ''

  /* ---- IndexedDB：导入的音乐持久化（退出游戏不用重新导入） ---- */
  var DB_NAME = 'mow-db'
  var DB_STORE = 'tracks'
  var idb = null
  function idbOpen() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = function () {
          req.result.createObjectStore(DB_STORE, { keyPath: 'id' })
        }
        req.onsuccess = function () { idb = req.result; resolve(idb) }
        req.onerror = function () { resolve(null) }
      } catch (e) { resolve(null) }
    })
  }
  function idbPut(t) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(false)
      try {
        var tx = idb.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).put(t)
        tx.oncomplete = function () { resolve(true) }
        tx.onerror = function () { resolve(false) }
      } catch (e) { resolve(false) }
    })
  }
  function idbDel(id) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(false)
      try {
        var tx = idb.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).delete(id)
        tx.oncomplete = function () { resolve(true) }
        tx.onerror = function () { resolve(false) }
      } catch (e) { resolve(false) }
    })
  }
  function idbAll() {
    return new Promise(function (resolve) {
      if (!idb) return resolve([])
      try {
        var tx = idb.transaction(DB_STORE, 'readonly')
        var req = tx.objectStore(DB_STORE).getAll()
        req.onsuccess = function () { resolve(req.result || []) }
        req.onerror = function () { resolve([]) }
      } catch (e) { resolve([]) }
    })
  }

  function syncMusicBtn() {
    var t = musicTrackName || (settings.music ? '已开启' : '已关闭')
    el.swMusic.setAttribute('aria-label', '音乐：' + t)
  }

  function stopMusic() {
    if (musicEl) {
      try {
        if (musicEl.__timer) clearInterval(musicEl.__timer)
        if (musicEl.__toneStop) musicEl.__toneStop()
        if (musicEl.pause) musicEl.pause()
        if (musicEl.src !== undefined) musicEl.src = ''
      } catch (e) {}
      musicEl = null
    }
    musicTrackId = ''
    musicTrackName = ''
  }

  function playTrack(idx) {
    var t = tracks[idx]
    if (!t) return
    if (musicTrackId === t.id && musicEl) {
      // 已在播：切为静音/恢复
      settings.music = !settings.music
      saveAll()
      if (settings.music) {
        if (musicEl.__toneStart) musicEl.__toneStart()
        else musicEl.play().catch(function () {})
      } else {
        if (musicEl.__toneStop) musicEl.__toneStop()
        else musicEl.pause()
      }
      syncMusicBtn()
      renderPlaylist()
      toast(settings.music ? '音乐已恢复' : '音乐已静音')
      return
    }
    stopMusic()
    currentIdx = idx
    musicTrackId = t.id
    musicTrackName = t.name
    if (t.builtin === 'synth') {
      musicEl = playBuiltin(settings.music)
    } else {
      try {
        musicEl = new Audio(t.url)
        // 单曲循环交给 Audio.loop；顺序/随机靠 ended 事件自动切
        musicEl.loop = (musicMode === 'repeat')
        musicEl.volume = 0.55
        musicEl.addEventListener('ended', function () {
          if (musicMode === 'random') nextTrack()
          else if (musicMode === 'order' && currentIdx < tracks.length - 1) nextTrack()
        })
        if (settings.music) musicEl.play().catch(function () { toast('播放失败，请检查文件') })
      } catch (e) { musicEl = null }
    }
    syncMusicBtn()
    renderPlaylist()
  }

  function prevTrack() {
    if (tracks.length <= 1) return
    settings.music = true
    playTrack((currentIdx - 1 + tracks.length) % tracks.length)
  }

  function nextTrack() {
    if (tracks.length <= 1) return
    var i
    if (musicMode === 'random' && tracks.length > 1) {
      do { i = Math.floor(Math.random() * tracks.length) } while (i === currentIdx)
    } else {
      i = (currentIdx + 1) % tracks.length
    }
    settings.music = true
    playTrack(i)
  }

  /* ---------------- 首页背景视频：随机播，播完随机换下一首 ---------------- */
  var BG_LIST = ['bg/1.mp4', 'bg/2.mp4', 'bg/3.mp4', 'bg/4.mp4', 'bg/5.mp4', 'bg/6.mp4', 'bg/7.mp4', 'bg/8.mp4']
  var BG_FIT = {}  // 竖屏素材会由 loadedmetadata 自动判 contain；后续素材统一横屏
  var lastBg = -1
  var bgOn = false

  function pickBg() {
    if (!el.bgVideo) return
    var n = BG_LIST.length
    var i = Math.floor(Math.random() * n)
    if (n > 1) { var guard = 0; while (i === lastBg && guard++ < 8) i = Math.floor(Math.random() * n) }
    lastBg = i
    var v = el.bgVideo
    v.src = BG_LIST[i]
    // 竖屏素材（高>宽）完整显示；其余铺满裁切
    var fit = function () {
      var want = BG_FIT[BG_LIST[i]] || (v.videoHeight > v.videoWidth * 1.1 ? 'contain' : 'cover')
      v.style.objectFit = want
    }
    v.addEventListener('loadedmetadata', fit, { once: true })
    // 要求有声音：先按有声播，无手势时浏览器会拒绝，退回静音保证画面
    v.muted = false
    var pr = v.play()
    if (pr && pr.catch) pr.catch(function () {
      v.muted = true
      var p2 = v.play()
      if (p2 && p2.catch) p2.catch(function () {})
    })
  }

  function setBgOn(on) {
    if (bgOn === on || !el.bgVideo) return
    bgOn = on
    if (on) {
      // 清掉上一局留在 canvas 上的画面，让视频露出来
      try { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height) } catch (e) {}
      el.bgVideo.style.display = 'block'
      pickBg()
    } else {
      el.bgVideo.pause()
      el.bgVideo.removeAttribute('src')
      el.bgVideo.load()
      el.bgVideo.style.display = 'none'
    }
  }

  el.bgVideo.addEventListener('ended', function () {
    if (bgOn) pickBg()
  })

  /* ---- 默认 BGM：随机播放列表里的一首（autoplay 被拦时等用户第一次触摸再启动） ---- */
  var autoMusicTried = false

  function startRandomMusic() {
    if (!settings.music || musicEl) return
    if (tracks.length > 0) playTrack(Math.floor(Math.random() * tracks.length))
  }

  // 返回游戏：接着播刚才那首（内置合成曲重新起，文件曲保留播放进度）
  function resumeMusic() {
    if (!settings.music) return
    if (musicEl) {
      if (musicEl.__toneStart) { musicEl.__toneStart(); return }
      if (!musicEl.ended) { musicEl.play().catch(function () {}); return }
    }
    musicEl = null
    musicTrackId = ''
    musicTrackName = ''
    startRandomMusic()
  }

  // 回到首页：暂停内置音乐（不销毁，回游戏可继续）
  function pauseMenuMusic() {
    if (musicEl) {
      try {
        if (musicEl.__toneStop) musicEl.__toneStop()
        else musicEl.pause()
      } catch (e) {}
    }
  }

  function tryAutoMusic() {
    // 只在战斗里自动启动 BGM；首页不播（首页只放背景视频）
    if (autoMusicTried || musicEl || !settings.music || phase !== 'playing') return
    autoMusicTried = true
    startRandomMusic()
  }

  document.addEventListener('pointerdown', tryAutoMusic, { passive: true })
  document.addEventListener('keydown', tryAutoMusic)

  /* ---- 内置 BGM：用 WebAudio 合成的循环旋律（无人声，低存在感） ---- */
  function playBuiltin(enabled) {
    var fake = { __toneStart: null, __toneStop: null }
    try {
      var ac2 = audio()
      if (!ac2) return fake
      var master = ac2.createGain()
      master.gain.value = enabled ? 0.14 : 0.0001
      master.connect(ac2.destination)
      // A 小调五声音阶循环 + 低音脉冲
      var scale = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]
      var bass = [110.0, 110.0, 146.83, 146.83, 164.81, 164.81]
      var step = 0
      var lookAhead = ac2.currentTime
      var timer = setInterval(function () {
        if (!ac2 || ac2.state === 'closed') { clearInterval(timer); return }
        var now = ac2.currentTime
        while (lookAhead < now + 0.4) {
          var t0 = lookAhead
          var freq = scale[step % scale.length]
          var bf = bass[Math.floor(step / 2) % bass.length]
          tone(ac2, master, freq, t0, 0.34, 0.07, 'triangle')
          if (step % 4 === 0) tone(ac2, master, bf, t0, 0.72, 0.16, 'sine')
          lookAhead += 0.36
          step++
        }
      }, 200)
      var nodes = { master: master, timer: timer }
      fake.__toneStart = function () { if (nodes.master && nodes.master.gain) nodes.master.gain.setTargetAtTime(0.14, ac2.currentTime, 0.2) }
      fake.__toneStop = function () { if (nodes.master && nodes.master.gain) nodes.master.gain.setTargetAtTime(0.0001, ac2.currentTime, 0.2) }
      fake.__timer = timer
    } catch (e) {}
    return fake
  }
  function tone(ac2, dest, freq, t0, dur, gain, type) {
    var osc = ac2.createOscillator()
    var g = ac2.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(dest)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  /* ---- 播放列表 UI ---- */
  function renderPlaylist() {
    if (!el.playlist) return
    var html = ''
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i]
      var playing = musicTrackId === t.id
      html += '<button class="track' + (playing ? ' playing' : '') + '" data-i="' + i + '">'
        + '<span class="ico">' + (t.builtin === 'synth' ? '🌌' : '🎵') + '</span>'
        + '<span class="mid"><span class="nm3">' + esc(t.name) + '</span>'
        + '<span class="tag">' + (t.builtin ? '内置' : '已保存 · 下次还在') + (playing ? (settings.music ? ' · 播放中' : ' · 已暂停') : '')
        + '</span></span>'
        + (t.builtin ? '' : '<span class="del" data-del="' + i + '" role="button" aria-label="删除">×</span>')
        + '</button>'
    }
    el.playlist.innerHTML = html
    var rows = el.playlist.querySelectorAll('.track')
    for (var r = 0; r < rows.length; r++) {
      rows[r].addEventListener('click', function (ev) {
        var del = ev.target.getAttribute && ev.target.getAttribute('data-del')
        if (del != null) { ev.stopPropagation(); removeTrack(+del); return }
        playTrack(+this.getAttribute('data-i'))
        sfx.click()
      })
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
    })
  }

  function removeTrack(i) {
    var t = tracks[i]
    if (!t || t.builtin) return
    if (musicTrackId === t.id) stopMusic()
    if (t.objUrl) { try { URL.revokeObjectURL(t.url) } catch (e) {} }
    tracks.splice(i, 1)
    idbDel(t.id)
    saveAll()
    renderPlaylist()
    syncMusicBtn()
    sfx.click()
    toast('已删除：' + (t.name.length > 10 ? t.name.slice(0, 9) + '…' : t.name))
  }

  function importMusicFile(file) {
    if (!file) return
    var url = URL.createObjectURL(file)
    var name = file.name.replace(/\.[^.]+$/, '')
    var t = {
      id: 'f' + Date.now() + Math.floor(Math.random() * 1000),
      ts: Date.now(),
      name: name,
      url: url,            // 本次会话播放用（对象 URL 重启后失效，所以要单独存一份到 IDB）
      objUrl: true,
      builtin: false,
      size: file.size,
      type: file.type,
    }
    // 持久化：把音频字节读出来存进 IndexedDB（下次进游戏还在）
    var reader = new FileReader()
    reader.onload = function () {
      // 存进 IDB 的记录只留可序列化字段，不要带对象 URL
      var rec = { id: t.id, ts: t.ts, name: t.name, type: t.type, size: t.size, builtin: false, data: reader.result }
      idbPut(rec).then(function (ok) {
        t.saved = !!ok
        tracks.push(t)
        saveAll()
        playTrack(tracks.length - 1)
        renderPlaylist()
        sfx.click()
        toast(t.saved ? '已导入并保存：' + (name.length > 10 ? name.slice(0, 9) + '…' : name)
                      : '已导入（本次有效）：' + name)
      })
    }
    reader.onerror = function () {
      tracks.push(t)
      playTrack(tracks.length - 1)
      renderPlaylist()
      toast('已导入（本次有效）：' + name)
    }
    reader.readAsArrayBuffer(file)
  }

  el.musicFile.addEventListener('change', function () {
    var f = el.musicFile.files && el.musicFile.files[0]
    if (!f) return
    importMusicFile(f)
    el.musicFile.value = ''
  })

  el.musicAddBtn.addEventListener('click', function () {
    sfx.click()
    el.musicFile.click()
  })

  /* 从音乐/设置/商店等弹层返回时的统一落点 */
  function backFromOverlay() {
    if (pausedByUser) {
      phase = 'paused'
      show(el.pauseScreen, true)
    } else {
      phase = 'menu'
      show(el.startScreen, true)
      refreshBestLabels()
    }
  }

  /* 启动时：从 IndexedDB 恢复已导入的曲目 */
  function restoreTracks() {
    idbOpen().then(function () {
      return idbAll()
    }).then(function (list) {
      list.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0) })
      for (var i = 0; i < list.length; i++) {
        var t = list[i]
        if (!t || !t.data) continue
        try {
          var blob = new Blob([t.data], { type: t.type || 'audio/mpeg' })
          t.url = URL.createObjectURL(blob)
          t.objUrl = true
          delete t.data
          tracks.push(t)
        } catch (e) {}
      }
      renderPlaylist()
    })
  }

  /* ---------------- 工具 ---------------- */
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0))
    var m = Math.floor(sec / 60)
    var s = sec % 60
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
  }

  var toastTimer = 0
  function toast(text) {
    el.toast.textContent = text
    el.toast.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.toast.classList.remove('on') }, 1400)
  }

  function show(node, on) {
    if (on) node.classList.add('on')
    else node.classList.remove('on')
  }

  /* 所有全屏弹层共用一个 z-index，后写的 DOM 会盖在前面。
     从首页/结算页打开商店、音乐、设置时，必须把首页与结算页一起藏掉，
     否则它们（DOM 顺序更靠后）会盖在新弹层之上，看起来像「打不开」。 */
  function hideMenuOverlays() {
    show(el.startScreen, false)
    show(el.overScreen, false)
    show(el.pauseScreen, false)
    show(el.settingsScreen, false)
    show(el.shopScreen, false)
    show(el.gShopScreen, false)
    show(el.diffScreen, false)
    show(el.musicCard, false)
    show(el.jobScreen, false)
    show(el.cheatScreen, false)
    show(el.noticeScreen, false)
    show(el.noticeHistoryScreen, false)
    show(el.cloudNoticeHistoryScreen, false)
    show(el.updateScreen, false)
    show(el.aboutScreen, false)
  }

  function refreshBestLabels() {
    el.bestTime.textContent = best.time > 0 ? fmt(best.time) : '--:--'
    el.bestKills.textContent = String(best.kills || 0)
  }

  function showTopRight(on) {
    el.topRight.style.display = on ? 'flex' : 'none'
  }

  /* ---------------- 存档：退出后保留进度，首页可「继续游戏」 ---------------- */
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY) } catch (e) { return false }
  }

  function saveGame() {
    if (!state || state.over) return
    if (phase === 'menu') return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(Sim.serialize(state)))
    } catch (e) {}
    refreshContinueBtn()
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY) } catch (e) {}
    refreshContinueBtn()
  }

  function refreshContinueBtn() {
    el.continueBtn.style.display = hasSave() ? 'inline-block' : 'none'
  }

  function continueGame() {
    var data = null
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch (e) {}
    if (!data) { newGame(); return }
    try {
      state = Sim.restore(data, { seed: (Date.now() & 0xffffffff) })
    } catch (e) { clearSave(); newGame(); return }
    state.view.w = window.innerWidth
    state.view.h = window.innerHeight
    state.paused = false
    pausedByUser = false
    input.x = input.y = 0
    pointerId = null
    acc = 0
    weaponSig = ''
    el.pauseBtn.textContent = '❚❚'
    phase = 'playing'
    show(el.startScreen, false)
    show(el.overScreen, false)
    show(el.levelScreen, false)
    show(el.pauseScreen, false)
    show(el.settingsScreen, false)
    show(el.shopScreen, false)
    show(el.gShopScreen, false)
    show(el.musicCard, false)
    show(el.jobScreen, false)
    el.hud.style.display = 'block'
    el.weaponRow.style.display = ''
    showTopRight(true)
    setBgOn(false)
    if (settings.music) resumeMusic()
    syncAttackBtn()
    updateHud(true)
    if (settings.joy === 'fixed') placeFixedJoystick(true)
    sfx.click()
    toast('已从存档继续 · 第 ' + state.wave + ' 波')
  }

  // 首页金币只由游戏结算产生：击杀怪物 + 存活时间 + 玩家等级 三项综合
  function settleReward() {
    if (coinBanked || !state) return 0
    coinBanked = true
    var k = state.stats.kills || 0
    var t = state.time || 0
    var lv = Math.max(1, state.player.level || 1)
    var rw = 5 + Math.floor(k * 1.5) + Math.floor(t * 0.6) + lv * 20
    wallet += rw
    saveAll()
    sfx.coin()
    return rw
  }

  function newGame(diff) {
    clearSave()
    lastDiff = (diff && Sim.DIFFS[diff]) ? diff : lastDiff
    try { localStorage.setItem(DIFF_KEY, JSON.stringify(lastDiff)) } catch (e) {}
    state = Sim.create({ seed: (Date.now() & 0xffffffff), view: viewSize(), upgrades: upgrades, autoFire: settings.auto !== false, diff: lastDiff, job: currentJob })
    // 会话级作弊：本回合输入过的作弊码对新开的游戏继续生效
    if (sessionCheat.atk) state.cheatAtk = 1.1
    if (sessionCheat.mon) Sim.applyCheat(state, '这些怪怎么这么垃圾？')
    pausedByUser = false
    input.x = input.y = 0
    pointerId = null
    acc = 0
    weaponSig = ''
    coinBanked = false
    el.pauseBtn.textContent = '❚❚'
    phase = 'playing'
    show(el.startScreen, false)
    show(el.overScreen, false)
    show(el.levelScreen, false)
    show(el.pauseScreen, false)
    show(el.settingsScreen, false)
    show(el.shopScreen, false)
    showTopRight(true)
    show(el.gShopScreen, false)
    show(el.musicCard, false)
    show(el.diffScreen, false)
    show(el.jobScreen, false)
    el.hud.style.display = 'block'
    el.weaponRow.style.display = ''
    setBgOn(false)
    if (settings.music) resumeMusic()
    syncAttackBtn()
    updateHud(true)
  }

  function toMenu() {
    // 中途退出：保存当前进度（首页可「继续游戏」），不结算金币
    saveGame()
    state = Sim.create({ seed: 1, view: viewSize(), upgrades: upgrades, autoFire: settings.auto !== false })
    state.paused = true
    phase = 'menu'
    pausedByUser = false
    el.hud.style.display = 'none'
    el.weaponRow.style.display = 'none'
    el.joystick.classList.remove('on')
    el.joystick.style.display = 'none'
    show(el.overScreen, false)
    show(el.levelScreen, false)
    show(el.pauseScreen, false)
    show(el.settingsScreen, false)
    show(el.shopScreen, false)
    show(el.gShopScreen, false)
    show(el.musicCard, false)
    show(el.diffScreen, false)
    show(el.startScreen, true)
    showTopRight(false)
    setBgOn(true)
    pauseMenuMusic()
    syncAttackBtn()
    refreshBestLabels()
    updateHud(true)
  }

  function gameOver() {
    phase = 'over'
    pausedByUser = false
    el.hud.style.display = 'none'
    el.weaponRow.style.display = 'none'
    el.joystick.classList.remove('on')
    el.joystick.style.display = 'none'
    clearSave() // 存档的局已死，不再保留
    var rw = settleReward()
    var t = state.time
    var k = state.stats.kills
    var isNew = t > best.time
    if (isNew) best.time = t
    if (k > best.kills) best.kills = k
    saveAll()
    el.resTime.textContent = fmt(t)
    el.resKills.textContent = String(k)
    el.resLevel.textContent = String(state.player.level)
    el.resCoins.textContent = '◈ ' + rw
    el.newBest.style.display = isNew ? 'block' : 'none'
    show(el.levelScreen, false)
    show(el.pauseScreen, false)
    show(el.gShopScreen, false)
    if (settings.music) pauseMenuMusic()  // 结算面暂停音乐，再来一局时恢复
    show(el.musicCard, false)
    show(el.overScreen, true)
    setBgOn(true)
    showTopRight(false)
    sfx.over()
  }

  function togglePause() {
    if (phase !== 'playing') return
    pausedByUser = !pausedByUser
    state.paused = pausedByUser
    el.pauseBtn.textContent = pausedByUser ? '▶' : '❚❚'
    if (pausedByUser) {
      phase = 'paused'
      show(el.pauseScreen, true)
    } else {
      show(el.pauseScreen, false)
      phase = 'playing'
      syncAttackBtn()
    }
    sfx.click()
  }

  function resumeGame() {
    if (phase !== 'paused' && phase !== 'settings' && phase !== 'shop') return
    show(el.pauseScreen, false)
    show(el.settingsScreen, false)
    show(el.shopScreen, false)
    pausedByUser = false
    state.paused = false
    el.pauseBtn.textContent = '❚❚'
    phase = 'playing'
    updateHud(true)
    syncAttackBtn()
    sfx.click()
  }

  /* ---------------- HUD ---------------- */
  function updateHud(force) {
    if (!state) return
    var p = state.player
    el.timer.textContent = fmt(state.time)
    el.kills.textContent = String(state.stats.kills)
    el.coins.textContent = String(state.coins || 0)
    el.waveTop.textContent = String(state.wave || 0)
    el.enemyLeft.textContent = String((state.spawnQueue ? state.spawnQueue.length : 0) + (state.enemies ? state.enemies.length : 0))
    var hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp))
    el.hpFill.style.width = (hpPct * 100).toFixed(1) + '%'
    el.hpText.textContent = Math.max(0, Math.round(p.hp)) + '/' + Math.round(p.maxHp)
    var xpPct = Math.max(0, Math.min(1, p.xp / p.xpNeed))
    el.xpFill.style.width = (xpPct * 100).toFixed(1) + '%'
    el.xpText.textContent = 'Lv.' + p.level + ' ' + Math.floor(p.xp) + '/' + p.xpNeed

    var sig = state.weaponOrder.join(',')
    if (force || sig !== weaponSig) {
      weaponSig = sig
      var html = ''
      var list = Sim.weaponSummary(state)
      for (var i = 0; i < list.length; i++) {
        html += '<span class="wchip">' + list[i].name + ' <b>' + list[i].level + '</b></span>'
      }
      el.weaponRow.innerHTML = html
    }
  }

  /* ---------------- 升级弹层 ---------------- */
  function showLevelUp() {
    phase = 'levelup'
    state.paused = true
    var choices = Sim.getChoices(state)
    // 卡组确定后再存档：大退 / 误退出重进会保留同一组待选卡片
    saveGame()
    el.lvlTitle.textContent = '升 级 · Lv.' + state.player.level
    el.cards.innerHTML = ''
    choices.forEach(function (c) {
      var b = document.createElement('button')
      b.className = 'card'
      b.innerHTML =
        '<div class="top">' +
        '<span class="nm">' + c.title + '</span>' +
        '<span class="badge' + (c.kind === 'weapon_new' ? ' new' : '') + '">' + (c.kind === 'weapon_new' ? '新武器' : 'Lv.' + c.level) + '</span>' +
        (c.max > 0 ? '' : '<span class="inf">∞</span>') +
        '</div>' +
        '<div class="ds">' + c.desc + '</div>'
      b.addEventListener('click', function () {
        Sim.applyUpgrade(state, c.id)
        sfx.click()
        if (state.pending > 0) {
          showLevelUp()
        } else {
          show(el.levelScreen, false)
          state.paused = pausedByUser
          phase = pausedByUser ? 'paused' : 'playing'
          updateHud(true)
        }
      })
      el.cards.appendChild(b)
    })
    show(el.levelScreen, true)
    sfx.level()
  }

  /* ---------------- 商店 ---------------- */
  function shopCost(key) {
    var it = Sim.SHOP[key]
    var lv = upgrades[key] | 0
    // 贪婪契约：首页商店全部商品（含自身）折扣 -8%/级
    return Math.max(1, Math.round(it.cost(lv) * (1 - 0.08 * (upgrades.greed || 0))))
  }

  function shopItemHtml(key) {
    var it = Sim.SHOP[key]
    var lv = upgrades[key] | 0
    var maxed = lv >= it.max
    var cost = shopCost(key)
    var cant = !maxed && wallet < cost
    var cls = 'shopItem' + (maxed ? ' maxed' : cant ? ' cant' : '')
    var costHtml = maxed
      ? '<span class="cost">已满级</span>'
      : ('<span class="cost' + (cant ? ' small' : '') + '">◈ ' + cost + (cant ? ' 不足' : '') + '</span>')
    return (
      '<button class="' + cls + '" data-k="' + key + '">' +
      '<span class="ico">' + it.icon + '</span>' +
      '<span class="mid"><span class="nm2">' + it.name + '<small>Lv.' + lv + '</small></span>' +
      '<span class="ds2">' + it.desc + '</span></span>' +
      costHtml + '</button>'
    )
  }

  function renderShop() {
    el.coinBal.textContent = String(wallet)
    var html = ''
    var order = ['armor', 'swift', 'sharp', 'luck', 'revive', 'vigor', 'greed', 'lowhp']
    for (var i = 0; i < order.length; i++) html += shopItemHtml(order[i])
    el.shopList.innerHTML = html
    var btns = el.shopList.querySelectorAll('.shopItem')
    for (var j = 0; j < btns.length; j++) {
      ;(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-k')
          var it = Sim.SHOP[key]
          var lv = upgrades[key] | 0
          if (lv >= it.max) { toast('已满级'); return }
          var cost = shopCost(key)
          if (wallet < cost) { toast('金币不足'); sfx.click(); return }
          wallet -= cost
          upgrades[key] = lv + 1
          saveAll()
          sfx.coin()
          renderShop()
          toast(it.name + ' → Lv.' + upgrades[key])
        })
      })(btns[j])
    }
  }

  function openShop() {
    // 商店只在首页打开（开始页 / 结算页）
    hideMenuOverlays()
    phase = 'shop'
    renderShop()
    show(el.shopScreen, true)
    sfx.click()
  }

  function closeShop() {
    show(el.shopScreen, false)
    show(el.jobScreen, false)
    phase = 'menu'
    show(el.startScreen, true)
    refreshBestLabels()
    sfx.click()
  }

  /* ---------------- 战斗商店（每 5 波一次，花本局金币） ---------------- */
  function renderGShop() {
    // 战斗商店：单行商品（图标 + 名字 + 一行效果，右侧价格），一眼看清
    el.gCoinBal.textContent = String(state ? state.coins : 0)
    var html = ''
    var order = Sim.GSHOP_ORDER
    for (var i = 0; i < order.length; i++) {
      var k = order[i]
      var it = Sim.GSHOP[k]
      var cost = Sim.gCost(state, k)
      var cant = state.coins < cost
      var lv = (state.gshop && state.gshop[k]) || 0
      var lvTag = lv > 0 ? '<small>Lv.' + lv + '</small>' : ''
      html +=
        '<button class="shopItem' + (cant ? ' cant' : '') + '" data-k="' + k + '">' +
        '<span class="ico">' + it.icon + '</span>' +
        '<span class="mid"><span class="nm2">' + it.name + lvTag + '</span>' +
        '<span class="ds2">' + it.line(lv) + '</span></span>' +
        '<span class="cost' + (cant ? ' small' : '') + '">◈ ' + cost + (cant ? ' · 不足' : '') + '</span>' +
        '</button>'
    }
    el.gShopList.innerHTML = html
    var btns = el.gShopList.querySelectorAll('.shopItem')
    for (var j = 0; j < btns.length; j++) {
      ;(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-k')
          var r = Sim.buyG(state, key)
          if (!r.ok) { toast('金币不足'); sfx.click(); return }
          sfx.coin()
          renderGShop()
          toast(Sim.GSHOP[key].name + ' · 已购买')
        })
      })(btns[j])
    }
  }

  function openGShop() {
    phase = 'gshop'
    state.paused = true
    renderGShop()
    show(el.gShopScreen, true)
    sfx.click()
  }

  function closeGShop() {
    show(el.gShopScreen, false)
    show(el.musicCard, false)
    pausedByUser = false
    state.paused = false
    el.pauseBtn.textContent = '❚❚'
    phase = 'playing'
    updateHud(true)
    syncAttackBtn()
    sfx.click()
  }

  /* ---------------- 难度选择（新游戏时出现；重新开始沿用上次） ---------------- */
  var DIFF_DESC = {
    easy:   '怪物更弱更少 · 经验 +20% · 每级成长 +3%',
    normal: '标准挑战 · 每级成长 +5%',
    hard:   '血量+15% · 免伤10% · 伤害+10% · 经验+15% · 每级成长 +7%',
    hell:   '血量+30% · 免伤20% · 伤害+20% · 移速+10% · 经验+40% · 每级成长 +9%',
    night:  '血量+40% · 免伤30% · 伤害+30% · 移速+20% · 经验+50% · 每级成长 +11%',
    god:    '血量+50% · 免伤30% · 伤害+40% · 移速+40% · 每波再+0.5% · 经验+80% · 每级成长 +14% · BOSS 无上限',
  }
  function renderDiff() {
    var html = ''
    var order = Sim.DIFF_ORDER
    for (var i = 0; i < order.length; i++) {
      var id = order[i]
      var d = Sim.DIFFS[id]
      var tag = id === lastDiff ? '<span class="tag">上次</span>' : ''
      html += '<button class="diffBtn d-' + id + '" data-d="' + id + '">' +
        '<span>' + d.name + tag + '<br><span class="dd">' + (DIFF_DESC[id] || '') + '</span></span>' +
        '<span>›</span></button>'
    }
    el.diffList.innerHTML = html
    var btns = el.diffList.querySelectorAll('.diffBtn')
    for (var j = 0; j < btns.length; j++) {
      ;(function (btn) {
        btn.addEventListener('click', function () {
          sfx.click()
          newGame(btn.getAttribute('data-d'))
        })
      })(btns[j])
    }
  }

  function openDiff() {
    phase = 'diff'
    hideMenuOverlays()
    renderDiff()
    show(el.diffScreen, true)
  }

  function closeDiff() {
    show(el.diffScreen, false)
    show(el.startScreen, true)
    phase = 'menu'
  }

  /* ---------------- 职业选择（首页入口；闯关成就 / 金币购买解锁） ---------------- */
  function jobUnlockText(u) {
    if (u.wave) return '闯关解锁 · 到达第 ' + u.wave + ' 波'
    if (u.kills) return '闯关解锁 · 累计 ' + u.kills + ' 击杀'
    if (u.cost) return null
    return ''
  }

  function refreshCurJob() {
    var j = Sim.CLASSES[currentJob] || Sim.CLASSES.ranger
    el.curJob.textContent = j.name + ' · ' + j.desc
  }

  function renderJobs() {
    var html = ''
    var order = Sim.CLASS_ORDER
    for (var i = 0; i < order.length; i++) {
      var id = order[i]
      var j = Sim.CLASSES[id]
      var mine = id === currentJob
      var open = unlocked.indexOf(id) >= 0
      var tag = ''
      var cls = 'jobCard'
      if (mine) { cls += ' on'; tag = '<span class="jtag">已选择</span>' }
      else if (open) { tag = '<span class="jtag">可切换</span>' }
      else if (j.unlock.cost) {
        cls += ' cant'
        tag = '<span class="jtag price">购买 ◈ ' + j.unlock.cost + '</span>'
      } else {
        cls += ' cant'
        var t2 = jobUnlockText(j.unlock)
        tag = '<span class="jtag lock">' + t2 + '</span>'
      }
      html += '<button class="' + cls + '" data-j="' + id + '">' +
        '<span class="jname">' + j.name + tag + '</span>' +
        '<span class="jdesc">' + j.desc + '</span>' +
        '</button>'
    }
    el.jobList.innerHTML = html
    var btns = el.jobList.querySelectorAll('.jobCard')
    for (var k = 0; k < btns.length; k++) {
      ;(function (btn) {
        btn.addEventListener('click', function () { onJobCard(btn.getAttribute('data-j')) })
      })(btns[k])
    }
  }

  function onJobCard(id) {
    var j = Sim.CLASSES[id]
    if (!j) return
    if (unlocked.indexOf(id) >= 0) {
      if (id === currentJob) return
      currentJob = id
      saveAll()
      sfx.level()
      toast('已选择职业：' + j.name)
      renderJobs()
      refreshCurJob()
      return
    }
    // 未解锁：金币购买类职业可直接在此买
    var cost = j.unlock.cost || 0
    if (cost > 0) {
      if (wallet >= cost) {
        wallet -= cost
        unlocked.push(id)
        currentJob = id
        saveAll()
        sfx.coin()
        toast('已购买并选择：' + j.name)
        renderJobs()
        refreshCurJob()
      } else {
        sfx.click()
        toast('金币不足 · 还差 ◈ ' + (cost - wallet))
      }
      return
    }
    sfx.click()
    toast(jobUnlockText(j.unlock) + ' 后自动解锁')
  }

  function openJobs() {
    hideMenuOverlays()
    phase = 'jobs'
    renderJobs()
    show(el.jobScreen, true)
    sfx.click()
  }

  function closeJobs() {
    show(el.jobScreen, false)
    phase = 'menu'
    show(el.startScreen, true)
    sfx.click()
  }

  // 战斗中达成闯关条件 → 自动解锁职业
  var unlockChecked = ''
  function checkJobUnlock() {
    if (!state || state.over || phase !== 'playing') return
    var sig = state.wave + ':' + state.stats.kills
    if (sig === unlockChecked) return
    unlockChecked = sig
    var order = Sim.CLASS_ORDER
    for (var i = 0; i < order.length; i++) {
      var id = order[i]
      if (unlocked.indexOf(id) >= 0) continue
      var u = Sim.CLASSES[id].unlock
      var ok = false
      if (u.wave && state.wave >= u.wave) ok = true
      if (u.kills && state.stats.kills >= u.kills) ok = true
      if (ok) {
        unlocked.push(id)
        saveAll()
        sfx.level()
        toast('新职业解锁：' + Sim.CLASSES[id].name)
      }
    }
  }

  /* ---------------- 音乐播放卡片（独立 UI） ---------------- */
  var MODE_ICON = { order: '☰', repeat: '🔁', random: '🔀' }
  var MODE_NAME = { order: '顺序播放', repeat: '单曲循环', random: '随机播放' }

  function syncModeBtns() {
    var btns = el.segMode.querySelectorAll('button')
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-m') === musicMode)
    }
    el.modeTrackBtn.textContent = MODE_ICON[musicMode] || '☰'
    el.modeTrackBtn.setAttribute('aria-label', MODE_NAME[musicMode] || '播放模式')
  }

  function syncMusicCard() {
    el.nowPlaying.textContent = musicTrackName
      ? ('正在播放：' + musicTrackName + (settings.music ? '' : '（已静音）'))
      : '未在播放'
    syncModeBtns()
  }

  function setMusicMode(m) {
    musicMode = m
    try { localStorage.setItem(MODE_KEY, m) } catch (e) {}
    if (musicEl && musicEl.loop !== undefined) {
      try { musicEl.loop = (m === 'repeat') } catch (e2) {}
    }
    syncModeBtns()
    sfx.click()
    toast(MODE_NAME[m] || m)
  }

  function openMusicCard(from) {
    if (phase === 'playing') {
      pausedByUser = true
      state.paused = true
      el.pauseBtn.textContent = '▶'
    }
    musicFrom = from || ''
    hideMenuOverlays()
    phase = 'music'
    syncMusicCard()
    renderPlaylist()
    show(el.musicCard, true)
    sfx.click()
  }

  function closeMusicCard() {
    show(el.musicCard, false)
    if (musicFrom === 'settings') {
      phase = pausedByUser ? 'paused' : 'menu'
      openSettings()
    } else if (pausedByUser) {
      phase = 'paused'
      show(el.pauseScreen, true)
    } else {
      phase = 'menu'
      show(el.startScreen, true)
    }
    sfx.click()
  }

  /* ---------------- 设置 ---------------- */
  function syncSettings() {
    el.swSfx.classList.toggle('on', settings.sfx)
    el.swMusic.classList.toggle('on', settings.music)
    el.swAuto.classList.toggle('on', settings.auto)
    var btns = el.segJoy.querySelectorAll('button')
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-v') === settings.joy)
    }
    syncSoundBtn()
    syncMusicBtn()
  }

  // 攻击键只在「关闭自动打怪」且在战斗中显示
  function syncAttackBtn() {
    var on = !settings.auto && phase === 'playing'
    el.attackBtn.classList.toggle('on', on)
  }

  function openSettings() {
    if (phase === 'playing') {
      pausedByUser = true
      state.paused = true
      el.pauseBtn.textContent = '▶'
    }
    hideMenuOverlays()
    phase = 'settings'
    syncSettings()
    show(el.settingsScreen, true)
    sfx.click()
  }

  function closeSettings() {
    show(el.settingsScreen, false)
    if (pausedByUser) {
      phase = 'paused'
      show(el.pauseScreen, true)
    } else {
      phase = 'menu'
      show(el.startScreen, true)
    }
    sfx.click()
  }

  el.swSfx.addEventListener('click', function () {
    settings.sfx = !settings.sfx
    saveAll()
    syncSettings()
    if (settings.sfx) sfx.click()
  })

  el.swMusic.addEventListener('click', function () {
    settings.music = !settings.music
    saveAll()
    syncSettings()
    if (musicEl) {
      if (musicEl.__toneStart && musicEl.__toneStop) {
        if (settings.music) musicEl.__toneStart()
        else musicEl.__toneStop()
      } else {
        if (settings.music) musicEl.play().catch(function () {})
        else musicEl.pause()
      }
    } else if (settings.music && phase === 'playing') {
      // 没有正在播放的曲目时，随机放一首（首页不启动）
      startRandomMusic()
    }
    renderPlaylist()
  })

  el.swAuto.addEventListener('click', function () {
    settings.auto = !settings.auto
    saveAll()
    syncSettings()
    syncAttackBtn()
    if (state) state.autoFire = settings.auto
    input.fire = false
    el.attackBtn.classList.remove('hold')
    sfx.click()
    toast(settings.auto ? '已开启自动打怪' : '已关闭自动打怪 · 按住攻击键锁定最近敌人，其余技能自动开火')
  })

  var segBtns = el.segJoy.querySelectorAll('button')
  for (var si = 0; si < segBtns.length; si++) {
    ;(function (btn) {
      btn.addEventListener('click', function () {
        settings.joy = btn.getAttribute('data-v')
        saveAll()
        syncSettings()
        sfx.click()
        if (settings.joy === 'fixed' && phase === 'playing') placeFixedJoystick(true)
        else hideFixedJoystick()
      })
    })(segBtns[si])
  }

  /* ---------------- 摇杆（浮动 / 固定） ---------------- */
  var pointerId = null
  var origin = { x: 0, y: 0 }
  var FIXED = { x: 0, y: 0 }

  function placeFixedJoystick(showNow) {
    FIXED.x = Math.max(90, window.innerWidth * 0.17)
    FIXED.y = window.innerHeight - Math.max(90, window.innerHeight * 0.14)
    origin.x = FIXED.x
    origin.y = FIXED.y
    el.joystick.style.left = FIXED.x + 'px'
    el.joystick.style.top = FIXED.y + 'px'
    el.joystick.style.display = 'block'
    el.joystick.classList.add('on')
    el.joystick.style.opacity = '0.55'
    el.stick.style.transform = 'translate(0,0)'
  }

  function hideFixedJoystick() {
    if (pointerId == null) el.joystick.classList.remove('on')
    el.joystick.style.opacity = ''
  }

  function setJoy(px, py) {
    var dx = px - origin.x
    var dy = py - origin.y
    var len = Math.hypot(dx, dy)
    var maxLen = 52
    if (len > maxLen) {
      dx = (dx / len) * maxLen
      dy = (dy / len) * maxLen
      len = maxLen
    }
    el.stick.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)'
    var dead = 6
    if (len < dead) {
      input.x = input.y = 0
    } else {
      var k = Math.min(1, (len - dead) / (maxLen - dead))
      var d = Math.hypot(dx, dy) || 1
      input.x = (dx / d) * k
      input.y = (dy / d) * k
    }
  }

  function shouldSteer(e) {
    if (settings.joy === 'fixed') {
      // 固定摇杆：左半屏触摸都归摇杆管
      return e.clientX < window.innerWidth * 0.55
    }
    return true
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (phase !== 'playing') return
    if (pointerId !== null) return
    if (!shouldSteer(e)) return
    pointerId = e.pointerId
    if (settings.joy === 'fixed') {
      setJoy(e.clientX, e.clientY)
    } else {
      origin.x = e.clientX
      origin.y = e.clientY
      el.joystick.style.left = e.clientX + 'px'
      el.joystick.style.top = e.clientY + 'px'
      el.joystick.style.display = 'block'
      el.joystick.classList.add('on')
      el.joystick.style.opacity = ''
      el.stick.style.transform = 'translate(0,0)'
      setJoy(e.clientX, e.clientY)
    }
  })

  canvas.addEventListener('pointermove', function (e) {
    if (phase !== 'playing' || e.pointerId !== pointerId) return
    setJoy(e.clientX, e.clientY)
  })

  function endPointer(e) {
    if (e.pointerId !== pointerId) return
    pointerId = null
    input.x = input.y = 0
    if (settings.joy === 'fixed') {
      el.stick.style.transform = 'translate(0,0)'
      el.joystick.style.opacity = '0.55'
    } else {
      el.joystick.classList.remove('on')
      el.joystick.style.opacity = ''
      el.stick.style.transform = 'translate(0,0)'
    }
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  canvas.addEventListener('pointerleave', endPointer)

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase()
    keys[k] = true
    if (k === ' ' || k === 'escape') {
      if (phase === 'playing' || phase === 'paused') togglePause()
      e.preventDefault()
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault()
  })
  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false
  })

  function readKeys() {
    var x = 0
    var y = 0
    if (keys['a'] || keys['arrowleft']) x -= 1
    if (keys['d'] || keys['arrowright']) x += 1
    if (keys['w'] || keys['arrowup']) y -= 1
    if (keys['s'] || keys['arrowdown']) y += 1
    if (x || y) {
      if (pointerId === null) {
        input.x = x
        input.y = y
      }
    } else if (pointerId === null) {
      input.x = 0
      input.y = 0
    }
  }

  /* ---------------- 攻击键（关闭自动打怪后） ---------------- */
  input.fire = false
  function setFire(on) {
    input.fire = on && !settings.auto && phase === 'playing'
    el.attackBtn.classList.toggle('hold', on)
  }
  el.attackBtn.addEventListener('pointerdown', function (e) {
    if (phase !== 'playing' || settings.auto) return
    setFire(true)
  })
  el.attackBtn.addEventListener('pointermove', function (e) {
    if (phase !== 'playing') return
    // 手指滑出按钮也算按住（圆形热区半径 62px）
    var r = el.attackBtn.getBoundingClientRect()
    var dx = e.clientX - (r.left + r.width / 2)
    var dy = e.clientY - (r.top + r.height / 2)
    setFire(dx * dx + dy * dy < 62 * 62)
  })
  function endFire(e) {
    setFire(false)
  }
  el.attackBtn.addEventListener('pointerup', endFire)
  el.attackBtn.addEventListener('pointercancel', endFire)
  el.attackBtn.addEventListener('pointerleave', endFire)

  /* ---------------- 后台暂停 ---------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (phase === 'playing') { togglePause(); saveGame() }
      if (musicEl) {
        if (musicEl.__toneStop) musicEl.__toneStop()
        else { try { musicEl.pause() } catch (e) {} }
      }
      setFire(false)
    }
  })

  window.__onBack = function () {
    if (phase === 'playing') {
      togglePause()
      return true
    }
    if (phase === 'paused' || phase === 'settings' || phase === 'shop' || phase === 'gshop' || phase === 'music' || phase === 'diff' || phase === 'jobs' || phase === 'cheat' || phase === 'notice') {
      // 弹层一层一层退回
      if (phase === 'settings') { closeSettings(); return true }
      if (phase === 'shop') { closeShop(); return true }
      if (phase === 'gshop') { closeGShop(); return true }
      if (phase === 'music') { closeMusicCard(); return true }
      if (phase === 'diff') { closeDiff(); return true }
      if (phase === 'jobs') { closeJobs(); return true }
      if (phase === 'cheat') { closeCheat(); return true }
      if (phase === 'notice') {
        if (popupOpen) { closePopup(); return true }
        if (el.cloudNoticeHistoryScreen.classList.contains('on')) { closeCloudHistory(); return true }
if (el.aboutScreen.classList.contains('on')) { closeAbout(); return true }
        if (el.noticeHistoryScreen.classList.contains('on')) { closeNoticeHistory(); return true }
        closeNotice(); return true
      }
      return false
    }
    if (phase === 'levelup') return true
    if (phase === 'over') {
      toMenu()
      return true
    }
    return false
  }

  /* ---------------- 主循环 ---------------- */
  function loop(ts) {
    if (!last) last = ts
    var dt = (ts - last) / 1000
    last = ts
    if (dt > 0.1) dt = 0.1
    frames++
    fpsAcc += dt
    if (fpsAcc >= 0.5) {
      fps = frames / fpsAcc
      frames = 0
      fpsAcc = 0
    }

    if (phase === 'playing') {
      readKeys()
      acc += dt
      var steps = 0
      while (acc >= 1 / 60 && steps < 5) {
        Sim.step(state, 1 / 60, input)
        acc -= 1 / 60
        steps++
      }
      if (state.over) {
        gameOver()
      } else if (state.pending > 0) {
        showLevelUp()
      } else if (state.shopWave) {
        // 每 5 波：选完升级卡后弹出战斗商店（shopWave = 触发的波号）
        state.shopWave = 0
        openGShop()
      }
    }

    // 跳过按钮：只在波间休息（且没在升级/商店）时出现
    if (state && (phase === 'playing')) {
      var canSkip = !state.waveActive && state.restLeft > 0.05 && state.restLeft < 10 && !state.pending
      if (canSkip !== skipShown) {
        skipShown = canSkip
        el.skipBtn.classList.toggle('on', canSkip)
        if (canSkip && window.__autoLog) window.__autoLog.push('skipParent=' + el.skipBtn.parentElement.id + ' on=1')
      }
    }

    // 战斗相关相位才画 canvas；首页/结算/弹层时 canvas 留空，露出背景视频
    if (phase === 'playing' || phase === 'paused' || phase === 'levelup' || phase === 'gshop') renderer.draw(state, dt)

    hudAcc += dt
    if (hudAcc > 0.08) {
      hudAcc = 0
      if (phase === 'playing' || phase === 'levelup' || phase === 'paused') updateHud(false)
    }

    // 每 15 秒静默存一次档（意外退出也能继续）
    if (phase === 'playing' || phase === 'paused') {
      saveAcc += dt
      if (saveAcc > 15) { saveAcc = 0; saveGame() }
    }

    // 闯关达成条件时解锁职业（每帧查一次，内部有节流）
    if (phase === 'playing') checkJobUnlock()

    if (DEBUG) {
      diagAcc += dt
      if (diagAcc > 0.4) {
        diagAcc = 0
        updateDiag()
      }
    }

    requestAnimationFrame(loop)
  }

  function updateDiag() {
    var s = state
    var actx = canvas.getContext('2d')
    brightness = -1
    try {
      var sw = 40
      var sh = 40
      if (!updateDiag._c) {
        updateDiag._c = document.createElement('canvas')
        updateDiag._c.width = sw
        updateDiag._c.height = sh
      }
      var c2 = updateDiag._c.getContext('2d')
      c2.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, sw, sh)
      var data = c2.getImageData(0, 0, sw, sh).data
      var sum = 0
      var nonBlack = 0
      for (var i = 0; i < data.length; i += 4) {
        var v = (data[i] + data[i + 1] + data[i + 2]) / 3
        sum += v
        if (v > 12) nonBlack++
      }
      brightness = sum / (sw * sh)
      updateDiag._fill = nonBlack / (sw * sh)
    } catch (e) {
      updateDiag._fill = -1
    }
    var txt =
      'phase=' + phase + ' fps=' + fps.toFixed(0) +
      ' t=' + s.time.toFixed(1) + ' ent=' + (s.enemies.length + '/' + s.bullets.length + '/' + s.gems.length) +
      ' lv=' + s.player.level + ' kills=' + s.stats.kills +
      ' hp=' + Math.round(s.player.hp) + ' coins=' + s.coins +
      '\nbright=' + (brightness < 0 ? 'n/a' : brightness.toFixed(1)) +
      ' fill=' + (updateDiag._fill < 0 ? 'n/a' : (updateDiag._fill * 100).toFixed(0) + '%') +
      ' canvas=' + canvas.width + 'x' + canvas.height +
      ' jin=' + input.x.toFixed(2) + ',' + input.y.toFixed(2)
    el.diag.textContent = txt
  }

  /* ---------------- 事件绑定 ---------------- */
  document.getElementById('startBtn').addEventListener('click', function () {
    audio()
    sfx.click()
    openDiff()
  })
  el.continueBtn.addEventListener('click', function () {
    audio()
    sfx.click()
    continueGame()
  })
  document.getElementById('againBtn').addEventListener('click', function () {
    sfx.click()
    newGame(lastDiff)
  })
  document.getElementById('backBtn').addEventListener('click', function () {
    sfx.click()
    toMenu()
  })
  // 刚点过「跳过」的 400ms 内忽略暂停误触（两按钮垂直相邻，指腹容易同时压到）
  var lastSkipAt = 0
  tap(el.pauseBtn, function () {
    if (Date.now() - lastSkipAt < 400) return
    togglePause()
  })
  el.resumeBtn.addEventListener('click', resumeGame)
  el.restartBtn.addEventListener('click', function () { sfx.click(); newGame(lastDiff) })
  el.quitBtn.addEventListener('click', function () { sfx.click(); toMenu() })
  // 立即结算：角色直接死亡，按当前进度结算金币并进入结算页
  // 存活不足 5 分钟不给首页商店货币（防刷）
  el.settleBtn.addEventListener('click', function () {
    sfx.click()
    if (!state || state.over) return
    var under5 = (state.time || 0) < 300
    state.player.hp = 0
    state.revives = 0
    state.over = true
    state.paused = false
    if (under5) coinBanked = true // 跳过 settleReward，本局不产币
    gameOver()
    if (under5) toast('存活不足 5 分钟 · 本局不结算金币')
  })
  el.setBtn.addEventListener('click', openSettings)
  el.setBackBtn.addEventListener('click', closeSettings)
  el.jobBtn.addEventListener('click', openJobs)
  el.jobBackBtn.addEventListener('click', closeJobs)
  el.shopBtn1.addEventListener('click', openShop)
  /* ---------------- 作弊码（首页长按「设置」唤起） ---------------- */
  // 会话级作弊：大退重进游戏后重置；但 cheatAtk 会随存档保留（sim 序列化）
  var sessionCheat = { atk: false, mon: false }
  var CHEAT_ATK_KEY = 'mow.cheatatk.v1' // 本次会话已领取标记（仅限一次）

  function openCheat() {
    hideMenuOverlays()
    phase = 'cheat'
    el.cheatInput.value = ''
    el.cheatMsg.textContent = ''
    show(el.cheatScreen, true)
    sfx.click()
    // 唤起输入法：长按属于用户手势，但部分 WebView 需要一帧后 focus 才稳定
    setTimeout(function () { try { el.cheatInput.focus() } catch (e) {} }, 30)
  }

  function closeCheat() {
    show(el.cheatScreen, false)
    if (phase === 'cheat') {
      phase = 'menu'
      show(el.startScreen, true) // hideMenuOverlays 关掉了首页，需恢复
    }
    sfx.click()
  }

  function submitCheat() {
    var code = (el.cheatInput.value || '').trim()
    var msg = ''
    if (code === '114514') {
      wallet += 666666
      saveAll()
      sfx.coin()
      msg = '◈ +666,666 已存入钱包'
    } else if (code === '我是91男演员') {
      var taken = false
      try { taken = !!sessionStorage.getItem(CHEAT_ATK_KEY) } catch (e) {}
      if (taken) {
        msg = '该作弊码仅限一次 · 本次运行已领取'
      } else {
        try { sessionStorage.setItem(CHEAT_ATK_KEY, '1') } catch (e) {}
        sessionCheat.atk = true
        if (state) state.cheatAtk = 1.1
        saveGame() // 随存档保存：从存档继续仍有加成
        sfx.level()
        msg = '攻击 +10% · 已生效（随存档保存）'
      }
    } else if (code === '这些怪怎么这么垃圾？') {
      sessionCheat.mon = true
      if (state) Sim.applyCheat(state, code)
      sfx.level()
      msg = '怪物全部强化 · 退出游戏后重置'
    } else if (!code) {
      msg = '请输入作弊码'
    } else {
      msg = '未知作弊码'
      sfx.click()
    }
    el.cheatMsg.textContent = msg
  }
  el.cheatOkBtn.addEventListener('click', submitCheat)
  el.cheatInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.keyCode === 13) { ev.preventDefault(); submitCheat() }
  })
  el.cheatInput.addEventListener('confirm', submitCheat) // 部分 Android WebView 的确认键
  el.cheatBackBtn.addEventListener('click', closeCheat)

  // 首页长按「设置」→ 作弊码窗（短按仍打开设置）
  var lpTimer = null
  var lpFired = false
  el.setBtn1.addEventListener('pointerdown', function () {
    lpFired = false
    lpTimer = setTimeout(function () {
      lpTimer = null
      lpFired = true
      openCheat()
    }, 800)
  })
  function cancelLP() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null } }
  el.setBtn1.addEventListener('pointerup', cancelLP)
  el.setBtn1.addEventListener('pointerleave', cancelLP)
  el.setBtn1.addEventListener('pointercancel', cancelLP)
  el.setBtn1.addEventListener('click', function (ev) {
    if (lpFired) { lpFired = false; ev.preventDefault(); ev.stopPropagation(); return }
    openSettings()
  })

  /* ================= 公告与版本更新 =================
     全冷更新：游戏本体（脚本/音乐/背景/页面）全部写死在 APK 里，更新只有一个途径——下载并安装完整包。
     只有公告可以热更新：启动时拉 cloud/manifest.json，版本号或公告内容比 APK 内置的新，
     就直接弹公告、并把历史版本列表刷成云端最新（不需要重新装包）。
     - 冷更新公告：构建时 tools/gen_manifest.py 写入 game/notice-data.js，随 APK 下发，离线可看
     - 热更新公告：运行时从云端清单拉取，覆盖/补充内置公告
     - 历史版本：点版本号展开该版本的更新内容与修复项
     - 凡提及敏感词的公告条目一律不显示（正文整条屏蔽，标题式条目丢弃含该词的并列段）
  ================================================================= */
  var LOCAL_NOTICE = window.__MOW_NOTICE__ || {}
  var CLOUD_URL = 'https://raw.githubusercontent.com/gu0766964-beep/9178/main/cloud/manifest.json'
  var LOCAL_VC = parseInt(LOCAL_NOTICE.versionCode, 10) || 0
  var LOCAL_VN = LOCAL_NOTICE.versionName || String(LOCAL_VC)
  var NOTICE_SIG_KEY = 'mow.notice.sig'   // 已自动弹过的公告签名（同一条公告不重复弹）
  var HISTORY_KEY = 'mow.notice.history'  // 本地看过的版本记录（补云端/内置历史缺失的版本）
  var HISTORY_MAX = 200

  var FORBIDDEN = ['作弊码', '作 弊 码']

  function hasForbidden(t) {
    for (var i = 0; i < FORBIDDEN.length; i++) if (t.indexOf(FORBIDDEN[i]) >= 0) return true
    return false
  }

  // 敏感词过滤：正文条目整条屏蔽；标题式（' + ' 并列）只丢弃含禁词的段
  function noticeFilter(list, allowSplit) {
    var out = []
    ;(list || []).forEach(function (raw) {
      var t = String(raw == null ? '' : raw).trim()
      if (!t) return
      if (!hasForbidden(t)) { out.push(t); return }
      if (allowSplit && t.indexOf(' + ') >= 0) {
        var keep = []
        t.split(' + ').forEach(function (p) {
          p = p.trim()
          if (p.length >= 2 && !hasForbidden(p)) keep.push(p)
        })
        if (keep.length) out.push(keep.join(' + '))
      }
    })
    return out
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function fmtSize(n) {
    n = parseInt(n, 10) || 0
    if (n <= 0) return ''
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'
  }

  function fmtDate(d) {
    if (!d) return ''
    var s = String(d)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    var t = new Date(s)
    return isNaN(t.getTime()) ? '' : t.toLocaleDateString('zh-CN')
  }

  function loadSeenHistory() {
    try {
      var h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      return Object.prototype.toString.call(h) === '[object Array]' ? h : []
    } catch (e) { return [] }
  }

  function saveSeenHistory(list) {
    var seen = {}, uniq = []
    ;(list || []).forEach(function (x) {
      if (!x || x.versionCode == null) return
      var vc = parseInt(x.versionCode, 10)
      if (!vc || seen[vc]) return
      seen[vc] = 1
      uniq.push({ versionCode: vc, versionName: x.versionName || '', date: x.date || '' })
    })
    uniq.sort(function (a, b) { return b.versionCode - a.versionCode })
    if (uniq.length > HISTORY_MAX) uniq = uniq.slice(0, HISTORY_MAX)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(uniq)) } catch (e) {}
  }

  // 历史版本合并：本地看过 < 内置（冷更新） < 云端（热更新），按版本号去重倒序
  function mergeNoticeHistory(cloudHist) {
    var byVc = {}, order = []
    function put(e, weight) {
      if (!e || e.versionCode == null) return
      var vc = parseInt(e.versionCode, 10)
      if (!vc) return
      var add = noticeFilter(e.add, true)
      var fix = noticeFilter(e.fix)
      var rec = byVc[vc]
      if (!rec) {
        if (!add.length && !fix.length) return
        byVc[vc] = { versionCode: vc, versionName: e.versionName || String(vc), date: e.date || '', add: add, fix: fix, w: weight }
        order.push(vc)
        return
      }
      if (weight < rec.w) return
      if (add.length) rec.add = add
      if (fix.length) rec.fix = fix
      if (e.versionName) rec.versionName = e.versionName
      if (e.date) rec.date = e.date
      rec.w = weight
    }
    loadSeenHistory().forEach(function (e) { put(e, 0) })
    ;(LOCAL_NOTICE.history || []).forEach(function (e) { put(e, 1) })
    ;(cloudHist || []).forEach(function (e) { put(e, 2) })
    order.sort(function (a, b) { return b - a })
    return order.map(function (vc) {
      var r = byVc[vc]
      return { versionCode: r.versionCode, versionName: r.versionName, date: r.date, add: r.add, fix: r.fix }
    })
  }

  var noticeHistory = mergeNoticeHistory(null)

  function markSeen(vc, vn) {
    var h = loadSeenHistory()
    h.push({ versionCode: vc, versionName: vn || '', date: new Date().toISOString().slice(0, 10) })
    saveSeenHistory(h)
  }

  /* ---- 本地存储键：本版公告已弹版本 / 云公告已弹 id / 云公告历史 ---- */
  var LOCAL_VC_KEY = 'mow.notice.localvc'    // 已弹过公告的 APK 版本号（装新包后弹一次）
  var CLOUD_ID_KEY = 'mow.cloudnotice.id'    // 已弹过的云公告 id（云公告只弹最新一条且不重复）
  var CLOUD_HIST_KEY = 'mow.cloudnotice.history'
  var CLOUD_HIST_MAX = 60

  function getStore(k) {
    try { return localStorage.getItem(k) || '' } catch (e) { return '' }
  }
  function setStore(k, v) {
    try { localStorage.setItem(k, v) } catch (e) {}
  }
  function storeJson(k) {
    try {
      var v = JSON.parse(getStore(k) || '[]')
      return Object.prototype.toString.call(v) === '[object Array]' ? v : []
    } catch (e) { return [] }
  }

  function loadCloudHistory() { return storeJson(CLOUD_HIST_KEY) }

  // 每收到一条新的云公告就留档，供「云公告」历史面板翻看
  function saveCloudHistory(rec) {
    if (!rec || !rec.id) return
    var list = loadCloudHistory(), out = [rec]
    list.forEach(function (x) { if (x && String(x.id) !== String(rec.id)) out.push(x) })
    if (out.length > CLOUD_HIST_MAX) out = out.slice(0, CLOUD_HIST_MAX)
    setStore(CLOUD_HIST_KEY, JSON.stringify(out))
  }

  // 云公告历史合并：本地留档 < 内置（随包） < 云端清单，按 id 去重
  function mergeCloudHistory(cloudHist) {
    var byId = {}, order = []
    function put(e, w) {
      if (!e) return
      var id = String(e.noticeId || e.id || ((e.versionCode || '') + '@' + (e.date || '')))
      if (!id || id === '@') return
      var add = noticeFilter(e.add, true)
      var fix = noticeFilter(e.fix)
      var rec = byId[id]
      if (!rec) {
        if (!add.length && !fix.length) return
        byId[id] = {
          id: id, versionCode: parseInt(e.versionCode, 10) || 0,
          versionName: e.versionName || '', date: e.date || '', add: add, fix: fix, w: w
        }
        order.push(id)
        return
      }
      if (w < rec.w) return
      if (add.length) rec.add = add
      if (fix.length) rec.fix = fix
      if (e.versionName) rec.versionName = e.versionName
      if (e.date) rec.date = e.date
      rec.w = w
    }
    loadCloudHistory().forEach(function (e) { put(e, 0) })
    ;(LOCAL_NOTICE.cloudHistory || []).forEach(function (e) { put(e, 1) })
    ;(cloudHist || []).forEach(function (e) { put(e, 2) })
    var out = []
    order.forEach(function (id) { out.push(byId[id]) })
    out.sort(function (a, b) { return (b.versionCode - a.versionCode) || String(b.date).localeCompare(String(a.date)) })
    return out.map(function (r) {
      return { id: r.id, versionCode: r.versionCode, versionName: r.versionName, date: r.date, add: r.add, fix: r.fix }
    })
  }

  var cloudNoticeHistory = mergeCloudHistory(null)

  /* ---- 通用：渲染可折叠历史条目（历史版本 / 云公告历史共用） ---- */
  function renderHistoryList(listEl, verEl, hist, opts) {
    opts = opts || {}
    var list = hist || []
    verEl.textContent = list.length
      ? (opts.verText || ('共 ' + list.length + ' 个版本'))
      : (opts.emptyVer || '暂无记录')
    if (!list.length) {
      listEl.innerHTML = '<div class="hEmpty">' + escHtml(opts.emptyText || '没有历史公告') + '</div>'
      return
    }
    var html = ''
    list.forEach(function (it) {
      var isNew = it.versionCode > LOCAL_VC
      var isCur = it.versionCode === LOCAL_VC
      var add = it.add || [], fix = it.fix || []
      var brief = add[0] || fix[0] || ''
      html += '<li class="hItem" data-vc="' + it.versionCode + '">'
      html += '<div class="hHead">'
      html += '<span class="hVer">v' + escHtml(it.versionName || String(it.versionCode)) + '</span>'
      if (it.date) html += '<span class="hTime">' + escHtml(fmtDate(it.date)) + '</span>'
      if (opts.tagOf) html += opts.tagOf(it, isNew, isCur)
      else if (isNew) html += '<span class="hType" style="background:rgba(255,206,92,0.16);color:#ffce5c">新版</span>'
      else if (isCur) html += '<span class="hType" style="background:rgba(89,220,255,0.14);color:#59dcff">当前</span>'
      else html += '<span class="hType">冷更新</span>'
      html += '<span class="hArrow">›</span>'
      html += '</div>'
      if (brief) html += '<div class="hBrief">' + escHtml(brief) + '</div>'
      html += '<div class="hBody">'
      if (add.length) {
        html += '<div class="noticeSec">✦ 更新内容</div><ul>'
        add.forEach(function (t) { html += '<li>' + escHtml(t) + '</li>' })
        html += '</ul>'
      }
      if (fix.length) {
        html += '<div class="noticeSec">✦ 问题修复</div><ul>'
        fix.forEach(function (t) { html += '<li>' + escHtml(t) + '</li>' })
        html += '</ul>'
      }
      if (!add.length && !fix.length) html += '<div class="hEmpty" style="padding:8px">该版本无公告内容</div>'
      html += '</div></li>'
    })
    listEl.innerHTML = html
  }

  // 点条目头展开/收起该版详情
  function bindHistoryToggle(listEl) {
    listEl.addEventListener('click', function (ev) {
      var node = ev.target
      while (node && node !== listEl && String(node.className || '').indexOf('hHead') < 0) node = node.parentNode
      if (!node || node === listEl) return
      var item = node.parentNode
      if (!item || String(item.className || '').indexOf('hItem') < 0) return
      item.className = item.className.indexOf('open') >= 0
        ? item.className.replace(/\s*open/, '')
        : item.className + ' open'
      sfx.click()
    })
  }

  /* ---- 主公告面板（右侧滑帘）：冷更新 + 热更新合并展示 ---- */
  function showNotice(j) {
    j = j || {}
    hideMenuOverlays()
    phase = 'notice'
    var add = noticeFilter(j.notice && j.notice.add, true)
    var fix = noticeFilter(j.notice && j.notice.fix)
    if (!add.length && !fix.length) {
      // 无参数调用（首页手动看公告）时用 APK 内置的本版公告
      add = noticeFilter(LOCAL_NOTICE.notice && LOCAL_NOTICE.notice.add, true)
      fix = noticeFilter(LOCAL_NOTICE.notice && LOCAL_NOTICE.notice.fix)
    }
    el.noticeAdd.innerHTML = add.length
      ? add.map(function (t) { return '<li>' + escHtml(t) + '</li>' }).join('')
      : '<li>本版以稳定性与性能优化为主</li>'
    el.noticeFix.innerHTML = fix.map(function (t) { return '<li>' + escHtml(t) + '</li>' }).join('')
    el.noticeFixHead.style.display = fix.length ? '' : 'none'
    el.noticeFix.style.display = fix.length ? '' : 'none'

    var vc = parseInt(j.versionCode, 10) || LOCAL_VC
    var vn = j.versionName || LOCAL_VN
    var needPkg = vc > LOCAL_VC

    // 标签：需要装包 -> 冷更新；公告本身已生效 -> 热更新
    var tags = []
    if (needPkg) tags.push('<span class="noticeTag cold">冷更新 · 需安装完整包</span>')
    tags.push('<span class="noticeTag hot">热更新 · 公告已即时生效</span>')
    el.noticeTags.innerHTML = tags.join('')

    el.noticeVer.textContent = needPkg
      ? '新版本 v' + vn + ' 已发布（当前 v' + LOCAL_VN + '）'
      : '公告已更新 · v' + vn + (j.date ? ' · ' + fmtDate(j.date) : '')

    if (needPkg && j.apkUrl) {
      var size = fmtSize(j.apkSize)
      el.noticeDl.style.display = ''
      el.noticeDl.href = j.apkUrl
      el.noticeDl.textContent = '下载完整安装包' + (size ? ' · ' + size : '')
    } else {
      el.noticeDl.style.display = 'none'
    }

    noticeHistory = mergeNoticeHistory(cloudManifest ? cloudManifest.history : null)
    el.noticeEntryBtn.classList.remove('hasNew') // 公告已展示 = 已读，首页红点熄灭
    show(el.noticeScreen, true)
    sfx.level()
  }

  function closeNotice() {
    show(el.noticeScreen, false)
    if (phase === 'notice') {
      phase = 'menu'
      show(el.startScreen, true) // hideMenuOverlays 关掉了首页，需恢复
    }
    sfx.click()
  }

  // ---- 历史版本列表：点版本号展开该版更新内容与修复项 ----
  var historyBackTo = 'start'
  function openNoticeHistory(from) {
    historyBackTo = from || 'start'
    hideMenuOverlays()
    show(el.startScreen, false)
    phase = 'notice'
    var h = noticeHistory
    renderHistoryList(el.noticeHistoryList, el.noticeHistoryVer, h, {
      verText: '共 ' + h.length + ' 个版本 · 当前 v' + LOCAL_VN,
      emptyVer: '暂无历史记录',
      emptyText: '没有历史公告'
    })
    show(el.noticeHistoryScreen, true)
    sfx.level()
  }

  function closeNoticeHistory() {
    show(el.noticeHistoryScreen, false)
    if (historyBackTo === 'notice') {
      // 从公告面板进来：返回公告面板，同时把首页恢复成背景（公告是覆盖在首页上的滑帘）
      phase = 'notice'
      show(el.startScreen, true)
      show(el.noticeScreen, true)
    } else {
      phase = 'menu'
      show(el.startScreen, true)
    }
    sfx.click()
  }

  /* ================= 云公告历史（需求 6） =================
     云端下发的公告单独留一份记录，入口在屏幕左侧垂直居中；
     与「历史版本」分开：这里只看云端下发过的公告（热更新内容）。 */
  function openCloudHistory() {
    hideMenuOverlays()
    show(el.startScreen, false)
    phase = 'notice'
    var h = cloudNoticeHistory
    renderHistoryList(el.cloudHistoryList, el.cloudHistoryVer, h, {
      verText: h.length ? '共 ' + h.length + ' 条 · 最新 v' + (h[0].versionName || h[0].versionCode) : '暂无云公告记录',
      emptyVer: '暂无云公告记录',
      emptyText: '还没有收到云端下发的公告',
      tagOf: function (it, isNew, isCur) {
        if (isCur) return '<span class="hType" style="background:rgba(89,220,255,0.14);color:#59dcff">当前</span>'
        if (isNew) return '<span class="hType" style="background:rgba(255,206,92,0.16);color:#ffce5c">云下发</span>'
        return '<span class="hType" style="background:rgba(255,206,92,0.12);color:#ffce5c">云下发</span>'
      }
    })
    show(el.cloudNoticeHistoryScreen, true)
    sfx.level()
  }

  function closeCloudHistory() {
    show(el.cloudNoticeHistoryScreen, false)
    phase = 'menu'
    show(el.startScreen, true)
    sfx.click()
  }


  /* ---------------- 关于面板（首页「关于」按钮） ---------------- */
  function openAbout() {
    hideMenuOverlays()
    show(el.startScreen, false)
    phase = 'notice'
    show(el.aboutScreen, true)
    sfx.level()
  }

  function closeAbout() {
    show(el.aboutScreen, false)
    phase = 'menu'
    show(el.startScreen, true)
    sfx.click()
  }

  /* ================= 居中弹窗（需求 3/4/5/7） =================
     - 每次进游戏自动检测版本：有新版就居中弹「版本更新」，带「下载完整安装包」按钮
     - 装新包后第一次进游戏：弹一次本版内置公告（冷更新）
     - 云下发公告：必弹、只弹最新一条，弹过就不再弹；之后可在「云公告」里的历史查看 */
  var popupOpen = false
  var POPUP_QUEUE = []

  function enqueuePopup(item) {
    POPUP_QUEUE.push(item)
  }

  function renderPopup(it) {
    popupOpen = true
    hideMenuOverlays()
    show(el.startScreen, false)
    phase = 'notice'
    el.updTitle.textContent = it.title || '游戏公告'
    el.updVer.textContent = it.verText || ''
    el.updTags.innerHTML = (it.tags || []).join('')
    var add = it.add || [], fix = it.fix || []
    el.updAdd.innerHTML = add.length
      ? add.map(function (t) { return '<li>' + escHtml(t) + '</li>' }).join('')
      : '<li>本版以稳定性与性能优化为主</li>'
    el.updFix.innerHTML = fix.map(function (t) { return '<li>' + escHtml(t) + '</li>' }).join('')
    el.updFixHead.style.display = fix.length ? '' : 'none'
    el.updFix.style.display = fix.length ? '' : 'none'
    if (it.apkUrl) {
      var size = fmtSize(it.apkSize)
      el.updDl.style.display = ''
      el.updDl.href = it.apkUrl
      el.updDl.textContent = '下载完整安装包' + (size ? ' · ' + size : '')
      el.updOk.textContent = '稍后再说'
    } else {
      el.updDl.style.display = 'none'
      el.updOk.textContent = '知 道 了'
    }
    // 弹过即标记已读：云公告按 noticeId 去重，本版公告按 versionCode 去重
    if (it.markCloudId) {
      setStore(CLOUD_ID_KEY, String(it.markCloudId))
      el.noticeCloudNoticeBtn.classList.remove('hasNew')
    }
    if (it.markLocalVc) {
      setStore(LOCAL_VC_KEY, String(it.markLocalVc))
      el.noticeEntryBtn.classList.remove('hasNew')
    }
    show(el.updateScreen, true)
    sfx.level()
  }

  function pumpPopup() {
    if (popupOpen) return
    if (!POPUP_QUEUE.length) return
    renderPopup(POPUP_QUEUE.shift())
  }

  function restoreAfterPopup() {
    show(el.updateScreen, false)
    if (phase === 'notice') phase = 'menu'
    show(el.startScreen, true)
  }

  function closePopup() {
    show(el.updateScreen, false)
    popupOpen = false
    sfx.click()
    if (POPUP_QUEUE.length) { pumpPopup(); return }
    restoreAfterPopup()
  }

  // ---- 检查更新：拉云端清单（只有公告与版本元数据可热更新） ----
  var cloudManifest = null
  function noticeSignature(j) {
    return JSON.stringify([parseInt(j.versionCode, 10) || 0, (j.notice && j.notice.add) || [], (j.notice && j.notice.fix) || []])
  }

  function checkUpdate(quiet) {
    fetch(CLOUD_URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json() })
      .then(function (j) {
        if (!j || !j.versionCode) throw new Error('bad manifest')
        cloudManifest = j
        noticeHistory = mergeNoticeHistory(j.history)
        cloudNoticeHistory = mergeCloudHistory(j.noticeHistory)

        var vc = parseInt(j.versionCode, 10) || 0
        var vn = j.versionName || String(vc)
        var dateTxt = j.date ? ' · ' + fmtDate(j.date) : ''
        var needPkg = vc > LOCAL_VC

        var cloudAdd = noticeFilter(j.notice && j.notice.add, true)
        var cloudFix = noticeFilter(j.notice && j.notice.fix)
        var hasCloud = !!(cloudAdd.length || cloudFix.length)
        var cloudId = j.noticeId ? String(j.noticeId) : noticeSignature(j)

        if (hasCloud) {
          saveCloudHistory({ id: cloudId, versionCode: vc, versionName: vn, date: j.date || '', add: cloudAdd, fix: cloudFix })
          cloudNoticeHistory = mergeCloudHistory(j.noticeHistory)
        }

        var cloudPending = hasCloud && getStore(CLOUD_ID_KEY) !== cloudId
        var localPending = getStore(LOCAL_VC_KEY) !== String(LOCAL_VC)

        if (needPkg) {
          // 需求 3/7：有版本更新 -> 居中弹更新公告，必带下载入口
          enqueuePopup({
            title: '版本更新',
            verText: '新版本 v' + vn + ' 已发布（当前 v' + LOCAL_VN + '）' + dateTxt,
            tags: ['<span class="noticeTag cold">冷更新 · 需安装完整包</span>',
                   '<span class="noticeTag hot">公告已即时生效</span>'],
            add: cloudAdd, fix: cloudFix,
            apkUrl: j.apkUrl || '', apkSize: j.apkSize || 0,
            markCloudId: hasCloud ? cloudId : '',
            markLocalVc: LOCAL_VC // 更新公告已含最新内容，不再重复弹本版公告
          })
          el.noticeEntryBtn.classList.add('hasNew')
          if (cloudPending) el.noticeCloudNoticeBtn.classList.add('hasNew')
        } else if (cloudPending) {
          // 需求 5：云公告必弹，只弹最新一条，弹完不再弹
          enqueuePopup({
            title: '游戏公告',
            verText: '公告已更新 · v' + vn + dateTxt,
            tags: ['<span class="noticeTag hot">热更新 · 公告已即时生效</span>'],
            add: cloudAdd, fix: cloudFix,
            markCloudId: cloudId
          })
          el.noticeCloudNoticeBtn.classList.add('hasNew')
        }
        if (!needPkg && localPending) {
          // 需求 4：装新包后第一次进游戏，弹一次本版内置公告（与云公告可以先后各弹一次）
          var ln = LOCAL_NOTICE.notice || {}
          var lAdd = noticeFilter(ln.add, true)
          var lFix = noticeFilter(ln.fix)
          enqueuePopup({
            title: '游戏公告',
            verText: '本版更新 · v' + LOCAL_VN + (LOCAL_NOTICE.date ? ' · ' + fmtDate(LOCAL_NOTICE.date) : ''),
            tags: ['<span class="noticeTag cold">冷更新 · 随安装包下发</span>'],
            add: lAdd, fix: lFix,
            markLocalVc: LOCAL_VC
          })
          el.noticeEntryBtn.classList.add('hasNew')
        }

        if (POPUP_QUEUE.length) {
          pumpPopup()
          if (needPkg && !quiet) toast('发现新版本 v' + vn + ' · 请下载完整安装包')
          else if (cloudPending && !needPkg) toast('公告已热更新')
        } else if (!quiet) {
          toast('当前已是最新版本 v' + LOCAL_VN)
        }
      })
      .catch(function () {
        noticeHistory = mergeNoticeHistory(null)
        if (!quiet) toast('检查更新失败 · 请稍后再试')
      })
  }

  el.updBtn.addEventListener('click', function () { sfx.click(); checkUpdate(false) })
  el.noticeEntryBtn.addEventListener('click', function () { sfx.click(); showNotice(cloudManifest) })
  el.aboutBtn.addEventListener('click', function () { sfx.click(); openAbout() })
  el.noticeOk.addEventListener('click', closeNotice)
  el.noticeBackBtn.addEventListener('click', closeNotice)
  el.noticeDl.addEventListener('click', function () {
    sfx.click()
    toast('正在下载安装包 · 完成后点通知栏安装')
  })
  el.noticeHistoryBtn.addEventListener('click', function () {
    sfx.click()
    show(el.noticeScreen, false)
    openNoticeHistory('notice')
  })
  el.noticeHistoryBackBtn.addEventListener('click', function () { closeNoticeHistory() })
  el.noticeOkHistory.addEventListener('click', function () { closeNoticeHistory() })
  bindHistoryToggle(el.noticeHistoryList)

  // 居中弹窗 / 云公告历史的事件
  el.updOk.addEventListener('click', closePopup)
  el.updDl.addEventListener('click', function () {
    sfx.click()
    toast('正在下载安装包 · 完成后点通知栏安装')
  })
  el.noticeCloudNoticeBtn.addEventListener('click', function () { sfx.click(); openCloudHistory() })
  el.cloudHistoryBackBtn.addEventListener('click', function () { closeCloudHistory() })
  el.cloudHistoryOk.addEventListener('click', function () { closeCloudHistory() })
  bindHistoryToggle(el.cloudHistoryList)

  // 需求 7：每次进游戏自动检测一次；有版本更新或新云公告就居中弹出
  if (!/[?&]uitest=1/.test(location.search)) setTimeout(function () { checkUpdate(true) }, 1500)

  el.setBtn.addEventListener('click', openSettings)
  el.shopBackBtn.addEventListener('click', closeShop)
  el.gShopBackBtn.addEventListener('click', closeGShop)
  el.diffBackBtn.addEventListener('click', function () { sfx.click(); closeDiff() })
  tap(el.musicBtn, function () { openMusicCard('') })
  el.musicEntry.addEventListener('click', function () { openMusicCard('settings') })
  el.musicBackBtn.addEventListener('click', closeMusicCard)
  tap(el.prevTrackBtn, function () { sfx.click(); prevTrack() })
  tap(el.nextTrackBtn, function () { sfx.click(); nextTrack() })
  tap(el.modeTrackBtn, function () {
    sfx.click()
    setMusicMode(musicMode === 'order' ? 'repeat' : musicMode === 'repeat' ? 'random' : 'order')
  })
  ;(function () {
    var btns = el.segMode.querySelectorAll('button')
    for (var i = 0; i < btns.length; i++) {
      ;(function (btn) {
        btn.addEventListener('click', function () { setMusicMode(btn.getAttribute('data-m')) })
      })(btns[i])
    }
  })()

  // 跳过波间休息：只在休息倒计时中显示
  tap(el.skipBtn, function () {
    if (phase !== 'playing') return
    if (Sim.skipRest(state)) { lastSkipAt = Date.now(); sfx.click(); toast('直接开始下一波'); updateHud(true) }
  })

  window.addEventListener('resize', function () {
    if (state) {
      state.view.w = window.innerWidth
      state.view.h = window.innerHeight
    }
    renderer.resize()
    if (settings.joy === 'fixed' && phase === 'playing') placeFixedJoystick(true)
  })

  /* ---------------- 调试 / 自测接口 ---------------- */
  if (/[?&]autotest=1/.test(location.search)) {
    var autoLog = []
    window.__autoLog = autoLog
    setTimeout(function () {
      newGame()
      autoLog.push('started')
      var phaseLog = []
      var ticks = 0
      var timer = setInterval(function () {
        ticks++
        phaseLog.push('t' + ticks + ':' + phase)
        if (phase === 'playing' && state && ticks < 20) {
          // 直接造一次升级（宝石全靠走位捡，自测里不等了）
          state.pending = 1
          state.paused = false
        }
        if (phase === 'levelup') {
          var first = document.querySelector('#cards .card')
          if (first) {
            if (autoLog.indexOf('cardsN=') < 0) autoLog.push('cardsN=' + document.querySelectorAll('#cards .card').length)
            if (autoLog.indexOf('clicked') < 0) autoLog.push('clicked')
            if (autoLog.indexOf('card=') < 0) {
              var ct = first.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)
              autoLog.push('card=' + ct)
              document.title = 'AUTOTEST partial ' + autoLog.join(',')
            }
            first.click()
          }
        }
        if (ticks === 24) {
          // 测试暂停流程
          togglePause()
          autoLog.push('paused=' + phase)
          resumeGame()
          autoLog.push('resumed=' + phase)
          // 商店只在首页打开
          toMenu()
          upgrades.armor = 1
          wallet = 999
          openShop()
          autoLog.push('shop=' + phase + ' rows=' + el.shopList.children.length)
          var item = el.shopList.querySelector('.shopItem')
          if (item) {
            item.click()
            autoLog.push('bought armor=' + upgrades.armor + ' wallet=' + wallet)
          }
          closeShop()
          autoLog.push('closed=' + phase)
          autoLog.push('bgHome=' + el.bgVideo.style.display + ':' + (el.bgVideo.getAttribute('src') || '-').replace(/^.*\//, ''))
          // 设置里的播放列表：应含内置曲
          openSettings()
          autoLog.push('settings tracks=' + el.playlist.children.length)
          closeSettings()
          autoLog.push('closed2=' + phase)
          // 设置：关闭自动打怪 → 攻击键出现
          settings.auto = false
          syncSettings()
          autoLog.push('attackBtn=' + el.attackBtn.className)
          settings.auto = true
          syncSettings()
        }
        if (ticks === 25 && phase === 'menu') {
          // 职业面板：首页「角色」打开 → 列表渲染 → 选一个已解锁职业，再看购买类职业的展示
          openJobs()
          var priceCard = el.jobList.querySelector('.jobCard[data-j="guardian"]')
          var priceTag = priceCard ? priceCard.querySelector('.jtag') : null
          // 法师是闯关解锁：测试里直接标记为已解锁（真实流程见 checkJobUnlock）
          if (unlocked.indexOf('mage') < 0) { unlocked.push('mage'); saveAll(); renderJobs() }
          var jc = el.jobList.querySelector('.jobCard[data-j="mage"]')
          if (jc) jc.click()
          autoLog.push('jobs rows=' + el.jobList.children.length + ' price=' + (priceTag ? priceTag.textContent : '?') + ' curJob=' + currentJob)
          closeJobs()
        }
        if (ticks === 26 && phase === 'menu') {
          // 音乐播放卡片：从设置进入，切播放模式，再返回
          openMusicCard('settings')
          autoLog.push('musicCard=' + phase + ' rows=' + el.playlist.children.length)
          var mb = el.segMode.querySelectorAll('button')
          if (mb[2]) mb[2].click()
          autoLog.push('mode=' + musicMode + ' saved=' + (localStorage.getItem(MODE_KEY) || 'none'))
          if (el.nextTrackBtn) el.nextTrackBtn.click()
          autoLog.push('np=' + el.nowPlaying.textContent.slice(0, 14))
          closeMusicCard()
          autoLog.push('musicBack=' + phase)
          closeSettings()
          autoLog.push('menuBack=' + phase)
        }
        if (ticks === 27 && phase === 'menu') {
          // 首页右上角「检查更新」按钮与公告 overlay 的状态
          autoLog.push('upd=' + (el.updBtn ? el.updBtn.textContent.trim() : 'MISSING') + ' notice=' + (el.noticeScreen.className.indexOf('on') < 0 ? 'hidden' : 'shown'))
          // 难度选择：首页点「新游戏」先弹难度面板，选「地狱」开局
          openDiff()
          autoLog.push('diffOpen=' + phase)
          var db = el.diffList.querySelector('.d-hell')
          if (db) db.click()
          autoLog.push('diff=' + (state && state.difficulty) + ' job=' + (state && state.job) + ' w=' + (state && state.weaponOrder.join('+')))
          autoLog.push('bgPlay=' + el.bgVideo.style.display + ':' + (el.bgVideo.getAttribute('src') || '-'))
          // 存档：保存 → 首页显示继续游戏 → 继续 → 关闭自动打怪 → 攻击键出现（需求 9）
          Sim.skipRest(state)
          Sim.skipRest(state)
          state.enemies.length = 0
          state.spawnQueue.length = 0
          state.waveActive = false
          state.restLeft = 8
          state.pending = 0
          saveGame()
          autoLog.push('save=' + (hasSave() ? 1 : 0) + ' wave=' + state.wave)
          settings.auto = false
          syncSettings()
          openSettings()
          closeSettings()
          resumeGame()
          autoLog.push('attackOnMenu=' + el.attackBtn.className)
          settings.auto = true
          syncAttackBtn()
        }
        if (ticks === 31 && phase === 'playing') {
          // 战斗商店：造一个 10 波完成态
          state.coins = 999
          state.shopWave = 10
        }
        if (phase === 'gshop' && autoLog.indexOf('gshop') < 0) {
          autoLog.push('gshop')
          var gi = el.gShopList.querySelector('.shopItem')
          if (gi) {
            gi.click()
            autoLog.push('gbought coins=' + state.coins)
          }
          closeGShop()
          autoLog.push('gclosed=' + phase)
        }
        if (phase === 'over' && autoLog.indexOf('dead') < 0) {
          autoLog.push('dead')
          el.diag.classList.add('on')
          var msg = 'AUTOTEST ' + autoLog.slice(-16).join(',') + ' | ' + phaseLog.slice(-10).join(' ')
          el.diag.textContent = msg
          document.title = msg
          clearInterval(timer)
        }
        if (ticks > 60) {
          el.diag.classList.add('on')
          var msg2 = 'AUTOTEST stack=' + autoLog.slice(-16).join(',') + ' | ' + phaseLog.slice(-10).join(' ')
          el.diag.textContent = msg2
          document.title = msg2
          clearInterval(timer)
        }
      }, 200)
    }, 400)
  }

  /* ---------------- 公告 UI 自测：?uitest=1 ---------------- */
  if (/[?&]uitest=1/.test(location.search)) {
    var uLog = []
    function uOn(node) { return node && node.className.indexOf('on') >= 0 }
    function uRect(node) { return node ? node.getBoundingClientRect() : { left: -1, top: -1 } }
    // 「返回按钮在面板左上角」是相对面板判断，不是相对视口
    function uBackPos(btn, screen) {
      var sheet = screen && screen.querySelector('.sheet')
      if (!btn || !sheet) return 'nodom'
      var b = uRect(btn), s = uRect(sheet)
      var dx = Math.round(b.left - s.left), dy = Math.round(b.top - s.top)
      return (dx >= 0 && dx < 70 && dy >= 0 && dy < 90) ? 'TL' : ('d' + dx + ',' + dy)
    }

    // 1) 历史版本：可滚动 + 返回按钮在左上角 + 折叠展开 + 禁词过滤
    setTimeout(function () {
      openNoticeHistory('start')
      uLog.push('hist=' + (uOn(el.noticeHistoryScreen) ? 'on' : 'off'))
      uLog.push('rows=' + el.noticeHistoryList.children.length)
      uLog.push('scroll=' + (el.noticeHistoryList.scrollHeight > el.noticeHistoryList.clientHeight ? 1 : 0)
        + '/' + (getComputedStyle(el.noticeHistoryList).overflowY || '-'))
      uLog.push('backPos=' + uBackPos(el.noticeHistoryBackBtn, el.noticeHistoryScreen))
      var allText = el.noticeHistoryList.textContent || ''
      uLog.push('forbidden=' + (allText.indexOf('作弊码') >= 0 || allText.indexOf('作 弊 码') >= 0 ? 'FOUND' : 'none'))
      var head = el.noticeHistoryList.querySelector('.hItem .hHead')
      var item = head ? head.parentNode : null
      if (head) head.click()
      uLog.push('open=' + (item && item.className.indexOf('open') >= 0 ? '1' : '0')
        + ' body=' + (item && item.querySelector('.hBody') && item.querySelector('.hBody').textContent.indexOf('更新内容') >= 0 ? '1' : '0'))
      if (head) head.click()
      uLog.push('collapse=' + (item && item.className.indexOf('open') >= 0 ? '0' : '1'))
      closeNoticeHistory()
      uLog.push('backHome=' + (uOn(el.startScreen) ? '1' : '0'))
    }, 400)

    // 2) 云公告历史：独立面板 + 左上返回 + 折叠
    setTimeout(function () {
      openCloudHistory()
      uLog.push('cloud=' + (uOn(el.cloudNoticeHistoryScreen) ? 'on' : 'off')
        + '/rows=' + el.cloudHistoryList.children.length
        + '/back=' + uBackPos(el.cloudHistoryBackBtn, el.cloudNoticeHistoryScreen))
      var cText = el.cloudHistoryList.textContent || ''
      uLog.push('cloudClean=' + (cText.indexOf('作弊码') >= 0 ? 'FOUND' : 'none'))
      var chead = el.cloudHistoryList.querySelector('.hItem .hHead')
      if (chead) chead.click()
      var citem = chead ? chead.parentNode : null
      uLog.push('cloudOpen=' + (citem && citem.className.indexOf('open') >= 0 ? '1' : '0'))
      closeCloudHistory()
      uLog.push('cloudBack=' + (uOn(el.startScreen) ? '1' : '0'))
    }, 800)

    // 3) 居中弹窗：本版公告 / 云公告 / 版本更新（带下载按钮）+ 队列依次弹
    setTimeout(function () {
      POPUP_QUEUE.length = 0
      popupOpen = false
      show(el.updateScreen, false)

      // 本版公告（冷更新，无下载）
      enqueuePopup({
        title: '游戏公告', verText: '本版更新 · v' + LOCAL_VN,
        tags: ['<span class="noticeTag cold">冷更新 · 随安装包下发</span>'],
        add: ['自测本版条目'], fix: [], markLocalVc: LOCAL_VC
      })
      enqueuePopup({
        title: '版本更新', verText: '新版本 v9.9.9 已发布（当前 v' + LOCAL_VN + '）',
        tags: ['<span class="noticeTag cold">冷更新 · 需安装完整包</span>'],
        add: ['新版本体内容'], fix: ['新版修复项'],
        apkUrl: 'https://example.com/survivor-9.9.9.apk', apkSize: 160000000
      })
      pumpPopup()
      uLog.push('pop=' + (uOn(el.updateScreen) ? 1 : 0)
        + '/t=' + el.updTitle.textContent
        + '/dl=' + (el.updDl.style.display === 'none' ? 'none' : 'shown'))
      closePopup()
      uLog.push('next=' + el.updTitle.textContent
        + '/cold=' + (el.updTags.textContent.indexOf('冷更新') >= 0 ? 1 : 0)
        + '/pak=' + (el.updDl.style.display === 'none' ? 0 : 1)
        + '/href=' + (/survivor-9\.9\.9\.apk$/.test(el.updDl.getAttribute('href') || '') ? 'ok' : 'bad')
        + '/size=' + (/MB/.test(el.updDl.textContent) ? 'ok' : 'bad')
        + '/ok=' + el.updOk.textContent.replace(/\s/g, ''))
      closePopup()
      uLog.push('queueEnd=' + (uOn(el.startScreen) ? 'home' : 'bad') + '/' + (uOn(el.updateScreen) ? 'still' : 'closed'))
    }, 1400)

    // 4) 真实拉云端清单：只记录提示语，不参与断言（网络不可控）
    setTimeout(function () { checkUpdate(false) }, 2400)
    setTimeout(function () {
      uLog.push('updToast=' + (el.toast.textContent || '').replace(/\s+/g, ''))
      var msg = 'UITEST ' + uLog.join(',')
      el.diag.classList.add('on')
      el.diag.textContent = msg
      document.title = msg
    }, 4200)
  }

  window.__mow = {
    state: function () { return state },
    phase: function () { return phase },
    start: newGame,
    menu: toMenu,
    hud: updateHud,
    diag: function () {
      updateDiag()
      return el.diag.textContent
    },
    brightness: function () { return brightness },
    wallet: function () { return wallet },
    upgrades: function () { return upgrades },
    settings: function () { return settings },
  }

  syncSettings()
  // 首页不显示摇杆：仅进入游戏后才放置固定摇杆
  if (settings.joy === 'fixed' && phase === 'playing') placeFixedJoystick(true)
  refreshBestLabels()
  // 播放列表：内置曲 + 从 IndexedDB 恢复导入过的曲
  for (var b = 0; b < BUILTIN_TRACKS.length; b++) tracks.push(BUILTIN_TRACKS[b])
  restoreTracks()
  renderPlaylist()
  syncModeBtns()
  refreshContinueBtn()
  // 首页：随机背景视频，不播 BGM（进游戏才播）
  setBgOn(true)
  toMenu()
  requestAnimationFrame(loop)
})()
