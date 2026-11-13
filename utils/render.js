/**
 * utils/render.js
 * 桌牌渲染：屏幕预览与高清导出共用同一份绘制逻辑，只改 width / height。
 *
 * 单位约定与 templates/index.js 一致：
 *   x / cx / x1 / x2 → 相对宽 W      y / cy / y1 / y2 → 相对高 H
 *   其余长度          → 相对短边 M = min(W, H)
 *
 * 二维码统一走 utils/qr-canvas.js 的 drawQRCode：内部固定 #FFFFFF 底色 +
 * 4 模块静区。本文件在它外围再补一层白色圆角托底，因此任何深色底、网格线、
 * 等高线都压不到静区——这是结构保证，不是靠调参数。
 */

var qrCanvas = require('./qr-canvas')

var SANS = '-apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif'
var SERIF = '"Songti SC", "STSong", "Times New Roman", "SimSun", serif'

var QR_QUIET = 4

/* ── 基础工具 ───────────────────────────────────────────── */

function family (tpl) {
  return tpl && tpl.font === 'serif' ? SERIF : SANS
}

function color (tpl, value) {
  if (!value) return '#000000'
  if (value.charAt(0) === '#') return value
  return (tpl.palette && tpl.palette[value]) || '#000000'
}

function setFont (ctx, size, weight, fam) {
  ctx.font = (weight || '400') + ' ' + Math.max(1, size).toFixed(2) + 'px ' + fam
}

function measureText (ctx, text, size, weight, fam) {
  setFont(ctx, size, weight, fam)
  var m = ctx.measureText(text)
  return (m && m.width) || 0
}

/** 带字距的文本宽度（逐字相加，避免依赖 letterSpacing 支持度） */
function measureTracked (ctx, text, size, weight, fam, tracking) {
  var chars = splitChars(text)
  var extra = tracking * size
  var total = 0
  for (var i = 0; i < chars.length; i++) {
    total += measureText(ctx, chars[i], size, weight, fam) + extra
  }
  return total > 0 ? total - extra : 0
}

/** 按码点切分，避免 emoji 被拆成两个残缺代理项 */
function splitChars (text) {
  var out = []
  var str = String(text == null ? '' : text)
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      out.push(str.substr(i, 2))
      i++
    } else {
      out.push(str.charAt(i))
    }
  }
  return out
}

/**
 * 在 maxWidth 内放下文本：先按比例缩小字号（不低于 baseSize * minScale），
 * 缩到下限仍放不下才用省略号截断。
 * @returns {{size:number, text:string, width:number, shrunk:boolean, truncated:boolean}}
 */
