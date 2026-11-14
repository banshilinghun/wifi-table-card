/**
 * templates/library.js
 * 对外的模板库入口：手写精选 + 工厂生成，按页取用。
 *
 * 为什么要分页：缩略图是真在 canvas 上一个一个画的，
 * 一屏画 200 个会把主线程压死。页面只调 get(offset, limit)，
 * 工厂按同一 seed 复现同一页，刷新不串位。
 *
 * 手写库（templates/index.js 那 10 套）排在最前面——那是人眼挑过的；
 * 工厂库补的是维度覆盖。
 */

var lib = require('./index')
var factory = require('./factory')
var tax = require('./taxonomy')

var BASE_SEED = 20261114
var PAGE_SIZE = 24
var MAX_PAGES = 40

var pages = {}

/** 精选库占掉的前若干个名字槽位 */
var HAND_OFFSET = lib.TEMPLATES.length

function curated () {
  return lib.TEMPLATES
}

/**
 * 第 index 页的生成模板（0 基）。结果缓存：
 * generate() 每条都要跑一遍 QA，不能每画一个缩略图就重算。
 */
function generated (index, size) {
  var n = size || PAGE_SIZE
  var key = index + ':' + n
  if (pages[key]) return pages[key]

  var res = factory.generate({
    keep: n,
    seed: BASE_SEED + index * 100003,
    /* 序号按「全局槽位」密排：10 条精选之后每页 24 个。
       40 页 = 970 个槽位，落在名字的一个周期（1120）内，不会回绕。
       早先按页跨 560 取号，两页正好差一个周期，名字成对重复。 */
    indexBase: HAND_OFFSET + index * PAGE_SIZE,
    tierBase: 0
  })
  var list = res.templates

  /* 工厂在极端 seed 下可能凑不满一页，向后借一页补上 */
  if (list.length < n && index + 1 < MAX_PAGES) {
    var extra = factory.generate({
      keep: n - list.length,
      seed: BASE_SEED + (index + 1) * 100003,
      /* 借来的那半页走后缀档 1，不与本页或下一页的档 0 相撞 */
      indexBase: HAND_OFFSET + (index + 1) * PAGE_SIZE,
      tierBase: 1
    })
    list = list.concat(extra.templates)
  }

  pages[key] = list
  return list
}

/**
 * 取一段模板。
 * hard：utils/filters 里的「过滤」类条件（shapes / prints / scene）。
 * 带 hard 时精选库也要过一遍——否则勾了「迷你」还会冒出 A4 的手写模板。
 */
function get (offset, limit, hard) {
  var off = offset || 0
  var lim = limit || PAGE_SIZE
  var h = hard || {}
  var out = []

  if (!h.active) {
    var hand = curated()
    for (var i = 0; i < lim; i++) {
      var k = off + i
      if (k < hand.length) { out.push(hand[k]); continue }
      var gk = k - hand.length
      var pageIndex = Math.floor(gk / PAGE_SIZE)
      if (pageIndex >= MAX_PAGES) break
      var tpl = generated(pageIndex)[gk % PAGE_SIZE]
      if (tpl) out.push(tpl)
    }
    return out
  }

  /* 有硬条件：精选先过一遍，不够再从生成器按需长 */
  var hand2 = curated().filter(function (t) { return matches(t, h) })
  /* 形状 × 规格无交集时，工厂白跑一轮要几百毫秒——先问一句 */
  if (!factory.possible({ shapes: h.shapes, prints: h.prints })) return hand2
  for (var j = 0; j < lim; j++) {
    var idx = off + j
    if (idx < hand2.length) { out.push(hand2[idx]); continue }
    var need = lim - out.length
    var batch = factory.generate({
      keep: need,
      seed: BASE_SEED + 7919 * (idx + 1),
      /* 硬条件流走后缀档 2，与分页流的档 0 天然不撞名 */
      indexBase: idx,
      tierBase: 2,
      only: {
        shapes: h.shapes, prints: h.prints, scene: h.scene,
        regions: h.regions, densities: h.densities
      }
    })
    var got = batch.templates.filter(function (t) { return matches(t, h) })
    if (!got.length) break
    out.push(got[0])
  }
  return out
}

/** 硬条件判定（与 utils/filters.passes 同语义，这里不依赖它以免循环引用） */
function matches (t, h) {
  if (h.scene && h.scene !== 'all') {
    var sc = Array.isArray(t.scene) ? t.scene : [t.scene]
    if (sc.indexOf(h.scene) === -1) return false
  }
  if (h.shapes && h.shapes.length && h.shapes.indexOf(t.shape) === -1) return false
  if (h.prints && h.prints.length) {
    var hit = false
    for (var i = 0; i < t.prints.length; i++) if (h.prints.indexOf(t.prints[i]) !== -1) hit = true
    if (!hit) return false
  }
  return true
}

/**
 * 按 id 找模板。
 * 顺序：精选 → 已生成的页缓存 → 从 id 直接重算。
 * 第三步是关键：小程序冷启动、或用户从草稿恢复进编辑器时，
 * 缓存是空的，靠翻页找等于找不到（之前会静默回落到夜泊）。
 * id 自带 seed 与五维，rebuild 出来的对象与列表里那条逐字段相同。
 */
function find (id) {
  var hand = lib.getTemplate(id)
  if (hand && hand.id === id) return hand

  var keys = Object.keys(pages)
  for (var p = 0; p < keys.length; p++) {
    var list = pages[keys[p]]
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  }

  return factory.rebuild(id)
}

function estimate (pageCount) {
  return curated().length + (pageCount == null ? MAX_PAGES : pageCount) * PAGE_SIZE
}

module.exports = {
  BASE_SEED: BASE_SEED,
  PAGE_SIZE: PAGE_SIZE,
  MAX_PAGES: MAX_PAGES,
  curated: curated,
  generated: generated,
  get: get,
  find: find,
  estimate: estimate,
  clearCache: function () { pages = {} },

  SCENES: lib.SCENES,
  SHAPES: lib.SHAPES,
  PRINTS: lib.PRINTS,
  MOODS: lib.MOODS,
  REGIONS: lib.REGIONS,
  LAYOUTS: lib.LAYOUTS,
  REGION_SIGNATURE: lib.REGION_SIGNATURE,
  getTemplate: lib.getTemplate,
  getShape: lib.getShape,
  getPrint: lib.getPrint,
  getScene: lib.getScene,
  shapeRatio: lib.shapeRatio,
  printRatioOf: lib.printRatioOf,
  printRatio: lib.printRatio,
  shapePrintDelta: lib.shapePrintDelta,
  sceneText: lib.sceneText,
  printText: lib.printText,
  fitBox: lib.fitBox,
  printPixels: lib.printPixels,
  tax: tax
}