/* ============================================================
   utilities, i18n, formatting
   ============================================================ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
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
    brand: '寰宇', tagline: '世界国家信息大全', search: '搜索国家 / 城市 / 拼音 / 代码…', noResult: '无匹配结果',
    noCityData: '暂无城市数据收录',
    markTitle: '自定义标记', markSub: '为国家自定义颜色标记，同时显示多套', markAddGroup: '新建标记组',
    markGroupDefault: '标记组 ', markPick: '选国家', markDone: '完成',
    markPickHint: '点击地图为该标记组添加或移除国家，再次点击"完成"结束', markEmpty: '还没有标记组，点击下方按钮新建一个',
    themeCustom: '自定义',
    globe: '地球仪', map: '平面图', spin: '自转', reset: '复位', zoomIn: '放大', zoomOut: '缩小',
    fullscreen: '全屏', settings: '视觉设置', ranking: '排行榜', random: '随机漫游', favorite: '收藏',
    compare: '对比', lang: '语言',
    booting: '系统初始化', bootGeo: '解析疆域数据', bootMesh: '构建球面网格', bootGL: '启动渲染引擎',
    bootLabel: '生成地名图集', bootReady: '就绪',
    overview: '概览', geography: '地理', cities: '城市', people: '人口', economy: '经济', politics: '政治',
    military: '军事', culture: '文化', envtech: '环境科技', sources: '来源',
    kPop: '人口', kArea: '面积', kDens: '人口密度', kCapital: '首都', kRegion: '地区', capital: '首都',
    kSubregion: '次区域', kOfficial: '官方全称', kCurrency: '货币', kLanguage: '语言',
    kCode: '国家代码', kPhone: '国际区号', kTld: '顶级域名', kNeighbors: '陆上邻国',
    kCoords: '地理坐标', kCoast: '海岸线', kElevMax: '最高点', kElevMin: '最低点',
    kTemp: '年均气温', kLandlocked: '内陆国', kGov: '政体', kIndep: '独立/建国',
    kReligion: '主要宗教', kDish: '代表美食', kSymbol: '国家象征', kLife: '预期寿命',
    kUN: '联合国', kParts: '组成部分', kTz: '时区', kLegis: '立法机构', kAdmin: '行政区划',
    kLaw: '法律体系', kHos: '国家元首', kHog: '政府首脑', kNuke: '核力量', kAlliance: '军事组织',
    kAnthem: '国歌', kFlower: '国花', kAnimal: '国兽/国鸟', kSport: '代表体育', kFest: '主要节日',
    kDrive: '驾驶方向',
    yes: '是', no: '否', unMember: '联合国会员国', unNon: '非会员', none: '无', na: '暂无数据',
    nonNuke: '无核武器',
    sectBasic: '基本信息', sectGeo: '地理概况', sectSociety: '社会与人文', sectNeighbors: '周边',
    sectOrgs: '国际组织', sectPeople: '人口指标', sectEconomy: '经济总量', sectTrend: 'GDP 走势',
    sectTrade: '贸易与财政', sectPolity: '政治制度', sectMil: '国防实力', sectNuke: '核态势与同盟',
    sectCulture: '文化符号', sectEnv: '环境', sectTech: '科技与连接', sectCities: '主要城市',
    srcTitle: '数据来源',
    srcGeo: '疆域底图：Natural Earth 1:50m（公有领域），经 world-atlas 转换',
    srcName: '国名与代码：world-countries（ODbL），中文名取自其 zho 译名',
    srcFacts: '政体 / 宗教 / 美食 / 象征 / 海拔等：country-json 数据集',
    srcInd: '经济、军事、社会指标：整理自 IMF / 世界银行 / SIPRI / UNDP / UN 公开口径，逐项标注年份',
    srcPop: '人口：2024 年估算基线，可用下方按钮联网刷新至世界银行最新值',
    srcNote: '口径说明：本图按一个中国原则渲染，中国大陆与台湾、香港、澳门合并为同一实体；南海断续线为示意性绘制。藏南、阿克赛钦等地区暂按 Natural Earth 底图的实际控制线划分，非中国官方标准地图。',
    liveTitle: '联网刷新', liveTip: '该数值来自联网刷新',
    liveOn: '已联网刷新，数据快照日期 %s。',
    liveOff: '当前使用内置离线基线。联网后可从世界银行开放数据刷新 19 项指标。',
    liveBtn: '立即刷新', liveRun: '刷新中…', liveDone: '刷新完成', liveFail: '刷新失败（网络不可达）',
    themeNone: '自然配色', themeYear: '数据年份 %s',
    setBloom: '泛光强度', setClouds: '云层', setAurora: '极光', setAtmo: '大气辉光',
    setGrain: '胶片颗粒', setAber: '色散', setScan: '扫描线', setSweep: '雷达扫描', setLabels: '地名标注',
    setCities: '城市标注', setRoam: '随机漫游间隔（秒）', setFont: '界面字体',
    fontPingfang: '苹方 / 系统默认', fontYahei: '微软雅黑', fontHiragino: '冬青黑体', fontSongti: '宋体（衬线）', fontMono: '等宽',
    favAdd: '已加入收藏', favDel: '已取消收藏', cmpPick: '请在地图上点选第二个国家进行对比',
    cmpCancel: '已取消对比', cmpSelf: '不能与自身对比，请选择另一个国家',
    polNote: '政治条目为结构性事实，人事职位仅列职务名称；具体任职人随选举变动，未在离线基线中固化。',
    coastline: '海岸线', border: '国界', ninedash: '南海断续线（示意）', selected: '已选',
    unit10k: '万', unit100m: '亿', km2: '平方公里', km: '公里', ppl: '人', pplkm2: '人/平方公里',
    year: '年', age: '岁', celsius: '℃', meter: '米',
  },
  en: {
    brand: 'ATLAS', tagline: 'World Country Almanac', search: 'Search country / city / code…', noResult: 'No match',
    noCityData: 'No city data catalogued yet',
    markTitle: 'Custom marks', markSub: 'Colour-tag countries into your own sets, several shown at once',
    markAddGroup: 'New mark group', markGroupDefault: 'Group ', markPick: 'Pick', markDone: 'Done',
    markPickHint: 'Click the map to add/remove countries for this group, click "Done" to finish',
    markEmpty: 'No mark groups yet — add one below',
    themeCustom: 'Custom',
    globe: 'Globe', map: 'Map', spin: 'Spin', reset: 'Reset', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    fullscreen: 'Fullscreen', settings: 'Visual settings', ranking: 'Leaderboard', random: 'Surprise me',
    favorite: 'Favourite', compare: 'Compare', lang: 'Language',
    booting: 'Initialising', bootGeo: 'Decoding boundaries', bootMesh: 'Building sphere mesh',
    bootGL: 'Starting renderer', bootLabel: 'Rendering place names', bootReady: 'Ready',
    overview: 'Overview', geography: 'Geography', cities: 'Cities', people: 'People', economy: 'Economy', politics: 'Politics',
    military: 'Military', culture: 'Culture', envtech: 'Environment', sources: 'Sources',
    kPop: 'Population', kArea: 'Area', kDens: 'Density', kCapital: 'Capital', kRegion: 'Region', capital: 'Capital',
    kSubregion: 'Subregion', kOfficial: 'Official name', kCurrency: 'Currency', kLanguage: 'Languages',
    kCode: 'Codes', kPhone: 'Calling code', kTld: 'Internet TLD', kNeighbors: 'Land borders',
    kCoords: 'Coordinates', kCoast: 'Coastline', kElevMax: 'Highest point', kElevMin: 'Lowest point',
    kTemp: 'Avg. temperature', kLandlocked: 'Landlocked', kGov: 'Government', kIndep: 'Independence',
    kReligion: 'Main religion', kDish: 'National dish', kSymbol: 'National symbol', kLife: 'Life expectancy',
    kUN: 'United Nations', kParts: 'Constituents', kTz: 'Time zone', kLegis: 'Legislature',
    kAdmin: 'Administrative divisions', kLaw: 'Legal system', kHos: 'Head of state', kHog: 'Head of government',
    kNuke: 'Nuclear posture', kAlliance: 'Security blocs', kAnthem: 'National anthem', kFlower: 'National flower',
    kAnimal: 'National animal', kSport: 'National sport', kFest: 'Major festivals', kDrive: 'Driving side',
    yes: 'Yes', no: 'No', unMember: 'UN member state', unNon: 'Non-member', none: 'None', na: 'No data',
    nonNuke: 'Non-nuclear',
    sectBasic: 'Basics', sectGeo: 'Geography', sectSociety: 'Society', sectNeighbors: 'Neighbours',
    sectOrgs: 'Memberships', sectPeople: 'Demographics', sectEconomy: 'Output', sectTrend: 'GDP trend',
    sectTrade: 'Trade & fiscal', sectPolity: 'Political system', sectMil: 'Defence', sectNuke: 'Nuclear & alliances',
    sectCulture: 'Cultural symbols', sectEnv: 'Environment', sectTech: 'Technology', sectCities: 'Major cities',
    srcTitle: 'Data sources',
    srcGeo: 'Boundaries: Natural Earth 1:50m (public domain) via world-atlas',
    srcName: 'Names & codes: world-countries (ODbL)',
    srcFacts: 'Government / religion / dish / symbol / elevation: country-json',
    srcInd: 'Economic, defence and social indicators: compiled from IMF / World Bank / SIPRI / UNDP / UN, each stamped with its year',
    srcPop: 'Population: 2024 baseline; refresh below pulls the latest World Bank values',
    srcNote: 'Rendering policy: mainland China, Taiwan, Hong Kong and Macao are drawn as one entity under the one-China principle; the South China Sea dashed line is schematic. Disputed Himalayan sectors follow Natural Earth de-facto lines and are not an official map of any government.',
    liveTitle: 'Online refresh', liveTip: 'Refreshed from the World Bank',
    liveOn: 'Refreshed online, snapshot dated %s.',
    liveOff: 'Using the bundled offline baseline. Connect to refresh 19 indicators from World Bank open data.',
    liveBtn: 'Refresh now', liveRun: 'Refreshing…', liveDone: 'Done', liveFail: 'Failed (network unreachable)',
    themeNone: 'Natural', themeYear: 'Data year %s',
    setBloom: 'Bloom', setClouds: 'Clouds', setAurora: 'Aurora', setAtmo: 'Atmosphere',
    setGrain: 'Film grain', setAber: 'Aberration', setScan: 'Scanlines', setSweep: 'Radar sweep', setLabels: 'Place names',
    setCities: 'City labels', setRoam: 'Roam interval (sec)', setFont: 'Interface font',
    fontPingfang: 'PingFang / System', fontYahei: 'Microsoft YaHei', fontHiragino: 'Hiragino Sans', fontSongti: 'Songti (serif)', fontMono: 'Monospace',
    favAdd: 'Added to favourites', favDel: 'Removed from favourites', cmpPick: 'Now click a second country on the map',
    cmpCancel: 'Compare cancelled', cmpSelf: 'Pick a different country to compare',
    polNote: 'Political entries are structural facts; office holders change with elections and are not frozen into the offline baseline.',
    coastline: 'Coastline', border: 'Border', ninedash: 'S. China Sea dashed line (schematic)', selected: 'Selected',
    unit10k: 'K', unit100m: 'B', km2: 'km²', km: 'km', ppl: '', pplkm2: '/km²',
    year: '', age: 'yrs', celsius: '°C', meter: 'm',
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
