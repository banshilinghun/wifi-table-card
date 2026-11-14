/**
 * tools/verify-print.js —— 打印拼版验收
 *
 * [1] 几何：4 版式 × 竖/横 × 边距，五种模板比例（1:1.4 / 1:1 / 2:1 / 1:2 / 1.4:1）
 * [2] 像素尺寸：300dpi / 200dpi 换算
 * [3] 门槛：模块数按载荷真实编码结果，不是固定 33
 * [4] 渲染：白纸 + 深色 + 2:1 深色 + 长载荷，逐张裁出解码
 * [5] 裁切线：四种样式的线量与「无」的区别
 * [6] 竖排开关：开/关的像素差
 * [7] 文案：空密码、无密码网络、长文本折行、特殊字符
 * [8] 深色模板保留样式与比例
 * [9] 估算与实际一致
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
var qrMetrics = require(path.join(ROOT, 'utils/qr-metrics.js'))
var bounds = require(path.join(ROOT, 'packageTpl/art/bounds'))
var wifi = require(path.join(ROOT, 'utils/wifi.js'))

var pass = 0
var fail = 0
var fails = []
function ok (label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label + (detail ? '  ' + detail : '')) }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (detail ? '  ' + detail : '')) }
}

/* ── 测试载荷 ───────────────────────────────────────────── */

var SAMPLES = {
  short: { shopName: '拾光咖啡', ssid: '拾光网络', password: 'coffee2024', type: 'WPA' },
  // 20 个汉字 = 60 字节，故意超过 32 字节上限，看折行与警告
  longCn: {
    shopName: '拾光咖啡三号店',
    ssid: '拾光咖啡三号店二楼靠窗的老位置',
    password: 'Coffee_2024#Summer!Place@3F',
    type: 'WPA'
  },
  longPwd: {
    shopName: '拾光咖啡',
    ssid: 'Shiguang-Cafe-5G',
    password: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2',
    type: 'WPA'
  },
  // 27 字中文 SSID + 63 位密码：模块数升到 49，迷你版式会被顶出下限
  huge: {
    shopName: '拾光咖啡三号店',
    ssid: '拾光咖啡三号店二楼靠窗的老位置与露台全区域-Guest',
    password: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6',
    type: 'WPA'
  },
  special: {
    shopName: 'A;B,C',
    ssid: 'Cafe;Bar,2F:test"room\\back',
    password: 'p;w,d:e"f\\g',
    type: 'WPA'
  },
  emptyPwd: { shopName: '拾光咖啡', ssid: 'Shiguang-Cafe', password: '', type: 'WPA' },
  openNet: { shopName: '拾光咖啡', ssid: 'Shiguang-Guest', password: '', type: 'nopass' }
}

var PAYLOADS = {}
var MODULES = {}
Object.keys(SAMPLES).forEach(function (k) {
  PAYLOADS[k] = wifi.buildWifiString(SAMPLES[k]).value
  MODULES[k] = qrMetrics.moduleCount(PAYLOADS[k])
})

console.log('载荷模块数：' + Object.keys(MODULES).map(function (k) {
  return k + ' ' + MODULES[k]
}).join(' · '))

/* ── [1] 几何 ───────────────────────────────────────────── */

console.log('\n[1] 拼版几何')

var RATIOS = [
  { name: '1:1.4', ratio: 1 / 1.4 },
  { name: '1:1', ratio: 1 },
  { name: '2:1', ratio: 2 },
  { name: '1:2', ratio: 0.5 },
  { name: '1.4:1', ratio: 1.4 }
]

var COMBOS = []
RATIOS.forEach(function (r) {
  ;['portrait', 'landscape'].forEach(function (o) {
    ;[false, true].forEach(function (n) {
      printLib.LAYOUTS.forEach(function (l) {
        COMBOS.push(printLib.planSheet({
          layout: l.key, orientation: o, cut: 'corner', narrowMargin: n,
          moduleCount: MODULES.short, ratio: r.ratio, qrRatio: 0.46
        }))
      })
    })
  })
})

