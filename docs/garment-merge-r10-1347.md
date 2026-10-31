# Villager garment construction — revision 10, stage 1: the body pre-split amended

Amends docs/garment-merge-r9-1347.md (revision 9). Revision 9 still applies except for its **Body pre-split** paragraph and the reference of the split regression. Both are replaced below. Revision 10 also says how the garments that stay on the legacy builders are tailored. Owner decision of 21.10.2026 (board): option 3 (band subdivision) with option 1 (snap to existing edges) as a local fallback. The trigger is GPT-6 Astra's eight-pass review of the stage-1 implementation (sha 5db35da, P1: "the weight refit optimizes a different deformation from the renderer"; "body subdivision does not preserve the animated surface").

Units: as in the pipeline, figure units (1 unit ≈ 1.3 m). Below, "mm" means 0.001 units.

## 1. Why revision 9's pre-split cannot work

Revision 9 inserts each cut vertex on an edge of the 6000-triangle body and refits its four weights. In the game the vertex is drawn by the hang bake and then the clip skin (gamepath.Person.draw). On main, the surface between the edge's two ends is the straight chord between the two drawn end points. A single rest point with four blended bones bends with its bones, so it leaves that chord by about t(1 − t) × the turn between the end points' blends × the edge length. On the back and the hips, the parent triangles are 11–18 cm long and span chest, spine1, spine and hips. Measured along the game path:

| Variant (worst inserted vertex against its parent triangle) | hung | idle | walk | jog/sprint | kneelUp |
|---|---|---|---|---|---|
| Revision 9 as built (sha 5db35da) | 9.6 | 9.3 | 14.8 | 23.7 | 63.0 |
| Refit along the drawn path, rest point and shape deltas solved so the hang bake is exact | 0.0 | 9.3 | 16.1 | 25.3 | 62.2 |
| Lower bound: weights fitted to the 669 real clip frames themselves (adult man) | — | — | — | — | 35.5 (all clips) |
| Lower bound: weights and rest point fitted to those frames (worst 12 vertices) | — | — | — | — | 15–30 |

So no choice of weights or rest point reaches a few mm on the coarse body. The cut rows stand off the flat coarse triangles around them: by 8.4 mm on the back in idle, and outward when the back bends. That is the lighter, rougher rectangle in the frame 1347-accept-trousers-cross-r-man-rear-cairo-3m. It is also the likely cause of the legacy regressions (review P1, passes 7 and 8).

## 2. The amended pre-split

**Band subdivision (new, before any cut).** body.py subdivides the decimated body in a band around every cut of revision 9's list. The band holds the faces whose cut-scalar range overlaps [c − δ, c + δ], with δ = 0.05 on `y` and 0.1 on `arm`, restricted to the cut's height interval when it has one. In the band, every edge longer than `lmax` = 0.015 whose weight change times length (Σ|ΔW| · length) exceeds `tau` = 0.002 is split at its midpoint. This repeats until no band edge qualifies (at most 8 rounds). A face with one, two or three split edges becomes two, three or four triangles with winding kept and no hanging vertex. A neighbour outside the band takes the split of a shared edge. A midpoint vertex takes the midpoint of its edge's positions, of every morph delta, of the full weight vector and of `tri_uv`. Its weights are not refitted. `body['map']` is extended by `surface_map` as for the cut. The region scalars are then taken from the subdivided body (`region_scalars`), and revision 9's rules for them apply from there on. Measured: 5998 → 20766 triangles, 3001 → 10385 vertices before the cut, about 2950 cut vertices. The four values are balance config (`VILLAGER_ASSET.bodySplit`), calibratable.

**The reference is the subdivided, uncut body.** The cut and its regression are measured against this body, not against main's coarse surface. `body['split']` records it (`pos0`, `W0`, `tris0`, morphs), and `fit.uncut` returns it.

