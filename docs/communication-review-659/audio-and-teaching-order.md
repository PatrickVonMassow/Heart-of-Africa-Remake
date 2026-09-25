# Review 659: audio at shipped defaults, and teaching order (named cause 3)

Reviewer: Claude (Opus 5.5), read-only. Worktree `/workspace/hoa/.claude/worktrees/point-659` at `175e15d92`.
Runs: WebGPU `communication-webgpu-1790297789751` (order `words-first`, compatibility feature level),
WebGL 2 `communication-webgl-1790296797094` (order `message-first`). Both routes report `status: passed`, `victory: false`.
The analysis tools are in this scratchpad: `dsp.js`, `overview.js`, `detail.js`, `trace.js` and `fixed.js`. They use Node and their own FFT because numpy is not installed.
Raw outputs are in `ov-webgpu.txt`, `ov-webgl.txt`, `detail-webgpu.txt` and `detail-webgl.txt`.

## Task A: sound judgment (from the WAVs, not from the receipts)

### Levels (per channel, after the limiter)
| window | WebGPU L / R peak, RMS (dBFS) | WebGL L / R peak, RMS (dBFS) |
|---|---|---|
| ambient-baseline | -40.7 / -40.7, -55.6 | -37.1 / -37.1, -53.0 |
| adult-talk | -15.3 / -17.5, -37.9 / -40.0 | -29.7 / -21.3, -48.6 / -40.9 |
| child-call | -38.3 / -38.3, -51.4 (L == R) | -41.6 / -41.6, -56.1 (L == R) |
| drum-errand | -18.1 / -18.1, -36.5 | -17.8 / -17.8, -36.5 |
| drum-answer | -17.6 / -17.6, -38.4 / -37.0 | -18.2 / -15.0, -38.2 / -36.7 |
No sample reaches the 0.95 ceiling, so nothing clips. Every receipt reports `gaps: []` and `restamped: []`, and the block frames are contiguous in all ten windows.

### Adult TALK (DIG, `BA-ba-BA-ba` in this roll)
- **WebGL:** all 4 syllables are present at 0.33, 0.63, 0.93 and 1.23 s, spaced 0.30 s apart.
  - Voice-band SNR (100–3000 Hz, fixed 186 ms window) is 13.7–15.3 dB over the baseline mean and 9.1–10.7 dB over the loudest baseline slice.
  - f0-band SNR is 18–25 dB.
  - f0: BA 232–233 Hz, ba 137.5 Hz.
- **WebGPU:** only syllables 3 and 4 (BA, ba) are in the window, at 0.01 and 0.30 s.
  - SNR is 25.7–27.1 dB in the voice band and 33–36 dB in the f0 band.
  - f0: BA 231.5 Hz, ba 138 Hz.
- **Tones:** the ratio is 1.68 (about 9 semitones). Each syllable falls by 2–3 % (232→228 Hz, 140→136 Hz), and the two tone ranges never overlap. Low and high are clearly distinguishable, and the low syllable is about 2 dB weaker in the formant band. Verdict: the adult speech is audible, and its tones are readable on both backends.

### Child CALL (RIVER, `ba-BA-ba-BA`): NOT IN THE RECORDING on either backend
- Neither window has a syllable above the baseline p99 + 6 dB, and neither contains energy at the child carriers (210 / 353 Hz) above the baseline. L and R are identical to within -39/-41 dB, so no panned voice is present. What was captured is ambience only.
- **Cause (timing, derived from the receipts):** the label's `shownAt` uses the page clock.
  - WebGPU: the call was shown at page 282.75 s, and the window begins at context 278.256 s, which is page 288.22 s. The whole call ended about 4.3 s before the window opened.
  - WebGL: the call was shown at page 272.79 s, and the window begins at page 280.16 s.
  - `scripts/verify/communication.mjs` `speech()` first waits for a drawn note, then runs `faceNote` (aim), and only then calls `audioStart(..., preRoll = 1)`. The aim toward a running child takes longer than the 1 s pre-roll and the 1.2 s word.
- The same cause truncates the WebGPU adult window: the label came at page 123.57 s and the window began at page 124.16 s, so syllables 1–2 were lost.
- `saveAudioWindow` (`scripts/verify/communicationCapture.mjs:79`) accepts any nonzero peak. An ambience-only window therefore passes, which is exactly the "nonzero peak" false approval.
- The receipts also attach `labels: [kid-3 ...]` to every block of a window in which the call no longer sounds (WebGPU `hideAt` 285.35 is before the window start of 288.2). The metadata claims that the call is present.

### Drum windows
- **Errand:** both backends have 16 strikes. The WebGPU detector found 17 onsets; the extra one at 0.99 s is an ambient bump about 20 dB below the strikes.
  - Intervals are 0.30 s within a word and 1.20 s between words.
  - Decoded: `LHLH | LLHH | HLLH | HLHL`, which is RIVER · UPSTREAM · ROCK · DIG and matches the plan exactly.
  - Onset SNR is 12–24 dB.
