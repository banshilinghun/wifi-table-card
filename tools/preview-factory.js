/**
 * tools/preview-factory.js —— 把工厂生成的模板画成一张联络表
 *
 * 与 build-screens 同源：复用同一套模块加载器 + 真实 utils/render.js，
 * 只是页面换成 N 个 canvas 的网格。这样「生成器写出来的坐标」是
 * 被真浏览器验证过的，不是纸面自洽。
 *
 * 运行：node tools/preview-factory.js [数量]
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(ROOT, 'tools', 'out')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

var MODULES = [
  'templates/index.js',
  'templates/taxonomy.js',
  'templates/qa.js',
  'templates/factory.js',
  'utils/qrcode.js',
  'utils/qr-canvas.js',
  'utils/render.js',
  'assets/ornaments/index.js',
  'utils/ornament.js'
]

var loader = [
  'var __defs = {}, __cache = {};',
  'function __define(name, fn){ __defs[name] = fn }',
  'function __normalize(base, req){',
  '  if (req.charAt(0) !== ".") return req;',
  '  var parts = base.split("/"); parts.pop();',
  '  req.split("/").forEach(function(p){',
  '    if (!p || p === ".") return;',
  '    if (p === "..") parts.pop(); else parts.push(p);',
  '  });',
  '  var out = parts.join("/");',
  '  return /\\.js$/.test(out) ? out : out + ".js";',
  '}',
  'function __req(from){ return function(name){',
  '  var key = __normalize(from, name);',
  '  if (__cache[key]) return __cache[key].exports;',
  '  var fn = __defs[key];',
  '  if (!fn) throw new Error("module not found: " + key);',
  '  var m = { exports: {} }; __cache[key] = m;',
  '  fn(m, m.exports, __req(key));',
  '  return m.exports;',
  '}}'
].join('\n')

var DRAW = function (count, seed) {
  var report = { errors: [], cells: [], blank: 0 }
  window.__report = report
  ;['log', 'warn', 'error'].forEach(function (lv) {
    var orig = console[lv]
    console[lv] = function () {
      report.errors.push('[' + lv + '] ' + Array.prototype.slice.call(arguments).map(function (a) {
        return typeof a === 'string' ? a : JSON.stringify(a)
      }).join(' '))
      orig.apply(console, arguments)
    }
  })

  var lib = __req('tools/preview-factory.js')('templates/factory.js')
  var render = __req('tools/preview-factory.js')('utils/render.js')
  var wifi = null

  /* 载荷：与页面一致，直接拼 WIFI: 串（不依赖 utils/wifi 也够用） */
  function esc (v) { return String(v).replace(/([\\:;,\"])/g, '\\\\$1') }
  var payload = 'WIFI:T:WPA;S:' + esc('Shiguang-Cafe') + ';P:' + esc('coffee2024') + ';;'

  var res = lib.generate({ keep: count, seed: seed })
  var tpls = res.templates

  var grid = document.getElementById('grid')
  var CELL = 210
  var DPR = 2

  tpls.forEach(function (tpl, i) {
    var wrap = document.createElement('div')
    wrap.className = 'cell'

    var box = document.createElement('div')
    box.className = 'art'
    var c = document.createElement('canvas')
    var ratio = lib.canvasOf(tpl.shape)
    var w = CELL, h = CELL
    if (ratio.ratio >= 1) { w = CELL; h = Math.round(CELL / ratio.ratio) }
    else { h = CELL; w = Math.round(CELL * ratio.ratio) }
    c.width = w * DPR
    c.height = h * DPR
    c.style.width = w + 'px'
    c.style.height = h + 'px'
    var ctx = c.getContext('2d')
    ctx.scale(DPR, DPR)

    try {
      render.renderSign(ctx, tpl, {
        shopName: '拾光咖啡',
        ssid: 'Shiguang-Cafe',
        password: 'coffee2024',
        type: 'WPA',
        showPassword: true,
        payload: payload
      }, w, h)
    } catch (e) {
      report.errors.push('render ' + tpl.id + ': ' + e.message)
    }

    var ink = 0
    try {
      var d = ctx.getImageData(0, 0, c.width, c.height).data
      var n = 0
      for (var p = 0; p < d.length; p += 4 * 53) { n++; if (d[p] < 245 || d[p + 1] < 245 || d[p + 2] < 245) ink++ }
      ink = n ? +(ink / n).toFixed(3) : 0
    } catch (e) { ink = -1 }
    if (ink >= 0 && ink < 0.02) report.blank++

    var meta = document.createElement('div')
    meta.className = 'meta'
    meta.textContent = tpl.name + ' · ' + tpl.region + ' · ' + tpl.shape + ' · ' + tpl.layout + '/' + tpl.density
    box.appendChild(c)
    wrap.appendChild(box)
    wrap.appendChild(meta)
    grid.appendChild(wrap)

    report.cells.push({ id: tpl.id, name: tpl.name, ink: ink, w: w, h: h })
  })

  var pre = document.getElementById('report')
  pre.textContent = JSON.stringify({
    generated: tpls.length,
    tried: res.tried,
    rejected: res.rejected.length,
    blank: report.blank,
    errors: report.errors
  }, null, 1)
}

function build (count, seed) {
  var scripts = MODULES.map(function (rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' + code + '\n});</script>'
  }).join('\n')

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;background:#0a0b0d;color:#e9eaee;font:12px/1.4 -apple-system,"PingFang SC",sans-serif}' +
    '#grid{display:flex;flex-wrap:wrap;gap:14px;padding:18px;align-items:flex-start;width:1200px}' +
    '.cell{width:210px}' +
    '.art{display:flex;align-items:flex-end;justify-content:center;height:210px}' +
    '.meta{margin-top:4px;color:#8b919b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#report{position:fixed;left:-9999px}' +
    '</style></head><body><div id="grid"></div><pre id="report"></pre>' +
    '<script>' + loader + '</script>' +
    '<scr' + 'ipt>window.__ORN_PREFIX=' + JSON.stringify('file://' + ROOT + '/') + '</scr' + 'ipt>' + scripts +
    '<script>(' + DRAW.toString() + ')(' + count + ',' + seed + ');</script>' +
    '</body></html>'
}

function main () {
  var count = parseInt(process.argv[2] || '24', 10)
  var seed = parseInt(process.argv[3] || '20261114', 10)
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  var file = path.join(OUT, 'factory-preview.html')
  fs.writeFileSync(file, build(count, seed))

  var png = path.join(OUT, 'factory-preview.png')
  try {
    execFileSync(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars',
      '--disable-gpu', '--no-first-run', '--force-device-scale-factor=2',
      '--user-data-dir=/tmp/cr-fx-' + Math.random().toString(36).slice(2, 8),
      '--window-size=1200,1400', '--virtual-time-budget=12000',
      '--screenshot=' + png, 'file://' + file
    ], { stdio: 'ignore' })
  } catch (e) {
    console.log('截图失败：' + e.message)
  }

  var dom = ''
  try {
    dom = execFileSync(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
      '--user-data-dir=/tmp/cr-fx-' + Math.random().toString(36).slice(2, 8),
      '--window-size=1200,1400', '--virtual-time-budget=12000', '--dump-dom', 'file://' + file
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (e) {
    console.log('报告读取失败：' + e.message)
  }
  var m = dom.match(/<pre id="report">([\s\S]*?)<\/pre>/)
  if (m) {
    var text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    console.log('报告:', text)
  } else {
    console.log('报告缺失')
  }
  console.log('图片:', png)
}

main()