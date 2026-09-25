/**
 * panel.js: the hour panel beside the Ellan Vannin panorama.
 *
 * Draws the highlighted hour as a paper-cut harbour: a wind dial on a mast
 * (a wind sock seen from above on a compass rose, its length the wind speed
 * against rings at 10 to 40 mph), a thermometer bracketed to the mast, a rain
 * gauge on the quay and a tide staff painted on the harbour wall, each with
 * its reading on a small paper tag. A grey seal puts its head up in the
 * harbour now and then. When the panel is wider than it is tall (phones, where
 * it sits under the scene) the same instruments stand in a row instead.
 *
 * app.js calls HourPanel.show(hour) whenever the highlighted hour changes;
 * the fields it passes are listed in hourDetail() there. Needs the #panel,
 * #harbour, #banner, #p-when, #p-what and #p-said elements from index.html.
 */
window.HourPanel = (() => {
'use strict';

const RAD = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const n1 = (v) => (+v).toFixed(1);
const poly = (a) => a.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ');
const mixc = (a, b, t) => a.map((v, k) => Math.round(lerp(v, b[k], t)));
const rgb = (c) => `rgb(${c.join(',')})`;
const $ = (id) => document.getElementById(id);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
function rng(seed) {
  let a = seed | 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- words and numbers ---------- */
const signed = (m) => `${m > .05 ? '+' : m < -.05 ? '−' : ''}${Math.abs(m).toFixed(1)}`;
const when = (d) => `${d.now ? 'Now · ' : ''}${d.weekday.slice(0, 3)} ${d.day} ${d.month.slice(0, 3)} · ${d.hour}:00`;
const feels = (d) => Math.abs(d.feel - d.temp) >= 1.5 ? `feels ${Math.round(d.feel)}°` : '';
const windWords = (d) => ({ big: String(Math.round(d.wind)), unit: 'mph', small: `${d.compass}${d.gust - d.wind >= 8 ? ` · gusts ${Math.round(d.gust)}` : ''}` });
const rainWords = (d) => d.snow > .02
  ? { big: d.snow.toFixed(1), unit: 'cm', small: `snow · ${Math.round(d.prob)}%` }
  : d.precip >= .05
    ? { big: d.precip.toFixed(1), unit: 'mm', small: `${Math.round(d.prob)}% chance` }
    : { big: 'dry', unit: '', small: `${Math.round(d.prob)}% chance` };
// the modelled tide turns 25 to 35 minutes early against the Douglas tables, so its times are only "about"
const turnWords = (d) => d.next ? `${d.next.high ? 'high' : 'low'} about ${d.next.when}` : '';
const tideWords = (d) => Number.isFinite(d.tide)
  ? { big: signed(d.tide), unit: 'm', small: turnWords(d) || (d.rising ? 'rising' : 'falling') }
  : { big: '–', unit: '', small: 'no sea data' };
function sentence(d) {
  const r = rainWords(d), t = tideWords(d);
  return [
    `${when(d)}: ${d.what}.`,
    `${Math.round(d.temp)} degrees${feels(d) ? `, ${feels(d)}` : ''}.`,
    `Wind from the ${d.compass} at ${Math.round(d.wind)} mph${d.gust - d.wind >= 8 ? `, gusting ${Math.round(d.gust)}` : ''}.`,
    r.big === 'dry' ? `Dry, ${r.small}.` : `${r.big} ${r.unit === 'cm' ? 'cm of snow' : 'mm of rain'} in the hour, ${Math.round(d.prob)}% chance.`,
    Number.isFinite(d.tide) ? `Tide ${t.big} m and ${d.rising ? 'rising' : 'falling'}${d.next ? `, ${d.next.high ? 'high' : 'low'} water about ${d.next.when}` : ''}.` : ''
  ].filter(Boolean).join(' ');
}

/* ---------- instruments: each returns { w, h, body } for an SVG drawn in a w by h box ---------- */
const nest = (inst, x, y, w, h) =>
  `<svg class="inst" x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${inst.w} ${n1(inst.h)}" preserveAspectRatio="xMidYMid meet">${inst.body}</svg>`;

/* a glass thermometer on a card, -5 to 25 degrees, with a mark for "feels like" */
function thermometer({ temp, feel, w = 64, h = 230, lo = -5, hi = 25 }) {
  const cx = w * .42, bulbY = h - 20, top = 12, yLo = bulbY - 22, yHi = top + 10;
  const y = (v) => yLo - (clamp(v, lo - 1.5, hi + 1.5) - lo) / (hi - lo) * (yLo - yHi);
  let b = `<rect class="board" filter="url(#paper)" x="2" y="2" width="${w - 4}" height="${n1(h - 4)}" rx="${(w - 4) / 2}"/>`;
  b += `<rect class="glass" x="${n1(cx - 6)}" y="${top}" width="12" height="${n1(bulbY - top)}" rx="6"/>`;
  b += `<circle class="glass" cx="${n1(cx)}" cy="${n1(bulbY)}" r="12"/><circle class="merc" cx="${n1(cx)}" cy="${n1(bulbY)}" r="8.5"/>`;
  b += `<rect class="merc" x="${n1(cx - 2.6)}" y="${n1(y(temp))}" width="5.2" height="${n1(bulbY - y(temp))}" rx="2.6"/>`;
  b += `<line class="shine" x1="${n1(cx - 3)}" y1="${top + 6}" x2="${n1(cx - 3)}" y2="${n1(bulbY - 16)}"/>`;
  for (let v = lo; v <= hi; v++) {
    const major = v % 5 === 0, yy = n1(y(v));
    b += `<line class="tick" x1="${n1(cx + 8)}" x2="${n1(cx + (major ? 16 : 12))}" y1="${yy}" y2="${yy}"/>`;
    if (major) b += `<text class="scale" x="${n1(cx + 18)}" y="${n1(y(v) + 3)}">${v}</text>`;
  }
  if (Number.isFinite(feel) && Math.abs(feel - temp) >= 1.5) {
    const fy = y(feel);
    b += `<path class="feel" d="M${n1(cx - 16)} ${n1(fy - 4)} L${n1(cx - 9)} ${n1(fy)} L${n1(cx - 16)} ${n1(fy + 4)} Z"/>`;
  }
  return { w, h, body: b };
}

/* five red and cream bands along an axis from (x0, y0), tapering to the tail */
function sockBands(x0, y0, ux, uy, len, mouth, f) {
  const px = -uy, py = ux, tail = .28 + .24 * f;
  const at = (t) => [x0 + ux * len * t, y0 + uy * len * t];
  const r = (t) => mouth / 2 * lerp(1, tail, t) * (1 + .06 * Math.sin(t * 9 + f * 3) * (1 - f));
  let bands = '';
  for (let k = 0; k < 5; k++) {
    const t0 = k / 5, t1 = (k + 1) / 5, [ax, ay] = at(t0), [bx, by] = at(t1), ra = r(t0), rb = r(t1);
    bands += `<polygon class="${k % 2 ? 'sockB' : 'sockA'}" points="${poly([[ax + px * ra, ay + py * ra], [bx + px * rb, by + py * rb], [bx - px * rb, by - py * rb], [ax - px * ra, ay - py * ra]])}"/>`;
  }
  const ang = Math.atan2(uy, ux) / RAD;
  // seen from above, the mouth's ring is edge on: a dark bar across the axis
  const ring = `<ellipse class="mouth" cx="${n1(x0)}" cy="${n1(y0)}" rx="${n1(mouth * .07)}" ry="${n1(mouth / 2)}" transform="rotate(${n1(ang)} ${n1(x0)} ${n1(y0)})"/>`;
  return `<g filter="url(#paper)">${bands}${ring}</g>`;
}

/* the wind sock seen from above on a compass rose, north up. Its length is the wind speed read against
   dotted rings at 10, 20, 30 and 40 mph; a dashed outline shows how far the gusts reach */
const ROSE_TOP = 45;
function windRose({ speed, gust, dir, size = 150 }) {
  const c = size / 2, R = c - 13, per = (R - 7) / ROSE_TOP, bb = (dir + 180) * RAD;
  const ux = Math.sin(bb), uy = -Math.cos(bb), f = clamp(speed / 30, 0, 1);
  const lenOf = (v) => Math.max(9, clamp(v, 0, ROSE_TOP + 3) * per);
  let b = `<circle class="bezel" filter="url(#paper)" cx="${c}" cy="${c}" r="${c - 2}"/><circle class="face" cx="${c}" cy="${c}" r="${R}"/>`;
  for (let d = 0; d < 360; d += 22.5) {
    const r0 = R - (d % 90 === 0 ? 6 : 3.5), s = Math.sin(d * RAD), k = -Math.cos(d * RAD);
    b += `<line class="tick" x1="${n1(c + s * r0)}" y1="${n1(c + k * r0)}" x2="${n1(c + s * R)}" y2="${n1(c + k * R)}"/>`;
  }
  for (const [l, d] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    b += `<text class="bezeltext" x="${n1(c + Math.sin(d * RAD) * (R + 6.5))}" y="${n1(c - Math.cos(d * RAD) * (R + 6.5) + 3.2)}" text-anchor="middle">${l}</text>`;
  }
  // the rings are labelled along the upwind radius, which the sock always leaves clear
  const fs = Math.sin(dir * RAD), fc = -Math.cos(dir * RAD);
  for (const v of [10, 20, 30, 40]) {
    b += `<circle class="ring" cx="${c}" cy="${c}" r="${n1(v * per)}"/>`;
    b += `<text class="ringtext" x="${n1(c + fs * v * per)}" y="${n1(c + fc * v * per + 2.6)}" text-anchor="middle">${v}</text>`;
  }
  b += `<circle class="from" cx="${n1(c + fs * (R + 1))}" cy="${n1(c + fc * (R + 1))}" r="3.6"/>`;
  if (Number.isFinite(gust) && gust - speed >= 5) {
    const gl = lenOf(gust), px = -uy, py = ux, m = 8, t = m * (.28 + .24 * clamp(gust / 30, 0, 1));
    b += `<polygon class="ghost" points="${poly([[c + px * m, c + py * m], [c + ux * gl + px * t, c + uy * gl + py * t], [c + ux * gl - px * t, c + uy * gl - py * t], [c - px * m, c - py * m]])}"/>`;
  }
  b += sockBands(c, c, ux, uy, lenOf(speed), 16, f);
  b += `<circle class="finial" cx="${c}" cy="${c}" r="3.5"/>`;
  return { w: size, h: size, body: b };
}

/* a funnel over a glass jar; the level follows the square root of the hour's rain, up to 8 mm */
function rainJar({ mm, prob, snow, w = 90, h = 130 }) {
  const cx = w / 2, jt = 46, jb = h - 8, jw = 30, snowy = snow > .02;
  const level = Math.sqrt(clamp((snowy ? snow * 10 : mm) || 0, 0, 8) / 8);
  const y = (v) => jb - 4 - Math.sqrt(v / 8) * (jb - jt - 8), op = clamp((prob || 0) / 100, .12, 1);
  let b = '';
  for (let k = 0; k < 3; k++) {
    const dx = cx + (k - 1) * 11, dy = 8 + (k % 2) * 9;
    b += snowy ? `<circle class="flake" cx="${dx}" cy="${dy + 4}" r="3" opacity="${n1(op)}"/>` : `<path class="drop" opacity="${n1(op)}" d="M${dx} ${dy} q4 7 0 9 q-4 -2 0 -9Z"/>`;
  }
  b += `<polygon class="glass" points="${poly([[cx - 26, 28], [cx + 26, 28], [cx + 6, jt], [cx - 6, jt]])}"/>`;
  b += `<rect class="glass" x="${cx - jw / 2}" y="${jt}" width="${jw}" height="${jb - jt}" rx="4"/>`;
  if (level > 0) {
    const top = jb - 4 - level * (jb - jt - 8);
    b += `<rect class="${snowy ? 'snowfill' : 'water'}" x="${cx - jw / 2 + 3}" y="${n1(top)}" width="${jw - 6}" height="${n1(jb - 3 - top)}" rx="2"/>`;
  }
  for (const v of [.5, 1, 2, 4, 8]) {
    const yy = n1(y(v));
    b += `<line class="tick" x1="${cx + jw / 2 - 7}" x2="${cx + jw / 2}" y1="${yy}" y2="${yy}"/><text class="scale" x="${cx + jw / 2 + 3}" y="${n1(y(v) + 3)}">${v}</text>`;
  }
  b += `<line class="shine" x1="${cx - jw / 2 + 5}" y1="${jt + 6}" x2="${cx - jw / 2 + 5}" y2="${jb - 8}"/>`;
  return { w, h, body: b };
}

/* for the strip: a glass tube filled to the tide, across the week's range, with an arrow for rising or falling */
function tideTube({ tide, rising, lo, hi, w = 48, h = 150 }) {
  const top = Math.ceil(hi + .3), bot = Math.floor(lo - .3), x0 = 8, tw = 16, y0 = 8, y1 = h - 8;
  const y = (v) => y0 + 4 + (top - v) / (top - bot) * (y1 - y0 - 8);
  let b = `<rect class="board" filter="url(#paper)" x="2" y="2" width="${w - 4}" height="${h - 4}" rx="8"/>`;
  b += `<rect class="glass" x="${x0}" y="${y0}" width="${tw}" height="${y1 - y0}" rx="8"/>`;
  if (Number.isFinite(tide)) {
    const wy = y(tide);
    b += `<rect class="water" x="${x0 + 3}" y="${n1(wy)}" width="${tw - 6}" height="${n1(y1 - 3 - wy)}" rx="3"/>`;
    b += rising ? `<path class="arrow" d="M${x0 + tw + 10} ${n1(wy - 6)} l-4.5 7 h9 Z"/>` : `<path class="arrow" d="M${x0 + tw + 10} ${n1(wy + 6)} l-4.5 -7 h9 Z"/>`;
  }
  for (let v = bot; v <= top + 1e-6; v++) {
    const yy = n1(y(v));
    b += `<line class="tick" x1="${x0 + tw - 5}" x2="${x0 + tw}" y1="${yy}" y2="${yy}"/>`;
    if (v % 2 === 0) b += `<text class="scale" x="${x0 + tw + 3}" y="${n1(y(v) + 3)}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</text>`;
  }
  return { w, h, body: b };
}

/* a herring gull standing: white head, grey back, black wing tips, yellow bill with a red spot */
function gull(x, y, s = 1) {
  return `<g transform="translate(${n1(x)} ${n1(y)}) scale(${n1(s)})" filter="url(#paper)">
    <path class="g-leg" d="M-2 0 V-7 M3 0 V-7"/>
    <path class="g-body" d="M-14 -12 C-10 -22 6 -24 12 -18 C16 -14 14 -8 6 -7 C-2 -6 -10 -7 -14 -12Z"/>
    <path class="g-wing" d="M-16 -13 C-8 -21 4 -20 9 -15 C3 -11 -8 -10 -16 -13Z"/>
    <path class="g-tip" d="M-16 -13 L-21 -12 L-13 -11Z"/>
    <circle class="g-body" cx="11" cy="-22" r="6"/>
    <path class="g-bill" d="M16 -23 L23 -21.5 L16 -20Z"/><circle class="g-spot" cx="20.5" cy="-21" r="1"/><circle class="g-eye" cx="12.5" cy="-23.5" r=".9"/>
  </g>`;
}

/* a paper tag hung on a nail, with a big reading and an optional line under it */
function tag(x, y, w, h, big, unit, small, compact = false) {
  let s = `<g filter="url(#paper)"><rect class="lbl" x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${h}" rx="3"/></g>`;
  if (!compact) s += `<circle class="nail" cx="${n1(x + w / 2)}" cy="${n1(y + 6)}" r="2"/>`;
  const base = small ? h - (compact ? 13 : 17) : h - (compact ? 9 : 10);
  s += `<text x="${n1(x + w / 2)}" y="${n1(y + base)}" text-anchor="middle"><tspan class="${compact ? 'lbig small' : 'lbig'}">${big}</tspan>${unit ? `<tspan class="lunit" dx="2">${unit}</tspan>` : ''}</text>`;
  if (small) s += `<text class="${compact ? 'lsmall small' : 'lsmall'}" x="${n1(x + w / 2)}" y="${n1(y + h - (compact ? 4 : 6))}" text-anchor="middle">${small}</text>`;
  return s;
}

// a grey seal's head, drawn about the point where its neck meets the water; the long straight nose is a grey seal's
const SEAL = `<g filter="url(#paper)"><path class="seal-body" d="M-8 10 C-9.5 -4 -7 -14 0 -17 C5 -18.5 9.5 -16 12.8 -13.2 C13.8 -12.2 13.2 -10.5 11.6 -10.1 C8 -9.3 6.2 -8 6.2 -4 L6.2 10 Z"/></g>
  <circle class="seal-spot" cx="-3.5" cy="-8" r="1.5"/><circle class="seal-spot" cx=".5" cy="-3.5" r="1.1"/><circle class="seal-spot" cx="-5.5" cy="-1" r="1.3"/><circle class="seal-spot" cx="-1" cy="-12.5" r=".8"/>
  <circle class="seal-dark" cx="3.4" cy="-13.4" r="1.6"/><ellipse class="seal-dark" cx="12.3" cy="-12.2" rx="1" ry=".8"/><circle cx="3.9" cy="-13.9" r=".5" fill="rgba(255,255,255,.8)"/>
  <path class="seal-whisker" d="M10.4 -11.2 L15.5 -12.3 M10.4 -10.8 L15.6 -10.2 M10 -10.4 L14.6 -8.6"/>`;

/* ---------- the harbour ---------- */
let last = null, drawnKey = '', geo = null;

// sky for the hour, greyed by cloud and rain, with a glow when the sun is near the horizon; clouds, rain or snow
function sky(d, W, H, top0, yQ, R) {
  const L = clamp(d.light, 0, 1), cloud = d.cloud / 100, wet = d.precip >= .05 || d.snow > .02;
  let top = mixc([12, 20, 48], [96, 152, 200], L), bot = mixc([36, 50, 84], [212, 227, 235], L);
  const grey = Math.min(.8, cloud * .5 + (wet ? .28 : 0));
  top = mixc(top, mixc([36, 42, 52], [128, 138, 146], L), grey); bot = mixc(bot, mixc([50, 56, 64], [168, 174, 178], L), grey);
  const glow = clamp(1 - Math.abs(d.sun + 1) / 8, 0, 1) * (1 - grey * .7);
  let s = `<defs><filter id="paper" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1.3" stdDeviation="1.2" flood-color="#140e06" flood-opacity=".38"/></filter>
    <linearGradient id="h-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgb(top)}"/><stop offset="1" stop-color="${rgb(bot)}"/></linearGradient>
    <linearGradient id="h-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3a45c" stop-opacity="0"/><stop offset="1" stop-color="#f3a45c" stop-opacity=".85"/></linearGradient>
    <radialGradient id="h-lamp"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#h-sky)"/>`;
  if (glow > .02) s += `<rect y="${n1(yQ - Math.min(190, H * .6))}" width="${W}" height="${n1(Math.min(190, H * .6))}" fill="url(#h-glow)" opacity="${n1(glow)}"/>`;
  if (L < .3 && cloud < .75) for (let k = 0; k < 22; k++) s += `<circle class="star" cx="${n1(R() * W)}" cy="${n1(top0 + R() * (yQ - top0 - 40))}" r="${n1(.5 + R() * .9)}" opacity="${n1((1 - L / .3) * (1 - cloud) * (.4 + R() * .6))}"/>`;
  const nClouds = cloud > .2 ? 1 + Math.round(cloud * 2) : 0, small = H < 260 ? .6 : 1;
  const cfill = rgb(mixc(mixc([70, 76, 88], [250, 248, 242], L), mixc([52, 56, 64], [150, 156, 162], L), wet ? .8 : cloud * .4));
  for (let k = 0; k < nClouds; k++) {
    const cx = (k + .5) / nClouds * W + (R() - .5) * 30, cy = top0 + (20 + R() * 44 + k * 10) * small, sc = (.8 + R() * .5) * small;
    s += `<g filter="url(#paper)" fill="${cfill}" transform="translate(${n1(cx)} ${n1(cy)}) scale(${n1(sc)})"><circle cx="-18" cy="0" r="13"/><circle cx="2" cy="-8" r="18"/><circle cx="22" cy="0" r="12"/><rect x="-31" y="0" width="65" height="12" rx="6"/></g>`;
  }
  // rain leans with the wind's north-south part, as the scene sees it from the east
  const lean = Math.cos((d.dir + 180) * RAD) * clamp(d.wind / 30, 0, 1) * .6;
  if (d.snow > .02) for (let k = 0; k < 70; k++) s += `<circle class="snowdot" cx="${n1(R() * W)}" cy="${n1(top0 + R() * (yQ - top0))}" r="${n1(1 + R() * 1.4)}"/>`;
  else if (d.precip >= .05) {
    const n = clamp(Math.round(d.precip * 24 * (W * H) / 210000), 8, 90);
    for (let k = 0; k < n; k++) { const x = R() * (W + 40) - 20, y = top0 + R() * (yQ - top0), len = 10 + R() * 8; s += `<line class="rainline" x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x + lean * len)}" y2="${n1(y + len)}"/>`; }
  }
  return s;
}
// the quay: a slab on a stone wall, and the sea against it with a wave for the hour; returns the markup and the water line
function quay(d, W, H, yQ) {
  const L = clamp(d.light, 0, 1), stone = mixc([58, 58, 62], [164, 156, 142], L), wall = mixc([44, 44, 48], [128, 120, 108], L);
  let s = `<rect x="0" y="${yQ + 8}" width="${W}" height="${H - yQ}" fill="${rgb(wall)}"/>`;
  for (let row = 0, y = yQ + 8; y < H; row++, y += 17) {
    s += `<line class="course" x1="0" x2="${W}" y1="${y}" y2="${y}"/>`;
    for (let x = (row % 2) * 19; x < W; x += 38) s += `<line class="joint" x1="${x}" x2="${x}" y1="${y}" y2="${y + 17}"/>`;
  }
  s += `<g filter="url(#paper)"><rect x="-4" y="${yQ}" width="${W + 8}" height="10" rx="2" fill="${rgb(stone)}"/></g>`;
  return s;
}
function sea(d, W, H, wy) {
  const L = clamp(d.light, 0, 1), amp = clamp((d.wave || 0) * 1.8, 1, 8), per = 30 - clamp(d.wave || 0, 0, 5) * 3, pts = [];
  for (let x = -2; x <= W + 3; x += 3) pts.push(`${x} ${n1(wy + Math.sin(x / per * Math.PI * 2) * amp)}`);
  let s = `<path d="M${pts.join(' L')} L${W + 3} ${H} L-2 ${H} Z" fill="${rgb(mixc([22, 44, 64], [58, 108, 146], L))}" opacity=".9"/>`;
  // the seal sits in front of the water but is clipped to what is above it
  s += `<clipPath id="h-above"><path d="M${pts.join(' L')} L${W + 3} -10 L-2 -10 Z"/></clipPath>`;
  s += `<g clip-path="url(#h-above)"><g id="h-seal" style="display:none;filter:brightness(${n1(lerp(.45, 1, L))})">${SEAL}</g></g><g id="h-ripples"></g>`;
  if ((d.wave || 0) > 1) for (let x = per * .25; x < W; x += per * 2) s += `<path class="foam" d="M${n1(x - 5)} ${n1(wy - amp + 1)} q5 -3 10 0"/>`;
  return { s, amp, per };
}

// tall: the mast with its dial, the thermometer, the rain gauge and a tide staff painted on the wall
function harbour(d, W, H, top0) {
  const L = clamp(d.light, 0, 1), yQ = Math.round(H * .8), mx = Math.round(W * .5), R = rng(Math.round(d.t / 36e5));
  let s = sky(d, W, H, top0, yQ, R) + quay(d, W, H, yQ);
  const tTop = Math.ceil(d.tideHi + .3), tBot = Math.floor(d.tideLo - .3), ty0 = yQ + 26, ty1 = H - 10;
  const tyOf = (v) => ty0 + (tTop - v) / (tTop - tBot) * (ty1 - ty0), sx0 = Math.round(W * .1);
  s += `<rect class="staffboard" x="${sx0 - 9}" y="${ty0 - 5}" width="24" height="${n1(ty1 - ty0 + 10)}" rx="1.5"/>`;
  for (let v = tBot; v <= tTop + 1e-6; v += .5) {
    const whole = Math.abs(v - Math.round(v)) < 1e-6, yy = n1(tyOf(v));
    s += `<line class="stafftick" x1="${sx0 - 9}" x2="${sx0 - 9 + (whole ? 9 : 5)}" y1="${yy}" y2="${yy}"/>`;
    if (whole) s += `<text class="stafftext" x="${sx0 + 2}" y="${n1(tyOf(v) + 3)}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</text>`;
  }
  geo = { W, L, s: 1.35 * clamp(W / 300, .9, 1.3), sea: Number.isFinite(d.tide), fx: [.24, .54] };
  if (geo.sea) {
    const wy = tyOf(d.tide), w = sea(d, W, H, wy);
    Object.assign(geo, { wy, amp: w.amp, per: w.per });
    s += w.s;
    s += d.rising ? `<path class="arrow" d="M${sx0 + 26} ${n1(wy - 5)} l6 -9 l6 9 Z"/>` : `<path class="arrow" d="M${sx0 + 26} ${n1(wy + 5)} l6 9 l6 -9 Z"/>`;
  }
  // ironwork turns pale against a night sky
  const iron = L < .4 ? '#d9d0bd' : '#2a241c';
  const r = clamp(Math.min(W * .27, H * .11), 44, 84), cy = top0 + r + 4;
  s += `<line class="iron" stroke="${iron}" stroke-width="3" x1="${mx}" y1="${yQ}" x2="${mx}" y2="${n1(cy)}"/>`;
  s += nest(windRose({ speed: d.wind, gust: d.gust, dir: d.dir }), mx - r, cy - r, 2 * r, 2 * r);
  const w = windWords(d);
  s += tag(mx - 102, cy + r + 8, 92, 52, w.big, w.unit, w.small);
  if (L < .35) {
    s += `<circle cx="${mx}" cy="${n1(yQ - 62)}" r="26" fill="url(#h-lamp)" opacity="${n1(1 - L / .35)}"/>`;
    s += `<g filter="url(#paper)"><rect x="${mx - 5}" y="${n1(yQ - 70)}" width="10" height="14" rx="2" fill="#2a241c"/><rect x="${mx - 3}" y="${n1(yQ - 67)}" width="6" height="8" fill="#ffd98a"/></g>`;
  }
  const tyy = cy + r + 66, th = clamp(yQ - 40 - tyy, 80, 190), tw = th * 64 / 230, tx = mx - tw - 12;
  s += `<line class="iron" stroke="${iron}" x1="${n1(tx + tw - 4)}" y1="${n1(tyy + 18)}" x2="${mx}" y2="${n1(tyy + 18)}"/><line class="iron" stroke="${iron}" x1="${n1(tx + tw - 4)}" y1="${n1(tyy + th - 18)}" x2="${mx}" y2="${n1(tyy + th - 18)}"/>`;
  s += nest(thermometer({ temp: d.temp, feel: d.feel }), tx, tyy, tw, th);
  s += tag(mx + 10, tyy + 8, 78, 58, `${Math.round(d.temp)}°`, '', feels(d));
  const jx = Math.round(W * .8), jarH = clamp(yQ - (tyy + 66) - 64, 54, 110), rr = rainWords(d);
  s += nest(rainJar({ mm: d.precip, prob: d.prob, snow: d.snow }), jx - jarH * .35, yQ - jarH, jarH * .69, jarH);
  s += tag(jx - 44, Math.max(tyy + 72, yQ - jarH - 58), 88, 52, rr.big, rr.unit, rr.small);
  s += gull(Math.round(W * .2), yQ, 1.15);
  const t = tideWords(d);
  s += tag(W - 118, yQ + 22, 108, 52, t.big, t.unit, t.small);
  return s;
}

// wide: the same instruments in a row on the quay, the tide in a glass tube, the sea along the bottom.
// Each instrument takes the width its drawing and tag need; on a narrow phone the whole row shrinks to fit.
function strip(d, W, H, top0) {
  const L = clamp(d.light, 0, 1), yQ = H - 28, R = rng(Math.round(d.t / 36e5));
  let s = sky(d, W, H, top0, yQ, R) + quay(d, W, H, yQ);
  geo = { W, L, s: .95, sea: true, fx: [.06, .94] };
  const w0 = sea(d, W, H, yQ + 15);
  Object.assign(geo, { wy: yQ + 15, amp: w0.amp, per: w0.per });
  const band = yQ - top0, ds = band - 40, th = band - 6, tw = th * 64 / 230, jh = Math.min(band - 42, 84), jw = jh * .69, tubeW = th * 48 / 150;
  const widths = [Math.max(ds, 66), tw + 4 + 48, Math.max(jw, 66), tubeW + 4 + 86], need = widths.reduce((a, b) => a + b, 0) + 5 * 8;
  const k = Math.min(1, W / need), Wv = W / k, gap = (Wv - need + 40) / 5, yv = (y) => y / k;
  let x = gap, row = '';
  const next = (w) => { const at = x; x += w + gap; return at; };
  const wx = next(widths[0]), w = windWords(d);
  row += nest(windRose({ speed: d.wind, gust: d.gust, dir: d.dir }), wx + widths[0] / 2 - ds / 2, yv(top0) + 1, ds, ds);
  row += tag(wx + widths[0] / 2 - 33, yv(top0) + ds + 4, 66, 34, w.big, w.unit, d.gust - d.wind >= 8 ? `gusts ${Math.round(d.gust)}` : d.compass, true);
  const tx = next(widths[1]);
  row += nest(thermometer({ temp: d.temp, feel: d.feel }), tx, yv(top0) + 2, tw, th);
  row += tag(tx + tw + 4, yv(top0) + th / 2 - 18, 48, 36, `${Math.round(d.temp)}°`, '', feels(d), true);
  const rx = next(widths[2]), rr = rainWords(d);
  row += nest(rainJar({ mm: d.precip, prob: d.prob, snow: d.snow }), rx + widths[2] / 2 - jw / 2, yv(yQ) - jh, jw, jh);
  row += tag(rx + widths[2] / 2 - 33, yv(yQ) - jh - 38, 66, 34, rr.big, rr.unit, rr.small.replace(' chance', ''), true);
  const ux = next(widths[3]), tt = tideWords(d);
  row += nest(tideTube({ tide: d.tide, rising: d.rising, lo: d.tideLo, hi: d.tideHi }), ux, yv(top0) + 2, tubeW, th);
  row += tag(ux + tubeW + 4, yv(top0) + th / 2 - 18, 86, 36, tt.big, tt.unit, tt.small, true);
  return s + `<g transform="scale(${k.toFixed(4)})">${row}</g>` + w0.s;
}

function draw(d) {
  const svg = $('harbour'), W = svg.clientWidth, H = svg.clientHeight, banner = $('banner');
  if (!W || !H) return;
  const key = `${d.t}|${W}|${H}`;
  if (key === drawnKey) return;
  drawnKey = key;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const top0 = banner.offsetTop + banner.offsetHeight + (W > H * 1.2 ? 6 : 10);
  svg.innerHTML = W > H * 1.2 ? strip(d, W, H, top0) : harbour(d, W, H, top0);
}

function show(d) {
  last = d;
  const w = when(d);
  if ($('p-when').textContent !== w) { $('p-when').textContent = w; $('p-what').textContent = d.what; $('p-said').textContent = sentence(d); }
  draw(d);
}

/* ---------- the harbour seal ---------- */
// now and then a grey seal puts its head up by the quay, in daylight only
const seal = { on: false, next: performance.now() + 2500 };
function tick(now) {
  requestAnimationFrame(tick);
  const g = $('h-seal'), rip = $('h-ripples');
  if (!g || !geo || !geo.sea) return;
  if (!seal.on) {
    g.style.display = 'none'; if (rip) rip.innerHTML = '';
    if (now < seal.next || geo.L < .12) return;
    Object.assign(seal, { on: true, t0: now, f: lerp(geo.fx[0], geo.fx[1], Math.random()), dir: Math.random() < .5 ? -1 : 1, dur: 4200 + Math.random() * 2200 });
  }
  const age = (now - seal.t0) / 1000, T = seal.dur / 1000;
  if (age > T) { seal.on = false; seal.next = now + 6000 + Math.random() * 12000; return; }
  const x = geo.W * seal.f, yw = geo.wy + Math.sin(x / geo.per * Math.PI * 2) * geo.amp, s = geo.s;
  const rise = sstep(0, .7, age) * (1 - sstep(T - .7, T, age));
  const y = yw + (1 - rise) * 26 * s + Math.sin(age * 2.3) * 1.2 * s;
  g.style.display = '';
  g.setAttribute('transform', `translate(${n1(x)} ${n1(y)}) scale(${n1(seal.dir * s)} ${n1(s)}) rotate(${n1(Math.sin(age * .9) * 7)})`);
  if (!rip) return;
  let m = '';
  if (age > .3 && age < T - .4) for (let n = 0; n < 2; n++) {
    const tt = ((age - n * .8) % 1.6 + 1.6) % 1.6 / 1.6, rx = (6 + tt * 22) * s;
    m += `<ellipse class="ripple" cx="${n1(x + seal.dir * 2 * s)}" cy="${n1(yw + 1)}" rx="${n1(rx)}" ry="${n1(rx * .2)}" opacity="${n1(.45 * (1 - tt))}"/>`;
  }
  rip.innerHTML = m;
}
if (!still) requestAnimationFrame(tick);
new ResizeObserver(() => last && draw(last)).observe($('panel'));

return { show, seal };
})();
