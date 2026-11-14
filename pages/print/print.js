/**
 * pages/print/print.js
 * 打印预览：A4 拼版 1 / 2 / 4 / 8 份，横竖切换，四种裁切线，300dpi 导出。
 *
 * 尺寸全部先在毫米里算（utils/print-layout），渲染时才乘「每毫米多少像素」：
 * 预览是 screenPx，导出是 300dpi（11.81 px/mm）。所以预览与成品是同一版式。
 */

var catalog = require('../../templates/catalog')
var repo = require('../../utils/repo')
var artwork = require('../../utils/art')
var printLib = require('../../utils/print-layout')
var sheetRender = require('../../utils/sheet-render')
var wifi = require('../../utils/wifi')
var boundsAll = require('../../packageTpl/art/bounds')

var PREVIEW_PAD = 48          // 预览画布左右留白（px）
var MINI_VERTICAL_MM = 80     // 卡片短边小于它就不画侧边竖排，太挤

Page({
  data: {
    tplId: '',
    tplName: '',
    layouts: [],
    layout: 'full',
    orientation: 'portrait',
    cuts: printLib.CUTS,
    cut: 'corner',
    narrow: false,
    canvasW: 0,
    canvasH: 0,
    planInfo: '',
    qrLabel: '',
    warn: '',
    exporting: false,
    outPath: '',
    outInfo: '',
    tip: '喷墨打印机用照片纸，颜色更鲜艳'
  },

  onLoad: function (q) {
    var that = this
    var tplId = (q && q.tpl) || ''
    var tpl = catalog.getTemplate(tplId)
    if (!tpl) {
      wx.showToast({ title: '模板不存在', icon: 'none' })
      return
    }
    this.tpl = tpl
    this.bounds = (tpl.series === 'paper' && boundsAll[tpl.art]) ? boundsAll[tpl.art] : null

    repo.getDraft().then(function (draft) {
      that.form = draft || {}
      that.payload = wifi.buildWifiString({
        ssid: that.form.ssid || '',
        password: that.form.password || '',
        type: that.form.type || 'WPA'
      }).value
      wx.setNavigationBarTitle({ title: '打印 · ' + tpl.name })
      that.setData({ tplId: tpl.id, tplName: tpl.name })
      that.refreshPlan()
    }).catch(function () {
      that.form = {}
      that.payload = ''
      that.refreshPlan()
    })
  },

  /* ── 版式 ─────────────────────────────────────────────── */

  refreshPlan: function () {
    var that = this
    var moduleCount = 33 // 典型 WPA 载荷（中文 SSID + 12 位密码）在 EC=M 下的模块数

    var opts = printLib.layoutOptions(this.data.orientation, this.data.narrow, moduleCount)
    var usable = opts.filter(function (o) { return o.usable })
    var layout = this.data.layout

    var cur = opts.filter(function (o) { return o.key === layout })[0]
    if (!cur || !cur.usable) {
      layout = usable.length ? usable[0].key : layout
    }

    var plan = printLib.planSheet({
      layout: layout,
      orientation: this.data.orientation,
      cut: this.data.cut,
      narrowMargin: this.data.narrow,
      moduleCount: moduleCount
    })
    this.plan = plan

    var win = wx.getWindowInfo()
    var cw = Math.max(120, (win.windowWidth || 375) - PREVIEW_PAD)
    var ch = Math.round(cw * plan.sheet.h / plan.sheet.w)

    var first = plan.cards[0]
    this.setData({
      layouts: opts,
      layout: layout,
      canvasW: Math.round(cw),
      canvasH: ch,
      qrLabel: plan.qrLabel,
      planInfo: plan.count + ' 份 · 每份 ' +
        first.logicalW.toFixed(0) + '×' + first.logicalH.toFixed(0) + 'mm · 码 ' + plan.qrMm + 'mm',
      warn: plan.usable ? '' : plan.warnings.join('；')
    }, function () {
      that.renderPreview()
    })
  },

  renderPreview: function () {
    var that = this
    var plan = this.plan
    if (!plan) return

    wx.createSelectorQuery().in(this).select('#sheet').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) return
      var canvas = res[0].node
      var ctx = canvas.getContext('2d')
      var dpr = Math.min(wx.getWindowInfo().pixelRatio || 2, 3)

      canvas.width = Math.round(res[0].width * dpr)
      canvas.height = Math.round(res[0].height * dpr)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)

      var pxPerMm = res[0].width / plan.sheet.w
      artwork.ensure(canvas, that.tpl.art).then(function (img) {
        sheetRender.renderSheet(ctx, plan, that.tpl || {}, that.formData(), {
          art: img,
          bounds: that.bounds,
          pxPerMm: pxPerMm,
          vertical: plan.cards[0].logicalW >= MINI_VERTICAL_MM
        })
      })
    })
  },

  formData: function () {
    var f = this.form || {}
    return {
      shopName: f.shopName || '',
      ssid: f.ssid || '',
      password: f.password || '',
      type: f.type || 'WPA',
      showPassword: f.showPassword !== false,
      payload: this.payload || ''
    }
  },

  pickLayout: function (e) {
    var key = e.currentTarget.dataset.key
    var opt = this.data.layouts.filter(function (o) { return o.key === key })[0]
    if (opt && !opt.usable) {
      wx.showToast({ title: opt.reason || '该版式不可用', icon: 'none' })
      return
    }
    this.setData({ layout: key, outPath: '' }, this.refreshPlan.bind(this))
  },

  pickOrientation: function (e) {
    var v = e.currentTarget.dataset.v
    if (v === this.data.orientation) return
    this.setData({ orientation: v, outPath: '' }, this.refreshPlan.bind(this))
  },

  pickCut: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ cut: key, outPath: '' }, this.refreshPlan.bind(this))
  },

  toggleNarrow: function () {
    this.setData({ narrow: !this.data.narrow, outPath: '' }, this.refreshPlan.bind(this))
  },

  /* ── 导出 ─────────────────────────────────────────────── */

  exportSheet: function () {
    this.exportAt(300, true)
  },

  /**
   * @param {number} dpi 300 或 200
   * @param {boolean} allowFallback 失败后是否降到 200dpi 再试
   */
  exportAt: function (dpi, allowFallback) {
    var that = this
    var plan = this.plan
    if (!plan) return

    var px = printLib.pixelSize(plan.sheet, dpi)
    this.setData({ exporting: true, outPath: '', outInfo: '' })
    wx.showLoading({ title: dpi + 'dpi 导出中', mask: true })

    function fallback (why) {
      wx.hideLoading()
      console.warn('[print] ' + dpi + 'dpi 失败：' + why)
      if (allowFallback) {
        wx.showToast({ title: '内存不足，降到 200dpi', icon: 'none', duration: 1200 })
        that.exportAt(200, false)
        return
      }
      that.setData({ exporting: false })
      wx.showToast({ title: '导出失败，换少份数试试', icon: 'none' })
    }

    var canvas = null
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: px.w, height: px.h })
    } catch (e) {
      fallback('createOffscreenCanvas ' + (e && e.message))
      return
    }

    var ctx = canvas.getContext('2d')
    if (!ctx) { fallback('getContext 失败'); return }

    artwork.ensure(canvas, this.tpl.art).then(function (img) {
      sheetRender.renderSheet(ctx, plan, that.tpl, that.formData(), {
        art: img,
        bounds: that.bounds,
        pxPerMm: dpi / 25.4,
        vertical: plan.cards[0].logicalW >= MINI_VERTICAL_MM
      })

      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: px.w, height: px.h,
        destWidth: px.w, destHeight: px.h,
        fileType: 'jpg',
        quality: 0.95,
        success: function (res) {
          wx.hideLoading()
          that.setData({
            exporting: false,
            outPath: res.tempFilePath,
            outInfo: dpi + 'dpi · ' + px.w + '×' + px.h
          })
          that.rememberWork()
        },
        fail: function (err) {
          fallback((err && err.errMsg) || 'canvasToTempFilePath')
        }
      })
    }).catch(function (err) {
      fallback((err && err.message) || '装饰图加载失败')
    })
  },

  /** 导出成功就记一条作品（数据只在本机） */
  rememberWork: function () {
    var f = this.form || {}
    repo.saveWork({
      tplId: this.tpl.id,
      tplName: this.tpl.name,
      title: f.shopName || this.tpl.name,
      shopName: f.shopName || '',
      ssid: f.ssid || '',
      password: f.password || '',
      type: f.type || 'WPA',
      showPassword: f.showPassword !== false,
      printKey: this.data.layout,
      thumb: ''
    }).catch(function (e) { console.warn('[print] 保存作品失败', e) })
  },

  saveAlbum: function () {
    var path = this.data.outPath
    if (!path) return
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () { wx.showToast({ title: '已存入相册' }) },
      fail: function (err) {
        var msg = (err && err.errMsg) || ''
        if (/auth|deny|cancel/i.test(msg)) {
          wx.showModal({
            title: '需要相册权限',
            content: '去设置里打开「保存到相册」后再试',
            confirmText: '去设置',
            success: function (r) { if (r.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  shareImage: function () {
    var path = this.data.outPath
    if (!path) return
    if (!wx.showShareImageMenu) {
      wx.showToast({ title: '当前微信版本不支持', icon: 'none' })
      return
    }
    wx.showShareImageMenu({
      path: path,
      fail: function (err) { console.warn('[print] 分享取消', err) }
    })
  },

  /** 预览大图 */
  previewFull: function () {
    if (!this.data.outPath) return
    wx.previewImage({ urls: [this.data.outPath], current: this.data.outPath })
  }
})
