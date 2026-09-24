/**
 * app.js: draws the Ellan Vannin weather panorama.
 *
 * Fetches the hourly Met Office forecast for Douglas from Open-Meteo
 * (ukmo_seamless, topped up from best_match where the Met Office run ends) and
 * tides and waves for Douglas Bay from the Open-Meteo marine API. It then paints
 * one static canvas (sky, stars, sun and moon paths, cloud, the island in three
 * paper layers, sea, the ruler) and animates rain, snow and lightning on a
 * second canvas above it. The x axis is time; the skyline is scenery.
 *
 * Needs window.MANX_PROFILE from profile.js.
 * URL options: ?demo for a synthetic week that exercises every kind of weather,
 * ?hours=48 to open on the two-day view.
 */
(() => {
'use strict';

const PLACE = { lat: 54.15, lon: -4.48 };
const BAY = { lat: 54.15, lon: -4.40 };
const TZ = 'Europe/Isle_of_Man';
const HOUR = 36e5, STEP = 9e5, TAU = Math.PI * 2, RAD = Math.PI / 180;
const FIELDS = {
  temperature_2m: 'temp', apparent_temperature: 'feel', dew_point_2m: 'dew', precipitation: 'precip',
  precipitation_probability: 'prob', snowfall: 'snow', weather_code: 'code', cloud_cover: 'cloud',
  cloud_cover_low: 'low', cloud_cover_mid: 'mid', cloud_cover_high: 'high', visibility: 'vis',
  wind_speed_10m: 'wind', wind_direction_10m: 'dir', wind_gusts_10m: 'gust'
};
const MARINE = { wave_height: 'wave', sea_level_height_msl: 'tide' };
const DEFAULTS = { vis: 30000 };
const NUMERIC = ['temp', 'feel', 'dew', 'precip', 'prob', 'snow', 'cloud', 'low', 'mid', 'high', 'vis', 'wind', 'gust', 'wave', 'tide'];
const CACHE_KEY = 'ellan-vannin-forecast-v1';

const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const stage = $('stage'), inner = $('inner'), sceneCv = $('scene'), fxCv = $('fx');
const sc = sceneCv.getContext('2d'), fx = fxCv.getContext('2d');

/* ---------- small maths ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
const hex = (h) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${+a.toFixed(3)})`;
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const floorHour = (ms) => Math.floor(ms / HOUR) * HOUR;

/* ---------- sun and moon (after Vladimir Agafonkin's SunCalc) ---------- */
const OBL = RAD * 23.4397;
const toDays = (ms) => ms / 864e5 - 0.5 + 2440588 - 2451545;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const sidereal = (d) => RAD * (280.16 + 360.9856235 * d) + RAD * PLACE.lon;
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
function sunAlt(ms) { const d = toDays(ms), c = sunCoords(d); return altitude(sidereal(d) - c.ra, RAD * PLACE.lat, c.dec) / RAD; }
function moonAlt(ms) { const d = toDays(ms), c = moonCoords(d); return altitude(sidereal(d) - c.ra, RAD * PLACE.lat, c.dec) / RAD; }
function moonDisc(ms) {
  const d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  // where the bright limb points, eastward from north on the disc
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const H = sidereal(d) - m.ra, lat = RAD * PLACE.lat;
  const parallactic = Math.atan2(Math.sin(H), Math.tan(lat) * Math.cos(m.dec) - Math.sin(m.dec) * Math.cos(H));
  return { fraction: (1 + Math.cos(inc)) / 2, waxing: angle < 0, limb: angle - parallactic };
}

/* ---------- palette ---------- */
// [sun elevation, zenith, mid sky, horizon at dawn, horizon at dusk]
const SKY = [
  [-18, '#0c1336', '#16204d', '#242d5e', '#242d5e'],
  [-12, '#111b4c', '#202c68', '#363f7c', '#373b76'],
  [-7, '#152259', '#33428a', '#8a7ab2', '#7e6194'],
  [-3, '#223a7e', '#6c76b3', '#e7a6a7', '#eb8d6c'],
  [0, '#2d56a2', '#8b9acb', '#ffcaa3', '#ffa66a'],
  [4, '#386ab6', '#9bbae2', '#ffe1bc', '#ffcb8c'],
  [10, '#3675c3', '#8ab8e6', '#e9eef0', '#f2e6cd'],
  [25, '#2c6dc3', '#71a7e1', '#d2e5f5', '#dde7ee'],
  [91, '#2c6dc3', '#71a7e1', '#d2e5f5', '#dde7ee']
].map(([e, ...c]) => [e, ...c.map(hex)]);
const C = Object.fromEntries(Object.entries({
  ocTopDay: '#8d969e', ocMidDay: '#a8afb4', ocHorDay: '#c5c8c4',
  ocTopNight: '#161b2a', ocMidNight: '#1c2232', ocHorNight: '#262d3d', storm: '#3a404c',
  cloudDay: '#fbf7ef', cloudNight: '#3b4269', cloudRainDay: '#69707b', cloudRainNight: '#161a27',
  farDay: '#94a39d', midDay: '#857c50', nearDay: '#4f5b33',
  farNight: '#2b3459', midNight: '#1f2749', nearNight: '#151a37',
  gold: '#e8a26d', grey: '#7b8079', black: '#04070f',
  seaDay: '#2d6581', seaGrey: '#56676f', seaNight: '#111d3a',
  sandDay: '#cdb88d', sandNight: '#1c1e2b', fogDay: '#dcdcd5', fogNight: '#252a38',
  stoneDay: '#e3dbca', stoneNight: '#2b2f41', houseDay: '#f1eadb', houseNight: '#20243a',
  roofDay: '#5e5352', roofNight: '#111425', rockDay: '#5b5249', rockNight: '#141523',
  wheelDay: '#b3262e', wheelNight: '#3a1a28', graniteDay: '#9b968c', graniteNight: '#2c2f3e',
  lanternDay: '#262220', lanternNight: '#0b0d17', ochre: '#c99a3a'
}).map(([k, v]) => [k, hex(v)]));
const TEMP_STOPS = [[-5, '#5877c9'], [0, '#7ea3dc'], [5, '#9fcbd6'], [10, '#bcd9a6'], [14, '#e8d67f'], [18, '#f3b560'], [23, '#e7774d'], [30, '#b93a3a']].map(([v, h]) => [v, hex(h)]);
function tempColour(v) {
  if (v <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [b, cb] = TEMP_STOPS[i], [a, ca] = TEMP_STOPS[i - 1];
    if (v <= b) return mix(ca, cb, (v - a) / (b - a));
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

/* ---------- words ---------- */
const CODES = {
  0: ['Clear', 'Sunny'], 1: ['Mainly clear', 'Mainly sunny'], 2: ['Partly cloudy'], 3: ['Overcast'],
  45: ['Fog'], 48: ['Freezing fog'], 51: ['Light drizzle'], 53: ['Drizzle'], 55: ['Heavy drizzle'],
  56: ['Freezing drizzle'], 57: ['Freezing drizzle'], 61: ['Light rain'], 63: ['Rain'], 65: ['Heavy rain'],
  66: ['Freezing rain'], 67: ['Freezing rain'], 71: ['Light snow'], 73: ['Snow'], 75: ['Heavy snow'],
  77: ['Snow grains'], 80: ['Light showers'], 81: ['Showers'], 82: ['Violent showers'], 85: ['Snow showers'],
  86: ['Heavy snow showers'], 95: ['Thunderstorms'], 96: ['Thunder and hail'], 99: ['Thunder and hail']
};
const BEAUFORT = [[1, 'calm'], [4, 'light air'], [8, 'light breeze'], [13, 'gentle breeze'], [19, 'moderate breeze'], [25, 'fresh breeze'], [32, 'strong breeze'], [39, 'near gale'], [47, 'gale'], [55, 'severe gale'], [64, 'storm'], [999, 'violent storm']];
const beaufort = (mph) => BEAUFORT.find(([v]) => mph < v)[1];
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
const convective = (code) => code >= 95 ? 1.2 : code >= 85 ? .5 : code >= 80 ? .6 : 0;
const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', hourCycle: 'h23' });

/* ---------- state ---------- */
let DATA = null;
const PROFILE = window.MANX_PROFILE || fallbackProfile();
const G = {}, LT = { t0: 0, a: [] }, SLOTS = {};
const VIEWS = [168, 48, 24, 12], VIEW_KEY = 'ellan-vannin-view';
function savedView() { try { return +localStorage.getItem(VIEW_KEY); } catch { return 0; } }
// a ?hours= link wins, then the view this browser used last, then 48 hours
const state = { hours: [+params.get('hours'), savedView(), 48].find((h) => VIEWS.includes(h)), cursor: 0, fxCols: [], storms: [] };

function fallbackProfile() {
  const n = 127, bump = (i, c, w, h) => h * Math.exp(-Math.pow((i - c) / w, 2));
  const far = Array.from({ length: n }, (_, i) => i < 3 || i > 124 ? 0 : Math.round(40 + bump(i, 36, 9, 420) + bump(i, 74, 10, 580) + bump(i, 88, 7, 520) + bump(i, 55, 12, 380)));
  return { latSouth: 54.04, latNorth: 54.42, far, mid: far.map((v) => Math.round(v * .8)), near: far.map((v) => Math.round(v * .45)) };
}

/* ---------- data ---------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  return r.json();
}
async function fetchForecast() {
  const q = new URLSearchParams({
    latitude: PLACE.lat, longitude: PLACE.lon, hourly: Object.keys(FIELDS).join(','),
    models: 'ukmo_seamless,best_match', forecast_days: 8, timezone: TZ, timeformat: 'unixtime', wind_speed_unit: 'mph'
  });
  const m = new URLSearchParams({
    latitude: BAY.lat, longitude: BAY.lon, hourly: Object.keys(MARINE).join(','), forecast_days: 8, timezone: TZ, timeformat: 'unixtime'
  });
  const [f, s] = await Promise.all([
    getJSON(`https://api.open-meteo.com/v1/forecast?${q}`),
    getJSON(`https://marine-api.open-meteo.com/v1/marine?${m}`).catch(() => null)
  ]);
  return normalise(f, s);
}
function normalise(f, s) {
  const h = f.hourly, t = h.time.map((v) => v * 1000);
  const out = { t, n: t.length, fetched: Date.now(), demo: false, metOfficeUntil: null };
  for (const [api, key] of Object.entries(FIELDS)) {
    const a = h[`${api}_ukmo_seamless`], b = h[`${api}_best_match`], plain = h[api];
    out[key] = t.map((_, i) => { const v = a?.[i] ?? b?.[i] ?? plain?.[i]; return v == null ? (DEFAULTS[key] ?? 0) : v; });
  }
  const ukTemp = h.temperature_2m_ukmo_seamless;
  if (ukTemp) { let last = -1; ukTemp.forEach((v, i) => { if (v != null) last = i; }); if (last >= 0) out.metOfficeUntil = t[last]; }
  const byTime = new Map();
  if (s?.hourly) s.hourly.time.forEach((v, i) => byTime.set(v * 1000, i));
  for (const [api, key] of Object.entries(MARINE)) {
    out[key] = t.map((tt) => { const i = byTime.get(tt), v = i == null ? null : s.hourly[api][i]; return v == null ? NaN : v; });
  }
  out.hasSea = out.tide.some(Number.isFinite);
  return out;
}
function demoData() {
  const t0 = floorHour(Date.now()), n = 8 * 24;
  // keyframes: hours from now, then the weather at that moment
  const K = [
    [0, { temp: 12, dd: 4, low: 0, mid: 5, high: 10, precip: 0, snow: 0, code: 0, vis: 30000, wind: 6, dir: 200, gust: 10, wave: .3 }],
    [10, { temp: 7, dd: 3, low: 0, mid: 0, high: 5, code: 0, wind: 4, gust: 8 }],
    [16, { temp: 15, dd: 6, low: 45, mid: 10, code: 2, wind: 13, dir: 230, gust: 21, wave: .6 }],
    [22, { temp: 11, dd: 4, low: 20, code: 1 }],
    [34, { temp: 12, dd: .4, low: 98, mid: 80, high: 20, precip: .4, code: 53, vis: 6000, wind: 17, dir: 190, gust: 26, wave: 1 }],
    [44, { dd: .3, precip: 2.5, code: 63, wind: 28, dir: 210, gust: 41, wave: 2 }],
    [56, { temp: 13, dd: .6, precip: 6, code: 65, vis: 4000, wind: 42, dir: 250, gust: 62, wave: 4 }],
    [66, { dd: 3, low: 50, mid: 40, precip: .8, code: 80, vis: 20000, wind: 25, dir: 290, gust: 38, wave: 2.5 }],
    [76, { temp: 14, dd: 2.5, low: 70, mid: 60, high: 50, precip: 5, code: 95, wind: 22, gust: 45, wave: 1.8 }],
    [84, { temp: 3, dd: 2, low: 5, mid: 0, high: 0, precip: 0, code: 0, wind: 8, dir: 320, gust: 14, wave: .8 }],
    [96, { temp: .5, dd: 1.5, low: 70, mid: 30, precip: .8, snow: .8, code: 85, wind: 15, dir: 340, gust: 26 }],
    [106, { temp: 8, dd: 0, low: 100, mid: 0, precip: 0, snow: 0, code: 45, vis: 250, wind: 3, gust: 6, wave: .3 }],
    [116, { temp: 14, dd: 5, low: 10, high: 70, code: 1, vis: 25000, wind: 9, dir: 180, gust: 16 }],
    [140, { temp: 16, dd: 6, low: 35, high: 20, code: 2, wind: 12 }],
    [200, { temp: 13, dd: 5, low: 20, code: 1 }]
  ];
  const full = []; let cur = {};
  for (const [h, v] of K) { cur = { ...cur, ...v }; full.push([h, { ...cur }]); }
  const out = { t: [], n, fetched: Date.now(), demo: true, hasSea: true, metOfficeUntil: null };
  for (const k of [...NUMERIC, 'dir', 'code']) out[k] = [];
  for (let i = 0; i < n; i++) {
    const h = i; let a = full[0], b = full[full.length - 1];
    for (let j = 0; j < full.length - 1; j++) if (full[j][0] <= h && full[j + 1][0] > h) { a = full[j]; b = full[j + 1]; break; }
    const f = clamp((h - a[0]) / (b[0] - a[0] || 1), 0, 1), v = (k) => lerp(a[1][k], b[1][k], f);
    out.t.push(t0 + i * HOUR);
    out.temp.push(v('temp')); out.dew.push(v('temp') - v('dd')); out.feel.push(v('temp') - v('wind') * .12);
    for (const k of ['precip', 'snow', 'low', 'mid', 'high', 'vis', 'wind', 'gust', 'wave', 'dir']) out[k].push(v(k));
    out.cloud.push(Math.min(100, Math.max(v('low'), v('mid'), v('high') * .6) + v('low') * .2));
    out.prob.push(v('precip') > .05 ? Math.min(100, 55 + v('precip') * 9) : 5);
    out.code.push(a[1].code);
    out.tide.push(2.9 * Math.cos(TAU * (h + 3) / 12.42) * (.72 + .28 * Math.cos(TAU * h / 354)));
  }
  return out;
}
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
function writeCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* storage may be blocked */ } }

/* ---------- sampling ---------- */
function wx(t) {
  const d = DATA, f = clamp((t - d.t[0]) / HOUR, 0, d.n - 1), i = Math.floor(f), j = Math.min(d.n - 1, i + 1), k = f - i;
  // precipitation is the total for the hour ending at its timestamp
  const fp = clamp(f + .5, 0, d.n - 1), ip = Math.floor(fp), jp = Math.min(d.n - 1, ip + 1), kp = fp - ip;
  const o = {};
  for (const key of NUMERIC) {
    const A = d[key];
    o[key] = key === 'precip' || key === 'snow' ? lerp(A[ip], A[jp], kp) : lerp(A[i], A[j], k);
  }
  let dd = d.dir[j] - d.dir[i]; if (dd > 180) dd -= 360; if (dd < -180) dd += 360;
  o.dir = d.dir[i] + dd * k;
  o.code = d.code[kp < .5 ? ip : jp];
  o.lcl = 125 * Math.max(0, o.temp - o.dew);
  return o;
}
const idxOf = (t) => clamp(Math.round((t - DATA.t[0]) / HOUR), 0, DATA.n - 1);
const fogK = (w) => sstep(.6, .92, w.low / 100) * (1 - sstep(250, 520, w.lcl));

function skyKey(e, rising) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= e) i++;
  const a = SKY[i], b = SKY[i + 1], f = smooth(clamp((e - a[0]) / (b[0] - a[0]), 0, 1));
  return { top: mix(a[1], b[1], f), mid: mix(a[2], b[2], f), hor: mix(rising ? a[3] : a[4], rising ? b[3] : b[4], f) };
}
function look(t) {
  const e = sunAlt(t), rising = sunAlt(t + 6e5) > e, w = wx(t);
  const L = sstep(-9, 6, e);
  const oc = sstep(.45, 1, w.cloud / 100) * .9, wet = clamp(w.precip / 2.5, 0, 1), storm = w.code >= 95 ? 1 : 0;
  const s = skyKey(e, rising);
  const darkK = wet * .35 + storm * .3, dark = mix(C.ocTopNight, C.storm, L);
  const sky = {
    top: mix(mix(s.top, mix(C.ocTopNight, C.ocTopDay, L), oc), dark, darkK),
    mid: mix(mix(s.mid, mix(C.ocMidNight, C.ocMidDay, L), oc), dark, darkK),
    hor: mix(mix(s.hor, mix(C.ocHorNight, C.ocHorDay, L), oc * .85), dark, darkK * .8)
  };
  const g = (1 - sstep(0, 11, Math.abs(e - 1.5))) * (1 - oc * .75);
  // higher cloud keeps the light after the sun has set
  const cloudCol = (lift, rainK) => {
    const el = e + lift, Lc = sstep(-9, 5, el), gc = (1 - sstep(0, 12, Math.abs(el - 1))) * (1 - oc * .6);
    const lit = mix(C.cloudNight, mix(C.cloudDay, skyKey(el, rising).hor, gc * .75), Lc);
    return mix(lit, mix(C.cloudRainNight, C.cloudRainDay, Lc), rainK);
  };
  const ter = (day, night, goldK, hazeK) => {
    let c = mix(night, day, L);
    c = mix(c, C.gold, g * goldK);
    c = mix(c, C.grey, oc * .3 * L);
    c = mix(c, sky.hor, hazeK);
    return mix(c, C.black, wet * .14);
  };
  let sea = mix(C.seaNight, mix(C.seaDay, C.seaGrey, oc * .8), L);
  sea = mix(sea, sky.hor, .12 + g * .25);
  return {
    t, e, L, g, oc, w, sky, dark: 1 - sstep(-12, -4, e),
    fogA: fogK(w), stratusA: sstep(.62, .92, w.low / 100), midA: sstep(.72, .98, w.mid / 100),
    veilA: Math.pow(clamp((4500 - w.vis) / 4200, 0, 1), 1.2),
    cLow: cloudCol(0, clamp(wet * .8 + storm * .5 + oc * .12, 0, .85)), cMid: cloudCol(2.5, wet * .4), cHigh: cloudCol(5, 0),
    far: ter(C.farDay, C.farNight, .45, .3), mid: ter(C.midDay, C.midNight, .3, .12), near: ter(C.nearDay, C.nearNight, .15, .03),
    sea, sand: mix(C.sandNight, C.sandDay, L), fog: mix(C.fogNight, C.fogDay, L), stone: mix(C.stoneNight, C.stoneDay, L),
    house: mix(C.houseNight, C.houseDay, L), roof: mix(C.roofNight, C.roofDay, L), rock: mix(C.rockNight, C.rockDay, L),
    wheel: mix(C.wheelNight, C.wheelDay, L)
  };
}
const SMOOTHED = ['cLow', 'cMid', 'cHigh', 'far', 'mid', 'near', 'sea', 'sand', 'fog', 'stone', 'house', 'roof', 'rock', 'wheel'];
function buildLook() {
  LT.t0 = G.t0 - 3 * HOUR;
  const n = Math.ceil((G.span + 6 * HOUR) / STEP) + 1;
  const raw = Array.from({ length: n }, (_, i) => look(LT.t0 + i * STEP));
  // blur colours over about an hour and a half at week scale, half that at 48 hours
  const r = G.hours > 72 ? 6 : G.hours > 30 ? 4 : 3, wts = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-Math.pow((k - r) / (r * .55), 2)));
  const avg = (get, rr = r) => (i) => {
    const out = [0, 0, 0]; let sum = 0;
    for (let k = -rr; k <= rr; k++) { const c = get(raw[clamp(i + k, 0, n - 1)]), wt = Math.exp(-Math.pow(k / (rr * .55), 2)); out[0] += c[0] * wt; out[1] += c[1] * wt; out[2] += c[2] * wt; sum += wt; }
    return [out[0] / sum, out[1] / sum, out[2] / sum];
  };
  // the sky gets a wider blur than the land, so twilight reads as a gradient
  const rs = r * 2;
  const num = (key) => (i) => { let v = 0, sum = 0; for (let k = -r; k <= r; k++) { v += raw[clamp(i + k, 0, n - 1)][key] * wts[k + r]; sum += wts[k + r]; } return v / sum; };
  LT.a = raw.map((l, i) => {
    const o = { ...l, sky: { top: avg((q) => q.sky.top, rs)(i), mid: avg((q) => q.sky.mid, rs)(i), hor: avg((q) => q.sky.hor, rs)(i) }, L: num('L')(i), dark: num('dark')(i), oc: num('oc')(i), fogA: num('fogA')(i), stratusA: num('stratusA')(i), midA: num('midA')(i), veilA: num('veilA')(i) };
    for (const key of SMOOTHED) o[key] = avg((q) => q[key])(i);
    return o;
  });
}
const lookT = (t) => LT.a[clamp(Math.round((t - LT.t0) / STEP), 0, LT.a.length - 1)];
const xOf = (t) => (t - G.t0) / G.span * G.W;
const tOf = (x) => G.t0 + x / G.W * G.span;
const lookX = (x) => lookT(tOf(x));
function skyX(x) {
  // sky strips interpolate between samples, or the 15-minute steps show as bands
  const f = clamp((tOf(x) - LT.t0) / STEP, 0, LT.a.length - 1), i = Math.floor(f), j = Math.min(LT.a.length - 1, i + 1), k = f - i;
  const a = LT.a[i].sky, b = LT.a[j].sky;
  return { top: mix(a.top, b.top, k), mid: mix(a.mid, b.mid, k), hor: mix(a.hor, b.hor, k) };
}
const yAlt = (m) => G.yS - m * G.k;
function lowBaseY(w) {
  const m = clamp(w.lcl, 120, 2200);
  return yAlt(m <= 600 ? m : 600 + (m - 600) * .33);
}
const tideAt = (m) => G.yM - clamp(Number.isFinite(m) ? m : 0, -4.5, 4.5) * G.tPx;
const tideY = (l) => tideAt(l.w.tide);

