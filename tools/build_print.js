#!/usr/bin/env node
// Builds every printable asset into print/ from the generated map data.
//   print/board.svg                 full board, vector
//   print/board-poster-24x30.pdf    one sheet for a print shop
//   print/board-tiled-letter.pdf    tiles for home printers (trim & tape)
//   print/counters.pdf              units, control markers, wall pieces
//   print/player-aid.pdf            turn sequence, unit chart, setup, spawn table
//   print/trackers.pdf              supply/oil/round tracks
//   print/rulebook.pdf + docs/rules.html
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { marked } = require('marked');
const { boardSVG, COLORS, ICONS } = require('./board_svg.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'print');
const MAP = require(path.join(ROOT, 'game/js/mapdata.js'));
const { UNITS } = require(path.join(ROOT, 'game/js/engine.js'));
fs.mkdirSync(OUT, { recursive: true });

const [, , VW, VH] = MAP.viewBox;
const POSTER_W = 24; // inches
const POSTER_H = +(POSTER_W * VH / VW).toFixed(2);

// ------------------------------------------------------------------ icons
const { UNIT_ICON } = require(path.join(ROOT, 'game/js/art.js'));
function icon(type, color, size) {
  return `<svg viewBox="-11 -11 22 22" width="${size}" height="${size}" style="color:${color}"><g fill="${color}">${UNIT_ICON[type]}</g></svg>`;
}

// ------------------------------------------------------------------ html
const BASE_CSS = `
  @page { size: Letter; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f1d1a; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 10pt 0 4pt; border-bottom: 1.5pt solid #4a3b2a; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; } td, th { border: .5pt solid #999; padding: 2pt 4pt; text-align: left; }
  th { background: #efe7d2; }
  .lax { color: ${COLORS.laxEdge}; } .ona { color: ${COLORS.onaEdge}; } .zom { color: ${COLORS.zom}; }
  .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
`;

async function pdf(browser, html, file, opts = {}) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf(Object.assign({ path: path.join(OUT, file), printBackground: true, preferCSSPageSize: true }, opts));
  await page.close();
  console.log('wrote print/' + file);
}

function boardPoster(svg) {
  return `<!doctype html><html><head><style>@page { size: ${POSTER_W}in ${POSTER_H}in; margin: 0 } body{margin:0} svg{display:block;width:${POSTER_W}in;height:${POSTER_H}in}</style></head><body>${svg}</body></html>`;
}

function boardTiles(svg) {
  // Letter portrait, 0.25in margins => 8 x 10.5 printable; tiles overlap 0.3in
  const pw = 8, ph = 10.5, ov = 0.3;
  const cols = Math.ceil((POSTER_W - ov) / (pw - ov));
  const rows = Math.ceil((POSTER_H - ov) / (ph - ov));
  const pages = [];
  const letters = 'ABCDEFGH';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (pw - ov), y = r * (ph - ov);
      pages.push(`<div class="tile"><div class="inner" style="left:${-x}in;top:${-y}in">${svg}</div>
        <div class="tag">${letters[r]}${c + 1} — row ${letters[r]}, column ${c + 1} of ${rows}×${cols}. Overlap ${ov}" with neighbors; trim along the dashed edge.</div>
        ${c < cols - 1 ? `<div class="cut v" style="left:${pw - ov}in"></div>` : ''}
        ${r < rows - 1 ? `<div class="cut h" style="top:${ph - ov}in"></div>` : ''}</div>`);
    }
  }
  return `<!doctype html><html><head><style>
    @page { size: Letter; margin: 0.25in; } body { margin: 0; }
    .tile { width: ${pw}in; height: ${ph}in; position: relative; overflow: hidden; page-break-after: always; }
    .inner { position: absolute; width: ${POSTER_W}in; height: ${POSTER_H}in; } .inner svg { width: ${POSTER_W}in; height: ${POSTER_H}in; display:block }
    .tag { position: absolute; left: 4pt; bottom: 4pt; font: 7pt Arial; background: rgba(255,255,255,.85); padding: 1pt 3pt; border-radius: 2pt; }
    .cut { position: absolute; border: 0 dashed #000; } .cut.v { top: 0; bottom: 0; border-left-width: .6pt; } .cut.h { left: 0; right: 0; border-top-width: .6pt; }
  </style></head><body>${pages.join('')}</body></html>`;
}

