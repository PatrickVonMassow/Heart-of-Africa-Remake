# Natural villager motion — merged concept (work-order point 1316)

The merged, ordered concept of the blind-parallel stage of point 1316 (CLAUDE.md §6,
procedure a–c of the point). Half A (Claude Opus 5.5, 24 entries) and half B
(GPT-6 Astra, 15 entries) were written blind from the same code, pipeline, clips and
sheets; Claude Fable 5.1, which wrote neither, re-measured every claim the fold relies
on, decided the disagreements with reasons and counted the fold through
`scripts/blind-merge.mjs`. The counted union is `docs/four-eyes/1316-union.json`
(U1–U20; every A and B id appears in exactly one entry), the raw halves are
`docs/four-eyes/1316-blind-{a-opus55,b-astra}.{md,json}`, provenance is
`docs/four-eyes/1316-provenance.md`. This document is the concept the final
cross-vendor "does this break anything" check (procedure c) judges before the first
implementation commit. The first check (GPT-6 Astra, 055dab0, do-not-merge) raised six
objections; §8 records how each was answered.

## 1. What was re-measured (worktree at 7a64a6747)

The numbers below are the merger's own, read with a plain GLB parser from
`public/models/villager.glb` and by viewing the tracked clip sheets; they decide the
folds, not either half's word.

| Measurement | Result | Consequence |
|---|---|---|
| Skeleton | 21 joints; `hips` and `spine` share head and tail (`skeleton.py:13-14`); MH `spine_01+02` summed into `spine` (`:64`); UAL1 `DEF-spine.002` dropped (`:72`) | the trunk has two pivots (pelvis, spine-2); a three-way lean distribution is impossible without a re-head (U2) |
| `spine` channel | 0.0° on all axes in walk, sprint, idle, kneel*, carry, carryIdle; only the authored dig writes it (20–26° pitch) | A3 confirmed for every retargeted clip |
| Walk trunk | chest pitch 16.4/18.2/20.0°, neck −9°, head +6°; hips yaw ±2°, roll ±2.5°, lateral x −0.025..0.031, vertical 0.043 | hunched source (U6); pelvic secondary motion already in the clip (U12) |
| Walk feet | ankle x stays +0.082..0.093 (L) and −0.093..−0.082 (R) for the whole cycle | **A8's "feet cross the midline" refuted**; no step-width offset |
| Sprint trunk | hips pitch 22.7° constant; chest 25.7/31.5/38.5°, chest yaw ±27–29°; head z 0.29–0.32 ahead of the hips | a ~50° dive (U6); the tag lean stacks on it (U15) |
| Idle | hips yaw −13.3°, head yaw +11.0° constant; feet staggered (L z +0.09, R z −0.23) | A10 confirmed; matters once the idle is a runtime base (U9) |
| Dig keys | shaft 60° from horizontal at t = 0 and 0.45, 45° at 0.85, 22° at 1.30, 16° at 1.70; head fixed 0.12 rad; extra-lean search up to 0.9 rad folds the trunk onto the upper hand | **A12's "25–35° for most of the stroke, never near-vertical" refuted**; the "hand at the chin" is the trunk folding down, not the hand rising (U7) |
| Dig clocks | `DIG_PERIOD` 2.4 s (toolclips.py:199) vs `DIG_CYCLE_SECONDS` 1.5 s (gesture.ts:472) counted by `adultWork.ts:307` | B8 confirmed (U7) |
| Leg solve | `solveLimb` on both legs every frame, pole (0,0,1), hips height untouched by the stride warp, toe never re-written, holds x/z only, `plantRelease` moves a held anchor | A13 and B5 confirmed (U8) |
| Layer masks | gait layer = `LEGS` + free arms; `UNWRITTEN` resets toes and clavicles; trunk/neck/head code-written; contacts solved before `applyClipLayers`; `unsquashHead` writes identity at squash 1, twice per frame | A14/A15/A17/A22, B4/B7 confirmed (U9, U10, U13) |
| Grip morphs | `grip.L/R` survive `bakeMorphs` and die in the hang bake (`villagerFigureBody.ts:112`); no runtime reads `clip.grip` | B2's strongest finding (U3) |
| Turn | `walked = ahead ± (aside + turned·turnStep)`, `turnStep` 0.4 → a stationary quarter turn "walks" 0.63 units | A18/B6 confirmed (U11) |
| Tag | `lean = max(runLean, shown.lean)` with `TOUCH_LEAN` 0.5; `chaserGaze` turns the trunk; `CHASER_ARMS` both forward, both count as contact arms; `caughtSlumpLean` 0.48 with an `// OPEN` against 0.20 | A21/A23, B12/B13 confirmed (U15, U16) |
| Pick-up | one beat exists: the jar fill (`adultWork.ts:669-683`), drawn as a y-squash of the whole group (`PlaceLife.tsx:3189-3194`) and two prop visibilities | B9 names the caller A24 was unsure of (U17) |
| Sources | pinned UAL1 (CC0, sha256) holds `Jog_Fwd_Loop`, `PickUp_Table`, `Interact`, `Idle_Talking_Loop` unused; `UAL2_Standard.glb` + licence on disk, pinned at 98069fa23, removed at 74ff3d00d | A6/A7 confirmed (U5) |
| Sheets | `sheets.py:175-177` names `g-cloak-chest`/`g-cape-chest` (gone); sheets render raw clips; body/clips/garments caches unkeyed | A1/A2/B1 confirmed (U1) |
| Penetration gate | build pose no worse than main (active); motion comparison skipped by owner decision until point 1334; 28 of 32 garments over tolerance in motion on main | the gate this point keeps green is the gate as it stands (U1) |
| Low preset | `placeFigure.tsx:34-50`: primitive figure "unchanged (user decision 04.10.2026)" | B14 rejected (U20) |
| Runtime clips | the runtime reads walk, sprint, carry, carryIdle, dig only; idle and kneel* are exported and unused | U6's idle item and U9's kneel item are conditional on the base change |

