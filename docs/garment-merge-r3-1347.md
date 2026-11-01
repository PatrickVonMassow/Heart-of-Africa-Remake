# Villager garment construction — merged plan, revision 3, stage 1 (Fable 5.1)

Answers GPT-6 Astra's round-3 break check (docs/garment-check-3-1347.md) for stage 1 only and replaces the stage-1 part of docs/garment-merge-r2-1347.md. Stage 1 is revision 2's implementation steps 1 and 2 as the owner scoped them: gate removal, before pictures, outfit enumeration and rank table, the body pre-split, the shell builder with its runtime rebuild and round trip, and the migration of trousers, breastCloth, veil, neckBeads-neck, neckBeads-chest and waistBeads. The driven skirt rig, robes, togas, wraps, cloaks, capes, hood, head pieces, sling, limb rings and the final cleanup stay on their legacy builders and masks until their stage.

One scope decision this revision makes: the 24 column bones and their computed-head schema, which revision 2 placed in step 2, serve only the driver. Nothing in stage 1 reads them (shells copy the body's weights), so they move to the start of stage 3. The only schema groundwork stage 1 lands is the shell description in the glb extras and the cache keys that cover it.

Acceptance standard, applied throughout: visibly convincing clothing at 3 m and 7 m in the port city and the village, judged in pictures on both backends; the measured numbers are detectors with a named response, not a proof of zero penetration over every triangle interior in every pose. Where an objection asks for that proof, the answer says so and gives the proportionate check.

## 1. Round-3 objection answers

- **B1 (pre-split regression)** FIXED. The test no longer measures original vertices against the split surface. It measures, through every exported clip frame at every body corner, (a) every inserted vertex against the barycentric point on its parent original triangle, posed with the original weights, and (b) the centroid and three edge midpoints of every original triangle that was split, posed on the original, against the nearest point of the posed pre-split surface. The refit of a failing inserted vertex is non-negative least squares over its four bones with the sum constrained to one, fitted over a pose set available in the body step: the rest pose, the design pose, and rotations of plus and minus 45 and 90 degrees about two axes for each bone the vertex carries. The clip-frame measurement runs at the start of the garments step and is the detector of an inadequate sample set. Fallback when four bones cannot meet 1 mm: the edge is reported with its error; below 3 mm the vertex is kept as refitted; at 3 mm or more the iso-line snaps to the nearer endpoint of that edge, so the region boundary jogs by at most one body edge and no new vertex is inserted there. 1 mm is a detector threshold chosen under the camera distances, not a visibility claim.
- **B2, B3, B4, B5, B6** DEFERRED to stage 3 (tilt solve, infeasible attachments, panel clearance, envelope containment, nested driven garments all belong to the driver).
- **B7 (hold-at-rest routing)** DEFERRED to stage 3. In stage 1 no driven garment exists, so no routing is needed; every below-girdle garment keeps its legacy skinning.
- **B8 (cloak arm clearance)** DEFERRED to stage 5.
- **B9 (junction ownership)** DEFERRED to stage 3 and 5. A stage-1 shell's bottom row is a shell boundary with a rim strip, not a junction with columns.
- **B10 (hem morph formulas)** DEFERRED to stage 3.
- **B11 (legacy push composition)** FIXED. Revision 2 built shells from the body before `applyGarmentMask`. Revision 3 builds them from the composed body: `gltfFigureGeometry` applies the legacy mask (with the worn list filtered to legacy garments, since shells have no bit in `garmentMask.garments`) and then builds every worn shell from the pushed positions, offset along the composed body's vertex normal computed on the full body index before any face cut. A pushed source vertex therefore carries its shell with it, and a shell rim never stands off pushed skin. The identity test runs on the composed body for every test outfit. The mask module is not attached: if the push proves to be a shader displacement rather than a geometry edit, the shell vertex copies its source vertex's push flag so the same displacement applies to both. The pipeline mirror composes with mask.py's `pushed`, which already reproduces the game's push. Residual: under a legacy garment's push band the shell dents inward by the push depth, hidden under that garment's cloth; if a dent shows at a hem edge in the picture, the named response is to suppress the push on interior shell sources.
- **B12 (hull fill)** FIXED. The fill's boundary vertices are the breast cloth's own offset shell vertices at the two hull-touch points of each row, shared, not new. A fill face carries the breast cloth's bit plus the bits common to the body faces round both boundary vertices, so the face-cut rule applies to it unchanged. The fill region is decided once, on the adult-female corner shape mapped onto the drawn body through body['map'], since the basis body has no bust; on bodies without a bust the strip is nearly flat. The posed ruling is not proved to stay straight; penetration.py measures fill against body at every corner and clip frame, with the named response of a mid-ruling standoff parameter (default zero) raised until the measured depth is under the shell offset.
- **B13, B14** DEFERRED to stage 5. In stage 1 no shell takes an envelope offset, so per-layer shell builds are outfit-independent as claimed.
- **B15, B16** DEFERRED to stage 5.
- **B17 (waist beads vs trousers)** FIXED. "Inside any hip garment" is withdrawn. Rank orders tight shells; for driven garments, from stage 3 on, rank sets radius and the flare keeps a rank-3 band inside. The waist beads band is rank 3, outside trousers at rank 2: trouser faces whose bitmask lies inside the band's region are cut, the band is the exterior there, and it reads as a beaded belt. The band's own faces are never cut by a legacy garment (shells carry no cover attribute) and, from stage 3, never by a driven panel.
- **B18 (computed pivots through the hang)** DEFERRED to stage 3 with the column bones. The point stands and will be met there by computing the pivots at runtime from the hung heads.
- **B19 (partial-panel sampling)** DEFERRED to stage 3.
- **B20 (flare and ranks)** DEFERRED to stage 3 for flare. The stage-1 half, rank splits, is answered under defect D1: a split inserts a rank and never reorders existing ones.

**Defects found in revision 2 by this merger.**

- **D1 Same-rank overlaps among stage-1 shells.** Veil and neckBeads-neck both at rank 1 overlap over the whole neck. neckBeads-chest at rank 0 under breastCloth at rank 1 would have its lower rows cut by the breast cloth, inverting a collar worn over a top. New stage-1 ranks: neckBeads-neck 1, breastCloth 1, neckBeads-chest 2, trousers 2, veil 3, waistBeads 3. The neck band's lower boundary is set to the chest collar's top iso-line so the two never overlap. Full table in §2.
- **D2 Column bones in step 2.** Not needed by shells; moved to stage 3 (scope decision above).
- **D3 Body regression needed clips.** Revision 2 put the clip-frame regression in the body step, which runs before the clips step in pipeline.py. The refit now uses a pose set the body step owns and the clip-frame measurement runs in the garments step (B1).
- **D4 Shells as meshes.** Revision 2 left open whether a shell is a glb mesh. It is not: pipeline.py exports and masks only names starting with `g-`, and mask.py's `garment_names` builds the bit order from them. Shells are named `s-form-wear` in the garments cache so every existing filter excludes them, and the glb carries their description in extras. villagerFigureBody.test.ts, which holds every generated pair to a mesh, must accept a shell description for the six.
- **D5 Bit order shift.** Removing six meshes from the `g-` list shifts every later garment's mask bit. The runtime reads the order from scene.extras, so it stays consistent, but garment-mask-check.json and the mask cache rebuild; this is expected and recorded, not a regression.

## 2. The stage-1 plan

**Gate removal.** pipeline.py drops the `raise RuntimeError('penetration: ...')` after `P.report` and the docstring sentence "the run FAILS (exit 1) when any value exceeds the tolerance"; `report` keeps returning `bad` and `unchecked` and the step prints them. This is the point-1339 contradiction and lands first on its own.

**Before pictures.** Per migrating garment, one forced outfit per row in the acceptance list below, at 3 m and 7 m, both backends, village and port city, with the game's existing picture path. The dress sheets under verification/villager-body/ are kept as the pipeline-side before record.

**Outfit enumeration.** appearance.ts is not attached, so the enumeration is a step-1 task for the implementing session: list every generated (form, wear) pair and every co-worn combination from `appearanceFor`, and record it in this document. The check is: two co-worn garments of equal rank with overlapping regions. Resolution rule: insert a rank between the two, never reorder existing ranks and never forbid the combination.

**Rank table (stage 1).** Offset is base plus rank times step, both from balance config, defaults 3 mm and 3 mm.

| Rank | Garments |
| --- | --- |
| 0 | hairBag-crown (stage 5) |
| 1 | neckBeads-neck, breastCloth-chest, loinFlap and girdleTails bands (stage 3) |
| 2 | trousers-waist, neckBeads-chest, apron band, skirtShort, skirtKnee, wrapLong-waist (stage 3) |
| 3 | waistBeads-waist, veil-face |
| 4 | shirt, robe, both togas, wrapLong-chest (stage 4) |
| 5 | hood (stage 5) |
| 6 | capes and cloaks (stage 5) |

Rigid pieces have no rank: cap, headband, headRing, topknot, turban, limbRings, babySling. Hair cap and eyes are pipeline-only.

**Body pre-split.** A generic split tool in body.py cuts the decimated body along the level set of a per-vertex scalar restricted to a vertex set, inserting a vertex on every crossed edge with position, every morph delta and the full weight vector interpolated at the crossing parameter, then `top4`, then the refit of B1 where needed. Each split triangle becomes two or three with no hanging vertex. Stage 1 cuts these level sets, heights from `landmarks` on the basis joints with H the stature:

- girdle (hip + 0.06 H), whole trunk, and hip + 0.013 H and hip + 0.027 H (waist beads band)
- trouser hem knee − 0.5 (knee − ankle) on each leg's vertex set (leg weight over 0.5)
- chestTop and waist − 0.01 H (breast cloth), chestTop − 0.06 H and neck − 0.008 H (chest collar), neck + 0.002 H (neck band top), neck − 0.025 H and chin + 0.055 H (veil)
- the arm boundary, level set of summed arm weight at 0.2, for the breast cloth and both bead collars

Every body triangle gets a 32-bit region mask, one bit per stage-1 shell, set when all three vertices lie in that shell's height interval and vertex set. Later stages add their own level sets with the same tool; the body mesh changing then is cache-keyed like any other input. The face region masks ship in scene.extras.villager.shells.

**Shell builder (one recipe, two implementations).** Inputs: a body (positions, index, weights, normals), the shell's face set, rank, boundary rows and fill rulings. Output: a geometry whose vertex k has a source index into the body. Positions are source position plus offset along the body's area-weighted vertex normal, as body.py's `vertex_normals` and three's `computeVertexNormals` both compute it, taken on the full uncut body index. Weights, skin indices and, in the pipeline, morph positions are copied from the source. Each boundary row gets a rim strip: a ring of quads from the offset row down to an un-offset copy of the same body vertices, so a cuff or neckline closes onto the skin. The body's own boundary vertices stay in the drawn faces outside the region. uv is cylindrical about the hips axis, as `sweep` makes it, so any fibre pattern keyed by uv keeps its scale. The shell geometry passes through the same paint path (surface, second colour, fibre attributes) as a legacy garment geometry.

Fill is a separate strip only for the breast cloth: per body row between chestTop and the under-bust, the two hull-touch vertices (where the convex hull of the section, from `hull2d`, leaves the skin by more than the base offset) are the strip's shared boundary vertices; two intermediate vertices per ruling interpolate position, weights and deltas along it; shell vertices between the two touch points are not emitted and their faces are replaced by the fill. Fill is allowed only where both boundary vertices carry at least 0.9 on the chest bone.

Face cut, at assembly with the worn shell set: a body triangle is cut if its region mask shares any bit with a worn shell; a shell's triangle (its source triangle's mask, or a fill face's mask as in B12) is cut if that mask contains the bit of a worn shell of higher rank. Nothing is cut by a lower or equal rank.

**Data flow.**

- Pipeline: the garments step calls the shell recipe on the drawn body for the six, stores them under `s-` names with pos on the basis and morph positions as recipe differences per morph corner, so fit.py can take them as fixed inner layers of legacy garments as the revision-2 contract states (fit.py is not attached; confirming its inner-layer interface is a stage-1 item, and the `s-` prefix is the fallback that keeps them out of export and masks either way). export.py writes no mesh for them and adds `extras.villager.shells`: bit names, per-face region masks, ranks, boundary rows, fill rulings, and `kind: 'shell'` in `garments` meta for the six. cachekeys cover the shell module.
- Runtime: `gltfPerson` is unchanged (morph bake, hang, grounding, scale, `stylisePeaks`, `restBounds`). `gltfFigureGeometry` takes the whole layers list, applies `applyGarmentMask` with the legacy worn list, builds each worn shell from the composed body through the TS implementation of the recipe, cuts faces, paints, merges. One geometry and one draw call per figure as today.
- Round trip: villagerRuntimePose.test.tsx's export gains the composed body positions and every worn shell's positions for the test outfits per frame. gamepath.py recomputes the shells from the exported body positions and compares within 1e-4 as `runtime_check` does for joints (an exact test of the recipe), and separately computes them from its own drawn body with a `stylisePeaks` mirror written from villagerBody.ts and reports the difference as a detector of the full chain.

**Migration of the six.** Each moves as a whole mesh in one commit. Today's builders for reference: trousers are a seat tube from the girdle to hip − 0.08 H plus two 16-column leg tubes from hip − 0.04 H to the hem with 0.016 H ease; the breast cloth a six-ring hull tube chestTop to waist − 0.01 H; the veil ten rings neck to chin + 0.055 H; the chest collar six rings chestTop − 0.06 H to neck − 0.008 H; the neck beads a torus at neck − 0.012 H; the waist beads `girdle` at hip + 0.02 H. After migration: trousers are the body region girdle to hem on both legs at rank 2, with the body's own crotch and seat and no hull tube; breast cloth the region chestTop to waist − 0.01 H without arms at rank 1 with the fill; veil the region neck − 0.025 H to chin + 0.055 H round the whole head at rank 3; chest collar the region chestTop − 0.06 H to neck − 0.008 H without arms at rank 2; neck beads the band neck − 0.008 H to neck + 0.002 H at rank 1; waist beads the band hip + 0.013 H to hip + 0.027 H at rank 3. Bands are a rank step thick and read flat, a recorded residual. `finish`, `push_out`, weight transfer, `unskin` and `surface_map` are not called for these six; they stay for the legacy forms. GARMENTS keeps the six entries so the order of `build_form` output is unchanged for everything else.

**Legacy garments over and under the shells.**

- Over shells: shirt, robe, toga and wrapLong-chest over the breast cloth and collars; hood over the veil and collars; every outer piece over everything; shirt over trousers; loin flap, apron, girdle tails and skirts over the waist beads. Legacy garments keep their body masks; they cannot mask a shell, so the inner masks that today hide bead and trouser vertices under a robe or a flap are lost and the shell is drawn whole inside the legacy garment. The legacy fit treats the shell as a fixed inner layer; the settle alone keeps it inside. This is the known stage-1 risk: trousers through a walking robe, beads through a flap. It is measured by new penetration rows (below) and judged in the robe-over-trousers and flap-over-beads pictures; the named response if a shell shows through is to raise that legacy garment's ease by one rank step until stage 3 or 4 migrates it.
- Under shells: the waist beads under trousers (B17) and the neck beads under the veil, both by rank with the lower rank's faces cut under the higher. No legacy garment is worn under a stage-1 shell.
- Body mask under shells: a body vertex both hidden by a legacy garment and cut by a shell's bit is simply absent; a body vertex pushed by a legacy garment carries its shell with it (B11).

**Tests.**

- Pipeline selftests, run where `F.selftest` and `MK.selftest_volume` run: the split tool on a toy triangle (interpolation, non-negative normalised four weights, region bits); the shell recipe on a toy mesh (offset equals base plus rank times step along `vertex_normals`, rim strip closes onto the un-offset row, cut rule for body, shell and fill faces).
- Garments step: the B1 clip-frame regression over EXPORT_CLIPS at every CORNERS corner, reported per edge with the 1 mm and 3 mm thresholds.
- penetration.py gains, without a gate: shell against body per frame (must read exactly the offset; any other reading means the rebuild or mirror is broken) and legacy garment against each co-worn shell. Legacy rows keep their baseline comparison and must be unchanged within the report's noise.
- Vitest: shell identity on the composed body for every test outfit (vertex equals source plus offset times normal, rim rows at offset zero); face cut completeness (every body face in a worn region is cut, no face outside one is); bit-order agreement between `garmentMask.garments` and the glb; the extended round trip; villagerFigureBody.test.ts accepting shell descriptions; villagerGarmentMask.test.ts against the regenerated check json.

**Picture acceptance (3 m and 7 m, both backends, village and port city, forced outfits).**

- trousers alone, walk and run, side-on and three-quarter, adult man and child
- trousers under shirt and under robe in walk (the lost inner mask)
- breast cloth in walk and dig, front-on, adult woman at the stout and slight builds
- veil with and without a hood, and with a cap, in idle with the head turned
- chest collar and neck beads over bare skin and under a robe neckline, idle
- waist beads under a loin flap and under an apron in walk, and over trousers in walk

Judged for holes, cloth reading as skin, beads reading as a torus, dark marks, and a hem or neckline standing off the skin. A surviving dark mark is traced to its mesh with the debug unlit material on both backends before it is classified.

## 3. Left for later stages

- Stage 3: column bones with runtime-computed pivots (B18), the driver with its solve, envelopes, chord target, ground bounds and verification pass (B2 to B6), hem deltas (B10), partial-panel grid (B19), per-form flare and ease (B20), hold-at-rest routing (B7), junction contract (B9), migration of skirtShort, skirtKnee, loinFlap, apron and girdleTails, penetration.py re-pointed with garment-against-garment and ground rows.
- Stage 4: trunk shells plus driven hems for shirt, robe, both togas and both wraps; delete `tube`, `sleeve`, `armholes`.
- Stage 5: cloaks and capes with arm clearance (B8), hood shell, head envelopes and outfit-dependent offsets (B13, B14), sling (B15), limb rings (B16), hair bag, `finish_rigid`; delete `column_sweep`, `skirt_weights`, `OUTER`, `SKIRTS`, `RIGID_HEAD`, `RIGID_CHEST` and the per-slot layer table.
- Stage 6: delete fit.py, `finish`, `unskin`, the mask classes, the body cover export, the runtime push and hide; move calibratable values to balance config; after pictures and the full sheets.
