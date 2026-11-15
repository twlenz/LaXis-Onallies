const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, UNITS } = require('../game/js/engine.js');
const map = require('./fixture-map.js');

function newGame(opts) { return Game.newGame(map, Object.assign({ seed: 1 }, opts || {})); }
/** Force the next dice rolls (then fall back to the seeded RNG). */
function rig(g, rolls) {
  const orig = g.d6.bind(g);
  const queue = rolls.slice();
  g.d6 = () => (queue.length ? queue.shift() : orig());
  return queue;
}
const ids = (g, tid, owner, type) => g.unitsAt(tid, owner).filter(u => !type || u.type === type).map(u => u.id);
function skipTo(g, phase) { let n = 0; while (g.s.phase !== phase && n++ < 50) assert.ok(g.endPhase().ok, `endPhase from ${g.s.phase}`); }
function runZombieTurn(g) { skipTo(g, 'zombieMove'); g.endPhase(); g.endPhase(); g.endPhase(); }

test('setup: starting income becomes starting supply', () => {
  const g = newGame();
  assert.equal(g.s.players.LAX.sp, 8);
  assert.equal(g.s.players.ONA.sp, 6);
  assert.equal(g.s.current, 'LAX');
  assert.equal(g.s.phase, 'purchase');
  assert.equal(Object.keys(g.s.walls).length, 4);
});

test('purchase: costs, refunds and the airport requirement', () => {
  const g = newGame();
  assert.ok(g.buy('inf').ok);
  assert.equal(g.s.players.LAX.sp, 5);
  assert.ok(g.unbuy('inf').ok);
  assert.equal(g.s.players.LAX.sp, 8);
  g.s.players.LAX.sp = 50;
  assert.equal(g.buy('heli').ok, false, 'needs airport');
  assert.equal(g.buy('plane').ok, false, 'plane is Onalaska only');
  g.s.territories.FI.owner = 'LAX';
  assert.ok(g.buy('heli').ok);
  assert.equal(g.buy('heli').ok, false, 'only one helicopter');
});

test('movement: capture empty territory, oil for tanks, walls do not block players', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  const inf = ids(g, 'LDT', 'LAX', 'inf')[0];
  assert.ok(g.move([inf], 'LDT', 'FI').ok);
  assert.equal(g.owner('FI'), 'LAX');
  const tank = ids(g, 'LDT', 'LAX', 'tank')[0];
  g.s.players.LAX.oil = 0;
  assert.equal(g.move([tank], 'LDT', 'LN').ok, false, 'no oil');
  g.s.players.LAX.oil = 1;
  // tank moves 2: LDT -> LN -> EAST (outside the wall)
  assert.ok(g.move([tank], 'LDT', 'EAST').ok);
  assert.equal(g.s.players.LAX.oil, 0);
  assert.equal(g.owner('EAST'), 'LAX');
  assert.equal(g.s.units[tank].at, 'EAST');
});

test('land units cross the wall only at gates or breaches; aircraft fly over', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  const gunInf = ids(g, 'GUN', 'LAX', 'inf')[0];
  assert.equal(g.findPath([gunInf], 'GUN', 'SOUTH'), null, 'GUN|SOUTH is a plain wall');
  g.s.walls['GUN|SOUTH'] = false;
  assert.ok(g.findPath([gunInf], 'GUN', 'SOUTH'), 'breached wall can be crossed');
  const lnInf = ids(g, 'LN', 'LAX', 'inf')[0];
  assert.ok(g.findPath([lnInf], 'LN', 'EAST'), 'LN|EAST is a gate');
  g.s.territories.FI.owner = 'LAX';
  const heli = g._addUnit('heli', 'LAX', 'LDT');
  g.s.walls['GUN|SOUTH'] = true;
  assert.ok(g.findPath([heli.id], 'LDT', 'SOUTH'), 'helicopter flies over the wall');
});

