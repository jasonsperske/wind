import * as THREE from 'three';
import { GLSL_HSV } from './field.js';
import { flowerLayout } from './flower-layout.js';
import { HAZE, FOG, LIGHT, SUN, CELL, FMAX, PET_PER } from './config.js';

export function petalGeometry() {
  // A cupped teardrop with a raised centre vein. The shared shape also
  // gives carried petals a curved silhouette instead of a four-corner card.
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], indices = [];
  const rows = 8;
  for (let i=0; i<=rows; i++) {
    const t = i/rows;
    const width = Math.pow(Math.sin(Math.PI*t),0.75)*0.46;
    for (let j=0; j<3; j++) {
      const across = j-1;
      pos.push(across*width,t,Math.sin(t*Math.PI)*0.10+across*across*width*0.22);
      uv.push(j/2,t);
    }
  }
  for (let i=0; i<rows; i++) {
    for (let j=0; j<2; j++) {
      const a = i*3+j;
      indices.push(a,a+1,a+3,a+1,a+4,a+3);
    }
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);
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
      uHaze: { value: HAZE }, uFog: { value: FOG },
      uLight: { value: LIGHT }, uSun: { value: SUN },
    },
    vertexShader: GLSL_HSV + `
      attribute vec3 aBase; attribute float aSpin, aBloom, aHue;
      uniform float uTime; uniform vec3 uCam; uniform vec2 uFog;
      varying vec3 vCol; varying float vFog; varying vec2 vUv; varying float vBud;
      void main(){
        float b = aBloom;
        float len = 0.25 + b*0.23;
        float wid = 0.25 + b*0.27;
        vec3 p = vec3(position.x*wid, position.y*len, position.z*len);
        // pitch: nearly upright when a bud, fanned when open
        float pit = mix(0.16, 1.16, b) + sin(uTime*1.3 + aSpin*3.0)*0.05*b;
        float cp = cos(pit), sp = sin(pit);
        p = vec3(p.x, p.y*cp - p.z*sp, p.y*sp + p.z*cp);
        float cy = cos(aSpin), sy = sin(aSpin);
        p = vec3(p.x*cy - p.z*sy, p.y, p.x*sy + p.z*cy);
        vec3 w = aBase + p;
        w.x += sin(uTime*1.5 + aBase.x*0.2 + aBase.z*0.15)*0.035;
        vUv = uv; vBud = 1.0-b;
        vec3 bud  = vec3(0.96,0.83,0.49);
        vec3 open = mix(hue2rgb(aHue), vec3(1.0), 0.30);
        vCol = mix(bud, open, b) * (0.72 + 0.42*position.y);
        vCol += vec3(0.25,0.22,0.10) * (1.0-b) * 0.5;   // buds catch the light
        vFog = smoothstep(uFog.x, uFog.y, length(w.xz - uCam.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHaze,uLight; varying vec3 vCol; varying float vFog; varying vec2 vUv; varying float vBud;
      void main(){
        // A pale edge and a warm throat describe the cup without a bloom pass.
        float edge = pow(abs(vUv.x*2.0-1.0),2.0);
        vec3 c = vCol * (0.88 + edge*0.12);
        c = mix(vec3(0.83,0.52,0.10), c, smoothstep(0.02,0.32,vUv.y));
        c *= uLight;
        c += vec3(0.16,0.105,0.028)*vBud*smoothstep(0.25,0.95,vUv.y);
        gl_FragColor = vec4(mix(c, uHaze, vFog), 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material, geometry, aBase, aSpin, aBloom, aHue };
}

function buildStems() {
  const geometry = new THREE.InstancedBufferGeometry();
  // Taller stems lift the buds above the short grass in their clearings.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, 0, 0, 0.5, 0, 0, -0.22, 0.72, 0, 0.22, 0.72, 0], 3));
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
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uHaze: { value: HAZE }, uFog: { value: FOG }, uLight: { value: LIGHT },
    },
    vertexShader: `
      attribute vec3 aBase; attribute float aSeed;
      uniform float uTime; uniform vec3 uCam; uniform vec2 uFog;
      varying float vFog; varying float vT;
      void main(){
        vec3 p = vec3(position.x*0.028, position.y, 0.0);
        float sway = sin(uTime*1.5 + aBase.x*0.2 + aBase.z*0.15)*0.035;
        p.x += sway*pow(position.y/0.72,2.0);
        vec3 w = aBase + p;
        vT = position.y;
        vFog = smoothstep(uFog.x, uFog.y, length(w.xz - uCam.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHaze,uLight; varying float vFog; varying float vT;
      void main(){
        vec3 c = mix(vec3(0.16,0.30,0.12), vec3(0.34,0.48,0.18), vT);
        gl_FragColor = vec4(mix(c * uLight, uHaze, vFog), 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material, geometry, sBase, sSeed };
}

export function createFlowers(scene, meadow, home) {
  const heads = buildHeads();
  const stems = buildStems();
  scene.add(heads.mesh, stems.mesh);

  let flowers = [];            // {id,x,y,z,hue,bloom,target,seed,awarded}
  const bloomState = {};       // id -> true (an opened flower stays open)
  let lastCellI = 1e9, lastCellJ = 1e9;

  function rebuild(px, pz) {
    const keep = new Map(flowers.map(f => [f.id, f]));
    flowers = flowerLayout(px, pz, home).map(f => keep.get(f.id) || {
      ...f, bloom: bloomState[f.id] ? 1 : 0, target: bloomState[f.id] ? 1 : 0,
      awarded: !!bloomState[f.id],
    });
    meadow.rebuild(flowers, px, pz);
  }

  function writeBuffers() {
    const n = flowers.length;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const f = flowers[i];
      const headY = f.y + 0.72;
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

  return { update, setUniforms, setTime, rebuild };
}
