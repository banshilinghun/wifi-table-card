# 第一期：白纸模板 + 打印拼版

分支 `phase1`，从 `main`（`04062b5`）拉出。这一期是**纯本地**的：所有数据只写这台手机的
`wx.setStorageSync`，小程序不发任何网络请求。以后接云端只换一个适配器，页面代码不动。

```
templates/paper.js            6 套白纸模板（配色 / 场景 / 规格）
templates/catalog.js          统一入口：白纸在前、深色在后
packageTpl/art/*.webp         装饰图层（1200×1680，1:1.4，白底）
packageTpl/art/bounds.js      自动量出来的图标区 / 避让区 / 可用区
utils/paper-render.js         信息层：标题、副标题、二维码、网络、密码、店名、竖排
utils/print-layout.js         A4 拼版几何（毫米）
utils/sheet-render.js         把 N 份画到一张纸上（预览与 300dpi 导出共用）
utils/repo.js                 数据层（Promise + 可替换适配器）
utils/art.js                  装饰图加载与缓存
utils/draw.js                 两套模板的分发口
utils/filters.js              筛选（场景白名单已跟模板库合并）
pages/print/print.*           打印预览
```

## 1 数据层 `utils/repo.js`

五个 API，全部返回 Promise，页面只 `await` 结果，不碰存储键：

| API | 现在（本地） | 以后（云端） |
| --- | --- | --- |
| `getDraft()` | `wifi_draft` | `GET /draft` |
| `saveDraft(d)` | 合并写入 + 时间戳 | `PUT /draft` |
| `listFavorites()` | `wifi_favorites`，最近在前 | `GET /favorites` |
| `toggleFavorite(id)` | 有则删、无则加，返回 `{favorited, list}` | `POST /favorites/toggle` |
| `listWorks()` / `saveWork(w)` | `wifi_works`，最多 60 条 | `GET/POST /works` |

换数据源：

```js
repo.useAdapter(myCloudAdapter)   // 实现同名方法即可，页面一行不用改
```

作品记录里预留了三个字段，现在都是空值，界面不显示：

```js
{ placeNo: '', likes: 0, miniCodeUrl: '' }
```

`tools/verify-repo.js` 用 27 条断言把上面每一条都跑一遍，包括「适配器抛错时 reject
而不是崩页」和「切到 mock 云端后页面同一行调用照常工作」。

## 2 模板 = 装饰层 + 信息层

一套白纸模板就是「一张图 + 一组颜色 + 一段文案」：

```js
{
  id: 'paper-milktea', series: 'paper', family: 'paper',
  ink: '#5b3a22', accent: '#b07a45',   // 文字与点缀色
  art: 'milktea',                       // packageTpl/art/milktea.webp
  copy: { title: '免费 Wi-Fi', sub: '扫码连接 · 无需询问' },
  vertical: '扫码连网',                  // 侧边竖排小字（可关）
  prints: ['a6', 'a5', 'a4'], shape: '1:1.4',
  scene: ['milktea', 'cafe'], mood: ['温馨', '都市'], region: '极简'
}
```

信息层的排布不手填坐标，而是**从图里量**：`tools/art-bounds.js` 对装饰图做 8 邻域
连通域分析（阈值「任一通道 < 248 算有内容」，面积 < 0.00002 当噪点），得到

```
icon   顶部圆形徽章的外接矩形      信息层不许压
avoid  四角插画的外接矩形 ×4       文字与二维码都不许压
safe   被上面两者夹出来的中间区    信息层在这里排
```

量出来的结果是 0~1 的相对比例，与画布尺寸、打印规格无关，所以 A6/A5/A4 用的是同一份
坐标。换一张插画只要跑一次 `node tools/art-bounds.js`，不用重排。

信息层固定顺序：`免费 Wi-Fi` 标题 → `扫码连接 · 无需询问` 副标题 → 二维码（白底 +
4 模块静区 + 主题色圆角边框）→ 网络名（Wi-Fi 小图标）→ 密码（锁图标）→ 店名；侧边
竖排小字可关。小图标是主题色圆角方块 + 白色字形，跟着画布缩放。

放不下时自动缩（`MAX_ATTEMPTS = 4`），但守毫米下限：

```
标题 3.4mm · 副标题 2.1mm · 网络/密码行 2.3mm · 店名 2.6mm · 二维码 18mm · 单模块 0.4mm
```

缩到下限还放不下就返回 `warnings`，编辑页日志里能看到「已缩字 ×0.83」。

六套配色：

| id | 场景 | ink | accent |
| --- | --- | --- | --- |
| `paper-milktea` | 奶茶咖啡 | `#5b3a22` | `#b07a45` |
| `paper-hotpot` | 火锅餐厅 | `#3a1d17` | `#c8321f` |
| `paper-minsu` | 民宿客栈 | `#2b3a3f` | `#4f6f73` |
| `paper-beauty` | 美甲美发 | `#4a3340` | `#c98aa0` |
| `paper-teahouse` | 棋牌茶室 | `#24392f` | `#5f9479` |
| `paper-newyear` | 节日（春节） | `#5a1410` | `#c8201c` |

深色系列 10 套原样保留，`series: 'dark'`，排在白纸之后，首页分两组。

## 3 打印

### 几何

