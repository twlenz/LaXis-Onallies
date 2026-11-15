// Renders the printable board (caricature style) as a standalone SVG string from game/js/mapdata.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { DOODLES, WAVES, badgeRow, pathInfo, wallBar } = require('../game/js/art.js');

const COLORS = {
  water: '#9fd3ee', mn: '#d8d3c4', LAX: '#f6a99f', ONA: '#9ec3f2', FI: '#d7d7d2', OUT: '#f4e8bd', OUT2: '#ead99c', OUT3: '#cfe6a8',
  border: '#3b2f22', laxEdge: '#b3261e', onaEdge: '#1f4f9a', wall: '#4a3b2a', zom: '#3d8b2f', ink: '#2b2117', kt: '#e8742a',
};
const FONT_DIR = path.join(__dirname, '../game/fonts');
function fontFace() {
  const b64 = (f) => fs.readFileSync(path.join(FONT_DIR, f)).toString('base64');
  return `@font-face{font-family:"Patrick Hand";src:url(data:font/woff2;base64,${b64('patrick-hand-latin-400-normal.woff2')}) format("woff2")}
@font-face{font-family:"Bangers";src:url(data:font/woff2;base64,${b64('bangers-latin-400-normal.woff2')}) format("woff2")}`;
}
const HAND = `'Patrick Hand', 'Comic Sans MS', sans-serif`;

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Rough midpoint of an SVG "M..L.." path, for wall numbers. */
function pathMid(d) {
  const pts = [];
  const re = /([ML])\s*(-?[\d.]+),(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(d))) pts.push([+m[2], +m[3]]);
  if (!pts.length) return null;
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(L); total += L; }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    if (acc + seg[i - 1] >= total / 2) {
      const t = (total / 2 - acc) / (seg[i - 1] || 1);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    acc += seg[i - 1];
  }
  return pts[0];
}

const ICONS = {
  star: '<path d="M0,-6 L1.8,-1.9 L6,-1.8 L2.8,1 L3.7,5.5 L0,3.1 L-3.7,5.5 L-2.8,1 L-6,-1.8 L-1.8,-1.9Z" fill="#ffcc00" stroke="#3b2f22" stroke-width=".8"/>',
  plane: '<path d="M0,-5 L1,-1.5 L5,0.5 L5,1.6 L1,0.6 L0.7,3.5 L2,4.6 L2,5.2 L0,4.6 L-2,5.2 L-2,4.6 L-0.7,3.5 L-1,0.6 L-5,1.6 L-5,0.5 L-1,-1.5Z" fill="#333"/>',
  cross: '<rect x="-5" y="-5" width="10" height="10" rx="2" fill="#fff" stroke="#b3261e" stroke-width=".8"/><path d="M-1.4,-3.6h2.8v2.2h2.2v2.8h-2.2v2.2h-2.8v-2.2h-2.2v-2.8h2.2z" fill="#b3261e"/>',
  pump: '<rect x="-3.2" y="-4" width="5" height="8" rx=".8" fill="' + COLORS.kt + '" stroke="#3b2f22" stroke-width=".6"/><rect x="-2.3" y="-3" width="3.2" height="2.2" fill="#fff"/><path d="M1.8,-2.5 L3.6,-1 L3.6,2.8" fill="none" stroke="#3b2f22" stroke-width=".9"/>',
  gate: '<rect x="-9" y="-6" width="18" height="12" rx="2" fill="#ffd54a" stroke="#2a1d10" stroke-width="1.2"/><path d="M-5,5 v-6 a5,5 0 0 1 10,0 v6" fill="#2a1d10"/>',
};

function terrFill(t) {
  if (t.spawn) return 'url(#spawnhatch)';
  if (t.group === 'OUT') return [COLORS.OUT, COLORS.OUT, COLORS.OUT2, COLORS.OUT3][t.ring || 1];
  return COLORS[t.group];
}

