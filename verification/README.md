# Self-Verification (CLAUDE.md §7.2)

As of July 6, 2026. Headless checks with Playwright (Chromium) against the
dev server; the production build additionally checked via `npm run preview`.
All runs without console errors.

## Automated end-to-end run (flow.mjs, 20 checks — all PASS)

1. Start in Cairo (first-person), journal open with the "Departure" entry
2. Starting money $250, provisions 5 weeks, 2 gifts (design.md §6/§18)
3. Trade: bought a shovel (−$20) and a gold-jewelry gift (−$30)
4. Leave the settlement → bird's-eye view; re-entering → checkpoint in
   localStorage + journal entry
5. Travel to the village: date/provisions advance with movement
6. Enter the Nubian Village (first-person, journal entry)
7. Old man: language hint ("Nivera" = north) as a journal entry
8. Chief's hut: the culturally correct gift (gold, region North) unlocks
   the location hint (Nivera + coordinates); neutral/rejected gifts do not
9. The tomb lies procedurally north of the village (direction word matches)
10. Digging without the shovel in hand fails; with the shovel at the site
    → victory state

Additionally (checkpoint.mjs): a page reload shows "Load checkpoint";
loading restores the game state.

## Screenshots (core views)

| File | View |
|---|---|
| 01-birdseye-view.png | Bird's-eye view: Nile, Cairo, player character, status bar, coordinates |
| 02-port-cairo-trade.png | Cairo (first-person) with the trade dialog |
| 03-village-nubians.png | Nubian Village with chief's hut and villager |
| 04-chief-hut-audience.png | Audience with the chief (gift dialog) |
| 05-journal-hint.png | Opened journal with language and location hints |
| 06-start-journal.png | Game start with the departure entry |
| 07-victory.png | Victory state after recovering the tomb |
| 08-debug-menu.png | Debug menu (F1) with balance sliders |
| 09-production-build.png | Production build (`npm run preview`) |

## Addendum: full world model (§7.1.3, tightened wording)

As of July 6, 2026, second run (verify-world.mjs). Headless checks against
the dev server, all checks PASS, no console errors:

- Counts: 10 port cities, 22 villages (one per people, regions per
  design.md §4.5), 17 rivers, 8 lakes, 11 mountains, 5 waterfalls,
  Elephant Graveyard.
- Every settlement lies on walkable land; declared region = region model.
- Every river mouth (excluding inland confluences) lies < 0.5° from the
  coast; every waterfall < 0.25° from its river.
- The lake raster hits all 8 lake centers; the dig target area stays
  walkable (92/100 samples desert/savanna).
- Performance: 20,000 terrain samples in ~175 ms (spatial index).

| File | View |
|---|---|
| 10-worldmodel-nile-delta-cairo.png | Nile course with fertile banks, Cairo on the east bank, delta coast |
| 11-worldmodel-khartoum-confluence.png | Confluence of the White and Blue Nile at Khartoum |
| 12-worldmodel-lake-victoria.png | Lake Victoria with the Uganda Village on the north shore |
| 13-worldmodel-kilimanjaro.png | Kilimanjaro/Meru with snow caps, Masai Village |
| 14-worldmodel-congo-mouth-boma.png | Congo mouth with Boma and Livingstone Falls |
| 15-worldmodel-victoria-falls.png | Victoria Falls on the Zambezi |
| 16-worldmodel-cape-town.png | Cape peninsula with Cape Town |
| 17-worldmodel-lake-chad.png | Lake Chad (large ~1890 outline) |

## Addendum: graphics overhaul (§7.1.11)

As of July 6, 2026, third run (shots.mjs, preview-shot.mjs). Headless
checks against dev server and production preview, 0 console errors,
`npm run build` clean. Implemented: TSL sky dome (gradient, sun, drifting
clouds), sunlight with soft shadows (PCF), ACES tone mapping, animated
ocean/river water (swell, color noise, glints), seam-free smoothed terrain
normals with biome color blends and detail noise, instanced per-biome
vegetation (acacias, jungle trees, palms, bushes, rocks), detailed place
markers, a player figure with heading/walk animation, and reworked walkable
settlements (plaster/mud/thatch materials, building details, campfire,
props, ground cover).

| File | View |
|---|---|
| 18-graphics-port-cairo.png | Cairo (first-person): buildings with awning/parapet, palms, shadows |
| 19-graphics-birdseye-nile-delta.png | Nile delta: animated sea, fertile banks, Cairo marker |
| 20-graphics-savanna-kilimanjaro.png | East Africa: mountains, lakes, acacia savanna, haze |
| 21-graphics-jungle-congo.png | Congo basin: dense jungle, rivers, Stanley Falls |
| 22-graphics-coast-lagos.png | Guinea coast at Lagos: deep ocean with glints |
| 23-graphics-village-masai.png | Village (first-person): huts, campfire, old man |
| 24-graphics-chief-hut-closeup.png | Chief's hut up close: thatch/clay textures, regalia |
| 25-graphics-journal.png | Opened journal over the new graphics |
| 26-graphics-production-build.png | Production build (`npm run preview`) |

