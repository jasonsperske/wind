import * as THREE from 'three';
import { GLSL_FIELD, fieldUniforms } from './field.js';
import { GLSL_MEADOW } from './meadow.js';
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
  { r: 12.0,    d: 42.0 },
  { r: 24.0,    d: 6.0 },
  { r: GRASS_R, d: 3.5 },
];

function bladeGeometry() {
  const segs = 6, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.024 * Math.pow(1.0 - t, 0.85) + 0.0006;
    pos.push(-w, t, 0, w, t, 0);
    uvs.push(0, t, 1, t);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { pos, uv: uvs, idx };
}

export function createGrass(meadow) {
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
    }, fieldUniforms(), meadow.uniforms),
    vertexShader: GLSL_FIELD + GLSL_MEADOW + `
      attribute vec2 aOffset; attribute vec3 aRand; attribute float aTile;
      uniform vec2 uFog, uWind; uniform vec3 uCam,uVel,uSun; uniform float uTime,uForce,uRadius;
      varying vec3 vCol; varying float vFog; varying vec2 vBlade;
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

        // Broad rooted patches vary the silhouette; shorter grass frames each bud.
        float tuft = sin(base.x*0.23+sin(base.y*0.17))*sin(base.y*0.29+base.x*0.07)*0.5+0.5;
        vec2 meadow = meadowAt(base);
        float clearing = meadow.r;
        vec3 bloom = bloomWave(base);
        float H = (0.42 + aRand.x*0.50) * mix(0.72,1.15,tuft)
                * mix(1.0,0.30,clearing) * edge * cover * rim * lift;
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
        float front = sin(along*0.14 - uTime*0.85 + sin(across*0.10)*0.65);
        float sway = 0.32 + front*0.20
                   + sin(along*0.43-uTime*1.5+aRand.z*1.5)*0.045;
        vec2 bend = uWind * sway + bloom.xy*0.42;
        // A small crosswind lets the tips trace soft arcs rather than flap.
        bend += vec2(-uWind.y,uWind.x)*sin(uTime*0.72+along*0.12+aRand.z)*0.055;

        // the player's own gust
        vec2 d = base - uCam.xz;
        float dl = max(length(d), 0.001);
        float infl = exp(-dl*0.085) * exp(-alt*0.20) * (0.85 + uForce*1.9);
        bend += (d/dl) * infl * 1.7;
        bend += uVel.xz * infl * 0.085;
        float bl = length(bend);
        bend = bend / max(bl,0.0001) * min(bl, 1.45);
        bl = length(bend);
        // Bend along an arc, preserving blade length as the wind strengthens.
        // Individual curl gives silhouettes variety within the shared gust.
        bend += vec2(cs,sn)*(0.12+aRand.z*0.24);
        float angle = max(length(bend),0.001);
        vec2 arc = bend/angle * H*(1.0-cos(t*angle))/angle;
        p.xz += arc;
        p.y = H*sin(t*angle)/angle;

        vec3 w = vec3(base.x + p.x, gh + p.y, base.y + p.z);
        vec3 dark = mix(vec3(0.13,0.24,0.055),vec3(0.19,0.29,0.07),tuft);
        vec3 tip  = mix(vec3(0.36,0.49,0.11), vec3(0.57,0.65,0.23), tuft*0.6+aRand.x*0.4);
        // straw where the ground turns to sand, grey sage where it freezes
        dark = mix(dark, vec3(0.35,0.29,0.16), lw.y);
        tip  = mix(tip,  vec3(0.80,0.70,0.45), lw.y);
        dark = mix(dark, vec3(0.28,0.34,0.33), lw.z);
        tip  = mix(tip,  vec3(0.63,0.71,0.70), lw.z);
        tip = mix(tip, tip*vec3(0.94,1.13,0.88), meadow.g*0.65);
        vCol = mix(dark, tip, smoothstep(0.0,1.0,t)*0.88+0.12);
        // Rounded blade lighting and backlit tips give the field depth.
        vec3 normal = normalize(vec3(-sn,0.28+bl*0.35,cs));
        float diffuse = abs(dot(normal,uSun));
        vec3 eye = normalize(uCam-w);
        float through = pow(max(dot(-eye,uSun),0.0),3.0);
        vCol *= 0.82 + diffuse*0.28;
        vCol += vec3(0.24,0.30,0.055)*through*t*t;
        vCol *= 0.87 + 0.13*smoothstep(0.0,0.65,t);
        // A pale tip on dark ground is a bright dot once it is a pixel wide, and
        // a field of bright dots crawls. Far blades give their tips back up.
        vCol = mix(vCol, dark*1.2, smoothstep(uRadius*0.42, uRadius, dist)*0.55);
        vCol += vec3(0.20,0.16,0.035)*bloom.z*t;
        vBlade = uv;
        // The blades mostly leave by getting shorter, ring by ring, into ground
        // that is already moving like grass. A little haze over the last of them
        // takes the edge off; thick weather closes in sooner, so take whichever
        // hides more.
        vFog = max(smoothstep(uRadius*0.62, uRadius, dist)*0.55,
                   smoothstep(uFog.x, uFog.y, dist));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHaze,uLight; varying vec3 vCol; varying float vFog; varying vec2 vBlade;
      void main(){
        // Smooth cross-blade shading prevents a flat ribbon face at close range.
        float roundness = 1.0 - pow(abs(vBlade.x*2.0-1.0),2.0);
        vec3 lit = vCol * (0.91 + roundness*0.12) * uLight;
        vec3 c = mix(lit, uHaze, vFog);
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
