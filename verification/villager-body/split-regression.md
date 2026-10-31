# Body pre-split: clip-frame regression

Every inserted vertex against the point of its parent triangle, and the centroid and edge midpoints of every split triangle against the split surface, posed along the game path through every exported clip frame at every body corner (scripts/villager/fit.py `split_regression`), against the band-subdivided uncut body (body.py `subdivide`). Figure units; the garments step fails above VILLAGER_ASSET.bodySplit.gateLimit in any clip but the kneel family (fit.py `split_gate`).

- inserted vertices: 2634, split triangles: 2576, posed frames: 6690
- worst inserted vertex: 0.00356; over 1 mm: 43; at 3 mm or more: 2
- worst split-triangle sample: 0.00249
- cut edges snapped to their nearer end: 2

| clip | worst cut vertex |
| --- | --- |
| carry | 0.00288 |
| carryIdle | 0.00272 |
| dig | 0.00261 |
| idle | 0.00271 |
| jog | 0.00285 |
| kneel | 0.00346 |
| kneelDown | 0.00305 |
| kneelUp | 0.00356 |
| sprint | 0.00279 |
| walk | 0.00296 |

Edges at 3 mm or more (inserted vertex: edge endpoints, worst):

- 9349: 4298-6371, 0.00315
- 9362: 4738-6919, 0.00356

## Shell rows with two far surfaces (junctions, closed per edge; information)

shells.selftest_body raises unless every seam edge face adjacency derives carries exactly one rim quad (shells.check_seams).

- g-neckBeads-neck+g-neckBeads-chest: g-neckBeads-neck loop 0 (181 vertices) sees ['g-neckBeads-chest', 'skin']
- g-neckBeads-neck+g-neckBeads-chest: g-neckBeads-chest loop 1 (506 vertices) sees ['g-neckBeads-neck', 'skin']
- g-trousers-waist+g-breastCloth-chest+g-neckBeads-neck+g-neckBeads-chest+g-waistBeads-waist: g-neckBeads-neck loop 0 (181 vertices) sees ['g-neckBeads-chest', 'skin']
- g-trousers-waist+g-breastCloth-chest+g-neckBeads-neck+g-neckBeads-chest+g-waistBeads-waist: g-neckBeads-chest loop 1 (506 vertices) sees ['g-neckBeads-neck', 'skin']