test('zombies: one turn next to the wall, next turn smash it, then walk in', () => {
  const g = newGame();
  g._addUnit('zombie', 'Z', 'EAST');
  rig(g, [1, 1, 1, 1, 1, 1]); // keep spawn dice quiet
  runZombieTurn(g); // round 1 zombie turn: arrow EAST->LN crosses an intact wall => smash
  assert.equal(g.s.walls['LN|EAST'], false);
  assert.equal(g.zombiesAt('EAST').length, 1, 'smashing takes the whole turn');
  rig(g, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  skipTo(g, 'zombieMove');
  g.endPhase(); // move
  assert.equal(g.zombiesAt('LN').length, 1, 'zombie entered the breached territory');
});

test('fortified wall fire hits zombies across the wall, no return fire', () => {
  const g = newGame();
  g._addUnit('zombie', 'Z', 'EAST');
  g._addUnit('zombie', 'Z', 'EAST');
  skipTo(g, 'combat');
  const wf = g.s.wallFire.find(w => w.from === 'LN');
  assert.ok(wf, 'LN can fire over its wall');
  rig(g, [2]); // infantry at LN fires at defense value 2 => hit
  const r = g.fireWall('LN', 'EAST');
  assert.ok(r.ok);
  assert.equal(r.killed, 1);
  assert.equal(g.zombiesAt('EAST').length, 1);
  assert.equal(g.unitsAt('LN', 'LAX').length, 1, 'shooter untouched');
  assert.equal(g.fireWall('LN', 'EAST').ok, false, 'one volley per turn');
});

test('units that moved this turn are not fortified', () => {
  const g = newGame();
  g._addUnit('zombie', 'Z', 'EAST');
  skipTo(g, 'combatMove');
  const inf = ids(g, 'LDT', 'LAX', 'inf')[0];
  const lnInf = ids(g, 'LN', 'LAX', 'inf')[0];
  g.move([lnInf], 'LN', 'LDT');
  void inf;
  g.endPhase();
  assert.equal(g.s.wallFire.find(w => w.from === 'LN'), undefined);
});

test('zombie attack that wins turns the dead defenders into zombies', () => {
  const g = newGame();
  // 3 zombies next to an already broken wall
  g.s.walls['GUN|SOUTH'] = false;
  for (let i = 0; i < 3; i++) g._addUnit('zombie', 'Z', 'SOUTH');
  skipTo(g, 'zombieMove');
  // movement: no dice. spawn: 1 die at each of 6 outskirts (all 1). combat: zombies hit x3 (1), defender misses (6)
  rig(g, [1, 1, 1, 1, 1, 1, 1, 1, 1, 6]);
  g.endPhase(); // move SOUTH -> GUN
  assert.equal(g.zombiesAt('GUN').length, 3);
  g.endPhase(); // spawn (no sixes)
  g.endPhase(); // combat
  assert.equal(g.unitsAt('GUN', 'LAX').length, 0);
  assert.equal(g.zombiesAt('GUN').length, 4, '3 attackers + 1 risen infantry');
  assert.equal(g.owner('GUN'), 'LAX', 'ownership remains but it is overrun');
  assert.equal(g.controls('LAX', 'GUN'), false);
});

test('zombie attack that is repelled does not create zombies', () => {
  const g = newGame();
  g.s.walls['GUN|SOUTH'] = false;
  g._addUnit('zombie', 'Z', 'SOUTH');
  skipTo(g, 'zombieMove');
  rig(g, [1, 1, 1, 1, 1, 1, 4, 1]); // 6 quiet spawn dice; zombie misses (4), defender hits (1)
  g.endPhase(); g.endPhase(); g.endPhase();
  assert.equal(g.zombiesAt('GUN').length, 0);
  assert.equal(g.unitsAt('GUN', 'LAX').length, 1);
});

test('attacking zombies: retreat converts the fallen, victory does not', () => {
  const g = newGame();
  g._addUnit('zombie', 'Z', 'FI');
  g._addUnit('zombie', 'Z', 'FI');
  skipTo(g, 'combatMove');
  const two = ids(g, 'LDT', 'LAX', 'inf');
  assert.ok(g.move(two, 'LDT', 'FI').ok);
  g.endPhase();
  // round: LAX inf roll 6,6 (miss); zombies roll 1, 6 => one LAX infantry dies
  rig(g, [6, 6, 1, 6]);
  g.battleRound('FI');
  assert.deepEqual(g.retreatOptions('FI'), ['LDT']);
  assert.ok(g.retreat('FI', 'LDT').ok);
  assert.equal(g.zombiesAt('FI').length, 3, 'the fallen infantryman rises');

  const h = newGame();
  h._addUnit('zombie', 'Z', 'FI');
  skipTo(h, 'combatMove');
  h.move(ids(h, 'LDT', 'LAX', 'inf'), 'LDT', 'FI');
  h.endPhase();
  rig(h, [1, 6, 1]); // LAX hits once and misses once; zombie hits once
  h.battleRound('FI');
  assert.equal(h.zombiesAt('FI').length, 0, 'no rising when the attacker wins');
  assert.equal(h.owner('FI'), 'LAX');
});

test('player vs player combat follows A&A: casualties removed, territory captured', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 5;
  g.move(ids(g, 'LDT', 'LAX'), 'LDT', 'LN'); // all LDT units to LN (staging)
  void 0;
  const h = newGame();
  skipTo(h, 'combatMove');
  h.move(ids(h, 'LN', 'LAX'), 'LN', 'ODT');
  h.endPhase();
  assert.equal(h.s.battles.length, 1);
  rig(h, [1, 6, 6, 6]); // LAX inf hits; ONA 2 inf + tank miss
  h.battleRound('ODT');
  assert.equal(h.unitsAt('ODT', 'ONA').length, 2);
  assert.equal(h.zombiesAt('ODT').length, 0);
});

