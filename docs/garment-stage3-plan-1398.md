# Villager garments stage 3 — plan against the current code (point 1398, revision 1)

Stage plan for skirtShort, skirtKnee, loinFlap, apron and girdleTails on driven column bones. Written against `main` at 84a3665a0. Sources: docs/garment-merge-r9-1347.md section 3 (the stage-3 list), the definitions it inherits from revision 2 ("Loose garments", B2 to B9 of round 2) and revision 3 (the deferrals B2 to B7, B9, B10, B18 to B20 with their round-3 objections in docs/garment-check-3-1347.md), docs/garment-merge-r10-1347.md (the amended pre-split, which landed). Procedure (point 1398): this plan goes to the cross-vendor break check until approved, then to the user, then to implementation. No file under `src/` changes before that.

Acceptance standard, unchanged from revision 9: visibly dressed at 3 m and 7 m in a port city and a village on both backends, judged in pictures. Per point 1339 no numeric penetration threshold is an acceptance gate; every measured row below is a detector with a named response.

Units: pipeline figure units (1 unit ≈ 1.3 m), H the stature, "mm" = 0.001 units, as in revisions 9 and 10.

## 1. What stage 1 left in the code

- `scripts/villager/shells.py` holds four shells, not five: trousers-waist (2), neckBeads-neck (1), neckBeads-chest (2), waistBeads-waist (3). The breast cloth left `SHELLS` on 01.11.2026 by revision 9's named response and returns in stage 4 (point 1399).
- The body is band-subdivided and cut by revision 10 (`VILLAGER_ASSET.bodySplit`, the split regression a gate outside the kneel family). The shipped body has about 13300 vertices.
- Runtime: `src/render/villagerShell.ts` (`buildShells`, `cutBodyIndex`, face masks, rims) and `gltfShellParts` / `gltfFigureGeometry` in `src/render/villagerFigureBody.ts`. Shell layers never reach `layerOf`.
- The five forms are still legacy: `garments.py build_form` (lines 464–477) builds loinFlap, apron and girdleTails from `girdle()` (a torus 0.008 H thick) plus two `tube` sweeps kept by angle at 8 rings, and skirtShort / skirtKnee from one `tube` sweep at 12 rings. `finish` pushes them out by 7 mm, transfers body weights and, for every form in `SKIRTS` reaching below the crotch, blurs the weights round each ring and folds shin into thigh (`skirt_weights`). That blur is why a swing leg leaves the hem and passes through it.
- There is no stage 2. Revision 3 moved the column bones from revision 2's step 2 to the start of stage 3; the stage numbers 3 to 5 were kept. This plan starts with them.
- The skeleton has 22 bones (`skeleton.py BONES`). The per-frame pose is written in `skinnedFigure.tsx`: `applyClipLayers` (idle, gait with `clipGaitPose` and its leg IK `correctLeg`, carry, dig, each through `toHung`), then `poseShoulders`, `leanTrunk`, `gazeHead`.

Baseline the stage is measured against (verification/villager-body/penetration-report.md, legacy rows, current main): skirtKnee "skin through the cloth" 0.1147 (jog frame 10, thigh.R, 643 frames), skirtShort 0.0359 (jog, thigh.R) and "cloth in the body" 0.0508; loinFlap, girdleTails and apron each 0.02–0.06 "inner garment through the cloth" under the chest cloak in dig; shell row three: waist beads through skirtKnee 0.0117 (2335 frames) and skirtShort 0.0095.

## 2. Defects in the inherited text and how this plan resolves them

