# Villager garment construction — blind analysis brief

Identical input for two independent analyses (A and B). Neither analyst sees the
other's answer, any candidate solution, or any interpretation by the requester.

## Goal

Every outfit the game can generate looks dressed at the game's camera distances
(port city and village, first person) while walking, running, kneeling and
digging: no limb leaves its garment, no garment stands visibly off the body, no
inner garment or body shows through where it should not. The two user reports
are clean when re-shot: (1) a walking villager's swing leg leaves its trouser leg
behind, showing bare thigh and knee; (2) a child's hip cloth stands off the body
all round like a diaper. The old construction path is removed, not kept beside
a new one. No numeric penetration threshold is an acceptance gate; the picture is
(design.md §19.15 "Open outer garments", work-order point 1339).

## Inputs (read them yourself, read-only)

- `docs/garment-inventory-1347.md` — the picture inventory: every visible defect
  per garment and pose, the 158 generated outfits, the 31 garments and who wears
  them, the current penetration report (information only). Pictures:
  `verification/1347-inventory-*.png`.
- The current garment pipeline: `scripts/villager/` — `pipeline.py`,
  `garments.py`, `fit.py`, `mask.py`, `body.py`, `mhbody.py`, `rig.py`,
  `skeleton.py`, `clips.py`, `export.py`, `penetration.py`, `build.mjs`.
- The game side: `src/render/villagerFigureBody.ts`, `villagerGarmentMask.ts`,
  `villagerRig.ts`, `villagerClipPose.ts`, `villagerBody.ts`, and the outfit
  generator (find it from `scripts/villager/build.mjs inventory`).
- Dress rules: `design.md` §19.15 (the paragraphs "Covered upper body and hip
  layer" and "Open outer garments") and `docs/design-reference.md` §19.15.

## Question

Propose a garment construction for
- tight garments: trousers, shirts, sleeves, breast cloths, hip cloths, bands;
- loose garments: robes, togas, capes, cloaks, wraps, skirts;
- head pieces and ornaments where the inventory shows defects.

For each: the construction, how it is skinned/weighted, how layering
(inner/outer) is resolved, which inventory defects it removes, which defects you
EXPECT it to leave or introduce, its cost (pipeline time, runtime vertex/draw
cost, effort), and the migration from today's pipeline (what is removed, what
stays). Say also whether any outfit combinations should be restricted.

## Output form

1. A prose analysis (as long as it needs, no longer).
2. A decision list, one line per decision, in this exact form — your id prefix
   is given in your instructions:
   `X1 | <garment class or area> | <one-line decision>`
