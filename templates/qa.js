/**
 * templates/qa.js
 * 打印质量闸门：把「这个模板能不能印」变成一组可计算的断言。
 *
 * 模板库能不能放大，取决于这里能不能自动否掉坏模板，
 * 而不是取决于手写了多少个。
 *
 * 全部按毫米算：先由打印规格算出画布 mm，再乘 slot 的相对坐标。
 */

var lib = require('./index')

/* 花饰的真实宽高比在素材清单里，渲染层按它推高度。
   QA 必须用同一个来源，否则「QA 说过、渲染压字」。 */
var ORN = {}
try {
  var list = require('../assets/ornaments/index').ORNAMENTS || []
  list.forEach(function (o) { ORN[o.key] = o })
} catch (e) { ORN = {} }

/* 典型 WPA 载荷（SSID 24 + 密码 16）在 EC=M 下的模块数上界 */
var WORST_MODULES = 33

var THRESHOLDS = {
  shapePrintDelta: 0.05,
  qrEdgeMm: 15,          /* 码的绝对边长下限 */
  moduleMm: 0.40,        /* 单模块下限，低于这个手机相机对焦不上 */
  quietModules: 4,
  inkContrast: 4.5,      /* 正文对底的最小对比 */
  subContrast: 3.0,      /* 辅助文字对底 */
  qrContrast: 7.0,       /* 码与白底 */
  ssidFontMm: 2.6,
  pwdFontMm: 2.2,
  hintFontMm: 1.9,
  eyebrowFontMm: 1.6,
  marginMm: 4,           /* 内容距成品边（裁切安全线） */
  shrinkFloor: 0.62      /* 文字自适应最多缩到原字号的 62% */
}

/* 最坏情况下的文案长度，用来判断会不会缩得太狠 */
var WORST_TEXT = {
  shop: { chars: 8, unit: 1.0 },
  ssid: { chars: 24, unit: 0.55 },
  pwd: { chars: 18, unit: 0.55 },
  hint: { chars: 12, unit: 0.85 },
  eyebrow: { chars: 6, unit: 0.9 }
}

