/**
 * tools/build-ornaments.js
 * 把公有领域花饰 SVG 转成小程序可用的 alpha 剪影资产。
 *
 * 为什么不用矢量描摹：实测对 19 世纪花饰的 IoU 只有 0.33~0.84，
 * 简化后卷须会断、孔洞会糊，印出来是走形的。
 * 所以资产走栅格 alpha（形状准确，单件几 KB），颜色不烘进图里——
 * 由 utils/ornament.js 按模板 palette 实时染色。
 *
 * 运行：node tools/build-ornaments.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var SRC = process.env.ORN_SRC || '/private/tmp/svg'
var ROOT = path.join(__dirname, '..')
var OUT_DIR = path.join(ROOT, 'assets', 'ornaments')
var RSVG = '/opt/homebrew/bin/rsvg-convert'
var PY = '/Users/ttyy/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3'
var TRIM = path.join(__dirname, 'ornament-trim.py')
var LONG_EDGE = 256

/* 只要装饰纹样。徽章、机构标志、书法手迹即便标了公有领域也不收：
   那些有商标与法规上的额外限制，印到商业桌牌上是给自己找麻烦。 */
var DECOR = /fleuron|tailpiece|ornament|scroll|acanthus|flourish|vignette/i
var BLOCK = /coat of arms|escudo|seal|logo|autograph|office|jrotc|wagner|california|united states|corona|geidai|caoshu|spurs/i

if (!fs.existsSync(RSVG)) { console.error('缺 rsvg-convert：' + RSVG); process.exit(1) }
if (!fs.existsSync(SRC)) { console.error('缺素材目录 ' + SRC); process.exit(1) }
fs.mkdirSync(OUT_DIR, { recursive: true })

var files = fs.readdirSync(SRC).filter(function (f) { return /\.svg$/i.test(f) })
var manifest = []
var skipped = []

files.forEach(function (f) {
  if (BLOCK.test(f)) { skipped.push([f, '非装饰（徽章/标志/手迹）']); return }
  if (!DECOR.test(f)) { skipped.push([f, '名称不含装饰关键词']); return }

  var key = f.replace(/\.svg$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  var png = path.join(OUT_DIR, key + '.png')
  var pngLight = path.join(OUT_DIR, key + '.light.png')
  var tmp = path.join(OUT_DIR, '_tmp.png')

  try {
    execFileSync(RSVG, ['-w', '1200', '-b', 'transparent', path.join(SRC, f), '-o', tmp], { stdio: 'ignore' })
  } catch (e) { skipped.push([f, 'rsvg 失败']); return }

  var out = ''
  try {
    out = execFileSync(PY, [TRIM, tmp, png, pngLight, String(LONG_EDGE)], { encoding: 'utf8' }).trim()
  } catch (e) { skipped.push([f, '裁剪失败']); return }

  if (out === 'EMPTY' || out === 'SOLID' || !fs.existsSync(png)) {
    skipped.push([f, out === 'SOLID' ? '满幅实心块（背景矩形）' : '空图'])
    if (fs.existsSync(png)) fs.unlinkSync(png)
    if (fs.existsSync(pngLight)) fs.unlinkSync(pngLight)
    return
  }

  var wh = out.split(' ').map(Number)
  var cov = parseFloat(out.split(' ')[2]) || 0
  manifest.push({
    key: key,
    file: 'assets/ornaments/' + key + '.png',
    lightFile: 'assets/ornaments/' + key + '.light.png',
    w: wh[0], h: wh[1],
    aspect: +(wh[0] / wh[1]).toFixed(3),
    coverage: +cov.toFixed(3),
    bytes: fs.statSync(png).size + fs.statSync(pngLight).size,
    from: f
  })
  console.log('  ok ' + key.padEnd(38) + wh[0] + 'x' + wh[1] + '  ' +
    Math.round((fs.statSync(png).size + fs.statSync(pngLight).size) / 1024) + 'KB')
})

var tmpPath = path.join(OUT_DIR, '_tmp.png')
if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)

manifest.sort(function (a, b) { return b.bytes - a.bytes })

var totalKb = manifest.reduce(function (n, m) { return n + m.bytes }, 0) / 1024
console.log('')
console.log('资产 ' + manifest.length + ' 件 / 合计 ' + totalKb.toFixed(1) + 'KB')
skipped.forEach(function (s) { console.log('  skip ' + s[0].slice(0, 42) + ' — ' + s[1]) })

var js = [
  '/**',
  ' * assets/ornaments/index.js',
  ' * 公有领域装饰纹样清单。由 tools/build-ornaments.js 生成，不要手改。',
  ' *',
  ' * 来源：Wikimedia Commons 标注 Public Domain / CC0 的书籍花饰',
  ' * （fleuron / tailpiece，16~20 世纪）。徽章与机构标志已排除。',
  ' * 图片是纯 alpha 剪影，颜色由 utils/ornament.js 按模板 palette 染。',
  ' */',
  '',
  'var ORNAMENTS = ' + JSON.stringify(manifest, null, 2),
  '',
  'function getOrnament (key) {',
  '  for (var i = 0; i < ORNAMENTS.length; i++) if (ORNAMENTS[i].key === key) return ORNAMENTS[i]',
  '  return null',
  '}',
  '',
  'module.exports = { ORNAMENTS: ORNAMENTS, getOrnament: getOrnament }',
  ''
].join('\n')

fs.writeFileSync(path.join(OUT_DIR, 'index.js'), js)
console.log('清单 → assets/ornaments/index.js')