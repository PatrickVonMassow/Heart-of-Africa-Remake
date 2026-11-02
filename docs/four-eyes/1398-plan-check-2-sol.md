--- GPT-6.1 Sol said ---
Reviewed the supplied material only. `penetration.py` is **TRUNCATED** during `shell_rows`; two further sections are omitted entirely. Runtime, export and cache changes therefore cannot be independently verified against their current implementations. References below identify sections and exact text in the unnumbered attachment.

“RESOLVED” assesses the revised specification, not completed implementation or passing tests.

| Finding | Status | Reason |
|---|---|---|
| B1 | RESOLVED | §3.12 supplies separate physical names, a logical record, reader changes and budgets. This addresses the attached `build_garments`, `cloth_names` and shell-recipe representation. |
| B2 | RESOLVED | §3.4 composes current transforms without stale `matrixWorld`, uses one figure frame and specifies parent-local conversion. |
| B3 | RESOLVED | §3.2 defines per-form rest heads before baking, including hung pivots and an identity-deformation test. |
| B4 | RESOLVED | §3.3 removes inserted junction vertices and defines anchors through frozen edge parameters and interpolation of independently skinned endpoints. |
| B5 | RESOLVED | §3.3 constructs attachments independently of drawn faces, addressing `shells.build` removing covered or hidden band geometry. |
| B6 | RESOLVED | §3.3 explicitly budgets four influences, validates the reduction and defines U/L blending. |
| B7 | RESOLVED | §3.8 freezes source identities, membership, rows, anchors and triangulation before corner evaluation. |
| B8 | NOT RESOLVED | §3.10 says the apron and girdleTails back reach the knee pivot, but their specified hems are **above** it: knee + 0.02 H and knee + 0.05 H. The knee-blend list contradicts the active-row contract. |
| B9 | RESOLVED | §3.8 defines the additive solve, mixed-morph comparison and distinction between exact hem heights and approximate radial fitting. |
| B10 | RESOLVED | §3.10 requires measuring the rendered legacy meshes before freezing widths. Its printed back-panel intervals nevertheless need the advisory correction C6. |
| B11 | RESOLVED | §3.9 restores the height factor, quadratic falloff and directional factor found in the attached `tube`, with child picture calibration. |
| B12 | NOT RESOLVED | Body-only capsules and excluding the own band address double counting, but the new clearance ramp is undefined when the first intersecting row is row 1; see C1. |
| B13 | RESOLVED | §3.5 specifies rendered vertices and interior samples, runtime pose mixtures, morph mixtures, toes and shared exported margins. This is sufficient sampling for the stated visual yardstick. |
| B14 | NOT RESOLVED | §3.5 substitutes a hips-rigid hull, but §§3.4–3.6 never test panel collision against that hull. Its claimed protection also assumes hips-rigid motion despite §3.3 explicitly allowing spine/thigh-driven anchor translation. Capsule-only repair cannot answer penetration into the hull-only portion of the pelvis. |
| B15 | NOT RESOLVED | §3.7 changes rendered geometry, but its grounding formula does not describe axial skinning of off-axis vertices, and R9’s child compensation is incomplete; see C4–C5. |
| B16 | RESOLVED | §3.4 replaces unconditional increments with bounded searches, final evaluation, repair rounds and reported residuals. The remaining triangle-repair defect is addressed under B17. |
| B17 | NOT RESOLVED | §3.6 adds actual triangle tests, but §3.4’s candidate scoring still considers stations, ground, chords and angle limits—not the triggering triangle collision. Re-searching with unchanged neighbours can select exactly the same failing solution repeatedly. The repair must reject or score those triangle hits. |
| B18 | NOT RESOLVED | State, replay and motion acceptance are specified, but the quantised relaxation can permanently retain a displaced hem at higher frame rates; see C2. |
| B19 | NOT RESOLVED | §3.15’s proposed second angle uses the existing tilt axis and therefore does not supply the promised independent motion; see C3. |
| B20 | RESOLVED | §3.11 provides a terminal cloak migration with a separate variant and validation. The owner’s supplied X1 decision authorizes that scope. |
| B21 | RESOLVED | §3.11 explicitly chooses assembly-time, outfit-specific ease, with matching mirror behaviour and affected/control picture rows. |
| B22 | RESOLVED | §3.11 requires motion, slit and below-hem inspection before omission, and one `effectiveWorn` path for assembly and measurement. |
| B23 | RESOLVED | §5 includes the dependent combinations in run, kneel transitions/hold, dig, blends and moving sequences after routing changes. |
| B24 | RESOLVED | §§3.16 and 5 cover all five forms and require necessary arm-clearance work within this point. |
| B25 | RESOLVED | §3.4 includes both view and shadow frusta, solving before re-entry, and renewed moving acceptance after performance changes. |
| B26 | RESOLVED | §3.1 explicitly names the new geometry inputs and invalidation tests. Current cache implementation is among the unavailable material. |

