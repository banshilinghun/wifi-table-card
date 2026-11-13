/**
 * templates/index.js
 * 桌牌模板库：纯数据描述，不含函数、不含外部图片、不含网络资源。
 *
 * ── 单位约定（全部 0~1，与画布尺寸无关）────────────────────────
 *   x / cx / x1 / x2            → 相对宽度 W
 *   y / cy / y1 / y2            → 相对高度 H
 *   r / w / h / size / gap /
 *   thick / inset / amp / step  → 相对短边 M = min(W, H)
 * 同一份数据在 172rpx 的缩略图与 210mm 的 A4 导出下比例完全一致。
 *
 * ── 标签维度 ────────────────────────────────────────────────
 *   scene  场景：10 个，一模板一场景
 *   shape  形状：1:2 / 1:1.4 / 1:1 / 1.4:1 / 2:1
 *   mood   氛围：自然 / 都市 / 传统 / 温馨（可多选）
 *   region 地区：新中式 / 日式 / 韩式 / 欧式 / 极简
 *   prints 打印格式：只列出二维码可扫、文字可读的规格
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

/**
 * 打印规格。mm 为成品尺寸。
 * portraitCard 只影响 1:2 长版模板——卡片竖放（54×90）才是它的自然落点。
 */
var PRINTS = [
  { key: 'a4', label: '整页 A4', short: 'A4', spec: '210 × 297 mm', w: 210, h: 297 },
  { key: 'a5', label: '半页 A5', short: 'A5', spec: '148 × 210 mm', w: 148, h: 210 },
  { key: 'card', label: '卡片', short: '卡片', spec: '90 × 54 mm', w: 90, h: 54 },
  { key: 'mini', label: '迷你', short: '迷你', spec: '60 × 60 mm', w: 60, h: 60 }
]

