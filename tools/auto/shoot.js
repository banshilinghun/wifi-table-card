/**
 * 微信开发者工具 · 真实模拟器截图 + 控制台采集
 *
 * 前置：
 *   /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
 *     --project "<项目路径>" --port 48803 --auto-port 9420
 * 用法：
 *   node tools/auto/shoot.js
 *
 * ── 关于自动化通道的四个坑（都在脚本层绕开，未改动被验证的页面代码）──
 *   1. page.callMethod 在 automator 0.13.0 上解析不到页面实例方法
 *      （this.xxx is not a function）→ 改为 mp.evaluate 里取 getCurrentPages()
 *      栈顶实例直接调用；
 *   2. app service 禁用了 eval / new Function → 每个动作必须是函数字面量；
 *   3. element.tap() 在模拟器主线程忙时会报 "timeout waiting for automator
 *      response" → 截图流程不使用 tap，点击行为由 tap-test.js 单独验证；
 *   4. 同一条连接偶发卡死（多发于截图之后），但**重连后页面栈与数据都还在**
 *      （onLoad 不会被重新触发）→ 每个操作都带「超时即重连重试」，重试后
 *      按状态校验，非幂等的 toggle 不会重复生效。
 */
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const automator = require('miniprogram-automator')

const PROJECT = path.resolve(__dirname, '..', '..')
// 截图不能写进项目目录：开发者工具监听到文件变化会自动重新编译，
// 整个小程序会被重置回首页，后续操作全部作废（这一条踩了很久才发现）。
const OUT = path.join(require('os').tmpdir(), 'wifi-sign-shots')
const DELIVER = path.join(PROJECT, 'tools', 'out', 'devtools')
const WS = process.env.WS || 'ws://127.0.0.1:9420'

const logs = []
const errors = []
const check = []
const shots = []

process.on('unhandledRejection', () => {})   // 断开时 automator 会 reject 一批挂起请求

function ok (label, pass, detail) {
  check.push({ label, pass: !!pass, detail: detail || '' })
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + label + (detail ? '  ' + detail : ''))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/* ── 会话：单连接 + 失败即重连 ─────────────────────────────── */

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
        console.log('    ! ' + label + ' 失败：' + e.message.split('\n')[0] + '（重连重试 ' + (i + 1) + '/' + max + '）')
        await this.reopen()
      }
    }
    throw last
  },

  ev (label, fn, ...args) {
    return this.run(label, mp => mp.evaluate(fn, ...args))
  }
}

/* ── 动作 ─────────────────────────────────────────────────── */

const state = () => S.ev('读状态', function () {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  const d = p.data
  return {
    route: p.route,
    stack: getCurrentPages().length,
    drawer: d.drawer,
    list: (d.list || []).length,
    total: d.total,
    activeCount: d.activeCount,
    shapes: (d.shapes || []).map(function (s) { return s.key + ':' + s.on }),
    prints: (d.printOpts || []).map(function (s) { return s.key + ':' + s.on }),
    thumbs: (d.list || []).map(function (x) { return x.thumbW + 'x' + x.thumbH }),
    tplName: d.tplName,
    printKey: d.printKey,
    printSpec: d.printSpec,
    previewW: d.previewW,
    previewH: d.previewH,
    qrMm: d.qrMm,
    payload: d.payload,
    showPassword: d.showPassword,
    type: d.type
  }
})

const call0 = name => S.ev(name, function (name) {
  getCurrentPages()[getCurrentPages().length - 1][name]()
}, name)

const navTo = url => S.run('navigateTo', mp => mp.navigateTo(url))
const navBack = () => S.run('navigateBack', mp => mp.navigateBack())

async function shot (name) {
  const file = path.join(OUT, name + '.png')
  await S.run('截图 ' + name, mp => mp.screenshot({ path: file }))
  shots.push(name)
  console.log('  ▣ ' + name + '.png  ' + Math.round(fs.statSync(file).size / 1024) + ' KB')
  return file
}

const toggleChip = (dim, key) => S.ev('toggle ' + dim, function (dim, key) {
  getCurrentPages()[getCurrentPages().length - 1]
    .toggleChip({ currentTarget: { dataset: { dim: dim, key: key } } })
}, dim, key)

