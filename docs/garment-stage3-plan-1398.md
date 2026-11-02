# Villager garments stage 3 — plan against the current code (point 1398, revision 2)

Stage plan for skirtShort, skirtKnee, loinFlap, apron and girdleTails on driven column bones. Revision 2 answers GPT-6.1 Sol's check 1 (docs/four-eyes/1398-plan-check-1-sol.md, B1 to B26) and replaces revision 1 in full; section 9 maps every finding to the section that answers it. Written against `main` at 84a3665a0 (merged to 24a914e; nothing under `scripts/villager` or the garment runtime changed in between).

Sources: docs/garment-merge-r9-1347.md section 3 (the stage-3 list); the definitions it inherits from revision 2 ("Loose garments", round-2 B2 to B9) and revision 3 (the deferrals B2 to B7, B9, B10, B18 to B20, with their round-3 objections in docs/garment-check-3-1347.md); docs/garment-merge-r10-1347.md (the amended pre-split, which landed).

Procedure (point 1398): this plan goes to the cross-vendor break check until approved, then to the user, then to implementation. No file under `src/` changes before that.

Acceptance standard, unchanged from revision 9: visibly dressed at 3 m and 7 m in a port city and a village on both backends, judged in pictures. From this revision on the judgement covers moving sequences as well as stills (section 5). Per point 1339 no numeric penetration threshold is an acceptance gate; every measured row below is a detector with a named response.

Units: pipeline figure units (1 unit ≈ 1.3 m); H the stature; "mm" = 0.001 units, as in revisions 9 and 10.

## 1. What stage 1 left in the code

- `scripts/villager/shells.py` holds four shells, not five: trousers-waist (2), neckBeads-neck (1), neckBeads-chest (2), waistBeads-waist (3). The breast cloth left `SHELLS` on 01.11.2026 by revision 9's named response and returns in stage 4 (point 1399).
- The body is band-subdivided and cut by revision 10 (`VILLAGER_ASSET.bodySplit`; the split regression is a gate outside the kneel family). The shipped body has about 13300 vertices.
- Runtime shell code: `src/render/villagerShell.ts` (`buildShells`, `cutBodyIndex`, face masks, rims) and `gltfShellParts` / `gltfFigureGeometry` in `src/render/villagerFigureBody.ts`. Shell layers never reach `layerOf`.
- `garments.py` holds one `meshes` entry per name. `build_garments` skips shell entries. `cloth_names` lists the non-shell meshes that make up the cover order.
- The five forms are still legacy, built by `garments.py build_form` (lines 464–477):
  - loinFlap, apron and girdleTails: `girdle()` (a torus 0.008 H thick) plus two `tube` sweeps at 8 rings. The sweeps are kept by `abs(ang(i))` on the 24-sample grid, so the rendered edges fall on multiples of π/12, not on the keep thresholds.
  - skirtShort and skirtKnee: one `tube` sweep at 12 rings.
  - `tube` adds flare × (hips rest height) × t² × (0.45 + 0.55 |sin a|).
  - `finish` pushes the result out by 7 mm and transfers body weights. For every form in `SKIRTS` that reaches below the crotch it also blurs the weights round each ring and folds shin into thigh (`skirt_weights`). That blur is why a swing leg leaves the hem and passes through it.
- There is no stage 2. Revision 3 moved the column bones from revision 2's step 2 to the start of stage 3 and kept the stage numbers 3 to 5.
- The skeleton has 22 bones (`skeleton.py BONES`). `skinnedFigure.tsx` writes the per-frame pose in this order:
  1. `applyClipLayers`: idle, gait with `clipGaitPose` and its leg IK `correctLeg`, carry, dig, each through `toHung`;
  2. `poseShoulders`;
  3. `leanTrunk`;
  4. `gazeHead`.

**Baseline** (verification/villager-body/penetration-report.md, legacy rows on main):

| Garment | Row | Worst value | Where |
| --- | --- | --- | --- |
| skirtKnee | skin through the cloth | 0.1147 | jog frame 10, thigh.R, 643 frames |
| skirtShort | skin through the cloth | 0.0359 | jog, thigh.R |
| skirtShort | cloth in the body | 0.0508 | — |
| loinFlap, girdleTails, apron | inner garment through the cloth | 0.02–0.06 each | under the chest cloak, in dig |
| waist beads (shell row three) | through skirtKnee | 0.0117 | 2335 frames |
| waist beads (shell row three) | through skirtShort | 0.0095 | — |

## 2. Defects in the inherited text and how this plan resolves them

- **E1 Panels over the waist beads.** Revision 9's rank table puts the loinFlap and girdleTails bands at rank 1 (6 mm) and the waist beads at rank 3 (12 mm). The bands sit at the girdle and do not overlap the beads, but the panels hang over the beads. A panel whose radius were only its band's offset would lie inside the beads; today's row three already shows this for the skirts (0.0117). Resolution: one explicit cloth clearance per row (section 3.9). Rank orders shells only and never sets a panel's radius.
- **E2 Single outward tilt (check-3 B2).** Revision 2's "maximum of closed-form lower bounds" is withdrawn. The solve is a bounded, sampled, stateful search with all constraints evaluated together and a final full evaluation (sections 3.4 and 3.6).
- **E3 Hold-at-rest (check-3 B7).** A frozen hips cone under a still-legacy outer garment is not the legacy deformation, and the legs walk through it. Section 3.11 replaces hold-at-rest with outfit-specific routing that has a terminal step for every combination.
- **E4 Row two saturated.** The stage-1 shell row two reports `hips in hips` on 6690 of 6690 frames, at exactly one offset, for the trousers and the beads. After revision 10's band subdivision the source's two-ring is about 1 cm wide, so the shell point finds its own neighbourhood beyond it. In this state the row cannot name an inner-thigh contact.
  - Resolution: the exclusion becomes geodesic: every body triangle within 3 × the local offset of the source along the surface (section 3.14).
  - This also answers the point's "any inner-thigh residual stage 1 recorded": none was recorded, because the row could not record one. The trousers pictures were accepted at the inner thighs in every walk crossing.
  - The repaired row is re-run for the trousers and its frames are judged.
- **E5 Nested driven garments (check-3 B6) are not generated.** Measured with `outfitCombos()` (revision 9 section 4): no outfit wears two of the five together, and wrapLong-waist stays legacy until stage 4. A Vitest asserts this on the enumeration. Consequence used below: a figure wears at most one driven form, so the column rest skeleton can be set per figure from that form (section 3.2).
- **E6 Hem deltas.** The per-formula derivation that check-3 B10 asked for is replaced by revision 10's own construction: build at the ten morph corners with a frozen topology, then solve the basis and nine deltas from that square system (section 3.8).
- **E7 New cut rows.** The bands need cut rows at girdle − 0.008 H and girdle − 0.02 H, which revision 10's list lacks. They go through the band subdivision and the split-regression gate like every other cut.

