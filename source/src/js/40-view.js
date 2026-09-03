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

const PLANE_SCALE = 0.74;
const FOV = 42 * DEG;

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
    this.dirty = true;
    this.pickPending = null;
    this.shift = { x: 0, y: 0 };
    this.nearK = 1.35; this.farK = 3.0;
    this.quality = 1;          // 1 = full, 0.5 = no bloom + lower dpr
    this.frameAcc = []; 
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
    this.pPick = program(gl, VS_MESH, FS_PICK, 'pick');
    this.pLine = program(gl, VS_LINE, FS_LINE, 'line');
    this.pAtmo = program(gl, VS_ATMO, FS_ATMO, 'atmo');
    this.pStars = program(gl, VS_QUAD, FS_STARS, 'stars');
    this.pBright = program(gl, VS_QUAD, FS_BRIGHT, 'bright');
    this.pBlur = program(gl, VS_QUAD, FS_BLUR, 'blur');
    this.pComp = program(gl, VS_QUAD, FS_COMP, 'comp');

    const m = this.mesh;
    this.bFillPos = buffer(gl, m.fill.pos);
    this.bFillCid = buffer(gl, m.fill.cid);
    this.bFillIdx = buffer(gl, m.fill.idx, gl.ELEMENT_ARRAY_BUFFER);

    // lon/lat sphere grid, reused for ocean and atmosphere
    const STEP = 3;
    const cols = 360 / STEP + 1, rows = 180 / STEP + 1;
    const gp = new Float32Array(cols * rows * 2);
    const gi = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let k = 0, q = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      gp[k++] = -180 + c * STEP; gp[k++] = -90 + r * STEP;
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      gi[q++] = a; gi[q++] = d; gi[q++] = b; gi[q++] = b; gi[q++] = d; gi[q++] = e;
    }
    this.bGridPos = buffer(gl, gp);
    this.bGridIdx = buffer(gl, gi, gl.ELEMENT_ARRAY_BUFFER);
    this.gridCount = gi.length;

    this.bCorner = buffer(gl, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]));
    this.lines = {};
    for (const [name, src] of [['seg', m.seg], ['grat', m.grat], ['dash', m.dash]]) {
      this.lines[name] = {
        a: buffer(gl, src.a), b: buffer(gl, src.b),
        meta: src.meta ? buffer(gl, src.meta) : null, n: src.n,
      };
    }
    this.bQuad = buffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));

    this.palTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      buildPalette(m.meta, this.countries));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.fboScene = makeFBO(gl, 2, 2, true);
    this.fboA = makeFBO(gl, 2, 2, false);
    this.fboB = makeFBO(gl, 2, 2, false);
    this.fboPick = makeFBO(gl, 2, 2, true);
    this.pickBuf = new Uint8Array(4);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality < 1 ? 1 : 2);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.W && h === this.H) return;
    // a viewport change (rotate, fold/unfold) re-fits the view when it was already fitted
    const wasFit = this.lastFit && Math.abs(this.cam.dist - this.lastFit) < this.lastFit * 0.06;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = w; this.canvas.height = h;
    this.fboScene.resize(w, h);
    this.fboA.resize(w >> 1, h >> 1);
    this.fboB.resize(w >> 1, h >> 1);
    this.fboPick.resize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    const f = this.fitDist();
    if (wasFit) this.cam.dist = f;
    this.lastFit = f;
    this.dirty = true;
  }

  /* ---------------- camera ---------------- */
  camVectors() {
    const c = this.cam;
    const la = c.lat * DEG, lo = c.lon * DEG;
    const n = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    const gEye = [n[0] * c.dist, n[1] * c.dist, n[2] * c.dist];
    const gTgt = [0, 0, 0];
    const pp = equalEarth(c.lon, c.lat);
    const pTgt = [pp[0] * PLANE_SCALE, pp[1] * PLANE_SCALE, 0];
    const pEye = [pTgt[0], pTgt[1], c.dist];
    const m = easeIO(clamp(c.morph, 0, 1));
    const eye = [lerp(gEye[0], pEye[0], m), lerp(gEye[1], pEye[1], m), lerp(gEye[2], pEye[2], m)];
    const tgt = [lerp(gTgt[0], pTgt[0], m), lerp(gTgt[1], pTgt[1], m), lerp(gTgt[2], pTgt[2], m)];
    return { eye, tgt, up: [0, 1, 0] };
  }

  matrices() {
    const { eye, tgt, up } = this.camVectors();
    const aspect = this.W / this.H;
    // tight depth range: everything sits within ~1.2 units of the target
    const near = Math.max(0.02, this.cam.dist - this.nearK);
    const proj = M4.persp(FOV, aspect, near, this.cam.dist + this.farK);
    proj[8] = this.shift.x; proj[9] = this.shift.y;
    const view = M4.lookAt(eye, tgt, up);
    const vp = M4.mul(proj, view);
    // camera basis for the star background
    let f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]); f = f.map((v) => v / fl);
    let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1; r = r.map((v) => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { vp, eye, fwd: f, right: r, up: u, aspect };
  }

  screenToGeo(px, py) {
    const { eye, fwd, right, up, aspect } = this.matrices();
    const ndcx = (px / this.canvas.clientWidth) * 2 - 1;
    const ndcy = 1 - (py / this.canvas.clientHeight) * 2;
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
      const p = [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t];
      return [Math.atan2(p[0], p[2]) / DEG, Math.asin(clamp(p[1], -1, 1)) / DEG];
    }
    if (Math.abs(d[2]) < 1e-6) return null;
    const t = -eye[2] / d[2];
    if (t < 0) return null;
    return equalEarthInv((eye[0] + d[0] * t) / PLANE_SCALE, (eye[1] + d[1] * t) / PLANE_SCALE);
  }

  worldPerPixel() { return 2 * this.cam.dist * Math.tan(FOV / 2) / this.canvas.clientHeight; }

  aspect() { return Math.max(0.2, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)); }

  // distance at which the whole globe / whole map just fits the viewport
  fitGlobe() {
    const t = Math.tan(FOV / 2);
    return 1.2 / (t * Math.min(this.aspect(), 1));
  }
  fitPlane() {
    const t = Math.tan(FOV / 2), a = this.aspect();
    return Math.max(2.08 / (t * a), 1.12 / t);
  }
  fitDist() { return this.cam.morph > 0.5 ? this.fitPlane() : this.fitGlobe(); }

  flyTo(lon, lat, dist, ms) {
    const c = this.cam;
    let dl = ((lon - c.lon + 540) % 360) - 180;
    this.anim = {
      t0: performance.now(), ms: ms || 820,
      from: { lon: c.lon, lat: c.lat, dist: c.dist }, dl,
      to: { lat, dist: dist != null ? dist : c.dist },
    };
    this.spinIdle = performance.now() + 6000;
    this.dirty = true;
  }

  setMorph(target) {
    // carry the apparent zoom across the projection change
    const before = this.fitDist();
    this.morphAnim = { t0: performance.now(), ms: 1150, from: this.cam.morph, to: target };
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
      if (!pts.has(e.pointerId)) { this.onHover(e.clientX - rect.left, e.clientY - rect.top); return; }
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
    const onUp = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        cv.classList.remove('dragging');
        last = null;
        const rect = cv.getBoundingClientRect();
        if (moved < 8 && performance.now() - downT < 500 && downPos) {
          this.onClick(downPos.x - rect.left, downPos.y - rect.top);
        }
        this.spinIdle = performance.now() + 5000;
      }
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
      const nx = pp[0] - dx * wpp / PLANE_SCALE;
      const ny = pp[1] + dy * wpp / PLANE_SCALE;
      const g = equalEarthInv(nx, clamp(ny, -1.32, 1.32));
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
        let dl = ((before[0] - after[0] + 540) % 360) - 180;
        c.lon = ((c.lon + dl + 540) % 360) - 180;
        c.lat = clamp(c.lat + (before[1] - after[1]), -89, 89);
      }
    }
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
    this.drawMesh(this.pPick, M, 0.0015, true);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pickBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const id = this.pickBuf[0] + (this.pickBuf[1] << 8) - 1;
    return id >= 0 && id < this.mesh.meta.length ? id : -1;
  }

  /* ---------------- drawing ---------------- */
  setCommon(p, M, extra) {
    const gl = this.gl;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, M.vp);
    gl.uniform1f(p.u.uMorph, easeIO(clamp(this.cam.morph, 0, 1)));
    gl.uniform1f(p.u.uCenterLon, this.cam.lon);
    gl.uniform1f(p.u.uPlaneScale, PLANE_SCALE);
    gl.uniform3fv(p.u.uSun, this.sun);
    gl.uniform3fv(p.u.uEye, M.eye);
    gl.uniform1f(p.u.uTime, this.time);
  }

  drawMesh(p, M, elev, isLand) {
    const gl = this.gl;
    this.setCommon(p, M);
    gl.uniform1f(p.u.uElev, elev);
    if (isLand) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bFillPos);
      gl.enableVertexAttribArray(p.a.aLL);
      gl.vertexAttribPointer(p.a.aLL, 2, gl.FLOAT, false, 0, 0);
      if (p.a.aCid >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bFillCid);
        gl.enableVertexAttribArray(p.a.aCid);
        gl.vertexAttribPointer(p.a.aCid, 1, gl.UNSIGNED_SHORT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bFillIdx);
      gl.drawElements(gl.TRIANGLES, this.mesh.fill.count, gl.UNSIGNED_INT, 0);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bGridPos);
      gl.enableVertexAttribArray(p.a.aLL);
      gl.vertexAttribPointer(p.a.aLL, 2, gl.FLOAT, false, 0, 0);
      if (p.a.aCid >= 0) { gl.disableVertexAttribArray(p.a.aCid); gl.vertexAttrib1f(p.a.aCid, 0); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bGridIdx);
      gl.drawElements(gl.TRIANGLES, this.gridCount, gl.UNSIGNED_INT, 0);
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
    gl.uniform1f(p.u.uSel, this.sel);
    gl.uniform4fv(p.u.uColor, opt.color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bCorner);
    gl.enableVertexAttribArray(p.a.aCorner);
    gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aCorner, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, L.a);
    gl.enableVertexAttribArray(p.a.aA);
    gl.vertexAttribPointer(p.a.aA, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aA, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, L.b);
    gl.enableVertexAttribArray(p.a.aB);
    gl.vertexAttribPointer(p.a.aB, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aB, 1);
    if (L.meta) {
      gl.bindBuffer(gl.ARRAY_BUFFER, L.meta);
      gl.enableVertexAttribArray(p.a.aMeta);
      gl.vertexAttribPointer(p.a.aMeta, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(p.a.aMeta, 1);
    } else {
      gl.disableVertexAttribArray(p.a.aMeta);
      gl.vertexAttrib3f(p.a.aMeta, 0, -1, -1);
    }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.n);
    gl.vertexAttribDivisor(p.a.aA, 0);
    gl.vertexAttribDivisor(p.a.aB, 0);
    if (L.meta) gl.vertexAttribDivisor(p.a.aMeta, 0);
  }

  fullscreenPass(p, setup) {
    const gl = this.gl;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bQuad);
    gl.enableVertexAttribArray(p.a.aCorner);
    gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aCorner, 0);
    setup && setup(p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // step the render resolution down on devices that cannot keep up
  measure(now) {
    if (this.lastFrame) {
      const dt = now - this.lastFrame;
      this.frameAcc.push(dt);
      if (this.frameAcc.length >= 45) {
        const s = this.frameAcc.slice().sort((a, b) => a - b);
        const med = s[Math.floor(s.length / 2)];
        this.frameAcc.length = 0;
        if (med > 34 && this.quality === 1) { this.quality = 0.5; this.W = 0; this.resize(); }
        else if (med < 15 && this.quality < 1) { this.quality = 1; this.W = 0; this.resize(); }
      }
    }
    this.lastFrame = now;
  }

  render(now) {
    const gl = this.gl;
    this.time = now / 1000;
    this.sun = sunDirection();
    const M = this.matrices();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0.016, 0.027, 0.055, 1);
    gl.depthMask(true);   // clearing depth is masked by the write mask
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // stars
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    this.fullscreenPass(this.pStars, (p) => {
      gl.uniform3fv(p.u.uFwd, M.fwd); gl.uniform3fv(p.u.uRight, M.right);
      gl.uniform3fv(p.u.uUp, M.up);
      gl.uniform1f(p.u.uTanHalf, Math.tan(FOV / 2));
      gl.uniform1f(p.u.uAspect, M.aspect);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform2f(p.u.uRes, this.W, this.H);
    });

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    this.drawMesh(this.pOcean, M, 0, false);
    gl.useProgram(this.pLand);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(this.pLand.u.uPal, 0);
    gl.uniform1f(this.pLand.u.uHover, this.hover);
    gl.uniform1f(this.pLand.u.uSel, this.sel);
    this.drawMesh(this.pLand, M, 0.0016, true);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const zoomK = clamp((3.4 - this.cam.dist) / 2.2, 0, 1);
    this.drawLines('grat', M, { elev: 0.0008, width: 1.0, mode: 1, color: [0.27, 0.88, 0.72, 0.10] });
    this.drawLines('seg', M, { elev: 0.0032, width: 0.9 + zoomK * 0.7, mode: 0, color: [0.55, 0.93, 0.86, 0.42 + zoomK * 0.30] });
    this.drawLines('dash', M, { elev: 0.0040, width: 1.6, mode: 2, color: [0.96, 0.73, 0.34, 0.75] });
    if (this.sel >= 0) {
      this.drawLines('seg', M, { elev: 0.0052, width: 3.4, mode: 3, color: [0.96, 0.73, 0.34, 0.95] });
    }

    // atmosphere
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    const pa = this.pAtmo;
    gl.useProgram(pa);
    gl.uniformMatrix4fv(pa.u.uVP, false, M.vp);
    gl.uniform1f(pa.u.uR, 1.105);
    gl.uniform1f(pa.u.uFade, 1 - easeIO(clamp(this.cam.morph, 0, 1)));
    gl.uniform3fv(pa.u.uEye, M.eye);
    gl.uniform3fv(pa.u.uSun, this.sun);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bGridPos);
    gl.enableVertexAttribArray(pa.a.aLL);
    gl.vertexAttribPointer(pa.a.aLL, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bGridIdx);
    gl.drawElements(gl.TRIANGLES, this.gridCount, gl.UNSIGNED_INT, 0);
    gl.disable(gl.BLEND);

    if (this.quality < 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.W, this.H);
      this.fullscreenPass(this.pComp, (p) => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fboScene.tex);
        gl.uniform1i(p.u.uScene, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fboScene.tex);
        gl.uniform1i(p.u.uBloom, 1);
        gl.uniform1f(p.u.uBloomAmt, 0.0);
        gl.uniform1f(p.u.uTime, this.time);
        gl.uniform2f(p.u.uRes, this.W, this.H);
      });
      return;
    }
    // bloom
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fb);
    gl.viewport(0, 0, this.fboA.w, this.fboA.h);
    this.fullscreenPass(this.pBright, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fboScene.tex);
      gl.uniform1i(p.u.uTex, 0); gl.uniform1f(p.u.uThresh, 0.52);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB.fb);
    this.fullscreenPass(this.pBlur, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
      gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uDir, 1 / this.fboA.w, 0);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fb);
    this.fullscreenPass(this.pBlur, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fboB.tex);
      gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uDir, 0, 1 / this.fboA.h);
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    this.fullscreenPass(this.pComp, (p) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fboScene.tex);
      gl.uniform1i(p.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
      gl.uniform1i(p.u.uBloom, 1);
      gl.uniform1f(p.u.uBloomAmt, 0.85);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform2f(p.u.uRes, this.W, this.H);
    });
  }

  step(now) {
    const c = this.cam;
    let moving = false;
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
      const t = clamp((now - a.t0) / a.ms, 0, 1);
      const e = easeIO(t);
      c.lon = ((a.from.lon + a.dl * e + 540) % 360) - 180;
      c.lat = lerp(a.from.lat, a.to.lat, e);
      c.dist = lerp(a.from.dist, a.to.dist, e);
      if (t >= 1) this.anim = null;
      moving = true;
    } else if (Math.abs(this.vel.lon) > 0.001 || Math.abs(this.vel.lat) > 0.001) {
      c.lon = ((c.lon + this.vel.lon + 540) % 360) - 180;
      c.lat = clamp(c.lat + this.vel.lat, -89, 89);
      this.vel.lon *= 0.93; this.vel.lat *= 0.93;
      moving = true;
    }
    if (this.spin && now > this.spinIdle && !this.anim && c.morph < 0.02) {
      c.lon = ((c.lon + 0.045 + 540) % 360) - 180;
      moving = true;
    }
    return moving;
  }
}
