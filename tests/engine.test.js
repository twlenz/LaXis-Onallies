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

test('tanks move a space at a time: blitz on, stop when they hit a battle', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 3;
  const [tank] = ids(g, 'LDT', 'LAX', 'tank');
  // step 1: into unowned French Island (blitz capture), then on into Onalaska's City Hall (battle)
  assert.ok(g.move([tank], 'LDT', 'FI').ok);
  assert.equal(g.owner('FI'), 'LAX');
  assert.ok(g.unitCanMove(g.s.units[tank]), 'one space left');
  assert.equal(g.s.players.LAX.oil, 2, 'oil paid once');
  assert.ok(g.move([tank], 'FI', 'ODT').ok);
  assert.equal(g.s.players.LAX.oil, 2, 'second step is free');
  assert.equal(g.unitCanMove(g.s.units[tank]), false, 'movement used up, and it is in a battle');
  // infantry still move once
  const [inf] = ids(g, 'LDT', 'LAX', 'inf');
  assert.ok(g.move([inf], 'LDT', 'FI').ok, 'into land captured this turn');
  assert.equal(g.unitCanMove(g.s.units[inf]), false);
});

test('a tank that starts a battle with its first step cannot keep going', () => {
  const g = newGame();
  g._addUnit('zombie', 'Z', 'LN');
  for (const u of g.unitsAt('LN', 'LAX')) g._removeUnit(u.id);
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 3;
  const [tank] = ids(g, 'LDT', 'LAX', 'tank');
  assert.ok(g.move([tank], 'LDT', 'LN').ok);
  assert.equal(g.unitCanMove(g.s.units[tank]), false);
});

test('a two-space move goes through your own territory unless you step through enemy land', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  const [tank] = ids(g, 'LDT', 'LAX', 'tank');
  // LDT -> ODT can go via LN (yours) or FI (unowned): the default route avoids blitzing
  assert.deepEqual(g.findPath([tank], 'LDT', 'ODT').path, ['LDT', 'LN', 'ODT']);
  g.s.players.LAX.oil = 1;
  g.move([tank], 'LDT', 'ODT');
  assert.equal(g.owner('FI'), null, 'French Island was not blitzed');
});

test('aircraft fly into combat only if they can still get back to base', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  for (const u of g.unitsAt('LN', 'LAX')) g._removeUnit(u.id);
  g._addUnit('zombie', 'Z', 'LN');
  g._addUnit('zombie', 'Z', 'SOUTH');
  g._startPlayerTurn('LAX'); // re-record start-of-turn territories (airport now La Crosse's)
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 5;
  // ODT is 3 spaces out: nothing left to fly home -> not allowed
  assert.equal(g.findPath([heli.id], 'GUN', 'ODT'), null);
  // zombies in LN are 2 out; both bases are 2 back with only 1 space left -> not allowed
  assert.equal(g.findPath([heli.id], 'GUN', 'LN'), null);
  // zombies in SOUTH are 1 out, Gundersen 1 back -> allowed
  assert.ok(g.findPath([heli.id], 'GUN', 'SOUTH'));
  // and a friendly territory is never a combat-move destination for aircraft
  assert.equal(g.findPath([heli.id], 'GUN', 'LDT'), null);
});

test('aircraft land only at their base, and noncombat cannot end until they have', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  g._startPlayerTurn('LAX');
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 5;
  assert.ok(g.move([heli.id], 'GUN', 'SOUTH').ok, 'scouting unowned land outside the wall');
  assert.equal(g.s.players.LAX.oil, 4);
  skipTo(g, 'noncombatMove');
  assert.equal(g.canEndPhase().ok, false, 'helicopter still in the air');
  assert.match(g.canEndPhase().error, /Land your aircraft/);
  assert.equal(g.findPath([heli.id], 'SOUTH', 'LDT'), null, 'LDT is not a base');
  assert.ok(g.move([heli.id], 'SOUTH', 'GUN').ok, 'back to the Gundersen helipad');
  assert.equal(g.s.players.LAX.oil, 4, 'no second oil charge this turn');
  assert.ok(g.canEndPhase().ok);
  g.endPhase();
  assert.ok(g.s.units[heli.id], 'landed safely');
});

test('an airport captured this turn is not a landing site', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  assert.deepEqual(g.landingSites('LAX', 'plane'), []);
  assert.ok(g.move(ids(g, 'LDT', 'LAX', 'inf').slice(0, 1), 'LDT', 'FI').ok);
  assert.equal(g.owner('FI'), 'LAX');
  assert.deepEqual(g.landingSites('LAX', 'heli'), ['GUN'], 'Gundersen yes, the airport taken this turn no');
});

