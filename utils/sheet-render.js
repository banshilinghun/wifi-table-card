/**
 * utils/sheet-render.js
 * 把一张 A4 拼版画出来：预览与 300dpi 导出共用这一个函数，只改每毫米像素数。
 *
 * 每份都走 utils/draw 的同一套分派：白纸系列画「装饰层 + 自适应信息层」，
 * 深色系列画它自己的背景 / 纹样 / 槽位排版。拼版上的每一张和编辑页看到的
 * 是同一套绘制逻辑，不会「预览对、打印错」，也不会把深色模板画成白纸。
 */

var draw = require('./draw')

var CUT_COLOR = '#B8B8B8'

/** 卡片的旋转 90° 变换：让横向格子里的竖版牌正着画 */
function withCardTransform (ctx, card, k, fn) {
  var cw = Math.round(card.logicalW * k)
  var ch = Math.round(card.logicalH * k)

  ctx.save()
  ctx.translate(Math.round((card.x + card.w / 2) * k), Math.round((card.y + card.h / 2) * k))
  if (card.rotate) ctx.rotate(Math.PI / 2)
  ctx.translate(-Math.round(cw / 2), -Math.round(ch / 2))
  fn(cw, ch)
  ctx.restore()
}

function drawCutMarks (ctx, plan, k) {
  var style = plan.cut
  if (!style || style === 'none') return

  ctx.save()
  ctx.strokeStyle = CUT_COLOR
  ctx.lineWidth = Math.max(1, 0.16 * k)
  ctx.lineCap = 'butt'

  plan.cards.forEach(function (card) {
    var x = card.x * k
    var y = card.y * k
    var w = card.w * k
    var h = card.h * k

    if (style === 'dash') {
      ctx.setLineDash([Math.max(3, 4 * k), Math.max(3, 4 * k)])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
      return
    }

    if (style === 'corner') {
      var len = Math.min(6 * k, w * 0.12, h * 0.12)
      var pts = [
        [x, y, 1, 1], [x + w, y, -1, 1],
        [x, y + h, 1, -1], [x + w, y + h, -1, -1]
      ]
      pts.forEach(function (p) {
        ctx.beginPath()
        ctx.moveTo(p[0] + len * p[2], p[1])
        ctx.lineTo(p[0], p[1])
        ctx.lineTo(p[0], p[1] + len * p[3])
        ctx.stroke()
      })
      return
    }

    // cross：四角十字 + 沿边点线
    var arm = Math.min(5 * k, w * 0.1, h * 0.1)
    var corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]
    corners.forEach(function (c) {
      ctx.beginPath()
      ctx.moveTo(c[0] - arm, c[1])
      ctx.lineTo(c[0] + arm, c[1])
      ctx.moveTo(c[0], c[1] - arm)
      ctx.lineTo(c[0], c[1] + arm)
      ctx.stroke()
    })

    ctx.setLineDash([Math.max(1, 1 * k), Math.max(4, 5 * k)])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
  })

  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} plan utils/print-layout.js 的 planSheet 结果
 * @param {object} tpl 模板
 * @param {object} data {shopName,ssid,password,type,showPassword,payload}
 * @param {{art?:Image, bounds?:object, pxPerMm:number, vertical?:boolean, mm?:object}} opts
 * @returns {{width:number,height:number,cards:number,qrMm:number,moduleMm:number,
 *            moduleCount:number,warnings:string[]}}
 */
function renderSheet (ctx, plan, tpl, data, opts) {
  var o = opts || {}
  var k = o.pxPerMm || (300 / 25.4)
  var W = Math.round(plan.sheet.w * k)
  var H = Math.round(plan.sheet.h * k)
  var isPaper = !!(tpl && tpl.series === 'paper')

  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  var metas = []
  plan.cards.forEach(function (card) {
    var meta = null
    withCardTransform(ctx, card, k, function (cw, ch) {
      meta = draw.drawTemplate(ctx, tpl, data, cw, ch, {
        art: isPaper ? o.art : null,
        bounds: isPaper ? o.bounds : null,
        vertical: o.vertical,
        mm: { w: card.logicalW, h: card.logicalH }
      })
    })
    metas.push(meta)
  })

  // 裁切线最后画，避免被卡片的 clearRect 擦掉
  drawCutMarks(ctx, plan, k)

  ctx.restore()

  var first = metas[0] || null
  var qrMm = 0
  var moduleMm = 0
  var moduleCount = 0
  var warnings = []

  if (first && first.qr) {
    moduleCount = first.qr.moduleCount || 0
    if (isPaper && first.qr.sizeMm) {
      // 白纸渲染器自己按 mm 换算过，直接采信
      qrMm = first.qr.sizeMm
      moduleMm = first.qr.moduleMm
    } else {
      // 深色渲染器只出像素，按每毫米像素数倒推
      qrMm = first.qr.size / k
      moduleMm = moduleCount ? qrMm / (moduleCount + (first.qr.quiet || 4) * 2) : 0
    }
    warnings = first.warnings || []
  }

  return {
    width: W,
    height: H,
    cards: plan.cards.length,
    pxPerMm: k,
    series: isPaper ? 'paper' : 'dark',
    rotate: !!plan.rotate,
    qrMm: qrMm,
    moduleMm: moduleMm,
    moduleCount: moduleCount,
    warnings: warnings,
    // 第一张的完整元数据：文案、竖排、避免区都在这，调试与验收都要看
    card: first,
    ssid: first ? first.ssid : null,
    pwd: first ? first.pwd : null,
    vertical: first ? first.vertical : null
  }
}

module.exports = {
  renderSheet: renderSheet,
  drawCutMarks: drawCutMarks,
  CUT_COLOR: CUT_COLOR
}