function fitText (ctx, text, maxWidth, baseSize, weight, fam, minScale) {
  var str = String(text == null ? '' : text)
  var floor = Math.max(3, baseSize * (minScale == null ? 0.5 : minScale))
  var size = baseSize
  var width = measureText(ctx, str, size, weight, fam)
  var shrunk = false

  if (width > maxWidth) {
    for (var i = 0; i < 12 && width > maxWidth && size > floor; i++) {
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
    width = measureText(ctx, str, size, weight, fam)
    truncated = true
  }

  setFont(ctx, size, weight, fam)
  return { size: size, text: str, width: width, shrunk: shrunk, truncated: truncated }
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

var DEG = Math.PI / 180

/* ── 背景 ───────────────────────────────────────────────── */

function drawBackground (ctx, tpl, W, H) {
  var bg = tpl.background || { type: 'solid' }
  var from = color(tpl, tpl.palette.bg)
  var to = color(tpl, tpl.palette.bgEnd || tpl.palette.bg)

  if (bg.type === 'linear' && tpl.palette.bgEnd) {
    var g
    if (bg.angle === 0) g = ctx.createLinearGradient(0, 0, W, 0)
    else if (bg.angle === 45) g = ctx.createLinearGradient(0, H, W, 0)
    else if (bg.angle === 135) g = ctx.createLinearGradient(0, 0, W, H)
    else g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, from)
    g.addColorStop(1, to)
    ctx.fillStyle = g
  } else if (bg.type === 'radial' && tpl.palette.bgEnd) {
    var at = bg.at || [0.5, 0.5]
    var radius = (bg.r || 1) * Math.max(W, H)
    var rg = ctx.createRadialGradient(at[0] * W, at[1] * H, 0, at[0] * W, at[1] * H, radius)
    rg.addColorStop(0, to)
    rg.addColorStop(1, from)
    ctx.fillStyle = rg
  } else {
    ctx.fillStyle = from
  }

  ctx.fillRect(0, 0, W, H)
}

/* ── 纹样 ───────────────────────────────────────────────── */

function drawMotifs (ctx, tpl, W, H, M) {
  var list = tpl.motifs || []

  for (var i = 0; i < list.length; i++) {
    var m = list[i]
    var fill = color(tpl, m.color)
    ctx.save()
    ctx.globalAlpha = m.alpha == null ? 1 : m.alpha

    switch (m.type) {
      case 'rect': {
        var rw = m.w * M
        var rh = m.h * M
        ctx.fillStyle = fill
        ctx.fillRect(m.x * W - rw / 2, m.y * H - rh / 2, rw, rh)
        break
      }

      case 'panel': {
        var pw = m.w * W
        var ph = m.h * H
        ctx.fillStyle = fill
        roundedRect(ctx, m.x * W - pw / 2, m.y * H - ph / 2, pw, ph, (m.r || 0.02) * M)
        ctx.fill()
        break
      }

      case 'circle': {
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.arc(m.cx * W, m.cy * H, m.r * M, 0, Math.PI * 2)
        ctx.fill()
        break
      }

      case 'ring': {
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.5, (m.w || 0.002) * M)
        ctx.beginPath()
        ctx.arc(m.cx * W, m.cy * H, m.r * M, 0, Math.PI * 2)
        ctx.stroke()
        break
      }

      case 'line': {
        if (!m.w) break
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.5, m.w * M)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x1 * W, m.y1 * H)
        ctx.lineTo(m.x2 * W, m.y2 * H)
        ctx.stroke()
        break
      }

      case 'frame': {
        var inset = (m.inset || 0.05) * M
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.5, (m.w || 0.002) * M)
        ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
        if (m.double) {
          var i2 = inset + M * 0.016
          ctx.lineWidth = Math.max(0.5, (m.w || 0.002) * M * 0.5)
          ctx.strokeRect(i2, i2, W - i2 * 2, H - i2 * 2)
        }
        break
      }

      case 'corner': {
        var ci = (m.inset || 0.04) * M
        var len = (m.len || 0.05) * M
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.5, (m.w || 0.0015) * M)
        ctx.lineCap = 'square'
        var pts = [
          [ci, ci + len, ci, ci, ci + len, ci],
          [W - ci - len, ci, W - ci, ci, W - ci, ci + len],
          [ci, H - ci - len, ci, H - ci, ci + len, H - ci],
          [W - ci - len, H - ci, W - ci, H - ci, W - ci, H - ci - len]
        ]
        ctx.beginPath()
        for (var p = 0; p < pts.length; p++) {
          ctx.moveTo(pts[p][0], pts[p][1])
          ctx.lineTo(pts[p][2], pts[p][3])
          ctx.lineTo(pts[p][4], pts[p][5])
        }
        ctx.stroke()
        break
      }

      case 'dots': {
        var step = Math.max(2, m.gap * M)
        var radius = Math.max(0.4, m.r * M)
        var cols = Math.max(1, Math.round((m.w * W) / step) + 1)
        var rows = Math.max(1, Math.round((m.h * H) / step) + 1)
        var sx = m.x * W - (cols - 1) * step / 2
        var sy = m.y * H - (rows - 1) * step / 2
        ctx.fillStyle = fill
        for (var rr = 0; rr < rows; rr++) {
          for (var cc = 0; cc < cols; cc++) {
            ctx.beginPath()
            ctx.arc(sx + cc * step, sy + rr * step, radius, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        break
      }

      case 'grid': {
        var gap = Math.max(3, m.gap * M)
        var gw = m.w * W
        var gh = m.h * H
        var gx = m.x * W - gw / 2
        var gy = m.y * H - gh / 2
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.4, m.thick * M)
        ctx.beginPath()
        for (var vx = gx; vx <= gx + gw + 0.5; vx += gap) {
          ctx.moveTo(vx, gy)
          ctx.lineTo(vx, gy + gh)
        }
        for (var vy = gy; vy <= gy + gh + 0.5; vy += gap) {
          ctx.moveTo(gx, vy)
          ctx.lineTo(gx + gw, vy)
        }
        ctx.stroke()
        break
      }

      case 'diagonal': {
        var dw = m.w * W
        var dh = m.h * H
        var dgx = m.x * W - dw / 2
        var dgy = m.y * H - dh / 2
        ctx.save()
        ctx.beginPath()
        ctx.rect(dgx, dgy, dw, dh)
        ctx.clip()
        ctx.translate(m.x * W, m.y * H)
        ctx.rotate((m.angle || 45) * DEG)
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.4, (m.thick || 0.001) * M)
        var span = Math.max(dw, dh) * 1.5
        var dstep = Math.max(3, (m.gap || 0.05) * M)
        ctx.beginPath()
        for (var o = -span; o <= span; o += dstep) {
          ctx.moveTo(-span, o)
          ctx.lineTo(span, o)
        }
        ctx.stroke()
        ctx.restore()
        break
      }

      case 'bars': {
        var count = Math.max(1, m.n || 2)
        var bw = m.w * W
        var bh = m.h * H
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.4, (m.thick || 0.001) * M)
        ctx.beginPath()
        for (var b = 0; b < count; b++) {
          var t = count === 1 ? 0.5 : b / (count - 1)
          var bx = m.x * W - bw / 2 + t * bw
          ctx.moveTo(bx, m.y * H - bh / 2)
          ctx.lineTo(bx, m.y * H + bh / 2)
        }
        ctx.stroke()
        break
      }

      case 'arc': {
        var arcs = Math.max(1, m.count || 1)
        var astep = (m.step || 0.04) * M
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.4, (m.w || 0.0016) * M)
        for (var a = 0; a < arcs; a++) {
          ctx.beginPath()
          ctx.arc(m.cx * W, m.cy * H, m.r * M + a * astep,
            (m.from || 0) * DEG, (m.to == null ? 360 : m.to) * DEG)
          ctx.stroke()
        }
        break
      }

      case 'wave': {
        var rows2 = Math.max(1, m.count || 1)
        var wstep = (m.step || 0.02) * M
        var amp = (m.amp || 0.01) * M
        var wl = Math.max(0.02, m.wave || 0.08) * W
        var halfW = (m.w * W) / 2
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.4, (m.thick || 0.001) * M)
        ctx.beginPath()
        for (var wr = 0; wr < rows2; wr++) {
          var baseY = m.y * H + wr * wstep
          var seg = 40
          for (var s = 0; s <= seg; s++) {
            var px = m.x * W - halfW + (2 * halfW) * (s / seg)
            var py = baseY + Math.sin((px / wl) * Math.PI * 2) * amp
            if (s === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
        }
        ctx.stroke()
        break
      }

      case 'contour': {
        var rings = Math.max(1, m.count || 1)
        var rstep = (m.step || 0.05) * M
        var wob = (m.wobble || 0.01) * M
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(0.3, (m.w || 0.001) * M)
        ctx.beginPath()
        for (var k = 0; k < rings; k++) {
          var baseR = m.r0 * M + k * rstep
          var segs = 72
          for (var q = 0; q <= segs; q++) {
            var ang = (q / segs) * Math.PI * 2
            var wobble = Math.sin(ang * 3 + k * 1.1) * wob + Math.sin(ang * 5 + k * 0.6) * wob * 0.4
            var rad = baseR + wobble
            var cx2 = m.cx * W + Math.cos(ang) * rad
            var cy2 = m.cy * H + Math.sin(ang) * rad * 0.92
            if (q === 0) ctx.moveTo(cx2, cy2)
            else ctx.lineTo(cx2, cy2)
          }
          ctx.closePath()
        }
        ctx.stroke()
        break
      }

      case 'polyline': {
        var points = m.points || []
        if (points.length < 2) break
        ctx.beginPath()
        ctx.moveTo(points[0][0] * W, points[0][1] * H)
        for (var n = 1; n < points.length; n++) {
          ctx.lineTo(points[n][0] * W, points[n][1] * H)
        }
        if (m.closed) {
          ctx.closePath()
          ctx.fillStyle = fill
          ctx.fill()
        } else {
          ctx.strokeStyle = fill
          ctx.lineWidth = Math.max(0.4, (m.w || 0.002) * M)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.stroke()
        }
        break
      }

      default:
        break
    }

    ctx.restore()
  }

  ctx.globalAlpha = 1
}

