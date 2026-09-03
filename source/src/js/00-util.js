/* ============================================================
   utilities, i18n, formatting
   ============================================================ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const DEG = Math.PI / 180;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function gunzip(bytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error('DecompressionStream unsupported');
}

/* zigzag varint decoding, matching the build-side encoder */
function readVarints(bytes, count, zigzag) {
  const out = new Int32Array(count);
  let p = 0;
  for (let i = 0; i < count; i++) {
    let shift = 0, val = 0, byte;
    do { byte = bytes[p++]; val |= (byte & 0x7f) << shift; shift += 7; } while (byte & 0x80);
    out[i] = zigzag ? ((val >>> 1) ^ -(val & 1)) : (val >>> 0);
  }
  return out;
}

function unpack(buf) {
  const dv = new DataView(buf);
  const headLen = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen)).replace(/\0+$/, ''));
  const base = 4 + headLen;
  const TYPES = { Int16Array, Uint16Array, Uint32Array, Uint8Array, Int32Array, Float32Array };
  const bufs = {};
  for (const [name, d] of Object.entries(head.buffers)) {
    const T = TYPES[d.type];
    bufs[name] = new T(buf.slice(base + d.offset, base + d.offset + d.length * T.BYTES_PER_ELEMENT));
  }
  return { head, bufs };
}

