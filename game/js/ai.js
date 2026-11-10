/*
 * LaXis & OnAllies — a simple computer opponent.
 *
 * AI.step(game) performs exactly one action (a purchase, a move, a die roll,
 * a phase end) so the UI can animate it and the simulator can loop it.
 * The AI uses Math.random for its own planning so it never disturbs the
 * game's seeded dice.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.LaxisAI = factory(root.LaxisEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  const { UNITS, Z } = E;

  function simulate(attTypes, defTypes, n) {
    let wins = 0;
    for (let k = 0; k < n; k++) {
      let a = attTypes.slice(), d = defTypes.slice();
      let guard = 0;
      while (a.length && d.length && guard++ < 40) {
        const ah = a.reduce((h, t) => h + (Math.random() * 6 < UNITS[t].att ? 1 : 0), 0);
        const dh = d.reduce((h, t) => h + (Math.random() * 6 < UNITS[t].def ? 1 : 0), 0);
        d = sortCheap(d).slice(ah); a = sortCheap(a).slice(dh);
      }
      if (!d.length && a.some(t => UNITS[t].land)) wins++;
    }
    return wins / n;
  }
  function sortCheap(arr) { return arr.slice().sort((x, y) => E.CASUALTY_ORDER.indexOf(x) - E.CASUALTY_ORDER.indexOf(y)); }

  function threat(g, p, tid) {
    let t = 0;
    for (const n of g.adj[tid]) {
      const z = g.zombiesAt(n).length;
      if (z) t += g.wallIntact(tid, n) ? 0.6 * z : 1.5 * z;
      t += 0.5 * g.unitsAt(n, E.enemyOf(p)).length;
      // zombies two steps out on an open road
      for (const m of g.adj[n]) if (m !== tid && !g.wallIntact(n, m)) t += 0.15 * g.zombiesAt(m).length;
    }
    if (tid === g.cityHall(p)) t += 1.5;
    return t;
  }

  function purchase(g) {
    const p = g.s.current;
    const pl = g.s.players[p];
    const air = p === 'LAX' ? 'heli' : 'plane';
    if (g.canBuy(air).ok && pl.sp >= 13) return g.buy(air);
    const tanks = Object.values(g.s.units).filter(u => u.owner === p && u.type === 'tank').length + g.s.pending.filter(x => x === 'tank').length;
    if (pl.oil >= tanks + 2 && g.canBuy('tank').ok && Math.random() < 0.45) return g.buy('tank');
    if (g.canBuy('inf').ok) return g.buy('inf');
    return null;
  }

  function myMovable(g) {
    return Object.values(g.s.units).filter(u => g.unitCanMove(u));
  }

  function combatMove(g) {
    const p = g.s.current;
    const movable = myMovable(g);
    if (!movable.length) return null;
    const ch = g.cityHall(p);
    // keep a garrison at City Hall
    const garrisonOk = (u) => !(u.at === ch && g.unitsAt(ch, p).filter(x => UNITS[x.type].land).length <= 2 && UNITS[u.type].land);
    const candidatesFor = (target) => movable.filter(u => garrisonOk(u) && g.findPath([u.id], u.at, target));
    const targets = [];
    for (const t of g.map.territories) {
      const z = g.zombiesAt(t.id).length;
      const e = g.unitsAt(t.id, E.enemyOf(p)).length;
      if (!z && !e) continue;
      // do not sally out over an intact wall: shooting is free
      let prio = (t.inside ? 10 : 2) + (t.value || 0) + (z ? 3 : 0);
      if (e && !z) prio -= g.s.round < 4 ? 8 : 2;
      if (t.id === g.cityHall(E.enemyOf(p))) prio += 6;
      targets.push({ tid: t.id, prio, defZ: !!z });
    }
    targets.sort((a, b) => b.prio - a.prio);
    for (const tg of targets) {
      const cands = candidatesFor(tg.tid);
      if (!cands.length) continue;
      const present = g.unitsAt(tg.tid, p).map(u => u.type);
      const def = g.unitsAt(tg.tid, tg.defZ ? Z : E.enemyOf(p)).map(u => u.type);
      const pr = simulate(present.concat(cands.map(u => u.type)), def, 60);
      const need = tg.defZ ? 0.7 : 0.8;
      if (pr < need) continue;
      // move from the origin contributing the most
      const byOrigin = {};
      for (const u of cands) (byOrigin[u.at] = byOrigin[u.at] || []).push(u);
      const origins = Object.keys(byOrigin).sort((a, b) => byOrigin[b].length - byOrigin[a].length);
      for (const o of origins) {
        const grp = byOrigin[o].filter(u => !UNITS[u.type].air || g.findPath([u.id], o, tg.tid));
        // avoid gutting a threatened origin
        const keep = threat(g, p, o) > 1.5 ? 1 : 0;
        const landHere = g.unitsAt(o, p).filter(x => UNITS[x.type].land).length;
        const send = grp.slice(0, Math.max(0, grp.length - Math.max(0, keep - (landHere - grp.length))));
        if (!send.length) continue;
        for (const u of send) { const r = g.move([u.id], o, tg.tid); if (r.ok) return r; }
      }
    }
    // capture empty valuable territory with spare units
    const empties = g.map.territories.filter(t => g.owner(t.id) !== p && !g.hostileTo(p, t.id) && (t.value || t.kwikTrips || (t.special || []).length))
      .sort((a, b) => (b.inside - a.inside) || ((b.value || 0) + (b.kwikTrips || 0) * 2 + ((b.special || []).length * 3)) - ((a.value || 0) + (a.kwikTrips || 0) * 2));
    for (const t of empties) {
      if (!t.inside && g.s.round > 6 && threat(g, p, t.id) > 1) continue;
      for (const u of movable) {
        if (!UNITS[u.type].land || !garrisonOk(u)) continue;
        const here = g.unitsAt(u.at, p).filter(x => UNITS[x.type].land).length;
        if (here < 2 && threat(g, p, u.at) > 0.5) continue;
        if (!g.findPath([u.id], u.at, t.id)) continue;
        const r = g.move([u.id], u.at, t.id);
        if (r.ok) return r;
      }
    }
    return null;
  }

  function combat(g) {
    const s = g.s;
    for (const wf of s.wallFire) {
      if (wf.fired) continue;
      const tgt = wf.targets.slice().sort((a, b) => g.zombiesAt(b).length - g.zombiesAt(a).length)[0];
      return g.fireWall(wf.from, tgt);
    }
    for (const b of s.battles) {
      if (b.done) continue;
      const att = g.unitsAt(b.tid, b.attacker).map(u => u.type);
      const def = g.unitsAt(b.tid, b.defender).map(u => u.type);
      const ro = g.retreatOptions(b.tid);
      if (ro.length && b.round > 0 && simulate(att, def, 40) < 0.35) return g.retreat(b.tid, ro[0]);
      return g.battleRound(b.tid);
    }
    return null;
  }

  function noncombat(g) {
    const p = g.s.current;
    const units = Object.values(g.s.units).filter(u => u.owner === p);
    // land aircraft
    for (const u of units) {
      if (!UNITS[u.type].air || !g.unitCanMove(u)) continue;
      const sites = g.landingSites(p, u.type);
      if (sites.includes(u.at)) continue;
      for (const site of sites) { const r = g.move([u.id], u.at, site); if (r.ok) return r; }
    }
    // reinforce threatened territories
    const mine = g.map.territories.filter(t => g.controls(p, t.id));
    const scored = mine.map(t => ({ tid: t.id, th: threat(g, p, t.id), have: g.unitsAt(t.id, p).filter(u => UNITS[u.type].land).length }))
      .filter(x => x.th > 0).sort((a, b) => (b.th - b.have) - (a.th - a.have));
    for (const need of scored) {
      if (need.have >= need.th + 1) continue;
      for (const t of mine) {
        if (t.id === need.tid) continue;
        const myLand = g.unitsAt(t.id, p).filter(u => UNITS[u.type].land);
        const spare = myLand.filter(u => g.unitCanMove(u));
        const th = threat(g, p, t.id);
        const keep = th > 0.3 ? Math.ceil(th) + 1 : (t.id === g.cityHall(p) ? 2 : 0);
        if (myLand.length - 1 < keep || !spare.length) continue;
        if (th >= need.th) continue;
        const u = spare[0];
        if (g.findPath([u.id], t.id, need.tid)) {
          const r = g.move([u.id], t.id, need.tid);
          if (r.ok) return r;
        }
      }
    }
    return null;
  }

  function step(g) {
    const s = g.s;
    if (s.winner) return { ok: false, error: 'over' };
    let r = null;
    switch (s.phase) {
      case 'purchase': r = purchase(g); break;
      case 'combatMove': r = combatMove(g); break;
      case 'combat': r = combat(g); break;
      case 'noncombatMove': r = noncombat(g); break;
      case 'zombieMove':
        if (s.zombieController && !s._aiZombieMoved) {
          g._autoZombieMove();
          s._aiZombieMoved = true;
          return { ok: true };
        }
        break;
      default: break;
    }
    if (r && r.ok) return r;
    if (s.phase === 'zombieMove') delete s._aiZombieMoved;
    return g.endPhase();
  }

  /** Play until the given side's turn is over (or the game ends). */
  function playTurn(g, maxSteps) {
    const who = g.activeSide();
    let n = 0;
    while (!g.s.winner && g.activeSide() === who && n++ < (maxSteps || 2000)) step(g);
  }

  return { step, playTurn, simulate, threat };
});
