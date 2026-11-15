/* LaXis & OnAllies — browser UI (hot-seat). */
(function () {
  'use strict';
  const E = window.LaxisEngine;
  const MAP = window.LAXIS_MAP;
  const AI = window.LaxisAI;
  const { UNITS, SIDE, Z } = E;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SAVE_KEY = 'laxis-onallies-save-v1';
  const LETTER = { inf: 'I', tank: 'T', heli: 'H', plane: 'P', zombie: 'Z' };

  let game = null;
  let cpu = { LAX: false, ONA: false };
  let sel = null; // { tid, pick: {type: n} }
  let reach = [];
  let errMsg = '';
  let focusBattle = null;
  let cpuTimer = null;
  let casDraft = {};       // 'tid|side' -> { type: n } while a player picks casualties
  let animFocus = [];      // territories brightened while an action animates
  let animSkip = new Set(); // unit ids drawn as moving tokens instead of in place
  const SETTINGS_KEY = 'laxis-onallies-settings-v1';
  const SPEEDS = { slow: 1600, normal: 800, fast: 350, instant: 0 };
  let settings = { speed: 'normal' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
  function stepDelay() { return SPEEDS[settings.speed] != null ? SPEEDS[settings.speed] : 800; }
  const $ = (id) => document.getElementById(id);
  const svg = $('map');
  const layers = {};
  const tEls = {};
  const zEls = {};
  const wallEls = {};

  // ---------------------------------------------------------------- storage
  function save() {
    // the per-move undo stack is session-only; keep saves small
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ s: game.s, cpu }, (k, v) => (k === 'moveUndo' ? undefined : v))); } catch (e) { /* storage unavailable */ }
  }
  function loadSave() {
    try { const j = localStorage.getItem(SAVE_KEY); return j ? JSON.parse(j) : null; } catch (e) { return null; }
  }

  // ------------------------------------------------------------- map build
  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  let vb;
  function buildMap() {
    const [x0, y0, w, h] = MAP.viewBox;
    vb = { x: x0, y: y0, w, h };
    setVB();
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'zhatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 8, height: 8, fill: 'rgba(61,139,47,.18)' }, pat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: 'rgba(61,139,47,.85)', 'stroke-width': 3.2 }, pat);
    const mk = el('marker', { id: 'arrowhead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#3d8b2f' }, mk);
    const ART = window.LaxisArt;
    if (ART) defs.insertAdjacentHTML('beforeend', ART.WAVES);
    el('rect', { x: x0 - w, y: y0 - h, width: w * 3, height: h * 3, fill: ART ? 'url(#waves)' : 'var(--water)' }, svg);
    for (const name of ['land', 'terr', 'zom', 'water', 'roads', 'borders', 'walls', 'gates', 'doodles', 'arrows', 'labels', 'route', 'units']) layers[name] = el('g', { class: 'layer-' + name }, svg);
    const rh = el('marker', { id: 'routehead', viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#2b2117' }, rh);
    for (const p of MAP.backdrop || []) el('path', { d: p.path, fill: p.kind === 'mn' ? 'var(--mn)' : 'var(--outside)', stroke: '#9b927f', 'stroke-width': .4 }, layers.land);
    for (const t of MAP.territories) {
      const p = el('path', { d: t.path, class: 'terr' + (t.inside ? '' : ' outside'), 'data-id': t.id }, layers.terr);
      const title = el('title', {}, p); title.textContent = t.name;
      tEls[t.id] = p;
      zEls[t.id] = el('path', { d: t.path, fill: 'url(#zhatch)', 'pointer-events': 'none', style: 'display:none' }, layers.zom);
      el('path', { d: t.path, class: 'border' }, layers.borders);
    }
    if (window.LaxisArt) for (const d of MAP.doodles || []) {
      const art = window.LaxisArt.DOODLES[d.kind];
      if (art) { const g = el('g', { transform: `translate(${d.x},${d.y}) scale(1.3)` }, layers.doodles); g.innerHTML = art; }
    }
    for (const rp of MAP.rivers || []) el('path', { d: rp, fill: 'none', stroke: 'var(--water)', 'stroke-width': 4, 'stroke-linecap': 'round' }, layers.water);
    for (const r of MAP.roads || []) el('path', { d: r.path, class: 'road ' + (r.cls || '') }, layers.roads);
    for (const w of MAP.walls) {
      // a narrow slot along the border, with a Catan-road-style wooden bar sitting in it
      el('path', { d: w.path, class: 'wallslot-edge' }, layers.walls);
      const slot = el('path', { d: w.path, class: 'wallslot' }, layers.walls);
      const info = window.LaxisArt ? window.LaxisArt.pathInfo(w.path) : null;
      let piece = null;
      if (info) {
        const [px, py] = w.gate && w.gateAt ? w.gateAt : [info.x, info.y];
        piece = el('g', { class: 'wallpiece', transform: `translate(${px},${py}) rotate(${info.angle})` }, layers.gates);
        piece.innerHTML = window.LaxisArt.wallBar(info.length * 0.8, w.gate);
        const tt = el('title', {}, piece);
        tt.textContent = `Wall W${w.no}` + (w.gate ? ' (highway gate: ' + (w.gateRoads || []).join(', ') + ')' : '');
      }
      wallEls[w.id] = { slot, piece };
    }
    const byId = Object.fromEntries(MAP.territories.map(t => [t.id, t]));
    for (const t of MAP.territories) {
      for (const n of t.zombieNext || []) {
        const a = t.label, b = byId[n].label;
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        const s = 14 / L, e = 1 - 18 / L;
        el('path', { d: `M${a[0] + dx * s},${a[1] + dy * s} L${a[0] + dx * e},${a[1] + dy * e}`, class: 'zarrow' }, layers.arrows);
      }
    }
    for (const t of MAP.territories) {
      const [x, y] = t.label;
      const name = el('text', { x, y: y - 14, class: 'tlabel' }, layers.labels);
      name.textContent = t.short || t.name;
      if (window.LaxisArt && (t.value || t.kwikTrips)) {
        const row = el('g', { transform: `translate(${x},${y}) scale(1.35)` }, layers.labels);
        row.innerHTML = window.LaxisArt.badgeRow(t.value, t.kwikTrips, 7).svg;
      }
      for (const sp of t.special || []) {
        const icon = { cityhall: '★', airport: '✈', gundersen: '✚' }[sp];
        if (!icon) continue;
        const it = el('text', { x: x + (sp === 'gundersen' ? -30 : 30), y: y + 5, 'font-size': 13, 'text-anchor': 'middle', fill: '#2b2620', 'pointer-events': 'none' }, layers.labels);
        it.textContent = icon;
      }
    }
    attachPanZoom();
  }
  function valueText(t) {
    const parts = [];
    if (t.value) parts.push(`worth ${t.value}`);
    if (t.kwikTrips) parts.push(`${t.kwikTrips} oil`);
    return parts.join(' · ');
  }
  function setVB() { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }

  function attachPanZoom() {
    let drag = null;
    const toSvg = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      const scale = Math.max(vb.w / r.width, vb.h / r.height);
      const ox = vb.x + (vb.w - r.width * scale) / 2, oy = vb.y + (vb.h - r.height * scale) / 2;
      return { x: ox + (cx - r.left) * scale, y: oy + (cy - r.top) * scale, scale };
    };
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      zoomAt(ev.deltaY < 0 ? 0.85 : 1 / 0.85, toSvg(ev.clientX, ev.clientY));
    }, { passive: false });
    const hitAt = (cx, cy) => {
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !hit.closest) return null;
      const chip = hit.closest('.unitchip[data-tid]');
      if (chip) return { tid: chip.dataset.tid, type: chip.dataset.type, owner: chip.dataset.owner };
      const id = hit.getAttribute && hit.getAttribute('data-id');
      return id ? { tid: id } : null;
    };
    svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button === 2) { drag = { right: true, x: ev.clientX, y: ev.clientY }; return; }
      drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, moved: false, target: ev.target };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointerleave', () => { if (hoverTid) { hoverTid = null; drawRoute(); } });
    svg.addEventListener('pointermove', (ev) => {
      if (!drag) {
        const h = hitAt(ev.clientX, ev.clientY);
        const tid = h ? h.tid : null;
        if (tid !== hoverTid) { hoverTid = tid; drawRoute(); }
        return;
      }
      if (drag.right) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved) {
        svg.classList.add('dragging');
        const { scale } = toSvg(0, 0);
        vb.x = drag.vx - dx * scale; vb.y = drag.vy - dy * scale; setVB();
      }
    });
    svg.addEventListener('pointerup', (ev) => {
      svg.classList.remove('dragging');
      if (drag && drag.right) { onRightClick(ev.shiftKey); drag = null; return; }
      if (drag && !drag.moved) {
        const h = hitAt(ev.clientX, ev.clientY);
        if (h) onTerritoryClick(h.tid, { type: h.type, owner: h.owner, shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey });
      }
      drag = null;
    });
    $('zin').onclick = () => zoomAt(0.75);
    $('zout').onclick = () => zoomAt(1 / 0.75);
    $('zfit').onclick = () => { const [x0, y0, w, h] = MAP.viewBox; vb = { x: x0, y: y0, w, h }; setVB(); };
  }
  function zoomAt(f, pt) {
    pt = pt || { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    const nw = Math.min(Math.max(vb.w * f, MAP.viewBox[2] / 8), MAP.viewBox[2] * 1.5);
    const k = nw / vb.w;
    vb.x = pt.x - (pt.x - vb.x) * k; vb.y = pt.y - (pt.y - vb.y) * k;
    vb.w = nw; vb.h = vb.h * k; setVB();
  }

  // --------------------------------------------------------------- render
  function fillFor(t) {
    const o = game.owner(t.id);
    if (o === 'LAX') return 'var(--lax-soft)';
    if (o === 'ONA') return 'var(--ona-soft)';
    if (t.spawn) return 'var(--spawn)';
    return t.inside ? 'var(--unowned)' : 'var(--outside)';
  }
  function render() {
    const s = game.s;
    // header
    $('round').textContent = `Round ${s.round}`;
    const side = game.activeSide();
    const badge = $('sidebadge');
    badge.className = 'badge ' + side;
    badge.textContent = side === Z ? (s.zombieController ? `Zombies (${SIDE[s.zombieController].name})` : 'Zombies') : SIDE[side].name;
    $('phase').textContent = game.phaseName();
    $('undoBtn').disabled = !game.canUndo() || isCpuTurn();
    $('undoMoveBtn').disabled = !game.canUndoMove() || isCpuTurn();
    $('undoMoveBtn').style.display = isMovingPhase() ? '' : 'none';
    const endBtn = $('endBtn');
    endBtn.textContent = endLabel();
    const can = game.canEndPhase();
    endBtn.disabled = !!s.winner || isCpuTurn() || !can.ok;
    endBtn.title = can.ok ? '' : can.error;
    // map
    const battleT = new Set((s.battles || []).filter(b => !b.done).map(b => b.tid));
    // brighten: destinations while a territory is picked, otherwise every territory with units that can move
    const movable = new Set();
    if (!sel && isMovingPhase() && !isCpuTurn()) for (const t of MAP.territories) if (movableUnits(t.id).length) movable.add(t.id);
    for (const t of MAP.territories) {
      const p = tEls[t.id];
      p.style.fill = fillFor(t);
      p.classList.toggle('sel', !!sel && sel.tid === t.id);
      p.classList.toggle('hl', reach.includes(t.id) || movable.has(t.id) || animFocus.includes(t.id));
      p.classList.toggle('battle', battleT.has(t.id) || focusBattle === t.id);
      zEls[t.id].style.display = game.hasZombies(t.id) ? '' : 'none';
    }
    for (const w of MAP.walls) {
      const we = wallEls[w.id];
      we.slot.setAttribute('class', 'wallslot' + (s.walls[w.id] ? '' : ' broken'));
      if (we.piece) we.piece.style.display = s.walls[w.id] ? '' : 'none';
    }
    layers.arrows.style.display = $('mArrows').checked ? '' : 'none';
    layers.roads.style.display = $('mRoads').checked ? '' : 'none';
    renderUnits();
    drawRoute();
    renderSide();
    renderLog();
    if (s.winner && !render.shownOver) { render.shownOver = true; showGameOver(); }
  }
  function isMovingPhase() {
    const ph = game.s.phase;
    return ph === 'combatMove' || ph === 'noncombatMove' || (ph === 'zombieMove' && !!game.s.zombieController);
  }
  function endLabel() {
    const ph = game.s.phase;
    return {
      purchase: 'Done buying →', combatMove: 'Done moving → Combat', combat: 'End combat →',
      noncombatMove: 'End turn ✓', zombieMove: game.s.zombieController ? 'Done shambling →' : 'Zombies shamble →',
      zombieSpawn: 'Roll spawn dice →', zombieCombat: 'Zombies feast →', gameOver: 'Game over',
    }[ph] || 'End phase';
  }
  const CHIP_W = 22, CHIP_H = 20, CHIP_GAP = 2.5;
  function drawChip(parent, x, y, owner, type, n, opts) {
    opts = opts || {};
    const lift = opts.picked ? `translate(${x - CHIP_W * 0.1},${y - 8}) scale(1.2)` : `translate(${x},${y})`;
    const g = el('g', { class: 'unitchip' + (opts.picked ? ' picked' : '') + (opts.dim ? ' dim' : ''), transform: lift }, parent);
    if (opts.tid) { g.dataset.tid = opts.tid; g.dataset.type = type; g.dataset.owner = owner; }
    const bg = el('rect', { width: CHIP_W, height: CHIP_H, rx: 4 }, g);
    bg.setAttribute('class', 'chip-' + owner);
    const ic = el('g', { transform: `translate(${CHIP_W / 2},${CHIP_H / 2}) scale(.82)`, fill: '#fff', color: '#fff' }, g);
    ic.innerHTML = (window.LaxisArt && window.LaxisArt.UNIT_ICON[type]) || '';
    if (n > 1) {
      el('circle', { cx: CHIP_W - 1, cy: 1, r: 6.2, fill: '#2b2117', stroke: '#fff', 'stroke-width': .9 }, g);
      const tx = el('text', { x: CHIP_W - 1, y: 4.2, class: 'count' }, g);
      tx.textContent = n;
    }
    const tt = el('title', {}, g);
    tt.textContent = `${n} ${SIDE[owner].name} ${UNITS[type].name}` + (opts.picked ? ' (selected)' : '');
    return g;
  }
  function chipOrigin(tid, nChips) {
    const t = game.T[tid];
    const total = nChips * CHIP_W + (nChips - 1) * CHIP_GAP;
    return [t.label[0] - total / 2, t.label[1] + 13];
  }
  function renderUnits() {
    layers.units.innerHTML = '';
    const by = {};
    for (const u of Object.values(game.s.units)) {
      if (animSkip.has(u.id)) continue;
      const k = u.at;
      by[k] = by[k] || {};
      const key = u.owner + ':' + u.type;
      by[k][key] = (by[k][key] || 0) + 1;
    }
    const order = ['LAX', 'ONA', 'Z'];
    const typeOrder = ['inf', 'tank', 'heli', 'plane', 'zombie'];
    const moverSide = game.isZombieTurn() ? Z : game.s.current;
    for (const tid in by) {
      const chips = [];
      for (const [key, n] of Object.entries(by[tid])) {
        const [owner, type] = key.split(':');
        const picked = sel && sel.tid === tid && owner === moverSide ? Math.min(n, sel.pick[type] || 0) : 0;
        if (picked) chips.push({ owner, type, n: picked, picked: true });
        if (n - picked > 0) chips.push({ owner, type, n: n - picked, picked: false });
      }
      const anyPicked = chips.some(c => c.picked);
      chips.sort((a, b) => (b.picked - a.picked) || (order.indexOf(a.owner) - order.indexOf(b.owner)) || (typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)));
      let [x, y] = chipOrigin(tid, chips.length);
      for (const c of chips) {
        drawChip(layers.units, x, y, c.owner, c.type, c.n, { tid, picked: c.picked, dim: anyPicked && !c.picked && c.owner === moverSide });
        x += CHIP_W + CHIP_GAP;
      }
    }
  }

  // ------------------------------------------------------------ route preview (TripleA-style)
  let hoverTid = null;
  function drawRoute() {
    if (!layers.route) return;
    layers.route.innerHTML = '';
    if (!sel || !hoverTid || !reach.includes(hoverTid)) return;
    let path = null;
    if (game.s.phase === 'zombieMove') path = [sel.tid, hoverTid];
    else { const r = game.findPath(pickedIds(), sel.tid, hoverTid); path = r && r.path; }
    if (!path) return;
    const pts = path.map(id => game.T[id].label);
    const d = 'M' + pts.map(p => `${p[0]},${p[1]}`).join('L');
    el('path', { d, class: 'route-casing' }, layers.route);
    el('path', { d, class: 'route' }, layers.route);
    for (const p of pts.slice(1, -1)) el('circle', { cx: p[0], cy: p[1], r: 3, class: 'route-stop' }, layers.route);
  }
  // ------------------------------------------------------------ animation
  function positions() {
    const m = {};
    for (const id in game.s.units) m[id] = game.s.units[id].at;
    return m;
  }
  /** Unit stacks that changed territory since `before`, grouped by from/to/owner/type. */
  function diffMoves(before) {
    const groups = {};
    for (const id in game.s.units) {
      const u = game.s.units[id];
      const from = before[id];
      if (!from || from === u.at) continue;
      const k = [from, u.at, u.owner, u.type].join('|');
      (groups[k] = groups[k] || { from, to: u.at, owner: u.owner, type: u.type, ids: [] }).ids.push(id);
    }
    return Object.values(groups);
  }
  function animateMoves(moves, ms) {
    return new Promise((resolve) => {
      if (!moves.length || ms <= 0) { resolve(); return; }
      animSkip = new Set(moves.flatMap(m => m.ids));
      animFocus = [...new Set(moves.flatMap(m => [m.from, m.to]))];
      render();
      const tokens = moves.map((m, i) => {
        const [fx, fy] = chipOrigin(m.from, 1), [tx, ty] = chipOrigin(m.to, 1);
        const off = (i % 3) * 6;
        const g = drawChip(layers.units, 0, 0, m.owner, m.type, m.ids.length);
        g.classList.add('flying');
        return { g, fx: fx + off, fy: fy + off, tx: tx + off, ty: ty + off };
      });
      const t0 = performance.now();
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        for (const tk of tokens) tk.g.setAttribute('transform', `translate(${tk.fx + (tk.tx - tk.fx) * e},${tk.fy + (tk.ty - tk.fy) * e})`);
        if (k < 1) requestAnimationFrame(frame);
        else { animSkip = new Set(); animFocus = []; resolve(); }
      };
      requestAnimationFrame(frame);
    });
  }
  function renderLog() {
    const box = $('log');
    const items = game.s.log.slice(-160);
    box.innerHTML = items.map(l => `<div class="${l.kind}">${escapeHtml(l.msg)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function dice(rolls, sixMode) {
    return '<div class="dice">' + rolls.map(r => `<span class="die ${sixMode ? (r.roll === 6 ? 'six' : '') : (r.hit ? 'hit' : '')}" title="${r.type || ''}">${r.roll}</span>`).join('') + '</div>';
  }
  /** Dice grouped by unit type: icon, count, the number each type hits on, the dice, and hits. */
  function diceByType(rolls, stat, owner) {
    const order = E.CASUALTY_ORDER;
    const groups = {};
    for (const r of rolls) (groups[r.type] = groups[r.type] || []).push(r);
    const types = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (!types.length) return '<div class="help">no dice</div>';
    return types.map(type => {
      const rs = groups[type];
      const need = UNITS[type][stat];
      const hits = rs.filter(r => r.hit).length;
      const icon = window.LaxisArt ? `<svg class="mini chip-bg-${owner}" viewBox="-11 -11 22 22" width="18" height="18"><g fill="#fff" color="#fff">${window.LaxisArt.UNIT_ICON[type]}</g></svg>` : '';
      return `<div class="dicerow"><span class="dt">${icon}<span><b>${rs.length} ${UNITS[type].name}</b> <small>hit on ${need === 1 ? '1' : '1–' + need}</small></span></span>` +
        `<span class="dice">${rs.map(r => `<span class="die ${r.hit ? 'hit' : ''}">${r.roll}</span>`).join('')}</span>` +
        `<span class="hits">${hits} hit${hits === 1 ? '' : 's'}</span></div>`;
    }).join('');
  }
  function lostText(types) {
    if (!types || !types.length) return 'no losses';
    const c = {};
    for (const t of types) c[t] = (c[t] || 0) + 1;
    return 'lost ' + Object.keys(c).map(k => `${c[k]} ${UNITS[k].name}`).join(', ');
  }
  function tname(id) { return game.T[id].name; }
  function countsText(units) {
    const c = game.countBy(units);
    return Object.keys(c).map(k => `${c[k]} ${UNITS[k].name}`).join(', ') || 'none';
  }

  function renderSide() {
    const s = game.s;
    const side = $('side');
    let h = '';
    // player stats
    h += '<div class="stats">';
    for (const p of E.PLAYERS) {
      const pl = s.players[p];
      const inc = game.income(p);
      h += `<div class="stat ${p} ${pl.defeated ? 'dead' : ''}"><small>${SIDE[p].name}${cpu[p] ? ' (CPU)' : ''}</small>
        <b>${pl.sp} SP · ${pl.oil} oil</b><small>income +${inc.sp} SP, +${inc.oil} oil${pl.holding ? ' · <b style="color:var(--accent)">HOLDING!</b>' : ''}</small></div>`;
    }
    h += '</div>';
    const zc = Object.values(s.units).filter(u => u.owner === Z).length;
    const broken = Object.values(s.walls).filter(v => !v).length;
    h += `<p class="help">Zombies on board: <b>${zc}</b> · Walls breached: <b>${broken}/${MAP.walls.length}</b> · Spawn dice per outskirt this round: <b>${game.spawnDiceCount()}</b></p>`;
    h += `<div class="err" id="err">${escapeHtml(errMsg)}</div>`;
    if (s.winner) {
      h += `<h2>Game over</h2><p>${s.winner === Z ? 'The zombies have taken the Coulee Region.' : SIDE[s.winner].name + ' wins!'}</p>`;
    } else if (isCpuTurn()) {
      h += `<div class="cpu-banner">${SIDE[game.activeSide() === Z ? s.zombieController : game.activeSide()].name} (computer) is playing — ${escapeHtml(game.phaseName())}</div>`;
      h += `<div class="cpu-lock">${phasePanel()}</div>`;
    } else {
      h += phasePanel();
    }
    if (sel) h += territoryCard(sel.tid);
    side.innerHTML = h;
    wireSide();
  }

  function phasePanel() {
    const s = game.s;
    const p = s.current;
    let h = '';
    switch (s.phase) {
      case 'purchase': {
        h += `<h2>Purchase units</h2><p class="help">New units appear at your City Hall at the end of your turn. Aircraft need the Airport.</p>`;
        for (const type of ['inf', 'tank', 'heli', 'plane']) {
          const u = UNITS[type];
          if (u.only && u.only !== p) continue;
          const n = s.pending.filter(x => x === type).length;
          const can = game.canBuy(type);
          h += `<div class="row"><span class="name"><b>${u.name}</b> <small>${u.cost} SP · A${u.att} D${u.def} M${u.move}${u.oil ? ' · oil' : ''}</small></span>
            <span class="stepper"><button data-unbuy="${type}" ${n ? '' : 'disabled'}>−</button><output>${n}</output>
            <button data-buy="${type}" ${can.ok ? '' : `disabled title="${escapeHtml(can.error)}"`}>+</button></span></div>`;
        }
        break;
      }
      case 'combatMove':
      case 'noncombatMove':
        h += `<h2>${game.phaseName()}</h2><p class="help">${s.phase === 'combatMove'
          ? 'Click one of your territories, choose units, then click a highlighted destination. Moving into zombies or enemy units starts a battle. Moving into an empty territory captures it. Land units can only leave or enter the city through a highway gate (gold wall piece) or a breach. Units that stay put can fire from the wall.'
          : 'Units that did not move or fight may move into friendly territory. Aircraft that flew must end on a landing site (Airport; Gundersen for the helicopter), or they crash.'}</p>`;
        h += moveCard();
        break;
      case 'combat':
        h += combatPanel();
        break;
      case 'zombieMove':
        if (s.zombieController) {
          h += `<h2>Command the horde</h2><p class="help">You are ${SIDE[s.zombieController].name}, now leading the dead. Click a zombie stack, pick how many, then click an adjacent territory. Zombies that have not moved can tear down an adjacent wall instead.</p>`;
          h += moveCard();
        } else {
          h += `<h2>Zombies shamble</h2><p class="help">Each zombie stack follows its road arrow one territory. Stacks whose arrow crosses an intact wall tear that wall down instead.</p>`;
        }
        break;
      case 'zombieSpawn':
        h += zombieReport();
        h += `<h2>Spawn</h2><p class="help">Each of the ${game.spawnTerritories().length} zombie outskirts (green, outer ring) rolls ${game.spawnDiceCount()} ${game.spawnDiceCount() === 1 ? 'die' : 'dice'} on its own. Every 6 is a new zombie there.</p>`;
        break;
      case 'zombieCombat':
        h += zombieReport();
        h += `<h2>Feast</h2><p class="help">Zombies attack every territory they share with player units. Defenders who fall rise as zombies.</p>`;
        break;
    }
    return h;
  }

  function zombieReport() {
    const r = game.s.zombieReport;
    if (!r) return '';
    let h = '<div class="card"><h3>This zombie turn</h3>';
    if (r.smashed.length) h += `<div>Walls torn down: ${r.smashed.map(w => { const W = MAP.walls.find(x => x.id === w); return tname(W.outside) + ' → ' + tname(W.inside); }).join('; ')}</div>`;
    if (r.moves.length) h += `<div>Moved: ${r.moves.map(m => `${m.n} ${tname(m.from)} → ${tname(m.to)}`).join('; ')}</div>`;
    if (!r.smashed.length && !r.moves.length) h += '<div class="help">No movement.</div>';
    if (r.spawnDice.length) {
      h += '<div class="help" style="margin-top:6px">Spawn rolls (6 = zombie):</div>';
      for (const sd of r.spawnDice) {
        h += `<div class="dicerow"><span class="dt">${escapeHtml(tname(sd.tid))}</span><span class="dice">${sd.rolls.map(v => `<span class="die ${v === 6 ? 'six' : ''}">${v}</span>`).join('')}</span><span class="hits">${sd.sixes ? '+' + sd.sixes + ' Z' : ''}</span></div>`;
      }
    }
    for (const b of r.battles) {
      h += `<div style="margin-top:6px"><b>${escapeHtml(tname(b.tid))}</b>: ${b.result === 'attacker' || b.result === 'mutual' ? 'overrun!' : 'held'} after ${b.rounds.length} round${b.rounds.length === 1 ? '' : 's'} (${SIDE[b.defender].name} ${lostText(b.defCas)}; zombies ${lostText(b.attCas)})</div>`;
      const lr = b.rounds[b.rounds.length - 1];
      if (lr) h += `<div class="help">Last round, zombies:</div>${diceByType(lr.att, 'att', Z)}<div class="help">${SIDE[b.defender].name}:</div>${diceByType(lr.def, 'def', b.defender)}`;
    }
    return h + '</div>';
  }

  function movableUnits(tid) {
    if (game.s.phase === 'zombieMove') return game.zombiesAt(tid).filter(u => game.zombieCanMove(u));
    return game.unitsAt(tid, game.s.current).filter(u => game.unitCanMove(u));
  }
  function pickedIds() {
    if (!sel) return [];
    const mov = movableUnits(sel.tid);
    const out = [];
    for (const type in sel.pick) out.push(...mov.filter(u => u.type === type).slice(0, sel.pick[type]).map(u => u.id));
    return out;
  }
  function computeReach() {
    reach = [];
    if (!sel) return;
    const ids = pickedIds();
    if (!ids.length) return;
    if (game.s.phase === 'zombieMove') {
      reach = [...game.adj[sel.tid]].filter(n => !game.wallIntact(sel.tid, n));
    } else if (game.s.phase === 'combatMove' || game.s.phase === 'noncombatMove') {
      reach = game.reachable(ids, sel.tid);
    }
  }
  function moveCard() {
    if (!sel) return '<p class="help"><i>No territory selected.</i></p>';
    const mov = movableUnits(sel.tid);
    if (!mov.length) return `<p class="help">Nothing in ${escapeHtml(tname(sel.tid))} can move now.</p>`;
    const c = game.countBy(mov);
    let h = `<div class="card active"><h3>Move from ${escapeHtml(tname(sel.tid))}</h3>`;
    for (const type in c) {
      const n = sel.pick[type] || 0;
      h += `<div class="row"><span class="name">${UNITS[type].name} <small>(${c[type]} can move)</small></span>
        <span class="stepper"><button data-pick="${type}" data-d="-1">−</button><output>${n}</output><button data-pick="${type}" data-d="1">+</button></span></div>`;
    }
    h += `<p class="help">${!pickedCount() ? 'No units picked.' : reach.length ? 'Click a bright territory to move there (hover to see the route).' : 'No legal destination for this selection.'}</p>`;
    h += `<p class="help controls">Click: pick 1 · click again or click an icon: +1 · <b>double-click</b> or Shift-click: all · Ctrl-click an icon: all of that type · right-click: put 1 back · Esc: clear</p>`;
    if (game.s.phase === 'zombieMove') {
      const walls = [...game.adj[sel.tid]].filter(n => game.wallIntact(sel.tid, n));
      for (const n of walls) h += `<div class="row"><button data-smash="${n}" class="danger">Tear down wall → ${escapeHtml(tname(n))}</button></div>`;
    }
    return h + '</div>';
  }

  function combatPanel() {
    const s = game.s;
    let h = '<h2>Conduct combat</h2>';
    if (s.wallFire.length) {
      h += '<p class="help">Wall fire: units that did not move fire once across the wall at Defense value. Zombies cannot hit back.</p>';
      for (const wf of s.wallFire) {
        const shooters = game.unitsAt(wf.from, s.current).filter(u => !UNITS[u.type].air && u.moved === 0);
        h += `<div class="card"><h3>From ${escapeHtml(tname(wf.from))}</h3><div class="help">${countsText(shooters)}</div>`;
        if (wf.fired) {
          h += `<div>Fired at ${escapeHtml(tname(wf.result.target))}: ${wf.result.killed} zombie(s) destroyed</div>${diceByType(wf.result.rolls, s.rules.fortifiedStat, s.current)}`;
        } else {
          h += `<div class="row"><select data-wftarget="${wf.from}">${wf.targets.map(t => `<option value="${t}">${escapeHtml(tname(t))} (${game.zombiesAt(t).length} Z)</option>`).join('')}</select>
            <button class="primary" data-wf="${wf.from}">Fire!</button></div>`;
        }
        h += '</div>';
      }
    }
    if (!s.battles.length) h += '<p class="help">No battles this turn.</p>';
    for (const b of s.battles) {
      const att = game.unitsAt(b.tid, b.attacker), def = game.unitsAt(b.tid, b.defender);
      h += `<div class="card ${b.done ? '' : 'active'}" data-focus="${b.tid}"><h3>Battle: ${escapeHtml(tname(b.tid))} ${b.done ? '— ' + resultText(b) : ''}</h3>
        <div><b style="color:var(--${b.attacker === 'LAX' ? 'lax' : 'ona'})">${SIDE[b.attacker].name}</b>: ${countsText(att)}</div>
        <div><b style="color:var(--${b.defender === Z ? 'zom' : b.defender === 'LAX' ? 'lax' : 'ona'})">${SIDE[b.defender].name}</b>: ${countsText(def)}</div>`;
      if (b.last) {
        h += `<div class="roundhead">Round ${b.round}</div>`;
        h += `<div class="help">${SIDE[b.attacker].name} (attacking) — ${lostText(b.last.attLost)}</div>${diceByType(b.last.att, 'att', b.attacker)}`;
        h += `<div class="help">${SIDE[b.defender].name} (defending) — ${lostText(b.last.defLost)}</div>${diceByType(b.last.def, 'def', b.defender)}`;
      }
      if (b.pending) {
        h += `<div class="roundhead">Round ${b.round + 1} — choose casualties</div>`;
        h += `<div class="help">${SIDE[b.attacker].name} (attacking) scored ${b.pending.hits[b.defender]} hit(s)</div>${diceByType(b.pending.att, 'att', b.attacker)}`;
        h += `<div class="help">${SIDE[b.defender].name} (defending) scored ${b.pending.hits[b.attacker]} hit(s)</div>${diceByType(b.pending.def, 'def', b.defender)}`;
        for (const side of [b.attacker, b.defender]) h += casualtyPicker(b, side);
      } else if (!b.done) {
        h += `<div class="row"><button class="primary" data-roll="${b.tid}">Roll ${b.round ? 'next round' : 'first round'}</button><button data-auto="${b.tid}" title="Roll until it's decided; each side loses its cheapest units first">Fight to the end (auto losses)</button></div>`;
        const ro = game.retreatOptions(b.tid);
        if (ro.length) {
          h += `<div class="help">Or retreat: all your surviving attackers pull back to a territory they attacked from.</div><div class="row">`;
          h += ro.map(t => `<button data-retreat="${b.tid}" data-to="${t}">Retreat to ${escapeHtml(tname(t))}</button>`).join('');
          h += '</div>';
        }
        if (b.defender === Z) h += '<div class="help">If you retreat or are wiped out, your fallen rise as zombies.</div>';
      }
      h += '</div>';
    }
    return h;
  }
  function casualtyPicker(b, side) {
    const P = b.pending;
    const color = side === Z ? 'zom' : side === 'LAX' ? 'lax' : 'ona';
    if (P.choice[side]) {
      const c = P.choice[side];
      const txt = Object.keys(c).map(k => `${c[k]} ${UNITS[k].name}`).join(', ') || 'nothing';
      return `<div class="help"><b style="color:var(--${color})">${SIDE[side].name}</b> will lose: ${txt}.</div>`;
    }
    const key = b.tid + '|' + side;
    const draft = casDraft[key] || (casDraft[key] = game.defaultCasualties(b.tid, side));
    const have = game.countBy(game.unitsAt(b.tid, side));
    const need = P.hits[side];
    const total = Object.values(draft).reduce((a, n) => a + n, 0);
    const cpuSide = side !== Z && cpu[side];
    let h = `<div class="caspick card"><h3 style="color:var(--${color})">${SIDE[side].name}: choose ${need} casualt${need === 1 ? 'y' : 'ies'}${cpuSide ? ' (computer)' : ''}</h3>`;
    for (const t of Object.keys(have).sort((a, b2) => E.CASUALTY_ORDER.indexOf(a) - E.CASUALTY_ORDER.indexOf(b2))) {
      const n = draft[t] || 0;
      h += `<div class="row"><span class="name">${UNITS[t].name} <small>(${have[t]} here)</small></span><span class="stepper">
        <button data-cas="${key}|${t}" data-d="-1" ${n ? '' : 'disabled'}>−</button><output>${n}</output>
        <button data-cas="${key}|${t}" data-d="1" ${n < have[t] && total < need ? '' : 'disabled'}>+</button></span></div>`;
    }
    h += `<div class="row"><button class="primary" data-casok="${key}" ${total === need ? '' : 'disabled'}>Remove these ${need}</button>
      <span class="help">${total === need ? '' : `pick ${need - total} more`}</span></div></div>`;
    return h;
  }
  function resultText(b) {
    return { attacker: 'attacker wins', defender: 'defender holds', mutual: 'mutual destruction', retreat: 'attacker retreated' }[b.result] || '';
  }

  function territoryCard(tid) {
    const t = game.T[tid];
    const o = game.owner(tid);
    const units = game.unitsAt(tid);
    const byOwner = {};
    for (const u of units) (byOwner[u.owner] = byOwner[u.owner] || []).push(u);
    let h = `<div class="card"><h3>${escapeHtml(t.name)}</h3><div class="help">${t.inside ? 'Inside the wall' : 'Outside the wall'}${t.region ? ' · ' + t.region : ''} · ${valueText(t) || 'no income'}${o ? ' · owned by ' + SIDE[o].name : ' · unowned'}</div>`;
    if (t.desc) h += `<div class="help">${escapeHtml(t.desc)}</div>`;
    for (const k in byOwner) h += `<div><b>${SIDE[k].name}</b>: ${countsText(byOwner[k])}</div>`;
    const walls = MAP.walls.filter(w => w.inside === tid || w.outside === tid);
    if (walls.length) h += `<div class="help">Walls: ${walls.map(w => `W${w.no} ${escapeHtml(tname(w.inside === tid ? w.outside : w.inside))} ${game.s.walls[w.id] ? (w.gate ? '(intact, <b>gate</b>)' : '(intact)') : '(<b style="color:var(--lax)">breached</b>)'}`).join(', ')}</div>`;
    return h + '</div>';
  }

  function wireSide() {
    const side = $('side');
    side.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => act(game.buy(b.dataset.buy)));
    side.querySelectorAll('[data-unbuy]').forEach(b => b.onclick = () => act(game.unbuy(b.dataset.unbuy)));
    side.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      const type = b.dataset.pick;
      const max = movableUnits(sel.tid).filter(u => u.type === type).length;
      sel.pick[type] = Math.max(0, Math.min(max, (sel.pick[type] || 0) + Number(b.dataset.d)));
      computeReach(); render();
    });
    side.querySelectorAll('[data-wf]').forEach(b => b.onclick = () => {
      const from = b.dataset.wf;
      const target = side.querySelector(`[data-wftarget="${from}"]`).value;
      act(game.fireWall(from, target));
    });
    side.querySelectorAll('[data-roll]').forEach(b => b.onclick = () => {
      const tid = b.dataset.roll;
      focusBattle = tid;
      casDraft = {};
      const res = game.battleRoll(tid);
      if (res.ok) for (const pc of game.pendingCasualtyChoices()) if (pc.tid === tid && cpu[pc.side]) game.autoChooseCasualties(tid, pc.side);
      act(res);
    });
    side.querySelectorAll('[data-cas]').forEach(b => b.onclick = () => {
      const [tid, sd, type] = b.dataset.cas.split('|');
      const key = tid + '|' + sd;
      const d = casDraft[key] || {};
      d[type] = Math.max(0, (d[type] || 0) + Number(b.dataset.d));
      casDraft[key] = d;
      render();
    });
    side.querySelectorAll('[data-casok]').forEach(b => b.onclick = () => {
      const key = b.dataset.casok;
      const [tid, sd] = key.split('|');
      const res = game.chooseCasualties(tid, sd, casDraft[key] || {});
      if (res.ok) delete casDraft[key];
      act(res);
      if (res.ok) scheduleCpu();
    });
    side.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => { focusBattle = b.dataset.auto; act(game.autoResolve(b.dataset.auto)); });
    side.querySelectorAll('[data-retreat]').forEach(b => b.onclick = () => {
      const before = positions();
      const res = game.retreat(b.dataset.retreat, b.dataset.to);
      act(res);
      if (res.ok) animateMoves(diffMoves(before), Math.min(700, stepDelay() || 0)).then(render);
    });
    side.querySelectorAll('[data-smash]').forEach(b => b.onclick = () => { act(game.zombieSmash(sel.tid, b.dataset.smash)); selectTerritory(sel.tid); render(); });
    side.querySelectorAll('[data-focus]').forEach(c => c.onclick = (ev) => {
      if (ev.target.tagName === 'BUTTON' || ev.target.tagName === 'SELECT') return;
      focusBattle = c.dataset.focus; render();
    });
  }

  function act(res) {
    errMsg = res && !res.ok ? res.error : '';
    save();
    render();
    return res;
  }

  const TYPE_ORDER = ['inf', 'tank', 'heli', 'plane', 'zombie'];
  function availableByType(tid) {
    const c = {};
    for (const u of movableUnits(tid)) c[u.type] = (c[u.type] || 0) + 1;
    return c;
  }
  function selectTerritory(tid, all) {
    sel = { tid, pick: {}, lastType: null };
    if (all) for (const u of movableUnits(tid)) sel.pick[u.type] = (sel.pick[u.type] || 0) + 1;
    computeReach();
  }
  /** Pick one more unit: of the clicked type, else the type picked last, else the first available. */
  function pickOne(type) {
    const avail = availableByType(sel.tid);
    const has = (t) => t && (avail[t] || 0) > (sel.pick[t] || 0);
    const t = has(type) ? type : has(sel.lastType) ? sel.lastType : TYPE_ORDER.find(has);
    if (!t) return false;
    sel.pick[t] = (sel.pick[t] || 0) + 1;
    sel.lastType = t;
    return true;
  }
  function pickAllOfType(type) {
    const avail = availableByType(sel.tid);
    if (!avail[type]) return false;
    sel.pick[type] = avail[type];
    sel.lastType = type;
    return true;
  }
  function pickedCount() { return sel ? Object.values(sel.pick).reduce((a, b) => a + b, 0) : 0; }
  let lastClick = null;

  /**
   * Map clicks, TripleA-style:
   *   click            pick 1 unit (click again: +1; click a unit icon: 1 of that type)
   *   double-click / Shift-click   pick every unit that can move
   *   Ctrl-click a unit icon       pick all units of that type
   *   right-click      put 1 back; Shift-right-click / Esc: clear
   *   click a bright destination   move the picked units there
   */
  function onTerritoryClick(tid, mods) {
    mods = mods || {};
    if (isCpuTurn()) return;
    errMsg = '';
    const now = performance.now();
    const dbl = !!lastClick && lastClick.tid === tid && now - lastClick.t < 380;
    lastClick = { tid, t: now };
    const moving = isMovingPhase();
    if (moving && sel && sel.tid !== tid && reach.includes(tid) && pickedCount()) {
      const ids = pickedIds();
      const before = positions();
      const res = game.s.phase === 'zombieMove' ? game.zombieMove(ids, sel.tid, tid) : game.move(ids, sel.tid, tid);
      lastClick = null;
      if (!res.ok) { act(res); return; }
      sel = null; reach = []; hoverTid = null; errMsg = '';
      save();
      if (stepDelay() > 0) animateMoves(diffMoves(before), Math.min(450, stepDelay() * 0.6)).then(render);
      else render();
      return;
    }
    if (!moving || !movableUnits(tid).length) {
      // nothing to move here: just show the territory's details
      sel = sel && sel.tid === tid && !dbl ? null : { tid, pick: {}, lastType: null };
      reach = [];
      render();
      return;
    }
    if (!sel || sel.tid !== tid) sel = { tid, pick: {}, lastType: null };
    if (mods.shift || dbl) selectTerritory(tid, true);
    else if (mods.ctrl && mods.type) pickAllOfType(mods.type);
    else pickOne(mods.type);
    computeReach();
    render();
  }
  function onRightClick(shift) {
    if (!sel || isCpuTurn()) return;
    if (shift || pickedCount() <= 1) { sel = null; reach = []; render(); return; }
    const t = (sel.lastType && sel.pick[sel.lastType]) ? sel.lastType : [...TYPE_ORDER].reverse().find(x => sel.pick[x]);
    if (t) sel.pick[t] -= 1;
    computeReach();
    render();
  }

  // ---------------------------------------------------------- phase buttons
  function endPhase() {
    const before = positions();
    const res = game.endPhase();
    sel = null; reach = []; focusBattle = null;
    act(res);
    const moves = res.ok ? diffMoves(before) : [];
    if (moves.length && stepDelay() > 0) animateMoves(moves, stepDelay() * 0.9).then(() => { render(); scheduleCpu(); });
    else scheduleCpu();
  }
  function isCpuTurn() {
    if (!game || game.s.winner) return false;
    const s = game.s;
    if (game.isZombieTurn()) return s.zombieController ? !!cpu[s.zombieController] : false;
    return !!cpu[s.current];
  }
  function scheduleCpu(wait) {
    clearTimeout(cpuTimer);
    if (!isCpuTurn() || !AI) return;
    const d = stepDelay();
    cpuTimer = setTimeout(cpuStep, wait != null ? wait : (d === 0 ? 0 : Math.max(150, d * 0.5)));
  }
  function cpuStep() {
    if (!isCpuTurn()) return;
    const before = positions();
    const phase = game.s.phase;
    const rounds = Object.fromEntries((game.s.battles || []).map(b => [b.tid, b.round]));
    const res = AI.step(game, { isCpu: (sd) => sd === Z || !!cpu[sd] });
    if (res && res.waiting) { render(); return; } // a human is choosing casualties
    save();
    const d = stepDelay();
    // keep the battle being fought in view
    const fought = (game.s.battles || []).find(b => b.round !== rounds[b.tid]);
    if (fought) focusBattle = fought.tid;
    else if (game.s.phase !== 'combat') focusBattle = null;
    const moves = diffMoves(before);
    if (moves.length && d > 0) {
      animateMoves(moves, d * 0.8).then(() => { render(); scheduleCpu(d * 0.3); });
      return;
    }
    render();
    if (d === 0) { scheduleCpu(0); return; }
    // quick steps (buying) go faster; dice and phase changes linger so they can be read
    const pause = phase === 'purchase' && game.s.phase === 'purchase' ? d * 0.35 : fought ? d * 1.1 : d * 0.6;
    scheduleCpu(pause);
  }

  // ------------------------------------------------------------- dialogs
  function showGameOver() {
    const w = game.s.winner;
    $('overTitle').textContent = w === Z ? 'The dead win.' : `${SIDE[w].name} wins!`;
    $('overText').textContent = w === Z
      ? 'Both cities have fallen. The Coulee Region belongs to the horde.'
      : `${SIDE[w].name} held every neighborhood of La Crosse and Onalaska, zombie-free, for a full round.`;
    $('overDlg').showModal();
  }
  function startNew() {
    cpu = { LAX: $('optCpuLAX').checked, ONA: $('optCpuONA').checked };
    const seedVal = $('optSeed').value;
    game = E.Game.newGame(MAP, {
      seed: seedVal ? Number(seedVal) : undefined,
      rules: { startingOutbreak: $('optOutbreak').checked, fortifiedStat: $('optFort').value },
    });
    render.shownOver = false;
    sel = null; reach = []; errMsg = '';
    $('newDlg').close();
    save(); render(); scheduleCpu();
  }
  function init() {
    buildMap();
    const saved = loadSave();
    $('resumeBtn').style.display = saved ? '' : 'none';
    $('resumeBtn').onclick = () => {
      game = E.Game.load(MAP, saved.s); cpu = saved.cpu || cpu;
      render.shownOver = !!game.s.winner;
      $('newDlg').close(); render(); scheduleCpu();
    };
    $('startBtn').onclick = startNew;
    $('endBtn').onclick = endPhase;
    $('undoBtn').onclick = () => { sel = null; reach = []; act(game.undoPhase()); };
    $('undoMoveBtn').onclick = () => { sel = null; reach = []; act(game.undoMove()); };
    $('menuBtn').onclick = () => $('menuDlg').showModal();
    $('mClose').onclick = () => $('menuDlg').close();
    $('mNew').onclick = () => { $('menuDlg').close(); $('resumeBtn').style.display = 'none'; $('newDlg').showModal(); };
    $('mArrows').onchange = render; $('mRoads').onchange = render;
    $('mSpeed').value = settings.speed;
    $('mSpeed').onchange = () => { settings.speed = $('mSpeed').value; saveSettings(); };
    $('mExport').onclick = () => {
      const blob = new Blob([JSON.stringify({ s: game.s, cpu }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `laxis-round${game.s.round}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('mImportBtn').onclick = () => $('mImport').click();
    $('mImport').onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        game = E.Game.load(MAP, data.s || data); cpu = data.cpu || { LAX: false, ONA: false };
        render.shownOver = !!game.s.winner; $('menuDlg').close(); save(); render(); scheduleCpu();
      } catch (e) { errMsg = 'Could not read that save file.'; render(); }
    };
    $('overNew').onclick = () => { $('overDlg').close(); $('newDlg').showModal(); };
    $('overClose').onclick = () => $('overDlg').close();
    // placeholder game so the board renders behind the dialog
    game = E.Game.newGame(MAP, { seed: 1 });
    render();
    $('newDlg').showModal();
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && sel) { sel = null; reach = []; render(); }
    });
  }
  init();
})();
