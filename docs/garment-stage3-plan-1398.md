# Villager garments stage 3 — plan against the current code (point 1398, revision 5)

Stage plan for skirtShort, skirtKnee, loinFlap, apron and girdleTails on driven column bones. Revision 2 answered GPT-6.1 Sol's check 1 (docs/four-eyes/1398-plan-check-1-sol.md, B1 to B26); section 9 maps every finding to the section that answers it. Revision 3 answers check 2 (docs/four-eyes/1398-plan-check-2-sol.md): the seven findings still open there (B8, B12, B14, B15, B17, B18, B19) and the new C1 to C6. Section 10 maps them. Revision 4 answers check 3 (docs/four-eyes/1398-plan-check-3-sol.md): B14, B17, B19/C3 and the new N1; section 11 maps them. Revision 5 answers check 4 (docs/four-eyes/1398-plan-check-4-sol.md): B14 and the new N2, also in section 11. Where revision 3, 4 or 5 changes a mechanism, the section text below is the current one, and section 9's rows for those ids point to it. Written against `main` at 84a3665a0, merged up to the current `origin/main`; nothing under `scripts/villager` or the garment runtime changed in between.

Owner decision on sections 3.5/3.6 (03.11.2026, point 1482; full text local/1482-decision-3.5.md): (1, refined 13:56 as 1′) below the pelvis profile bottom (crotch − 0.02 H, posed hips-frame height) every capsule constrains a panel point, at or above it the profile and only the knee halves of the thigh capsules, the capsule radius rule unchanged; (2, refined as 2′) at or above the profile bottom the containment test holds pelvis-band and hip-half thigh samples in the profile alone, every other leg sample in the union; (3) a panel triangle with two exempt vertices skips the centroid's profile test. Sections 3.5 and 3.6 state the rules.

Owner decision on X1 (02.11.2026): the `.driven` cloak variant is allowed inside point 1398 as the terminal fallback step of section 3.11.

