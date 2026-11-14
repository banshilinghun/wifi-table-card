/**
 * 微信开发者工具 · phase1 截图与验收（模拟器，不是真机）
 *
 * 前置：
 *   /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
 *     --project "<项目路径>" --port 48803 --auto-port 9421 --trust-project
 * 用法：
 *   node tools/auto/shoot-phase1.js
 *
 * 采集：
 *   首页（白纸 / 深色 / 收藏 / 隐私）· 6 套白纸编辑页 · 2 套深色编辑页
 *   · 打印预览 4 种版式 · 横版 · 4 种裁切线 · 深色打印页
 *   · 300dpi A4 拼 4 份导出（白纸 + 深色各一张）· 本机数据删除
 *
 * 截图先落到系统临时目录（写项目目录会触发重新编译，小程序被重置回首页），
 * 全部跑完再一次性拷进 docs/screens/phase1/。
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const automator = require('miniprogram-automator')

const PROJECT = path.resolve(__dirname, '..', '..')
const OUT = path.join(os.tmpdir(), 'wifi-sign-phase1')
const DELIVER = path.join(PROJECT, 'docs', 'screens', 'phase1')
const WS = process.env.WS || 'ws://127.0.0.1:9421'

const SAMPLE = { shop: '拾光咖啡', ssid: 'Shiguang-Cafe', pwd: 'coffee2024' }
const PAPER = [
  ['paper-milktea', '奶茶'],
  ['paper-hotpot', '火锅'],
  ['paper-minsu', '民宿'],
  ['paper-beauty', '美甲'],
  ['paper-teahouse', '茶室'],
  ['paper-newyear', '春节']
]
const DARK = [
  ['night-berth', '夜泊'],
  ['ember', '炉火']
]

const logs = []
const errors = []
const check = []
const shots = []

process.on('unhandledRejection', () => {})

function ok (label, pass, detail) {
  check.push({ label, pass: !!pass, detail: detail || '' })
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + label + (detail ? '  ' + detail : ''))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const S = {
  mp: null,

  async open () {
    this.mp = await automator.connect({ wsEndpoint: WS })
    this.mp.on('console', msg => {
      const text = (msg.args || []).map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      logs.push('[' + (msg.type || 'log') + '] ' + text)
      if (msg.type === 'error') errors.push(text)
    })
    this.mp.on('exception', err => {
      const text = (err && (err.message || JSON.stringify(err))) || String(err)
      logs.push('[exception] ' + text)
      errors.push(text)
    })
    return this.mp
  },

  async reopen () {
    try { await this.mp.disconnect() } catch (e) {}
    await sleep(1200)
    await this.open()
  },

  async run (label, fn, tries) {
    const max = tries || 3
    let last
    for (let i = 0; i < max; i++) {
      try {
        return await fn(this.mp)
      } catch (e) {
        last = e
        console.log('    ! ' + label + ' 失败：' + String(e.message || e).split('\n')[0] + '（重连重试 ' + (i + 1) + '/' + max + '）')
        await this.reopen()
      }
    }
    throw last
  },

  ev (label, fn, ...args) {
    return this.run(label, mp => mp.evaluate(fn, ...args))
  }
}

/* ── 通用动作 ─────────────────────────────────────────────── */

const navTo = url => S.run('navigateTo', mp => mp.navigateTo(url))
const navBack = () => S.run('navigateBack', mp => mp.navigateBack())
const reLaunch = url => S.run('reLaunch', mp => mp.reLaunch(url))

async function shot (name) {
  const file = path.join(OUT, name + '.png')
  await S.run('截图 ' + name, mp => mp.screenshot({ path: file }))
  shots.push(name)
  console.log('  ▣ ' + name + '.png  ' + Math.round(fs.statSync(file).size / 1024) + ' KB')
  return file
}

async function waitLog (re, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000)
  while (Date.now() < deadline) {
    if (logs.some(l => re.test(l))) return true
    await sleep(400)
  }
  return false
}

const pageState = sel => S.ev('读状态 ' + sel, function (sel) {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  const d = p.data
  const out = { route: p.route }
  ;(sel || '').split(',').forEach(function (k) {
    if (!k) return
    out[k] = d[k]
  })
  if (d.groups) {
    out.seriesTitles = d.groups.map(function (g) { return g.title })
    out.seriesCounts = d.groups.map(function (g) { return g.items.length })
    out.items = d.groups.reduce(function (a, g) { return a.concat(g.items) }, [])
  }
  return out
}, sel)

