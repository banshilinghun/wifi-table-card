/**
 * templates/factory.js
 * 模板工厂：把 taxonomy 的维度乘开，再用 qa.js 逐条否掉不合格的。
 *
 * ── 几何模型 ──────────────────────────────────────────────
 * 所有长度先在「M 单位」里算，M = min(成品宽, 成品高)。
 * canvasOf() 把 shape 换算成 M 单位下的 W / H：
 *   1:1.4 → W=1,   H=1.4      （A4，短边是宽）
 *   2:1   → W=2,   H=1        （长条桌签，短边是高）
 * 算完再归一化：x / cx / maxW 除以 W，y / cy 除以 H，size 保持 M 单位。
 * 于是同一份数据在 172rpx 缩略图与 200mm 桌签上是同一个形状。
 *
 * ── 排版流程 ──────────────────────────────────────────────
 * 先定字号（受最小打印规格的毫米下限约束），
 * 再从上下边缘向内排文字行，剩下的中腰才是二维码的位置。
 * 顺序反了就会出现「码压字」——手写模板最常见的翻车方式。
 */

var lib = require('./index')
var tax = require('./taxonomy')
var qa = require('./qa')

/* 公有领域花饰（tools/build-ornaments.js 生成）。
   工厂只认 key，图片本身由 utils/ornament.js 在渲染时染色加载。 */
var ORNAMENTS = []
try {
  ORNAMENTS = require('../assets/ornaments/index').ORNAMENTS
} catch (e) {
  ORNAMENTS = []
}

/* ── 随机数 ─────────────────────────────────────────────── */

