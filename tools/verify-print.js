/**
 * tools/verify-print.js —— 打印拼版验收
 *
 * [1] 几何：4 种版式 × 竖/横 × 边距/窄边距，比例、份数、边距、不重叠
 * [2] 像素尺寸：300dpi / 200dpi 换算
 * [3] 门槛：迷你 8 份的码与模块下限，不达标就不提供
 * [4] 渲染：真画出 A4 拼版，系统识别器数二维码个数 + 逐个比对载荷
 * [5] 裁切线：四种样式的线量与「无」的区别
 *
 * 运行：node tools/verify-print.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(__dirname, 'out', 'print')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

var printLib = require(path.join(ROOT, 'utils/print-layout.js'))
var catalog = require(path.join(ROOT, 'templates/catalog.js'))
var bounds = require(path.join(ROOT, 'packageTpl/art/bounds'))
var wifi = require(path.join(ROOT, 'utils/wifi.js'))

var pass = 0
var fail = 0
var fails = []
function ok (label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label + (detail ? '  ' + detail : '')) }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (detail ? '  ' + detail : '')) }
}

var SAMPLE = { shopName: '拾光咖啡', ssid: '拾光网络', password: 'coffee2024', type: 'WPA' }
var PAYLOAD = wifi.buildWifiString(SAMPLE).value
var MODULES = 33

/* ── [1] 几何 ───────────────────────────────────────────── */

console.log('[1] 拼版几何')

var COMBOS = []
;['portrait', 'landscape'].forEach(function (o) {
  ;[false, true].forEach(function (n) {
    printLib.LAYOUTS.forEach(function (l) {
      COMBOS.push(printLib.planSheet({
        layout: l.key, orientation: o, cut: 'corner', narrowMargin: n, moduleCount: MODULES
      }))
    })
  })
})

ok('16 种组合全部可用', COMBOS.every(function (p) { return p.usable }),
  COMBOS.filter(function (p) { return !p.usable })
    .map(function (p) { return p.layout + '/' + p.sheet.orientation + ' ' + p.warnings[0] }).join(' | ') || '16/16')

ok('份数严格等于版式声明', COMBOS.every(function (p) {
  return p.count === printLib.getLayout(p.layout).count
}), COMBOS.map(function (p) { return p.count }).join(''))

ok('每份比例都是 1:1.4（不再被边距拉变形）', COMBOS.every(function (p) {
  return p.ratioDelta < 0.001
}), '最大偏差 ' + Math.max.apply(null, COMBOS.map(function (p) { return p.ratioDelta })).toFixed(6))

var outOfSheet = []
var overlapping = []
var marginBad = []
COMBOS.forEach(function (p) {
  p.cards.forEach(function (c) {
    var tag = p.layout + '/' + p.sheet.orientation + '#' + c.index
    if (c.x < p.margin - 0.01 || c.y < p.margin - 0.01 ||
      c.x + c.w > p.sheet.w - p.margin + 0.01 || c.y + c.h > p.sheet.h - p.margin + 0.01) {
      outOfSheet.push(tag)
    }
    if (Math.abs(c.logicalW / c.logicalH - printLib.CARD_RATIO) > 0.001) marginBad.push(tag + ' 比例')
  })
  for (var i = 0; i < p.cards.length; i++) {
    for (var j = i + 1; j < p.cards.length; j++) {
      var a = p.cards[i]
      var b = p.cards[j]
      if (a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 &&
        a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01) {
        overlapping.push(p.layout + '/' + p.sheet.orientation + ' ' + i + '×' + j)
      }
    }
  }
})
ok('每份都在纸内且让出了边距', outOfSheet.length === 0, outOfSheet.slice(0, 3).join(' '))
ok('份与份之间不重叠', overlapping.length === 0, overlapping.slice(0, 3).join(' '))
ok('卡片自身比例就是 1:1.4', marginBad.length === 0, marginBad.slice(0, 3).join(' '))

var narrow = printLib.planSheet({ layout: 'card', orientation: 'portrait', narrowMargin: true, moduleCount: MODULES })
var normal = printLib.planSheet({ layout: 'card', orientation: 'portrait', narrowMargin: false, moduleCount: MODULES })
ok('窄边距让每份更大', narrow.cardW > normal.cardW + 0.5,
  normal.cardW.toFixed(1) + ' → ' + narrow.cardW.toFixed(1) + 'mm')

/* ── [2] 像素尺寸 ───────────────────────────────────────── */

