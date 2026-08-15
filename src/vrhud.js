import * as THREE from 'three';
import { GUSTS, gustIndex } from './config.js';
import { approach } from './turning.js';

// The petal count, in the world, for the headset.
//
// It is *not* welded to the head. A rigidly head-locked panel sits at a fixed
// spot on your retina and reads as dirt on the lens; this one lags the head yaw
// and rides below the horizon, so it settles where you last looked and you find
// it by glancing down rather than by it always being in the way.

const DIST = 1.5;        // metres in front of the head
const DROP = 0.62;       // metres below it — about 22 degrees down
const FOLLOW = 2.6;      // how fast the panel chases the head's yaw (1/s)
const IDLE_OPACITY = 0.72;
const PULSE = 2.2;       // seconds at full opacity after the count changes

const W = 512, H = 256;

function roundRect(ctx, x, y, w, h, r) {
  // Written out rather than using ctx.roundRect: older Quest browser builds
  // predate it, and a blank panel in the headset is a miserable thing to debug.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Letter-spaced text, centred. ctx.letterSpacing is too new to rely on here.
function tracked(ctx, text, cx, y, spacing) {
  const chars = Array.from(text);
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width + spacing;
  total -= spacing;
  let x = cx - total / 2;
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + spacing;
  }
}

export function createVrHud(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
    opacity: IDLE_OPACITY, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9000;      // over the world, under the comfort vignette
  mesh.visible = false;
  scene.add(mesh);

  let panelYaw = 0;
  let placed = false;
  let pulse = 0;
  let lastPetals = -1, lastGust = -1;

  function draw(petals, gi) {
    ctx.clearRect(0, 0, W, H);

    // A plate, so the text survives both bright sky and pale grass behind it.
    // The whole panel is then faded as one via material.opacity, so these
    // alphas are the *most* contrast it will ever have — keep them generous.
    ctx.fillStyle = 'rgba(16,28,23,0.66)';
    roundRect(ctx, 6, 6, W - 12, H - 12, 40);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,240,233,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.font = '600 26px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(244,251,246,0.90)';
    tracked(ctx, GUSTS[gi].toUpperCase(), W / 2, 62, 5);

    ctx.font = '400 104px "Iowan Old Style", Georgia, serif';
    ctx.fillStyle = '#e8b64c';
    ctx.textAlign = 'center';
    ctx.fillText(String(petals), W / 2, 168);

    ctx.textAlign = 'left';
    ctx.font = '600 22px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(244,251,246,0.82)';
    tracked(ctx, 'PETALS CARRIED', W / 2, 212, 5);

    texture.needsUpdate = true;
  }

  const pos = new THREE.Vector3();

  // `headYaw` is the head's horizontal facing; `horiz` is how much of the gaze
  // is horizontal at all, so a head tipped straight down does not spin the
  // panel around on a yaw value that has gone numerically meaningless.
  function update(dt, camPos, headYaw, horiz, petals, force) {
    if (!mesh.visible) return;

    const gi = gustIndex(force);
    if (petals !== lastPetals || gi !== lastGust) {
      if (lastPetals >= 0) pulse = PULSE;
      lastPetals = petals;
      lastGust = gi;
      draw(petals, gi);
    }

    if (horiz > 0.12) {
      // shortest way round, so crossing the back does not unwind the long way
      let d = headYaw - panelYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      panelYaw = approach(panelYaw, panelYaw + d, FOLLOW, dt);
    }

    pos.set(
      camPos.x + Math.sin(panelYaw) * DIST,
      camPos.y - DROP,
      camPos.z + Math.cos(panelYaw) * DIST
    );
    mesh.position.copy(pos);
    mesh.lookAt(camPos);      // tilts up to meet your eyes rather than lying flat

    pulse = Math.max(0, pulse - dt);
    const want = pulse > 0 ? 1.0 : IDLE_OPACITY;
    material.opacity = approach(material.opacity, want, 4, dt);
  }

  return {
    mesh,
    // Snap to where the head is looking on entry rather than sliding in from 0.
    show(headYaw) {
      mesh.visible = true;
      if (!placed) { panelYaw = headYaw; placed = true; }
      pulse = PULSE;
    },
    hide() {
      mesh.visible = false;
      placed = false;
    },
    update,
  };
}
