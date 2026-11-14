# phase1 实机截图

全部由 `tools/auto/shoot-phase1.js` 连真实微信开发者工具（模拟器 iPhone 12/13 Pro ·
基础库 3.17.6）自动截图后拷到这里，同一轮跑完 **24 项断言**、控制台 **0 error**。

| 文件 | 内容 | 对应断言 |
| --- | --- | --- |
| `01-home-paper.png` | 首页：白纸系列 6 套，缩略图是离屏 canvas 画出来的真卡面 | 16 套模板、分两组、白纸在前、16 张缩略图全部生成 |
| `02-home-dark.png` | 往下滚：深色系列 10 套（不回归） | 深色模板照常出图 |
| `03-home-fav.png` | 收藏 2 张，卡片心形点亮、右上角角标 2 | `favCount = 2`、卡片 `fav` 为真 |
| `04-home-favonly.png` | 「我的收藏」只列 2 张 | `favOnly = true` 时列表 = 2 |
| `05-privacy.png` | 隐私说明（5 条，含「密码永远不上传」） | 面板打开、5 条文案 |
| `11-editor-milktea.png` … `16-editor-newyear.png` | 6 套白纸模板的编辑页（奶白 / 红汤 / 山宿 / 花漾 / 清谈 / 岁红） | 每套 `qrMm ≥ 18`、A4 预览 537×760 |
| `18-editor-vertical-on.png` / `19-editor-vertical-off.png` | 侧边竖排小字开 / 关 | `showVertical` 可切换 |
| `20-print-full.png` | 打印 · 整张 1 份（190×266mm，码 87.3mm） | 默认版式、标注「标准二维码」 |
| `21-print-half.png` | 打印 · 半张 2 份（98×137mm，码 44.8mm） | 版式切换生效 |
| `22-print-card.png` | 打印 · 卡片 4 份（93×130mm，码 42.7mm） | 2×2 拼版、边距 8mm |
| `23-print-mini.png` | 打印 · 迷你 8 份（47×66mm，码 21.7mm） | 标注「小型二维码」 |
| `24-print-landscape-card.png` | 横版 A4 拼 4 份（66×93mm） | 横版画布变扁、每份变小 |
| `25-print-cut-none.png` | 裁切线 · 无 | — |
| `26-print-cut-cross.png` | 裁切线 · 十字 + 点线 | — |
| `27-print-cut-dash.png` | 裁切线 · 虚线 | — |
| `a4-4cards-300dpi.jpg` | **小程序自己导出的成品**：A4 300dpi（2480×3508）拼 4 份 | 4 个二维码全部解出 `WIFI:T:WPA;S:Minsu-Guest;P:welcome88;;` |

成品图不是离线渲染的，是打印页点「导出」后从模拟器文件系统（`wxfile://usr/a4-4cards.jpg`）
取出来的原图，未做任何处理。

重新生成：

```bash
# 1) 起自动化通道（端口与已有实例冲突时换一个 auto-port）
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project "$PWD" --port 48803 --auto-port 9421 --trust-project
# 2) 截图 + 断言
node tools/auto/shoot-phase1.js

# 3) 导出图：脚本会打印保存路径，从模拟器文件系统拷出来
cp "$HOME/Library/Application Support/微信开发者工具/*/WeappSimulator/WeappFileSystem/*/*/usr/a4-4cards.jpg" \
   docs/screens/phase1/a4-4cards-300dpi.jpg
swift tools/decode.swift docs/screens/phase1/a4-4cards-300dpi.jpg
```

> 截图先落到系统临时目录：写进项目目录会触发开发者工具重新编译，小程序被重置回首页，
> 后面所有操作作废。跑完再一次性拷进来。
