import * as THREE from 'three';

const SIZE = 128;
const STEP = 1.5;
const SPAN = SIZE * STEP;
const RADIUS = 2.6;
export const BLOOM_DURATION = 2.6;
export const BLOOM_PULSES = 4;

// R stores short grass around flowers; G stores lasting colour around opened
// flowers. The texture changes only on cell transitions and bloom events.
export function createMeadow() {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const origin = new THREE.Vector2();
  const pulses = Array.from({ length: BLOOM_PULSES }, () => new THREE.Vector4(0, 0, -100, 0));
  let nextPulse = 0;
  const uniforms = {
    uMeadow: { value: texture },
    uMeadowOrigin: { value: origin },
    uMeadowSpan: { value: SPAN },
    uMeadowTime: { value: 0 },
    uBloomPulses: { value: pulses },
  };
  function stamp(f, channel) {
    const cx = (f.x - origin.x) / STEP - 0.5;
    const cz = (f.z - origin.y) / STEP - 0.5;
    const reach = Math.ceil(RADIUS / STEP);
    for (let j = Math.max(0, Math.floor(cz) - reach); j <= Math.min(SIZE - 1, Math.ceil(cz) + reach); j++) {
      for (let i = Math.max(0, Math.floor(cx) - reach); i <= Math.min(SIZE - 1, Math.ceil(cx) + reach); i++) {
        const d = Math.hypot(i - cx, j - cz) * STEP;
        const t = Math.max(0, 1 - d / RADIUS);
        const value = Math.round(t * t * (3 - 2 * t) * 255);
        const at = (j * SIZE + i) * 4 + channel;
        data[at] = Math.max(data[at], value);
      }
    }
  }
  function rebuild(flowers, x, z) {
    origin.set(Math.floor(x / STEP) * STEP - SPAN / 2, Math.floor(z / STEP) * STEP - SPAN / 2);
    data.fill(0);
    for (const f of flowers) {
      stamp(f, 0);
      if (f.awarded) stamp(f, 1);
    }
    texture.needsUpdate = true;
  }
  function bloom(f, time) {
    stamp(f, 1);
    texture.needsUpdate = true;
    // A cluster opening together produces one wave rather than overlapping flashes.
    if (pulses.some(p => p.w && time - p.z < 0.3 && Math.hypot(f.x - p.x, f.z - p.y) < 4.5)) return;
    pulses[nextPulse].set(f.x, f.z, time, 1);
    nextPulse = (nextPulse + 1) % BLOOM_PULSES;
  }
  function update(time) {
    uniforms.uMeadowTime.value = time;
    for (const p of pulses) if (time >= p.z + BLOOM_DURATION) p.w = 0;
  }
  return { uniforms, rebuild, bloom, update };
}

export const GLSL_MEADOW = `
uniform sampler2D uMeadow;
uniform vec2 uMeadowOrigin;
uniform float uMeadowSpan, uMeadowTime;
uniform vec4 uBloomPulses[${BLOOM_PULSES}];
vec2 meadowAt(vec2 p) {
  vec2 uv = (p - uMeadowOrigin) / uMeadowSpan;
  if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec2(0.0);
  return texture2D(uMeadow, uv).rg;
}
// Directional bend in xy, soft light in z. Uniform branches skip inactive waves.
vec3 bloomWave(vec2 p) {
  vec3 wave = vec3(0.0);
  for (int i=0; i<${BLOOM_PULSES}; i++) {
    vec4 pulse = uBloomPulses[i];
    float age = uMeadowTime - pulse.z;
    if (pulse.w > 0.0 && age >= 0.0 && age < ${BLOOM_DURATION.toFixed(1)}) {
      vec2 delta = p - pulse.xy;
      float d = length(delta);
      float ring = 1.0-smoothstep(0.25,1.65,abs(d-age*3.3));
      float fade = smoothstep(0.0,0.18,age)*(1.0-age/${BLOOM_DURATION.toFixed(1)});
      float strength = ring*fade;
      wave += vec3(delta/max(d,0.001)*strength,strength);
    }
  }
  return vec3(wave.xy, min(wave.z,1.0));
}
`;
