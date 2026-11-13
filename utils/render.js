/**
 * utils/render.js
 * 桌牌渲染：屏幕预览与高清导出共用同一份绘制逻辑，只改 width / height。
 *
 * 单位约定与 utils/templates.js 一致：
 *   x / cx / x1 / x2 → 相对宽 W      y / cy / y1 / y2 → 相对高 H
 *   其余长度          → 相对短边 M = min(W, H)
 *
 * 二维码统一走 utils/qr-canvas.js 的 drawQRCode：内部固定白底 + 4 模块静区，
 * 本文件额外在其外围补一圈白色卡片，避免深色模板的装饰线压到静区。
 */

var qrCanvas = require('./qr-canvas')

var SANS = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif'
var SERIF = '"Songti SC", "STSong", "Times New Roman", serif'

var QR_QUIET = 4

function family (tpl) {
  return tpl && tpl.font === 'serif' ? SERIF : SANS
}

function color (tpl, value) {
  if (!value) return '#000000'
  if (value.charAt(0) === '#') return value
  return (tpl.palette && tpl.palette[value]) || '#000000'
}

function setFont (ctx, size, weight, fam) {
  ctx.font = (weight || '400') + ' ' + size.toFixed(2) + 'px ' + fam
}

function measureText (ctx, text, size, weight, fam) {
  setFont(ctx, size, weight, fam)
  var m = ctx.measureText(text)
  return (m && m.width) || 0
}

/**
 * 在 maxWidth 内放下文本：先按比例缩小字号（不低于 baseSize * minScale），
 * 缩到下限仍放不下才用省略号截断。
 * @returns {{size:number, text:string, shrunk:boolean, truncated:boolean}}
 */
function fitText (ctx, text, maxWidth, baseSize, weight, fam, minScale) {
  var str = String(text == null ? '' : text)
  var floor = Math.max(4, baseSize * (minScale == null ? 0.5 : minScale))
  var size = baseSize
  var width = measureText(ctx, str, size, weight, fam)
  var shrunk = false

  if (width > maxWidth) {
    for (var i = 0; i < 10 && width > maxWidth && size > floor; i++) {
      size = Math.max(floor, size * Math.min(0.97, maxWidth / width))
      width = measureText(ctx, str, size, weight, fam)
      shrunk = true
    }
  }

  var truncated = false
  if (width > maxWidth && str.length > 1) {
    var ellipsis = '…'
    var cut = str
    while (cut.length > 1 && measureText(ctx, cut + ellipsis, size, weight, fam) > maxWidth) {
      cut = cut.slice(0, cut.length - 1)
    }
    str = cut + ellipsis
    truncated = true
  }

  setFont(ctx, size, weight, fam)
  return { size: size, text: str, shrunk: shrunk, truncated: truncated }
}

function roundedRect (ctx, x, y, w, h, r) {
  var rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + rr)
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function drawFrame (ctx, tpl, W, H, M) {
  var f = tpl.frame
  if (!f) return

  var inset = f.inset * M
  var strokeW = Math.max(1, f.width * M)

  ctx.strokeStyle = color(tpl, f.color)
  ctx.lineWidth = strokeW
  ctx.globalAlpha = f.alpha == null ? 1 : f.alpha
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)

  if (f.double) {
    var inset2 = inset + M * 0.018
    ctx.globalAlpha = (f.alpha == null ? 1 : f.alpha) * 0.55
    ctx.lineWidth = Math.max(1, strokeW * 0.5)
    ctx.strokeRect(inset2, inset2, W - inset2 * 2, H - inset2 * 2)
  }

  ctx.globalAlpha = 1
}

