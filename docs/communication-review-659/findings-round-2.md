# Point 659 — review findings, round 2 (Opus 5.5, 25.09.2026)

Reviewed: diff `80c0a39ff..a411d2f29`, then `VERIFY_GL=webgpu npm test --
communication --section=continuous-route` on the merge candidate `7d286a6f0`
(main merged in). Receipt: RED after 11m 43s at `2-childrens-bank-game`,
2 of 48 frames. Log: `local/verify-logs/2026-09-25T02-19-19-998-communication.log`.

## R2-B1 (blocking, product): the rock-only run violates the bank invariant

The B3 change in `src/scenes/place/bankGame.ts` opens a run through
`openRun` while ROCK is unheard, with no direction announced. The standing
dev assertion fires on every such run:

    [ASSERT] bank-run-unannounced — a run is on with no direction announced (run 1..4)

Seven occurrences in one session. Either the rock-only lesson must not be a
direction run (a distinct touch/climb phase the invariant knows), or the
invariant must name the rock-only case explicitly. Do not silence the
assertion; a unit test must drive a rock-unheard cycle and assert no
invariant failure.

## R2-B2 (blocking, driver): step 2 waits 13.5 s for a call that now comes later

First hearings in the receipt: DIG 114.6 s, ROCK 293.8 s, DOWNSTREAM 304.8 s,
UPSTREAM 321.7 s, RIVER 404.4 s (audio seconds). The driver failed with
`page.waitForFunction: Timeout 13515ms exceeded — no child-call note`,
labels empty, while the RIVER call arrived ~110 s after ROCK. The teaching
order the product now enforces (ROCK before the river call) must be played
the way a player plays it: stay with the children until ROCK is heard and the
call follows, bounded by the real cycle length from `balance.ts`, not a fixed
13.5 s window. Record the ROCK-first ordering in the receipt.

## R2-N1 (minor): import above the header comment

`src/ui/Hud.tsx` now opens with the `ClayImpression` import before the file's
header comment. Move it below the comment with the other imports.

## Not yet judged

No picture judgment of steps 2–9 was possible; the WebGL 2 run was not
started. Both follow after these fixes.