function rng (seed) {
  var s = (seed >>> 0) || 1
  return function () {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function pick (r, arr) { return arr[Math.floor(r() * arr.length) % arr.length] }
function span (r, a, b) { return a + r() * (b - a) }
function round (v, n) { var p = Math.pow(10, n == null ? 4 : n); return Math.round(v * p) / p }

/* ── 形状几何 ───────────────────────────────────────────── */

/** shape → M 单位下的画布尺寸（短边恒为 1） */
function canvasOf (shapeKey) {
  var ratio = lib.getShape(shapeKey).ratio
  if (ratio >= 1) return { ratio: ratio, W: ratio, H: 1, portrait: false }
  return { ratio: ratio, W: 1, H: 1 / ratio, portrait: true }
}

var SHAPE_PRINTS = {
  '1:2': ['tower'],
  '1:1.4': ['a4', 'a5'],
  '1:1': ['mini'],
  '1.4:1': ['a5land'],
  '2:1': ['strip']
}

/** 该形状候选规格里最小的短边（mm）——字号下限按它算 */
function minShortEdge (shapeKey) {
  var list = SHAPE_PRINTS[shapeKey] || []
  var best = Infinity
  list.forEach(function (k) {
    var p = lib.getPrint(k)
    best = Math.min(best, Math.min(p.w, p.h))
  })
  return best === Infinity ? 100 : best
}

/* ── 颜色 ───────────────────────────────────────────────── */

var HUE = {
  '新中式': [[16, 36], [350, 20], [40, 56]],
  '日式': [[150, 196], [22, 42], [92, 140]],
  '韩式': [[258, 300], [198, 240], [330, 352]],
  '欧式': [[28, 52], [8, 28], [196, 232]],
  '极简': [[200, 228], [30, 360]]
}

function srgbChannels (hex) {
  var h = String(hex).replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]
}

function hsl2hex (h, s, l) {
  h = (((h % 360) + 360) % 360) / 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s
  var p = 2 * l - q
  function ch (t) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  function hex (v) { var n = Math.round(v * 255).toString(16); return n.length === 1 ? '0' + n : n }
  return '#' + hex(ch(h + 1 / 3)) + hex(ch(h)) + hex(ch(h - 1 / 3))
}

/**
 * 在明度轴上扫描，取「刚好够对比、又最接近背景」的那一档。
 * 从 from 走到 to，第一个满足 target 的就停——所以 from 要放在弱的那端。
 */
function solveLight (h, s, bgHex, target, from, to) {
  var steps = 40
  var dir = to > from ? 1 : -1
  for (var i = 0; i <= steps; i++) {
    var l = from + dir * (i / steps) * Math.abs(to - from)
    if (qa.contrast(hsl2hex(h, s, l), bgHex) >= target) return l
  }
  return to
}

/**
 * 调色板。两条铁律：
 *   1. 解算用的色 = 最终写进 palette 的色（同一个 h/s，只差 L），
 *      否则 QA 读到的对比会比解算时低——之前就是这样全军覆没的。
 *   2. 底是渐变，有两端。文字要压得住「更难的那端」：
 *      浅底取较暗的一端，深底取较亮的一端。
 */
function makePalette (r, region, dark) {
  var hues = HUE[region] || HUE['极简']
  var band = pick(r, hues)
  var hBg = span(r, band[0], band[1])
  var hAcc = hBg + pick(r, [-34, -20, 24, 40])

  var satBg = region === '极简' ? span(r, 0.02, 0.12) : span(r, 0.07, 0.26)
  var lBg = dark ? span(r, 0.06, 0.14) : span(r, 0.88, 0.96)
  var lEnd = dark ? Math.min(0.30, lBg + span(r, 0.04, 0.12)) : Math.max(0.78, lBg - span(r, 0.03, 0.09))

  var bg = hsl2hex(hBg, satBg, lBg)
  var bgEnd = hsl2hex(hBg + span(r, -10, 10), satBg * 0.92, lEnd)
  var hard = dark
    ? (qa.luminance(bg) > qa.luminance(bgEnd) ? bg : bgEnd)   /* 深底：亮的那端更难 */
    : (qa.luminance(bg) < qa.luminance(bgEnd) ? bg : bgEnd)   /* 浅底：暗的那端更难 */

  /**
   * 沿明度轴扫描，取第一个达标的 L。
   * upward=true：深底往亮走；false：浅底往暗走。
   * 全程扫完都不达标就返回 null（这支色相/饱和做不出来，整条丢掉）。
   */
  /**
   * 沿明度轴扫描，取第一个达标的色。
   * against：这支颜色实际要压住的底——文字压 hard，
   * 码压白托底。两者混用就会得到「解算过了、QA 不过」的目标。
   */
  function solve (h, s, target, upward, against) {
    var base = against || hard
    var steps = 80
    for (var i = 0; i <= steps; i++) {
      var f = i / steps
      var l = upward ? 0.03 + f * 0.95 : 0.97 - f * 0.94
      var hex = hsl2hex(h, s, l)
      if (qa.contrast(hex, base) >= target) return hex
    }
    return null
  }

  var inkS = Math.min(0.30, satBg + 0.04)
  var ink = solve(hBg, inkS, qa.THRESHOLDS.inkContrast * 1.12, dark)
  if (!ink) return null

  var subS = Math.min(0.36, satBg + 0.10)
  var inkSub = solve(hBg, subS, qa.THRESHOLDS.subContrast * 1.15, dark)
  if (!inkSub) return null

  var accS = region === '极简' ? 0.30 : span(r, 0.38, 0.64)
  var accent = solve(hAcc, accS, qa.THRESHOLDS.subContrast * 1.15, dark)
  if (!accent) return null

  /* 码永远印在白托底上，与白底比 */
  var qrDark = solve(hBg, 0.16, qa.THRESHOLDS.qrContrast * 1.05, false, '#FFFFFF')
  if (!qrDark) return null

  return { bg: bg, bgEnd: bgEnd, ink: ink, inkSub: inkSub, accent: accent, qrDark: qrDark }
}

/* ── 字号 ───────────────────────────────────────────────── */

/**
 * 字号同时受两个约束：
 *   1. 观感：相对短边的一个区间（太大会把中腰挤没）
 *   2. 物理：最小打印规格上的毫米下限
 * 取两者的较大值；下限值先算出来，后面 QA 才不会反过来否掉。
 */
function typeScale (r, density, shapeKey) {
  var M = minShortEdge(shapeKey)
  var t = {
    eyebrow: span(r, 0.016, 0.022),
    shop: span(r, 0.052, 0.082),
    ssid: span(r, 0.036, 0.048),
    pwd: span(r, 0.030, 0.038),
    hint: span(r, 0.024, 0.032)
  }
  /* 密度越高，字越小；但不得破毫米下限 */
  var k = density === 'minimal' ? 1.06 : density === 'light' ? 1 : density === 'medium' ? 0.94 : 0.88
  Object.keys(t).forEach(function (key) {
    var want = t[key] * k
    var floor = qa.THRESHOLDS[key + 'FontMm']
    /* 没有毫米下限的（店名是标题字），只受观感区间管 */
    t[key] = floor ? Math.max(want, (floor / M) * 1.06) : want
  })
  return t
}

/* ── 纹样 ───────────────────────────────────────────────── */

function regionMotifs (r, region) {
  var out = []
  if (region === '新中式') {
    out.push({ type: 'meander', inset: round(span(r, 0.040, 0.058)), step: round(span(r, 0.046, 0.062)), thick: round(span(r, 0.0014, 0.0020), 5), color: 'accent', alpha: round(span(r, 0.26, 0.40), 3) })
    /* 朱印的位置由空格子决定，见 build() 里的 placeSeal */
  } else if (region === '韩式') {
    out.push({ type: 'softcorner', x: round(span(r, 0.04, 0.09)), y: round(span(r, 0.04, 0.07)), size: round(span(r, 0.40, 0.58)), corner: 'tl', color: 'accent', alpha: round(span(r, 0.08, 0.14), 3) })
    out.push({ type: 'softcorner', x: round(span(r, 0.91, 0.96)), y: round(span(r, 0.93, 0.97)), size: round(span(r, 0.44, 0.64)), corner: 'br', color: 'accent', alpha: round(span(r, 0.06, 0.12), 3) })
  } else if (region === '欧式') {
    out.push({ type: 'ornament', inset: round(span(r, 0.040, 0.054)), curl: round(span(r, 0.028, 0.040)), w: round(span(r, 0.0009, 0.0014), 5), color: 'accent', alpha: round(span(r, 0.34, 0.48), 3) })
  }
  return out
}

var EXTRA = [
  function (r, c) {
    var y = round(span(r, 0.15, 0.22))
    return { type: 'line', x1: round(span(r, 0.22, 0.38)), y1: y, x2: round(span(r, 0.62, 0.78)), y2: y, w: round(span(r, 0.0006, 0.0012), 5), color: 'accent', alpha: round(span(r, 0.20, 0.34), 3) }
  },
  function (r, c) {
    return { type: 'ring', cx: 0.5, cy: round(span(r, 0.44, 0.54)), r: round(span(r, 0.26, 0.36)), w: round(span(r, 0.0008, 0.0014), 5), color: 'accent', alpha: round(span(r, 0.10, 0.20), 3) }
  },
  function (r, c) {
    return { type: 'dots', x: 0.5, y: round(span(r, 0.90, 0.96)), w: round(span(r, 0.40, 0.66)), h: 0.02, gap: round(span(r, 0.022, 0.032)), r: 0.0022, color: 'inkSub', alpha: round(span(r, 0.20, 0.34), 3) }
  },
  function (r, c) {
    return { type: 'grid', x: 0.5, y: 0.5, w: 0.9, h: 0.9, gap: round(span(r, 0.055, 0.085)), thick: 0.0005, color: 'inkSub', alpha: round(span(r, 0.05, 0.09), 3) }
  },
  function (r, c) {
    var y = round(span(r, 0.86, 0.93))
    return { type: 'wave', x: 0.5, y: y, w: round(span(r, 0.50, 0.80)), count: 2, step: 0.012, amp: 0.006, wave: 0.09, thick: 0.0007, color: 'accent', alpha: round(span(r, 0.14, 0.26), 3) }
  },
  function (r, c) {
    return { type: 'arc', cx: 0.5, cy: c.portrait ? 0.03 : 0.5, r: round(span(r, 0.22, 0.34)), from: 20, to: 160, w: 0.0010, count: 3, step: 0.038, color: 'accent', alpha: round(span(r, 0.10, 0.20), 3) }
  },
  function (r, c) {
    return { type: 'contour', cx: round(span(r, 0.78, 0.88)), cy: round(span(r, 0.12, 0.2)), r0: 0.05, count: 4, step: 0.035, wobble: 0.012, w: 0.0007, color: 'inkSub', alpha: round(span(r, 0.06, 0.12), 3) }
  },
  function (r, c) {
    return { type: 'corner', inset: round(span(r, 0.040, 0.058)), len: round(span(r, 0.040, 0.066)), w: 0.0013, color: 'accent', alpha: round(span(r, 0.30, 0.46), 3) }
  },
  function (r, c) {
    return { type: 'diagonal', x: 0.5, y: 0.5, w: 0.9, h: 0.9, angle: round(span(r, 30, 60)), gap: round(span(r, 0.05, 0.09)), thick: 0.0005, color: 'inkSub', alpha: round(span(r, 0.04, 0.08), 3) }
  },
]

/* ── 实心纹样的落位 ─────────────────────────────────────── */

/**
 * 把「已经被人占了」的区域算出来（画布单位：x → W，y → H，长度 → M）。
 * 与 utils/render.js、templates/qa.js 用同一套换算，
 * 所以这里判断为空的格子，渲染出来也真的是空的。
 */
function occupiedBoxes (canvas, slots) {
  var W = canvas.W
  var H = canvas.H
  var out = []
  var qr = slots.qr
  if (qr) {
    var pad = 0.018 + 0.006
    var e = qr.size + pad * 2
    out.push([qr.cx * W - e / 2, qr.cy * H - e / 2, qr.cx * W + e / 2, qr.cy * H + e / 2])
  }
  Object.keys(slots).forEach(function (k) {
    if (k === 'qr') return
    var s = slots[k]
    if (k === 'vertical') {
      var vw = s.size * 1.4
      out.push([s.x * W - vw / 2, s.y * H - s.size, s.x * W + vw / 2, (s.y + s.step * 4) * H])
      return
    }
    var size = s.size
    var w = s.maxW * W
    var x0 = s.align === 'left' ? s.x * W : s.x * W - (s.align === 'right' ? w : w / 2)
    var y0 = s.y * H - size * 0.7
    out.push([x0, y0, x0 + w, y0 + size * 1.4])
  })
  return out
}

function contains (a, b) {
  return a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]
}

