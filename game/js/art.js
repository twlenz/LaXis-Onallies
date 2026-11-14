/* Caricature doodles shared by the digital board and the print board. Each is drawn around (0,0). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LaxisArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const can = (x) => `<g transform="translate(${x},0)"><rect x="-3.2" y="-9" width="6.4" height="13" rx="1.2" fill="#c8102e" stroke="#3b2f22" stroke-width=".8"/><rect x="-3.2" y="-5" width="6.4" height="3" fill="#fff"/><ellipse cx="0" cy="-9" rx="3.2" ry="1" fill="#ccc" stroke="#3b2f22" stroke-width=".5"/></g>`;
  const DOODLES = {
    sixpack: `<g>${[-7.5, 0, 7.5].map(can).join('')}<g transform="translate(0,6)">${[-7.5, 0, 7.5].map(can).join('')}</g>
      <text y="22" font-size="6" text-anchor="middle" fill="#3b2f22" font-family="Patrick Hand, sans-serif">World's Largest Six-Pack</text></g>`,
    bluff: `<g><path d="M-22,8 Q-14,-10 -4,-12 Q6,-14 12,-4 Q18,4 24,8 Z" fill="#7aa35a" stroke="#3b2f22" stroke-width="1"/>
      <path d="M-4,-12 v-12" stroke="#3b2f22" stroke-width="1.2"/><path d="M-4,-24 l9,3 -9,3z" fill="#ffd54a" stroke="#3b2f22" stroke-width=".6"/>
      </g>`,
    riverboat: `<g><path d="M-16,2 h32 l-4,6 h-24z" fill="#fff" stroke="#3b2f22" stroke-width="1"/><rect x="-10" y="-6" width="18" height="8" fill="#fff" stroke="#3b2f22" stroke-width="1"/>
      <rect x="-6" y="-12" width="10" height="6" fill="#fff" stroke="#3b2f22" stroke-width="1"/><rect x="-4" y="-19" width="2.4" height="7" fill="#3b2f22"/><rect x="0" y="-19" width="2.4" height="7" fill="#3b2f22"/>
      <circle cx="13" cy="0" r="5" fill="#c8102e" stroke="#3b2f22" stroke-width="1"/></g>`,
    biplane: `<g><path d="M-12,0 h22 l4,-2 v4 l-4,-2" fill="#2c62b4" stroke="#3b2f22" stroke-width=".8"/><rect x="-4" y="-9" width="4" height="18" rx="1.5" fill="#9ec3f2" stroke="#3b2f22" stroke-width=".8"/>
      <circle cx="-13" cy="0" r="2" fill="#3b2f22"/></g>`,
    zombiehand: `<g><path d="M-5,10 v-10 l-3,-6 2,-1 3,5 v-9 h2 v8 h1 v-10 h2 v10 h1 v-8 h2 v9 l2,-3 2,1 -3,6 v8z" fill="#7cbf5a" stroke="#2f5a1f" stroke-width=".8"/>
      <path d="M-9,10 q9,-5 18,0" fill="#6b4f2a"/></g>`,
  };
  const WAVES = `<pattern id="waves" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="#9fd3ee"/><path d="M2,8 q4,-4 8,0 M16,3 q4,-4 8,0" stroke="#e8f6fd" stroke-width="1.2" fill="none" stroke-linecap="round"/></pattern>`;
  // Unit silhouettes on a -11..11 box (fill with currentColor / white)
  const UNIT_ICON = {
    inf: '<circle cx="0" cy="-5.5" r="3.2"/><path d="M-3.8,-6.4 q3.8,-4.6 7.6,0 z"/><path d="M-4.5,-1.5 h9 l1.3,8 h-3 l-.8,-4 -.8,8 h-2.4 l-.3,-5 -.3,5 h-2.4 l-.8,-8 -.8,4 h-3 z"/>',
    tank: '<rect x="-9" y="1" width="18" height="6" rx="3"/><rect x="-6.5" y="-3.5" width="11" height="5" rx="1.2"/><rect x="2" y="-2.6" width="9" height="1.8"/>',
    heli: '<rect x="-10" y="-8.5" width="20" height="1.6"/><rect x="-.7" y="-7.5" width="1.4" height="3"/><ellipse cx="-1.5" cy="-.5" rx="6" ry="4.2"/><rect x="3" y="-1.8" width="7.5" height="2"/><rect x="9.5" y="-4" width="1.5" height="4.5"/><path d="M-5,4.5 v2 h7 v-2" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    plane: '<path d="M0,-10 L1.6,-3.4 L10,1 L10,3.2 L1.6,1 L1.1,6.6 L3.8,8.8 L3.8,10 L0,9 L-3.8,10 L-3.8,8.8 L-1.1,6.6 L-1.6,1 L-10,3.2 L-10,1 L-1.6,-3.4Z"/>',
    zombie: '<circle cx="-1" cy="-6" r="3.2"/><path d="M-4.5,-2.5 h5.5 l7.5,1.4 v2 l-6.5,-.6 v3.6 l1.6,8.5 h-2.8 l-1.9,-6.5 -1.3,6.5 h-2.8 l1.1,-8.5 v-3.2 l-1.7,2.1 -1.9,-1 z"/>',
  };
  // Oil barrel, drawn around (0,0), about 8 x 10
  const BARREL = '<g><rect x="-4" y="-5" width="8" height="10" rx="1.6" fill="#2b2b2b" stroke="#111" stroke-width=".6"/><rect x="-4" y="-2.4" width="8" height="1" fill="#e8742a"/><rect x="-4" y="1.4" width="8" height="1" fill="#e8742a"/><ellipse cx="0" cy="-5" rx="4" ry="1" fill="#555" stroke="#111" stroke-width=".5"/></g>';
  /** Territory value badge: number in a circle, drawn around (0,0). */
  function valueBadge(v, r) {
    r = r || 7.5;
    return `<g><circle r="${r}" fill="#fffaf0" stroke="#2b2117" stroke-width="1.4"/><text y="${(r * 0.45).toFixed(1)}" font-size="${(r * 1.35).toFixed(1)}" text-anchor="middle" font-weight="700" fill="#2b2117" font-family="Patrick Hand, sans-serif">${v}</text></g>`;
  }
  /** Badge row (value circle + one barrel per oil) centred on (0,0); returns {svg, width}. */
  function badgeRow(value, oil, r) {
    r = r || 7.5;
    const items = [];
    if (value) items.push({ w: 2 * r, svg: (x) => `<g transform="translate(${x},0)">${valueBadge(value, r)}</g>` });
    for (let i = 0; i < Math.min(oil || 0, 4); i++) items.push({ w: 9, svg: (x) => `<g transform="translate(${x},0)">${BARREL}</g>` });
    const gap = 2.5;
    const width = items.reduce((s, it) => s + it.w, 0) + gap * Math.max(0, items.length - 1);
    let x = -width / 2;
    let out = '';
    for (const it of items) { out += it.svg(x + it.w / 2); x += it.w + gap; }
    return { svg: out, width };
  }
  /** Midpoint, direction (degrees) and length of an SVG "M..L.." polyline path. */
  function pathInfo(d) {
    const pts = [];
    const re = /([ML])\s*(-?[\d.]+),(-?[\d.]+)/g;
    let m;
    while ((m = re.exec(d))) pts.push([+m[2], +m[3]]);
    if (pts.length < 2) return null;
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(L); total += L; }
    const at = (dist) => {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        if (acc + seg[i - 1] >= dist) {
          const t = (dist - acc) / (seg[i - 1] || 1);
          return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        }
        acc += seg[i - 1];
      }
      return pts[pts.length - 1];
    };
    const mid = at(total / 2);
    const a = at(Math.max(0, total / 2 - Math.min(12, total / 2))), b = at(Math.min(total, total / 2 + Math.min(12, total / 2)));
    return { x: mid[0], y: mid[1], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, length: total };
  }
  /** Catan-road-style wooden wall bar centred on (0,0), lying along the x axis. */
  function wallBar(len, gate) {
    len = Math.max(14, Math.min(len, 30));
    const h = 6;
    return `<g><rect x="${-len / 2 + 1}" y="${-h / 2 + 1.4}" width="${len}" height="${h}" rx="1.4" fill="#000" opacity=".3"/>` +
      `<rect x="${-len / 2}" y="${-h / 2}" width="${len}" height="${h}" rx="1.4" fill="${gate ? '#d9a441' : '#8b5a2b'}" stroke="#3a2412" stroke-width=".9"/>` +
      `<rect x="${-len / 2 + 1.2}" y="${-h / 2 + 1}" width="${len - 2.4}" height="1.3" rx=".6" fill="#fff" opacity=".28"/>` +
      `<path d="M${-len / 2 + 1.5},${h / 2 - 1.2} h${len - 3}" stroke="#3a2412" stroke-width=".5" opacity=".5"/>` +
      (gate ? `<path d="M-3,3 v-2.6 a3,3 0 0 1 6,0 v2.6z" fill="#3a2412"/>` : '') + `</g>`;
  }
  return { DOODLES, WAVES, UNIT_ICON, BARREL, valueBadge, badgeRow, pathInfo, wallBar };
});
