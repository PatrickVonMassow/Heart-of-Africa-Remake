# Natural villager motion — research and measured diagnosis

Final state 1 of work-order point 1316 (sub-point a). Built from §1 of the two blind
halves (`docs/four-eyes/1316-blind-a-opus55.md`, `docs/four-eyes/1316-blind-b-astra.md`)
and §1 of the merged concept (`docs/natural-villager-motion-concept.md`, final check
passed at b231b21). The diagnosis in §6 is measured on the game's **own composed
pose** — the runtime-composition sheets of concept step 1 — not on raw clips.

Physiological figures below are textbook normals and serve as targets to calibrate
by eye, not as hard limits. Every number the game will use goes to
`src/config/balance.ts` when a later sub-point adopts it.

## 1. What makes human motion read as natural

Motion reads through **support, balance, intention and timing**. A foot that carries
weight stays on its ground contact while the pelvis travels over it. The body prepares
before an effort, its segments accelerate one after another, and it settles after the
task. Perfect bilateral symmetry, constant-speed limb rotations, instantaneous changes
of direction and permanently straight elbows remove those cues. Small variation helps
only once contacts and timing work; noise added to a broken gait makes it worse.

### 1.1 Walking gait cycle (adult, ~1.2–1.4 m/s)

Sources: Perry & Burnfield, *Gait Analysis* (2nd ed.); Inman, Ralston & Todd, *Human
Walking*; Winter, *Biomechanics and Motor Control of Human Movement*;
[gait phases and age-related characteristics](https://pmc.ncbi.nlm.nih.gov/articles/PMC5318488/).

- **Phases.** Stance ~60 %, swing ~40 %, two double-support windows of ~10 % each.
  Cadence ~100–120 steps/min; cadence and stride both grow with speed, stride roughly
  with √speed (our `strideExponent` 0.5 already assumes this).
- **Heel-to-toe roll (three rockers).** Heel strike with the ankle near neutral and the
  knee almost straight (~5°), the heel rocker into foot-flat, the ankle rocker as the
  shin passes over the foot, the forefoot rocker: the heel rises, the toes dorsiflex at
  the ball by ~30° and push off. Without a ball joint the foot reads as a board.
- **Knee.** ~15–20° flexion in loading response, near-extension at mid-stance, ~60°
  peak flexion in mid-swing for toe clearance.
- **Pelvis.** Yaw ±4–5° (the swing-side hip moves forward), obliquity ±4–5° (the swing
  side drops), lateral shift ±2–2.5 cm toward the stance leg, vertical excursion of the
  centre of mass ~4–5 cm, lowest at double support.
- **Trunk and shoulders.** The thorax counter-rotates against the pelvis (±3–7° in
  space); the trunk stays nearly upright, a few degrees of forward lean that grows with
  speed.
- **Arms.** Each arm swings against the same-side leg, ±15–20° at the shoulder at a
  normal pace; the elbow keeps 15–30° flexion; the hands hang relaxed, fingers slightly
  curled, palms toward the thighs — never splayed.
- **Base of support.** Step width ~8–12 cm; the feet do not cross the midline; toe-out
  ~5–7°.
- **Head.** Stabilised in space: pitch and yaw within ~±2–3° while the trunk below
  oscillates; the gaze holds the path or a target about two steps ahead.
- Child proportions, elder posture and loads need their own calibration, not only a
  playback-rate multiplier.

### 1.2 Running

Sources: [running mechanics and grounded running](https://pmc.ncbi.nlm.nih.gov/articles/PMC8323463/).

- Not a faster walk: support under ~40 % of the cycle, greater knee flexion, a vigorous
  arm swing with the elbows near 90°, impact absorption and elastic recovery. Aerial
  phases are typical; slow grounded running also exists, so "both feet airborne" is not
  the only test — a run must keep meaningful loading and propulsion rather than hover.
- Foot strike depends on pace and runner; a jog lands near-flat under a slightly flexed
  knee (~20°), a sprinter on the forefoot.
- **Trunk lean is small** at a steady run (~5–10°) and larger only while accelerating;
  the drive comes from hips and stride, not from tipping the torso. Head up, eyes
  forward. Thorax rotation ±10–15°, counter to the pelvis. Deceleration needs braking
  steps.
- **Walk → run** happens near 2 m/s (Froude ≈ 0.5). A **jog** sits between walk and
  sprint; cross-fading a double-support walk straight into a flight-phase sprint gives a
  hybrid that is neither.

### 1.3 Turning

Sources: Hollands, Patla & Vickers 2002 ("Look where you're going!"); Grasso et al.
1998; Hase & Stein 1999; Patla et al. 1999;
[anticipatory turning](https://pubmed.ncbi.nlm.nih.gov/28948937/),
[turning kinematics](https://pmc.ncbi.nlm.nih.gov/articles/PMC4155102/).

- **Top-down sequence.** Eyes lead, the head yaws ~200 ms before the body, then the
  shoulders, the pelvis, the feet. During a curve the head leads the trunk by ~10–25°.
- **In motion.** The body leans into the curve; the inside path and step are shorter
  than the outside ones. Small turns are step turns, sharper ones spin turns that pivot
  on the **ball** of the stance foot, not the ankle.
- **On the spot.** 2–4 small reorienting steps for 90–180°: the first foot opens toward
  the new heading, the other follows. The feet never glide rigidly with the root, and
  the turn is a support transfer, not whole-character yaw smoothing.

### 1.4 Actions

Animation-design interpretations informed by research on coordinated reaching
([arm–trunk pointing coordination](https://pubmed.ncbi.nlm.nih.gov/8983989/),
[whole-body reaching and equilibrium](https://pubmed.ncbi.nlm.nih.gov/10550511/)),
not claims of one universal pose.

- **Dig (spade).** Stable stance; the blade set near-vertical; pushed in with a foot on
  the tread and the weight over it; levered back with the hands apart on the shaft (rear
  hand low on the handle, lead hand down the shaft); lifted by bending knees and hips;
  the trunk turns toward the throw; the gaze stays on the blade. Resistance shows in the
  whole body and the tool carries both hands. (African hoe work, the typical 1890 field
  tool, is a short hoe swung down in front from a hip-hinged trunk; the design rule says
  shovel, so we keep it.)
- **Pick up.** Gaze and preparation; a squat (knees and hips flex, back fairly straight)
  or a hinge (hips flex, knees soft) chosen by the object's height; the spine's rounding
  distributed; hand preshaping, contact, closure, then a lift with the object. The other
  hand often braces on a knee.
- **Point.** The gaze reaches the target first, then the arm rises near-straight (elbow
  0–15°), the index extends and the other fingers curl; the shoulder protracts slightly
  and the trunk turns a little toward the target. A readable line runs from the face
  through the hand.
- **Reach (contact).** Distributed over ankle, knee, hip and spine flexion, then the
  scapula (protraction), then the arm; the head stays on the hand or object; beyond a
  safe reach the person steps instead of stretching or tipping.
- **Carry.** Shoulder load: the trunk leans slightly away and a steadying hand holds the
  shaft. Head load: an extremely upright trunk, a stabilised head, a smoother gait with
  less vertical bob, one supporting hand.
- **Chasing (child, tag).** Still a run: lower-body propulsion and the free arm's
  counter-swing are kept; the head is up and locked on the quarry (neck extended where
  the trunk leans); one hand prepares as the distance closes, then reaches near
  horizontally with the shoulder protracted; recovery after a hit or a miss. The lean
  comes from acceleration, not a bow. Two arms held forward the whole time read as a
  stiff grab, not a pursuit.
- **Dejection (the caught child).** A short brake and settle, then a nearly upright
  trunk; the shoulders fall forward and down (scapulae protract and depress); the chest
  sinks (thoracic flexion); the chin drops on its own (neck flexion); the arms hang
  loose, slightly in front of the thighs; the weight may rest on one leg. **Not** a hip
  fold and not a crouch; the hold may breathe or shift weight without its feet sliding.

## 2. Techniques a real-time game uses

1. **Clip playback plus corrective IK** (foot locking, ground adaptation). The clip owns
   the pose; IK changes only the delta that puts a foot where the lock or the ground
   wants it, keeping the clip's knee swivel by taking the pole from the clip's own knee
   (Unreal *Leg IK* / *Foot Placement*, Unity *Animation Rigging*). Corrective IK is a
   final constraint pass over a plausible pose, not a replacement for one; analytic
   two-bone solvers with stable poles suffice for this rig
   ([three.js CCDIKSolver](https://threejs.org/docs/pages/CCDIKSolver.html) exists but
   is not a better match).
2. **Stride and speed warping.** The stride scaled about the pelvis with the pelvis
   height adjusted so the legs neither lock nor crouch; cadence covers the rest. An
   in-place clip follows gameplay displacement when its phase advances by the distance
   actually walked ([code- vs data-driven displacement](https://theorangeduck.com/page/code-vs-data-driven-displacement)).
3. **Layered and additive animation.** A full-body base layer, masked layers per action,
   additive deltas (lean, breathing, look) applied relative to a known reference pose,
   in a defined space and order, limited so the sum stays plausible. Eased transitions
   first; inertialization only if interrupted actions still jump
   ([springs and damping](https://theorangeduck.com/page/spring-roll-call),
   [three.js AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)).
4. **Look-at / aim chains.** The gaze distributed over spine → chest → neck → head with
   weights and limits (e.g. 0.1/0.2/0.3/0.4); head stabilisation is the same mechanism
   aimed at the horizon.
5. **Spine distribution.** A lean of N° spread over 3–5 spine bones: a curve, not a
   hinge.
6. **Motion matching** (Clavet 2016, *For Honor*; UE 5.4 Pose Search,
   [Epic's documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine)).
   It selects a frame from pose, velocity and future trajectory and needs broad,
   consistent coverage of starts, stops and turns. With ~10 CC0 clips search cannot
   supply missing motion. Technically feasible later in plain TypeScript over an
   offline feature table; **deferred** (both halves agree, concept §4).
7. **Procedural secondary motion.** Pelvic drop and shift, breathing, settling, idle
   weight shifts — cheap, and it removes the mannequin stillness.

## 3. Rig standards

There is no universal "natural motion" bone count; count deform joints apart from
roots, IK helpers, end markers and correctives. More useful than a count are consistent
anatomical axes, rest/bind transforms, morph-dependent joint locations, correct
elbow/knee bend directions and normalized weights.

| Rig | Bones | Spine | Twist | Fingers | Toe/ball |
|---|---|---|---|---|---|
| **Ours** (`scripts/villager/skeleton.py`) | **21** | hips + spine + chest; `spine` shares its head with `hips` | none | none (grip is a morph) | toe ✓ |
| MakeHuman `game_engine` (our weight source, measured) | 53 | pelvis + spine_01/02/03 | none | 15/hand | ball ✓ |
| Quaternius UAL1 (Rigify DEF, measured) | 53 | hips + spine.001/.002/.003 | none | 14/hand | toe ✓ |
| Quaternius UAL2 (UE naming, measured) | 65 | pelvis + spine_01/02/03 | none | 15 + leaf/hand | ball ✓ |
| Mixamo (standard full-finger) | commonly 65 (~25 without fingers) | Hips + Spine/Spine1/Spine2 | none | 15–20/hand | ToeBase ✓ |
| UE4 mannequin | ~68 | pelvis + spine_01–03 | upper arm, forearm, thigh, calf | 15/hand | ball ✓ |
| UE5 Manny | ~89 | spine_01–05, neck_01–02 | 2 per segment | + metacarpals | ball ✓ |
| Autodesk HumanIK characterization | 15 mandatory nodes | — | — | — | — |

Counts: [Mixamo 65-bone skeleton](https://community.adobe.com/questions-696/mixamo-standard-65-bone-skeleton-589638),
[UE compatibility profile](https://manual.reallusion.com/Live_Link_Plugin/ENU/Live_Link_Plugin/1.36/Skeleton-between-HD-and-UE-Characters.htm),
[HumanIK structure](https://help.autodesk.com/cloudhelp/2023/ENU/Maya-CharacterAnimation/files/GUID-5DEFC6E5-033C-45D5-9A0E-224E7A35131B.htm).
The common denominator of game rigs is **three spine segments plus a clavicle and a ball
joint per side**. Twist bones fix candy-wrapper wrists and thighs; fingers matter only
where hands are seen close. Our rig already has clavicles, toes, neck and head — much
of what the motion needs — but drives several of them badly (§6).

## 4. Reachable motion sources and licences

"Free download", "royalty-free" and CC0 differ. Only actual imported bytes and their
licence count; every adopted source enters `scripts/villager/sources.json` with origin,
immutable URL, licence id and the sha256 of the downloaded bytes (concept §2
constraint 3). Licence statements below are the halves' readings at research time;
whoever pins a source re-reads the live licence text.

| Source | Licence | Usable clips | Verdict |
|---|---|---|---|
| **Quaternius Universal Animation Library 1** (pinned snapshot; glTF sha256 `0ff075c7…7765`, buffer `6e65377d…543c`, licence `a2010f34…0499`) | CC0-1.0 | Walk_Loop, Walk_Formal_Loop, **Jog_Fwd_Loop** (unused), Sprint_Loop, **PickUp_Table**, **Interact**, Crouch_Fwd/Idle, **Idle_Talking_Loop**, Push_Loop, Fixing_Kneeling | **Use** — already pinned; never replace the hashes with an unversioned "latest" URL |
| **Quaternius UAL2 Standard** (`UAL2_Standard.glb` + licence on disk; pinned at 98069fa23, removed at 74ff3d00d) | CC0 | **Walk_Carry_Loop**, **Farm_Harvest**, Farm_PlantSeed, Farm_Watering, TreeChopping_Loop, Idle_No_Loop, Yes, Idle_FoldArms_Loop, OverhandThrow | **Use** — re-pin with licence and sha256 |
| Current Quaternius UAL1 Standard (publisher page) | CC0 | the advertised library includes paid tiers; the free archive's inventory is unaudited | Not required: the pinned snapshot holds every needed locomotion clip |
| Kenney Animated Characters Protagonists | CC0 | basic locomotion, inventory unaudited | Not required |
| MakeHuman / MPFB2 base mesh, targets, rig, weights | CC0 (own records in `sources.json`) | body, morphs, finger weight groups (for hand shapes) | In use |
| CMU Graphics Lab Motion Capture DB | custom permissive ("free for all uses … may not be resold as data") — **not CC0**; the original site timed out at research time | walks, turns, run, pick-up, pointing, children's play | **Excluded** — the CC0 constraint is binding |
| Mixamo | Adobe terms; commercial project use, raw redistribution restricted, not CC0 | — | **Excluded** |
| Ubisoft LAFAN1 / Bandai Namco motion datasets | CC BY-NC(-ND) 4.0 | — | **Excluded** (non-commercial) |
| Orange Duck motion-matching example | code MIT, its motion data CC BY-NC-ND 4.0 | — | **Excluded** (the data is not MIT) |
| 100STYLE | CC BY 4.0 | stylised locomotion | Not needed (stylised, attribution) |

There is **no CC0 turn-on-the-spot, point or child-tag clip** among the reachable
sources: those are procedural (concept steps 12, 14–16), and original offline-authored
clips are the clean fallback for any other gap.

## 5. How the game composes a villager today (measured, concept §1)

Read with a plain GLB parser from `public/models/villager.glb` and from the code.

| Measurement | Result |
|---|---|
| Skeleton | 21 joints; `hips` and `spine` share head and tail (`skeleton.py:13-14`); MakeHuman `spine_01+02` summed into `spine`; UAL1 `DEF-spine.002` dropped — the trunk has two pivots (pelvis, spine-2) |
| `spine` channel | 0.0° on all axes in walk, sprint, idle, kneel*, carry, carryIdle; only the authored dig writes it (20–26° pitch) |
| Walk trunk | chest pitch 16.4/18.2/20.0°, neck −9°, head +6°; hips yaw ±2°, roll ±2.5°, lateral x −0.025..0.031, vertical 0.043 |
| Walk feet | ankle x +0.082..0.093 (L), −0.093..−0.082 (R) through the cycle — the feet do **not** cross the midline |
| Sprint trunk | hips pitch 22.7° constant; chest 25.7/31.5/38.5°, chest yaw ±27–29°; the head 0.29–0.32 ahead of the hips |
| Idle | hips yaw −13.3°, head yaw +11.0° constant; feet staggered (L z +0.09, R z −0.23) |
| Dig keys | shaft 60° from horizontal at t = 0 and 0.45, 45° at 0.85, 22° at 1.30, 16° at 1.70; head fixed 0.12 rad; the extra-lean search folds the trunk onto the upper hand |
| Dig clocks | `DIG_PERIOD` 2.4 s (`toolclips.py:199`) against `DIG_CYCLE_SECONDS` 1.5 s (`gesture.ts:472`) counted by `adultWork.ts:307` |
| Leg solve | `solveLimb` on both legs every frame, pole (0,0,1), hips height untouched by the stride warp, toe never re-written, holds x/z only, `plantRelease` moves a held anchor |
| Layer masks | gait layer = `LEGS` + free arms; `UNWRITTEN` resets toes and clavicles; trunk/neck/head code-written; contacts solved before `applyClipLayers`; `unsquashHead` writes identity at squash 1, twice per frame |
| Grip morphs | `grip.L/R` survive `bakeMorphs` and die in the hang bake (`villagerFigureBody.ts:112`); no runtime reads `clip.grip` |
| Turn | `walked = ahead ± (aside + turned·turnStep)`, `turnStep` 0.4 — a stationary quarter turn "walks" 0.63 units |
| Tag | `lean = max(runLean, shown.lean)` with `TOUCH_LEAN` 0.5; `chaserGaze` turns the trunk; `CHASER_ARMS` both forward, both counted as contact arms; `caughtSlumpLean` 0.48 with an `// OPEN` against 0.20 |
| Pick-up | one beat: the jar fill (`adultWork.ts:669-683`), drawn as a y-squash of the whole group (`PlaceLife.tsx:3189-3194`) and two prop visibilities |
| Runtime clips | the runtime reads walk, sprint, carry, carryIdle, dig only; idle and kneel* are exported and unused |
| Clip speeds | walk 0.834 and sprint 6.01 person units/s natural speed (7.2×); one cross-fade band ±0.35 around 1.8, no jog |
| Contacts (raw clips, 600 samples) | walk 67.7 % / 67.8 % contact per foot, 35.5 % double support; sprint 12.2 % / 7.0 %, 80.8 % with neither foot down |

## 6. Measured diagnosis — the runtime composition next to a reference

**Material.** The runtime-composition sheets `verification/villager-body/runtime-<subject>-<view>.png`
(concept step 1), rendered by `node scripts/villager/build.mjs sheets` from the export of
`src/render/villagerRuntimePose.test.tsx`: the game's own figure (`SkinnedFigure`, the
caller's pose code as PlaceLife drives it), every bone's local transform per frame, round
trip checked in Python (`gamepath.runtime_check`: worst joint 0.0, rest 2.1e-7 against a
1e-4 tolerance, 8 subjects, 92 frames). The numbers below are read from the same export
(world joint positions; a segment's tilt is its angle from vertical toward the facing,
an arm's elevation the shoulder→hand angle above horizontal, the swing the upper arm's
sagittal angle, forward positive). Reference: §1.

**Cause classes.** R = rig too primitive; D = joints present but badly driven; O = the
clip's motion overridden by code; S = missing secondary motion; X = a defect outside
motion design (a bug).

### 6.1 Per subject

| Subject | Measured on the runtime composition | Reference (§1) | Deficit and cause |
|---|---|---|---|
| **Walk** (adult man, 1.0 u/s) | trunk segment tilts constant to the degree over the whole cycle: hips→chest −9°, chest→neck +7°, neck→head +18°; hips vertical excursion 0.039 figure units (5 % of hip height); upper-arm swing −6..+25° (forward-biased), elbow 32–41°; hand elevation −74..−43° | thorax counter-rotation ±3–7°, near-upright trunk, arm swing ±15–20° about the hang, head stabilised on the path | **O**: the clip's trunk (chest pitch 16–20° with motion, hips yaw ±2°, roll ±2.5°, §5) never reaches the body — the gait layer writes only `LEGS` and free arms (`gltfClipLayers.ts:102,151`), trunk, neck and head are code-written (`:14-15`), so the trunk is a rigid block riding on the hips. **S**: no thorax counter-rotation, no head stabilisation. **D**: the arm swing is offset forward (hands reach −43°), the "marionette" swing in front of the body. |
| **Turn** (adult man, 90° on the spot) | root travel 0.000, yaw 0→90°; each foot sweeps 0.96 / 0.83 units of path for a net 0.13 / 0.19; knee up to 86°; trunk tilts constant as in the walk | 2–4 small reorienting steps, head leads by ~200 ms, feet do not glide with the root | **D**: `stepWalk` counts a turn as distance (`walked = ahead ± (aside + turned·turnStep)`, `turnStep` 0.4, §5), so a standing quarter turn plays a full walking stride — the sheet shows walking legs under a body that rotates as one block. **S**: no head or eye lead, no pivot on the ball (no toe joint written: `UNWRITTEN` resets `toe.*`, `gltfClipLayers.ts:105`). |
| **Run** (adult man, 3.0 u/s) | whole-trunk tilt 23° constant; neck→head 40–41° (head thrust forward and down); upper-arm swing −40..−1° (always behind vertical), elbow 80–94°; knee 34–108° | trunk 5–10°, head up and eyes forward, arm swing both sides of the hang with ~90° elbows, thorax rotation ±10–15° | **O/D**: the sprint clip's ~50° dive (hips pitch 22.7° constant, chest 26–39°, §5) is played as the only fast gait and its trunk is again replaced by the code's constant lean; the arms swing only behind the body, so the forearms point forward permanently ("reaching"). **S**: no thorax rotation. No jog exists between walk and sprint (§5 clip speeds). |
| **Dig** (adult man, one 2.4 s stroke) | hips→chest 22–30°, chest→neck 46–59°, neck→head 51–62°; hips 0.79–0.86 of standing height (knees 57–81°); shaft near horizontal across the thighs at 1.55–2.21 s and through the dress | trunk hinge distributed over hips and spine, gaze on the blade, near-vertical blade at set, hands apart on the shaft | **R/D**: the fold sits in the upper trunk (chest→neck is twice hips→chest) because the trunk has two pivots and `spine` is zero in every retargeted clip (§5); the extra-lean search folds it further onto the upper hand (concept §1). **D**: the shaft passes through the thigh and dress in the lever phase (no tool–body clearance in the stroke). Dig runs on two clocks (2.4 s clip, 1.5 s caller, §5). |
| **Pick-up** (adult woman, jar fill) | hips down to 0.36 of standing height (crouch × the group's y-squash); left arm hangs plumb the whole time (elevation −84..−82°, swing −5..−2°); right upper arm swings 62° **backward** (−62°); knees to 140° | squat or hinge chosen by the object's height, the reaching hand forward to the object, the other bracing, gaze on the object | **D**: the fill pose drives the right arm backward, behind the body, and the left arm not at all (the jar's place is not part of the export; behind the body is wrong for any jar the figure faces). **X/D**: the whole figure is squashed in y (`PlaceLife.tsx:3189-3194`), which shortens trunk and head together — a scale, not a pose. **R**: no fingers for a grip (grip morphs die in the hang bake, §5). |
| **Point** (adult man, bearing 0.6 rad, elevation 0.15) | for 0.58–1.73 s the pointing hand stays at −62..−45° (below horizontal) with the trunk stooped to 22–32° and the head down (neck→head to 49°); horizontal only at 1.92 s (+12°); in the 2.11 s sample the hips stand at 0.50 of standing height (a full squat) and in the next sample, 2.30 s, upright again (the export samples ~0.19 s, 11–12 simulation frames, apart; how long the squat lasts is not measured) | gaze first, arm near-straight on the target line, slight trunk turn toward it | **D**: the arm aims below its line. The stoop is inferred, not traced: the point gesture's own lean is 0.03 rad (`gesture.ts:441`), and the only other trunk writer in reach of 22–32° is the contact lean (≤ `CONTACT_LEAN_MAX` 0.5 rad = 29°), which applies because the raised arm counts as a contact arm. **X**: around the release the pose drops into `CROUCH_MAX` (see 6.2). **R**: no index finger. |
| **Chaser** (child, port-city tag, 3.4 u/s) | hips 0.50–0.65 of standing height in every frame, knees 103–126°, **no stride** while the root travels 5.6 units; trunk 38–57°, neck→head 63–82° (face to the ground); the reaching forearm crosses the face at 1.25–2.15 s | still a run: propulsion and counter-swing kept, head up on the quarry, one arm reaching horizontally, lean from acceleration | **X**: a full squat sliding along the ground — see 6.2 (teleport threshold in figure units). Behind the bug, **D**: `lean = max(runLean, shown.lean)` with `TOUCH_LEAN` 0.5 and both `CHASER_ARMS` forward and counted as contacts (§5) give the bow and the double grab; the gaze turns the trunk, not the head. |
| **Caught child** (river-bank round) | from 0.63 s: hips 0.52 of standing height (knees 126°), trunk to 54°, neck→head 67°, both arms plumb (−84..−67°), splayed outside the knees in the front view | nearly upright trunk, shoulders protracted and depressed, chest sunk, chin dropped, arms loose in front of the thighs; not a hip fold, not a crouch | **X**: the crouch is the same `CROUCH_MAX` fallback (6.2). **R/D**: `caughtSlumpPose` (`tagGame.ts:1495`) is one lean (0.48) plus an arm pitch; with two trunk pivots and the clavicles reset (`UNWRITTEN`), protraction, chest sink and a distributed slump cannot be expressed. |

### 6.2 Defects found by the measurement (X)

- **Teleport threshold in figure units.** `stepWalk` (then `src/render/figureWalk.ts:441`)
  treated a ground speed above `VILLAGER_MOTION.teleportSpeed` = 6 person units/s (now 10) as a
  placement; the speed is divided by the figure's world scale (`skinnedFigure.tsx:551`),
  so a child (0.55) at the tag sprint speed 3.4 u/s measures 6.18: every frame is
  "placed, not walked", the measured speed stays 0, no gait plays. Checked by
  experiment: the same subject at 3.2 u/s (5.8) runs (hips 0.96–1.07 of standing, feet
  alternating ±0.4). Filed as a request (findings carrier, 12.10.2026).
- **`CROUCH_MAX` as the fallback of an unreachable contact.** `contactCrouch`
  (`src/render/figureRig.ts:39`) returns the deepest squat when no knee flex brings a
  hand to its target, and every arm a pose moves off rest counts as a contact
  (`skinnedFigure.tsx` `contactArm`). A gesture that is no contact — the chaser's
  forward arms while "standing" (above), the slump's pitched arms, a point's release
  frame — therefore squats the whole figure. `contactLean` already gives up beyond
  `CONTACT_LEAN_REACH`; the crouch has no such limit. Filed with the request above.

### 6.3 Summary by cause

- **Clip overridden (O):** the decisive one for walk and run. The gait layer applies
  only legs and free arms; the clip's pelvis-trunk-head motion is replaced by a
  constant code lean, so the trunk is rigid in every gait (tilts constant to the
  degree). The leg IK re-solves the whole leg onto the stride (§5), so the clip's own
  leg timing is also largely replaced. → final state 3 (clip preserved, IK corrective).
- **Rig too primitive (R):** two trunk pivots (`hips`/`spine` share head and tail),
  clavicles and toes never written, no fingers. A distributed lean, a protracted
  shoulder, a roll over the ball and a grip or index cannot be expressed. → final
  state 2 (three-segment spine, clavicles and toes driven, coarse finger groups).
- **Joints present but badly driven (D):** the turn as distance, the forward-biased
  walk swing and behind-only run swing, the pick-up arm going backward, the pointing
  arm below its line, the shaft through the thigh, the tag lean stacking on the
  sprint's dive. → final states 5–8.
- **Missing secondary motion (S):** no thorax counter-rotation, no head stabilisation
  or lead, no gaze target. → final states 5–6.
- **Defects (X):** the two in 6.2 make the tag chaser and the caught child squat
  regardless of any pose design; they are filed separately because they are bugs with
  player impact, not motion design.
