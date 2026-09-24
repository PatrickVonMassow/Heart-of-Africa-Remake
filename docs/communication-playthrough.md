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
