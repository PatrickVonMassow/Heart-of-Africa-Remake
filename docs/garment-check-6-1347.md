# Stage-1 garment plan — break check by GPT-6 Astra (step 4, round 6)

Checked docs/garment-merge-r5-1347.md (stage 1 only) with the round-5 objections, villagerFigureBody.ts, villagerGarmentMask.ts, body.py, garments.py, pipeline.py, export.py and fit.py attached. Raw answer: local/1347/check6.txt.

VERDICT: OBJECTIONS
B1 | docs/garment-merge-r5-1347.md | `waistBeads-waist` lacks the arm exclusion: its whole-body height cuts also select arm/hand cross-sections beside the waist, creating bead-coloured limb bands and removing the underlying skin. The legacy `girdle` explicitly excludes arms. Require `arm ≤ 0.2` in the waist-beads predicate, derive its rim rows from that restricted region, and verify that it emits only the waist component.
--- end ---
