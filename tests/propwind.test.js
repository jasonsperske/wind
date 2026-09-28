import test from 'node:test';
import assert from 'node:assert/strict';
import { createPropWind } from '../src/propwind.js';

const tree = { id: 'oak', x: 0, y: 0, z: 0, radius: 4, height: 10 };
const result = () => ({ turn: 0, amount: 0, x: 0, z: 0 });

for (const obstacle of [tree, {id:'boulder',x:0,y:0,z:0,radius:10,height:10}])
for (const [speed, dt] of [[9,1/72], [26,1/72], [40.3,1/72], [40.3,0.05]]) {
  test(`head-on bypass clears ${obstacle.id} at ${speed} m/s, dt=${dt}`, () => {
    const sample = createPropWind(), out = result();
    const pos = { x: 0, y: 1, z: -60 };
    let heading = 0, clearance = Infinity;
    for (let t=0; t<12; t+=dt) {
      sample(pos,heading,speed,[obstacle],dt,out);
      assert.ok(Math.abs(out.turn) <= 0.85);
      heading += out.turn*dt;
      let vx = Math.sin(heading)*speed+out.x, vz = Math.cos(heading)*speed+out.z;
      const len = Math.hypot(vx,vz);
      pos.x += vx/len*speed*dt; pos.z += vz/len*speed*dt;
      clearance = Math.min(clearance,Math.hypot(pos.x,pos.z));
    }
    assert.ok(clearance > obstacle.radius, `clearance ${clearance}`);
  });
}

test('passes on the nearer side', () => {
  for (const x of [-1,1]) {
    const sample = createPropWind(), out = result();
    sample({x,y:1,z:-8},0,9,[tree],0.05,out);
    assert.equal(Math.sign(out.turn),Math.sign(x));
  }
});

test('ignores absent, overhead, behind and off-path trees', () => {
  for (const [pos,trees] of [
    [{x:0,y:1,z:-8},[]], [{x:0,y:12,z:-8},[tree]],
    [{x:0,y:1,z:8},[tree]], [{x:12,y:1,z:-8},[tree]],
  ]) {
    const out = result();
    createPropWind()(pos,0,26,trees,0.05,out);
    assert.ok(Object.values(out).every(value => value === 0));
  }
});

test('head-on side stays stable and steering fades after passing', () => {
  const sample = createPropWind(), out = result();
  sample({x:0,y:1,z:-8},0,9,[tree],0.05,out);
  sample({x:-0.01,y:1,z:-7},0,9,[tree],0.05,out);
  assert.ok(out.turn > 0);
  for (let i=0;i<144;i++) sample({x:0,y:1,z:20},0,9,[tree],1/72,out);
  assert.ok(Math.abs(out.turn) < 0.0001);
});

 test('flying above a boulder still allows steering around a taller tree', () => {
  const rock = { id:'rock:0,0',x:0,y:0,z:0,radius:6,height:3 };
  const tallTree = { ...tree,id:'tree:0,0' };
  const out = result(), pos = {x:0,y:6,z:-8};
  createPropWind()(pos,0,9,[rock],0.05,out);
  assert.ok(out.turn === 0);
  createPropWind()(pos,0,9,[rock,tallTree],0.05,out);
  assert.ok(out.turn > 0);
});
