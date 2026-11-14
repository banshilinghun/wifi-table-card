/**
 * templates/index.js
 * 桌牌模板库：纯数据描述，不含函数、不含外部图片、不含网络资源。
 *
 * ── 单位约定（全部 0~1，与画布尺寸无关）────────────────────────
 *   x / cx / x1 / x2            → 相对宽度 W
 *   y / cy / y1 / y2            → 相对高度 H
 *   r / w / h / size / gap /
 *   thick / inset / amp / step  → 相对短边 M = min(W, H)
 * 同一份数据在 172rpx 的缩略图与 200mm 的长条桌签下比例完全一致。
 *
 * ── 标签维度 ────────────────────────────────────────────────
 *   scene   场景：数组，每个模板属 2~3 个场景
 *   shape   形状：1:2 / 1:1.4 / 1:1 / 1.4:1 / 2:1
 *           —— 必须与该模板所有 prints 的实际宽高比一致（±5%，校验见 tools/verify-templates.js）
 *   mood    氛围：自然 / 都市 / 传统 / 温馨（可多选）
 *   region  地区：新中式 / 日式 / 韩式 / 欧式 / 极简
 *           每种地区都有独有纹样，见下方「地区签名」
 *   prints  打印格式：只列出二维码可扫、文字可读、且比例与 shape 相符的规格
 *   layout  版式结构：center 二维码居中 / split 左码右字 / stack 上字下码
 */

var SCENES = [
  { key: 'all', label: '全部', icon: 'all' },
  { key: 'hotel', label: '住宿客房', icon: 'bed' },
  { key: 'cafe', label: '咖啡馆商店', icon: 'cup' },
  { key: 'dining', label: '餐厅酒吧', icon: 'glass' },
  { key: 'beauty', label: '美容保健', icon: 'leaf' },
  { key: 'office', label: '办公会议', icon: 'desk' },
  { key: 'clinic', label: '诊所医疗', icon: 'pulse' },
  { key: 'lobby', label: '接待等候', icon: 'arch' },
  { key: 'outdoor', label: '户外旅游', icon: 'peak' },
  { key: 'venue', label: '活动场地', icon: 'flag' },
  { key: 'home', label: '家用', icon: 'roof' }
]

var SHAPES = [
  { key: '1:2', label: '1:2', ratio: 0.5 },
  { key: '1:1.4', label: '1:1.4', ratio: 1 / 1.4 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '1.4:1', label: '1.4:1', ratio: 1.4 },
  { key: '2:1', label: '2:1', ratio: 2 }
]

var MOODS = ['自然', '都市', '传统', '温馨']
var REGIONS = ['新中式', '日式', '韩式', '欧式', '极简']

var LAYOUTS = [
  { key: 'center', label: '二维码居中' },
  { key: 'split', label: '左码右字' },
  { key: 'stack', label: '上字下码' }
]

/**
 * 打印规格。mm 为成品尺寸。
 * 每个规格的宽高比必须能对上某个 shape（±5%），否则不允许出现在模板的 prints 里。
 * 90×54mm 名片尺寸（1.67:1）对不上 1.4:1 与 2:1 中的任何一个（偏差 17%~19%），
 * 因此没有收录——要用它只能新增一个 1.67:1 的形状，而不是硬塞。
 */
var PRINTS = [
  { key: 'a4', label: '整页 A4', short: 'A4', spec: '210 × 297 mm', w: 210, h: 297 },
  { key: 'a5', label: '半页 A5', short: 'A5', spec: '148 × 210 mm', w: 148, h: 210 },
  { key: 'a5land', label: '横版 A5', short: 'A5横向', spec: '210 × 148 mm', w: 210, h: 148 },
  { key: 'strip', label: '长条桌签', short: '长条', spec: '200 × 100 mm', w: 200, h: 100 },
  { key: 'tower', label: '竖条', short: '竖条', spec: '100 × 200 mm', w: 100, h: 200 },
  { key: 'mini', label: '迷你方牌', short: '迷你', spec: '60 × 60 mm', w: 60, h: 60 }
]

