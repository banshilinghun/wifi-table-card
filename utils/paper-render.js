/**
 * utils/paper-render.js
 * 白纸系列的信息层渲染。
 *
 * ── 与深色系列的区别 ────────────────────────────────────────
 * 深色模板的坐标写在模板里（每套自己排版）；白纸系列不写坐标，
 * 一律在 art-bounds.js 量出来的 safe 矩形里现排：
 *
 *   safe 之上（顶部）  → 装饰图的圆形徽章，信息层从这里往下开始
 *   safe 左右外侧      → 四角插画，文字与二维码不得侵入
 *
 * 固定顺序（不随模板变）：免费 Wi-Fi → 扫码连接 → 二维码 → 网络 → 密码 → 店名。
 * 空间不够时先缩字号、再缩二维码，缩到下限仍放不下就返回 warning，
 * 由 QA 决定这套模板能不能提供这个规格——而不是悄悄压在一起。
 */

var qrCanvas = require('./qr-canvas')
var r = require('./render')

var QR_QUIET = 4

var BASE = {
  title: 0.076,
  sub: 0.029,
  row: 0.034,
  shop: 0.042,
  vertical: 0.026
}

/** 毫米下限。任何规格渲染完都要过一遍，不达标记 warning */
var MM_MIN = {
  title: 3.4,
  sub: 2.1,
  row: 2.3,
  shop: 2.6,
  qr: 18,
  module: 0.4
}

var MAX_ATTEMPTS = 4

/* ── 基础绘制 ───────────────────────────────────────────── */

function roundRectPath (ctx, x, y, w, h, rad) {
  var rr = Math.max(0, Math.min(rad, w / 2, h / 2))
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

function splitChars (text) {
  var out = []
  var str = String(text == null ? '' : text)
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
      out.push(str.substr(i, 2))
      i++
    } else {
      out.push(str.charAt(i))
    }
  }
  return out
}

function fam (tpl) {
  return tpl && tpl.font === 'serif' ? r.SERIF : r.SANS
}

/**
 * 主题色圆角方块 + 白色图形。
 * 用 Canvas 画而不是切图：颜色随模板 accent 变，放大到 300dpi 也不糊。
 * @param {'wifi'|'lock'} kind
 */
function drawIconBadge (ctx, x, y, size, bg, fg, kind) {
  ctx.save()
  roundRectPath(ctx, x, y, size, size, size * 0.3)
  ctx.fillStyle = bg
  ctx.fill()

  var cx = x + size / 2

  if (kind === 'wifi') {
    var baseY = y + size * 0.66
    ctx.strokeStyle = fg
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1, size * 0.072)
    for (var i = 0; i < 3; i++) {
      var rad = size * (0.30 - i * 0.108)
      if (rad <= 0) continue
      ctx.beginPath()
      ctx.arc(cx, baseY, rad, Math.PI * 1.22, Math.PI * 1.78)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, baseY, size * 0.048, 0, Math.PI * 2)
    ctx.fillStyle = fg
    ctx.fill()
  } else {
    // 锁：上面一个拱形锁梁，下面一个圆角锁体
    var bodyW = size * 0.42
    var bodyH = size * 0.3
    var bodyX = cx - bodyW / 2
    var bodyY = y + size * 0.5
    ctx.strokeStyle = fg
    ctx.lineWidth = Math.max(1, size * 0.072)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, bodyY, size * 0.125, Math.PI, 0)
    ctx.stroke()
    roundRectPath(ctx, bodyX, bodyY - size * 0.01, bodyW, bodyH, size * 0.06)
    ctx.fillStyle = fg
    ctx.fill()
    // 钥匙孔
    ctx.beginPath()
    ctx.arc(cx, bodyY + bodyH * 0.42, size * 0.032, 0, Math.PI * 2)
    ctx.fillStyle = bg
    ctx.fill()
  }

  ctx.restore()
}

/** 图标 + 文字的一行，整体在 cx 上居中 */
function drawRow (ctx, cx, y, iconSize, iconKind, text, size, weight, famName, inkColor, accent) {
  var gap = iconSize * 0.46
  var tw = r.measureText(ctx, text, size, weight, famName)
  var totalW = iconSize + gap + tw
  var x0 = cx - totalW / 2

  drawIconBadge(ctx, x0, y, iconSize, accent, '#FFFFFF', iconKind)

  ctx.save()
  ctx.fillStyle = inkColor
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  r.setFont(ctx, size, weight, famName)
  ctx.fillText(text, x0 + iconSize + gap, y + iconSize / 2)
  ctx.restore()

  return { x: x0, y: y, w: totalW, h: iconSize }
}

