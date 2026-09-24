# Communication play-through — reviewer handoff

Work-order 659. This is the route and evidence checklist for the continuous
browser review, not a record of a completed browser run. The author runs the
unit, build and lint gates; the reviewing session owns browser execution,
audio measurement and picture judgment.

## Endpoint clarification answered

The endpoint is the **fitted clay impression at the Bandiagara talus foot**:
`spentSockets` contains `bandiagara-talus`, the `toasts.pocSolved` toast appears,
and the journal contains one `journal.mouldFitted` entry. This follows
[the reward paragraph in the spec](communication-poc-spec.md#where-the-digging-happens).
The chief's hand-over is an intermediate step, not completion.

The tomb and `victory` belong to a separate goal chain. The dummy toast wording
and `src/state/store.mould.test.ts` are unchanged. U82 in the
[counted enumeration](blind-659/union.json) is therefore **not a defect merely
because `victory` remains false**. Its separate concern about whether the fit
actually reaches the player's attention still needs picture/text judgment.
The enumeration remains intact as the historical input; this clarification
does not close its other entries.

## What the new regression proves

[CommunicationPlaythrough.test.tsx](../src/ui/CommunicationPlaythrough.test.tsx)
mounts one HUD for an expedition and keeps the same quest state until the fit.
Four cases cross English/German with words-first/message-first. They buy a
shovel, enter Bambara, enter guesses through the speech dialog, await the real
drum watcher's timer, reopen the errand through the journal, revise and clear a
reading, excavate through the inventory button, give the recovered item,
await the answer, reopen both messages, and use the impression at the socket.
They also try giving outside the village and using the form in a settlement,
away from the socket and again after the fit.

Assertions cover the rolled vocabulary's exact atoms, the player's own
readings, message completion timing, inventory transitions, the five quest
journal entries in order, the displayed fit entry in both languages, and
`victory === false` before and after puzzle completion. No test inserts the
find, form, spent socket, message-heard flags or journal entries as fixtures.

The scene seams are explicit: hearing and dialog selection are supplied,
`chiefTick` advances the chief on a supplied path, and travel uses position
jumps. No Three scene or WebAudio output is exercised. These cases cannot
certify audible speech, E targeting, pointer lock, traversable routes, visible
work, readable flow or the recognisability of the destination.

## Continuous browser route

Keep one page and one expedition for each backend run. Record revision, seed,
backend actually selected, language and shipped audio settings before entry.
Keep concept-label debugging off. Buy the shovel before the village; record
any setup used to reach the village, outside this point's entry-to-fit route.
From entry onwards use the normal movement, interaction and inventory controls:
no quest-state writes, new games, jumps to later checkpoints or injected words.

Use words-first for one run and message-first for the other, retaining both
paths' evidence. The unit cases cross both orders with both languages; switch
the browser's language when rereading the completed journal to check that the
same stored expedition still displays correctly. A failed step remains a
failed continuous run; an isolated diagnostic does not repair its record.

| Step | Player action | Evidence to retain and judge |
| --- | --- | --- |
| 1. Entry and speech | Enter Bambara and approach an audible exchange with audio unlocked by a normal gesture. | Entry frame, seed/vocabulary/settings, audio at the final output, speaker and note in the same picture. Do not equate a heard-memory entry with sound. |
| 2. Children's bank game | Follow the RIVER call to the water; observe both run directions, a stationary rock touch and the off-game boulder climb. | Frames or a clip containing the current, both bank rocks, the pointing/running bodies, hand contact and climbed rock. Judge what each word could mean from those pictures. |
| 3. Adult work and loom | Watch the water carrier complete the trip, a paired DIG bout complete, and the loom helper move in both directions. | Empty jar, dipping, full jar set down; invitation, tools and finished pit/post/planting; loom, helper and river axis. Capture each word followed by its consequence, including competing exchanges. |
| 4. Guesses | Target a live note, press E, write a provisional reading, then revise and clear it from the journal and message paper. | Actual invitation, selected syllables, saved note in the glossary, the reopened paper picking up the changes. Include CHIEF at the drummer while the chief is indoors. |
| 5. Errand | Use the chief's hut, follow him to the drummer, request the message and wait for its last beat. In the message-first run do this before entering readings, then return to steps 2–4. | Chief and drummer together while sounding, sixteen strikes, paper only after completion, four atoms with unknown/own readings, journal reopen. No trust or cultural-gift prerequisite. |
| 6. Search and excavation | Leave the village, follow the river upstream, recognise and approach the separate boulder, and use the shovel. | Travel route and flow, boulder visible at player zoom, reachable standing spot, find in the bar and its journal entry. The local play rocks must not be mistaken for this target. |
| 7. Return and give | Return to the same village, call the chief outside and activate the find within reach. | Usable inventory control with the actual pointer-lock state, disappearing find, named clay impression, eight-strike answer and its two-word paper after the last beat. Reopen both old errand and answer. |
| 8. Downstream destination | Follow the answer, inspect the impression, recognise the weathered block below Bandiagara and approach it. | Continuous route, river-to-talus connection, impression and matching socket sufficiently readable to explain the choice. A known coordinate alone does not prove the clue works. |
| 9. Fit and journal | Activate the carried impression at the socket; read the resulting journal entry. | Before/after frames of the block, dummy success toast, named fit entry and full visible prose; one spent socket, one fit entry, impression retained, game victory still false. Reusing it writes no duplicate. |

For the three original causes, retain separate judgments: (1) bank-rock
placement and upstream consistency, (2) each adult errand's visible result,
(3) whether the atomic words and their consequences permit inference without
two simultaneous unknowns. The old catalogue and gift-gate wording do not
override the rebuilt spec. Also judge direction visibility and whether the
work reads as a purposeless fixed loop. Do not mark any of these closed from a
store assertion alone.

## Runnable continuous harness (authored, not browser-executed)

With verification browsers already provisioned, run **one command per backend**
from this worktree. The runner starts and stops the dev server:

```sh
VERIFY_GL=webgpu npm test -- communication --section=continuous-route
VERIFY_GL=webgl npm test -- communication --section=continuous-route
```

The WebGPU run takes words-first; WebGL takes message-first. Each opens exactly
one page and uses one expedition, with the shared seed route (default 42).
`VERIFY_SEED=<number>` selects another seed. `assertBackend` checks the renderer
actually obtained; this suite is not routed through the WebGL-only voice lane.
The section is indivisible: steps cannot be selected as checkpoint restarts.
The normal whole-suite command, `VERIFY_GL=webgpu npm test -- communication`,
runs the same route without the runner's partial-section coverage stamp.

[scripts/verify/communication.mjs](../scripts/verify/communication.mjs) implements
the route. Its only setup seam purchases the shovel through `buy` in Cairo,
leaves Cairo and jumps to Bambara's approach **before** the Space-key entry.
The receipt records this setup, revision, seed, rolled vocabulary, locale,
backend/feature level and shipped mix settings. After entry the driver reads
scene probes to plan walks and wait for natural activity, then operates the
ordinary movement, turn, Space, E, inventory-number and journal controls.
It never casts errands, adjusts their timers, speaks a synthetic word or writes
quest progress. Both language renderings are selected through the settings UI
at the end. Pointer-lock state is recorded at the give; the game's existing
`navigator.webdriver` policy suppresses native lock under automation, so this
does not claim an OS pointer-lock test.

Every artifact starts with `communication-<backend>-<timestamp>-` in
`verification/`. Frames stay at the top level so the runner's frame counter and
progress monitor see them; the prefix keeps both runs and failed attempts from
overwriting one another. Open the matching `route.json` first. It lists the
last reached step, declared frame subjects, page/audio timestamps, window
receipts, errors, final quest journal and video path. The route video includes
the normal walks and the short actions between named frames. Its soundtrack is
provided separately by the measured WAV windows, not by Playwright's video.

| Frame suffixes | Document step |
| --- | --- |
| `01-entry`, `01-adult-talk` | Entry and a natural adult exchange |
| `02-child-call`, `02-run-*`, `02-stationary-rock-touch`, `02-off-game-climb` | RIVER call, both directions, contact and climb |
| `03-empty-jar`, `03-dipping-jar`, `03-full-jar-set-down`, `03-dig-invitation`, `03-paired-dig`, `03-finished-work`, `03-loom-*` | Adult consequences and both loom directions |
| `04-river-*`, `04-chief-indoors-*`, `04-saved-glossary`, `04-revised-paper`, `04-cleared-paper`, `04-paper-edited` | Live E invitation, guesses and shared edits |
| `05-chief-walks-out`, `05-errand-*` | Chief, sixteen-strike plan and completed paper |
| `06-upstream-river-*`, `06-separate-boulder`, `06-excavated-find`, `06-find-journal` | Upstream route and excavation |
| `07-return-river-*`, `07-chief-walks-out`, `07-answer-*`, `07-clay-impression`, `07-old-errand` | Return, give, eight-strike plan and both papers |
| `08-impression-description`, `08-downstream-river-*`, `08-impression-and-socket` | River route to the talus and its block |
| `09-before-fit`, `09-success-toast`, `09-after-fit`, `09-journal-<language>-*` | Fit, duplicate-use check and journal rereading |

`journal-en.txt` and `journal-de.txt` (with the run prefix) contain the journal
text read from the rendered DOM. The receipt also preserves the stored entries
so the reviewer can compare the same expedition across both languages.

The five audio windows are `ambient-baseline`, `adult-talk`, `child-call`,
`drum-errand` and `drum-answer`. Each has a stereo PCM16 WAV and a JSON receipt:
sample rate, AudioContext sample-frame bounds, per-channel peak/RMS,
Hann-compensated mean-square low/high band energies, the complete 2048-point
FFT power spectrum and sample discontinuities. Band edges are explicit in Hz;
voice bands follow the shipped low pitch and interval, while drum bands cover
the low and high membrane ranges. The worklet taps `__ambience.output()` on
`__ambience.context()` through a silent measurement branch. It disconnects only
that branch. It never resumes audio itself: failure of the normal entry gesture
to unlock it is missing evidence and fails the route.

Block receipts retain delivery time, audio time, visible speech labels and
active drum-message identity to expose overlap. These are observations at block
delivery, not isolated voice stems. The baseline is the first three seconds
after entry and may include natural village sound; the receipt makes any overlap
visible. Speech windows include pre-roll so detecting the natural note does not
lose its opening syllable. Silent output, missing samples or a suspended context
fail, but a nonzero peak does **not** certify intelligibility. The reviewer must
listen to the WAVs and judge the frames/video. Coordinate-based navigation alone
does not certify that a human can infer the destination.

Natural observation waits are bounded, with no accelerated life settings. A
blocked walk, missing word, missed work phase or interrupted journey exits
nonzero and retains the failed route receipt and evidence already written.
Interrupted audio windows are saved when possible and listed as incomplete.
A later diagnostic or a fresh attempt does not replace that failed record.
The suite's runtime is explicitly unmeasured until the reviewing session runs
it; its registered frame count is a conservative authored floor, not a measured
claim. No browser execution, new picture judgment or recorded sound is claimed
by this authoring handoff.

## Audio and failure record

Tap `window.__ambience.output()` using the context returned by
`window.__ambience.context()`. This is the deployed output after the mix
limiter, not the speech-plan peak. The existing `village-stereo` section in
[voice.mjs](../scripts/verify/voice.mjs) demonstrates connecting native stereo
analysers and disconnecting only the measurement branch afterwards. Its
synthetic speech, altered drum-bed condition and WebGL-only routing make it a
diagnostic, not evidence of naturally occurring speech in both continuous runs.

During the actual route retain a recording and measured time windows for
ambient baseline, adult TALK, child CALL and both drum messages. Record sample
rate, sampling gaps, per-channel peak/RMS, low/high tone spectra and overlap
with other village sound. Keep the shipped volume levels and drum-bed setting;
the default bed is off. Record failures to resume the audio context or to
capture a word as missing evidence. Judge syllable discrimination against the
recording, not a nonzero mixed-output peak or a `speechProbe` call count.

Keep step/time/frame/audio references and the journal produced by each run.
Use the union's U identifiers when recording a finding; distinguish an observed
blocker, a nonblocking defect, an expected behavior with its spec reason, and
an untested risk. Each defect needs severity, reproduction and a fix or owning
point. Do not count the list of risks as 82 reproduced defects or declare it
closed merely because this regression passes.

The existing `polish` sections `children-bank-game`, `children-boulder-climb`,
`adult-errands`, `village-loom`, `speech-guess`, `chief-to-drummer` and
`artefact-give`, plus `world --section=communication-errand`, are useful for
isolating a failure. They have their own setup and cannot be stitched together
as evidence of the uninterrupted entry-to-fit run.

## Resumed gate record and outstanding review work

The resumed baseline `5b7f3e497` passed `npx tsc -b`,
`npm run typecheck:test`, `npm run lint` and `npm run build`.
Its full `npm run test:unit` exited 1: 536 files passed, two failed;
16,423 tests passed, two timed out and seven were skipped (757.25 seconds).
The failures were the bank-game traveller comparison and the compound-village
fence-capacity witness, each exceeding its 20-second case limit.

Two separate rescue commits repair those checks without changing game code or
raising timeouts:

- `306779b2c` separates the traveller and open-lane replays into independent
  cases, retaining all five seeds, 600-second simulations and assertions for
  each condition. Both targeted cases passed (8.8 and 6.6 seconds).
- `b4dd0141e` stops the fence-capacity existence search at its first layout
  exceeding 160 woven panels. The search candidates and condition are unchanged;
  the separate exhaustive panel/collider checks remain. The targeted case
  passed in 2.8 seconds.

The complete rerun on **`b4dd0141e`** returned:

| Gate | Result |
| --- | --- |
| `npx tsc -b` | Passed, exit 0 |
| `npm run typecheck:test` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0 |
| `npm run build` | Passed, exit 0; dependency warning about `kokoro-js` IIFE `import.meta` |
| `npm run test:unit` | Passed, exit 0; 538 files, 16,426 tests passed, seven skipped; 622.45 seconds |

The full rerun log is retained locally at
`local/verify-logs/communication-resume-unit.log` (git-ignored). Both repaired
files and all four `CommunicationPlaythrough.test.tsx` cases passed in that run.
This section records the results after verification; it changes no executable
code and does not claim a gate on a merge candidate.

That earlier stop is historical. For this leg the reviewing session supplied
an already merged branch; the author performed no merge. The continuous harness
above now replaces the missing implementation. Browser execution on both
backends, sound discrimination, rendered-picture judgment and landing remain
with the Claude reviewer. Pushes remain the wrapper's responsibility under the
house rule “Do NOT push”; no author-issued push was made.

## Harness authoring gates (this leg)

The full rerun passed: **543 files, 16,441 tests passed, seven skipped**
(558.36 seconds, exit 0). The first run's four harness-integration failures
were corrected: helper classification, terminal verdict output, the expected
frame total and `windowsHide` on the revision lookup. No application test was
changed to obtain this result. The final live-RIVER selection and first-paper
appearance checks also passed their focused contract run (15 tests, exit 0).

| Gate | Result |
| --- | --- |
| `npm run test:unit` | Passed, exit 0; counts above |
| `npm run build` (includes `tsc -b`) | Passed, exit 0; existing `kokoro-js` IIFE `import.meta` warning |
| `npm run lint` | Passed, exit 0 |
| `npm run typecheck:test` | Passed, exit 0 |
| Browser suites, audio listening and frame judgment | Not run by the author; assigned to the Claude reviewer |

Logs are local, git-ignored files under `local/verify-logs/`, named
`communication-harness-{unit,build,lint,types}-final.log`. This is an authoring
and cheap-gate record, not a browser acceptance result. No new browser frames,
recordings or journal captures are claimed here.
