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
    version: '0.3.0'
  },

  onLoad: function () {
    this.payload = wifi.buildWifiString(SAMPLE).value
    this.viewList = []
    this.filterState = filterLib.load()

    this.setData({ total: lib.TEMPLATES.length })
    this.refreshFilters()
    this.applyList()

    console.log('[index] 模板 ' + lib.TEMPLATES.length + ' 个 · 当前条件 ' + JSON.stringify(this.filterState))
  },

  onReady: function () {
    this.drawThumbs()
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
    var that = this
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
        sceneLabel: lib.getScene(tpl.scene).label,
        printsText: lib.printText(tpl),
        thumbW: box.width,
        thumbH: box.height
      })
    })

    this.setData({ list: list, matchCount: list.length }, function () {
      that.drawThumbs()
    })
  },

  drawThumbs: function () {
    var that = this
    var tpls = this.viewList || []

    if (!tpls.length) return

    wx.createSelectorQuery()
      .in(this)
      .selectAll('.thumb')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var items = (res && res[0]) || []

        if (items.length !== tpls.length) {
          console.warn('[index] 画布 ' + items.length + ' 个 / 模板 ' + tpls.length + ' 个，数量不一致')
        }

        var dpr = getDpr()

        for (var i = 0; i < items.length; i++) {
          var item = items[i]
          var tpl = tpls[i]
          if (!item || !item.node || !tpl) continue

          var w = Math.round(item.width)
          var h = Math.round(item.height)
          if (!w || !h) continue

          var canvas = item.node
          var ctx = canvas.getContext('2d')

          canvas.width = Math.round(w * dpr)
          canvas.height = Math.round(h * dpr)
          ctx.scale(dpr, dpr)

          render.renderSign(ctx, tpl, {
            shopName: SAMPLE.shopName,
            ssid: SAMPLE.ssid,
            payload: that.payload
          }, w, h)
        }

        console.log('[index] 缩略图绘制 ' + items.length + ' 个')
      })
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
