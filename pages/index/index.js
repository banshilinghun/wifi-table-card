var lib = require('../../templates/library')
var render = require('../../utils/render')
var wifi = require('../../utils/wifi')
var filterLib = require('../../utils/filters')
var store = require('../../utils/store')
var ornament = require('../../utils/ornament')

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

/* 一次画多少张缩略图。每张都是真实 canvas 绘制，
   一屏超过 30 张在中端机上就会掉帧，所以按页取。 */
var PAGE = lib.PAGE_SIZE

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
    /* 有硬条件时分母不可知（工厂按需长，没有预建索引），
       所以只在无硬条件时显示「N / 970」，否则只显示已取条数 */
    totalLabel: '',
    drawer: false,
    loading: false,
    hasMore: true,
    pageSize: PAGE,
    version: '0.5.0'
  },

  onLoad: function () {
    this.payload = wifi.buildWifiString(SAMPLE).value
    this.viewList = []
    this.filterState = filterLib.load()

    /* 库里是「精选 + 工厂」两段：先按估算总量显示，
       翻到底再决定还有没有下一页。 */
    this.cursor = 0
    this.pool = []
    this.exhausted = false

    this.fill(PAGE * 2)
    this.setData({ total: lib.estimate(), totalLabel: '' })
    this.refreshFilters()
    this.applyList()

    console.log('[index] 池 ' + this.pool.length + ' / 估算 ' + lib.estimate() + ' · 条件 ' + JSON.stringify(this.filterState))
  },

  /**
   * 把模板池补到 atLeast 条。
   * 硬条件（形状 / 打印规格 / 场景）直接传给工厂，
   * 让它只长符合条件的——不是先造一千条再筛。
   */
  fill: function (atLeast) {
    var hard = filterLib.hard(this.filterState)
    var guard = 0
    while (this.pool.length < atLeast && !this.exhausted && guard++ < 24) {
      var batch = lib.get(this.cursor, PAGE, hard)
      this.cursor += PAGE
      if (!batch.length) {
        this.exhausted = true
        break
      }
      this.pool = this.pool.concat(batch)
    }
    if (this.cursor >= (lib.MAX_PAGES + 4) * PAGE) this.exhausted = true
  },

  /** 条件变了就重开池子：生成器按条件长，旧池子已经不对题了 */
  refill: function () {
    this.cursor = 0
    this.pool = []
    this.exhausted = false
    this.fill(PAGE * 2)
    this.applyList()
  },

  /** 手动补一批：小程序里 onReachBottom 依赖页面滚动，
      列表很短时点这个更直接 */
  loadMore: function () {
    if (this.exhausted) return
    var before = this.viewList.length
    this.fill(this.pool.length + PAGE * 2)
    if (this.viewList.length === before) this.fill(this.pool.length + PAGE * 4)
    this.setData({ hasMore: !this.exhausted, total: Math.max(this.viewList.length, this.data.total) })
  },

  onReachBottom: function () {
    if (this.exhausted || this.data.loading) return
    var that = this
    this.setData({ loading: true })
    setTimeout(function () {
      var before = that.viewList.length
      that.fill(that.pool.length + PAGE * 2)
      that.applyList()
      that.setData({
        loading: false,
        hasMore: !that.exhausted,
        total: Math.max(that.viewList.length, that.data.total)
      })
      if (that.viewList.length === before) that.fill(that.pool.length + PAGE * 3)
    }, 30)
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
    /* 池子已按硬条件生成，这里只做偏好排序 + 兜底再过滤一次 */
    var result = filterLib.apply(this.pool, this.filterState)
    var list = []

    this.viewList = result

    result.forEach(function (tpl) {
      var box = lib.fitBox(lib.shapeRatio(tpl), THUMB_MAX_W, THUMB_MAX_H)
      list.push({
        id: tpl.id,
        name: tpl.name,
        shape: tpl.shape,
        region: tpl.region,
        sceneLabel: lib.sceneText(tpl),
        printsText: lib.printText(tpl),
        desc: tpl.desc || '',
        thumbW: box.width,
        thumbH: box.height
      })
    })

    var hard = filterLib.hard(this.filterState)
    var label = hard.active
      ? (this.exhausted ? '共 ' + list.length + ' 套' : '已取 ' + list.length + ' 套')
      : ''

    this.setData({
      list: list,
      matchCount: list.length,
      totalLabel: label,
      hasMore: !this.exhausted
    }, function () {
      that.drawThumbs()
    })
  },

  drawThumbs: function () {
    var that = this
    var tpls = this.viewList || []

    if (!tpls.length) return

    /* 花饰是图片资产，canvas 画之前必须先解码。
       ensure 只认当前这批模板用到的 key，加载完再画；
       失败也照画——花饰缺了不影响网络名和密码的可读性。 */
    ornament.ensure(tpls).then(function (n) {
      if (n) console.log('[index] 花饰就绪 ' + n + ' 件')
      that.paintThumbs()
    })
  },

  paintThumbs: function () {
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
            password: SAMPLE.password,
            type: SAMPLE.type,
            showPassword: true,
            payload: that.payload
          }, w, h)
        }

        console.log('[index] 缩略图绘制 ' + items.length + ' 个')
      })
  },

  /* ── 交互 ───────────────────────────────────────── */

  pickScene: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.filterState.scene) return

    this.filterState.scene = key
    this.refreshFilters()
    this.refill()
    filterLib.save(this.filterState)
  },

  toggleChip: function (e) {
    var dim = e.currentTarget.dataset.dim
    var key = e.currentTarget.dataset.key
    if (!dim || !key) return

    this.filterState[dim] = filterLib.toggle(this.filterState[dim] || [], key)
    this.refreshFilters()
    /* 氛围 / 地区只是偏好，重排就够；形状 / 打印是硬条件，得重造池子 */
    if (dim === 'shapes' || dim === 'prints') this.refill()
    else this.applyList()
    filterLib.save(this.filterState)
  },

  resetFilters: function () {
    this.filterState = filterLib.clone(filterLib.DEFAULT_FILTERS)
    this.refreshFilters()
    this.refill()
    filterLib.save(this.filterState)
  },

  /** 空结果时的捷径：只清形状与尺寸筛选，保留场景与偏好 */
  clearHardFilters: function () {
    this.filterState = filterLib.clearHard(this.filterState)
    this.refreshFilters()
    this.refill()
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