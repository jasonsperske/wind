# Landscape refresh: headset review

Feature branch: `codex/landscape-refresh`. Keep this branch separate from main
until the headset review passes.

## What changed

- Three layered alpine silhouettes with irregular snow lines and lit slopes.
  These are panoramic background scenery, not new flyable terrain.
- Slow procedural cloud banks, lit by the selected hour, and weather-dependent
  mountain visibility. Clouds also animate on the title screen.
- Tapered, slightly taller grass with a steady lean, coherent gust fronts and
  small crosswind arcs.
- Per-fragment water ripple normals, broad sky/cloud reflections, softer distant
  highlights and a subtle shoreline pattern. Water remains at its collision height.

The changes add shader work but no geometry, draw calls, textures or dependencies.
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