test('aircraft pay 1 oil to move in a turn, not per space', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  g._startPlayerTurn('LAX');
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 0;
  assert.equal(g.unitCanMove(heli), false, 'no oil, no flight');
  g.s.players.LAX.oil = 1;
  skipTo(g, 'noncombatMove');
  assert.ok(g.move([heli.id], 'GUN', 'FI').ok, 'two spaces (GUN-LDT-FI) to the airport for one oil');
  assert.equal(g.s.players.LAX.oil, 0);
});

test('helicopter can carry one infantry farther than it could walk', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  g._startPlayerTurn('LAX');
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  const inf = ids(g, 'GUN', 'LAX', 'inf')[0];
  skipTo(g, 'noncombatMove');
  g.s.players.LAX.oil = 5;
  assert.ok(g.move([heli.id, inf], 'GUN', 'FI').ok, 'GUN->LDT->FI is 2 spaces');
  assert.equal(g.s.units[inf].at, 'FI');
  assert.equal(g.s.players.LAX.oil, 4, 'carried infantry burns no oil');
});

test('A&A combat move: units cannot end in friendly land (tanks may pass through it)', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 3;
  const [inf] = ids(g, 'LDT', 'LAX', 'inf');
  const [tank] = ids(g, 'LDT', 'LAX', 'tank');
  assert.equal(g.findPath([inf], 'LDT', 'LN'), null, 'infantry: friendly land is noncombat only');
  assert.ok(g.move([tank], 'LDT', 'LN').ok, 'a tank may step into friendly land with a space left');
  assert.equal(g.canEndPhase().ok, false, 'but it cannot stop there');
  assert.match(g.canEndPhase().error, /must end in battle or a capture/);
  assert.ok(g.move([tank], 'LN', 'EAST').ok, 'on through the gate to capture');
  assert.ok(g.canEndPhase().ok);
});

test('A&A retreat: back to the adjacent friendly territory the attackers entered from', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 3;
  const [tank] = ids(g, 'LDT', 'LAX', 'tank');
  assert.ok(g.move([tank], 'LDT', 'ODT').ok, 'two spaces in one go, via LN');
  g.endPhase();
  rig(g, [6, 6, 6, 6]); // all miss
  g.battleRound('ODT');
  assert.deepEqual(g.retreatOptions('ODT'), ['LN'], 'not LDT, two spaces back');
  assert.equal(g.retreat('ODT', 'LDT').ok, false);
  assert.ok(g.retreat('ODT', 'LN').ok);

  const h = newGame();
  skipTo(h, 'combatMove');
  h.s.players.LAX.oil = 3;
  const [t2] = ids(h, 'LDT', 'LAX', 'tank');
  assert.ok(h.move([t2], 'LDT', 'FI').ok, 'blitz French Island');
  assert.ok(h.move([t2], 'FI', 'ODT').ok);
  assert.ok(h.move(ids(h, 'LN', 'LAX', 'inf'), 'LN', 'ODT').ok);
  h.endPhase();
  rig(h, [6, 6, 6, 6, 6]);
  h.battleRound('ODT');
  assert.deepEqual(h.retreatOptions('ODT').sort(), ['FI', 'LN'], 'either entry point; the blitzed island is friendly now');
  assert.ok(h.retreat('ODT', 'FI').ok);
  assert.equal(h.unitsAt('FI', 'LAX').length, 2, 'all attackers retreat together to one place');
});

test('retreating aircraft stay over the battle and fly home in noncombat', () => {
  const g = newGame();
  g.s.territories.FI.owner = 'LAX';
  g._addUnit('zombie', 'Z', 'SOUTH'); g._addUnit('zombie', 'Z', 'SOUTH');
  g._startPlayerTurn('LAX');
  const heli = g._addUnit('heli', 'LAX', 'GUN');
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 5;
  g.s.walls['GUN|SOUTH'] = false;
  const gunInf = ids(g, 'GUN', 'LAX', 'inf');
  assert.ok(g.move(gunInf, 'GUN', 'SOUTH').ok);
  assert.ok(g.move([heli.id], 'GUN', 'SOUTH').ok);
  g.endPhase();
  rig(g, [6, 6, 6, 6]); // everyone misses
  g.battleRound('SOUTH');
  assert.ok(g.retreat('SOUTH', 'GUN').ok);
  assert.equal(g.s.units[gunInf[0]].at, 'GUN');
  assert.equal(g.s.units[heli.id].at, 'SOUTH', 'helicopter stays put');
  skipTo(g, 'noncombatMove');
  assert.equal(g.canEndPhase().ok, false);
  assert.ok(g.move([heli.id], 'SOUTH', 'GUN').ok);
  assert.ok(g.canEndPhase().ok);
});

