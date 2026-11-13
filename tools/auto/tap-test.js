/**
 * 真实模拟器上的点击验证：全流程都走 element.tap()，
 * 用来证明 WXML 里的 bindtap 绑定在真机运行时确实生效
 * （shoot.js 只负责截图，不点，避免点击卡住时污染截图流程）。
 *
 * 前置：同 shoot.js，先 cli auto --port 48803 --auto-port 9420
 * 用法：node tools/auto/tap-test.js
 */
const path = require('path')
const fs = require('fs')
const automator = require('miniprogram-automator')

const OUT = path.join(require('os').tmpdir(), 'wifi-sign-taps')
const WS = process.env.WS || 'ws://127.0.0.1:9420'

const results = []
process.on('unhandledRejection', () => {})

const sleep = ms => new Promise(r => setTimeout(r, ms))

function ok (label, pass, detail) {
  results.push({ label, pass: !!pass, detail: detail || '' })
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + label + (detail ? '  ' + detail : ''))
}

async function findText (page, selector, text) {
  const list = await page.$$(selector)
  for (const el of list) {
    const t = (await el.text()) || ''
    if (t.indexOf(text) !== -1) return el
  }
  return null
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })

  const mp = await automator.connect({ wsEndpoint: WS })
  const info = await mp.systemInfo()
  console.log('真实模拟器 ' + info.model + ' · 基础库 ' + info.SDKVersion + '\n')

  await mp.reLaunch('/pages/index/index')
  await sleep(4000)
  await mp.evaluate(function () { getCurrentPages()[0].resetFilters() })
  await sleep(5000)

  let page = await mp.currentPage()
  ok('首页已就绪', (await page.data()).list.length === 10)

  /* 1 点右上角「筛选」 */
  console.log('\n[点击 1] 右上角筛选按钮')
  const fbtn = await findText(page, '.filter-btn', '筛选')
  ok('找到筛选按钮', !!fbtn)
  await fbtn.tap()
  await sleep(1500)
  page = await mp.currentPage()
  ok('抽屉被点击打开', (await page.data()).drawer === true)

  await mp.screenshot({ path: path.join(OUT, 'tap-drawer.png') })

  /* 2 点标签「1:2」 */
  console.log('\n[点击 2] 抽屉里的形状标签 1:2')
  const chip = await findText(page, '.chip', '1:2')
  ok('找到形状标签', !!chip)
  await chip.tap()
  await sleep(1500)
  page = await mp.currentPage()
  let d = await page.data()
  ok('形状标签被选中', d.shapes.find(s => s.key === '1:2').on === true)
  ok('列表已被过滤', d.list.length < 10, '剩余 ' + d.list.length + ' 个')

  /* 3 点底部「查看 N 个模板」关抽屉 */
  console.log('\n[点击 3] 抽屉底部主按钮')
  const solid = await findText(page, '.btn-solid', '查看')
  ok('找到主按钮', !!solid)
  await solid.tap()
  await sleep(1500)
  page = await mp.currentPage()
  d = await page.data()
  ok('抽屉被点击关闭', d.drawer === false)

  /* 4 点重置，点模板卡片进编辑页 */
  console.log('\n[点击 4] 模板卡片')
  await mp.evaluate(function () { getCurrentPages()[0].resetFilters() })
  await sleep(5000)
  page = await mp.currentPage()
  const cell = await findText(page, '.cell', '夜泊')
  ok('找到「夜泊」卡片', !!cell)
  await cell.tap()
  await sleep(2500)
  page = await mp.currentPage()
  ok('进入编辑页', page.path === 'pages/editor/editor', page.path)

  await mp.screenshot({ path: path.join(OUT, 'tap-editor.png') })

  /* 5 点打印尺寸 A5 */
  console.log('\n[点击 5] 打印尺寸 A5')
  const a5 = await findText(page, '.seg-item', 'A5')
  ok('找到 A5 选项', !!a5)
  await a5.tap()
  await sleep(2000)
  page = await mp.currentPage()
  d = await page.data()
  ok('尺寸切换为 A5', d.printKey === 'a5', d.printKey + ' · ' + d.printSpec)

  /* 6 点「在桌牌上显示密码」开关 */
  console.log('\n[点击 6] 密码开关')
  const sw = await page.$('.sw')
  ok('找到开关', !!sw)
  await sw.tap()
  await sleep(2000)
  page = await mp.currentPage()
  d = await page.data()
  ok('开关被点击关闭', d.showPassword === false)

  await mp.screenshot({ path: path.join(OUT, 'tap-nopwd.png') })

  const failed = results.filter(r => !r.pass)
  console.log('\n══════ 点击验证 ══════')
  console.log('断言 ' + results.length + ' 项：通过 ' + (results.length - failed.length) +
    ' · 失败 ' + failed.length)
  fs.writeFileSync(path.join(OUT, 'tap-report.json'),
    JSON.stringify({ systemInfo: info, results }, null, 2))

  try { await mp.disconnect() } catch (e) {}
  process.exit(failed.length ? 1 : 0)
})().catch(err => {
  console.error('运行失败：' + (err && err.stack ? err.stack : err))
  process.exit(2)
})
