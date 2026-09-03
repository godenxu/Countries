/* ============================================================
   geometry: decode the packed topology, rebuild rings,
   triangulate, grid-clip, and derive per-country metadata
   ============================================================ */
const CELL = 4.0;       // deg; grid keeps triangles small enough to hug the sphere
const MAX_EDGE = 1.5;   // deg; ring densification

function decodeGeo(buf) {
  const { head, bufs } = unpack(buf);
  const S = head.scale;
  const lens = readVarints(bufs.arcLen, head.nArcs, false);
  const dx = readVarints(bufs.dx, head.nPts, true);
  const dy = readVarints(bufs.dy, head.nPts, true);
  const arcs = new Array(head.nArcs);
  let p = 0, x = 0, y = 0;
  for (let a = 0; a < head.nArcs; a++) {
    const n = lens[a];
    const pts = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      x += dx[p]; y += dy[p]; p++;
      pts[i * 2] = x / S; pts[i * 2 + 1] = y / S;
    }
    arcs[a] = pts;
  }
  return { arcs, kind: bufs.arcKind, topo: head.topo, dash: head.dash, scale: S };
}

function ringPoints(ringArcs, arcs) {
  const out = [];
  for (const idx of ringArcs) {
    const rev = idx < 0;
    const a = arcs[rev ? ~idx : idx];
    const n = a.length / 2;
    if (rev) {
      for (let i = n - 1; i >= 0; i--) { if (out.length && i === n - 1) continue; out.push(a[i * 2], a[i * 2 + 1]); }
    } else {
      for (let i = 0; i < n; i++) { if (out.length && i === 0) continue; out.push(a[i * 2], a[i * 2 + 1]); }
    }
  }
  return out;
}

function densifyFlat(flat, maxDeg) {
  const out = [];
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = flat[i * 2], ay = flat[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = flat[j * 2], by = flat[j * 2 + 1];
    out.push(ax, ay);
    const dxs = (bx - ax) * Math.cos((ay + by) * 0.5 * DEG), dys = by - ay;
    const d = Math.hypot(dxs, dys);
    if (d > maxDeg) {
      const k = Math.min(256, Math.ceil(d / maxDeg));
      for (let s = 1; s < k; s++) { const t = s / k; out.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
    }
  }
  return out;
}

function clipHalf(poly, sign, axis, value) {
  const out = [];
  const n = poly.length / 2;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = poly[i * 2], ay = poly[i * 2 + 1], bx = poly[j * 2], by = poly[j * 2 + 1];
    const av = axis ? ay : ax, bv = axis ? by : bx;
    const ia = sign > 0 ? av >= value : av <= value;
    const ib = sign > 0 ? bv >= value : bv <= value;
    if (ia) out.push(ax, ay);
    if (ia !== ib) {
      const t = (value - av) / (bv - av);
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      out.push(axis ? px : value, axis ? value : py);
    }
  }
  return out;
}

function lonLatToVec(lon, lat) {
  const a = lon * DEG, b = lat * DEG, c = Math.cos(b);
  return [c * Math.sin(a), Math.sin(b), c * Math.cos(a)];
}