function hits (a, b) {
  return !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1])
}

/**
 * 在画布里找一个能放 size 方块的空格子，优先贴角。
 * 找不到返回 null——那就干脆不放这个纹样，
 * 而不是硬塞一个压住密码行的朱印。
 */
function findFreeSpot (canvas, occupied, size, margin) {
  var W = canvas.W
  var H = canvas.H
  var half = size / 2
  var step = 0.04
  var best = null
  var bestScore = Infinity

  for (var x = margin + half; x <= W - margin - half + 1e-9; x += step) {
    for (var y = margin + half; y <= H - margin - half + 1e-9; y += step) {
      var box = [x - half, y - half, x + half, y + half]
      var clash = false
      for (var i = 0; i < occupied.length; i++) {
        if (hits(box, occupied[i])) { clash = true; break }
      }
      if (clash) continue

      /* 评分：离最近的角越近越好，其次离边越近越好（贴边像盖章） */
      var corners = [[margin, margin], [W - margin, margin], [margin, H - margin], [W - margin, H - margin]]
      var d = Infinity
      for (var c = 0; c < corners.length; c++) {
        var dd = Math.abs(x - corners[c][0]) + Math.abs(y - corners[c][1])
        if (dd < d) d = dd
      }
      if (d < bestScore) { bestScore = d; best = { x: x, y: y } }
    }
  }
  return best
}

