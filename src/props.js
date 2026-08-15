// Trees and rocks.
//
// Both come off a fixed lattice, the same trick the flowers use: a hash decides
// what stands in each cell, so nothing is stored, nothing is spawned, and a
// tree is in the same place every time you pass it. The scatter shapes drawn in
// the map decide where the lattice is allowed to grow anything, and their
// `data-density` thins it.
//
// Nothing here is solid. You are wind — you go through the branches.

import * as THREE from 'three';
import { fieldUniforms, fieldAt, hills, hash2 } from './field.js';
import { scatterAt } from './regions.js';
import {
  SUN, LIGHT, HAZE, FOG,
  TREE_CELL, TREE_RING, TREE_MAX, ROCK_CELL, ROCK_RING, ROCK_MAX,
} from './config.js';

/* ------------------------------- geometry -------------------------------- */

// Vertex colours ride in aCol and the bend weight in aBend, both declared here
// rather than borrowed from three's built-ins, so the shader below is the whole
// story.
function buildGeometry(pos, nrm, col, bend, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aNrm', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBend', new THREE.Float32BufferAttribute(bend, 1));
  if (idx) g.setIndex(idx);
  return g;
}

// A trunk that tapers, and three canopy shells that overlap. Flat-shaded, and
// the canopy carries a bend weight so the gust pushes the top of the tree
// around without dragging the roots with it.
function treeGeometry() {
  const pos = [], nrm = [], col = [], bend = [], idx = [];
  const bark = [0.29, 0.22, 0.15], barkTop = [0.36, 0.29, 0.19];

  function push(x, y, z, nx, ny, nz, c, b) {
    pos.push(x, y, z); nrm.push(nx, ny, nz); col.push(c[0], c[1], c[2]); bend.push(b);
    return pos.length / 3 - 1;
  }

  const SIDES = 5, TRUNK = 1.35;
  const ring0 = [], ring1 = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    ring0.push(push(cx * 0.19, 0, cz * 0.19, cx, 0.15, cz, bark, 0));
    ring1.push(push(cx * 0.10, TRUNK, cz * 0.10, cx, 0.15, cz, barkTop, 0.25));
  }
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES;
    idx.push(ring0[i], ring1[i], ring0[j], ring1[i], ring1[j], ring0[j]);
  }

  // Three lobes, stacked and offset, so the silhouette is lumpy rather than a
  // cone. Two rings each rather than one equator — a single ring of points
  // reads as a flat plate from the side, which is what a tree least looks like.
  // Normals point out from the lobe's own centre, so the shading rounds off
  // even though there are only a couple of dozen faces in it.
  const SEG = 7;
  const RINGS = [{ t: 0.46, r: 0.60 }, { t: -0.16, r: 1.0 }];
  const shells = [
    { y: 1.58, r: 1.02, h: 0.86, dx: 0.00, dz: 0.00, c: [0.20, 0.36, 0.17], b: 0.55 },
    { y: 2.22, r: 0.84, h: 0.78, dx: 0.17, dz: -0.11, c: [0.26, 0.44, 0.20], b: 0.80 },
    { y: 2.78, r: 0.58, h: 0.62, dx: -0.11, dz: 0.15, c: [0.33, 0.52, 0.24], b: 1.00 },
  ];
  for (const s of shells) {
    const rings = [];
    for (const R of RINGS) {
      const ring = [];
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const wob = 0.86 + 0.28 * (Math.sin(a * 3.1 + s.y * 5.0) * 0.5 + 0.5);
        const rr = s.r * R.r * wob;
        const x = s.dx + Math.cos(a) * rr;
        const y = s.y + s.h * R.t;
        const z = s.dz + Math.sin(a) * rr;
        const nx = x - s.dx, ny = (y - s.y) * 1.4, nz = z - s.dz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const shade = 0.86 + 0.20 * (ny / nl * 0.5 + 0.5);
        ring.push(push(x, y, z, nx / nl, ny / nl, nz / nl,
          [s.c[0] * shade, s.c[1] * shade, s.c[2] * shade], s.b));
      }
      rings.push(ring);
    }
    const up = [s.c[0] * 1.20, s.c[1] * 1.20, s.c[2] * 1.20];
    const dn = [s.c[0] * 0.58, s.c[1] * 0.58, s.c[2] * 0.58];
    const top = push(s.dx, s.y + s.h, s.dz, 0, 1, 0, up, s.b);
    const bot = push(s.dx, s.y - s.h * 0.80, s.dz, 0, -1, 0, dn, s.b * 0.7);
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      idx.push(rings[0][i], top, rings[0][j]);                      // cap
      idx.push(rings[0][i], rings[0][j], rings[1][i]);              // side
      idx.push(rings[0][j], rings[1][j], rings[1][i]);
      idx.push(rings[1][j], bot, rings[1][i]);                      // underside
    }
  }
  return buildGeometry(pos, nrm, col, bend, idx);
}

