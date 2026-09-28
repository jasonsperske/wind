import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { flatWorld } from '../src/regions.js';
import { setField } from '../src/field.js';
import { flowerLayout } from '../src/flower-layout.js';
import { createMeadow } from '../src/meadow.js';
import { createFlowers } from '../src/flowers.js';
import { FMAX } from '../src/config.js';

test('flower patches keep stable identities and obey the shared budget', () => {
  setField(flatWorld());
  const home = { x: 0, z: 0 };
  const a = flowerLayout(0, 0, home);
  const b = new Map(flowerLayout(11, 0, home).map(f => [f.id, f]));
  assert.ok(a.length > 0 && a.length <= FMAX);
  assert.equal(new Set(a.map(f => f.id)).size, a.length);
  let shared = 0;
  for (const f of a) {
    if (!b.has(f.id)) continue;
    const other = b.get(f.id);
    for (const key of ['x', 'y', 'z', 'hue', 'seed']) assert.equal(f[key], other[key]);
    shared++;
  }
  assert.ok(shared > a.length / 2);
  assert.ok(a.some(f => f.id.startsWith('home0:') && f.distance < 12));
  assert.ok(a.every((f, i) => i === 0 || f.distance >= a[i - 1].distance));
});

test('patches, including the introductory trail, respect water and biome exclusions', () => {
  for (const blocked of ['water', 'dune', 'tundra', 'edge']) {
    const world = flatWorld();
    const sample = world.sample.bind(world);
    world.sample = (x, z, out) => {
      const f = sample(x, z, out);
      if (blocked === 'water') f[7] = 1;
      if (blocked === 'dune') { f[4] = 0; f[5] = 1; }
      if (blocked === 'tundra') { f[4] = 0; f[6] = 1; }
      if (blocked === 'edge') f[2] = -2;
      return f;
    };
    setField(world);
    assert.equal(flowerLayout(0, 0, { x: 0, z: 0 }).length, 0, blocked);
  }
});

test('clearings stay world-aligned across a mask recenter and disappear when removed', () => {
  const meadow = createMeadow();
  function at(x, z) {
    const origin = meadow.uniforms.uMeadowOrigin.value;
    const { data, width } = meadow.uniforms.uMeadow.value.image;
    return data[(Math.floor((z - origin.y) / 1.5) * width + Math.floor((x - origin.x) / 1.5)) * 4];
  }
  meadow.rebuild([{ x: 0, z: 0 }], 0, 0);
  const center = at(0, 0);
  assert.ok(center > 100);
  assert.equal(at(9, 9), 0);
  meadow.rebuild([{ x: 0, z: 0 }], 11, -11);
  assert.equal(at(0, 0), center);
  meadow.rebuild([], 11, -11);
  assert.equal(at(0, 0), 0);
});

test('leaving and revisiting a bloomed cluster cannot award it twice', () => {
  setField(flatWorld());
  const home = { x: 0, z: 0 };
  const target = flowerLayout(0, 0, home)[0];
  const near = new THREE.Vector3(target.x, target.y + 1, target.z);
  const flowers = createFlowers(new THREE.Scene(), createMeadow(), home);
  const opened = flowers.update(1, near, near);
  assert.ok(opened.some(f => f.id === target.id));
  const far = new THREE.Vector3(300, 4, 300);
  flowers.update(0, far, far);
  assert.equal(flowers.update(1, near, near).length, 0);
});
