// A map of the world, in the corner, for when you are lost in it.
//
// Off by default — `M` toggles it, `?minimap=1` starts it on, and under
// `?debug=1` it is `wind.minimap`. It draws the region outlines straight out of
// the map rather than anything derived, and keeps the page's orientation:
// world z runs *down* the map exactly as SVG y runs down the file, so what you
// see here is the drawing you edited.
//
// It is a DOM overlay, which means it is not there inside a headset session —
// nothing in the DOM is.

import { LAND_MAP, WATER_MAP, VIEW } from './config.js';
import { regionAt } from './regions.js';

const LONG = 240;        // css px on the map's long side
const MARGIN = 30;       // metres of world drawn beyond the outermost region
const RATE = 1 / 20;     // redraws a second — the dot moves a few px a second

export function createMinimap(world) {
  /* ------------------------------ projection ----------------------------- */
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of world.regions) {
    for (const ring of r.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        if (ring[i] < x0) x0 = ring[i];
        if (ring[i] > x1) x1 = ring[i];
        if (ring[i + 1] < z0) z0 = ring[i + 1];
        if (ring[i + 1] > z1) z1 = ring[i + 1];
      }
    }
  }
  if (!Number.isFinite(x0)) {           // no map — show a plain square of nowhere
    x0 = -400; z0 = -400; x1 = 400; z1 = 400;
  }
  x0 -= MARGIN; z0 -= MARGIN; x1 += MARGIN; z1 += MARGIN;

  const scale = Math.min(LONG / (x1 - x0), LONG / (z1 - z0));
  const cw = Math.max(1, Math.round((x1 - x0) * scale));
  const ch = Math.max(1, Math.round((z1 - z0) * scale));
  const px = (x) => (x - x0) * scale;
  const pz = (z) => (z - z0) * scale;

  /* -------------------------------- markup ------------------------------- */
  const el = document.createElement('div');
  el.id = 'minimap';
  el.hidden = true;
  const canvas = document.createElement('canvas');
  const read = document.createElement('div');
  read.className = 'read';
  el.append(canvas, read);
  document.body.appendChild(el);

  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // The regions never move, so they are drawn once and blitted after that.
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const bx = base.getContext('2d');
  bx.scale(dpr, dpr);

  function paintBase() {
    bx.fillStyle = 'rgba(20,32,27,0.62)';       // everywhere you may not go
    bx.fillRect(0, 0, cw, ch);
    for (const r of world.regions) {
      bx.beginPath();
      for (const ring of r.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const x = px(ring[i]), z = pz(ring[i + 1]);
          if (i === 0) bx.moveTo(x, z); else bx.lineTo(x, z);
        }
        bx.closePath();
      }
      // evenodd, so a second ring inside a shape reads as the hole it is
      bx.fillStyle = LAND_MAP[r.land] || LAND_MAP[0];
      bx.fill('evenodd');
      bx.strokeStyle = 'rgba(28,44,36,0.5)';
      bx.lineWidth = 1;
      bx.stroke();
    }
    // lakes sit on top of the ground they are drawn on
    for (const lake of world.lakes) {
      bx.beginPath();
      for (const ring of lake.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const x = px(ring[i]), z = pz(ring[i + 1]);
          if (i === 0) bx.moveTo(x, z); else bx.lineTo(x, z);
        }
        bx.closePath();
      }
      bx.fillStyle = WATER_MAP;
      bx.fill('evenodd');
    }
    // and where things grow, as an outline rather than a fill
    for (const s of world.scatters) {
      bx.beginPath();
      for (const ring of s.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const x = px(ring[i]), z = pz(ring[i + 1]);
          if (i === 0) bx.moveTo(x, z); else bx.lineTo(x, z);
        }
        bx.closePath();
      }
      bx.strokeStyle = s.kind === 0 ? 'rgba(32,74,36,0.55)' : 'rgba(58,58,58,0.5)';
      bx.setLineDash(s.kind === 0 ? [3, 3] : [1, 3]);
      bx.lineWidth = 1;
      bx.stroke();
      bx.setLineDash([]);
    }

    // where you started
    bx.beginPath();
    bx.arc(px(world.home.x), pz(world.home.z), 2.5, 0, Math.PI * 2);
    bx.strokeStyle = 'rgba(30,46,38,0.65)';
    bx.lineWidth = 1.5;
    bx.stroke();
  }
  paintBase();

  /* --------------------------------- draw -------------------------------- */
  const probe = new Float32Array(8);
  let since = RATE;
  let shown = false;
  let lastRead = '';

  function paint(x, z, heading, push) {
    const mx = px(x), mz = pz(z);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(base, 0, 0, cw, ch);

    // how far you can see from here
    ctx.beginPath();
    ctx.arc(mx, mz, VIEW * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // and you: a wedge pointing where the wind is actually going
    const dx = Math.sin(heading), dz = Math.cos(heading);
    ctx.beginPath();
    ctx.moveTo(mx + dx * 6.5, mz + dz * 6.5);
    ctx.lineTo(mx - dx * 3.4 + dz * 3.6, mz - dz * 3.4 - dx * 3.6);
    ctx.lineTo(mx - dx * 3.4 - dz * 3.6, mz - dz * 3.4 + dx * 3.6);
    ctx.closePath();
    ctx.fillStyle = push > 0.02 ? '#e0715e' : '#e8b64c';   // red while it turns you
    ctx.fill();
    ctx.strokeStyle = 'rgba(22,34,28,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function describe(x, z) {
    const where = Math.round(x) + ', ' + Math.round(z);
    if (!world.regions.length) return where + ' · no map — the meadow has no edges';
    const s = world.sample(x, z, probe)[2];
    const here = regionAt(world, x, z);
    return where + ' · ' + (here ? here.name : 'off the map') + ' · '
      + (s >= 0 ? Math.round(s) + ' m to the edge' : Math.round(-s) + ' m outside');
  }

  function update(dt, x, z, heading, push, inXR) {
    // Nothing in the DOM survives a headset session, so do not spend the frame.
    if (!shown || inXR) return;
    since += dt;
    if (since < RATE) return;
    since = 0;
    paint(x, z, heading, push);
    const line = describe(x, z);
    if (line !== lastRead) { lastRead = line; read.textContent = line; }
  }

  function setShown(on) {
    shown = on;
    el.hidden = !on;
    since = RATE;                 // redraw on the very next frame
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    setShown(!shown);
  });

  const q = new URLSearchParams(location.search);
  if (q.has('minimap') && q.get('minimap') !== '0') setShown(true);

  return {
    update, setShown,
    toggle() { setShown(!shown); return shown; },
    isShown: () => shown,
    element: el,
  };
}