/* ── 装饰带内边界 ───────────────────────────────────────── */

/**
 * 边框类纹样会吃掉一圈空间，返回内容必须让开的最小内缩（M 单位）。
 *   meander  回纹：inset 起，向外占一个 unit
 *   ornament 双线框：inset + 第二道线的偏移
 *   frame    边框：inset + 线宽
 *   corner   角标：inset + 一点余量（只占四角，不必全让）
 * 非边框纹样（ring/wave/dots…）返回 0，它们由 QA 逐条判重叠。
 */
function edgeInset (motifs) {
  var best = 0
  for (var i = 0; i < motifs.length; i++) {
    var m = motifs[i]
    var need = 0
    if (m.type === 'meander') need = (m.inset || 0.045) + (m.step || 0.055)
    else if (m.type === 'ornament') need = (m.inset || 0.045) + 0.014 + (m.w || 0.0011)
    else if (m.type === 'frame') need = (m.inset || 0.05) + (m.w || 0.002)
    else if (m.type === 'corner') need = (m.inset || 0.04) + 0.006
    else if (m.type === 'grid' || m.type === 'diagonal') need = 0
    if (need > best) best = need
  }
  /* 上限夹住：回纹占掉 0.10 已经很多，再大就不该配这个纹样 */
  return Math.min(best, 0.13)
}

/* ── 版式 ───────────────────────────────────────────────── */

/**
 * 返回 slots（0~1 归一化）。排不下时返回 null，交给上层丢弃。
 * 单位：x / maxW → W；y → H；size → M。
 */
function layoutSlots (layout, canvas, rule, type, shortMm, edgeInset) {
  var W = canvas.W
  var H = canvas.H
  /* 边距同时满足三件事：
       1. 比例好看（密度档）
       2. 毫米够用（60mm 迷你牌上 5% = 3mm，已压进裁切安全线）
       3. 让开装饰带——回纹/双线框画在 inset 处，
          文字压上去就是「签到后连这个」骑在回纹上那种翻车。 */
  var m = Math.max(rule.margin, (qa.THRESHOLDS.marginMm * 1.15) / shortMm, edgeInset || 0)
  var g = Math.max(rule.rowGap, (qa.THRESHOLDS.hintFontMm * 0.5) / shortMm)
  var s = {}

  /* align 必须写进数据：render.js 缺省按 center 画，
     左栏不给 align 就会把文字往码上压。QA 也按这个盒判重叠。 */
  function put (key, xM, yM, wM, align) {
    var t = type[key]
    s[key] = {
      x: round(xM / W),
      y: round(yM / H),
      maxW: round(wM / W),
      size: round(t, 5),
      weight: key === 'shop' || key === 'ssid' ? '500' : '400',
      align: align,
      color: key === 'eyebrow' ? 'accent' : key === 'hint' ? 'inkSub' : 'ink'
    }
    if (key === 'eyebrow') s[key].tracking = 0.2
    if (key === 'pwd') s[key].mono = true
  }

  if (layout === 'split') {
    /* 左码右字 */
    var qrSize = Math.min(rule.qrShare * 1.15, H - 2 * m - 0.04)
    if (qrSize < 0.30) return null
    /* 列的起点 = 码右缘 + 白托底 + 行距 */
    var colX = m + qrSize + 0.018 + g * 1.2
    var colW = W - colX - m
    /* 列宽下限：最坏 SSID 不缩也得放得下 */
    var wt = qa.WORST_TEXT.ssid
    var need = (wt.chars * wt.unit * type.ssid) / 0.62
    if (colW < 0.16 || colW < need / W) return null

    s.qr = { cx: round((m + qrSize / 2) / W), cy: 0.5, size: round(qrSize, 5) }

    var rows = ['eyebrow', 'shop', 'ssid', 'pwd', 'hint']
    var lead = m + type.eyebrow
    var tail = H - m - type.hint
    var need = rows.reduce(function (n, k) { return n + type[k] }, 0) + g * (rows.length - 1)
    if (tail - lead < need) return null

    var y = lead + (tail - lead - need) * 0.42
    rows.forEach(function (k) {
      put(k, colX, y + type[k] * 0.5, colW, 'left')
      y += type[k] + g
    })
    return s
  }

  /* center / stack：上下夹逼，中腰给码 */
  var pad = 0.018          /* 与 render.js 的 M * 0.018 白托底一致 */
  var contentW = W - 2 * m
  var maxW = Math.min(rule.headerW, contentW)
  var cx = W / 2

  var topY = m + type.eyebrow * 0.72
  var shopY = topY + type.eyebrow * 1.0 + type.shop * 0.72
  var blockTop = shopY + type.shop * 0.72 + g * 0.6

  var hintY = H - m - type.hint * 0.72
  var pwdY = hintY - type.hint - g
  var ssidY = pwdY - type.pwd - g
  var blockBottom = ssidY - type.ssid * 0.72 - g * 0.6

  var available = blockBottom - blockTop
  var cap = layout === 'center' ? rule.qrShare * 1.25 : rule.qrShare * 1.35
  var qrSize = Math.min(available - 2 * pad, contentW - 2 * pad, cap)
  if (qrSize < 0.26) return null

  var qrCy = (blockTop + available / 2) / H
  s.qr = { cx: round(cx / W), cy: round(qrCy), size: round(qrSize, 5) }

  put('eyebrow', cx, topY, maxW, 'center')
  put('shop', cx, shopY, maxW, 'center')
  put('ssid', cx, ssidY, maxW, 'center')
  put('pwd', cx, pwdY, maxW, 'center')
  put('hint', cx, hintY, maxW, 'center')

  if (layout === 'stack') {
    s.vertical = {
      x: round((W - m * 0.5) / W),
      y: round((blockTop + type.eyebrow) / H),
      size: round(type.eyebrow * 0.9, 5),
      step: round(type.eyebrow * 1.6, 5),
      color: 'inkSub',
      align: 'center'
    }
  }
  return s
}