/** 首页缩略图图片来源（判断有没有真的画出来） */
const thumbPatched = () => S.ev('读缩略图', function () {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  var all = []
  ;(p.data.groups || []).forEach(function (g) { all = all.concat(g.items) })
  return {
    n: all.length,
    withImg: all.filter(function (x) { return !!x.img }).length,
    ids: all.map(function (x) { return x.id }),
    favs: all.filter(function (x) { return x.fav }).map(function (x) { return x.id })
  }
})

const fillEditor = (shop, ssid, pwd) => S.ev('填表', function (shop, ssid, pwd) {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  // 输入框的 value 绑在 data 上，模拟器里不会真的敲键盘，所以两条路都走一遍
  p.onShopInput({ detail: { value: shop } })
  p.onSsidInput({ detail: { value: ssid } })
  p.onPwdInput({ detail: { value: pwd } })
  p.setData({ shopName: shop, ssid: ssid, password: pwd })
  return { payload: p.payload, ssidBytes: p.data.ssidBytes }
}, shop, ssid, pwd)

const callPage = (name, arg) => S.ev('调用 ' + name, function (name, arg) {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  return p[name](arg)
}, name, arg)

const pickSeg = (name, key) => S.ev(name + ' ' + key, function (name, key) {
  getCurrentPages()[getCurrentPages().length - 1][name]({ currentTarget: { dataset: { key: key } } })
}, name, key)

const scrollTo = y => S.run('pageScrollTo', mp => mp.pageScrollTo(y, 300))

/** 把 showModal 换成自动确认，才能测到删除逻辑而不是弹窗本身 */
const autoConfirm = fn => S.ev('自动确认弹窗', function (fn) {
  var p = getCurrentPages()[getCurrentPages().length - 1]
  var orig = wx.showModal
  wx.showModal = function (o) { if (o && o.success) o.success({ confirm: true, cancel: false }) }
  p[fn]()
  setTimeout(function () { wx.showModal = orig }, 400)
  return true
}, fn)

