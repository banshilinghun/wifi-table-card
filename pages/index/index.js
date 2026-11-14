/**
 * pages/index/index.js
 * 首页：两系列（白纸 / 深色）分组展示，缩略图走离屏 canvas，支持本地收藏。
 */

var catalog = require('../../templates/catalog')
var repo = require('../../utils/repo')
var artwork = require('../../utils/art')
var draw = require('../../utils/draw')
var wifi = require('../../utils/wifi')
var filterLib = require('../../utils/filters')
var boundsAll = require('../../packageTpl/art/bounds')

var SAMPLE = {
  shopName: '拾光咖啡',
  ssid: 'Shiguang-Cafe',
  password: 'coffee2024',
  type: 'WPA'
}

var THUMB_MAX_W = 333
var THUMB_MAX_H = 380

var thumbCache = {}
var thumbFailed = {}

function getDpr () {
  try {
    return Math.min(wx.getWindowInfo().pixelRatio || 2, 3)
  } catch (e) {
    return 2
  }
}

function rpxScale () {
  try {
    return (wx.getWindowInfo().windowWidth || 375) / 750
  } catch (e) {
    return 0.5
  }
}

function thumbKey (id, box) {
  return id + '@' + box.width + 'x' + box.height + '@' + getDpr()
}

/**
 * 离屏 canvas 画一张缩略图 → 临时图片。
 * 白纸系列要先加载装饰图；深色系列不需要（art 为 null）。
 */
