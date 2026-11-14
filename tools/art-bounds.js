/**
 * tools/art-bounds.js —— 从装饰图里量出「哪些地方能写字」
 *
 * 手填坐标会有两个后果：换一张插画就得重填一遍；填错了只有印出来才发现。
 * 这里改成对每张图做像素分析，量出两块东西写进 JSON：
 *
 *   icon   顶部那个圆形徽章（含主题 Wi-Fi 图标）的外接矩形 —— 信息层不能盖住它
 *   avoid  四角插画的外接矩形 —— 文字与二维码都不能压上去（QA 会逐条查）
 *   safe   由上面两者夹出来的中间矩形 —— 信息层就在这个矩形里排
 *
 * 判定规则（都可量化，没有魔法数）：
 *   非白         任一通道 < 248（阈值取 248 是为了避掉 webp 在白区的压缩噪点）
 *   连通域       8 邻域，面积 < 0.00002 的当噪点丢掉
 *   icon         中心 x ∈ [0.25, 0.75] 且顶边 y < 0.25 的最大块
 *   avoid        其余所有块（已与 icon 合并且包含 icon 的块被剔除）
 *   safe         横向取左右两侧 avoid 的内边界，纵向取 icon 底到下方 avoid 顶
 *
 * 产物：packageTpl/art/bounds.js（module.exports，小程序 require 只认 .js）
 * 运行：node tools/art-bounds.js [--print]
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var ART_DIR = path.join(ROOT, 'packageTpl', 'art')
var TMP_DIR = path.join(ROOT, 'tools', 'out', 'art')
var OUT_JS = path.join(ART_DIR, 'bounds.js')

var WHITE = 248          // 任一通道低于它就算「有内容」
var MIN_AREA = 0.00002   // 连通域面积下限（相对整图），滤掉压缩噪点
var PAD = 0.012          // 外接矩形外扩，避免抗锯齿边缘刚好压线

function nonWhite (px) {
  return px.r < WHITE || px.g < WHITE || px.b < WHITE
}

/**
 * 8 邻域连通域标记。用显式栈而不是递归——1200×1680 的图递归会爆栈。
 * @returns {Array<{x0,y0,x1,y1,area}>} 像素坐标的包围盒
 */
function components (image) {
  var w = image.bitmap.width
  var h = image.bitmap.height
  var data = image.bitmap.data

  var mask = new Uint8Array(w * h)
  for (var i = 0, p = 0; i < w * h; i++, p += 4) {
    if (data[p] < WHITE || data[p + 1] < WHITE || data[p + 2] < WHITE) mask[i] = 1
  }

  var seen = new Uint8Array(w * h)
  var stack = new Int32Array(w * h)
  var boxes = []
  var minPix = Math.max(12, Math.round(w * h * MIN_AREA))

  for (var start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue

    var sp = 0
    stack[sp++] = start
    seen[start] = 1
    var x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0

    while (sp > 0) {
      var idx = stack[--sp]
      var x = idx % w
      var y = (idx - x) / w
      area++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y

      // 8 邻域
      for (var dy = -1; dy <= 1; dy++) {
        var ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          var nx = x + dx
          if (nx < 0 || nx >= w) continue
          var ni = ny * w + nx
          if (!mask[ni] || seen[ni]) continue
          seen[ni] = 1
          stack[sp++] = ni
        }
      }
    }

    if (area >= minPix) boxes.push({ x0: x0, y0: y0, x1: x1, y1: y1, area: area })
  }

  return boxes
}

function toRel (box, w, h, pad) {
  var p = pad == null ? PAD : pad
  var x = box.x0 / w - p
  var y = box.y0 / h - p
  var r = (box.x1 + 1) / w + p
  var b = (box.y1 + 1) / h + p
  return {
    x: Math.max(0, +x.toFixed(4)),
    y: Math.max(0, +y.toFixed(4)),
    w: +(Math.min(1, r) - Math.max(0, x)).toFixed(4),
    h: +(Math.min(1, b) - Math.max(0, y)).toFixed(4)
  }
}

