# Villager garment construction — analysis A

Blind analysis from `docs/garment-analysis-brief-1347.md`, the picture
inventory `docs/garment-inventory-1347.md` (pictures looked at: walk-cycle
az90-00/-01, motion az35-00/-21, game walk-pair, game bambara village), the
pipeline under `scripts/villager/`, the game side under `src/render/villager*`
and the dress rules of `design.md` §19.15.

## 1. What today's construction does, and why it produces the defects

Every garment except the rigid head pieces is made the same way
(`garments.py`): horizontal rings swept round the **convex hull of the body's
section** at each height in one design pose (below the crotch: the hull of
**both legs together**), eased off and flared; skin weights **transferred
from the nearest body point**, smoothed, blurred round the ring below the
crotch (`skirt_weights`); unposed into the rest; then `fit.py` pushes each
vertex out by **the largest push any frame of any clip asks for**, settles
it against the body and the inner layers at every body corner, and
`mask.py` hides or pushes in whatever body and inner cloth lies under it,
decided once for all poses.

Four mechanisms account for nearly every inventory bullet:

1. **Static cloth over moving legs (L, T below the crotch).** A cloth
   spanning both legs is skinned by linear blending of the two thighs (plus
   hips). The blend lies between the legs: when one thigh lifts, the front of
   a skirt, flap, apron or robe stays near the average and the lifted thigh
   passes through it (loin flap, apron, knee skirt, robe holes at
   thigh/shin in sprint, wrap tears, toga bag, kneel holes on every robe
   wearer). No rest offset can fix this — `fit.py`'s own header says so
   ("a static rest offset cannot follow a pose … the passes oscillate").
2. **The fit inflates the rest shape to the union of all poses (S).** Taking
   the per-vertex maximum push over every frame grows the cloth until it
   clears the most extreme thigh, arm or breast position, so in the ordinary
   pose it stands off all round: the short skirt's box ("diaper", wc az90-00
   #46/#54), the toga bag, the cloak's bulk and its breast bulges, the
   breast-cloth flange, the shirt's lump in dig. The convex hull adds to it:
   below the crotch the hull of both thighs is already a box in side view.
3. **Weights transferred from the nearest body point (L at the crotch, the
   trouser report).** A trouser leg's ring sits 1.6 % of stature off its own
   thigh; near the crotch the nearest body point of an inner-thigh trouser
   vertex can be the other thigh or the hips, and the smoothing then mixes
   them along the tube. I expect this is report (1): the game's legs swing
   further than the pipeline's clips (stride warped by two-bone IK in
   `villagerClipPose.ts`, the lean), so the inner/front panel of the swing
   leg's trouser stays with the hips or the other leg and the thigh and knee
   come out. The pipeline sheets (clips without IK) did not reproduce it —
   consistent with a weight error that only shows at larger flexion. It is a
   hypothesis; the acceptance shot must be a walking trouser wearer in game.