console.log('\n[2] 导出像素')
var a4 = printLib.sheetOf('portrait')
var px300 = printLib.pixelSize(a4, 300)
var px200 = printLib.pixelSize(a4, 200)
ok('A4 300dpi = 2480×3508', px300.w === 2480 && px300.h === 3508, px300.w + '×' + px300.h)
ok('A4 200dpi = 1654×2339', px200.w === 1654 && px200.h === 2339, px200.w + '×' + px200.h)
ok('横版只交换纸的长短边',
  printLib.pixelSize(printLib.sheetOf('landscape'), 300).w === 3508)

/* ── [3] 门槛 ───────────────────────────────────────────── */

console.log('\n[3] 迷你版式的门槛')
var miniOk = printLib.planSheet({ layout: 'mini', orientation: 'portrait', moduleCount: MODULES })
ok('迷你 8 份：码 ≥ 15mm', miniOk.qrMm >= printLib.QR_MIN_MM, miniOk.qrMm + 'mm')
ok('迷你 8 份：单模块 ≥ 0.4mm', miniOk.moduleMm >= printLib.MODULE_MIN_MM, miniOk.moduleMm + 'mm')
ok('迷你 8 份标为「小型二维码」', miniOk.qrLabel === '小型二维码', miniOk.qrLabel)

// 载荷变长（模块数上升）时，迷你版式要么自动想办法、要么自己退出——不能给出扫不动的牌
var miniHeavy = printLib.planSheet({ layout: 'mini', orientation: 'portrait', moduleCount: 60 })
ok('模块数 60 时迷你版式仍达标（自动旋转找空间）',
  miniHeavy.usable === true && miniHeavy.moduleMm >= printLib.MODULE_MIN_MM,
  (miniHeavy.rotate ? '旋转 90°' : '正放') + ' 码 ' + miniHeavy.qrMm + 'mm/模块 ' + miniHeavy.moduleMm + 'mm')

var miniImpossible = printLib.planSheet({ layout: 'mini', orientation: 'portrait', moduleCount: 90 })
ok('模块数 90 时迷你版式主动不提供', miniImpossible.usable === false,
  miniImpossible.warnings.join('；') || '（未拦住）')

var opts = printLib.layoutOptions('portrait', false, MODULES)
ok('layoutOptions 给出 4 档且都带说明', opts.length === 4 &&
  opts.every(function (o) { return o.key && o.label && typeof o.usable === 'boolean' }),
  opts.map(function (o) { return o.label + ':' + (o.usable ? '可' : '否') + ' ' + o.grid }).join(' · '))

/* ── [4] 渲染 + 解码（Chrome + CoreImage） ──────────────── */

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
  'utils/render.js', 'utils/paper-render.js',
  'utils/print-layout.js', 'utils/sheet-render.js'
]

function bundle (mods) {
  return mods.map(function (rel) {
    return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' +
      fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n});</script>'
  }).join('\n')
}

