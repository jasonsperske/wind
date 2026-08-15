import * as THREE from 'three';
import { terrainH, fieldAt, hash2, GLSL_HSV } from './field.js';
import { HAZE, VIEW, SUN, CELL, RING, FMAX, PET_PER } from './config.js';

export function petalGeometry() {
  // a lozenge, base at origin, pointing +Y
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [0, 0, 0, -0.5, 0.42, 0, 0.5, 0.42, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 0.42, 1, 0.42, 0.5, 1], 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  return g;
}

function buildHeads() {
  const PMAX = FMAX * PET_PER;
  const geometry = new THREE.InstancedBufferGeometry();
  const src = petalGeometry();
  geometry.setAttribute('position', src.getAttribute('position'));
  geometry.setAttribute('uv', src.getAttribute('uv'));
  geometry.setIndex(src.getIndex());

  const aBase  = new THREE.InstancedBufferAttribute(new Float32Array(PMAX * 3), 3);
  const aSpin  = new THREE.InstancedBufferAttribute(new Float32Array(PMAX), 1);
  const aBloom = new THREE.InstancedBufferAttribute(new Float32Array(PMAX), 1);
  const aHue   = new THREE.InstancedBufferAttribute(new Float32Array(PMAX), 1);
  for (const a of [aBase, aSpin, aBloom, aHue]) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aBase', aBase);
  geometry.setAttribute('aSpin', aSpin);
  geometry.setAttribute('aBloom', aBloom);
  geometry.setAttribute('aHue', aHue);
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uHaze: { value: HAZE.clone() }, uView: { value: VIEW }, uSun: { value: SUN },
    },
    vertexShader: GLSL_HSV + `
      attribute vec3 aBase; attribute float aSpin, aBloom, aHue;
      uniform float uTime; uniform vec3 uCam;
      varying vec3 vCol; varying float vFog;
      void main(){
        float b = aBloom;
        float len = 0.15 + b*0.13;
        float wid = 0.10 + b*0.05;
        vec3 p = vec3(position.x*wid, position.y*len, 0.0);
        // pitch: nearly upright when a bud, fanned when open
        float pit = mix(0.16, 1.16, b) + sin(uTime*1.3 + aSpin*3.0)*0.05*b;
        float cp = cos(pit), sp = sin(pit);
        p = vec3(p.x, p.y*cp - p.z*sp, p.y*sp + p.z*cp);
        float cy = cos(aSpin), sy = sin(aSpin);
        p = vec3(p.x*cy - p.z*sy, p.y, p.x*sy + p.z*cy);
        vec3 w = aBase + p;
        vec3 bud  = vec3(0.80,0.86,0.70);
        vec3 open = mix(hue2rgb(aHue), vec3(1.0), 0.30);
        vCol = mix(bud, open, b) * (0.72 + 0.42*position.y);
        vCol += vec3(0.25,0.22,0.10) * (1.0-b) * 0.5;   // buds catch the light
        vFog = smoothstep(60.0, 105.0, length(w.xz - uCam.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHaze; varying vec3 vCol; varying float vFog;
      void main(){ gl_FragColor = vec4(mix(vCol, uHaze, vFog), 1.0); }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material, geometry, aBase, aSpin, aBloom, aHue };
}

function buildStems() {
  const geometry = new THREE.InstancedBufferGeometry();
  // stems stand about half a metre — baked into the geometry
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, 0, 0, 0.5, 0, 0, -0.22, 0.48, 0, 0.22, 0.48, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);

  const sBase = new THREE.InstancedBufferAttribute(new Float32Array(FMAX * 3), 3);
  const sSeed = new THREE.InstancedBufferAttribute(new Float32Array(FMAX), 1);
  sBase.setUsage(THREE.DynamicDrawUsage);
  sSeed.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aBase', sBase);
  geometry.setAttribute('aSeed', sSeed);
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uHaze: { value: HAZE.clone() } },
    vertexShader: `
      attribute vec3 aBase; attribute float aSeed;
      uniform float uTime; uniform vec3 uCam;
      varying float vFog; varying float vT;
      void main(){
        vec3 p = vec3(position.x*0.028, position.y, 0.0);
        float sway = sin(uTime*1.5 + aSeed*6.28)*0.05;
        p.x += sway*position.y*position.y;
        vec3 w = aBase + p;
        vT = position.y;
        vFog = smoothstep(60.0, 105.0, length(w.xz - uCam.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHaze; varying float vFog; varying float vT;
      void main(){
        vec3 c = mix(vec3(0.16,0.30,0.12), vec3(0.34,0.48,0.18), vT);
        gl_FragColor = vec4(mix(c, uHaze, vFog), 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material, geometry, sBase, sSeed };
}

export function createFlowers(scene) {
  const heads = buildHeads();
  const stems = buildStems();
  scene.add(heads.mesh, stems.mesh);

  let flowers = [];            // {id,x,y,z,hue,bloom,target,seed,awarded}
  const bloomState = {};       // id -> true (an opened flower stays open)
  let lastCellI = 1e9, lastCellJ = 1e9;

  function rebuild(px, pz) {
    const ci = Math.round(px / CELL), cj = Math.round(pz / CELL);
    const keep = {};
    for (let i = 0; i < flowers.length; i++) keep[flowers[i].id] = flowers[i];
    const next = [];
    outer:
    for (let i = ci - RING; i <= ci + RING; i++) {
      for (let j = cj - RING; j <= cj + RING; j++) {
        const h = hash2(i, j);
        if (h > 0.42) continue;
        const id = i + ',' + j;
        let f = keep[id];
        if (!f) {
          const jx = (hash2(i + 0.5, j + 11.3) - 0.5) * CELL * 0.8;
          const jz = (hash2(i + 7.1, j - 3.7) - 0.5) * CELL * 0.8;
          const x = i * CELL + jx, z = j * CELL + jz;
          // Nothing flowers on sand or ice, and nothing flowers out where the
          // wind would have turned you around before you reached it.
          const s = fieldAt(x, z);
          if (s[2] < 4.0 || s[3] < 0.5) continue;
          f = {
            id, x, z, y: terrainH(x, z),
            hue: hash2(i * 3.3, j * 5.9), seed: h * 6.28,
            bloom: bloomState[id] ? 1 : 0, target: bloomState[id] ? 1 : 0,
            awarded: !!bloomState[id],
          };
        }
        next.push(f);
        if (next.length >= FMAX) break outer;
      }
    }
    flowers = next;
  }

  function writeBuffers() {
    const n = flowers.length;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const f = flowers[i];
      const headY = f.y + 0.46;
      stems.sBase.array[i * 3] = f.x;
      stems.sBase.array[i * 3 + 1] = f.y;
      stems.sBase.array[i * 3 + 2] = f.z;
      stems.sSeed.array[i] = f.seed;
      for (let p = 0; p < PET_PER; p++) {
        heads.aBase.array[k * 3] = f.x;
        heads.aBase.array[k * 3 + 1] = headY;
        heads.aBase.array[k * 3 + 2] = f.z;
        heads.aSpin.array[k] = f.seed + p * (Math.PI * 2 / PET_PER);
        heads.aBloom.array[k] = f.bloom;
        heads.aHue.array[k] = 0.92 + f.hue * 0.22;   // corals, pinks, golds
        k++;
      }
    }
    stems.geometry.instanceCount = n;
    heads.geometry.instanceCount = k;
    stems.sBase.needsUpdate = stems.sSeed.needsUpdate = true;
    heads.aBase.needsUpdate = heads.aSpin.needsUpdate = true;
    heads.aBloom.needsUpdate = heads.aHue.needsUpdate = true;
  }

  // Returns the flowers that finished opening this frame.
  function update(dt, camPos, playerPos) {
    const ci = Math.round(playerPos.x / CELL), cj = Math.round(playerPos.z / CELL);
    if (ci !== lastCellI || cj !== lastCellJ) {
      lastCellI = ci; lastCellJ = cj;
      rebuild(playerPos.x, playerPos.z);
    }

    const opened = [];
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i];
      if (f.target < 1) {
        const dx = camPos.x - f.x, dz = camPos.z - f.z;
        const alt = camPos.y - f.y;
        if (dx * dx + dz * dz < 9.0 && alt > -0.8 && alt < 5.0) {
          f.target = 1;
          bloomState[f.id] = true;
        }
      }
      if (f.bloom < f.target) {
        f.bloom = Math.min(1, f.bloom + dt * 1.5);
        if (f.bloom >= 1 && !f.awarded) {
          f.awarded = true;
          opened.push(f);
        }
      }
    }
    writeBuffers();
    return opened;
  }

  function setUniforms(camPos, elapsed) {
    heads.material.uniforms.uCam.value.copy(camPos);
    heads.material.uniforms.uTime.value = elapsed;
    stems.material.uniforms.uCam.value.copy(camPos);
    stems.material.uniforms.uTime.value = elapsed;
  }

  function setTime(elapsed) {
    heads.material.uniforms.uTime.value = elapsed;
    stems.material.uniforms.uTime.value = elapsed;
  }

  function setHaze(c) {
    heads.material.uniforms.uHaze.value.copy(c);
    stems.material.uniforms.uHaze.value.copy(c);
  }

  return { update, setUniforms, setTime, setHaze, rebuild };
}
