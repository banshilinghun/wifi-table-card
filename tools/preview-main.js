/* tools/preview-main.js —— 由 build-preview.js 注入到页面，运行期断言 + 排版 */

(function () {
  var templatesLib = __require('utils/templates.js')
  var render = __require('utils/render.js')
  var qrCanvas = __require('utils/qr-canvas.js')
  var wifi = __require('utils/wifi.js')

  var sheet = document.getElementById('sheet')
  var lines = []
  var pass = 0
  var fail = 0

  function ok (name, cond, detail) {
    if (cond) {
      pass++
      lines.push('  ✓ ' + name)
    } else {
      fail++
      lines.push('  ✗ ' + name + (detail ? '  [' + detail + ']' : ''))
    }
  }

  var payload = wifi.buildWifiString({
    ssid: 'Shiguang-Cafe',
    password: 'coffee2024',
    type: 'WPA'
  }).value

  var W = 260
  var H = Math.round(W * 4 / 3)
  var DPR = 2

  lines.push('[1] 六套模板渲染与像素校验')
  lines.push('  载荷: ' + payload)

  templatesLib.TEMPLATES.forEach(function (tpl) {
    var cell = document.createElement('div')
    cell.className = 'cell'

    var canvas = document.createElement('canvas')
    canvas.width = W * DPR
    canvas.height = H * DPR
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    cell.appendChild(canvas)

    var cap = document.createElement('div')
    cap.className = 'cap'
    cap.innerHTML = tpl.name + '<span>' + tpl.id + '</span>'
    cell.appendChild(cap)

    sheet.appendChild(cell)

    var ctx = canvas.getContext('2d')
    ctx.scale(DPR, DPR)

    var meta
    try {
      meta = render.renderSign(ctx, tpl, {
        shopName: '拾光咖啡',
        ssid: 'Shiguang-Cafe',
        payload: payload
      }, W, H)
      ok(tpl.id + ' 渲染无异常', true)
    } catch (e) {
      ok(tpl.id + ' 渲染无异常', false, e && e.message)
      return
    }

    var qr = qrCanvas.createQR(payload, 'M')
    var n = qr.getModuleCount()
    ok(tpl.id + ' 模块数与矩阵一致', meta.qr.moduleCount === n, meta.qr.moduleCount + ' vs ' + n)

    var cellPx = meta.qr.size / (n + meta.qr.quiet * 2)
    var mismatch = 0
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var sx = meta.qr.x + (meta.qr.quiet + c + 0.5) * cellPx
        var sy = meta.qr.y + (meta.qr.quiet + r + 0.5) * cellPx
        var d = ctx.getImageData(Math.floor(sx * DPR), Math.floor(sy * DPR), 1, 1).data
        var lum = 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]
        if ((lum < 110) !== qr.isDark(r, c)) mismatch++
      }
    }
    ok(tpl.id + ' 像素与二进制矩阵一致', mismatch === 0, '不一致 ' + mismatch + ' 个')

    var quietBad = 0
    var mid = meta.qr.size / 2
    var edge = 1.8 * cellPx
    var probes = [
      [meta.qr.x + edge, meta.qr.y + mid, 'v'],
      [meta.qr.x + meta.qr.size - edge, meta.qr.y + mid, 'v'],
      [meta.qr.x + mid, meta.qr.y + edge, 'h'],
      [meta.qr.x + mid, meta.qr.y + meta.qr.size - edge, 'h']
    ]
    probes.forEach(function (p) {
      for (var k = -3; k <= 3; k++) {
        var px = p[2] === 'v' ? p[0] : p[0] + k * meta.qr.size / 8
        var py = p[2] === 'v' ? p[1] + k * meta.qr.size / 8 : p[1]
        var dd = ctx.getImageData(Math.floor(px * DPR), Math.floor(py * DPR), 1, 1).data
        if (Math.min(dd[0], dd[1], dd[2]) < 250) quietBad++
      }
    })
    ok(tpl.id + ' 静区 4 模块纯白', quietBad === 0, '脏点 ' + quietBad)
  })

  lines.push('')
  lines.push('[2] 超长文本自动缩小字号（用 ssid 槽位真实参数）')

  var measureCtx = document.createElement('canvas').getContext('2d')
  var ssidSlot = templatesLib.TEMPLATES[0].slots.ssid
  var baseSize = ssidSlot.size * Math.min(W, H)
  var maxWidth = ssidSlot.maxW * W
  var minScale = 0.42

  lines.push('  基准 ' + baseSize.toFixed(1) + 'px，可用宽度 ' + maxWidth.toFixed(1) + 'px，下限 ' +
    (baseSize * minScale).toFixed(1) + 'px')

  var samples = [
    'Cafe',
    'Shiguang-Cafe',
    'Shiguang-Cafe-Guests',
    'Shiguang-Cafe-Guests-2026-2F',
    '拾光咖啡',
    '拾光咖啡二楼靠窗的访客网络',
    '拾光咖啡二楼靠窗的访客网络专用通道'
  ]

  var shrunkCount = 0
  samples.forEach(function (text) {
    var res = render.fitText(measureCtx, text, maxWidth, baseSize, ssidSlot.weight, 'sans-serif', minScale)
    var w = render.measureText(measureCtx, res.text, res.size, ssidSlot.weight, 'sans-serif')
    ok('宽度不溢出 · ' + text.slice(0, 12), w <= maxWidth + 0.6, 'w=' + w.toFixed(1))
    ok('字号不低于下限 · ' + text.slice(0, 12), res.size >= baseSize * minScale - 0.01,
      res.size.toFixed(1) + ' < ' + (baseSize * minScale).toFixed(1))
    if (res.shrunk) shrunkCount++
    lines.push('      ' + (res.shrunk ? '↓ ' : '  ') + res.size.toFixed(1) + 'px  "' + res.text + '"')
  })

  ok('长名确实触发了缩小', shrunkCount >= 2, 'shrunk=' + shrunkCount)

  lines.push('')
  lines.push('[3] 结果: ' + pass + ' 项通过，' + fail + ' 项失败')

  var out = document.getElementById('result')
  out.textContent = lines.join('\n')
  document.title = (fail === 0 ? 'PASS' : 'FAIL') + ' ' + pass + '/' + (pass + fail)

  if (fail > 0) {
    console.error(lines.join('\n'))
  } else {
    console.log(lines.join('\n'))
  }
})()