function drawDecor (ctx, tpl, W, H, M) {
  var list = tpl.decor || []

  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    var fill = color(tpl, item.color)
    ctx.globalAlpha = item.alpha == null ? 1 : item.alpha

    if (item.type === 'rect') {
      ctx.fillStyle = fill
      var rw = item.w * M
      var rh = item.h * M
      ctx.fillRect(item.x * W - rw / 2, item.y * H - rh / 2, rw, rh)
    } else if (item.type === 'circle') {
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(item.cx * W, item.cy * H, item.r * M, 0, Math.PI * 2)
      ctx.fill()
    } else if (item.type === 'ring') {
      ctx.strokeStyle = fill
      ctx.lineWidth = Math.max(1, item.w * M)
      ctx.beginPath()
      ctx.arc(item.cx * W, item.cy * H, item.r * M, 0, Math.PI * 2)
      ctx.stroke()
    } else if (item.type === 'line') {
      if (!item.w) continue
      ctx.strokeStyle = fill
      ctx.lineWidth = Math.max(1, item.w * M)
      ctx.beginPath()
      ctx.moveTo(item.x1 * W, item.y1 * H)
      ctx.lineTo(item.x2 * W, item.y2 * H)
      ctx.stroke()
    } else if (item.type === 'dots') {
      var step = Math.max(2, item.gap * M)
      var radius = Math.max(0.5, item.r * M)
      var cols = Math.max(1, Math.round((item.w * M) / step) + 1)
      var rows = Math.max(1, Math.round((item.h * M) / step) + 1)
      var startX = item.x * W - (cols - 1) * step / 2
      var startY = item.y * H - (rows - 1) * step / 2
      ctx.fillStyle = fill
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          ctx.beginPath()
          ctx.arc(startX + c * step, startY + r * step, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else if (item.type === 'grid') {
      var gap = Math.max(4, item.gap * M)
      var thick = Math.max(0.5, item.thick * M)
      var gw = item.w * W
      var gh = item.h * H
      var gx = item.x * W - gw / 2
      var gy = item.y * H - gh / 2
      ctx.strokeStyle = fill
      ctx.lineWidth = thick
      ctx.beginPath()
      for (var vx = gx; vx <= gx + gw; vx += gap) {
        ctx.moveTo(vx, gy)
        ctx.lineTo(vx, gy + gh)
      }
      for (var vy = gy; vy <= gy + gh; vy += gap) {
        ctx.moveTo(gx, vy)
        ctx.lineTo(gx + gw, vy)
      }
      ctx.stroke()
    } else if (item.type === 'polyline') {
      var pts = item.points || []
      if (pts.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(pts[0][0] * W, pts[0][1] * H)
      for (var k = 1; k < pts.length; k++) {
        ctx.lineTo(pts[k][0] * W, pts[k][1] * H)
      }
      if (item.closed) {
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.fill()
      } else {
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(1, (item.w || 0.003) * M)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
    }
  }

  ctx.globalAlpha = 1
}

function drawSlot (ctx, tpl, slot, text, W, H, M, defaultMinScale) {
  if (!text) return null

  var fam = family(tpl)
  var baseSize = slot.size * M
  var maxWidth = slot.maxW * W

  var fitted = fitText(
    ctx,
    text,
    maxWidth,
    baseSize,
    slot.weight || '400',
    fam,
    slot.minScale == null ? defaultMinScale : slot.minScale
  )

  var x = slot.x * W
  // 用 textAlign 处理左右边界，避免依赖 measureText 的二次计算
  if (slot.align === 'left') {
    x = Math.max(x, slot.size * M * 0.5)
  } else if (slot.align === 'right') {
    x = Math.min(x, W - slot.size * M * 0.5)
  }

  ctx.textAlign = slot.align || 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color(tpl, slot.color || 'ink')
  ctx.fillText(fitted.text, x, slot.y * H)

  return fitted
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} template utils/templates.js 中的一项
 * @param {{shopName?:string, ssid?:string, password?:string, payload?:string}} data
 * @param {number} width  逻辑宽度（预览与导出只改这里）
 * @param {number} height 逻辑高度
 */
function renderSign (ctx, template, data, width, height) {
  var tpl = template
  var d = data || {}
  var W = Math.max(1, Math.round(width))
  var H = Math.max(1, Math.round(height))
  var M = Math.min(W, H)

  ctx.save()
  ctx.clearRect(0, 0, W, H)

  if (tpl.palette.bgEnd && tpl.palette.bgEnd !== tpl.palette.bg) {
    var grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, color(tpl, tpl.palette.bg))
    grad.addColorStop(1, color(tpl, tpl.palette.bgEnd))
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = color(tpl, tpl.palette.bg)
  }
  ctx.fillRect(0, 0, W, H)

  drawFrame(ctx, tpl, W, H, M)
  drawDecor(ctx, tpl, W, H, M)

  var shopMeta = drawSlot(ctx, tpl, tpl.slots.shop, d.shopName, W, H, M, 0.5)

  // 二维码：白色卡片 + drawQRCode 自带的 4 模块静区
  var qrSlot = tpl.slots.qr
  var qrSize = qrSlot.size * M
  var qx = qrSlot.cx * W - qrSize / 2
  var qy = qrSlot.cy * H - qrSize / 2
  var pad = M * 0.022

  ctx.globalAlpha = 1
  ctx.fillStyle = '#FFFFFF'
  roundedRect(ctx, qx - pad, qy - pad, qrSize + pad * 2, qrSize + pad * 2, M * 0.014)
  ctx.fill()

  var qrMeta = qrCanvas.drawQRCode(ctx, d.payload || '', {
    x: qx,
    y: qy,
    size: qrSize,
    quiet: QR_QUIET,
    ec: 'M',
    dark: color(tpl, tpl.palette.qrDark || 'ink'),
    light: '#FFFFFF'
  })

  var ssidMeta = drawSlot(ctx, tpl, tpl.slots.ssid, d.ssid, W, H, M, 0.42)
  var hintMeta = drawSlot(ctx, tpl, tpl.slots.hint, tpl.copy && tpl.copy.hint, W, H, M, 0.7)

  ctx.restore()

  return {
    width: W,
    height: H,
    qr: {
      x: qx,
      y: qy,
      size: qrSize,
      quiet: QR_QUIET,
      moduleCount: qrMeta.moduleCount,
      cell: qrMeta.size / (qrMeta.moduleCount + QR_QUIET * 2)
    },
    shop: shopMeta,
    ssid: ssidMeta
  }
}

module.exports = {
  renderSign: renderSign,
  fitText: fitText,
  measureText: measureText,
  setFont: setFont
}
