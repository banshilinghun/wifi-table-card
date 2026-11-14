/**
 * utils/print-layout.js
 * A4 拼版几何：一份 A4 上排几张牌、每张多大、怎么裁。
 *
 * 全部用毫米计算，导出时才换算成像素——这样 300dpi 与 200dpi
 * 得到的是同一张版式，只是分辨率不同。
 *
 * ── 两个「不能写死」的东西 ──────────────────────────────────
 * 1. 卡片比例。不是所有模板都是 1:1.4：深色系列有 1:1、1:2、2:1。
 *    比例从模板的 shape 进来（ratio = 宽/高），网格按它求解，
 *    否则深色模板会被拉成白纸的形状——这正是打印页原先的 bug。
 * 2. 二维码尺寸。同一种版式下，二维码占多大取决于载荷长度
 *    （模块数不同）与模板本身的排版。这里不猜，由调用方传入：
 *      qrRatio      二维码边长 / 卡片短边（渲染器算出来的真实比例）
 *      moduleCount  载荷实际编码出的模块数（含静区之前的矩阵边长）
 *    两者相乘就得到「印在纸上有多大」，再除以 (模块数+8) 得到单模块毫米数。
 *
 * ── 为什么网格是算出来的而不是写死的 ──────────────────────────
 * 「半张 2 份」在竖版 A4 上只能上下切，在横版 A4 上左右切才得到竖版。
 * 所以网格要按「纸张方向 + 份数 + 卡片比例」一起解。
 * 每份若正好是横向的，就把内容旋转 90° 画进去，装饰图不会被拉伸。
 */

var RATIO_TOLERANCE = 0.05         // 与模板比例的允许偏差
var DEFAULT_RATIO = 1 / 1.4        // 缺省按 1:1.4 竖版

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
/** 扫码下限：码 ≥ 15mm、单模块 ≥ 0.4mm（低于这个值手机基本对不上焦） */
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
 * 在一个矩形里放一张宽高比为 ratio 的牌。
 * 正放放不下（或太小）就把内容旋转 90°，装饰图跟着转，但不会被拉伸。
 *
 * @param {number} boxW 可用宽（mm）
 * @param {number} boxH 可用高（mm）
 * @param {boolean} rotated 是否旋转
 * @param {number} ratio 卡片宽/高
 * @returns {{w:number,h:number,fpW:number,fpH:number}} w/h 是卡片本身（正着看）的尺寸，
 *          fpW/fpH 是它在纸上的占位（旋转时两者互换）
 */
function fitCard (boxW, boxH, rotated, ratio) {
  var r = ratio > 0 ? ratio : DEFAULT_RATIO
  if (rotated) {
    // 旋转后：卡片的高贴纸宽，卡片的宽贴纸高
    var h = Math.min(boxW, boxH / r)
    return { w: h * r, h: h, fpW: h, fpH: h * r }
  }
  var w = Math.min(boxW, boxH * r)
  return { w: w, h: w / r, fpW: w, fpH: w / r }
}

/** 这张牌上的二维码够不够扫（决定版式能不能点） */
function cardMeets (card, moduleCount, qrRatio) {
  var qr = estimateQrMm(card.w, card.h, qrRatio)
  return qr >= QR_MIN_MM && estimateModuleMm(qr, moduleCount) >= MODULE_MIN_MM
}

/**
 * 解出最合适的分格：挑「每份最大」的那个。
 *
 * 列数不必整除份数——允许最后一格空着。
 * 这条规则是实测出来的：1:1.4 的牌在 A4 上拼 8 份，
 * 2×4 每份只有 44.5×62.3mm；改成 3×3（空一格）每份能到 60.7×85mm，
 * 面积大 86%，副标题从 1.4mm 长到 1.9mm，肉眼差别很大。
 * 空一格换来的是「整张纸上每份都更大」，对打印来说更划算。
 *
 * 正放总是优先——只有正放扫不动时才旋转 90°，避免整版内容莫名躺倒。
 */
function gridFor (count, usableW, usableH, opts) {
  var o = opts || {}
  var ratio = o.ratio > 0 ? o.ratio : DEFAULT_RATIO
  var best = null

  for (var cols = 1; cols <= count; cols++) {
    var rows = Math.ceil(count / cols)
    var cellW = usableW / cols
    var cellH = usableH / rows
    var boxW = cellW - GUTTER * 2
    var boxH = cellH - GUTTER * 2
    if (boxW <= 4 || boxH <= 4) continue

    var up = fitCard(boxW, boxH, false, ratio)
    var rot = fitCard(boxW, boxH, true, ratio)
    var useRot = !cardMeets(up, o.moduleCount, o.qrRatio) && cardMeets(rot, o.moduleCount, o.qrRatio)
    var card = useRot ? rot : up
    var score = card.w * card.h

    // 面积相同时，选「每格填得更满」的那个（少留大块空白），再按列数从小到大
    var fill = score / (cellW * cellH)
    if (!best || score > best.score + 0.01 ||
      (Math.abs(score - best.score) <= 0.01 && fill > best.fill + 0.001)) {
      best = {
        cols: cols, rows: rows, rotate: useRot, card: card,
        cellW: cellW, cellH: cellH, score: score, fill: fill
      }
    }
  }
  return best
}

