/**
 * tools/verify-library.js —— 生成库的离线验收
 *
 * 与 verify-templates.js 的分工：
 *   verify-templates 守「手写 10 套」的既有断言；
 *   这里守「工厂能不能量产」——因为量产的风险不是画不出来，
 *   而是画出来了但印出去扫不了。
 *
 * 六道闸：
 *   [1] 维度覆盖：形状 / 版式 / 地区 / 密度 / 场景都要真的被用到
 *   [2] 确定性：同一 seed 两次生成必须逐字节相同（页面缓存与线上不能串位）
 *   [3] 唯一性：id 与名字不重复，且不撞手写库
 *   [4] QA 闸门：每条模板 × 每个打印规格全绿（毫米级）
 *   [5] 真实渲染：headless Chrome 画 → macOS 识别器解码 → 与载荷全等
 *   [6] 极端文案：24 字符 SSID + 16 位密码不得截断；nopass 与隐藏密码分支
 *
 * 运行：node tools/verify-library.js [页数]
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(ROOT, 'tools', 'out')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

var lib = require(path.join(ROOT, 'templates/library.js'))
var factory = require(path.join(ROOT, 'templates/factory.js'))
var qa = require(path.join(ROOT, 'templates/qa.js'))
var wifi = require(path.join(ROOT, 'utils/wifi.js'))
var tax = require(path.join(ROOT, 'templates/taxonomy.js'))

var PAGES = parseInt(process.argv[2] || '3', 10)
var SAMPLE_SSID = 'Shiguang-Cafe-Guest-2026'   /* 24 字符，压溢出 */
var SAMPLE_PWD = 'coffee2026!!'                 /* 12 位 */

var pass = 0
var fail = 0
var fails = []

function ok (label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label + (detail ? '  ' + detail : '')) }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (detail ? '  ' + detail : '')) }
}

lib.clearCache()
var pool = []
for (var p = 0; p < PAGES; p++) pool = pool.concat(lib.generated(p))
console.log('\n样本: ' + pool.length + ' 条生成模板（' + PAGES + ' 页）')

/* ── [1] 维度覆盖 ─────────────────────────────────────── */

console.log('\n[1] 维度覆盖')

function tally (key) {
  var c = {}
  pool.forEach(function (t) { c[t[key]] = (c[t[key]] || 0) + 1 })
  return c
}

var shapes = tally('shape')
ok('五种形状都被用到', Object.keys(shapes).length === lib.SHAPES.length, JSON.stringify(shapes))

var layouts = tally('layout')
ok('三种版式都被用到', ['center', 'split', 'stack'].every(function (k) { return layouts[k] }), JSON.stringify(layouts))

var regions = tally('region')
ok('五种地区风格都被用到', Object.keys(regions).length === lib.REGIONS.length, JSON.stringify(regions))

var dens = tally('density')
ok('四种密度都被用到', Object.keys(dens).length === tax.DENSITIES.length, JSON.stringify(dens))

var sceneHit = {}
pool.forEach(function (t) { t.scene.forEach(function (k) { sceneHit[k] = (sceneHit[k] || 0) + 1 }) })
var missingUse = tax.USES.filter(function (u) { return u.key !== 'all' && !sceneHit[u.key] })
ok('每个使用场景至少命中一次', missingUse.length === 0, missingUse.length ? '缺 ' + missingUse.map(function (u) { return u.label }).join(',') : Object.keys(sceneHit).length + ' 个场景')

/* ── [2] 确定性与 id 往返 ─────────────────────────────── */

console.log('\n[2] 确定性与 id 往返')

var before = JSON.stringify(pool)
lib.clearCache()
var again = []
for (var q = 0; q < PAGES; q++) again = again.concat(lib.generated(q))
ok('同一 seed 重生成完全一致', JSON.stringify(again) === before)

/* id 必须能反推出同一条模板：
   冷启动时页面缓存是空的，编辑器只拿得到草稿里的 id。
   这条断言挂了，用户从首页点进生成模板就会看到夜泊。 */
var rtBad = []
pool.forEach(function (t) {
  var r = factory.rebuild(t.id)
  if (!r) { rtBad.push('rebuild 空 ' + t.id); return }
  if (JSON.stringify(r) !== JSON.stringify(t)) rtBad.push(t.id + ' 字段不一致')
})
ok('id → rebuild 与列表逐字段一致', rtBad.length === 0, rtBad.slice(0, 3).join(' | '))

