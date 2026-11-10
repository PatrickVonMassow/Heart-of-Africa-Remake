# LOW preset price check, part 1: hardware-independent arithmetic

Input: `docs/bench/310-f8-digest.md` (the deposited F8 reports). Calibration
target: the WEAK DESKTOP rows (WebGPU, AMD RDNA-3, 2195x1235 CSS px at dpr 1.75,
real GPU timestamps). The S25 is the second target; the M1 is context only. No
new run on a user machine is possible; part 2 (a before/after F8 run of the same
three phases at LOW on the verification host, judged by its RELATIVE drop) is the
owner's.

## 1. Rendered pixels (the `dprCap` lever)

| dpr | Pixels per frame (weak desktop) | vs. old LOW |
| --- | --- | --- |
| 1.75 (native, medium/high) | 8,301,902 | 3.06x |
| 1.0 (old LOW) | 2,710,825 | 1.00x |
| 0.8 (new LOW) | 1,734,928 | 0.64x |

The cut removes 975,897 pixels per frame (36 %).

## 2. Why pixels, not triangles, price the desert

At old LOW the desert drew 245,565 triangles in 55 calls for 14.81 ms GPU; the
savanna drew 687,076 in 58 calls for 8.65 ms — 2.8x the geometry at 58 % of the
cost. The dpr ablation (baseline dpr 1.75 to dpr 1, pixels / 3.06) moved the GPU
median / 2.77 (savanna), / 2.91 (desert), / 3.10 (driving): GPU time follows the
pixel count almost one to one. The per-system shares in section 4 are shares of
TRIANGLES; they are never milliseconds, least of all in the desert.

## 3. Projected weak-desktop LOW GPU median at dpr 0.8

Three readings of the measured pixel-to-time relation, each fitted on the same
phase's dpr ablation and applied to that phase's old-LOW median:

- proportional: t x 0.64;
- elastic: t x 0.64^e, with e = ln(GPU ratio) / ln(pixel ratio);
- linear with a fixed part: t = a + b x pixels fitted through the two ablation
  points; the fixed share a / t(dpr 1) stays, the rest scales by 0.64.

| Phase | Old LOW GPU ms | e | Fixed share | Proportional | Elastic | Linear + fixed |
| --- | --- | --- | --- | --- | --- | --- |
| desert-standing | 14.81 | 0.955 | 7.2 % | 9.48 | 9.67 | 9.86 |
| savanna-standing | 8.65 | 0.911 | 14.1 % | 5.54 | 5.76 | 5.98 |
| savanna-driving | 9.63 | 1.012 | 0 % (fit -2.1 %) | 6.16 | 6.13 | 6.09 |

The desert projects to 9.5-9.9 ms on every reading: at or below the 10 ms target,
against 14.81 ms (89 % of the 16.70 ms budget) before. Caveat: the ablation was
measured with post-processing on, LOW runs without it; the proportionality is
assumed to carry over, which part 2 must confirm by its relative drop (expected
about -33 % to -36 % GPU in each phase).

## 4. Triangles the geometry levers remove (per system)

Identified by naming every travel system (the F8 report attributes each mesh to
its nearest named ancestor). The constant "(unnamed) MeshStandardNodeMaterial"
425,118 tris / 180 meshes was NOT the river water. Recomputed from the code at
LOW (terrain refinement off):

| System (new F8 name) | Meshes | Triangles | Share of the 425,118 |
| --- | --- | --- | --- |
| `travel-terrain` (13x13 chunks at 56/28/20 segments + skirts) | 169 | 352,832 | 83.0 % |
| `travel-sea` (sea plane 180x180) | 1 | 64,800 | 15.2 % |
| `travel-rivers` ribbon (2,938 axis rows) | 1 | <= 5,876 | <= 1.4 % |
| `travel-rivers` lake sheets + `travel-region-borders` | 9 | ~1,600 | ~0.4 % |

So a coarser river-ribbon tessellation could remove at most ~2,900 triangles
(0.7 % of the system); it was not built (see the open items). The 215-mesh
"(unnamed) MeshStandardMaterial" row now splits into `travel-places`,
`travel-landmarks` and the river waterfalls and springs.

`floraDensity` 0.6 thins only the non-collidable dressing (bush, rock, termite
mound, dead tree, papyrus). Recomputed on the real placement (seed 1, LOW spawn
radius 173 wu, triangles per instance from `src/render/flora.ts`):

| Phase | Flora tris before | after | Removed | Removed share of flora |
| --- | --- | --- | --- | --- |
| savanna (-2.5, 34.0) | 266,984 | 243,812 | 23,172 | 8.7 % |
| desert (23.0, 15.0) | 90,808 | 73,948 | 16,860 | 18.6 % |

The bench run's own seed differs, so these are shares, not the report's
absolute rows. The collidable trees (jungle 216, acacia 130, baobab 174 tris
each) carry most of the savanna flora and stay; thinning them is an open design
decision because the collider must not depend on the graphics level.

## 5. The S25 is a different case (stated separately)

The S25 is NOT pixel-bound: its dpr ablation cut the pixels 6.89x but the GPU
only 1.46x / 1.85x / 2.21x. Old-LOW pixels 261,300 at dpr 1, new 167,232 at 0.8.
No millisecond projection is made from the pixel cut for this device; expect a
modest GPU drop at most. Its LOW CPU median (8.70 / 7.50 / 7.60 ms) sits as high
as its GPU (9.83 / 8.72 / 6.95 ms). The F8 report carries no per-system CPU split,
so the CPU saving of `offscreenBehaviourInterval` 3 cannot be stated in
milliseconds: if ambient wildlife behaviour costs W ms per frame and a share f of
the animals is off-screen and in no drama, the saving is W x f x 2/3. Part 2
should read it on the CPU series of the savanna phases (the desert holds few
animals), where a drop rather than a rise must show.

## 6. M1 (context only)

Its absolute GPU milliseconds aggregate passes; on its frame series the dpr
ablation took the desert from 44 to 14 ms frame median, consistent with a
pixel-bound frame. No projection is made for it.
