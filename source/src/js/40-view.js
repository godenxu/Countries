/* ============================================================
   renderer + camera + pointer input
   ============================================================ */
const EE = { A1: 1.340264, A2: -0.081106, A3: 0.000893, A4: 0.003796, M: 0.866025404 };
function equalEarth(lon, lat) {
  const lo = lon * DEG, la = lat * DEG;
  const th = Math.asin(clamp(EE.M * Math.sin(la), -1, 1));
  const t2 = th * th, t6 = t2 * t2 * t2;
  const x = 3.464101615 * lo * Math.cos(th) / (3 * (9 * EE.A4 * t6 * t2 + 7 * EE.A3 * t6 + 3 * EE.A2 * t2 + EE.A1));
  const y = th * (EE.A1 + EE.A2 * t2 + EE.A3 * t6 + EE.A4 * t6 * t2);
  return [x, y];
}
function equalEarthInv(x, y) {
  let th = y;
  for (let i = 0; i < 14; i++) {
    const t2 = th * th, t6 = t2 * t2 * t2;
    const f = th * (EE.A1 + EE.A2 * t2 + EE.A3 * t6 + EE.A4 * t6 * t2) - y;
    const fp = EE.A1 + 3 * EE.A2 * t2 + 7 * EE.A3 * t6 + 9 * EE.A4 * t6 * t2;
    const d = f / fp; th -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  const s = Math.sin(th) / EE.M;
  if (Math.abs(s) > 1) return null;
  const lat = Math.asin(s) / DEG;
  const t2 = th * th, t6 = t2 * t2 * t2;
  const lon = x * 3 * (9 * EE.A4 * t6 * t2 + 7 * EE.A3 * t6 + 3 * EE.A2 * t2 + EE.A1) / (3.464101615 * Math.cos(th)) / DEG;
  if (Math.abs(lon) > 181) return null;
  return [lon, lat];
}
const v3 = {
  fromLL: (lon, lat) => { const a = lon * DEG, b = lat * DEG, c = Math.cos(b); return [c * Math.sin(a), Math.sin(b), c * Math.cos(a)]; },
  toLL: (v) => [Math.atan2(v[0], v[2]) / DEG, Math.asin(clamp(v[1], -1, 1)) / DEG],
  slerp: (a, b, t) => {
    let d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    const o = Math.acos(d);
    if (o < 1e-5) return a.slice();
    const s = Math.sin(o), w1 = Math.sin((1 - t) * o) / s, w2 = Math.sin(t * o) / s;
    return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
  },
};

const PLANE_SCALE = 0.74;
const FOV = 42 * DEG;
const LABEL_PX = 13;
const MAX_DYN = 6000;

class View {
  constructor(canvas, mesh, countries) {
    this.canvas = canvas;
    this.mesh = mesh;
    this.countries = countries;
    this.cam = { lon: 105, lat: 22, dist: 3.15, morph: 0 };
    this.vel = { lon: 0, lat: 0 };
    this.spin = true;
    this.spinIdle = 0;
    this.hover = -1;
    this.sel = -1;
    this.time = 0;
    this.anim = null;
    this.shift = { x: 0, y: 0 };
    this.nearK = 1.35; this.farK = 3.0;
    this.fx = {
      bloom: 1.05, clouds: 0.55, aurora: 0.9, sweep: true, grain: 0.016,
      aber: 0.0022, scan: 0.012, labels: true, atmo: 1.0,
    };
    this.build = 0;          // boot reveal 0 -> 1
    this.selLift = 0;        // selected country rises off the surface
    this.palMix = 0;         // region palette -> theme palette
    this.palMixTo = 0;
    this.flash = 0;
    this.ripples = [];
    this.arcs = null;
    this.initGL();
    this.bindInput();
  }

  /* ---------------- GL setup ---------------- */
  initGL() {
    const gl = this.canvas.getContext('webgl2', {
      antialias: true, alpha: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WEBGL2_UNAVAILABLE');
    this.gl = gl;

    this.pLand = program(gl, VS_MESH, FS_LAND, 'land');
    this.pOcean = program(gl, VS_MESH, FS_OCEAN, 'ocean');
    this.pCloud = program(gl, VS_MESH, FS_CLOUD, 'cloud');
    this.pAurora = program(gl, VS_MESH, FS_AURORA, 'aurora');
    this.pPick = program(gl, VS_MESH, FS_PICK, 'pick');
    this.pPickBg = program(gl, VS_MESH, FS_PICK_BG, 'pickbg');
    this.pLine = program(gl, VS_LINE, FS_LINE, 'line');
    this.pLabel = program(gl, VS_LABEL, FS_LABEL, 'label');
    this.pAtmo = program(gl, VS_ATMO, FS_ATMO, 'atmo');
    this.pStars = program(gl, VS_QUAD, FS_STARS, 'stars');
    this.pBright = program(gl, VS_QUAD, FS_BRIGHT, 'bright');
    this.pBlur = program(gl, VS_QUAD, FS_BLUR, 'blur');
    this.pComp = program(gl, VS_QUAD, FS_COMP, 'comp');

    const m = this.mesh;
    this.bFillPos = buffer(gl, m.fill.pos);
    this.bFillCid = buffer(gl, m.fill.cid);
    this.bFillIdx = buffer(gl, m.fill.idx, gl.ELEMENT_ARRAY_BUFFER);

    const STEP = 2;
    const cols = 360 / STEP + 1, rows = 180 / STEP + 1;
    const gp = new Float32Array(cols * rows * 2);
    const gi = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let k = 0, q = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { gp[k++] = -180 + c * STEP; gp[k++] = -90 + r * STEP; }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      gi[q++] = a; gi[q++] = d; gi[q++] = b; gi[q++] = b; gi[q++] = d; gi[q++] = e;
    }
    this.bGridPos = buffer(gl, gp);
    this.bGridIdx = buffer(gl, gi, gl.ELEMENT_ARRAY_BUFFER);
    this.gridCount = gi.length;

    this.bCorner = buffer(gl, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]));
    this.bQuad01 = buffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
    this.lines = {};
    for (const [name, src] of [['seg', m.seg], ['grat', m.grat], ['dash', m.dash]]) {
      this.lines[name] = { a: buffer(gl, src.a), b: buffer(gl, src.b), meta: src.meta ? buffer(gl, src.meta) : null, n: src.n };
    }
    // dynamic geometry: arcs, target rings, click ripples
    this.dyn = {
      a: new Float32Array(MAX_DYN * 2), b: new Float32Array(MAX_DYN * 2), meta: new Float32Array(MAX_DYN * 3),
      ba: gl.createBuffer(), bb: gl.createBuffer(), bm: gl.createBuffer(), n: 0,
    };
    for (const [buf, arr] of [[this.dyn.ba, this.dyn.a], [this.dyn.bb, this.dyn.b], [this.dyn.bm, this.dyn.meta]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr.byteLength, gl.DYNAMIC_DRAW);
    }
    this.bQuad = this.bQuad01;

    this.palTexA = this.makeTex(gl, buildPalette(m.meta, this.countries));
    this.palTexB = this.makeTex(gl, buildPalette(m.meta, this.countries));
    this.setupLabels();

    this.fboScene = makeFBO(gl, 2, 2, true);
    this.blm = [];
    for (let i = 0; i < 3; i++) this.blm.push({ a: makeFBO(gl, 2, 2, false), b: makeFBO(gl, 2, 2, false) });
    this.fboPick = makeFBO(gl, 2, 2, true);
    this.pickBuf = new Uint8Array(4);
    this.resize();
  }

  makeTex(gl, px) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  setupLabels() {
    const gl = this.gl;
    const atlas = buildLabelAtlas(this.countries, this.mesh.meta, LANG);
    const inst = buildLabelInstances(this.countries, this.mesh.meta, atlas);
    if (!this.atlasTex) {
      this.atlasTex = gl.createTexture();
      this.lbBuf = { ll: gl.createBuffer(), uv: gl.createBuffer(), info: gl.createBuffer(),
        tier: gl.createBuffer(), show: gl.createBuffer() };
    }
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    // no mipmaps: neighbouring glyph cells would bleed into each other at coarse levels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const upd = (buf, arr, dyn) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, arr, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); };
    upd(this.lbBuf.ll, inst.ll); upd(this.lbBuf.uv, inst.uv); upd(this.lbBuf.info, inst.info);
    upd(this.lbBuf.tier, inst.tier);
    this.labelShow = new Float32Array(inst.count).fill(1);
    upd(this.lbBuf.show, this.labelShow, true);
    this.labelCount = inst.count;
    this.labelSlotOfMeta = inst.slotOfMeta;
    this.labelNCountry = inst.nCountry;
    this.labelInfoArr = inst.info;
    this._occT = 0; this._occKey = '';
    this.dirty = true;
  }

  // Greedy screen-space collision avoidance for country labels, recomputed
  // only when the camera has moved meaningfully (cheap: <=237 candidates).
  // Bigger countries, the selected country and the hovered country always
  // win; smaller overlapping neighbours are suppressed rather than left to
  // pile up into unreadable clumps (Balkans, the Gulf, Central America...).
  updateLabelOcclusion(now) {
    if (!this.labelSlotOfMeta || now - this._occT < 160) return;
    const key = `${this.cam.lon.toFixed(1)}|${this.cam.lat.toFixed(1)}|${this.cam.dist.toFixed(3)}|${this.cam.morph.toFixed(2)}|${this.sel}|${this.hover}|${this.W}x${this.H}`;
    if (key === this._occKey) return;
    this._occT = now; this._occKey = key;

    const M = this._M || this.matrices();
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const morph = easeIO(clamp(this.cam.morph, 0, 1));
    const minArea = Math.max(120, 26000 * this.cam.dist * this.cam.dist * (1 + 0.9 * morph));
    const pxPerUnit = LABEL_PX * this.worldPerPixel();
    const meta = this.mesh.meta;
    const cands = [];
    for (let mi = 0; mi < meta.length; mi++) {
      const slot = this.labelSlotOfMeta[mi];
      if (slot < 0) continue;
      const m = meta[mi];
      const scale = this.labelInfoArr[slot * 4];
      const aspect = this.labelInfoArr[slot * 4 + 3];
      if (m.area < minArea * 0.6) continue;
      const sp = v3.fromLL(m.lon, m.lat);
      const pe = equalEarth(m.lon, m.lat);
      let d = Math.abs(((m.lon - this.cam.lon + 540) % 360) - 180) / 180;
      const t = smoothstep(clamp(morph * 1.42 - d * 0.42, 0, 1));
      const p = [lerp(sp[0], pe[0] * PLANE_SCALE, t), lerp(sp[1], pe[1] * PLANE_SCALE, t), lerp(sp[2], 0, t)];
      if (morph < 0.5) {
        const dot = sp[0] * M.eye[0] + sp[1] * M.eye[1] + sp[2] * M.eye[2];
        const eyeLen = Math.hypot(M.eye[0], M.eye[1], M.eye[2]) || 1;
        if (dot / eyeLen < 0.30) continue;
      }
      const cp = M4.mulVec(M.vp, [p[0], p[1], p[2], 1]);
      if (cp[3] <= 0) continue;
      const x = (cp[0] / cp[3] * 0.5 + 0.5) * W, y = (0.5 - cp[1] / cp[3] * 0.5) * H;
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const hh = pxPerUnit * scale, ww = hh * aspect;
      const pri = (mi === this.sel ? 2e12 : mi === this.hover ? 1e12 : 0) + m.area;
      cands.push({ mi, slot, x, y, w: ww, h: hh, pri });
    }
    cands.sort((a, b) => b.pri - a.pri);
    const placed = [];
    const show = this.labelShow;
    show.fill(0);
    for (const c of cands) {
      const l = c.x - c.w / 2, r = c.x + c.w / 2, t2 = c.y - c.h / 2, b = c.y + c.h / 2;
      let hit = false;
      for (const p of placed) {
        if (l < p.r && r > p.l && t2 < p.b && b > p.t) { hit = true; break; }
      }
      if (!hit) { placed.push({ l, r, t: t2, b }); show[c.slot] = 1; }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lbBuf.show);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, show, 0, this.labelNCountry);
  }

  setTheme(scaleFn) {
    const px = scaleFn
      ? buildThemePalette(this.mesh.meta, this.countries, true, scaleFn)
      : buildPalette(this.mesh.meta, this.countries);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.palTexB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    this.palMixTo = scaleFn ? 1 : 0;
    this.dirty = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.W && h === this.H) return;
    // a resize mid-flight (e.g. the on-screen keyboard opening/closing while a
    // search result is animating in) must never snap the camera — that reads
    // as a flash-cut. Only re-fit when the camera is idle.
    const settled = !this.anim && !this.morphAnim && !this.shiftAnim;
    const wasFit = settled && this.lastFit && Math.abs(this.cam.dist - this.lastFit) < this.lastFit * 0.06;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = w; this.canvas.height = h;
    this.fboScene.resize(w, h);
    for (let i = 0; i < 3; i++) {
      const s = 1 << (i + 1);
      this.blm[i].a.resize(Math.max(2, w / s | 0), Math.max(2, h / s | 0));
      this.blm[i].b.resize(Math.max(2, w / s | 0), Math.max(2, h / s | 0));
    }
    this.fboPick.resize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    const f = this.fitDist();
    if (wasFit) this.cam.dist = f;
    this.lastFit = f;
    this.dirty = true;
  }

  /* ---------------- camera ---------------- */
  camVectors() {
    const c = this.cam;
    const n = v3.fromLL(c.lon, c.lat);
    const gEye = [n[0] * c.dist, n[1] * c.dist, n[2] * c.dist];
    const pp = equalEarth(c.lon, c.lat);
    const pTgt = [pp[0] * PLANE_SCALE, pp[1] * PLANE_SCALE, 0];
    const m = easeIO(clamp(c.morph, 0, 1));
    const eye = [lerp(gEye[0], pTgt[0], m), lerp(gEye[1], pTgt[1], m), lerp(gEye[2], c.dist, m)];
    const tgt = [lerp(0, pTgt[0], m), lerp(0, pTgt[1], m), 0];
    return { eye, tgt, up: [0, 1, 0] };
  }

  matrices() {
    const { eye, tgt, up } = this.camVectors();
    const aspect = this.W / this.H;
    const near = Math.max(0.02, this.cam.dist - this.nearK);
    const proj = M4.persp(FOV, aspect, near, this.cam.dist + this.farK);
    proj[8] = this.shift.x; proj[9] = this.shift.y;
    const view = M4.lookAt(eye, tgt, up);
    const vp = M4.mul(proj, view);
    let f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1; f = f.map((v) => v / fl);
    let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1; r = r.map((v) => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { vp, eye, fwd: f, right: r, up: u, aspect };
  }

  screenToGeo(px, py) {
    const { eye, fwd, right, up, aspect } = this.matrices();
    const ndcx = (px / this.canvas.clientWidth) * 2 - 1 + this.shift.x;
    const ndcy = 1 - (py / this.canvas.clientHeight) * 2 + this.shift.y;
    const th = Math.tan(FOV / 2);
    const d = [
      fwd[0] + right[0] * ndcx * th * aspect + up[0] * ndcy * th,
      fwd[1] + right[1] * ndcx * th * aspect + up[1] * ndcy * th,
      fwd[2] + right[2] * ndcx * th * aspect + up[2] * ndcy * th,
    ];
    const dl = Math.hypot(d[0], d[1], d[2]); d[0] /= dl; d[1] /= dl; d[2] /= dl;
    if (this.cam.morph < 0.5) {
      const b = eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2];
      const cc = eye[0] * eye[0] + eye[1] * eye[1] + eye[2] * eye[2] - 1;
      const disc = b * b - cc;
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      return v3.toLL([eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t]);
    }
    if (Math.abs(d[2]) < 1e-6) return null;
    const t = -eye[2] / d[2];
    if (t < 0) return null;
    return equalEarthInv((eye[0] + d[0] * t) / PLANE_SCALE, (eye[1] + d[1] * t) / PLANE_SCALE);
  }

  worldPerPixel() { return 2 * this.cam.dist * Math.tan(FOV / 2) / this.canvas.clientHeight; }
  aspect() { return Math.max(0.2, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)); }
  fitGlobe() { return 1.2 / (Math.tan(FOV / 2) * Math.min(this.aspect(), 1)); }
  fitPlane() { const t = Math.tan(FOV / 2), a = this.aspect(); return Math.max(2.08 / (t * a), 1.12 / t); }
  fitDist() { return this.cam.morph > 0.5 ? this.fitPlane() : this.fitGlobe(); }

  // Distance that frames one country's full extent inside the *visible* map
  // area (visW/visH exclude whatever the detail panel currently covers), so
  // every country lands at a consistent, panel-safe zoom regardless of shape.
  fitCountryDist(rRad, visW, visH) {
    const t = Math.tan(FOV / 2);
    const visAspect = Math.max(0.15, visW / Math.max(1, visH));
    const k = Math.min(visAspect, 1);
    const margin = 1.55;
    if (this.cam.morph > 0.5) {
      const lin = rRad * PLANE_SCALE * 1.18 * margin;
      return clamp(lin / (t * k), 0.24, this.fitPlane() * 1.05);
    }
    const lin = Math.sin(Math.min(rRad, 1.4)) * margin;
    const d = 1 + lin / (t * k);
    return clamp(d, 1.06, this.fitGlobe() * 1.05);
  }

  flyTo(lon, lat, dist, ms) {
    const c = this.cam;
    const dl = ((lon - c.lon + 540) % 360) - 180;
    this.anim = { t0: performance.now(), ms: ms || 900, from: { lon: c.lon, lat: c.lat, dist: c.dist }, dl,
      to: { lat, dist: dist != null ? dist : c.dist } };
    this.spinIdle = performance.now() + 6000;
    this.dirty = true;
  }

  setMorph(target) {
    const before = this.fitDist();
    this.morphAnim = { t0: performance.now(), ms: 1250, from: this.cam.morph, to: target };
    const wasMap = this.cam.morph > 0.5;
    if (wasMap !== (target > 0.5)) {
      const after = target > 0.5 ? this.fitPlane() : this.fitGlobe();
      this.cam.dist = clamp(this.cam.dist * (after / before), target > 0.5 ? 0.24 : 1.16, after * 1.35);
    }
    this.dirty = true;
  }

  setShift(x, y) {
    if (Math.abs(x - this.shift.x) < 1e-4 && Math.abs(y - this.shift.y) < 1e-4) return;
    this.shiftAnim = { t0: performance.now(), ms: 380, fx: this.shift.x, fy: this.shift.y, tx: x, ty: y };
    this.dirty = true;
  }

  /* ---------------- input ---------------- */
  bindInput() {
    const cv = this.canvas;
    const pts = new Map();
    let last = null, pinch = null, moved = 0, downT = 0, downPos = null;
    const onDown = (e) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        last = { x: e.clientX, y: e.clientY, t: performance.now() };
        downPos = { x: e.clientX, y: e.clientY }; downT = performance.now(); moved = 0;
        this.vel.lon = this.vel.lat = 0;
        cv.classList.add('dragging');
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.cam.dist };
      }
      this.spinIdle = performance.now() + 4000;
    };
    const onMove = (e) => {
      const rect = cv.getBoundingClientRect();
      if (!pts.has(e.pointerId)) { this.onHover && this.onHover(e.clientX - rect.left, e.clientY - rect.top); return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 5) this.zoomTo(pinch.dist * (pinch.d / d), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, true);
        return;
      }
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.drag(dx, dy);
      this.spinIdle = performance.now() + 4000;
    };
    const onUp = () => {
      pts.clear(); pinch = null;
      cv.classList.remove('dragging');
      last = null;
      const rect = cv.getBoundingClientRect();
      if (moved < 8 && performance.now() - downT < 500 && downPos) {
        this.onClick && this.onClick(downPos.x - rect.left, downPos.y - rect.top);
      }
      this.spinIdle = performance.now() + 5000;
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { this.hover = -1; this.onHoverOut && this.onHoverOut(); this.dirty = true; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const k = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
      this.zoomTo(this.cam.dist * k, e.clientX - rect.left, e.clientY - rect.top, true);
      this.spinIdle = performance.now() + 4000;
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => {
      const rect = cv.getBoundingClientRect();
      this.zoomTo(this.cam.dist * 0.62, e.clientX - rect.left, e.clientY - rect.top, true);
    });
  }

  drag(dx, dy) {
    const c = this.cam;
    if (c.morph > 0.5) {
      const wpp = this.worldPerPixel();
      const pp = equalEarth(c.lon, c.lat);
      const g = equalEarthInv(pp[0] - dx * wpp / PLANE_SCALE, clamp(pp[1] + dy * wpp / PLANE_SCALE, -1.32, 1.32));
      if (g) { c.lon = g[0]; c.lat = clamp(g[1], -88, 88); }
    } else {
      const wpp = this.worldPerPixel() / DEG;
      const cosl = Math.max(0.28, Math.cos(c.lat * DEG));
      const dlon = -dx * wpp / cosl, dlat = dy * wpp;
      c.lon += dlon; c.lat = clamp(c.lat + dlat, -89, 89);
      this.vel.lon = dlon; this.vel.lat = dlat;
    }
    c.lon = ((c.lon + 540) % 360) - 180;
    this.dirty = true;
  }

  zoomTo(newDist, px, py, keepPoint) {
    const c = this.cam;
    const before = keepPoint ? this.screenToGeo(px, py) : null;
    c.dist = clamp(newDist, c.morph > 0.5 ? 0.24 : 1.16, this.fitDist() * 1.35);
    if (before) {
      const after = this.screenToGeo(px, py);
      if (after) {
        const dl = ((before[0] - after[0] + 540) % 360) - 180;
        c.lon = ((c.lon + dl + 540) % 360) - 180;
        c.lat = clamp(c.lat + (before[1] - after[1]), -89, 89);
      }
    }
    this.dirty = true;
  }

  addRipple(lon, lat) {
    this.ripples.push({ lon, lat, t0: performance.now() });
    if (this.ripples.length > 4) this.ripples.shift();
    this.flash = 0.09;
  }

  setArcs(fromIdx, toIdxs) {
    if (fromIdx < 0 || !toIdxs || !toIdxs.length) { this.arcs = null; return; }
    const M = this.mesh.meta, a = M[fromIdx];
    const segs = [];
    for (const j of toIdxs) {
      const b = M[j];
      if (!b) continue;
      const va = v3.fromLL(a.lon, a.lat), vb = v3.fromLL(b.lon, b.lat);
      const ang = Math.acos(clamp(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], -1, 1));
      const N = Math.max(10, Math.round(ang * 26));
      const hgt = 0.045 + ang * 0.16;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = v3.toLL(v3.slerp(va, vb, t));
        const e = 0.006 + Math.sin(t * Math.PI) * hgt;
        if (prev && Math.abs(prev[0] - p[0]) < 180) segs.push([prev[0], prev[1], p[0], p[1], prev[2], e, t]);
        prev = [p[0], p[1], e];
      }
    }
    this.arcs = segs;
    this.dirty = true;
  }

  /* ---------------- picking ---------------- */
  pickAt(px, py) {
    const gl = this.gl;
    const x = Math.round(px * this.dpr * 0.5), y = Math.round((this.canvas.clientHeight - py) * this.dpr * 0.5);
    if (x < 0 || y < 0 || x >= this.fboPick.w || y >= this.fboPick.h) return -1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPick.fb);
    gl.viewport(0, 0, this.fboPick.w, this.fboPick.h);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const M = this.matrices();
    // occlude with the ocean shell first: without this, clicking empty ocean
    // on the near side can "see through" the globe and pick a country on the far side
    this.drawMesh(this.pPickBg, M, 0, false);
    this.drawMesh(this.pPick, M, 0.0016, true);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pickBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const id = this.pickBuf[0] + (this.pickBuf[1] << 8) - 1;
    return id >= 0 && id < this.mesh.meta.length ? id : -1;
  }

  /* ---------------- drawing ---------------- */
  setCommon(p, M) {
    const gl = this.gl;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, M.vp);
    gl.uniform1f(p.u.uMorph, easeIO(clamp(this.cam.morph, 0, 1)));
    gl.uniform1f(p.u.uCenterLon, this.cam.lon);
    gl.uniform1f(p.u.uPlaneScale, PLANE_SCALE);
    gl.uniform3fv(p.u.uSun, this.sun);
    gl.uniform3fv(p.u.uEye, M.eye);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform1f(p.u.uSel, this.sel);
    gl.uniform1f(p.u.uSelLift, this.selLift);
    gl.uniform1f(p.u.uBuild, this.build);
    gl.uniform1f(p.u.uSweep, this.sweep);
    gl.uniform1f(p.u.uNight, this.nightScale);
  }

  drawMesh(p, M, elev, isLand) {
    const gl = this.gl;
    this.setCommon(p, M);
    gl.uniform1f(p.u.uElev, elev);
    if (isLand) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bFillPos);
      gl.enableVertexAttribArray(p.a.aLL);
      gl.vertexAttribPointer(p.a.aLL, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(p.a.aLL, 0);
      if (p.a.aCid >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bFillCid);
        gl.enableVertexAttribArray(p.a.aCid);
        gl.vertexAttribPointer(p.a.aCid, 1, gl.UNSIGNED_SHORT, false, 0, 0);
        gl.vertexAttribDivisor(p.a.aCid, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bFillIdx);
      gl.drawElements(gl.TRIANGLES, this.mesh.fill.count, gl.UNSIGNED_INT, 0);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bGridPos);
      gl.enableVertexAttribArray(p.a.aLL);
      gl.vertexAttribPointer(p.a.aLL, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(p.a.aLL, 0);
      if (p.a.aCid >= 0) { gl.disableVertexAttribArray(p.a.aCid); gl.vertexAttrib1f(p.a.aCid, 0); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bGridIdx);
      gl.drawElements(gl.TRIANGLES, this.gridCount, gl.UNSIGNED_INT, 0);
    }
  }

  bindLine(p, bufA, bufB, bufM) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bCorner);
    gl.enableVertexAttribArray(p.a.aCorner);
    gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aCorner, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufA);
    gl.enableVertexAttribArray(p.a.aA);
    gl.vertexAttribPointer(p.a.aA, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aA, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
    gl.enableVertexAttribArray(p.a.aB);
    gl.vertexAttribPointer(p.a.aB, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aB, 1);
    if (bufM) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufM);
      gl.enableVertexAttribArray(p.a.aMeta);
      gl.vertexAttribPointer(p.a.aMeta, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(p.a.aMeta, 1);
    } else {
      gl.disableVertexAttribArray(p.a.aMeta);
      gl.vertexAttrib3f(p.a.aMeta, 0, -1, -1);
    }
  }

  drawLines(set, M, opt) {
    const gl = this.gl, p = this.pLine, L = this.lines[set];
    if (!L.n) return;
    this.setCommon(p, M);
    gl.uniform1f(p.u.uElev, opt.elev);
    gl.uniform1f(p.u.uWidth, opt.width * this.dpr);
    gl.uniform2f(p.u.uRes, this.W, this.H);
    gl.uniform1i(p.u.uMode, opt.mode);
    gl.uniform1f(p.u.uFlow, this.time * 0.35 % 1);
    gl.uniform4fv(p.u.uColor, opt.color);
    this.bindLine(p, L.a, L.b, L.meta);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.n);
  }

  drawDyn(M, segs, opt) {
    if (!segs || !segs.length) return;
    const gl = this.gl, p = this.pLine, d = this.dyn;
    const n = Math.min(segs.length, MAX_DYN);
    for (let i = 0; i < n; i++) {
      const s = segs[i];
      d.a[i * 2] = s[0]; d.a[i * 2 + 1] = s[1];
      d.b[i * 2] = s[2]; d.b[i * 2 + 1] = s[3];
      d.meta[i * 3] = s[4]; d.meta[i * 3 + 1] = s[5]; d.meta[i * 3 + 2] = s[6];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, d.ba); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.a, 0, n * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, d.bb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.b, 0, n * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, d.bm); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.meta, 0, n * 3);
    this.setCommon(p, M);
    gl.uniform1f(p.u.uElev, opt.elev || 0.006);
    gl.uniform1f(p.u.uWidth, opt.width * this.dpr);
    gl.uniform2f(p.u.uRes, this.W, this.H);
    gl.uniform1i(p.u.uMode, opt.mode);
    gl.uniform1f(p.u.uFlow, (this.time * 0.32) % 1);
    gl.uniform4fv(p.u.uColor, opt.color);
    this.bindLine(p, d.ba, d.bb, d.bm);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }

  ringSegs(lon, lat, radDeg, elev, dash) {
    const c = v3.fromLL(lon, lat);
    let ref = Math.abs(c[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let e0 = [ref[1] * c[2] - ref[2] * c[1], ref[2] * c[0] - ref[0] * c[2], ref[0] * c[1] - ref[1] * c[0]];
    const l0 = Math.hypot(e0[0], e0[1], e0[2]) || 1; e0 = e0.map((v) => v / l0);
    const e1 = [c[1] * e0[2] - c[2] * e0[1], c[2] * e0[0] - c[0] * e0[2], c[0] * e0[1] - c[1] * e0[0]];
    const r = radDeg * DEG, ca = Math.cos(r), sa = Math.sin(r);
    const N = 96, out = [];
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2;
      const p = v3.toLL([
        c[0] * ca + (e0[0] * Math.cos(a) + e1[0] * Math.sin(a)) * sa,
        c[1] * ca + (e0[1] * Math.cos(a) + e1[1] * Math.sin(a)) * sa,
        c[2] * ca + (e0[2] * Math.cos(a) + e1[2] * Math.sin(a)) * sa]);
      if (prev && Math.abs(prev[0] - p[0]) < 180 && (!dash || (i & 3) < 2)) {
        out.push([prev[0], prev[1], p[0], p[1], elev, elev, i / N]);
      }
      prev = p;
    }
    return out;
  }

  drawLabels(M) {
    if (!this.fx.labels || !this.labelCount) return;
    const gl = this.gl, p = this.pLabel;
    this.setCommon(p, M);
    gl.uniform1f(p.u.uHover, this.hover);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(p.u.uAtlas, 0);
    gl.uniform1f(p.u.uPix, LABEL_PX * this.worldPerPixel());
    gl.uniform1f(p.u.uMinArea, Math.max(120, 26000 * this.cam.dist * this.cam.dist * (1 + 0.9 * easeIO(clamp(this.cam.morph, 0, 1)))));
    gl.uniform1f(p.u.uFade, clamp((this.build - 0.55) * 3, 0, 1));
    // cities fade in as a group once the view is roughly "one country" wide,
    // independent of each city's own (fixed, small) label footprint
    const cityFade = this.cam.morph > 0.5
      ? clamp((1.05 - this.cam.dist) / 0.55, 0, 1)
      : clamp((3.0 - this.cam.dist) / 1.0, 0, 1);
    gl.uniform1f(p.u.uCityFade, this.fx.cities === false ? 0 : cityFade);
    // city text scales with the camera like real map geometry (Google-Maps
    // style zoom growth), unlike country labels which hold a steady legible
    // screen size; the reference distance differs per mode since globe and
    // map dist ranges aren't comparable
    const refDist = this.cam.morph > 0.5 ? 0.65 : 2.0;
    gl.uniform1f(p.u.uCityZoom, clamp(refDist / Math.max(this.cam.dist, 0.05), 0.6, 3.2));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad01);
    gl.enableVertexAttribArray(p.a.aCorner);
    gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aCorner, 0);
    const bind = (loc, buf, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
    };
    bind(p.a.aLL, this.lbBuf.ll, 2);
    bind(p.a.aUV, this.lbBuf.uv, 4);
    bind(p.a.aInfo, this.lbBuf.info, 4);
    bind(p.a.aTier, this.lbBuf.tier, 1);
    bind(p.a.aShow, this.lbBuf.show, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.labelCount);
    gl.vertexAttribDivisor(p.a.aLL, 0); gl.vertexAttribDivisor(p.a.aUV, 0); gl.vertexAttribDivisor(p.a.aInfo, 0);
  }

  fullscreenPass(p, setup) {
    const gl = this.gl;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad01);
    gl.enableVertexAttribArray(p.a.aCorner);
    gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aCorner, 0);
    setup && setup(p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(now) {
    const gl = this.gl;
    this.time = now / 1000;
    this.sun = sunDirection();
    this.sweep = this.fx.sweep ? ((this.time * 26) % 360) - 180 : 9999;
    // keep procedural cells around 9 CSS px so they never degenerate into static
    this.nightScale = clamp(DEG / (this.worldPerPixel() * 9), 2.5, 90);
    const M = this.matrices();
    this._M = M;
    const morph = easeIO(clamp(this.cam.morph, 0, 1));
    if (this.fx.labels) this.updateLabelOcclusion(now);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0.012, 0.020, 0.040, 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    this.fullscreenPass(this.pStars, (p) => {
      gl.uniform3fv(p.u.uFwd, M.fwd); gl.uniform3fv(p.u.uRight, M.right); gl.uniform3fv(p.u.uUp, M.up);
      gl.uniform1f(p.u.uTanHalf, Math.tan(FOV / 2));
      gl.uniform1f(p.u.uAspect, M.aspect);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform2f(p.u.uRes, this.W, this.H);
    });

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    this.drawMesh(this.pOcean, M, 0, false);
    gl.useProgram(this.pLand);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.palTexA);
    gl.uniform1i(this.pLand.u.uPal, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.palTexB);
    gl.uniform1i(this.pLand.u.uPalB, 1);
    gl.uniform1f(this.pLand.u.uPalMix, this.palMix);
    gl.uniform1f(this.pLand.u.uHover, this.hover);
    this.drawMesh(this.pLand, M, 0.0016, true);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const zoomK = clamp((3.4 - this.cam.dist) / 2.2, 0, 1);
    this.drawLines('grat', M, { elev: 0.0008, width: 1.0, mode: 1, color: [0.27, 0.88, 0.72, 0.09] });
    this.drawLines('seg', M, { elev: 0.0034, width: 1.0 + zoomK * 0.8, mode: 0, color: [0.58, 0.95, 0.88, 0.45 + zoomK * 0.30] });
    this.drawLines('dash', M, { elev: 0.0042, width: 1.8, mode: 2, color: [0.96, 0.73, 0.34, 0.8] });
    if (this.sel >= 0) {
      this.drawLines('seg', M, { elev: 0.0054, width: 3.6, mode: 3, color: [0.99, 0.78, 0.38, 0.95] });
    }

    // clouds (shader outputs premultiplied colour)
    if (this.fx.clouds > 0.01 && morph < 0.98) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.pCloud);
      gl.uniform1f(this.pCloud.u.uCloudAmt, this.fx.clouds * this.build);
      this.drawMesh(this.pCloud, M, 0.014, false);
    }

    // additive layers
    gl.blendFunc(gl.ONE, gl.ONE);
    if (this.fx.aurora > 0.01 && morph < 0.9) {
      gl.useProgram(this.pAurora);
      gl.uniform1f(this.pAurora.u.uAurora, this.fx.aurora * this.build);
      this.drawMesh(this.pAurora, M, 0.035, false);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (this.arcs) this.drawDyn(M, this.arcs, { mode: 4, width: 2.6, color: [0.99, 0.80, 0.42, 0.95] });
    if (this.sel >= 0) {
      const m = this.mesh.meta[this.sel];
      const rr = Math.max(3, m.r / DEG * 1.5);
      const pulse = 1 + 0.045 * Math.sin(this.time * 2.2);
      this.drawDyn(M, this.ringSegs(m.lon, m.lat, rr * pulse, 0.008 + this.selLift, true),
        { mode: 5, width: 1.8, color: [0.99, 0.78, 0.38, 0.55] });
    }
    for (const r of this.ripples) {
      const age = (now - r.t0) / 1100;
      if (age > 1) continue;
      this.drawDyn(M, this.ringSegs(r.lon, r.lat, 2 + age * 26, 0.007, false),
        { mode: 5, width: 2.4 * (1 - age), color: [0.42, 0.98, 0.86, 0.85 * (1 - age)] });
    }
    this.ripples = this.ripples.filter((r) => now - r.t0 < 1100);

    // atmosphere: tight inner rim + wide outer halo
    gl.disable(gl.DEPTH_TEST);
    const atmo = (r, pow, gain) => {
      const pa = this.pAtmo;
      gl.useProgram(pa);
      gl.uniformMatrix4fv(pa.u.uVP, false, M.vp);
      gl.uniform1f(pa.u.uR, r);
      gl.uniform1f(pa.u.uPow, pow);
      gl.uniform1f(pa.u.uGain, gain * this.fx.atmo);
      gl.uniform1f(pa.u.uFade, (1 - morph) * this.build);
      gl.uniform3fv(pa.u.uEye, M.eye);
      gl.uniform3fv(pa.u.uSun, this.sun);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bGridPos);
      gl.enableVertexAttribArray(pa.a.aLL);
      gl.vertexAttribPointer(pa.a.aLL, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(pa.a.aLL, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bGridIdx);
      gl.drawElements(gl.TRIANGLES, this.gridCount, gl.UNSIGNED_INT, 0);
    };
    atmo(1.022, 7.0, 1.35);
    atmo(1.16, 3.4, 0.62);

    gl.disable(gl.BLEND);
    this.postProcess(M);
  }

  postProcess() {
    const gl = this.gl;
    let src = this.fboScene.tex;
    for (let i = 0; i < 3; i++) {
      const L = this.blm[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.b.fb);
      gl.viewport(0, 0, L.b.w, L.b.h);
      if (i === 0) {
        this.fullscreenPass(this.pBright, (p) => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
          gl.uniform1i(p.u.uTex, 0); gl.uniform1f(p.u.uThresh, 0.52);
        });
      } else {
        this.fullscreenPass(this.pBlur, (p) => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
          gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uDir, 1 / L.b.w, 0);
        });
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.a.fb);
      this.fullscreenPass(this.pBlur, (p) => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.b.tex);
        gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uDir, 0, 1 / L.b.h);
      });
      if (i === 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, L.b.fb);
        this.fullscreenPass(this.pBlur, (p) => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.a.tex);
          gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uDir, 1 / L.b.w, 0);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, L.a.fb);
        this.fullscreenPass(this.pBlur, (p) => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.b.tex);
          gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uDir, 0, 1 / L.b.h);
        });
      }
      src = L.a.tex;
    }
    // place names go in after the bloom source is captured, so type stays crisp
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawLabels(this._M);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    this.fullscreenPass(this.pComp, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fboScene.tex); gl.uniform1i(p.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.blm[0].a.tex); gl.uniform1i(p.u.uB1, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.blm[1].a.tex); gl.uniform1i(p.u.uB2, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.blm[2].a.tex); gl.uniform1i(p.u.uB3, 3);
      gl.uniform1f(p.u.uBloomAmt, this.fx.bloom);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform1f(p.u.uAber, this.fx.aber);
      gl.uniform1f(p.u.uGrain, this.fx.grain);
      gl.uniform1f(p.u.uScan, this.fx.scan);
      gl.uniform1f(p.u.uFlash, this.flash);
      gl.uniform2f(p.u.uRes, this.W, this.H);
    });
  }

  step(now) {
    const c = this.cam;
    let moving = false;
    if (this.build < 1) {
      if (!this.buildT0) this.buildT0 = now;
      this.build = clamp((now - this.buildT0) / 1600, 0, 1);   // wall-clock, so slow devices still reveal
      moving = true;
    }
    this.flash *= 0.86;
    if (this.ripples.length) moving = true;
    const wantLift = this.sel >= 0 ? 0.022 : 0;
    if (Math.abs(this.selLift - wantLift) > 0.0002) { this.selLift = lerp(this.selLift, wantLift, 0.12); moving = true; }
    if (Math.abs(this.palMix - this.palMixTo) > 0.002) { this.palMix = lerp(this.palMix, this.palMixTo, 0.09); moving = true; }
    if (this.shiftAnim) {
      const a = this.shiftAnim;
      const t = clamp((now - a.t0) / a.ms, 0, 1), e = easeIO(t);
      this.shift.x = lerp(a.fx, a.tx, e); this.shift.y = lerp(a.fy, a.ty, e);
      if (t >= 1) this.shiftAnim = null;
      moving = true;
    }
    if (this.morphAnim) {
      const a = this.morphAnim;
      const t = clamp((now - a.t0) / a.ms, 0, 1);
      c.morph = lerp(a.from, a.to, easeIO(t));
      if (t >= 1) this.morphAnim = null;
      moving = true;
    }
    if (this.anim) {
      const a = this.anim;
      const t = clamp((now - a.t0) / a.ms, 0, 1), e = easeIO(t);
      c.lon = ((a.from.lon + a.dl * e + 540) % 360) - 180;
      c.lat = lerp(a.from.lat, a.to.lat, e);
      c.dist = lerp(a.from.dist, a.to.dist, e);
      if (t >= 1) this.anim = null;
      moving = true;
    } else if (Math.abs(this.vel.lon) > 0.001 || Math.abs(this.vel.lat) > 0.001) {
      c.lon = ((c.lon + this.vel.lon + 540) % 360) - 180;
      c.lat = clamp(c.lat + this.vel.lat, -89, 89);
      this.vel.lon *= 0.94; this.vel.lat *= 0.94;
      moving = true;
    }
    if (this.spin && this.sel < 0 && now > this.spinIdle && !this.anim && c.morph < 0.02) {
      c.lon = ((c.lon + 0.035 + 540) % 360) - 180;
      moving = true;
    }
    return moving;
  }
}
