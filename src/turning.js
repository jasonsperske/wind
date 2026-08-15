const DEG = Math.PI / 180;   // kept local so this module stays dependency-free

// Smooth turning, one place for every input path.
//
// Raw `rigYaw += stick * rate * dt` is what makes headset turning feel bad: the
// rate jumps from zero to full the instant the stick leaves centre, and stops
// just as abruptly. Everything here exists to round those two edges off —
// a rescaled deadzone so there is no dead step at the threshold, an exponent so
// small pushes give small turns, and a first-order lag on the *rate* so the
// world eases into and out of the turn instead of snapping into it.

export function shapeAxis(v, deadzone, curve) {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const t = (a - deadzone) / (1 - deadzone);
  return Math.sign(v) * Math.pow(Math.min(t, 1), curve);
}

// Frame-rate independent exponential approach. dt varies between 72 Hz in the
// headset and whatever the desktop is doing; lerping by `dt*k` would change the
// feel with the frame rate, this does not.
export function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export class Turner {
  constructor(settings) {
    this.settings = settings;
    this.rate = 0;          // rad/s, smoothed
    this.amount = 0;        // 0..1, how hard we are turning — drives the vignette
    this._snapArmed = true;
    this._snapLeft = 0;     // radians still owed on the current snap
    this._snapDir = 1;
  }

  reset() {
    this.rate = 0;
    this.amount = 0;
    this._snapLeft = 0;
    this._snapArmed = true;
  }

  // `raw` is the stick axis, -1..1, positive = right. Returns the yaw delta in
  // radians for this frame (positive = turn left, matching three's +Y rotation).
  update(dt, raw) {
    const s = this.settings;

    if (s.turnMode === 'snap') {
      const a = shapeAxis(raw, s.deadzone, 1);
      if (this._snapArmed && Math.abs(a) > 0.5) {
        this._snapArmed = false;
        this._snapDir = Math.sign(a);
        this._snapLeft = s.snapAngle * DEG;
      }
      if (Math.abs(a) < 0.3) this._snapArmed = true;

      // Even a snap reads better eased over a couple of frames than teleported.
      const SNAP_TIME = 0.07;
      const step = Math.min(this._snapLeft, (s.snapAngle * DEG / SNAP_TIME) * dt);
      this._snapLeft -= step;
      this.amount = this._snapLeft > 0 ? 1 : approach(this.amount, 0, 8, dt);
      this.rate = 0;
      return -this._snapDir * step;
    }

    const target = -shapeAxis(raw, s.deadzone, s.curve) * s.turnSpeed;
    this.rate = approach(this.rate, target, s.ramp, dt);
    if (Math.abs(this.rate) < 1e-4) this.rate = 0;
    this.amount = Math.min(1, Math.abs(this.rate) / Math.max(s.turnSpeed, 0.001));
    return this.rate * dt;
  }
}