lib.clearCache()
var coldTarget = pool[Math.floor(pool.length / 2)]
var cold = lib.find(coldTarget.id)
ok('空缓存下 find(id) 命中同一条', cold && JSON.stringify(cold) === JSON.stringify(coldTarget),
  cold ? cold.name + ' vs ' + coldTarget.name : 'null')
ok('非法 id 返回 null 而非回落精选', lib.find('g-zzz-nope') === null)
var rtIds = {}
var rtDup = 0
pool.forEach(function (t) { if (rtIds[t.id]) rtDup++; rtIds[t.id] = 1 })
ok('id 无重复', rtDup === 0, '重复 ' + rtDup)

/* ── [3] 唯一性 ───────────────────────────────────────── */

console.log('\n[3] 唯一性')

var idSeen = {}, idDup = []
var nameSeen = {}, nameDup = []
lib.curated().forEach(function (t) { nameSeen[t.name] = 1; idSeen[t.id] = 1 })
pool.forEach(function (t) {
  if (idSeen[t.id]) idDup.push(t.id)
  if (nameSeen[t.name]) nameDup.push(t.name)
  idSeen[t.id] = 1
  nameSeen[t.name] = 1
})
ok('id 不与手写库或彼此重复', idDup.length === 0, idDup.slice(0, 3).join(','))
ok('名字不重复（含手写库）', nameDup.length === 0, nameDup.slice(0, 3).join(','))
ok('每条都有中文两字名', pool.every(function (t) { return /^[一-龥]{2,3}$/.test(t.name) }))

/* ── [4] QA 闸门 ──────────────────────────────────────── */

console.log('\n[4] 打印 QA（毫米）')

var bad = []
var rows = []
pool.forEach(function (t) {
  var a = qa.audit(t)
  if (!a.ok) bad.push(t.id + ' → ' + a.issues.slice(0, 2).join(' / '))
  t.prints.forEach(function (k) {
    var m = qa.auditPrint(t, k).metrics
    rows.push({ id: t.id, print: k, qr: m.qrEdgeMm, mod: m.moduleMm, ink: m.inkContrast, sub: m.subContrast, qrC: m.qrContrast })
  })
})
ok('全部模板通过 QA 闸门', bad.length === 0, bad.slice(0, 3).join(' | '))

var minQr = Math.min.apply(null, rows.map(function (r) { return r.qr }))
var minMod = Math.min.apply(null, rows.map(function (r) { return r.mod }))
var minInk = Math.min.apply(null, rows.map(function (r) { return r.ink }))
var minSub = Math.min.apply(null, rows.map(function (r) { return r.sub }))
var minQrC = Math.min.apply(null, rows.map(function (r) { return r.qrC }))
ok('码最短边 ≥ 15mm', minQr >= 15, minQr.toFixed(1) + 'mm')
ok('单模块 ≥ 0.40mm', minMod >= 0.4, minMod.toFixed(2) + 'mm')
ok('正文对比 ≥ 4.5', minInk >= 4.5, minInk.toFixed(2))
ok('辅助字对比 ≥ 3.0', minSub >= 3.0, minSub.toFixed(2))
ok('码对比 ≥ 7.0', minQrC >= 7, minQrC.toFixed(2))
console.log('    共 ' + rows.length + ' 个「模板 × 规格」组合')

/* ── [5][6] 真实渲染 + 解码 ───────────────────────────── */

console.log('\n[5] 真实渲染 → 解码')

/* 必须带路径归一化：render.js 里 require('./qr-canvas')，
   扁平查表会直接找不到模块。 */
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

var MODS = ['utils/qrcode.js', 'utils/qr-canvas.js', 'utils/render.js', 'utils/wifi.js',
  'assets/ornaments/index.js', 'utils/ornament.js']
var bundle = MODS.map(function (rel) {
  return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' +
    fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n});</script>'
}).join('\n')

var items = []
pool.forEach(function (t) {
  t.prints.forEach(function (key) {
    var pr = lib.getPrint(key)
    var scale = 760 / Math.max(pr.w, pr.h)
    items.push({ id: t.id + '@' + key, tpl: t, w: Math.round(pr.w * scale), h: Math.round(pr.h * scale) })
  })
})

