var templatesLib = require('../../utils/templates')
var render = require('../../utils/render')
var wifi = require('../../utils/wifi')

// 缩略图统一用同一份示例数据，方便横向对比模板差异
var SAMPLE = {
  shopName: '拾光咖啡',
  ssid: 'Shiguang-Cafe',
  password: 'coffee2024',
  type: 'WPA'
}

function getDpr () {
  try {
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    return info.pixelRatio || 2
  } catch (e) {
    return 2
  }
}

Page({
  data: {
    templates: [],
    cardW: 331,
    cardH: 441,
    version: '0.2.0'
  },

  onLoad: function () {
    var payload = wifi.buildWifiString(SAMPLE).value
    this.payload = payload

    var list = templatesLib.TEMPLATES.map(function (tpl) {
      return {
        id: tpl.id,
        name: tpl.name,
        tag: tpl.tag,
        accent: tpl.palette.accent,
        bg: tpl.palette.bg
      }
    })

    this.setData({ templates: list })
    console.log('[index] 模板数 = ' + list.length)
  },

  onReady: function () {
    this.drawThumbs()
  },

  drawThumbs: function () {
    var that = this
    var tpls = templatesLib.TEMPLATES
    var dpr = getDpr()

    wx.createSelectorQuery()
      .in(this)
      .selectAll('.thumb')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var items = (res && res[0]) || []

        if (!items.length) {
          console.error('[index] 缩略图节点未就绪')
          return
        }

        items.forEach(function (item, index) {
          var tpl = tpls[index]
          if (!tpl || !item.node) return

          var canvas = item.node
          var ctx = canvas.getContext('2d')
          var w = item.width
          var h = item.height

          canvas.width = Math.round(w * dpr)
          canvas.height = Math.round(h * dpr)
          ctx.scale(dpr, dpr)

          var meta = render.renderSign(ctx, tpl, {
            shopName: SAMPLE.shopName,
            ssid: SAMPLE.ssid,
            payload: that.payload
          }, w, h)

          console.log('[index] ' + tpl.id + ' ' + w + '×' + h + ' qr=' + meta.qr.moduleCount + '模块')
        })
      })
  },

  openEditor: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/editor/editor?tpl=' + id })
  },

  goTest: function () {
    wx.navigateTo({ url: '/pages/test/test' })
  }
})