- **E1 Panels over the waist beads.** Revision 9's rank table puts the loinFlap and girdleTails bands at rank 1 (6 mm) under the waist beads at rank 3 (12 mm). The bands do not overlap the beads (the bands sit at the girdle, hip + 0.06 H; the beads at hip + 0.013 H to hip + 0.027 H), but the panels hang over the beads. A panel whose rest radius were its band's offset would lie inside the beads. Today's row three already shows it for the skirts (0.0117). Resolution: revision 2's rule is restored and made explicit. A panel's clearance at a row is the larger of its own band offset and the highest offset of any worn shell whose region intersects the panel's height span, plus one step (section 3.9). Rank orders shells only; it never sets a panel's radius.
- **E2 Single outward tilt (check-3 B2).** Revision 2's "maximum of closed-form lower bounds" is withdrawn. The solve is a bounded sampled search over the feasible tilt interval with all constraints evaluated together (section 3.4).
- **E3 Hold-at-rest (check-3 B7).** A frozen hips cone under a still-legacy outer garment is not the legacy deformation and the legs walk through it. Resolution in section 3.11: the driver always drives; the legacy outer garment's ease is raised where the measured row says so; a combination the picture rejects keeps the inner form hidden under the outer one for that outfit.
- **E4 Row two saturated.** The stage-1 shell row two reports `hips in hips` on 6690 of 6690 frames for the trousers and the beads at exactly one offset. After revision 10's band subdivision the source's two-ring is about 1 cm wide, so the shell point finds its own neighbourhood beyond the ring. The row cannot name an inner-thigh contact in this state. Resolution: the exclusion becomes geodesic, every body triangle within 3 × the local offset of the source along the surface (section 3.14). This also answers the point's "any inner-thigh residual stage 1 recorded": none was recorded, because the row could not record one. The trousers pictures were accepted at the inner thighs in all walk crossings (points 1347 and 1398 sources). The repaired row is re-run for the trousers and its frames are judged.
- **E5 Nested driven garments (check-3 B6) are not generated.** Measured with `outfitCombos()` (revision 9 section 4): no outfit wears two of the five forms together, and wrapLong-waist stays legacy until stage 4. Stage 3 therefore has no driven-over-driven pair. A Vitest asserts this on the outfit enumeration. Stage 4 inherits the question with wrapLong.
- **E6 Hem deltas without formula differentiation.** Check-3 B10 asked to differentiate each hem formula. The plan instead rebuilds each driven mesh in closed form at every morph corner with a fixed topology and takes deltas as differences (section 3.8). That is exact at every corner and needs no per-formula derivation.
- **E7 New cut rows.** The bands need cut rows at girdle − 0.008 H and girdle − 0.02 H that revision 10's list lacks. They go through the band subdivision and the split-regression gate like every other cut.

No contradiction between revision 9 and the current code blocks the plan. The breast cloth's revert changes nothing for these five: they meet it only as a legacy garment above the girdle.

## 3. The plan

### 3.1 Column bones (skeleton, body, clips, export, asset)