ok('80 种组合（5 比例 × 竖横 × 边距 × 4 版式）份数正确',
  COMBOS.every(function (p) { return p.count === printLib.getLayout(p.layout).count }),
  COMBOS.length + ' 组')

var ratioBad = COMBOS.filter(function (p) { return p.ratioDelta > 0.001 })
ok('每种比例的卡片都保持原比例（不再被边距拉变形）', ratioBad.length === 0,
  ratioBad.slice(0, 3).map(function (p) { return p.layout + ' ' + p.ratioDelta }).join(' | ') || '偏差全部 < 0.1%')

var outOfSheet = []
var overlapping = []
var scaleBad = []
COMBOS.forEach(function (p) {
  p.cards.forEach(function (c) {
    var tag = p.layout + '/' + p.sheet.orientation + '#' + c.index
    if (c.x < p.margin - 0.01 || c.y < p.margin - 0.01 ||
      c.x + c.w > p.sheet.w - p.margin + 0.01 || c.y + c.h > p.sheet.h - p.margin + 0.01) {
      outOfSheet.push(tag)
    }
    if (Math.abs(c.logicalW / c.logicalH - p.ratio) > 0.001) scaleBad.push(tag + ' 比例')
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
ok('卡片自身比例 = 请求的比例', scaleBad.length === 0, scaleBad.slice(0, 3).join(' '))

var narrow = printLib.planSheet({
  layout: 'card', orientation: 'portrait', narrowMargin: true,
  moduleCount: MODULES.short, ratio: 1 / 1.4, qrRatio: 0.46
})
var normal = printLib.planSheet({
  layout: 'card', orientation: 'portrait', narrowMargin: false,
  moduleCount: MODULES.short, ratio: 1 / 1.4, qrRatio: 0.46
})
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

/* ── [3] 门槛：模块数来自真实载荷 ───────────────────────── */

console.log('\n[3] 扫码下限（真实模块数）')

ok('不同载荷得到不同模块数（不是固定 33）',
  MODULES.short !== MODULES.longCn && MODULES.longCn > MODULES.short,
  '短 ' + MODULES.short + ' · 长中文 ' + MODULES.longCn + ' · 长密码 ' + MODULES.longPwd)

function planFor (sample, layout) {
  var tpl = catalog.getTemplate('paper-milktea')
  var probe = Object.assign({}, SAMPLES[sample], { payload: PAYLOADS[sample] })
  return printLib.planSheet({
    layout: layout, orientation: 'portrait', cut: 'corner',
    moduleCount: MODULES[sample],
    ratio: catalog.shapeRatio(tpl),
    qrRatio: qrMetrics.qrRatio(tpl, probe, bounds[tpl.art])
  })
}

var miniShort = planFor('short', 'mini')
ok('短载荷迷你 8 份：码 ≥ 15mm', miniShort.qrMm >= printLib.QR_MIN_MM, miniShort.qrMm + 'mm')
ok('短载荷迷你 8 份：单模块 ≥ 0.4mm', miniShort.moduleMm >= printLib.MODULE_MIN_MM,
  miniShort.moduleMm + 'mm')
ok('二维码分类标注与实测尺寸一致',
  (miniShort.qrMm >= printLib.QR_STD_MM) === (miniShort.qrLabel === '标准二维码'),
  miniShort.qrMm + 'mm → ' + miniShort.qrLabel + '；' +
  planFor('short', 'card').qrMm + 'mm → ' + planFor('short', 'card').qrLabel)

var miniLong = planFor('longCn', 'mini')
var cardLong = planFor('longCn', 'card')

ok('长中文 SSID + 长密码（V6 / 41 模块）时迷你仍可用',
  miniLong.usable === true && miniLong.moduleMm >= printLib.MODULE_MIN_MM,
  miniLong.moduleMm + 'mm')
ok('同一载荷下卡片 4 份仍然可用', cardLong && cardLong.usable === true,
  (cardLong.rotate ? '旋转 90°' : '正放') + ' 码 ' + cardLong.qrMm + 'mm/模块 ' + cardLong.moduleMm + 'mm')
ok('模块数越大单模块越小（同一种版式）',
  miniLong.moduleMm < miniShort.moduleMm,
  '短载荷 ' + miniShort.moduleMm + 'mm · 长载荷 ' + miniLong.moduleMm + 'mm')

// 界面能输入的极限：SSID 32 字符（中文最多 96 字节）+ 密码 63 字符
var tplPaper = catalog.getTemplate('paper-milktea')
var maxInput = { ssid: '拾光咖啡三号店二楼靠窗的老位置与露台全区域预留座位区A', password: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6' }
var maxPayload = wifi.buildWifiString(maxInput).value
var maxMods = qrMetrics.moduleCount(maxPayload)
var maxProbe = Object.assign({}, maxInput, { type: 'WPA', payload: maxPayload })
var maxQr = qrMetrics.qrRatio(tplPaper, maxProbe, bounds[tplPaper.art])
var maxOpts = printLib.layoutOptions('portrait', false, {
  moduleCount: maxMods, ratio: catalog.shapeRatio(tplPaper), qrRatio: maxQr
})
ok('界面能输入的最长内容下，4 种版式全部达标（无需禁用）',
  maxOpts.every(function (o) { return o.usable }),
  maxMods + ' 模块 · ' + maxOpts.map(function (o) {
    return o.label + ' ' + o.moduleMm + 'mm'
  }).join(' / '))

// 合成超长载荷：远超界面允许的长度，只为证明「不达标就禁用」这条路径真的会走
var synthPayload = 'WIFI:T:WPA;S:' + new Array(400).join('A') + ';P:B;;'
var synthMods = qrMetrics.moduleCount(synthPayload)
var synthMini = printLib.planSheet({
  layout: 'mini', orientation: 'portrait', moduleCount: synthMods,
  ratio: catalog.shapeRatio(tplPaper), qrRatio: maxQr
})
ok('超长载荷（' + synthMods + ' 模块）时迷你版式被禁用并给出原因',
  synthMini.usable === false && /低于/.test(synthMini.warnings.join('')),
  synthMini.warnings.join('；') || '（未拦住）')
ok('被禁用的版式仍然算出二维码尺寸，界面才能显示「差多少」',
  synthMini.qrMm > 0 && synthMini.moduleMm > 0,
  synthMini.qrMm + 'mm / 单模块 ' + synthMini.moduleMm + 'mm')

var optsLong = printLib.layoutOptions('portrait', false, {
  moduleCount: synthMods, ratio: catalog.shapeRatio(tplPaper), qrRatio: maxQr
})
ok('layoutOptions 把不达标版式标成不可用并带原因',
  optsLong.some(function (o) { return !o.usable && /低于/.test(o.reason) }),
  optsLong.map(function (o) { return o.label + ':' + (o.usable ? '可' : o.reason) }).join(' · '))

var opts = printLib.layoutOptions('portrait', false, {
  moduleCount: MODULES.short,
  ratio: catalog.shapeRatio(catalog.getTemplate('paper-milktea')),
  qrRatio: 0.46
})
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
  'utils/wifi.js', 'utils/qrcode.js', 'utils/qr-canvas.js', 'utils/qr-metrics.js',
  'utils/render.js', 'utils/paper-render.js', 'utils/draw.js',
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
// 迷你 8 份的码最小（21.8mm），3px/mm 下每个模块约 1.6px，识别器读不出来；
// 这一张单独用 8px/mm 渲染（每模块约 4px）。
var PX_PER_MM_MINI = 8

var JOBS = [
  { id: 'paper-full', tpl: 'paper-milktea', sample: 'short', layout: 'full', orientation: 'portrait', cut: 'none' },
  { id: 'paper-card', tpl: 'paper-milktea', sample: 'short', layout: 'card', orientation: 'portrait', cut: 'corner' },
  { id: 'paper-mini', tpl: 'paper-milktea', sample: 'short', layout: 'mini', orientation: 'portrait', cut: 'corner', pxmm: PX_PER_MM_MINI },
  { id: 'paper-half-land', tpl: 'paper-milktea', sample: 'short', layout: 'half', orientation: 'landscape', cut: 'corner' },
  // 深色：1:1.4 / 2:1 / 1:1，样式与比例都必须保留
  { id: 'dark-card', tpl: 'night-berth', sample: 'short', layout: 'card', orientation: 'portrait', cut: 'corner' },
  { id: 'dark-wide', tpl: 'ember', sample: 'short', layout: 'card', orientation: 'portrait', cut: 'corner' },
  { id: 'dark-square', tpl: 'still-water', sample: 'short', layout: 'card', orientation: 'portrait', cut: 'corner' },
  // 竖排开关（同一版式，只有开关不同）
  { id: 'paper-vert-on', tpl: 'paper-milktea', sample: 'short', layout: 'card', orientation: 'portrait', cut: 'none', vertical: true },
  { id: 'paper-vert-off', tpl: 'paper-milktea', sample: 'short', layout: 'card', orientation: 'portrait', cut: 'none', vertical: false },
  // 长载荷与边界文案
  { id: 'paper-long', tpl: 'paper-milktea', sample: 'longCn', layout: 'card', orientation: 'portrait', cut: 'corner', pxmm: 5 },
  { id: 'paper-longpwd', tpl: 'paper-milktea', sample: 'longPwd', layout: 'card', orientation: 'portrait', cut: 'corner', pxmm: 5 },
  { id: 'paper-special', tpl: 'paper-milktea', sample: 'special', layout: 'card', orientation: 'portrait', cut: 'corner', pxmm: 5 },
  { id: 'paper-emptypwd', tpl: 'paper-milktea', sample: 'emptyPwd', layout: 'full', orientation: 'portrait', cut: 'none' },
  { id: 'paper-open', tpl: 'paper-milktea', sample: 'openNet', layout: 'full', orientation: 'portrait', cut: 'none' }
]

var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out">pending</pre><script>' +
  LOADER + '</script>' + bundle(MODS) + '<script>' +
  'window.onerror=function(m,s,l,c,e){document.getElementById("out").textContent=' +
  '  "ERR "+m+" @"+l+":"+c+" "+(e&&e.stack||"")};' +
  'var C=__req("main.js")("templates/catalog.js");' +
  'var SR=__req("main.js")("utils/sheet-render.js");' +
  'var PL=__req("main.js")("utils/print-layout.js");' +
  'var QM=__req("main.js")("utils/qr-metrics.js");' +
  'var W=__req("main.js")("utils/wifi.js");' +
  'var BOUNDS=' + JSON.stringify(bounds) + ';' +
  'var ART=' + JSON.stringify(artData()) + ';' +
  'var JOBS=' + JSON.stringify(JOBS) + ';' +
  'var SAMPLES=' + JSON.stringify(SAMPLES) + ';' +
  'var MODULES=' + JSON.stringify(MODULES) + ';' +
  'var PXMM=' + PX_PER_MM + ';' +
  'var res=[],i=0;' +
  'function step(){' +
  '  try{' +
  '    if(i>=JOBS.length){document.getElementById("out").textContent=JSON.stringify(res);return}' +
  '    var job=JOBS[i++];' +
  '    var tpl=C.getTemplate(job.tpl);' +
  '    var s=SAMPLES[job.sample];' +
  '    var payload=W.buildWifiString(s).value;' +
  '    var probe={shopName:s.shopName,ssid:s.ssid,password:s.password,type:s.type,' +
  '      showPassword:true,payload:payload};' +
  '    var bd=BOUNDS[tpl.art]||null;' +
  '    var qrRatio=QM.qrRatio(tpl,probe,bd);' +
  '    var plan=PL.planSheet({layout:job.layout,orientation:job.orientation,cut:job.cut,' +
  '      narrowMargin:!!job.narrow,moduleCount:MODULES[job.sample],' +
  '      ratio:C.shapeRatio(tpl),qrRatio:qrRatio});' +
  '    if(tpl.series!=="paper"){draw(job,plan,null,payload,s);return}' +
  '    var img=new Image();' +
  '    img.onload=function(){draw(job,plan,img,payload,s)};' +
  '    img.onerror=function(){draw(job,plan,null,payload,s)};' +
  '    img.src=ART[tpl.art];' +
  '  }catch(e1){document.getElementById("out").textContent="ERR-STEP "+e1.message}' +
  '}' +
  'function draw(job,plan,img,payload,s){' +
  '  try{' +
  '    var tpl=C.getTemplate(job.tpl);' +
  '    var k=job.pxmm||PXMM;' +
  '    var c=document.createElement("canvas");' +
  '    c.width=Math.round(plan.sheet.w*k);c.height=Math.round(plan.sheet.h*k);' +
  '    var ctx=c.getContext("2d");' +
  '    var meta=SR.renderSheet(ctx,plan,tpl,{' +
  '      shopName:s.shopName,ssid:s.ssid,password:s.password,type:s.type,' +
  '      showPassword:true,payload:payload' +
  '    },{art:img,bounds:BOUNDS[tpl.art]||null,pxPerMm:k,vertical:job.vertical!==false});' +
  '    /* 数一数裁切线颜色（#B8B8B8）的像素，用来区分四种样式 */' +
  '    var d=ctx.getImageData(0,0,c.width,c.height).data;' +
  '    var cutPx=0;' +
  '    /* 循环变量别叫 k —— k 是每毫米像素数，var 会串' + ' */' +
  '    for(var q=0;q<d.length;q+=4){' +
  '      if(Math.abs(d[q]-184)<6&&Math.abs(d[q+1]-184)<6&&Math.abs(d[q+2]-184)<6)cutPx++;' +
  '    }' +
  '    /* 深色占比：深色模板整张纸上深色像素多，白纸模板几乎没有 */' +
  '    var darkPx=0,totalPx=0;' +
  '    for(var pp=0;pp<d.length;pp+=16){' +
  '      totalPx++;' +
  '      if((0.2126*d[pp]+0.7152*d[pp+1]+0.0722*d[pp+2])/255<0.35)darkPx++;' +
  '    }' +
  '    var bg={dark:darkPx,total:totalPx};' +
  '    /* 右侧 8% 竖条里的墨量：用来判断竖排小字有没有画 */' +
  '    var strip=0,sx=Math.round(c.width*0.92);' +
  '    for(var yy=0;yy<c.height;yy+=2){' +
  '      for(var xx=sx;xx<c.width;xx+=2){' +
  '        var o=(yy*c.width+xx)*4;' +
  '        if(d[o]<235||d[o+1]<235||d[o+2]<235)strip++;' +
  '      }' +
  '    }' +
  '    res.push({id:job.id,tpl:job.tpl,series:tpl.series,count:plan.count,' +
  '      grid:plan.grid.cols+"x"+plan.grid.rows,rotate:plan.rotate,ratio:plan.ratio,' +
  '      cardW:plan.cardW,cardH:plan.cardH,qrMm:plan.qrMm,moduleMm:plan.moduleMm,' +
  '      qrLabel:plan.qrLabel,cutPx:cutPx,bg:bg,strip:strip,' +
  '      actualQrMm:meta.qrMm,actualModuleMm:meta.moduleMm,moduleCount:meta.moduleCount,' +
  '      ssidText:meta.ssid?(meta.ssid.text||meta.ssid.value||null):null,' +
  '      pwdText:meta.pwd?(meta.pwd.text||meta.pwd.value||null):null,' +
  '      hasVertical:!!meta.vertical,' +
  '      payload:payload,url:c.toDataURL("image/png")});' +
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
  '--window-size=900,1200', '--virtual-time-budget=60000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m || m[1] === 'pending') {
  console.log('  ✗ 渲染输出缺失')
  process.exit(1)
}
if (/^ERR/.test(m[1])) {
  console.log('  ✗ ' + m[1].slice(0, 600))
  process.exit(1)
}
var rendered = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))

console.log('\n[4] 渲染与解码')
ok('全部拼版画出', rendered.length === JOBS.length, rendered.length + ' / ' + JOBS.length)

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
  var base = 'sheet-' + r.id
  fs.writeFileSync(path.join(OUT, base + '.png'), Buffer.from(r.url.split(',')[1], 'base64'))

  var whole = decodeFile(path.join(OUT, base + '.png'))
  sheetRows.push(r.id + ' 整张识别 ' + whole.count + '/' + r.count)

  ;(r.crops || []).forEach(function (url, idx) {
    var file = path.join(OUT, base + '-card' + (idx + 1) + '.png')
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    cropTotal++
    var d = decodeFile(file)
    if (d.count < 1 || d.payloads.some(function (p) { return p !== r.payload })) {
      cropBad.push(r.id + ' 第 ' + (idx + 1) + ' 张 → ' + (d.payloads[0] || '未识别'))
    }
  })
})

