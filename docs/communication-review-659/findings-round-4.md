# Point 659 — review findings, round 4 (Opus 5.5, 25.09.2026)

Reviewed: diff `4ec877115..cfcf29299` (Astra's answer to round 3), read before
its report. Then `VERIFY_GL=webgpu npm test -- communication
--section=continuous-route` on `cfcf29299`: RED after 7m 58s at
`2-childrens-bank-game`, 5 of 48 frames. Log:
`local/verify-logs/2026-09-25T03-37-03-977-communication.log` (main checkout);
receipt
`local/659-round4-red/communication-webgpu-1790307428401-route.json` (main checkout). The run was flagged UNDER LOAD (a second author ran unit tests), so
the red is corroborated by reading the code, not by the timing.

R3-B1 is answered: first hearings DIG 125, ROCK 301, DOWNSTREAM 314,
UPSTREAM 330, RIVER 398 s — ROCK precedes every direction.
R3-B2 is answered: `child-call` accepted at 397.6 s from `kid-0`,
`rockBeforeCall` and `rockBeforeRiver` both true.

## R4-B1 (blocking, driver): aiming down at the tapped bank rock never converges

`communication.mjs:387` `await d.aim({ ...touch.rock, y: 0.9 })` after
`d.inspect(touch.rock, 3.5)` throws `Could not aim at the declared subject
using turn keys (0.031 rad off at 3.57 m)`. The yaw is already inside the
0.065 tolerance, so all 80 iterations were spent in the pitch branch of
`aim()` (`communicationDriver.mjs` ~116–124): it `continue`s on every pitch
nudge, and when the computed cursor `y` falls outside [30, 870] it moves the
cursor back to 450 instead, which does not accumulate the pitch change — the
loop can oscillate without progress and exhausts the yaw budget. This step
has never passed on this branch.

Fix the pitch convergence so a subject below eye height at ~3.5 m is reached
with the normal mouse look (recentre, then nudge in the SAME iteration, or a
separate bounded pitch loop), and report pitch in the error so a red names the
axis that failed. Add a unit test that drives `aim()` with a fake page whose
pitch responds to mouse moves and assert it converges for a subject at
y = 0.9, 3.57 m, from pitch 0, and that the error text names pitch when it
cannot.

## Not yet judged

Frames after `02-stationary-rock-touch`, steps 3–9 pictures and the WebGL 2
run follow after this fix.
