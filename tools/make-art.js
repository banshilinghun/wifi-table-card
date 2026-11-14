/**
 * tools/make-art.js —— 生成白纸风格的装饰图层
 *
 * 为什么要程序化画而不是找素材 / 用 AI 出图：
 *   1. 白底必须是纯 #FFFFFF。AI 出的「白」通常是 #F7F5F1 一类的暖白，
 *      art-bounds.js 扫描非白像素时会把整张图判成内容，避让区就没意义了；
 *   2. 顶部徽章（Wi-Fi 图标）与四角插画必须是互不相连的独立块，
 *      art-bounds 才能靠连通域把它们分开；
 *   3. 线稿放大到 A4 不能糊——矢量化后按目标像素直接光栅化，线宽可控。
 *
 * 产物：packageTpl/art/<key>.webp（1200×1680，1:1.4，约 145dpi @A4）
 * 运行：node tools/make-art.js
 */

var fs = require('fs')
var path = require('path')
var { execFileSync } = require('child_process')

var ROOT = path.join(__dirname, '..')
var OUT_DIR = path.join(ROOT, 'packageTpl', 'art')
var TMP_DIR = path.join(ROOT, 'tools', 'out', 'art')
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

var W = 1200
var H = 1680

/* 徽章：顶部居中，直径 210。art-bounds 会把它识别成「图标区」 */
var BADGE_CX = W / 2
var BADGE_CY = 218
var BADGE_R = 105

/* 四角插画：各占 200×200 的方框，离边 62 */
var CORNER = 200
var PAD = 62
var CORNERS = {
  tl: { x: PAD, y: 340 },
  tr: { x: W - PAD - CORNER, y: 340 },
  bl: { x: PAD, y: H - PAD - CORNER - 60 },
  br: { x: W - PAD - CORNER, y: H - PAD - CORNER - 60 }
}

/* ── 图形积木 ───────────────────────────────────────────── */

function arcPath (cx, cy, r, from, to) {
  var a1 = from * Math.PI / 180
  var a2 = to * Math.PI / 180
  var x1 = cx + r * Math.cos(a1)
  var y1 = cy + r * Math.sin(a1)
  var x2 = cx + r * Math.cos(a2)
  var y2 = cy + r * Math.sin(a2)
  var large = Math.abs(to - from) > 180 ? 1 : 0
  return 'M' + x1.toFixed(2) + ' ' + y1.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2)
}

/** Wi-Fi 三段弧 + 圆点，作为徽章里的固定元素，保证「这是扫码连网」的语义 */
function wifiGlyph (cx, cy, color, scale) {
  var s = scale || 1
  var g = []
  g.push('<path d="' + arcPath(cx, cy, 34 * s, 205, 335) + '" fill="none" stroke="' + color + '" stroke-width="' + (7 * s).toFixed(1) + '" stroke-linecap="round"/>')
  g.push('<path d="' + arcPath(cx, cy, 22 * s, 205, 335) + '" fill="none" stroke="' + color + '" stroke-width="' + (7 * s).toFixed(1) + '" stroke-linecap="round"/>')
  g.push('<path d="' + arcPath(cx, cy, 10 * s, 205, 335) + '" fill="none" stroke="' + color + '" stroke-width="' + (7 * s).toFixed(1) + '" stroke-linecap="round"/>')
  g.push('<circle cx="' + cx + '" cy="' + (cy + 14 * s) + '" r="' + (5.4 * s) + '" fill="' + color + '"/>')
  return g.join('')
}

/** 圆角方块底衬：让边角插画有「印章式」的收边，也便于 art-bounds 取整块 */
function plate (x, y, size, accent, fill) {
  return '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size +
    '" rx="26" fill="' + (fill || 'none') + '" stroke="' + accent + '" stroke-width="2"/>'
}

function leaf (x, y, rot, color, s) {
  return '<path d="M0 0C14 -22 40 -30 56 -18C44 6 18 16 0 0Z" fill="' + color +
    '" opacity="0.85" transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + (s || 1) + ')"/>'
}

/* ── 六套主题 ───────────────────────────────────────────── */