function counters() {
  const sideColor = { LAX: COLORS.laxEdge, ONA: COLORS.onaEdge, Z: COLORS.zom };
  const items = [];
  const add = (n, html, cls) => { for (let i = 0; i < n; i++) items.push(`<div class="ctr ${cls || ''}">${html}</div>`); };
  const unit = (side, type, label) => `<div class="u" style="background:${sideColor[side]}">${icon(type, '#fff', 34)}<span>${label}</span></div>`;
  const stat = (t) => `A${UNITS[t].att} D${UNITS[t].def} M${UNITS[t].move}`;
  add(30, unit('LAX', 'inf', 'LAX ' + stat('inf')));
  add(10, unit('LAX', 'tank', 'LAX ' + stat('tank')));
  add(1, unit('LAX', 'heli', 'GUNDERSEN ' + stat('heli')));
  add(8, `<div class="u x5" style="background:${sideColor.LAX}"><b>×3</b><span>stack</span></div>`);
  add(8, `<div class="u x5" style="background:${sideColor.LAX}"><b>×5</b><span>stack</span></div>`);
  add(30, unit('ONA', 'inf', 'ONA ' + stat('inf')));
  add(10, unit('ONA', 'tank', 'ONA ' + stat('tank')));
  add(1, unit('ONA', 'plane', 'PLANE ' + stat('plane')));
  add(8, `<div class="u x5" style="background:${sideColor.ONA}"><b>×3</b><span>stack</span></div>`);
  add(8, `<div class="u x5" style="background:${sideColor.ONA}"><b>×5</b><span>stack</span></div>`);
  add(60, unit('Z', 'zombie', 'ZOMBIE A3 D2'));
  add(10, `<div class="u x5" style="background:${sideColor.Z}"><b>×5</b><span>zombies</span></div>`);
  const ctrl = (side, txt) => `<div class="cm" style="border-color:${sideColor[side]};color:${sideColor[side]}">${txt}</div>`;
  add(40, ctrl('LAX', 'LAX'), 'round');
  add(40, ctrl('ONA', 'ONA'), 'round');
  add(2, `<div class="cm" style="border-color:#d98e04;color:#8a5a00">ROUND</div>`, 'round');
  add(2, `<div class="cm" style="border-color:#d98e04;color:#8a5a00;font-size:6pt">HOLDING<br>CITIES</div>`, 'round');
  const walls = MAP.walls.map((w) => `<div class="wall${w.gate ? ' gate' : ''}"><b>W${w.no}</b><span>${short(w.inside)} | ${short(w.outside)}${w.gate ? ' · GATE' : ''}</span></div>`);
  for (let i = 0; i < 4; i++) walls.push('<div class="wall"><b>W</b><span>spare</span></div>');
  return `<!doctype html><html><head><style>${BASE_CSS}
    .grid { display: grid; grid-template-columns: repeat(10, 0.75in); grid-auto-rows: 0.75in; gap: 0; }
    .ctr { width: .75in; height: .75in; border: .4pt dashed #999; display: flex; align-items: center; justify-content: center; }
    .u { width: .68in; height: .68in; border-radius: 5pt; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .u span { font-size: 5pt; font-weight: 700; letter-spacing: .2pt; margin-top: 1pt; white-space: nowrap; }
    .u.x5 b { font-size: 18pt; } .cm { width: .62in; height: .62in; border-radius: 50%; border: 4pt solid; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 10pt; text-align: center; }
    .walls { display: grid; grid-template-columns: repeat(5, 1.5in); grid-auto-rows: .5in; gap: 0; margin-top: 8pt; }
    .wall { border: .4pt dashed #999; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #fff; }
    .wall b { display: block; width: 1.3in; height: .26in; border-radius: 3pt; border: .8pt solid #3a2412; background: linear-gradient(#a8743d, #8b5a2b 60%, #6e4320); color: #fff; text-align: center; line-height: .26in; box-shadow: 1pt 1.5pt 0 rgba(0,0,0,.3); }
    .wall.gate b { background: linear-gradient(#ecc169, #d9a441 60%, #b9852a); color: #3a2412; }
    .wall b { font-size: 11pt; } .wall span { font-size: 5.5pt; color: #3a2412; margin-top: 2pt; }
    .note { font-size: 8pt; margin: 0 0 6pt; }
  </style></head><body>
    <h1>Counters</h1><p class="note">Print on card stock (or glue to chipboard) and cut on the dashed lines. You can swap in real miniatures; stack chips (×3, ×5) go under one figure to mark a bigger stack.</p>
    <div class="grid">${items.join('')}</div>
    <h2>Wall pieces</h2><p class="note">Place each on its numbered wall segment. Remove a piece when zombies tear that segment down; it is never rebuilt.</p>
    <div class="walls">${walls.join('')}</div>
  </body></html>`;
}
function short(id) { const t = MAP.territories.find(x => x.id === id); return t.short || t.name; }

