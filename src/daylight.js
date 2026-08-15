// What hour it is, and what the sky is doing.
//
// A map asks for an hour with `data-time` and for weather with `data-weather`;
// either can be overridden from the title screen or the URL. Everything here
// ends up written into the live objects in config.js — one sun, one light, one
// haze, one fog band, shared by every material — so changing the hour is a
// handful of writes rather than a walk over the scene graph.

import * as THREE from 'three';
import { SUN, SUN_COL, LIGHT, HAZE, SKY_TOP, SKY_LOW, FOG, LAND_HAZE, VIEW } from './config.js';

/* ------------------------------ the hours ------------------------------- */

// `light` multiplies everything the sun touches, so it carries both the colour
// and the sheer amount of light — night is not blue daylight, it is 15% of it.
export const TIMES = {
  day: {
    label: 'Day',
    sun: new THREE.Vector3(0.45, 0.72, 0.52),
    sunCol: new THREE.Color(0xfff0d2),
    light: new THREE.Color(0xffffff),
    skyTop: new THREE.Color(0x5aa4d6),
    skyLow: new THREE.Color(0xdcecdf),
    hazeGain: 1.0,
    hazeTint: new THREE.Color(0xd6e7dc), hazeTintAmt: 0.0,
    glow: 22.0, glowAmt: 0.45, stars: 0.0, moon: 0.0,
  },
  dusk: {
    label: 'Dusk',
    sun: new THREE.Vector3(0.88, 0.11, -0.46),
    sunCol: new THREE.Color(0xffb473),
    light: new THREE.Color(0xd9a37f),
    skyTop: new THREE.Color(0x2b4675),
    skyLow: new THREE.Color(0xf0a878),
    hazeGain: 0.68,
    hazeTint: new THREE.Color(0xd08f63), hazeTintAmt: 0.46,
    glow: 12.0, glowAmt: 0.55, stars: 0.30, moon: 0.20,
  },
  'night-full': {
    label: 'Night, full moon',
    sun: new THREE.Vector3(-0.34, 0.64, 0.69),
    sunCol: new THREE.Color(0xd2e2ff),
    light: new THREE.Color(0x4a5d85),
    skyTop: new THREE.Color(0x070d1e),
    skyLow: new THREE.Color(0x16233d),
    hazeGain: 0.30,
    hazeTint: new THREE.Color(0x1e2c48), hazeTintAmt: 0.62,
    glow: 700.0, glowAmt: 0.35, stars: 0.72, moon: 1.0,
  },
  'night-new': {
    label: 'Night, new moon',
    sun: new THREE.Vector3(-0.34, 0.58, 0.74),
    sunCol: new THREE.Color(0x8fa4cc),
    light: new THREE.Color(0x1d2740),
    skyTop: new THREE.Color(0x03060f),
    skyLow: new THREE.Color(0x0a1120),
    hazeGain: 0.15,
    hazeTint: new THREE.Color(0x0c1220), hazeTintAmt: 0.76,
    glow: 900.0, glowAmt: 0.0, stars: 1.0, moon: 0.0,
  },
};

const TIME_ALIAS = {
  '': 'day', noon: 'day', midday: 'day', daylight: 'day', clear: 'day',
  evening: 'dusk', sunset: 'dusk', twilight: 'dusk', dawn: 'dusk',
  night: 'night-full', moon: 'night-full', fullmoon: 'night-full',
  'full-moon': 'night-full', 'night-moon': 'night-full',
  newmoon: 'night-new', 'new-moon': 'night-new', dark: 'night-new',
  midnight: 'night-new', starlight: 'night-new',
};

export function timeKey(name) {
  const k = String(name || '').trim().toLowerCase();
  if (TIMES[k]) return k;
  const a = TIME_ALIAS[k];
  return a && TIMES[a] ? a : 'day';
}

/* ----------------------------- the weather ------------------------------ */

