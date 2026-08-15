import * as THREE from 'three';
import { terrainH, fieldAt, heightOf, hash2 } from './field.js';
import { GRASS_MAX, QUALITY, PET_FULL, MAX_DOWN, SINK, DEG } from './config.js';
import { settings } from './settings.js';
import { Turner, approach } from './turning.js';
import { createBoundary, turnRate, pushSpeed, wrapAngle } from './boundary.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { createGrass } from './grass.js';
import { createFlowers } from './flowers.js';
import { createFlyingPetals, createCarriedPetals } from './petals.js';
import { createVignette } from './vignette.js';
import { createVrHud } from './vrhud.js';
import { createMinimap } from './minimap.js';
import { createProps } from './props.js';
import { createWeather } from './weather.js';
import { applyConditions, applyHaze, primeHaze } from './daylight.js';
import { chime, updateWind, setWeatherSound } from './audio.js';
import { readXRInput } from './xrinput.js';

function forceOf(n) { return Math.min(1, n / PET_FULL); }
function maxUp(f) { return (2 + f * 36) * DEG; }

export function createGame({ renderer, scene, camera, rig, input, hud, world, conditions }) {
  // The hour and the weather are fixed for the life of a map — everything they
  // touch is written into the shared uniforms once, here.
  applyConditions(conditions);
  primeHaze(conditions);
  setWeatherSound(conditions.kind, conditions.fall);

  const sky = createSky();
  scene.add(sky.mesh);
  const terrain = createTerrain();
  scene.add(terrain.mesh);
  const grass = createGrass();
  scene.add(grass.mesh);
  const flowers = createFlowers(scene);
  const flying = createFlyingPetals(scene);
  const carried = createCarriedPetals(scene);
  const vignette = createVignette(camera);
  const vrHud = createVrHud(scene);
  const boundary = createBoundary(world);
  const minimap = createMinimap(world);
  const props = createProps(scene, world);
  const weather = createWeather(scene);
  weather.set(conditions);

  const player = {
    pos: new THREE.Vector3(world.home.x, 0, world.home.z),
    yaw: 0.7, pitch: 0,
    petals: 0, force: 0, speed: 9, boost: 0,
  };
  player.pos.y = terrainH(player.pos.x, player.pos.z) + 1.2;

  const turner = new Turner(settings);
  let pitchRate = 0;
  let rigYaw = 0;
  let elapsed = 0;
  let started = false;
  let heading = 0;               // where the wind was pointing last frame

  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const headOff = new THREE.Vector3();
  const yawE = new THREE.Euler(0, 0, 0, 'YXZ');
  const edge = { push: 0, beyond: 0, ix: 0, iz: 0 };

  /* ------------------------------ presentation ---------------------------- */
  let foveationPending = false;

  function applyQuality() {
    const q = QUALITY[settings.quality] || QUALITY.medium;
    const inXR = renderer.xr.isPresenting;
    grass.setDensity(inXR ? q.grass : GRASS_MAX);
    props.setBudget(inXR ? q.props : 1.0);
    weather.setCap(inXR ? q.drops : 1e9);
    foveationPending = true;
  }

  // three r128 has no setFoveation, so go at the layer directly. The base layer
  // only appears once the session's render state has been applied, which is a
  // frame or two after sessionstart — hence the retry rather than a one-shot.
  function tryFoveation() {
    if (!foveationPending || !renderer.xr.isPresenting) return;
    const session = renderer.xr.getSession();
    const layer = session && session.renderState && session.renderState.baseLayer;
    if (!layer || !('fixedFoveation' in layer)) return;
    layer.fixedFoveation = (QUALITY[settings.quality] || QUALITY.medium).foveation;
    foveationPending = false;
  }

  function begin() {
    if (started) return;
    started = true;
    hud.show();
  }

  function onSessionStart() {
    turner.reset();
    pitchRate = 0;
    // In the headset the horizon is the headset's; only yaw is ours.
    player.pitch = 0;
    applyQuality();
    begin();
  }

  function onSessionEnd() {
    turner.reset();
    foveationPending = false;
    grass.setDensity(GRASS_MAX);
  }

  /* -------------------------------- placement ----------------------------- */
  // Put the rig where the *head* lands on the flight position. In a headset the
  // camera carries the XR pose offset, so subtract it (rotated by the rig yaw).
  function placeRig(inXR) {
    if (inXR) {
      yawE.y = rigYaw;
      headOff.copy(camera.position).applyEuler(yawE);
      rig.position.set(
        player.pos.x - headOff.x,
        player.pos.y - headOff.y,
        player.pos.z - headOff.z
      );
    } else {
      rig.position.copy(player.pos);
    }
    rig.updateMatrixWorld(true);
  }

  /* ---------------------------------- loop -------------------------------- */
  function update(dt) {
    elapsed += dt;
    const inXR = renderer.xr.isPresenting;

    /* ---- the edge of the world ---- */
    // Worked out before the stick is read, off last frame's heading, so the
    // turn-back and your own steering arrive together and add up rather than
    // fighting over the same yaw a frame apart.
    boundary(player.pos.x, player.pos.z, edge);
    let turnBack = 0;
    if (edge.push > 0) {
      const want = Math.atan2(edge.ix, edge.iz);
      const off = wrapAngle(want - heading);
      const most = turnRate(edge.push) * dt;
      turnBack = Math.abs(off) < most ? off : Math.sign(off) * most;
    }

    /* ---- steering ---- */
    if (inXR) {
      tryFoveation();
      const xi = readXRInput(renderer.xr.getSession());
      rigYaw += turner.update(dt, xi.turn) + turnBack;
      player.boost = Math.max(0, xi.boost);
    } else {
      const look = input.takeMouseLook();
      player.yaw += turner.update(dt, input.turn()) + look.yaw + turnBack;
      pitchRate = approach(pitchRate, -input.pitch() * 1.2, settings.ramp, dt);
      player.pitch += pitchRate * dt + look.pitch;
      player.boost = input.boost();
    }

    player.force = forceOf(player.petals);
    const up = maxUp(player.force);

    if (!inXR) {
      player.pitch = Math.max(-MAX_DOWN, Math.min(up, player.pitch));
      camera.rotation.order = 'YXZ';
      camera.rotation.set(player.pitch, player.yaw, 0);
      rig.rotation.y = 0;
      camera.position.set(0, 0, 0);
    } else {
      rig.rotation.y = rigYaw;
    }

    vignette.set(settings.vignette ? Math.max(turner.amount * 0.9, edge.push * 0.6) : 0);

    /* ---- where the wind actually is ---- */
    placeRig(inXR);
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(fwd);

    // clamp the flight pitch to what this much force can push
    const horiz = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    let pitch = Math.atan2(fwd.y, Math.max(horiz, 1e-4));
    pitch = Math.max(-MAX_DOWN, Math.min(up, pitch));
    const hy = Math.atan2(fwd.x, fwd.z);
    heading = hy;
    fwd.set(Math.sin(hy) * Math.cos(pitch), Math.sin(pitch), Math.cos(hy) * Math.cos(pitch));

    const base = 9 + player.force * 17;
    const target = base * (1 + player.boost * 0.55);
    player.speed += (target - player.speed) * Math.min(1, dt * 1.6);

    vel.copy(fwd).multiplyScalar(player.speed);
    vel.y -= SINK;
    // and the headwind itself, so a nose held stubbornly outward still loses
    if (edge.push > 0) {
      const shove = pushSpeed(edge.push, edge.beyond);
      vel.x += edge.ix * shove;
      vel.z += edge.iz * shove;
    }
    player.pos.addScaledVector(vel, dt);

    /* ---- the ground, and what it is made of ---- */
    // terrainH inline, because the same lookup also says which landscape this
    // is — and the sample it returns is only good until the next call.
    const f = fieldAt(player.pos.x, player.pos.z);
    const gh = heightOf(f, player.pos.x, player.pos.z);
    applyHaze(conditions, f[4], f[5], f[6], f[7], 1 - Math.exp(-dt * 0.7));

    if (player.pos.y < gh + 0.55) player.pos.y = gh + 0.55;
    if (player.pos.y > gh + 90) player.pos.y = gh + 90;

    placeRig(inXR);
    camera.getWorldPosition(camPos);

    /* ---- flowers and petals ---- */
    const opened = flowers.update(dt, camPos, player.pos);
    for (const f of opened) {
      chime(f.hue);
      flying.spawn(f, 3 + Math.floor(hash2(f.x, f.z) * 3));
    }
    player.petals += flying.update(dt, camPos, elapsed);

    /* ---- follow-the-player geometry ---- */
    terrain.mesh.position.set(Math.round(camPos.x / 2) * 2, 0, Math.round(camPos.z / 2) * 2);
    sky.mesh.position.copy(camPos);
    grass.material.uniforms.uOrigin.value.set(Math.round(camPos.x), Math.round(camPos.z));

    /* ---- uniforms ---- */
    grass.material.uniforms.uCam.value.copy(camPos);
    grass.material.uniforms.uVel.value.copy(vel);
    grass.material.uniforms.uTime.value = elapsed;
    grass.material.uniforms.uForce.value = player.force;
    terrain.material.uniforms.uCam.value.copy(camPos);
    terrain.material.uniforms.uTime.value = elapsed;
    sky.set(conditions.time.stars, conditions.time.moon,
      conditions.time.glow, conditions.time.glowAmt, elapsed);
    flowers.setUniforms(camPos, elapsed);
    props.update(camPos, player.pos, elapsed, player.force);
    weather.update(camPos, elapsed);
    carried.update(camPos, fwd, elapsed, player.speed, player.petals);

    /* ---- sound + hud ---- */
    updateWind(dt, player.speed, player.boost);
    if (inXR) {
      // The DOM hud does not exist inside the headset, so the count goes into
      // the world instead. hy/horiz are the head's own facing, taken before the
      // flight pitch was clamped.
      if (!vrHud.mesh.visible) vrHud.show(hy);
      vrHud.update(dt, camPos, hy, horiz, player.petals, player.force);
    } else {
      if (vrHud.mesh.visible) vrHud.hide();
      if (started) hud.update(player.petals, player.force);
    }
    minimap.update(dt, player.pos.x, player.pos.z, hy, edge.push, inXR);
  }

  function idle(dt) {
    elapsed += dt;
    grass.material.uniforms.uTime.value = elapsed;
    flowers.setTime(elapsed);
  }

  // place the rig and fill the uniforms before the first frame
  camera.rotation.order = 'YXZ';
  update(0.0001);

  return {
    update, idle, begin, applyQuality, onSessionStart, onSessionEnd, player,
    vrHud, minimap, props, weather, conditions, isStarted: () => started,
  };
}
