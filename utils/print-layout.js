/**
 * utils/print-layout.js
 * A4 拼版几何：一份 A4 上排几张牌、每张多大、怎么裁。
 *
 * 全部用毫米计算，导出时才换算成像素——这样 300dpi 与 200dpi
 * 得到的是同一张版式，只是分辨率不同。
 *
 * ── 为什么网格是算出来的而不是写死的 ──────────────────────────
 * 模板都是 1:1.4 竖版，而 A4 是 210×297（0.707）。
 * 「半张 2 份」在竖版 A4 上只能上下切（每份 210×148，是横的），
 * 在横版 A4 上左右切才得到竖版（148×210）。
 * 所以网格要按「纸张方向 + 份数」一起解，而不是固定 2×2。
 * 每份若正好是横向的，就把内容旋转 90° 画进去，装饰图不会被拉伸。
 */

var CARD_RATIO = 1 / 1.4           // 0.7143，模板的竖版宽高比
var RATIO_TOLERANCE = 0.05         // 与模板比例的允许偏差

var SHEETS = {
  a4: { key: 'a4', label: 'A4', w: 210, h: 297 }
}

var LAYOUTS = [
  { key: 'full', label: '整张', count: 1 },
  { key: 'half', label: '半张', count: 2 },
  { key: 'card', label: '卡片', count: 4 },
  { key: 'mini', label: '迷你', count: 8 }
]

var CUTS = [
  { key: 'none', label: '无' },
  { key: 'corner', label: '边角' },
  { key: 'cross', label: '十字+点线' },
  { key: 'dash', label: '虚线' }
]

var MARGIN = { normal: 8, narrow: 4 }
/** 每格四周留的裁切间隙（mm）。边距管纸边，间隙管相邻两张之间 */
var GUTTER = 2

/** 二维码边长达到这个值算「标准」，低于则界面上标「小型」 */
var QR_STD_MM = 25
/** 迷你版式的最低要求：码 ≥ 15mm、单模块 ≥ 0.4mm */
var QR_MIN_MM = 15
var MODULE_MIN_MM = 0.4

function getLayout (key) {
  for (var i = 0; i < LAYOUTS.length; i++) {
    if (LAYOUTS[i].key === key) return LAYOUTS[i]
  }
  return LAYOUTS[0]
}

function getCut (key) {
  for (var i = 0; i < CUTS.length; i++) {
    if (CUTS[i].key === key) return CUTS[i]
  }
  return CUTS[0]
}

/** 纸张尺寸（mm）。landscape 为横向 */
function sheetOf (orientation) {
  var s = SHEETS.a4
  return orientation === 'landscape'
    ? { w: s.h, h: s.w, label: s.label, orientation: 'landscape' }
    : { w: s.w, h: s.h, label: s.label, orientation: 'portrait' }
}

/**
 * 在一个矩形里放一张 1:1.4 的牌。
 * 正放放不下（或太小）就把内容旋转 90°，装饰图跟着转，但不会被拉伸。
 *
 * @param {number} boxW 可用宽（mm）
 * @param {number} boxH 可用高（mm）
 * @param {boolean} rotated 是否旋转
 * @returns {{w:number,h:number,fpW:number,fpH:number}} w/h 是卡片本身（正着看）的尺寸，
 *          fpW/fpH 是它在纸上的占位（旋转时两者互换）
 */
function fitCard (boxW, boxH, rotated) {
  if (rotated) {
    var h = Math.min(boxW, boxH / CARD_RATIO)
    return { w: h * CARD_RATIO, h: h, fpW: h, fpH: h * CARD_RATIO }
  }
  var w = Math.min(boxW, boxH * CARD_RATIO)
  return { w: w, h: w / CARD_RATIO, fpW: w, fpH: w / CARD_RATIO }
}

/** 这张牌上的二维码够不够扫（迷你版式是否提供就看它） */
function cardMeets (card, moduleCount) {
  var qr = estimateQrMm(card.w, card.h)
  return qr >= QR_MIN_MM && estimateModuleMm(qr, moduleCount) >= MODULE_MIN_MM
}

/**
 * 解出最合适的分格：在能整除份数的 cols/rows 里挑「每份最大」的那个。
 * 正放总是优先——只有正放扫不动时才旋转 90°，避免整版内容莫名躺倒。
 * @returns {{cols:number, rows:number, rotate:boolean, card:object, cellW:number, cellH:number}}
 */
function gridFor (count, usableW, usableH, moduleCount) {
  var best = null
  for (var cols = 1; cols <= count; cols++) {
    if (count % cols !== 0) continue
    var rows = count / cols
    var cellW = usableW / cols
    var cellH = usableH / rows
    var boxW = cellW - GUTTER * 2
    var boxH = cellH - GUTTER * 2
    if (boxW <= 4 || boxH <= 4) continue

    var up = fitCard(boxW, boxH, false)
    var rot = fitCard(boxW, boxH, true)
    var useRot = !cardMeets(up, moduleCount) && cardMeets(rot, moduleCount)
    var card = useRot ? rot : up
    var score = card.w * card.h

    if (!best || score > best.score) {
      best = { cols: cols, rows: rows, rotate: useRot, card: card, cellW: cellW, cellH: cellH, score: score }
    }
  }
  return best
}

/**
 * 估算每份上二维码的边长（mm）。
 * 与 paper-render 的 plan 用同一套比例：safe 宽 0.5343，二维码占 0.86。
 * 这里只用于界面标注与门槛判断，真实尺寸以渲染结果为准。
 */
