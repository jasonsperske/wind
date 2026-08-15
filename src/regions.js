// The world is drawn in an SVG.
//
// Any shape carrying `data-region` is somewhere you are allowed to fly. Its
// attributes say how high the ground sits under it (`data-altitude`), how hard
// that ground rolls (`data-waviness`) and what it is made of
// (`data-landscape`). The union of every such shape is the whole of the flyable
// world; leave it and boundary.js turns you around.
//
// Reading the outlines is left to the browser. `getPointAtLength` walks
// anything the path spec allows — arcs, curves, several subpaths — so a file
// saved out of Inkscape drops straight in and holes come for free. What this
// module does is walk each outline at a fixed spacing, convert it to metres,
// and bake the whole set down to one small grid that the CPU and the shaders
// both read: altitude, waviness, landscape mix, and the signed distance to the
// edge of the world.

export const LANDSCAPES = ['meadow', 'dune', 'tundra'];

// what people actually type
const ALIASES = {
  grass: 'meadow', grassy: 'meadow', grassland: 'meadow', field: 'meadow',
  plain: 'meadow', prairie: 'meadow', pasture: 'meadow',
  sand: 'dune', sandy: 'dune', desert: 'dune', dunes: 'dune',
  ice: 'tundra', icy: 'tundra', snow: 'tundra', snowy: 'tundra',
  glacier: 'tundra', arctic: 'tundra',
};

const STEP  = 3.0;    // metres between samples along an outline
const MAX_D = 96.0;   // distance is only tracked this far from an edge
const BLEND = 18.0;   // metres over which neighbouring regions cross-fade
const PAD   = 170.0;  // metres of defined ground beyond the outermost region
const TEXEL = 4.0;    // metres per grid cell, before the cap below
const MAXN  = 224;    // cap on grid cells per axis

/* ------------------------------ svg reading ------------------------------ */

function attrOf(el, name) {
  let v = el.getAttribute('data-' + name);
  if (v === null) v = el.getAttribute(name);
  return v === null ? '' : v.trim();
}

function numOf(el, name, fallback) {
  const v = parseFloat(attrOf(el, name));
  return Number.isFinite(v) ? v : fallback;
}

function landOf(el) {
  let name = attrOf(el, 'landscape').toLowerCase();
  name = ALIASES[name] || name;
  const i = LANDSCAPES.indexOf(name);
  return i < 0 ? 0 : i;
}

// Walk one shape's outline and return its rings, in world metres.
//
// Sampling by arc length means consecutive points are never more than one step
// apart *along the curve*, so their straight-line distance cannot exceed a step
// either — unless the path jumped, which is exactly what a new subpath is. That
// is how holes are found, and it works for relative `m` commands too, which
// splitting the `d` string does not.
function outlines(el, matrix, stepUser, toWorld) {
  let total = 0;
  try { total = el.getTotalLength(); } catch (e) { return []; }
  if (!(total > 0)) return [];

  const n = Math.max(8, Math.ceil(total / stepUser));
  const ds = total / n;
  const gap = ds * 1.5;
  const rings = [];
  let ring = [];
  let lx = 0, ly = 0, have = false;

  for (let i = 0; i <= n; i++) {
    const raw = el.getPointAtLength(Math.min(i * ds, total));
    if (have && Math.hypot(raw.x - lx, raw.y - ly) > gap) {
      if (ring.length >= 6) rings.push(Float64Array.from(ring));
      ring = [];
    }
    lx = raw.x; ly = raw.y; have = true;

    const p = matrix ? raw.matrixTransform(matrix) : raw;
    const wx = toWorld[0] + (p.x - toWorld[2]) * toWorld[4];
    const wz = toWorld[1] + (p.y - toWorld[3]) * toWorld[4];
    const k = ring.length;
    if (k < 2 || Math.abs(ring[k - 2] - wx) > 1e-9 || Math.abs(ring[k - 1] - wz) > 1e-9) {
      ring.push(wx, wz);
    }
  }
  if (ring.length >= 6) rings.push(Float64Array.from(ring));
  return rings;
}

