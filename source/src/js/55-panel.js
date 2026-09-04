/* ============================================================
   country dossier — nine modules rendered into the side panel
   ============================================================ */
const PANEL_TABS = ['overview', 'geography', 'cities', 'people', 'economy', 'politics', 'military', 'culture', 'envtech', 'sources'];

const UI = {
  sect(host, title) {
    const s = el('div', 'sect');
    s.appendChild(el('h3', null, title));
    host.appendChild(s);
    return s;
  },
  row(s, k, v, note, live) {
    if (v == null || v === '' || v === '—') return null;
    const r = el('div', 'row');
    r.appendChild(el('span', 'k', k));
    const val = el('span', 'v');
    val.textContent = v;
    if (note) val.appendChild(el('em', null, note));
    if (live) { const b = el('i', 'live', '●'); b.title = T('liveTip'); val.appendChild(b); }
    r.appendChild(val); s.appendChild(r);
    return r;
  },
  kpiRow(host, items) {
    const k = el('div', 'kpis');
    for (const it of items) {
      const d = el('div', 'kpi');
      const vv = el('div', 'v');
      vv.appendChild(el('span', 'cnt', it.v));
      if (it.u) vv.appendChild(el('small', null, it.u));
      d.appendChild(vv);
      d.appendChild(el('div', 'l', it.l));
      if (it.r) d.appendChild(el('div', 'rk', '#' + it.r));
      k.appendChild(d);
    }
    host.appendChild(k);
  },
  metric(s, rec, key, i) {
    const m = metaOf(key);
    if (!m) return;
    const v = indVal(rec, key);
    if (v == null) return;
    const rk = DATA.ranks[key] && DATA.ranks[key].rank[i];
    const total = DATA.ranks[key] ? DATA.ranks[key].order.length : 0;
    const r = el('div', 'row metric');
    r.appendChild(el('span', 'k', labelOf(m)));
    const val = el('span', 'v');
    val.appendChild(el('b', null, fmtVal(v, m)));
    const u = unitOf(m);
    if (u && m.fmt !== 'money' && m.fmt !== 'big' && m.fmt.indexOf('pct') < 0) val.appendChild(el('em', null, u));
    const yr = indYear(rec, key);
    if (yr) val.appendChild(el('em', 'yr', String(yr)));
    if (indIsLive(rec, key)) { const b = el('i', 'live', '●'); b.title = T('liveTip'); val.appendChild(b); }
    r.appendChild(val);
    if (rk) {
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = (100 - (rk - 1) / Math.max(1, total - 1) * 100).toFixed(1) + '%';
      bar.appendChild(fill);
      bar.appendChild(el('span', 'rk', `#${rk}/${total}`));
      r.appendChild(bar);
    }
    s.appendChild(r);
  },
  spark(series, years, w, h) {
    if (!series || series.length < 2) return null;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('class', 'spark');
    const mn = Math.min(...series), mx = Math.max(...series);
    const sx = (i) => 4 + i / (series.length - 1) * (w - 8);
    const sy = (v) => h - 6 - (v - mn) / ((mx - mn) || 1) * (h - 18);
    let d = '', a = '';
    series.forEach((v, i) => { d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1); });
    a = d + `L${sx(series.length - 1).toFixed(1)} ${h - 2}L${sx(0).toFixed(1)} ${h - 2}Z`;
    const grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'sg'); grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    for (const [off, col] of [['0%', 'rgba(70,224,184,.42)'], ['100%', 'rgba(70,224,184,0)']]) {
      const st = document.createElementNS(ns, 'stop');
      st.setAttribute('offset', off); st.setAttribute('stop-color', col);
      grad.appendChild(st);
    }
    const defs = document.createElementNS(ns, 'defs'); defs.appendChild(grad); svg.appendChild(defs);
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', a); area.setAttribute('fill', 'url(#sg)'); svg.appendChild(area);
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', d); line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#46e0b8'); line.setAttribute('stroke-width', '1.6');
    line.setAttribute('stroke-linejoin', 'round'); svg.appendChild(line);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', sx(series.length - 1)); dot.setAttribute('cy', sy(series[series.length - 1]));
    dot.setAttribute('r', '2.6'); dot.setAttribute('fill', '#f2b552'); svg.appendChild(dot);
    const wrap = el('div', 'sparkwrap');
    wrap.appendChild(svg);
    const lab = el('div', 'sparklab');
    lab.appendChild(el('span', null, String(years[0])));
    lab.appendChild(el('span', null, String(years[years.length - 1])));
    wrap.appendChild(lab);
    return wrap;
  },
  orgs(host, rec) {
    if (!rec.orgs || !rec.orgs.length) return;
    const box = el('div', 'orgs');
    for (const o of rec.orgs) {
      const m = DATA.orgMeta.find((x) => x.k === o);
      if (!m) continue;
      box.appendChild(el('span', 'org' + (o === 'NUKE' ? ' hot' : ''), LANG === 'zh' ? m.zh : m.en));
    }
    host.appendChild(box);
  },
};

