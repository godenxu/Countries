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
uniform sampler2D uPal, uPalB, uMark;
uniform float uHover, uSel, uTime, uMorph, uPalMix, uSweep, uBuild, uNight, uMarkFocus;
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
  // a thematic choropleth is data, not terrain: keep it flatter and calmer
  // than the natural palette so 200-odd polygons read as a legible gradient
  // instead of a lit-up patchwork of bright blocks
  float themed = smoothstep(0.4, 0.6, uPalMix);
  float g = vn2(vLL*min(uNight*0.35, 2.2))*0.6 + vn2(vLL*min(uNight*0.9, 6.0))*0.4;
  vec3 c = base * (0.965 + g*0.07*(1.0-themed));
  // terminator warmth on the lit side of the boundary -- a data theme should
  // read the same regardless of where the globe's day/night line happens to
  // fall, so this glare is switched off entirely once a theme is active
  float dusk = exp(-abs(ndl)*9.0) * (1.0-uMorph*0.25);
  c = mix(c, c*vec3(1.35, 0.92, 0.62), dusk*0.55*(1.0-themed));
  // themed night-side stays close to full brightness (only a mild dip) so the
  // choropleth colour itself -- which is meant to read vivid -- never goes dark
  vec3 nightC = mix(base*0.82 + vec3(0.008, 0.013, 0.020), base*0.30 + vec3(0.024, 0.038, 0.062), 1.0-themed);
  // settlement glow, weighted by the country's population density
  float ns = vn2(vLL*uNight*0.45)*0.62 + vn2(vLL*uNight*1.35 + 11.7)*0.38;
  float lampMask = smoothstep(0.88 - 0.34*dens, 1.0, ns) * (1.0-themed);
  float lamp = lampMask * (1.0 - day);
  c = mix(nightC, c*mix(1.05, 1.0, themed), day);
  c += vec3(1.0, 0.72, 0.38) * lamp * 0.85 * (0.86 + 0.14*sin(uTime*1.8 + ns*30.0));
  // scanning sweep
  float sweepLon = mod(vLL.x - uSweep + 540.0, 360.0) - 180.0;
  c += vec3(0.20, 0.95, 0.80) * exp(-abs(sweepLon)*0.55) * 0.10;
  // user-defined marks (e.g. "which countries are in this org") overlay on
  // top of whatever palette is active, so they stay visible in both natural
  // and thematic mode; selection/hover glow still layers on top of this.
  // "Custom" view mode (uMarkFocus) turns them into a bold spotlight: marked
  // countries saturate further while everything unmarked fades to neutral,
  // the same way switching to a data theme replaces the natural map's story
  vec4 mk = texelFetch(uMark, ivec2(int(vCid + 0.5), 0), 0);
  float hasMark = step(0.01, mk.a);
  c = mix(c, mk.rgb, mk.a * mix(0.55, 0.88, uMarkFocus));
  c = mix(c, vec3(0.10, 0.12, 0.15), (1.0 - hasMark) * uMarkFocus * 0.62);
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
  float dusk = exp(-abs(ndl)*9.0) * (1.0-uMorph*0.25);
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
in float aTier;     // 0 = country, 1 = city
in float aShow;     // CPU-side collision pass: 1 = keep, 0 = suppress (countries only)
uniform float uPix, uMinArea, uSel, uHover, uSelLift, uFade, uCityFade, uCityZoom;
out vec2 vUV;
out float vAlpha;
out float vSel;
out float vTier;
void main(){
  vec3 east, north, n;
  morphFrame(aLL, east, north);
  // a city's cid is offset by 10000 over its host country's index (keeps it
  // out of the gold-highlight match below); undo that to test the *host*
  // against uSel, so a city rises along with its country's selection lift
  // and never ends up buried under the raised land mesh
  float hostIdx = mix(aInfo.z, aInfo.z - 10000.0, aTier);
  float lift = (abs(hostIdx - uSel) < 0.5) ? uSelLift : 0.0;
  vec3 anchor = morphPos(aLL, 0.009 + lift + aTier*0.0035, n);
  // cities grow/shrink with the camera like ordinary map geometry (so
  // zooming in visibly enlarges them); country labels stay a steady,
  // always-legible screen size the way atlas typography conventionally does
  float sizeMul = mix(1.0, uCityZoom, aTier);
  float h = uPix * aInfo.x * sizeMul;
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
  // cities only clutter the view once a specific country is the focus: only
  // the selected (or hovered) country's cities are eligible to show, so
  // zooming into a multi-country region without picking one stays clean
  float cityRelevant = max(step(abs(hostIdx-uSel), 0.5), step(abs(hostIdx-uHover), 0.5));
  float show = mix(aShow, cityRelevant, aTier);
  vAlpha = facing * mix(zoomIn, uCityFade, aTier) * uFade * show;
  vSel = (abs(aInfo.z - uSel) < 0.5) ? 1.0 : 0.0;
  vTier = aTier;
}`;

const FS_LABEL = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform float uTime;
in vec2 vUV; in float vAlpha; in float vSel; in float vTier;
out vec4 o;
void main(){
  vec4 t = texture(uAtlas, vUV);
  if (t.a < 0.02 || vAlpha < 0.01) discard;
  // countries: a flat halo+fill mask tinted live (hover/selection colour can
  // change at runtime). cities: their pill/dot/text is baked into the atlas
  // in full colour already, so sample it straight through.
  vec3 uniColor = mix(vec3(0.80, 0.96, 0.91), vec3(1.0, 0.82, 0.42), vSel);
  vec3 c = mix(uniColor, t.rgb, vTier);
  float glow = (vSel > 0.5 && vTier < 0.5) ? 0.30 + 0.14*sin(uTime*3.0) : 0.0;
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

// occludes the pick pass with a "nothing here" (id=0 -> decodes to -1) write,
// at the same elevation as the visible ocean shell, so land on the far side
// of the globe can never win the depth test against empty near-side ocean
const FS_PICK_BG = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(0.0, 0.0, 0.0, 1.0); }`;

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
function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// Welsh-Powell (below) always fills the lowest-numbered class it can, so
// classes 0-3 do almost all the work -- exactly the four the four-colour
// theorem guarantees suffice for a planar adjacency graph -- with 4-7 as
// rarely-needed overflow for unusually dense clusters. Ordering the hues so
// 0-3 are a full 90 degrees apart (not just the 45 a flat 8-way split would
// give) keeps the classes that actually end up next to each other maximally
// distinct; 4-7 interleave the remaining 45-degree steps as a fallback.
const CLASS_HUE = [10, 100, 190, 280, 55, 145, 235, 325];
// classes 4-7 sit only 45 degrees from their nearest 0-3 neighbour in hue,
// so they're also pushed darker and more saturated -- a second, independent
// axis of separation that keeps a rare 5th-color country from reading as a
// near-twin of an adjacent 0-3 country even when the hues alone are close
const CLASS_SL = [[0.32, 0.32], [0.32, 0.32], [0.32, 0.32], [0.32, 0.32],
  [0.44, 0.22], [0.44, 0.22], [0.44, 0.22], [0.44, 0.22]];