test('capturing the enemy City Hall seizes its treasury', () => {
  const g = newGame();
  for (const u of g.unitsAt('ODT', 'ONA')) g._removeUnit(u.id);
  g.s.players.ONA.sp = 17;
  skipTo(g, 'combatMove');
  const before = g.s.players.LAX.sp;
  assert.ok(g.move(ids(g, 'LN', 'LAX', 'inf'), 'LN', 'ODT').ok);
  assert.equal(g.owner('ODT'), 'LAX');
  assert.equal(g.s.players.ONA.sp, 0);
  assert.equal(g.s.players.LAX.sp, before + 17);
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
  assert.ok(g.move([lnInf], 'LN', 'EAST').ok, 'sallies out through the gate instead of firing');
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

test('each side chooses its own casualties after the dice; the phase cannot end until done', () => {
  const g = newGame();
  skipTo(g, 'combatMove');
  g.s.players.LAX.oil = 2;
  assert.ok(g.move(ids(g, 'LDT', 'LAX', 'tank'), 'LDT', 'ODT').ok);
  assert.ok(g.move(ids(g, 'LN', 'LAX', 'inf'), 'LN', 'ODT').ok);
  g.endPhase();
  assert.equal(g.canEndPhase().ok, false, 'battle unresolved');
  rig(g, [1, 1, /* defenders */ 1, 6, 6]); // LAX 2 hits, ONA 1 hit
  assert.ok(g.battleRoll('ODT').ok);
  assert.ok(g.casualtyChoiceNeeded('ODT', 'LAX'));
  assert.ok(g.casualtyChoiceNeeded('ODT', 'ONA'));
  assert.deepEqual(g.retreatOptions('ODT'), [], 'no retreat mid-round');
  assert.equal(g.battleRoll('ODT').ok, false, 'cannot roll again before choosing');
  assert.ok(g.chooseCasualties('ODT', 'LAX', { tank: 1 }).ok, 'LAX keeps its infantry, loses the tank');
  assert.equal(g.chooseCasualties('ODT', 'ONA', { inf: 1 }).ok, false, 'must take exactly 2');
  assert.equal(g.chooseCasualties('ODT', 'ONA', { tank: 2 }).ok, false, 'only has 1 tank');
  assert.ok(g.chooseCasualties('ODT', 'ONA', { inf: 1, tank: 1 }).ok);
  assert.deepEqual(g.countBy(g.unitsAt('ODT', 'LAX')), { inf: 1 });
  assert.deepEqual(g.countBy(g.unitsAt('ODT', 'ONA')), { inf: 1 });
  const b = g.s.battles.find(x => x.tid === 'ODT');
  assert.deepEqual(b.last.attLost, ['tank']);
  assert.equal(b.round, 1);
  assert.deepEqual(g.retreatOptions('ODT'), ['LN'], 'only the surviving infantry came from LN');
});

test('computer attacker waits for a human defender to choose casualties', () => {
  const AI = require('../game/js/ai.js');
  const g = newGame();
  skipTo(g, 'noncombatMove');
  g.endPhase(); // -> Onalaska's turn
  skipTo(g, 'combatMove');
  g.s.players.ONA.oil = 5;
  // La Crosse defends LN with infantry + tank so it has a real choice
  g._addUnit('tank', 'LAX', 'LN');
  g._addUnit('inf', 'LAX', 'LN');
  assert.ok(g.move(ids(g, 'ODT', 'ONA'), 'ODT', 'LN').ok);
  g.endPhase();
  rig(g, [1, 6, 6, /* La Crosse */ 6, 6, 6]); // Onalaska scores 1 hit: La Crosse picks infantry or tank
  const humanLAX = { isCpu: (side) => side !== 'LAX' };
  let r, n = 0;
  do { r = AI.step(g, humanLAX); } while (!(r && r.waiting) && g.s.phase === 'combat' && n++ < 20);
  const pend = g.pendingCasualtyChoices();
  assert.ok(r && r.waiting, 'computer stops and waits');
  assert.deepEqual(pend.map(x => x.side), ['LAX']);
  assert.ok(AI.step(g, humanLAX).waiting, 'still waiting until the human picks');
  assert.ok(g.chooseCasualties(pend[0].tid, 'LAX', { tank: 1 }).ok, 'human sacrifices the tank');
  assert.deepEqual(g.countBy(g.unitsAt('LN', 'LAX')), { inf: 2 });
  assert.equal(g.pendingCasualtyChoices().length, 0);
});

test('forced casualties need no choice', () => {
  const g = newGame();
  g._addUnit('zombie', 'Z', 'FI');
  skipTo(g, 'combatMove');
  g.move(ids(g, 'LDT', 'LAX', 'inf'), 'LDT', 'FI');
  g.endPhase();
  rig(g, [6, 6, 1]); // LAX misses twice; zombie hits once: only infantry there, so no choice
  g.battleRoll('FI');
  assert.equal(g.casualtyChoiceNeeded('FI', 'LAX'), false);
  assert.equal(g.casualtyChoiceNeeded('FI', 'Z'), false);
  assert.equal(g.unitsAt('FI', 'LAX').length, 1);
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
