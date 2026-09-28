// Trees and rocks.
//
// Both come off a fixed lattice, the same trick the flowers use: a hash decides
// what stands in each cell, so nothing is stored, nothing is spawned, and a
// tree is in the same place every time you pass it. The scatter shapes drawn in
// the map decide where the lattice is allowed to grow anything, and their
// `data-density` thins it.
//
// Trees and boulders offer a soft wind bypass in game.js.

import * as THREE from 'three';
import { treeGeometry } from './trees.js';
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

// Closed, shared rings give the rock a weathered shoulder and broken crown.
// Vertices are expanded per face for faceted lighting, but adjoining faces
// share the exact same positions (the old per-face jitter left cracks).
function rockGeometry() {
  const pos = [], nrm = [], col = [], bend = [];
  const rings = [], sides = 10;
  const profile = [[-0.65,0.72],[-0.08,1.04],[0.43,0.91],[0.91,0.69],[1.18,0.40]];
  for (let r=0; r<profile.length; r++) {
    const [y,radius] = profile[r], ring = [];
    for (let i=0; i<sides; i++) {
      const a = i/sides*Math.PI*2;
      const wear = 1 + Math.sin(a*3+0.7)*0.13 + Math.cos(a*5+r*0.6)*0.06;
      ring.push(new THREE.Vector3(
        Math.cos(a)*radius*wear + y*0.18,
        y + Math.sin(a*2+0.4)*0.10*Math.max(y,0),
        Math.sin(a)*radius*wear*0.83));
    }
    rings.push(ring);
  }
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  function face(a,b,c) {
    normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a)).normalize();
    for (const v of [a,b,c]) {
      pos.push(v.x,v.y,v.z); nrm.push(normal.x,normal.y,normal.z);
      col.push(0.42,0.41,0.38); bend.push(0);
    }
  }
  for (let r=0; r<rings.length-1; r++) {
    for (let i=0; i<sides; i++) {
      const j=(i+1)%sides;
      face(rings[r][i],rings[r+1][i],rings[r][j]);
      face(rings[r][j],rings[r+1][i],rings[r+1][j]);
    }
  }
  const top = new THREE.Vector3(0.24,1.22,0), bottom = new THREE.Vector3(0,-0.65,0);
  for (let i=0; i<sides; i++) {
    const j=(i+1)%sides;
    face(rings[4][i],top,rings[4][j]);
    face(rings[0][j],bottom,rings[0][i]);
  }
  return buildGeometry(pos,nrm,col,bend,null);
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
      uRock: { value: sway === 0 ? 1 : 0 },
    }, fieldUniforms()),
    vertexShader: `
      attribute vec3 aNrm, aCol; attribute float aBend;
      attribute vec4 aPlace, aShape; attribute float aLand;
      uniform vec3 uCam; uniform vec2 uFog; uniform float uTime, uForce, uSway;
      uniform float uRock;
      varying vec3 vCol; varying vec3 vN; varying float vFog;
      varying vec3 vRock; varying float vDesert, vDistance;

      // lean about x, then turn about y — a tree that only spins looks stamped
      vec3 shape(vec3 p, float lean, float cy, float sy){
        float cl = cos(lean), sl = sin(lean);
        p = vec3(p.x, p.y*cl - p.z*sl, p.y*sl + p.z*cl);
        return vec3(p.x*cy - p.z*sy, p.y, p.x*sy + p.z*cy);
      }

      void main(){
        float sc = aShape.x;
        float cy = cos(aShape.y), sy = sin(aShape.y);
        // Seeded slab / pillar proportions, without extra geometry or draws.
        vec3 stretch = mix(vec3(1.0),vec3(1.1+aPlace.w*0.7,
          0.85+fract(aPlace.w*7.3)*0.85,0.9+fract(aPlace.w*3.7)*0.4),uRock*aLand);
        vec3 p = shape(position * stretch * sc, aShape.z, cy, sy);
        vN = normalize(shape(aNrm/stretch, aShape.z, cy, sy));
        vRock = position*stretch*sc;
        vDesert = aLand*uRock;
        vDistance = length(aPlace.xz-uCam.xz);

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
      varying vec3 vRock; varying float vDesert, vDistance;
      void main(){
        float lam = max(dot(normalize(vN), uSun), 0.0)*0.66 + 0.44;
        vec3 colour = vCol;
        if (vDesert > 0.001) {
          float bed = vRock.y + sin(vRock.x*1.3+vRock.z*0.7)*0.13;
          float strata = sin(bed*8.0)*0.5+0.5;
          float detail = 1.0-smoothstep(12.0,55.0,vDistance);
          float seam = pow(0.5+0.5*sin(bed*17.0),12.0)*detail;
          vec3 sandstone = mix(vec3(0.43,0.22,0.115),vec3(0.72,0.48,0.27),strata*0.40+0.35);
          sandstone *= 1.0-seam*0.18;
          float dust = smoothstep(0.25,0.85,normalize(vN).y);
          sandstone = mix(sandstone,vec3(0.82,0.65,0.41),dust*0.55);
          sandstone *= mix(0.72,1.0,smoothstep(-0.2,0.9,vRock.y));
          colour = mix(colour,sandstone,vDesert);
        }
        gl_FragColor = vec4(mix(colour * lam * uLight, uHaze, vFog), 1.0);
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
  const aLand = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  aLand.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aLand', aLand);
  aPlace.setUsage(THREE.DynamicDrawUsage);
  aShape.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPlace', aPlace);
  geometry.setAttribute('aShape', aShape);
  geometry.instanceCount = 0;

  const material = makeMaterial(sway);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { geometry, material, mesh, aPlace, aShape, aLand };
}

function smooth(a,b,x) { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }
function groveNoise(x,z) {
  const i=Math.floor(x),j=Math.floor(z),u=smooth(0,1,x-i),v=smooth(0,1,z-j);
  return (hash2(i,j)*(1-u)+hash2(i+1,j)*u)*(1-v)
    +(hash2(i,j+1)*(1-u)+hash2(i+1,j+1)*u)*v;
}

export function createProps(scene, world) {
  const treeModels = [0,1,2].map(type => {
    const geo=treeGeometry(type), box=geo.boundingBox;
    const radius=Math.hypot(Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),
      Math.max(Math.abs(box.min.z),Math.abs(box.max.z)));
    return { draw:makeField(scene,geo,TREE_MAX,1.0), radius, height:box.max.y };
  });
  const kinds = [
    { d: treeModels[0].draw, draws:treeModels.map(m=>m.draw), kind: 0,
      cell: 11, ring: Math.ceil(TREE_CELL*TREE_RING/11), max: TREE_MAX, lo: 1.25, hi: 2.4,
      lastI: 1e9, lastJ: 1e9 },
    { d: makeField(scene, rockGeometry(), ROCK_MAX, 0.0), kind: 1,
      cell: ROCK_CELL, ring: ROCK_RING, max: ROCK_MAX, lo: 0.5, hi: 1.7,
      lastI: 1e9, lastJ: 1e9 },
  ];

  // Nothing of this kind anywhere on the map — then never walk the lattice
  // looking for it.
  const wanted = kinds.map((k) => world.scatters.some((s) => s.kind === k.kind));
  let budget = 1.0;
  const obstaclesByKind = [[], []];
  let obstacles = [], obstaclesDirty = true;

  function rebuild(k, px, pz) {
    const ci = Math.round(px / k.cell), cj = Math.round(pz / k.cell);
    if (ci === k.lastI && cj === k.lastJ) return;
    k.lastI = ci; k.lastJ = cj;

    const cap = Math.min(k.max, Math.max(0, Math.round(k.max * budget)));
    const draws=k.draws || [k.d], counts=draws.map(()=>0), candidates=[];
    const nearby = obstaclesByKind[k.kind] = [];
    obstaclesDirty = true;
    for (let i = ci - k.ring; i <= ci + k.ring; i++) {
      for (let j = cj - k.ring; j <= cj + k.ring; j++) {
        const keep = hash2(i * 1.7 + k.kind * 31.3, j * 2.3 - k.kind * 17.1);
        const jx = (hash2(i + 0.31 + k.kind, j + 5.7) - 0.5) * k.cell * 0.86;
        const jz = (hash2(i - 3.9, j + 1.13 + k.kind) - 0.5) * k.cell * 0.86;
        const x = i * k.cell + jx, z = j * k.cell + jz;

        let density = scatterAt(world, k.kind, x, z);
        // Smooth world-space patches leave clearings between uneven groves.
        const grove = groveNoise(x/42,z/42);
        if(k.kind===0) density *= 0.12+0.88*smooth(0.28,0.70,grove);
        if (density <= 0 || keep > density) continue;

        const f = fieldAt(x, z);
        if (f[7] > 0.15) continue;                    // not standing in a lake
        const y = f[0] + f[1] * hills(x, z);

        const s = hash2(i * 5.1 + k.kind, j * 7.3);
        const t = hash2(i + 11.3, j - 2.9 + k.kind);
        candidates.push({i,j,x,y,z,s,t,desert:f[5]/Math.max(f[4]+f[5]+f[6],0.001),
          type:k.kind===0 ? Math.min(2,Math.floor((groveNoise(x/65+31,z/65-17)*0.72+s*0.28)*3)) : 0});
      }
    }
    // Prioritise nearby trees across all species under one shared budget.
    // Cell-centred sorting is stable until the next lattice rebuild.
    candidates.sort((a,b)=>Math.hypot(a.x-ci*k.cell,a.z-cj*k.cell)-Math.hypot(b.x-ci*k.cell,b.z-cj*k.cell));
    for(const candidate of candidates.slice(0,cap)) {
        const {i,j,x,y,z,s,t,type}=candidate;
        const d=draws[type], n=counts[type]++;
        const place=d.aPlace.array, shape=d.aShape.array;
        place[n*4]=x;place[n*4+1]=y;place[n*4+2]=z;place[n*4+3]=s;
        const desert = candidate.desert;
        d.aLand.array[n] = desert;
        shape[n * 4] = (k.lo + s * (k.hi - k.lo))
          * (k.kind === 1 ? 1+desert*(0.65+s*0.65) : 1);
        shape[n * 4 + 1] = t * 6.2832;
        shape[n * 4 + 2] = (t - 0.5) * 0.20;
        shape[n * 4 + 3] = s;
        if (k.kind === 0) {
          const scale = shape[n*4];
          const model=treeModels[type];
          nearby.push({ id: 'tree:'+i+','+j, x, y, z,
            radius: scale*(model.radius+model.height*0.1+0.85)+0.6,
            height: scale*(model.height+model.radius*0.1) });
        } else {
          // Conservative envelope of the mesh, including its seeded stretch
          // and lean. Keep these stretch factors aligned with makeMaterial.
          const scale = shape[n*4], seed = place[n*4+3];
          const sx = 1 + desert*(0.1+seed*0.7);
          const sy = 1 + desert*(-0.15+(seed*7.3%1)*0.85);
          const sz = 1 + desert*(-0.1+(seed*3.7%1)*0.4);
          nearby.push({ id: 'rock:'+i+','+j, x, y, z,
            radius: scale*(1.4*Math.max(sx,sz)+0.14*sy)+0.6,
            height: scale*(1.35*sy+0.15*Math.max(sx,sz)) });
        }
    }
    draws.forEach((d,type)=>{
      d.geometry.instanceCount=counts[type];
      d.aPlace.needsUpdate=d.aShape.needsUpdate=d.aLand.needsUpdate=true;
    });
  }

  function update(camPos, playerPos, elapsed, force) {
    for (const k of kinds) {
      if (!wanted[k.kind]) continue;
      rebuild(k, playerPos.x, playerPos.z);
      for (const d of k.draws || [k.d]) {
        const u = d.material.uniforms;
        u.uCam.value.copy(camPos);
        u.uTime.value = elapsed;
        u.uForce.value = force;
      }
    }
  }

  // The quality tier thins the props the same way it thins the grass.
  function setBudget(b) {
    budget = Math.max(0, Math.min(1, b));
    for (const k of kinds) { k.lastI = 1e9; k.lastJ = 1e9; }
  }

  function counts() {
    return kinds.map((k) => (k.draws || [k.d]).reduce((sum,d)=>sum+d.geometry.instanceCount,0));
  }

  // Rebuild before sampling so quality changes and cell crossings use exactly
  // the same obstacle set as this frame's rendered instances.
  function nearbyObstacles(playerPos) {
    for (const k of kinds) if (wanted[k.kind]) rebuild(k, playerPos.x, playerPos.z);
    if (obstaclesDirty) {
      obstacles = obstaclesByKind[0].concat(obstaclesByKind[1]);
      obstaclesDirty = false;
    }
    return obstacles;
  }

  return { update, setBudget, counts, nearbyObstacles };
}