function classColor(cls) {
  const idx = cls % CLASS_HUE.length;
  const bank = Math.floor(cls / CLASS_HUE.length);
  const [s, l] = CLASS_SL[idx];
  return hsl2rgb(CLASS_HUE[idx], s, clamp(l + (bank % 3) * 0.05, 0.14, 0.46));
}

// greedy Welsh-Powell graph colouring over the country border graph: visit
// countries highest-degree first and give each the lowest colour class none
// of its already-coloured neighbours use, so two countries that share a
// border are structurally guaranteed to land in different colour families
// (islands with no border data get a hash-based class instead of piling
// them all into class 0, purely for visual variety -- no adjacency to honour)
function graphColorCountries(meta, countries) {
  const n = Math.min(meta.length, 256);
  const byKey = {};
  for (let i = 0; i < n; i++) if (countries[i]) byKey[countries[i].k] = i;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const rec = countries[i];
    if (!rec || !rec.borders) continue;
    for (const b of rec.borders) {
      const j = byKey[b];
      if (j == null || j === i) continue;
      adj[i].push(j); adj[j].push(i);
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => adj[b].length - adj[a].length);
  const color = new Int32Array(n).fill(-1);
  for (const i of order) {
    const used = new Set();
    for (const j of adj[i]) if (color[j] >= 0) used.add(color[j]);
    let c0 = 0;
    while (used.has(c0)) c0++;
    color[i] = c0;
  }
  for (let i = 0; i < n; i++) {
    if (adj[i].length) continue;
    let h = 0; const k = (countries[i] && countries[i].k) || '';
    for (let x = 0; x < k.length; x++) h = (h * 31 + k.charCodeAt(x)) & 0xffff;
    color[i] = h % CLASS_HUE.length;
  }
  return color;
}

