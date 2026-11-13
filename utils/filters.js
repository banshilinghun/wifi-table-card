/**
 * utils/filters.js
 * 多维筛选：形状 / 打印格式是「过滤」（不符合的直接隐藏），
 * 氛围 / 地区是「偏好」（符合的排到前面，其余照常显示）。
 *
 * 纯内存计算 + 本机存储，不发任何请求。
 */

var lib = require('../templates/index')
var store = require('./store')

var DEFAULT_FILTERS = {
  scene: 'all',
  shapes: [],
  prints: [],
  moods: [],
  regions: []
}

function clone (f) {
  return {
    scene: f.scene || 'all',
    shapes: (f.shapes || []).slice(),
    prints: (f.prints || []).slice(),
    moods: (f.moods || []).slice(),
    regions: (f.regions || []).slice()
  }
}

function contains (list, value) {
  return list.indexOf(value) !== -1
}

function toggle (list, value) {
  var next = list.slice()
  var i = next.indexOf(value)
  if (i === -1) next.push(value)
  else next.splice(i, 1)
  return next
}

/**
 * 过滤：返回 true 表示这条模板留下。
 * 场景为单选的硬过滤（模板的 scene 是数组，命中任意一个即可）；
 * 形状、打印格式多选，命中任意一个即通过。
 */
function passes (tpl, f) {
  if (f.scene && f.scene !== 'all') {
    var scenes = Array.isArray(tpl.scene) ? tpl.scene : [tpl.scene]
    if (scenes.indexOf(f.scene) === -1) return false
  }

  if (f.shapes && f.shapes.length && !contains(f.shapes, tpl.shape)) return false

  if (f.prints && f.prints.length) {
    var hit = false
    for (var i = 0; i < tpl.prints.length; i++) {
      if (contains(f.prints, tpl.prints[i])) { hit = true; break }
    }
    if (!hit) return false
  }

  return true
}

/**
 * 偏好打分。地区比氛围更具体，权重给 2。
 * 分数只影响顺序，不影响去留。
 */
function score (tpl, f) {
  var s = 0
  var i

  if (f.regions && f.regions.length && contains(f.regions, tpl.region)) s += 2

  if (f.moods && f.moods.length) {
    for (i = 0; i < tpl.mood.length; i++) {
      if (contains(f.moods, tpl.mood[i])) { s += 1; break }
    }
  }

  return s
}

/**
 * 先过滤，再按偏好稳定排序（同分保持模板库原顺序）。
 * @returns {Array} 模板数组
 */
function apply (list, f) {
  var filters = f || DEFAULT_FILTERS
  var kept = []

  for (var i = 0; i < list.length; i++) {
    if (passes(list[i], filters)) {
      kept.push({ tpl: list[i], index: i, score: score(list[i], filters) })
    }
  }

  kept.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })

  return kept.map(function (item) { return item.tpl })
}

/** 过滤条件是否生效（用于列表为空时的引导文案） */
function hasHardFilter (f) {
  return (f.shapes && f.shapes.length > 0) || (f.prints && f.prints.length > 0)
}

/**
 * 右上角角标数字：只数「过滤」类条件（形状、打印格式）。
 * 偏好（氛围、地区）不隐藏任何模板，所以不计入角标；它们通过 chips 展示。
 */
function activeCount (f) {
  var n = 0
  if (f.shapes && f.shapes.length) n++
  if (f.prints && f.prints.length) n++
  return n
}

/** 只清掉过滤类条件（形状 + 打印格式），偏好保留 */
function clearHard (f) {
  var next = clone(f)
  next.shapes = []
  next.prints = []
  return next
}

/** 摘要芯片，按添加顺序展示 */
function chips (f) {
  var out = []

  ;(f.shapes || []).forEach(function (k) { out.push({ dim: 'shapes', key: k, label: k, kind: 'filter' }) })
  ;(f.prints || []).forEach(function (k) {
    out.push({ dim: 'prints', key: k, label: lib.getPrint(k).short, kind: 'filter' })
  })
  ;(f.regions || []).forEach(function (k) { out.push({ dim: 'regions', key: k, label: k, kind: 'pref' }) })
  ;(f.moods || []).forEach(function (k) { out.push({ dim: 'moods', key: k, label: k, kind: 'pref' }) })

  return out
}

/** 读取本地条件，脏数据一律回落到默认值 */
function load () {
  var saved = store.getFilters()
  if (!saved || typeof saved !== 'object') return clone(DEFAULT_FILTERS)

  var validShape = {}
  lib.SHAPES.forEach(function (s) { validShape[s.key] = true })
  var validPrint = {}
  lib.PRINTS.forEach(function (p) { validPrint[p.key] = true })
  var validScene = {}
  lib.SCENES.forEach(function (s) { validScene[s.key] = true })

  function pick (input, valid) {
    var out = []
    if (!input || !input.length) return out
    for (var i = 0; i < input.length; i++) {
      if (valid[input[i]] && out.indexOf(input[i]) === -1) out.push(input[i])
    }
    return out
  }

  return {
    scene: validScene[saved.scene] ? saved.scene : 'all',
    shapes: pick(saved.shapes, validShape),
    prints: pick(saved.prints, validPrint),
    moods: pick(saved.moods, { '自然': 1, '都市': 1, '传统': 1, '温馨': 1 }),
    regions: pick(saved.regions, { '新中式': 1, '日式': 1, '韩式': 1, '欧式': 1, '极简': 1 })
  }
}

function save (f) {
  return store.saveFilters(clone(f))
}

module.exports = {
  DEFAULT_FILTERS: DEFAULT_FILTERS,
  clone: clone,
  toggle: toggle,
  passes: passes,
  score: score,
  apply: apply,
  hasHardFilter: hasHardFilter,
  activeCount: activeCount,
  clearHard: clearHard,
  chips: chips,
  load: load,
  save: save
}
