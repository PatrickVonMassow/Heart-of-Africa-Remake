# Point 1316 — natural villager motion: blind half A (Claude Opus 5.5)

Research, measured diagnosis and concept. Nothing in `src/` was changed. Sheets were
rendered at HEAD 8067a90d9 in the 1316 worktree (`node scripts/villager/build.mjs sheets`,
then `sheets --only clips`, see D0), inspected by eye, and the tracked PNGs reverted.
Clip numbers come from the committed `public/models/villager.glb` (glTF animation channels
read directly). Concept ids A1…A24 match the JSON file.

---

## 1. Research — what makes human motion read as natural

### 1.1 Walking gait cycle (normal adult, ~1.2–1.4 m/s)

Sources: Perry & Burnfield *Gait Analysis* (2nd ed.); Inman, Ralston & Todd *Human
Walking*; Winter *Biomechanics and Motor Control of Human Movement*. The figures are
textbook normals. Treat them as targets that we calibrate by eye, not as hard limits.

- **Phases.** Stance ~60 %, swing ~40 %, with two double-support windows of ~10 % each.
  Cadence is ~100–120 steps/min. As speed rises, cadence and stride length both grow.
  The stride grows roughly with √(speed), which is what our `strideExponent` 0.5 already
  assumes.
- **Heel-to-toe roll ("three rockers").** Heel strike with the ankle near neutral and the
  knee almost straight (~5°), then a heel rocker into foot-flat, an ankle rocker as the
  shin passes over the foot, and a forefoot rocker: the heel rises, the toes dorsiflex at
  the ball by ~30° and push off. Without a ball/toe joint the foot reads as a board.
- **Knee.** ~15–20° flexion in loading response (shock absorption), near-extension at
  mid-stance, ~60° peak flexion in mid-swing for toe clearance.
- **Pelvis.** Rotation (yaw) of ±4–5°, so the swing-side hip moves forward. Obliquity
  (frontal tilt) of ±4–5°: the swing side drops. Lateral shift of ~±2–2.5 cm toward the
  stance leg. Vertical centre-of-mass excursion of ~4–5 cm, lowest at double support and
  highest at mid-stance.
- **Trunk and shoulders.** The thorax counter-rotates against the pelvis, ~±3–7° in
  space. The trunk stays nearly upright (a few degrees of forward lean that grows with
  speed).
- **Arm swing.** The arm swings against the same-side leg. It is mostly passive at slow
  pace and active at faster pace. The shoulder swings ~±15–20° at normal pace (~±30–35°
  fast). The elbow keeps 15–30° flexion and flexes more on the forward swing. The hands
  hang relaxed with the fingers slightly curled. They never splay, and the palms face the
  thighs.
- **Base of support.** Step width is ~8–12 cm. The feet do not cross the midline
  (crossover is a catwalk or a pathology). Toe-out is ~5–7°.
- **Head stabilisation.** The head is stabilised in space: pitch and yaw stay within
  ~±2–3° even though the trunk below oscillates. The neck counter-rotates, and the gaze
  holds the path or a target about 2 steps ahead.

### 1.2 Running

- The stance phase is under ~40 % of the cycle, with flight phases. At jogging pace the
  foot lands near-flat or midfoot below a slightly flexed knee (~20°). Sprinters strike
  with the forefoot.
- Trunk lean is small: ~5–10° at a steady run, and larger only during acceleration. The
  "drive" comes from the hips and the stride, not from tipping the torso. Head up, eyes
  forward.
- The arms swing with the elbows flexed ~90°. The thorax rotation is larger (±10–15°) and
  counter to the pelvis.
- **Jog vs sprint.** The transition from walk to run happens at ~2 m/s
  (Froude ≈ 0.5). A **jog** is the gait between a walk and a sprint. Cross-fading a walk
  (double support) straight into a sprint (flight) gives a hybrid that is neither.

### 1.3 Turning

(Hollands, Patla & Vickers 2002 "Look where you're going!"; Grasso et al. 1998;
Hase & Stein 1999; Patla et al. 1999.)

- **Top-down sequence.** The eyes lead (saccade), then the head yaws (onset ~200 ms before
  the body), then the shoulders, then the pelvis, then the feet. The head leads the trunk
  by roughly 10–25° during a curve.
- **In motion.** The body leans into the curve (centripetal). The step onto the outer foot
  pushes and the inner foot steps across. Small turns are "step turns"; sharper ones are
  "spin turns" on the stance foot. Spin turns pivot on the **ball** of the foot, not on the
  ankle.
- **On the spot.** A turn on the spot takes 2–4 small reorienting steps for 90–180°: the
  first foot opens toward the new heading and the other follows. The feet never glide
  rigidly with the root.

### 1.4 Actions

- **Dig (spade/shovel).** Set the blade near-vertical. Push it in with the foot on the
  blade's tread and the body weight over it. Lever back with the hands apart on the shaft
  (the rear hand low on the handle, the lead hand down the shaft). Lift by bending the
  knees and hips. Turn the trunk (pelvis and thorax) toward the throw and throw to the
  side. The gaze stays on the blade. *African hoe work* (the typical 1890 field tool) is
  different: a short-handled hoe swung down in front, the trunk deeply flexed (hip-hinged)
  and knees bent. The design rule says shovel, so we keep it.
