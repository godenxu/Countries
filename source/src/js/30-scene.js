/* ============================================================
   scene: morphing globe <-> equal-earth map, atmosphere,
   day/night terminator, instanced borders, bloom
   ============================================================ */
const GLSL_COMMON = `#version 300 es
precision highp float;
uniform mat4 uVP;
uniform float uMorph, uCenterLon, uPlaneScale;
uniform vec3 uSun;
const float PI = 3.14159265359;
vec3 spherePos(vec2 ll){
  float lo = radians(ll.x), la = radians(ll.y);
  float c = cos(la);
  return vec3(c*sin(lo), sin(la), c*cos(lo));
}
vec2 equalEarth(vec2 ll){
  float lo = radians(ll.x), la = radians(ll.y);
  const float A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
  float th = asin(clamp(0.866025404*sin(la), -1.0, 1.0));
  float t2 = th*th, t6 = t2*t2*t2;
  float x = 3.464101615*lo*cos(th) / (3.0*(9.0*A4*t6*t2 + 7.0*A3*t6 + 3.0*A2*t2 + A1));
  float y = th*(A1 + A2*t2 + A3*t6 + A4*t6*t2);
  return vec2(x, y);
}
float morphT(vec2 ll){
  float d = abs(mod(ll.x - uCenterLon + 540.0, 360.0) - 180.0) / 180.0;
  const float k = 0.42;
  return smoothstep(0.0, 1.0, clamp((uMorph*(1.0+k) - d*k) / 1.0, 0.0, 1.0));
}
vec3 morphPos(vec2 ll, float elev, out vec3 sphN){
  vec3 sp = spherePos(ll);
  sphN = sp;
  vec2 pp = equalEarth(ll) * uPlaneScale;
  float t = morphT(ll);
  vec3 p = mix(sp, vec3(pp, 0.0), t);
  vec3 n = normalize(mix(sp, vec3(0.0, 0.0, 1.0), t));
  return p + n*elev;
}
float dayFactor(vec3 n){ return smoothstep(-0.16, 0.20, dot(n, uSun)); }
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
`;

const VS_MESH = GLSL_COMMON + `
in vec2 aLL;
in float aCid;
uniform float uElev;
out vec3 vN;
out vec2 vLL;
flat out float vCid;
void main(){
  vec3 n;
  vec3 p = morphPos(aLL, uElev, n);
  vN = n; vLL = aLL; vCid = aCid;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const FS_LAND = `#version 300 es
