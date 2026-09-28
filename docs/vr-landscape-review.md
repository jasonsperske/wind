# Landscape refresh: headset review

Feature branch: `codex/landscape-refresh`. Keep this branch separate from main
until the headset review passes.

## What changed

- Three layered alpine silhouettes with irregular snow lines and lit slopes.
  These are panoramic background scenery, not new flyable terrain.
- Slow procedural cloud banks, lit by the selected hour, and weather-dependent
  mountain visibility. Clouds also animate on the title screen.
- Fine tapered grass with a steady lean, coherent gust fronts, small crosswind
  arcs, shaded roots and sunlit tips. More of the existing instance budget goes
  to the nearest ring. Ground gusts share the blades' main wave.
- Cupped teardrop flower and carried-petal meshes, with larger blooms and
  gentle colour gradients.
- Per-fragment water ripple normals, broad sky/cloud reflections, softer distant
  highlights and a subtle shoreline pattern. Water remains at its collision height.

The changes add shader work and finer petal meshes, but no extra draw calls,
textures or dependencies. Each petal uses 32 triangles instead of two; grass
keeps its existing vertex and instance budgets.
Existing Quest quality settings still control the grass instance budget. Reflections
approximate the sky; they do not capture trees, petals or mountain silhouettes.

## Run

Start the app from this branch. For a localhost-only server:

```sh
node --input-type=module -e "import { createServer } from './scripts/serve.js'; createServer().listen(8080, '127.0.0.1');"
```

With an authorized headset connected by USB, run `npm run forward`, then open
`http://localhost:8080/?debug=1` in the headset browser and select **Enter headset**.
If the preview is already running on port 8080, use it rather than starting a
second server. `npm run unforward` removes the forwarding after testing.

## Before merging

- Start with Medium quality. Check sustained 72 Hz on Quest 2 using your headset
  performance overlay, particularly while skimming grass and looking across water.
  Compare Low if frame time increases. Desktop rendering is not a VR benchmark.
- Look slowly around a full circle: mountain silhouettes should join without a
  seam; the distant panorama should feel comfortable in stereo.
- Skim the meadow, collect petals, gust and climb. Watch blade tips for shimmer,
  ring transitions and overly bright grass at grazing angles.
- Use `?map=lake&time=dusk&weather=clear&debug=1` for water. Skim the shore, then
  climb: check ripple stability, highlights and the dry-to-wet transition.
- Check `?map=whiteout` and the World menu's full/new moon hours. Bad weather
  should hide the ranges; new-moon clouds should remain dark.
- Test snap/smooth turns, comfort vignette, both eyes, and leaving/re-entering VR.

Local checks: JavaScript syntax and desktop browser rendering. Actual headset
performance, stereo comfort and controller regression checks remain for VR review.

## Tree and boulder wind bypass

Trees and boulders now anticipate your approach and gently steer/drift you around their
footprint, using the currently rendered obstacle set for each quality tier.
A consistent passing side prevents head-on indecision. The comfort vignette
follows the automatic turn; the map-edge wind retains priority. This is soft
avoidance, not a solid collider or a guarantee against entering dense branches
when steering into them. Boulder bounds include their desert size and stretched proportions, with earlier
steering for broad rocks.

In VR, approach a tree head-on and from both sides at calm and boosted speed;
check that the turn feels gradual, releases after passing, and does not affect
flight above the canopy. Repeat in dense woodland and near the world boundary.
Run the steering simulations with `node tests/propwind.test.js`.

## Desert rocks

Desert scatter now uses larger weathered sandstone forms with seeded slab/pillar
proportions, ochre strata, fine seams that fade with distance, and pale dusty
upper faces. Rocks elsewhere keep their neutral palette and original size range,
but share the new closed faceted mesh. Rock geometry increases from 8 to 100
triangles per instance; the existing rock instance cap and single draw call remain.

Check the dunes at low and high altitude in VR: inspect silhouettes, rock-ground
intersections on slopes, and sediment layers for shimmer while moving.

Repeat the bypass checks with the largest desert boulders at calm and boosted
speed, and fly over their tops to check the height cutoff.

## Mixed woodland

Trees now include rounded branching oaks (768 triangles), slender forked birches
(796), and layered pines (358). Three instanced tree draws replace one; the total
tree count remains capped at 150 and is reduced by the existing quality budget.
There are no new textures or transparent leaf cards.

Broad deterministic density patches produce groves and clearings within the SVG
woodland boundaries. Species cluster loosely; tree positions, sizes and species
remain stable on return. The nearest candidates share one budget across species.
Wind bounds use each model's dimensions, with allowance for lean and sway.

Review dense groves in VR for frame rate and comfort during tree bypasses.
Check all three species close up, gust past the crowns, and revisit a grove to
check placement stability. Automated geometry/budget/placement checks run with:

```sh
node --experimental-loader ./tests/three-loader.mjs tests/woodland.test.js
node tests/propwind.test.js
```
