// Minimal TopoJSON decoder + geometry helpers for the Atlas build pipeline.

export function decodeArcs(topo) {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    const out = new Array(arc.length);
    for (let i = 0; i < arc.length; i++) {
      x += arc[i][0]; y += arc[i][1];
      out[i] = [x * sx + tx, y * sy + ty];
    }
    return out;
  });
}

// Flatten a topology arc index list into a closed ring of [lon,lat] points.
export function ringFromArcs(arcIdx, arcs) {
  const ring = [];
  for (const idx of arcIdx) {
    const rev = idx < 0;
    const a = arcs[rev ? ~idx : idx];
    const pts = rev ? a.slice().reverse() : a;
    for (let i = ring.length ? 1 : 0; i < pts.length; i++) ring.push(pts[i]);
  }
  return ring;
}

export function eachPolygon(geom, fn) {
  if (geom.type === 'Polygon') fn(geom.arcs);
  else if (geom.type === 'MultiPolygon') geom.arcs.forEach(fn);
}

// Insert points so no edge exceeds maxDeg of angular extent (lon weighted by cos lat).
export function densify(ring, maxDeg) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    out.push(a);
    const midLat = (a[1] + b[1]) * 0.5;
    const dx = (b[0] - a[0]) * Math.cos(midLat * Math.PI / 180);
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    if (d > maxDeg) {
      const n = Math.min(256, Math.ceil(d / maxDeg));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
  }
  return out;
}

export function densifyLine(line, maxDeg) {
  const closed = densify(line.concat([line[line.length - 1]]), maxDeg);
  return closed;
}

// Sutherland-Hodgman clip of a convex-ish polygon against one half plane.
function clipHalf(poly, sign, axis, value) {
  if (!poly.length) return poly;
  const inside = (p) => (sign > 0 ? p[axis] >= value : p[axis] <= value);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      p[axis] = value;
      out.push(p);
    }
  }
  return out;
}

export function clipToCell(tri, x0, x1, y0, y1) {
  let p = tri;
  p = clipHalf(p, +1, 0, x0);
  p = clipHalf(p, -1, 0, x1);
  p = clipHalf(p, +1, 1, y0);
  p = clipHalf(p, -1, 1, y1);
  return p;
}

export function lonLatToVec(lon, lat) {
  const a = lon * Math.PI / 180, b = lat * Math.PI / 180;
  const c = Math.cos(b);
  return [c * Math.cos(a), Math.sin(b), c * Math.sin(a)];
}

export function triAreaDeg(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) * 0.5;
}