function readRegions(svg) {
  const scale = Math.abs(numOf(svg, 'meters-per-unit', 1)) || 1;

  // world (0,0) sits at the centre of the viewBox unless the file says otherwise
  let ox = 0, oy = 0;
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite)) {
    ox = vb[0] + vb[2] / 2;
    oy = vb[1] + vb[3] / 2;
  }
  const org = attrOf(svg, 'origin').split(/[\s,]+/).map(Number);
  if (org.length === 2 && org.every(Number.isFinite)) { ox = org[0]; oy = org[1]; }

  // [worldX0, worldZ0, userX0, userY0, scale] — packed to keep the hot loop flat
  const toWorld = [0, 0, ox, oy, scale];

  // getScreenCTM includes the viewBox mapping on both ends, so composing the
  // element's with the root's inverse cancels it and leaves group transforms —
  // which is what a layer in an editor adds.
  const root = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  const inv = root ? root.inverse() : null;

  const out = [];
  for (const el of svg.querySelectorAll('[data-region], [region]')) {
    if (typeof el.getTotalLength !== 'function') continue;
    let m = null;
    if (inv && typeof el.getScreenCTM === 'function') {
      const c = el.getScreenCTM();
      if (c) m = inv.multiply(c);
    }
    const rings = outlines(el, m, STEP / scale, toWorld);
    if (!rings.length) continue;
    const land = landOf(el);
    out.push({
      name: attrOf(el, 'region') || 'region ' + (out.length + 1),
      altitude: numOf(el, 'altitude', 0),
      waviness: numOf(el, 'waviness', 1),
      landscape: LANDSCAPES[land],
      land,
      rings,
    });
  }
  return out;
}

/* ------------------------------- the field ------------------------------- */

function insideRegion(region, x, z) {
  let odd = false;
  for (const ring of region.rings) {
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const zi = ring[i * 2 + 1], zj = ring[j * 2 + 1];
      if ((zi > z) !== (zj > z)) {
        const xi = ring[i * 2], xj = ring[j * 2];
        if (x < xi + (z - zi) / (zj - zi) * (xj - xi)) odd = !odd;
      }
    }
  }
  return odd;
}

// Separable running-sum box blur of one channel of an interleaved RGBA grid.
function blurChannel(grid, nx, nz, ch, r, tmp) {
  const w = 1 / (2 * r + 1);
  for (let j = 0; j < nz; j++) {
    const row = j * nx;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += grid[(row + Math.min(nx - 1, Math.max(0, i))) * 4 + ch];
    for (let i = 0; i < nx; i++) {
      tmp[row + i] = sum * w;
      const add = Math.min(nx - 1, i + r + 1), sub = Math.max(0, i - r);
      sum += grid[(row + add) * 4 + ch] - grid[(row + sub) * 4 + ch];
    }
  }
  for (let i = 0; i < nx; i++) {
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += tmp[Math.min(nz - 1, Math.max(0, j)) * nx + i];
    for (let j = 0; j < nz; j++) {
      grid[(j * nx + i) * 4 + ch] = sum * w;
      const add = Math.min(nz - 1, j + r + 1), sub = Math.max(0, j - r);
      sum += tmp[add * nx + i] - tmp[sub * nx + i];
    }
  }
}

