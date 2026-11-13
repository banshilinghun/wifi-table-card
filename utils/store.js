/**
 * utils/store.js
 * 本地存储封装。只落 wx.setStorageSync，绝不发网络请求。
 */

var DRAFT_KEY = 'wifi_draft'
var SETTINGS_KEY = 'wifi_settings'
var FILTERS_KEY = 'wifi_filters'

function read (key, fallback) {
  try {
    var value = wx.getStorageSync(key)
    return value === '' || value === null || value === undefined ? fallback : value
  } catch (e) {
    console.warn('[store] 读取失败', key, e)
    return fallback
  }
}

function write (key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('[store] 写入失败', key, e)
    return false
  }
}

function getDraft () {
  return read(DRAFT_KEY, null)
}

function saveDraft (draft) {
  return write(DRAFT_KEY, draft)
}

function getSettings () {
  return read(SETTINGS_KEY, {})
}

function saveSettings (settings) {
  var current = getSettings() || {}
  var next = {}
  var key
  for (key in current) {
    if (Object.prototype.hasOwnProperty.call(current, key)) next[key] = current[key]
  }
  for (key in settings) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) next[key] = settings[key]
  }
  return write(SETTINGS_KEY, next)
}

function getFilters () {
  return read(FILTERS_KEY, null)
}

function saveFilters (filters) {
  return write(FILTERS_KEY, filters)
}

module.exports = {
  getDraft: getDraft,
  saveDraft: saveDraft,
  getSettings: getSettings,
  saveSettings: saveSettings,
  getFilters: getFilters,
  saveFilters: saveFilters
}
