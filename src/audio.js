// Filtered noise that rises with speed, plus a chime when a flower opens and,
// when the weather calls for it, the hiss of rain.
let actx = null, windGain = null, windFilter = null;
let rainGain = null, rainFilter = null, rainWant = 0, rainCut = 2000;

// Brown-ish noise: white, integrated a little, which is what wind and rain both
// sound like once a filter has been at them.
function noiseBuffer(seconds, roll, gain) {
  const len = Math.floor(actx.sampleRate * seconds);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + roll * w) / (1 + roll);
    d[i] = last * gain;
  }
  return buf;
}

function loop(buf, node) {
  const src = actx.createBufferSource();
  src.buffer = buf; src.loop = true;
  src.connect(node);
  src.start();
  return src;
}

export function startAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();

    windFilter = actx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windGain = actx.createGain();
    windGain.gain.value = 0.0;
    loop(noiseBuffer(2, 0.03, 3.2), windFilter);
    windFilter.connect(windGain); windGain.connect(actx.destination);

    // Rain sits much higher up — near-white through a gentle lowpass, so
    // drizzle is a whisper and a downpour is a wash.
    rainFilter = actx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 2000;
    rainGain = actx.createGain();
    rainGain.gain.value = 0.0;
    loop(noiseBuffer(3, 0.5, 0.9), rainFilter);
    rainFilter.connect(rainGain); rainGain.connect(actx.destination);
  } catch (err) {
    actx = null;
  }
}

// kind: 'rain' | 'snow' | 'none'. Snow is silent, which is the point of snow.
export function setWeatherSound(kind, amount) {
  if (kind === 'rain') {
    rainWant = 0.012 + amount * 0.075;
    rainCut = 1300 + amount * 3400;
  } else {
    rainWant = 0;
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
  const k = Math.min(1, dt * 3);
  windGain.gain.value += (loud - windGain.gain.value) * k;
  windFilter.frequency.value += ((300 + speed * 46) - windFilter.frequency.value) * k;
  // ease rather than switch, so changing the weather does not click
  const rk = Math.min(1, dt * 1.2);
  rainGain.gain.value += (rainWant - rainGain.gain.value) * rk;
  rainFilter.frequency.value += (rainCut - rainFilter.frequency.value) * rk;
}