function renderDossier(body, i, tab, onPick, onCity) {
  const c = DATA.countries[i];
  const zh = LANG === 'zh';
  const NA = T('na');
  body.innerHTML = '';

  if (tab === 'overview') {
    const pop = fmtBig(indVal(c, 'pop')), area = fmtBig(c.area);
    const gdp = indVal(c, 'gdp');
    UI.kpiRow(body, [
      { v: pop.v, u: pop.u, l: T('kPop'), r: DATA.ranks.pop.rank[i] },
      { v: area.v, u: (area.u ? area.u + ' ' : '') + 'km²', l: T('kArea'), r: DATA.ranks.area.rank[i] },
      gdp != null
        ? {
          v: zh ? (gdp >= 1000 ? (gdp / 1000).toFixed(2) : (gdp * 10).toFixed(0))
            : (gdp >= 1000 ? (gdp / 1000).toFixed(2) : gdp.toFixed(0)),
          u: zh ? (gdp >= 1000 ? '万亿$' : '亿$') : (gdp >= 1000 ? 'T$' : 'B$'),
          l: 'GDP', r: DATA.ranks.gdp.rank[i],
        }
        : { v: c.dens != null ? fmtInt(c.dens) : '—', u: '', l: T('kDens') },
    ]);
    const s1 = UI.sect(body, T('sectBasic'));
    UI.row(s1, T('kOfficial'), zh ? c.zhO : c.enO);
    UI.row(s1, T('kCapital'), zh ? (c.cap.zh || c.cap.en) : (c.cap.en || c.cap.zh));
    UI.row(s1, T('kRegion'), [zh ? c.reg.zh : c.reg.en, zh ? c.sub.zh : c.sub.en].filter(Boolean).join(' · '));
    UI.row(s1, T('kTz'), c.tz ? 'UTC ' + c.tz : null);
    UI.row(s1, T('kCurrency'), c.cur.map((x) => `${zh && x.zh ? x.zh : x.en}${x.s ? ' ' + x.s : ''} (${x.c})`).join('、') || NA);
    UI.row(s1, T('kLanguage'), c.lang.map((x) => (zh && x.zh ? x.zh : x.en)).join('、') || NA);
    UI.row(s1, T('kCode'), [c.a2, c.k].filter(Boolean).join(' / '));
    UI.row(s1, T('kPhone'), c.idd);
    UI.row(s1, T('kTld'), (c.tld || []).join(' '));
    if (c.parts) UI.row(s1, T('kParts'), c.parts.map((p) => (zh ? p.zh : p.en)).join(' · '));
    if (c.orgs && c.orgs.length) {
      const s2 = UI.sect(body, T('sectOrgs'));
      UI.orgs(s2, c);
    }
    const s3 = UI.sect(body, T('sectNeighbors'));
    const nb = el('div', 'nbrs');
    if (c.borders.length) {
      for (const b of c.borders) {
        const j = DATA.byKey[b];
        if (j == null) continue;
        const chip = el('span', 'nbr', zh ? DATA.countries[j].zh : DATA.countries[j].en);
        chip.onclick = () => onPick(j);
        nb.appendChild(chip);
      }
    } else nb.appendChild(el('span', 'nbr dimchip', T('none')));
    s3.appendChild(nb);
  }

  if (tab === 'geography') {
    const s = UI.sect(body, T('sectGeo'));
    UI.metric(s, c, 'area', i);
    UI.row(s, T('kCoords'), c.ll ? fmtCoord(c.ll[1], c.ll[0]) : NA);
    UI.row(s, T('kCoast'), c.coast != null ? fmtInt(c.coast) + ' km' : NA);
    UI.row(s, T('kElevMax'), c.elevMax != null ? fmtInt(c.elevMax) + ' m' : NA);
    UI.row(s, T('kElevMin'), c.elevMin != null ? fmtInt(c.elevMin) + ' m' : NA);
    UI.row(s, T('kTemp'), c.temp != null ? c.temp.toFixed(1) + ' °C' : NA);
    UI.row(s, T('kLandlocked'), c.landlocked ? T('yes') : T('no'));
    UI.row(s, T('kNeighbors'), String(c.borders.length));
    UI.row(s, T('kTz'), c.tz ? 'UTC ' + c.tz : NA);
    const s2 = UI.sect(body, T('sectEnv'));
    for (const k of ['forest', 'co2', 'renew']) UI.metric(s2, c, k, i);
  }

  if (tab === 'cities') {
    const sc = UI.sect(body, T('sectCities'));
    if (c.cities && c.cities.length) {
      const box = el('div', 'cities rich');
      // rank badges reflect the curated population order, independent of the
      // capital-first display order below (a capital isn't always its
      // country's largest city, so the two orders can legitimately differ)
      const rankOf = new Map(c.cities.map((city, idx) => [city, idx + 1]));
      const ordered = c.cities.slice().sort((a, b) => (b.isCap ? 1 : 0) - (a.isCap ? 1 : 0));
      for (const city of ordered) {
        const row = el('div', 'cityrow' + (city.isCap ? ' cap' : ''));
        row.appendChild(el('span', 'ccrank', '#' + rankOf.get(city)));
        const nameWrap = el('div', 'ccname');
        nameWrap.appendChild(el('span', 'cn', zh ? city.zh : city.en));
        nameWrap.appendChild(el('span', 'ce', zh ? city.en : city.zh));
        row.appendChild(nameWrap);
        const metaWrap = el('div', 'ccmeta');
        if (city.pop) metaWrap.appendChild(el('span', 'cp', fmtBig(city.pop).v + fmtBig(city.pop).u));
        if (city.lat != null && city.lon != null) metaWrap.appendChild(el('span', 'cd', fmtCoord(city.lon, city.lat)));
        row.appendChild(metaWrap);
        if (city.isCap) row.appendChild(el('span', 'capbadge', '★ ' + T('capital')));
        row.onclick = () => onCity && onCity(city.lat, city.lon, zh ? city.zh : city.en);
        box.appendChild(row);
      }
      sc.appendChild(box);
    } else {
      sc.appendChild(el('div', 'emptynote', T('noCityData')));
    }
  }

  if (tab === 'people') {
    const s = UI.sect(body, T('sectPeople'));
    for (const k of ['pop', 'dens', 'medAge', 'fert', 'life', 'urban', 'lit', 'hdi']) UI.metric(s, c, k, i);
    const s2 = UI.sect(body, T('sectSociety'));
    UI.row(s2, T('kReligion'), c.rel || NA);
    UI.row(s2, T('kLanguage'), c.lang.map((x) => (LANG === 'zh' && x.zh ? x.zh : x.en)).join('、') || NA);
    if (c.parts) UI.row(s2, T('kParts'), c.parts.map((p) => `${zh ? p.zh : p.en} ${fmtInt(p.pop)}`).join('　'));
  }

  if (tab === 'economy') {
    const s = UI.sect(body, T('sectEconomy'));
    for (const k of ['gdp', 'gdpPc', 'gdpPpp', 'growth', 'infl', 'unemp']) UI.metric(s, c, k, i);
    if (c.series) {
      const s2 = UI.sect(body, T('sectTrend'));
      const sp = UI.spark(c.series, DATA.seriesYears, 300, 86);
      if (sp) s2.appendChild(sp);
      const first = c.series[0], last = c.series[c.series.length - 1];
      s2.appendChild(el('div', 'note', zh
        ? `${DATA.seriesYears[0]}–${DATA.seriesYears[DATA.seriesYears.length - 1]} 名义 GDP 由 ${fmtVal(first, metaOf('gdp'))} 增至 ${fmtVal(last, metaOf('gdp'))}，累计 ${((last / first - 1) * 100).toFixed(0)}%。`
        : `Nominal GDP grew from ${fmtVal(first, metaOf('gdp'))} to ${fmtVal(last, metaOf('gdp'))} (${((last / first - 1) * 100).toFixed(0)}%).`));
    }
    const s3 = UI.sect(body, T('sectTrade'));
    for (const k of ['exp', 'imp', 'res', 'debt']) UI.metric(s3, c, k, i);
  }

  if (tab === 'politics') {
    const p = c.pol || {};
    const s = UI.sect(body, T('sectPolity'));
    UI.row(s, T('kGov'), p.gov || (c.gov || NA));
    UI.row(s, T('kLegis'), p.legis);
    UI.row(s, T('kAdmin'), p.admin);
    UI.row(s, T('kLaw'), p.law);
    UI.row(s, T('kHos'), p.hos);
    UI.row(s, T('kHog'), p.hog);
    UI.row(s, T('kIndep'), c.indepDate);
    UI.row(s, T('kUN'), c.un ? T('unMember') : T('unNon'));
    const s2 = UI.sect(body, T('sectOrgs'));
    if (c.orgs && c.orgs.length) UI.orgs(s2, c);
    else s2.appendChild(el('div', 'soon', NA));
    body.appendChild(el('div', 'note', T('polNote')));
  }

  if (tab === 'military') {
    const s = UI.sect(body, T('sectMil'));
    for (const k of ['milExp', 'milPct', 'milAct', 'milRes']) UI.metric(s, c, k, i);
    if (!indVal(c, 'milExp') && !indVal(c, 'milAct')) s.appendChild(el('div', 'soon', NA));
    const s2 = UI.sect(body, T('sectNuke'));
    UI.row(s2, T('kNuke'), c.nuke || (c.orgs && c.orgs.indexOf('NUKE') >= 0 ? T('yes') : T('nonNuke')));
    const al = (c.orgs || []).filter((o) => ['NATO', 'SCO', 'CIS'].indexOf(o) >= 0)
      .map((o) => { const m = DATA.orgMeta.find((x) => x.k === o); return m ? (zh ? m.zh : m.en) : o; });
    UI.row(s2, T('kAlliance'), al.length ? al.join('、') : T('none'));
  }

  if (tab === 'culture') {
    const cu = c.cul || {};
    const s = UI.sect(body, T('sectCulture'));
    UI.row(s, T('kAnthem'), cu.anthem);
    UI.row(s, T('kFlower'), cu.flower);
    UI.row(s, T('kAnimal'), cu.animal || c.sym);
    UI.row(s, T('kDish'), cu.dish || c.dish);
    UI.row(s, T('kSport'), cu.sport);
    UI.row(s, T('kFest'), cu.fest);
    UI.row(s, T('kReligion'), c.rel);
    UI.metric(s, c, 'her', i);
    if (!cu.anthem && !c.dish && c.her == null) s.appendChild(el('div', 'soon', NA));
  }

  if (tab === 'envtech') {
    const s = UI.sect(body, T('sectEnv'));
    for (const k of ['co2', 'forest', 'renew']) UI.metric(s, c, k, i);
    const s2 = UI.sect(body, T('sectTech'));
    for (const k of ['net']) UI.metric(s2, c, k, i);
    UI.row(s2, T('kDrive'), c.landlocked == null ? null : null);
    UI.row(s2, T('kTemp'), c.temp != null ? c.temp.toFixed(1) + ' °C' : null);
  }

  if (tab === 'sources') {
    const s = UI.sect(body, T('srcTitle'));
    for (const key of ['srcGeo', 'srcName', 'srcFacts', 'srcInd', 'srcPop']) {
      const r = el('div', 'row');
      r.appendChild(el('span', 'k', '·'));
      r.appendChild(el('span', 'v', T(key)));
      s.appendChild(r);
    }
    const st = el('div', 'sect');
    st.appendChild(el('h3', null, T('liveTitle')));
    const info = el('div', 'note');
    info.textContent = DATA.wb
      ? T('liveOn').replace('%s', new Date(DATA.wb.t).toISOString().slice(0, 10))
      : T('liveOff');
    st.appendChild(info);
    const btn = el('button', 'gbtn', T('liveBtn'));
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = T('liveRun');
      const ok = await refreshOnline((p) => { btn.textContent = T('liveRun') + ' ' + Math.round(p * 100) + '%'; });
      btn.textContent = ok ? T('liveDone') : T('liveFail');
      if (ok) setTimeout(() => window.ATLAS.ui.refreshAll(), 400);
    };
    st.appendChild(btn);
    body.appendChild(st);
    body.appendChild(el('div', 'note', T('srcNote')));
    const vr = el('div', 'note mono', 'BUILD ' + (window.ATLAS ? window.ATLAS.version : ''));
    body.appendChild(vr);
  }
}

