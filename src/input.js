import { startAudio } from './audio.js';

// Desktop / touch steering. Reports raw axes only — the smoothing lives in
// turning.js so the flat screen and the headset behave the same way.
export function createInput(canvas, onFirstTouch) {
  const keys = {};
  const stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0, fingers: 0 };
  const mouse = { yaw: 0, pitch: 0 };   // accumulated pointer-lock deltas
  let locked = false;

  addEventListener('keydown', (e) => { keys[e.code] = true; });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('pointerdown', (e) => {
    startAudio();
    if (onFirstTouch) onFirstTouch();
    stick.fingers++;
    if (e.pointerType === 'mouse' && !('ontouchstart' in window)) {
      if (!locked && canvas.requestPointerLock) canvas.requestPointerLock();
    }
    if (!stick.active) {
      stick.active = true; stick.id = e.pointerId;
      stick.ox = e.clientX; stick.oy = e.clientY; stick.dx = 0; stick.dy = 0;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (locked) {
      mouse.yaw -= e.movementX * 0.0022;
      mouse.pitch -= e.movementY * 0.0018;
      return;
    }
    if (stick.active && e.pointerId === stick.id) {
      const lim = 92;
      stick.dx = Math.max(-lim, Math.min(lim, e.clientX - stick.ox)) / lim;
      stick.dy = Math.max(-lim, Math.min(lim, e.clientY - stick.oy)) / lim;
    }
  });

  function endPointer(e) {
    stick.fingers = Math.max(0, stick.fingers - 1);
    if (e.pointerId === stick.id) {
      stick.active = false; stick.dx = 0; stick.dy = 0; stick.id = -1;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  document.addEventListener('pointerlockchange', () => {
    locked = (document.pointerLockElement === canvas);
  });
  addEventListener('contextmenu', (e) => e.preventDefault());

  function clamp1(v) { return Math.max(-1, Math.min(1, v)); }

  return {
    // -1..1, positive = turn right
    turn() {
      const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      return clamp1(stick.dx + kx);
    },
    // -1..1, positive = nose down
    pitch() {
      const ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      return clamp1(stick.dy * 0.85 + ky);
    },
    boost() {
      return (keys.ShiftLeft || keys.ShiftRight || stick.fingers >= 2) ? 1 : 0;
    },
    // Pointer-lock look is already a delta, so it stays 1:1 — consumed once.
    takeMouseLook() {
      const out = { yaw: mouse.yaw, pitch: mouse.pitch };
      mouse.yaw = 0; mouse.pitch = 0;
      return out;
    },
  };
}
