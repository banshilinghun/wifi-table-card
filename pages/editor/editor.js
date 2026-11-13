var lib = require('../../templates/index')
var render = require('../../utils/render')
var wifi = require('../../utils/wifi')
var store = require('../../utils/store')

var TYPES = [
  { key: 'WPA', label: 'WPA/WPA2' },
  { key: 'WEP', label: 'WEP' },
  { key: 'nopass', label: '无密码' }
]

// 预览区上限（750rpx 设计稿）
var PREVIEW_MAX_W = 620
var PREVIEW_MAX_H = 700

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
    sceneLabel: '',
    region: '',
    shape: '',
    prints: [],
    canSwitch: false,
    printKey: '',
    printLabel: '',
    printSpec: '',
    qrMm: 0,
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
    previewH: 700
  },

  onLoad: function (query) {
    var settings = store.getSettings() || {}
    var tplId = (query && query.tpl) || settings.lastTplId || 'night-berth'

    this.template = lib.getTemplate(tplId)

    // 表单实时值放在实例上，避免每次输入都 setData 造成光标跳动
    this.form = { shopName: '', ssid: '', password: '', type: 'WPA' }

    var draft = store.getDraft()
    var printKey = this.template.prints[0]
    if (draft && draft.tplId === this.template.id) {
      if (typeof draft.shopName === 'string') this.form.shopName = draft.shopName
      if (typeof draft.ssid === 'string') this.form.ssid = draft.ssid
      if (typeof draft.password === 'string') this.form.password = draft.password
      if (draft.type) this.form.type = draft.type
      if (draft.printKey && this.template.prints.indexOf(draft.printKey) !== -1) {
        printKey = draft.printKey
      }
    }

    this.printKey = printKey

    wx.setNavigationBarTitle({ title: this.template.name })

    var self = this
    this.renderLater = debounce(function () { self.render() }, 120)
    this.saveLater = debounce(function () { self.persist() }, 400)

    this.setData({
      tplId: this.template.id,
      tplName: this.template.name,
      sceneLabel: lib.getScene(this.template.scene).label,
      region: this.template.region,
      shape: this.template.shape,
      shopName: this.form.shopName,
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type
    })

    this.applyPrint(printKey)
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

  /* ── 打印尺寸 ─────────────────────────────────────── */

  applyPrint: function (key) {
    var tpl = this.template
    var print = lib.getPrint(key)
    var ratio = lib.printRatio(tpl, key)
    var box = lib.fitBox(ratio, PREVIEW_MAX_W, PREVIEW_MAX_H)

    // 二维码在成品上的实际边长：slot.size 相对短边，短边即 min(mm)
    var portrait = key === 'card' && tpl.cardPortrait
    var pw = portrait ? print.h : print.w
    var ph = portrait ? print.w : print.h
    var qrMm = Math.round(tpl.slots.qr.size * Math.min(pw, ph))

    var opts = tpl.prints.map(function (k) {
      return { key: k, label: lib.getPrint(k).short, on: k === key }
    })

    this.printKey = key

    this.setData({
      prints: opts,
      canSwitch: opts.length > 1,
      printKey: key,
      printLabel: print.label,
      printSpec: print.spec,
      qrMm: qrMm,
      previewW: box.width,
      previewH: box.height
    })
  },

  pickPrint: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.printKey) return
    var self = this

    this.applyPrint(key)
    // 画布尺寸变了，等渲染层把新尺寸应用后再画
    wx.nextTick
      ? wx.nextTick(function () { self.render() })
      : setTimeout(function () { self.render() }, 30)
    this.persist()
  },

  /* ── 表单 ─────────────────────────────────────────── */

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
      printKey: this.printKey,
      shopName: this.form.shopName,
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type,
      updatedAt: Date.now()
    })

    store.saveSettings({ lastTplId: this.data.tplId, lastPrint: this.printKey })

    if (ok) this.setData({ savedAt: timeLabel() })
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
        var w = Math.round(item.width)
        var h = Math.round(item.height)
        if (!w || !h) return

        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        ctx.scale(dpr, dpr)

        var meta = render.renderSign(ctx, that.template, {
          shopName: that.form.shopName || '你的店名',
          ssid: that.form.ssid || '你的 Wi-Fi',
          password: that.form.password,
          payload: that.payload
        }, w, h)

        console.log('[editor] ' + that.template.id + ' / ' + that.printKey +
          ' ' + w + '×' + h +
          ' qr=' + meta.qr.moduleCount + '模块' +
          (meta.ssid ? ' ssid字号=' + meta.ssid.size.toFixed(1) + (meta.ssid.shrunk ? '(已缩小)' : '') : '') +
          (meta.ssid && meta.ssid.truncated ? '(已截断)' : ''))
      })
  }
})
