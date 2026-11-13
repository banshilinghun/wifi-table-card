/**
 * utils/templates.js
 * 6 套原创桌牌模板，纯数据描述，不含函数与外部图片。
 *
 * 坐标与长度单位（全部 0~1）：
 *   x / cx / x1 / x2   → 相对宽度 W
 *   y / cy / y1 / y2   → 相对高度 H
 *   其余长度（r / w / h / size / gap / thick）→ 相对短边 min(W, H)
 * 这样同一份模板在缩略图和高清导出下比例完全一致。
 *
 * palette 里的颜色可直接写 #RRGGBB，也可写调色板键名（ink / inkSub / accent / bg）。
 */

var TEMPLATES = [
  {
    id: 'minimal-white',
    name: '极简白',
    tag: '通用',
    font: 'sans',
    palette: {
      bg: '#FFFFFF',
      bgEnd: '#F4F1EA',
      ink: '#141310',
      inkSub: '#8C867C',
      accent: '#141310',
      qrDark: '#111110'
    },
    frame: { inset: 0.055, width: 0.0035, color: 'accent', alpha: 0.16 },
    decor: [
      { type: 'rect', x: 0.5, y: 0.072, w: 0.052, h: 0.0045, color: 'accent', alpha: 1 },
      { type: 'line', x1: 0.43, y1: 0.782, x2: 0.57, y2: 0.782, w: 0.0022, color: 'accent', alpha: 0.32 }
    ],
    copy: { hint: '微信扫一扫 · 自动连网' },
    slots: {
      shop: { x: 0.5, y: 0.155, maxW: 0.74, size: 0.078, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.492, size: 0.62 },
      ssid: { x: 0.5, y: 0.838, maxW: 0.66, size: 0.046, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.898, maxW: 0.72, size: 0.023, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'warm-retro',
    name: '暖色复古',
    tag: '咖啡',
    font: 'serif',
    palette: {
      bg: '#F3E3C3',
      bgEnd: '#E7CFA6',
      ink: '#4A2E18',
      inkSub: '#8A6A4A',
      accent: '#B4552F',
      qrDark: '#2E1B0E'
    },
    frame: { inset: 0.038, width: 0.005, color: 'accent', alpha: 0.55, double: true },
    decor: [
      { type: 'ring', cx: 0.06, cy: 0.94, r: 0.11, w: 0.004, color: 'accent', alpha: 0.35 },
      { type: 'ring', cx: 0.96, cy: 0.06, r: 0.07, w: 0.003, color: 'accent', alpha: 0.3 }
    ],
    copy: { hint: '扫码连网 · 无需询问密码' },
    slots: {
      shop: { x: 0.5, y: 0.145, maxW: 0.7, size: 0.082, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.487, size: 0.6 },
      ssid: { x: 0.5, y: 0.836, maxW: 0.64, size: 0.045, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.9, maxW: 0.7, size: 0.022, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'dark-mono',
    name: '深色',
    tag: '餐酒',
    font: 'sans',
    palette: {
      bg: '#15171B',
      bgEnd: '#20242B',
      ink: '#F3F0E9',
      inkSub: '#9BA1A8',
      accent: '#E0C07A',
      qrDark: '#111111'
    },
    frame: null,
    decor: [
      { type: 'grid', x: 0.5, y: 0.5, w: 1, h: 1, gap: 0.083, thick: 0.0015, color: 'ink', alpha: 0.07 },
      { type: 'rect', x: 0.5, y: 0.088, w: 0.09, h: 0.003, color: 'accent', alpha: 0.9 },
      { type: 'line', x1: 0.4, y1: 0.786, x2: 0.6, y2: 0.786, w: 0.0018, color: 'accent', alpha: 0.3 }
    ],
    copy: { hint: '扫描二维码 · 自动连接 Wi-Fi' },
    slots: {
      shop: { x: 0.5, y: 0.16, maxW: 0.72, size: 0.076, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.492, size: 0.62 },
      ssid: { x: 0.5, y: 0.84, maxW: 0.66, size: 0.044, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.9, maxW: 0.7, size: 0.022, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'fresh-green',
    name: '清新绿',
    tag: '民宿',
    font: 'sans',
    palette: {
      bg: '#EDF4E8',
      bgEnd: '#D9E9D1',
      ink: '#223E2A',
      inkSub: '#6A8572',
      accent: '#4C7A50',
      qrDark: '#1C2E22'
    },
    frame: null,
    decor: [
      { type: 'circle', cx: 0.94, cy: 0.03, r: 0.2, color: 'accent', alpha: 0.14 },
      { type: 'ring', cx: 0.08, cy: 0.96, r: 0.09, w: 0.003, color: 'accent', alpha: 0.28 },
      { type: 'dots', x: 0.5, y: 0.755, w: 0.12, h: 0.012, gap: 0.022, r: 0.004, color: 'accent', alpha: 0.45 }
    ],
    copy: { hint: '扫码即连 · 欢迎入住' },
    slots: {
      shop: { x: 0.5, y: 0.152, maxW: 0.72, size: 0.078, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.49, size: 0.6 },
      ssid: { x: 0.5, y: 0.838, maxW: 0.66, size: 0.045, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.898, maxW: 0.7, size: 0.022, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'handdrawn-cute',
    name: '手绘可爱',
    tag: '甜品',
    font: 'sans',
    palette: {
      bg: '#FFF3EF',
      bgEnd: '#FFE4DC',
      ink: '#5B3A35',
      inkSub: '#9C7C74',
      accent: '#E2796A',
      qrDark: '#3B2A26'
    },
    frame: { inset: 0.05, width: 0.0028, color: 'accent', alpha: 0.4 },
    decor: [
      {
        type: 'polyline',
        closed: false,
        points: [
          [0.1, 0.062], [0.18, 0.05], [0.26, 0.062], [0.34, 0.05],
          [0.42, 0.062], [0.5, 0.05], [0.58, 0.062], [0.66, 0.05],
          [0.74, 0.062], [0.82, 0.05], [0.9, 0.062]
        ],
        w: 0.004,
        color: 'accent',
        alpha: 0.6
      },
      { type: 'circle', cx: 0.1, cy: 0.79, r: 0.008, color: 'accent', alpha: 0.5 },
      { type: 'circle', cx: 0.9, cy: 0.83, r: 0.008, color: 'accent', alpha: 0.5 },
      { type: 'circle', cx: 0.86, cy: 0.78, r: 0.005, color: 'accent', alpha: 0.35 }
    ],
    copy: { hint: '扫一下 · 甜甜地连上网络' },
    slots: {
      shop: { x: 0.5, y: 0.152, maxW: 0.7, size: 0.08, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.487, size: 0.6 },
      ssid: { x: 0.5, y: 0.84, maxW: 0.66, size: 0.045, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.9, maxW: 0.72, size: 0.021, weight: '400', align: 'center', color: 'inkSub' }
    }
  },

  {
    id: 'business-blue',
    name: '商务蓝',
    tag: '办公',
    font: 'sans',
    palette: {
      bg: '#F4F7FB',
      bgEnd: '#E1EAF4',
      ink: '#16263D',
      inkSub: '#6C7E93',
      accent: '#2E5C8A',
      qrDark: '#101C2C'
    },
    frame: null,
    decor: [
      {
        type: 'polyline',
        closed: true,
        points: [[0, 0], [0.42, 0], [0, 0.28]],
        w: 0,
        color: 'accent',
        alpha: 0.1
      },
      { type: 'rect', x: 0.5, y: 0.9, w: 0.16, h: 0.0028, color: 'accent', alpha: 0.35 }
    ],
    copy: { hint: '扫码连接访客网络' },
    slots: {
      shop: { x: 0.5, y: 0.163, maxW: 0.72, size: 0.076, weight: '500', align: 'center', color: 'ink' },
      qr: { cx: 0.5, cy: 0.485, size: 0.61 },
      ssid: { x: 0.5, y: 0.834, maxW: 0.66, size: 0.044, weight: '500', align: 'center', color: 'ink' },
      hint: { x: 0.5, y: 0.895, maxW: 0.7, size: 0.022, weight: '400', align: 'center', color: 'inkSub' }
    }
  }
]

function getTemplate (id) {
  for (var i = 0; i < TEMPLATES.length; i++) {
    if (TEMPLATES[i].id === id) return TEMPLATES[i]
  }
  return TEMPLATES[0]
}

module.exports = {
  TEMPLATES: TEMPLATES,
  getTemplate: getTemplate
}
