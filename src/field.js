// The terrain field.
//
// The shape of the ground is one function of position, held twice — once in JS
// and once in GLSL. The CPU copy decides where you collide and where flowers
// sit, the GPU copy draws the ground, and any drift between them shows up as
// flowers floating. If you edit one, edit the other.
//
// The function reads its parameters out of the baked region grid (regions.js):
// a base altitude and a waviness, so the same rolling hills can be a shallow
// swell over a meadow and a tall dune field a hundred metres up. Both copies
// read the same numbers — JS from the Float32Array, GLSL from a texture built
// out of it — so keeping them in step is now mostly a matter of keeping the two
// samplers filtering identically.

import * as THREE from 'three';
import { flatWorld } from './regions.js';

let field = flatWorld();
let texA = null, texB = null;

const scratch = new Float32Array(8);

/* ------------------------------- sampling -------------------------------- */

// [altitude, waviness, distance to the edge, water level,
//  meadow, dune, tundra, wetness].
// The array is reused — read what you need before calling again.
export function fieldAt(x, z) {
  return field.sample(x, z, scratch);
}

// Where a lake covers the ground, the ground *is* the lake's surface. Nothing
// is drawn under water, so there is no bed to model — flattening to the water
// level is both what it looks like and what you skim along.
export function heightOf(f, x, z) {
  const ground = f[0] + f[1] * hills(x, z);
  return f[7] > 0.001 ? ground + (f[3] - ground) * Math.min(1, f[7]) : ground;
}

export function terrainH(x, z) {
  return heightOf(field.sample(x, z, scratch), x, z);
}

export function hills(x, z) {
  let h = 0.0;
  h += 7.0  * Math.sin(x * 0.0163 + 1.3) * Math.cos(z * 0.0141 + 0.7);
  h += 3.2  * Math.sin(x * 0.0397 + 2.7) * Math.sin(z * 0.0361 + 0.5);
  h += 1.3  * Math.cos(x * 0.0931 + 0.4) * Math.sin(z * 0.1013 + 2.1);
  h += 0.45 * Math.sin(x * 0.2130 + 1.1) * Math.cos(z * 0.1910 + 0.2);
  return h;
}

export function getField() { return field; }

/* -------------------------------- upload --------------------------------- */

// Half floats, because the alternative is eight bits of altitude and terraced
// hills. RGBA16F is filterable in WebGL2 and behind OES_texture_half_float_linear
// in WebGL1, which is every browser that runs the rest of this.
const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

function toHalf(v) {
  f32[0] = v;
  const x = i32[0];
  let bits = (x >> 16) & 0x8000;
  const e = (x >> 23) & 0xff;
  let m = (x >> 12) & 0x07ff;
  if (e < 103) return bits;
  if (e > 142) return bits | 0x7c00 | ((e === 255 ? 0 : 1) && (x & 0x007fffff));
  if (e < 113) {
    m |= 0x0800;
    return bits + (m >> (114 - e)) + ((m >> (113 - e)) & 1);
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  return bits + (m & 1);
}

function makeTexture(src, nx, nz) {
  const half = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) half[i] = toHalf(src[i]);
  const tex = new THREE.DataTexture(half, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function setField(next) {
  field = next;
  if (texA) texA.dispose();
  if (texB) texB.dispose();
  texA = makeTexture(field.A, field.nx, field.nz);
  texB = makeTexture(field.B, field.nx, field.nz);
}

// Merge into any ShaderMaterial that includes GLSL_FIELD.
export function fieldUniforms() {
  if (!texA) setField(field);
  return {
    uFieldA: { value: texA },
    uFieldB: { value: texB },
    uField: { value: new THREE.Vector4(field.x0, field.z0, 1 / field.cell, 0) },
    uFieldDim: { value: new THREE.Vector2(field.nx, field.nz) },
  };
}

/* --------------------------------- glsl ---------------------------------- */

export const GLSL_FIELD = `
uniform sampler2D uFieldA;
uniform sampler2D uFieldB;
uniform vec4 uField;      // world x0, world z0, 1/cell
uniform vec2 uFieldDim;   // cells across, cells down

// Clamping in cell space rather than leaning on CLAMP_TO_EDGE keeps this
// identical to the JS sampler, including outside the grid.
vec2 fieldUV(vec2 p){
  vec2 g = clamp((p - uField.xy) * uField.z, vec2(0.0), uFieldDim - 1.0);
  return (g + 0.5) / uFieldDim;
}
vec4 fieldA(vec2 p){ return texture2D(uFieldA, fieldUV(p)); }
vec4 fieldB(vec2 p){ return texture2D(uFieldB, fieldUV(p)); }
vec3 fieldLand(vec2 p){ return texture2D(uFieldB, fieldUV(p)).rgb; }

float hills(vec2 p){
  float h = 0.0;
  h += 7.0  * sin(p.x*0.0163 + 1.3) * cos(p.y*0.0141 + 0.7);
  h += 3.2  * sin(p.x*0.0397 + 2.7) * sin(p.y*0.0361 + 0.5);
  h += 1.3  * cos(p.x*0.0931 + 0.4) * sin(p.y*0.1013 + 2.1);
  h += 0.45 * sin(p.x*0.2130 + 1.1) * cos(p.y*0.1910 + 0.2);
  return h;
}

// f is fieldA, wet is fieldB.a — a lake flattens the ground to its surface.
float heightOf(vec4 f, float wet, vec2 p){
  float ground = f.x + f.y * hills(p);
  return mix(ground, f.w, clamp(wet, 0.0, 1.0));
}

float terrainH(vec2 p){
  return heightOf(fieldA(p), fieldB(p).a, p);
}
`;

export function hash2(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const GLSL_HSV = `
vec3 hue2rgb(float h){
  vec3 k = fract(vec3(h) + vec3(0.0, 2.0/3.0, 1.0/3.0));
  return clamp(abs(k*6.0-3.0)-1.0, 0.0, 1.0);
}
`;