Owner decision on the two sub-step-1 gaps the cloud author reported (02.11.2026): (G1) sub-step 1 delivers only the reference-head fallback of section 3.1 and the knee and ankle runtime pivots from the hung `shin` and `foot` heights with their DEV assertion; the per-form rest contract of section 3.2 (heads from F's column anchors, `extras.villager.driven[F].heads`, the 1e-4 rest-equality Vitest and the anchor-against-junction assertion) lands in sub-step 3, where anchors (3.3) and driven heads (3.8) first exist. (G2) A figure without a driven form F keeps the upper runtime pivots at the reference heads (girdle iso-line, offset zero, parented to `hips`); only the knee and ankle pivots are recomputed after `hungHeads`.

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

The segment between two pivots is the column's bone, not a station line: the stations of section 3.4 lie on the cloth (owner decision 03.11.2026 22:19).

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
  - Knee blend: one row band centred on the knee pivot row, existing only on a panel whose hem lies below the knee pivot. With today's hems that is skirtKnee alone (hem knee − 0.015 H). The apron (knee + 0.02 H) and girdleTails' back (knee + 0.05 H) end above the pivot and carry no `col.L` weight (B8). In the band, the vertex's two columns are split between `col.U` and `col.L` by the row's position in the band. That is four influences (U.a, U.b, L.a, L.b).
  - Below the knee blend: `col.L` of the two columns only.
  - For every panel, the builder decides from the frozen basis heights whether its hem lies below the knee pivot. It asserts that no other panel carries `col.L` weight and that the knee band starts at least four rows below the junction.
  - Panels without a knee blend leave their `col.L` bones unweighted. The driver still solves those bones (their rows are empty), so the lower solve has nothing to do for those forms.
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

**Variables.** Each segment has an outward tilt angle θ in its column's radial plane about the hips frame: a rotation about the column's tangential axis tk = rk × up (section 3.15), so that a positive θ moves a hanging segment outward. θ ∈ [0, θmax], θmax = 80°, extended to θground = 110° only by the ground fallback (section 3.7). There is no bone scale anywhere in the driver: column bones carry rotation and, for `col.U`, translation, never scale (C4, C5). The upper segments are solved first, then the lower ones; a lower segment hangs from its solved knee point.

**Candidate search per segment.**

1. Candidates: the continuous relaxed angle θrel (below) first; then θ at 10° steps over [0, θmax] (9 values); then two refinements about the best sampled one at ±5° and ±2.5°.
2. Each candidate is evaluated against all constraints together:
   - the clearance target per capsule at the segment's three stations (section 3.6);
   - the pelvis profile at the same stations (section 3.5).
   - **Stations on the cloth (owner decision 03.11.2026 22:19).** A station is the column's own skinned panel point under the trial angle: per panel row, the point of the row's edge that crosses the column's rest angle about the hips axis (two vertices, interpolated by angle). The upper segment owns the rows without `col.L` weight, the lower the rows with it; the stations are the owned rows, counted from row 0, at the fractions 1/3, 2/3 and 1 (nearest row). Each is skinned with its vertices' four weights, the column bones at the trial angles. A column that no panel crosses has no stations; its segment is held by the triangle check alone, and a neighbour without stations adds no chord. A rig without a worn form (tests, the containment obstacles) keeps points on the bone line. The Python mirror computes the same stations.
   - the ground at every row the segment carries (section 3.7);
   - the chord target to both neighbours' current solutions;
   - the neighbour tilt difference ≤ 60°;
   - θ ≤ θmax, or θ ≤ θground while the ground fallback holds that segment (section 3.7, N1).
   - During repair rounds, also the skinned triangles the segment carries (section 3.6, B17).
3. Choice with continuity (B18, C2). The state per segment is a continuous angle θs (a real number, not a sample index).
   - **Relaxed angle.** Each frame: θrel = θg + (θs − θg) · exp(−dt / τ), where θg is the gravity target (0 for the upper segment, revision 2's gravity blend for the lower) and τ = 0.25 s.
   - **θrel feasible.** It is chosen exactly. Relaxation is therefore continuous and never sticks to a sample; at 120 fps a free 30° hem relaxes by 30 · (1 − e^(−1/30)) ≈ 1° per frame, all the way to θg.
   - **θrel infeasible.** The nearest feasible sample on the side away from the collision is found. The feasibility boundary between it and θrel is then located by bisection to 0.25°, and the boundary angle is chosen. The hem rests against the obstacle continuously instead of jumping between 2.5° samples.
   - **Rate limit.** The change |θ − θs| is limited to ωmax · dt, with ωmax = 400°/s, unless only a larger step is feasible. The chosen θ becomes the new θs.
   - **No feasible candidate.** The one with the smallest worst violation is chosen.
   - **Frame-rate test.** A Vitest drives the same pose sequence at 30, 60, 120 and 144 fps. A released hem must reach θg within 0.5° inside 1.5 s at every rate, and the trajectories must agree within 1° at matching times.

**Final evaluation and bounded repair (B16).** After the two passes (the second with the neighbours' final angles), every constraint of every segment is evaluated once more on the final angles:

- capsules at stations;
- the skinned-triangle check of section 3.6;
- ground;
- chords;
- the neighbour limit;
- θmax, or θground for a segment the ground fallback holds (N1).

Repair rounds (B17):

1. Every segment with a violation is re-searched with its neighbours fixed. Its candidates now also score the skinned triangles the segment carries, so the triggering triangle hit rejects the candidate that produced it (section 3.6).
2. If a round would choose the same angle again for a segment whose triangles still hit, the two columns owning the worst hit are searched jointly instead. Each angle takes the 9 coarse samples, giving 81 pairs, scored on the triangles of both columns plus all constraints of both segments.
3. A changed upper segment re-solves its lower segment.

This repeats at most three rounds. Every candidate respects θmax (θground under the ground fallback) and the neighbour limit by construction, and no unconditional increment exists. Where the ground is the violated constraint after the third round, the ground fallback applies (section 3.7). Anything else is counted in a DEV counter and in the mirror's report row.

**State and determinism (B18).**

- The per-figure state is the continuous θs of each of the 24 segments (and ψs under the fallback of section 3.15).
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

**Revision line.** 04.11.2026 (owner decision, point 1485; current): (1) profile margin 0, its band inert; (2) the profile's sample input includes the thigh vertices below the profile bottom, and a sample posed below the bottom in the hips frame is dropped, not clamped into the bottom bin, so the profile follows a lifted thigh and is unchanged at rest; (3) each thigh capsule tapers per height: slab capsules of `driver.thighSlab` × H along the bone, each with the radius of the vertices projecting into it (an empty slab adds none), the thigh margin unchanged at 0.0241; (4) the pelvis samples are thinned per profile cell (column × bin, bins continued below the bottom for the thigh input): each cell keeps its widest rest vertex, the remainder fills `pelvisSamples` by farthest-point selection. 03.11.2026 (point 1482), standing where 04.11. does not differ: 23:20 (section 3.5.y resolved): (1) thigh capsule margin 0.0241, asset rebuilt; (2) the profile margin applies only in a band `driver.profileMarginBand` × H above the profile bottom, 0 above it; (3) panel row 1 is exempt from the profile test like row 0 and the band. 22:19 (section 3.5.x resolved), standing where 23:20 does not differ: (1) stations on the cloth (section 3.4); (2) the thigh capsule radius from drawn vertices below the profile bottom only; (3) variant U: a capsule constrains a point below the profile bottom in its bone's rest frame OR in the posed hips frame, the remaining misses taking a capsule and a profile margin raise; (4) shin, foot and toe use the same test. Earlier lines, superseded where 22:19 differs: 12:15: (1) a thigh capsule constrains a panel point only where its posed hips-frame height lies below the pelvis profile bottom (crotch − 0.02 H); above it the profile governs; the capsule radius rule is unchanged. (2) Containment additionally asserts that rendered samples at or above the profile bottom lie in the profile alone; a red there stops and reports. (3) A panel triangle with two exempt (band/row-0) vertices skips the centroid check (section 3.6). Rules (1) and (2) and the 13:56 refinement (rules 1′ and 2′, a posed hips-frame split with a t ≥ 0.5 knee half) are superseded; rule (3) stands. 20:56: (1″) a thigh capsule constrains a panel point while that point lies below the profile bottom in the THIGH's REST frame; this replaces the posed hips-frame height test and the t ≥ 0.5 split. The shin, foot and toe capsules follow the same rule in their own bones' rest frames, which for points near them means always. The profile still constrains a point at or above its bottom in the posed hips frame. (2″) The containment test applies the same envelopes. Implemented in `src/render/villagerSkirtDriver.ts`, `scripts/villager/gamepath.py` and the containment test together.

**Body-only capsules (B12).** Eight capsules per person: both thighs, both shins, both feet, both toes. Each is the segment from the bone's head to its tail (the toe tip for toes). The radius covers the drawn body vertices with weight above 0.1 on the bone, measured to that segment (endpoints included), at rest after the hang, plus the bone's margin from `extras.villager.columns.capsules`. A thigh's radius counts only the drawn vertices below the profile bottom (rest height); above it the profile governs (owner decision 22:19). A thigh is a chain of slab capsules of `driver.thighSlab` × H along the bone, each with the radius of the vertices projecting into it, so the hem meets the hem's radius and not the buttock's (owner decision 04.11.2026); every slab carries the thigh margin. No cloth or shell thickness is added; cloth clearance enters once, in section 3.9.

**Pelvis as a skinned profile, not a capsule (B14).** There is no pelvis capsule and no assumption that the pelvis is hips-rigid.

- **Samples.** On the basis body the builder freezes a set of pelvis samples: every body vertex with `arm` ≤ 0.2 between the crotch − 0.02 H and the highest junction height, plus the thigh vertices (weight > 0.1) below the crotch − 0.02 H (owner decision 04.11.2026); thinned per profile cell, each cell keeping its widest rest vertex, the remainder filling `pelvisSamples` (240) by farthest-point selection.
- **Skinning.** Each frame the driver skins these samples on the CPU with their actual four weights, so spine, hips and thigh influence are all in.
- **Profile.** In the hips frame, each sample gives (height, angle, radius from the hips axis). The profile is a table of bins rebuilt every frame from the samples' POSED locations, so a sample always counts where it is drawn (check 4 N2):
  - **Bins.** Per column k, height bins 0.02 H tall from the crotch − 0.02 H up to the highest junction height. Each frame every skinned sample is assigned to the bin of its posed angle (column k's window, ± half the column spacing) and posed height. A sample above the top bin is assigned to the top bin of its column; a sample posed below the bottom is dropped (owner decision 04.11.2026: the thigh samples count only where a lifted thigh draws them).
  - **Value.** A bin's value is the largest posed radius among the samples assigned to it in that frame.
  - **Empty bins (check 3 B14, check 4 B14).** A bin no sample reached this frame takes the value of the nearest POPULATED bin, searched only among bins that received a sample this frame, so the rule cannot cycle: first the same column by height distance (the lower one on a tie); if the whole column is empty, the populated bins of every other column, ranked by angular distance and then by height distance, taking the larger value on a tie. The builder asserts at least 30 samples, so a populated bin always exists.
  - **Query.** Rp(k, y) interpolates linearly between the two bin centres around y and between neighbouring columns for points between columns. For y above the top bin's centre (a panel lifted by the 110° fallback, section 3.7) Rp(k, y) is the top bin's value; the band covers the body there, and the top bin is the widest point the panel can meet.
- **Below the crotch − 0.02 H.** The profile is not consulted; the thigh capsules carry the legs (below).
- **Division (owner decision 03.11.2026 22:19, variant U; the one rule).** The profile bottom (crotch − 0.02 H) divides the envelopes per envelope. The profile constrains a panel point whose POSED height in the hips frame lies at or above the bottom, its radius plus the profile margin (`VILLAGER_ASSET.drivenGarments.driver.profileMargin` × scale) where that height lies below the bottom plus the margin band (`driver.profileMarginBand` × H), and its radius alone above the band (owner decision 23:20: the measured miss sits at the bottom, the columns' flare came from the top bins). Each of the eight capsules constrains a panel point that lies below the bottom in the capsule bone's REST frame (inverse posed bone matrix, plus the bone's rest position) OR in the posed hips frame; a lifted thigh therefore keeps constraining its own mid-thigh, and the crotch blend, which one thigh forward and one back map above the bottom in both rest frames, stays held. A skinned triangle meets a capsule on its part below the bottom in the rest frame plus its part at or above it there that lies below it in the hips frame (both heights affine; a triangle lying wholly at the bottom in both meets no capsule).
- **Constraint.** A panel point at height y and angle a that lies at or above the profile bottom must have radius ≥ Rp(a, y) + C, with C the cloth clearance of section 3.9 at its row. The constraint enters:
  - the candidate scoring at the segment's stations (section 3.4);
  - the skinned-triangle check, on each triangle vertex and each triangle's centroid, except the centroid of a triangle with two exempt vertices (section 3.6);
  - the repair rounds.
- **Below the profile bottom.** The capsules carry the legs. The containment test below checks the rendered pelvis and leg surface against the same division.
- **Exemptions.** The band and row 0 are exempt, because they lie on the skin by construction. Row 1 is exempt from the profile test (owner decision 23:20: its hits were 0 to 9 mm in the top bin, and row 1 carries a third of the column weight, so no tilt clears them); it is still tested against the capsules and the ground. The centroid of a triangle with two profile-exempt vertices is not tested against the profile, so a triangle of only exempt vertices takes no profile test. Every other vertex and centroid of rows 2 and 3 is tested under the division above. A hit directly below the junction is repaired like any other (section 3.4).
- **Detector.** The penetration rows still measure the actual body (section 3.14).

**Containment on the rendered surface (B13).** A Vitest checks containment on the rendered body surface:

- **Surface samples.** Every vertex of every leg and pelvis triangle, plus a barycentric grid inside each triangle at most 1 cm apart.
- **Containing set (variant U).** A sample must lie in the profile (where its posed hips-frame height is at or above the bottom) or in a capsule for which it lies below the bottom in that capsule bone's rest frame or in the posed hips frame.
- **Pose domain.** Taken through `applyClipLayers` + `poseShoulders` + `leanTrunk`:
  - walk, jog and sprint at three speeds each, with stride warp;
  - walk↔jog and stand↔walk blends at weights 0.25, 0.5 and 0.75;
  - kneel down, hold and up;
  - dig;
  - carry;
  - a start and a stop.
- **Morph domain.** The ten corners and, per sex and age group, the builds −1, 0 and +1 that the generator uses. These are the mixed morphs the game actually draws.

Named response for a sample outside: raise that bone's capsule margin to contain it plus 2 mm. The margin lives in `VILLAGER_ASSET.drivenGarments.capsuleMargin` (balance config), which the pipeline exports to `extras.villager.columns.capsules`; the runtime's `columnRig` reads that exported table into each capsule radius, and the Python mirror receives the radii with the game's rig, so an expansion reaches both, but only after an asset rebuild. A profile sample outside takes the same response on `driver.profileMargin`, inside the band `driver.profileMarginBand` × H above the profile bottom that the measured misses need (owner decision 23:20); the runtime reads both from the balance config directly and passes them to the mirror in the rig.

### 3.5.x Open decision (author r2, 03.11.2026) — resolved

**Resolved** by the owner decision of 22:19 (decisions 1 to 4 as proposed below; implemented in `src/render/villagerSkirtDriver.ts`, `scripts/villager/gamepath.py` and the containment test). Measured after decisions 2 to 4, 178,920,021 samples: no sample lies in no envelope; legs outside: thigh.L 0.0139 m (male adult 0, stop, f24), thigh.R 0.0138 m (male adult 0, walk 1.4, f20), profile 0.0315 m (female adult −1, start, f1); pelvis band 0.0270 × scale (male youth 1, sprint 4.2, f20). Thigh radii from below the bottom: male adult 0.089, female child 0.109, male elder 0.090. What remains open is section 3.5.y.

Status: the owner decision of 20:56 (rule 1″) is implemented literally in `src/render/villagerSkirtDriver.ts`, `scripts/villager/gamepath.py` and `src/render/villagerSkirtDriverContainment.test.ts` (commit 8f94173). The containment test stays red under it, and the 80° tilt at a standstill survives it. Both need a plan decision; nothing below is implemented.

**Author's reading of rule 1″ (to confirm).** The decision names thigh capsules only. The shin, foot and toe capsules apply the same test in their own bones' rest frames. For points near those bones that means "always active", because their whole rest geometry lies below the profile bottom. The posed hips-frame test survives only for the profile. The alternative reading, keeping the posed hips-frame test for shin, foot and toe, would retain the test the decision says it replaces.

**Where the literal rule leaves containment red** (one full run, 178,920,021 samples):

- 783,706 samples lie in no envelope. They lie below the profile bottom in the posed hips frame, so the profile does not apply, and at or above it in BOTH thigh rest frames, by up to 0.115 m, so no thigh capsule applies.
- All of them are crotch and inner-thigh samples in sprint and jog. Their rest heights lie within about 2 cm of the bottom, and their skin weights blend both thighs and the hips. With one thigh forward and one back, the blended posed point maps above the bottom in each thigh's rest frame.
- Worst distance to the nearest ACTIVE envelope, by bone:

| Bone | Distance | Figure, motion, frame | Rest heights of the triangle |
| --- | --- | --- | --- |
| foot.R | 0.577 m | male adult 0, sprint 5.8, f21 (w 1.00, v 5.76) | 0.676 / 0.683 / 0.662 |
| foot.L | 0.527 m | male adult 1, sprint 5.8, f21 (w 1.00, v 5.76) | 0.669 / 0.649 / 0.651 |
| shin.R | 0.304 m | male adult 1, sprint 4.2, f25 (w 1.00, v 4.18) | 0.663 / 0.651 / 0.609 |
| shin.L | 0.301 m | male adult 1, sprint 5.8, f20 (w 1.00, v 5.76) | 0.676 / 0.667 / 0.638 |
| thigh.R | 0.101 m | female elder 1, sprint 5.0, f22 (w 1.00, v 4.97) | 0.573 / 0.599 / 0.591 |
| thigh.L | 0.101 m | male adult 1, sprint 5.8, f21 (w 1.00, v 5.76) | 0.625 / 0.658 / 0.671 |
| profile | 0.031 m | female adult −1, start ramp, f1 (w 0.17, v 0.27) | 0.582 / 0.608 / 0.600 |

  Male adult profile bottom: 0.658. Pelvis band: 0.511 × scale (male youth −1, sprint 4.2, f24).

- **Measured variants** (same run, test-side only):

| Variant | Legs outside (worst) | Profile | Pelvis band | Verdict |
| --- | --- | --- | --- | --- |
| U: a capsule is active below the bottom in its rest frame OR in the posed hips frame | thigh.R 0.011 m (female adult 0, sprint 4.2, f25); thigh.L 0.002 m (male elder −1, jog 2.8, f20) | 0.031 m | 0.018 × scale (female child 1, jog 2.2, f21) | not green |
| P: the profile extended below its bottom (bottom-bin value) wherever no thigh capsule is active | thigh.L / thigh.R 0.101 m | 0.031 m | 0.081 × scale | not green |

**80° tilt at a standstill: cause.** Measured with the driver stepped once at the rest pose, 12 columns, on loinFlap and girdleTails for the male adult, female child and male elder.

- The upper segments settle at θ up to 80° (male adult loinFlap: 1, 10, 19, 28, 38, 80, 78, 34, 29, 27, 18, 10°). Columns 5 to 7 are at the back (radial −60° to −120°).
- At θ = 0 the station constraints alone are violated by 0.05 to 0.24 m, while the side columns' skinned panel triangles are clear (triangle depth 0.000 for segments 2 to 4 and 8 to 10).
- **First cause.** Section 3.2 puts the stations on the bone line straight below the waist anchor. At the back and sides that line runs through the buttock and hip, 2 to 3 cm from the thigh axis. Station 1 and 2 terms are equal along the segment: 0.110 m on the male adult's side column, against capsule radius plus clearance 0.133. The built panel lies outside the body on the hull. The driver therefore lifts the bone line out of the body and swings the cloth 15 to 31 cm off.
- **Second cause.** The thigh capsule radius includes drawn vertices above the profile bottom (buttock and hip), and those set it:

| Figure | Radius from all vertices | Radius from vertices below the bottom |
| --- | --- | --- |
| male adult | 0.123 m | 0.085 m |
| male elder | 0.124 m | 0.086 m |
| female adult | 0.105 m | 0.079 m |
| female child | 0.118 m | 0.105 m |

  Using the below-bottom radius alone reduces the side columns by 6 to 10°; the back columns stay at 70 to 80°.
- **Consequences.** The elder kneel test runs 313 s against its 60 s limit (repair rounds and joint searches every frame). The all-rows standstill check of review finding 8 would be red.

**Proposed decisions, with reasons.**

1. **Stations on the cloth (recommended).** Section 3.4 and 3.6 stations become the column's own skinned panel points at three row fractions under the trial angle, instead of points on the bone line.
   - It measures what the picture shows, and removes the cause that holds the back columns at 80°.
   - It needs no asset or pipeline rebuild.
   - The gamepath.py mirror changes the same way.
   - Not chosen: rest pivots on the cloth (section 3.2) needs a pipeline and asset rebuild, and a straight bone line between rows still cuts the buttock bulge. Dropping the station capsule term and relying on the triangle check alone moves triangle cost into every candidate.
2. **Thigh capsule radius from drawn vertices below the profile bottom only.** Above the bottom the profile already governs, so those vertices only inflate the capsule along its whole length. This changes the "capsule radius rule is unchanged" clause, hence needs the owner.
3. **Containment of the crotch blend region.** Adopt variant U for capsules (rest frame OR posed hips frame below the bottom). It closes the no-envelope hole (0.58 m down to 0.011 m), but it reintroduces the posed hips-frame test the decision replaced, so it needs the owner. The remaining 0.011 m thigh miss would then take the plan's named response, a capsule margin raise. The 0.031 m profile shortfall at the start ramp needs a named response the plan does not have (section 3.5 OPEN on the pelvis band).
4. **Shin, foot and toe.** Confirm the rest-frame reading above, or state the alternative.

### 3.5.y Open (author r3, 03.11.2026) — resolved

**Resolved** by the owner decision of 03.11.2026 23:20: thigh margin 0.0241 with an asset rebuild, the profile margin only in a band above the profile bottom, row 1 exempt from the profile test (sections 3.5 and 3.6). Measured after it: section 3.5.z.

- **Thigh margin needs an asset rebuild.** Sized by the miss plus 2 mm the thigh margin goes 0.004 → 0.020 (+0.0159). With that raise and a profile margin of 0.0335 (test-side, same run) the legs are contained, but the pelvis band is 0.0111 × scale against its 0.007 guard (male youth 1, sprint 4.2, f20: a band sample 1 mm below the bottom, nearest thigh.R). A thigh raise of +0.0201 (margin 0.0241) closes the band too (0.0069 × scale): the whole test green. No Blender or pinned sources exist in the author's container, so `capsuleMargin` stays 0.004 and the test stays red.
- **The profile margin flares every cloth column.** At 0.0335 the driver, stepped once at rest, stands every panel-carrying upper segment at 70 to 80°: the built cloth lies inside profile + margin + clearance. It is held at 0 in the balance config (OPEN).
- **The back columns still tilt at rest, from a cause 3.5.x did not name.** With the profile margin at 0, the side columns hang at 0° (cause 1 removed), but loinFlap and girdleTails keep columns 5 to 7 at 13 to 80° (column 6 at 29 to 80°). Their stations are clear at θ = 0 (worst no-triangle deficit 0.02 m at the hem against the thigh capsule's chord target on columns 5 and 7, none on 6); the triangle check is not: 180 to 400 small profile hits (male adult loinFlap) (0 to 9 mm each) on the row-0/row-1 triangles directly below the junction, at hips-frame heights 0.76 to 0.77 (the top bin). Row 1 carries only a third of the column weight, so tilting barely moves those vertices, and the repair rounds and joint searches drive the column to the bound.
- Options for the owner, none implemented: exempt row 1 (as row 0 and the band) from the profile test, or give rows 1 to 3 their junction-source body radius as the profile there; or calibrate the profile's top bins (they take the widest sample of a 30° wedge, wider than the hull the panel is built on).

### 3.5.z Measured after the 23:20 decision (author r4b, 04.11.2026) — stop rule 4

Asset rebuilt with thigh margin 0.0241 (`93a9a63`). The export pass finished; the second pass (sheets, penetration) stopped in `shell_round_trip` because `SHELL_OUTFITS` in `src/render/villagerRuntimePose.test.tsx` wears neither `g-loinFlap-waist.band` nor `g-girdleTails-waist.band`, a defect older than this round (the coverage check is from 21.10., the bands from 03.11. 06:11). The rebuild did not vanish: peak use about 3.6 GB (10 mask workers, 3.2 GB), swap steady at 1.7 GB, no OOM.

Containment (`villagerSkirtDriverContainment.test.ts`, 178,920,021 samples): still red. The thigh misses are closed. What remains: profile 0.0312 m (female adult −1, start f1, w 0.17, v 0.27, rest y 0.605/0.553/0.582); pelvis band 0.0184 × scale (female child 1, jog 2.2, f21), over its tolerance 0.007. With the profile margin 0.0335 inside a band of 0.05 H the profile miss barely moves (0.0315 → 0.0312), so the band does not reach the missing sample: its posed hips-frame height lies above bottom + 0.05 H. The smallest band that closes it is not measured. Not measured in this round: θ per segment at the rest standstill, and the male elder kneel time. Per decision 4, no further rule is invented; the owner splits the point.

**Point 1485, author r1 (04.11.2026): measured, stop rule reached.** `SHELL_OUTFITS` now wears both bands; `node scripts/villager/build.mjs runtime` (the second pass's checks alone, on the cached build) passes: 5 outfits, shell position 5.97e-08. The containment report names each miss's nearest envelope and its hips-frame height above the profile bottom (× scale).

- **Band sweep** (`driver.profileMarginBand`, margin rule unchanged, steps of 0.025 H from 0.05 H): 0.05 H: profile miss 0.0312 m (female adult −1, start f1, 0.0665 × scale above the bottom), worst column 80° at rest. 0.075 H: the start miss closes; a new profile miss 0.0245 m (male adult +1, dig f40, 0.1111 × scale above the bottom); every case's worst column 80° at rest. The sweep stopped there (context budget, and the stop rule already held): the misses climb with the band, so no band closes the profile without a margin over most of the profile, and the margin lifts every column. The band stays 0.05 H; the smallest closing band is not found.
- **Pelvis band miss** 0.0184 × scale (female child +1, jog 2.2, f21, rest y 0.764–0.775): nearest envelope the profile, 0.147 × scale above its bottom, above every swept band, so unchanged by it. Cause not shown beyond that: the miss lies above the margin band on the profile alone. No value changed (none is shown to own it; candidate for the owner: the 240 thinned pelvis samples against the band triangles between them).
- **θ at the rest standstill** (`villagerSkirtStandstill.test.ts`, 120 frames at rest, band 0.05 H), worst segment per case: male adult loinFlap 51°, female child loinFlap 80°, male elder loinFlap 56°, male adult girdleTails 75°, female child girdleTails 80°, male elder girdleTails 58°. The raised segments are columns 0, 5, 6 and 7 (front and back), 21–80°; the side columns hang at 0°. Over the 5° limit.
- **Male elder kneel alone:** 52.9 s, under 60 s.

Under stop rule 4 no further envelope rule is invented; containment and the standstill stay red for the owner.

**Point 1485, author r2 (04.11.2026): causes measured, no value changed, design decision needed.** Measured with a throw-away probe on the driver's own `evaluate`/`triangleDepth` (branch head `dbc5fb393`, band 0.05 H, margin 0.0335, thigh margin 0.0241). `test:unit` on that head: 643 files, 8 failed (containment; the six standstill cases; male elder kneel at 70.3 s inside the full run, 52.9 s alone per r1), 18 536 passed.

- **Standstill tilt, cause.** The side columns hang at 0° only because no panel crosses them (loinFlap and girdleTails carry columns 0, 1, 5–8 and 11; stations on 0, 5, 6, 7). Every cloth-carrying column is pushed at rest by two envelope terms that exceed the garment as built:
  - *Profile margin inside the band.* Male adult loinFlap, column 0 at θ = 0: 240 profile hits (rows 3 and 4 and the centroids of the row 2–4 triangles), every one inside the band (hips-frame height 0.010–0.059 × scale above the bottom), depth 0.024–0.031 each, summed 6.35. The worst: cloth radius 0.1091 against profile 0.1340 = bare 0.1006 + margin 0.0334, plus clearance 0.006. Without the margin the cloth clears the bare profile there by 2.5 mm; the margin alone turns that into a 0.031 deficit, and the hits vanish only at θ ≥ 50° (triangle score 6.35 → 1.29 at 20°, 0.09 at 40°, 0 at 50°). Columns 6 and 7 carry the same hits (16.8 and 9.95 summed).
  - *Thigh capsule at the back hem.* Columns 5 and 7 at θ = 0 have a station deficit of 0.041 (girdleTails 0.046–0.054) against the thigh capsule's chord target, and triangle hits of rows 4–6 against thigh.L/thigh.R up to 0.047 deep below the bottom. Of the 0.041, 0.024 is the 23:20 margin raise (0.0241 − 0.004); 0.021–0.034 is pre-existing: the capsule carries the buttock's maximum radius down the whole thigh, and the hanging flap's hem lies inside that cylinder at rest.
  - *Counterfactuals, 120 frames at rest, worst column per case (current → profile margin 0 → thigh margin 0.004 → both):* male adult loinFlap 51 → 22 → 70 → 15°; female child loinFlap 80 → 29 → 80 → 19°; male elder loinFlap 56 → 27 → 75 → 17°; male adult girdleTails 75 → 28 → 75 → 19°; female child girdleTails 80 → 30 → 73 → 23°; male elder girdleTails 58 → 30 → 75 → 22°. The profile margin owns the front column and the 50–80° of column 6; the thigh capsule owns the 15–30° of columns 5 and 7, and the bare capsule alone keeps them at 15–23°. Every solution is feasible (residual 0): the tilt is the smallest feasible configuration, not a search failure.
- **Why the profile misses climb with the band.** Against the bare profile (margin 0) female adult −1 has 79 814 leg samples outside, spread continuously over 0.00–0.09 × scale above the bottom (worst per 0.01 step: 0.015, 0.019, 0.016, 0.020, 0.026, 0.027, 0.032, 0.027, 0.016, 0.010); male adult +1 70 280 over 0.00–0.11 (0.010 … 0.027 at 0.04, 0.024 at 0.10–0.11); female child +1 52 904 over 0.00–0.06 (max 0.009). A margin band hides the samples below its edge, so the reported worst miss is always the first sample above the edge: 0.05 H = 0.067 → reported at 0.0665; 0.075 H = 0.1005 → reported at 0.1111 (male adult +1, dig f40). The samples themselves are the thigh top in the dig and start-ramp poses (thigh weight 0.76–0.98, hips 0.02–0.24, rest y 0.55–0.69): the worst sample lies 0.048–0.064 INSIDE the thigh capsule, but the capsule is inactive for it (0.000–0.003 × scale above the bottom in the thigh's rest frame, 0.04–0.07 above it in the hips frame, variant U), so only the profile is consulted, and the profile's samples are frozen between the bottom and the top at rest; nothing in them rises with a lifted thigh. The miss is an activation gap, not an envelope radius, so no margin on the profile is the right response and every margin flares the cloth at rest (above).
- **Where the pelvis-band miss comes from.** Female child +1, jog 2.2 f21: the sample is 0.0007 below the profile top (y 0.7759, top 0.7765), angle −29.3°, column 4, top bin (bin 5 of 6). That cell holds exactly one of the 240 thinned pelvis samples (r 0.0766, spine 0.43 + spine1 0.39 + hips 0.16), while 9 of the 2304 in-band body vertices pose into it with radius up to 0.1047; the bin below holds 0.1087. The query there is 0.0789, the body 0.0973: 0.0184 × scale. Cause: the farthest-point thinning to `pelvisSamples` 240 (about 3 samples per cell of 12 columns × 6 bins, spread in rest space, not per cell) leaves top-bin cells with one sample that is not that cell's widest vertex; the trunk twist of the jog moves the spine1-weighted belly vertices past it. At rest and in the walks the band stays within 0.009. The owning value is `driver.pelvisSamples` (or a per-cell thinning); not changed here, the consequence (per-frame CPU, and a wider top bin can add cloth hits in rows 2–3) is unmeasured.
- **Decision needed (no driver, mirror or test defect found; the division rule is an owner decision).** Options, with what is measured:
  1. Keep the margins: standstill 51–80°, containment red (profile 0.0312, band 0.0184).
  2. Profile margin 0 (the band then irrelevant): standstill 22–30°; the lifted-thigh samples stay outside by up to 0.0315 (not contained there, the cloth is only held by the profile at those heights).
  3. Additionally thigh margin back to 0.004 (asset rebuild): standstill 15–23°; the thigh misses closed by 0.0241 return.
  4. Close the activation gap at its source instead of by margin, both unmeasured: (a) let the profile's sample input include body vertices below the bottom that pose at or above it in the hips frame, dropping a sample posed below the bottom instead of clamping it into the bottom bin, so the profile follows a lifted thigh and rests unchanged; (b) taper the thigh capsule per height (its hem radius, not the buttock's) to remove the residual 15–23° of columns 5 and 7. Both are section 3.5 rule changes.
  5. Pelvis band: raise `pelvisSamples` or thin per profile cell (above).

**Point 1485, author r3 (04.11.2026): the four owner steps applied, measured, stop rule reached.** Commits `3f6e2b4`-ff (see the hand-over); TS and Python mirror changed identically (the drop rule in `rebuild`); the rig builder (`columnRig`) is TS-only and exported to the mirror. Worst column at the rest standstill (male adult / female child / male elder; loinFlap, girdleTails; limit 5°) and containment after each step:

1. Profile margin 0 (band inert): standstill 22 / 29 / 26°, 28 / 30 / 30° (columns 5–7 at 20–30°, column 0 of the female child 27–29°); containment profile 0.0314 m (female adult −1, start f1, 0.0610 × scale above the bottom), thigh.R 0.0129 (female adult 0, sprint 4.2 f25; hidden by the margin before), band 0.0184 × scale (unchanged).
2. Profile follows a lifted thigh (thigh vertices as sample input, posed-below samples dropped): standstill unchanged (0 / 29 / 26°, 28 / 30 / 29°: the rule is inert at rest, as intended); containment profile 0.0701 m (male adult +1, sprint 5 f21, 0.0134 × scale above the bottom), thigh.R 0.0138, thigh.L 0.0133, band 0.0240 × scale (female youth +1, sprint 5). The 240 farthest-point samples now spread over pelvis and thighs, so the band thins.
3. Tapered thigh capsules (slabs 0.06 H: 3 per thigh, 14 capsules in all): standstill 22 / 29 / 26°, 30 / 50 / 30°: columns 5 and 7 unchanged (20–29°), column 6 of the female child girdleTails 14 → 50°; containment thigh misses closed (none), profile 0.0701 and band 0.0240 unchanged. The thigh margin stays 0.0241: without the taper's margin the thigh misses of step 4 (below) remain, so it is not shown unnecessary.
4. Per-cell thinning (111–117 cells kept, filled to 240; sample count unchanged): standstill unchanged from step 3 (22 / 29 / 26°, 30 / 50 / 30°); containment profile 0.0695 m (male adult +1, sprint 5 f21, 0.0134 × scale), thigh.R 0.0180 (female adult +1, start f33), thigh.L 0.0152 (male adult −1, sprint 5), band 0.0473 × scale (male adult +1, stop f26, 0.0237 × scale above the bottom).

Per-frame cost: pelvis samples 240 before and after; capsules 8 → 14. Standstill case durations (s, the six cases in test order) step 1: 19.4 / 20.2 / 20.8 / 8.7 / 9.1 / 25.2; step 4: 23.5 / 21.6 / 22.8 / 28.9 / 26.7 / 29.1 — the slab capsules triple the girdleTails cases. Male elder kneel alone: 60.4 s, over its 60 s limit (52.9 s at r1); charged to the point for later per the preface.

Remaining causes (stop rule; no margin added, no further rule invented): (a) containment: the drop rule removes from the bottom bin the buttock samples a back-swung thigh poses below the bottom (sprint, stop ramp), while the surface triangles spanning the bottom still lie at or just above it (0.013–0.024 × scale); neither envelope holds them (the thigh capsule is inactive there in both frames, the activation gap of r2 mirrored). Under the former clamping these samples filled the bottom bin. (b) Standstill: the taper did not move columns 5 and 7 (20–29°), so their deficit is not the buttock radius carried down the thigh; and column 6 of the female child girdleTails rose to 50° with the slabs, untraced here. Column 0 of the female child (27–29°) is also not owned by the profile margin. Candidates for the owner: keep a sample posed below the bottom in the bottom bin when its rest height lies in the band (the band's own vertices clamp, the thigh's drop); trace columns 5–7 with the r2 probe against the slab capsules.

### 3.6 Chord target and verification on skinned triangles (B16, B17, check-3 B4)

**Revision line (owner decisions 03.11.2026 and 04.11.2026).** The skinned-triangle check follows section 3.5's revision line: a thigh's slab capsules are tested one by one like any capsule, each on the triangle's active part (04.11.2026); each capsule term covers the triangle's part below the profile bottom in that capsule bone's rest frame or in the posed hips frame (22:19, variant U); the profile term applies at or above the bottom in the posed hips frame; a triangle with two exempt vertices skips the centroid's profile test (rule 3).

**Clearance target.** The target per column against a capsule is sqrt(C² + (c/2)²):

- C is the capsule radius plus the cloth clearance of section 3.9 at that row;
- c is the chord to the farther neighbouring column under the current candidate, both measured at their cloth stations (section 3.4); a neighbour without stations adds none.

**Skinned-triangle check (B17).** The chord target does not cover triangle interiors, so the final evaluation of section 3.4 checks the actual skinned triangles:

- Coverage: every panel vertex of the worn form is skinned on the CPU with its exact four weights, including rows 1 to 3 and the knee blend.
- Tests: every panel triangle (panel boundaries included) that reaches below the profile bottom in a capsule bone's rest frame or in the posed hips frame and whose bounding sphere meets a capsule's expanded bound is tested exactly, as the closest point between the capsule segment and that part of the triangle. Each triangle is also tested against the pelvis profile (section 3.5) and the ground. Row 1 takes no profile test (owner decision 03.11.2026 23:20); a triangle with two profile-exempt vertices (band, row 0 or row 1) is not tested at its centroid against the profile, its third vertex still is.
- Scoring in the repair (B17): a triangle hit is not only a trigger. In the repair rounds of section 3.4, every candidate of a segment re-skins every panel vertex with a nonzero weight on that segment's bone or on any of its descendants and runs the same triangle tests on the triangles they touch (check 3 B17). For an upper segment `col.U.k` that set includes the vertices weighted only to `col.L.k`, which the trial moves through inheritance: the trial carries `col.L.k` at its current local rotation, so the trial geometry and its score are those the frame would draw. A candidate with a hit is infeasible.
  - Among infeasible candidates, the score is the summed penetration depth of those triangles, so the repair cannot return the solution that produced the hit.
  - The joint two-column search of section 3.4 uses the same score.
- Report: what remains after the third round is counted in the DEV counter and in the mirror's report.

**A residual the pictures reject.** It is answered, in this order:

1. Repair rounds from three to five.
2. Sixteen columns.
3. The sagittal fallback of section 3.15.

Each step is followed by the moving-sequence acceptance on both backends. None is accepted as shading.

### 3.7 Ground bounds and the ground fallback (B15, check-3 B3)

The ground constraint applies to every row a segment carries: the row point must stay at y ≥ 2 mm in the figure frame. Neither segment is assumed feasible.

**Fallback: lift outward, no scale (B15, C4, C5).** Revision 2's axial bone scale σ is withdrawn. A scale on the column axis moves only the axial component of off-axis, column-blended vertices, so no ratio puts the rendered hem on the ground (C4). An upper scale is also inherited by a rotated lower segment as shear (C5). Without scale, neither problem exists.

The fallback, used when the best candidate of a segment still leaves a skinned row below 2 mm:

- The segment's θ may go beyond θmax, up to θground = 110°, so the segment swings outward and up about its own top pivot.
- Candidates run in 2.5° steps over (θmax, θground]. Each is evaluated on the actual skinned rows: every panel vertex with a nonzero weight on that segment's bone or any of its descendants (for `col.U.k` this includes `col.L.k`, carried at its current local rotation) is skinned on the CPU with its four weights, and the lowest one decides (C4, check 3 B17). The smallest θ whose lowest skinned vertex is at 2 mm or more is chosen. For an upper segment, the lower segment is then re-solved from the new knee point.
- A kneeling figure's knee pivot lies a few centimetres above the ground. A lower segment lifted towards horizontal therefore lays the hem out flat around the knee, which reads as cloth spread on the ground.
- Every triangle of the affected columns is then re-checked (section 3.6), with neighbour limits relaxed only between two fallback segments.
- **Residual.** If even 110° leaves vertices below ground (the top pivot itself below 2 mm), the residual is counted and judged in the low-camera kneel and dig pictures. The pictures decide whether it reads as cloth on the ground; no numeric gate applies.

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

- At assembly, each worn shell S other than F's own band whose region lies below the junction gives a full increment ΔS = max(0, offset(S) + step − clearbase) and a top height ytop(S) (the top of its region).
- The ramp is defined by height, not by row index, so it has no coincident endpoints (C1). For each row ≥ 1 with rest height y:
  - wS(y) = clamp((yj − y) / (yj − ytop(S)), 0, 1), with yj the junction height;
  - Δ(y) = maxS (ΔS · wS(y)).
- Each vertex of that row is moved by Δ(y) along its row's rest radial direction, before the bake.
- Row 0 has weight 0 by definition and is never displaced; it stays the authoritative attachment.
- A row at or below ytop(S) gets the full ΔS, even when that row is row 1.
- Worked case (C1). loinFlap: yj = hip + 0.052 H, beads top ytop = hip + 0.027 H, row 1 at hip + 0.0267 H. That gives w = (0.0253 / 0.025), clamped to 1, so row 1 takes the full 9 mm (12 + 3 − 6). Row 0 takes 0. The panel opens over the 0.025 H (about 4 cm) between them by 9 mm, a slope of about 1 in 4 at the waist, judged in the beads row.
- The same Δ enters C in section 3.6 and in the pelvis profile test.
- The runtime and the mirror read the same worn set. A Vitest asserts Δ with and without the beads.

### 3.10 Partial panels: grid, rows and widths (B8, B10, check-3 B19)

**Angular grid.** The grid is independent of the twelve columns. It is the junction loop's vertex angles: about 60 at the girdle after revision 10's subdivision, and the builder asserts at least 36. Panel boundaries are snapped to loop vertices (section 3.3). A grid vertex between columns at angles a0 < a < a1 is weighted to those two columns by angular interpolation.

**Rows (B8).**

- Each panel has its own active row range, running from the junction to exactly its own hem, with rows at most 0.03 H apart on the basis body.
- No panel carries a row below its hem. The knee is a rig anchor (the `col.L` pivots), not a row, for every panel whose hem lies above it.
- The knee blend of section 3.3 exists only on a panel whose hem lies below the knee pivot. With today's hems that is skirtKnee alone; the apron and girdleTails' back end above the pivot (B8).
- girdleTails' front and back are separate panels with their own row counts.
- Faces exist only between consecutive rows of one panel.

**Widths (B10 adopted).** The rendered legacy widths are preserved, not the unsampled keep thresholds. The legacy 24-sample grid renders these edges:

| Form | front panel | back panel | front hem | back hem |
| --- | --- | --- | --- | --- |
| loinFlap | abs(a) ≤ π/12 | abs(a) ≥ π − π/6 (both sides of π, width π/3) | hip − 0.10 H | hip − 0.10 H |
| girdleTails | abs(a) ≤ π/12 | abs(a) ≥ π − π/6 (both sides of π, width π/3) | hip − 0.14 H | knee + 0.05 H |
| apron | abs(a) ≤ π/6 | abs(a) ≥ π − π/4 (both sides of π, width π/2) | knee + 0.02 H | knee + 0.02 H |
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
   - This moves part of point 1400 into 1398 for these outfits; allowed by the owner's X1 decision of 02.11.2026.

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
- **Ground.** Per frame, the lowest panel point below y = 0 in the figure frame, with form, clip, frame, corner and whether the ground fallback (section 3.7) was active. Named response: judge it in the low-camera kneel and dig picture; never an offset change.
- **Shell row two repaired (E4).** The geodesic exclusion of 3 × offset. Re-run for the stage-1 shells and the new bands.
- **Arms.** The `shoulders` pseudo-clip (`with_shoulders`), carry, carryIdle and dig stay in the measurement for all five. Each hand or forearm contact with a panel is reported with frame and bone, and section 3.16 answers it.
- **Round trip.** villagerRuntimePose.test.tsx exports, per test outfit and fixed-dt sequence, the worn list, the 24 column local transforms (rotation, translation, scale) and the sampled panel rows. gamepath.py's stateful mirror recomputes them within 1e-4. The DEV counters of sections 3.4 and 3.6 are compared with the mirror's report.

### 3.15 Sagittal fallback (B19 adopted)

The radial-only solve is the prototype. If the walk or run moving sequences of any form show the panel flaring sideways where cloth would swing forward or back, the fallback is implemented within point 1398, before the stage closes:

- **Axes (C3).** For column k let rk be its rest radial direction (horizontal, outward from the hips axis), uk the hips up axis, and tk = rk × uk the tangential direction. With right-handed rotations, Rot(tk, θ) turns the downward direction −uk towards +rk: a positive θ swings the segment outward (revision 3's tk = up × rk swung it inward; check 3 B19). Example: rk = +X, uk = +Y gives tk = +Z, and θ = 30° turns (0, −1, 0) into (0.5, −0.866, 0).
  - θ (section 3.4) is the rotation about tk. It swings the segment in the plane of rk and uk: in and out.
  - The fallback adds ψ, a rotation about rk. It swings the segment in the plane of tk and uk: sideways along the ring.
  - rk and tk are orthogonal, so the two rotations are independent. Together they reach any swing direction, forward or back for every column.
  - The segment's rotation is R = Rot(rk, ψ) · Rot(tk, θ) in the hips frame.
- **Range.** ψ ∈ [−45°, 45°]. The neighbour limit applies to the angle between neighbouring segments' directions, not to θ alone.
- **Solve.** Coordinate descent: a θ search with ψ fixed, then a ψ search with θ fixed, two rounds. Each search is the scheme of section 3.4, with the continuous relaxed candidate, the same constraints and triangle scoring, continuity state (θs, ψs) and final evaluation. That is four one-dimensional searches per segment, about four times the radial cost, not two.
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
- The mirror's solve on toy capsules: determinism, the rate limit, the reset, the bounded repair with triangle scoring, the joint two-column search, the continuous relaxation and the lift-outward ground fallback evaluated on skinned rows.
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
  - θ within [0, θmax] for a segment the ground fallback does not hold, and within [0, θground] for one it holds, with both bounds reached in a test (N1);
  - the sign of θ: a positive θ increases the outward displacement of a hanging segment's tip, for θ and under the sagittal fallback (B19);
  - candidate scoring of an upper segment against a triangle whose vertices are weighted only to its lower segment: the trial that moves it into a capsule is infeasible (B17);
  - the neighbour limit;
  - final-evaluation completeness;
  - the bounded repair;
  - the ground fallback;
  - continuity (|Δθ| per frame within the rate limit except when only a larger step is feasible).
- Containment on the rendered surface over the pose and morph domain (section 3.5).
- Pelvis profile bins (B14, N2): a sample posed across a bin boundary counts in the bin of its posed location and no longer in its rest bin; an internal empty bin takes the nearest populated bin of its column; two adjacent wholly empty columns both resolve to populated bins of other columns (no cycle); a query above the top bin returns the top bin's value.
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
- **R8 Hem lifted on the ground.** The ground fallback swings a segment outward and up to at most 110°. Accepted if the result reads as cloth spread on the ground at 3 m in the low-camera kneel and dig pictures.
- **R9 (withdrawn in revision 3).** No bone scale is used, so no scale inheritance or shear exists (C5). A Vitest asserts that every column bone's scale stays (1, 1, 1) in all driver tests.

## 7. Landable sub-steps

Each sub-step is a commit series on `feat/1398-…`. It lands only with the cheap gate (tsc, lint, build, test:unit, the covering suite) and, where the picture moves, the both-backend picture of its rows, still and moving. The owner may split the later sub-steps into their own points under the standing split rule.

1. **Column bones** (sections 3.1, 3.2 as limited by owner decision G1/G2): skeleton, body, clips, export, asset, clip-layer exclusion, reference heads, knee and ankle runtime pivots with DEV assertion, cache keys, pipeline rebuild. Picture: unchanged idle, walk and dig against main on both backends (R5).
2. **Driver** (sections 3.4 to 3.7): TypeScript driver with frames, state and final evaluation; the Python mirror; capsules and containment Vitest; round trip with no driven garment worn (columns posed, unweighted). No picture change.
3. **Driven builder with loinFlap and girdleTails** (sections 3.2 per-form rest contract, 3.3, 3.8 to 3.10, 3.12, 3.13 for two forms): mesh identity, bands, panels, junction, clearance, removal of their legacy branch. Pictures: their rows, WindelLook, the loin flap over the beads, the arm rows.
4. **Apron.** Pictures: its rows, the apron over the beads, the arm rows.
5. **skirtShort and skirtKnee.** Pictures: their rows, the 1380 framing, the arm rows.
6. **Routing** (section 3.11): the outer-garment combinations, outfit-specific ease, then omission (robe) or joint migration (cloak) where reached.
7. **penetration.py rows** (section 3.14) with the repaired row two; reports refreshed; the sagittal fallback (3.15) and arm capsules (3.16) if their pictures required them; the final picture pass over all stage-3 rows on both backends; the review record.

### Hand-over (author r3, 03.11.2026)

Tree: branch head after merging `origin/main` into `25bb797`. Gates on that tree: `typecheck:test` green; `build` green; `lint` green (one warning in the untouched `scripts/verify/polish-villagers.mjs`); `test:unit` 4 red of 18546 (18524 passed, 18 skipped), plus 2 vitest-worker RPC timeouts (environment load):

- `villagerSkirtDriverContainment`: legs miss thigh.L 0.0139 m, thigh.R 0.0138 m, profile 0.0315 m, pelvis band 0.027 × scale. The thigh margin raise of the 22:19 decision needs an asset rebuild (runtime reads `asset.columns.capsules` from `export.py`; no Blender in the cloud). Test-side, a thigh margin of 0.0241 m plus a profile margin of 0.0335 m make it green.
- `villagerKneelGround` male elder: about 100 s against 60 s (was 313 s).
- `scripts/batch-doctor-protected.test.mjs` (2 cases): red on `main` too, environment.

Tasks:

1. Decisions 1 to 4 implemented in driver, mirror and containment test (`d81b6f2`). Plan sections 3.2 to 3.6 are restated, and 3.5.x is resolved (`25bb797`). Stop condition reached: the thigh margin needs a rebuild, and the profile margin of 0.0335 m (held at 0, `// OPEN:` in `balance.ts`) lifts every column to 70 to 80° at rest. The back columns 5 to 7 still tilt 58 to 80° at rest, driven by row-0/row-1 profile triangle hits below the band. Options are in section 3.5.y. Covered by `villagerSkirtDriver.test.ts` (variant U, cloth stations) and the mirror selftests.
2. All-rows standstill check (review finding 8): not started. It would be red while the back columns tilt.
3. Low 1 m camera row and 16-frame moving strip (review finding 1): not started, because of the stop in task 1.

Open for the owner: rebuild with thigh margin 0.020 or 0.0241; the profile margin against the flare it causes; the response to the row-1 hits (3.5.y); the author's choices for columns without stations (no stations, no chord; bone-line fallback without a worn form).

### Hand-over (author r4, round r4b, 04.11.2026)

Branch `feat/1482-garment-driven-builder`. Commits: `ef985fe` (decisions 2 and 3, rescued from r4), `93a9a63` (asset rebuilt), `5b0f741` (section 3.5.z), plus this hand-over commit. Stopped under decision 4 (containment red), and the session's context passed the 122k fence. So origin/main was NOT merged and the four gates were NOT run on a merged tree: typecheck:test, build, lint and test:unit were not run. The pre-push hook's lint ran on each push (0 errors, 1 unrelated warning in `scripts/verify/polish-villagers.mjs`).

1. Decision 1: thigh margin 0.0241 (`balance.ts`), asset rebuilt with the pinned Blender 3.4.1. Export pass ok. Second pass red: `SHELL_OUTFITS` does not wear the band shells (section 3.5.z). Covering test: `villagerSkirtDriverContainment.test.ts`, whose thigh misses are now closed.
2. Decisions 2 and 3: profile margin 0.0335 in band `driver.profileMarginBand` 0.05 H, and row 1 profile-exempt, in the driver, the mirror and the containment test (`ef985fe`); plan 3.5/3.6 restated. The band size is NOT shown to be the smallest that closes the miss: the miss remains. Covering test: the containment test, red. The mirror selftests passed in the rebuild.
3. Measured: containment 178,920,021 samples, profile 0.0312 m (female adult −1, start f1), pelvis band 0.0184 × scale (female child 1, jog 2.2); thighs 0. θ at the rest standstill and the male elder kneel: not measured.
4. No browser suite run.

Open: (a) `SHELL_OUTFITS` needs band outfits before `build.mjs` can pass its second pass; (b) the profile miss sits above bottom + 0.05 H, so the band or the margin rule needs an owner decision (the split under decision 4); (c) the pelvis band at 0.0184 is over its tolerance; (d) θ at the standstill and the elder kneel timing are owed; (e) merge main, then the four gates.

### Hand-over (point 1485, author r2, 04.11.2026)

Branch `feat/1485-skirt-containment-calibration`, worktree `/workspace/hoa/.claude/worktrees/point-1485`. Start `dbc5fb393` (main merged by r1). Commits: `0938eb71b` (plan section 3.5.z, the r2 cause analysis) plus this hand-over commit; pushed head: see the final line of `local/1485-r2-handover.md`. No code, config, mirror or test changed: the causes are not a driver, mirror or test defect but the section 3.5 envelope rules (owner decisions), so under the r2 brief the round stops with options.

Gates on the main-merged tree at `dbc5fb393` (the probes were throw-away test files, deleted before the gates and never committed):

- `npm run test:unit`: 643 files, 8 failed / 18 536 passed / 8 skipped, 621 s. Red: `villagerSkirtDriverContainment.test.ts` (profile 0.0312 m, band 0.0184 × scale, as r1), the six `villagerSkirtStandstill.test.ts` cases (51–80°), `villagerKneelGround.test.tsx` male elder (70.3 s in the full run against its 60 s limit; 52.9 s alone per r1: a load-dependent timeout, not a new defect).
- `npm run typecheck:test`: green. `npm run build`: green. `npm run lint`: 0 errors, 1 unrelated warning (`scripts/verify/polish-villagers.mjs` `fireBlaze`).

Tasks of the r2 preface:

1. Cause of the front/back standstill tilt: measured and recorded in section 3.5.z ("author r2"). The side columns hang at 0° only because no panel crosses them. The cloth-carrying columns are pushed by the profile margin inside the band (240 hits of 0.024–0.031 on rows 3–4 at θ = 0, male adult loinFlap column 0; cleared only at θ ≥ 50°) and by the thigh capsule at the back hem (station deficit 0.041 on columns 5 and 7, of which 0.024 is the 23:20 margin raise and 0.021–0.034 the buttock-radius cylinder). Counterfactuals: margin 0 → 22–30°; both margins off → 15–23°. Covering test: `villagerSkirtStandstill.test.ts` (still red).
2. Why the profile misses climb with the band: the bare-profile misses are continuous over 0.00–0.09 (female adult −1) and 0.00–0.11 × scale (male adult +1); a band hides those below its edge, so the reported miss is the first sample above it (0.0665 for 0.05 H, 0.1111 for 0.075 H). The samples are the lifted thigh top (dig, start ramp), 0.048–0.064 inside the thigh capsule yet above the bottom in both frames: an activation gap of variant U, not an envelope radius.
3. Pelvis-band miss: the top bin of column 4 holds one of the 240 thinned samples (r 0.0766) while 9 body vertices pose into it (max 0.1047); the jog's trunk twist moves the spine1-weighted belly past it. Owning value `driver.pelvisSamples` (or per-cell thinning); not changed, consequence unmeasured.
4. SECOND step: no defect found, so nothing fixed; the options with measured consequences are in section 3.5.z (keep margins / profile margin 0 / both margins off with rebuild / profile samples that follow a lifted thigh and a tapered thigh capsule / more pelvis samples).

Open for the owner: the decision among those options; the elder kneel's 60 s limit under full-suite load; the male elder kneel and the containment stay red until then. Rebuild not needed in this round.

## 8. Open questions for the break check

- Q1: Is the per-figure continuity state (section 3.4) with reset rules acceptable as the driver's only state, given that the rest of the pose pipeline keeps comparable per-figure gait state (`ClipGait`)?
- Q2: Is lifting a segment outward to at most 110° (section 3.7) a believable ground fallback for kneel and dig, given that the pictures judge it?

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
| B14 | BLOCKING | Superseded in revision 3: skinned pelvis profile in candidate scoring, triangle check and repair; see section 10 | 3.5 |
| B15 | BLOCKING | Superseded in revision 3: lift-outward fallback on skinned rows, no bone scale; see section 10 | 3.7 |
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

**Escalation X1 — decided.** B20's terminal step for the both-shoulders cloak moves part of point 1400 into point 1398, as a `.driven` variant only for outfits wearing the cloak with a driven form. It is reached only if two outfit-specific ease steps fail in the picture. The owner allowed it on 02.11.2026.

No finding contradicts the current code in a way this revision cannot resolve. Two findings rest on code facts that were checked:

- B1: one `meshes` entry per name; `cloth_names` builds the cover order.
- B11: the `tube` flare law at garments.py lines 450–453.

## 10. Answers to check 2 (docs/four-eyes/1398-plan-check-2-sol.md)

Yardstick, restated: believable clothing in the picture at 3 m and 7 m on both backends, still and moving. Constraints and checks are the means to that end, not a proof that nothing ever clips. Where a finding asks for more than that, the table says so.

| Id | Kind | Answer | Section |
| --- | --- | --- | --- |
| B8 / A1 | BLOCKING | The knee blend exists only on a panel whose hem lies below the knee pivot: today skirtKnee alone. The apron and girdleTails' back end above the pivot and carry no `col.L` weight. The builder decides this from frozen basis heights and asserts it. | 3.3, 3.10 |
| B12 / C1 / A4 | BLOCKING | The clearance ramp is defined by height: wS(y) = clamp((yj − y) / (yj − ytop(S)), 0, 1) and Δ(y) = maxS ΔS · wS(y). Row 0 is 0 by definition, and a row at or below the shell's top takes the full ΔS even when it is row 1. Worked loinFlap case given. | 3.9 |
| B14 / A2 | BLOCKING | The pelvis is a skinned sample profile (at most 240 frozen vertices, skinned on the CPU with their actual weights, so non-rigid motion is included), giving Rp(k, y). It enters candidate scoring, the triangle check and repair. Only the band and row 0 are exempt. | 3.5 |
| B15 / C4 / A7 | BLOCKING | Axial scale is withdrawn. The ground fallback lifts a segment outward beyond θmax up to 110°, choosing the smallest angle at which the lowest actually skinned vertex of that segment's panel vertices clears 2 mm. The triangles are re-checked afterwards. | 3.7 |
| C5 / A8 | BLOCKING | No column bone carries scale anywhere, so there is no inherited shear. A Vitest asserts unit scale on every column bone. | 3.4, 3.7, 6 R9 |
| B17 / A3 | BLOCKING | In repair, every candidate re-skins its segment's vertices and runs the triangle tests. A hit makes the candidate infeasible, and infeasible candidates are ranked by summed depth. A repeat choice with remaining hits switches to an 81-pair joint search of the two owning columns. | 3.4, 3.6 |
| B18 / C2 / A5 | BLOCKING | The continuous state is θs, and θrel = θg + (θs − θg)·exp(−dt/τ) is evaluated exactly as the first candidate. An infeasible θrel is resolved by bisection to the feasibility boundary (0.25°). There is no quantised sticking: at 120 fps a free 30° hem relaxes by about 1° per frame to θg. A frame-rate Vitest runs at 30, 60, 120 and 144 fps. | 3.4 |
| B19 / C3 / A6 | BLOCKING | ψ is the rotation about the column's radial axis rk, orthogonal to θ's tangential axis tk, with R = Rot(rk, ψ)·Rot(tk, θ). Two independent degrees of freedom reach any swing direction. The solve is coordinate descent with four 1-D searches. | 3.15 |
| C6 / A9 | ADVISORY | Adopted: the back intervals are printed as abs(a) ≥ π − w on both sides of π, with their full widths. The legacy-mesh measurement stays mandatory. | 3.10 |

**Proof beyond the yardstick.** Two remaining aspects are not proved, by choice; both are acceptance by picture:

- That the bisected boundary angle (B18) keeps every triangle clear between samples. It is enforced by the triangle check and judged in the moving sequences.
- That the lift-outward fallback (B15) always finds a grounded shape. Where it does not, the residual is counted and the low-camera picture decides.

Both follow point 1339: no numeric penetration threshold is an acceptance gate.

No finding of check 2 contradicts the current code. Every change in this revision is a plan-text change. The material Sol marked as truncated (penetration.py `shell_rows`, the runtime, export and cache files) is unchanged on `main` since revision 2.

## 11. Answers to check 3 (docs/four-eyes/1398-plan-check-3-sol.md)

Check 3 resolved B8, B12/C1, B15/C4, C5, B18/C2 and C6. The four open ids are answered as plan-text changes; no code changed.

| Id | Kind | Answer | Section |
| --- | --- | --- | --- |
| B14 / N2 | BLOCKING | Revision 5: the pelvis profile is a table of 0.02 H bins per column, rebuilt every frame from the samples' posed angle and height (N2), so a sample counts where it is drawn. An empty bin takes the nearest bin that received a sample this frame, same column first, then other columns by angular distance; donors are only populated bins, so no cycle exists (B14). Above the top bin the top bin's value applies; below the crotch − 0.02 H the capsules alone apply. A Vitest covers a sample crossing a bin boundary, an internal hole, two adjacent empty columns and a query above the range. | 3.5, 5 |
| B17 | BLOCKING | A candidate re-skins every vertex weighted to its segment's bone or any descendant; for `col.U.k` that includes vertices weighted only to `col.L.k`, carried at its current local rotation. The ground fallback uses the same set. A Vitest scores an upper trial against a lower-only triangle. | 3.6, 3.7, 5 |
| B19 / C3 | BLOCKING | tk = rk × uk, so Rot(tk, θ) turns −uk towards +rk and a positive θ swings outward; worked example rk = +X, uk = +Y, θ = 30° → (0.5, −0.866, 0). Section 3.4 names the same axis. A Vitest asserts that positive θ increases outward displacement. | 3.4, 3.15, 5 |
| N1 | BLOCKING | The bound is conditional: θ ∈ [0, θmax] without the ground fallback, θ ∈ [0, θground] while it holds the segment. The candidate constraint, the final evaluation, the repair rule and the Vitest all state it so, and the Vitest reaches both bounds. | 3.4, 5 |