ok('每一份单独裁出来都能扫（逐张解码）', cropBad.length === 0 && cropTotal > 0,
  cropBad.length ? cropBad.slice(0, 3).join(' | ') : cropTotal + ' 张全部读出一致的载荷')
console.log('  ' + sheetRows.join('\n  '))

/* ── [5] 裁切线 ─────────────────────────────────────────── */

console.log('\n[5] 裁切线')
var byId = {}
rendered.forEach(function (r) { byId[r.id] = r })
var noCut = byId['paper-vert-on']
var corner = byId['paper-card']
console.log('  裁切线像素量 ' + rendered.map(function (r) { return r.id + ' ' + r.cutPx }).join(' · '))
ok('「无」不画任何裁切辅助线', noCut && noCut.cutPx === 0, String(noCut && noCut.cutPx))
ok('「边角」只画四角短线', corner && corner.cutPx > 0 && corner.cutPx < 4000, String(corner && corner.cutPx))

/* ── [6] 竖排开关 ───────────────────────────────────────── */

console.log('\n[6] 侧边竖排开关')
var vOn = byId['paper-vert-on']
var vOff = byId['paper-vert-off']
ok('开：渲染结果里有竖排块', vOn && vOn.hasVertical === true, String(vOn && vOn.hasVertical))
ok('关：渲染结果里没有竖排块', vOff && vOff.hasVertical === false, String(vOff && vOff.hasVertical))
ok('开与关的画面确实不同（右侧竖条墨量）',
  vOn && vOff && vOn.strip > vOff.strip,
  (vOff && vOff.strip) + ' → ' + (vOn && vOn.strip) + ' 像素')

