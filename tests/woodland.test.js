import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createProps } from '../src/props.js';
import { flatWorld } from '../src/regions.js';
import { setField } from '../src/field.js';
import { treeGeometry } from '../src/trees.js';

function setup() {
  const world=flatWorld();
  world.scatters=[{kind:0,density:1,rings:[[-1000,-1000,1000,-1000,1000,1000,-1000,1000]]}];
  setField(world);
  const scene=new THREE.Scene(), props=createProps(scene,world);
  return {scene,props};
}
test('three finite, distinct tree meshes with a bounded triangle budget',()=>{
  const shapes=[];
  for(let type=0;type<3;type++) {
    const g=treeGeometry(type);
    for(const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite));
    assert.ok(g.attributes.position.count/3<850);
    shapes.push(g.attributes.position.count);
  }
  assert.equal(new Set(shapes).size,3);
});
test('species share one budget and each rendered tree has one wind obstacle',()=>{
  const {scene,props}=setup(), pos=new THREE.Vector3(0,2,0);
  for(const budget of [1,0.55,0,1]) {
    props.setBudget(budget);props.update(pos,pos,0,0);
    const draws=scene.children.slice(0,3);
    const count=draws.reduce((s,d)=>s+d.geometry.instanceCount,0);
    assert.ok(count<=Math.round(150*budget));
    assert.equal(props.counts()[0],count);
    const obstacles=props.nearbyObstacles(pos);
    assert.equal(obstacles.length,count);
    for(const draw of draws) {
      const p=draw.geometry.attributes.aPlace.array;
      for(let i=0;i<draw.geometry.instanceCount;i++) {
        assert.ok(obstacles.some(o=>Math.abs(o.x-p[i*4])<0.001 && Math.abs(o.z-p[i*4+2])<0.001));
      }
    }
  }
});
test('returning to a grove preserves positions, species and scales',()=>{
  const {scene,props}=setup(), pos=new THREE.Vector3(0,2,0);
  const snapshot=()=>scene.children.slice(0,3).map(d=>({
    place:Array.from(d.geometry.attributes.aPlace.array.slice(0,d.geometry.instanceCount*4)),
    shape:Array.from(d.geometry.attributes.aShape.array.slice(0,d.geometry.instanceCount*4))}));
  props.update(pos,pos,0,0);const before=snapshot();
  const elsewhere=new THREE.Vector3(180,2,160);props.update(elsewhere,elsewhere,0,0);
  props.update(pos,pos,0,0);assert.deepEqual(snapshot(),before);
});