/* ---------- drawing helpers ---------- */
let DPR = 1;
function shadow(c, blur, dy, a) { c.shadowColor = `rgba(8,6,14,${a})`; c.shadowBlur = blur * DPR; c.shadowOffsetX = 0; c.shadowOffsetY = dy * DPR; }
function noShadow(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; }
function hGrad(c, fn) {
  const g = c.createLinearGradient(0, 0, G.W, 0), n = Math.min(420, Math.ceil(G.span / (30 * 60e3)));
  for (let i = 0; i <= n; i++) g.addColorStop(i / n, fn(lookX(i / n * G.W)));
  return g;
}
function jCircle(R, cx, cy, r) {
  const n = Math.max(12, Math.round(r * 1.2)), p = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = r * (1 + (R() - .5) * .08); p.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  return p;
}
function jRect(R, x, y, w, h) {
  const p = [], j = () => (R() - .5) * 1.1;
  for (let u = 0; u < w; u += 5) p.push(x + u, y + j());
  for (let v = 0; v < h; v += 5) p.push(x + w + j(), y + v);
  for (let u = w; u > 0; u -= 5) p.push(x + u, y + h + j());
  for (let v = h; v > 0; v -= 5) p.push(x + j(), y + v);
  return p;
}
function cloudShape(R, w, h) {
  const polys = [], n = Math.max(3, Math.round(w / 15));
  for (let i = 0; i < n; i++) {
    const u = (i + .5) / n, r = h * (.3 + .52 * Math.pow(Math.sin(Math.PI * u), 1.4)) * (.8 + R() * .38);
    polys.push(jCircle(R, (u - .5) * w * .9, -r * .45, r));
  }
  polys.push(jRect(R, -w * .47, -h * .3, w * .94, h * .3));
  return polys;
}
function drawCloud(c, s, x, y, k, ky, col) {
  c.save();
  c.translate(x, y); c.scale(k, k * ky);
  c.beginPath();
  for (const p of s.shape) { c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  shadow(c, 7, 2.5, .3); c.fillStyle = rgba(col); c.fill();
  noShadow(c); c.clip();
  c.fillStyle = 'rgba(10,12,30,.09)'; c.fillRect(-s.w, -s.h * .2, s.w * 2, s.h);
  c.restore();
}
function sheet(c, topFn, botFn, colourFn, seed) {
  const R = mulberry(seed), W = G.W, top = [];
  let arch = 0, width = 18 + R() * 16, height = 4 + R() * 6;
  for (let x = -8; x <= W + 8; x += 3) {
    arch += 3; if (arch > width) { arch = 0; width = (16 + R() * 18) * G.sc; height = (3 + R() * 7) * G.sc; }
    top.push([x, topFn(x) - Math.sin(Math.PI * arch / width) * height + (R() - .5) * 1.2]);
  }
  c.beginPath(); c.moveTo(top[0][0], top[0][1]);
  for (const [x, y] of top) c.lineTo(x, y);
  for (let x = W + 8; x >= -8; x -= 4) c.lineTo(x, botFn(x) + Math.sin(x / 17 + seed * 2) * 2.2 + (R() - .5) * 1.2);
  c.closePath();
  shadow(c, 7, 2, .22); c.fillStyle = hGrad(c, colourFn); c.fill(); noShadow(c);
}

/* ---------- layout ---------- */
function layout() {
  DPR = Math.min(2, devicePixelRatio || 1);
  const Wv = stage.clientWidth, H = stage.clientHeight;
  G.t0 = floorHour(Date.now());
  const available = Math.floor((DATA.t[DATA.n - 1] - G.t0) / HOUR);
  G.hours = clamp(state.hours, 12, available);
  G.span = G.hours * HOUR;
  G.W = Math.max(Wv, Math.ceil(G.hours * 7));
  G.H = H; G.R = clamp(Math.round(H * .17), 104, 124); G.Hs = H - G.R;
  G.sc = clamp(G.Hs / 650, .72, 1.3);
  G.yS = Math.round(G.Hs * .75); G.k = G.Hs * .3 / 621;
  G.tPx = G.Hs * .016; G.yM = G.yS + 3.7 * G.tPx;
  G.colW = G.W / G.hours;
  inner.style.width = G.W + 'px';
  for (const cv of [sceneCv, fxCv]) {
    cv.width = Math.round(G.W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = G.W + 'px'; cv.style.height = H + 'px';
  }
  state.cursor = clamp(state.cursor, 0, G.hours);
}
function buildSlots() {
  const R = mulberry(20260924), s = G.sc, Hs = G.Hs;
  const make = (gap, wMin, wMax, hMin, hMax, yMin, yMax, lens) => {
    const out = []; let x = -R() * gap;
    while (x < G.W + gap) {
      const w = (wMin + R() * (wMax - wMin)) * s, h = (hMin + R() * (hMax - hMin)) * s;
      out.push({ x, w, h, y: yMin + R() * (yMax - yMin), th: R(), dy: R() - .5, shape: lens ? null : cloudShape(R, w, h) });
      x += gap * (.55 + R() * .8) * s;
    }
    return out;
  };
  SLOTS.high = make(85, 70, 170, 2.5, 5, Hs * .07, Hs * .2, true);
  SLOTS.mid = make(52, 34, 78, 11, 19, Hs * .22, Hs * .33, false);
  SLOTS.low = make(40, 44, 110, 20, 36, 0, 0, false);
}

/* ---------- the scene ---------- */
function paintSky(c) {
  const bottom = G.yS + 40;
  for (let x = 0; x < G.W; x += 2) {
    const k = skyX(x + 1), g = c.createLinearGradient(0, 0, 0, bottom);
    g.addColorStop(0, rgba(k.top)); g.addColorStop(.58, rgba(k.mid)); g.addColorStop(1, rgba(k.hor));
    c.fillStyle = g; c.fillRect(x, 0, 2.6, bottom);
  }
}
function paintTwilight(c) {
  // dawn and dusk as soft warm glows on the horizon, since at week scale they last only a few pixels
  const rx = clamp(G.colW * 2.4, 34, 240), ry = G.Hs * .42;
  let prev = sunAlt(tOf(0));
  for (let x = 2; x <= G.W; x += 2) {
    const e = sunAlt(tOf(x));
    if ((prev < -1) !== (e < -1)) {
      const rising = e > prev, l = lookX(x), a = .6 * (1 - l.oc * .85);
      if (a > .04) {
        const col = rising ? [255, 176, 160] : [255, 150, 86];
        c.save(); c.translate(x, G.yS); c.scale(1, ry / rx);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, rgba(col, a)); g.addColorStop(.45, rgba(col, a * .45)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx);
        c.restore();
      }
    }
    prev = e;
  }
}
function paintStars(c) {
  const R = mulberry(7), n = Math.round(G.W * G.yS / 700);
  for (let i = 0; i < n; i++) {
    const x = R() * G.W, y = Math.pow(R(), 1.25) * G.yS * .9, r = .45 + Math.pow(R(), 4) * 1.6, tw = R();
    const l = lookX(x), a = l.dark * (1 - l.w.cloud / 100) * (.3 + .7 * tw);
    if (a < .03) continue;
    c.fillStyle = `rgba(255,248,230,${a.toFixed(3)})`;
    if (r > 1.5) {
      c.beginPath(); c.moveTo(x, y - r * 2.2); c.lineTo(x + r * .45, y); c.lineTo(x, y + r * 2.2); c.lineTo(x - r * .45, y); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - r * 2.2, y); c.lineTo(x, y + r * .45); c.lineTo(x + r * 2.2, y); c.lineTo(x, y - r * .45); c.closePath(); c.fill();
    } else c.fillRect(x, y, r, r);
  }
}
function paperSun(c, x, y, r, a) {
  if (a < .05) return;
  c.save(); c.globalAlpha = a;
  const halo = c.createRadialGradient(x, y, r, x, y, r * 5);
  halo.addColorStop(0, 'rgba(255,214,150,.35)'); halo.addColorStop(1, 'rgba(255,214,150,0)');
  c.fillStyle = halo; c.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  shadow(c, 4, 1.5, .25);
  c.beginPath();
  for (let i = 0; i < 44; i++) { const ang = i / 44 * TAU, rr = i % 2 ? r * 1.13 : r * 1.42; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
  c.closePath(); c.fillStyle = '#e4873a'; c.fill();
  noShadow(c);
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#f1b04f'; c.fill();
  c.beginPath(); c.arc(x, y, r * .62, 0, TAU); c.fillStyle = '#f7c86a'; c.fill();
  c.restore();
}
function paperMoon(c, x, y, r, disc, a) {
  if (a < .05) return;
  c.save(); c.globalAlpha = a;
  const glow = c.createRadialGradient(x, y, r, x, y, r * 4.5);
  glow.addColorStop(0, `rgba(214,224,255,${(.08 + .16 * disc.fraction).toFixed(3)})`); glow.addColorStop(1, 'rgba(214,224,255,0)');
  c.fillStyle = glow; c.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = 'rgba(240,234,214,.13)'; c.fill();
  // cut with the lit limb to the right, then turn it to where the bright limb points in the sky
  const k = 1 - 2 * disc.fraction, chi = disc.limb;
  c.translate(x, y); c.rotate(Math.atan2(-Math.cos(chi), -Math.sin(chi)));
  c.beginPath();
  c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  c.ellipse(0, 0, Math.max(.01, r * Math.abs(k)), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  shadow(c, 3, 1, .3); c.fillStyle = '#f2ebd6'; c.fill();
  c.restore();
}
function paintSunMoon(c) {
  // one fixed scale for sun and moon: 0 to 66 degrees, the most the moon can reach at this latitude
  const r = clamp(G.colW * 1.8, 14, 26) * G.sc, top = r * 1.5 + 8, base = G.yS - 6, yE = (e) => base - clamp(e, 0, 66) / 66 * (base - top);
  const xs = [], se = [], me = [];
  for (let x = 0; x <= G.W; x += 2) { const t = tOf(x); xs.push(x); se.push(sunAlt(t)); me.push(moonAlt(t)); }
  const path = (arr, style, dash) => {
    c.save(); c.setLineDash(dash); c.lineWidth = 1.2; c.strokeStyle = style; c.beginPath();
    let on = false;
    arr.forEach((e, i) => { if (e > .3) { const y = yE(e); if (on) c.lineTo(xs[i], y); else c.moveTo(xs[i], y); on = true; } else on = false; });
    c.stroke(); c.restore();
  };
  path(se, 'rgba(255,236,196,.5)', [1.2, 5]);
  path(me, 'rgba(214,224,255,.34)', [1, 6]);
  const peaks = (arr) => { const out = []; for (let i = 1; i < arr.length - 1; i++) if (arr[i] > 3 && arr[i] >= arr[i - 1] && arr[i] > arr[i + 1]) out.push(i); return out; };
  for (const i of peaks(se)) {
    const x = xs[i], l = lookX(x);
    if (x > r * 1.6 && x < G.W - r * 1.6) paperSun(c, x, yE(se[i]), r, 1 - l.oc * .8);
  }
  for (const i of peaks(me)) {
    const x = xs[i], l = lookX(x);
    if (x > r * 1.6 && x < G.W - r * 1.6) paperMoon(c, x, yE(me[i]), r * .82, moonDisc(tOf(x)), (1 - l.oc * .8) * (l.e < -3 ? 1 : .5));
  }
}
function paintFarSea(c) {
  // the open sea at the horizon, behind the island, so a low tide never uncovers bare canvas
  c.fillStyle = hGrad(c, (l) => rgba(mix(l.sea, l.sky.hor, .3)));
  c.fillRect(0, G.yS - 3, G.W, G.Hs - G.yS + 3);
  c.fillStyle = hGrad(c, (l) => rgba(l.sky.hor, .55 * l.L));
  c.fillRect(0, G.yS - 3, G.W, 1.2);
}
function paintHighCloud(c) {
  for (const s of SLOTS.high) {
    const l = lookX(s.x), hc = l.w.high / 100;
    if (hc < s.th * .9 + .06) continue;
    c.fillStyle = rgba(l.cHigh, clamp(.22 + hc * .5, 0, .72));
    for (const [dx, dy, k] of [[0, 0, 1], [s.w * .18, s.h * 2.4, .6]]) {
      const x = s.x + dx, y = s.y + dy, w = s.w * k, h = s.h * k;
      c.beginPath(); c.moveTo(x - w / 2, y);
      c.quadraticCurveTo(x - w * .1, y - h * 1.3, x + w / 2, y - h * .2);
      c.quadraticCurveTo(x, y + h * .6, x - w / 2, y);
      c.fill();
    }
  }
}
function paintMidCloud(c) {
  const top = G.Hs * .2, bot = G.Hs * .3;
  sheet(c, () => top, () => bot, (l) => rgba(l.cMid, .85 * l.midA), 3);
  for (const s of SLOTS.mid) {
    const l = lookX(s.x), mc = l.w.mid / 100;
    if (mc < s.th * .9 + .05) continue;
    drawCloud(c, s, s.x, s.y, .72 + mc * .4, 1, l.cMid);
  }
}
function ridgePoints(key, lift, scale, seed) {
  const h = PROFILE[key], N = h.length, R = mulberry(seed), pts = [];
  let px = null, py = null;
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1) * G.W, y = h[i] > 0 ? G.yS - lift * G.sc - h[i] * G.k * scale : G.yS + 4;
    if (px !== null) {
      const steps = Math.max(1, Math.round((x - px) / 4));
      for (let s = 1; s < steps; s++) { const u = s / steps; pts.push([lerp(px, x, u), lerp(py, y, u) + (R() - .5) * .8]); }
    }
    pts.push([x, y + (R() - .5) * .5]); px = x; py = y;
  }
  return pts;
}
function heightAt(key, x, lift, scale) {
  const h = PROFILE[key], f = clamp(x / G.W * (h.length - 1), 0, h.length - 1), i = Math.floor(f), j = Math.min(h.length - 1, i + 1);
  return G.yS - lift * G.sc - lerp(h[i], h[j], f - i) * G.k * scale;
}
const LAYERS = [['far', 9, 1, 31], ['mid', 4, 1, 32], ['near', -2, .94, 33]];
function paintLand(c, key, lift, scale, seed) {
  const pts = ridgePoints(key, lift, scale, seed);
  c.beginPath(); c.moveTo(-6, G.yS + 4);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(G.W + 6, G.yS + 4); c.closePath();
  shadow(c, 9, 3, .32); c.fillStyle = hGrad(c, (l) => rgba(l[key])); c.fill(); noShadow(c);
  c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.lineWidth = 1; c.strokeStyle = hGrad(c, (l) => `rgba(255,244,222,${(.05 + .2 * l.L * (1 - l.oc * .6)).toFixed(3)})`); c.stroke();
}
function paintHillFog(c) {
  sheet(c,
    (x) => yAlt(Math.min(lookX(x).w.lcl, 520) + 260),
    (x) => yAlt(Math.max(Math.min(lookX(x).w.lcl, 520), 30)),
    (l) => rgba(l.fog, .9 * l.fogA), 11);
}
function paintLowCloud(c) {
  sheet(c,
    (x) => lowBaseY(lookX(x).w) - (26 + 12 * lookX(x).w.low / 100) * G.sc,
    (x) => lowBaseY(lookX(x).w) + 5,
    (l) => rgba(l.cLow, .96 * l.stratusA), 5);
  for (const s of SLOTS.low) {
    const l = lookX(s.x), lc = l.w.low / 100;
    if (lc < s.th * .92 + .04) continue;
    drawCloud(c, s, s.x, lowBaseY(l.w) + s.dy * 10 * G.sc, .68 + lc * .45, 1 + convective(l.w.code) * .9, l.cLow);
  }
}
const xLat = (lat) => (lat - PROFILE.latSouth) / (PROFILE.latNorth - PROFILE.latSouth) * G.W;
function paintShore(c) {
  const far = PROFILE.far, N = far.length, R = mulberry(41), runs = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const land = i < N && far[i] > 0;
    if (land && start < 0) start = i;
    if (!land && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  const top = G.yS + 1, bot = G.yM + 5 * G.tPx;
  c.fillStyle = hGrad(c, (l) => rgba(l.sand));
  shadow(c, 5, 1.5, .25);
  for (const [a, b] of runs) {
    const x0 = a / (N - 1) * G.W, x1 = b / (N - 1) * G.W;
    if (x1 - x0 < 4) continue;
    c.beginPath(); c.moveTo(x0 - 5, bot); c.lineTo(x0 + 2, top + 2);
    for (let x = x0 + 4; x < x1 - 2; x += 5) c.lineTo(x, top + (R() - .5) * 1.4);
    c.lineTo(x1 + 5, bot); c.closePath(); c.fill();
  }
  noShadow(c);
}
function paintLandmarks(c) {
  const s = G.sc;
  // Douglas promenade: a terrace of white-fronted hotels
  const R = mulberry(51), x0 = xLat(54.1465), x1 = xLat(54.172);
  shadow(c, 3, 1, .3);
  for (let x = x0; x < x1;) {
    const w = (5 + R() * 3.5) * s, h = (7 + R() * 7) * s, l = lookX(x + w / 2), base = G.yS + 2;
    c.fillStyle = rgba(l.house); c.fillRect(x, base - h, w, h);
    c.fillStyle = rgba(l.roof); c.beginPath(); c.moveTo(x - .6, base - h); c.lineTo(x + w / 2, base - h - w * .45); c.lineTo(x + w + .6, base - h); c.closePath(); c.fill();
    if (l.L < .4) {
      c.fillStyle = `rgba(255,208,120,${(.95 - l.L).toFixed(2)})`;
      for (let wy = base - h + 2.5 * s; wy < base - 2 * s; wy += 3.4 * s) if (R() < .7) c.fillRect(x + w * .3, wy, Math.max(1, w * .35), 1.4 * s);
    }
    x += w + .4;
  }
  // the Laxey Wheel on its white tower
  const lx = xLat(54.2325), ly = heightAt('near', lx, -2, .94) + 5 * s, lw = lookX(lx), wr = 6.5 * s;
  c.fillStyle = rgba(lw.stone); c.fillRect(lx - 2.4 * s, ly - wr, 4.8 * s, wr + 6 * s);
  c.strokeStyle = rgba(lw.wheel); c.lineWidth = 1.6 * s;
  c.beginPath(); c.arc(lx, ly - wr, wr, 0, TAU); c.stroke();
  c.lineWidth = .7 * s;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; c.beginPath(); c.moveTo(lx - Math.cos(a) * wr, ly - wr - Math.sin(a) * wr); c.lineTo(lx + Math.cos(a) * wr, ly - wr + Math.sin(a) * wr); c.stroke(); }
  noShadow(c);
  paintLighthouses(c, false);
}
/* The island's Northern Lighthouse Board lights. Positions, tower heights, daymarks and characters are from
   the NLB and Wikipedia/Wikidata lists (checked 24 September 2026). base is the tower's foot above the sea in
   metres; group and period are the character, so Fl(3) W 30s is group 3, period 30. The Calf of Man's lights
   are disused and left out. */