precision highp float;
uniform sampler2D uPal;
uniform float uHover, uSel, uTime, uMorph;
uniform vec3 uSun;
in vec3 vN; in vec2 vLL; flat in float vCid;
out vec4 o;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  vec3 base = texelFetch(uPal, ivec2(int(vCid + 0.5), 0), 0).rgb;
  float day = smoothstep(-0.16, 0.20, dot(normalize(vN), uSun));
  day = mix(day, mix(day, 1.0, 0.72), uMorph);   // the flat map reads as a map, not a night scene
  // very soft large-scale variation so big landmasses are not perfectly flat
  float g = hash21(floor(vLL*3.0))*0.6 + hash21(floor(vLL*9.0))*0.4;
  vec3 c = base * (0.965 + g*0.07);
  vec3 nightC = base*0.34 + vec3(0.028, 0.042, 0.066);
  // faint warm settlement glow on the night side
  float lamp = smoothstep(0.90, 1.0, hash21(floor(vLL*26.0))) * (1.0-day);
  c = mix(nightC, c*1.05, day) + vec3(1.0, 0.68, 0.36)*lamp*0.26;
  float sel = step(abs(vCid - uSel), 0.5);
  float hov = step(abs(vCid - uHover), 0.5) * (1.0 - sel);
  c = mix(c, vec3(0.27, 0.88, 0.72), hov*0.30);
  c = mix(c, vec3(0.96, 0.73, 0.34), sel*(0.34 + 0.09*sin(uTime*2.6)));
  o = vec4(c, 1.0);
}`;

const FS_OCEAN = `#version 300 es
precision highp float;
uniform vec3 uSun, uEye;
uniform float uTime, uMorph;
in vec3 vN; in vec2 vLL; flat in float vCid;
out vec4 o;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  vec3 n = normalize(vN);
  float day = smoothstep(-0.16, 0.22, dot(n, uSun));
  day = mix(day, mix(day, 1.0, 0.72), uMorph);
  float lat = abs(vLL.y)/90.0;
  vec3 deepC = vec3(0.031, 0.098, 0.161);
  vec3 midC  = vec3(0.047, 0.196, 0.298);
  vec3 warmC = vec3(0.063, 0.286, 0.376);
  vec3 c = mix(warmC, midC, smoothstep(0.0, 0.62, lat));
  c = mix(c, deepC, smoothstep(0.5, 1.0, lat)*0.85);
  // gentle banding to read as water
  float band = sin(vLL.y*0.42 + sin(vLL.x*0.21)*1.7)*0.5+0.5;
  c *= 0.93 + band*0.10;
  vec3 nightC = c*0.24 + vec3(0.012, 0.026, 0.048);
  c = mix(nightC, c, day);
  // sun glint
  vec3 v = normalize(uEye - n);
  float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 26.0) * day;
  c += vec3(0.40, 0.60, 0.70)*spec*0.26*(1.0-uMorph);
  // limb darkening / rim toward atmosphere
  float rim = 1.0 - abs(dot(n, normalize(uEye)));
  c += vec3(0.16, 0.42, 0.78) * pow(rim, 3.2) * 0.55 * (1.0 - uMorph);
  o = vec4(c, 1.0);
}`;

const VS_LINE = GLSL_COMMON + `
in vec2 aCorner;
in vec2 aA, aB;
in vec3 aMeta;
uniform vec2 uRes;
uniform float uElev, uWidth, uSel;
uniform int uMode;          // 0 border, 1 graticule, 2 nine-dash, 3 selection outline
out float vAlpha;
void main(){
  vec3 na, nb;
  vec3 pa = morphPos(aA, uElev, na);
  vec3 pb = morphPos(aB, uElev, nb);
  vec4 ca = uVP*vec4(pa, 1.0), cb = uVP*vec4(pb, 1.0);
  float keep = 1.0;
  if (uMode == 3) keep = (abs(aMeta.y - uSel) < 0.5 || abs(aMeta.z - uSel) < 0.5) ? 1.0 : 0.0;
  if (ca.w <= 0.001 || cb.w <= 0.001 || keep < 0.5) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); vAlpha = 0.0; return; }
  vec2 sa = ca.xy/ca.w*uRes*0.5, sb = cb.xy/cb.w*uRes*0.5;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir/len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = uWidth * (uMode == 0 ? mix(1.0, 1.35, aMeta.x < 0.5 ? 1.0 : 0.0) : 1.0);
  vec2 sp = mix(sa, sb, aCorner.x) + nrm*aCorner.y*w*0.5;
  vec4 cc = mix(ca, cb, aCorner.x);
  gl_Position = vec4(sp/(uRes*0.5)*cc.w, cc.z, cc.w);
  float a = 1.0;
  if (uMode == 0) a = aMeta.x < 0.5 ? 1.0 : 0.55;    // coastline brighter than internal border
  vAlpha = a;
}`;

const FS_LINE = `#version 300 es
precision highp float;
uniform vec4 uColor;
in float vAlpha;
out vec4 o;
void main(){ o = vec4(uColor.rgb, uColor.a*vAlpha); }`;

const VS_QUAD = `#version 300 es
precision highp float;
in vec2 aCorner;
out vec2 vUV;
void main(){ vUV = aCorner; gl_Position = vec4(aCorner*2.0-1.0, 0.0, 1.0); }`;

const FS_STARS = `#version 300 es
precision highp float;
uniform vec3 uFwd, uRight, uUp;
uniform vec2 uRes;
uniform float uTanHalf, uAspect, uTime;
in vec2 vUV;
out vec4 o;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)))*43758.5453); }
float layer(vec3 d, float dens, float thr, float sz){
  vec3 p = d*dens;
  vec3 id = floor(p), f = fract(p);
  float r = h3(id);
  if (r < thr) return 0.0;
  vec3 off = vec3(h3(id+1.3), h3(id+2.7), h3(id+3.1))*0.7 + 0.15;
  float dd = length(f - off);
  float tw = 0.62 + 0.38*sin(uTime*1.7 + r*97.0);
  return smoothstep(sz, 0.0, dd) * ((r-thr)/(1.0-thr)) * tw;
}
void main(){
  vec2 ndc = vUV*2.0-1.0;
  vec3 d = normalize(uFwd + uRight*ndc.x*uTanHalf*uAspect + uUp*ndc.y*uTanHalf);
  float s = layer(d, 130.0, 0.90, 0.16)*1.25 + layer(d, 340.0, 0.945, 0.10)*0.85;
  // faint galactic haze
  float haze = pow(max(0.0, 1.0 - abs(d.y*1.6 + d.x*0.35)), 3.0);
  vec3 c = vec3(0.78, 0.90, 1.0)*s;
  c += vec3(0.06, 0.10, 0.19)*haze*0.7;
  c += vec3(0.013, 0.021, 0.038);
  o = vec4(c, 1.0);
}`;

const VS_ATMO = `#version 300 es
precision highp float;
in vec2 aLL;
uniform mat4 uVP;
uniform float uR;
out vec3 vN;
void main(){
  float lo = radians(aLL.x), la = radians(aLL.y);
  float c = cos(la);
  vN = vec3(c*sin(lo), sin(la), c*cos(lo));
  gl_Position = uVP*vec4(vN*uR, 1.0);
}`;

const FS_ATMO = `#version 300 es
precision highp float;
uniform vec3 uEye, uSun;
uniform float uFade, uR;
in vec3 vN;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - n*uR);
  float f = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 5.2);
  float day = smoothstep(-0.42, 0.36, dot(n, uSun));
  vec3 c = mix(vec3(0.06, 0.16, 0.36), vec3(0.30, 0.62, 1.0), day);
  o = vec4(c*f*uFade*1.05, 1.0);
}`;

const FS_PICK = `#version 300 es
precision highp float;
flat in float vCid;
in vec3 vN; in vec2 vLL;
out vec4 o;
void main(){
  int id = int(vCid + 0.5) + 1;
  o = vec4(float(id & 255)/255.0, float((id >> 8) & 255)/255.0, 0.0, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform float uThresh;
in vec2 vUV; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  o = vec4(c*smoothstep(uThresh, uThresh+0.32, l), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uDir;
in vec2 vUV; out vec4 o;
void main(){
  vec3 s = texture(uTex, vUV).rgb*0.227;
  s += (texture(uTex, vUV+uDir*1.385).rgb + texture(uTex, vUV-uDir*1.385).rgb)*0.316;
  s += (texture(uTex, vUV+uDir*3.231).rgb + texture(uTex, vUV-uDir*3.231).rgb)*0.070;
  o = vec4(s, 1.0);
}`;

const FS_COMP = `#version 300 es
precision highp float;
uniform sampler2D uScene, uBloom;
uniform float uTime, uBloomAmt;
uniform vec2 uRes;
in vec2 vUV; out vec4 o;
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  c += texture(uBloom, vUV).rgb*uBloomAmt;
  // filmic-ish lift and gentle contrast
  c = pow(max(c, 0.0), vec3(0.94));
  vec2 q = vUV-0.5;
  float vig = 1.0 - dot(q, q)*0.62;
  c *= vig;
  float g = fract(sin(dot(vUV*uRes + uTime, vec2(12.9898, 78.233)))*43758.5453);
  c += (g-0.5)*0.016;
  o = vec4(c, 1.0);
}`;

/* ---------------- palette ---------------- */
const REGION_COLOR = {
  Asia: [0.176, 0.290, 0.247], Europe: [0.157, 0.259, 0.310],
  Africa: [0.294, 0.259, 0.184], Americas: [0.157, 0.282, 0.278],
  Oceania: [0.196, 0.278, 0.231], Antarctic: [0.227, 0.278, 0.325], '': [0.20, 0.25, 0.27],
};

function buildPalette(meta, countries) {
  const px = new Uint8Array(256 * 4);
  for (let i = 0; i < meta.length && i < 256; i++) {
    const rec = countries[i];
    const base = REGION_COLOR[(rec && rec.reg.en) || ''] || REGION_COLOR[''];
    // deterministic jitter so neighbours separate without breaking the family
    let h = 0; const k = meta[i].key;
    for (let c = 0; c < k.length; c++) h = (h * 31 + k.charCodeAt(c)) & 0xffff;
    const j = ((h % 100) / 100 - 0.5) * 0.20;
    const warm = ((h >> 4) % 100) / 100 * 0.06 - 0.03;
    px[i * 4 + 0] = clamp((base[0] * (1 + j) + warm) * 255, 8, 250);
    px[i * 4 + 1] = clamp((base[1] * (1 + j)) * 255, 8, 250);
    px[i * 4 + 2] = clamp((base[2] * (1 + j) - warm * 0.5) * 255, 8, 250);
    px[i * 4 + 3] = 255;
  }
  return px;
}

/* ---------------- sun position ---------------- */
function sunDirection(date) {
  const d = date || new Date();
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (d.getTime() - start) / 86400000;
  const g = (357.529 + 0.98560028 * (dayOfYear + 0.5)) * DEG;
  const decl = -23.44 * Math.cos((360 / 365.24 * (dayOfYear + 10)) * DEG) * DEG;
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const lon = -((utcMin + eot) / 4 - 180);
  const la = decl, lo = ((lon + 540) % 360 - 180) * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}
