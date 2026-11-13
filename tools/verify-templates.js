/**
 * tools/verify-templates.js —— 模板库与渲染的离线验证
 *
 * [1] 数据完整性：10 套模板、5 种形状全覆盖、10 个场景全覆盖、坐标合法
 * [2] 打印可读性：每个「模板 × 打印格式」算二维码边长、模块尺寸、最小字号（毫米）
 * [3] 筛选语义：形状/打印是过滤（隐藏），氛围/地区是偏好（只排序）
 * [4] 渲染回读：每套模板按第一个打印规格真实绘制 → 系统识别器解码 → 与原文全等
 *
 * 运行：node tools/verify-templates.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(__dirname, 'out')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

var lib = require(path.join(ROOT, 'templates/index.js'))
var filterLib = require(path.join(ROOT, 'utils/filters.js'))
var wifi = require(path.join(ROOT, 'utils/wifi.js'))

var pass = 0
var fail = 0
var fails = []

function ok (label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label + (detail ? '  ' + detail : '')) }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (detail ? '  ' + detail : '')) }
}

/* ── [1] 数据完整性 ───────────────────────────────────── */

console.log('\n[1] 数据完整性')

var T = lib.TEMPLATES
ok('模板数量为 10', T.length === 10, '实际 ' + T.length)

var ids = {}
T.forEach(function (t) { ids[t.id] = (ids[t.id] || 0) + 1 })
ok('id 无重复', Object.keys(ids).every(function (k) { return ids[k] === 1 }))

ok('覆盖全部 5 种形状',
  lib.SHAPES.every(function (s) { return T.some(function (t) { return t.shape === s.key }) }),
  lib.SHAPES.map(function (s) {
    return s.key + '×' + T.filter(function (t) { return t.shape === s.key }).length
  }).join(' '))

var sceneKeys = lib.SCENES.filter(function (s) { return s.key !== 'all' })
ok('每个场景至少 1 个模板',
  sceneKeys.every(function (s) { return T.some(function (t) { return t.scene === s.key }) }),
  sceneKeys.map(function (s) {
    return s.label + '×' + T.filter(function (t) { return t.scene === s.key }).length
  }).join(' '))

ok('场景与模板一一对应（10 场景 / 10 模板）',
  new Set(T.map(function (t) { return t.scene })).size === 10)

ok('mood 全部来自枚举', T.every(function (t) {
  return t.mood.length > 0 && t.mood.every(function (m) { return lib.MOODS.indexOf(m) !== -1 })
}))

ok('region 全部来自枚举', T.every(function (t) { return lib.REGIONS.indexOf(t.region) !== -1 }))

ok('prints 非空且合法', T.every(function (t) {
  return t.prints.length > 0 && t.prints.every(function (k) {
    return lib.PRINTS.some(function (p) { return p.key === k })
  })
}))

/* 坐标合法性：把所有 x/y 与长度字段分别夹在 0~1 */
function scanCoords (obj, tplId) {
  var bad = []
  function walk (node, keyPath) {
    if (Array.isArray(node)) {
      node.forEach(function (v, i) { walk(v, keyPath + '[' + i + ']') })
      return
    }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        var v = node[k]
        if (typeof v === 'number' && /^(x|y|cx|cy|x1|y1|x2|y2|r|w|h|size|gap|thick|inset|amp|step|r0|len|wave|wobble)$/.test(k)) {
          if (v < 0 || v > 1.6) bad.push(keyPath + '.' + k + '=' + v)
        }
        walk(v, keyPath + '.' + k)
      })
    }
  }
  walk(obj, tplId)
  return bad
}

var coordBad = []
T.forEach(function (t) { coordBad = coordBad.concat(scanCoords(t, t.id)) })
ok('坐标与长度均在合理范围', coordBad.length === 0, coordBad.slice(0, 3).join(', '))

