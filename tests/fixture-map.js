// Small synthetic map used by the engine tests (independent of the real board).
//
//   NORTH(spawn 1-2) — HOL — OE ═ ODT ─ FI(airport)
//                        ║    ║    │   /
//   EAST(spawn 3-4) ══════════ LN ─ LDT ─ GUN ═ SOUTH(spawn 5-6)
//   (═ marks a wall between an inside and an outside territory)
const T = (id, o) => Object.assign({ id, name: id, adj: [], value: 0, kwikTrips: 0, inside: true, zombieNext: [] }, o);
const territories = [
  T('LDT', { startOwner: 'LAX', value: 4, special: ['cityhall'], startUnits: { inf: 2, tank: 1 } }),
  T('LN', { startOwner: 'LAX', value: 2, kwikTrips: 1, startUnits: { inf: 1 }, zombieNext: ['LDT'] }),
  T('GUN', { startOwner: 'LAX', value: 2, special: ['gundersen'], startUnits: { inf: 1 }, zombieNext: ['LDT'] }),
  T('ODT', { startOwner: 'ONA', value: 4, special: ['cityhall'], startUnits: { inf: 2, tank: 1 } }),
  T('OE', { startOwner: 'ONA', value: 2, kwikTrips: 1, startUnits: { inf: 1 }, zombieNext: ['ODT'] }),
  T('FI', { value: 1, special: ['airport'], zombieNext: ['ODT'] }),
  T('HOL', { inside: false, value: 2, zombieNext: ['OE'] }),
  T('NORTH', { inside: false, spawn: 1, zombieNext: ['HOL'] }),
  T('NORTH2', { inside: false, spawn: 2, zombieNext: ['HOL'] }),
  T('EAST', { inside: false, spawn: 3, zombieNext: ['LN'] }),
  T('EAST2', { inside: false, spawn: 4, zombieNext: ['EAST'] }),
  T('SOUTH', { inside: false, spawn: 5, zombieNext: ['GUN'] }),
  T('SOUTH2', { inside: false, spawn: 6, zombieNext: ['SOUTH'] }),
];
const edges = [
  ['LDT', 'LN'], ['LDT', 'GUN'], ['LN', 'ODT'], ['ODT', 'OE'], ['ODT', 'FI'], ['LDT', 'FI'],
  ['OE', 'HOL'], ['HOL', 'NORTH'], ['HOL', 'NORTH2'], ['EAST', 'LN'], ['EAST', 'OE'], ['EAST', 'EAST2'],
  ['GUN', 'SOUTH'], ['SOUTH', 'SOUTH2'],
];
const byId = Object.fromEntries(territories.map(t => [t.id, t]));
for (const [a, b] of edges) { byId[a].adj.push(b); byId[b].adj.push(a); }
const walls = [];
for (const [a, b] of edges) {
  const A = byId[a], B = byId[b];
  if (A.inside !== B.inside) {
    const inside = A.inside ? a : b, outside = A.inside ? b : a;
    walls.push({ id: `${inside}|${outside}`, inside, outside, gate: inside === 'LN' && outside === 'EAST' });
  }
}
module.exports = { territories, walls, cityHalls: { LAX: 'LDT', ONA: 'ODT' } };