function playerAid() {
  const rows = ['inf', 'tank', 'heli', 'plane', 'zombie'].map(t => {
    const u = UNITS[t];
    const who = t === 'heli' ? 'La Crosse' : t === 'plane' ? 'Onalaska' : t === 'zombie' ? 'Horde' : 'Both';
    const notes = { inf: '', tank: '1 oil to move each turn; blitz', heli: 'Carries 1 infantry; Airport or Gundersen', plane: 'Lands at the Airport', zombie: 'Cannot cross intact walls; never retreats' }[t];
    return `<tr><td>${icon(t, '#333', 16)} ${u.name}</td><td>${who}</td><td>${u.cost || '—'}</td><td>${u.att}</td><td>${u.def}</td><td>${u.move}</td><td>${notes}</td></tr>`;
  }).join('');
  const setup = (g) => MAP.territories.filter(t => t.group === g).map(t => {
    const su = t.startUnits || {};
    const units = Object.keys(su).map(k => `${su[k]} ${UNITS[k].name}`).join(', ') || '—';
    return `<tr><td>${t.name}</td><td>${t.value}</td><td>${t.kwikTrips || ''}</td><td>${units}</td></tr>`;
  }).join('');
  const spawns = MAP.territories.filter(t => t.spawn).sort((a, b) => a.spawn - b.spawn).map(t => `<tr><td><b>${t.spawn}</b></td><td>${t.name}</td></tr>`).join('');
  const outside = MAP.territories.filter(t => t.group === 'OUT' && !t.spawn).map(t => `${t.name} (${t.value}${t.kwikTrips ? ', ' + t.kwikTrips + ' oil' : ''})`).join(' · ');
  const income = (g) => MAP.territories.filter(t => t.group === g).reduce((s, t) => s + t.value, 0);
  const oil = (g) => MAP.territories.filter(t => t.group === g).reduce((s, t) => s + t.kwikTrips, 0);
  return `<!doctype html><html><head><style>${BASE_CSS} ol{margin:2pt 0 4pt 16pt;padding:0;font-size:9.5pt} li{margin:1pt 0} p{font-size:9.5pt;margin:3pt 0} .two{display:grid;grid-template-columns:1fr 1fr;gap:14pt}</style></head><body>
  <div class="page">
    <h1><span class="lax">LaXis</span> &amp; <span class="ona">OnAllies</span> — Player Aid</h1>
    <h2>Round</h2><p><b class="lax">La Crosse turn</b> → <b class="ona">Onalaska turn</b> → <b class="zom">Zombie turn</b></p>
    <div class="two"><div>
    <h2>Your turn</h2><ol>
      <li><b>Purchase</b> units (SP). Aircraft only while you control the Airport; max 1.</li>
      <li><b>Combat move</b> into enemies, zombies or empty land to capture.</li>
      <li><b>Combat</b>: wall fire first, then battles.</li>
      <li><b>Noncombat move</b> (units that didn't move or fight). Aircraft must land.</li>
      <li><b>Mobilize</b> at your City Hall (★).</li>
      <li><b>Collect</b> SP + 1 oil per Kwik Trip in territories you control.</li>
    </ol></div><div>
    <h2>Zombie turn</h2><ol>
      <li><b>March</b> 1 territory inward along the arrow. If the arrow crosses an intact wall, <b>tear it down</b> instead.</li>
      <li><b>Spawn</b>: roll ⌈round ÷ 2⌉ dice. Each <b>6</b> → 1 zombie at spawn point (roll 1–6).</li>
      <li><b>Feast</b>: zombies attack every territory they share with you, fighting to the end.</li>
    </ol></div></div>
    <h2>Units (hit on a roll ≤ value)</h2>
    <table><tr><th>Unit</th><th>Side</th><th>Cost</th><th>Att</th><th>Def</th><th>Move</th><th>Notes</th></tr>${rows}</table>
    <h2>The wall</h2>
    <p>Zombies arrive next to a wall → next zombie turn they tear it down → the turn after they walk in. <b>Walls are never rebuilt.</b>
    Your land units cross the wall <b>only at highway gates</b> (${MAP.walls.filter(w => w.gate).map(w => 'W' + w.no).join(', ')}) or through breaches; aircraft fly over.</p>
    <p><b>Rings:</b> automatic zombies march one territory per turn along the arrows: ring 3 → ring 2 → ring 1 → wall → toward downtown.</p>
    <p><b>Wall fire:</b> land units in an inside territory that <b>did not move this turn</b> fire one volley across an intact wall at zombies in the adjacent outside territory, using their <b>Defense</b> value. Zombies cannot hit back. One target per territory per turn.</p>
    <h2>Who rises</h2>
    <p>Land units you lose <b>when zombies beat you</b>, or <b>when you attack zombies and lose or retreat</b>, become zombies in that territory. Losses in battles you win stay dead. Aircraft never rise. Player-vs-player losses never rise.</p>
    <h2>Winning and losing</h2>
    <p><b>Win:</b> own every inside territory (both cities and French Island), zero zombies inside the wall, at the end of your turn <i>and</i> at the start of your next.</p>
    <p><b>Lose:</b> end your turn without control of your City Hall, or with no land units. Your units become zombies and <b>you command the horde</b>: move zombies 1 space anywhere (not through intact walls), or tear down an adjacent wall instead of moving.</p>
  </div>
  <div class="page">
    <h1>Setup</h1>
    <p>Each player starts with SP equal to income and 2 oil. French Island and all outside territories start unowned and empty. Place all wall pieces. La Crosse moves first.</p>
    <div class="two"><div><h2 class="lax">La Crosse — income ${income('LAX')} SP, ${oil('LAX')} oil</h2>
      <table><tr><th>Territory</th><th>SP</th><th>Oil</th><th>Start</th></tr>${setup('LAX')}</table></div>
    <div><h2 class="ona">Onalaska — income ${income('ONA')} SP, ${oil('ONA')} oil</h2>
      <table><tr><th>Territory</th><th>SP</th><th>Oil</th><th>Start</th></tr>${setup('ONA')}</table>
      <h2>French Island (neutral)</h2><table><tr><th>Territory</th><th>SP</th><th>Oil</th><th>Start</th></tr>${setup('FI')}</table>
      <h2 class="zom">Spawn points</h2><table><tr><th>d6</th><th>Spawn territory</th></tr>${spawns}</table>
    </div></div>
    <h2>Outside the wall (unowned at start)</h2><p>${outside}</p>
  </div></body></html>`;
}

