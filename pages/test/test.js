var wifi = require('../../utils/wifi')
var qrCanvas = require('../../utils/qr-canvas')

// 两组示例：英文走纯 ASCII，中文走 3 字节 UTF-8
var DEMOS = {
  en: { ssid: 'Test', password: 'a;b"c', type: 'WPA' },
  zh: { ssid: '咖啡店', password: 'coffee2024', type: 'WPA' }
}

var DEMO_ORDER = ['en', 'zh']

function windowInfo () {
  try {
    return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (e) {
    return { windowWidth: 375, pixelRatio: 2 }
  }
}

Page({
  data: {
    demo: 'en',
    demos: [
      { key: 'en', label: '英文示例' },
      { key: 'zh', label: '中文示例' }
    ],
    ssid: '',
    password: '',
    canvasSize: 260,
    payload: '',
    moduleCount: 0,
    version: 0,
    dpr: 2,
    ec: 'M',
    quiet: 4,
    warnings: [],
    error: ''
  },

  onLoad: function () {
    var info = windowInfo()
    // 与 .qr-wrap 的 560rpx 宽度对齐，避免 canvas 与容器尺寸不一致
    var size = Math.floor((info.windowWidth || 375) * 560 / 750)

    this.setData({
      canvasSize: size,
      dpr: info.pixelRatio || 2
    })

    this.applyDemo(DEMO_ORDER[0])
  },

  onReady: function () {
    this.render()
  },

  applyDemo: function (key) {
    var demo = DEMOS[key] || DEMOS[DEMO_ORDER[0]]
    var result = wifi.buildWifiString(demo)
    this.payload = result.value

    this.setData({
      demo: key,
      ssid: demo.ssid,
      password: demo.password,
      payload: result.value,
      warnings: result.warnings
    })

    console.log('[test] demo=' + key + ' payload=' + result.value)
    console.log('[test] warnings=' + JSON.stringify(result.warnings))
  },

  switchDemo: function (e) {
    var key = e.currentTarget.dataset.demo
    if (!key || key === this.data.demo) return
    this.applyDemo(key)
    this.render()
  },

  render: function () {
    var that = this

    wx.createSelectorQuery()
      .in(this)
      .select('#qrcanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var item = res && res[0]

        if (!item || !item.node) {
          that.setData({ error: 'Canvas 节点获取失败，请检查 id 与 type="2d"' })
          console.error('[test] canvas node 未就绪')
          return
        }

        var canvas = item.node
        var ctx = canvas.getContext('2d')
        var dpr = windowInfo().pixelRatio || 2
        var cssSize = item.width || that.data.canvasSize

        canvas.width = Math.round(cssSize * dpr)
        canvas.height = Math.round(cssSize * dpr)
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, cssSize, cssSize)

        var meta = qrCanvas.drawQRCode(ctx, that.payload, {
          x: 0,
          y: 0,
          size: cssSize,
          quiet: 4,
          ec: 'M',
          dark: '#171614',
          light: '#FFFFFF'
        })

        that.setData({
          moduleCount: meta.moduleCount,
          version: meta.version,
          dpr: dpr,
          error: ''
        })

        console.log('[test] dpr=' + dpr + ' cssSize=' + cssSize +
          ' version=' + meta.version + ' modules=' + meta.moduleCount)
      })
  }
})
