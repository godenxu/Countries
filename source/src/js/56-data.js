/* ============================================================
   indicator access, ranking, thematic scales, online refresh
   ============================================================ */
const DATA = { countries: [], indMeta: [], orgMeta: [], seriesYears: [], byKey: {}, ranks: {}, wb: null };

function initData(bundle) {
  DATA.countries = bundle.countries;
  DATA.indMeta = bundle.indMeta;
  DATA.orgMeta = bundle.orgMeta;
  DATA.seriesYears = bundle.seriesYears;
  DATA.countries.forEach((c, i) => { DATA.byKey[c.k] = i; });
  loadCache();
  computeRanks();
}

/* value access: online refresh wins over the bundled baseline */
function indVal(rec, key) {
  if (!rec) return null;
  const w = DATA.wb && DATA.wb.v[rec.k];
  if (w && w[key] != null) return w[key];
  if (key === 'pop') return rec.pop;
  if (key === 'area') return rec.area;
  if (key === 'dens') return rec.dens;
  if (key === 'her') return rec.her;
  return rec.ind ? (rec.ind[key] != null ? rec.ind[key] : null) : null;
}
function indYear(rec, key) {
  const w = DATA.wb && DATA.wb.y[rec.k];
  if (w && w[key] != null) return w[key];
  const m = DATA.indMeta.find((x) => x.k === key);
  if (key === 'pop') return rec.popY;
  return m ? m.year : null;
}
function indIsLive(rec, key) {
  const w = DATA.wb && DATA.wb.v[rec.k];
  return !!(w && w[key] != null);
}

/* extra pseudo-indicators that come straight off the record */
const EXTRA_META = [
  { k: 'pop',  zh: '人口',       en: 'Population',  unit: '',   uzh: '人',        fmt: 'big',  good: 0, group: 'soc' },
  { k: 'area', zh: '国土面积',   en: 'Area',        unit: 'km²', uzh: '平方公里', fmt: 'big',  good: 0, group: 'geo' },
  { k: 'dens', zh: '人口密度',   en: 'Density',     unit: '/km²', uzh: '人/平方公里', fmt: 'dec1', good: 0, group: 'soc' },
  { k: 'her',  zh: '世界遗产',   en: 'World Heritage', unit: '', uzh: '项',       fmt: 'int',  good: 1, group: 'cul' },
];
function allMeta() { return EXTRA_META.concat(DATA.indMeta); }
function metaOf(key) { return allMeta().find((m) => m.k === key); }

/* themes offered on the choropleth bar */
const THEMES = ['pop', 'area', 'dens', 'gdp', 'gdpPc', 'growth', 'hdi', 'life', 'medAge', 'fert',
  'urban', 'net', 'milExp', 'milPct', 'milAct', 'co2', 'forest', 'renew', 'infl', 'unemp', 'her'];
const LOG_THEMES = new Set(['pop', 'area', 'gdp', 'gdpPc', 'dens', 'milExp', 'milAct', 'res', 'exp', 'imp', 'her']);

function computeRanks() {
  DATA.ranks = {};
  for (const m of allMeta()) {
    const rows = [];
    for (let i = 0; i < DATA.countries.length; i++) {
      const c = DATA.countries[i];
      if (!c.un && !c.indep) continue;          // rank sovereign states only
      const v = indVal(c, m.k);
      if (v == null) continue;
      rows.push([i, v]);
    }
    rows.sort((a, b) => b[1] - a[1]);
    const r = { order: rows, rank: {}, min: rows.length ? rows[rows.length - 1][1] : 0, max: rows.length ? rows[0][1] : 1 };
    rows.forEach(([i], n) => { r.rank[i] = n + 1; });
    DATA.ranks[m.k] = r;
  }
}

/* quantile shading: skewed distributions (GDP, population) otherwise collapse
   almost every country into one band of the ramp */
function themeScale(key) {
  const r = DATA.ranks[key];
  if (!r || !r.order.length) return null;
  const n = r.order.length;
  const pos = new Map();
  r.order.forEach(([i], k) => pos.set(i, 1 - k / Math.max(1, n - 1)));
  const idx = new Map();
  DATA.countries.forEach((c, i) => idx.set(c.k, i));
  return (rec) => {
    const i = idx.get(rec.k);
    const p = pos.get(i);
    if (p == null) return indVal(rec, key) == null ? null : 0.5;
    return clamp(p, 0, 1);
  };
}

