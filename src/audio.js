// Filtered noise that rises with speed, plus a chime when a flower opens.
let actx = null, windGain = null, windFilter = null;

export function startAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    const len = actx.sampleRate * 2;
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.03 * w) / 1.03;
      d[i] = last * 3.2;
    }
    const src = actx.createBufferSource();
    src.buffer = buf; src.loop = true;
    windFilter = actx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windGain = actx.createGain();
    windGain.gain.value = 0.0;
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(actx.destination);
    src.start();
  } catch (err) {
    actx = null;
  }
}

export function chime(hue) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.value = 520 + hue * 380;
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.10, actx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 1.1);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + 1.2);
}

export function updateWind(dt, speed, boost) {
  if (!windGain) return;
  const loud = 0.02 + speed * 0.006 + boost * 0.02;
  windGain.gain.value += (loud - windGain.gain.value) * Math.min(1, dt * 3);
  windFilter.frequency.value += ((300 + speed * 46) - windFilter.frequency.value) * Math.min(1, dt * 3);
}
