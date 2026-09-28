import { fieldAt, terrainH, hash2 } from './field.js';
import { FMAX, CELL, RING } from './config.js';

const PATCH = CELL * 2;
const REACH = CELL * RING;

// Loose groups replace isolated points at roughly the same overall density.
// Every head has a permanent ID so returning to a patch preserves its blooms.
export function flowerLayout(px, pz, home) {
  const candidates = [];
  function patch(id, x, z, seed) {
    const count = 3 + Math.floor(hash2(seed, 12.4) * 3);
    const hue = hash2(seed, 9.3);
    for (let k = 0; k < count; k++) {
      const angle = k * 2.39996 + seed;
      const radius = k === 0 ? 0 : 0.7 + Math.sqrt(k) * 0.65;
      const fx = x + Math.cos(angle) * radius, fz = z + Math.sin(angle) * radius;
      const distance = Math.hypot(fx - px, fz - pz);
      if (distance > REACH) continue;
      const s = fieldAt(fx, fz);
      if (s[2] < 4 || s[4] < 0.5 || s[7] > 0.2) continue;
      candidates.push({ id: `${id}:${k}`, x: fx, z: fz, y: terrainH(fx, fz),
        hue: hue * 0.9 + k * 0.016, seed: seed + k * 1.7, distance });
    }
  }
  const ci = Math.round(px / PATCH), cj = Math.round(pz / PATCH);
  const rings = Math.ceil(REACH / PATCH) + 1;
  const intro = home ? [9, 21, 35].map((d, k) => ({
    x: home.x - Math.sin(0.7) * d + Math.cos(0.7) * Math.sin(k * 1.8) * 3,
    z: home.z - Math.cos(0.7) * d - Math.sin(0.7) * Math.sin(k * 1.8) * 3,
  })) : [];
  for (let i = ci - rings; i <= ci + rings; i++) {
    for (let j = cj - rings; j <= cj + rings; j++) {
      const h = hash2(i, j);
      if (h > 0.42) continue;
      const x = i * PATCH + (hash2(i + 0.5, j + 11.3) - 0.5) * PATCH * 0.75;
      const z = j * PATCH + (hash2(i + 7.1, j - 3.7) - 0.5) * PATCH * 0.75;
      if (intro.some(p => Math.hypot(x - p.x, z - p.z) < 6)) continue;
      patch(`${i},${j}`, x, z, h * 6.28);
    }
  }
  intro.forEach((p, k) => patch(`home${k}`, p.x, p.z, 1.3 + k * 2.4));
  candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  return candidates.slice(0, FMAX);
}
