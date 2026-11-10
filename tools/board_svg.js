// Renders the printable board as a standalone SVG string from game/js/mapdata.js.
'use strict';

const COLORS = {
  water: '#b9d5ea', backdrop: '#e4e0d4', LAX: '#f3cdc5', ONA: '#c8d8f1', FI: '#dedbd4', OUT: '#f1ead6', OUT2: '#e8dfc4', OUT3: '#ddd3b4',
  spawn: '#d6e7c9', border: '#6d6150', laxEdge: '#a3322a', onaEdge: '#2c62b4', wall: '#4a3b2a', zom: '#3d8b2f',
  ink: '#231f1a', kt: '#e8742a',
};

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Rough midpoint of an SVG "M..L.." path (first sub-path), for wall numbers. */
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
  // 10x10 icons centered at 0,0
  star: '<path d="M0,-5 L1.5,-1.6 L5,-1.5 L2.3,0.8 L3.1,4.6 L0,2.6 L-3.1,4.6 L-2.3,0.8 L-5,-1.5 L-1.5,-1.6Z" fill="#d9a400" stroke="#5a4500" stroke-width=".5"/>',
  plane: '<path d="M0,-5 L1,-1.5 L5,0.5 L5,1.6 L1,0.6 L0.7,3.5 L2,4.6 L2,5.2 L0,4.6 L-2,5.2 L-2,4.6 L-0.7,3.5 L-1,0.6 L-5,1.6 L-5,0.5 L-1,-1.5Z" fill="#333"/>',
  cross: '<rect x="-5" y="-5" width="10" height="10" rx="2" fill="#fff" stroke="#b3261e" stroke-width=".8"/><path d="M-1.4,-3.6h2.8v2.2h2.2v2.8h-2.2v2.2h-2.8v-2.2h-2.2v-2.8h2.2z" fill="#b3261e"/>',
  pump: '<rect x="-3.2" y="-4" width="5" height="8" rx=".8" fill="' + COLORS.kt + '" stroke="#fff" stroke-width=".5"/><rect x="-2.3" y="-3" width="3.2" height="2.2" fill="#fff"/><path d="M1.8,-2.5 L3.6,-1 L3.6,2.8" fill="none" stroke="' + COLORS.kt + '" stroke-width=".9"/>',
};