/* ── 主流程 ───────────────────────────────────────────────── */

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  await S.open()

  const info = await S.run('systemInfo', mp => mp.systemInfo())
  console.log('已连接模拟器 ' + info.model + ' · ' + info.windowWidth + '×' + info.windowHeight + '\n')

  /* 1 首页 */
  console.log('[1] 首页 · 两系列分组')
  await S.run('clear', mp => mp.evaluate(function () { wx.clearStorageSync() }))
  await reLaunch('/pages/index/index')
  await sleep(2000)
  await callPage('resetFilters')
  const thumbOk = await waitLog(/缩略图就绪 16 张/, 40000)
  await sleep(1500)
  await shot('01-home-paper')

  const home = await pageState('matchCount,total,favOnly,favCount,drawer')
  const th = await thumbPatched()

  ok('首页 16 套模板（6 白纸 + 10 深色）', home.total === 16 && home.matchCount === 16,
    home.matchCount + '/' + home.total)
  ok('按系列分两组，白纸在前', home.seriesTitles.join('/') === '白纸系列/深色系列',
    home.seriesTitles.join('/') + ' = ' + home.seriesCounts.join('+'))
  ok('16 张缩略图全部画出来', thumbOk && th.withImg === 16, th.withImg + '/16')
  ok('白纸模板排在前面', th.ids.slice(0, 6).every(function (id) { return /^paper-/.test(id) }),
    th.ids.slice(0, 6).join(' '))

  // 滚到深色系列再截一张
  await scrollTo(1400)
  await sleep(1200)
  await shot('02-home-dark')
  await scrollTo(0)
  await sleep(600)

  /* 2 收藏 */
  console.log('\n[2] 首页收藏')
  await S.ev('收藏两张', function () {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.toggleFav({ currentTarget: { dataset: { id: 'paper-milktea' } } })
    return true
  })
  await sleep(900)
  await S.ev('收藏第二张', function () {
    getCurrentPages()[getCurrentPages().length - 1]
      .toggleFav({ currentTarget: { dataset: { id: 'paper-newyear' } } })
  })
  await sleep(1200)
  let s = await pageState('favCount,favOnly')
  const th2 = await thumbPatched()
  await shot('03-home-fav')
  ok('收藏 2 张并显示角标', s.favCount === 2, String(s.favCount))
  ok('卡片上心形已点亮', th2.favs.length === 2, th2.favs.join(' '))

  await callPage('toggleFavOnly')
  await sleep(1200)
  s = await pageState('favCount,favOnly')
  const favView = await thumbPatched()
  await shot('04-home-favonly')
  ok('「我的收藏」只列 2 张', s.favOnly === true && favView.n === 2, favView.n + ' 张')
  await callPage('toggleFavOnly')
  await sleep(1000)

  /* 3 隐私说明 */
  console.log('\n[3] 隐私说明')
  await S.ev('showPrivacy', function () {
    getCurrentPages()[getCurrentPages().length - 1].showPrivacy()
  })
  await sleep(1000)
  await S.ev('滚到本机数据', function () {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.setData({ draftExists: true, workCount: 3 })
  })
  await sleep(600)
  await shot('05-privacy')
  await S.ev('滚到本机数据', function () {
    getCurrentPages()[getCurrentPages().length - 1].setData({ pInto: 'pdata' })
  })
  await sleep(900)
  await shot('05b-privacy-data')
  const pv = await S.ev('privacy 文案', function () {
    const d = getCurrentPages()[getCurrentPages().length - 1].data
    return {
      on: d.privacy,
      n: (d.privacyLines || []).length,
      all: (d.privacyLines || []).map(function (x) { return x.h + '|' + x.t }).join('\n')
    }
  })
  ok('隐私面板打开，6 条说明', pv.on === true && pv.n === 6, pv.n + ' 条')
  ok('明确写「导出的图里带着密码」', /导出的图|导出的 A4/.test(pv.all) && /密码/.test(pv.all))
  ok('不再声称密码永远不离开手机', !/密码永远不上传|永远不会离开这台手机/.test(pv.all))
  await S.ev('closePrivacy', function () {
    getCurrentPages()[getCurrentPages().length - 1].closePrivacy()
  })
  await sleep(800)

  /* 4 六套白纸模板编辑页 */
  console.log('\n[4] 白纸模板编辑页 ×6')
  const editorState = []
  for (let i = 0; i < PAPER.length; i++) {
    const id = PAPER[i][0]
    await navTo('/pages/editor/editor?tpl=' + id)
    await sleep(2600)
    await fillEditor(SAMPLE.shop, SAMPLE.ssid, SAMPLE.pwd)
    await waitLog(new RegExp('\\[editor\\] ' + id + ' /'), 20000)
    await sleep(1400)
    const st = await pageState('tplName,tplId,isPaper,printKey,printSpec,qrMm,qrNote,showVertical,fav,previewW,previewH,sceneLabel')
    await shot('1' + (i + 1) + '-editor-' + id.replace('paper-', ''))
    editorState.push(st)
    ok('编辑页 · ' + PAPER[i][1] + '（' + st.tplName + '）',
      st.tplId === id && st.isPaper === true && st.qrMm >= 18,
      st.printKey + ' ' + st.previewW + '×' + st.previewH + ' · 码 ' + st.qrMm + 'mm · ' + st.qrNote)
    await navBack()
    await sleep(1800)
  }

  /* 5 深色模板编辑页（比例与白纸不同，打印时必须保留） */
  console.log('\n[5] 深色模板编辑页 ×2')
  const darkState = []
  for (let i = 0; i < DARK.length; i++) {
    const id = DARK[i][0]
    await navTo('/pages/editor/editor?tpl=' + id)
    await sleep(2600)
    await fillEditor('拾光咖啡', 'Shiguang-Cafe', 'coffee2024')
    await waitLog(new RegExp('\\[editor\\] ' + id + ' /'), 20000)
    await sleep(1400)
    const st = await pageState('tplName,tplId,isPaper,printKey,printSpec,qrMm,qrNote,shape,previewW,previewH')
    await shot('28-dark-editor-' + id)
    darkState.push(st)
    ok('深色编辑页 · ' + DARK[i][1] + '（' + st.tplName + '）',
      st.tplId === id && st.isPaper === false && st.qrMm > 0,
      st.shape + ' · ' + st.printKey + ' ' + st.previewW + '×' + st.previewH + ' · 码 ' + st.qrMm + 'mm')
    await navBack()
    await sleep(1600)
  }

  /* 6 侧边竖排开关 */
  console.log('\n[6] 侧边竖排小字开关')
  await navTo('/pages/editor/editor?tpl=paper-minsu')
  await sleep(2600)
  await fillEditor('山间民宿', 'Minsu-Guest', 'welcome88')
  await waitLog(/\[editor\] paper-minsu \/ a4/, 20000)
  await sleep(1200)
  await shot('18-editor-vertical-on')
  await callPage('toggleVertical')
  await sleep(1600)
  const vert = await pageState('showVertical')
  await shot('19-editor-vertical-off')
  ok('竖排可关闭', vert.showVertical === false)
  const savedVert = await S.ev('读草稿竖排状态', function () {
    return new Promise(function (resolve) {
      var p = getCurrentPages()[getCurrentPages().length - 1]
      p.persist()
      setTimeout(function () {
        resolve(wx.getStorageSync('wifi_draft'))
      }, 600)
    })
  })
  ok('关掉的竖排状态写进了草稿', savedVert && savedVert.showVertical === false,
    'showVertical=' + (savedVert && savedVert.showVertical))
  await callPage('toggleVertical')
  await sleep(1200)

  // 无密码网络：卡片上应写「无需密码」，而不是留空或写成密码
  await S.ev('切到无密码', function () {
    getCurrentPages()[getCurrentPages().length - 1]
      .pickType({ currentTarget: { dataset: { key: 'nopass' } } })
  })
  await sleep(1800)
  const nopass = await pageState('type,showPassword,payload')
  await shot('17-editor-nopass')
  ok('无密码网络的载荷不带 P 字段',
    nopass.type === 'nopass' && /T:nopass;/.test(nopass.payload) && !/;P:/.test(nopass.payload),
    nopass.payload)
  await S.ev('切回 WPA', function () {
    getCurrentPages()[getCurrentPages().length - 1]
      .pickType({ currentTarget: { dataset: { key: 'WPA' } } })
  })
  await sleep(1200)
  await navBack()
  await sleep(1800)

  /* 7 打印预览：4 种版式 */
  console.log('\n[7] 打印预览 · 4 种版式')
  await navTo('/pages/editor/editor?tpl=paper-minsu')
  await sleep(2600)
  await fillEditor('山间民宿', 'Minsu-Guest', 'welcome88')
  await waitLog(/\[editor\] paper-minsu \/ a4/, 20000)
  await sleep(1200)
  await callPage('goPrint')
  await sleep(3000)
  let ps = await pageState('tplName,layout,orientation,cut,narrow,layouts,planInfo,moduleInfo,qrLabel,warn,note,vertical,canvasW,canvasH')
  ok('进入打印页，默认整张 + 竖排跟随草稿', ps.layout === 'full' && ps.canvasW > 300,
    ps.tplName + ' · ' + ps.layout + ' · ' + ps.planInfo)
  ok('标注二维码真实尺寸与模块数', /模块/.test(ps.moduleInfo || ''), ps.moduleInfo)
  ok('草稿开着竖排，打印页也开着', ps.vertical === true, 'vertical=' + ps.vertical)
  await shot('20-print-full')

  const LAYOUTS = [
    ['half', '21-print-half'],
    ['card', '22-print-card'],
    ['mini', '23-print-mini']
  ]
  const layoutInfo = [{ key: 'full', info: ps.planInfo, qr: ps.qrLabel }]
  for (const [key, name] of LAYOUTS) {
    await pickSeg('pickLayout', key)
    await sleep(2200)
    const st = await pageState('layout,planInfo,moduleInfo,qrLabel,warn,note,layouts')
    layoutInfo.push({ key, info: st.planInfo, qr: st.qrLabel })
    await shot(name)
    // 迷你 8 份时字号会低于可读下限，此时 warn 是「卡片偏小」而不是「扫不出来」，
    // 所以断言分开：版式必须真的切过去，扫码下限由 moduleInfo 判断
    ok('版式 ' + key + ' · ' + st.planInfo, st.layout === key,
      st.qrLabel + ' · ' + st.moduleInfo + (st.warn ? ' ⚠' + st.warn : ''))
  }
  ok('迷你（8 份）二维码仍达标准尺寸', /标准/.test(layoutInfo[3].qr), layoutInfo[3].qr)
  ok('整张（1 份）标注为标准二维码', /标准/.test(layoutInfo[0].qr), layoutInfo[0].qr)
  const optInfo = await pageState('layouts')
  ok('四档版式都显示码尺寸与单模块尺寸',
    optInfo.layouts.every(function (o) { return o.qrMm > 0 && o.moduleMm > 0 }),
    optInfo.layouts.map(function (o) { return o.label + ' ' + o.qrMm + 'mm/' + o.moduleMm }).join(' · '))

  /* 8 横版 + 裁切线 */
  console.log('\n[8] 横版 · 裁切线')
  await pickSeg('pickLayout', 'card')
  await sleep(1600)
  await S.ev('pickOrientation', function () {
    getCurrentPages()[getCurrentPages().length - 1].pickOrientation({ currentTarget: { dataset: { v: 'landscape' } } })
  })
  await sleep(2000)
  const land = await pageState('orientation,planInfo,layouts,canvasW,canvasH')
  await shot('24-print-landscape-card')
  ok('横版 A4 拼 4 份（画布变扁）', land.orientation === 'landscape' && land.canvasH < land.canvasW,
    land.planInfo + ' · 画布 ' + land.canvasW + '×' + land.canvasH)

  await S.ev('pickOrientation portrait', function () {
    getCurrentPages()[getCurrentPages().length - 1].pickOrientation({ currentTarget: { dataset: { v: 'portrait' } } })
  })
  await sleep(1800)
  for (const [cut, name] of [['none', '25-print-cut-none'], ['cross', '26-print-cut-cross'], ['dash', '27-print-cut-dash']]) {
    await pickSeg('pickCut', cut)
    await sleep(1400)
    await shot(name)
  }
  await pickSeg('pickCut', 'corner')
  await sleep(1400)

  /* 9 导出 300dpi · A4 拼 4 份（白纸） */
  console.log('\n[9] 导出 A4 拼 4 份（300dpi · 白纸）')
  async function exportTo (fileName) {
    return S.ev('导出 ' + fileName, function (fileName) {
      return new Promise(function (resolve) {
        const p = getCurrentPages()[getCurrentPages().length - 1]
        p.exportAt(300, true)
        var n = 0
        var t = setInterval(function () {
          n++
          if (p.data.outPath || n > 120) {
            clearInterval(t)
            var tmp = p.data.outPath
            if (!tmp) return resolve({ err: 'no-path', exporting: p.data.exporting })
            var fs = wx.getFileSystemManager()
            fs.saveFile({
              tempFilePath: tmp,
              filePath: wx.env.USER_DATA_PATH + '/' + fileName,
              success: function (r) {
                // 顺手读成 base64 带回来：模拟器文件系统路径不好找，
                // 让 Node 侧直接落盘到 docs 里，比事后翻目录可靠
                fs.readFile({
                  filePath: r.savedFilePath,
                  encoding: 'base64',
                  success: function (rf) {
                    resolve({ saved: r.savedFilePath, tmp: tmp, info: p.data.outInfo, b64: rf.data })
                  },
                  fail: function () { resolve({ saved: r.savedFilePath, tmp: tmp, info: p.data.outInfo }) }
                })
              },
              fail: function (e) { resolve({ err: e.errMsg, tmp: tmp, info: p.data.outInfo }) }
            })
          }
        }, 300)
      })
    }, fileName)
  }
  const exp = await exportTo('a4-4cards.jpg')
  if (exp && exp.b64) {
    fs.mkdirSync(DELIVER, { recursive: true })
    fs.writeFileSync(path.join(DELIVER, 'a4-4cards-300dpi.jpg'), Buffer.from(exp.b64, 'base64'))
    console.log('  已保存 docs/screens/phase1/a4-4cards-300dpi.jpg')
    delete exp.b64
  }
  console.log('  导出结果 ' + JSON.stringify(exp))
  ok('白纸导出成功并给出 300dpi 尺寸', !exp.err && /2480×3508/.test(exp.info || ''), exp.info || exp.err)

  /* 10 深色模板打印页 + 导出（比例与样式必须保留） */
  console.log('\n[10] 深色模板打印')
  // 用 reLaunch 回首页，而不是连按两次返回：导出后页面栈不一定还是两层，
  // navigateBack 在栈底会直接抛错（上一版就是这里挂的）
  await reLaunch('/pages/index/index')
  await sleep(2000)
  await navTo('/pages/editor/editor?tpl=ember')
  await sleep(2600)
  await fillEditor('拾光咖啡', 'Shiguang-Cafe', 'coffee2024')
  await waitLog(/\[editor\] ember \/ /, 20000)
  await sleep(1400)
  await callPage('goPrint')
  await sleep(3200)
  const dp = await pageState('tplName,layout,orientation,planInfo,moduleInfo,qrLabel,warn,shapeText,canvasW,canvasH')
  await shot('29-dark-print-full')
  ok('深色打印页进入并显示自家比例', dp.canvasW > 0 && /2:1/.test(dp.shapeText || ''),
    dp.tplName + ' · ' + dp.shapeText + ' · ' + dp.planInfo)
  await pickSeg('pickLayout', 'card')
  await sleep(2200)
  await shot('30-dark-print-card')
  const dc = await pageState('layout,planInfo,moduleInfo,layouts')
  ok('深色卡片版式可用且带真实码尺寸', dc.layout === 'card' && /模块/.test(dc.moduleInfo),
    dc.planInfo + ' · ' + dc.moduleInfo)
  const expDark = await exportTo('a4-dark.jpg')
  if (expDark && expDark.b64) {
    fs.writeFileSync(path.join(DELIVER, 'a4-dark-300dpi.jpg'), Buffer.from(expDark.b64, 'base64'))
    console.log('  已保存 docs/screens/phase1/a4-dark-300dpi.jpg')
    delete expDark.b64
  }
  ok('深色导出成功（2480×3508）', !expDark.err && /2480×3508/.test(expDark.info || ''),
    expDark.info || expDark.err)

  /* 11 本机数据删除 */
  console.log('\n[11] 本机数据删除')
  await reLaunch('/pages/index/index')
  await sleep(2000)
  const before = await S.ev('清空前的本机数据', function () {
    return {
      draft: !!wx.getStorageSync('wifi_draft'),
      works: (wx.getStorageSync('wifi_works') || []).length
    }
  })
  ok('导出后本机确实有草稿与作品', before.draft === true && before.works > 0,
    '草稿 ' + before.draft + ' · 作品 ' + before.works + ' 条')

  await S.ev('打开隐私面板', function () {
    getCurrentPages()[getCurrentPages().length - 1].showPrivacy()
  })
  await sleep(800)
  await autoConfirm('clearDraftData')
  await sleep(1500)
  await autoConfirm('clearWorksData')
  await sleep(1500)
  const after = await S.ev('清空后的本机数据', function () {
    return {
      draft: !!wx.getStorageSync('wifi_draft'),
      works: (wx.getStorageSync('wifi_works') || []).length,
      draftExists: getCurrentPages()[getCurrentPages().length - 1].data.draftExists,
      workCount: getCurrentPages()[getCurrentPages().length - 1].data.workCount
    }
  })
  await shot('31-privacy-cleared')
  ok('草稿可以删掉', after.draft === false && after.draftExists === false, JSON.stringify(after))
  ok('作品可以删掉', after.works === 0 && after.workCount === 0, JSON.stringify(after))

  /* 汇总 */
  fs.mkdirSync(DELIVER, { recursive: true })
  shots.forEach(function (name) {
    fs.copyFileSync(path.join(OUT, name + '.png'), path.join(DELIVER, name + '.png'))
  })
  console.log('\n截图已拷到 docs/screens/phase1/ ×' + shots.length)

  fs.writeFileSync(path.join(OUT, 'export.json'), JSON.stringify({ exp: exp, dark: expDark }, null, 2))
  fs.writeFileSync(path.join(PROJECT, 'tools', 'out', 'phase1-report.json'),
    JSON.stringify({ systemInfo: info, checks: check, shots, editorState, darkState, layoutInfo, exp, expDark, logs }, null, 2))

  const failed = check.filter(c => !c.pass)
  console.log('\n══════ 结论 ══════')
  console.log('断言 ' + check.length + ' 项：通过 ' + (check.length - failed.length) + ' · 失败 ' + failed.length)
  console.log('控制台 ' + logs.length + ' 条 · 错误 ' + errors.length + ' 条')
  errors.slice(0, 12).forEach(l => console.log('  ! ' + l))
  logs.filter(l => /\[(index|editor|print|art)\]/.test(l)).slice(-14).forEach(l => console.log('  ' + l))
  if (failed.length) {
    console.log('\n失败项：')
    failed.forEach(f => console.log('  ✗ ' + f.label + '  ' + f.detail))
  }

  try { await S.mp.disconnect() } catch (e) {}
  process.exit(failed.length ? 1 : 0)
})().catch(err => {
  console.error('运行失败：' + (err && err.stack ? err.stack : err))
  process.exit(2)
})