function trackers() {
  const track = (n, label, color) => {
    let cells = '';
    for (let i = 0; i <= n; i++) cells += `<div class="c" style="border-color:${color}">${i}</div>`;
    return `<h2 style="border-color:${color}">${label}</h2><div class="track">${cells}</div>`;
  };
  return `<!doctype html><html><head><style>${BASE_CSS}
    .track { display: grid; grid-template-columns: repeat(13, .55in); grid-auto-rows: .5in; }
    .c { border: 1pt solid; margin: 1pt; display: flex; align-items: flex-start; justify-content: flex-start; padding: 2pt; font-size: 7pt; font-weight: 700; }
  </style></head><body>
    <h1>Trackers</h1>
    ${track(64, 'La Crosse supply (SP)', COLORS.laxEdge)}
    ${track(25, 'La Crosse oil', COLORS.laxEdge)}
    ${track(64, 'Onalaska supply (SP)', COLORS.onaEdge)}
    ${track(25, 'Onalaska oil', COLORS.onaEdge)}
    <div style="page-break-before:always"></div>
    <h1>Round &amp; spawn dice</h1>
    <table><tr><th>Round</th>${Array.from({ length: 20 }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr>
    <tr><td>Spawn dice</td>${Array.from({ length: 20 }, (_, i) => `<td>${Math.ceil((i + 1) / 2)}</td>`).join('')}</tr></table>
    <p style="font-size:9pt">Rounds past 20: dice = round ÷ 2, rounded up.</p>
  </body></html>`;
}