/* ---------------- side-by-side comparison ---------------- */
const CMP_KEYS = ['pop', 'area', 'gdp', 'gdpPc', 'growth', 'hdi', 'life', 'medAge', 'urban', 'net', 'milExp', 'milPct', 'co2', 'forest'];

function renderCompare(host, ai, bi) {
  const A = DATA.countries[ai], B = DATA.countries[bi];
  const zh = LANG === 'zh';
  host.innerHTML = '';
  const head = el('div', 'cmp-head');
  for (const [rec, cls] of [[A, 'a'], [B, 'b']]) {
    const d = el('div', 'cmp-side ' + cls);
    d.appendChild(el('span', 'fg', rec.flag || '🏳'));
    d.appendChild(el('span', 'nm', zh ? rec.zh : rec.en));
    head.appendChild(d);
  }
  host.appendChild(head);
  for (const k of CMP_KEYS) {
    const m = metaOf(k);
    const va = indVal(A, k), vb = indVal(B, k);
    if (va == null && vb == null) continue;
    const row = el('div', 'cmp-row');
    row.appendChild(el('div', 'cmp-lab', labelOf(m)));
    const bars = el('div', 'cmp-bars');
    const mx = Math.max(Math.abs(va || 0), Math.abs(vb || 0)) || 1;
    for (const [v, cls] of [[va, 'a'], [vb, 'b']]) {
      const line = el('div', 'cmp-line');
      const bar = el('i', cls + ((v || 0) < 0 ? ' neg' : ''));
      bar.style.width = clamp(Math.abs(v || 0) / mx * 100, 0, 100).toFixed(1) + '%';
      line.appendChild(bar);
      line.appendChild(el('span', null, fmtVal(v, m)));
      bars.appendChild(line);
    }
    row.appendChild(bars);
    host.appendChild(row);
  }
}