const pickScene = key => S.ev('pickScene', function (key) {
  getCurrentPages()[getCurrentPages().length - 1]
    .pickScene({ currentTarget: { dataset: { key: key } } })
}, key)

const pickSeg = (name, key) => S.ev(name, function (name, key) {
  getCurrentPages()[getCurrentPages().length - 1]
    [name]({ currentTarget: { dataset: { key: key } } })
}, name, key)

const fillForm = (shop, ssid, pwd) => S.ev('填表', function (shop, ssid, pwd) {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  p.onShopInput({ detail: { value: shop } })
  p.setData({ shopName: shop })
  p.onSsidInput({ detail: { value: ssid } })
  p.setData({ ssid: ssid })
  p.onPwdInput({ detail: { value: pwd } })
  p.setData({ password: pwd })
  return p.data.payload
}, shop, ssid, pwd)

const setSsid = v => S.ev('setSsid', function (v) {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  p.onSsidInput({ detail: { value: v } })
  p.setData({ ssid: v })
}, v)

/** 等一条符合条件的日志出现（画布渲染完才会打日志），超时返回 false */
async function waitLog (re, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 12000)
  while (Date.now() < deadline) {
    if (logs.some(l => re.test(l))) return true
    await sleep(400)
  }
  return false
}

function lastLog (prefix) {
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].indexOf(prefix) !== -1) return logs[i]
  }
  return ''
}

