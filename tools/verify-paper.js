/**
 * tools/verify-paper.js —— 白纸系列验收
 *
 * [1] 数据：6 套模板、色值、装饰图与 bounds 齐全、场景合法、深色在纸后
 * [2] 排版：信息层的每个文字块与二维码框都不能侵入插画避让区 / 顶部徽章
 * [3] 对比度：正文 ≥ 4.5，辅助字 ≥ 3.0，二维码 ≥ 7.0（WCAG 相对亮度）
 * [4] 解码：真实绘制 → 系统识别器 → 与载荷逐字符一致
 * [5] 降级：空间不足时自动缩字号/缩码，但不破毫米下限；放不下必须报 warning
 *
 * 运行：node tools/verify-paper.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(__dirname, 'out', 'paper')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

var catalog = require(path.join(ROOT, 'templates/catalog.js'))
var bounds = require(path.join(ROOT, 'packageTpl/art/bounds'))
var wifi = require(path.join(ROOT, 'utils/wifi.js'))
var paperRender = require(path.join(ROOT, 'utils/paper-render.js'))

var pass = 0
var fail = 0
var fails = []
function ok (label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label + (detail ? '  ' + detail : '')) }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (detail ? '  ' + detail : '')) }
}

var PAPER = catalog.bySeries('paper')
var DARK = catalog.bySeries('dark')

var SAMPLE = { shopName: '拾光咖啡', ssid: '拾光网络', password: 'coffee2024', type: 'WPA' }
var PAYLOAD = wifi.buildWifiString(SAMPLE).value

/* ── [1] 数据 ───────────────────────────────────────────── */

console.log('[1] 数据完整性')

ok('白纸模板 6 套', PAPER.length === 6, PAPER.map(function (t) { return t.id }).join(' '))
ok('深色模板 10 套且排在白纸之后',
  DARK.length === 10 && catalog.TEMPLATES.slice(0, 6).every(function (t) { return t.series === 'paper' }),
  catalog.TEMPLATES.length + ' 套')
ok('每套纸张模板都带 series=paper', PAPER.every(function (t) { return t.series === 'paper' }))

var EXPECT = {
  'paper-milktea': ['#5b3a22', '#b07a45'],
  'paper-hotpot': ['#3a1d17', '#c8321f'],
  'paper-minsu': ['#2b3a3f', '#4f6f73'],
  'paper-beauty': ['#4a3340', '#c98aa0'],
  'paper-teahouse': ['#24392f', '#5f9479'],
  'paper-newyear': ['#5a1410', '#c8201c']
}
var colorBad = []
PAPER.forEach(function (t) {
  var e = EXPECT[t.id]
  if (!e || e[0] !== t.ink || e[1] !== t.accent) colorBad.push(t.id + ' ' + t.ink + '/' + t.accent)
})
ok('ink / accent 与指定色值逐字一致', colorBad.length === 0, colorBad.join(' | '))

var artMissing = PAPER.filter(function (t) {
  var f = path.join(ROOT, 'packageTpl/art', t.art + '.webp')
  return !fs.existsSync(f) || !bounds[t.art]
})
ok('装饰图与坐标都齐全', artMissing.length === 0, artMissing.map(function (t) { return t.id }).join(' '))

var boundsBad = []
PAPER.forEach(function (t) {
  var b = bounds[t.art]
  if (!b || !b.icon || !b.avoid || b.avoid.length !== 4) boundsBad.push(t.art)
  if (b && b.safe && (b.safe.w < 0.4 || b.safe.h < 0.5)) boundsBad.push(t.art + ' safe 过小')
})
ok('每张图都量出 1 个图标区 + 4 个避让区', boundsBad.length === 0, boundsBad.join(' '))

var sceneKeys = catalog.SCENES.map(function (s) { return s.key })
ok('新场景全部进表（奶茶/火锅/民宿/美甲/茶室/节日）',
  ['milktea', 'hotpot', 'minsu', 'salon', 'teahouse', 'festival'].every(function (k) { return sceneKeys.indexOf(k) !== -1 }),
  catalog.SCENES.length + ' 个场景')