function rulebookHtml(forPrint) {
  const md = fs.readFileSync(path.join(ROOT, 'docs/RULES.md'), 'utf8');
  const body = marked.parse(md);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LaXis &amp; OnAllies Rules</title><style>
    :root { --bg:#fffdf8; --ink:#1f1d1a; --line:#d8d0c2; --head:#efe7d2; --code:#f3efe6; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#1c1b19; --ink:#ece7de; --line:#3d3a34; --head:#2f2c27; --code:#262420; } }
    :root[data-theme="dark"] { --bg:#1c1b19; --ink:#ece7de; --line:#3d3a34; --head:#2f2c27; --code:#262420; }
    ${forPrint ? '@page { size: Letter; margin: .6in; }' : ''}
    body { background: var(--bg); color: var(--ink); font: ${forPrint ? '10pt' : '16px'}/1.5 Georgia, "Times New Roman", serif; max-width: 46em; margin: 0 auto; padding: ${forPrint ? '0' : '24px 16px'}; }
    h1 { font-family: "Helvetica Neue", Arial, sans-serif; } h2, h3 { font-family: "Helvetica Neue", Arial, sans-serif; border-bottom: 1px solid var(--line); padding-bottom: 2px; ${forPrint ? 'page-break-after: avoid;' : ''} }
    table { border-collapse: collapse; width: 100%; font-size: .92em; display: block; overflow-x: auto; } td, th { border: 1px solid var(--line); padding: 3px 6px; } th { background: var(--head); }
    pre { background: var(--code); padding: 10px; overflow-x: auto; font-size: .85em; line-height: 1.35; } code { font-size: .92em; }
    a { color: #2c62b4; }
  </style></head><body>${forPrint ? '' : '<p><a href="../game/index.html">▶ Play the digital version</a></p>'}${body}</body></html>`;
}

(async () => {
  const svg = boardSVG(MAP, { width: `${POSTER_W}in`, height: `${POSTER_H}in` });
  fs.writeFileSync(path.join(OUT, 'board.svg'), boardSVG(MAP));
  console.log('wrote print/board.svg');
  fs.writeFileSync(path.join(ROOT, 'docs/rules.html'), rulebookHtml(false));
  console.log('wrote docs/rules.html');
  const browser = await chromium.launch();
  await pdf(browser, boardPoster(svg), `board-poster-${POSTER_W}x${Math.round(POSTER_H)}.pdf`, { width: `${POSTER_W}in`, height: `${POSTER_H}in` });
  await pdf(browser, boardTiles(svg), 'board-tiled-letter.pdf');
  await pdf(browser, counters(), 'counters.pdf');
  await pdf(browser, playerAid(), 'player-aid.pdf');
  await pdf(browser, trackers(), 'trackers.pdf');
  await pdf(browser, rulebookHtml(true), 'rulebook.pdf');
  // preview image of the board for the README
  const page = await browser.newPage({ viewport: { width: 1000, height: Math.round(1000 * VH / VW) }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${boardSVG(MAP, { width: 1000, height: Math.round(1000 * VH / VW) })}</body></html>`);
  await page.screenshot({ path: path.join(OUT, 'board-preview.png') });
  await page.close();
  console.log('wrote print/board-preview.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
