import { DEFAULT_SETTINGS } from './config.js';

const KEY = 'thewind.settings.v1';

function fromQuery() {
  const q = new URLSearchParams(location.search);
  const out = {};
  if (q.has('turn'))     out.turnMode = q.get('turn') === 'snap' ? 'snap' : 'smooth';
  if (q.has('speed'))    out.turnSpeed = parseFloat(q.get('speed'));
  if (q.has('vignette')) out.vignette = q.get('vignette') !== '0';
  if (q.has('quality'))  out.quality = q.get('quality');
  // ?map= picks which world to fly; the minimap overlay is ?minimap=
  if (q.has('map'))      out.map = q.get('map');
  if (q.has('time'))     out.time = q.get('time');
  if (q.has('weather'))  out.weather = q.get('weather');
  return out;
}

function load() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {
    stored = {};
  }
  const s = Object.assign({}, DEFAULT_SETTINGS, stored, fromQuery());
  if (!Number.isFinite(s.turnSpeed)) s.turnSpeed = DEFAULT_SETTINGS.turnSpeed;
  return s;
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) { /* private browsing on the headset — run with the defaults */ }
}

export function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
}
