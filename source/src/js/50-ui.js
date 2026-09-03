/* ============================================================
   UI shell: header, search, theme bar, ranking, panel, compare
   ============================================================ */
const ICON = {
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  spin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="12" rx="9" ry="4"/><circle cx="12" cy="12" r="3.2"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  rank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9z"/></svg>',
  cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v18M7 8 3 12l4 4M17 8l4 4-4 4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
};

// system-only stacks (no webfont fetches, so this stays a self-contained file)
const FONT_STACKS = [
  { k: 'pingfang', labelKey: 'fontPingfang', stack: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif' },
  { k: 'yahei', labelKey: 'fontYahei', stack: '"Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif' },
  { k: 'hiragino', labelKey: 'fontHiragino', stack: '"Hiragino Sans GB", "PingFang SC", sans-serif' },
  { k: 'songti', labelKey: 'fontSongti', stack: '"Songti SC", "SimSun", STSong, serif' },
  { k: 'mono', labelKey: 'fontMono', stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
];

class UIShell {
  constructor(view, version) {
    this.view = view;
    this.version = version;
    this.tab = 'overview';
    this.theme = null;
    this.selId = -1;
    this.favs = JSON.parse(localStorage.getItem('atlas.favs') || '[]');
    this.cmpA = -1; this.cmpB = -1;
    this.roamSec = clamp(+localStorage.getItem('atlas.roamSec') || 15, 3, 120);
    this.roamTimer = null;
    this.fontKey = localStorage.getItem('atlas.font') || 'pingfang';
    this.build();
    this.wire();
    this.setFont(this.fontKey);
    this.applyLang();
  }

  build() {
    $('#hbGlobe').innerHTML = ICON.globe;
    $('#hbMap').innerHTML = ICON.map;
    $('#hbFull').innerHTML = ICON.full;
    $('#hbSet').innerHTML = ICON.gear;
    $('.sicon').innerHTML = ICON.search;
    $('#tZoomIn').innerHTML = ICON.plus;
    $('#tZoomOut').innerHTML = ICON.minus;
    $('#tReset').innerHTML = ICON.reset;
    $('#tSpin').innerHTML = ICON.spin;
    $('#tRank').innerHTML = ICON.rank;
    $('#tDice').innerHTML = ICON.dice;
    $('#pnClose').innerHTML = ICON.close;
    $('#pnFav').innerHTML = ICON.star;
    $('#pnCmp').innerHTML = ICON.cmp;
    $('#rkClose').innerHTML = ICON.close;
    $('#cmpClose').innerHTML = ICON.close;
    $('#setClose').innerHTML = ICON.close;
    const tabs = $('#pnTabs');
    tabs.innerHTML = '';
    for (const t of PANEL_TABS) {
      const b = el('button', 'ptab' + (t === this.tab ? ' on' : ''));
      b.dataset.tab = t;
      tabs.appendChild(b);
    }
    this.buildThemeBar();
    this.buildSettings();
  }

  buildThemeBar() {
    const bar = $('#themeBar');
    bar.innerHTML = '';
    const none = el('button', 'tchip on', '');
    none.dataset.k = '';
    bar.appendChild(none);
    for (const k of THEMES) {
      const m = metaOf(k);
      if (!m) continue;
      const b = el('button', 'tchip');
      b.dataset.k = k;
      bar.appendChild(b);
    }
  }

  buildSettings() {
    const host = $('#setBody');
    host.innerHTML = '';
    const fx = this.view.fx;
    const add = (key, labelKey, min, max, step) => {
      const r = el('div', 'setrow');
      r.appendChild(el('span', 'k', T(labelKey)));
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = fx[key];
      inp.oninput = () => { fx[key] = +inp.value; this.view.dirty = true; };
      r.appendChild(inp);
      host.appendChild(r);
    };
    add('bloom', 'setBloom', 0, 2, 0.05);
    add('clouds', 'setClouds', 0, 1, 0.05);
    add('aurora', 'setAurora', 0, 2, 0.05);
    add('atmo', 'setAtmo', 0, 2, 0.05);
    add('grain', 'setGrain', 0, 0.06, 0.002);
    add('aber', 'setAber', 0, 0.006, 0.0002);
    add('scan', 'setScan', 0, 0.05, 0.002);
    const addBool = (labelKey, get, set) => {
      const r = el('div', 'setrow');
      r.appendChild(el('span', 'k', T(labelKey)));
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = get();
      cb.onchange = () => { set(cb.checked); this.view.dirty = true; };
      r.appendChild(cb); host.appendChild(r);
    };
    addBool('setSweep', () => fx.sweep, (v) => { fx.sweep = v; });
    addBool('setLabels', () => fx.labels, (v) => { fx.labels = v; });
    addBool('setCities', () => fx.cities !== false, (v) => { fx.cities = v; });

    const rr = el('div', 'setrow');
    rr.appendChild(el('span', 'k', T('setRoam')));
    const num = document.createElement('input');
    num.type = 'number'; num.min = '3'; num.max = '120'; num.step = '1';
    num.value = this.roamSec;
    num.oninput = () => {
      const v = clamp(+num.value || 15, 3, 120);
      this.roamSec = v;
      localStorage.setItem('atlas.roamSec', String(v));
      if (this.roamTimer) this.startRoam(true);
    };
    rr.appendChild(num); host.appendChild(rr);

    const fr = el('div', 'setrow');
    fr.appendChild(el('span', 'k', T('setFont')));
    const sel = document.createElement('select');
    for (const f of FONT_STACKS) {
      const opt = document.createElement('option');
      opt.value = f.k; opt.textContent = T(f.labelKey);
      if (f.k === this.fontKey) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => this.setFont(sel.value);
    fr.appendChild(sel); host.appendChild(fr);
  }

  setFont(key) {
    const f = FONT_STACKS.find((x) => x.k === key) || FONT_STACKS[0];
    this.fontKey = f.k;
    localStorage.setItem('atlas.font', f.k);
    document.documentElement.style.setProperty('--font', f.stack);
    LABEL_FONT_STACK = f.stack;
    this.view.setupLabels();
  }

  wire() {
    const v = this.view;
    $('#hbGlobe').onclick = () => this.setMode(0);
    $('#hbMap').onclick = () => this.setMode(1);
    $('#hbLang').onclick = () => this.toggleLang();
    $('#hbSet').onclick = () => $('#settings').classList.toggle('open');
    $('#setClose').onclick = () => $('#settings').classList.remove('open');
    $('#hbFull').onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
    $('#tZoomIn').onclick = () => v.zoomTo(v.cam.dist * 0.78, this.cx(), this.cy(), false);
    $('#tZoomOut').onclick = () => v.zoomTo(v.cam.dist * 1.28, this.cx(), this.cy(), false);
    $('#tReset').onclick = () => { v.flyTo(105, 22, v.fitDist()); this.select(-1); };
    $('#tSpin').onclick = () => { v.spin = !v.spin; v.spinIdle = 0; $('#tSpin').classList.toggle('on', v.spin); };
    $('#tSpin').classList.toggle('on', v.spin);
    $('#tRank').onclick = () => this.toggleRank();
    $('#tDice').onclick = () => this.toggleRoam();
    $('#pnClose').onclick = () => this.select(-1);
    $('#pnFav').onclick = () => this.toggleFav(this.selId);
    $('#pnCmp').onclick = () => this.startCompare();
    $('#rkClose').onclick = () => this.toggleRank(false);
    $('#cmpClose').onclick = () => $('#cmp').classList.remove('open');
    $('#pnTabs').onclick = (e) => {
      const b = e.target.closest('.ptab'); if (!b) return;
      this.tab = b.dataset.tab;
      $$('.ptab').forEach((x) => x.classList.toggle('on', x.dataset.tab === this.tab));
      this.renderBody();
    };
    $('#themeBar').onclick = (e) => {
      const b = e.target.closest('.tchip'); if (!b) return;
      this.setTheme(b.dataset.k || null);
    };
    $('#pnHead').addEventListener('click', (e) => {
      if (window.innerWidth <= 720 && !e.target.closest('button')) {
        $('#panel').classList.toggle('full');
        this.updateShift();
      }
    });

    const sb = $('#searchBox');
    sb.oninput = () => this.search(sb.value);
    sb.onfocus = () => { if (sb.value) this.search(sb.value); };
    sb.onkeydown = (e) => {
      if (e.key === 'Escape') { sb.value = ''; sb.blur(); $('#sres').classList.add('hide'); }
      if (e.key === 'Enter') { const f = $('.sres-item', $('#sres')); if (f) f.click(); }
    };
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#searchWrap')) $('#sres').classList.add('hide');
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (e.key === '/') { e.preventDefault(); sb.focus(); }
      if (e.key === 'Escape') {
        if (this.cmpPick) this.cancelCompare();
        this.select(-1); $('#cmp').classList.remove('open'); $('#settings').classList.remove('open');
      }
      if (e.key === ' ') { e.preventDefault(); $('#tSpin').click(); }
      if (k === 'm') this.setMode(v.cam.morph > 0.5 ? 0 : 1);
      if (k === 'r') this.toggleRank();
      if (k === 'c' && this.selId >= 0) this.startCompare();
      if (k === 'f' && this.selId >= 0) this.toggleFav(this.selId);
      if (k === 'g') this.toggleRoam();
    });

    v.onHover = (x, y) => { this.hoverPos = { x, y }; this.hoverDirty = true; };
    v.onHoverOut = () => { this.hoverPos = null; $('#tip').classList.remove('on'); };
    v.onClick = (x, y) => {
      const id = v.pickAt(x, y);
      const g = v.screenToGeo(x, y);
      if (g) v.addRipple(g[0], g[1]);
      if (this.cmpPick && id >= 0) { this.finishCompare(id); return; }
      this.select(id);
      if (id >= 0) this.flyToCountry(id);
    };
    window.addEventListener('resize', () => { v.resize(); v.dirty = true; this.updateShift(); });
    // any manual touch of the map cancels an active roam
    v.canvas.addEventListener('pointerdown', () => { if (this.roamTimer) this.stopRoam(); });
    v.canvas.addEventListener('wheel', () => { if (this.roamTimer) this.stopRoam(); }, { passive: true });
  }

  cx() { return this.view.canvas.clientWidth / 2; }
  cy() { return this.view.canvas.clientHeight / 2; }

  // size of the map area not covered by the open detail panel, in CSS px —
  // shared by the lens-shift (keeps the subject clear of the panel) and by
  // the country-fit zoom (so "fit" means fit into what's actually visible)
  panelReserve() {
    const W = this.view.canvas.clientWidth, H = this.view.canvas.clientHeight;
    const open = this.selId >= 0 && $('#panel').classList.contains('open');
    if (!open) return { w: W, h: H, side: null, amount: 0 };
    if (W > 720) {
      const pw = $('#panel').getBoundingClientRect().width;
      return { w: Math.max(160, W - pw), h: H, side: 'x', amount: pw };
    }
    const ph = $('#panel').classList.contains('full') ? H * 0.88 : Math.min(H * 0.5, 460);
    return { w: W, h: Math.max(160, H - ph), side: 'y', amount: ph };
  }

  flyToCountry(i) {
    const v = this.view, m = v.mesh.meta[i];
    const vis = this.panelReserve();
    const d = v.fitCountryDist(m.rFit != null ? m.rFit : m.r, vis.w, vis.h);
    v.flyTo(m.lon, m.lat, d);
  }

  setMode(m) {
    const v = this.view;
    v.setMorph(m);
    // always land on a clean, fully-framed view for the new viewport shape —
    // never leave the user on a stale pan/zoom from the previous mode
    if (this.selId >= 0) setTimeout(() => this.flyToCountry(this.selId), 60);
    else setTimeout(() => v.flyTo(v.cam.lon, m ? 6 : 22, v.fitDist(), 900), 60);
    $('#hbGlobe').classList.toggle('on', !m);
    $('#hbMap').classList.toggle('on', !!m);
  }

  updateShift() {
    const v = this.view;
    const { w: W, h: H } = { w: v.canvas.clientWidth, h: v.canvas.clientHeight };
    const res = this.panelReserve();
    const bar = $('#themeBar');
    if (!res.side) {
      v.setShift(0, 0);
      $('#tools').style.transform = '';
      if (W > 720) { bar.style.left = '50%'; bar.style.maxWidth = ''; bar.style.transform = 'translateX(-50%)'; }
      else { bar.style.left = ''; bar.style.maxWidth = ''; bar.style.transform = ''; }
      return;
    }
    if (res.side === 'x') {
      v.setShift(res.amount / W, 0);
      $('#tools').style.transform = `translateX(${-Math.round(res.amount)}px)`;
      // keep the theme bar centred on the visible map, never under the panel
      bar.style.left = Math.round((W - res.amount) / 2) + 'px';
      bar.style.maxWidth = Math.max(240, W - res.amount - 24) + 'px';
      bar.style.transform = 'translateX(-50%)';
    } else {
      $('#tools').style.transform = '';
      bar.style.left = ''; bar.style.maxWidth = ''; bar.style.transform = '';
      v.setShift(0, -res.amount / H);
    }
  }

  toggleLang() {
    LANG = LANG === 'zh' ? 'en' : 'zh';
    localStorage.setItem('atlas.lang', LANG);
    this.applyLang();
    this.view.setupLabels();
  }

  applyLang() {
    document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
    $('#brandName').textContent = T('brand');
    $('#brandSub').textContent = LANG === 'zh' ? 'WORLD ATLAS' : '世界国家信息大全';
    $('#searchBox').placeholder = T('search');
    for (const [id, k] of [['hbGlobe', 'globe'], ['hbMap', 'map'], ['hbSet', 'settings'], ['hbFull', 'fullscreen'],
      ['tZoomIn', 'zoomIn'], ['tZoomOut', 'zoomOut'], ['tReset', 'reset'], ['tSpin', 'spin'],
      ['tRank', 'ranking'], ['tDice', 'random'], ['pnFav', 'favorite'], ['pnCmp', 'compare']]) {
      const n = $('#' + id); if (n) n.title = T(k);
    }
    $('#lz').classList.toggle('on', LANG === 'zh');
    $('#le').classList.toggle('on', LANG === 'en');
    $$('.ptab').forEach((b) => { b.textContent = T(b.dataset.tab); });
    $$('.tchip').forEach((b) => {
      const m = b.dataset.k ? metaOf(b.dataset.k) : null;
      b.textContent = m ? labelOf(m) : T('themeNone');
    });
    $('#rkTitle').textContent = T('ranking');
    $('#cmpTitle').textContent = T('compare');
    $('#setTitle').textContent = T('settings');
    this.buildSettings();
    this.renderLegend();
    if (this.selId >= 0) this.renderPanel(this.selId);
    if ($('#rank').classList.contains('open')) this.renderRank();
  }

  refreshAll() {
    computeRanks();
    if (this.theme) this.setTheme(this.theme);
    if (this.selId >= 0) this.renderPanel(this.selId);
    if ($('#rank').classList.contains('open')) this.renderRank();
  }

  /* ---------------- theme / choropleth ---------------- */
  setTheme(key) {
    this.theme = key || null;
    $$('.tchip').forEach((b) => b.classList.toggle('on', (b.dataset.k || null) === this.theme));
    this.view.setTheme(this.theme ? themeScale(this.theme) : null);
    this.renderLegend();
    if ($('#rank').classList.contains('open')) this.renderRank();
  }

  renderLegend() {
    const box = $('#legend');
    box.innerHTML = '';
    if (!this.theme) {
      const mk = (col, txt, dash) => {
        const d = el('div', 'k');
        const i = el('i');
        i.style.borderColor = col;
        if (dash) i.style.borderTopStyle = 'dashed';
        d.appendChild(i); d.appendChild(el('span', null, txt));
        return d;
      };
      box.appendChild(mk('rgba(150,242,224,.9)', T('coastline')));
      box.appendChild(mk('rgba(150,242,224,.45)', T('border')));
      box.appendChild(mk('rgba(242,181,82,.9)', T('ninedash'), true));
      return;
    }
    const m = metaOf(this.theme), r = DATA.ranks[this.theme];
    box.appendChild(el('div', 'lgtitle', labelOf(m) + (unitOf(m) ? ` (${unitOf(m)})` : '')));
    const ramp = el('div', 'ramp');
    box.appendChild(ramp);
    const sc = el('div', 'lgscale');
    sc.appendChild(el('span', null, fmtVal(r.min, m)));
    sc.appendChild(el('span', null, fmtVal(r.max, m)));
    box.appendChild(sc);
    box.appendChild(el('div', 'lgnote', T('themeYear').replace('%s', String(m.year || ''))));
  }

  /* ---------------- ranking board ---------------- */
  toggleRank(force) {
    const n = $('#rank');
    const open = force != null ? force : !n.classList.contains('open');
    n.classList.toggle('open', open);
    $('#tRank').classList.toggle('on', open);
    if (open) this.renderRank();
  }

  renderRank() {
    const key = this.theme || 'gdp';
    const m = metaOf(key), r = DATA.ranks[key];
    $('#rkSub').textContent = labelOf(m) + (unitOf(m) ? ` · ${unitOf(m)}` : '');
    const list = $('#rkList');
    list.innerHTML = '';
    if (!r) return;
    const top = r.order.slice(0, 30);
    const max = top.length ? top[0][1] : 1;
    top.forEach(([i, v], n) => {
      const c = DATA.countries[i];
      const row = el('div', 'rkrow' + (i === this.selId ? ' on' : ''));
      row.appendChild(el('span', 'n', String(n + 1)));
      row.appendChild(el('span', 'fg', c.flag || '🏳'));
      row.appendChild(el('span', 'nm', LANG === 'zh' ? c.zh : c.en));
      const bw = el('span', 'bw');
      const bi = el('i');
      bi.style.width = clamp(v / max * 100, 1.5, 100).toFixed(1) + '%';
      bw.appendChild(bi);
      row.appendChild(bw);
      row.appendChild(el('span', 'vv', fmtVal(v, m)));
      row.onclick = () => { this.select(i); this.flyToCountry(i); };
      list.appendChild(row);
    });
  }

  randomPick() {
    const pool = DATA.countries.map((c, i) => [c, i]).filter(([c]) => c.un && (c.pop || 0) > 200000);
    const [, i] = pool[Math.floor(Math.random() * pool.length)];
    this._roaming = true;
    this.select(i); this.flyToCountry(i);
    this._roaming = false;
  }

  /* ---------------- roam: auto-advance through random countries ---------------- */
  toggleRoam() {
    if (this.roamTimer) this.stopRoam(); else this.startRoam();
  }
  startRoam(restart) {
    if (this.roamTimer) clearInterval(this.roamTimer);
    if (!restart) this.randomPick();
    this.roamTimer = setInterval(() => this.randomPick(), this.roamSec * 1000);
    $('#tDice').classList.add('on');
  }
  stopRoam() {
    if (this.roamTimer) clearInterval(this.roamTimer);
    this.roamTimer = null;
    $('#tDice').classList.remove('on');
  }

  /* ---------------- favourites ---------------- */
  toggleFav(i) {
    if (i < 0) return;
    const k = DATA.countries[i].k;
    const at = this.favs.indexOf(k);
    if (at >= 0) this.favs.splice(at, 1); else this.favs.push(k);
    localStorage.setItem('atlas.favs', JSON.stringify(this.favs));
    $('#pnFav').classList.toggle('on', this.favs.indexOf(k) >= 0);
    this.toast(this.favs.indexOf(k) >= 0 ? T('favAdd') : T('favDel'));
  }

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('on'), 1800);
  }

  /* ---------------- compare ---------------- */
  startCompare() {
    if (this.cmpPick) { this.cancelCompare(); return; }
    if (this.selId < 0) return;
    this.cmpA = this.selId;
    this.cmpPick = true;
    $('#pnCmp').classList.add('on');
    this.toast(T('cmpPick'));
  }
  cancelCompare() {
    this.cmpPick = false;
    $('#pnCmp').classList.remove('on');
    this.toast(T('cmpCancel'));
  }
  finishCompare(id) {
    if (id === this.cmpA) { this.toast(T('cmpSelf')); return; }
    this.cmpPick = false;
    $('#pnCmp').classList.remove('on');
    this.cmpB = id;
    renderCompare($('#cmpBody'), this.cmpA, this.cmpB);
    $('#cmp').classList.add('open');
  }

  /* ---------------- search ---------------- */
  search(q) {
    const box = $('#sres');
    q = q.trim().toLowerCase();
    if (!q) { box.classList.add('hide'); return; }
    const hits = [];
    for (let i = 0; i < DATA.countries.length; i++) {
      const c = DATA.countries[i];
      const hay = [c.zh, c.zhO, c.en.toLowerCase(), c.enO.toLowerCase(), c.k.toLowerCase(),
        (c.a2 || '').toLowerCase(), c.py || ''];
      let score = -1;
      for (let h = 0; h < hay.length; h++) {
        const idx = hay[h].indexOf(q);
        if (idx === 0) { score = Math.max(score, 100 - h); break; }
        if (idx > 0) score = Math.max(score, 50 - h);
      }
      if (score > 0) hits.push([score + Math.log10((c.pop || 1) + 10), i]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    box.innerHTML = '';
    if (!hits.length) { box.appendChild(el('div', 'sres-item', T('noResult'))); box.classList.remove('hide'); return; }
    for (const [, i] of hits.slice(0, 12)) {
      const c = DATA.countries[i];
      const row = el('div', 'sres-item');
      row.appendChild(el('span', 'fg', c.flag || '🏳'));
      row.appendChild(el('span', 'nm', LANG === 'zh' ? c.zh : c.en));
      row.appendChild(el('span', 'sub', LANG === 'zh' ? c.en : c.zh));
      row.onclick = () => {
        $('#searchBox').value = ''; box.classList.add('hide'); $('#searchBox').blur();
        this.select(i); this.flyToCountry(i);
      };
      box.appendChild(row);
    }
    box.classList.remove('hide');
  }

  /* ---------------- selection & panel ---------------- */
  select(id) {
    if (!this._roaming && this.roamTimer) this.stopRoam();
    this.selId = id;
    this.view.sel = id;
    this.view.dirty = true;
    const p = $('#panel');
    if (id < 0) {
      p.classList.remove('open', 'full');
      this.view.setArcs(-1, null);
      this.updateShift();
      return;
    }
    const c = DATA.countries[id];
    this.view.setArcs(id, (c.borders || []).map((b) => DATA.byKey[b]).filter((x) => x != null));
    this.renderPanel(id);
    p.classList.add('open');
    this.updateShift();
    if ($('#rank').classList.contains('open')) this.renderRank();
  }

  renderPanel(i) {
    const c = DATA.countries[i];
    $('#pnFlag').textContent = c.flag || '🏳';
    $('#pnName').textContent = LANG === 'zh' ? c.zh : c.en;
    $('#pnAlt').textContent = LANG === 'zh' ? `${c.en} · ${c.zhO}` : `${c.zh} · ${c.enO}`;
    $('#pnFav').classList.toggle('on', this.favs.indexOf(c.k) >= 0);
    const chips = $('#pnChips'); chips.innerHTML = '';
    const add = (txt, cls) => { if (txt) chips.appendChild(el('span', 'chip' + (cls ? ' ' + cls : ''), txt)); };
    add(LANG === 'zh' ? c.reg.zh : c.reg.en);
    add(LANG === 'zh' ? c.sub.zh : c.sub.en, 'dim');
    add(c.un ? T('unMember') : T('unNon'), c.un ? 'gold' : 'dim');
    add(c.k, 'dim');
    this.renderBody();
  }

  renderBody() {
    if (this.selId < 0) return;
    renderDossier($('#pnBody'), this.selId, this.tab,
      (j) => { this.select(j); this.flyToCountry(j); },
      (lat, lon) => { this.view.flyTo(lon, lat, this.view.cam.morph > 0.5 ? 0.14 : 1.12, 850); });
    // count-up animation on the KPI numbers
    $$('#pnBody .kpi .cnt').forEach((n, k) => {
      n.style.opacity = '0'; n.style.transform = 'translateY(6px)';
      setTimeout(() => { n.style.transition = 'all .38s cubic-bezier(.2,.9,.3,1)'; n.style.opacity = '1'; n.style.transform = 'none'; }, 60 + k * 70);
    });
  }

  /* ---------------- per-frame ---------------- */
  frame(now, moving) {
    const v = this.view;
    if (this.hoverPos && (this.hoverDirty || moving)) {
      this.hoverDirty = false;
      const id = v.pickAt(this.hoverPos.x, this.hoverPos.y);
      if (id !== v.hover) { v.hover = id; v.dirty = true; }
      const tip = $('#tip');
      if (id >= 0) {
        const c = DATA.countries[id];
        tip.innerHTML = '';
        tip.appendChild(el('b', null, LANG === 'zh' ? c.zh : c.en));
        const extra = this.theme ? `${labelOf(metaOf(this.theme))} ${fmtVal(indVal(c, this.theme), metaOf(this.theme))}`
          : `${LANG === 'zh' ? c.en : c.zh} · ${fmtBig(c.pop).v}${fmtBig(c.pop).u}`;
        tip.appendChild(el('span', null, extra));
        tip.classList.add('on');
        const w = tip.offsetWidth || 120;
        const flip = this.hoverPos.x + w + 30 > v.canvas.clientWidth;
        tip.style.left = this.hoverPos.x + 'px';
        tip.style.top = this.hoverPos.y + 'px';
        tip.style.transform = flip ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)';
      } else tip.classList.remove('on');
    }
    if (now - (this.roT || 0) > 120) {
      this.roT = now;
      const g = v.screenToGeo(this.hoverPos ? this.hoverPos.x : this.cx(), this.hoverPos ? this.hoverPos.y : this.cy());
      $('#roCoord').textContent = g ? fmtCoord(g[0], g[1]) : '—';
      $('#roUTC').textContent = new Date().toISOString().slice(11, 19) + ' UTC';
      $('#roZoom').textContent = 'Z ' + (10 - Math.log2(v.cam.dist) * 2.2).toFixed(1);
    }
  }
}
