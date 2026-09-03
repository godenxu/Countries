/* ============================================================
   shaders: morphing globe, volumetric-ish atmosphere, clouds,
   aurora, city lights, radar sweep, surface labels, bloom chain
   ============================================================ */
const GLSL_COMMON = `#version 300 es
precision highp float;
uniform mat4 uVP;
uniform float uMorph, uCenterLon, uPlaneScale, uTime;
uniform vec3 uSun, uEye;
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
  return smoothstep(0.0, 1.0, clamp((uMorph*(1.0+k) - d*k), 0.0, 1.0));
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
// tangent frame that follows the morph, used to keep surface labels rigid
void morphFrame(vec2 ll, out vec3 east, out vec3 north){
  float lo = radians(ll.x), la = radians(ll.y);
  vec3 e = vec3(cos(lo), 0.0, -sin(lo));
  vec3 n = vec3(-sin(la)*sin(lo), cos(la), -sin(la)*cos(lo));
  float t = morphT(ll);
  east = normalize(mix(e, vec3(1.0, 0.0, 0.0), t));
  north = normalize(mix(n, vec3(0.0, 1.0, 0.0), t));
}
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)))*43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash31(i), n100 = hash31(i+vec3(1,0,0));
  float n010 = hash31(i+vec3(0,1,0)), n110 = hash31(i+vec3(1,1,0));
  float n001 = hash31(i+vec3(0,0,1)), n101 = hash31(i+vec3(1,0,1));
  float n011 = hash31(i+vec3(0,1,1)), n111 = hash31(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const VS_MESH = GLSL_COMMON + `
