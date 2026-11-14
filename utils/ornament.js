/**
 * utils/ornament.js
 * 装饰纹样的加载与染色。
 *
 * 资产是纯 alpha 剪影（RGB 全黑），颜色不能烘死在图里——
 * 同一枚花饰在深底模板上要米白、在浅底模板上要墨黑。
 * 所以这里离屏合成一层「按色染好的图」，按 (key, color) 缓存，
 * 渲染时只做一次 drawImage，主绘制路径保持同步。
 *
 * 未加载完时 draw() 返回 false：调用方（页面）应先 await ensure()。
 */

var ornaments = require('../assets/ornaments/index')

/* key|color → { image, w, h } */
var cache = {}
/* key → 黑色剪影原图 */
var raw = {}
/* key → 白色剪影原图（离屏不可用时的兜底） */
var rawLight = {}
/* key → Promise */
var pending = {}

/* 深色底/浅色底的分界：palette 里 bg 的相对亮度低于它就取白色剪影 */
var LUMINANCE_SPLIT = 0.42

function srcOf (file) {
  /* 小程序里 file 是包内绝对路径；无头浏览器 harness 需要前缀 */
  var prefix = typeof window !== 'undefined' && window.__ORN_PREFIX ? window.__ORN_PREFIX : ''
  return prefix + file
}

/** #RRGGBB → 相对亮度（与 templates/qa.js 同一套 sRGB 线性化） */
function luminanceOf (hex) {
  var h = String(hex || '').replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  var v = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]
    .map(function (c) {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}

function newImage (src) {
  return new Promise(function (resolve, reject) {
    var img = null
    if (typeof Image !== 'undefined') img = new Image()
    else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage()
    if (!img) { reject(new Error('no image api')); return }
    img.onload = function () { resolve(img) }
    img.onerror = function (e) { reject(e || new Error('load fail ' + src)) }
    img.src = src
  })
}

/** 离屏画布：小程序用 wx.createOffscreenCanvas，浏览器用 document.createElement */
function offscreen (w, h) {
  if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
    try {
      var c = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
      if (c) return c
    } catch (e) { /* 老基础库回落 */ }
  }
  if (typeof document !== 'undefined') {
    var d = document.createElement('canvas')
    d.width = w
    d.height = h
    return d
  }
  return null
}

/** 把黑色剪影染成指定颜色 */
function tint (img, key, color) {
  var w = img.width
  var h = img.height
  var c = offscreen(w, h)
  if (!c) return null
  var ctx = c.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  return { image: c, w: w, h: h }
}

function load (key) {
  if (raw[key]) return Promise.resolve(raw[key])
  if (pending[key]) return pending[key]
  var o = ornaments.getOrnament(key)
  if (!o) return Promise.resolve(null)
  /* 两份剪影一起取：能染色就用黑的，不能染色就按底色挑现成的 */
  pending[key] = Promise.all([
    newImage(srcOf(o.file)).catch(function () { return null }),
    o.lightFile ? newImage(srcOf(o.lightFile)).catch(function () { return null }) : Promise.resolve(null)
  ]).then(function (imgs) {
    if (!imgs[0]) { delete pending[key]; return null }
    raw[key] = imgs[0]
    if (imgs[1]) rawLight[key] = imgs[1]
    delete pending[key]
    return imgs[0]
  }).catch(function (e) {
    delete pending[key]
    console.warn('[ornament] 加载失败 ' + key + ' ' + (e && e.message ? e.message : e))
    return null
  })
  return pending[key]
}

/**
 * 预加载一组模板需要的全部纹样。
 * @param {Array} tpls 模板数组
 * @returns {Promise<number>} 成功加载的件数
 */
function ensure (tpls) {
  var keys = {}
  ;(tpls || []).forEach(function (t) {
    (t.motifs || []).forEach(function (m) {
      /* 只认 fleuron。欧式签名纹样 ornament 是线框，不是图片，
         混进来会去加载一个不存在的 key。 */
      if (m.type === 'fleuron' && m.key) keys[m.key] = 1
    })
  })
  var list = Object.keys(keys)
  if (!list.length) return Promise.resolve(0)
  return Promise.all(list.map(load)).then(function (imgs) {
    var n = 0
    imgs.forEach(function (i) { if (i) n++ })
    return n
  })
}

/**
 * 同步绘制。染色结果按 (key,color) 缓存，重复调用不再合成。
 * @returns {boolean} 是否真的画出来了
 */
function draw (ctx, key, color, x, y, w, h, alpha) {
  var ck = key + '|' + color
  var entry = cache[ck]
  if (!entry) {
    var img = raw[key]
    if (!img) return false
    entry = tint(img, key, color)
    if (!entry) {
      /* 离屏画布不可用（老基础库没有 wx.createOffscreenCanvas）：
         退到预先烘好的两份剪影，按底色明暗挑一份。
         颜色只能近似，但花饰不会整层消失。 */
      var light = luminanceOf(color) < LUMINANCE_SPLIT
      entry = { image: light ? (rawLight[key] || img) : img, w: img.width, h: img.height }
      if (!rawLight[key] && !light) entry = { image: img, w: img.width, h: img.height }
    }
    cache[ck] = entry
  }

  var prev = ctx.globalAlpha
  if (alpha != null) ctx.globalAlpha = prev * alpha

  var okDraw = true
  try {
    ctx.drawImage(entry.image, x, y, w, h)
  } catch (e) {
    okDraw = false
  }

  /* 无论成功与否都要还原：中途抛错时若把 globalAlpha 留在 0.4，
     后面整张桌牌的文字都会变淡 */
  ctx.globalAlpha = prev
  return okDraw
}

function stats () {
  return { raw: Object.keys(raw).length, tinted: Object.keys(cache).length }
}

module.exports = {
  ORNAMENTS: ornaments.ORNAMENTS,
  getOrnament: ornaments.getOrnament,
  ensure: ensure,
  draw: draw,
  load: load,
  stats: stats,
  clear: function () { cache = {}; raw = {}; pending = {} }
}