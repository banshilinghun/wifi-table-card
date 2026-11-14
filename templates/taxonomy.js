/**
 * templates/taxonomy.js
 * 目录维度表：把「一个模板」拆成可枚举的六个维度。
 * 这里只放分类学（功能事实），不放任何外部素材。
 *
 * 维度与本地 templates/index.js 的字段一一对应：
 *   use     → scene[]      使用场景（单选硬过滤）
 *   region  → region       地区风格（单选，决定签名纹样）
 *   mood    → mood[]       氛围（多选偏好）
 *   density → 内部参数      留白密度，决定边距与纹样数量
 *   ratio   → shape        画布宽高比（决定可用打印规格）
 *   layout  → layout       版式骨架（center / split / stack）
 */

var USES = [
  { key: 'hotel', label: '住宿客房' },
  { key: 'cafe', label: '咖啡馆商店' },
  { key: 'dining', label: '餐厅酒吧' },
  { key: 'beauty', label: '美容保健' },
  { key: 'office', label: '办公会议' },
  { key: 'clinic', label: '诊所医疗' },
  { key: 'lobby', label: '接待等候' },
  { key: 'outdoor', label: '户外旅游' },
  { key: 'venue', label: '活动场地' },
  { key: 'home', label: '家用' }
]

var REGIONS = ['新中式', '日式', '韩式', '欧式', '极简']
var MOODS = ['自然', '都市', '传统', '温馨']
var LAYOUTS = ['center', 'split', 'stack']
var DENSITIES = ['minimal', 'light', 'medium', 'dense']

/** 地区风格 → 必须出现的签名纹样（与 verify-templates.js 的约定一致） */
var SIGNATURE = {
  '新中式': ['meander', 'seal'],
  '日式': ['vtext'],
  '韩式': ['softcorner'],
  '欧式': ['ornament'],
  '极简': []
}

/** 密度 → 版式参数。数值为相对短边 M 的比例 */
var DENSITY_RULES = {
  minimal: { margin: 0.10, motifMax: 2, rowGap: 0.052, qrShare: 0.50, headerW: 0.62 },
  light:   { margin: 0.075, motifMax: 4, rowGap: 0.046, qrShare: 0.47, headerW: 0.70 },
  medium:  { margin: 0.06, motifMax: 6, rowGap: 0.040, qrShare: 0.44, headerW: 0.76 },
  dense:   { margin: 0.05, motifMax: 8, rowGap: 0.034, qrShare: 0.40, headerW: 0.82 }
}

/** 版式骨架 → 各区块的权重（用于纵向分配，保证互不重叠） */
var LAYOUT_BANDS = {
  center: { header: 0.20, qr: 0.46, footer: 0.28, brand: 0.06 },
  split:  { header: 0.16, qr: 0.52, footer: 0.26, brand: 0.06 },
  stack:  { header: 0.26, qr: 0.42, footer: 0.24, brand: 0.08 }
}

/**
 * 文案池：按场景给眉标 / 提示 / 竖排小字。
 * 全部是本地原创短句，不复用任何外部站点的文案。
 */
var COPY = {
  hotel:   { eyebrow: ['客房网络', '住客专用', '房间网络'], hint: ['扫码即连 · 无需询问', '扫一扫，自动连上', '连网不用问前台'], vertical: ['客房专用', '住客专享', '安静休息'] },
  cafe:    { eyebrow: ['店内网络', '咖啡与网', '客座网络'], hint: ['扫码连网 · 慢慢坐', '连上再点单', '坐下就能连'], vertical: ['今日营业', '慢一点', '靠窗位'] },
  dining:  { eyebrow: ['餐桌网络', '今夜网络', '用餐 Wi-Fi'], hint: ['扫码连网 · 慢用', '菜还没上，先连上', '连网等位两不耽误'], vertical: ['今晚有位', '堂食专用', '慢用'] },
  beauty:  { eyebrow: ['护理区', '美容室网络', '候补区'], hint: ['扫码连网 · 静享时光', '敷着面膜也能刷', '护理中，稍等'], vertical: ['护理中', '请放松', '静享'] },
  office:  { eyebrow: ['访客网络', '会议室 Wi-Fi', '来宾网络'], hint: ['扫码接入 · 会议专用', '开会前先连好', '访客自助接入'], vertical: ['会议专用', '请勿外传', '访客'] },
  clinic:  { eyebrow: ['候诊区', '诊室网络', '导医台'], hint: ['扫码连网 · 安静等候', '等号时连一下', '请小声使用'], vertical: ['候诊中', '请耐心', '分诊台'] },
  lobby:   { eyebrow: ['大堂网络', '前台 Wi-Fi', '接待区'], hint: ['扫码连网 · 欢迎入住', '放下行李再连', '登记前先连好'], vertical: ['欢迎光临', '请登记', '大堂'] },
  outdoor: { eyebrow: ['营地网络', '山间小屋', '露台 Wi-Fi'], hint: ['扫码连网 · 山里有信号', '信号时好时坏，先存着', '帐篷区也能连'], vertical: ['山间小屋', '注意脚下', '风大'] },
  venue:   { eyebrow: ['活动现场', '展区网络', '签到处'], hint: ['扫码连网 · 一起玩', '发图不用再等', '签到后连这个'], vertical: ['签到处', '展区专用', '别走散'] },
  home:    { eyebrow: ['家庭网络', '家里 Wi-Fi', '客厅网络'], hint: ['扫码连网 · 到家了', '客人的先连这个', '路由器就在柜子上'], vertical: ['欢迎回家', '客厅', '自取'] }
}

module.exports = {
  USES: USES,
  REGIONS: REGIONS,
  MOODS: MOODS,
  LAYOUTS: LAYOUTS,
  DENSITIES: DENSITIES,
  SIGNATURE: SIGNATURE,
  DENSITY_RULES: DENSITY_RULES,
  LAYOUT_BANDS: LAYOUT_BANDS,
  COPY: COPY
}
