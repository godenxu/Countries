// Emits the Natural Earth 50m country topology in a compact delta+varint form.
// The app rebuilds rings, triangles and border segments from this at load time.
import fs from 'node:fs';
import path from 'node:path';
import topoData from 'world-atlas/countries-50m.json' with { type: 'json' };
import worldCountries from 'world-countries/countries.json' with { type: 'json' };
import { decodeArcs } from './lib/topo.mjs';
import { pack } from './lib/pack.mjs';
import { encodeVarints, encodeUVarints } from './lib/varint.mjs';
import { NINE_DASH } from './lib/ninedash.mjs';

const OUT = path.resolve('data');
const SCALE = 500; // 0.002 deg quantization (~220 m)

// One-China rendering: mainland + Taiwan + Hong Kong + Macao are one entity.
const MERGE = { '158': '156', '344': '156', '446': '156' };
const N2A = new Map();
for (const c of worldCountries) if (c.ccn3) N2A.set(String(Number(c.ccn3)), c.cca3);
const NAME_FALLBACK = {
  'Kosovo': 'XKX', 'N. Cyprus': 'XNC', 'Somaliland': 'XSL',
  'Siachen Glacier': 'XSG', 'Antarctica': 'ATA',
};

const arcs = decodeArcs(topoData);
const geoms = topoData.objects.countries.geometries;

const entities = new Map();
for (const g of geoms) {
  let id = g.id != null ? String(Number(g.id)) : null;
  if (id && MERGE[id]) id = MERGE[id];
  let key = (id ? N2A.get(id) : null) || NAME_FALLBACK[g.properties?.name]
    || 'X' + (g.properties?.name || 'UNK').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
  if (!entities.has(key)) entities.set(key, { key, ne: g.properties?.name || key, polys: [] });
  const e = entities.get(key);
  if (g.type === 'Polygon') e.polys.push(g.arcs);
  else if (g.type === 'MultiPolygon') for (const p of g.arcs) e.polys.push(p);
}
const list = [...entities.values()].sort((a, b) => a.key.localeCompare(b.key));

// Only keep arcs actually referenced, renumbered densely.
const used = new Map();
const arcOrder = [];
function remap(idx) {
  const a = idx < 0 ? ~idx : idx;
  if (!used.has(a)) { used.set(a, arcOrder.length); arcOrder.push(a); }
  const n = used.get(a);
  return idx < 0 ? ~n : n;
}
const topo = list.map((e) => ({
  k: e.key, n: e.ne,
  p: e.polys.map((poly) => poly.map((ring) => ring.map(remap))),
}));

// arc usage count decides coastline vs. internal border
const useCount = new Map();
list.forEach((e, ei) => {
  for (const poly of e.polys) for (const ring of poly) for (const idx of ring) {
    const a = idx < 0 ? ~idx : idx;
    if (!useCount.has(a)) useCount.set(a, new Set());
    useCount.get(a).add(ei);
  }
});

// coordinate streams: per arc, delta encoded, arcs chained to each other
const lens = [], dx = [], dy = [], kinds = [];
let px = 0, py = 0;
for (const original of arcOrder) {
  const pts = arcs[original];
  lens.push(pts.length);
  kinds.push(useCount.get(original).size > 1 ? 1 : 0);
  for (const [lon, lat] of pts) {
    const qx = Math.round(lon * SCALE), qy = Math.round(lat * SCALE);
    dx.push(qx - px); dy.push(qy - py);
    px = qx; py = qy;
  }
}

const dash = NINE_DASH.map((seg) => seg.map(([lo, la]) => [Math.round(lo * SCALE), Math.round(la * SCALE)]));

const buf = pack({
  arcLen: encodeUVarints(lens),
  arcKind: Uint8Array.from(kinds),
  dx: encodeVarints(dx),
  dy: encodeVarints(dy),
}, { scale: SCALE, topo, dash, nArcs: arcOrder.length, nPts: dx.length });

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'geo.bin'), buf);
console.log(`entities ${list.length}  arcs ${arcOrder.length}  points ${dx.length}`);
console.log(`geo.bin raw ${(buf.length / 1024).toFixed(0)} KB`);
