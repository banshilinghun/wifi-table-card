/**
 * tools/build-screens.js —— 把小程序页面真正「跑起来」再截图
 *
 * 这不是静态复刻。流程是：
 *   1. 编译 WXML：解析标签树 → 生成渲染函数（支持 wx:for / wx:if / wx:elif /
 *      wx:else / {{}} 插值，表达式用 with(scope) 求值）
 *   2. 注入一个 wx 运行时：storage、createSelectorQuery、getWindowInfo、
 *      setNavigationBarTitle、navigateTo… 全部本地桩实现
 *   3. 直接执行 pages/**\/index.js 原文，调用 onLoad / onReady，
 *      点击类交互走页面自己的方法（如 openDrawer）
 *   4. 页面里的 canvas 是真实 <canvas>，renderSign 是真的在画
 *   5. 无头 Chrome 截图 + 把 console 与断言写进 #report
 *
 * 它替代不了微信模拟器：样式解析、原生组件、真机字体都与真机有差异。
 * 但 WXML 编译、setData、页面生命周期、Canvas 绘制这四件事是真的。
 *
 * 运行：node tools/build-screens.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT = path.join(__dirname, 'out')
var VIEW_W = 390
var SCALE = VIEW_W / 750

var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/* ══════════════════════════════════════════════════════════
 *  1. WXML 编译器
 * ══════════════════════════════════════════════════════════ */

var TAG_MAP = {
  view: 'div',
  text: 'span',
  canvas: 'canvas',
  input: 'input',
  'scroll-view': 'div',
  image: 'img',
  block: '#fragment',
  button: 'div'
}

function parseAttrs (raw) {
  var attrs = {}
  var re = /([a-zA-Z0-9_:\-.]+)(?:\s*=\s*"([^"]*)")?/g
  var m
  while ((m = re.exec(raw))) {
    attrs[m[1]] = m[2] === undefined ? '' : m[2]
  }
  return attrs
}

/** 从标签内部找结束的 '>'，跳过引号内的内容（属性里可能有 {{a > b}}） */
function findTagEnd (src, start) {
  var quote = null
  for (var i = start; i < src.length; i++) {
    var ch = src.charAt(i)
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '>') return i
  }
  return -1
}

function parse (src) {
  var i = 0
  var root = { tag: '#root', attrs: {}, children: [] }
  var stack = [root]

  while (i < src.length) {
    if (src.charAt(i) === '<') {
      if (src.substr(i, 4) === '<!--') {
        var cend = src.indexOf('-->', i)
        i = cend === -1 ? src.length : cend + 3
        continue
      }
      if (src.charAt(i + 1) === '/') {
        var close = src.indexOf('>', i)
        if (stack.length > 1) stack.pop()
        i = close + 1
        continue
      }
      var end = findTagEnd(src, i)
      if (end === -1) break
      var raw = src.slice(i + 1, end)
      var selfClose = /\/\s*$/.test(raw)
      if (selfClose) raw = raw.replace(/\/\s*$/, '')
      var nameMatch = raw.match(/^([a-zA-Z0-9-]+)/)
      if (!nameMatch) { i = end + 1; continue }
      var tag = nameMatch[1]
      var node = { tag: tag, attrs: parseAttrs(raw.slice(tag.length)), children: [] }
      stack[stack.length - 1].children.push(node)
      if (!selfClose) stack.push(node)
      i = end + 1
    } else {
      var next = src.indexOf('<', i)
      if (next === -1) next = src.length
      var text = src.slice(i, next)
      if (text.trim() || text.indexOf('{{') !== -1) {
        stack[stack.length - 1].children.push({ tag: '#text', text: text })
      }
      i = next
    }
  }

  return root
}

function has (node, name) {
  return Object.prototype.hasOwnProperty.call(node.attrs, name)
}

function attr (node, name) {
  return has(node, name) ? node.attrs[name] : null
}

/** 从 "{{ expr }}" 里取出表达式；不是插值就当作字符串字面量 */
function expr (raw) {
  if (raw == null) return '""'
  var m = String(raw).match(/^\s*\{\{([\s\S]*?)\}\}\s*$/)
  if (m) return '(' + m[1] + ')'
  return JSON.stringify(raw)
}

