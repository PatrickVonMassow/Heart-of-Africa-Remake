# Catcher station and arrival queue calibration

Measured on 2026-09-19 with the `village` and `frame` harness in
`src/scenes/place/tagShuffle.test.ts`: 400 simulated seconds per case at 60 Hz,
five children, layout colliders and the moving village crowd. Each segment
below is a completed `regroup`, rounded to 0.01 s. Shipped roaming uses
`roamSeconds = 55` / `roamGuardSeconds = 45`; shortened roaming uses `8` / `8`,
as in the polish suite's `children-bank-game` section. Other timings are shipped.

The catcher station radius remains 0.6 m. The stone approach now has its own
`arrivalApproachSeconds = 14`, restoring the old queue bound independently of
the group's 60 s walk backstop. Four villages/seeds at both roam settings give
zero backstop expiries; 14 s is therefore retained. This bounds waiting for
stone contact, while the longer regroup backstop allows catchers to walk the
full stretch after a side swap.

| Village | Seed | Roaming | Regroup segments (s) | Unfinished final segment (s) | Backstop expiries |
| --- | --- | --- | --- | --- | --- |
| Bambara | 42 | Shipped (55 / 45) | 8.33, 7.47, 8.27, 7.50, 12.90 | 3.18 | 0 |
| Bambara | 2972259115 | Shipped (55 / 45) | 8.38, 7.87, 8.40, 7.97, 8.40, 7.97 | — | 0 |
| Nubian | 42 | Shipped (55 / 45) | 16.38, 7.50, 16.40, 7.52, 16.38, 7.48 | — | 0 |
| Mandinka | 99 | Shipped (55 / 45) | 18.62, 7.93, 8.42, 7.95 | — | 0 |
| Bambara | 42 | Shortened (8 / 8) | 16.03, 7.67, 15.97, 7.92, 16.03, 7.67, 16.15, 7.87 | — | 0 |
| Bambara | 2972259115 | Shortened (8 / 8) | 8.33, 7.68, 8.22, 7.48, 8.18, 7.67, 14.08, 7.87, 8.38, 7.88 | — | 0 |
| Nubian | 42 | Shortened (8 / 8) | 16.38, 7.45, 16.40, 7.48, 16.38, 7.47, 16.40, 7.45 | 12.03 | 0 |
| Mandinka | 99 | Shortened (8 / 8) | 18.27, 8.23, 9.10, 7.90, 8.87, 7.65, 18.28, 8.20 | — | 0 |

The regression requires at least four completed regroups in every case and no
backstop expiry, including an unfinished final segment. Failure messages retain
the measured segments and roam settings. The focused occupied-stand regression
also varies the approach bound (0.7 / 2.3 s), checks that the runner waits at pace
zero until it expires, and verifies that expiry is silent while regroup still
has time left.

The previous shipped-roam measurements remain the evidence for the accepted
0.6 m catcher radius: Bambara@42 had a 62.05 s regroup at 0.2 m, versus
7.47–12.90 s at 0.6 m. That table missed the separate queue timeout coupling:
with the stone approach still using 60 s, shortened-roam Bambara@42 had two
62 s regroups, as measured in review. Separating the approach bound brings its
completed regroups to 7.67–16.15 s here.

Nubian@42 is clean at BOTH roam settings. Its earlier 62.05 s regroups were the
same occupied-stone queue defect, not a separate runner walking blockage; the
previous diagnosis was incorrect. It now completes six shipped-roam regroups
and eight shortened-roam regroups without a backstop expiry. Follow-up 1166
can be closed for this defect.

The one-tag rule, ROCK-only-on-contact guarantee, 0.6 m catcher station radius,
`reachDistance * 0.6` (1.32 m) charge-frame bar, 60 s regroup backstop and 205 s
cycle budget remain unchanged. Browser suites and pictures on both backends
remain with the reviewer. The settings/ground-detail failure remains assigned
to point 514.

## Verification

- Eight targeted village replays: passed (129.20 s).
- `npx vitest run src/scenes/place/bankGame.test.ts src/scenes/place/tagShuffle.test.ts`: pending.
- `npm run test:unit`: pending.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npm run typecheck:test`: passed.
