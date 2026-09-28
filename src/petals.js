import * as THREE from 'three';
import { GLSL_HSV } from './field.js';
import { LIGHT, SUN, HAZE, FOG, FLYMAX, CARRY_MAX } from './config.js';
import { petalGeometry } from './flowers.js';
import { createPetalPath, FLOW_POINTS } from './petal-path.js';

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
    uniforms: { uLight: { value: LIGHT } },
    vertexShader: GLSL_HSV + `
      attribute vec3 aPos; attribute float aRot, aHue;
      varying vec3 vCol;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float c = cos(aRot), s = sin(aRot);
        vec2 q = vec2(position.x*0.13, (position.y-0.5)*0.20);
        q = vec2(q.x*c - q.y*s, q.x*s + q.y*c);
        vec3 w = aPos + R*q.x + U*q.y + cross(R,U)*position.z*0.20;
        vCol = mix(hue2rgb(aHue), vec3(1.0), 0.35)*(0.78+0.22*uv.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uLight; varying vec3 vCol;
      void main(){ gl_FragColor = vec4(vCol * uLight, 0.96); }`,
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
        p: new THREE.Vector3(f.x + (Math.random() - 0.5) * 0.4, f.y + 0.82, f.z + (Math.random() - 0.5) * 0.4),
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

/* ---------------------- petals carried along the wind -------------------- */
export function createCarriedPetals(scene) {
  const path = createPetalPath();
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
      uFlow: { value: path.points }, uLight: { value: LIGHT }, uSun: { value: SUN },
      uHaze: { value: HAZE }, uFog: { value: FOG },
    },
    vertexShader: GLSL_HSV + `
      attribute float aIdx;
      uniform float uTime; uniform vec3 uCam, uSun;
      uniform vec3 uFlow[${FLOW_POINTS}];
      uniform vec2 uFog;
      varying vec3 vCol; varying float vAlpha, vFog;
      void main(){
        float seed = fract(aIdx*0.6180339);
        float phase = fract(seed + uTime*0.085);
        float along = phase*${(FLOW_POINTS-1).toFixed(1)};
        int segment = int(min(floor(along),${(FLOW_POINTS-2).toFixed(1)}));
        vec3 a = uFlow[segment], b = uFlow[segment+1];
        vec3 center = mix(a,b,along-float(segment));
        vec3 tangent = b-a;
        tangent = dot(tangent,tangent)>0.000001 ? normalize(tangent) : vec3(0.0,0.0,-1.0);
        // Keep the side vector finite for a near-vertical flight path.
        vec3 side = cross(tangent,vec3(0.0,1.0,0.0));
        if (dot(side,side)<0.001) side = vec3(1.0,0.0,0.0);
        side = normalize(side);
        vec3 up = normalize(cross(side,tangent));
        float strand = mod(aIdx,2.0)*2.0-1.0;
        float curl = sin(phase*10.0-uTime*1.1+strand)*0.28;
        float spread = 1.15 + sin(phase*3.14159)*0.65;
        vec3 pos = center + side*(strand*spread+curl)
          + up*(-0.25+sin(phase*13.0+uTime*0.7)*0.28+fract(aIdx*0.37)*0.35);

        // Rotate a world-space cup, shared by both eyes, rather than a camera card.
        float roll = uTime*(0.8+seed*0.7)+aIdx*2.4;
        float pitch = sin(uTime*1.4+aIdx)*0.65;
        vec3 R = side*cos(roll)+up*sin(roll);
        vec3 U = (-side*sin(roll)+up*cos(roll))*cos(pitch)+tangent*sin(pitch);
        vec3 N = normalize(cross(R,U));
        vec3 w = pos + R*position.x*0.19 + U*(position.y-0.5)*0.28 + N*position.z*0.28;
        vec3 color = mix(hue2rgb(0.92+fract(aIdx*0.75487766)*0.22),vec3(1.0),0.38);
        float through = pow(max(dot(normalize(uCam-w),-uSun),0.0),3.0);
        vCol = color*(0.78+0.22*uv.y)*(0.80+abs(dot(N,uSun))*0.20)
             + vec3(0.15,0.11,0.035)*through;
        // Fade before reaching the face and at the wrap from tail back to lead.
        vAlpha = smoothstep(1.35,2.5,length(pos-uCam))
               * smoothstep(0.0,0.07,phase)*(1.0-smoothstep(0.91,1.0,phase));
        vFog = smoothstep(uFog.x,uFog.y,length(pos-uCam));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uLight,uHaze; varying vec3 vCol; varying float vAlpha,vFog;
      void main(){ gl_FragColor = vec4(mix(vCol*uLight,uHaze,vFog),vAlpha*0.94); }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function update(camPos, fwd, elapsed, speed, petals) {
    path.update(camPos,fwd,elapsed,speed);
    material.uniforms.uCam.value.copy(camPos);
    material.uniforms.uTime.value = elapsed;
    geometry.instanceCount = Math.max(0,Math.min(Math.floor(petals),CARRY_MAX));
  }

  return { update };
}
