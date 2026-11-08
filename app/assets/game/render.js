/* 无尽割草 · Canvas 渲染层 */
;(function (root) {
  'use strict'

  function makeGlow(color, size) {
    var c = document.createElement('canvas')
    c.width = c.height = size
    var g = c.getContext('2d')
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grd.addColorStop(0, color)
    grd.addColorStop(0.35, color)
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, size, size)
    return c
  }

  function Renderer(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.dpr = 1
    this.w = 0
    this.h = 0
    this.glow = {
      green: makeGlow('rgba(120,245,160,0.55)', 128),
      red: makeGlow('rgba(255,80,110,0.5)', 128),
      cyan: makeGlow('rgba(90,220,255,0.5)', 128),
      gold: makeGlow('rgba(255,210,90,0.5)', 128),
      purple: makeGlow('rgba(200,110,255,0.5)', 128),
    }
    this.resize()
  }

  Renderer.prototype.resize = function () {
    var dpr = Math.min(root.devicePixelRatio || 1, 2)
    var w = this.canvas.clientWidth || root.innerWidth
    var h = this.canvas.clientHeight || root.innerHeight
    if (this.w === w && this.h === h && this.dpr === dpr) return
    this.dpr = dpr
    this.w = w
    this.h = h
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    // 预计算暗角渐变（避免每帧 createRadialGradient）
    var vg = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.55)')
    this._vg = vg
  }

  Renderer.prototype.draw = function (s, dt) {
    this.resize()
    var ctx = this.ctx
    var w = this.w
    var h = this.h
    var dpr = this.dpr
    var time = s.time

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 用 fillRect 覆盖清屏（比 clearRect + fillRect 少一次操作）
    ctx.fillStyle = '#080b12'
    ctx.fillRect(0, 0, w, h)

    var cam = s.camera
    var shakeX = 0
    var shakeY = 0
    if (cam.shake > 0.1) {
      var mag = cam.shake
      shakeX = (Math.random() - 0.5) * mag
      shakeY = (Math.random() - 0.5) * mag
    }
    var ox = w / 2 - cam.x + shakeX
    var oy = h / 2 - cam.y + shakeY

    // 网格
    ctx.save()
    var step = 64
    var startX = ((cam.x - w / 2) / step | 0) * step
    var startY = ((cam.y - h / 2) / step | 0) * step
    ctx.fillStyle = 'rgba(120,190,255,0.10)'
    for (var gx = startX; gx < cam.x + w / 2 + step; gx += step) {
      for (var gy = startY; gy < cam.y + h / 2 + step; gy += step) {
        ctx.fillRect(gx + ox - 1, gy + oy - 1, 2, 2)
      }
    }
    ctx.restore()

    // 世界内的实体
    ctx.save()
    ctx.translate(ox, oy)
    var viewL = cam.x - w / 2 - 80
    var viewR = cam.x + w / 2 + 80
    var viewT = cam.y - h / 2 - 80
    var viewB = cam.y + h / 2 + 80

    // 灵光光环
    var aura = s.weapons.aura
    if (aura) {
      var st = root.MowSim.WEAPONS.aura.stat(aura.level)
      var pulse = 0.5 + 0.5 * Math.sin(time * 3)
      var grd = ctx.createRadialGradient(s.player.x, s.player.y, st.radius * 0.2, s.player.x, s.player.y, st.radius)
      grd.addColorStop(0, 'rgba(120,245,160,0.16)')
      grd.addColorStop(0.75, 'rgba(90,220,180,0.07)')
      grd.addColorStop(1, 'rgba(90,220,180,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(s.player.x, s.player.y, st.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(140,255,190,' + (0.10 + pulse * 0.10) + ')'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    // 经验宝石
    var gems = s.gems
    for (var i = 0; i < gems.length; i++) {
      var g = gems[i]
      if (g.x < viewL || g.x > viewR || g.y < viewT || g.y > viewB) continue
      var gs = g.big ? 1.5 : 1
      var wob = 0.7 + 0.3 * Math.sin(time * 8 + g.x * 0.1)
      ctx.save()
      ctx.translate(g.x, g.y)
      ctx.rotate(time * 1.5)
      ctx.fillStyle = g.big ? 'rgba(255,215,110,' + wob + ')' : 'rgba(110,235,255,' + wob + ')'
      ctx.beginPath()
      ctx.moveTo(0, -4.5 * gs)
      ctx.lineTo(3.4 * gs, 0)
      ctx.lineTo(0, 4.5 * gs)
      ctx.lineTo(-3.4 * gs, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // 粒子（在敌人下层；实体过多时降级，保帧率）
    var parts = s.particles
    if (es_len < 130) {
      for (var pi = 0; pi < parts.length; pi++) {
        var pt = parts[pi]
        if (pt.x < viewL || pt.x > viewR || pt.y < viewT || pt.y > viewB) continue
        var a = Math.max(0, pt.life / pt.max)
        ctx.globalAlpha = a * 0.9
        ctx.fillStyle = pt.color
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // 敌人
    var es = s.enemies
    var es_len = es.length
    this._aimLockId = s.aimLockId || 0
    // LOD：敌人越多模型越简（血条/蓄力警示/准星等玩法信息不受影响）
    this._lod = es_len >= 140 ? 2 : es_len >= 70 ? 1 : 0
    for (var ei = 0; ei < es_len; ei++) {
      var e = es[ei]
      if (e.hp <= 0) continue
      if (e.x < viewL || e.x > viewR || e.y < viewT || e.y > viewB) continue
      this.drawEnemy(ctx, s, e, time)
    }

    // 旋刃
    var orbit = s.weapons.orbit
    if (orbit) {
      var ost = root.MowSim.WEAPONS.orbit.stat(orbit.level)
      for (var b = 0; b < ost.blades; b++) {
        var ang = s.orbitPhase + (b * Math.PI * 2) / ost.blades
        var bx = s.player.x + Math.cos(ang) * ost.radius
        var by = s.player.y + Math.sin(ang) * ost.radius
        ctx.save()
        ctx.translate(bx, by)
        ctx.rotate(ang + Math.PI / 2 + time * 6)
        ctx.fillStyle = 'rgba(160,255,205,0.95)'
        ctx.beginPath()
        ctx.moveTo(0, -11)
        ctx.lineTo(5, 6)
        ctx.lineTo(0, 3)
        ctx.lineTo(-5, 6)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        ctx.globalAlpha = 0.18
        ctx.drawImage(this.glow.green, bx - 20, by - 20, 40, 40)
        ctx.globalAlpha = 1
      }
    }

    // 子弹
    var bs = s.bullets
    for (var bi = 0; bi < bs.length; bi++) {
      var bl = bs[bi]
      if (bl.x < viewL || bl.x > viewR || bl.y < viewT || bl.y > viewB) continue
      if (bl.kind === 'missile') {
        ctx.globalAlpha = 0.75
        ctx.drawImage(this.glow.gold, bl.x - 22, bl.y - 22, 44, 44)
        ctx.globalAlpha = 1
        ctx.fillStyle = '#ffd36e'
        ctx.beginPath()
        ctx.arc(bl.x, bl.y, 5.2, 0, Math.PI * 2)
        ctx.fill()
      } else if (bl.kind === 'shard') {
        // 碎冰：半透明菱形冰晶，尾迹更细长
        ctx.save()
        ctx.translate(bl.x, bl.y)
        ctx.rotate(bl.angle || 0)
        ctx.fillStyle = 'rgba(170,235,255,0.95)'
        ctx.beginPath()
        ctx.moveTo(13, 0)
        ctx.lineTo(-6, 3.4)
        ctx.lineTo(-3, 0)
        ctx.lineTo(-6, -3.4)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.moveTo(7, 0)
        ctx.lineTo(-2, 1.6)
        ctx.lineTo(-2, -1.6)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else {
        ctx.save()
        ctx.translate(bl.x, bl.y)
        ctx.rotate(bl.angle || 0)
        ctx.fillStyle = 'rgba(190,255,220,0.95)'
        ctx.beginPath()
        ctx.moveTo(11, 0)
        ctx.lineTo(-5, 4)
        ctx.lineTo(-2.5, 0)
        ctx.lineTo(-5, -4)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    // 敌方子弹：按 sim 给的颜色画（紫菱形小弹 / 各 BOSS 彩色大弹 / 毒云）
    var ebs = s.eBullets
    for (var ebi = 0; ebi < ebs.length; ebi++) {
      var eb2 = ebs[ebi]
      if (eb2.x < viewL || eb2.x > viewR || eb2.y < viewT || eb2.y > viewB) continue
      var bc = eb2.color || (eb2.r > 8 ? '#ff7a93' : '#dca8ff')
      if (eb2.slime) {
        // 毒云：扁 young 的绿色蚀坑，边缘亮一圈
        ctx.globalAlpha = 0.32
        ctx.fillStyle = '#7ce88d'
        ctx.beginPath()
        ctx.ellipse(eb2.x, eb2.y + eb2.r * 0.25, eb2.r * 1.35, eb2.r * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = 'rgba(140,255,160,0.8)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(eb2.x, eb2.y + eb2.r * 0.25, eb2.r * 1.35, eb2.r * 0.55, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#d8ffdd'
        ctx.beginPath()
        ctx.arc(eb2.x - eb2.r * 0.3, eb2.y, eb2.r * 0.22, 0, Math.PI * 2)
        ctx.fill()
      } else if (eb2.r > 8) {
        // 大弹：外光晕 + 实心 + 高光点
        ctx.globalAlpha = 0.34
        ctx.fillStyle = bc
        ctx.beginPath()
        ctx.arc(eb2.x, eb2.y, eb2.r * 2.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = bc
        ctx.beginPath()
        ctx.arc(eb2.x, eb2.y, eb2.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.beginPath()
        ctx.arc(eb2.x - eb2.r * 0.28, eb2.y - eb2.r * 0.28, eb2.r * 0.28, 0, Math.PI * 2)
        ctx.fill()
        // 追踪弹（重炮王炮弹 / 风暴闪电球）：尾焰
        if (eb2.homing) {
          var ha = Math.atan2(eb2.vy, eb2.vx) || 0
          ctx.save()
          ctx.translate(eb2.x, eb2.y)
          ctx.rotate(ha)
          ctx.fillStyle = 'rgba(255,209,102,0.9)'
          ctx.beginPath()
          ctx.moveTo(-eb2.r * 0.6, -eb2.r * 0.4)
          ctx.lineTo(-eb2.r * (1.5 + 0.4 * Math.sin(time * 20 + eb2.x)), 0)
          ctx.lineTo(-eb2.r * 0.6, eb2.r * 0.4)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = '#fff3c4'
          ctx.beginPath()
          ctx.arc(eb2.r * 0.45, 0, eb2.r * 0.32, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      } else {
        // 小弹：旋转菱形
        ctx.globalAlpha = 0.28
        ctx.fillStyle = bc
        ctx.beginPath()
        ctx.arc(eb2.x, eb2.y, eb2.r * 1.9, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.save()
        ctx.translate(eb2.x, eb2.y)
        ctx.rotate(time * 4)
        ctx.fillStyle = bc
        ctx.beginPath()
        ctx.moveTo(0, -eb2.r)
        ctx.lineTo(eb2.r, 0)
        ctx.lineTo(0, eb2.r)
        ctx.lineTo(-eb2.r, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    // 冲击波 / 爆炸 / 雷击
    var fx = s.effects
    for (var fi = 0; fi < fx.length; fi++) {
      var f = fx[fi]
      var k = Math.max(0, f.life / f.max)
      if (f.kind === 'nova') {
        ctx.strokeStyle = 'rgba(150,255,200,' + (k * 0.85) + ')'
        ctx.lineWidth = 6 * k + 1
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.stroke()
      } else if (f.kind === 'boom') {
        var br = f.maxR * (1 - k)
        ctx.fillStyle = 'rgba(255,190,90,' + (k * 0.5) + ')'
        ctx.beginPath()
        ctx.arc(f.x, f.y, br, 0, Math.PI * 2)
        ctx.fill()
      } else if (f.kind === 'chain') {
        // 连锁闪电：沿路径折线
        var segs = f.segs || []
        ctx.strokeStyle = 'rgba(140,230,255,' + k + ')'
        ctx.lineWidth = 3.4
        ctx.beginPath()
        for (var si = 0; si < segs.length; si++) {
          var sx = segs[si].x, sy = segs[si].y
          if (si === 0) ctx.moveTo(sx, sy)
          else {
            // 每段加锯齿模拟电弧
            var px = segs[si - 1].x, py = segs[si - 1].y
            var mx = (px + sx) / 2 + (sx - px) * 0.18 * Math.sin(si * 13 + f.max * 60)
            var my = (py + sy) / 2 + (sy - py) * 0.18 * Math.cos(si * 17 + f.max * 70)
            ctx.lineTo(mx, my)
            ctx.lineTo(sx, sy)
          }
        }
        ctx.stroke()
        for (var s2 = 0; s2 < segs.length; s2++) {
          ctx.fillStyle = 'rgba(200,245,255,' + k + ')'
          ctx.beginPath()
          ctx.arc(segs[s2].x, segs[s2].y, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (f.kind === 'rain') {
        // 箭雨落点：蓄势时画收缩的警示圈，落下后扩散一闪
        var rr = f.r || 90
        if (!f.done) {
          var progR = 1 - Math.max(0, f.delay) / 0.55
          ctx.strokeStyle = 'rgba(255,230,150,' + (0.5 + 0.4 * progR) + ')'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(f.x, f.y, rr * (1 - 0.55 * progR), 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = 'rgba(255,230,150,' + (k * 0.55) + ')'
          ctx.beginPath()
          ctx.arc(f.x, f.y, rr * (1 - k), 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (f.kind === 'laser') {
        // 死光：自玩家发出的旋转渐变光束
        var prog = 1 - k
        var la = f.a0 + f.sweep * Math.PI * 2 * prog * 0.55
        var ex = f.x + Math.cos(la) * f.len
        var ey = f.y + Math.sin(la) * f.len
        var g = ctx.createLinearGradient(f.x, f.y, ex, ey)
        g.addColorStop(0, 'rgba(255,120,160,' + (0.15 + 0.55 * Math.sin(k * Math.PI)) + ')')
        g.addColorStop(1, 'rgba(255,220,230,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = f.width
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(f.x, f.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.lineWidth = Math.max(2, f.width * 0.28)
        ctx.strokeStyle = 'rgba(255,240,245,' + (0.5 + 0.3 * Math.sin(k * Math.PI)) + ')'
        ctx.beginPath()
        ctx.moveTo(f.x, f.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      } else if (f.kind === 'bolt') {
        ctx.strokeStyle = 'rgba(180,220,255,' + k + ')'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(f.x, f.y - 260)
        ctx.lineTo(f.x + 6, f.y - 120)
        ctx.lineTo(f.x - 6, f.y - 60)
        ctx.lineTo(f.x, f.y)
        ctx.stroke()
        ctx.fillStyle = 'rgba(160,210,255,' + (k * 0.35) + ')'
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r * (1.1 - k * 0.3), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 玩家
    this.drawPlayer(ctx, s, time)

    // 飘字（性能：font 只设一次，按颜色分桶，减少状态切换）
    var ts = s.texts
    if (ts.length) {
      ctx.textAlign = 'center'
      ctx.font = 'bold 13px system-ui, sans-serif'
      var buckets = { _: [] }
      for (var ti = 0; ti < ts.length; ti++) {
        var t = ts[ti]
        var ta = Math.min(1, t.life / t.max)
        ;(buckets[t.color] || (buckets[t.color] = [])).push(t, ta)
      }
      for (var bc in buckets) {
        if (bc === '_') continue
        var arr = buckets[bc]
        ctx.fillStyle = bc
        for (var bi = 0; bi < arr.length; bi += 2) {
          ctx.globalAlpha = arr[bi + 1]
          ctx.fillText(String(arr[bi].value), arr[bi].x, arr[bi].y)
        }
      }
      ctx.globalAlpha = 1
    }

    ctx.restore()

    // BOSS 血条
    if (s.bossRef && s.bossRef.hp > 0) {
      var bo = s.bossRef
      var bw = Math.min(w - 48, 320)
      var bx0 = (w - bw) / 2
      var by0 = 74
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(bx0, by0, bw, 8)
      ctx.fillStyle = '#ff5577'
      ctx.fillRect(bx0, by0, bw * Math.max(0, bo.hp / bo.maxHp), 8)
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1
      ctx.strokeRect(bx0 + 0.5, by0 + 0.5, bw - 1, 7)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(bo.bossName || 'BOSS', w / 2, by0 - 5)
    }

    // 波次横幅 / 波间休息倒计时
    if (s.waveBanner > 0 && s.wave > 0) {
      var ba = Math.min(1, s.waveBanner / 0.4)
      var bossWave = s.wave % 5 === 0
      ctx.globalAlpha = ba
      ctx.textAlign = 'center'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.fillStyle = bossWave ? '#ff5577' : '#ffce5c'
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.lineWidth = 5
      var Sim = root.MowSim
      var mlv = (Sim && Sim.lvFor ? Sim.lvFor(s, s.wave) : (Sim && Sim.monsterLv ? Sim.monsterLv(s.wave) : 1 + 2 * (s.wave - 1)))
      var bt = bossWave ? '⚠ 第 ' + s.wave + ' 波 · BOSS 来袭 · Lv.' + mlv : '第 ' + s.wave + ' 波 · 怪物 Lv.' + mlv
      ctx.strokeText(bt, w / 2, h * 0.2)
      ctx.fillText(bt, w / 2, h * 0.2)
      ctx.globalAlpha = 1
    }
    if (!s.waveActive && s.wave > 0 && s.restLeft > 0 && s.restLeft < 9.9) {
      ctx.textAlign = 'center'
      ctx.font = 'bold 15px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 4
      var rt = '第 ' + s.wave + ' 波完成 · 下一波 ' + Math.ceil(s.restLeft) + 's'
      ctx.strokeText(rt, w / 2, h * 0.2)
      ctx.fillText(rt, w / 2, h * 0.2)
    }

    // 暗角（渐变预计算，见 resize）
    if (this._vg) {
      ctx.fillStyle = this._vg
      ctx.fillRect(0, 0, w, h)
    }
  }

  Renderer.prototype.drawEnemy = function (ctx, s, e, time) {
    var r = e.r
    var lod = this._lod || 0
    var wob = Math.sin(time * 6 + e.wob) * (e.type === 'slime' ? 0.9 : 0.5)
    var body = e.flash > 0 ? '#ffffff' : e.color
    var dark = e.flash > 0 ? '#dddddd' : e.dark
    ctx.save()
    ctx.translate(e.x, e.y)
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.75, r * 0.85, r * 0.35, 0, 0, Math.PI * 2)
    ctx.fill()

    // 蓄力提示（runner 蓄力 / BOSS 冲撞前摇）：红色脉动警示圈
    if (e.wind > 0 || e.windD > 0) {
      var wr = e.windD > 0 ? r * (0.9 + 0.8 * (e.windD / 0.8)) : r * 1.3
      ctx.strokeStyle = 'rgba(255,80,90,' + (0.4 + 0.35 * Math.sin(time * 18)) + ')'
      ctx.lineWidth = e.windD > 0 ? 3 : 2
      ctx.beginPath()
      ctx.arc(0, 0, wr, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 冲刺拖尾（runner 冲锋 / BOSS 冲撞）
    if ((e.charge > 0 || e.dash > 0) && (e.cdx || e.cdy)) {
      var tx = -e.cdx, ty = -e.cdy
      ctx.strokeStyle = 'rgba(255,205,130,0.7)'
      ctx.lineWidth = 2
      for (var si = 1; si <= 3; si++) {
        ctx.beginPath()
        ctx.moveTo(tx * r * (0.7 + si * 0.45), ty * r * (0.7 + si * 0.45))
        ctx.lineTo(tx * r * (1.5 + si * 0.45), ty * r * (1.5 + si * 0.45))
        ctx.stroke()
      }
    }

    if (e.type === 'runner') {
      // 六足快走虫：椭圆身体 + 细腿 + 触角（敌人多了 LOD 降级）
      ctx.strokeStyle = dark
      ctx.lineWidth = Math.max(1.4, r * 0.16)
      ctx.lineCap = 'round'
      var legPairs = lod >= 2 ? 0 : lod >= 1 ? 2 : 3
      for (var li = 0; li < legPairs; li++) {
        var ly = (li - (legPairs - 1) / 2) * r * 0.36
        var ls = Math.sin(time * 16 + e.wob + li * 2.1) * r * 0.34
        ctx.beginPath()
        ctx.moveTo(-r * 0.5, ly)
        ctx.lineTo(-r * 1.25, ly + ls)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(r * 0.5, ly)
        ctx.lineTo(r * 1.25, ly - ls)
        ctx.stroke()
      }
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.ellipse(0, wob * 0.4, r * 0.95, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      if (lod === 0) {
        // 触角
        ctx.strokeStyle = dark
        ctx.lineWidth = Math.max(1, r * 0.1)
        ctx.beginPath()
        ctx.moveTo(-r * 0.3, -r * 0.4)
        ctx.lineTo(-r * 0.55, -r * 1.05 + wob * 0.6)
        ctx.moveTo(r * 0.3, -r * 0.4)
        ctx.lineTo(r * 0.55, -r * 1.05 - wob * 0.6)
        ctx.stroke()
      }
    } else if (e.type === 'brute') {
      // 重甲兽：厚身躯 + 两块装甲板 + 獠牙
      ctx.fillStyle = dark
      ctx.beginPath()
      ctx.ellipse(0, wob * 0.3, r * 1.08, r * 0.86, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.ellipse(0, wob * 0.3 - r * 0.08, r * 0.92, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      if (lod === 0) {
        // 装甲板
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.beginPath()
        ctx.ellipse(-r * 0.3, -r * 0.22, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2)
        ctx.ellipse(r * 0.34, -r * 0.16, r * 0.3, r * 0.18, 0.5, 0, Math.PI * 2)
        ctx.fill()
        // 獠牙
        ctx.fillStyle = '#f4ead0'
        ctx.beginPath()
        ctx.moveTo(-r * 0.42, r * 0.28)
        ctx.lineTo(-r * 0.24, r * 0.28)
        ctx.lineTo(-r * 0.34, r * 0.62)
        ctx.closePath()
        ctx.moveTo(r * 0.42, r * 0.28)
        ctx.lineTo(r * 0.24, r * 0.28)
        ctx.lineTo(r * 0.34, r * 0.62)
        ctx.closePath()
        ctx.fill()
      }
    } else if (e.type === 'elite') {
      // 幻晶精英：悬浮菱形水晶 + 绕轨碎片
      var sp = time * 1.6 + e.wob
      var shards = lod >= 2 ? 0 : lod >= 1 ? 2 : 3
      for (var si = 0; si < shards; si++) {
        var sa = sp + (si * Math.PI * 2) / shards
        var sx = Math.cos(sa) * (r + 7)
        var sy = Math.sin(sa) * (r + 7) * 0.62
        ctx.fillStyle = 'rgba(200,140,255,0.85)'
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(sp * 2)
        ctx.beginPath()
        ctx.moveTo(0, -4.5)
        ctx.lineTo(3.2, 0)
        ctx.lineTo(0, 4.5)
        ctx.lineTo(-3.2, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      var float = Math.sin(time * 2.4 + e.wob) * r * 0.16
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.moveTo(0, -r * 1.05 + float)
      ctx.lineTo(r * 0.72, float)
      ctx.lineTo(0, r * 1.05 + float)
      ctx.lineTo(-r * 0.72, float)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.beginPath()
      ctx.moveTo(0, -r * 1.05 + float)
      ctx.lineTo(r * 0.3, -r * 0.1 + float)
      ctx.lineTo(-r * 0.3, -r * 0.1 + float)
      ctx.closePath()
      ctx.fill()
    } else if (e.type === 'scorpion') {
      // 毒尾蝎：圆身 + 翘起的蝎尾毒针 + 两只钳
      ctx.strokeStyle = dark
      ctx.lineWidth = Math.max(1.6, r * 0.16)
      ctx.lineCap = 'round'
      // 尾巴（三段折线，尾尖毒针）
      ctx.beginPath()
      ctx.moveTo(r * 0.2, -r * 0.3)
      ctx.lineTo(r * 0.55, -r * 0.75)
      ctx.lineTo(-r * 0.2, -r * 1.05)
      ctx.lineTo(-r * 0.42, -r * 0.78)
      ctx.stroke()
      ctx.fillStyle = '#7ce88d'
      ctx.beginPath()
      ctx.arc(-r * 0.46, -r * 0.72, r * 0.13, 0, Math.PI * 2)
      ctx.fill()
      // 钳
      var cl = Math.sin(time * 6 + e.wob) * r * 0.1
      ctx.lineWidth = Math.max(1.4, r * 0.13)
      ctx.beginPath()
      ctx.moveTo(-r * 0.75, r * 0.05); ctx.lineTo(-r * 1.2, -r * 0.1 - cl); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-r * 0.75, r * 0.25); ctx.lineTo(-r * 1.18, r * 0.32 + cl); ctx.stroke()
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.ellipse(0, wob * 0.3, r * 0.86, r * 0.66, 0, 0, Math.PI * 2)
      ctx.fill()
      if (lod === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.beginPath()
        ctx.ellipse(-r * 0.18, -r * 0.2, r * 0.36, r * 0.18, -0.4, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (e.type === 'bat') {
      // 血翼蝠：拍动双翼，俯冲时翼张得更开
      var flap = e.charge > 0 ? 1 : 0.7 + 0.3 * Math.sin(time * 10 + e.wob)
      ctx.fillStyle = dark
      for (var wi = -1; wi <= 1; wi += 2) {
        ctx.save()
        ctx.scale(wi, 1)
        ctx.beginPath()
        ctx.moveTo(r * 0.1, -r * 0.1)
        ctx.quadraticCurveTo(r * (0.9 + 0.4 * flap), -r * (0.5 + 0.5 * flap), r * 1.35, r * 0.05)
        ctx.quadraticCurveTo(r * 0.95, r * 0.25, r * 0.2, r * 0.3)
        ctx.closePath(); ctx.fill()
        ctx.restore()
      }
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.ellipse(0, wob * 0.5, r * 0.6, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      // 耳朵
      ctx.fillStyle = dark
      ctx.beginPath()
      ctx.moveTo(-r * 0.28, -r * 0.5); ctx.lineTo(-r * 0.42, -r * 0.85); ctx.lineTo(-r * 0.08, -r * 0.55)
      ctx.closePath(); ctx.fill()
      ctx.beginPath()
      ctx.moveTo(r * 0.28, -r * 0.5); ctx.lineTo(r * 0.42, -r * 0.85); ctx.lineTo(r * 0.08, -r * 0.55)
      ctx.closePath(); ctx.fill()
    } else if (e.type === 'healer') {
      // 女巫医：漂浮长袍 + 治疗光环 + 法杖
      var hfloat = Math.sin(time * 2.6 + e.wob) * r * 0.2
      // 治疗光环（施法时更亮）
      if (e.healFlash > 0) {
        ctx.strokeStyle = 'rgba(120,255,150,' + (0.5 + 0.4 * Math.sin(time * 16)) + ')'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, hfloat, r * 1.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 长袍
      ctx.fillStyle = '#2c1a3e'
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.5 + hfloat)
      ctx.lineTo(r * 0.8, r * 0.8)
      ctx.lineTo(-r * 0.8, r * 0.8)
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#8affb0'
      ctx.lineWidth = r * 0.07
      ctx.beginPath()
      ctx.moveTo(-r * 0.68, r * 0.6); ctx.lineTo(0, -r * 0.4 + hfloat); ctx.lineTo(r * 0.68, r * 0.6)
      ctx.stroke()
      // 兜帽
      ctx.fillStyle = '#1d1040'
      ctx.beginPath()
      ctx.moveTo(-r * 0.44, -r * 0.28 + hfloat)
      ctx.lineTo(r * 0.44, -r * 0.28 + hfloat)
      ctx.lineTo(r * 0.14, -r * 1.0 + hfloat)
      ctx.closePath(); ctx.fill()
      // 法杖：顶端水晶
      ctx.strokeStyle = '#6b4b2f'
      ctx.lineWidth = Math.max(1.5, r * 0.1)
      ctx.beginPath()
      ctx.moveTo(r * 0.75, r * 0.5); ctx.lineTo(r * 1.0, -r * 0.45 + hfloat)
      ctx.stroke()
      ctx.fillStyle = '#7cf59e'
      ctx.beginPath()
      ctx.arc(r * 1.02, -r * 0.55 + hfloat, r * 0.16, 0, Math.PI * 2)
      ctx.fill()
    } else if (e.type === 'bomber') {
      // 爆裂者：圆滚滚的身体 + 头顶引信，快自爆时全身红胀闪烁
      var hot = s.enemies.length > 0 && e.atkCd <= 0
      var pulse = 1 + 0.08 * Math.sin(time * 14 + e.wob)
      ctx.fillStyle = e.flash > 0 ? '#fff' : (hot ? '#ff7a40' : '#c96a2e')
      ctx.beginPath()
      ctx.arc(0, wob * 0.3, r * 0.9 * pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.beginPath()
      ctx.arc(0, r * 0.3 + wob * 0.3, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      // 引信 + 火星
      ctx.strokeStyle = '#5a3a20'
      ctx.lineWidth = Math.max(1.4, r * 0.1)
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.85); ctx.lineTo(r * 0.12, -r * 1.25); ctx.stroke()
      var spark = 0.5 + 0.5 * Math.sin(time * 18 + e.wob)
      ctx.fillStyle = 'rgba(255,220,90,' + (0.6 + 0.4 * spark) + ')'
      ctx.beginPath()
      ctx.arc(r * 0.14, -r * 1.32, r * 0.16 * (0.8 + 0.4 * spark), 0, Math.PI * 2)
      ctx.fill()
      // 警示纹
      if (lod === 0) {
        ctx.strokeStyle = 'rgba(255,230,120,0.9)'
        ctx.lineWidth = Math.max(1.4, r * 0.12)
        ctx.beginPath()
        ctx.moveTo(-r * 0.5, -r * 0.05); ctx.lineTo(r * 0.5, r * 0.05)
        ctx.stroke()
      }
    } else if (e.type === 'boss') {
      // BOSS：八种外观（king / mage / cannon / wraith / titan / plague / brood / storm）（king 战士 / mage 法师 / cannon 重炮 / wraith 影杀）
      var kind = e.kind || 'king'
      var kcol = e.color || '#ff4d6d'
      var kdark = kind === 'mage' ? '#3d1a5e' : kind === 'cannon' ? '#7a3a10' : kind === 'wraith' ? '#0d4a44'
        : kind === 'titan' ? '#38404c' : kind === 'plague' ? '#24301a' : kind === 'brood' ? '#3a1728' : kind === 'storm' ? '#123b4c' : '#2a0f1c'
      var bw = Math.sin(time * 2.2 + e.wob) * r * 0.06
      var ang = Math.atan2(s.player.y - e.y, s.player.x - e.x) || 0

      if (kind === 'king') {
        // 巨战王：镰刀双臂 + 尖刺王冠 + 巨大暗影
        ctx.strokeStyle = kdark
        ctx.lineWidth = r * 0.16
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-r * 0.7, -r * 0.1 + bw)
        ctx.quadraticCurveTo(-r * 1.5, -r * 0.7 + bw, -r * 1.2, -r * 1.3 + bw)
        ctx.stroke()
        ctx.strokeStyle = '#ff5577'
        ctx.lineWidth = r * 0.07
        ctx.beginPath()
        ctx.moveTo(-r * 1.2, -r * 1.25 + bw)
        ctx.quadraticCurveTo(-r * 0.95, -r * 1.05 + bw, -r * 0.62, -r * 0.32 + bw)
        ctx.stroke()
        ctx.strokeStyle = kdark
        ctx.lineWidth = r * 0.16
        ctx.beginPath()
        ctx.moveTo(r * 0.7, -r * 0.1 + bw)
        ctx.quadraticCurveTo(r * 1.5, -r * 0.7 + bw, r * 1.2, -r * 1.3 + bw)
        ctx.stroke()
        ctx.strokeStyle = '#ff5577'
        ctx.lineWidth = r * 0.07
        ctx.beginPath()
        ctx.moveTo(r * 1.2, -r * 1.25 + bw)
        ctx.quadraticCurveTo(r * 0.95, -r * 1.05 + bw, r * 0.62, -r * 0.32 + bw)
        ctx.stroke()
        ctx.fillStyle = kdark
        ctx.beginPath(); ctx.arc(0, bw, r * 0.94, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = body
        ctx.beginPath(); ctx.arc(0, bw, r * 0.72, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = kdark
        for (var ci = 0; ci < 6; ci++) {
          var ca = (ci / 6) * Math.PI * 2 - Math.PI / 2
          ctx.save()
          ctx.translate(Math.cos(ca) * r * 0.82, Math.sin(ca) * r * 0.82 + bw)
          ctx.rotate(ca + Math.PI / 2)
          ctx.beginPath()
          ctx.moveTo(0, 0); ctx.lineTo(r * 0.14, -r * 0.34); ctx.lineTo(-r * 0.14, -r * 0.34)
          ctx.closePath(); ctx.fill()
          ctx.restore()
        }
      } else if (kind === 'mage') {
        // 水晶法师：漂浮长袍 + 尖顶帽 + 三颗轨道水晶
        var bob2 = Math.sin(time * 2.4 + e.wob) * r * 0.12 - r * 0.1
        ctx.fillStyle = kdark
        ctx.beginPath()
        ctx.moveTo(0, -r * 0.44 + bob2)
        ctx.lineTo(r * 0.9, r * 0.85 + bob2)
        ctx.lineTo(-r * 0.9, r * 0.85 + bob2)
        ctx.closePath(); ctx.fill()
        // 长袍亮边
        ctx.strokeStyle = kcol
        ctx.lineWidth = r * 0.08
        ctx.beginPath()
        ctx.moveTo(-r * 0.78, r * 0.62 + bob2)
        ctx.lineTo(0, -r * 0.36 + bob2)
        ctx.lineTo(r * 0.78, r * 0.62 + bob2)
        ctx.stroke()
        // 尖顶帽
        ctx.fillStyle = kdark
        ctx.beginPath()
        ctx.moveTo(-r * 0.5, -r * 0.36 + bob2)
        ctx.lineTo(r * 0.5, -r * 0.36 + bob2)
        ctx.lineTo(r * 0.16, -r * 1.24 + bw * 2)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = kcol
        ctx.beginPath(); ctx.arc(-r * 0.05, -r * 1.06 + bw * 2, r * 0.1, 0, Math.PI * 2); ctx.fill()
        // 轨道水晶 x3
        for (var mi = 0; mi < 3; mi++) {
          var ma = time * 1.6 + mi * (Math.PI * 2 / 3) + e.wob
          var mx = Math.cos(ma) * r * 1.18
          var my = Math.sin(ma) * r * 0.6 - r * 0.05
          ctx.fillStyle = '#e6d3ff'
          ctx.save()
          ctx.translate(mx, my)
          ctx.rotate(ma)
          ctx.beginPath()
          ctx.moveTo(0, -r * 0.16); ctx.lineTo(r * 0.1, 0); ctx.lineTo(0, r * 0.16); ctx.lineTo(-r * 0.1, 0)
          ctx.closePath(); ctx.fill()
          ctx.restore()
        }
      } else if (kind === 'cannon') {
        // 重炮王：圆身 + 朝玩家的粗炮管 + 铆钉
        ctx.fillStyle = kdark
        ctx.beginPath(); ctx.arc(0, bw, r * 0.96, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = body
        ctx.beginPath(); ctx.arc(0, bw, r * 0.76, 0, Math.PI * 2); ctx.fill()
        // 炮管（暗管 + 亮口）
        ctx.save()
        ctx.rotate(ang)
        ctx.fillStyle = kdark
        var bl = r * (1.35 + 0.12 * Math.sin(time * 6 + e.wob))
        ctx.beginPath()
        ctx.moveTo(r * 0.3, -r * 0.26 + bw)
        ctx.lineTo(bl, -r * 0.16 + bw)
        ctx.lineTo(bl, r * 0.16 + bw)
        ctx.lineTo(r * 0.3, r * 0.26 + bw)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#ffd166'
        ctx.beginPath(); ctx.arc(bl, bw, r * 0.13, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
        // 铆钉
        ctx.fillStyle = '#ffe1ad'
        for (var ri2 = 0; ri2 < 6; ri2++) {
          var ra2 = (ri2 / 6) * Math.PI * 2 + 0.4
          ctx.beginPath()
          ctx.arc(Math.cos(ra2) * r * 0.56, Math.sin(ra2) * r * 0.56 + bw, r * 0.055, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (kind === 'wraith') {
        // 影杀王：雾状拖尾轮廓，瞬移时更透明
        var fade = e.tele > 0 ? 0.28 : 0.85
        ctx.globalAlpha = fade
        ctx.fillStyle = body
        ctx.beginPath()
        var gsegs = 12
        for (var gi = 0; gi <= gsegs; gi++) {
          var ga = (gi / gsegs) * Math.PI * 2 - Math.PI / 2
          var wob2 = 1 + 0.22 * Math.sin(time * 3.4 + ga * 3 + e.wob)
          var gx = Math.cos(ga) * r * wob2
          var gy = Math.sin(ga) * r * (0.92 + 0.12 * Math.sin(time * 2.6 + ga * 2)) + bw
          if (gi === 0) ctx.moveTo(gx, gy)
          else ctx.lineTo(gx, gy)
        }
        ctx.closePath(); ctx.fill()
        // 底部雾尾
        ctx.fillStyle = kcol
        ctx.beginPath()
        ctx.moveTo(-r * 0.6, r * 0.6 + bw)
        ctx.quadraticCurveTo(-r * 0.2, r * 1.3 + bw + Math.sin(time * 4) * r * 0.1, r * 0.6, r * 0.6 + bw)
        ctx.closePath(); ctx.fill()
        // 兜帽暗影
        ctx.fillStyle = kdark
        ctx.beginPath()
        ctx.arc(0, -r * 0.14 + bw, r * 0.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else if (kind === 'titan') {
        // 泰坦巨像：岩石巨躯 + 发光裂缝，每步都让地面颤动
        ctx.fillStyle = kdark
        ctx.beginPath()
        ctx.moveTo(-r * 0.9, r * 0.85 + bw)
        ctx.lineTo(-r * 0.62, -r * 0.7 + bw)
        ctx.lineTo(r * 0.62, -r * 0.7 + bw)
        ctx.lineTo(r * 0.9, r * 0.85 + bw)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.moveTo(-r * 0.66, r * 0.7 + bw)
        ctx.lineTo(-r * 0.44, -r * 0.48 + bw)
        ctx.lineTo(r * 0.44, -r * 0.48 + bw)
        ctx.lineTo(r * 0.66, r * 0.7 + bw)
        ctx.closePath(); ctx.fill()
        // 岩石裂缝（青光）
        ctx.strokeStyle = 'rgba(150,220,255,' + (0.6 + 0.3 * Math.sin(time * 3 + e.wob)) + ')'
        ctx.lineWidth = Math.max(1.5, r * 0.06)
        ctx.beginPath()
        ctx.moveTo(-r * 0.3, -r * 0.3 + bw); ctx.lineTo(-r * 0.1, r * 0.15 + bw); ctx.lineTo(r * 0.12, r * 0.45 + bw)
        ctx.moveTo(r * 0.3, -r * 0.25 + bw); ctx.lineTo(r * 0.16, r * 0.2 + bw)
        ctx.stroke()
        // 双肩巨石
        ctx.fillStyle = kdark
        ctx.beginPath(); ctx.arc(-r * 0.78, -r * 0.1 + bw, r * 0.3, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(r * 0.78, -r * 0.1 + bw, r * 0.3, 0, Math.PI * 2); ctx.fill()
      } else if (kind === 'plague') {
        // 瘟疫使者：破斗篷 + 周身漂浮的毒囊
        var pfl = Math.sin(time * 2.8 + e.wob) * r * 0.1
        ctx.fillStyle = '#24301a'
        ctx.beginPath()
        ctx.moveTo(0, -r * 0.5 + pfl)
        ctx.lineTo(r * 0.95, r * 0.85)
        ctx.lineTo(-r * 0.95, r * 0.85)
        ctx.closePath(); ctx.fill()
        // 斗袍破边（亮绿）
        ctx.strokeStyle = kcol
        ctx.lineWidth = r * 0.07
        ctx.beginPath()
        ctx.moveTo(-r * 0.8, r * 0.62); ctx.lineTo(-r * 0.3, r * 0.78); ctx.lineTo(r * 0.2, r * 0.6); ctx.lineTo(r * 0.78, r * 0.72)
        ctx.stroke()
        // 毒囊（三颗绿色气泡围绕）
        for (var pi = 0; pi < 3; pi++) {
          var pa2 = time * 1.4 + pi * (Math.PI * 2 / 3) + e.wob
          var px = Math.cos(pa2) * r * 1.1
          var py = Math.sin(pa2) * r * 0.55 + pfl
          ctx.globalAlpha = 0.85
          ctx.fillStyle = '#7ce88d'
          ctx.beginPath(); ctx.arc(px, py, r * 0.13, 0, Math.PI * 2); ctx.fill()
          ctx.globalAlpha = 1
        }
        // 尖帽
        ctx.fillStyle = '#1a2410'
        ctx.beginPath()
        ctx.moveTo(-r * 0.46, -r * 0.4 + pfl)
        ctx.lineTo(r * 0.46, -r * 0.4 + pfl)
        ctx.lineTo(r * 0.1, -r * 1.15 + pfl)
        ctx.closePath(); ctx.fill()
      } else if (kind === 'brood') {
        // 育母：臃肿的虫后腹部 + 身侧虫卵
        var bf = Math.sin(time * 2 + e.wob) * r * 0.05
        // 腹部
        ctx.fillStyle = '#4a2036'
        ctx.beginPath()
        ctx.ellipse(0, bw + r * 0.12, r * 0.92, r * 0.78, 0, 0, Math.PI * 2)
        ctx.fill()
        // 体节
        ctx.fillStyle = '#6c2f4e'
        for (var bi3 = -2; bi3 <= 2; bi3++) {
          ctx.beginPath()
          ctx.ellipse(bi3 * r * 0.3, bw + r * 0.1, r * 0.16, r * 0.6, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        // 头冠
        ctx.fillStyle = body
        ctx.beginPath(); ctx.arc(0, -r * 0.55 + bw, r * 0.4, 0, Math.PI * 2); ctx.fill()
        // 虫卵（身边两颗，微微搏动）
        for (var oi2 = -1; oi2 <= 1; oi2 += 2) {
          var es = 1 + 0.08 * Math.sin(time * 5 + e.wob + oi2)
          ctx.fillStyle = 'rgba(255,180,200,0.9)'
          ctx.beginPath()
          ctx.ellipse(oi2 * r * 0.95, r * 0.3 + bw, r * 0.2 * es, r * 0.26 * es, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        // 风暴领主：电光大漩涡 + 双臂闪电链
        var sw2 = time * 3 + e.wob
        // 漩涡光环
        for (var ri3 = 0; ri3 < 3; ri3++) {
          var rr3 = r * (0.6 + ri3 * 0.28)
          ctx.strokeStyle = 'rgba(90,220,255,' + (0.35 - ri3 * 0.1) + ')'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          var segs2 = 14
          for (var qi = 0; qi <= segs2; qi++) {
            var qa = (qi / segs2) * Math.PI * 2 + sw2 * (1 - ri3 * 0.35)
            var qx = Math.cos(qa) * rr3
            var qy = Math.sin(qa) * rr3 * 0.62 + bw
            if (qi === 0) ctx.moveTo(qx, qy)
            else ctx.lineTo(qx, qy)
          }
          ctx.stroke()
        }
        // 核心
        ctx.fillStyle = kdark
        ctx.beginPath(); ctx.arc(0, bw, r * 0.66, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = body
        ctx.beginPath(); ctx.arc(0, bw, r * 0.44, 0, Math.PI * 2); ctx.fill()
        // 双臂闪电链
        for (var li2 = -1; li2 <= 1; li2 += 2) {
          ctx.strokeStyle = 'rgba(150,240,255,' + (0.7 + 0.3 * Math.sin(time * 12 + li2)) + ')'
          ctx.lineWidth = Math.max(1.6, r * 0.1)
          ctx.beginPath()
          ctx.moveTo(li2 * r * 0.5, bw)
          var zap = Math.sin(time * 20 + li2) * r * 0.18
          ctx.lineTo(li2 * r * 0.95 + zap, -r * 0.4 + bw)
          ctx.lineTo(li2 * r * 1.3 - zap * 0.5, r * 0.1 + bw)
          ctx.stroke()
        }
      }

      // 发光双眼（BOSS 共通）
      var eg2 = 0.65 + 0.35 * Math.sin(time * 5)
      var coolEye = kind === 'wraith' || kind === 'titan' || kind === 'storm'
      ctx.fillStyle = coolEye
        ? 'rgba(120,255,236,' + (eg2 * (e.tele > 0 ? 0.4 : 1)) + ')'
        : kind === 'plague'
        ? 'rgba(160,255,140,' + eg2 + ')'
        : 'rgba(255,90,130,' + eg2 + ')'
      ctx.beginPath()
      ctx.arc(-r * 0.26, -r * 0.1 + bw, r * 0.13, 0, Math.PI * 2)
      ctx.arc(r * 0.26, -r * 0.1 + bw, r * 0.13, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(-r * 0.26, -r * 0.1 + bw, r * 0.05, 0, Math.PI * 2)
      ctx.arc(r * 0.26, -r * 0.1 + bw, r * 0.05, 0, Math.PI * 2)
      ctx.fill()
      // BOSS 名牌
      if (e.bossName) {
        ctx.font = '700 ' + Math.max(10, Math.round(r * 0.3)) + 'px sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'
        ctx.fillStyle = kcol
        var nm = e.bossName + (e.waveTag || '') + ' Lv.' + (e.lv || 1)
        ctx.strokeText(nm, 0, -r - 16)
        ctx.fillText(nm, 0, -r - 16)
      }
    } else {
      // 史莱姆： wobbling 果冻 body（多段弧拼出软体轮廓；LOD 时退化为椭圆）
      var jelly = time * 5 + e.wob
      ctx.fillStyle = body
      if (lod >= 1) {
        ctx.beginPath()
        ctx.ellipse(0, wob * 0.5, r, r * 0.86, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        var segs = 10
        for (var si2 = 0; si2 <= segs; si2++) {
          var aa = (si2 / segs) * Math.PI * 2 - Math.PI / 2
          var bulge = 1 + 0.1 * Math.sin(jelly + si2 * 1.7)
          var rx = Math.cos(aa) * r * bulge
          var ry = Math.sin(aa) * r * (0.86 + 0.1 * Math.cos(jelly * 1.3 + si2)) + wob * 0.5
          if (si2 === 0) ctx.moveTo(rx, ry)
          else ctx.lineTo(rx, ry)
        }
        ctx.closePath()
        ctx.fill()
      }
      // 底部暗色
      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      ctx.beginPath()
      ctx.ellipse(0, r * 0.42, r * 0.72, r * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
      if (lod === 0) {
        // 果冻高光
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.beginPath()
        ctx.ellipse(-r * 0.3, -r * 0.36, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 眼睛（BOSS 已画发光眼）
    if (e.type !== 'boss') {
      ctx.fillStyle = 'rgba(10,12,18,0.92)'
      var eyeR = Math.max(1.6, r * 0.16)
      ctx.beginPath()
      ctx.arc(-r * 0.3, -r * 0.08, eyeR, 0, Math.PI * 2)
      ctx.arc(r * 0.3, -r * 0.08, eyeR, 0, Math.PI * 2)
      ctx.fill()
    }

    // 精英/BOSS 外圈
    if (e.type === 'elite' || e.type === 'boss') {
      ctx.strokeStyle = e.type === 'boss' ? 'rgba(255,90,130,0.85)' : 'rgba(200,120,255,0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, r + 5 + Math.sin(time * 4) * 2, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 受伤血条
    if (e.hp < e.maxHp && e.hp > 0) {
      var bw2 = Math.max(16, r * 1.8)
      var bx2 = -bw2 / 2
      var by2 = -r - (e.type === 'boss' ? 12 : 8)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(bx2, by2, bw2, 3)
      var ratio = Math.max(0, e.hp / e.maxHp)
      ctx.fillStyle = ratio > 0.5 ? '#7cf59e' : ratio > 0.25 ? '#ffce5c' : '#ff5577'
      ctx.fillRect(bx2, by2, bw2 * ratio, 3)
      // 等级小标（怪伤时才显示，避免满屏幕数字）
      if (!e.bossName) {
        ctx.font = '700 9px sans-serif'
        ctx.textAlign = 'left'
        ctx.lineWidth = 2.5
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'
        ctx.fillStyle = 'rgba(255,235,180,0.95)'
        var lt = 'Lv.' + (e.lv || 1)
        ctx.strokeText(lt, bx2 + bw2 + 3, by2 + 3)
        ctx.fillText(lt, bx2 + bw2 + 3, by2 + 3)
      }
    }
    // 手动模式：被辅助瞄准锁定的敌人画一个红色准星
    if (e.id === this._aimLockId) {
      var rr2 = r + 9
      ctx.strokeStyle = 'rgba(255,90,120,0.9)'
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(-rr2, -rr2 + 6); ctx.lineTo(-rr2, -rr2); ctx.lineTo(-rr2 + 6, -rr2)
      ctx.moveTo(rr2 - 6, -rr2); ctx.lineTo(rr2, -rr2); ctx.lineTo(rr2, -rr2 + 6)
      ctx.moveTo(rr2, rr2 - 6); ctx.lineTo(rr2, rr2); ctx.lineTo(rr2 - 6, rr2)
      ctx.moveTo(-rr2 + 6, rr2); ctx.lineTo(-rr2, rr2); ctx.lineTo(-rr2, rr2 - 6)
      ctx.stroke()
    }
    ctx.restore()
  }

  function playerPal(hurt, jobId) {
    var classes = root.MowSim && root.MowSim.CLASSES
    var jp = (classes && jobId && classes[jobId] && classes[jobId].pal) || null
    return {
      H: hurt ? '#ff8fa3' : jp ? jp.H : '#14663c',   // 兜帽（职业色）
      h: hurt ? '#c24a5e' : jp ? jp.h : '#0d4a2b',   // 兜帽暗部
      S: hurt ? '#ffc9d4' : '#f4cba0',               // 皮肤
      E: '#17304a',                                  // 眼睛
      C: hurt ? '#ff9fb0' : jp ? jp.C : '#3ddc84',   // 外套亮面（职业色）
      c: hurt ? '#c95568' : jp ? jp.c : '#1d9457',   // 外套暗面
      B: '#1b2436',                                  // 靴子
    }
  }

  /* 像素小人：12 列 × 13 行，顶部位图共用，腿部两帧走路动画 */
  var PLAYER_TOP = [
    '....HHHH....',
    '...HhhhhH...',
    '...HSSSSH...',
    '...HSEESH...',
    '....SSSS....',
    '..CCCCCCCC..',
    '.CCccccccCC.',
    '.CCCCCCCCCC.',
    '..CCCCCCCC..',
  ]
  var PLAYER_LEGS = [
    ['...C....C...', '...C....C...', '...B....B...'],
    ['....C..C....', '....C..C....', '....B..B....'],
  ]

  Renderer.prototype.drawPlayer = function (ctx, s, time) {
    var p = s.player
    var blink = p.iframe > 0 && Math.floor(time * 20) % 2 === 0
    var hurt = p.hurtFlash > 0
    var face = p.face || 1
    var moving = Math.hypot(p.vx, p.vy) > 8
    var walk = moving ? Math.floor((p.walkPhase || 0) / Math.PI) % 2 : 0
    var aim = p.aim || 0
    var R = p.r
    var PX = 2.5   // 每个「像素」的边长（游戏单位）

    ctx.save()
    ctx.translate(p.x, p.y)

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(0, R * 0.95, R * 0.78, R * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()

    // 光环
    ctx.globalAlpha = 0.5
    ctx.drawImage(this.glow.green, -36, -36, 72, 72)
    ctx.globalAlpha = 1

    // 手动模式的瞄准指示（地面箭头，指向锁定的敌人）
    if (!s.autoFire) {
      ctx.save()
      ctx.rotate(aim)
      ctx.fillStyle = 'rgba(255,120,140,0.85)'
      ctx.beginPath()
      ctx.moveTo(R + 16, 0)
      ctx.lineTo(R + 5, 5.5)
      ctx.lineTo(R + 5, -5.5)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,120,140,0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, R + 11, -0.5, 0.5)
      ctx.stroke()
      ctx.restore()
    }

    if (!blink) {
      var PAL = playerPal(hurt, s.job)
      var legs = PLAYER_LEGS[walk] || PLAYER_LEGS[0]
      var rows = PLAYER_TOP.concat(legs)
      var H = rows.length, W = rows[0].length
      var bob = moving ? Math.sin(p.walkPhase || 0) * 0.7 : 0
      var ox = -W * PX / 2, oy = -H * PX / 2 + bob - PX * 0.4
      for (var r = 0; r < H; r++) {
        var line = rows[r]
        for (var c = 0; c < W; c++) {
          var ch = line.charAt(face >= 0 ? c : (W - 1 - c))
          var col = PAL[ch]
          if (!col) continue
          ctx.fillStyle = col
          ctx.fillRect(ox + c * PX, oy + r * PX, PX + 0.6, PX + 0.6)
        }
      }
      // 像素剑：从肩部沿 aim 方向伸出（手臂 2 格 + 刀身 4 格）
      ctx.save()
      ctx.translate(face * PX * 2.2, oy + PX * 7)
      ctx.rotate(aim)
      ctx.fillStyle = hurt ? '#ffd0d8' : '#e8f6ff'   // 刀身
      ctx.fillRect(PX * 2.2, -PX * 0.42, PX * 4.0, PX * 0.84)
      ctx.fillStyle = '#9fb6c9'                      // 刀刃暗面
      ctx.fillRect(PX * 2.2, PX * 0.14, PX * 4.0, PX * 0.28)
      ctx.fillStyle = hurt ? '#ffc9d4' : '#f4cba0'   // 手
      ctx.fillRect(PX * 1.4, -PX * 0.42, PX * 1.0, PX * 0.84)
      ctx.fillStyle = '#8a5a2b'                      // 剑柄
      ctx.fillRect(PX * 1.4, -PX * 0.56, PX * 0.7, PX * 1.12)
      ctx.restore()
    }
    ctx.restore()
  }

  root.MowRenderer = Renderer
})(typeof globalThis !== 'undefined' ? globalThis : this)
