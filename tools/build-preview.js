/**
 * tools/build-preview.js —— 开发期可视化校验
 *
 * 把真实的 utils/*.js 打包进一个 HTML（自带极简 CommonJS 加载器），
 * 用无头 Chrome 栅格化，既能截图肉眼检查，也能在页面里跑像素级断言。
 *
 * 运行：node tools/build-preview.js
 */

var fs = require('fs')
var path = require('path')

var ROOT = path.join(__dirname, '..')
var OUT_DIR = path.join(__dirname, 'out')

var MODULES = [
  'utils/qrcode.js',
  'utils/wifi.js',
  'utils/qr-canvas.js',
  'utils/render.js',
  'utils/templates.js'
]

function bundle () {
  return MODULES.map(function (rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' +
      code + '\n});</script>'
  }).join('\n')
}

var RUNTIME = [
  'var __defs = {}, __cache = {};',
  'function __define(name, fn){ __defs[name] = fn }',
  'function __normalize(base, req){',
  '  if (req.charAt(0) !== ".") return req;',
  '  var parts = base.split("/"); parts.pop();',
  '  req.split("/").forEach(function(p){',
  '    if (p === ".") return;',
  '    if (p === "..") parts.pop(); else parts.push(p);',
  '  });',
  '  var out = parts.join("/");',
  '  return /\\.js$/.test(out) ? out : out + ".js";',
  '}',
  'function req(from){',
  '  return function(name){',
  '    var key = __normalize(from, name);',
  '    if (__cache[key]) return __cache[key].exports;',
  '    var fn = __defs[key];',
  '    if (!fn) throw new Error("module not found: " + key + " (from " + from + ")");',
  '    var m = { exports: {} };',
  '    __cache[key] = m;',
  '    fn(m, m.exports, req(key));',
  '    return m.exports;',
  '  }',
  '}',
  'function require(name){ return req("main.js")(name) }',
  'var __require = req("main.js");'
].join('\n')

var MAIN = fs.readFileSync(path.join(__dirname, 'preview-main.js'), 'utf8')

function build () {
  var html = '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
    '<title>桌牌模板渲染校验</title><style>' +
    'html,body{margin:0;background:#EFEBE3;font-family:-apple-system,"PingFang SC",sans-serif;}' +
    '.sheet{display:grid;grid-template-columns:repeat(3,260px);gap:28px 26px;padding:36px 40px 44px;}' +
    '.cell{display:flex;flex-direction:column;align-items:center;}' +
    'canvas{display:block;box-shadow:0 6px 20px rgba(42,39,36,.14);border-radius:4px;}' +
    '.cap{margin-top:10px;font-size:13px;color:#4A453D;letter-spacing:.5px;}' +
    '.cap span{color:#9A9386;font-size:11px;margin-left:6px;}' +
    '#result{display:none;}' +
    '</style></head><body><div class="sheet" id="sheet"></div>' +
    '<pre id="result">RUNNING</pre>' +
    '<script>' + RUNTIME + '</script>\n' + bundle() + '\n' +
    '<script>' + MAIN + '</script>' +
    '</body></html>'

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  var file = path.join(OUT_DIR, 'preview.html')
  fs.writeFileSync(file, html)
  console.log('生成: ' + file + ' (' + html.length + ' bytes)')
  return file
}

build()
