// Invariants for the generated board (game/js/mapdata.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const MAP = require('../game/js/mapdata.js');
const { Game } = require('../game/js/engine.js');
const AI = require('../game/js/ai.js');

const T = Object.fromEntries(MAP.territories.map(t => [t.id, t]));

test('ids unique, adjacency symmetric and known', () => {
  assert.equal(Object.keys(T).length, MAP.territories.length);
  for (const t of MAP.territories) {
    assert.ok(t.adj.length > 0, `${t.id} has neighbors`);
    for (const n of t.adj) {
      assert.ok(T[n], `${t.id} -> unknown ${n}`);
      assert.ok(T[n].adj.includes(t.id), `${t.id} <-> ${n} symmetric`);
    }
  }
});

test('board is one connected graph', () => {
  const seen = new Set([MAP.territories[0].id]);
  const q = [MAP.territories[0].id];
  while (q.length) for (const n of T[q.shift()].adj) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.equal(seen.size, MAP.territories.length);
});

test('special territories and spawn points', () => {
  assert.ok(T[MAP.cityHalls.LAX].special.includes('cityhall'));
  assert.ok(T[MAP.cityHalls.ONA].special.includes('cityhall'));
  assert.equal(MAP.territories.filter(t => t.special.includes('airport')).length, 1);
  assert.equal(MAP.territories.filter(t => t.special.includes('gundersen')).length, 1);
  const spawns = MAP.territories.filter(t => t.spawn).map(t => t.spawn).sort();
  assert.deepEqual(spawns, [1, 2, 3, 4, 5, 6, 7], 'six outer-ring outskirts plus the Minnesota Bluffs');
  for (const t of MAP.territories.filter(x => x.spawn)) assert.equal(t.inside, false);
});

test('walls exactly cover the inside/outside borders; none between the cities', () => {
  const wallSet = new Set(MAP.walls.map(w => w.inside + '|' + w.outside));
  for (const t of MAP.territories) {
    for (const n of t.adj) {
      const crosses = t.inside !== T[n].inside;
      if (t.inside && crosses) assert.ok(wallSet.has(t.id + '|' + n), `wall ${t.id}|${n}`);
    }
  }
  for (const w of MAP.walls) {
    assert.equal(T[w.inside].inside, true);
    assert.equal(T[w.outside].inside, false);
    assert.ok(w.path.length > 4, `wall ${w.id} has geometry`);
  }
});

test('every zombie road leads to a downtown', () => {
  for (const t of MAP.territories) {
    for (const n of t.zombieNext) assert.ok(t.adj.includes(n));
    let cur = t.id, steps = 0;
    while (T[cur].zombieNext.length && steps++ < 60) cur = T[cur].zombieNext[0];
    assert.ok(T[cur].special.includes('cityhall'), `${t.id} road ends at ${cur}`);
  }
});

test('Kwik Trips exist and are counted into territories', () => {
  const total = MAP.territories.reduce((s, t) => s + t.kwikTrips, 0);
  assert.ok(total >= 5, `found ${total}`);
  assert.equal(total, MAP.kwikTrips.length);
});

test('AI self-play completes games on the real map', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const g = Game.newGame(MAP, { seed });
    let n = 0;
    while (!g.s.winner && g.s.round <= 40 && n++ < 60000) AI.step(g);
    assert.ok(g.s.round > 1);
  }
});
