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

The corrected lookup intersects cached face planes and tests triangle edges,
with only 1e-10 mesh units of shared-edge rounding. Independent Three.js mesh
raycasts test intermediate bearings, heights, scaling and yaw. At the same six
solved stands the nearest-triangle residual now ranges from -6.36 to -0.02 mm:
radial sphere tangency slightly intersects a sloping facet, leaving the hand
centre outside the stone. This shallow overlap is retained because it makes
contact; it is not a positive daylight allowance or a moved stone surface.

The exact flank also exposes unreachable direct approaches behind the existing
collider. Tappers try adjacent facets within 45 degrees of their station side;
arrivals use their existing neighbouring-bearing search for unreachable as well
as occupied stands. The final walking step is capped at the contact goal so a
10 FPS step cannot overshoot a millimetre-scale admission tolerance. Both holds
keep the solved position and body height; tap opening resets residual running
lean just as arrival opening already did.

Contact admission is now 2 mm. The browser bar for both complete holds and both
word frames is 5 mm: less than one pixel at the brief's approximately 150 px/m,
comprising 2 mm admission, less than 2 mm of hand-sphere facet loss (measured in
the unit test), and 1 mm rounding margin. This replaces the old nine-pixel bar;
the reviewer still owes a picture judgment at this bar. The Bambara cycle test
checks both holds every simulation frame, including their opening poses, body
height, facing, lean and eligibility for body separation. Low-frame-rate arrival
and station-side alternate-facet regressions cover the approach changes.

## Motion regression from the contact approach

Cross-vendor review reproduced a 0.3182579564% worst-child shuffle share at
Bambara seed 2972259115, against the unchanged 0.25% gate. Before editing
movement, the deterministic 200 s replay printed `shuffleWindows(paths)`:
child 3 had 38 bad windows (0.633333 s of 199 judged seconds); the worst began
at 105.033333 s, with 1.400000 m walked inside a 0.143595 m radius.

The child was in `regroup`, still approaching its downstream arrival stand.
It acquired that stand at about 103.33 s and retained it until contact at
106.30 s: x=-13.0304614073, z=-28.4096246422, bearing=0.7210718472.
This was neither a rejected stand nor repeated alternate-facet selection.
The reduced blocked-outward search was therefore not the cause of this window.
`moveChild` adds each achieved substep's displacement to `walked`, not the
requested distance; there was no distance-accounting error either.

The cause was clearance probing beyond a destination beside a collider.
`drive` capped the walking step at the stand, but `moveChild` still required
clear ground two child radii ahead for deflection and eight radii ahead to
release an obstacle-following heading. Those probes entered the stone beyond
the reachable stand. The child repeatedly turned away and circled the contact
spot. Tighter contact admission exposed this approach defect.

Contact approaches now pass their destination into `moveChild`; both probes
end at the remaining distance to it. The probes still check intervening ground,
the achieved step still checks static and body obstacles, and ordinary roaming
and running retain their existing lookahead. No contact or motion bar changed.
Two regressions at 60 and 10 FPS require direct, collision-free arrival beside
a stone with an inherited obstacle-following heading. Both fail without the
fix. Separate static-wall and body-wall cases assert that an obstruction before
the destination still keeps the child following its clear route around it.

All four 200 s river-layout motion cases pass. Their worst-child one-second
shares are now 0.0000% (Bambara/42), 0.0084% (Bambara/2972259115), 0.0168%
(Nubian/42), and 0.1256% (Mandinka/99). Child 3 in the reported layout has zero
bad windows. Its remaining worst child is child 1, with one window at 43.566667 s
(path 1.400000 m, out 0.349958 m). The burst and rescue gates also pass.

## Review: the blocked-outward search

Before changing any search or tolerance, replayed 78 bearing/seed cases against
Bambara's actual flank and **all layout colliders**: both ends, -90° through
+90° from the station bearing in 15° steps, seeds 42, 3791639114 and 2972259115.
An independent 1 mm ground search extended to the former 40 cm limit recovered
**zero** additional stands satisfying the unchanged 2 mm contact tolerance.
27 candidates are reachable already; 39 require more than the current 20 mm
search to clear ground, but every one of those fails contact afterwards.
For example, downstream at the station bearing clears at +32 mm, with a
32.161792 mm hand gap. Upstream clears at +3 mm, with a 2.961867 mm gap.
`rockTouchCollider.test.ts` preserves that measurement against real colliders.

The proposed search expansion therefore does not repair these measured cases.
`solveTouch` chooses the furthest touching stand; extending outward generally
loses contact even if it finds free ground. The search and contact allowance
have different purposes, but the search budget is not established as a defect.
Neither it nor the contact tolerance has been changed on this hypothesis.

## Review: finite arrival trace with a resting hand

The reported 129 finite readings cannot be produced by `arrival: null`.
`__placeArrivalHand` requires an opening recorded when an arrival utterance
was returned, and the sampler acquires only with `arrivalFor > 0` and that
opening at most 0.2 s old. A missing approach/hold instead yields no trace and
an infinite worst gap. The opening records the game event even outside hearing
range; `speakBankUtterance` correctly calls `gestureIfHeard`, which rests the arm
beyond the unchanged 10 m radius (point 580).

Reproduced without a browser, before modifying the sampler: Bambara layout seed
3791639114, all layout colliders, runner initially 2.1 m from the downstream
axis at +25° from the inward bearing. At 60 FPS it reaches a 1.360071 m stand,
with a **1.374307 mm solved contact gap**, but is **10.434405 m** from the
sampler's midpoint listener. The hearing-gated resting hand, measured through
Three.js hip/shoulder/hand pivots, is **66.054250 cm** off the drawn flank.
This matches the reported 66.0 cm scale without a failed approach. At 10 FPS,
the identical initial state selects an audible stand **8.815263 m** from the
listener. Both have valid contact holds. `bankGame.test.ts` preserves this
cadence-dependent choice and measures every frame of both nine-second holds;
a listener 4 m away sees contact throughout either hold.

This explains how different approach histories or frame timing in the full
pass can select an armless event where the isolated section selects an audible
one. It is a deterministic reproduction of that failure mechanism, not a claim
to have replayed the reviewer's exact browser history. The old output omitted
the arrival's hearing distance, so the two historical traces cannot establish
that last correspondence on their own.

The sampler now acquires the first fresh **audible** arrival opening, by its
existing `heardFrom` value. It does not select by arm state or contact gap.
Once acquired, identity, word-frame contact, worst whole-hold contact, duration
coverage and an in-hold photograph remain mandatory at the same 5 mm bar.
Unheard openings are counted in the result; the selected hearing distance is
printed. Missing audible contact still fails. Unit tests execute the actual
sampler block with unheard-then-heard readings, a heard but missing arm, bad
word-frame contact, later bad contact, and no audible event. This corrects the
hearing precondition without changing the game, geometry, movement or pose.
Full WebGPU/WebGL 2 passes and frame judgment remain the reviewer's work.