ok('原场景保留', ['hotel', 'cafe', 'dining', 'beauty', 'office', 'clinic', 'lobby', 'outdoor', 'venue', 'home']
  .every(function (k) { return sceneKeys.indexOf(k) !== -1 }))
ok('每套纸张模板的场景都在表内', PAPER.every(function (t) {
  return t.scene.every(function (k) { return sceneKeys.indexOf(k) !== -1 })
}))
ok('每套都声明了 A6/A5/A4', PAPER.every(function (t) {
  return ['a6', 'a5', 'a4'].every(function (k) { return t.prints.indexOf(k) !== -1 })
}))
ok('预留字段存在且为空', PAPER.every(function (t) {
  return t.placeNo === '' && t.likes === 0 && t.miniCodeUrl === ''
}))

/* ── 渲染（Chrome）──────────────────────────────────────── */

function bundle (mods) {
  return mods.map(function (rel) {
    return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' +
      fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n});</script>'
  }).join('\n')
}

var LOADER = [
  'var __defs={},__cache={};',
  'function __define(n,f){__defs[n]=f}',
  'function __norm(base,req){if(req.charAt(0)!==".")return req;var p=base.split("/");p.pop();',
  'req.split("/").forEach(function(x){if(!x||x===".")return;if(x==="..")p.pop();else p.push(x)});',
  'var o=p.join("/");return /\\.js$/.test(o)?o:o+".js"}',
  'function __req(from){return function(name){var k=__norm(from,name);if(__cache[k])return __cache[k].exports;',
  'var fn=__defs[k];if(!fn)throw new Error("no module "+k);var m={exports:{}};__cache[k]=m;',
  'fn(m,m.exports,__req(k));return m.exports}}'
].join('\n')

var MODS = [
  'templates/index.js', 'templates/paper.js', 'templates/catalog.js',
  'utils/wifi.js', 'utils/qrcode.js', 'utils/qr-canvas.js',
  'utils/render.js', 'utils/paper-render.js'
]

function artData () {
  var dir = path.join(ROOT, 'packageTpl', 'art')
  var out = {}
  fs.readdirSync(dir).filter(function (f) { return /\.webp$/.test(f) }).forEach(function (f) {
    out[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64')
  })
  return out
}

var PX_PER_MM = 3
var jobs = []
PAPER.forEach(function (t) {
  t.prints.forEach(function (key) {
    var p = catalog.getPrint(key)
    jobs.push({
      id: t.id, print: key,
      w: Math.round(p.w * PX_PER_MM), h: Math.round(p.h * PX_PER_MM),
      mmW: p.w, mmH: p.h
    })
  })
})

var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out">pending</pre><script>' +
  LOADER + '</script>' + bundle(MODS) + '<script>' +
  'var C=__req("main.js")("templates/catalog.js");' +
  'var PR=__req("main.js")("utils/paper-render.js");' +
  'var W=__req("main.js")("utils/wifi.js");' +
  'var BOUNDS=' + JSON.stringify(bounds) + ';' +
  'var ART=' + JSON.stringify(artData()) + ';' +
  'var JOBS=' + JSON.stringify(jobs) + ';' +
  'var SAMPLE=' + JSON.stringify(SAMPLE) + ';' +
  'var PAYLOAD=W.buildWifiString(SAMPLE).value;' +
  'var res=[],i=0;' +
  'function step(){' +
  '  if(i>=JOBS.length){document.getElementById("out").textContent=JSON.stringify(res);return}' +
  '  var job=JOBS[i++];var tpl=C.getTemplate(job.id);var b=BOUNDS[tpl.art];' +
  '  var img=new Image();' +
  '  img.onload=function(){draw(tpl,job,b,img)};' +
  '  img.onerror=function(){draw(tpl,job,b,null)};' +
  '  img.src=ART[tpl.art];' +
  '}' +
  'function draw(tpl,job,b,img){' +
  '  var c=document.createElement("canvas");c.width=job.w;c.height=job.h;' +
  '  var meta=PR.renderPaper(c.getContext("2d"),tpl,{' +
  '    shopName:SAMPLE.shopName,ssid:SAMPLE.ssid,password:SAMPLE.password,type:"WPA",' +
  '    showPassword:true,payload:PAYLOAD,mm:{w:job.mmW,h:job.mmH}' +
  '  },job.w,job.h,{art:img,bounds:b,mm:{w:job.mmW,h:job.mmH}});' +
  '  res.push({key:job.id+"@"+job.print,id:job.id,print:job.print,' +
  '    w:job.w,h:job.h,mmW:job.mmW,mmH:job.mmH,meta:meta,url:c.toDataURL("image/png")});' +
  '  step();' +
  '}' +
  'step();' +
  '</script></body></html>'

fs.mkdirSync(OUT, { recursive: true })
var htmlFile = path.join(OUT, 'verify.html')
fs.writeFileSync(htmlFile, html)

var dom = execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=/tmp/cr-vp-' + Math.random().toString(36).slice(2, 8),
  '--window-size=900,1200', '--virtual-time-budget=20000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m || m[1] === 'pending') {
  console.log('  ✗ 渲染输出缺失')
  process.exit(1)
}
var rendered = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))

