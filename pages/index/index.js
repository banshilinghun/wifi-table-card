var lib = require('../../templates/index')
var render = require('../../utils/render')
var wifi = require('../../utils/wifi')
var filterLib = require('../../utils/filters')
var store = require('../../utils/store')

// 缩略图统一用同一份示例数据，方便横向对比模板差异
var SAMPLE = {
  shopName: '拾光咖啡',
  ssid: 'Shiguang-Cafe',
  password: 'coffee2024',
  type: 'WPA'
}

// 与 WXSS 里 .thumb-box 的 333rpx × 380rpx 对齐（750 设计稿）
var THUMB_MAX_W = 333
var THUMB_MAX_H = 380

/**
 * 缩略图缓存：模板 id + 尺寸 + dpr → 临时图片路径。
 * 挂在模块上而不是页面实例上——从编辑页返回首页时页面会重建，
 * 但图片还在，不必再画一遍（这也是「来回切筛选不闪」的前提）。
 */
var thumbCache = {}
var thumbFailed = {}

function getDpr () {
  try {
    var info = wx.getWindowInfo()
    // dpr 3 的机型上 333rpx 已经是 519 物理像素，再高只是浪费内存
    return Math.min(info.pixelRatio || 2, 3)
  } catch (e) {
    return 2
  }
}

/** 750rpx 设计稿 → 逻辑像素 */
function rpxScale () {
  try {
    var info = wx.getWindowInfo()
    return (info.windowWidth || 375) / 750
  } catch (e) {
    return 0.5
  }
}

function thumbKey (id, box) {
  return id + '@' + box.width + 'x' + box.height + '@' + getDpr()
}

/**
 * 离屏 canvas 画一张缩略图 → 转临时图片路径。
 * 用 wx.createOffscreenCanvas：不在渲染树里，就没有原生层压住抽屉的问题，
 * 抽屉打开时网格也不必再从渲染树里摘掉。
 */
function paintThumb (tpl, box, payload) {
  var dpr = getDpr()
  var k = rpxScale()
  var w = Math.max(1, Math.round(box.width * k))
  var h = Math.max(1, Math.round(box.height * k))
  var pw = Math.round(w * dpr)
  var ph = Math.round(h * dpr)

  var print = lib.getPrint((tpl.prints && tpl.prints[0]) || 'a5')

  var canvas = wx.createOffscreenCanvas({ type: '2d', width: pw, height: ph })
  var ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  render.renderSign(ctx, tpl, {
    shopName: SAMPLE.shopName,
    ssid: SAMPLE.ssid,
    password: SAMPLE.password,
    type: SAMPLE.type,
    showPassword: true,
    payload: payload,
    mm: { w: print.w, h: print.h }
  }, w, h)

  return new Promise(function (resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvas,
      x: 0,
      y: 0,
      width: pw,
      height: ph,
      destWidth: pw,
      destHeight: ph,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath) },
      fail: reject
    })
  })
}

