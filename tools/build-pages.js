/**
 * tools/build-pages.js —— 生成「首页 / 编辑页」的静态版式预览
 *
 * 注意：这不是模拟器运行结果，而是把 WXML 结构照搬成 HTML、
 * 把 WXSS 的 rpx 按 390px 视口换算成 px 后的静态复刻，
 * 用来检查排版、层级与配色。真实运行仍需微信开发者工具。
 *
 * 运行：node tools/build-pages.js
 */

var fs = require('fs')
var path = require('path')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(__dirname, 'out')
var SCALE = 390 / 750

var MODULES = [
  'utils/qrcode.js',
  'utils/wifi.js',
  'utils/qr-canvas.js',
  'utils/render.js',
  'utils/templates.js'
]

function rpx2px (css) {
  return css.replace(/([\d.]+)rpx/g, function (_, n) {
    return (parseFloat(n) * SCALE).toFixed(2) + 'px'
  })
}

function bundle () {
  return MODULES.map(function (rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' + code + '\n});</script>'
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
  'function req(from){ return function(name){',
  '  var key = __normalize(from, name);',
  '  if (__cache[key]) return __cache[key].exports;',
  '  var fn = __defs[key];',
  '  if (!fn) throw new Error("module not found: " + key);',
  '  var m = { exports: {} }; __cache[key] = m;',
  '  fn(m, m.exports, req(key));',
  '  return m.exports;',
  '}}',
  'var __require = req("main.js");'
].join('\n')