const LIGHTS = [
  { name: 'Chicken Rock', lat: 54.03785, tower: 44, base: 0, sea: true, look: 'granite', group: 1, period: 5 },
  { name: 'Langness', lat: 54.05488, tower: 19, base: 4, look: 'white', group: 2, period: 30, cottage: true },
  { name: 'Thousla Rock', lat: 54.06216, tower: 8, base: 0, sea: true, look: 'beacon', group: 1, period: 3, red: true },
  { name: 'Douglas Head', lat: 54.14343, tower: 20, base: 12, look: 'white', group: 1, period: 10 },
  { name: 'Maughold Head', lat: 54.29575, tower: 23, base: 42, look: 'ochre', group: 3, period: 30, cottage: true },
  { name: 'Point of Ayre', lat: 54.41575, tower: 30, base: 2, look: 'bands', group: 4, period: 20 }
];
function paintLighthouses(c, atSea) {
  const s = G.sc;
  for (const lh of LIGHTS) {
    if (!!lh.sea !== atSea) continue;
    const x = clamp(xLat(lh.lat), 12 * s, G.W - 12 * s), l = lookX(x);
    const h = (9 + lh.tower * .33) * s, wb = Math.max(4, h * .27), wt = lh.look === 'beacon' ? wb * .9 : wb * .72;
    const base = atSea ? G.yM - 1.5 * s : G.yS - lh.base * G.k, low = G.yM + 3.2 * G.tPx;
    shadow(c, 4, 1.5, .3);
    // footing: a sea rock uncovered at low water, or the headland the tower stands on
    c.fillStyle = rgba(atSea ? l.rock : l.near);
    c.beginPath();
    if (atSea) { c.moveTo(x - wb * 2.1, low); c.lineTo(x - wb * 1.3, base + s); c.lineTo(x + wb * .2, base - s); c.lineTo(x + wb * 1.3, base); c.lineTo(x + wb * 2.2, low); }
    else { c.moveTo(x - wb * 3.2, G.yS + 6); c.lineTo(x - wb * 1.5, base); c.lineTo(x + wb * 1.8, base); c.lineTo(x + wb * 3.4, G.yS + 6); }
    c.closePath(); c.fill();
    if (lh.cottage) {
      const cx = x + wb * .9, cw = wb * 2, ch = h * .26;
      c.fillStyle = rgba(l.house); c.fillRect(cx, base - ch, cw, ch);
      c.fillStyle = rgba(l.roof); c.beginPath(); c.moveTo(cx - .5, base - ch); c.lineTo(cx + cw / 2, base - ch - cw * .3); c.lineTo(cx + cw + .5, base - ch); c.closePath(); c.fill();
    }
    const top = base - h, body = lh.look === 'granite' ? mix(C.graniteNight, C.graniteDay, l.L) : l.house;
    c.fillStyle = rgba(body);
    c.beginPath(); c.moveTo(x - wb / 2, base); c.lineTo(x - wt / 2, top); c.lineTo(x + wt / 2, top); c.lineTo(x + wb / 2, base); c.closePath(); c.fill();
    noShadow(c);
    const band = (f0, f1, col) => { const w = lerp(wb, wt, (f0 + f1) / 2); c.fillStyle = rgba(col); c.fillRect(x - w / 2, base - h * f1, w, h * (f1 - f0)); };
    if (lh.look === 'bands') { band(.3, .44, mix(C.wheelNight, C.wheelDay, l.L)); band(.62, .76, mix(C.wheelNight, C.wheelDay, l.L)); }
    if (lh.look === 'ochre') band(.9, 1, mix(C.lanternNight, C.ochre, l.L));
    const lanH = Math.max(3.2 * s, h * .17), lanW = wt * .82, lantern = mix(C.lanternNight, C.lanternDay, l.L);
    c.fillStyle = rgba(lantern);
    c.fillRect(x - wt * .64, top - 1.2 * s, wt * 1.28, 1.4 * s);
    c.fillRect(x - lanW / 2, top - lanH, lanW, lanH - s);
    c.beginPath(); c.arc(x, top - lanH, lanW / 2, Math.PI, TAU); c.fill();
    G.lamps.push({ x, y: top - lanH * .55, group: lh.group, period: lh.period, red: !!lh.red, on: l.L < .45, fog: l.veilA, phase: (lh.lat * 997) % lh.period });
  }
}
function paintTower(c) {
  // Tower of Refuge on Conister Rock, Douglas Bay
  const s = G.sc, x = xLat(54.1505) + 6 * s, l = lookX(x), base = G.yM + .6 * G.tPx;
  shadow(c, 4, 1.5, .3);
  c.fillStyle = rgba(l.rock); c.beginPath(); c.moveTo(x - 13 * s, base + 4 * s); c.lineTo(x - 8 * s, base - 2 * s); c.lineTo(x + 7 * s, base - 3 * s); c.lineTo(x + 14 * s, base + 4 * s); c.closePath(); c.fill();
  c.fillStyle = rgba(l.stone);
  c.fillRect(x - 6 * s, base - 13 * s, 12 * s, 11 * s);
  for (let i = 0; i < 4; i++) c.fillRect(x - 6 * s + i * 3.4 * s, base - 15 * s, 1.9 * s, 2.2 * s);
  c.fillRect(x + 2.4 * s, base - 19 * s, 4.2 * s, 7 * s);
  c.fillRect(x + 2 * s, base - 20.5 * s, 1.4 * s, 1.8 * s); c.fillRect(x + 5.4 * s, base - 20.5 * s, 1.4 * s, 1.8 * s);
  noShadow(c);
  paintLighthouses(c, true);
}
function paintSea(c) {
  const offs = [0, .22, .48, .76];
  offs.forEach((o, j) => {
    const lam = (24 + j * 15) * G.sc, ph = j * 1.9, ampK = (.5 + j * .5) * G.sc;
    const amp = (l) => (.7 + clamp(Number.isFinite(l.w.wave) ? l.w.wave : .4, .1, 6) * 1.25) * ampK;
    c.beginPath(); c.moveTo(-6, G.Hs + 6);
    // strips close up towards low water, so the sea never runs out of depth
    const top = (l) => { const y = tideY(l); return y + o * (G.Hs - y); };
    for (let x = -6; x <= G.W + 6; x += 3) { const l = lookX(x); c.lineTo(x, top(l) + amp(l) * Math.sin(x / lam * TAU + ph)); }
    c.lineTo(G.W + 6, G.Hs + 6); c.closePath();
    shadow(c, 6, -1.5, .3); c.fillStyle = hGrad(c, (l) => rgba(mix(l.sea, C.black, j * .09))); c.fill(); noShadow(c);
    for (let n = Math.floor(-G.W / lam) - 1; ; n++) {
      const x = (Math.PI / 2 + n * TAU - ph) / TAU * lam;
      if (x > G.W) break;
      if (x < 0) continue;
      const l = lookX(x), p = clamp((l.w.wind - 11) / 26, 0, .85);
      if (hash(n, j) >= p) continue;
      const y = top(l) - amp(l);
      c.fillStyle = `rgba(250,250,244,${(.55 + .4 * l.L).toFixed(2)})`;
      c.beginPath(); c.ellipse(x, y + 1.2, (3 + j * 1.6) * G.sc, (1.1 + j * .45) * G.sc, 0, Math.PI, TAU); c.fill();
    }
    if (j === 0) paintTower(c);
  });
}
function paintVeil(c) {
  const g = hGrad(c, (l) => rgba(l.fog, .6 * l.veilA));
  c.fillStyle = g;
  for (let i = 0; i < 8; i++) {
    const y = lerp(G.Hs * .25, G.yS + 10, i / 7);
    c.globalAlpha = .07 + i * .035; c.fillRect(0, y, G.W, G.Hs - y);
  }
  c.globalAlpha = 1;
}
const GRAIN = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 160;
  const x = cv.getContext('2d'), im = x.createImageData(160, 160), R = mulberry(99);
  for (let i = 0; i < im.data.length; i += 4) { const v = 222 + R() * 33; im.data[i] = v; im.data[i + 1] = v - 3; im.data[i + 2] = v - 10; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  return cv;
})();
function paintGrain(c, y, h) {
  c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = .45;
  c.fillStyle = c.createPattern(GRAIN, 'repeat'); c.fillRect(0, y, G.W, h);
  c.restore();
}

