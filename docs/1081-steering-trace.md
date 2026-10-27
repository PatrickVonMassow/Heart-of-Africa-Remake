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

## Next

- Decide B: legitimate cornered flight or steering defect (flee heading
  should slide along the edge rather than rotate into it).
- Judge any fix over the 66-pair sweep, not one seed; then replace the
  crowded case's single bambara sample with tag-round villages and re-derive
  or remove `CROWDED_CADENCE_GATE`.
