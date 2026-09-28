import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPetalPath } from '../src/petal-path.js';
import { createMeadow, BLOOM_DURATION, BLOOM_PULSES } from '../src/meadow.js';
import { createCarriedPetals } from '../src/petals.js';
import { CARRY_MAX } from '../src/config.js';

const heading = new THREE.Vector3(0,0,-1);
test('distance-spaced trails agree across frame rates on a straight flight', () => {
  function run(rate) {
    const path = createPetalPath();
    for (let i=0;i<=rate*3;i++) path.update(new THREE.Vector3(0,2,-i/rate*20),heading,i/rate,20);
    return path.points;
  }
  const a = run(30), b = run(90);
  a.forEach((p,i) => assert.ok(p.distanceTo(b[i])<0.0001));
});
test('a turning stream remembers the earlier route instead of rotating around the camera', () => {
  const path = createPetalPath();
  for (let i=0;i<=60;i++) path.update(new THREE.Vector3(0,2,-i*0.2),heading,i/60,12);
  for (let i=1;i<=30;i++) path.update(new THREE.Vector3(i*0.2,2,-12),new THREE.Vector3(1,0,0),1+i/60,12);
  assert.ok(path.points.at(-1).x < 0.1);
  assert.ok(path.points.at(-1).z > -10);
  assert.ok(path.points[0].x > 9);
});
test('vertical headings, idle frames and teleport resets keep the stream finite and local', () => {
  const path = createPetalPath();
  for (let i=0;i<200;i++) path.update(new THREE.Vector3(0,i*0.3,0),new THREE.Vector3(0,1,0),i/60,40);
  const to = new THREE.Vector3(300,4,200);
  path.update(to,new THREE.Vector3(),5,40);
  path.update(to,heading,5,0);
  for (const p of path.points) {
    assert.ok(p.toArray().every(Number.isFinite));
    assert.ok(p.distanceTo(to)<21);
  }
});
test('carried petals preserve the instancing cap and can return to zero', () => {
  const scene = new THREE.Scene(), petals = createCarriedPetals(scene);
  for (const [count, expected] of [[0,0],[7,7],[10000,CARRY_MAX],[-1,0]]) {
    petals.update(new THREE.Vector3(),heading,0,9,count);
    assert.equal(scene.children[0].geometry.instanceCount,expected);
  }
});
test('a cluster shares one bounded bloom wave and waves expire', () => {
  const meadow = createMeadow();
  meadow.bloom({x:0,z:0},1);
  meadow.bloom({x:2,z:1},1.1);
  const pulses = meadow.uniforms.uBloomPulses.value;
  assert.equal(pulses.filter(p=>p.w).length,1);
  for (let i=1;i<20;i++) meadow.bloom({x:i*20,z:0},1.2);
  assert.equal(pulses.length,BLOOM_PULSES);
  assert.equal(pulses.filter(p=>p.w).length,BLOOM_PULSES);
  meadow.update(1.2+BLOOM_DURATION);
  assert.ok(pulses.every(p=>p.w===0));
});
test('lasting colour is restored on returning to an opened flower after its wave expires', () => {
  const meadow = createMeadow(), flower = {x:0,z:0,awarded:false};
  const data = meadow.uniforms.uMeadow.value.image.data;
  const greens = () => data.filter((_,i)=>i%4===1);
  meadow.rebuild([flower],0,0);
  assert.ok(greens().every(v=>v===0));
  meadow.bloom(flower,1);
  assert.ok(greens().some(v=>v>0));
  flower.awarded = true;
  meadow.update(100);
  meadow.rebuild([],200,200);
  assert.ok(greens().every(v=>v===0));
  meadow.rebuild([flower],0,0);
  assert.ok(greens().some(v=>v>0));
  assert.ok(meadow.uniforms.uBloomPulses.value.every(p=>p.w===0));
});