ok('渲染条目数 = 6 套 × 3 规格', rendered.length === 18, rendered.length + ' 条')

/* ── [2] 不侵入避让区 ───────────────────────────────────── */

console.log('\n[2] 排版不侵入插画')

function hit (a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

var intrusions = []
rendered.forEach(function (r) {
  var meta = r.meta
  var blocks = []
  if (meta.title && meta.title.box) blocks.push(['标题', meta.title.box])
  if (meta.sub && meta.sub.box) blocks.push(['副标题', meta.sub.box])
  if (meta.ssid && meta.ssid.box) blocks.push(['网络', meta.ssid.box])
  if (meta.pwd && meta.pwd.box) blocks.push(['密码', meta.pwd.box])
  if (meta.shop && meta.shop.box) blocks.push(['店名', meta.shop.box])
  blocks.push(['二维码框', meta.qr.frame])
  if (meta.vertical && meta.vertical.box) blocks.push(['竖排', meta.vertical.box])

  blocks.forEach(function (pair) {
    var name = pair[0]
    var box = pair[1]
    ;(meta.avoid || []).forEach(function (a) {
      if (hit(box, a)) intrusions.push(r.key + ' ' + name + ' × ' + a.corner)
    })
    if (meta.icon && hit(box, meta.icon)) intrusions.push(r.key + ' ' + name + ' × 徽章')
  })

  // 元素之间也不能叠（标题压二维码之类）
  for (var i = 0; i < blocks.length; i++) {
    for (var j = i + 1; j < blocks.length; j++) {
      if (hit(blocks[i][1], blocks[j][1])) intrusions.push(r.key + ' ' + blocks[i][0] + ' 压 ' + blocks[j][0])
    }
  }
})

ok('文字与二维码都没压到插画 / 徽章 / 彼此', intrusions.length === 0,
  intrusions.slice(0, 4).join(' | '))

/* ── [3] 对比度 ─────────────────────────────────────────── */

console.log('\n[3] 对比度（WCAG）')

function parseColor (c) {
  var s = String(c)
  var m1 = s.match(/rgba?\(([^)]+)\)/)
  if (m1) {
    var parts = m1[1].split(',').map(Number)
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  var h = s.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16), a: 1 }
}

function overWhite (c) {
  var p = parseColor(c)
  return {
    r: Math.round(p.r * p.a + 255 * (1 - p.a)),
    g: Math.round(p.g * p.a + 255 * (1 - p.a)),
    b: Math.round(p.b * p.a + 255 * (1 - p.a))
  }
}

