# Geodata Preprocessing (design.md §3 "Real geodata and terrain rendering")

The runtime assets under `public/geodata/` are produced fully reproducibly
by these scripts (Node ≥ 20, no npm dependencies):

```
node scripts/build-geodata.mjs             # DEM: public/geodata/dem.png + dem.json
node scripts/generate-terrain-textures.mjs # ground textures: public/geodata/tex/*.png
```

## build-geodata.mjs — real elevation model

1. Downloads Terrarium elevation tiles (zoom 6, 224 tiles ≈ 10 MB) for the
   Africa bounding box from the public AWS Open Data bucket
   `elevation-tiles-prod` (Mapzen/Linux Foundation; composite of SRTM,
   GMTED2010 and GEBCO bathymetry; no authentication). Tiles are cached in
   `scripts/.tile-cache/` (gitignored).
2. Resamples the Web-Mercator tiles bilinearly onto an equirectangular grid
   (0.025° ≈ 2.8 km; matching the game's flat lat/lon world mapping),
   bounding box longitude −20…53, latitude −37…38.
3. Ocean mask via flood fill from the map border over elevations ≤ 0 m —
   below-sea-level depressions (Qattara, Afar) thus remain land. Afterwards
   all game settlements (parsed from `src/world/geo.ts`) are stamped as
   land if they sit on sub-pixel islands (only Cape Town was affected).
4. Chamfer distance transform to the coast for the shore ramps.
5. Encoded as one opaque RGB PNG (`dem.png`, custom PNG encoder with the
   "Up" filter): R/G = (elevation m + 12000) as 16 bit, B = 0 for ocean or
   1 + coast distance/0.02°. Elevations are quantized for compression
   (land 4 m, shallow water 8 m, deep sea 50 m). Metadata in `dem.json`.

At runtime `src/world/geodata.ts` loads the PNG (native browser decode)
and provides bilinear samplers; `src/world/hydro.ts` supplies exact
distances to the authored ~1890 river/lake courses (Catmull-Rom densified,
bucket grid — no rasterization).

## generate-terrain-textures.mjs — ground materials

Deterministically generates tileable albedo and normal maps (256²,
periodic value/Worley noise) for sand, grass, rock and forest canopy. They
are blended in the terrain material (TravelScene) via vertex splat
weights; steep slopes receive bi-planar projected rock.

## png.mjs

Dependency-free PNG codec (decode: 8-bit gray/RGB/RGBA non-interlaced;
encode: 8-bit RGB), used by both scripts.

# Verification Suite (CLAUDE.md §7.2)

`scripts/verify/` holds the headless acceptance checks (Playwright is a
devDependency; Chromium via `npx playwright install chromium`). All scripts
exit non-zero on failure and write screenshot evidence to `verification/`.

```
npm run dev                          # prerequisite for all dev-server checks
node scripts/verify/flow.mjs        # gameplay loop end to end (20 checks)
node scripts/verify/checkpoint.mjs  # checkpoint save/reload/restore
node scripts/verify/collision.mjs   # §7.1.16 collision, corners, hut entry, reachability
node scripts/verify/world.mjs       # §7.1.3 world-model data + screenshots
node scripts/verify/i18n.mjs        # §7.1.17 localization (de default, en)
node scripts/verify/voice.mjs       # §7.1.19 voice markup + read-aloud + auto-narration (needs HF CDN access)
node scripts/verify/settings.mjs    # §7.1.20 comfort/audio settings + lion feeding (§7.1.12)

npm run build && npm run preview    # prerequisite for the production check
node scripts/verify/preview.mjs     # §7.1.1 production build, console-clean
```

Notes:

- The dev-server checks rely on DEV-only hooks (`__game`, `__placePlayer`,
  `__placeLayout`, `__placeColliders`, `__placeCamera`, `__placeWalkers`,
  `__balance`, `__lionHunt`, `__setLang`, `__voiceMarkup`, `__ttsForceWasm`);
  they do not work against the production build.
- Chromium must run with `--use-angle=d3d11 --enable-gpu` (already set in
  the scripts). With the SwiftShader fallback, requestAnimationFrame drops
  to ~1 fps and interaction tests become meaninglessly slow.
- UI strings are asserted in German (the default language); journal entries
  are asserted by their language-neutral keys (design.md §17).