/* ── 主流程 ───────────────────────────────────────────────── */

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })

  await S.open()
  const info = await S.run('systemInfo', mp => mp.systemInfo())
  console.log('已连接微信开发者工具模拟器')
  console.log('机型 ' + info.model + ' · ' + info.windowWidth + '×' + info.windowHeight +
    ' · dpr ' + info.pixelRatio + ' · 基础库 ' + info.SDKVersion + '\n')

  /* 1 首页（先清掉上一轮残留的草稿与筛选，保证起点确定）*/
  console.log('[1] 首页')
  await S.run('clearStorage', mp => mp.evaluate(function () { wx.clearStorageSync() }))
  await S.run('reLaunch', mp => mp.reLaunch('/pages/index/index'))
  await sleep(3000)
  await call0('resetFilters')
  const drawn = await waitLog(/缩略图绘制 10 个/, 15000)
  await sleep(1500)                    // 画完再等一帧，避免截到半张
  await shot('01-home')
  ok('10 张缩略图全部绘制完成', drawn)

  let s = await state()
  ok('首页渲染 10 个模板', s.list === 10 && s.total === 10, s.list + '/' + s.total)
  const ratios = new Set(s.thumbs)
  ok('缩略图按形状呈现不同比例', ratios.size >= 4, ratios.size + ' 种：' + [...ratios].join(' '))

  /* 2 抽屉 */
  console.log('\n[2] 筛选抽屉')
  await call0('openDrawer')
  await sleep(2000)
  s = await state()
  await shot('02-drawer')
  ok('抽屉已打开', s.drawer === true)
  ok('形状 5 项 · 打印 6 项', s.shapes.length === 5 && s.prints.length === 6,
    s.shapes.length + ' / ' + s.prints.length)

  /* 3 过滤 */
  console.log('\n[3] 勾选「1:2」+「迷你方牌」')
  await toggleChip('shapes', '1:2')
  await sleep(1500)
  s = await state()
  if (s.shapes.indexOf('1:2:true') === -1) await toggleChip('shapes', '1:2')

  await toggleChip('prints', 'mini')
  await sleep(1500)
  s = await state()
  if (s.prints.indexOf('mini:true') === -1) await toggleChip('prints', 'mini')
  await sleep(1500)

  s = await state()
  await shot('03-drawer-selected')
  ok('形状已选中', s.shapes.indexOf('1:2:true') !== -1, s.shapes.join(' '))
  ok('打印已选中', s.prints.indexOf('mini:true') !== -1, s.prints.join(' '))
  ok('角标只数过滤项', s.activeCount === 2, '角标 ' + s.activeCount)
  ok('交叉后无结果', s.list === 0, '剩余 ' + s.list)

  /* 4 空状态 */
  console.log('\n[4] 空状态')
  await call0('closeDrawer')
  await sleep(2000)
  await shot('04-empty')
  ok('空状态条件成立', (await state()).list === 0)

  /* 5 清除 */
  console.log('\n[5] 清除形状/尺寸筛选')
  await call0('clearHardFilters')
  await waitLog(/缩略图绘制 10 个/, 15000)
  await sleep(1500)
  s = await state()
  await shot('05-cleared')
  ok('恢复全部模板', s.list === 10, s.list + ' 个')
  ok('角标归零', s.activeCount === 0, String(s.activeCount))

  /* 6 场景 */
  console.log('\n[6] 场景：咖啡馆商店')
  await pickScene('cafe')
  await waitLog(/缩略图绘制 3 个/, 12000)
  await sleep(1200)
  s = await state()
  await shot('06-scene-cafe')
  ok('场景筛选命中', s.list > 0 && s.list < 10, '剩余 ' + s.list + ' 个')
  await call0('resetFilters')
  await sleep(5000)

  /* 7 编辑页 A4 */
  console.log('\n[7] 编辑页 · 夜泊 · A4')
  await navTo('/pages/editor/editor?tpl=night-berth')
  await sleep(3000)
  s = await state()
  ok('进入编辑页', s.route === 'pages/editor/editor', s.tplName)

  await fillForm('拾光咖啡二号店', 'Shiguang-Cafe-Guests-2026', 'coffee2024')
  await waitLog(/\[editor\] night-berth \/ a4 .*密码=/, 15000)
  await sleep(1200)
  s = await state()
  await shot('07-editor-a4')
  ok('画布为 A4 竖版', s.printKey === 'a4' && s.previewH > s.previewW,
    s.printKey + ' ' + s.previewW + '×' + s.previewH)
  ok('密码默认上牌', s.showPassword === true)
  ok('载荷正确', s.payload === 'WIFI:T:WPA;S:Shiguang-Cafe-Guests-2026;P:coffee2024;;', s.payload)

  /* 8 缩字号 */
  console.log('\n[8] 超长 Wi-Fi 名自动缩小')
  const before = lastLog('[editor]')
  await setSsid('WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW')      // 32 字节，SSID 上限
  // 日志是异步回传的，轮询等到这条重绘日志出现（最多 9 秒）
  let after = before
  for (let i = 0; i < 18; i++) {
    await sleep(500)
    const cur = lastLog('[editor]')
    if (cur && cur !== before) { after = cur; break }
  }
  s = await state()
  await shot('08-editor-long')
  ok('渲染日志报告字号已缩小', /已缩小/.test(after), after.replace(/^\[[a-z]+\]\s*/, ''))
  ok('日志随输入刷新', after !== before)

  /* 9 切尺寸 */
  console.log('\n[9] 切换打印尺寸 A4 → A5')
  await pickSeg('pickPrint', 'a5')
  await sleep(3000)
  s = await state()
  await shot('09-editor-a5')
  ok('尺寸切换生效', s.printKey === 'a5', s.printKey + ' · ' + s.printSpec +
    ' · 画布 ' + s.previewW + '×' + s.previewH)

  /* 10 关密码 */
  console.log('\n[10] 关闭「在桌牌上显示密码」')
  await call0('toggleShowPassword')
  await sleep(3000)
  s = await state()
  if (s.showPassword !== false) {
    await call0('toggleShowPassword')
    await sleep(2500)
    s = await state()
  }
  await shot('10-editor-nopwd')
  ok('开关已关闭', s.showPassword === false, lastLog('[editor]').replace(/^\[[a-z]+\]\s*/, ''))
  await call0('toggleShowPassword')
  await sleep(2000)

  /* 11 横版 */
  console.log('\n[11] 编辑页 · 候鸟 · 横版 A5')
  await navBack()
  await sleep(2500)
  await navTo('/pages/editor/editor?tpl=morning-mist')
  await sleep(3000)
  await fillForm('拾光咖啡', 'Shiguang-Cafe', 'coffee2024')
  await waitLog(/\[editor\] morning-mist .*密码=/, 15000)
  await sleep(1200)
  s = await state()
  await shot('11-editor-land')
  ok('横版预览', s.printKey === 'a5land' && s.previewW > s.previewH,
    s.printKey + ' ' + s.previewW + '×' + s.previewH)

  /* 12 方牌 */
  console.log('\n[12] 编辑页 · 静水 · 迷你 60×60')
  await navBack()
  await sleep(2500)
  await navTo('/pages/editor/editor?tpl=still-water')
  await sleep(3000)
  await fillForm('静水理疗', 'StillWater', 'care2026')
  await waitLog(/\[editor\] still-water .*密码=/, 15000)
  await sleep(1200)
  s = await state()
  await shot('12-editor-mini')
  ok('方牌预览为正方形', s.printKey === 'mini' && Math.abs(s.previewW - s.previewH) <= 2,
    s.printKey + ' ' + s.previewW + '×' + s.previewH + ' · 二维码 ' + s.qrMm + 'mm')

  /* 13 无密码 */
  console.log('\n[13] 加密方式切到「无密码」')
  await pickSeg('pickType', 'nopass')
  await sleep(3000)
  s = await state()
  await shot('13-editor-nopass')
  ok('nopass 不写 P 字段', s.payload === 'WIFI:T:nopass;S:StillWater;;', s.payload)

  /* 14 扫码回读 */
  console.log('\n[14] 截图里的二维码回读（系统识别器）')
  const decode = name => {
    try {
      const out = execFileSync('swift', [path.join(PROJECT, 'tools', 'decode.swift'),
        path.join(OUT, name + '.png')], { encoding: 'utf8', cwd: PROJECT })
      const line = out.split('\n').find(l => l.indexOf('载荷') === 0)
      return line ? line.replace(/^载荷:\s*/, '') : null
    } catch (e) {
      return null
    }
  }
  const pairs = [
    ['07-editor-a4', 'WIFI:T:WPA;S:Shiguang-Cafe-Guests-2026;P:coffee2024;;'],
    ['11-editor-land', 'WIFI:T:WPA;S:Shiguang-Cafe;P:coffee2024;;'],
    ['12-editor-mini', 'WIFI:T:WPA;S:StillWater;P:care2026;;'],
    ['13-editor-nopass', 'WIFI:T:nopass;S:StillWater;;']
  ]
  pairs.forEach(function (pair) {
    const got = decode(pair[0])
    ok('截图扫码 · ' + pair[0], got === pair[1], got === null ? '未识别' : got)
  })

  /* 汇总：这时才把截图搬进项目（写完就退出，不再触发重新编译）*/
  fs.mkdirSync(DELIVER, { recursive: true })
  shots.forEach(function (name) {
    fs.copyFileSync(path.join(OUT, name + '.png'), path.join(DELIVER, name + '.png'))
  })
  fs.writeFileSync(path.join(DELIVER, 'console.log'), logs.join('\n'))
  fs.writeFileSync(path.join(DELIVER, 'report.json'),
    JSON.stringify({ systemInfo: info, checks: check, logs, shots }, null, 2))
  console.log('\n截图已归档到 tools/out/devtools/ ×' + shots.length)

  const failed = check.filter(c => !c.pass)
  console.log('\n══════ 结论 ══════')
  console.log('断言 ' + check.length + ' 项：通过 ' + (check.length - failed.length) +
    ' · 失败 ' + failed.length)
  console.log('控制台 ' + logs.length + ' 条 · 错误 ' + errors.length + ' 条')
  logs.forEach(l => console.log('  ' + l))
  if (failed.length) {
    console.log('\n失败项：')
    failed.forEach(f => console.log('  ✗ ' + f.label + '  ' + f.detail))
  }

  try { await S.mp.disconnect() } catch (e) {}
  process.exit(failed.length || errors.length ? 1 : 0)
})().catch(err => {
  console.error('运行失败：' + (err && err.stack ? err.stack : err))
  process.exit(2)
})