/** 把带插值的字符串编译成 JS 表达式 */
function interp (raw) {
  if (raw == null) return '""'
  var parts = []
  var re = /\{\{([\s\S]*?)\}\}/g
  var last = 0
  var m
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push(JSON.stringify(raw.slice(last, m.index)))
    parts.push('(' + m[1] + ')')
    last = m.index + m[0].length
  }
  if (last < raw.length) parts.push(JSON.stringify(raw.slice(last)))
  if (!parts.length) return '""'
  return parts.length === 1 ? parts[0] : '(' + parts.join(' + ') + ')'
}

function tagOf (node) {
  return TAG_MAP[node.tag] || 'div'
}

function openTagSrc (node) {
  var attrs = []
  var cls = attr(node, 'class')
  var style = attr(node, 'style')
  var id = attr(node, 'id')

  if (id != null) attrs.push('id: ' + interp(id))
  if (cls != null) attrs.push('class: ' + interp(cls))
  if (style != null) attrs.push('style: ' + interp(style))
  if (node.tag === 'scroll-view') attrs.push('"data-sv": ' + JSON.stringify(has(node, 'scroll-x') ? 'x' : 'y'))
  if (node.tag === 'input') {
    if (has(node, 'value')) attrs.push('value: ' + interp(attr(node, 'value')))
    if (has(node, 'placeholder')) attrs.push('placeholder: ' + interp(attr(node, 'placeholder')))
    if (has(node, 'password')) attrs.push('type: (' + interp(attr(node, 'password')) + ' ? "password" : "text")')
    attrs.push('"data-input": "1"')
  }
  if (node.tag === 'canvas') attrs.push('"data-canvas": "1"')

  return '__o.push(__open(' + JSON.stringify(tagOf(node)) + ', {' + attrs.join(', ') + '}))'
}

function buildNodes (list, out) {
  for (var k = 0; k < list.length; k++) {
    var node = list[k]

    if (node.tag === '#text') {
      out.push('__o.push(__esc(' + interp(node.text) + '))')
      continue
    }

    if (node.tag === '#fragment' || TAG_MAP[node.tag] === '#fragment') {
      buildNodes(node.children, out)
      continue
    }

    // wx:for 优先
    if (has(node, 'wx:for')) {
      var itemName = attr(node, 'wx:for-item') || 'item'
      var indexName = attr(node, 'wx:for-index') || 'index'
      out.push(';(function(){var __l=' + expr(attr(node, 'wx:for')) + '||[];')
      out.push('for(var __i=0;__i<__l.length;__i++){')
      out.push('var ' + itemName + '=__l[__i];var ' + indexName + '=__i;')
      out.push(openTagSrc(node))
      buildNodes(node.children, out)
      out.push('__o.push(' + JSON.stringify('</' + tagOf(node) + '>') + ');')
      out.push('}})();')
      continue
    }

    // wx:if / wx:elif / wx:else 链
    if (has(node, 'wx:if')) {
      var chain = [{ node: node, cond: expr(attr(node, 'wx:if')) }]
      var j = k + 1
      while (j < list.length) {
        var sib = list[j]
        if (sib.tag === '#text' && !sib.text.trim()) { j++; continue }
        if (sib.tag === '#text') break
        if (has(sib, 'wx:elif')) { chain.push({ node: sib, cond: expr(attr(sib, 'wx:elif')) }); j++; continue }
        if (has(sib, 'wx:else')) { chain.push({ node: sib, cond: null }); j++; break }
        break
      }
      chain.forEach(function (entry, ci) {
        if (ci === 0) out.push('if(' + entry.cond + '){')
        else if (entry.cond === null) out.push('}else{')
        else out.push('}else if(' + entry.cond + '){')
        if (tagOf(entry.node) === 'input') {
          out.push(openTagSrc(entry.node))
        } else {
          out.push(openTagSrc(entry.node))
          buildNodes(entry.node.children, out)
          out.push('__o.push(' + JSON.stringify('</' + tagOf(entry.node) + '>') + ');')
        }
      })
      out.push('}')
      k = j - 1
      continue
    }

    // 普通节点
    out.push(openTagSrc(node))
    if (tagOf(node) !== 'input') {
      buildNodes(node.children, out)
      out.push('__o.push(' + JSON.stringify('</' + tagOf(node) + '>') + ');')
    }
  }
}

function compileWXML (src) {
  var tree = parse(src)
  var out = ['var __o=[];']
  buildNodes(tree.children, out)
  out.push('return __o.join("")')
  return new Function('__s', '__open', '__esc', 'with(__s){' + out.join('\n') + '}')
}