- `skeleton.py`: a computed-head kind beside the MakeHuman-joint kind. 24 bones appended after the existing 22, so every existing index stays stable: `col.U.k` (parent `hips`) and `col.L.k` (parent `col.U.k`), k = 0..11 at `angles(12)` about the hips axis.
- `body.py`: `joints` and `joint_deltas` gain the 24 rows. Head of `col.U.k`: the girdle junction point at angle k (the band's bottom loop, section 3.3). Knee pivot (head of `col.L.k`): that head's x and z at the mean y of `shin.L` and `shin.R`. Ankle pivot (tail of `col.L.k`): the same at the mean y of the two `foot` joints. Deltas by the per-corner rebuild (section 3.8). `W` and `Wfull` gain zero columns for the body.
- `clips.py` / `export.py`: every clip's quaternion array gains identity rows; `write_clip` writes no channel for a column bone (the driver owns them). The glb carries the bones as ordinary nodes under `hips`; `extras.villager.columns` gives `count`, `segments` and the twelve angles.
- Runtime: `villagerAsset.ts` exposes `asset.columns` (null without one). Every loop over `asset.bones` that writes clip rotations skips column bones: `blendInto(asset, bones, asset.bones, …)` in the dig layer of `gltfClipLayers.ts` and any other whole-skeleton loop found by grepping `asset.bones`. A Vitest asserts that no clip layer touches a column bone.
- `cachekeys.py`: skeleton.py joins the body, clips and garments keys.

Landed alone this changes nothing visible: no vertex carries column weight yet.

### 3.2 Runtime-computed pivots (check-3 B18)

The hang (`hungHeads`) moves the shin and foot joints per person. Hips-parented column bones keep their rest heights, so their pivots would not meet the drawn knees. Rule: in `gltfPerson`, after `hungHeads`, the 24 column heads are recomputed in the hung rest. Upper heads: the hung positions of the junction loop at the twelve angles (from the baked person geometry, by source index). Knee pivots: upper head x and z at the mean hung `shin` y. Ankle pivots: likewise at the mean hung `foot` y. They are written into `frame.rest` before any garment is baked, so `bakePose` moves the panel vertices with their column heads. A DEV assertion checks |knee pivot y − mean hung shin y| < 1e-4 and the upper heads against the junction row within 1e-4 per person. The Python mirror in `gamepath.py` does the same after its hang bake.

### 3.3 Junction contract (check-3 B9)

Each of the five gets a waist band shell (section 3.12). Its bottom loop is the junction. One authoritative definition:

- **Position.** The panel's top row is the band's bottom offset row: the same source body vertices, the same offset × `person.frame.scale` along the same body normal. At runtime, `gltfFigureGeometry` writes the panel's row-0 positions from the built band (by source index), so pipeline and runtime cannot disagree there.
- **Weights.** The source body vertices' weights, as the band's.
- **Morphs.** The source body vertices' deltas, as the band's.
- **Motion the driver sees.** The band moves with spine, hips and thigh influence, not with hips alone. Per frame the driver skins the twelve junction points on the CPU with their actual weights (twelve four-bone blends) and sets each `col.U.k` translation so its head sits on that point. The column bones are therefore positioned at the boundary's actual motion, and rows 1 to 3 below the junction blend from the junction weights (fading 1 → 0) to the column weights.

The panel's angular grid is the junction loop's own vertex angles plus the inserted panel boundaries (section 3.10), so row 0 has a vertex for every loop vertex and nothing is resampled.

### 3.4 The driver and its solve (check-3 B2, B3)

New module `src/render/villagerSkirtDriver.ts`, stateless, one call per figure per frame. It is called in `skinnedFigure.tsx` after the last writer of hips and leg bones (`applyClipLayers`, `poseShoulders`, `leanTrunk`; `gazeHead` touches neither) and before the skeleton's matrices are updated. It runs only for a figure wearing a driven form. Input: the worn driven form, the posed world matrices of hips, thighs, shins and feet, the person's capsules (section 3.5), the ground in the figure's grounding frame (y = 0 as `gltfPerson` grounds), and the worn shells' offsets.

Each segment has one outward tilt angle θ in its column's radial plane about the hips frame, θ ∈ [0, θmax], θmax = 80°. The upper segments are solved first, then the lower ones (each lower segment hangs from its solved knee point). For each segment:

1. Candidates: θ at 10° steps over [0, θmax] (9 values), then refined twice about the best one at ±5° and ±2.5° (13 evaluations per segment, 312 per figure).
2. Each candidate is evaluated against all constraints together: the clearance target per capsule at three stations along the segment (section 3.6), the ground at every row the segment carries (section 3.7), and the chord to both neighbours' current solution.
3. The chosen θ is the smallest feasible one closest to the gravity target (rest hang θ = 0 for the upper segment; for the lower, the gravity blend of revision 2). With no feasible candidate, the one with the smallest worst violation is chosen and the shortfall counted.
4. A second pass with the neighbours' final angles re-evaluates each segment once. The neighbour tilt difference is limited to 60°.

The search is deterministic and bounded, enforces every constraint on each candidate at once and needs no monotonicity (B2). Cost estimate: 312 candidates × (7 capsules × 3 stations + rows on the ground) ≈ 7000 point-capsule tests per figure per frame. Measured in the closing perf suites; named response: coarse step 20° with three refinements, then skip the driver for figures outside the view frustum (they keep the last solution), never a different result at a different quality level.

### 3.5 Envelopes (check-3 B5)

Seven capsules per person: both thighs, both shins, both feet, the pelvis. Radius: over every drawn body vertex with weight above 0.1 on the bone, the maximum distance from the bone line, at rest after the hang. A thickness term is added: the largest offset of the worn shells. The pelvis capsule is clamped under the junction ring minus the clearance, so row 0 is feasible by construction. The attachment is exempt by construction, not by shrinking the body: row 0 is the band, which follows the skin (B3).

Containment is tested on the pose domain the driver actually sees (B5), not only on exported clip frames. A Vitest drives `applyClipLayers` + `poseShoulders` + `leanTrunk` through sampled runtime poses: walk, jog and sprint at three speeds each with stride warp, kneel down/hold/up, dig, carry, a start and a stop. It covers the adult man, the adult woman and the child. For each leg and pelvis triangle it checks the centroid and the three edge midpoints against the capsule union. Named response for a point outside: grow that capsule's radius to contain it plus 2 mm, recorded in the test, never by hiding.

### 3.6 Chord target and verification pass (check-3 B4)

Clearance target per column against a capsule: sqrt(C² + (c/2)²). C is the capsule radius plus the clearance of section 3.9 at that row; c is the chord to the farther neighbouring column after the current candidate. This bounds the chord's nearest point (revision 2's argument). It does not bound triangle interiors (B4), so after the solve a verification pass skins the panel's quad midpoints on the CPU: per row, between each pair of neighbouring columns, plus the hips-blended rows 1 to 3. It tests them against the capsules and the ground. A midpoint inside raises the tilt of the two columns of that quad by one refinement step (2.5°), once, and the pass re-verifies those quads. What remains is counted in a DEV counter and in the Python mirror's report row, never re-solved further. The pass and the correction are part of the driver, so the picture shows the corrected state.