test('aircraft crash if they do not end at a landing site', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 5;
  assert.ok(g.move([heli.id], 'GUN', 'LN').ok);
  skipTo(g, 'noncombatMove');
  g.endPhase();
  assert.equal(g.s.units[heli.id], undefined);
});

test('aircraft pay 1 oil to move in a turn, not per space, and only once per turn', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 0;
  assert.equal(g.unitCanMove(heli), false, 'no oil, no flight');
  assert.equal(g.move([heli.id], 'GUN', 'LN').ok, false);
  g.s.players.LAX.oil = 1;
  assert.ok(g.move([heli.id], 'GUN', 'LN').ok, 'two spaces for one oil');
  assert.equal(g.s.players.LAX.oil, 0);
  skipTo(g, 'noncombatMove');
  assert.ok(g.move([heli.id], 'LN', 'LDT').ok, 'already fuelled this turn');
  assert.equal(g.s.players.LAX.oil, 0);
});

test('helicopter can carry one infantry farther than it could walk', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  const inf = ids(g, 'GUN', 'LAX', 'inf')[0];
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 5;
  assert.ok(g.move([heli.id, inf], 'GUN', 'ODT').ok, 'GUN->LDT->LN->ODT is 3 spaces');
  assert.equal(g.s.players.LAX.oil, 4, 'carried infantry burns no oil');
});

test('victory requires holding every inside territory for a full round', () => {
  const g = newGame();
  for (const tid of g.insideIds()) g.s.territories[tid].owner = 'LAX';
  for (const u of Object.values(g.s.units)) if (u.owner === 'ONA') u.at = 'HOL';
  skipTo(g, 'noncombatMove');
  g.endPhase();
  assert.equal(g.s.players.LAX.holding, true);
  assert.equal(g.s.winner, null);
  rig(g, Array(40).fill(1));
  while (!g.s.winner && g.s.round < 3) g.endPhase();
  assert.equal(g.s.winner, 'LAX');
});