- **Pick up.** Either a squat (knees and hips flex, back fairly straight) or a stoop/hinge
  (hips flex, knees slightly bent, back straight-ish). Rounding of the spine is
  distributed. One hand reaches and the other often braces on a knee. The head looks at
  the object until it is gripped.
- **Point.** The gaze goes to the target first, then the arm rises near-straight (elbow
  0–15° flexion), the index finger extends and the other fingers curl. The shoulder
  protracts slightly toward the target and the trunk turns a little toward it.
- **Carry.** For a shoulder load: the trunk leans slightly away from the load and the
  steadying hand is on the shaft. For a head load: an extremely upright trunk, a
  stabilised head and a smoother gait (less vertical bob).
- **Reach (contact).** Distribute the reach over the ankle, knee, hip and spine flexion,
  then the scapula (protraction), then the arm. The head stays oriented to the hand or
  object.
- **Dejection / slump (caught child).** An upright or slightly forward trunk. The
  shoulders are rounded: the scapulae protract and depress, so the shoulders fall forward
  and down. The chest is sunken (thoracic flexion), the head is bowed (neck flexion) and
  the arms hang loose and slightly in front of the thighs. The weight may shift to one
  leg. This is *not* a hip fold.
- **Chasing / grabbing (child).** Run upright. The head is up and locked on the target,
  and the neck is extended if the trunk leans. The reaching arm is near-horizontal at the
  target, with the shoulder protracted. The other arm counter-swings. The lean comes from
  acceleration, not a bow.

### 1.5 Techniques a real-time game uses

1. **Clip playback plus corrective IK** (foot locking, ground adaptation). The clip owns
   the pose, and the IK changes only the delta needed to put the foot where the lock or
   the ground wants it. The knee keeps the clip's swivel, and the pole comes from the
   clip's own knee position (the standard in UE's *Leg IK* / *Foot Placement* and in
   Unity's *Animation Rigging*).
2. **Stride warping and speed warping.** Scale the stride about the pelvis, adjusting
   pelvis height to the warped stride so the legs neither lock straight nor crouch. The
   cadence covers the rest (UE *Stride Warping*, *Orientation Warping*).
3. **Layered and additive animation.** A base locomotion layer for the whole body. An
   upper-body layer per bone mask, blended per bone. Additive layers (lean, breathing,
   look) as a delta to a reference pose.
4. **Look-at / aim chains.** The gaze is distributed over spine → chest → neck → head with
   per-bone weights and limits (e.g. 0.1/0.2/0.3/0.4), so the head reaches the target and
   the trunk contributes. Head stabilisation is the same mechanism with the target at the
   horizon.
5. **Spine distribution.** A lean or bend of N° is spread over 3–5 spine bones by weights,
   giving a curve, not a hinge.
6. **Motion matching** (Clavet 2016, *For Honor*; UE 5.4 Pose Search). It needs a large
   mocap database (minutes of dense locomotion) and a feature search per frame. It is
   **not feasible for this POC** with ~10 CC0 clips. A poor man's form — choosing among a
   few turn or start/stop clips by the phase and the heading change — is all we need.
7. **Procedural secondary motion.** Pelvic drop and shift, breathing, settling, idle
   weight shifts, small noise. Cheap, and it removes the "mannequin" stillness.

### 1.6 Rig standards (bone counts)

| Rig | Bones | Spine | Twist | Fingers | Toe/ball |
|---|---|---|---|---|---|
| **Ours** (`scripts/villager/skeleton.py`) | **21** | hips + spine + chest (spine co-located with hips) | none | none (grip is a morph) | toe ✓ |
| MakeHuman `game_engine` (our weight source, measured) | 53 | pelvis + spine_01/02/03 | none | 15/hand | ball ✓ |
| Quaternius UAL1 (Rigify DEF, measured) | 53 | hips + spine.001/.002/.003 | none | 14/hand | toe ✓ |
| Quaternius UAL2 (UE naming, measured) | 65 | pelvis + spine_01/02/03 | none | 15 + leaf/hand | ball ✓ |
| Mixamo | 65 (≈25 without fingers) | Hips + Spine/Spine1/Spine2 | none | 15–20/hand | ToeBase ✓ |
| UE4 Mannequin | ~68 | pelvis + spine_01–03 | upperarm/lowerarm/thigh/calf twist | 15/hand | ball ✓ |
| UE5 Manny | ~89 | spine_01–05, neck_01–02 | 2 per segment | + metacarpals | ball ✓ |

The common denominator of game rigs is **3 spine segments plus a clavicle and a ball joint
per side**. Twist bones fix candy-wrapper wrists and thighs. Fingers are only needed where
hands are seen close up.

### 1.7 Reachable free motion sources