/* ---------------- i18n ---------------- */
const I18N = {
  zh: {
    tagline: '世界国家信息大全', brand: '寰宇',
    search: '搜索国家 / 地区…', noResult: '无匹配结果',
    globe: '地球仪', map: '平面图', spin: '自转', reset: '复位', zoomIn: '放大', zoomOut: '缩小',
    fullscreen: '全屏', lang: '语言',
    booting: '系统初始化', bootGeo: '解析疆域数据', bootMesh: '构建球面网格', bootGL: '启动渲染引擎', bootReady: '就绪',
    overview: '概览', geography: '地理', people: '人口', economy: '经济', politics: '政治',
    military: '军事', culture: '文化', sources: '来源',
    kPop: '人口', kArea: '面积', kDens: '人口密度', kCapital: '首都', kRegion: '地区',
    kSubregion: '次区域', kOfficial: '官方全称', kCurrency: '货币', kLanguage: '语言',
    kCode: '国家代码', kPhone: '国际区号', kTld: '顶级域名', kNeighbors: '陆上邻国',
    kCoords: '地理坐标', kCoast: '海岸线', kElevMax: '最高点', kElevMin: '最低点',
    kTemp: '年均气温', kLandlocked: '内陆国', kGov: '政体', kIndep: '独立/建国',
    kReligion: '主要宗教', kDish: '代表美食', kSymbol: '国家象征', kLife: '预期寿命',
    kUN: '联合国', kParts: '组成部分', kFlag: '国旗',
    yes: '是', no: '否', unMember: '会员国', unNon: '非会员', none: '无', na: '暂无数据',
    sectBasic: '基本信息', sectGeo: '地理概况', sectSociety: '社会与人文', sectNeighbors: '周边',
    p1Notice: '预览版（P1）：本版本聚焦地图引擎与视觉效果，经济、政治、军事、文化等模块的完整数据将在后续版本接入。',
    srcTitle: '数据来源', 
    srcGeo: '疆域底图：Natural Earth 1:50m（公有领域），经 world-atlas 转换',
    srcName: '国名与代码：world-countries（ODbL），中文名取自其 zho 译名',
    srcFacts: '政体 / 宗教 / 美食 / 象征 / 预期寿命等：country-json 数据集',
    srcPop: '人口：2024 年估算基线，后续版本支持联网刷新至最新官方数据',
    srcNote: '口径说明：本图按一个中国原则渲染，中国大陆与台湾、香港、澳门合并为同一实体；南海断续线为示意性绘制。藏南、阿克赛钦等地区暂按 Natural Earth 底图的实际控制线划分，非中国官方标准地图。',
    unit10k: '万', unit100m: '亿', km2: '平方公里', km: '公里', ppl: '人', pplkm2: '人/平方公里',
    year: '年', age: '岁', celsius: '℃', meter: '米',
    ninedash: '南海断续线（示意）', coastline: '海岸线', border: '国界', selected: '已选',
  },
  en: {
    tagline: 'World Country Almanac', brand: 'ATLAS',
    search: 'Search a country…', noResult: 'No match',
    globe: 'Globe', map: 'Map', spin: 'Spin', reset: 'Reset', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    fullscreen: 'Fullscreen', lang: 'Language',
    booting: 'Initialising', bootGeo: 'Decoding boundaries', bootMesh: 'Building sphere mesh', bootGL: 'Starting renderer', bootReady: 'Ready',
    overview: 'Overview', geography: 'Geography', people: 'People', economy: 'Economy', politics: 'Politics',
    military: 'Military', culture: 'Culture', sources: 'Sources',
    kPop: 'Population', kArea: 'Area', kDens: 'Density', kCapital: 'Capital', kRegion: 'Region',
    kSubregion: 'Subregion', kOfficial: 'Official name', kCurrency: 'Currency', kLanguage: 'Languages',
    kCode: 'Codes', kPhone: 'Calling code', kTld: 'Internet TLD', kNeighbors: 'Land borders',
    kCoords: 'Coordinates', kCoast: 'Coastline', kElevMax: 'Highest point', kElevMin: 'Lowest point',
    kTemp: 'Avg. temperature', kLandlocked: 'Landlocked', kGov: 'Government', kIndep: 'Independence',
    kReligion: 'Main religion', kDish: 'National dish', kSymbol: 'National symbol', kLife: 'Life expectancy',
    kUN: 'United Nations', kParts: 'Constituents', kFlag: 'Flag',
    yes: 'Yes', no: 'No', unMember: 'Member state', unNon: 'Non-member', none: 'None', na: 'No data',
    sectBasic: 'Basics', sectGeo: 'Geography', sectSociety: 'Society & culture', sectNeighbors: 'Neighbours',
    p1Notice: 'Preview build (P1): this milestone focuses on the map engine and visuals. Economy, politics, military and culture datasets land in later builds.',
    srcTitle: 'Data sources',
    srcGeo: 'Boundaries: Natural Earth 1:50m (public domain) via world-atlas',
    srcName: 'Names & codes: world-countries (ODbL)',
    srcFacts: 'Government / religion / dish / symbol / life expectancy: country-json',
    srcPop: 'Population: 2024 baseline estimates; online refresh arrives in a later build',
    srcNote: 'Rendering policy: mainland China, Taiwan, Hong Kong and Macao are drawn as one entity under the one-China principle; the South China Sea dashed line is schematic. Disputed Himalayan sectors follow the Natural Earth de-facto lines and are not an official map of any government.',
    unit10k: 'K', unit100m: 'B', km2: 'km²', km: 'km', ppl: '', pplkm2: '/km²',
    year: '', age: 'yrs', celsius: '°C', meter: 'm',
    ninedash: 'S. China Sea dashed line (schematic)', coastline: 'Coastline', border: 'Border', selected: 'Selected',
  },
};
let LANG = localStorage.getItem('atlas.lang') || 'zh';
const T = (k) => (I18N[LANG][k] != null ? I18N[LANG][k] : k);

/* number formatting, locale aware */
function fmtInt(n) {
  if (n == null || !isFinite(n)) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtBig(n) {
  if (n == null || !isFinite(n)) return { v: '—', u: '' };
  if (LANG === 'zh') {
    if (n >= 1e8) return { v: (n / 1e8).toFixed(n >= 1e9 ? 2 : 2), u: '亿' };
    if (n >= 1e4) return { v: (n / 1e4).toFixed(n >= 1e5 ? 1 : 2), u: '万' };
    return { v: fmtInt(n), u: '' };
  }
  if (n >= 1e9) return { v: (n / 1e9).toFixed(2), u: 'B' };
  if (n >= 1e6) return { v: (n / 1e6).toFixed(n >= 1e8 ? 0 : 1), u: 'M' };
  if (n >= 1e3) return { v: (n / 1e3).toFixed(0), u: 'K' };
  return { v: fmtInt(n), u: '' };
}
function fmtCoord(lon, lat) {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lon).toFixed(2)}°${ew}`;
}
