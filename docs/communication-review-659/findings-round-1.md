# Point 659 — Claude review, round 1 (25.09.2026)

Judged on the green continuous runs of `80c0a39ff`: WebGPU
`communication-webgpu-1790297789751` (words-first) and WebGL 2
`communication-webgl-1790296797094` (message-first). Pictures were judged
before the receipts; audio was analysed from the WAVs. Full reports:
[steps 1–3](pictures-steps-1-3.md), [steps 4–9](pictures-steps-4-9.md),
[audio and teaching order](audio-and-teaching-order.md).

Verdict: the chain is walkable, but the point is NOT tickable. Two of the
three named causes are still open, and two proofs do not show what they claim.

## Blockers — fix on this branch

- **B1 — DIG errand has no visible result (named cause 2), product, both
  backends.** `03-finished-work`: no pit, post or planting. WebGL 2 differs from
  `paired-dig` only in the tools disappearing; WebGPU shows a small row of dark
  clods. The adults dig into a round slatted disc that reads as a lid or basket,
  not soil. Required: a finished DIG leaves a result a player sees at the
  framed distance (pit with spoil heap, set post or planted row), persisting
  long enough to be noticed.
- **B2 — upstream vs downstream not distinguishable at the bank, and possibly
  taught in opposite directions, product, both backends.** No flow cue at the
  bank; water streaks run straight across the view; the two rocks look alike.
  In the run frames UPSTREAM is the right-hand rock, but in the loom frames the
  helper walks LEFT for UPSTREAM, apparently from the same bank. Required:
  verify the two lessons agree in world direction (unit-test it against the
  river's flow vector); make flow direction readable at the bank (e.g. drift of
  surface foam/debris, current streaks along the flow).
- **B3 — teaching order not enforced (named cause 3), product, both.**
  Nothing in scene or store code reads what the player has heard; each bank
  run presents UPSTREAM/DOWNSTREAM and ROCK together, and both runs saw these
  before ROCK was ever heard alone (boulder climb). Required: an order in which
  no heard exchange carries two words the player has not yet heard (e.g. the
  bank game's first cycles are the ROCK touch/climb alone until ROCK has been
  heard), enforced in code from the heard set, with a unit test.
  Also fix `journal.drumMessage` (`store.ts` ~741–745): it states "I have heard
  every one of them" unconditionally, false in the message-first run.
- **B4 — the socket is not visible, steps 8–9, both.** `08-impression-and-socket`,
  `09-before-fit`, `09-after-fit`: a plain brown box seen from above and behind,
  player clipped into its edge; before/after identical; no cliff in view.
  Required: a weathered block at the Bandiagara talus foot whose socket/relief is
  readable at player zoom and visibly matches the impression, a visible change
  after the fit, and harness frames that show it with the cliff.
- **B5 — the child-call audio proof is a false approval, harness, both.** The
  child-call WAVs contain only ambience (identical channels, no energy at the
  child pitches); recording starts after turning to the speaker, 4–7 s after the
  call. The WebGPU adult-talk window lost two of four syllables the same way.
  `saveAudioWindow` (`scripts/verify/communicationCapture.mjs` ~79) accepts any
  nonzero peak. Required: record continuously (ring buffer) so a window can
  start before the label; fail the window unless the voice band exceeds the
  ambient baseline during the labelled syllables; stop listing a label on blocks
  after it was hidden.

## Nonblocking — fix here where cheap, otherwise backlog

- Route frames `upstream-/return-/downstream-river-*` are taken at one spot
  0.6 s apart — take them along the leg.
- `07-answer-sounding` is shot ~6 s late (paper already shown); `02-stationary-rock-touch`,
  `02-child-call`, `02-off-game-climb`, WebGL `03-loom-upstream`,
  `05/07-chief-walks-out` frame the wrong moment or place.
- Villager speech continues over the drum answer and blurs its first word.
- Route receipt keeps no first-hearing timeline, so the order cannot be proven
  from a run — add it (needed for B3's browser evidence).
- Word tag grows to ~1000×480 px at close range and covers the status bar and
  dialogs; the place labels clip into the status bar.
- WebGL 2: the compatibility notice's "Got it" is covered by the journal.
- Success toast wording "Dummy message: …" is the known placeholder (unchanged by
  design, `communication-playthrough.md` endpoint).