function drawVertical (ctx, text, x, y, size, step, color) {
  var chars = splitChars(text)
  ctx.save()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  r.setFont(ctx, size, '400', r.SANS)
  for (var i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y + i * step)
  }
  ctx.restore()
  return { x: x, y: y, w: size, h: size + (chars.length - 1) * step, count: chars.length }
}

/* ── 排版计算 ───────────────────────────────────────────── */

/**
 * 在 safe 矩形里算一遍布局。不画东西，只出数字——QA 与渲染共用同一份结果，
 * 避免「预览看着对、打印压插画」。
 */
function plan (ctx, tpl, data, W, H, bounds) {
  var M = Math.min(W, H)
  var safeRel = (bounds && bounds.safe) || { x: 0.08, y: 0.2, w: 0.84, h: 0.72 }
  var safe = { x: safeRel.x * W, y: safeRel.y * H, w: safeRel.w * W, h: safeRel.h * H }

  var d = data || {}
  var copy = tpl.copy || {}
  var titleText = copy.title || '免费 Wi-Fi'
  var subText = copy.sub || '扫码连接 · 无需询问'

  var ssidText = d.ssid || '未填写网络名'
  var pwdText = d.password || '无需密码'
  var shopText = d.shopName || ''
  var showPwdRow = d.showPassword !== false && d.type !== 'nopass'
  var hasMini = !!(d.miniCodeUrl && d.miniCode)

  var baseScale = tpl.typeScale || 1
  var scale = baseScale
  var used = null

  for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    var titleSize = BASE.title * M * scale
    var subSize = BASE.sub * M * scale
    var rowSize = BASE.row * M * scale
    var shopSize = BASE.shop * M * scale
    var iconSize = rowSize * 1.16

    var gapA = 0.016 * M
    var gapB = 0.030 * M
    var gapC = 0.026 * M
    var gapD = 0.014 * M
    var gapE = 0.026 * M
    var lh = 1.18

    var rowCount = showPwdRow ? 2 : (ssidText ? 1 : 0)
    var fixedH = titleSize * lh + gapA + subSize * lh + gapB + gapC +
      iconSize + (rowCount === 2 ? gapD + iconSize : 0) +
      (shopText ? gapE + shopSize * lh : 0)

    // 0.86 而不是 1.0：二维码框本身还有 framePad，留出内边距才不至于擦到插画
    var qrRoomW = safe.w * (hasMini ? 0.58 : 0.86)
    var innerH = safe.h - 0.030 * M
    var qrMax = Math.min(qrRoomW, innerH - fixedH)
    var qrSize = Math.max(0, qrMax)

    var framePad = Math.max(2, M * 0.012)

    if (qrSize >= M * 0.30 || attempt === MAX_ATTEMPTS - 1) {
      used = {
        titleSize: titleSize, subSize: subSize, rowSize: rowSize, shopSize: shopSize,
        iconSize: iconSize, gapA: gapA, gapB: gapB, gapC: gapC, gapD: gapD, gapE: gapE,
        lh: lh, qrSize: qrSize, framePad: framePad, rowCount: rowCount,
        showPwdRow: showPwdRow, fixedH: fixedH
      }
      break
    }
    // 放不下就整体缩 6%，最多缩 4 轮
    scale = scale * 0.94
  }

  var totalH = used.fixedH + used.qrSize
  var topPad = 0.018 * M
  var innerH0 = safe.h - 0.030 * M
  var startY = safe.y + Math.max(topPad, (safe.h - totalH) / 2)

  var titleY = startY
  var subY = titleY + used.titleSize * used.lh + used.gapA
  var qrY = subY + used.subSize * used.lh + used.gapB
  var qrX = safe.x + (safe.w - used.qrSize) / 2
  var row1Y = qrY + used.qrSize + used.gapC
  var row2Y = row1Y + used.iconSize + used.gapD
  var shopY = (used.rowCount === 2 ? row2Y + used.iconSize : row1Y + used.iconSize) + used.gapE

  // 小程序码：有值时码位右移，二维码与码并排居中
  if (hasMini) {
    var miniSize = used.qrSize * 0.34
    var clusterW = used.qrSize + used.framePad * 2 + miniSize * 1.4
    var clusterX = safe.x + (safe.w - clusterW) / 2
    qrX = clusterX
    used.miniX = qrX + used.qrSize + used.framePad * 2 + miniSize * 0.4
    used.miniSize = miniSize
    used.miniY = qrY + (used.qrSize - miniSize) / 2
  }

  return Object.assign({
    M: M,
    safe: safe,
    scale: scale,
    titleY: titleY,
    subY: subY,
    qrX: qrX,
    qrY: qrY,
    row1Y: row1Y,
    row2Y: row2Y,
    shopY: shopY,
    titleText: titleText,
    subText: subText,
    ssidText: ssidText,
    pwdText: pwdText,
    shopText: shopText,
    hasMini: hasMini
  }, used)
}

