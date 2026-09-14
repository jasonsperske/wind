import test from 'node:test';
import assert from 'node:assert/strict';
import { createTreeWind } from '../src/treewind.js';

const tree = { id: 'oak', x: 0, y: 0, z: 0, radius: 4, height: 10 };
const result = () => ({ turn: 0, amount: 0, x: 0, z: 0 });

for (const [speed, dt] of [[9,1/72], [26,1/72], [40.3,1/72], [40.3,0.05]]) {
  test(`head-on bypass clears tree at ${speed} m/s, dt=${dt}`, () => {
    const sample = createTreeWind(), out = result();
    const pos = { x: 0, y: 1, z: -60 };
    let heading = 0, clearance = Infinity;
    for (let t=0; t<12; t+=dt) {
      sample(pos,heading,speed,[tree],dt,out);
      assert.ok(Math.abs(out.turn) <= 0.85);
      heading += out.turn*dt;
      let vx = Math.sin(heading)*speed+out.x, vz = Math.cos(heading)*speed+out.z;
      const len = Math.hypot(vx,vz);
      pos.x += vx/len*speed*dt; pos.z += vz/len*speed*dt;
      clearance = Math.min(clearance,Math.hypot(pos.x,pos.z));
    }
    assert.ok(clearance > tree.radius, `clearance ${clearance}`);
  });
}

test('passes on the nearer side', () => {
  for (const x of [-1,1]) {
    const sample = createTreeWind(), out = result();
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
    createTreeWind()(pos,0,26,trees,0.05,out);
    assert.ok(Object.values(out).every(value => value === 0));
  }
});

test('head-on side stays stable and steering fades after passing', () => {
  const sample = createTreeWind(), out = result();
  sample({x:0,y:1,z:-8},0,9,[tree],0.05,out);
  sample({x:-0.01,y:1,z:-7},0,9,[tree],0.05,out);
  assert.ok(out.turn > 0);
  for (let i=0;i<144;i++) sample({x:0,y:1,z:20},0,9,[tree],1/72,out);
  assert.ok(Math.abs(out.turn) < 0.0001);
});
