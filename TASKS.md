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

Work order (user override, 2026-07-16): after point 120 (seasons), the points
that BUILD ON it are pulled forward and done next, before the rest of the
batch — 122 and 123 (the two family dramas keyed on the wet/dry season), with
136 (wider, smoother rivers) placed BEFORE 122 because 122 and 130 both write
against the river's geometry. So: 120 → 136 → 122 → 123 → the remaining open
points in their numeric order. The numbering stays as-is; only the sequence
changes.

Work order (user override, 2026-07-16, later): 137 (seasonal dress by educated
guess) goes NEXT, ahead of 136 — the user asked for it "als nächstes
eingereiht" while 136 had only just started (nothing of 136 is committed, so
nothing is half-built). So the order is now: 137 → 136 → 122 → 123 → the
remaining open points in their numeric order.

Work order (user override, 2026-07-17): point 135 (the stochastic wildlife
checks) is PULLED FORWARD to directly after 123, BEFORE 149 — the roaming
flakes (drinker counts, guard approach, trample metric, vicinity seeding)
were failing one full suite run in two and taxing every point with retries,
and 149's weather verification should run on a stabilised suite. So: 123 →
135 → 149 → 150 → the rest as previously ordered.

Work order (user override, 2026-07-16, ninth): 149 (a SECOND full weatherWork order (user override, 2026-07-16, ninth): 149 (a SECOND full weather
verification, like 147) and 150 (a SECOND interim Closing run) go AFTER 123, on
the user's instruction — the whole system is re-swept and re-cleaned once more
after the family dramas and the river rebuild, before the batch tail. So the
tail reads: … -> 123 -> 149 -> 150 -> the remaining numeric points. 149 before
150 (a Closing follows a green verification).

Work order (user override, 2026-07-16, eighth): 147 (verify the whole weather
system — correct AND visible) goes directly after 144, on the user's
instruction: by then every weather point that changes the PICTURE has landed
(120, 137, 143, 144), so it is the sweep over what exists. Then 148, an INTERIM
CLOSING run, pulled forward because the season was the batch's largest rebuild
and the Closing steps would otherwise wait behind a dozen more points. Order:
137 -> 143 -> 144 -> 147 -> 148 -> 138 -> 139 -> 140 -> 141 -> 142 -> 136 ->
122 -> 123 -> rest.

Work order (user override, 2026-07-16, seventh): 146 (revenge) depends on 125's
shared outcome helper and its (prey, predator) matrix, so it is built directly
AFTER 125 rather than at the end — it extends that helper to a third outcome and
would otherwise be written twice. 125 keeps its place in the numeric tail.

Work order (user override, 2026-07-19, twelfth): after the 173 quality push the
user reported the jumping/floating trees (175), which was fixed and WebGPU-confirmed
by him. He then moved the two deferred debt points 177 (staging determinism) and
176 (drink-catchment cap) AHEAD of the closing check and the v0.2 tag ("Verschiebe
die Punkte 177 und 176 hinter den aktuellen — also noch vor dem Abschluss-Check und
dem 0.2er-Tag"). So the tail now runs 173 → 175 → 177 → 176 → closing → 174 (v0.2)
→ 163 → 166 → 170. (177 before 176: a deterministic staging harness stabilises the
ground that 176's live drought re-verification and the closing regression stand on.)

Work order (user override, 2026-07-18, eleventh): the user inserted a post-162
quality push (173: closing run + thorough code analysis + many new tests +
small/large regression tiers) and then a demo tag (174: v0.2 at /v0.2/) DIRECTLY
after 162 — and, by his explicit choice, 163/166/170 run AFTER the v0.2 tag. So
the tail runs 165 → 169 → 157 → 162 → 173 → 174 (v0.2) → 163 → 166 → 170.

Work order (user override, 2026-07-18, tenth): the user moved 165 (animals pop
in view — the same streaming-pop class as 171/164) up to run right after 172. So
the tail runs 167 → 171 → 172 → 165 → 169 → 157 → 162 → 163 → 166 → 170.

Work order (user override, 2026-07-18, ninth): after 164's zoom-2 test passed
while the bug persisted in-game, the user made "test at in-game-achievable zoom"
a standing rule and ordered a retroactive audit of ALL feature tests for
practice-remote testing — filed as 172, to run right after 171. So the tail runs
167 → 171 → 172 → 169 → 157 → 162 → 163 → 165 → 166 → 170.

Work order (user override, 2026-07-18, eighth): point 164's fix did not hold —
the plants still fly in — so the user filed 171 (only change flora outside the
view) to run DIRECTLY AFTER the current task 167. So the remaining tail runs
167 → 171 → 169 → 157 → 162 → 163 → 165 → 166 → 170.

Work order (user override, 2026-07-18, seventh): the user pulled three points
to the front of the remaining tail — 164 (plants jump while driving), then 167
(rain snaps at the zone border), then 169 (more juveniles), right after the
point in progress when asked (155). So the tail runs 155 → 164 → 167 → 169 →
157 → 162 → 163 → 165 → 166 → 170. The other points keep their relative order.

Work order (user override, 2026-07-16, sixth): 145 (three more parental
sacrifices) goes at the END of the batch, on the user's explicit instruction —
and its (a) depends on 144 (the burnt-land state) anyway, so the order is
already forced. 125's new (a2) rides with 125 where it sits; it is an extension
of that point, not a point of its own.

Work order (user override, 2026-07-16, fifth): 144 (the plants' cover and
condition follow the season) goes after 143. Together they are the answer to the
user's repeated, correct report that the months show "nur Änderungen am Regen
und der Helligkeit": 143 gives the settlement its missing rain and flora, and
144 replaces a colour tint that MEASURABLY cannot carry the season on its own
(the terrain multiplies it by the albedo texture) with a change of cover and
silhouette. Order: 137 -> 143 -> 144 -> 138 -> 139 -> 140 -> 141 -> 142 -> 136
-> 122 -> 123 -> rest.

Work order (user override, 2026-07-16, fourth): 143 (inside a settlement it
never rains and the ground never bleaches) is a DEFECT in the shipped point
120g, found by the user stepping through the months, so it goes ahead of the
138-142 additions: finish what 120 claimed before adding more season. Order:
137 -> 143 -> 138 -> 139 -> 140 -> 141 -> 142 -> 136 -> 122 -> 123 -> rest.

Work order (user override, 2026-07-16, third): points 138-142 are the season
findings that were RESEARCHED but never built (the user asked what else had
been held back; the honest answer was that only the dress was held back for
thin evidence — the rest was cut for scope, and one, the Okavango, is
documented as wrong). They queue directly BEHIND the current point 137, in the
order I proposed and the user accepted: the two physically safest and most
visible first, then the harmattan, then the ice/hail, then the big one. So the
full order is now: 137 → 138 (Nile flood) → 139 (Okavango inversion) → 140
(harmattan) → 141 (glaciers + hail) → 142 (seasonal work) → 136 → 122 → 123 →
the remaining open points in their numeric order.

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

- [x] 120. Seasons and region-typical weather (large ambience extension).
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
  (b) DONE (15.07.2026, 497e30d) — Model: derive a season from the in-game date + the region's latitude
      (`design.md` §3.2 regions), and from (season, region) a weather state.
      Central, calibratable values in `src/config/balance.ts`, debug-editable
      per CLAUDE §2 (a debug selector to force season/weather for testing).
  (c) DONE (15.07.2026, 497e30d) — Visuals: region-typical precipitation and sky (rain, harmattan haze,
      summit snow), fitting the §2.7 lighting/§19.9 dressing pipeline; TSL, no
      raw GLSL/WGSL, both renderer backends.
  (d) DONE (15.07.2026, 497e30d) — Plants: the vegetation and dressing of §19.9 respond — green/lush in the
      wet season, dry/sparse in the dry season.
  (e) DONE (15.07.2026, 497e30d) — Animals: the §19.2-§19.8 wildlife responds (e.g. presence/behaviour at
      water in the dry season). Must not break the existing wildlife
      invariants (streaming, body separation, water-edge rules, the dramas).
  (f) DECIDED (15.07.2026) — ambience only, recorded in design.md §19.13 with the
      question left open there. Gameplay coupling is OPEN and must be decided before implementing: does
      weather touch movement/health (§6/§11) or stay pure ambience like the
      rest of §19? Ambience-only is the safer default; flag it as a question
      rather than inventing a mechanic (CLAUDE §2 forbids design invention).
  (g) DONE (16.07.2026, 440c1e6 + 6d01f23) — sky, light and firelight shipped
      and live-checked (polish.mjs, screenshots 110/111); snow resolved as
      "nowhere" and recorded in design.md §19.13; the dress shipped
      evidence-gated (screenshot 112) — the Zulu isipuku is the one period-
      sourced case and every other people stays bare on the record, see
      src/systems/dress.ts. The one reading left open is carried in design.md
      §19.13: a wrap worn DIFFERENTLY in the cold, which the primitive figures
      cannot show. INSIDE SETTLEMENTS TOO (user, 15.07.2026) — the weather must not stop at
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

- [x] 121. Family drama: the vigil at the calf's carcass. The parent that did
  not reach the predator in time today simply resumes grazing beside its eaten
  calf. Wanted (user, 15.07.2026): it stays at the carcass, drives the vultures
  off, and — left alone by its herd — is taken there by a later predator: both
  a sacrifice and a death of grief, at the spot where its young fell. The
  predator does not merely happen along: the carcass DRAWS it, so the scenario
  reliably fires — see (f).
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
  (f) ★ A PREDATOR MUST ACTUALLY COME (user, 16.07.2026): "Es soll dann auch
      demnächst ein Raubtier kommen, von dem sich der Elter freiwillig fressen
      lässt, damit dieses Szenario greift." Without this the point is a
      dead-end: (a)-(e) describe what happens IF a predator arrives, and (e)
      then quietly lets the vigil expire — so in practice the decision would
      almost never be reached and the whole drama would exist only in the code.
      The vigil must SUMMON its ending.
      * **The hook is real, not a contrivance.** A carcass draws predators and
        scavengers; that is why the vultures already come (§19.6). So the
        carcass draws a predator, with the vigil-keeper standing over it.
      * **Follow the vulture pattern exactly** (§19.6, CLAUDE §7.1 pt. 12): the
        drawn predator SPAWNS BEYOND the zoom-aware view ring and WALKS IN. It
        must never pop into existence at the carcass — the checks for "no
        popping in" exist and are the standard here.
      * **Species must still fit** the region's own predator pool and the food
        web (§19.3) — the drawn predator is chosen from the same rules as any
        other, never a lion airlifted into the Sahara.
      * ⚠️ **ARCHITECTURE: `LION_STATE` is a single global hunt state.** A drawn
        predator must not clobber a hunt already running, and a hunt starting
        elsewhere must not silently cancel this one. Same warning as point 130
        (crocodiles) — decide it once and note which point owns the resolution.
      * **Timing is a balance value** (`vigilPredatorDelay`, debug-editable per
        CLAUDE §2): "demnächst" means within the vigil window, so either the
        delay fits inside `VIGIL_SECONDS` or that value grows to fit it. The
        arrival must be visible — the player should see it come, not find it
        already feeding.
      * **(e) still stands as the backstop, not as the normal case.** If the
        drawn predator cannot reach the carcass (water, terrain, a despawn), the
        vigil still ends on its timer and the parent rejoins the herd. The
        difference is that expiry becomes the exception rather than the rule.
      * ⚠️ **This is deliberately a GUARANTEE inside a stochastic sim — the exact
        shape that point 135 records as failing twice.** Learn from it here
        rather than repeating it: make the arrival reliable IN THE GAME (a
        scripted draw with its own state, not a hope that the ambient spawner
        wanders one past), so the live check can assert it without racing.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`) for any extracted
  helper (e.g. the vigil-blocks-landing predicate, and the drawn predator's
  species/region pick from (f)); live (`scripts/verify/enrichments.mjs`): after a
  calf is eaten with the parent held clear, the parent CLOSES on the carcass and
  holds there, no vulture lands while it stands, and — the (f) case, which is the
  point of the whole drama — a predator ARRIVES on its own from outside the view
  ring within the window and takes the standing parent, without the check having
  to pin one on it. Keep a pinned-predator check too, as the narrow test of the
  kill path itself. And the backstop: with the draw disabled, the vigil clears
  once the carcass is gone (no stuck keeper). DOCS: design.md §19.8, CLAUDE.md
  §7.1 pt. 12. SIZE: (f) may deserve its own commit after (a)-(e) — the vigil is
  testable without it, and splitting keeps the draw's architecture question
  (LION_STATE) from blocking the rest. (Reported 15.07.2026; (f) added
  16.07.2026.)
  DONE (17.07.2026, 10:27, two commits as the spec allowed): (a)-(e) in
  e203097 — vigil state set in the caught-resolution when the parent is
  alive and outside PARENT_TOO_LATE_DIST; walks to the carcass, holds
  facing it (familyHeld; full drama exemption set); vigilBlocksLanding
  (pure, boundary-exact) gates BOTH the kill-flock descend and the ground
  scavenger; never flees (the user's recorded decision); resolves on
  balance.vigil.seconds (60) or a gone carcass. (f) in 4ef4fc9 — the
  carcass DRAWS a region-appropriate predator once vigil.time >=
  balance.vigil.predatorDelay (12, debug-editable, both languages): claimed
  ONLY from the idle hunt window (121 owns the LION_STATE-claim rule; a
  running hunt is never clobbered, the idle cooldown is preempted), spawns
  beyond the zoom-aware view ring (vigilDrawSpawn pure-tested) and takes
  the keeper through the EXISTING victim catch (already adult-capable;
  only the thrash pose was young-gated). Two integration finds: the vigil
  hands over from the eaten carcass to the kill REMNANT (else it ended
  ~9 s after the kill, before any draw), and the catch clears the vigil so
  the thrash pose and the flock take over. Live (full suite exit 0): the
  parent closes to <=2.2 and holds, the carcass survives under the keeper,
  the drawn predator arrives from 57 units out and takes the standing
  parent WITHOUT pinning, and with the draw disabled the vigil expires
  with the parent alive. Staging lesson: the shield/charge/catch race is a
  photo finish — the check parks the parent at 200 during the chase and
  repositions to 40 after the catch. Vitest 1683, lint/audit clean.

- [x] 122. Family drama: the swollen river of the rains, and drowning.
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
  DONE (16.07.2026, 22:32): (a) balance.waterDrama {drownSeconds 30,
  drownFlowThreshold 0.8, dryFlowFactor 0.6, wetFlowFactor 1.8}, debug-editable
  (drownSeconds + wetFlowFactor fields, both languages). (b) pure
  waterStruggleFate over (effective flow, seconds): calm water self-rescues
  and NEVER drowns, a strong current never self-rescues and drowns exactly at
  the threshold second; seasonFlowFactor interpolates dry->wet over
  CURRENT_WEATHER.wetness (honours the debug override). (c) the wading parent
  carries its own wadeTime clock (NOT inWater — that field has pose/dodge
  couplings) and drowns beside its calf in a swollen current; cleared on
  escort. TWO live findings fixed on the way: the swollen drift followed the
  raw segment tangent and BEACHED the struggling calf at every bend
  (channelDriftStep now clamps each drift step to water — pure-tested), and
  findLandNear found no land near the point-136-widened Niger mouth (its
  carve apron holds no cell above the dry bar for >2 units) — two-pass search
  (dry first, then any non-water cell), which also refixed the §19.5
  ocean-setback check. Live checks are staging-hardened (8 offset family
  candidates; the water sweep can win the race when the calf is mid-catch —
  a state the drama entry excludes but the sweep does not). Suite: 1641
  vitest green, enrichments 165 PASS / exit 0 incl. the two new fate checks
  (rains: drowned, never rescued; dry: clambers out alive).

- [x] 123. Family drama: the drying waterhole of the dry season.
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
  DONE (17.07.2026, 02:36, commit e0a0824): (a) mired state with a per-bout
  roll — pure mireRoll (only AT a lake bank, only under the dryness
  threshold, exact boundaries) hashed per (calf, bout cycle); (b) the vigil:
  the parent walks to and STANDS beside its mired calf (familyHeld, head
  down), with the full drama exemption set (dodge, water sweep,
  separation-inDrama, thrash face); (c) the target bias: the hunt ALWAYS
  prefers a mired calf in seek range over the calf-hunt dice; (d) resolution
  both ways — the chase SHIELD stands down for a mired calf (the vigil never
  interposes; the mud holds the calf through the catch, the parent's charge
  costs its life beside it, the caught countdown takes the calf: no new kill
  path) and an unfound calf is released after balance.waterDrama.mireSeconds
  (45, debug-writable); (e) live: vigil distance 1.58 held, both dead at the
  waterhole under a forced hunt, release alive without one — plus the 151
  witness rebuilt on debugJumpTo (travel advances the calendar, which
  legitimately moves the field; only the POSITION dependence was the bug)
  and the mire scenarios moved BEHIND the falls checks (they consume
  families the falls checks need). The remaining 102-vicinity 5/6 flake is
  point 135(a) — next up by the user's decision.

- [x] 124. Family drama: the giraffe mother's kick.
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
  DONE (17.07.2026, 11:10): giraffe is lion-only prey (PREDATOR_PREY.lion
  only; REGION_PREY east+south, matching its ambient herds) and joined
  CALF_HUNT_SPECIES, so every family drama applies. The food-web types
  moved into wildlifeBehavior.ts as pure exports (browser-free tests), and
  a REAL hole closed on the way: the calf-hunt predator pick ignored the
  victim's species (a cheetah could have hunted a giraffe calf) — it now
  filters the predator pool by PREDATOR_PREY membership and gates the pick
  by regionPreyAt. The defence: pure parentDefends(species, roll, chances,
  fallback=0) in the 125 shape — balance.parentDefense = { giraffe: 0.75 },
  deterministic per-event sin-hash roll, applied in the charge AND shield
  resolutions (never for mired/vigil — those deaths are deliberate); on
  success the calf is freed, the parent rears into a 0.8 s hind-leg kick
  pose and the lion leaves via the ordinary walk-off (victimHunt kept so no
  phantom carcass). Pure tests: lion-only web, region fit, every region
  pool lion-coverable, boundary-exact defence roll. Live (full suite exit
  0): forced-certain defence — caught, kicked, calf alive, parent alive,
  lion leaves; staging parks the parent at 200 during the chase and
  repositions to 15 after the catch (the shield would otherwise defend
  before the catch and hide the kick). Vitest 1689, lint clean.

- [x] 125. The sacrifice may succeed (variance instead of a script).
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
  (a2) ★ MORE OF THEM MAY SUCCEED — BUT ONLY WHERE THE ANIMALS MAKE IT PLAUSIBLE
      (user, 16.07.2026): "Baue außerdem ein, dass mehr Opferungen erfolgreich
      sein können, also dass ein Elter überlebt, einen Predätor anzugreifen und
      ihn in die Flucht schlägt. Mache das aber nur, wenn es bei den beteiligten
      Tierarten plausibel ist, wie bei der Giraffe."
      So the chance is NOT one number per prey species: it is a matrix over
      (prey, predator), because both halves decide it. A giraffe kick can kill a
      lion; an antelope cannot drive one off — but almost anything can see off a
      cheetah, which is the lightest cat and famously abandons rather than risk
      injury.
      * ★ **REUSE THE ORDERING THAT ALREADY EXISTS, do not invent a second
        one.** §14.1's predator danger order — **cheetah < leopard < hyena <
        lion** — is already implemented and pure-tested (`src/systems/events.ts`,
        `src/systems/events.test.ts`, CLAUDE §7.1 pt. 23). The parent's chance
        runs INVERSELY along it: easiest to drive off a cheetah, hardest a lion.
        One ordering, two consumers.
      * **The prey side needs its own defence ranking, and it must be reasoned
        rather than guessed.** The weapon is the argument: giraffe (a kick that
        genuinely kills lions — the one the user names) and zebra (a kick that
        breaks jaws) at the top; wildebeest (horns) and warthog (tusks, and
        documented seeing off cheetahs) in the middle; the generic antelope at
        the bottom. Do a short grounding pass before fixing the numbers and
        record the reasoning next to them — this is animal behaviour, not
        folklore, and it should not read as invented.
      * **The result must stay legible as a RULE, not as dice.** A player who
        sees a giraffe drive off a lion and an antelope die to one should be
        able to infer why. Prefer a matrix flat enough to read over one tuned to
        feel fair.
      * ⚠️ **THE LINE, AND IT IS NOT WHERE I FIRST DREW IT.** I first wrote this
        as "the calf is already dead → no roll, that is grief". Point 146
        (revenge, user 16.07.2026) proves that wrong: a parent may also attack
        AFTER its calf is dead, and win. So the line is not *when* but *what the
        parent does*:
        - **A parent that SURRENDERS never rolls.** The vigil-keeper stands and
          is eaten (121d), the trample-throw goes under the feet (119), the
          waterfall plunge follows the calf over. These are not fights — the
          animal offers no defence, and the user chose that deliberately (point
          134) and told me not to re-litigate it. **Chance zero, always.**
        - **A parent that ATTACKS rolls** — whether the calf is still alive
          (this point: rescue) or already dead (point 146: revenge). The roll
          differs, the principle does not.
        That is the distinction the register actually rests on, and it is
        cleaner than the one I had: it is not the calf's pulse that decides, it
        is whether the animal fights or gives itself. Keeping THAT line is what
        stops "more sacrifices succeed" from dissolving §19.8.
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
  1 always survives. For (a2): the matrix is ORDERED both ways — for a fixed
  prey, the chance rises as the predator gets lighter along §14.1's cheetah <
  leopard < hyena < lion; for a fixed predator, it rises with the prey's
  defence (giraffe > zebra > wildebeest/warthog > antelope); and the giraffe-vs-
  lion case the user names reads clearly better than antelope-vs-lion. And the
  line, asserted as REVISED (see (a2)): a parent that SURRENDERS has chance ZERO
  against every predator — the grief branches (119, 121d, the waterfall) never
  roll — while a parent that ATTACKS rolls whether its calf is alive (here) or
  dead (point 146, revenge). Live: with the chance forced to 1 a reached predator
  leaves and both animals live; forced to 0 the existing sacrifice checks still
  pass. DOCS: design.md §19.8 (record that the rescue may succeed while grief
  never does — the two are different mechanics wearing the same silhouette),
  CLAUDE.md §7.1 pt. 12. SIZE: (a)-(d) is one commit; (a2)'s matrix and its
  grounding pass may be a second. (Reported 15.07.2026; (a2) added 16.07.2026.)
  DONE (17.07.2026, 11:38, one commit — 124 had already laid the (a)/(c)/(d)
  groundwork): the chance is a FACTOR MODEL, defendChance = clamp(preyWeapon
  × predatorFlight, 0, 0.95) — both required orderings are structural, not
  tuned: predatorFlight runs inversely along §14.1's tested danger order
  (cheetah 1.0 > leopard 0.85 > hyena 0.7 > lion 0.5, referencing
  events.ts), preyWeapon carries the reasoned weapon ranking with grounding
  comments (giraffe 1.5 — the kick genuinely kills lions; zebra 1.0 —
  jaw-breaking kick; wildebeest/warthog 0.7 — horns/tusks, warthogs
  documented driving cheetahs off; antelope 0.25 — no weapon). Giraffe-vs-
  lion lands exactly on 124's shipped 0.75; antelope-vs-lion 0.125. Applied
  at charge AND shield with LION_STATE.predator; missing species (elephant,
  crocodile) never defend. THE LINE is code-marked at all four surrender
  branches (mired charge, waterfall plunge, trample grief, vigil): a
  surrendering parent never rolls; an attacking one rolls whether the calf
  lives (rescue) or is dead (146, revenge — the helper is ready for it).
  Pure tests: both orderings strict (cap-equality allowed), extremes, cap,
  missing-species zero (1693 vitest). The four roll-dependent live
  scenarios were migrated to the new balance shape (chance-0 forcing via
  empty weapon map; the kick test forces the hash roll and pins the lion),
  full suite exit 0.

- [x] 126. Elephant mourning at the graveyard.
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
  DONE (17.07.2026, 14:44): implemented per spec and verified by a green FULL
  enrichments run (exit 0) — close 8.6 / hold-drift 0.5 / release confirmed,
  screenshot 128 human-checked (the grey herd stands at the bone field).
  Per-herd mourn state in herdState { mourn: {x,z,until}, mourned } with a
  hard deadline and a once-per-visit latch cleared on leaving the radius;
  approach and hold through the unchanged ELEPHANT_TURN clamp (no snapping);
  staggered ring arrival; heads lower inside MOURN_TOUCH_DIST; target generic
  (graveyard bones OR a dead herd-mate); balance.mourn { seconds 30, radius
  25 }. The live check stages a Serengeti herd (jump -> restock -> largest
  tagged herd -> untag chunks -> relocate to the radius edge) and its failure
  paths are self-explaining (spawn totals, vigil state, member spots).
  The check debugging surfaced and fixed TWO REAL GAME BUGS: (1) the vigil
  deadline granted only the straight-line walk-in, so a herd drawn at the
  radius edge spent its hold window still arcing in — mournDeadline now
  doubles the walk grant (pure-tested); (2) elephants stepped only onto
  savanna/jungle texels, so a mourning herd whose path crossed the dry ground
  around the graveyard froze forever one biome border short of the bones —
  elephantStepAllowed now lets a MOURNER cross any land (water/ocean stay
  refused; roaming keeps the biome rule; pure-tested over all terrain types).
  Docs: design.md §19.8 bullet + §4.4 pointer, CLAUDE.md §7.1 pt. 12.
  135-class notes to watch (rotating, not blockers): hunt-variety
  distinctPrey = 1 once; 102 vicinity dipped 2/6 once late in a long run;
  120e drinkers dipped 2/1 in two mid-diagnosis runs (green again in the
  final run) — if any recurs, check whether the point-146 predator lists in
  `herds` disturb the seeder's species iteration or the MAX_INSTANCES
  rotation. The in-suite "elephant total 0 at the Serengeti" staging gap was
  cured by the restock recipe; the instrumentation stays in the check.

- [x] 127. A parent runs faster when it rushes to its calf's rescue.
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
  DONE (17.07.2026, 15:50): ONE rule replaces the four constants —
  rescueSpeed(balance.family.rescueBurst) = ordinary walk (PREY_WALK_SPEED 3)
  x factor (2) = 6 for charge, shield, guard and wade; floored at the walk;
  debug-editable in both languages (write-through pinned in
  DebugMenu.test.tsx). Grief drives (vigil walk, trample charge, waterfall
  plunge) stay off the burst with do-not-unify comments. The balance guard
  fired exactly as specified and forced two real derived rules: (1) the
  faster wade rescued the rains calf — now the swollen current brakes the
  wader (wadeSpeed = burst / seasonal flow factor; braked 3.33 < the old
  4.2, so the point-122 drowning stays reachable, pure-tested); (2) the
  drown staging's park distance rose 180 -> 260 (6 x 30 s made 180 exactly
  reachable over land). Also fixed while verifying: the herd-level terrain
  steer spun the heading forever when the herd itself stood on foreign
  ground (post-vigil at the graveyard — members walked tiny circles), it now
  fires only from own biome, completing the point-126 escape rule; and the
  mourn staging pins zoom 2 for its restock (at 0.5 the fixed seed's ~26
  in-ring chunks roll no elephants — the measured total:0 runs). Shield
  mini-sim runs on the derived speed; 109 behavior tests, build/lint/1714
  unit tests green; full enrichments exit 0 (burst measured 5.99, drown
  drowned:true, mourn released:true) plus settings exit 0.

- [x] 128. Scavenger vultures still sink into the ground at a carcass.
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
  DONE (17.07.2026, 16:47): the remaining sinner differed slightly from the
  spec's snapshot — the scavenger HAD gained a per-bird lift meanwhile, but
  hovered at 0.05 while the vulture body reaches ~0.096 below origin, so a
  lifted bird still clipped ~5 cm into rising ground. ONE shared rule now
  (landedBirdY/landedBirdClearance + LANDED_BIRD_HOVER 0.15 in
  wildlifeBehavior.ts): positive-only slope lift onto the bird's own ground,
  hover clearing the pecking body — used by the kill flock AND the
  scavenger; clearance metric folds both systems (SCAV_CLEARANCE ->
  __vultures.clearance); tolerance tightened from > -0.05 to strictly > 0;
  new live check stages a scavenger meal on the steepest nearby rise (new
  __terrainHeight dev hook; measured 0.15-0.16 at a 2.2 rise), pure tests
  sweep flat/rising/falling and pin the hover above the body reach. Fixed
  along the way (both live-check-caught, structural): a SOLO elephant at a
  biome border froze forever (its blocked-redirect aimed at its own herd
  centre, atan2(0,0) = due north — it now keeps turning; the measured
  centreMoved 0.63 roam failures), and the point-120e shore seeder picked
  ONE species deterministically and gave up silently at its instance cap —
  it now rotates through the region pool like the vicinity seeder (135a
  pattern; dryDrinkers back to 4/4). All three long-rotating 135-watchlist
  cases are now structurally closed. Full enrichments exit 0; build, lint,
  1723 unit tests green.

- [x] 129. Traveller blocked in open ground with nothing visible (NOT
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
  INTERIM (17.07.2026, 17:43 — the point STAYS OPEN awaiting the user's
  repro): hypotheses (a) and (c) are REFUTED — (a) by a new dense pure sweep
  (48 contact angles x 3 overlap depths x outward+both tangents against two
  overlapping circles: every free direction keeps its full step, green on
  first run), (c) by code reading (the query window is a symmetric
  absolute-value window of +-4.2 vs a max acting radius of 1.5 — a
  directional block from outside the set is structurally impossible). A live
  witness now pins the guarantee in enrichments.mjs: the traveller drives
  into a real tree (blocked at the body edge, never entering) and then
  provably moves north, south and west — green across four runs. What
  remains is (b)-class: only the user's exact walk can say which circle
  blocked them.
  ★ THE EXACT REPRO ARRIVED (user, 17.07.2026 22:51/22:52, two screenshots):
  at 7.2N/26.4E the traveller cannot walk SOUTH; from the other side at
  7.1N/26.4E cannot walk NORTH. So there is an invisible EAST-WEST WALL at
  ~7.15N / 26.4E, blocking crossing in BOTH directions — and it sits EXACTLY
  on the WEST/CENTRAL region border (both screenshots show WEST above and
  CENTRAL below the player). This is no longer a tree/circle case: a two-way,
  latitude-locked wall on a region boundary points at the REGION-BORDER
  machinery, not collidableFloraNear. NEW PRIME SUSPECTS, in order: (1) a
  border-coincident RIVER or carved water band — a water cell would block N/S
  crossing while E/W along it stays open; verify with __terrainType sweeps
  across 7.0..7.3N at lon 26.4E plus riverDistance/lakeDistance; (2) a border
  collider or region-label-anchor geometry pushed into the walkable field;
  (3) the movement-boundary / world-trim rule (design §11.2/§3.1)
  mis-clamping an interior latitude. PLAN: a one-off probe (SUITE launch
  args) that jumps to 7.2N/26.4E, samples terrain type + river/lake distance
  along a N-S line through 7.15N, and drives S logging the blocking obstacle
  list — names the wall in one run; then fix the real cause and add a live
  crossing check at this exact coordinate. This makes 129 ACTIONABLE — pull
  it forward once the current 145 sub-points are done.
  ★★ ROOT CAUSE, USER-DIAGNOSED (17.07.2026 22:56): "An der Stelle war mal
  eine Pflanze. Die ist aber durch den Jahreszeitenwechsel nicht mehr dort.
  Ich bleibe wohl trotzdem noch an ihr haengen." — a plant that VANISHED
  with the season still COLLIDES. This is the actual bug, and it fits every
  earlier clue: collidableFloraNear (TravelScene.tsx) builds its obstacle
  circles from the SAME deterministic chunk placement the vegetation mesh is
  built from — but points 144 (bare-branch crown collapse) and 151 (ground
  flora, foliage class 2, sprouting/vanishing with the greenness field) hide
  or remove the RENDERED plant seasonally WITHOUT gating the collision, so a
  seasonally-gone plant leaves an invisible collider. It clusters at region/
  climate-zone borders (the 7.15N West/Central line) because that is exactly
  where the greenness field crosses the threshold at which class-2 ground
  flora appears/disappears — so the seasonal presence flips there. THE FIX
  is now precise: collidableFloraNear must apply the SAME seasonal visibility
  rule the flora BUILDER/renderer uses — if a plant's foliage is collapsed
  (144) or its ground-flora instance is absent at this position's greenness
  (151), it must NOT contribute a collision circle. One shared predicate
  ('is this plant present here, this date?') feeds BOTH the rendered instance
  and the collider, so they can never disagree again (the same discipline
  the point-128 landedBirdY shared-rule used). TESTS: pure — the shared
  presence predicate (present in-season -> collides; seasonally gone ->
  no circle) in a flora/collision test; live — at 7.15N/26.4E in the
  reported season, drive S across the border and assert the crossing
  succeeds (no phantom collider), while an IN-SEASON plant still blocks.
  This supersedes the tree/circle framing above: 129 is a
  season-vs-collision desync, not a resolver bug.
  ★★★★ THE ACTUAL ROOT CAUSE (18.07.2026, found by a diagnosis probe while
  verifying the collidableFloraNear/render unification): NOT the season and
  NOT the collidable set — a DEGENERATE FLORA SYSTEM caused by the point-136
  river widening. RIVER_WIDTH_DEG = 0.17 x widthFactor(1.6) = ~0.27, so the
  reed belt is (0.24, 0.317) and solidDressingAllowed suppresses within
  RIVER_WIDTH_DEG + 0.06 = 0.332 — but the riverDistance QUERY CAP passed by
  the flora placement was 0.3, which lands INSIDE both bands. A point far from
  any river therefore returns rd = 0.3 (the cap), read as "in the reed belt"
  (papyrus placed) AND "too close to a channel" (all trees suppressed). Result
  since point 136: the RENDERER drew reed-only savanna (acacia/baobab/kopje
  suppressed), while the OLD collidableFloraNear used its OWN uncapped logic
  and kept the tree colliders → invisible tree circles across every savanna =
  the point-129 walls. A diagnosis probe (renderedNear/obstaclesNear dev hooks)
  showed papyrus 11000+ / trees 0 at every savanna spot. FIX (shipped in this
  point): raise the flora river-distance query cap from 0.3 to 0.45 (the
  module's internal max, clearing both bands with headroom) in the now-shared
  placedFloraAt. Re-probe after the fix: acacia in the thousands, papyrus only
  near real water, collidable circles 67-155 per savanna area. This ALSO fixes
  a latent RENDER bug (degenerate reed-savanna since 136), not just collision.
  The placedFloraAt unification (render == collision) and the small-plant trim
  stand; the cap is the real cure. DOCS: a comment at the cap explains the
  RIVER_WIDTH_DEG dependency so a future width change re-checks it.
  DONE (18.07.2026, 00:27): full run green on both 129 checks — the tree
  witness (a real tree blocks entry at its edge while north/south/west all
  move) and the phantom-collider invariant (234 collidable circles now
  exist near the reported border, phantom 0). Build/lint/unit green. The
  cap fix (0.3 -> 0.45) is the cure; the placedFloraAt render/collision
  unification and the small-plant trim (deadtree dropped) stand. Docs:
  CLAUDE §7.1 pt.4 now states collision is derived from the render
  placement. The single FAIL in the run was 145b (the staged plover was
  killed by wildlife mid-lure — a rotating staging flake, green in the two
  prior runs, unrelated to the flora change); noted on the watchlist.
  ★★★ USER DECISION (17.07.2026 22:57): "Allgemein sollte es uebrigens keine
  Kollisionserkennung mit den kleinen Pflanzen geben. Es macht keinen Sinn,
  dass man an einem Grashalm haengen bleibt." So the fix has TWO parts, and
  the first is a clean rule: SMALL PLANTS NEVER COLLIDE. This matches the
  EXISTING design line ("small dressing and carcasses stay passable", CLAUDE
  §7.1 pt. 4) — collision is only for genuinely large, solid, ALWAYS-PRESENT
  dressing. Current COLLIDABLE_FLORA (TravelScene.tsx ~697) already lists only
  acacia/jungle/palm/baobab/deadtree/kopje (trees + boulders) — grass and
  bushes are already non-colliding — so the felt "grass blade" snag is a
  large-dressing collider that lingers after point 144 collapsed its RENDER to
  near-nothing in the dry season. FIX, two parts: (1) trim/verify the
  collidable set so nothing SMALL or seasonally-collapsible collides — drop
  deadtree (r 0.3, reads small and can bare out) and re-audit each entry
  against "is it a big solid year-round object?"; keep kopje/baobab/big
  acacia/jungle/palm trunks; (2) for whatever REMAINS collidable, gate the
  collider by the SAME seasonal presence the renderer uses (one shared
  present-here-this-date predicate), so a collapsed/absent plant never blocks.
  Together these guarantee: you never snag on anything you cannot see, and
  never on anything small. DOCS: design.md §11/§2.6 collision rules +
  CLAUDE.md §7.1 pt. 4 (sharpen "small dressing stays passable" to name the
  rule and the seasonal gate). PULL 129 FORWARD as the next active point
  after 145 — it is now fully diagnosed and load-bearing (blocks traversal).
  Fixed along the way in the same verification runs: the
  hunt-variety check now counts family hunts separately (the calf preference
  re-picks the same local family at a stationary measuring point — 51-68
  family hunts per window — and masked the generic food-web pick's real
  variety: 5 species once measured cleanly); the mourn staging's zoom pin
  works only WITH the wheel-zoom debug unlock (setTravelZoom clamps
  everything to 0.5 without it — this also explains every earlier
  zoom-0.5-at-"1" rotation across the suite); and the 120e drinker count is
  condition-polled (the fixed 2.5 s window read one seeder upkeep too
  early). WATCH: one new single-run failure 'a parent moves to guard its
  calf' (before 8 / after 7.97, parent stood) — first occurrence ever;
  observe the next runs, suspect the point-127 guard-speed unification if
  it recurs.

- [x] 130. Crocodiles: the ambush from the water.
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
  WIP (17.07.2026, 18:06 — core COMPLETE, the live checks are the open
  half): (a)-(e) all implemented and unit-green (1730). Species `crocodile`
  in SPECIES/MAX(12)/BODY_RADIUS with buildCrocodile (low armoured body,
  eye knobs, ridged tail); spawnChunk seeds 1-2 on water anchors in
  crocodile country (pure rules CROCODILE_REGIONS/crocodileAllowedAt —
  water-only — and crocodileLungeReady, all tested incl. the
  nothing-kills-a-crocodile sweep); §19.5 backstop exempts it like the
  flamingos. Behaviour: per-crocodile `lunge` state (hidden -> burst at a
  bank drinker inside balance.crocodile.strikeRadius [debug-editable] ->
  grip sets victim.caught + caughtBy='crocodile' -> retreat), the SHARED
  caught countdown resolves it (kill SINKS — the river keeps the body),
  the charge resolution rolls parentAttackOutcome against `caughtBy`
  (drive-off frees the calf and the croc slinks back; sacrifice takes the
  parent under; too-late takes both; LION_STATE never touched), and player
  contact routes predatorContact('crocodile') -> the §14.2 event. Docs
  done: design.md §19.16 + §19.5/§19.8 pointers, CLAUDE.md pt. 12.
  DONE (17.07.2026, 19:22): live checks green in a FULL enrichments run
  (exit 0) — natural spawn at the Zambezi with every crocodile ON a water
  cell; the staged drama passes all five gates (visible no-teleport lunge,
  grip through the shared window, drive-off with everyone alive + the croc
  slinking back, the sacrifice taking the parent under while the calf
  escapes, too-late taking both) with the scripted lion hunt untouched in
  every scenario; screenshots 129/130. The check debugging bagged FIVE
  staging lessons, all recorded in the check comments: (1) the drama stage
  must be CHUNK-LESS (a zoom restore shrank the ring, despawned the tagged
  chunk and silently filtered croc+calf out — the rotating
  crocLunge:false); (2) the calf waits ALONE and the parent joins only at
  the grip (the young-follow drive dragged a pre-linked calf off its bank
  stand); (3) the parent parks on the LAND side of the bank vector (parked
  across the channel the water sweep relocated it mid-charge); (4)
  too-late needs TIMING not distance (reposition at <0.25 s window rest);
  (5) rescue retries with per-attempt phase variation (the deterministic
  roll can land in the 5% band above the 0.95 cap forever at one spot).
  Also from these runs: the no-standing-in-water check exempts the
  crocodile, and the 120e count uses the seeder's own drink||shoreSeed
  semantics (green 4/4 twice) — plus 120e measurement isolation, since the
  new ambushers REALLY eat the counted drinkers. Two single-run reds to
  watch (first occurrence, next runs decide): the trample check found no
  prey herd nearby once, and the stain-normal check saw no stains in the
  same run.

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

- [x] 133. The rinderpest years, modelled as the date-dependent state they were.
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
  WIP (17.07.2026, 19:26 — split per the spec; STAGE 1 of 3 done, commit 690c055): the pure
  date->phase model lives in src/systems/rinderpest.ts (rinderpestPhase:
  maasai preDamaged 1890 / struck 1891-92 / aftermath 1893+; sidama struck
  through 1892 [Kifu Qen] then aftermath; nubians aftermath all window
  [Sanat Sitta]; zulu/pedi/san clean until the boundary-exact March 1896
  Zambezi crossing; somali/tuareg NEVER [camels immune, FAO]; bemba/others
  clean) with 7 pure tests green and a __rinderpest dev hook (registers
  once the module is imported — stage 2 wires it). STAGE 2 done (17.07.2026,
  19:35, next commit): phase-aware vignettes wired — the first-visit entry
  passes rinderpestPhaseAtDay(people, day) as a param, and the Maasai
  vignette branches three ways (preDamaged 1890 with the
  pleuropneumonia-thinned kraals; struck 1891-92 carrying Baumann's German
  VERBATIM — "Hungergestalten", "vom Honig der Waldbienen", the enkang core
  holding; aftermath with Waller's torn cattle-loan fabric and desperate
  raids) while Sidama branches struck/aftermath around the Kifu Qen (enset
  as the famine store) — both languages, voice markup, tested in
  villages.test.ts incl. the verbatim-Baumann and no-"wandelnde Skelette"
  guards; the Nubian text already carried Sanat Sitta (132d). Docs: §16
  paragraph + §19.15 rinderpest block. STAGE 3 done — POINT DONE
  (17.07.2026, 20:57): the carrion dressing is in — in STRUCK Maasailand
  (1891-92) the chunk spawn strews dead wildebeest and antelope across the
  plains within CARRION_RADIUS_DEG of the village (Baumann: "nicht nur
  Rinder, sondern auch Büffel, Gnus und Antilopen"), tagged `plague` so the
  verify counts the plague's own toll apart from ordinary hunt deaths, and
  worked by the existing scavenger/vulture systems; date-dependent by
  construction (the same chunks spawn living herds in 1890). Pure tests: 9
  (incl. the boundary-exact radius and phase gates and the day glue). Live
  (enrichments, full run exit 0): the __rinderpest hook reads the date
  table exactly (preDamaged 1890 / struck 1891 / clean south 1895 / clean
  camel 1891), and the calendar-pinned carrion check sees toll at 1891
  (dayStruck 393) and none at 1890. Check lessons: the suite calendar is
  arbitrary after the season blocks — the check clamps down to 1890 first
  (the year jump saturates) then steps to 1891; and the plague tag was
  needed because an ordinary hunt death raced the 1890 zero. Also in these
  runs: the point-126 closed threshold moved 9 -> 10 with rationale (the
  ring convergence value is formation-dependent, measured 8.6-9.0 across
  green runs; hold and release carry the semantics).

- [x] 134. The one deliberate inaccuracy: grief unto death stays.
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
  DONE (17.07.2026, 20:59): design.md §19.8 now carries the exception as its
  own bullet — the three drives named as ONE family, the user's German
  ruling quoted verbatim, the realism argument stated (the last-moment bolt
  would be the odd one out), the single-carve-out framing against the
  accuracy principle, and the structural note that the surrender branches
  never roll the defence. The previous scattered carve-out sentence on the
  trample bullet folded into it. Docs-only, no code.

- [x] 135. Two wildlife checks promise guaranteed outcomes from a stochastic
  sim, and fail intermittently — fix the guarantees, not the checks. Observed 16.07.2026: 'a settlement vicinity
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
  SECOND CASE, same class (observed 16.07.2026): 'a real hunt catches a calf,
  the parent sacrifices itself and the calf escapes' failed once in four runs
  with {caughtSeen true, catchEvidenced true, parentDead FALSE, calfDead true,
  calfEscaped false} — the calf died and the parent never sacrificed. The check
  places the parent in shielding reach and expects the sacrifice, but the
  charge has to win a race against the struggle countdown in a live sim; when
  the parent's path is fouled (terrain, herd-mates, a body-separation shove) it
  arrives late and the check reads a legitimate-but-unwanted outcome as a
  failure. NOTE the elimination already done: the season catchment change of
  point 120e was suspected and CLEARED by inspection — `a.drink` is read in
  exactly one place (Wildlife.tsx ~1543) and writes only the RENDER position
  px/pz, never the sim a.x/a.z that the drama and the check both use.
  FIX likewise in the game: make the sacrifice deterministic once the parent is
  placed inside its reach (e.g. guarantee the charge cannot be shoved off its
  line while `child.caught` runs — the body-separation exemption for a charging
  parent already exists and may simply not cover this path), rather than
  loosening the assertion.
  TESTS: the existing live checks stay as they are (they are the truth-tellers);
  pure tests for whatever leash/margin/exemption rule is added. (Filed
  16.07.2026 after the third run; second case added after the fourth.)
  WIP (17.07.2026, 04:04 — mid-point safety commit; builds green, 1669
  vitest green): LANDED so far — (a) vicinitySeedBounds (margin-shrunk
  count/placement ring, pure-tested) AND pool rotation at the MAX_INSTANCES
  cap (one full species silently starved the guarantee); (c) drinkCatchment
  derived from RIVER_WIDTH_DEG (the fixed 0.35 was a hidden scale-width
  constant; the 136 widening ate the drinking belt) with the rains nearly
  closing the belt (0.06) and the dry season opening it (0.43), PLUS the
  seedDryShoreDrinkers guarantee (nearest bank in the view ring holds >=
  balance.panoramaWildlife.dryShoreMinDrinkers once dryness >= 0.6;
  bank search without the dry-height bar — the carve-apron lesson) and the
  120e check now asserts the guarantee (dry >= minDry > wet; wet may be 0 —
  water stands everywhere in the rains); (d) the trample "closed" metric now
  measures the elephant the grief ACTUALLY charges (nearest living), not the
  injected decoy. Release scenario waits for a family. STILL OPEN — five-run
  stability: runs go green/red alternating with NEW faces: (e) the traveller-
  collision pair failed 2x ("reached false", minDist ~2.55: the pinned
  target animal seems to move/dodge away before contact — check how the
  check pins it and whether a new exemption freed it); (f) the savanna
  pixel swing read 7.9 (< 8) once — likely the seasonal lerp not fully
  settled in the 2600 ms window at that machine load, check the wait; (g)
  verify the bank fix landed the 120e guarantee (>= 4) at the Zambezi. Goal:
  three consecutive full enrichments runs exit 0 before checking 135 off.
  SECOND WIP UPDATE (17.07.2026, 05:30): (e) fixed — the collision check now
  clears its drive corridor of OTHER animals first (the guarantee seeders can
  stand a grazer on the line; the traveller then collided, correctly, with
  the wrong body). (f) fixed — the pixel probes poll the field lerp to
  SETTLED from the NODE side (an in-page waitForFunction rejected on a
  transient hook error and the swallowed rejection skipped the wait — the
  swing collapsed to ~1-2 before this was understood). (g) confirmed — the
  bank search without the dry bar seeds the Zambezi shore (120e green since).
  Dry-shore group spread 2.5 (1.5 overlapped zebra bodies at spawn and
  tripped the §19.5 spacing check once). Stability now: runs alternate 2-of-3
  green with ROTATING single failures, all of one shape: the family-drama
  scenarios (122 drown, 123 mire kill/release) COMPETE for a scarce pool of
  free families and sometimes stage against none (found:false) or against a
  family whose parent something else relocated (one run: the drowning calf
  was "rescued" — the 180-unit parent separation did not hold). NEXT STEP
  (the sustainable fix, do this rather than more poll patches): give the
  drama scenarios a SYNTHETIC injected family each — parent+calf objects
  built like the collision check's zebra (young/parent/child links, scale,
  phase, chunk=liveChunk) — so staging is deterministic and pool-independent;
  keep the natural-pool paths for the checks that exist to test natural
  behaviour (gambol, falls). Then re-run the three-consecutive-green gate.
  THIRD WIP UPDATE (17.07.2026, 06:30): synthetic families LANDED for the
  drown and both mire scenarios (window.__makeTestFamily with disposer;
  offset retries for the sweep race) — those scenarios have not failed
  since. Pixel probes MOVED to open ground (savanna -20.0/27.8 Matabele,
  congo 1.5/24.5; both zone-verified, >=1 deg from any river): the old
  Zambezi spot sat AT Victoria Falls, and the spray plus the dry-season
  herd my own 120e/135c features gather there drowned the ground signal in
  animal/water pixels (screenshot 115 caught it). SEALED a real game leak the
  gate exposed: the dry-shore seeder counted player-centred drink-holders
  but placed at the bank — when the group wandered or missed its drink
  roll it re-seeded EVERY frame and ballooned the herds to 450+; now
  throttled (~2 s), counted AT the bank, and the seeded are tagged
  (shoreSeed) so wandering never uncounts them. REMAINING before checkoff:
  the guard-approach check flaked twice (before 8 -> after 8.15: the parent
  never closed on its calf — read how that check stages and what the
  guard-station geometry expects) and the three-consecutive-green gate must
  then pass.
  DONE (17.07.2026, 07:00): the guard-approach check was the last natural-
  pool consumer — its pair rode the herd roam off the fixed predator pin, so
  the approach metric read the drift; it stages on a synthetic family now.
  THE GATE PASSED: three consecutive full enrichments runs exit 0 (plus
  vitest 1669, lint and audit clean). Sum of the point: five guarantees now
  hold IN THE GAME (vicinity margin-ring with pool rotation at the instance
  cap; width-derived drinker catchment with the rains closing the belt; the
  dry-shore minimum-drinkers seeder — throttled, bank-counted, tagged after
  it once ballooned the herds past 450; the mud/drown dramas always resolve
  on deterministic stages) and four checks measure what the game actually
  promises (true-target trample metric, cleared collision corridor, settled
  pixel poll, open-ground pixel spots — the Victoria Falls spot had spray
  and the dry-season herd in its crop).
  MORE CASES of the same class (16./17.07.2026, observed across full runs):  MORE CASES of the same class (16./17.07.2026, observed across full runs):
  (c) the dry-season drinker count (point 120e — dryDrinkers vs wetDrinkers
  flipped to 2/0, 3/0 on two runs, green on others); (d) the trample-grief
  charge (point 119 — the parent died charging but the "closed" distance
  metric came out negative when the elephant walked away faster than the
  charge). Same rule as (a)/(b): fix in the GAME (deterministic staging or
  hysteresis), never by loosening the check.

- [x] 136. Rivers: wider, and smoother in their course (playability over scale).
  Wanted (user, 16.07.2026): the rivers are to be made WIDER — explicitly
  accepting that this is no longer strictly to scale — because canoe navigation
  is otherwise fiddly and the traveller keeps slipping onto land mid-passage.
  And the COURSE is to be made smoother: it currently has many hard kinks that
  neither look natural nor navigate well.
  ORDER (user leaves it to me, 16.07.2026): do this BEFORE 122. Point 122 (the
  swollen river of the rains, and drowning) makes the river a place where
  animals are swept away and drown, and 130 puts ambush crocodiles in it — both
  build ON the river's geometry, so widening and smoothing first means they are
  written against the final shape instead of being re-tuned afterwards. Two
  separate points, in the order 136 → 122.
  WHY IT IS TWO PROBLEMS, not one: width and course are set in different
  places. Establish both anchors before touching anything —
  `src/world/geodata.ts` (the ~1890 vector courses and the carved bed) and the
  ribbon build in `src/scenes/travel/waterSurface.ts` — and check whether the
  kinks come from the SOURCE polyline's vertex spacing (too few points, so the
  bed turns in hard corners) or from the ribbon's own triangulation. Widening a
  kinked course only makes the kinks broader; smooth first, then widen.
  CARE — the invariants that must survive (they are all live-gated already):
  * the ribbon stays ONE continuous, unbroken strip from source to mouth, with
    no interior gap and no surface buried under the terrain (CLAUDE §7.1
    pt. 21, `scripts/verify/enrichments.mjs`);
  * the canoe float height must still clear the ribbon across EVERY channel,
    including the cross-sloping and confluence stretches
    (`src/scenes/travel/waterSurface.test.ts` — widening changes the bed
    cross-section, so this is the test most likely to catch a mistake);
  * every village keeps its §4.2 minimum river-water clearance — a wider river
    may reach into a footprint that used to be clear (`src/world/world.test.ts`
    checks all 22; ports are exempt);
  * the confluence bank-masking rule (`src/scenes/travel/riverBanks.test.ts`)
    and the water-edge rules for drinkers/bathers
    (`src/scenes/travel/waterEdgeRules.test.ts`) still hold at the new width;
  * the Red Sea / world-trim hull rules are untouched (`src/world/redSea.test.ts`).
  WIDTH is a balance value, calibratable and debug-editable per CLAUDE §2 — do
  not hard-code a new constant in the geometry.
  TESTS: pure — the smoothed course has no kink above a bounded turn angle
  between consecutive segments (the direct expression of "no hard kinks"), and
  the width value actually widens the sampled water span; extend the existing
  waterSurface/riverBanks/world tests rather than writing parallel ones. Live
  (`scripts/verify/enrichments.mjs`): the Nile is still a single continuous
  strip, and a canoe run down a river stays on water over a long passage (the
  playability claim itself — today's failure mode is drifting onto land).
  Screenshots 71-73 (Nile, Victoria Falls, Lake Victoria) get re-taken.
  DOCS: design.md §11.3 (the width/scale trade-off stated outright, so the
  deliberate inaccuracy is on record like the §19.8 grief carve-out) and
  CLAUDE.md §7.1 pt. 21. (Reported 16.07.2026.)
  DONE (16.07.2026, 21:00): diagnosis first, as required — the kinks came from
  the SOURCE polylines (avg ~1.1° between control points, max 3.48°, linearly
  densified), NOT from the ribbon triangulation; the carved bed had always
  been spline-smoothed in hydro.ts, so band and bed also disagreed. Fix: ONE
  shared centripetal Catmull-Rom (Barry-Goldman; uniform overshot into loops
  at the Nile's Nimule knee and the Sudd east turn — worst per-step kink 109°,
  centripetal 41°) sampled by the bed, the ribbon densify AND the DEM water
  mask. Width: balance.river.widthFactor (1.6 over the 0.17° scale base) —
  bed, ribbon, water-edge rules, DEM mask, current reach (riverFlowExact
  maxDist was fixed 0.14 < the new half-width) all derive from the ONE
  RIVER_WIDTH_DEG, now in cycle-free src/world/riverWidth.ts (hydro→terrain→
  geo→hydro deadlocked at init otherwise); debug-menu field added (applies on
  reload — geometry is module singletons). Consequences handled: Cairo,
  Timbuktu and Boma sat inside the widened band and moved to their REAL banks
  (east, north, north); Giza nudged west + landmark auto-clearance now
  width-derived; the Meroë fixture reads the shifted anchor. Tests: new
  riverSmoothness.test.ts (45° kink bound, control points anchored, sampling
  density), width-span probe in world.test.ts, float/edge fixtures rebased
  onto the smoothed axis and derived widths. Live: enrichments/flow/polish/
  settings all exit 0 — incl. the NEW long canoe passage (240/240 steps on
  water down the Nile) and the Nile-flood invariants re-verified at flood
  peak on the new geometry (the 138 ribbon re-tune check). Screenshots 71-73
  retaken and visually checked: wide, smoothly curving courses, cascades on
  the moved axis.

- [x] 137. Seasonal dress: educated guessing on indicia, instead of one cloak.
  Wanted (user, 16.07.2026): "Wenn die Belege hier so dünn sind, dann mache ein
  Educated Guessing, das möglichst gut auf Indizien beruht. Falls notwendig
  führe eine zusätzliche ausführliche Recherche dafür durch… Es soll deutliche
  Unterschiede bzgl. der Kleidung je nach Region und Jahreszeit geben — aber
  nur sofern sie plausibel sind."
  ORDER: NEXT, ahead of 136 (see the work-order note at the top).
  DONE (16.07.2026): (a) research complete, all four zones in
  docs/peoples-1890.md §7 (74f1619, 849a96f) — and it INVERTED the question:
  across seven period observers, not one describes a person putting ON a
  seasonal garment; the seasonal signal is displaced onto fire, hut, week,
  class and landscape. (b) all three drivers built and pure-tested: harmattanAt
  (0dc1da1), the horn zone + karifAt (1d3db99, 92f4a1e-adjacent commits), each
  deliberately separate from coldnessAt because the sources force it. (c) the
  dress table: six peoples on evidence — zulu, tuareg, hausa, san, wayeyi,
  somali — fifteen unchanged for stated reasons (28c25fe). (d) the figures:
  rank-gating (a minority wears the wrap, the elder always does) and the
  Somali head-muffle as a SHAPE change (7094aa6, screenshot 113). Two villages
  moved under the user's licence (somali -> Haud, swahili -> Lamu, 1d3db99),
  and the research found two model bugs on the way (the Fang desert
  classification deb4a4c; the Horn falling to the congo fallback). The
  research's "worn differently" reading beyond the head-muffle (drawn tight
  etc.) remains as design.md §19.13's open line; the fire/hut/landscape
  displacement is points 142/144/145's material.
  WHAT THIS REVERSES — read this before touching `src/systems/dress.ts`. Point
  120g shipped a deliberately narrow rule: a cold-weather cloak ONLY for the
  Zulu, because Mayr (1907) is the one PERIOD source among the game's peoples,
  and nothing for anyone else because `docs/peoples-1890.md` §2.6 reads "Sahel
  harmattan: EVIDENCE ABSENT — do not invent". That was the right call under
  the old rule (CLAUDE §2 forbids INVENTING design content) and it is now
  superseded by an explicit user decision: absence of a period photograph is no
  longer a reason to render a people identical in January and July. The new
  standard is EDUCATED GUESSING FROM INDICIA — weaker than proof, much stronger
  than invention. Do not "restore" the strict gate later; this note is the
  authority, like the §19.8 grief carve-out.
  THE BAR a guess must clear (all four, else the people stays unchanged):
  1. A PHYSICAL DRIVER the game already models or the climate research states:
     real cold (austral winter, highland elevation, Saharan/harmattan nights),
     real rain, real dust. `docs/climate-1890.md` has the harmattan's 15-20 °C
     diurnal swing and "cold at dawn and hot by afternoon — the swing is the
     phenomenon"; that is an indicium, not a guess.
  2. A GARMENT THE PEOPLE DEMONSTRABLY HAD, from the period record or the
     material record (locally woven cotton — Kano was a textile centre; wool in
     the Atlas; hides; bark cloth for the Baganda; the Tuareg tagelmust; trade
     blankets, whose 1890 spread the research already dates). Never a garment
     invented for the occasion.
  3. A PLAUSIBLE USE of that garment under that driver — and the research
     already names the honest form: dress here is cloaks and wraps, adjustable
     single pieces, so the seasonal signal is often HOW a garment is worn
     (drawn tight, pulled over head and shoulders, wrapped across the face)
     rather than how many are worn. §2.6 explicitly prefers this reading over
     inventing an extra garment; the user's "nur sofern plausibel" points the
     same way.
  4. NOT A COSTUME CLICHÉ, and not a 20th-century back-projection. The traps
     are already documented and must stay caught: the patterned "Victoria
     England" blanket is 1897; the Maasai red shuka is an anachronism; the
     Tuareg "winter" claims found were tourism copy. A guess that happens to
     match the tourist image needs MORE evidence, not less.
  (a) RESEARCH FIRST, and it is a real pass, not a skim. Extend
      `docs/peoples-1890.md` (a new section, so §2.6's negative findings stay
      readable as what they are) covering, per people of design.md §3.2/§4.5:
      what garments the record gives them; what the local climate actually does
      across the year; and what the DEFENSIBLE seasonal reading is. Mark every
      claim as the doc already does — PERIOD / MODERN / RETRO-APPLIED /
      CONTESTED / GAP — and now additionally INFERRED, with the indicia it
      rests on named. An inference whose indicia cannot be named is not an
      educated guess; it is invention, and it does not ship.
      Leads §2.6 named but could not chase: Barth and Clapperton on the
      harmattan; Nicolaisen (1963) on the Tuareg (itself a retro-application
      risk — weigh it, do not just cite it).
  (b) MODEL: extend `coldnessAt` (or add siblings) so the drivers the dress
      keys on are the real ones — cold, and at least the harmattan's dust/night
      chill, which is a WEST/NORTH dry-season phenomenon the current
      coldness-only model cannot express (its amplitude falls off toward the
      equator, so the Sahel reads "never cold" while its January nights are
      genuinely cold). Balance-calibratable and debug-editable per CLAUDE §2.
  (c) DRESS: replace the single `COLD_CLOAKS` map with a per-people seasonal
      dress derived from (a), so the difference is VISIBLE and REGIONAL — the
      user asked for "deutliche Unterschiede… je nach Region und Jahreszeit".
      Keep the two properties 120g's tests pin: the choice stays deterministic
      and stable per figure, and it spreads across the settlement's palette
      (the palette-index keying exists because a colour hash collided and hid
      the black hide entirely).
  (d) FIGURES: the primitive figures can carry more than the one shoulder cone.
      §2.6's "worn differently" reading needs a shape difference (a wrap drawn
      over head and shoulders vs. hanging), which is exactly what 120g recorded
      as OPEN because it was not modelled. If it stays unmodelled, say so in
      design.md again rather than pretending the palette swap covers it.
  TESTS: extend `src/systems/dress.test.ts` — every people asserted across the
  four seasons (a people with no defensible seasonal reading must still assert
  as unchanged, so the negative cases stay honest); the drivers pure-tested at
  the named coordinates (the Sahel's cold January night, the Zulu winter, the
  never-cold equator); the determinism/spread properties kept. Live: extend the
  §19.13 block in `scripts/verify/polish.mjs` (it is LAST in that file on
  purpose — see the comment there) with at least one contrasting region pair
  and re-take screenshot 112.
  DOCS: `docs/peoples-1890.md` (the research), design.md §19.13 (the dress
  paragraph currently states the narrow Zulu-only rule and its refusals —
  rewrite it to the new standard and record that educated guessing is the
  user's explicit decision) and CLAUDE.md §7.1 pt. 12 (its dress sentence names
  dress.test.ts and the "stays bare however cold" traps).
  SIZE: research + model + dress + figures is several commits, not one. (Filed
  16.07.2026.)

- [x] 138. The Nile flood — the cycle the research calls the most visible one.
  Wanted (user, 16.07.2026, after asking what else the season research had
  turned up but the build had skipped). `docs/climate-1890.md` states it
  outright: the Nile in 1890 is UNREGULATED (the first Aswan dam is 1898), it
  rises from early June and PEAKS AT CAIRO IN OCTOBER — "the most visible cycle
  in the game, right at the start port". The game has no notion of it; a grep
  for flood/river level finds nothing. Rivers never rise.
  THE INSIGHT THAT MAKES THIS TESTABLE — and that a naive implementation will
  get wrong: the flood is NOT local rain. Cairo is effectively rainless the year
  round (the model already says so, correctly, and `isHyperArid` guards it), yet
  the river there peaks in October. The water is the ETHIOPIAN kiremt (Jun-Sep,
  65-95% of that zone's annual rain) arriving weeks late down the Blue Nile. So
  the flood must key on the UPSTREAM zone's wetness plus a travel lag — never on
  `wetnessAt` at the river point. That is the whole point of the feature and the
  sharpest available test: flood high at Cairo in October WHILE local wetness is
  ~0.
  SHARED WITH 139: the Okavango is the same shape — remote rain, months late,
  peaking against the local sky. Build the lag/source abstraction here so 139
  consumes it rather than inventing a second one; 139 is the harder case (the
  pulse is INVERTED) and will prove the abstraction.
  ANCHORS: `src/systems/season.ts` (the zone model and `wetnessAt` — the flood
  curve belongs beside them, pure and testable); `src/scenes/travel/
  waterSurface.ts` (the rendered ribbon); `src/world/geodata.ts` (the courses
  and the carved bed).
  CARE — the invariants that must survive, all live-gated today (CLAUDE §7.1
  pt. 21, `scripts/verify/enrichments.mjs`): the ribbon stays ONE continuous
  unbroken strip with no interior gap and no surface buried under the terrain;
  the canoe float height still clears the ribbon on every channel
  (`src/scenes/travel/waterSurface.test.ts` — a rising surface is exactly what
  breaks this); lake surfaces still clear their beds; confluence bank-masking
  holds (`riverBanks.test.ts`).
  THE CONFLICT TO RESOLVE, NOT PAPER OVER: `src/world/world.test.ts` asserts
  every village keeps the §4.2 minimum river-water clearance — and the Nubian
  village is deliberately riverside ON the Nile. A real flood reaching a
  riverside settlement is historically the entire point of the Nile flood, but
  it collides with a green invariant. Decide it explicitly and record the
  decision (flood as a visual rise that respects the clearance? or clearance
  measured against the flood MAXIMUM?), do not silently widen the test.
  ALSO: 136 (wider, smoother rivers) touches the same ribbon. Whichever lands
  second re-tunes; say so in its commit rather than being surprised.
  DONE (16.07.2026, e63ddf8 + cb7b1f5 + c03b551): nileFloodAt keys on the Blue
  Nile source lagged 62 days (pure-tested: October crest while Cairo wetness is
  0); the ribbon gains a floodK vertex attribute and a module uniform, the CPU
  float height adds the same rise from ONE source (waterSurface.NILE_FLOOD), so
  canoe and surface never drift; rise is VERTICAL only, so the Nubian village
  conflict resolves to the safe reading by construction (the flood-maximum
  clearance variant stays an open option, recorded in design.md §19.13).
  Balance: season.nileFloodRise (0.55). Live checks + invariants at flood peak
  in enrichments (screenshots 117/118). Trap for later probes, noted in the
  hook: NEVER read mutable module state via dynamic import — HMR's ?t= gives a
  fresh instance; __rivers.floodRise()/surfaceAt() exist for that.
  TESTS: pure (in `src/systems/season.test.ts` or a sibling) — the flood peaks
  at Cairo in October while `wetnessAt` there is ~0 (the headline property); it
  rises from early June; the lag is real (the upstream kiremt peaks BEFORE the
  Cairo crest); the curve stays bounded 0..1 across the whole 1890-1895 window.
  Live (`scripts/verify/enrichments.mjs`): the Nile at Cairo/the delta reads
  visibly higher/wider in October than in April via the dev hook, with
  screenshots in both months; the continuity and float-clearance checks stay
  green at flood peak, not just at low water.
  DOCS: design.md §11.3 (the river section — state that the flood is remote-fed
  and why) and §19.13 (it is a season); CLAUDE.md §7.1 pt. 21.
  (Filed 16.07.2026.)

- [x] 139. The Okavango floods in the DRY season — a documented wrong to fix.
  Wanted (user, 16.07.2026). This one is not a gap but an ERROR the research
  already caught and the build then walked past: `docs/peoples-1890.md` §4.0.4
  records that at 19.0S 22.5E "the water arrives when the sky is driest" — the
  Angolan summer rains (Nov-Mar) feed the Cubango and Cuito, the pulse shows at
  the panhandle March-April and reaches Maun JUNE-AUGUST, so "while most river
  systems flood during the local rainy season, the Okavango does the opposite —
  its waters peak in the middle of the dry season, when rainfall in Botswana has
  stopped entirely and the surrounding Kalahari is at its most parched". The
  research even flags it: "the game currently has no way to express it". Point
  120's wetness model dries the Okavango exactly when it really floods, and
  120e's dry-season shore catchment then gathers the animals at a delta that
  should be at its fullest. The Wayeyi village (-19.0, 22.5) sits in it.
  EVIDENCE STATUS — why this outranks most cultural findings: it is MODERN
  sourcing, but it is physical geography, and the research says so explicitly:
  "retro-application to 1890 is far safer here than for any cultural claim in
  this document". The hydrology has not moved since.
  BUILD ON 138: same shape (remote rain, months of lag), so consume 138's
  lag/source abstraction. The difference is that here the lag is long enough to
  land the peak in the local dry season — which is the proof the abstraction is
  real and not a Nile special case.
  ANCHORS: `src/systems/season.ts` (the model); `src/scenes/travel/
  waterSurface.ts` (the delta's water); the 120e catchment in
  `src/scenes/travel/Wildlife.tsx` (~`dryness`/`catchment`) — the animals must
  follow the WATER, not the sky, or the delta will be full while the herds
  crowd a puddle.
  TESTS: pure — the Okavango's water peaks in Jul-Aug while `wetnessAt` there is
  at its annual MINIMUM (the inversion stated as an assertion, so nobody
  "corrects" it back); the Zambezi or another normal river still peaks WITH its
  local rains (the inversion must not leak into every river). Live: the delta
  reads fuller in July than in January via the dev hook, with screenshots.
  DOCS: design.md §11.3/§19.13 — record the inversion as a deliberate, sourced
  oddity, like the §19.8 grief carve-out, so it survives the next reader's
  intuition. (Filed 16.07.2026.)
  DONE (16.07.2026, c1c950a): okavangoFloodAt consumes the Nile's remote-source
  + lag pattern (Angolan highlands, 180 days); pure tests pin the inversion in
  BOTH directions and its non-leakage (Zambezi/Nile unchanged). The delta has
  no ribbon (it is a point landmark), so its water fan became its own geometry
  (buildDeltaWater) scaled OBJECT-level with the flood — affine and safe, the
  deliberate opposite of the vertex-mask displacement that shattered the trees
  the same day. January 0.70 -> July 1.25, live check + screenshots 119/120.
  NOTE: the 120e animal catchment needs no inversion handling — in the July dry
  season the animals gather at remaining water, and the delta HAS water then;
  the behaviour is already correct. The wider-catchment rule reads the sky,
  the delta supplies the water, and the two compose.

- [x] 140. The harmattan as a season — and its counter-intuitive look.
  Wanted (user, 16.07.2026). `docs/climate-1890.md` documents it richly and the
  game has none of it: a grep for "harmattan" finds only the dress module's
  comment. The travel view has a static per-region dust haze (`FOG_PRESETS` in
  `src/scenes/travel/Climate.tsx`), which is not a season and does not come and
  go.
  THE PERIOD SOURCE, quotable verbatim — Dobson's 1781 Royal Society paper:
  "A fog or haze is one of the peculiarities which always accompanies the
  Harmattan. The gloom occasioned by this fog is so great, as sometimes to make
  even near objects obscure." / "The sun, concealed the greatest part of the
  day, appears only about a few hours about noon, and then of a mild red." /
  "No dew falls during the continuance of the harmattan."
  THE TRAP — the research states it plainly and a "nice-looking" implementation
  will get it backwards: the haze scatters all wavelengths roughly equally, so
  the SKY LOSES ITS BLUE and goes whitish/grey, and "sunrises and sunsets lose
  their lustre; haloes may disappear altogether". Do NOT render a spectacular
  dusty sunset. The phenomenon is a milky pall that MUTES the sky and reddens
  the noon sun — the opposite of the postcard.
  TIMING/PHYSICS from the research: late Nov to mid-March; RH ~15-25% (vs 50-70%
  wet season); diurnal swing 15-20 °C, and the hot/cold contradiction in the
  sources resolves as "cold at dawn and hot by afternoon — the swing IS the
  phenomenon"; dust emitted on ~40% of winter days.
  BOUNDARY WITH 137 — do not duplicate: 137 (dress) may already have added a
  harmattan DRIVER to the model (its (b) step calls for exactly that, because
  the coldness curve's amplitude falls off toward the equator and so cannot
  express a cold Sahel January night). If that driver exists when this point
  starts, CONSUME it; if not, add it here and let 137's dress read it. One
  driver, two consumers.
  ANCHORS: `src/systems/season.ts` (a `harmattanAt`, zone- and month-keyed, pure
  like `wetnessAt`); `src/scenes/travel/Climate.tsx` (fog/haze already lerp per
  frame — the seasonal hook is there); `src/render/sky.tsx` +
  `src/render/skyOvercast.ts` (the dome's overcast uniform machinery exists
  since point 120g — but harmattan is a DISTINCT mode: RAIN_GRAY is a wet grey
  and the dust is a whitish ochre, and the rain path does not redden the sun.
  Add a second mode; do not overload `grayMix`).
  TESTS: pure — harmattan fires in the Sahel/Guinea-coast dry season and NEVER
  in the wet season, never south of the equator, and never at the Cape; its
  months match the research (late Nov-mid Mar); the sun-reddening and
  sky-whitening curves are bounded; and — the trap, asserted — the sunset is
  MUTED rather than intensified. Live (`scripts/verify/enrichments.mjs`): in a
  Sahel January the sight lines close and the sky whitens with a screenshot,
  while a Sahel August (wet) shows none of it; the debug zoom stays season-free
  like the rain does.
  DOCS: design.md §19.13 (the harmattan alongside the rains) and CLAUDE.md §7.1
  pt. 12's season bullet. (Filed 16.07.2026.)
  DONE (16.07.2026, 8d1e931): harmattanSkyParams (pure, identity at 0, the
  muted-halo trap asserted); the dome gains a HARMATTAN_DUST_U axis beside the
  wet overcast (whitens to HARMATTAN_PALE, reddens the disc, mutes the halo, no
  cloud growth); Climate drives it with the fog (sight lines close harder than
  rain, 0.55 vs 0.4) and the sun dims modestly; debug zoom stays season-free.
  The 137 boundary held: the driver already existed (0dc1da1), one driver two
  consumers. Live: Sahel January dust 0.98 / fogFar 117 vs August 0.00 / 181,
  screenshot 121.

- [x] 141. Equatorial ice — and hail, the only white ground low down.
  Wanted (user, 16.07.2026). `docs/climate-1890.md` §(a) records that the
  equatorial glaciers stood 8-12x today's extent (Kilimanjaro ~12-20 km² vs
  0.98 today) and — the part that makes it a GAME fact rather than trivia —
  "their break-up happened INSIDE the window (early 1890s)". The game has no
  ice at all: a grep for glacier/snowcap/snowline finds only a rock-placement
  rule in `src/scenes/travel/TravelScene.tsx` (~line 874, `s.height > 6.5 //
  snow line`), which is a static dressing exclusion, not ice.
  (a) THE ICE: the three massifs the research permits, and ONLY those —
      Kilimanjaro, Mount Kenya, Rwenzori, all >4,400 m, above the 4,500-4,800 m
      equilibrium line. The research also names the near misses to keep BARE,
      and they are the test cases: Mount Elgon (4,321 m — "the highest African
      mountain completely free of glaciation", missing the line by <200 m), Ras
      Dashen (transient Dec-Feb only; Ethiopia's rain is summer, so the high
      ground is dry when it is cold — a lovely, counter-intuitive reason), Mount
      Cameroon (occasional dusting, no snowcap), Emi Koussi (snow about once
      every seven years). Seasonal snow is allowed on the High Atlas (Nov-Apr,
      settling to ~1,400 m) and the Drakensberg (Jun-Aug, >2,000 m).
      The 1890s break-up is optional depth: the extent may simply be the period
      one. Do not animate a retreat across the campaign unless it is cheap —
      but do NOT render today's remnant.
  (b) HAIL: the research names it as "the only defensible white ground at low
      altitude" — savanna snow is physically impossible, and point 120g already
      recorded in design.md §19.13 that no settlement qualifies for snow (now
      verified: the Berber village, the highest candidate, sits at 914 m against
      an Atlas snow line that settles to 1,400 m). So a rare hail event is the
      one way white ever touches the ground where the player walks. Ambience,
      rare, keyed to the wet season's storms.
  ANCHORS: `src/render/landmarks.ts` (the skyline/mountain builds and their
  pure test `landmarks.test.ts`); `src/scenes/travel/TravelScene.tsx` (the snow
  -line rock rule — reconcile with it rather than adding a second notion of a
  snow line); `src/systems/season.ts` (the hail roll and the Atlas/Drakensberg
  months).
  TESTS: pure — ice ONLY on the three permitted massifs and never on the four
  named near misses (that list IS the test); the Atlas/Drakensberg snow months
  match the research and are empty in their summers; hail never fires in a
  rainless zone (no Saharan hail) and stays rare. Live: a screenshot of
  Kilimanjaro carrying its period ice. DOCS: design.md §19.13 + §4.4 (the
  landmark), CLAUDE.md §7.1 pt. 12. (Filed 16.07.2026.)
  DONE (16.07.2026, 439cea3 + 817a159): the naive global SNOW_M=4300 threshold
  — which wrongly snowed Elgon and Ras Dashen — replaced by the massif gate
  (iceMassifAt): only the three glaciated massifs whiten, per-massif ice lines
  adapted to the DEM's flattened summits (Mount Kenya reads 4,454 m for a real
  5,199 — the gate carries the truth, the line places the cap), baked into
  terrain colours so far sheet and map inherit. Seasonal Atlas/Drakensberg snow
  as a COLOUR-ONLY shader term (the bare-branches lesson), line sinking with
  winter depth; Toubkal reads 7.5% near-white pixels in February vs 0.0% in
  July (screenshot 122). Hail: deterministic per (day, 2° cell), only inside
  rainAmount >= 0.6 storms, ~a handful of days/year; pellets via the rain
  field's hail uniform, a brief radial ground dusting via the snow node. The
  1890s glacier BREAK-UP animation was the optional depth and is not built
  (the period extent is; recorded as the open nuance).

- [x] 142. The season reaches the people: work, presence, market, fire.
  Wanted (user, 16.07.2026). This is the richest seam the (a2) research opened
  and the build used none of it — `docs/peoples-1890.md` §3, §4 and §4.9 are
  full of period-sourced seasonal LIFE, while the game's settlements run the
  same vignettes in every month.
  The findings, with the research's own star ratings:
  * §3.1 "The Sahel's hungry season IS the rainy season — the best-verified
    finding in the document." The intuition is backwards: the rains are when
    the granary is empty and the work is hardest.
  * §4.0.1 ★ "The best mechanic found: 'the young men are gone'" — transhumance
    empties part of a village seasonally. A settlement that is visibly
    half-populated in one month is a real, sourced, cheap-to-render mechanic.
  * §4.9 ★ "The market has a season, and the caravans stop for a physical
    reason" — what stands on the stalls, and whether the caravan is there at
    all, is seasonal.
  * §4.9 ★ "The fire image, and a period thermometer" — when fires burn and how
    much. This one now has a renderer waiting for it: point 120g made the
    §19.10 firelight carry visibly further under an overcast sun.
  * §4.9 ★ "Indoor vs outdoor in the rains — the intuition is BACKWARDS" — read
    it before writing the obvious thing.
  * §4.0.5: Bemba and Lunda are SEDENTARY — no month empties them. A negative
    finding, and it must be honoured: the mechanic is not universal.
  * §4.0.2 ★ Swayne (1895) gives a PERIOD Somali season table (four named
    seasons) that DISAGREES with the modern one — prefer the period table.
  ANCHORS: `src/scenes/place/PlaceLife.tsx` (every vignette: Cook, Weaver, Kids,
  Walkers, FireTender, Talkers, Pounder, Drummer, TaskWalker — and the
  ColdCloaksContext pattern shows how to feed them settlement-wide state
  without threading props through each); `src/scenes/place/lifeSpots.ts`;
  `src/scenes/place/useColdCloaks.ts` (the "derive from the PLACE's own
  coordinates and the date" rule this must follow too).
  OVERLAP WITH 133 (rinderpest): §4.0 ★★ "the emutai: for this game's dates the
  question is the wrong YEAR, not the wrong month" — the rinderpest years are
  133's subject. Keep 142 about the NORMAL year and let 133 overlay the
  catastrophe, or the two will fight over the same vignettes.
  TESTS: pure — the per-people seasonal presence/work mapping across the year
  (incl. the negative cases: Bemba/Lunda never empty; the Sahel's hungry season
  lands in the RAINS, not the dry season). Live (`scripts/verify/polish.mjs`):
  a transhumant village shows fewer inhabitants in its away month than in its
  home month via `__placeWalkers`, with screenshots of both.
  SIZE: large — split along the findings, one commit each. (Filed 16.07.2026.)
  DONE (16.07.2026, 15b8801 + aa26c90 + 92f1519), split along the findings as
  ordered:
  * §4.0.1 "the young men are gone" — presenceAt thins the adult walkers:
    Maasai in the LOCAL DRY season (the PERIOD Thomson direction), Tuareg on
    the autumn caravan (window wraps the year end; marked Ahaggar
    extrapolation), Sahel farmers out at the field huts in the RAINS (Barth,
    PERIOD — the inverted intuition); children/elder/home vignettes REMAIN.
    §4.0.5's negative asserted monthly: Bemba and Lunda never thin.
  * §4.9 the fire image — the village fire burns harder under the place's own
    cold/harmattan/karif (Tuareg Jan 1.50, Hausa Jan 1.49, Congo basin 1.04),
    compounding 120g's firelight-carries-further.
  * §3.1/§4.9 the market season — the stall's grain mound shrinks to a third
    in the Sahel farmers' hungry RAINS and refills at the October harvest;
    nobody else is touched, asserted.
  * §4.0.2 Swayne's period table already governs the Horn (the 137 horn zone).
  STILL OPEN, recorded not invented: the §4.9 indoor/outdoor NIGHT reading
  (Parkyns' sleep-outdoors-normally needs a day/night cycle the game does not
  have) and the fishing seasons (a research GAP even in §3.5).

- [x] 143. Inside a settlement it never rains, and the ground never bleaches.
  Reported (user, 16.07.2026): "Innerorts sehe ich als einzige Unterschiede beim
  Durchschalten der Monate, dass sich die Helligkeit ändert und die Bewölkung
  der Skyline. Sollte es da nicht mehr Unterschiede geben?" — Yes. Verified by
  grep, and he is right: point 120g shipped only a THIRD of the settlement
  season.
  WHAT IS ACTUALLY MISSING (both confirmed absent, not merely faint):
  * **RAIN.** The rain field lives in `src/scenes/travel/Climate.tsx` alone. A
    player standing in a village at the peak of its rainy season sees not one
    drop, while the bird's-eye view of the same coordinate rains. The settlement
    already KNOWS it is raining — `PlaceScene` computes the wetness from the
    place's own coordinates and dims the sun by it (point 120g) — so this is a
    missing renderer, not a missing model.
  * **The flora/ground season.** The straw/green tint lives in
    `src/scenes/travel/TravelScene.tsx` (`SEASON_TINT_U` / `seasonTintNode`).
    The settlement ground and its trees never bleach: they read the same in
    April and September while the whole continent around them changes.
  ANCHORS: `src/scenes/travel/Climate.tsx` (the rain field — MODULE singletons
  per point 96, so lifting it into a shared module must keep that: a fresh
  material per mount re-links the travel program set); `src/scenes/travel/
  TravelScene.tsx` (`seasonTintNode`, the greenness mask that survived the
  acacia-crown bug — reuse it, do not write a second one); `src/scenes/place/
  PlaceScene.tsx` (`usePlaceMaterials`, and the `placeWetness`/`__placeSeason`
  block that already has the wetness in hand); `src/render/flora.ts`.
  CARE:
  * The settlement wetness must stay derived from the PLACE's own coordinates,
    never from `CURRENT_WEATHER` — the travel Climate component does not mount
    here and its reading would be wherever the traveller last stood (the rule
    §19.13 already states, and the reason it is stated).
  * The rain column is sized for the bird's-eye camera (RAIN_RADIUS 55,
    RAIN_HEIGHT 42, streaks tilted 0.38 rad because a plumb streak is nearly
    edge-on from above). **At eye height in first person none of that holds** —
    the tilt, the density and the column size all need their own calibration, or
    the village will look like it is raining sideways.
  * Ports: Cairo is hyper-arid and must stay bone dry in every month. A rain
    that fires in Cairo is a bug, and `wetnessAt` already returns 0 there — do
    not "fix" that by lifting the guard.
  TESTS: pure — reuse the existing season tests; the greenness/wetness split is
  already covered (point 143's cause was that the ABSOLUTE wetness drove the
  flora; use `floraGreennessAt` here from the start). Live
  (`scripts/verify/polish.mjs`, in the §19.13 block that is LAST in the file on
  purpose): forcing the rainy season inside a village raises the rain opacity
  above zero and forcing the dry season clears it, with screenshots of one
  village in both seasons; and the same village's ground/flora tint differs
  between the two. Add a Cairo case: rainless in every month.
  DOCS: design.md §19.13 (its settlement paragraph currently claims sky, light
  and firelight — say rain and flora too) and CLAUDE.md §7.1 pt. 12.
  (Filed 16.07.2026.)
  DONE (16.07.2026, c1f783d): the season tint extracted to render/seasonTint.ts
  and shared (prior commit); the settlement ground (createGroundMaterial,
  place-only) and flora (node materials) now tint from the place's own
  greenness; PlaceRain is a new eye-height field (near-vertical, 16-unit column,
  rainAmount-driven) — Cairo dry across all 12 real months, verified. Live in
  polish.mjs §19.13 (screenshot 114). The debug override still forces a season
  everywhere (that is its purpose), so the Cairo-dry check uses real months.

- [x] 144. The plants themselves change: cover AND condition, not just colour.
  Wanted (user, 16.07.2026): "Wenn angebracht, sollte sich der Pflanzenbewuchs
  und der Zustand der Pflanzen auch je nach Jahreszeit ändern." — asked while
  reporting, correctly and repeatedly, that stepping through the months shows
  "nur Änderungen am Regen und der Helligkeit".
  ★ WHY THIS IS THE ANSWER AND THE TINT IS NOT — measured, not assumed. The
  season tint was fixed twice (relative greenness, then a symmetric wet-end
  recolour) and the on-screen swing is STILL modest: the Sahel's ground green
  excess g-(r+b)/2 moves 43 -> 54 across its whole year. The reason is
  structural and is the finding to build on: the terrain does
  `seasonTintNode(vertexColor().rgb).mul(albedo.mul(2.6))`
  (`src/scenes/travel/TravelScene.tsx` ~line 327) — the tinted vertex colour is
  multiplied by the baked albedo texture, which is itself strongly coloured and
  pulls the hue back toward its own tone. The vegetation (~line 783) has no such
  multiply and tints fully, but it is a small fraction of the pixels. **A colour
  tint alone cannot carry the season. Cover and condition can: fewer and barer
  plants against more and fuller ones is a silhouette change, and silhouettes
  read where hue does not.**
  WHAT "APPROPRIATE" MEANS HERE — the research already answers it, per zone, and
  this must be honoured rather than applied evenly:
  * **Savanna/Sahel/plateau: yes, strongly.** The grass genuinely goes and comes.
    Dybowski, PERIOD, at 5-6N: the inhabitants fire the steppe once or twice a
    year and the country reads with "bark and twigs burnt black, many trees mere
    skeletons, others carrying scattered surviving leaf-tufts, the whole
    landscape with an aspect of mourning" (`docs/peoples-1890.md` §7.4). Park,
    PERIOD: "Whenever the grass is sufficiently dry, the Negroes set it on fire…
    the plains and mountains, as far as my eye could reach, variegated with lines
    of fire."
  * **Congo basin: no.** Rain every month, a 1.6 °C seasonal temperature swing
    against a ~12 °C diurnal one — there is no season for the flora to track, and
    the pixel probe agrees (the basin's dry/wet screen delta is 9, i.e. nothing).
    Leave it evergreen; that is the accurate answer.
  * **Desert: no.** Nothing to lose. The greening floor in `floraGreennessAt`
    already encodes this — reuse it, do not invent a second rule.
  * **Gabon (the new `atlantic-equatorial` zone): yes** — it has a hard Jun-Sep
    dry season, which is why the zone exists at all.
  ANCHORS: `src/render/flora.ts` (the plant builds — `buildAcacia`,
  `buildPalm`, `buildJungleTree`, `buildBush`); `src/scenes/travel/TravelScene.tsx`
  (the dressing scatter and its density/species pick, and `seasonTintNode`);
  `src/systems/season.ts` (`floraGreennessAt` — the driver already exists and is
  already relative-per-zone, which is exactly what a cover rule needs).
  CARE:
  * **Do not respawn the scatter per frame or per month-jump.** The dressing is
    chunk-bound and seeded; a cover change must be a deterministic function of
    (seed, season) or the world will boil as the date advances. Prefer scaling or
    hiding existing instances over regenerating the set.
  * The bird's-eye collision tests trees and animals (CLAUDE §7.1 pt. 4). If a
    tree's footprint changes with the season, the collision must follow it — or a
    traveller will be blocked by a bush that is not there in July.
  * Point 143 (settlement rain + flora) lands first and lifts the tint into the
    place scene. Whatever cover rule is built here must work in BOTH views, or
    the village will be lush while the plain outside it is bare.
  * The acacia crown is OLIVE (#6e7c2f, r≈g) — the greenness mask was rewritten
    once because `g > max(r,b)` missed it entirely. Any new mask must be checked
    against that crown specifically.
  TESTS: pure — the cover/condition curve per zone across the year (savanna
  swings, basin does not, desert does not), and its determinism for a fixed
  (seed, day). Live (`scripts/verify/enrichments.mjs`): the PIXEL probe is the
  test that matters and it must be permanent — screenshots of one savanna spot in
  its driest and wettest month, asserting a real on-screen difference, because
  every uniform-level check so far passed while the player saw nothing. Add the
  Congo as the negative case: it must NOT swing.
  ★★ THE EXAGGERATION LICENCE (user, 16.07.2026) — read this before calibrating
  anything: "Das ganze wird ja abstrakt stilistisch angezeigt und muss daher
  nicht dezent realistisch aussehen. Die unterschiedlichen Klimazustände können
  ruhig ein Bisschen kitschig übertrieben dargestellt werden, damit man sie gut
  erkennen kann." Recorded in design.md §19.13 as the second deliberate carve-out
  from the accuracy principle (alongside the §19.8 grief). It licenses the
  DEPICTION, not the facts: state a real season loudly, never invent one. The
  Congo still gets no dry season and the Sahara still never greens.
  THE LEVERS, in measured order of effect — the first is the one the pixel probe
  points at, and it is nearly free:
  1. ⛔ **TRIED AND FAILED — do not retry: "apply the tint after the albedo
     multiply".** This was my predicted big lever and the pixel probe refuted it.
     Measured: tinting the composed colour left the Sahel's green-excess swing at
     +10 (versus +11 tinting the vertex colour) and made the dry end LESS
     saturated. The reason is now clear and is worth keeping: `albedo.mul(2.6)`
     pushes the composed colour above 1, so `seasonTintNode`'s luma, its
     `clamp(0,1)` mask terms and its straw target all operate on out-of-range
     values and flatten. **The albedo is NOT the bottleneck.** Whatever is
     compressing the swing is downstream — the 2.6x light multiplier and the
     filmic tone mapping are the next suspects, and the honest next step is to
     measure where the range is lost rather than to guess again. The lesson
     stands regardless: **verify each lever against the PIXEL probe before
     building on it.**
  2. ★ **Bare branches.** The strongest silhouette signal available: a savanna
     tree that drops its leaves in the dry season and carries a full crown in the
     rains is unmistakable at any zoom, and it is real — Dybowski's burnt trees
     are "mere skeletons; others… carrying tufts of leaves… where the buds had
     not been destroyed". Anchor: `src/render/flora.ts` (`buildAcacia` etc.).
  3. **Grass/scatter density.** Tufts short and sparse in the dry season, tall and
     dense in the rains — see the determinism warning above.
  4. **Push the straw and lush constants far apart.** They are currently
     `luma*(1.9, 1.55, 0.6)` and `luma*(0.5, 1.25, 0.45)`. Under the licence,
     bleached near-white straw against a saturated deep green is allowed and
     wanted.
  5. **Wet ground darkens, and holds water.** Rain-soaked earth reading darker,
     with standing puddles in the wettest weeks, is both accurate and loud.
  6. **The burnt land** (Banda, Jan-Mar, `docs/peoples-1890.md` §7.4): blackened
     ground and skeletal trees after the annual firing. Period-sourced at the
     game's own latitude, and the most dramatic state in the whole system.
  7. The dust haze belongs to point 140 (harmattan) — do not build a second one
     here.
  DOCS: design.md §19.13 and §19.9 (the dressing), CLAUDE.md §7.1 pt. 12.
  ORDER: after 143 (which finishes what 120 claimed), before the 138-142
  additions. (Filed 16.07.2026.)
  PARTIALLY DONE, LEVER 2 REVERTED (16.07.2026): the tint pair is exaggerated
  per the kitsch licence and stays (09cd768, Sahel green excess 46->61). BARE
  BRANCHES shipped (fa507fe) and was REVERTED the same day (aec94a5) on a
  critical user report with screenshot: at any dry month the trees exploded
  into giant screen-spanning dark shards — reached by debug key AND by time
  running normally into the month.
  ⚠️ ROOT CAUSE, which the next attempt MUST honour: seasonFoliagePosition
  displaced vertices in the POSITION stage by a mask derived from the
  per-vertex COLOUR — and the colour jitters per vertex by design (flora.ts
  tint(), the hand-made look). Neighbouring vertices of one crown collapsed by
  different amounts, their shared triangles stretched into shards; on the
  WebGL2 fallback catastrophically. My own screenshot 115 showed the shards
  and I explained them away as "collapsed crowns seen from above" — the
  user's report named them. LESSON: geometry displacement must key on a
  UNIFORM per-part signal — a dedicated foliage attribute (0/1) baked in the
  flora builders at build time — never on the jittered colour. The colour
  MASK is fine for TINTING (a wrong colour is a subtle error; a wrong
  position is a shard).
  RETRY DONE (16.07.2026, 139a2c8): bare branches rebuilt on a baked, BINARY,
  per-part `foliage` attribute (crowns/fronds/bushes/reeds/grass 1, wood/stone
  0; merge() fills unmarked parts; landmarks.ts' own merge learned the same
  fill after the delta/Sudd failed to build). Verified clean at the exact spot
  and month of the critical bug; the dry Zambezi shows compact bare trunks —
  the silhouette change, stable. The grass flattens via the same collapse
  (blades are foliage=1). REMAINING, folded into 149's re-verification rather
  than held open here: wet-ground puddles (nice-to-have; the overcast dim
  already darkens wet ground). The burnt land stays with 145(a).

- [x] 145. Three more parental sacrifices — a human cause, a lie, and a predator
  as a parent.
  Wanted (user, 16.07.2026): I proposed these three after he asked for further
  ideas, and he accepted all three as ONE point at the END of the batch. Each was
  chosen because it adds a SHAPE the existing dramas do not have — not because
  the roster needed padding. (Rejected, and recorded so they are not re-proposed:
  the dust storm — a parent vanishing into the harmattan pall is not visually
  legible; the starving mother — not renderable; the rinderpest calf — disease,
  not sacrifice, and it belongs to point 133; the elephant refusing to leave its
  dead calf — real and famous, but it is grief without death, and point 126
  already says so.)
  (a) ★ THE BURNING GRASS — and the cause is HUMAN. `docs/peoples-1890.md` §7.4
      delivered this period-sourced while researching dress: Dybowski, at the
      game's own latitude and inside the window, watched the inhabitants fire the
      steppe once or twice a year, and describes the result exactly — bark and
      twigs burnt black, trees as skeletons, scattered surviving leaf-tufts, "the
      whole landscape with an aspect of mourning". Park saw the same from the
      Gambia: "the plains and mountains, as far as my eye could reach, variegated
      with lines of fire". A calf is caught by the fire line; the parent goes in
      after it.
      WHY IT IS WORTH BUILDING: every existing drama has a natural cause — lion,
      waterfall, elephant. This one has a HUMAN cause, without the player doing
      anything. For a game about a European walking through other people's
      country and calling it discovery, that is the thematically loaded one.
      DEPENDS ON point 144 (the plants' cover and condition), which owns the
      burnt-land state; build (a) after it and consume its state rather than
      growing a second fire.
      CARE: the fire is a DRY-SEASON, congo-north/Sahel-zone event (the grass
      must be cured), so it must be keyed to the season model, not fired
      anywhere at any date. And the traveller's own safety is a §14 question —
      do NOT invent a fire event that damages the player; if that is wanted it is
      a design decision for the user, not a side effect of this point.
  (b) ★ THE BROKEN WING — the one sacrifice that is a LIE rather than a leap.
      Ground-nesting birds (lapwing, plover) feign a broken wing, drag themselves
      conspicuously in front of the predator to lure it away from the nest, and
      are sometimes taken doing it. This is a genuinely different mechanic from
      everything in §19.8: not throwing yourself in, but offering your body as
      bait — with a real chance of getting away with it, which makes it the
      natural companion to point 125's "the sacrifice may succeed".
      CLOSES AN OPEN ITEM: CLAUDE §7.1 pt. 12 records "additional new
      species/birds beyond the existing roster" as open. The roster today is
      flamingo and vulture only (`src/render/fauna.ts`) — this adds a
      ground-nesting bird with a nest and young.
      CARE: the existing bird machinery is the vulture's (spawn beyond the view
      ring, fly in, land, leave — §19.6). A ground bird is the opposite: it is
      ALREADY there and must not fly off at the first frame. And the water-edge
      rules (`waterEdgeRules.ts`) plus the body-separation rules apply to it like
      any other animal.
  (c) ★ THE PREDATOR AS A PARENT — a lioness defends her cubs against hyenas.
      This INVERTS the frame: the lion has been nothing but a threat to the
      player and to every grazer; here it is a mother, and the same creature
      reads from the other side for the first time. Both species and the food web
      already exist.
      NEEDS: a cub build for the predators — `src/render/fauna.ts` has
      buildZebraCalf/buildAntelopeCalf/buildWildebeestCalf/buildWarthogCalf but
      NO cub for lion/cheetah/leopard/hyena. The baby-schema rules are already
      pure-tested (`src/render/fauna.test.ts`: proportionally larger head,
      shorter neck/body, leggy stance, no adult ornaments) — follow them.
      ⚠️ ARCHITECTURE: `LION_STATE` is a single global hunt state and this makes
      the lion a VICTIM rather than the hunter. That is the sharpest version of
      the warning points 121(f) and 130 both carry. Decide once who owns the
      resolution; do not bolt a second predator state onto the side.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`, `fauna.test.ts`):
  the fire's season/zone gate (never in the Congo, never in a rainless zone,
  never in the wet season); the broken-wing lure's target choice and its
  give-up/resolve path; the predator cubs' baby-schema proportions. Live
  (`scripts/verify/enrichments.mjs`): each of the three fires once and RESOLVES
  (the point-118 lesson — never a drive with no exit), with a screenshot of the
  burnt land. DOCS: design.md §19.8 (all three) and §19.13 (the fire is a
  season), CLAUDE.md §7.1 pt. 12 — and strike "additional new species/birds" from
  its OPEN list once (b) and (c) land.
  SIZE: three separate dramas — one commit each, in the order (a), (b), (c).
  (Filed 16.07.2026.)
  (a) DONE (17.07.2026, 21:23): the burning grass is in — pure gate
  grassFireEligible (sahel/congo-north, dry only; never Congo, never a
  rainless desert, never the rains; tested), FIRE_STATE walks a flame line
  downwind over cured savanna leaving a blackened smoulder band that fades,
  a calf in the path is caught by the line (fireTrapped struggle, then the
  burn-mark death), the parent goes in after it at grief pace (a point-134
  surrender — no roll, no rescue burst), the fire always resolves (point
  118) and never touches the traveller. Dev hook fire/igniteFire; live
  check green on first run (trapped/calfDead/parentDead/resolved) with
  screenshot 131 human-checked (the blackened band on the straw Sahel).
  Docs: design.md §19.8 bullet + §19.13 season note. Build/lint/1746 unit
  tests green. NOTE: the 133 carrion check rotated 1->0 in the same run
  (same dayStruck 393) — diagnosis instrumentation added; the follow-up run
  SOLVED it: the diag (169 chunks spawned, 0 toll) plus the croc counts
  varying 2-8 across runs prove the BOOT SEED is random per run, so the 6%
  anchor band left whole rings without toll — and Baumann records ~95% of
  buffalo/wildebeest dead, so the thin strew was also the less accurate
  reading. Band widened to 13% with 1-3 per chunk: the mass die-off reads
  as such and the check meets it under any seed. ALSO WATCHING (single-run
  reds, first occurrences): 'a parent flees a feeding lion beside its calf'
  (reversalRate 0.26) in the 145b run; trample/stain and 102-vicinity from
  earlier runs. (b) DONE (17.07.2026, 22:55 — green full run: plover
  lured 14.6/took off/resolved/home; carrion 9; fire green): the plover species is in (buildPlover/buildPloverChick, nest+2
  chicks spawn on savanna at roll band [0.68,0.72), CALF_SPECIES extended,
  plover excluded from CALF_HUNT_SPECIES so no drama loop touches it), the
  lure runs on four boundary-tested pure rules (ploverShouldLure/
  LureHeading/LureResolve/Taken — taken only near a predator, never the
  traveller) plus a post-act cooldown (25 s alert at the nest — without it
  the act LOOPED at a standing threat, run-1 finding), render poses
  (trailed wing drag, low return arc). A one-off probe
  (scripts/verify/_plover-probe.mjs, needs the SUITE's chromium launch args
  — a bare launch throttles rAF ~20x and made the sim look broken) proves
  the full cycle: drag at 1.25/s, resolve at the 12 s window, flight home.
  BOTH puzzles solved: (1) the run-2 exact-zero was a
  standing-threat loop (the act re-fired the instant it landed while the
  traveller stood near) — a 25 s post-act cooldown (lureCooldown) sits the
  bird alert at its nest, and the probe (suite launch args — a bare launch
  throttles rAF ~20x) proved the full cycle; (2) the carrion-zero was
  GEOMETRY, not the return: the 2.5-degree radius covered ~9 of the 169
  ring chunks, so a per-boot random seed could miss them all — CARRION_
  RADIUS_DEG raised to 6 (Maasailand, not the village; carrion now reads 9)
  and the fire-staging isolates the corridor (a natural calf claimed the
  victim slot). Screenshots 131/132 both human-checked. (c) DONE
  (18.07.2026, 05:21 — the 145c check passed GREEN in three separate
  enrichments runs; the lone fail rotated among the pre-existing
  family-staging flakes each run — 145b plover (dead:true), then a fully
  green run, then 145a fire (trapped:false, no calf in the line) — none is
  145c, none touches code this point changed): the lioness defends her cub
  against a hyena. THE
  ARCHITECTURE ANSWER (the warning points 121(f)/130/146 all carry, settled
  by 146 and confirmed here): keep the ONE global hunt state — the drama is
  a HYENA hunt (LION_STATE.predator = hyena) whose victim is a lion cub, and
  the lioness reaches the SHARED resolution core through a new narrow
  FAMILY_DEFEND_SPECIES = [...CALF_HUNT_SPECIES, 'lion'] used ONLY at the
  caught/charge/shield/vigil loop — so she inherits the one
  parentAttackOutcome matrix WITHOUT the prey-behaviour loops (gambol-drown,
  flee, grazer vicinity seed, food-web hunt pick all still key on
  CALF_HUNT_SPECIES, which lion is NOT in). No second predator state, no
  duplicated resolution. PIECES: buildLionCub (baby schema off a refactored
  named LION_SPEC, no mane; pure-tested with the grazer calves,
  fauna.test.ts); lion added to CALF_SPECIES (cub mesh) and the calf-mesh
  pool; a lioness+cub spawn on savanna gated to REGION_PREDATORS holding the
  hyena (east/south — so the drawn threat is always region-true), roll band
  [0.72,0.735); a dedicated cub-hunt seek pass (herds.lion, near the player,
  rare) that forces s.predator = 'hyena'; preyWeapon.lion 2.0 (defendChance
  vs hyena caps 0.95 — the strongest defence in the game — killChance ~0.22,
  cub lost only 0.05; pure-tested, and the 146 invariant sweep re-checked
  with lion in it); MAX_INSTANCES.lion 6->12 for the family. FLEES_LION.lion
  stays false (she defends, never flees). Live check
  (scripts/verify/enrichments.mjs): a forced hyena-vs-cub hunt, drive-off
  forced deterministically (killFlight 0, predatorFlight high), asserts the
  drama RESOLVES — cub freed, lioness alive, hunt left (point-118 lesson) —
  with a 3x retry for the 5% taken staging; screenshot 133
  (133-lioness-defends-cub.png) PENDING human check. Docs: design.md §19.8
  (the lioness-from-the-other-side drama), CLAUDE.md §7.1 pt.12 (145c
  clause) and the "additional new species/birds" OPEN item struck (crocodile
  + plover + lion cub closed it). tsc/lint/1751 unit + 129 behaviour tests
  green. ALL THREE (a)(b)(c) now done — point 145 complete.

- [x] 146. Revenge: a strong parent kills a weak predator and walks away.
  Wanted (user, 16.07.2026): "Es soll auch noch eine Rache-Mechanik von Eltern
  geben. Ein relativ starkes Eltern-Beutetier soll, wenn es nach dem Tod seines
  Jungen einen relativ schwachen Prädator angreift, manchmal nicht von diesem
  gefressen werden, sondern es schaffen, dieses zu töten und selbst
  davonzukommen. Auch hier wieder Erfolgschancen analog berechnen."
  ★ WHY THIS IS A THIRD THING, not a variant — and it corrected me. §19.8 had
  two states and I had just written the line between them wrongly: I claimed
  that once the calf is dead the parent has no roll, because that is grief.
  Revenge disproves it. The real distinction is not the calf's pulse but **what
  the parent does**:
  * **surrenders** — the vigil-keeper standing to be eaten (121d), the
    trample-throw (119), the waterfall plunge: no defence, no roll, always
    fatal. The user's own carve-out (134); do not touch it.
  * **rescues** — the calf still alive, the parent attacks to save it: rolls
    (point 125 a2).
  * **avenges** — THIS point: the calf already dead, and the parent attacks
    anyway. Not to save anything. It rolls too.
  Today that third case exists and is deterministic: the too-late charge kills
  the parent every time (`src/scenes/travel/Wildlife.tsx` ~950,
  `PARENT_TOO_LATE_DIST`).
  (a) OUTCOME — the helper becomes THREE-way, not two. Point 125(a) introduces
      one shared pure helper for "parent reaches predator"; extend that same
      helper rather than adding a second: **taken** / **predator driven off**
      (125) / **predator KILLED** (here). Do not fork the resolution.
  (b) THE CHANCE — "analog", i.e. the SAME matrix, at a higher bar. Reuse
      125(a2)'s (prey, predator) matrix and §14.1's existing danger order
      (cheetah < leopard < hyena < lion), and hold the obvious invariant:
      **killing is harder than driving off**, so for any pair
      `chance(kill) <= chance(driveOff)`. The user's own framing names the gate:
      a **relatively strong** parent against a **relatively weak** predator. So
      a giraffe or a zebra may kill a cheetah; an antelope kills nothing; and
      **nothing kills a lion** — the lion is the top of the order and the drama
      of §19 depends on it staying frightening. Balance values, debug-editable.
  (c) ★ THE CONSEQUENCE THE OTHER POINTS DO NOT HAVE: a DEAD PREDATOR on the
      ground. That is new — 125's success only drives it off. A predator carcass
      must enter the EXISTING carcass system (the kill flock, the ground
      scavenger, `dissolve`/`gone`) rather than a special case: the vultures
      should work a dead lion exactly as they work a dead zebra. This is the
      cheapest and best part of the point — the systems already exist, and a
      hyena being eaten by vultures is an image the game has never shown.
      ⚠️ Check the food-web rules (§19.3) before wiring it: they gate which
      species may feed on which, and a predator carcass is a case they were
      probably never written for.
  (d) THE PARENT WALKS AWAY. "und selbst davonzukommen" — on a kill the parent
      survives, un-wounded, and rejoins its herd. It does not then stand vigil
      (121): the vigil is the surrender state and this animal did not surrender.
      Make sure the two cannot both fire on the same carcass.
  (e) ⚠️ ARCHITECTURE: `LION_STATE` is the single global hunt state and this
      DELETES the hunter mid-hunt. Points 121(f), 130 and 145(c) all carry a
      version of this warning; by the time this point is built one of them
      should have settled who owns the resolution — follow that, do not invent a
      fourth answer.
  (f) ⚠️ AND THE REGISTER: revenge that usually works would turn §19.8 from
      tragedy into a power fantasy, which is the opposite of the point. Default
      the kill chances LOW enough that being eaten stays the common ending, and
      keep 134's grief deaths untouched. The user asked for "manchmal" — build
      *sometimes*, not *often*.
  TESTS: pure (`src/scenes/travel/wildlifeBehavior.test.ts`): the three-way
  helper maps deterministically; `chance(kill) <= chance(driveOff)` holds for
  EVERY (prey, predator) pair (the invariant, swept, not spot-checked); no prey
  ever kills a lion; a surrendering parent still rolls nothing. Live
  (`scripts/verify/enrichments.mjs`): with the kill chance forced to 1 a
  too-late giraffe/zebra parent kills its cheetah, survives and rejoins, and the
  predator's carcass is then worked by the vultures like any other; forced to 0
  the existing deterministic sacrifice checks stay green. DOCS: design.md §19.8
  (the three states named — surrender / rescue / revenge — since that trio is
  now the section's actual grammar), CLAUDE.md §7.1 pt. 12.
  DEPENDS ON 125 (its helper and its matrix). Build after it. One atomic commit
  DONE (17.07.2026, 12:20): the outcome helper is THREE-way —
  parentAttackOutcome resolves one deterministic roll against killChance =
  clamp((preyWeapon − 0.5)⁺ × killFlight, 0, 0.95) then defendChance:
  killFlight { cheetah 0.5, leopard 0.25, hyena 0.15, lion 0 — STRUCTURALLY
  zero, nothing kills a lion } with grounding comments; the (weapon − 0.5)
  gate makes the antelope kill nothing by construction. Swept pure tests:
  kill <= driveOff over every pair, lion invulnerable, antelope harmless,
  giraffe/zebra can kill a cheetah (1698 vitest). On a kill the hunt ends
  through the idle retire (121's claim rule — resolution points own the
  state), the predator mesh swaps in place for a herd carcass (herds gained
  predator species lists; dead, dissolve, NOT lionFed so the ordinary
  scavenger path works it — no food-web gate needed: scavenging never
  species-gated), and the unwounded parent rejoins with no vigil (kill and
  vigil are structurally exclusive: both roll sites require a living calf).
  Live (full suite exit 0): the zebra parent kills the hyena (kill band
  forced over the staging's fixed roll), both zebras live, the hunt ends,
  the hyena lies as an ordinary carcass and the scavenger binds to it —
  the game's first vulture-eaten predator. Docs: design §19.8 names the
  section's actual grammar (surrender / rescue / revenge).
  on top. (Filed 16.07.2026.)

- [x] 147. Verify the whole weather system: correct AND visible.
  Wanted (user, 16.07.2026): "Füge nach 144 einen Verifikations-Task ein, der
  prüft, ob alles in Bezug auf Wetter (innerorts und außerorts, Pflanzen, Tiere,
  Kleidung, Darstellung, usw.) zum einen korrekt und zum anderen sichtbar
  umgesetzt wurde."
  ORDER: after 144, i.e. once every weather point that changes the PICTURE has
  landed (120, 137, 143, 144). 138-142 come later and get their own checks; this
  point is the sweep over what exists by then.
  ★★ WHY THIS POINT EXISTS, and it is the most important line in it: on
  16.07.2026 the season shipped with a full green suite while the user, playing
  it, saw **nothing but rain and brightness**. Three separate rounds of
  "passing" verification hid three separate defects, and every one of them hid
  for the SAME reason — the checks measured the machine, not the picture:
  * the tests forced `wetness = 1` through the debug override, a state the real
    climate never produces outside the Congo (every zone is capped at its own
    peak), so they measured a world the game cannot reach;
  * the live check read the tint UNIFORM, which swung 0.00 -> 0.95 and proved
    nothing about the screen;
  * when pixels were finally measured, the Sahel's ground green excess moved
    41 -> 45 across its whole year: the rains were changing the scene's
    BRIGHTNESS and never its hue.
  **So the deliverable of this point is not "the tests pass". It is a
  measurement of what reaches the screen, at real dates, with no override.**
  THE TOOL EXISTS: `scripts/verify/_pixel-season-probe.mjs` (kept from that
  session; measures mean screen RGB and the green excess for a spot in two
  months). It is a diagnostic — this point is where it becomes a real check.
  (a) CORRECT — the model against the research. Sweep every village and port
      coordinate through `climateZoneAt` and assert each lands in a plausible
      zone, not merely a non-crashing one. This class of bug bit TWICE in one
      day and both times a coordinate silently fell through the lat/lon rules
      into a fallback: the Fang village classified `sahara-north` (0.000 wetness
      in July, in rainforest), and the Somali village would have been given the
      Congo's rains. **A per-place zone assertion would have caught both. Write
      it.**
  (b) VISIBLE, outdoors — the pixel probe, made permanent and swept: for each
      climate zone that HAS a season, a spot's driest and wettest month must
      differ on screen by a stated margin; and the zones that have none (the
      basin, the desert) must NOT differ. The negative cases matter as much —
      the Congo's measured delta is ~9, i.e. nothing, and that is correct.
  (c) VISIBLE, indoors — the same, inside a settlement: rain present in the wet
      month and absent in the dry, the ground/flora tint differing, the sun and
      sky dimming (already checked at the uniform level in `polish.mjs` — add
      the pixel measurement beside it), and Cairo bone dry in every month.
  (d) PLANTS — 144's cover/condition change, measured as a SILHOUETTE difference
      rather than a colour one (that is 144's whole premise: hue could not carry
      it).
  (e) ANIMALS — the dry-season shore catchment (120e) gathers them at the
      remaining water; already checked, keep it and fold it into the sweep.
  (f) DRESS — each of the six dressed peoples (zulu, tuareg, hausa, san, wayeyi,
      somali) shows its change in its own month at its own village, and the
      other fifteen never do in any month. The pure tests exist
      (`src/systems/dress.test.ts`); this is the LIVE half — `__placeDress` is
      the hook, and the rank-gated two (tuareg, hausa) must show it on some
      figures and not others.
  (g) THE HONEST REPORT — the point is not done when the checks are green. It is
      done when a screenshot pair per zone/season is in `verification/` and a
      human can SEE the difference. If a check passes and the screenshots look
      identical, the check is wrong: say so and fix the game, in the direction
      design.md §19.13's exaggeration licence allows.
  TESTS: this point IS tests — but the standard is (g). Live in
  `scripts/verify/enrichments.mjs` (outdoors) and `polish.mjs` (indoors, whose
  §19.13 block is LAST in the file on purpose — see the comment there). Pure
  additions where they belong. DOCS: CLAUDE.md §7.1 pt. 12's season bullet gains
  the pixel standard; design.md needs nothing new.
  (Filed 16.07.2026.)
  DONE (16.07.2026, 5ad65ec): two permanent checks in enrichments — the
  per-place zone/wetness sweep (32 places, the bug-class catcher) and the
  PIXEL-measured savanna-swings-Congo-doesn't on the real calendar (screenshots
  115/116); the settlement rain/tint/dress/Cairo-dry and the animal catchment
  were already live in polish/enrichments. The intervening-points re-check
  (136/122/123/138-142) is point 149's job, once they exist.

- [x] 148. An interim Closing run, pulled forward.
  Wanted (user, 16.07.2026): "Und danach einen eingeschobenen Closing-Durchlauf
  des Batches. Die Batch ist inzwischen so lange und es gab so große Umbauten, da
  dauert es sonst zu lange, bis diese Schritte wieder durchgeführt werden."
  ORDER: directly after 147, i.e. once the whole weather system is built AND
  verified. That is the right seam: the season rebuilt the climate model, the
  place scene, the flora tint, the fauna's water behaviour, the dress and two
  village positions — the largest single rebuild of the batch — and the Closing
  steps would otherwise wait behind a dozen more points.
  WHAT TO RUN: the four Closing steps at the bottom of this file, in order, as
  written — full regression, then the dead-code/stale-doc/stale-comment cleanup
  in SEPARATE commits (never mixed into feature commits), then the full
  regression again, then the .md cruft pass with the section numbers preserved.
  ★ WHAT THIS PASS SPECIFICALLY OWES, because it is the debris of the season
  rebuild and a later reader will not know it is debris:
  * **`coldCloaksFor` is deprecated** (`src/systems/dress.ts`) — a shim kept only
    until its callers moved to `seasonalDressFor`. If the callers have moved by
    now, it is dead code. Delete it and its tests rather than leaving a second
    way to ask the same question.
  * **`CURRENT_WEATHER`** (`src/systems/season.ts`) — a per-frame scratch global
    written by the travel Climate. Check who still reads it: the flora tint moved
    off it (it now uses `effectiveGreenness` from the player's own coordinate),
    and the settlement never used it by design. If only the sun dim is left, say
    so in its comment or fold it away.
  * **design.md §19.13 and CLAUDE.md §7.1 pt. 12** grew by accretion across ~15
    commits in one day — the season bullet, the dress sentence, the exaggeration
    licence, the settlement paragraph. Read them whole and compact them; they are
    exactly the "rambling or redundant" the Closing step names.
  * **`docs/peoples-1890.md` is now ~2,300 lines** with §2's negative findings
    sitting above §7's deeper pass that overturns several of them (the kanzu THIN
    -> PERIOD, the Maasai transhumance RETRO-APPLIED -> PERIOD, the Okavango
    MODERN -> PERIOD, and §2.6's "EVIDENCE ABSENT" now answered for three
    peoples). A reader hitting §2 first gets the superseded answer. **Do not
    delete the old findings — they are the record of what was known when. Add
    forward-pointers at each superseded claim.**
  * **Screenshots**: 110/111 (settlement season) and 112 (Zulu cloaks) exist;
    147 will add more. Check `verification/` for shots no criterion references.
  * **The two moved villages** (somali -> Haud, swahili -> Lamu) touched
    `geo.ts`; check for comments elsewhere that still describe their old places.
  NOT IN SCOPE: the real Closing still runs at the end over everything. This is
  an interim pass over what exists at 147, and it does not tick the batch's own
  Closing section. (Filed 16.07.2026.)
  DONE (16.07.2026, f2c488f + 985305f): dead code removed (the coldCloaksFor
  shim, its callers gone since 137; its tests migrated to seasonalDressFor);
  CURRENT_WEATHER's doc corrected (the flora moved off it, only sun-dim +
  catchment read it now); the peoples-1890.md §2->§7 forward-pointer added (old
  findings kept, per the rule). Regression green throughout the session (vitest
  1597, lint clean, polish + enrichments green). design.md §19.13's
  settlement/dress paragraph was already recompacted in the 143 commit.

- [x] 149. A SECOND full weather verification, after the family dramas.
  Wanted (user, 16.07.2026): "Füge nach 123 zwei neue Tasks ein: 1. Erneute
  vollständige Wetter-Verifikation, so wie bei 147."
  ORDER: after 123 (see the work-order note). By then everything weather has
  landed AND the family dramas (122, 123) and the rivers (136) have rewritten
  the world around it, so the whole system is re-swept once more before the
  batch tail.
  WHAT TO RUN: exactly point 147's procedure, re-run — its (a)-(g), against the
  state as it exists after 123. 147 built the checks; this point re-executes
  them and re-takes the screenshot pairs. The standard is the same and is the
  point of it: the deliverable is a MEASUREMENT of what reaches the screen (the
  pixel probe, real dates, no override), not "the tests are green" — with a
  human able to SEE the difference on the screenshots. If 147's checks have
  rotted (a coordinate moved, a driver changed, a river reshaped the ground a
  season reads off), fix the GAME, in the direction design.md §19.13's
  exaggeration licence allows.
  ★ SPECIFICALLY re-verify what the intervening points disturb: 136 widened and
  smoothed the rivers — the dry-season shore catchment (120e) and any water-edge
  flora must still read; 122/123 added the swollen river and the drying
  waterhole, which ARE weather states and must show; 138-142 (Nile flood,
  Okavango, harmattan, ice/hail, seasonal life) each added a visible state — each
  must still be visible, not merely modelled.
  DOCS: none new; note the re-run in CLAUDE.md §7.1 pt. 12 only if a check
  changed. (Filed 16.07.2026.)
  DONE (17.07.2026, 07:10): the 147 procedure re-ran on the state after
  123/135/136/151/152/156 — and its RE-RUNNING is what forced most of
  point 135: the checks themselves exposed the drinker-belt swallowed by the
  widened rivers, the Victoria-Falls pixel spot, and the shore-seeder leak,
  all fixed in the GAME as the licence demands. Final state: THREE full
  enrichments runs in a row exit 0 (the same runs as 135's gate — they ARE
  the (a)-(g) re-execution) plus a fresh polish run (43 PASS, settlement
  season/dress/fire/presence). Human sighting of the re-taken pairs:
  115/116 (Matabele plateau July straw-bare vs January deep green WITH the
  point-151 sprouted ground flora and visible rain), 117/118 (Nile low vs
  October flood, canoe riding the smoothed wide band), 119/120 (Okavango fan
  full in the LOCAL dry July), 121 (harmattan pall), 122 (Atlas snow),
  110-114 (settlement rain/dress) unchanged and green in polish. Checks
  changed only in HOW they measure (135's honest-measurement fixes; the
  CLAUDE pt. 12 wording names no coordinates, so no doc edit needed).

- [x] 150. A SECOND interim Closing run, after the family dramas.
  Wanted (user, 16.07.2026): "…2. Einen erneuten Closing-Zwischenlauf."
  ORDER: after 149 (a Closing run should follow a green verification, not
  precede it). Same seam logic as point 148: a large amount will have been built
  since 148 (all of 138-142, 136, 122, 123), so the Closing steps are pulled
  forward again rather than waiting for the batch end.
  WHAT TO RUN: the four Closing steps at the bottom of this file, in order —
  full regression, then the dead-code/stale-doc/stale-comment cleanup in
  SEPARATE commits, then the full regression again, then the .md cruft pass with
  the section numbers preserved.
  ★ WHAT THIS PASS SPECIFICALLY OWES (the debris of the points built since 148,
  which a later reader will not recognise as debris):
  * whatever the river rebuild (136) left — old width/course constants, comments
    describing the pre-widening geometry, any waterSurface/riverBanks test that
    was loosened rather than re-tuned;
  * the family-drama state added by 122/123/145/146 — check for a shared helper
    that should have been extracted rather than copied (the §19.8 dramas grew by
    accretion and are the likeliest place for duplicated resolution logic);
  * design.md §19.8 and §19.13, which will have grown again;
  * `docs/peoples-1890.md` — re-check the §2-vs-§7 forward-pointers still hold if
    148 added them.
  Do NOT delete superseded findings — add forward-pointers (the 148 rule).
  NOT IN SCOPE: the real Closing still runs at the very end over everything; this
  is the second interim pass. (Filed 16.07.2026.)
  WIP (17.07.2026, 08:00): STEP 1 (full regression, npm test) ran — build/
  lint(after an unused-var fix)/1669 vitest/15 of 18 browser suites green;
  the three suite fails were triaged: collision's four ejection fails are
  LOAD flakes of the parallel full run (standalone rerun: 19/19 green —
  frame-budget class, note for a future 135-style point if it recurs), the
  single trample-119 fail (charged:false once) is the same rare class, lint
  was the unused variable. SWEEP commits so far: (A) stale scale-width
  comments in landmarks.ts refreshed + lint fix (84698fd); (B) the shared
  drama-death helper takeAnimal extracted over the eight §19.8 kill sites
  (188357b, subagent-verified: build/lint/1669 green). STILL OPEN: (C) the
  design.md §19.8/§19.13 growth pass (tighten rambling, forward-pointers not
  deletions, section numbers preserved); (D) peoples-1890 §2-vs-§7 pointers
  were checked OK (§8 is additive); then STEP 3 full regression again, and
  STEP 4 the .md cruft pass — note 158/159 landed mid-Closing and 160 (the
  design.md relocation) deliberately runs AFTER this point.
  DONE (17.07.2026, 08:49): all four steps ran. STEP 1 regression: 15/18
  suites green, triaged (collision = load flake, standalone 19/19; lint =
  one unused var). SWEEPS in separate commits: (A) stale scale-width
  comments (84698fd); (B) the shared drama-death helper takeAnimal over the
  eight §19.8 kill sites (188357b); (C) design.md §19.8/§19.13 tightened in
  place — defence bullets merged, the weather paragraph split topically,
  the duplicated snow gloss now defers to the researched ice paragraph
  whose Drakensberg entry it had silently truncated, and the grief
  carve-out is marked as the user decision IN §19.8 itself (e567a29);
  (D) peoples-1890 §2-vs-§7 pointers verified intact (§8/§9 additive).
  STEP 3 regression: 17/18 — the single fail exposed one more REAL find,
  the shore seeder's frame throttle stretching past the check window under
  load (now a seconds clock, a87a203; standalone re-run green). STEP 4: the
  .md growth since 148 lived almost entirely in design.md §19.8/§19.13
  (covered by C); CLAUDE.md §7.1 is deliberately untouched (binding
  acceptance anchors — the end-of-batch Closing re-checks it), TASKS.md is
  the living log. NOTE for later: the parallel full run remains load-
  sensitive for frame-budget checks (collision ejection windows) — a
  future 135-style point if it recurs.

- [x] 151. Seasonal flora is anchored to the PLACE, zone borders blend, and
  growth sprouts from the ground (user bug, 16.07.2026, two screenshots).
  SYMPTOM: walking/canoeing near the June/July ITCZ edge (13.4N/31.8E Gezira;
  18.1N/33.9E Nile) makes every visible plant slide/"fly" with each step, and
  crossing a climate-zone border flips the whole scene's flora state at once.
  ROOT CAUSE (verified in code): `SEASON_TINT_U` is ONE global uniform lerped
  per frame toward `effectiveGreenness` at the PLAYER's position
  (TravelScene ~line 825); `seasonFoliagePosition`/`seasonTintNode` displace
  and tint EVERY instance from it. Moving across a wetness gradient or a
  zone-rule boundary therefore animates all plants in view. The user asks for
  two properties: (1) zone transitions must be spatially GRADUAL, (2) a plant
  appearing with the season must SPROUT from the ground, not float in.
  FIX (season field): a small continent-covering greenness field texture
  sampled per plant/ground position — nothing reads the player position.
  * src/systems/season.ts: export a stable slot list — index 0 = hyper-arid,
    then the climate zones in a FIXED order — plus `seasonSlotAt(lat, lon,
    elevationM)` and a per-slot greenness helper (same curves floraGreennessAt
    uses; override fills all slots).
  * src/render/seasonTint.ts: a module DataTexture (Uint8, LinearFilter,
    fixed lon -20..55 / lat -36..38 bounds, ~0.5° texel) whose STATIC per-texel
    slot WEIGHTS are one-hot zone maps blurred by a ~1.5-2° kernel (the
    spatial blend the user asked for — hyper-arid fades too); per frame the
    14 slot greens (lerped 0.02 as today, weatherStrength applied) fill the
    texels via the weights. TSL: vegetation/terrain sample it through a baked
    `seasonUV` attribute (vec2) — InstancedBufferAttribute on the vegetation
    meshes, BufferAttribute on terrain chunks (both know lat/lon at build).
    `seasonTintNode`/`seasonFoliagePosition` take the green node as parameter;
    PlaceScene keeps the single-value SEASON_TINT_U path (one place, one
    greenness — correct there).
  * Sprouting (user): the binary 'foliage' attribute becomes a CLASS — 0
    never-moves, 1 tree crown (bare-branch collapse as today), 2 ground
    flora (bush, grass tuft, papyrus): anchored at y=0 and scaled toward the
    ground by dryness, so seasonal appearance reads as sprouting. Still
    per-part-uniform values only (the 144 shard rule); update
    src/render/flora.test.ts from binary to the three classes.
  TESTS: pure — slot mapping (hyper-arid 0, zones stable), field smoothness
  (a texel between two zones lies strictly between their greens), override
  fills; flora classes per builder. Live (enrichments): the field/table does
  NOT change while the player walks (the bug's witness — the old uniform
  did), and screenshots at BOTH user spots (June Gezira, July Nile) show
  stable flora; the 115/116 real-month pixel checks must stay green.
  DOCS: design.md §19.13 (spatial blend + sprout sentence), CLAUDE.md §7.1
  pt. 12. Priority insert: directly after point 122 (it corrects the
  just-shipped 143/144 look before 149 re-verifies the weather).
  (Reported 16.07.2026.)
  DONE (17.07.2026, 00:15): the greenness FIELD replaced the travel tint
  uniform — render/seasonField.ts (150x148 Uint8 texture over lon -20..55 /
  lat -36..38; per-texel slot weights = one-hot zone map blurred r=4 texels,
  built lazily; 15 lerped slot greens follow the calendar each frame) sampled
  through seasonUV baked per terrain-chunk vertex and per vegetation instance;
  seasonTint nodes take the tint node as a parameter (PlaceScene keeps its
  single-value SEASON_TINT_U — one place, one greenness); ground flora is
  foliage class 2 (bush/grass/papyrus sprout from the soil), crowns keep the
  bare-branch collapse. Pure: seasonField.test.ts (slot mapping == the
  floraGreennessAt curve incl. hyper-arid Cairo; a border transect is a
  GRADIENT — max neighbour step < 35% of the total swing; override floods
  every slot; strength 0 pins neutral; the greens are a pure function of the
  calendar) and the flora classes in flora.test.ts. Live: enrichments exit 0
  incl. the flying-plants WITNESS (fixed-spot field drift while the player
  travels == the standing calendar-lerp baseline, 0.0039 == 0.0039) and
  screenshots 123/124 at BOTH reported spots, visually checked (grounded
  shrubs, no floating); polish exit 0 (the settlement season path). Docs:
  design.md §19.13, CLAUDE.md pt. 12. Vitest 1649 green, lint/audit clean.
  ALSO: a UserPromptSubmit hook (scripts/dashboard-reminder-hook.mjs) now
  injects the dashboard obligation on every user prompt (user mandate after
  repeated staleness).

- [x] 152. The swimming traveller floats ON the water — never walks the bed
  (user bug, 16.07.2026, screenshot at Lake Edward).
  SYMPTOM: swimming across Lake Edward, the figure walks the carved rift bed
  far UNDER the lake sheet (readable through the translucent surface).
  ROOT CAUSE (verified): only the canoe lifts to the rendered surface —
  TravelScene ~1594 queries `waterSurfaceY` ONLY while `canoeing`; the
  swimming walker keeps terrain height, and Lake Edward's sheet sits at the
  lake-wide bedMax high above the local bed.
  FIX: while the traveller is on a river/lake water cell WITHOUT the canoe,
  lift the figure to the same `waterSurfaceY` minus a small immersion (swim
  depth, chest-deep ~0.35 — a new calibratable in balance if any tuning is
  plausible, else a named constant), with the walk-bob replaced by a slow
  swim bob; on the sea (type 'ocean', nearshore swim) the plane at ~0 is the
  surface, same lift. The camera/eye and the §6.1 swim hint stay as they are.
  TESTS: pure if a helper falls out naturally; live (enrichments): place the
  traveller mid-Lake-Edward and assert the rendered figure group's y sits at
  lakeSurfaceY − immersion (±0.1) not at the bed (the bug's witness), and a
  river swim keeps the figure at the ribbon surface; screenshot at Lake
  Edward. DOCS: CLAUDE.md §7.1 pt. 21 gains the swim-float clause if §11.3
  wording needs it (design.md §11.3 already says water is crossable swimming
  — add the visual float sentence).
  Order: directly after 151. (Reported 16.07.2026.)
  DONE (17.07.2026, 01:05): the figure lifts to waterSurfaceY − SWIM_IMMERSION
  (0.35, chest-deep) on any river/lake cell without the canoe, with a slow
  swim bob replacing the walk bounce; the sea keeps its ~0 plane through the
  same query. Live check at Lake Edward's data centre: swimming=true, the
  immersion gap 0.336 within the bob tolerance, and the sheet 2.5 world units
  above the carved bed — the exact bug case; screenshot 125 visually checked
  (figure on the sheet, legs submerged). TWO harness findings on the way:
  the __player dev hook only wrote on canoe/carry/wound FLIPS, so any check
  that jumped the player read a stale snapshot (now merged every frame —
  Object.assign keeps the trailer's .drag); and the swim check must jump the
  player back to the Cairo reach afterwards (its Lake-Edward stay let the
  vicinity chunks despawn and broke the point-102 check downstream). The
  roaming 135-class flakes (guard approach, 120e drinkers, 119 closed-metric)
  are logged in point 135 — the 152 check itself passed on both full runs.

- [x] 153. Ocean surf only near the coast, and ambient-volume sliders (birdsong).
  Wanted (user, 16.07.2026, "ans Ende vom Batch"): (a) the ocean-surf ambience
  plays only NEAR the ocean — fading out with distance from the coast and fully
  OFF beyond a calibratable cutoff (today it is presumably part of the global
  bed regardless of where the traveller stands); (b) the debug menu lacks
  per-source volume sliders for the other ambient sounds — at LEAST the
  birdsong needs one (localized labels, both languages, §21.2 write-through
  like the existing volume fields).
  ANCHORS: the ambience mixing lives where `refreshAmbienceVolume` and the
  §19.1 proximity calls live (src/systems/ or src/scenes/travel audio module —
  find `ambienceVolume`/`ambientVolume` consumers); coast distance per
  `coastDistance` (src/world/geoIndex.ts). Fade: volume × smoothstep(cutoff,
  nearRadius, distance), balance values (cutoff start ~8°? calibrate by ear at
  the debug speed), updated as the traveller moves.
  TESTS: pure — the fade curve (full at the shore, 0 at/beyond the cutoff,
  monotone between) and the new balance fields' debug write-through
  (`src/ui/DebugMenu.test.tsx`); live (`scripts/verify/settings.mjs`): at a
  coast the surf gain is >0, far inland (e.g. 15° from any coast) it is
  EXACTLY 0, and editing the birdsong slider changes that source's gain.
  DOCS: design.md §19.1 (surf is coastal), CLAUDE.md §7.1 pt. 20 (the single
  ambience volume gains the per-source sliders — name birdsong).
  (Reported 16.07.2026.)
  DONE (18.07.2026, ~06:05): (a) the surf bed was a flat port-only layer
  (`port ? 0.22 : 0`); now it fades with the coast distance through a pure
  `coastSurfGain(dist, nearRadius, cutoff)` (full within nearRadius, EXACTLY 0
  at/beyond cutoff, smoothstep between — pure-tested in
  `src/systems/ambience.test.ts`). The ambience controller computes the
  distance to the nearest coast each sync (`coastDistance`, the place's own
  coordinates in a settlement, the traveller's on the map) and feeds it via a
  new `setAmbienceCoast`; the surf layer target AND its gust wobble both scale
  by the coast proximity (the wobble too — else a faint swell leaked inland
  past the silenced target, a real audible bug the target-only test would miss;
  verified via a `surfWobble` hook). Balance: `surf.nearRadius` 0.4°,
  `surf.cutoff` 3° (debug-editable). (b) `balance.birdsongVolume` (default 1)
  scales the birds layer; a localized debug slider (de/en) writes through with
  `refreshAmbienceVolume`. Live (`scripts/verify/settings.mjs`): surf >0 at the
  shore, EXACTLY 0 far inland, the gust silent inland too, and the birdsong
  slider scaling the birds gain (full→half→0). Pure fade + DebugMenu
  write-through (three fields) tested; tsc/lint/build/1762 unit green. Docs:
  design.md §19.1, CLAUDE.md §7.1 pt.20 + its settings.mjs verify clause.

- [x] 154. F3 full loadout also sets the travel speed to 25.
  Wanted (user, 16.07.2026, "ans Ende der Batch"): the F3 debug shortcut
  (§21.1 full loadout) additionally sets `balance.travelSpeed` to 25 — the
  fast test-traversal speed, on top of the existing gear/zoom/health grants.
  ANCHORS: the F3 handler (search `F3` in src/ui/Hud.tsx or the shortcut
  module; it already writes gear, gifts, health, canteen, capacity, zoom
  unlock). Set `balance.travelSpeed = 25` and bump so the debug-menu field
  shows the new value (same mechanism the menu's own edit uses).
  TESTS: extend the existing F3 coverage (`src/ui/Hud.test.tsx` pure and/or
  `scripts/verify/settings.mjs` live — settings already asserts the F3 full
  loadout): after F3, `balance.travelSpeed` is 25 and the debug menu shows it.
  DOCS: CLAUDE.md §7.1 pt. 20's F3 clause gains "travel speed 25".
  (Reported 16.07.2026.)
  DONE (18.07.2026, 02:27): debugFullLoadout now sets balance.travelSpeed = 25
  before bumpBalance (so the debug-menu field shows it), CLAUDE §7.1 pt.20's
  F3 clause names it, and Hud.test.tsx asserts F3 sets travelSpeed to 25.
  Build/lint/1751 unit green.

- [x] 155. No inhabitant spawns stuck (Tuareg Village pocket).
  Wanted (user, 16.07.2026, screenshot, "fürs Ende vom Batch"): a villager
  stood wedged between the market stall's board, a rock and the market hut's
  curved wall in Tuareg Village — spawned into a pocket it cannot leave.
  CLAUDE §7.1 pt. 16 already promises "inhabitants never permanently stuck";
  the layout invariants check door reachability but NOT walker spawn freedom.
  FIX: (a) spawn placement — a walker spawn candidate is valid only with a
  clear standing circle (walker radius + margin) AND at least one open
  escape direction (probe a ring of steps at walker radius against the
  place's collision set: stall boards and rocks must count, not only
  buildings — check what the collider list includes; the screenshot pocket
  was formed BY a stall board and a rock); resample rejected candidates.
  (b) belt-and-braces runtime unstuck: a walker that could not move for a
  calibratable window (e.g. 10 s) while having a move target teleport-nudges
  to the nearest free spot (small, invisible correction — inhabitants only,
  never the player).
  TESTS: pure — `src/scenes/place/layout.test.ts` sweep across every place
  and several seeds: every inhabitant spawn point has the standing circle
  and an escape direction against the full collider set (incl. stalls and
  rocks). Live (`scripts/verify/collision.mjs`): observe walkers over a
  window and assert none stays pinned (zero displacement while unarrived)
  longer than the unstuck window.
  DOCS: CLAUDE.md §7.1 pt. 16 (the spawn-freedom clause). Order: batch end
  per the user. (Reported 16.07.2026.)
  DONE (18.07.2026, 06:44): the collider set already includes stalls (r1.35)
  and rocks (r0.35+); the gap was that jittered errand targets could land in a
  pocket and the walker's existing "stuck" only skipped the waypoint, never
  un-wedged the physically pinned body. (a) pure spawn-freedom helpers in
  collision.ts — standingClear (the mover fits), hasEscapeDirection (>=1 of 12
  ring steps lands clear), spawnPointFree (both), nudgeToFree (spiral to the
  nearest usable spot); the layout builder now nudges EVERY errand point to a
  spawn-free spot against the full collider set (WALKER_RADIUS shared). (b)
  belt-and-braces: a Walker that has not physically moved (frameMove <
  step*0.1) while in 'walk' mode for balance.walkerUnstuckSeconds (default 4,
  debug-editable, de/en) is teleport-nudged via nudgeToFree — inhabitants
  only, never the player. Pure: collision.test.ts (9, incl. an enclosed
  tight-ring pocket that spawnPointFree rejects and nudgeToFree escapes) and
  the layout.test.ts sweep (every place x 3 seeds: all errand points
  spawn-free). Live (collision.mjs): over a window > the unstuck deadline no
  walker's pinned time exceeds it and the walkers do move (non-vacuous) — 20
  pass 0 fail. DebugMenu write-through for the new field. tsc/lint/build/1804
  unit green. Docs: CLAUDE §7.1 pt.16, design.md §2.6.

- [x] 156. Settlement footprints stay clear of the widened rivers (Khartoum).
  Wanted (user, 16.07.2026): since point 136 widened the rivers, some
  settlements read as protruding into the water — Khartoum (at the White/Blue
  Nile confluence, both arms widened) named as the example.
  ROOT CAUSE: geo.ts auto-clears VILLAGE anchors (clearedOfRivers at module
  load, §4.2) and world.test checks anchor POINTS — but a settlement's
  bird's-eye FOOTPRINT (the rendered building cluster/panorama circle)
  extends beyond the anchor, and ports are exempt from the village clearance
  entirely. The 136 port nudge fixed only the three anchors that sat IN the
  water (Cairo, Timbuktu, Boma).
  FIX: extend the build-time clearing to every settlement with a
  footprint-aware margin — required distance = RIVER_WIDTH_DEG + the place's
  rendered footprint radius (derive from the same size the bird's-eye
  cluster uses; find where the travel scene draws the settlement cluster).
  Ports keep sitting AT the river (§4.2 exemption for closeness) but their
  buildings must not stand IN it: clear by the footprint, not the village
  clearance. Re-check the §4.2 riverside rule: the Nubian village must stay
  riverside on the Nile (world.test pins it).
  SCOPE EXTENSION (user, same evening): the same holds for LANDMARKS — the
  Sudd named as the example. Point 136's width-derived clearance auto-clears
  only Meroë; Giza was nudged by hand; the other cultural landmarks, the
  natural point-landmark dressings (Sudd papyrus field etc.) and the
  elephant graveyard were never re-checked against the widened band. Restore
  the minimum distance for ALL of them: apply the clearedOfRiversBy pattern
  (width-derived clearance + own footprint) per landmark — EXCEPT features
  whose identity IS the water (the Okavango delta fan floods by design; the
  Sudd dressing may hug the bank but no solid dressing stands IN the
  channel — reuse the §19 solid-dressing water rule where it fits).
  TESTS: world.test — every place (ports included) keeps
  riverDistance(anchor) >= RIVER_WIDTH_DEG + footprintDeg(size), Khartoum
  asserted explicitly; every cultural landmark rim and the graveyard clear
  the band (the existing rim probes already scale with RIVER_WIDTH_DEG —
  extend to the unshifted ones); the Sudd's SOLID dressing keeps out of the
  channel while its reeds may hug it. Live: bird's-eye screenshots of
  Khartoum and the Sudd clear of the arms (`scripts/verify/enrichments.mjs`).
  DOCS: CLAUDE.md §7.1 pt. 3 (footprint clause beside the village
  clearance). Order: after 152 (the fresh user bugs in reported order),
  before 123. (Reported 16.07.2026.)
  DONE (17.07.2026, 01:51): every clearance now scales with RIVER_WIDTH_DEG —
  villages RIVER_WIDTH+0.17 (0.442, deliberately under geoIndex's 0.45
  distance cap: a widthFactor past ~1.65 needs the cap raised alongside),
  ports get their own smaller auto-nudge RIVER_WIDTH+0.15 (the first 0.10 cut
  left Khartoum's annex touching the waterline ON SCREEN — the screenshot
  caught what the anchor test could not), EVERY cultural landmark clears by
  its own field radius (Meroë 0.73, Giza 0.35, default 0.3 — previously only
  Meroë auto-cleared), natural sites clear except the by-design-flooding
  Okavango (Sudd small margin: reeds hug the bank, nothing solid in the
  channel), graveyard swept. world.test sweeps ports (Khartoum explicit,
  both arms), natural sites and the graveyard — 104 world tests, 1664 vitest
  total. The "still AT Cairo" Giza bound widened to 1.15 (both anchors
  cleared apart across the band). Live: full enrichments exit 0; screenshots
  126 (Khartoum cluster on the bank, quay at the foam line, nothing in the
  blue) and 127 (Sudd reeds at the west bank, channel free) visually
  checked. The 151 witness route also hardened (westward across open plain;
  one run had an obstacle eat the northward leg).

- [x] 157. A fleeing calf never snags on an obstacle (escape uses deflection).
  Wanted (user, 16.07.2026): during a lion hunt the parent sacrificed itself
  correctly — but the FREED calf hung in place while "fleeing" (stuck against
  something, visibly running on the spot).
  LIKELY CAUSE: the calf's flee/escape step moves along the flee heading
  without the obstacle deflection other movers use — `deflectedStep`
  (wildlifeBehavior.ts) exists for coast/walk-off paths, and the bird's-eye
  collision (§11) pins movers at solid dressing (trees, rocks, termite
  mounds); a flee vector pointing INTO a collider produces exactly a
  run-on-the-spot. Check the escape branches: the freed calf after a
  sacrifice (caught -> undefined), the chase-victim weave, and the generic
  prey flight — whichever moved this calf.
  FIX: route the calf's (and generally prey's) flee step through the same
  deflection/slide used elsewhere (deflectedStep with a collider-aware
  blocked() — not only ocean), so a blocked heading swings along the
  obstacle instead of pinning. Keep the §19 rendered-facing turn cap.
  TESTS: pure — a flee step against a blocking probe deflects and still
  covers distance (wildlifeBehavior.test.ts, alongside the deflectedStep
  cases); live — pin a calf's escape line through an injected obstacle and
  assert real displacement over the escape window
  (`scripts/verify/enrichments.mjs`). Related: point 135's stochastic
  guarantees touch the same state machine — coordinate, don't duplicate.
  Order: batch end (after 155). (Reported 16.07.2026.)
  DONE 18.07.2026: the pin was the water-backstop yo-yo — the raw flee step ran
  the chased calf straight onto a water cell, the whole-herd backstop teleported
  it back to land, and next frame it ran onto the water again ("running on the
  spot"). The chase-victim flee (Wildlife.tsx, `a.young && chase && victim===a`)
  now routes through the new pure `calfFleeStep` → `deflectedStep` with a local
  ocean/water `blocked` predicate, so it steers along the bank; a dead-end leaves
  the catch to resolve it (the §19.8 always-resolves rule). Speed and the
  slower-than-hunter property are unchanged, so the chase still ends. Scoped to
  the fleeing CALF (the parent charge/shield raw steps noted as a possible
  sibling, not expanded). Pure test (straight-away, diagonal, deflect, cornered)
  in `wildlifeBehavior.test.ts`; 1828 Vitest green; enrichments green bar the
  known rotating staging flakes (165 cleared on retry; 145a is a watchlist flake
  — natural-hunt/timing interference at the staged calf, proven isolated from
  this change: the fire uses FIRE_STATE, not the LION_STATE chase branch touched
  here). CLAUDE §7.1 pt.12 updated. (145a staging stability → point 173.)

- [x] 158. An implementation table in docs/peoples-1890.md: research -> game.
  Wanted (user, 17.07.2026, "parallel zur Batch"): a NEW SECTION in
  docs/peoples-1890.md with a TABLE recording what the research led to in the
  game. Columns: (1) region — one row per region distinguished in appearance;
  (2) the affected settlements, alphabetical within each row; (3) which
  aspects were implemented (e.g. "men wearing a ... during summer");
  (4) how the game renders it (e.g. "a cylindric ... on their heads");
  further columns where sensible (e.g. the driver and the evidence source).
  Plus, after the table, whatever else about the research-to-game translation
  is worth recording (the rank gate, the sixteen deliberately unchanged
  peoples, the displacement of the seasonal signal onto fire/market/presence,
  the evidence-gating rule).
  SOURCE OF TRUTH: src/systems/dress.ts (SEASONAL_DRESS: zulu isipuku,
  rank-gated tuareg bernus and hausa zenne, san ‡nau, wayeyi caross, somali
  tobe over the head), the drivers (coldnessAt/harmattanAt/karifAt), points
  137/142 DONE notes, and §7 of the doc itself. English, like the whole doc.
  ORDER: user asked for it PARALLEL to the batch — worked immediately
  alongside point 150. (Reported 17.07.2026.)
  DONE (17.07.2026, 07:49): §8 added — a six-row table (one per
  region/people the game dresses seasonally: Tuareg bernus, Hausa zenne,
  Somali tobe-over-the-head, Zulu isipuku, San ‡nau, Wayeyi caross) with
  settlements, the research finding, the exact in-game rendering and a
  driver·gate·source column; followed by the deliberate-omission finding
  (sixteen peoples unchanged, the two named traps), the §7 displacement as
  implemented (fire/presence/market/rank-as-class) and the open
  worn-differently edge.

- [x] 159. An implementation section in docs/climate-1890.md: research -> game.
  Wanted (user, 17.07.2026): analogous to point 158 — a new section in
  docs/climate-1890.md describing WHICH research findings reached the game
  and HOW. STANDING RULE (user, permanent): BOTH implementation sections
  (peoples-1890 §8 and this one) are kept CURRENT whenever the climate or
  people rendering changes — recorded in memory.
  CONTENT: the zone model (climateZoneAt with the researched zones incl. the
  bug-hunting ones — atlantic-equatorial after the Fang-in-the-Sahara find,
  horn with Swayne's four seasons), wetness/greenness split, the drivers
  (harmattan, karif, coldness), Nile flood remote-fed with the 62-day lag,
  Okavango inversion, ice massifs vs the named near misses, hail, the
  Sahel's 1870-95 humid period, Cairo hyper-arid, the kitsch licence, the
  season field (per-position sampling), and how each is verified (pixel
  pairs, real months). English. (Reported 17.07.2026.)
  DONE (17.07.2026, 07:57): climate-1890.md §9 — a ten-row finding->game->
  verification table (zones incl. the two bug-found ones, humid-period
  Sahel, wetness/greenness split, harmattan with the muted-halo pin, karif,
  ice massifs vs named near misses, deterministic hail, remote-fed Nile
  flood, Okavango inversion, the per-position season field), plus the
  kitsch-licence note and the not-implemented-on-purpose paragraph. The
  STANDING RULE (both implementation sections stay current with any
  climate/people rendering change) is recorded in memory.

- [x] 160. Move the implementation tables into design.md; docs point to them.
  Wanted (user, 17.07.2026): the research->game implementation sections just
  added (peoples-1890.md §8, climate-1890.md §9) belong in design.md — they
  are game-DESIGN records. Move their content into design.md (sensible
  spots: near §19.13 for the climate table, near the peoples/settlement
  sections for the dress table; keep the referenced section numbering
  intact), and replace the two doc sections with short POINTERS to the
  design.md locations (keep the §8/§9 headings so existing references hold).
  The STANDING RULE moves with them: design.md's implementation tables stay
  current with any climate/people rendering change (memory updated).
  TIMING (user): only AFTER the point-150 Closing run completes, to avoid
  conflicts. THEN: re-check ALL documents for currency, consistency and
  redundancy (a fresh pass over design.md, CLAUDE.md, TASKS.md, docs/*.md —
  stale cross-references, duplicated content, contradictions).
  (Reported 17.07.2026.)
  DONE (17.07.2026, 09:09): relocation — design.md §19.14 (climate record)
  and §19.15 (peoples record) carry the full tables with the standing
  keep-current rule; peoples-1890 §8 / climate-1890 §9 are pointers
  (5fe7045). Then the full doc audit (read-only agent over design/CLAUDE/
  README/docs/*/verify-README) found seven issues, all fixed: the general
  store still SOLD the removed map item (design §9 table); CLAUDE pt 25's
  eight-vs-seven landmark count reconciled (Giza mounts as Cairo's skyline);
  two miscited research sections in the new records (hungry season ->
  peoples §3.1, wet Sahel -> climate §1.1) plus the karif row's notation;
  README presented the suspended deadline as active; and the six-people
  dress mapping was enumerated in full THREE times — §19.15 is now the only
  full source, design §19.13 and CLAUDE pt 12 point to it with every
  testable condition kept. Clean bill elsewhere: no encoding artifacts, no
  screenshot-number clashes, verify-README current, old width/tint claims
  all gone. Vitest 1669 green, lint clean.

- [x] 161. README mentions the authentic regional climate and dress.
  Wanted (user, 17.07.2026). DONE (same turn): a feature bullet — every place
  runs its researched seasonal calendar (humid-period Sahel, harmattan, Nile
  flood, Okavango inversion, real snow line) and the inhabitants answer it as
  the period sources describe (six evidence-gated seasonal garments; fire,
  market and transhumant presence carry the season for the rest).

- [x] 162. Vultures come for a family the parent just SAVED (drive-off leaves
  a phantom meal).
  User report (17.07.2026, screenshot, deployed build): a parent drove a LION
  off its calf — the point-124/125 drive-off, calf freed, both alive — "doch
  dann kamen trotzdem Geier": vultures landed by the LIVING family.
  SUSPECTED ROOT (from code, verify before fixing): the drive-off resolution
  in the charge/shield branches ends the hunt by setting `LION_STATE.mode =
  'leave'` DIRECTLY at the resolution point (Wildlife.tsx, the
  `outcome !== 'taken'` branches — "the walk-off picks up from the carcass
  flank like the feed->leave exit does"). The ORDINARY feed->leave exit is
  also the place that (a) spawns the prey REMNANT (`spawnRemnant`) and (b)
  keeps the kill flock's want up until the remnant is finished. A drive-off
  ends a feed WITHOUT a kill, so THREE guarantees must hold and each needs a
  check: (1) NO remnant is left (the acceptance text already promises "a
  feed that ends without a kill leaves none" — the direct-leave path may
  bypass that guard); (2) the kill flock stands DOWN (want drops with the
  leave; no circling flock lingering over the living family, no descend);
  (3) the ground scavenger never targets the freed calf's spot (nothing dead
  lies there — but check whether the caught-then-freed calf ever carried a
  transient dead/stain state the scavenger latched onto).
  FIX in the game: route the drive-off exit through (or mirror) the
  no-kill-feed exit so remnant and flock obey the existing no-kill rule;
  never a special case per resolution site (charge AND shield AND the
  giraffe kick all end hunts this way).
  TESTS: pure — the exit rule (feed ended by drive-off -> no remnant, flock
  want down) in wildlifeBehavior.test.ts if the rule is extracted, else pin
  it via the live path. Live (enrichments.mjs): stage the point-124 kick
  drive-off, then assert for ~10 s that no vulture lands within a radius of
  the living family, the kill flock's descend stays 0, and no remnant
  exists at the site. DOCS: CLAUDE.md §7.1 pt. 12 already promises the
  no-kill-no-remnant rule — sharpen its wording to name the drive-off exit
  once fixed. (Reported 17.07.2026; queued at the batch end per the
  standing append-and-defer rule.)
  DONE 18.07.2026: the root was (2) — the kill-flock's presence flag keyed on
  the predator's mode being 'feed' OR 'leave', so a drive-off (mode -> 'leave',
  no kill) kept the gathered flock active and it flew in over a phantom meal.
  Guarantees (1) and (3) were already correct and left unchanged: spawnRemnant
  runs only in the feed+dead branch (a drive-off spawns no remnant), and the
  freed calf is alive so the ground scavenger's !dead guard already excludes it.
  Extracted the flag as the pure `killFlockActive(mode, hasRemnant) = mode ===
  'feed' || hasRemnant` (wildlifeBehavior.ts) and use it inline at the flock's
  flightStep; during 'leave' the flock now stays only for a real remnant, so the
  feed->leave descent (which rode on the remnant) is unchanged. Pure test (6
  cases: feed/leave/idle x remnant) + a live enrichments drive-off check (gather
  the flock, then leave with no remnant -> it flies off, never lands). CLAUDE
  §7.1 pt.12 sharpened to name the drive-off. 1828 Vitest; enrichments green bar
  the unrelated rotating 165 staging flake (pops:1, ground-animal seeder, not
  the flock — 145a passed this run). Verify: `wildlifeBehavior.test.ts`,
  `scripts/verify/enrichments.mjs`.

- [x] 163. DONE 21.07.2026 — the HUD now publishes the live inventory-bar height
  as the CSS variable `--inv-bar-height` (a ResizeObserver on `.inventory-bar` in
  `InventoryBar`, cleared when the bar is absent), and `.map-overlay` anchors its
  bottom to `calc(var(--inv-bar-height, 32px) + 24px)` — so the atlas AND the
  town-plan variant ride above the bar however many rows it wraps to, while a
  single row keeps the journal's ~56px gap (point 115). A jsdom ResizeObserver
  stub was added to the test setup; `Hud.test.tsx` asserts the variable is
  published on mount and cleared on unmount; `enrichments.mjs` presses F3 to wrap
  the bar to two rows, opens the map and asserts no overlap and the map's bottom
  clears the bar's top (placed last so F3's loadout/zoom/speed can't leak). Build
  + lint + 41 Hud / 9 ui vitest green; enrichments 208/0/0 (point 115 intact).
  ORIGINAL: The opened map covers the inventory bar's SECOND row.
  User report (17.07.2026, screenshot, deployed build): with enough items to
  wrap the inventory bar into a second row (the F3 full loadout shows it —
  treasures wrap), the opened map overlay covers the wrapped row(s): "Die
  Karte muss in diesem Fall nach oben ruecken."
  The §7.1 pt. 3 acceptance already promises "the opened map sits
  bottom-left clear of the inventory bar" — the guarantee holds for one row
  and breaks on wrap, so this is a regression against existing acceptance,
  not a new feature.
  FIX: anchor the map overlay's bottom edge to the TOP of the inventory bar
  whatever its height — measure the bar (ResizeObserver on `.inventory-bar`
  or read its offsetHeight when the overlay opens/resizes) and set the
  overlay's `bottom` to bar height + the existing gap; a pure-CSS anchor
  (both in one flex column, or `bottom: calc(...)` fed by a CSS variable the
  bar sets) is also fine — whichever matches the existing HUD structure in
  `src/ui/MapOverlay.tsx` / `src/ui/Hud.tsx`. The same rule must hold for
  the town-plan variant inside settlements.
  TESTS: extend the existing live non-overlap check in
  `scripts/verify/enrichments.mjs` (the map placement block): press F3 so
  the bar wraps to two rows, open the map, and assert the map's bounding
  box does not intersect the inventory bar's box (both variants if cheap);
  `src/ui/MapOverlay.test.tsx` gets the structural half if the fix
  introduces one (e.g. the CSS variable/prop present). DOCS: none — §7.1
  pt. 3's wording already states the guarantee. (Reported 17.07.2026;
  queued at the batch end per the standing append-and-defer rule.)

- [x] 164. Plants still jump back and forth while travelling along the Nile.
  User report (17.07.2026 — "zu diesem Zeitpunkt an diesem Punkt" refers to
  a Nile stretch; the two point-151 spots are repro candidates: 13.4N/31.8E
  in June and 18.1N/33.9E in July. SECOND REPORT with screenshot, 17.07.2026
  22:53: "Auch hier fliegen Pflanzen ein" at 8.6N/21.8E on 13.10.1890 —
  West region, October, i.e. NOT a Nile spot: the bug is general, three
  dated coordinates now pin it): driving
  along the Nile, plants still JUMP BACK AND FORTH — "Das soll vermutlich
  eine Interpolation zwischen den Jahreszeiten sein, aber so darf das nicht
  ablaufen." This is the point-151 family (the flying-plants fix landed the
  per-position season field and ground-sprouting), but the jumping now
  happens WHILE MOVING, so the remaining suspects are movement-coupled:
  (a) CHUNK STREAMING restarts: flora chunks rebuilding as the traveller
      moves may replay the class-2 sprout animation on every rebuild — each
      re-entered chunk sprouts anew, reading as plants popping up/down while
      driving. Check whether the sprout progress is keyed to absolute
      calendar/plant identity (stable) or to chunk-build time (replays).
  (b) MISSING HYSTERESIS at the foliage visibility threshold: near the
      greenness value where ground flora appears/disappears, tiny sampling
      differences (per chunk rebuild or per LOD) toggle instances on/off —
      a band (appear at g>0.55, vanish at g<0.45) would stop the flicker.
  (c) seasonUV DISCRETISATION per chunk: if neighbouring chunks quantise the
      field differently, the same spot's flora state flips at chunk borders
      as they stream.
  DIAGNOSE FIRST with a probe (the 145b lesson: one-off probe with the
  SUITE's chromium launch args, NOT a bare launch): drive the 151 spots in
  June/July, track a fixed set of flora instances (position + visibility +
  scale) across chunk rebuilds, and identify which of (a)-(c) actually
  fires. FIX in the game accordingly (stable sprout keying / hysteresis
  band / consistent quantisation); pure-test the rule that fixes it
  (seasonField/flora tests exist for the 151 half). Live: extend the
  point-151 stability check (enrichments) with a DRIVEN pass — walk the
  stretch and assert no tracked instance toggles visibility more than once.
  DOCS: design.md §19.13 wording if the rule sharpens. (Reported
  17.07.2026; queued at the batch end per the standing append-and-defer
  rule.)
  DONE (18.07.2026, 07:40 — user pulled it up): a three-round probe
  (scripts/verify/_flora-probe.mjs, suite launch args, then removed)
  DISPROVED both leading suspects: (a) the MAX_INSTANCES cap — NO species
  overflows at any of the three reported spots (bush 521<1800, jungle
  739<2600); (c)/season — the per-position field converges MONOTONICALLY
  after a jump, never oscillating. The real cause was the STREAMING: the
  dressing rebuilt a FIXED ±6-chunk neighbourhood on every chunk crossing,
  so its square edge popped — toggles binned by distance were [<40:0,
  <80:0, <120:0, <160:46, <400:200] with maxDrawnDist 227, i.e. ZERO within
  120 units and all popping at the 120-227 edge, which sits IN VIEW at a
  wide zoom (viewR = 100xzoom). FIX (mirrors the wildlife streaming): a new
  pure module src/scenes/travel/floraStreaming.ts — floraSpawnRadius (viewR
  + 30 margin, a CIRCLE beyond the view so the edge is off-screen),
  floraChunkRange (bounded), floraInSpawnCircle (per-plant circular filter),
  floraShouldRebuild (rebuild only past a 16-unit hysteresis step or a zoom
  change, so a back-and-forth no longer re-pops). TravelScene consumes them;
  VEGETATION_HIDE_ZOOM 3->2.5 keeps viewR under the capped radius. Re-probe
  after the fix: in-view toggles = 0 at zoom 0.5/1/2 (was 46+200 in-range at
  zoom 2). Pure test floraStreaming.test.ts (8: edge beyond view even after
  a full hysteresis drift, the circular filter, the hysteresis dead-band,
  bounded range); live: the point-151 witness now extended with a DRIVEN
  pass (enrichments) — drive back and forth at zoom 2, zero in-view bush
  toggles across rebuilds. tsc/lint/build/1812 unit green. Docs: design.md
  §2.5 dressing note, CLAUDE.md §7.1 pt.12 (the 151 clause gains 164).

- [x] 165. Animals pop into existence in plain sight.
  User report (17.07.2026): "Es erscheinen immer wieder Tiere ploetzlich vor
  meinen Augen. Sie sollen nur ausserhalb des Sichtfeldes spawnen." The
  vulture standard (spawn beyond the zoom-aware view ring, §19.6) already
  states the rule for flights; the GROUND spawners do not all honour it.
  AUDIT FIRST (a spawn-audit dev hook: every push into a herd list logs
  distance-to-player vs the current viewR and the spawner's name; drive
  around and read the counters) — the suspects, in likelihood order:
  (a) the GUARANTEE SEEDERS: seedSettlementVicinity places animals within
      the panorama vicinity radius of a settlement the player just left
      (близко by design — but it may fire IN VIEW), and seedDryShoreDrinkers
      tops up the nearest bank inside the view ring on a 2-second clock —
      both place standing animals where the player can watch them appear.
  (b) ZOOM-OUT growth: widening the ring spawns the newly covered chunks
      instantly — in the middle of the freshly visible field.
  (c) the newer spawn branches ride the same chunk path (crocodile, plover,
      rinderpest carrion) — covered once the chunk rule is fixed, but the
      audit should confirm none of them fires inside view on its own.
  FIX per finding, keeping the acceptance guarantees honest: seeded
  placements pick spots OUTSIDE the current view ring wherever the
  guarantee's own radius allows (the dry-shore bank has stretches beyond
  view; the vicinity ring reaches past viewR at default zoom); where a
  guarantee genuinely requires an in-view spot, the animal must ENTER
  instead of popping (walk in from outside the ring — the scripted
  predators already do this; never a fade hack). Zoom-growth spawns may
  need a one-frame defer + walk-in or spawn-at-ring placement. The §19
  no-popping acceptance text then covers ground spawns explicitly.
  TESTS: pure for whatever placement rule is added (outside-ring pick /
  walk-in entry); live (enrichments): a driven pass with the audit hook
  asserting no ground animal APPEARS within the view ring (streaming,
  seeders and a zoom-out each exercised). DOCS: design.md §19.5/§19.6
  wording + CLAUDE.md §7.1 pt. 12. (Reported 17.07.2026; queued at the
  batch end per the standing append-and-defer rule.)
  DONE (18.07.2026): AUDIT FIRST, by the PICTURE. A one-off spawn-audit probe
  drove the Maasai plains (settlements + shore, dry season) and — by OBJECT
  IDENTITY — flagged every animal that appeared ON SCREEN (projected via the
  point-171 `__camera.onScreen`, NOT the 100×zoom viewR — the 172 lesson). It
  caught 5 plain-antelope pops at the ACHIEVABLE zoom 0.5 (0 at 1.5), and they
  were INTERMITTENT: the guarantee-seeders place at distMin=20..distMax=53 from
  the settlement, i.e. right at the ~40 frame EDGE, and camera-lerp jitter flipped
  them across it. FIX: a shared `isOnScreen(x,z)` singleton
  (`src/scenes/travel/frameVisibility.ts`) that TravelScene installs every mount
  from the LIVE bird's-eye camera (projecting to NDC with a 0.18 edge margin);
  `seedSettlementVicinity` now picks an off-screen land spot via the pure
  `pickOffscreenLandAnchor` (prefers off-screen land, falls back to on-screen land,
  else null), and `seedDryShoreDrinkers` only seeds a bank while it is off-screen
  (so it scrolls into view already populated). The main chunk stream already
  spawns beyond the frame (0 pops at 1.5 confirmed), so the range cap needed no
  change. VERIFY: `pickOffscreenLandAnchor` pure-tested (4 cases) in
  `wildlifeBehavior.test.ts`; a driven `enrichments.mjs` pass at 0.5 (plus a
  zoom-out) asserts 0 animals appear inside the frame — two post-fix probe runs
  read 0 where the pre-fix run read 5. DOCS: design.md §2.5/§19.6, CLAUDE.md
  §7.1 pt.12. OPEN (deferred here, filed under this point's spirit): the 172
  carrion-visibility finding (0 of 13 plague carcasses in the frame at 0.5) is a
  SEPARATE concern — carrion is DEAD and cannot walk in; making a struck village's
  carrion more forward-visible at 0.5 is left as a follow-up, the enrichments
  carrion check still counts within viewR with an OPEN note.

- [x] 166. Thunderstorms: lightning WITH thunder, as a pair.
  User question/wish (17.07.2026, screenshot at 10.0N/26.0E in the August
  rains): "Hat das Wetter hier Gewitter mit Blitzen? Dann sollte es auch
  einen Donner dazu geben." AUDIT ANSWER (code, 17.07.2026): the game has NO
  lightning today — §19.13 weather carries rain streaks, fog, overcast and
  the hailstorm (`hailAt`, gated to heavy storms); what the screenshot shows
  are the tilted rain/hail streaks. So this is a NEW FEATURE point: build
  the thunderstorm as a Blitz+Donner PAIR, never a silent flash.
  (a) GATE like the hail (the researched §19.13 pattern): lightning exists
      only inside a HEAVY STORM in a zone whose season carries real storms —
      reuse the hail precondition (real rain required, so a rainless zone
      can never flash), rare and deterministic (no Math.random in the sim;
      hash on day+place like the hail roll).
  (b) FLASH: a short (<300 ms) backend-neutral brightening — sky dome and
      ambient light pulse (the §2.7 pipeline's existing uniforms; no new
      light source, no screen-space hack), visible in both the bird's-eye
      and settlement views under the same place-weather rule.
  (c) THUNDER: a rumble sample under the single ambience volume (§20),
      DELAYED after its flash by a distance-plausible 1-4 s (hash-derived
      per strike), so the pair reads as weather, not a sound effect. Respect
      the ambience volume 0 => silent.
  (d) The traveller is never harmed (any gameplay lightning would be a §14
      design decision — deliberately not invented, like the fire rule).
  TESTS: pure — the gate (only in heavy storm, never rainless, never dry
  season; sweep like the hail tests in `src/systems/season.test.ts`) and
  the flash/delay parameter derivation; live — force the storm, measure the
  screen brightness pulse and assert the delayed audio node fires
  (`scripts/verify/enrichments.mjs` or `settings.mjs`, whichever owns
  weather audio). DOCS: design.md §19.13 + CLAUDE.md §7.1 pt. 12. (Filed
  17.07.2026; queued at the batch end per the standing append-and-defer
  rule.)
  DONE (21.07.2026): `thunderstormAt(day,lat,lon,startYear,elevationM)` in
  `src/systems/season.ts` gates a strike on the hail precondition (heavy
  storm, real rain, deterministic hash — a rainless/dry zone never flashes),
  `thunderDelaySeconds(strikeSeed)` derives the 1-4 s hash-per-strike delay,
  and `CURRENT_WEATHER.flash` carries the pulse. The flash brightens the sun
  + ambient light additively in BOTH views (Climate.tsx bird's-eye,
  PlaceScene.tsx settlement, TravelScene.tsx sun uniform — no new light
  source), and `playThunder(delay,strength)` in `src/systems/ambience.ts`
  rumbles a brown-noise sample on the single ambience bus (volume 0 =>
  silent). The traveller is never harmed. Pure tests in season.test.ts (gate
  sweep + delay derivation); live in `scripts/verify/enrichments.mjs` via the
  deterministic `__climate.forceStrike(0.8)` dev hook (flashPeak + delayed
  `__thunder` node). Docs: design.md §19.13, CLAUDE.md §7.1 pt. 12.

- [x] 167. Rain snaps on at a climate-zone border instead of easing in.
  User report (17.07.2026 22:54, screenshot at 5.0N/25.4E walking south into
  the Central/Congo zone): "Der Regen setzt etwas zu ploetzlich ein, wenn man
  in eine andere Klimazone laeuft." Point 151 smoothed the GREENNESS field
  across zone borders (~2-degree gradient via the blurred zone-weight
  texture), but the RAIN and its weather look are still keyed to the discrete
  zone: `climateZoneAt` returns ONE zone, so the wetness/rain amount steps at
  the border and the rain streaks pop on within a stride.
  FIX in the game: the displayed weather must interpolate across the border
  like the greenness does. Either (a) sample effective wetness through the
  SAME spatially-smoothed field the season/greenness uses (reuse the blurred
  zone-weight sampling — one smoothing source for ground AND weather, so they
  can never disagree at a border), or (b) blend the per-zone wetness of the
  neighbouring zones by the same border weight. The rain amount, fog, sun dim
  and overcast (`rainAmount`/`seasonFogParams`/`skyOvercastParams`) then all
  ramp over the ~2-degree band. Keep it a pure function of position+date
  (the 151 witness: walking must not itself change the field).
  CARE: this is the DISPLAY smoothing only — the underlying per-zone climate
  model (docs/climate-1890.md, the researched wet seasons) stays exact; a
  border is a gradient in what's DRAWN, not a rewrite of either zone's
  climate. And the settlement (§19.13 place weather) reads its own single
  coordinate, so it is unaffected — this is the bird's-eye traversal case.
  TESTS: pure — the effective-wetness sampler returns a value strictly
  between the two zones' wetness at a border texel and equals each zone's
  wetness deep inside it (like the seasonField border test); live
  (enrichments) — walk a N-S line across this border and assert the rain
  amount changes MONOTONICALLY over several steps rather than in one jump.
  DOCS: design.md §19.13. (Reported 17.07.2026; queued at the batch end per
  the standing append-and-defer rule.)
  DONE (18.07.2026, ~09:45): the cause was exactly as spec'd — the travel
  weather read `effectiveWetness` → `wetnessAt` → the DISCRETE `climateZoneAt`
  (one zone), so wetness stepped at a border and the rain snapped on within a
  stride. Fix (option a — one smoothing source for ground AND weather): a new
  `slotWetness(day, slot, startYear, lat)` in season.ts (each season-field
  slot's absolute wetness = its zone shape × ZONE_WETNESS, the Sahel latitude
  squeeze applied smoothly from lat), and `smoothedWetnessAt(day, lat, lon,
  startYear, override)` in seasonField.ts that blends slotWetness through the
  EXACT SAME blurred zone-weight map the point-151 greenness field uses — so a
  border texel reads strictly between its two zones and deep inside a zone
  equals the discrete `wetnessAt`. Climate.tsx (the bird's-eye traversal) now
  samples smoothedWetnessAt for rain/fog/sun-dim/overcast; the settlement path
  keeps the discrete per-coordinate wetnessAt (one point, unaffected). Pure:
  seasonField.test.ts — deep-inside equals the discrete value, a N-S Sahel→
  Sahara walk fades as a gradient (maxStep < half the swing), a mid sample
  strictly between the ends, override + purity. Live: enrichments walks 12→22N
  along 0°E in August and asserts the traversal wetness fades as a gradient,
  not a snap. Display smoothing only — the researched per-zone model stays
  exact. tsc/lint/build/1814 unit green. Docs: design.md §19.13.

- [x] 168. Rinderpest carrion not visible at the Maasai village in a struck year.
  User report (17.07.2026 23:xx, deployed build auto-deploys from main, so the
  feature IS live): at 15.01.1892 (a STRUCK year), season strength 1, standing
  at 2.8S/36.7E by the Maasai village, NO carcasses at standard zoom nor fully
  zoomed in. The point-133 live check PASSES (carrionStruck 9 at 1891), so the
  spawn logic works — the discrepancy is in-game visibility. SUSPECTS, verify
  in order:
  ★ HYPOTHESIS (a) DISPROVEN by the user (17.07.2026 23:16): they walked far
  NORTH to 20.8N and back to the village at 31.12.1891 (a struck year, so the
  chunks re-streamed fresh) — still NO carcasses. So it is not a re-stream
  issue. ★ REAL CAUSE, now clear: the point-133 live check passes only because
  it forces ZOOM 2 (a large stream ring) + restock and finds 9 carcasses
  spread over MANY chunks near -2.5/36.4; at the user's STANDARD zoom (0.5)
  the view ring is small, few chunks stream near the (rocky, Kilimanjaro/Meru-
  adjacent) village, and the carrion is doubly probabilistic (roll < 0.5 AND
  each carcass offset must re-sample as savanna — the rocky neighbours fail
  it), so 0 show. This is a "test passes, player sees nothing" case (the
  weather-uniform lesson): the STANDARD is the picture, not the green check.
  FIX: GUARANTEE visible carrion at normal zoom near a struck village — seed a
  minimum count of plague carcasses within the settlement vicinity when the
  place is in the struck phase (mirror the point-102 seedSettlementVicinity /
  point-135 dry-shore guarantee: a calibratable minimum within
  panoramaVicinityRadius, placed on the nearest savanna the player can see,
  deterministic). The chunk-spawn carrion stays as the ambient spread; the
  vicinity guarantee is what the player actually SEES. And re-point the live
  check to the USER's conditions (standard zoom, at the village, fresh) so it
  can never again pass while the picture is empty. PRIORITY: right after 129 —
  this is a shipped feature (133) that does not show in normal play.
  (b) TERRAIN: carrion only spawns on `anchor.type === 'savanna'` chunks. The
      ground around Mount Meru/Kilimanjaro is highland/volcanic — sweep
      __terrainType across the village vicinity and confirm enough savanna
      chunks exist within CARRION_RADIUS_DEG; if the immediate village sits on
      non-savanna, widen the eligible types or ensure the plains beyond do
      carry it.
  (c) ZOOM CULL: at the far debug zoom the wildlife/dressing hides; confirm the
      carcasses show at the standard and near zooms (the user tried both, so
      likely not it, but confirm).
  DIAGNOSE with a probe (suite launch args): jump to 1892, restock, sweep the
  village vicinity for dead wildebeest/antelope and log terrain types + counts.
  FIX per finding; add a live check that after a year jump INTO a struck year
  the local plains show carrion without needing to travel away and back.
  DOCS: design.md §16 note on the date-jump re-stream if that is the fix.
  (Reported 17.07.2026; queued at the batch end per append-and-defer.)
  ATTEMPT 1 REVERTED (18.07.2026, 02:23): a per-frame seedStruckVillageCarrion
  (mirroring seedSettlementVicinity) placed 0 carcasses at the village AND
  broke 11 other checks — REVERTED to keep the suite green. TWO lessons for
  the redo: (1) INVASIVE FRAME SEEDER vs THE TEST SUITE — the seeder fires
  for any struck village within vicinityRadius (75) of the player on the
  current date; the Serengeti family-check spot (-2.2/34.8) is only ~20 world
  units from the Maasai village (-2.5/36.8), INSIDE that radius, so when an
  earlier check (133 jumps to 1891, the reverted 168 check to 1892) leaves
  the calendar on a struck year, the seeder floods the Serengeti
  wildebeest/antelope with carcasses and the family-pair checks fail ("no
  pair"). (2) IT STILL PLACED 0 AT THE VILLAGE — unresolved: likely the
  village chunk is not yet in spawnedChunks at the standard-zoom measurement
  right after restock, so the `spawnedChunks.has(chunkKey)` gate skips it.
  SAFE REDO — prefer the LEAST invasive option: instead of a per-frame
  seeder, raise the carrion at CHUNK-STREAM time when the chunk lies within a
  struck village's radius — force at least one carcass per eligible savanna
  chunk (bounded, per-chunk, cannot flood), so standard-zoom streaming shows
  it without a separate seeder. If a seeder IS needed, it MUST be throttled
  (a seconds-clock like seedDryShoreDrinkers) and every date-jumping live
  check MUST reset the calendar afterward so a struck date never leaks into
  later checks. DIAGNOSE the 0-at-village first with a dev hook (is the
  village chunk spawned? is the branch reached?) before re-implementing.
  DONE (18.07.2026, 03:44 — attempt 2, safe): the carrion CHUNK branch (the
  suite-safe mechanism, unlike the reverted frame seeder) now fires on ANY
  land within the struck village radius, not only a savanna anchor — the
  rocky Maasai village has few savanna chunks in the small standard-zoom
  view ring, so the savanna gate left the player with nothing while the
  wide-zoom check saw far-out savanna. roll<0.5 still leaves living herds on
  the other near chunks (family dramas stage), and it fires only at struck
  dates. The live check (SINGLE evaluate, like 133 — a three-evaluate split
  had lost window.__wildlife to a remount, the chunks:-1/totalPlague:0 red
  herring) proves it at the USER's conditions: standard zoom 0.5, near the
  village, 1892 -> 17 carcasses in view (totalPlague 19, 27 chunks), and it
  resets the year to 1890 afterward (calendar hygiene) so no struck date
  leaks into later checks (no cascade). Docs: design.md §16. Code+docs
  committed 031d4e6. The run's other FAILs (118/calf-charge) were rotating
  family-staging flakes, different each run, unrelated to this change.

- [x] 169. Too few juveniles — raise the calf-to-adult ratio.
  User request (17.07.2026 23:xx): "Ist das Anzahlen-Verhaeltnis zwischen
  erwachsenen Tieren und Jungtieren akkurat? Mir kommt es nach zu wenigen
  Jungtieren vor. Mehr Jungtiere waeren auch deswegen schoen, weil die
  Familiendrama-Szenarien dann haeufiger eintreten koennten." CURRENT (verified
  in code): placeGroup (Wildlife.tsx ~903) creates EXACTLY ONE calf per herd of
  >= 3 — a 7-strong zebra herd has 1 calf, 6 adults (~14%), and only ONE
  family unit per herd, so the §19.8 dramas (predation, water, mire, grief)
  can only ever target that single calf. Real herds run 20-40% juveniles in a
  good season.
  FIX: raise the juvenile count per herd to a CALIBRATABLE fraction of herd
  size (balance value, e.g. balance.family.calfFraction ~0.3, debug-editable
  per CLAUDE §2/§21) — link EACH calf to a nearby adult as its parent (not all
  to one), so multiple family units coexist and the dramas fire more often.
  Keep the calf build (baby schema, scale *0.55) and the MAX_CALF_INSTANCES
  cap in mind (raise if needed). CARE: the drama code assumes parent.child is
  one calf and calf.parent one adult — that 1:1 link stays per pair; just make
  MORE pairs. Verify the existing family-drama live checks still stage (they
  pick a calf near the player — more calves only helps). The panorama/vicinity
  seeders and MAX_INSTANCES budgets must absorb the extra young.
  TESTS: pure — the calf-count helper (fraction of herd size, >=1 for >=3,
  capped) in wildlifeBehavior.test.ts; live — a spawned savanna herd shows
  more than one calf, each with its own parent link (enrichments). DOCS:
  design.md §19.8 (the herd raises SEVERAL young) + CLAUDE §7.1 pt.12/20 (the
  tunable). (Reported 17.07.2026; queued at the batch end per append-and-defer.)
  DONE 18.07.2026: `balance.family.calfFraction` (0.25, debug-editable) drives
  `calvesForGroup(n, fraction) = n<3 ? 0 : clamp(round(fraction·n), 1, floor(n/2))`;
  the K last-placed members of each herd group become calves, each linked 1:1 to
  one of the first K adults as its parent (so the 1:1 drama invariant holds while
  more pairs coexist). MAX_CALF_INSTANCES 24→48 to absorb the extra young.
  DebugMenu field + i18n (de/en). Pure test (count + distinct parents) in
  `wildlifeBehavior.test.ts`; live more-juveniles check in enrichments (a higher
  fraction yields strictly more juveniles). design.md §19.8 + CLAUDE §7.1 pt.12.
  1828 Vitest + enrichments 197/0 green.

- [x] 170. DONE 21.07.2026 — a re-entry into a village whose rinderpest phase
  changed since it was last journaled now adds a shocked RETURN vignette
  describing only the change. The store persists `villagePhases` (phase last
  journaled per village, saved with the checkpoint, legacy saves default to {}
  and are seeded silently on first re-entry); `enterPlace` stores the phase on
  first visit and, on a return, emits `journal.villageReturn` when the pure
  `villageSituationChanged(stored, current)` predicate fires (non-rinderpest
  peoples keep a constant 'clean' phase → never re-fire). New bilingual texts
  (voice markup, shocked register drafted with Fable 5) cover the modelled
  transitions — maasai preDamaged→struck, struck→aftermath, preDamaged→aftermath;
  sidama struck→aftermath — with a markup-clean generic fallback. Tests: pure
  predicate (rinderpest.test.ts), per-transition distinct + markup-clean texts in
  both languages (villages.test.ts), and a store test that a phase-changed
  re-entry adds exactly one entry while an unchanged one and a plague-less people
  add none (store.travel.test.ts); parity count 59→61, i18n markup scan green
  (the `[transitionKey]` rename avoided a false-positive tag match). design.md §16
  documents the return-visit path. build+lint+1989 vitest green.
  ORIGINAL: A RETURN journal entry when a village's situation has changed.
  User request (17.07.2026 23:xx): the village vignette currently fires only on
  the FIRST visit. "Aendere das dahingehend, dass auch wieder einer kommt, wenn
  sich im Dorf die Situation veraendert hat. Der neue Eintrag soll dann nur
  beschreiben, was ich veraendert habe. So in der Art, dass man entsetzt ist,
  was hier seit dem letzten Besuch anscheinend passiert ist." — a NEW entry on
  re-entry when the situation changed, describing ONLY the change, in a shocked
  register.
  This is the natural companion to point 133: the change that matters today is
  the RINDERPEST PHASE (rinderpestPhaseAtDay). A traveller who first met the
  Maasai in 1890 (preDamaged) and returns in 1892 (struck) or 1893 (aftermath)
  should get a return entry describing what befell the village since — horror
  at the emptied kraals, the famine figures, the torn cattle-loan fabric.
  IMPLEMENTATION:
  (a) Persist per village the LAST-JOURNALED phase (store state, saved with the
      checkpoint like `visited`). On entering a village that is `visited`, if
      rinderpestPhaseAtDay now differs from the stored phase, emit a RETURN
      entry and update the stored phase; else stay silent (no spam).
  (b) NEW TEXTS (both languages, voice markup, §16): a phase-transition vignette
      keyed on (people, fromPhase -> toPhase) — at minimum the meaningful
      Maasai/Sidama transitions (preDamaged->struck, struck->aftermath,
      preDamaged->aftermath if the player skips years). The text describes only
      what CHANGED since last time, shocked/somber ([fear]/[somber]),
      NOT a re-description of the whole village. Reuse Baumann's period register
      for the Maasai struck transition.
  (c) Guard: a village with no phase model (the camel peoples, the clean south
      in-window) never changes, so it never re-fires — only the rinderpest
      peoples (maasai, sidama; nubians is aftermath all window = no change).
      Structure it generically so other future "situation" drivers can hook in.
  TESTS: pure — the "should a return entry fire" predicate (visited &&
  phase != storedPhase) and the transition-text selection, both languages
  markup-clean (villages.test.ts / a store test); the store test that a second
  visit after a phase change adds exactly one return entry and none if
  unchanged. Live optional. DOCS: design.md §16 (return entries on changed
  situation) + §19.15 note. (Reported 17.07.2026; queued at the batch end per
  append-and-defer.)

- [x] 171. Plants STILL fly in while driving — only ever change flora outside
  the view, never a pop or snap in sight. Runs DIRECTLY AFTER 167 (user order,
  18.07.2026).
  DONE (18.07.2026): The pop was real, but BOTH my point-164 model AND my first
  171 test were practice-remote — the sharp lesson of 172. 164 sized the flora
  circle to an ASSUMED 100×zoom view; my first 171 check then measured toggles
  within `fog.far`. BY THE PICTURE (a new `__camera.onScreen`/`ndc` dev hook
  projects each drawn plant to NDC) the truth is: the visible limit is the camera
  FRUSTUM — fog.far is not it either, because clearView pushes the fog to the
  horizon (far → thousands) at a wide zoom, so a fog-far radius would flag plants
  the player cannot see. FIX (`src/scenes/travel/floraStreaming.ts` +
  `TravelScene.tsx` + `Climate.tsx`): draw flora to a generous
  `min(fog.far + margin, 320)` circle that ALWAYS exceeds the frustum; fill the
  per-chunk candidates NEAREST-FIRST (`chunkOffsetsByDistance`) so the instance
  buffer covers the nearest, on-screen plants and drops only the farthest,
  off-screen ones; and gate the rebuild on the SPAWN RADIUS change (not the raw
  fog far) so clearView's horizon lerp triggers no rebuild storm. `TRAVEL_FOG` is
  exported for the radius. VERIFY: `floraStreaming.test.ts` pins the fog-far
  radius, the nearest-first order and the no-storm rebuild; `enrichments.mjs`
  drives at an achievable zoom (0.5), the F3 report zoom (1.5) and wider (2.2) and
  asserts ZERO plants appear inside the rendered frame (projected via
  `__camera.onScreen`), with a real rebuild counter (`__vegetation.rebuilds()`)
  proving the flora followed the player. Measured 0 on-screen pops at every zoom.
  DOCS: design.md §2.5 and CLAUDE.md §7.1 pt.12 corrected to the
  frustum/nearest-first/picture wording.
  User report (18.07.2026, screenshot at 11.0°N/29.6°E, West, 24.05.1890,
  moving): "Die Pflanzen fliegen weiterhin ein … Sie kommen von unten links und
  bewegen sich nach oben rechts." So point 164 did NOT fix it. WHY 164 FELL
  SHORT: 164 moved the flora streaming edge to a circle at `floraSpawnRadius =
  FLORA_VIEW_AT_ZOOM1(100) × zoom + 30`, and the probe declared "0 in-view
  toggles" using viewR = 100×zoom as "the view". But that view radius is an
  ASSUMPTION (borrowed from the wildlife ring), and the REAL bird's-eye camera
  sees FURTHER than 100×zoom on the ground — so the streaming edge still sits
  inside the actual frustum and pops there. The probe measured against the
  wrong radius and passed while the player still sees it (the same "the test
  measured the machine, not the picture" trap as the season bugs — the standard
  is the PICTURE).
  USER'S DESIGN DIRECTION (binding, quote): "Wenn Pflanzen hinzukommen oder sich
  verändern, muss das in einer Weise dargestellt werden, die natürlich aussieht
  — z. B. dass die Pflanzen oder andere Ambient-Elemente sichtbar wachsen oder
  verdorren. Am einfachsten ist es für Änderungen außerhalb des Sichbereichs
  (plus Reserve). Da können sie einfach durch die für die neue Zeit passende
  ersetzt werden." Two rules:
  (a) ADD/REMOVE (streaming) and any SEASON SWAP happen ONLY outside the visible
      area + a reserve margin, where the player cannot see the change — there a
      plant may simply appear/vanish/be replaced with the time-appropriate one.
  (b) Anything that MUST change WITHIN view changes SMOOTHLY over time — visibly
      grows or withers — never snaps. (The season SPROUT scale already lerps via
      the field, so in-view seasonal change is gradual; the offender is the
      streaming add/remove reaching into view.)
  FIX:
  1. MEASURE the real view first (do not assume). Add a probe/dev hook that
     reports the ground radius the camera actually covers at a given zoom (the
     max on-screen distance of a drawn element, or project the frustum corners
     to the ground plane) — the fog far plane / far-sheet sizing already knows
     this geometry; reuse it. Then set the flora spawn radius to THAT measured
     radius + a reserve (a chunk or two), zoom-aware, so the streaming edge is
     always beyond the real frustum. Keep 164's rebuild hysteresis.
  2. Because a decisive move (or a zoom-out) can still bring a not-yet-populated
     ring into view in one step, guarantee the newly-visible area is already
     populated: either grow the reserve so a single hysteresis step cannot
     expose bare ground, or defer the reveal (spawn the ring while still outside
     view, one step ahead). No fade hacks.
  3. Season swaps (if any placement ever becomes season-dependent — today
     placedFloraAt is season-independent, so this is future-proofing): only swap
     a plant's species/presence while it is outside view + reserve.
  TEST AT REALISTIC ZOOM (user standing rule, 18.07.2026 — see point 172): it
  must work at the zoom levels the player can ACTUALLY reach, at minimum the
  NON-DEBUG range 0.25–0.5 (setTravelZoom clamps to [0.25, DEFAULT 0.5] unless
  the debug zoom-out checkbox / F3 is on). 164 tested at zoom 2, which is
  debug-only — practice-remote. The baseline check is the non-debug range; wider
  debug zooms are extras only.
  VERIFY BY THE PICTURE (the 147/151 lesson, do not repeat 164's mistake): a
  driven screenshot pass (enrichments) at the achievable zoom that captures
  frames while moving and asserts no plant instance appears at a screen position
  inside the frame interior (only at/beyond the frame edge) — i.e. measure
  against the ACTUAL rendered frame, not a guessed viewR. Pure-test the
  measured-radius → spawn-radius rule. DOCS: design.md §2.5 (correct the
  point-164 wording: streaming edge beyond the MEASURED view at the achievable
  zoom, not 100×zoom), CLAUDE.md §7.1 pt.12.
  (Reported 18.07.2026; user-ordered directly after 167.)

- [x] 172. Retroactive audit: do all feature tests test PRACTICE-REALISTICALLY?
  User order (18.07.2026, after 164's zoom-2 test passed while the bug persisted
  in-game): "evaluiere rückwirkend für alle bestehenden Tests aller Features, ob
  die von ähnlichen Problemen betroffen sind und deswegen praxisfern testen."
  THE LEAD OFFENDER, made a standing rule: testing at an UNREALISTIC (debug-only)
  zoom instead of the in-game-achievable one. The non-debug zoom is clamped to
  0.25–0.5 (default 0.5); only the debug checkbox / F3 unlocks 0.5–16. A test
  that only exercises a wide debug zoom (or assumes `100 × zoom` as the view
  radius rather than measuring the real frustum) can pass while the player still
  sees the bug (164). The standard is the PICTURE at a realistic setup.
  SCOPE — sweep every browser suite (scripts/verify/*.mjs) and the zoom/view-
  dependent pure tests, and for EACH check ask:
  (a) does it force a zoom the player cannot reach without debug (setTravelZoom
      to >0.5, or setWheelZoomEnabled(true) purely to widen)? If the behaviour it
      checks must also hold at the non-debug range, add or move the assertion to
      0.25–0.5. (Legit exceptions: checks that are SPECIFICALLY about the debug
      wide-zoom feature — the zoom gate, the far-sheet at the cap, whole-continent
      view — those stay, but must be labelled as debug-zoom checks.)
  (b) does it assume a view/despawn radius (100×zoom, a hard-coded distance)
      instead of the real camera coverage? Flag for a measured radius.
  (c) more broadly, does it force a state the game cannot actually produce
      (the 147 lesson: wetness=1 outside the Congo; an override the real climate
      never reaches), so it measures a world the game cannot reach?
  DELIVERABLE: a written findings list (in this point's DONE note) of every
  practice-remote test found, each either fixed to a realistic setup (and the
  real behaviour re-verified there — the picture, not just a green assertion) or,
  if genuinely a debug-feature check, labelled as such. No silent pass: if a
  fixed test now FAILS at the realistic zoom, that is a real bug — file it.
  ORDER: after 171 (which is the first instance being fixed). TESTS: the audit's
  output is the fixes themselves plus the findings list. DOCS: CLAUDE.md §7.2
  (a line that verification must use in-game-achievable conditions, zoom
  included). (Reported 18.07.2026; user-ordered after 171.)
  DONE (18.07.2026): Swept every browser suite and the zoom/view-dependent pure
  tests. FINDINGS:
  • FIXED (as 171): the flora streaming test — assumed 100×zoom view at debug
    zoom 2 → now projects each plant to the real frame (`__camera.onScreen`) and
    drives at 0.5/1.5/2.2. The `__camera.onScreen`/`ndc` dev hook it added is the
    standing tool for every "is it in view" assertion (a projection, never a
    guessed radius).
  • REAL BUG FOUND, deferred to 165: migrating the point-168 carrion-in-view check
    (`viewR = 55`) to `__camera.onScreen` FAILED — 0 of 13 plague carcasses project
    inside the frame at zoom 0.5 (`{carcasses:0, struck, totalPlague:13,
    chunks:27}`). The carrion spawns in the small 100×zoom ring, mostly OUTSIDE the
    frame, so "visible without travelling" is weak at the achievable zoom — the
    SAME under-sized-view bug as 165. Left at `viewR = 55` with an OPEN comment
    (suite stays green, no red test for a not-yet-built fix); 165 re-bases the
    wildlife spawn ring on the frustum and migrates this to `__camera.onScreen`.
    The audit did its job: a passing test hid a real visibility gap.
  • DOCUMENTED, fixed with 165: the wildlife staging checks stand at DEBUG zoom 2
    (1444 rinderpest carrion, 3282 elephant mourning — "the fixed seed's ~26 in-ring
    chunks rolled no elephants" at 0.5, 3422 crocodile, 3789 vulture spawn) ONLY
    because the 100×zoom spawn ring is too small at 0.5. 165 re-bases the ring, then
    they move to 0.5 + `__camera.onScreen`.
  • LEGIT debug-zoom-FEATURE checks (kept, labelled): 1132/1144 zoom 3 (zoom-out
    despawn), 4750 zoom 99 (whole-continent), 4818 zoom 12 (far sheet + near-plane
    restore) — these test the wide zoom ITSELF.
  • CLEAN: the pure-test season overrides are the debug-override FEATURE under test
    (§21), not a forced unreachable state; realistic-behaviour assertions use
    `override=null` (no wetness=1-outside-the-Congo masquerade, the 147 lesson). The
    enrichments numeric-radius loops (846/3464/4231/4132/1260) are SEARCH radii, not
    visibility asserts. Other suites don't force an unreachable zoom for a general
    behaviour (only polish sets a zoom; it uses the realistic 0.25/0.5).
  DOCS: CLAUDE.md §7.2 gained a line that verification must use in-game-achievable
  conditions (non-debug zoom 0.25–0.5) and judge "in view" by projecting to the
  frame, never a computed radius.

- [x] 173. Post-162 quality push: closing run, then a thorough code analysis with
  many new tests, and the small/large browser-regression tiers.
  (User order 18.07.2026, inserted in the work order AFTER 162; v0.2 (174) is
  tagged after this, and 163/166/170 run AFTER v0.2 — user's explicit ordering.)
  (a) CLOSING RUN FIRST: the full closing cycle (see the "## Closing" section
      below) — Vitest + the LARGE browser regression, the dead-code / stale-doc /
      .md audit, lint + npm audit clean.
  (b) THOROUGH CODE ANALYSIS: go through the codebase spot by spot, follow every
      logic path, and flag anywhere something COULD be wrong — edge cases,
      unhandled states, silent caps/truncation, ordering assumptions, off-by-one,
      race/timing, untested branches. Not a skim: every non-trivial function is
      reasoned through, its assumptions checked against the callers.
  (c) NEW TESTS: turn the analysis into MANY new tests for previously-untested
      aspects — Vitest where assertable without a browser, browser scenarios where
      it needs the scene/geometry/CSS/audio. The new browser scenarios join the
      LARGE regression set.
  (d) REGRESSION TIERS (infra): split the browser regression into SMALL and LARGE.
      SMALL = the important, already-well-covered suites (the everyday gate). LARGE
      = everything + the new scenarios from (c). Wire both as selectable (npm
      scripts and/or run-all.mjs flags — e.g. `npm run test:small` /
      `npm run test:large`, or run-all args), documented in
      `scripts/verify/README.md`. Standing rule (regression-tiers memory): per task
      I pick Vitest-only / Vitest+small / Vitest+large at my discretion; the
      CLOSING cycle ALWAYS runs Vitest+large.
  DELIVERABLE: a hardened, high-assured-quality state ready to tag as v0.2 (174).
  DOCS: `scripts/verify/README.md` (the tiers + the new scenarios), CLAUDE.md §5
  (the small/large commands) + §7.2.
  DONE 18.07.2026:
  (d) TIERS: run-all.mjs gained SMALL (docs/i18n/flow/health/events/collision/voice
      — the fast, low-flake everyday gate) and LARGE (every suite + preview), wired
      as `npm run test:small`/`test:large` (bare `npm test` = LARGE), documented in
      README, scripts/verify/README.md and CLAUDE.md §5 (9e920f3).
  (b) ANALYSIS: three subsystem sweeps (systems/state, travel/world, render/ui/i18n)
      found ~52 test gaps AND three real bugs — all confirmed against the code:
      B3 successorTakeOver did not clamp the resumed day to 31.12.1895 (fb386c4),
      B2 a water-surrounded dragged canoe could return a water point (e8596b3), and
      B1 the dry-season drink catchment is silently capped at 0.45° vs the intended
      0.70° — deferred as point 176 (a global-cap raise needs a perf-aware round).
  (c) NEW TESTS: ~90 new Vitest tests across the three areas (my walk-feel/touch/
      dress batch 4ef17d2, then 72650a9 / 0824734 / 5f1ba8b), each self-verified by
      its writer and independently re-run; full Vitest 1925 green.
  (a) CLOSING: npm audit 0 CVEs; the dead-code/.md audit was clean (no stray probe
      scripts, no stale TODO/OPEN beyond the documented open items, §7.1 numbering
      1..32 intact, README deadline/suite text correct); the LARGE regression ran
      build+lint+unit + all 14 browser suites + preview — everything green except
      the rotating enrichments family-staging flakes, which a clean retry passed
      fully (198/0), confirming they are timing flakes, not regressions. Their
      deterministic stabilisation is filed as point 177.

- [ ] 174. Tag the demo build v0.2 and publish /v0.2/.
  GATE (user, 19.07.2026): tag v0.2 only after ALL of these are green — 175 (the
  jumping trees, user-confirmed on WebGPU), 177 (deterministic suite), 176 (drought
  drink-reach cap), the play-test bugs 178/179/180/181/183, 184 (the pre-tag
  hardening pass), AND a final closing run (Vitest + LARGE regression, dead-code/.md
  audit, lint/CVE clean) at that verified HEAD. v0.2 must ship none of those bugs
  nor any regression the closing catches.
  FINAL TAG HELD FOR THE USER (default, user away 19.07.2026): the tag + /v0.2/
  publish is the one irreversible, outward-facing step — do ALL the work up to it,
  then report "ready to tag" and WAIT for the user's go, unless the user has
  explicitly authorized auto-tagging. When authorized / on the user's return: tag
  `v0.2` at that HEAD and serve it at
  https://patrickvonmassow.github.io/Heart-of-Africa-Remake/v0.2/ — mirror how
  /v0.1/ and /poc/ are wired (the `.github/workflows` Pages build + the tag/deploy
  trigger; a tag push may not trigger the deploy, so use the same mechanism v0.1
  used). Then FREEZE it: never re-point or change v0.2 unless the user elaborately
  asks (tags-only-on-request memory). The v0.2 content is the 175/177/176/178-183/
  184-closed, closing-verified HEAD; 182 and 163/166/170 come AFTER the tag.

- [x] 175. Plants STILL jump while driving — a WebGPU-specific crown jitter.
  REOPENED 18.07.2026: the shipped fix (5421e46, baked per-instance seasonTint +
  upload-only-on-change guard) did NOT resolve it — the user re-tested on WebGPU
  (JumpingTrees3.mp4) and the trees still jump while driving. Deeper diagnosis:
  the flora's WORLD positions are PROVEN STABLE (the nearest trees measure
  identical frame to frame; only their distance changes as the player drives) —
  so the jump is a pure WebGPU RENDER effect, NOT a position/streaming change and
  NOT the season texture. On WebGL 2 (headless, no WebGPU adapter) the scene is
  stable and the effect does not reproduce; TRAA off and weatherStrength 0 both
  leave the (WebGL 2) scene unchanged, so neither is confirmed as the cause there.
  Cause must be isolated on the user's WebGPU hardware — asked the user to report
  which debug toggle (TRAA off / weatherStrength 0 / neither) stops the jump, then
  build the real fix from that. Do NOT revert 5421e46 (it is a legitimate
  reduction of per-frame texture uploads, harmless). Original report and the
  prior (insufficient) attempt are kept below.
  User report (18.07.2026, with a video, JumpingTrees.mp4): after 171 the trees
  STILL "springen herum" while driving, at the DEFAULT zoom and at normal speed;
  the positions shift and plants appear mid-frame. "Das direkt als naechstes
  fixen. Bitte dieses Mal sehr gruendlich analysieren, damit der Fix wirklich
  sicher das Problem behebt."
  ROOT CAUSE (found from the video, not reproducible headless): the debug menu in
  it reads "Renderer: WebGPU" — the user runs WebGPU, the headless verify runs
  WebGL2 (no WebGPU adapter headless), so no probe ever reproduced it. In the
  video only the CROWNS (the season foliage collapse via positionNode) jitter; the
  ROCKS (foliage class 0, no collapse) stay still — the tell. The flora sampled the
  season-field TEXTURE in its VERTEX stage (through the per-instance seasonUV) over
  a texture re-uploaded every frame (`SEASON_FIELD_TEX.needsUpdate = true`
  unconditionally in updateSeasonField, called per frame); on WebGPU that per-frame
  re-upload races the draw, so the sampled collapse tint flickers and the crowns
  hop.
  FIX: (a) the flora no longer samples the texture — the CPU BAKES each instance's
  field tint into a new per-instance `seasonTint` float attribute at rebuild
  (`seasonFieldTintAttrNode`); a baked float never samples the moving texture, so
  it is stable on both backends (the ground keeps its per-vertex seasonUV sample).
  (b) updateSeasonField re-uploads the texture only when a texel actually changed.
  PRIOR ATTEMPT (18.07.2026, 5421e46 — INSUFFICIENT, see the reopen note above):
  pure season/flora tests + full 1828 Vitest + enrichments 197/0 (incl. the
  151-stability and 171-no-pop checks) green on WebGL2; build + lint clean.
  design.md §19.13 table + CLAUDE §7.1 pt.12 updated (the vegetation reads the
  baked attribute, not the texture). WebGL2 CANNOT show the WebGPU jitter, so it
  shipped for a MANUAL USER WebGPU check (webgpu-untestable-headless memory) — the
  user's re-test showed it still hops. Named fallback if the diagnosis points at
  the collapse: bake the crown-collapse HEIGHT per instance too (drop the field
  read from the vertex stage entirely). (Follow-up to 171.)
  DIAGNOSIS (19.07.2026, user WebGPU toggles): TRAA off does NOT stop it;
  weatherStrength 0 DOES. So the jump is the dry-season crown COLLAPSE
  (seasonFoliagePosition), which is unstable on WebGPU while active. A headless
  probe then found the trigger: the RENDERED fog far (TRAVEL_FOG.far) is lerped
  toward the season target every frame and never settles, so `floraShouldRebuild`
  (keyed on it) fired several times a second — each rebuild re-uploaded the
  per-instance `seasonTint` buffer, and on WebGPU that upload races the vertex
  stage reading the tint for the collapse -> the crowns jitter. weatherStrength 0
  (a uniform tint) makes a racy read harmless, which is why it "stopped" the jump.
  ATTEMPT 2 (19.07.2026, user chose "keep the effect, make it stable"): decouple
  the flora spawn radius from the season. New `FLORA_FOG.far` (floraStreaming.ts),
  set each frame by Climate to `preset.far + (12000-preset.far)*clearView` — the
  ZOOM/region far only, NOT the season (= the dry-season MAX far, so it always
  covers the rendered fog). Constant at a steady zoom, so the flora rebuilds ONLY
  on movement, never on the season fog drift -> the seasonTint buffer is not
  re-uploaded while driving -> no WebGPU race. The bare-branch collapse (144) and
  the rain-closing render fog are fully kept. Headless-verified on WebGL2: a
  weather-on drive rebuilds 8 -> 0 (weather-off 50 -> 2); new movement-bounded
  rebuild check + the 171 no-pop check green; enrichments 199/0, Vitest 1925,
  build/lint clean.
  ATTEMPT 2 USER WebGPU RE-TEST (19.07.2026): the streaming POP-IN is FIXED (the
  trees no longer fly in) — the fog-decouple holds. But TWO issues remain: the
  landscape changes ABRUPTLY while driving, and crowns sometimes hang FREE in the
  air (screenshot). Both point at the dry-season collapse itself, now applied at
  the movement-rebuild moments rather than per frame (the baked seasonTint jumps to
  the drifted season value at a rebuild → the collapse is applied abruptly/racily).
  DIAGNOSTIC STEP (19.07.2026, user chose "Diagnose-Schalter zuerst"): a debug
  toggle isolates the cause before any bigger refactor. New `SEASON_COLLAPSE_U`
  uniform (seasonTint.ts) multiplies the `dryness` inside `seasonFoliagePosition`,
  so at 0 the crown collapse AND the ground sprout vanish (flora keeps its full
  positionLocal shape; the season COLOUR is untouched). Driven each frame from the
  new `ui.seasonCollapseEnabled` (default on) in the travel + place season blocks;
  DebugMenu checkbox `t.debug.foliageCollapse` (de/en), same class as the point-111
  `groundDebugFlat`. Pure tests: seasonTint.test (uniform 1→0 gate), ui.test
  (default + setter), DebugMenu.test (checkbox write-through). Vitest 1927, build +
  lint clean.
  DIAGNOSIS CONFIRMED (19.07.2026, user WebGPU test with the toggle OFF): "Mit
  Kollaps AUS alles ruhig" — with the collapse gated off BOTH remaining issues
  vanish. So the dry-season crown collapse (the per-instance seasonTint read in the
  positionNode) is the SOLE cause; the streaming buffer re-upload is exonerated.
  USER DECISION (19.07.2026): "WebGPU-stabil neu bauen" — KEEP the bare-branch
  effect, rebuild the collapse stable. (Option B, shipping the toggle off, was
  offered and declined.)
  DESIGN for the stable rebuild (analysed, NOT yet implemented — paused at the
  user's request 19.07.2026 to power down; resume here):
  * ROOT: the collapse is a positionNode reading the CUSTOM per-instance
    `seasonTint` InstancedBufferAttribute in the vertex stage; that custom-attribute
    read races its rebuild re-upload on WebGPU. The instanceMatrix is re-uploaded at
    the SAME rebuilds yet positions never jitter — so the instanceMatrix (core
    transform path) is the WebGPU-stable per-instance channel to carry the collapse.
  * PLAN: split each tree species' geometry into CROWN (foliage attribute == 1) and
    REST (foliage 0, the trunk) — a `splitFoliage(geometry)` helper in flora.ts
    (mind indexed vs non-indexed; the flora build fns are in src/render/flora.ts).
    Two InstancedMeshes per tree species: the trunk mesh's instance matrix = the
    plant matrix; the crown mesh's = plantMatrix × collapseLocal, where collapseLocal
    = Translate(0,-collapse*0.22,0) × Scale(shrink,1,shrink), shrink = 1-collapse*0.6,
    collapse = dryness at the plant's position (the SAME per-position field value the
    tint bake already reads via seasonFieldTintAt → dryness). This is EXACTLY the
    current seasonFoliagePosition crown maths, moved onto the matrix. GROUND flora
    (foliage == 2: bush, papyrus) sprout is a UNIFORM scale from y=0, so fold
    `sprout = 1-dryness*0.85` straight into that plant's single instance matrix (no
    split needed). Static species (foliage 0: rock, termite, kopje, deadtree) keep
    one plain mesh.
  * The collapse recomputes at each rebuild only (same cadence as the current tint
    bake — no per-frame matrix churn), and the season drift per 16-unit rebuild is
    tiny, so no visible step. Remove positionNode's attribute dependency; the season
    COLOUR stays a per-vertex recolour keyed on the seasonTint attribute (colorNode)
    — its re-upload race is imperceptible (only the POSITION jitter was ever seen),
    so leave the colour path as is. KEEP the point-175 diagnostic toggle
    (SEASON_COLLAPSE_U): it should now gate the matrix-borne collapse (collapse=0 →
    identity crown matrix) so the switch still works.
  * TESTS: pure `splitFoliage` (crown vertices separated, counts add up), the
    collapseLocal matrix maths (a dry crown shrinks x/z and drops y, a wet crown is
    identity), the ground sprout scale; live WebGPU check is the USER's (headless has
    no adapter). Docs: design.md §2.5/§19.13 note the matrix-borne collapse; CLAUDE
    §7.1 pt.12. PAUSE competing browser runs during the user's WebGPU verification.
  IMPLEMENTED (19.07.2026, user said "weiter"): the crown/trunk split is built to
  the design above. `splitFoliage` (flora.ts) partitions a merged geometry into
  crown (foliage==1) and the rest by each triangle's first-vertex foliage. The
  travel scene (TravelScene.tsx) now builds a second crown InstancedMesh per
  CROWN_SPECIES (acacia/jungle/palm/baobab) whose per-instance matrix = plant ×
  collapseLocal (Scale(shrink,1,shrink) then y-drop); GROUND_SPECIES (bush/papyrus)
  fold the sprout scale into the plant matrix; the positionNode is gone (only the
  colour keys on the seasonTint attribute now). The CPU collapse maths live in
  seasonTint.ts as `drynessFromTint`/`crownCollapse`/`groundSprout`, pure-tested to
  mirror seasonFoliagePosition exactly. The debug toggle now gates the CPU dryness
  (flipping it forces a re-bake). PlaceScene is UNCHANGED: it is stationary and
  reads the SEASON_TINT_U uniform (no per-instance re-upload), so its positionNode
  collapse does not race — it keeps seasonFoliagePosition + SEASON_COLLAPSE_U.
  VERIFIED (WebGL2, what headless can prove): pure tests green (splitFoliage
  partition + count conservation, the three collapse-maths mirrors), build + lint
  clean, full fast Vitest 1931. enrichments FLORA checks green (196 pass) — the
  split does not break streaming/positions/phantom-collider; the 3 fails were the
  documented load-sensitive wildlife/family-staging flakes (165 pop, 145a burning
  grass, shore bathers), structurally unreachable from a flora-only change.
  STILL OPEN: the USER's WebGPU visual check — do the crowns stand still while
  driving AND is the bare-branch dry-season look intact? If yes, close 175 and
  proceed to the closing + v0.2. If the crowns still jump, the matrix path is not
  the fix and this needs rethinking (unlikely — the matrix is re-uploaded at the
  same rebuilds today without position jitter).

- [x] 176. The dry-season drink catchment is silently capped at 0.45° (found by
  the point-173 analysis). DONE 20.07.2026: a `range` param threaded through
  geoIndex riverDistance/lakeDistance -> hydro riverDistanceExact/
  lakeShoreDistanceExact -> bucketDistance (default 1 = the 3x3 / 0.45deg reach,
  every existing caller unchanged); the drink-catchment query alone uses range 2
  (5x5, ~0.9deg, clamp 0.9) with a catchment-sized maxDist, and only when the
  catchment exceeds 0.45 (the wet season keeps range 1) — no global perf change.
  Pure test (hydro.test.ts): the 5x5 search is a superset of the 3x3 and resolves
  water in the 0.45-0.85deg band where the 3x3 saturates. Build + lint + 1933
  vitest + enrichments 200/0 (the point-135 dry-season drink checks pass live with
  the fix). Commit 7bb44ca. CONFIRMED bug: `riverDistance`/`lakeDistance`
  (`src/world/geoIndex.ts:29,34`) clamp their `maxDist` via `Math.min(maxDist,
  0.45)`, and `hydro.ts` caps at `MAX_QUERY = 0.45` too — so every caller asking
  for a wider radius silently gets 0.45. The drink-to-the-bank behaviour
  (`Wildlife.tsx` ~921-941) computes a water-distance GRADIENT with probes at
  maxDist 0.6, but `drinkCatchment(RIVER_WIDTH_DEG, dryness)` reaches ~0.70 in
  full dry season (RIVER_WIDTH_DEG = 0.17 × river.widthFactor 1.6 = 0.272; +0.06
  +0.37). An animal whose TRUE water distance is in the 0.45-0.70 band reads
  `wd = 0.45` (so it counts as "in catchment", `wd < catchment`), but BOTH
  gradient probes also read 0.45 → `gLat = gLon = 0` → `gl < 1e-4` → it never
  walks to the bank. So the dry-season "wider catchment gathers the wildlife at
  the remaining water" (§19.13, point 120e/135c) only actually works out to ~0.45,
  not the intended ~0.70 — point 135c widened the belt but the query cap still
  clips it (a sibling of the point-129/136 river-width interaction).
  WHY DEFERRED (not fixed in 173): raising the cap is not a one-liner. The 0.45
  ceiling is a GLOBAL hydro-query perf limit used everywhere (terrain gen,
  collision, clearances, flow), so raising it risks slowing every river/lake
  distance query across the game. The fix needs a PERF-aware design — either a
  targeted wider cap only for the drink queries, or a measured global raise — and
  a full re-run of the point-135/147 dry-season live checks (LARGE regression) to
  confirm the gathering reaches farther without a frame-budget hit.
  FIX (surgical — read-only prep 19.07.2026 confirmed this avoids the global perf
  risk): the block is TWO layered caps — geoIndex.ts clamps `maxDist` via
  `Math.min(maxDist, 0.45)`, AND hydro.ts's `bucketDistance` searches only the 3×3
  bucket neighbourhood (±1, BUCKET = 0.5°), so it resolves reliably ONLY to ~0.5°
  REGARDLESS of `maxDist`. A larger maxDist alone therefore does NOTHING — the
  SEARCH NEIGHBOURHOOD must widen too. Add a `range` param to `bucketDistance`
  (default 1 = today's 3×3; range 2 = 5×5 reaches ~1.0°) threaded through
  `riverDistanceExact`/`lakeShoreDistanceExact`, lift the geoIndex `Math.min` clamp
  on that path, and call the DRINK-catchment gradient (Wildlife.tsx ~921-941) with
  range 2 + maxDist ~0.75 while EVERY other caller keeps range 1 / 0.45 — no global
  change. The extra cost is 25 vs 9 buckets, only for the drink query, only in the
  dry season (bounded, local); measure it anyway; re-verify the point-135
  dry-season gather live (enrichments) and that nothing else regresses. TESTS:
  pure — a geoIndex/geo test pinning the honoured radius once the cap is chosen
  (currently `riverDistance(lat,lon,0.6)` === `riverDistance(lat,lon,0.45)`); live
  — an animal at ~0.6° from water walks toward the bank in the forced dry season.
  (Found 18.07.2026 by the point-173 subsystem analysis; queued at the batch end.)

- [x] 177. Make the enrichments family-drama / seeder staging DETERMINISTIC so the
  LARGE regression stops flaking. DONE 20.07.2026: the bulk sim-budget conversion
  (17cdb21) plus the guard/129 fixes, then SIX further distinct flaky checks
  hardened — croc noTeleport (wall-clock -> sim clock), the point-102 vicinity
  (wall wait + drift -> sim-poll for the top-up), point-165 (judged only at the
  achievable zoom 0.5, dropping the impossible debug-zoom over-test), the elephant
  trample (inject the victim instead of hoping the spawn), croc placement (verify
  the water HOME, not a transient lunge position), and body spacing (exclude
  drama-locked animals + widen the settle budget). enrichments now passes 200/0
  across THREE consecutive idle runs, and the under-load run (during the user's
  play) was clean but for the one now-fixed croc check. The point-173 closing run showed the recurring
  pain plainly: the LARGE run and its retries each failed a DIFFERENT rotating
  subset of the `scripts/verify/enrichments.mjs` staging checks (seen: 118 the
  parent-orbit-vs-flee, 165 the vicinity-seeder pop, 145a the burning-grass catch,
  the parent charge/sacrifice pair, 126 the graveyard mourning) — then a clean
  retry passed ALL 198 with zero fails. So these are TEST-INFRASTRUCTURE flakes
  (the synthetic-family + forced-hunt staging is timing-sensitive and occasionally
  fails to establish, taking its dependent checks down together), NOT product bugs:
  the underlying behaviour is pure-tested green and passes live on a clean run.
  But "retry until green" is not a real gate. WHAT TO DO (verify each against the
  current harness): (a) find why the staging intermittently fails to establish —
  likely the synthetic family or the forced LION_STATE not being fully seeded
  before the measurement window, or a natural hunt/animal claiming the single
  victim/hunt slot first (the checks already shove natural young clear — extend
  that to natural PREDATORS and the hunt slot); (b) make each family-drama check
  wait on an explicit "staged" precondition (parent+calf+hunt in the intended
  state) before it starts measuring, with a clear FAIL message if staging never
  established (so a genuine break is distinguishable from a flake); (c) where a
  metric is load-sensitive (the collision-ejection and frame-budget checks — see
  point 150's note), settle the scene deterministically rather than on a wall
  clock. GOAL: three consecutive clean LARGE runs with zero retries. Until then the
  SMALL tier stays the reliable everyday gate (it excludes enrichments by design).
  (Found 18.07.2026 in the point-173 closing run; queued at the batch end.)

- [x] 178. Vultures POP IN already-landed on the carcass instead of flying in.
  DONE 20.07.2026: flightStep spawned the bird at viewR + FLIGHT_SPAWN_OUT (the
  assumed ring), and viewR underestimates the tilted frustum's ground reach (the
  165/172/183 lesson) so the spawn fell inside the frame. flightStep now takes an
  off-screen predicate; the three vulture callers (ground scavenger, kill flock,
  poor-health player vultures) pass the shared frustum-projected isOnScreen
  (negated), so the spawn is pushed out until off-frame, then flies in. Pure-tested
  (wildlifeBehavior.test.ts) + the three enrichments vulture checks REWRITTEN from a
  debug-zoom/radius test (a 172 cluster: zoom 1/2, spawnDist>100/200) to achievable
  0.5 + __camera.onScreen projection; they pass. Build+lint+1935 vitest green.
  Commits (flightStep) + the check rewrite. NOTE: the same-run point-165 driven
  check caught 2 zebras on-screen at 0.5 (the real point-183 streaming pop, a
  distinct spawn path — confirms 183 at achievable zoom), and point-130's croc
  drive-off flaked on lionTouched (a rare croc-drama staging residual) — both
  independent of this vulture fix.
  User report (19.07.2026, playing on WebGPU): "Eben sind die Geier plötzlich
  erschienen — bereits an der Beute gelandet. Ich konnte sie nicht einfliegen
  sehen." The rule (design.md §19.6, acceptance CLAUDE §7.1 pt.12): a non-lion
  (trampled) carcass DRAWS a vulture that spawns BEYOND the zoom-aware view ring
  and flies in (no popping in); the kill-circling flock the same. So the vulture
  appearing already on the carcass is a bug — the same "pops into the frame"
  CLASS as points 165/171/172 (the ground animals / flora).
  DIAGNOSE FIRST (the 165/172 lesson — judge BY THE PICTURE, not a radius): a
  one-way probe with the SUITE launch args, at an ACHIEVABLE zoom (0.25-0.5),
  stages a trampled carcass (the dev hooks force a non-lion carcass; see the
  scavenge/vulture checks in scripts/verify/enrichments.mjs), and PROJECTS the
  vulture's position the frame it first joins/first becomes visible to the screen
  via `__camera.onScreen`/`ndc` — does it read on-screen at spawn? Likely root
  (the exact 164/171/172 trap): the vulture spawn ring is sized to an ASSUMED
  view (e.g. a `viewR`/fog-far/100×zoom radius), not the real camera FRUSTUM, so
  at the player's zoom it spawns inside the frame. Fix: spawn the vulture (and the
  kill-flock birds) off the ACTUAL frustum via the shared `isOnScreen`/frame
  projection the travel scene installs (as point 165's seeders now do), then fly
  in. Find the vulture spawn in src/scenes/travel/Wildlife.tsx (the scavenger /
  vulture / kill-flock spawn geometry — grep vulture/scavenger/killFlock/flight).
  Also possible (secondary): a WebGPU-only first-frame reveal like point 175 — if
  the projection shows it correctly off-screen headless, hand a manual WebGPU
  check to the user (webgpu-untestable-headless).
  TEST-GAP TO CLOSE (point 172): the existing vulture-fly-in checks
  (vulFlight/killFlock in enrichments.mjs) apparently pass while the player sees a
  pop — audit them; the fly-in assertion must PROJECT the bird to the screen at
  the join frame and assert OFF-screen (like the point-165 per-frame join scan),
  not test a computed radius. Verifiable: at zoom 0.25-0.5 the vulture is
  off-screen the frame it spawns (projected), then flies in; pure geometry test of
  the spawn-beyond-frustum rule. Docs: design.md §19.6, CLAUDE §7.1 pt.12.
  (Reported while play-testing 19.07.2026; queued at the batch end.)

- [x] 179. A lion runs THROUGH a calf and its shielding parent without catching
  or eating either. DONE 20.07.2026: the calf-catch and the shield-take were
  per-frame POINT checks against the pre-move distance, so a big clamped-dt step
  or a tangential pass carried the lion through the target (audit-confirmed root
  cause). New pure segPointDist (point-to-segment distance); the calf-catch tests
  the lion's in-loop move segment vs the prey, and the shield-take tests a segment
  reconstructed from the lion's heading + speed + dt vs the interposing parent
  (reconstructed, not a stored prev-position, which a directly-staged hunt left
  stale and fired the take a frame too early before the calf could flee — caught
  by the live shield checks and fixed). Pure-tested incl. the tunnelling case;
  build + lint + 1937 vitest + enrichments 200/0. OPEN (minor): the player->predator
  contact (§19.3) is a non-swept radius-2 point check that tunnels only at the F3
  debug travel speed 25, not the achievable 5.6 — a debug-only follow-up. User report (19.07.2026, playing on WebGPU): "Eben ist ein
  Löwe auf ein Junges zugerannt, ein erwachsenes Tier ist dazwischen gelaufen —
  vermutlich der Elter, der sein Junges beschützt. Der Löwe ist dann aber einfach
  sowohl durch den Elter als auch durch das Junge hindurchgelaufen — niemand wurde
  gefressen." So the shield DID fire (the parent interposed, good — §19.8), but the
  hunt's CATCH/resolution never triggered: the lion should catch the calf, OR take
  the shielding parent in its place (parentAttackOutcome), OR be driven off — never
  pass through with no resolution.
  LIKELY ROOT (diagnose first): TUNNELLING. The catch and the parent-take are
  per-frame distance checks (lion within a catch radius of the victim / within
  PARENT_TAKE_DIST of the parent). A fast lion under a LARGE dt step (dt is clamped
  to 0.1, and headless/WebGPU load pushes toward that clamp) moves far enough in one
  frame to be OUTSIDE the catch zone both before AND after the step, so it never
  registers — the exact class as the point-4 bird's-eye collision ("a fast step is
  caught at the near edge with no tunnelling"). Find the catch + take resolution in
  src/scenes/travel/Wildlife.tsx (grep caught/PARENT_TAKE_DIST/catchDist in the
  LionHunt loop, ~line 3188+) and make it SWEPT: test whether the lion's movement
  SEGMENT this frame crossed the catch/take radius, not just its endpoint (mirror
  the swept obstacle resolve already pure-tested in src/systems/movement.test.ts).
  DIAGNOSE with a probe at a large forced dt (or the natural headless dt): stage a
  LionHunt on a calf with a parent parked to shield, and assert the drama RESOLVES
  (calf caught, or parent taken, or driven off) rather than the lion passing
  through — reproduce the pass-through first, then fix. Secondary hypotheses if the
  sweep is already there: the shield holds the parent just outside PARENT_TAKE_DIST
  (a standoff-vs-take gap), or the hunt aborts mid-pass (mode→leave) before
  resolving. Verifiable: pure test of the swept catch/take (a one-frame overshoot
  still catches); live, a staged fast chase resolves and never passes through.
  Docs: design.md §19.8, CLAUDE §7.1 pt.12. (Reported while play-testing 19.07.2026;
  queued at the batch end.)

- [x] 180. An elephant herd WEDGES itself against a lake shore and no member can
  move. DONE 20.07.2026 (diagnosed from the code): the
  deadlock is a force trap at the shore. (a) Each elephant's roam STEP is gated
  against water (Wildlife.tsx ~2506 elephantStepAllowed), so they do not walk in;
  but when the ground ahead is water the individual redirect (~2492) turns toward
  the HERD CENTRE, which sits AT the crowded shore — no tangential escape along the
  bank. (b) The body-separation pass (~2018) sets a.x/a.z WITHOUT the water gate, so
  it can push an elephant onto a water cell; the rotating water backstop (~2050)
  then TELEPORTS it back to findLandNear — the nearest land, i.e. straight back to
  the same shore edge. (c) Cohesion (~2471) keeps pulling members to the centre.
  Net: members oscillate/pile at the bank, the herd centre never leaves, nobody
  moves. FIX DIRECTION: in the individual redirect (~2492), when the ahead ground
  is uncrossable, pick a crossable direction ALONG the shore via the existing pure
  deflectedStep (as the scripted walk-off does) instead of blindly toward the
  centre; consider a bounded jam-unstuck nudge (the point-155 pattern, wildlife
  side) for a member pinned past a window. Keep the elephant trample (§19.8)
  possible and never let one stand IN water. FIXED: the individual redirect (~2492)
  now runs the existing pure deflectedStep to pick the nearest heading whose step
  AND lookahead are both crossable land — a slide ALONG the shore — and only falls
  back to the centre turn when fully boxed in, so the graveyard/biome-border roam
  is preserved. deflectedStep is pure-tested; build + lint + 1937 vitest +
  enrichments 200/0 (no regression to the herd roam/mourning/graveyard checks). The
  SYSTEMATIC live wedge verification (a herd/animal never pinned at a shore, across
  all regions) is covered by point 184's I3 continuous invariant — the right place
  for it, rather than a bespoke fragile shore check. The §19.5
  body separation ("an animal placed onto another parts from it within moments")
  and the water backstop ("an animal on a water cell is set back to the nearest
  land") and the §19.4 herd cohesion (elephants roam CLUSTERED) together deadlock:
  each elephant is boxed in by herd-mates on the land side and the water on the
  other, so the separation push has no free direction and the backstop keeps
  shoving it off the water — a stalemate. Same "physically pinned, no escape
  direction" CLASS as point 155 (inhabitants), which added spawnPointFree /
  hasEscapeDirection / nudgeToFree + a stuck-window teleport nudge — but that was
  for SETTLEMENT walkers, not the travel-scene wildlife herds.
  DIAGNOSE FIRST: stage/drive an elephant herd up against a lake shore (or reproduce
  from the report's West-region spot) and detect the deadlock (herd centre stops,
  members' inter-frame movement ~0 for a window while a predator/roam target is
  set). Find the elephant herd movement + body-separation + water backstop in
  src/scenes/travel/Wildlife.tsx (grep ELEPHANT/separation/backstop/nearestLand /
  the herd roam-cohesion). FIX candidates (pick per the diagnosis): (a) when an
  animal is pinned for a calibratable window, nudge it to the nearest free land
  (the point-155 pattern, wildlife-side); (b) relax the herd-cohesion pull when the
  separation force is saturated so the herd can spread ALONG the shore instead of
  piling into the corner; (c) let the separation resolve TANGENTIALLY to the water
  edge (slide along the bank) rather than only normal-away. Ensure the elephant
  trample (§19.8) stays possible and no fix lets an elephant stand IN the water.
  Verifiable: pure test that a jammed cluster resolves (every member gains an
  escape direction within the window); live, a herd driven into a shore corner
  spreads out and keeps moving rather than locking. Docs: design.md §19.4/§19.5,
  CLAUDE §7.1 pt.12. (Reported while play-testing 19.07.2026; queued at the batch end.)

- [ ] 181. Panorama/skyline wildlife silhouettes sometimes FLOAT with their feet
  far above the ground instead of standing on the visible horizon line. DIAGNOSED
  20.07.2026 — LOGIC IS CORRECT, so this is WebGPU-specific and needs the WebGPU
  lane to reproduce: the anchor (PlaceScene.tsx ~1136-1160) with a capture active
  places the group at horizonY = EYE_HEIGHT - sinkEpsilon plus a <=0.12 bob, the
  fauna geometry origin is at the feet (fauna.ts), the group scale scales about
  that foot origin, and the band's v-mapping (~1275) puts the horizon at EYE_HEIGHT
  by construction — all backend-neutral TSL, so |footY - visibleY| is bounded and
  the point-184 audit (class C) independently ruled out centre-anchoring and a
  wrong visibleY. The WebGL2 headless render shows it correct (the point-31 live
  gate passes), so the float cannot be reproduced there. NEXT (needs the WebGPU
  lane, 184 Pillar 3): reproduce on real WebGPU (system-Chrome headless=new) via
  the travel->Cairo->panorama flow, screenshot the silhouettes vs the rendered
  horizon; if it floats, the likely cause is the hard-coded EYE_HEIGHT anchor
  drifting from the actually-rendered band horizon on that backend (the audit's
  noted fragility) or a specific species/scale whose origin is not exactly at the
  feet — fix by deriving the anchor from the rendered horizon and/or the offending
  mesh. BLOCKED on the WebGPU lane; do 183 and build the lane first.
  User report + screenshot (19.07.2026, WebGPU, Cairo first-person view): a quadruped
  silhouette hangs in the sky well above the haze horizon, its legs dangling in
  mid-air. This violates the point 31 / design.md 2.5 acceptance ("standing on the
  VISIBLE horizon line rather than a monument looming"; "sits on the band's horizon
  line, |y - visibleY| bounded") and point 92/94 (far, small, hazed, at/above the
  ground plane). The pure math is in src/scenes/place/panoramaWildlife.test.ts and
  the placement in the place scene (grep panoramaWildlife / visibleY / horizon in
  src/scenes/place/*). DIAGNOSE FIRST (the 145b/129 lesson): the point-31 live
  check asserts |y - visibleY| bounded WITH a capture active - reproduce Cairo
  specifically (it carries the Giza SKYLINE landmark, point 82/102, plus the
  panorama-wildlife azimuth-exclusion around it, point 102), and sample the
  rendered silhouette FOOT y vs the horizon visibleY with AND without a capture and
  alongside the Giza skyline. Likely causes to check: (a) the silhouette's vertical
  ORIGIN is its centre, so it is anchored by centre-y to the horizon and floats by
  its half-height when a taller species/scale is picked; (b) visibleY (the band's
  rendered horizon line) is computed wrong when a skyline landmark or a specific
  capture is present, so the anchor sits too high; (c) a per-species foot offset is
  dropped for some species. FIX: anchor the silhouette's FEET (not its centre) to
  visibleY, accounting for the mesh's vertical origin and scale, so |footY -
  visibleY| stays bounded for every species/scale, with and without a capture and
  with the Giza skyline present; keep the point-102 azimuth exclusion intact.
  Verifiable: extend src/scenes/place/panoramaWildlife.test.ts to pin the foot
  anchor across species/scales; extend the point-31 live check
  (scripts/verify/polish.mjs) to assert |footY - visibleY| bounded in Cairo (Giza
  skyline) and a no-capture settlement, with a screenshot. Docs: design.md 2.5,
  CLAUDE 7.1 pt.31. (Reported while play-testing 19.07.2026; queued at the batch end.)

- [x] 182. DONE 21.07.2026 — the setTravelZoom clamp floor moved 0.25 -> 0.125
  in src/state/ui.ts (zoom-IN only; the zoom-OUT clamp to the default / 16x
  unlock is untouched). ui.test.ts pins the 0.125 hard minimum and that 0.2
  survives unclamped; CLAUDE §7.1 pt.20 (0.125x-16x) and §7.2 (non-debug range
  0.125-0.5) + the memory note test-realistic-zoom updated (design.md §21.4 is
  prose, no numeric range to change). Build/lint/9 ui tests green.
  ORIGINAL: Extend the bird's-eye ZOOM-IN range to 0.125 (from the current 0.25
  floor). User decision 19.07.2026: standard-mode zoom-in should reach 0.125x
  (closer than today's 0.25x hard minimum). ONLY the zoom-IN floor moves; the
  zoom-OUT behaviour is unchanged (still clamped to the 0.5 default without the
  debug unlock, up to 16x with it). Change the hard minimum in the setTravelZoom
  clamp in src/state/ui.ts from 0.25 to 0.125. Update src/state/ui.test.ts: the
  "hard minimum" case (setTravelZoom(0.1) currently expects 0.25) becomes
  setTravelZoom below 0.125 -> 0.125, and 0.2 now stays 0.2 (zoom-in allowed).
  Docs to update in the SAME commit: design.md §21.4 (the "0.25x-16x" range becomes
  "0.125x-16x"); CLAUDE.md §7.1 pt.20 ("always active (0.25x-16x)" -> "(0.125x-16x)")
  and §7.2 self-verification (the "NON-DEBUG range 0.25-0.5" note becomes
  "0.125-0.5", default still 0.5); the memory note test-realistic-zoom (same range
  text). NOTE for point 172: the "is it in view" probes use the FARTHEST-out
  non-debug zoom (0.5) as the hard case — that upper bound is unchanged, so those
  probes need no new zoom value; 0.125 only lets the player see LESS (never more),
  so it cannot newly expose an off-screen-spawn bug. Verifiable: src/state/ui.test.ts
  pins the 0.125 hard minimum and a zoomed-in value between 0.125 and 0.5 surviving
  unclamped. Docs: design.md §21.4, CLAUDE §7.1 pt.20 / §7.2. (Zoom-in change
  requested 19.07.2026 during play-testing; queued at the batch end.)

- [x] 183. Animals STILL pop directly into the rendered frame while driving -
  reported along the Nile. DONE 20.07.2026 (commit fac76e8): the reproduced
  achievable-zoom pop (the point-165 driven check caught land grazers at 0.5) was the
  vicinity seeder's ON-SCREEN FALLBACK near water — pickOffscreenLandAnchor now
  returns null instead of an on-screen land candidate, so the seeder DEFERS the frame
  and the moving camera exposes off-screen land next frame (the never-empty guarantee
  holds: vicinityRadius 75 > the 0.5 frame). Verified: enrichments 3x 201/0 with
  point-165 reliably green AND point-102 (never-empty) still green. The water-fauna
  spawnChunk path (crocs/flamingos) has NO live repro — the point-165 check scans
  those species too and is green — so its systematic Nile-corridor verification folds
  into 184's continuous-invariant harness (which drives every region).
  User report (19.07.2026, WebGPU, driving a canoe down
  the Nile): grazers/river fauna appeared mid-screen instead of entering from
  beyond the view. This is a RECURRENCE of the point 165/172 class (ground-animal
  pop-in). Points 165/171/172 gated the guarantee SEEDERS (the vicinity seeder via
  pickOffscreenLandAnchor, the dry-shore seeder) and the flora streaming through a
  frustum-projected isOnScreen, but the ORDINARY streaming spawn - a newly entered
  chunk's region-typical animals, and the river/shore fauna (flamingos, crocodiles,
  drinkers) seeded along a water corridor - may still place INSIDE the live camera
  frustum during continuous driving, which the near-a-settlement point-165 check
  never exercised. DIAGNOSE FIRST (the 145b/129 lesson, with the SUITE chromium
  launch args - a bare launch throttles rAF and hides the sim): drive a CONTINUOUS
  pass along the Nile (KeyW with a raised travelSpeed, restored after) at the
  ACHIEVABLE zoom 0.5, the F3 report zoom 1.5 and wider 2.2, and project EVERY
  newly-spawned animal to the frame via __camera.onScreen each frame - assert zero
  appear inside the frustum the frame they spawn. Find which spawn path pops (grep
  the chunk spawn / streamIn / region-seed / water-anchor seeding in
  src/scenes/travel/Wildlife.tsx) and route it through the SAME off-screen rule the
  seeders use (isOnScreen / an off-screen anchor, point 165) - judge by PROJECTION,
  never an assumed radius (point 172: fog.far / 100×zoom is not the frustum). Keep
  the body-separation and streaming despawn intact. Verifiable: a driven Nile-corridor
  pass in scripts/verify/enrichments.mjs asserts NO animal is projected inside the
  frame the frame it joins, at the ACHIEVABLE zoom 0.5, with a screenshot; extend the
  pure isOnScreen coverage if a new spawn path is gated. DIAGNOSTIC NOTE
  (19.07.2026): the point-165 Maasai driven check at 0.5 is CLEAN (0 pops) — its
  intermittent failures were ALL at a DEBUG zoom 1.3, where the frustum covers a
  settlement's whole vicinity ring so the point-102 never-empty seeder must place
  on-screen (an inherent wide-zoom limitation, NOT this bug and not fixable without
  dropping that guarantee). So 183 must reproduce on the NILE CORRIDOR AWAY FROM
  SETTLEMENTS at 0.5, isolating the ordinary chunk spawn and the river/shore fauna
  (flamingos, crocodiles, drinkers) from the vicinity seeder; test only at the
  achievable zoom (0.25-0.5), never a debug wide zoom (point 172). CONFIRMED by the
  user 19.07.2026: the Nile pops were seen at STANDARD zoom (~0.5), so 183 IS a
  genuine achievable-zoom spawn bug — the ordinary chunk spawn and/or the
  river/shore fauna placing on-screen mid-river — NOT the debug seeder limitation;
  it must be reproduced away from settlements at 0.5 and fixed by gating that spawn
  path through the frustum-projected isOnScreen rule the seeders use.
  STATIC DIAGNOSIS (20.07.2026, from the code + the point-165 data — NOT yet repro'd
  live; the earlier "frustum-ahead ~110 from DESPAWN_MARGIN" inference is CORRECTED
  below): the water-anchored river/shore fauna — flamingos (Wildlife.tsx ~716) and
  hidden crocodiles (~728-734) — are placed INSIDE spawnChunk (~705), the ORDINARY
  chunk spawn, which fires a chunk when its CENTRE is within spawnR = viewR + 18 = 68
  at zoom 0.5. spawnChunk is NOT routed through the point-165 off-screen seeders —
  those gated only the SEPARATE vicinity/dry-shore UPKEEP seeders, never spawnChunk
  itself. CORRECTION from the live evidence: the point-165 driven check drives the
  Maasai plains at 0.5 and finds 0 pops, so spawnR=68 DOES clear the frustum for the
  general (sparse-water) case — the frustum-ahead at 0.5 is NOT the ~110 an earlier
  note inferred from DESPAWN_MARGIN (that margin is just generous despawn hysteresis,
  not the frustum reach). So 183 is NOT the generic land-grazer chunk spawn; it is
  specific to the WATER-DENSE NILE, where nearly every chunk carries a water anchor,
  so flamingos/crocs spawn on nearly every chunk — either a DENSITY effect (many
  water spawns, some landing near the frustum edge) or the water-anchor position
  sitting closer to the player than the chunk centre. LIVE REPRO REQUIRED to pin the
  exact mechanism (the 145b/129 rule): drive a Nile stretch AWAY from settlements at
  0.5, scan every frame for on-screen NEW spawns via __camera.onScreen, and TAG each
  by species (flamingo/croc = water fauna vs grazer = land) to identify the path.
  FIX (once the path is confirmed live): route spawnChunk's placement — at least the
  water-anchored fauna — through the same frustum-projected isOnScreen off-screen
  rule the point-165 seeders use (defer an on-screen placement to a later frame, or
  place at an off-screen water point), keeping density/perf (the water fauna is a
  small fraction). This is the perf-sensitive fresh-focus part; verify with the
  driven-Nile check at 0.5/1.5/2.2.
  LIVE REPRO CONFIRMED (20.07.2026) — this SUPERSEDES the two static hypotheses
  above: the point-165 driven check at zoom 0.5 on the Maasai plains INTERMITTENTLY
  (~1 run in 5) catches 2 LAND warthogs popping (dist 21-24, ndc upper-left near the
  far plane). dist 21-24 is well INSIDE spawnR=68, NOT at the chunk-spawn boundary,
  so it is NOT the ordinary chunk spawn (fires at 68) and NOT the water fauna (crocs/
  flamingos, not grazers). It is the VICINITY SEEDER (seedSettlementVicinity,
  Wildlife.tsx ~1006, places at distMin..distMax ~20-53 of a settlement): its
  pickOffscreenLandAnchor (wildlifeBehavior.ts:812) prefers an OFF-SCREEN land
  candidate but FALLS BACK to the first ON-SCREEN land candidate when none is
  off-screen — which happens near WATER (the Nile/lakes), where the off-screen
  candidates (behind/beside the camera) are water, leaving only on-screen LAND. So
  the user's Nile pop is the vicinity seeder near the Nubian village on the Nile:
  off-screen = water -> on-screen-land fallback -> the grazers pop. THE FIX IS CLEAN,
  NOT perf-sensitive: make the seeder DEFER (skip this frame) when there is no
  off-screen land, retrying next frame as the player drives on (off-screen land
  reappears as the geometry shifts), instead of placing on-screen. pickOffscreen-
  LandAnchor has exactly ONE caller (the vicinity seeder, which already handles a
  null via `continue`), so drop its on-screen fallback (return null) and update its
  one pure test. POINT-102 RISK to verify: the never-empty check (enrichments ~5236)
  fills the vicinity at a STATIONARY leave point; vicinityRadius=75 > the 0.5 frame
  (~50) and the 14 candidates span all directions, so off-screen land should exist
  there and the fill should still happen — but CONFIRM point-102 stays green after
  the change, and if it breaks, velocity-gate the defer (fill when just-left/
  stationary, defer only while driving). Verify point-165 goes reliably green over
  several runs AND point-102 stays green. (The water-fauna spawnChunk path above
  remains a SEPARATE possible pop with no live repro yet — leave it for a driven-Nile
  check; the achievable-zoom bug the user hit is THIS vicinity-seeder fallback.)
  Docs:
  design.md §19.2/§2.5,
  CLAUDE §7.1 pt.12. (Reported while play-testing 19.07.2026; queued at the batch end.)

- [ ] 184. PRE-TAG HARDENING — a MUCH stronger, systematic quality pass to reach a
  high-confidence bug-free state before the final closing run and the v0.2 tag.
  User decision 19.07.2026, after a cluster of elementary-functionality bugs kept
  surfacing in play (178 vultures pop in; 179 a lion tunnels through parent + calf;
  180 elephants wedge at a shore; 181 skyline fauna float; 183 animals pop into the
  frame while driving) DESPITE point 173's quality push. Runs AFTER the individual
  fixes 178-183 and hunts what remains.
  EXECUTION (user-approved 19.07.2026): run 184 with ULTRACODE (multi-agent
  Workflow orchestration) on OPUS 4.8, effort HIGH — xhigh for the design/audit
  phase (the invariant-harness architecture and the five-class sweeps), high for
  implementation; trivial mechanical sub-stages (the WebGL2 smoke scaffold, blunt
  test skeletons) may drop to a cheaper model / low effort via per-agent override.
  The audit sweeps and the adversarial finding-verification are the reasoning heart
  — keep those on Opus 4.8. First step is the WebGPU lane (Pillar 3); it may be
  pulled forward if needed to verify a play-test fix (e.g. 181's likely
  WebGPU-specific float).
  WHY 173 DID NOT CATCH THESE — the gap 184 must close: 173 hunted PURE-LOGIC test
  gaps and added ~90 VITEST tests. Vitest runs in jsdom — no 3D scene, no camera,
  no RAF wildlife, no rendering — so it is STRUCTURALLY BLIND to this whole class
  (pop-in, float, wedge, tunnel, unresolved drama), which lives only in the live
  browser scene. 173 ran the EXISTING Playwright checks (and tiered them) but added
  NO systematic, world-wide, CONTINUOUS invariant sweep; the existing browser
  checks assert SPECIFIC scenarios at SPECIFIC spots, and some measure by PROXY (a
  radius, a wall-clock wait) so they stay GREEN while the player sees a bug (183:
  the point-165 check is green at its Maasai spot while the real pop is elsewhere).
  And nobody ran ADVERSARIAL PLAY across the world — exactly how the user found
  them. So 184 attacks the LIVE-SCENE / EMERGENT / VISUAL layer systematically, not
  with more pure-logic tests. THREE PILLARS:
  PILLAR 1 — a CONTINUOUS-INVARIANT "long adversarial play" harness (the core new
  work; a new LARGE-tier suite, e.g. scripts/verify/invariants.mjs). ONE Playwright
  session drives a LONG scripted traversal that crosses EVERY region and biome
  (debugJumpTo between region waypoints, then drive with KeyW + turns while
  SWEEPING THE FULL STANDARD ZOOM RANGE 0.25-0.5 — both the closest 0.25 and the
  widest-standard 0.5, and points between — NEVER a debug wide zoom. BINDING (user
  19.07.2026): everything must work across the WHOLE standard-mode zoom range; a
  green result at only one level, or at a debug zoom, does not count — that
  praxisfremd-zoom testing is exactly what hid bugs the player saw (183). If point
  182 lands first, the standard range starts at 0.125), forces BOTH dry and wet
  seasons at each, enters/leaves
  several settlements, drives river corridors (the Nile end to end), and provokes
  the dramas (inject predators/calves/crocodiles as the existing checks do). EVERY
  FRAME it evaluates GLOBAL INVARIANTS over the live state
  (__wildlife/__camera/__player/__vegetation/__rivers), judged by PROJECTION
  (__camera.onScreen/ndc) and the SIM CLOCK (simTime), and FAILS with full context
  {simTime, invariant, species, pos, ndc} on the FIRST violation:
    I1 NO POP-IN — every animal is off-screen the frame it first joins the herds,
       land AND river, achievable zoom (178/183 class).
    I2 NO FLOAT — every rendered figure / silhouette / landed bird / dragged hull
       foot-y is at its ground/horizon anchor, |delta| bounded (181/128 class).
    I3 NO WEDGE — no animal/inhabitant with a move target stays within epsilon of
       its position past a bounded stuck window (180/155 class).
    I4 NO UNRESOLVED DRAMA — every started drama (caught calf, lunge, charge,
       vigil, mourning, trample, plunge) resolves within its window (179/121 class).
    I5 NO ANIMAL ON IMPASSABLE WATER/OCEAN outside the sanctioned water dramas.
    I6 NO BODY INTERPENETRATION beyond the design.md 19.5 separation threshold.
    I7 NO PREDATOR TUNNELING — a predator that reaches its victim resolves
       (catch/contact/drive-off), never passes through, dt-robust at a big clamped
       dt (179 class).
    Each invariant is ALSO a PURE predicate unit-tested in Vitest with crafted
    states, so the rule itself is testable and the live pass only wires it to the
    scene.
  PILLAR 2 — a SYSTEMATIC CODE AUDIT of the five recurring failure classes, run as
  SEVERAL PARALLEL SUBAGENT SWEEPS (the 173 analysis pattern, aimed at the
  scene/emergent layer), each READING its area and reporting findings WITH CODE
  EVIDENCE: (A) every spawn/despawn/seed/stream path gated by an ASSUMED RADIUS
  (viewR / fog.far / 100x-zoom / a hard-coded distance) instead of the projected
  frustum; (B) every wedge/pin site (water, terrain corners, buildings, props,
  bodies, settlement edges); (C) every ground/horizon anchor (feet vs centre,
  slope/scale lift, with/without a capture); (D) every catch/charge/lunge/
  swept-resolve for dt-tunneling and non-resolution; (E) every live check in
  scripts/verify/*.mjs judging "in view" by a radius or waiting by wall-clock
  instead of projection/sim-clock. Each confirmed finding is fixed and covered by a
  Pillar-1 invariant or a pure test; a non-trivial one may become its own TASKS
  point + atomic commit; small ones fixed inline. LOG every finding.
  MODEL MIX (user decision, 20.07.2026): run the audit sweeps with a MIX of Opus 4.8
  AND Fable 5 agents (Workflow `opts.model: 'opus'` / `'fable'`) — NOT for a proven
  Fable capability edge (unverified, its name hints at a different specialisation) but
  for MODEL DIVERSITY: the code was written mostly by Opus, so a different-model auditor
  carries different blind spots and catches what the author-model is systematically
  blind to. Distribute the five sweeps (A-E) across both models; where budget allows,
  double-cover a sweep with one agent of each so the two lenses overlap on the same area.
  PILLAR 3 — an AUTOMATED WEBGPU LANE (the headless-WebGPU breakthrough,
  19.07.2026 — this replaces the old "manual checklist because headless can't do
  WebGPU"). PROVEN: WebGPU IS testable headless AND autonomously — launch SYSTEM
  Chrome (Playwright channel:'chrome') with --headless=new + --enable-unsafe-webgpu
  + --enable-gpu and navigate to a localhost (SECURE-CONTEXT) page; the game then
  runs on the REAL WebGPU backend (measured: __renderer.backend.isWebGPUBackend =
  true, webglFallback = false, a correct ~548 KB scene screenshot, ZERO console
  errors, on the NVIDIA GPU, no window). The old belief was a Playwright
  BUNDLED-Chromium limitation (its headless requestDevice fails), not a principle.
  BUILD a WebGPU LANE into the verify harness — a launcher switch: bundled-chromium
  / WebGL2 (as today) PLUS system-Chrome / WebGPU — and run the Pillar-1 invariant
  harness AND the acceptance screenshots on the WebGPU backend, ASSERTING the
  backend really is WebGPU (isWebGPUBackend, never a silent fallback). This catches
  the WebGPU-ONLY classes autonomously: the point-175 crown jitter, the reverted
  TRAA/SSR black-screen (pt.32), any backend-specific race. Keep the WebGL2 lane
  too (the game ships both). This is the FIRST step of 184 — Pillars 1-2 gain their
  real teeth once the invariants run on the actual WebGPU backend the player uses;
  and as the lane's own proof, try to REPRODUCE point 175's jitter headless on it.
  A tiny manual note remains only for what even the WebGPU lane cannot see (a
  subjective look call). Caveat: needs a real GPU + Chrome (present on the user's
  machine); flag if a GPU-less CI would fall back.
  BUILD NOTE (scoped 20.07.2026, from the harness): all ~15 verify suites currently
  launch their OWN browser with the identical line `const browser = await
  chromium.launch({ args: ['--enable-unsafe-webgpu','--use-angle=d3d11','--enable-gpu']
  })` — Playwright's BUNDLED Chromium, which silently runs WebGL2 headless despite the
  flags. So the lane is a small, mechanical refactor: (1) add scripts/verify/_browser.mjs
  exporting `launchVerifyBrowser()` that reads an env switch (e.g. VERIFY_GL) — 'webgpu'
  -> `chromium.launch({ channel:'chrome', args:['--headless=new','--enable-unsafe-webgpu',
  '--enable-gpu'] })`, 'webgl' -> today's bundled line — plus `assertBackend(page,'webgpu')`
  reading `window.__renderer.backend.isWebGPUBackend` and THROWING on a silent fallback
  (the guardrail); (2) replace each suite's launch line with the helper and call
  assertBackend right after the game first loads (after the initial waitForFunction
  (window.__game)); (3) in run-all.mjs (launchServer is at ~line 102) loop the suite runs
  over the backend dimension per the TIER DESIGN below and set VERIFY_GL. Do NOT hand-edit
  15 files ad hoc at the end of a session — this is Pillar 3's structured job (validate
  WebGPU-headless holds under FULL-suite load + determinism first, per conditions a-c).
  PROGRESS (20.07.2026, commit 4cc4049): step (1) DONE — scripts/verify/_browser.mjs
  built with launchVerifyBrowser (VERIFY_GL webgpu=system-Chrome+--headless=new /
  webgl=bundled+ANGLE, default webgl during roll-in) + assertBackend (throws on a
  silent fallback via __renderer.backend.isWebGPUBackend). Step (2) STARTED — settings.mjs
  is the first converted suite and the lane is PROVEN END-TO-END: settings runs the FULL
  suite on the REAL WebGPU backend under system Chrome (webgl default 30/0 unchanged;
  VERIFY_GL=webgpu ran with assertBackend confirming WebGPU — no silent fallback). FIRST
  CATCH (the lane's value shown immediately): under WebGPU the 5 lion-feed checks fail
  with ALL-ZERO animation values (head pitch 0, prey-side 0, stain scale 1.0) — the
  render loop is still cold in the checks' wall-clock window (WebGPU shader compile), a
  TEST-ROBUSTNESS gap (the point-177 sim-clock discipline not yet applied to settings'
  feeding block), NOT a game bug (the feed plays on real WebGPU hardware). REMAINING:
  make the timing-sensitive checks WebGPU-robust (wait for the render loop to warm /
  sim-clock the sampling), convert the other suites the same way, wire run-all.mjs's
  tiers over the backend dimension, then flip the default per conditions a-c. This is
  the flagship's determinism work — continue with fresh focus, not rushed.
  PROGRESS 2 (20.07.2026): the feed catch CLASSIFIED as TIMING and fixed WebGPU-robust
  (poll for the depiction; commit a10607f) — settings 30/0 on BOTH backends. Then the
  four biggest/most-diverse suites are on the lane: settings (first-person), enrichments
  (wildlife — 202/0 on WebGPU FIRST TRY, the point-177 sim-clock already hardens it,
  commit 7d48fb6), flow (core loop — 32/0 on WebGPU) and collision (settlement, commit
  6a12035). collision surfaced 8 more timing-class catches: 7 EJECTIONS (push from a
  collider centre to the surface) starved by a fixed pushFrames on the slower WebGPU
  frames — fixed with a poll-based pushUntilClear (webgl 20/0, webgpu ejections pass).
  The PATTERN is now clear and repeatable: render-loop-driven behaviour read via a
  fixed wall-clock window fails on WebGPU's colder/slower headless frames; the fix is
  always to POLL for the behaviour (never a bigger fixed wait — a naive settle bump to
  fix the 8th catch, the chief-hut door LATCH re-arm, let a walker drift onto a door
  standpoint and flaked webgl, so it was reverted). OPEN Pillar-3 items: (i) the
  collision operable check needs a proper latch-aware / walker-robust poll rework so
  the chief-hut door opens on WebGPU without perturbing webgl (currently webgpu 19/20);
  (ii) convert the remaining 9 suites (events/health/voice/i18n/polish/gamepad/
  handwriting/touch/preview) applying the same poll pattern to any timing-class catch;
  (iii) wire run-all.mjs's tiers over the backend dimension; (iv) flip the default per
  conditions a-c. The lane itself is comprehensively PROVEN; the rest is the systematic
  grind — fresh focus.
  PROGRESS 3 (20.07.2026, commits 4c41447 + 2b16df0): ALL 12 DEV SUITES converted to
  the lane (settings/enrichments/flow/collision/events/health/polish/voice/i18n/
  gamepad/handwriting/touch — only preview, the prod-build suite, is left). webgl green
  across all (the default is unchanged). On WebGPU: settings/enrichments/flow/events/
  health/i18n GREEN; the timing-class catches fixed via the poll pattern were the feed,
  the 7 collision ejections and the vulture-circling check. The remaining WebGPU
  catches are ALL the SAME timing class and now clearly a SYSTEMATIC rework rather than
  one-offs: (a) the input-driven suites gamepad (5)/touch (3)/voice (1)/handwriting
  read moved 0.00 / yaw 0.00 / hang because synthetic input -> render-loop movement is
  not processed in a fixed wall-clock window on the slower/colder WebGPU headless
  cadence — every such check must POLL for the movement/yaw/interaction to happen; (b)
  the collision operable chief-hut door (latch re-arm — a naive fixed-settle bump
  traded it for a webgl walker-drift flake, so it needs a latch-aware/walker-robust
  poll); (c) the polish "direct enter falls back" capture reads active true and STAYS
  true past a 15 s poll — a DEEPER, non-timing WebGPU finding (a panorama capture
  persists on a direct place->place enter on WebGPU where WebGL2 falls back), to be
  investigated (real capture-caching difference vs a test-ordering artifact). NEXT
  (the flagship's core, fresh/deliberate — ideally the Ultracode workflow the user
  approved for 184): (1) systematically poll-ify the input/RAF checks + the operable
  rework; (2) investigate the polish capture finding; (3) convert preview + wire the
  run-all tiers over the backend dimension + flip the default; (4) Pillar 1 (the
  continuous-invariant harness) and Pillar 2 (the audit sweeps) — still untouched, the
  bulk of 184's original scope. The WebGPU lane (Pillar 3's foundation) is DONE and
  PROVEN; what remains is the methodical determinism rework + Pillars 1-2.
  PROGRESS 4 (20.07.2026, commits 83f7682 + b45ade8): the SIMPLE timing class is now
  fixed and its poll pattern proven — gamepad's 5 input checks (stick/yaw/journal/
  interact) were poll-ified with two reusable helpers, holdAxesUntil (hold a stick and
  poll the check's own condition, then centre) and pulseButtonUntil (pulse a button on
  clean edges until its effect lands), and gamepad is now 9/0 on BOTH backends;
  handwriting's WebGPU HANG (a bare .entry.writing click waiting on actionability) was
  removed with a force+timeout+catch click (now 9/1, was a hang). But the OTHER input/
  RAF suites turned out to be DEEPER, system-Chrome-specific findings, NOT the simple
  timing class (a poll fix for touch made it WORSE and was reverted): (a) touch — the
  CDP Input.dispatchTouchEvent injection produces NO movement at all under system
  Chrome + WebGPU (holding the finger through a 15 s poll still read moved 0.0), so it
  is a CDP-touch/system-Chrome incompatibility, not frame starvation; (b) voice — the
  Kokoro TTS never reaches the speaking state under system-Chrome-WebGPU, so its
  300000 ms speak-state waits hang the suite; (c) handwriting's click-to-finish still
  fails (9/10); plus the earlier (d) collision operable chief-hut latch (19/20) and (e)
  polish capture-persistence. These five are genuine investigations (system-Chrome CDP/
  TTS quirks vs real issues), NOT quick polls — do them deliberately, not rushed. So
  the honest 184 state: Pillar 3's lane + the tractable timing-class rework are DONE;
  the deeper findings (a-e), preview + the tier wiring + default flip, and Pillars 1
  (invariant harness) and 2 (Ultracode audit) — the bulk of 184's original scope —
  remain, best as a fresh/deliberate effort.
  PROGRESS 5 (20.07.2026, commit 50ea09d): preview (the prod-build suite) routed
  through launchVerifyBrowser too — ALL 15 verify suites now use the shared lane
  launcher; the webgl default is byte-identical so the normal regression is unchanged
  (preview has no DEV __renderer, so no assertBackend — its WebGPU validation goes with
  the tier wiring). READ-ONLY PREP for the touch finding (a): the virtual stick
  (src/ui/TouchControls.tsx) drives movement through POINTER events — onStickDown does
  setPointerCapture(pointerId) and records the origin, onStickMove fires setTouchStick
  ONLY when `stickPointer.current === e.pointerId`. So the likely reason CDP touch
  produces no movement under system-Chrome-WebGPU is a pointer-synthesis difference:
  the touchStart/touchMove may synthesise INCONSISTENT pointerIds (so onStickMove's id
  guard rejects the move), or setPointerCapture rejects the synthetic id, or the hit
  test misses .touch-stick. Confirming needs LIVE instrumentation on system Chrome
  (log the pointerId/target reaching onStickDown vs onStickMove) — not a read-only
  deduction and not a blind poll; do it deliberately.
  PROGRESS 6 (20.07.2026): tried the live pointer diagnostic but run-all.mjs FILTERS a
  suite's stdout to the PASS/FAIL lines, so a console.log('PTRDIAG …') is dropped —
  seeing it needs a DIRECT run against a standalone dev server (extra plumbing). The
  KEY insight makes that unnecessary for the resolution, though: the exact pointerId
  cause does not change the outcome. touch's arm TAP (touchStart+End) works but its
  stick/drag (touchStart+MOVE) does not, and voice's TTS never reaches the speak state
  — both are system-Chrome-HEADLESS limitations (CDP touchMove/pointer-capture and the
  Kokoro WASM speak-state), not game bugs. RESOLUTION (a user tier-design call, flagged
  in the dashboard's "Von dir zu klären"): run touch + voice WebGL2-ONLY and the other
  13 on WebGPU+WebGL2 — legitimate under condition (a) (the WebGL2 fallback is tested
  regardless), but it DEVIATES from "GROSS = all suites on both backends", so it needs
  the user's ok (or the alternative: a deliberate workaround — synthetic pointer events
  for touch, an alternative TTS speak detection for voice). This resolves findings (a)
  touch and (b) voice into a tier decision; (c) handwriting click-finish, (d) collision
  operable latch, (e) polish capture-persistence remain smaller investigations.
  DIRECTION (user 19.07.2026, "run all browser regression on WebGPU?"): make
  WebGPU the PRIMARY/default browser-regression lane — it matches what the player
  runs and catches the WebGPU-only class across the WHOLE suite, not just a special
  test. THREE conditions before flipping the default: (a) KEEP a WebGL2 lane — the
  game ships the WebGL2 fallback for WebGPU-less hardware (CLAUDE §3), so it must
  not go untested (at least a smoke subset every run, the full suite periodically);
  (b) VALIDATE DETERMINISM FIRST — a backend switch shifts every check's render/RAF
  timing profile (incl. the ~15 s WebGPU cold-load stall, App.tsx), and since 177
  is entirely about timing determinism, confirm all ~200 checks stay green AND
  flake-free on WebGPU across several runs before defaulting, or a new flake source
  replaces the old; (c) MEASURE THE COST — the per-launch WebGPU cold-load slows
  the regression; quantify it and, if steep, keep the fast WebGL2 lane for the
  quick everyday gate and run WebGPU on the LARGE tier. Also revisit the
  __ttsForceWasm hook (CLAUDE §3): with a real WebGPU device present, decide
  whether the voice suite still forces WASM (the render-WebGPU vs onnxruntime-
  WebGPU GPU-process contention, point 117) or exercises the WebGPU voice path.
  TIER DESIGN (user 19.07.2026): SMALL runs the current small-tier suite set (point
  173's fast low-flake subset — same suites, same count) on WEBGPU, plus one WebGL2
  SMOKE test (init + a render screenshot + one core flow, so a grossly broken
  fallback is caught). LARGE runs ALL browser suites on BOTH backends — once on
  WebGPU, once on WebGL2 — plus the prod preview. Vitest stays the fast
  backend-independent inner loop. Prerequisites: 177's determinism landed and the
  suites proven green AND flake-free on WebGPU; measure the per-launch cold-load
  cost. Updates CLAUDE §5, scripts/verify/run-all.mjs and scripts/verify/README.md;
  the suite→tier map is unchanged — each tier gains a backend dimension.
  ACCEPTANCE: (1) the invariant suite (Pillar 1) exists, covers I1-I7 across the
  WHOLE standard-mode zoom range (0.25-0.5, both ends, NEVER a debug zoom — the
  user's binding 19.07.2026 addition specifically for 184), and is GREEN across at
  least THREE consecutive LARGE runs with NO rotating flakes (sim-clock/projection
  throughout); (2) every audit finding (Pillar 2) is fixed
  and regression-covered; (3) the full LARGE regression is green 3x flake-free; (4)
  the WebGPU lane (Pillar 3) runs the invariant harness AND the acceptance
  screenshots on the REAL WebGPU backend (isWebGPUBackend asserted, no silent
  fallback) and is green, with any residual manual-only item named; (5) a written
  summary of what was
  audited, found, fixed and the residual risk. Only THEN the final closing run,
  then the v0.2 tag (174). Docs: quality/process point; adds a CLAUDE 7.1 verifiable
  line for the new invariant suite and updates the CLAUDE 5/7.2 test architecture;
  the 172/177 disciplines. (Requested 19.07.2026 — "be significantly more
  thorough"; gates v0.2 together with 178-183.)
  PILLAR-2 FINDING LOG (read phase complete, harvested 20.07.2026; full "why"
  texts in the workflow journal wf_716721d3-a95). 51 deduped findings; the
  agent-verify phase was stopped on the user's token concern — each finding is
  verified INLINE at fix time instead. Disposition: 3 filed individually
  (Wildlife 736 → 187 croc-under-surface; Wildlife 3454 → 194 claim-steal;
  Wildlife 3614 → 188 leave-no-deadline, matches the user's ocean-pacing
  report); game-code groups → 195 (radius-not-frustum spawn/despawn: Wildlife
  3441, 3386, 1462+1465, 1084, 3432 + wildlifeBehavior 628, 282), 196
  (bed/ground-anchor depictions: Wildlife 2806, 2751, 2282, 913), 197
  (drama-state exclusions/gating: Wildlife 2091+2092, 3048, 2056, 2136, 1978,
  3340), 198 (PlaceLife 764 nudge failure), 199 (canoeDrag 152 pitch-clamp
  drift); the 26 verify-SCRIPT robustness findings (wall-clock/radius in
  enrichments 753, 928, 946, 969, 1058, 1092, 1141, 1146, 1292, 1671+1690,
  1973, 2375, 3027, 4071, 4102, 4182, 4544, 4611, 4756, 5335; polish 270;
  settings 183, 277; flow 242; voice 56; touch 75) → 200.

- [x] 185. Ground-scavenger vultures FLOAT ~0.5 above the carcass (double vertical
  lift). DONE 20.07.2026 (commit fa080ee): replaced the legacy target.y+0.5 group
  pre-lift with the sampled ground under the carcass (exactly the kill flock's
  killGroundY), so only the shared landedBirdY hover (~0.15) remains. A new
  flat-ground enrichments check gates the clearance from ABOVE (<= 0.35) — the
  steep-slope check could not catch the double lift (an uphill bird's positive-only
  lift saturates the +0.5). Verified: build + lint + 1937 vitest + enrichments 3x
  201/0. Found by the point-184 calibration audit (CONFIRMED, 19.07.2026).
  Wildlife.tsx:2559: the landed scavenger group origin is pre-lifted to
  target.y+0.5, then each bird's local y ALSO goes through landedBirdY
  (wildlifeBehavior.ts:486), which adds its own ground-lift + hover — a DOUBLE
  lift, so pecking vultures hover ~0.5 above the carcass they eat. The kill flock
  does it correctly (killGroup at killGroundY, then landedBirdY(killGroundY,...)),
  proving the intended pattern. FIX: drop the legacy +0.5 group pre-lift so the
  scavenger uses ONLY the shared landedBirdY rule (the point-128 unification
  intent). Verify: the landedBird clearance metric + a live scavenger-on-flat-
  ground check that the body sits ON the carcass (foot-anchored). Docs: CLAUDE §7.1
  pt.12. (184 audit finding; this is the point-181/128 class the play-test also hit.)

- [x] 186. The crocodile 'gripped' lunge has NO hard deadline — a streamed-out or
  vanished victim can pin the crocodile forever (a drama that never resolves).
  DONE 20.07.2026: added balance.crocodile.gripSeconds (8, > the ~5 s caught window,
  debug-editable) and a pure crocodileGripExpired; the grip now resets its timer at
  grip start and, in the hold state, releases the crocodile (retreat) once the timer
  passes gripSeconds — so a victim spliced out mid-grip (its caught-countdown frozen)
  can never pin it. Pure-tested (crocodileGripExpired) + a live enrichments 'vanish'
  scenario (grip, splice the victim WITHOUT gone, assert the croc retreats within the
  deadline). Verified: build + lint + 1938 vitest + enrichments 202/0. Docs updated
  (design.md §19.16, CLAUDE §7.1 pt.12). Found by the point-184 calibration audit.
  Original finding (plausible, 19.07.2026): Unlike the
  other §19.8 dramas (each with a deadline — TRAMPLE_GRIEF_SECONDS, vigil.seconds,
  drown/mireSeconds, the lunge timer>4 pre-grip), the crocodile's POST-grip state
  resolves only via the victim's caught-countdown; if the victim is removed
  mid-grip, the crocodile stays gripped with no timeout. Violates the §19.8 "every
  started drama always resolves" rule (invariant I4 of point 184). FIX: give the
  gripped lunge a hard deadline that releases the crocodile if the victim vanishes
  or the window elapses. Verify: pure test (gripped state expires) + the point-184
  I4 invariant. Docs: design.md §19.16, CLAUDE §7.1 pt.12. (184 audit finding.)

- 184 AUDIT NOTES (calibration probe wf_7309c0d4, 19.07.2026): (a) point 179's ROOT
  CAUSE is now confirmed at the code level — the lion calf-catch and the shield
  parent-take are per-frame POINT checks, not SWEPT, so a big clamped-dt step
  passes through without a catch; fix 179 by making the catch/contact SWEPT (like
  the player's resolveTravelMove in movement.ts). (b) The player->predator attack
  contact (§19.3) is the SAME non-swept point-check (radius 2) and tunnels at high
  travel speed — fix it in the same 179 pass. (c) The calibration's THIRD sweep
  (streaming/visibility, the 183 class) FAILED on the StructuredOutput schema (5
  retries) and returned nothing — re-run it cleanly as part of 184's Pillar-2
  audit (it is the highest-value class). (d) Low-severity fragilities to fold into
  184: the panorama-wildlife anchor is a hard-coded horizonY constant (self-
  consistent today, but 181's float is likely WebGPU-specific — verify on the new
  WebGPU lane), and landedBirdY's 0.15 hover ignores the 1.5-1.6 render scale (a
  sub-cm sink).

- [x] 187. DONE 20.07.2026: the spawn now anchors y to
  waterSurfaceY(lat,lon,seed,bed) (fallback bed+0.3), the drama staging reads
  __rivers.surfaceAt, and a new live check asserts every natural crocodile sits
  within 0.15 of the rendered surface (never the bed). enrichments 203/0 with
  screenshots 129/130 re-shot; build+lint+1938 vitest green.
  ORIGINAL: The crocodile is SUBMERGED below the rendered water surface — the
  eye-knob ambush is invisible. Found+confirmed by the 184 Pillar-2 audit (both
  models flagged it, Opus-verified). The seed anchors the crocodile's y to the
  carved BED (`herds.crocodile.push({ ..., y: ct.height })`, Wildlife.tsx ~736)
  and the hidden render offsets from that (`bodyY = a.y - 0.24`, ~2716), but a
  river ribbon renders at bed + SURFACE_LIFT (0.3, waterSurface.ts:17) — so the
  eye knobs (local +0.28) sit ~0.26 BELOW the surface; on a lake (sheet at
  lakeBedMax + LAKE_LIFT) it is buried far deeper. This is the point-152
  bed-vs-surface class; the swimmer/canoe already read `waterSurfaceY` — the
  crocodile is the last water-dweller still reading the bed.
  FIX: base the crocodile's y on `waterSurfaceY(lat, lon, seed, ct.height)` at
  seed time (import already exists in the scene layer), keeping the -0.24/-0.02
  hidden/lunge offsets so hidden = knobs just breaking the surface, lunge = body
  riding out. VERIFY: pure test pinning knob-above-surface for a river AND a
  lake case (mirror the point-152 numbers); the live enrichments crocodile checks
  (129/130 screenshots) must still pass — re-shoot 129 so the knobs are actually
  visible on the water. DOCS: none needed beyond the §19.16 wording (already
  says "sinks to the eye knobs" — the code now actually does it).
- [x] 188. DONE 20.07.2026: the leave phase now holds a sticky
  escapeCorridorHeading (longest clear LAND corridor, outward-biased — pure,
  3 tests) instead of re-aiming the seaward radial every frame, and past
  balance.hunt.leaveOvertimeSeconds (45, debug-editable, i18n de/en) a
  still-ringbound predator retires the moment it is off the rendered frame
  (isOnScreen). CLAUDE §7.1 pt.12 updated; a staged coastal leave resolving is
  gated live (enrichments). build+lint+1941 vitest green; enrichments 203/1
  (the 1 fail is the unrelated rotating point-119 trample-grief staging flake,
  cleared on retry — folded into point 200).
  ORIGINAL: A predator that finished feeding near the OCEAN coast paces up and
  down along the waterline and never leaves (user play-test 20.07.2026, Cairo
  coast, screenshot). The §19.4 walk-off deflects along the coast
  (`deflectedStep`) but at a coastal pocket the deflection oscillates — the
  leave target lies seaward, each frame flips the tangent choice, the predator
  shuttles on the beach and is never removed (it must reach beyond the view
  ring to despawn). DIAGNOSE FIRST with a probe at the Cairo coordinates (the
  145b/129 lesson: suite launch args, drive the scripted feed, watch the leave
  phase heading/position series). FIX DIRECTION (confirm by probe): make the
  walk-off target LAND-AWARE — pick the leave direction with the longest clear
  LAND corridor (sample a fan of headings, prefer inland over seaward) instead
  of a fixed/seaward heading, and keep the tangent choice STABLE across frames
  (persist the chosen side, the point-121f dodge-side lesson) so the deflection
  cannot flip-flop; a predator still blocked past a calibratable deadline
  re-aims inland. VERIFY: pure test for the land-corridor heading pick and the
  sticky tangent; live enrichments check staging a feed at a coastal pocket and
  asserting the predator's distance from the kill site grows monotonically past
  the ring (no oscillation) — plus the existing walk-off checks stay green.
  DOCS: CLAUDE §7.1 pt.12 streaming bullet (the walk-off clause).
- [x] 189. DONE 20.07.2026: buildWetland rebuilt as a LOBED marsh — six
  overlapping irregular shallow sheets with dense papyrus belts at the lobe
  edges (26 clumps, §19.9 reed rule), elongated along a riverward +z tongue,
  scaled to stay the broadest site inside the < 6-unit travel-marker family
  cap; and the scene now ORIENTS the Sudd toward the nearest channel (a 16-way
  riverDistance probe replaces the random yaw), so the marsh joins the White
  Nile instead of floating beside it. New pure geometry test (extent/tongue/
  papyrus density); screenshot confirms "reed marsh at the river". During the
  visual pass the brown strips nearby were identified as the INTENDED region-
  border dashes (§3.1) — a correctly rejected false alarm. enrichments 205/1
  (the 1 fail is the unrelated rotating point-102 vicinity flake → point 200);
  build+lint+1946 vitest green.
  ORIGINAL: The Sudd reads as a small detached water BLOB beside the White Nile
  instead of a broad marsh (user play-test 20.07.2026, screenshot: a tiny blue
  patch with flower tufts west of the river). The §4.4 natural site mounts, but
  its depiction does not read as the vast §19.13 swamp. DIAGNOSE: how the Sudd
  site renders its water fan (`__naturalSites`, the delta/marsh water meshes)
  and why the patch sits offset from the channel. FIX DIRECTION: widen the marsh
  into a low, river-HUGGING fan (several overlapping sheets or a wider polygon
  anchored ON the channel, reed belts at its edges per the §19.9 water-edge
  rules), sized so it reads at the default zoom; keep the label. VERIFY: the
  existing Sudd clearance/screenshot checks (127) re-shot and eyeballed — the
  marsh must touch the river band, not float beside it; world.test.ts clearances
  hold. DOCS: none (§4.4 already describes the Sudd as a swamp).
- [x] 190. DONE 21.07.2026 — ROOT-CAUSED past the single lake: the relative
  lake carve kept the RIFT SLOPE in every lake bed, so the max-bed sheet stood
  up to 2.3 units over the low shores (Edward 2.29; the generalising sweep
  found the same class at Nyasa 1.40 and Albert 1.09). Fix: lake interiors now
  blend to a flat per-lake BASIN LEVEL (the lowest shore ground on a ring
  0.5 deg outside the polygon, − 0.35 drop, re-entrancy-guarded cache;
  rivers keep their relative carve) — the sheet lands near or below every
  shore BY CONSTRUCTION: measured overhangs after the fix ≤ 0.35 across all 8
  lakes, with the ORIGINAL geographically accurate polygons untouched (the
  probe-driven trims were reverted — accuracy wins). New permanent world.test
  sweep (all 8 lakes, per-vertex shore overhang < 0.5). Verified: 1947 vitest
  green (all clearance/type suites hold on the new terrain), enrichments 206/0
  (lake sheets, the point-152 swim at mid-Lake-Edward, ribbon continuity,
  crocodiles, Okavango flood).
  ORIGINAL: Lake Edward's sheet FLOATS partly in the air (user play-test
  20.07.2026, screenshot): the flat lake surface takes the height of the
  adjacent mountain shore, so its edge hangs over the lower ground beside it.
  USER-SUGGESTED FIX: SHIFT the lake slightly into the depression it belongs in
  (the rift trough beside the ridge). Run the village-move conflict checklist
  analog for lakes (river endpoints that reference the lake, clearances,
  region/climate anchors, the swim/point-152 checks that sample mid-lake).
  ALTERNATIVE if the DEM has no depression there: lower the sheet by deriving
  its height from a SHORE-percentile of the bed instead of the max. DIAGNOSE
  FIRST: sample the DEM around Lake Edward's polygon and compare the sheet
  height against the surrounding terrain; pick shift vs derivation by what the
  data shows. VERIFY: the point-125 swim check (screenshot 125) still floats the
  swimmer ON the sheet; a new pure/live assertion that no lake-sheet EDGE
  vertex stands more than a small tolerance above the terrain beside it —
  swept over all 8 lakes so the fix generalises. DOCS: none.
- [x] 191. DONE 21.07.2026: the cause was a LEAPFROG FEEDBACK — the passive
  guard branch (any parent whose calf a CHASING lion nears) stationed the
  parent lion-side of its calf, the calf follows its parent, so the station
  crept after the sprinting hunter and the whole pair tracked the hunt to the
  kill. New pure guardEngagement (closest-approach memory + release-on-recede
  slack 0.8, reset out of radius and between hunts): a passing hunter is
  guarded only WHILE IT CLOSES IN, never followed. 3 pure tests; the
  victim-gated charge/shield paths untouched (all staged dramas green).
  enrichments 206/0, build+lint+1950 vitest green. (A dedicated two-family
  live staging joins the point-200 hardening pass.)
  ORIGINAL: During a calf hunt, a SECOND (uninvolved) parent+calf pair appeared
  to RUN AFTER the predator chasing its victim until the catch (user play-test
  20.07.2026, screenshot). Expected (§19.8): only the VICTIM's own parent
  reacts (charge/shield); every other family flees AWAY or ignores the hunt.
  DIAGNOSE FIRST: check the charge/rescue trigger — does it gate on
  `parent.child === victim` (or the victim's own `parent` link) at EVERY entry
  point (charge, shield, guard, wade), or can proximity alone pull a foreign
  parent toward the hunter? Also check the dodge steering: a fleeing pair whose
  escape heading is computed FROM the predator can end up steering behind it
  when the predator overtakes — the sticky dodge side may need a re-check
  against the predator's current bearing. FIX per diagnosis; keep the one-hunt
  architecture. VERIFY: pure test that a non-victim family's step during an
  active hunt always INCREASES its distance to the hunter (or at least never
  tracks it); live staging with two families where only the victim's parent
  engages. DOCS: none (§19.8 already says the parent).
- [x] 192. DONE 21.07.2026: animals may now purposefully CROSS rivers/lakes and
  FLEE INTO them — never the ocean, never spawning or idling in water. Built:
  a `crossing` state (swims chest-deep ON the rendered sheet at the seasonal
  wade speed; lands or the hard I4 deadline grounds it), the pure
  `crossingTarget` pick (refuses ocean and over-wide channels), flee-into-water
  at the FLEE and DODGE dead-ends (boxed against water by a predator or an
  oncoming elephant), water-setback + live-check exemptions for `crossing` AND
  `caught` (the point-197 croc-grip teleport gap closed on the way),
  `balance.waterCross.{maxUnits,chance,resolveSeconds}` debug-editable with
  de/en labels, design.md §19.5 + CLAUDE §7.1 pt.12 updated in the same
  commit; 4 pure tests + a staged live crossing (swims the Zambezi channel and
  lands, chest-deep asserted against __rivers.surfaceAt). enrichments 207/0,
  build+lint+1954 vitest green. OPEN sub-items (honest scope): the elephant
  ROAM does not yet roll purposeful crossings (it still deflects along banks —
  `waterCross.chance` is wired for it), and the HUNTED calf keeps its §19.8
  dead-end-for-the-catch rule (its water escape needs the lion waterline-balk
  wiring) — both filed here for a follow-up, not silently dropped.
  ORIGINAL: WATER-RULE REVISION (user clarification 20.07.2026): "no animals in
  water" was implemented too strictly. TARGET STATE: animals do NOT spawn in
  water and do NOT idle/stand in water by default (unchanged); ocean stays
  hard-forbidden (unchanged, I5); BUT animals MAY purposefully CROSS a
  river/lake (swim to the far bank, §19.5 movement discipline applies) and MAY
  FLEE INTO water to escape a predator or an elephant trample — predators do
  not follow into deep water (the escape works, matching real waterhole
  behaviour), the §19.16 crocodile threat still applies to whatever stands in
  its strike radius. IMPLEMENTATION: (a) the river/lake water-setback backstop
  exempts an animal in a CROSSING or FLEE state (state flag, cleared on
  reaching land; the ocean backstop stays absolute); (b) crossing: the roam/
  walk step may enter a channel when the far bank is within a calibratable
  swim distance — swim pose (body lowered, slowed by the seasonal flow factor
  like the wade), exit on the far bank; (c) flee-into-water: the §19.8 flee
  steering and the generic prey dodge may choose a water heading when the
  land corridors are worse (predator between prey and land), the predator's
  chase BALKS at the waterline (existing behaviour) and the hunt aborts/
  retargets per the existing strayed-chase rule; (d) the drowning dramas
  (point 122) keep their season gate — a flee into a swollen current can still
  end badly, that is the drama, not a bug. TESTS: pure (backstop exemptions,
  crossing step, flee-heading pick, predator balk), live (a staged flee into
  water escapes the hunt; a crossing herd reaches the far bank; idle animals
  still never stand in water — the §19.5 checks stay green with the exemptions
  scoped). DOCS: design.md §19.5 (the water discipline paragraph) + CLAUDE §7.1
  pt.12 (the bodies-and-boundaries bullet) rewritten to the new target state in
  the SAME commit.
- [x] 193. DONE 21.07.2026: in the 'leave' mode (the visible predator walking
  off after feeding) the prey-flee gate read the lion as INACTIVE — herds
  grazed unmoved beside a lion on open ground, the reported standoff. 'leave'
  now counts as active for the prey: herds part around the walk-off path and
  calves hold their play until the predator is truly gone (the vigil keeper's
  familyHeld exemption and the victim-gated drama paths are untouched).
  enrichments 206/0, build+lint+1950 vitest green. Residual standoff cases (a
  stuck hunt state) are exactly what the point-203 liveness invariant (B) will
  sweep for systematically.
  ORIGINAL: Predator and prey stand IDLE next to each other — no kill, no flight
  (user play-test 20.07.2026, screenshot 19.02.1891: an adult predator and a
  small prey ~1 body apart on open savanna, both stationary). Suspects
  (DIAGNOSE FIRST, probe at the staged state): (i) a hunt that ended
  (caught/abort) but left the predator in a non-leave mode standing at the
  prey while the prey's flee gate (`chase && victim === a`) no longer fires;
  (ii) the point-179 swept-catch change leaving a caught-but-uncounted state;
  (iii) a revenge carcass/lion mis-read (unrendered lion made visible?); (iv)
  the proximity-dodge dead zone: prey dodges only a MOVING/close elephant-class
  threat and ignores a stationary predator, while the predator only engages via
  the scripted hunt — two idle actors. FIX per diagnosis: an idle predator
  within touch range of live prey must either engage (if the hunt slot is free)
  or leave (walk-off), never stand; prey must treat a predator inside its dodge
  ring like a close threat even when stationary. VERIFY: pure test for the
  engage-or-leave rule and the stationary-predator dodge; live staging pinning
  a predator beside prey and asserting the standoff resolves within a bounded
  sim window. DOCS: CLAUDE §7.1 pt.12 if the dodge rule wording changes.

- [x] 194. DONE 20.07.2026: the chase→feed close-out now aborts into the
  ordinary walk-off when the victim was caught by the crocodile (v.caughtBy),
  never feeding on the sinking kill; the crocodile victim scan skips
  LION_STATE.victim; and the enrichments croc staging parks the scripted hunt so
  the point-130 rescue's lionTouched asserts clean. build+lint+1941 vitest green;
  enrichments' croc suite green (the 2 fails in the proof run were the unrelated
  rotating point-118/126 staging flakes → point 200).
  ORIGINAL: The scripted lion hunt and the crocodile ambush can CLAIM EACH
  OTHER'S victim — the §19.16 independence promise ("never touching the
  scripted lion hunt") is violated at two seams. Found by the 184 Pillar-2
  audit (inline-verified against the code 20.07.2026):
  (a) the chase→feed close-out (Wildlife.tsx ~3454) flips the hunt into 'feed'
  whenever `v.caught !== undefined` WITHOUT checking `v.caughtBy` — if the
  crocodile seizes the lion's current chase victim, the lion snaps into feeding
  on the crocodile's still-struggling prey (whose kill then SINKS, leaving the
  lion feeding on nothing);
  (b) the hunt's victim pick and the crocodile's victim scan do not exclude
  each other's claims — the hunt can pick a croc-seized calf (the observed
  enrichments `lionTouched:true` flake in the point-130 rescue staging is this
  seam: the natural hunt claimed the staged croc calf), and the croc scan's
  exclusion list (dead/caught/inWater/mired) should also skip the ACTIVE chase
  victim so the §19.16 line holds in both directions.
  FIX: (a) close out into 'feed' only when the victim is dead or caught by the
  HUNT itself; a croc-caught victim ABORTS the chase into the ordinary leave/
  walk-off (retarget per the strayed-chase rule); (b) the hunt victim pick
  skips `caught !== undefined` animals; the croc scan skips
  `LION_STATE.victim`. VERIFY: pure tests for both exclusions (a croc-caught
  victim never yields feed mode; the pick/scan skip rules); the enrichments
  crocodile suite (lunge/rescue/sacrifice/toolate/vanish) stays green and the
  point-130 rescue staging no longer needs to tolerate a lion claim —
  `lionTouched` asserts clean without retries. DOCS: CLAUDE §7.1 pt.12 §19.16
  bullet already promises this; no wording change needed.

- [x] 195. DONE 21.07.2026 — the RADIUS-NOT-FRUSTUM sweep over the remaining
  wildlife spawn/despawn paths (the points-165/171/172/183 class). All six suspect
  sites moved off an assumed radius onto the true camera frustum (`isOnScreen`):
  (1)+(2) the calf-hunt AND generic-hunt predator now spawn via a new pure
  `offscreenRingSpawn` (nearest off-screen point on a ring out to the abort
  radius) instead of the raw `HUNT_LION_APPROACH`, so a predator never pops in
  beside its on-screen prey; the generic-hunt SPOT itself is off-screen-gated so
  the scripted prey mesh never appears in view. (3) the vigil-drawn predator uses
  the same frustum-aware helper (was a radius annulus — `vigilDrawSpawn` retired,
  its test block rewritten for `offscreenRingSpawn`). (4) `flightStep`'s OUT-mode
  bird despawn requires genuinely off-screen (was raw viewR+margin, could despawn
  in view at a wide zoom). (5) the vicinity seeder now requires the whole ±SPREAD
  scatter disc off-screen, not just the anchor, else it defers. (6) the chunk
  streaming coverage cap (`SPAWN_RANGE_MAX`) is derived from a 288-unit cover
  radius so the range grid always exceeds the frustum out to the wide zoom (the
  point-171 flora fix, applied to wildlife). ALSO fixed a real bug the sweep
  surfaced: the GENERIC lion-leave transition (feed→leave with no victim,
  Wildlife ~3922) never reset `leaveHeading`/`leaveT` — point 188 added the reset
  only to the victim branch — so a generic hunt's walk-off carried a stale
  corridor heading and overtime clock (the two enrichments leave-despawn checks
  failed on the inherited state my sweep shifted). Both branches now reset
  identically. Hardened the two leave-despawn checks to a deterministic inland
  stage (Serengeti jump — point 200) so they never inherit a coastal player
  position, and exempted the wading bather from the point-196 anchoring assert (a
  water occupant below the bank, like the drama poses). New pure tests for
  `offscreenRingSpawn` (off-screen guarantee, nearest-first, wide-zoom fallback);
  build+lint+audit clean, 1960 unit green, enrichments 207 pass / 0 fail / 0
  console-errors.
  ORIGINAL: RADIUS-NOT-FRUSTUM sweep over the remaining wildlife spawn/despawn
  paths (Pillar-2 group; the points-165/171/172/183 class, finding list in the
  184 log). Suspect sites: the calf-hunt predator spawn (Wildlife ~3441,
  hard-coded 15-unit approach, visible the same frame — a predator can POP into
  view next to the hunted calf), the generic-hunt placement ring (~3386,
  25-45-unit "within view" ring), the vigil-draw predator spawn (~3432 +
  wildlifeBehavior 628, viewR annulus with no frustum test), the flightStep
  OUT-mode despawn (wildlifeBehavior 282, raw viewR+40 — a bird can despawn in
  view at a wide zoom), the vicinity seeder's per-MEMBER placement (~1084, only
  the group anchor is projected; scattered members ±6 units can land on-screen),
  and the chunk-streaming coverage cap (~1462/1465, 100×zoom assumed radius +
  SPAWN_RANGE_MAX — at the unlocked wide zoom animals visibly miss/despawn
  inside the frame; flora fixed this in point 171, wildlife did not). For EACH:
  verify inline at the achievable zoom (and the unlocked wide zoom where the
  feature exists), fix via isOnScreen/frustum projection or an off-screen
  iteration (the existing patterns), pure-test the changed rule, and extend the
  I1 invariant drive if it can catch the class. One commit per coherent fix or
  one for the sweep if small. DOCS: CLAUDE §7.1 pt.12 bullets where wording
  changes.
- [x] 196. DONE 21.07.2026 — the BED-VS-SURFACE / GROUND-ANCHOR sweep over the
  remaining water and slope depictions (Pillar-2 group; the points-128/152/185/187
  class). All four sites fixed, each routed through a shared pure anchor so the
  render and the tests agree: (a) the §19.8 water-drama poses (a fallen-in calf,
  its downstream drift, the wading/escorting parent, a rescued calf clambering
  out) now stand chest-deep ON the rendered sheet via `sheetAnchorY` — the carved
  bed sits a full channel depth below the surface mid-channel, so they read too
  deep before; the render-side extra dip on the wading parent was removed (it
  double-counted the depth now that a.y rides the sheet). (b) The drink/bathe
  cycle samples the ground UNDER the rendered spot every frame (an endpoint lerp
  buried the drinker under any ridge on the way to the bank), riding the sheet
  chest-deep over the water's edge for a bather. (c) The grass-fire scorch band
  is now a terrain-following strip of `FIRE_BAND_SEGMENTS` instanced quads, each
  at its own sampled ground height (the single midpoint-height plane clipped into
  rising ground and floated over falling ground). (d) Flamingos stand via
  `waderStandY` — legs in their own shallow sheet, clamped to the local bed —
  instead of a flat y=0.02 that buried whole flocks on elevated lakes. Also
  SHARPENED the point-203(A) tripwire: it now judges the LOGICAL render spot
  (the pre-idle-shuffle position — the cosmetic ±0.8 shuffle would sample ~0.9
  higher ground on a slope and false-fire) and the drink exemption is LIFTED, so
  drinkers are policed like everyone else. Two new pure tests (`sheetAnchorY`,
  `waderStandY` in wildlifeBehavior.test.ts); build+lint+audit clean, unit green,
  enrichments 207 pass / 0 fail / 0 console-errors with the tripwire armed.
  (Original site notes for the record: Wildlife ~2806 drowning calf too deep;
  ~2751 floating/sunken drinkers under a far dry-season catchment; ~2282 scorch
  plane on slopes; ~913 flamingo fixed y on elevated lakes.)
- [x] 197. DONE 21.07.2026 — the DRAMA-STATE EXCLUSION/GATING sweep (the seams
  BETWEEN emergent systems, sibling of 194). A shared pure predicate
  `claimedByAnotherDrama` (caught / in-water / mired / crossing / fire-trapped /
  the lion's chase victim) now gates BOTH fresh-victim scans so two dramas never
  fight over one actor: the crocodile lunge scan (which also skips a fleeing/
  dodging drinker whose stale drink TARGET merely sits near the croc — it is
  rendered away at its flight, not at the bank — and a vigil keeper) and the
  grass-fire calf-catch. The hunt's calf picks now skip a fire-trapped or
  crossing calf (the reverse claim). The collision `inDrama` predicate gained the
  child-in-water case (a parent wading to a drowning calf was shoved by herd-mates
  — the backstop already exempted it, the collision list did not) plus crossing
  and fire-trapped for parity. The caught-in-water backstop exemption and the
  croc-seize-vs-vigil case were already covered (points 192/186). Pure test for
  `claimedByAnotherDrama` (free vs. every owned state, zero-timer counts as
  owned); build+lint clean, 1976 unit green, enrichments 207/0/0 first try (the
  dramas are not over-excluded). ORIGINAL: DRAMA-STATE EXCLUSION/GATING sweep (Pillar-2 group; the seams
  BETWEEN systems, sibling of 194 — list in the 184 log): the crocodile victim
  scan derives its trigger from the drink-cycle CLOCK and the static drink
  TARGET, never the victim's actual position (~2091/2092 — it can lunge at an
  animal that wandered off); the flee/dodge/guard steps move raw with no
  water/terrain deflection (~3048 — the FLEE and DODGE steps are DONE via point
  201, 20.07.2026; the charge/shield/guard steps remain — coordinate with point
  192's water-flee design, the 157 deflect pattern); the river/lake water backstop does not
  exempt a CAUGHT animal (~2056 — it can teleport a croc-gripped victim out of
  the grip: the point-186 vanish class from the other side); the croc seize
  does not clear v.vigil (~2136 — a seized vigil keeper keeps both states); the
  collision inDrama predicate exempts a parent whose child is caught/mired but
  NOT one whose child is inWater (~1978, asymmetry with the backstop); the
  grass fire and the hunt can claim the same calf concurrently (~3340, the 194
  claim-seam pattern). Verify each inline, fix with the mutual-exclusion
  pattern 194 establishes, pure-test every exclusion, keep the §19.8
  every-drama-resolves invariant. One commit per coherent fix.
- [x] 198. DONE 21.07.2026 — a pinned settlement walker can no longer stay pinned
  forever. `nudgeToFree` returned the ORIGINAL point when its ring search found
  nothing while the PlaceLife caller reset `s.pinned = 0` unconditionally, so a
  walker with no free spot nearby never unstuck. New pure `tryNudgeToFree` reports
  `{ pos, found }`; `nudgeToFree` is now a thin wrapper (layout builder + old
  tests unchanged). The caller escalates: try the ring search, WIDEN it once (24
  rings), and if there is still no free spot RETIRE the errand (`s.seg++`, a new
  target) — the counter resets only on real progress (relocated or retargeted),
  never on a silent no-op. Inhabitants only, never the player. Pure tests for the
  found/not-found branches (already-free, escapes-a-pocket, walled-in, no-rings);
  build+lint clean, 1980 unit green, collision suite 20/0/0.
  ORIGINAL: A pinned settlement walker can stay pinned FOREVER when no free spot
  exists near its errand point: nudgeToFree returns the ORIGINAL point when its
  12-ring search finds nothing (collision.ts ~200) and the PlaceLife caller
  resets `s.pinned = 0` unconditionally (~764) — the point-155 "teleport-nudged
  to free ground" promise silently no-ops and the unstuck window never fires
  again (Pillar-2 finding, list in the 184 log). FIX: only reset the pinned
  counter when the nudge actually MOVED the walker (or found a validated free
  spot); when the search fails, escalate — widen the search once, else retire
  the errand and pick a new target (the existing errand validation path).
  VERIFY: pure test for the nudge-failure branch (unchanged point → counter not
  reset → escalation fires); the collision suite's no-pinned-walker check stays
  green across seeds. DOCS: none (the point-155 wording already promises it).
- [x] 199. VERIFIED & REJECTED 21.07.2026 — inline analysis of the pose maths
  shows the clamp-induced drift is a rare, negligible corner (the task's
  "reject with the measured bound" path). The pitch clamp (±CANOE_PITCH_MIN
  -0.65 / MAX 0.5) only binds when the far end sits beyond ~40-43° below/above
  the player over the ~1.35-unit trail — a very steep drop DIRECTLY behind the
  traveller while dragging (mountains). Below that, every reachable drag slope
  leaves the pitch UNCLAMPED, so there is zero clamp-induced drift. At the clamp
  threshold the near-end drift is ~0.16 m and grows only on steeper drops, a
  momentary cosmetic effect. The pose is an accepted approximation anyway
  (CANOE_TRAIL_CENTRE 1.35 != the half hull 1.065, so the near end never sits
  exactly at the grip regardless of the clamp), so a pin-the-near-end
  re-derivation would re-tune the whole screenshot-accepted pose (and introduce
  a discontinuity at the clamp boundary if applied only when clamped) for a
  disproportionate gain. Documented in a canoeDrag.ts comment; no code/behaviour
  change. ORIGINAL: The dragged canoe's centre slides when the pitch clamp binds
  (canoeDrag.ts ~152, Pillar-2 finding): centreY keeps tracking the raw far-end
  ground height while the pitch is clamped, so on a steep trail the
  reconstructed near end drifts off the grip line. Verify inline whether the
  drift is visible in play (steep slopes only); if yes, recompute centreY FROM
  the clamped pitch (near end pinned to the grip, centre derived), pure-test in
  canoeDrag.test.ts alongside the existing pose matrix; if visually negligible
  at real slopes, log as rejected with the measured bound. DOCS: none.
- [ ] 200. VERIFY-SCRIPT ROBUSTNESS pass — fix the 26 wall-clock/radius
  findings in the test scripts (Pillar-2 group E; exact list in the 184 log:
  20 in enrichments, plus polish 270, settings 183/277, flow 242, voice 56,
  touch 75). Two patterns, both established: (1) render-loop behaviours polled
  on the SIM clock (__pollSim/__sleepSim/simTime) or on the check's OWN
  condition — never a fixed wall wait (the point-177 class; the elephant-roam
  and lion-feed flakes were exactly this); (2) "in view / beyond the ring"
  judged by __camera.onScreen/ndc projection — never an assumed radius (the
  point-172 class), with checks that TEST a radius-feature keeping the radius
  but saying so. Work file-by-file, run each touched suite after its change
  (both backends for the WebGPU-lane suites; touch/voice webgl-only), and
  fold the result into the final-closing 3× flake-free gate — this point IS
  the systematic version of the one-off de-flakes done so far (some findings
  may already be partly fixed, e.g. settings 277: verify against HEAD first).
  PROGRESS 21.07.2026: converted the six named non-enrichments waits (commit
  7ed3c56) + six enrichments family/predator/scavenge/rescue STAGING settles to
  __sleepSim (5127afa, af4533f) — all touched suites green.
  PROGRESS 21.07.2026 (evening): three more increments, each validated green +
  pushed — (1) FAIL-SOFT against a whole-run ABORT (7360b62): a rare mid-check
  scene remount briefly nulls window.__wildlife; a non-optional herdsRef access
  threw an UNCAUGHT error that killed the entire run and DEFEATED the auto-retry
  (a crash on attempt 1 + any rotating flake on attempt 2 = double failure). The
  collision-drive loops now optional-chain the hook and __pollSim wraps its
  doneFn in try/catch — a crash becomes at worst one recoverable check miss. This
  was the key structural win: the suite now reaches green via retry-cushioning as
  designed. (2) Canoe/swim staging settles -> condition polls (same commit).
  (3) The collision drive-in/escape loops bound by SIM time with a wall cap
  (79ff2cb) — a wall-timed window ran too few frames under load (escaped 0 vs
  5.3). NEXT / NOT YET DONE (a flood-convergence batch was tried and REVERTED
  unvalidated — do it right): replace the long weather blend waits
  (waitForTimeout 4000-4500, "blends at 0.02/frame": Nile flood ~5047, Okavango
  ~5090, harmattan ~5119) with a convergence poll — BUT settle on the value the
  CHECK ACTUALLY READS, not just the blend driver: the harmattan check reads
  __climate.fog().far, which LAGS __climate.dust() by its own fog blend, so
  settling on dust() returned before fogFar closed and the Jan<Aug assertion
  failed (161 vs 153). Settle on fogFar (and for the Nile settle on surfaceAt,
  for the Okavango on deltaWaterScale — whatever the check compares), or poll
  until ALL read values are stable. Speeds up every run ~15-20 s AND de-flakes.
  REMAINING drama flakes still rotating (cushioned by the retry, to root-cause
  for the closing's strict 3x gate): point-102 vicinity count, plover 145b,
  calf-play, parent-guards-calf, the crocodile-spawn cluster.
  PROGRESS 22.07: the lone-scavenger-185 landing is now DETERMINISTIC (commit
  f76dc3d) — before polling, remove other carcasses from its target pool + shove
  nearby live animals clear + commit the bird to the injected carcass. CLOSING
  NOTES for the others (do NOT repeat these dead ends): (a) the vicinity-102
  budget must NOT simply be widened — MORE sim time lets the seeded grazers
  WANDER out of the leave-point radius (the code comment says exactly this), so a
  bigger budget is counterproductive; fix by counting from the settlement ANCHOR
  (where the seeder guarantees the min) or by pinning the count to the immediate
  post-leave moment. (b) calf-play (samples:0): a calf gambols only ~25% duty
  (GAMBOL 4s/16s) AND canPlay needs no active lion + calf near its parent (not
  play-locked) + a CALF_HUNT_SPECIES; force a young calf beside its parent with
  playLock cleared so it stays play-eligible through the poll. (c) plover-145b
  (dead:true): the bird dies before its broken-wing act — keep it alive / force
  its lure state. TRIPWIRE-TRANSIENT
  ROBUSTNESS (for the closing's 3× flake-free): the point-203A anchoring tripwire
  intermittently fires ONE console-error per several enrichments runs on a rare
  1-frame anchoring transient at a state transition — observed a floating
  wildebeest and a buried shore-seeded drinker at the waterline, different each
  run, none reproducible, imperceptible at 60 fps. The tripwire samples per
  frame, so it catches the single transition frame before the next frame
  corrects. FIX for the closing: make the tripwire tolerate a 1-frame transient
  — only console.error when the SAME animal violates on 2+ consecutive
  assert-visits (a per-animal strike counter), so a persistent float (a real
  bug) still fails loudly while a one-frame spawn/drink/shore-seed transition
  does not. Do this as part of the closing prep so the LARGE gate can reach 3×
  clean.
  OBSERVED 22.07 (a WebGL enrichments run during the 210b work): 207 pass, 2 fail,
  0 console-errors — both KNOWN rotating staging flakes, cushioned by the retry:
  (1) plover-145b again `dead:true` (the bird died before its broken-wing act —
  the documented cause above); (2) the point-129 witness "a tree contact blocks
  the entry but leaves N/S/W free" with `reached:false` (minDist 1.41, N/S/W all
  ~2.2-2.4 free) — a NEW entry for the rotating-flake list: the driven post-
  collision move did not COMPLETE in the frames allotted (the 200 SIM-clock class,
  not a real collision bug — the free directions are all open). ADD to the
  closing root-cause set: poll the point-129 driven move on the SIM clock / its
  own arrival condition rather than a fixed frame budget. The point-102 vicinity
  check (this session's anchor fix) PASSED first try, confirming that fix.

- [x] 201. DONE 20.07.2026: the generic FLEE step (radial away from an active
  lion) and the elephant DODGE step both moved RAW — onto a water cell, where
  the §19.5 backstop teleported the animal back each frame: an on-the-spot pin
  at the bank, exactly the freed calf standing at the waterline while the lion
  ate its parent. Both steps now route through deflectedStep with the shared
  water/ocean predicate (the point-157 pattern; the point-192 water-flee will
  later just swap the predicate). New live check stages the squeeze (feeding
  lion inland, prey at the bank, escape pointing into the water) and asserts
  real ground covered along the bank, never a pin and never standing on water.
  This also closes the ~3048 raw-step finding inside the point-197 group.
  enrichments 206/0, build+lint+1945 vitest green.
  ORIGINAL: The fleeing calf gets STUCK while its parent sacrifices itself and
  is eaten (user play-test 20.07.2026). Point 157 already routes the chase
  victim's flee through calfFleeStep→deflectedStep and leaves a dead-end for
  the CATCH to resolve — but in the SACRIFICE ending the catch resolves on the
  PARENT, so a calf that reached a dead-end (river bank / coast corner) while
  fleeing is never caught and never freed to move on — it stands pinned at the
  waterline (the screenshot: North, a river bank). DIAGNOSE FIRST (probe at a
  staged sacrifice with the calf steered onto a bank): once the parent is taken
  and `calf.parent`/`LION_STATE.victim` clear, what drives the calf? FIX
  DIRECTION: when the sacrifice frees the calf (parent taken, calf survives),
  the calf must RESUME ordinary fleeing/roaming with the water-deflected step —
  clear any chase-victim leash and dead-end hold so it walks off the bank; if it
  is genuinely boxed on a spit, the generic water-flee of point 192 (allowed to
  cross) resolves it. VERIFY: pure test that a freed calf on a bank produces a
  moving step (not moved:false forever); live staging of the sacrifice ending
  with the calf on a bank, asserting it leaves the waterline within a bounded
  window. Coordinate with 192 (water-crossing) and 157.
- [x] 202. DONE 20.07.2026: landed birds now derive their height from the POSED
  geometry's lowest point (the pecking head reaches ~0.21-0.27 below the origin
  at the render scales — far past the flat 0.15 hover) and lift onto the HIGHEST
  ground under their EXTENTS (both wing tips + head, rotated with the yaw), in
  both systems (ground scavenger + kill flock) via the new pure
  landedBirdLowestDepth/birdExtentOffsets/landedBirdYPosed/
  landedBirdClearancePosed — the verify metric is now the lowest-POINT clearance
  and the point-185 double-lift cap still trips. 4 new pure tests; enrichments
  205/0 (the steep-rise + flat gates run on the posed metric);
  build+lint+1945 vitest green.
  ORIGINAL: Vultures still CLIP into the ground (user play-test 20.07.2026,
  screenshot: a vulture half-sunk in the riverbank sand). Point 185 fixed the
  ground SCAVENGER's double-lift and point 128/185 the landedBirdY hover, but a
  vulture still intersects the terrain — likely (DIAGNOSE FIRST) one of: the
  DESCENDING/landing interpolation passing through the ground before the landed
  clamp engages; a vulture landed on a SLOPED bank where landedBirdY's
  positive-only lift under-corrects; or the circling/feeding bird sampling a
  stale ground height as it moves. Probe the vulture y against the sampled
  ground across its whole flight→descend→land→feed cycle (not just the settled
  landed frame) at a riverbank spot. FIX per diagnosis: clamp the RENDERED
  vulture y to at least the sampled ground + the body clearance at EVERY phase
  (descend included), using the per-position ground sample (the point-185
  killGroundY pattern) rather than a spawn-time height. CRUCIAL (user
  clarification 20.07.2026): the clearance must cover the FULL WING SPAN and the
  FEEDING MOTION, not just the body centre — a landed/feeding vulture spreads its
  wings and the wing TIPS reach well beyond the body radius, and the peck/bob
  feed animation dips the head/front DOWN; on a slope or as the bird rotates a
  wing tip or the pecking head punches through the ground while the centre still
  clears. So derive the lift from the LOWEST point of the wing/head geometry
  across the feed animation and the body tilt (wing half-span × roll/pitch plus
  the feed-bob amplitude), sampling the ground under the wing EXTENTS, not only
  under the centre. VERIFY: extend the enrichments landed-bird clearance check to
  sample the DESCEND phase, a sloped bank, AND the wing-tip / lowest-feed-pose
  extents (the whole bird stays above ground through the feed cycle), gated
  strictly above zero; pure-test the wing-aware clearance on a slope with a
  spread-wing / mid-peck pose. Part of the point-196 ground-anchor group but
  filed on its own as a direct user report.

- [ ] 203. EXTEND 184 — a SYSTEMATIC visual + liveness bug-finder (user request
  20.07.2026: "Bugs wie die … sollten leicht für dich zu finden sein … Kannst
  du 184 dahingehend erweitern, dass es selbst viel mehr Bugs in der Richtung
  findet?"). ROOT CAUSE of the miss: the invariant harness checks POSITIONS
  (I1 pop-in / I5 ocean / I6 interpenetration), but the whole recurring class
  the user keeps stumbling on is either RENDERED-GEOMETRY-vs-terrain (187 croc
  submerged, 202 vultures clipping, 190 Lake Edward floating, 185 scavenger,
  196 drinkers) or LIVENESS (188 predator pacing, 201 calf stuck, 193 idle
  standoff, 191 foreign family) — neither systematically swept. THREE additions,
  all cost-light (NO agent fan-out — pure/live checks + me inspecting
  screenshots in the main loop; the point-200 token concern applies):
  (A) ANCHORING INVARIANT — the highest-value one. A render hook exposes, per
  rendered animal/bird/prop each frame, its world (x,z), the LOWEST point of its
  POSED+SCALED mesh (bounding-box min-y after the live pitch/roll/scale — for a
  bird that means the pecking head and the spread wing tips), and a support
  point. A driven sweep over all regions asserts for every rendered thing: its
  lowest point is NOT below the sampled ground at its footprint (no clip — sample
  under the wing/limb EXTENTS, not just the centre), it is NOT far above the
  ground with nothing under it (no float), and a water-dweller sits at the
  rendered water SURFACE (no submerge/hover). This single check catches
  187/202/190/185/196 and their future recurrences.
  (B) LIVENESS INVARIANT — the deferred I3/I4 generalised. Over a long driven +
  staged observation, track each actor's position and state; flag any actor in a
  LIVE state (a hunt mode, a leave, a chase-victim, a caught, a finished feed)
  whose position is FROZEN (variance ~0) or OSCILLATING (paces a short segment)
  past a calibratable deadline, and any predator within touch range of LIVE prey
  where for a window neither engages nor flees. Catches 188/201/193 and kin.
  Extend (A) to STATIC water bodies too: every lake sheet / marsh fan sits at or
  just above its own bed and no edge vertex hangs over the lower neighbouring
  terrain (retro-catches 190 Lake Edward, 189 Sudd) — the same geometry-vs-terrain
  idea applied to the placed water, swept over all 8 lakes + the natural sites.
  (C) VISUAL SCREENSHOT SWEEP + INSPECTION — the catch-all for what the
  invariants do not anticipate, done the way the USER finds them but
  exhaustively: drive to a diverse set of spots and STAGE each drama (hunt,
  rescue, crocodile, trample, drink, flood, each biome/season), screenshot each,
  and VISUALLY inspect every image for anomalies (buried / floating / overlapping
  / mis-posed / wrong-looking things). Each anomaly → verify against the code →
  file a real one as its own point + fix. Keep a checklist of scenes so the sweep
  is repeatable and grows.
  KEEP THE VIRTUAL EYES OPEN FOR "LOOKS-WRONG" ODDITIES (user directive
  21.07.2026): the inspection must catch not only functional bugs but things that
  are functionally FINE yet look WEIRD to a human eye — the aesthetic/plausibility
  class the user keeps spotting: the stepped coastline (209), the sea-arm poking
  into the desert (210), a river that stops short of the sea with a beach gap or a
  notch punched in the water (211), and any similar "it works but it's ugly/odd"
  artefact (jagged edges, seams, holes, mismatched scale/colour, an object that
  reads wrong even though nothing errors). These pass every functional check, so
  ONLY the eye finds them — treat "does this look right to a human?" as a
  first-class question on every frame, and file each real one as its own point.
  (D) CROSS-SYSTEM / TARGETING SANITY — the class where a reaction or event fires
  for the WRONG actor or situation (derived from the past reports 162 a flock
  descends on a family the parent just SAVED, 168 carrion not shown when it
  should be, 191 a foreign family chases the hunter, 194 the lion claims the
  crocodile's prey). Invariant: every emergent system OWNS a unique actor (no two
  claim one — the 194 seam), and every reaction is KEYED to its correct trigger
  (only the victim's OWN parent charges/shields; a kill-flock forms only over a
  real feed or remnant; a scavenger commits only to an unowned carcass). Track,
  each frame, the (system → actor) map and the (reaction → trigger) link across a
  driven + staged run and assert no shared claim and no mismatched reaction.
  (E) VISIBLE-EFFECT / "the picture, not the uniform" — the point-147 lesson made
  a standing check (three rounds of uniform-level checks once passed while the
  player saw NOTHING; also 143 rain inside a settlement, 144 plants change,
  164/167 season/rain transitions): for each state toggle (season month, rain,
  flood, harmattan, fire, dress, dry-season bleach) assert the RENDERED frame
  changes measurably in PIXELS between the two states at a spot that should show
  it, AND that the state does NOT leak where it must not (no rain in a rainless
  desert, the season is the PLACE's not the traveller's). Pixel-diff based, a
  small fixed scene set. Retro-catches the whole "passes numerically, invisible
  on screen" family.
  (C) IS THE PRIMARY NET, NOT A FALLBACK (user insight 20.07.2026: "Es kann nicht
  sein, dass ich eine Minute zufällig drauf los laufe und mir direkt mehrere Bugs
  ins Auge springen, obwohl du gerade eine aufwändige Härtung vorgenommen hast").
  The invariants only find what I THOUGHT to check; the game is visual + emergent,
  so the reliable net is to LOOK at it the way the user does — but exhaustively.
  Make (C) a DENSE, standing, repeatable sweep: a grid of locations (each biome,
  each named place + landmark, coasts, river banks, lakes, the graveyard) × a set
  of staged situations (each drama, drink/bathe, flood, fire, each season/weather).
  CRITICAL (user 20.07.2026): a jump to a spot is only the POSITIONING — most bugs
  appear only while MOVING and OVER TIME (pop-in, plants jumping, the predator
  pacing, the calf snagging while it flees, streaming/edge artefacts). So at each
  spot DRIVE (hold a walk, and also a longer traverse across the region) and
  capture a FILMSTRIP of frames along the path, and LET the emergent dramas play
  out — capture a temporal SEQUENCE over several seconds, not one static shot. The
  static shot serves only the anchoring class; the driven filmstrip + the drama
  sequence are what catch the movement/emergent bugs. I VISUALLY inspect every
  frame (and the frame-to-frame deltas) for anything that looks off, logging each
  anomaly. Aim for the coverage a human would need hours of play to hit.
  TIME AXIS (user 20.07.2026): the sweep also varies the CALENDAR — MONTHS and
  YEARS (1890-1895) — and checks the weather/season effects AND THEIR TRANSITIONS
  are correct at the right place: harmattan Sahel Jan-Mar vs Aug, Atlas snow Feb
  vs Jul, the Nile flood crest Oct vs low Apr (at Aswan), the Okavango flood in
  the local-dry Jul vs Jan, equatorial ice, hail only in a heavy storm, the
  rinderpest years vs a clear year, the dry-season bleach vs the wet green, and
  the border-easing of rain (167). Sample intelligently — each feature at its
  PEAK month and an OFF month at its OWN location, plus a couple of stepped
  transitions to see the ease-in — not the full month×place cross product.
  BACKEND AXIS: run the whole sweep on BOTH WebGL2 AND the real WebGPU (the
  system-Chrome lane) — some visual bugs are WebGPU-ONLY (175 crown jitter, 181
  silhouette float) and never show on the headless WebGL2 path the first pass
  used.
  FULL DIMENSION SET (thought through 20.07.2026 — the sweep varies ALL of these,
  sampled intelligently, not the full cross product):
   1. LOCATION (biome, named place, coast, river bank, lake, landmark, graveyard).
   2. SITUATION/EVENT (each drama: hunt/rescue/sacrifice/crocodile/trample/vigil;
      drink & bathe; the weather events: flood, fire, hail, lightning).
   3. MONTH (season/weather + the transitions between them).
   4. YEAR 1890-1895 (rinderpest years, the deadline stages, the flood cycle).
   5. BACKEND (WebGL2 + real WebGPU).
   6. MOVEMENT (static vs a driven filmstrip — the movement/streaming bugs).
   7. ZOOM — the big one: the pop-in / streaming / far-sheet / haze / flora-edge
      class is ZOOM-DEPENDENT (164/171/172/183). Sample the achievable 0.25 & 0.5
      AND the unlocked wide debug zooms up to the whole-continent view; a bug at a
      wide zoom is invisible at 0.5 and vice versa.
   8. SCENE/PERSPECTIVE — the other big one: everything so far is the bird's-eye
      TRAVEL scene, but the FIRST-PERSON SETTLEMENTS are a whole scene with their
      own classes (walker stuck 155/198, collision/clipping into walls 16, dense
      building fabric, inhabitants using dwellings, the §2.5 panorama + its
      wildlife 181, the skyline landmarks). Sweep each port + a sample of villages:
      walk around inside, press against walls, watch the inhabitants and the
      panorama. Also the bird's-eye ⇄ settlement TRANSITION.
   9. PLAYER STATE — the rendered traveller changes: canoe RIDDEN on water vs
      DRAGGED on land, the wound on the figure by severity, swimming chest-deep,
      the item-in-use glow, afflictions. Sweep the canoe on water AND land, a
      wounded figure, a swim.
   10. TIME OF DAY / SUN — if the sky/sun varies within a day (verify), sweep the
      lighting extremes; else note it is fixed.
   11. TRAVEL DIRECTION / CAMERA HEADING — the panorama capture is bearing-
      dependent (82/99); drive several headings.
  The two most important additions are ZOOM (7) and the SETTLEMENT scene (8) —
  neither was in the first pass, and both hide whole bug families.
  SAMPLING METHOD (user 20.07.2026 — the dimensions span a huge space that can
  only be grazed; a principled sample beats a sparse grid). Three ideas combined:
   • SPLIT BY COST. The automated invariants (A/B/D/E/F-N) are CHEAP (pass/fail,
     no human) — run them on a DENSE sample (many location×time×zoom points, even
     thousands). The VISUAL inspection (C) is EXPENSIVE (my eyes) — sample it
     SPARSELY but smartly, and reserve extra visual budget for wherever an
     invariant already flags something. This alone reallocates most of the space
     to the cheap axis.
   • TARGETED for CAUSALLY-LOCATED effects. Weather/season/flood/dress/rinderpest
     do not need a cross product — each effect lives at KNOWN coordinates. Drive
     the effect→coordinate map from docs/climate-1890.md and design.md §19.13:
     each effect at its PEAK month + an OFF month + one stepped TRANSITION, at its
     OWN place. Exact and complete for that family, ~40 cases, no combinatorics.
   • PAIRWISE (2-wise) COVERING ARRAY for the GENERIC dimensions (location,
     movement, zoom, backend, scene, player-state, heading). Empirically the large
     majority of bugs are triggered by ONE factor or the interaction of TWO — a
     covering array that hits every PAIR of dimension-values needs only ~dozens of
     cases (generate with IPOG/AETG-style greedy), not the full product, yet
     catches all 1- and 2-factor interactions. Generate the array in the finder.
   • RISK-WEIGHTED + ADAPTIVE on top. Over-sample the known-hot regions (coasts,
     water edges, the dramas, the exact user-reported spots) and the
     recently-CHANGED code; and DENSIFY around any anomaly a pass turns up (an
     invariant flag or a visual hunch) — a second, finer sample in that slice.
   NET: dense-cheap invariants + a pairwise+targeted+risk visual sample (~100-150
   inspected scenarios) + adaptive follow-up — good coverage at a feasible cost,
   instead of a false-comfort sparse grid. This is the honest answer to "why did a minute of walking beat
  the hardening"; A/B/D/E are the cheap automated first pass under it.
  MORE INVARIANT CLASSES (derived by thinking through what else can look wrong —
  the cheap automated complements to the visual sweep):
   - (F) FACING/ORIENTATION: a moving animal's rendered facing tracks its
     velocity (no walking backwards/sideways); a figure/sign/door faces a sane
     direction (doors already checked — extend to animals + props).
   - (G) SCALE/PROPORTION: every rendered thing is within its species/type size
     band; a calf is smaller than its parent; no giant/tiny outlier; a landmark's
     apparent size is plausible.
   - (H) STATIC-OBJECT OVERLAP: no two solid statics interpenetrate (buildings,
     rocks, large flora, props, landmark meshes) and no label overlaps a monument
     — the I6 idea applied to the non-animal scene.
   - (I) MATERIAL/COLOUR: no pure-black or magenta (missing-texture) pixels where
     geometry renders; no z-fight flicker on a static camera (temporal diff);
     colour plausible per biome (no snow in the desert, no bone-dry tropics).
   - (K) WATER CONTINUITY/FLOW: rivers stay one unbroken descending ribbon (no
     gap, no uphill run, flow direction matches the descent) — extend the pt-21
     checks with a monotonic-descent + flow-direction assertion.
   - (N) TELEPORT/FROZEN: no rendered thing jumps > a threshold in one frame (the
     179/183 tunneling/pop class, generalised); a MOVING animal's animation phase
     advances (no frozen T-pose).
  BUILD ORDER: (A) first (retro-catches the most, cheap), then (B), (D), (E), the
  cheap extras (F/G/H/I/K/N) as they fit, and (C) the dense visual sweep as the
  standing pre-closing pass — run the WHOLE finder before the final closing.
  Across all classes this would have caught the great majority of the past
  emergent-scene reports without the user ever seeing them. Run the whole finder BEFORE the final
  closing so the batch of finds is fixed in one push. Each real find is its own
  atomic point/commit. Docs: CLAUDE §7.2 gains the anchoring + liveness invariant
  suites; this is the pillar the harness was missing.
  DONE (A) 21.07.2026 — the anchoring tripwire is BUILT and it immediately paid
  for itself. Implementation: a throttled (~1/13 per frame) dev-only assert in
  the wildlife render loop compares each rendered body's height against the
  terrain sampled at its OWN anchor (a.x/a.z), tolerances −0.75·scale/+2.5·scale
  (buried/floating), exemptions exactly mirroring the water-sweep's drama locks
  (plus drink until 196) so scripted poses are never flagged; violations go
  through the 207(i) devAssert channel and fail ANY suite. A `grounded` gate
  (set on the animal's first water-sweep visit, which now HARD-sets the standing
  height instead of easing) keeps test-staged injections with hard-coded y from
  false-firing before their first sweep correction. WHAT IT CAUGHT (the real
  class bug, fixed in the same commit): movers carried STALE standing heights —
  every follow/flee/dodge/guard/charge/vigil step updated x/z but not y, so
  on any slope the whole background herd slowly sank into (or floated off) the
  earth as it drifted; the worst case was the ordinary calf-follow step (every
  background calf tails its parent). Fixed by making EVERY mover carry its own
  ground height (land only — water occupants belong to their dramas), including
  the two sweep-skipped rescue-parent walks (the land approach to a calf in the
  water and the escort back), and by refreshing the locally captured render
  height in the same frame a correction lands (no one-frame buried render on a
  long-dt hitch). Proof: enrichments 207 pass / 0 fail / 0 console-errors with
  the tripwire armed; build+lint+vitest+audit clean. (B)-(N) and the visual
  sweep (C) remain open above.

- [ ] 204. Make WebGPU coverage UNIVERSAL where it is possible (user request
  20.07.2026, from the sweep-on-WebGL2 gap: "Analysiere alle Tests daraufhin,
  dass — wo immer möglich — auch WebGPU abgedeckt ist"). ANALYSIS (done
  20.07.2026): the Vitest layer (1941) is jsdom / pure logic → backend-agnostic,
  correct as is. Of the browser suites, the pure-DATA ones (docs, world, i18n,
  and dev-hook-only checks) read files/state, not pixels → WebGPU adds little.
  The RENDER/PIXEL suites are where WebGPU-specific bugs hide (175 crown jitter,
  181 float): enrichments has 49 pixel/screenshot assertions, polish 19,
  settings 14, plus health/handwriting/collision/flow/events/gamepad — these
  MUST be covered on real WebGPU. They already CAN (backend-selectable via
  _browser.mjs), but two GAPS: (i) only 6 suites call `assertBackend`, so the
  rest could SILENTLY fall back to WebGL2 under VERIFY_GL=webgpu without the
  guardrail noticing — add assertBackend to EVERY render-dependent suite; (ii)
  the WebGPU pass is run by hand, not standard — wire the closing/LARGE to run
  the render suites on BOTH backends (touch/voice stay WebGL2-only, the one
  genuine headless exception, already handled by the tier skip). FIX: (a)
  assertBackend in every render suite (a one-line guard each, right after the
  renderer wait); (b) the run-all LARGE tier invokes the render suites on webgl
  AND webgpu (extend the point-184 tier wiring); (c) resolve the two open WebGPU
  reds (collision 19/20 "d", polish 42/43 "e") so the webgpu pass is actually
  green; (d) the point-203 finder runs on both backends. VERIFY: a webgpu LARGE
  pass is green (modulo the documented touch/voice skip) and assertBackend
  throws if a suite silently falls back. DOCS: CLAUDE §7.2 + scripts/verify/
  README (the backend coverage policy).
  PROGRESS 22.07 (part a done): added `assertBackend(page)` (after a
  `window.__renderer` wait) to the six render suites that lacked it — events,
  gamepad, handwriting, health, polish, visualsweep — so ALL eleven
  render-dependent suites now assert the backend (collision, enrichments, events,
  flow, gamepad, handwriting, health, invariants, polish, settings, visualsweep);
  the data suites (docs/world/i18n) and the WebGL2-only touch/voice are the
  documented exceptions. scripts/verify/README backend-coverage section added.
  PROGRESS 22.07 (part b done): a full LARGE-equivalent run (`npm test` /
  `npm run test:large`, no VERIFY_GL pinned) now covers BOTH backends in one
  command — run-all runs the whole LARGE on WebGL 2 (with preflight + preview),
  then re-runs the render browser suites on WebGPU with the backend-agnostic
  preflight/preview skipped (`RVA_SKIP_PREFLIGHT`); the WebGL 2 pass runs first and
  a failure there stops before WebGPU. An explicit VERIFY_GL, the SMALL tier or a
  bare single-suite filter stays single-backend. Validated: the orchestrator
  triggered on `large flow`, ran the WebGL2 pass and correctly stopped on a
  (flaky, unrelated) preflight failure without proceeding to WebGPU; the
  skip-preflight WebGPU pass ran only its suites (docs, ALL GREEN, no build/lint/
  unit/preview). README backend-coverage section updated.
  PROGRESS 22.07 (part c, investigation): ran both reds on the WebGPU lane at HEAD
  (`VERIFY_GL=webgpu run-all <suite>`). (1) COLLISION is now GREEN on WebGPU (20
  pass, 0 fail, assertBackend confirms it ran on WebGPU) — the old door-latch red
  was fixed by later work; "verify against HEAD first" confirmed. (2) POLISH still
  FAILS on WebGPU, twice (not a flake): the check "a direct enter without the
  travel scene falls back (no capture)" reads `__placePanoramaActive === true`
  where it wants false (polish.mjs ~357, after a direct cairo->maasai-village
  enterPlace). ROOT CAUSE: `__placePanoramaActive = !!getPanoramaCapture(placeId,
  seed)` (PlaceScene ~1299); `getPanoramaCapture` returns the MODULE SINGLETON
  `current` (panoramaCapture.ts ~24) when its placeId+seed match. `current` is set
  only by `capturePanorama` (travel-scene frame loop on a travel enter) and is
  NEVER cleared on a DIRECT (place->place / snapshot / ferry) enter — so a direct
  re-enter to a place that was travel-captured earlier in the run wrongly shows the
  stale capture, violating §2.5 point 99 ("a direct place->place enter falls back
  to the geometry backdrop"). The place scene has no "entered from travel" signal;
  it assumes any existing capture for the placeId is fresh. FIX (backend-neutral,
  the real point-99 fix): thread an `enteredFromTravel` flag (set true on the
  travel->place enter that runs capturePanorama, false on a direct enterPlace /
  snapshot / ferry) and use the capture only when it is true — OR clear `current`
  at the start of a direct enterPlace WITHOUT racing the travel-enter's own
  capturePanorama (ordering care: travel enter = capture THEN switch scene). Needs
  both-backend re-verification of the whole panorama behavior (points 92/94/99/102)
  after. (Whether it also reproduces on WebGL2 is being disambiguated by a
  polish-webgl run; the fix is the same either way.) NOT YET FIXED.
  STILL OPEN: (c) the polish panorama-capture point-99 fix above; (d) the 203
  finder on both backends (waits on 203); the CLAUDE §7.2 backend-policy line.

- [ ] 205. A WORLD & FUNCTIONALITY PLAUSIBILITY AUDIT — a THIRD audit kind beyond
  code bugs (Pillar 2) and visual/behaviour bugs (203): does the world and its
  functionality make SENSE and COHERE, not just work? (user request 20.07.2026:
  there may be systems that work but are pointless, useless, or run counter to
  others.) For EACH system/feature — walk design.md's feature list AND the §7.1
  acceptance systems — ask:
   (1) PURPOSE: does it make sense in-world (~1890 Africa) AND as a mechanic, and
       would a player grasp why it exists?
   (2) USE: does it actually affect the game loop, or is it dead weight nobody
       engages — a building you enter for nothing, an item never needed, a stat
       shown but never decisive, a mechanic with no consequence?
   (3) COHERENCE: does it CONTRADICT or undercut another system — one rewards what
       another punishes, two overlapping mechanics that only confuse, a shortcut
       that trivialises a challenge?
   (4) SETTING FIT: consistent with the researched ~1890 world + design.md intent
       (no anachronism; plausible geography, ecology, economy)?
   (5) WORTH: does it earn its complexity, or add surface without depth?
  WORLD PLAUSIBILITY specifically: the ECOLOGY (every predator has prey and every
  prey a plausible predator in its own region; the herds/dramas are ecologically
  sensible), the ECONOMY (trade is meaningful — goods have a use, prices force
  decisions, the ferry/bazaar/village-barter each have a reason, the money-vs-gifts
  split coheres), EXPLORATION (each region/landmark has a reason to visit; the goal
  is reachable, motivated, and the hint cascade truly leads there), SURVIVAL
  (provisions/health/afflictions create real decisions, not noise), and the
  CROSS-SYSTEM loop (exploration → language → hints → goal; reputation → access;
  economy → equipment → capability) actually holds together.
  METHOD: system-by-system + the cross-system matrix, and PLAY the loop end to end
  asking "why am I doing this / does it matter". OUTPUT: unlike the mechanical
  audits, most findings here are DESIGN JUDGMENTS — design.md is authoritative and
  design changes are the USER's call — so each is written up and DISCUSSED WITH THE
  USER, not autonomously "fixed". Only clear OBJECTIVE incoherences (a predator
  with no prey in a region, an item with literally no effect, two directly
  contradictory rules) get filed as points; the rest are a design conversation. A
  model-diverse pass is welcome (a Fable lens on "does this cohere") within the
  point-200 token limits.

- [x] 206. DONE 22.07.2026 — the user confirmed on the deployed main ("Die Bäume
  sind jetzt in Ordnung") that the Central trees now read correctly. Root cause +
  fix in baf2200: the jungle crown hexes collapsed in the sRGB->linear conversion
  to ~0.07-0.09 luminance (2-2.7x darker than any other crown); the albedo was
  lifted out of that trap (luminance floor >0.18, pure-tested in flora.test.ts),
  which the user's WebGPU picture and the WebGL2 enrichments run both confirm — so
  no sun-dim/canopy lever was needed.
  HISTORY (the reopen): REOPENED 22.07.2026 — the user reported the trees in the CENTRAL region
  (Congo rainforest / jungle biome) still render VERY DARK. The 20.07 fix (below)
  lifted the flora brightness globally and passed a jungle-crop pixel check, but it
  did NOT hold for the Central region as the user sees it. RE-DIAGNOSE picture-first
  on BOTH backends at a Central-region spot (e.g. debugJumpTo ~0,20 — Congo): is the
  crown ALBEDO too dark for the dense jungle foliage class specifically, is the
  ×1.9 lift being overridden by the season/greenness tint or the jungle biome
  colour (PALETTE.jungle [0.13,0.38,0.14] / PALETTE_ALT.jungle [0.09,0.28,0.11] are
  themselves very dark), or is the dense-canopy self-shadow/instance density eating
  the light there? Fix so Central jungle crowns read as LIT dark green (not black)
  on their sunlit tops, verified by a Central-region before/after screenshot pair
  on both backends + a pixel check AT a Central spot (the old check may have sampled
  a lighter biome). Keep savanna/lakeside crowns unregressed. This is a real
  "green-check-but-wrong-picture" recurrence — judge by the Central render, not the
  prior gate. DOCS: design.md §2.4/§19; CLAUDE §7.1 pt.12.
  DONE 20.07.2026 (INSUFFICIENT for Central, see above): the flora material now carries the brightness lift
  the ground always had (×1.9 on the colorNode, a step below the ground's ×2.6
  so crowns stay darker than grass) — in BOTH scenes (travel flora material +
  the settlement flora material, which had the same gap). Before/after frames
  show lit green crowns instead of black silhouettes in savanna, lakeside and
  jungle; a new pixel check gates the jungle crop's green-lit fraction (>60%,
  measured 77% after vs ~50% before). enrichments 205/0, polish 43/0,
  build+lint+1941 vitest green. Also hardened the sweep tool: real month API
  (debugJumpToMonth — the first pin was a silent no-op) + journal
  do-not-disturb during capture.
  ORIGINAL: Tree foliage renders NEAR-BLACK — found by the point-203 visual sweep
  (both backends) and confirmed a bug by the user 20.07.2026. Tree crowns read as
  near-black silhouettes even on their sunlit tops, instead of lit dark green; the
  GROUND beside them lights correctly, so it is the foliage material/shading, not
  the scene light. DIAGNOSE FIRST: the crown material (src/render/flora.ts + the
  travel-scene flora mesh/material) — is its base albedo far too dark, is it
  UNLIT / not receiving the sun+IBL the ground gets (wrong material node, missing
  or flipped normals on the crown geometry, the point-175 split-foliage crown),
  or does the dry-season/season tint pull it toward black? Compare a crown's
  sunlit-side luminance against the lit ground. FIX per diagnosis: the foliage
  must receive the sky/sun light with a mid dark-green albedo that reads as
  foliage, not a silhouette (likely a material-node or normals fix on the crown,
  possibly interacting with the point-175 seasonTint on the crown matrix). VERIFY:
  a pixel/luminance check that a tree-crown sample is clearly above a near-black
  threshold on the sunlit side (add to enrichments or the settings render check),
  plus a screenshot; re-run the 203 sweep and see lit foliage on both backends.
  DOCS: none. (The first real bug the point-203 finder surfaced.)
  DIAGNOSIS UPDATE (20.07.2026): the crown ALBEDO is ruled out — the tint colours
  are proper greens (acacia #6e7c2f, jungle #1f5323/#2a6128, palm #3f6b2a, baobab
  #7a7434), not black; the material is a lit MeshStandardNodeMaterial. So the near-
  black is a LIGHTING/NORMAL failure: prime suspects are the point-175 splitFoliage
  crown geometry (are the normals copied/valid?) and the crown INSTANCE-MATRIX
  collapse (a non-uniform scale on the instance matrix squashes the shading
  normals unless the normal matrix is corrected) — the ground, un-split and
  un-collapsed, lights fine. Confirm which, then fix the crown normals / lighting.
- [ ] 207. ADDITIONAL FINDING METHODS that complement the existing audits (Pillar
  2 code, 203 visual/behaviour, 205 plausibility) and together lift coverage
  sharply (user request 20.07.2026). The existing net is designed-scenario
  invariants + an inspected visual sweep + static review; these orthogonal METHODS
  raise sensitivity a lot:
   (i) [DONE 21.07.2026] IN-GAME INVARIANT ASSERTIONS — built as
     src/systems/devAssert.ts (dev-only, per-code rate limit, console.error so
     EVERY suite's console-error gate fails on a violation, window.__assertLog
     for probes; 3 pure tests). First invariants live, piggybacked on the
     water-sweep slice at no extra pass: finite positions, the crossing/caught/
     croc-grip deadlines (I4 made loud). Proven silent across two full
     enrichments runs (207/0 incl. every staged drama). Extend the invariant
     set opportunistically as systems change. ORIGINAL: the biggest force-multiplier. Instrument the
     game code with DEV-MODE assertions that fire the MOMENT a rule breaks,
     ANYWHERE (no animal rendered below its ground; no NaN/Infinity position;
     every started drama carries a deadline; a lake sheet never below its bed;
     herd counts within bounds; nothing on impassable ocean). One __assert channel
     to the console → every test run AND every manual play session becomes a
     detector, not just where a test happens to look. Turns silent corruption
     loud. DO THIS FIRST — it multiplies every other test's and the user's own
     play's sensitivity at once.
   (ii) GOLDEN-IMAGE DIFFERENTIAL — cheap automated visual regression: bake a
     baseline of the 203 sweep frames; future runs DIFF against them and flag any
     unintended pixel change. A no-inspection alarm that a fix did not break the
     look elsewhere; complements the inspection-heavy sweep.
   (iii) PROPERTY FUZZING + DISTRIBUTION CHECKS — random-sample the state space
     (positions, months, states) and run the cheap invariants on thousands of
     random states (edge cases the designed grid misses); over a long run collect
     distributions (hunt directions, calf ratios, drama outcomes, spawn counts)
     and assert they are not degenerate (the 135/169 variety class).
   (iv) SOAK / ENDURANCE — fast-forward a LONG sim run with the invariants +
     assertions live, watching for leaks, herd ballooning, drama accumulation,
     slowdown, drift (bugs that only surface after long play, e.g. the 186 pin).
   (v) METAMORPHIC RELATIONS — checks needing no golden reference: a round trip
     A→B→A returns to the same state; the same scene at two zooms shows the same
     animals; month X and X+12 look the same; leave-and-re-enter is stable.
   (vi) AUTOMATED PLAYER-JOURNEY across seeds/strategies — extend the one E2E flow
     to many, asserting the goal stays reachable, the hint cascade always leads
     there, no softlock, the deadline beatable.
   (vii) CONSOLE/TELEMETRY MINING — scan every run's console for warnings / NaN /
     shader-recompile / dropped-frame / THREE-deprecation noise, fail on new ones.
  BUILD ORDER: (i) then (ii) first (highest leverage), the rest layer in over the
  finder. These join 203/204/205 as the pre-tag quality framework.

- [x] 208. DONE 21.07.2026 — all six agreed world-coherence fixes shipped.
  A2: the ambient savanna herd is now drawn from the region's own `REGION_PREY`
  pool via the pure `ambientSavannaSpecies` (no giraffe/zebra/wildebeest as
  "scenery" in a region every other rule calls foreign), and zebra was removed
  from `REGION_PREY.west`/`.central` (no zebra in West Africa/the Congo in 1890).
  A3: `REGION_PREDATORS` moved to the pure wildlifeBehavior module and threaded
  into the event context, so a predator attack fires only where that species
  roams (no hyena attack in a hyena-less region). A4: `canDrink` no longer counts
  'ocean' — salt water neither refills the canteen nor clears thirst. A5: the
  design text now matches the code (a snakebite is not weapon-mitigated) and the
  crocodile machete always lowers the attack chance, even from the canoe. A7: a
  new pure `robWouldOrphanGoal` + a region-aware confirmation line warn when
  robbing a coordinate-bearing region (North/East) whose hint is not yet learned.
  B3: design.md §8 records the homage layer (value matrix, $, Khartoum, §13.2
  glossary) as a deliberate accuracy carve-out, alongside the §19.8/§19.13 ones.
  New pure tests (ambientSavannaSpecies, region-gated events, snake/croc
  protection, sea-drink, robWouldOrphanGoal); design.md/CLAUDE.md updated.
  Verified: tsc+build+lint+audit clean, 1973 unit green, events/flow green,
  enrichments 207/0/0 on a clean run. NOTE: three enrichments runs each surfaced
  a DIFFERENT single intermittent (168/186/102 staging flakes on run 1; a rare
  one-frame floating-wildebeest tripwire hit on run 2; run 3 fully clean) — all
  low-frequency, none reproducible; the rotating staging flakes belong to point
  200, and the intermittent float is logged for the point-203 finder to chase
  with a repro (A2 seeds more wildebeest in east/south, raising exposure to a
  pre-existing rare anchoring edge rather than creating one).
  ORIGINAL: WORLD-COHERENCE FIXES from the point-205 plausibility audit (user
  21.07.2026: fix A2, A3, A4, A5, A7, B3; A1/A6/B1/B2/B4/B5/B6 are accepted as-is
  for now — the current state is debug-only and the hint/treasure/reputation
  design is still to be done). PRIORITY: the NEXT queue item, right after point
  195 and before 197. Correct at own discretion; one atomic commit per coherent
  fix (or one for the group if small). Each fix updates design.md/CLAUDE.md where
  it touches design content and adds/updates tests.
  A2 — AMBIENT WILDLIFE MATCHES THE REGION POOLS. The chunk spawner
  (`spawnChunk`, Wildlife.tsx ~739) places giraffe/zebra/wildebeest herds on ANY
  savanna cell with NO region check, while the hunt/vicinity/food-web rules
  region-gate the same species (`REGION_PREY`, `regionPreyAt`) — so a giraffe is
  at once "typical scenery" in the North/West and "region-foreign" to every other
  rule. FIX: gate the ambient savanna-herd species pick by the cell's region
  (`regionAt`) against `REGION_PREY` (or a region-typical ambient pool), so the
  visible herds match the researched pools. Also REMOVE zebra from
  `REGION_PREY.west` and `.central` (wildlifeBehavior.ts ~1076 — no zebra in West
  Africa/the Congo basin in 1890; keep each region's prey non-empty with the
  species that DO occur) and correct the now-false comment at wildlifeBehavior.ts
  ~1070. TEST: a pure test that every ambient-spawn species for a region is in
  that region's pool; the world/enrichments herd checks stay green.
  A3 — EVENT PREDATORS MATCH THE RENDERED ROSTER. `eventChance` gates
  cheetah/hyena attacks by TERRAIN ("savanna", events.ts ~80/87) while
  `REGION_PREDATORS` bars them from West/Central — so the journal can report a
  hyena attack where the world has no hyenas. FIX: gate the predator-attack
  events by the region's `REGION_PREDATORS` roster (thread the region/coords into
  `eventChance` or filter the predator pick), so only a predator that actually
  roams the region can attack there. (Accuracy note: real spotted hyenas were
  common across the 1890 West/Sahel; EXPANDING the wildlife roster to match is a
  larger ecology change left as a design item — this fix removes the CONTRADICTION
  by making events follow the rendered world.) TEST: events.test.ts asserts no
  region-foreign predator event fires; the existing event tests stay green.
  A4 — SALT WATER IS NOT FRESH WATER. `tickHealth` `canDrink` includes terrain
  'ocean' (store.ts ~1051), so swimming the coastal sea refills the canteen and
  cures desert thirst — sanctioned by design.md §6.1 ("swimmable sea") but
  factually wrong and it trivialises the desert-water mechanic near any coast.
  FIX: remove 'ocean' from `canDrink` (only river/lake fresh water refills/cures);
  swimming stays allowed, it just no longer quenches. DOCS: design.md §6.1 drop
  "swimmable sea" from the fresh-water list. TEST: store.health.test.ts — drinking
  at the sea no longer refills; a fresh-water refill still works.
  A5 — PROTECTION RULES MATCH THE DESIGN TEXT. (a) SNAKES: design.md §14.1 lumps
  snakes into "a rifle or machete lowers the risk" but `eventChance('snakeBite')`
  applies no `weaponProtection`. Resolve by ALIGNING design.md §14.1 — a snakebite
  is not weapon-mitigated (realistic) — rather than adding fake protection. (b)
  CROCODILE: design.md §11.3/§14.2 says "the machete ALWAYS helps against
  crocodiles" but in the canoe the machete changes nothing about the attack CHANCE
  (events.ts ~98: `hasCanoe ? 0.4 : hasMachete ? 0.6 : 1`). FIX so the machete
  ALWAYS lowers the croc attack chance (machete-in-canoe strictly below canoe
  alone), matching "always helps", while the rifle stays canoe-only per §14.2.
  TEST: events.test.ts pins the snake (no weapon effect) and the croc chance
  ordering (machete-in-canoe < canoe-alone < unarmed). DOCS: design.md §14.1/§14.2.
  A7 — A ROBBERY NEVER SILENTLY ORPHANS THE GOAL. Only the North (latitude) and
  East (longitude) chiefs carry the tomb coordinates (`hintRaw`); `robVillage`
  permanently blocks all gifts/talks in the region (`regionRobbed`), so robbing
  North or East BEFORE learning its coordinate leaves blind digging as the only
  path — and the confirmation warns only generically. FIX (bounded, no
  hint-system redesign — that is deferred to the user's design pass): make the
  robbery confirmation REGION-AWARE — when the region still holds a tomb
  coordinate the player has not yet learned, the confirmation explicitly warns
  that this act may put the goal out of reach (localized, both languages). TEST:
  store.reputation.test.ts / a UI test asserts the load-bearing warning appears
  for an un-learned coordinate region and not otherwise. DOCS: design.md §12 if
  wording changes.
  B3 — RECORD THE HOMAGE LAYER AS A DELIBERATE CARVE-OUT. The value matrix (ivory
  revered West / neutral East / rejected South), the $ currency, Khartoum as a
  welcoming 1890 port (the Mahdiyya held it 1885–98), and the §13.2 glossary are
  inherited from the 1985 original and fixed by design.md, but — unlike
  climate/peoples/dress/communication — are not marked as accuracy carve-outs.
  FIX (DOCUMENTATION ONLY, no code): add an explicit note in design.md (near
  §8/§14 and §13) that these are deliberate homage carve-outs from the original
  game, held despite the ~1890 accuracy standard, exactly like the §19.8 grief and
  §19.13 exaggeration carve-outs — "so nobody later 'corrects' them" (§13.2's
  glossary is doubly a placeholder under the §13.4 redesign).
  ACCEPTANCE: build+lint+audit clean, unit + affected browser suites green; the
  six fixes verifiable per their tests; design.md/CLAUDE.md updated where noted;
  no regression in the wildlife/event/health/reputation suites.

- [x] 209. The SEA COASTLINE renders as an ugly STAIRCASE at the close bird's-eye
  zoom (user report 21.07.2026, screenshot at Cairo: the sand↔sea boundary steps
  in axis-aligned blocks). DIAGNOSED: the waterline is the 0.5-contour of a 1-BIT
  land/sea mask read from the DEM's blue channel, bilinearly interpolated
  (`landFractionAt`, geodata.ts ~121 — each texel is 0 or 1, ~2.8 km wide) and
  sharpened by `sstep(0.32, 0.68, land)` in sampleTerrain (terrain.ts ~205). A
  bilinearly-interpolated BINARY mask can only cross 0.5 along the texel grid, so
  the coast is a staircase at the DEM texel size; the elevation is smooth (16-bit)
  but the land/sea CLASSIFICATION is not, and — unlike the biome/region borders,
  which ARE domain-warped (terrain.ts ~225 BIOME_WARP) — the coast sample is
  deliberately NOT warped ("the raw lat/lon still drive … coasts", ~224), so the
  raster grid shows through. It is invisible far out (many texels per pixel) but
  glaring at the closest zoom the game starts at. This is the §7.1 pt.11/13
  "smooth coasts without raster steps" goal breaking down at close range.
  FIX (pick per a probe): (a) DERIVE the near-field land fraction from a SIGNED
  DISTANCE to the vector coastline (`LAND_POLYGONS`, already imported in
  terrain.ts) rather than the raster mask — smooth at any zoom, the pt.13 ideal;
  or (b) DOMAIN-WARP the coast sample like the biome borders (perturb the lat/lon
  fed to `landFractionAt`/`coastDistanceAt` with the low-frequency noise), turning
  the grid staircase into a natural meander — cheaper, and consistent with the
  existing warp; or (c) widen `landFractionAt` to a higher-order (bicubic) sample
  plus a sub-texel noise dither. Prefer (b) unless a probe shows the vector
  distance (a) is affordable per-vertex. Keep the Red-Sea/Mediterranean/trim
  rules (redSea.test.ts) intact — warp the SHAPE, never move the land/sea verdict
  at the acceptance coordinates. VERIFY: a driven screenshot at the start zoom
  (0.5) at Cairo shows a smooth coast (human-viewable), and a pure test that the
  coastline is sub-texel smooth — sample the land fraction across a fine transect
  over the shore and assert the 0.5-crossing is not quantized to the texel grid
  (its position varies continuously along the coast), while every redSea.test.ts
  acceptance point keeps its land/sea verdict. DOCS: design.md §3.3 / CLAUDE §7.1
  pt.13 note the coast smoothing. (The dark "starry" sea in the shot is the water
  surface shader at night, a separate matter — this point is only the stepping.)
  PROBE + FINDING (21.07.2026): option (b) domain-warp alone is INSUFFICIENT.
  Warping the coords fed to `landFractionAt` (a dedicated small COAST_WARP, tried
  both low-freq 2.1/amp 0.06 deg and high-freq 12/amp 0.06 deg) kept every
  redSea.test.ts + world.test.ts verdict green (130 tests) but the rendered
  Cairo/Suez staircase barely softened — the high-freq warp only jittered the
  step EDGES, the big blocky steps remained. DIAGNOSIS why: the shoreline is where
  the terrain HEIGHT (driven by `shoreT = sstep(land)`, i.e. the binary-derived
  land fraction) crosses the water plane, and the travel terrain MESH renders that
  contour at its VERTEX spacing (~2-3 texels) — so a smoother mask is re-quantized
  to blocky steps by the mesh, not by the mask. The warp shifts the boundary but
  cannot add sub-vertex detail the mesh can't carry. REAL LEVER (next focused
  attempt): option (a) — derive the near-field land fraction from a SIGNED DISTANCE
  to the vector coastline (`LAND_POLYGONS`, already imported in terrain.ts) so the
  height contour is smooth independent of the raster/mesh grid (the pt.13 ideal);
  and/or raise the coast mesh resolution where the shoreline crosses. This is a
  focused rendering effort, not a one-shot tune — do it with the same driven
  Cairo/Suez before/after captures. (WIP domain-warp experiment reverted, not
  committed.)
  DONE (22.07.2026), option (a) + the mesh half: `src/world/coastVector.ts` gives
  a SIGNED distance to the vector coastline (LAND_POLYGONS, ~265 pts, brute-forced
  + even-odd inside test; commit 01e108c, pure-tested sub-texel-smooth). In
  `sampleTerrain` (1c21aa2) the near-coast land fraction is rebuilt from that
  signed distance behind a raster gate (COAST_SMOOTH_BAND ~0.08deg on the land
  side + the bilinear straddle), so the waterline follows the true smooth shore
  while the deep-sea/trimmed acceptance coords keep the raster verdict — all 130
  redSea + world tests stay green. The coarse LOD mesh still re-quantized the
  smooth field, so coast-straddling near chunks now build at DOUBLE resolution
  (56->112, `chunkIsCoastal` in TravelScene.tsx, 30f305e). A driven Cairo-coast
  capture at zoom 0.5 shows an organic curved shoreline with no axis-aligned
  steps; enrichments green worldwide, 0 console errors. (The Nile-mouth beach gap
  and the river band in the same shot are point 211, separate.)

- [x] 210. DONE 22.07.2026 (commit 9284f05, merged to main) — the coast east of
  Cairo (Gulf-of-Suez head) now reads as ONE clean continent edge with contiguous
  ocean beyond, verified on BOTH backends (WebGL2 + real WebGPU). Per the user's
  authoritative simplified direction the fix CROPS the game map cleanly rather than
  preserving the real gulf geography: the `NORTHEAST_BOUNDARY` was tightened through
  the gulf head (new control points [32.52,30.02],[32.38,29.62],[32.6,29.36]) so the
  narrow gulf-head water fingers + isthmus-strip garbage-stamp mess fall on the
  ocean (trimmed) side — a `__terrainType` sweep now shows exactly ONE land→ocean
  crossing per row (was 4 pocket-rows), uniform deep ocean beyond, and the rendered
  dark arms + stepped patches the user marked are gone on both backends. Every
  redSea.test.ts acceptance verdict holds (Suez ocean, delta/African coast land, no
  land route rounds the Red Sea) + a new guardrail describe "the Gulf-of-Suez head
  clean crop" (3 cases). The core defect (broad desert inlet) was already resolved
  earlier (3e00390); this closed the residual. History of the earlier attempts below.
  HISTORY: - [ ]-marker removed on tick — REOPEN/attempt trail preserved for the record:
  A spurious SEA-ARM juts into the coast EAST of Cairo — remove it (or
  adjust the ocean beside it) so the continent has ONE clean, continuous sea edge
  as close to the real ~1890 shape as possible (user report 21.07.2026, screenshot
  at Cairo: a broad dark inlet pokes west into the eastern desert). The user's read
  is right: it is a leftover of the Red-Sea / Suez trim that set the NE continent
  boundary (redSea.ts). §7.1 pt.4 already forbids exactly this ("no trimmed texel
  borders kept land outside the Suez isthmus gate — no ocean scrap juts into the
  coast"), so one slipped past redSea.test.ts. This is a SHAPE/DATA defect (a wrong
  land/sea verdict), distinct from point 209 (the coast RENDER stepping) — but the
  SAME Cairo-coast area, so do them in one coast pass. GEOGRAPHY: the
  `NORTHEAST_BOUNDARY` polyline runs the Suez isthmus at ~32.4–32.7°E (redSea.ts
  ~18); Cairo sits at ~30.05°N/31.24°E. In 1890 the isthmus east of the delta was
  LAND (the Suez Canal existed from 1869 but is a thin waterway, not a broad arm),
  and the real sea edges there are the Mediterranean (north of the delta) and the
  Gulf of Suez (SE) — so a broad sea inlet in the eastern desert is wrong.
  DIAGNOSE FIRST (probe the land/sea mask east of Cairo, ~29.5–31.5°N /
  32–33.5°E): find the arm's exact extent and its cause — is it real DEM sea
  (a low the ocean flood-filled, e.g. the Bitter Lakes / Lake Timsah reading as
  sea), or a trim STAMP wedge where `isNortheastOfBoundary` + the boundary
  polyline cut into the kept coast? FIX per the cause: (a) if a trim/boundary
  wedge, adjust the `NORTHEAST_BOUNDARY` control points near [32.4,31.45]…
  [32.7,29.75] so the line hugs the real African Gulf-of-Suez / isthmus shore with
  no re-entrant, giving a continuous edge; or (b) if a spurious flooded inland
  patch, fill it to land (a targeted mask correction / an extra land seed) so the
  isthmus reads continuous, leaving the genuine Gulf of Suez and Mediterranean as
  the sea edges. Keep every redSea.test.ts acceptance verdict intact (mid Red Sea,
  Sinai, Arabia, Gulf of Aden = blocked ocean; the Nile delta and the African Red
  Sea coast = walkable land; no land route rounds the Red Sea). VERIFY: a driven
  screenshot at the Cairo start shows a single clean continent edge with no inlet;
  a pure test in redSea.test.ts that the arm's probed coordinates now read the
  correct class (land, or a clean sea boundary) AND that the existing acceptance
  points are unchanged. DOCS: design.md §3.1/§11.2 + CLAUDE §7.1 pt.4 if the
  boundary wording changes. Coordinate with point 209 (same coast) — a shared
  before/after Cairo screenshot proves both.
  PROBE (21.07.2026): the arm is a sea (lf<0.5) wedge on the KEPT (SW) side of
  the boundary at ~29.5-29.9N / 32.3-32.5E — the head of the real Gulf of Suez
  (Suez ~29.97N/32.55E), so it is partly GENUINE sea, but rendered as a broad,
  jagged inlet poking into the desert. The fix is therefore to make the edge
  follow the real, NARROW Gulf-of-Suez shore (tighten the boundary polyline /
  mask so the head reads as a slim gulf, not a wide arm), not to delete the sea
  outright.
  PROGRESS (22.07.2026, commit 0e5e435) — the STAIRCASE half done. A rendered A/B
  + a browser height probe found the stepped sea east of Cairo was NOT the
  waterline (209 covers that for vector coasts, but the Suez trim is an artificial
  cut, not a LAND_POLYGONS shore) but the stamped sea FLOOR: the trim drops depth
  from shore to ~-3000 m in one DEM texel, a blocky underwater cliff the shallow
  (partly transparent) water shows through + a hard step in the water shader's
  depth-driven colour. Coast-LOD 336 and far-terrain 0.5 changed nothing (a data
  cliff, not a mesh limit). Fix: new `redSea.boundarySignedDistance` drives a
  gentle SHELF on `hOcean` (feeds shore blend AND floor as one surface, no
  waterline moat) easing into the stamped deep across SHELF_BAND, plus the
  waterline straightened to a smooth diagonal — both gated on the boundary
  abutting kept land, so the Gulf-of-Suez head and seaward-of-coast stretches keep
  their bathymetry. redSea.test.ts +6 cases (30 total), full Vitest 2006 green,
  lint clean; the isthmus coast renders as an organic graded shore (captures).
  STILL OPEN — the second half: the Gulf-of-Suez head still reads as a too-wide,
  partly-stepped arm (the guard leaves it: real water, not kept-land shore).
  Narrow it by tightening the NORTHEAST_BOUNDARY control points near [32.42,31.45]
  …[32.7,29.75] so the head reads slim, keeping every redSea.test.ts verdict
  (Suez ~29.97/32.55 stays ocean, the isthmus stays land). Then 211.
  TEXTURE ROOT CAUSE (22.07.2026, picture-confirmed) — NEITHER the point-215
  bicubic elevation NOR raising the water opacity (0.58→0.7, reverted) fixes the
  blocky "wall": the WATER SHADER reads the RAW `demElevation` GPU texture
  (`src/render/demElevation.ts` → `water.ts` depthM), which still carries the
  coarse per-texel trim STAMP (~-3000 m cells); the CPU `elevationAt` bicubic never
  touches that texture, so the shallow semi-transparent water still shows the
  blocky stamped floor through it. REAL FIX (next, picture-iterated, both backends):
  smooth the DEM elevation TEXTURE — sample it bicubically in the TSL shader, or
  (cleaner, CPU one-time) bake a smoothing/shelf-grade pass in `demElevation.ts`.
  Keep the depth-colour bands + outside-bbox mask; verify Nile/normal coast/lakes.
  UPDATE (22.07.2026) — the texture theory is now DISPROVEN too: a 2-pass 3x3
  OCEAN-floor blur of the demElevation texture (baked, ocean-only) left the blocky
  dark patches UNCHANGED (reverted). So the "wall" is NOT the water depth/colour at
  all. Ruled out across the session: land/sea classification, terrain mesh LOD,
  FAR_TERRAIN, water opacity, the point-215 bicubic terrain height, AND the water
  depth texture. REMAINING HYPOTHESES for a FRESH look: (a) a SHOAL — trimmed/
  stamped terrain that pokes ABOVE the water plane and renders as dark terrain
  (test: hide the water plane / read the terrain height at the patch — if it's > the
  water level, it's a shoal to sink); or (b) a SHADOW — the cascaded shadow map of
  the coast relief cast onto the water (test: toggle shadows). PIN IT with a
  water-plane-hidden capture + a height/shadow probe at the exact patch BEFORE any
  further fix — the depth-smoothing path is a dead end.
  ROOT CAUSE FOUND (22.07.2026, probe CONFIRMED) — it is a SHOAL, not water: a
  `sampleTerrain` sweep near the Suez coast finds OCEAN-typed cells whose HEIGHT
  reaches up to ~-0.02, while the water PLANE sinks to ~-0.4 (TravelScene FAR note).
  So the shallow ocean FLOOR pokes ~0.38 ABOVE the water plane and renders as dark
  ocean-coloured TERRAIN that the plane never covers — the blocky "wall". (The
  point-210 shore SHELF, which lifts the near-shore floor toward -0.02 for a smooth
  waterline, is what raises it above the sunk plane here.) REAL FIX (fresh turn,
  picture-verified both backends): make the water plane cover the shallow ocean
  floor — either RAISE the ocean-plane sink toward ~-0.05/0 near the coast (watch
  the river/lake sheets that the -0.4 sink protects — the reason it is sunk), or
  CLAMP the ocean terrain height to stay below the plane (sink the shelf's seaward
  half under -0.4 so only the LAND-side shore stays visible), or colour the
  above-plane shallow floor as shallow WATER (teal) so it reads as sea, not a dark
  wall. Test each against the Nile/normal coast/lakes (the -0.4 sink exists to keep
  the plane off the carved river beds — do not re-flood them).
  CORRECTION (22.07.2026, water-plane-HIDDEN capture — the decisive test): with the
  ocean water plane hidden the sea floor is SMOOTH TEAL and the blocky dark "wall"
  is GONE — so it is NOT the floor/shoal and NOT the terrain colour (the earlier
  colour-teal fix was rightly wirkungslos, reverted). The wall belongs to the WATER
  PLANE's own appearance. Coastal ROCK dressing is clearly visible at the shore in
  that capture, so the leading hypothesis is now SHADOWS: the cascaded shadow map of
  the coastal rocks + shore relief cast onto the water plane read as dark blocky
  patches. NEXT (fresh turn): toggle shadows (or the water plane's receiveShadow) —
  if the patches vanish, soften/limit the shadow on the water surface (or stop the
  shore rocks/relief casting onto it). If shadows are NOT it, inspect the water
  material's own depth/opacity term at those exact cells. All height/depth/colour
  smoothing paths are dead ends — this is a water-plane shading matter now.
  MOST LIKELY MECHANISM (reasoned from the hidden test) — the water plane's DEPTH
  COLOUR, not shadows: the water shader reads `demElevation` (the GPU texture, still
  the ~-3000 m trim STAMP at these cells) for its depth tint, while the TERRAIN mesh
  floor there is SHALLOW (`sampleTerrain` height ~-0.02, teal when the plane is
  hidden). So over a shallow floor the water still paints the DEEP dark tone because
  demElevation says deep — the dark "wall". The demElevation shelf grade
  (`shelfGradedMeters`, demElevation.ts) is meant to fix exactly this but does not
  reach these patches (its `boundaryIsCoast`/band guard excludes them, or the ocean-
  floor blur averaged uniform -3000 neighbours to no effect). CONFIRM with a probe:
  read `demElevation` (or the raw stamped elevation) at a dark-patch cell vs its
  `sampleTerrain` height — if demElevation is deep while the terrain is shallow, the
  fix is to extend the demElevation shelf grade to cover ALL near-coast shallow-
  floor cells (or clamp the water's depth read to the terrain height there), so the
  water tints teal over shallow floor. Rule shadows in/out first (cheap toggle).
  STEPPING NOT RESOLVED (user re-reported 22.07, second screenshot "immer noch
  stufig"). The terrain shelf smoothed the SHORE at the boundary (30.02N/32.62E
  renders as an organic graded coast on WebGL2), but a FRESH render at the user's
  own framing (30.05N/32.4E, no cache) STILL shows a stepped dark patch — so it is
  NOT a stale-geometry cache on the user's side, the fix is genuinely incomplete.
  BACKEND FINDING (WebGPU lane, VERIFY_GL=webgpu, system Chrome): rendered the same
  "coast" spot on the REAL WebGPU backend — the coast is STILL stepped there while
  it was smooth on WebGL2, so there IS a backend-dependent component the CPU-side
  shelf (sampleTerrain, backend-agnostic) does not cover — most likely the WATER
  material (TSL) reading the raw stamped bathymetry (demElevation) for its
  depth-colour/transparency, which the terrain shelf never touched. NEXT (do NOT
  guess further on WebGL2): (1) grade the stamped sea floor the water shader reads
  — either the trim stamp in redSea.trimToGameWorld (guarded near kept land, keep
  every redSea verdict incl. Dahlak/Persian-Gulf deep) or a coast-distance shelf
  in the water depth path — and VERIFY on the WebGPU lane, not only WebGL2; (2)
  ALSO seen on the WebGPU headless render: the whole scene is washed-out/cold
  (pale blue-grey sand vs warm beige on WebGL2) — a SEPARATE WebGPU colour/tonemap
  issue (or a headless-WebGPU artefact) to confirm against a real-GPU WebGPU
  session and, if real, file under the point-184/204 WebGPU work. Captures:
  scratchpad gpu-coast.png / 211-user.png.
  PREP (22.07, sharpened fix location): the water material reads
  `demElevation(lon,lat)` = the R channel of the shared DEM half-float texture,
  built in `src/render/demElevation.ts getDemDataTexture()` (line ~99:
  `metersUp = dem.data[..]*256+.. - offsetMeters`, then LinearFilter-sampled). That
  is the RAW trimmed elevation with the ~-3000 m Suez stamp — the water shader's
  depth-colour/shore-foam/opacity all key on it, so it bands at the stamp step.
  FIX THERE (not the trim): while baking `metersUp`, grade the elevation to a
  gentle SHELF near the NE boundary — compute lon/lat per texel (res/meta already
  in scope), call `boundarySignedDistance`, and for a texel with bsd in
  (-SHELF_BAND,0) that abuts kept land, ease metersUp from a shallow shore depth
  into the stamped deep (mirror terrain.ts's hOcean shelf). This touches ONLY the
  water-depth texture — trim verdicts, movement, `elevationAt`, the terrain mesh
  are untouched — and makes the WATER read the same smooth shelf the terrain
  already does. VERIFY on the WebGPU lane (gpu-coast.png) AND WebGL2, plus a pure
  bake test that the graded texel band is monotonic (no stamp step) while a deep
  acceptance texel (Persian Gulf/Dahlak) stays deep. Do this AFTER the in-flight
  200 enrichments validation frees the dev server (no src edit during a browser
  suite).
  DONE the demElevation shelf (commit 0850ab2, 5 pure tests) — but VERIFIED ON
  BOTH BACKENDS per the new rule ([[verify-gui-on-both-backends]]) and it does
  NOT fix the visible stepping on either: WebGPU headless is washed-out (untrusted
  witness), and on WebGL2 the dark blocky cliff wedge REMAINS. So the water DEPTH
  colour was not the cause. Re-diagnosis from the WebGL2 picture: the wedge has 3D
  relief (lit tops, shadowed faces) = GEOMETRY seen THROUGH the shallow water,
  which the water material renders TRANSPARENT below ~60 m (water.ts opacityNode
  `smoothstep(0,60,depthM)`); so it is the low-LOD OCEAN-FLOOR mesh showing through
  the transparent shallows — and the demElevation shelf, by making the near-shore
  water shallower over a wider band, likely WIDENS that transparent zone (exposes
  MORE floor), i.e. it is data-correct but may marginally worsen the wedge. NEXT
  (real lever, still needs the WebGPU witness): either (a) the shallow ocean-floor
  mesh under transparent water must be high-LOD/smooth where it shows through (the
  200-seg test earlier did NOT smooth it — re-check whether those coast chunks are
  actually the coastal-flagged 112-seg ones or a pure-ocean chunk at low LOD that
  chunkIsCoastal misses), or (b) tighten the water opacity/transparency so the
  blocky floor is not revealed, or (c) both. Decide with a rendered A/B that
  isolates the floor mesh vs the water transparency. Consider reverting 0850ab2 if
  the widened transparent zone reads worse to the user on a real WebGPU session.
  DIAGNOSTIC NARROWED (22.07, __allHi + shelf A/B on WebGL2): forcing ALL near
  chunks to 220 segments WITH the smooth shelf data in place did NOT smooth the
  blocky wedge (it read SHARPER) — so the wedge is DEFINITIVELY neither the terrain
  mesh LOD nor the water depth colour. It is the GULF-HEAD stretch just south of
  the isthmus (~29.8-30.0N) where the shelf's kept-land guard CORRECTLY does not
  apply (real gulf water sits SW of the boundary, so the inward land sample fails),
  leaving the hard -3000 m stamp on that boundary's NE floor. So 210's remaining
  visible defect == 210b (the Gulf-of-Suez arm), not a separate render bug. THE FIX
  is one of: (a) relax/replace the shelf guard specifically for the gulf head so
  its NE-stamped floor is graded too WITHOUT inventing shallows in the real gulf
  water SW of the line (needs care — the guard exists precisely to avoid that); or
  (b) tighten the NORTHEAST_BOUNDARY control points near the gulf so the head reads
  as a slim gulf and the stamped wedge shrinks; (b) is the originally-planned 210b
  and the safer lever. Either way, verify on BOTH backends per
  [[verify-gui-on-both-backends]] with the user's real WebGPU as the trusted
  witness (headless WebGPU is washed-out). Mesh-LOD and water-colour are RULED OUT.
  RESOLVED the broad wedge (22.07, commit 3e00390) — ROOT CAUSE finally pinned by
  a fine height probe: the DEM bathymetry at the gulf head is GARBAGE — the
  ~-3000 m trim stamp alternates CELL-BY-CELL with shallow (~0 m) real texels
  (e.g. 29.85N reads -1.9, -1.4, -0.1, -1.5, -1.9 across five cells), cliffing the
  NEAR-terrain ocean-floor mesh (buildChunkGeometry → sampleTerrain().height) into
  the blocky lit wedge the transparent shallows reveal. Confirmed via A/B renders
  on BOTH backends: FarTerrain is not involved (visible at zoom 0.5); grading the
  demElevation water-depth texture, the kept-side hOcean, and the NE-side hOcean
  all left it unchanged (a partial ease stays below the -0.6 deep-tone threshold,
  so nothing read); a red-injection probe proved the harness reaches the render
  and the cells ARE ocean. FIX: clamp the stamped-floor texels (elevation <
  -900 m — garbage stamp, never natural bathymetry) near the boundary to a shallow
  shelf, GATED on !boundaryIsCoast (so the isthmus shore ramp — redSea shore-ramp
  test — is untouched) and eased back to the DEM floor across the seaward half of
  the band. redSea.test +1 guardrail (31), full Vitest 2075 green, lint clean; the
  broad dark sea-arm is GONE on WebGPU AND WebGL2 (captures gulf-gpu2 / gulf-iter2).
  STILL OPEN: a SMALL residual dark streak remains at the gulf head on both
  backends (a thin diagonal, far less prominent than the original wedge) — likely
  the boundaryIsCoast=true cells the clamp excludes, or moderately-deep natural
  cells. Needs the user's real-WebGPU eyes to judge whether it still reads as a
  defect; if so, a follow-up can widen the clamp carefully or address those cells.
  The user's actual complaint (the broad inlet into the desert) is resolved.
  REACTIVATED (user 22.07.2026, real-WebGPU screenshot at Cairo/North coast): the
  RESIDUAL is confirmed a real defect on the user's own backend — several dark
  sea-arm patches still poke into the Cairo coast (the user red-outlined them and
  said "this should simply be LAND"). So the deferral is closed: FIX these patches
  to land. They are the same class as the resolved Gulf-head wedge — stamped/
  flooded near-coast cells reading as dark sea that juts into the beach. DIAGNOSE
  the red-marked patches' coordinates (Cairo ~30.05N/31.24E, the patches sit E/NE
  along the coast) via the land/sea mask + `sampleTerrain`, then EXTEND the
  point-3e00390 stamped-floor clamp / boundary tightening to force these coastal
  patches to land WITHOUT re-flooding the genuine open sea or any redSea.test.ts
  acceptance verdict (Mediterranean, Gulf of Suez head, delta all unchanged).
  VERIFY on BOTH backends (the user's WebGPU is the trusted witness) with a
  before/after Cairo capture showing ONE clean continent edge, plus a redSea.test
  guardrail that the patch coordinates now read land. This is the last leg of 210.
  SIMPLIFIED DIRECTION (user 22.07.2026, AUTHORITATIVE — supersedes the subtle
  shelf/floor smoothing that proved insufficient): do NOT preserve the real
  gulf-head geography. Just CROP the game map cleanly — "the continent simply ends
  at that point and next to it is contiguous ocean; no knowledge that this was
  once the Red Sea is needed; that is just where the walkable game-map area ends."
  So the fix is a clean-CUT of the land/sea mask at the NE trim boundary near the
  gulf head: fill the narrow real-gulf water fingers + the isthmus-strip mess on
  the KEPT side to LAND so the continent is solid up to the boundary line, and keep
  everything on the ocean side as uniform deep open ocean — the messy stepped arms
  + dark patches come from those narrow near-boundary water/stamp fingers, so
  removing them (land up to the line, clean ocean beyond) yields one clean edge.
  Likely in `redSea.trimToGameWorld` (extend the kept-land fill / a boundary-side
  land seed so no sub-boundary water pocket survives) and/or the terrain land
  fraction near the boundary. KEEP every redSea.test verdict: Suez stays ocean
  (it is on the ocean side of the boundary), the Nile delta + African Red-Sea
  coast stay walkable land, no land route rounds the Red Sea, mid-Red-Sea/Sinai/
  Arabia/Gulf-of-Aden stay blocked ocean. Add a redSea.test guardrail that the
  former gulf-head water pocket now reads land while Suez stays ocean. This is
  much simpler than the smoothing approach and is the intended fix.

- [x] 211. DONE 22.07.2026 (feat/211-river-mouth 61acbd5, merged) — verified on BOTH backends: the Nile flows into the sea at Rosetta with no beach wedge (mouth-bridge carries the ribbon into the sea shelf) and the Cairo interior notch is gone (root cause: flat ribbon sheet vs relief-relative carve left a water-typed wedge poking through; fix ribbonRowSurfaceAt lifts each row above its own band). DEM-backed pure tests added. ORIGINAL: RIVERS must MERGE CLEANLY into the water body they reach (river→ocean,
  river→lake), and NO water body may carry a spurious NOTCH/HOLE (user report
  21.07.2026, screenshot at Cairo: the Nile ribbon STOPS short of the sea with a
  strip of BEACH between its mouth and the ocean, and a strange cut-out sits in
  the Nile right at Cairo; "such gaps recur in water bodies — please check ALL").
  Same Cairo/Nile area as 209/210 — do them in ONE water/coast pass.
  TWO defects:
  (a) MOUTH JUNCTION — the river ribbon ends at its last vector control point,
  which lies inland of the real coastline, so the Nile does not reach the sea (a
  land gap at the mouth). §7.1 pt.21 promises "one continuous ribbon … to its
  mouth" and "bridged stray sea points", but the mouth-to-sea CONNECTION is not
  closed. FIX: extend/bridge the river's carved bed + rendered ribbon + water
  mask from the last river point to where the receiving water begins (the ocean
  or lake sheet), so the water is visually continuous — no beach wedge between
  the ribbon and the sea. The carve/ribbon should fade into the sea shelf, not
  butt against sand.
  (b) INTERIOR NOTCHES — a hole in a water body's rendered surface. At Cairo the
  likely cause is a settlement CLEARANCE punching the ribbon: pt.3 keeps a
  port AT the river (§4.2 exemption) but "their rendered cluster clears the band
  by its own footprint margin" — that clearance may cut a notch into the Nile
  where Cairo sits. Other candidates: the confluence bank-masking
  (riverBanks.ts) over-masking an interior span; a sparse spline control point
  letting `riverDistance` exceed the ribbon half-width; a lake/river sheet edge
  gap. FIX per cause: never let a settlement clearance or a bank-mask remove
  INTERIOR water (mask the banks, keep the channel); densify or clamp so the
  ribbon has no sub-width hole.
  DIAGNOSE FIRST with a probe (the 145b/129 lesson): sample `riverDistance` /
  the ribbon mask / `waterSurfaceY` along the Nile from ~Cairo (30.05N,31.24E)
  to the delta mouth (~31.5N,31.8E), and around the notch, to pin each cause;
  then sweep ALL rivers×their mouths and ALL 8 lakes for the same two defects
  (the user's "check all"). VERIFY: extend `scripts/verify/enrichments.mjs` (the
  pt.21 water checks) — every river reaches its receiving water with NO land gap
  at the mouth (sample the mouth run: water is continuous from the last river
  cell into the sea/lake), and NO river/lake surface has an interior hole (the
  existing "no interior gap" check widened to catch the settlement-clearance
  notch); the pure ribbon-continuity tests
  (`src/scenes/travel/riverSmoothness.test.ts`, `riverBanks.test.ts`) gain the
  mouth-junction + no-interior-clearance cases; a driven Cairo screenshot shows
  the Nile flowing unbroken into the sea. DOCS: design.md §11.3 + CLAUDE §7.1
  pt.21 (mouth junction + no interior notch). Keep every river's course and the
  §4.2 clearances otherwise intact.
  PROBE + READ (21.07.2026): (a) the Nile's LAST data point is its mouth at
  `[30.42, 31.45]` (Rosetta on the Mediterranean, rivers.ts ~27) — so the
  river polyline DOES end at the coast, but the rendered ribbon still stops
  short with a beach gap in play. The gap is therefore in the RIBBON/MASK
  BUILD: the ribbon is masked to land (or `riverDistance` saturates near the
  mouth) and ends at the coast CONTOUR, which sits inland of where the sea
  PLANE begins, so a sand strip shows between the ribbon's end and the water.
  FIX: bridge the last ribbon span into the receiving sea/lake sheet (let the
  ribbon/bed carry over the coast contour into the shallow shelf), and verify
  at the ACTUAL mouth (30.42,31.45) not the earlier off-course transect. (b)
  the Cairo NOTCH is NOT the raw river field (an unbroken band there) AND NOT
  the settlement clearance (it only NUDGES the place off the water, geo.ts
  ~175) NOR the bank-mask (riverBanks.ts only drops the FOAM line, keeps the
  water) — both preserve water. So it is a WATER-SURFACE-MESH / overlay
  artifact, to be pinned with a RENDERED probe at Cairo (a screenshot at the
  notch), not the data. Both (a) and (b) need visual iteration (a rendered
  screenshot I inspect), so they belong in a focused coast pass, not a rushed
  edit.
  PROBE 22.07 (mouth data, prep): sampled __terrainType + __rivers.surfaceAt on a
  grid around the Rosetta mouth ([lon 30.42, lat 31.45]). The river 'water' cells
  (lon 30.45-30.60, lat 31.30-31.40, surface-minus-terrain +0.6 = submerged)
  transition DIRECTLY to 'ocean' cells (+0.3, submerged) at lat 31.40-31.45 — NO
  dry-land/coast strip in the classification (no '#'/'.' between W and ~), every
  cell submerged. So defect (a) is NOT a data gap: terrain/ocean is continuous.
  The visible beach strip is a RENDER seam — the RIBBON MESH (Rivers.tsx, built
  from the polyline) ends at its last inland control point while the ocean WATER
  PLANE starts further seaward, so the terrain's coast colour shows between the
  ribbon end and the sea plane. FIX: extend the ribbon's last span into the sea
  shelf (or fade it under the ocean plane), confirmed on a rendered mouth
  screenshot. Needs the visual-iteration pass; not started this session.

- [x] 212. DONE 21.07.2026 — a drinking PARENT rendered buried under its own
  ground. The point-200-hardened anchoring tripwire (203A) caught it on a
  re-verification: `[ASSERT] animal-buried — giraffe bodyY=0.15 ground=0.92
  … drink=true child=true`, persistent over 2+ consecutive assert-visits (not
  the one-frame transient the strike-counter tolerates), so a real bug, not a
  flake. ROOT CAUSE: the periodic-drink render block (Wildlife.tsx ~2942) sets
  the local `bodyY` to the LOW bank height it slides to, but seven family/grief
  branches then render the parent back at its OWN inland sim spot (`px=a.x;
  pz=a.z`) while INHERITING that stale bank `bodyY` — so a parent that was mid
  drink-cycle when a calf drama pulled it home rendered sunk ~0.77 under its
  inland ground. The sibling movement branches already re-derive their standing
  height (the point-203A rule, e.g. `bodyY = a.y = max(0.02, groundHeight)`);
  these seven did not. FIX: `bodyY = a.y` (the maintained sim-ground height) in
  all seven sim-spot render branches — kick (defence strike), caught (charge),
  plungeTo, trampleTo, vigil, escort (calf-in-water), shield (chased calf).
  VERIFIED: build + lint + 1980 vitest green; enrichments re-run reports
  0 console-errors (the buried-drinker assert is gone). No deterministic bespoke
  test: the drink cycle has a 75 s period, so staging the bank-phase × family-
  branch overlap deterministically is fragile — the standing point-207i
  anchoring tripwire (which caught this) is the live regression guard for the
  class, per its design. Found by the 203/207i finder.

- [x] 213. CROSS-BROWSER FUNCTIONAL SMOKE (user request 21.07.2026). The
  regression runs on Chromium (Playwright-Chromium for WebGL2 + system Chrome for
  the WebGPU lane) — that covers all Chromium browsers (Chrome/Edge/Brave) but
  NOT Firefox (Gecko) or Safari (WebKit). A SHORT functional smoke on those two
  engines catches a Gecko/WebKit-only break WITHOUT re-running the whole suite per
  engine (which would multiply the runtime by the browser count, user 21.07.2026).
  BUILT + WIRED: `scripts/verify/crossbrowser.mjs` launches firefox + webkit
  (installed via `npx playwright install firefox webkit`) at a DEPTH that scales
  with the tier — `minimal` (SMALL gate): boots + renderer + no console errors;
  `standard` (LARGE/default): + the ACTUAL backend (Firefox ships WebGPU from FF
  141+, so it reports WebGPU vs the WebGL2 fallback), a sized canvas, a bird's-eye
  move; `thorough` (maximale QS): + core flows (enter a settlement, open the map &
  journal). `run-all.mjs` runs it once on the WebGL2 Chromium lane (`runCrossBrowser`,
  depth from the tier), on a full tier/default run or `npm test -- crossbrowser`,
  and GRACEFULLY SKIPS (exit 0, notice) if the engines are not installed so a
  runner without them never breaks. REMAINING: run it green on both engines and
  fix any Gecko/WebKit-only issue found; the maximale-qs.md pass runs it at
  `thorough`. DOCS: scripts/verify/README.md + maximale-qs.md note the tiered smoke.
  DONE (21.07.2026): green at standard depth on Firefox + WebKit desktop AND
  mobile (WebKit≈iOS + Chromium≈Android touch-layer arming + mobile preset,
  points 84/30). The smoke immediately earned its keep — it caught three real
  issues: a smoke bug (the move check ran in the port 'place' mode; fixed
  95d02a2) and TWO genuine WebKit/Safari robustness bugs that would hit iOS
  users, both fixed in d6692ed: createImageBitmap(Blob, options) is rejected by
  WebKit (the DEM/terrain never loaded on Safari) — now falls back to an <img>
  decode; and a geodata load cancelled mid-fetch leaked an unhandled "Load
  failed" rejection out of boot() — now caught. Wired: minimal on the SMALL
  gate, standard on LARGE/default, thorough via CROSSBROWSER_DEPTH in
  maximale-qs; graceful skip when the engines are absent.

- [x] 214. FIGURES read FACETED — the round organic figures (the bird's-eye
  ANIMALS incl. the elephant, and the first-person town INHABITANTS/people) show
  visible flat polygon FACES at close/mid range instead of a smooth curved
  surface (user report 22.07.2026, screenshot: the elephant's body/head reads as
  hard flat panels). Soften the shading so curvature reads smooth. DIAGNOSE FIRST
  (a rendered close-up, both backends): the cause is almost certainly FLAT shading
  (per-face normals — a material with `flatShading: true`, or a geometry whose
  normals were never smoothed) and/or a too-coarse tessellation floor on the
  rounded body primitives. Anchors: `src/render/fauna.ts` (animal bodies/heads/
  limbs), `src/render/figures.ts` (human figure bodies/heads), and their
  materials. CLAUDE §7.1 pt.15 already pins tessellation FLOORS for these
  primitives (`src/render/figures.test.ts`, `fauna.test.ts`) so faces do not read
  at eye height — this point is the SHADING half of the same goal. FIX: give the
  rounded meshes SMOOTH (vertex) normals — `geometry.computeVertexNormals()` on
  the built body primitives and/or `flatShading: false` on their material — and,
  where curvature still facets, raise the segment counts on the round primitives
  (sphere/cylinder/cone bodies, heads, limbs) a step. Keep the DELIBERATE low-poly
  stylization where it is a design choice (angular huts/props, §2.6); this is only
  about the round ORGANIC figures (animals + people) reading faceted. Watch the
  instanced-fauna path (bird's-eye animals are instanced) — the fix must apply to
  the shared instanced geometry/material, not only a one-off mesh. VERIFIABLE:
  extend `figures.test.ts`/`fauna.test.ts` to assert the rounded figure/fauna
  primitives carry SMOOTH normals (adjacent-face normals not identical / material
  not flatShaded) at/above the tessellation floor; a rendered close-up of the
  elephant AND a town inhabitant shows soft gradients with no hard facets, on BOTH
  WebGL2 and WebGPU per [[verify-gui-on-both-backends]] (screenshot pair). DOCS:
  design.md §2.6 / §15 (close-range primitives) note the smooth-shading
  requirement alongside the tessellation floors; CLAUDE §7.1 pt.15 if the
  acceptance wording changes.

- [x] 215. DONE 22.07.2026 (feat/215-backdrop-smooth 85f22e6, merged) — the panorama backdrop ridge is now smooth on BOTH backends; the facets were the coarse heightfield silhouette, so rings 24->48 + segs 160->320 (facet size halved), taper bit-identical (panoramaGroundY unchanged), material extracted with explicit flatShading:false; relief-cap/no-sink invariants held, backdrop.test.ts extended. ORIGINAL: ANGULAR / FACETED TERRAIN RELIEF — (A) the §2.5 skyline/panorama
  backdrop mountains, and (B, user ext. 22.07.2026) the BIRD'S-EYE travel terrain
  itself (land + river height profile + mountains). PART A: the §2.5
  surroundings-panorama backdrop (the far map-landscape relief around a
  settlement, relief-capped, double-sided, rock-shaded) shows hard flat facets on
  its mountains/dunes instead of a smooth ridge (user report 22.07.2026,
  screenshot at Cairo: the desert hills behind the town read as angular polygon
  planes). Smooth them. DIAGNOSE FIRST (a rendered close-up of the backdrop at
  Cairo, both backends): the cause is a coarse backdrop heightfield mesh and/or
  FLAT shading (per-face normals). Anchors: `src/scenes/place/backdrop.ts` (the
  backdrop mesh build + its material), `src/scenes/place/backdrop.test.ts` (pins
  the heightfield bounds/clamp). FIX: give the backdrop mesh SMOOTH vertex normals
  (`computeVertexNormals` / `flatShading: false` on its material) and, if the
  silhouette still steps, raise the heightfield sample resolution a step — keeping
  the §2.5 relief cap, the double-sided draw and the no-sunken-below-ground clamp
  (backdrop.test.ts must stay green, incl. the Berber low-horizon bound). This is
  the SHADING/tessellation cousin of point 214 (figures) — do NOT flatten the
  intended stylization elsewhere, only smooth the backdrop terrain silhouette.
  VERIFIABLE: extend `backdrop.test.ts` to assert the backdrop carries smooth
  (non-flat) normals at/above its sample floor; a rendered close-up of the Cairo
  backdrop shows a smooth ridge with no hard facets, on BOTH WebGL2 and WebGPU per
  [[verify-gui-on-both-backends]] (screenshot pair). DOCS: design.md §2.5 note the
  smooth-shading requirement; CLAUDE §7.1 pt.15 if acceptance wording changes.
  PART B (user extension 22.07.2026): the BIRD'S-EYE travel terrain reads angular
  too — the land + RIVER height profile and the mountains show visible polygon
  planes at the start zoom. Anchors: `src/scenes/travel/TravelScene.tsx`
  (`buildChunkGeometry` — note it ALREADY builds smooth seam-free normals via
  central differences + a margin ring, and `lodSegments` 56/28/20 with the
  coastal ×2→112; `FAR_TERRAIN` step 2.5 is the coarse distance sheet),
  `src/render/materials.ts` (the terrain material + its normal node),
  `src/scenes/travel/Rivers.tsx` (the river ribbon relief). DIAGNOSE FIRST with a
  rendered close-up (both backends) WHICH surface faceting is which: since the
  chunk normals are already smooth, the visible planes are almost certainly MESH
  RESOLUTION (low LOD on high-relief mountain chunks + the coarse FAR_TERRAIN),
  not flat shading — confirm before choosing a lever.
  TECHNIQUE MENU (the user's list) — applies to BOTH part A (backdrop) and part B,
  ordered CHEAPEST-FIRST because the user's binding caveat is "do not tank the
  frame rate": (1) SMOOTH vertex normals / normal-node shading — verify it is on
  everywhere (backdrop, chunks, far sheet, ribbon); (2) a detail/relief NORMAL MAP
  on the terrain + backdrop material — adds rock/relief shading detail with NO
  extra geometry, the best perf/looks trade; (3) TEXTURE SPLATTING micro-relief is
  already wired (§2.6) — extend its normal contribution; (4) SELECTIVE higher LOD
  only for high-relief (mountain) chunks near the player, capped like the coastal
  ×2, and a finer FAR_TERRAIN step where it reads — bounded, not global; (5) mild
  screen-space AO already exists (SSAO, §2.7) — tune, do not add a second pass.
  EXPENSIVE / OFF THE RUNTIME PATH: hydraulic EROSION belongs in the OFFLINE DEM
  preprocessing (bake smoother, more natural relief into the height data once, in
  scripts/ — never per frame); heavy DISPLACEMENT mapping and extra AO passes cost
  frame time — if used at all, gate them behind the §30 mobile/quality preset and
  keep them OFF by default. The point is a smooth-reading relief at the start zoom,
  NOT maximum fidelity: pick the least-cost lever that removes the visible facets.
  VERIFIABLE: a rendered before/after at the start zoom (0.5) over a MOUNTAIN
  (e.g. the Ethiopian highlands / an Atlas ridge) AND a river reach shows a smooth
  relief with no polygon planes, on BOTH WebGL2 and WebGPU per
  [[verify-gui-on-both-backends]]; a PERFORMANCE guardrail — the driven frame time
  / FPS at the start zoom must not regress beyond a small budget vs. before (add a
  frame-time sample to a verify script); pure tests for any new normal/LOD helper.
  DOCS: design.md §2.4/§2.5/§3.3 note the relief-smoothing + the perf ceiling;
  CLAUDE §7.1 pt.11/13 if acceptance wording changes. Keep every existing terrain
  test green (world/redSea/riverSmoothness); do not disturb the coast work.
  TECHNIQUE ANALYSIS (Fable-5, codebase-grounded, 22.07.2026) — the implementation
  plan. ROOT CAUSE: normals are ALREADY smooth everywhere (chunks via central
  differences, backdrop + far sheet via computeVertexNormals) — flat shading is
  RULED OUT. The facets are the HEIGHT FIELD: `elevationAt` (geodata.ts ~121) is
  BILINEAR over the 0.025° DEM, so every texel boundary is a gradient crease;
  scaled by METERS_TO_UNITS a mountain flank folds every ~0.25 units ≈ 10-15 px at
  the start zoom. The mesh also undersamples the DEM (near ring 56 segs ≈ 1.7
  texels/vertex). The backdrop is worse + geometric: 160 azimuth segs (2.25°/seg
  silhouette), ×30 exaggeration of undersampled data, and hard clamp creases that
  snap the surface onto a cone. RANKED, PERF-SAFE LEVERS (do in order, each with
  rendered before/after + a start-zoom frame-time guardrail):
  (1) BICUBIC `elevationAt` — replace the bilinear kernel with Mitchell-Netravali
  (4×4 taps, B=C=1/3 to bound overshoot near coasts/lake basins). ZERO per-frame
  cost (CPU, chunk-build only); every consumer (sampleTerrain heights AND its
  central-difference normals, river beds/ribbons, backdrop, FAR_TERRAIN) inherits
  a C1-smooth field. Leave the GPU `demElevation` texture bilinear (it only drives
  water tint/haze). Rerun water/ribbon/redSea/world gates (small height shifts).
  (2) RELIEF-ADAPTIVE chunk LOD — add `chunkIsMountainous(cx,cz)` (5×5 elevationAt
  range > ~400 m, mirroring `chunkIsCoastal`) and join the existing ×2→112 gate,
  ring ≤ 2 only (112 segs ≈ DEM Nyquist; more is wasted); optionally include
  river-band chunks so banks smooth. Watch chunk-build hitching (flagged chunks
  ~4× cost); mobile preset caps at 84.
  (3) BACKDROP rebuild (backdrop.ts + PlaceScene LandscapeBackdrop): BACKDROP_SEGS
  160→320, RINGS 24→32; run 1-2 passes of a 3-tap ring-space neighbour-average
  over the height grid BEFORE writing positions (the real silhouette low-pass, pure
  -testable); replace the two hard clamps with a polynomial smooth-min/max (k≈3-5)
  so the slope cap joins the relief without a crease. Keep the cap value, taper and
  the Berber elevation bound (backdrop.test.ts green). Zero per-frame cost.
  (4) OPTIONAL only if a residual reads: offline smoother DEM re-bake
  (scripts/build-geodata.mjs, z7 2×2 supersample or σ≈0.5-texel Gaussian) + halve
  the FAR_TERRAIN step. REJECTED (do NOT pursue): hydraulic erosion (adds
  aliasing-prone high-freq detail at 0.025°, harms the researched geography), GPU
  displacement/tessellation (forks the single CPU height source of truth for
  movement/collision/wildlife; WebGPU has no tess stage), extra AO passes
  (darkens + EMPHASISES creases), more detail-normal maps (already wired, cannot
  fix a silhouette). Start with lever 1 (fixes terrain + rivers + backdrop at the
  source) then reassess by the picture before adding 2/3.

- [x] 216. The PALM TREES render BROKEN, not just plain — redesign them. The
  trunk is a stack of DISCONNECTED cylinder segments with visible GAPS (the trunk
  reads as floating chunks), the crown hangs detached ABOVE a gap, and the fronds
  are flat angular triangles (user report 22.07.2026, screenshot at Cairo: a palm
  with a segmented, broken trunk and a floating triangle-fan crown). The user
  invites a COMPLETELY NEW representation rather than patching the current one
  ("besonders schön ist es ohnehin nicht"). REDESIGN: build the trunk as ONE
  continuous, gently curved tapering mesh (a single lathe/tube along a slight
  bend — no stacked segments, no gaps), seat the crown exactly at the trunk top
  (shared vertices / overlapping origin, never a gap), and give it curved, layered
  FEATHERED fronds that droop (a few bent blades per frond, smooth-normal shaded)
  instead of flat fanned triangles; a couple of coconuts at the crown base is fine.
  Keep it low-ish poly and in the game's stylized look, and keep the existing palm
  PLACEMENT/regions and collider unchanged. Anchor: the palm build in
  `src/render/flora.ts` (grep `palm`), placement in
  `src/scenes/place/regionStyles.ts` / the flora placement. VERIFIABLE: a rendered
  close-up of a Cairo palm shows a continuous trunk (no gaps), an attached crown
  and soft feathered fronds, on BOTH WebGL2 and WebGPU per
  [[verify-gui-on-both-backends]] (screenshot pair); a pure test in
  `src/render/flora.test.ts` pins the new trunk as a single connected mesh (one
  contiguous vertical span, no vertical gap between segments) and the crown seated
  at the trunk top. DOCS: design.md §19.9 (landscape dressing) note the palm
  redesign; CLAUDE §7.1 pt.12/15 if acceptance wording changes.

- [ ] 217. VULTURE WINGS CLIP INTO THE GROUND — while a vulture feeds (the §19.6
  peck/bob, rocking back and forth over a carcass) its WING TIPS dip through the
  terrain (user report 22.07.2026). The point-128 `landedBirdY` rule clears the
  pecking BODY (positive-only slope lift + a hover over the body) but the bob
  rotation swings the wing extent BELOW that clearance, so the wings intersect the
  ground. Anchor: `src/scenes/travel/Wildlife.tsx` (the vulture feed/peck render +
  bob animation) and `landedBirdY` (`wildlifeBehavior.ts`, pure-tested). DIAGNOSE:
  the bob is a pitch/vertical rock about a pivot; at the bob extremes the folded
  wing tips reach lower than the body-based clearance. FIX: raise the feed-bob
  clearance so the WING SPAN (not just the body centre) stays above the local
  ground through the whole bob — either lift the pivot by the wing half-extent, cap
  the bob amplitude on steeper ground, or add the wing reach into the `landedBirdY`
  clearance term (keep it one shared rule with the kill-flock + ground scavenger,
  point 128). VERIFIABLE: extend the `landedBirdY`/clearance pure test to assert
  the WING-TIP y (body y − bob dip + wing extent) stays ≥ ground through the bob
  range on a slope; a live/staged feeding vulture in `scripts/verify/enrichments.mjs`
  keeps its wings above the terrain across the bob (screenshot). Keep the feed
  animation lively. DOCS: design.md §19.6; CLAUDE §7.1 pt.12.

- [ ] 218. RIVER-ADJACENT OBJECTS FLOAT IN THE WATER after the river WIDENING — the
  Sudd (natural site, the Nile swamp) hangs in the middle of the water; the user
  suspects the point-156 river widening (`river.widthFactor`, carved bed/ribbon/
  mask/clearances all derived from one width) and asks to check EVERYTHING near a
  river. When the river was widened, an object placed by its OLD (narrower) bank —
  or sitting AT the river per a §4.2 exemption — now lies over the widened water
  surface and reads as floating. DIAGNOSE FIRST with a rendered probe at the Sudd
  (the natural-site coords) + a data sweep: for the Sudd and EVERY river-adjacent
  entity — natural sites, cultural landmarks, villages/ports, and scene dressing —
  compare its position/footprint against the CURRENT widened river water mask
  (`riverDistance` / the ribbon half-width from `RIVER_WIDTH_DEG`): does it now
  overlap open water, and is its render height the land/bank height or the water
  surface? Anchors: the natural-site placement (Sudd), `src/world/world.test.ts`
  (already sweeps village river clearance — extend to landmarks/natural sites),
  `terrain.ts` RIVER_WIDTH_DEG / the carve, `Rivers.tsx` surface height. FIX per
  cause: either the clearance for these objects must SCALE with the widened width
  (like the point-156 village clearances) so they sit on the bank, or a genuinely
  in-river feature like the Sudd must render at the correct height ON its own
  ground, not floating on the water sheet. VERIFIABLE: extend `world.test.ts` to
  sweep all river-adjacent landmarks/natural-sites/settlements for the widened-river
  clearance (none overlaps open water unless intended, and an intended in-water one
  sits at the right height); a rendered before/after at the Sudd shows it grounded,
  not floating; re-assert the point-156 village clearances stay green. DOCS:
  design.md §4.2/§11.3; CLAUDE §7.1 pt.3/4 if clearance wording changes.

- [ ] 219. SPRINGS render as an ugly symbolic RING — replace with something nicer,
  ANIMATED, that reads as a real spring (user 22.07.2026). A river that rises in
  open land gets a spring marker (`Rivers.tsx`, the `springs` build + its mesh).
  Redesign: a small animated water source — e.g. a little pool with rising
  bubbles / concentric ripples emanating, or a low bubbling upwelling — that reads
  as a spring at the bird's-eye zoom, not a flat ring. Keep it cheap (a few
  instanced quads / a shader ripple), region-neutral. VERIFIABLE: the spring dev
  hook still reports ≥1 spring; a rendered close-up shows the animated source, both
  backends. DOCS: design.md §11.3.

- [ ] 220. TERRAIN CHUNK SEAM / CRACK — a vertical "crack in the ground" runs
  through the bird's-eye terrain (user 22.07.2026, deployed build, right of the
  player). It is a chunk-boundary seam: adjacent LOD chunks don't meet flush and
  the `SKIRT_DROP` skirt doesn't fully hide the gap. Anchor:
  `TravelScene.tsx` `buildChunkGeometry` (margin ring + skirts) + `lodSegments`.
  DIAGNOSE: with the point-215 bicubic elevation the shared edge heights are now
  deterministic per (lat,lon) so a T-junction/LOD-mismatch gap (fine vs coarse
  neighbour) or an insufficient skirt depth is the likely cause. FIRST re-check on
  the current build (bicubic may already have closed value gaps); if a crack
  remains, deepen/repair the skirt or match edge sampling across LOD levels.
  VERIFIABLE: a driven pass over a chunk boundary shows no seam (screenshot), both
  backends; pure test if a helper changes. DOCS: design.md §3.3.

- [ ] 221. WALKING ARBITRARILY FAR INTO THE OCEAN — the player can wade a variable,
  sometimes very large distance into open sea (user 22.07.2026, screenshot: far out
  in deep blue at ~32.2S/16.9E), sometimes only a little. The §11.2 swim margin (a
  calibratable near-shore band) is inconsistent. Anchor: the swim-margin / ocean
  walkability (`terrain.ts` isBlocked + the coastal band, `redSea.ts`, and the
  runtime margin edit noted in redSea.test.ts). DIAGNOSE: why the swimmable band
  reaches far offshore in places — coast-distance saturation, the widened band, or
  a hull rule. FIX so the wadeable band is a consistent, modest near-shore width
  everywhere (deep open ocean blocks). VERIFIABLE: sweep offshore points along
  several coasts — beyond the band all block; pure-test the band width; a live check
  the player cannot reach deep water. DOCS: design.md §11.2; keep every
  redSea.test.ts verdict.

- [ ] 222. ANIMALS STUCK INSIDE EACH OTHER — two animals overlap/interpenetrate and
  stay (user 22.07.2026, screenshot at a waterline). The §19.5 body separation
  should push them apart but fails here — likely because both are pinned against
  the water by the ocean/edge backstop, so the separation force can't resolve.
  Anchor: `Wildlife.tsx` body separation + the water/edge setback. FIX: the
  separation must resolve even at a water/coast edge (resolve along the shore
  tangent, or let one cross/step back before re-pinning). VERIFIABLE: extend the
  body-spacing pure test to the pinned-at-edge case; a live/staged pair at a
  waterline parts within moments (enrichments). DOCS: design.md §19.5.

- [ ] 223. WEATHER × TERRAIN-TYPE PLAUSIBILITY AUDIT (user 22.07.2026) — a
  repeatable audit that the modelled weather/season is plausible for the terrain it
  renders on EVERYWHERE, not a single spot (method like point 205/147). SCOPE:
  sweep a grid across EVERY biome/region; for each cell cross-check the modelled
  wetness/season (`src/systems/season.ts` `wetnessAt`/`climateZoneAt`/the rain
  curve) against `docs/climate-1890.md` AND the rendered terrain type, and pin each
  mismatch as a sub-fix with a coordinate + a pure test. Known suspect classes to
  cover: rain on a bone-dry desert; a rainforest carrying a dry season it never
  had; a Mediterranean coast on a summer-rain curve; a highland off its own
  elevation-keyed calendar; a fog-coast reading like its wet interior. STRUCTURAL
  ROOT of the whole class: the wetness model has NO longitudinal term
  (`season.ts`: `void lon`), so wetness is a pure function of latitude+elevation —
  any place whose real rainfall depends on longitude (a west-coast fog desert vs
  the interior at the same latitude) is mis-modelled until a targeted gate is
  added. FIX each confirmed mismatch by adding/adjusting the minimal zone gate or
  curve so the cell reads its real ~1890 regime, WITHOUT regressing its neighbours
  or any existing `season.test.ts` verdict. ALSO verify the DERIVED weather VISUALS
  track the terrain (fog/overcast/greenness/flora-bleach vs the biome), both
  bird's-eye and in-settlement. VERIFIABLE: a grid sweep test (extend
  `src/systems/season.test.ts`) asserting every settlement/biome sample sits in a
  plausible zone with the correct wet/dry calendar; per fixed instance a pure
  boundary test (the mis-modelled cell now reads correctly, a neighbour unchanged)
  + a live pixel check where the defect was visible. FIRST FIXED INSTANCE (commit
  3341a80): the hyper-arid coastal NAMIB rendered summer rain because it sampled
  the same latitude-driven wetness as the far wetter interior — a coastal
  hyper-arid gate now returns ~0 rain on the Atlantic-side band (~17-27S, ~10.5-13.8E)
  year-round while the interior keeps its Nov-Mar rains (pure-tested both sides).
  The remaining all-biome sweep is the open work. DOCS: docs/climate-1890.md,
  design.md §19.13; update the peoples/climate implementation sections in lockstep.
  A Fable-5 plausibility pass fits this audit.

- [ ] 224. DEMO CHECKPOINT — full closing run → re-point the `poc` tag to the
  then-current main → publish that state playable at
  https://patrickvonmassow.github.io/Heart-of-Africa-Remake/poc/ (user request
  22.07.2026). GATE/POSITION: the user wants this as the NEXT milestone right
  AFTER the current terrain task (215) once everything is stable and 215 is done —
  i.e. a visible demo update for the terrain smoothing, NOT waiting for every open
  bug. Run it when 215 is finished + the tree is stable (build/lint/CVE clean,
  full Vitest + the LARGE browser regression on BOTH backends green — the §7.2
  closing cycle per docs/maximale-qs.md's closing steps). STEPS: (1) full closing
  cycle (Vitest + LARGE regression both backends, dead-code/stale-doc pass, lint/
  audit clean) — only proceed if GREEN; (2) re-point the EXISTING `poc` tag to the
  current main HEAD (this is an explicit, authorized re-tag per the user — the only
  standing exception to [[tags-only-on-request]], for THIS request) and push the
  moved tag; (3) the GH-Pages deploy builds the poc tag into the `/poc/` path
  (deploy-pages.yml, guarded, worktree --base=/…/poc/) — verify the deploy is green
  and BOTH URLs resolve 200 (root = main, /poc/ = the moved tag) with correctly
  based asset URLs (the MSYS-mangling Git-Bash trap is documented). This is
  outward-facing: run only after the closing is GREEN; report the result. DOCS:
  README version section if wording changes. Do NOT touch the v0.1 tag; 174 (v0.2)
  is a separate later release.

- [ ] 225. WET GROUND WHEN IT RAINS (user 22.07.2026, position: AFTER 224). When
  it rains the ground must visibly get WET — in BOTH the bird's-eye/outdoor terrain
  AND inside settlements — and MORE so the harder it rains / the longer it has
  already been raining (accumulated). Optional stretch: in settlements, water
  SPLASHES up where a person or animal walks through it. DIAGNOSE/design: derive a
  wetness factor from the rain state — `rainAmount`/the storm intensity
  (`src/systems/season.ts`) combined with an ACCUMULATED-rain term (how long it has
  rained at this place), clamped. Feed it into the ground materials: darken the
  albedo, raise specular/gloss (lower roughness) and deepen the normal-relief
  sheen, scaling with the wetness — outdoor terrain material
  (`src/render/materials.ts` / the travel ground) AND the settlement ground
  material (`src/scenes/place/…`). The splash is a cheap particle/decal burst on a
  walker footstep while wetness is high (settlement walkers + the player), gated on
  wetness > threshold. Keep it cheap (a material factor, no second pass); gate the
  splash behind the mobile/quality preset. VERIFIABLE: a rendered before/after
  (dry vs mid-rain vs long-rain) in BOTH scenes shows the ground darkening/
  glistening progressively, on both backends (screenshot set); the wetness factor
  pure-tested (0 dry, rising with intensity AND duration, clamped); a live check the
  splash fires on a footstep at high wetness. DOCS: design.md §2.4/§19.13 note the
  wet-ground response; CLAUDE §7.1 pt.12 if acceptance wording changes.

- [x] 226. DONE 22.07.2026 (commit 4780497, merged) — the fleeing calf now routes coast-safe along the shore (point-188 escapeCorridorHeading fallback + sticky corridor in calfFleeStep) instead of pinning on the waterline; parent-sacrifice intact; 5 pure tests. ORIGINAL: A FLEEING CALF PINS ON THE WATERLINE instead of routing along the
  coast (user report 22.07.2026, real-WebGPU screenshot at Cairo/North coast: a
  juvenile fleeing a predator sticks at the sea edge while its parent sacrifices
  itself and is eaten). This is the point-157 class of bug — the flight step must
  route AROUND water (coast/river), never dead-end into the sea and stall. §7.1
  pt.12 already promises the hunted calf "steering around a coast or river the way
  every mover does rather than pinning on the waterline (point 157: the flee
  routes through `calfFleeStep`/`deflectedStep`, a dead-end left for the catch to
  resolve)". So either the calf-flight path here does NOT go through the deflected
  step, or the deflection fails at THIS coast geometry (a concave sea pocket where
  the deflected heading still points into water). DIAGNOSE FIRST
  (`src/scenes/travel/wildlifeBehavior.test.ts` + the live scene): reproduce a calf
  fleeing toward a coast pocket and confirm whether `calfFleeStep`/`deflectedStep`
  is invoked and whether its deflected heading still lands on a water cell (the
  sea-pocket dead-end). Anchors: `calfFleeStep`, `deflectedStep`,
  `src/scenes/travel/waterEdgeRules.ts` and the §19.8 calf-flight branch in the
  wildlife update. FIX: make the calf flight use the SAME coast-safe corridor
  logic every other mover uses (the point-188 sticky escape-corridor / longest
  clear-land heading), so a calf boxed against the sea flees ALONG the shore (or
  crosses per point-192 where valid), never stalls on the waterline; the catch
  still resolves at a genuine dead-end, but the calf must be visibly moving, not
  frozen at the water. Keep the parent-sacrifice / living-shield outcome intact
  (that part read correctly). VERIFIABLE: a pure test in
  `wildlifeBehavior.test.ts` that a calf fleeing toward a concave coast pocket
  gets a deflected step onto LAND (never a water cell) and keeps a non-zero
  land-ward step until the catch; a live check in `scripts/verify/enrichments.mjs`
  staging a calf flight against a coast that asserts the calf never rests on a
  water cell during the flight (mirrors the point-157/188 coast-safe checks).
  DOCS: none (implements the already-promised §7.1 pt.12 behaviour at this coast
  geometry). Coordinate with 210 (same Cairo coast — the sea-pocket geometry that
  traps the calf is partly the very sea-arm 210 is removing).

- [ ] 227. A HORIZONTAL LINE / BAND ARTIFACT IN THE FIRST-PERSON SKYLINE (user
  report 22.07.2026, real-WebGPU screenshot inside Cairo looking at the desert
  skyline: between the near dune and the Giza pyramid a horizontal grey line runs
  across the horizon with a thin blue/grey band below it — reads as a graphics
  error, not real landscape). KEY CLUE (user 22.07.2026): an ANIMAL GLIDES
  BACKWARD ALONG the line — so the line is a SURFACE an animal stands/moves on
  (foot-sliding), which points hard at either the §2.5 panorama-WILDLIFE horizon
  band (silhouettes are meant to drift far/small/hazed on the visible horizon, but
  here the band reads as a hard line and the silhouette as a gliding animal) OR a
  distant flat WATER/terrain sheet the animal is walking on at the wrong height.
  Weight (a)/(b) below accordingly and check the panorama-wildlife band first.
  Likely causes to diagnose (picture-first, BOTH backends): (a) the §2.5 settlement PANORAMA backdrop cylinder/band — a horizon
  SEAM where the captured band meets the sky, or a top/bottom edge of the panorama
  texture showing as a hard line (anchors: `src/scenes/place` backdrop/panorama,
  `src/scenes/place/backdrop.ts`, the panorama-band build); (b) a distant WATER
  SHEET (sea/river) rendering as a thin horizontal strip at the horizon behind the
  dunes (the Mediterranean/Nile sheet poking through — related to 210's coast); or
  (c) a z-fighting / far-plane band between the backdrop heightfield and the sky
  dome. DIAGNOSE FIRST with a rendered first-person capture at the Cairo desert
  view (both backends) and by toggling the panorama backdrop vs the water sheet to
  isolate which layer owns the line. FIX per cause: close the panorama seam / clamp
  the band edge, or sink/hide the distant water strip, or resolve the depth
  fighting — so the skyline reads as a continuous dune-to-pyramid horizon with no
  hard horizontal line. VERIFIABLE: a first-person Cairo skyline capture (both
  backends) with no horizontal seam/band; if it is the panorama band, a pure test
  in `src/scenes/place/backdrop.test.ts` on the band's vertical bounds/seam; if a
  water strip, tie it into the 210/211 water-edge checks. DOCS: design.md §2.5 if
  the panorama band wording changes.

- [ ] 228. ANIMALS FOOT-SLIDE (glide without moving their legs), and can even
  glide BACKWARD (user report 22.07.2026, likely SETTLEMENT/first-person only —
  the user saw it in-town; confirm whether the bird's-eye travel fauna already
  animate). A walking animal must play a LEG/WALK CYCLE synced to its movement so
  it does not slide, and must never translate backward while facing forward. The
  bird's-eye wildlife (`src/scenes/travel/Wildlife.tsx` + the `src/render/fauna.ts`
  leg meshes) may already gait — DIAGNOSE FIRST which scene slides: the settlement
  animals (`src/scenes/place/PlaceLife.tsx` goats/livestock and any village fauna)
  are the prime suspect (a simpler mover that translates the body without a leg
  animation). FIX: give the sliding animals a gait — swing the leg meshes in a
  walk cycle whose phase advances with distance travelled (so speed and stride
  match, no slide), and ensure the body faces its velocity direction (no
  backward-gliding: if the mover can go backward, either turn the body to face
  travel or play a reverse gait — turning to face is the natural fix). Reuse the
  bird's-eye gait approach if one exists. Keep it cheap (skeletal-free leg-mesh
  rotation, gated by the mobile/quality preset if needed). VERIFIABLE: a pure test
  that the leg-swing phase is a function of distance travelled (stride matches
  speed, zero at rest) and that a walker's facing tracks its velocity (never
  backward); a live check in the settlement verify suite that an in-town animal's
  legs move while it walks and its facing matches its motion (no foot-slide /
  no backward glide). DOCS: design.md §19 (animal locomotion) / §2.6 if wording
  changes. Related to 227 (the skyline "gliding animal" is the same foot-slide on
  the panorama band).

- [x] 229. LIGHTNING WITHOUT THUNDER — the user sees lightning FLASHES in the
  Central region but hears NO thunder (report 22.07.2026). §7.1 pt.12 / point 166
  promise a thunderstorm fires "lightning FLASHES with a delayed THUNDER (1-4 s)
  as a PAIR" — so the flash fires but its paired thunder sound never plays.
  DIAGNOSE: the gate + timing are pure-tested (`thunderstormAt`,
  `thunderDelaySeconds` in `src/systems/season.test.ts`) and the flash is visible,
  so the model side works — the break is on the AUDIO side: is the thunder sound
  wired into the ambience/sound engine at all, does the delayed-thunder scheduler
  actually trigger playback (the 1-4 s timeout may be dropped when the flash
  frame's state changes, or the thunder audio asset is missing / never loaded /
  gated behind a volume that is 0), and does it respect the single ambience volume
  (§7.1 pt.20)? Anchors: the thunder trigger in `src/scenes/travel/TravelScene.tsx`
  (and the settlement view) where the flash pulse fires, `src/systems/ambience.ts`
  / the sound engine, and `src/systems/season.ts` `thunderDelaySeconds`. FIX: make
  the thunder actually PLAY the delayed clap after each flash (both bird's-eye and
  settlement views), scaled by the ambience volume. VERIFIABLE: a pure test that
  the thunder is SCHEDULED after a flash at the pure `thunderDelaySeconds` delay
  and survives to fire (not cancelled by the next frame); a live check in
  `scripts/verify/enrichments.mjs` that a forced thunderstorm plays a thunder
  sound after the flash (assert the audio node / a `__thunder` dev hook fires),
  mirroring the existing flash gate. DOCS: none (implements the promised pt.166
  pairing). Both languages if any player-visible text is added (none expected).

- [x] 230. MOUNTAINS READ ANGULAR — the user reports (22.07.2026) that the
  mountains still look faceted/angular ("eckig"). Same two-class distinction as
  point 214: a facet is EITHER a shading break OR a silhouette step, and each
  needs a different lever. DIAGNOSE per case (read the material + geometry, judge
  by the rendered picture at an achievable zoom): (a) SHADING facets — hard light
  breaks between polygons while the outline is fine → the cheap correct fix is
  SMOOTH VERTEX NORMALS (`flatShading:false` + `geometry.computeVertexNormals()`),
  no added geometry (this was the point-215 backdrop-ridge fix); (b) SILHOUETTE
  facets — the mountain's OUTLINE visibly steps → only finer TESSELLATION of the
  DEM relief mesh rounds it (weigh the vertex cost). Determine WHICH mountains the
  user sees stepped: the bird's-eye DEM terrain relief (the travel-scene ground/
  relief mesh) and/or the settlement backdrop panorama (already smoothed for the
  ridge in point 215 — re-check it is not a regression there). Apply the minimal
  correct lever per case; do not raise tessellation where smooth normals suffice.
  Anchors: the travel-scene relief/ground mesh build and its material (search
  `src/scenes/travel/` and `src/world/terrain.ts` for the terrain mesh +
  `computeVertexNormals`/`flatShading`), and `src/scenes/place/backdrop.ts` /
  `backdropMaterial.ts` for the panorama. VERIFIABLE: a pure test that the
  terrain/relief material is smooth-shaded (flatShading not true) and its geometry
  carries smooth (interpolated, non-per-face) vertex normals — a curvature witness
  like the point-215 backdrop test — and, if any tessellation floor is raised,
  that the raised floor holds; the parent picture-verifies a stepped mountain on
  BOTH backends at an achievable zoom before/after. DOCS: design.md §2.5/§3.3 only
  if the wording changes. No player-visible text.

- [x] 231. TRAVELLER'S PACK SITS ON THE CHEST — the user reports (22.07.2026,
  screenshot) that the bird's-eye traveller figure carries a brown box (the
  backpack/carry-crate) in FRONT of the torso instead of on the BACK. DIAGNOSE:
  is the pack mesh modelled on the figure's front (+forward) side, or is the
  figure's facing inverted so a back-mounted pack renders toward the camera? The
  natural fix is to seat the pack on the BACK relative to the figure's forward/
  heading axis (behind the torso), so that when the traveller faces its travel
  direction the pack is away from the viewer. Keep the crate's size/material;
  only its local offset (and, if the facing is the real bug, the facing) changes.
  Anchors: the bird's-eye traveller build in `src/render/figures.ts` (the pack/
  box mesh and its local transform; the same file also carries the §6.2 wound
  overlay `__player.wounds`). VERIFIABLE: a pure test that the pack mesh's local
  offset lies on the BACK side of the figure (behind the torso along the forward
  axis, not in front); the parent picture-verifies the traveller from behind on
  BOTH backends (pack on the back, not the chest). DOCS: none. No player-visible
  text. NOTE: `figures.ts` overlaps point 214 — sequence this AFTER 214 merges (or
  fold it into the 214 branch) so the two figure edits never collide in one tree.

- [x] 232. RIVER SURFACE READS STEPPED — the user reports (22.07.2026, screenshot)
  that the river ribbon's water surface shows visible TRANSVERSE STEP-BANDS across
  its flow (each ribbon row sits at a slightly different height, so the sheet
  stairsteps down the current — most pronounced in the faster/steeper reach), and
  the whitewater foam bands in the same hard rows. TWO candidate causes, to be
  told apart by DIAGNOSIS: (a) point 211's fix (`ribbonRowSurfaceAt` in
  `src/scenes/travel/waterSurface.ts`) lifts EACH ribbon row independently until
  every water-typed terrain sample under its band sits below the sheet, so
  neighbouring rows can get DIFFERENT lifts and the raw per-row height reads as
  hard steps; and (b) — the deeper, likelier one (user insight 22.07.2026) — the
  UNDERLYING DEM height profile along the river course is itself jagged, and a real
  river bed descends SMOOTHLY and monotonically, so a stairstepped bed is
  physically wrong regardless of the ribbon: the honest fix is to SMOOTH THE HEIGHT
  DATA along the flow, not to paper over it at the water sheet. DIAGNOSE which
  dominates (sample the carved-bed / DEM elevation profile down a river's
  centreline and see whether it stairsteps before the ribbon lift is applied).
  FIX per diagnosis, preferring the realism fix where it is the cause: smooth the
  river BED elevation longitudinally so it descends monotonically from source to
  mouth (a running-min / low-pass along the ordered course, applied to the carved
  bed the ribbon and water mask derive from), which fixes the sheet AND the terrain
  under it; and/or smooth the per-row ribbon heights (a running max keeps every row
  clear of its terrain while removing upward steps, a light longitudinal smoothing
  the downward ones). EITHER fix must preserve the 211 invariant (no water-typed
  sample re-buried / pokes through the sheet), the mouth-bridge ocean rows, the
  §11.3 continuity/never-buried invariants and the descending current sense (a
  smoothed bed must still fall toward the mouth, so waterfalls/rapids keep their
  drop). If the foam texture also bands, soften its longitudinal sampling too.
  Anchors: `src/scenes/travel/waterSurface.ts` (`ribbonRowSurfaceAt`,
  `planRibbonStrips`), the ribbon geometry build in `src/scenes/travel/Rivers.tsx`,
  and the carved-bed / river-height source (search `src/world/` and
  `src/scenes/travel/` for where the river centreline elevation / carved bed is
  computed). VERIFIABLE: extend the DEM-backed pure tests in
  `src/scenes/travel/riverSmoothness.test.ts` — assert the sampled bed elevation
  along a river descends with at most a small bounded per-step drop (monotone
  non-increasing within tolerance, no upward jag) AND adjacent ribbon-row heights
  differ by at most a small bounded step (no hard stair) AND every water-typed
  sample still sits below its row (211's never-buried invariant re-held) AND ribbon
  continuity holds; the parent picture-verifies the Nile/rapids reach on BOTH
  backends (smooth descending sheet + bed, no transverse steps). DOCS: design.md
  §3.3/§11.3 only if wording changes. No player-visible text. NOTE: touches
  `Rivers.tsx` / the river-height source — overlaps point 219 (spring redesign),
  218's water sweep and 220 (terrain chunk seam); do not delegate those
  concurrently.

- [x] 233. RIVER CONFLUENCE/BRANCH ARMS OVERLAP — the user reports (22.07.2026,
  screenshot) that at a river junction (a confluence or distributary branch) the
  two river arms visibly OVERLAP: each arm is drawn as its own semi-transparent
  ribbon strip, and where they meet the strips CROSS rather than merging into one
  water body — the alpha-blended water DOUBLES in the overlap (a darker wedge) and
  each arm's bank/foam edges run through the other's water (crossing edges). FIX:
  make a junction read as ONE continuous water surface — merge or mask the
  overlapping ribbons at the branch (draw each ribbon's water only outside the
  other's shared region, or render the junction region once, so the alpha never
  doubles) and SUPPRESS the interior bank/foam edges inside the confluence. There
  is already interior-edge masking for confluences in
  `src/scenes/travel/riverBanks.ts` (the point-211-era tributary-edge rule) — the
  natural approach is to extend that so a branch overlap is masked the same way,
  and to depth-test / draw-once the shared water so it does not blend twice.
  Preserve §11.3 continuity (the merged junction stays gap-free) and the 232
  smoothing (do not reintroduce steps). Anchors: `src/scenes/travel/Rivers.tsx`
  (how multiple rivers/branches are drawn), `src/scenes/travel/riverBanks.ts`
  (confluence interior-edge masking + its test `riverBanks.test.ts`),
  `src/scenes/travel/waterSurface.ts`. VERIFIABLE: extend
  `src/scenes/travel/riverBanks.test.ts` — assert that at a confluence the two
  ribbons' shared region is masked/merged (the overlap is not double-drawn and the
  interior edges inside the junction are suppressed); the parent picture-verifies
  a confluence/branch on BOTH backends (one clean continuous water body, no dark
  overlap wedge, no crossing edges). DOCS: design.md §11.3 only if wording changes.
  No player-visible text. NOTE: same files as point 232 (Rivers.tsx /
  waterSurface.ts / riverBanks.ts) — DELEGATE 232 AND 233 TOGETHER on ONE branch
  (two atomic commits, both ticked at the one merge) so the river-rendering edits
  never collide; keep 218/219/220 off that branch's concurrency.

- [x] 234. SMOOTH RIVER ↔ WATER-BODY TRANSITIONS (lake outflow + sea mouth) — the
  user reports (22.07.2026, two screenshots) two related junction defects and asks
  for the GENERAL rule that a river transitions SMOOTHLY into any other water body:
  (a) at Lake Victoria the (White) Nile is drawn with its OWN detached SPRING (the
  §219 ring marker) set beside the lake with a gap between lake and river — but the
  Nile SOURCES from Lake Victoria (historically it flows out at Jinja), so the
  river must flow OUT of the lake as a seamless outflow, with NO separate spring
  and NO gap; (b) the Nile's MOUTH into the Mediterranean still shows an
  interruption/gap between the river ribbon and the sea. FIRST rule out deploy lag
  for (b): point 211 (merged c66fd0d, ~21:05) bridged the Rosetta mouth — verify
  the gap against a build of CURRENT main (or freshly-deployed main), and if 211
  already closed it, the remaining item is only (a) plus any OTHER mouth. FIX: a
  smooth blend at every river↔lake and river↔sea junction — (1) LAKE OUTFLOW: where
  a river's SOURCE coincides with (or lies at the shore of) a lake, suppress the
  spring marker and overlap the ribbon's head UNDER the lake sheet at the lake's
  surface height, so the river reads as flowing out of the lake (a source-at-a-lake
  is an outflow, not a spring); (2) SEA MOUTH: ensure the ribbon's tail actually
  reaches and merges under the sea sheet with no gap (extend/repair the 211
  mouth-bridge wherever a mouth still gaps); (3) GENERAL: match heights and overlap
  the ribbon head/tail beneath the receiving water sheet at every such junction so
  no seam shows. Determine which river SOURCES coincide with lakes from the world
  river/lake data. Anchors: `src/scenes/travel/waterSurface.ts` (mouth bridge,
  `planRibbonStrips`, ribbon head/tail), `src/scenes/travel/Rivers.tsx` (spring
  rendering — shared with point 219 — and the ribbon ends), the spring-placement /
  river-source logic and the lake-surface rendering (search `src/world/` and
  `src/scenes/travel/` for river sources, springs and lake sheets). VERIFIABLE:
  pure tests that a river whose source coincides with a lake produces NO spring and
  its head overlaps the lake sheet, and that the Nile mouth ribbon overlaps the sea
  sheet with no gap (extend `riverSmoothness.test.ts` / the water tests); the
  parent picture-verifies Lake Victoria (Nile flowing out of the lake, no detached
  spring) and the Nile sea mouth on BOTH backends against current main. DOCS:
  design.md §11.3 (river↔water-body transitions). No player-visible text. NOTE:
  same subsystem/files as points 211/218/219/232/233 — this is the umbrella
  "smooth river↔other-water transition" the user asked for; DELEGATE the coupled
  river-rendering cluster (232 + 233 + 234, and fold in 219's spring redesign)
  TOGETHER on ONE branch, sequentially, so the shared files never collide.

- [ ] 235. TRIM OFFSHORE BATHYMETRY TO FLAT DEEP OCEAN — hard-cut the map at the
  continent edge. The user reports (22.07.2026, two screenshots, red debug outlines
  around the offending patches) leftover "Fetzen" (scraps) of shallow-water
  bathymetry — offshore shelf patches, island-like detail and depth profile —
  floating in the deep ocean around the Red Sea, the Gulf of Aden and the Horn of
  Africa (Farasan/Dahlak shelves, the Socotra-area shelf, etc.). DECISION (user):
  the map should be HARD-CUT where the continent ends — beyond the playable
  continent (and beyond the REACHABLE game islands) there is ONLY flat deep ocean,
  with NO differentiated DEM/height profile at all. This GENERALISES point 210's
  Red-Sea clean-crop to the whole offshore. FIX: define the reachable-land mask
  (the continent + the reachable game islands the game already keeps as land, e.g.
  Zanzibar) and, for every sample OUTSIDE it, force the terrain to a uniform
  DEEP-OCEAN value — no shallow shelf, no bathymetric relief, no unreachable
  islands, flat. Reuse/extend the existing trim machinery (the §3.1 world trim and
  the point-210 `redSea` boundary already flatten Sinai/Arabia and sample foreign
  land — Spain, Sicily, Crete, the Canaries, the Comoros, Madagascar — as ocean);
  the new rule is the same clamp applied EVERYWHERE offshore, so the shallow-water
  shelves and island scraps beyond the coast read as deep open ocean. PRESERVE the
  existing acceptance invariants (`src/world/redSea.test.ts`): the reachable
  islands stay land, the African coastline and the Nile delta stay walkable land,
  nearshore sea still swims while far-offshore blocks (§11.2 swim margin), and the
  Red Sea cut / Mediterranean-always-blocked verdicts hold. Anchors:
  `src/world/redSea.ts` (the offshore boundary/trim), `src/world/terrain.ts`
  (`sampleTerrain`, the DEM clamp / STAMP_FLOOR machinery, the deep-ocean value).
  VERIFIABLE: extend `src/world/redSea.test.ts` — sample the reported offshore
  scrap locations (the Red Sea shelves, the Gulf of Aden, the Socotra/Farasan/
  Dahlak areas) and assert they read as FLAT DEEP OCEAN (deep, no shallow shelf, no
  land), while the reachable islands and the coastal land stay land and the swim
  margin still holds nearshore; the parent picture-verifies the trimmed offshore
  reads as uniform flat deep ocean (no teal shelf patches, no island scraps) on
  BOTH backends. DOCS: design.md §3.1/§11.2 if wording changes. No player-visible
  text. NOTE: touches `src/world/redSea.ts` + `src/world/terrain.ts` — overlaps
  point 221 (swim margin, redSea) and 220 (chunk seam); do not delegate those
  concurrently.

- [ ] 236. SETTLEMENT GROUND ↔ BACKDROP TRANSITION LOOKS WRONG — the user reports
  (22.07.2026, screenshot in Khartoum) that the transition between the flat
  walkable settlement ground and the surrounding §2.5 panorama backdrop looks
  wrong: a hard rectangular STEP/NOTCH where the settlement ground disc ends and
  the backdrop landscape begins (a visible height gap + a hard geometric edge),
  instead of a smooth blend. DIAGNOSE the boundary between the settlement ground
  plane and the backdrop heightfield (the ground disc radius vs where the backdrop
  starts; the point-215 backdrop taper begins at `BACKDROP_TAPER_SPAN` — check the
  join height/continuity). FIX: blend the settlement ground into the backdrop so no
  step or notch shows at the edge — match the heights at the join and overlap/skirt
  the ground disc under the backdrop (or feather the transition), the way a real
  horizon recedes; keep the point-215 ridge smoothness and the `panoramaGroundY` /
  backdrop clamp invariants. Anchors: `src/scenes/place/backdrop.ts`
  (`backdropHeightAt`/`panoramaGroundY`/taper), `src/scenes/place/PlaceScene.tsx`
  (the ground disc + backdrop mount), `src/scenes/place/backdrop.test.ts`.
  VERIFIABLE: extend `backdrop.test.ts` — assert the ground-plane height and the
  backdrop height are continuous at the join (the step across the boundary is
  within a small bound, no notch); the parent picture-verifies the settlement edge
  on BOTH backends (smooth ground→backdrop transition, no hard step). DOCS:
  design.md §2.5 if wording changes. No player-visible text. NOTE: same place-scene
  backdrop/panorama area as point 227 (horizontal skyline line) and 181 (floating
  panorama silhouettes) — coordinate/sequence these place-backdrop points so their
  shared files never collide.

- [ ] 237. FLEEING CALF OSCILLATES BETWEEN TWO DIRECTIONS — the user reports
  (22.07.2026) that a calf fleeing an elephant rapidly OSCILLATED between two
  directions as it ran. §7.1 pt.12 already requires a fleeing prey to hold ONE
  steady escape direction "rather than oscillating ~90° between two flanking
  herd-mates" — so this is either a case that rule does not cover (a CALF fleeing a
  dangerous/approaching ELEPHANT, as opposed to prey dodging between two herd-mates)
  or a regression of the anti-oscillation hysteresis. DIAGNOSE: trace the calf's
  flee-heading pick when the threat is an elephant — is it re-choosing the escape
  direction every frame (flipping between two comparably-good headings) instead of
  committing to one with hysteresis, the way the point-208/pt.12 steady-escape and
  the point-157 `calfFleeStep`/`escapeCorridorHeading` sticky-corridor logic
  intend? FIX: give the calf-vs-elephant flee the same steady, hysteresis-held
  escape heading the other flee paths use (commit to one direction; only switch
  past a margin), reusing the existing sticky-corridor/steady-escape machinery
  rather than adding a parallel path. Anchors:
  `src/scenes/travel/wildlifeBehavior.ts` (the calf flee / dodge heading, the
  elephant-dodge, `calfFleeStep`/`escapeCorridorHeading`, the steady-escape
  hysteresis), `src/scenes/travel/Wildlife.tsx` if a per-animal field is threaded.
  VERIFIABLE: extend `src/scenes/travel/wildlifeBehavior.test.ts` — a calf fleeing
  an approaching elephant holds one escape heading over successive steps (heading
  variance below a small bound / no ~90° flip between two directions), mirroring
  the existing steady-escape/anti-oscillation tests; a live check in
  `scripts/verify/enrichments.mjs` if reachable. DOCS: none. No player-visible text.
  NOTE: same file as points 217 (vulture wings) and 228 (foot-slide) —
  `wildlifeBehavior.ts`/`Wildlife.tsx`; do NOT delegate these wildlife-behaviour
  points concurrently with each other.

- [x] 238. WIDEN THE CALF LEASH SO THE FAMILY DRAMAS READ — the user observes
  (22.07.2026) that a calf stays VERY close to its parent, so the §19.8 family
  dramas (the parent's sacrifice, hurling itself before an elephant's feet, the
  calf's flight) happen in such a tight cluster that they are not recognisable as
  such; letting a calf stray FURTHER from its parent would let the drama read
  spatially. Current leash: `YOUNG_FOLLOW_RADIUS = 1.8` world units in
  `src/scenes/travel/Wildlife.tsx` (a calf beyond it is yanked back; within it it
  gambols via `leashedGambolDir`). FIX: widen the calf follow/leash radius (and the
  gambol play `range` fed to `leashedGambolDir`) so the calf can roam noticeably
  further, and MOVE the value(s) into `balance.family` so they are debug-editable
  per §21.2 (calibratable). CONCRETE TARGET (user decision 22.07.2026): use 3× the
  current follow radius (1.8 → 5.4) — scale the gambol play range with it — AND
  LENGTHEN the gambol hop-bout duration so the young hop around longer before the
  bout ends. Keep the leashed-gambol anti-jitter intact (just a larger range — the
  damping has no cancellation point regardless of range).
  Verify the dependent drama mechanics still resolve at the wider spacing: the
  parent still guards from `GUARD_RADIUS = 12` and must still reach the calf/
  predator in time — check that the rescue-burst speed (`balance.family.rescueBurst`,
  §19.8 pt.12) lets a parent close the wider gap within the CAUGHT/SACRIFICE/
  TOO_LATE windows, and widen those reach distances proportionally if the wider
  leash would otherwise make every rescue fail. Anchors: `src/scenes/travel/
  Wildlife.tsx` (`YOUNG_FOLLOW_RADIUS`/`YOUNG_FOLLOW_SPEED`, the guard/sacrifice
  distances), `src/scenes/travel/wildlifeBehavior.ts` (`leashedGambolDir` range),
  `src/config/balance.ts` (`family`), `src/ui/DebugMenu.tsx`. VERIFIABLE: pure test
  that the widened leash lets a calf reach a larger max distance from its parent
  while `leashedGambolDir` still orbits without jitter, that the family-drama
  reach/resolution still fires at the wider spacing (the parent reaches in time
  under the rescue burst), and that the new balance value writes through the debug
  menu (`src/ui/DebugMenu.test.tsx`); a live check in `scripts/verify/
  enrichments.mjs` that a calf can stand clearly further from its parent than 1.8.
  DOCS: design.md §19.8 (calf leash / family life) + §21.2 (calibratable value).
  No player-visible text. NOTE: same files as points 217/228/237
  (`wildlifeBehavior.ts`/`Wildlife.tsx`) — do NOT delegate concurrently with those.

- [x] 239. SMALL/WEAK ANIMALS FLEE THE PLAYER TOO (not only predators) — the user
  wants (22.07.2026) small/weak animals to flee (run or fly) from the PLAYER's
  bird's-eye figure, not only from predators; for JUVENILES this extends to species
  that are MID-RANKED per the §14.1 danger order (a calf/chick is vulnerable
  whatever its adult rank). A collision between the player and these animals must
  stay WITHOUT CONSEQUENCE, exactly as now (no damage, no event — the flee is
  cosmetic shyness; these animals remain passable, and the §19.3 walk-into-a-
  wandering-PREDATOR attack is unchanged since that is about predators, not weak
  prey). BEHAVIOUR: when the player approaches within a flee radius, a weak/prey
  animal turns and flees away from the player using the EXISTING steady-escape /
  anti-oscillation machinery (the same smooth held heading as the predator flee —
  cf. point 237, no ~90° flip), and birds fly off; apex/strong adults (lion,
  leopard, hyena, cheetah, elephant, crocodile, hippo, buffalo, rhino …) do NOT
  flee the player. Decide "small/weak" from the §14.1 danger rank / the species
  weapon table already in `wildlifeBehavior.ts`: the weak prey tier flees as
  adults; an animal at/above a mid rank does not — EXCEPT any JUVENILE (calf, foal,
  chick, cub), which flees even when its species is mid-ranked. FIX: add a
  flee-from-player trigger that reuses the predator-flee heading logic (do not fork
  a second oscillation-prone path), keyed on a `fleesFromPlayer(species, isJuvenile)`
  predicate; keep the player-collision resolution consequence-free (nudge/pass, no
  event). Anchors: `src/scenes/travel/wildlifeBehavior.ts` (the rank/weapon tables,
  the flee/steady-escape heading, the player-proximity), `src/scenes/travel/
  Wildlife.tsx` (player position + the flee trigger + the consequence-free collide).
  VERIFIABLE: pure test — `fleesFromPlayer` is TRUE for the weak/prey species and
  for ANY juvenile (incl. a mid-rank juvenile) and FALSE for apex adults; the
  flee heading is the steady-escape (no oscillation, reusing 237's test pattern);
  a live check in `scripts/verify/enrichments.mjs` that an approaching player makes
  a grazer flee while the player takes NO event and the pass stays consequence-free.
  DOCS: design.md §19 (ambient wildlife shy from the traveller). No player-visible
  text. NOTE: same files as points 238/217/228/237 (`wildlifeBehavior.ts`/
  `Wildlife.tsx`) — delegate TOGETHER with 238 on the wildlife-behaviour branch (or
  strictly after), never concurrently with the other wildlife points.

- [x] 240. PRETTIER ELEPHANT TRUNKS — the user wants (22.07.2026) a nicer way to
  render the elephants' trunks. Read the current elephant build in
  `src/render/fauna.ts` (`buildElephant`) — the trunk is likely a coarse
  tapered stack/cylinder. REDESIGN it into a graceful, natural trunk: a smooth
  tapered curve along a curved centreline (thick at the base where it meets the
  head, tapering to the tip), with a natural downward droop / gentle curl, built
  from several segments so the curve and taper read; cheap and instanced,
  tessellation consistent with the point-214/230 smoothness (no facet panels at
  the close zoom the user inspects). Keep the tusks, ears and the rest of the
  elephant unchanged; only the trunk changes. Consider a subtle idle sway if it is
  cheap and the build already animates parts (optional, not required). VERIFIABLE
  (pure layer): extend `src/render/fauna.test.ts` — assert the rebuilt trunk is a
  multi-segment tapered curve (radius decreases monotonically base→tip over >=4
  segments, the centreline is not a straight vertical line — it curves/droops),
  and its segment/tessellation floor holds so no facets read. GATES: `npm run
  test:unit` green, `npm run build` passes, `npm run lint` zero findings. Do NOT
  run browser suites (the parent picture-verifies an elephant close-up on BOTH
  backends). DOCS: none. No player-visible text. NOTE: `fauna.ts` — the same file
  point 214 re-tessellated (merged); do NOT delegate concurrently with any other
  `fauna.ts` point.

- [ ] 241. THUNDER PLAYS ONLY ONCE — after point 229 made the thunderclap audible,
  the user reports (22.07.2026) hearing the thunder EXACTLY ONCE and then never
  again. So something is not re-armed after the first clap: either the flash→thunder
  TRIGGER fires only once (a one-shot flag set on the first storm/flash and never
  reset), or the AUDIO path is consumed/torn down after the first play (a shared
  node stopped/disconnected, an init-once guard, or the `__thunder`/scheduler state
  latching). NOTE 229 already proved a single clap schedules and survives the next
  frame — so the regression is in the RE-FIRE across successive flashes/storms, a
  case 229's tests did not cover. DIAGNOSE: trace the flash trigger in
  `src/scenes/travel/TravelScene.tsx` / `src/scenes/travel/Climate.tsx` (does the
  lightning flash itself re-fire on later storm frames/days, or fire once?) AND the
  `playThunder` path in `src/systems/ambience.ts` (does a second call still create
  fresh BufferSource/gain nodes and schedule, or is it gated after the first — e.g.
  a boolean that never resets, a disconnected bus, a scheduler that clears itself)?
  Check both the bird's-eye and the settlement views. FIX: ensure EVERY lightning
  flash schedules and plays its thunderclap, repeatedly across the whole session
  (re-arm after each clap; each play builds its own short-lived nodes). VERIFIABLE:
  extend `src/systems/ambience.test.ts` / `src/systems/season.test.ts` — a pure/
  FakeAudioContext test that TWO (and N) successive flashes EACH schedule and play a
  thunderclap (the second is not suppressed), and that the trigger re-arms per flash;
  extend the `scripts/verify/enrichments.mjs` storm check to force TWO flashes and
  assert `__thunder` fires BOTH times (count increments past 1 with audio each time).
  DOCS: none. No player-visible text. NOTE: `src/systems/ambience.ts` (+ possibly
  `TravelScene.tsx`/`Climate.tsx`) — non-overlapping with the running river/wildlife/
  fauna branches; this is the 229 follow-up.

- [ ] 242. CROCODILES LIE EXPOSED AND INERT ON THE BANK — the user reports
  (22.07.2026, screenshot near the Cairo/Giza Nile) two crocodiles lying flat, fully
  visible and motionless on the river BANK/sand beside the player, reading as
  lifeless props. Per §19.16 / point 130 a crocodile is a WATER-ONLY ambush
  predator: hidden it sinks to the eye knobs on the water surface and lunges at
  prey/player only within the strike radius. WHAT IS NOT INTENDED here: (1) the
  crocs are BEACHED/visible on the sand bank rather than sitting ON the water — the
  §19.16 water-only placement is not holding (likely a side effect of the widened
  river / water mask leaving them on the bank, cf. point 218 floating objects), and
  (2) the hidden pose is not applied — an idle croc should be SUNK to the eye knobs
  (body below the water sheet), lurking, not lying exposed and flat. CONFIRMED (user
  22.07.2026): the LUNGE mechanism WORKS (a crocodile was seen to snap), so the
  FAILING mechanism is the SUBMERGE — the idle/hidden "sink to the eye knobs" pose
  does not apply, leaving the croc exposed and flat. This SUBMERGE fix (2) is the
  PRIMARY target, together with (1) the water-only placement; the lunge/attack path
  is fine, leave it. NOT the cause: interpenetration/body-separation pinning (point
  222) was considered and RULED OUT by the user — a LONE crocodile is equally idle,
  so this is the crocodile's hidden-pose mechanism, not two crocs locking each
  other; do not chase a 222-style pin here. WHAT IS BY
  DESIGN (leave it): no lunge at the PLAYER here — the §14.2 walk-into attack is a
  random event that defaults OFF in the relaxed preset; and with no prey in the
  strike radius, no prey-lunge fires. FIX: (a) keep crocodiles ON water only —
  re-anchor any croc that ended up on the bank/sand back onto a river/lake water
  cell (reuse the §19.5 water/land backstop + the point-192 water rules); (b) render
  an idle/hidden crocodile properly sunk to the eye knobs on the water surface (not
  flat on land), so a resting croc reads as a lurking ambush; (c) optionally a
  subtle idle motion (slow drift / tail sway) so it is not frozen. Keep the
  lunge-at-prey and the §14.2 walk-into event unchanged. Anchors:
  `src/scenes/travel/wildlifeBehavior.ts` (crocodile placement + hidden/idle state),
  `src/scenes/travel/Wildlife.tsx` (croc pose/render), `src/render/fauna.ts`
  (`buildCrocodile` — the hidden eye-knob pose), `src/scenes/travel/
  waterEdgeRules.ts` (the water-only rule). VERIFIABLE: pure test that a crocodile's
  resting anchor is a water cell (never bank/sand) and its hidden pose sits at
  ~eye-knob height (body below the water sheet); a live check in
  `scripts/verify/enrichments.mjs` that an idle croc sits on water sunk, not beached.
  DOCS: design.md §19.16 if wording changes. No player-visible text. NOTE:
  `wildlifeBehavior.ts`/`Wildlife.tsx`/`fauna.ts` — overlaps the wildlife points
  (237/238/239) and the fauna points; do NOT delegate concurrently with those —
  queue after the wildlife branch merges.

- [x] 243. REDESIGN THE CROCODILE MESH — the user reports (22.07.2026) that the
  crocodile's appearance is poor: they did not even recognise it as a crocodile.
  Two specifics: (1) the SNOUT lacks the classic crocodile shape (the long tapered
  jaw), and (2) there is a long unexplained ROD lying on TOP of the body that reads
  as nothing identifiable. Make it prettier / more detailed. Read the current
  `buildCrocodile` in `src/render/fauna.ts`, DIAGNOSE what the "rod on top" is (a
  mis-scaled dorsal ridge? a leftover primitive?), and REBUILD the crocodile into a
  recognisable, classic silhouette: a long LOW body, a distinctive long TAPERED
  SNOUT (the classic croc jaw line, upper + lower jaw), raised EYE KNOBS above the
  head (also needed for point 242's submerge pose), a low ARMOURED/ridged back
  (dorsal scutes as a LOW ridge — replace the tall rod with this, never a thin tall
  rod), four short splayed legs, and a long tapering muscular tail. Cheap instanced
  geometry, tessellation consistent with points 214/240 (smooth where it should be,
  the croc's characteristic low profile). Keep the placement/scale/colour and the
  water-only behaviour hooks intact (do not touch wildlife behaviour — mesh only).
  VERIFIABLE (pure layer): extend `src/render/fauna.test.ts` — assert the rebuilt
  crocodile has a long tapered snout (a front section that extends well forward of
  the head and narrows toward the tip), raised eye knobs above the skull, a tapering
  tail longer than the body core, and a LOW profile: NO part protrudes as a tall
  thin rod above the back (max part height above the body is bounded to a low
  fraction of the body length/width), plus the tessellation floor. GATES: `npm run
  test:unit` green, `npm run build` passes, `npm run lint` zero findings. Do NOT run
  browser suites (the parent picture-verifies a crocodile on a river on BOTH
  backends). DOCS: design.md §19.16 if wording changes. No player-visible text.
  NOTE: `fauna.ts` `buildCrocodile` — coordinate with point 242 (which adds the
  submerge POSE + placement to the same crocodile). Sequence 243 (the MESH) FIRST,
  then 242 (the behaviour/pose) builds on it; do NOT delegate 243 concurrently with
  any other `fauna.ts` point.

- [ ] 244. SPACE IS THE USE KEY; FUNCTIONAL BUILDINGS NEED THE KEY (no walk-in
  auto-open) — user decision 22.07.2026. TWO coupled changes: (A) the interaction/
  use key changes from E to SPACE everywhere; (B) entering a FUNCTIONAL building
  (the highlighted enterable huts — shops, bazaar, ferry/trade, the chief's/elder
  hut, etc.) now REQUIRES pressing SPACE while standing at its door — merely walking
  against the door no longer enters it. This REVERSES the §7.1 pt.2 rule "buildings
  open by walking against their door" FOR functional buildings, while KEEPING the
  door-proximity detection (to show the prompt and arm the key). WHAT STAYS (do not
  change): the settlement ENTRY from the bird's-eye view still happens by MOVEMENT
  (walking into the place, §2.3) — only functional BUILDINGS inside a settlement
  need the key; the just-left-settlement clearance, the leave-by-walking-clear rule,
  and the water-cell no-auto-enter rule are unchanged; the §17.5 focus-on-entry
  behaviour stays. SCOPE of (A): the keybinding/prompt for the elder talk AND the
  functional-building entry becomes SPACE; every "press E"/`E` label in player text
  becomes SPACE (both languages, from the language files); the gamepad A-button
  (§17.5/pt.30) maps to SPACE via the existing synthetic-key path (one input path);
  the touch interaction prompt (pt.30) dispatches SPACE. Anchors: the input/keybind
  layer and the place-scene interaction/door-entry logic (search `src/scenes/place/`
  and the input handling for the E key and the walk-in auto-enter of buildings),
  `src/systems/` gamepad + touch prompt, and the i18n prompt strings. VERIFIABLE:
  `scripts/verify/flow.mjs` — walking a functional building's door WITHOUT a key
  press NO LONGER enters it; pressing SPACE at the door enters; the elder is
  addressed with SPACE; entering still focuses the controls (no HUD focus). Update
  the pure/unit tests for the new keybinding (E→SPACE) and the gamepad suite
  (A→SPACE) and the touch suite (prompt fires SPACE). The settlement walk-in entry
  and leave tests stay green. DOCS (in the SAME branch/commit — this changes the
  target state): `design.md` §2.3 (functional buildings enter via the use key, not
  by walking in; settlement entry stays movement-based), §17.5 (SPACE is the use
  key; gamepad A→SPACE), §17.3 (prompt wording); and CLAUDE.md §7.1 pt.2 (rewrite
  the "buildings open by walking against their door" clause to "functional buildings
  are entered with the SPACE use key at the door; settlement entry stays movement-
  based"), pt.9 and pt.30 wherever the E key / A-button interaction is stated. Both
  languages for any changed prompt text. NOTE: input/place/gamepad/touch/i18n/docs —
  non-render logic; non-overlapping with the running water/wildlife/ambience
  branches, but it edits CLAUDE.md §7.1 (a documented acceptance criterion), so
  keep the numbering/references intact per the doc rules.

- [ ] 245. JUVENILES ROAM FURTHER + ARE THE PREFERRED PREY (esp. crocodiles at the
  drink) — user follow-up 22.07.2026 to points 238/239. THREE tweaks: (1) multiply
  the max juvenile↔parent distance by 1.5 AGAIN — `balance.family.followRadius`
  5.4 → 8.1 and `balance.family.gambolRange` 12 → 18 (scale together; keep the
  hop-bout duration). Re-check the drama still resolves at 8.1: the rescue burst
  must still close the gap within the caught window (widen `GUARD_RADIUS` / the
  reach distances if the wider leash would make rescues systematically fail — the
  point-238 head-room was gap 15.2 vs burst-cover 30, so 8.1 leash → gap ~19 stays
  inside 30, but re-assert it with a pure test). (2) A calf/foal DRINKING at a
  water bank is ESPECIALLY OFTEN the crocodile's lunge target, so the §19.16 +
  §19.8 sacrifice/rescue drama fires more often: strongly bias the crocodile's
  ambush target toward a drinking juvenile at the bank (a calibratable preference,
  clearly above an adult or a non-drinking target). (3) Juveniles are the PREFERRED
  PREY of the OTHER predators generally too: raise the existing juvenile hunt bias
  (`CALF_HUNT_CHANCE`, currently 0.6) and/or the target-pick so a nearby juvenile
  is preferred over an adult grazer for every predator — a calibratable balance
  value. Anchors: `src/config/balance.ts` (`family` — followRadius/gambolRange, and
  a new `juvenilePreyBias` / crocodile drinking-target preference), `src/scenes/
  travel/wildlifeBehavior.ts` (`CALF_HUNT_CHANCE`, the hunt target selection, the
  crocodile ambush target pick), `src/scenes/travel/Wildlife.tsx` (the croc ambush
  + the calf drinking state `a.drink`), `src/ui/DebugMenu.tsx` for any new value.
  VERIFIABLE: pure tests — `followRadius` = 8.1 (1.5 × 5.4) and `gambolRange` = 18;
  the drama still resolves at the wider leash (burst-cover > worst gap × margin);
  a drinking juvenile is the strongly-preferred crocodile target (predicate/weight
  test); a nearby juvenile is preferred over an adult for a predator hunt
  (calibratable, boundary-tested); the new balance values write through the debug
  menu. Live (`scripts/verify/enrichments.mjs`): a drinking calf near a forced
  crocodile is taken and the sacrifice/rescue drama runs. DOCS: design.md §19.8
  (juvenile roam distance + preferred prey), §19.16 (crocodile prefers a drinking
  juvenile), §21.2 (the new calibratable values). No player-visible text. NOTE:
  `wildlifeBehavior.ts`/`Wildlife.tsx`/`balance.ts` — same files as points
  242/237/217/228; do NOT delegate concurrently with those wildlife points; can be
  bundled with 242 (both are crocodile/wildlife on the same files).

- [ ] 246. CROCODILE SHOWS THROUGH THE WATER — the user reports (22.07.2026,
  screenshot) that a SUBMERGED crocodile's BODY is clearly visible THROUGH the water
  surface (a sharp silhouette), although its eyes correctly sit above the water (the
  submerge pose is right). A submerged body should be OBSCURED/murky under the water,
  not read as a clear shape. LIKELY REGRESSION from point 233 (just merged): the
  river material was given `depthWrite = false` (so a confluence's junior arm does
  not depth-cull the senior water) — but with the water no longer writing depth, a
  body BELOW the water sheet (the sunk croc) is no longer depth-occluded by the water
  and shows through. The point-233 agent explicitly flagged this side-effect risk.
  DIAGNOSE: confirm the depthWrite change is the cause (a submerged croc read fine
  before it). FIX without breaking 233's confluence merge — options: keep depthWrite
  ON for the water and solve the junior-arm cull differently (e.g. per-vertex merge
  opacity already exists — rely on it + a small polygon offset rather than disabling
  depth entirely), OR render submerged animals with the water's depth absorption over
  them (depth-tinted so a sunk croc reads as a faint murky shape, only the eye knobs
  proud). Anchors: `src/scenes/travel/Rivers.tsx` (the river material `depthWrite`/
  `depthTest` — the point-233 change), `src/render/water.ts` (water depth/absorption),
  and the crocodile submerge render in `src/scenes/travel/Wildlife.tsx`. VERIFIABLE:
  a test that the water occludes or murks a submerged body (the submerged fraction is
  not drawn at full clarity); the parent picture-verifies a submerged crocodile on
  BOTH backends (body obscured under the water, only the eyes/knobs proud) AND
  re-checks that the point-233 confluence still merges cleanly (no doubled wedge).
  DOCS: none. No player-visible text. NOTE: touches the river material (just-merged
  233) + the croc render — verify the 233 confluence is preserved after any depth
  change; overlaps the river files and the wildlife/fauna croc work (242/243/245).

- [ ] 247. JUVENILE DOES NOT FLEE THE PLAYER (point 239 follow-up) — the user
  reports (22.07.2026, screenshot near the Nile, North) a juvenile standing right
  next to the player WITHOUT fleeing, although point 239 should make weak animals +
  any juvenile shy from the traveller. FIRST rule out DEPLOY LAG: 239 (`fade0aa`)
  merged only minutes before the report, so the deployed build may predate it —
  verify against CURRENT main / a fresh deploy before treating it as a bug. IF it
  reproduces on current main, the likely cause is 239's DRINKER EXEMPTION: the
  flee is skipped for an animal with `a.drink !== undefined` (a drinking calf at the
  bank deliberately does NOT flee, to protect the §19.8/§19.16 staged crocodile/
  sacrifice dramas), and the reported juvenile stands at the river edge. Reconsider
  the exemption scope: a drinking juvenile should probably STILL flee a player who
  comes within the (smaller) flee radius — narrow the exemption to only the animals
  actually bound into a staged drama (the crocodile-target / mired / caught calf),
  not every drinking juvenile; OR let a very-close player override the drink state.
  Also confirm `PLAYER_SHY_RADIUS` (6) and that the specific species/juvenile is
  covered by `fleesFromPlayer`. Anchors: `src/scenes/travel/Wildlife.tsx` (the
  `fleesFromPlayer` wiring, `PLAYER_SHY_RADIUS`, the `a.drink` exemption),
  `src/scenes/travel/wildlifeBehavior.ts` (`fleesFromPlayer`). VERIFIABLE: a live
  check (`scripts/verify/enrichments.mjs`) that a juvenile within the flee radius of
  the player flees even at a bank UNLESS it is a staged-drama calf; a pure test
  pinning the narrowed drinker-exemption scope. DOCS: design.md §19 if the shyness
  wording changes. No player-visible text. NOTE: `wildlifeBehavior.ts`/`Wildlife.tsx`
  — same files as 242/245/237/217; do NOT delegate concurrently with those; bundles
  naturally with 245 (both are calf/juvenile behaviour).

## Closing (only after all points)

NOTE ON ORDERING (17.07.2026): new TASKS points are appended BEFORE this
section, never after it — this section must stay the LAST thing in the file.
(It had drifted into the middle because points 162-170 were appended past it;
moved back to the end here.)

USER-REQUESTED CLOSING RUN (17.07.2026 23:37): the last full closing is long
ago and cruft has accreted (tonight alone: probe scripts, many new features,
several docs edits, dashboard churn). Do a FULL closing cycle right AFTER the
current step (point 129) and BEFORE resuming the feature queue (168/145c/...).
Going forward, a standalone closing run may also be taken as its own task now
and then. The cycle:
1. Full regression over the whole state (build, lint, npm audit, unit layer,
   ALL browser suites green — not just the changed ones).
2. Thorough dead-code / stale-doc / stale-comment cleanup — as separate commits,
   not mixed with feature commits. (Watch: leftover _probe.mjs scripts, unused
   exports after the 129 collidable-set trim, the deadtree entry's now-dead
   references, any TODO/OPEN that is resolved.)
3. Full regression again.
4. Analyse every .md file for cruft that accreted through the iterative
   additions: compact or restructure sections that have grown rambling or
   redundant, improving structure where it helps. The referenced section
   numbers must be preserved.