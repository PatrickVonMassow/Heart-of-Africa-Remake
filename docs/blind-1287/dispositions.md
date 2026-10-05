# Dispositions of the blind union (south-reach camera)

Every entry of `union.json` (41) is either **fixed** or shown **unaffected**
with evidence. Counts: **fixed 8**, **unaffected 33**.

Three measured facts carry most of the "unaffected" verdicts. Each is a test:

- **C — camera-relative invariance.** Pose and aim move south together; the
  tilt, height and fov are unchanged (`followCamera.test.ts` "keeps the tilt
  unchanged"). The picture is the old one translated south by the zoom-scaled
  shift, so everything measured *from the camera* (fog per pixel, near/far
  planes, CSM cascades, label depth, per-pixel framing) is unchanged.
- **F — farthest reach shrinks.** The frame's farthest ground point from the
  traveller only comes closer (16:9, zoom 1: 65.1 → 61.4) at every aspect
  9:16…21:9 and zoom 0.125…2.5, at compensation 0.5 and 1
  (`followCamera.test.ts` "shrinks the frame's farthest ground reach…"). A
  traveller-centred ring that cleared the old frame still clears the new one.
- **N — nearest edge widens.** The frame's nearest edge from the traveller only
  moves out (16:9, zoom 1: 20.5 → 28.0; same test). "Close to the traveller"
  is in the picture in more directions than before.

Plus **P — projection gates.** Spawns, despawns, guarantees and frame shutters
go through the live projection (`frameVisibility.ts` `pointOnScreen`,
`__camera.onScreen`), never a radius; they follow any camera pose by
construction.

| id | verdict | evidence |
|----|---------|----------|
| U1 | fixed | `followPose` shifts position AND aim by the same zoom-scaled amount (`followCamera.ts:84`); tilt test in `followCamera.test.ts` "keeps the tilt unchanged". |
| U2 | fixed | The follow point is unchanged; the shift enters pose and aim from the same follow state (`TravelScene.tsx:3117`); the constant-angle tests of point 1286 still pass, and the shift is not part of `stepFollow`, so the snap rule never sees it. |
| U3 | fixed | Mount/remount (`TravelScene.tsx:2815`) and per-frame (`:3117`) both pass the shift; a jump snaps through `followAt` into the same `followPose`. `__camera.settled` now includes the shift (`:2900`), so the verify settle waits end on the shifted pose (flow/enrichments/frameSubject use it). |
| U4 | unaffected | Flora edge = fog far + 30 around the traveller. Every in-frame ground point north of the camera-traveller bisector is nearer the traveller than the camera, and the camera moved 7.5 further from the visible ground (C); the visible rim stays at or beyond its old camera distance. With F, the circle covers the frame wherever it did. |
| U5 | unaffected | Same as U4; F holds at every zoom up to 2.5 (test), so the zoom-scaled shift never pushes the frame past the circle. |
| U6 | unaffected | Low-preset claim at zoom ≤ 0.5: farthest frame reach at zoom 0.5 is 30.7 (was 32.6) against the ~173 circle (F). |
| U7 | unaffected | VEGETATION_HIDE_ZOOM 2.5: farthest frame reach at zoom 2.5 (16:9) 153.5, was 162.8 (F), against FLORA_RANGE_MAX coverage 15 × 24 = 360. |
| U8 | unaffected | Window ±6 chunks (`TravelScene.tsx:173`, ≥ 132 units) around the traveller against the 61.4 farthest reach at zoom 1 (F); the newly shown south strip (≤ 28) lies in rings 1–2, built first by the nearest-first order. |
| U9 | unaffected | Refine rings ≤ 4 (≥ 96 units) cover the whole zoom-1 frame (≤ 61.4, F) before and after; the south strip (≤ 28) is in ring ≤ 2, the 56-segment base ring. |
| U10 | unaffected | Far sheet only at zoom > 1 (`TravelScene.tsx:882`); at zoom ≤ 1 the ≥ 132-unit window covers the ≤ 61.4 frame (F). |
| U11 | unaffected | The traveller-anchored target only sets the light DIRECTION (position − target is the constant SUN_DIR·130); CSMShadowNode fits its cascades to `camera.matrixWorld` (`three/examples/jsm/csm/CSMShadowNode.js:540`, `_updateShadowBounds`), so they follow the camera (C). |
| U12 | unaffected | Ranking and declutter depth are measured from the camera (`ActorLabels.tsx:118`, `:131`) — "nearest the viewer" per design §17.8 and `actorLabels.ts nearestActors`. By C an actor at a given pixel has the same camera distance as before; the cap and priority act on the picture unchanged. |
| U13 | unaffected | Vicinity seeding probes 14 fresh bearings per frame and keeps only an off-screen anchor and an off-screen SPREAD disc (`Wildlife.tsx:1505`, `:1520`) — P; its ring is around the SETTLEMENT (radius 75, distMax ~53), and F/N leave the off-screen share of that ring essentially unchanged (the footprint is the same shape translated). Dry shore: P at `Wildlife.tsx:1588`. Covered by the invariants pop-in suite and the enrichments settlement-vicinity section. |
| U14 | unaffected | The dry-shore bank is the nearest OFF-screen bank within 40 (`Wildlife.tsx:1563`, `:1588`) — P; "in the traveller's view" means the drinkers drift into view, which N makes more likely (south strip now in frame). |
| U15 | unaffected | Wildlife spawn/despawn rings are 100·zoom + margins around the traveller (`Wildlife.tsx:907`); F: the frame never reaches beyond 61.4·zoom. The render cap ranks by distance from the traveller, which the shift does not change, so it keeps exactly the same animals as before. What changes is which of them are in frame: the guaranteed in-frame circle grows from 20.5 to 28 (N), and every visible point lies within the frame's farthest corner, which came closer (F). A saturated cap therefore drops animals beyond a radius that covers no less of the frame than before; whether the cap can saturate inside the frame is unchanged by this point (Astra review pass 1, P2, answered). |
| U16 | unaffected | Flora rebuild origin and nearest-first fill stay around the traveller; the kept set is unchanged by the shift. The dropped plants are the farthest from the traveller, and the farthest visible ground came closer (F), so a fill that covered the old frame covers the new one; a fill that saturates inside the frame did so before too (Astra review pass 1, P2, answered). |
| U17 | unaffected | Live callers pass `!isOnScreen` (`Wildlife.tsx:4342`, `:6133`, `:6187`); spawn starts at 100·zoom + out, beyond the ≤ 61.4·zoom frame (F), and P pushes it further if needed (`wildlifeBehavior.ts:1068`). |
| U18 | unaffected | Despawn requires off-screen AND past viewR with the predicate (`wildlifeBehavior.ts:1108`), which every live caller passes; the predicate-less fallback runs only without a travel camera. |
| U19 | unaffected | Probe returns the first OFF-screen ring point (`wildlifeBehavior.ts:1997`) — P; rings run to offstageR = 100·zoom + margin, beyond the frame (F). |
| U20 | unaffected | `keepStreamedAnimal` keeps anything on screen (`wildlifeBehavior.ts:2039`) — P; the despawn ring (100·zoom + 60) exceeds the frame (F). |
| U21 | unaffected | Overtime counts only while off-screen (`Wildlife.tsx:5982`) — P; leaving via the 100·zoom ring is beyond the frame (F). |
| U22 | unaffected | Calf/cub pick is nearest-first within 45 of the traveller (`Wildlife.tsx:804`); the pick itself is unchanged. Its visibility was never guaranteed beyond the in-frame circle: before, a calf 25 units south was out of frame; now a calf 32 units north is (Astra review pass 1, P2). The guaranteed circle grows from 20.5 to 28 in every direction (N), so the pick is in frame in strictly more cases; no check depends on a farther pick being visible. |
| U23 | unaffected | Flock circles at radius 4.5 + 0.9·i (`Wildlife.tsx:6145`), far inside the 28-unit north reach; seen in the comparison frames' scale. |
| U24 | unaffected | `driveOffDistance` 24 is a distance between two fighting animals anywhere on the map (`balance.ts:1668`), not a frame relation; the fight's frames are shot through the projection shutter (P). |
| U25 | fixed | The enter hint now sits 10 % of the viewport below the traveller's projected row (`src/ui/enterHintPlacement.ts`, `Hud.tsx` Prompt); tests `Hud.test.tsx` "anchors the enter hint just below the traveller…" and `followCamera.test.ts` closed-form row; flow check measures from the traveller row (`flow.mjs:247`). |
| U26 | unaffected | The pop-in check is the live projection (`invariants.mjs`, `__camera.onScreen`); with N/F the reach is now ~28 both ways, so a northward drive tests the same reach a southward one would. Covered by the invariants suite run. |
| U27 | fixed | Pop findings now carry the picture row `ndcY` beside the traveller distance (`invariants.mjs:143`). |
| U28 | unaffected | Stain staging backs off zoom 0.125 → 0.5 until the projected window is on screen and HUD-clear (`enrichments.mjs:1510`, `:1511`); at zoom 0.5 the reach is 14 both ways against spots ≤ 5 from the traveller. Covered by the enrichments elephant-trampling section. |
| U29 | unaffected | The stain crop is derived from the projected stain box (`clipFor`, `__camera.ndc`), and the frame declares the stain as its world subject (P). |
| U30 | fixed | `frameSubject` is projection-based; its settle probe reads `__camera.settled` (`frameSubject.mjs:150`), which now includes the shift (U3). |
| U31 | unaffected | `_polish.mjs` has no travel centring helper (no `debugJumpTo`/`__camera` use, 254 lines); all frames go through `captureFrame` (P). |
| U32 | fixed | The three fixed screen-centre crops of `enrichments.mjs` (landmark, Atlas snow, season tint) now follow the traveller's projected position (`clipAroundTraveller`, `enrichments.mjs:508`, `:8770`, `:8834`). A sweep of `scripts/verify` found no other fixed travel crop, centre probe or click (touch taps only arm the layer, `crossbrowser.mjs:177`; wheel `mouse.move` positions do not pivot). |
| U33 | unaffected | The angle check reads `camera.getWorldDirection` (`TravelScene.tsx:2880` `viewDir`), the camera's own forward vector, unchanged by the shift (C). |
| U34 | fixed | The shift scales with the zoom like the offset, so the traveller keeps his picture row at every zoom (`followCamera.test.ts` "scales the shift with the zoom…"). |
| U35 | unaffected | The map and the position query read the game position, not the camera (`MapOverlay.tsx`, `StatusBar.tsx`: no camera use); the only camera-derived helper, `groundViewRadius`, measures from the traveller. A new dev reading `__camera.aimShift` exposes the frame-centre offset. |
| U36 | unaffected | No screen-to-ground picking in `src/`: the only `setFromCamera` is the dev hook `groundViewRadius`, measured from the traveller; touch steering is stick-relative. |
| U37 | unaffected | Fog and near/far are camera-relative (C): per pixel unchanged; near plane rule `TravelScene.tsx:3124` unchanged. The traveller's own pixel moved up ~4.5 units deeper, still inside the smallest preset fog near (55, central) at zoom 1 (camera distance 52.5). |
| U38 | unaffected | Rain column ±55 around the traveller, opaque core to 30.25 (`Climate.tsx:71`, `:98`); the zoom-1 frame reaches 28 south and north (N), inside the core (was 35 north, in the fade). |
| U39 | unaffected | The chunk window was NOT re-centred (U8), so the capture gate's committed set is unchanged (`TravelScene.tsx:1852`). |
| U40 | unaffected | The capture takes the settlement's explicit coordinates (`TravelScene.tsx:1874`) and builds its own camera (`panoramaCapture.ts:130`). |
| U41 | unaffected | No positional audio in `src/`: no AudioListener/PannerNode; `ambience.ts` pans by speech plan only and never reads a camera. |

Comparison frames for the user's choice of compensation (1.0 vs 0.5), both
backends: `verification/1287/{webgpu,webgl}-comp{100,050}-*.png`.