### 3.7 Ground bounds (check-3 B3)

The ground constraint applies to every row a segment carries, in the grounding frame: the row point stays at y ≥ 2 mm. The junction lies above the ground in every clip pose, kneel included. So the upper segment always has a feasible horizontal or flatter candidate. For the lower segment, when no candidate keeps every row above ground (kneel, dig), the least-violation candidate is taken and the hem lies on the ground. That is a recorded residual, judged in a low-camera kneel and dig picture. Uneven terrain is not handled, as today. There is no "clamp horizontal" rule anymore, so nothing contradicts θmax.

### 3.8 Hem deltas (check-3 B10)

The driven builder is closed form with a fixed topology per form: rows, the angular grid and the panel boundaries are counts, not data-dependent. The junction loop's vertex count is fixed by the body. The pipeline builds each form at the basis body and at every morph corner (penetration.CORNERS and the nine shape morphs, as revision 10 solves its rest points). Each morph delta is the difference of the two builds. A hem at knee + c × H therefore inherits the knee's delta, mid-thigh the mean of hip and knee, front and back hems their own, exactly at the corners and linearly between, as every other morph is. Hand morphs carry zero deltas on the panels.

### 3.9 Per-form flare and ease (check-3 B20)

A row's rest radius at angle a is

r(row, a) = hull(row, a) + clear(row) + ease_form + flare_form × s(row),

- hull: the body's trunk hull radius at that height in the design pose (`Body.ring` / `ray_hull`; below the crotch the hull of both legs);
- clear(row): the larger of the form's band offset (base + rank × step) and (the highest offset of any worn shell whose region intersects [row, junction]) + one step. It is outfit-dependent, so it is evaluated at runtime as a per-row radial add along the row's rest direction, applied before the bake, from the worn set;
- s(row): the row fraction from junction (0) to hem (1);
- ease_form and flare_form: per form, never per rank.

| Form | ease (× H) | flare (builder units) | legacy ease / flare |
| --- | --- | --- | --- |
| loinFlap | 0.004 | 0.02 | 0.009 / 0.03 |
| girdleTails | 0.004 | 0.02 | 0.009 / 0.03 |
| apron | 0.005 | 0.025 | 0.009 / 0.03 |
| skirtShort | 0.008 | 0.03 | 0.012 / 0.035 |
| skirtKnee | 0.008 | 0.035 | 0.012 / 0.035 |

