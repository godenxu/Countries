// Inlines styles, scripts and compressed data into one self-contained index.html,
// emits the PWA sidecars, and packages a timestamped zip.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { makeIcon } from './lib/png.mjs';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');

// version = UTC+8 wall clock, no separators
const now = new Date(Date.now() + 8 * 3600 * 1000);
const p2 = (n) => String(n).padStart(2, '0');
const VERSION = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}`
  + `${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}`;
const STAGE = 'P4';

const gz64 = (buf) => zlib.gzipSync(buf, { level: 9 }).toString('base64');

const css = fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');
const jsFiles = ['00-util.js', '10-geo.js', '20-gl.js', '30-scene.js', '45-labels.js', '40-view.js',
  '56-data.js', '55-panel.js', '50-ui.js', '60-main.js'];
const earcut = fs.readFileSync(path.join(ROOT, 'node_modules/earcut/dist/earcut.min.js'), 'utf8');
const appJs = jsFiles.map((f) => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
const js = `/* earcut (ISC) https://github.com/mapbox/earcut */\n${earcut}\n${appJs}`
  .replace(/__VERSION__/g, VERSION);

const geoB64 = gz64(fs.readFileSync(path.join(ROOT, 'data/geo.bin')));
const metaB64 = gz64(fs.readFileSync(path.join(ROOT, 'data/countries.json')));
const dataJs = `const GEO_B64="${geoB64}";\nconst META_B64="${metaB64}";`;

let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => css)
  .replace('/*__DATA__*/', () => dataJs)
  .replace('/*__JS__*/', () => js)
  .replace(/__VERSION__/g, VERSION);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);

const manifest = {
  id: '/atlas/',
  name: '寰宇 · 世界国家信息大全',
  short_name: '寰宇 ATLAS',
  description: '交互式 WebGL 地球仪与世界各国信息大全 / Interactive globe & world country almanac',
  start_url: './',
  scope: './',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'any',
  background_color: '#04070e',
  theme_color: '#04070e',
  lang: 'zh-CN',
  dir: 'ltr',
  categories: ['education', 'reference', 'travel'],
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));

const sw = `/* atlas service worker — build ${VERSION} */
const CACHE = 'atlas-${VERSION}';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match('./index.html'))));
});
`;
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

fs.writeFileSync(path.join(DIST, 'icon-192.png'), makeIcon(192, true));
fs.writeFileSync(path.join(DIST, 'icon-512.png'), makeIcon(512, true));
fs.writeFileSync(path.join(DIST, 'icon-512-maskable.png'), makeIcon(512, false));
fs.writeFileSync(path.join(DIST, 'icon-180.png'), makeIcon(180, true));

const readme = `寰宇 ATLAS · 世界国家信息大全
构建版本 BUILD ${VERSION}（UTC+8）  阶段 ${STAGE}

【怎么用】
1) 直接双击 index.html 即可离线运行（需要支持 WebGL2 的浏览器：Chrome / Edge / Safari 16+）。
2) 想装到手机上：把整个文件夹放到任意 HTTPS 站点（GitHub Pages 最省事），
   用手机浏览器打开后选择"添加到主屏幕 / 安装应用"。
   manifest.json、sw.js、icon-*.png 必须与 index.html 放在同一目录。

【地图引擎】
· 自研 WebGL2，无第三方图形库。可旋转缩放的发光星球，一键连续摊平为等积世界地图（Equal Earth）
· 真实疆域：Natural Earth 1:50m，237 个国家与地区，海岸线与国界分色
· 一个中国口径：大陆与台湾、香港、澳门合并为同一实体，附南海断续线示意
· 地名贴地渲染：国名以切平面四边形绘制在球面上，随地球一同旋转、透视收缩，不再是浮在屏幕上的文字

【光影特效】
实时晨昏线（按 UTC 计算太阳直射点，含均时差）· 昼夜交界暖色带 · 按人口密度分布的夜间灯光
程序化云层 · 极地极光 · 雷达扫描光带 · 双层大气散射辉光 · 三级泛光 · 色散 / 暗角 / 胶片颗粒 / 扫描线
选中国家抬升 + 金色描边 + 目标环 + 向邻国发射的流光弧线 · 点击涟漪 · 开场逐帧生成动画
以上全部可在"视觉设置"里逐项调节强度。

