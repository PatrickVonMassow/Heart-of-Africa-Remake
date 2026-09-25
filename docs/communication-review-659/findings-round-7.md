# Point 659 — review round 7 (Opus 5.5, 26.09.2026)

Runs of `npm test -- communication --section=continuous-route` at `26319ba3b`:

| Backend | Result | Frames | Route receipt |
| --- | --- | --- | --- |
| WebGPU | GREEN, 21m 38s, 13 pass | 73 | `verification/communication-webgpu-1790372136841-route.json` |
| WebGL 2 | GREEN, 17m 23s, 14 pass | 74 | `verification/communication-webgl-1790370491229-route.json` |

Later commits change only the dig-invitation lapse bookkeeping in the driver
(`inviteOutcome`), unit-tested; Astra's pass-1 finding (an invitation spoken
and expired while sampling paused for the pursuit walk was charged as a lapse)
and its follow-up (another speaker overwriting `last`) are answered there.

## Pictures, judged before the receipts

- **R6-B1 closed.** `05-chief-walks-out` and `07-chief-walks-out` (both
  backends) stand outside the hut: the chief with his staff walks towards the
  drummer and the two drums, the hut wall at the right edge.
- **Old D1–D5 closed.** Socket and relief visible on the talus block
  (`08-impression-and-socket`), the fitted piece shifted in `09-after-fit`;
  route frames come from separate positions and days (`06-upstream-river-0`
  at Bambara 01.01., `-2` at the rock 05.01.); `07-answer-sounding` shows the
  drummer with raised sticks before the paper; word labels keep a fixed size.
- `07-answer-paper`: the two-word answer, "water / river" and "with the
  current", with their tone patterns.
- Remaining, charged elsewhere: top-centre overlaps (title card over toast,
  "Bandiagara" over the block crown, toast over the WebGL notice) are point
  1215. Two framing weaknesses (WebGPU `03-dig-invitation` shot from right
  behind the speaker; the replay prompt over inventory slot 6) are in
  `docs/backlog.md` — non-blocking.

No blocking defect remains in the chain entry → fit on either backend.
