import * as THREE from 'three';
import { GLSL_FIELD, fieldUniforms } from './field.js';
import { SUN, LIGHT, HAZE, FOG, GRASS_R, GRASS_MAX, WIND_DIR } from './config.js';

// Three lattices, each repeating on its own period around you. A blade belongs
// to one of them for good, and the shader draws whichever copy of it is nearest
// — so the blades are nailed to the world and you fly over them, instead of the
// whole meadow being dragged along under you a metre at a time.
//
// One lattice would have to be uniform, and uniform is the wrong shape: you
// want a thicket underfoot and something thinner in the distance. Overlapping
// three, each dying at its own rim, gives the density falloff back.
// r = how far this lattice reaches, d = blades per square metre it contributes.
const RINGS = [
  { r: 12.0,    d: 12.0 },
  { r: 24.0,    d: 4.0 },
  { r: GRASS_R, d: 4.5 },
];

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
  const tile = new Float32Array(GRASS_MAX);

  // Blades are handed out between the lattices in proportion to the area each
  // one has to fill at the density it asks for. GRASS_MAX stays the one budget:
  // change it and every ring thins together.
  const want = RINGS.map(g => g.d * 4.0 * g.r * g.r);
  const total = want.reduce((a, b) => a + b, 0);

  for (let i = 0; i < GRASS_MAX; i++) {
    // Drawn rather than blocked out, so that trimming instanceCount for a
    // headset thins all three rings in proportion instead of amputating one.
    let pick = Math.random() * total, g = 0;
    while (g < RINGS.length - 1 && (pick -= want[g]) > 0) g++;
    const p = RINGS[g].r * 2.0;
    // Uniform across one whole tile — the tile is what repeats, so a gap in it
    // would be a bald patch every p metres of world.
    off[i * 2] = Math.random() * p;
    off[i * 2 + 1] = Math.random() * p;
    tile[i] = p;
    rnd[i * 3] = Math.random();
    rnd[i * 3 + 1] = Math.random();
    rnd[i * 3 + 2] = Math.random();
  }
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 3));
  geometry.setAttribute('aTile', new THREE.InstancedBufferAttribute(tile, 1));
  geometry.instanceCount = GRASS_MAX;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: Object.assign({
      uCam: { value: new THREE.Vector3() },
      uVel: { value: new THREE.Vector3() },
      uWind: { value: WIND_DIR },
      uTime: { value: 0 }, uForce: { value: 0 }, uRadius: { value: GRASS_R },
      uSun: { value: SUN }, uLight: { value: LIGHT },
      uHaze: { value: HAZE }, uFog: { value: FOG },
    }, fieldUniforms()),
    vertexShader: GLSL_FIELD + `
      attribute vec2 aOffset; attribute vec3 aRand; attribute float aTile;
      uniform vec2 uFog, uWind; uniform vec3 uCam,uVel; uniform float uTime,uForce,uRadius;
      varying vec3 vCol; varying float vFog; varying float vBend;
      void main(){
        // The copy of this blade's lattice nearest the camera. Nothing here
        // depends on where you were last frame, so the blade does not move —
        // when you outrun it, it reappears a whole tile behind you, out where
        // its own ring has already faded it to nothing.
        vec2 base = aOffset + aTile * floor((uCam.xz - aOffset)/aTile + 0.5);
        float dist = length(base - uCam.xz);
        float edge = 1.0 - smoothstep(aTile*0.28, aTile*0.5, dist);

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

        // Climb, and a blade is thinner than the pixel it lands in: it stops
        // being grass and starts being a sparkle. So the field lies down as you
        // go up, and the moving shading on the ground carries it from there.
        float alt = max(uCam.y - gh, 0.0);
        float lift = 1.0 - smoothstep(8.0, 26.0, alt);

        float H = (0.52 + aRand.x*0.72) * edge * cover * rim * lift;
        float t = uv.y;
        vec3 p = position;
        // The same argument sideways: a blade narrower than the pixel it lands
        // in cannot be drawn, only flickered. Past a dozen metres they widen to
        // hold their ground — the field keeps its weight instead of sparkling.
        p.x *= 1.0 + max(dist - 12.0, 0.0)*0.04;
        p.y *= H;
        float ry = aRand.y*6.2832;
        float cs = cos(ry), sn = sin(ry);
        p.xz = vec2(p.x*cs - p.z*sn, p.x*sn + p.z*cs);

        // ambient breeze — the same gust fronts terrain.js paints on the hills,
        // travelling downwind at the same speed, so the two agree at the seam
        float along = dot(base, uWind), across = dot(base, vec2(-uWind.y, uWind.x));
        float sway = sin(uTime*1.6 + base.x*0.34 + base.y*0.29 + aRand.z*6.28)*0.10
                   + sin(uTime*0.55 + base.x*0.05 + base.y*0.04)*0.14
                   + sin((along*0.085 - uTime*0.55)*6.2832 + across*0.283)*0.13;
        vec2 bend = uWind * sway;

        // the player's own gust
        vec2 d = base - uCam.xz;
        float dl = max(length(d), 0.001);
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
        // A pale tip on dark ground is a bright dot once it is a pixel wide, and
        // a field of bright dots crawls. Far blades give their tips back up.
        vCol = mix(vCol, dark*1.2, smoothstep(uRadius*0.42, uRadius, dist)*0.55);
        vBend = bl;
        // The blades mostly leave by getting shorter, ring by ring, into ground
        // that is already moving like grass. A little haze over the last of them
        // takes the edge off; thick weather closes in sooner, so take whichever
        // hides more.
        vFog = max(smoothstep(uRadius*0.62, uRadius, dist)*0.55,
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
    // Instances were dealt out between the rings at random, so cutting the
    // count here thins all three in step: the field gets airier, not shorter.
    setDensity(n) { geometry.instanceCount = Math.max(0, Math.min(GRASS_MAX, n | 0)); },
  };
}