Page({
  data: {
    scenes: [],
    shapes: [],
    printOpts: [],
    moods: [],
    regions: [],
    chips: [],
    activeCount: 0,
    list: [],
    matchCount: 0,
    total: 0,
    drawer: false,
    version: '0.5.0'
  },

  onLoad: function () {
    this.payload = wifi.buildWifiString(SAMPLE).value
    this.viewList = []
    this.filterState = filterLib.load()

    this.setData({ total: lib.TEMPLATES.length })
    this.refreshFilters()
    this.applyList()

    // 一次性把 10 张缩略图都生成好，之后筛选只重排、不再现画
    this.buildThumbs()

    console.log('[index] 模板 ' + lib.TEMPLATES.length + ' 个 · 当前条件 ' + JSON.stringify(this.filterState))
  },

  /* ── 缩略图 ─────────────────────────────────────── */

  buildThumbs: function () {
    var that = this
    var tpls = lib.TEMPLATES
    var i = 0

    if (!wx.createOffscreenCanvas) {
      console.warn('[index] 当前基础库不支持离屏 canvas，缩略图退化为色块占位')
      return
    }

    function next () {
      if (i >= tpls.length) {
        console.log('[index] 缩略图就绪 ' + Object.keys(thumbCache).length + ' 张')
        return
      }

      var tpl = tpls[i++]
      var box = lib.fitBox(lib.shapeRatio(tpl), THUMB_MAX_W, THUMB_MAX_H)
      var key = thumbKey(tpl.id, box)

      if (thumbCache[key] || thumbFailed[key]) { next(); return }

      paintThumb(tpl, box, that.payload).then(function (path) {
        thumbCache[key] = path
        that.fillImages()
        next()
      }).catch(function (err) {
        // 失败就留色块，不阻塞后面的模板
        thumbFailed[key] = true
        console.warn('[index] 缩略图生成失败 ' + tpl.id + ' ' + ((err && err.errMsg) || err))
        next()
      })
    }

    next()
  },

  /** 只补齐还空着的格子，已经显示出来的图片不动（避免 setData 触发重新加载） */
  fillImages: function () {
    var list = this.data.list
    var patch = {}
    var n = 0

    for (var i = 0; i < list.length; i++) {
      if (list[i].img) continue
      var box = { width: list[i].thumbW, height: list[i].thumbH }
      var path = thumbCache[thumbKey(list[i].id, box)]
      if (path) {
        patch['list[' + i + '].img'] = path
        list[i].img = path
        n++
      }
    }

    if (n) this.setData(patch)
  },

  /* ── 筛选状态 → 视图 ─────────────────────────────── */

  refreshFilters: function () {
    var f = this.filterState

    var scenes = lib.SCENES.map(function (s) {
      return { key: s.key, label: s.label, icon: s.icon, on: f.scene === s.key }
    })
    var shapes = lib.SHAPES.map(function (s) {
      return { key: s.key, label: s.label, on: f.shapes.indexOf(s.key) !== -1 }
    })
    var printOpts = lib.PRINTS.map(function (p) {
      return { key: p.key, label: p.label, spec: p.spec, on: f.prints.indexOf(p.key) !== -1 }
    })
    var moods = lib.MOODS.map(function (m) {
      return { key: m, label: m, on: f.moods.indexOf(m) !== -1 }
    })
    var regions = lib.REGIONS.map(function (r) {
      return { key: r, label: r, on: f.regions.indexOf(r) !== -1 }
    })

    this.setData({
      scenes: scenes,
      shapes: shapes,
      printOpts: printOpts,
      moods: moods,
      regions: regions,
      chips: filterLib.chips(f),
      activeCount: filterLib.activeCount(f)
    })
  },

  applyList: function () {
    var result = filterLib.apply(lib.TEMPLATES, this.filterState)
    var list = []

    this.viewList = result

    result.forEach(function (tpl) {
      var box = lib.fitBox(lib.shapeRatio(tpl), THUMB_MAX_W, THUMB_MAX_H)
      list.push({
        id: tpl.id,
        name: tpl.name,
        shape: tpl.shape,
        region: tpl.region,
        tint: (tpl.palette && tpl.palette.bg) || '#1A1A1A',
        sceneLabel: lib.sceneText(tpl),
        printsText: lib.printText(tpl),
        thumbW: box.width,
        thumbH: box.height,
        // 已生成的直接带上，没有的留空由 fillImages 补
        img: thumbCache[thumbKey(tpl.id, box)] || ''
      })
    })

    this.setData({ list: list, matchCount: list.length })
  },

  /* ── 交互 ───────────────────────────────────────── */

  pickScene: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key) return

    this.filterState.scene = key
    this.refreshFilters()
    this.applyList()
    filterLib.save(this.filterState)
  },

  toggleChip: function (e) {
    var dim = e.currentTarget.dataset.dim
    var key = e.currentTarget.dataset.key
    if (!dim || !key) return

    this.filterState[dim] = filterLib.toggle(this.filterState[dim] || [], key)
    this.refreshFilters()
    this.applyList()
    filterLib.save(this.filterState)
  },

  resetFilters: function () {
    this.filterState = filterLib.clone(filterLib.DEFAULT_FILTERS)
    this.refreshFilters()
    this.applyList()
    filterLib.save(this.filterState)
  },

  /** 空结果时的捷径：只清形状与尺寸筛选，保留场景与偏好 */
  clearHardFilters: function () {
    this.filterState = filterLib.clearHard(this.filterState)
    this.refreshFilters()
    this.applyList()
    filterLib.save(this.filterState)
  },

  openDrawer: function () {
    this.setData({ drawer: true })
  },

  closeDrawer: function () {
    this.setData({ drawer: false })
  },

  noop: function () {},

  openEditor: function (e) {
    var id = e.currentTarget.dataset.id
    if (!id) return
    store.saveSettings({ lastTplId: id })
    wx.navigateTo({ url: '/pages/editor/editor?tpl=' + id })
  },

  goTest: function () {
    wx.navigateTo({ url: '/pages/test/test' })
  }
})