var THEMES = [
  {
    key: 'milktea',
    name: '奶茶咖啡',
    ink: '#5b3a22',
    accent: '#b07a45',
    /** 徽章中心图形：奶茶杯 */
    badge: function (a, i) {
      var cx = BADGE_CX
      var cy = BADGE_CY - 31
      return [
        '<path d="M' + (cx - 34) + ' ' + (cy - 46) + 'h68l-9 84a12 12 0 0 1-12 11h-26a12 12 0 0 1-12-11Z" fill="none" stroke="' + a + '" stroke-width="3.2" stroke-linejoin="round"/>',
        '<path d="M' + (cx - 40) + ' ' + (cy - 46) + 'h80" stroke="' + a + '" stroke-width="3.2" stroke-linecap="round"/>',
        '<path d="M' + (cx - 30) + ' ' + (cy - 16) + 'h60" stroke="' + a + '" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>',
        '<path d="M' + (cx + 26) + ' ' + (cy - 58) + 'l14 -34" stroke="' + a + '" stroke-width="3.4" stroke-linecap="round"/>',
        '<circle cx="' + (cx - 16) + '" cy="' + (cy + 30) + '" r="4.2" fill="' + a + '"/>',
        '<circle cx="' + (cx + 2) + '" cy="' + (cy + 38) + '" r="4.2" fill="' + a + '"/>',
        '<circle cx="' + (cx + 18) + '" cy="' + (cy + 26) + '" r="4.2" fill="' + a + '"/>'
      ].join('')
    },
    corners: function (a) {
      var l = CORNERS.tl
      var r = CORNERS.tr
      var bl = CORNERS.bl
      var br = CORNERS.br
      return [
        plate(l.x, l.y, CORNER, a),
        '<path d="M' + (l.x + 52) + ' ' + (l.y + 150) + 'c-16 -26 14 -38 0 -64c-14 -26 12 -34 0 -56" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round" opacity="0.75"/>',
        '<path d="M' + (l.x + 106) + ' ' + (l.y + 152) + 'c-12 -20 12 -30 0 -50c-10 -20 10 -28 0 -46" fill="none" stroke="' + a + '" stroke-width="2.2" stroke-linecap="round" opacity="0.45"/>',
        plate(r.x, r.y, CORNER, a),
        leaf(r.x + 58, r.y + 132, -28, a, 1.15),
        leaf(r.x + 96, r.y + 108, 22, a, 0.95),
        plate(bl.x, bl.y, CORNER, a),
        '<circle cx="' + (bl.x + 66) + '" cy="' + (bl.y + 96) + '" r="7" fill="' + a + '"/>',
        '<circle cx="' + (bl.x + 106) + '" cy="' + (bl.y + 112) + '" r="7" fill="' + a + '" opacity="0.7"/>',
        '<circle cx="' + (bl.x + 82) + '" cy="' + (bl.y + 138) + '" r="7" fill="' + a + '" opacity="0.45"/>',
        plate(br.x, br.y, CORNER, a),
        '<circle cx="' + (br.x + 100) + '" cy="' + (br.y + 100) + '" r="46" fill="none" stroke="' + a + '" stroke-width="3" stroke-dasharray="4 10" opacity="0.95"/>',
        '<circle cx="' + (br.x + 100) + '" cy="' + (br.y + 100) + '" r="22" fill="none" stroke="' + a + '" stroke-width="2" opacity="0.5"/>'
      ].join('')
    }
  },

  {
    key: 'hotpot',
    name: '火锅餐厅',
    ink: '#3a1d17',
    accent: '#c8321f',
    badge: function (a) {
      var cx = BADGE_CX
      var cy = BADGE_CY - 28
      return [
        '<path d="M' + (cx - 48) + ' ' + (cy - 18) + 'h96a48 46 0 0 1-96 0Z" fill="none" stroke="' + a + '" stroke-width="3.2" stroke-linejoin="round"/>',
        '<path d="M' + (cx - 56) + ' ' + (cy - 18) + 'h112" stroke="' + a + '" stroke-width="3.4" stroke-linecap="round"/>',
        '<path d="M' + (cx - 56) + ' ' + (cy - 18) + 'a10 10 0 0 1-10 12" fill="none" stroke="' + a + '" stroke-width="2.6"/>',
        '<path d="M' + (cx + 56) + ' ' + (cy - 18) + 'a10 10 0 0 0 10 12" fill="none" stroke="' + a + '" stroke-width="2.6"/>',
        '<path d="M' + (cx - 26) + ' ' + (cy - 34) + 'c-8 -12 8 -18 0 -30" fill="none" stroke="' + a + '" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>',
        '<path d="M' + (cx + 4) + ' ' + (cy - 36) + 'c-8 -14 8 -20 0 -34" fill="none" stroke="' + a + '" stroke-width="2.4" stroke-linecap="round" opacity="0.5"/>'
      ].join('')
    },
    corners: function (a) {
      var l = CORNERS.tl
      var r = CORNERS.tr
      var bl = CORNERS.bl
      var br = CORNERS.br
      return [
        plate(l.x, l.y, CORNER, a),
        '<path d="M' + (l.x + 62) + ' ' + (l.y + 58) + 'c34 14 58 44 62 82c-2 6-8 8-14 6c-18-30-38-52-62-66c-6-4-2-12 14-22Z" fill="' + a + '" opacity="0.85"/>',
        '<path d="M' + (l.x + 52) + ' ' + (l.y + 48) + 'c8 -10 18 -12 24 -6" fill="none" stroke="' + a + '" stroke-width="3" stroke-linecap="round"/>',
        plate(r.x, r.y, CORNER, a),
        '<circle cx="' + (r.x + 74) + '" cy="' + (r.y + 82) + '" r="9" fill="' + a + '"/>',
        '<circle cx="' + (r.x + 112) + '" cy="' + (r.y + 100) + '" r="9" fill="' + a + '" opacity="0.65"/>',
        '<circle cx="' + (r.x + 92) + '" cy="' + (r.y + 130) + '" r="9" fill="' + a + '" opacity="0.4"/>',
        plate(bl.x, bl.y, CORNER, a),
        '<path d="M' + (bl.x + 54) + ' ' + (bl.y + 148) + 'L' + (bl.x + 146) + ' ' + (bl.y + 56) + '" stroke="' + a + '" stroke-width="4" stroke-linecap="round"/>',
        '<path d="M' + (bl.x + 60) + ' ' + (bl.y + 52) + 'L' + (bl.x + 150) + ' ' + (bl.y + 144) + '" stroke="' + a + '" stroke-width="4" stroke-linecap="round" opacity="0.8"/>',
        plate(br.x, br.y, CORNER, a),
        '<path d="M' + (br.x + 62) + ' ' + (br.y + 140) + 'c-12 -22 14 -32 0 -54c-12 -22 12 -30 0 -48" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round" opacity="0.75"/>',
        '<path d="M' + (br.x + 106) + ' ' + (br.y + 142) + 'c-10 -18 12 -26 0 -46c-10 -18 10 -26 0 -42" fill="none" stroke="' + a + '" stroke-width="2.2" stroke-linecap="round" opacity="0.45"/>'
      ].join('')
    }
  },

  {
    key: 'minsu',
    name: '民宿客栈',
    ink: '#2b3a3f',
    accent: '#4f6f73',
    badge: function (a) {
      var cx = BADGE_CX
      var cy = BADGE_CY - 34
      return [
        '<path d="M' + (cx - 52) + ' ' + (cy - 12) + 'l52 -40l52 40" fill="none" stroke="' + a + '" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>',
        '<path d="M' + (cx - 38) + ' ' + (cy - 14) + 'v52h76v-52" fill="none" stroke="' + a + '" stroke-width="3.2" stroke-linejoin="round"/>',
        '<path d="M' + (cx - 16) + ' ' + (cy + 12) + 'h32v26h-32Z" fill="none" stroke="' + a + '" stroke-width="2.4"/>',
        '<path d="M' + (cx) + ' ' + (cy + 12) + 'v26M' + (cx - 16) + ' ' + (cy + 25) + 'h32" stroke="' + a + '" stroke-width="2" opacity="0.6"/>'
      ].join('')
    },
    corners: function (a) {
      var l = CORNERS.tl
      var r = CORNERS.tr
      var bl = CORNERS.bl
      var br = CORNERS.br
      return [
        plate(l.x, l.y, CORNER, a),
        '<path d="M' + (l.x + 46) + ' ' + (l.y + 132) + 'l34 -46l26 30l30 -42l24 58" fill="none" stroke="' + a + '" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>',
        '<path d="M' + (l.x + 42) + ' ' + (l.y + 152) + 'h124" stroke="' + a + '" stroke-width="2.2" opacity="0.5" stroke-linecap="round"/>',
        plate(r.x, r.y, CORNER, a),
        '<path d="M' + (r.x + 54) + ' ' + (r.y + 108) + 'a18 18 0 0 1 34 0a14 14 0 0 0 28 0" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round"/>',
        '<path d="M' + (r.x + 66) + ' ' + (r.y + 78) + 'a14 14 0 0 1 26 0" fill="none" stroke="' + a + '" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>',
        plate(bl.x, bl.y, CORNER, a),
        '<path d="M' + (bl.x + 56) + ' ' + (bl.y + 148) + 'h90M' + (bl.x + 66) + ' ' + (bl.y + 126) + 'h70M' + (bl.x + 76) + ' ' + (bl.y + 104) + 'h50" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>',
        plate(br.x, br.y, CORNER, a),
        '<path d="M' + (br.x + 96) + ' ' + (br.y + 150) + 'v-52" stroke="' + a + '" stroke-width="3" stroke-linecap="round"/>',
        '<path d="M' + (br.x + 96) + ' ' + (br.y + 100) + 'l-30 26h60Z" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linejoin="round"/>',
        '<path d="M' + (br.x + 96) + ' ' + (br.y + 74) + 'l-22 20h44Z" fill="none" stroke="' + a + '" stroke-width="2.4" stroke-linejoin="round" opacity="0.6"/>'
      ].join('')
    }
  },

  {
    key: 'beauty',
    name: '美甲美发',
    ink: '#4a3340',
    accent: '#c98aa0',
    badge: function (a) {
      var cx = BADGE_CX
      var cy = BADGE_CY - 34
      return [
        '<rect x="' + (cx - 26) + '" y="' + (cy - 6) + '" width="52" height="58" rx="10" fill="none" stroke="' + a + '" stroke-width="3.2"/>',
        '<rect x="' + (cx - 14) + '" y="' + (cy - 46) + '" width="28" height="34" rx="6" fill="none" stroke="' + a + '" stroke-width="3"/>',
        '<path d="M' + (cx - 18) + ' ' + (cy + 20) + 'h36" stroke="' + a + '" stroke-width="2.2" opacity="0.6" stroke-linecap="round"/>',
        '<path d="M' + (cx) + ' ' + (cy + 6) + 'v-14" stroke="' + a + '" stroke-width="2" opacity="0.45"/>'
      ].join('')
    },
    corners: function (a) {
      var l = CORNERS.tl
      var r = CORNERS.tr
      var bl = CORNERS.bl
      var br = CORNERS.br
      var petals = ''
      for (var k = 0; k < 5; k++) {
        petals += '<ellipse cx="' + (l.x + 100) + '" cy="' + (l.y + 66) + '" rx="13" ry="26" fill="none" stroke="' + a + '" stroke-width="2.2" transform="rotate(' + (k * 72) + ' ' + (l.x + 100) + ' ' + (l.y + 100) + ')"/>'
      }
      return [
        plate(l.x, l.y, CORNER, a),
        petals,
        '<circle cx="' + (l.x + 100) + '" cy="' + (l.y + 100) + '" r="6" fill="' + a + '"/>',
        plate(r.x, r.y, CORNER, a),
        '<path d="M' + (r.x + 56) + ' ' + (r.y + 70) + 'h88" stroke="' + a + '" stroke-width="3" stroke-linecap="round"/>',
        '<path d="M' + (r.x + 62) + ' ' + (r.y + 70) + 'v54M' + (r.x + 78) + ' ' + (r.y + 70) + 'v42M' + (r.x + 94) + ' ' + (r.y + 70) + 'v54M' + (r.x + 110) + ' ' + (r.y + 70) + 'v42M' + (r.x + 126) + ' ' + (r.y + 70) + 'v54" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>',
        plate(bl.x, bl.y, CORNER, a),
        '<rect x="' + (bl.x + 74) + '" y="' + (bl.y + 92) + '" width="52" height="46" rx="8" fill="none" stroke="' + a + '" stroke-width="2.8"/>',
        '<rect x="' + (bl.x + 88) + '" y="' + (bl.y + 66) + '" width="24" height="26" rx="4" fill="none" stroke="' + a + '" stroke-width="2.4"/>',
        plate(br.x, br.y, CORNER, a),
        '<path d="M' + (br.x + 60) + ' ' + (br.y + 148) + 'c40 -8 62 -38 78 -84" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round"/>',
        leaf(br.x + 104, br.y + 96, -40, a, 0.8),
        leaf(br.x + 84, br.y + 120, -100, a, 0.66)
      ].join('')
    }
  },

  {
    key: 'teahouse',
    name: '棋牌茶室',
    ink: '#24392f',
    accent: '#5f9479',
    badge: function (a) {
      var cx = BADGE_CX
      var cy = BADGE_CY - 22
      return [
        '<path d="M' + (cx - 44) + ' ' + (cy - 6) + 'h56a16 16 0 0 1 0 32h-56a26 26 0 0 1 0 -32Z" fill="none" stroke="' + a + '" stroke-width="3.2" stroke-linejoin="round"/>',
        '<path d="M' + (cx + 28) + ' ' + (cy + 2) + 'c22 0 30 22 4 26" fill="none" stroke="' + a + '" stroke-width="2.8"/>',
        '<path d="M' + (cx - 24) + ' ' + (cy - 26) + 'v10M' + (cx) + ' ' + (cy - 30) + 'v14M' + (cx + 16) + ' ' + (cy - 26) + 'v10" stroke="' + a + '" stroke-width="2.4" stroke-linecap="round" opacity="0.6"/>',
        '<path d="M' + (cx - 34) + ' ' + (cy + 40) + 'h60" stroke="' + a + '" stroke-width="2.4" stroke-linecap="round"/>'
      ].join('')
    },
    corners: function (a) {
      var l = CORNERS.tl
      var r = CORNERS.tr
      var bl = CORNERS.bl
      var br = CORNERS.br
      return [
        plate(l.x, l.y, CORNER, a),
        '<path d="M' + (l.x + 60) + ' ' + (l.y + 52) + 'c30 26 40 62 34 96" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linecap="round"/>',
        leaf(l.x + 96, l.y + 84, 26, a, 1),
        leaf(l.x + 78, l.y + 118, 62, a, 0.86),
        leaf(l.x + 108, l.y + 132, -6, a, 0.72),
        plate(r.x, r.y, CORNER, a),
        '<circle cx="' + (r.x + 82) + '" cy="' + (r.y + 86) + '" r="24" fill="none" stroke="' + a + '" stroke-width="2.6"/>',
        '<circle cx="' + (r.x + 122) + '" cy="' + (r.y + 118) + '" r="24" fill="' + a + '" opacity="0.85"/>',
        plate(bl.x, bl.y, CORNER, a),
        '<path d="M' + (bl.x + 56) + ' ' + (bl.y + 92) + 'h88v68h-88Z" fill="none" stroke="' + a + '" stroke-width="2.6"/>',
        '<path d="M' + (bl.x + 56) + ' ' + (bl.y + 116) + 'h88M' + (bl.x + 56) + ' ' + (bl.y + 138) + 'h88M' + (bl.x + 85) + ' ' + (bl.y + 92) + 'v68M' + (bl.x + 115) + ' ' + (bl.y + 92) + 'v68" stroke="' + a + '" stroke-width="1.8" opacity="0.55"/>',
        plate(br.x, br.y, CORNER, a),
        '<ellipse cx="' + (br.x + 100) + '" cy="' + (br.y + 128) + '" rx="46" ry="14" fill="none" stroke="' + a + '" stroke-width="2.6"/>',
        '<path d="M' + (br.x + 64) + ' ' + (br.y + 102) + 'q36 -22 72 0" fill="none" stroke="' + a + '" stroke-width="2.4" opacity="0.7"/>',
        '<circle cx="' + (br.x + 100) + '" cy="' + (br.y + 96) + '" r="16" fill="none" stroke="' + a + '" stroke-width="2.2" opacity="0.6"/>'
      ].join('')
    }
  },

  {
    key: 'newyear',
    name: '春节',
    ink: '#5a1410',
    accent: '#c8201c',
    badge: function (a) {
      var cx = BADGE_CX
      var cy = BADGE_CY - 44
      return [
        '<path d="M' + (cx - 34) + ' ' + (cy - 40) + 'h68" stroke="' + a + '" stroke-width="3.4" stroke-linecap="round"/>',
        '<path d="M' + (cx - 40) + ' ' + (cy + 26) + 'h80" stroke="' + a + '" stroke-width="3.4" stroke-linecap="round"/>',
        '<ellipse cx="' + (cx) + '" cy="' + (cy - 6) + '" rx="34" ry="40" fill="none" stroke="' + a + '" stroke-width="3.2"/>',
        '<path d="M' + (cx - 34) + ' ' + (cy - 6) + 'h68M' + (cx) + ' ' + (cy - 46) + 'v80" stroke="' + a + '" stroke-width="2" opacity="0.5"/>',
        '<path d="M' + (cx) + ' ' + (cy + 30) + 'v22M' + (cx - 8) + ' ' + (cy + 52) + 'v10M' + (cx + 8) + ' ' + (cy + 52) + 'v10" stroke="' + a + '" stroke-width="2.4" stroke-linecap="round"/>'
      ].join('')
    },
    corners: function (a) {
      var l = CORNERS.tl
      var r = CORNERS.tr
      var bl = CORNERS.bl
      var br = CORNERS.br
      var plum = ''
      for (var k = 0; k < 5; k++) {
        plum += '<circle cx="' + (r.x + 100) + '" cy="' + (r.y + 70) + '" r="18" fill="none" stroke="' + a + '" stroke-width="2.2" transform="rotate(' + (k * 72) + ' ' + (r.x + 100) + ' ' + (r.y + 100) + ')"/>'
      }
      return [
        plate(l.x, l.y, CORNER, a),
        '<path d="M' + (l.x + 56) + ' ' + (l.y + 116) + 'c0 -16 20 -22 30 -10c10 -18 34 -12 34 6c0 14 -14 22 -30 22c-18 0 -34 -6 -34 -18Z" fill="none" stroke="' + a + '" stroke-width="2.6" stroke-linejoin="round"/>',
        '<path d="M' + (l.x + 96) + ' ' + (l.y + 78) + 'c8 -12 26 -6 22 8" fill="none" stroke="' + a + '" stroke-width="2.2" opacity="0.6"/>',
        plate(r.x, r.y, CORNER, a),
        plum,
        '<circle cx="' + (r.x + 100) + '" cy="' + (r.y + 100) + '" r="5" fill="' + a + '"/>',
        plate(bl.x, bl.y, CORNER, a),
        '<rect x="' + (bl.x + 82) + '" y="' + (bl.y + 52) + '" width="36" height="96" rx="12" fill="none" stroke="' + a + '" stroke-width="2.8" transform="rotate(-18 ' + (bl.x + 100) + ' ' + (bl.y + 100) + ')"/>',
        '<path d="M' + (bl.x + 92) + ' ' + (bl.y + 148) + 'l-8 18M' + (bl.x + 108) + ' ' + (bl.y + 146) + 'l10 16" stroke="' + a + '" stroke-width="2.2" stroke-linecap="round"/>',
        plate(br.x, br.y, CORNER, a),
        '<circle cx="' + (br.x + 100) + '" cy="' + (br.y + 100) + '" r="42" fill="none" stroke="' + a + '" stroke-width="2.8"/>',
        '<rect x="' + (br.x + 84) + '" y="' + (br.y + 84) + '" width="32" height="32" rx="4" fill="none" stroke="' + a + '" stroke-width="2.4"/>',
        '<path d="M' + (br.x + 100) + ' ' + (br.y + 58) + 'v-8M' + (br.x + 100) + ' ' + (br.y + 150) + 'v-8" stroke="' + a + '" stroke-width="2" opacity="0.5"/>'
      ].join('')
    }
  }
]

