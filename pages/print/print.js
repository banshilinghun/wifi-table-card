/**
 * pages/print/print.js
 * 打印预览：A4 拼版 1 / 2 / 4 / 8 份，横竖切换，四种裁切线，300dpi 导出。
 *
 * 尺寸全部先在毫米里算（utils/print-layout），渲染时才乘「每毫米多少像素」：
 * 预览是 screenPx，导出是 300dpi（11.81 px/mm）。所以预览与成品是同一版式。
 *
 * 三个「必须保留」的东西：
 *   1. 模板样式 —— 走 utils/draw 的分派，深色系列画深色，
 *      不再统一按白纸画（旧版这里会把深色模板画成白纸）。
 *   2. 模板比例 —— 从 tpl.shape 取 ratio，1:1 / 2:1 / 1:2 都按自己的宽高比排版。
 *   3. 编辑页的开关状态 —— 侧边竖排是否显示，读草稿里的 showVertical。
 *
 * 二维码尺寸不猜：模块数用载荷真实编码结果（utils/qr-metrics），
 * 边长用渲染器自己的排版比例，两者相除得到单模块毫米数，低于下限就禁用该版式。
 */

var catalog = require('../../templates/catalog')
var repo = require('../../utils/repo')
var artwork = require('../../utils/art')
var printLib = require('../../utils/print-layout')
var sheetRender = require('../../utils/sheet-render')
var qrMetrics = require('../../utils/qr-metrics')
var wifi = require('../../utils/wifi')
var privacy = require('../../utils/privacy')
var boundsAll = require('../../packageTpl/art/bounds')

var PREVIEW_PAD = 48          // 预览画布左右留白（px）
/** 侧边竖排小字的字号下限（mm）。低于它就自动不画，避免印出一条看不清的灰线 */
var VERTICAL_MIN_MM = 2.0
var VERTICAL_RATIO = 0.026    // 与 paper-render 的 BASE.vertical 一致