var TEMPLATES = [
  {
    id: 'night-berth',
    name: '夜泊',
    scene: 'hotel',
    shape: '1:1.4',
    mood: ['温馨', '都市'],
    region: '日式',
    prints: ['a4', 'a5'],
    font: 'serif',
    desc: '深潭底色，一枚淡月，竖向留白像客房的门牌。',
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
      { type: 'ring', cx: 0.88, cy: 0.085, r: 0.23, w: 0.0014, color: 'accent', alpha: 0.2 },
      { type: 'ring', cx: 0.88, cy: 0.085, r: 0.29, w: 0.0009, color: 'accent', alpha: 0.1 },
      { type: 'line', x1: 0.5, y1: 0.058, x2: 0.5, y2: 0.082, w: 0.0016, color: 'accent', alpha: 0.6 },
      { type: 'line', x1: 0.3, y1: 0.732, x2: 0.7, y2: 0.732, w: 0.0011, color: 'accent', alpha: 0.32 },
      { type: 'line', x1: 0.18, y1: 0.928, x2: 0.82, y2: 0.928, w: 0.0009, color: 'ink', alpha: 0.12 }
    ],
    copy: { eyebrow: '客房网络', hint: '扫码即连 · 无需询问密码' },
    slots: {
      eyebrow: { x: 0.5, y: 0.108, maxW: 0.7, size: 0.019, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.168, maxW: 0.72, size: 0.074, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.47, size: 0.6 },
      ssid: { x: 0.5, y: 0.79, maxW: 0.66, size: 0.042, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.846, maxW: 0.7, size: 0.022, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'morning-mist',
    name: '晨雾',
    scene: 'cafe',
    shape: '1.4:1',
    mood: ['自然', '温馨'],
    region: '欧式',
    prints: ['card'],
    font: 'serif',
    desc: '横版卡片，左侧码，右侧字，像一张压在杯垫下的便签。',
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
      { type: 'diagonal', x: 0.5, y: 0.5, w: 1.35, h: 1.35, gap: 0.045, angle: 45, thick: 0.0008, color: 'ink', alpha: 0.045 },
      { type: 'arc', cx: 0.72, cy: 0.04, r: 0.34, from: 20, to: 160, w: 0.0016, count: 3, step: 0.05, color: 'accent', alpha: 0.22 },
      { type: 'line', x1: 0.535, y1: 0.2, x2: 0.535, y2: 0.8, w: 0.001, color: 'accent', alpha: 0.4 }
    ],
    copy: { eyebrow: '店内网络', hint: '扫一下，自动连上' },
    slots: {
      qr: { cx: 0.28, cy: 0.5, size: 0.66 },
      eyebrow: { x: 0.585, y: 0.305, maxW: 0.36, size: 0.048, weight: '400', align: 'left', tracking: 0.16, color: 'accent' },
      shop: { x: 0.585, y: 0.445, maxW: 0.37, size: 0.108, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.585, y: 0.625, maxW: 0.37, size: 0.062, weight: '500', align: 'left', color: 'ink' },
      hint: { x: 0.585, y: 0.735, maxW: 0.4, size: 0.039, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  {
    id: 'ember',
    name: '醉金',
    scene: 'dining',
    shape: '2:1',
    mood: ['都市', '传统'],
    region: '新中式',
    prints: ['card'],
    font: 'serif',
    desc: '宽幅横条，右侧扇形金弧，像餐巾环上的一道压纹。',
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
      { type: 'arc', cx: 1.0, cy: 0.5, r: 0.46, from: -78, to: 78, w: 0.0016, count: 5, step: 0.062, color: 'accent', alpha: 0.26 },
      { type: 'line', x1: 0.462, y1: 0.24, x2: 0.462, y2: 0.76, w: 0.0009, color: 'accent', alpha: 0.3 },
      { type: 'dots', x: 0.7, y: 0.855, w: 0.34, h: 0.012, gap: 0.03, r: 0.0018, color: 'accent', alpha: 0.4 }
    ],
    copy: { eyebrow: '今夜网络', hint: '扫码连网 · 慢用' },
    slots: {
      qr: { cx: 0.235, cy: 0.5, size: 0.66 },
      eyebrow: { x: 0.492, y: 0.318, maxW: 0.42, size: 0.05, weight: '400', align: 'left', tracking: 0.18, color: 'accent' },
      shop: { x: 0.492, y: 0.452, maxW: 0.45, size: 0.122, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.492, y: 0.636, maxW: 0.46, size: 0.064, weight: '500', align: 'left', color: 'ink' },
      hint: { x: 0.492, y: 0.752, maxW: 0.47, size: 0.039, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  {
    id: 'still-water',
    name: '静水',
    scene: 'beauty',
    shape: '1:1',
    mood: ['自然'],
    region: '韩式',
    prints: ['mini'],
    font: 'sans',
    desc: '正方小牌，同心水纹从牌心荡开，克制到近乎无声。',
    palette: {
      bg: '#EAF1EE',
      bgEnd: '#D9E7E1',
      ink: '#23302C',
      inkSub: '#6C8079',
      accent: '#5B8A78',
      qrDark: '#1B2925'
    },
    background: { type: 'radial', at: [0.5, 0.46], r: 0.95 },
    motifs: [
      { type: 'ring', cx: 0.5, cy: 0.465, r: 0.305, w: 0.0012, color: 'accent', alpha: 0.18 },
      { type: 'ring', cx: 0.5, cy: 0.465, r: 0.36, w: 0.0009, color: 'accent', alpha: 0.1 },
      { type: 'wave', x: 0.5, y: 0.912, w: 0.86, amp: 0.011, wave: 0.08, count: 3, step: 0.024, thick: 0.0011, color: 'accent', alpha: 0.24 }
    ],
    copy: { eyebrow: '护理区', hint: '扫码连网 · 静享时光' },
    slots: {
      eyebrow: { x: 0.5, y: 0.096, maxW: 0.66, size: 0.028, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.148, maxW: 0.72, size: 0.072, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.482, size: 0.47 },
      ssid: { x: 0.5, y: 0.79, maxW: 0.66, size: 0.05, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.856, maxW: 0.72, size: 0.035, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'blueprint',
    name: '蓝图',
    scene: 'office',
    shape: '1:1.4',
    mood: ['都市'],
    region: '极简',
    prints: ['a5', 'a4'],
    font: 'sans',
    desc: '深蓝图纸网格，四角十字定位，像一份会议资料的首屏。',
    palette: {
      bg: '#0E1521',
      bgEnd: '#182638',
      ink: '#E6EDF5',
      inkSub: '#8A9CB2',
      accent: '#5C8FD6',
      qrDark: '#0B111A'
    },
    background: { type: 'linear', angle: 135 },
    motifs: [
      { type: 'grid', x: 0.5, y: 0.5, w: 1, h: 1, gap: 0.0625, thick: 0.0007, color: 'ink', alpha: 0.06 },
      { type: 'corner', inset: 0.042, len: 0.058, w: 0.0012, color: 'accent', alpha: 0.5 },
      { type: 'line', x1: 0.058, y1: 0.098, x2: 0.942, y2: 0.098, w: 0.0008, color: 'accent', alpha: 0.22 }
    ],
    copy: { eyebrow: '访客网络', hint: '扫码接入 · 会议专用' },
    slots: {
      eyebrow: { x: 0.5, y: 0.112, maxW: 0.7, size: 0.019, weight: '400', align: 'center', tracking: 0.22, color: 'accent' },
      shop: { x: 0.5, y: 0.166, maxW: 0.74, size: 0.072, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.462, size: 0.575 },
      ssid: { x: 0.5, y: 0.775, maxW: 0.68, size: 0.04, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.833, maxW: 0.7, size: 0.021, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'quiet-clinic',
    name: '白噪',
    scene: 'clinic',
    shape: '1:1',
    mood: ['自然', '都市'],
    region: '极简',
    prints: ['mini'],
    font: 'sans',
    desc: '冷白方牌，点阵疏得像雾，四分之一圆弧压住呼吸。',
    palette: {
      bg: '#F2F6F7',
      bgEnd: '#E2EBEE',
      ink: '#1B2A30',
      inkSub: '#5E747C',
      accent: '#4E8C9A',
      qrDark: '#152226'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [
      { type: 'dots', x: 0.5, y: 0.5, w: 0.92, h: 0.92, gap: 0.068, r: 0.0014, color: 'accent', alpha: 0.15 },
      { type: 'arc', cx: 0.04, cy: 0.04, r: 0.38, from: 0, to: 90, w: 0.0018, count: 1, step: 0.05, color: 'accent', alpha: 0.22 },
      { type: 'line', x1: 0.5, y1: 0.9, x2: 0.5, y2: 0.925, w: 0.0014, color: 'accent', alpha: 0.4 }
    ],
    copy: { eyebrow: '候诊区', hint: '扫码连网 · 安静等候' },
    slots: {
      eyebrow: { x: 0.5, y: 0.09, maxW: 0.66, size: 0.027, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.145, maxW: 0.72, size: 0.07, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.48, size: 0.48 },
      ssid: { x: 0.5, y: 0.795, maxW: 0.68, size: 0.048, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.858, maxW: 0.74, size: 0.035, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'waiting-room',
    name: '候鸟',
    scene: 'lobby',
    shape: '1.4:1',
    mood: ['温馨', '传统'],
    region: '欧式',
    prints: ['card'],
    font: 'sans',
    desc: '沙色横牌，一条折线像航班信息的旧显示屏，四角细描边。',
    palette: {
      bg: '#F0E7DA',
      bgEnd: '#E2D5C2',
      ink: '#2F2822',
      inkSub: '#7C6E5C',
      accent: '#8A6A46',
      qrDark: '#241F19'
    },
    background: { type: 'linear', angle: 0 },
    motifs: [
      { type: 'corner', inset: 0.038, len: 0.046, w: 0.0012, color: 'accent', alpha: 0.5 },
      { type: 'polyline', closed: false, points: [[0.56, 0.862], [0.625, 0.818], [0.69, 0.862], [0.755, 0.818], [0.82, 0.862]], w: 0.0014, color: 'accent', alpha: 0.3 },
      { type: 'ring', cx: 0.075, cy: 0.88, r: 0.12, w: 0.001, color: 'accent', alpha: 0.16 }
    ],
    copy: { eyebrow: '访客网络', hint: '扫码连网 · 请稍候' },
    slots: {
      qr: { cx: 0.265, cy: 0.5, size: 0.64 },
      eyebrow: { x: 0.575, y: 0.312, maxW: 0.36, size: 0.046, weight: '400', align: 'left', tracking: 0.16, color: 'accent' },
      shop: { x: 0.575, y: 0.45, maxW: 0.37, size: 0.1, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.575, y: 0.628, maxW: 0.37, size: 0.058, weight: '500', align: 'left', color: 'ink' },
      hint: { x: 0.575, y: 0.74, maxW: 0.4, size: 0.039, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  {
    id: 'ridge',
    name: '山脊',
    scene: 'outdoor',
    shape: '2:1',
    mood: ['自然'],
    region: '日式',
    prints: ['card'],
    font: 'sans',
    desc: '墨绿宽幅，等高线与山形叠在一起，适合营地与山屋。',
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
      { type: 'contour', cx: 0.66, cy: 0.5, r0: 0.16, count: 6, step: 0.05, wobble: 0.016, w: 0.0009, color: 'accent', alpha: 0.16 },
      {
        type: 'polyline',
        closed: true,
        points: [[0, 1], [0, 0.87], [0.14, 0.7], [0.27, 0.82], [0.4, 0.64], [0.53, 0.79], [0.66, 0.68], [0.8, 0.85], [0.92, 0.75], [1, 0.86], [1, 1]],
        w: 0,
        color: 'ink',
        alpha: 0.06
      },
      { type: 'line', x1: 0.458, y1: 0.22, x2: 0.458, y2: 0.78, w: 0.0008, color: 'accent', alpha: 0.22 }
    ],
    copy: { eyebrow: '营地网络', hint: '扫码连网 · 山里有信号' },
    slots: {
      qr: { cx: 0.23, cy: 0.5, size: 0.66 },
      eyebrow: { x: 0.486, y: 0.322, maxW: 0.42, size: 0.048, weight: '400', align: 'left', tracking: 0.18, color: 'accent' },
      shop: { x: 0.486, y: 0.458, maxW: 0.45, size: 0.115, weight: '500', align: 'left', color: 'ink' },
      ssid: { x: 0.486, y: 0.638, maxW: 0.46, size: 0.06, weight: '500', align: 'left', color: 'ink' },
      hint: { x: 0.486, y: 0.752, maxW: 0.47, size: 0.039, weight: '400', align: 'left', color: 'inkSub' }
    }
  },

  {
    id: 'echo',
    name: '回声',
    scene: 'venue',
    shape: '1:2',
    mood: ['都市', '传统'],
    region: '韩式',
    prints: ['card'],
    cardPortrait: true,
    font: 'sans',
    desc: '长条竖幅，一圈圈扩散的声波，适合门口、展位、签到台。',
    palette: {
      bg: '#111019',
      bgEnd: '#1F1B2E',
      ink: '#EDE9F5',
      inkSub: '#9C93B4',
      accent: '#9A7BD6',
      qrDark: '#0D0C14'
    },
    background: { type: 'linear', angle: 90 },
    motifs: [
      { type: 'arc', cx: 0.5, cy: 0.5, r: 0.3, from: 0, to: 360, w: 0.0008, count: 4, step: 0.048, color: 'accent', alpha: 0.14 },
      { type: 'bars', x: 0.5, y: 0.5, w: 0.84, h: 0.96, n: 2, thick: 0.001, color: 'accent', alpha: 0.16 },
      { type: 'line', x1: 0.2, y1: 0.882, x2: 0.8, y2: 0.882, w: 0.0009, color: 'accent', alpha: 0.3 },
      { type: 'rect', x: 0.5, y: 0.915, w: 0.06, h: 0.0022, color: 'accent', alpha: 0.55 }
    ],
    copy: { eyebrow: '活动现场', hint: '扫码连网 · 一起玩' },
    slots: {
      eyebrow: { x: 0.5, y: 0.128, maxW: 0.7, size: 0.021, weight: '400', align: 'center', tracking: 0.24, color: 'accent' },
      shop: { x: 0.5, y: 0.176, maxW: 0.74, size: 0.078, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.5, size: 0.56 },
      ssid: { x: 0.5, y: 0.752, maxW: 0.7, size: 0.054, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.808, maxW: 0.72, size: 0.039, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'hearth',
    name: '灶间',
    scene: 'home',
    shape: '1:1',
    mood: ['温馨', '传统'],
    region: '新中式',
    prints: ['mini'],
    font: 'serif',
    desc: '暖米方牌，细方格像老瓷砖，一圈细线圈住二维码。',
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
      { type: 'grid', x: 0.5, y: 0.5, w: 1, h: 1, gap: 0.0833, thick: 0.0015, color: 'accent', alpha: 0.07 },
      { type: 'ring', cx: 0.5, cy: 0.472, r: 0.335, w: 0.0012, color: 'accent', alpha: 0.32 },
      { type: 'rect', x: 0.5, y: 0.922, w: 0.1, h: 0.0026, color: 'accent', alpha: 0.5 }
    ],
    copy: { eyebrow: '家庭网络', hint: '扫码连网 · 到家了' },
    slots: {
      eyebrow: { x: 0.5, y: 0.092, maxW: 0.66, size: 0.027, weight: '400', align: 'center', tracking: 0.2, color: 'accent' },
      shop: { x: 0.5, y: 0.15, maxW: 0.72, size: 0.071, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.483, size: 0.47 },
      ssid: { x: 0.5, y: 0.8, maxW: 0.68, size: 0.049, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.862, maxW: 0.74, size: 0.035, weight: '400', align: 'center', color: 'inkSub' }
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

/** 打印规格对应的画布比例（宽/高）；1:2 长版模板的卡片是竖放 */
function printRatio (tpl, printKey) {
  var p = getPrint(printKey)
  if (printKey === 'card' && tpl && tpl.cardPortrait) return p.h / p.w
  return p.w / p.h
}

/** 把 mm 换算成导出像素（300dpi ≈ 11.81 px/mm） */
function printPixels (tpl, printKey, dpi) {
  var p = getPrint(printKey)
  var d = dpi || 300
  var mm2px = d / 25.4
  var portrait = printKey === 'card' && tpl && tpl.cardPortrait
  return {
    width: Math.round((portrait ? p.h : p.w) * mm2px),
    height: Math.round((portrait ? p.w : p.h) * mm2px)
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
  PRINTS: PRINTS,
  getTemplate: getTemplate,
  getShape: getShape,
  getPrint: getPrint,
  getScene: getScene,
  shapeRatio: shapeRatio,
  fitBox: fitBox,
  printRatio: printRatio,
  printPixels: printPixels,
  printText: printText
}