## Addendum: atmosphere (§7.1.12 — design.md §19 and §2 "Graphics and atmosphere")

As of July 6, 2026, fourth run (atmo-shots.mjs). Headless checks against
dev server and production preview, 0 console errors, `npm run build`
clean. Implemented:

- **Soundscape/music (procedural, WebAudio, no assets):** wind, insect,
  bird/monkey, surf, market-murmur and drum layers plus sparse kalimba
  phrases (pentatonic per region); crossfades on region and perspective
  switches; drums near villages. Starts after the first input (autoplay
  policy). Not verifiable via screenshot; code: `systems/ambience.ts`.
- **Wildlife as scenery:** herds (elephants, giraffes, zebras, antelopes)
  per biome, flamingos at lake shores, an ambient lion hunt (purely visual).
- **Vultures** circle above the character when provisions are exhausted
  (POC proxy for poor health, see open items).
- **Climate look:** regional fog (humid Congo haze, warm Sahara dust, clear
  highland air), low ground heat/mist layers.
- **Village and market life:** cook at the fire, weaver, playing children,
  goats; in ports, porters with crates and traders on the plaza.
- **Region-typical settlements (§2):** hut styles per region (flat-roof
  adobe, cone, stilts + tall cone, dome, banded rondavel), ground palettes,
  vegetation mix and clothing colors per region.
- **Illustrated journal entries:** ink sketches (animal, landmark, face,
  harbor, hut, compass, grave) beside matching entries.
- **Self-drawing map (M):** hand-drawn exploration map — coasts, rivers,
  lakes appear only in traveled areas; visited settlements with symbols;
  exploration percentage of the current region (§17).

| File | View |
|---|---|
| 27-atmosphere-savanna-herds.png | Zebra herd in the western savanna |
| 28-atmosphere-flamingos-lake-tanganyika.png | Flamingos at Lake Tanganyika |
| 29-atmosphere-jungle-mist.png | Congo basin: dense fog, ground mist, elephant |
| 30-atmosphere-desert-vultures.png | Sahara: heat haze, circling vultures (provisions 0), antelopes |
| 31-atmosphere-village-masai-life.png | Masai village (east style: dome hut, red cloth), cook/child/goat |
| 32-atmosphere-village-pygmies-stilts.png | Pygmy village (central style: stilts, tall cone roofs) |
| 33-atmosphere-port-cairo-bustle.png | Cairo: porters with crates, traders on the plaza |
| 34-atmosphere-journal-sketches.png | Journal with ink sketches (harbor, huts) |
| 35-atmosphere-map.png | Self-drawing map after a Nile journey (4% of North explored) |
| 36-atmosphere-production-build.png | Production build (`npm run preview`) |

## Addendum: real geodata (§7.1.13 — design.md §3 "Real geodata and terrain rendering")

As of July 6, 2026, fifth run (geo-shots.mjs). Headless checks against dev
server and production preview, 0 console errors, `npm run build` clean.
Implemented:

- **Real elevation model:** SRTM/GMTED/GEBCO composite (Terrarium tiles,
  AWS Open Data) → equirectangular 0.025° grid, stored as a 16-bit PNG in
  the repo (`public/geodata/dem.png`, 5.9 MB). Preprocessing reproducibly
  documented in `scripts/README.md` (`node scripts/build-geodata.mjs`).
  Ocean via flood fill (Qattara/Afar depressions stay land); settlements on
  sub-pixel islands are stamped as land (only Cape Town affected).
- **LOD streaming:** chunk rings of 56/28/20 segments around the player,
  skirts against LOD cracks, cache with eviction.
- **Smooth waters:** the coastline as the 0-contour of the continuous
  height field (bilinear land mask + depth-driven color); rivers/lakes via
  exact distances to Catmull-Rom-densified ~1890 vector courses
  (`src/world/hydro.ts`) — no more visible raster steps.
- **PBR splatting:** four generated tileable materials (sand, grass, rock,
  forest canopy) with albedo + detail normal maps, blended via vertex
  weights; steep slopes bi-planar with rock; biome tint from vertex colors.
- **Soft region transitions:** color/texture banding at region borders
  replaced by smoothstep region weights (gameplay types stay discrete).
- Real relief forms visible: Nile delta, rift mountains, Ethiopian
  highlands with gorges, Orange River canyon, Namib dune coast; Kilimanjaro
  5143 m in the grid (snow line from ~4300 m).

