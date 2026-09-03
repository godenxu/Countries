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
  g.font = `600 ${ATLAS_FONT}px ${LABEL_FONT_STACK}`;
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
    g.fillStyle = 'rgba(4,13,18,0.72)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y + 3, w, CITY_ROW - 6, (CITY_ROW - 6) / 2);
    else g.rect(x, y + 3, w, CITY_ROW - 6);
    g.fill();
    g.fillStyle = '#5fe0c4';
    g.beginPath(); g.arc(x + PAD + DOT / 2, cy, DOT / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(3,11,15,0.96)'; g.lineWidth = 3.2;
    g.strokeText(name, x + PAD + DOT + 5, cy);
    g.fillStyle = '#eafff8';
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
  for (const i of order) {
    const r = atlas.rects[i];
    if (!r) continue;
    const m = meta[i];
    if (!m.area) continue;
    ll[count * 2] = m.lon; ll[count * 2 + 1] = m.lat;
    uv[count * 4] = r[0]; uv[count * 4 + 1] = r[1]; uv[count * 4 + 2] = r[2]; uv[count * 4 + 3] = r[3];
    // bigger states carry slightly bigger type, as on a printed map
    const s = clamp(0.78 + Math.log10(Math.max(1e4, m.area)) * 0.115, 0.78, 1.45);
    info[count * 4] = s; info[count * 4 + 1] = m.area; info[count * 4 + 2] = i; info[count * 4 + 3] = r[4];
    tier[count] = 0;
    count++;
  }
  // cities: fixed small on-screen size, only fade in once zoomed well past
  // their host country's own label threshold (encoded as a tiny synthetic area)
  for (const { rect: r, c } of atlas.cityRects) {
    ll[count * 2] = c.lon; ll[count * 2 + 1] = c.lat;
    uv[count * 4] = r[0]; uv[count * 4 + 1] = r[1]; uv[count * 4 + 2] = r[2]; uv[count * 4 + 3] = r[3];
    info[count * 4] = 0.95; info[count * 4 + 1] = 900; info[count * 4 + 2] = 10000 + c.ci; info[count * 4 + 3] = r[4];
    tier[count] = 1;
    count++;
  }
  return { ll, uv, info, tier, count };
}
