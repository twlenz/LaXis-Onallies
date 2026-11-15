// Fair-die checks for the engine's seeded d6 (chi-square tests at the 0.1% level, fixed seeds so they are repeatable).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../game/js/engine.js');
const fixture = require('./fixture-map.js');

// chi-square critical values at p = 0.001
const CRIT_DF5 = 20.515;
const CRIT_DF35 = 66.619;

function chiSquare(counts, expected) {
  return counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
}

test('each face comes up 1/6 of the time (600,000 rolls)', () => {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let seed = 1; seed <= 100; seed++) {
    const g = Game.newGame(fixture, { seed: seed * 7919 });
    for (let i = 0; i < 6000; i++) counts[g.d6() - 1]++;
  }
  const chi = chiSquare(counts, 100000);
  assert.ok(chi < CRIT_DF5, `chi-square ${chi.toFixed(2)} for counts ${counts.join(', ')}`);
  for (const c of counts) assert.ok(Math.abs(c / 600000 - 1 / 6) < 0.003, `face share ${c / 600000}`);
});

test('the first roll of a new game is not biased by the seed', () => {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let seed = 0; seed < 12000; seed++) counts[Game.newGame(fixture, { seed }).d6() - 1]++;
  const chi = chiSquare(counts, 2000);
  assert.ok(chi < CRIT_DF5, `chi-square ${chi.toFixed(2)} for counts ${counts.join(', ')}`);
});

test('consecutive rolls are independent (all 36 pairs equally likely)', () => {
  const pairs = new Array(36).fill(0);
  const g = Game.newGame(fixture, { seed: 424242 });
  let prev = g.d6();
  for (let i = 0; i < 360000; i++) {
    const cur = g.d6();
    pairs[(prev - 1) * 6 + (cur - 1)]++;
    prev = cur;
  }
  const chi = chiSquare(pairs, 10000);
  assert.ok(chi < CRIT_DF35, `chi-square ${chi.toFixed(2)}`);
});

test('zombie spawn dice roll sixes 1/6 of the time', () => {
  let dice = 0, sixes = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const g = Game.newGame(fixture, { seed });
    for (let round = 0; round < 6; round++) {
      while (g.s.phase !== 'zombieSpawn') g.endPhase();
      g.endPhase();
      for (const sd of g.s.zombieReport.spawnDice) { dice += sd.rolls.length; sixes += sd.sixes; }
      // clear the board so nothing interferes with the next round
      for (const u of Object.values(g.s.units)) if (u.owner === 'Z') g._removeUnit(u.id);
      g.endPhase();
    }
  }
  const share = sixes / dice;
  // binomial standard error for ~21,600 dice is ~0.0025; allow 4 SE
  assert.ok(Math.abs(share - 1 / 6) < 0.011, `sixes ${sixes}/${dice} = ${share.toFixed(4)}`);
});
