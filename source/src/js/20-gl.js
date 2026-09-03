/* ============================================================
   minimal matrix + WebGL2 helpers
   ============================================================ */
const M4 = {
  ident: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(eye, center, up) {
    let z0 = eye[0]-center[0], z1 = eye[1]-center[1], z2 = eye[2]-center[2];
    let l = 1/Math.hypot(z0,z1,z2); z0*=l; z1*=l; z2*=l;
    let x0 = up[1]*z2 - up[2]*z1, x1 = up[2]*z0 - up[0]*z2, x2 = up[0]*z1 - up[1]*z0;
    l = Math.hypot(x0,x1,x2); if (l) { l = 1/l; x0*=l; x1*=l; x2*=l; } else { x0=1;x1=0;x2=0; }
    const y0 = z1*x2 - z2*x1, y1 = z2*x0 - z0*x2, y2 = z0*x1 - z1*x0;
    return new Float32Array([
      x0,y0,z0,0, x1,y1,z1,0, x2,y2,z2,0,
      -(x0*eye[0]+x1*eye[1]+x2*eye[2]),
      -(y0*eye[0]+y1*eye[1]+y2*eye[2]),
      -(z0*eye[0]+z1*eye[1]+z2*eye[2]), 1]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return o;
  },
  mulVec(m, v) {
    return [
      m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
      m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
      m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
      m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]];
  },
};

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error(`[shader ${name}]`, log, src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
    throw new Error(`shader ${name}: ${log}`);
  }
  return s;
}
function program(gl, vs, fs, name) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name + '.vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name + '.fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
  p.u = new Proxy({}, { get: (c, k) => (k in c ? c[k] : (c[k] = gl.getUniformLocation(p, k))) });
  p.a = new Proxy({}, { get: (c, k) => (k in c ? c[k] : (c[k] = gl.getAttribLocation(p, k))) });
  return p;
}
function buffer(gl, data, target) {
  const b = gl.createBuffer();
  const t = target || gl.ARRAY_BUFFER;
  gl.bindBuffer(t, b); gl.bufferData(t, data, gl.STATIC_DRAW);
  return b;
}
function makeFBO(gl, w, h, depth) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null;
  if (depth) {
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, rb, w, h,
    resize(nw, nh) {
      if (nw === this.w && nh === this.h) return;
      this.w = nw; this.h = nh;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (this.rb) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, nw, nh);
      }
    } };
}