## 2. Constraints every step keeps green

1. **Garment penetration gate (points 1312/1314):** `node scripts/villager/build.mjs
   penetration` — build pose no worse than main, and the motion comparison the moment
   point 1334 un-skips it. Never a raised tolerance, a wider mask or a dropped layer.
2. **No foot sliding (point 1295):** the held-contact rule stays; the test limit
   0.004 person units per frame; from step 5 on (the jog) the limit holds across the
   whole speed ramp and is a merge requirement of every step that moves a gait.
3. **CC0 sources only**, each recorded in `scripts/villager/sources.json` with origin,
   immutable URL, licence id and the sha256 of the downloaded bytes.
4. **Calibratable values in `src/config/balance.ts`** with units, never scattered in
   code; the offline subset reaches Python through the existing `pipelineConfig`.
5. **No new runtime dependency.** Three's own math and the existing pure samplers;
   no AnimationMixer rewrite, no IK or motion-matching package.
6. **WebGPU primary, WebGL 2 fallback:** every picture on both backends; all pose work
   on the CPU through the existing TSL material path; identity kept across a preset swap.
7. **Low preset untouched** (user decision 04.10.2026): the primitive figure keeps its
   own gait; nothing here changes it.
8. **The cheap gate per step:** `tsc`, `npm run build`, `npm run lint`,
   `npm run test:unit`, the covering suite rung, and the both-backend picture where a
   step moves the picture; pipeline steps add the penetration gate, the dress sheets
   and a low-preset load.

## 3. Ordered implementation steps

Each step names its union entry, the files it touches, how it is verified and which
constraint it must keep. The order is chosen so that measurement precedes change, the
one rig change precedes everything that depends on the bone list, and every later
step is judged on the composed runtime pose rather than on a raw clip.

### Stage 0 — measurement tools

**Step 1 (U1) — Verification baseline.** Repair `OUTFITS` in `scripts/villager/sheets.py`
(derive the outfit ids from the garment list so a renamed garment can never break the
sheet again); add a runtime-composition sheet fed by pose sequences exported from the
game's own pose code (a Vitest-side exporter writing, per frame, the figure group's
root transform including its scale — the jar-fill y-squash — every bone's local
translation, rotation and scale, and the active morph weights, as JSON through
`gamepath.py`) for walk, turn, run, dig, pick-up, point, chaser and caught child — the
before/after strip; feed those same composed poses through the Python penetration
evaluator; label every frame with time and camera; key the body,
clips and garments caches on their inputs as the mask already is.
*Files:* `scripts/villager/{sheets.py,gamepath.py,pipeline.py,penetration.py}`, a small
exporter beside `src/render/villagerClipPose.test.ts`.
*Verified:* `build.mjs sheets` exits 0; the runtime sheet exists for all eight
subjects; a round-trip check reconstructs world joint positions and morph weights in
Python and matches the runtime's within 1e-4 before any sheet or penetration run uses
the export as evidence; identical cold/warm cache digests (unit); penetration report
unchanged.
*Keeps:* constraint 1 (this step defines its scope), 4.

### Stage 1 — rig

**Step 2 (U2) — Three-segment spine.** Re-head the chain: `hips` (short pelvis),
`spine` from the lumbar joint, `spine1`, `chest`; map MH `spine_01/02/03` and UAL1
`DEF-spine.001/.002/.003` one-to-one, UAL2 `spine_01..03` likewise; 21 → 22 bones.
Check axes, bind matrices and normalized weights before the export; update every
`bones.spine/chest` user and `BONE_NAMES`.
*Files:* `scripts/villager/{skeleton.py,clips.py,toolclips.py,gamepath.py,penetration.py,export.py}`,
`src/render/villagerFigureBody.ts`, `src/scenes/place/{gltfClipLayers.ts,skinnedFigure.tsx}`,
`src/config/balance.ts`.
*Verified:* Vitest bone count and parent order; the penetration gate; garment and
dress sheets; the glb loads on both backends; low preset unaffected.
*Keeps:* 1 (this is the step the gate was written for), 6, 7. **Risk high**; it lands
alone, before anything downstream.

