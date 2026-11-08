/* 无尽割草 · 纯逻辑模拟层（无 DOM / Canvas 依赖，可在 Node 中直接跑） */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.MowSim = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  var TAU = Math.PI * 2
  var CELL = 72
  var HASH_SIZE = 2048
  // 场上宝石软上限：超过则最旧的直接折算经验（防卡顿，经验不丢失）
  var GEM_CAP = 220
  var GEM_SLICE = 30

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v
  }

  function makeRng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9
    return function () {
      a = (a + 0x6d2b79f5) >>> 0
      var t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /* ------------------------------------------------------------------ *
   * 武器表
   * ------------------------------------------------------------------ */
  var WEAPONS = {
    knife: {
      key: 'knife',
      name: '飞刀',
      tag: '单体',
      desc: '朝最近的敌人掷出飞刀',
      manual: true,   // 手动模式下唯一需要按攻击键的武器（其余技能保留自动开火）
      max: 8,
      stat: function (l) {
        return {
          dmg: 11 + 3.4 * (l - 1),
          cd: Math.max(0.26, 0.52 - 0.03 * (l - 1)),
          count: 1 + Math.floor(l / 3),
          pierce: 1, // 飞刀命中敌人即消失（不穿透）
          speed: 660,
          spread: 0.14,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 冷却 ' + d.cd.toFixed(2) + 's · 弹数 ' + d.count
      },
    },
    orbit: {
      key: 'orbit',
      name: '旋刃',
      tag: '环绕',
      desc: '刀刃环绕身周，持续切割',
      max: 8,
      stat: function (l) {
        return {
          blades: 2 + Math.floor((l + 1) / 2),
          radius: 62 + 7 * l,
          dmg: 9 + 2.6 * (l - 1),
          spin: 2.5 + 0.08 * l,
          hitCd: 0.45,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 刀刃 ' + d.blades + ' · 半径 ' + Math.round(d.radius)
      },
    },
    bolt: {
      key: 'bolt',
      name: '雷击',
      tag: '范围',
      desc: '随机劈落落雷，命中一片敌人',
      max: 8,
      stat: function (l) {
        return {
          dmg: 24 + 7 * (l - 1),
          cd: Math.max(0.9, 2.7 - 0.16 * (l - 1)),
          strikes: 1 + Math.floor(l / 2),
          range: 270 + 12 * l,
          radius: 66,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 落雷 ' + d.strikes + ' · 冷却 ' + d.cd.toFixed(2) + 's'
      },
    },
    aura: {
      key: 'aura',
      name: '灵光',
      tag: '光环',
      desc: '持续灼烧靠近的敌人',
      max: 8,
      stat: function (l) {
        return {
          radius: 76 + 8 * l,
          dps: 15 + 5.5 * (l - 1),
          tick: 0.3,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '每秒 ' + Math.round(d.dps) + ' 伤害 · 半径 ' + Math.round(d.radius)
      },
    },
    missile: {
      key: 'missile',
      name: '追踪弹',
      tag: '追踪',
      desc: '自动追敌的魔法弹，命中后爆炸',
      max: 8,
      stat: function (l) {
        return {
          dmg: 26 + 8 * (l - 1),
          cd: Math.max(0.6, 1.6 - 0.07 * (l - 1)),
          count: 1 + Math.floor(l / 3),
          boom: 74,
          speed: 330,
          turn: 4.2,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 弹数 ' + d.count + ' · 冷却 ' + d.cd.toFixed(2) + 's'
      },
    },
    nova: {
      key: 'nova',
      name: '冲击波',
      tag: '横扫',
      desc: '以自身为中心炸开一圈冲击',
      max: 8,
      stat: function (l) {
        return {
          dmg: 26 + 8 * (l - 1),
          cd: Math.max(1.4, 3.6 - 0.18 * (l - 1)),
          radius: 150 + 12 * l,
          expand: 520,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 半径 ' + Math.round(d.radius) + ' · 冷却 ' + d.cd.toFixed(2) + 's'
      },
    },
    // —— v2.5 新增武器 ——
    shard: {
      key: 'shard',
      name: '碎冰',
      tag: '贯通',
      desc: '扇形射出三枚高速冰锥',
      max: 8,
      stat: function (l) {
        return {
          dmg: 14 + 4 * (l - 1),
          cd: Math.max(0.4, 1.1 - 0.05 * (l - 1)),
          count: 3,
          spread: 0.34,
          speed: 820,
          pierce: 3,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 冰锥 ' + d.count + ' · 冷却 ' + d.cd.toFixed(2) + 's'
      },
    },
    chain: {
      key: 'chain',
      name: '链电',
      tag: '连锁',
      desc: '电击最近敌人并跳跃到附近目标',
      max: 8,
      stat: function (l) {
        return {
          dmg: 18 + 5 * (l - 1),
          cd: Math.max(0.8, 2.2 - 0.1 * (l - 1)),
          jumps: 2 + Math.floor(l / 3),
          range: 460,
          jumpR: 190,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 跳跃 ' + d.jumps + ' 次 · 冷却 ' + d.cd.toFixed(2) + 's'
      },
    },
    rain: {
      key: 'rain',
      name: '箭雨',
      tag: '轰炸',
      desc: '在敌人头顶落下箭雨，延迟后打击',
      max: 8,
      stat: function (l) {
        return {
          dmg: 34 + 9 * (l - 1),
          cd: Math.max(1.2, 3.0 - 0.12 * (l - 1)),
          volleys: 2 + Math.floor(l / 2),
          radius: 92 + 5 * l,
          delay: 0.55,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '伤害 ' + Math.round(d.dmg) + ' · 落点 ' + d.volleys + ' · 冷却 ' + d.cd.toFixed(2) + 's'
      },
    },
    laser: {
      key: 'laser',
      name: '死光',
      tag: '扫射',
      desc: '周期性扫出旋转光束，持续灼烧一条线',
      max: 8,
      stat: function (l) {
        return {
          dps: 46 + 13 * (l - 1),
          cd: 3.6,
          sweep: 1.5,
          len: 620 + 22 * l,
          width: 22 + 2 * l,
        }
      },
      line: function (l) {
        var d = this.stat(l)
        return '每秒 ' + Math.round(d.dps) + ' 伤害 · 射程 ' + Math.round(d.len) + ' · 每 3.6s 一次'
      },
    },
  }

  var WEAPON_ORDER = ['knife', 'orbit', 'bolt', 'aura', 'missile', 'nova', 'shard', 'chain', 'rain', 'laser']

  /* ------------------------------------------------------------------ *
   * 被动表
   * ------------------------------------------------------------------ */
  var PASSIVES = {
    atk: { key: 'atk', name: '锋利', icon: '⚔', max: 6, desc: '攻击力 +12%', unit: '攻击力' },
    move: { key: 'move', name: '疾行', icon: '👟', max: 6, desc: '移动速度 +10%', unit: '移速' },
    hp: { key: 'hp', name: '体魄', icon: '❤', max: 6, desc: '生命上限 +22 并回复同等生命', unit: '生命' },
    cd: { key: 'cd', name: '专注', icon: '⏱', max: 6, desc: '冷却缩减 -8%', unit: '冷却' },
    pickup: { key: 'pickup', name: '磁力', icon: '🧲', max: 6, desc: '拾取范围 +45%', unit: '拾取' },
    regen: { key: 'regen', name: '复原', icon: '✚', max: 6, desc: '每秒回复 +0.35 生命', unit: '回复' },
    insight: { key: 'insight', name: '悟性', icon: '✦', max: 6, desc: '经验获取 +30%', unit: '经验' },
    swift: { key: 'swift', name: '迅捷', icon: '🌬', max: 6, desc: '移动速度 +8%', unit: '移速' },
    life: { key: 'life', name: '吸血', icon: '🩸', max: 6, desc: '每击杀回复 +1.5 生命', unit: '吸血' },
    crit: { key: 'crit', name: '暴击', icon: '⚡', max: 6, desc: '暴击率 +7%（1.6 倍伤害）', unit: '暴击' },
    grow: { key: 'grow', name: '成长', icon: '🌱', max: 6, desc: '升级时回复 10% 生命上限', unit: '成长' },
    thorn: { key: 'thorn', name: '荆棘', icon: '🌵', max: 6, desc: '受击时对身边敌人造成反伤', unit: '反伤' },
    ward: { key: 'ward', name: '庇护', icon: '🛡', max: 6, desc: '受到的伤害 -6%', unit: '减伤' },
    fortune: { key: 'fortune', name: '财运', icon: '💰', max: 6, desc: '金币掉落 +15%', unit: '金币' },
    blast: { key: 'blast', name: '爆裂', icon: '💥', max: 6, desc: '击杀敌人时引发小爆炸', unit: '爆炸' },
  }

  /* ------------------------------------------------------------------ *
   * 敌人表
   * tier：normal 普通（低经验）/ elite 精英（中经验）/ boss（高经验）
   * ------------------------------------------------------------------ */
  var ENEMIES = {
    slime: { key: 'slime', name: '史莱姆', hp: 11, speed: 46, dmg: 8, r: 12, xp: 1, tier: 'normal', color: '#f26d6d', dark: '#8c2f3c', unlock: 0 },
    runner: { key: 'runner', name: '疾走虫', hp: 8, speed: 104, dmg: 6, r: 9, xp: 2, tier: 'normal', color: '#f7c948', dark: '#8a6a11', unlock: 22 },
    brute: { key: 'brute', name: '重甲兽', hp: 52, speed: 36, dmg: 16, r: 20, xp: 4, tier: 'normal', color: '#e0654a', dark: '#7a2a1c', unlock: 55 },
    elite: { key: 'elite', name: '幻晶精英', hp: 170, speed: 44, dmg: 22, r: 26, xp: 14, tier: 'elite', color: '#c86bff', dark: '#5a1f86', unlock: 75 },
    boss: { key: 'boss', name: '巨型收割者', hp: 950, speed: 32, dmg: 30, r: 42, xp: 60, tier: 'boss', color: '#ff4d6d', dark: '#6d0f24', unlock: 90 },
    // —— v2.4 新增怪物（各自带不同行为） ——
    scorpion: { key: 'scorpion', name: '毒尾蝎', hp: 16, speed: 52, dmg: 6, r: 11, xp: 2, tier: 'normal', color: '#c9a13b', dark: '#5c4716', poison: true, unlock: 0 },
    bat: { key: 'bat', name: '血翼蝠', hp: 5, speed: 126, dmg: 5, r: 7, xp: 1, tier: 'normal', color: '#a07bff', dark: '#3d2a63', unlock: 0 },
    healer: { key: 'healer', name: '女巫医', hp: 130, speed: 38, dmg: 5, r: 18, xp: 16, tier: 'elite', color: '#58d68d', dark: '#1c5c3a', heal: true, unlock: 0 },
    bomber: { key: 'bomber', name: '爆裂者', hp: 24, speed: 64, dmg: 26, r: 13, xp: 3, tier: 'normal', color: '#ff7a45', dark: '#7a2a10', boom: true, unlock: 0 },
  }

  /* ------------------------------------------------------------------ *
   * 波次构成（每一波刷哪些怪由这里决定）
   * n % 5 === 0 → BOSS 波；每 5 波一个大阶段，杂兵与血量都缓慢增长
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * 难度系统：新游戏时选择，重新开始沿用上次的难度
   * hp 怪物血量 / dmg 玩家造成伤害（<1 = 怪物受伤减免，封顶 80% 免伤）
   * spd 怪物移速 / freq 怪物攻击频率（>1 更勤快）/ xp 经验加成
   * count 怪物数量系数 / wave(仅屌炸天) 每波属性 +0.5%
   * ------------------------------------------------------------------ */
  var DIFFS = {
    // dr = 怪物受到玩家伤害时的减免率（封顶 80%）；edmg = 怪物造成的伤害倍数
    easy:   { id: 'easy',   name: '简单',   hp: 0.8,  dr: 0,    edmg: 0.9, spd: 0.9,  freq: 0.9,  xp: 1.2,  count: 0.85, grow: 0.03 },
    normal: { id: 'normal', name: '普通',   hp: 1,    dr: 0,    edmg: 1,   spd: 1,    freq: 1,    xp: 1,    count: 1,    grow: 0.05 },
    hard:   { id: 'hard',   name: '困难',   hp: 1.15, dr: 0.10, edmg: 1.1, spd: 1.05, freq: 1.05, xp: 1.15, count: 1.1,  grow: 0.07 },
    hell:   { id: 'hell',   name: '地狱',   hp: 1.3,  dr: 0.20, edmg: 1.2, spd: 1.1,  freq: 1.1,  xp: 1.4,  count: 1.2,  grow: 0.09 },
    night:  { id: 'night',  name: '噩梦',   hp: 1.4,  dr: 0.30, edmg: 1.3, spd: 1.2,  freq: 1.2,  xp: 1.5,  count: 1.35, grow: 0.11 },
    god:    { id: 'god',    name: '屌炸天', hp: 1.5,  dr: 0.30, edmg: 1.4, spd: 1.4,  freq: 1.3,  xp: 1.8,  count: 1.5, wave: 0.02, grow: 0.14 },
  }
  var DIFF_ORDER = ['easy', 'normal', 'hard', 'hell', 'night', 'god']
  function diffOf(id) { return DIFFS[id] || DIFFS.normal }

  /* 怪物等级：第 1 波 Lv.1，之后每波升 2 级（第 2 波 Lv.3、第 5 波 Lv.9…） */
  function monsterLv(n) { return 1 + 2 * (n - 1) }

  /* 实际生效的怪物等级：与玩家等级互差不超过 5 级（以玩家等级为中心钳制） */
  function lvFor(s, n) {
    var p = s && s.player
    if (!p) return monsterLv(n)
    var base = monsterLv(n)
    return Math.max(p.level - 5, Math.min(p.level + 5, base))
  }

  /* 怪物全属性等级成长（难度越高每级提升越多；f 为属性系数，移速用 0.25 抑制失控） */
  function growMul(d, lv, f) {
    var g = (d && d.grow) || 0
    return 1 + g * (f || 1) * (lv - 1)
  }

  /* BOSS 种类：每 5 波一波，数量随波数增加（封顶 20），每次生成随机一种 */
  var BOSS_KINDS = [
    { id: 'king',   name: '巨战王',   color: '#ff4d6d', accent: '#ffd166', hpM: 1.00, spdM: 1.00, rM: 1.00 }, // 扇形弹幕 + 冲撞
    { id: 'mage',   name: '水晶法师', color: '#c86bff', accent: '#e6d3ff', hpM: 0.85, spdM: 0.70, rM: 0.90 }, // 环形水晶弹
    { id: 'cannon', name: '重炮王',   color: '#ff9f43', accent: '#ffe1ad', hpM: 1.25, spdM: 0.85, rM: 1.10 }, // 慢速追踪炮弹
    { id: 'wraith', name: '影杀王',   color: '#43e0c8', accent: '#d8fff5', hpM: 0.90, spdM: 1.10, rM: 0.85 }, // 瞬移到玩家身边
    { id: 'titan',  name: '泰坦巨像', color: '#9fb6c9', accent: '#e8f0ff', hpM: 1.80, spdM: 0.55, rM: 1.35 }, // 慢速环形震荡波
    { id: 'plague', name: '瘟疫使者', color: '#7ce88d', accent: '#d8ffe0', hpM: 1.05, spdM: 0.80, rM: 1.00 }, // 抛掷毒云
    { id: 'brood',  name: '育母',     color: '#ff8fb0', accent: '#ffd6e6', hpM: 1.15, spdM: 0.90, rM: 1.05 }, // 定期孵化疾走虫
    { id: 'storm',  name: '风暴领主', color: '#59dcff', accent: '#d6f6ff', hpM: 0.95, spdM: 1.15, rM: 0.95 }, // 双发追踪闪电
  ]

  /* 玩家职业：每个职业初始武器与属性修正不同；解锁方式 = 初始 / 闯关成就 / 首页金币购买 */
  var CLASSES = {
    ranger:   { id: 'ranger',   name: '游侠', weapon: 'knife',   hp: 1.00, spd: 1.12, dmg: 0.00, pick: 0.00, regen: 0.0, killHeal: 0, unlock: { cost: 0 }, desc: '移速 +12% · 初始武器 飞刀（手动瞄准）',
      pal: { H: '#14663c', h: '#0d4a2b', C: '#3ddc84', c: '#1d9457' } },
    mage:     { id: 'mage',     name: '法师', weapon: 'bolt',    hp: 0.90, spd: 1.00, dmg: 0.12, pick: 0.00, regen: 0.0, killHeal: 0, unlock: { wave: 10 }, desc: '伤害 +12% · 血量 −10% · 初始武器 雷击',
      pal: { H: '#3b1d6e', h: '#2a1249', C: '#a07bff', c: '#6a43c9' } },
    guardian: { id: 'guardian', name: '守卫', weapon: 'aura',    hp: 1.40, spd: 0.92, dmg: 0.00, pick: 0.00, regen: 0.7, killHeal: 0, unlock: { cost: 600 }, desc: '血量 +40% · 移速 −8% · 每秒回 0.7 血 · 初始武器 灵光',
      pal: { H: '#173e5e', h: '#0f2c45', C: '#59b8ff', c: '#2a7ec4' } },
    assassin: { id: 'assassin', name: '刺客', weapon: 'orbit',   hp: 0.90, spd: 1.08, dmg: 0.06, pick: 0.00, regen: 0.0, killHeal: 2, unlock: { kills: 500 }, desc: '移速 +8% · 伤害 +6% · 每次击杀回 2 血 · 初始武器 旋刃',
      pal: { H: '#6e1f2e', h: '#4a121e', C: '#ff5f7a', c: '#c93350' } },
    hunter:   { id: 'hunter',   name: '猎人', weapon: 'missile', hp: 1.00, spd: 1.00, dmg: 0.00, pick: 0.40, regen: 0.0, killHeal: 0, unlock: { cost: 1200 }, desc: '拾取范围 +40% · 初始武器 追踪弹',
      pal: { H: '#6e5715', h: '#4e3d0d', C: '#ffce5c', c: '#c99a2e' } },
  }
  var CLASS_ORDER = ['ranger', 'mage', 'guardian', 'assassin', 'hunter']

  function jobOf(id) { return CLASSES[id] || CLASSES.ranger }

  function waveComposition(n, d) {
    d = d || DIFFS.normal
    var out = []
    if (n % 5 === 0) {
      // BOSS 数量 = 波数 / 5：第 5 波 1 只，之后每 5 波 +1
      // 传奇以下封顶 20 只；屌炸天无上限
      var bossN = d.id === 'god' ? n / 5 : Math.min(20, n / 5)
      var adds = 4 + bossN * 2
      for (var i = 0; i < bossN; i++) out.push('boss')
      for (var j = 0; j < adds; j++) out.push(j % 2 ? 'runner' : 'slime')
      return out
    }
    var slime = Math.round(Math.min(38, 12 + 2 * n) * d.count)          // 数量随难度
    var runner = n < 2 ? 0 : Math.round(Math.min(16, 2 + n) * d.count)
    var brute = n < 3 ? 0 : Math.round(Math.min(10, 1 + Math.floor((n - 3) / 2)) * d.count)
    var elite = n < 7 ? 0 : Math.round(Math.min(4, 1 + Math.floor((n - 7) / 3)) * d.count)
    var scor = n < 3 ? 0 : Math.round(Math.min(8, 1 + Math.floor((n - 3) / 3)) * d.count)   // 毒尾蝎
    var bat = n < 3 ? 0 : Math.round(Math.min(10, 3 + Math.floor(n / 3)) * d.count)         // 血翼蝠
    var boom = n < 5 ? 0 : Math.round(Math.min(6, 1 + Math.floor((n - 5) / 3)) * d.count)    // 爆裂者
    var heal = n < 15 ? 0 : Math.round(Math.min(2, 1 + Math.floor((n - 15) / 6)) * d.count)  // 女巫医（精英）
    for (var a = 0; a < slime; a++) out.push('slime')
    for (var b = 0; b < runner; b++) out.push('runner')
    for (var c = 0; c < brute; c++) out.push('brute')
    for (var d2 = 0; d2 < elite; d2++) out.push('elite')
    for (var s2 = 0; s2 < scor; s2++) out.push('scorpion')
    for (var b2 = 0; b2 < bat; b2++) out.push('bat')
    for (var o2 = 0; o2 < boom; o2++) out.push('bomber')
    for (var h2 = 0; h2 < heal; h2++) out.push('healer')
    return out
  }

  function waveScale(n, s) {
    // 缓慢加强：血量每波 +11%、伤害每波 +4.5%、移速每波 +1.2%（封顶 +50%）
    // 难度乘在血量/移速上；屌炸天额外每波 +0.5% 全属性
    // 怪物等级（每波升 2 级）带来全属性成长，成长率由难度决定
    var d = (s && s.diff) || DIFFS.normal
    var wb = d.wave ? 1 + d.wave * (n - 1) : 1
    var lv = lvFor(s, n)
    var gh = growMul(d, lv)         // 血量 / 伤害的等级成长（全额）
    var gs = growMul(d, lv, 0.25)   // 移速的等级成长（1/4 系数，总体封顶 2.4 倍）
    return {
      hp: (1 + 0.11 * (n - 1)) * d.hp * wb * gh,
      dmg: (1 + 0.045 * (n - 1)) * (d.edmg || 1) * wb * gh,
      spd: Math.min(2.4, Math.min(1.5, 1 + 0.012 * (n - 1)) * d.spd * gs),
      lv: lv,
    }
  }

  function waveXpMul(n, s) {
    // 经验随怪物等级（钳制后）增加：每级 +0.05
    return 1 + 0.05 * (lvFor(s, n) - 1)
  }

  /* ------------------------------------------------------------------ *
   * 商店升级表（金币购买，购买后永久生效，保存在 localStorage）
   * ------------------------------------------------------------------ */
  var SHOP = {
    armor: {
      key: 'armor', name: '战前护甲', icon: '🛡', max: 5,
      desc: '开局生命上限 +20，并回满生命',
      cost: function (l) { return 50 + l * 40 },
      line: function (l) { return '生命上限 +' + (20 * l) },
    },
    swift: {
      key: 'swift', name: '疾步', icon: '👟', max: 5,
      desc: '开局移动速度 +8%',
      cost: function (l) { return 60 + l * 45 },
      line: function (l) { return '移速 +' + (8 * l) + '%' },
    },
    sharp: {
      key: 'sharp', name: '锋利', icon: '⚔', max: 5,
      desc: '开局攻击力 +6%',
      cost: function (l) { return 80 + l * 60 },
      line: function (l) { return '攻击 +' + (6 * l) + '%' },
    },
    luck: {
      key: 'luck', name: '幸运硬币', icon: '🧲', max: 5,
      desc: '击杀金币掉落 +20%',
      cost: function (l) { return 100 + l * 80 },
      line: function (l) { return '金币 +' + (20 * l) + '%' },
    },
    revive: {
      key: 'revive', name: '复活甲', icon: '✚', max: 1,
      desc: '本局死亡时自动复活一次，恢复 50% 生命',
      cost: function () { return 150 },
      line: function (l) { return l > 0 ? '已装备' : '未装备' },
    },
    vigor: {
      key: 'vigor', name: '旺盛种子', icon: '🌱', max: 5,
      desc: '本局经验获取 +20%',
      cost: function (l) { return 90 + l * 65 },
      line: function (l) { return '经验 +' + (20 * l) + '%' },
    },
    greed: {
      key: 'greed', name: '贪婪契约', icon: '💰', max: 5,
      desc: '首页商店折扣 -8%（包括本商品）',
      cost: function (l) { return 70 + l * 55 },
      line: function (l) { return '折扣 -' + (8 * l) + '%' },
    },
    lowhp: {
      key: 'lowhp', name: '背水一战', icon: '🔥', max: 5,
      desc: '本局生命低于 35% 时伤害 +15%',
      cost: function (l) { return 110 + l * 80 },
      line: function (l) { return '低血伤害 +' + (15 * l) + '%' },
    },
  }

  /* 战斗商店（每 5 波出现一次，花本局金币）
   * 属性类商品：每买一次本局永久 +1%（重新开始后清零）
   * heal/shield 是回复类、不增加属性 → 保持原效果
   * GSHOP.level 记录本局各商品购买次数（用于计价与属性加成） */
  var GSHOP = {
    heal: {
      key: 'heal', name: '生命药水', icon: '🧪', base: 40,
      desc: '立即回满生命（不增加属性）',
      line: function () { return '当局有效 · 瞬间满血' },
    },
    shield: {
      key: 'shield', name: '临时护盾', icon: '🛡', base: 90,
      desc: '生命上限 +60 并回满（不增加属性）',
      line: function () { return '当局有效 · 最高叠加' },
    },
    rage: {
      key: 'rage', name: '狂暴', icon: '💢', base: 70,
      desc: '每买一次，本局攻击力永久 +1%',
      line: function (l) { return '本局攻击力 +' + l + '%' },
    },
    haste: {
      key: 'haste', name: '疾风', icon: '👟', base: 60,
      desc: '每买一次，本局移动速度永久 +1%',
      line: function (l) { return '本局移速 +' + l + '%' },
    },
    mag: {
      key: 'mag', name: '磁力', icon: '🧲', base: 50,
      desc: '每买一次，本局拾取范围永久 +1%',
      line: function (l) { return '本局拾取 +' + l + '%' },
    },
    // —— v2.5 新增商品 ——
    gward: {
      key: 'gward', name: '韧性', icon: '💒', base: 65,
      desc: '每买一次，本局受伤永久 -1%',
      line: function (l) { return '本局受伤 -' + l + '%' },
    },
    gxp: {
      key: 'gxp', name: '经验药剂', icon: '🧉', base: 55,
      desc: '每买一次，本局经验获取永久 +1%',
      line: function (l) { return '本局经验 +' + l + '%' },
    },
    gcoin: {
      key: 'gcoin', name: '金币护符', icon: '💠', base: 45,
      desc: '每买一次，本局金币掉落永久 +1%',
      line: function (l) { return '本局金币 +' + l + '%' },
    },
    bomb: {
      key: 'bomb', name: '清屏轰炸', icon: '💣', base: 120,
      desc: '立即对全屏敌人造成一次大范围伤害',
      line: function (l) { return '当局有效 · 清屏轰炸' },
    },
    slow: {
      key: 'slow', name: '时停', icon: '⏳', base: 100,
      desc: '全场敌人减速 60%，持续 6 秒',
      line: function (l) { return '当局有效 · 减速 6 秒' },
    },
  }
  var GSHOP_ORDER = ['heal', 'shield', 'rage', 'haste', 'mag', 'gward', 'gxp', 'gcoin', 'bomb', 'slow']

  function gCost(s, k) {
    var n = (s.gshop && s.gshop[k]) || 0
    return Math.round(GSHOP[k].base * (1 + 0.12 * Math.max(0, s.wave - 1)) * (1 + 0.6 * n))
  }
  function buyG(s, k) {
    var it = GSHOP[k]
    if (!it) return { ok: false, why: 'no' }
    var c = gCost(s, k)
    if (s.coins < c) return { ok: false, why: 'poor' }
    s.coins -= c
    if (k === 'heal') s.player.hp = s.player.maxHp
    else if (k === 'shield') { s.player.maxHp += 60; s.player.hp = s.player.maxHp }
    else if (k === 'bomb') {
      // 清屏轰炸：对视野内所有敌人造成一次大范围伤害
      damageInRadius(s, s.player.x, s.player.y, Math.max(s.view.w, s.view.h), 600 + 120 * s.wave, 'nova')
      s.effects.push({ kind: 'nova', x: s.player.x, y: s.player.y, r: 8, maxR: Math.max(s.view.w, s.view.h), life: 0.5, max: 0.5, hit: [] })
      s.camera.shake = 10
    }
    else if (k === 'slow') {
      s.slowT = Math.max(s.slowT || 0, 6)
    }
    else {
      // 属性类商品：本局购买次数 +1（refreshDerived 会计入永久 +1%）
      s.gshop[k] = (s.gshop[k] || 0) + 1
      s._needRefresh = true
    }
    return { ok: true, cost: c }
  }
  function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1) }

  function baseEnemyList() {
    return ['slime', 'runner', 'brute', 'elite', 'boss']
  }

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */
  function create(opts) {
    opts = opts || {}
    var seed = opts.seed == null ? (Date.now() & 0xffffffff) : opts.seed >>> 0
    var rng = makeRng(seed)
    var view = opts.view || { w: 420, h: 780 }
    var up = opts.upgrades || {}
    var job = jobOf(opts.job)

    var startMaxHp = (100 + 20 * (up.armor || 0)) * job.hp
    var diff = diffOf(opts.diff)

    var s = {
      seed: seed,
      rng: rng,
      time: 0,
      over: false,
      paused: false,
      pending: 0,
      choiceList: null,
      view: { w: view.w, h: view.h },
      job: job.id,
      jobData: { killHeal: job.killHeal, hpM: job.hp },
      difficulty: diff.id,
      diff: diff,
      upgrades: { armor: up.armor | 0, swift: up.swift | 0, sharp: up.sharp | 0, luck: up.luck | 0, revive: up.revive | 0 },
      // 关闭自动打怪时，需要按住攻击键才开火（飞刀）；其余技能保留自动攻击
      autoFire: opts.autoFire !== false,
      // 手动模式下辅助瞄准锁定的敌人 id（渲染层用它画准星）
      aimLockId: 0,
      coins: 0,
      luckMul: 1 + 0.2 * (up.luck || 0),
      // 打怪掉落金币全局 +30%（用户要求），再叠财运被动与战斗商店加成
      coinMul: 1.3 * (1 + 0.15 * (up.fortune || 0)),
      // 战斗商店「时停」剩余时间
      slowT: 0,
      // 帧计数（相位优化用）
      frame: 0,
      vigorMul: 1 + 0.2 * (up.vigor || 0),
      lowHpMul: 1 + 0.15 * (up.lowhp || 0),
      revives: (up.revive || 0) > 0 ? 1 : 0,
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 13,
        hp: startMaxHp,
        maxHp: startMaxHp,
        level: 1,
        xp: 0,
        xpNeed: xpNeedFor(1),
        iframe: 0,
        face: 1,
        hurtFlash: 0,
        // 朝向（弧度），手动攻击时按这个方向打
        aim: 0,
        walkPhase: 0,
        speedBase: 172 * (1 + 0.08 * (up.swift || 0)) * job.spd,
        dmgBonus: 0.06 * (up.sharp || 0) + job.dmg,
        // 职业的拾取 / 回血 / 击杀回血加成（refreshDerived 里并入派生值）
        pickupBonus: job.pick,
        regenBonus: job.regen,
      },
      enemies: [],
      bullets: [],
      // 敌方子弹（精英水晶弹 / BOSS 弹幕）
      eBullets: [],
      gems: [],
      particles: [],
      texts: [],
      effects: [],
      weapons: {},
      weaponOrder: [],
      passives: { atk: 0, move: 0, hp: 0, cd: 0, pickup: 0, regen: 0, insight: 0, swift: 0, life: 0, crit: 0, grow: 0, thorn: 0, ward: 0, fortune: 0, blast: 0 },
      stats: { kills: 0, damage: 0, levels: 0, bosses: 0, maxCombo: 0 },
      camera: { x: 0, y: 0, shake: 0 },
      // 波次系统：wave 当前波（0 = 还没开始）；waveActive 是否在刷怪；
      // restLeft 波间休息倒计时；spawnQueue 本波待刷列表
      wave: 0,
      waveActive: false,
      restLeft: 1.2,
      spawnQueue: [],
      spawnClock: 0,
      waveBanner: 0,
      nextId: 1,
      orbitPhase: 0,
      buckets: [],
      order: [],
      bossRef: null,
      timeAlive: 0,
      // 每 5 波出现的战斗商店：wave 完成且为 5 的倍数时置为该波号（由 UI 层消费）
      shopWave: 0,
      // 战斗商店本局各属性商品的购买次数（每买一次本局永久 +1%，重新开始清零）
      gshop: { rage: 0, haste: 0, mag: 0, gward: 0, gxp: 0, gcoin: 0 },
    }

    // 初始武器（由职业决定；游侠 = 飞刀，其余职业用各自首发武器）
    var sw = job.weapon
    s.weapons[sw] = { level: 1, timer: 0.25 }
    s.weaponOrder.push(sw)
    s._needRefresh = true
    for (var i = 0; i < HASH_SIZE; i++) s.buckets.push([])
    refreshDerived(s)
    return s
  }

  function refreshDerived(s) {
    var p = s.player
    var pa = s.passives
    var up = s.upgrades || {}
    var gs = s.gshop || { rage: 0, haste: 0, mag: 0 }
    // 战斗商店属性商品：每买一次本局永久 +1%（rage 攻击 / haste 移速 / mag 拾取）
    p.dmgMul = 1 + 0.12 * pa.atk + (p.dmgBonus || 0) + 0.01 * gs.rage
    p.speedMul = 1 + 0.1 * pa.move + 0.08 * (pa.swift || 0) + 0.01 * gs.haste
    p.pickupMul = 1 + 0.45 * pa.pickup + 0.01 * gs.mag + (p.pickupBonus || 0)
    p.cdMul = Math.max(0.45, 1 - 0.08 * pa.cd)
    p.regen = 0.35 * pa.regen + (p.regenBonus || 0)
    var jd = s.jobData || { hpM: 1 }
    var wantMax = Math.round((100 + 10 * (p.level - 1) + 22 * pa.hp + 20 * (up.armor || 0)) * (jd.hpM || 1))
    if (wantMax !== p.maxHp) {
      var diff = wantMax - p.maxHp
      p.maxHp = wantMax
      if (diff > 0) p.hp = Math.min(p.maxHp, p.hp + diff)
      else p.hp = Math.min(p.hp, p.maxHp)
    }
    s._needRefresh = false
  }

  /* ------------------------------------------------------------------ *
   * 空间哈希
   * ------------------------------------------------------------------ */
  function hashKey(x, y) {
    var gx = Math.floor(x / CELL)
    var gy = Math.floor(y / CELL)
    return ((gx * 92837111) ^ (gy * 689287499)) & (HASH_SIZE - 1)
  }

  function buildGrid(s) {
    var b = s.buckets
    var i, j
    for (i = 0; i < HASH_SIZE; i++) {
      if (b[i].length) b[i].length = 0
    }
    var es = s.enemies
    for (i = 0; i < es.length; i++) {
      var e = es[i]
      if (e.hp <= 0) continue
      b[hashKey(e.x, e.y)].push(e)
    }
  }

  function forEachNear(s, x, y, radius, fn) {
    var b = s.buckets
    var gx0 = Math.floor((x - radius) / CELL)
    var gx1 = Math.floor((x + radius) / CELL)
    var gy0 = Math.floor((y - radius) / CELL)
    var gy1 = Math.floor((y + radius) / CELL)
    for (var gx = gx0; gx <= gx1; gx++) {
      for (var gy = gy0; gy <= gy1; gy++) {
        var bucket = b[((gx * 92837111) ^ (gy * 689287499)) & (HASH_SIZE - 1)]
        if (!bucket || !bucket.length) continue
        for (var i = 0; i < bucket.length; i++) fn(bucket[i], gx, gy)
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 伤害与死亡
   * ------------------------------------------------------------------ */
  function damageEnemy(s, e, amount, srcX, srcY, kind) {
    if (e.hp <= 0) return
    // 难度调节：怪物受到玩家伤害时的减免率（dr），封顶 80%
    var dr = s.diff ? Math.min(0.8, s.diff.dr || 0) : 0
    var pl = s.player
    var lm = pl.hp > 0 && pl.hp < pl.maxHp * 0.35 ? (s.lowHpMul || 1) : 1
    // 作弊码「我是91男演员」：攻击 +10%（持久化进存档）
    var ca = s.cheatAtk || 1
    var dmg = amount * pl.dmgMul * lm * ca * (1 - dr)
    var pc = s.passives.crit || 0
    var isCrit = pc > 0 && s.rng() < 0.07 * pc
    if (isCrit) dmg *= 1.6
    e.hp -= dmg
    e.flash = 0.12
    s.stats.damage += dmg
    if (kind !== 'aura' && s.rng() < 0.5) {
      pushText(s, e.x + (s.rng() - 0.5) * 10, e.y - e.r - 4, Math.round(dmg), isCrit || kind === 'crit' ? '#ffd166' : '#ffffff', 0.55)
    }
    if (e.hp <= 0) killEnemy(s, e)
  }

  function killEnemy(s, e) {
    s.stats.kills++
    // 职业击杀回血（刺客每次 +2）
    var jh = s.jobData && s.jobData.killHeal ? s.jobData.killHeal : 0
    var lh = 1.5 * (s.passives.life || 0)
    if (jh + lh > 0) {
      var ph = s.player
      if (ph.hp > 0) ph.hp = Math.min(ph.maxHp, ph.hp + jh + lh)
    }
    if (e.type === 'boss') s.stats.bosses++
    // 掉落金币（基础 +30%：全局掉落倍率；财运被动再叠加）
    var coin = e.type === 'boss' ? 60 : e.type === 'elite' ? 15 : e.type === 'brute' ? 3 : 1
    var coinG = s.gshop && s.gshop.gcoin ? 1 + 0.01 * s.gshop.gcoin : 1
    var coinMul = (s.coinMul || 1) * s.luckMul * coinG
    var got = Math.round(coin * coinMul)
    s.coins += got
    // 爆裂被动：击杀时小范围爆炸
    var pb = s.passives.blast || 0
    if (pb > 0 && e.type !== 'boss') {
      damageInRadius(s, e.x, e.y, 58 + 22 * pb, 22 + 16 * pb, 'blast')
    }
    // 掉落经验：普通低 / 精英中 / BOSS 高，随波数加成（每波 +0.1），总体再 +50%
    var gems = e.type === 'boss' ? 6 : e.type === 'elite' ? 3 : e.type === 'brute' ? 2 : 1
    var per = (e.xp * waveXpMul(s.wave, s) * 1.5) / gems
    // 性能：场上宝石封顶（绕圈风筝时容易堆积），超出的旧宝石直接折算经验，不浪费
    if (s.gems.length > GEM_CAP) {
      var dropped = s.gems.splice(0, s.gems.length - GEM_SLICE)
      for (var qi = 0; qi < dropped.length; qi++) gainXp(s, dropped[qi].value)
    }
    if (s.gems.length > GEM_CAP) {
      for (var qi = 0, qn = s.gems.splice(0, s.gems.length - GEM_SLICE); qi < qn; qi++) {
        gainXp(s, s.gems.shift ? 0 : 0) // placeholder（下面用真正循环）
      }
    }
    for (var i = 0; i < gems; i++) {
      var a = s.rng() * TAU
      // 散落幅度小一些：落在敌人死亡处附近，玩家走进 50 拾取范围即可吃到
      var sp = 8 + s.rng() * 22
      s.gems.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        value: per,
        r: e.type === 'boss' ? 6 : 4,
        big: e.type === 'boss' || e.type === 'elite',
      })
    }
    spawnParticles(s, e.x, e.y, e.color, e.type === 'boss' ? 26 : e.type === 'elite' ? 14 : 5)
    s.camera.shake = Math.min(9, s.camera.shake + (e.type === 'boss' ? 8 : e.type === 'elite' ? 3 : 0.4))
    if (e.type === 'boss') {
      s.bossRef = null
      // 击杀 BOSS：血量直接回满
      s.player.hp = s.player.maxHp
      // 击杀 BOSS 强制升一级：直接给一级（不通过经验），触发三选一
      s.player.level++
      s.stats.levels++
      s.player.xpNeed = xpNeedFor(s.player.level)
      s.pending++
      s.paused = true
      pushText(s, s.player.x, s.player.y - 58, 'BOSS 击杀！强 制 升 级', '#ffce5c', 2.2)
    }
  }

  function spawnParticles(s, x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = s.rng() * TAU
      var sp = 40 + s.rng() * 190
      s.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.32 + s.rng() * 0.36,
        max: 0.68,
        r: 1.6 + s.rng() * 2.6,
        color: color,
      })
    }
    if (s.particles.length > 520) s.particles.splice(0, s.particles.length - 520)
  }

  function pushText(s, x, y, value, color, life) {
    s.texts.push({ x: x, y: y, value: value, color: color || '#fff', life: life || 0.6, max: life || 0.6 })
    if (s.texts.length > 56) s.texts.shift()
  }

  function hurtPlayer(s, dmg, extra) {
    var p = s.player
    if (p.iframe > 0 || s.over) return
    // 庇护被动：受伤 -6%/级
    var pw = s.passives.ward || 0
    if (pw > 0) dmg = dmg * (1 - Math.min(0.6, 0.06 * pw))
    // 战斗商店「韧性」：本局永久受伤 -1%/次
    var gw = s.gshop && s.gshop.gward ? s.gshop.gward : 0
    if (gw > 0) dmg = dmg * (1 - Math.min(0.5, 0.01 * gw))
    p.hp -= dmg
    // 荆棘被动：受击时身边敌人反伤
    var pt = s.passives.thorn || 0
    if (pt > 0) damageInRadius(s, p.x, p.y, 140 + 26 * pt, 26 + 22 * pt, 'thorn')
    p.iframe = 0.72
    p.hurtFlash = 0.35
    // 毒尾蝎：命中附带持续毒伤（3 秒，每 0.5s 掉 1 点）
    if (extra && extra.poison) p.poison = Math.max(p.poison || 0, extra.poison)
    s.camera.shake = Math.min(12, s.camera.shake + 5)
    pushText(s, p.x, p.y - 24, '-' + Math.round(dmg), '#ff6b81', 0.7)
    if (p.hp <= 0) {
      if (s.revives > 0) {
        // 复活甲：清场 + 回复 50% 生命 + 短暂无敌
        s.revives--
        p.hp = Math.round(p.maxHp * 0.5)
        p.iframe = 2.4
        p.hurtFlash = 0
        damageInRadius(s, p.x, p.y, 320, 900, 'nova')
        s.effects.push({ kind: 'nova', x: p.x, y: p.y, r: 8, maxR: 330, life: 0.5, max: 0.5, hit: [] })
        s.camera.shake = 10
        pushText(s, p.x, p.y - 30, '复活', '#ffce5c', 1.2)
        return
      }
      p.hp = 0
      s.over = true
    }
  }

  /* ------------------------------------------------------------------ *
   * 刷怪（波次驱动）
   * ------------------------------------------------------------------ */
  function spawnEnemy(s, typeKey, ringScale) {
    var def = ENEMIES[typeKey]
    var sc = waveScale(s.wave, s)
    var hpMul = sc.hp
    var dmgMul = sc.dmg
    // 作弊码「这些怪怎么这么垃圾？」：全难度怪物 HP/伤害 +80%，每过一波全属性 +4%
    var cm = s.cheatMon
    var cwave = 1
    if (cm) {
      hpMul *= cm.hp
      dmgMul *= cm.dmg
      cwave = Math.pow(1 + cm.wave, Math.max(0, s.wave - 1))
      hpMul *= cwave
      dmgMul *= cwave
    }
    // 攻击频率：难度越高冷却越短（freq>1 → atkCd 缩短）
    var freqI = 1 / (s.diff.freq || 1)
    // BOSS 波的 BOSS 每 5 波额外加血
    if (def.key === 'boss' && s.wave > 5) hpMul *= 1 + 0.35 * (s.wave / 5 - 1)
    var spawnR = (ringScale || 1) * (Math.max(s.view.w, s.view.h) * 0.38 + 40)
    var a = s.rng() * TAU
    var x = s.player.x + Math.cos(a) * spawnR
    var y = s.player.y + Math.sin(a) * spawnR
    var spdMul = sc.spd * (cm ? cm.spd * cwave : 1)
    var e = {
      id: s.nextId++,
      type: def.key,
      x: x,
      y: y,
      hp: def.hp * hpMul,
      maxHp: def.hp * hpMul,
      r: def.r,
      speed: def.speed * spdMul,
      dmg: def.dmg * dmgMul,
      xp: def.xp,
      tier: def.tier || 'normal',
      color: def.color,
      dark: def.dark,
      kx: 0,
      ky: 0,
      flash: 0,
      auraCd: 0,
      orbitCd: 0,
      hitBy: null,
      wob: s.rng() * TAU,
      boss: def.key === 'boss',
      kind: null,
      // 攻击行为：atkCd 攻击冷却 / wind 蓄力计时 / charge 冲刺计时 / cdx,cdy 冲刺方向
      // dashCd/windD/dash 是 BOSS 冲撞三段；tele 是影杀王瞬移前的蓄力
      freqI: freqI,
      lv: sc.lv,
      atkCd: (def.key === 'runner' ? 2 + s.rng() * 3 : def.key === 'elite' ? 1.6 + s.rng() * 2 : def.key === 'healer' ? 2 : def.key === 'boss' ? 2.2 : def.key === 'bat' ? 1.6 + s.rng() * 2 : def.key === 'bomber' ? 0 : 2 + s.rng()) * freqI,
      wind: 0,
      charge: 0,
      cdx: 0,
      cdy: 0,
      dashCd: (def.key === 'boss' ? 5 + s.rng() * 2 : 0) * freqI,
      windD: 0,
      dash: 0,
      tele: 0,
      healFlash: 0,
    }
    if (e.boss) {
      // BOSS 种类每次生成随机选取（8 种轮一样出，属性按种类倍率）
      var bk = BOSS_KINDS[Math.floor(s.rng() * BOSS_KINDS.length)]
      e.kind = bk.id
      e.color = bk.color
      e.bossName = bk.name
      e.maxHp = e.maxHp * bk.hpM
      e.hp = e.maxHp
      e.r = e.r * bk.rM
      e.speed = e.speed * bk.spdM
    }
    s.enemies.push(e)
    if (def.key === 'boss') {
      s.bossRef = e
      s.camera.shake = Math.min(10, s.camera.shake + 3)
    }
    return e
  }

  function startWave(s, n) {
    s.wave = n
    var list = waveComposition(n, s.diff)
    // 打乱出场顺序（BOSS 固定最后登场；可能不止一只）
    var bosses = []
    list = list.filter(function (t) {
      if (t === 'boss') { bosses.push('boss'); return false }
      return true
    })
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(s.rng() * (i + 1))
      var tmp = list[i]
      list[i] = list[j]
      list[j] = tmp
    }
    for (var b = 0; b < bosses.length; b++) list.push(bosses[b])
    var interval = Math.max(0.18, 0.34 - n * 0.004)
    s.spawnQueue = list.map(function (t, idx) {
      return { type: t, delay: idx === 0 ? 0.6 : interval }
    })
    s.waveActive = true
    s.spawnClock = 0
    s.waveBanner = 2.6
  }

  /* ------------------------------------------------------------------ *
   * 武器开火
   * ------------------------------------------------------------------ */
  function nearestEnemy(s, x, y, maxDist) {
    var best = null
    var bestD = maxDist * maxDist
    var es = s.enemies
    for (var i = 0; i < es.length; i++) {
      var e = es[i]
      if (e.hp <= 0) continue
      var dx = e.x - x
      var dy = e.y - y
      var d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  function fireKnife(s) {
    var w = s.weapons.knife
    var st = WEAPONS.knife.stat(w.level)
    var p = s.player
    var target = nearestEnemy(s, p.x, p.y, 1300)
    // 辅助瞄准：飞刀永远锁定最近敌人；周围没有敌人时不出手（不朝面向方向空掷）
    if (!target) return
    var baseA = Math.atan2(target.y - p.y, target.x - p.x)
    for (var i = 0; i < st.count; i++) {
      var off = (i - (st.count - 1) / 2) * st.spread
      var a = baseA + off
      s.bullets.push({
        kind: 'knife',
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * st.speed,
        vy: Math.sin(a) * st.speed,
        r: 6,
        dmg: st.dmg,
        pierce: st.pierce,
        life: 1.5,
        hits: [],
        angle: a,
      })
    }
  }

  function fireBolt(s) {
    var w = s.weapons.bolt
    var st = WEAPONS.bolt.stat(w.level)
    for (var i = 0; i < st.strikes; i++) {
      var candidates = []
      var es = s.enemies
      for (var j = 0; j < es.length; j++) {
        var e = es[j]
        if (e.hp <= 0) continue
        var dx = e.x - s.player.x
        var dy = e.y - s.player.y
        if (dx * dx + dy * dy <= st.range * st.range) candidates.push(e)
      }
      if (!candidates.length) return
      var target = candidates[Math.floor(s.rng() * candidates.length)]
      var tx = target.x
      var ty = target.y
      s.effects.push({ kind: 'bolt', x: tx, y: ty, r: st.radius, life: 0.28, max: 0.28 })
      damageInRadius(s, tx, ty, st.radius, st.dmg, 'bolt')
      s.camera.shake = Math.min(8, s.camera.shake + 1.4)
    }
  }

  function damageInRadius(s, x, y, radius, dmg, kind) {
    var list = s.order
    list.length = 0
    forEachNear(s, x, y, radius, function (e) {
      var dx = e.x - x
      var dy = e.y - y
      if (dx * dx + dy * dy <= (radius + e.r) * (radius + e.r)) list.push(e)
    })
    for (var i = 0; i < list.length; i++) damageEnemy(s, list[i], dmg, x, y, kind)
  }

  function fireMissile(s) {
    var w = s.weapons.missile
    var st = WEAPONS.missile.stat(w.level)
    var p = s.player
    for (var i = 0; i < st.count; i++) {
      var a = s.rng() * TAU
      s.bullets.push({
        kind: 'missile',
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * st.speed * 0.5,
        vy: Math.sin(a) * st.speed * 0.5,
        r: 6,
        dmg: st.dmg,
        pierce: 1,
        life: 3.2,
        hits: [],
        homing: true,
        speed: st.speed,
        turn: st.turn,
        boom: st.boom,
        targetId: 0,
        angle: a,
      })
    }
  }

  function fireNova(s) {
    var w = s.weapons.nova
    var st = WEAPONS.nova.stat(w.level)
    s.effects.push({ kind: 'nova', x: s.player.x, y: s.player.y, r: 8, maxR: st.radius, life: 0.45, max: 0.45, hit: [] })
    s.camera.shake = Math.min(10, s.camera.shake + 2.6)
  }

  // —— v2.5 新武器发射逻辑 ——
  function fireShard(s) {
    var w = s.weapons.shard
    var st = WEAPONS.shard.stat(w.level)
    var p = s.player
    var target = nearestEnemy(s, p.x, p.y, 1300)
    if (!target) return
    var baseA = Math.atan2(target.y - p.y, target.x - p.x)
    for (var i = 0; i < st.count; i++) {
      var off = (i - (st.count - 1) / 2) * st.spread
      var a = baseA + off
      s.bullets.push({
        kind: 'shard', x: p.x, y: p.y,
        vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
        r: 5, dmg: st.dmg, pierce: st.pierce, life: 1.2, hits: [], angle: a,
      })
    }
  }

  function fireChain(s) {
    var w = s.weapons.chain
    var st = WEAPONS.chain.stat(w.level)
    var p = s.player
    var from = { x: p.x, y: p.y }
    var cur = nearestEnemy(s, from.x, from.y, st.range)
    if (!cur) return
    var segs = [{ x: from.x, y: from.y }, { x: cur.x, y: cur.y }]
    var hit = [cur.id]
    damageEnemy(s, cur, st.dmg, from.x, from.y, 'chain')
    var prev = cur
    for (var j = 0; j < st.jumps - 1; j++) {
      var next = null
      forEachNear(s, prev.x, prev.y, st.jumpR, function (e) {
        if (e.hp <= 0) return
        if (hit.indexOf(e.id) >= 0) return
        if (!next) next = e
      })
      if (!next) break
      hit.push(next.id)
      damageEnemy(s, next, st.dmg * 0.75, prev.x, prev.y, 'chain')
      segs.push({ x: next.x, y: next.y })
      prev = next
    }
    s.effects.push({ kind: 'chain', segs: segs, life: 0.3, max: 0.3 })
  }

  function fireRain(s) {
    var w = s.weapons.rain
    var st = WEAPONS.rain.stat(w.level)
    var p = s.player
    var tries = 0
    var spots = []
    var anchor = nearestEnemy(s, p.x, p.y, 900)
    for (var v = 0; v < st.volleys; v++) {
      var x, y
      if (anchor && v === 0) {
        x = anchor.x
        y = anchor.y
      } else {
        var t = nearestEnemy(s, p.x + (s.rng() - 0.5) * 600, p.y + (s.rng() - 0.5) * 600, 1100)
        if (t) { x = t.x; y = t.y }
        else { x = p.x + (s.rng() - 0.5) * 700; y = p.y + (s.rng() - 0.5) * 700 }
      }
      spots.push({ x: x, y: y })
    }
    for (var i2 = 0; i2 < spots.length; i2++) {
      s.effects.push({ kind: 'rain', x: spots[i2].x, y: spots[i2].y, r: st.radius, delay: st.delay, dmg: st.dmg, life: st.delay + 0.5, done: false })
    }
  }

  function fireLaser(s) {
    var w = s.weapons.laser
    var st = WEAPONS.laser.stat(w.level)
    var a0 = s.rng() * TAU
    s.effects.push({
      kind: 'laser', x: s.player.x, y: s.player.y, a0: a0, len: st.len,
      width: st.width, dps: st.dps, sweep: st.sweep, life: st.sweep, max: st.sweep, tick: 0,
    })
  }

  function canFire(s, manualW) {
    // 自动模式：所有武器自动开火。
    // 手动模式：只有飞刀（manual:true）需要按住攻击键，其余技能保留自动攻击。
    return s.autoFire || !manualW || !!s.fireHeld
  }

  function updateWeapons(s, dt) {
    var p = s.player
    // 手动模式辅助瞄准：锁定最近敌人，人物与飞刀都朝它瞄准（不再朝面向方向打）
    var lock = null
    if (!s.autoFire) {
      lock = nearestEnemy(s, p.x, p.y, 1300)
      if (lock) p.aim = Math.atan2(lock.y - p.y, lock.x - p.x)
    }
    s.aimLockId = lock ? lock.id : 0
    var shootKnife = canFire(s, true)   // 飞刀：手动模式需按攻击键
    var shootAuto = canFire(s, false)   // 雷击/追踪弹/冲击波：始终自动
    // 飞刀
    if (s.weapons.knife) {
      var w = s.weapons.knife
      var st = WEAPONS.knife.stat(w.level)
      w.timer -= dt
      if (shootKnife && w.timer <= 0) {
        w.timer = st.cd * p.cdMul
        fireKnife(s)
      }
    }
    // 雷击
    if (s.weapons.bolt) {
      var wb = s.weapons.bolt
      var stb = WEAPONS.bolt.stat(wb.level)
      wb.timer -= dt
      if (shootAuto && wb.timer <= 0) {
        wb.timer = stb.cd * p.cdMul
        fireBolt(s)
      }
    }
    // 追踪弹
    if (s.weapons.missile) {
      var wm = s.weapons.missile
      var stm = WEAPONS.missile.stat(wm.level)
      wm.timer -= dt
      if (shootAuto && wm.timer <= 0) {
        wm.timer = stm.cd * p.cdMul
        fireMissile(s)
      }
    }
    // 冲击波
    if (s.weapons.nova) {
      var wn = s.weapons.nova
      var stn = WEAPONS.nova.stat(wn.level)
      wn.timer -= dt
      if (shootAuto && wn.timer <= 0) {
        wn.timer = stn.cd * p.cdMul
        fireNova(s)
      }
    }
    // 旋刃（环绕）
    if (s.weapons.orbit) {
      var wo = s.weapons.orbit
      var sto = WEAPONS.orbit.stat(wo.level)
      s.orbitPhase += sto.spin * dt
      var blades = sto.blades
      for (var b = 0; b < blades; b++) {
        var a = s.orbitPhase + (b * TAU) / blades
        var bx = p.x + Math.cos(a) * sto.radius
        var by = p.y + Math.sin(a) * sto.radius
        damageInRadius(s, bx, by, 16, sto.dmg * dt * 3.2, 'orbit')
      }
    }
    // 灵光（光环）
    if (s.weapons.aura) {
      var wa = s.weapons.aura
      var sta = WEAPONS.aura.stat(wa.level)
      damageInRadius(s, p.x, p.y, sta.radius, sta.dps * dt, 'aura')
    }
    // —— v2.5 新武器 ——
    if (s.weapons.shard) {
      var wsd = s.weapons.shard
      var stsd = WEAPONS.shard.stat(wsd.level)
      wsd.timer -= dt
      if (shootAuto && wsd.timer <= 0) { wsd.timer = stsd.cd * p.cdMul; fireShard(s) }
    }
    if (s.weapons.chain) {
      var wc = s.weapons.chain
      var stc = WEAPONS.chain.stat(wc.level)
      wc.timer -= dt
      if (shootAuto && wc.timer <= 0) { wc.timer = stc.cd * p.cdMul; fireChain(s) }
    }
    if (s.weapons.rain) {
      var wr = s.weapons.rain
      var str = WEAPONS.rain.stat(wr.level)
      wr.timer -= dt
      if (shootAuto && wr.timer <= 0) { wr.timer = str.cd * p.cdMul; fireRain(s) }
    }
    if (s.weapons.laser) {
      var wl = s.weapons.laser
      var stl = WEAPONS.laser.stat(wl.level)
      wl.timer -= dt
      if (shootAuto && wl.timer <= 0) { wl.timer = stl.cd * p.cdMul; fireLaser(s) }
    }
  }

  /* ------------------------------------------------------------------ *
   * 子弹更新
   * ------------------------------------------------------------------ */
  function updateBullets(s, dt) {
    var bs = s.bullets
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i]
      b.life -= dt
      if (b.homing) {
        var target = null
        var es = s.enemies
        var bestD = 1e9
        for (var j = 0; j < es.length; j++) {
          var e = es[j]
          if (e.hp <= 0) continue
          var dx0 = e.x - b.x
          var dy0 = e.y - b.y
          var d0 = dx0 * dx0 + dy0 * dy0
          if (d0 < bestD) {
            bestD = d0
            target = e
          }
        }
        if (target) {
          var wantA = Math.atan2(target.y - b.y, target.x - b.x)
          var curA = Math.atan2(b.vy, b.vx)
          var diff = ((wantA - curA + Math.PI * 3) % TAU) - Math.PI
          var turn = clamp(diff, -b.turn * dt, b.turn * dt)
          curA += turn
          var sp = Math.hypot(b.vx, b.vy)
          sp = Math.min(b.speed, sp + b.speed * 2.2 * dt)
          b.vx = Math.cos(curA) * sp
          b.vy = Math.sin(curA) * sp
          b.angle = curA
        }
      }
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.kind !== 'missile') b.angle = Math.atan2(b.vy, b.vx)

      // 命中检测
      var hit = false
      var bx = b.x
      var by = b.y
      var self = b
      forEachNear(s, bx, by, 24, function (e) {
        if (self.life <= 0 || self.pierce <= 0) return
        if (e.hp <= 0) return
        var dx = e.x - self.x
        var dy = e.y - self.y
        var rr = e.r + self.r
        if (dx * dx + dy * dy > rr * rr) return
        for (var h = 0; h < self.hits.length; h++) if (self.hits[h] === e.id) return
        self.hits.push(e.id)
        damageEnemy(s, e, self.dmg, self.x, self.y, self.kind)
        if (self.kind === 'missile') {
          s.effects.push({ kind: 'boom', x: self.x, y: self.y, r: 8, maxR: self.boom, life: 0.32, max: 0.32 })
          damageInRadius(s, self.x, self.y, self.boom, self.dmg * 0.55, 'boom')
          self.pierce = 0
        } else {
          self.pierce--
        }
        if (self.pierce <= 0) {
          self.life = 0
        }
      })
      if (b.life <= 0) hit = true
      if (hit) bs[i] = null
      if (Math.abs(b.x - s.player.x) > 2200 || Math.abs(b.y - s.player.y) > 2200) bs[i] = null
    }
    // 清理
    var write = 0
    for (var k = 0; k < bs.length; k++) {
      if (bs[k]) bs[write++] = bs[k]
    }
    bs.length = write
  }

  /* ------------------------------------------------------------------ *
   * 主循环
   * ------------------------------------------------------------------ */
  function step(s, dt, input) {
    if (s.over || s.paused) return
    // 兜底：血量见底但未经过 hurtPlayer（被外部直接改写 / 存档残留）时也要进入死亡结算，
    // 复活甲仍由 hurtPlayer 正常消耗，这里只在无复活甲时强制 over。
    if (s.player && s.player.hp <= 0 && !(s.revives > 0)) {
      s.player.hp = 0
      s.over = true
      return
    }
    dt = clamp(dt || 0, 0, 0.05)
    if (dt <= 0) return

    if (s._needRefresh) refreshDerived(s)

    s.time += dt
    s.frame++
    var p = s.player

    // ---- 输入 & 移动 ----
    var ix = input && input.x ? input.x : 0
    var iy = input && input.y ? input.y : 0
    var firing = !!(input && input.fire)
    var m = Math.hypot(ix, iy)
    if (m > 1) {
      ix /= m
      iy /= m
      m = 1
    }
    var sp = p.speedBase * p.speedMul
    p.vx = ix * sp
    p.vy = iy * sp
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (Math.abs(p.vx) > 1 || Math.abs(p.vy) > 1) {
      p.face = p.vx > 0 ? 1 : -1
      p.aim = Math.atan2(p.vy, p.vx)
      p.walkPhase += dt * 9
    }
    if (p.iframe > 0) p.iframe -= dt
    if (p.hurtFlash > 0) p.hurtFlash -= dt
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt)
    // 毒伤：每 0.5s 掉 1 点，直到持续时间结束（用 poisonT 累计）
    if (p.poison > 0) {
      p.poison -= dt
      p.poisonT = (p.poisonT || 0) + dt
      if (p.poisonT >= 0.5) {
        p.poisonT -= 0.5
        p.hp -= 1
        pushText(s, p.x + (s.rng() - 0.5) * 8, p.y - 20, '毒', '#7ce88d', 0.5)
        if (p.hp <= 0) hurtPlayer(s, p.hp) // 毒死也走复活甲 / 结算
      }
    }
    s.fireHeld = firing

    // ---- 摄像机 ----
    var cam = s.camera
    cam.x += (p.x - cam.x) * Math.min(1, dt * 9)
    cam.y += (p.y - cam.y) * Math.min(1, dt * 9)
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 26)

    // ---- 波次推进 ----
    buildGrid(s)
    var cap = 220
    if (s.waveBanner > 0) s.waveBanner -= dt
    if (!s.waveActive) {
      // 波间休息：倒计时结束后开下一波
      s.restLeft -= dt
      if (s.restLeft <= 0) startWave(s, s.wave + 1)
    } else if (s.spawnQueue.length) {
      s.spawnClock -= dt
      while (s.spawnQueue.length && s.spawnClock <= 0) {
        var next = s.spawnQueue.shift()
        spawnEnemy(s, next.type, 1)
        if (s.spawnQueue.length) s.spawnClock = s.spawnQueue[0].delay
      }
    } else {
      // 队列空了，并且场上没有活敌 → 本波结束，进入 10 秒休息
      var aliveN = 0
      var es0 = s.enemies
      for (var ai = 0; ai < es0.length; ai++) if (es0[ai].hp > 0) aliveN++
      if (aliveN === 0) {
        s.waveActive = false
        s.restLeft = 10
        if (s.wave % 5 === 0) s.shopWave = s.wave
        // 每清完一波保底升一级：直接给一级（不通过经验），触发三选一
        p.level++
        s.stats.levels++
        p.xpNeed = xpNeedFor(p.level)
        s.pending++
        s.paused = true
        pushText(s, p.x, p.y - 46, '第 ' + s.wave + ' 波完成 · 保底升级', '#ffce5c', 1.6)
      }
    }

    // ---- 敌人 ----
    var es = s.enemies
    var i, e
    for (i = 0; i < es.length; i++) {
      e = es[i]
      if (e.hp <= 0) continue
      var dx = p.x - e.x
      var dy = p.y - e.y
      var d = Math.hypot(dx, dy) || 1
      // 追击
      var chaseX = (dx / d) * e.speed
      var chaseY = (dy / d) * e.speed
      // 分离（避免完全重叠）
      var sepX = 0
      var sepY = 0
      var self2 = e
      forEachNear(s, e.x, e.y, 30, function (o) {
        if (o === self2 || o.hp <= 0) return
        var ox = self2.x - o.x
        var oy = self2.y - o.y
        var od = Math.hypot(ox, oy)
        var need = self2.r + o.r
        if (od > 0.001 && od < need) {
          var push = ((need - od) / need) * 60
          sepX += (ox / od) * push
          sepY += (oy / od) * push
        }
      })
      // ---- 特殊攻击 ----
      // 疾走虫：接近后蓄力 0.55s，朝当时玩家方向直线冲刺（速度 ×3.2，1.1s）
      if (e.type === 'runner') {
        if (e.wind > 0) {
          chaseX *= 0.35
          chaseY *= 0.35
          e.wind -= dt
          if (e.wind <= 0) {
            var ca = Math.atan2(dy, dx)
            e.cdx = Math.cos(ca)
            e.cdy = Math.sin(ca)
            e.charge = 1.1
          }
        } else if (e.charge > 0) {
          e.charge -= dt
          chaseX = e.cdx * e.speed * 3.2
          chaseY = e.cdy * e.speed * 3.2
          if (e.charge <= 0) e.atkCd = 4.5 + s.rng() * 2
        } else {
          if (e.atkCd > 0) e.atkCd -= dt
          else if (d < 340 && d > 60) e.wind = 0.55
        }
      }
      // 幻晶精英：远程水晶弹（距离 90~560，2.4s 一发）
      if (e.type === 'elite') {
        if (e.atkCd > 0) e.atkCd -= dt
        else if (d < 560 && d > 90) {
          var ba = Math.atan2(dy, dx)
          ebPush(s, {
            x: e.x, y: e.y,
            vx: Math.cos(ba) * 170, vy: Math.sin(ba) * 170,
            r: 7, dmg: e.dmg * 0.75, life: 4, color: '#c86bff',
          })
          e.atkCd = 2.4
        }
      }
      // 血翼蝠：贴脸后俯冲（蓄力 0.35s → 0.8s ×2.4 速度），它血薄跑得快
      if (e.type === 'bat') {
        if (e.wind > 0) {
          e.wind -= dt
          chaseX *= 0.4
          chaseY *= 0.4
          if (e.wind <= 0) {
            var bca = Math.atan2(dy, dx)
            e.cdx = Math.cos(bca)
            e.cdy = Math.sin(bca)
            e.charge = 0.8
          }
        } else if (e.charge > 0) {
          e.charge -= dt
          chaseX = e.cdx * e.speed * 2.4
          chaseY = e.cdy * e.speed * 2.4
          if (e.charge <= 0) e.atkCd = 3.2 + s.rng() * 2
        } else {
          if (e.atkCd > 0) e.atkCd -= dt
          else if (d < 420) e.wind = 0.35
        }
      }
      // 女巫医（精英）：每 2s 给半径 150 内同伴回 5% 血，自己不怎么会打人
      if (e.type === 'healer') {
        if (e.healFlash > 0) e.healFlash -= dt
        if (e.atkCd > 0) {
          e.atkCd -= dt
        } else {
          var didHeal = false
          forEachNear(s, e.x, e.y, 150, function (oe) {
            if (oe === e || oe.hp <= 0 || oe.boss) return
            var odx = oe.x - e.x, ody = oe.y - e.y
            if (odx * odx + ody * ody < 150 * 150 && oe.hp < oe.maxHp) {
              oe.hp = Math.min(oe.maxHp, oe.hp + oe.maxHp * 0.05)
              oe.healFlash = 0.5
              didHeal = true
            }
          })
          if (didHeal) e.healFlash = 0.5
          e.atkCd = 2 * e.freqI
        }
      }
      // 爆裂者：钻到玩家 90px 内后 0.8s 自爆（105px 范围全额伤害，自己也算击杀）
      if (e.type === 'bomber') {
        if (e.wind > 0) {
          chaseX *= 0.5
          chaseY *= 0.5
          e.wind -= dt
          if (e.wind <= 0) {
            s.camera.shake = Math.min(12, s.camera.shake + 6)
            spawnParticles(s, e.x, e.y, e.color, 16)
            s.effects.push({ kind: 'nova', x: e.x, y: e.y, r: 8, maxR: 105, life: 0.4, max: 0.4, hit: [] })
            var bdx = p.x - e.x, bdy = p.y - e.y
            if (bdx * bdx + bdy * bdy < (105 + p.r) * (105 + p.r)) hurtPlayer(s, e.dmg)
            e.hp = 0
            killEnemy(s, e)
          }
        } else if (d < 90 + e.r + p.r) {
          e.wind = 0.8
          pushText(s, e.x, e.y - 16, '！', '#ffce5c', 0.7)
        }
      }
      // 毒尾蝎：突刺一下（蓄力 0.4s → 0.5s ×2.2），命中带毒
      if (e.type === 'scorpion') {
        if (e.wind > 0) {
          e.wind -= dt
          chaseX *= 0.4
          chaseY *= 0.4
          if (e.wind <= 0) {
            var sca = Math.atan2(dy, dx)
            e.cdx = Math.cos(sca)
            e.cdy = Math.sin(sca)
            e.charge = 0.5
          }
        } else if (e.charge > 0) {
          e.charge -= dt
          chaseX = e.cdx * e.speed * 2.2
          chaseY = e.cdy * e.speed * 2.2
          if (e.charge <= 0) e.atkCd = 3.6 + s.rng() * 2
        } else {
          if (e.atkCd > 0) e.atkCd -= dt
          else if (d < 300 && d > 60) e.wind = 0.4
        }
      }
      // ---- BOSS 攻击（八种种类，各自不同技能） ----
      if (e.boss) {
        var kind = e.kind || 'king'
        if (kind === 'king') {
          // 巨战王：扇形弹幕（3.2s）+ 周期冲撞（蓄力 0.8s → 冲刺 1s ×4.5）
          if (e.atkCd > 0) {
            e.atkCd -= dt
          } else {
            var baseA = Math.atan2(dy, dx)
            for (var kk = -2; kk <= 2; kk++) {
              var aa = baseA + kk * 0.28
              ebPush(s, {
                x: e.x, y: e.y,
                vx: Math.cos(aa) * 150, vy: Math.sin(aa) * 150,
                r: 9, dmg: e.dmg * 0.6, life: 5, color: '#ff4d6d',
              })
            }
            s.camera.shake = Math.min(10, s.camera.shake + 1.5)
            e.atkCd = 3.2 * e.freqI
          }
          if (e.dash > 0) {
            e.dash -= dt
            chaseX = e.cdx * e.speed * 4.5
            chaseY = e.cdy * e.speed * 4.5
            if (e.dash <= 0) e.dashCd = (7 + s.rng() * 3) * e.freqI
          } else if (e.windD > 0) {
            e.windD -= dt
            chaseX *= 0.12
            chaseY *= 0.12
            if (e.windD <= 0) {
              var da = Math.atan2(dy, dx)
              e.cdx = Math.cos(da)
              e.cdy = Math.sin(da)
              e.dash = 1.0
              s.camera.shake = Math.min(10, s.camera.shake + 3)
            }
          } else {
            if (e.dashCd > 0) e.dashCd -= dt
            else if (d < 720 && d > 120) e.windD = 0.8
          }
        } else if (kind === 'mage') {
          // 水晶法师：环形水晶弹（一圈 12 发，4s）
          if (e.atkCd > 0) {
            e.atkCd -= dt
            chaseX *= 0.7
            chaseY *= 0.7
          } else {
            var ringN = 12
            for (var ri = 0; ri < ringN; ri++) {
              var ra = (ri / ringN) * TAU + e.wob * 0.3
              ebPush(s, {
                x: e.x, y: e.y,
                vx: Math.cos(ra) * 130, vy: Math.sin(ra) * 130,
                r: 8, dmg: e.dmg * 0.55, life: 6, color: '#c86bff',
              })
            }
            s.camera.shake = Math.min(10, s.camera.shake + 1.5)
            e.atkCd = 4 * e.freqI
          }
          // 法师不冲撞，但受攻击会短距弹开保命
          if (e.tele > 0) {
            e.tele -= dt
            chaseX *= 0.2
            chaseY *= 0.2
          }
        } else if (kind === 'cannon') {
          // 重炮王：慢速追踪炮弹（2.6s 一发，速度 95，会拐弯追人）
          if (e.atkCd > 0) {
            e.atkCd -= dt
          } else {
            var ba2 = Math.atan2(dy, dx)
            ebPush(s, {
              x: e.x, y: e.y,
              vx: Math.cos(ba2) * 95, vy: Math.sin(ba2) * 95,
              r: 13, dmg: e.dmg * 0.85, life: 9, color: '#ff9f43',
              homing: true, turn: 2.2, hit: false,
            })
            s.camera.shake = Math.min(10, s.camera.shake + 2)
            e.atkCd = 2.6 * e.freqI
          }
          // 重炮王移速慢，但会挤压玩家（近距离不断推进）
          if (e.dash > 0) {
            e.dash -= dt
            chaseX = e.cdx * e.speed * 3.2
            chaseY = e.cdy * e.speed * 3.2
            if (e.dash <= 0) e.dashCd = (8 + s.rng() * 3) * e.freqI
          } else if (e.windD > 0) {
            e.windD -= dt
            chaseX *= 0.15
            chaseY *= 0.15
            if (e.windD <= 0) {
              var da2 = Math.atan2(dy, dx)
              e.cdx = Math.cos(da2)
              e.cdy = Math.sin(da2)
              e.dash = 0.9
              s.camera.shake = Math.min(10, s.camera.shake + 2.5)
            }
          } else {
            if (e.dashCd > 0) e.dashCd -= dt
            else if (d < 620 && d > 160) e.windD = 0.9
          }
        } else if (kind === 'wraith') {
          // 影杀王：蓄力 0.7s 后瞬移到玩家身后，近身刀刃风暴（8s 周期）
          if (e.tele > 0) {
            e.tele -= dt
            chaseX *= 0.05
            chaseY *= 0.05
            e.wob += dt * 14
            if (e.tele <= 0) {
              // 瞬移到玩家附近 100px 处（闪现到身后）
              var ta = s.rng() * TAU
              e.x = p.x + Math.cos(ta) * 110
              e.y = p.y + Math.sin(ta) * 110
              e.kx = 0
              e.ky = 0
              s.camera.shake = Math.min(10, s.camera.shake + 2.5)
            }
          } else if (e.atkCd > 0) {
            e.atkCd -= dt
            // 刀刃风暴：贴身时高速环绕
            if (d < 260) {
              var orba = Math.atan2(dy, dx) + Math.PI / 2
              chaseX = Math.cos(orba) * e.speed * 1.5
              chaseY = Math.sin(orba) * e.speed * 1.5
            }
          } else {
            if (d > 220 || s.rng() < 0.3) e.tele = 0.7
            e.atkCd = 1.6 * e.freqI
          }
        } else if (kind === 'titan') {
          // 泰坦巨像：走得很慢，每 3.4s 释放一圈慢速震荡大弹（半径大、伤害高，但走得慢可以躲）
          if (e.atkCd > 0) {
            e.atkCd -= dt
            chaseX *= 0.7
            chaseY *= 0.7
          } else {
            var ringN2 = 10
            for (var ti = 0; ti < ringN2; ti++) {
              var ta2 = (ti / ringN2) * TAU + e.wob * 0.2
              ebPush(s, {
                x: e.x, y: e.y,
                vx: Math.cos(ta2) * 85, vy: Math.sin(ta2) * 85,
                r: 16, dmg: e.dmg * 0.7, life: 6, color: '#9fb6c9',
              })
            }
            s.camera.shake = Math.min(10, s.camera.shake + 3)
            e.atkCd = 3.4 * e.freqI
          }
        } else if (kind === 'plague') {
          // 瘟疫使者：朝玩家抛毒云（慢速、大半径、短命，踩到就掉血）
          if (e.atkCd > 0) {
            e.atkCd -= dt
            chaseX *= 0.75
            chaseY *= 0.75
          } else if (d < 520) {
            var pa2 = Math.atan2(dy, dx)
            ebPush(s, {
              x: e.x, y: e.y,
              vx: Math.cos(pa2) * 55, vy: Math.sin(pa2) * 55,
              r: 26, dmg: e.dmg * 0.45, life: 3.2, color: '#7ce88d', slime: true,
            })
            e.atkCd = 2.4 * e.freqI
          }
        } else if (kind === 'brood') {
          // 育母：每 4s 在自己身周孵化 2 只疾走虫（场上敌人太多就不刷，留点活路）
          if (e.atkCd > 0) {
            e.atkCd -= dt
            chaseX *= 0.75
            chaseY *= 0.75
          } else {
            if (s.enemies.length < 160) {
              for (var bi2 = 0; bi2 < 2; bi2++) {
                var ne = spawnEnemy(s, 'runner', 0.35)
                if (ne) {
                  var ba3 = s.rng() * TAU
                  ne.x = e.x + Math.cos(ba3) * 46
                  ne.y = e.y + Math.sin(ba3) * 46
                  ne.hp = ne.maxHp * 0.6
                }
              }
              s.camera.shake = Math.min(10, s.camera.shake + 1.5)
            }
            e.atkCd = 4 * e.freqI
          }
        } else {
          // 风暴领主：双发追踪闪电球（会拐弯，速度快但伤害低）
          if (e.atkCd > 0) {
            e.atkCd -= dt
          } else {
            var sa = Math.atan2(dy, dx)
            for (var si2 = -1; si2 <= 1; si2 += 2) {
              var sa2 = sa + si2 * 0.28
              ebPush(s, {
                x: e.x, y: e.y,
                vx: Math.cos(sa2) * 120, vy: Math.sin(sa2) * 120,
                r: 9, dmg: e.dmg * 0.55, life: 5, color: '#59dcff',
                homing: true, turn: 1.6, hit: false,
              })
            }
            e.atkCd = 2.2 * e.freqI
          }
        }
      }

      e.kx *= 1 - Math.min(1, dt * 8)
      e.ky *= 1 - Math.min(1, dt * 8)
      var slowF = s.slowT > 0 ? 0.4 : 1
      e.x += (chaseX + sepX + e.kx) * slowF * dt
      e.y += (chaseY + sepY + e.ky) * slowF * dt
      if (e.flash > 0) e.flash -= dt
      if (e.auraCd > 0) e.auraCd -= dt

      var rr = e.r + p.r
      if (d < rr) hurtPlayer(s, e.dmg, e.poison ? { poison: 3 } : null)
    }

    // ---- 武器 ----
    buildGrid(s)
    updateWeapons(s, dt)

    // ---- 子弹 ----
    updateBullets(s, dt)

    // ---- 敌方子弹（精英水晶弹 / BOSS 弹幕 / 重炮王追踪炮弹） ----
    var eb = s.eBullets
    for (i = 0; i < eb.length; i++) {
      var b2 = eb[i]
      if (b2.homing) {
        // 追踪炮弹：每帧朝玩家转向（角速度 turn rad/s），速度不变
        var hd = Math.atan2(p.y - b2.y, p.x - b2.x)
        var cur = Math.atan2(b2.vy, b2.vx)
        var diff2 = hd - cur
        while (diff2 > Math.PI) diff2 -= TAU
        while (diff2 < -Math.PI) diff2 += TAU
        var maxTurn = b2.turn * dt
        if (diff2 > maxTurn) diff2 = maxTurn
        if (diff2 < -maxTurn) diff2 = -maxTurn
        var na = cur + diff2
        var sp2 = Math.hypot(b2.vx, b2.vy)
        b2.vx = Math.cos(na) * sp2
        b2.vy = Math.sin(na) * sp2
      }
      b2.x += b2.vx * dt
      b2.y += b2.vy * dt
      b2.life -= dt
      // 玩家子弹无法命中 / 击落怪物的子弹
      var bd = Math.hypot(p.x - b2.x, p.y - b2.y)
      if (bd < b2.r + p.r) {
        hurtPlayer(s, b2.dmg)
        b2.dead = true
      }
    }
    var ebw = 0
    for (i = 0; i < eb.length; i++) {
      if (!eb[i].dead && eb[i].life > 0) eb[ebw++] = eb[i]
    }
    eb.length = ebw

    // ---- 经验宝石（拾取范围内才吸附；初始范围 50，磁力被动可扩大） ----
    // 波间休息时全屏吸附：打完一波不用再绕回去捡
    var gemR = 50 * p.pickupMul
    var restVacuum = !s.waveActive
    var gs = s.gems
    for (i = 0; i < gs.length; i++) {
      var g = gs[i]
      g.x += g.vx * dt
      g.y += g.vy * dt
      g.vx *= 1 - Math.min(1, dt * 4)
      g.vy *= 1 - Math.min(1, dt * 4)
      var gdx = p.x - g.x
      var gdy = p.y - g.y
      var gd = Math.hypot(gdx, gdy)
      if (restVacuum && gd > 0.01) {
        // 全屏吸附：距离越远飞得越快
        var rsp = Math.min(1400, 260 + gd * 3.2)
        var rmv = Math.min(gd, rsp * dt)
        g.x += (gdx / gd) * rmv
        g.y += (gdy / gd) * rmv
      } else if (gd < gemR && gd > 0.01) {
        var gsp = gd < gemR * 0.7 ? 620 : 340
        var mv = Math.min(gd, gsp * dt)
        g.x += (gdx / gd) * mv
        g.y += (gdy / gd) * mv
      }
      if (gd < 18) {
        gainXp(s, g.value)
        g.dead = true
      }
    }
    var gw = 0
    for (i = 0; i < gs.length; i++) {
      if (!gs[i].dead) gs[gw++] = gs[i]
    }
    gs.length = gw

    // ---- 效果 ----
    var fx = s.effects
    for (i = 0; i < fx.length; i++) {
      var f = fx[i]
      f.life -= dt
      if (f.kind === 'nova') {
        f.r = f.maxR * (1 - Math.max(0, f.life) / f.max)
        // 逐帧范围内的敌人受到伤害（用 hit 去重）
        ;(function (ff) {
          forEachNear(s, ff.x, ff.y, ff.r + 30, function (ed) {
            if (ed.hp <= 0) return
            var ddx = ed.x - ff.x
            var ddy = ed.y - ff.y
            if (ddx * ddx + ddy * ddy <= (ff.r + ed.r) * (ff.r + ed.r)) {
              for (var hh = 0; hh < ff.hit.length; hh++) if (ff.hit[hh] === ed.id) return
              ff.hit.push(ed.id)
              var wnn = s.weapons.nova
              if (wnn) damageEnemy(s, ed, WEAPONS.nova.stat(wnn.level).dmg, ff.x, ff.y, 'nova')
            }
          })
        })(f)
      } else if (f.kind === 'rain') {
        // 箭雨落点：延迟后对范围内敌人瞬间打击一次
        if (f.delay > 0) {
          f.delay -= dt
          if (f.delay <= 0 && !f.done) {
            f.done = true
            damageInRadius(s, f.x, f.y, f.r, f.dmg, 'rain')
            s.camera.shake = Math.min(10, s.camera.shake + 1.2)
            f.life = 0.4
          }
        }
      } else if (f.kind === 'laser') {
        // 死光：旋转扫射期间持续伤害光束上的敌人
        var prog = 1 - Math.max(0, f.life) / f.max
        var a = f.a0 + f.sweep * TAU * prog * 0.55
        var c = Math.cos(a), sn = Math.sin(a)
        f.tick -= dt
        if (f.tick <= 0) {
          f.tick = 0.1
          forEachNear(s, f.x, f.y, f.len, function (e) {
            if (e.hp <= 0) return
            var dx = e.x - f.x, dy = e.y - f.y
            var px = dx * c + dy * sn
            var py = -dx * sn + dy * c
            if (px < 0 || px > f.len) return
            if (Math.abs(py) > f.width * 0.5 + e.r) return
            damageEnemy(s, e, f.dps * 0.1, f.x + px * c, f.y + px * sn, 'laser')
          })
        }
      }
    }
    var fw = 0
    for (i = 0; i < fx.length; i++) {
      if (fx[i].life > 0) fx[fw++] = fx[i]
    }
    fx.length = fw

    // ---- 粒子 / 飘字 ----
    var ps = s.particles
    for (i = 0; i < ps.length; i++) {
      var pa = ps[i]
      pa.life -= dt
      pa.x += pa.vx * dt
      pa.y += pa.vy * dt
      pa.vx *= 1 - Math.min(1, dt * 3)
      pa.vy *= 1 - Math.min(1, dt * 3)
    }
    var pw = 0
    for (i = 0; i < ps.length; i++) {
      if (ps[i].life > 0) ps[pw++] = ps[i]
    }
    ps.length = pw

    var ts = s.texts
    for (i = 0; i < ts.length; i++) {
      var tx = ts[i]
      tx.life -= dt
      tx.y -= 34 * dt
    }
    var tw = 0
    for (i = 0; i < ts.length; i++) {
      if (ts[i].life > 0) ts[tw++] = ts[i]
    }
    ts.length = tw

    // ---- 清理死亡敌人 & 太远的 ----
    var ew = 0
    for (i = 0; i < es.length; i++) {
      var en = es[i]
      if (en.hp <= 0) continue
      if (Math.abs(en.x - p.x) > 1900 || Math.abs(en.y - p.y) > 1900) {
        if (en.boss) s.bossRef = null
        continue
      }
      es[ew++] = en
    }
    es.length = ew

    if (s.over) s.timeAlive = s.time
  }

  // 每级所需经验：起步 100，每级 ×1.3（100 → 130 → 169 → 220 …），无上限
  function xpNeedFor(level) { return Math.round(100 * Math.pow(1.3, level - 1)) }

  function gainXp(s, amount) {
    var p = s.player
    // 悟性被动：经验获取 +30% / 级；难度倍率：地狱 +40% / 噩梦 +50% / 屌炸天 +80%
    var xpG = s.gshop && s.gshop.gxp ? 1 + 0.01 * s.gshop.gxp : 1
    var xmul = (s.diff ? s.diff.xp : 1) * (1 + 0.3 * s.passives.insight) * (s.vigorMul || 1) * xpG
    p.xp += amount * xmul
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed
      p.level++
      s.stats.levels++
      // 每升一级所需经验 ×1.3（无上限）
      p.xpNeed = xpNeedFor(p.level)
      s.pending++
      // 每升一级生命上限 +10，并回复这个差值（refreshDerived 顺带处理）
      refreshDerived(s)
      // 成长被动：升级时回复 10% 生命上限 / 级
      var pg = s.passives.grow || 0
      if (pg > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.10 * pg)
    }
    if (s.pending > 0) s.paused = true
  }

  /* ------------------------------------------------------------------ *
   * 升级选项
   * ------------------------------------------------------------------ */
  function candidates(s) {
    var out = []
    var slots = s.weaponOrder.length
    var i, k
    // 已有武器：无限强化（不再有满级卡死）
    for (i = 0; i < s.weaponOrder.length; i++) {
      k = s.weaponOrder[i]
      out.push({ id: 'w:' + k, kind: 'weapon_up', key: k, weight: 3.2 })
    }
    if (slots < WEAPON_ORDER.length) {
      for (i = 0; i < WEAPON_ORDER.length; i++) {
        k = WEAPON_ORDER[i]
        if (!WEAPONS[k] || s.weapons[k]) continue
        out.push({ id: 'n:' + k, kind: 'weapon_new', key: k, weight: 2.4 })
      }
    }
    // 被动：无限强化（不再有满级卡死）
    for (var pk in PASSIVES) {
      if (!PASSIVES.hasOwnProperty(pk)) continue
      out.push({ id: 'p:' + pk, kind: 'passive', key: pk, weight: 2.6 })
    }
    return out
  }

  function getChoices(s) {
    // 已抽过且仍未选完时，返回同一组卡（切后台 / 重进不刷新）
    if (s.choiceList && s.choiceList.length) {
      var out2 = []
      for (var ci = 0; ci < s.choiceList.length; ci++) {
        var c = describeChoice(s, s.choiceList[ci])
        if (c) out2.push(c)
      }
      if (out2.length) return out2
    }
    var pool = candidates(s)
    var picked = []
    var guard = 0
    while (picked.length < 5 && pool.length && guard++ < 200) {
      var total = 0
      for (var i = 0; i < pool.length; i++) total += pool[i].weight
      var roll = s.rng() * total
      var idx = 0
      for (var j = 0; j < pool.length; j++) {
        roll -= pool[j].weight
        if (roll <= 0) {
          idx = j
          break
        }
        idx = j
      }
      picked.push(pool[idx])
      pool.splice(idx, 1)
    }
    s.choiceList = picked
    return picked.map(function (c) {
      return describeChoice(s, c)
    })
  }

  function describeChoice(s, c) {
    var out = { id: c.id, kind: c.kind, key: c.key }
    if (c.kind === 'weapon_new') {
      var w = WEAPONS[c.key]
      out.title = w.name
      out.icon = w.tag
      out.level = 1
      out.max = w.max
      out.badge = '新武器'
      out.desc = w.desc
      out.detail = w.line(1)
    } else if (c.kind === 'weapon_up') {
      var w2 = WEAPONS[c.key]
      var cur = s.weapons[c.key].level
      out.title = w2.name
      out.icon = w2.tag
      out.level = cur + 1
      out.max = 0 // 无限强化
      out.badge = '强化 Lv.' + (cur + 1)
      out.desc = w2.desc
      out.detail = w2.line(cur + 1)
    } else {
      var ps = PASSIVES[c.key]
      out.title = ps.name
      out.icon = ps.icon
      out.level = s.passives[c.key] + 1
      out.max = 0 // 无限强化
      out.badge = '被动 Lv.' + (s.passives[c.key] + 1)
      out.desc = ps.desc
      out.detail = '当前 ' + s.passives[c.key] + ' 级 · 每级 ' + ps.desc
    }
    return out
  }

  function applyUpgrade(s, id) {
    if (!id) return
    var parts = id.split(':')
    var kind = parts[0]
    var key = parts[1]
    if (kind === 'n' && WEAPONS[key] && !s.weapons[key]) {
      s.weapons[key] = { level: 1, timer: 0 }
      s.weaponOrder.push(key)
    } else if (kind === 'w' && s.weapons[key]) {
      // 无限强化（max 只是成长参考线，不做硬上限）
      s.weapons[key].level = s.weapons[key].level + 1
    } else if (kind === 'p' && PASSIVES[key]) {
      s.passives[key] = s.passives[key] + 1
      s._needRefresh = true
    }
    refreshDerived(s)
    s.pending--
    if (s.pending <= 0) {
      s.pending = 0
      s.paused = false
      s.choiceList = null
    }
  }

  function weaponSummary(s) {
    return s.weaponOrder.map(function (k) {
      return { key: k, name: WEAPONS[k].name, level: s.weapons[k].level, max: WEAPONS[k].max, tag: WEAPONS[k].tag }
    })
  }

  function passiveSummary(s) {
    var out = []
    for (var k in PASSIVES) {
      if (!PASSIVES.hasOwnProperty(k)) continue
      if (s.passives[k] > 0) out.push({ key: k, name: PASSIVES[k].name, level: s.passives[k], max: PASSIVES[k].max })
    }
    return out
  }

  /* 存档：序列化时排除函数（rng）、每帧重建的 buckets、运行时旗标。
     cheatMon / cheatBs（怪物强化）不入存档——大退重进后重置，已保存的存档不受影响；
     cheatAtk（攻击+10%）入存档，从存档继续仍保留。 */
  var SAVE_SKIP = { rng: 1, buckets: 1, paused: 1, over: 1, cheatMon: 1, cheatBs: 1 }

  // 统一入口：敌方弹幕生成（作弊码「这些怪怎么这么垃圾？」弹速 +60% 固定）
  function ebPush(s, b) {
    var m = s && s.cheatBs ? s.cheatBs : 1
    if (m !== 1) { b.vx *= m; b.vy *= m }
    s.eBullets.push(b)
  }

  /* 作弊码：返回作用类型（金币类由 main 处理） */
  function applyCheat(s, code) {
    if (code === '我是91男演员') { s.cheatAtk = 1.1; return 'atk' }
    if (code === '这些怪怎么这么垃圾？') {
      s.cheatMon = { hp: 1.8, dmg: 1.8, spd: 1.6, bs: 1.6, wave: 0.04 }
      s.cheatBs = 1.6
      return 'mon'
    }
    return null
  }

  function serialize(s) {
    var copy = {}
    for (var k in s) {
      if (SAVE_SKIP[k] || k.charAt(0) === '_') continue
      copy[k] = s[k]
    }
    // bossRef 是引用，转成 id 再存（反序列化时找回来）
    copy.bossRefId = s.bossRef ? s.bossRef.id : -1
    return copy
  }

  function restore(data, opts) {
    opts = opts || {}
    var s = create({
      seed: ((opts.seed == null ? Date.now() : opts.seed) & 0xffffffff),
      view: data.view || { w: 420, h: 780 },
      upgrades: {},
    })
    for (var k in data) {
      if (SAVE_SKIP[k] || k.charAt(0) === '_' || k === 'bossRefId') continue
      s[k] = data[k]
    }
    s.bossRef = null
    if (data.bossRefId > 0) {
      for (var i = 0; i < s.enemies.length; i++) {
        if (s.enemies[i].id === data.bossRefId) { s.bossRef = s.enemies[i]; break }
      }
    }
    s._needRefresh = true
    refreshDerived(s)
    // 空间索引靠下一帧 step 重建；先填充一次避免渲染空查询
    buildGrid(s)
    return s
  }

  /* 跳过波间休息：立即开始下一波（slash rest countdown） */
  function skipRest(s) {
    if (s.over || s.waveActive) return false
    if (s.pending > 0) return false
    startWave(s, s.wave + 1)
    return true
  }

  return {
    create: create,
    step: step,
    serialize: serialize,
    restore: restore,
    skipRest: skipRest,
    getChoices: getChoices,
    applyUpgrade: applyUpgrade,
    weaponSummary: weaponSummary,
    passiveSummary: passiveSummary,
    startWave: startWave,
    waveComposition: waveComposition,
    WEAPONS: WEAPONS,
    WEAPON_ORDER: WEAPON_ORDER,
    PASSIVES: PASSIVES,
    damageEnemy: damageEnemy,
    ENEMIES: ENEMIES,
    SHOP: SHOP,
    GSHOP: GSHOP,
    GSHOP_ORDER: GSHOP_ORDER,
    gCost: gCost,
    buyG: buyG,
    applyCheat: applyCheat,
    DIFFS: DIFFS,
    DIFF_ORDER: DIFF_ORDER,
    diffOf: diffOf,
    monsterLv: monsterLv,
    lvFor: lvFor,
    BOSS_KINDS: BOSS_KINDS,
    CLASSES: CLASSES,
    CLASS_ORDER: CLASS_ORDER,
    jobOf: jobOf,
    TAU: TAU,
  }
})