| Source | Licence | Usable clips | Verdict |
|---|---|---|---|
| **Quaternius Universal Animation Library 1** (pinned) | CC0 | Walk_Loop, Walk_Formal_Loop, **Jog_Fwd_Loop** (unused), Sprint_Loop, **PickUp_Table**, **Interact**, Crouch_Fwd/Idle, Idle_Talking_Loop, Push_Loop, Fixing_Kneeling | **Use** (already pinned) |
| **Quaternius Universal Animation Library 2** (on disk at `local/assets-src/villager/quaternius/UAL2_Standard.glb`, not pinned since point 1294) | CC0 | **Walk_Carry_Loop**, **Farm_Harvest**, **Farm_PlantSeed**, Farm_Watering, TreeChopping_Loop, Idle_No_Loop, Yes, Idle_FoldArms_Loop, OverhandThrow | **Use** (re-pin) |
| CMU Graphics Lab Motion Capture DB | Custom permissive: "free for all uses, may be used in commercial products, may not be resold as data" — **not CC0** | Walks at many paces, turns, run, pick-up, pointing, children's play | **Candidate**. Needs a licence decision (constraint: "CC0 or similarly free"), BVH→pipeline retarget work and cleanup. |
| Mixamo | Adobe terms, raw redistribution restricted | — | **Not usable** |
| Ubisoft LAFAN1 / Bandai Namco motion set | CC BY-NC(-ND) | — | **Not usable** (NC) |
| 100STYLE | CC BY 4.0 | stylised locomotion | Possible with attribution, but stylised; not needed |
| Kenney / other CC0 game packs | CC0 | sparse locomotion | Not needed |

The licence statements were recalled from knowledge, not fetched in this run. Whoever pins
a source must verify the live licence text and record it with its sha256 in
`scripts/villager/sources.json`.

There is **no CC0 turn-on-the-spot, point or child-tag clip** among the reachable sources.
These are procedural (A15, A18, A20, A21) or CMU (if approved).

---

## 2. Measured diagnosis of the current game

### D0 — How I measured

- `node scripts/villager/build.mjs sheets` **failed**, so the sheet path itself is broken:
  `scripts/villager/sheets.py:176` lists outfit `g-cloak-chest`, which the garment set no
  longer has, and `mask.decode` raises `ValueError` (`scripts/villager/mask.py:633`) after
  a 883 s mask build. The clip sheets were then rendered with
  `sheets --only clips` (exit 0). That is a pipeline finding of its own (A1).
- The **sheets show the raw clip**, not what the game draws. At runtime the trunk, neck
  and head are code-written and the legs are re-solved (D3–D6), so no sheet shows the
  runtime composition (A2).
- The trunk rotations of the shipped clips, read from `public/models/villager.glb` (local
  Euler approximation, degrees, min/mean/max):

| clip | hips pitch | hips yaw | hips roll | spine | chest pitch | chest yaw | neck pitch | head pitch |
|---|---|---|---|---|---|---|---|---|
| walk | 0/0/0 | ±2.0 | ±2.5 | **0 (all axes, all frames)** | 16.3/18.1/19.9 | ±5.3 | −9.1 | +5.7 |
| sprint | **22.5 constant** | ±1 | ±4.8 | **0** | 25.5/29.5/34.7 | **±29** | −14.6 | −14.6 |
| idle | −4.7 | **−13.3** | −0.6 | **0** | 21.3 | 0 | −10.7 | +6.8 (yaw +11) |

### D1 — Rig too primitive (cause class: rig)

- **One effective spine segment, pivoting at the pelvis.**
  `scripts/villager/skeleton.py:13-14` gives `hips` and `spine` the *same* head and tail
  (`joint-pelvis` → `joint-spine-2`). Rotating `spine` therefore pivots at the hip joint
  level, so every lean folds at the pelvis.
  `skeleton.py:64` merges MakeHuman `spine_01` and `spine_02` into one bone. The retarget
  map `skeleton.py:72` drops `DEF-spine.002`, and the measured `spine` channel is zero in
  every clip. Our real flexible trunk is the single `chest` bone (`joint-spine-2` →
  `joint-neck`).
- **No twist bones.** Forearm pronation is carried by the `hand` bone alone, which wrings
  the wrist (visible in the dig sheet at the upper hand). That is the pointing palm
  orientation and the shovel grip.
- **No fingers.** The fist is the `grip.L/R` morph (`scripts/villager/body.py:24,301-302`).
  There is no pointing hand shape: the rest hand is splayed open (every walk and sprint
  frame shows spread "claw" fingers). The sources have 14–15 finger bones per hand that we
  weight-merge into `hand` (`skeleton.py:61-62`).
- **Toe/ball present** (`skeleton.py:32-33`). The roll is possible, but the runtime never
  writes `toe` (D3).

### D2 — Clip content itself is stylised (cause class: clips)

From the sheets:

- **Walk.** The Quaternius walk is hunched: the chest is pitched 18° forward and the head
  is pushed out. The arms are held forward with the elbows ~40–60° bent and the hands
  splayed. The swing knee is lifted high, nearly a march. The feet **cross the midline**
  (front view: the planted foot lands under the body's centre line, a catwalk scissor).
- **Sprint.** Hips pitched 22.5° plus the chest +30°: a ~50° forward dive with a ±29°
  chest yaw. This is a cartoon sprint, not a child's run.
- **Idle.** A staggered stance (one foot a half step ahead) with a constant 13° hip yaw
  and 11° head yaw. It reads "frozen mid-step".
- **Dig** (authored, `scripts/villager/toolclips.py:201-208`). The shaft is held ~25–35°
  from horizontal for most of the stroke, which reads as punting or pushing a pole. The
  upper hand sits at the chin and the head is bowed onto the hands. The knees track
  inward. No foot presses the blade. The blade never goes near-vertical into the ground.
- **Carry** (`toolclips.py:366-398`). The walk's crossover and splayed free hand are
  inherited. The free arm hangs bent out to the side.
- **Not used although available:** `Jog_Fwd_Loop`, `PickUp_Table`, `Interact`,
  `Idle_Talking_Loop` (UAL1), and the whole of UAL2 (`Walk_Carry_Loop`, `Farm_*`).
  `scripts/villager/clips.py:26-31` takes only idle, walk, sprint and Fixing_Kneeling.

### D3 — The clip's legs are replaced by IK (cause class: clip overridden)

`src/render/villagerClipPose.ts:179-245` runs `solveLimb` on **every frame for both legs**,
whatever the miss:

- The pole is a fixed person-space `(0,0,1)` (`:242`). The knee is forced into the plane
  through the hip, the ankle target and straight ahead, so the clip's knee swivel, hip
  rotation and abduction are discarded. Knees always point dead ahead even when the
  pelvis yaws.
- The stride warp (`:179`) scales only the foot's z-offset from the hips by
  `gait.stride − 1` and leaves the hips' height alone. At `strideMax` 1.35 the leg runs
  out of reach and goes straight-locked ("stilt" frames). At `strideMin` 0.75 the knees
  stay over-bent with a short reach ("crouch-shuffle").
- `setWorldRotation(..., foot, _keep)` (`:244`) keeps the foot's world rotation but never
  re-writes `toe`. The roll is only what the clip's toe had relative to a re-oriented
  foot.
- A "turn" adds a forward walk cycle (`src/render/figureWalk.ts:446`:
  `walked = ahead + aside + turned·turnStep`). Turning on the spot plays the *forward*
  walk in place against held contacts until `plantRelease` makes them slip
  (`villagerClipPose.ts:224-230`). The feet step forward and backward rather than
  pivoting or side-stepping.

### D4 — Trunk, neck and head never come from the clip (cause class: joints badly driven)

- `src/scenes/place/gltfClipLayers.ts:102`: `LEGS = ['hips', thighs, shins, feet, toes]`.
  The gait layer blends only these and the free arms (`:151-155`). `spine`, `chest`,
  `neck` and `head` keep the code values (`gltfClipLayers.ts:14-15`).
- The code writes `spine = (vTrunk.x, vTrunk.y − walk.hipYaw)`,
  `chest = (stoop, walk.chestYaw)` and `neck = −stoop·0.45`
  (`src/scenes/place/skinnedFigure.tsx:452-453`, `:385-387`). The head is set to identity
  by `unsquashHead` when there is no squash (`src/render/figureRig.ts:145-154`,
  `skinnedFigure.tsx:513,593`). **The head has no orientation of its own**: it inherits
  every lean and turn of the chain, so there is no stabilisation and no gaze.
- **Two unsynchronised phase clocks.** `walk.hipYaw` and `walk.chestYaw` come from the
  *code* walk's `m.phase` (`src/render/figureWalk.ts:315-316`, advanced at `:459-461` with
  the code's `strideReach`). The legs come from the *clip* gait phase
  (`villagerClipPose.ts:79-86` via `gaitAt`). The two cycle lengths differ, so the
  shoulder counter-rotation drifts in and out of phase with the legs. Sometimes it rotates
  *with* the stepping leg (puppet-like).
- `spine.y −= walk.hipYaw` compensates a code hip yaw that the clip has already overwritten
  (the gait layer replaces `hips` rotation at `gltfClipLayers.ts:151`, while
  `skinnedFigure.tsx:347` set the code yaw). The compensation is therefore a stray ±4° yaw.
- The clip arms are blended as *local* rotations. They were authored under an 18°-forward
  chest, but they now sit under an upright code chest, so their arc rotates ~18° backward
  relative to what the clip showed.

### D5 — Leans fold as one block at the pelvis (cause class: joints badly driven)

- Every lean writes `spine.rotation.x` only (`skinnedFigure.tsx:452`, `contactLean`
  `:410-427`, `src/render/figureRig.ts:107-121`). Because `spine` pivots at the pelvis
  (D1), the trunk tips rigidly from the hip joint. The head and arms inherit it (the
  point's measured state).
- **Sprint double lean.** The sprint clip's constant hips pitch of 22.5° tips the whole
  upper body (hips is the chain's root). The tag game then adds `c.lean` up to
  `leanAtSprint` 0.28 rad (16°) on `spine` (`src/config/balance.ts:1804`,
  `src/scenes/place/tagGame.ts:1183-1184`). The result is ~38° at the pelvis with a
  straight back and the face to the ground.
- **Chaser.** `tagFigurePose` takes `lean = max(runLean, shown.lean)`
  (`tagGame.ts:1538`) with the touch gesture's `TOUCH_LEAN` 0.5 rad (29°)
  (`src/render/gesture.ts:105,453`). On top of the sprint's 22.5° hips pitch that gives
  ~50° from the pelvis. The gaze turn `chaserGaze` rotates the **trunk**
  (`tagGame.ts:1265-1272`, `gazeTurnMax` 0.6 at `balance.ts:1822`), not the head. Both
  arms are held forward (`CHASER_ARMS`, `tagGame.ts:1561-1564`), which reads as a bowed
  sleepwalker rather than a reaching runner.
- **Caught slump.** `caughtSlumpPose` (`tagGame.ts:1495-1504`) sets lean 0.48 rad (27°,
  `balance.ts:1819`, already carrying an `// OPEN` against a specified 0.20) at the pelvis.
  The arms are pitched −lean "plumb". The shoulders (clavicles) are reset to identity
  every frame (`gltfClipLayers.ts:105`, `UNWRITTEN`), so they cannot round. The result is
  a stiff forward bow from the hips, not a dejected stand.

### D6 — Missing secondary motion and transitions (cause class: missing motion)

- There is no head look-at anywhere: no gaze at the path, at a speaker, at a pointed
  target or at the work.
- Point (`gesture.ts:412-415`): the FK arm aim and `lean` 0.04 are all there is. The
  forearm is fixed at −0.2 rad (`skinnedFigure.tsx:499`), and the hand is the splayed rest
  hand: no index finger, no head-first sequence.
- Turning (`PlaceLife.tsx:1125` `g.rotation.y = c.facing`; `figureWalk.ts:230-236`
  `steerHeading`): the whole figure yaws as one block. There is no head lead and no lean
  into the curve.
- Walk ↔ sprint is a direct cross-fade over ±0.35 (`balance.ts:2677-2679`). The middle of
  the band blends a double-support walk with a flight-phase sprint (no jog).
- Pick-up has no clip. The contact crouch is solved by `contactCrouch` / `contactLean`
  (`figureRig.ts:39-45,107-121`), and the `kneelWork` cut in `clips.py:34` dives from the
  waist (the sheet's second frame folds the whole body at the hips, head at hip height).

### D7 — Summary by cause class

| Cause | Deficits |
|---|---|
| Rig too primitive | single pelvis-pivot spine; no twist; no finger/point shape |
| Joints present but badly driven | head never aimed; toe never written; clavicles reset; lean at one joint; stray hip-yaw compensation |
| Clip overridden | full leg re-solve with fixed pole; trunk/neck/head discarded; two phase clocks |
| Clip content | hunched, crossover, splayed walk; diving sprint; staggered idle; pole-pushing dig |
| Missing secondary motion | no gaze/stabilisation; no pelvic drop/shift; no turn anticipation or step turns; no jog |

---

## 3. Concept — ordered changes

The order is chosen so that each step is verifiable alone and the risky rig change
precedes everything that depends on its bone list. Every number added goes into
`src/config/balance.ts` (`VILLAGER_GLTF`, `VILLAGER_ASSET` or a new `VILLAGER_POSE`
block), marked calibratable.

### Stage 0 — measurement tools first

- **A1 Repair the sheet render.** `scripts/villager/sheets.py:173-178` names the removed
  garment `g-cloak-chest`. Use a current garment id (or derive the outfits from the
  garment list) so `build.mjs sheets` completes.
  - Verify: the full `sheets` run exits 0.
  - Risk: low.
- **A2 Runtime-composition sheet.** Add a sheet that renders a pose sequence exported
  *from the game's own pose code*, run in Node (Vitest-side tool), as JSON local rotations
  through `gamepath.py`. That way walk, turn, run, dig, pick-up, point, chaser and caught
  child are judged as drawn, not as raw clips. A plain JSON hand-over adds no new
  infrastructure.
  - Verify: the sheet exists for all eight subjects (the before/after strip the point
    demands).
  - Risk: medium. The Python and TS skinning paths must agree, and `gamepath.py` already
    mirrors the game.

### Stage 1 — rig

- **A3 Three-segment spine with a real lumbar pivot.** Re-head the chain as
  `hips` (pelvis, short), `spine` (`joint-spine-3`/L-region → `joint-spine-2`),
  `spine1`/`chest` split at the MakeHuman joint between them, then `chest` → `neck`.
  Map MH `spine_01→spine`, `spine_02→spine1`, `spine_03→chest`, and UAL1
  `DEF-spine.001/.002/.003` one-to-one. The hip pivot of a lean moves up into the lumbar
  region. 21 → 22 bones.
  - Files: `scripts/villager/skeleton.py`, `clips.py`, `toolclips.py` (index names),
    `gamepath.py`, `penetration.py` pose list, `src/render/villagerFigureBody.ts`
    (`BONE_NAMES`), every `bones.spine/chest` user.
  - Verify: `penetration.py` gate and tests green; garment build sheets; low preset; the
    glb loads on both backends; Vitest `villagerFigureBody`/`villagerRig` with the bone
    count and the parent order.
  - Risk: **high**. It reweights the trunk under every garment, which is why the
    penetration gate is the acceptance.
- **A4 Forearm twist bone per arm** (`forearmTwist.L/R`, the distal half of the forearm,
  taking ~50 % of the hand's roll). Weight from the MH forearm weights split by distance
  along the bone.
  - Verify: dig and point sheets show no wrist wringing; penetration gate.
  - Risk: medium (sleeve garments at the wrist).
  - Upper-arm and thigh twist are **not** proposed: no measured deficit needs them.
- **A5 No finger bones. Add a `point.L/R` hand morph** (index extended, others curled)
  beside `grip.L/R`, built from the MH finger-bone weights in `body.py` like `grip_shape`.
  Also add a `relax` morph so the rest hand is softly curled, not splayed.
  - Verify: a hand close-up sheet; the morph count in the glb test.
  - Risk: low. No bone added, garments untouched.

### Stage 2 — clips

- **A6 Re-pin UAL2** (`UAL2_Standard.glb` plus licence) in `scripts/villager/sources.json`
  with sha256 and its CC0 licence. Add a `MAPS['UAL2']` (UE names: `pelvis`,
  `spine_01..03`, `clavicle_*`, `ball_*`).
  - Verify: `build.mjs fetch` checks the hash.
  - Risk: low.
- **A7 Add the jog.** Retarget UAL1 `Jog_Fwd_Loop` as `jog`, and make the gait a
  three-way blend walk → jog → sprint by speed (`gaitAt` in `src/render/villagerRig.ts`).
  The `sprintThreshold` band is split into `jogThreshold`/`sprintThreshold`. The
  `clips.py:346` per-frame grounding uses `per_frame=False` for jog and sprint (already
  named there).
  - Verify: Vitest `gaitAt` weights sum to 1, phase-per-unit continuous across both bands;
    sprint sheet.
  - Risk: low to medium. All three must share the left-heel-strike phase 0, which
    `rotate_to_contact` does.
- **A8 Normalise the walk's style in the pipeline** (no new source). Per-clip corrective
  offsets in `clips.py`:
  - chest pitch −12°;
  - arm hang: upper arm closer to the body, elbow 15–25°;
  - step width: add a hip-abduction offset so the planted foot lands at ±5 cm off the
    midline instead of crossing.

  The swing-knee lift stays. Offsets live in `VILLAGER_ASSET.clipStyle`.
  - Verify: front and side walk sheets, measuring foot x at mid-stance (`analyse_gait`
    already samples the foot points) to show no crossover.
  - Risk: low to medium. The no-slide speed measurement must be re-run, which the
    pipeline does.
- **A9 Sprint becomes a child's run.** Remove the constant 22.5° hips pitch from the
  sprint (the retarget keeps it as rest delta), and scale the chest pitch to ~10–12° and
  the chest yaw to ±12°, as `clipStyle.sprint`.
  - Verify: sprint sheet; trunk angle measured from the glb under 15°.
  - Risk: low.
- **A10 Idle stance.** Pick the idle frame with the smallest foot stagger, or blend in
  `Idle_Talking_Loop`. Remove the constant 13° hip yaw and 11° head yaw.
  - Verify: idle sheet.
  - Risk: low.
- **A11 Pick-up clip** from UAL1 `PickUp_Table`, retargeted, plus the UAL2 `Farm_Harvest`
  stoop as a ground pick-up. Cut down, hold and up, as for the kneel
  (`clips.py:34` pattern).
  - Verify: a pick-up sheet; Vitest that the hand at the hold frame reaches ground height
    within tolerance.
  - Risk: medium. Whether `PickUp_Table` reaches the ground is unknown until rendered,
    hence two candidates.
- **A12 Dig re-authored** (`scripts/villager/toolclips.py:201-208`, `DIG_KEYS`):
  - the shaft near-vertical (60–80°) at set and push;
  - a right-foot press on the blade (the foot solved onto the blade tread for 0.3 s);
  - the hands farther apart, the rear hand at hip to chest height and not at the chin;
  - lever and throw with pelvis and chest yaw;
  - neck and head aimed at the blade (replacing the fixed `head = 0.12` at `:310-311`);
  - knee poles outward (`two_bone` pole `(±0.3, 0, 1)`) against the valgus seen.
  - Verify: dig sheet; the existing hand-miss / clearance / max-turn prints stay under
    their bounds; penetration gate (dig is in the dressed poses).
  - Risk: medium.

### Stage 3 — runtime layering

- **A13 Corrective leg IK only.** In `clipGaitPose` (`src/render/villagerClipPose.ts:172-246`):
  1. Take the knee pole from the **clip's own knee** (hip→knee direction minus its
     component along hip→ankle) instead of `(0,0,1)`.
  2. Run `solveLimb` only when the target differs from the clip's ankle by more than
     ~2 mm. Otherwise keep the clip's leg untouched.
  3. Lower the pelvis by the amount the warped stride needs to stay in reach (pelvis
     height = min over stance legs of the reachable height, as `walkPose` does,
     `figureWalk.ts:292-297`) and raise it to clip height when it is not needed.
  4. Re-write `toe` so the ball stays flat while the heel is up (the forefoot rocker): if
     the tip contact is held, rotate the toe to keep its world pitch.

  The no-slide rule (point 1295) stays as it is: the contacts' hold logic is unchanged and
  only the solve's pole and trigger change.
  - Verify: Vitest named `corrective leg IK keeps the clip's leg when nothing is held`
    (zero miss gives local rotations equal to the clip's within 1e-4) and `held foot still
    holds` (world contact drift under 1 mm over a cycle at 0.75/1.0/1.35 stride). Also a
    Playwright village-walk foot-slide check (the existing `walk-move` section).
  - Risk: medium. The pole from the clip knee is ill-defined at a straight leg; blend to
    the old forward pole as the leg straightens.
- **A14 One gait clock.** Drive the code walk's hip and chest yaw and the arm swing from
  the **clip gait's phase**, or drop them where the clip supplies them (A15). Remove the
  stray `− walk.hipYaw` on `spine` when the gait layer owns `hips`
  (`skinnedFigure.tsx:452`). `m.phase` stays only for the primitive figure.
  - Verify: Vitest that `chestYaw` and the clip's left-leg forward extreme share a sign
    within 5 % of the cycle at three speeds.
  - Risk: low to medium. The kneel and plant code reads `m.phase`, so keep it running but
    unused for the glTF body.
- **A15 Upper body from the clip, the code as an additive layer.** Add `spine`, `spine1`,
  `chest`, `neck` and `head` to the gait layer's blended set (`gltfClipLayers.ts:102`). The
  code's lean, stoop and gesture turn are applied **after** the blend as additive deltas
  distributed by A16, instead of being overwritten or overwriting. The clip's chest and
  pelvis counter-rotation and the neck and head stabilisation of the source come through
  (after A8/A9 normalisation).
  - Files: `gltfClipLayers.ts`, `skinnedFigure.tsx` (`retarget`: write the code trunk as a
    delta after `applyClipLayers`, not before).
  - Verify: Vitest that with zero code lean the trunk bones equal the clip's; runtime walk
    sheet (A2).
  - Risk: **medium to high**. The contact solver (`leanIn`, `solveTo`) currently runs
    before the clip layers. The order must become: blend clip → add lean → solve contact
    arms.
- **A16 Distributed lean (additive).** Add a pure function
  `distributeLean(total, weights, bones)` in `src/render/figureRig.ts`. It turns a pitch
  and yaw into per-bone deltas with weights in `balance.ts`, e.g. pitch
  hips 0.2 / spine 0.3 / spine1 0.25 / chest 0.25, and yaw spine 0.25 / spine1 0.35 /
  chest 0.4. Callers: `contactLean` (`skinnedFigure.tsx:410-427`, where the lean search
  now rotates the distributed chain), the gesture and tag lean and the elder stoop.
  - Verify: Vitest `lean is distributed` (no bone carries more than 35 % of the total;
    the sum equals the total; the shoulder lands within 2 mm of where a single-joint lean
    of the same angle would put a contact, *or* `contactLean` is re-searched with the
    distributed chain so contacts still land, with the hand-on-stone tests green).
  - Risk: medium. Every contact pose in the settlements (pounding, loom, fishing) runs
    through `leanIn`, so the existing contact Vitest and Playwright sections are the
    guard.
- **A17 Gaze / head-stabilising look-at chain.** Add a pure `aimHead(target | horizon,
  weights, limits)` after everything else: neck 0.4 / head 0.6 of the remaining error,
  limits yaw ±70°, pitch −40…+30°, plus a small chest share for yaw only. The default
  target is the horizon along the heading, which counter-rotates any lean or bob ("head
  stabilisation"). Targets set by context: the speaker in a talk, the pointed spot, the
  shovel blade, the hand in a contact, the quarry for the chaser, the ground ahead for the
  slump. `unsquashHead` composes **after** it (it already keeps the twist).
  - Files: `figureRig.ts`, `skinnedFigure.tsx`, the context feeds in `PlaceLife.tsx` and
    `tagGame.ts`.
  - Verify: Vitest `gaze hold` (head world forward within 3° of the target under a 0.3 rad
    distributed lean and a gait cycle; limits respected).
  - Risk: low to medium. The head load on the crown rides the head, and a stabilised head
    makes the load *more* stable.
- **A18 Turning.**
  1. **Head lead:** feed the steering's desired heading (`steerHeading`,
     `figureWalk.ts:230`) to A17 as the gaze target. The head yaws first and the body
     follows naturally because the steer already lags.
  2. **Lean into the curve:** a roll of the distributed chain proportional to
     yaw-rate × speed, capped at `VILLAGER_POSE.curveLeanMax` (~6°).
  3. **On the spot:** below `standSpeed` with a yaw rate, replace the forward-walk-in-place
     with a **procedural step turn**. The body yaws in steps of ≤ 35°. Each step lifts the
     inner foot (the clip's swing-phase foot shape from the walk at phase 0.6–0.9, played
     sideways) and plants it at the new heading under the hip, then the outer foot
     follows. The held contacts pivot on the **ball** (rotate the foot about the ball
     contact, not the ankle) while the root yaws. That replaces
     `walked += turned·turnStep` (`figureWalk.ts:446`) for the glTF body.
  - Verify: Vitest that a 180° spot turn makes 3–5 steps with no held contact moving more
    than 1 mm while planted; turn sheet (A2); in-game picture of a villager turning to face
    the player.
  - Risk: medium. This is new logic, and turning in the tag game is frequent.
- **A19 Pelvic secondary motion** for the code walk only where the clip lacks it (after
  A8 the clip has ±2–2.5° pelvic yaw and roll). A small lateral pelvis shift toward the
  stance foot (±1.5 cm × legScale) and a vertical bob check: only if the runtime sheet
  shows the pelvis static. Otherwise skip.
  - Verify: runtime sheet front view.
  - Risk: low.

### Stage 4 — per-action poses

- **A20 Point.** The `point` gesture (`gesture.ts:412-415`) sequences gaze → arm: A17
  targets the pointed spot from t = 0, and the arm envelope starts 0.15 s later. The
  forearm is straight (0–0.1 rad instead of the fixed −0.2 at `skinnedFigure.tsx:499`).
  `point` morph on the hand (A5). The shoulder protracts by 0.1 rad on the clavicle (stop
  resetting the clavicle, see A22). Chest yaw is 25 % toward the target via A16.
  - Verify: Vitest of the sequence timing; point sheet; in-game talk picture.
  - Risk: low.
- **A21 Port-city tag chaser.**
  - The run lean is ≤ 0.12 rad, distributed (A16) and taken from the sprint after A9. The
    touch gesture no longer imposes `TOUCH_LEAN` 0.5 while running: `tagFigurePose`
    (`tagGame.ts:1538`) uses `lean = runLean` for the chaser and gives the reach to the
    arm and shoulder instead.
  - The gaze is on the quarry via A17. `chaserGaze` turns the **head and neck** (and only
    25 % of it the chest) rather than the trunk. The neck is extended back against any
    remaining lean, which A17 does automatically.
  - Only the reaching arm aims horizontally at the quarry: elevation ≈ 0 at shoulder
    height, the elbow near-straight and the clavicle protracted. The other arm keeps the
    run's counter-swing from the clip. `CHASER_ARMS` with both arms forward is dropped.
  - Numbers: `balance.ts` tag block (`chaserLeanMax`, `chaserReachElevation`).
  - Verify: Vitest that the chaser's trunk pitch (sum of the distributed chain) is
    ≤ 0.15 rad, the head forward is within 5° of the quarry bearing inside the limits, and
    the reaching hand's direction is within 10° of horizontal toward the quarry. Picture
    check in a port city on both backends.
  - Risk: low to medium. `grabAim` was solved through the old lean, so recompute it with
    the new lean (it takes the lean as a parameter already).
- **A22 Clavicles become posable.** Remove `shoulder.L/R` from `UNWRITTEN`
  (`gltfClipLayers.ts:105`). Add a `shoulders` field to `FigurePose`
  (protraction/elevation per side, default 0) and write it in `skinnedFigure.tsx` as an
  additive after the clip.
  - Verify: Vitest that default 0 leaves the clip's clavicle; penetration gate (clavicle
    poses enter the pose list in `penetration.py`).
  - Risk: medium. The shoulder garments (toga, cloak, cape) deform with it, and the
    penetration gate decides.
- **A23 River-bank caught child.** Replace `caughtSlumpPose` (`tagGame.ts:1495-1504`):
  - trunk pitch ~0.12 rad total, over spine/spine1/chest only (hips 0), so the chest is
    sunken and there is no hip fold;
  - clavicles protracted ~0.25 rad and depressed ~0.1 rad (A22);
  - neck and head bowed ~0.35 rad by A17 with the target on the ground ~1 m ahead;
  - arms hanging loosely: the gravity-hang solution in the chest frame (as
    `skinnedFigure.tsx:496` already does for the stoop) plus 0.05–0.1 rad forward and a
    slight elbow bend;
  - optionally a weight shift onto one leg (hip roll 0.04).

  Replace `caughtSlumpLean` 0.48 and `caughtSlumpArmRoll` in `balance.ts:1819-1820` with
  `caughtSlump: { trunk, shoulderForward, shoulderDrop, headBow }`, which closes that
  `// OPEN`.
  - Verify: Vitest that the hips pitch is 0, the trunk sum is ≤ 0.15 rad and the clavicle
    protraction is > 0. Picture check at a river bank on both backends.
  - Risk: low.
- **A24 Pick-up, carry and reach in the game.** Wire the A11 clip as a `pickUp` work layer
  (as `dig` is, `gltfClipLayers.ts` plus `FigureWork`), with A17 gazing at the object.
  `carry` is re-derived from the normalised walk (A8) or from UAL2 `Walk_Carry_Loop` when
  a hand load is carried. Contact reaches (`leanIn`) use A16 plus a knee share
  (`contactCrouch`) so a low reach bends the knees before the back.
  - Verify: Vitest of the pick-up layer weights and blend, with no snap (weights eased over
    `transitionSeconds`); sheets; in-game picture of a villager picking up.
  - Risk: medium, depending on which caller in `PlaceLife.tsx` actually has a pick-up beat.
    If none does, this is an open item, not an invented system.

### Verification summary

- **Every stage:** the cheap gate (`tsc`, `build`, `lint`, `test:unit`). Pipeline stages
  also need the penetration gate, the garment and dress sheets and the low preset load.
- **Before/after strip:** walk, turn, run, dig, pick-up, point, chaser and caught child
  via the A2 runtime sheet.
- **Named Vitest:** corrective leg IK (A13), lean distribution (A16) and gaze hold (A17),
  plus the per-pose cases above.
- **Picture checks:** a port city (chaser) and a river bank (caught child) on WebGPU and
  WebGL 2, judged by looking. The rig change touches only skinning data, so both backends
  are expected to behave the same, but this point is backend-sensitive by path (`src/render/`).

### Open items

- The CMU licence is not CC0. Using it for turns and children needs an owner decision.
  Without it, turns are procedural (A18).
- Whether a pick-up beat exists in the settlement life is unverified (A24).
- The stated design tool is a shovel, while historical 1890 field work was hoe work. Not
  proposed for change.