/**
 * 二维码边长（mm）。qrRatio = 二维码边长 / 卡片短边，由渲染器给出。
 * 缺省 0.46 只是兜底（1:1.4 白纸在 A6 上的实测值）。
 */
function estimateQrMm (cardW, cardH, qrRatio) {
  var short = Math.min(cardW, cardH)
  var ratio = qrRatio > 0 ? qrRatio : 0.46
  return +(ratio * short).toFixed(1)
}

/** 单模块毫米数：静区两侧各 4 模块，要一起算进边长 */
function estimateModuleMm (qrMm, moduleCount) {
  var modules = (moduleCount > 0 ? moduleCount : 21) + 8
  return +(qrMm / modules).toFixed(3)
}

/**
 * 算一张拼版。
 * @param {{layout?:string, orientation?:string, cut?:string, narrowMargin?:boolean,
 *          moduleCount?:number, ratio?:number, qrRatio?:number}} opts
 * @returns {object}
 */
function planSheet (opts) {
  var o = opts || {}
  var sheet = sheetOf(o.orientation)
  var layout = getLayout(o.layout)
  var margin = o.narrowMargin ? MARGIN.narrow : MARGIN.normal
  var ratio = o.ratio > 0 ? o.ratio : DEFAULT_RATIO
  var moduleCount = o.moduleCount > 0 ? o.moduleCount : 0

  // 纸边先让出 margin，剩下才是拼版区；每格内再让出 GUTTER
  var usableW = sheet.w - margin * 2
  var usableH = sheet.h - margin * 2
  var grid = gridFor(layout.count, usableW, usableH, {
    ratio: ratio, qrRatio: o.qrRatio, moduleCount: moduleCount
  }) || {
    cols: 1, rows: 1, rotate: false,
    card: fitCard(usableW - GUTTER * 2, usableH - GUTTER * 2, false, ratio),
    cellW: usableW, cellH: usableH
  }

  var card = grid.card
  var cards = []

  // 只在有牌的位置生成卡片；最后一格空着很正常（3×3 放 8 份）
  for (var i = 0; i < layout.count; i++) {
    var r = Math.floor(i / grid.cols)
    var c = i % grid.cols
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

  var first = cards[0]
  var qrMm = estimateQrMm(first.logicalW, first.logicalH, o.qrRatio)
  var moduleMm = estimateModuleMm(qrMm, moduleCount)
  var ratioDelta = Math.abs(first.logicalW / first.logicalH - ratio) / ratio

  var warnings = []
  if (ratioDelta > RATIO_TOLERANCE) {
    warnings.push('每份比例 ' + first.logicalW.toFixed(1) + '×' + first.logicalH.toFixed(1) +
      ' 与 ' + trimNum(1 / ratio) + ':' + trimNum(1) + ' 偏差 ' + (ratioDelta * 100).toFixed(1) + '%')
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
    ratio: ratio,
    rotate: grid.rotate,
    moduleCount: moduleCount,
    qrMm: qrMm,
    moduleMm: moduleMm,
    qrClass: qrMm >= QR_STD_MM ? 'std' : 'small',
    qrLabel: qrMm >= QR_STD_MM ? '标准二维码' : '小型二维码',
    ratioDelta: +ratioDelta.toFixed(4),
    usable: warnings.length === 0,
    warnings: warnings
  }
}

function trimNum (n) {
  var s = String(Math.round(n * 100) / 100)
  return s
}

/**
 * 每种版式 + 纸张方向是否可用（不达标就禁用，点了给原因）。
 * @returns {Array<{key,label,count,usable,reason,qrMm,qrLabel,grid}>}
 */
function layoutOptions (orientation, narrowMargin, opts) {
  var o = opts || {}
  return LAYOUTS.map(function (l) {
    var p = planSheet({
      layout: l.key,
      orientation: orientation,
      narrowMargin: narrowMargin,
      moduleCount: o.moduleCount,
      ratio: o.ratio,
      qrRatio: o.qrRatio
    })
    return {
      key: l.key,
      label: l.label,
      count: l.count,
      usable: p.usable,
      reason: p.warnings.join('；'),
      qrMm: p.qrMm,
      moduleMm: p.moduleMm,
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
  GUTTER: GUTTER,
  DEFAULT_RATIO: DEFAULT_RATIO,
  QR_STD_MM: QR_STD_MM,
  QR_MIN_MM: QR_MIN_MM,
  MODULE_MIN_MM: MODULE_MIN_MM,
  getLayout: getLayout,
  getCut: getCut,
  sheetOf: sheetOf,
  fitCard: fitCard,
  gridFor: gridFor,
  planSheet: planSheet,
  layoutOptions: layoutOptions,
  estimateQrMm: estimateQrMm,
  estimateModuleMm: estimateModuleMm,
  mmToPx: mmToPx,
  pixelSize: pixelSize
}