// A lumpy boulder: an octahedron pushed about, flat-shaded.
function rockGeometry() {
  const pts = [
    [0, 1, 0], [0, -0.72, 0],
    [1, 0.08, 0], [0, 0.02, 1], [-1, 0.10, 0], [0, 0.06, -1],
  ];
  const faces = [
    [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2],
    [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5],
  ];
  const pos = [], nrm = [], col = [], bend = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    const v = f.map((k, i) => {
      const p = pts[k];
      const w = 0.86 + 0.28 * Math.abs(Math.sin(k * 3.7 + fi * 1.9 + i));
      return [p[0] * w, p[1] * (0.72 + 0.20 * w), p[2] * w];
    });
    a.fromArray(v[0]); b.fromArray(v[1]); c.fromArray(v[2]);
    ab.subVectors(b, a); ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();
    const shade = 0.80 + 0.24 * (n.y * 0.5 + 0.5);
    for (const p of v) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(n.x, n.y, n.z);
      col.push(0.42 * shade, 0.41 * shade, 0.38 * shade);
      bend.push(0);
    }
  }
  return buildGeometry(pos, nrm, col, bend, null);
}

/* -------------------------------- drawing -------------------------------- */

// aPlace: x, ground height, z, seed.  aShape: scale, yaw, lean, tint.
function makeMaterial(sway) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uSun: { value: SUN }, uLight: { value: LIGHT },
      uHaze: { value: HAZE }, uFog: { value: FOG },
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uForce: { value: 0 }, uSway: { value: sway },
    }, fieldUniforms()),
    vertexShader: `
      attribute vec3 aNrm, aCol; attribute float aBend;
      attribute vec4 aPlace, aShape;
      uniform vec3 uCam; uniform vec2 uFog; uniform float uTime, uForce, uSway;
      varying vec3 vCol; varying vec3 vN; varying float vFog;

      // lean about x, then turn about y — a tree that only spins looks stamped
      vec3 shape(vec3 p, float lean, float cy, float sy){
        float cl = cos(lean), sl = sin(lean);
        p = vec3(p.x, p.y*cl - p.z*sl, p.y*sl + p.z*cl);
        return vec3(p.x*cy - p.z*sy, p.y, p.x*sy + p.z*cy);
      }

      void main(){
        float sc = aShape.x;
        float cy = cos(aShape.y), sy = sin(aShape.y);
        vec3 p = shape(position * sc, aShape.z, cy, sy);
        vN = normalize(shape(aNrm, aShape.z, cy, sy));

        vec3 base = vec3(aPlace.x, aPlace.y, aPlace.z);

        // the ambient breeze, and then your own gust shoving it over
        float w8 = aBend * uSway;
        if (w8 > 0.0) {
          float t = uTime * 0.9 + aPlace.w * 6.2832;
          vec2 amb = vec2(sin(t)*0.10 + sin(t*0.41)*0.06, cos(t*0.83)*0.08);
          vec2 d = base.xz - uCam.xz;
          float dl = max(length(d), 0.001);
          float alt = max(uCam.y - base.y, 0.0);
          float infl = exp(-dl*0.045) * exp(-alt*0.10) * (0.5 + uForce*1.6);
          vec2 bend = amb + (d/dl) * infl * 0.75;
          float bl = length(bend);
          bend = bend / max(bl, 0.0001) * min(bl, 0.85);
          p.xz += bend * w8 * sc;
          p.y -= length(bend) * w8 * sc * 0.22;
        }

        vec3 w = base + p;
        vCol = aCol * mix(vec3(1.0), vec3(1.07,1.02,0.90), aShape.w);
        vFog = smoothstep(uFog.x, uFog.y, length(w.xz - uCam.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSun,uLight,uHaze;
      varying vec3 vCol; varying vec3 vN; varying float vFog;
      void main(){
        float lam = max(dot(normalize(vN), uSun), 0.0)*0.66 + 0.44;
        gl_FragColor = vec4(mix(vCol * lam * uLight, uHaze, vFog), 1.0);
      }`,
  });
}