/* ── [7] 文案正确性 ─────────────────────────────────────── */

console.log('\n[7] 文案与折行')
var empty = byId['paper-emptypwd']
var open = byId['paper-open']
var long = byId['paper-long']
var longPwd = byId['paper-longpwd']
var special = byId['paper-special']

ok('加密网络但没填密码：写「未填写密码」而不是「无需密码」',
  empty && empty.pwdText === '未填写密码', empty && empty.pwdText)
ok('无密码网络：写「无需密码」', open && open.pwdText === '无需密码', open && open.pwdText)
ok('长中文网络名折行后仍完整显示',
  long && long.ssidText && long.ssidText.indexOf('\n') > 0 &&
  long.ssidText.replace(/\n/g, '') === SAMPLES.longCn.ssid,
  long && JSON.stringify(long.ssidText))
ok('长密码折行后仍完整显示',
  long && long.pwdText && long.pwdText.replace(/\n/g, '') === SAMPLES.longCn.password,
  long && JSON.stringify(long.pwdText))
ok('63 位密码折成 3 行后仍完整显示',
  longPwd && longPwd.pwdText && longPwd.pwdText.replace(/\n/g, '') === SAMPLES.longPwd.password,
  longPwd && JSON.stringify(longPwd.pwdText))
ok('特殊字符（; , : " \\）按原样显示',
  special && special.ssidText === SAMPLES.special.ssid &&
  special.pwdText === SAMPLES.special.password,
  special && JSON.stringify(special.ssidText))
