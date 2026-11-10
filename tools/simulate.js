#!/usr/bin/env node
// AI-vs-AI balance simulation on the real board.
//   node tools/simulate.js [games=200] [--outbreak] [--fort=att|def] [--max=40]
'use strict';
const path = require('path');
const { Game } = require(path.join(__dirname, '../game/js/engine.js'));
const AI = require(path.join(__dirname, '../game/js/ai.js'));
const MAP = require(path.join(__dirname, '../game/js/mapdata.js'));

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a)) || 200);
const outbreak = args.includes('--outbreak');
const fort = (args.find(a => a.startsWith('--fort=')) || '--fort=def').split('=')[1];
const maxRound = Number((args.find(a => a.startsWith('--max=')) || '--max=40').split('=')[1]);

const wins = {};
let rounds = 0, zPeak = 0, breaches = 0, firstDefeat = {}, zombieCtl = 0;
const perRound = [];
for (let seed = 1; seed <= N; seed++) {
  const g = Game.newGame(MAP, { seed, rules: { startingOutbreak: outbreak, fortifiedStat: fort } });
  let steps = 0, peak = 0, lastRound = 0;
  while (!g.s.winner && g.s.round <= maxRound && steps++ < 200000) {
    AI.step(g);
    if (g.s.round !== lastRound) {
      lastRound = g.s.round;
      const z = Object.values(g.s.units).filter(u => u.owner === 'Z').length;
      peak = Math.max(peak, z);
      perRound[g.s.round] = perRound[g.s.round] || [];
      perRound[g.s.round].push(z);
    }
  }
  const w = g.s.winner || 'timeout';
  wins[w] = (wins[w] || 0) + 1;
  rounds += Math.min(g.s.round, maxRound);
  zPeak += peak;
  breaches += Object.values(g.s.walls).filter(v => !v).length;
  if (g.s.zombieController) { zombieCtl++; firstDefeat[g.s.zombieController] = (firstDefeat[g.s.zombieController] || 0) + 1; }
}
const pct = (k) => ((wins[k] || 0) / N * 100).toFixed(1) + '%';
console.log(`games=${N} outbreak=${outbreak} fortified=${fort} maxRound=${maxRound}`);
console.log(`La Crosse ${pct('LAX')} · Onalaska ${pct('ONA')} · Zombies ${pct('Z')} · timeout ${pct('timeout')}`);
console.log(`avg rounds ${(rounds / N).toFixed(1)} · avg peak zombies ${(zPeak / N).toFixed(1)} · avg walls breached ${(breaches / N).toFixed(1)}/${MAP.walls.length}`);
console.log(`a player fell in ${zombieCtl} games`, firstDefeat);
const avg = (a) => a && a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : '-';
console.log('avg zombies on board at start of round:', [5, 10, 15, 20, 25, 30].map(r => `r${r}:${avg(perRound[r])}`).join(' '));
