/**
 * tools/preview-paper.js —— 白纸系列离线预览
 *
 * 用 headless Chrome 真实绘制 6 套模板（A6 / A5 / A4），输出到 tools/out/paper/。
 * 和 verify-templates 的区别：那个是断言，这个是看图用的。
 *
 * 运行：node tools/preview-paper.js
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

var SAMPLE = {
  shopName: '拾光咖啡',
  ssid: 'Shiguang-Cafe',
  password: 'coffee2024',
  type: 'WPA'
}
var PAYLOAD = wifi.buildWifiString(SAMPLE).value

var PX_PER_MM = 4

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

/** webp → base64 data URL，避免 Chrome 在 file:// 下跨目录取图 */
function artData () {
  var dir = path.join(ROOT, 'packageTpl', 'art')
  var out = {}
  fs.readdirSync(dir).filter(function (f) { return /\.webp$/.test(f) }).forEach(function (f) {
    out[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64')
  })
  return out
}

var jobs = []
catalog.bySeries('paper').forEach(function (t) {
  t.prints.forEach(function (key) {
    var p = catalog.getPrint(key)
    jobs.push({
      id: t.id,
      print: key,
      w: Math.round(p.w * PX_PER_MM),
      h: Math.round(p.h * PX_PER_MM),
      mmW: p.w,
      mmH: p.h
    })
  })
})

var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out">pending</pre><script>' +
  LOADER + '</script>' + bundle(MODS) + '<script>' +
  'var C=__req("main.js")("templates/catalog.js");' +
  'var PR=__req("main.js")("utils/paper-render.js");' +
  'var BOUNDS=' + JSON.stringify(bounds) + ';' +
  'var ART=' + JSON.stringify(artData()) + ';' +
  'var JOBS=' + JSON.stringify(jobs) + ';' +
  'var PAYLOAD=' + JSON.stringify(PAYLOAD) + ';' +
  'var res=[],i=0;' +
  'function step(){' +
  '  if(i>=JOBS.length){document.getElementById("out").textContent=JSON.stringify(res);return}' +
  '  var job=JOBS[i++];' +
  '  var tpl=C.getTemplate(job.id);' +
  '  var b=BOUNDS[tpl.art];' +
  '  var img=new Image();' +
  '  img.onload=function(){ draw(tpl,job,b,img) };' +
  '  img.onerror=function(){ draw(tpl,job,b,null) };' +
  '  img.src=ART[tpl.art];' +
  '}' +
  'function draw(tpl,job,b,img){' +
  '  var c=document.createElement("canvas");c.width=job.w;c.height=job.h;' +
  '  var ctx=c.getContext("2d");' +
  '  var meta=PR.renderPaper(ctx,tpl,{shopName:"拾光咖啡",ssid:"Shiguang-Cafe",' +
  '    password:"coffee2024",type:"WPA",showPassword:true,payload:PAYLOAD,' +
  '    mm:{w:job.mmW,h:job.mmH}},job.w,job.h,{art:img,bounds:b,mm:{w:job.mmW,h:job.mmH}});' +
  '  res.push({id:job.id,print:job.print,url:c.toDataURL("image/png"),' +
  '    qrMm:+meta.qr.sizeMm.toFixed(2),moduleMm:+meta.qr.moduleMm.toFixed(3),' +
  '    scale:+meta.scale.toFixed(3),warnings:meta.warnings});' +
  '  step();' +
  '}' +
  'step();' +
  '</script></body></html>'

fs.mkdirSync(OUT, { recursive: true })
var htmlFile = path.join(OUT, 'preview.html')
fs.writeFileSync(htmlFile, html)

var dom = execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=/tmp/cr-pp-' + Math.random().toString(36).slice(2, 8),
  '--window-size=900,1200', '--virtual-time-budget=15000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m || m[1] === 'pending') {
  console.error('渲染失败')
  process.exit(1)
}

var parsed = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
parsed.forEach(function (r) {
  var file = path.join(OUT, r.id.replace('paper-', '') + '-' + r.print + '.png')
  fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'))
  console.log('  ' + path.basename(file).padEnd(22) +
    '码 ' + r.qrMm + 'mm  模块 ' + r.moduleMm + 'mm  缩放 ' + r.scale +
    (r.warnings.length ? '  ⚠ ' + r.warnings.join('; ') : ''))
})
console.log('\n' + parsed.length + ' 张 → ' + path.relative(ROOT, OUT))
