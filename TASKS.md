# TASKS — sequential feature batch

Working file for the current batch. Exactly one point is in progress at a time.
Each point: implement → adapt docs (incl. README/CLAUDE.md/design.md) → add
acceptance tests → run the full regression → commit atomically (only if fully
green) → tick it here → clear context and re-enter from this file.

On failure after correction attempts: STOP, report, and do not build further on a
broken base. Tests are never weakened; a red run is fixed in the production code.

This file and every new entry are written in English. Commit messages do not
reference the TASKS point number.

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

**Every point adds a test on the appropriate layer** — Vitest for anything
assertable without a browser, Playwright (`scripts/verify/*.mjs`) only for the
scene/RAF/geometry/CSS/audio/screenshot cases (`scripts/verify/README.md` holds
the map).

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
  since headless has no user activation.)
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
- [x] 72. The canteen must also BLINK below 1/3 fill (today it glows yellow
  below 20 %, red below 5 % and blinks only when empty — design.md §6.1's
  thresholds change accordingly, both language files if any text names
  them); cover the new threshold in Hud.test.tsx alongside point 71.
  (canteen-blink animation below 1/3 fill with the yellow stage moving to
  the same third (red <5 %, empty keeps blinking); no player-visible text
  names the thresholds, so no language change. Threshold on/off and the
  empty case pinned in Hud.test.tsx; design.md §6.1 updated. Full
  regression green.)
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
- [x] 75. The Meroë pyramids must render MUCH larger in the travel view —
  today's build reads too small; scale the landmark geometry up so the
  pyramid field is unmistakable at travel zoom (keep the label/sighting
  behaviour; adjust the pure geometry test accordingly).
  (Field scaled ~3.5x: peaks 3.4-4.6 units — well above tree height
  (acacia ~2, baobab ~2.6) — footprint ~10 units; own geometry pin in
  landmarks.test.ts (height 3-8, footprint 6-14, grounded) with the
  generic <6 bound kept for the other sites. Verified visually at Meroë.
  Full regression green.)
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
- [ ] 79. In-settlement map: opening the map INSIDE a settlement must show a
  plan of the current place — the walkable area with the functional
  (enterable) buildings marked and named — instead of (or in front of) the
  continental exploration map. Localized labels in both languages; cover
  the mode switch and the building markers on the right layer(s).
- [ ] 80. Vultures (user screenshot): (a) they still CLIP INTO THE GROUND
  while feeding at a carcass — feet/body must stay on the surface for the
  whole feed; (b) after the predator has left a kill they wait too long
  before landing — shorten the descent trigger once the site is clear.
  Extend the vulture live-checks/pure tests accordingly.
- [ ] 81. Recognizable settlement surroundings (user report): the current
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
- [ ] 82. After point 81: add the GIZA PYRAMIDS as a built cultural landmark
  in the travel view (real ~1890 position just west of Cairo — Khufu,
  Khafre, Menkaure with the Sphinx readable at a glance; the design.md §4.4
  cultural-landmark roster, localized names and a kind-flavored discovery
  entry in both languages grow accordingly, framed like the other African
  achievements). Via the point-81 panorama capture it then appears in
  Cairo's first-person skyline automatically — verify that (screenshot +
  the landmark checks extended to 8 cultural landmarks).
- [ ] 83. Animals must be unable to walk into the open ocean, exactly like
  the player (user report): predators currently do it when they WALK AWAY
  after feeding — the scripted leave path apparently bypasses the §19.5
  water backstop that pins streamed animals to land. Route every scripted
  movement (leave-after-feed, chase abort, any waypoint walk) through the
  same land constraint: the walk-off deflects along the coast instead of
  entering ocean cells. Cover the leave path on both layers (pure: the
  deflected step rule; live: a post-feed lion walking off at a coast stays
  on land until it despawns).
- [ ] 84. Full phone/tablet support, with ZERO change to PC play: a touch
  layer as a third input source in the existing merged input path (like the
  gamepad: synthetic events, deliberate-input engagement guard — the
  overlay mounts only after a real first touch, so desktops, including
  touch-screen laptops never touched, see pixel-identical behaviour).
  Left virtual stick = movement; right-half touch-drag = first-person
  look / bird's-eye steering without pointer lock (same sensitivity
  constant); pinch = the existing wheel zoom; the interaction prompt
  becomes tappable and HUD shortcuts (camp/journal) stay buttons; HUD
  scaling/safe areas for small landscape screens; a reduced mobile
  quality preset (TRAA/SSAO/shadow resolution) tied to the same
  activation, never to user-agent sniffing; TTS keeps the WASM path.
  Localized labels for any new visible control in both languages.
  Verifiable: a Playwright run with emulated touch shows the overlay
  after a first touch, drives the player with the virtual stick, turns
  the first-person view by drag and zooms by pinch; the desktop suites
  prove the overlay absent and inputs unchanged without touch; unit
  tests cover the touch→axis mapping and the engagement guard.
- [ ] 85. Smooth the settlement figures (user report, screenshot of faceted
  cone bodies): raise the villager/figure primitive tessellation so neither
  the lighting facets nor the polygonal silhouette read at first-person
  range — body cones 8 → ~24 radial segments, the head spheres (10x8) to a
  visibly round resolution, and the same treatment for other close-range
  faceted primitives (hut cones, pestle/mortar props) where the eye gets
  near them. Negligible vertex cost (a handful of figures); no shader
  change needed. Cover the raised tessellation with a pure test on the
  built geometry (segment/vertex floor).
- [ ] 86. Distance-stable surface roughness via BAKED TEXTURES (user report:
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
- [ ] 87. Natural settlement layout (user report, screenshot): the building
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
- [ ] 88. Cache the Kokoro TTS model for the headless verification: every
  Playwright run uses a fresh profile and re-downloads the ~90 MB model
  from the Hugging Face CDN — repeated regressions today tripped the CDN's
  rate limit (HTTP 403 on the model file), failing voice.mjs on a healthy
  codebase. Serve the model from a local cache in the verify runs (e.g.
  download once into a git-ignored cache dir and intercept the request via
  Playwright routing, or a persistent browser profile for voice.mjs) so
  the regression is CDN-independent and faster; the production/player path
  stays unchanged (browser cache + CDN streaming per CLAUDE.md §3). Cover
  with the voice suite running green offline-from-HF (cache primed).

## Closing (only after all points)

1. Full regression over the whole state.
2. Thorough dead-code / stale-doc / stale-comment cleanup — as separate commits,
   not mixed with feature commits.
3. Full regression again.
4. Analyse every .md file for cruft that accreted through the iterative
   additions: compact or restructure sections that have grown rambling or
   redundant, improving structure where it helps. The referenced section
   numbers must be preserved.
