/**
 * tools/compare-art.js —— 视觉方向对比图（不接入模板，只出图给人看）
 *
 * 左：现在仓库里的 6 张装饰图（tools/make-art.js 程序生成）
 * 右：Downloads 里那套公有领域书籍花饰（assets/ornaments，未接入）
 *
 * 左右都走同一个 utils/paper-render.renderPaper，同样的标题 / 二维码 /
 * 信息行，唯一差别就是「装饰层」这一张图。所以两张图可以直接对着看
 * 装饰风格带来的差别，而不是被排版差异干扰。
 *
 * 右侧的 safe 区是手填的（0.10 / 0.28 / 0.80 / 0.60），因为花饰是按页
 * 排版的，没有「整层图 + 自动量避让区」的结构。这正是它不好接的原因之一，
 * 输出图上也标了这一点。
 *
 * 产物：docs/screens/phase1/art-compare.png（对比）
 *       tools/out/art-compare/ornament.png（单张，方便放大看细节）
 *
 * 运行：node tools/compare-art.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(__dirname, 'out', 'art-compare')
var DOCS = path.join(ROOT, 'docs', 'screens', 'phase1')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
var ORNAMENT_DIR = '/Users/ttyy/Downloads/wifi-table-card-main/assets/ornaments'

var catalog = require(path.join(ROOT, 'templates/catalog.js'))
var bounds = require(path.join(ROOT, 'packageTpl/art/bounds'))

function dataUrl (file, mime) {
  return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64')
}

var tpl = catalog.getTemplate('paper-milktea')

var ASSETS = {
  art: dataUrl(path.join(ROOT, 'packageTpl/art', tpl.art + '.webp'), 'image/webp'),
  fleuron: dataUrl(path.join(ORNAMENT_DIR, 'a-voz-do-sino-vicente-de-carvalho-1916-fleuron-in-cover.png'), 'image/png'),
  rose: dataUrl(path.join(ORNAMENT_DIR, 'broken-rose-tailpiece-1909.png'), 'image/png'),
  grotesque: dataUrl(path.join(ORNAMENT_DIR, 'grotesque-tailpiece-1580.png'), 'image/png'),
  chappell: dataUrl(path.join(ORNAMENT_DIR, 'chappell-co-fleuron.png'), 'image/png')
}

var MODS = [
  'templates/index.js', 'templates/paper.js', 'templates/catalog.js',
  'utils/wifi.js', 'utils/qrcode.js', 'utils/qr-canvas.js',
  'utils/render.js', 'utils/paper-render.js'
]

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

var CARD_W = 740
var CARD_H = 1050
var GAP = 56
var LABEL_H = 156
var PAD = 40

var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0a0b0d}</style></head>' +
  '<body><pre id="out">pending</pre><script>' + LOADER + '</script>' + bundle(MODS) + '<script>' +
  'window.onerror=function(m,s,l,c,e){document.getElementById("out").textContent="ERR "+m+" @"+l+":"+c};' +
  'var PR=__req("main.js")("utils/paper-render.js");' +
  'var C=__req("main.js")("templates/catalog.js");' +
  'var W=__req("main.js")("utils/wifi.js");' +
  'var CARD_W=' + CARD_W + ',CARD_H=' + CARD_H + ',GAP=' + GAP + ',LABEL_H=' + LABEL_H + ',PAD=' + PAD + ';' +
  'var ASSETS=' + JSON.stringify(ASSETS) + ';' +
  'var BOUNDS=' + JSON.stringify(bounds) + ';' +
  'var TPL=C.getTemplate("paper-milktea");' +
  'var DATA={shopName:"拾光咖啡",ssid:"Shiguang-Cafe",password:"coffee2024",type:"WPA",' +
  '  showPassword:true,payload:W.buildWifiString({ssid:"Shiguang-Cafe",password:"coffee2024",type:"WPA"}).value};' +
  'var MM={w:148,h:210};' +
  'var ORN_BOUNDS={safe:{x:0.10,y:0.28,w:0.80,h:0.60},avoid:[],icon:null};' +
  'function load(src){return new Promise(function(ok){var i=new Image();i.onload=function(){ok(i)};i.onerror=function(){ok(null)};i.src=src})}' +
  '/* 花饰是黑色剪影，按模板墨色染色：先画到临时画布，再用 source-in 填色 */' +
  'function tint(img,w,h,color){' +
  '  var c=document.createElement("canvas");c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));' +
  '  var x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);' +
  '  x.globalCompositeOperation="source-in";x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return c}' +
  'function ornamentLayer(imgs){' +
  '  var c=document.createElement("canvas");c.width=CARD_W;c.height=CARD_H;' +
  '  var x=c.getContext("2d");' +
  '  x.fillStyle="#FFFFFF";x.fillRect(0,0,c.width,c.height);' +
  '  var ink="#5b3a22";' +
  '  var top=tint(imgs.fleuron,CARD_W*0.52,CARD_W*0.52/1.673,ink);' +
  '  x.drawImage(top,(CARD_W-top.width)/2,CARD_H*0.035);' +
  '  var bottom=tint(imgs.rose,CARD_W*0.60,CARD_W*0.60/2.286,ink);' +
  '  x.drawImage(bottom,(CARD_W-bottom.width)/2,CARD_H-bottom.height-CARD_H*0.02);' +
  '  var g1=tint(imgs.grotesque,CARD_W*0.20,CARD_W*0.20/0.934,ink);' +
  '  x.drawImage(g1,CARD_W*0.02,CARD_H*0.68);' +
  '  var g2=tint(imgs.chappell,CARD_W*0.22,CARD_W*0.22/1.766,ink);' +
  '  x.drawImage(g2,CARD_W-g2.width-CARD_W*0.02,CARD_H*0.60);' +
  '  return c' +
  '}' +
  'Promise.all([load(ASSETS.art),load(ASSETS.fleuron),load(ASSETS.rose),' +
  '  load(ASSETS.grotesque),load(ASSETS.chappell)]).then(function(a){' +
  '  var left=document.createElement("canvas");left.width=CARD_W;left.height=CARD_H;' +
  '  PR.renderPaper(left.getContext("2d"),TPL,DATA,CARD_W,CARD_H,{art:a[0],bounds:BOUNDS[TPL.art],' +
  '    vertical:true,mm:MM});' +
  '  var orn=ornamentLayer({fleuron:a[1],rose:a[2],grotesque:a[3],chappell:a[4]});' +
  '  var right=document.createElement("canvas");right.width=CARD_W;right.height=CARD_H;' +
  '  PR.renderPaper(right.getContext("2d"),TPL,DATA,CARD_W,CARD_H,{art:orn,bounds:ORN_BOUNDS,' +
  '    vertical:true,mm:MM});' +
  '  var out=document.createElement("canvas");' +
  '  out.width=PAD*2+CARD_W*2+GAP;out.height=PAD*2+CARD_H+LABEL_H;' +
  '  var o=out.getContext("2d");' +
  '  o.fillStyle="#0a0b0d";o.fillRect(0,0,out.width,out.height);' +
  '  o.drawImage(left,PAD,PAD);o.drawImage(right,PAD+CARD_W+GAP,PAD);' +
  '  o.fillStyle="#f2ede3";o.textBaseline="top";' +
  '  o.font="600 30px PingFang SC, Hiragino Sans GB, sans-serif";' +
  '  o.fillText("现在：程序生成的主题装饰层",PAD,PAD+CARD_H+22);' +
  '  o.fillText("原素材：公有领域书籍花饰（未接入）",PAD+CARD_W+GAP,PAD+CARD_H+22);' +
  '  o.fillStyle="#9a938a";o.font="400 22px PingFang SC, Hiragino Sans GB, sans-serif";' +
  '  o.fillText("1200×1680 · 白底整层 · 自动量避让区 · 6 套各带主题徽章",PAD,PAD+CARD_H+68);' +
  '  o.fillText("最长边 256px · 透明剪影 · 每套要手排 · 与场景无关",PAD+CARD_W+GAP,PAD+CARD_H+68);' +
  '  o.fillText("两张图走同一个 renderPaper，只有装饰层不同",PAD,PAD+CARD_H+104);' +
  '  o.fillStyle="#c8a05a";' +
  '  o.fillText("注：右侧底部花饰已压到店名 —— 这类素材换个尺寸就得重排",PAD+CARD_W+GAP,PAD+CARD_H+104);' +
  '  document.getElementById("out").textContent=JSON.stringify({' +
  '    compare:out.toDataURL("image/png"),' +
  '    ornament:right.toDataURL("image/png"),' +
  '    current:left.toDataURL("image/png")});' +
  '}).catch(function(e){document.getElementById("out").textContent="ERR "+e.message});' +
  '</script></body></html>'

fs.mkdirSync(OUT, { recursive: true })
var htmlFile = path.join(OUT, 'compare.html')
fs.writeFileSync(htmlFile, html)

var dom = execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--user-data-dir=/tmp/cr-cmp-' + Math.random().toString(36).slice(2, 8),
  '--window-size=1800,1400', '--virtual-time-budget=20000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m) {
  console.log('没有输出')
  process.exit(1)
}
if (/^ERR/.test(m[1])) {
  console.log('渲染失败：' + m[1].slice(0, 400))
  process.exit(1)
}
var data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

function write (file, url) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
  console.log('写入 ' + path.relative(ROOT, file))
}

write(path.join(DOCS, 'art-compare.png'), data.compare)
write(path.join(OUT, 'ornament.png'), data.ornament)
write(path.join(OUT, 'current.png'), data.current)