/* ---------- the ruler ---------- */
function hourMarks() {
  const out = [];
  for (let i = 0; i <= G.hours; i++) {
    const t = G.t0 + i * HOUR, p = Object.fromEntries(fmtParts.formatToParts(t).map((o) => [o.type, o.value]));
    out.push({ t, hour: +p.hour, weekday: p.weekday, day: +p.day, month: p.month, key: `${p.weekday} ${p.day}` });
  }
  return out;
}
function daySegments(hm) {
  const segs = [];
  for (let i = 0; i < hm.length - 1; i++) {
    if (!segs.length || segs[segs.length - 1].key !== hm[i].key) segs.push({ key: hm[i].key, weekday: hm[i].weekday, day: hm[i].day, month: hm[i].month, a: i, b: i });
    segs[segs.length - 1].b = i;
  }
  return segs;
}
const font = (w, s, fam = 'Newsreader') => `${w} ${s}px "${fam}", Georgia, serif`;
function arrow(c, x, y, from, len, col) {
  const b = (from + 180) * RAD, dx = Math.sin(b), dy = -Math.cos(b);
  const x2 = x + dx * len / 2, y2 = y + dy * len / 2;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x - dx * len / 2, y - dy * len / 2); c.lineTo(x2 - dx * 3, y2 - dy * 3); c.stroke();
  c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - dx * 5 - dy * 3.2, y2 - dy * 5 + dx * 3.2); c.lineTo(x2 - dx * 5 + dy * 3.2, y2 - dy * 5 - dx * 3.2); c.closePath(); c.fill();
}
function paintRuler(c, hm, segs) {
  const css = getComputedStyle(document.documentElement), v = (n) => hex(css.getPropertyValue(n).trim());
  const tape = v('--tape'), ink = v('--ink'), soft = v('--ink-soft');
  const y0 = G.Hs, W = G.W, cw = G.colW, R = mulberry(5);
  c.save(); shadow(c, 10, -2, .45);
  c.beginPath(); c.moveTo(-4, y0 + 2);
  for (let x = 0; x <= W + 4; x += 4) c.lineTo(x, y0 + .5 + R() * 3);
  c.lineTo(W + 4, G.H + 4); c.lineTo(-4, G.H + 4); c.closePath(); c.fillStyle = rgba(tape); c.fill();
  c.restore();
  for (let i = 0; i < G.hours; i++) {
    const k = sstep(0, -8, sunAlt(G.t0 + (i + .5) * HOUR));
    if (k > .01) { c.fillStyle = rgba(ink, .08 * k); c.fillRect(xOf(G.t0 + i * HOUR), y0 + 4, cw + .7, G.R - 4); }
  }
  // day labels and midnights
  c.textBaseline = 'middle'; c.textAlign = 'center';
  segs.forEach((s, n) => {
    const xa = xOf(hm[s.a].t), xb = xOf(hm[s.b].t + HOUR), w = xb - xa;
    if (n > 0) { c.fillStyle = rgba(ink, .28); c.fillRect(xa, y0 + 5, 1, G.R - 9); }
    const label = n === 0 ? (w > 46 ? 'Today' : '')
      : w > 150 ? `${s.weekday} ${s.day} ${s.month.slice(0, 3)}` : w > 70 ? `${s.weekday.slice(0, 3)} ${s.day}` : w > 22 ? s.weekday.slice(0, 2) : '';
    c.font = font(400, 14, 'IM Fell English SC'); c.fillStyle = rgba(ink);
    if (label) c.fillText(label, clamp(xa + w / 2, xa + 12, xb - 12), y0 + 16);
  });
  // hour ticks
  const tickEvery = cw >= 26 ? 1 : cw * 3 >= 26 ? 3 : 6;
  c.font = font(400, 10.5); c.fillStyle = rgba(soft);
  hm.forEach((m, i) => {
    if (m.hour === 0 || m.hour % tickEvery) return;
    const x = xOf(m.t);
    c.fillRect(x, y0 + 26, 1, 3);
    if (x > 10 && x < W - 44 && cw * tickEvery >= 22 && (tickEvery < 6 || m.hour === 12)) c.fillText(String(m.hour).padStart(2, '0'), x, y0 + 35);
  });
  // temperature ribbon
  const ty = y0 + 42, th = 15, tg = c.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= G.hours; i++) tg.addColorStop(i / G.hours, rgba(tempColour(DATA.temp[idxOf(G.t0 + i * HOUR)])));
  c.save(); shadow(c, 3, 1, .22); c.fillStyle = tg; c.beginPath(); c.roundRect(0, ty, W, th, 3); c.fill(); c.restore();
  c.font = font(600, 11.5); c.fillStyle = '#2a241c';
  const placed = [];
  const tempLabel = (i) => {
    const x = clamp(xOf(G.t0 + i * HOUR), 12, W - 50);
    if (placed.some((p) => Math.abs(p - x) < 26)) return;
    placed.push(x); c.fillText(`${Math.round(DATA.temp[idxOf(G.t0 + i * HOUR)])}°`, x, ty + th / 2 + .5);
  };
  if (cw >= 30) hm.forEach((m, i) => { if (i < G.hours) tempLabel(i); });
  else if (cw * 3 >= 26) hm.forEach((m, i) => { if (m.hour % 3 === 0 && i < G.hours) tempLabel(i); });
  else segs.forEach((s) => {
    if (xOf(hm[s.b].t) - xOf(hm[s.a].t) < 30) return;
    let hi = s.a, lo = s.a;
    for (let i = s.a; i <= s.b; i++) { const t = DATA.temp[idxOf(hm[i].t)]; if (t > DATA.temp[idxOf(hm[hi].t)]) hi = i; if (t < DATA.temp[idxOf(hm[lo].t)]) lo = i; }
    tempLabel(hi); tempLabel(lo);
  });
  // rain bars, one per hour
  const ry = y0 + 62, rh = 20;
  c.fillStyle = rgba(ink, .18); c.fillRect(0, ry + rh, W, 1);
  for (let i = 0; i < G.hours; i++) {
    const j = idxOf(G.t0 + (i + 1) * HOUR), p = DATA.precip[j];
    if (p < .05) continue;
    const hgt = Math.max(1.5, Math.sqrt(Math.min(p, 8) / 8) * rh), snow = DATA.snow[j] > 0;
    c.fillStyle = snow ? `rgba(140,140,215,${(.35 + .0065 * DATA.prob[j]).toFixed(3)})` : `rgba(58,112,176,${(.35 + .0065 * DATA.prob[j]).toFixed(3)})`;
    const bx = xOf(G.t0 + i * HOUR) + cw * .14;
    c.fillRect(bx, ry + rh - hgt, Math.max(1, cw * .72), hgt);
    if (cw >= 40 && p >= .1) {
      c.save(); c.font = font(600, 10); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = hgt > 12 ? 'rgba(255,255,255,.95)' : rgba(ink, .8);
      c.fillText(p < 10 ? p.toFixed(1) : String(Math.round(p)), bx + cw * .36, hgt > 12 ? ry + rh - hgt + 6 : ry + rh - hgt - 5);
      c.restore();
    }
  }
  // wind arrows
  const wy = y0 + 97, every = [1, 2, 3, 6, 12].find((h) => h * cw >= 34) || 12;
  c.textAlign = 'left'; c.font = font(500, 11);
  hm.forEach((m, i) => {
    if (i >= G.hours || m.hour % every) return;
    const x = xOf(m.t), j = idxOf(m.t), sp = DATA.wind[j];
    if (x < 8 || x > W - 46) return;
    const col = sp >= 39 ? '#c8102e' : sp >= 25 ? '#c9811d' : rgba(sp >= 13 ? ink : soft);
    arrow(c, x - 5, wy, DATA.dir[j], 13, col);
    c.fillStyle = col; c.fillText(String(Math.round(sp)), x + 4, wy + .5);
  });
  // units, on a scrap of tape at the right-hand end
  const ux = W - 34;
  c.fillStyle = rgba(tape, .92); c.fillRect(ux, ty - 2, 34, G.R - (ty - y0));
  c.textAlign = 'center'; c.fillStyle = rgba(soft); c.font = font(400, 11, 'IM Fell English SC');
  c.fillText('°c', ux + 17, ty + th / 2); c.fillText('mm', ux + 17, ry + rh / 2 + 2); c.fillText('mph', ux + 17, wy);
  // now
  const xn = xOf(Date.now());
  c.fillStyle = '#c8102e'; c.beginPath(); c.moveTo(xn - 5, y0 + 1); c.lineTo(xn + 5, y0 + 1); c.lineTo(xn, y0 + 8); c.closePath(); c.fill();
  paintGrain(c, y0, G.R);
}

