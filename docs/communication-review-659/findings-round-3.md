# Point 659 — review findings, round 3 (Opus 5.5, 25.09.2026)

Reviewed: diff `c05b331b9..8ef74bedf` (Astra's answer to round 2). Unit layer
green (`bankGame.test.ts` 70/70, `communicationBank.test.mjs` +
`communication.test.mjs` 13/13). Then `VERIFY_GL=webgpu npm test --
communication --section=continuous-route` on `8ef74bedf`: RED after 17m 57s at
`2-childrens-bank-game`, 2 of 48 frames. Log:
`local/verify-logs/2026-09-25T02-55-51-215-communication.log`; receipt
`local/659-round3-red/communication-webgpu-1790304955236-route.json` (main checkout).

R2-B1 is answered: no `bank-run-unannounced` assertion fired, and the receipt
lists no console errors. R2-N1 is answered.

## R3-B1 (blocking, product): a direction is heard before ROCK

First hearings (page seconds): DIG 123, **DOWNSTREAM 246**, ROCK 303,
UPSTREAM 334, RIVER 403, all at `bambara-village`, no drum message. The
DOWNSTREAM record has `heardBefore: ["BA-ba-BA-ba"]` — ROCK was not in the
listener memory when the direction reached the player. The teaching order the
bank enforces (ROCK before any direction, see `the bank teaches from the live
heard set`) is broken in the real game. Find which path announces or speaks a
direction while `hasHeard('ROCK')` is false for the player (a run opened out
of earshot, an announcement by another child, the rock-only flag reset, …)
and close it. A unit test must drive that path and assert no direction
utterance precedes the listener's ROCK hearing.

## R3-B2 (blocking, driver): seven cycles pass without a faced child call

`bank-lesson-start` at page 204 s with `cycleSeconds: 766.75`,
`bank-rock-heard` at 303 s. The call budget then ran out at ~1069 s; the tag
stood at `cycles: 7, runs: 21`. RIVER was heard at 403 s, so calls were
audible, yet `speech('child-call')` never accepted one: every candidate
failed `faceNote` or the 4-syllable freshness window, and the loop records
neither. Make each rejected candidate a receipt event (speaker, shownAt,
reason: aim error / off-picture / too late) so the red names its cause, then
fix the cause the events show — play it as a player would (stand where the
calling child is visible before the call, not chase it afterwards). Do not
widen the budget beyond the cycle to hide it.

## Not yet judged

Steps 2–9 pictures and the WebGL 2 run follow after these fixes.
