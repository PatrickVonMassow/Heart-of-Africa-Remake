# Catcher station calibration

Measured on 2026-09-19 with the `village` and `frame` harness in
`src/scenes/place/tagShuffle.test.ts`: 400 simulated seconds per case at 60 Hz,
five children, shipped phase timings, layout colliders and the moving village
crowd. Each number below is a completed `regroup` segment, rounded to 0.01 s.

| Village | Seed | Station radius | Regroup segments (s) | Backstop expiries |
| --- | --- | --- | --- | --- |
| Bambara | 42 | 0.2 m | 8.23, 7.60, 62.05, 7.82 | 1 |
| Bambara | 42 | 0.6 m | 8.33, 7.47, 8.27, 7.50, 12.90 | 0 |
| Bambara | 2972259115 | 0.6 m | 8.38, 7.87, 8.40, 7.97, 8.40, 7.97 | 0 |
| Mandinka | 99 | 0.6 m | 18.62, 7.93, 8.42, 7.95 | 0 |
| Nubian | 42 | 0.2 m | 62.05, 7.65, 62.05, 7.63 | 2 |
| Nubian | 42 | 0.6 m | 62.05, 7.50, 62.05, 7.52 | 2 |

The shipped radius is now 0.6 m. Both Bambara seeds and Mandinka confirm it;
the regression tests require at least four completed regroups per case and no
backstop expiry, including an unfinished final segment. The Bambara@42 test
failed against the original 0.2 m radius on the 62.05 s segment. The 60 s
regroup backstop and the `reachDistance * 0.6` (1.32 m) charge-frame assertions
remain unchanged.

Nubian@42 has a separate runner blockage, reproduced before and after this
change. At the two expiries, child index 3 is a runner 2.682/2.692 m from its
station at 0.6 m, beyond the unchanged 2.2 m runner arrival radius. The waiting
non-tapper catcher is already within its radius (0.579/0.583 m). At the original
0.2 m radius the runner is likewise outside (2.677/2.692 m), while the waiting
catcher is inside (0.199/0.188 m). Nubian is therefore recorded as an open runner
issue, not counted as a no-stall calibration success. Its behavior is outside
this catcher-tolerance correction.

Browser suites and pictures on both backends remain with the reviewer. The
reported settings/ground-detail failure remains assigned to point 514.

## Verification

- `npx vitest run src/scenes/place/bankGame.test.ts src/scenes/place/tagShuffle.test.ts`:
  passed, 2 files / 102 tests (336.43 s).
- `npm run test:unit`: passed, 511 files / 16,070 tests, 6 skipped (364.39 s).
- `npm run build`: passed.
- `npm run lint`: passed.
- `npm run typecheck:test`: passed.