function makeField(scene, geo, max, sway) {
  const geometry = new THREE.InstancedBufferGeometry();
  for (const name of ['position', 'aNrm', 'aCol', 'aBend']) {
    geometry.setAttribute(name, geo.getAttribute(name));
  }
  if (geo.getIndex()) geometry.setIndex(geo.getIndex());

  const aPlace = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const aShape = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  aPlace.setUsage(THREE.DynamicDrawUsage);
  aShape.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPlace', aPlace);
  geometry.setAttribute('aShape', aShape);
  geometry.instanceCount = 0;

  const material = makeMaterial(sway);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { geometry, material, mesh, aPlace, aShape };
}

export function createProps(scene, world) {
  const kinds = [
    { d: makeField(scene, treeGeometry(), TREE_MAX, 1.0), kind: 0,
      cell: TREE_CELL, ring: TREE_RING, max: TREE_MAX, lo: 1.5, hi: 3.1,
      lastI: 1e9, lastJ: 1e9 },
    { d: makeField(scene, rockGeometry(), ROCK_MAX, 0.0), kind: 1,
      cell: ROCK_CELL, ring: ROCK_RING, max: ROCK_MAX, lo: 0.5, hi: 1.7,
      lastI: 1e9, lastJ: 1e9 },
  ];

  // Nothing of this kind anywhere on the map — then never walk the lattice
  // looking for it.
  const wanted = kinds.map((k) => world.scatters.some((s) => s.kind === k.kind));
  let budget = 1.0;

  function rebuild(k, px, pz) {
    const ci = Math.round(px / k.cell), cj = Math.round(pz / k.cell);
    if (ci === k.lastI && cj === k.lastJ) return;
    k.lastI = ci; k.lastJ = cj;

    const cap = Math.min(k.max, Math.max(0, Math.round(k.max * budget)));
    const place = k.d.aPlace.array, shape = k.d.aShape.array;
    let n = 0;
    outer:
    for (let i = ci - k.ring; i <= ci + k.ring; i++) {
      for (let j = cj - k.ring; j <= cj + k.ring; j++) {
        const keep = hash2(i * 1.7 + k.kind * 31.3, j * 2.3 - k.kind * 17.1);
        const jx = (hash2(i + 0.31 + k.kind, j + 5.7) - 0.5) * k.cell * 0.86;
        const jz = (hash2(i - 3.9, j + 1.13 + k.kind) - 0.5) * k.cell * 0.86;
        const x = i * k.cell + jx, z = j * k.cell + jz;

        const density = scatterAt(world, k.kind, x, z);
        if (density <= 0 || keep > density) continue;

        const f = fieldAt(x, z);
        if (f[7] > 0.15) continue;                    // not standing in a lake
        const y = f[0] + f[1] * hills(x, z);

        const s = hash2(i * 5.1 + k.kind, j * 7.3);
        const t = hash2(i + 11.3, j - 2.9 + k.kind);
        place[n * 4] = x; place[n * 4 + 1] = y; place[n * 4 + 2] = z; place[n * 4 + 3] = s;
        shape[n * 4] = k.lo + s * (k.hi - k.lo);
        shape[n * 4 + 1] = t * 6.2832;
        shape[n * 4 + 2] = (t - 0.5) * 0.20;
        shape[n * 4 + 3] = s;
        n++;
        if (n >= cap) break outer;
      }
    }
    k.d.geometry.instanceCount = n;
    k.d.aPlace.needsUpdate = true;
    k.d.aShape.needsUpdate = true;
  }

  function update(camPos, playerPos, elapsed, force) {
    for (const k of kinds) {
      if (!wanted[k.kind]) continue;
      rebuild(k, playerPos.x, playerPos.z);
      const u = k.d.material.uniforms;
      u.uCam.value.copy(camPos);
      u.uTime.value = elapsed;
      u.uForce.value = force;
    }
  }

  // The quality tier thins the props the same way it thins the grass.
  function setBudget(b) {
    budget = Math.max(0, Math.min(1, b));
    for (const k of kinds) { k.lastI = 1e9; k.lastJ = 1e9; }
  }

  function counts() {
    return kinds.map((k) => k.d.geometry.instanceCount);
  }

  return { update, setBudget, counts };
}