/* ---------------- formatting ---------------- */
function fmtVal(v, m) {
  if (v == null || !isFinite(v)) return '—';
  switch (m && m.fmt) {
    case 'money': {
      if (LANG === 'zh') {
        if (v >= 1000) return (v / 1000).toFixed(2) + ' 万亿美元';
        if (v >= 1) return (v * 10).toFixed(v >= 10 ? 0 : 1) + ' 亿美元';
        return (v * 1000).toFixed(0) + ' 百万美元';
      }
      if (v >= 1000) return '$' + (v / 1000).toFixed(2) + 'T';
      return '$' + (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + 'B';
    }
    case 'big': { const b = fmtBig(v); return b.v + (b.u ? ' ' + b.u : ''); }
    case 'pct0': return v.toFixed(0) + '%';
    case 'pct1': return v.toFixed(1) + '%';
    case 'dec1': return v.toFixed(1);
    case 'dec2': return v.toFixed(2);
    case 'dec3': return v.toFixed(3);
    case 'int': return fmtInt(v);
    default: return fmtInt(v);
  }
}
function unitOf(m) { return m ? (LANG === 'zh' ? (m.uzh || '') : (m.unit || '')) : ''; }
function labelOf(m) { return m ? (LANG === 'zh' ? m.zh : m.en) : ''; }

/* ---------------- online refresh (World Bank) ---------------- */
const WB_MAP = {
  gdp: ['NY.GDP.MKTP.CD', 1e-9], gdpPc: ['NY.GDP.PCAP.CD', 1], growth: ['NY.GDP.MKTP.KD.ZG', 1],
  infl: ['FP.CPI.TOTL.ZG', 1], unemp: ['SL.UEM.TOTL.ZS', 1], milExp: ['MS.MIL.XPND.CD', 1e-9],
  milPct: ['MS.MIL.XPND.GD.ZS', 1], milAct: ['MS.MIL.TOTL.P1', 1e-3], life: ['SP.DYN.LE00.IN', 1],
  urban: ['SP.URB.TOTL.IN.ZS', 1], net: ['IT.NET.USER.ZS', 1], forest: ['AG.LND.FRST.ZS', 1],
  fert: ['SP.DYN.TFRT.IN', 1], lit: ['SE.ADT.LITR.ZS', 1], pop: ['SP.POP.TOTL', 1],
  res: ['FI.RES.TOTL.CD', 1e-9], exp: ['NE.EXP.GNFS.CD', 1e-9], imp: ['NE.IMP.GNFS.CD', 1e-9],
  renew: ['EG.ELC.RNEW.ZS', 1],
};

function loadCache() {
  try {
    const raw = localStorage.getItem('atlas.wb');
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && o.v && Date.now() - o.t < 90 * 86400000) DATA.wb = o;
  } catch (e) { /* cache is best effort */ }
}
function saveCache() {
  try { localStorage.setItem('atlas.wb', JSON.stringify(DATA.wb)); } catch (e) { /* quota */ }
}

async function refreshOnline(onProgress) {
  const keys = Object.keys(WB_MAP);
  const store = DATA.wb && DATA.wb.v ? DATA.wb : { t: 0, v: {}, y: {} };
  let done = 0, ok = 0;
  for (const k of keys) {
    const [code, mul] = WB_MAP[k];
    try {
      const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=400&mrnev=1`;
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      const rows = Array.isArray(j) && j[1] ? j[1] : [];
      for (const row of rows) {
        const iso = row.countryiso3code;
        if (!iso || row.value == null || DATA.byKey[iso] == null) continue;
        (store.v[iso] = store.v[iso] || {})[k] = +(row.value * mul);
        (store.y[iso] = store.y[iso] || {})[k] = +row.date;
      }
      ok++;
    } catch (e) { /* one indicator failing must not stop the rest */ }
    done++;
    onProgress && onProgress(done / keys.length, k);
  }
  if (!ok) return false;
  store.t = Date.now();
  DATA.wb = store;
  saveCache();
  computeRanks();
  return true;
}
