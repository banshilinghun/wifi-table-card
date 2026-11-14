/**
 * templates/catalog.js —— 对外统一入口
 *
 * 页面只 require 这个文件，不再直接拿 templates/index。
 * 它把两套模板拼成一个列表，并保证：
 *   1. 白纸系列排在前面（第一期主推），深色系列在后
 *   2. 场景表把新场景（奶茶咖啡 / 火锅餐厅 / 民宿客栈 / 美甲美发 / 棋牌茶室 / 节日）
 *      与原场景合并，去重后「全部」仍在第一位
 *   3. 深色模板补上 series: 'dark'，页面不用再判断「有没有 series 字段」
 */

var dark = require('./index')
var paper = require('./paper')

var SERIES = [
  { key: 'paper', label: '白纸系列' },
  { key: 'dark', label: '深色系列' }
]

var DARK = dark.TEMPLATES.map(function (t) {
  var copy = {}
  for (var k in t) {
    if (Object.prototype.hasOwnProperty.call(t, k)) copy[k] = t[k]
  }
  copy.series = 'dark'
  return copy
})

var ALL = paper.TEMPLATES.concat(DARK)

/* 场景：all + 新 6 个 + 原有 10 个（key 重复的只留一个） */
var SCENES = [{ key: 'all', label: '全部', icon: 'all' }]
var seen = { all: true }
paper.SCENES.concat(dark.SCENES).forEach(function (s) {
  if (seen[s.key]) return
  seen[s.key] = true
  SCENES.push({ key: s.key, label: s.label, icon: s.icon })
})

function getTemplate (id) {
  for (var i = 0; i < ALL.length; i++) {
    if (ALL[i].id === id) return ALL[i]
  }
  return null
}

function getScene (key) {
  for (var i = 0; i < SCENES.length; i++) {
    if (SCENES[i].key === key) return SCENES[i]
  }
  return { key: key, label: key, icon: 'all' }
}

function sceneText (tpl) {
  if (!tpl || !tpl.scene) return ''
  var list = Array.isArray(tpl.scene) ? tpl.scene : [tpl.scene]
  return list.map(function (k) { return getScene(k).label }).join(' / ')
}

function printText (tpl) {
  return (tpl.prints || []).map(function (k) { return dark.getPrint(k).short }).join(' · ')
}

function seriesOf (tpl) {
  return (tpl && tpl.series) || 'dark'
}

function bySeries (key) {
  return ALL.filter(function (t) { return seriesOf(t) === key })
}

module.exports = {
  TEMPLATES: ALL,
  SERIES: SERIES,
  SCENES: SCENES,
  SHAPES: dark.SHAPES,
  MOODS: dark.MOODS,
  REGIONS: dark.REGIONS,
  LAYOUTS: dark.LAYOUTS,
  PRINTS: dark.PRINTS,
  REGION_SIGNATURE: dark.REGION_SIGNATURE,
  PAPER_SCENES: paper.SCENES,
  getTemplate: getTemplate,
  getScene: getScene,
  getShape: dark.getShape,
  getPrint: dark.getPrint,
  shapeRatio: dark.shapeRatio,
  printRatioOf: dark.printRatioOf,
  shapePrintDelta: dark.shapePrintDelta,
  sceneText: sceneText,
  printText: printText,
  fitBox: dark.fitBox,
  printRatio: dark.printRatio,
  printPixels: dark.printPixels,
  seriesOf: seriesOf,
  bySeries: bySeries
}
