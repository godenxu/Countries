/* ============================================================
   surface labels — a glyph atlas drawn as tangent-plane quads so
   names sit ON the map and rotate/foreshorten with it
   ============================================================ */
const ATLAS_W = 2048, ATLAS_H = 1024, ATLAS_FONT = 34, ATLAS_ROW = 48;

function buildLabelAtlas(countries, meta, lang) {
  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  const g = cv.getContext('2d', { willReadFrequently: false });
  g.clearRect(0, 0, ATLAS_W, ATLAS_H);
  const font = `600 ${ATLAS_FONT}px -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif`;
  g.font = font;
  g.textBaseline = 'middle';
  g.textAlign = 'left';

  const rects = new Array(countries.length);
  let x = 4, y = 4;
  for (let i = 0; i < countries.length; i++) {
    const name = lang === 'zh' ? countries[i].zh : countries[i].en;
    const w = Math.ceil(g.measureText(name).width) + 16;
    if (x + w > ATLAS_W - 4) { x = 4; y += ATLAS_ROW; }
    if (y + ATLAS_ROW > ATLAS_H) break;
    // dark halo first so names stay readable over land and sea alike
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(2,7,12,0.92)';
    g.lineWidth = 4.5;
    g.strokeText(name, x + 8, y + ATLAS_ROW / 2);
    g.fillStyle = '#ffffff';
    g.fillText(name, x + 8, y + ATLAS_ROW / 2);
    rects[i] = [x / ATLAS_W, y / ATLAS_H, w / ATLAS_W, ATLAS_ROW / ATLAS_H, w / ATLAS_ROW];
    x += w + 8;
  }
  return { canvas: cv, rects };
}

function buildLabelInstances(countries, meta, atlas) {
  const n = meta.length;
  const ll = new Float32Array(n * 2);
  const uv = new Float32Array(n * 4);
  const info = new Float32Array(n * 4);
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
    count++;
  }
  return { ll, uv, info, count };
}
