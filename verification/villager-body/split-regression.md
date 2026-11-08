# Body pre-split: clip-frame regression

Every inserted vertex against the point of its parent triangle, and the centroid and edge midpoints of every split triangle against the split surface, posed along the game path through every exported clip frame at every body corner (scripts/villager/fit.py `split_regression`), against the band-subdivided uncut body (body.py `subdivide`). Figure units; the garments step fails above VILLAGER_ASSET.bodySplit.gateLimit in any clip but the kneel family (fit.py `split_gate`).

- inserted vertices: 3199, split triangles: 3076, posed frames: 6690
- worst inserted vertex: 0.00267; over 1 mm: 41; at 3 mm or more: 0
- worst split-triangle sample: 0.00183
- cut edges snapped to their nearer end: 11

| clip | worst cut vertex |
| --- | --- |
| carry | 0.00173 |
| carryIdle | 0.00173 |
| dig | 0.00149 |
| idle | 0.00100 |
| jog | 0.00226 |
| kneel | 0.00259 |
| kneelDown | 0.00227 |
| kneelUp | 0.00267 |
| sprint | 0.00157 |
| walk | 0.00100 |


## Shell rows with two far surfaces (junctions, closed per edge; information)

shells.selftest_body raises unless every seam edge face adjacency derives carries exactly one rim quad (shells.check_seams).

- g-neckBeads-neck+g-neckBeads-chest: g-neckBeads-neck loop 1 (181 vertices) sees ['g-neckBeads-chest', 'skin']
- g-neckBeads-neck+g-neckBeads-chest: g-neckBeads-chest loop 1 (515 vertices) sees ['g-neckBeads-neck', 'skin']
- g-trousers-waist+g-neckBeads-neck+g-neckBeads-chest+g-waistBeads-waist+g-trousersLong-waist+g-shoes-feet+g-boots-feet: g-neckBeads-neck loop 1 (181 vertices) sees ['g-neckBeads-chest', 'skin']
- g-trousers-waist+g-neckBeads-neck+g-neckBeads-chest+g-waistBeads-waist+g-trousersLong-waist+g-shoes-feet+g-boots-feet: g-neckBeads-chest loop 1 (515 vertices) sees ['g-neckBeads-neck', 'skin']
