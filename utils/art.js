/**
 * utils/art.js
 * 装饰图加载。包内 webp，不发网络请求。
 *
 * Image 对象来自 canvas.createImage()，与创建它的 canvas 绑定，
 * 所以缓存挂在 canvas 实例上（同一块画布重绘时复用），不跨画布共享——
 * 把离屏 canvas 的 Image 画到主画布上，在部分基础库里会静默失败。
 */

var DIR = '/packageTpl/art/'

function pathOf (key) {
  return DIR + key + '.webp'
}

/**
 * @param {object} canvas 主画布或离屏画布（需支持 createImage）
 * @param {string} key packageTpl/art 下的文件名（不含扩展名）
 * @returns {Promise<Image>}
 */
function ensure (canvas, key) {
  if (!canvas || !canvas.createImage || !key) return Promise.resolve(null)

  var bag = canvas.__artImages || (canvas.__artImages = {})
  if (bag[key]) return Promise.resolve(bag[key])

  // 同一张图并发请求时只加载一次
  var pending = canvas.__artPending || (canvas.__artPending = {})
  if (pending[key]) return pending[key]

  pending[key] = new Promise(function (resolve, reject) {
    var img = canvas.createImage()
    img.onload = function () {
      bag[key] = img
      delete pending[key]
      resolve(img)
    }
    img.onerror = function (e) {
      delete pending[key]
      console.warn('[art] 加载失败 ' + pathOf(key), e)
      // 装饰图缺失不能挡住信息层：resolve(null)，渲染器会跳过 drawImage
      resolve(null)
    }
    img.src = pathOf(key)
  })

  return pending[key]
}

module.exports = {
  ensure: ensure,
  pathOf: pathOf
}
