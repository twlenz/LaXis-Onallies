/*
 * LaXis & OnAllies — rules engine.
 *
 * Pure game logic, no DOM. Runs in the browser (window.LaxisEngine) and in
 * Node (require('./engine.js')). All mutable state lives in a plain JSON
 * object (game.s) so it can be saved, loaded and snapshotted for undo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LaxisEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PLAYERS = ['LAX', 'ONA'];
  const Z = 'Z';
  const SIDE = {
    LAX: { name: 'La Crosse', short: 'LAX' },
    ONA: { name: 'Onalaska', short: 'ONA' },
    Z: { name: 'Zombies', short: 'ZOM' },
  };

  // Combat values follow Axis & Allies: a unit hits on a d6 roll <= its value.
  const UNITS = {
    inf: { name: 'Infantry', cost: 3, att: 1, def: 2, move: 1, land: true },
    tank: { name: 'Tank', cost: 6, att: 3, def: 3, move: 2, land: true, oil: 1 },
    heli: {
      name: 'Gundersen Helicopter', cost: 10, att: 2, def: 3, move: 3, air: true, oil: 1,
      carry: 1, only: 'LAX', max: 1, landsAt: ['airport', 'gundersen'],
    },
    plane: {
      name: 'Onalaska Plane', cost: 10, att: 4, def: 2, move: 4, air: true, oil: 1,
      only: 'ONA', max: 1, landsAt: ['airport'],
    },
    zombie: { name: 'Zombie', cost: 0, att: 3, def: 2, move: 1, land: true },
  };

  // Default casualty order: cheapest first (owner may override).
  const CASUALTY_ORDER = ['zombie', 'inf', 'tank', 'heli', 'plane'];

  const DEFAULT_RULES = {
    fortifiedStat: 'def', // value used when firing over a wall ('att' or 'def')
    startingOutbreak: false, // place 1 zombie on each spawn point before round 1
    startOil: 2,
    defeatedUnitsBecomeZombies: true,
  };

  const PLAYER_PHASES = ['purchase', 'combatMove', 'combat', 'noncombatMove'];
  const ZOMBIE_PHASES = ['zombieMove', 'zombieSpawn', 'zombieCombat'];
  const PHASE_NAMES = {
    purchase: 'Purchase Units',
    combatMove: 'Combat Move',
    combat: 'Conduct Combat',
    noncombatMove: 'Noncombat Move',
    zombieMove: 'Zombies Shamble',
    zombieSpawn: 'Zombie Spawn',
    zombieCombat: 'Zombies Feast',
    gameOver: 'Game Over',
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function enemyOf(p) { return p === 'LAX' ? 'ONA' : 'LAX'; }

  class Game {
    constructor(map, state) {
      this.map = map;
      this.s = state;
      this.T = {};
      for (const t of map.territories) this.T[t.id] = t;
      this.adj = {};
      for (const t of map.territories) this.adj[t.id] = new Set(t.adj);
      this.wallIndex = {};
      this.gates = {};
      for (const w of map.walls) {
        if (w.gate) this.gates[w.id] = true;
        this.wallIndex[w.inside + '|' + w.outside] = w.id;
        this.wallIndex[w.outside + '|' + w.inside] = w.id;
      }
      this.listeners = [];
    }

    // ------------------------------------------------------------------ setup
    static newGame(map, opts = {}) {
      const rules = Object.assign({}, DEFAULT_RULES, opts.rules || {});
      const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2147483647);
      const s = {
        version: 1,
        rules,
        seed: seed | 0,
        round: 1,
        current: 'LAX',
        phase: 'purchase',
        players: {},
        zombieController: null,
        winner: null,
        territories: {},
        walls: {},
        units: {},
        nextUnitId: 1,
        pending: [],
        battles: [],
        wallFire: [],
        zombieReport: null,
        log: [],
        snapshot: null,
      };
      for (const p of PLAYERS) {
        s.players[p] = { sp: 0, oil: rules.startOil, defeated: false, holding: false };
      }
      const g = new Game(map, s);
      for (const t of map.territories) {
        s.territories[t.id] = { owner: t.startOwner || null };
        const su = t.startUnits || {};
        for (const type of Object.keys(su)) {
          for (let i = 0; i < su[type]; i++) g._addUnit(type, t.startOwner, t.id);
        }
      }
      for (const w of map.walls) s.walls[w.id] = true;
      if (rules.startingOutbreak) {
        for (const t of map.territories) if (t.spawn) g._addUnit('zombie', Z, t.id);
      }
      for (const p of PLAYERS) s.players[p].sp = g.income(p).sp;
      g.log(`The outbreak begins. Round 1.`);
      g._startPlayerTurn('LAX');
      return g;
    }

    static load(map, state) { return new Game(map, state); }
    toJSON() { return this.s; }

    // -------------------------------------------------------------- utilities
    log(msg, kind) {
      this.s.log.push({ r: this.s.round, who: this.s.current, msg, kind: kind || '' });
      if (this.s.log.length > 600) this.s.log.splice(0, this.s.log.length - 600);
    }
    rand() {
      // mulberry32, state kept in s.seed so games are reproducible
      this.s.seed = (this.s.seed + 0x6D2B79F5) | 0;
      let t = this.s.seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    d6() { return 1 + Math.floor(this.rand() * 6); }
    pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }

    _addUnit(type, owner, at) {
      const id = 'u' + this.s.nextUnitId++;
      this.s.units[id] = { id, type, owner, at, moved: 0, combatMoved: false, oilPaid: false, origin: null };
      return this.s.units[id];
    }
    _removeUnit(id) { delete this.s.units[id]; }

    unitsAt(tid, owner) {
      const out = [];
      for (const id in this.s.units) {
        const u = this.s.units[id];
        if (u.at === tid && (owner === undefined || u.owner === owner)) out.push(u);
      }
      return out;
    }
    zombiesAt(tid) { return this.unitsAt(tid, Z); }
    hasZombies(tid) { return this.zombiesAt(tid).length > 0; }
    countBy(units) {
      const c = {};
      for (const u of units) c[u.type] = (c[u.type] || 0) + 1;
      return c;
    }
    owner(tid) { return this.s.territories[tid].owner; }
    controls(p, tid) {
      return this.owner(tid) === p && !this.hasZombies(tid) && this.unitsAt(tid, enemyOf(p)).length === 0;
    }
    hostileTo(p, tid) {
      return this.hasZombies(tid) || this.unitsAt(tid, enemyOf(p)).length > 0;
    }
    wallBetween(a, b) { return this.wallIndex[a + '|' + b] || null; }
    wallIntact(a, b) {
      const w = this.wallBetween(a, b);
      return !!(w && this.s.walls[w]);
    }
    isGate(a, b) {
      const w = this.wallBetween(a, b);
      return !!(w && this.gates[w]);
    }
    /** Land units cross the wall only at a highway gate or through a breach. */
    landCanCross(a, b) {
      const w = this.wallBetween(a, b);
      return !w || !this.s.walls[w] || !!this.gates[w];
    }
    special(tag) { return this.map.territories.filter(t => (t.special || []).includes(tag)).map(t => t.id); }
    cityHall(p) { return this.map.cityHalls[p]; }
    airportControlled(p) { return this.special('airport').some(t => this.controls(p, t)); }
    landingSites(p, type) {
      const tags = UNITS[type].landsAt || [];
      const out = [];
      for (const tag of tags) for (const t of this.special(tag)) {
        if (tag === 'gundersen' && p !== 'LAX') continue;
        if (this.controls(p, t)) out.push(t);
      }
      return out;
    }
    insideIds() { return this.map.territories.filter(t => t.inside).map(t => t.id); }

    income(p) {
      let sp = 0, oil = 0;
      for (const t of this.map.territories) {
        if (this.controls(p, t.id)) { sp += t.value || 0; oil += t.kwikTrips || 0; }
      }
      return { sp, oil };
    }

    meetsVictory(p) {
      return this.insideIds().every(tid => this.owner(tid) === p && !this.hasZombies(tid));
    }

    phaseName() { return PHASE_NAMES[this.s.phase] || this.s.phase; }
    isZombieTurn() { return ZOMBIE_PHASES.includes(this.s.phase); }
    activeSide() { return this.isZombieTurn() ? Z : this.s.current; }

    takeSnapshot() {
      const copy = Object.assign({}, this.s);
      delete copy.snapshot;
      delete copy.moveUndo;
      this.s.snapshot = clone(copy);
      this.s.moveUndo = [];
    }

    // --- per-move undo (movement phases): a stack of states taken before each move
    _pushMoveUndo() {
      const copy = Object.assign({}, this.s);
      delete copy.snapshot;
      delete copy.moveUndo;
      (this.s.moveUndo = this.s.moveUndo || []).push(JSON.stringify(copy));
    }
    canUndoMove() {
      const movePhase = this._isMovePhase() || (this.s.phase === 'zombieMove' && !!this.s.zombieController);
      return movePhase && !!(this.s.moveUndo && this.s.moveUndo.length);
    }
    undoMove() {
      if (!this.canUndoMove()) return fail('No move to undo.');
      const stack = this.s.moveUndo;
      const snap = this.s.snapshot;
      const prev = JSON.parse(stack.pop());
      Object.keys(this.s).forEach(k => delete this.s[k]);
      Object.assign(this.s, prev);
      this.s.snapshot = snap;
      this.s.moveUndo = stack;
      this.log('Move taken back.');
      return ok();
    }
    canUndo() { return !!this.s.snapshot && ['purchase', 'combatMove', 'noncombatMove', 'zombieMove'].includes(this.s.phase); }
    undoPhase() {
      if (!this.canUndo()) return fail('Nothing to undo in this phase.');
      const snap = this.s.snapshot;
      const logLen = snap.log.length;
      Object.keys(this.s).forEach(k => delete this.s[k]);
      Object.assign(this.s, clone(snap));
      this.s.snapshot = snap;
      this.s.moveUndo = [];
      this.s.log.length = logLen;
      this.log('Phase reset.');
      return ok();
    }

    // ------------------------------------------------------------- purchasing
    canBuy(type) {
      const p = this.s.current;
      const u = UNITS[type];
      if (this.s.phase !== 'purchase') return fail('You can only buy units in the Purchase phase.');
      if (!u || type === 'zombie') return fail('Unknown unit.');
      if (u.only && u.only !== p) return fail(`${u.name} belongs to ${SIDE[u.only].name}.`);
      if (this.s.players[p].sp < u.cost) return fail('Not enough supply points.');
      if (u.air) {
        if (!this.airportControlled(p)) return fail('You must control the airport to buy aircraft.');
        const owned = Object.values(this.s.units).filter(x => x.owner === p && x.type === type).length;
        const pending = this.s.pending.filter(x => x === type).length;
        if (owned + pending >= u.max) return fail(`Only ${u.max} ${u.name} allowed.`);
      } else if (!this.controls(p, this.cityHall(p))) {
        return fail('Your City Hall is not under your control; you cannot recruit.');
      }
      return ok();
    }
    buy(type) {
      const c = this.canBuy(type);
      if (!c.ok) return c;
      this.s.players[this.s.current].sp -= UNITS[type].cost;
      this.s.pending.push(type);
      return ok();
    }
    unbuy(type) {
      if (this.s.phase !== 'purchase') return fail('Purchases are locked after the Purchase phase.');
      const i = this.s.pending.lastIndexOf(type);
      if (i < 0) return fail('None to return.');
      this.s.pending.splice(i, 1);
      this.s.players[this.s.current].sp += UNITS[type].cost;
      return ok();
    }

    // --------------------------------------------------------------- movement
    _isMovePhase() { return this.s.phase === 'combatMove' || this.s.phase === 'noncombatMove'; }

    unitCanMove(u) {
      const p = this.s.current;
      if (!this._isMovePhase() || u.owner !== p) return false;
      const def = UNITS[u.type];
      // tanks and aircraft burn 1 oil the first time they move in a turn
      if (def.oil && !u.oilPaid && this.s.players[p].oil < def.oil) return false;
      if (def.air) {
        if (!this.airportControlled(p)) return false; // grounded
        return u.moved < def.move;
      }
      if (u.moved > 0) return false;
      if (this.s.phase === 'noncombatMove' && u.combatMoved) return false;
      if (this.s.phase === 'combatMove' && this.hostileTo(p, u.at)) return false;
      return true;
    }

    /** Group description used by path finding. */
    _group(units) {
      const air = units.filter(u => UNITS[u.type].air);
      const land = units.filter(u => !UNITS[u.type].air);
      const carriers = air.filter(u => UNITS[u.type].carry);
      const capacity = carriers.reduce((n, u) => n + UNITS[u.type].carry, 0);
      const landIsCargo = land.length > 0 && carriers.length > 0 && land.length <= capacity &&
        land.every(u => u.type === 'inf');
      const flying = land.length === 0 || landIsCargo;
      let range = Infinity;
      for (const u of air) range = Math.min(range, UNITS[u.type].move - u.moved);
      if (!flying) for (const u of land) range = Math.min(range, UNITS[u.type].move - u.moved);
      return { air, land, flying, range, cargo: landIsCargo ? land : [] };
    }

    /** BFS path from `from` to `to` for the group, or null. */
    findPath(unitIds, from, to) {
      const p = this.s.current;
      const units = unitIds.map(id => this.s.units[id]);
      if (!units.length || units.some(u => !u || u.at !== from)) return null;
      const g = this._group(units);
      if (!(g.range > 0) || from === to) return null;
      const combat = this.s.phase === 'combatMove';
      const destOk = (tid) => {
        if (!combat && this.hostileTo(p, tid)) return false;
        if (!combat && !g.flying && this.owner(tid) !== p) return false;
        if (!combat && g.flying && g.cargo.length && this.owner(tid) !== p) return false;
        if (!combat && g.flying && !g.cargo.length) {
          // air may end noncombat anywhere friendly (it must still reach a landing site)
          if (this.owner(tid) !== p) return false;
        }
        return true;
      };
      const passOk = (tid) => {
        if (g.flying) return true;
        if (this.hostileTo(p, tid)) return false;
        if (!combat && this.owner(tid) !== p) return false;
        // in combat move, tanks may blitz through empty unowned/enemy territory
        if (combat && this.owner(tid) !== p && g.land.some(u => u.type !== 'tank')) return false;
        return true;
      };
      const prev = { [from]: null };
      let frontier = [from];
      for (let step = 1; step <= g.range && frontier.length; step++) {
        const next = [];
        for (const cur of frontier) {
          if (cur !== from && !passOk(cur)) continue;
          for (const n of this.adj[cur]) {
            if (n in prev) continue;
            if (!g.flying && !this.landCanCross(cur, n)) continue;
            prev[n] = cur;
            if (n === to) {
              if (!destOk(n)) { delete prev[n]; continue; }
              const path = [n];
              let c = cur;
              while (c !== null) { path.unshift(c); c = prev[c]; }
              return { path, cost: path.length - 1 };
            }
            next.push(n);
          }
        }
        frontier = next;
      }
      return null;
    }

    reachable(unitIds, from) {
      const out = [];
      for (const t of this.map.territories) {
        if (t.id === from) continue;
        if (this.findPath(unitIds, from, t.id)) out.push(t.id);
      }
      return out;
    }

    move(unitIds, from, to) {
      const p = this.s.current;
      if (!this._isMovePhase()) return fail('Not a movement phase.');
      const units = unitIds.map(id => this.s.units[id]);
      if (units.some(u => !u)) return fail('Unknown unit.');
      for (const u of units) if (!this.unitCanMove(u)) {
        const g = this._group(units);
        if (!(u.type === 'inf' && g.cargo.includes(u) && u.moved === 0 && !(this.s.phase === 'noncombatMove' && u.combatMoved))) {
          return fail(`${UNITS[u.type].name} cannot move now.`);
        }
      }
      const path = this.findPath(unitIds, from, to);
      if (!path) return fail('No legal path for those units.');
      const fuelers = units.filter(u => UNITS[u.type].oil && !u.oilPaid);
      if (fuelers.length > this.s.players[p].oil) return fail(`Not enough oil: ${fuelers.length} needed, ${this.s.players[p].oil} available.`);
      const g = this._group(units);
      this._pushMoveUndo();
      // blitz capture of intermediate territories
      if (!g.flying && this.s.phase === 'combatMove') {
        for (const tid of path.path.slice(1, -1)) {
          if (this.owner(tid) !== p) {
            this.s.territories[tid].owner = p;
            this.log(`${SIDE[p].name} tanks blitz through ${this.T[tid].name}.`);
          }
        }
      }
      for (const u of fuelers) { u.oilPaid = true; this.s.players[p].oil -= UNITS[u.type].oil; }
      for (const u of units) {
        if (UNITS[u.type].air) u.moved += path.cost;
        else u.moved = UNITS[u.type].move; // land units finish moving
        if (this.s.phase === 'combatMove') { u.combatMoved = true; u.origin = from; }
        u.at = to;
      }
      // capture an empty destination in combat move
      if (this.s.phase === 'combatMove' && !this.hostileTo(p, to) && g.land.length && this.owner(to) !== p) {
        this.s.territories[to].owner = p;
        this.log(`${SIDE[p].name} takes ${this.T[to].name}.`);
      }
      const c = this.countBy(units);
      this.log(`${SIDE[p].name} moves ${describe(c)} ${this.T[from].name} → ${this.T[to].name}.`);
      return ok();
    }

    // ----------------------------------------------------------------- combat
    _setupCombat() {
      const p = this.s.current;
      this.s.battles = [];
      for (const t of this.map.territories) {
        const mine = this.unitsAt(t.id, p);
        if (!mine.length) continue;
        const z = this.zombiesAt(t.id).length;
        const e = this.unitsAt(t.id, enemyOf(p)).length;
        if (z || e) {
          this.s.battles.push({
            tid: t.id, attacker: p, defender: z ? Z : enemyOf(p), round: 0, done: false,
            result: null, attCas: [], defCas: [], last: null,
          });
        }
      }
      this.s.wallFire = [];
      for (const t of this.map.territories) {
        if (!t.inside || this.owner(t.id) !== p) continue;
        const shooters = this.unitsAt(t.id, p).filter(u => !UNITS[u.type].air && u.moved === 0);
        if (!shooters.length) continue;
        const targets = t.adj.filter(o => this.wallIntact(t.id, o) && this.hasZombies(o));
        if (targets.length) this.s.wallFire.push({ from: t.id, targets, fired: false });
      }
    }

    fireWall(from, target) {
      const p = this.s.current;
      if (this.s.phase !== 'combat') return fail('Wall fire happens in Conduct Combat.');
      const wf = this.s.wallFire.find(w => w.from === from);
      if (!wf || wf.fired) return fail('Those units cannot fire from the wall.');
      if (!wf.targets.includes(target)) return fail('Not a valid target across the wall.');
      const shooters = this.unitsAt(from, p).filter(u => !UNITS[u.type].air && u.moved === 0);
      const stat = this.s.rules.fortifiedStat;
      const rolls = shooters.map(u => {
        const r = this.d6();
        return { type: u.type, roll: r, hit: r <= UNITS[u.type][stat] };
      });
      const hits = rolls.filter(r => r.hit).length;
      const zs = this.zombiesAt(target);
      const killed = Math.min(hits, zs.length);
      for (let i = 0; i < killed; i++) this._removeUnit(zs[i].id);
      wf.fired = true;
      wf.result = { target, rolls, killed };
      this.log(`${SIDE[p].name} fires from the wall at ${this.T[from].name}: ${hits} hit(s), ${killed} zombie(s) destroyed in ${this.T[target].name}.`, 'combat');
      return ok({ rolls, killed });
    }

    _rollSide(units, stat) {
      return units.map(u => {
        const r = this.d6();
        return { id: u.id, type: u.type, roll: r, hit: r <= UNITS[u.type][stat] };
      });
    }
    _takeCasualties(units, hits, order) {
      order = order || CASUALTY_ORDER;
      const sorted = units.slice().sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
      return sorted.slice(0, hits);
    }

    /** One round of a battle. order: optional casualty priority for the active player. */
    battleRound(tid, order) {
      if (this.s.phase !== 'combat') return fail('Not in combat.');
      const b = this.s.battles.find(x => x.tid === tid && !x.done);
      if (!b) return fail('No battle there.');
      const res = this._round(b, order, null);
      this._checkBattleEnd(b);
      return ok(res);
    }

    autoResolve(tid, order) {
      const b = this.s.battles.find(x => x.tid === tid && !x.done);
      if (!b) return fail('No battle there.');
      let guard = 0;
      while (!b.done && guard++ < 200) { this._round(b, order, null); this._checkBattleEnd(b); }
      return ok();
    }

    _round(b, attOrder, defOrder) {
      const att = this.unitsAt(b.tid, b.attacker);
      const def = this.unitsAt(b.tid, b.defender);
      const ar = this._rollSide(att, 'att');
      const dr = this._rollSide(def, 'def');
      const ah = ar.filter(r => r.hit).length;
      const dh = dr.filter(r => r.hit).length;
      const defLost = this._takeCasualties(def, ah, defOrder);
      const attLost = this._takeCasualties(att, dh, attOrder);
      for (const u of defLost) { b.defCas.push(u.type); this._removeUnit(u.id); }
      for (const u of attLost) { b.attCas.push(u.type); this._removeUnit(u.id); }
      b.round += 1;
      b.last = {
        att: ar, def: dr,
        attLost: attLost.map(u => u.type), defLost: defLost.map(u => u.type),
      };
      this.log(`Battle at ${this.T[b.tid].name}, round ${b.round}: ${SIDE[b.attacker].name} ${ah} hit(s), ${SIDE[b.defender].name} ${dh} hit(s).`, 'combat');
      return b.last;
    }

    _zombify(tid, casualties, owner) {
      const n = casualties.filter(t => UNITS[t] && UNITS[t].land && t !== 'zombie').length;
      for (let i = 0; i < n; i++) this._addUnit('zombie', Z, tid);
      if (n) this.log(`${n} fallen ${SIDE[owner].name} unit(s) rise as zombies in ${this.T[tid].name}!`, 'zombie');
      return n;
    }

    _checkBattleEnd(b) {
      const attAlive = this.unitsAt(b.tid, b.attacker);
      const defAlive = this.unitsAt(b.tid, b.defender);
      const aA = attAlive.length > 0, dA = defAlive.length > 0;
      if (aA && dA) return;
      b.done = true;
      const name = this.T[b.tid].name;
      if (!dA) {
        // defenders wiped out (attacker won, or both sides destroyed)
        b.result = aA ? 'attacker' : 'mutual';
        if (b.attacker === Z) {
          this.log(`Zombies overrun ${name}!`, 'zombie');
          this._zombify(b.tid, b.defCas, b.defender);
        } else if (aA && attAlive.some(u => UNITS[u.type].land)) {
          this.s.territories[b.tid].owner = b.attacker;
          this.log(`${SIDE[b.attacker].name} wins at ${name} and takes control.`, 'combat');
        } else if (aA) {
          this.log(`${SIDE[b.attacker].name} clears ${name} from the air (no land units to occupy it).`, 'combat');
        } else {
          this.log(`Both sides are wiped out at ${name}.`, 'combat');
        }
        // attacking players who die fighting zombies (and do not win) rise
        if (b.defender === Z && !aA) this._zombify(b.tid, b.attCas, b.attacker);
      } else {
        b.result = 'defender';
        this.log(`${SIDE[b.defender].name} holds ${name}.`, 'combat');
        if (b.defender === Z) this._zombify(b.tid, b.attCas, b.attacker);
      }
    }

    retreatOptions(tid) {
      const p = this.s.current;
      const b = this.s.battles.find(x => x.tid === tid && !x.done);
      if (!b || b.attacker !== p || b.round < 1) return [];
      const origins = new Set(this.unitsAt(tid, p).map(u => u.origin).filter(Boolean));
      return [...origins].filter(t => !this.hostileTo(p, t) && this.owner(t) === p);
    }

    retreat(tid, to) {
      const p = this.s.current;
      const b = this.s.battles.find(x => x.tid === tid && !x.done);
      if (!b) return fail('No battle there.');
      if (!this.retreatOptions(tid).includes(to)) return fail('Cannot retreat there.');
      for (const u of this.unitsAt(tid, p)) u.at = to;
      b.done = true;
      b.result = 'retreat';
      this.log(`${SIDE[p].name} retreats from ${this.T[tid].name} to ${this.T[to].name}.`, 'combat');
      if (b.defender === Z) this._zombify(tid, b.attCas, p);
      return ok();
    }

    // ----------------------------------------------------------- phase flow
    endPhase() {
      const s = this.s;
      if (s.winner) return fail('The game is over.');
      s.moveUndo = [];
      switch (s.phase) {
        case 'purchase':
          s.phase = 'combatMove';
          this.takeSnapshot();
          return ok();
        case 'combatMove':
          s.phase = 'combat';
          s.snapshot = null;
          this._setupCombat();
          return ok();
        case 'combat': {
          const open = s.battles.filter(b => !b.done);
          if (open.length) return fail(`Resolve all battles first (${open.map(b => this.T[b.tid].name).join(', ')}).`);
          s.phase = 'noncombatMove';
          this.takeSnapshot();
          return ok();
        }
        case 'noncombatMove':
          this._endPlayerTurn();
          return ok();
        case 'zombieMove':
          if (!s.zombieController) this._autoZombieMove();
          s.phase = 'zombieSpawn';
          s.snapshot = null;
          return ok();
        case 'zombieSpawn':
          this._zombieSpawn();
          s.phase = 'zombieCombat';
          return ok();
        case 'zombieCombat':
          this._zombieCombat();
          this._nextRound();
          return ok();
        default:
          return fail('Unknown phase.');
      }
    }

    _startPlayerTurn(p) {
      const s = this.s;
      s.current = p;
      s.phase = 'purchase';
      s.pending = [];
      s.battles = [];
      s.wallFire = [];
      for (const u of Object.values(s.units)) {
        if (u.owner === p) { u.moved = 0; u.combatMoved = false; u.oilPaid = false; u.origin = null; }
      }
      const pl = s.players[p];
      if (pl.holding) {
        if (this.meetsVictory(p)) {
          s.winner = p;
          s.phase = 'gameOver';
          this.log(`${SIDE[p].name} has held every neighborhood of La Crosse and Onalaska for a full round. ${SIDE[p].name} WINS!`, 'win');
          return;
        }
        pl.holding = false;
        this.log(`${SIDE[p].name} lost its grip on the cities.`);
      }
      this.takeSnapshot();
      this.log(`— ${SIDE[p].name}'s turn (round ${s.round}) —`, 'turn');
    }

    _endPlayerTurn() {
      const s = this.s;
      const p = s.current;
      // aircraft must land
      for (const u of Object.values(s.units)) {
        if (u.owner !== p || !UNITS[u.type].air || u.moved === 0) continue;
        if (!this.landingSites(p, u.type).includes(u.at)) {
          this.log(`${UNITS[u.type].name} could not reach a landing site and crashed.`, 'combat');
          this._removeUnit(u.id);
        }
      }
      // mobilize
      const placed = {};
      for (const type of s.pending) {
        const def = UNITS[type];
        let where = null;
        if (def.air) {
          const sites = this.landingSites(p, type);
          where = (type === 'heli' && sites.find(t => (this.T[t].special || []).includes('gundersen'))) || sites[0] || null;
        } else if (this.controls(p, this.cityHall(p))) {
          where = this.cityHall(p);
        }
        if (where) {
          const u = this._addUnit(type, p, where);
          u.moved = 0;
          placed[type] = (placed[type] || 0) + 1;
        } else {
          this.log(`No place to deploy a new ${def.name}; it is lost.`);
        }
      }
      if (Object.keys(placed).length) this.log(`${SIDE[p].name} deploys ${describe(placed)}.`);
      s.pending = [];
      // income
      const inc = this.income(p);
      s.players[p].sp += inc.sp;
      s.players[p].oil += inc.oil;
      this.log(`${SIDE[p].name} collects ${inc.sp} supply and ${inc.oil} oil.`);
      // defeat check
      const landUnits = Object.values(s.units).filter(u => u.owner === p && UNITS[u.type].land);
      if (!this.controls(p, this.cityHall(p)) || landUnits.length === 0) {
        this._defeat(p);
      } else if (this.meetsVictory(p)) {
        s.players[p].holding = true;
        this.log(`${SIDE[p].name} controls every neighborhood! Hold until your next turn to win.`, 'win');
      }
      if (s.winner) return;
      // next
      const other = enemyOf(p);
      if (p === 'LAX' && !s.players.ONA.defeated) this._startPlayerTurn('ONA');
      else this._startZombieTurn();
      void other;
    }

    _defeat(p) {
      const s = this.s;
      s.players[p].defeated = true;
      s.players[p].sp = 0;
      s.players[p].holding = false;
      let converted = 0;
      for (const u of Object.values(s.units)) {
        if (u.owner !== p) continue;
        if (UNITS[u.type].land && s.rules.defeatedUnitsBecomeZombies) { u.owner = Z; u.type = 'zombie'; converted++; }
        else this._removeUnit(u.id);
      }
      for (const tid in s.territories) if (s.territories[tid].owner === p) s.territories[tid].owner = null;
      this.log(`${SIDE[p].name} HAS FALLEN. ${converted} survivor(s) turn into zombies.`, 'win');
      const alive = PLAYERS.filter(x => !s.players[x].defeated);
      if (!alive.length) {
        s.winner = Z;
        s.phase = 'gameOver';
        this.log(`Both cities have fallen. The ZOMBIES win${s.zombieController ? ` (${SIDE[s.zombieController].name} commanding the horde)` : ''}.`, 'win');
        return;
      }
      if (!s.zombieController) {
        s.zombieController = p;
        this.log(`${SIDE[p].name} now commands the zombie horde.`, 'zombie');
      }
    }

    _startZombieTurn() {
      const s = this.s;
      s.phase = 'zombieMove';
      s.current = Z;
      s.zombieReport = { smashed: [], moves: [], spawnDice: [], spawned: [], battles: [] };
      for (const u of Object.values(s.units)) if (u.owner === Z) { u.moved = 0; u.smashed = false; }
      this.log(`— Zombie turn (round ${s.round}) —`, 'turn');
      if (s.zombieController) this.takeSnapshot();
    }

    _nextRound() {
      const s = this.s;
      if (s.winner) return;
      s.round += 1;
      const first = PLAYERS.find(p => !s.players[p].defeated);
      this._startPlayerTurn(first);
    }

    // ------------------------------------------------------------ zombie AI
    /** Where the zombie stack at tid wants to go (automatic zombies). */
    zombieIntent(tid) {
      const t = this.T[tid];
      const next = (t.zombieNext || []).slice();
      if (next.length) return { type: 'road', options: next };
      // end of the road (a City Hall): go for the most player units nearby
      let best = [], bestN = 0;
      for (const n of t.adj) {
        if (this.wallIntact(tid, n)) continue;
        const k = this.unitsAt(n).filter(u => u.owner !== Z).length;
        if (k > bestN) { best = [n]; bestN = k; } else if (k === bestN && k > 0) best.push(n);
      }
      return { type: 'hunt', options: best };
    }

    _autoZombieMove() {
      const s = this.s;
      const rep = s.zombieReport;
      const stacks = {};
      for (const u of Object.values(s.units)) if (u.owner === Z) (stacks[u.at] = stacks[u.at] || []).push(u);
      const moves = [];
      for (const tid of Object.keys(stacks)) {
        // zombies sharing a territory with players are busy eating
        if (this.unitsAt(tid).some(u => u.owner !== Z)) continue;
        const intent = this.zombieIntent(tid);
        if (!intent.options.length) continue;
        const dest = intent.options.length > 1 ? this.pick(intent.options) : intent.options[0];
        if (this.wallIntact(tid, dest)) {
          const w = this.wallBetween(tid, dest);
          s.walls[w] = false;
          rep.smashed.push(w);
          this.log(`Zombies in ${this.T[tid].name} tear down the wall into ${this.T[dest].name}!`, 'zombie');
          continue;
        }
        moves.push({ from: tid, to: dest, units: stacks[tid] });
      }
      for (const m of moves) {
        for (const u of m.units) { u.at = m.to; u.moved = 1; }
        rep.moves.push({ from: m.from, to: m.to, n: m.units.length });
        this.log(`${m.units.length} zombie(s) shamble ${this.T[m.from].name} → ${this.T[m.to].name}.`, 'zombie');
      }
    }

    // manual zombie control (defeated player)
    zombieCanMove(u) {
      return this.s.phase === 'zombieMove' && !!this.s.zombieController && u.owner === Z && !u.moved && !u.smashed;
    }
    zombieMove(unitIds, from, to) {
      if (this.s.phase !== 'zombieMove' || !this.s.zombieController) return fail('Zombies move automatically.');
      const units = unitIds.map(id => this.s.units[id]);
      if (!units.length || units.some(u => !u || u.at !== from || !this.zombieCanMove(u))) return fail('Those zombies cannot move.');
      if (!this.adj[from].has(to)) return fail('Zombies move one territory at a time.');
      if (this.wallIntact(from, to)) return fail('An intact wall blocks the way. Smash it first (takes a turn).');
      this._pushMoveUndo();
      for (const u of units) { u.at = to; u.moved = 1; }
      this.s.zombieReport.moves.push({ from, to, n: units.length });
      this.log(`${units.length} zombie(s) shamble ${this.T[from].name} → ${this.T[to].name}.`, 'zombie');
      return ok();
    }
    zombieSmash(from, to) {
      if (this.s.phase !== 'zombieMove' || !this.s.zombieController) return fail('Zombies act automatically.');
      const w = this.wallBetween(from, to);
      if (!w || !this.s.walls[w]) return fail('No intact wall there.');
      const zs = this.zombiesAt(from).filter(u => this.zombieCanMove(u));
      if (!zs.length) return fail('Need zombies that have not moved this turn next to the wall.');
      this._pushMoveUndo();
      this.s.walls[w] = false;
      for (const u of zs) u.smashed = true;
      this.s.zombieReport.smashed.push(w);
      this.log(`Zombies in ${this.T[from].name} tear down the wall into ${this.T[to].name}!`, 'zombie');
      return ok();
    }

    /** Dice rolled at EACH zombie outskirt (outer-ring territory) this round. */
    spawnDiceCount() { return Math.ceil(this.s.round / 2); }
    spawnTerritories() { return this.map.territories.filter(t => t.spawn).sort((a, b) => a.spawn - b.spawn); }

    _zombieSpawn() {
      const s = this.s;
      const rep = s.zombieReport;
      const n = this.spawnDiceCount();
      // every outskirt rolls its own dice; each 6 is a zombie there
      for (const t of this.spawnTerritories()) {
        const rolls = [];
        for (let i = 0; i < n; i++) rolls.push(this.d6());
        const sixes = rolls.filter(r => r === 6).length;
        for (let i = 0; i < sixes; i++) { this._addUnit('zombie', Z, t.id); rep.spawned.push(t.id); }
        rep.spawnDice.push({ tid: t.id, rolls, sixes });
        if (sixes) this.log(`${sixes} zombie(s) claw their way out at ${t.name}.`, 'zombie');
      }
      if (!rep.spawned.length) this.log(`Spawn rolls: no sixes at any outskirt — no new zombies.`, 'zombie');
    }

    _zombieCombat() {
      const s = this.s;
      const rep = s.zombieReport;
      for (const t of this.map.territories) {
        const z = this.zombiesAt(t.id);
        if (!z.length) continue;
        for (const p of PLAYERS) {
          if (!this.unitsAt(t.id, p).length) continue;
          const b = { tid: t.id, attacker: Z, defender: p, round: 0, done: false, attCas: [], defCas: [], rounds: [] };
          let guard = 0;
          while (!b.done && guard++ < 200) {
            const r = this._round(b, null, null);
            b.rounds.push(r);
            this._checkBattleEnd(b);
          }
          rep.battles.push({ tid: t.id, defender: p, result: b.result, rounds: b.rounds, attCas: b.attCas, defCas: b.defCas });
        }
      }
    }

    // --------------------------------------------------------- reporting
    summary(p) {
      const inc = this.income(p);
      const units = this.countBy(Object.values(this.s.units).filter(u => u.owner === p));
      const terr = this.map.territories.filter(t => this.owner(t.id) === p).length;
      return { income: inc, units, territories: terr };
    }
  }

  function ok(extra) { return Object.assign({ ok: true }, extra || {}); }
  function fail(error) { return { ok: false, error }; }
  function describe(counts) {
    const parts = [];
    for (const k of Object.keys(counts)) {
      const n = counts[k];
      const name = UNITS[k] ? UNITS[k].name : k;
      parts.push(`${n} ${name}${n > 1 && !name.endsWith('y') ? 's' : ''}`);
    }
    return parts.join(', ');
  }

  return { Game, UNITS, SIDE, PLAYERS, Z, PHASE_NAMES, PLAYER_PHASES, ZOMBIE_PHASES, DEFAULT_RULES, CASUALTY_ORDER, describe, enemyOf };
});