function boardSVG(map, opts = {}) {
  const [x0, y0, W, H] = map.viewBox;
  const T = Object.fromEntries(map.territories.map(t => [t.id, t]));
  const wallNo = {};
  map.walls.forEach((w, i) => { wallNo[w.id] = i + 1; });
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}" width="${opts.width || W}" height="${opts.height || H}" font-family="'Helvetica Neue', Arial, sans-serif">`);
  o.push(`<defs>
    <pattern id="spawnhatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="${COLORS.spawn}"/><line x1="0" y1="0" x2="0" y2="10" stroke="#b5d3a3" stroke-width="4"/></pattern>
    <pattern id="brick" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="8" height="4" fill="#7a5a3a"/><path d="M0,2h8M4,0v2M0,2v2M8,2v2" stroke="#3a2a1a" stroke-width=".6"/></pattern>
    <marker id="zarr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${COLORS.zom}"/></marker>
  </defs>`);
  o.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${COLORS.water}"/>`);
  for (const b of map.backdrop || []) o.push(`<path d="${b.path}" fill="${b.kind === 'mn' ? '#d9d6cc' : COLORS.backdrop}" stroke="#a89f8b" stroke-width=".5"/>`);
  if (opts.cartouche !== false && map.mnLabel) o.push(`<text x="${map.mnLabel[0]}" y="${map.mnLabel[1]}" font-size="16" font-weight="800" fill="#9c978a" letter-spacing="4" text-anchor="middle" transform="rotate(-80 ${map.mnLabel[0]} ${map.mnLabel[1]})">MINNESOTA</text>`);
  for (const t of map.territories) {
    const fill = t.spawn ? 'url(#spawnhatch)' : t.group === 'OUT' ? COLORS[['OUT', 'OUT', 'OUT2', 'OUT3'][t.ring || 1]] : COLORS[t.group];
    o.push(`<path d="${t.path}" fill="${fill}" stroke="${COLORS.border}" stroke-width="1" stroke-linejoin="round"/>`);
  }
  // city outlines
  for (const g of ['LAX', 'ONA']) {
    for (const t of map.territories.filter(x => x.group === g)) {
      o.push(`<path d="${t.path}" fill="none" stroke="${g === 'LAX' ? COLORS.laxEdge : COLORS.onaEdge}" stroke-width="1.6" stroke-opacity=".55"/>`);
    }
  }
  for (const w of map.water || []) o.push(`<path d="${w}" fill="${COLORS.water}"/>`);
  for (const r of map.rivers || []) o.push(`<path d="${r}" fill="none" stroke="${COLORS.water}" stroke-width="5" stroke-linecap="round"/>`);
  for (const r of map.roads || []) {
    const wdt = r.cls === 'motorway' ? 3.2 : 2.2;
    o.push(`<path d="${r.path}" fill="none" stroke="#7a6a50" stroke-width="${wdt + 1.2}" stroke-opacity=".35" stroke-linecap="round"/>`);
    o.push(`<path d="${r.path}" fill="none" stroke="${r.cls === 'motorway' ? '#f0a04b' : '#f6d266'}" stroke-width="${wdt}" stroke-linecap="round"/>`);
  }
  for (const b of map.bridges || []) o.push(`<path d="${b.path}" fill="none" stroke="#5c4b36" stroke-width="5" stroke-linecap="butt" stroke-opacity=".8"/><path d="${b.path}" fill="none" stroke="#e9dcc0" stroke-width="3"/>`);
  // zombie arrows
  for (const t of map.territories) {
    for (const n of t.zombieNext || []) {
      const a = t.label, b = T[n].label;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const s = Math.min(22, L * 0.3) / L, e = 1 - Math.min(26, L * 0.35) / L;
      o.push(`<path d="M${(a[0] + dx * s).toFixed(1)},${(a[1] + dy * s).toFixed(1)} L${(a[0] + dx * e).toFixed(1)},${(a[1] + dy * e).toFixed(1)}" stroke="${COLORS.zom}" stroke-width="2.2" stroke-dasharray="5 2.5" marker-end="url(#zarr)" fill="none" opacity=".85"/>`);
    }
  }
  // walls
  for (const w of map.walls) {
    o.push(`<path d="${w.path}" fill="none" stroke="#2a1d10" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
    o.push(`<path d="${w.path}" fill="none" stroke="url(#brick)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const w of map.walls) {
    if (w.gate && w.gateAt) {
      const [gx, gy] = w.gateAt;
      o.push(`<g transform="translate(${gx},${gy})"><rect x="-9" y="-6" width="18" height="12" rx="2" fill="#ffd54a" stroke="#2a1d10" stroke-width="1.2"/><path d="M-5,5 v-6 a5,5 0 0 1 10,0 v6" fill="#2a1d10"/></g>`);
    }
    const m = pathMid(w.path);
    if (!m) continue;
    const off = w.gate && w.gateAt && Math.hypot(m[0] - w.gateAt[0], m[1] - w.gateAt[1]) < 14 ? 14 : 0;
    o.push(`<g transform="translate(${(m[0] + off).toFixed(1)},${(m[1] + off).toFixed(1)})"><circle r="6" fill="#fff" stroke="#2a1d10" stroke-width="1"/><text y="2.4" font-size="6.5" font-weight="700" text-anchor="middle" fill="#2a1d10">W${w.no}</text></g>`);
  }
  // kwik trips
  for (const k of map.kwikTrips || []) o.push(`<g transform="translate(${k.x},${k.y}) scale(.9)">${ICONS.pump}</g>`);
  // labels
  for (const t of map.territories) {
    const [x, y] = t.label;
    const big = t.area > 9000;
    const fs = big ? 10 : 7.4;
    const name = esc(t.short || t.name);
    o.push(`<text x="${x}" y="${y - 4}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${COLORS.ink}" stroke="#fff" stroke-width="2.4" paint-order="stroke" stroke-opacity=".8">${name}</text>`);
    const bits = [];
    if (t.value) bits.push(`${t.value} SP`);
    if (t.kwikTrips) bits.push(`${t.kwikTrips} oil`);
    if (bits.length) o.push(`<text x="${x}" y="${y + 5}" font-size="${fs * 0.82}" text-anchor="middle" fill="${COLORS.ink}" stroke="#fff" stroke-width="2" paint-order="stroke" stroke-opacity=".8">${bits.join(' · ')}</text>`);
    let ix = x - 14;
    for (const sp of t.special || []) {
      const icon = { cityhall: ICONS.star, airport: ICONS.plane, gundersen: ICONS.cross }[sp];
      if (icon) { o.push(`<g transform="translate(${ix},${y + 15}) scale(1.2)">${icon}</g>`); ix += 14; }
    }
    if (t.spawn) {
      o.push(`<g transform="translate(${x},${y + 19})"><rect x="-8" y="-8" width="16" height="16" rx="3" fill="#fff" stroke="${COLORS.zom}" stroke-width="1.6"/><text y="4" font-size="11" font-weight="800" text-anchor="middle" fill="${COLORS.zom}">${t.spawn}</text></g>`);
    }
  }
  if (opts.cartouche !== false) o.push(cartouche(map, x0, y0, W, H));
  o.push(`<text x="${x0 + W - 6}" y="${y0 + H - 6}" font-size="7" text-anchor="end" fill="#33302a">${esc(map.attribution)} · Board distorted for play; not to scale.</text>`);
  o.push('</svg>');
  return o.join('\n');
}