/* ── 主入口 ─────────────────────────────────────────────── */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} tpl templates/paper.js 中一项
 * @param {object} data {shopName,ssid,password,type,showPassword,payload,mm,miniCodeUrl}
 * @param {number} width
 * @param {number} height
 * @param {{art?:Image, bounds?:object, vertical?:boolean, miniCode?:Image, mm?:{w:number,h:number}}} opts
 * @returns {object} 渲染元数据（含 QA 需要的毫米尺寸与重叠信息）
 */
function renderPaper (ctx, tpl, data, width, height, opts) {
  var o = opts || {}
  var d = data || {}
  var W = Math.max(1, Math.round(width))
  var H = Math.max(1, Math.round(height))
  var bounds = o.bounds || null
  var mm = o.mm || d.mm || null

  var P = plan(ctx, tpl, d, W, H, bounds)
  var M = P.M
  var ink = tpl.ink || '#222222'
  var accent = tpl.accent || ink
  var fontName = fam(tpl)

  ctx.save()
  ctx.clearRect(0, 0, W, H)

  // 1) 白底
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // 2) 装饰图层
  if (o.art) {
    try {
      ctx.drawImage(o.art, 0, 0, W, H)
    } catch (e) {
      console.warn('[paper] 装饰图绘制失败', e)
    }
  }

  var cx = P.safe.x + P.safe.w / 2

  // 3) 标题：免费 Wi-Fi
  var titleFit = r.fitText(ctx, P.titleText, P.safe.w * 0.96, P.titleSize, '700', fontName, 0.7)
  ctx.save()
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  r.setFont(ctx, titleFit.size, '700', fontName)
  ctx.fillText(titleFit.text, cx, P.titleY)
  ctx.restore()

  // 4) 副标题：扫码连接 · 无需询问
  var subFit = r.fitText(ctx, P.subText, P.safe.w * 0.9, P.subSize, '400', fontName, 0.75)
  ctx.save()
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  r.setFont(ctx, subFit.size, '400', fontName)
  ctx.fillText(subFit.text, cx, P.subY)
  ctx.restore()

  // 5) 二维码：白底圆角框 + 静区 + 主题色描边
  var qx = P.qrX
  var qy = P.qrY
  var qs = P.qrSize
  var fp = P.framePad

  ctx.save()
  roundRectPath(ctx, qx - fp, qy - fp, qs + fp * 2, qs + fp * 2, M * 0.032)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.lineWidth = Math.max(1, M * 0.0026)
  ctx.strokeStyle = accent
  ctx.stroke()
  ctx.restore()

  var qrMeta = qrCanvas.drawQRCode(ctx, d.payload || '', {
    x: qx,
    y: qy,
    size: qs,
    quiet: QR_QUIET,
    ec: 'M',
    dark: ink,
    light: '#FFFFFF'
  })

  // 6) 小程序码（预留位：miniCodeUrl 为空时这里什么都不画，排版已居中）
  if (P.hasMini && o.miniCode) {
    ctx.save()
    ctx.drawImage(o.miniCode, P.miniX, P.miniY, P.miniSize, P.miniSize)
    ctx.restore()
  }

  // 7) 网络行
  var maxRowW = P.safe.w - P.iconSize - P.iconSize * 0.46
  var ssidFit = r.fitText(ctx, P.ssidText, maxRowW, P.rowSize, '500', fontName, 0.62)
  var row1 = drawRow(ctx, cx, P.row1Y, P.iconSize, 'wifi', ssidFit.text,
    ssidFit.size, '500', fontName, ink, accent)

  // 8) 密码行
  var row2 = null
  if (P.showPwdRow) {
    var pwdFit = r.fitText(ctx, P.pwdText, maxRowW, P.rowSize, '400', r.MONO, 0.62)
    row2 = drawRow(ctx, cx, P.row2Y, P.iconSize, 'lock', pwdFit.text,
      pwdFit.size, '400', r.MONO, ink, accent)
  }

  // 9) 店名
  var shopMeta = null
  if (P.shopText) {
    var shopFit = r.fitText(ctx, P.shopText, P.safe.w * 0.94, P.shopSize, '500', fontName, 0.7)
    ctx.save()
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    r.setFont(ctx, shopFit.size, '500', fontName)
    ctx.fillText(shopFit.text, cx, P.shopY)
    ctx.restore()
    shopMeta = { text: shopFit.text, x: cx, y: P.shopY, size: shopFit.size, truncated: shopFit.truncated }
  }

  // 10) 侧边竖排（可关）
  var vertMeta = null
  if (o.vertical !== false && tpl.vertical) {
    var vSize = BASE.vertical * M
    var vStep = vSize * 1.42
    var chars = splitChars(tpl.vertical).length
    var vTop = Math.max(P.safe.y, (H - (chars - 1) * vStep) / 2 - vSize)
    vertMeta = drawVertical(ctx, tpl.vertical, W * 0.945, vTop, vSize, vStep,
      withAlphaHex(ink, 0.58))
  }

  ctx.restore()

  /* ── 毫米换算与自查 ─────────────────────────────────── */
  var mmW = mm ? mm.w : 0
  var mmH = mm ? mm.h : 0
  var shortMm = mmW && mmH ? Math.min(mmW, mmH) : 0
  var toMm = shortMm ? shortMm / M : 0

  var modulePx = qrMeta.cell
  var warnings = []

  function check (label, px, minMm) {
    if (!shortMm) return
    var v = px * toMm
    if (v < minMm) warnings.push(label + ' ' + v.toFixed(2) + 'mm < ' + minMm + 'mm')
  }

  check('标题', titleFit.size, MM_MIN.title)
  check('副标题', subFit.size, MM_MIN.sub)
  check('网络行', ssidFit.size, MM_MIN.row)
  if (row2) check('密码行', P.rowSize, MM_MIN.row)
  if (shopMeta) check('店名', shopMeta.size, MM_MIN.shop)
  check('二维码', qs, MM_MIN.qr)
  check('单模块', modulePx, MM_MIN.module)

  return {
    width: W,
    height: H,
    series: 'paper',
    artLoaded: !!o.art,
    safe: P.safe,
    scale: P.scale,
    title: {
      text: titleFit.text, x: cx, y: P.titleY, size: titleFit.size, color: ink,
      truncated: titleFit.truncated,
      box: { x: cx - titleFit.width / 2, y: P.titleY, w: titleFit.width, h: titleFit.size * 1.18 }
    },
    sub: {
      text: subFit.text, x: cx, y: P.subY, size: subFit.size, color: ink,
      box: { x: cx - subFit.width / 2, y: P.subY, w: subFit.width, h: subFit.size * 1.3 }
    },
    qr: {
      x: qx,
      y: qy,
      size: qs,
      quiet: QR_QUIET,
      moduleCount: qrMeta.moduleCount,
      version: qrMeta.version,
      cell: modulePx,
      moduleMm: modulePx * toMm,
      sizeMm: qs * toMm,
      frame: { x: qx - fp, y: qy - fp, w: qs + fp * 2, h: qs + fp * 2 }
    },
    ssid: { text: ssidFit.text, size: ssidFit.size, color: ink, box: row1 },
    pwd: row2 ? { text: P.pwdText, size: P.rowSize, color: ink, box: row2 } : null,
    shop: shopMeta ? Object.assign({}, shopMeta, {
      color: ink,
      box: { x: cx - shopFit.width / 2, y: P.shopY, w: shopFit.width, h: shopFit.size * 1.18 }
    }) : null,
    vertical: vertMeta ? Object.assign({}, vertMeta, {
      color: withAlphaHex(ink, 0.58), alpha: 0.58,
      box: { x: vertMeta.x - vertMeta.w / 2, y: vertMeta.y - vertMeta.w / 2, w: vertMeta.w, h: vertMeta.h }
    }) : null,
    mini: P.hasMini && o.miniCode ? { x: P.miniX, y: P.miniY, size: P.miniSize } : null,
    avoid: (bounds && bounds.avoid) ? bounds.avoid.map(function (a) {
      return { x: a.x * W, y: a.y * H, w: a.w * W, h: a.h * H, corner: a.corner }
    }) : [],
    icon: (bounds && bounds.icon) ? {
      x: bounds.icon.x * W, y: bounds.icon.y * H, w: bounds.icon.w * W, h: bounds.icon.h * H
    } : null,
    mm: { w: mmW, h: mmH },
    warnings: warnings
  }
}

function withAlphaHex (hex, a) {
  var h = String(hex).replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  var rr = parseInt(h.substr(0, 2), 16) || 0
  var gg = parseInt(h.substr(2, 2), 16) || 0
  var bb = parseInt(h.substr(4, 2), 16) || 0
  return 'rgba(' + rr + ',' + gg + ',' + bb + ',' + a + ')'
}

module.exports = {
  renderPaper: renderPaper,
  plan: plan,
  drawIconBadge: drawIconBadge,
  drawVertical: drawVertical,
  BASE: BASE,
  MM_MIN: MM_MIN,
  QR_QUIET: QR_QUIET,
  withAlphaHex: withAlphaHex
}