// alpha channel carries normalised log population density -> night-light intensity
function densityAlpha(rec) {
  const d = rec && rec.dens;
  if (!d || d <= 0) return 20;
  const t = clamp((Math.log10(d) + 0.5) / 3.2, 0, 1);
  return Math.round(20 + t * 235);
}

function buildPalette(meta, countries) {
  const px = new Uint8Array(256 * 4);
  const cls = graphColorCountries(meta, countries);
  for (let i = 0; i < meta.length && i < 256; i++) {
    const rec = countries[i];
    const base = classColor(cls[i]);
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

function hexToRgb255(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// user-defined "mark" groups (e.g. org membership) painted onto a 256x1
// lookup texture, same shape as the natural/theme palettes -- a country in
// more than one active group gets the average of those groups' colours
function buildMarkPalette(meta, countries, groups) {
  const px = new Uint8Array(256 * 4);
  if (!groups || !groups.length) return px;
  const byKey = {};
  for (let i = 0; i < meta.length && i < 256; i++) if (countries[i]) byKey[countries[i].k] = i;
  const n = Math.min(meta.length, 256);
  const acc = Array.from({ length: n }, () => [0, 0, 0, 0]);
  for (const grp of groups) {
    if (!grp.keys || !grp.keys.length) continue;
    const rgb = hexToRgb255(grp.color);
    for (const k of grp.keys) {
      const i = byKey[k];
      if (i == null) continue;
      acc[i][0] += rgb[0]; acc[i][1] += rgb[1]; acc[i][2] += rgb[2]; acc[i][3]++;
    }
  }
  for (let i = 0; i < n; i++) {
    const [r, g, b, cnt] = acc[i];
    if (!cnt) continue;
    px[i * 4 + 0] = clamp(r / cnt, 0, 255);
    px[i * 4 + 1] = clamp(g / cnt, 0, 255);
    px[i * 4 + 2] = clamp(b / cnt, 0, 255);
    px[i * 4 + 3] = 220;
  }
  return px;
}

/* sequential ramp for the thematic layer: indigo -> teal -> green -> gold -> orange -> red */
// The colour itself is allowed to be vivid and clearly stepped -- that's
// what makes 200-odd polygons legible as a ranked scale -- the glare that
// made it unreadable was the natural-terrain *lighting* stacked on top
// (handled above via `themed`), not the palette's own saturation.
const RAMP = [
  [0.106, 0.216, 0.478], [0.086, 0.478, 0.541], [0.259, 0.639, 0.373],
  [0.788, 0.729, 0.196], [0.894, 0.482, 0.169], [0.792, 0.212, 0.216],
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
    if (v == null) col = [0.078, 0.086, 0.098];
    else {
      col = rampColor(v);
      // deterministic per-country jitter, same trick as the natural palette,
      // so same-bucket neighbours don't fuse into one flat coloured blob
      let h = 0; const k = meta[i].key;
      for (let c = 0; c < k.length; c++) h = (h * 31 + k.charCodeAt(c)) & 0xffff;
      const j = ((h % 100) / 100 - 0.5) * 0.10;
      col = [col[0] * (1 + j), col[1] * (1 + j), col[2] * (1 + j)];
    }
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