/**
 * 地区签名：每种地区至少一个一眼能认出来的原创纹样。
 *   meander  回纹边框（新中式）
 *   seal     印章式方块（新中式）
 *   vtext    竖排小字（日式，走 slots.vertical）
 *   soft     柔和圆角/低饱和色块（韩式）
 *   ornament 细边框 + 装饰角（欧式）
 *   —— 极简是「无装饰」，signature 为空，靠字体与版式立住
 */
var REGION_SIGNATURE = {
  '新中式': ['meander', 'seal'],
  '日式': ['vtext'],
  '韩式': ['softcorner'],
  '欧式': ['ornament'],
  '极简': []
}

var TEMPLATES = [
  /* ── 1. 夜泊 · 日式 · 上字下码 + 竖排 ───────────────── */
  {
    id: 'night-berth',
    name: '夜泊',
    scene: ['hotel', 'lobby'],
    shape: '1:1.4',
    layout: 'stack',
    mood: ['温馨', '传统'],
    region: '日式',
    prints: ['a4', 'a5'],
    font: 'serif',
    desc: '深潭底色，一弯细月，右上角一列竖排小字，像客房门口的木牌。',
    palette: {
      bg: '#0E1A1A',
      bgEnd: '#182C2C',
      ink: '#EDE6D6',
      inkSub: '#8FA3A0',
      accent: '#C8A96A',
      qrDark: '#0B1414'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [
      { type: 'ring', cx: 0.86, cy: 0.075, r: 0.16, w: 0.0012, color: 'accent', alpha: 0.22 },
      { type: 'ring', cx: 0.86, cy: 0.075, r: 0.2, w: 0.0007, color: 'accent', alpha: 0.1 },
      { type: 'line', x1: 0.5, y1: 0.062, x2: 0.5, y2: 0.084, w: 0.0014, color: 'accent', alpha: 0.55 },
      { type: 'line', x1: 0.22, y1: 0.166, x2: 0.78, y2: 0.166, w: 0.0006, color: 'accent', alpha: 0.3 },
      { type: 'line', x1: 0.16, y1: 0.905, x2: 0.84, y2: 0.905, w: 0.0007, color: 'ink', alpha: 0.1 }
    ],
    copy: { eyebrow: '客房网络', hint: '扫码即连 · 无需询问', vertical: '客房专用' },
    slots: {
      eyebrow: { x: 0.5, y: 0.072, maxW: 0.6, size: 0.018, weight: '400', align: 'center', tracking: 0.22, color: 'accent' },
      shop: { x: 0.5, y: 0.118, maxW: 0.74, size: 0.060, weight: '500', align: 'center', color: 'ink' },
      vertical: { x: 0.9, y: 0.215, size: 0.019, step: 0.0295, color: 'inkSub', align: 'center' },
      qr: { cx: 0.5, cy: 0.5, size: 0.44 },
      ssid: { x: 0.5, y: 0.715, maxW: 0.7, size: 0.036, weight: '500', align: 'center', color: 'ink' },
      pwd: { x: 0.5, y: 0.762, maxW: 0.7, size: 0.029, weight: '400', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.815, maxW: 0.72, size: 0.022, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  /* ── 2. 晨雾 · 欧式 · 左码右字 ─────────────────────── */
  {
    id: 'morning-mist',
    name: '晨雾',
    scene: ['cafe', 'dining'],
    shape: '1.4:1',
    layout: 'split',
    mood: ['自然', '温馨'],
    region: '欧式',
    prints: ['a5land'],
    font: 'serif',
    desc: '奶油纸色，细边框收角，衬线字压在一条竖线旁，像压在杯垫下的便签。',
    palette: {
      bg: '#F5EFE4',
      bgEnd: '#EADFCC',
      ink: '#2C2620',
      inkSub: '#7A6E5E',
      accent: '#B0723F',
      qrDark: '#241E18'
    },
    background: { type: 'linear', angle: 135 },
    motifs: [
      { type: 'ornament', inset: 0.045, curl: 0.036, w: 0.0011, color: 'accent', alpha: 0.42 },
      { type: 'arc', cx: 0.72, cy: 0.02, r: 0.26, from: 20, to: 160, w: 0.0012, count: 2, step: 0.042, color: 'accent', alpha: 0.16 }
    ],
    copy: { eyebrow: '店内网络', hint: '扫一下，自动连上' },
    slots: {
      qr: { cx: 0.255, cy: 0.5, size: 0.56 },
      eyebrow: { x: 0.505, y: 0.3, maxW: 0.42, size: 0.044, weight: '400', align: 'left', tracking: 0.16, color: 'accent' },
      shop: { x: 0.505, y: 0.425, maxW: 0.43, size: 0.092, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.505, y: 0.6, maxW: 0.43, size: 0.052, weight: '500', align: 'left', color: 'ink' },
      pwd: { x: 0.505, y: 0.677, maxW: 0.43, size: 0.042, weight: '400', align: 'left', color: 'ink' },
      hint: { x: 0.505, y: 0.757, maxW: 0.43, size: 0.031, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  /* ── 3. 醉金 · 新中式 · 左码右字 ───────────────────── */
  {
    id: 'ember',
    name: '醉金',
    scene: ['dining', 'venue'],
    shape: '2:1',
    layout: 'split',
    mood: ['都市', '传统'],
    region: '新中式',
    prints: ['strip'],
    font: 'serif',
    desc: '深胡桃底，四周一圈回纹，右下角一方朱印，像老字号桌上的压纹。',
    palette: {
      bg: '#17100F',
      bgEnd: '#2A1715',
      ink: '#F0E4CF',
      inkSub: '#A08B75',
      accent: '#C79A4B',
      qrDark: '#120C0B'
    },
    background: { type: 'radial', at: [0.82, 0.5], r: 1.1 },
    motifs: [
      { type: 'meander', inset: 0.042, step: 0.056, thick: 0.0018, color: 'accent', alpha: 0.34 },
      { type: 'seal', x: 0.9, y: 0.842, size: 0.115, color: 'accent', ink: '#17100F', alpha: 0.9 },
      { type: 'line', x1: 0.355, y1: 0.24, x2: 0.355, y2: 0.76, w: 0.0008, color: 'accent', alpha: 0.28 }
    ],
    copy: { eyebrow: '今夜网络', hint: '扫码连网 · 慢用' },
    slots: {
      qr: { cx: 0.205, cy: 0.5, size: 0.58 },
      eyebrow: { x: 0.385, y: 0.285, maxW: 0.44, size: 0.042, weight: '400', align: 'left', tracking: 0.18, color: 'accent' },
      shop: { x: 0.385, y: 0.405, maxW: 0.46, size: 0.1, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.385, y: 0.565, maxW: 0.47, size: 0.052, weight: '500', align: 'left', color: 'ink' },
      pwd: { x: 0.385, y: 0.645, maxW: 0.47, size: 0.042, weight: '400', align: 'left', color: 'ink' },
      hint: { x: 0.385, y: 0.725, maxW: 0.42, size: 0.031, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  /* ── 4. 静水 · 韩式 · 二维码居中 ───────────────────── */
  {
    id: 'still-water',
    name: '静水',
    scene: ['beauty', 'clinic'],
    shape: '1:1',
    layout: 'center',
    mood: ['自然', '温馨'],
    region: '韩式',
    prints: ['mini'],
    font: 'sans',
    desc: '雾绿方牌，两块大圆角色块软软压住四角，低饱和到近乎无声。',
    palette: {
      bg: '#EDF3F0',
      bgEnd: '#DDE8E3',
      ink: '#2B3631',
      inkSub: '#72847C',
      accent: '#7C9C8D',
      qrDark: '#243430'
    },
    background: { type: 'radial', at: [0.46, 0.44], r: 0.95 },
    motifs: [
      { type: 'softcorner', x: 0.06, y: 0.045, size: 0.42, corner: 'tl', color: 'accent', alpha: 0.1 },
      { type: 'softcorner', x: 0.94, y: 0.955, size: 0.5, corner: 'br', color: 'accent', alpha: 0.08 },
      { type: 'ring', cx: 0.5, cy: 0.468, r: 0.3, w: 0.0011, color: 'accent', alpha: 0.16 }
    ],
    copy: { eyebrow: '护理区', hint: '扫码连网 · 静享时光' },
    slots: {
      eyebrow: { x: 0.5, y: 0.098, maxW: 0.62, size: 0.024, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.146, maxW: 0.8, size: 0.062, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.468, size: 0.44 },
      ssid: { x: 0.5, y: 0.728, maxW: 0.8, size: 0.044, weight: '500', align: 'center', color: 'ink' },
      pwd: { x: 0.5, y: 0.781, maxW: 0.8, size: 0.036, weight: '400', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.836, maxW: 0.82, size: 0.034, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  /* ── 5. 素蓝 · 极简 · 二维码居中 ───────────────────── */
  {
    id: 'blueprint',
    name: '素蓝',
    scene: ['office', 'venue'],
    shape: '1:1.4',
    layout: 'center',
    mood: ['都市'],
    region: '极简',
    prints: ['a5', 'a4'],
    font: 'sans',
    desc: '没有一个装饰元素。深蓝渐变上只有三行字和一个码，靠字重与留白立住。',
    palette: {
      bg: '#0E1521',
      bgEnd: '#1B2B40',
      ink: '#E8EFF7',
      inkSub: '#8FA1B6',
      accent: '#6E9BD9',
      qrDark: '#0B111A'
    },
    background: { type: 'linear', angle: 135 },
    motifs: [],
    copy: { eyebrow: '访客网络', hint: '扫码接入 · 会议专用' },
    slots: {
      eyebrow: { x: 0.5, y: 0.095, maxW: 0.6, size: 0.015, weight: '400', align: 'center', tracking: 0.24, color: 'accent' },
      shop: { x: 0.5, y: 0.152, maxW: 0.8, size: 0.072, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.468, size: 0.5 },
      ssid: { x: 0.5, y: 0.735, maxW: 0.8, size: 0.038, weight: '500', align: 'center', color: 'ink' },
      pwd: { x: 0.5, y: 0.784, maxW: 0.8, size: 0.031, weight: '400', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.842, maxW: 0.82, size: 0.02, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  /* ── 6. 静白 · 极简 · 二维码居中 ───────────────────── */
  {
    id: 'quiet-clinic',
    name: '静白',
    scene: ['clinic', 'lobby'],
    shape: '1:1',
    layout: 'center',
    mood: ['自然', '都市'],
    region: '极简',
    prints: ['mini'],
    font: 'sans',
    desc: '冷白方牌，零装饰，只有字的层级：眉标、店名、码、网络名、密码。',
    palette: {
      bg: '#F4F7F8',
      bgEnd: '#E4EBEE',
      ink: '#1B2A30',
      inkSub: '#61767E',
      accent: '#4E8C9A',
      qrDark: '#152226'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [],
    copy: { eyebrow: '候诊区', hint: '扫码连网 · 安静等候' },
    slots: {
      eyebrow: { x: 0.5, y: 0.092, maxW: 0.62, size: 0.024, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.143, maxW: 0.8, size: 0.062, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.47, size: 0.44 },
      ssid: { x: 0.5, y: 0.73, maxW: 0.8, size: 0.044, weight: '500', align: 'center', color: 'ink' },
      pwd: { x: 0.5, y: 0.783, maxW: 0.8, size: 0.036, weight: '400', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.838, maxW: 0.82, size: 0.034, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  /* ── 7. 候鸟 · 欧式 · 左码右字 ─────────────────────── */
  {
    id: 'waiting-room',
    name: '候鸟',
    scene: ['lobby', 'office', 'hotel'],
    shape: '1.4:1',
    layout: 'split',
    mood: ['温馨', '传统'],
    region: '欧式',
    prints: ['a5land'],
    font: 'serif',
    desc: '沙色横牌，双线细框收四角，衬线字与一条折线，像旧式航班牌。',
    palette: {
      bg: '#F2E9DC',
      bgEnd: '#E3D6C3',
      ink: '#2F2822',
      inkSub: '#7C6E5C',
      accent: '#8A6A46',
      qrDark: '#241F19'
    },
    background: { type: 'linear', angle: 0 },
    motifs: [
      { type: 'ornament', inset: 0.05, curl: 0.032, w: 0.001, color: 'accent', alpha: 0.45 },
      { type: 'polyline', closed: false, points: [[0.5, 0.87], [0.575, 0.828], [0.65, 0.87], [0.725, 0.828], [0.8, 0.87]], w: 0.0012, color: 'accent', alpha: 0.26 }
    ],
    copy: { eyebrow: '访客网络', hint: '扫码连网 · 请稍候' },
    slots: {
      qr: { cx: 0.25, cy: 0.5, size: 0.54 },
      eyebrow: { x: 0.495, y: 0.3, maxW: 0.42, size: 0.042, weight: '400', align: 'left', tracking: 0.16, color: 'accent' },
      shop: { x: 0.495, y: 0.42, maxW: 0.44, size: 0.088, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.495, y: 0.595, maxW: 0.44, size: 0.05, weight: '500', align: 'left', color: 'ink' },
      pwd: { x: 0.495, y: 0.672, maxW: 0.44, size: 0.04, weight: '400', align: 'left', color: 'ink' },
      hint: { x: 0.495, y: 0.755, maxW: 0.42, size: 0.03, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  /* ── 8. 山脊 · 日式 · 左码右字 ─────────────────────── */
  {
    id: 'ridge',
    name: '山脊',
    scene: ['outdoor', 'hotel'],
    shape: '2:1',
    layout: 'split',
    mood: ['自然', '传统'],
    region: '日式',
    prints: ['strip'],
    font: 'sans',
    desc: '墨绿宽幅，山形压在底部，右侧一列竖排小字与两条细线，留白很多。',
    palette: {
      bg: '#0F1A14',
      bgEnd: '#1B2E22',
      ink: '#E8F0E5',
      inkSub: '#8FA894',
      accent: '#8FBF7A',
      qrDark: '#0B1410'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [
      {
        type: 'polyline',
        closed: true,
        points: [[0, 1], [0, 0.905], [0.14, 0.79], [0.27, 0.87], [0.4, 0.75], [0.53, 0.855], [0.66, 0.77], [0.8, 0.885], [0.92, 0.815], [1, 0.875], [1, 1]],
        w: 0,
        color: 'ink',
        alpha: 0.05
      },
      { type: 'line', x1: 0.355, y1: 0.245, x2: 0.76, y2: 0.245, w: 0.0006, color: 'accent', alpha: 0.3 },
      { type: 'line', x1: 0.355, y1: 0.795, x2: 0.76, y2: 0.795, w: 0.0006, color: 'accent', alpha: 0.3 }
    ],
    copy: { eyebrow: '营地网络', hint: '扫码连网 · 山里有信号', vertical: '山间小屋' },
    slots: {
      qr: { cx: 0.172, cy: 0.5, size: 0.52 },
      vertical: { x: 0.945, y: 0.3, size: 0.018, step: 0.028, color: 'inkSub', align: 'center' },
      eyebrow: { x: 0.355, y: 0.28, maxW: 0.4, size: 0.04, weight: '400', align: 'left', tracking: 0.18, color: 'accent' },
      shop: { x: 0.355, y: 0.4, maxW: 0.42, size: 0.094, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.355, y: 0.555, maxW: 0.43, size: 0.05, weight: '500', align: 'left', color: 'ink' },
      pwd: { x: 0.355, y: 0.635, maxW: 0.43, size: 0.04, weight: '400', align: 'left', color: 'ink' },
      hint: { x: 0.355, y: 0.715, maxW: 0.41, size: 0.03, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  /* ── 9. 回声 · 韩式 · 二维码居中 ───────────────────── */
  {
    id: 'echo',
    name: '回声',
    scene: ['venue', 'beauty', 'cafe'],
    shape: '1:2',
    layout: 'center',
    mood: ['都市', '温馨'],
    region: '韩式',
    prints: ['tower'],
    font: 'sans',
    desc: '长条竖幅，灰紫底，两块大圆角柔光压在上下角，声波收得很淡。',
    palette: {
      bg: '#15131C',
      bgEnd: '#22202F',
      ink: '#EDE9F5',
      inkSub: '#9C93B4',
      accent: '#A48FD8',
      qrDark: '#0D0C14'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [
      { type: 'softcorner', x: 0.04, y: 0.03, size: 0.55, corner: 'tl', color: 'accent', alpha: 0.12 },
      { type: 'softcorner', x: 0.96, y: 0.97, size: 0.62, corner: 'br', color: 'accent', alpha: 0.1 },
      { type: 'arc', cx: 0.5, cy: 0.45, r: 0.26, from: 0, to: 360, w: 0.0008, count: 3, step: 0.04, color: 'accent', alpha: 0.12 },
      { type: 'line', x1: 0.3, y1: 0.885, x2: 0.7, y2: 0.885, w: 0.0008, color: 'accent', alpha: 0.26 }
    ],
    copy: { eyebrow: '活动现场', hint: '扫码连网 · 一起玩' },
    slots: {
      eyebrow: { x: 0.5, y: 0.088, maxW: 0.6, size: 0.02, weight: '400', align: 'center', tracking: 0.24, color: 'accent' },
      shop: { x: 0.5, y: 0.138, maxW: 0.78, size: 0.066, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.45, size: 0.42 },
      ssid: { x: 0.5, y: 0.715, maxW: 0.8, size: 0.044, weight: '500', align: 'center', color: 'ink' },
      pwd: { x: 0.5, y: 0.768, maxW: 0.8, size: 0.036, weight: '400', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.823, maxW: 0.82, size: 0.032, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  /* ── 10. 灶间 · 新中式 · 二维码居中 ────────────────── */
  {
    id: 'hearth',
    name: '灶间',
    scene: ['home', 'cafe'],
    shape: '1:1',
    layout: 'center',
    mood: ['温馨', '传统'],
    region: '新中式',
    prints: ['mini'],
    font: 'serif',
    desc: '暖米方牌，四周一圈回纹，中间细线托住码，像老灶台上的一方瓷砖。',
    palette: {
      bg: '#F6EEE1',
      bgEnd: '#EBDCC6',
      ink: '#3A2A1E',
      inkSub: '#7E6A56',
      accent: '#A8542F',
      qrDark: '#2C1F16'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [
      { type: 'meander', inset: 0.048, step: 0.052, thick: 0.0016, color: 'accent', alpha: 0.32 },
      { type: 'ring', cx: 0.5, cy: 0.468, r: 0.275, w: 0.001, color: 'accent', alpha: 0.24 }
    ],
    copy: { eyebrow: '家庭网络', hint: '扫码连网 · 到家了' },
    slots: {
      eyebrow: { x: 0.5, y: 0.1, maxW: 0.6, size: 0.022, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.155, maxW: 0.64, size: 0.064, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.468, size: 0.44 },
      ssid: { x: 0.5, y: 0.73, maxW: 0.72, size: 0.044, weight: '500', align: 'center', color: 'ink' },
      pwd: { x: 0.5, y: 0.783, maxW: 0.72, size: 0.036, weight: '400', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.838, maxW: 0.74, size: 0.034, weight: '400', align: 'center', color: 'inkSub' }
    }
  }
]

/* ── 查询辅助 ───────────────────────────────────────────── */

function getTemplate (id) {
  for (var i = 0; i < TEMPLATES.length; i++) {
    if (TEMPLATES[i].id === id) return TEMPLATES[i]
  }
  return TEMPLATES[0]
}

function getShape (key) {
  for (var i = 0; i < SHAPES.length; i++) {
    if (SHAPES[i].key === key) return SHAPES[i]
  }
  return SHAPES[0]
}

function getPrint (key) {
  for (var i = 0; i < PRINTS.length; i++) {
    if (PRINTS[i].key === key) return PRINTS[i]
  }
  return PRINTS[0]
}

function getScene (key) {
  for (var i = 0; i < SCENES.length; i++) {
    if (SCENES[i].key === key) return SCENES[i]
  }
  return SCENES[0]
}

/** 模板原生宽高比（宽/高） */
function shapeRatio (tpl) {
  return getShape(tpl.shape).ratio
}

/** 模板所属场景的展示名，如 "住宿客房 / 接待等候" */
function sceneText (tpl) {
  if (!tpl || !tpl.scene) return ''
  var list = Array.isArray(tpl.scene) ? tpl.scene : [tpl.scene]
  return list.map(function (k) { return getScene(k).label }).join(' / ')
}

/** 打印规格的实际宽高比（宽/高） */
function printRatioOf (printKey) {
  var p = getPrint(printKey)
  return p.w / p.h
}

/** 形状与打印规格的比例偏差（相对值，0 表示完全一致） */
function shapePrintDelta (tpl, printKey) {
  var a = shapeRatio(tpl)
  var b = printRatioOf(printKey)
  return Math.abs(a - b) / Math.max(a, b)
}

/**
 * 把模板按其原生比例塞进 maxW × maxH 的盒子（contain）。
 * @returns {{width:number, height:number}}
 */
function fitBox (ratio, maxW, maxH) {
  var w = maxW
  var h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  return { width: Math.floor(w), height: Math.floor(h) }
}

/** 打印规格对应的画布比例（宽/高） */
function printRatio (tpl, printKey) {
  return printRatioOf(printKey)
}

/** 把 mm 换算成导出像素（300dpi ≈ 11.81 px/mm） */
function printPixels (printKey, dpi) {
  var p = getPrint(printKey)
  var d = dpi || 300
  var mm2px = d / 25.4
  return {
    width: Math.round(p.w * mm2px),
    height: Math.round(p.h * mm2px)
  }
}

/** 打印格式的展示文案，例如 "A4 · A5" */
function printText (tpl) {
  return (tpl.prints || []).map(function (k) { return getPrint(k).short }).join(' · ')
}

module.exports = {
  TEMPLATES: TEMPLATES,
  SCENES: SCENES,
  SHAPES: SHAPES,
  MOODS: MOODS,
  REGIONS: REGIONS,
  LAYOUTS: LAYOUTS,
  PRINTS: PRINTS,
  REGION_SIGNATURE: REGION_SIGNATURE,
  getTemplate: getTemplate,
  getShape: getShape,
  getPrint: getPrint,
  getScene: getScene,
  shapeRatio: shapeRatio,
  printRatioOf: printRatioOf,
  shapePrintDelta: shapePrintDelta,
  sceneText: sceneText,
  fitBox: fitBox,
  printRatio: printRatio,
  printPixels: printPixels,
  printText: printText
}