function baseCss (pageCss) {
  var app = rpx2px(fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8'))
    .replace(/^page\s*\{/m, 'html, body {')
  return app + '\n' + rpx2px(fs.readFileSync(pageCss, 'utf8')) + '\n' +
    'body{margin:0;-webkit-font-smoothing:antialiased;}' +
    'input{border:none;outline:none;background:transparent;font:inherit;width:100%;padding:0;}' +
    'input::placeholder{color:#c4bcae;}' +
    '*{box-sizing:border-box;}'
}

var templatesLib = require('../utils/templates')
var wifi = require('../utils/wifi')

var PAYLOAD = wifi.buildWifiString({ ssid: 'Shiguang-Cafe', password: 'coffee2024', type: 'WPA' }).value

function homeBody () {
  var cells = templatesLib.TEMPLATES.map(function (tpl, i) {
    return '<div class="cell">' +
      '<div class="canvas-box" style="background:' + tpl.palette.bg + '">' +
      '<canvas class="thumb" id="thumb-' + i + '" width="344" height="458" ' +
      'style="width:172px;height:229px"></canvas></div>' +
      '<div class="meta"><span class="tpl-name">' + tpl.name + '</span>' +
      '<span class="tpl-tag">' + tpl.tag + '</span></div></div>'
  }).join('')

  return '<div class="page">' +
    '<div class="hero"><div class="hero-title">Wi-Fi 桌牌</div>' +
    '<div class="hero-sub">挑一个样式，扫码就能连网</div></div>' +
    '<div class="grid">' + cells + '</div>' +
    '<div class="foot-link">二维码内核自检 ›</div>' +
    '<div class="foot-note">全部数据仅存本机 · 无网络请求 · v0.2.0</div>' +
    '</div>'
}

function homeScript () {
  return '<script>' + RUNTIME + '</script>' + bundle() + '<script>' +
    'var T = __require("utils/templates.js");' +
    'var R = __require("utils/render.js");' +
    'T.TEMPLATES.forEach(function(tpl, i){' +
    '  var c = document.getElementById("thumb-" + i);' +
    '  var ctx = c.getContext("2d"); ctx.scale(2,2);' +
    '  R.renderSign(ctx, tpl, {shopName:"拾光咖啡", ssid:"Shiguang-Cafe", payload:' + JSON.stringify(PAYLOAD) + '}, 172, 229);' +
    '});' +
    '</script>'
}

function editorBody () {
  return '<div class="page">' +
    '<div class="preview-card">' +
    '<canvas id="preview" width="582" height="776" style="width:291px;height:388px" class="preview"></canvas>' +
    '<div class="preview-tag">极简白</div>' +
    '</div>' +

    '<div class="form">' +
    '<div class="field"><text class="label">店名</text>' +
    '<input class="input" value="拾光咖啡" /></div>' +

    '<div class="field"><div class="label-row"><text class="label">Wi-Fi 名称</text>' +
    '<text class="counter">13/32 字节</text></div>' +
    '<input class="input" value="Shiguang-Cafe" /></div>' +

    '<div class="field"><div class="label-row"><text class="label">密码</text>' +
    '<text class="toggle">显示</text></div>' +
    '<input class="input" type="password" value="coffee2024" /></div>' +

    '<div class="field field-last"><text class="label">加密方式</text>' +
    '<div class="seg">' +
    '<div class="seg-item seg-item-on">WPA/WPA2</div>' +
    '<div class="seg-item">WEP</div>' +
    '<div class="seg-item">无密码</div>' +
    '</div></div>' +
    '</div>' +

    '<div class="status"><text class="status-dot"></text>' +
    '<text>已自动保存到本机 · ' + stamp() + '</text></div>' +
    '<div class="payload mono">' + escapeHtml(PAYLOAD) + '</div>' +
    '</div>'
}

function editorScript () {
  return '<script>' + RUNTIME + '</script>' + bundle() + '<script>' +
    'var T = __require("utils/templates.js");' +
    'var R = __require("utils/render.js");' +
    'var c = document.getElementById("preview");' +
    'var ctx = c.getContext("2d"); ctx.scale(2,2);' +
    'R.renderSign(ctx, T.TEMPLATES[0], {shopName:"拾光咖啡", ssid:"Shiguang-Cafe", payload:' + JSON.stringify(PAYLOAD) + '}, 291, 388);' +
    '</script>'
}

function stamp () {
  var d = new Date()
  var p = function (n) { return n < 10 ? '0' + n : '' + n }
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

function escapeHtml (s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function page (title, css, body, script) {
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + title +
    '</title><style>' + css + '</style></head><body>' + body + script + '</body></html>'
}

function build () {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  var home = page('首页', baseCss(path.join(ROOT, 'pages/index/index.wxss')), homeBody(), homeScript())
  var editor = page('编辑页', baseCss(path.join(ROOT, 'pages/editor/editor.wxss')), editorBody(), editorScript())

  fs.writeFileSync(path.join(OUT, 'page-home.html'), home)
  fs.writeFileSync(path.join(OUT, 'page-editor.html'), editor)

  var index = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>页面版式预览</title>' +
    '<style>html,body{margin:0;background:#E7E2D8;font-family:-apple-system,"PingFang SC",sans-serif;}' +
    '.row{display:flex;gap:44px;padding:34px 40px;align-items:flex-start;}' +
    '.phone{width:390px;height:844px;background:#fff;border-radius:18px;overflow:hidden;' +
    'box-shadow:0 10px 34px rgba(42,39,36,.16);}' +
    '.frame{display:flex;flex-direction:column;align-items:center;gap:10px;}' +
    '.tag{font-size:12px;color:#6B6459;letter-spacing:.5px;}' +
    'iframe{width:390px;height:844px;border:0;display:block;}' +
    '</style></head><body><div class="row">' +
    '<div class="frame"><div class="phone"><iframe src="page-home.html"></iframe></div>' +
    '<div class="tag">首页 · 6 套模板两列网格</div></div>' +
    '<div class="frame"><div class="phone"><iframe src="page-editor.html"></iframe></div>' +
    '<div class="tag">编辑页 · 实时预览 + 表单</div></div>' +
    '</div></body></html>'

  fs.writeFileSync(path.join(OUT, 'pages.html'), index)
  console.log('生成: page-home.html / page-editor.html / pages.html')
}

build()