function paintThumb (tpl, box, payload) {
  var dpr = getDpr()
  var k = rpxScale()
  var w = Math.max(1, Math.round(box.width * k))
  var h = Math.max(1, Math.round(box.height * k))
  var pw = Math.round(w * dpr)
  var ph = Math.round(h * dpr)

  var print = catalog.getPrint((tpl.prints && tpl.prints[0]) || 'a5')

  var canvas = wx.createOffscreenCanvas({ type: '2d', width: pw, height: ph })
  var ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  var ready = tpl.series === 'paper'
    ? artwork.ensure(canvas, tpl.art)
    : Promise.resolve(null)

  return ready.then(function (img) {
    draw.drawTemplate(ctx, tpl, {
      shopName: SAMPLE.shopName,
      ssid: SAMPLE.ssid,
      password: SAMPLE.password,
      type: SAMPLE.type,
      showPassword: true,
      payload: payload,
      mm: { w: print.w, h: print.h }
    }, w, h, {
      art: img,
      bounds: boundsAll[tpl.art] || null,
      mm: { w: print.w, h: print.h },
      vertical: false
    })

    return new Promise(function (resolve, reject) {
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: pw, height: ph,
        destWidth: pw, destHeight: ph,
        fileType: 'png',
        success: function (res) { resolve(res.tempFilePath) },
        fail: reject
      })
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
    groups: [],
    matchCount: 0,
    total: 0,
    drawer: false,
    favOnly: false,
    favCount: 0,
    privacy: false,
    privacyLines: [
      {
        h: '现在：全部在本机',
        t: 'Wi-Fi 名称、密码、店名、收藏与作品记录只写进这台手机的本地存储。小程序不发起任何网络请求，也不上传任何内容。'
      },
      {
        h: '以后：只上传不敏感信息',
        t: '如果将来加入云端同步（多人协作、桌位管理），只会在上传「Wi-Fi 名称、店名、桌位号」这类信息之前弹窗明确告知并征得同意；你可以选择不开启。'
      },
      {
        h: '密码永远不上传',
        t: 'Wi-Fi 密码不会被写进任何网络请求，也不会离开这台手机。云端只保存模板与桌位信息。'
      },
      {
        h: '权限',
        t: '只有你点「保存到相册」时才申请相册写入权限。不使用相机、不读取相册、不获取位置。'
      },
      {
        h: '删除',
        t: '微信「设置 → 小程序 → Wi-Fi 桌牌 → 清除缓存」即可删除本机全部数据，删除后不可恢复。'
      }
    ],
    version: '0.6.0'
  },

  onLoad: function () {
    this.payload = wifi.buildWifiString(SAMPLE).value
    this.filterState = filterLib.load()
    this.favs = []

    this.setData({ total: catalog.TEMPLATES.length })
    this.refreshFilters()
    this.reloadFavorites()
    this.buildThumbs()

    console.log('[index] 模板 ' + catalog.TEMPLATES.length + ' 个（纸 ' +
      catalog.bySeries('paper').length + ' / 深 ' + catalog.bySeries('dark').length + '）')
  },

  onShow: function () {
    // 从编辑页返回时收藏可能变了
    this.reloadFavorites()
  },

  onShareAppMessage: function () {
    return {
      title: 'Wi-Fi 桌牌 · 六套新中式模板，扫码即可连网',
      path: '/pages/index/index'
    }
  },

  /* ── 收藏 ───────────────────────────────────────────── */

  reloadFavorites: function () {
    var that = this
    repo.listFavorites().then(function (list) {
      that.favs = list.map(function (f) { return f.tplId })
      that.applyList()
      that.setData({ favCount: that.favs.length })
    }).catch(function (e) {
      console.warn('[index] 收藏读取失败', e)
    })
  },

  isFav: function (id) {
    return this.favs.indexOf(id) !== -1
  },

  toggleFav: function (e) {
    var that = this
    var id = e.currentTarget.dataset.id
    if (!id) return
    repo.toggleFavorite(id).then(function (res) {
      that.favs = res.list.map(function (f) { return f.tplId })
      that.setData({ favCount: that.favs.length })
      that.applyList()
      wx.vibrateShort && wx.vibrateShort({ type: 'light' })
      wx.showToast({ title: res.favorited ? '已收藏' : '已取消', icon: 'none', duration: 900 })
    }).catch(function (e2) {
      console.warn('[index] 收藏失败', e2)
      wx.showToast({ title: '收藏失败', icon: 'none' })
    })
  },

  toggleFavOnly: function () {
    this.setData({ favOnly: !this.data.favOnly })
    this.applyList()
  },

  /* ── 缩略图 ─────────────────────────────────────────── */

  buildThumbs: function () {
    var that = this
    var tpls = catalog.TEMPLATES
    var i = 0

    if (!wx.createOffscreenCanvas) {
      console.warn('[index] 不支持离屏 canvas，缩略图退化为色块')
      return
    }

    function next () {
      if (i >= tpls.length) {
        console.log('[index] 缩略图就绪 ' + Object.keys(thumbCache).length + ' 张')
        return
      }
      var tpl = tpls[i++]
      var box = catalog.fitBox(catalog.shapeRatio(tpl), THUMB_MAX_W, THUMB_MAX_H)
      var key = thumbKey(tpl.id, box)

      if (thumbCache[key] || thumbFailed[key]) { next(); return }

      paintThumb(tpl, box, that.payload).then(function (path) {
        thumbCache[key] = path
        that.fillImages()
        next()
      }).catch(function (err) {
        thumbFailed[key] = true
        console.warn('[index] 缩略图失败 ' + tpl.id + ' ' + ((err && err.errMsg) || err))
        next()
      })
    }

    next()
  },

  fillImages: function () {
    var groups = this.data.groups
    var patch = {}
    var n = 0
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items
      for (var i = 0; i < items.length; i++) {
        if (items[i].img) continue
        var box = { width: items[i].thumbW, height: items[i].thumbH }
        var path = thumbCache[thumbKey(items[i].id, box)]
        if (path) {
          patch['groups[' + g + '].items[' + i + '].img'] = path
          items[i].img = path
          n++
        }
      }
    }
    if (n) this.setData(patch)
  },

  /* ── 筛选 ───────────────────────────────────────────── */

  refreshFilters: function () {
    var f = this.filterState
    this.setData({
      scenes: catalog.SCENES.map(function (s) {
        return { key: s.key, label: s.label, icon: s.icon, on: f.scene === s.key }
      }),
      shapes: catalog.SHAPES.map(function (s) {
        return { key: s.key, label: s.label, on: f.shapes.indexOf(s.key) !== -1 }
      }),
      printOpts: catalog.PRINTS.map(function (p) {
        return { key: p.key, label: p.label, spec: p.spec, on: f.prints.indexOf(p.key) !== -1 }
      }),
      moods: catalog.MOODS.map(function (m) {
        return { key: m, label: m, on: f.moods.indexOf(m) !== -1 }
      }),
      regions: catalog.REGIONS.map(function (r) {
        return { key: r, label: r, on: f.regions.indexOf(r) !== -1 }
      }),
      chips: filterLib.chips(f),
      activeCount: filterLib.activeCount(f)
    })
  },

  applyList: function () {
    var that = this
    var result = filterLib.apply(catalog.TEMPLATES, this.filterState)
    if (this.data.favOnly) {
      result = result.filter(function (t) { return that.isFav(t.id) })
    }

    function toItem (tpl) {
      var box = catalog.fitBox(catalog.shapeRatio(tpl), THUMB_MAX_W, THUMB_MAX_H)
      return {
        id: tpl.id,
        name: tpl.name,
        shape: tpl.shape,
        region: tpl.region,
        series: tpl.series,
        tint: tpl.series === 'paper' ? (tpl.ink || '#ffffff') : ((tpl.palette && tpl.palette.bg) || '#1A1A1A'),
        sceneLabel: catalog.sceneText(tpl),
        printsText: catalog.printText(tpl),
        desc: tpl.desc || '',
        fav: that.isFav(tpl.id),
        thumbW: box.width,
        thumbH: box.height,
        img: thumbCache[thumbKey(tpl.id, box)] || ''
      }
    }

    var groups = []
    if (this.data.favOnly) {
      if (result.length) {
        groups.push({ key: 'fav', title: '我的收藏', items: result.map(toItem) })
      }
    } else {
      var paper = result.filter(function (t) { return t.series === 'paper' })
      var dark = result.filter(function (t) { return t.series !== 'paper' })
      if (paper.length) groups.push({ key: 'paper', title: '白纸系列', items: paper.map(toItem) })
      if (dark.length) groups.push({ key: 'dark', title: '深色系列', items: dark.map(toItem) })
    }

    this.viewList = result
    this.setData({ groups: groups, matchCount: result.length })
    this.fillImages()
  },

  /* ── 交互 ───────────────────────────────────────────── */

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

  showPrivacy: function () {
    this.setData({ privacy: true })
  },

  closePrivacy: function () {
    this.setData({ privacy: false })
  },

  noop: function () {},

  openEditor: function (e) {
    var id = e.currentTarget.dataset.id
    if (!id) return
    repo.saveSettings({ lastTplId: id }).catch(function () {})
    wx.navigateTo({ url: '/pages/editor/editor?tpl=' + id })
  },

  goTest: function () {
    wx.navigateTo({ url: '/pages/test/test' })
  }
})
