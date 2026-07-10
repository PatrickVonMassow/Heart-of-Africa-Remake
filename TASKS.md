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
  Reworked after review (the sacrifice fired but was invisible — the guarding
  parent stood ~2 units from the calf, so the charge resolved within a couple
  of frames and read as an ordinary kill): the hunted calf now flees the chase
  (slower than the predator, so it is visibly run down), the parent escorts it
  without ever abandoning it beyond a short range and stands clear at the
  catch, making the rescue charge a visible run (~1 s). The calf-hunt chance
  was raised (0.45 → 0.6), and a spawn bug was fixed where skipped (water)
  placements mislinked a family across chunk groups.
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

- [x] 17. The movement oscillation persisted after point 1. Root cause found:
  the summed threat field had smoothed the heading only WITHIN the dodge,
  while the rendered facing was recomputed per behavior branch and snapped at
  every boundary (dodge engage/disengage at the panic ring, flight end,
  nurse↔follow, the drink turn-around) — and elephants never rendered their
  travel heading at all. The suggested return to a discrete nearest-threat
  choice was evaluated and rejected: it would reintroduce the ~90° flip
  between two flankers and fix none of the boundary snaps. Fixed sustainably:
  one persistent facing per animal, steered by every behavior at a capped
  turn rate; exit-ring hysteresis on the dodge; a finished flight leaves the
  animal facing where it ran; elephants face their line of travel.

- [x] 18. The walkable continent ends at the Red Sea. Everything northeast of
  the African Red Sea coast (the Red Sea itself, Sinai, the Arabian peninsula)
  is open, impassable ocean — the same as the sea around the rest of the
  continent. No special treatment of the Red Sea as inland water.
  (Boundary polyline slightly seaward of the ~1890 coast, Mediterranean →
  Suez → Bab-el-Mandeb → Gulf of Aden past the Horn, in src/world/redSea.ts;
  isBlocked() always blocks northeast of it, and loadGeodata() stamps those
  DEM texels to ocean so Sinai/the Levant/Arabia no longer render as land —
  the water bathymetry texture now reads the stamped pixels instead of
  dem.png. Two baseline probes contradicted the task's assumptions and were
  kept as-is per "unchanged as before": the Mozambique channel was already
  BLOCKED (outside the mainland hull), and the Mediterranean off the Gulf of
  Sidra at 15°E/34°N was already SWIMMABLE (a bay inside the hull) — the
  tests pin the true unchanged behavior.)

- [x] 19. At the continent's edges one can swim a long way out into the open
  ocean — that must not be possible. Land masses outside the walkable
  continent are still visible on the map material and must be removed. And a
  scrap of the Red Sea still juts into the land.
  (Swimmable sea is now capped at a calibratable coastal band —
  balance.oceanSwimMarginDeg 1.2°, debug-editable — on top of the unchanged
  hull rules. The per-texel northeast stamp became a keep-flood trim in
  trimToGameWorld(): only land connected to the game's land-mass seeds
  survives, so southern Europe, Anatolia, the Canaries, Comoros, São Tomé
  and all Red Sea islands are trimmed to ocean along with Sinai/Levant/
  Arabia. The Red Sea scrap came from boundary vertices biting into the
  real coast (Gulf of Suez, Sudan, Eritrea); the flood keeps
  African-connected land regardless, the Gulf-of-Suez segment now hugs the
  African west shore, and a raw-DEM scan test asserts trimmed land borders
  kept land only at the Suez isthmus gate.)
