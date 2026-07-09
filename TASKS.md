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
- [ ] 3. Calves hop about playfully and sometimes fall into the water. Parents
  wade in and pull them out. In the attempt a calf or a parent can be swept over
  a waterfall and die; if a calf goes over a waterfall, the parents plunge after
  it and die.
- [ ] 4. Spawn animals with enough spacing that they do not overlap; add
  collision detection so they do not walk through one another.
- [ ] 5. Vultures: spawn outside the visible area and fly in (not appearing out
  of nowhere); after feeding they fly off and only despawn well outside the
  visible area. Account for the zoom level.
- [ ] 6. Predators must not despawn within the visible area. In general: animals
  only despawn well outside the visible area (account for the zoom level).
- [ ] 7. When a predator leaves, it leaves behind a small remnant of prey that is
  then eaten by vultures.
- [ ] 8. In the debug-menu-extended zoom mode one should be able to zoom out far
  enough to see the whole continent. So far this is prevented both by not being
  able to zoom out far enough and by haze obscuring the view. In the zoom range
  reachable only via the debug extension, no haze should be shown.
- [ ] 9. When paddling through water in the canoe and the crocodile random event
  fires, a hint still appears suggesting one should better travel by canoe —
  although one already is.
- [ ] 10. When something is discovered — such as a waterfall — it should be
  announced via the journal.
- [ ] 11. The water in some lakes looks oddly blotchy and the blotches flicker
  while walking — e.g. in Lake Victoria.
- [ ] 12. The blood stain of dying animals has gaps and looks more like a
  Pac-Man.
- [ ] 13. More variety in the journal entries for the different villages. These
  should reflect locally/historically accurate peculiarities of each.
- [ ] 14. One should be able to recover even without medicine. Currently one dies
  even from a light wound.

## Closing (only after all points)

1. Full regression over the whole state.
2. Thorough dead-code / stale-doc / stale-comment cleanup — as separate commits,
   not mixed with feature commits.
3. Full regression again.
