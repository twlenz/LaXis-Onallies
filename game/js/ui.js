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
  const $ = (id) => document.getElementById(id);
  const svg = $('map');
  const layers = {};
  const tEls = {};
  const zEls = {};
  const wallEls = {};

  // ---------------------------------------------------------------- storage
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ s: game.s, cpu })); } catch (e) { /* storage unavailable */ }
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
    el('rect', { x: x0 - w, y: y0 - h, width: w * 3, height: h * 3, fill: 'var(--water)' }, svg);
    for (const name of ['land', 'terr', 'zom', 'water', 'roads', 'walls', 'gates', 'arrows', 'kt', 'labels', 'units']) layers[name] = el('g', { class: 'layer-' + name }, svg);
    for (const p of MAP.backdrop || []) el('path', { d: p.path, fill: p.kind === 'mn' ? 'var(--mn)' : 'var(--outside)', stroke: '#9b927f', 'stroke-width': .4 }, layers.land);
    for (const t of MAP.territories) {
      const p = el('path', { d: t.path, class: 'terr' + (t.inside ? '' : ' outside'), 'data-id': t.id }, layers.terr);
      const title = el('title', {}, p); title.textContent = t.name;
      tEls[t.id] = p;
      zEls[t.id] = el('path', { d: t.path, fill: 'url(#zhatch)', 'pointer-events': 'none', style: 'display:none' }, layers.zom);
    }
    for (const wp of MAP.water || []) el('path', { d: wp, class: 'water' }, layers.water);
    for (const rp of MAP.rivers || []) el('path', { d: rp, fill: 'none', stroke: 'var(--water)', 'stroke-width': 4, 'stroke-linecap': 'round' }, layers.water);
    for (const r of MAP.roads || []) el('path', { d: r.path, class: 'road ' + (r.cls || '') }, layers.roads);
    for (const w of MAP.walls) {
      wallEls[w.id] = el('path', { d: w.path, class: 'wall' }, layers.walls);
      if (w.gate && w.gateAt) {
        const g = el('g', { transform: `translate(${w.gateAt[0]},${w.gateAt[1]})` }, layers.gates);
        el('rect', { x: -7, y: -5, width: 14, height: 10, rx: 2, fill: '#ffd54a', stroke: '#2a1d10', 'stroke-width': 1 }, g);
        el('path', { d: 'M-4,4 v-5 a4,4 0 0 1 8,0 v5', fill: '#2a1d10' }, g);
        const tt = el('title', {}, g); tt.textContent = 'Highway gate: ' + (w.gateRoads || []).join(', ');
      }
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
    for (const k of MAP.kwikTrips || []) {
      const g = el('g', { class: 'kt', transform: `translate(${k.x},${k.y})` }, layers.kt);
      el('rect', { x: -2.6, y: -2.6, width: 5.2, height: 5.2, rx: 1, fill: '#e8742a', stroke: '#fff', 'stroke-width': .7 }, g);
    }
    for (const t of MAP.territories) {
      const [x, y] = t.label;
      const name = el('text', { x, y: y - 6, class: 'tlabel' }, layers.labels);
      name.textContent = t.short || t.name;
      const v = el('text', { x, y: y + 3, class: 'tvalue', id: 'tv-' + t.id }, layers.labels);
      v.textContent = valueText(t);
      if (t.spawn) {
        const g = el('g', { transform: `translate(${x},${y - 18})` }, layers.labels);
        el('circle', { r: 6.5, fill: '#3d8b2f', stroke: '#fff', 'stroke-width': 1 }, g);
        const st = el('text', { y: 3, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700, fill: '#fff' }, g);
        st.textContent = t.spawn;
      }
      for (const sp of t.special || []) {
        const icon = { cityhall: '★', airport: '✈', gundersen: '✚' }[sp];
        if (!icon) continue;
        const it = el('text', { x: x + (sp === 'gundersen' ? -16 : 16), y: y - 5, 'font-size': 10, 'text-anchor': 'middle', fill: '#2b2620', 'pointer-events': 'none' }, layers.labels);
        it.textContent = icon;
      }
    }
    attachPanZoom();
  }
  function valueText(t) {
    const parts = [];
    if (t.value) parts.push(`${t.value} SP`);
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
    svg.addEventListener('pointerdown', (ev) => {
      drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, moved: false, target: ev.target };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!drag) return;
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
      if (drag && !drag.moved) {
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        const id = hit && hit.getAttribute && hit.getAttribute('data-id');
        if (id) onTerritoryClick(id);
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
    const endBtn = $('endBtn');
    endBtn.textContent = endLabel();
    endBtn.disabled = !!s.winner || isCpuTurn();
    // map
    const battleT = new Set((s.battles || []).filter(b => !b.done).map(b => b.tid));
    for (const t of MAP.territories) {
      const p = tEls[t.id];
      p.style.fill = fillFor(t);
      p.classList.toggle('sel', !!sel && sel.tid === t.id);
      p.classList.toggle('reach', reach.includes(t.id));
      p.classList.toggle('battle', battleT.has(t.id) || focusBattle === t.id);
      zEls[t.id].style.display = game.hasZombies(t.id) ? '' : 'none';
    }
    for (const w of MAP.walls) wallEls[w.id].setAttribute('class', 'wall' + (s.walls[w.id] ? '' : ' broken'));
    layers.arrows.style.display = $('mArrows').checked ? '' : 'none';
    layers.roads.style.display = $('mRoads').checked ? '' : 'none';
    renderUnits();
    renderSide();
    renderLog();
    if (s.winner && !render.shownOver) { render.shownOver = true; showGameOver(); }
  }
  function endLabel() {
    const ph = game.s.phase;
    return {
      purchase: 'Done buying →', combatMove: 'Done moving → Combat', combat: 'End combat →',
      noncombatMove: 'End turn ✓', zombieMove: game.s.zombieController ? 'Done shambling →' : 'Zombies shamble →',
      zombieSpawn: 'Roll spawn dice →', zombieCombat: 'Zombies feast →', gameOver: 'Game over',
    }[ph] || 'End phase';
  }
  function renderUnits() {
    layers.units.innerHTML = '';
    const by = {};
    for (const u of Object.values(game.s.units)) {
      const k = u.at;
      by[k] = by[k] || {};
      const key = u.owner + ':' + u.type;
      by[k][key] = (by[k][key] || 0) + 1;
    }
    const T = Object.fromEntries(MAP.territories.map(t => [t.id, t]));
    const order = ['LAX', 'ONA', 'Z'];
    for (const tid in by) {
      const entries = Object.entries(by[tid]).sort((a, b) => order.indexOf(a[0].split(':')[0]) - order.indexOf(b[0].split(':')[0]));
      const t = T[tid];
      const W = 15, gap = 2;
      const total = entries.length * W + (entries.length - 1) * gap;
      let x = t.label[0] - total / 2;
      const y = t.label[1] + 6;
      for (const [key, n] of entries) {
        const [owner, type] = key.split(':');
        const g = el('g', { class: 'unitchip', transform: `translate(${x},${y})` }, layers.units);
        const shape = type === 'tank' ? el('rect', { width: W, height: 10, rx: 1.5 }, g)
          : (type === 'heli' || type === 'plane') ? el('path', { d: `M0,10 L${W / 2},0 L${W},10 z` }, g)
            : el('rect', { width: W, height: 10, rx: 5 }, g);
        shape.setAttribute('class', 'chip-' + owner);
        shape.setAttribute('stroke', '#fff'); shape.setAttribute('stroke-width', '.8');
        const tx = el('text', { x: W / 2, y: 7.6 }, g);
        tx.textContent = (n > 1 ? n : '') + LETTER[type];
        x += W + gap;
      }
    }
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
    h += `<p class="help">Zombies on board: <b>${zc}</b> · Walls breached: <b>${broken}/${MAP.walls.length}</b> · Spawn dice this round: <b>${game.spawnDiceCount()}</b></p>`;
    h += `<div class="err" id="err">${escapeHtml(errMsg)}</div>`;
    if (s.winner) {
      h += `<h2>Game over</h2><p>${s.winner === Z ? 'The zombies have taken the Coulee Region.' : SIDE[s.winner].name + ' wins!'}</p>`;
    } else if (isCpuTurn()) {
      h += `<h2>${SIDE[game.activeSide()].name} (computer) is thinking…</h2>`;
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
          ? 'Click one of your territories, choose units, then click a highlighted destination. Moving into zombies or enemy units starts a battle. Moving into an empty territory captures it. Land units can only leave or enter the city through a highway gate (yellow) or a breach. Units that stay put can fire from the wall.'
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
        h += `<h2>Spawn</h2><p class="help">Roll ${game.spawnDiceCount()} dice. Each 6 creates a zombie at a spawn point chosen by another die.</p>`;
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
      h += `<div>Spawn dice:</div>${dice(r.spawnDice, true)}`;
      if (r.spawned.length) h += `<div>New zombies at: ${r.spawned.map(tname).join(', ')}</div>`;
    }
    for (const b of r.battles) {
      h += `<div><b>${tname(b.tid)}</b>: ${b.result === 'attacker' || b.result === 'mutual' ? 'overrun!' : 'held'} (${b.rounds.length} rounds; ${SIDE[b.defender].name} lost ${b.defCas.length}, zombies lost ${b.attCas.length})</div>`;
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
    h += `<p class="help">${reach.length ? 'Click a highlighted territory to move there.' : 'No legal destination for this selection.'}</p>`;
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
          h += `<div>Fired at ${escapeHtml(tname(wf.result.target))}: ${wf.result.killed} zombie(s) destroyed</div>${dice(wf.result.rolls)}`;
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
        h += `<div class="help">Round ${b.round}: attacker</div>${dice(b.last.att)}<div class="help">defender</div>${dice(b.last.def)}`;
      }
      if (!b.done) {
        h += `<div class="row"><button class="primary" data-roll="${b.tid}">Roll round</button><button data-auto="${b.tid}">Fight to the end</button>`;
        const ro = game.retreatOptions(b.tid);
        if (ro.length) h += `<select data-rto="${b.tid}">${ro.map(t => `<option value="${t}">${escapeHtml(tname(t))}</option>`).join('')}</select><button data-retreat="${b.tid}">Retreat</button>`;
        h += '</div>';
        if (b.defender === Z) h += '<div class="help">If you retreat or are wiped out, your fallen rise as zombies.</div>';
      }
      h += '</div>';
    }
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
    side.querySelectorAll('[data-roll]').forEach(b => b.onclick = () => { focusBattle = b.dataset.roll; act(game.battleRound(b.dataset.roll)); });
    side.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => { focusBattle = b.dataset.auto; act(game.autoResolve(b.dataset.auto)); });
    side.querySelectorAll('[data-retreat]').forEach(b => b.onclick = () => {
      const tid = b.dataset.retreat;
      act(game.retreat(tid, side.querySelector(`[data-rto="${tid}"]`).value));
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

  function selectTerritory(tid) {
    sel = { tid, pick: {} };
    for (const u of movableUnits(tid)) sel.pick[u.type] = (sel.pick[u.type] || 0) + 1;
    computeReach();
  }

  function onTerritoryClick(tid) {
    if (isCpuTurn()) return;
    errMsg = '';
    const ph = game.s.phase;
    const moving = ph === 'combatMove' || ph === 'noncombatMove' || (ph === 'zombieMove' && game.s.zombieController);
    if (moving && sel && reach.includes(tid)) {
      const ids = pickedIds();
      const res = ph === 'zombieMove' ? game.zombieMove(ids, sel.tid, tid) : game.move(ids, sel.tid, tid);
      act(res);
      if (res.ok) { sel = null; reach = []; render(); }
      return;
    }
    if (sel && sel.tid === tid) { sel = null; reach = []; render(); return; }
    selectTerritory(tid);
    render();
  }

  // ---------------------------------------------------------- phase buttons
  function endPhase() {
    const res = game.endPhase();
    sel = null; reach = []; focusBattle = null;
    act(res);
    scheduleCpu();
  }
  function isCpuTurn() {
    if (!game || game.s.winner) return false;
    const s = game.s;
    if (game.isZombieTurn()) return s.zombieController ? !!cpu[s.zombieController] : false;
    return !!cpu[s.current];
  }
  function scheduleCpu() {
    clearTimeout(cpuTimer);
    if (!isCpuTurn() || !AI) return;
    cpuTimer = setTimeout(() => {
      AI.step(game);
      save(); render();
      scheduleCpu();
    }, 350);
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
    $('menuBtn').onclick = () => $('menuDlg').showModal();
    $('mClose').onclick = () => $('menuDlg').close();
    $('mNew').onclick = () => { $('menuDlg').close(); $('resumeBtn').style.display = 'none'; $('newDlg').showModal(); };
    $('mArrows').onchange = render; $('mRoads').onchange = render;
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
