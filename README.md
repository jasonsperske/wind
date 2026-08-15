# The Wind

You are a gust crossing a meadow, and the dunes and tundra beyond it. Skim low. Where
the grass parts around a closed bud, hold over it until it opens — the petals it gives
you make you stronger, and a stronger wind can climb.

The world is drawn in an SVG. [`world/world.svg`](world/world.svg) opens in a browser
or in Inkscape as a map, and it *is* the map — see
[The world is an SVG](#the-world-is-an-svg).

A WebXR toy: three.js, no build step, no dependencies to install. Runs in a desktop
browser and in the Quest 2 browser over USB port forwarding.

## Run it on a Quest 2

One-time setup on the headset:

1. Enable **Developer Mode** for the headset in the Meta Quest phone app
   (Menu → Devices → your headset → Developer Mode).
2. Plug the headset into this machine with a USB-C cable.
3. Put the headset on and accept **Allow USB debugging**.
4. Check the connection: `adb devices` should list it as `device`.

Then, from this directory:

```sh
npm run quest          # forwards the port and serves the game
npm run quest:open     # ...and asks the headset to open the page for you
```

In the headset browser go to **http://localhost:8080** and tap **Enter headset**.

### Why localhost and not the LAN address

WebXR is only exposed in a [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts).
`http://192.168.x.x:8080` is not one, so the *Enter headset* button never appears —
the page will tell you as much if you land there. `adb reverse tcp:8080 tcp:8080`
points the headset's own `localhost:8080` back at this machine, and `localhost`
*is* a secure origin. No certificates, no https, no tunnel service.

`npm run quest` does the `adb reverse` for you and removes it on Ctrl-C. If you
would rather drive it yourself:

```sh
npm run forward        # adb reverse tcp:8080 tcp:8080
npm run dev            # serve on :8080
npm run unforward      # when you are done
```

Use a different port with `PORT=8081 npm run quest`.

Editing a file and reloading in the headset is enough — nothing is cached and
nothing is built.

## Run it on a desktop

```sh
npm run dev            # then open http://localhost:8080
```

Drag anywhere (or move the mouse after clicking, which grabs the pointer) to steer,
`WASD` / arrows to steer with the keyboard, `Shift` or two fingers to gust.

## Controls in the headset

| Input | Does |
| --- | --- |
| Right thumbstick, left/right | Turn |
| Left thumbstick, forward | Gust — push harder, fly faster |
| Trigger or grip, either hand | Gust |
| Look up / down | Climb or dive, within what your current force allows |

You cannot climb steeply until you are carrying petals. A calm wind can barely lift
its nose; a gale climbs.

### The petal count in the headset

The DOM hud does not exist inside a WebXR session, so the count is drawn into the
world instead (`src/vrhud.js`) — a small canvas panel about 1.5 m ahead and 22°
below the horizon, showing the gust name, the number, and `PETALS CARRIED`.

It deliberately is *not* welded to your head. A rigidly head-locked panel sits at
a fixed spot on your retina and reads as dirt on the lens; this one lags the head
yaw with a ~0.4 s time constant, so it settles roughly where you last looked and
you find it by glancing down. It sits at 0.72 opacity and brightens to full for a
couple of seconds whenever the count changes, so catching petals is visible
without staring at it. If you tip your head straight down — where a yaw angle
stops meaning anything — it holds still rather than spinning.

## The world is an SVG

Everywhere you are allowed to fly is a closed shape in `world/world.svg`. Draw one,
give it `data-region`, and it is somewhere in the game.

```xml
<path data-region="The dunes"
      data-altitude="7" data-waviness="1.7" data-landscape="desert"
      d="M 120,-40 C 150,-160 280,-200 380,-150 ... Z"/>
```

| Attribute | Default | What it does |
| --- | --- | --- |
| `data-region` | — | Marks the shape as flyable. Its value is the name, for your benefit only |
| `data-altitude` | `0` | Metres the ground sits at under this shape |
| `data-waviness` | `1` | How hard the hills roll. `0` is a plain, `1` is the meadow, `3` is dramatic |
| `data-landscape` | `meadow` | `meadow`, `dune` or `tundra` — and the words you would actually reach for (`grass`, `field`, `sand`, `desert`, `ice`, `snow`, `arctic`) map onto those |

The `data-` prefix is optional: plain `region`, `altitude` and so on work too, for
editors that strip unknown `data-` attributes.

On the `<svg>` element, `data-meters-per-unit` says how big a user unit is (1 metre by
default) and `data-origin` says which unit is world `(0, 0)`. SVG *y* runs down the
page and becomes world *z*, which runs north. Anything without `data-region` — text,
a background rect, a legend — is ignored, so the file can look like a map.

A few things fall out of using real SVG rather than a format of our own:

- **Any shape works.** Outlines are read with `getPointAtLength`, so arcs, Béziers and
  whatever Inkscape emits are all fine. Nothing here parses path data.
- **Overlap them to connect them.** Where two regions overlap there is no edge, and
  that is how you get from the meadow to the dunes. Where they overlap, the shape
  listed *later* is the ground you are actually on — painter's order, as you would
  expect from SVG.
- **A second subpath is a hole.** The outcrop in the middle of the dunes is one: a
  piece of the map you have to fly around.
- **You start** at the deepest point of the *first* region listed.

Regions do not butt up against each other — altitude, waviness and landscape are
cross-faded over about 18 m, so the meadow runs into sand rather than stepping into it,
and neighbouring altitudes ramp instead of forming a cliff.

If the map is missing or has no regions, the title screen says so and the game falls
back to the endless meadow it used to be.

### Being turned around

There is no wall. Some 26 m before the last of the ground there is a headwind, and it
leans on your nose until you are pointing back the way you came — about a second and a
half for a right angle, two and a half for a full reversal. The comfort vignette comes
up while it happens, exactly as it does when you turn yourself.

The further out you get the harder the wind blows in, and far enough out it beats a
full gale outright, so a nose held stubbornly outward loses anyway. It is weather, not
a fence: `src/boundary.js`, tuned by the `BOUND_*` constants in `src/config.js`.

You can see it coming. The grass gives out about 16 m before the edge does, and the
ground itself dissolves into haze over the next 30 — so the world ends in a mist bank
you can read from a long way off, rather than somewhere you find by being shoved.

### How a shape becomes ground

The outlines are walked at 3 m intervals and baked, once at load, into a grid about
6 m across per cell: altitude, waviness, the landscape mix, and the signed distance to
the edge of the world. That grid goes to the GPU as two `RGBA16F` textures and stays in
JS as the `Float32Array` they were made from, and both are sampled bilinearly at texel
centres — so the ground the shader draws is the ground the collision uses. Baking
`world.svg` takes about 300 ms, behind the title screen; the textures come to ~540 KB.

## Comfort & steering

Open **Comfort & steering** on the title screen. Everything is remembered in
`localStorage`, and can also be forced from the URL — handy when you are testing
in the headset and do not want to fight a menu:

```
http://localhost:8080/?turn=snap&vignette=0&quality=low&speed=2.4
```

| Setting | Default | Notes |
| --- | --- | --- |
| Turning | Smooth | `snap` gives fixed-angle turns instead |
| Turn speed | 2.0 rad/s | Rate at full stick deflection |
| Snap angle | 30° | Only used in snap mode |
| Comfort vignette | On | Darkens the periphery while you turn |
| Headset detail | Medium | Grass density, foveation, framebuffer scale |

If the frame rate dips, drop **Headset detail** to Low — holding 72 Hz does more
for comfort than anything else here. Grass is the entire cost; the low setting
draws 12 000 blades instead of 22 000.

### What "smooth turning" actually means here

The naive version — `yaw += stick * rate * dt` — is technically continuous but
feels like a switch: the rotation rate jumps to full the moment the stick leaves
centre and stops dead when it returns. `src/turning.js` rounds off both edges:

- **Rescaled deadzone.** Below the threshold the stick does nothing; above it the
  remaining range is stretched back out to 0..1, so there is no step at the edge
  of the deadzone.
- **Response curve.** A small push gives a genuinely small turn (exponent 1.7),
  full deflection still gives full speed.
- **First-order lag on the *rate*, not the angle.** The turn rate eases toward the
  target with `1 - exp(-k·dt)`, which is frame-rate independent — the same feel at
  72 Hz in the headset and at 144 Hz on a monitor.
- **Comfort vignette** driven by that same rate, so the periphery darkens exactly
  as much as you are actually turning.

Snap mode reuses the same axis shaping, with the turn eased over ~70 ms rather
than teleported, and re-arms only after the stick returns near centre.

The desktop path runs through the same `Turner`, so keyboard and touch steering
ease in and out identically. Pointer-lock mouse look stays 1:1 — a mouse delta is
already smooth, and lagging it would just feel like input lag.

## Layout

```
index.html          markup, import map, title screen
styles/main.css
world/world.svg     the map — every region you can fly in
src/
  main.js           renderer, XR session, settings wiring, animation loop
  game.js           player state and the per-frame update
  regions.js        world.svg -> outlines -> the baked field grid
  boundary.js       the headwind at the edge of the world
  turning.js        deadzone / curve / rate smoothing — all steering feel
  xrinput.js        Touch controller axes -> normalised -1..1
  input.js          keyboard, touch and pointer-lock
  config.js         world constants, palette, quality tiers, defaults
  settings.js       localStorage + URL overrides
  field.js          the terrain function, in JS and GLSL — must stay in sync
  terrain.js  sky.js  grass.js  flowers.js  petals.js  vignette.js
  audio.js          wind noise and the chime a flower makes
  hud.js            the flat-screen readout (invisible inside a session)
  vrhud.js          the in-world petal count, for the headset
vendor/three.module.js   three.js r128, vendored so the headset needs no network
scripts/serve.js         dependency-free static server
scripts/quest.js         adb reverse + serve
reference/thewind.html   the original single-file prototype, kept for diffing
```

`field.js` holds the terrain height function twice, once in JS and once in GLSL.
The CPU copy decides where you collide and where flowers sit; the GPU copy draws
the ground. If you edit one, edit the other or flowers start floating. Both read
their altitude and waviness out of the grid `regions.js` bakes, so the part that
varies per region is shared rather than duplicated — it is the two copies of
`hills()` that still have to be kept in step by hand.
