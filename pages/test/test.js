var wifi = require('../../utils/wifi')
var qrCanvas = require('../../utils/qr-canvas')

var DEMO = {
  ssid: 'Test',
  password: 'a;b"c',
  type: 'WPA'
}

function windowInfo () {
  try {
    return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (e) {
    return { windowWidth: 375, pixelRatio: 2 }
  }
}

Page({
  data: {
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
    var result = wifi.buildWifiString(DEMO)
    this.payload = result.value

    var info = windowInfo()
    // 与 .qr-wrap 的 560rpx 宽度对齐，避免 canvas 与容器尺寸不一致
    var size = Math.floor((info.windowWidth || 375) * 560 / 750)

    this.setData({
      canvasSize: size,
      payload: result.value,
      warnings: result.warnings,
      dpr: info.pixelRatio || 2
    })

    console.log('[test] payload =', result.value)
    console.log('[test] warnings =', JSON.stringify(result.warnings))
  },

  onReady: function () {
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
