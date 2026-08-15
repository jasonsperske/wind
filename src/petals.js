import * as THREE from 'three';
import { GLSL_HSV } from './field.js';
import { HAZE, FLYMAX, CARRY_MAX } from './config.js';
import { petalGeometry } from './flowers.js';

/* ----------------------- petals in flight toward you ---------------------- */
export function createFlyingPetals(scene) {
  const geometry = new THREE.InstancedBufferGeometry();
  const src = petalGeometry();
  geometry.setAttribute('position', src.getAttribute('position'));
  geometry.setAttribute('uv', src.getAttribute('uv'));
  geometry.setIndex(src.getIndex());

  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(FLYMAX * 3), 3);
  const aRot = new THREE.InstancedBufferAttribute(new Float32Array(FLYMAX), 1);
  const aHue = new THREE.InstancedBufferAttribute(new Float32Array(FLYMAX), 1);
  for (const a of [aPos, aRot, aHue]) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPos', aPos);
  geometry.setAttribute('aRot', aRot);
  geometry.setAttribute('aHue', aHue);
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true,
    uniforms: { uHaze: { value: HAZE } },
    vertexShader: GLSL_HSV + `
      attribute vec3 aPos; attribute float aRot, aHue;
      varying vec3 vCol;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float c = cos(aRot), s = sin(aRot);
        vec2 q = vec2(position.x*0.13, (position.y-0.5)*0.20);
        q = vec2(q.x*c - q.y*s, q.x*s + q.y*c);
        vec3 w = aPos + R*q.x + U*q.y;
        vCol = mix(hue2rgb(aHue), vec3(1.0), 0.35);
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: 'varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 0.96); }',
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const flying = [];
  const tmp = new THREE.Vector3();

  function spawn(f, count) {
    for (let g = 0; g < count; g++) {
      if (flying.length >= FLYMAX) break;
      flying.push({
        p: new THREE.Vector3(f.x + (Math.random() - 0.5) * 0.4, f.y + 0.5, f.z + (Math.random() - 0.5) * 0.4),
        v: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3),
        hue: 0.92 + f.hue * 0.22,
        rot: Math.random() * 6.28,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  }

  // Returns how many petals reached the player this frame.
  function update(dt, camPos, elapsed) {
    let w = 0, caught = 0;
    for (let k = 0; k < flying.length; k++) {
      const fp = flying[k];
      tmp.copy(camPos).sub(fp.p);
      const d = tmp.length();
      if (d < 1.1) { caught++; continue; }
      tmp.multiplyScalar(1 / Math.max(d, 0.001));
      fp.v.addScaledVector(tmp, dt * (16 + 40 / Math.max(d, 1)));
      fp.v.y += Math.sin(elapsed * 3 + k) * dt * 2.0;
      fp.v.multiplyScalar(1 - Math.min(1, dt * 1.6));
      fp.p.addScaledVector(fp.v, dt);
      fp.rot += fp.spin * dt;
      aPos.array[w * 3] = fp.p.x;
      aPos.array[w * 3 + 1] = fp.p.y;
      aPos.array[w * 3 + 2] = fp.p.z;
      aRot.array[w] = fp.rot;
      aHue.array[w] = fp.hue;
      flying[w] = fp; w++;
    }
    flying.length = w;
    geometry.instanceCount = w;
    aPos.needsUpdate = aRot.needsUpdate = aHue.needsUpdate = true;
    return caught;
  }

  return { spawn, update };
}

/* -------------------- petals already swirling around you ------------------ */
export function createCarriedPetals(scene) {
  const geometry = new THREE.InstancedBufferGeometry();
  const src = petalGeometry();
  geometry.setAttribute('position', src.getAttribute('position'));
  geometry.setAttribute('uv', src.getAttribute('uv'));
  geometry.setIndex(src.getIndex());
  const idx = new Float32Array(CARRY_MAX);
  for (let i = 0; i < CARRY_MAX; i++) idx[i] = i;
  geometry.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1));
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uCount: { value: 0 }, uFwd: { value: new THREE.Vector3(0, 0, -1) }, uSpeed: { value: 0 },
    },
    vertexShader: GLSL_HSV + `
      attribute float aIdx;
      uniform float uTime, uCount, uSpeed; uniform vec3 uCam, uFwd;
      varying vec3 vCol; varying float vHide;
      void main(){
        vHide = step(uCount, aIdx);
        float f = fract(aIdx*0.6180339);
        float ang = aIdx*2.39996 + uTime*(0.55 + f*0.8) - uSpeed*0.03;
        float rad = 0.85 + f*1.7;
        float yy  = -0.55 + 1.1*fract(aIdx*0.37) + sin(uTime*0.8 + aIdx)*0.18;
        vec3 side = normalize(cross(vec3(0.0,1.0,0.0), uFwd));
        vec3 up   = vec3(0.0,1.0,0.0);
        vec3 pos  = uCam + side*cos(ang)*rad + uFwd*(sin(ang)*rad - 0.5) + up*yy;
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float rot = uTime*(1.4 + f*1.6) + aIdx;
        float c = cos(rot), s = sin(rot);
        vec2 q = vec2(position.x*0.10, (position.y-0.5)*0.16);
        q = vec2(q.x*c - q.y*s, q.x*s + q.y*c);
        vec3 w = pos + R*q.x + U*q.y;
        vCol = mix(hue2rgb(0.92 + f*0.22), vec3(1.0), 0.32);
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vHide;
      void main(){ if (vHide > 0.5) discard; gl_FragColor = vec4(vCol, 0.92); }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function update(camPos, fwd, elapsed, speed, petals) {
    const n = Math.min(petals, CARRY_MAX);
    material.uniforms.uCam.value.copy(camPos);
    material.uniforms.uTime.value = elapsed;
    material.uniforms.uSpeed.value = speed;
    material.uniforms.uCount.value = n;
    material.uniforms.uFwd.value.copy(fwd).setY(0).normalize();
    geometry.instanceCount = n;
  }

  return { update };
}
