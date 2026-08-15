import * as THREE from 'three';

export const DEG = Math.PI / 180;

/* --------------------------------- world -------------------------------- */
export const VIEW = 110.0;          // fog / patch reach
export const GRASS_R = 62.0;        // radius of the grass disc that follows you
export const GRASS_MAX = 52000;     // blades on a desktop GPU

export const CELL = 11.0;           // flower grid spacing
export const RING = 6;              // cells kept around the player
export const FMAX = 140;            // flowers alive at once
export const PET_PER = 5;           // petals per flower head
export const FLYMAX = 90;           // petals in flight
export const CARRY_MAX = 90;        // petals drawn swirling around you

/* -------------------------------- flight -------------------------------- */
export const PET_FULL = 70;         // petals needed for a full gale
export const MAX_DOWN = 48 * DEG;   // steepest dive
export const SINK = 1.35;           // wind sinks unless it has force to climb

/* -------------------------------- the map ------------------------------- */
export const WORLD_SVG = './world/world.svg';

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

/* -------------------------------- palette ------------------------------- */
export const SKY_TOP = new THREE.Color(0x5aa4d6);
export const SKY_LOW = new THREE.Color(0xdcecdf);
export const HAZE    = new THREE.Color(0xd6e7dc);
export const SUN     = new THREE.Vector3(0.45, 0.72, 0.52).normalize();

// One haze per landscape, in the order regions.js lists them. The air over a
// desert is not the air over ice, and you can see the next region coming.
export const LAND_HAZE = [
  new THREE.Color(0xd6e7dc),   // meadow
  new THREE.Color(0xe8d8b0),   // dune
  new THREE.Color(0xdfe9f4),   // tundra
];

export const GUSTS = ['calm', 'a stirring', 'a breeze', 'a strong breeze', 'a gale'];
export function gustIndex(force) { return Math.min(4, Math.floor(force * 4.999)); }

/* ------------------------------- quality -------------------------------- */
// Quest 2 renders every blade twice. These are the knobs that actually decide
// whether you hold 72 Hz, which matters more for comfort than anything else.
export const QUALITY = {
  low:    { grass: 12000, foveation: 1.0,  scale: 0.8 },
  medium: { grass: 22000, foveation: 0.75, scale: 1.0 },
  high:   { grass: 34000, foveation: 0.4,  scale: 1.1 },
};

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
};
