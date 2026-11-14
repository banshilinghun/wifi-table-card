/**
 * utils/draw.js
 * 一套模板该怎么画，由这里决定——页面不判断 series。
 *
 *   series = 'paper' → utils/paper-render（装饰图层 + 自适应信息层）
 *   其余（深色系列）  → utils/render（背景 + 纹样 + 模板自带槽位）
 */

var render = require('./render')
var paperRender = require('./paper-render')

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} tpl
 * @param {object} data
 * @param {number} W
 * @param {number} H
 * @param {{art?:Image,bounds?:object,vertical?:boolean,miniCode?:Image,mm?:object}} opts
 * @returns {object} 两边渲染器的元数据（字段不完全相同，但都有 qr / warnings）
 */
function drawTemplate (ctx, tpl, data, W, H, opts) {
  if (!tpl) throw new Error('drawTemplate: 缺少模板')

  if (tpl.series === 'paper') {
    return paperRender.renderPaper(ctx, tpl, data, W, H, opts || {})
  }
  return render.renderSign(ctx, tpl, data, W, H)
}

function isPaper (tpl) {
  return !!tpl && tpl.series === 'paper'
}

module.exports = {
  drawTemplate: drawTemplate,
  isPaper: isPaper
}
