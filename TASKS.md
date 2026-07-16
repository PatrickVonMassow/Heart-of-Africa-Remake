# TASKS — sequential feature batch

Working file for the current batch. Exactly one point is in progress at a time.
Each point: implement → adapt docs (incl. README/CLAUDE.md/design.md) → add
acceptance tests → run the SCOPED regression (below) → commit atomically (only
if fully green) → tick it here → clear context and re-enter from this file.

Scoped regression (user mandate 2026-07-14, replacing full-per-point): build +
lint + audit + the whole Vitest layer run for EVERY point; of the browser
suites, only those the diff touches (mapping below). The FULL regression still
runs: when a point touches a scene core (TravelScene/Wildlife/PlaceScene, the
renderer/post pipeline, store.ts core), at every ~4th point as a collective
gate, before every Closing, and whenever a flake retry failed twice. Flake
policy: if exactly one suite fails on a check from the documented flake list
(movement 0.00 m, bathe probability, TTS timing, calf-sacrifice behaviour
window, frame-starved screenshot probes, spawn body-spacing settle window),
rerun THAT suite standalone
once — green counts as green (noted in the tick); red twice means a real
investigation. WATCHDOG: if this process ever lets a bug slip through that the
full-per-point regression would have caught, REPORT it to the user immediately
— the policy is then reconsidered.

On failure after correction attempts: STOP, report, and do not build further on a
broken base. Tests are never weakened; a red run is fixed in the production code.

This file and every new entry are written in English. Commit messages do not
reference the TASKS point number.

Point states (user mandate 2026-07-14): `[ ]` not started · `[*]` in
progress · `[~]` implemented, regression/commit still pending · `[x]` done —
ticked ONLY after the scoped regression is green AND the commit is pushed.

Tracking (user mandate 2026-07-14): a point being worked on is marked `[*]`;
on completion its result note ends with a tracking line
`(track: <start> -> <finish>, <minutes> min, ~<tokens>, <model+settings>)`.
Times are Berlin local; non-work waits (external blocks) are called out;
token figures are order-of-magnitude estimates (not measurable in-session),
always marked ~ and split into INPUT and OUTPUT tokens (user mandate
2026-07-14). Split heuristic while no exact counters exist: ~85 % input
(tool results, file reads, context) / ~15 % output (code, prose) of the
estimated total — refined per point when its shape clearly deviates. Model/settings name the model ID, effort level and thinking switch (source:
the user-level ~/.claude/settings.json — model claude-fable-5[1m], effort
high — plus the visible thinking state) and the session settings (autonomous
batch in the VS Code extension, permissions defaultMode dontAsk).

## Regression command

```sh
npm test          # full regression: build → lint → vitest → browser suites → preview
npm test -- flow  # a single browser suite (dev server managed for you)
```

`npm test` runs `scripts/verify/run-all.mjs`: it type-checks and builds
(`tsc -b` + `vite build`), lints (oxlint, zero warnings/errors), type-checks and
runs the fast **Vitest** layer (jsdom — pure logic, store transitions, HTML-HUD
components), then starts the Vite dev server (:5173) and runs the 13 browser
**Playwright** suites (`docs`, `world`, `i18n`, `flow`, `health`, `events`,
`collision`, `handwriting`, `polish`, `gamepad`, `voice`, `settings`,
`enrichments`) against it, and finally builds and runs the production-preview
smoke test (`preview.mjs`, :4173). It exits non-zero if any stage fails or logs a
browser console error. Prerequisites: `npm install` (Playwright + Chromium), a
free :5173/:4173. Individual browser suites can also be run directly with
`node scripts/verify/<name>.mjs` against a running dev server.

Diff → browser-suite mapping (scoped runs): `src/i18n/` → i18n; store/systems
logic → Vitest only (flow if the core loop is touched); `src/scenes/place/` →
collision, polish, settings; `src/scenes/travel/` → enrichments, events,
health; `src/render/` → settings, enrichments, polish; `src/ui/` → i18n,
enrichments, settings, flow (dialogs); journal/TTS → voice, handwriting;
`src/world/` → world, enrichments; `scripts/verify/X.mjs` → X itself; `*.md`
→ docs. When unsure, include the suite.

**Every point adds a test on the appropriate layer** — Vitest for anything
assertable without a browser, Playwright (`scripts/verify/*.mjs`) only for the
scene/RAF/geometry/CSS/audio/screenshot cases (`scripts/verify/README.md` holds
the map).

Work order (user override, 2026-07-14): after point 83, the open points are
worked in THIS order — 88, 90, 87, 86, 91, 85, 84, 89. The numbering stays
as-is; only the sequence changes.

## Checklist

- [x] 1. Animals sometimes oscillate between two headings ~90° apart (seen while
  fleeing from elephants) — stabilise the direction choice so the facing no
  longer flip-flops.
- [x] 2. A predator eating a calf: the red stain and the calf shrinking start
  only after 5 s; during that window the calf still struggles. If a parent
  touches the predator within that window it sacrifices itself and is eaten
  instead of the calf, and the calf gets up and escapes; if the parent arrives
  too late, both are eaten. In addition, parents charge the predator as soon as a
  calf is being eaten.
  Reworked after review (the sacrifice fired but was invisible — the guard
  stood ~2 units from the calf, so the charge resolved within frames): the
  hunted calf now visibly flees (slower than the predator), the parent stands
  clear at the catch, making the rescue charge a visible ~1 s run; calf-hunt
  chance 0.45 → 0.6; fixed a spawn bug that mislinked families across chunk
  groups. Superseded by point 30 (living shield).
- [x] 3. Calves hop about playfully and sometimes fall into the water. Parents
  wade in and pull them out. In the attempt a calf or a parent can be swept over
  a waterfall and die; if a calf goes over a waterfall, the parents plunge after
  it and die.
- [x] 4. Spawn animals with enough spacing that they do not overlap; add
  collision detection so they do not walk through one another.
  (The elephant trample remains the designed exception: it must still be able
  to walk over a too-slow smaller animal.)
- [x] 5. Vultures: spawn outside the visible area and fly in (not appearing out
  of nowhere); after feeding they fly off and only despawn well outside the
  visible area. Account for the zoom level.
- [x] 6. Predators must not despawn within the visible area. In general: animals
  only despawn well outside the visible area (account for the zoom level).
  (Herd streaming already despawned beyond the zoom-aware ring; the offender
  was the scripted hunt predator, which left by timer and aborted at a fixed
  90 units — both now resolve only past the zoom-aware view ring.)
- [x] 7. When a predator leaves, it leaves behind a small remnant of prey that is
  then eaten by vultures.
- [x] 8. In the debug-menu-extended zoom mode one should be able to zoom out far
  enough to see the whole continent. So far this is prevented both by not being
  able to zoom out far enough and by haze obscuring the view. In the zoom range
  reachable only via the debug extension, no haze should be shown.
- [x] 9. When paddling through water in the canoe and the crocodile random event
  fires, a hint still appears suggesting one should better travel by canoe —
  although one already is.
  (The culprit was the first-time water danger warning, which always advised
  the canoe; with a canoe in the pack it now acknowledges its protection
  instead.)
- [x] 10. When something is discovered — such as a waterfall — it should be
  announced via the journal.
- [x] 11. The water in some lakes looks oddly blotchy and the blotches flicker
  while walking — e.g. in Lake Victoria.
- [x] 12. The blood stain of dying animals has gaps and looks more like a
  Pac-Man.
- [x] 13. More variety in the journal entries for the different villages. These
  should reflect locally/historically accurate peculiarities of each.
- [x] 14. One should be able to recover even without medicine. Currently one dies
  even from a light wound.
- [x] 15. Animals must not walk into the impassable open ocean (the water beyond
  the continent outline that blocks the traveller too).
- [x] 16. After using the new extended zoom-out and then entering a village,
  massive clipping errors appear when walking close to a hut (likely the raised
  debug-zoom camera near plane carrying over into the first-person scene).

- [x] 17. The movement oscillation persisted after point 1. Root cause: the
  summed threat field smoothed the heading only WITHIN the dodge, while the
  rendered facing was recomputed per behavior branch and snapped at every
  boundary — and elephants never rendered their travel heading at all. Fixed
  with one persistent facing per animal, steered by every behavior at a
  capped turn rate, exit-ring hysteresis on the dodge, flights ending in
  their run direction, elephants facing their line of travel. (The suggested
  nearest-threat pick was rejected: it would reintroduce the ~90° flip.)

- [x] 18. The walkable continent ends at the Red Sea. Everything northeast of
  the African Red Sea coast (the Red Sea itself, Sinai, the Arabian peninsula)
  is open, impassable ocean — the same as the sea around the rest of the
  continent. No special treatment of the Red Sea as inland water.
  (Boundary polyline slightly seaward of the ~1890 coast — Mediterranean →
  Suez → Bab-el-Mandeb → Gulf of Aden — in src/world/redSea.ts; isBlocked()
  blocks northeast of it and loadGeodata() stamps those DEM texels to ocean,
  which the bathymetry texture also reads. Two baseline probes contradicted
  the task and are pinned as-is: the Mozambique channel was already blocked,
  the Sidra bight already swimmable.)

- [x] 19. At the continent's edges one can swim a long way out into the open
  ocean — that must not be possible. Land masses outside the walkable
  continent are still visible on the map material and must be removed. And a
  scrap of the Red Sea still juts into the land.
  (Swimmable sea capped at a calibratable coastal band —
  balance.oceanSwimMarginDeg 1.2°, debug-editable — on top of the unchanged
  hull rules. The northeast stamp became a keep-flood trim in
  trimToGameWorld(): only land connected to the game's land-mass seeds
  survives. The Red Sea scrap came from boundary vertices biting into the
  real coast; the flood keeps African-connected land, and a raw-DEM scan
  asserts trimmed borders keep land only at the Suez isthmus gate.)
- [x] 20. In the debug zoom-out, walking produces oddities: the ocean moves
  offset against the land mass, and the landscape is only rendered in a
  rectangular area that covers a fraction of the visible range.
  (Two causes: the scaled water plane's shader reconstructed world XZ from
  the unscaled local position — a planeScale uniform now tracks the mesh
  scale; and the "rectangle" was the detailed chunk area against the
  far-terrain sheet — the sheet now bakes the chunks' mean ground-texture
  response (farColor.ts, pure-tested) and the chunk-bound dressing hides
  beyond zoom 3.)
- [x] 21. After the recent wave of design.md changes (restructure into numbered
  subsections, §7.1 slimming, the Red Sea/world-trim work), review README.md
  and bring it in step where it has drifted.
  (The README cites no §s, so none needed fixing. Drift closed across the
  gameplay list, stack list, scripts, geodata trim note and test-strategy
  link; the criteria count stays 32, docs.mjs green.)
- [x] 22. Fully zoomed out in the debug mode, the ocean still renders
  incorrectly — especially in the northeast.
  (Three layers fixed: the shader clamp-repeated the bathymetry edge texels
  into streaks — beyond the DEM bbox it now blends to plain deep ocean; the
  trim stamp deepened -1000 → -3000 m; and ghost shallows (trimmed-island
  shelf rings, shallow sea northeast of the boundary) are deepened via a
  dilated stamp mask. The African coast keeps its real shelf bathymetry.)
- [x] 23. In the west-southwest a large, unreachable land mass is still shown;
  it must be removed from the map as well.
  (Not reproducible as literal land: cap-zoom sweeps from four positions
  show no land outside the game's land masses. Likeliest culprit was the
  point-22 artifact family — clamped edge bands and bright ghost shallows
  reading as sand-colored land — all gone now. Resolved as Madagascar in
  point 25.)
- [x] 24. F3 (full loadout) should also unlock the extended zoom mode.
  (The F3 handler now enables the wheel-zoom unlock alongside the loadout;
  asserted in src/ui/Hud.test.tsx via a window keydown.)
- [x] 25. The unreachable land mass of point 23 is identified (user
  screenshot): it is Madagascar. It cannot be reached in the game and must
  therefore be removed from the map material — the rendered world and the
  exploration map alike.
  (Trim seed and coastline polygon removed, so the world trim stamps it to
  deep ocean and the exploration map no longer sketches it; its shelf banks
  left ghost outlines, so trimmed-box shallows deepen up to 800 m and the
  deep tone saturates by ~1600 m. design.md §3.1, CLAUDE.md pt. 4, README
  and the redSea tests follow.)

- [x] 26. One purchased food unit should last four weeks instead of one.
  (New balance value foodUnitDays 28, used by both buy paths — port money
  and village gifts — debug-menu editable in both languages; economy store
  test asserts against the balance value.)
- [x] 27. The journal panel should keep a small gap to the right screen edge.
  (.journal right: 0 → 12px; enrichments asserts the panel's right edge
  keeps a gap to the viewport edge.)
- [x] 28. Raise the canoe speed factor to 3x.
  (balance.canoeSpeedup 2 → 3; balance default test and the CLAUDE.md pt. 20
  checked number follow.)
- [x] 29. Shrink the re-entry debounce radius against accidentally re-entering
  a settlement.
  (placeReentryMargin 2 → 1; the leavePlace exit offset shrinks with it,
  from enterRadius+1.5 to enterRadius+0.5, so the exit point stays inside
  the clearance and the debounce still arms — points 26-29 land as one
  calibration commit since they share balance.ts/store.ts hunks.)