All five values per form are estimates, marked calibratable, in `src/config/balance.ts` (`VILLAGER_ASSET.drivenGarments`), read by the pipeline config like `bodySplit`. Because flare and ease are per form and no two driven forms are co-worn (E5), a later rank split cannot change a garment's shape (B20). The ease reduction against legacy is what takes the hems off the body (carried item 1).

### 3.10 Partial-panel grid (check-3 B19)

The cloth's angular grid is independent of the twelve columns. It is the junction loop's vertex angles (about 60 after revision 10's subdivision at the girdle; the builder asserts at least 36) plus the exact panel boundary angles inserted where they are missing. Panels keep the grid samples inside their interval, with the boundaries as their edge columns:

| Form | front panel | back panel | front hem | back hem |
| --- | --- | --- | --- | --- |
| loinFlap | abs(a) ≤ 0.5 | abs(a) ≥ π − 0.75 | hip − 0.10 H | hip − 0.10 H |
| girdleTails | abs(a) ≤ 0.5 | abs(a) ≥ π − 0.75 | hip − 0.14 H | knee + 0.05 H |
| apron | abs(a) ≤ 0.75 | abs(a) ≥ π − 0.9 | knee + 0.02 H | knee + 0.02 H |
| skirtShort | closed ring | — | (hip + knee) / 2 | same |
| skirtKnee | closed ring | — | knee − 0.015 H | same |

These are the legacy widths, openings and hems, kept. A grid vertex between two columns at angles a0 < a < a1 is weighted to those two columns by angular interpolation. Below row 3 it has no hips, thigh or shin weight. Rows are the sorted union of the form's hems plus the knee and evenly spaced rows at most 0.03 H apart. Front and back hems of girdleTails are separate rows.

### 3.11 Routing under legacy outer garments (check-3 B7; replaces hold-at-rest)

Generated combinations with a legacy outer garment reaching below the girdle (revision 9 section 4): skirtShort under a robe, loinFlap under a robe, skirtKnee and girdleTails under the both-shoulders cloak. Wraps do not co-occur with the five.

- The driver always drives. Under a robe the columns follow the legs. The robe's legacy hem follows its blurred `skirt_weights`.
- Penetration row "garment against garment" (section 3.14) measures the driven panel against the legacy outer cloth per frame. Named response, in order: raise that legacy garment's ease by one rank step (as revision 9's row three), re-measure, judge the picture.
- If the picture of a combination still shows the inner hem through the outer cloth after two steps, the inner form is not drawn for that outfit. It is hidden wholesale when the outer garment is closed below it (robe), not when it is open (cloak). That outfit's inner hem is then simply under the robe, as a wearer's would be. The rule is a per-combination table in the runtime, recorded with its picture, and ends when the outer garment migrates in stage 4 or 5.

### 3.12 Waist bands and seams (rim rule of revision 9)

New shells in `shells.py`, each with its region by height and `arm` ≤ 0.2:

| Shell | Rank | Region |
| --- | --- | --- |
| loinFlap-waist band | 1 | [girdle − 0.008 H, girdle] |
| girdleTails-waist band | 1 | [girdle − 0.008 H, girdle] |
| apron-waist band | 4 | [girdle − 0.008 H, girdle] |
| skirtShort-waist band | 4 | [girdle − 0.02 H, girdle] |
| skirtKnee-waist band | 4 | [girdle − 0.02 H, girdle] |