/* ── 文案与命名 ─────────────────────────────────────────── */

var LAYOUT_CN = { center: '码居中', split: '左码右字', stack: '上字下码' }
var DENSITY_CN = { minimal: '大留白', light: '疏朗', medium: '适中', dense: '信息密' }

function describe (opt) {
  return opt.region + '风格 · ' + LAYOUT_CN[opt.layout] + ' · ' + DENSITY_CN[opt.density]
}

/* ── 名称 ───────────────────────────────────────────────── */

/**
 * 名字池按地区分开：新中式读起来要像旧字号，极简要像代号，
 * 混在一口池子里就会所有模板都是同一个味道。
 * 第二字共用一池，靠互质步进打散——
 * 连续序号不会都落在同一个尾字上（否则会出现「风间 山间 海间」这种连排）。
 */
/**
 * 名字池。两个约束互相打架：
 *   - 要有地区味道（新中式像旧字号，极简要像代号）
 *   - 又不能撞名（列表里两个「雾间」用户会以为是同一个模板）
 * 所以五口池子的首字必须两两不相交，尾字共用一池；
 * 再用混合进制取号：首字跟着序号转，尾字每 20 个换一次，
 * 560 个之后加一个字号后缀（斋/馆/堂/居），单区容量 2240。
 * 名字仍是「序号 + 地区」的纯函数：不查历史，刷新不串位。
 */
var POOLS = {
  '新中式': ['醉', '霞', '灯', '檐', '灶', '庭', '垣', '朱', '砚', '茗', '陶', '锦', '绣', '阁', '廊', '阙', '轩', '楹', '樽', '窗'],
  '日式':   ['夜', '泊', '雾', '汐', '苔', '雪', '月', '松', '竹', '梅', '鹤', '岚', '汀', '屿', '渚', '柊', '柏', '桧', '濑', '濛'],
  '韩式':   ['素', '净', '柔', '烟', '乳', '棉', '绵', '浅', '淡', '暖', '微', '静', '谧', '婉', '恬', '澄', '滢', '芷', '蕊', '糯'],
  '欧式':   ['候', '航', '厅', '柱', '拱', '砖', '石', '铜', '银', '缎', '绒', '瓷', '雕', '绘', '章', '纹', '钟', '炉', '幔', '帷'],
  '极简':   ['方', '白', '灰', '线', '点', '格', '空', '序', '列', '寸', '分', '平', '直', '单', '双', '三', '四', '五', '六', '零']
}
var TAIL = '间里舍屋台盘笺牌影声色青净远清浅暖晚初知可序景光物时风'
var SUF = '斋馆堂居'

var HEAD_N = 20
var TAIL_N = TAIL.length
var BLOCK = HEAD_N * TAIL_N          /* 560：单区一个后缀档的容量 */

/**
 * tierBase 把两条取号流隔开：
 *   0 = 分页流（两字名 + 「X间斋」）
 *   2 = 硬条件流（「X间馆」+「X间堂」）
 * 后缀档不同就不可能撞名，而且各自仍是序号的纯函数——
 * 不查历史，刷新不串位。每档单区 560 个，两档 1120，够用。
 */
function nameFor (index, region, tierBase) {
  var pool = POOLS[region] || POOLS['极简']
  var base = tierBase === 2 ? 2 : 0
  var j = Math.max(0, index | 0) % (BLOCK * 2)
  var head = pool[j % HEAD_N]
  /* 尾字若只按 floor(j/20) 走，一页 24 条里有 20 条共用同一个尾字
     （「夜间 白间 雾间 汐间…」整屏一个韵脚）。
     改成 tail = (a + 7b) mod 28，其中 j = 20a + b：
     相邻序号尾字跳 7，同区内仍是单射——
     给定 b（首字）与 tail，a 唯一还原，不会撞名。 */
  var a = Math.floor(j / HEAD_N)
  var b = j % HEAD_N
  var tail = TAIL.charAt((a + b * 7) % TAIL_N)
  var tier = base + Math.floor(j / BLOCK)
  return tier === 0 ? head + tail : head + tail + SUF.charAt(tier)
}

/** 池子自检：首字跨区不许重复，否则撞名是结构性的 */
function poolsDisjoint () {
  var seen = {}
  var keys = Object.keys(POOLS)
  for (var r = 0; r < keys.length; r++) {
    var list = POOLS[keys[r]]
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) return false
      seen[list[i]] = 1
    }
  }
  return true
}

/* ── id：自描述 ─────────────────────────────────────────── */