function bake(regions) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of regions) {
    for (const ring of r.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        if (ring[i] < x0) x0 = ring[i];
        if (ring[i] > x1) x1 = ring[i];
        if (ring[i + 1] < z0) z0 = ring[i + 1];
        if (ring[i + 1] > z1) z1 = ring[i + 1];
      }
    }
  }
  x0 -= PAD; z0 -= PAD; x1 += PAD; z1 += PAD;

  const cell = Math.max(TEXEL, (x1 - x0) / (MAXN - 1), (z1 - z0) / (MAXN - 1));
  const nx = Math.min(MAXN, Math.ceil((x1 - x0) / cell) + 1);
  const nz = Math.min(MAXN, Math.ceil((z1 - z0) / cell) + 1);

  /* every ring, flattened into one list of segments */
  const sx = [], sr = [];
  for (let ri = 0; ri < regions.length; ri++) {
    for (const ring of regions[ri].rings) {
      const n = ring.length >> 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = ring[i * 2], az = ring[i * 2 + 1];
        const bx = ring[j * 2], bz = ring[j * 2 + 1];
        if (ax === bx && az === bz) continue;
        sx.push(ax, az, bx, bz);
        sr.push(ri);
      }
    }
  }
  const seg = Float64Array.from(sx);
  const reg = Int32Array.from(sr);
  const count = reg.length;

  // A seam buried inside another region is not an edge of the world — drop it
  // from the distance field, or overlapping regions would push you off their
  // shared border instead of letting you cross it.
  const buried = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    const mx = (seg[k * 4] + seg[k * 4 + 2]) * 0.5;
    const mz = (seg[k * 4 + 1] + seg[k * 4 + 3]) * 0.5;
    for (let ri = 0; ri < regions.length; ri++) {
      if (ri === reg[k]) continue;
      if (insideRegion(regions[ri], mx, mz)) { buried[k] = 1; break; }
    }
  }

  const A = new Float32Array(nx * nz * 4);   // altitude, waviness, signed distance
  const B = new Float32Array(nx * nz * 4);   // landscape weights
  const held = new Int16Array(nx * nz).fill(-1);
  const near = new Int32Array(count);
  const par = new Uint8Array(regions.length);

  for (let j = 0; j < nz; j++) {
    const z = z0 + j * cell;

    let nc = 0;
    const cross = [];
    for (let k = 0; k < count; k++) {
      const az = seg[k * 4 + 1], bz = seg[k * 4 + 3];
      const lo = az < bz ? az : bz, hi = az < bz ? bz : az;
      if (!buried[k] && z >= lo - MAX_D && z <= hi + MAX_D) near[nc++] = k;
      if ((az > z) !== (bz > z)) {
        const ax = seg[k * 4], bx = seg[k * 4 + 2];
        cross.push([ax + (z - az) / (bz - az) * (bx - ax), reg[k]]);
      }
    }
    // Sweeping right to left, each crossing flips one region's parity exactly
    // once — an inside test for the whole row in a single pass.
    cross.sort((p, q) => p[0] - q[0]);
    par.fill(0);
    let ptr = cross.length - 1;

    for (let i = nx - 1; i >= 0; i--) {
      const x = x0 + i * cell;
      while (ptr >= 0 && cross[ptr][0] > x) { par[cross[ptr][1]] ^= 1; ptr--; }

      let holds = -1;
      for (let ri = regions.length - 1; ri >= 0; ri--) if (par[ri]) { holds = ri; break; }

      let best = MAX_D * MAX_D, bestReg = -1;
      for (let t = 0; t < nc; t++) {
        const k = near[t];
        const ax = seg[k * 4], az = seg[k * 4 + 1];
        const bx = seg[k * 4 + 2], bz = seg[k * 4 + 3];
        if (x < (ax < bx ? ax : bx) - MAX_D || x > (ax > bx ? ax : bx) + MAX_D) continue;
        const dx = bx - ax, dz = bz - az;
        const L = dx * dx + dz * dz;
        let u = L > 0 ? ((x - ax) * dx + (z - az) * dz) / L : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = x - (ax + dx * u), ez = z - (az + dz * u);
        const d2 = ex * ex + ez * ez;
        if (d2 < best) { best = d2; bestReg = reg[k]; }
      }

      const d = Math.sqrt(best);
      const which = holds >= 0 ? holds : (bestReg >= 0 ? bestReg : 0);
      const R = regions[which];
      held[j * nx + i] = holds;
      const o = (j * nx + i) * 4;
      A[o] = R.altitude;
      A[o + 1] = R.waviness;
      A[o + 2] = holds >= 0 ? d : -d;
      A[o + 3] = 1;
      B[o + R.land] = 1;
    }
  }

  // Ease the parameters across region borders so a meadow runs into a desert
  // instead of stepping into one, and so neighbouring altitudes ramp.
  const r = Math.max(1, Math.round(BLEND / cell));
  const tmp = new Float32Array(nx * nz);
  for (let pass = 0; pass < 2; pass++) {
    blurChannel(A, nx, nz, 0, r, tmp);
    blurChannel(A, nx, nz, 1, r, tmp);
    blurChannel(B, nx, nz, 0, r, tmp);
    blurChannel(B, nx, nz, 1, r, tmp);
    blurChannel(B, nx, nz, 2, r, tmp);
  }

  // You start deep inside the first region the map lists — deepest meaning
  // furthest from any edge, so the first thing you see is open world. Distances
  // are clipped, so the deepest part is usually a plateau of ties; take the
  // middle of it, unless the region is a crescent and the middle is not in it.
  let homeI = 0, homeJ = 0, deepest = -Infinity, ties = 0, si = 0, sj = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (pass === 0 ? held[k] !== 0 : held[k] < 0) continue;
        const s = A[k * 4 + 2];
        if (s > deepest) { deepest = s; homeI = i; homeJ = j; ties = 0; si = 0; sj = 0; }
        if (s >= deepest - 1e-3) { ties++; si += i; sj += j; }
      }
    }
    if (ties > 0) break;      // nothing of the first region survives — take any
  }
  if (ties > 0) {
    const mi = Math.round(si / ties), mj = Math.round(sj / ties);
    if (held[mj * nx + mi] >= 0 && A[(mj * nx + mi) * 4 + 2] > 0) { homeI = mi; homeJ = mj; }
  }

  return {
    regions, A, B, nx, nz, cell, x0, z0,
    home: { x: x0 + homeI * cell, z: z0 + homeJ * cell },
    sample: sampler(A, B, nx, nz, cell, x0, z0),
  };
}