**Step 3 (U3) — Hand morph contract.** Carry `grip.L/R` through the hang bake (deltas
through the same linear skin map, zero deltas for garment vertices), drive the weights
from the action state (dig and carry grip, point), add `point.L/R` and `relax` shapes
from the MH finger weights. No finger bones.
*Files:* `scripts/villager/body.py`, `src/render/{villagerBody.ts,villagerFigureBody.ts}`,
`src/scenes/place/gltfClipLayers.ts`.
*Verified:* morph count and delta-transform unit checks; hand close-up sheet; fists
around the shovel in the runtime sheet; penetration gate with the morphs active.
*Keeps:* 1, 6.

Step 4 is a conditional decision and does not run here; it follows step 9 (below).

### Stage 2 — clips

**Step 5 (U5) — Clip library and support metadata.** Re-pin UAL2 with its licence and
sha256, add `MAPS['UAL2']`; retarget `Jog_Fwd_Loop` as `jog` and make `gaitAt` a
walk → jog → sprint blend by speed (`jogThreshold`/`sprintThreshold` bands in
`balance.ts`, all three rotated to left-heel-strike phase 0); export per gait clip the
heel/ball/toe contact intervals and the seam size; refuse a loop seam above a
calibratable limit instead of smearing it.
*Files:* `scripts/villager/{sources.json,clips.py,skeleton.py,export.py}`,
`src/render/{villagerRig.ts,villagerAsset.ts}`, `src/config/balance.ts`.
*Verified:* `build.mjs fetch` checks the hashes; Vitest `gaitAt` weights sum to 1 and
`phasePerUnit` is continuous across both bands; the no-slide test's walk↔sprint band
exemption removed and the 0.004 limit held across the whole speed ramp (both sexes,
all ages, build extremes, 30/60/120 Hz) as this step's merge requirement — if it
fails, the contact correction it needs lands in this step; contact-fraction and knee
plots per clip; jog sheet.
*Keeps:* 2, 3, 4.