/* ══════════════════════════════════════════════════════════
 *  2. 浏览器侧运行时（会被序列化进页面）
 * ══════════════════════════════════════════════════════════ */

function browserRuntime () {
  var R = window.__MP || {}
  var report = { logs: [], errors: [], checks: [] }

  window.__report = report

  ;['log', 'warn', 'error', 'info'].forEach(function (level) {
    var orig = console[level]
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments).map(function (a) {
        return typeof a === 'string' ? a : JSON.stringify(a)
      })
      report.logs.push('[' + level + '] ' + args.join(' '))
      orig.apply(console, arguments)
    }
  })

  window.onerror = function (msg, src, line, col, err) {
    report.errors.push('onerror: ' + msg + ' @' + line + ':' + col)
  }
  window.addEventListener('unhandledrejection', function (e) {
    report.errors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason))
  })

  R.esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  R.open = function (tag, attrs) {
    var s = '<' + tag
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue
      var v = attrs[k]
      if (v == null || v === false) continue
      if (k === 'style') {
        v = String(v).replace(/([\d.]+)rpx/g, function (_, n) {
          return (parseFloat(n) * window.__MP_SCALE).toFixed(2) + 'px'
        })
      }
      s += ' ' + k + '="' + R.esc(v) + '"'
    }
    return s + '>'
  }

  var store = window.__MP_STORAGE || {}

  window.wx = {
    getStorageSync: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : ''
    },
    setStorageSync: function (key, value) {
      store[key] = value
      report.logs.push('[storage] ' + key + ' ← ' + JSON.stringify(value).slice(0, 120))
    },
    removeStorageSync: function (key) { delete store[key] },
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 2, safeArea: { top: 0, bottom: 844 } }
    },
    getSystemInfoSync: function () {
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 2 }
    },
    setNavigationBarTitle: function (o) {
      report.logs.push('[nav] ' + (o && o.title))
    },
    navigateTo: function (o) {
      report.logs.push('[navigateTo] ' + (o && o.url))
    },
    showToast: function (o) {
      report.logs.push('[toast] ' + (o && o.title))
    },
    nextTick: function (fn) { setTimeout(fn, 0) },

    createSelectorQuery: function () {
      var q = { all: false, sel: '', page: null }
      q.in = function (p) { q.page = p; return q }
      q.select = function (s) { q.all = false; q.sel = s; return q }
      q.selectAll = function (s) { q.all = true; q.sel = s; return q }
      q.fields = function () { return q }
      q.exec = function (cb) {
        setTimeout(function () {
          var root = document.getElementById('mp-root')
          var list = q.all
            ? Array.prototype.slice.call(root.querySelectorAll(q.sel))
            : [root.querySelector(q.sel)].filter(Boolean)
          var mapped = list.map(function (el) {
            var rect = el.getBoundingClientRect()
            return { node: el, width: rect.width, height: rect.height, id: el.id }
          })
          cb([q.all ? mapped : mapped[0]])
        }, 0)
      }
      return q
    }
  }

  function setPath (obj, key, value) {
    if (key.indexOf('.') === -1) { obj[key] = value; return }
    var parts = key.split('.')
    var cur = obj
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {}
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = value
  }

  function render (inst) {
    var root = document.getElementById('mp-root')
    var olds = Array.prototype.slice.call(root.querySelectorAll('canvas'))
    var snapshots = olds.map(function (c) {
      return { w: c.width, h: c.height, node: c }
    })

    root.innerHTML = R.render(inst.data)

    // setData 不重建画布：把上一帧的位图搬过来（否则每次 setData 都会白屏）
    var fresh = root.querySelectorAll('canvas')
    for (var i = 0; i < fresh.length; i++) {
      var snap = snapshots[i]
      if (!snap || !snap.w || !snap.h) continue
      var dst = fresh[i]
      dst.width = snap.w
      dst.height = snap.h
      try { dst.getContext('2d').drawImage(snap.node, 0, 0, snap.w, snap.h) } catch (e) {}
    }
  }

  R.createPage = function (config, query) {
    var inst = {}
    for (var k in config) {
      if (Object.prototype.hasOwnProperty.call(config, k)) inst[k] = config[k]
    }
    inst.data = JSON.parse(JSON.stringify(config.data || {}))
    inst.route = window.__MP_CONFIG.route

    inst.setData = function (patch, cb) {
      if (patch) {
        for (var key in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) setPath(inst.data, key, patch[key])
        }
      }
      render(inst)
      if (cb) setTimeout(function () { cb() }, 0)
    }

    return inst
  }

  window.__mpLog = function () {
    report.logs.push(Array.prototype.slice.call(arguments).map(function (a) {
      return typeof a === 'string' ? a : JSON.stringify(a)
    }).join(' '))
  }
}