test('losing your City Hall defeats you and hands you the horde', () => {
  const g = newGame();
  skipTo(g, 'noncombatMove');
  g.endPhase(); // LAX done -> ONA turn
  // zombies take Onalaska's city hall before ONA ends its turn
  for (const u of g.unitsAt('ODT', 'ONA')) g._removeUnit(u.id);
  g._addUnit('zombie', 'Z', 'ODT');
  skipTo(g, 'noncombatMove');
  g.endPhase();
  assert.equal(g.s.players.ONA.defeated, true);
  assert.equal(g.s.zombieController, 'ONA');
  assert.equal(g.zombiesAt('OE').length, 1, 'remaining Onalaska infantry turned');
  assert.equal(g.s.phase, 'zombieMove');
  // the controller moves zombies by hand, one space, not through intact walls
  const z = ids(g, 'OE', 'Z')[0];
  assert.equal(g.zombieMove([z], 'OE', 'HOL').ok, false, 'wall still intact');
  assert.ok(g.zombieMove([z], 'OE', 'ODT').ok);
});

test('spawn: every outskirt rolls round/2 (rounded up) dice on its own; each 6 is a zombie there', () => {
  const g = newGame();
  assert.equal(g.spawnDiceCount(), 1);
  g.s.round = 5;
  assert.equal(g.spawnDiceCount(), 3);
  skipTo(g, 'zombieSpawn');
  // outskirts in spawn order: NORTH, NORTH2, EAST, EAST2, SOUTH, SOUTH2 — 3 dice each
  rig(g, [6, 3, 2, /*N2*/ 1, 1, 1, /*E*/ 6, 6, 1, /*E2*/ 2, 2, 2, /*S*/ 5, 5, 6, /*S2*/ 1, 2, 3]);
  g.endPhase();
  assert.equal(g.zombiesAt('NORTH').length, 1);
  assert.equal(g.zombiesAt('NORTH2').length, 0);
  assert.equal(g.zombiesAt('EAST').length, 2);
  assert.equal(g.zombiesAt('SOUTH').length, 1);
  assert.equal(g.s.zombieReport.spawnDice.length, 6);
  assert.deepEqual(g.s.zombieReport.spawnDice[2], { tid: 'EAST', rolls: [6, 6, 1], sixes: 2 });
});

test('state is plain JSON and round-trips', () => {
  const g = newGame();
  g.buy('inf');
  const json = JSON.stringify(g.s);
  const h = Game.load(map, JSON.parse(json));
  assert.deepEqual(h.s.pending, ['inf']);
  assert.ok(h.endPhase().ok);
});

test('undo move takes back one move at a time (position, oil, captures)', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 3;
  const inf = ids(g, 'LDT', 'LAX', 'inf')[0];
  const tank = ids(g, 'LDT', 'LAX', 'tank')[0];
  assert.equal(g.canUndoMove(), false);
  assert.ok(g.move([inf], 'LDT', 'FI').ok);
  assert.ok(g.move([tank], 'LDT', 'EAST').ok);
  assert.equal(g.s.players.LAX.oil, 2);
  assert.ok(g.undoMove().ok);
  assert.equal(g.s.units[tank].at, 'LDT');
  assert.equal(g.s.players.LAX.oil, 3);
  assert.equal(g.owner('EAST'), null);
  assert.equal(g.s.units[inf].at, 'FI', 'earlier move still stands');
  assert.ok(g.undoMove().ok);
  assert.equal(g.s.units[inf].at, 'LDT');
  assert.equal(g.owner('FI'), null);
  assert.equal(g.undoMove().ok, false, 'nothing left');
  g.move([inf], 'LDT', 'FI');
  g.endPhase();
  assert.equal(g.canUndoMove(), false, 'moves lock in when the phase ends');
});

test('undo restores the phase start', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  const inf = ids(g, 'LDT', 'LAX', 'inf')[0];
  g.move([inf], 'LDT', 'FI');
  assert.ok(g.undoPhase().ok);
  assert.equal(g.s.units[inf].at, 'LDT');
  assert.equal(g.owner('FI'), null);
});

test('unit table sanity', () => {
  assert.equal(UNITS.zombie.att, 3);
  assert.equal(UNITS.zombie.def, 2);
});
