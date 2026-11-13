# 实机截图

全部由 `tools/auto/shoot.js` 连真实微信开发者工具（模拟器 iPhone 12/13 Pro · 基础库 3.17.6）自动截图后拷到这里，
一次运行同时校验 42 项断言、控制台零 error。

| 文件 | 内容 | 对应断言 |
| --- | --- | --- |
| `01-home.png` | 首页：10 套模板缩略图 | 页面内 canvas 节点数为 0、10 张 `<image>`、缩略图按形状呈现 5 种比例 |
| `02-drawer.png` | 筛选抽屉打开 | 抽屉完整盖住网格，网格仍在渲染树（不再靠 `wx:if` 摘掉） |
| `08-editor-a4.png` | 编辑页 · 夜泊 · A4 | 密码上牌、载荷正确、A6/A5/A4 三档尺寸 |
| `11-editor-a6.png` | 编辑页 · 夜泊 · A6（105×148） | A6 上二维码 63mm，仍 ≥ 18mm |
| `14-editor-mini.png` | 编辑页 · 静水 · 迷你 60×60 | 密码 2.88mm，第三行提示语因空间不足自动隐藏 |

截图里的二维码都用系统 CIDetector 回读过，解出的字符串与输入 Wi-Fi 完全一致。

重新生成：

```bash
# 1) 起自动化通道
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project "$PWD" --port 48803 --auto-port 9420
# 2) 截图 + 断言
node tools/auto/shoot.js
```