No contradiction between revision 9 and the current code blocks the plan. The breast cloth's revert changes nothing for these five: they meet it only as a legacy garment above the girdle.

## 3. The plan

### 3.1 Column bones (skeleton, body, clips, export, asset)

- **`skeleton.py`.** A computed-head kind beside the MakeHuman-joint kind. 24 bones are appended after the existing 22, so every existing index stays stable: `col.U.k` (parent `hips`) and `col.L.k` (parent `col.U.k`), for k = 0..11 at `angles(12)` about the hips axis.
- **`body.py`.** `joints` and `joint_deltas` gain the 24 rows at a form-neutral reference:
  - upper heads on the girdle iso-line at the twelve angles, at offset zero;
  - knee pivots at the mean `shin` y;
  - ankle pivots at the mean `foot` y;
  - `W` and `Wfull` gain zero columns.
  These reference heads exist only so that a skeleton without a driven form is well defined. A worn form replaces them per figure (section 3.2).
- **`clips.py` / `export.py`.** Every clip's quaternion array gains identity rows. `write_clip` writes no channel for a column bone; the driver owns them. `extras.villager.columns` gives `count`, `segments`, the twelve angles and the capsule table of section 3.5.
- **Runtime.**
  - `villagerAsset.ts` exposes `asset.columns` (null without one).
  - Every loop that writes clip rotations over `asset.bones` skips column bones. That includes `blendInto(asset, bones, asset.bones, …)` in the dig layer of `gltfClipLayers.ts`, plus every other whole-skeleton loop found by grepping `asset.bones`.
  - A Vitest asserts that no clip layer writes a column bone.
- **Cache keys (B26).**
  - The body, clips and garments keys gain `skeleton.py`.
  - The garments and export keys gain `driven.py`, the band table in `shells.py`, `VILLAGER_ASSET.drivenGarments`, the column count and the capsule margins.
  - `cachekeys.test.mjs` asserts that changing each of these invalidates its key.

Landed alone this changes nothing visible: no vertex carries column weight yet.

### 3.2 Per-form rest and runtime pivots (B3, check-3 B18)

**Rest contract.** The rest skeleton is per figure. When a figure wears a driven form F (at most one, E5), the 24 column rest heads are set from F before any bake:

- the upper heads at F's column anchors (section 3.3);
- the knee pivots at the anchor's x and z at the mean `shin` y;
- the ankle pivots at the mean `foot` y.

The pipeline builds F's panel against exactly these heads. `extras.villager.driven[F].heads` carries them as basis plus deltas from the same corner solve as the panel (section 3.8). With all column rotations at identity, the skinned panel therefore equals its built rest shape. A Vitest asserts this within 1e-4 for all five forms on an adult and a child.

**Runtime pivots.** `gltfPerson`'s hang (`hungHeads`) moves the shin and foot joints per person. After `hungHeads`, the 24 heads are recomputed in the hung rest:

- the upper heads from F's hung anchors;
- the knee and ankle pivots from the hung `shin` and `foot` heights.

They are written into `frame.rest` before the skeleton is created and before any garment is baked, so `bakePose` and `createGltfSkeleton` see the same heads. A DEV assertion checks, per person: |knee pivot y − mean hung shin y| < 1e-4, and anchors against the junction row within 1e-4. The Python mirror in `gamepath.py` does the same after its hang bake.

### 3.3 Junction contract (check-3 B9, B4, B5, B6)

Each of the five gets a waist band shell (section 3.12). Its bottom loop of body source vertices is the junction.

