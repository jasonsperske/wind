// Rain and snow.
//
// One instanced quad, one shader, two moods. Every drop lives at a fixed offset
// inside a box that is wrapped around the camera each frame — `mod` does the
// recycling, so nothing is simulated on the CPU, nothing is allocated while you
// fly, and a drop that leaves the bottom of the box is already back at the top.
//
// Fog is not drawn at all: thick air is the fog band closing in and the haze
// going grey, which daylight.js already writes into the shared uniforms.

import * as THREE from 'three';
import { LIGHT, HAZE, DROPS_MAX } from './config.js';

// Tight enough that a few thousand drops read as weather rather than as a
// scattering of dots — everything past it is the fog's job, not the drops'.
const BOX = new THREE.Vector3(52, 36, 52);

export function createWeather(scene) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);

  const seed = new Float32Array(DROPS_MAX * 4);
  for (let i = 0; i < DROPS_MAX; i++) {
    seed[i * 4] = Math.random();
    seed[i * 4 + 1] = Math.random();
    seed[i * 4 + 2] = Math.random();
    seed[i * 4 + 3] = Math.random();
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uTime: { value: 0 },
      uLight: { value: LIGHT }, uHaze: { value: HAZE },
      // x = fall speed, y = drift, z = length, w = width
      uDrop: { value: new THREE.Vector4(18, 2.2, 0.75, 0.014) },
      // x = 0 rain / 1 snow, y = alpha, z = sway
      uMood: { value: new THREE.Vector3(0, 0.3, 0) },
      uTint: { value: new THREE.Color(0xbcc9d6) },
    },
    vertexShader: `
      attribute vec4 aSeed;
      uniform vec3 uCam, uBox, uMood; uniform vec4 uDrop; uniform float uTime;
      varying float vFade; varying vec2 vUv;
      void main(){
        vec3 hb = uBox * 0.5;   // half the box ('half' is a reserved word)
        vec3 o = aSeed.xyz * uBox;
        o.y -= uTime * uDrop.x * (0.82 + aSeed.w*0.36);
        o.x += uTime * uDrop.y;
        o.z += uTime * uDrop.y * 0.35;
        // snow wanders on the way down
        o.x += sin(uTime*0.7 + aSeed.w*31.0) * uMood.z;
        o.z += cos(uTime*0.6 + aSeed.x*27.0) * uMood.z;

        vec3 rel = mod(o - uCam + hb, uBox) - hb;
        vec3 w = uCam + rel;

        // A raindrop is a streak along the way it is actually going, which is
        // not straight down once there is any wind in it. A flake is a flake,
        // so that one just faces you.
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 lean = normalize(vec3(-uDrop.y, uDrop.x, -uDrop.y*0.35));
        vec3 U = mix(lean, vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]), uMood.x);
        float len = uDrop.z * (0.7 + aSeed.w*0.6);
        float wid = uDrop.w * (0.7 + aSeed.z*0.6);
        w += R * position.x * wid * 2.0 + U * position.y * len * 2.0;

        // ease out at the walls of the box so nothing pops into being
        vFade = 1.0 - smoothstep(0.62, 1.0, length(rel.xz) / (uBox.x*0.5));
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uLight, uHaze, uTint, uMood;
      varying float vFade; varying vec2 vUv;
      void main(){
        // a flake is round, a raindrop is a streak that fades at both ends
        vec2 d = vUv - 0.5;
        float shape = mix(
          smoothstep(0.5, 0.12, abs(d.y)),
          smoothstep(0.5, 0.0, length(d)),
          uMood.x);
        float a = uMood.y * vFade * shape;
        if (a < 0.01) discard;
        vec3 c = mix(uTint * uLight * 1.4 + uHaze * 0.35, uTint, uMood.x);
        gl_FragColor = vec4(c, a);
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8000;      // over the world, under the huds
  scene.add(mesh);

  let cap = DROPS_MAX;
  let fall = 0, kind = 'none';

  function set(conditions) {
    kind = conditions.kind;
    fall = conditions.fall;
    const u = material.uniforms;
    if (kind === 'rain') {
      u.uDrop.value.set(19.0, 2.6, 0.85, 0.013);
      u.uMood.value.set(0.0, 0.16 + fall * 0.30, 0.0);
      u.uTint.value.set(0xaebecd);
    } else if (kind === 'snow') {
      u.uDrop.value.set(1.4, 0.9, 0.105, 0.105);
      u.uMood.value.set(1.0, 0.55 + fall * 0.40, 1.1);
      u.uTint.value.set(0xf4f8ff);
    }
    apply();
  }

  function apply() {
    const n = kind === 'none' ? 0 : Math.round(Math.min(cap, DROPS_MAX) * fall);
    geometry.instanceCount = Math.max(0, n);
    mesh.visible = n > 0;
  }

  return {
    set,
    // the quality tier decides how many drops the headset draws
    setCap(n) { cap = Math.max(0, Math.min(DROPS_MAX, n | 0)); apply(); },
    update(camPos, elapsed) {
      if (!mesh.visible) return;
      material.uniforms.uCam.value.copy(camPos);
      material.uniforms.uTime.value = elapsed;
    },
    count: () => geometry.instanceCount,
  };
}