- **Drum tones:** the large drum centroid is 161 ± 2 Hz and the small one 356 ± 5 Hz, about 13.7 semitones apart. The two drums are clearly distinguishable.
- **Answer:** both backends have 8 strikes, decoded `LHLH | HHLL` (RIVER · DOWNSTREAM). A villager's spoken RIVER (`villager-0`, 137/231 Hz, panned) lands on the first drum word in both runs.
  - WebGPU: voice onsets at 0.94, 1.24, 1.54 and 1.84 s. They fall between the drum strikes and fill the 1.2 s word pause before DOWNSTREAM.
  - WebGL: voice onsets at 0.46, 0.76, 1.06 and 1.36 s. Each one overlaps the next drum strike by about 110 ms, and the tones are opposite (voice `ba` on drum H, voice `BA` on drum L).
  - The trailing onsets in WebGPU at 5.1, 5.7 and 6.15 s are ambient events about 15 dB below the drums.
- The last errand strike's ring is cut by about 40–60 ms at the window end, which is negligible.

## Task B: teaching order (named cause 3)
- **`ErrandView` no longer exists in `src/`.** Every village teaching utterance is a single atom:
  - `bankGame.ts` `say()`: RIVER call, direction announce, ROCK tap, ROCK arrival, ROCK boulder.
  - `adultWork.ts`: RIVER ×2 and DIG ×2.
  - The loom (UPSTREAM/DOWNSTREAM) and the drummer (CHIEF).

  So no single spoken utterance carries two words. Only the drum messages carry several: errand 4, answer 2 (`drumMessage.ts:25,38`).
- **The order is not enforced by code.** `hasHeard` is read only by the speech-label display (`speechLabel.ts:203`). No scene (`bankGame`, `adultWork`, `loomWork`, `chiefWalk`, `store.sendDrumMessage`) consults `communication.heard`. The bank game's sequence and the chief's errand are the same whatever the player has heard.
- **Two unknowns in one situation, recorded in both runs:** every bank run is announce (UPSTREAM or DOWNSTREAM, pointing AT the far rock) → tap ROCK (hand on own rock) → arrival ROCK.
  - In both runs the frames show the first runs (02-run-upstream at 315 / 306 s) before the isolated ROCK of the off-game climb (557 / 537 s).
  - So the first run a player meets gives a direction word and ROCK together, with both gestures aimed at a rock. They can be told apart only across runs (the direction alternates while ROCK stays constant) or through the climb, which nothing puts first.
- **The errand can come before any teaching.** In the WebGL `message-first` run, the only utterance recorded before the errand (page 114 s) is DIG. The errand then sounds RIVER, UPSTREAM and ROCK, three words not recorded as heard.
  - The spec allows either order as a puzzle to decipher later, so this alone is accepted.
  - However, the journal entry `journal.drumMessage` (`store.ts:741–745`, unconditional) then says "I know these words. I have heard every one of them in the lanes and at the water." That is false for this player.
- **The runs do not demonstrate the rule:** `route.json` stores `communication.heard` only at setup (`{}`) and no timeline of first hearings. Neither run can prove what was known when.

## Defects
| # | Severity | Backend | Where / when | Player / evidence impact |
|---|---|---|---|---|
| D1 | **blocker** (false approval) | both | `communication.mjs` `speech()` starts the window after the aim; `child-call.wav` WebGPU 0–2.69 s, WebGL 0–2.65 s | The child call's audibility is unmeasured; the window holds ambience only, yet it passes on a nonzero peak |
| D2 | nonblocking (same cause as D1) | WebGPU | `adult-talk.wav` starts 0.59 s into the word | Only 2 of 4 syllables are evidenced |
| D3 | nonblocking | both | `communicationCapture.mjs:79` accepts any nonzero peak; block `labels` persist past `hideAt` | Receipts claim speech that is not in the audio |
| D4 | **blocker for ticking 659** (cause 3 not closed) | both | no heard-memory gate anywhere in `src/scenes/place/*`, `store.ts`; bank run announce + ROCK | A first bank run gives two unknown words, both gestured at rocks; the frames show this order in both runs |
| D5 | nonblocking | both (WebGL recorded) | `store.ts:741–745` `journal.drumMessage`, WebGL entry id 5 | The journal claims every word is known when three were never heard |
| D6 | nonblocking | both | `drum-answer.wav` WebGPU 0.94–1.94 s, WebGL 0.46–1.55 s; villager speech is not held during `drumPerformance` (`PlaceLife.tsx` 2397 only frees the drummer's hands) | A spoken RIVER fills the word pause and overlaps opposite-tone strikes (WebGL), which muddles the answer's first word |
| D7 | nonblocking | both | route receipt | There is no first-hearing timeline, so teaching order cannot be verified from evidence |

Observation (not a defect today): the child's high carrier (352.8 Hz) sits on the small drum's body (about 356 Hz measured). It matters only if drums and children sound together; the drum bed is off by default.