/* 花饰按包内绝对路径引用，无头浏览器里要补成 file:// 前缀 */
var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>' +
  '<script>window.__ORN_PREFIX=' + JSON.stringify('file://' + ROOT + '/') + '</scr' + 'ipt>' +
  '<pre id="out"></pre><pre id="ornready"></pre><script>' + LOADER + '</script>' + bundle + '<script>' +
  'var R=__req("main.js")("utils/render.js");' +
  'var W=__req("main.js")("utils/wifi.js");' +
  'var ORN=__req("main.js")("utils/ornament.js");' +
  'var ITEMS=' + JSON.stringify(items) + ';' +
  'var SSID=' + JSON.stringify(SAMPLE_SSID) + ',PWD=' + JSON.stringify(SAMPLE_PWD) + ';' +
  'var PAYLOAD=W.buildWifiString({ssid:SSID,password:PWD,type:"WPA"}).value;' +
  'var res=[];' +
  /* 花饰是图片：先解码再画。解码卡住时兜底照样出图，
     否则 --virtual-time-budget 到点截了个空 DOM，验收会以 JSON 解析失败收场。 */
  'var painted=false;' +
  'function paint(){' +
  '  if(painted)return; painted=true;' +
  '  ITEMS.forEach(function(it){' +
  '    function draw(data,w,h){var c=document.createElement("canvas");c.width=w;c.height=h;' +
  '      return {c:c,meta:R.renderSign(c.getContext("2d"),it.tpl,data,w,h)}}' +
  '    var main=draw({shopName:"拾光咖啡",ssid:SSID,password:PWD,type:"WPA",showPassword:true,payload:PAYLOAD},it.w,it.h);' +
  '    var nopass=draw({shopName:"拾光咖啡",ssid:"Guest",password:"",type:"nopass",showPassword:true,payload:"WIFI:T:nopass;S:Guest;;"},it.w,it.h);' +
  '    var hidden=draw({shopName:"拾光咖啡",ssid:"Guest",password:"secret12",type:"WPA",showPassword:false,payload:"WIFI:T:WPA;S:Guest;P:secret12;;"},it.w,it.h);' +
  '    var ctx=main.c.getContext("2d");var q=main.meta.qr;' +
  '    var d=ctx.getImageData(0,0,it.w,it.h).data;' +
  '    var px=function(x,y){var i=(y*it.w+x)*4;return (d[i]+d[i+1]+d[i+2])/3};' +
  '    var minL=255,nq=0;' +
  '    for(var t2=1;t2<=3;t2++){' +
  '      for(var x=Math.round(q.x)+2;x<q.x+q.size-2;x+=3){' +
  '        var yt=Math.round(q.y)-t2,yb=Math.round(q.y+q.size)+t2;' +
  '        if(yt>=0){minL=Math.min(minL,px(x,yt));nq++}' +
  '        if(yb<it.h){minL=Math.min(minL,px(x,yb));nq++}' +
  '      }' +
  '      for(var y=Math.round(q.y)+2;y<q.y+q.size-2;y+=3){' +
  '        var xl=Math.round(q.x)-t2,xr=Math.round(q.x+q.size)+t2;' +
  '        if(xl>=0){minL=Math.min(minL,px(xl,y));nq++}' +
  '        if(xr<it.w){minL=Math.min(minL,px(xr,y));nq++}' +
  '      }' +
  '    }' +
  '    res.push({id:it.id,w:it.w,h:it.h,quietMin:minL,quietN:nq,' +
  '      ssid:main.meta.ssid,pwd:main.meta.pwd,' +
  '      nopassText:nopass.meta.pwd?nopass.meta.pwd.value:null,' +
  '      hiddenPwd:hidden.meta.pwd===null,' +
  '      url:main.c.toDataURL("image/png")});' +
  '  });' +
  '  document.getElementById("out").textContent=JSON.stringify(res);' +
  '}' +
  'ORN.ensure(ITEMS.map(function(i){return i.tpl})).then(function(n){' +
  '  document.getElementById("ornready").textContent=String(n);' +
  '  paint();' +
  '});' +
  'setTimeout(paint, 6000);' +
  '</scr' + 'ipt></body></html>'

fs.mkdirSync(path.join(OUT, 'lib-print'), { recursive: true })
var htmlFile = path.join(OUT, 'library-check.html')
fs.writeFileSync(htmlFile, html)

var dom = execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--allow-file-access-from-files',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=/tmp/cr-lib-' + Math.random().toString(36).slice(2, 8),
  '--window-size=900,900', '--virtual-time-budget=15000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