function artData () {
  var dir = path.join(ROOT, 'packageTpl', 'art')
  var out = {}
  fs.readdirSync(dir).filter(function (f) { return /\.webp$/.test(f) }).forEach(function (f) {
    out[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64')
  })
  return out
}

var PX_PER_MM = 3
// 迷你 8 份的码最小（21.7mm），3px/mm 下每个模块只有 1.6px，识别器读不出来；
// 这一张单独用 8px/mm 渲染（每模块 4.2px），裁切线统计不受影响。
var PX_PER_MM_MINI = 8
var JOBS = [
  { layout: 'full', orientation: 'portrait', cut: 'none' },
  { layout: 'half', orientation: 'portrait', cut: 'corner' },
  { layout: 'card', orientation: 'portrait', cut: 'none' },
  { layout: 'card', orientation: 'portrait', cut: 'corner' },
  { layout: 'card', orientation: 'portrait', cut: 'cross', narrow: true },
  { layout: 'card', orientation: 'portrait', cut: 'dash', narrow: true },
  { layout: 'mini', orientation: 'portrait', cut: 'corner', pxmm: PX_PER_MM_MINI },
  { layout: 'half', orientation: 'landscape', cut: 'corner' },
  { layout: 'card', orientation: 'landscape', cut: 'corner' }
]

var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out">pending</pre><script>' +
  LOADER + '</script>' + bundle(MODS) + '<script>' +
  'document.getElementById("out").textContent="boot";' +
  'window.onerror=function(m,s,l,c,e){document.getElementById("out").textContent=' +
  '  "ERR "+m+" @"+l+":"+c+" "+(e&&e.stack||"")};' +
  'var C=__req("main.js")("templates/catalog.js");' +
  'var SR=__req("main.js")("utils/sheet-render.js");' +
  'var PL=__req("main.js")("utils/print-layout.js");' +
  'var W=__req("main.js")("utils/wifi.js");' +
  'var BOUNDS=' + JSON.stringify(bounds) + ';' +
  'var ART=' + JSON.stringify(artData()) + ';' +
  'var JOBS=' + JSON.stringify(JOBS) + ';' +
  'var SAMPLE=' + JSON.stringify(SAMPLE) + ';' +
  'var PAYLOAD=W.buildWifiString(SAMPLE).value;' +
  'var PXMM=' + PX_PER_MM + ';' +
  'var MODULES=' + MODULES + ';' +
  'var res=[],i=0;var tpl=C.getTemplate("paper-milktea");' +
  'window.onerror=function(m,s,l,c,e){document.getElementById("out").textContent=' +
  '  "ERR "+m+" @"+l+":"+c+" "+(e&&e.stack||"")};' +
  'function step(){' +
  '  try{' +
  '    if(i>=JOBS.length){document.getElementById("out").textContent=JSON.stringify(res);return}' +
  '    var job=JOBS[i++];' +
  '    var plan=PL.planSheet({layout:job.layout,orientation:job.orientation,cut:job.cut,' +
  '      narrowMargin:!!job.narrow,moduleCount:MODULES});' +
  '    var img=new Image();' +
  '    img.onload=function(){draw(job,plan,img)};' +
  '    img.onerror=function(){draw(job,plan,null)};' +
  '    img.src=ART[tpl.art];' +
  '  }catch(e1){document.getElementById("out").textContent="ERR-STEP "+e1.message}' +
  '}' +
  'function draw(job,plan,img){' +
  '  try{' +
  '    var k=job.pxmm||PXMM;' +
  '    var c=document.createElement("canvas");' +
  '    c.width=Math.round(plan.sheet.w*k);c.height=Math.round(plan.sheet.h*k);' +
  '    var ctx=c.getContext("2d");' +
  '    var meta=SR.renderSheet(ctx,plan,tpl,{' +
  '      shopName:SAMPLE.shopName,ssid:SAMPLE.ssid,password:SAMPLE.password,type:"WPA",' +
  '      showPassword:true,payload:PAYLOAD,mm:{w:plan.cardW,h:plan.cardH}' +
  '    },{art:img,bounds:BOUNDS[tpl.art],pxPerMm:k,vertical:true});' +
  '    /* 数一数裁切线颜色（#B8B8B8）的像素，用来区分四种样式 */' +
  '    var d=ctx.getImageData(0,0,c.width,c.height).data;' +
  '    var cutPx=0;' +
  '    /* 循环变量别叫 k——k 是每毫米像素数，var 会串' + ' */' +
  '    for(var q=0;q<d.length;q+=4){' +
  '      if(Math.abs(d[q]-184)<6&&Math.abs(d[q+1]-184)<6&&Math.abs(d[q+2]-184)<6)cutPx++;' +
  '    }' +
  '    res.push({key:job.layout+"/"+job.orientation+"/"+job.cut+(job.narrow?"/narrow":""),' +
  '      job:job,count:plan.count,grid:plan.grid.cols+"x"+plan.grid.rows,rotate:plan.rotate,' +
  '      cardW:plan.cardW,cardH:plan.cardH,qrMm:plan.qrMm,moduleMm:plan.moduleMm,' +
  '      qrLabel:plan.qrLabel,cutPx:cutPx,actualQrMm:meta.qrMm,actualModuleMm:meta.moduleMm,' +
  '      url:c.toDataURL("image/png")});' +
  '    /* 逐张裁出来单独解码：成品是印在纸上的一张牌，扫码器看到的是这一小块 */' +
  '    var cards=res[res.length-1];cards.crops=[];' +
  '    for(var n=0;n<plan.cards.length;n++){' +
  '      var cd=plan.cards[n];' +
  '      var cw=Math.round(cd.w*k),chh=Math.round(cd.h*k);' +
  '      var cc=document.createElement("canvas");cc.width=cw;cc.height=chh;' +
  '      cc.getContext("2d").drawImage(c,Math.round(cd.x*k),Math.round(cd.y*k),cw,chh,0,0,cw,chh);' +
  '      cards.crops.push(cc.toDataURL("image/png"));' +
  '    }' +
  '  }catch(e2){document.getElementById("out").textContent="ERR-DRAW "+e2.message+" "+(e2.stack||"");return}' +
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
  '--user-data-dir=/tmp/cr-vpr-' + Math.random().toString(36).slice(2, 8),
  '--window-size=900,1200', '--virtual-time-budget=30000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m || m[1] === 'pending') {
  console.log('  ✗ 渲染输出缺失')
  process.exit(1)
}
var rendered = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))

