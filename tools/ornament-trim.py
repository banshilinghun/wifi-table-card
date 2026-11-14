#!/usr/bin/env python3
# 把 rsvg 渲染出的花饰 PNG 裁到内容边界、缩到长边 N，输出两份剪影：
#   <key>.png        黑色剪影
#   <key>.light.png  白色剪影
#
# 为什么要两份：utils/ornament.js 优先用离屏画布按模板 palette 实时染色，
# 但 wx.createOffscreenCanvas 在老基础库上没有；那时直接挑一份现成剪影，
# 宁可颜色粗一点，也不能让花饰画不出来。

import sys
import numpy as np
from PIL import Image


def main():
    src, dst, light_dst, long_edge = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    im = Image.open(src).convert("RGBA")
    bb = im.getchannel("A").getbbox()
    if not bb:
        print("EMPTY")
        return 0
    im = im.crop(bb)
    s = long_edge / max(im.size)
    if s < 1:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)

    arr = np.asarray(im).copy()
    a = arr[:, :, 3]
    # 整块实心 = SVG 里的背景矩形，不是花饰。真实踩过：1KB 的「花饰」是满幅矩形。
    cov = float((a > 8).mean())
    if cov > 0.95:
        print("SOLID")
        return 0

    dark = arr.copy()
    dark[:, :, 0] = 0
    dark[:, :, 1] = 0
    dark[:, :, 2] = 0
    Image.fromarray(dark).save(dst, optimize=True)

    light = arr.copy()
    light[:, :, 0] = 255
    light[:, :, 1] = 255
    light[:, :, 2] = 255
    Image.fromarray(light).save(light_dst, optimize=True)

    print(im.width, im.height, round(cov, 3))
    return 0


if __name__ == "__main__":
    sys.exit(main())
