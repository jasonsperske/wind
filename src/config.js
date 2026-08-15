import * as THREE from 'three';

export const DEG = Math.PI / 180;

/* --------------------------------- world -------------------------------- */
export const VIEW = 110.0;          // fog / patch reach in clear weather
export const GRASS_R = 62.0;        // radius of the grass disc that follows you
export const GRASS_MAX = 52000;     // blades on a desktop GPU

export const CELL = 11.0;           // flower grid spacing
export const RING = 6;              // cells kept around the player
export const FMAX = 140;            // flowers alive at once
export const PET_PER = 5;           // petals per flower head
export const FLYMAX = 90;           // petals in flight
export const CARRY_MAX = 90;        // petals drawn swirling around you

/* --------------------------------- props -------------------------------- */
// Trees and rocks come off their own hash grids, the same trick the flowers
// use: a fixed lattice, thinned by the scatter shape's density, so they never
// move and never need storing.
export const TREE_CELL = 15.0;
export const TREE_RING = 7;
export const TREE_MAX = 150;
export const ROCK_CELL = 19.0;
export const ROCK_RING = 5;
export const ROCK_MAX = 110;

/* -------------------------------- flight -------------------------------- */
export const PET_FULL = 70;         // petals needed for a full gale
export const MAX_DOWN = 48 * DEG;   // steepest dive
export const SINK = 1.35;           // wind sinks unless it has force to climb

/* -------------------------------- the map ------------------------------- */
export const MAP_LIST = './world/maps.json';

// How the wind is turned back at the edge of the flyable world. It starts
// leaning on you well inside the border so that being turned never comes as a
// surprise, and it is a rotation rather than a wall — see boundary.js.
export const BOUND_SOFT = 26.0;     // m inside the edge where the headwind starts
export const BOUND_EDGE = -8.0;     // m outside where it is at full strength
export const BOUND_TURN = 1.15;     // rad/s of turn-back at full strength
export const BOUND_PUSH = 7.0;      // m/s of inward wind at full strength
export const BOUND_HAUL = 0.7;      // extra m/s of inward wind per m outside
// Far enough out the headwind has to beat a full gale (9 + 17, boosted by 55%)
// outright, or a wind that holds its nose out and refuses to turn escapes.
export const BOUND_HAUL_MAX = 40.0;

/* ------------------------------ live light ------------------------------ */
// These are the *current* conditions, not constants. Every material is handed
// these very objects as its uniform values, so daylight.js and weather.js can
// move the sun or thicken the air by writing to one place and have the whole
// world follow — no per-material plumbing, nothing to forget to update.
export const SUN     = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
export const SUN_COL = new THREE.Color(0xfff0d2);
export const LIGHT   = new THREE.Color(0xffffff);   // multiplies everything lit
export const HAZE    = new THREE.Color(0xd6e7dc);   // what distance dissolves into
export const SKY_TOP = new THREE.Color(0x5aa4d6);
export const SKY_LOW = new THREE.Color(0xdcecdf);
export const FOG     = new THREE.Vector2(VIEW * 0.35, VIEW * 0.95);   // near, far

/* -------------------------------- palette ------------------------------- */
// The haze each landscape gives the air in daylight; daylight.js tints these
// for the hour. The air over a desert is not the air over ice, and you can see
// the next region coming.
export const LAND_HAZE = [
  new THREE.Color(0xd6e7dc),   // meadow
  new THREE.Color(0xe8d8b0),   // dune
  new THREE.Color(0xdfe9f4),   // tundra
];

// The same three on the minimap, matching what the maps fill them with, so the
// map you fly with looks like the file you drew. Water gets its own.
export const LAND_MAP = ['#b9d3a4', '#e7d3a4', '#dfe9f4'];
export const WATER_MAP = '#7fa9c4';

export const GUSTS = ['calm', 'a stirring', 'a breeze', 'a strong breeze', 'a gale'];
export function gustIndex(force) { return Math.min(4, Math.floor(force * 4.999)); }

/* ------------------------------- quality -------------------------------- */
// Quest 2 renders every blade twice. These are the knobs that actually decide
// whether you hold 72 Hz, which matters more for comfort than anything else.
export const QUALITY = {
  low:    { grass: 12000, foveation: 1.0,  scale: 0.8, drops: 1200, props: 0.55 },
  medium: { grass: 22000, foveation: 0.75, scale: 1.0, drops: 2600, props: 1.0 },
  high:   { grass: 34000, foveation: 0.4,  scale: 1.1, drops: 4200, props: 1.0 },
};
export const DROPS_MAX = 5000;      // rain / snow instances allocated

/* ------------------------------- steering ------------------------------- */
export const DEFAULT_SETTINGS = {
  turnMode: 'smooth',   // 'smooth' | 'snap'
  turnSpeed: 2.0,       // rad/s at full stick deflection
  snapAngle: 30,        // degrees per snap
  deadzone: 0.15,       // stick slack, rescaled away above the threshold
  curve: 1.7,           // response exponent — gentle near centre, full at edge
  ramp: 7.0,            // how fast the turn rate chases the stick (1/s)
  vignette: true,       // comfort tunnel while turning
  quality: 'medium',
  map: '',              // '' = whatever maps.json calls the default
  time: '',             // '' = whatever the map asks for
  weather: '',          // '' = whatever the map asks for
};