console.log('\n[4] 渲染与解码')
ok('8 张拼版全部画出', rendered.length === JOBS.length, rendered.length + ' 张')

function decodeFile (file) {
  try {
    var out = execFileSync('swift', [path.join(__dirname, 'decode.swift'), file], { encoding: 'utf8' })
    var n = out.match(/识别到 (\d+) 个二维码/)
    return {
      count: n ? Number(n[1]) : 0,
      payloads: out.split('\n')
        .filter(function (l) { return l.indexOf('载荷: ') === 0 })
        .map(function (l) { return l.replace('载荷: ', '').trim() })
    }
  } catch (e) {
    return { count: 0, payloads: [] }
  }
}

var cropBad = []
var cropTotal = 0
var sheetRows = []
rendered.forEach(function (r) {
  var base = 'sheet-' + r.key.replace(/[@/]/g, '-')
  fs.writeFileSync(path.join(OUT, base + '.png'), Buffer.from(r.url.split(',')[1], 'base64'))

  var whole = decodeFile(path.join(OUT, base + '.png'))
  sheetRows.push(r.key + ' 整张识别 ' + whole.count + '/' + r.count)

  // 逐张裁出来单独解码（真实扫码场景：手机对着印好的那一片）
  ;(r.crops || []).forEach(function (url, idx) {
    var file = path.join(OUT, base + '-card' + (idx + 1) + '.png')
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    cropTotal++
    var d = decodeFile(file)
    if (d.count < 1 || d.payloads.some(function (p) { return p !== PAYLOAD })) {
      cropBad.push(r.key + ' 第 ' + (idx + 1) + ' 张 → ' + (d.payloads[0] || '未识别'))
    }
  })
})

ok('每一份单独裁出来都能扫（逐张解码）', cropBad.length === 0 && cropTotal > 0,
  cropBad.length ? cropBad.slice(0, 3).join(' | ') : cropTotal + ' 张全部读出一致的载荷')
console.log('  ' + sheetRows.join('\n  '))

/* ── [5] 裁切线 ─────────────────────────────────────────── */

console.log('\n[5] 裁切线')
var byStyle = {}
rendered.forEach(function (r) { byStyle[r.key] = r })
var noCut = byStyle['card/portrait/none']
var corner = byStyle['card/portrait/corner']
var cross = byStyle['card/portrait/cross/narrow']
var dash = byStyle['card/portrait/dash/narrow']
console.log('  样式像素量 ' + [['无', noCut], ['边角', corner], ['十字+点线', cross], ['虚线', dash]]
  .map(function (p) { return p[0] + ' ' + (p[1] ? p[1].cutPx : '—') }).join(' · '))

ok('「无」不画任何裁切辅助线', noCut && noCut.cutPx === 0, String(noCut && noCut.cutPx))
ok('「边角」只在四角画短线', corner && corner.cutPx > 0 && corner.cutPx < 400, String(corner && corner.cutPx))
ok('「十字+点线」比「边角」用墨多', cross && corner && cross.cutPx > corner.cutPx,
  (corner && corner.cutPx) + ' → ' + (cross && cross.cutPx))
ok('「虚线」沿整张边框走，用墨最多', dash && cross && dash.cutPx > cross.cutPx, String(dash && dash.cutPx))
ok('四种样式像素量互不相同', [noCut, corner, cross, dash].every(function (x) { return x }) &&
  new Set([noCut.cutPx, corner.cutPx, cross.cutPx, dash.cutPx]).size === 4,
  [noCut, corner, cross, dash].map(function (x) { return x && x.cutPx }).join(' / '))

/* ── [6] 渲染出的真实尺寸与估算一致 ─────────────────────── */

console.log('\n[6] 估算与实际一致')
var drift = rendered.filter(function (r) {
  return Math.abs(r.actualQrMm - r.qrMm) / r.qrMm > 0.1
})
ok('渲染回填的码尺寸与拼版估算相差 < 10%', drift.length === 0,
  drift.map(function (r) { return r.key + ' ' + r.qrMm + '→' + r.actualQrMm }).join(' | ') ||
  rendered.map(function (r) { return r.qrMm + '/' + r.actualQrMm }).slice(0, 4).join(' '))

/* ── 汇总 ───────────────────────────────────────────────── */

console.log('\n结果: ' + pass + ' 项通过，' + fail + ' 项失败')
if (fail) {
  console.log('失败项：')
  fails.forEach(function (f) { console.log('  - ' + f) })
  process.exit(1)
}
