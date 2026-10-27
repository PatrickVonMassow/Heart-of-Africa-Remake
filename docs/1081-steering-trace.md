# Point 1081 — crowded-case trace (checkpoint, 27.10.2026)

Measured on `main` 2e5102147 with the crowded construction
(`adultsAmongTheChildren`), 60 s at 60 fps, worst child share per cadence.
Probes: `docs/1081-probes/` (copy to `src/scenes/place/*.test.ts` to run;
the trace probe needs a one-line hook in `moveChild`, see its header).

## 1. The spec's sample no longer fails

- bambara-village/2972259115, mandinka-village/99 and /42, nubian-village/42:
  0.00 % at every cadence. All four play the BANK round now, which roams the
  whole settlement, so the adults planted in the quarter rarely meet a child.
- The episode lives in the TAG round (villages without a bank): 66 pairs
  (maasai, hausa, swahili, zulu, san, tuareg × seeds 1–10, 99): 19 pairs read
  above 0, native 60 fps up to 0.54 % (maasai/4), 0.45 % (swahili/5),
  0.42 % (san/6), 0.40 % (hausa/2) against the 0.25 % `shareGate`.

## 2. The adults are not the cause

In every traced episode the nearest adult stands 3–7 m away. The obstacle is
STATIC (`world.blocked`, not `occupied`):

- **A. Released commitment at a thin barrier** (swahili/5, chaser, t≈31.1 s):
  a thin static obstacle 0.04–0.4 m ahead along the wanted heading, open
  ground beyond. `wayOpen` samples only from 2 footprints (0.6 m) outward, so
  it reads the way OPEN, `releaseEdge` drops the side every other frame, the
  next step deflects ~150° again: 1.56 m walked inside 0.13 m.
- **B. Cornered evader at the ground's edge** (maasai/4 t≈6.2 s, hausa/2
  t≈10.4 s): the flee heading points into a wall 0.15–0.5 m away; the child
  slides, deflects, the desired heading keeps rotating with the chaser, then
  the run is held (`turnBeforeRun`) and resumes on the committed course:
  ~1.0–1.1 m inside 0.27–0.30 m.

## 3. A tried fix that is NOT proven

Sampling `wayOpen` from half a footprint (fixes A at swahili/5) changes the
paths chaotically: 24 of 66 pairs above 0 afterwards instead of 19, the worst
unchanged (maasai/4 is episode B). Reverted; not committed.

## 4. Re-trace 27.10.2026 (second author): playmates, not static edges

Classifier probe (`classifyProbe`, window = metric `worst.clock` .. +1 s;
the first trace read the second BEFORE the window start). Over the 13 worst
tag-round episodes of the baseline sweep:

- **11 of 13: a playmate pushes the child back.** Separation displacement
  inside the window 0.35–1.44 m against ~1.3 m walked. Shape: two (or three)
  evaders at the floor pace head-on (headings ~150–180° apart), or jammed
  against a wall with the flee pointing into it; playmates are no walls to
  each other (`PlaceLife` wiring, rejected 12.08.2026), so the separation
  is the only thing between them and each walks into the other.
- 7 of 13 show a desired-heading jump of 73–169° in the window. Traced at
  maasai/4 child 1 (t 5.95): the wall deflection turns the course past the
  flee/inward opposition; `evadeHeading` gets that deflected course as
  `current` and flips to the other rim direction (-280° -> -69°); the
  child turns on the spot (`turnBeforeRun`) and runs head-on into child 0.
- Only swahili/5 (chaser, episode A) has no playmate contact.

## 5. Fix attempts, all judged on the 66-pair sweep (native / sum of worst shares)

Baseline: 19 pairs > 0, 6 >= gate, max 0.54 %, sum 3.50 %.

| attempt | >0 | >=gate | max | sum | verdict |
|---|---|---|---|---|---|
| `evadeHeading` hinted with the runner's own last flee, not the deflected course | 28 | 8 | 2.23 % | 8.62 % | worse |
| keep-right: head-on playmates within 3 radii both veer 45° | 26 | 7 | 1.33 % | 5.99 % | worse |
| flee slides to nearest walkable heading (static predicate) | 52 | 30 | 6.96 % | 36.53 % | far worse (rim flip) |
| `releaseEdge` also requires `nearWalkable(desired)` | 17 | 4 | 0.54 % | 3.14 % | noise: 2-12 frames max 0.62 -> 0.76 %, worst pair unchanged |

None converged; all reverted. Probes: `sweepProbe` + `sweep.sh` (4 shards,
~70 s for 66 pairs) + `sum.mjs`; `classifyProbe` and `traceProbe` need the
one-line hook `(globalThis as any).__t1081?.(c, desired, steer, heading,
moved, blockedAt, len, look, stopAt, world)` after the substep loop in
`moveChild`.

## 6. Held passing side (27.10.2026, after the main merge)

Head-on playmates (other child within 3 radii, inside ±45° of the wanted
heading, headings > 120° apart) both turn the SAME way by `veer`, held for
`hold` seconds (field `passFor`). Native / worst cadence, sum of worst shares:

| veer / hold | >=gate native | max native | sum native | >=gate worst cadence | max any cadence |
|---|---|---|---|---|---|
| baseline | 6 | 0.54 % | 3.50 % | 9 (2-12) | 0.62 % |
| 45° / 0.5 s | 2 | 0.88 % | 2.23 % | 4 (20 fps) | 0.90 % |
| 45° / 0.5 s, only where walkable | 6 | 0.37 % | 2.85 % | 8 (2-12) | 0.79 % |
| 30° / 0.5 s | 5 | 0.93 % | 3.02 % | 9 | 0.93 % |
| 60° / 0.5 s | 2 | 0.45 % | 2.32 % | 7 | 0.65 % |
| 45° / 0.2 s | 4 | 0.68 % | 3.28 % | 8 | 0.73 % |
| 45° / 0.3 s | 1 | 0.25 % | 1.84 % | 5 | 0.45 % |
| 45° / 0.4 s | 3 | 0.56 % | 2.74 % | 3 | 0.85 % |
| 40° / 0.3 s | 3 | 0.42 % | 2.15 % | 4 | 0.45 % |
| 50° / 0.3 s | 4 | 0.51 % | 3.08 % | 7 | 0.90 % |

Every variant lowers the sum (6-47 %), so the playmate cause is confirmed;
none holds every pair under the 0.25 % gate at every cadence, and the best
(45°/0.3 s) has no robust neighbourhood. Taking it would pin a lucky
parameter the way the old case pinned a lucky seed. Not committed.
Residual episodes after the pass: the veer itself turning an evader into a
wall (zulu/99 at 45°/0.5 s), then the `evadeHeading` flip of section 4.

## Next

- The dominant cause is playmate head-on contact at the floor pace (section 4).
  A cure must either let two evaders pass each other without re-deciding
  every frame (a stateful side, not a per-frame veer) or stop the
  `evadeHeading` flip without locking the side (attempt 1 locked it).
- Judge any fix over the 66-pair sweep, not one seed; then replace the
  crowded case's single bambara sample with tag-round villages and re-derive
  or remove `CROWDED_CADENCE_GATE`.
