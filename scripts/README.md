# Geodata Preprocessing (design.md §3 "Real geodata and terrain rendering")

The runtime assets under `public/geodata/` are produced fully reproducibly
by these scripts (Node ≥ 20, no npm dependencies):

```
node scripts/build-geodata.mjs              # DEM: public/geodata/dem.png + dem.json
node scripts/build-horizon-maps.mjs         # horizon maps: public/geodata/horizon-{a,b}.png + horizon.json
node scripts/generate-terrain-textures.mjs  # terrain textures: public/geodata/tex/*.png
node scripts/generate-surface-textures.mjs  # settlement surfaces: public/tex/*.png
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

## build-horizon-maps.mjs — terrain self-shadowing and sky occlusion

Reads the committed `dem.png` (no network) and measures, per texel, the
horizon: the steepest rise of any land ahead in a given direction, as the
tangent of its elevation angle, in real geometry (design.md §2.7).

1. Elevations (ocean at sea level) are box-downsampled by `--scale` (default
   2: 1460×1500 texels of 0.05°; `--scale 4` gives the quarter map).
   Distances follow the game's flat lat/lon world, 111.32 km per degree on
   both axes.
2. `horizonSweep.mjs` sweeps the grid per direction: parallel lines along the
   direction, each walked from its far end with a monotone stack holding the
   upper convex hull of the land ahead — linear in texels (~9 s for the half
   map). Directions are integer grid steps, so every texel centre lies on a
   line and the sweep equals the brute-force ray march exactly
   (`src/render/horizonSweep.test.ts`).
3. Six sun directions, 233.13°…306.87° at ~15° steps: at the fixed 16:00
   hour the sun's azimuth never leaves 233.1°…306.8° over the map and year
   (`src/render/horizonSlices.test.ts`). Plus one sky-occlusion channel, the
   mean horizon over 16 directions round the full circle.
4. Encoded as two RGBA PNGs (straight alpha), byte = √(tan / 1) · 255:
   `horizon-a.png` RGBA = sun slices 0–3, `horizon-b.png` RG = slices 4–5,
   B = mean horizon, A = 255. Metadata in `horizon.json`. Half map:
   2.58 + 2.27 MB (17.5 MB raw); quarter map: 0.65 + 0.57 MB.

At runtime `src/render/horizonMaps.ts` fetches them lazily — never at the low
graphics level — and the travel terrain material reads them.

## generate-terrain-textures.mjs — ground materials

Deterministically generates tileable albedo and normal maps (256²,
periodic value/Worley noise) for sand, grass, rock and forest canopy. They
are blended in the terrain material (TravelScene) via vertex splat
weights; steep slopes receive bi-planar projected rock.

## generate-surface-textures.mjs — settlement surfaces

Same pattern at 512² for the first-person settlement materials (plaster,
mud daub, thatch, wood, trodden ground), written to `public/tex/`. The
shared noise fields and bake loop live in `textureFields.mjs`; their exact
tileability and normal normalisation are pinned by
`src/render/surfaceTextures.test.ts`. At runtime the maps are sampled
world-space triplanar with mip/anisotropy band-limiting
(`src/render/materials.ts`).

## png.mjs

Dependency-free PNG codec (decode: 8-bit gray/RGB/RGBA non-interlaced;
encode: 8-bit RGB or RGBA), used by all four generators.

# Verification Suite (CLAUDE.md §7.2)

`scripts/verify/` holds the headless acceptance checks (Playwright is a
devDependency; Chromium via `npx playwright install chromium`). Every script
exits non-zero on failure and writes screenshot evidence to `verification/`.

The whole regression runs with one command:

```
npm test              # scripts/verify/run-all.mjs: type-check + build, oxlint,
                      # the fast Vitest layer (jsdom), then the browser suites
                      # against a managed dev server, then the
                      # production-preview smoke test
npm run test:small    # the SMALL everyday tier
npm run test:large    # the LARGE tier
npm test -- flow      # a single suite (dev server managed for you)
npm test -- build lint  # just the build + lint preflight
```

Which tier to run for a change, and what each covers, is in
[`scripts/verify/README.md`](verify/README.md) and `scripts/verify/tiers.mjs`.

`npm test` exits non-zero if any stage fails or a suite logs a browser console
error. The verification suites are listed, in run order, in
`scripts/verify/tiers.mjs` (`DEV_SUITES`, plus `preview` for the production
build). Each maps to the CLAUDE.md §7.1 criteria named in its header comment. The bulk of the regression (pure logic, store transitions,
HTML-HUD components) runs in the Vitest layer (`npm run test:unit`); the
layer split and the old→new coverage map live in
[`scripts/verify/README.md`](verify/README.md).

`npm test` manages its own servers: each run's dev/preview server binds an
**auto-assigned free port** (never the default :5173/:4173) and passes it to
the suites via `BASE_URL`, so a manual `npm run dev` you leave open on :5173
can be started, used and terminated at any time without ever colliding with a
regression. A single suite can also be run directly against a manual server:
`node scripts/verify/<name>.mjs` hits `BASE_URL` (default :5173), so start
`npm run dev` first (except `docs`, which needs no server, and `preview`,
which needs a `npm run build && npm run preview` on :4173).

Notes:

- The dev-server checks rely on DEV-only `window.__*` hooks (`__game`, `__ui`
  and many more, defined next to the code they expose); they do not work
  against the production build.
- Chromium must run with `--enable-gpu` and the ANGLE backend its PLATFORM can
  provide — `--use-angle=d3d11` on Windows, and surfaceless EGL over the host's GPU
  on Linux (`VERIFY_ANGLE=gl-egl`). The verify suites pick it themselves (point 475,
  `scripts/verify/launch-args-core.mjs`); the perf tools here (`perf-bench.mjs`, `perf-breakdown.mjs`,
  `perf-structure.mjs`) still hard-code the Windows flag. Beware the SwiftShader fallback — the only backend a GPU-less
  container can run: requestAnimationFrame drops to ~1 fps and interaction tests
  become meaninglessly slow, so a machine that verifies pictures wants a real GPU.
- The default language is English (design.md §17); suites that assert
  German strings switch the language explicitly via `__setLang`. Journal
  entries are asserted by their language-neutral keys.
