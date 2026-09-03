// Builds the per-country fact sheet consumed by the app (bilingual).
import fs from 'node:fs';
import path from 'node:path';
import worldCountries from 'world-countries/countries.json' with { type: 'json' };
import { CAP_ZH, POP, REGION_ZH, SUBREGION_ZH, CUR_ZH, LANG_ZH, CHN_PARTS, ZH_FALLBACK } from './lib/curated.mjs';
import { IND, IND_META, GDP_SERIES, GDP_SERIES_YEARS } from './lib/indicators.mjs';
import { ORGS, ORG_META, TZ, PINYIN } from './lib/facts.mjs';
import { GOV_ZH, POLITY, HERITAGE, CULTURE, NUKE_NOTE } from './lib/dossier.mjs';
import { CITIES } from './lib/cities.mjs';

const req = (f) => JSON.parse(fs.readFileSync(path.resolve('node_modules/country-json/src', f), 'utf8'));
const extras = {
  gov: req('country-by-government-type.json'),
  rel: req('country-by-religion.json'),
  dish: req('country-by-national-dish.json'),
  sym: req('country-by-national-symbol.json'),
  life: req('country-by-life-expectancy.json'),
  indep: req('country-by-independence-date.json'),
  temp: req('country-by-yearly-average-temperature.json'),
  coast: req('country-by-costline.json'),
  elev: req('country-by-elevation.json'),
};

const geo = (() => {
  const b = fs.readFileSync(path.resolve('data/geo.bin'));
  const hl = b.readUInt32LE(0);
  return JSON.parse(b.subarray(4, 4 + hl).toString('utf8').replace(/\0+$/, ''));
})();
const geoKeys = new Set(geo.topo.map((t) => t.k));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map();
for (const c of worldCountries) {
  for (const n of [c.name.common, c.name.official, ...(c.altSpellings || [])]) {
    const k = norm(n);
    if (k && !byName.has(k)) byName.set(k, c.cca3);
  }
}
byName.set('unitedstates', 'USA'); byName.set('southkorea', 'KOR'); byName.set('northkorea', 'PRK');
byName.set('russia', 'RUS'); byName.set('vietnam', 'VNM'); byName.set('syria', 'SYR');
byName.set('laos', 'LAO'); byName.set('iran', 'IRN'); byName.set('bolivia', 'BOL');
byName.set('tanzania', 'TZA'); byName.set('venezuela', 'VEN'); byName.set('moldova', 'MDA');
byName.set('brunei', 'BRN'); byName.set('capeverde', 'CPV'); byName.set('czechrepublic', 'CZE');
byName.set('swaziland', 'SWZ'); byName.set('macedonia', 'MKD'); byName.set('burma', 'MMR');
byName.set('democraticrepublicofthecongo', 'COD'); byName.set('republicofthecongo', 'COG');
byName.set('congo', 'COG'); byName.set('ivorycoast', 'CIV'); byName.set('easttimor', 'TLS');

const extraIndex = {};
for (const [name, rows] of Object.entries(extras)) {
  const m = new Map();
  for (const row of rows) {
    const key = byName.get(norm(row.country));
    if (key) m.set(key, row);
  }
  extraIndex[name] = m;
}

