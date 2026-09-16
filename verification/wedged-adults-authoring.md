# Wedged adults: authoring review answers

1. Evidence is now available. Read the PNG, state JSON, overlay JSON and text
   report in `local/ErwachseneEingeklemmt/`. They identify production `13ad4a7`,
   WebGPU, seed `3321422240`, `bambara-village`, day `34.134846585692`, and
   `walkerUnstuckSeconds: 4`. The picture shows the adults overlapping the
   fence beside the dwelling. The overlay contains HUD, and the state has no
   adult positions; this is evidence of the reported appearance, not a movement
   trace. Both steppers currently leave the body in place when their ring
   searches fail. The missing-evidence escalation is resolved.

2. Retain each errand villager's resolved spawn in a separate `spawnAnchors`
   array, independent of its mutable walking position. The memo test moves
   every villager and checks that the nudged anchors remain fixed. No dwelling
   ownership is introduced; walkers already have `def.home.door`.

3. Both steppers call `escapeToFree` in `collision.ts`: default rings, 24 rings,
   then the nearest free nav cell by Euclidean distance, or the caller's anchor
   if the grid has no free cell. Both assign the placement before retiring an
   errand. The port and village `<Walkers>` calls both have `radius` and `bank`
   in scope and now pass them to build the escape grid. Pure unit tests cover
   each rung, including enclosure beyond both searches.

4. Walker navigation remains unchanged; its grid is read only by the escape
   helper. The existing `balance.walkerUnstuckSeconds` bounds both steppers.
   Tests execute the production escape blocks with a non-default window and
   all four outcomes, asserting body placement, timer reset, route invalidation,
   and task retirement after placement. No second timer or walker path planner
   was added. Browser suites and the moving-adult picture comparison on both
   backends remain the reviewing session's responsibility, per the commission.

## Verification

Code candidate: `b5ffc5172d40c0f312e0a956f11eeedd2fc9d9f7`.

- `npm run build`: passed (exit 0).
- `npm run lint`: passed (exit 0).
- `npm run test:unit`: failed (exit 1), 501 files passed, one failed;
  15,517 tests passed, two failed, six skipped. The failures were unchanged
  `bankGame.test.ts` cases at lines 291 and 882, each exceeding 20 seconds
  (21.890 s and 22.535 s). The escape and caller tests passed.
- Diagnostic rerun of only those two bank-game cases: both passed without
  changes, in 11.777 s and 12.987 s. Command:
  `npx vitest run src/scenes/place/bankGame.test.ts -t 'calls ROCK once with nobody arriving|walks round the traveller instead of stopping the game'`.
  Multiple independent Vitest runs were active during the full gate; contention
  is a plausible cause, not an established baseline verdict. This diagnostic
  does not convert the full gate to green. No timeout, assertion, or bank-game
  code was changed.
- Browser suites: not run, as instructed. The reviewer owns the reported-seed
  village picture comparison on WebGPU and WebGL 2.

The review clarification sufficed; no specification blocker remains. The full
unit gate remains open because of the two timeouts above.

## Second-leg review: finding 1

Confirmed and fixed: a spawn-free pinned position was accepted without movement,
including a nearby standing-clear pocket cell on the grid rung. Escape ring
searches now require `balance.walkerUnstuckMinDistance` (calibratable, initially
0.6 m), and the grid scan rejects cells below the same minimum. Ordinary spawn
nudging retains its zero-distance behavior. Only the home anchor is exempt.

Added regression cases for an already-free pinned body, calibration across near
and wide searches, a standing-clear grid pocket inside walls beyond both ring
searches, and a nearby home fallback when no cell satisfies the minimum. Both
production caller blocks now exercise the spawn-free and grid-pocket cases and
assert the body's displacement against the configured minimum after the window.

Validation: `npm run test:unit -- src/scenes/place/collision.test.ts
src/scenes/place/PlaceLife.escape.test.ts` passed: 2 files, 47 tests, 1.40 s.