ok('长载荷也能被识别', !cropBad.some(function (b) { return b.indexOf('paper-long') === 0 }),
  '模块数 ' + (long && long.moduleCount))

/* ── [8] 深色样式与比例 ─────────────────────────────────── */

console.log('\n[8] 深色模板保留样式与比例')
var dark = byId['dark-card']
var wide = byId['dark-wide']
var square = byId['dark-square']
function darkShare (r) { return r && r.bg.total ? r.bg.dark / r.bg.total : 0 }

ok('深色模板仍是深色（深色像素占比高，没被画成白纸）',
  dark && darkShare(dark) > 0.2, dark && (darkShare(dark) * 100).toFixed(1) + '%')
ok('白纸模板仍是白底（深色像素只来自字与插画）',
  byId['paper-card'] && darkShare(byId['paper-card']) < 0.08,
  (darkShare(byId['paper-card']) * 100).toFixed(1) + '%')
ok('同一种拼版下深色模板与白纸模板的观感差别明显',
  dark && darkShare(dark) > darkShare(byId['paper-card']) * 3,
  (darkShare(byId['paper-card']) * 100).toFixed(1) + '% vs ' + (darkShare(dark) * 100).toFixed(1) + '%')
ok('2:1 模板按 2:1 排（不被拉成 1:1.4）',
  wide && Math.abs(wide.cardW / wide.cardH - 2) < 0.01,
  wide && (wide.cardW.toFixed(1) + '×' + wide.cardH.toFixed(1) + 'mm'))
