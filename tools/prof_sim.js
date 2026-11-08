// 长跑性能分析：每 60s 打印 实体数 / 每步 ms
var Sim = require('/root/projects/survivor/app/assets/game/sim.js')

function bot(s) {
  var p = s.player
  var cx = s.view.w / 2, cy = s.view.h / 2
  var r = 210, t = s.time * 1.05
  var tx = cx + Math.cos(t) * r, ty = cy + Math.sin(t) * r
  var dx = tx - p.x, dy = ty - p.y
  var d = Math.hypot(dx, dy) || 1
  var step = Math.min(1, d / 24)
  return { x: dx / d * step, y: dy / d * step }
}

var s = Sim.create({ seed: 7, view: { w: 800, h: 400 } })
var t0 = Date.now()
function prof(stopAt, label) {
  var acc = 0, steps = 0, maxSteps = 1000
  while (s.time < stopAt && !s.over) {
    if (s.paused && s.pending > 0) { Sim.applyUpgrade(s, Sim.getChoices(s)[0].id); continue }
    var before = process.hrtime.bigint()
    Sim.step(s, 1 / 60, bot(s))
    acc += Number(process.hrtime.bigint() - before) / 1e6
    steps++
    if (steps > maxSteps * 30) break
  }
  var ents = s.enemies.length, gems = s.gems.length, parts = (s.particles || []).length
  var fx = (s.fx || []).length, eb = (s.eBullets || []).length, bul = s.bullets.length
  console.log(label + ': t=' + s.time.toFixed(0) + 's wave=' + s.wave +
    ' 步=' + steps + ' 平均=' + (acc / steps).toFixed(3) + 'ms' +
    ' 敌=' + ents + ' 宝=' + gems + ' 弹=' + bul + ' 敌弹=' + eb +
    ' 粒=' + parts + ' fx=' + fx + ' 杀=' + s.stats.kills + ' Lv=' + s.player.level)
}

for (var m = 1; m <= 12; m++) prof(m * 60, 'M' + m)
console.log('TOTAL wall=' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
