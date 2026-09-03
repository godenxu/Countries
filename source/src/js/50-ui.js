/* ============================================================
   UI: header, search, tooltip, labels, country panel
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
};

const TABS = ['overview', 'geography', 'people', 'economy', 'politics', 'military', 'culture', 'sources'];
const PLANNED = {
  economy: ['GDP（名义 / PPP）', '人均 GDP', 'GDP 增速', '通货膨胀率', '失业率', '三次产业结构',
    '主要出口 / 进口商品', '主要贸易伙伴', '外汇储备', '政府债务率', '近 20 年 GDP 走势'],
  politics: ['政体类型', '国家元首', '政府首脑', '立法机构', '行政区划', '宪法与法律体系',
    '选举周期', '主要政党', '国际组织成员（UN / G20 / 金砖 / 上合 …）'],
  military: ['国防开支（总额 / 占 GDP）', '现役与预备役兵力', '军种构成', '核力量状态',
    '兵役制度', '主战装备概数', '全球军力排名', '军事同盟'],
  culture: ['国歌', '国花 / 国鸟 / 国兽', '代表美食', '主要节日', '世界遗产数量',
    '主要体育项目', '艺术与音乐传统', '著名人物', '礼仪与禁忌'],
};
const PLANNED_EN = {
  economy: ['GDP (nominal / PPP)', 'GDP per capita', 'Growth rate', 'Inflation', 'Unemployment',
    'Sector breakdown', 'Top exports / imports', 'Trade partners', 'Reserves', 'Public debt', '20-year GDP trend'],
  politics: ['Government type', 'Head of state', 'Head of government', 'Legislature', 'Administrative divisions',
    'Constitution & legal system', 'Election cycle', 'Major parties', 'Memberships (UN / G20 / BRICS …)'],
  military: ['Defence budget (total / % GDP)', 'Active & reserve personnel', 'Service branches', 'Nuclear status',
    'Conscription', 'Major equipment', 'Global firepower rank', 'Alliances'],
  culture: ['National anthem', 'National flower / bird / animal', 'National dish', 'Major festivals',
    'World Heritage sites', 'Popular sports', 'Art & music traditions', 'Notable people', 'Etiquette'],
};

class UI {
  constructor(view, countries, meta, version) {
    this.view = view; this.C = countries; this.meta = meta; this.version = version;
    this.tab = 'overview';
    this.labelT = 0;
    this.labelNodes = [];
    this.ranks = this.computeRanks();
    this.build();
    this.wire();
    this.applyLang();
  }

  computeRanks() {
    const byPop = this.C.map((c, i) => [i, c.pop || 0]).sort((a, b) => b[1] - a[1]);
    const byArea = this.C.map((c, i) => [i, c.area || 0]).sort((a, b) => b[1] - a[1]);
    const r = { pop: {}, area: {} };
    byPop.forEach(([i], n) => { r.pop[i] = n + 1; });
    byArea.forEach(([i], n) => { r.area[i] = n + 1; });
    return r;
  }

  build() {
    $('#hbGlobe').innerHTML = ICON.globe;
    $('#hbMap').innerHTML = ICON.map;
    $('#hbFull').innerHTML = ICON.full;
    $('.sicon').innerHTML = ICON.search;
    $('#tZoomIn').innerHTML = ICON.plus;
    $('#tZoomOut').innerHTML = ICON.minus;
    $('#tReset').innerHTML = ICON.reset;
    $('#tSpin').innerHTML = ICON.spin;
    $('#pnClose').innerHTML = ICON.close;
    const tabs = $('#pnTabs');
    tabs.innerHTML = '';
    for (const t of TABS) {
      const b = el('button', 'ptab' + (t === this.tab ? ' on' : ''), '');
      b.dataset.tab = t;
      tabs.appendChild(b);
    }
  }

  wire() {
    const v = this.view;
    $('#hbGlobe').onclick = () => this.setMode(0);
    $('#hbMap').onclick = () => this.setMode(1);
    $('#hbLang').onclick = () => this.toggleLang();
    $('#hbFull').onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
    $('#tZoomIn').onclick = () => v.zoomTo(v.cam.dist * 0.78, this.cx(), this.cy(), false);
    $('#tZoomOut').onclick = () => v.zoomTo(v.cam.dist * 1.28, this.cx(), this.cy(), false);
    $('#tReset').onclick = () => { v.flyTo(105, 22, v.fitDist()); this.select(-1); };
    $('#tSpin').onclick = () => { v.spin = !v.spin; v.spinIdle = 0; $('#tSpin').classList.toggle('on', v.spin); };
    $('#tSpin').classList.toggle('on', v.spin);
    $('#pnClose').onclick = () => this.select(-1);
    $('#pnTabs').onclick = (e) => {
      const b = e.target.closest('.ptab'); if (!b) return;
      this.tab = b.dataset.tab;
      $$('.ptab').forEach((x) => x.classList.toggle('on', x.dataset.tab === this.tab));
      this.renderBody();
    };
    $('#pnHead').addEventListener('click', (e) => {
      if (window.innerWidth <= 720 && !e.target.closest('#pnClose')) {
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
      if (e.key === '/') { e.preventDefault(); sb.focus(); }
      if (e.key === 'Escape') this.select(-1);
      if (e.key === ' ') { e.preventDefault(); $('#tSpin').click(); }
      if (e.key.toLowerCase() === 'm') this.setMode(this.view.cam.morph > 0.5 ? 0 : 1);
    });

    v.onHover = (x, y) => { this.hoverPos = { x, y }; this.hoverDirty = true; };
    v.onHoverOut = () => { this.hoverPos = null; $('#tip').classList.remove('on'); };
    v.onClick = (x, y) => {
      const id = v.pickAt(x, y);
      this.select(id);
      if (id >= 0) {
        const m = this.meta[id];
        const d = clamp(m.r * 3.4 + 0.55, v.cam.morph > 0.5 ? 0.3 : 1.35, v.fitDist() * 0.98);
        v.flyTo(m.lon, m.lat, d);
      }
    };
    window.addEventListener('resize', () => { v.resize(); v.dirty = true; this.updateShift(); this.labelT = 0; });
  }

  cx() { return this.view.canvas.clientWidth / 2; }
  cy() { return this.view.canvas.clientHeight / 2; }

  setMode(m) {
    const v = this.view;
    v.setMorph(m);
    $('#hbGlobe').classList.toggle('on', !m);
    $('#hbMap').classList.toggle('on', !!m);
  }

  // keep the selected country clear of the detail panel
  updateShift() {
    const v = this.view, open = this.selId >= 0 && $('#panel').classList.contains('open');
    const W = v.canvas.clientWidth, H = v.canvas.clientHeight;
    if (!open) { v.setShift(0, 0); $('#tools').style.transform = ''; return; }
    if (W > 720) {
      const pw = $('#panel').getBoundingClientRect().width;
      v.setShift(pw / W, 0);
      $('#tools').style.transform = `translateX(${-Math.round(pw)}px)`;
    } else {
      $('#tools').style.transform = '';
      const ph = $('#panel').classList.contains('full') ? H * 0.48 : 236;
      v.setShift(0, -ph / H);
    }
  }

  toggleLang() {
    LANG = LANG === 'zh' ? 'en' : 'zh';
    localStorage.setItem('atlas.lang', LANG);
    this.applyLang();
  }

  applyLang() {
    document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
    $('#brandName').textContent = T('brand');
    $('#brandSub').textContent = LANG === 'zh' ? 'WORLD ATLAS' : '世界国家信息大全';
    $('#searchBox').placeholder = T('search');
    $('#hbGlobe').title = T('globe'); $('#hbMap').title = T('map');
    $('#tZoomIn').title = T('zoomIn'); $('#tZoomOut').title = T('zoomOut');
    $('#tReset').title = T('reset'); $('#tSpin').title = T('spin'); $('#hbFull').title = T('fullscreen');
    $('#lz').classList.toggle('on', LANG === 'zh');
    $('#le').classList.toggle('on', LANG === 'en');
    $$('.ptab').forEach((b) => { b.textContent = T(b.dataset.tab); });
    $('#lgCoast').textContent = T('coastline');
    $('#lgBorder').textContent = T('border');
    $('#lgDash').textContent = T('ninedash');
    if (this.selId >= 0) this.renderPanel(this.selId);
    this.labelT = 0;
  }

  /* ---------------- search ---------------- */
  search(q) {
    const box = $('#sres');
    q = q.trim().toLowerCase();
    if (!q) { box.classList.add('hide'); return; }
    const hits = [];
    for (let i = 0; i < this.C.length; i++) {
      const c = this.C[i];
      const hay = [c.zh, c.zhO, c.en.toLowerCase(), c.enO.toLowerCase(), c.k.toLowerCase(), (c.a2 || '').toLowerCase()];
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
      const c = this.C[i];
      const row = el('div', 'sres-item');
      row.appendChild(el('span', 'fg', c.flag || '🏳'));
      row.appendChild(el('span', 'nm', LANG === 'zh' ? c.zh : c.en));
      row.appendChild(el('span', 'sub', LANG === 'zh' ? c.en : c.zh));
      row.onclick = () => {
        $('#searchBox').value = ''; box.classList.add('hide'); $('#searchBox').blur();
        this.select(i);
        const m = this.meta[i];
        this.view.flyTo(m.lon, m.lat, clamp(m.r * 3.4 + 0.55, this.view.cam.morph > 0.5 ? 0.3 : 1.35, this.view.fitDist() * 0.98));
      };
      box.appendChild(row);
    }
    box.classList.remove('hide');
  }

  /* ---------------- selection & panel ---------------- */
  select(id) {
    this.selId = id;
    this.view.sel = id;
    this.view.dirty = true;
    const p = $('#panel');
    if (id < 0) { p.classList.remove('open', 'full'); this.updateShift(); return; }
    this.renderPanel(id);
    p.classList.add('open');
    this.updateShift();
  }

  renderPanel(i) {
    const c = this.C[i];
    $('#pnFlag').textContent = c.flag || '🏳';
    $('#pnName').textContent = LANG === 'zh' ? c.zh : c.en;
    $('#pnAlt').textContent = LANG === 'zh' ? `${c.en} · ${c.zhO}` : `${c.zh} · ${c.enO}`;
    const chips = $('#pnChips'); chips.innerHTML = '';
    const add = (txt, cls) => { if (txt) chips.appendChild(el('span', 'chip' + (cls ? ' ' + cls : ''), txt)); };
    add(LANG === 'zh' ? c.reg.zh : c.reg.en);
    add(LANG === 'zh' ? c.sub.zh : c.sub.en, 'dim');
    add(c.un ? T('unMember') : T('unNon'), c.un ? 'gold' : 'dim');
    add(c.k, 'dim');
    this.renderBody();
  }

  renderBody() {
    const i = this.selId, c = this.C[i], m = this.meta[i];
    const body = $('#pnBody');
    body.innerHTML = '';
    const sect = (title) => { const s = el('div', 'sect'); s.appendChild(el('h3', null, title)); body.appendChild(s); return s; };
    const row = (s, k, v, note) => {
      if (v == null || v === '' || v === '—') return;
      const r = el('div', 'row');
      r.appendChild(el('span', 'k', k));
      const val = el('span', 'v'); val.textContent = v;
      if (note) { const e2 = el('em', null, note); val.appendChild(e2); }
      r.appendChild(val); s.appendChild(r);
    };
    const zh = LANG === 'zh';
    const NA = T('na');

    if (this.tab === 'overview') {
      const k = el('div', 'kpis');
      const pop = fmtBig(c.pop), area = fmtBig(c.area);
      const mk = (v, u, l) => {
        const d = el('div', 'kpi');
        const vv = el('div', 'v'); vv.textContent = v;
        if (u) { const s = el('small'); s.textContent = u; vv.appendChild(s); }
        d.appendChild(vv); d.appendChild(el('div', 'l', l)); return d;
      };
      k.appendChild(mk(pop.v, pop.u, T('kPop')));
      k.appendChild(mk(area.v, area.u + (zh ? ' km²' : ' km²'), T('kArea')));
      k.appendChild(mk(c.dens != null ? fmtInt(c.dens) : '—', '', T('kDens')));
      body.appendChild(k);

      const s1 = sect(T('sectBasic'));
      row(s1, T('kOfficial'), zh ? c.zhO : c.enO);
      row(s1, T('kCapital'), zh ? (c.cap.zh || c.cap.en) : (c.cap.en || c.cap.zh));
      row(s1, T('kRegion'), [zh ? c.reg.zh : c.reg.en, zh ? c.sub.zh : c.sub.en].filter(Boolean).join(' · '));
      row(s1, T('kCurrency'), c.cur.map((x) => `${zh && x.zh ? x.zh : x.en}${x.s ? ' ' + x.s : ''} (${x.c})`).join('、') || NA);
      row(s1, T('kLanguage'), c.lang.map((x) => (zh && x.zh ? x.zh : x.en)).join('、') || NA);
      row(s1, T('kCode'), [c.a2, c.k].filter(Boolean).join(' / '));
      row(s1, T('kPhone'), c.idd);
      row(s1, T('kTld'), (c.tld || []).join(' '));
      row(s1, T('kUN'), c.un ? T('unMember') : T('unNon'));
      if (c.parts) {
        row(s1, T('kParts'), c.parts.map((p) => `${zh ? p.zh : p.en}`).join(' · '));
      }
      const s2 = sect(T('sectNeighbors'));
      const nb = el('div', 'nbrs');
      if (c.borders.length) {
        for (const b of c.borders) {
          const j = this.C.findIndex((x) => x.k === b);
          if (j < 0) continue;
          const chip = el('span', 'nbr', zh ? this.C[j].zh : this.C[j].en);
          chip.onclick = () => {
            this.select(j);
            const mm = this.meta[j];
            this.view.flyTo(mm.lon, mm.lat, clamp(mm.r * 3.4 + 0.55, this.view.cam.morph > 0.5 ? 0.3 : 1.35, this.view.fitDist() * 0.98));
          };
          nb.appendChild(chip);
        }
      } else nb.appendChild(el('span', 'nbr', T('none')));
      s2.appendChild(nb);
      body.appendChild(el('div', 'note', T('p1Notice')));
    }

    if (this.tab === 'geography') {
      const s = sect(T('sectGeo'));
      row(s, T('kArea'), c.area != null ? fmtInt(c.area) + ' km²' : NA,
        this.ranks.area[i] ? `#${this.ranks.area[i]}` : '');
      row(s, T('kCoords'), c.ll ? fmtCoord(c.ll[1], c.ll[0]) : (m ? fmtCoord(m.lon, m.lat) : NA));
      row(s, T('kCoast'), c.coast != null ? fmtInt(c.coast) + ' km' : NA);
      row(s, T('kElevMax'), c.elevMax != null ? fmtInt(c.elevMax) + ' m' : NA);
      row(s, T('kElevMin'), c.elevMin != null ? fmtInt(c.elevMin) + ' m' : NA);
      row(s, T('kTemp'), c.temp != null ? c.temp.toFixed(1) + ' °C' : NA);
      row(s, T('kLandlocked'), c.landlocked ? T('yes') : T('no'));
      row(s, T('kNeighbors'), String(c.borders.length));
    }

    if (this.tab === 'people') {
      const s = sect(T('sectSociety'));
      row(s, T('kPop'), c.pop != null ? fmtInt(c.pop) : NA,
        this.ranks.pop[i] ? `#${this.ranks.pop[i]} · ${c.popY}` : '');
      row(s, T('kDens'), c.dens != null ? c.dens + (zh ? ' 人/km²' : ' /km²') : NA);
      row(s, T('kLife'), c.life != null ? c.life.toFixed(1) + (zh ? ' 岁' : ' yrs') : NA);
      row(s, T('kReligion'), c.rel || NA);
      row(s, T('kLanguage'), c.lang.map((x) => (zh && x.zh ? x.zh : x.en)).join('、') || NA);
      if (c.parts) row(s, T('kParts'), c.parts.map((p) => `${zh ? p.zh : p.en} ${fmtInt(p.pop)}`).join('　'));
    }

    if (PLANNED[this.tab]) {
      const s = sect(T(this.tab));
      const list = (zh ? PLANNED : PLANNED_EN)[this.tab];
      const d = el('div', 'soon');
      d.appendChild(el('b', null, zh ? '该模块将在 P2 / P3 版本接入' : 'Arriving in the P2 / P3 build'));
      d.appendChild(document.createTextNode(list.join(zh ? ' · ' : ' · ')));
      s.appendChild(d);
      // a couple of facts we already hold
      if (this.tab === 'politics') {
        row(s, T('kGov'), c.gov || NA);
        row(s, T('kIndep'), c.indepDate || NA);
      }
      if (this.tab === 'culture') {
        row(s, T('kDish'), c.dish || NA);
        row(s, T('kSymbol'), c.sym || NA);
        row(s, T('kReligion'), c.rel || NA);
      }
    }

    if (this.tab === 'sources') {
      const s = sect(T('srcTitle'));
      for (const key of ['srcGeo', 'srcName', 'srcFacts', 'srcPop']) {
        const r = el('div', 'row');
        r.appendChild(el('span', 'k', '·'));
        r.appendChild(el('span', 'v', T(key)));
        s.appendChild(r);
      }
      body.appendChild(el('div', 'note', T('srcNote')));
      const vr = el('div', 'note', 'BUILD ' + this.version);
      vr.style.marginTop = '10px';
      body.appendChild(vr);
    }
  }

  /* ---------------- per-frame overlays ---------------- */
  frame(now, moving) {
    const v = this.view;
    // pick only when the pointer or the camera actually moved
    if (this.hoverPos && (this.hoverDirty || moving)) {
      this.hoverDirty = false;
      const id = v.pickAt(this.hoverPos.x, this.hoverPos.y);
      if (id !== v.hover) { v.hover = id; v.dirty = true; }
      const tip = $('#tip');
      if (id >= 0) {
        const c = this.C[id];
        tip.innerHTML = '';
        tip.appendChild(el('b', null, LANG === 'zh' ? c.zh : c.en));
        const sp = el('span', null, `${LANG === 'zh' ? c.en : c.zh} · ${fmtBig(c.pop).v}${fmtBig(c.pop).u}`);
        tip.appendChild(sp);
        tip.classList.add('on');
        const w = tip.offsetWidth || 120;
        const flip = this.hoverPos.x + w + 30 > v.canvas.clientWidth;
        tip.style.left = this.hoverPos.x + 'px';
        tip.style.top = this.hoverPos.y + 'px';
        tip.style.transform = flip ? `translate(calc(-100% - 14px), -50%)` : 'translate(14px, -50%)';
      } else tip.classList.remove('on');
    }
    // readouts
    if (now - (this.roT || 0) > 120) {
      this.roT = now;
      const g = v.screenToGeo(this.hoverPos ? this.hoverPos.x : this.cx(), this.hoverPos ? this.hoverPos.y : this.cy());
      $('#roCoord').textContent = g ? fmtCoord(g[0], g[1]) : '—';
      const d = new Date();
      $('#roUTC').textContent = d.toISOString().slice(11, 19) + ' UTC';
      $('#roZoom').textContent = 'Z ' + (10 - Math.log2(v.cam.dist) * 2.2).toFixed(1);
    }
    if (now - this.labelT > 140) { this.labelT = now; this.updateLabels(); }
  }

  updateLabels() {
    const v = this.view, M = v.matrices();
    const W = v.canvas.clientWidth, H = v.canvas.clientHeight;
    const panelOpen = this.selId >= 0 && $('#panel').classList.contains('open');
    const panelW = panelOpen && W > 720 ? $('#panel').getBoundingClientRect().width : 0;
    const morph = easeIO(clamp(v.cam.morph, 0, 1));
    const eyeLen = Math.hypot(M.eye[0], M.eye[1], M.eye[2]);
    const cands = [];
    const minArea = Math.pow(v.cam.dist, 2) * 26000;
    for (let i = 0; i < this.meta.length; i++) {
      const m = this.meta[i];
      if (m.area < minArea) continue;
      const lo = m.lon * DEG, la = m.lat * DEG, cl = Math.cos(la);
      const sp = [cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)];
      let d = Math.abs(((m.lon - v.cam.lon + 540) % 360) - 180) / 180;
      const t = smoothstep(clamp((morph * 1.42 - d * 0.42), 0, 1));
      const pe = equalEarth(m.lon, m.lat);
      const p = [lerp(sp[0], pe[0] * PLANE_SCALE, t), lerp(sp[1], pe[1] * PLANE_SCALE, t), lerp(sp[2], 0, t)];
      if (morph < 0.5) {
        const dot = (sp[0] * M.eye[0] + sp[1] * M.eye[1] + sp[2] * M.eye[2]) / eyeLen;
        if (dot < 0.34) continue;
      }
      const cp = M4.mulVec(M.vp, [p[0], p[1], p[2], 1]);
      if (cp[3] <= 0) continue;
      const x = (cp[0] / cp[3] * 0.5 + 0.5) * W, y = (0.5 - cp[1] / cp[3] * 0.5) * H;
      if (x < 6 || y < 6 || y > H - 6) continue;
      cands.push({ i, x, y, a: m.area });
    }
    cands.sort((a, b) => b.a - a.a);
    const cells = new Set();
    const out = [];
    for (const c of cands) {
      if (out.length >= 44) break;
      if (c.x > W - panelW - 8) continue;
      const gx = Math.round(c.x / 68), gy = Math.round(c.y / 26);
      const key = gx + ':' + gy;
      if (cells.has(key)) continue;
      cells.add(key); cells.add((gx + 1) + ':' + gy); cells.add((gx - 1) + ':' + gy);
      out.push(c);
    }
    const host = $('#labels');
    while (this.labelNodes.length < out.length) {
      const n = el('div', 'lbl'); host.appendChild(n); this.labelNodes.push(n);
    }
    this.labelNodes.forEach((n, k) => {
      const c = out[k];
      if (!c) { n.style.display = 'none'; return; }
      const rec = this.C[c.i];
      n.style.display = '';
      n.textContent = LANG === 'zh' ? rec.zh : rec.en;
      n.className = 'lbl' + (c.a < 400000 ? ' sm' : '') + (c.i === this.selId ? ' sel' : '');
      n.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px) translate(-50%,-50%)`;
    });
  }
}
function smoothstep(t) { return t * t * (3 - 2 * t); }