function cartouche(map, x0, y0, W, H) {
  const x = x0 + 10, y = y0 + H - 228;
  return `<g transform="translate(${x},${y})">
  <rect width="250" height="214" rx="8" fill="#fffdf6" stroke="#4a3b2a" stroke-width="1.5"/>
  <text x="125" y="30" font-size="25" font-weight="800" text-anchor="middle"><tspan fill="${COLORS.laxEdge}">LaXis</tspan><tspan fill="#333"> &amp; </tspan><tspan fill="${COLORS.onaEdge}">OnAllies</tspan></text>
  <text x="125" y="45" font-size="8.5" text-anchor="middle" fill="#555">La Crosse vs. Onalaska vs. the Dead</text>
  <g font-size="8" fill="#222">
    <rect x="12" y="58" width="14" height="10" fill="${COLORS.LAX}" stroke="${COLORS.laxEdge}"/><text x="32" y="66">La Crosse (starts red)</text>
    <rect x="12" y="73" width="14" height="10" fill="${COLORS.ONA}" stroke="${COLORS.onaEdge}"/><text x="32" y="81">Onalaska (starts blue)</text>
    <rect x="12" y="88" width="14" height="10" fill="${COLORS.FI}" stroke="#777"/><text x="32" y="96">French Island (neutral, inside wall)</text>
    <rect x="12" y="103" width="14" height="10" fill="${COLORS.OUT}" stroke="#777"/><text x="32" y="111">Outside the wall: income, exposed</text>
    <rect x="12" y="118" width="14" height="10" fill="url(#spawnhatch)" stroke="#777"/><text x="32" y="126">Zombie spawn point (roll 1–6)</text>
    <path d="M12,139 h14" stroke="#2a1d10" stroke-width="7"/><path d="M12,139 h14" stroke="url(#brick)" stroke-width="5"/><text x="32" y="142">Wall (W#)</text>
    <path d="M12,154 h12" stroke="${COLORS.zom}" stroke-width="2.2" stroke-dasharray="5 2.5" marker-end="url(#zarr)"/><text x="32" y="157">Zombies march this way</text>
    <g transform="translate(150,139) scale(.8)"><rect x="-9" y="-6" width="18" height="12" rx="2" fill="#ffd54a" stroke="#2a1d10" stroke-width="1.2"/><path d="M-5,5 v-6 a5,5 0 0 1 10,0 v6" fill="#2a1d10"/></g><text x="162" y="142">Highway gate</text>
    <g transform="translate(19,170)">${ICONS.pump}</g><text x="32" y="173">Kwik Trip: +1 oil per turn</text>
    <g transform="translate(19,186)">${ICONS.star}</g><text x="32" y="189">City Hall: new units placed here</text>
    <g transform="translate(140,170)">${ICONS.plane}</g><text x="152" y="173">Airport</text>
    <g transform="translate(140,186)">${ICONS.cross}</g><text x="152" y="189">Gundersen helipad</text>
    <text x="12" y="205" font-size="7" fill="#555">SP = supply points (income). Hit on a roll ≤ value.</text>
  </g>
</g>`;
}

module.exports = { boardSVG, pathMid, COLORS, ICONS };