- [x] 30. During a calf hunt the parent must not flee with the calf — it
  protects it: while the chase runs it holds itself between hunter and young
  (a living shield, taken in the calf's place if the hunter reaches it), and
  only once a calf is caught does it charge the predator to sacrifice itself.
  (Replaces the former escort run — an intermediate head-on-charge variant
  landed as its own commit and was revised on request; blockHeading
  station-keeping is pure-tested, the enrichments choreography asserts the
  held shield line, the mid-chase take without any catch, and the preserved
  catch→struggle→charge fallback.)
- [x] 31. Juveniles must read as young beyond their smaller body: baby schema
  within the schematic animal style.
  (Per-species calf geometries — proportionally larger head on a shorter
  neck, shorter rounder body, leggy stance, no horns/tusks/beard/mane, the
  elephant calf with stubby trunk and smaller ears — rendered through own
  instanced calf meshes; fauna.test.ts asserts the proportions, enrichments
  the live calf-mesh instancing. Lands as one commit with point 30 (shared
  hunks); also hardens the kill-flock remnant check against inherited
  suite state by resetting the kill flight to idle up front.)
- [x] 32. design.md reads as iteratively grown — mechanics described in too
  many words (e.g. the parents' sacrifice, §19.8). Condense it against the
  code, and rework the other MD files in the project.
  (design.md tightened section by section with the § numbering and every
  binding mechanic/value unchanged; CLAUDE.md §7.1 kept all Verifiable
  conditions but moved the stale mappings of the seven deleted Playwright
  suites (economy, hints, expedition, reputation, camps, saveload,
  checkpoint) to their Vitest homes and split the pt. 12/20 walls into
  topic bullets; README/scripts READMEs caught up (TRAA on by default,
  current suite list); the long TASKS notes compacted to root cause +
  outcome.)
- [x] 33. Travelling water with a canoe now shows the explorer seated in it,
  but the hull sits partly under the water surface and reads poorly. Raise
  the canoe so it rides on the surface with only a shallow draft.
  (A CANOE_WATERLINE lift (0.18) raises the ridden hull and the seated rider
  together, so the hull rides on the surface with a shallow draft and the
  gunwale rim reads clearly; verified per zoomed screenshot 88.)
- [x] 34. On land, make it recognizable that the explorer is transporting the
  canoe (carrying or dragging it — whichever reads better in the bird's-eye
  view).
  (Dragging reads best at the steep-oblique bird's-eye angle (an overhead
  portage would occlude the figure): a second canoe instance trails behind
  the walking explorer along his heading, near end lifted to the grip, far
  end resting on the ground. The hull geometry is shared by the ridden and
  the dragged canoe via a CanoeHull component; __player exposes canoeing +
  carrying, enrichments asserts ride-on-water / drag-on-land / neither, and
  screenshot 89 shows the drag.)

- [x] 35. Make the explorer's injury visible on the bird's-eye figure: when he
  carries a wound (light/severe), it shows on the character, scaling with the
  wound level.
  (Wound marks toggle on the Player by afflictions.wounds. Placed on the
  crown and shoulders — the surfaces that read from the steep top-down angle,
  where torso/chest marks were occluded by the helmet: light = an off-white
  bandage strap over the helmet with a blood spot, severe = the strap runs
  red and blood soaks both shoulders. __player.wounds drives the toggle;
  enrichments asserts the severe-shows / healed-clears path with screenshot
  90.)
- [x] 36. Add a health bar at the bottom left: green at 100 % health, shading
  ever redder toward 0 %.
  (A HealthBar HUD element in the bottom-left corner; the fill width tracks
  health / balance.health.max and its colour sweeps hue 120→0 (green→red) as
  health drops. Localized label (Health/Gesundheit); Hud.test.tsx asserts
  full-width-green at full health and shrink-reddens toward zero. (Moved to
  the bottom-right row in point 37.)
- [x] 37. Move the health bar to the bottom right, with the camp/journal
  buttons to its left in the same row.
  (The two buttons and the health bar now share a right-anchored flex row
  (.hud-bottom-right): Camp, Journal, then the health bar at the far right;
  the buttons lost their individual absolute positions and the inventory bar
  returned to the bottom-left corner. The journal-panel clearance check still
  holds against the buttons' tops.)
- [x] 38. The ridden canoe looked filled with water — the world water plane
  showed up through the open hull. Lift the hull clear of the surface so the
  wooden interior reads instead of water.
  (First pass raised the whole hull above the sea plane (y≈0); completed in
  point 40 for elevated rivers.)
- [x] 39. Swap the health bar and the right buttons: the health bar goes to the
  left of the row, the camp/journal buttons to the far right.
  (Reordered the .hud-bottom-right flex children to HealthBar, Camp, Journal
  — the journal toggle returns to the bottom-right corner.)
- [x] 40. The canoe is still sometimes flooded — visible driving along the Nile.
  (Root cause: the river/lake surface is drawn SURFACE_LIFT (0.3) above the
  carved bed, but the player group sits at the bed height, so on an elevated
  river — bed height ≫ 0, like the Nile — the hull sat 0.3 below the visible
  surface and flooded. SURFACE_LIFT is now exported from Rivers.tsx and the
  Player lifts the canoe by it on a 'water' cell (river/lake); the sea plane
  keeps its own level. CANOE_HULL_CLEARANCE 0.27 keeps the hull's lowest
  point just above whichever surface applies.)

- [x] 41. The canoe still floods at some Nile spots. Near the mouth/where the
  biome map misclassifies a river cell as ocean, the terrain type is 'ocean'
  so the river surface lift is not applied and the hull sits below the ribbon.
  Detect "on a river" by river proximity, not terrain type.
  (The Player now floats the canoe on the actual water surface: on a river/lake
  — detected via riverDistance, not the terrain type — the surface is
  max(-0.05, bed + SURFACE_LIFT); the sea keeps its own level. So a
  misclassified 'ocean' river cell no longer drops the lift.)
- [x] 42. Move the health bar to the top right, below the status bar, at the
  same height as the FPS counter.
  (.health-status row absolute at top:46px right:12px; the camp/journal buttons
  returned to the bottom-right.)
- [x] 43. On land the ground shows through the dragged canoe (the open hull).
  Give the hull a solid floor so nothing shows through. Test in very hilly
  mountains too, where the ground slope could still reveal a gap.
  (A solid opaque floor disc inside CanoeHull occludes the ground/water through
  the open bowl; verified on a river and on steep northern mountains.)
- [x] 44. When the canoe is dragged on land, the paddle should be visibly
  lying inside it.
  (A shared CanoePaddle is stowed lengthwise in the dragged hull.)
- [x] 45. Rivers read too narrow — the Nile especially — making it easy to
  stray briefly onto land while canoeing. Widen the navigable channel (the
  ~1890 courses stay authentic; the width is a playability calibration).
  (RIVER_WIDTH_DEG 0.14 → 0.17 and HALF_WIDTH 1.35 → 1.7 — the max widening that
  keeps every settlement off the water; Timbuktu, at river distance 0.172, is
  the tightest. world.test pins the new value.)
- [x] 46. In settlements the background panorama wildlife (§2.5) sometimes
  clips into the backdrop relief or floats in the air (seen in Cairo). Place
  the silhouettes on the backdrop surface so they neither sink nor float.
  (A shared backdropHeightAt() — the same formula the backdrop mesh is built
  from — grounds the drifting silhouettes on the relief.)
- [x] 47. The children playing tag in villages keep catching briefly and then
  their position jumps forward. Smooth the movement so it no longer stutters.
  (Each kid eases toward the circling target and resolves the collision on the
  eased step, so it slides along obstacles instead of clamping at the absolute
  circle point and then jumping when the point clears.)
- [x] 48. Villages sit so close to water that they reach into it, so canoeing a
  river can drift the traveller into the village by accident. Do not auto-enter
  a settlement while the traveller is on a water cell (enter it by stepping
  onto land), so a river passage never pulls him in.
  (The bird's-eye enter check skips entry when the player's cell is 'water'.)
- [x] 49. Entering a settlement does not put the focus on the controls as §17.5
  intends: a mouse cursor shows and the player must click before keyboard/
  mouse-look work. Make entering focus the game controls (mouse-look engaging
  without a separate click where the browser allows it).
  (Pointer lock is now requested on entry — the walk-in keypress carries the
  activation the browser needs — with the canvas click kept as fallback and a
  dialog/Escape releasing it. §17.5 updated; needs a manual real-hardware check
  since headless has no user activation. Signed off by the user on
  14.07.2026 via the dashboard checks inventory.)
- [x] 50. Feeding vultures clip down into the ground. Keep the vulture on the
  surface while it feeds.
  (The landed scavenger group rises to target.y+0.5, the body hop is
  positive-only and the peck rotation is gentler, so the pecking head no longer
  swings under the terrain.)
- [x] 51. A parent acting as a living shield for its calf faces the predator
  while running away, so it moves backwards. Its facing should follow its run
  direction instead.
  (While running to hold the station the parent snaps its facing to the run
  heading (blockHeading); only on station does it keep that facing and face the
  hunter down — no more lagging turn-cap that read as running backwards.)
- [x] 52. Show the other health impairments (fever, sun blindness, wounds) as
  indicators to the left of the health bar.
  (.affliction-badge items render left of the bar in the .health-status row,
  one per active affliction; Hud.test asserts them.)
- [x] 53. The gambolling juveniles in the bird's-eye view sometimes shiver back
  and forth. The body-separation pass parts a calf from its own parent every
  frame while play/follow pulls it back; exclude the parent-calf pair.
  (The separation neighbour scan skips an animal's own child/parent.)
- [x] 54. Make the exploration map look like a real hand-drawn map (parchment,
  decorative border, a title cartouche, ink coastlines/rivers, region names
  North/West/Central/East/South) as in the reference image, keeping the
  discovery gating: unexplored areas are hidden under fog of war.
  (The MapOverlay canvas now paints an aged-parchment base (gradient + mottling
  + vignette), a diamond-chain engraved border, an AFRICA/AFRIKA title
  cartouche, a top-right compass and sepia-red region names over the existing
  ink coasts/rivers/lakes. Fog of war: an offscreen fog layer covers the whole
  chart and destination-out clears a soft window at every explored grid cell,
  so the inked geography shows only where the traveller has been. i18n
  continent name (de + en); enrichments reads back that the explored area is
  lighter than the fogged area, with screenshot 92.)
- [x] 55. The default bird's-eye zoom should start more zoomed in. Default 0.5,
  and without the debug unlock the wheel cannot zoom out past that default.
  (ui DEFAULT_TRAVEL_ZOOM = 0.5 is both the start and the no-unlock zoom-out
  clamp — setWheelZoomEnabled/setTravelZoom clamp to it instead of 1; zoom-in
  to 0.25 stays free, the unlock opens up to 16. ui.test follows.)
- [x] 56. The player should collide with animals and large plants (trees) in
  the bird's-eye view instead of walking through them.
  (The travel movement loop resolves the player against nearby obstacle circles
  after each move: large flora (acacia/jungle/palm/baobab/dead tree/kopje —
  recomputed from the same deterministic chunk placement the Vegetation is
  built from) and live animals (registered from Wildlife via wildlifeCollision,
  reading the streamed herds). resolveTravelMove is a swept circle resolve — it
  clamps a step to an obstacle's near edge (no tunnelling at speed) and slides
  along it; small dressing and carcasses stay passable. Pure-tested in
  movement.test (incl. the no-tunnelling case); enrichments drives into a
  pinned animal and asserts the body is never entered (min distance = body +
  player radius).)
- [x] 57. Styling: when affliction badges show (e.g. "Fever") the health bar
  slips slightly downward. Keep the bar fixed regardless of the badges.
  (.health-status has a fixed 22px height, so taller badges never nudge the
  centred bar.)
- [x] 58. Add four real, BUILT cultural landmarks to the travel world — the
  Nubian pyramids of Meroë, Great Zimbabwe, the rock-hewn churches of Lalibela
  and the coastal ruins of Kilwa Kisiwani — at their real ~1890 positions.
  Postcolonial framing (design.md §4.4/§16): achievements of African
  civilisations, never a European "find". Data in landmarks.ts
  (CULTURAL_LANDMARKS), spread into economy LANDMARK_POINTS (bounty stays flat),
  de/en names + a landmarkDiscovered flavor per kind (existing voice markup
  only, English is the spoken one), map labels, stylized low-poly geometry per
  kind (render/landmarks.ts), a CulturalLandmarks scene component with a
  __culturalLandmarks dev hook, tests (sighting/bounty/journal + i18n
  completeness) and a Playwright screenshot per site. Scope is exactly these
  four; do NOT add the 1907 Great Mosque of Djenné.
  (All four placed at their real coords, sighted/bounty-credited/journaled like
  the natural landmarks with a per-kind discovery flavor (de + en, existing
  markup) framing each as an African civilisation's achievement. Stylized
  merged low-poly geometry per kind (steep Nubian pyramids, a dry-stone
  enclosure + conical tower, a cross-plan rock-cut church, coral-stone ruins);
  __culturalLandmarks dev hook; store.travel + i18n coverage tests;
  enrichments asserts the four mount, render and reveal (screenshot 91). The
  Kokoro speech stack was not touched. Full regression green.)
- [x] 59. The auto focus-on-controls of point 49 must not run at the initial
  start while the checkpoint-load choice (StartOverlay) is shown — the cursor
  is needed to make that choice. Do not grab the pointer while any full-screen
  overlay (start choice, defeat, victory) is up.
  (grab() in PlaceScene skips the pointer lock while any `.overlay` is in the
  DOM — the overlay is committed before the effect runs, so the start-of-game
  grab already sees it; covers defeat/victory too. design.md §17.5 updated;
  flow.mjs spies requestPointerLock across two loads — fresh start grabs, a
  seeded checkpoint's start-choice overlay does not, and the post-choice
  canvas click grabs. Full regression green.)
- [x] 60. The Nubian Village on the Nile still reaches into the water, so
  canoeing the Nile drifts the traveller into it. Keep a small minimum
  clearance between every river and every village so their footprints never
  overlap the water.
  (Standing rule, enforced in code: geo.ts nudges every village up the
  river-distance gradient until VILLAGE_RIVER_CLEARANCE_DEG (0.35°) holds —
  water band ~0.165° + marker footprint ~0.145° + margin; deterministic pure
  river geometry, no seed. Only the Nubian village actually moved (0.158°,
  now riverD 0.36, still riverside); the other 21 already complied. Ports
  stay exempt (Cairo/Khartoum/Timbuktu sit on banks by design). world.test.ts
  asserts the clearance for all 22 villages, the bounded nudge per heartland
  anchor, and that the Nubian anchor genuinely violated the rule. design.md
  §4.2 + CLAUDE.md §7.1 pt. 3 record the rule. Full regression green.)
- [x] 61. BLOCKER: after the bird's-eye traveller collides with a tree once,
  steering stops working entirely (the figure can even vanish). The swept
  obstacle resolver of point 56 pins the traveller to the obstacle boundary
  even when the move leads away from it. Fix so a collision only ever clamps a
  move that genuinely enters the obstacle; moving away or sliding along stays
  free.
  (Root cause: resolveTravelMove clamped every step whose sweep line crossed
  the obstacle — including steps leading away from a resting contact, whose
  whole inside interval lies behind the start. Now it clamps only when part of
  the inside interval lies ahead AND is entered within the step
  (tExit > 0 && tEnter < 1); away/tangent moves from the boundary stay free.
  Test-gap closed on both layers: movement.test.ts adds four regression cases
  (away, tangent, diagonal escape free; re-entry still blocked) — the old
  suite only asserted stopping, never steering afterwards — and the
  enrichments live collision check gained an escape phase (drive back after
  contact, assert the traveller actually moves clear). The bathe check's
  separate flake was diagnosed and fixed too: since the 0.5 default zoom
  (point 55) the zoom-scaled streaming ring starved its shore sample; the
  roam now pins zoom 1 like the other ring checks. Full regression green.)

- [x] 62. The ridden canoe still floods on the Nile (screenshot: desert
  stretch, canoe hull interior under the river surface). Find the actual
  height mismatch between the canoe float height and the rendered river
  ribbon and fix it so the hull rides above the surface along the whole
  course; add a measured regression (ribbon Y vs boat Y along the river).
  (Measured root cause: the ribbon is FLAT across its width at the AXIS bed
  height, while the canoe floated on the LOCAL bed under the player — on
  cross-sloping stretches (the Nubian cataract Nile) the local bed lies up
  to 0.47 lower, sinking the hull under the ribbon; confluences/bends add
  cases where a second, higher ribbon covers the point. New shared module
  src/scenes/travel/waterSurface.ts holds the surface construction: a
  per-seed index of the exact ribbon axis samples (same densify/lift as
  Rivers.tsx, which now imports it) plus the lake bedMax/sheet heights; the
  Player floats on the highest covering surface. waterSurface.test.ts scans
  the whole Nile channel and all 17 rivers against a mirrored ribbon build,
  proves the old construction violated by > the hull clearance (regression
  witness), and covers lakes/null cases; the enrichments canoe-ride
  screenshot (88) moved to the previously flooded cataract stretch. Full
  regression green.)
- [x] 63. The exploration map is neither visually appealing nor functional:
  region labels sit at odd spots, repeat per region and overlap each other.
  Research what a handsome, functional ~1890 map looks like and rebuild the
  current one completely into something clearly better and more elaborate,
  including embellishments such as a worn-paper look.
  (Researched period conventions (1890s George Philip/Johnston atlas
  plates): graticule with degree numbers in a piano-key border, blue water
  ink vs sepia land ink with seaward-fading coastal hatching, hachure
  relief, region names once in spaced capitals across the heartland, small
  italics for feature names, cartouche with scale bar. MapOverlay rebuilt
  accordingly on worn paper (fold creases, ring stains, darkened corners);
  region labels now come from src/ui/mapLayout.ts — one land-centroid
  anchor per region, nudged onto region land, pure-tested for placement
  and non-collision (mapLayout.test.ts); sighted landmarks (§17.2) print
  their name in italics, explored mountains get hachure clusters; plate
  furniture (frame, graticule numbers, cartouche, region names, borders)
  prints over the fog, geography stays discovery-gated beneath it.
  design.md §19.11 + CLAUDE.md pt. 3 updated; new i18n strings (subtitle,
  scale caption) in both languages. Full regression green.)
- [x] 64. The dragged canoe on LAND still clips into the ground and objects
  in many situations (point 62 fixed the water side). Test broadly and fix:
  many different ground types and height profiles (dunes, slopes, rocky
  terrain), dragging the canoe across a stone, an animal standing in the
  canoe's spot, how level the canoe lies on uneven ground, and the canoe
  protruding into a village/settlement — the hull must follow the terrain
  under it (pitch along the drag direction, no end buried in a rise, no
  floating over a dip) and must never intersect solid obstacles.
  (The hull was pinned rigidly to the yawing figure at a fixed height/tilt.
  New pure module src/scenes/travel/canoeDrag.ts: a rope-constrained trail
  point follows the walked path like a trailer and is pushed clear of
  obstacle circles (flora, animals via the collision bridge, and settlement
  markers r=1.6); the pose pitches the hull from the hand grip down to
  where its far end rests on its own ground sample (clamped ±), with a
  clamped cross-slope roll. 13 pure tests cover the matrix (straight/corner
  following, stone/animal/village clearance every frame, flat/moderate/
  cliff profiles, roll signs and clamps, grip invariant, NaN guard);
  enrichments asserts the live resting invariant via __player.drag; probes
  verified dunes/highlands (farY = ground + 0.15 exactly, roll clamped) and
  the just-left-village rim (trail pinned at the 2.0 clearance). design.md
  §7 and CLAUDE.md pt. 4 record the behaviour. Full regression green.)

- [x] 65. Plants still reach into rivers and block the canoe's way
  (screenshot: trees and boulders overlapping the channel), and animals
  stand/spawn IN the water. Flora and solid dressing must keep clear of
  river/lake water so a passage is never blocked; animals must never spawn
  on water cells; drinking animals walk only to the water's EDGE (the bank)
  and never into the water — bathers wade at the shore, not mid-channel.
  (Three root causes, one shared pure rules module
  (src/scenes/travel/waterEdgeRules.ts): (1) drink targets walked 85 % of
  the way to the river AXIS — riverDistance measures to the centerline,
  so drinkers ended mid-channel and bathers (×1.12 overshoot) past it;
  targets now stop at the bank (waterline + gap), bathers one small wade
  past it, no overshoot factor. (2) The §19.5 backstop corrected only
  open-ocean cells; it now also sets any non-drama, non-flamingo animal
  standing on river/lake water back to the nearest land. (3) Reed belts
  spawned within 0.05° of the AXIS (mid-channel papyrus) and solid
  dressing was allowed right up to the ribbon edge; reeds now hug the
  waterline band and trees/boulders/kopjes keep RIVER_WIDTH+0.06° axis
  clearance plus a lake-shore band. 10 pure tests cover the rules;
  enrichments gains a polled no-animal-stands-in-water check; a probe at
  the reported river stretch shows 0/49 animals in water and clear
  channels. design.md §19.7 + CLAUDE.md pt. 12 record the rules. Full
  regression green.)

- [x] 66. Animals still tend to jitter/tremble — especially the gambolling
  calves, but also e.g. animals dodging elephants. Investigate the jitter
  problem intensively (find every oscillation source: per-frame direction
  flips, competing behaviours fighting over the same animal, render-facing
  vs movement-heading mismatches, separation push-pull cycles) and land a
  reliable, verified fix rather than another spot damping.
  (Full causal analysis found six sources; all fixed at the integrator:
  (1) THE calf tremble: a bout carried the calf across GAMBOL_RANGE where
  play switched off and the faster follow yanked it back — per-frame
  sawtooth at the boundary. leashedGambolDir damps the OUTWARD component
  of the bout heading to zero at the range edge (no cancellation point —
  a blended home pull turned out to alternate at its equilibrium radius,
  measured and discarded), plus a play-lock hysteresis and facing from
  the actual step. (2) The every-frame separation push teleported the
  full half-overlap that behaviours reversed next frame; now clamped to
  a walking pace (SEPARATION_MAX_SPEED) — still parts within moments,
  monotonically. (3) The idle-shuffle render offset (±0.8) switched
  on/off per behaviour branch, popping the rendered position at every
  transition; it is now a per-animal amplitude blended over ~0.4 s
  (wobAmp) with per-behaviour targets. (4) The water backstop keeps
  CLEARING dodgeHeading: re-seeding it from the old facing (tried first)
  sent the prey running AT the threat until the turn cap caught up —
  caught by the live dodge check; after a land teleport the escape
  direction must re-engage exactly, and the rendered facing is
  turn-capped separately (FACE_TURN), so no visible snap occurs.
  (5) A bout against the sea reverted in place
  and vibrated; it now bends the rest of the bout along the bank
  (boutDetour). (6) The chase victim and its blocking parent were not
  separation-exempt and got shoved mid-sprint; they are now inDrama.
  7 new pure tests incl. a 3600-frame bout simulation (leash holds, flip
  rate < 2 %) and a regression witness proving the old range-switch
  sawtoothed; enrichments tracks a live playing calf (60 samples,
  0 flips). Two suite interactions surfaced by the longer polls were
  hardened too: injected test animals now unshift to the array FRONT
  (an appended animal falls outside the MAX_INSTANCES behaviour window
  once the streamed population nears its cap), and the bathe check's
  unique-drinker key moved from the drink target to the spawn position
  (banks-only targets legitimately collapse onto the same shore point).
  The live dodge check then caught a REAL regression of fix (3): the
  trample scan measured against the RENDER position, and the blended
  idle-shuffle offset (up to ±0.8 while fading in) carried freshly
  engaged prey under the elephant — trampled before it could flee, which
  froze the dodge. The trample now checks the SIM position (the shuffle
  is cosmetic and must never kill); the herd test keeps a diagnostics
  object in its report. Full regression green.)

- [x] 67. In the first-person view inside settlements the surfaces are too
  low-detail/soft — fine structure is missing, most of all on the ground
  and on the background mountains (the panorama). The buildings and their
  surfaces must also become clearly more detailed (wall/roof material
  structure, edges, weathering). Add believable high-frequency detail
  (e.g. ground micro-relief/texture detail at eye height, sharper panorama
  relief shading, structured building materials) fitting the AAA bar of
  §7.1 pt. 11.
  (Root cause: the materials mixed COLOR by noise but never perturbed the
  NORMAL, so light ignored all micro-structure. three's bumpMap() cannot
  do it for procedural fields (it re-samples a TEXTURE at offset UVs; a
  world-position noise node ignores that context — zero gradient), so
  materials.ts gains proceduralBump(): the Mikkelsen screen-space bump on
  direct dFdx/dFdy of the height node. Ground now carries ripples, sandy
  grain, pebble relief and specks (trodden paths worn SMOOTHER); walls
  (plaster/mud) carry grain plus a darkened base course and weather
  run-off streaks; thatch/wood get strong anisotropic relief; the
  panorama backdrop is a node material with rocky fBm structure, steep
  faces mixing toward lit bare rock, its own bump and 160 ring segments.
  Verified: materials.test.ts pins the color+normal node wiring (4
  cases); settings.mjs measures the ground crop's Laplacian edge energy
  (2.8 vs bar 1.5; the flat pre-detail ground sat near 0.5); before/after
  probes of Cairo and Masai Village confirm the look, 0 console errors.
  design.md §2.5/§2.6 + CLAUDE.md pt. 15 record the target. Full
  regression green.)

- [x] 68. Second expansion stage for the travel-world landmarks, building on
  the stage-1 code paths (CULTURAL_LANDMARKS/CulturalLandmarkDef in
  src/world/data/landmarks.ts; the spread into LANDMARK_POINTS + kind union
  in src/systems/economy.ts; tint()/merge() builders in
  src/render/landmarks.ts; CulturalLandmarks component + __culturalLandmarks
  hook + cultural LandmarkLabels branch in TravelScene.tsx;
  landmarkDiscovered flavor maps in de.ts/en.ts with `?? flavors.mountain`
  fallback; i18n coverage + Meroë sighting tests; enrichments check).
  Scope is exactly Parts A and B; Part C is point 69 (do NOT implement).
  Real ~1890 geography; nothing previously removed returns; bounty stays
  the flat balance.economy.bountyLandmark; TTS untouched (English-only
  Kokoro; only existing voiceMarkup tags [awe][whisper][excited][somber]
  [weary][fear][emph][pause][breath][mute]; German carries the same markup
  unspoken).
  PART A — three more cultural landmarks, stage-1 pattern end to end:
  aksum (lon 38.72, lat 14.13, kind 'stelae' — Aksumite obelisk field),
  gondar (37.47, 12.61, 'castles' — Fasil Ghebbi imperial capital),
  bandiagara (-3.40, 14.35, 'cliff-dwellings' — Dogon escarpment homes
  above older Tellem sites; all standing by 1890). Kind union grows by
  'stelae' | 'castles' | 'cliff-dwellings'. i18n names (Aksum/Gondar/
  Bandiagara both languages) + one flavor case per kind (~2 sentences,
  postcolonial voice: achievements of African polities, never a European
  "find", each distinct from the mountain fallback): stelae = towering
  carved granite obelisks of a kingdom that struck its own coinage and
  traded across the Red Sea; castles = battlements and towers raised by
  African masons against everything colonial accounts claimed;
  cliff-dwellings = dwellings terraced into a sheer escarpment, a people
  reading the land vertically. Geometry (origin at ground, ~2-4 unit
  footprint): buildStelae() 3-4 tall thin tapered obelisks with rounded
  caps, one leaning/fallen, weathered granite; buildCastles() crenellated
  keep + two round corner towers with conical caps, grey stone;
  buildCliffDwellings() angled cliff slab with small box dwellings on
  ledges at two heights, ochre mud. Extend the CulturalLandmarks geos map;
  labels/sighting/disposal/hook unchanged.
  PART B — four natural point-landmarks via a new exported NATURAL_SITES
  list (NaturalSiteDef {id, lon, lat, kind: 'crater'|'volcano'|'delta'|
  'wetland'}): ngorongoro (35.58, -3.16, crater), lengai (35.90, -2.76,
  volcano — Ol Doinyo Lengai, active in the period), okavango (22.90,
  -19.50, delta — deliberately offset south so marker/label do not collide
  with the nearby village; keep that separation), sudd (30.50, 8.00,
  wetland). Spread into LANDMARK_POINTS exactly like CULTURAL_LANDMARKS;
  widen the kind union; flat bounty applies. i18n names de: Ngorongoro-
  Krater/Ol Doinyo Lengai/Okavango-Delta/Sudd, en: Ngorongoro Crater/Ol
  Doinyo Lengai/Okavango Delta/Sudd; flavor per kind (natural-wonder awe):
  crater = a vast game-filled bowl, its rim a wall against the plains;
  volcano = steep smoking cone, the trembling Maasai "mountain of God";
  delta = a river emptying into the sands, braiding into channels and reed
  islands; wetland = an endless papyrus swamp that swallows the Nile.
  Geometry: buildCrater() low broad circular rim of tilted rock segments,
  dry-grass/rock tone; buildVolcano() steep dark basalt cone, flattened
  top, subtle translucent smoke hint (no new particle system);
  buildDelta() low braided blue strips + papyrus tufts (reuse buildPapyrus
  from flora.ts); buildWetland() broad even papyrus flat over a shallow
  blue disc (vast/uniform, distinct from the delta). Scene: NaturalSites
  component mirroring CulturalLandmarks exactly (memoized geos, shared
  vertex-color material, latLonToWorld + sampleTerrain height, mulberry32
  per-run yaw, disposal, DEV hook __naturalSites = {count, ids}) mounted
  next to <CulturalLandmarks />; LandmarkLabels natural branch with
  water:true for delta/wetland, water:false for crater/volcano, height
  offset +1.0.
  TESTS: i18n coverage extended to NATURAL_SITES (names + dedicated
  flavors vs mountain fallback, both languages); store.travel gains a
  Ngorongoro sighting test mirroring Meroë (not seen before, registered,
  bounty queued, journal kind 'crater').
  VERIFICATION: build + full test run green, no console errors (WebGL 2
  headless); enrichments cultural check counts 7 incl. the three new ids;
  parallel natural-sites check via __naturalSites (count 4, all ids); one
  screenshot of a new cultural site and one of a natural site with
  revealed labels; do NOT run the speech regression (no speech files
  touched); report shot paths and all seven coordinates.
  DOCS: design.md §4.4 extended with all seven sites; CLAUDE.md §7.1
  updated in the established style.
  ACCURACY: no marker on top of the Tahat label (Hoggar) and nothing
  overlapping the village near the Okavango (hence the offset).
  (Done exactly per spec: Parts A+B end to end on the stage-1 code paths —
  data + kind unions, LANDMARK_POINTS spreads (flat bounty unchanged),
  seven geometry builders (stelae with a fallen giant, crenellated keep +
  conical-capped towers, terraced cliff dwellings, tilted crater rim,
  smoking basalt cone via tinted geometry (no particle system), braided
  delta ribbons + papyrus reuse, papyrus flat over a shallow disc),
  NaturalSites component mirroring CulturalLandmarks with __naturalSites
  hook, natural label branch (water styling for delta/wetland), i18n
  names + kind flavors in both languages (postcolonial voice for the
  cultural, natural-wonder awe for the natural; only existing markup
  tags; speech files untouched). Tests: i18n coverage widened to all 11
  sites × 2 languages; Ngorongoro sighting test mirrors Meroë (bounty +
  kind 'crater'). enrichments counts 7 cultural + 4 natural via the
  hooks, renders a frame at all 11 coordinates and takes evidence shots
  94 (Aksum) / 95 (Ngorongoro). design.md §4.4 + CLAUDE.md pt. 25
  updated; Part C recorded as point 69. Full regression green.)
- [x] 69. (Deferred Part C of point 68 — own scoped task, own verification.)
  Two landmarks sit on existing ports and belong in their PlaceScenes as
  skyline features, not on the travel map (a map marker would duplicate the
  port marker): Table Mountain as a flat-topped massif backdrop behind Cape
  Town's PlaceScene (size-3 port, south region), and the Djinguereber
  mosque as a distinctive Sudano-Sahelian mud building inside Timbuktu's
  PlaceScene (size-2 port, west region) — the authentic 1327 landmark
  standing in for the excluded 1907 Djenné mosque. Touches region-specific
  PlaceScene rendering (src/scenes/place/).
  (Table Mountain: buildTableMountain() — a wide flat-topped truncated
  prism with a lit plateau cap and the Devil's Peak/Lion's Head flanks —
  mounted north of Cape Town at ~11° elevation (under the §2.5 looming
  bound), DEV hook __placeSkyline, profile pure-tested (wide/flat, 14
  builder tests total in landmarks.test.ts). Djinguereber: a new 'mosque'
  DwellingKind — buttressed mud body, parapet pinnacles, pyramidal
  toron-studded minaret, door on the front face — placed BEFORE the
  procedural rows so the fabric grows around it (guaranteed a spot every
  run), colliding as an oriented box like every rectangular building.
  polish.mjs asserts the skyline hook and the mosque dwelling and records
  screenshots 96/97. design.md §4.4 + CLAUDE.md pt. 15 updated. Full
  regression green.)

- [x] 70. Status-bar redesign: replace the words "Date", "Funds",
  "Provisions", "Gifts" and "Region" with fitting SYMBOLS (stylistically
  matching the game, expressive, much narrower than the text). Show the
  date as DD.MM.YYYY. Transient status hints (e.g. dragging the canoe on
  land) move from the top right to the top CENTRE of the bar. The space
  gained on the right hosts the health bar and the affliction badges INSIDE
  the status bar (instead of below it) — then the journal panel can no
  longer cover them. Update the affected §7.1 pt. 9/pt. 4 verifiable
  conditions (hint geometry, health-bar/badge selectors) and design.md
  §17.1 accordingly, in both languages where text is involved.
  (Each stat now leads with a narrow engraved inline-SVG symbol (calendar,
  coin stack, provision sack, gift, compass) tinted in the HUD accent; the
  localized word stays as title/aria label. New i18n formatDateShort()
  renders DD.MM.YYYY in both languages (journal keeps the long form). The
  bar is a three-zone flex row: stats left, transient hints pinned to the
  bar's TRUE centre (absolute-centred — the flex zones are asymmetric),
  and the HealthBar (moved from Hud.tsx into its own module, mounted
  inside the bar) with its affliction badges at the right end — the
  journal panel can no longer cover it. StatusBar.test asserts
  symbol+tooltip per stat, the DD.MM.YYYY text, the language switch and
  the in-bar health bar; i18n.test pins formatDateShort in both
  languages; the parity function-leaf count moved to 56; enrichments'
  hint-geometry check now asserts centredness (measured offset 0 in the
  probe). design.md §17.1 + CLAUDE.md pt. 4/9 updated. Full regression
  green.)

- [x] 71. The health bar must BLINK once health falls below 1/3 (attention
  pull, like the canteen's empty-blink). Coordinate with the point-70
  status-bar redesign (the bar moves into the status bar there); cover the
  threshold on/off behaviour in Hud.test.tsx.
  (.health-low opacity-blink on the in-bar health bar below max/3;
  threshold on/off pinned in Hud.test.tsx; design.md §17.1 + CLAUDE.md
  pt. 9 updated. Done together with point 72; full regression green.)
  (track: 13.07. 21:35 -> 21:58 together with 72, ~12 min its share, ~21k in / ~4k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 72. The canteen must also BLINK below 1/3 fill (today it glows yellow
  below 20 %, red below 5 % and blinks only when empty — design.md §6.1's
  thresholds change accordingly, both language files if any text names
  them); cover the new threshold in Hud.test.tsx alongside point 71.
  (canteen-blink animation below 1/3 fill with the yellow stage moving to
  the same third (red <5 %, empty keeps blinking); no player-visible text
  names the thresholds, so no language change. Threshold on/off and the
  empty case pinned in Hud.test.tsx; design.md §6.1 updated. Full
  regression green.)
  (track: 13.07. 21:35 -> 21:58 together with 71, ~11 min its share, ~17k in / ~3k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 73. Settlement graphics glitches (user screenshot, first-person view):
  (a) flat BLACK artifacts lie on the ground in places — elongated dark
  shapes at player height between the buildings; (b) near the backdrop
  mountains the distant ground SHIMMERS/trembles (likely z-fighting between
  the ground plane and the panorama/far terrain). Diagnose both causes
  (suspects: panorama-wildlife silhouettes sitting at ground level instead
  of beyond the settlement edge; depth precision / coplanar meshes at the
  backdrop seam), fix them, and add regression coverage on the right
  layer(s).
  ((a) was panorama wildlife standing on the backdrop's inner plain (~2
  below the ground disc), horizon-clipped by the disc edge to black
  back-slivers — standing height now clamps to the ground plane
  (backdrop.ts panoramaGroundY, pure-tested; live heights gated in
  polish.mjs). (b) was TRAA jitter resampling sub-pixel procedural ground
  detail every frame (measured 1.87 mean frame diff static, 0.00 with
  TRAA off) — grain/pebble/bump amplitudes now distance-fade
  (detailFade in materials.ts; backdrop fine octave/bump likewise);
  measured 0.03 after, near-field detail unchanged (edge energy 2.88).
  Temporal-stability gate added to settings.mjs; design.md §2.5/§2.6 and
  CLAUDE.md pt. 15 updated. Full regression green.)
  (track: 13.07. 22:40 -> 14.07. 01:56, ~195 min incl. ~45 min external HF-CDN block and two full regressions, ~153k in / ~27k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 74. Status-bar layout fix (user report): the health bar and its
  affliction badges currently sit LEFT in the status bar, right after the
  stats. They must be RIGHT-ALIGNED at the bar's end — badges (e.g.
  "Dehydrated") to the LEFT of the health bar — while the centre of the bar
  keeps the transient hints (e.g. the canoe-carried-on-land notice), per the
  point-70 design. Cover the alignment on the right layer(s).
  (Root cause: .status-health had no margin-left auto — the centred hints
  are absolutely positioned and take no flex space, so the health zone sat
  directly after the stats. One-line CSS fix; real-layout geometry gated in
  enrichments.mjs (bar hugs the right edge, badge left of it, dehydration
  toggled as probe); CLAUDE.md pt. 9 Verifiable extended. Full regression
  green.)
  (track: 14.07. 01:58 -> 02:24, 26 min, ~30k in / ~5k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 75. The Meroë pyramids must render MUCH larger in the travel view —
  today's build reads too small; scale the landmark geometry up so the
  pyramid field is unmistakable at travel zoom (keep the label/sighting
  behaviour; adjust the pure geometry test accordingly).
  (Field scaled ~3.5x: peaks 3.4-4.6 units — well above tree height
  (acacia ~2, baobab ~2.6) — footprint ~10 units; own geometry pin in
  landmarks.test.ts (height 3-8, footprint 6-14, grounded) with the
  generic <6 bound kept for the other sites. Verified visually at Meroë.
  Full regression green.)
  (track: 14.07. 02:25 -> 05:55, 210 min incl. two flake-hardening regression reruns (escape poll, run-all crash tail), ~76k in / ~14k out)
- [x] 76. Canoe clipping still occurs (user screenshot): a canoe DRAGGED ON
  LAND near a water edge protrudes into the water surface. The drag pose
  must keep the hull on the land side of the bank (or resting visibly ON
  the ground, never piercing the river/lake sheet). Extend the
  canoeDrag/waterSurface coverage with a bank-adjacent drag case.
  (The trailer now takes a water predicate — the rendered river/lake sheet
  (waterSurfaceY) plus ocean — applied after the obstacle push and winning:
  the rope rotates to the nearest land at full length (±120°, nearest side
  first for continuity) or shortens toward the land-standing player on a
  spit narrower than the rope. Four bank-drag cases pure-tested in
  canoeDrag.test.ts (bank swing, waterward turn, spit shortening, dry
  no-op); design.md §7 and CLAUDE.md pt. 4 record the rule. Full
  regression green.)
  (track: 14.07. 05:56 -> 06:19, 23 min, ~38k in / ~7k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 77. "A Discovery" is a poor journal-entry heading (user feedback).
  Rework the generic discovery/sighting entry titles into evocative,
  entry-specific headings in BOTH languages (e.g. naming the landmark or
  its kind) — journal texts keep the voice markup; update the affected
  i18n tests.
  (titles.landmarkDiscovered is now a kind-shaped template naming the
  landmark — 15 kinds per language ("The Thunder of Victoria Falls",
  "Die Stelen von Aksum") — and titles.treasure names the dug find
  ("Gold from the Earth" / graveyard: "Ivory Among the Bones"); the
  title refs carry the params, storage stays language-neutral. Headings
  stay markup-free; i18n.test asserts name-in-title for all 11 sites +
  the treasure headings, parity pin 56→58. "A Grim Discovery"
  (findRemains) kept — it is specific to its event. design.md §10 and
  CLAUDE.md pt. 25 record the heading rule. Full regression green.)
  (track: 14.07. 06:20 -> 06:44, 24 min, ~43k in / ~7k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 78. Graphics artifacts at river CONFLUENCES (user screenshot): bank
  boundary lines render in the middle of the water where two channels
  join — the shore/edge treatment (foam/outline) must appear only at real
  banks, never across the joined water body. Diagnose the seam (likely the
  per-channel ribbon edges overlapping inside the merged water), fix it,
  and cover it on the right layer(s).
  (Exactly that: each ribbon painted its bank foam along its own lateral
  edges, so a tributary's edges drew "banks" across the joined water. A
  per-edge-vertex bank attribute now masks the foam wherever the probe
  just OUTSIDE the edge is water — another channel's band (spatial-hashed
  axis index in riverBanks.ts, own-bend arc exclusion), a lake or the
  sea. Rule pure-tested (riverBanks.test.ts, 5 cases incl. own-bend and
  oxbow); enrichments gates the dev-hook report (Nile tributaries report
  interior edges; masking stays local, 104 of ~11k edge vertices).
  Scene-switch timing unchanged (23 s baseline == 23 s after, the cost is
  the chunk build). design.md §11.3 and CLAUDE.md pt. 21 record the
  rule. Full regression green.)
  (track: 14.07. 06:45 -> 07:19, 34 min, ~72k in / ~13k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 79. In-settlement map: opening the map INSIDE a settlement must show a
  plan of the current place — the walkable area with the functional
  (enterable) buildings marked and named — instead of (or in front of) the
  continental exploration map. Localized labels in both languages; cover
  the mode switch and the building markers on the right layer(s).
  (buildLayout extracted into the pure scenes/place/layout.ts (also the
  groundwork for point 87); the map overlay branches on placeId to an SVG
  town plan in the atlas paper style — walkable circle, lanes, unlabelled
  dwelling blocks, functional buildings marked and named via the existing
  localized buildings dict, southern entrance arrow; new mapOverlay.plan
  header in both languages (parity pin 59). Mode switch and labels
  pinned in MapOverlay.test.tsx (port roster, village chief/market,
  atlas return on leaving); live check + screenshot 98 in polish.mjs.
  design.md §6.1/§7 and CLAUDE.md pt. 3 updated. Full regression green.)
  (track: 14.07. 07:20 -> 07:50, 30 min, ~68k in / ~12k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 80. Vultures (user screenshot): (a) they still CLIP INTO THE GROUND
  while feeding at a carcass — feet/body must stay on the surface for the
  whole feed; (b) after the predator has left a kill they wait too long
  before landing — shorten the descent trigger once the site is clear.
  Extend the vulture live-checks/pure tests accordingly.
  ((a) the kill and player flocks sat on y=0 instead of the terrain height
  and landed birds ignored the slope beside the carcass — both flocks now
  sit on the sampled ground and every landed bird (kill flock and ground
  scavenger) lifts with the slope under its own feet, positive-only hop.
  (b) the flock now lands once the predator has CLEARED THE SITE
  (killFlockMayDescend, 12-unit rule, pure-tested) instead of waiting out
  the whole walk-off — fixing en route a second real bug the new live
  check caught: the rule first measured against the kill coordinate
  (px/pz), which stays at the site during leave, not the walking lion
  (lx/lz). enrichments gates the descend timing (mode 'leave' at descend)
  and the landed clearance via the new dev hook; design.md §19.6 and
  CLAUDE.md pt. 12 updated. Full regression green.)
  (track: 14.07. 07:51 -> 08:36, 45 min, ~64k in / ~11k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk)
- [x] 81. Recognizable settlement surroundings (user report): the current
  panorama never reads as the actual map neighbourhood — mountains, rivers,
  lakes and the local fauna around the settlement are unrecognizable (the
  24x160 vertex-color annulus smears water courses away, the 18° relief cap
  genericizes mountains, the 5 drifting silhouettes ignore the real nearby
  wildlife). Rework it so the first-person horizon shows the REAL
  surroundings: preferred approach — capture a panorama (cubemap/cylinder)
  from the travel scene itself at the settlement's position on entry
  (direction-true mountains/water/fauna as just seen in the bird's-eye
  view; blend/hide the near field, match light and haze). Fallback if the
  capture path fails quality/lighting: a much higher-resolution textured
  backdrop fed by the same terrain/hydrology rendering. Cover on both
  layers (pure: whatever mapping/projection helpers emerge; Playwright:
  the panorama shows the settlement's river/mountain where one exists,
  e.g. the Nile at the Nubian village).
  (Implemented as the capture approach: nearing a settlement (enter
  radius + 4) renders a 360° horizon band from its position out of the
  live travel scene — 4x90° sectors, sky alpha-carved (the place dome
  shows through), symbolic dressing/markers/traveller hidden, near plane
  8 — cached per place+seed and shown in the place scene on a horizon
  cylinder with exact per-sector tan mapping (panoramaMath, pure-tested);
  direct place-to-place enters fall back to the geometry backdrop.
  Debugging en route: renderer viewport/scissor restore (black frame),
  band v-flip on the WebGL2 readback path, water-fraction heuristic
  excluding sky. polish.mjs gates fallback, capture-active and a
  directional Nile water signal (screenshot 99). NOTE: the WebGL2 path is
  verified headless; the WebGPU path (v-flip convention!) passed the
  user's manual check on real hardware on 14.07.2026 ("Es sieht alles
  gut aus") — the band convention holds on both backends. design.md §2.5
  and CLAUDE.md pt. 15 updated.
  (track: 14.07. 08:37 -> 09:37, 60 min, ~196k in / ~34k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk))
- [x] 82. After point 81: add the GIZA PYRAMIDS as a built cultural landmark
  in the travel view (real ~1890 position just west of Cairo — Khufu,
  Khafre, Menkaure with the Sphinx readable at a glance; the design.md §4.4
  cultural-landmark roster, localized names and a kind-flavored discovery
  entry in both languages grow accordingly, framed like the other African
  achievements). Via the point-81 panorama capture it then appears in
  Cairo's first-person skyline automatically — verify that (screenshot +
  the landmark checks extended to 8 cultural landmarks).
  (Giza added as the eighth cultural landmark with its own kind:
  compact travel-scale field (Khufu/Khafre/Menkaure diagonal + Sphinx,
  Old-Kingdom 52° slopes) at 29.98/31.08 west of the Nile, localized
  name/flavor/heading in both languages, geometry pin in
  landmarks.test.ts, roster checks moved to 8. The "automatic skyline
  via panorama" DEVIATED: at ~4 world units the capture geometry
  produced an oversized/misplaced silhouette (see point 90), so Cairo
  gets an explicit Giza western skyline via the proven point-69 pattern
  (GizaSkyline, __placeSkyline hook, polish check + screenshot 100) —
  deterministic and testable; the travel landmark itself still appears
  in captures from other viewpoints. design.md §4.4 and CLAUDE.md
  pt. 15/25 updated. User caught the field standing IN the Nile's
  rendered band: moved to the west-bank desert (lon 30.65, ~0.52° off
  the axis) with a footprint-rim river-clearance probe in world.test.ts
  (riverDistance saturates at 0.45, so the rim is probed directly).
  (track: 14.07. 09:39 -> 11:12, 93 min incl. two verify hardenings, ~221k in / ~39k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk))
- [x] 83. Animals must be unable to walk into the open ocean, exactly like
  the player (user report): predators currently do it when they WALK AWAY
  after feeding — the scripted leave path apparently bypasses the §19.5
  water backstop that pins streamed animals to land. Route every scripted
  movement (leave-after-feed, chase abort, any waypoint walk) through the
  same land constraint: the walk-off deflects along the coast instead of
  entering ocean cells. Cover the leave path on both layers (pure: the
  deflected step rule; live: a post-feed lion walking off at a coast stays
  on land until it despawns).
  (The walk-off (and the chase abort, which shares the leave path) now
  steps through deflectedStep: the escape course re-aims radially away
  from the traveller each frame under a turn cap (a persisted deflected
  heading let a shoreline hold the predator tangentially in the view
  ring); probes check BOTH the step target and a 0.8-unit lookahead
  (one-cell coast pockets and narrow channels caught live); boxed in it
  walks back inland, and standing IN water (stale/scripted state) it
  wades to the nearest dry probe first. 6 pure cases in
  wildlifeBehavior.test.ts; enrichments walks a lion at a
  runtime-located west coast: 92 samples, zero ocean cells, ~30 units
  of shoreline covered. design.md §19.5 and CLAUDE.md pt. 12 record it.
  (track: 14.07. 11:14 -> 12:50, 96 min incl. three live-trace fix
  rounds, ~119k in / ~21k out, model claude-fable-5[1m], effort high, thinking
  on, autonomous batch, dontAsk))
- [x] 84. Full phone/tablet support, with ZERO change to PC play: a touch
  layer as a third input source beside keyboard and gamepad. Scope is
  exactly (a)-(c); walk/travel speeds, sensitivities and all gameplay
  rules stay unchanged.

  (a) TOUCH STATE + ENGAGEMENT GUARD. In `src/systems/input.ts`, add a
  touch path in the style of the existing gamepad path (`gamepadMove`/
  `gamepadLook`): a module-level `touchState` holding the virtual-stick
  axes [-1..1], accumulated look-drag deltas (px) and a pending pinch
  ratio, written only by the overlay (b) and consumed at the SAME merge
  points the gamepad uses — `moveAxes()` merges the stick axes exactly
  like the gamepad axes; the first-person look consumes the drag deltas
  where `gamepadLook` is consumed, through the same
  `balance.lookSensitivity` (0.0011 rad/px); the bird's-eye zoom consumes
  the pinch ratio through the same clamp and debug gate as the mouse
  wheel (0.25-16, §21.4). Deliberate-input guard like the gamepad's:
  nothing mounts and no behaviour changes before a real first
  `touchstart` on the app — desktops, including touch-screen laptops
  never touched, stay pixel-identical.

  (b) OVERLAY. New `src/ui/TouchControls.tsx`, mounted by the HUD only
  when a new `touchActive` flag in `src/state/ui.ts` is set (set once by
  the guard): bottom-left virtual stick (pointer capture, dead zone,
  normalized axes into `touchState`), the right screen half as a look/
  steer drag surface (no pointer lock on touch), two-finger pinch there
  for zoom. The interaction prompt stays one element but becomes
  tappable: tapping it dispatches the same synthetic key event the
  prompt's key would (reuse the gamepad's synthetic-key helper — no
  second input path). Camp/journal (and the pt. 93 map button once it
  exists) remain ordinary buttons. With `touchActive`, the HUD respects
  `env(safe-area-inset-*)` and scales compactly below ~700 px viewport
  height.

  (c) QUALITY PRESET. Tied to `touchActive` (NEVER user-agent sniffing):
  TRAA off (falls back to the render pass MSAA per pt. 32 via
  `ui.traaEnabled`), SSAO off, shadow map size halved — applied where
  App.tsx wires the pipeline flags; the debug menu can re-enable each
  individually. TTS keeps the WASM path (already the default off
  Chromium-desktop; no change needed, just do not regress it).

  Tunables (stick radius, dead zone, drag-to-look factor, pinch factor)
  in `src/config/balance.ts`. Localized labels (de + en) for every new
  visible control. Vitest: pure mapping tests (stick vector → axes with
  dead zone and diagonal normalization; pinch → zoom clamp; the guard's
  state machine) and a HUD test that `touchActive: false` renders no
  `.touch-controls`. Playwright: new `scripts/verify/touch.mjs` with a
  `hasTouch: true` context — first tap mounts the overlay; stick drag
  moves the player (dev position hook); right-half drag turns the
  first-person yaw; pinch changes the zoom; tapping the prompt opens the
  audience. The existing desktop suites double as the absence proof (no
  `.touch-controls`, inputs unchanged). design.md §17.5 records the
  touch layer; CLAUDE.md pt. 30 gains the touch verifiables.
  TRACK: pure `src/systems/touchInput.ts` (stickVector with dead-zone +
  diagonal clamp, pinchRatio, createEngageLatch) + 9 Vitest cases;
  input.ts gains touchState + a first-touchstart engage guard consumed at
  the gamepad merge points (moveAxes stick, consumeTouchLook in the
  first-person yaw through mouseSensitivity, consumeTouchPinch in the
  travel zoom), plus a shared `dispatchSyntheticKey`; `src/ui/TouchControls.tsx`
  overlay (bottom-left stick with pointer capture, right-half look/pinch
  surface) mounted by the HUD on `ui.touchActive`; the prompt becomes a
  tappable button firing KeyE and sits above the touch layer (z-index);
  ui.ts `activateTouch` arms the layer + mobile preset (traa/ssao off,
  half shadows) idempotently, with `ssaoEnabled`/`shadowMapHalf` gating
  Effects' AO pass and both scenes' shadow-map size (freed on change);
  balance `touch` block; de+en labels (stick/look, SSAO/shadow debug
  checkboxes). New `scripts/verify/touch.mjs` (hasTouch context, CDP touch
  events) 8/8 green. design.md §17.5 + CLAUDE.md pt. 30 + verify/README
  updated. Full regression green (18 suites incl. touch, 1478 Vitest,
  lint/audit clean).
- [x] 85. Smooth the settlement figures (user report, screenshot of faceted
  cone bodies): raise the villager/figure primitive tessellation so neither
  the lighting facets nor the polygonal silhouette read at first-person
  range — body cones 8 → ~24 radial segments, the head spheres (10x8) to a
  visibly round resolution, and the same treatment for other close-range
  faceted primitives (hut cones, pestle/mortar props) where the eye gets
  near them. Negligible vertex cost (a handful of figures); no shader
  change needed. Cover the raised tessellation with a pure test on the
  built geometry (segment/vertex floor).
  (src/render/figures.ts centralizes the segment counts (TESSELLATION):
  figure bodies 8→24, heads 10x8→20x14, caps/turbans, hands, hut roof
  cones 12→24, domes 12x8→24x12, granaries, mortar/pestle, stall goods,
  the elder's shoulder-cloth cylinder 8→24. PlaceScene/PlaceLife use the
  constants — no literal segment counts left at the touched sites.
  figures.test.ts pins the floors and the vertex counts of the geometry
  built from them. Elder close-up probe shows round silhouettes. Vitest
  1429, build/lint/audit clean, flow 31 + polish 19 green.
  (track: 14.07. 18:15 -> 20:02, ~35 min active (interrupted by the
  chat-idle gap), ~25k in / ~6k out, model claude-fable-5[1m], effort
  high, thinking on, autonomous batch, dontAsk))
- [x] 86. Distance-stable surface roughness via BAKED TEXTURES (user report:
  distant walls read detailed/rough while close-up they turn unnaturally
  smooth; approach approved by the user): replace the runtime procedural
  wall/ground shading with reproducibly GENERATED tileable textures —
  extend the scripts/generate-terrain-textures.mjs pattern to bake the
  existing fBm/Worley fields into albedo + normal maps (millimetre grain
  included) for plaster, mud, thatch, wood and settlement ground; load
  them with mipmaps + anisotropy so the GPU's mip chain band-limits
  automatically (near = sharp, far = calm, relief distance-stable — this
  structurally supersedes the hand-tuned near/far fades where the
  textures take over), apply in TSL via world-space/triplanar mapping (no
  UV work, seamless across meshes as today), and break up tiling
  repetition by noise-modulated blending of two scales. No external
  assets, no new dependency; keep weathering (base course, run-off
  streaks) and path wear working on top. The point-73 anti-trembling gate
  must stay green and the settings.mjs edge-energy bar must not regress
  (near detail should rise); screenshots for the user's look check.
  Cover the generator output (tileability: opposite edges match; normal
  map normalisation) and material construction in Vitest; re-verify both
  Playwright gates.
  (scripts/textureFields.mjs shares the periodic-noise bake core (terrain
  output stays byte-identical); generate-surface-textures.mjs bakes
  512² albedo+normal for plaster/mud/thatch/wood/ground into public/tex/.
  materials.ts samples them world-space triplanar (Golus projections keep
  thatch/wood fibres vertical on every wall), whiteout-blends the normal
  maps and mixes two scales by a low-frequency mask against tiling;
  weathering and path wear ride on top; cloth stays procedural. Fixed en
  route: a world-space normal fed through transformNormalToView (expects
  object space) double-rotated on rotated buildings — near-black walls,
  user screenshot — now rotated by the camera view matrix directly. The
  user-reported look check passed (bright dusty Cairo). polish's 15 s
  leave-timeout raced a pre-existing ~13-16 s transition stall (measured
  on the old build too) — timeout hardened to 45 s, stall filed as point
  96. 30 new Vitest cases (tileability, normal normalisation,
  mid-brightness, wiring, sampler state); Vitest 1425, build/lint/audit,
  settings 25 (edge-energy + TRAA gates) and polish 18 all green.
  (track: 14.07. 16:57 -> 17:50, ~53 min, ~85k in / ~20k out, model
  claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk))
- [x] 87. Natural settlement layout (user report, screenshot): the building
  placement — especially in large ports like Cairo — reads as randomly
  scattered; some entrances are nearly unreachable behind other buildings
  (squeezing around corners), and windows face directly into neighbouring
  walls. Rework the procedural layout so buildings line IMPLICIT STREETS:
  an organic, period-appropriate lane network (winding alleys, small
  irregular squares — explicitly NOT a rectangular grid), buildings
  fronting the lanes with their door side, every door reachable directly
  from a lane, and every building's windows keeping a clear line outward
  (no window pressed against a neighbouring wall). Keep region-typical
  density/size gradation (§2.6/§4.1), the existing path-mask rendering
  fed by the same lanes, and all collision/door invariants. Cover in
  Vitest with pure layout invariants (door-to-lane reachability without
  corner squeezes, window clearance, no building overlapping a lane) and
  keep the collision/flow suites green; screenshot evidence of the new
  fabric. SMALL NATIVE VILLAGES must read noticeably DIFFERENT from the
  large ports: before implementing, RESEARCH how sub-Saharan/North-African
  villages of the period were actually organised (e.g. compound/homestead
  clusters around a central cattle kraal or meeting ground, concentric
  ring layouts, family-group clusters with shared open space — likely no
  established street network at all; the research decides per region) and
  give villages their own period-accurate organising principle(s) per
  region while only the ports get the dense organic lane fabric; record
  the research result briefly in design.md (§2.6/§4.5) and reflect the
  port/village difference in the layout invariants and screenshots.
  (lanePlan.ts grows the port lane web — winding main lanes, branch
  alleys, an irregular square — and layout.ts slots buildings door-first
  along the lanes (laneSlots) with door-reachability, window-clearance
  and no-building-on-lane rules enforced at placement; villages follow
  seven researched ~1890 plans (ring/street/compound/scatter/ksar/
  riverstrip/coastrow) mapped per people. design.md §2.6 + §4 research
  table, CLAUDE.md pt. 15 updated; layout.test.ts covers the invariants
  across every place and several seeds; screenshots 98/101/102 show the
  fabric. Vitest 1334 green; flow/collision/polish/enrichments green;
  build/lint/audit clean.
  (track: 14.07. ~15:06 -> 16:53, ~107 min across a chat-window restart,
  token split of the first leg unavailable, model claude-fable-5[1m],
  effort high, thinking on, autonomous batch, dontAsk))
- [x] 88. Cache the Kokoro TTS model for the headless verification: every
  Playwright run uses a fresh profile and re-downloads the ~90 MB model
  from the Hugging Face CDN — repeated regressions today tripped the CDN's
  rate limit (HTTP 403 on the model file), failing voice.mjs on a healthy
  codebase. Serve the model from a local cache in the verify runs (e.g.
  download once into a git-ignored cache dir and intercept the request via
  Playwright routing, or a persistent browser profile for voice.mjs) so
  the regression is CDN-independent and faster; the production/player path
  stays unchanged (browser cache + CDN streaming per CLAUDE.md §3). Cover
  with the voice suite running green offline-from-HF (cache primed).
  (Record-and-replay cache in scripts/verify/ttsCache.mjs: page routes for
  huggingface.co/*.huggingface.co/cdn.jsdelivr.net record every asset
  (model, tokenizers, ORT-WASM runtime) into the git-ignored .cache/tts/
  on first run and serve later runs STRICTLY offline; bodies stream from
  a tiny local HTTP server via 302 (fulfilling ~90 MB through the
  DevTools protocol killed the browser); the fp32 model.onnx probe is
  aborted outright, forcing the quantized WASM path immediately. voice
  suite green in strict mode (7 hits, 0 misses); a stale-header fulfill
  bug (content-encoding on decoded bodies) fixed en route. CLAUDE.md
  pt. 19 and scripts/verify/README.md record the cache.
  (track: 14.07. 12:52 -> 13:35, 43 min, ~60k in / ~10k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk))

- [x] 89. Map presentation (user request): the opened map — continental
  atlas AND in-place town plan — must sit BOTTOM-LEFT instead of centred,
  and both modes must show the CURRENT PLAYER POSITION.

  (a) PLACEMENT. Anchor `.map-overlay` (both variants in
  `src/ui/MapOverlay.tsx` and its CSS) fixed bottom-left: constant gaps
  to the left and bottom screen edges and clear ABOVE the
  `.inventory-bar` (mirror of the `.journal` panel's right-side rules
  from pt. 19: never covering the bar, gap to the edge). Cap the size
  (viewport-relative max width/height, aspect preserved) so it can never
  reach the camp/journal buttons bottom-right, even on small landscape
  screens. The map stays non-modal (movement continues).

  (b) PLAYER MARKER. Atlas mode: project the traveller's lat/lon with
  the SAME projection the atlas already uses for its map points/labels
  (helpers in `src/ui/mapLayout.ts` / the overlay's own toPx) and render
  a `.map-player` marker at it — engraved style per §19.11 (ink-colored
  dot with a fine pulsing ring; no neon), hidden only if the position
  fell outside the plate. Town-plan mode: project the in-place player
  position with the plan's existing building transform and render the
  same marker class. The marker updates live while the map is open.

  Verifiable: `src/ui/MapOverlay.test.tsx` asserts the marker exists in
  BOTH modes and its computed position lies inside the overlay box for a
  known store state (atlas: the Cairo start position; plan: a fixed
  `__placePlayer`-equivalent), plus the placement class on the overlay.
  `scripts/verify/enrichments.mjs` (map section): the opened overlay box
  lies in the bottom-left screen quadrant, overlaps neither
  `.inventory-bar` nor the bottom-right buttons, and `.map-player` is
  present in atlas and town plan (screenshots 92/98 refresh showing the
  new placement). design.md §19.11/§17.4 record placement and marker.
  (a) `.map-overlay` moved from centred to bottom-left (left:12px,
  bottom:88px, capped max-width/height), mirroring the journal's
  right-side rules; the plate scales to fit and never reaches the
  bottom-right buttons. (b) Player marker in BOTH modes: the atlas draws a
  DOM `.map-player` (ink dot + pulsing ring) at `project(worldToLatLon
  (pos))`, replacing the old canvas cross, hidden if outside the plate;
  the town plan draws an SVG `.map-player` at `sx(placePlayerPosition)`,
  a new shared module PlaceScene writes each frame, updated live via RAF.
  MapOverlay.test.tsx pins both markers' presence + position; enrichments
  live-checks the bottom-left anchor, non-overlap with the inventory
  bar/buttons, and both markers. Look-check screenshots confirm.
  design.md §19.11 + CLAUDE.md pt. 3 updated. FULL regression 17/17
  green, no flakes (the port-runner fix held).
  (track: 15.07. 00:37 -> 01:22, ~45 min, ~55k in / ~13k out (interleaved
  with the port-robustness fix and point 102 spec), model
  claude-opus-4-8[1m], effort high, thinking on, autonomous batch, dontAsk))

- [x] 90. Panorama-capture band anomaly (diagnosis material in the point-82
  work): a tall landmark standing ~4 world units from the capture point
  (Giza at Cairo, on higher plateau terrain) appears OVERSIZED and at an
  unexpected texture u (measured sector 1 instead of the computed western
  sector 3; scratch band dump band82.png). Diagnose systematically —
  capture a known object placed in each cardinal direction, verify the
  sector sweep/readback orientation empirically on BOTH backends, check
  the elevation term for capture points below/above surrounding terrain —
  and fix the mapping (or capture height rule) so nearby elevated
  landmarks render direction-true and correctly scaled in the band; then
  re-evaluate whether the Cairo skyline can come from the capture alone.
  Extend panoramaMath tests with the empirically confirmed conventions.
  (Nailed: the band stores content at the NEGATED compass bearing — the
  Giza column (measured u 0.405) matches the mirrored true bearing
  (256.5° vs 259.3°), and the Nubian water fractions read correctly
  under slice labels [N, W, S, E]. The horizon cylinder now samples the
  mirrored column (alpha negated in the shader); bufferU/SECTOR_COMPASS
  pin the convention with 9 pure tests; the capture hook exposes named
  compass fractions. Seed-independent live proof: a magenta pillar
  injected due WEST of the capture point (DEV probe in the trigger)
  renders 48.7k px looking west, 0 px looking east (a water-based W/E
  test flipped with each seed's dune cover and was replaced). Giza's
  "oversize" was legitimate perspective (4 wu distance + plateau); the
  explicit Cairo skyline stays (deterministic, user-approved), though a
  capture-only skyline is now viable. WebGPU manual E/W check ACCEPTED
  by the user 14.07. ~20:20 ("Nubian Village entered from the travel
  scene — the Nile lies west in the first-person view; looks good").
  CLAUDE.md pt. 15 updated. The compass
  live-check was hardened condition-based after full-load flakes (wait
  for the capture readback itself, poll the west view until the pillar
  shows) — final FULL regression all green (17 suites), two flake
  retries en route (settings forward-walk 0.00 m, enrichments body
  spacing 0.401 — both green standalone, body-spacing added to the
  documented flake list).
  (track: 14.07. 13:36 -> 15:05, 89 min, ~145k in / ~25k out, model claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk))

- [x] 91. Model the SPHINX distinctly more elaborately (user request): the
  current three-box stand-in must become a clearly recognizable sphinx —
  lion body with fore paws stretched forward, haunches, the royal
  headdress (nemes) silhouette, readable both in the travel-scale field
  and scaled up in Cairo's skyline. Extend the Giza geometry pin
  (landmarks.test.ts) for the added parts; screenshot evidence in both
  views.
  (buildSphinx() in landmarks.ts: couchant torso, raised haunches over
  folded hind legs, both fore paws stretched forward, tail around the
  right haunch, upright chest, face block under the trapezoid nemes with
  flat crown — 11 parts, exported and pinned in landmarks.test.ts
  (couchant proportions, paw reach, bounded head height, part count).
  Found en route: the per-run random landmark yaw rotated Giza too — the
  new asymmetric sphinx made it visible (a probe showed it west of the
  field); Giza's yaw is now pinned to 0 since its row diagonal and the
  east-facing Sphinx toward the Nile are real geography. polish.mjs
  gained a travel-scale section (zoom 0.25 south-east of the field,
  screenshot 103, giza-mount check); the skyline shows in shot 100.
  design.md §4.4 and CLAUDE.md pt. 15 record the depiction. Vitest 1426,
  build/lint/audit clean, polish 19 green.
  (track: 14.07. 17:52 -> 18:14, ~22 min, ~35k in / ~8k out, model
  claude-fable-5[1m], effort high, thinking on, autonomous batch, dontAsk))

- [x] 92. Panorama silhouettes stand wrong against the VISIBLE ground
  (two user screenshots, Cairo): the drifting silhouettes sometimes stand
  in MID-AIR — feet clearly above the visible horizon line — and sometimes
  SUNKEN, clipped by the ground disc into flat BLACK shapes on the ground
  (the point-73(a) artifact class returned; second Cairo screenshot
  14.07. ~17:30). Cause: since point 81 the visible horizon is the
  captured travel band (cylinder), but the silhouettes still stand on the
  geometry backdrop's formula height (panoramaGroundY /
  backdropHeightAt) — where band content and backdrop relief disagree,
  the animals hover or sink. WATCHDOG note: the point-73 polish gate
  checks the FORMULA ground height, so it stayed green while the visible
  result broke — the reworked live-check must gate against the VISIBLE
  ground line.

  (a) CAPTURE THE VISIBLE GROUND LINE. In
  `src/scenes/travel/panoramaCapture.ts`, where the capture readback
  already scans the band pixels per azimuth sector (waterFractions), ALSO
  extract per sector the elevation angle of the highest terrain pixel
  (first non-sky pixel from the top; classify sky the way the water
  classifier separates classes) and store it on the capture object
  (`__placePanorama.groundElevation[sector]`, radians above horizontal).

  (b) STAND ON THE VISIBLE LINE. In `PanoramaWildlife`
  (`src/scenes/place/PlaceScene.tsx`), when a capture is active
  (`__placePanoramaActive`): derive each silhouette's azimuth from its
  ring position using the band's convention (mind the NEGATED-bearing
  storage pinned in `src/scenes/travel/panoramaMath.test.ts`, pt. 90),
  linearly interpolate `groundElevation` between the two neighbouring
  sectors, and set the standing height to
  `tan(elevation) * ringRadius` minus a small sink epsilon. Without a
  capture, keep today's `panoramaGroundY` clamp. In BOTH paths keep the
  pt. 73 floor: never below the ground disc's false horizon (no black
  clipped slivers).

  (c) GATE AGAINST THE VISIBLE RESULT. `__placePanoramaWildlifeInfo`
  gains `{y, visibleY}` per silhouette; the polish live-check asserts
  |y − visibleY| under a small bound for EVERY silhouette while a
  capture is active, plus one pixel probe under a silhouette's feet
  (no black sliver column). The formula-height clamp stays pure-tested
  in `src/scenes/place/backdrop.test.ts`.

  Coordinate with point 94 (ring distance changes there) — implement
  together if one rework covers both, and re-derive the radii here if
  94 lands first.
  (Done together with point 94, one PanoramaWildlife rework. KEY INSIGHT:
  the captured band cylinder's horizon line sits at EYE_HEIGHT by
  construction (TravelPanorama's v-mapping), so instead of extracting a
  per-sector band silhouette by readback — which the point-96 freeze
  flags as a stall risk and which the pt-90 note says needs WebGPU
  confirmation I can't do headless — the silhouettes now stand ON that
  horizon line (EYE_HEIGHT − sinkEpsilon) whenever a capture is active;
  without one they keep the panoramaGroundY clamp. This structurally
  fixes BOTH hover and sink (no readback, matches the band exactly).
  polish gains a capture-active check (Nubian: |y − visibleY| bounded,
  feet at/below the horizon) alongside the no-capture ground-plane
  check. backdrop.test.ts (formula clamp) unchanged.
  (track folded into point 94's note below.))

- [x] 93. The map is no longer an inventory ITEM but always available (user
  request), and the camp button shows only where camping is possible.

  (a) REMOVE THE MAP ITEM. Drop 'map' from the equipment roster and every
  shop/price listing (find every gate by grepping the map item id across
  `src/config/balance.ts`, `src/state/store.ts`, `src/ui/Dialogs.tsx`,
  `src/ui/MapOverlay.tsx`); opening the map (M key and overlay) no longer
  checks possession. SAVE MIGRATION: the checkpoint/snapshot loader
  silently strips an owned map from the bag (and its capacity use) —
  loading an old save must never fail or warn.

  (b) MAP BUTTON. In `src/ui/Hud.tsx`, add `.map-toggle` bottom-right,
  immediately LEFT of `.journal-toggle` (row: camp, map, journal),
  toggling the same overview (atlas in travel, town plan in place; M
  stays the shortcut). Localized labels in both languages (en "Map (M)",
  de "Karte (M)").

  (c) CAMP BUTTON GATING. `.camp-toggle` renders only where §6.3 allows
  pitching: travel mode always; place mode only in a VILLAGE whose
  region holds "Honored Friend"; never in ports. Implement as one store
  selector used by BOTH the button visibility and the C-shortcut path,
  so keyboard and button can never disagree.

  Verifiable: `src/state/store.saveload.test.ts` — a legacy save with an
  owned map loads with the map stripped and capacity correct;
  `src/ui/Hud.test.tsx` — map button present with the localized label
  and positioned left of the journal button, camp button visible in
  travel and in a friend village, absent in a port and a non-friend
  village; `src/ui/Dialogs.test.tsx` — no map row in any shop listing;
  `scripts/verify/enrichments.mjs` — the bottom-right button row does
  not overlap and orders map left of journal (x-coordinates), and the
  journal-panel clearance check (pt. 19) still passes with three
  buttons. design.md §6.1/§7 (map item removed), §6.3/§17.4 (camp
  visibility, button row) and CLAUDE.md pt. 9/20 updated wherever the
  map item or the button row is named.
  ('map' removed from EquipmentId, EQUIPMENT_IDS (store + debug), the
  `prices` table, the shop goods and the inventory-click handler; the M
  key was already possession-free. New `.map-toggle` button (t.hud.map-
  Toggle de/en) sits left of `.journal-toggle`. Camp gating via one pure
  `canCampHere(state)` used by BOTH the button visibility and the C key
  (travel always; place only a friend, non-robbed village; never a port).
  loadCheckpoint strips a legacy 'map' item so old saves load clean.
  Tests: saveload migration, Hud (button order, camp per mode,
  canCampHere pure), Dialogs (no map good), enrichments (button row order
  + the journal clearance now gates on the always-present map button).
  design.md §6.1/§7/§17.1/§17.4 + CLAUDE.md pt. 9/19 updated. FULL
  regression: 16/17 green; collision was a load flake (empty colliders
  under load → distance-0.00), green standalone (WATCHDOG: no slipped
  bug — point 93 does not touch collision/PlaceScene).
  (track: 15.07. 01:23 -> 02:07, ~44 min, ~50k in / ~12k out, model
  claude-opus-4-8[1m], effort high, thinking on, autonomous batch, dontAsk))

- [x] 94. Panorama wildlife reads as looming monument, not distant animal
  (user screenshot, Swahili Village: a giant coal-black elephant on the
  skyline, mistaken for an elephant-graveyard depiction). The §2.5
  silhouettes stand only ~14-28 m beyond the settlement edge at up to
  4.2x scale, in a flat near-black material (`#4d4639`), right on the
  horizon seam where they clash with the cloud band's hard lower edge
  (`PanoramaWildlife` in `src/scenes/place/PlaceScene.tsx`).

  (a) DISTANCE/SIZE. Push the drift ring out (order of
  `innerRadius + 55..85` instead of `+ 14..28`) and cap the scale so the
  subtended angle stays small: enforce
  `buildHeight · scale ≤ tan(maxApparentAngle) · ringDistance` with
  `maxApparentAngle` a balance value (~2.5°); clamp scale DOWN when the
  bound would be exceeded, never up.

  (b) ATMOSPHERIC PERSPECTIVE. Replace the flat dark color: lerp the
  silhouette material color toward the scene's sky horizon tone by a
  `panoramaHazeMix` balance value (~0.55), slightly stronger for the
  farther radii, so distant animals read lighter and hazed (roughness 1,
  no emissive, one shared material — tint via vertex color or per-mesh
  material clone, whichever the existing pattern uses).

  (c) SEAM. With pt. 92's visible-ground standing in place, additionally
  assert no silhouette's screen-space box crosses the cloud band's lower
  edge; where one would, the (a) clamp shrinks it below the seam.

  Verifiable: the polish live-check keeps `__placePanoramaWildlife` > 0
  (§2.5 stays fulfilled), gains an apparent-size bound (project each
  silhouette's bounding sphere through the camera and assert the pixel
  height under the bound) and a color probe (sampled silhouette pixels
  measurably closer to the sky tone than to black); refreshed horizon
  screenshot. All new numbers in `src/config/balance.ts`. design.md §2.5
  records the far-wildlife reading (small, hazed, horizon-true).
  Implement together with point 92 if one rework covers both.
  (One PanoramaWildlife rework covering 92 + 94. Pushed the ring out
  (balance.panoramaWildlife ringInner 55 + spread 30, was +14..28);
  the scale is clamped DOWN so each silhouette subtends ≤ maxApparent-
  AngleDeg (2.5°) via silhouetteScale(buildHeight, ringDist, …); the
  colour lerps toward the scene's sky-horizon tone by hazeMix (0.55,
  a touch more for farther rings) via hazeColor, per-animal material.
  Pure sizing/haze math in src/scenes/place/panoramaWildlife.ts, 7
  Vitest cases. polish gains: every silhouette small (apparentDeg ≤ 2.6),
  hazed (luminance > 0.42, not flat black), on the ground plane (no
  capture) or the band horizon (capture). Swahili look-check: the
  monumental black elephant is now a small hazed silhouette on the far
  hill. design.md §2.5 + CLAUDE.md pt. 31 updated. FULL regression:
  polish 22/22 (the gate) green in the full run; the two red suites
  (enrichments, preview) were load-induced flakes, both green standalone
  (WATCHDOG: no slipped bug — environmental, reproduced green solo).
  (track: 14.07. 23:17 -> 15.07. 00:17, ~60 min, ~70k in / ~16k out,
  model claude-opus-4-8[1m], effort high, thinking on, autonomous batch,
  dontAsk))

- [x] 95. Sell dialogs align like a table too (user request, bazaar
  screenshot): the BUY dialogs already use the aligned price-table layout
  (CLAUDE.md pt. 5 — name/price/action columns with shared left edges);
  the SELL listings (bazaar sell side, port gear buy-back, village
  trading post buy-back) still set each row's price ragged. Give every
  sell listing the same column grid so names, prices and buttons stand
  cleanly under each other — and while at it verify the bazaar BUY list
  from the user's screenshot really shares the price column (the shown
  prices read ragged; fix if the aligned-table rule only covers the shop
  dialogs). Both languages untouched (layout only). Extend the
  Dialogs.test.tsx layout assertions to the sell rows and the flow.mjs
  aligned-column check to a sell dialog.
  (The actually-ragged lists were the BAZAAR (sell + buy) and the FERRY,
  which used the flex `.row` layout; the shop's gear buy-back already used
  the aligned `.trade-grid`. Moved bazaar offer/buy and ferry to
  `.trade-grid`/`.trade-row` (name/price/action columns; a 2-col
  `.offer-grid` for the price-less sell list); shared left edges verified
  in flow.mjs (bazaar buy prices + sell names) and the grid cells pinned
  in Dialogs.test.tsx (sell, bazaar, ferry). Bazaar screenshot confirms
  the clean right-aligned price column. Both languages untouched (layout
  only). CLAUDE.md pt. 5 updated. Vitest 1427, flow 32 green.
  (track: 14.07. 22:00 -> 22:11, ~11 min, ~30k in / ~7k out, model
  claude-opus-4-8[1m], effort high, thinking on, autonomous batch, dontAsk))
- [x] 96. Leaving a
  settlement freezes the game for ~13-16 s once several
  settlements were visited in a session (found via the polish gate racing
  its 15 s timeout; measured 13.5 s with the baked textures and 15.7 s
  WITHOUT them, so it is pre-existing and unrelated to point 86; leaving
  the very first settlement takes <1.5 s). The main thread blocks between
  `leavePlace()` and the travel scene's first frame.

  (a) MEASURE FIRST — do not guess the fix. Dev-only instrumentation:
  `performance.mark` at `leavePlace()` and at the travel scene's first
  rendered frame (one-shot `onAfterRender`); log
  `renderer.info.programs.length` and `renderer.info.memory` before and
  after; wrap the §2.5 capture path and any terrain/geodata (re)builds
  in `console.time` pairs. Reproduce with the known recipe: enter
  masai-village → swahili-village → capetown → timbuktu (dev hooks),
  then `leavePlace()`. Known signals: "GPU stall due to ReadPixels"
  driver warnings; the FIRST leave of a session is fast, so plain
  travel-shader compilation is not the whole story. Prime suspects:
  program re-links after the four place scenes' materials were disposed,
  a synchronous GPU readback on the transition, or a disposal storm from
  the unmounted place scenes.

  (b) FIX the dominant block. Candidates by cause: keep shared travel
  programs alive across place visits (do not let place-scene unmounts
  dispose shared shader programs); switch synchronous readbacks to
  `renderer.readRenderTargetPixelsAsync`; spread heavy disposals over
  idle frames. Must NOT regress: the pt. 86 texture pipeline, the §2.5
  capture correctness (polish compass/panorama checks), or the pt. 20
  near-plane snap on scene switch.

  (c) GATE. New polish check on the same 4-visit recipe: the leave
  transition (leavePlace → travel first frame) completes in under
  3000 ms; with that green, tighten the pt. 86 leave timeout in
  `scripts/verify/polish.mjs` back from 45 s to 15 s. Record the
  measured before/after numbers in this point's tick note.
  TRACK (special provenance: implemented by the unwanted parallel
  headless session — the user's accidentally-closed 14.07 window — then
  audited, completed and committed by this session on the user's order):
  ROOT CAUSE (CDP-profiled by the parallel session, A/B-verified here):
  unmounting the travel scene disposed its materials, and each remount
  built a fresh CSMShadowNode whose setup() renames its cascade uniform
  buffer in every shadow-receiving material's generated code — so the
  first draw after leavePlace() re-linked the whole travel program set
  synchronously (getProgramParameter self-time). MEASURED: leave after
  4+ settlement visits 9.9-10.1 s on clean HEAD (13-16 s originally under
  load) → 955-1599 ms fixed (polish gate < 3000 ms, timeout 45 s → 15 s).
  FIX: module singletons for every travel material (terrain incl. its
  textures, water, river/lake, border, far sheet, bone/ivory/landmark),
  the sun+CSM (StableCSMShadowNode memoizes setup, fog/hemi singletons)
  and the instanced dressing/wildlife pools. COMPLETION by this session:
  the parallel session's blanket dispose={null} on the scene root leaked
  the ~270 per-mount JSX geometries per place visit (12-cycle probe:
  +270/cycle linear, no plateau) — replaced by SURGICAL per-element
  dispose={null} on singleton-referencing elements only, plus module
  caches for the heavy per-mount geometries (seed-keyed chunk cache,
  rivers+lakes bundle, border geometry, hunt/vulture/graveyard geos,
  water plane). Leak after: +9 geometries/+1 texture per cycle — BETTER
  than the pre-fix baseline (+57/+15); residue is pre-existing.
  Companion fix (own commit): the Timbuktu mosque was silently missing
  in ~6 % of seeds (all four preferred spots occupied — the polish
  "flake") — a deterministic golden-angle sweep now guarantees placement,
  sweep-tested across 120 seeds. Full regression ALL GREEN (18 suites,
  1490 Vitest, first fully flake-free run), lint/audit clean.
  (track: 15.07. ~07:30 -> 08:01 parallel session (killed), 09:01 -> 10:35
  this session: audit, A/B, leak probes, surgical completion, ~180k in /
  ~35k out combined estimate, model claude-fable-5[1m] (parallel leg) +
  claude-opus-4-8[1m]→claude-fable-5[1m] (this leg), effort high, thinking
  on, user-ordered takeover, dontAsk)
- [x] 97. First-person walking inside settlements feels artificial (user
  report): movement snaps to full speed instantly, the camera is rigidly
  fixed at eye height, and steps are silent. Add a first stage of walk-feel
  polish to the PlaceScene player controller — scope is EXACTLY the five
  measures below; walk speed itself (`balance.placeWalkSpeed`) stays
  unchanged, and the travel scene is untouched.

  (a) INERTIA. Extend the player ref with a velocity state and ease the
  current horizontal velocity toward the target from `placeWalkVelocity`
  each frame (exponential smoothing, separate accelerate/decelerate time
  constants), replacing the direct position stepping in the walk block.
  Collision resolution (`resolveMove`) keeps operating on the resolved
  per-frame delta; sliding along walls must not jitter or build up speed.

  (b) STEP PHASE + HEAD BOB. Introduce a single step-phase accumulator
  driven by the actual horizontal speed (phase advances only while
  moving). Derive from it a vertical camera bob and a half-frequency
  lateral sway (figure-eight), both scaled by current speed so they fade
  out smoothly when stopping. Applied on top of EYE_HEIGHT at the camera
  write; amplitudes are balance values.

  (c) FOOTSTEP SOUNDS. Add a procedural `emitFootstep(surface)` one-shot
  to `src/systems/ambience.ts` in the style of the existing emitters
  (filtered noise impulse, short decay; duller timbre on open ground/sand,
  harder/brighter on 'stone' paths). PlaceScene triggers it on each
  step-phase zero crossing; the surface is classified via the existing
  path proximity test (on-path kind vs. open ground) from the layout.
  Volume respects the existing ambience master/settings gain. No audio
  assets, no new dependencies.

  (d) STRAFE ROLL. Add a small camera roll (~2-4° max) proportional to
  the current lateral velocity, smoothed, zero at rest. Keep the yaw-only
  look model otherwise intact (pointer lock, gamepad look unchanged).

  (e) STOP SETTLE + IDLE SWAY. Stopping lets the bob/roll ease back to
  neutral via (a)+(b) scaling; standing still gets a barely visible slow
  idle sway (amplitude well under 0.01 m) so the camera never freezes
  dead.

  All tunables (time constants, bob/sway/roll amplitudes, step cadence,
  footstep gains) live centralized in `src/config/balance.ts` — no magic
  numbers in the scene. Pure step-phase/bob/roll math goes into a small
  pure module (e.g. `src/systems/walkFeel.ts`) with Vitest coverage
  (phase advance vs. speed, zero-crossing detection, amplitude fade at
  v→0, roll sign/clamp). Expose a dev hook (e.g. `window.__walkFeel`:
  current phase, bob offset, roll, last footstep surface) per CLAUDE.md
  §7.2 and gate the live behaviour in the collision or polish suite
  (camera y oscillates while walking, returns to EYE_HEIGHT at rest;
  footstep fires on phase crossing with the expected surface class).
  Interaction distances, door triggers, and the leave-radius check keep
  using the logical player position — the bob is camera-only and must not
  affect gameplay geometry. No speech files are touched; skip the voice
  regression. design.md §2 records the walk-feel rules. Scoped suites per
  the diff mapping (`src/scenes/place/` → collision, polish, settings;
  plus Vitest), then full regression.
  TRACK: pure `src/systems/walkFeel.ts` (easeSpeed inertia with split
  accel/decel taus, advanceStepPhase footstep crossings, headBob
  figure-eight fading with speed, strafeRollTarget, easeToward, idleSway)
  + 14 Vitest cases; `emitFootstep(surface)` in ambience.ts (filtered
  noise, stone vs. ground timbre, ambience-gain aware); PlaceScene walk
  block rebuilt on eased velocity with step-phase footsteps (surface via
  layout `isOnLane`), camera-only bob/roll/idle-sway, snap-to-zero for an
  exact resting EYE_HEIGHT, dev hook `window.__walkFeel`; balance
  `walkFeel` block (all debug-editable, walk speed unchanged);
  settings.mjs live gate (bob oscillates walking, settles to 1.5 m at
  rest, footstep surface class). design.md §2.2 + CLAUDE.md pt. 20
  updated. Full regression green (17 suites).

- [x] 98. Jump-to covers every named map point, grouped and sorted (user
  request while testing SSR: Victoria Falls and Lake Victoria were
  missing). The debug menu's jump-to dropdown (`src/ui/DebugMenu.tsx`,
  design.md §21.3) currently offers only ports, villages, the elephant
  graveyard and the tomb.

  (a) ENTRIES. Extend the dropdown to every NAMED point of the world
  map: ports, villages, mountains (`MOUNTAINS`), waterfalls
  (`WATERFALLS`), lakes (`LAKES`, jump to the lake centre or its named
  anchor), the cultural landmarks (`CULTURAL_LANDMARKS`), the natural
  sites (`NATURAL_SITES`), the elephant graveyard and the tomb — data
  all in `src/world/data/` and `src/world/geo.ts` (PLACES); jump via the
  existing `debugJumpTo(lat, lon)`.

  (b) GROUPING + ORDER. Use `<optgroup>` per category with a localized
  category label (de + en dictionary entries: Ports, Villages,
  Mountains, Waterfalls, Lakes, Cultural landmarks, Natural sites,
  Other), categories in that fixed order; WITHIN each group sort
  alphabetically by the LOCALIZED display name (locale-aware compare,
  `localeCompare` with the active language). Entry labels use the same
  localized names the map/labels use (`t.landmarks`, place names) — no
  new strings except the category labels.

  (c) TESTS + DOCS. `src/ui/DebugMenu.test.tsx`: the select contains an
  entry for a sample of each category (e.g. Victoria Falls, Lake
  Victoria, Kilimanjaro, Ngorongoro, Meroë), groups appear in the fixed
  order, entries within a group are alphabetically sorted in BOTH
  languages, and choosing an entry calls the store jump with that
  point's coordinates. design.md §21.3 and CLAUDE.md pt. 20 (dropdown
  selectors) record the extended scope.
  (A new GroupedActionSelect renders <optgroup>s; the jump-to targets are
  built from PLACES + MOUNTAINS/WATERFALLS/LAKES/CULTURAL_LANDMARKS/
  NATURAL_SITES + graveyard/tomb, grouped in the fixed order and sorted
  by localizedName.localeCompare(lang) within each group; a value->coords
  map resolves the pick (tomb stays per-run). New jumpGroups labels in
  de/en/types. 5 Vitest cases (category samples incl. Victoria Falls /
  Lake Victoria, fixed group order, alphabetical en+de, jump coordinates);
  live dropdown dump confirms 8 sorted groups. design.md §21.3 + CLAUDE.md
  pt. 20 updated. FULL regression incl. all browser suites green (17/17,
  Vitest 1431, no flakes — user-requested precaution after the
  parallel-instance episode).
  (track: 14.07. 22:11 -> 23:16, ~40 min active across the parallel-stop
  interruption, ~45k in / ~11k out, model claude-opus-4-8[1m], effort
  high, thinking on, autonomous batch, dontAsk))

- [x] 99. REMOVE the SSR feature (user decision after the manual check:
  with the bird's-eye camera never reaching grazing angles and the
  first-person scenes having no water/gloss, no in-game situation shows
  screen-space reflections — the integration cannot be meaningfully
  verified and stays dead weight). TRAA is NOT touched; true water
  refraction stays an OPEN item.

  (a) PIPELINE. Remove the SSR wiring from the post-processing chain
  (find it via grep for `SSRNode` / `ssr` in `src/` — expected: the
  chain builder in App.tsx or the render-pipeline module): the SSRNode
  import (three addons), the metalness/roughness MRT targets that exist
  ONLY for SSR, the additive composite step before the temporal resolve,
  and the WebGPU-backend gate around it. The chain must read afterwards
  exactly as before SSR (pt. 32 step 1 state): render pass (+ MSAA
  fallback) → TRAA → tone mapping etc. If the MRT also feeds something
  else, keep that consumer and remove only the SSR tap.

  (b) STATE + UI. Remove `ssrEnabled`/`setSsrEnabled` from
  `src/state/ui.ts` and the SSR checkbox block from
  `src/ui/DebugMenu.tsx`; delete the localized label strings from BOTH
  language files (grep the i18n key; both de.ts and en.ts). No
  savegame/localStorage migration needed unless the ui store persists
  the flag — check the store's persistence list and drop the key there
  too (a stale persisted key must not crash the loader; tolerate and
  ignore it).

  (c) TESTS + SUITES. `src/ui/DebugMenu.test.tsx`: remove the SSR
  checkbox assertions (keep TRAA's). `src/i18n/i18n.test.ts`: key-parity
  checks must pass with the removed keys. `scripts/verify/settings.mjs`:
  remove the SSR-inert-on-fallback check (keep every TRAA gate,
  including the toggle/leak gates). Full `npm run build` — the SSRNode
  import must be gone from the bundle (no dead import).

  (d) DOCS. design.md §2.7: remove SSR from the pipeline feature list
  and record the decision in place ("SSR removed — no in-game situation
  reaches the grazing angles where it reads; revisit only if the camera
  or the scene content changes"). CLAUDE.md pt. 32: rewrite the step-2
  passage — SSR was delivered, went through the manual check on
  14.07.2026 with the verdict above and was REMOVED again by user
  decision; keep the pt. 32 numbering and the TRAA/step-1 record and
  the open water-refraction item intact. Update pt. 20's debug-menu
  enumeration (drop the SSR row mention) and the dashboard's manual
  check card (the SSR acceptance is resolved by removal).

  (e) AFTER the removal, re-check the Kabalega-Falls repro (jump to a
  waterfall, closest zoom): if the flat BLACK shapes / all-WHITE animals
  from the user's screenshots persist WITHOUT SSR, they are NOT
  SSR-caused — leave them to point 92's family and note the finding in
  this point's tick note; do not chase them here.
  (Removed the SSRNode wiring from Effects.tsx — import, metalness/
  roughness MRT tap, additive composite, the ssrActive gate — so the
  chain reads exactly as after pt. 32 step 1; dropped ssrEnabled/
  setSsrEnabled from ui.ts, the debug checkbox from DebugMenu.tsx, the
  de/en/types labels, the DebugMenu SSR tests and the settings.mjs
  inert-gate. Bundle −22 kB, SSRNode confirmed absent from dist, TRAA
  untouched. design.md §2.7 (water list + debug checkbox), CLAUDE.md
  pt. 14/32, water.ts and the verify README updated. 99(e) FINDING: the
  flat black shapes near the river PERSIST with SSR fully gone → NOT
  SSR-caused; they are in the TRAVEL scene (distinct from pt. 92's
  settlement panorama), logged as the new point 101. Vitest 1425,
  full regression green (handwriting was the deferred-pt-100 cold-TTS
  flake, hardened test-side in 16840b6, then green).
  (track: 14.07. 21:30 -> 22:05, ~35 min, ~40k in / ~9k out, model
  claude-opus-4-8[1m], effort high, thinking on, autonomous batch, dontAsk))

- [x] 100. Cold TTS
  model load janks the MAIN thread ~14 s (found while
  diagnosing the handwriting flake): with an unprimed browser profile,
  adding a journal entry (auto-narration) froze the handwriting reveal —
  a plain 60 ms `setInterval` on the main thread — for ~14 s while the
  Kokoro model downloaded (probe: first revealed char after ~13.9 s,
  twice). The worker isolation (CLAUDE.md §3) should keep the main
  thread smooth during the download; something in the cold path stalls
  it. Affects a real player exactly once (first narration ever, until
  the browser cache holds the model), but a 14 s freeze is a hard UX
  defect.

  (a) MEASURE in both dev and `npm run preview` (the dev-mode Vite
  worker-module transform is a suspect that would vanish in the built
  app): a probe that clears the profile, adds an entry and samples RAF
  timestamps/`setInterval` drift on the main thread during the model
  download. If the freeze is DEV-ONLY, document that in
  scripts/verify/README.md and downgrade this point to done with that
  note.

  (b) If it freezes in the built app too: bisect the cold path —
  worker spawn (`new Worker` module compile), the main-thread device
  probe in `src/journal/speech.ts`, kokoro-js/onnxruntime WASM
  instantiation (should live in the worker), `AudioContext` creation.
  Fix so the main thread never blocks longer than a frame budget
  (~two frames) during a cold start; narration may simply begin later.

  (c) GATE: a voice.mjs check with a CLEARED cache directory (record
  mode) asserting the journal reveal advances within its normal cadence
  while the model is still loading (reveal timing independent of TTS
  readiness).
  TRACK: (a) measured with an rAF + 60 ms-interval liveness probe on a
  fresh profile in BOTH dev and the built app: the freeze is NOT dev-only
  and NOT a main-thread block — the 60 ms interval kept firing (max gap
  ~140 ms) while requestAnimationFrame stalled ~15 s: the RENDERED game
  froze (compositor delivered no frames; queued input was delivered late,
  which is why the old probe read it as a "main-thread" freeze).
  (b) ROOT CAUSE: the TTS worker's onnxruntime WebGPU init — dev A/B:
  skipping the webgpu attempt (wasm direct) drops the cold load from
  ~20 s with a 15.0 s rAF stall to 4.9 s with max 50 ms gaps. FIX: the
  engine now always runs the quantized WASM path (q8) — the webgpu
  attempt and the main-thread device decision are removed (speech.ts /
  ttsWorker.ts; __ttsForceWasm hook obsolete). q8 is audibly equivalent
  on the 82M voice model and its weights are a quarter of the fp32
  download the webgpu path needed. Verified in the BUILT app too: cold
  TTS load 5.3 s with max 50 ms rAF gaps (probe after the boot stall,
  see below). (c) GATE adapted: every voice.mjs run has a fresh browser
  profile (client-cold; assets replay from the local .cache/tts route,
  so the gate stays CDN-independent — a genuinely cleared cache dir
  would re-download ~90 MB per run from the rate-limited HF CDN, the
  point-88 problem); the suite samples rAF across the deferred
  first-gesture narration (the cold engine load) and asserts the game
  kept rendering: measured max 33 ms gap over 307 frames, bound 1500 ms.
  FINDING while measuring, logged as point 105: the built app (preview)
  shows a separate, TTS-INDEPENDENT ~15 s rAF stall at ~14.5 s after
  boot (reproduced with no input at all; dev clean) — out of this
  point's scope. CLAUDE.md §3 + scripts/README updated. voice 6/6 +
  handwriting 10/10 + Vitest 1490 green, audit 0.
  (track: 15.07. 10:12 -> 10:45, ~33 min, ~55k in / ~12k out, model
  claude-fable-5[1m], effort high, thinking on, user-supervised batch,
  dontAsk)

- [x] 101. Flat BLACK vertical shapes in the TRAVEL scene, near rivers
  (confirmed while removing SSR, point 99(e): they persist with SSR fully
  gone, so they are NOT SSR-caused; distinct from point 92, which is the
  SETTLEMENT panorama silhouettes). In the bird's-eye view at close zoom,
  thin near-black rectangular bars stand upright next to the river channel
  (screenshot: jump to Kabalega/Murchison Falls ~2.28 N, 31.68 E, zoom
  0.25). The user also reported all-WHITE animals in earlier screenshots;
  verify whether those share a cause.

  (a) IDENTIFY. With a dev server, jump to the repro and enumerate what
  sits at the black-bar screen positions via the existing scene dev hooks
  (`__wildlife`, `__rivers`, and the dressing/flora instancing in
  `src/scenes/travel/`): are they wildlife meshes, river-bank dressing,
  flora, or shadow/depth artifacts? Log the mesh type and material. Prime
  suspects: a wildlife or dressing mesh whose material lost its
  vertex-color/instance-color attribute (renders black), or a
  billboard/silhouette drawn edge-on. The all-white-animals report points
  the same way (missing/!inverted vertex colors).

  (b) FIX at the source: restore the material's color input (vertex or
  instance color, or the correct base color) so the mesh renders in its
  intended tone, OR cull it if it is stray dressing that should not be
  there. Do not paper over with a post-process mask.

  (c) COVER: a pure test on the mesh/material builder that the color
  attribute/tone is present (whatever the identified culprit is), and a
  travel-scene live check (enrichments.mjs) that samples the pixels at a
  known river-side dressing/wildlife position and asserts they are not
  near-black (and not pure-white). Screenshot at the repro spot showing
  the shapes gone. design.md note only if a design rule is involved.
  TRACK: the black bars were the REGION-BORDER ribbons (design.md §3.1), not
  wildlife/flora. Root cause (found via a dev-server raycast/A-B/SSAO probe):
  the ribbon used a transparent classic MeshBasicMaterial with depthWrite off,
  so it wrote no valid normal into the TSL node pipeline's MRT scene pass and
  the screen-space GTAO read full occlusion on those pixels and multiplied them
  to flat black — worst near rivers, where the ribbon also floated over the
  bank drop. Fix (src/scenes/travel/borderGeometry.ts, new module): an OPAQUE
  MeshStandardNodeMaterial (writes a ground normal → AO treats it like the
  ground) in a warm sepia BORDER_INK, plus per-corner terrain sampling so every
  ribbon corner lies flush on its own ground (no floating gap) and a per-corner
  water skip. The all-white-animals report did NOT reproduce (fauna render in
  colour) and is unrelated. No design rule changed (§3.1 already calls the
  border a "subtle dashed ground marking"). Tests: borderGeometry.test.ts
  (flush corners, land-only, mid-tone ink) + enrichments.mjs (AO-safe material
  via __regionBorder, and a sampled ribbon pixel luminance ~184, not black;
  screenshot 104). Full regression green (18 suites; the lone enrichments
  animal-collision miss was a load flake, green standalone).

- [x] 102. First-person surroundings wildlife doesn't match the bird's-eye
  landscape (user report): in Cairo (first-person) animals drifted through
  the skyline RIGHT NEXT TO the pyramids; after leaving to the bird's-eye
  view there were no animals by the pyramids and none anywhere nearby.
  ROOT CAUSE (two independent systems): the §2.5 first-person silhouettes
  (`PanoramaWildlife`, a decorative ring around the settlement) are NOT
  the same individuals as the bird's-eye wildlife streaming
  (`src/scenes/travel/` Wildlife, which spawns/despawns around the
  traveller). Full individual consistency is OUT OF SCOPE (the bird's-eye
  wildlife is a live sim) and must not be attempted; scope is exactly
  (a)-(c).

  (a) SILHOUETTES NEVER CROSS A FIXED SKYLINE LANDMARK. Exactly TWO
  skyline features exist, both distant meshes outside the town with a
  well-defined bearing from the town centre: `GizaSkyline` (cairo,
  positioned ~(-130, 10) relative to centre) and `TableMountainSkyline`
  (capetown, ~(0, -118)) — the `__placeSkyline` dev hook marks them. The
  Djinguereber mosque is NOT a skyline feature (it is an in-town
  `DwellingKind`; a horizon silhouette behind town buildings is a normal
  depth relationship) — do not build an exclusion for it. Implement: a
  pure helper computing a landmark's excluded azimuth span from its
  placement (position, footprint width, plus `panoramaLandmarkMarginDeg`,
  a new balance value ~8°), and in `PanoramaWildlife` DROP any silhouette
  whose ring azimuth falls inside an excluded span (no redistribution to
  other azimuths — fewer animals is fine and invisible). Wire the two
  landmarks' spans through a small per-place table next to the skyline
  components, not hardcoded inside the wildlife code, so a future third
  skyline only adds a table row. Pure-test the helper (span from
  placement, margin applied, inside/outside classification incl.
  wrap-around at 0°/360°).

  (b) THE BIRD'S-EYE VICINITY OF A SETTLEMENT IS NOT EMPTY. Decision
  (record in design.md §2.5): SEED ambient bird's-eye wildlife near every
  settlement — the alternative (thinning first-person silhouettes) was
  rejected as it makes the world feel emptier. Rules: on spawning the
  chunks around a settlement, guarantee a minimum presence of
  region-typical animals (`panoramaVicinityMinAnimals`, balance value
  ~6, within `panoramaVicinityRadius`, ~1.5x the view ring) by seeding
  additional herds ONLY when the normal chunk spawn produced fewer —
  never additive on top of an already-populated vicinity. Seeded animals
  are ordinary animals: seed-deterministic placement (derived from world
  seed + settlement id), same species pool as the region, normal chunk
  membership, normal streaming despawn, no special lifecycle, and they
  count against the existing spawn budget/clamps (if the budget is
  exhausted, seed less — never exceed it). Respect existing spacing rules
  (no spawn inside dwellings/other animals) and keep away from the
  settlement's leave position by a small clearance so the player never
  materializes inside a herd.

  (c) SPECIES MATCH. Verify the `PanoramaWildlife` species selection per
  region equals the bird's-eye region pool (mostly true already —
  north=antelope etc.); where a first-person species is absent from the
  region's bird's-eye pool, align the FIRST-PERSON list to the bird's-eye
  pool (the sim is the source of truth). Result is a tick-note listing
  per region either "already aligned" or the corrected species.

  Verifiable: pure azimuth-exclusion tests (Vitest, incl. wrap-around);
  `scripts/verify/polish.mjs` — Cairo first-person screenshot with the
  panorama active asserts via `__placePanorama`/silhouette dev state that
  no silhouette azimuth lies inside the Giza span (assert on the state,
  not on pixels); `scripts/verify/enrichments.mjs` — after `leavePlace()`
  at a settlement, at least `panoramaVicinityMinAnimals` region-typical
  animals exist within `panoramaVicinityRadius` of the leave position
  (assert via `__wildlife`, deterministic under the fixed test seed).
  Must NOT regress: the pt. 94 distance/size/haze bounds, the pt. 92
  visible-ground standing, and the streaming budget (no growth of the
  spawn clamp). design.md §2.5 records the landmark-exclusion rule (with
  the explicit note that in-town buildings like the Timbuktu mosque are
  NOT excluded and why) and the vicinity-seeding decision with its
  balance values. No speech files are touched; skip the voice
  regression. Scoped suites per the diff mapping (place scene → polish;
  travel wildlife → enrichments; plus Vitest), then full regression.
  TRACK: (a) pure `excludedAzimuthSpan`/`isAzimuthExcluded` (span from
  placement + margin, inside/outside with ±π wrap) in panoramaWildlife.ts
  + 5 Vitest cases; a per-place PLACE_SKYLINES table in PlaceScene (Giza
  −130/10 scale 13, Table Mountain 0/−118; footprint measured from the
  built geometry) feeds the spans, and PanoramaWildlife hides any
  silhouette whose live azimuth falls inside one (dev hooks
  `__placeSkylineExclusion` + azimuth/visible in `__placePanoramaWildlifeInfo`).
  (b) `seedSettlementVicinity` in Wildlife.tsx tops region-typical grazers
  up to `vicinityMinAnimals` (6) within `vicinityRadius` (75) of a nearby
  settlement's chunk — only the shortfall, seed-deterministic (world seed +
  place id), land-anchored with a leave-point clearance, tagged to the
  settlement chunk for normal despawn, capped by MAX_INSTANCES.
  (c) SPECIES MATCH — already aligned: every first-person species was
  already in the region's bird's-eye pool; centralised as PANORAMA_FAUNA
  (north antelope; west zebra/antelope; central elephant/antelope; east +
  south elephant/giraffe/zebra/antelope), a clean per-region subset of the
  sim's pool. balance panoramaWildlife gains landmarkMarginDeg 8,
  vicinityMinAnimals 6, vicinityRadius 75. design.md §2.5 + CLAUDE.md pt.
  12/31 updated. Verified: polish (Cairo Giza-span, 0 violating; pt 92/94
  unchanged; shot 105), enrichments (Cairo vicinity = exactly 6 = min, so
  seeding fired). Full regression green (18 suites; two different RAF
  wildlife checks flaked across runs, all green on a clean standalone run).

- [x] 103. Version tag `v0.1` plus a permanently playable frozen build of it
  on GitHub Pages, while the existing page keeps tracking main (user
  request 15.07.2026). GitHub allows ONE Pages site per repository, so the
  frozen stand is served as a SUBPATH of the same site, not a second site:
  `…github.io/Heart-of-Africa-Remake/` stays the main build (unchanged),
  `…github.io/Heart-of-Africa-Remake/v0.1/` serves the tag build forever.

  (a) TAG. After the preceding points (96, 100 AND 104 — the demo start
  defaults, user insertion 15.07.) and their Closing are committed and
  pushed, create an annotated tag on that HEAD and push it:
  `git tag -a v0.1 -m "POC 0.1 — first frozen playable stand" && git push
  origin v0.1`. The tag must include the leave-freeze fix (96) and the TTS
  cold-start fix (100) so the frozen demo plays cleanly.

  (b) WORKFLOW. Extend `.github/workflows/deploy-pages.yml`'s `build` job
  (anchor: the step named `Build`, currently `npm run build`, which uses
  the `GITHUB_ACTIONS`-gated base `/Heart-of-Africa-Remake/` from
  `vite.config.ts`). After the main build and BEFORE `Upload Pages
  artifact`, add steps that (1) check out the tag into a separate
  directory: `git fetch --depth 1 origin tag v0.1` and `git worktree add
  v0.1-src v0.1` (the runner clone is shallow — the fetch makes the tag
  available); (2) install its dependencies (`npm ci` inside `v0.1-src`);
  (3) build it with the subpath base, overriding the config on the CLI:
  `npx vite build --base=/Heart-of-Africa-Remake/v0.1/` (run in
  `v0.1-src`; `tsc -b` first, mirroring `npm run build`); (4) copy
  `v0.1-src/dist` to `dist/v0.1` so the single Pages artifact carries
  both. The `Upload Pages artifact` step stays pointed at `dist`. Guard
  the tag steps with a tag-exists check (`git ls-remote --tags origin
  v0.1` non-empty) so the workflow still deploys main-only before the tag
  exists (no hard failure). Keep permissions/concurrency unchanged.

  (c) VERIFY. Locally (no browser needed): run the subpath build once
  (`npx vite build --base=/Heart-of-Africa-Remake/v0.1/`) and assert the
  emitted `dist/index.html` references assets under
  `/Heart-of-Africa-Remake/v0.1/assets/…` (a grep suffices — this proves
  the base override reaches every asset URL, incl. the TTS worker chunk);
  restore the normal `dist` afterwards (`npm run build`). CI-side: after
  the next main push, confirm the workflow run is green and BOTH URLs
  load (the user can play-check `/v0.1/`; a `curl -I` 200 on
  `…/v0.1/index.html` is the automated smoke). README: add a "Versions"
  note naming both URLs (main = latest, `/v0.1/` = frozen POC 0.1).
  No game code, no language files, no design.md change (pure release
  engineering; CLAUDE.md untouched — §7.1 gains no new point).
  EXECUTION ORDER: worked AFTER point 104 (the tag freezes the stand
  including the demo start defaults).
  TRACK: annotated tag v0.1 on b9b0a55 (the Closing HEAD: 96 + 100 + 104
  all in, ALL-GREEN regression) pushed to origin. deploy-pages.yml gains
  a guarded tag-build stage after the main build: `git ls-remote --tags`
  existence check (main-only deploys keep working before the tag exists),
  `git fetch --depth 1 origin tag v0.1` + `git worktree add v01-src v0.1`,
  `npm ci` + `tsc -b` + `vite build --base=/Heart-of-Africa-Remake/v0.1/`
  in the worktree, copied to `dist/v0.1` — ONE Pages artifact carries
  both stands; permissions/concurrency untouched. Local (c) verification:
  the base-override build stamps every index.html asset URL (5/5) and the
  in-chunk ttsWorker URL with /Heart-of-Africa-Remake/v0.1/ — measured
  with MSYS2_ARG_CONV_EXCL (Git-Bash mangles leading-slash args; the
  Linux runner is unaffected); normal dist restored afterwards. README
  gains the Versions section naming both URLs. CI deploy verified green
  after the push; curl smoke 200 on /v0.1/index.html and the root.
  (track: 15.07. 11:15 -> 11:40, ~25 min, ~30k in / ~7k out, model
  claude-fable-5[1m], effort high, thinking on, user-supervised batch,
  dontAsk)

- [x] 104. Demo-friendly game-start defaults (user request 15.07.2026,
  BEFORE the v0.1 tag — point 103 freezes this stand). Four changes to
  what a NEW game starts with; every survival mechanic stays implemented
  and debug-adjustable (§21), only the DEFAULTS move to a relaxed
  exploration preset:

  (a) STARTING INVENTORY. A new game starts with one each of shovel,
  rope, machete, rifle, medicine and canteen — the canteen FULL (100 %).
  Anchor: `newGame()` in `src/state/store.ts` currently starts with
  `equipment: {}`; give it the six items (`canoe` stays unowned) and set
  `canteenFill` to `balance.health.canteenCapacity`. The starting
  capacity check must still hold (raise nothing: 6 items fit the default
  capacity; assert in the test). Money stays $250, start stays Cairo 1890
  (design.md fixed values).

  (b) ZERO CONSUMPTION BY DEFAULT. `balance.foodPerDay` 1 → 0 and BOTH
  canteen drain rates (`balance.health.canteenDrainPerDay`,
  `canteenDesertDrainPerDay`) → 0, so provisions and canteen fill do not
  drain per travelled day by default. The mechanics stay fully
  implemented: the debug menu edits all three at runtime (§21.2 —
  fields already exist). Tests that EXERCISE hunger/thirst mechanics
  (`src/state/store.health.test.ts`, expedition/economy tests relying on
  food drain) must set their rates explicitly in the test instead of
  relying on defaults — grep for assertions that break and inject
  non-zero rates locally; the balance-defaults test
  (`src/config/balance.test.ts`) pins the new zeros.

  (c) RANDOM EVENTS OFF BY DEFAULT. `balance.randomEventsEnabled`
  true → false. The debug menu keeps its toggle (§21.3) and the direct
  event triggers stay; `src/state/store.events.test.ts` enables the
  system explicitly where it asserts autonomous firing (its
  silence-when-disabled case now mirrors the default). The §14.4
  first-time danger warnings stay untouched (they are not random events).

  (d) ALPHABETICAL INVENTORY. The inventory bar lists owned gear
  alphabetically by the LOCALIZED display name (re-sorts on language
  switch), treasures after gear (alphabetical too), instead of the
  roster/acquisition order. Anchor: `InventoryBar` in `src/ui/Hud.tsx`
  builds `owned` from `Object.keys(equipment)`; sort by the i18n label
  before rendering.

  Verifiable: `src/state/store.saveload.test.ts` or a new
  `newGame`-focused case asserts the six start items + full canteen +
  events-off; `src/config/balance.test.ts` pins foodPerDay 0 and both
  canteen drains 0; `src/ui/Hud.test.tsx` asserts the alphabetical order
  in both languages (e.g. de: Feldflasche < Gewehr < Machete < Medizin
  < Schaufel < Seil; en: Canteen < Machete < Medicine < Rifle < Rope
  < Shovel); a full-regression pass proves no suite silently depended on
  the old defaults (flow.mjs buys food/gifts explicitly, so the core
  loop is unaffected). design.md records the relaxed start preset (§5/§6
  provisions/canteen defaults, §14.3 events default-off, §6.1/§17.1
  starting gear + sorted bar) and CLAUDE.md §7.1 adjusts wherever it
  names the old defaults (pt. 4 provisions advance → date advances,
  provisions drain only with a non-zero rate; pt. 23 rates "calibrated
  low" → default OFF, debug-enabled). Both docs per the standing rule.
  EXECUTION ORDER (user, 15.07.): directly after point 100; ONE Closing
  pass follows 100+104 together, then point 103 tags the stand.
  TRACK: (a) startState ships shovel/rope/machete/rifle/medicine/canteen
  ×1 (canoe stays a purchase), canteenFill was already 1 (100 %); money
  $250 / Cairo 1890 untouched; 6 items + 2 gifts fit capacity 20. (b)
  foodPerDay 1→0, canteenDrainPerDay 0.9→0, canteenDesertDrainPerDay
  3.0→0. (c) randomEventsEnabled true→false (debug toggle + direct
  triggers unchanged; §14.4 first-time warnings unaffected). (d) the
  inventory bar sorts gear AND treasures by the localized name
  (localeCompare with the active lang; re-sorts on switch). Tests: the
  central test helper freshGame() now restores MECHANICS-ACTIVE rates and
  an empty pack (one place instead of 17 test edits — the survival tests
  keep exercising the mechanics), the real preset pinned in a dedicated
  newGame case (store.saveload.test.ts); balance.test pins the three
  zeros + events-off; Hud.test asserts the alphabetical order in BOTH
  languages (en: canteen<machete<medicine<rifle<rope<shovel; de:
  Feldflasche<Gewehr<Machete<Medizin<Schaufel<Seil); flow.mjs adapted
  (buy-grid-scoped Schaufel click — the sell-back list now also carries
  one — and shovel count 2 after the buy), events.mjs enables the event
  system explicitly (it tests exactly that system). design.md §6.1/§14.3
  (relaxed exploration preset) + CLAUDE.md pt. 4/23 updated. Vitest
  1493 green, flow 32/32, events 2/2; full regression in the Closing
  pass that follows.
  (track: 15.07. 10:46 -> 11:10, ~24 min, ~40k in / ~9k out, model
  claude-fable-5[1m], effort high, thinking on, user-supervised batch,
  dontAsk)

- [x] 105. DEFERRED (logged finding from the point-100 measurements,
  15.07.2026 — needs a user go before being worked; the batch-resume hook
  skips DEFERRED lines). The BUILT app (vite preview / production bundle)
  shows a ~15 s requestAnimationFrame stall starting ~14.5 s after boot —
  TTS-INDEPENDENT (reproduced on a fresh profile with zero input and no
  narration; the 60 ms-interval main-thread timers keep firing, so it is
  a compositor/GPU-process stall, and queued input is delivered only
  after it ends). Dev is clean (max 67 ms gaps over the same window), so
  it is preview/bundle-specific; plausibly headless-specific (the game
  runs the WebGL 2 fallback there) — REPRODUCE ON REAL HARDWARE FIRST:
  if real Chromium/WebGPU shows no stall, document it as a headless
  artifact in scripts/verify/README.md and close. Probe recipe: load the
  built app on a fresh profile, sample rAF from canvas-up for ~35 s, no
  input; measured gapStart ~14.3-14.5 s, gap ~15.0 s, twice. Suspects to
  bisect if real: a delayed pipeline/shader compile batch, the renderer's
  WebGPU→WebGL fallback timing, an asset decode (baked surface textures),
  or a headless GPU-process watchdog.
  RESOLVED (15.07.2026): the user ran the real-hardware check (deployed prod page,
  fresh tab, ~30 s idle) and confirmed NO freeze on real Chromium/WebGPU. So the
  stall is a HEADLESS-ONLY artifact of the WebGL 2 fallback path (the game runs
  WebGPU on real hardware) — not a real-hardware bug. Documented in
  scripts/verify/README.md and closed; nothing to fix.

- [x] 106. Flat BLACK blob on the settlement ground (user screenshot on the
  DEPLOYED v0.1 build, real-hardware Chromium/WebGPU): a large pure-black
  shape lies on the sand at the base of a near foreground building in Cairo's
  first-person view, while the other buildings' cast shadows render as normal
  soft grey. Distinct from the earlier black-artifact fixes: points 73(a)/92/94
  were the DISTANT panorama silhouettes at the horizon, point 101 was the
  region-border ribbons in the BIRD'S-EYE scene — this is a FOREGROUND ground
  shape in the first-person settlement. Does NOT reproduce on the WebGL 2
  headless path (verified: soft shadows, no blob), so it is WebGPU-specific and
  the headless suites cannot gate it (the known WebGPU-untestable-headless
  limitation). CAUSE (same family as point 101): the screen-space GTAO term is
  applied multiplicatively (`color.mul(ao.r)` in `src/render/Effects.tsx`), so
  where GTAO over-occludes — worst at the base of a large near wall, stronger on
  the WebGPU backend — it crushes the already-sun-shadowed ground to ~0 = flat
  black. FIX: floor the AO factor (`max(AO_FLOOR, ao.r)`, AO_FLOOR 0.4) so the
  deepest occlusion reads as a dark grey, never a void — backend-neutral, and it
  cannot regress the WebGL 2 look (AO is mild there; screenshot confirms the
  settlement is unchanged). Verifiable: the WebGL 2 render suites stay green
  (settings TRAA/non-black-frame/leak gate, the point-101 border AO check in
  enrichments, polish settlement shots); the real fix is a USER check on WebGPU
  hardware (the blob is gone), since headless cannot exercise that path. Note:
  the frozen /v0.1/ page keeps the blob (it is the tagged stand); only main
  gets the fix unless the user re-tags. design.md unchanged (render-quality
  safeguard; CLAUDE.md §7.1 gains no new point).
  TRACK: Effects.tsx AO composite `color.mul(ao.r)` → `color.mul(max(float(
  AO_FLOOR), ao.r))`, AO_FLOOR 0.4 (new module const). Ruled out a point-101-
  style transparent decal: the settlement paths are a grayscale MASK baked into
  the ground's standard node material, not a separate mesh, and every surface is
  a normal-writing node material — so GTAO gets valid input and the only route
  to pure black is the multiply reaching ~0, which the floor caps. WebGL 2
  unaffected (settings 27/27, enrichments point-101 border AO checks green,
  first-person screenshot unchanged). MANUAL WebGPU ACCEPTANCE by the user
  PENDING (headless is WebGL 2 only) — the deployed main build carries the fix
  for their check. Committed as its own point after the run's completion, on
  the user's report.
  (track: 15.07. 11:45 -> 12:10, ~25 min, ~40k in / ~9k out, model
  claude-opus-4-8[1m], effort high, thinking on, user-supervised, dontAsk)

- [x] 107. Rocks (and other scattered dressing) disappear at certain in-settlement
  standpoints and reappear when the player moves (user report, real hardware). CAUSE:
  R3F `<instancedMesh>` defaults `frustumCulled` true, and the bounding sphere is
  computed from the BASE geometry at the ORIGIN (0,0,0), not over the spread-out
  instance matrices — so the whole mesh is frustum-culled the moment the origin
  leaves the view, dropping every instance at once. FIX: `frustumCulled={false}` on
  the five scattered instanced meshes in PlaceScene (Fences thorn/woven/stone,
  Scatter tuft/rock) — they are small, bounded per chunk, and cheap to keep. TRACK:
  src/scenes/place/PlaceScene.tsx (5 meshes). Verifiable: polish.mjs traverses
  `window.__scenePass.scene`, counts InstancedMeshes carrying `frustumCulled` and
  asserts `checked > 0 && culled === 0` (no scattered mesh culls itself away).
  design.md unchanged (rendering-correctness fix; CLAUDE §7.1 pt.15 dressing).
  (committed c790f75, shared with point 108)
  (track: 15.07. ~13:00 -> 13:15, ~15 min, model claude-opus-4-8[1m], effort high,
  thinking on, user-supervised, dontAsk)

- [x] 108. Journal read-aloud is choppy from the first entry — a bit is spoken, then
  a long pause, then a bit more (user report; a REGRESSION from point 100's q8/WASM
  switch). CAUSE: the WASM synth path is slower than the old lockstep one-ahead
  lookahead could hide, so the next segment finished synthesizing only AFTER the
  current one stopped playing. FIX (src/journal/speech.ts): fire EVERY segment's
  synthesis up front into the worker queue so it runs maximally ahead and builds a
  growing buffer; playback awaits each in order and catches up during the longer
  segments. Un-awaited rejections are swallowed so a cancel cannot surface an
  unhandled rejection. Verifiable: voice.mjs stays green (narration produces audio,
  the rAF liveness gate holds through the cold load). design.md unchanged (CLAUDE
  §7.1 pt.19). (committed c790f75, shared with point 107)
  (track: 15.07. ~13:00 -> 13:15, ~15 min, model claude-opus-4-8[1m], effort high,
  thinking on, user-supervised, dontAsk)

- [x] 109. The current-position marker is not visible/placed on the map as ordered
  (user report; a point-89 regression). ROOT CAUSE: the shared `.map-player` CSS rule
  set `position:absolute; transform:translate(-50%,-50%)` on BOTH markers, but on the
  town-plan SVG `<g>.map-player-svg` that CSS transform OVERRODE the element's
  `transform` attribute (`translate(sx(x) sx(z))`), stranding the marker in the plate
  corner (measured: computed centre (292,680) vs. rendered (11,215) = svg top-left).
  The atlas `.map-player-dom` div was correctly placed but a faint 7 px dot on a busy
  plate. FIX (src/index.css + src/ui/MapOverlay.tsx): scope `position/transform` to
  `.map-player-dom` only (the SVG keeps its attribute transform untouched); enlarge
  both markers and add a pale halo for contrast (atlas ::before 10 px + white
  box-shadow halo, pulsing ::after; town-plan adds a `.map-player-halo` circle behind
  the dot, dot r 4, ring r 10). Verifiable: enrichments.mjs now maps the town-plan
  marker's `transform` through the svg client box and asserts the rendered centre
  follows it (`drift < 12 px`) and is not at the corner (`cornerDist > 40`);
  MapOverlay.test.tsx stays green (dot/ring present, transform pinned). design.md
  unchanged (CLAUDE §7.1 pt.3/pt.9 map marker).

- [x] 110. The Meroë pyramids partially stand in the water (user report). The site
  (src/world/data/landmarks.ts `meroe` lon 33.75 / lat 16.94, kind `pyramids`) sits
  right on the Nile's east bank; the cluster (src/render/landmarks.ts
  `buildMeroePyramids`, spots spread x −2.55…+4.5, z −2.7…+1.5, plus ±0.3 jitter and
  base ~1.0–1.4 → a footprint radius ≈ 6 world units) plus the per-run random yaw
  overlaps the rendered river ribbon. ANCHOR: src/scenes/travel/TravelScene.tsx
  `CulturalLandmarks` items map (~line 1252) computes `w = latLonToWorld(...)` and
  `y = max(0.2, sampleTerrain(...).height)`. FIX: before mounting, nudge the Meroë
  world position away from the nearest river/lake water until the whole footprint
  radius clears water — a river-clearance step mirroring the §4.2 village rule.
  Reuse the world water sampler (look in src/world for an `isWater`/nearest-land /
  river-clearance helper the villages already use); sample the footprint disc
  (radius ≈ 6, so the fix is yaw-independent) and, if any sample is river/lake water,
  shift radially away from the nearest water cell (eastward, onto the desert bank),
  capped. Keep it seed/yaw-independent. If no reusable helper exists, bake a verified
  eastward offset into the meroe coordinate and prove it clears the full ribbon width.
  Only Meroë sits on a river here, but write the clearance generically for any
  cultural landmark. TESTS: a pure test (mirror world.test.ts village clearance) that
  the Meroë mount's footprint disc contains no river/lake water cell across seeds; the
  existing enrichments cultural-landmark check/screenshot shows the pyramids on dry
  land. DOCS: both design.md §4.4 (note the built landmarks keep the §4.2 river
  clearance) and CLAUDE §7.1 pt.25/pt.3 verifiable if the clearance is added there.
  One atomic commit.
  DONE: added a generic `clearedOfRiversBy(lat, lon, clearanceDeg)` in
  data/landmarks.ts (imports `riverDistanceExact`, gradient-climbs off the nearest
  river, eastward flat-gradient fallback) and shift only Meroë at the export by
  `LANDMARK_FIELD_CLEARANCE_DEG` 0.9 (footprint 0.64° + band 0.17° + margin). Meroë
  lands at 33.939°E / 16.700°N (~0.30° / 33 km SE of the raw anchor, still Nubian
  desert). world.test.ts probes the 0.64° footprint rim in 12 directions clearing
  the band (mirrors the Giza test) + on-land + bounded shift; a bird's-eye
  screenshot confirms the field on dry sand clear of the Nile. Vitest 1494.

- [x] 111. The flat BLACK ground blob in the first-person settlement is STILL present
  on real WebGPU hardware — point 106's AO floor (`max(0.4, ao.r)` in Effects.tsx) did
  NOT fix it (user re-confirmed with a localhost screenshot: a sharp-edged flat-black
  arrow shape on the sand). So GTAO over-occlusion is NOT the (sole) cause. This does
  NOT reproduce on the WebGL 2 headless path (the known WebGPU-untestable-headless
  limitation), so the headless suites cannot gate it and isolation needs the user on
  real WebGPU hardware. NEXT STEP (user-gated): via the debug menu, toggle SSAO off,
  TRAA off, and shadows off one at a time and report which removes the blob — that
  names the subsystem. Suspects to bisect once isolated: the cascaded shadow map at a
  near wall base on WebGPU (self-shadow acne/rank collapse), a bloom/grade interaction
  crushing an already-dark ground, the surface-normal MRT on the WebGPU backend, or a
  specific ground material. Then fix backend-neutrally and re-confirm on WebGPU. Keep
  DEFERRED-style pending until the user's isolation narrows it.
  UPDATE (15.07. ~13:55, user screenshot on the DEPLOYED main page, real WebGPU
  160 fps): the shapes are SHARP-EDGED FLAT-BLACK QUADRILATERALS (hourglass/bowtie)
  lying on the ground at building-wall bases — geometry-shaped, NOT a soft
  screen-space AO gradient. Confirmed: Effects.tsx line 106 already floors AO at 0.4
  (deployed), which mathematically cannot reach pure black, so GTAO is not the
  (sole) cause. Buildings cast real sun shadows (CSM castShadow/receiveShadow, no
  decal meshes). Leading hypotheses now: (a) the screen-space GTAO halo at the
  wall↔ground DEPTH DISCONTINUITY multiplying an already sun-shadowed ground toward
  black (hard band along the wall base), or (b) a first-cascade CSM shadow rendering
  pure-black/hard on the WebGPU backend while far shadows stay soft grey. Isolation
  (WebGPU-only, user): toggle SSAO off first — vanishes → (a), reduce GTAO radius/
  raise floor or skip AO at depth edges; persists → (b), the shadow bias/intensity/
  cascade on WebGPU.
  UPDATE 2 (15.07. ~14:30): user ran all three available toggles on real WebGPU —
  SSAO off, TRAA off, half-resolution shadows — NONE change the black shape. So it
  is not post-AO, not temporal-AA, and not shadow-map-resolution-sensitive. But the
  half-res test is NOT conclusive for shadow-vs-not (a cast shadow's SHAPE is
  resolution-independent), so a decisive test needs shadows fully OFF — which had no
  toggle. Added a "Sun shadows" debug checkbox (ui store `shadowsEnabled` default on
  → the place-scene directional light's `castShadow`; DebugMenu + de/en label +
  ui.test) so the user can turn cast shadows off entirely: vanishes → it IS the
  shadow (fix shadow.intensity/ambient fill so shadowed ground keeps the hemisphere
  fill instead of going black); persists → geometry/material rendering black on the
  WebGPU backend (dig into the ground/building node material).
  UPDATE 3 (15.07. ~15:05): user confirmed sun-shadows OFF does NOT remove the
  blob → shadow definitively ruled out (after SSAO + TRAA). Side-finding: toggling
  sun-shadows off→on blackened the whole ground (a runtime castShadow flip left the
  WebGPU shadow pipeline broken) — fixed by remounting the light on the toggle
  (751fcc8). Blob is now isolated to a WebGPU-only material/geometry render. Next
  diagnostic (user-approved): a "Flat ground (debug)" toggle (ui `groundDebugFlat`
  → the place-scene ground uses a plain MeshStandardMaterial, no TSL surface
  structure/normal). Deployed; the user tests on WebGPU — blob gone → the TSL
  ground shader (then fix it precisely); blob stays → a building/geometry, isolate
  further.
  ROOT CAUSE + FIX (15.07. ~15:20, user confirmed "Flat ground" ON removes the blob
  / OFF brings it back on WebGPU → it IS the ground node material): createGroundMaterial's
  colorNode mixed a "patch" tone by `cells.oneMinus().pow(3)` where `cells` is
  `mx_worley_noise_float(...)` — Worley returns a cell DISTANCE that can exceed 1, so
  `oneMinus()` goes negative, and `pow(negative, 3)` is NaN on WGSL/WebGPU (pow =
  exp(y·log(x)), log of a negative = NaN). The NaN propagated to a flat-black ground
  patch; the WebGL 2/GLSL pow handled the negative base without NaN, so headless never
  showed it (the WebGPU-untestable-headless limitation). FIX (materials.ts): clamp
  `cells` to [0,1] so `oneMinus()` stays non-negative and pow is well-defined —
  backend-neutral, no WebGL 2 look change (verified by screenshot; material tests
  30/30). The "Flat ground (debug)" and "Sun shadows" toggles added during isolation
  stay as debug features. Headless cannot gate the WebGPU fix, so the user confirms on
  hardware (blob gone with Flat ground OFF). design.md unchanged
  (render-quality safeguard; no new CLAUDE §7.1 point).

- [x] 116. At game start it takes very long before the FIRST read-aloud (user report;
  a consequence of point 114). 114 pre-synthesizes the WHOLE journal entry before
  playback to guarantee gapless audio on the sub-realtime WASM path, but that means the
  start entry waits for the model cold-load PLUS every segment's synthesis before the
  first sound. FIX (src/journal/speech.ts): start playback after a LEAD buffer of ~4 s
  of audio (or all segments if the entry is shorter) instead of the whole entry, while
  the worker keeps synthesizing the rest ahead. The lead cushions the sub-realtime
  synthesis so playback rarely starves, but the first sound comes after only the cold
  load + the first ~4 s of synthesis. `onSpeaking` still fires on the first real audio;
  a failed/cancelled segment resolves to null and is skipped. Verifiable: voice.mjs
  stays green (narration produces audio, speaking state without a click, rAF liveness
  through the cold load). design.md unchanged (CLAUDE §7.1 pt.19). One atomic commit.
  DONE: speech.ts now fires all syntheses up front, buffers a ~4 s LEAD (or all if
  the entry is shorter), starts playback, and awaits the remaining segments as it
  reaches them. Fast first sound, and the lead cushions the sub-realtime synthesis
  against stutter. voice.mjs green (speaking state, auto-narration without a click,
  rAF liveness max 17 ms through the cold load, 0 console errors); journal Vitest green.

- [x] 112. Audio balance (user request): footsteps twice as loud, and ALL other
  ambient sounds half as loud — including the "ding-dong" (the interaction/enter
  chime). ANCHOR: src/systems/ambience.ts (footstep `emitFootstep`, the ambient bed,
  the ding-dong chime, the §19.1 proximity calls) under the single ambience volume
  (default 0.1, design.md §20/§21). FIX: introduce calibratable balance factors in
  src/config/balance.ts — `footstepVolume` (×2 relative to now) and `ambientVolume`
  (×0.5, covering the bed, UI/interaction chimes incl. the ding-dong, and proximity
  calls) — applied under the existing master ambience volume, and debug-editable per
  CLAUDE §2/§21. The ding-dong belongs to the HALVED set, NOT the footstep set.
  TESTS: assert the two factors (footstep 2, ambient 0.5) in a pure/unit test if the
  audio graph exposes gains; settings.mjs checks the debug fields exist and edit at
  runtime. Any new debug labels in de+en. DOCS: design.md §20/§21 audio + CLAUDE §7.1
  pt.20 verifiable. One atomic commit.
  DONE: two sub-buses under the master (ambience.ts) — footstepBus (×2) and
  ambientBus (×0.5); every layer/emitter routes through ambientBus, footsteps
  through footstepBus, so the ding-dong (an ambient emitter) is halved
  automatically with no per-sound change. Factors footstepVolume 2 / ambientVolume
  0.5 in balance.ts, both debug-editable (two new NumberFields + de/en labels +
  types.ts). DebugMenu.test covers render+write-through; a browser smoke confirmed
  the graph builds with 0 console errors. Vitest 1496, build/lint clean.

- [x] 113. In the bird's-eye/travel view, walking into a tree leaves the traveller
  stuck inside it — he cannot get out (user report). CLAUDE §7.1 pt.4/pt.12 already
  require non-pinning collision with trees/animals ("steering away moves him clear — a
  collision never pins the traveller"), so this is a bug against the acceptance rule.
  ANCHOR: src/systems/movement.ts swept obstacle resolve (pure-tested in
  src/systems/movement.test.ts: "the away/tangent moves from a resting contact stay
  free", the no-tunnelling case) and the travel-scene tree collider registration
  (src/scenes/travel/*, the flora/obstacle list feeding the resolver). HYPOTHESIS: the
  animal path already resolves correctly (enrichments has the "driving into a pinned
  animal blocks at its body edge … steering away moves him clear, never pins" live
  check), but trees either are not routed through the same swept resolve (a hard block
  that traps) or their collider radius/placement leaves the traveller inside with no
  free escape vector. FIX: route tree collisions through the same swept obstacle
  resolve as animals so an away/tangent step from a resting contact is always free, no
  tunnelling. TESTS: extend movement.test.ts with a tree-sized static obstacle
  (resting contact + away move stays free, tangent free, no tunnelling on a fast step);
  add a live check in enrichments.mjs mirroring the animal one (pin a tree on the
  player, assert a subsequent away-move increases clearance and never pins). design.md
  §11/§19 unchanged (already requires it). One atomic commit.
  DONE: reproduced a real PIN the existing tests missed — two OVERLAPPING tree
  bodies whose radial push-outs point opposite, trapping the traveller in their
  lens (the hard clamp swallowed the escape direction). Fix (movement.ts
  resolveTravelMove): on contact, clamp to the boundary (no tunnelling) then SLIDE
  the leftover move along the surface (drop only the inward normal component), and
  a final iterated `pushOutOfCircles` de-penetration so the result never rests
  inside any body. Trees already share this resolver with animals, so the live
  animal-pin enrichments check covers the code path; the overlapping-obstacle case
  is a new pure test in movement.test.ts. All 30 movement tests green, Vitest 1497.

- [x] 114. Journal read-aloud STILL stutters after point 108 (user re-report) —
  a bit is spoken, then a long pause, then more. Point 108 pipelined the whole
  worker queue, but on the q8/WASM path (point 100) Kokoro synthesis is SLOWER
  THAN REALTIME, so any finite lookahead is eventually starved mid-entry and the
  gap returns. FIX (src/journal/speech.ts): pre-synthesize the WHOLE entry before
  playback (`Promise.all` over all segments, each `.catch(() => null)`), then play
  the segments back-to-back — journal entries are short, so this costs only a
  little initial latency and then guarantees gapless playback. `onSpeaking` still
  fires when the first audio actually starts; a failed/cancelled segment resolves
  to null and is skipped. Verifiable: voice.mjs stays green (narration produces
  audio, the speaking state switches without a click, the rAF liveness gate holds
  through the cold load — the worker synthesizes off the main thread). design.md
  unchanged (CLAUDE §7.1 pt.19). One atomic commit.

- [x] 115. The opened map should keep the SAME bottom gap to the bottom-row
  buttons as the journal does (user request). Currently `.journal` sits at
  `bottom: 56px` (src/index.css) while `.map-overlay` sits at `bottom: 88px` —
  the map was lifted higher to clear the WRAPPING inventory bar (bottom-left,
  where the map is), whereas the journal (bottom-right) only clears the
  camp/map/journal button row. FIX: bring the map's bottom gap in line with the
  journal's (target `bottom: 56px`), BUT the enrichments point-89 check asserts the
  map overlaps neither the inventory bar nor the bottom-right buttons — so verify
  at 56px the plate still clears the wrapping inventory bar; if it would overlap,
  reconcile (e.g. match the journal's gap while keeping just enough clearance, or
  confirm the inventory bar no longer reaches that high). ANCHOR: src/index.css
  `.map-overlay { bottom: … }` vs `.journal { bottom: 56px }`. TESTS: the existing
  enrichments.mjs point-89 non-overlap check (`overlapInv`/`overlapJournalBtn`
  false) must stay green at the new offset; add an assertion that the map's bottom
  gap equals the journal's within a small tolerance if both are open-comparable.
  design.md §17.4 (map/journal placement) — update the note if the offset rule
  changes. One atomic commit.
  DONE: `.map-overlay` bottom 88px → 56px (matches `.journal`); the single-row
  inventory bar clears it. enrichments now measures the map's bottom gap and
  asserts it matches the journal (~56px) alongside the kept non-overlap checks —
  measured 54px, overlapInv/overlapJournalBtn false, suite green.

- [x] 117. Read-aloud: fast start but stutters again mid-entry (user report after
  116; "was better at some point — maybe an earlier optimization broke it"). Correct:
  the root is point 100 (TTS moved from WebGPU/fp32 to q8/WASM to stop the ~15 s
  cold-load GPU freeze — a locked CLAUDE.md §3 decision, so WebGPU is out), and WASM
  synthesis is SLOWER THAN REALTIME. 114's whole-entry pre-buffer was gapless but
  slow to start; 116's fixed 4 s lead started fast but starved mid-entry on longer
  notes. A synth-timing probe also showed the dominant START cost is the model
  COLD LOAD (~seconds), not the buffer. FIX (two parts):
  (a) PRE-WARM the model — a `warmup` message to ttsWorker loads the engine without
  synthesizing; `warmupSpeech()` is called ~3 s after App mount (deferred so it does
  not fight the initial asset load; only when the language has a voice), so the first
  narration only synthesizes. Loading on WASM never touches the GPU process, so the
  game keeps rendering (point 100).
  (b) ADAPTIVE lead (speech.ts) — instead of a fixed 4 s, measure the LIVE synthesis
  rate and estimate the entry length from the buffered segments, then start once the
  buffer covers the drain (`bufferedAudio ≥ remainingAudio × (1 − synthRate) + 0.5`).
  A short/fast note starts almost at once; a long/slow one gets just enough cushion to
  play gapless — and it self-tunes to the machine's load (the user's synth benchmark
  was skewed by other CPU use, so a hardcoded rate would be wrong). Verifiable:
  voice.mjs green (narration, speaking state without a click, rAF liveness max 17 ms
  through the cold load, 0 console errors); journal Vitest green. The real
  start-speed/no-stutter balance is a USER check on hardware (headless replays the
  cached weights, so it cannot measure real synth latency). design.md unchanged
  (CLAUDE §7.1 pt.19). One atomic commit.
  FINAL RESOLUTION (15.07. ~17:15): the WASM tuning (warmup + adaptive/pessimistic
  buffer) still left a slow start (14 s) and a mid-entry hang — the fundamental
  limit is that WASM synthesis is sub-realtime, and no buffer wins both fast-start
  and gapless for long entries. The "much better" the user recalled was the
  pre-point-100 WebGPU voice (faster than realtime). Presented the trade-off and
  the user chose to RESTORE WebGPU (accepting the one-time cold-load stall). So this
  point ends by REVERSING point 100: ttsWorker loads WebGPU/fp32 on Chromium with a
  WASM/q8 fallback (main-thread `preferWebgpu` decision restored); speech.ts drops
  the buffering tricks for a plain "fire all, play as ready" pipeline (WebGPU is
  fast enough); the ~1.2 s-after-mount warmup now FRONT-LOADS the WebGPU cold-load
  stall to game start; CLAUDE §3 rewritten to document the WebGPU-primary decision
  and the reversal. Headless forces WASM via `window.__ttsForceWasm` (voice.mjs +
  handwriting.mjs addInitScript); voice 6/6 and handwriting 11/11 green, journal
  Vitest 10/10, build/lint clean. The WebGPU voice quality/speed is a USER check on
  Chromium hardware (headless has no WebGPU adapter).

- [x] 118. Calf predation / living-shield gets STUCK and never resolves (user
  screenshots, South savanna): during a lion hunt on a calf, the parent runs wildly
  BACK AND FORTH at the lion instead of committing to the sacrifice, the calf barely
  moves (it should flee), NOBODY is ever caught/eaten, the lion eventually gives up
  and walks off — and the vultures that spawned for the kill circle the whole time
  and STAY (no kill → no carcass → their despawn condition never fires). Expected
  (design.md §19.8, CLAUDE §7.1 pt.12): the hunted calf visibly flees (slower than
  its hunter); a parent that reaches the predator interposes as a LIVING SHIELD over
  visible real time and is eaten IN THE CALF'S PLACE before any catch (calf escapes);
  a parent that only got close by the window's end is eaten alongside the calf; the
  hunt ALWAYS RESOLVES in a kill (parent or calf), and the kill's vulture flock then
  descends/consumes and leaves. ANCHORS: src/scenes/travel/Wildlife.tsx (the LionHunt
  calf branch — the shield/catch/parent-eaten-in-place state machine), the
  pure behaviour in src/scenes/travel/wildlifeBehavior.test.ts, the vulture
  spawn/despawn tied to a kill/carcass (search for the vulture ring + kill-flock
  logic), and the parent-oscillation stabiliser (points 1/30 fixed a ~90° flip-flop
  — the parent here flip-flops AT the lion, so the same stabiliser may not cover the
  shield-approach). LIKELY causes to check: (a) the catch/sacrifice condition is
  gated on the parent being within a reach it never stably enters because it
  oscillates → add a commit/hysteresis so the shield-in-reach resolves; (b) the calf
  flee is disabled/zeroed while shielded so it stands still and the hunt stalls; (c)
  the lion's give-up (patience) fires before the shield resolves, leaving the calf
  alive AND the vultures orphaned; (d) the vulture despawn is conditioned on a
  carcass that never spawns → also cull/despawn the hunt's vultures when the hunt
  ENDS without a kill (give-up), so they never circle forever. FIX so the sequence
  always terminates: either a kill (parent-shield or calf) or, on give-up, the
  vultures leave. TESTS: extend wildlifeBehavior.test.ts / the LionHunt path so a
  calf hunt with a reaching parent resolves in the parent's sacrifice within the
  window (calf survives), a late parent yields both caught, and a given-up hunt
  removes its vultures; a live check in scripts/verify/enrichments.mjs (or the
  wildlife suite) that a forced calf hunt terminates (no perpetual circling). All new
  journal text (if any) in both languages with voice markup. design.md §19.8 /
  CLAUDE §7.1 pt.12 unchanged (this restores the specified behaviour). One atomic
  commit. (Reported 15.07.2026; worked in the new batch after the Closing + tags.)
  ROOT CAUSE + FIX (15.07.2026, via a __lionHunt/__wildlife scene repro): the
  chase-SHIELD/sacrifice was NOT the bug — a forced calf hunt resolved cleanly in
  two configs (parent taken at PARENT_TAKE_DIST, calf escapes). The real culprit is
  the parent GUARD branch (Wildlife.tsx ~1663): its trigger was `lionActive`, which
  is `mode === 'chase' OR 'feed'`. So when a lion FED on other prey right beside a
  calf, the parent kept running to a guard station that followed the feeding lion —
  orbiting it forever (repro: step-reversal rate 0.23, never resolves), while the
  calf (not the hunt's victim) neither fled nor was caught, matching the user's
  "parent runs wildly at the lion, nobody eaten, vultures circle" exactly (the
  vultures were the lion's real kill-flock, correct). FIX: gate the guard to a
  HUNTING lion only (`LION_STATE.mode === 'chase'`), so beside a feeder the family
  flees like any prey; and compute the guard station via the existing `blockHeading`
  (offset GUARD_STANDOFF), whose hold-zone stops the per-frame re-chase oscillation.
  Repro after the fix: reversal rate 0.23 → 0.01, and on the lion's feed the family
  flees (parent–lion distance climbs steadily). No separate vulture cull needed —
  the kill-flock is correctly tied to the feed/leave/remnant lifecycle and clears
  once the lion finishes. Verifiable: a new enrichments live check asserts a parent
  beside a feeding lion does not saw-tooth and moves away (flees); the guard reuses
  the already-pure-tested blockHeading. design.md §19.8 / CLAUDE §7.1 pt.12 unchanged.

- [x] 119. A parent sacrifices itself to the elephant that trampled its calf.
  Today a calf trampled by an elephant simply dies and its parent goes on grazing
  (it even DODGES the elephant like any other prey). Wanted (user, 15.07.2026):
  when a juvenile is trampled to death by an elephant, the parent throws itself
  before that elephant's feet and lets itself be trampled too — the same grief
  logic that already exists at a waterfall, where a calf swept over sets
  `plungeTo` on the parent, which rushes after it and dies (§19.8). Both die; this
  is grief, NOT a rescue (unlike the lion shield, nobody is saved).
  ANCHORS (all in `src/scenes/travel/Wildlife.tsx` unless noted) — mirror the
  existing `plungeTo` feature at every one of its integration points:
  (a) Type field: add `trampleTo?: { x: number; z: number }` next to `plungeTo`
      (~line 139) plus `grief?: number` (the resolve backstop), documented like
      its neighbours.
  (b) Tunables next to `PLUNGE_SPEED`/`PLUNGE_REACH` (~line 345), commented as
      calibratable: `TRAMPLE_GRIEF_SPEED` (start 6.5, matching
      `PARENT_CHARGE_SPEED` — the parent RUSHES) and `TRAMPLE_GRIEF_SECONDS`
      (start 12) as the window after which an unresolved grief clears.
  (c) Trigger: in the trample kill inside the render loop (~line 1757-1766, the
      `Math.hypot(a.x - ex, a.z - ez) < TRAMPLE_RADIUS` branch), when the victim
      is a calf with a living parent (`a.young && a.parent && !a.parent.dead`),
      set `par.trampleTo = { x: a.x, z: a.z }`, `par.grief = TRAMPLE_GRIEF_SECONDS`,
      `par.child = undefined`, `a.parent = undefined` — exactly the link teardown
      the waterfall branch does (~line 1044-1049).
  (d) Movement pre-pass over the FULL herd lists (like the predation loop at ~935
      and the water loop at ~1013, so it resolves off the rendered slice too), for
      every non-elephant species (calves exist for ALL non-shoreline species, see
      ~line 617 — not just `CALF_HUNT_SPECIES`): for an animal with `trampleTo`,
      pick the nearest LIVING elephant from `herds.elephant` (the parent charges
      the elephant's moving FEET, not the stale death spot), steer to it at
      `TRAMPLE_GRIEF_SPEED` and refresh `trampleTo` to its live position (the pose
      in (f) faces it). Count `grief` down by dt. Do NOT write a second kill: the
      EXISTING trample check in (c) kills the arriving parent (dead + stain) —
      that IS "letting itself be trampled" and keeps one code path.
  (e) STUCK-RISK (the lesson from point 118 — an unresolved drive that never ends
      is exactly the bug just fixed): the grief MUST always resolve. Clear
      `trampleTo`/`grief` when no living elephant exists (all despawned/streamed
      out) or when `grief` reaches 0, returning the parent to normal behaviour.
      Never leave it charging a target that cannot kill it.
  (f) Exemptions + pose, mirroring `plungeTo` at each site: add `trampleTo` to the
      body-separation exempt list (~line 1154) and to the water/steering skip
      (~line 1232, `if (a.dead || a.inWater !== undefined || a.rescued ||
      a.plungeTo) continue`); add a pose branch beside the `plungeTo` one (~line
      1553) that holds the sim position, faces `trampleTo` and sets
      `familyHeld = true`. The `familyHeld` flag is LOAD-BEARING: the elephant
      dodge at ~line 1722 is gated on `!familyHeld`, so without it the grieving
      parent would flee the very elephant it means to die under.
  TESTS (per the hybrid architecture):
  (g) Pure (`src/scenes/travel/wildlifeBehavior.test.ts`): extract the target
      choice as a small pure helper in `wildlifeBehavior.ts` (e.g.
      `griefTarget(x, z, elephants)` → nearest living elephant position or
      `null`), and test: nearest of several is chosen, a dead elephant is
      ignored, and an empty/all-dead list returns `null` (the (e) resolve path).
  (h) Live (`scripts/verify/enrichments.mjs`, next to the existing
      'Elephant tramples a smaller animal (dead over a stain)' check at ~line 739
      and the plunge checks at ~line 2032): inject an elephant onto a calf, then
      assert the calf dies trampled, its parent CLOSES on the elephant (distance
      shrinks — it does not dodge away) and ends up dead with a stain of its own.
  DOCS: design.md §19.8 (add the trample sacrifice to the calf drama — grief, both
  die, distinct from the lion shield's rescue) and CLAUDE.md §7.1 pt. 12 under
  "Calves and family life" (add the verifiable condition, naming the suites). No
  journal text (ambient wildlife is not journaled). One atomic commit.
  (Reported 15.07.2026.)

- [ ] 120. Seasons and region-typical weather (large ambience extension).
  Wanted (user, 15.07.2026): the date should drive SEASONS, each region showing
  the weather typical for it at that time of year (e.g. rain; snow where it
  genuinely occurs), and plants AND animals must be visibly affected by it.
  Today the world is season-less: one fixed look per biome, no weather.
  (a) DONE (15.07.2026) — RESEARCH: `docs/climate-1890.md`, sourced and with the
      modern-normals-retro-applied caveat marked per claim. Findings that CHANGE
      the design and must be honoured by (b)-(e):
      * The Sahel around 1890 was **WET, not dry** — the game window sits inside
        the 1870-1895 humid period; the drying starts ~1895. Render the Sahel
        greener than any modern reference, and Lake Chad at its ~28,000 km²
        period extent (vs <1,500 today).
      * Equatorial glaciers stood 8-12x today's (Kilimanjaro ~12-20 km² vs 0.98).
        Their break-up happened INSIDE the window (early 1890s).
      * Do NOT drive rain off the convergence line's latitude: the rain lags
        400+ km SOUTH of it, or the model rains on the Sahara every August.
      * East Africa is NOT rain-belt-derivable — hard-code its bimodal MAM/OND.
      * Cairo (the start port) is SAHARAN, not Mediterranean: ~25 mm/yr, Jun-Sep
        absolutely rainless. A bare 32°N gate is wrong in both directions.
      * Snow ONLY above the 4,500-4,800 m equilibrium line (Kilimanjaro, Mt
        Kenya, Rwenzori) plus seasonal High Atlas (Nov-Apr) and Drakensberg
        (Jun-Aug). Savanna snow is physically impossible; hail is the only
        defensible white ground at low altitude.
      * The Nile flood is unregulated in 1890 (no dam until 1898): rise from
        early June, peak at Cairo in OCTOBER — the most visible cycle in the
        game, right at the start port.
  (a2) RESEARCH STILL OPEN — the research phase is NOT finished with (a). (a)
      covered the CLIMATE only; the settlement requirement (g) needs its own
      research into HOW THE SEASONS REACH THE PEOPLE (user, 15.07.2026 — my
      first cut wrongly narrowed this to clothing alone). Document it in the
      repo like the climate: sourced, caveats marked, and depicting the peoples
      of design.md §3.2/§4.5 accurately and with respect, never as costume
      cliché or a generic "African village". Cover, per region and people:
      * CLOTHING ~1890 and how it changed with season/temperature — the same
        person wearing more in the cold or dry-dusty season (harmattan wraps,
        highland cloaks) — plus what the materials actually were.
      * SEASONAL WORK: the agricultural calendar (when the ground is broken,
        sown, weeded, harvested, stored) tied to the rain months of (a); who is
        even present — Sahel/Maasai herders follow the rains, so a village can
        stand seasonally empty or full; fishing seasons on the rivers/lakes.
      * SEASONAL DAILY LIFE: what is out on the market stalls in which season,
        when fires burn and how much (this drives the (g) fire-glow), indoor vs
        outdoor life, roof/wall maintenance before the rains, water fetched from
        near vs far as the waterholes shrink.
      * The 1890-specific overlay: the rinderpest panzootic (a) records was
        destroying 80-90% of cattle across East/Central/West Africa exactly in
        the game window — a cattle-keeping people in 1890-95 is not living a
        normal year. Establish whether to depict this; it is design content, so
        FLAG it for the user rather than deciding it here (CLAUDE §2).
  (b) Model: derive a season from the in-game date + the region's latitude
      (`design.md` §3.2 regions), and from (season, region) a weather state.
      Central, calibratable values in `src/config/balance.ts`, debug-editable
      per CLAUDE §2 (a debug selector to force season/weather for testing).
  (c) Visuals: region-typical precipitation and sky (rain, harmattan haze,
      summit snow), fitting the §2.7 lighting/§19.9 dressing pipeline; TSL, no
      raw GLSL/WGSL, both renderer backends.
  (d) Plants: the vegetation and dressing of §19.9 respond — green/lush in the
      wet season, dry/sparse in the dry season.
  (e) Animals: the §19.2-§19.8 wildlife responds (e.g. presence/behaviour at
      water in the dry season). Must not break the existing wildlife
      invariants (streaming, body separation, water-edge rules, the dramas).
  (f) Gameplay coupling is OPEN and must be decided before implementing: does
      weather touch movement/health (§6/§11) or stay pure ambience like the
      rest of §19? Ambience-only is the safer default; flag it as a question
      rather than inventing a mechanic (CLAUDE §2 forbids design invention).
  (g) INSIDE SETTLEMENTS TOO (user, 15.07.2026) — the weather must not stop at
      the bird's-eye view. In the first-person settlement scenes (§2.6):
      * the sky/skyline carries the season's weather (the §2.5 panorama and the
        §4.4 skyline landmarks included — e.g. Kilimanjaro's ice per (a));
      * snow lies ON THE GROUND where snow is real per (a) — which for the
        settlements means essentially nowhere: every village/port sits far below
        the equilibrium line, so this is the High Atlas edge case at most. Do
        NOT put snow in a savanna village; if no settlement qualifies, say so
        in design.md rather than faking it;
      * overcast/dust dims the light — and the §19.10 fire glow reads MORE
        strongly for it (a deliberate, welcome consequence: less ambient light
        means the firelight carries). Route this through the §2.7 lighting
        pipeline, not a separate hack;
      * INHABITANTS DRESS FOR THE TEMPERATURE, in their region's real ~1890
        clothing per (a2) — the same figure wears more in the cold season.
        Anchors: `src/render/figures.ts` (the inhabitant builds) and the
        settlement walkers (`__placeWalkers`).
  TESTS: pure (season/weather derivation from date+lat+lon — every region across
  the year; snow ONLY above the equilibrium line and never in savanna; the Sahel
  reading wet in the 1890s window; Cairo rainless Jun-Sep) in a new
  `src/systems/season.test.ts`, plus the clothing choice per (region,
  temperature) as a pure mapping; live (`scripts/verify/enrichments.mjs` for the
  travel view, `scripts/verify/polish.mjs` for the settlement) that a forced
  season/weather renders, the plant/animal response is observable, the
  settlement sky/light changes and the inhabitants change dress — with
  screenshots of both views in two contrasting seasons.
  DOCS: design.md (new subsection under §19 for seasons/weather, referenced
  from §19.9 and §2.6/§2.7 for the settlement side) and CLAUDE.md §7.1 (new
  acceptance point with its verify suites).
  SIZE: this is large — split into several atomic commits along (a2)…(g) rather
  than one, each with its own tests/docs. (Reported 15.07.2026.)

- [ ] 121. Family drama: the vigil at the calf's carcass. The parent that did
  not reach the predator in time today simply resumes grazing beside its eaten
  calf. Wanted (user, 15.07.2026): it stays at the carcass, drives the vultures
  off, and — left alone by its herd — is taken there by a later predator: both
  a sacrifice and a death of grief, at the spot where its young fell.
  ANCHORS (`src/scenes/travel/Wildlife.tsx`): the predation resolution loop
  (~935) already kills a too-late parent (`PARENT_TOO_LATE_DIST`); the parent
  that stayed clear keeps a dead `a.child` and falls back to normal behaviour —
  that is the gap. `LION_STATE.mode` runs `chase`→`feed`→`leave`; the kill flock
  and the ground `scavenger` (~1390+) work the carcass; `dissolve`/`gone` retire
  it. Mirror the `trampleTo`/`grief` feature (point 119) at each of its
  integration points (type field, pre-pass, `inDrama` list, steering skip, pose
  branch with `familyHeld = true`).
  (a) State: `vigil?: { x: number; z: number }` + reuse a countdown like `grief`
      (`VIGIL_SECONDS`, start 45, calibratable next to `TRAMPLE_GRIEF_SECONDS`).
      Set it in the resolution loop when a calf dies by predation and its parent
      is alive and did NOT charge (i.e. outside `PARENT_TOO_LATE_DIST`).
  (b) Behaviour: the parent walks to the carcass and holds there facing it
      (`familyHeld = true`, so it does not flee the lion or dodge elephants).
  (c) Vultures: while the parent stands vigil, no vulture may LAND on that
      carcass (the flock keeps circling, the ground scavenger does not commit) —
      gate the landing on a live vigil-keeper within a small radius.
  (d) The death — DECIDED BY THE USER (15.07.2026), and the decision is
      deliberate, not an oversight: **the vigil-keeper stands and is eaten. No
      flight attempt at all.** The user asked whether it just lets itself be
      taken; I argued against it as unnaturalistic (real ungulates do run from a
      charging lion) and proposed a "flees, only too late" reaction-distance
      cut. **The user considered it and chose the standing version anyway. Do
      not re-litigate this, and do not "fix" it into a flee-with-penalty later.**
      The reasons it is right for THIS game: §19.8's existing register is already
      exactly this — the waterfall plunge and the trample-throw (point 119) both
      have a parent follow its calf into death with no survival logic whatever.
      A vigil-keeper that bolts would be the odd one out, not the realistic one.
      Grief unto death is the established emotional grammar here.
      So: while a vigil is active the parent does not flee — it holds at the
      carcass (`familyHeld = true`, which already suppresses both the lion flee
      and the elephant dodge, cf. point 119's pose branch). A predator that
      reaches it takes it via the EXISTING hunt kill (dead, stain, `lionFed`) —
      never a second kill path. The (e) resolve guard still applies: if no
      predator ever comes, the vigil ends on its timer and the parent rejoins the
      herd, so this is a chosen death, not a stuck animal.
  (e) RESOLVE ALWAYS (the point-118 lesson): the vigil ends when the carcass is
      gone/dissolved or `VIGIL_SECONDS` runs out, and the parent rejoins the
      herd. Never a drive with no exit.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`) for any extracted
  helper (e.g. the vigil-blocks-landing predicate); live
  (`scripts/verify/enrichments.mjs`): after a calf is eaten with the parent held
  clear, the parent CLOSES on the carcass and holds there, no vulture lands
  while it stands, a predator pinned on it kills it there, and the vigil clears
  once the carcass is gone (no stuck keeper). DOCS: design.md §19.8, CLAUDE.md
  §7.1 pt. 12. One atomic commit. (Reported 15.07.2026.)

- [ ] 122. Family drama: the swollen river of the rains, and drowning.
  DEPENDS ON point 120 (needs the season). Wanted (user, 15.07.2026): in the wet
  season the current turns the existing calf-in-water accident deadly — and,
  explicitly added by the user, ANIMALS DROWN when a current carries them too
  long. Today nobody drowns: `STRUGGLE_SELF_RESCUE` (25 s) always lets an unaided
  calf clamber out, and only a waterfall kills (`FALLS_DEATH_RADIUS_DEG`).
  SCOPE GUARD: do NOT add herd river-crossings. design.md §19.5/§19.7 rule that
  no animal STANDS in river or lake water (drinkers reach the bank, bathers wade
  one step); a fording herd would break that invariant and its tests. The season
  modulates the EXISTING accidental entry (a gambol-bout at the bank, ~line 1013
  loop), it does not create a new way in.
  ANCHORS (`src/scenes/travel/Wildlife.tsx`): the water drama loop (~1013),
  `CALF_DRIFT_DEG` (0.06), `STRUGGLE_SELF_RESCUE` (25), `WADE_SPEED`,
  `RESCUE_REACH`, `RETURN_SPEED`, `inWater`, `rescued`, `plungeTo`; `riverFlow`
  for the current.
  (a) Season coupling: a wet-season factor on the drift (and on the falls' pull),
      central and debug-editable in `src/config/balance.ts` per point 120.
  (b) DROWNING (the user's addition): an animal carried by the current for longer
      than `DROWN_SECONDS` (start 30, calibratable) dies — drowned, `lionFed`
      (the river takes it; no scavenger lands on open water, as the waterfall
      victims already do). This holds for ANY animal, not only calves: a parent
      that waded in and cannot get out drowns too.
      Reconcile with `STRUGGLE_SELF_RESCUE`: the self-rescue is what a CALM water
      allows; in a strong current it must not fire, otherwise nothing ever
      drowns. Gate the self-rescue on the local `riverFlow` strength — weak flow
      clambers out (today's behaviour, unchanged), strong flow drowns.
  (c) Consequence for the family: with the flood drift high the parent's rescue
      genuinely fails sometimes — the calf is carried past its reach and drowns,
      and a parent that stays in too long drowns beside it.
  TESTS: pure — the drown/self-rescue decision as a helper over (flow strength,
  seconds in water) in `src/scenes/travel/wildlifeBehavior.test.ts`: calm water
  self-rescues and never drowns, strong current drowns at the threshold, and the
  boundary is exact. Live (`scripts/verify/enrichments.mjs`): with a forced wet
  season a calf in a strong current drowns (dead, not rescued), and in the dry
  season the SAME setup still clambers out (the existing check must stay green).
  DOCS: design.md §19.8 (the self-rescue sentence changes — say plainly that a
  long-swept animal drowns) and CLAUDE.md §7.1 pt. 12/21. One atomic commit.
  (Reported 15.07.2026.)

- [ ] 123. Family drama: the drying waterhole of the dry season.
  DEPENDS ON point 120 (needs the season). Wanted (user, 15.07.2026): in the dry
  season a calf gets mired in the mud of a shrinking waterhole; the parent will
  not leave its side while the herd moves on, and the predators that gather at
  the last water take it there. Documented real dry-season behaviour.
  ANCHORS: the lake surfaces and their beds (§11.3, the water/lake sampling used
  by the water drama loop ~1013); the water-edge rules
  (`src/scenes/travel/waterEdgeRules.ts`) that keep animals to the bank; the
  hunt (`LION_STATE`); the family pose/`familyHeld` chain (~1550).
  (a) A `mired?: number` state on a calf at a lake bank in the dry season (a
      rare per-bout roll, balance-valued): it is stuck — it struggles in place,
      does not drift (unlike the river), and cannot free itself.
  (b) The parent stands beside it (`familyHeld = true`) instead of following the
      herd; it does not flee an approaching predator.
  (c) Predators concentrate at the remaining water in the dry season (a spawn/
      target bias, balance-valued) so the pair is genuinely found.
  (d) Outcome: the predator takes the calf and then the parent (reuse the
      existing kill paths, no new one) — or, if none comes, the mire releases
      after `MIRE_SECONDS` and both rejoin (RESOLVE ALWAYS, point-118 lesson).
  (e) The mired calf must not violate the standing-in-water rule's TESTS: it is
      a §19.8 water drama like the struggle, so add it to the same exemption the
      dramas already hold.
  TESTS: pure for the mire roll/release decision; live: with a forced dry season
  a mired calf holds position, its parent stands beside it and does not flee a
  pinned predator, both are killed there, and without a predator the mire
  releases. DOCS: design.md §19.8, CLAUDE.md §7.1 pt. 12. One atomic commit.
  (Reported 15.07.2026.)

- [ ] 124. Family drama: the giraffe mother's kick.
  Wanted (user, 15.07.2026): the iconic image — a giraffe cow driving a lion off
  her calf with her kicks. Today giraffes are not prey at all: `PreyKind` (~212)
  is zebra/wildebeest/antelope/warthog, so no hunt ever touches a giraffe.
  ANCHORS (`src/scenes/travel/Wildlife.tsx`): `PreyKind` (~212), `PREY_SCALE`
  (~214), `PREDATOR_PREY` (~230), `REGION_PREY` (~239), `CALF_HUNT_SPECIES`
  (~339); the shield/charge resolution (~935-1003); `src/render/fauna.ts` for
  the giraffe build (the calf baby-schema already exists).
  (a) Make the giraffe huntable by the LION ONLY (realistic: cheetah/leopard/
      hyena do not take giraffe) — add it to `PREDATOR_PREY.lion`, `PreyKind`,
      `PREY_SCALE` and the region pools where giraffes live, and to
      `CALF_HUNT_SPECIES` so the calf dramas apply.
  (b) The kick: a giraffe parent that reaches the hunter does NOT die by default
      — it drives the hunt off (abort the chase, the lion leaves). Render it as
      a visible kick (a brief hind-leg strike pose), not a silent stop.
  (c) Keep the danger real: the kick succeeds by a balance-valued chance
      (start high for the giraffe, e.g. 0.75); a failed kick falls back to the
      existing sacrifice (the parent is taken). Coordinate this with point 125 —
      125 owns the general chance mechanic, 124 only gives the giraffe its own
      high value and its kick pose. If 125 lands first, reuse its helper.
  (d) Check the existing invariants still hold with a new prey species: region
      pools (every hunted species fits the region), body separation, streaming.
  TESTS: pure (`src/scenes/travel/fauna.test.ts` / `wildlifeBehavior.test.ts`):
  the giraffe is lion-only prey and appears in no other predator's web; the kick
  chance maps deterministically. Live: a lion hunt on a giraffe calf ends with
  the mother driving the lion off and the calf alive. DOCS: design.md §19.8 (and
  §19.3's food web), CLAUDE.md §7.1 pt. 12. One atomic commit.
  (Reported 15.07.2026.)

- [ ] 125. The sacrifice may succeed (variance instead of a script).
  Wanted (user, 15.07.2026): today a parent that reaches the predator ALWAYS
  dies — the shield take (~994), the charge sacrifice (~967) and the too-late
  death (~950) are deterministic. Give the drama variance: sometimes the parent
  drives the predator off and both live.
  ANCHORS (`src/scenes/travel/Wildlife.tsx`): the three resolution branches at
  ~935-1003; `LION_STATE` (an abort path already exists — a strayed chase
  aborts, cf. the streaming checks).
  (a) One shared, pure helper deciding the outcome of "parent reaches predator":
      taken (today's behaviour) vs. drives it off. Per-species chance as a
      balance value (debug-editable), defaulting LOW for the small grazers so
      the existing drama stays the norm (e.g. 0.2) — the giraffe's high value
      lives in point 124.
  (b) On success: abort the hunt (the predator gives up and leaves, reusing the
      existing leave/abort path — no new predator state), the calf keeps its
      parent, both rejoin the herd. No stain, no carcass.
  (c) The parent's charge must still LOOK committed either way — the outcome
      resolves at contact, not by the parent hesitating.
  (d) Determinism for the tests: derive the roll from existing per-animal state
      (e.g. its `phase`), not `Math.random()`, so a seeded run is reproducible.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`): the outcome helper
  maps deterministically, the default chance keeps the sacrifice the common case,
  chance 0 always dies (the existing scripted checks must stay green) and chance
  1 always survives. Live: with the chance forced to 1 a reached predator leaves
  and both animals live; forced to 0 the existing sacrifice checks still pass.
  DOCS: design.md §19.8, CLAUDE.md §7.1 pt. 12. One atomic commit.
  (Reported 15.07.2026.)

- [ ] 126. Elephant mourning at the graveyard.
  Wanted (user, 15.07.2026): elephants keep vigil over their dead and touch their
  bones — and §4.4's elephant graveyard already stands there with its carcasses,
  tusks and bones. An elephant herd that comes to rest and mourn there would be
  the strongest family scene in the game. NOTE (stated to the user): this is a
  VIGIL, not a sacrifice — elephants mourn, they do not die of it. Kept as its
  own point for exactly that reason.
  ANCHORS: the graveyard dressing and its dev hook (the carcass/tusk/bone counts
  asserted in `scripts/verify/enrichments.mjs`, CLAUDE §7.1 pt. 12); the elephant
  roam/cohesion in `src/scenes/travel/Wildlife.tsx` (~1350-1390,
  `ELEPHANT_SPEED`, `ELEPHANT_COHESION`, `ELEPHANT_TURN`); the family pose chain
  (~1550, `familyHeld`).
  (a) An elephant herd within a radius of the graveyard walks to the bones and
      holds there: heads lowered to a bone (a touch pose, reusing the pitch the
      feed/nurse poses already use), moving on only after `MOURN_SECONDS`
      (calibratable). The gentle-arc turn cap must keep holding — no snapping.
  (b) Extend it to their own dead once other points can kill an elephant (122's
      drowning, 123's mire): a herd stands vigil over a dead herd-mate the same
      way. Guard: an elephant CANNOT be trampled (the trample skips its own
      species), so do not build a death path for it here.
  (c) RESOLVE ALWAYS (point-118 lesson): the vigil ends after `MOURN_SECONDS` or
      when the herd streams out; never a herd pinned at the bones forever.
  TESTS: pure for the "should this herd mourn here" predicate (in range, not
  already mourned, timer). Live (`scripts/verify/enrichments.mjs`): an elephant
  herd placed near the graveyard closes on the bones, holds there with lowered
  heads, and moves on after the window — with a screenshot. DOCS: design.md §19.8
  (+ a pointer from §4.4), CLAUDE.md §7.1 pt. 12. One atomic commit.
  (Reported 15.07.2026.)

- [ ] 127. A parent runs faster when it rushes to its calf's rescue.
  Wanted (user, 15.07.2026): a parent hurrying to save its young can run faster
  than it otherwise does — the adrenaline burst. Partly there but unowned and
  inconsistent: the rescue drives already use their own speeds
  (`PARENT_CHARGE_SPEED` 6.5, `PARENT_BLOCK_SPEED` 6, `GUARD_SPEED` 5.5,
  `WADE_SPEED` 4.2, all in `src/scenes/travel/Wildlife.tsx` ~305-351) — hand-set
  numbers with no single rule, and the wade (4.2) is barely a hurry at all.
  (a) Introduce ONE calibratable rescue burst — a factor over the parent's
      ordinary movement speed — in `src/config/balance.ts` per CLAUDE §2, and
      derive the rescue speeds from it instead of leaving four loose constants.
      The burst must read as a burst: clearly faster than the same animal's
      normal roaming/grazing, and it applies ONLY while a rescue drive is
      active (charge, shield, guard, wade to a struggling calf).
  (b) It is a RESCUE burst, not grief: point 119's `trampleTo` charge and
      point 121's vigil walk are not rescues (nobody can be saved) — leave them
      on their own speeds and say so in a comment, so a later reader does not
      "unify" them by mistake.
  (c) Debug-editable at runtime per CLAUDE §2/§21.
  (d) BALANCE GUARD: the burst must not silently delete the existing drama. The
      too-late death (`PARENT_TOO_LATE_DIST`, ~950) and the "parent held out of
      shielding reach" cases must stay REACHABLE — a parent fast enough to
      always arrive would erase both. Re-check those live checks and, if the
      burst makes them unreachable at their forced distances, re-calibrate the
      burst rather than weakening the checks.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`) — the shield
  mini-simulation there hardcodes `PARENT_BLOCK_SPEED` 6 and
  `HUNT_LION_SPEED` 5.6 and MUST be updated to the derived speed; assert the
  burst exceeds the ordinary speed and that the hunter still reaches the shield
  before the calf. Live (`scripts/verify/enrichments.mjs`): the whole existing
  calf-drama battery stays green (sacrifice, too-late, held-out-of-reach, water
  rescue), and a rescuing parent's measured speed exceeds its own roaming speed.
  DOCS: design.md §19.8 (name the burst as part of the family drama) and
  CLAUDE.md §7.1 pt. 12/20 (the tunable). One atomic commit.
  (Reported 15.07.2026.)

- [ ] 128. Scavenger vultures still sink into the ground at a carcass.
  User report + screenshot (15.07.2026, deployed build): "Geier clippen immer
  noch in den Boden rein" — a bird feeding at a carcass is half inside the
  terrain. "Still" is the key word: the suite has a green check for exactly this
  ('no landed vulture sinks into the terrain while feeding'), so the check does
  not cover what the user sees.
  ROOT CAUSE (found by reading `src/scenes/travel/Wildlife.tsx`, no repro needed
  — the two vulture systems are built differently):
  * The KILL FLOCK (~2415-2437) does it right: for every bird it samples the
    terrain UNDER THAT BIRD's own offset (`f.x + lx, f.z + lz`) and lifts it by
    `lift = max(0, terrainHeight - killGroundY)`, then `ly = lift + 0.15 + hop`.
    Rising ground beside the remnant therefore pushes each bird up.
  * The SCAVENGER (~1437-1460) — the lone bird that works a trampled/non-lion
    carcass, i.e. the one in the user's screenshot — only lifts the GROUP:
    `sc.y = target.y + 0.5`, the carcass's own height plus a fixed 0.5. Its
    birds are then scattered at radius `0.5 + i * 0.35` (over a unit away) with
    a "positive-only hop", but with NO per-bird terrain lift. On ground that
    rises more than the fixed 0.5 across that offset, the bird sinks in.
  * And it is invisible to the tests: `clearance.current` is only ever written
    from `killMinClear` (~2437), so `__vultures.clearance` — and the check built
    on it — reports the FLOCK only. The scavenger has never been measured.
  FIX (one atomic commit):
  (a) Give the scavenger's landed birds the same per-bird terrain lift the kill
      flock already uses; factor the shared "lift a landed bird onto its own
      ground" maths into one pure helper rather than copying it, so the two
      systems cannot drift apart again.
  (b) Report the scavenger's landed clearance into `clearance.current` too (the
      minimum over BOTH systems), so the existing check actually covers it.
  (c) Re-check the fixed `+0.5` group offset against the model: `buildVulture`
      (`src/render/fauna.ts` ~443) has its body sphere reaching ~0.096 below the
      origin, so the offset is not the main sinner — the missing per-bird lift
      is. Do not paper over (a) by simply raising 0.5.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`) for the extracted
  lift helper: flat ground lifts nothing, rising ground lifts by exactly the
  rise, falling ground never pulls a bird DOWN (positive-only). Live
  (`scripts/verify/enrichments.mjs`): extend the existing sink check to a
  SCAVENGER carcass on sloped ground (the current one only exercises the flock)
  and tighten the tolerance — it currently passes anything above -0.05, i.e. it
  tolerates a 5 cm sink; a landed bird should never be below its own ground at
  all. DOCS: design.md §19.6, CLAUDE.md §7.1 pt. 12. (Reported 15.07.2026.)

- [ ] 129. Traveller blocked in open ground with nothing visible (NOT
  reproducible yet — needs the user's exact spot).
  User report (15.07.2026, screenshots): at ~13.5°N / 10.6°E (West region,
  inland Niger) the traveller cannot walk WEST (an earlier report said EAST at a
  similar spot); north is blocked by a visible tree, which the user accepts. To
  the west there is nothing to see.
  INVESTIGATION SO FAR (scratch repro via `debugJumpTo(13.5, 10.6)` + driven
  keys): at that coordinate ALL FOUR directions move freely (W -10.1, E +11.5,
  N -11.3, S +11.9) and `collidableFloraNear` returns an EMPTY list — no
  obstacle stands there at all. So the block is not at the nominal coordinate:
  the position readout rounds to 0.1° (~0.5 world units at this latitude), and
  the user is pressed somewhere inside that patch, almost certainly against the
  tree that blocks their north.
  HYPOTHESES to test, in order:
  (a) A resting contact that also kills the tangential move. `resolveTravelMove`
      (`src/systems/movement.ts` ~94-180) is supposed to allow this (point 113
      added the slide, and `movement.test.ts` pins "away/tangent moves from a
      resting contact stay free") — but the pure test uses ONE circle. Check TWO
      overlapping trees, and the interaction of the per-obstacle slide with the
      final 8-iteration `pushOutOfCircles`: the de-penetration may be undoing the
      tangential progress the slide just made.
  (b) The rendered canopy is far wider than the collision radius (`baseR` 0.3-1.0
      in `COLLIDABLE_FLORA`, TravelScene.tsx ~664), so "nothing visible west"
      does not rule out a collision circle west — verify against the real list,
      not the picture.
  (c) `collidableFloraNear`'s `QUERY = 3` window (~684) and its 3×3 chunk
      neighbourhood: confirm no obstacle can act on the traveller from outside
      the queried set (an asymmetric window would block one direction only —
      which would fit "west but not east" exactly). This is the most promising
      lead for a DIRECTIONAL block.
  NEEDED FROM THE USER if (a)-(c) do not reproduce it: the exact spot. Ask for a
  reproducible walk (e.g. jump to the coordinate, then which way they walked into
  the tree), or add a debug readout of the raw position and the active obstacle
  circles. A dev hook for the obstacle list (`__vegetation.obstaclesNear`) was
  added during this investigation — keep it, the fix's live check wants it.
  TESTS: pure (`src/systems/movement.test.ts`) for whatever (a)/(c) turns up —
  at minimum, a resting contact against two overlapping circles must leave every
  tangential and outward direction free. Live: walk into a tree and prove all
  three free directions still move. DOCS: CLAUDE.md §7.1 pt. 4 if the rule
  sharpens. (Reported 15.07.2026.)

- [ ] 130. Crocodiles: the ambush from the water.
  Wanted (user, 15.07.2026): crocodiles in the regions that suit them, lying
  HIDDEN at first and then bursting out of the water to take prey — with the
  same parent sacrifice/grief scenarios as the other predators, including the
  few seconds a parent has to save its young before the attack kills it. This
  is a NEW AMBIENT SPECIES and closes part of the standing open item in
  CLAUDE.md §7.1 pt. 12 ("additional new species beyond the current roster").
  Note: a crocodile exists today ONLY in the random-event system (§14.2) and
  `src/config/balance.ts`/i18n — there is no crocodile in the herd sim at all.
  ANCHORS: `SPECIES` (`src/scenes/travel/Wildlife.tsx` ~65) and `MAX_INSTANCES`
  (~66); `PredatorKind`/`REGION_PREDATORS`/`PREDATOR_PREY` (~210-235);
  `src/scenes/travel/waterEdgeRules.ts` (drinkers walk to the bank, bathers wade
  one step — that bank visit IS the ambush's prey); the calf-drama resolution
  (~935-1003: `caught` countdown, `PARENT_SACRIFICE_DIST`,
  `PARENT_TOO_LATE_DIST`, `PARENT_CHARGE_SPEED`); `src/render/fauna.ts` for the
  build; `src/i18n/de.ts`/`en.ts` for the name.
  (a) Species + placement: a `crocodile` that only ever exists in/at river and
      lake water in the regions where the Nile crocodile really lived ~1890
      (the Nile, the Congo basin, the eastern and southern river systems and
      lakes — NOT the waterless desert). It is EXEMPT from the §19.5 rule that
      no animal stands in water — like the wading flamingos, this is its home;
      add it to the same exemption the water dramas already hold, and state
      that in design.md so the rule stays honest.
  (b) Hidden state: submerged, only eyes/snout above the surface — visually
      almost nothing, and it must not read as a floating carcass. It waits; it
      does not roam like a lion.
  (c) The lunge: when an animal comes to the bank to drink (the existing
      water-edge behaviour) within a strike radius, it bursts out — a fast,
      short, visible lunge, not a teleport (the §19 no-snap turn rules and the
      smooth-flee rule apply).
  (d) The drama, reusing the EXISTING paths rather than a second copy: the
      victim gets `caught` and struggles for the established window; the parent
      charges; a parent that reaches in time is taken in the calf's place; one
      that only got close by the window's end is taken alongside it. The
      user's "a parent has a few seconds to save its young" IS today's struggle
      window — reuse it, do not invent a second timer.
      ARCHITECTURE WARNING: `LION_STATE` is a SINGLE global hunt state. A
      crocodile ambush running while a lion hunts elsewhere must not clobber it
      — either give the ambush its own small state or generalise the hunt state
      properly. Decide this before writing code; a silent overwrite would break
      the whole §19.8 battery.
  (e) The player: walking into one must route through the EXISTING §14.2
      crocodile event (machete always protects, rifle only from the canoe) like
      the §19.3 wandering-predator attack does — no new attack path, no new
      protection rules.
  (f) Both languages, voice markup on any journal text (§15.2).
  TESTS: pure — the region/water placement rule (crocodiles only in the right
  regions and only on water) and the lunge trigger over (distance, prey at bank)
  in `src/scenes/travel/wildlifeBehavior.test.ts` /
  `src/scenes/travel/waterEdgeRules.test.ts`. Live
  (`scripts/verify/enrichments.mjs`): a crocodile sits hidden until a drinker
  comes, then lunges and catches it; the parent-rescue, the sacrifice and the
  too-late outcomes all fire on a crocodile exactly as on a lion; a lion hunt
  running at the same time is unaffected (the architecture guard in (d)); plus
  a screenshot of the hidden and the lunging state. DOCS: design.md §19 (a
  subsection for the ambush predator, plus the §19.5 water exemption and the
  §19.8 pointer) and CLAUDE.md §7.1 pt. 12 (new verifiable conditions; narrow
  the open item to the species still missing). Split into atomic commits along
  (a)…(e) if it grows. (Reported 15.07.2026.)

- [x] 131. Name the peoples correctly, and de-anachronise their vignettes.
  (Done 16.07.2026 for every people that stays put — display names, internal ids,
  village ids, region styles, tests, verify scripts and the design.md rosters.
  The Maasai vignette wears ochred hide per Thomson instead of red cloth; the
  San vignette keeps its detail but drops the timeless-isolate framing. The
  bombara/batwa renames ride with their PLACE changes in point 132, so a
  village never carries the wrong vignette in between.)
  Decided under the user's accuracy principle (15.07.2026): "make it as accurate
  as possible unless it balloons into extreme effort, collides with the game
  concept, or merely annoys instead of contributing to authentic atmosphere."
  This one is cheap, collides with nothing and is pure atmosphere gain — the
  research is in `docs/peoples-1890.md` §1 and §2.
  (a) DISPLAY NAMES (`src/i18n/en.ts`/`de.ts`, the `peoples` map ~line 52): the
      player-visible name is what must be right. `masai` → **Maasai**;
      `bombara` → **Bambara**; `mandingo` → **Mandinka**; `sidamo` → **Sidama**
      (the exonym was coined in **1891 by Menelik's generals** as degradation —
      at the game's 1890 start the word does not exist); `pygmies` → **Mbuti**;
      `bushmen` → **San**; `bantu` → **Pedi** (Bantu is a language family of
      ~500 languages, not a people); `uganda` → **Baganda** (a colonial
      territory name, not a people — the vignette already says "the Kabaka's
      kingdom", so the text knows better than the label). Both languages.
  (b) INTERNAL IDs: **rename them too** — `masai`→`maasai`, `bombara`→`bambara`,
      `mandingo`→`mandinka`, `sidamo`→`sidama`, `pygmies`→`mbuti`,
      `bushmen`→`san`, `bantu`→`pedi`, `uganda`→`baganda`, `batwa`→`wayeyi`
      (per 132a). I had deferred this because `store.ts` writes `peopleId` into
      journal entry PARAMS (~line 877/899/1130), so a rename empties the
      language-neutral journal of existing saves (design.md §17.7). **The user
      waived that (16.07.2026): "Wenn bestehende Spielstände kaputtgehen, ist das
      egal. Noch ist es sowieso nur ein PoC, den noch nie jemand ernsthaft
      gespielt hat."** So: no migration, break the old saves, and leaving
      `pygmies`/`bushmen` sitting in the codebase is not defensible with "it is
      not player-visible". Update every reference: `src/world/geo.ts` (~9),
      `src/i18n/*.ts` (the `peoples` map + the vignette keys),
      `src/i18n/parity.test.ts`, `src/state/store.travel.test.ts`,
      `src/state/store.hints.test.ts`, `src/world/world.test.ts` (its peopleIds
      list).
  (c) VIGNETTES (`src/i18n/*.ts` ~line 500+), fixing what the research proved
      wrong — both languages, voice markup intact (§15.2), and these are
      first-visit journal texts so §16 applies:
      * **Maasai**: "Warriors wrapped in red" is an anachronism by ~70 years.
        Thomson (1883–84, PERIOD) has sheepskin over the left shoulder and
        scraped bullock-hide, greased and ochred; cloth reached them ONLY as the
        *naibere* war-dress (a white sheet with ONE coloured stripe). Rewrite to
        ochred hide; the crimson may survive only as that stripe.
      * **Bambara**: "millet fields run to the horizon" cannot happen at the
        village's coordinate (17.2N — 150–200 mm/yr). Either fix with point 132
        or drop the claim.
      * **San**: the current text (grass shelters, poisoned arrows, ostrich-egg
        water, eland paintings "older than any memory alive") is the pure
        isolationist portrait — beautiful, not false, but it takes a side in the
        live Kalahari Debate on the weaker-evidence side, and at exactly the date
        where the revisionists are strongest (by 1890 many San stood in client
        relationships to Tswana cattle-holders). Soften: keep the detail, drop
        the timelessness.
      * **Baganda**: KEEP the bark-cloth line — Roscoe (1911) affirms it, and it
        is the one dress detail in the codebase the research could confirm
        outright.
  (d) Do NOT put a Basotho blanket on the Zulu: that garment is period-correct
      for *Lesotho* (normal dress by 1890), the game has no Basotho village, and
      no dating for Zulu blanket adoption was found.
  TESTS: `src/i18n/i18n.test.ts` / `villages.test.ts` already assert one
  distinct, markup-clean vignette per village in both languages — extend to pin
  the corrected names; `src/i18n/parity.test.ts` covers key parity. DOCS:
  design.md §3.2/§4.5 (the peoples list) — this IS design content, so update it
  in the same commit per CLAUDE §4. One atomic commit. (Decided 15.07.2026.)

- [x] 132. Put the misplaced villages on their real ground.
  (Done 16.07.2026: the Bambara village moved to Segou (13.45N 6.27W, west
  region — north is now three peoples, which the Sahara honestly is); the
  Okavango village renamed Wayeyi with a new vignette around the mokoro, the
  fish-traps and the inverted flood pulse; the Nubian vignette now carries the
  frontier — soldiers on the river road, the Khalifa's dominion beyond, the
  hunger year — while keeping its saqia waterwheel. Also fixed a leftover from
  131: the player-visible place NAMES still said "Pygmy Village"/"Bushman
  Village" etc. in both languages; the keys had been renamed but not the
  values.)
  Same accuracy principle. Three villages sit on ground that contradicts their
  own vignette (`docs/peoples-1890.md` §1/§1.1). Region membership is design
  (design.md §4.5) and each region's count must survive, so the fix is chosen to
  keep every region's roster size unchanged.
  (a) **Batwa (19.0S 22.5E) → rename to WAYEYI**, do not move. The Batwa are
      Great Lakes forest people ~2000 km away; the coordinate is the **Okavango
      Delta**, whose peoples are the Hambukushu, Dceriku, **Wayeyi (BaYei)**,
      Bugakhwe and ǁanikhwe under **Batawana** overlordship. Moving the village
      to ~2S 29E would drop the south from five peoples to four — that collides
      with the design, so rename instead. Rewrite the vignette around what is
      actually there: the flood, fishing, and the **mekoro** dugout the BaYei
      are known for — the game already has a canoe, which makes this cheap and
      rewarding. NOTE the likely origin of the error, so it is not repeated:
      Nguni ***Abathwa*** is a southern-African exonym for the **San**, and it
      looks like it was fused with the Great Lakes **Batwa** — two referents,
      one lookalike root.
  (b) **The Okavango flood pulse is the payoff, and it belongs to point 120:**
      the water peaks at Maun **June–August, in the middle of the dry season**,
      and recedes as the rains start — "while most river systems flood during
      the local rainy season, the Okavango does the opposite". Physical
      geography, so safe to retro-apply. Wire it into 120's season model as this
      village's calendar (molapo flood-recession farming keys to the recession).
  (c) **Bambara: MOVE it to Ségou, 13.45N 6.27W.** (Decided on authenticity by
      the user's delegation, 16.07.2026 — and it reverses my earlier
      "relabel to Songhai" call.)
      The village sits at 17.2N 3.5W: wrong rainfall for its millet vignette
      (150–200 mm/yr), wrong people (Songhai/Tuareg/Arma country in 1890), wrong
      polity (Ségou fell to al-Hajj Umar Tal in 1861 and to the French in
      1890–91). My earlier fix — relabel the point Songhai — dies on one fact I
      had not checked: **Timbuktu is ALREADY a port in the game** (`geo.ts:141`,
      16.77N −3.0), i.e. **~50 km from this village**. Timbuktu *is* the Songhai
      Niger-bend world; a Songhai village beside it would be a duplicate of a
      place the game already has. It also exposes a second oddity — the two sit
      ~50 km apart in DIFFERENT regions, because the lat-17 border runs between
      them.
      So move the Bambara to their real heartland instead. Ségou lands in the
      **west** region, so north goes 4→3 and west 3→4. That is fine: nothing
      requires a fixed count (`pickKnowingVillages`, `store.ts:367`, filters by
      region and picks any of them — my earlier "breaks the region count" claim
      was wrong, and checking it is what killed it). **And a thinner north is
      more authentic, not less: the Sahara really is empty.** The millet-and-
      chiwara vignette becomes true at Ségou, and the absurd village-next-to-a-
      port disappears.
  (d) **Nubians (21.8N 31.6E)**: the coordinate is **Wadi Halfa**, and in 1890
      that is the **Anglo-Egyptian frontier garrison facing the Mahdist state**
      — the Sudan in 1890 is the **Mahdiyya**, not Egyptian-ruled, the Khalifa's
      invasion was crushed at Toski (3 Aug 1889) right there, and the *Sanat
      Sitta* famine of 1889–90 had just passed. Do NOT move it and do NOT model
      the war: that collides with the game concept (§13.3 needs every village
      functional as a hint-giver). Instead let the **vignette** carry it — a
      frontier under arms, a river of ivory and gum arabic under tax, a country
      one year out of famine. Atmosphere, not mechanic.
  (e) Nubian farming is **saqia-lift onto narrow terraces**, NOT basin
      flood-recession — the valley above Aswan has almost no floodplain. If 120
      gives the Nile a flood calendar, this village must not inherit the Egyptian
      one. Nice touch if cheap: the saqia works **hardest for least land** at low
      water in the hottest months.
  TESTS: `src/world/world.test.ts` already pins all 22 villages and the river
  clearance — extend for the renames; `src/i18n/villages.test.ts` for the new
  vignettes in both languages. DOCS: design.md §3.2/§4.5 and §4.2. One atomic
  commit. (Decided 15.07.2026.)

- [ ] 133. The rinderpest years, modelled as the date-dependent state they were.
  **CORRECTED 16.07.2026 — my earlier refusal rested on a constraint that does
  not exist.** I had written that a faithful depiction would empty the Maasai
  village and break §13.3's knowing-people cascade, and refused it on that
  ground. Three things are wrong with that, each enough on its own:
  * **The cascade is not something to protect** (design.md §13.4, user
    16.07.2026): the whole hint system is placeholder machinery awaiting
    replacement, so disturbing it is never a reason to compromise a change
    elsewhere. I used it first as a reason to refuse and then as a reason to
    allow — it was never a yardstick at all.
  * **The history does not say the village emptied.** ~90 % of the HERDS died
    and the people starved; *some* fled to the farming peoples they had lorded
    over, others stayed and raided more desperately. The FAO source has the
    enkang keeping "a core of people who resided there permanently". The
    accurate depiction is a **devastated but inhabited** village. "Village
    abandoned" would have been an error in MY modelling, not the price of
    accuracy.
  * Even if a village COULD go empty, `pickKnowingVillages` (`store.ts:367`)
    picks any village of a region and works with any count ≥ 1.
  So: implement it accurately. The research (`docs/peoples-1890.md` §5) is
  unambiguous — the game's own window IS the panzootic.
  (0) **It is DATE-DEPENDENT, and that is the real work.** The game runs ~5
      years from 1890, so the state must change as the date advances (the
      season model of point 120 already keys off `day`; reuse that plumbing):
      * **1890 (start):** Maasailand is ALREADY damaged — bovine
        pleuropneumonia swept it 1883–87. Rinderpest has not arrived. Sudan is
        one year past the *Sanat Sitta* famine and its herds are gone.
      * **1891:** rinderpest reaches Maasailand (first recorded on
        Kilimanjaro's slopes; Kedong valley March 1891) — the triple disaster
        with smallpox 1892 and locusts. Senegal River by 1891, Dori April 1891.
      * **1892–95:** famine and its aftermath; the disease sits north of the
        Zambezi from July 1892.
      * **1896:** it crosses the Zambezi (Bulawayo 3 March) and reaches the
        Zulu, Pedi and San — **inside a long playthrough**. Until then those
        three are clean.
  Then the depiction, per place:
  (a) The **Maasai** and **Sidama** vignettes carry it: dead herds, a people at
      the edge. Baumann was there in **March 1892** and his German is verbatim in
      the research doc — **use his own words for the German text, never a
      back-translation from the English paraphrase** (the widely-quoted
      "walking skeletons" is not his phrase).
  (b) The **Sudan/Nubia** vignette (point 132d) carries *Sanat Sitta*.
  (c) Optional and cheap if the wildlife system allows: **carcasses** in the
      bird's-eye vicinity of Maasailand. The game already has carcass and vulture
      systems; rinderpest killed ~95 % of buffalo and wildebeest in two years,
      and Baumann himself recorded it striking "nicht nur Rinder, sondern auch
      Büffel, Gnus und Antilopen".
  (d) Accuracy guards for whatever text is written: **camels are immune** (FAO),
      so the Somali and Tuareg herds survive — but Sahel **pack oxen** died,
      breaking the grain freight to the oases. The **Bemba kept no cattle at
      all** (tsetse belt) — for them it is game depletion, not herd loss. The
      **Zulu, Pedi and San are rinderpest-free until 1896**, i.e. for the whole
      window. And **Menelik grew STRONGER** from the famine, not weaker.
  (e) Do NOT assert the rinderpest→Maasai-dress-change link (unsourced). The
      shield link IS sound: the *elongo* was male buffalo hide, and the buffalo
      died — but that is a texture, not a mechanic.
  TESTS: pure — the date→phase mapping per region (`src/systems/season.test.ts`
  or its own file): 1890 pre-arrival, 1891 Maasailand struck, southern Africa
  clean until 1896 and struck after, and the camel peoples never struck at all.
  `src/i18n/villages.test.ts` (distinct, markup-clean vignettes, both languages).
  Live: the phase is observable via a dev hook, and the debug menu can force a
  date/phase for testing (like 120's season selector).
  DOCS: design.md §16 + the new §19 seasons subsection. One atomic commit — or
  split state/vignettes/carcasses if it grows. (Decided 15.07.2026; the refusal
  reversed 16.07.2026 after actually checking it.)

- [ ] 134. The one deliberate inaccuracy: grief unto death stays.
  Standing exception to the accuracy principle, set by the user (16.07.2026):
  **"Die Elterntiere sollen sich nach wie vor freiwillig wie gehabt ohne Wehr in
  den Tod stürzen, wenn ihre Jungtiere gestorben sind."**
  This is NOT an oversight and NOT to be "corrected" toward realism. It covers,
  as one family:
  * the **waterfall plunge** (§19.8, existing): a parent follows its swept-over
    calf and dies with it;
  * the **trample-throw** (point 119, shipped): a parent throws itself before
    the elephant that killed its calf;
  * the **carcass vigil** (point 121): the parent stands over its dead calf and
    is taken without fleeing.
  Real ungulates do not do this — they run from a charging predator. The game
  does it anyway, on purpose: it is the established emotional grammar of §19.8,
  and an animal that bolted at the last moment would be the odd one out among
  the three, not the realistic one. Everything ELSE in the world (climate,
  peoples, dress, the panzootic, village placement) is to be as accurate as the
  research allows — this is the single carve-out.
  ACTION: record it in design.md §19.8 in those terms, so the exception is
  visible where the behaviour is specified rather than buried in a task list.
  No code. (Set 16.07.2026.)

- [ ] 135. The settlement-vicinity check (point 102) fails ~2 of 3 runs — fix
  the guarantee, not the check. Observed 16.07.2026: 'a settlement vicinity
  holds region-typical animals after leaving (point 102)' failed twice in three
  full enrichments runs with {region north, count 5, min 6} — a 2/3 rate is a
  defect, not a flake. No season-code coupling exists (the wildlife does not
  read CURRENT_WEATHER yet), and the failing count predates today's features in
  design: `seedSettlementVicinity` (Wildlife.tsx ~650) tops the presence up to
  `vicinityMinAnimals` AT SEED TIME (on leaving), but the check counts 2.5 s
  LATER — an animal that wanders past the 75-unit radius (or is taken by an
  ambient hunt) in between drops the count below the guaranteed minimum. The
  guarantee and the assertion measure different moments.
  FIX in the game, not the test: make the guarantee hold over time — e.g. seed
  with a small margin inside the ring (place the seeded herd so its wander
  leash cannot exit the radius within minutes), or re-top-up on a slow tick
  while the traveller is within the vicinity. Do NOT simply relax the check or
  retry harder: the acceptance text (CLAUDE §7.1 pt. 12, point 102) promises a
  never-empty vicinity, and the test should keep meaning that.
  TESTS: the existing live check stays as is (it is the truth-teller); pure
  test for whatever leash/margin rule is added. (Filed 16.07.2026 after the
  third run.)

## Closing (only after all points)

1. Full regression over the whole state.
2. Thorough dead-code / stale-doc / stale-comment cleanup — as separate commits,
   not mixed with feature commits.
3. Full regression again.
4. Analyse every .md file for cruft that accreted through the iterative
   additions: compact or restructure sections that have grown rambling or
   redundant, improving structure where it helps. The referenced section
   numbers must be preserved.