async function buildMesh(geo, onProgress) {
  const EC = (typeof earcut === 'function') ? earcut : earcut.default;
  const posArr = [], cidArr = [], idxArr = [];
  let vBase = 0;
  const nEnt = geo.topo.length;

  // arc -> owning entities (drives border classification and selection outlines)
  const arcOwners = new Map();
  geo.topo.forEach((e, ei) => {
    for (const poly of e.p) for (const ring of poly) for (const ai of ring) {
      const a = ai < 0 ? ~ai : ai;
      let s = arcOwners.get(a);
      if (!s) { s = []; arcOwners.set(a, s); }
      if (s.indexOf(ei) < 0) s.push(ei);
    }
  });

  for (let ei = 0; ei < nEnt; ei++) {
    const e = geo.topo[ei];
    for (const poly of e.p) {
      const rings = poly.map((r) => densifyFlat(ringPoints(r, geo.arcs), MAX_EDGE));
      const flat = []; const holes = [];
      rings.forEach((r, ri) => { if (ri > 0) holes.push(flat.length / 2); for (let i = 0; i < r.length; i++) flat.push(r[i]); });
      if (flat.length < 6) continue;
      const tri = EC(flat, holes, 2);
      for (let t = 0; t < tri.length; t += 3) {
        emitTri(
          flat[tri[t] * 2], flat[tri[t] * 2 + 1],
          flat[tri[t + 1] * 2], flat[tri[t + 1] * 2 + 1],
          flat[tri[t + 2] * 2], flat[tri[t + 2] * 2 + 1], ei);
      }
    }
    if (ei % 24 === 0) { onProgress && onProgress(ei / nEnt); await new Promise((r) => setTimeout(r, 0)); }
  }

  function emitTri(ax, ay, bx, by, cx, cy, cid) {
    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
    const i0 = Math.floor(minX / CELL), i1 = Math.floor((maxX - 1e-9) / CELL);
    const j0 = Math.floor(minY / CELL), j1 = Math.floor((maxY - 1e-9) / CELL);
    if (i0 === i1 && j0 === j1) { pushPoly([ax, ay, bx, by, cx, cy], cid); return; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      let p = [ax, ay, bx, by, cx, cy];
      p = clipHalf(p, +1, 0, i * CELL); if (p.length < 6) continue;
      p = clipHalf(p, -1, 0, (i + 1) * CELL); if (p.length < 6) continue;
      p = clipHalf(p, +1, 1, j * CELL); if (p.length < 6) continue;
      p = clipHalf(p, -1, 1, (j + 1) * CELL); if (p.length < 6) continue;
      pushPoly(p, cid);
    }
  }

  function pushPoly(p, cid) {
    const n = p.length / 2;
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < n; i++) { const x = p[i * 2]; if (x < lo) lo = x; if (x > hi) hi = x; }
    if (hi - lo > 180) return;   // wraps the antimeridian

    const start = vBase;
    for (let i = 0; i < n; i++) { posArr.push(p[i * 2], p[i * 2 + 1]); cidArr.push(cid); }
    vBase += n;
    for (let k = 1; k + 1 < n; k++) {
      const ax = p[0], ay = p[1], bx = p[k * 2], by = p[k * 2 + 1], cx = p[(k + 1) * 2], cy = p[(k + 1) * 2 + 1];
      if (Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) < 1e-12) continue;
      idxArr.push(start, start + k, start + k + 1);
    }
  }

  onProgress && onProgress(1);

  // ---- boundary segments (one pass over arcs, deduplicated by construction)
  const segA = [], segB = [], segMeta = [];
  arcOwners.forEach((owners, ai) => {
    const raw = geo.arcs[ai];
    const n = raw.length / 2;
    const internal = owners.length > 1 ? 1 : 0;
    const o1 = owners[0], o2 = owners.length > 1 ? owners[1] : owners[0];
    for (let i = 0; i + 1 < n; i++) {
      if (Math.abs(raw[i * 2] - raw[i * 2 + 2]) > 180) continue;
      segA.push(raw[i * 2], raw[i * 2 + 1]);
      segB.push(raw[i * 2 + 2], raw[i * 2 + 3]);
      segMeta.push(internal, o1, o2);
    }
  });

  // ---- schematic nine-dash line
  const dashA = [], dashB = [];
  for (const seg of geo.dash) {
    for (let i = 0; i + 1 < seg.length; i++) {
      const a = seg[i], b = seg[i + 1];
      dashA.push(a[0] / geo.scale, a[1] / geo.scale);
      dashB.push(b[0] / geo.scale, b[1] / geo.scale);
    }
  }

  // ---- graticule (generated, not shipped)
  const grA = [], grB = [];
  for (let lon = -180; lon < 180; lon += 15) {
    for (let lat = -90; lat < 90; lat += 3) { grA.push(lon, lat); grB.push(lon, lat + 3); }
  }
  for (let lat = -60; lat <= 60; lat += 15) {
    for (let lon = -180; lon < 180; lon += 3) { grA.push(lon, lat); grB.push(lon + 3, lat); }
  }

  // ---- per-country metadata from the finished mesh
  const meta = geo.topo.map((e) => ({
    key: e.k, ne: e.n, cx: 0, cy: 0, cz: 0, r: 0.05, area: 0, lon: 0, lat: 0,
  }));
  const acc = meta.map(() => [0, 0, 0, 0]);
  for (let t = 0; t < idxArr.length; t += 3) {
    const i = idxArr[t], j = idxArr[t + 1], k = idxArr[t + 2];
    const cid = cidArr[i];
    const lo = (posArr[i * 2] + posArr[j * 2] + posArr[k * 2]) / 3;
    const la = (posArr[i * 2 + 1] + posArr[j * 2 + 1] + posArr[k * 2 + 1]) / 3;
    const a = Math.abs((posArr[j * 2] - posArr[i * 2]) * (posArr[k * 2 + 1] - posArr[i * 2 + 1])
      - (posArr[k * 2] - posArr[i * 2]) * (posArr[j * 2 + 1] - posArr[i * 2 + 1])) * 0.5 * Math.cos(la * DEG);
    const v = lonLatToVec(lo, la);
    const A = acc[cid];
    A[0] += v[0] * a; A[1] += v[1] * a; A[2] += v[2] * a; A[3] += a;
  }
  meta.forEach((m, i) => {
    const A = acc[i];
    const L = Math.hypot(A[0], A[1], A[2]) || 1;
    m.cx = A[0] / L; m.cy = A[1] / L; m.cz = A[2] / L;
    m.area = A[3] * 12365;
    m.lat = Math.asin(clamp(m.cy, -1, 1)) / DEG;
    m.lon = Math.atan2(m.cx, m.cz) / DEG;
  });
  // Per-triangle angular spread from the centroid, area-weighted so a country's
  // camera-fit radius reflects its main landmass rather than being dragged out
  // by a small, far-flung territory (French Guiana, Hawaii, Svalbard...).
  const maxAng = meta.map(() => 0);
  const sqAcc = meta.map(() => [0, 0]); // [sum(area*d^2), sum(area)]
  for (let t = 0; t < idxArr.length; t += 3) {
    const i = idxArr[t], j = idxArr[t + 1], k = idxArr[t + 2];
    const cid = cidArr[i], m = meta[cid];
    const lo = (posArr[i * 2] + posArr[j * 2] + posArr[k * 2]) / 3;
    const la = (posArr[i * 2 + 1] + posArr[j * 2 + 1] + posArr[k * 2 + 1]) / 3;
    const a = Math.abs((posArr[j * 2] - posArr[i * 2]) * (posArr[k * 2 + 1] - posArr[i * 2 + 1])
      - (posArr[k * 2] - posArr[i * 2]) * (posArr[j * 2 + 1] - posArr[i * 2 + 1])) * 0.5 * Math.cos(la * DEG);
    const v = lonLatToVec(lo, la);
    const d = Math.acos(clamp(v[0] * m.cx + v[1] * m.cy + v[2] * m.cz, -1, 1));
    sqAcc[cid][0] += a * d * d; sqAcc[cid][1] += a;
  }
  for (let i = 0; i < cidArr.length; i++) {
    const cid = cidArr[i], m = meta[cid];
    const v = lonLatToVec(posArr[i * 2], posArr[i * 2 + 1]);
    const d = Math.acos(clamp(v[0] * m.cx + v[1] * m.cy + v[2] * m.cz, -1, 1));
    if (d > maxAng[cid]) maxAng[cid] = d;
  }
  meta.forEach((m, i) => {
    m.r = Math.max(0.02, maxAng[i]);
    const rms = Math.sqrt(sqAcc[i][0] / Math.max(1e-9, sqAcc[i][1]));
    // camera-fit radius: robust to outlier fragments, still allows genuinely
    // sprawling countries (Russia, Indonesia) to pull the camera back further
    m.rFit = Math.max(0.02, Math.min(m.r, rms * 2.4));
  });

  return {
    fill: {
      pos: new Float32Array(posArr), cid: new Uint16Array(cidArr),
      idx: new Uint32Array(idxArr), count: idxArr.length,
    },
    seg: { a: new Float32Array(segA), b: new Float32Array(segB), meta: new Float32Array(segMeta), n: segMeta.length / 3 },
    dash: { a: new Float32Array(dashA), b: new Float32Array(dashB), n: dashA.length / 2 },
    grat: { a: new Float32Array(grA), b: new Float32Array(grB), n: grA.length / 2 },
    meta,
  };
}
