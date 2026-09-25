# Point 659 — review findings, round 5 (Opus 5.5, 25.09.2026)

Reviewed: diff `ebf60b224..21d8fcc67` (Astra's answer to R4-B1), read before
its report. Driver unit tests: 21/21 green. Then `VERIFY_GL=webgpu npm test --
communication --section=continuous-route` on `21d8fcc67`: RED after 20m 17s at
`5-errand`, 20 of 48 frames. Log:
`local/verify-logs/2026-09-25T09-32-34-702-communication.log` (main checkout);
receipt `local/659-round5-red/` (main checkout).

R4-B1 is answered: the bank-rock aim converges, and the route passes steps 1–4.
The Tab/Escape recentre goes through the real journal UI, which also releases the
look for a player, so it is a player-reachable path.

## R5-B1 (blocking, driver): the chief-walks-out frame loses its subject

`communication.mjs:263` `localFrame('05-chief-walks-out', chief at y 1.2)` is
refused by the shutter: "its subject is not in the rendered picture — off the
left and top edge of the frame". The player stands at the hut door and has aimed
at the door (`d.aim(hut.door, y 1.2)`, line 259); the chief then walks out right
beside the camera, so at the shutter he is too close and too far off-axis to be
in the projection.

Frame the chief as a player would: after `walking-out` is reached, step back from
the door to a readable distance (about 3–4 m) and `d.aim()` at the chief's live
position before the shutter, still inside the `walking-out` phase (the assert on
line 264 must keep holding). Add a unit or driver-level test that pins the framing
distance/aim for a subject at the door, and re-run the section.

## Not yet judged

Frames after `05-chief-walks-out`, steps 6–9 pictures and the WebGL 2 run follow
after this fix.
