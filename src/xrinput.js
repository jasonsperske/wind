// Touch controller axes, normalised to the same -1..1 the desktop input gives.
//
// On Quest the xr-standard gamepad puts the thumbstick on axes 2/3 (0/1 are the
// legacy touchpad slots and read zero). Turning prefers the right hand and
// thrust the left, but either stick works if only one controller is awake.

const DEAD = 0.08;   // hardware slack only; the feel deadzone is in turning.js

function stickOf(gamepad) {
  const ax = gamepad.axes || [];
  const x = (ax.length > 2 ? ax[2] : ax[0]) || 0;
  const y = (ax.length > 3 ? ax[3] : ax[1]) || 0;
  return {
    x: Math.abs(x) > DEAD ? x : 0,
    y: Math.abs(y) > DEAD ? y : 0,
  };
}

function pressed(gamepad, i) {
  const b = gamepad.buttons && gamepad.buttons[i];
  return b ? (b.pressed || b.value > 0.35) : false;
}

export function readXRInput(session) {
  const out = { turn: 0, thrust: 0, boost: 0 };
  if (!session) return out;

  let turnRight = 0, turnOther = 0, thrustLeft = 0, thrustOther = 0;

  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const s = stickOf(gp);
    const hand = src.handedness;

    if (hand === 'right') turnRight = s.x;
    else turnOther = turnOther || s.x;

    // stick forward (negative Y) = push
    if (hand === 'left') thrustLeft = -s.y;
    else thrustOther = thrustOther || -s.y;

    // trigger or grip, either hand
    if (pressed(gp, 0) || pressed(gp, 1)) out.boost = 1;
  }

  out.turn = turnRight !== 0 ? turnRight : turnOther;
  out.thrust = thrustLeft !== 0 ? thrustLeft : thrustOther;
  if (out.thrust > 0.3) out.boost = Math.max(out.boost, out.thrust);
  return out;
}
