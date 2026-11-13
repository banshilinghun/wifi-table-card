/**
 * tools/verify-qr.js  ——  开发期离线校验，不参与小程序打包（见 project.config.json 的 packOptions.ignore）
 *
 * 作用：
 *   1. 断言 utils/wifi.js 的转义与 nopass 分支
 *   2. 用与小程序页面完全相同的 utils/qr-canvas.js 逻辑，在一个记录型 context 上绘制
 *   3. 输出真实 PNG，便于肉眼与扫码器核对
 *
 * 运行：node tools/verify-qr.js
 */

var fs = require('fs')
var path = require('path')
var zlib = require('zlib')
var cp = require('child_process')

var wifi = require('../utils/wifi')
var qrCanvas = require('../utils/qr-canvas')

/* ---------- 断言 ---------- */

var pass = 0
var fail = 0

function check (name, actual, expected) {
  if (actual === expected) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fail++
    console.log('  ✗ ' + name)
    console.log('      期望: ' + JSON.stringify(expected))
    console.log('      实际: ' + JSON.stringify(actual))
  }
}

console.log('\n[1] utils/wifi.js')

var demo = wifi.buildWifiString({ ssid: 'Test', password: 'a;b"c', type: 'WPA' })
check('SSID=Test 密码=a;b"c', demo.value, 'WIFI:T:WPA;S:Test;P:a\\;b\\"c;;')
// 密码 a;b"c 仅 5 位，低于 WPA 的 8 位下限，应产生且仅产生一条长度提示
check('  → 命中密码长度提示', demo.warnings.length, 1)
console.log('      警告内容: ' + demo.warnings.join(' | '))

check('nopass 不写 P 字段',
  wifi.buildWifiString({ ssid: 'Test', password: '', type: 'nopass' }).value,
  'WIFI:T:nopass;S:Test;;')

check('冒号转义',
  wifi.escapeField('a:b'), 'a\\:b')
check('逗号转义',
  wifi.escapeField('a,b'), 'a\\,b')
check('反斜杠转义',
  wifi.escapeField('a\\b'), 'a\\\\b')
check('双引号转义',
  wifi.escapeField('a"b'), 'a\\"b')
check('分号转义',
  wifi.escapeField('a;b'), 'a\\;b')

var spaceSsid = wifi.buildWifiString({ ssid: ' Test ', password: '12345678' })
check('SSID 首尾空格 → 有警告', spaceSsid.warnings.length > 0, true)
console.log('      警告内容: ' + spaceSsid.warnings.join(' | '))

var spacePwd = wifi.buildWifiString({ ssid: 'Test', password: ' 12345678 ' })
check('密码首尾空格 → 有警告', spacePwd.warnings.length > 0, true)
console.log('      警告内容: ' + spacePwd.warnings.join(' | '))

check('中文 SSID 字节数', wifi.byteLength('咖啡一号'), 12)

/* ---------- 记录型 Canvas 2D context ---------- */

function parseColor (style) {
  var s = String(style).trim()
  if (s.charAt(0) === '#') {
    var hex = s.slice(1)
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ]
  }
  var m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    var parts = m[1].split(',').map(function (v) { return parseFloat(v) })
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0]
  }
  return [0, 0, 0]
}

function RecordingContext (size) {
  this.size = size
  this.fillStyle = '#000000'
  this.data = Buffer.alloc(size * size * 3, 255)
}

RecordingContext.prototype.fillRect = function (x, y, w, h) {
  var color = parseColor(this.fillStyle)
  var x0 = Math.max(0, Math.round(x))
  var y0 = Math.max(0, Math.round(y))
  var x1 = Math.min(this.size, Math.round(x + w))
  var y1 = Math.min(this.size, Math.round(y + h))
  for (var py = y0; py < y1; py++) {
    for (var px = x0; px < x1; px++) {
      var i = (py * this.size + px) * 3
      this.data[i] = color[0]
      this.data[i + 1] = color[1]
      this.data[i + 2] = color[2]
    }
  }
}

/* ---------- PNG 编码（无第三方依赖） ---------- */

var CRC_TABLE = (function () {
  var table = new Int32Array(256)
  for (var n = 0; n < 256; n++) {
    var c = n
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c
  }
  return table
})()

function crc32 (buf) {
  var c = -1
  for (var i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ -1) >>> 0
}