/* ── 文本 ───────────────────────────────────────────────── */

function drawSlot (ctx, tpl, slot, text, W, H, M, defaultMinScale) {
  if (!slot || !text) return null

  var fam = family(tpl)
  var baseSize = slot.size * M
  var maxWidth = slot.maxW * W
  var weight = slot.weight || '400'
  var tracking = slot.tracking || 0

  var fitted = fitText(ctx, text, maxWidth, baseSize, weight, fam,
    slot.minScale == null ? defaultMinScale : slot.minScale)

  // 带字距时按缩放比例同步收字距，否则缩字号后仍会溢出一截
  var ratio = baseSize ? fitted.size / baseSize : 1
  var track = tracking * ratio

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color(tpl, slot.color || 'ink')

  var y = slot.y * H
  var anchorX = slot.x * W

  if (track > 0) {
    var chars = splitChars(fitted.text)
    var total = measureTracked(ctx, fitted.text, fitted.size, weight, fam, track)
    var startX = slot.align === 'left' ? anchorX
      : slot.align === 'right' ? anchorX - total
        : anchorX - total / 2
    var cursor = startX
    for (var i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cursor, y)
      cursor += measureText(ctx, chars[i], fitted.size, weight, fam) + track * fitted.size
    }
    fitted.trackingWidth = total
  } else {
    ctx.textAlign = slot.align || 'center'
    ctx.fillText(fitted.text, anchorX, y)
    ctx.textAlign = 'left'
  }

  fitted.x = slot.x
  fitted.y = slot.y
  fitted.align = slot.align || 'center'
  return fitted
}

