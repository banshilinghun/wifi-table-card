/**
 * tools/verify-repo.js —— 数据层验收（Node 侧，用 wx storage 的桩）
 *
 * 守的是「页面不用改就能换数据源」这条承诺：
 *   [1] 草稿读写与规范化（含老结构缺字段）
 *   [2] 收藏开关幂等、顺序
 *   [3] 作品保存/更新/删除、预留字段
 *   [4] adapter 可替换，且替换后调用方代码不变
 */

var store = {}
global.wx = {
  getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : '' },
  setStorageSync: function (k, v) { store[k] = v },
  removeStorageSync: function (k) { delete store[k] }
}

var repo = require('../utils/repo')

var pass = 0
var fail = 0
function ok (label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label + (detail ? '  ' + detail : '')) }
  else { fail++; console.log('  ✗ ' + label + (detail ? '  ' + detail : '')) }
}

;(async function () {
  console.log('[1] 草稿')
  var empty = await repo.getDraft()
  ok('空库读出 null', empty === null)

  var saved = await repo.saveDraft({ tplId: 'paper-milktea', shopName: '拾光', ssid: 'Shiguang', password: 'coffee2024' })
  ok('保存后返回规范化草稿', saved.tplId === 'paper-milktea' && saved.type === 'WPA' && saved.showPassword === true)
  ok('自动补 savedAt / updatedAt', !!saved.savedAt && !!saved.updatedAt, saved.savedAt)

  var back = await repo.getDraft()
  ok('读回与保存一致', back.tplId === 'paper-milktea' && back.ssid === 'Shiguang')

  // 老版本草稿：只有 tplId 和表单碎片
  store.wifi_draft = { tplId: 'night-berth', ssid: 'old' }
  var legacy = await repo.getDraft()
  ok('老结构草稿也能读（缺字段补默认）',
    legacy.tplId === 'night-berth' && legacy.type === 'WPA' && legacy.printKey === '')

  console.log('[2] 收藏')
  var f0 = await repo.listFavorites()
  ok('初始为空', f0.length === 0)

  var t1 = await repo.toggleFavorite('paper-milktea')
  ok('收藏成功', t1.favorited === true && t1.list.length === 1)
  ok('isFavorite 命中', (await repo.isFavorite('paper-milktea')) === true)

  await repo.toggleFavorite('paper-hotpot')
  var f2 = await repo.listFavorites()
  ok('最近收藏排前面', f2[0].tplId === 'paper-hotpot' && f2.length === 2)
  ok('带时间戳', typeof f2[0].at === 'number' && f2[0].at > 0)

  var t3 = await repo.toggleFavorite('paper-milktea')
  ok('再点一次取消', t3.favorited === false && t3.list.length === 1)
  ok('取消后 isFavorite 为 false', (await repo.isFavorite('paper-milktea')) === false)

  console.log('[3] 作品与预留字段')
  var w1 = await repo.saveWork({ tplId: 'paper-milktea', tplName: '奶茶', shopName: '拾光', ssid: 'S', password: 'p' })
  ok('新建作品带 id', !!w1.id)
  ok('placeNo 预留为空', w1.placeNo === '')
  ok('likes 预留为 0', w1.likes === 0)
  ok('miniCodeUrl 预留为空', w1.miniCodeUrl === '')

  var w2 = await repo.saveWork({ id: w1.id, tplId: 'paper-milktea', shopName: '拾光二号' })
  var all = await repo.listWorks()
  ok('同 id 是更新而非新增', all.length === 1, all.length + ' 条')
  ok('更新保留 createdAt', w2.createdAt === w1.createdAt)
  ok('预留字段可带值写入', (await repo.saveWork({ id: w1.id, placeNo: 'A12', likes: 7, miniCodeUrl: 'https://x/y.png' })).placeNo === 'A12')

  await repo.saveWork({ tplId: 'x', shopName: '新的一条' })
  var ordered = await repo.listWorks()
  ok('新作品排最前', ordered[0].shopName === '新的一条')

  await repo.removeWork(w1.id)
  ok('删除按 id 生效', (await repo.listWorks()).every(function (w) { return w.id !== w1.id }))
  ok('getWork 取不到已删', (await repo.getWork(w1.id)) === null)

  console.log('[4] adapter 可替换')
  var calls = []
  var mock = {
    name: 'mock-cloud',
    getDraft: function () { calls.push('getDraft'); return Promise.resolve({ tplId: 'from-cloud' }) },
    saveDraft: function (d) { calls.push('saveDraft'); return Promise.resolve(d) },
    listFavorites: function () { return Promise.resolve([]) },
    toggleFavorite: function (id) { return Promise.resolve({ favorited: true, list: [{ tplId: id }] }) },
    isFavorite: function () { return Promise.resolve(true) },
    listWorks: function () { return Promise.resolve([]) },
    saveWork: function (w) { return Promise.resolve(w) },
    getWork: function () { return Promise.resolve(null) },
    removeWork: function () { return Promise.resolve(true) },
    getSettings: function () { return Promise.resolve({}) },
    saveSettings: function (p) { return Promise.resolve(p) },
    getFilters: function () { return Promise.resolve(null) },
    saveFilters: function (f) { return Promise.resolve(f) }
  }
  repo.useAdapter(mock)
  ok('currentAdapter 反映新实现', repo.currentAdapter() === 'mock-cloud')
  var cloudDraft = await repo.getDraft()
  ok('页面同一行调用换到新数据源', cloudDraft.tplId === 'from-cloud', calls.join(','))
  ok('方法名不变（getDraft）', calls.indexOf('getDraft') === 0)

  repo.useAdapter(repo.localAdapter)
  ok('切回本地', repo.currentAdapter() === 'local')

  console.log('[5] 异常兜底')
  var broken = { name: 'broken', getDraft: function () { throw new Error('boom') } }
  repo.useAdapter(broken)
  var err = null
  try { await repo.getDraft() } catch (e) { err = e }
  ok('适配器抛错时 reject 而不是崩页', !!err && /boom/.test(err.message))
  repo.useAdapter(repo.localAdapter)

  console.log('\n结果: ' + pass + ' 项通过，' + fail + ' 项失败')
  if (fail) process.exit(1)
})()