// Bilinear, matching what the shader gets from a LinearFilter texture sampled at
// texel centres — the CPU decides where flowers sit and where the ground stops
// you, the GPU draws it, and the two have to agree.
function sampler(A, B, nx, nz, cell, x0, z0) {
  return function sample(x, z, out) {
    let gx = (x - x0) / cell, gz = (z - z0) / cell;
    gx = gx < 0 ? 0 : gx > nx - 1 ? nx - 1 : gx;
    gz = gz < 0 ? 0 : gz > nz - 1 ? nz - 1 : gz;
    const i0 = Math.floor(gx), j0 = Math.floor(gz);
    const i1 = i0 + 1 < nx ? i0 + 1 : nx - 1;
    const j1 = j0 + 1 < nz ? j0 + 1 : nz - 1;
    const fx = gx - i0, fz = gz - j0;
    const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz);
    const w01 = (1 - fx) * fz, w11 = fx * fz;
    const a = (j0 * nx + i0) * 4, b = (j0 * nx + i1) * 4;
    const c = (j1 * nx + i0) * 4, d = (j1 * nx + i1) * 4;
    for (let ch = 0; ch < 3; ch++) {
      out[ch]     = A[a + ch] * w00 + A[b + ch] * w10 + A[c + ch] * w01 + A[d + ch] * w11;
      out[ch + 3] = B[a + ch] * w00 + B[b + ch] * w10 + B[c + ch] * w01 + B[d + ch] * w11;
    }
    return out;
  };
}

/* -------------------------------- loading -------------------------------- */

// One meadow, no edges — what the game is before a map is read, and what it
// falls back to if the map cannot be.
export function flatWorld(note) {
  const nx = 2, nz = 2;
  const A = new Float32Array(nx * nz * 4);
  const B = new Float32Array(nx * nz * 4);
  for (let k = 0; k < nx * nz; k++) {
    A[k * 4 + 1] = 1;          // ordinary hills
    A[k * 4 + 2] = MAX_D;      // and nowhere to fall off
    A[k * 4 + 3] = 1;
    B[k * 4] = 1;              // grass
  }
  return {
    regions: [], A, B, nx, nz,
    cell: 4000, x0: -4000, z0: -4000,
    home: { x: 0, z: 0 },
    sample: sampler(A, B, nx, nz, 4000, -4000, -4000),
    error: note || null,
  };
}

export async function loadWorld(url) {
  let text;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    text = await res.text();
  } catch (err) {
    return flatWorld('The map <code>' + url + '</code> could not be read (' + err.message
      + '), so the meadow runs on without edges.');
  }

  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || !doc.documentElement
      || doc.documentElement.nodeName.toLowerCase() !== 'svg') {
    return flatWorld('The map <code>' + url + '</code> is not valid SVG, so the meadow runs on without edges.');
  }

  // getScreenCTM and getPointAtLength want a rendered element, so the map goes
  // into the page — offscreen and invisible — for as long as it takes to read.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;'
    + 'overflow:hidden;opacity:0;pointer-events:none';
  host.appendChild(document.importNode(doc.documentElement, true));
  document.body.appendChild(host);

  let regions = [];
  try {
    regions = readRegions(host.firstChild);
  } finally {
    host.remove();
  }

  if (!regions.length) {
    return flatWorld('The map <code>' + url + '</code> holds no shape marked <code>data-region</code>, '
      + 'so the meadow runs on without edges.');
  }
  return bake(regions);
}
