import * as THREE from 'three';
import { HAZE, QUALITY, WORLD_SVG } from './config.js';
import { settings, setSetting } from './settings.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { loadWorld } from './regions.js';
import { setField } from './field.js';
import { startAudio } from './audio.js';

const hud = createHud();

/* -------------------------------- world --------------------------------- */
// The map has to be read and baked before anything can ask how high the ground
// is, which is the first thing the game does. It happens behind the title
// screen; if it fails, loadWorld hands back one endless meadow with no edges.
const world = await loadWorld(WORLD_SVG);
setField(world);
if (world.error) hud.note(world.error);

/* ------------------------------ renderer -------------------------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(HAZE);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const input = createInput(renderer.domElement, () => {});
const game = createGame({ renderer, scene, camera, rig, input, hud, world });

// `?debug=1` exposes the innards for poking at from the console.
if (new URLSearchParams(location.search).has('debug')) {
  window.wind = { renderer, scene, camera, rig, game, settings, world };
}

/* -------------------------------- WebXR --------------------------------- */
const vrBtn = document.getElementById('vr');

if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr')
    .then((ok) => { if (ok) vrBtn.hidden = false; })
    .catch(() => {});
} else if (!window.isSecureContext) {
  // The usual cause on a headset: the page was opened over plain http on a LAN
  // address. WebXR only exists in a secure context, and adb port forwarding to
  // localhost is exactly the trick that makes http count as one.
  hud.note('WebXR is unavailable because this page is not a secure context. '
    + 'Reach it over <code>http://localhost</code> via <code>adb reverse</code>, or over https.');
}

renderer.xr.addEventListener('sessionstart', () => game.onSessionStart());
renderer.xr.addEventListener('sessionend', () => game.onSessionEnd());

vrBtn.addEventListener('click', () => {
  startAudio();
  // The framebuffer scale is baked in when the session starts, so it has to be
  // set before requestSession rather than in applyQuality with the rest.
  const q = QUALITY[settings.quality] || QUALITY.medium;
  if (renderer.xr.setFramebufferScaleFactor) renderer.xr.setFramebufferScaleFactor(q.scale);
  navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor'],
  }).then((session) => {
    renderer.xr.setReferenceSpaceType('local-floor');
    return renderer.xr.setSession(session);
  }).catch((err) => {
    hud.note('The headset session did not start: ' + err.message);
  });
});

/* ------------------------------- settings ------------------------------- */
(function wireSettings() {
  const turnMode = document.getElementById('turnMode');
  const turnSpeed = document.getElementById('turnSpeed');
  const turnSpeedOut = document.getElementById('turnSpeedOut');
  const snapAngle = document.getElementById('snapAngle');
  const snapAngleOut = document.getElementById('snapAngleOut');
  const vignette = document.getElementById('vignette');
  const quality = document.getElementById('quality');
  const snapRow = snapAngle.closest('label');
  const speedRow = turnSpeed.closest('label');

  function paint() {
    turnMode.value = settings.turnMode;
    turnSpeed.value = settings.turnSpeed;
    snapAngle.value = settings.snapAngle;
    vignette.checked = settings.vignette;
    quality.value = settings.quality;
    turnSpeedOut.textContent = settings.turnSpeed.toFixed(1) + ' rad/s';
    snapAngleOut.textContent = settings.snapAngle + '°';
    const snap = settings.turnMode === 'snap';
    snapRow.hidden = !snap;
    speedRow.hidden = snap;
  }

  turnMode.addEventListener('change', () => { setSetting('turnMode', turnMode.value); paint(); });
  turnSpeed.addEventListener('input', () => { setSetting('turnSpeed', parseFloat(turnSpeed.value)); paint(); });
  snapAngle.addEventListener('input', () => { setSetting('snapAngle', parseInt(snapAngle.value, 10)); paint(); });
  vignette.addEventListener('change', () => setSetting('vignette', vignette.checked));
  quality.addEventListener('change', () => { setSetting('quality', quality.value); game.applyQuality(); });
  paint();
})();

/* --------------------------------- loop --------------------------------- */
const clock = new THREE.Clock();

document.getElementById('start').addEventListener('click', () => {
  startAudio();
  game.begin();
});

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game.isStarted() || renderer.xr.isPresenting) game.update(dt);
  else game.idle(dt);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
