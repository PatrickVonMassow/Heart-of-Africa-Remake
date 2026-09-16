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

## Second-leg review: finding 2

Measured on 2026-09-16, serially, in branch/main/main/branch order. Every run
executed the whole `src/scenes/place/bankGame.test.ts` file alone and passed all
54 tests. No other gate was launched by this author during these measurements.
The branch candidate was `d186d4f8480317fcbdeac03e7666bfc11726a552`; the baseline
was `origin/main` at `893110333ddff9f00867b5eb76f0a125edcf4839`.

| Run | Vitest duration | Test execution | ROCK case (previous timeout) | Traveller case (previous timeout) |
| --- | ---: | ---: | ---: | ---: |
| Branch 1 | 74.24 s | 72.95 s | 9.447 s | 9.896 s |
| Main 1 | 73.59 s | 72.36 s | 9.153 s | 10.045 s |
| Main 2 | 73.58 s | 72.30 s | 9.423 s | 9.863 s |
| Branch 2 | 73.28 s | 72.05 s | 9.447 s | 9.949 s |

Verdict: no reproducible slowdown of this suite on the branch. The branch's
mean wall time was 73.76 s against main's 73.585 s (+0.24%), with the second
branch run faster than either baseline run. Both former timeout cases remain
around 9–10 s, not the prior loaded run's 21–23 s. The measured result supports
load contention as the earlier timeout cause; it does not claim to recreate or
quantify that historical load.

`bankGame.test.ts` exercises pure simulation and does not mount `Walkers`.
These whole-file timings rule out a material bank-game regression attributable
to its added mount-time navigation grid. They do not measure place-mount cost.
The bank-game implementation, test file, Vitest configuration and lockfile are
identical to this baseline. No timeout or test assertion was relaxed.

Reproduction: the baseline's `src`, `scripts`, package files, TypeScript configs
and `vitest.config.ts` were extracted with `git archive` into the ignored
`local/wedged-adults-benchmark/main` directory inside this worktree; no branch
switch or other checkout was used. Both trees resolved the same installed
dependencies. Branch command: `npm run test:unit --
src/scenes/place/bankGame.test.ts --reporter=default --reporter=json
--outputFile.json=local/wedged-adults-benchmark/branch-1.json`. Baseline command:
`npx vitest run src/scenes/place/bankGame.test.ts --root
local/wedged-adults-benchmark/main --config
/workspace/hoa/.claude/worktrees/point-1138/local/wedged-adults-benchmark/main/vitest.config.ts
--reporter=default --reporter=json
--outputFile.json=/workspace/hoa/.claude/worktrees/point-1138/local/wedged-adults-benchmark/main-1.json`.
Second runs change only the report suffix to `-2`. Logs and JSON reports remain
in that ignored benchmark directory. An initial baseline launch with a relative
config path failed before collecting tests; correcting it to the absolute path
above produced the measured runs.