**Step 6 (U6) — Clip style normalisation.** `VILLAGER_ASSET.clipStyle` offsets applied
in the pipeline: walk chest −12° and arm hang (elbow 15–25°, upper arm closer);
sprint hips pitch removed (kept as the retarget's rest delta), chest pitch to 10–12°
and yaw to ±12°; idle de-staggered with its constant yaws removed (effective once
step 9 makes it the standing base). No step-width change (measured: none needed).
*Files:* `scripts/villager/clips.py`, `src/config/balance.ts`.
*Verified:* trunk angles re-read from the glb (sprint hips 0°, chest < 15°); walk and
sprint sheets; the no-slide measurement re-run by the pipeline.
*Keeps:* 2, 4.

**Step 7 (U7) — Dig as an event-driven whole-body action.** Keep the authored blade
path and shaft-roll protection; name the phases (set, press, lever, lift/throw,
recover); one action clock for animation and progress with a strike event at blade
contact (replacing the 1.5 s counter against the 2.4 s stroke); both grips solved on
the final body of every corner; the extra-lean search bounded so the trunk no longer
folds onto the hands; neck and head aimed at the blade; hands apart on the shaft;
knee poles outward; optional foot press on the tread at the set.
*Files:* `scripts/villager/toolclips.py`, `src/scenes/place/{adultWork.ts,PlaceLife.tsx,gltfClipLayers.ts,skinnedFigure.tsx}`,
`src/render/gesture.ts`, `src/config/balance.ts`.
*Verified:* Vitest one progress event per displayed strike under variable dt, pause and
interruption; hand-miss, clearance and max-turn prints under their bounds; dig sheet
side and quarter; in-game digging picture at contact and lift, both backends;
penetration gate (dig is a dressed pose).
*Keeps:* 1, 4.

### Stage 3 — runtime layering

**Step 8 (U9) — One pose pipeline.** A fixed evaluation order in `retarget`: full-body
clip base (idle/walk/jog/sprint/kneel/dig including trunk, neck, head and clavicles)
→ masked action layers (carry arm, pick-up) → additive deltas (step 9's lean and gaze,
step 11's shoulders, the elder stoop, the gesture turn) → pelvis height and the
corrective leg solve of step 10 (the last pass that moves the pelvis or trunk) → hand
contact solves on that final body → hand shapes and props last. Every hand-contact
error is measured on the fully composed pose. One gait clock: the code walk's
counter-yaw and arm swing are dropped for the glTF body where the clip supplies them,
the stray `−walk.hipYaw` goes, `m.phase` stays for the primitive figure and the plant
bookkeeping; `unsquashHead` moves to the end and composes with the gaze. The exported
kneel clips may replace the procedural `kneelBlend` on the glTF body in the same order.
*Files:* `src/scenes/place/{gltfClipLayers.ts,skinnedFigure.tsx}`, `src/render/figureWalk.ts`.
*Verified:* Vitest with zero code lean the trunk bones equal the clip's; every contact
Vitest and Playwright section (pounding, loom, fishing, hand on stone) green; the
runtime walk sheet; village-walk picture on both backends.
*Keeps:* 2, 6. **Risk medium–high** (every vignette publishes virtual pivots; keep the
adapter until all callers hand over semantic intent).

**Step 9 (U10) — Distributed lean and gaze.** Two pure functions in `figureRig.ts`:
`distributeLean(pitch, yaw)` over spine/spine1/chest with weights in `balance.ts`
(hips only where the legs are re-solved under it; no bone above 35 % of the total),
replacing every single-joint lean (`contactLean` re-searched through the distributed
chain so hands still land, elder stoop, gesture lean, tag lean, caught slump); and
`aimHead(target | horizon)` over chest (yaw share) → neck 0.4 → head 0.6 with limits
(yaw ±70°, pitch −40…+30°) and frame-rate-independent damping, defaulting to the
horizon along the heading and fed by context (speaker, pointed spot, blade, hand in a
contact, quarry, ground ahead for the slump), tightened under a head load.
*Files:* `src/render/{figureRig.ts,gesture.ts}`, `src/scenes/place/{skinnedFigure.tsx,PlaceLife.tsx,tagGame.ts}`,
`src/config/balance.ts`.
*Verified:* Vitest `lean is distributed`, `gaze hold` (head forward within 3° of the
target under a 0.3 rad lean and a gait cycle; limits respected; no flip behind/above);
look-while-walk sheet; in-game picture.
*Keeps:* 1 (garments twist with the chain — the gate decides), 4.

**Step 4 (U4, conditional; decided after steps 3, 7 and 9) — Forearm twist.** Only
if the dig and point runtime sheets taken after steps 3, 7 and 9 still show the wrist
wringing: `forearmTwist.L/R`, weights split from the MH forearm by distance; a second
rig change. If the bones are added it repeats step 2's whole acceptance: axes, bind
matrices, normalized weights, Vitest bone list, penetration gate, garment and dress
sheets, low preset, glb load on both backends. If not, the decision and its sheets are
recorded and the step closes without code.
*Keeps:* 1, 6, 7.
*Decision (point 1354, 18.10.2026): no forearm-twist bones; the step closes
without code.* Read on the runtime sheets taken after steps 3, 7 and 9
(`verification/villager-body/runtime-dig-{side,az35}.png`,
`runtime-point-{front,az35}.png`, regenerated by point 1354): both fists hold
the shaft through the whole stroke and the pointing hand follows its forearm
with no candy-wrapper twist at the wrist visible at sheet or play distance. A
second rig change, with step 2's whole acceptance, is not bought for a defect
the sheets do not show; it is reopened if a close-up picture of step 14's
point or step 17's grasp shows the wrist wringing.

**Step 10 (U8) — Corrective leg IK and contacts.** In `clipGaitPose`: the pole from the
clip's own knee (blended to the forward pole as the leg straightens); the solve only
when the held target misses the clip's ankle by more than a calibratable ~2 mm; the
pelvis lowered to what the warped stride needs and back to clip height when not; the
toe re-written at push-off so the ball stays flat while the heel rises; contact state
from step 5's support intervals with the height threshold as fallback; persistent
per-contact anchors; the leg solve as the last pass that moves the pelvis, after
every trunk layer and before the hand contacts (step 8's order). The 1295 holds and
`plantRelease` stay as the safety net; the test's band exemption is already gone with
step 5.
*Files:* `src/render/villagerClipPose.ts`, `src/render/villagerClipPose.test.ts`,
`src/config/balance.ts`.
*Verified:* Vitest `corrective leg IK keeps the clip's leg when nothing is held`
(locals equal the clip's within 1e-4), `hands land on the final body` (hand-contact
error after the pelvis drop within the contact tolerance), `held foot still holds` (< 1 mm drift over a
cycle at 0.75/1.0/1.35 stride), the no-slide limit across the whole speed ramp, both
sexes, all ages, build extremes, at 30/60/120 Hz; Playwright `walk-move` section.
*Keeps:* 2, 4.

**Step 11 (U13) — Posable clavicles.** Remove `shoulder.L/R` from `UNWRITTEN`; add a
`shoulders` field (protraction, elevation per side, default 0) to `FigurePose`, written
as an additive after the clip; clavicle poses enter the penetration pose list.
*Files:* `src/scenes/place/gltfClipLayers.ts`, `src/render/gesture.ts`, `scripts/villager/penetration.py`.
*Verified:* Vitest default 0 leaves the clip's clavicle; penetration gate (toga, cloak, cape).
*Keeps:* 1.

**Step 12 (U11) — Turning.** For the glTF body track travel, facing and turn phase
separately; the gaze takes the steering's desired heading (head lead); on the move a
roll of the distributed chain proportional to yaw-rate × speed (`curveLeanMax` ~6°) and
a shortened inside stride; at rest a procedural step turn (a step is one foot's lift and plant; each step
rotates that foot ≤ 90° and the body heading ≤ 45°, both in `balance.ts`; inner foot
lifted with the walk's swing-phase foot shape played sideways and planted at the new
heading under the hip, outer foot follows, held contacts pivot on the ball), replacing
the `turned·turnStep` distance; signed travel. Authored turn clips only later, if the
step turn does not read.
*Files:* `src/render/{figureWalk.ts,villagerClipPose.ts}`, `src/scenes/place/{skinnedFigure.tsx,PlaceLife.tsx,tagGame.ts}`,
`src/config/balance.ts`.
*Verified:* Vitest a 180° spot turn takes 4–6 steps (≥ 4 by the 45° heading bound)
with no planted contact moving more than 1 mm; idle 45/90/180° and S-curve scenarios; turn sheet; in-game picture of a
villager turning to face the player, both backends.
*Keeps:* 2, 4.

**Step 13 (U12, check) — Pelvic secondary motion.** Read step 1's runtime front sheet
after steps 6 and 8; add a stance-side pelvis shift only if the pelvis is static.
Measured today the clip already carries it, so this most likely closes without code.
*Closed without code (point 1354, 18.10.2026):* the runtime walk front sheet
after steps 6 and 8 (`verification/villager-body/runtime-walk-front.png`)
shows the pelvis rolling and shifting over the stance side with the clip; it
is not static, so no stance-side shift is added.

*Step 10 as built (point 1354):* the corrective solve keeps the clip's own
hinge and twist (knee turned about the clip's hinge, thigh swung by the
shortest turn), so its dead zone is 0.5 mm, not ~2 mm (a 2 mm dead zone would
itself leave a held foot 2 mm off its hold). Holds stay by height: gating them
by the support intervals left a contact unheld at the walk↔jog band (slide
0.008). `held foot still holds` measures heel and ball; `// OPEN:` the toe
tip drifts up to 1.9 mm while the clip's toe flexes under a held ball (the
same on main), and bending the toe onto the tip's hold broke the full-ramp
no-slide test, so the toe keeps the clip's push-off.

### Stage 4 — actions and poses

**Step 14 (U14) — Point and reach.** Point: gaze first, arm 0.15 s later, forearm
near-straight (0–0.1 rad), point hand shape, clavicle protracted ~0.1 rad, chest a
quarter toward the target, line and arm kept across a target crossing, the other arm
free. Reach: hand position and orientation solved after the final torso, an
action-specific stable elbow pole, torso within range or a step requested, planted feet
undisturbed.
*Files:* `src/render/{gesture.ts,figureRig.ts}`, `src/scenes/place/skinnedFigure.tsx`, `src/config/balance.ts`.
*Verified:* Vitest sequence timing and target grids (heights, bearings, body sizes);
point sheet; in-game talk picture, both backends.
*Keeps:* 2 (feet), 4.

**Step 15 (U15) — Port-city tag chaser.** Pelvis and legs from the jog/sprint, the free
arm's counter-swing kept; lean = the run's only, ≤ 0.12 rad total and distributed,
`TOUCH_LEAN` not applied while running; gaze on the quarry (head and neck, 25 % chest);
as the quarry enters the commit window one arm blends from swing into a bent-elbow
preparation (a tag-own pre-aim, so the bank tap's no-fade-in rule is untouched), then
reaches horizontally at shoulder height with the clavicle protracted, aligned at the
authoritative catch frame to the actual target (hand readback kept), recovered after a
miss; `CHASER_ARMS` goes. Numbers: `chaserLeanMax`, `chaserReachElevation`, prepare
distance in `balance.ts`.
*Files:* `src/scenes/place/{tagGame.ts,PlaceLife.tsx}`, `src/render/gesture.ts`, `src/config/balance.ts`.
*Verified:* Vitest trunk pitch sum ≤ 0.15 rad, head within 5° of the quarry bearing,
reaching hand within 10° of horizontal; approach→catch and approach→miss trajectories
with run support and free-arm swing continuing; port-city picture on both backends,
judged by looking.
*Keeps:* 2, 4; catch semantics unchanged.
*As built (point 1343):* the glTF body draws its own pose (`FigurePose.body`,
taken by a skinned figure's pivots); the primitive keeps its chaser arms and
touch lean (constraint 7). The numbers are `VILLAGER_POSE.tagChaser`. The
readied hand stands `prepareReach` of the DRAWN arm along the pose's arm
direction (the virtual rig's proportions are not the drawn child's); the
grab names the world point on the quarry's surface. A pose with a reach
takes no contact lean, save the catch's last stride (`reach.lunge`), where
the hand may still fall short of the quarry at the 0.45 m catch ring — that
check stays point 1340's. Found on the way: a child's sprint (6.2–6.9 person
units/s) exceeded the walk's teleport speed (6), freezing its legs at full
run; raised to 10.

**Step 16 (U16) — River-bank caught child.** One definition for tag and bank: a short
brake-and-settle into a planted hold — trunk ~0.12 rad over spine/spine1/chest only
(hips 0), chest sunk, clavicles protracted ~0.25 rad and dropped ~0.1, head bowed
~0.35 rad by the gaze on the ground ~1 m ahead, arms hanging by gravity plus
0.05–0.1 rad forward with a slight elbow bend, one knee softened and the weight
shifted, a quiet hold, a blend back from that support state. `caughtSlump {trunk,
shoulderForward, shoulderDrop, headBow}` replaces `caughtSlumpLean`/`caughtSlumpArmRoll`
and closes that `// OPEN`.
*Files:* `src/scenes/place/{tagGame.ts,gltfClipLayers.ts}`, `src/config/balance.ts`.
*Verified:* Vitest hips pitch 0, trunk sum ≤ 0.15 rad, clavicle protraction > 0, no foot
drift and no whole-body squash through catch→settle→hold→resume; river-bank picture on
both backends at play distance.
*Keeps:* 2, 4.
*As built (point 1343):* `caughtBodyPose` with `VILLAGER_POSE.caughtSlump`,
eased in and out over `settleSeconds` per child (tag beat and bank round
alike); the arms are left at rest, so the clip hangs them and the protracted
clavicles carry them forward. `caughtSlumpLean`/`caughtSlumpArmRoll` remain
as the primitive's slump (its 0.20 roll is infeasible there; the `// OPEN`
is closed). `// OPEN:` one knee softened and the weight shifted needs a
per-leg pose on the standing legs; not built.

**Step 17 (U17) — Pick-up and the jar fill.** Retarget `PickUp_Table` (table height) and
`Farm_Harvest` (ground), cut down/hold/up; a `pickUp` work layer beside the dig (eased
over `transitionSeconds`) with phases approach → reach → grasp → lift → place/release,
gaze on the object, knees before back on low reaches, the hand corrected to the object
and closed at contact, one authoritative prop transform carried world → hand → crown
with its world transform preserved on re-parenting; the y-squash replaced by the clip's
bone-driven squat on the glTF body (the primitive keeps it); water-mouth alignment and
fill feedback kept; gameplay ownership changes at the grasp/release event with the
errand's outcome unchanged.
*Files:* `scripts/villager/{clips.py,export.py}`, `src/scenes/place/{gltfClipLayers.ts,adultWork.ts,PlaceLife.tsx,placeFigureContext.ts,skinnedFigure.tsx}`,
`src/render/gesture.ts`.
*Verified:* Vitest exactly-once grasp/release, continuous prop world position, no
segment-length change, cancellation before and after the grasp; pick-up sheet; in-game
jar at contact, lift and crown, both backends.
*Keeps:* 1 (new dressed pose), 2, 3, 6.

**Step 18 (U18) — Carry.** Load-specific additive poses (hand jar, head load, shovel)
over the normalised walk or UAL2 `Walk_Carry_Loop`; free-arm swing preserved; head
oscillation reduced under a head load; restrained load-dependent cadence, step width and
balance; the steadying or support hand solved against the final crown or prop frame
after locomotion and gaze.
*Files:* `src/scenes/place/{gltfClipLayers.ts,skinnedFigure.tsx,PlaceLife.tsx}`, `src/render/figureWalk.ts`,
`scripts/villager/toolclips.py`.
*Verified:* grip error over complete strides, turns and speed changes; crown attachment
and garment clearance; carry sheets and in-game pictures per load type, both backends.
*Keeps:* 1, 2, 4.

### Closing

**Step 19 (U19) — Calibration sweep and cost.** Every magnitude moved by steps 2–18
sits in `balance.ts` with its unit, the offline subset via `pipelineConfig`; bone
indices, masks and chain lengths precomputed per rig, pose buffers reused, one
evaluation per figure per frame; the animation cost of a representative village
measured on WebGPU and WebGL 2 against the pre-step-2 baseline.
*Verified:* config round-trip TS ↔ Python; 30/60/120 Hz trajectory equivalence; frame
time and allocations before/after on both backends.
*Keeps:* 4, 5, 6.

**Step 20 — Evidence the point owes.** The research document
`docs/research/natural-villager-motion.md` (final state 1; built from §1 of both halves
plus §1 of this document as the measured diagnosis, with the source table of §5
below); the before/after strip of step 1 for walk, turn, run, dig, pick-up, point,
chaser and caught child; the named Vitest cases of steps 9, 10, 15, 16; the port-city
and river-bank pictures on both backends; the cross-vendor code review record.

## 4. Disagreement resolution

| Topic | Half A | Half B | Decision and reason |
|---|---|---|---|
| Rig topology | A3: three-segment spine (22 bones), A4: forearm twist | B2: keep 21 joints; add a bone only after a demonstrated failure redistribution cannot solve | **A3 kept, A4 conditional.** Measured: hips and spine share one head, so a hips/spine/chest distribution has two pivots and cannot curve — exactly B2's precondition, met. B2's safeguards (axes, bind, weights, gate) are U2's acceptance. A4's evidence is a sheet whose hands are the dead-morph rest hand folded onto the shaft by the lean search; it is decided on the runtime sheets after steps 3, 7 and 9 (U3/U7/U10) and placed after step 9. |
| Leg IK | A13: corrective solve (clip-knee pole, solve on miss, pelvis height, toe roll), holds unchanged | B5: contact windows from support events, world anchors with terrain height, bounded pelvis, final-pose IK | **Both, in A13's order with B5's events and ordering.** Per-foot terrain height deferred to the backlog: the group stands at the root's ground height, no slope defect is measured, final state 3 asks for placement correction. `plantRelease` stays as the safety net; the band exemption of the test is removed in step 5, where the jog lands. |
| Upper body | A15: blend trunk/neck/head from the clip, code lean additive after | B4: one ordered evaluator, contacts last | **Folded (U9).** Same mechanism; B4 supplies the order, A14/A15 the measured defects. |
| Walk style | A8: pipeline offsets incl. a hip-abduction step-width fix for "feet crossing the midline" | B3: audition sources, author offline | **A8 kept minus the crossover; B3's audition not required.** Measured: the feet never cross (constant ±0.085). The pinned UAL1 stays (B3's own rule against swapping a pinned hash). |
| Sprint | A9: strip the hips pitch, scale chest | B3: replace or rework the sprint, add a moderate run | **Jog added (A7/B3), sprint normalised (A9).** The tag game's top pace lives in the jog band; the sprint only above it. |
| Dig | A12: re-key the stroke (shaft, hands, foot press, gaze, poles) | B8: keep the authored stroke; phases, one clock, final-body grips | **B8's frame with A12's verified items.** A12's shaft-angle claim refuted (60° at set, 16–22° only at lever/throw); the "hand at the chin" is the lean search folding the trunk, fixed by bounding it, not by re-keying the hand. |
| Turning | A18: procedural step turn on the ball, head lead, curve lean | B6: step-turn plan, inside/outside strides; turn clips in clips.py | **A18's procedural turn first.** No CC0 turn clip exists; authored clips only if the step turn does not read. B6's signed travel and inside stride kept. |
| Chaser preparation | A21: drop `TOUCH_LEAN` while running, one horizontal arm | B12: prepare one arm as the quarry approaches, recover after a miss | **Both**, as a tag-own pre-aim before `steerGrab`, so the bank tap's no-fade-in rule (GESTURE_NO_FADE_IN) is untouched. |
| Caught child | A23: bone-level numbers | B13: settle transition, asymmetry | **Both**; one definition for tag and bank. |
| Pick-up | A11/A24: clip + work layer; "open item if no caller has a beat" | B9: the jar fill is the beat; replace the y-squash | **Folded (U17).** B9 names the caller; the squash stays on the primitive (U20). |
| Low preset | — | B14: share semantics with the primitive adapter | **Rejected (U20).** User decision 04.10.2026 keeps the primitive unchanged on low; both-backend verification is already a constraint. Backlog entry. |
| Motion gate baseline | — | B1: repair pre-existing cloth failures before motion work | **Scope decided (U1):** the gate as it stands (build pose vs main; motion when 1334 un-skips it). The motion-pose cloth repair is point 1334's. |
| Sources | A: CMU as a licence candidate | B: CMU not certified, excluded | **Excluded.** CMU's terms are not CC0; the constraint is binding. Recorded in the research document as not usable, with Mixamo, LAFAN1/Bandai (NC) and the Orange Duck data (NC-ND). |
| Motion matching | A: not feasible with ~10 clips | B: feasible later, deferred | **Deferred**, both agree; recorded in the research document only. |
| blind-merge's one candidate pair A19 ↔ B5 | — | — | **Not a fold:** A19 is a conditional pelvic shift, B5 the contact rework; same file, different findings. |

## 5. Rejected items and refuted claims

- **B14 (whole):** low-preset primitive uplift — against user decision 04.10.2026; out of
  the point's measured state and final states; filed in `docs/backlog.md` by the author
  of the first implementation sub-point.
- **A8, sub-claim "feet cross the midline":** refuted by the GLB (ankles at constant
  ±0.082..0.093); no step-width offset.
- **A12, sub-claim "shaft 25–35° from horizontal for most of the stroke, never
  near-vertical":** refuted by `DIG_KEYS` (60° at set and push); the lever and throw
  are a lever.
- **A3, wording "spine channel zero in every clip":** true for every retargeted clip;
  the authored dig writes it. Harmless to the finding.
- **B1, prerequisite "repair baseline cloth failures first":** reassigned to point 1334
  by owner decision 10.10.2026, not dropped.
- **B5, per-foot terrain conforming:** deferred to the backlog (no measured defect,
  not in the final state).
- **B3, auditioning a newer UAL1 snapshot / Kenney:** not required; the pinned snapshot
  holds every needed locomotion clip.
- **A4 as unconditional:** made conditional (see §4).
- **CMU mocap:** excluded under the CC0 constraint.

## 6. Suggested split into implementation sub-points

The point names its own split line — "research and concept" / "rig and clips" /
"poses and actions" — and the ordered steps fall on it with one adjustment: the
runtime layering (steps 8–11) belongs with the rig, because every pose step judges
the composed body and cannot start before it.

| Sub-point | Steps | Why it stands alone |
|---|---|---|
| **1316a — research and concept** | step 1, step 20's research document, the final-check record | measurement tools and the document the point owes; no gameplay change; gated by what it executes: Vitest (exporter, cache digests), the Python round-trip check, `build.mjs sheets`, the penetration gate, build and lint |
| **1316b — rig, clips and the pose pipeline** | steps 2, 3, 5–11 with the step-4 decision after 9, 13 | the one topology change, its gate, the clip library and the evaluator every later step composes on; both-backend picture of walk/jog/sprint/dig |
| **1316c — turning, actions and the tag poses** | steps 12, 14–19 | each reads natural only on the composed body; port-city and river-bank pictures on both backends |

Sub-point b is the one most likely not to converge in one branch (a HIGH rig change plus
a runtime rewrite); if it stalls, cut it again along steps 2–7 (pipeline, penetration gate)
and steps 8–11 (runtime, contact tests). Separate halves do not by themselves keep
each other green, so every independently mergeable sub-point — a, b, c and any re-cut
of b — runs both the penetration gate and the no-slide tests as merge requirements,
whatever files it touches. The no-slide test is the one current at that point of the
order: before step 5 (sub-point a, and b's commits before step 5) it is today's test
with its walk↔sprint band exemption, which must stay green; step 5 removes the
exemption together with the contact correction it needs, and from then on — the rest of
b, all of c, any re-cut after step 5 — the full-ramp test is the gate.

## 7. Open items for the final check

- `OPEN:` whether the kneel clips replace `kneelBlend` on the glTF body in step 8 or
  stay procedural until step 17 needs the pick-up kneel (either keeps the order).
- *Decided (point 1343):* the prepare distance (3.2 m) lies beyond the commit
  distance (2 m, the window the grab is due in — there is no `grabWindow`); the
  pre-aim is drawn only and `grabDue` is unchanged, so it never delays a catch
  (`tagBodyPose.test.ts`).
- *Decided (point 1343):* step 15's catch alignment is split. Point 1343 aims the
  reach at the actual target at the catch frame (the grab names the world point on
  the quarry's surface; hand readback kept); the drawn hand actually touching the
  quarry at the 0.45 m catch ring is point 1340's acceptance, not 1343's.
- *Carried (point 1343):* step 16's softened knee and weight shift is not built
  (it needs a per-leg pose on the standing legs); it moves to point 1383 with the
  `caughtSlump` calibration, and §4's asymmetry decision stands until then.
- `OPEN:` per-foot terrain height (backlog) if a slope defect is measured in a village
  picture during sub-point c.

## 8. Answers to the first final check (GPT-6 Astra at 055dab0, do-not-merge)

| # | Objection | Answer in this revision |
|---|---|---|
| 1 | Hands solved before the pelvis drop move off their contacts | Step 8 order: leg solve and pelvis height are the last body-moving pass, hand contacts after it; step 10 says the same and adds `hands land on the final body`. |
| 2 | Exporter omits the group squash and morphs | Step 1 exports root transform with scale, bone translation/rotation/scale and morph weights, and a 1e-4 round-trip check precedes any use as evidence. |
| 3 | Jog lands without the full-ramp no-slide check | Constraint 2 and step 5: the band exemption goes in step 5 and the full-ramp limit is its merge requirement; a needed contact fix lands with it. |
| 4 | Step 4 depends on later steps | Step 4 moved after step 9 as an explicit decision on the sheets after steps 3, 7, 9; adding bones repeats step 2's whole acceptance. |
| 5 | 35° steps cannot make 180° in 3–5 steps | A step is one foot's lift and plant, ≤ 90° foot and ≤ 45° heading per step; the spot turn takes 4–6 steps. |
| 6 | Split misclassifies 1316a and separates the gates | 1316a is gated by what it executes; every mergeable sub-point runs both the penetration gate and the no-slide tests current at its place in the order (today's test before step 5, the full-ramp test from step 5 on — second round, 4874993bac930fa6). |
