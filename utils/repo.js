/**
 * utils/repo.js
 * 数据仓库：页面只认这里的方法，不再直接碰 wx.setStorageSync。
 *
 * ── 为什么要这一层 ──────────────────────────────────────────
 * 现在是纯本地工具，所有数据只写本机；以后接云开发（或自建后端）时，
 * 只需要换一个 adapter，页面里的调用一行都不用改。
 * 因此这里所有方法都返回 Promise——本地实现立刻 resolve，形状与
 * 网络请求一致。若本地用同步返回值、云上改成异步，页面就全要重写。
 *
 * ── adapter 契约（换实现时照这个签名写）──────────────────────
 *   getDraft()                 → Promise<draft|null>
 *   saveDraft(draft)           → Promise<draft>
 *   clearDraft()               → Promise<true>
 *   listFavorites()            → Promise<[{tplId, at}]>        新→旧
 *   toggleFavorite(tplId)      → Promise<{favorited:boolean, list:[]}>
 *   isFavorite(tplId)          → Promise<boolean>
 *   listWorks()                → Promise<work[]>               新→旧
 *   saveWork(work)             → Promise<work>                 有 id 则更新
 *   getWork(id)                → Promise<work|null>
 *   removeWork(id)             → Promise<true>
 *   getSettings() / saveSettings(patch)   → Promise<object>
 *   getFilters() / saveFilters(filters)   → Promise<object|null>
 *
 * ── 预留字段（现在一律为空，页面已按有值渲染）────────────────
 *   placeNo      桌位号，如「A12」「大堂左一」。联网后由服务端按门店下发
 *   likes        收藏/点赞数。本地恒为 0，联网后来自服务端
 *   miniCodeUrl  小程序码图片地址。为空时打印页不画码位、信息层自动居中
 */

var DRAFT_KEY = 'wifi_draft'
var FAV_KEY = 'wifi_favorites'
var WORKS_KEY = 'wifi_works'
var SETTINGS_KEY = 'wifi_settings'
var FILTERS_KEY = 'wifi_filters'

/* ── 底层读写 ───────────────────────────────────────────── */

function readRaw (key, fallback) {
  try {
    var value = wx.getStorageSync(key)
    if (value === '' || value === null || value === undefined) return fallback
    return value
  } catch (e) {
    console.warn('[repo] 读取失败 ' + key, e)
    return fallback
  }
}

function writeRaw (key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('[repo] 写入失败 ' + key, e)
    return false
  }
}

function ok (value) { return Promise.resolve(value) }
function bad (msg) { return Promise.reject(new Error(msg)) }

/* ── 数据整形 ───────────────────────────────────────────── */

function now () { return Date.now() }