var text = JSON.stringify(T)
ok('无外链资源（http / 图片路径）', !/https?:\/\//.test(text) && !/\.(png|jpg|jpeg|svg|webp)/i.test(text))

/* ── [2] 打印可读性 ───────────────────────────────────── */

console.log('\n[2] 打印可读性（毫米）')

var rows = []
var qrMin = 999
var modMin = 999
var textMin = 999

T.forEach(function (t) {
  t.prints.forEach(function (key) {
    var p = lib.getPrint(key)
    var portrait = key === 'card' && t.cardPortrait
    var pw = portrait ? p.h : p.w
    var ph = portrait ? p.w : p.h
    var Mmm = Math.min(pw, ph)

    var qrMm = t.slots.qr.size * Mmm
    var modules = 29 + 8 // 版本 3 + 双侧 4 模块静区（实测最大）
    var modMm = qrMm / modules
    var hintMm = t.slots.hint.size * Mmm
    var ssidMm = t.slots.ssid.size * Mmm
    var shopMm = t.slots.shop.size * Mmm

    qrMin = Math.min(qrMin, qrMm)
    modMin = Math.min(modMin, modMm)
    textMin = Math.min(textMin, hintMm)

    rows.push({
      id: t.id,
      print: p.short,
      mm: pw + '×' + ph,
      qr: qrMm.toFixed(1),
      mod: modMm.toFixed(2),
      shop: shopMm.toFixed(1),
      ssid: ssidMm.toFixed(1),
      hint: hintMm.toFixed(1)
    })
  })
})

console.log('  模板        规格   成品mm        码边长  单模块  店名   SSID  提示')
rows.forEach(function (r) {
  console.log('  ' + r.id.padEnd(12) + r.print.padEnd(5) + r.mm.padEnd(13) +
    r.qr.padEnd(8) + r.mod.padEnd(8) + r.shop.padEnd(6) + r.ssid.padEnd(6) + r.hint)
})

ok('二维码最短边 ≥ 18mm', qrMin >= 18, '最小 ' + qrMin.toFixed(1) + 'mm')
ok('单模块 ≥ 0.4mm（等价 4 模块静区下的常见扫码下限）', modMin >= 0.4, '最小 ' + modMin.toFixed(2) + 'mm')
ok('最小提示文字 ≥ 2.0mm', textMin >= 2.0, '最小 ' + textMin.toFixed(2) + 'mm')

/* ── [3] 筛选语义 ─────────────────────────────────────── */

console.log('\n[3] 筛选语义')

var F0 = filterLib.clone(filterLib.DEFAULT_FILTERS)
ok('默认显示全部', filterLib.apply(T, F0).length === 10)

var shapeFiltered = filterLib.apply(T, { scene: 'all', shapes: ['1:1'], prints: [], moods: [], regions: [] })
ok('形状=过滤：只剩 1:1', shapeFiltered.length === 3 && shapeFiltered.every(function (t) { return t.shape === '1:1' }),
  '剩 ' + shapeFiltered.length + ' 个')

var printFiltered = filterLib.apply(T, { scene: 'all', shapes: [], prints: ['a4'], moods: [], regions: [] })
ok('打印=过滤：只剩支持 A4 的', printFiltered.length === 2 &&
  printFiltered.every(function (t) { return t.prints.indexOf('a4') !== -1 }),
  '剩 ' + printFiltered.length + ' 个')

var moodSorted = filterLib.apply(T, { scene: 'all', shapes: [], prints: [], moods: ['自然'], regions: [] })
ok('氛围=偏好：不隐藏（仍 10 个）', moodSorted.length === 10, '剩 ' + moodSorted.length + ' 个')
ok('氛围=偏好：命中的排最前', moodSorted[0].mood.indexOf('自然') !== -1 &&
  moodSorted.slice(0, 4).every(function (t) { return t.mood.indexOf('自然') !== -1 }))

var regionSorted = filterLib.apply(T, { scene: 'all', shapes: [], prints: [], moods: [], regions: ['日式'] })
ok('地区=偏好：不隐藏（仍 10 个）', regionSorted.length === 10)
ok('地区=偏好：日式排第一', regionSorted[0].region === '日式', regionSorted[0].name)
ok('地区权重高于氛围', filterLib.score({ mood: [], region: '日式' }, { moods: [], regions: ['日式'] }) >
  filterLib.score({ mood: ['自然'], region: '欧式' }, { moods: ['自然'], regions: ['日式'] }))

var sceneOnly = filterLib.apply(T, { scene: 'cafe', shapes: [], prints: [], moods: [], regions: [] })
ok('场景为单选硬过滤', sceneOnly.length === 1 && sceneOnly[0].scene === 'cafe', sceneOnly[0].name)

ok('过滤后为空时 hasHardFilter 为真', filterLib.hasHardFilter({ shapes: ['2:1'], prints: ['mini'], moods: [], regions: [] }))
ok('角标只数生效维度', filterLib.activeCount({ shapes: ['1:1'], prints: ['a4'], moods: ['自然'], regions: [] }) === 3)

/* ── [4] 渲染回读 ─────────────────────────────────────── */

console.log('\n[4] 渲染回读（真实绘制 → 解码）')

var SAMPLE_SSID = '拾光网络'
var SAMPLE_PWD = 'coffee2024'

function bundle () {
  var mods = ['templates/index.js', 'utils/wifi.js', 'utils/qrcode.js', 'utils/qr-canvas.js', 'utils/render.js']
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

function buildHTML () {
  var items = []
  T.forEach(function (t) {
    t.prints.forEach(function (key) {
      var p = lib.getPrint(key)
      var portrait = key === 'card' && t.cardPortrait
      var pw = portrait ? p.h : p.w
      var ph = portrait ? p.w : p.h
      var scale = 760 / Math.max(pw, ph)
      items.push({
        id: t.id + '@' + key,
        tplId: t.id,
        print: key,
        w: Math.round(pw * scale),
        h: Math.round(ph * scale)
      })
    })
  })

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>' +
    '<div id="stage"></div><pre id="out"></pre>' +
    '<script>' + LOADER + '</script>' + bundle() + '<script>' +
    'var T=__req("main.js")("templates/index.js");' +
    'var R=__req("main.js")("utils/render.js");' +
    'var W=__req("main.js")("utils/wifi.js");' +
    'var ITEMS=' + JSON.stringify(items) + ';' +
    'var PAYLOAD=W.buildWifiString({ssid:' + JSON.stringify(SAMPLE_SSID) + ',password:' + JSON.stringify(SAMPLE_PWD) + ',type:"WPA"}).value;' +
    'var res=[];' +
    'ITEMS.forEach(function(it){' +
    '  var tpl=T.getTemplate(it.tplId);' +
    '  var c=document.createElement("canvas");' +
    '  c.width=it.w;c.height=it.h;' +
    '  var ctx=c.getContext("2d");' +
    '  var meta=R.renderSign(ctx,tpl,{shopName:"拾光咖啡",ssid:' + JSON.stringify(SAMPLE_SSID) + ',payload:PAYLOAD},it.w,it.h);' +
    '  var d=ctx.getImageData(0,0,it.w,it.h).data;' +
    // 静区取样：沿二维码外框向外 2px 的一圈（白托底范围内）
    '  var px=function(x,y){var i=(y*it.w+x)*4;return (d[i]+d[i+1]+d[i+2])/3};' +
    '  var q=meta.qr, minL=255, samples=0;' +
    '  for(var t2=1;t2<=3;t2++){' +
    '    for(var x=Math.round(q.x)+2;x<q.x+q.size-2;x+=3){' +
    '      var yTop=Math.round(q.y)-t2, yBot=Math.round(q.y+q.size)+t2;' +
    '      if(yTop>=0){minL=Math.min(minL,px(x,yTop));samples++}' +
    '      if(yBot<it.h){minL=Math.min(minL,px(x,yBot));samples++}' +
    '    }' +
    '    for(var y=Math.round(q.y)+2;y<q.y+q.size-2;y+=3){' +
    '      var xL=Math.round(q.x)-t2, xR=Math.round(q.x+q.size)+t2;' +
    '      if(xL>=0){minL=Math.min(minL,px(xL,y));samples++}' +
    '      if(xR<it.w){minL=Math.min(minL,px(xR,y));samples++}' +
    '    }' +
    '  }' +
    '  res.push({id:it.id,tplId:it.tplId,print:it.print,w:it.w,h:it.h,' +
    '    qr:{x:Math.round(q.x),y:Math.round(q.y),size:Math.round(q.size),modules:q.moduleCount},' +
    '    quietMin:minL,quietSamples:samples,' +
    '    ssid:meta.ssid?{size:+meta.ssid.size.toFixed(2),width:+meta.ssid.width.toFixed(1),shrunk:meta.ssid.shrunk,truncated:meta.ssid.truncated}:null,' +
    '    shop:meta.shop?{size:+meta.shop.size.toFixed(2),width:+meta.shop.width.toFixed(1),shrunk:meta.shop.shrunk,truncated:meta.shop.truncated}:null,' +
    '    url:c.toDataURL("image/png")});' +
    '});' +
    'document.getElementById("out").textContent=JSON.stringify(res);' +
    '</script></body></html>'
}

fs.mkdirSync(path.join(OUT, 'print'), { recursive: true })
var htmlFile = path.join(OUT, 'render-check.html')
fs.writeFileSync(htmlFile, buildHTML())

var dom = execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=/tmp/cr-vt-' + Math.random().toString(36).slice(2, 8),
  '--window-size=900,900', '--virtual-time-budget=8000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m) {
  console.log('  ✗ 渲染输出缺失')
  process.exit(1)
}

var rendered = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
ok('渲染条目数与模板×规格数一致',
  rendered.length === T.reduce(function (n, t) { return n + t.prints.length }, 0),
  rendered.length + ' 条')

var expectPayload = wifi.buildWifiString({ ssid: SAMPLE_SSID, password: SAMPLE_PWD, type: 'WPA' }).value

rendered.forEach(function (r) {
  var file = path.join(OUT, 'print', r.id.replace(/[@:]/g, '-') + '.png')
  fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'))

  var decoded = ''
  try {
    var out = execFileSync('swift', [path.join(__dirname, 'decode.swift'), file], { encoding: 'utf8' })
    var line = out.split('\n').filter(function (l) { return l.indexOf('载荷') === 0 })[0] || ''
    decoded = line.replace('载荷: ', '').trim()
  } catch (e) {
    decoded = '(解码失败)'
  }

  var match = decoded === expectPayload
  ok(r.id + ' 解码一致', match, match ? '' : '得到 ' + JSON.stringify(decoded))
  ok(r.id + ' 静区纯白', r.quietMin >= 250, 'min=' + r.quietMin + ' / ' + r.quietSamples + ' 点')
  if (r.ssid) {
    ok(r.id + ' SSID 不溢出', !r.ssid.truncated, 'w=' + r.ssid.width)
  }
})

/* ── 汇总 ─────────────────────────────────────────────── */

console.log('\n结果: ' + pass + ' 项通过，' + fail + ' 项失败')
if (fail) {
  console.log('失败项: ' + fails.join(' | '))
  process.exit(1)
}