尺寸全在毫米里算，渲染时才乘「每毫米多少像素」：预览是屏幕像素，导出是 11.81 px/mm
（300dpi）。所以预览与成品是同一版式，不会「预览对、打印错」。

网格是解出来的，不是写死的：

1. 纸边让出外边距（常规 8mm / 窄边距 4mm）；
2. 每格四周再让 2mm 裁切间隙；
3. 格子里按 **1:1.4** 拟合一张牌并居中——比例是硬约束，边距不能把它拉变形
   （早期版本直接把边距从格子尺寸里减掉，1:1.4 变成 1:1.49，「卡片 4 份」被误判为不可用）；
4. 每次拟合都试正放与旋转 90°，**只有正放不达标（码或模块跌破下限）才旋转**，
   避免整版内容莫名躺倒。

A4（边距 8mm）实测：

| 版式 | 竖版 A4 每份 | 码 | 横版 A4 每份 | 码 |
| --- | --- | --- | --- | --- |
| 整张 1 份 | 190×266mm | 87.3mm | 136×190mm | 62.4mm |
| 半张 2 份 | 98×137mm | 44.8mm | 136×190mm | 62.4mm |
| 卡片 4 份 | 93×130mm | 42.7mm | 66×93mm | 30.5mm |
| 迷你 8 份 | 47×66mm | 21.7mm | 66×93mm | 30.4mm |

横版的「整张」和「半张」每份一样大（一张 1:1.4 的牌放在横版纸上一行只放得下一张），
所以横版更适合半张与卡片，界面上照实显示，不藏。

### 导出

离屏 canvas 按 A4 300dpi 出图（2480×3508），失败降 200dpi（1654×2339）再试一次；
出图后 `wx.saveImageToPhotosAlbum` 存相册，或 `wx.showShareImageMenu` 直接发给打印店。
导出成功会往 `wifi_works` 记一条作品。

### 门槛

小程序码、迷你版式这类小尺寸必须校验：二维码 ≥ 15mm、单模块 ≥ 0.4mm，不达标就
`usable: false`，界面上不提供这一档并给出原因。迷你 8 份现在是 21.7mm / 0.53mm，
标「小型二维码」；整张与半张标「标准二维码」（≥ 25mm）。

## 4 收藏 / 分享 / 隐私

- 首页卡片右上角 ♡，编辑页预览右上角 ♡，都写 `wifi_favorites`；首页右上角是「我的收藏」入口，只显示收藏过的模板。
- `onShareAppMessage` 只带模板 id（`/pages/editor/editor?tpl=xxx`），**不带 Wi-Fi 名称与密码**。
- 隐私说明（首页底部）5 条：现在全部在本机 / 以后只上传不敏感信息 / 密码永远不上传 /
  只在保存到相册时申请权限 / 清除缓存即删除。

## 5 验收

离线（无需开发者工具）：

```bash
node tools/verify-repo.js       # 27 项：数据层五个 API、预留字段、适配器、异常兜底
node tools/verify-templates.js  # 80 项：深色系列不回归（解码、静区、提示语、竖排字）
node tools/verify-paper.js      # 24 项：色值、bounds、排版不侵插画、对比度、解码、降级、筛选、包结构
node tools/verify-print.js      # 24 项：16 种版式组合、像素尺寸、门槛、逐张解码、裁切线
```

- `verify-paper` 的排版检查是几何求交：文字块与二维码框都不许碰 `avoid` / `icon`，元素之间也不许叠；
  对比度按 WCAG 相对亮度算，正文 ≥ 4.5（最低 3.18 是竖排辅助字，按大字标准 ≥ 3.0 判）；
  18 张（6 套 × A6/A5/A4）全部用系统 CIDetector 回读，与中文 SSID 载荷逐字符一致。
- `verify-print` 把 9 张拼版画出来后**逐张裁出每一份单独解码**（33 张全部读出同一载荷）；
  裁切线用「灰色像素量」区分四种样式：无 0 / 边角 144 / 十字+点线 359 / 虚线 564。

真实开发者工具（模拟器 iPhone 12/13 Pro · 基础库 3.17.6）：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project "$PWD" --port 48803 --auto-port 9421 --trust-project
node tools/auto/shoot-phase1.js   # 24 项断言 + 21 张截图，控制台零 error
```

结果：断言 24 / 24，截图在 `docs/screens/phase1/`，说明见该目录 README。

导出的那张 `a4-4cards-300dpi.jpg`（2480×3508，A4 拼 4 份）用 CIDetector 回读，
4 个二维码全部解出 `WIFI:T:WPA;S:Minsu-Guest;P:welcome88;;`。

## 6 已知限制

- 装饰图是 webp（6 张共 80KB）。微信 `image` 组件 iOS 6.5.16+ / Android 6.5.1+ 支持 webp，
  canvas `createImage` 走同一套解码器；若某台老设备上装饰层空白，把 `utils/art.js` 的
  扩展名换成 `.png`、`tools/make-art.js` 改为输出 PNG 即可（体积约 500KB）。
- 首页「地区」这一维的取值其实是风格（新中式 / 日式 / 韩式 / 欧式 / 极简），6 套白纸
  都归「极简」。这是原有分类，本期没有改动，但标签名与取值对不上，下一期应改掉。
- 打印页读的是草稿（`wifi_draft`），所以必须先填过表单才有内容；空草稿会印出占位文字。