const num = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const out = [];
for (const t of geo.topo) {
  const key = t.k;
  const c = worldCountries.find((x) => x.cca3 === key);
  const zhT = c?.translations?.zho;
  const fb = ZH_FALLBACK[key];
  const rec = {
    k: key,
    a2: c?.cca2 || '',
    zh: fb?.zh || zhT?.common || t.n,
    zhO: fb?.zhO || zhT?.official || zhT?.common || t.n,
    en: fb?.en || c?.name.common || t.n,
    enO: fb?.en || c?.name.official || t.n,
    cap: { zh: CAP_ZH[key] || '', en: c?.capital?.[0] || '' },
    reg: { en: c?.region || '', zh: REGION_ZH[c?.region] || '' },
    sub: { en: c?.subregion || '', zh: SUBREGION_ZH[c?.subregion] || '' },
    area: c?.area ?? null,
    pop: POP[key] ?? null,
    popY: 2024,
    ll: c?.latlng || null,
    flag: c?.flag || '',
    un: !!c?.unMember,
    indep: !!c?.independent,
    landlocked: !!c?.landlocked,
    borders: (c?.borders || []).filter((b) => geoKeys.has(b)),
    tld: c?.tld || [],
    idd: c?.idd?.root ? c.idd.root + (c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : '') : '',
    cur: Object.entries(c?.currencies || {}).map(([code, v]) => ({
      c: code, en: v.name, zh: CUR_ZH[code] || '', s: v.symbol || '',
    })),
    lang: Object.entries(c?.languages || {}).map(([code, en]) => ({
      c: code, en, zh: LANG_ZH[code] || '',
    })),
  };
  const g = extraIndex.gov.get(key); if (g?.government) rec.gov = g.government;
  const r = extraIndex.rel.get(key); if (r?.religion) rec.rel = r.religion;
  const d = extraIndex.dish.get(key); if (d?.dish) rec.dish = d.dish;
  const s = extraIndex.sym.get(key); if (s?.symbol) rec.sym = s.symbol;
  const li = extraIndex.life.get(key); if (num(li?.expectancy)) rec.life = num(li.expectancy);
  const idp = extraIndex.indep.get(key); if (idp?.independence_date) rec.indepDate = idp.independence_date;
  const tp = extraIndex.temp.get(key); if (num(tp?.temperature) != null) rec.temp = num(tp.temperature);
  const co = extraIndex.coast.get(key); if (num(co?.costline) != null) rec.coast = num(co.costline);
  const el = extraIndex.elev.get(key);
  if (el) { if (num(el.max) != null) rec.elevMax = num(el.max); if (num(el.min) != null) rec.elevMin = num(el.min); }
  if (rec.area && rec.pop) rec.dens = +(rec.pop / rec.area).toFixed(1);
  // --- quantitative layer
  const ind = {};
  for (const m of IND_META) { const v = IND[m.k] && IND[m.k][key]; if (v != null) ind[m.k] = v; }
  if (ind.gdp != null && ind.gdpPc == null && rec.pop) ind.gdpPc = Math.round(ind.gdp * 1e9 / rec.pop);
  if (ind.gdp != null && ind.milExp != null && ind.milPct == null) ind.milPct = +(ind.milExp / ind.gdp * 100).toFixed(2);
  if (Object.keys(ind).length) rec.ind = ind;
  if (GDP_SERIES[key]) rec.series = GDP_SERIES[key];

  // --- memberships
  const orgs = [];
  for (const o of ORG_META) if (ORGS[o.k] && ORGS[o.k].indexOf(key) >= 0) orgs.push(o.k);
  if (orgs.length) rec.orgs = orgs;

  if (TZ[key]) rec.tz = TZ[key];
  if (PINYIN[key]) {
    rec.py = PINYIN[key];

  }
  if (POLITY[key]) rec.pol = POLITY[key];
  else if (rec.gov && GOV_ZH[rec.gov]) rec.pol = { gov: GOV_ZH[rec.gov] };
  if (HERITAGE[key] != null) rec.her = HERITAGE[key];
  if (CULTURE[key]) rec.cul = CULTURE[key];
  if (NUKE_NOTE[key]) rec.nuke = NUKE_NOTE[key];
  if (CITIES[key]) {
    rec.cities = CITIES[key].slice(0, 3).map(([zh, en, pop, lat, lon]) => ({ zh, en, pop, lat, lon }));
  }

  if (key === 'CHN') {
    rec.parts = CHN_PARTS;
    rec.pop = CHN_PARTS.reduce((a, p) => a + p.pop, 0);
    rec.area = 9600000;   // 官方公布的陆地面积口径（含台港澳）
  }
  out.push(rec);
}

const missing = out.filter((r) => !r.a2).map((r) => r.k);
const noPop = out.filter((r) => r.pop == null).map((r) => r.k);
console.log(`records ${out.length}; no ISO2 ${missing.length} [${missing}]; no pop ${noPop.length} [${noPop}]`);
for (const [n, m] of Object.entries(extraIndex)) console.log(`  ${n}: matched ${m.size}`);
// indicator + organisation dictionaries travel with the data
const bundle = { countries: out, indMeta: IND_META, orgMeta: ORG_META, seriesYears: GDP_SERIES_YEARS };
fs.writeFileSync(path.resolve('data/countries.json'), JSON.stringify(bundle));
const cov = {};
for (const m of IND_META) cov[m.k] = out.filter((r) => r.ind && r.ind[m.k] != null).length;
console.log('indicator coverage:', JSON.stringify(cov));
console.log('with orgs', out.filter((r) => r.orgs).length, '| polity', out.filter((r) => r.pol).length,
  '| culture', out.filter((r) => r.cul).length, '| series', out.filter((r) => r.series).length,
  '| pinyin', out.filter((r) => r.py).length, '| tz', out.filter((r) => r.tz).length);
console.log(`countries.json ${(fs.statSync('data/countries.json').size / 1024).toFixed(0)} KB raw`);