function boardSVG(map, opts = {}) {
  const [x0, y0, W, H] = map.viewBox;
  const T = Object.fromEntries(map.territories.map(t => [t.id, t]));
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}" width="${opts.width || W}" height="${opts.height || H}" font-family="${HAND}">`);
  o.push(`<defs><style>${fontFace()}</style>${WAVES}
    <pattern id="spawnhatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="${COLORS.OUT3}"/><line x1="0" y1="0" x2="0" y2="10" stroke="#a9cf86" stroke-width="4"/></pattern>
    <pattern id="brick" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="8" height="4" fill="#8a6440"/><path d="M0,2h8M4,0v2M0,2v2M8,2v2" stroke="#3a2a1a" stroke-width=".6"/></pattern>
    <marker id="zarr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${COLORS.zom}"/></marker>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="1.5" dy="2" stdDeviation="0" flood-color="#3b2f22" flood-opacity=".35"/></filter>
  </defs>`);
  o.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="url(#waves)"/>`);
  for (const b of map.backdrop || []) o.push(`<path d="${b.path}" fill="${b.kind === 'mn' ? COLORS.mn : COLORS.OUT}" stroke="${COLORS.border}" stroke-width="1.2" stroke-linejoin="round"/>`);
  if (map.mnLabel) o.push(`<text x="${map.mnLabel[0]}" y="${map.mnLabel[1]}" font-size="20" fill="#9c978a" letter-spacing="5" text-anchor="middle" font-family="Bangers, ${HAND}" transform="rotate(-80 ${map.mnLabel[0]} ${map.mnLabel[1]})">MINNESOTA</text>`);
  // land with a cartoon drop shadow
  o.push('<g filter="url(#shadow)">');
  for (const t of map.territories) o.push(`<path d="${t.path}" fill="${terrFill(t)}"/>`);
  o.push('</g>');
  for (const r of map.rivers || []) o.push(`<path d="${r}" fill="none" stroke="${COLORS.water}" stroke-width="6" stroke-linecap="round"/>`);
  // roads: faint, under the borders
  for (const r of map.roads || []) {
    const wdt = r.cls === 'motorway' ? 2.2 : r.cls === 'secondary' ? 1 : 1.5;
    o.push(`<path d="${r.path}" fill="none" stroke="#8a6a3a" stroke-opacity=".35" stroke-width="${wdt}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const b of map.bridges || []) o.push(`<path d="${b.path}" fill="none" stroke="#3b2f22" stroke-width="5" stroke-linecap="round" stroke-opacity=".6"/><path d="${b.path}" fill="none" stroke="#e9dcc0" stroke-width="3" stroke-linecap="round"/>`);
  for (const t of map.territories) o.push(`<path d="${t.path}" fill="none" stroke="${COLORS.border}" stroke-width="1.6" stroke-linejoin="round"/>`);
  for (const g of ['LAX', 'ONA']) {
    for (const t of map.territories.filter(x => x.group === g)) {
      o.push(`<path d="${t.path}" fill="none" stroke="${g === 'LAX' ? COLORS.laxEdge : COLORS.onaEdge}" stroke-width="1" stroke-opacity=".5" stroke-linejoin="round"/>`);
    }
  }
  // zombie arrows
  for (const t of map.territories) {
    for (const n of t.zombieNext || []) {
      const a = t.label, b = T[n].label;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const s = Math.min(22, L * 0.3) / L, e = 1 - Math.min(26, L * 0.35) / L;
      o.push(`<path d="M${(a[0] + dx * s).toFixed(1)},${(a[1] + dy * s).toFixed(1)} L${(a[0] + dx * e).toFixed(1)},${(a[1] + dy * e).toFixed(1)}" stroke="${COLORS.zom}" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#zarr)" fill="none" opacity=".25"/>`);
    }
  }
  // walls: a narrow slot along the border with a Catan-road-style wooden piece (gates are golden)
  for (const w of map.walls) {
    o.push(`<path d="${w.path}" fill="none" stroke="#3a2412" stroke-width="9" stroke-opacity=".75" stroke-linecap="round" stroke-linejoin="round"/>`);
    o.push(`<path d="${w.path}" fill="none" stroke="#e9dcc0" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const w of map.walls) {
    const info = pathInfo(w.path);
    if (!info) continue;
    const [px, py] = w.gate && w.gateAt ? w.gateAt : [info.x, info.y];
    o.push(`<g transform="translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${info.angle.toFixed(1)}) scale(1.25)">${wallBar(info.length * 0.8 / 1.25, w.gate)}</g>`);
    const m = pathMid(w.path);
    const off = Math.hypot(m[0] - px, m[1] - py) < 16 ? 1 : 0;
    const nx = -Math.sin(info.angle * Math.PI / 180) * 12 * off, ny = Math.cos(info.angle * Math.PI / 180) * 12 * off;
    o.push(`<g transform="translate(${(m[0] + nx).toFixed(1)},${(m[1] + ny).toFixed(1)})"><circle r="5.5" fill="#fff" stroke="#2a1d10" stroke-width="1"/><text y="2.5" font-size="7" text-anchor="middle" fill="#2a1d10">W${w.no}</text></g>`);
  }
  for (const d of map.doodles || []) if (DOODLES[d.kind]) o.push(`<g transform="translate(${d.x},${d.y}) scale(1.3)">${DOODLES[d.kind]}</g>`);
  // labels
  for (const t of map.territories) {
    const [x, y] = t.label;
    const fs1 = t.area > 9000 ? 13 : t.area > 3000 ? 10.5 : 8.8;
    o.push(`<text x="${x}" y="${y - 4}" font-size="${fs1}" text-anchor="middle" fill="${COLORS.ink}" stroke="#fffaf0" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${esc(t.short || t.name)}</text>`);
    if (t.value || t.oil) o.push(`<g transform="translate(${x},${y + 9}) scale(1.3)">${badgeRow(t.value, t.oil ? 1 : 0, 7.5).svg}</g>`);
    let ix = x - 10;
    for (const sp of t.special || []) {
      const icon = { cityhall: ICONS.star, airport: ICONS.plane, gundersen: ICONS.cross }[sp];
      if (icon) { o.push(`<g transform="translate(${ix},${y + 25}) scale(1.4)">${icon}</g>`); ix += 18; }
    }

  }
  if (opts.cartouche !== false) o.push(cartouche(x0, y0, W, H));
  o.push(`<text x="${x0 + W - 6}" y="${y0 + H - 6}" font-size="8" text-anchor="end" fill="#33302a">Not to scale. Roads: US Census TIGER/Line. Kwik Trips: Kwik Trip store list.</text>`);
  o.push('</svg>');
  return o.join('\n');
}

function cartouche(x0, y0, W, H) {
  const x = x0 + 10, y = y0 + H - 236;
  return `<g transform="translate(${x},${y})" filter="url(#shadow)">
  <rect width="250" height="222" rx="10" fill="#fffaf0" stroke="#3b2f22" stroke-width="2"/>
  <text x="125" y="36" font-size="32" text-anchor="middle" font-family="Bangers, ${HAND}" letter-spacing="1"><tspan fill="${COLORS.laxEdge}">LaXis</tspan><tspan fill="#3b2f22"> &amp; </tspan><tspan fill="${COLORS.onaEdge}">OnAllies</tspan></text>
  <text x="125" y="51" font-size="10" text-anchor="middle" fill="#555">La Crosse vs. Onalaska vs. the Dead</text>
  <g font-size="9.5" fill="#222">
    <rect x="12" y="62" width="14" height="10" fill="${COLORS.LAX}" stroke="${COLORS.border}"/><text x="32" y="71">La Crosse</text>
    <rect x="120" y="62" width="14" height="10" fill="${COLORS.ONA}" stroke="${COLORS.border}"/><text x="140" y="71">Onalaska</text>
    <rect x="12" y="78" width="14" height="10" fill="${COLORS.FI}" stroke="${COLORS.border}"/><text x="32" y="87">French Island (neutral)</text>
    <rect x="12" y="94" width="14" height="10" fill="${COLORS.OUT}" stroke="${COLORS.border}"/><rect x="28" y="94" width="14" height="10" fill="${COLORS.OUT2}" stroke="${COLORS.border}"/><rect x="44" y="94" width="14" height="10" fill="url(#spawnhatch)" stroke="${COLORS.border}"/><text x="64" y="103">Rings 1 · 2 · 3 (3 = zombie outskirts)</text>
    <g transform="translate(20,116)">${wallBar(16, false)}</g><text x="34" y="120">Wall piece (W#)</text>
    <g transform="translate(142,116)">${wallBar(16, true)}</g><text x="156" y="120">Highway gate</text>
    <path d="M12,134 h14" stroke="${COLORS.zom}" stroke-width="2.4" stroke-dasharray="4 3" marker-end="url(#zarr)" opacity=".5"/><text x="34" y="137">Zombies march this way</text>
    <g transform="translate(19,152)">${require('../game/js/art.js').BARREL}</g><text x="34" y="155">Oil: 1 per turn (big Kwik Trip)</text>
    <g transform="translate(19,170)">${ICONS.star}</g><text x="34" y="173">City Hall (new units)</text>
    <g transform="translate(140,152)">${ICONS.plane}</g><text x="152" y="155">Airport</text>
    <g transform="translate(140,170)">${ICONS.cross}</g><text x="152" y="173">Gundersen helipad</text>
    <g transform="translate(20,189)">${require('../game/js/art.js').valueBadge(3, 6)}</g><text x="34" y="192" font-size="8.5" fill="#555">Income (supply points). Hit on a roll ≤ value.</text>
    <text x="12" y="206" font-size="8.5" fill="#555">Land units cross the wall only at gates or breaches.</text>
  </g>
</g>`;
}

module.exports = { boardSVG, pathMid, COLORS, ICONS, fontFace, HAND };
