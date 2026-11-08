/* 无头逻辑自测：node tools/test_sim.js */
'use strict'
var path = require('path')
var Sim = require(path.join(__dirname, '..', 'app', 'assets', 'game', 'sim.js'))

function run(name, opts) {
  var s = Sim.create({ seed: opts.seed || 12345, view: { w: 420, h: 820 } })
  var dt = 1 / 60
  var steps = Math.round((opts.seconds || 120) / dt)
  var picks = 0
  var maxEnemies = 0
  var errors = []
  var t0 = Date.now()
  for (var i = 0; i < steps; i++) {
    var t = s.time
    var input = opts.input ? opts.input(t, s) : { x: 0, y: 0 }
    Sim.step(s, dt, input)
    // 自动选择升级
    var guard = 0
    while (s.pending > 0 && guard++ < 10) {
      var ch = Sim.getChoices(s)
      if (!ch.length) break
      // 模拟玩家的偏好：优先新武器 > 武器强化 > 输出被动
      var rank = function (c) {
        if (c.kind === 'weapon_new') return 0
        if (c.kind === 'weapon_up') return 1
        if (c.key === 'atk' || c.key === 'cd') return 2
        return 3
      }
      ch.sort(function (a, b) { return rank(a) - rank(b) })
      Sim.applyUpgrade(s, ch[0].id)
      picks++
    }
    if (!isFinite(s.player.x) || !isFinite(s.player.hp)) {
      errors.push('NaN at t=' + s.time.toFixed(1))
      break
    }
    if (s.enemies.length > maxEnemies) maxEnemies = s.enemies.length
    if (s.over) break
    if (opts.stopAt && s.time >= opts.stopAt) break
  }
  var ms = Date.now() - t0
  var res = {
    name: name,
    survived: +s.time.toFixed(1),
    over: s.over,
    kills: s.stats.kills,
    level: s.player.level,
    picks: picks,
    hp: Math.round(s.player.hp),
    weapons: Sim.weaponSummary(s).map(function (w) { return w.name + w.level }).join(' '),
    passives: Sim.passiveSummary(s).map(function (p) { return p.name + p.level }).join(' '),
    maxEnemies: maxEnemies,
    simMs: ms,
    msPerStep: +(ms / Math.max(1, steps)).toFixed(3),
    errors: errors,
  }
  console.log(JSON.stringify(res))
  return res
}

console.log('--- 1) 站桩不操作（应当很快死亡）---')
var idle = run('idle', { seconds: 180, seed: 7 })

console.log('--- 2) 持续绕圈跑（应当活更久、有击杀和升级）---')
var circle = run('circle', {
  seconds: 240,
  seed: 99,
  input: function (t) {
    var a = t * 0.9
    return { x: Math.cos(a), y: Math.sin(a) }
  },
})

console.log('--- 3) 长时间挂机（难度曲线 / 稳定性）---')
var long = run('long', {
  seconds: 420,
  seed: 2024,
  input: function (t) {
    return { x: Math.cos(t * 0.31), y: Math.sin(t * 0.47) }
  },
})

console.log('--- 4) 逃逸机器人（模拟真人边跑边打）---')
var fleeSeeds = [11, 22, 33, 44]
var fleeResults = fleeSeeds.map(function (seed) {
  return run('flee-' + seed, {
    seconds: 400,
    seed: seed,
    input: function (t, s) {
      var p = s.player
      var fx = 0
      var fy = 0
      var es = s.enemies
      for (var i = 0; i < es.length; i++) {
        var e = es[i]
        if (e.hp <= 0) continue
        var dx = p.x - e.x
        var dy = p.y - e.y
        var d2 = dx * dx + dy * dy
        if (d2 > 260 * 260 || d2 < 0.001) continue
        var w = 1 / Math.max(1, d2)
        fx += dx * w
        fy += dy * w
      }
      var m = Math.hypot(fx, fy)
      if (m < 1e-6) return { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) }
      return { x: fx / m, y: fy / m }
    },
  })
})

var fail = 0
function check(cond, msg) {
  if (!cond) {
    console.log('FAIL: ' + msg)
    fail++
  } else {
    console.log('ok: ' + msg)
  }
}

check(idle.over === true, '站桩应当死亡（当前 ' + idle.survived + 's, hp=' + idle.hp + '）')
check(idle.survived > 4 && idle.survived < 150, '死亡时间处在合理区间 4~150s')
check(circle.kills > 30, '绕圈跑有击杀（' + circle.kills + '）')
check(circle.picks >= 3, '能够多次升级并应用强化（' + circle.picks + ' 次）')
check(circle.errors.length === 0, '无 NaN / 异常')
check(long.simMs / (420 / (1 / 60)) < 0.9, '单步耗时 < 0.9ms（' + long.msPerStep + 'ms）')
var bestFlee = fleeResults.reduce(function (a, b) { return a.survived > b.survived ? a : b })
var lvls = fleeResults.map(function (r) { return r.level }).join('/')
check(bestFlee.survived > 150, '逃逸机器人最好成绩 > 150s（' + bestFlee.survived + 's）')
check(Math.max.apply(null, fleeResults.map(function (r) { return r.kills })) > 150, '逃逸机器人击杀 > 150')
check(Math.max.apply(null, fleeResults.map(function (r) { return r.level })) >= 3, '逃逸机器人能升到 3 级以上（拾取范围改为 50 后早期升级变慢，' + lvls + '）')

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILURES')
process.exit(fail === 0 ? 0 : 1)