/* ── 组装 SVG ───────────────────────────────────────────── */

function svgFor (t) {
  var a = t.accent
  var i = t.ink
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>' +
    // 徽章：外圈细环 + 内圈虚线环（用 ink 淡色，避免与 accent 抢）
    '<circle cx="' + BADGE_CX + '" cy="' + BADGE_CY + '" r="' + BADGE_R + '" fill="#FFFFFF" stroke="' + a + '" stroke-width="2.6"/>' +
    '<circle cx="' + BADGE_CX + '" cy="' + BADGE_CY + '" r="' + (BADGE_R - 12) + '" fill="none" stroke="' + i + '" stroke-width="1.2" opacity="0.18" stroke-dasharray="2 8"/>' +
    t.badge(a, i) +
    wifiGlyph(BADGE_CX, BADGE_CY + 56, a, 0.72) +
    t.corners(a) +
    '</svg>'
}

/* ── 用 headless Chrome 光栅化 ──────────────────────────── */

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(TMP_DIR, { recursive: true })

var items = THEMES.map(function (t) {
  return { key: t.key, svg: svgFor(t) }
})

var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out">pending</pre><script>' +
  'var ITEMS=' + JSON.stringify(items) + ';' +
  'var res=[];var i=0;' +
  'function step(){' +
  '  if(i>=ITEMS.length){document.getElementById("out").textContent=JSON.stringify(res);return}' +
  '  var it=ITEMS[i++];' +
  '  var img=new Image();' +
  '  img.onload=function(){' +
  '    var c=document.createElement("canvas");c.width=' + W + ';c.height=' + H + ';' +
  '    var x=c.getContext("2d");x.fillStyle="#FFFFFF";x.fillRect(0,0,' + W + ',' + H + ');' +
  '    x.drawImage(img,0,0,' + W + ',' + H + ');' +
  '    res.push({key:it.key,url:c.toDataURL("image/png")});step();' +
  '  };' +
  '  img.onerror=function(){res.push({key:it.key,url:""});step()};' +
  '  img.src="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(it.svg)));' +
  '}' +
  'step();' +
  '</script></body></html>'

