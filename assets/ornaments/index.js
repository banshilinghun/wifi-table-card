/**
 * assets/ornaments/index.js
 * 公有领域装饰纹样清单。由 tools/build-ornaments.js 生成，不要手改。
 *
 * 来源：Wikimedia Commons 标注 Public Domain / CC0 的书籍花饰
 * （fleuron / tailpiece，16~20 世纪）。徽章与机构标志已排除。
 * 图片是纯 alpha 剪影，颜色由 utils/ornament.js 按模板 palette 染。
 */

var ORNAMENTS = [
  {
    "key": "grotesque-tailpiece-1580",
    "file": "assets/ornaments/grotesque-tailpiece-1580.png",
    "lightFile": "assets/ornaments/grotesque-tailpiece-1580.light.png",
    "w": 239,
    "h": 256,
    "aspect": 0.934,
    "coverage": 0.469,
    "bytes": 95288,
    "from": "Grotesque_tailpiece_1580.svg"
  },
  {
    "key": "a-voz-do-sino-vicente-de-carvalho-1916-fleuron-in-cover",
    "file": "assets/ornaments/a-voz-do-sino-vicente-de-carvalho-1916-fleuron-in-cover.png",
    "lightFile": "assets/ornaments/a-voz-do-sino-vicente-de-carvalho-1916-fleuron-in-cover.light.png",
    "w": 256,
    "h": 153,
    "aspect": 1.673,
    "coverage": 0.425,
    "bytes": 38139,
    "from": "A_voz_do_sino_Vicente_de_Carvalho_1916_Fleuron_in_cover.svg"
  },
  {
    "key": "broken-rose-tailpiece-1909",
    "file": "assets/ornaments/broken-rose-tailpiece-1909.png",
    "lightFile": "assets/ornaments/broken-rose-tailpiece-1909.light.png",
    "w": 256,
    "h": 112,
    "aspect": 2.286,
    "coverage": 0.39,
    "bytes": 31458,
    "from": "Broken_rose_tailpiece_1909.svg"
  },
  {
    "key": "chappell-co-fleuron",
    "file": "assets/ornaments/chappell-co-fleuron.png",
    "lightFile": "assets/ornaments/chappell-co-fleuron.light.png",
    "w": 256,
    "h": 145,
    "aspect": 1.766,
    "coverage": 0.382,
    "bytes": 27128,
    "from": "Chappell_Co_fleuron.svg"
  }
]

function getOrnament (key) {
  for (var i = 0; i < ORNAMENTS.length; i++) if (ORNAMENTS[i].key === key) return ORNAMENTS[i]
  return null
}

module.exports = { ORNAMENTS: ORNAMENTS, getOrnament: getOrnament }