| File | View |
|---|---|
| 37-geodata-nile-delta.png | Nile delta: real delta shape, meandering Nile, Gulf of Suez |
| 38-geodata-kilimanjaro.png | Rift: real mountain ranges, Lake Victoria, Lake Rudolf |
| 39-geodata-coast-lagos.png | Guinea coast: smooth bays, Niger courses |
| 40-geodata-congo.png | Congo basin: meandering rivers, forest-canopy texture |
| 41-geodata-cape-town.png | Cape: Orange River canyon (Augrabies), Namib transition, dunes |
| 42-geodata-ethiopia.png | Ethiopian highlands: real Blue Nile gorges |
| 43-geodata-cairo-place.png | First-person view unchanged and functional |
| 44-geodata-production-build.png | Production build (`npm run preview`) |

Note: the Suez Canal corridor (Bitter Lakes) appears as water — it existed
in 1890 (opened 1869); the land bridge to Sinai remains in the DEM (probe
"Suez land bridge": 31 m, land).

## Addendum: lighting & post-processing pipeline (§7.1.14 — design.md §2)

As of July 6, 2026, sixth run. Headless checks against dev server and
production preview, 0 console errors on the WebGL 2 fallback path (WebGPU
uses the same TSL code). Screenshots 37–44 were re-rendered with the active
pipeline and evidence §7.1.13 and §7.1.14 together. Implemented:

- **IBL:** procedural HDR environment (sky + sun hotspot + ground bounce,
  consistent with the sun position) as `scene.environment`
  (`render/environment.ts`).
- **Physically grounded sky:** single-scatter approximation (Rayleigh
  extinction over air mass, Henyey-Greenstein Mie around the sun) instead
  of a gradient; regional moods (§19) as modulation (`render/sky.tsx`).
- **Cascaded shadows:** CSMShadowNode (3 cascades, practical, fade) on the
  travel sun; the first-person view keeps its high-resolution single shadow
  map (small scene = high density near the camera).
- **Post-processing** (`render/Effects.tsx`): scene pass with MRT normals
  (4× MSAA) → GTAO → bloom → color grading (saturation +7%, warm
  highlights) → subtle vignette; ACES tone mapping at output.
- **Water** (`render/water.ts`): Gerstner-style directional wave field with
  sharpened crests + noise swell; depth-dependent absorption from the real
  bathymetry (DEM texture: shallow turquoise → deep dark blue, distinct
  river/lake tone); foam on shore bands and wave crests; low roughness for
  IBL sky reflections; distance-opaque.