// `view` is how much of the clear-day fog distance survives, `fall` scales the
// drop count, `damp` is how much light the cloud over you steals.
export const WEATHERS = {
  clear:    { label: 'Clear',    kind: 'none', fall: 0.0,  view: 1.00, damp: 0.00 },
  mist:     { label: 'Mist',     kind: 'none', fall: 0.0,  view: 0.60, damp: 0.10 },
  fog:      { label: 'Fog',      kind: 'none', fall: 0.0,  view: 0.30, damp: 0.22 },
  drizzle:  { label: 'Drizzle',  kind: 'rain', fall: 0.28, view: 0.80, damp: 0.16 },
  rain:     { label: 'Rain',     kind: 'rain', fall: 0.62, view: 0.68, damp: 0.30 },
  downpour: { label: 'Downpour', kind: 'rain', fall: 1.00, view: 0.40, damp: 0.44 },
  snow:     { label: 'Snow',     kind: 'snow', fall: 0.45, view: 0.64, damp: 0.18 },
  blizzard: { label: 'Blizzard', kind: 'snow', fall: 1.00, view: 0.32, damp: 0.34 },
};

const WEATHER_ALIAS = {
  '': 'clear', none: 'clear', fine: 'clear', sunny: 'clear',
  haze: 'mist', hazy: 'mist', misty: 'mist', foggy: 'fog',
  raining: 'rain', shower: 'drizzle', light: 'drizzle',
  storm: 'downpour', heavy: 'downpour', 'heavy-rain': 'downpour',
  snowing: 'snow', snowy: 'snow', blizzarding: 'blizzard', 'heavy-snow': 'blizzard',
};

export function weatherKey(name) {
  const k = String(name || '').trim().toLowerCase();
  if (WEATHERS[k]) return k;
  const a = WEATHER_ALIAS[k];
  return a && WEATHERS[a] ? a : 'clear';
}

/* ------------------------------- applying ------------------------------- */

const tmp = new THREE.Color();

// Resolve an hour and a weather into one set of conditions. `amount` scales the
// weather back toward clear, so a map can ask for half a rainstorm.
export function conditions(time, weather, amount) {
  const t = TIMES[timeKey(time)];
  const w = WEATHERS[weatherKey(weather)];
  const a = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 1;
  return {
    time: t, weather: w, amount: a,
    kind: a > 0.02 ? w.kind : 'none',
    fall: w.fall * a,
    view: 1 + (w.view - 1) * a,
    damp: w.damp * a,
  };
}

// Write the sky-wide part into the shared uniforms. The haze also depends on
// what you are flying over, which changes every frame, so that part is done in
// hazeFor() below rather than here.
export function applyConditions(c) {
  SUN.copy(c.time.sun).normalize();
  SUN_COL.copy(c.time.sunCol);
  LIGHT.copy(c.time.light).multiplyScalar(1 - c.damp * 0.55);
  SKY_TOP.copy(c.time.skyTop);
  SKY_LOW.copy(c.time.skyLow);
  // Weather closes the world in; the far edge moves in more than the near one,
  // so thick air reads as depth lost rather than as a grey card in your face.
  FOG.set(VIEW * 0.35 * (0.45 + c.view * 0.55), VIEW * 0.95 * c.view);
}

// The haze for a given landscape mix, under these conditions. Written straight
// into the shared HAZE, which every material already points at.
export function applyHaze(c, wMeadow, wDune, wTundra, wet, lerpK) {
  let sum = wMeadow + wDune + wTundra;
  if (sum < 1e-3) sum = 1;
  tmp.setRGB(
    (LAND_HAZE[0].r * wMeadow + LAND_HAZE[1].r * wDune + LAND_HAZE[2].r * wTundra) / sum,
    (LAND_HAZE[0].g * wMeadow + LAND_HAZE[1].g * wDune + LAND_HAZE[2].g * wTundra) / sum,
    (LAND_HAZE[0].b * wMeadow + LAND_HAZE[1].b * wDune + LAND_HAZE[2].b * wTundra) / sum
  );
  // over open water the air takes the water's colour
  if (wet > 0) tmp.lerp(WATER_HAZE, wet * 0.4);
  tmp.multiplyScalar(c.time.hazeGain);
  tmp.lerp(c.time.hazeTint, c.time.hazeTintAmt);
  // and rain or snow greys it further
  if (c.damp > 0) tmp.lerp(c.kind === 'snow' ? SNOW_HAZE : RAIN_HAZE, c.damp * 0.5 * c.time.hazeGain);
  HAZE.lerp(tmp, lerpK);
}

const WATER_HAZE = new THREE.Color(0x9dc0d4);
const RAIN_HAZE  = new THREE.Color(0x6f7b84);
const SNOW_HAZE  = new THREE.Color(0xc9d4de);

// Snap the haze rather than easing it — for the first frame of a map.
export function primeHaze(c) {
  applyHaze(c, 1, 0, 0, 0, 1);
}