function chunk (type, data) {
  var len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  var typeBuf = Buffer.from(type, 'ascii')
  var crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG (size, rgb) {
  var raw = Buffer.alloc((size * 3 + 1) * size)
  for (var y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
  }
  var ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- 渲染 + 回读 ---------- */

function renderToPNG (text, size, file) {
  var ctx = new RecordingContext(size)
  qrCanvas.drawQRCode(ctx, text, {
    x: 0,
    y: 0,
    size: size,
    quiet: 4,
    ec: 'M',
    dark: '#171614',
    light: '#FFFFFF'
  })
  fs.writeFileSync(file, encodePNG(size, ctx.data))
  return file
}

function decodePNG (file) {
  var out = ''
  try {
    out = cp.execFileSync('swift', [path.join(__dirname, 'decode.swift'), file], { encoding: 'utf8' })
  } catch (err) {
    // 解不出字符串时 swift 以退出码 1 结束，载荷不会出现在 stdout
    out = String(err.stdout || '')
  }
  var line = out.split('\n').filter(function (l) { return l.indexOf('载荷: ') === 0 })[0]
  return line ? line.slice(4) : null
}

/* ---------- 渲染 ---------- */

var SIZE = parseInt(process.env.QR_SIZE, 10) || 620
var ctx = new RecordingContext(SIZE)

console.log('\n[2] utils/qr-canvas.js 绘制')

var meta = qrCanvas.drawQRCode(ctx, demo.value, {
  x: 0,
  y: 0,
  size: SIZE,
  quiet: 4,
  ec: 'M',
  dark: '#171614',
  light: '#FFFFFF'
})

console.log('  载荷: ' + demo.value)
console.log('  版本: ' + meta.version + ' 版')
console.log('  模块: ' + meta.moduleCount + ' × ' + meta.moduleCount)
console.log('  单元: ' + meta.cell.toFixed(2) + ' px（含 ' + meta.quiet + ' 模块静区）')

var outDir = path.join(__dirname, 'out')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
var outFile = path.join(outDir, 'qr-test.png')
fs.writeFileSync(outFile, encodePNG(SIZE, ctx.data))
console.log('  PNG: ' + outFile + ' (' + fs.statSync(outFile).size + ' bytes)')

/* ---------- 解码一致性：把图读回来，与原文逐字符比对 ---------- */

console.log('\n[3] 扫码解码一致性（系统 CIDetector 回读）')

var hasSwift = false
try {
  hasSwift = cp.spawnSync('swift', ['--version'], { stdio: 'ignore' }).status === 0
} catch (e) {
  hasSwift = false
}

var decodeCases = [
  {
    name: 'SSID=咖啡店（3 字节 UTF-8）',
    payload: wifi.buildWifiString({ ssid: '咖啡店', password: 'coffee2024' }).value,
    expected: 'WIFI:T:WPA;S:咖啡店;P:coffee2024;;'
  },
  {
    name: 'SSID=Café☕（重音符 + 符号）',
    payload: wifi.buildWifiString({ ssid: 'Café☕', password: 'cafe2024' }).value,
    expected: 'WIFI:T:WPA;S:Café☕;P:cafe2024;;'
  },
  {
    name: 'SSID=Café☕🎉（含 4 字节代理对）',
    payload: wifi.buildWifiString({ ssid: 'Café☕🎉', password: 'cafe2024' }).value,
    expected: 'WIFI:T:WPA;S:Café☕🎉;P:cafe2024;;'
  }
]

if (!hasSwift) {
  console.log('  ! 未检测到 swift，解码校验未执行（不计为通过）')
  fail++
} else {
  decodeCases.forEach(function (item, i) {
    check(item.name + ' · 载荷格式', item.payload, item.expected)
    var file = renderToPNG(item.payload, SIZE, path.join(outDir, 'decode-' + i + '.png'))
    var decoded = decodePNG(file)
    check(item.name + ' · 回读一致', decoded, item.payload)
    console.log('      原文: ' + item.payload)
    console.log('      回读: ' + (decoded === null ? '(解码失败)' : decoded))
  })
}

/* ---------- ASCII 预览（便于快速核对定位图案） ---------- */

console.log('\n[4] 矩阵预览（## = 深色模块）')
var qr = qrCanvas.createQR(demo.value, 'M')
var count = qr.getModuleCount()
var quiet = 2
for (var r = -quiet; r < count + quiet; r++) {
  var line = '  '
  for (var c = -quiet; c < count + quiet; c++) {
    if (r < 0 || c < 0 || r >= count || c >= count) {
      line += '  '
    } else {
      line += qr.isDark(r, c) ? '██' : '  '
    }
  }
  console.log(line)
}

console.log('\n结果: ' + pass + ' 项通过' + (fail ? '，' + fail + ' 项失败' : '，0 项失败') + '\n')
if (fail) process.exit(1)