Page({
  data: {
    tplId: '',
    tplName: '',
    shapeText: '',
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
    moduleInfo: '',
    vertical: true,
    note: '',
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
    this.ratio = catalog.shapeRatio(tpl) || printLib.DEFAULT_RATIO
    this.bounds = (tpl.series === 'paper' && boundsAll[tpl.art]) ? boundsAll[tpl.art] : null
    this.showVerticalDraft = true

    wx.setNavigationBarTitle({ title: '打印 · ' + tpl.name })
    this.setData({ tplId: tpl.id, tplName: tpl.name, shapeText: tpl.shape })

    repo.getDraft().then(function (draft) {
      that.applyDraft(draft)
    }).catch(function (e) {
      console.warn('[print] 草稿读取失败，按空表单打印', e)
      that.applyDraft(null)
    })
  },

  /** 草稿 → 本次打印的数据与尺寸前提 */
  applyDraft: function (draft) {
    var d = draft || {}
    this.form = d
    this.payload = wifi.buildWifiString({
      ssid: d.ssid || '',
      password: d.password || '',
      type: d.type || 'WPA'
    }).value

    // 侧边竖排：编辑页关掉过就一直是关的；这里不再自作主张按尺寸打开
    this.showVerticalDraft = d.showVertical !== false

    var probe = {
      shopName: d.shopName || '',
      ssid: d.ssid || '',
      password: d.password || '',
      type: d.type || 'WPA',
      showPassword: d.showPassword !== false,
      payload: this.payload
    }
    this.moduleCount = qrMetrics.moduleCount(this.payload)
    this.qrRatio = qrMetrics.qrRatio(this.tpl, probe, this.bounds)
    this.probe = probe

    this.refreshPlan()
  },

  /* ── 版式 ─────────────────────────────────────────────── */

  refreshPlan: function () {
    var that = this
    var moduleCount = this.moduleCount

    var opts = printLib.layoutOptions(this.data.orientation, this.data.narrow, {
      moduleCount: moduleCount,
      ratio: this.ratio,
      qrRatio: this.qrRatio
    })
    var usable = opts.filter(function (o) { return o.usable })
    var layout = this.data.layout
    var cur = opts.filter(function (o) { return o.key === layout })[0]
    var fellBack = ''

    if (!cur || !cur.usable) {
      if (usable.length) {
        layout = usable[0].key
        fellBack = '「' + (cur ? cur.label : '当前版式') + '」扫不出来，已切到「' +
          usable[0].label + '」：' + (cur ? cur.reason : '')
      } else {
        layout = opts[0].key
        fellBack = '这份载荷在所有版式下都低于扫码下限，请缩短网络名或密码'
      }
    }

    var plan = printLib.planSheet({
      layout: layout,
      orientation: this.data.orientation,
      cut: this.data.cut,
      narrowMargin: this.data.narrow,
      moduleCount: moduleCount,
      ratio: this.ratio,
      qrRatio: this.qrRatio
    })
    this.plan = plan

    var win = wx.getWindowInfo()
    var cw = Math.max(120, (win.windowWidth || 375) - PREVIEW_PAD)
    var ch = Math.round(cw * plan.sheet.h / plan.sheet.w)

    var first = plan.cards[0]
    var shortMm = Math.min(first.logicalW, first.logicalH)
    var verticalRoom = VERTICAL_RATIO * shortMm >= VERTICAL_MIN_MM && !!this.tpl.vertical
    var vertical = this.tpl.series === 'paper' && this.showVerticalDraft && verticalRoom

    var note = ''
    if (this.tpl.series === 'paper' && this.showVerticalDraft && !verticalRoom) {
      note = '卡片短边 ' + shortMm.toFixed(0) + 'mm，侧边竖排小字印出来只有 ' +
        (VERTICAL_RATIO * shortMm).toFixed(1) + 'mm，已自动隐藏（可以换大一点的版式）'
    }

    this.setData({
      layouts: opts,
      layout: layout,
      canvasW: Math.round(cw),
      canvasH: ch,
      qrLabel: plan.qrLabel,
      vertical: vertical,
      note: note,
      planInfo: plan.count + ' 份 · 每份 ' +
        first.logicalW.toFixed(0) + '×' + first.logicalH.toFixed(0) + 'mm',
      moduleInfo: '二维码 ' + plan.qrMm + 'mm · ' + moduleCount + ' 模块 · 单模块 ' +
        plan.moduleMm.toFixed(2) + 'mm',
      warn: fellBack || (plan.usable ? '' : plan.warnings.join('；'))
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
      var artReady = that.tpl.series === 'paper'
        ? artwork.ensure(canvas, that.tpl.art)
        : Promise.resolve(null)

      artReady.then(function (img) {
        var meta = sheetRender.renderSheet(ctx, plan, that.tpl, that.formData(), {
          art: img,
          bounds: that.bounds,
          pxPerMm: pxPerMm,
          vertical: that.data.vertical
        })
        that.applyMeta(meta, pxPerMm)
      }).catch(function (e) {
        console.warn('[print] 预览渲染失败', e)
      })
    })
  },

  /**
   * 把渲染器给的技术型警告翻成人话。
   * 「副标题 1.36mm < 2.1mm」用户看不懂，也分不清是二维码扫不出来还是字太小。
   */
  humanWarn: function (list) {
    var that = this
    var parts = (list || []).map(function (w) {
      var m = /^(.+?) ([\d.]+)mm < ([\d.]+)mm$/.exec(w)
      if (m) return m[1] + '只有 ' + m[2] + 'mm（建议 ≥ ' + m[3] + 'mm）'
      return w
    })
    if (!parts.length) return ''
    return '卡片偏小：' + parts.join('；')
  },

  /** 用渲染回来的真实尺寸刷新标注（可能与预估差零点几毫米） */
  applyMeta: function (meta, pxPerMm) {
    if (!meta) return
    var patch = {}
    if (meta.qrMm) {
      patch.qrLabel = meta.qrMm >= printLib.QR_STD_MM ? '标准二维码' : '小型二维码'
      patch.moduleInfo = '二维码 ' + meta.qrMm.toFixed(1) + 'mm · ' + meta.moduleCount +
        ' 模块 · 单模块 ' + meta.moduleMm.toFixed(2) + 'mm'
    }
    if (meta.warnings && meta.warnings.length) {
      patch.warn = [this.data.warn, this.humanWarn(meta.warnings)].filter(Boolean).join('；')
    }
    if (Object.keys(patch).length) this.setData(patch)
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
      wx.showModal({
        title: '「' + opt.label + '」扫不出来',
        content: (opt.reason || '低于扫码下限') +
          '\n\n二维码边长 ' + opt.qrMm + 'mm、单模块 ' + opt.moduleMm.toFixed(2) +
          'mm。下限是 15mm / 0.4mm，低于这个尺寸手机很难对上焦。',
        showCancel: false,
        confirmText: '换别的版式'
      })
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
    if (this.plan && !this.plan.usable) {
      wx.showToast({ title: '当前版式不达标，先换版式', icon: 'none' })
      return
    }
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

    var artReady = this.tpl.series === 'paper'
      ? artwork.ensure(canvas, this.tpl.art)
      : Promise.resolve(null)

    artReady.then(function (img) {
      var meta = sheetRender.renderSheet(ctx, plan, that.tpl, that.formData(), {
        art: img,
        bounds: that.bounds,
        pxPerMm: dpi / 25.4,
        vertical: that.data.vertical
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
            outInfo: dpi + 'dpi · ' + px.w + '×' + px.h +
              (meta && meta.qrMm ? ' · 码 ' + meta.qrMm.toFixed(1) + 'mm' : '')
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
      showVertical: this.data.vertical,
      printKey: this.data.layout,
      thumb: ''
    }).catch(function (e) { console.warn('[print] 保存作品失败', e) })
  },

  saveAlbum: function () {
    var that = this
    var path = this.data.outPath
    if (!path) return

    privacy.ensure().then(function (res) {
      if (!res.ok) {
        wx.showModal({
          title: '需要同意隐私协议',
          content: '保存到相册前需要你同意《用户隐私保护指引》。这里只写入相册，不读取你的照片。',
          confirmText: '查看协议',
          cancelText: '取消',
          success: function (r) {
            if (r.confirm) privacy.openContract()
          }
        })
        return
      }
      that.doSave(path)
    })
  },

  doSave: function (path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () { wx.showToast({ title: '已存入相册' }) },
      fail: function (err) {
        if (privacy.isPrivacyError(err)) {
          wx.showModal({
            title: '隐私协议未同意',
            content: '请先同意《用户隐私保护指引》，再保存到相册。',
            confirmText: '查看协议',
            success: function (r) { if (r.confirm) privacy.openContract() }
          })
          return
        }
        if (privacy.isAuthError(err)) {
          wx.showModal({
            title: '需要相册权限',
            content: '去设置里打开「保存到相册」后再试。',
            confirmText: '去设置',
            success: function (r) { if (r.confirm) wx.openSetting() }
          })
          return
        }
        wx.showToast({ title: '保存失败', icon: 'none' })
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
    // 图片里带着 Wi-Fi 密码，发出去之前先提醒一次
    wx.showModal({
      title: '这张图上带着 Wi-Fi 密码',
      content: '导出图里包含二维码与密码文字，发给别人就等于把网络交出去。确认要发送吗？',
      confirmText: '继续发送',
      success: function (r) {
        if (!r.confirm) return
        wx.showShareImageMenu({
          path: path,
          fail: function (err) { console.warn('[print] 分享取消', err) }
        })
      }
    })
  },

  /** 预览大图 */
  previewFull: function () {
    if (!this.data.outPath) return
    wx.previewImage({ urls: [this.data.outPath], current: this.data.outPath })
  }
})