Each driven form is then two parts under one mesh name: the shell band (recipe in `extras.villager.shells`, built at runtime) and the panel mesh (an ordinary skinned glb mesh weighted to the body's junction bones and the column bones). Seams: no band region meets the waist beads (beads top hip + 0.027 H, lowest band row hip + 0.04 H), so no seam row is shared. The panels pass over the beads by E1's clearance. Against the trousers (not generated with these forms; forced outfits only) the rim rule of revision 9 applies unchanged: a rank-4 band over trousers emits one strip 15 mm → 9 mm; a rank-1 band inside the trousers' region is cut by the trousers and emits nothing. The rim-rule selftests and the shell-identity Vitest gain these pairs. The band's own bottom rim against skin is covered by the panel's row 0, which coincides with the band's outer row.

The body under a panel is not cut or hidden (revision 2: nothing is hidden under a driven panel), so legs and the inner thigh stay drawn through the openings and under the hem. mask.py gives the panels and bands an empty mask entry; they carry no `_COVER`.

### 3.13 Pipeline builder and migration

- New `scripts/villager/driven.py`: rows, grid, radius, weights (junction fade over rows 1 to 3, two nearest columns by angle), uv (angle × row fraction, as the legacy sweeps), per-corner rebuild deltas, the selftests of section 4. It is called from `build_garments` for the five. Their meshes skip `finish`, `push_out`, weight transfer, `unskin`, `surface_map` and `skirt_weights`.
- `garments.py`: the `build_form` branches for loinFlap, apron, girdleTails, skirtShort and skirtKnee are removed. The five leave `SKIRTS`. `GARMENTS` keeps every entry so the build order is unchanged. `girdle()` stays (its other caller, line 673). `skirt_weights`, `column_sweep` and `SKIRTS` stay for wrapLong, shirt, robe, toga and cloak (stages 4 and 5). wrapLong keeps its legacy branch in the shared `if` (the branch is narrowed, not deleted).
- `export.py`: panels export through `add_skinned_mesh` with the extended weight columns; bands as shell recipes. `extras.villager.driven` lists per form its panel mesh, band shell, rows (with the junction row's source indices), panel intervals and the per-form values used.
- Runtime: `gltfFigureGeometry` treats a driven form as band (via `gltfShellParts`) plus panel (via `layerOf`), writes the panel's row 0 from the band (section 3.3) and applies clear(row) (section 3.9). One merged geometry and one draw call per figure, unchanged.
- The legacy cover masks of the remaining legacy garments are recomputed (mask.py) because five garments leave the cover order. villagerGarmentMask.test.ts runs against the regenerated check json.

### 3.14 penetration.py rows (no gate)

- **Driven against the body.** The existing columns (cloth, shown, …) for the five, but on the driven pose: the Python driver mirror in `gamepath.py` poses the column bones per EXPORT_CLIPS frame at every corner after the hang and the clip, then the existing measurement runs. The legacy baseline rows of the five report `migrated`.
- **Garment against garment.** Each driven panel against (a) every worn shell under it (waist beads; trousers in forced outfits) and (b) every co-worn legacy outer garment over it, per frame: depth of panel points inside the outer cloth, or of shell points outside the panel. Named responses: (a) means clear(row) is wrong and is fixed in the builder (a selftest is added); (b) is section 3.11.
- **Ground.** Per frame, the lowest panel point below y = 0 in the grounding frame, with form, clip, frame and corner. Named response: judged in the low-camera kneel and dig picture; never an offset change.
- **Shell row two repaired** (E4): the exclusion becomes geodesic, 3 × offset along the surface. Re-run for the stage-1 shells and the new bands.
- **The `shoulders` pseudo-clip** (`with_shoulders`, carried item 3) stays in the measurement for the driven forms. The driver has no arm capsules, so a hand on the skirt in a shoulder pose is reported, not answered by the driver. The picture of the idle with shoulder pose decides.
- **Round trip.** villagerRuntimePose.test.tsx exports, per test outfit and frame, the worn list, the 24 column world rotations and translations, and sampled panel row positions. gamepath.py's mirror recomputes them within 1e-4. The DEV counters of sections 3.4 and 3.6 are compared with the mirror's report.

## 4. Carried items from point 1347 and the answer to each

1. **The child's hip cloth standing off all round (local/WindelLook.zip; the archive is not in this tree, so the situation is reconstructed from the user's description: child, loin flap, standing and walking).** Cause in the legacy build: a torus 0.008 H thick at the girdle, a tube with 0.009 H ease and 0.03 flare, then a 7 mm push-out, all relatively larger on the child's small hull. Answer: the band is a shell at 6 mm × scale on the skin (section 3.12), the panels start on its outer row, and ease falls to 0.004 H with flare 0.02 (section 3.9). The sides between the panels stay open, so no diaper ring forms. Re-shot as its own acceptance row (section 5).
2. **The legacy loin-flap girdle reading as a torus off the waist (1347 frames waistbeads-under-loinflap, collars-skin).** The torus is gone: `girdle()` is no longer called for these forms, and the band follows the skin like the waist beads, which were accepted in stage 1.
3. **The `shoulders` clip making these garments deeper than main's idle (skirtShort 0.0214 vs 0.0036, from point 1354).** The legacy rows are replaced by the driven rows. The driven panel follows the legs, not the arms, so a hand-on-skirt contact in that pose stays as information (section 3.14). Judged in the idle-with-shoulders picture of the skirt rows. If a hand visibly sinks into the cloth, the named response is an arm capsule pair for the lower arms in the driver (filed as one targeted follow-up, point 1339 rule 4).
4. **Pale blue-grey (WebGPU) / dark (WebGL 2) patches at the skirt hem where the leg passes (point 1380, verification/1380-figure-micro-walk-a/-b and their -webgl2 pairs; the named `…-walk-pair*` files do not exist, these are the nearest).** They are the leg passing through the hem, so the panel's inside is seen lit with the outside normal. Answer: the driver keeps the leg inside the panel (sections 3.4 to 3.6). The panel's inside, still visible from below and through the openings, is checked with the debug unlit material and back-face colouring on both backends. If an inner face reads wrong, the named response is the figure material's face-direction normal flip in TSL, verified on both backends. The 1380 frames are re-shot from the same framing.

## 5. Verification

**Pipeline selftests (driven.py, shells.py, penetration.py).** Fixed topology across corners (identical vertex and face counts per form at every corner). Panel row 0 equals the band's outer row within 1e-6 in rest space. Weight rows: sum 1, at most four nonzero, no thigh, shin or foot weight below row 3. Partial panels on the grid: every boundary angle present, interval widths equal to the table within one grid step, the front panel of loinFlap has at least four quads across. Hem rows at the formula heights at every corner (B10 by construction). clear(row) above the beads' offset plus one step wherever the beads' region meets the span (E1). The rim rule on the new band pairs with the trousers. Row two on a toy two-slab case with the geodesic exclusion. The driver mirror's solve on a toy capsule set: feasible, least violation, ground, determinism.

**Vitest.**
- No clip layer writes a column bone.
- Runtime pivots equal the hung landmarks per person (adult, child).
- Driver: determinism, θ within [0, θmax], neighbour limit, ground, no-feasible fallback, the second pass.
- Containment over the runtime pose domain (section 3.5).
- Panel row 0 equals the band's outer row after `gltfFigureGeometry` for each form.
- clear(row) responds to the worn set (beads on/off).
- The outfit enumeration has no co-worn driven pair (E5).
- villagerFigureBody.test.ts accepts band + panel for each generated pair.
- Shell identity for the new bands.
- The round trip with the mirror.
- villagerGarmentMask.test.ts against the regenerated json.
- villagerPenetrationReport.test.ts with the new rows.

**Picture acceptance** (`polish-villagers --section=garment-acceptance`, forced outfits, 3 m and 7 m, hausa-village and cairo, WebGPU and WebGL 2; new rows beside the stage-1 rows):

- per form (loinFlap, girdleTails, apron, skirtShort, skirtKnee): walk at the stride and at both leg crossings, side-on and front three-quarter; run, side-on; kneel hold, side-on and front, with one low camera at 1 m height; dig mid-stroke, side-on and rear three-quarter. Adult woman, adult man where the form is generated for men, and a child for loinFlap and skirtShort;
- WindelLook re-shot: girl and boy child with loin flap, idle and walk, front three-quarter and side, village, 3 m (carried item 1);
- loin flap and apron over the waist beads, walk, side-on (E1, carried item 2);
- skirtShort and loinFlap under a robe, skirtKnee and girdleTails under the both-shoulders cloak, walk, front three-quarter (section 3.11);
- skirtKnee walk from the 1380 micro-walk framing, both backends (carried item 4);
- idle with the shoulder pose for skirtShort (carried item 3);
- the trousers inner-thigh frames re-judged with the repaired row two (E4).

Judged for: a hem standing off the body, a leg passing through the cloth, an under-garment or back face showing through, the band reading as a torus, a crease at a panel corner, a hem sunk in the ground, flicker at a band seam, dark or pale patches at the hem. A surviving patch or flicker is traced to its mesh with the debug unlit material on both backends before it is classified. The final state of point 1398 is met when every row reads dressed on both backends and the legacy builders for the five are gone.

## 6. Risks to the game picture

- **R1 Side flare instead of forward swing.** One radial tilt per column makes a side column clear a forward-swinging thigh by tilting sideways. At 3 m a skirt may read as flaring outward in the stride. Named response if the walk picture shows it: a second (sagittal) angle per segment with the same search, cost doubled.
- **R2 Front-corner creases.** Neighbouring columns at very different tilts crease a partial panel's corner. Named response: sixteen columns (revision 2's fallback).
- **R3 Crowd cost.** 312 candidates per figure per frame on the CPU (section 3.4). Measured in the closing perf suites at the village crowd. Named response there, in order: coarser search, then frustum skip.
- **R4 Junction pop.** If the band and the panel's row 0 disagree, a crack opens at the waist. Ruled out by writing row 0 from the band at runtime; asserted in Vitest.
- **R5 Skinning of 46 bones.** The bone texture and uniform paths grow from 22 to 46 bones. Checked on both backends in the first sub-step, where nothing else changes.
- **R6 Kneel family.** Revision 10's split regression is reported, not gated, for the kneel clips (7.0–8.1 mm). The new band rows add cut vertices there. Judged in the kneel pictures.
- **R7 Robe and cloak combinations.** The legacy outer cloth may still be crossed by a driven hem; section 3.11's steps end in hiding the inner form for that outfit, which is a recorded simplification.
- **R8 Hem on the ground.** Kneel and dig lay the lower segment on the ground; accepted if it reads as cloth lying down at 3 m.