function luminance (rgb) {
  var s = [rgb.r, rgb.g, rgb.b].map(function (v) {
    var x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}

function contrast (rgb) {
  var l1 = luminance(rgb)
  var l2 = luminance({ r: 255, g: 255, b: 255 })
  var hi = Math.max(l1, l2)
  var lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

var contrastBad = []
var contrastRows = []
rendered.forEach(function (r) {
  var meta = r.meta
  var items = []
  if (meta.title) items.push(['标题', meta.title.color, 4.5])
  if (meta.sub) items.push(['副标题', meta.sub.color, 4.5])
  if (meta.ssid) items.push(['网络', meta.ssid.color, 4.5])
  if (meta.pwd) items.push(['密码', meta.pwd.color, 4.5])
  if (meta.shop) items.push(['店名', meta.shop.color, 4.5])
  if (meta.vertical) items.push(['竖排', meta.vertical.color, 3.0])
  items.forEach(function (it) {
    var c = contrast(overWhite(it[1]))
    if (c < it[2]) contrastBad.push(r.key + ' ' + it[0] + ' ' + c.toFixed(2))
    contrastRows.push(c)
  })
})
ok('正文 ≥ 4.5 / 辅助字 ≥ 3.0', contrastBad.length === 0,
  '最低 ' + Math.min.apply(null, contrastRows).toFixed(2) + (contrastBad.length ? ' | ' + contrastBad.slice(0, 3).join(' ') : ''))

var qrContrast = contrast(parseColor(PAPER[0].ink))
ok('二维码对白底 ≥ 7.0', PAPER.every(function (t) { return contrast(parseColor(t.ink)) >= 7 }),
  '最低 ' + Math.min.apply(null, PAPER.map(function (t) { return contrast(parseColor(t.ink)) })).toFixed(2))

/* ── [4] 解码 ───────────────────────────────────────────── */

console.log('\n[4] 解码一致')

var decodeBad = []
rendered.forEach(function (r) {
  var file = path.join(OUT, 'verify-' + r.key.replace(/[@]/g, '-') + '.png')
  fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'))

  var decoded = '(解码失败)'
  try {
    var out = execFileSync('swift', [path.join(__dirname, 'decode.swift'), file], { encoding: 'utf8' })
    var line = out.split('\n').filter(function (l) { return l.indexOf('载荷') === 0 })[0] || ''
    decoded = line.replace('载荷: ', '').trim()
  } catch (e) { /* keep */ }

  if (decoded !== PAYLOAD) decodeBad.push(r.key + ' → ' + decoded.slice(0, 40))
})

ok('18 张全部解码一致（中文 SSID）', decodeBad.length === 0, decodeBad.slice(0, 2).join(' | '))

/* ── [5] 降级与下限 ─────────────────────────────────────── */

console.log('\n[5] 空间不足时的降级')

var scaleDown = []
var noWarn = []
rendered.forEach(function (r) {
  if (r.meta.scale < 1) scaleDown.push(r.key + ' ' + r.meta.scale.toFixed(2))
  if (r.meta.warnings.length) noWarn.push(r.key + ' ' + r.meta.warnings.join(';'))
})
ok('常规规格无需降级（scale=1，无 warning）',
  noWarn.length === 0 && scaleDown.length === 0,
  (noWarn[0] || '') + (scaleDown[0] || ''))

// 毫米下限：18 张都要过
var mmBad = []
rendered.forEach(function (r) {
  ;(r.meta.warnings || []).forEach(function (w) { mmBad.push(r.key + ' ' + w) })
})
ok('所有规格的字号与模块尺寸都在下限之上', mmBad.length === 0, mmBad.slice(0, 3).join(' | '))

// 反例：把可用区压到很小，必须自动缩小并报 warning
var tight = {
  icon: { x: 0.4, y: 0.05, w: 0.2, h: 0.15 },
  avoid: [],
  safe: { x: 0.28, y: 0.22, w: 0.44, h: 0.30 }
}
var tightPlan = paperRender.plan(fakeCtx(), PAPER[0], SAMPLE, 315, 420, tight)
ok('可用区变小时自动缩字号/缩码', tightPlan.scale < 1 || tightPlan.qrSize < 0.30 * Math.min(315, 420),
  'scale ' + tightPlan.scale.toFixed(2) + ' / 码 ' + tightPlan.qrSize.toFixed(0) + 'px')

function fakeCtx () {
  return {
    font: '',
    measureText: function (t) { return { width: String(t).length * 10 } },
    save: function () {}, restore: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, arc: function () {},
    fill: function () {}, stroke: function () {}, fillRect: function () {},
    closePath: function () {}, drawImage: function () {}, fillText: function () {},
    clearRect: function () {}, scale: function () {}
  }
}

/* ── [5.5] 筛选：新场景要能存下来 ───────────────────────── */

console.log('\n[6] 筛选条件与新场景')
// filters.load() 会拿模板库里的场景表当白名单校验本地存的条件；
// 白名单里没有新场景，选完「奶茶咖啡」重进小程序就会被悄悄重置成「全部」。
global.wx = {
  getStorageSync: function (k) {
    return k === 'wifi_filters'
      ? { scene: 'milktea', shapes: [], prints: [], moods: ['温馨'], regions: ['极简'] }
      : ''
  },
  setStorageSync: function () {}
}
var filters = require(path.join(ROOT, 'utils/filters.js'))
var loaded = filters.load()
ok('新场景的选择能原样读回来', loaded.scene === 'milktea', 'scene=' + loaded.scene)
var hit = filters.apply(catalog.TEMPLATES, loaded)
ok('按新场景筛出对应模板', hit.length === 1 && hit[0].id === 'paper-milktea',
  hit.map(function (t) { return t.id }).join(' '))
ok('氛围 / 地区白名单跟模板库同一份', loaded.moods.join('/') === '温馨' && loaded.regions.join('/') === '极简',
  loaded.moods.join('/') + ' · ' + loaded.regions.join('/'))
delete global.wx

/* ── [7] 包结构（这类错误只在真机/模拟器里才炸） ─────────── */
console.log('\n[7] 包结构')
var codeDirs = ['pages', 'utils', 'templates']
var jsonReq = []
codeDirs.forEach(function (dir) {
  var base = path.join(ROOT, dir)
  fs.readdirSync(base).forEach(function (name) {
    var full = path.join(base, name)
    var files = fs.statSync(full).isDirectory()
      ? fs.readdirSync(full).filter(function (f) { return /\.js$/.test(f) }).map(function (f) { return path.join(full, f) })
      : (/\.js$/.test(name) ? [full] : [])
    files.forEach(function (f) {
      var src = fs.readFileSync(f, 'utf8')
      if (/require\([^)]*\.json['"]\)/.test(src)) jsonReq.push(path.relative(ROOT, f))
    })
  })
})
ok('没有 require(xxx.json)（小程序 require 只解析 .js）', jsonReq.length === 0, jsonReq.join(' ') || '0 处')

var artFiles = fs.readdirSync(path.join(ROOT, 'packageTpl/art')).filter(function (f) { return /\.webp$/.test(f) })
var boundsKeys = Object.keys(bounds).filter(function (k) { return bounds[k] && bounds[k].icon })
ok('bounds 与装饰图一一对应',
  artFiles.length === 6 && boundsKeys.length === 6 &&
  artFiles.every(function (f) { return !!bounds[f.replace(/\.webp$/, '')] }),
  artFiles.length + ' 图 / ' + boundsKeys.length + ' 条坐标')

/* ── 汇总 ───────────────────────────────────────────────── */

console.log('\n结果: ' + pass + ' 项通过，' + fail + ' 项失败')
if (fail) {
  console.log('失败项：')
  fails.forEach(function (f) { console.log('  - ' + f) })
  process.exit(1)
}
