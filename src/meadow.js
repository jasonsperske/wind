import * as THREE from 'three';

const SIZE = 128;
const STEP = 1.5;
const SPAN = SIZE * STEP;
const RADIUS = 2.6;

// A small world-aligned clearing mask. Rebuilt only when the flower cell changes;
// one lookup per grass vertex avoids a loop over all flowers on the GPU.
export function createMeadow() {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const origin = new THREE.Vector2();
  const uniforms = {
    uMeadow: { value: texture },
    uMeadowOrigin: { value: origin },
    uMeadowSpan: { value: SPAN },
  };
  function rebuild(flowers, x, z) {
    origin.set(Math.floor(x / STEP) * STEP - SPAN / 2, Math.floor(z / STEP) * STEP - SPAN / 2);
    data.fill(0);
    for (const f of flowers) {
      const cx = (f.x - origin.x) / STEP - 0.5;
      const cz = (f.z - origin.y) / STEP - 0.5;
      const reach = Math.ceil(RADIUS / STEP);
      for (let j = Math.max(0, Math.floor(cz) - reach); j <= Math.min(SIZE - 1, Math.ceil(cz) + reach); j++) {
        for (let i = Math.max(0, Math.floor(cx) - reach); i <= Math.min(SIZE - 1, Math.ceil(cx) + reach); i++) {
          const d = Math.hypot(i - cx, j - cz) * STEP;
          const t = Math.max(0, 1 - d / RADIUS);
          const value = Math.round(t * t * (3 - 2 * t) * 255);
          const at = (j * SIZE + i) * 4;
          data[at] = Math.max(data[at], value);
        }
      }
    }
    texture.needsUpdate = true;
  }
  return { uniforms, rebuild };
}

export const GLSL_MEADOW = `
uniform sampler2D uMeadow;
uniform vec2 uMeadowOrigin;
uniform float uMeadowSpan;
float flowerClearing(vec2 p) {
  vec2 uv = (p - uMeadowOrigin) / uMeadowSpan;
  if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return 0.0;
  return texture2D(uMeadow, uv).r;
}
`;