var htmlFile = path.join(TMP_DIR, 'art.html')
fs.writeFileSync(htmlFile, html)

var dom = execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=/tmp/cr-art-' + Math.random().toString(36).slice(2, 8),
  '--window-size=1400,1900', '--virtual-time-budget=20000', '--dump-dom',
  'file://' + htmlFile
], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })

var m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m || m[1] === 'pending') {
  console.error('渲染失败：没拿到 canvas 输出')
  process.exit(1)
}

var parsed = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))

console.log('生成 ' + parsed.length + ' 张装饰图（' + W + '×' + H + '）：')
parsed.forEach(function (r) {
  if (!r.url) { console.log('  ✗ ' + r.key + ' 光栅化失败'); return }
  var png = path.join(TMP_DIR, r.key + '.png')
  fs.writeFileSync(png, Buffer.from(r.url.split(',')[1], 'base64'))
  var webp = path.join(OUT_DIR, r.key + '.webp')
  execFileSync('cwebp', ['-q', '80', '-quiet', '-metadata', 'none', png, '-o', webp])
  var bytes = fs.statSync(webp).size
  console.log('  ✓ ' + r.key.padEnd(10) + (bytes / 1024).toFixed(1) + ' KB  ' + path.relative(ROOT, webp))
})

var total = fs.readdirSync(OUT_DIR).filter(function (f) { return /\.webp$/.test(f) })
  .reduce(function (n, f) { return n + fs.statSync(path.join(OUT_DIR, f)).size }, 0)
console.log('合计 ' + (total / 1024).toFixed(1) + ' KB')