Open items (named in the criterion): TAA (AA via the scene pass's MSAA),
true screen-space reflection/refraction of the water (reflections come
from the IBL environment, refraction is approximated via depth
absorption), depth of field deliberately omitted (map readability).

## Addendum: lively, densely built settlements (§7.1.15 — design.md §2)

As of July 6, 2026, seventh run (belebt-shots.mjs). Headless checks against
dev server and production preview, 0 console errors. Implemented:

- **Dense building fabric:** per settlement far more non-enterable
  residential and auxiliary buildings than functional ones — ports: adobe
  house rows (some two-story, roof beams, windows) along a main and a cross
  street, warehouse, market stalls, tents; villages: 10–13 dwellings plus
  granaries, sheds, fences. Arrangement and dimensions procedural per
  settlement (§18).
- **Region-typical settlement patterns** (clearly distinguishable): North =
  adobe lane town with flat roofs; West = roundhut compounds with woven
  fences and stilt granaries; Central = stilt houses with tall cone roofs
  on dark humus ground; East = manyatta kraal (dome huts in a ring,
  thorn-bush fence, central livestock pen with goats); South = rondavel
  compounds with dry-stone walls.
- **Path network:** streets/paths as a soft canvas mask in the ground
  material (region-typical path color, ragged edges), connecting plaza,
  buildings, chief's hut and the settlement exit; ports with main/cross
  street and spurs to the functional buildings.
- **Inhabitant routines:** additional inhabitants step out of their
  dwellings, walk the paths to errand points (plaza, market, pen), linger
  and disappear into their homes again (dwelling doors are pure scenery —
  not enterable); some carry head baskets. The existing settlement life
  (cook, weaver, children, goats, porters, traders) remains active on top.
- **Highlighting:** the enterable functional buildings keep their labels
  and distinguishing features (awnings/regalia) and remain clearly
  recognizable.

| File | View |
|---|---|
| 45-places-port-cairo.png | Cairo: street grid, adobe rows, market stall, inhabitants |
| 46-places-village-nubians-lanes.png | North: adobe lane town, pale track, inhabitants |
| 47-places-village-hausa-compounds.png | West: roundhut compounds, woven fences |
| 48-places-village-pygmies-stilts.png | Central: stilt houses, shed |
| 49-places-village-masai-kraal.png | East: dome-hut kraal, livestock pen |
| 50-places-village-zulu-stone-walls.png | South: rondavels with dry-stone walls |
| 51-places-production-build.png | Production build (`npm run preview`) |

## Addendum: collision inside settlements (§7.1.16 — design.md §2)

As of July 7, 2026, eighth run (kollision-test.mjs). Headless checks
against dev server and production preview, 0 console errors. Implemented:

- **Circle collision model** (`src/scenes/place/collision.ts`): every
  solid object is approximated by circles in the XZ plane (rectangular
  buildings as a circle chain along their long axis). Resolution pushes the
  mover out along the contact normal — natural sliding along walls instead
  of a hard stop.
- **Collider generation** in `buildLayout`: functional and residential
  buildings, granaries, tents, warehouse, market stalls, sheds, fence
  posts, trees, rocks, plus fire pit/loom/cook in villages.
- **Player** (`PlaceScene`) and **all inhabitants** (`PlaceLife`: porters,
  children, goats, routine walkers) penetrate no colliders; walkers skip a
  waypoint when blocked for more than 1.4 s (no permanent stuck state).

Verification (13 checks, all PASS): in both perspectives a player placed
inside a building is ejected within one frame (no penetration); rammed
against walls the minimum clearance stays ≥ 0; every functional building
is operable from a collision-free standpoint (prompt appears); spawn,
plaza and the settlement exit stay clear. Note: headless Chromium
throttles requestAnimationFrame, so the test proves collision
frame-independently via ejection/non-penetration rather than sustained
walking.

| File | View |
|---|---|
| 52-collision-port-wall.png | Port: player stopped flush against a building wall |
| 53-collision-village-chief-hut.png | Village: stopped at the chief's hut, prompt reachable |

## Addendum: localization (§7.1.17 — design.md §17)

As of July 7, 2026, ninth run (i18n-shots.mjs). Headless checks against
dev server and production preview, 0 console errors in both languages.
Implemented:

- **Language files** `src/i18n/de.ts` and `src/i18n/en.ts` behind a shared
  `Strings` contract (`src/i18n/types.ts`) — a text added in only one
  language fails the TypeScript build. German is the default; the language
  switches at runtime via the debug menu (F1).
- **Language-neutral journal:** entries are stored as key+params
  (`TextRef`) and re-render in the selected language; plain-string entries
  from old checkpoints still display (backward compatible).
- **Localized proper names:** places ("Kairo"/"Cairo"), peoples
  ("Buschmänner"/"Bushmen"), landmarks ("Kilimandscharo"/"Kilimanjaro",
  "Tschadsee"/"Lake Chad"), plus date and coordinate formats per language
  (German decimal comma, English decimal point).
- **English texts are contextual**, not literal — diary voice of an 1890
  explorer.
- **Technical code fully English:** data files carry English ids
  (`lake-chad`, `kilimanjaro`, `masai-village` …); display names live only
  in the language files. The verification screenshots were renamed to
  English terms accordingly.

| File | View |
|---|---|
| 54-i18n-german-default.png | German (default): status bar, journal at start |
| 55-i18n-english-journal.png | English: journal, status bar after switching |
| 56-i18n-english-trade.png | English: trade dialog in Cairo |
| 57-i18n-english-map.png | English: map overlay with region/exploration |
| 58-i18n-debug-language.png | Debug menu with the language selector |

## Addendum: full re-verification (tenth run)

As of July 7, 2026, after the legacy cleanup. The formerly ephemeral
verification scripts now live in the repository (`scripts/verify/`,
documented in `scripts/README.md`) and were re-run in full:

- **flow.mjs** — gameplay loop end to end: 20/20 PASS, 0 console errors.
  Refreshed screenshots 01–07.
- **checkpoint.mjs** — save/reload/restore: 3/3 PASS.
- **collision.mjs** — §7.1.16: 12/12 PASS (port + village ejection tests,
  building reachability, access points). Refreshed screenshots 52–53.
- **world.mjs** — §7.1.3: all counts (10 ports, 22 villages, 17 rivers,
  8 lakes, 5 waterfalls) and placement checks PASS. Found and fixed:
  the reworked Niger course swallowed Timbuktu (stylized river band vs.
  port site); the local river node now passes south of the city as in
  reality. Refreshed screenshots 10–17.
- **i18n.mjs** — §7.1.17: 13/13 PASS. Refreshed screenshots 54–58.
- **preview.mjs** — production build renders console-clean. Refreshed
  screenshot 09.
- `npm run lint` and `npm audit` (§7.1.18): 0 findings, 0 vulnerabilities.
