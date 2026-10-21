# Body pre-split: clip-frame regression

Every inserted vertex against the point of its parent triangle, and the centroid and edge midpoints of every split triangle against the split surface, posed along the game path through every exported clip frame at every body corner (scripts/villager/fit.py `split_regression`), against the band-subdivided uncut body (body.py `subdivide`). Figure units; the garments step fails above VILLAGER_ASSET.bodySplit.gateLimit in any clip but the kneel family (fit.py `split_gate`).

- inserted vertices: 2946, split triangles: 2888, posed frames: 6690
- worst inserted vertex: 0.00628; over 1 mm: 28; at 3 mm or more: 6
- worst split-triangle sample: 0.00331
- cut edges snapped to their nearer end: 2

| clip | worst cut vertex |
| --- | --- |
| carry | 0.00181 |
| carryIdle | 0.00165 |
| dig | 0.00220 |
| idle | 0.00158 |
| jog | 0.00279 |
| kneel | 0.00612 |
| kneelDown | 0.00547 |
| kneelUp | 0.00628 |
| sprint | 0.00240 |
| walk | 0.00181 |

Edges at 3 mm or more (inserted vertex: edge endpoints, worst):

- 10494: 3403-6784, 0.00540
- 10514: 3826-7476, 0.00588
- 10526: 4246-5703, 0.00365
- 10528: 4246-9197, 0.00628
- 10530: 4247-5704, 0.00368
- 12696: 1817-3486, 0.00310

## Shell rows with two far surfaces (stage-1 selftest failure, reported)

- g-neckBeads-neck+g-neckBeads-chest: g-neckBeads-neck loop 0 (167 vertices) sees ['g-neckBeads-chest', 'skin']
- g-neckBeads-neck+g-neckBeads-chest: g-neckBeads-chest loop 1 (496 vertices) sees ['g-neckBeads-neck', 'skin']
- g-trousers-waist+g-breastCloth-chest+g-neckBeads-neck+g-neckBeads-chest+g-waistBeads-waist: g-neckBeads-neck loop 0 (167 vertices) sees ['g-neckBeads-chest', 'skin']
- g-trousers-waist+g-breastCloth-chest+g-neckBeads-neck+g-neckBeads-chest+g-waistBeads-waist: g-neckBeads-chest loop 1 (496 vertices) sees ['g-neckBeads-neck', 'skin']
