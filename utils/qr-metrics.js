/**
 * utils/qr-metrics.js
 * 二维码的「印出来能不能扫」全靠两个数：边长与单模块大小。
 *
 * 这两个数不能猜，更不能固定按 33 个模块算：
 *   - 模块数由载荷决定。同一个「免费 Wi-Fi」模板，
 *     短 SSID + 8 位密码是 V3（29 模块），长中文 SSID + 63 位密码能到 V10+（57 模块）。
 *     模块数一大，同样的边长下每个模块更小，就更容易扫不出来。
 *   - 边长由模板排版决定。白纸系列在 safe 区里现排，深色系列写在 slots 里，
 *     两者都不能拿一个常量带过。
 *
 * 所以这里用「与真正绘制完全相同的编码器」算模块数，
 * 用「与真正渲染完全相同的排版函数」算二维码占短边的比例。
 */

var qrCanvas = require('./qr-canvas')
var paperRender = require('./paper-render')

var QUIET = 4          // 静区模块数（qr-canvas 固定 4）
var EC = 'M'           // 与渲染时一致，换 EC 会改变模块数

/**
 * 载荷实际编码出的模块数（矩阵边长，不含静区）。
 * @param {string} payload
 * @param {string} [ec]
 * @returns {number}
 */
function moduleCount (payload, ec) {
  var text = String(payload == null ? '' : payload)
  if (!text) return 21
  try {
    return qrCanvas.createQR(text, ec || EC).getModuleCount()
  } catch (e) {
    console.warn('[qr-metrics] 编码失败，按 V1 计', e)
    return 21
  }
}

/**
 * 二维码边长 / 卡片短边的比例。
 * 白纸：跑一遍 paper-render 的 plan（只算数字、不画），与渲染结果一致；
 * 深色：模板自己写的 slots.qr.size 就是 M 的比例。
 */
function qrRatio (tpl, data, bounds) {
  if (!tpl) return 0
  if (tpl.series === 'paper') {
    // plan 里所有尺寸都是相对 M / 相对 safe 的比例，与画布大小无关，
    // 所以用 1000×1400 的名义画布跑一遍就等于真实比例。
    var P = paperRender.plan(null, tpl, data || {}, 1000, 1400, bounds)
    return P.qrSize / P.M
  }
  var slot = tpl.slots && tpl.slots.qr
  return slot && slot.size > 0 ? slot.size : 0
}

/**
 * 一套模板 + 一份载荷 + 一种卡片尺寸下的真实二维码指标。
 * @param {{tpl:object, data:object, bounds?:object, cardW:number, cardH:number}} opts
 * @returns {{moduleCount:number, version:number, qrRatio:number, qrMm:number,
 *            moduleMm:number, quiet:number, modulesTotal:number, ok:boolean}}
 */
function measure (opts) {
  var o = opts || {}
  var modules = moduleCount(o.data && o.data.payload, EC)
  var ratio = qrRatio(o.tpl, o.data, o.bounds)
  var short = Math.min(o.cardW || 0, o.cardH || 0)
  var qrMm = ratio * short
  var total = modules + QUIET * 2
  return {
    moduleCount: modules,
    version: (modules - 17) / 4,
    qrRatio: ratio,
    qrMm: qrMm,
    moduleMm: qrMm / total,
    quiet: QUIET,
    modulesTotal: total,
    ok: qrMm >= 15 && qrMm / total >= 0.4
  }
}

module.exports = {
  EC: EC,
  QUIET: QUIET,
  moduleCount: moduleCount,
  qrRatio: qrRatio,
  measure: measure
}