/* ---------- rain, snow, lightning ---------- */
function buildFx() {
  const R = mulberry(61);
  state.fxCols = []; state.storms = [];
  for (let i = 0; i < G.hours; i++) {
    const t = G.t0 + (i + .5) * HOUR, l = lookT(t), w = l.w, x0 = xOf(G.t0 + i * HOUR);
    const top = w.low > 30 ? lowBaseY(w) - 4 : G.Hs * .3, bottom = tideY(l) + 8;
    const lateral = -Math.cos(w.dir * RAD) * clamp(w.wind / 35, 0, 1.4) * .55;
    if (w.precip > .04) {
      const snow = w.snow > .02, n = Math.min(240, Math.round(G.colW * (snow ? .5 + Math.min(w.snow, 3) * 1.6 : .25 + Math.min(w.precip, 8) * .55)));
      const drops = Array.from({ length: n }, () => ({ x: R() * G.colW, ph: R(), sp: .8 + R() * .5, f: 1 + R() * 2, len: (7 + R() * 7) * G.sc }));
      state.fxCols.push({ x0, top, bottom, lateral, snow, drops, L: l.L });
    }
    if (w.code >= 95) state.storms.push({ x0, top, bottom: G.yS + 4, next: R() * 4000, until: 0, bolt: null });
  }
}
function paintFx(now) {
  const c = fx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, G.W, G.H);
  c.lineCap = 'round';
  for (const col of state.fxCols) {
    const span = col.bottom - col.top;
    if (span < 10) continue;
    if (col.snow) {
      c.fillStyle = 'rgba(250,250,255,.92)';
      for (const d of col.drops) {
        const p = (now * .00008 * d.sp + d.ph) % 1, y = col.top + p * span;
        const x = col.x0 + ((d.x + Math.sin(now * .001 * d.f + d.ph * 9) * 3 + p * span * col.lateral * .5) % G.colW + G.colW) % G.colW;
        c.beginPath(); c.arc(x, y, 1.4 * G.sc, 0, TAU); c.fill();
      }
    } else {
      const k = col.L;
      c.strokeStyle = `rgba(${lerp(222, 70, k) | 0},${lerp(230, 88, k) | 0},${lerp(246, 118, k) | 0},.62)`;
      c.lineWidth = 1.1;
      c.beginPath();
      for (const d of col.drops) {
        const p = (now * .0011 * d.sp / (span / 200) + d.ph) % 1, y = col.top + p * span;
        const x = col.x0 + ((d.x + p * span * col.lateral) % G.colW + G.colW) % G.colW;
        c.moveTo(x, y); c.lineTo(x + col.lateral * d.len, y + d.len);
      }
      c.stroke();
    }
  }
  for (const lp of G.lamps) {
    if (!lp.on) continue;
    const I = reduce ? .7 : flashLevel(now / 1000 + lp.phase, lp.group, lp.period), s = G.sc, spread = 1 + lp.fog * 1.5;
    const col = lp.red ? [255, 84, 66] : [255, 244, 214];
    glow(c, lp.x, lp.y, 5 * s, col, .55);
    if (I > .02) {
      glow(c, lp.x, lp.y, (16 + 26 * I) * s * spread, col, .9 * I / Math.sqrt(spread));
      // the beam sweeping past the viewer shows as a flat flare
      c.save(); c.translate(lp.x, lp.y); c.scale(1, .1);
      const r = 90 * s * I * spread, g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(col, .7 * I)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
    }
  }
  for (const s of state.storms) {
    if (reduce) break;
    if (now > s.next) {
      s.until = now + 170; s.next = now + 1800 + Math.random() * 5200;
      const pts = [[s.x0 + G.colW / 2 + (Math.random() - .5) * 20, s.top]];
      while (pts[pts.length - 1][1] < s.bottom) { const [px, py] = pts[pts.length - 1]; pts.push([px + (Math.random() - .5) * 16, py + 8 + Math.random() * 12]); }
      s.bolt = pts;
    }
    if (now < s.until && s.bolt) {
      const cx = s.x0 + G.colW / 2, glow = c.createRadialGradient(cx, s.top, 0, cx, s.top, 160 * G.sc);
      glow.addColorStop(0, 'rgba(255,250,228,.34)'); glow.addColorStop(1, 'rgba(255,250,228,0)');
      c.fillStyle = glow; c.fillRect(cx - 170 * G.sc, 0, 340 * G.sc, G.yS + 30);
      c.save(); c.shadowColor = 'rgba(255,248,210,.9)'; c.shadowBlur = 10 * DPR;
      c.strokeStyle = '#fffbe6'; c.lineWidth = 2; c.beginPath();
      s.bolt.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.restore();
    }
  }
}
function flashLevel(t, group, period) {
  const u = ((t % period) + period) % period;
  let I = 0;
  for (let k = 0; k < group; k++) { const d = (u - k * 2) / .16; I = Math.max(I, Math.exp(-d * d)); }
  return I;
}
function glow(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
let raf = 0;
if (params.has('debug')) window.EV = { paperMoon, moonDisc, sunAlt, moonAlt, G };
function loop(now) { paintFx(now); raf = requestAnimationFrame(loop); }

/* ---------- the tide staff ---------- */
const fmtM = (m) => `${m > .05 ? '+' : m < -.05 ? '\u2212' : ''}${Math.abs(m).toFixed(1)}`;
function buildStaff() {
  const staff = $('staff');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= G.hours; i++) { const v = DATA.tide[idxOf(G.t0 + i * HOUR)]; if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  if (!DATA.hasSea || !Number.isFinite(lo)) { staff.hidden = true; G.staff = null; return; }
  const top = Math.ceil(hi + .05), bot = Math.floor(lo - .05), pad = 7, h = (top - bot) * G.tPx + pad * 2;
  G.staff = { top, bot, pad, y0: tideAt(top) - pad, h };
  const every = G.tPx >= 11 ? 1 : 2;
  let marks = '';
  for (let m = bot; m <= top + 1e-6; m += .5) {
    const y = pad + (top - m) * G.tPx, whole = Math.abs(m - Math.round(m)) < 1e-6;
    marks += `<line x1="0" x2="${whole ? 9 : 5}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    if (whole && (Math.round(m) % every === 0 || m === 0)) marks += `<text x="11" y="${(y + 3.5).toFixed(1)}">${m === 0 ? '0' : fmtM(m).replace('.0', '')}</text>`;
  }
  staff.style.top = `${G.staff.y0}px`; staff.style.height = `${h}px`;
  staff.querySelector('svg').setAttribute('viewBox', `0 0 30 ${h.toFixed(1)}`);
  staff.querySelector('svg').setAttribute('height', h.toFixed(1));
  staff.querySelector('.marks').innerHTML = marks;
}
function placeStaff(x, j) {
  const staff = $('staff');
  if (!G.staff) return;
  const v = DATA.tide[j];
  staff.hidden = !Number.isFinite(v);
  if (staff.hidden) return;
  const flip = x > G.W - 90, level = tideAt(v) - G.staff.y0;
  staff.style.left = `${flip ? x - 33 : x + 3}px`;
  staff.classList.toggle('flip', flip);
  staff.style.setProperty('--level', `${clamp(level, 0, G.staff.h).toFixed(1)}px`);
  $('staff-level').textContent = `${fmtM(v)} m`;
}

/* ---------- the hanging tag ---------- */
function tideNote(i) {
  if (!DATA.hasSea) return '';
  const T = DATA.tide, j0 = idxOf(G.t0 + i * HOUR);
  if (!Number.isFinite(T[j0]) || !Number.isFinite(T[j0 + 1])) return '';
  const rising = T[j0 + 1] > T[j0];
  for (let j = j0 + 1; j < DATA.n - 1; j++) {
    const a = T[j - 1], b = T[j], cc = T[j + 1];
    if (![a, b, cc].every(Number.isFinite)) break;
    if ((b >= a && b > cc) || (b <= a && b < cc)) {
      const den = a - 2 * b + cc, off = den ? .5 * (a - cc) / den : 0;
      const when = Math.round((DATA.t[j] + off * HOUR) / 9e5) * 9e5;
      return `tide ${fmtM(T[j0])} m ${rising ? 'rising' : 'falling'}, ${b > a ? 'high' : 'low'} water around ${fmtTime.format(when)}`;
    }
  }
  return `tide ${fmtM(T[j0])} m, ${rising ? 'rising' : 'falling'}`;
}
function describe(w, L) {
  const e = CODES[Math.round(w.code)] || ['Unsettled'];
  let s = L > .5 && e[1] ? e[1] : e[0];
  if (fogK(w) > .5 && w.code < 45) s += ', hill fog';
  if (w.wind >= 19) s += `, ${beaufort(w.wind)}`;
  return s;
}
function setCursor(i, scroll) {
  if (!DATA) return;
  i = clamp(Math.round(i), 0, G.hours);
  state.cursor = i;
  const t = G.t0 + i * HOUR, x = xOf(t), j = idxOf(t), l = lookT(t), w = l.w;
  const thread = $('thread'), tag = $('tag'), col = $('col');
  thread.hidden = tag.hidden = col.hidden = false;
  thread.style.left = `${x}px`; thread.style.height = `${G.Hs}px`;
  Object.assign(col.style, { left: `${x}px`, top: `${G.Hs + 4}px`, width: `${Math.max(2, G.colW)}px`, height: `${G.R - 4}px` });
  const p = Object.fromEntries(fmtParts.formatToParts(t).map((o) => [o.type, o.value]));
  $('t-when').textContent = `${i === 0 ? 'Now · ' : ''}${p.weekday} ${p.day} ${p.month} · ${p.hour}:00`;
  $('t-what').textContent = describe({ ...w, temp: DATA.temp[j], dew: DATA.dew[j], code: DATA.code[j], wind: DATA.wind[j] }, l.L);
  $('t-temp').textContent = String(Math.round(DATA.temp[j]));
  const feel = Math.round(DATA.feel[j]);
  $('t-feel').textContent = Math.abs(feel - DATA.temp[j]) >= 1.5 ? `feels ${feel}°` : '';
  const gust = DATA.gust[j], sp = DATA.wind[j];
  $('t-wind').textContent = `${compass(DATA.dir[j])} ${Math.round(sp)} mph${gust - sp >= 8 ? `, gusts ${Math.round(gust)}` : ''}`;
  const jn = Math.min(DATA.n - 1, j + 1), pr = DATA.precip[jn], snow = DATA.snow[jn], prob = Math.round(DATA.prob[jn]);
  $('t-rain').textContent = snow > .02 ? `${snow.toFixed(1)} cm of snow, ${prob}%` : pr >= .05 ? `${pr.toFixed(1)} mm in the hour, ${prob}%` : `dry, ${prob}% chance`;
  const lcl = 125 * Math.max(0, DATA.temp[j] - DATA.dew[j]), vis = DATA.vis[j];
  let cloud = `${Math.round(DATA.cloud[j])}%`;
  if (DATA.low[j] > 50) cloud += `, base about ${Math.max(50, Math.round(lcl / 50) * 50)} m`;
  if (vis < 5000) cloud += `, visibility ${vis < 1000 ? `${Math.round(vis / 50) * 50} m` : `${(vis / 1000).toFixed(1)} km`}`;
  $('t-cloud').textContent = cloud;
  const wave = DATA.wave[j];
  $('t-sea').textContent = [Number.isFinite(wave) ? `waves ${wave.toFixed(1)} m` : '', tideNote(i)].filter(Boolean).join(', ') || 'no sea data';
  placeStaff(x, j);
  const tw = tag.offsetWidth || 236, left = clamp(x - tw / 2, 6, G.W - tw - 6);
  tag.style.left = `${left}px`;
  tag.style.transform = `rotate(${clamp((x - (left + tw / 2)) / tw * 10, -5, 5) - .6}deg)`;
  if (scroll && stage.scrollWidth > stage.clientWidth) {
    const sl = stage.scrollLeft, cw = stage.clientWidth;
    if (x < sl + 40 || x > sl + cw - 40) stage.scrollTo({ left: x - cw / 2, behavior: reduce ? 'auto' : 'smooth' });
  }
}

/* ---------- words for screen readers ---------- */
function summarise(hm, segs) {
  const list = $('summary'); list.textContent = '';
  const lines = segs.map((s, n) => {
    let hi = -99, lo = 99, rain = 0, gust = 0, dirAt = 0;
    for (let i = s.a; i <= s.b; i++) {
      const j = idxOf(hm[i].t);
      hi = Math.max(hi, DATA.temp[j]); lo = Math.min(lo, DATA.temp[j]); rain += DATA.precip[Math.min(DATA.n - 1, j + 1)];
      if (DATA.wind[j] > gust) { gust = DATA.wind[j]; dirAt = DATA.dir[j]; }
    }
    return `${n === 0 ? 'Rest of today' : s.weekday}: ${Math.round(hi)}° to ${Math.round(lo)}°, ${rain < .2 ? 'dry' : `${rain.toFixed(1)} mm of rain`}, wind up to ${Math.round(gust)} mph from the ${compass(dirAt)}.`;
  });
  for (const line of lines) { const li = document.createElement('li'); li.textContent = line; list.append(li); }
  sceneCv.setAttribute('aria-label', `Forecast panorama for Douglas, Isle of Man. ${lines.slice(0, 2).join(' ')}`);
}

/* ---------- render ---------- */
function render() {
  if (!DATA) return;
  layout(); buildLook(); buildSlots();
  G.lamps = [];
  const c = sc;
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, G.W, G.H);
  paintSky(c); paintTwilight(c); paintStars(c); paintSunMoon(c); paintHighCloud(c); paintMidCloud(c); paintFarSea(c);
  for (const [key, lift, scale, seed] of LAYERS) { paintLand(c, key, lift, scale, seed); if (key === 'far') paintHillFog(c); }
  paintShore(c); paintLandmarks(c); paintLowCloud(c); paintSea(c); paintVeil(c);
  paintGrain(c, 0, G.Hs);
  const hm = hourMarks(), segs = daySegments(hm);
  paintRuler(c, hm, segs);
  buildFx(); buildStaff();
  cancelAnimationFrame(raf);
  if (reduce) paintFx(0); else raf = requestAnimationFrame(loop);
  setCursor(state.cursor);
  summarise(hm, segs);
}
let pending = 0;
const scheduleRender = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(render); };

/* ---------- loading ---------- */
function setStatus(text) { $('status').textContent = text; }
async function load() {
  const note = $('note');
  if (params.has('demo')) {
    DATA = demoData(); setStatus('Demo week: made-up weather');
  } else {
    try {
      DATA = await fetchForecast();
      writeCache(DATA);
      setStatus(`Met Office forecast, fetched ${fmtTime.format(DATA.fetched)}${DATA.hasSea ? '' : ' (no sea data)'}`);
    } catch (err) {
      const cached = readCache();
      if (cached && cached.t?.[cached.n - 1] > Date.now() + 24 * HOUR) {
        DATA = cached; setStatus(`Offline: showing the forecast fetched at ${fmtTime.format(cached.fetched)}`);
      } else {
        DATA = demoData(); setStatus(`Couldn't reach Open-Meteo (${err.message}), so this is a demo week`);
      }
    }
  }
  note.hidden = true;
  render();
}

