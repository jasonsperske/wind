// The edge of the world.
//
// Nothing stops you. Well before the last of the ground there is a headwind,
// and it leans on your nose until you are pointing back the way you came — the
// same shape of turn the stick would give you, just not yours. A wall you hit
// is a wall; a wind that turns you is weather.
//
// The baked field carries the signed distance to the edge of the flyable
// world: positive inside, negative out. Its gradient points inward, which is
// where the wind wants you.

import { fieldAt } from './field.js';
import { BOUND_SOFT, BOUND_EDGE, BOUND_TURN, BOUND_PUSH, BOUND_HAUL, BOUND_HAUL_MAX } from './config.js';

export function createBoundary(field) {
  const home = field.home;
  const e = Math.max(2.0, Math.min(field.cell, 8.0));

  function sdf(x, z) { return fieldAt(x, z)[2]; }

  // Fills `out` with how hard the wind is leaning (0..1), how far out you are,
  // and the unit direction back in.
  return function sample(x, z, out) {
    const s = sdf(x, z);
    out.beyond = s < 0 ? -s : 0;

    let t = (BOUND_SOFT - s) / (BOUND_SOFT - BOUND_EDGE);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.push = t * t * (3 - 2 * t);
    if (out.push <= 0) { out.ix = 0; out.iz = 0; return out; }

    let gx = sdf(x + e, z) - sdf(x - e, z);
    let gz = sdf(x, z + e) - sdf(x, z - e);
    let len = Math.hypot(gx, gz);
    if (len < 1e-4) {
      // Far enough out that the distance field has flattened off — there is no
      // local downhill left to follow, so aim at where you started.
      gx = home.x - x; gz = home.z - z;
      len = Math.hypot(gx, gz) || 1;
    }
    out.ix = gx / len;
    out.iz = gz / len;
    return out;
  };
}

// Radians per second of turn-back, and metres per second of shove.
export function turnRate(push) { return BOUND_TURN * push; }
export function pushSpeed(push, beyond) {
  return BOUND_PUSH * push + Math.min(beyond * BOUND_HAUL, BOUND_HAUL_MAX);
}

// Smallest signed angle from a to b.
export function wrapAngle(a) {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
}
