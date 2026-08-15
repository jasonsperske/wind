import * as THREE from 'three';
import { GLSL_FIELD, fieldUniforms } from './field.js';
import { SUN, LIGHT, HAZE, FOG, GRASS_R, GRASS_MAX } from './config.js';

function bladeGeometry() {
  const segs = 4, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.052 * (1.0 - t * 0.92);
    pos.push(-w, t, 0, w, t, 0);
    uvs.push(0, t, 1, t);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { pos, uv: uvs, idx };
}

export function createGrass() {
  const gb = bladeGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(gb.pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(gb.uv, 2));
  geometry.setIndex(gb.idx);

  const off = new Float32Array(GRASS_MAX * 2), rnd = new Float32Array(GRASS_MAX * 3);
  for (let i = 0; i < GRASS_MAX; i++) {
    // inward-biased disc: lush near the wind, thinning into the haze. The bias
    // also means a lowered instanceCount thins the far field first.
    const a = Math.random() * Math.PI * 2;
    const r = GRASS_R * Math.pow(Math.random(), 0.78);
    off[i * 2] = Math.cos(a) * r;
    off[i * 2 + 1] = Math.sin(a) * r;
    rnd[i * 3] = Math.random();
    rnd[i * 3 + 1] = Math.random();
    rnd[i * 3 + 2] = Math.random();
  }
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 3));
  geometry.instanceCount = GRASS_MAX;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: Object.assign({
      uOrigin: { value: new THREE.Vector2() },
      uCam: { value: new THREE.Vector3() },
      uVel: { value: new THREE.Vector3() },
      uTime: { value: 0 }, uForce: { value: 0 }, uRadius: { value: GRASS_R },
      uSun: { value: SUN }, uLight: { value: LIGHT },
      uHaze: { value: HAZE }, uFog: { value: FOG },
    }, fieldUniforms()),
    vertexShader: GLSL_FIELD + `
      attribute vec2 aOffset; attribute vec3 aRand;
      uniform vec2 uOrigin, uFog; uniform vec3 uCam,uVel; uniform float uTime,uForce,uRadius;
      varying vec3 vCol; varying float vFog; varying float vBend;
      void main(){
        vec2 base = uOrigin + aOffset;
        float dist = length(base - uCam.xz);
        float edge = 1.0 - smoothstep(uRadius*0.70, uRadius, dist);

        // one pair of lookups, for the ground height and for what grows on it
        vec4 f = fieldA(base);
        vec4 b = fieldB(base);
        float gh = heightOf(f, b.a, base);
        vec3 lw = b.rgb;
        lw /= max(lw.x+lw.y+lw.z, 1e-3);
        // grass over the meadow, frozen tufts on the tundra, next to nothing on sand
        float cover = lw.x + lw.z*0.26 + lw.y*0.07;
        cover *= 1.0 - clamp(b.a*1.6, 0.0, 1.0);      // and nothing at all in a lake
        // and it gives out before the ground does, so the edge is visible early
        float rim = smoothstep(-16.0, 1.0, f.z);

        float H = (0.52 + aRand.x*0.72) * edge * cover * rim;
        float t = uv.y;
        vec3 p = position;  p.y *= H;
        float ry = aRand.y*6.2832;
        float cs = cos(ry), sn = sin(ry);
        p.xz = vec2(p.x*cs - p.z*sn, p.x*sn + p.z*cs);

        // ambient breeze
        float sway = sin(uTime*1.6 + base.x*0.34 + base.y*0.29 + aRand.z*6.28)*0.10
                   + sin(uTime*0.55 + base.x*0.05 + base.y*0.04)*0.20;
        vec2 bend = normalize(vec2(0.82,0.57)) * sway;

        // the player's own gust
        vec2 d = base - uCam.xz;
        float dl = max(length(d), 0.001);
        float alt = max(uCam.y - gh, 0.0);
        float infl = exp(-dl*0.085) * exp(-alt*0.20) * (0.85 + uForce*1.9);
        bend += (d/dl) * infl * 1.7;
        bend += uVel.xz * infl * 0.085;
        float bl = length(bend);
        bend = bend / max(bl,0.0001) * min(bl, 1.45);
        bl = length(bend);
        float k = t*t;
        p.x += bend.x*H*k;  p.z += bend.y*H*k;
        p.y -= bl*H*k*0.42;

        vec3 w = vec3(base.x + p.x, gh + p.y, base.y + p.z);
        vec3 dark = vec3(0.13,0.26,0.10);
        vec3 tip  = mix(vec3(0.46,0.62,0.22), vec3(0.66,0.72,0.34), aRand.x);
        // straw where the ground turns to sand, grey sage where it freezes
        dark = mix(dark, vec3(0.35,0.29,0.16), lw.y);
        tip  = mix(tip,  vec3(0.80,0.70,0.45), lw.y);
        dark = mix(dark, vec3(0.28,0.34,0.33), lw.z);
        tip  = mix(tip,  vec3(0.63,0.71,0.70), lw.z);
        vCol = mix(dark, tip, t*0.9 + 0.1);
        vCol += vec3(0.30,0.34,0.22) * clamp(bl,0.0,1.2) * (0.25 + t*0.75);
        vBend = bl;
        // the grass disc always fades at its own rim; thick weather closes in
        // sooner than that, so take whichever hides more
        vFog = max(smoothstep(uRadius*0.38, uRadius*0.96, dist),
                   smoothstep(uFog.x, uFog.y, dist));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHaze,uLight; varying vec3 vCol; varying float vFog; varying float vBend;
      void main(){
        vec3 c = mix(vCol * uLight, uHaze, vFog);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh, material, geometry,
    setDensity(n) { geometry.instanceCount = Math.max(0, Math.min(GRASS_MAX, n | 0)); },
  };
}