/**
 * 五个维度打包成 4 位 36 进制：
 *   shape(5) × layout(3) × region(5) × density(4) × use(10) = 3000
 * 于是 id 里带着「这条模板是怎么长出来的」，
 * find(id) 不必翻缓存、不必扫页，直接重算一条出来。
 * 冷启动（用户从草稿恢复、或小程序重启后直接进编辑器）也能找回来。
 */
var DIMS = {
  shape: lib.SHAPES.map(function (s) { return s.key }),
  layout: tax.LAYOUTS,
  region: tax.REGIONS,
  density: tax.DENSITIES,
  use: tax.USES.map(function (u) { return u.key })
}

function packCode (opt) {
  var n = 0
  n = n * DIMS.layout.length + Math.max(0, DIMS.layout.indexOf(opt.layout))
  n = n * DIMS.region.length + Math.max(0, DIMS.region.indexOf(opt.region))
  n = n * DIMS.density.length + Math.max(0, DIMS.density.indexOf(opt.density))
  n = n * DIMS.use.length + Math.max(0, DIMS.use.indexOf(opt.use))
  var s = n.toString(36)
  while (s.length < 4) s = '0' + s
  var si = Math.max(0, DIMS.shape.indexOf(opt.shape)).toString(36)
  return si + s
}

function unpackCode (code) {
  if (!code || code.length !== 5) return null
  var shape = DIMS.shape[parseInt(code.charAt(0), 36)]
  var n = parseInt(code.slice(1), 36)
  if (!shape || isNaN(n)) return null
  var use = DIMS.use[n % DIMS.use.length]; n = Math.floor(n / DIMS.use.length)
  var density = DIMS.density[n % DIMS.density.length]; n = Math.floor(n / DIMS.density.length)
  var region = DIMS.region[n % DIMS.region.length]; n = Math.floor(n / DIMS.region.length)
  var layout = DIMS.layout[n % DIMS.layout.length]
  if (!use || !density || !region || !layout) return null
  return { shape: shape, layout: layout, region: region, density: density, use: use }
}

function makeId (seed, opt) {
  /* 三段：seed（几何） + 维度码（怎么长出来的） + 名字档与槽位（叫什么）。
     名字必须编进 id：seed→名字 在跨页时不是单射，
     只有「全局槽位」才是密的，所以槽位也得带上。 */
  var slot = (opt.slot || 0) % 46656
  var s = slot.toString(36)
  while (s.length < 3) s = '0' + s
  return 'g' + (seed >>> 0).toString(36) + '-' + packCode(opt) + (opt.tierBase | 0) + s
}

function parseId (id) {
  var m = /^g([0-9a-z]+)-([0-9a-z]{5})([0-2])([0-9a-z]{3})$/.exec(String(id || ''))
  if (!m) return null
  var seed = parseInt(m[1], 36)
  var dims = unpackCode(m[2])
  if (isNaN(seed) || !dims) return null
  dims.seed = seed >>> 0
  dims.tierBase = parseInt(m[3], 10)
  dims.slot = parseInt(m[4], 36)
  return dims
}

/**
 * 从 id 重算一条模板。
 * 与 generate() 走的是同一个 build() + 同一套打印规格淘汰规则，
 * 所以「列表里看到的」和「编辑器里打开的」必然一模一样。
 */
function rebuild (id) {
  var dims = parseId(id)
  if (!dims) return null
  var tpl = build({
    seed: dims.seed, region: dims.region, shape: dims.shape,
    layout: dims.layout, density: dims.density, use: dims.use,
    tierBase: dims.tierBase, slot: dims.slot
  })
  if (!tpl) return null
  var good = tpl.prints.filter(function (k) { return qa.auditPrint(tpl, k).issues.length === 0 })
  if (!good.length) return null
  tpl.prints = good
  return tpl.id === id ? tpl : null
}

/* ── 单个模板 ───────────────────────────────────────────── */

