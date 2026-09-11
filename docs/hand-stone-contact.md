# Hand contact measurement

Measured before changing contact numbers, on `7d30172c3539831020a18f0cb3dd15f6616fe1eb`:
`npx vitest run src/scenes/place/rockTouchContact.test.ts` reconstructs the
figure's Three.js hip/shoulder/hand pivots, applies the opening touch pose, and
measures the nearest triangle of the instanced play-rock geometry. Layout seed
42, station approach, no collider adjustment:

| Village | Upstream daylight | Downstream daylight |
| --- | ---: | ---: |
| Nubian | 47.96 mm | 0.48 mm |
| Bambara | 8.56 mm | 32.77 mm |
| Mandinka | 64.34 mm | 42.38 mm |

The solver reports zero gap in all six cases. Its hand centre agrees with the
scene pivots within 1e-12 m. The hand mesh uses `FIGURE_LIMBS.handRadius` at
`CHILD_FIGURE_SCALE`; the full touch pose uses the solver's 0.5 rad lean and
has no opening interpolation. These results isolate a further candidate:
`playRockSurfaceRadius` measures binned edge maxima, fills empty bins from
neighbours, and interpolates height rings. That surface can stand centimetres
outside the actual triangles. The live hand reader also uses this profile,
so its reported gap understates the visible gap. The existing 30 mm admission
tolerance can add further daylight before the gesture even starts.

The existing verification images were inspected; they show ground between
the reaching hand and the stone. New browser captures and whole-hold readings
belong to the reviewer; the author does not run browser suites.