C1 | docs/garment-stage3-plan-1398.md | BLOCKING — §3.9 requires Δ to ramp “from 0 at row 1 to full at the first row whose span meets that shell’s region”; that first row can itself be row 1. For loinFlap, the junction is hip + 0.052 H and the hem hip − 0.10 H; six equal intervals satisfying §3.10 place row 1 at hip + 0.02667 H, already intersecting the beads’ top at hip + 0.027 H. Define this case explicitly instead of assigning both ramp endpoints to one row.
C2 | docs/garment-stage3-plan-1398.md | BLOCKING — §3.4 moves the previous angle toward gravity and then selects a sampled angle, retaining only the selected θ as state. At 120 fps, a collision-free θ = 30° targets 29.25°; 30° remains closer than 27.5°, so every frame selects 30° forever. Preserve accumulated relaxation or include a continuous relaxed candidate so cloth can settle across supported frame rates.
C3 | docs/garment-stage3-plan-1398.md | BLOCKING — §3.15 defines ψ as rotation “about the axis tangential to the ring at that column,” which is already the axis of §3.4’s outward tilt in that column’s radial plane. The rotations collapse to one angular degree of freedom; specify an independent motion axis before calling this the sagittal fallback.
C4 | docs/garment-stage3-plan-1398.md | BLOCKING — §3.7’s σ ratio assumes the complete top-to-row displacement scales, but axial bone scale scales only its axial component. The panel vertices are offset from the column axes and blend neighbouring columns, so the stated ratio does not generally put the lowest rendered row on the ground. Compute shortening against the actual skinned rows and re-evaluate them.
C5 | docs/garment-stage3-plan-1398.md | BLOCKING — §6 R9 compensates only `col.L`’s position for its parent’s axial scale. With upper scale S and a rotated lower segment R, the inherited linear transform contains S·R and generally shears the lower segment; translation compensation cannot remove it. Define how lower rotation/scale inheritance is handled and test simultaneous upper shortening and lower bending.
C6 | docs/garment-stage3-plan-1398.md | ADVISORY — §3.10’s back-panel ranges stop at π and omit the other half of each back panel. The attached `build_form` uses `abs(ang(i))`, retaining both sides of π. Print the complete wrapped intervals so the width table and its selftest do not prescribe half-width backs; retain the mandatory legacy-mesh measurement.

VERDICT: REJECTED

A1 | docs/garment-stage3-plan-1398.md | BLOCKING — B8 remains: §3.10 assigns knee-pivot blends to apron and girdleTails back despite both hems ending above that pivot.
A2 | docs/garment-stage3-plan-1398.md | BLOCKING — B14 remains: §3.5’s hips-rigid hull is absent from collision constraints and does not justify safety under nonrigid anchor motion.
A3 | docs/garment-stage3-plan-1398.md | BLOCKING — B17 remains: §§3.4–3.6 can repeat a triangle collision because repair candidates do not score the triggering triangle hit.
A4 | docs/garment-stage3-plan-1398.md | BLOCKING — C1: §3.9’s clearance ramp has coincident zero/full endpoints when row 1 already intersects the beads.
A5 | docs/garment-stage3-plan-1398.md | BLOCKING — C2: §3.4’s sampled relaxation can retain an elevated angle indefinitely at higher frame rates.
A6 | docs/garment-stage3-plan-1398.md | BLOCKING — C3: §3.15’s ψ duplicates θ’s tangential rotation axis.
A7 | docs/garment-stage3-plan-1398.md | BLOCKING — C4: §3.7’s grounding ratio does not match axial skinning of off-axis, blended panel vertices.
A8 | docs/garment-stage3-plan-1398.md | BLOCKING — C5: §6 R9’s translation compensation leaves inherited nonuniform scale shearing a bent lower segment.
A9 | docs/garment-stage3-plan-1398.md | ADVISORY — C6: §3.10’s printed back-panel intervals omit one side of each legacy back panel.
--- end ---

ask-lane: GPT-6.1 Sol (effort high) answered the audit in 296s — 9 entries
  A1 | docs/garment-stage3-plan-1398.md | BLOCKING — B8 remains: §3.10 assigns knee-pivot blends to apron and girdleTails back despite both hems ending above that pivot.
  A2 | docs/garment-stage3-plan-1398.md | BLOCKING — B14 remains: §3.5’s hips-rigid hull is absent from collision constraints and does not justify safety under nonrigid anchor motion.
  A3 | docs/garment-stage3-plan-1398.md | BLOCKING — B17 remains: §§3.4–3.6 can repeat a triangle collision because repair candidates do not score the triggering triangle hit.
  A4 | docs/garment-stage3-plan-1398.md | BLOCKING — C1: §3.9’s clearance ramp has coincident zero/full endpoints when row 1 already intersects the beads.
  A5 | docs/garment-stage3-plan-1398.md | BLOCKING — C2: §3.4’s sampled relaxation can retain an elevated angle indefinitely at higher frame rates.
  A6 | docs/garment-stage3-plan-1398.md | BLOCKING — C3: §3.15’s ψ duplicates θ’s tangential rotation axis.
  A7 | docs/garment-stage3-plan-1398.md | BLOCKING — C4: §3.7’s grounding ratio does not match axial skinning of off-axis, blended panel vertices.
  A8 | docs/garment-stage3-plan-1398.md | BLOCKING — C5: §6 R9’s translation compensation leaves inherited nonuniform scale shearing a bent lower segment.
  A9 | docs/garment-stage3-plan-1398.md | ADVISORY — C6: §3.10’s printed back-panel intervals omit one side of each legacy back panel.
