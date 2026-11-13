/**
 * utils/wifi.js
 * 生成 Wi-Fi 二维码载荷（ZXing / iOS / Android 通用 WIFI: 格式）
 *
 * 输出格式：WIFI:T:WPA;S:<ssid>;P:<password>;;
 *   - type 支持 'WPA' | 'WEP' | 'nopass'
 *   - type 为 nopass 时不写 P 字段
 *   - 字段内的 \ ; , : " 用反斜杠转义
 *
 * 纯本地计算，不发起任何网络请求。
 */

var ESCAPE_RE = /([\\;,":])/g

var TYPE_ALIAS = {
  WPA: 'WPA',
  WPA2: 'WPA',
  WPA3: 'WPA',
  WEP: 'WEP',
  NOPASS: 'nopass',
  NONE: 'nopass',
  OPEN: 'nopass'
}

/**
 * 转义单个字段。反斜杠本身也必须转义，否则读取端会吃掉后续字符。
 * @param {string} value
 * @returns {string}
 */
function escapeField (value) {
  return String(value == null ? '' : value).replace(ESCAPE_RE, '\\$1')
}

/**
 * 计算 UTF-8 字节长度（SSID 的 32 字节限制针对字节而非字符）。
 * @param {string} str
 * @returns {number}
 */
function byteLength (str) {
  var s = String(str == null ? '' : str)
  var bytes = 0
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      bytes += 4
      i++
    } else {
      bytes += 3
    }
  }
  return bytes
}

function hasEdgeSpace (str) {
  return /^\s|\s$/.test(String(str == null ? '' : str))
}

/**
 * @param {{ssid?:string, password?:string, type?:string}} options
 * @returns {{value:string, type:string, warnings:string[]}}
 */
function buildWifiString (options) {
  var opts = options || {}
  var warnings = []

  var ssid = opts.ssid == null ? '' : String(opts.ssid)
  var password = opts.password == null ? '' : String(opts.password)
  var rawType = opts.type == null ? 'WPA' : String(opts.type)
  var typeKey = rawType.trim().toUpperCase()
  var type = TYPE_ALIAS[typeKey] || 'WPA'

  if (!TYPE_ALIAS[typeKey]) {
    warnings.push('未知加密类型「' + rawType + '」，已按 WPA 处理')
  }

  if (!ssid) {
    warnings.push('Wi-Fi 名称为空，扫码后无法连接')
  } else {
    if (byteLength(ssid) > 32) {
      warnings.push('Wi-Fi 名称 ' + byteLength(ssid) + ' 字节，超过 32 字节上限，部分设备会截断')
    }
    if (hasEdgeSpace(ssid)) {
      warnings.push('Wi-Fi 名称首尾含空格；二维码能扫，但部分系统会忽略该空格导致连不上')
    }
  }

  if (type === 'nopass') {
    if (password) {
      warnings.push('加密类型为 nopass，密码不会写入二维码')
    }
  } else {
    if (!password) {
      warnings.push('未填写密码，加密网络无法连接')
    } else if (hasEdgeSpace(password)) {
      warnings.push('密码首尾含空格；部分系统会自动去空格导致连不上')
    }
    if (type === 'WPA' && password && (password.length < 8 || password.length > 63)) {
      warnings.push('WPA 密码长度为 ' + password.length + '，标准要求 8–63 个字符')
    }
  }

  var fields = ['T:' + type + ';', 'S:' + escapeField(ssid) + ';']
  if (type !== 'nopass') {
    fields.push('P:' + escapeField(password) + ';')
  }

  return {
    value: 'WIFI:' + fields.join('') + ';',
    type: type,
    warnings: warnings
  }
}

module.exports = {
  buildWifiString: buildWifiString,
  escapeField: escapeField,
  byteLength: byteLength
}
