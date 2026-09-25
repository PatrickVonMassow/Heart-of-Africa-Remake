# Point 659 — review findings, round 6 (Opus 5.5, 25.09.2026)

Reviewed: `b9cffdc7b` (Astra's answer to R5-B1). Then `VERIFY_GL=webgpu npm test
-- communication --section=continuous-route`: RED after 16m 25s at `5-errand`,
21 of 48 frames, "Chief walk frame was late". Log:
`local/verify-logs/2026-09-25T11-00-29-016-communication.log` (main checkout);
receipt and frames `local/659-round6-red/` (main checkout).

## R6-B1 (blocking, driver): backing away walks the player INTO the hut

`faceWalkingChief` holds `KeyS` until the player is 3.5 m from `hut.door`. After
the Space talk the player faces the door from its threshold, so "back" leads
into the hut, not out of it. Frame `05-chief-walks-out.png` shows the doorway
from inside: the dark door posts, the thatch edge, the square beyond — and no
chief. The shutter accepted it (the subject point projects inside the frame),
but a human sees nothing of the chief leaving.

The frame was also late: `04-saved-glossary` at pageMs 962 803, the chief frame
at 979 092 — about 16 s, at 14 FPS. By the time the shutter returned the chief
had reached the drummer (`at-drummer`), so the post-shutter assert fired.

Fix: pick the standing spot OUTSIDE the hut from geometry, not from the facing.
Take the outward door normal (hut centre → door) and the chief's route towards
the drummer; stand about 3–4 m outside the door, to the side of that route, so
the chief walks across the view. Compute that spot before Space, walk there with
`d.walk` right after `walking-out` is reached, aim at the chief's live position,
and shoot. Pin in a driver test that the chosen spot is outside the hut
footprint and that the chief's route is in front of the camera. If the walk out
still cannot beat his arrival at the drummer, say so with the measured seconds
rather than loosening the phase assert.

## R6-N1 (note, not blocking here): the shutter did not see the chief was absent

The subject point projected into the picture while the chief himself was not
visible from inside the hut. Record it in `docs/backlog.md` if it is not
already there; it is not a work-order point unless it reproduces as a false
approval outside this driver.

## Not yet judged

Frames after `05-chief-walks-out`, steps 6–9 pictures and the WebGL 2 run.