## 7. Landable sub-steps

Each sub-step is a commit series on `feat/1398-…`. It lands only with the cheap gate (tsc, lint, build, test:unit, the covering suite) and, where the picture moves, the both-backend picture of its rows. The owner may split the later sub-steps into their own points under the standing split rule.

1. **Column bones** (section 3.1, 3.2): skeleton, body, clips, export, asset, clip-layer exclusion, runtime pivots with DEV assertion, pipeline rebuild. Picture: unchanged idle, walk and dig against main on both backends (R5).
2. **Driver** (sections 3.4 to 3.7): TypeScript driver, Python mirror, envelopes and containment Vitest, round trip with no driven garment worn (columns posed, unweighted). No picture change.
3. **Driven builder with loinFlap and girdleTails** (sections 3.3, 3.8 to 3.10, 3.12, 3.13 for two forms): bands, panels, junction, E1 clearance, removal of their legacy branch. Pictures: their rows, WindelLook, the loin flap over the beads, girdleTails under the cloak.
4. **Apron.** Pictures: its rows, the apron over the beads.
5. **skirtShort and skirtKnee.** Pictures: their rows, the robe and cloak combinations, the 1380 framing, the shoulder idle.
6. **penetration.py rows** (section 3.14) with the repaired row two, routing table entries if section 3.11 needs any, reports refreshed, final picture pass over all stage-3 rows on both backends, review record.

## 8. Open questions for the break check

- Q1: Is one radial tilt per segment enough for the walk picture, or should the sagittal angle (R1) be in from the start?
- Q2: Is hiding an inner form under a closed robe (section 3.11, last step) acceptable as a temporary simplification until stage 4?
- Q3: Are the per-form ease values low enough for the child's loin flap without the panel touching the thigh in the stride? They are estimates, calibratable in balance config.