/* ── 主流程 ─────────────────────────────────────────────── */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} template templates/index.js 中的一项
 * @param {{shopName?:string, ssid?:string, password?:string, payload?:string}} data
 * @param {number} width  逻辑宽度（预览与导出只改这里）
 * @param {number} height 逻辑高度
 * @returns {{width:number,height:number,qr:object,shop:object,ssid:object}}
 */
function renderSign (ctx, template, data, width, height) {
  var tpl = template
  var d = data || {}
  var W = Math.max(1, Math.round(width))
  var H = Math.max(1, Math.round(height))
  var M = Math.min(W, H)

  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'

  drawBackground(ctx, tpl, W, H)
  drawMotifs(ctx, tpl, W, H, M)

  var slots = tpl.slots || {}
  var copy = tpl.copy || {}

  var shopMeta = drawSlot(ctx, tpl, slots.shop, d.shopName, W, H, M, 0.5)
  drawSlot(ctx, tpl, slots.eyebrow, copy.eyebrow, W, H, M, 0.9)

  // 二维码：白色托底 + drawQRCode 自带的 4 模块静区
  var qrSlot = slots.qr
  var qrSize = qrSlot.size * M
  var qx = qrSlot.cx * W - qrSize / 2
  var qy = qrSlot.cy * H - qrSize / 2
  var pad = Math.max(1, M * 0.018)

  ctx.globalAlpha = 1
  ctx.fillStyle = '#FFFFFF'
  roundedRect(ctx, qx - pad, qy - pad, qrSize + pad * 2, qrSize + pad * 2, M * 0.012)
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

  var ssidMeta = drawSlot(ctx, tpl, slots.ssid, d.ssid, W, H, M, 0.42)
  drawSlot(ctx, tpl, slots.hint, copy.hint, W, H, M, 0.72)

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
      version: qrMeta.version,
      cell: qrMeta.cell,
      moduleMm: 0
    },
    shop: shopMeta,
    ssid: ssidMeta
  }
}

module.exports = {
  renderSign: renderSign,
  fitText: fitText,
  measureText: measureText,
  measureTracked: measureTracked,
  setFont: setFont,
  QR_QUIET: QR_QUIET
}
