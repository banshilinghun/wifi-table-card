/**
 * utils/qr-canvas.js
 * 在 Canvas 2D 上绘制二维码。
 *
 * 依赖 utils/qrcode.js（qrcode-generator，MIT，已内置源码，不走 npm）。
 * 绘制只用 fillStyle + fillRect，因此同一份代码在 Node 侧也能用记录型
 * context 跑通，便于脱离 IDE 做像素级校验。
 */

var qrcode = require('./qrcode')

var EC_LEVELS = { L: true, M: true, Q: true, H: true }

/**
 * 生成二维码矩阵。typeNumber 传 0 表示按内容自动选版本。
 * @param {string} text
 * @param {string} ecLevel 'L' | 'M' | 'Q' | 'H'
 */
function createQR (text, ecLevel) {
  var level = EC_LEVELS[ecLevel] ? ecLevel : 'M'
  var qr = qrcode(0, level)
  // 默认 Byte 模式，库内部按 UTF-8 编码，中文 SSID 不会乱码
  qr.addData(String(text == null ? '' : text))
  qr.make()
  return qr
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{x?:number,y?:number,size?:number,quiet?:number,ec?:string,dark?:string,light?:string}} options
 * @returns {{moduleCount:number, version:number, cell:number, size:number, quiet:number}}
 */
function drawQRCode (ctx, text, options) {
  var opts = options || {}
  var x = opts.x || 0
  var y = opts.y || 0
  var size = opts.size || 200
  // 静区（quiet zone）按模块数计，规范要求至少 4 个模块
  var quiet = opts.quiet == null ? 4 : Math.max(0, opts.quiet)
  var dark = opts.dark || '#171614'
  var light = opts.light || '#FFFFFF'

  var qr = createQR(text, opts.ec)
  var moduleCount = qr.getModuleCount()
  var total = moduleCount + quiet * 2
  var cell = size / total

  ctx.fillStyle = light
  ctx.fillRect(x, y, size, size)

  ctx.fillStyle = dark
  var originX = x + quiet * cell
  var originY = y + quiet * cell
  for (var row = 0; row < moduleCount; row++) {
    for (var col = 0; col < moduleCount; col++) {
      if (!qr.isDark(row, col)) continue
      // 取整到像素边界，避免相邻模块之间出现发丝白缝
      var left = Math.round(originX + col * cell)
      var right = Math.round(originX + (col + 1) * cell)
      var top = Math.round(originY + row * cell)
      var bottom = Math.round(originY + (row + 1) * cell)
      if (right <= left || bottom <= top) continue
      ctx.fillRect(left, top, right - left, bottom - top)
    }
  }

  return {
    moduleCount: moduleCount,
    version: (moduleCount - 17) / 4,
    cell: cell,
    size: size,
    quiet: quiet
  }
}

module.exports = {
  createQR: createQR,
  drawQRCode: drawQRCode
}