/* ══════════════════════════════════════════════════════════
 *  3. 组装
 * ══════════════════════════════════════════════════════════ */

var LIB = require(path.join(__dirname, '..', 'templates', 'library.js'))

var MODULES = [
  'templates/index.js',
  'templates/taxonomy.js',
  'templates/qa.js',
  'templates/factory.js',
  'templates/library.js',
  'assets/ornaments/index.js',
  'utils/ornament.js',
  'utils/wifi.js',
  'utils/qrcode.js',
  'utils/qr-canvas.js',
  'utils/render.js',
  'utils/filters.js',
  'utils/store.js'
]

function bundle () {
  return MODULES.map(function (rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    return '<script>__define(' + JSON.stringify(rel) + ', function(module, exports, require){\n' + code + '\n});</script>'
  }).join('\n')
}

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

function rpx2px (css) {
  return css.replace(/([\d.]+)rpx/g, function (_, n) {
    return (parseFloat(n) * SCALE).toFixed(2) + 'px'
  })
}

var BASE_CSS = [
  // macOS 上 Chrome 窗口最小宽度 500px，直接按 390 截图会裁掉右边。
  // 做法：把文档固定在 390px 并居中，截图后再居中裁成 390px 宽。
  'html,body{margin:0 auto;width:' + VIEW_W + 'px;background:#0a0b0d;}',
  'body{font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif;',
  '-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}',
  'div,canvas,pre{display:block;}',
  'span{display:inline;}',
  'input{border:none;outline:none;background:transparent;font:inherit;width:100%;padding:0;color:inherit;}',
  'input::placeholder{color:#4a4f57;}',
  '[data-sv="x"]{overflow-x:auto;overflow-y:hidden;}',
  '[data-sv="y"]{overflow-y:auto;overflow-x:hidden;}',
  '[data-sv]::-webkit-scrollbar{display:none;}',
  // fixed 元素也跟着 390px 居中，否则抽屉会按 500px 视口铺开
  '.mask,.drawer{left:calc((100vw - ' + VIEW_W + 'px) / 2)!important;right:auto!important;width:' + VIEW_W + 'px!important;}',
  '#report{position:fixed;left:-9999px;top:0;white-space:pre-wrap;font:11px/1.5 monospace;}',
  '*{transition:none!important;animation:none!important;}',
  '*{box-sizing:border-box;}'
].join('\n')