ok('1:1 模板按 1:1 排', square && Math.abs(square.cardW / square.cardH - 1) < 0.01,
  square && (square.cardW.toFixed(1) + '×' + square.cardH.toFixed(1) + 'mm'))
ok('深色模板的二维码尺寸由它自己的 slots 决定',
  dark && dark.qrMm > 0 && dark.actualQrMm > 0 &&
  Math.abs(dark.actualQrMm - dark.qrMm) / dark.qrMm < 0.1,
  dark && (dark.qrMm + ' → ' + dark.actualQrMm.toFixed(1) + 'mm'))

/* ── [9] 估算与实际一致 ─────────────────────────────────── */

console.log('\n[9] 估算与实际一致')
var drift = rendered.filter(function (r) {
  if (!r.actualQrMm) return true
  return Math.abs(r.actualQrMm - r.qrMm) / r.qrMm > 0.1
})
ok('渲染回填的码尺寸与拼版估算相差 < 10%', drift.length === 0,
  drift.map(function (r) { return r.id + ' ' + r.qrMm + '→' + r.actualQrMm }).join(' | ') ||
  rendered.map(function (r) { return r.qrMm }).join(' '))

var SAMPLE_OF = {
  'paper-long': 'longCn',
  'paper-longpwd': 'longPwd',
  'paper-special': 'special',
  'paper-emptypwd': 'emptyPwd',
  'paper-open': 'openNet'
}
var modDrift = rendered.filter(function (r) {
  return r.moduleCount !== MODULES[SAMPLE_OF[r.id] || 'short']
})
ok('渲染出的模块数与预计算结果一致', modDrift.length === 0,
  modDrift.map(function (r) { return r.id + ' ' + r.moduleCount }).join(' | ') || '全部一致')

/* ── 汇总 ───────────────────────────────────────────────── */

console.log('\n结果: ' + pass + ' 项通过，' + fail + ' 项失败')
if (fail) {
  console.log('失败项：')
  fails.forEach(function (f) { console.log('  - ' + f) })
  process.exit(1)
}