- [x] 20. In the debug zoom-out, walking produces oddities: the ocean moves
  offset against the land mass, and the landscape is only rendered in a
  rectangular area that covers a fraction of the visible range.
  (Two causes: the water plane is scaled up in the zoom range but its shader
  reconstructed world XZ from the unscaled local position, so bathymetry and
  pattern drifted against the land while walking — a planeScale uniform now
  tracks the mesh scale. And the "rectangle" was the detailed chunk area
  standing out against the far-terrain sheet: the sheet now bakes the chunks'
  mean ground-texture response into its vertex colors (farColor.ts, pure
  Vitest-tested), and the chunk-bound dressing (trees, rocks) hides beyond
  zoom 3 — it only ever covers the chunk rectangle and read as a dark dressed
  island. Verified per screenshot repro at zoom 5/10 and new enrichments
  checks; the full regression needed one flake rerun each for the known
  RAF-timing checks — calf sacrifice, walk smoke — both green standalone.)
- [x] 21. After the recent wave of design.md changes (restructure into numbered
  subsections, §7.1 slimming, the Red Sea/world-trim work), review README.md
  and bring it in step where it has drifted.
  (No §-references needed fixing — the README cites none. Drift closed:
  gameplay list caught up with the built systems (ambient wildlife, bazaar
  arbitrage/ferries/bounties, reputation incl. robbery, camps, animated
  handwriting, port-snapshot saving/successor, gamepad), kokoro-js added to
  the stack list, `npm run test:unit` added to the scripts, the scripts/ tree
  line now names the verify suites, the geodata section documents the
  load-time world trim, and the status section links the hybrid test
  strategy. The criteria count stays 32 (docs.mjs green). Full regression:
  one known start-timing flake (flow journal auto-open), green standalone.)
- [x] 22. Fully zoomed out in the debug mode, the ocean still renders
  incorrectly — especially in the northeast.
  (Three layers fixed: the water shader clamp-repeated the bathymetry
  texture's edge texels into endless streaks beyond the DEM bbox — it now
  blends to plain deep ocean out there; the trim stamp depth rose from
  -1000 m to -3000 m so trimmed land reads as the same deep ocean as the
  bbox mask; and ghost shallows are removed — the shelf ring around every
  trimmed island (Crete, Cyprus, the Canaries) is deepened via a box
  dilation of the stamp mask, and all shallow sea northeast of the boundary
  (Persian Gulf, Dahlak banks, Caspian corner) reads as deep open ocean.
  The African coast keeps its real shelf bathymetry.)
- [x] 23. In the west-southwest a large, unreachable land mass is still shown;
  it must be removed from the map as well.
  (Not reproducible as literal land: cap-zoom sweeps from central, Cairo,
  south-west and Cape positions show no land outside the game's land masses
  — landFraction samples confirm it. The likeliest culprit is the point-22
  family of artifacts (clamped edge bands and bright ghost shallows read as
  sand-colored land masses and lay in arbitrary screen directions depending
  on the player position); all of those are gone now. If a land mass still
  shows after this build, a position/screenshot would pin it down.)
- [x] 24. F3 (full loadout) should also unlock the extended zoom mode.
  (The F3 handler now enables the wheel-zoom unlock alongside the loadout;
  asserted in src/ui/Hud.test.tsx via a window keydown.)
- [x] 25. The unreachable land mass of point 23 is identified (user
  screenshot): it is Madagascar. It cannot be reached in the game and must
  therefore be removed from the map material — the rendered world and the
  exploration map alike.
  (Removed as a game land mass: its trim seed and coastline polygon are
  gone, so the world trim stamps it to deep ocean and the exploration map
  no longer sketches it. Its wide western shelf banks and steep old coast
  slope left ghost outlines in the water, so shallow sea in the trimmed
  Madagascar box — and in the trimmed northeast — is deepened up to 800 m,
  and the water's deep tone now saturates by ~1600 m so trimmed stamps
  match the surrounding basins. design.md §3.1 records Madagascar as not
  part of the game world; CLAUDE.md pt. 4, README and the redSea tests
  follow.)

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

## Closing (only after all points)

1. Full regression over the whole state.
2. Thorough dead-code / stale-doc / stale-comment cleanup — as separate commits,
   not mixed with feature commits.
3. Full regression again.