function build (opt) {
  var r = rng(opt.seed)
  var canvas = canvasOf(opt.shape)
  var rule = tax.DENSITY_RULES[opt.density]
  var shortMm = minShortEdge(opt.shape)
  var type = typeScale(r, opt.density, opt.shape)

  /* 先决定纹样，再排文字：装饰带的位置决定内容能贴到哪儿。
     顺序反过来就会写出压边框的模板——QA 也只能整条丢掉。 */
  var motifs = regionMotifs(r, opt.region)
  var slots = layoutSlots(opt.layout, canvas, rule, type, shortMm, edgeInset(motifs))
  if (!slots) return null

  var palette = makePalette(r, opt.region, opt.density === 'minimal' ? r() < 0.5 : r() < 0.38)
  if (!palette) return null

  /* 实心纹样必须在文字与码排完之后落位：
     先放章再排字，章就会压在密码行上（截图里见过那种翻车）。 */
  var occupied = occupiedBoxes(canvas, slots)
  var mEdge = Math.max(rule.margin, (qa.THRESHOLDS.marginMm * 1.15) / shortMm)

  if (opt.region === '新中式') {
    var sealSize = round(span(r, 0.075, 0.105), 4)
    var spot = findFreeSpot(canvas, occupied, sealSize, mEdge)
    if (spot) {
      motifs.push({
        type: 'seal',
        x: round(spot.x / canvas.W), y: round(spot.y / canvas.H),
        size: sealSize, color: 'accent', ink: 'bg',
        alpha: round(span(r, 0.78, 0.95), 3)
      })
      occupied.push([spot.x - sealSize / 2, spot.y - sealSize / 2, spot.x + sealSize / 2, spot.y + sealSize / 2])
    }
  }

  /* 花饰：只在有素材时用，且必须落在真空位上。
     它的宽高比是固定的（图片决定），不能像 panel 那样随便拉伸。 */
  if (ORNAMENTS.length && r() < 0.45) {
    var orn = pick(r, ORNAMENTS)
    var aspect = orn.aspect || 1
    /* 以短边为基准定尺寸：宽幅花饰（2.3:1）取宽，竖幅（0.93:1）取高，
       两者在迷你牌和长条桌签上都不会大到盖住整面。 */
    var base = Math.min(canvas.W, canvas.H) * span(r, 0.30, 0.46)
    var ow, oh
    if (aspect >= 1) { ow = base; oh = base / aspect }
    else { oh = base; ow = base * aspect }
    if (ow > canvas.W - mEdge * 2 || oh > canvas.H - mEdge * 2) { ow = 0; oh = 0 }
    var spotO = ow > 0 ? findFreeSpot(canvas, occupied, Math.max(ow, oh), mEdge) : null
    if (spotO) {
      motifs.push({
        type: 'fleuron',
        key: orn.key,
        x: round(spotO.x / canvas.W), y: round(spotO.y / canvas.H),
        w: round(ow / canvas.W), h: round(oh / canvas.H),
        color: 'accent', alpha: round(span(r, 0.5, 0.8), 3)
      })
      occupied.push([spotO.x - ow / 2, spotO.y - oh / 2, spotO.x + ow / 2, spotO.y + oh / 2])
    }
  }

  var room = Math.max(0, rule.motifMax - motifs.length)
  var extra = Math.floor(r() * (room + 1))
  for (var i = 0; i < extra; i++) motifs.push(pick(r, EXTRA)(r, canvas))

  /* 码托底：整块浅色 panel 把码包住，不与任何内容重叠才允许 */
  /* 码托底：浅色圆角块整块包住码。
     panel 的 w 相对 W、h 相对 H（见 render.js），
     所以「正方形托底」要按 mm 反推两边，不能直接拿 qr.size 当宽高——
     在 1:2 竖条上那样会画成一条 76×152mm 的巨块，把店名和密码全盖住。 */
  if (r() < 0.3 && slots.qr) {
    var qr = slots.qr
    var edgeMm = qr.size * 1.24
    var pw = round(edgeMm / canvas.W, 4)
    var ph = round(edgeMm / canvas.H, 4)
    var pbox = [
      qr.cx * canvas.W - edgeMm / 2, qr.cy * canvas.H - edgeMm / 2,
      qr.cx * canvas.W + edgeMm / 2, qr.cy * canvas.H + edgeMm / 2
    ]
    var clear = pbox[0] >= mEdge && pbox[1] >= mEdge &&
      pbox[2] <= canvas.W - mEdge && pbox[3] <= canvas.H - mEdge
    for (var o2 = 0; o2 < occupied.length && clear; o2++) {
      if (hits(pbox, occupied[o2]) && !contains(pbox, occupied[o2])) clear = false
    }
    if (clear) motifs.push({ type: 'panel', x: round(qr.cx), y: round(qr.cy), w: pw, h: ph, r: 0.03, color: 'inkSub', alpha: round(span(r, 0.03, 0.06), 3), backing: true })
  }

  var pool = tax.COPY[opt.use] || tax.COPY.cafe
  var copy = { eyebrow: pick(r, pool.eyebrow), hint: pick(r, pool.hint) }
  if (opt.region === '日式') {
    copy.vertical = pick(r, pool.vertical)
    if (!slots.vertical) {
      slots.vertical = {
        x: round((canvas.W - rule.margin * 0.6) / canvas.W),
        y: round(0.3),
        size: round(type.eyebrow * 0.95, 5),
        step: round(type.eyebrow * 1.6, 5),
        color: 'inkSub',
        align: 'center'
      }
    }
  }

  var scenes = [opt.use]
  var other = tax.USES.map(function (u) { return u.key }).filter(function (k) { return k !== opt.use })
  scenes.push(pick(r, other))
  if (r() < 0.3) {
    var third = other.filter(function (k) { return scenes.indexOf(k) === -1 })
    if (third.length) scenes.push(pick(r, third))
  }

  var moods = []
  if (opt.region === '极简') moods.push('都市')
  else if (opt.region === '新中式' || opt.region === '日式') moods.push('传统')
  else if (opt.region === '韩式') moods.push('温馨')
  else moods.push('自然')
  var alt = pick(r, tax.MOODS)
  if (moods.indexOf(alt) === -1 && r() < 0.6) moods.push(alt)

  return {
    id: makeId(opt.seed, opt),
    name: nameFor(opt.slot || 0, opt.region, opt.tierBase),
    scene: scenes,
    shape: opt.shape,
    layout: opt.layout,
    density: opt.density,
    mood: moods,
    region: opt.region,
    prints: SHAPE_PRINTS[opt.shape] || ['a4'],
    font: (opt.region === '欧式' || opt.region === '新中式') && r() < 0.8 ? 'serif' : 'sans',
    desc: describe(opt),
    palette: palette,
    background: {
      type: r() < 0.6 ? 'linear' : 'radial',
      angle: pick(r, [0, 45, 90, 135]),
      at: [round(span(r, 0.3, 0.7)), round(span(r, 0.25, 0.75))],
      r: round(span(r, 0.85, 1.15))
    },
    motifs: motifs,
    copy: copy,
    slots: slots,
    src: 'factory'
  }
}