function estimateQrMm (cardW, cardH) {
  var short = Math.min(cardW, cardH)
  return +(0.5343 * 0.86 * short).toFixed(1)
}

function estimateModuleMm (qrMm, moduleCount) {
  var total = (moduleCount || 33) + 8   // 33 = 典型 WPA 载荷 + 双侧 4 模块静区
  return +(qrMm / total).toFixed(3)
}

/**
 * 算一张拼版。
 * @param {{layout?:string, orientation?:string, cut?:string, narrowMargin?:boolean,
 *          moduleCount?:number}} opts
 * @returns {object}
 */
function planSheet (opts) {
  var o = opts || {}
  var sheet = sheetOf(o.orientation)
  var layout = getLayout(o.layout)
  var margin = o.narrowMargin ? MARGIN.narrow : MARGIN.normal

  // 纸边先让出 margin，剩下才是拼版区；每格内再让出 GUTTER
  var usableW = sheet.w - margin * 2
  var usableH = sheet.h - margin * 2
  var grid = gridFor(layout.count, usableW, usableH, o.moduleCount) || {
    cols: 1, rows: 1, rotate: false,
    card: fitCard(usableW - GUTTER * 2, usableH - GUTTER * 2, false),
    cellW: usableW, cellH: usableH
  }

  var card = grid.card
  var cards = []

  for (var r = 0; r < grid.rows; r++) {
    for (var c = 0; c < grid.cols; c++) {
      var cell = {
        x: margin + c * grid.cellW,
        y: margin + r * grid.cellH,
        w: grid.cellW,
        h: grid.cellH
      }
      cards.push({
        index: cards.length,
        cell: cell,
        // 卡片在纸上的实际占位（居中于格子，裁切线沿这个矩形画）
        x: cell.x + (cell.w - card.fpW) / 2,
        y: cell.y + (cell.h - card.fpH) / 2,
        w: card.fpW,
        h: card.fpH,
        rotate: grid.rotate,
        // 正着看时的逻辑尺寸（渲染器按这个尺寸排信息层）
        logicalW: card.w,
        logicalH: card.h
      })
    }
  }

  var first = cards[0]
  var qrMm = estimateQrMm(first.logicalW, first.logicalH)
  var moduleMm = estimateModuleMm(qrMm, o.moduleCount)

  var ratioDelta = Math.abs(first.logicalW / first.logicalH - CARD_RATIO) / CARD_RATIO
  var warnings = []
  if (ratioDelta > RATIO_TOLERANCE) {
    warnings.push('每份比例 ' + first.logicalW.toFixed(1) + '×' + first.logicalH.toFixed(1) +
      ' 与 1:1.4 偏差 ' + (ratioDelta * 100).toFixed(1) + '%')
  }
  if (qrMm < QR_MIN_MM) warnings.push('二维码仅 ' + qrMm + 'mm，低于 ' + QR_MIN_MM + 'mm')
  if (moduleMm < MODULE_MIN_MM) warnings.push('单模块仅 ' + moduleMm + 'mm，低于 ' + MODULE_MIN_MM + 'mm')

  return {
    sheet: sheet,
    layout: layout.key,
    cut: (o.cut || 'none'),
    margin: margin,
    gutter: GUTTER,
    grid: grid,
    cards: cards,
    count: cards.length,
    cardW: first.logicalW,
    cardH: first.logicalH,
    rotate: grid.rotate,
    qrMm: qrMm,
    moduleMm: moduleMm,
    qrClass: qrMm >= QR_STD_MM ? 'std' : 'small',
    qrLabel: qrMm >= QR_STD_MM ? '标准二维码' : '小型二维码',
    ratio: first.logicalW / first.logicalH,
    ratioDelta: +ratioDelta.toFixed(4),
    usable: warnings.length === 0,
    warnings: warnings
  }
}

/**
 * 每种版式 + 纸张方向是否可用（迷你 8 份不达标就不提供）。
 * @returns {Array<{key,label,count,usable,reason,qrMm}>}
 */
function layoutOptions (orientation, narrowMargin, moduleCount) {
  return LAYOUTS.map(function (l) {
    var p = planSheet({
      layout: l.key,
      orientation: orientation,
      narrowMargin: narrowMargin,
      moduleCount: moduleCount
    })
    return {
      key: l.key,
      label: l.label,
      count: l.count,
      usable: p.usable,
      reason: p.warnings.join('；'),
      qrMm: p.qrMm,
      qrLabel: p.qrLabel,
      grid: p.grid.cols + '×' + p.grid.rows
    }
  })
}

/** mm → 像素 */
function mmToPx (mm, dpi) {
  return Math.round(mm / 25.4 * dpi)
}

/** 导出分辨率：300 优先，失败降到 200 */
function pixelSize (sheet, dpi) {
  return { w: mmToPx(sheet.w, dpi), h: mmToPx(sheet.h, dpi) }
}

module.exports = {
  SHEETS: SHEETS,
  LAYOUTS: LAYOUTS,
  CUTS: CUTS,
  MARGIN: MARGIN,
  CARD_RATIO: CARD_RATIO,
  QR_STD_MM: QR_STD_MM,
  QR_MIN_MM: QR_MIN_MM,
  MODULE_MIN_MM: MODULE_MIN_MM,
  getLayout: getLayout,
  getCut: getCut,
  sheetOf: sheetOf,
  gridFor: gridFor,
  planSheet: planSheet,
  layoutOptions: layoutOptions,
  estimateQrMm: estimateQrMm,
  estimateModuleMm: estimateModuleMm,
  mmToPx: mmToPx,
  pixelSize: pixelSize
}
