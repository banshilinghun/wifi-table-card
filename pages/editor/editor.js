var templatesLib = require('../../utils/templates')
var render = require('../../utils/render')
var wifi = require('../../utils/wifi')
var store = require('../../utils/store')

var TYPES = [
  { key: 'WPA', label: 'WPA/WPA2' },
  { key: 'WEP', label: 'WEP' },
  { key: 'nopass', label: '无密码' }
]

function getDpr () {
  try {
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    return info.pixelRatio || 2
  } catch (e) {
    return 2
  }
}

function debounce (fn, wait) {
  var timer = null
  return function () {
    var args = arguments
    if (timer) clearTimeout(timer)
    timer = setTimeout(function () {
      timer = null
      fn.apply(null, args)
    }, wait)
  }
}

function timeLabel () {
  var d = new Date()
  var pad = function (n) { return n < 10 ? '0' + n : '' + n }
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

Page({
  data: {
    tplId: '',
    tplName: '',
    shopName: '',
    ssid: '',
    password: '',
    type: 'WPA',
    showPwd: false,
    types: TYPES,
    payload: '',
    warnings: [],
    ssidBytes: 0,
    ssidFilled: false,
    savedAt: '',
    previewW: 560,
    previewH: 747
  },

  onLoad: function (query) {
    var settings = store.getSettings() || {}
    var tplId = (query && query.tpl) || settings.lastTplId || 'minimal-white'

    this.template = templatesLib.getTemplate(tplId)

    // 表单实时值放在实例上，避免每次输入都 setData 造成光标跳动
    this.form = {
      shopName: '',
      ssid: '',
      password: '',
      type: 'WPA'
    }

    var draft = store.getDraft()
    if (draft && draft.tplId === this.template.id) {
      if (typeof draft.shopName === 'string') this.form.shopName = draft.shopName
      if (typeof draft.ssid === 'string') this.form.ssid = draft.ssid
      if (typeof draft.password === 'string') this.form.password = draft.password
      if (draft.type) this.form.type = draft.type
    }

    wx.setNavigationBarTitle({ title: this.template.name })

    var self = this
    this.renderLater = debounce(function () { self.render() }, 120)
    this.saveLater = debounce(function () { self.persist() }, 400)

    this.setData({
      tplId: this.template.id,
      tplName: this.template.name,
      shopName: this.form.shopName,
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type
    })

    this.refresh()
  },

  onReady: function () {
    this.render()
  },

  onHide: function () {
    this.persist()
  },

  onUnload: function () {
    this.persist()
  },

  onShopInput: function (e) {
    this.form.shopName = e.detail.value
    this.refresh()
  },

  onSsidInput: function (e) {
    this.form.ssid = e.detail.value
    this.refresh()
  },

  onPwdInput: function (e) {
    this.form.password = e.detail.value
    this.refresh()
  },

  togglePwd: function () {
    this.setData({ showPwd: !this.data.showPwd })
  },

  pickType: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.form.type) return
    this.form.type = key
    this.setData({ type: key })
    this.refresh()
  },

  refresh: function () {
    var result = wifi.buildWifiString({
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type
    })

    this.payload = result.value

    // 还没填名称时不弹校验（否则一进页面就是一片黄字），改成中性提示
    var warnings = this.form.ssid ? result.warnings : []

    this.setData({
      payload: result.value,
      warnings: warnings,
      ssidFilled: !!this.form.ssid,
      ssidBytes: wifi.byteLength(this.form.ssid)
    })

    this.renderLater()
    this.saveLater()
  },

  persist: function () {
    var ok = store.saveDraft({
      tplId: this.data.tplId,
      shopName: this.form.shopName,
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type,
      updatedAt: Date.now()
    })

    store.saveSettings({ lastTplId: this.data.tplId })

    if (ok) {
      this.setData({ savedAt: timeLabel() })
    }
  },

  render: function () {
    var that = this

    wx.createSelectorQuery()
      .in(this)
      .select('#preview')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var item = res && res[0]
        if (!item || !item.node) {
          // onLoad 阶段节点尚未就绪，onReady 会再画一次
          return
        }

        var canvas = item.node
        var ctx = canvas.getContext('2d')
        var dpr = getDpr()
        var w = item.width
        var h = item.height

        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        ctx.scale(dpr, dpr)

        var meta = render.renderSign(ctx, that.template, {
          shopName: that.form.shopName || '你的店名',
          ssid: that.form.ssid || '未命名 Wi-Fi',
          password: that.form.password,
          payload: that.payload
        }, w, h)

        console.log('[editor] ' + that.template.id + ' ' + w + '×' + h +
          ' qr=' + meta.qr.moduleCount + '模块' +
          (meta.ssid ? ' ssid字号=' + meta.ssid.size.toFixed(1) + (meta.ssid.shrunk ? '(已缩小)' : '') : '') +
          (meta.ssid && meta.ssid.truncated ? '(已截断)' : ''))
      })
  }
})