/* ---------- wiring ---------- */
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  const h = +b.dataset.hours, t = G.t0 + state.cursor * HOUR;
  state.hours = h;
  try { localStorage.setItem(VIEW_KEY, String(h)); } catch { /* storage may be blocked */ }
  document.querySelectorAll('.seg button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  state.cursor = Math.round((t - floorHour(Date.now())) / HOUR);
  render(); setCursor(state.cursor, true);
}));
document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.hours === state.hours)));
$('now').addEventListener('click', () => { setCursor(0, true); stage.scrollTo({ left: 0, behavior: reduce ? 'auto' : 'smooth' }); });
const pick = (e) => { if (!DATA) return; const r = fxCv.getBoundingClientRect(); setCursor((tOf(e.clientX - r.left) - G.t0) / HOUR); };
fxCv.addEventListener('pointermove', pick);
fxCv.addEventListener('pointerdown', pick);
stage.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 6 : 1;
  const moves = { ArrowRight: state.cursor + step, ArrowLeft: state.cursor - step, Home: 0, End: G.hours };
  if (e.key in moves) { e.preventDefault(); setCursor(moves[e.key], true); }
});
new ResizeObserver(scheduleRender).observe(stage);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleRender);
document.fonts?.ready.then(scheduleRender);
setInterval(() => {
  if (!DATA) return;
  if (!DATA.demo && Date.now() - DATA.fetched > 45 * 60e3) load();
  else if (floorHour(Date.now()) !== G.t0) render();
}, 60e3);
$('note').textContent = 'Cutting out the week’s weather…';
$('note').hidden = false;
load();
})();