function stamp () {
  var d = new Date()
  function p (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

function makeId (prefix) {
  return prefix + now().toString(36) + Math.floor(Math.random() * 1296).toString(36)
}

/** 草稿：字段缺失就补默认，老版本草稿也能读 */
function normalizeDraft (draft) {
  var d = draft || {}
  return {
    tplId: d.tplId || '',
    shopName: d.shopName || '',
    ssid: d.ssid || '',
    password: d.password || '',
    type: d.type || 'WPA',
    showPassword: d.showPassword !== false,
    // 侧边竖排开关：编辑页关掉过就得记住，否则打印页会自己又打开
    showVertical: d.showVertical !== false,
    printKey: d.printKey || '',
    savedAt: d.savedAt || stamp(),
    updatedAt: now()
  }
}

/**
 * 作品：一条「我印过的牌」的完整快照。
 * placeNo / likes / miniCodeUrl 现在就留空占位，页面按有值渲染即可。
 */
function normalizeWork (work) {
  var w = work || {}
  return {
    id: w.id || makeId('w'),
    tplId: w.tplId || '',
    tplName: w.tplName || '',
    title: w.title || w.shopName || '',
    shopName: w.shopName || '',
    ssid: w.ssid || '',
    password: w.password || '',
    type: w.type || 'WPA',
    showPassword: w.showPassword !== false,
    showVertical: w.showVertical !== false,
    printKey: w.printKey || '',
    thumb: w.thumb || '',
    placeNo: w.placeNo || '',
    likes: typeof w.likes === 'number' ? w.likes : 0,
    miniCodeUrl: w.miniCodeUrl || '',
    createdAt: w.createdAt || now(),
    updatedAt: now()
  }
}

/* ── 本地适配器 ─────────────────────────────────────────── */

var localAdapter = {
  name: 'local',

  getDraft: function () {
    var d = readRaw(DRAFT_KEY, null)
    return ok(d ? normalizeDraft(d) : null)
  },

  saveDraft: function (draft) {
    var next = normalizeDraft(draft)
    next.savedAt = stamp()
    return writeRaw(DRAFT_KEY, next) ? ok(next) : bad('草稿写入失败')
  },

  clearDraft: function () {
    try {
      wx.removeStorageSync(DRAFT_KEY)
      return ok(true)
    } catch (e) {
      return bad('草稿清除失败')
    }
  },

  listFavorites: function () {
    var list = readRaw(FAV_KEY, [])
    return ok(list.filter(function (f) { return f && f.tplId }))
  },

  isFavorite: function (tplId) {
    var list = readRaw(FAV_KEY, [])
    return ok(list.some(function (f) { return f && f.tplId === tplId }))
  },

  toggleFavorite: function (tplId) {
    if (!tplId) return bad('缺少 tplId')
    var list = readRaw(FAV_KEY, []).filter(function (f) { return f && f.tplId })
    var idx = -1
    for (var i = 0; i < list.length; i++) {
      if (list[i].tplId === tplId) { idx = i; break }
    }
    var favorited
    if (idx >= 0) {
      list.splice(idx, 1)
      favorited = false
    } else {
      list.unshift({ tplId: tplId, at: now() })
      favorited = true
    }
    return writeRaw(FAV_KEY, list)
      ? ok({ favorited: favorited, list: list })
      : bad('收藏写入失败')
  },

  listWorks: function () {
    var list = readRaw(WORKS_KEY, [])
    return ok(list.filter(function (w) { return w && w.id }).map(normalizeWork))
  },

  getWork: function (id) {
    var list = readRaw(WORKS_KEY, [])
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return ok(normalizeWork(list[i]))
    }
    return ok(null)
  },

  saveWork: function (work) {
    var next = normalizeWork(work)
    var list = readRaw(WORKS_KEY, []).filter(function (w) { return w && w.id })
    var idx = -1
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === next.id) { idx = i; break }
    }
    if (idx >= 0) {
      next.createdAt = list[idx].createdAt || next.createdAt
      list[idx] = next
    } else {
      list.unshift(next)
    }
    // 本地只留最近 60 条，避免无限涨
    if (list.length > 60) list = list.slice(0, 60)
    return writeRaw(WORKS_KEY, list) ? ok(next) : bad('作品写入失败')
  },

  removeWork: function (id) {
    var list = readRaw(WORKS_KEY, []).filter(function (w) { return w && w.id && w.id !== id })
    return writeRaw(WORKS_KEY, list) ? ok(true) : bad('作品删除失败')
  },

  /** 一次清掉全部作品（本地数据页用） */
  clearWorks: function () {
    try {
      wx.removeStorageSync(WORKS_KEY)
      return ok(true)
    } catch (e) {
      return bad('作品清除失败')
    }
  },

  getSettings: function () {
    return ok(readRaw(SETTINGS_KEY, {}))
  },

  saveSettings: function (patch) {
    var current = readRaw(SETTINGS_KEY, {})
    var next = {}
    var key
    for (key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) next[key] = current[key]
    }
    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key]
    }
    return writeRaw(SETTINGS_KEY, next) ? ok(next) : bad('设置写入失败')
  },

  getFilters: function () {
    return ok(readRaw(FILTERS_KEY, null))
  },

  saveFilters: function (filters) {
    return writeRaw(FILTERS_KEY, filters) ? ok(filters) : bad('筛选写入失败')
  }
}

/* ── 门面：页面只用这些方法 ─────────────────────────────── */

var adapter = localAdapter

/** 接云开发时：repo.useAdapter(cloudAdapter)。必须在 app.onLaunch 里调用 */
function useAdapter (next) {
  if (!next) return
  adapter = next
  console.log('[repo] 数据源切到 ' + (next.name || 'custom'))
}

function currentAdapter () { return adapter.name || 'custom' }

function call (method, args) {
  if (!adapter[method]) return bad('adapter 缺少方法 ' + method)
  try {
    return Promise.resolve(adapter[method].apply(adapter, args || []))
  } catch (e) {
    return bad((e && e.message) || '数据操作失败')
  }
}

module.exports = {
  // 草稿
  getDraft: function () { return call('getDraft') },
  saveDraft: function (draft) { return call('saveDraft', [draft]) },
  clearDraft: function () { return call('clearDraft') },
  // 收藏
  listFavorites: function () { return call('listFavorites') },
  toggleFavorite: function (tplId) { return call('toggleFavorite', [tplId]) },
  isFavorite: function (tplId) { return call('isFavorite', [tplId]) },
  // 作品
  listWorks: function () { return call('listWorks') },
  saveWork: function (work) { return call('saveWork', [work]) },
  getWork: function (id) { return call('getWork', [id]) },
  removeWork: function (id) { return call('removeWork', [id]) },
  clearWorks: function () { return call('clearWorks') },
  // 设置与筛选
  getSettings: function () { return call('getSettings') },
  saveSettings: function (patch) { return call('saveSettings', [patch]) },
  getFilters: function () { return call('getFilters') },
  saveFilters: function (filters) { return call('saveFilters', [filters]) },
  // 维护
  useAdapter: useAdapter,
  currentAdapter: currentAdapter,
  localAdapter: localAdapter,
  normalizeDraft: normalizeDraft,
  normalizeWork: normalizeWork,
  stamp: stamp,
  makeId: makeId
}