4. **The pose-independent mask (T, X).** A body or inner-garment vertex
   hidden in the build pose is hidden in every pose. Where the outer cloth
   moves off it (mechanism 1) the hole shows the dark inside (robe/toga
   kneel holes, cloak holes at the hip); where it stays drawn and pushed, it
   pokes through as islands (trouser patches on the robe, apron islands
   under the cloak, robe through the cloak, robe through the hood). The legs
   hidden under a robe also explain g-bambara [B] (a figure "without legs
   below the hem"). The mask is a repair of mechanisms 1–3, not a cause of
   its own, but it turns each cloth error into a visible hole.

The conclusion: the construction must make **"cloth outside body and
outside inner cloth" true by construction in every pose**, so that no fit,
no settle and no pose-independent mask is needed. Two constructions do
that, one per garment class, and they share one layering rule.

## 2. Tight garments: the body shell

**Construction.** A tight garment is a copy of the region of the **drawn
(decimated) body** it covers — trousers: hips below the girdle line, both
thighs, knees, shins to mid-shin; shirt/robe trunk: neck line to the girdle
plus the upper arms to above the elbow; breast cloth: the band from
`chestTop` to under the bust; hip band / girdle / waist beads: a band round
the hips; neck beads: the neck ring or the collar region; limb rings: wrist
and ankle bands; the veil: lower face and neck. The region is selected by a
per-vertex scalar (height along the bone axis, angle round it, distance from
a diagonal for one-shoulder edges) and **cut along its iso-line** (triangles
split at the boundary value), so hems are clean lines, not the body's
triangle sawtooth. Each vertex is offset outward along the body normal by
the garment's rank offset (§4).

**Skinning.** The shell vertex takes **exactly the four bone weights and the
morph deltas of the body point it was copied from** (barycentric at the cut
edges). It is built in the rest pose, so there is no unposing and no
transfer. Linear blend skinning then moves shell and body by the same
transform: the shell stays at its offset in every pose, every body corner
(sex, age, slight, stout) and every clip, including the game's IK and lean.
This removes mechanism 3 entirely and mechanism 2 for tight garments (no
fit, nothing grows).

**Silhouette.** A pure shell looks painted on. Two cheap allowances:
- *Hull fill on rigid trunk parts.* Where the region is weighted ≥ 0.9 to
  one trunk bone (chest, spine1), each horizontal section's vertices are
  pushed out to that section's convex hull (arms excluded) before the offset:
  a breast cloth or wrap bridges the cleavage instead of following it, still
  with the chest's weights, so it cannot open in any pose. Nowhere across a
  joint (the hull would re-introduce mechanism 1).
- *Ease and a hem lip.* Up to ~1 cm extra offset on convex parts (a loose
  tunic's chest, a trouser thigh), tapering to the base offset at concave
  creases (armpit, crotch, back of the knee), and a short rim strip at every
  open edge so the hem reads as cloth thickness and covers the body's edge
  row.

**Layering under a shell.** Body faces that lie entirely inside a shell's
source region are removed from the index while it is worn — **exactly**,
because the region is a set of body faces, pose-independent by construction.
The body's boundary row stays drawn under the rim. An inner shell under an
outer shell is cut the same way (the outer region minus a one-row margin).
No push class is needed for shells.

**Defects removed** (inventory references): trousers — robe/shirt patches,
the knee ball in kneel, the run grey patch (b-24), and report (1) if the
hypothesis holds; shirt torso — lump over the buttocks (the part above the
crotch; the knee-length hem is §3); breast cloth — the flange (m-00 #3, g-bambara
[A]/[B]/[D]); wrap-long-chest — the top edge gaping off the sternum;
neck beads (chest) — shell over the breasts and the jagged shoulder pieces;
neck beads (neck) — the loop in kneel/dig; waist beads and girdles — the gap
and tilt; limb rings — the stretched band (they copy the wrist/ankle weights
instead of a blend toward the hand); veil — the dark band at the neck (§5);
cape-chest — the flared collar (§3).

**Expected to remain or appear.**
- The body's own LBS artefacts are inherited: pinching at the knee in kneel,
  the hip crease in dig, candy-wrap at a twisted forearm. Since the body has
  them too, they read as the body's, not as cloth clipping.
- Shells self-intersect inside deep creases (back of the knee in kneel,
  groin in dig). Hidden inside the crease; acceptable at 3 m.
- Tight trousers read tighter than period cloth; wide Hausa/Bambara trousers
  lose their volume (ease is limited by the crease taper). A design
  question, not a defect — `OPEN` for the picture check.
- Shell edges follow the body's (decimated) resolution: on the child body a
  waist-bead or neck-ring band may be only one or two triangle rows high and
  look faceted.

**Cost.** Pipeline: seconds (region select, cut, offset; no fit, no settle,
no per-pose mask). Runtime: a shell has about as many vertices as the body
region it covers (trousers ≈ a third of the leg mesh; a robe trunk with
sleeves ≈ a quarter of the body), comparable to today's refined garments
(`garmentEdgeMax` 3 cm); the removed body faces cut fragment work. Still one
merged geometry and one draw call per figure. Effort: one new builder
(~250 lines Python), reusing `body.py`'s `surface_map`/morph binding.

## 3. Loose garments: hip-hung panels on a driven skirt rig

**Construction.** Everything that hangs free below the crotch — short and
knee skirts, the long waist wrap, the lower part of the chest wrap, robe,
shirt hem and toga, loin-flap and apron panels, girdle tails, the lower
cloak and cape panels — is a set of **columns hanging from a ring at the
girdle line**: the ring is the bottom boundary of the garment's shell (or a
shell band for a hip-only garment), so trunk and skirt are one welded mesh.
The rest shape is a cone with a small flare, round the hips' hull at the
girdle — **not** the hull of both thighs and with no per-pose inflation: in
the standing pose a short skirt touches the front of the thighs and the
buttocks with a few millimetres of ease.

**Skinning.** New bones: **12 columns round the hips × 2 segments** (short
and knee lengths use the first, long hems both; ~24 bones), each column's
head on the girdle ring, parented to `hips`. A skirt vertex is weighted to
the two nearest columns by angle and blends from `hips` (top ring) into the
column's segment(s) by height. No weight comes from the thighs or shins.

**The driver** (one pure function, TypeScript in the game, a Python mirror
in `gamepath.py`, held equal by the existing runtime round trip): per frame,
after IK and lean, in the hips' frame —
- upper segment of column φ (outward normal n): start from its rest hang
  direction; for each leg, if the thigh's direction has a larger component
  along n than the column's, push the column along n until it clears the
  thigh by the leg radius at that height plus the garment's ease; renormalise.
  The front columns therefore follow the more lifted thigh, the back columns
  the more extended one, the side columns their own leg;
- lower segment: the same against the shins, blended toward gravity (down in
  world) so a long hem drapes rather than standing out;
- leg radii per body corner from the morph weights (thicker for stout and
  female bodies), so the margin fits every body.

**Layering.** Every driven garment uses the same columns. An inner skirt and
an outer one (knee skirt under a cloak, trousers' shell under a robe) differ
only in their radial offset (rank, §4); a rigid rotation of a column moves
both by the same transform, so the order holds in every pose. Under a
driven garment **nothing is hidden**: the legs and inner garments stay
drawn, because the driver keeps the cloth outside them; hiding was what
produced the holes when the leg swung out under the hem.

**Defects removed.** Short skirt "diaper" box and its front hem ahead of the
thigh (wc az90-00 #46/#54, m-09/m-10) — report (2); the dig shelf of the
short skirt; loin-flap edge through the lifted thigh and the back flap off
the buttocks; apron side edge through the thigh, back panel off, the apron
islands under the cloak in dig; knee skirt double ring in dig and the hem
cutting the kneeling thigh; wrap tears and kneel holes (waist and chest);
robe holes at thigh/shin, the kneel side opening, the vertical front line,
the thigh.R marks, the hem patches of the in-game walk pair; toga bag and
kneel hole; shirt lump in dig; g-bambara [B] (legs no longer hidden under
the hem); Hausa dark spots and bulky shell (g-hausa [A]/[B]/[D]), if those
are robe defects as they look.

**Expected to remain or appear.**
- Ground contact: in kneel and dig a long hem goes into the ground where the
  real cloth would spread on it. Expected to read as cloth lying on the
  ground at 3 m; no ground clamp proposed.
- The envelope uses bone lines plus a radius, not the leg surface: in
  extreme hip abduction or a deep squat the side columns may graze the
  thigh's widest point; seen, if at all, as a short contact line.
- Chord shortening between two columns 30° apart with very different
  rotations (front up, side down in kneel) gives a visible crease at the
  front corners of the skirt. Acceptable; 16 columns if the picture says no.
- The girdle seam: at deep hip flexion the top of the thigh bulges in front
  under the hips-weighted top ring; a small thigh-top contact in dig is the
  likeliest residual of the whole proposal.
- Children's loin flap and apron front now swing up with the thigh — correct
  in run, but a lifted flap shows the inner thigh. Not a dress-rule breach
  (the hip layer stays on); judged in the picture check.

**Cost.** Pipeline: the skirt mesh and its weights are closed-form; no fit.
Runtime: ~24 extra bones per figure (bone texture grows from 22 to ~46
bones), the driver ≈ 24 small vector operations per figure per frame on the
CPU after the IK — negligible beside the IK and clip blending; vertex count
as today's skirts or lower. Effort: driver + mirror + round-trip test
(~150 lines each side), skeleton/export extension for the column bones, the
column pivot data in the glb extras.

## 4. One layering rule: per-form offset rank

Every garment gets an explicit **offset rank** (shell offset and skirt
radial ease grow with it): ornaments (waist beads, neck ring, limb rings) 0;
hip band, loin-flap/apron band, breast cloth, veil 1; trousers, short/knee
skirt, waist wrap 2; shirt, robe, toga, chest wrap 3; hood 4; cape, cloak 5;
baby sling rigid on top. Base offset ~3 mm plus ~3 mm per rank (calibratable
in `src/config/balance.ts`). The rank replaces the per-slot `LAYER` table:
the inventory's outfits #83/#85/#87 wear **hood and cloak together although
both are the "shoulder" slot**, so "one garment per slot" does not hold and
the inner/outer order of those two is undefined today (the red hood shows
through the blue cloak). Hidden faces are cut only under shells of a higher
rank (exact face sets, §2); a driven panel hides nothing (§3).

## 5. Outer garments over the arms, head pieces, ornaments

**Cloak (both shoulders, chest).** A shoulder yoke as a rank-5 shell over
shoulders, upper back, upper chest and the tops of the upper arms (exact
body weights, so a raised arm lifts it); from the yoke a **back panel and two
front panels**, open at the sides under the arms, falling to the knee: the
upper part weighted to chest/spine (a ruled surface from the shoulder line
down past the bust's front-most point, so on women it hangs as a plane
instead of carrying the breasts as bulges), the part below the girdle
blending into the skirt columns at rank-5 ease. The hanging arm swings in the
side gap, which is exactly its plane of swing: removes the forearm through
the side wall in walk, the hip holes in run, the bulges, the dig flare; the
inner robe/hood islands go with the exact rank order. Expected residual: in
dig the forearms reaching forward cross the front panels' edge; the open
sides show the inner garment (consistent with the seasonal-cloak rule of
§19.15, which keeps the period garment underneath).

**Cape-chest** (a short shoulder cape): a rank-5 shell over shoulders and
upper arms to above the elbow with a dropped hem lip — follows the raised
arm (removes the arm through the cape and the flared collar). Expected: it
stretches over a fully raised arm.

**Cape-rightShoulder** (San kaross over one shoulder): a diagonal shell band
from the covered shoulder to the opposite hip plus a short back panel on
chest/spine; removes the waist loop and the forearm through the sash.

**Cape-leftShoulder** (Maasai): built with the toga's construction (a
one-shoulder trunk shell with a diagonal top edge, skirt columns below) at
knee length; removes the bunched mass and the kneel/dig fold into the torso.
One builder fewer.

**Hood.** Head part rigid on the head as today (no defect there); the
shoulder part a rank-4 shell over shoulders and upper chest blending from
`head` through `neck` into the body's weights. Removes the robe/toga islands
through the hood (exact rank over the rank-3 robe shell).

**Veil.** A rank-1 shell over the lower face (from the nose line) and the
whole neck, continuing ~4 cm **under** the robe's or shirt's collar (rank 3
over it, its overlapped part cut). Both follow the same neck/chest weights,
so the dark band cannot open at any clavicle extreme; with the cloak the
veil sits under the yoke the same way. The uniform dark reading at 3 m is a
colour question, not construction.

**Baby sling.** Stays rigid; moved down to mid-back on `spine1` and against
the cloak's back panel, so in kneel and dig it no longer stands above the
shoulder.

**Rigid head pieces** (turban, cap, headband, head ring, topknot, hair bag),
the hair cap and the eyes: no defect in the inventory; kept as built today.

## 6. Migration

Removed (the old path is not kept beside the new one):
- `garments.py`: the ring/hull sweep builders for every body garment
  (`tube`, `Body.ring/outline/outline_down` as garment shapers,
  `column_sweep`, the form branches of `build_form` for hip, trunk and
  shoulder garments, `sleeve`), the weight transfer (`weights_at`,
  `weights_trunk`, `weights_on_arm`), `skirt_weights`, `smooth_weights`,
  `push_out`, `unskin`, `armholes`/`armhole_keep`, the `OUTER`/`SKIRTS`
  tables;
- `fit.py` entirely (fit over frames, settle, layer settle) and its
  `selftest*`; the garment keys of `cachekeys.py` that only the fit read;
- `mask.py`'s volume, motion and decision classes and the push class:
  the cover mask becomes the exact face sets of §2; `garmentPush` and the
  push half of `_COVER` go from `villagerGarmentMask.ts` (the hide half and
  `applyGarmentMask`'s index cut stay);
- the `garmentFit*`, `garmentSettle*`, `garmentMask*` values of
  `VILLAGER_ASSET` that only those steps read.

Kept: `body.py`, `mhbody.py`, `rig.py`, `clips.py`, `export.py` (plus the
column bones and their pivots), `gltfio.py`, `gamepath.py` (plus the driver
mirror), `sheets.py`/`inventory.py` (they pose the figure and must apply the
driver), the rigid head builders, `hair_cap`, `eyes`, `torus`/`blob` for
the rigid pieces, and `penetration.py` as information only — re-pointed at
the driven pose.

New: `scripts/villager/shell.py` (region, cut, offset, hull fill, rim),
`scripts/villager/skirt.py` (columns, weights), the game driver beside
`villagerRig.ts` (e.g. `villagerSkirtRig.ts`) called from the clip pose after
IK, its Vitest suite (envelope keeps every column outside both thighs over a
sweep of thigh angles; mirror equality), and the balance values (rank
offsets, column count, ease, leg radii factor) marked calibratable.

Order of work: shells first (trousers and breast cloth carry report (1) and
the flange), then the skirt rig with the short skirt (report (2)), then
robe/toga/wraps, then cloak/cape/hood, then the mask simplification and the
removals. Save break: none relevant (saves are irrelevant in the PoC).

## 7. Outfit restrictions

None of the generated combinations needs restricting: the rank order and
the shared columns resolve every layering in the table (§4 adds the hood
under the cloak). The rule of §19.15 "Open outer garments" stays enforced by
the generator as today. One build-time check instead of a restriction: two
worn garments of the same rank are a build error (none exist in the 158
outfits with the ranks above).

## 8. Acceptance pictures this proposal needs

Re-shoot in game, side-on at 3 m and 7 m: a walking and a running trouser
wearer (report 1 — the inventory has none), a walking and running child in
the short skirt, loin flap and apron (report 2), every robe/toga/wrap wearer
in walk, sprint, kneel and dig, the Tuareg cloak+hood+veil rows; plus the
pipeline motion sheets over all 158 outfits. Picture is the gate; the
penetration report is information.

## Decision list

A1 | diagnosis | The defects come from four mechanisms: hull-tube cloth across both legs blended between the thighs, the fit inflating the rest shape to the union of all poses, weights transferred from the nearest body point, and a pose-independent mask turning cloth errors into holes; the new construction removes all four instead of repairing them.
A2 | tight garments | Build every tight garment as a shell copied from the drawn body's region (iso-line cut, clean hems), offset along the normal, in the rest pose.
A3 | tight garments skinning | A shell vertex takes exactly the body's four bone weights and morph deltas at its source point; no weight transfer, no smoothing, no unposing.
A4 | tight garments silhouette | Allow hull fill only where the region is weighted ≥ 0.9 to one trunk bone, plus up to ~1 cm ease on convex parts tapering to the base offset at creases, plus a rim strip at every open edge.
A5 | trousers | Trousers become a shell (hips below the girdle, thighs, knees, shins to mid-shin); this is the fix for report (1), whose suspected cause is inner-thigh weights taken from the other leg or the hips.
A6 | breast cloth, chest wrap top | Shell band with hull fill between chestTop and under the bust; removes the flange and the sternum gape.
A7 | shirt, robe, toga trunk | Trunk and short sleeves as a shell (toga and Maasai left-shoulder cape with a diagonal top edge); the part below the girdle is a driven skirt welded to the shell's bottom ring.
A8 | ornaments | Waist beads, girdle bands, neck ring, chest neck beads and limb rings become thin shell bands with exact weights.
A9 | loose garments | Everything hanging free below the crotch is a cone of columns hung from the girdle ring, rest shape round the hips' hull with a few millimetres of ease and no per-pose inflation.
A10 | skirt rig | Add 12 column bones × 2 segments round the hips, parented to hips; skirt vertices weighted only to hips and the two nearest columns, never to thighs or shins.
A11 | skirt driver | One pure driver function per frame after IK and lean: each column's upper segment is pushed outward until it clears both thighs by leg radius plus ease, the lower segment likewise against the shins blended toward gravity; TypeScript in the game, a Python mirror in gamepath.py held equal by the runtime round trip.
A12 | short skirt / child hip cloths | Short skirt, loin flap and apron panels hang on the driven columns; this is the fix for report (2), the diaper box.
A13 | layering | Replace the per-slot LAYER table with an explicit per-form offset rank (ornaments 0, bands/breast cloth/veil 1, trousers/skirts/waist wrap 2, shirt/robe/toga/chest wrap 3, hood 4, cape/cloak 5); shell offset and skirt ease grow with the rank.
A14 | hood and cloak together | Hood is rank 4 under the rank-5 cloak; outfits #83/#85/#87 wear both shoulder-slot garments, so the one-per-slot assumption is dropped.
A15 | mask | The cover mask becomes exact pose-independent face sets: body or inner-shell faces inside a higher-rank shell's source region are cut; nothing is hidden under a driven panel; the push class and garmentPush are removed.
A16 | cloak | Cloak = rank-5 shoulder-yoke shell plus a back panel and two front panels open at the sides, upper part rigid on chest/spine as a ruled surface past the bust, lower part on the skirt columns.
A17 | cape-chest | A rank-5 shell over shoulders and upper arms to above the elbow with a dropped hem lip.
A18 | cape-rightShoulder | A diagonal shell sash from the covered shoulder to the opposite hip plus a short back panel on chest/spine.
A19 | cape-leftShoulder | Built with the toga construction at knee length; one builder fewer.
A20 | hood | Head part rigid as today; shoulder part a rank-4 shell blending from head through neck into body weights.
A21 | veil | A rank-1 shell over the lower face and the whole neck, continuing ~4 cm under the collar of the robe, shirt or cloak yoke.
A22 | baby sling | Stays rigid, moved to mid-back on spine1 against the cloak's back panel.
A23 | rigid head pieces | Turban, cap, headband, head ring, topknot, hair bag, hair cap and eyes stay as built today (no inventory defect).
A24 | expected residuals | Accept and judge by picture: inherited body LBS pinching, shell self-intersection inside deep creases, long hems entering the ground in kneel/dig, front-corner creases between columns, a small thigh-top contact under the girdle ring in dig, the tighter look of trousers (OPEN: wide-trouser volume).
A25 | pipeline removal | Remove the hull/ring sweep builders, weight transfer, smoothing, skirt_weights, push_out, unskin, armholes, OUTER/SKIRTS, all of fit.py, mask.py's volume/motion/push classes and the VILLAGER_ASSET fit/settle/mask values only they read.
A26 | pipeline kept | Keep body, mhbody, rig, clips, gltfio, export (plus column bones), gamepath (plus driver mirror), sheets/inventory (applying the driver), the rigid head builders, and penetration.py as information only on the driven pose.
A27 | cost | Pipeline drops from minutes (fit, settle, per-pose mask) to seconds; runtime stays one merged geometry and one draw call per figure, vertex count of the order of today, ~24 extra bones and ~24 vector operations per figure per frame.
A28 | balance values | Rank offsets (~3 mm base + ~3 mm per rank), column count, skirt ease and the leg-radius factor go into src/config/balance.ts marked calibratable.
A29 | outfit restrictions | Restrict no generated combination; keep the §19.15 open-outer-garment rule in the generator; add a build-time error for two worn garments of the same rank.
A30 | order of work | Shells (trousers, breast cloth) first, then the skirt rig with the short skirt, then robe/toga/wraps, then cloak/cape/hood/veil, then the mask simplification and removals.
A31 | acceptance | In-game side-on re-shots at 3 m and 7 m of walking and running trouser wearers and of children in short skirt, loin flap and apron, plus robe/toga/wrap wearers in walk/sprint/kneel/dig and the Tuareg rows, and the 158-outfit motion sheets; the picture is the gate.
