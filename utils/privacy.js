/**
 * utils/privacy.js
 * 隐私接口的合规封装。
 *
 * 官方流程（《小程序隐私协议开发指南》）：
 *   1. 后台填《用户隐私保护指引》，勾选要用到的权限（这里的「相册（仅写入）」）
 *   2. 用户首次触发隐私接口时，平台弹官方隐私弹窗；
 *      开发者也可以先调 wx.getPrivacySetting 看是否需要授权，
 *      再调 wx.requirePrivacyAuthorize 主动触发
 *   3. 用户拒绝 → 隐私接口直接失败（errno 104 / 112），不是系统权限问题
 *   4. 已同意隐私协议但系统相册权限被拒 → 才是 wx.openSetting 的事
 *
 * 两种情况要给不同的提示，否则用户永远不知道该去关哪个开关。
 */

function viaRequire () {
  if (typeof wx.requirePrivacyAuthorize !== 'function') {
    // 老基础库没有这个 API：由平台在首次调用时处理
    return Promise.resolve({ ok: true, need: false })
  }
  return new Promise(function (resolve) {
    wx.requirePrivacyAuthorize({
      success: function () { resolve({ ok: true, need: true }) },
      fail: function (err) { resolve({ ok: false, need: true, error: err }) }
    })
  })
}

/** 用户是否已同意隐私协议。没配置隐私指引时 needAuthorization 为 false，直接放行。 */
function ensure () {
  if (typeof wx === 'undefined') return Promise.resolve({ ok: true, need: false })

  if (typeof wx.getPrivacySetting === 'function') {
    return new Promise(function (resolve) {
      wx.getPrivacySetting({
        success: function (res) {
          if (!res || !res.needAuthorization) {
            resolve({ ok: true, need: false })
            return
          }
          resolve(viaRequire())
        },
        fail: function () { resolve({ ok: true, need: false }) }
      })
    })
  }
  return viaRequire()
}

/** 打开官方《用户隐私保护指引》 */
function openContract () {
  if (typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({ fail: function (e) { console.warn('[privacy] 打开协议失败', e) } })
    return true
  }
  return false
}

/** 失败原因是「隐私协议没同意」，不是系统权限被拒 */
function isPrivacyError (err) {
  var msg = (err && (err.errMsg || err.message)) || ''
  var no = err && err.errno
  if (no === 104 || no === 112) return true
  return /privacy/i.test(msg)
}

/** 失败原因是系统权限被拒 */
function isAuthError (err) {
  var msg = (err && (err.errMsg || err.message)) || ''
  return /auth|deny|cancel|permission/i.test(msg)
}

module.exports = {
  ensure: ensure,
  openContract: openContract,
  isPrivacyError: isPrivacyError,
  isAuthError: isAuthError
}
