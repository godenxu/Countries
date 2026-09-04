/* ============================================================
   surface labels — a glyph atlas drawn as tangent-plane quads so
   names sit ON the map and rotate/foreshorten with it. Countries
   and their top cities share one atlas; a tier flag tells the
   shader how big/bright to draw each instance.
   ============================================================ */
const ATLAS_W = 2048, ATLAS_H = 2048, ATLAS_FONT = 34, CITY_FONT = 27, ATLAS_ROW = 48, CITY_ROW = 38;

// system-only font stack, changeable from Settings — no webfont fetches
let LABEL_FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif';

function buildLabelAtlas(countries, meta, lang) {
  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  const g = cv.getContext('2d', { willReadFrequently: false });
  g.clearRect(0, 0, ATLAS_W, ATLAS_H);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.lineJoin = 'round';

  const draw = (name, x, y, row, halo, fill) => {
    g.strokeStyle = halo; g.lineWidth = row > 40 ? 5 : 3.6;
    g.strokeText(name, x + 7, y + row / 2);
    g.fillStyle = fill;
    g.fillText(name, x + 7, y + row / 2);
  };

  const rects = new Array(countries.length);
  // medium (not bold) weight: bold glyphs run wider and clump together once
  // several small, close countries are on screen at once (Balkans, Gulf...)
  g.font = `500 ${ATLAS_FONT}px ${LABEL_FONT_STACK}`;
  let x = 4, y = 4;
  for (let i = 0; i < countries.length; i++) {
    const name = lang === 'zh' ? countries[i].zh : countries[i].en;
    const w = Math.ceil(g.measureText(name).width) + 14;
    if (x + w > ATLAS_W - 4) { x = 4; y += ATLAS_ROW; }
    if (y + ATLAS_ROW > ATLAS_H) break;
    // deep aurora-navy halo keeps names legible over any choropleth colour,
    // and a soft mint fill keeps them part of the same HUD family as the UI
    draw(name, x, y, ATLAS_ROW, 'rgba(4,13,17,0.94)', '#d6f4ec');
    rects[i] = [x / ATLAS_W, y / ATLAS_H, w / ATLAS_W, ATLAS_ROW / ATLAS_H, w / ATLAS_ROW];
    x += w + 7;
  }

  // city names pack into whatever atlas rows remain. A solid pill behind the
  // text (not just a stroke halo) guarantees contrast even sitting on top of
  // a bright selected-country or choropleth fill.
  const cityRects = [];
  g.font = `500 ${CITY_FONT}px ${LABEL_FONT_STACK}`;
  y += ATLAS_ROW;
  x = 4;
  const cities = [];
  for (let i = 0; i < countries.length; i++) {
    for (const c of countries[i].cities || []) cities.push({ ...c, ci: i });
  }
  const PAD = 9, DOT = 8;
  for (const c of cities) {
    const name = lang === 'zh' ? c.zh : c.en;
    const textW = Math.ceil(g.measureText(name).width);
    const w = DOT + 5 + textW + PAD * 2;
    if (x + w > ATLAS_W - 4) { x = 4; y += CITY_ROW; }
    if (y + CITY_ROW > ATLAS_H) break;
    const cy = y + CITY_ROW / 2;
    // capitals get a gold star-diamond marker + brighter pill; regular
    // cities keep a plain teal dot, so the seat of government reads at a glance
    g.fillStyle = c.isCap ? 'rgba(23,17,4,0.80)' : 'rgba(4,13,18,0.72)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y + 3, w, CITY_ROW - 6, (CITY_ROW - 6) / 2);
    else g.rect(x, y + 3, w, CITY_ROW - 6);
    g.fill();
    if (c.isCap) {
      g.strokeStyle = 'rgba(242,181,82,0.55)'; g.lineWidth = 1.4;
      if (g.roundRect) { g.beginPath(); g.roundRect(x + 0.7, y + 3.7, w - 1.4, CITY_ROW - 7.4, (CITY_ROW - 7.4) / 2); g.stroke(); }
      const cx = x + PAD + DOT / 2, r = DOT * 0.62;
      g.fillStyle = '#ffcf6e';
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a0 = (k / 4) * Math.PI * 2 - Math.PI / 4;
        const rr = k % 2 === 0 ? r : r * 0.42;
        const px = cx + Math.cos(a0) * rr, py = cy + Math.sin(a0) * rr;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    } else {
      g.fillStyle = '#5fe0c4';
      g.beginPath(); g.arc(x + PAD + DOT / 2, cy, DOT / 2, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(3,11,15,0.96)'; g.lineWidth = 3.2;
    g.strokeText(name, x + PAD + DOT + 5, cy);
    g.fillStyle = c.isCap ? '#fff6e0' : '#eafff8';
    g.fillText(name, x + PAD + DOT + 5, cy);
    cityRects.push({ rect: [x / ATLAS_W, y / ATLAS_H, w / ATLAS_W, CITY_ROW / ATLAS_H, w / CITY_ROW], c });
    x += w + 6;
  }

  return { canvas: cv, rects, cityRects };
}

function buildLabelInstances(countries, meta, atlas) {
  const nCountry = meta.length, nCity = atlas.cityRects.length;
  const n = nCountry + nCity;
  const ll = new Float32Array(n * 2);
  const uv = new Float32Array(n * 4);
  const info = new Float32Array(n * 4);
  const tier = new Float32Array(n);
  let count = 0;
  // sort so the biggest countries draw last (they win overlaps)
  const order = meta.map((m, i) => i).sort((a, b) => meta[a].area - meta[b].area);
  const sByIdx = new Float32Array(meta.length);
  for (const i of order) {
    const r = atlas.rects[i];
    if (!r) continue;
    const m = meta[i];
    if (!m.area) continue;
    ll[count * 2] = m.lon; ll[count * 2 + 1] = m.lat;
    uv[count * 4] = r[0]; uv[count * 4 + 1] = r[1]; uv[count * 4 + 2] = r[2]; uv[count * 4 + 3] = r[3];
    // bigger states carry noticeably bigger type, as on a printed map — a
    // wide range so Russia and San Marino are never mistaken for peers, and
    // so small, tightly-packed countries (Balkans, the Gulf) take up less
    // room and collide with their neighbours' labels less often
    const s = clamp(0.30 * Math.log10(Math.max(2e3, m.area)) - 0.55, 0.48, 1.75);
    sByIdx[i] = s;
    info[count * 4] = s; info[count * 4 + 1] = m.area; info[count * 4 + 2] = i; info[count * 4 + 3] = r[4];
    tier[count] = 0;
    count++;
  }
  // cities: sized as a fraction of their *own host country's* label scale,
  // not a flat constant -- a flat size read fine for large countries but
  // dwarfed the country name for small ones (e.g. Seoul vs. "South Korea")
  // once the zoom-growth multiplier (uCityZoom) kicked in
  for (const { rect: r, c } of atlas.cityRects) {
    ll[count * 2] = c.lon; ll[count * 2 + 1] = c.lat;
    uv[count * 4] = r[0]; uv[count * 4 + 1] = r[1]; uv[count * 4 + 2] = r[2]; uv[count * 4 + 3] = r[3];
    const hostS = sByIdx[c.ci] || 0.7;
    info[count * 4] = hostS * (c.isCap ? 0.72 : 0.58); info[count * 4 + 1] = 900;
    info[count * 4 + 2] = 10000 + c.ci; info[count * 4 + 3] = r[4];
    tier[count] = 1;
    count++;
  }
  // meta-index (country) -> its slot in these buffers, for the CPU-side
  // per-frame collision pass to write into the right place
  const slotOfMeta = new Int32Array(meta.length).fill(-1);
  order.forEach((mi, slot) => { if (atlas.rects[mi] && meta[mi].area) slotOfMeta[mi] = slot; });
  return { ll, uv, info, tier, count, nCountry: order.filter((mi) => atlas.rects[mi] && meta[mi].area).length, slotOfMeta };
}
