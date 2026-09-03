/* ============================================================
   bootstrap
   ============================================================ */
const VERSION = '__VERSION__';

function bootStep(pct, label) {
  const b = $('#bootBar');
  if (b) b.style.width = Math.round(pct * 100) + '%';
  const t = $('#bootTxt');
  if (t && label) t.textContent = label;
}

async function boot() {
  try {
    $('#roVer').textContent = VERSION;
    bootStep(0.05, T('bootGeo'));
    const geoBytes = await gunzip(b64ToBytes(GEO_B64));
    const geo = decodeGeo(geoBytes.buffer.slice(geoBytes.byteOffset, geoBytes.byteOffset + geoBytes.byteLength));
    const cBytes = await gunzip(b64ToBytes(META_B64));
    const bundle = JSON.parse(new TextDecoder().decode(cBytes));
    initData(bundle);
    const countries = bundle.countries;

    bootStep(0.18, T('bootMesh'));
    const mesh = await buildMesh(geo, (p) => bootStep(0.18 + p * 0.62, T('bootMesh')));

    bootStep(0.84, T('bootGL'));
    const view = new View($('#gl'), mesh, countries);
    bootStep(0.94, T('bootLabel'));
    const ui = new UIShell(view, VERSION);
    window.ATLAS = { view, ui, mesh, countries, version: VERSION, data: DATA };

    bootStep(1, T('bootReady'));
    let visible = true;
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!visible) return;
      view.resize();
      const moving = view.step(now);
      view.render(now);
      ui.frame(now, moving);
    };
    requestAnimationFrame(loop);
    setTimeout(() => { $('#boot').classList.add('done'); }, 260);
    setTimeout(() => { $('#boot').remove(); }, 1100);
    view.cam.dist = view.fitDist() * 1.55;
    view.flyTo(105, 22, view.fitDist(), 1900);
    // opportunistic data refresh: silent, and only when the cache is stale
    if (navigator.onLine && (!DATA.wb || Date.now() - DATA.wb.t > 7 * 86400000)) {
      setTimeout(() => { refreshOnline().then((ok) => { if (ok) ui.refreshAll(); }); }, 4000);
    }
  } catch (err) {
    console.error(err);
    const msg = String(err && err.message || err);
    $('#boot').innerHTML = '<div style="max-width:min(90vw,420px);text-align:center;line-height:1.8;color:#7f9aa3;font-size:13px">'
      + '<div style="color:#ff6f5e;font-size:15px;margin-bottom:10px">' + (LANG === 'zh' ? '启动失败' : 'Failed to start') + '</div>'
      + (msg.indexOf('WEBGL2') >= 0
        ? (LANG === 'zh' ? '当前浏览器不支持 WebGL 2。请使用较新版本的 Chrome / Edge / Safari 打开。'
          : 'This browser does not support WebGL 2. Please use a recent Chrome / Edge / Safari.')
        : msg) + '</div>';
  }
}

/* ---------------- PWA ---------------- */
function initPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e;
    const b = $('#hbInstall');
    if (b) {
      b.classList.remove('hide');
      b.onclick = async () => { b.classList.add('hide'); deferred.prompt(); deferred = null; };
    }
  });
}

initPWA();
boot();
