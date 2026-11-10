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
  return { DOODLES, WAVES };
});