function pageCss (pagePath) {
  var app = rpx2px(fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8'))
    .replace(/^page\s*\{/m, 'html, body {')
  var own = rpx2px(fs.readFileSync(path.join(ROOT, pagePath + '.wxss'), 'utf8'))
  return BASE_CSS + '\n' + app + '\n' + own
}

var DRIVER = function () {
  var cfg = window.__MP_CONFIG
  var report = window.__report
  var root = document.getElementById('mp-root')
  var query = cfg.query || {}

  function fail (where, e) {
    report.errors.push(where + ': ' + (e && e.message ? e.message : String(e)))
  }

  var inst
  try {
    inst = window.__MP.createPage(window.__PAGE_CONFIG, query)
  } catch (e) {
    fail('createPage', e)
    finish()
    return
  }

  try {
    if (inst.onLoad) inst.onLoad(query)
  } catch (e) { fail('onLoad', e) }

  setTimeout(function () {
    try {
      if (inst.onReady) inst.onReady()
    } catch (e) { fail('onReady', e) }

    setTimeout(function () {
      (cfg.actions || []).forEach(function (a) {
        try {
          if (typeof inst[a] === 'function') inst[a]()
          else report.errors.push('action not found: ' + a)
        } catch (e) { fail(a, e) }
      })
      setTimeout(finish, 900)
    }, 420)
  }, 80)

  function canvasStats () {
    var list = Array.prototype.slice.call(root.querySelectorAll('canvas'))
    return list.map(function (c, i) {
      var stat = { i: i, css: c.getBoundingClientRect().width + 'x' + c.getBoundingClientRect().height, w: c.width, h: c.height }
      try {
        var ctx = c.getContext('2d')
        var d = ctx.getImageData(0, 0, c.width, c.height).data
        var ink = 0
        for (var p = 0; p < d.length; p += 4 * 37) {
          if (d[p] < 240 || d[p + 1] < 240 || d[p + 2] < 240) ink++
        }
        stat.ink = +(ink / (d.length / (4 * 37))).toFixed(3)
      } catch (e) {
        stat.ink = -1
      }
      return stat
    })
  }

  function finish () {
    try {
      var stats = canvasStats()
      report.canvas = stats
      report.blank = stats.filter(function (s) { return s.ink <= 0.02 }).length
      report.text = (root.innerText || '').replace(/\s+/g, ' ').slice(0, 260)
      report.nodes = root.querySelectorAll('*').length
      report.docHeight = Math.ceil(root.scrollHeight)
      report.docWidth = Math.ceil(root.scrollWidth)
    } catch (e) { fail('finish', e) }

    var pre = document.getElementById('report')
    pre.textContent = JSON.stringify(report, null, 1)
    document.title = 'ready:' + report.errors.length
  }
}

function buildPage (cfg) {
  var pageJs = fs.readFileSync(path.join(ROOT, cfg.route + '.js'), 'utf8')
  var wxml = fs.readFileSync(path.join(ROOT, cfg.route + '.wxml'), 'utf8')

  var renderFn = compileWXML(wxml)
  var renderSrc = renderFn.toString()

  var config = {
    name: cfg.name,
    route: cfg.route,
    query: cfg.query || {},
    actions: cfg.actions || []
  }

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<title>' + cfg.name + '</title>' +
    '<style>' + pageCss(cfg.route) + '</style></head><body>' +
    '<div id="mp-root"></div><pre id="report"></pre>' +
    '<script>' + loader + '</script>' +
    '<script>window.__MP = {}; window.__MP_CONFIG = ' + JSON.stringify(config) + ';' +
    'window.__MP_SCALE = ' + SCALE + ';' +
    /* 资产按包内绝对路径引用，无头浏览器里要补成 file:// 前缀 */
    'window.__ORN_PREFIX = ' + JSON.stringify('file://' + ROOT + '/') + ';' +
    'window.__MP_STORAGE = ' + JSON.stringify(cfg.storage || {}) + ';' +
    '(' + browserRuntime.toString() + ')();' +
    'window.__MP.render = (function(){ var f = ' + renderSrc + ';' +
    ' return function(d){ return f(d, window.__MP.open, window.__MP.esc) } })();' +
    '</script>' +
    bundle() +
    '<script>function Page(c){ window.__PAGE_CONFIG = c }</script>' +
    '<script>(function(){\n' +
    '  var module = { exports: {} };\n' +
    '  var require = __req(' + JSON.stringify(cfg.route + '.js') + ');\n' +
    '  (function(module, exports, require){\n' + pageJs + '\n  })(module, module.exports, require);\n' +
    '})();</script>' +
    '<script>(' + DRIVER.toString() + ')();</script>' +
    '</body></html>'
}

function shoot (file, viewH, outPng) {
  var args = [
    '--headless=new', '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--no-first-run', '--force-device-scale-factor=2',
    '--user-data-dir=/tmp/cr-mp-' + Math.random().toString(36).slice(2, 8),
    '--window-size=500,' + viewH,
    '--virtual-time-budget=5000',
    '--screenshot=' + outPng,
    'file://' + file
  ]
  execFileSync(CHROME, args, { stdio: 'ignore' })

  // 截图是 1000 × 2h（窗口最小 500 宽），内容居中排 390，居中裁掉两侧
  var tmp = outPng.replace(/\.png$/, '.tmp.png')
  execFileSync('sips', ['-c', String(viewH * 2), String(VIEW_W * 2), outPng, '--out', tmp], { stdio: 'ignore' })
  fs.renameSync(tmp, outPng)
}

function dumpReport (file) {
  var args = [
    '--headless=new', '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--no-first-run', '--force-device-scale-factor=2',
    '--user-data-dir=/tmp/cr-mp-' + Math.random().toString(36).slice(2, 8),
    '--window-size=390,844',
    '--virtual-time-budget=5000',
    '--dump-dom',
    'file://' + file
  ]
  var dom = execFileSync(CHROME, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  var m = dom.match(/<pre id="report">([\s\S]*?)<\/pre>/)
  if (!m) return null
  var text = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  try { return JSON.parse(text) } catch (e) { return { raw: text } }
}

var SCREENS = [
  {
    name: 'home',
    route: 'pages/index/index',
    size: [390, 844],
    storage: {}
  },
  {
    name: 'home-full',
    route: 'pages/index/index',
    size: [390, 844],
    autoHeight: true,
    storage: {}
  },
  {
    name: 'drawer',
    route: 'pages/index/index',
    size: [390, 844],
    storage: {
      wifi_filters: { scene: 'all', shapes: ['1:1', '1:1.4'], prints: [], moods: ['自然'], regions: ['日式'] }
    },
    actions: ['openDrawer']
  },
  {
    name: 'editor-portrait',
    route: 'pages/editor/editor',
    query: { tpl: 'night-berth' },
    size: [390, 844],
    storage: {
      wifi_draft: {
        tplId: 'night-berth',
        printKey: 'a5',
        shopName: '拾光民宿',
        ssid: 'Shiguang-Guest',
        password: 'stay2026',
        type: 'WPA',
        updatedAt: 0
      }
    }
  },
  {
    name: 'editor-card',
    route: 'pages/editor/editor',
    query: { tpl: 'morning-mist' },
    size: [390, 844],
    storage: {
      wifi_draft: {
        tplId: 'morning-mist',
        printKey: 'a5land',
        shopName: '拾光咖啡',
        ssid: 'Shiguang-Cafe',
        password: 'coffee2024',
        type: 'WPA',
        showPassword: true,
        updatedAt: 0
      }
    }
  },
  {
    name: 'home-empty',
    route: 'pages/index/index',
    size: [390, 844],
    storage: {
      wifi_filters: { scene: 'all', shapes: ['1:2'], prints: ['mini'], moods: ['自然'], regions: [] }
    }
  },
  {
    name: 'editor-center',
    route: 'pages/editor/editor',
    query: { tpl: 'still-water' },
    size: [390, 844],
    storage: {
      wifi_draft: {
        tplId: 'still-water',
        printKey: 'mini',
        shopName: '静水理疗',
        ssid: 'StillWater',
        password: 'care2026',
        type: 'WPA',
        showPassword: true,
        updatedAt: 0
      }
    }
  }
]

function main () {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  /* 用生成库第一页里的一条，跑通「工厂模板 → 编辑器」这条路：
     页面靠 library.find(id) 找回模板，找不到就只能回落精选。 */
  var gen = LIB.generated(0).filter(function (t) { return t.prints.length > 1 })[0] || LIB.generated(0)[0]
  if (gen) {
    SCREENS.push({
      name: 'editor-generated',
      route: 'pages/editor/editor',
      query: { tpl: gen.id },
      size: [390, 844],
      storage: {
        wifi_draft: {
          tplId: gen.id,
          printKey: gen.prints[gen.prints.length - 1],
          shopName: '拾光咖啡',
          ssid: 'Shiguang-Cafe-Guest-2026',
          password: 'coffee2026!!',
          type: 'WPA',
          showPassword: true,
          updatedAt: 0
        }
      }
    })
    console.log('生成模板样本: ' + gen.id + ' ' + gen.name + ' ' + gen.shape + ' ' + gen.prints.join('+'))
  }

  var summary = []

  SCREENS.forEach(function (cfg) {
    var html = buildPage(cfg)
    var file = path.join(OUT, 'screen-' + cfg.name + '.html')
    fs.writeFileSync(file, html)

    var png = path.join(OUT, cfg.name + '.png')
    var report = dumpReport(file)
    var viewH = cfg.autoHeight
      ? Math.max(844, Math.min(3200, (report && report.docHeight) || 844))
      : cfg.size[1]
    shoot(file, viewH, png)

    summary.push({ name: cfg.name, report: report, png: png })
    console.log('\n── ' + cfg.name + ' ──')
    if (!report) {
      console.log('  报告缺失')
      return
    }
    console.log('  errors: ' + (report.errors || []).length)
    ;(report.errors || []).forEach(function (e) { console.log('    ✗ ' + e) })
    console.log('  canvas: ' + (report.canvas || []).map(function (c) {
      return c.css + ' ink=' + c.ink
    }).join(' | '))
    console.log('  text: ' + (report.text || '').slice(0, 120))
  })

  fs.writeFileSync(path.join(OUT, 'screens.json'), JSON.stringify(summary, null, 2))
  console.log('\n输出目录: tools/out')
}

main()