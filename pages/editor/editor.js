/**
 * pages/editor/editor.js
 * 编辑页：预览 + 表单 + 打印尺寸 + 收藏 + 进入打印。
 *
 * 两套模板的差别都收在 utils/draw 里，这里只负责「拿数据 → 画 → 存」。
 * 白纸系列需要先加载装饰图（utils/art），深色系列不需要。
 */

var catalog = require('../../templates/catalog')
var repo = require('../../utils/repo')
var artwork = require('../../utils/art')
var draw = require('../../utils/draw')
var wifi = require('../../utils/wifi')
var qrMetrics = require('../../utils/qr-metrics')
var boundsAll = require('../../packageTpl/art/bounds')

var TYPES = [
  { key: 'WPA', label: 'WPA/WPA2' },
  { key: 'WEP', label: 'WEP' },
  { key: 'nopass', label: '无密码' }
]

var PREVIEW_MAX_W = 620
var PREVIEW_MAX_H = 760

function getDpr () {
  try {
    return Math.min(wx.getWindowInfo().pixelRatio || 2, 3)
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

/**
 * 二维码边长（mm）。不写死比例：白纸跑排版、深色读 slots，
 * 再用载荷真实模块数算单模块大小——同一个模板换个长密码就会变。
 */
function qrInfo (tpl, data, bounds, print) {
  var m = qrMetrics.measure({
    tpl: tpl, data: data, bounds: bounds, cardW: print.w, cardH: print.h
  })
  return {
    qrMm: Math.round(m.qrMm),
    note: m.moduleCount + ' 模块 · 单模块 ' + m.moduleMm.toFixed(2) + 'mm'
  }
}

Page({
  data: {
    tplId: '',
    tplName: '',
    isPaper: false,
    sceneLabel: '',
    region: '',
    shape: '',
    prints: [],
    canSwitch: false,
    printKey: '',
    printLabel: '',
    printSpec: '',
    qrMm: 0,
    qrNote: '',
    textNote: '',
    shopName: '',
    ssid: '',
    password: '',
    type: 'WPA',
    showPwd: false,
    showPassword: true,
    showVertical: true,
    fav: false,
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
    var that = this
    var tplId = (query && query.tpl) || 'paper-milktea'
    this.template = catalog.getTemplate(tplId) || catalog.TEMPLATES[0]
    this.bounds = this.template.series === 'paper' ? (boundsAll[this.template.art] || null) : null

    this.form = { shopName: '', ssid: '', password: '', type: 'WPA' }
    this.showPassword = true
    this.showVertical = true

    wx.setNavigationBarTitle({ title: this.template.name })

    this.renderLater = debounce(function () { that.render() }, 120)
    this.saveLater = debounce(function () { that.persist() }, 400)

    this.setData({
      tplId: this.template.id,
      tplName: this.template.name,
      isPaper: this.template.series === 'paper',
      sceneLabel: catalog.sceneText(this.template),
      region: this.template.region,
      shape: this.template.shape
    })

    // 先按草稿占位，读到真草稿再覆盖
    var printKey = this.template.prints.indexOf('a4') !== -1 ? 'a4' : this.template.prints[0]
    this.printKey = printKey
    this.applyPrint(printKey)

    repo.getDraft().then(function (draft) {
      if (draft && draft.tplId === that.template.id) {
        if (typeof draft.shopName === 'string') that.form.shopName = draft.shopName
        if (typeof draft.ssid === 'string') that.form.ssid = draft.ssid
        if (typeof draft.password === 'string') that.form.password = draft.password
        if (draft.type) that.form.type = draft.type
        if (typeof draft.showPassword === 'boolean') that.showPassword = draft.showPassword
        if (typeof draft.showVertical === 'boolean') that.showVertical = draft.showVertical
        if (draft.printKey && that.template.prints.indexOf(draft.printKey) !== -1) {
          that.printKey = draft.printKey
        }
      }
      that.setData({
        shopName: that.form.shopName,
        ssid: that.form.ssid,
        password: that.form.password,
        type: that.form.type,
        showPassword: that.showPassword,
        showVertical: that.showVertical
      })
      that.applyPrint(that.printKey)
      that.refresh()
      that.checkFav()
    }).catch(function () {
      that.refresh()
      that.checkFav()
    })
  },

  onReady: function () {
    this.render()
  },

  onHide: function () { this.persist() },
  onUnload: function () { this.persist() },

  onShareAppMessage: function () {
    // 分享模板：只带模板 id，不带 Wi-Fi 名称与密码
    return {
      title: '这个 Wi-Fi 桌牌挺好看 · ' + this.template.name,
      path: '/pages/editor/editor?tpl=' + this.template.id
    }
  },

  /* ── 收藏 ───────────────────────────────────────────── */

  checkFav: function () {
    var that = this
    repo.isFavorite(this.template.id).then(function (v) {
      that.setData({ fav: v })
    }).catch(function () {})
  },

  toggleFav: function () {
    var that = this
    repo.toggleFavorite(this.template.id).then(function (res) {
      that.setData({ fav: res.favorited })
      wx.vibrateShort && wx.vibrateShort({ type: 'light' })
      wx.showToast({ title: res.favorited ? '已收藏' : '已取消收藏', icon: 'none', duration: 900 })
    }).catch(function () {
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  /* ── 打印尺寸 ───────────────────────────────────────── */

  applyPrint: function (key) {
    var tpl = this.template
    var print = catalog.getPrint(key)
    var ratio = catalog.printRatio(tpl, key)
    var box = catalog.fitBox(ratio, PREVIEW_MAX_W, PREVIEW_MAX_H)

    var info = qrInfo(tpl, {
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type,
      showPassword: this.showPassword,
      payload: this.payload,
      miniCodeUrl: ''
    }, this.bounds, print)

    var opts = tpl.prints.map(function (k) {
      return { key: k, label: catalog.getPrint(k).short, on: k === key }
    })

    this.printKey = key

    this.setData({
      prints: opts,
      canSwitch: opts.length > 1,
      printKey: key,
      printLabel: print.label,
      printSpec: print.spec,
      qrMm: info.qrMm,
      qrNote: info.note,
      previewW: box.width,
      previewH: box.height
    })
  },

  pickPrint: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.printKey) return
    var that = this
    this.applyPrint(key)
    wx.nextTick
      ? wx.nextTick(function () { that.render() })
      : setTimeout(function () { that.render() }, 30)
    this.persist()
  },

  toggleVertical: function () {
    this.showVertical = !this.showVertical
    this.setData({ showVertical: this.showVertical })
    this.renderLater()
    this.saveLater()
  },

  /* ── 表单 ───────────────────────────────────────────── */

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

  toggleShowPassword: function () {
    this.showPassword = !this.showPassword
    this.setData({ showPassword: this.showPassword })
    this.renderLater()
    this.saveLater()
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

    this.setData({
      payload: result.value,
      warnings: this.form.ssid ? result.warnings : [],
      ssidFilled: !!this.form.ssid,
      ssidBytes: wifi.byteLength(this.form.ssid)
    })

    this.renderLater()
    this.saveLater()
  },

  persist: function () {
    var that = this
    repo.saveDraft({
      tplId: this.data.tplId,
      printKey: this.printKey,
      shopName: this.form.shopName,
      ssid: this.form.ssid,
      password: this.form.password,
      type: this.form.type,
      showPassword: this.showPassword,
      showVertical: this.showVertical
    }).then(function () {
      that.setData({ savedAt: timeLabel() })
    }).catch(function () {})

    repo.saveSettings({ lastTplId: this.data.tplId, lastPrint: this.printKey }).catch(function () {})
  },

  /* ── 渲染 ───────────────────────────────────────────── */

  render: function () {
    var that = this
    var print = catalog.getPrint(this.printKey)
    var tpl = this.template

    wx.createSelectorQuery()
      .in(this)
      .select('#preview')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var item = res && res[0]
        if (!item || !item.node) return

        var canvas = item.node
        var ctx = canvas.getContext('2d')
        var dpr = getDpr()
        var w = Math.round(item.width)
        var h = Math.round(item.height)
        if (!w || !h) return

        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        ctx.scale(dpr, dpr)

        var data = {
          shopName: that.form.shopName || (tpl.series === 'paper' ? '你的店名' : '你的店名'),
          ssid: that.form.ssid || '你的 Wi-Fi',
          password: that.form.password,
          type: that.form.type,
          showPassword: that.showPassword,
          payload: that.payload,
          mm: { w: print.w, h: print.h }
        }

        var ready = tpl.series === 'paper'
          ? artwork.ensure(canvas, tpl.art)
          : Promise.resolve(null)

        ready.then(function (img) {
          var meta = draw.drawTemplate(ctx, tpl, data, w, h, {
            art: img,
            bounds: that.bounds,
            mm: { w: print.w, h: print.h },
            vertical: that.showVertical
          })

          // 二维码的真实毫米数：画布宽 = print.w 毫米，按比例倒推，
          // 两套渲染器都适用（深色只出像素，白纸自己换算过）
          var mmPerPx = print.w / w
          var qrPx = meta.qr ? meta.qr.size : 0
          var qrMm = qrPx ? Math.round(qrPx * mmPerPx) : that.data.qrMm
          var mods = meta.qr ? (meta.qr.moduleCount || 0) : 0
          var moduleMm = mods ? (qrPx * mmPerPx) / (mods + (meta.qr.quiet || 4) * 2) : 0

          var textBits = []
          if (meta.ssid && meta.ssid.truncated) textBits.push('网络名在卡片上已省略')
          if (meta.pwd && meta.pwd.truncated) textBits.push('密码在卡片上已省略')

          var patch = { textNote: textBits.join('；') }
          if (qrMm && qrMm !== that.data.qrMm) patch.qrMm = qrMm
          if (mods) patch.qrNote = mods + ' 模块 · 单模块 ' + moduleMm.toFixed(2) + 'mm'
          that.setData(patch)

          var extra = ''
          if (tpl.series === 'paper') {
            extra = ' 码' + (meta.qr.sizeMm ? meta.qr.sizeMm.toFixed(1) + 'mm' : '') +
              (meta.qr.moduleMm ? '/模块' + meta.qr.moduleMm.toFixed(2) + 'mm' : '') +
              (meta.scale < 1 ? ' 已缩字×' + meta.scale.toFixed(2) : '') +
              (meta.warnings && meta.warnings.length ? ' ⚠' + meta.warnings.join(';') : '')
          } else {
            extra = ' 提示语' + (meta.hintSkipped ? '隐藏(' + meta.hintSkipped + ')' : '在') +
              (meta.ssid && meta.ssid.shrunk ? ' 已缩字' : '')
          }

          console.log('[editor] ' + tpl.id + ' / ' + that.printKey + ' ' + w + '×' + h +
            ' 模块数=' + (meta.qr ? meta.qr.moduleCount : '?') + extra)
        }).catch(function (e) {
          console.warn('[editor] 渲染失败', e)
        })
      })
  },

  /* ── 跳转 ───────────────────────────────────────────── */

  goPrint: function () {
    this.persist()
    wx.navigateTo({ url: '/pages/print/print?tpl=' + this.template.id })
  }
})