**Cut (revision 9's split tool, refit replaced).** The cut vertices are inserted as in revision 9: position, morph deltas, region scalars and weights interpolated, and the cut scalar set to c. Then:

1. Weights: four bones out of the six heaviest interpolated ones, non-negative and summing to one. They are least-squares fitted so the clip skin of the vertex's hung point follows its parent triangle's point, drawn with the reference corners' weights along the game path (bake, then skin). The pose set is the design pose plus, for each carried bone, turns of ±reach and ±reach/2 about two axes across the bone. The reach is set per bone to about what the clips turn it: trunk, hips, neck and head 25°, shoulder 20°, thigh 60°, shin 90°, foot 40°, toe 30°, upper arm and forearm 60°, hand 40° (balance config).
2. Rest point and shape deltas: at each of the ten body corners (penetration.CORNERS), the rest point the corner's hang bake takes exactly onto the parent point is solved for; the bake is affine per vertex. The basis and the nine shape-morph deltas follow from the ten corners: each corner adds its morphs to the adult man, so the system is square. Hand-morph deltas stay interpolated. So at every corner the hung body carries every cut vertex on the reference surface. In the A pose, which the game never draws, a cut vertex may sit off its edge.

**Snap fallback (option 1, local).** After the refit, any cut vertex whose worst residual over the refit pose set exceeds 3 mm is snapped, provided both ends of its edge are reference vertices. The cut is redone with that edge's crossing moved to the nearer end: that end's cut scalar is set to c and no vertex is inserted on the edge. A snap that would carry the end across another cut level of the same scalar is refused and left to the gate. A snapped end keeps its position, so its `y` scalar is no longer its rest height; it carries the level value, like a cut vertex. Measured: 2 of about 2950 cut vertices snap.

**The regression becomes a gate.** `fit.split_regression` measures every cut vertex against the reference through every EXPORT_CLIPS frame at every corner. The garments step fails above 3 mm in any clip except the kneel family (kneel, kneelDown, kneelUp). The kneel family is reported in split-regression.md. Its named response: the frame is judged in the picture at 3 m and 7 m, and a visible step is answered with a smaller `lmax` or a snap, never by hiding. Measured with the values above, over all ten corners: hung 0.0, idle 1.6, walk 1.8, jog 2.9, sprint 2.9, carry 1.8, dig 2.3. Kneel family: 7.9, 7.0 and 8.1.

## 3. Legacy garments (review P1, passes 7 and 8)

The legacy garments are tailored, fitted and settled on the reference, which is the subdivided uncut body, through `fit.uncut` as commit a158e2dc4 introduced. They are not tailored on main's coarse body. The cut body differs from the reference by at most the gate's 3 mm outside the kneel family. So a legacy garment meets under it the body it was settled against, without the refit's or the arm contour's cut corners that a158e2dc4 kept away from it.

The reference differs from main's coarse body where the band bends instead of staying flat. Subdivision vertices against main's parent triangle: hung 23, idle 18, walk 62, jog 73. The largest values are in the 30-cm leg triangles of the hem band; on the back they are 9.6 in idle and 23 in walk. The legacy cloth is therefore retailored on the new body, and its numbers are not expected to equal main's. The acceptance for P1.2 is the runtime penetration report's legacy rows: each within noise of main's value, or better. A worse row is answered with the picture of its frame. The legacy cover masks are recomputed on the cut body as before.

## 4. Cost and tests

The shipped body grows from 3001 to about 13300 vertices (20766 → about 27000 triangles). The bake is CPU-side per person, and the GPU skins the merged figure. The glb grows by the new vertices' attributes and sparse morph deltas. The runtime is judged in the picture and in the perf suites of the closing run, not here.

Tests, in addition to revision 9's:
- Pipeline selftest on a toy mesh: subdivision conformity (no hanging vertex, winding kept, one to three split edges); exact hung bake of cut vertices at the morph corners; snap of a forced edge (no vertex inserted, end scalar at c).
- Vitest on the committed asset: in the hung adult man and woman (`gltfPerson`), every cut vertex lies within 1 mm of its parent point on the reference surface. The reference corners are vertices of the shipped body (the cut appends after them). The pipeline writes each cut vertex's parent reference triangle and barycentrics to verification/villager-body/split-parents.json, which the test reads.

## 5. Amendment 31.10.2026: midpoint skin weights from the source surface

Section 2 let a band midpoint take the mean of its edge's ends' weights. That blends the far joints of a long edge into the midpoint: a mid-shin midpoint took about a quarter thigh weight from the knee end, and in the held kneel it sank 33–46 mm under the ground (src/render/villagerKneelGround.test.tsx red on the branch, main −21…−7 mm).

A midpoint's skin weights are now read off the MakeHuman surface at its nearest point, as build_body reads a decimated vertex's (body.py `on_surface`). Its position and morph deltas stay the ends' means, so the reference surface is unchanged. The shell regions are still classified on the mean weights, so the regions and their boundary loops stay as approved. Moving the midpoints onto the source surface as well was tried and dropped: it split g-neckBeads-chest into four boundary loops, and a rest-pose shading map of the back showed the same steps at y 0.84 and 1.0 with and without it, so it does not remove the back rectangle of 1347-accept-trousers-cross-r-man-rear-*-3m. That frame stays open for a picture comparison with main.