in vec2 aLL;
in float aCid;
uniform float uElev, uSel, uSelLift, uBuild;
out vec3 vN;
out vec2 vLL;
out vec3 vWorld;
flat out float vCid;
void main(){
  vec3 n;
  float lift = (abs(aCid - uSel) < 0.5) ? uSelLift : 0.0;
  // build-in wipe: land rises out of the sphere at boot
  float b = clamp((uBuild - 0.15*hash21(floor(aLL*0.2)))*1.35, 0.0, 1.0);
  vec3 p = morphPos(aLL, (uElev + lift)*b, n);
  vN = n; vLL = aLL; vCid = aCid; vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const FS_LAND = `#version 300 es
precision highp float;
uniform sampler2D uPal, uPalB;
uniform float uHover, uSel, uTime, uMorph, uPalMix, uSweep, uBuild, uNight;
uniform vec3 uSun, uEye;
in vec3 vN; in vec2 vLL; in vec3 vWorld; flat in float vCid;
out vec4 o;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
}
void main(){
  vec4 pa = texelFetch(uPal, ivec2(int(vCid + 0.5), 0), 0);
  vec4 pb = texelFetch(uPalB, ivec2(int(vCid + 0.5), 0), 0);
  vec3 base = mix(pa.rgb, pb.rgb, uPalMix);
  float dens = pa.a;                       // population density, drives night lights
  vec3 n = normalize(vN);
  float ndl = dot(n, uSun);
  float day = smoothstep(-0.16, 0.20, ndl);
  day = mix(day, mix(day, 1.0, 0.74), uMorph);
  float g = vn2(vLL*min(uNight*0.35, 2.2))*0.6 + vn2(vLL*min(uNight*0.9, 6.0))*0.4;
  vec3 c = base * (0.965 + g*0.07);
  // terminator warmth on the lit side of the boundary
  float dusk = exp(-abs(ndl)*9.0) * (1.0-uMorph*0.8);
  c = mix(c, c*vec3(1.35, 0.92, 0.62), dusk*0.55);
  vec3 nightC = base*0.30 + vec3(0.024, 0.038, 0.062);
  // settlement glow, weighted by the country's population density
  float ns = vn2(vLL*uNight*0.45)*0.62 + vn2(vLL*uNight*1.35 + 11.7)*0.38;
  float lampMask = smoothstep(0.88 - 0.34*dens, 1.0, ns);
  float lamp = lampMask * (1.0 - day) * (1.0 - uMorph*0.85);
  c = mix(nightC, c*1.05, day);
  c += vec3(1.0, 0.72, 0.38) * lamp * 0.85 * (0.86 + 0.14*sin(uTime*1.8 + ns*30.0));
  // scanning sweep
  float sweepLon = mod(vLL.x - uSweep + 540.0, 360.0) - 180.0;
  c += vec3(0.20, 0.95, 0.80) * exp(-abs(sweepLon)*0.55) * 0.10;
  float sel = step(abs(vCid - uSel), 0.5);
  float hov = step(abs(vCid - uHover), 0.5) * (1.0 - sel);
  c = mix(c, vec3(0.30, 0.92, 0.78), hov*0.32);
  c = mix(c, vec3(0.98, 0.76, 0.36), sel*(0.34 + 0.10*sin(uTime*2.6)));
  c *= smoothstep(0.0, 0.35, uBuild);
  o = vec4(c, 1.0);
}`;

const FS_OCEAN = `#version 300 es
precision highp float;
uniform vec3 uSun, uEye;
uniform float uTime, uMorph, uSweep, uNight;
in vec3 vN; in vec2 vLL; in vec3 vWorld; flat in float vCid;
out vec4 o;
float hash31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)))*43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
void main(){
  vec3 n = normalize(vN);
  float ndl = dot(n, uSun);
  float day = smoothstep(-0.16, 0.22, ndl);
  day = mix(day, mix(day, 1.0, 0.74), uMorph);
  float lat = abs(vLL.y)/90.0;
  vec3 deepC = vec3(0.024, 0.078, 0.140);
  vec3 midC  = vec3(0.043, 0.180, 0.286);
  vec3 warmC = vec3(0.060, 0.283, 0.372);
  vec3 c = mix(warmC, midC, smoothstep(0.0, 0.62, lat));
  c = mix(c, deepC, smoothstep(0.5, 1.0, lat)*0.85);
  float band = sin(vLL.y*0.42 + sin(vLL.x*0.21)*1.7)*0.5+0.5;
  c *= 0.93 + band*0.10;
  // slow surface ripple for life
  float rip = vnoise(vec3(vLL*0.35, uTime*0.05))*0.5 + vnoise(vec3(vLL*1.1, uTime*0.08))*0.5;
  c *= 0.94 + rip*0.13;
  float dusk = exp(-abs(ndl)*9.0) * (1.0-uMorph*0.8);
  c = mix(c, c*vec3(1.5, 0.85, 0.55), dusk*0.5);
  vec3 nightC = c*0.22 + vec3(0.010, 0.024, 0.046);
  c = mix(nightC, c, day);
  vec3 v = normalize(uEye - vWorld);
  float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 42.0) * day;
  c += vec3(0.45, 0.66, 0.78)*spec*0.55*(1.0-uMorph);
  float rim = 1.0 - abs(dot(n, normalize(uEye)));
  c += vec3(0.14, 0.40, 0.80) * pow(rim, 3.0) * 0.55 * (1.0 - uMorph);
  float sweepLon = mod(vLL.x - uSweep + 540.0, 360.0) - 180.0;
  c += vec3(0.16, 0.85, 0.75) * exp(-abs(sweepLon)*0.5) * 0.055;
  o = vec4(c, 1.0);
}`;

const FS_CLOUD = GLSL_COMMON.replace('#version 300 es\nprecision highp float;\n', '#version 300 es\nprecision highp float;\n') + `
in vec3 vN; in vec2 vLL; in vec3 vWorld; flat in float vCid;
uniform float uCloudAmt;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  vec3 q = n*2.6 + vec3(uTime*0.008, 0.0, uTime*0.004);
  float f = fbm(q);
  f = smoothstep(0.48, 0.86, f);
  // stretch clouds zonally, the way banded weather reads on a globe
  float band = fbm(vec3(n.xz*1.4, n.y*5.0 + uTime*0.01));
  f *= smoothstep(0.30, 0.75, band);
  float day = smoothstep(-0.10, 0.28, dot(n, uSun));
  vec3 c = mix(vec3(0.10, 0.16, 0.26), vec3(0.86, 0.94, 1.0), day);
  float dusk = exp(-abs(dot(n, uSun))*8.0);
  c = mix(c, vec3(1.0, 0.72, 0.52), dusk*0.6);
  float a = f * uCloudAmt * (1.0 - uMorph*0.55);
  o = vec4(c*a, a);
}`;

const FS_AURORA = GLSL_COMMON + `
in vec3 vN; in vec2 vLL; in vec3 vWorld; flat in float vCid;
uniform float uAurora;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  float lat = abs(vLL.y);
  float band = smoothstep(58.0, 66.0, lat) * (1.0 - smoothstep(74.0, 86.0, lat));
  float night = 1.0 - smoothstep(-0.30, 0.10, dot(n, uSun));
  float curt = fbm(vec3(vLL.x*0.10, vLL.y*0.55, uTime*0.14));
  float ribbon = smoothstep(0.42, 0.78, curt) * (0.6 + 0.4*sin(vLL.x*0.35 + uTime*0.8));
  float a = band*night*ribbon*uAurora;
  vec3 c = mix(vec3(0.18, 1.0, 0.62), vec3(0.42, 0.35, 1.0), smoothstep(0.0, 1.0, curt));
  o = vec4(c*a, a);
}`;

const VS_LINE = GLSL_COMMON + `
in vec2 aCorner;
in vec2 aA, aB;
in vec3 aMeta;
uniform vec2 uRes;
uniform float uElev, uWidth, uSel, uSelLift, uFlow;
uniform int uMode;   // 0 border 1 graticule 2 nine-dash 3 selection 4 arc 5 ring
out float vAlpha;
out float vT;
void main(){
  vec3 na, nb;
  float ea = uElev, eb = uElev;
  if (uMode == 4) { ea = aMeta.x; eb = aMeta.y; }
  if (uMode == 3) { ea += uSelLift; eb += uSelLift; }
  vec3 pa = morphPos(aA, ea, na);
  vec3 pb = morphPos(aB, eb, nb);
  vec4 ca = uVP*vec4(pa, 1.0), cb = uVP*vec4(pb, 1.0);
  float keep = 1.0;
  if (uMode == 3) keep = (abs(aMeta.y - uSel) < 0.5 || abs(aMeta.z - uSel) < 0.5) ? 1.0 : 0.0;
  if (ca.w <= 0.001 || cb.w <= 0.001 || keep < 0.5) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); vAlpha = 0.0; vT = 0.0; return; }
  vec2 sa = ca.xy/ca.w*uRes*0.5, sb = cb.xy/cb.w*uRes*0.5;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir/len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = uWidth;
  if (uMode == 0) w *= (aMeta.x < 0.5 ? 1.25 : 0.85);
  vec2 sp = mix(sa, sb, aCorner.x) + nrm*aCorner.y*w*0.5;
  vec4 cc = mix(ca, cb, aCorner.x);
  gl_Position = vec4(sp/(uRes*0.5)*cc.w, cc.z, cc.w);
  float a = 1.0;
  if (uMode == 0) a = aMeta.x < 0.5 ? 1.0 : 0.5;
  if (uMode == 4) {
    float t = aMeta.z;
    a = (0.22 + 0.78*pow(max(0.0, sin((t - uFlow)*PI*2.0)), 6.0)) * sin(t*PI);
  }
  vAlpha = a; vT = aMeta.z;
}`;

const FS_LINE = `#version 300 es
precision highp float;
uniform vec4 uColor;
in float vAlpha; in float vT;
out vec4 o;
void main(){ o = vec4(uColor.rgb, uColor.a*vAlpha); }`;

/* ---------------- surface labels ---------------- */
const VS_LABEL = GLSL_COMMON + `
in vec2 aCorner;
in vec2 aLL;
in vec4 aUV;        // x,y,w,h in atlas space
in vec4 aInfo;      // scale, area, cid, pixel aspect
uniform float uPix, uMinArea, uSel, uSelLift, uFade;
out vec2 vUV;
out float vAlpha;
out float vSel;
void main(){
  vec3 east, north, n;
  morphFrame(aLL, east, north);
  float lift = (abs(aInfo.z - uSel) < 0.5) ? uSelLift : 0.0;
  vec3 anchor = morphPos(aLL, 0.010 + lift, n);
  float h = uPix * aInfo.x;
  float w = h * aInfo.w;
  vec2 c = aCorner - 0.5;
  vec3 p = anchor + east*(c.x*w) + north*(-c.y*h);
  gl_Position = uVP*vec4(p, 1.0);
  vUV = aUV.xy + aCorner*aUV.zw;
  float facing = 1.0;
  if (uMorph < 0.6) {
    float d = dot(normalize(n), normalize(uEye));
    facing = smoothstep(0.20, 0.44, d);
  }
  float zoomIn = smoothstep(uMinArea*0.6, uMinArea*1.8, aInfo.y);
  vAlpha = facing * zoomIn * uFade;
  vSel = (abs(aInfo.z - uSel) < 0.5) ? 1.0 : 0.0;
}`;

const FS_LABEL = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform float uTime;
in vec2 vUV; in float vAlpha; in float vSel;
out vec4 o;
void main(){
  vec4 t = texture(uAtlas, vUV);
  if (t.a < 0.02 || vAlpha < 0.01) discard;
  vec3 c = mix(vec3(0.93, 0.98, 0.97), vec3(1.0, 0.82, 0.42), vSel);
  float glow = vSel > 0.5 ? 0.30 + 0.14*sin(uTime*3.0) : 0.0;
  o = vec4(c*(1.0+glow), t.a*vAlpha);
}`;

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
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 layer(vec3 d, float dens, float thr, float sz, float flare){
  vec3 p = d*dens;
  vec3 id = floor(p), f = fract(p);
  float r = h3(id);
  if (r < thr) return vec3(0.0);
  vec3 off = vec3(h3(id+1.3), h3(id+2.7), h3(id+3.1))*0.7 + 0.15;
  float dd = length(f - off);
  float tw = 0.55 + 0.45*sin(uTime*1.7 + r*97.0);
  float core = smoothstep(sz, 0.0, dd) * ((r-thr)/(1.0-thr)) * tw;
  // faint cross flare on the brightest stars
  float fl = flare * smoothstep(0.985, 1.0, r) * exp(-dd*7.0) * tw;
  vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.88, 0.72), h3(id+9.1));
  return tint*(core + fl);
}
void main(){
  vec2 ndc = vUV*2.0-1.0;
  vec3 d = normalize(uFwd + uRight*ndc.x*uTanHalf*uAspect + uUp*ndc.y*uTanHalf);
  vec3 s = layer(d, 130.0, 0.90, 0.16, 0.6)*1.25 + layer(d, 340.0, 0.945, 0.10, 0.0)*0.85;
  // drifting nebula
  float neb = vn(d*3.1 + vec3(uTime*0.004)) * vn(d*7.3);
  vec3 nc = mix(vec3(0.05, 0.10, 0.24), vec3(0.16, 0.07, 0.24), vn(d*2.0));
  float haze = pow(max(0.0, 1.0 - abs(d.y*1.6 + d.x*0.35)), 3.0);
  vec3 c = s;
  c += nc*neb*0.55;
  c += vec3(0.06, 0.11, 0.21)*haze*0.75;
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
uniform float uFade, uR, uPow, uGain;
in vec3 vN;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - n*uR);
  float f = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), uPow);
  float ndl = dot(n, uSun);
  float day = smoothstep(-0.42, 0.36, ndl);
  vec3 c = mix(vec3(0.05, 0.13, 0.34), vec3(0.34, 0.66, 1.0), day);
  // sunset ring right at the terminator
  float dusk = exp(-abs(ndl)*7.0);
  c = mix(c, vec3(1.0, 0.52, 0.26), dusk*0.75);
  o = vec4(c*f*uFade*uGain, 1.0);
}`;

const FS_PICK = `#version 300 es
precision highp float;
flat in float vCid;
in vec3 vN; in vec2 vLL; in vec3 vWorld;
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
  o = vec4(c*smoothstep(uThresh, uThresh+0.30, l), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uDir;
in vec2 vUV; out vec4 o;
void main(){
  vec3 s = texture(uTex, vUV).rgb*0.1964;
  s += (texture(uTex, vUV+uDir*1.4117).rgb + texture(uTex, vUV-uDir*1.4117).rgb)*0.2969;
  s += (texture(uTex, vUV+uDir*3.2941).rgb + texture(uTex, vUV-uDir*3.2941).rgb)*0.0944;
  s += (texture(uTex, vUV+uDir*5.1764).rgb + texture(uTex, vUV-uDir*5.1764).rgb)*0.0104;
  o = vec4(s, 1.0);
}`;

const FS_COMP = `#version 300 es
precision highp float;
uniform sampler2D uScene, uB1, uB2, uB3;
uniform float uTime, uBloomAmt, uAber, uGrain, uScan, uFlash;
uniform vec2 uRes;
in vec2 vUV; out vec4 o;
void main(){
  vec2 q = vUV - 0.5;
  float r2 = dot(q, q);
  // subtle barrel distortion + chromatic aberration toward the edges
  vec2 uv = vUV + q*r2*0.028;
  vec2 ab = q*r2*uAber;
  vec3 c;
  c.r = texture(uScene, uv + ab).r;
  c.g = texture(uScene, uv).g;
  c.b = texture(uScene, uv - ab).b;
  vec3 bloom = texture(uB1, uv).rgb*0.5 + texture(uB2, uv).rgb*0.32 + texture(uB3, uv).rgb*0.24;
  c += bloom*uBloomAmt;
  c += vec3(0.35, 0.85, 0.95)*uFlash;
  c = pow(max(c, 0.0), vec3(0.94));
  c *= 1.0 - r2*0.62;
  float scan = sin(uv.y*uRes.y*1.6 + uTime*2.0)*0.5+0.5;
  c *= 1.0 - scan*uScan;
  float g = fract(sin(dot(uv*uRes + uTime, vec2(12.9898, 78.233)))*43758.5453);
  c += (g-0.5)*uGrain;
  o = vec4(c, 1.0);
}`;

/* ---------------- palettes ---------------- */
const REGION_COLOR = {
  Asia: [0.176, 0.290, 0.247], Europe: [0.157, 0.259, 0.310],
  Africa: [0.294, 0.259, 0.184], Americas: [0.157, 0.282, 0.278],
  Oceania: [0.196, 0.278, 0.231], Antarctic: [0.227, 0.278, 0.325], '': [0.20, 0.25, 0.27],
};

// alpha channel carries normalised log population density -> night-light intensity
function densityAlpha(rec) {
  const d = rec && rec.dens;
  if (!d || d <= 0) return 20;
  const t = clamp((Math.log10(d) + 0.5) / 3.2, 0, 1);
  return Math.round(20 + t * 235);
}

function buildPalette(meta, countries) {
  const px = new Uint8Array(256 * 4);
  for (let i = 0; i < meta.length && i < 256; i++) {
    const rec = countries[i];
    const base = REGION_COLOR[(rec && rec.reg.en) || ''] || REGION_COLOR[''];
    let h = 0; const k = meta[i].key;
    for (let c = 0; c < k.length; c++) h = (h * 31 + k.charCodeAt(c)) & 0xffff;
    const j = ((h % 100) / 100 - 0.5) * 0.20;
    const warm = ((h >> 4) % 100) / 100 * 0.06 - 0.03;
    px[i * 4 + 0] = clamp((base[0] * (1 + j) + warm) * 255, 8, 250);
    px[i * 4 + 1] = clamp((base[1] * (1 + j)) * 255, 8, 250);
    px[i * 4 + 2] = clamp((base[2] * (1 + j) - warm * 0.5) * 255, 8, 250);
    px[i * 4 + 3] = densityAlpha(rec);
  }
  return px;
}

/* sequential ramp for the thematic layer: deep teal -> aurora -> gold -> coral */
const RAMP = [
  [0.055, 0.145, 0.200], [0.075, 0.310, 0.330], [0.114, 0.510, 0.451],
  [0.275, 0.780, 0.596], [0.784, 0.816, 0.400], [0.949, 0.663, 0.278], [0.980, 0.404, 0.322],
];
function rampColor(t) {
  t = clamp(t, 0, 1) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
  return [lerp(RAMP[i][0], RAMP[i + 1][0], f), lerp(RAMP[i][1], RAMP[i + 1][1], f), lerp(RAMP[i][2], RAMP[i + 1][2], f)];
}

function buildThemePalette(meta, countries, key, scaleFn) {
  const px = new Uint8Array(256 * 4);
  for (let i = 0; i < meta.length && i < 256; i++) {
    const rec = countries[i];
    const v = key && rec ? scaleFn(rec) : null;
    let col;
    if (v == null) col = [0.098, 0.129, 0.153];
    else col = rampColor(v);
    px[i * 4 + 0] = clamp(col[0] * 255, 0, 255);
    px[i * 4 + 1] = clamp(col[1] * 255, 0, 255);
    px[i * 4 + 2] = clamp(col[2] * 255, 0, 255);
    px[i * 4 + 3] = densityAlpha(rec);
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