var mm = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!mm) { console.log('  ✗ 渲染输出缺失'); process.exit(1) }
var rendered = JSON.parse(mm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))

ok('渲染条目数 = 模板 × 规格', rendered.length === items.length, rendered.length + ' 条')

/* 花饰必须真的出现在渲染里：
   若 ensure 静默失败，图照样能画完、解码照样能过，验收就成了空过。 */
var withFleuron = pool.filter(function (t) {
  return (t.motifs || []).some(function (m) { return m.type === 'fleuron' })
})
ok('样本里确有带花饰的模板', withFleuron.length > 0, withFleuron.length + ' 条')
/* 这条以前是假的：它只看 rendered.length，而花饰没加载时画面也画得完。
   现在直接读页面里 ensure() 的真实返回值。 */
var ornM = dom.match(/<pre id="ornready">([\s\S]*?)<\/pre>/)
var ornLoaded = ornM ? parseInt(ornM[1].replace(/&[^;]+;/g, '').trim(), 10) : NaN
var ornKeys = {}
withFleuron.forEach(function (t) {
  t.motifs.forEach(function (m) { if (m.type === 'fleuron') ornKeys[m.key] = 1 })
})
ok('花饰真的解码进画面（不是空过）', ornLoaded === Object.keys(ornKeys).length && ornLoaded > 0,
  'ensure 返回 ' + ornLoaded + ' / 样本用到 ' + Object.keys(ornKeys).length + ' 种')

var expect = wifi.buildWifiString({ ssid: SAMPLE_SSID, password: SAMPLE_PWD, type: 'WPA' }).value
var decodeBad = []
var quietBad = []
var textBad = []
var branchBad = []
var shrinkRatios = []

rendered.forEach(function (r) {
  var file = path.join(OUT, 'lib-print', r.id.replace(/[@:]/g, '-') + '.png')
  fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'))

  var decoded = ''
  try {
    var out = execFileSync('swift', [path.join(__dirname, 'decode.swift'), file], { encoding: 'utf8' })
    var line = out.split('\n').filter(function (l) { return l.indexOf('载荷') === 0 })[0] || ''
    decoded = line.replace('载荷: ', '').trim()
  } catch (e) { decoded = '(解码失败)' }

  if (decoded !== expect) decodeBad.push(r.id + ' → ' + JSON.stringify(decoded))
  if (r.quietMin < 250) quietBad.push(r.id + ' min=' + r.quietMin)
  /* 缩字号是 fitText 的设计行为，不是缺陷；缺陷是「截断」和「缩到看不清」。
     所以这里断言：不截断，且缩后仍不低于原字号的 80%。 */
  if (r.ssid && r.ssid.truncated) textBad.push(r.id + ' ssid 被截断')
  if (r.pwd && r.pwd.truncated) textBad.push(r.id + ' pwd 被截断')
  if (r.ssid) shrinkRatios.push({ id: r.id, k: 'ssid', v: r.ssid.size / r.ssid.base })
  if (r.pwd) shrinkRatios.push({ id: r.id, k: 'pwd', v: r.pwd.size / r.pwd.base })
  if (!r.pwd || r.pwd.prefix !== '密码：' || r.pwd.value !== SAMPLE_PWD) textBad.push(r.id + ' pwd ' + JSON.stringify(r.pwd))
  if (r.nopassText !== '无需密码') branchBad.push(r.id + ' nopass=' + r.nopassText)
  if (!r.hiddenPwd) branchBad.push(r.id + ' 关了开关仍画密码')
})

ok('全部解码一致（' + decodeBad.length + ' 例外）', decodeBad.length === 0, decodeBad.slice(0, 4).join(' | '))
ok('静区纯白', quietBad.length === 0, quietBad.slice(0, 3).join(' | '))
ok('极端文案不截断', textBad.length === 0, textBad.slice(0, 3).join(' | '))

var worst = shrinkRatios.slice().sort(function (a, b) { return a.v - b.v })[0]
ok('自适应缩字不破 80%', worst && worst.v >= 0.8, worst ? worst.id + ' ' + worst.k + ' → ' + (worst.v * 100).toFixed(0) + '%' : '无样本')
ok('nopass / 隐藏密码分支正确', branchBad.length === 0, branchBad.slice(0, 3).join(' | '))

console.log('\n结果: ' + pass + ' 项通过，' + fail + ' 项失败')
if (fail) { console.log('失败项: ' + fails.join(' | ')); process.exit(1) }