function overlaps (a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** 一个连通域是否落在另一个的大包围盒里（用于把徽章内部的零件并成一块） */
function contains (outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w + 1e-6 &&
    inner.y + inner.h <= outer.y + outer.h + 1e-6
}

function gap (rel, dir) {
  if (dir === 'left') return rel.x + rel.w
  if (dir === 'right') return rel.x
  if (dir === 'top') return rel.y + rel.h
  return rel.y
}

function analyze (image) {
  var w = image.bitmap.width
  var h = image.bitmap.height
  var boxes = components(image)

  var rel = boxes.map(function (b) { return toRel(b, w, h) })

  // 合并：被别的包围盒完全包住的碎片（徽章里的杯子、弧线、圆点）并进外层
  var merged = []
  rel.forEach(function (r, i) {
    var host = -1
    for (var j = 0; j < rel.length; j++) {
      if (i === j) continue
      if (contains(rel[j], r) && rel[j].w * rel[j].h > r.w * r.h) { host = j; break }
    }
    if (host === -1) merged.push(r)
  })

  // icon：顶部居中的最大块
  var icon = null
  merged.forEach(function (r) {
    var cxr = r.x + r.w / 2
    if (r.y > 0.25) return
    if (cxr < 0.25 || cxr > 0.75) return
    if (!icon || r.w * r.h > icon.w * icon.h) icon = r
  })

  var avoid = merged.filter(function (r) { return r !== icon })

  // 四角插画按中心点归到 tl / tr / bl / br，方便页面按需隐藏某一角
  avoid = avoid.map(function (r) {
    var cxr = r.x + r.w / 2
    var cyr = r.y + r.h / 2
    var where = (cyr < 0.5 ? 't' : 'b') + (cxr < 0.5 ? 'l' : 'r')
    return { x: r.x, y: r.y, w: r.w, h: r.h, corner: where }
  }).sort(function (a, b) { return a.corner < b.corner ? -1 : 1 })

  // safe：左右取内边界，纵向从 icon 底到下方插画顶
  var leftEdge = 0.04
  var rightEdge = 0.96
  var topEdge = icon ? gap(icon, 'top') : 0.04
  var bottomEdge = 0.96

  avoid.forEach(function (r) {
    var cxr = r.x + r.w / 2
    if (cxr < 0.5) leftEdge = Math.max(leftEdge, gap(r, 'left'))
    else rightEdge = Math.min(rightEdge, gap(r, 'right'))
  })
  avoid.forEach(function (r) {
    if (r.y > 0.5) bottomEdge = Math.min(bottomEdge, gap(r, 'top'))
  })

  // 四角插画一般只吃掉两侧，中间仍是通的；若左右边界被挤到不足 40%，退回整幅内缩
  if (rightEdge - leftEdge < 0.4) {
    leftEdge = 0.06
    rightEdge = 0.94
  }

  var safe = {
    x: +leftEdge.toFixed(4),
    y: +topEdge.toFixed(4),
    w: +(rightEdge - leftEdge).toFixed(4),
    h: +(bottomEdge - topEdge).toFixed(4)
  }

  var ink = 0
  var data = image.bitmap.data
  for (var i = 0; i < w * h; i++) {
    if (data[i * 4] < WHITE || data[i * 4 + 1] < WHITE || data[i * 4 + 2] < WHITE) ink++
  }

  return {
    size: { w: w, h: h },
    icon: icon,
    avoid: avoid,
    safe: safe,
    inkRatio: +(ink / (w * h)).toFixed(5),
    blocks: merged.length
  }
}

/* ── 主流程 ─────────────────────────────────────────────── */

var files = fs.readdirSync(ART_DIR).filter(function (f) { return /\.webp$/.test(f) }).sort()
if (!files.length) {
  console.error('packageTpl/art 下没有 webp，先跑 node tools/make-art.js')
  process.exit(1)
}

fs.mkdirSync(TMP_DIR, { recursive: true })

var result = {}
var problems = []

files.forEach(function (f) {
  var key = f.replace(/\.webp$/, '')
  var src = path.join(ART_DIR, f)
  var png = path.join(TMP_DIR, key + '.decoded.png')

  execFileSync('dwebp', ['-quiet', src, '-o', png])

  // jimp 只有异步 read，而这里要在启动阶段同步拿到像素，于是起子进程解码
  var image = readSync(png)

  var info = analyze(image)
  info.art = f
  result[key] = info

  if (!info.icon) problems.push(key + ' 没找到顶部图标区')
  if (!info.avoid.length) problems.push(key + ' 没找到边角插画')
  if (info.safe.h < 0.45) problems.push(key + ' 可用区高度只有 ' + info.safe.h)

  console.log('  ' + key.padEnd(10) +
    'icon ' + (info.icon ? [info.icon.x, info.icon.y, info.icon.w, info.icon.h].map(function (n) { return n.toFixed(3) }).join(' ') : '(缺)') +
    '  避让 ' + info.avoid.length + ' 块' +
    '  安全区 ' + [info.safe.x, info.safe.y, info.safe.w, info.safe.h].map(function (n) { return n.toFixed(3) }).join(' ') +
    '  墨色占比 ' + (info.inkRatio * 100).toFixed(2) + '%')
})

/**
 * 同步读 PNG。
 * jimp 没有同步 API，而这里需要在 require 阶段就拿到尺寸，
 * 于是自己解析 PNG 头 + 依赖 jimp 的解码器：用 execFileSync 起一个子进程同步解码。
 */
function readSync (file) {
  var code = 'var J=require("' + path.join(__dirname, 'auto/node_modules/jimp').replace(/\\/g, '/') + '");' +
    'J.read(process.argv[1]).then(function(img){' +
    'var w=img.bitmap.width,h=img.bitmap.height,d=img.bitmap.data;' +
    'process.stdout.write(JSON.stringify({w:w,h:h,d:Buffer.from(d).toString("base64")}))});'
  var out = execFileSync(process.execPath, ['-e', code, file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  var raw = JSON.parse(out)
  return {
    bitmap: {
      width: raw.w,
      height: raw.h,
      data: Buffer.from(raw.d, 'base64')
    }
  }
}

// 小程序的 require 只解析 .js，JSON 文件不能直接 require，所以生成模块而不是 json
fs.writeFileSync(OUT_JS,
  '/**\n' +
  ' * 自动生成，勿手改 —— 跑 node tools/art-bounds.js 重新量。\n' +
  ' *\n' +
  ' * 每套装饰图量出：icon 顶部徽章矩形 / avoid 四角插画矩形 / safe 信息层可用区。\n' +
  ' * 全部是 0~1 的相对比例，与画布尺寸、打印规格无关。\n' +
  ' */\n' +
  'module.exports = ' + JSON.stringify(result, null, 2) + '\n')
console.log('\n写入 ' + path.relative(ROOT, OUT_JS) + '（' + files.length + ' 套）')
if (problems.length) {
  console.log('需要人工看一眼：')
  problems.forEach(function (p) { console.log('  ! ' + p) })
} else {
  console.log('全部 6 套都量到了图标区与边角插画')
}
