/**
 * templates/paper.js —— 白纸系列（第一期主推）
 *
 * 与 templates/index.js 的深色系列是两套渲染路径：
 *   深色：背景 + Canvas 纹样 + 绝对坐标槽位（每套模板自己排版）
 *   白纸：装饰图层（packageTpl/art/*.webp）+ 统一的信息层（utils/paper-render.js）
 *
 * 白纸系列不写坐标。信息层的每个元素位置由 paper-render 按
 * art-bounds.js 量出来的 safe 区现算——换插画不用重排，加模板只填颜色与图名。
 *
 * ── 字段约定 ─────────────────────────────────────────────
 *   ink / accent   正文色 / 强调色。两个色值同时决定：标题、图标底色、二维码圆角框
 *   art            装饰图 key，对应 packageTpl/art/<key>.webp，坐标在 bounds.js
 *   vertical       侧边竖排文案，设为 null 就不画（三栏以上的窄牌建议关）
 *   miniCodeUrl    预留：小程序码图片。为空时信息层自动居中，不留空位
 *   placeNo/likes  预留：桌位号 / 点赞数。现在一律为空，渲染器已支持有值时排版
 */

var index = require('./index')

/* 新增的国内常用场景。原有 10 个场景在 templates/index.js 里保留不动 */
var SCENES = [
  { key: 'milktea', label: '奶茶咖啡', icon: 'cup' },
  { key: 'hotpot', label: '火锅餐厅', icon: 'glass' },
  { key: 'minsu', label: '民宿客栈', icon: 'bed' },
  { key: 'salon', label: '美甲美发', icon: 'leaf' },
  { key: 'teahouse', label: '棋牌茶室', icon: 'arch' },
  { key: 'festival', label: '节日', icon: 'flag' }
]

/**
 * 六套配色。色值按需求给定，不得随意改动——
 * 它们同时也是 QA 里对比度检查的输入（ink 对白底必须 ≥ 4.5）。
 */
var THEMES = [
  {
    key: 'milktea',
    id: 'paper-milktea',
    name: '奶白',
    ink: '#5b3a22',
    accent: '#b07a45',
    font: 'sans',
    scene: ['milktea', 'cafe'],
    mood: ['温馨', '都市'],
    desc: '一杯奶茶的轮廓，白底上只有线条，配一枚焦糖色圆章。',
    vertical: '扫码连网',
    typeScale: 1
  },
  {
    key: 'hotpot',
    id: 'paper-hotpot',
    name: '红汤',
    ink: '#3a1d17',
    accent: '#c8321f',
    font: 'sans',
    scene: ['hotpot', 'dining'],
    mood: ['都市', '温馨'],
    desc: '一口沸锅与腾起的热气，红章压在菜单白的桌牌上。',
    vertical: '本店网络',
    typeScale: 1
  },
  {
    key: 'minsu',
    id: 'paper-minsu',
    name: '山宿',
    ink: '#2b3a3f',
    accent: '#4f6f73',
    font: 'serif',
    scene: ['minsu', 'hotel'],
    mood: ['自然', '传统'],
    desc: '瓦檐、远山与云，像客房门口那张手写的木牌换成纸。',
    vertical: '客房专用',
    typeScale: 1.02
  },
  {
    key: 'beauty',
    id: 'paper-beauty',
    name: '花漾',
    ink: '#4a3340',
    accent: '#c98aa0',
    font: 'sans',
    scene: ['salon', 'beauty'],
    mood: ['温馨', '都市'],
    desc: '指甲油瓶与五瓣花，粉调印章落在留白上。',
    vertical: '静享时光',
    typeScale: 1
  },
  {
    key: 'teahouse',
    id: 'paper-teahouse',
    name: '清谈',
    ink: '#24392f',
    accent: '#5f9479',
    font: 'serif',
    scene: ['teahouse', 'lobby'],
    mood: ['传统', '自然'],
    desc: '一把提梁壶、两枚棋子，绿章配宋体，像茶单的一角。',
    vertical: '牌室网络',
    typeScale: 1
  },
  {
    key: 'newyear',
    id: 'paper-newyear',
    name: '岁红',
    ink: '#5a1410',
    accent: '#c8201c',
    font: 'serif',
    scene: ['festival', 'venue'],
    mood: ['传统', '温馨'],
    desc: '灯笼、梅花与铜钱，过年时贴在门边的那一张。',
    vertical: '新春网络',
    typeScale: 1.02
  }
]

var TEMPLATES = THEMES.map(function (t) {
  return {
    id: t.id,
    name: t.name,
    series: 'paper',
    family: 'paper',
    scene: t.scene,
    shape: '1:1.4',
    layout: 'center',
    mood: t.mood,
    region: '极简',
    prints: ['a6', 'a5', 'a4'],
    font: t.font,
    desc: t.desc,
    ink: t.ink,
    accent: t.accent,
    art: t.key,
    vertical: t.vertical,
    typeScale: t.typeScale || 1,
    copy: {
      title: '免费 Wi-Fi',
      sub: '扫码连接 · 无需询问'
    },
    // 预留字段：现在一律为空，页面/打印页按「有值才画」处理
    placeNo: '',
    likes: 0,
    miniCodeUrl: '',
    // 与深色模板对齐的字段，避免上层做 family 判断时取不到
    palette: { ink: t.ink, accent: t.accent, bg: '#FFFFFF', qrDark: t.ink }
  }
})

function getTemplate (id) {
  for (var i = 0; i < TEMPLATES.length; i++) {
    if (TEMPLATES[i].id === id) return TEMPLATES[i]
  }
  return null
}

/** 装饰图在包内的路径（页面 createImage 用） */
function artPath (tpl) {
  return '/packageTpl/art/' + tpl.art + '.webp'
}

module.exports = {
  SCENES: SCENES,
  THEMES: THEMES,
  TEMPLATES: TEMPLATES,
  getTemplate: getTemplate,
  artPath: artPath,
  PRINTS: index.PRINTS,
  SHAPES: index.SHAPES
}