- **Attachment positions independent of drawn cuts (B5).** The panel's row 0 is computed from the shell recipe's vertex function, not from the drawn band: for each junction source vertex, the body position plus F's band offset × `person.frame.scale` along the body normal. It is computed whether or not the band's faces are drawn: cut by trousers in a forced outfit, or hidden by a legacy garment. `gltfFigureGeometry` writes the panel's row-0 positions from this function. Where the band is drawn, a DEV assertion checks that the band's bottom offset row and row 0 agree within 1e-6.
- **No inserted vertex at row 0 (B4).** Panel boundaries are snapped to the nearest junction loop vertex. A boundary moves by at most half a loop edge (about 1 cm at the girdle after revision 10's subdivision). The resulting widths are recorded in section 3.10. Row 0 therefore consists of loop vertices only, each with a source index, so position, weights and morphs come from the source exactly.
- **Column anchors (B4).** Anchor k is the point of the junction offset row at angle k, given as (loop edge (i, i+1), parameter t), frozen on the basis body (section 3.8). Rest position and morphs are the t-interpolation of the two offset vertices. At runtime the driver skins both endpoint vertices on the CPU with their own four weights, then interpolates the skinned positions at t. That is the drawn chord of the band edge, so the anchor lies on the drawn junction in every pose. The anchor carries no weights of its own.
- **Motion the driver sees.** The band moves with spine, hips and thigh influence. Each frame the driver sets each `col.U.k` translation (in hips-local space, section 3.4) so its head sits on the skinned anchor. The column bones therefore follow the junction's actual motion.
- **Four influences (B6).**
  - Row 0: the source's four body weights.
  - Rows 1 to 3: the junction source's two heaviest body bones, renormalised and scaled by (1 − f), plus the two nearest upper columns scaled by f, with f = 1/3, 2/3, 1. That is four influences.
  - Rows below row 3: upper columns only, down to the knee blend.
  - Knee blend (one row band centred on the knee pivot row, only on panels that reach it): the vertex's two columns, split between `col.U` and `col.L` by the row's position in the band. That is four influences (U.a, U.b, L.a, L.b).
  - Below the knee blend: `col.L` of the two columns only.
  - The builder asserts that the knee band starts at least four rows below the junction.
  - The two-bone reduction in rows 1 to 3 is validated by a Vitest over the runtime pose domain of section 3.5: skinned rows 1 to 3 against the same rows with the full source weights. Named response if the deviation exceeds 1 mm: three body bones plus the nearer column.

### 3.4 The driver: frames, solve, state (B2, B16, B18, check-3 B2)

**Module.** New `src/render/villagerSkirtDriver.ts`. It is called in `skinnedFigure.tsx` once per figure per frame, after the last writer of hips and leg bones (`applyClipLayers`, `poseShoulders`, `leanTrunk`; `gazeHead` touches neither). It runs only for a figure with column-weighted vertices.

**Frames (B2).**

1. The driver does not read `matrixWorld`. It first composes, in the figure frame (the skinned mesh's bind space, in which `gltfPerson` grounds the feet at y = 0), the world matrices of hips, thighs, shins, feet and toes. It builds them from each bone's current `position`, `quaternion` and `scale` along the parent chain. It also builds the matrices for the junction sources' bones, which the anchor skinning needs.
2. Capsules, anchors and the ground plane y = 0 are evaluated in that one frame.
3. The solved column transforms are converted to parent-local values before they are written:
   - `col.U.k` position = inverse(hips) · anchor, and quaternion = inverse(hips rotation) · world rotation;
   - `col.L.k` is written relative to its solved `col.U.k`.
4. The normal skeleton update then runs as it does today.

A Vitest compares the driver's composed matrices against `updateMatrixWorld` on the same pose.

**Variables.** Each segment has an outward tilt angle θ in its column's radial plane about the hips frame, with θ ∈ [0, θmax] and θmax = 80°. Each segment also has an axial scale σ ∈ [0.3, 1], which is 1 except under the ground fallback (section 3.7). The upper segments are solved first, then the lower ones; a lower segment hangs from its solved knee point.

**Candidate search per segment.**

1. Candidates: θ at 10° steps over [0, θmax] (9 values), then two refinements about the best one at ±5° and ±2.5°. That is 13 evaluations per segment.
2. Each candidate is evaluated against all constraints together:
   - the clearance target per capsule at three stations along the segment (section 3.6);
   - the ground at every row the segment carries (section 3.7);
   - the chord target to both neighbours' current solutions;
   - the neighbour tilt difference ≤ 60°;
   - θ ≤ θmax.
3. The choice uses continuity state (B18). Among feasible candidates, the driver takes the one closest to the segment's previous θ, after moving the previous θ towards the gravity target (θ = 0 for the upper segment; revision 2's gravity blend for the lower) at a relaxation rate of 90°/s. The step is rate-limited to 400°/s × dt, unless only a larger step is feasible. With no feasible candidate, it takes the one with the smallest worst violation.

**Final evaluation and bounded repair (B16).** After the two passes (the second with the neighbours' final angles), every constraint of every segment is evaluated once more on the final angles:

- capsules at stations;
- the skinned-triangle check of section 3.6;
- ground;
- chords;
- the neighbour limit;
- θmax.

Every segment with a violation is re-searched with its neighbours fixed. A changed upper segment re-solves its lower segment. This repeats at most three rounds. Every candidate respects θmax and the neighbour limit by construction, and no unconditional increment exists. What remains after the third round goes to the ground fallback where the ground is the violated constraint (section 3.7). Anything else is counted in a DEV counter and in the mirror's report row.

**State and determinism (B18).**

- The per-figure state is the previous θ and σ of each of the 24 segments.
- It is reset to the gravity solution, solved without the rate limit for that frame, in these cases: at figure creation, at a teleport or placement, when the worn driven form changes, and when the figure re-enters solving after a skipped frame (section 3.4, cost).
- Given the same initial state, the same pose sequence and the same dt sequence, the result is identical.
- The Python mirror replays sequences statefully with the same rules. The round trip feeds both the same fixed-dt sequences.

**Cost.**

| Work per figure per frame | Size |
| --- | --- |
| Candidate search | 312 candidates × (9 capsules × 3 stations + ground rows) |
| Triangle check of section 3.6 | about 1200 panel vertices skinned on the CPU, triangle–capsule tests only after a bounding-sphere prefilter |

Measured in the closing perf suites at the village crowd. Named responses, in order:

1. Coarse step 20° with three refinements.
2. Skipping figures outside both the view frustum and the shadow camera's frustum. A skipped figure keeps its last solution, and on re-entry it is solved before it draws (B25).

Each response is followed by the moving-sequence acceptance of section 5 on both backends again. Neither is a quality-level setting.

### 3.5 Envelopes (B12, B13, B14, check-3 B5)

**Body-only capsules (B12).** Eight capsules per person: both thighs, both shins, both feet, both toes. Each is the segment from the bone's head to its tail (the toe tip for toes). The radius covers the drawn body vertices with weight above 0.1 on the bone, measured to that segment (endpoints included), at rest after the hang, plus the bone's margin from `extras.villager.columns.capsules`. No cloth or shell thickness is added; cloth clearance enters once, in section 3.9.

**Pelvis without a clamped capsule (B14).** There is no pelvis capsule.

- The pelvis region moves rigidly with `hips`, and so do the columns. A panel row above the crotch lies at its rest offset outside the hull by construction while θ ≥ 0. The rule "no inward tilt" plus the rest hull is therefore the pelvis constraint, and it is exact for the hips-rigid part.
- Pelvis skin carrying thigh weight (the hip crease) is covered by the thigh capsules. The containment test below verifies this.
- The only exempt geometry is the band and row 0, which lie on the skin by construction.
- Rows 1 to 3 and all panel triangles are checked against the actual capsules and, through the penetration rows, against the actual body (section 3.14).
- Directly below the junction the corrective response is the repair of section 3.4: re-search with neighbours fixed. Rows 1 to 3 move partly with thighs and spine, so a thigh capsule constrains them like any other row.

**Containment on the rendered surface (B13).** A Vitest checks containment on the rendered body surface:

- **Surface samples.** Every vertex of every leg and pelvis triangle, plus a barycentric grid inside each triangle at most 1 cm apart.
- **Containing set.** Each sample must lie in the union of the eight capsules and the hips-rigid rest hull, with the hull posed by `hips`.
- **Pose domain.** Taken through `applyClipLayers` + `poseShoulders` + `leanTrunk`:
  - walk, jog and sprint at three speeds each, with stride warp;
  - walk↔jog and stand↔walk blends at weights 0.25, 0.5 and 0.75;
  - kneel down, hold and up;
  - dig;
  - carry;
  - a start and a stop.
- **Morph domain.** The ten corners and, per sex and age group, the builds −1, 0 and +1 that the generator uses. These are the mixed morphs the game actually draws.

Named response for a sample outside: raise that bone's capsule margin to contain it plus 2 mm. The margin lives in `VILLAGER_ASSET.drivenGarments.capsuleMargin` (balance config), which the pipeline exports to `extras.villager.columns.capsules`. Runtime and the Python mirror read the same exported table, so an expansion reaches both.

### 3.6 Chord target and verification on skinned triangles (B16, B17, check-3 B4)

**Clearance target.** The target per column against a capsule is sqrt(C² + (c/2)²):

- C is the capsule radius plus the cloth clearance of section 3.9 at that row;
- c is the chord to the farther neighbouring column under the current candidate.

**Skinned-triangle check (B17).** The chord target does not cover triangle interiors, so the final evaluation of section 3.4 checks the actual skinned triangles:

- Coverage: every panel vertex of the worn form is skinned on the CPU with its exact four weights, including rows 1 to 3 and the knee blend. Every panel triangle (panel boundaries included) whose bounding sphere meets a capsule's expanded bound is tested exactly: the closest point between the capsule segment and the triangle.
- Response: a hit is answered by the bounded repair of section 3.4 on the two columns owning the triangle, followed by a re-check of every triangle those columns carry.
- Report: what remains after the third round is counted in the DEV counter and in the mirror's report.

**A residual the pictures reject.** It is answered, in this order:

1. Repair rounds from three to five.
2. Sixteen columns.
3. The sagittal fallback of section 3.15.

Each step is followed by the moving-sequence acceptance on both backends. None is accepted as shading.

### 3.7 Ground bounds and the ground fallback (B15, check-3 B3)

The ground constraint applies to every row a segment carries: the row point must stay at y ≥ 2 mm in the figure frame. Neither segment is assumed feasible.

**Fallback.** When the best candidate of a segment still leaves a row below 2 mm, the driver shortens that segment along its axis: σ = (height of its top point above 2 mm) / (height drop to its lowest row), clamped to [0.3, 1].

- The bone's scale is set on its axis. Its rows then compress towards the top pivot, and the lowest row sits at the ground.
- For an upper segment, the lower segment hangs from the shortened knee point.
- Three.js skinning applies the bone scale on both backends, so the rendered geometry changes into a bunched hem resting on the ground, not a hem under it.
- Every triangle of the affected columns is then re-checked against the capsules (section 3.6). A remaining contact is counted.
- At σ = 0.3 with rows still below ground, the residual is counted and judged in the low-camera kneel and dig pictures. The pictures decide; no numeric gate applies.

Uneven terrain is not handled, as today.

### 3.8 Hem deltas and frozen topology (B7, B9, check-3 B10)

**Authoritative topology (B7).** It is frozen once on the basis body (adult man, no morph):

- the junction loop's source vertex identities and order;
- the snapped panel boundary vertices;
- each panel's angular membership (which loop vertices it spans);
- each panel's row count;
- the column anchors (edge and t);
- the triangulation.

Rows are spaced by fraction between the junction and the panel's hem, so their count does not change with height. At every corner the builder evaluates positions only, on these identities:

- angles and radii from the frozen source vertices' morphed positions and the hull;
- row heights from the hem formulas at that corner.

Counts and connectivity are identical at every corner, and a selftest asserts it.

**Deltas (B9 adopted).** As revision 10 does for its rest points:

1. Build the frozen topology at the ten corners of `penetration.CORNERS`.
2. Solve the basis and the nine additive shape-morph deltas from that square system.
3. Give hand morphs zero deltas on the panels.

This is exact at the ten corners. Hem heights are linear in the landmark heights, which are linear in the joint deltas, so they are exact under any additive combination. The radial part follows the hull, which is not linear, so between corners it is approximate. A pipeline check exports the panel, applies the glTF deltas additively for the builds −1, 0 and +1 per sex and age group, and compares the result with a direct rebuild at the same morph weights. The deviation is reported per form as information. Named response for a visible deviation: judge that person in the picture; if the hem reads wrong there, add that morph combination as an eleventh fitted corner in a least-squares solve.

### 3.9 Cloth clearance, ease and flare (B11, B12, check-3 B20)

**Radius.** A row's rest radius at angle a is

r(row, a) = hull(row, a) + clearbase + ease_F + flare_F × hips_y × s² × (0.45 + 0.55 |sin a|),

- hull: the body's trunk hull radius at that height in the design pose (`Body.ring` / `ray_hull`; below the crotch, the hull of both legs);
- clearbase: F's own band offset (base + rank × step), the attachment offset;
- hips_y: the hips joint's rest height, so flare scales with body size exactly as the legacy `tube` does (B11);
- s: the row fraction from the junction (0) to the panel's hem (1);
- the quadratic falloff and the fore-aft reduction are kept from `tube` (B11);
- ease_F and flare_F: set per form, never per rank.

| Form | ease_F (× H) | flare_F | legacy ease / flare |
| --- | --- | --- | --- |
| loinFlap | 0.004 | 0.03 | 0.009 / 0.03 |
| girdleTails | 0.004 | 0.03 | 0.009 / 0.03 |
| apron | 0.005 | 0.03 | 0.009 / 0.03 |
| skirtShort | 0.008 | 0.035 | 0.012 / 0.035 |
| skirtKnee | 0.008 | 0.035 | 0.012 / 0.035 |

- The flare keeps the legacy coefficients, so the silhouette change against main comes from ease, the torus and the push-out alone. All values are estimates, marked calibratable, in `src/config/balance.ts` (`VILLAGER_ASSET.drivenGarments`), read by the pipeline config like `bodySplit`.
- The child values are calibrated in the child picture rows (section 5); no claim about the child is made from the coefficients.
- Because flare and ease are per form and no two driven forms are co-worn (E5), a later rank split cannot change a garment's shape.

**Runtime clearance increment (B12, E1).** The pipeline bakes the panel with clearbase.

- At assembly, the worn set gives clearworn(row): the highest offset among the worn shells other than F's own band whose region intersects the height span [row, junction], plus one step.
- Each vertex of row ≥ 1 is moved along its row's rest radial direction by Δ(row) = max(0, clearworn(row) − clearbase), ramped linearly from 0 at row 1 to full at the first row whose span meets that shell's region. The displacement happens before the bake.
- Row 0 is never displaced; it stays the authoritative attachment.
- The same increment enters C in section 3.6.
- Example: loinFlap over the waist beads gives Δ = 12 + 3 − 6 = 9 mm over the beads' rows.
- The runtime and the mirror read the same worn set. A Vitest asserts Δ with and without the beads.

### 3.10 Partial panels: grid, rows and widths (B8, B10, check-3 B19)

**Angular grid.** The grid is independent of the twelve columns. It is the junction loop's vertex angles: about 60 at the girdle after revision 10's subdivision, and the builder asserts at least 36. Panel boundaries are snapped to loop vertices (section 3.3). A grid vertex between columns at angles a0 < a < a1 is weighted to those two columns by angular interpolation.

**Rows (B8).**

- Each panel has its own active row range, running from the junction to exactly its own hem, with rows at most 0.03 H apart on the basis body.
- No panel carries a row below its hem. The knee is a rig anchor (the `col.L` pivots), not a row, for every panel whose hem lies above it.
- The knee blend of section 3.3 exists only on panels that reach the knee pivot row: skirtKnee, the apron and girdleTails' back panel.
- girdleTails' front and back are separate panels with their own row counts.
- Faces exist only between consecutive rows of one panel.

**Widths (B10 adopted).** The rendered legacy widths are preserved, not the unsampled keep thresholds. The legacy 24-sample grid renders these edges:

| Form | front panel | back panel | front hem | back hem |
| --- | --- | --- | --- | --- |
| loinFlap | ±π/12 | π − π/6 … π | hip − 0.10 H | hip − 0.10 H |
| girdleTails | ±π/12 | π − π/6 … π | hip − 0.14 H | knee + 0.05 H |
| apron | ±π/6 | π − π/4 … π | knee + 0.02 H | knee + 0.02 H |
| skirtShort | closed ring | — | (hip + knee) / 2 | same |
| skirtKnee | closed ring | — | knee − 0.015 H | same |

The implementing session first measures the rendered legacy edge angles from main's built meshes and enters them in this table if they differ. Snapping to loop vertices changes each edge by at most half a loop edge. Any width change against main is named in the picture record of its row and judged there. The loinFlap front at ±π/12 spans one grid column on each side of the front, at least four loop edges after revision 10, and the builder asserts at least four quads across.

### 3.11 Routing under legacy outer garments (B20, B21, B22, check-3 B7)

**Scope.** The generated combinations with a legacy outer garment reaching below the girdle (revision 9 section 4) are:

- skirtShort under a robe;
- loinFlap under a robe;
- skirtKnee under the both-shoulders cloak;
- girdleTails under the both-shoulders cloak.

Wraps do not co-occur with the five.

**Base.** The driver always drives. The legacy outer hem follows its blurred `skirt_weights`.

**Steps, per combination, each followed by the picture rows of section 5 for that combination (walk, run, kneel transitions and hold, dig, blends, moving sequences):**

1. **Measure.** The garment-against-garment row (section 3.14) measures the driven panel against the outer cloth.
2. **Outfit-specific outer ease (B21).** Scope chosen explicitly: outfit-specific, at assembly, not in the builders.
   - The legacy outer layer's vertices below the girdle line get a radial displacement along their normal of `VILLAGER_ASSET.drivenGarments.outerEase[outer]` × `person.frame.scale`. It is applied on a clone after `layerOf`, the way `applyGarmentMask` is applied, and only when a driven form is worn.
   - Builders, cover masks and the per-layer cache are unchanged, so outfits without a driven form, and every outfit outside these five forms, keep their legacy geometry exactly. The cover masks need no regeneration.
   - The mirror applies the same displacement. The cache key covers the value (section 3.1).
   - At most two steps of one rank step each.
   - All four combinations are re-shot after every change, plus the same outer garments worn without a driven form, as a no-change control.
3. **Terminal step, robe (closed below the girdle): omission (B22 adopted).** The inner form is not drawn for that outfit. The omission is accepted only after the robe rows show, in walk, run, kneel, dig, from below the hem with the low camera and through the robe's front slit, that nothing missing reads. Skin seen through the slit is accepted as what a wearer shows.
   - It is applied consistently through one function `effectiveWorn(outfit)` used by the runtime assembly, the band and shell cuts, the driver, the mirror and the penetration selection.
   - The table of omitted combinations is recorded with its pictures and ends when the robe migrates in stage 4.
4. **Terminal step, both-shoulders cloak (open, B20): joint migration of the cloak's hanging panel.** For outfits wearing the cloak together with a driven form, the cloak's vertices below the girdle line move onto the same columns:
   - **Weights.** Rows within 0.03 H below the girdle fade from the legacy weights to the two nearest columns' weights, with the four-influence rule of section 3.3. Below that they carry column weights only.
   - **Radius.** The cloak's rest radius at every row is at least the inner panel's radius plus one step.
   - **Driver.** Both garments share the columns' rotations, so the outer stays outside up to the tilt difference of neighbouring columns. The final triangle check of section 3.6 includes the cloak's skinned triangles against the inner panel. A crossing is repaired by raising the cloak's row radius by one step in the pipeline.
   - **Validation.** Against both legs (capsules) and against the inner panel, in all cloak rows of section 5.
   - **Variant.** The reweighted cloak is a second mesh variant (`g-cloak-bothShoulders` with suffix `.driven`), used only in those outfits, so the cloak elsewhere stays legacy until stage 5.
   - This moves part of point 1400 into 1398 for these outfits; see section 9, escalation X1.

### 3.12 Waist bands, mesh identity and seams (B1, rim rule of revision 9)

**Mesh identity (B1).** Separate physical mesh names, mapped to one logical garment:

- **Panels.** The panel keeps the legacy name `g-<form>-waist` and becomes `part: 'driven'` in `garments['meshes']`.
- **Bands.** The band is a shell entry under `g-<form>-waist.band`, with `part: 'shell'` and its own bit.
- **Logical record.** `garments['meta'][name]` gains `kind: 'driven'` and `band: '<band name>'`. `extras.villager.driven[form]` gives `panel`, `band`, `heads`, `anchors`, `rows`, `intervals` and the per-form values.
- **Readers.**
  - `cloth_names` excludes `driven` parts.
  - `shell_names` includes the bands.
  - A new `driven_names` lists the panels.
  - mask.py gives panels and bands an empty mask entry. Both carry no `_COVER`.
  - `MK.check` skips both. sheets.py draws both. penetration.py routes them (section 3.14).
  - export.py writes panels through `add_skinned_mesh` and bands as recipes.
- **Runtime.**
  - `villagerAsset.ts` reads `extras.villager.driven`.
  - `isShellLayer` stays false for a driven layer.
  - `gltfFigureGeometry` expands a driven layer into its band (added to the worn shell set) and its panel (through `layerOf`).
  - `garmentMeshName(l)` keeps returning the panel name, so outfits, appearance data and the dress lineup are unchanged.
- **Budgets.** The five leave the cover order, which shrinks. The shell bits grow from 4 to 9, within the 32-bit `_region` word. A selftest asserts both budgets.

**Bands.** New shells in `shells.py`, each with its region by height and `arm` ≤ 0.2:

| Shell | Rank | Region |
| --- | --- | --- |
| g-loinFlap-waist.band | 1 | [girdle − 0.008 H, girdle] |
| g-girdleTails-waist.band | 1 | [girdle − 0.008 H, girdle] |
| g-apron-waist.band | 4 | [girdle − 0.008 H, girdle] |
| g-skirtShort-waist.band | 4 | [girdle − 0.02 H, girdle] |
| g-skirtKnee-waist.band | 4 | [girdle − 0.02 H, girdle] |

**Seams.**

- No band region meets the waist beads: the beads' top is at hip + 0.027 H, the lowest band row at hip + 0.04 H. So no seam row is shared, and the panels pass over the beads by the clearance of section 3.9.
- Against the trousers (forced outfits only) revision 9's rim rule applies unchanged:
  - a rank-4 band over the trousers emits one strip, 15 mm → 9 mm;
  - a rank-1 band inside the trousers' region is cut by the trousers and emits nothing, while its attachment row stays valid (section 3.3).
- The band's own bottom rim against skin lies under the panel's row 0.
- The body under a panel is neither cut nor hidden, so legs and inner thighs stay drawn through the openings and under the hem.

### 3.13 Pipeline builder and migration

- **New `scripts/villager/driven.py`.** It builds:
  - the frozen topology (section 3.8);
  - the rows and grid (section 3.10);
  - the radius (section 3.9);
  - the weights (section 3.3);
  - the uv (angle × row fraction, as the legacy sweeps);
  - the corner solve;
  - the per-form heads and anchors.

  It also holds the selftests of section 5. `build_garments` calls it for the five. Their meshes skip `finish`, `push_out`, weight transfer, `unskin`, `surface_map` and `skirt_weights`.
- **`garments.py`.**
  - The `build_form` branches for loinFlap, apron, girdleTails, skirtShort and skirtKnee are removed, and the five leave `SKIRTS`. `GARMENTS` keeps every entry, so the build order is unchanged.
  - The shared `if` for skirtShort, skirtKnee and wrapLong is narrowed to wrapLong.
  - `girdle()` stays (its other caller is at line 673).
  - `skirt_weights`, `column_sweep` and `SKIRTS` stay for wrapLong, shirt, robe, toga and cloak (stages 4 and 5).
- **Cloak variant.** The `.driven` cloak variant of section 3.11 step 4 is built only if that step is reached.
- **Cover masks.** The masks of the remaining legacy garments are recomputed (mask.py) because five garments leave the cover order. villagerGarmentMask.test.ts runs against the regenerated check json.

### 3.14 penetration.py rows (no gate)

- **Driven against the body.**
  - The existing columns (cloth, shown, …) are measured for the five on the driven pose.
  - The Python driver mirror in `gamepath.py` replays each EXPORT_CLIPS clip statefully at fixed dt from the reset state, at every corner after the hang, then the existing measurement runs.
  - The legacy baseline rows of the five report `migrated`.
- **Garment against garment.** Each driven panel against two kinds of neighbour, per frame:
  - (a) every worn shell under it (waist beads; trousers in forced outfits): the depth of shell points outside the panel. Named response: clearworn is wrong; fix it in the builder and add a selftest.
  - (b) every co-worn legacy outer garment over it, with the outfit-specific ease of section 3.11 applied: the depth of panel points outside the outer cloth. Named response: section 3.11.
- **Ground.** Per frame, the lowest panel point below y = 0 in the figure frame, with form, clip, frame, corner and the σ used. Named response: judge it in the low-camera kneel and dig picture; never an offset change.
- **Shell row two repaired (E4).** The geodesic exclusion of 3 × offset. Re-run for the stage-1 shells and the new bands.
- **Arms.** The `shoulders` pseudo-clip (`with_shoulders`), carry, carryIdle and dig stay in the measurement for all five. Each hand or forearm contact with a panel is reported with frame and bone, and section 3.16 answers it.
- **Round trip.** villagerRuntimePose.test.tsx exports, per test outfit and fixed-dt sequence, the worn list, the 24 column local transforms (rotation, translation, scale) and the sampled panel rows. gamepath.py's stateful mirror recomputes them within 1e-4. The DEV counters of sections 3.4 and 3.6 are compared with the mirror's report.

### 3.15 Sagittal fallback (B19 adopted)

The radial-only solve is the prototype. If the walk or run moving sequences of any form show the panel flaring sideways where cloth would swing forward or back, the fallback is implemented within point 1398, before the stage closes:

- **Variables.** A second angle ψ per segment, a rotation about the axis tangential to the ring at that column, ψ ∈ [−45°, 45°].
- **Solve.** Coordinate descent: a θ search with ψ fixed, then a ψ search with θ fixed, two rounds, each search the 13-candidate scheme of section 3.4 under the same constraints, continuity state and final evaluation. That is four one-dimensional searches per segment, about four times the radial cost, not two.
- **Cost check.** Measured in the closing perf suites before the fallback is accepted.
- **Mirror.** The same rules.

### 3.16 Arm contact (B24)

All five panels change the surfaces an arm can meet. The arm rows of section 5 cover each form in idle with the shoulder pose, carry, carryIdle and dig.

If a hand or forearm visibly sinks into a panel in any of them, the response is completed within point 1398 before acceptance:

- forearm and hand capsules join the driver's obstacle set for the segments within reach;
- their containment, margins and mirror follow section 3.5;
- the affected rows are re-shot as moving sequences on both backends.

It is not filed as a follow-up.

## 4. Carried items from point 1347 and the answer to each

1. **The child's hip cloth standing off all round** (local/WindelLook.zip). The archive is not in this tree, so the situation is reconstructed from the user's description: a child in a loin flap, standing and walking.
   - Cause: the legacy torus 0.008 H thick at the girdle, the 0.009 H tube ease and the 7 mm push-out, all relatively larger on the child's small hull.
   - Answer: the band is a shell at 6 mm × scale on the skin, the panels start on its outer row, the ease falls to 0.004 H, and the push-out goes. The flare keeps the legacy scaling with hips height (section 3.9).
   - Open sides between the panels avoid a ring.
   - Whether the result reads right is judged in the WindelLook rows, and the ease is calibrated there (section 5). No claim is made from the coefficients.
2. **The legacy loin-flap girdle reading as a torus off the waist** (1347 frames waistbeads-under-loinflap and collars-skin). The torus is gone: `girdle()` is no longer called for these forms, and the band follows the skin like the waist beads, which were accepted in stage 1.
3. **The `shoulders` clip making these garments deeper than main's idle** (skirtShort 0.0214 vs 0.0036, charged from point 1354). The driven rows replace the legacy rows. Arm contact is answered for all five forms within this point (section 3.16).
4. **Pale blue-grey (WebGPU) / dark (WebGL 2) patches at the skirt hem where the leg passes** (point 1380). The frames are verification/1380-figure-micro-walk-a and -b with their -webgl2 pairs; the named `…-walk-pair*` files do not exist, and these are the nearest.
   - Cause: the leg passing through the hem, so the panel's inside is seen lit with the outside normal.
   - Answer: the driver keeps the leg inside the panel (sections 3.4 to 3.7).
   - The panel's inside, still visible from below and through the openings, is checked with the debug unlit material and back-face colouring on both backends.
   - If an inner face reads wrong, the named response is the figure material's face-direction normal flip in TSL, verified on both backends.
   - The 1380 frames are re-shot from the same framing.

## 5. Verification

### Pipeline selftests (driven.py, shells.py, penetration.py, cachekeys)

- Frozen topology: identical vertex and face counts and identical source identities at every corner.
- Row 0 from the recipe function equals the band's offset row within 1e-6 where the band is drawn, and exists where the band is cut.
- Weight rows: four influences at most, sum 1; rows 1 to 3 as specified; no body weight below row 3; the knee blend only on the panels that reach it.
- Rows end exactly at each panel's hem; no row below it.
- Widths equal the table of section 3.10 within half a loop edge; the loinFlap front has at least four quads.
- Hem rows at the formula heights at every corner.
- The additive-delta check against direct rebuilds (reported).
- Mesh-identity and budget assertions (cover order and 9 shell bits).
- The rim rule on the band–trousers pairs.
- Row two on a toy two-slab case with the geodesic exclusion.
- The mirror's solve on toy capsules: determinism, the rate limit, the reset, the bounded repair and the ground fallback with σ.
- Cache-key invalidation for each new input (B26).

### Vitest

- No clip layer writes a column bone.
- The driver's composed matrices equal `updateMatrixWorld`.
- Per-form rest: zero tilt reproduces the built panel for all five forms (adult and child).
- Runtime pivots equal the hung landmarks.
- Anchors lie on the drawn band chord in sampled poses.
- The four-influence reduction stays within 1 mm.
- Driver:
  - determinism under replay;
  - θ within [0, θmax];
  - the neighbour limit;
  - final-evaluation completeness;
  - the bounded repair;
  - the ground fallback;
  - continuity (|Δθ| per frame within the rate limit except when only a larger step is feasible).
- Containment on the rendered surface over the pose and morph domain (section 3.5).
- clearworn with and without the beads.
- `effectiveWorn` applied consistently.
- No co-worn driven pair (E5).
- villagerFigureBody.test.ts accepts panel and band for each generated pair.
- Shell identity for the new bands.
- The stateful round trip with the mirror.
- villagerGarmentMask.test.ts against the regenerated json.
- villagerPenetrationReport.test.ts with the new rows.

### Picture acceptance

Run through `polish-villagers --section=garment-acceptance`: forced outfits at 3 m and 7 m, in hausa-village and cairo, on WebGPU and WebGL 2, as new rows beside the stage-1 rows. Every row gets stills, and the rows marked "moving" also get a moving sequence: 16 consecutive frames at 30 fps over one stride or one transition, captured as a strip and judged for snapping, popping and hem jumps (B18).

- **Per form** (loinFlap, girdleTails, apron, skirtShort, skirtKnee):
  - walk at the stride and at both leg crossings, side-on and front three-quarter (moving);
  - run, side-on (moving);
  - kneel down, hold and up, side-on and front, with one low camera at 1 m height (moving for down and up);
  - dig at mid-stroke, side-on and rear three-quarter (moving);
  - the walk↔jog blend at 0.5 (moving).
  - Figures: adult woman, adult man where the form is generated for men, and a child for loinFlap and skirtShort.
- **WindelLook re-shot:** a girl and a boy child in a loin flap, idle and walk, front three-quarter and side, village, 3 m (moving for walk).
- **Over the beads:** loin flap and apron over the waist beads, walk, side-on (moving).
- **Under outer garments (B23):** skirtShort and loinFlap under a robe, skirtKnee and girdleTails under the both-shoulders cloak, each in:
  - walk, run, kneel down, hold and up, dig, and the walk↔jog blend;
  - front three-quarter and side, plus the low camera for kneel and dig;
  - moving sequences for walk, run, kneel down and up, and dig;
  - re-shot after every routing step of section 3.11;
  - the robe and the cloak each worn without a driven form, as a no-change control.
- **Arms (B24):** for every form, idle with the shoulder pose, carry, carryIdle and dig, front three-quarter, judged at the hands and forearms (moving for carry and dig).
- **1380 framing:** skirtKnee walk from the 1380 micro-walk framing, both backends.
- **Trousers:** the inner-thigh frames re-judged with the repaired row two (E4).
- **Performance responses:** after any change of section 3.4 or 3.15, the moving sequences of all five forms on both backends again (B25).

Judged for:

- a hem standing off the body;
- a leg or arm passing through the cloth;
- an under-garment or back face showing through;
- the band reading as a torus;
- a crease at a panel corner;
- a hem sunk in the ground;
- a hem snapping between frames;
- flicker at a band seam;
- dark or pale patches at the hem.

A surviving patch or flicker is traced to its mesh with the debug unlit material on both backends before it is classified.

The final state of point 1398 is met when every row reads dressed on both backends, still and moving, and the legacy builders for the five are gone.

## 6. Risks to the game picture

- **R1 Side flare instead of forward swing.** Answered by the sagittal fallback within the point (section 3.15).
- **R2 Front-corner creases.** Neighbouring columns at very different tilts crease a partial panel's corner. Named response: sixteen columns.
- **R3 Crowd cost.** The candidate search plus the skinned-triangle check run on the CPU. Measured in the closing perf suites; responses and their re-validation in section 3.4.
- **R4 Junction pop.** Ruled out by computing row 0 from the recipe function and by the anchors on the drawn chord; asserted in Vitest.
- **R5 46 bones.** The bone texture and uniform paths grow from 22 to 46 bones. Checked on both backends in sub-step 1, where nothing else changes.
- **R6 Kneel family.** Revision 10's split regression is reported, not gated, for the kneel clips (7.0–8.1 mm). The new band rows add cut vertices there. Judged in the kneel pictures.
- **R7 Outer garments.** The robe combinations may end in omission and the cloak combinations in joint migration (section 3.11). Both are recorded with their pictures.
- **R8 Bunched hem on the ground.** The ground fallback compresses rows. Accepted if it reads as cloth resting on the ground at 3 m; otherwise the floor of σ = 0.3 is revisited.
- **R9 Bone scale.** Axial scale on a skinned bone shears nothing as long as the scale is along the bone axis, but a scaled `col.U` also scales its child's position. The driver therefore writes `col.L.k` after compensating its parent's scale, and the Vitest checks the skinned rows at σ < 1.

## 7. Landable sub-steps

Each sub-step is a commit series on `feat/1398-…`. It lands only with the cheap gate (tsc, lint, build, test:unit, the covering suite) and, where the picture moves, the both-backend picture of its rows, still and moving. The owner may split the later sub-steps into their own points under the standing split rule.

1. **Column bones** (sections 3.1, 3.2): skeleton, body, clips, export, asset, clip-layer exclusion, per-form rest contract, runtime pivots with DEV assertion, cache keys, pipeline rebuild. Picture: unchanged idle, walk and dig against main on both backends (R5).
2. **Driver** (sections 3.4 to 3.7): TypeScript driver with frames, state and final evaluation; the Python mirror; capsules and containment Vitest; round trip with no driven garment worn (columns posed, unweighted). No picture change.
3. **Driven builder with loinFlap and girdleTails** (sections 3.3, 3.8 to 3.10, 3.12, 3.13 for two forms): mesh identity, bands, panels, junction, clearance, removal of their legacy branch. Pictures: their rows, WindelLook, the loin flap over the beads, the arm rows.
4. **Apron.** Pictures: its rows, the apron over the beads, the arm rows.
5. **skirtShort and skirtKnee.** Pictures: their rows, the 1380 framing, the arm rows.
6. **Routing** (section 3.11): the outer-garment combinations, outfit-specific ease, then omission (robe) or joint migration (cloak) where reached.
7. **penetration.py rows** (section 3.14) with the repaired row two; reports refreshed; the sagittal fallback (3.15) and arm capsules (3.16) if their pictures required them; the final picture pass over all stage-3 rows on both backends; the review record.

## 8. Open questions for the break check

- Q1: Is the per-figure continuity state (section 3.4) with reset rules acceptable as the driver's only state, given that the rest of the pose pipeline keeps comparable per-figure gait state (`ClipGait`)?
- Q2: Is σ (axial bone scale) an acceptable way to lay a hem on the ground on both backends, or should the fallback instead fold the lower segment upward about its knee pivot?

## 9. Answers to check 1 (docs/four-eyes/1398-plan-check-1-sol.md)

| Id | Kind | Answer | Section |
| --- | --- | --- | --- |
| B1 | BLOCKING | Separate physical names: the panel keeps `g-<form>-waist` as a `driven` part, the band is the shell `…​.band`, one logical record; every reader named; cover order shrinks, 9 of 32 shell bits | 3.12 |
| B2 | BLOCKING | Figure-frame matrices composed from bone transforms, not `matrixWorld`; one frame for capsules, anchors and ground; solved transforms converted to parent-local; Vitest against `updateMatrixWorld` | 3.4 |
| B3 | BLOCKING | Per-figure, per-form rest heads (one driven form per figure); panel built against them; zero tilt reproduces the panel for all five forms | 3.2 |
| B4 | BLOCKING | Boundaries snapped to loop vertices, so row 0 has no inserted vertex; anchors as frozen (edge, t), skinned as the interpolation of the two skinned endpoints on the drawn chord | 3.3, 3.10 |
| B5 | BLOCKING | Row 0 from the shell recipe's vertex function, independent of band cuts and legacy hiding; equality asserted where the band is drawn | 3.3 |
| B6 | BLOCKING | Explicit four-influence rows: top-two body bones plus two columns in rows 1 to 3, validated within 1 mm; U/L split at the knee blend | 3.3 |
| B7 | BLOCKING | Topology frozen on the basis body (identities, boundaries, membership, row counts, anchors, triangulation); corners evaluate positions only | 3.8 |
| B8 | BLOCKING | Per-panel active row ranges ending at each hem; knee only as rig anchor; knee blend only where a panel reaches it | 3.10 |
| B9 | ADVISORY | Adopted: deltas from revision 10's square ten-corner solve; additive result checked against direct rebuilds at the builds the game uses; exact (hem heights) and approximate (hull) parts distinguished | 3.8 |
| B10 | ADVISORY | Adopted: rendered legacy widths kept (±π/12 for the loinFlap front, etc.), measured from main's meshes before building; changes named per row | 3.10 |
| B11 | BLOCKING | The legacy flare law kept (hips height, s², fore-aft reduction); legacy flare coefficients kept; child calibration in pictures; the old Q3 withdrawn | 3.9, 4 |
| B12 | BLOCKING | Body-only capsules; one cloth clearance; own band excluded; runtime increment relative to the baked clearbase; row 0 never displaced | 3.5, 3.9 |
| B13 | BLOCKING | Containment on all vertices plus a ≤ 1 cm barycentric grid, over runtime blends, transitions, and the builds per sex and age; toe capsules; margins in balance config, exported, read by runtime and mirror | 3.5 |
| B14 | BLOCKING | No clamped pelvis capsule: no inward tilt plus the hips-rigid rest hull; thigh capsules cover the crease (verified); only band and row 0 exempt; repair directly below | 3.5 |
| B15 | BLOCKING | No feasibility assumed for either segment; ground fallback by axial scale σ that changes the rendered rows into a bunched grounded hem, then re-checks contacts; pictures judge, no numeric gate | 3.7 |
| B16 | BLOCKING | Final evaluation of every constraint after the passes; bounded three-round repair within θmax and the neighbour limit; no unconditional increment | 3.4 |
| B17 | BLOCKING | Exact checks on all skinned panel triangles incl. rows 1 to 3 and the knee blend; repair, then an ordered response for visually rejected residuals | 3.6 |
| B18 | BLOCKING | Per-figure continuity state with rate limit and relaxation, deterministic reset and replay rules, a stateful mirror; moving-sequence acceptance on both backends | 3.4, 5 |
| B19 | ADVISORY | Adopted: sagittal fallback specified (coordinate descent, four 1-D searches, cost measured) and implemented within the point if motion pictures reject radial-only | 3.15 |
| B20 | BLOCKING | Terminal step for the open cloak: joint migration of its hanging panel onto the shared columns for those outfits, validated against legs and the inner panel; R7 corrected. Scope escalated as X1 below | 3.11 |
| B21 | BLOCKING | Ease scope chosen: outfit-specific at assembly, builders and masks untouched, mirror and cache covered; all affected combinations plus no-change controls re-shot | 3.11 |
| B22 | ADVISORY | Adopted: omission only after coverage is confirmed in motion, below the hem and through the slit; applied through one `effectiveWorn` everywhere | 3.11 |
| B23 | BLOCKING | Robe and cloak combinations in walk, run, kneel transitions and hold, dig, blends, moving sequences, low camera, after every routing step | 5 |
| B24 | BLOCKING | Arm rows for all five forms (shoulder idle, carry, carryIdle, dig); arm capsules completed within the point, not filed | 3.16, 5 |
| B25 | ADVISORY | Adopted: motion acceptance re-run after any solver change; skipping uses the view and shadow frusta; a re-entering figure is solved before it draws | 3.4, 5 |
| B26 | ADVISORY | Adopted: driven.py, the band table, the calibration values, column count and capsule margins in the asset keys, with an invalidation test | 3.1 |

**Escalation X1 (scope, not a code contradiction).** B20's terminal step for the both-shoulders cloak moves part of point 1400 (stage 5: cloaks on the columns) into point 1398, but only as a `.driven` variant for the outfits that wear the cloak with a driven form. It is reached only if two outfit-specific ease steps fail in the picture. The alternative is to leave those two combinations at main's state until point 1400, which contradicts the point's final state ("every generated outfit with a skirt … looks dressed"). This needs an owner or user decision before sub-step 6. Recommendation: allow the variant.

No finding contradicts the current code in a way this revision cannot resolve. Two findings rest on code facts that were checked:

- B1: one `meshes` entry per name; `cloth_names` builds the cover order.
- B11: the `tube` flare law at garments.py lines 450–453.