【数据】
· 24 项量化指标（GDP、人均 GDP、PPP、增速、通胀、失业、进出口、债务、储备、军费、军费占比、
  现役与预备役兵力、HDI、预期寿命、年龄中位数、生育率、城镇化、识字率、网络普及、人均碳排、
  森林覆盖、可再生电力占比等），逐项标注年份与来源
· 18 类国际组织成员（G7 / G20 / 金砖 / 上合 / 北约 / 欧盟 / 申根 / 东盟 / 非盟 / 阿盟 / 欧佩克 /
  APEC / OECD / 英联邦 / 独联体 / 南方共同市场 / 美墨加 / 拥核国家）
· 68 国政治制度详表（政体、立法机构、行政区划、法律体系、元首与政府首脑职位）
· 58 国文化条目（国歌、国花、国兽、国菜、代表体育、主要节日）+ 90 国世界遗产数量
· 40 国 2000–2024 年 GDP 走势（面板内迷你走势图）
· 联网刷新：设备联网时可从世界银行开放数据刷新 19 项指标，带 ● 标记表示该值来自实时刷新

【功能】
专题着色（21 个指标，按分位着色）· 排行榜 Top 30 · 双国并排对比 · 收藏 · 随机漫游
中英双语切换 · 中文 / 英文 / 拼音 / ISO 代码搜索 · PWA 安装与离线缓存
折叠屏折叠态（底部三段抽屉）与展开态（左右双栏）自适应

【键盘快捷键】
/ 搜索　空格 自转　M 球面/平面　R 排行榜　C 对比　F 收藏　G 随机　Esc 关闭

【数据来源】
· 疆域：Natural Earth 1:50m（公有领域），经 world-atlas 转换
· 国名与代码：world-countries（ODbL）
· 政体 / 宗教 / 美食 / 国家象征 / 海拔 / 海岸线：country-json
· 量化指标：整理自 IMF / 世界银行 / SIPRI / UNDP / UN / ITU / FAO 公开口径
· 联网刷新：World Bank Open Data API v2

【口径声明】
南海断续线为示意性绘制；藏南、阿克赛钦等争议地区暂按 Natural Earth 底图的实际控制线划分，
不构成任何国家的官方标准地图。政治条目只列职务名称，不固化具体任职人。
`;
fs.writeFileSync(path.join(DIST, 'README.txt'), readme);

// stage the zip: runnable app at the root, full project source under source/
fs.mkdirSync(RELEASE, { recursive: true });
const STG = path.join(RELEASE, `.stage-${VERSION}`);
fs.rmSync(STG, { recursive: true, force: true });
fs.mkdirSync(path.join(STG, 'source'), { recursive: true });
for (const f of fs.readdirSync(DIST)) fs.copyFileSync(path.join(DIST, f), path.join(STG, f));
for (const d of ['src', 'build', 'data', 'docs']) {
  fs.cpSync(path.join(ROOT, d), path.join(STG, 'source', d), { recursive: true });
}
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(STG, 'source', 'package.json'));
fs.writeFileSync(path.join(STG, 'source', 'BUILD.md'),
  `# 重新构建\n\n\`\`\`\nnpm i world-atlas@2 world-countries country-json earcut\nnode build/01-geometry.mjs   # 疆域拓扑 -> data/geo.bin\nnode build/02-countries.mjs  # 国家资料 -> data/countries.json\nnode build/03-bundle.mjs     # 打包 -> dist/index.html + release/*.zip\n\`\`\`\n\n构建版本 ${VERSION}（UTC+8）。\n`);
const zipName = `Atlas-${STAGE}-${VERSION}.zip`;
const zipPath = path.join(RELEASE, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execFileSync('zip', ['-9', '-q', '-r', zipPath, '.'], { cwd: STG });
fs.rmSync(STG, { recursive: true, force: true });

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
console.log(`build ${VERSION}`);
console.log(`  dist/index.html  ${kb(path.join(DIST, 'index.html'))}`);
console.log(`  ${path.relative(ROOT, zipPath)}  ${kb(zipPath)}`);
fs.writeFileSync(path.join(ROOT, '.lastbuild'), VERSION);