/* ── 批量 ───────────────────────────────────────────────── */

/**
 * 硬条件下还有哪些形状可用。
 * 形状与打印规格是两套独立枚举，交集为空时整次生成都没意义，
 * 调用方应该直接给空状态，而不是让工厂白跑。
 */
function shapesFor (only) {
  var o = only || {}
  var all = lib.SHAPES.map(function (s) { return s.key })
  var shapes = (o.shapes && o.shapes.length) ? all.filter(function (k) { return o.shapes.indexOf(k) !== -1 }) : all
  if (!o.prints || !o.prints.length) return shapes
  return shapes.filter(function (k) {
    var list = SHAPE_PRINTS[k] || []
    for (var s = 0; s < list.length; s++) if (o.prints.indexOf(list[s]) !== -1) return true
    return false
  })
}

function possible (only) {
  return shapesFor(only).length > 0
}

/**
 * 生成 → 体检 → 只留合格。
 * 打印规格也是筛出来的：一个模板只保留 QA 全过的那些规格，
 * 全不过就整个丢掉（这正是「48k 模板」能站住的原因——闸门比手速重要）。
 *
 * o.only：硬条件（形状 / 打印规格 / 场景 / 版式）。
 * 与 utils/filters.js 的分工是照 wi-qr 那套目录模型抄的：
 * 硬条件交给生成器——它能在源头只长符合条件的，
 * 偏好（氛围 / 地区）留在筛选层做排序。
 * 否则「先造 970 条再过滤」在小程序里等于自杀。
 */
function generate (opt) {
  var o = opt || {}
  var base = (o.seed || 20261114) >>> 0
  var want = o.keep || 60
  var only = o.only || {}

  var shapes = (only.shapes && only.shapes.length) ? only.shapes.slice() : lib.SHAPES.map(function (s) { return s.key })
  var uses = (only.scene && only.scene !== 'all') ? [only.scene] : tax.USES.map(function (u) { return u.key })
  var layouts = (only.layout && only.layout.length) ? only.layout.slice() : tax.LAYOUTS
  var regions = (only.regions && only.regions.length) ? only.regions.slice() : tax.REGIONS
  var densities = (only.densities && only.densities.length) ? only.densities.slice() : tax.DENSITIES

  var indexBase = o.indexBase || 0
  var seen = {}
  var out = []
  var rejected = []
  var tried = 0
  var i = 0

  while (out.length < want && i < want * 80) {
    i++
    tried++
    var seed = (base + i * 2654435761) >>> 0
    /* chooser 与 build 的随机流分开：
       build(seed, dims) 只依赖 seed + 维度，才能从 id 反推 */
    var r = rng((seed ^ 0x9e3779b9) >>> 0)
    var region = pick(r, regions)
    var shape = shapes[(i - 1) % shapes.length]
    var layout = pick(r, layouts)
    var density = pick(r, densities)
    var use = uses[Math.floor(r() * uses.length) % uses.length]

    /* 形状与版式的硬兼容 */
    if (layout === 'split' && lib.getShape(shape).ratio < 1.4) continue
    if (lib.getShape(shape).ratio >= 1.4 && layout === 'center' && density === 'minimal') continue

    var tpl = build({
      seed: seed, region: region, shape: shape, layout: layout,
      density: density, use: use,
      tierBase: o.tierBase, slot: indexBase + out.length
    })
    if (!tpl) { rejected.push({ seed: seed, issues: ['排版不下'] }); continue }

    var sig = [region, shape, layout, density, tpl.palette.bg, tpl.motifs.map(function (m) { return m.type }).join('+')].join('|')
    if (seen[sig]) continue
    seen[sig] = 1

    /* 逐规格筛：既要 QA 过，也要在用户勾选的规格里 */
    var good = tpl.prints.filter(function (k) {
      if (only.prints && only.prints.length && only.prints.indexOf(k) === -1) return false
      return qa.auditPrint(tpl, k).issues.length === 0
    })
    tpl.prints = good
    if (!good.length) {
      rejected.push({ id: tpl.id, region: region, shape: shape, layout: layout, density: density, issues: ['所有打印规格都不合格'] })
      continue
    }

    var audit = qa.audit(tpl)
    if (audit.ok) out.push(tpl)
    else rejected.push({ id: tpl.id, region: region, shape: shape, layout: layout, density: density, issues: audit.issues.slice(0, 3) })
  }

  return { templates: out, rejected: rejected, tried: tried }
}

module.exports = {
  rng: rng,
  canvasOf: canvasOf,
  minShortEdge: minShortEdge,
  makePalette: makePalette,
  typeScale: typeScale,
  layoutSlots: layoutSlots,
  build: build,
  generate: generate,
  makeId: makeId,
  parseId: parseId,
  packCode: packCode,
  unpackCode: unpackCode,
  rebuild: rebuild,
  shapesFor: shapesFor,
  possible: possible,
  nameFor: nameFor,
  poolsDisjoint: poolsDisjoint,
  SHAPE_PRINTS: SHAPE_PRINTS
}