function srgb (hex) {
  var h = String(hex).replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  var r = parseInt(h.substr(0, 2), 16) / 255
  var g = parseInt(h.substr(2, 2), 16) / 255
  var b = parseInt(h.substr(4, 2), 16) / 255
  return [r, g, b].map(function (v) {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
}

function luminance (hex) {
  var c = srgb(hex)
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function contrast (a, b) {
  var la = luminance(a)
  var lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function isHex (v) {
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(String(v))
}

function resolve (tpl, value, fallback) {
  if (!value) return fallback
  if (isHex(value)) return value
  return (tpl.palette && tpl.palette[value]) || fallback
}

function overlap (a, b) {
  return !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1])
}

/**
 * 单个模板 x 单个打印规格的体检。
 * @returns {{issues:string[], metrics:object}}
 */
function auditPrint (tpl, printKey) {
  var issues = []
  var p = lib.getPrint(printKey)
  var W = p.w
  var H = p.h
  var M = Math.min(W, H)
  var slots = tpl.slots || {}
  var metrics = {}
  var qrPadBox = null

  var delta = lib.shapePrintDelta(tpl, printKey)
  metrics.shapeDelta = +delta.toFixed(4)
  if (delta > THRESHOLDS.shapePrintDelta) {
    issues.push('比例不符 shape=' + tpl.shape + ' print=' + printKey + ' 偏差 ' + (delta * 100).toFixed(1) + '%')
  }

  var qr = slots.qr
  var qrBox = null
  if (!qr) {
    issues.push('缺二维码槽位')
  } else {
    var edge = qr.size * M
    var module = edge / (WORST_MODULES + THRESHOLDS.quietModules * 2)
    metrics.qrEdgeMm = +edge.toFixed(2)
    metrics.moduleMm = +module.toFixed(3)
    if (edge < THRESHOLDS.qrEdgeMm) issues.push('码太小 ' + edge.toFixed(1) + 'mm < ' + THRESHOLDS.qrEdgeMm)
    if (module < THRESHOLDS.moduleMm) issues.push('模块过细 ' + module.toFixed(2) + 'mm < ' + THRESHOLDS.moduleMm)

    /* 与 utils/render.js 完全同一套换算：
       cx → W、cy → H，但边长走短边 M（码永远是正方形） */
    var qx0 = qr.cx * W - edge / 2
    var qy0 = qr.cy * H - edge / 2
    qrBox = [qx0, qy0, qx0 + edge, qy0 + edge]
    metrics.qrBox = qrBox.map(function (v) { return +v.toFixed(1) })
    var pad = M * 0.018
    qrPadBox = [qrBox[0] - pad, qrBox[1] - pad, qrBox[2] + pad, qrBox[3] + pad]
    if (qx0 < THRESHOLDS.marginMm || qy0 < THRESHOLDS.marginMm ||
      qx0 + edge > W - THRESHOLDS.marginMm || qy0 + edge > H - THRESHOLDS.marginMm) {
      issues.push('码越出裁切安全线 ' + THRESHOLDS.marginMm + 'mm')
    }
  }

  var textBoxes = []
  Object.keys(slots).forEach(function (key) {
    if (key === 'qr' || key === 'vertical') return
    var s = slots[key]
    var sizeMm = s.size * M
    var wMm = s.maxW * W
    var t = WORST_TEXT[key]
    var need = t ? t.chars * t.unit * sizeMm : 0
    var shrink = need > wMm ? wMm / need : 1
    var eff = sizeMm * shrink
    metrics[key + 'Mm'] = +eff.toFixed(2)

    var floor = THRESHOLDS[key + 'FontMm']
    if (floor && eff < floor) {
      issues.push(key + ' 有效字号 ' + eff.toFixed(2) + 'mm < ' + floor + 'mm（缩到 ' + (shrink * 100).toFixed(0) + '%）')
    }
    if (shrink < THRESHOLDS.shrinkFloor) {
      issues.push(key + ' 需要缩到 ' + (shrink * 100).toFixed(0) + '%，低于 ' + (THRESHOLDS.shrinkFloor * 100) + '%')
    }

    var x0 = s.align === 'left' ? s.x * W : s.x * W - (s.align === 'right' ? wMm : wMm / 2)
    var y0 = s.y * H - sizeMm * 0.62
    textBoxes.push({ key: key, box: [x0, y0, x0 + wMm, y0 + sizeMm * 1.24] })
    /* 码外面还有一圈白色托底（render.js 里 pad = M * 0.018），一并算进禁区 */
    if (qrBox && overlap([x0, y0, x0 + wMm, y0 + sizeMm * 1.24], qrPadBox)) {
      issues.push(key + ' 与二维码重叠')
    }
    if (x0 < THRESHOLDS.marginMm || x0 + wMm > W - THRESHOLDS.marginMm) {
      issues.push(key + ' 文字盒越出安全线')
    }
  })

  var pal = tpl.palette || {}
  var bg = resolve(tpl, pal.bg, '#FFFFFF')
  var bgEnd = resolve(tpl, pal.bgEnd || pal.bg, bg)
  var ink = resolve(tpl, pal.ink, '#000000')
  var sub = resolve(tpl, pal.inkSub, ink)
  var dark = resolve(tpl, pal.qrDark || pal.ink, ink)
  var worstInk = Math.min(contrast(ink, bg), contrast(ink, bgEnd))
  var worstSub = Math.min(contrast(sub, bg), contrast(sub, bgEnd))
  metrics.inkContrast = +worstInk.toFixed(2)
  metrics.subContrast = +worstSub.toFixed(2)
  metrics.qrContrast = +contrast(dark, '#FFFFFF').toFixed(2)
  if (worstInk < THRESHOLDS.inkContrast) issues.push('正文对比 ' + worstInk.toFixed(2) + ' < ' + THRESHOLDS.inkContrast)
  if (worstSub < THRESHOLDS.subContrast) issues.push('辅助字对比 ' + worstSub.toFixed(2) + ' < ' + THRESHOLDS.subContrast)
  if (contrast(dark, '#FFFFFF') < THRESHOLDS.qrContrast) issues.push('码对比不足，扫码风险')

  /* 5. 实心纹样不得压在码或文字上
        （seal / panel / rect / circle 是不透明填充，压上去就是一块脏斑；
          线框类纹样走 edgeInset 让位，不在这里管） */
  var solids = (tpl.motifs || []).filter(function (m) {
    /* seal/panel/rect/circle 是不透明填充；fleuron 是实心图像，
       压到字上就是脏斑，同级对待。
       注意别把欧式签名纹样 ornament（线框）算进来——它不是实心块。 */
    return m.type === 'seal' || m.type === 'panel' || m.type === 'rect' ||
      m.type === 'circle' || m.type === 'fleuron'
  })
  solids.forEach(function (m, mi) {
    var box = motifBox(m, W, H, M)
    if (!finiteBox(box)) return
    var label = '实心纹样' + (mi + 1) + '(' + m.type + ')'
    if (box[0] < THRESHOLDS.marginMm || box[1] < THRESHOLDS.marginMm ||
      box[2] > W - THRESHOLDS.marginMm || box[3] > H - THRESHOLDS.marginMm) {
      issues.push(label + ' 越出裁切安全线')
    }
    /* 码托底是设计成包住码的：只要它把码完整含住就不算冲突，
       压到码外沿或压到任何一行字都仍然算。 */
    if (m.backing && qrPadBox) {
      var wraps = box[0] <= qrPadBox[0] && box[1] <= qrPadBox[1] && box[2] >= qrPadBox[2] && box[3] >= qrPadBox[3]
      if (!wraps) issues.push(label + ' 号称托底但没有完整包住二维码')
    } else if (qrPadBox && overlap(box, qrPadBox)) {
      issues.push(label + ' 与二维码重叠')
    }
    textBoxes.forEach(function (b) {
      if (overlap(box, b.box)) issues.push(label + ' 与 ' + b.key + ' 重叠')
    })
  })

  return { issues: issues, metrics: metrics }
}

/**
 * 纹样在成品上的占位盒（mm）。
 * 与 utils/render.js 的换算保持一致：x / cx → W，y / cy → H，长度 → M。
 */
function motifBox (m, W, H, M) {
  if (m.type === 'fleuron') {
    /* 与 utils/render.js 逐句同构：先按 w 推 h，再用 h 上限回缩。
       两边算法不一致时，闸门就会给出与画面不符的结论。 */
    var o = ORN[m.key]
    var aspect = (o && o.aspect) || 1
    var ow2 = (m.w || 0) * W
    var oh2 = ow2 / aspect
    if ((m.h || 0) * H < oh2) { oh2 = (m.h || 0) * H; ow2 = oh2 * aspect }
    return [m.x * W - ow2 / 2, m.y * H - oh2 / 2, m.x * W + ow2 / 2, m.y * H + oh2 / 2]
  }
  if (m.type === 'seal') {
    var ss = (m.size || 0.09) * M
    var sx = m.x * W - ss / 2
    var sy = m.y * H - ss / 2
    return [sx, sy, sx + ss, sy + ss]
  }
  if (m.type === 'panel' || m.type === 'rect') {
    var w = (m.w || 0) * (m.type === 'rect' ? M : W)
    var h = (m.h || 0) * (m.type === 'rect' ? M : H)
    var x = m.x * W - w / 2
    var y = m.y * H - h / 2
    return [x, y, x + w, y + h]
  }
  if (m.type === 'circle') {
    var rr = (m.r || 0) * M
    return [m.cx * W - rr, m.cy * H - rr, m.cx * W + rr, m.cy * H + rr]
  }
  return null
}

/**
 * 盒子必须是四个有限数。
 * 之前踩过：欧式线框 ornament 没有 x/y，算出 NaN 盒，
 * 而任何与 NaN 的比较都是 false，overlap() 于是恒判「重叠」，
 * 把整批模板误杀。
 */
function finiteBox (b) {
  return !!(b && b.every(function (v) { return typeof v === 'number' && isFinite(v) }))
}

/** 模板级体检（与打印规格无关） */
function auditTemplate (tpl) {
  var issues = []

  if (!tpl.id) issues.push('缺 id')
  if (!tpl.name) issues.push('缺 name')
  if (!Array.isArray(tpl.scene) || tpl.scene.length < 2 || tpl.scene.length > 3) issues.push('scene 需 2~3 个')
  if (lib.getShape(tpl.shape).key !== tpl.shape) issues.push('shape 不在枚举内: ' + tpl.shape)
  if (!tpl.prints || !tpl.prints.length) issues.push('prints 为空')
  if (!tpl.mood || !tpl.mood.some(function (m) { return lib.MOODS.indexOf(m) !== -1 })) issues.push('mood 不合法')
  if (lib.REGIONS.indexOf(tpl.region) === -1) issues.push('region 不合法: ' + tpl.region)

  var slots = tpl.slots || {}
  ;['qr', 'ssid', 'pwd'].forEach(function (k) {
    if (!slots[k]) issues.push('缺关键槽位 ' + k)
  })

  Object.keys(slots).forEach(function (k) {
    var s = slots[k]
    if (k === 'qr') {
      if (!(s.cx > 0 && s.cx < 1 && s.cy > 0 && s.cy < 1)) issues.push('qr 中心越界')
      if (!(s.size > 0 && s.size < 1)) issues.push('qr size 越界')
      return
    }
    if (k === 'vertical') return
    if (!(s.x >= 0 && s.x <= 1)) issues.push(k + ' x 越界 ' + s.x)
    if (!(s.y >= 0 && s.y <= 1)) issues.push(k + ' y 越界 ' + s.y)
    if (!(s.maxW > 0 && s.maxW <= 1)) issues.push(k + ' maxW 越界 ' + s.maxW)
    if (!(s.size > 0)) issues.push(k + ' size 非法')
  })

  var sig = lib.REGION_SIGNATURE[tpl.region] || []
  var motifTypes = (tpl.motifs || []).map(function (m) { return m.type })
  sig.forEach(function (need) {
    if (need === 'vtext') {
      if (!(slots.vertical && tpl.copy && tpl.copy.vertical)) issues.push('日式缺竖排小字')
      return
    }
    if (motifTypes.indexOf(need) === -1) issues.push(tpl.region + ' 缺签名纹样 ' + need)
  })

  var taxonomy = require('./taxonomy')
  var rule = taxonomy.DENSITY_RULES[tpl.density || 'light']
  if (rule && (tpl.motifs || []).length > rule.motifMax) {
    issues.push('纹样 ' + (tpl.motifs || []).length + ' 超过 ' + (tpl.density || 'light') + ' 上限 ' + rule.motifMax)
  }

  var pal = tpl.palette || {}
  ;['bg', 'ink', 'inkSub', 'accent', 'qrDark'].forEach(function (k) {
    if (!pal[k]) issues.push('palette 缺 ' + k)
    if (pal[k] && !isHex(pal[k])) issues.push('palette.' + k + ' 不是 hex: ' + pal[k])
  })

  return issues
}

/** 完整体检：模板级 + 每个打印规格 */
function audit (tpl) {
  var issues = auditTemplate(tpl)
  var metrics = {}
  ;(tpl.prints || []).forEach(function (key) {
    var one = auditPrint(tpl, key)
    metrics[key] = one.metrics
    one.issues.forEach(function (msg) { issues.push('[' + key + '] ' + msg) })
  })
  return { ok: issues.length === 0, issues: issues, metrics: metrics }
}

module.exports = {
  THRESHOLDS: THRESHOLDS,
  motifBox: motifBox,
  WORST_MODULES: WORST_MODULES,
  WORST_TEXT: WORST_TEXT,
  contrast: contrast,
  luminance: luminance,
  audit: audit,
  auditTemplate: auditTemplate,
  auditPrint: auditPrint
}