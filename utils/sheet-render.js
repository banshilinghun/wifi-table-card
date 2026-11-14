/**
 * utils/sheet-render.js
 * 把一张 A4 拼版画出来：预览与 300dpi 导出共用这一个函数，只改每毫米像素数。
 *
 * 每份都是一次完整的 paper-render 调用（装饰图层 + 信息层），
 * 所以拼版上的每一张和编辑页看到的是同一套绘制逻辑，不会「预览对、打印错」。
 */

var paperRender = require('./paper-render')

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
 * @param {object} data {shopName,ssid,password,type,showPassword,payload,mm}
 * @param {{art?:Image, bounds?:object, pxPerMm:number, vertical?:boolean}} opts
 * @returns {{width:number,height:number,cards:number,qr:mm:number}}
 */
function renderSheet (ctx, plan, tpl, data, opts) {
  var o = opts || {}
  var k = o.pxPerMm || (300 / 25.4)
  var W = Math.round(plan.sheet.w * k)
  var H = Math.round(plan.sheet.h * k)

  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  var metas = []
  plan.cards.forEach(function (card) {
    var meta = null
    withCardTransform(ctx, card, k, function (cw, ch) {
      meta = paperRender.renderPaper(ctx, tpl, data, cw, ch, {
        art: o.art,
        bounds: o.bounds,
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
  return {
    width: W,
    height: H,
    cards: plan.cards.length,
    pxPerMm: k,
    qrMm: first ? first.qr.sizeMm : 0,
    moduleMm: first ? first.qr.moduleMm : 0,
    warnings: first ? first.warnings : []
  }
}

module.exports = {
  renderSheet: renderSheet,
  drawCutMarks: drawCutMarks,
  CUT_COLOR: CUT_COLOR
}
