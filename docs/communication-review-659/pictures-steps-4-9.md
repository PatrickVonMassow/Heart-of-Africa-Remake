# Point 659 picture review: steps 4–9 (Claude reviewer)

Runs: WebGPU `communication-webgpu-1790297789751-*` (words-first), WebGL 2 `communication-webgl-1790296797094-*` (message-first).
Worktree: /workspace/hoa/.claude/worktrees/point-659/verification. Every step 4–9 frame was viewed at full resolution on WebGPU. On WebGL 2, every frame except revised-paper, chief-indoors-reading, upstream-river-0/27, excavated-find, return-river-*, answer-reopened, old-errand, impression-description, downstream-river-0/34 was viewed. The skipped ones matched their WebGPU twins in label and step. Journal PNG sample: WebGPU en-9, de-9, de-11; WebGL en-0, de-11. Both journal-*.txt files were read in full.
I judged each picture first and only afterwards used the receipt, to locate frames and check the strike timing.

## Subjects that ARE shown (both backends unless noted)
- Guess invitation, reading dialog and saved glossary: the live syllables, the "E — guess meaning" note, the "What did he mean?" dialog and the Overheard list with player readings are all shown.
- Errand paper: four atoms with rhythm plus the player's own readings. WebGL `05-unknown-errand` shows four `???` and "My reading" placeholders. The edited, revised and cleared papers stay in sync with the Overheard entry: "water / river", then "perhaps a path", then `???` and "My reading".
- errand-sounding: the chief (big, left) and the drummer (centre) with drumsticks are in frame together, and no paper is shown. The receipt puts the frame 5.4 s into the 7.4 s strike plan.
- Boulder: a large tan, tilted monolith at close player zoom, clearly distinct from the small dark village play rocks seen in the upstream frames.
- Find in the inventory bar: slot 4 reads "Find from the Boulder". Later it is replaced by "Clay Impression of a Rock" / "Tonabdruck eines Felsens", which names the clay impression.
- Two-word answer paper: "water / river" and "with the current", ba-BA-ba-BA and BA-BA-ba-ba.
- Success toast: shown (see D7 for its wording).
- Journal: EN and DE carry the same content, entry for entry, and the final German entry was read in full. No raw keys, braces or markup leak. INTO/IN is set in capitals as emphasis in both languages. The DE journal has no ▶ read-aloud buttons, which is consistent with English-only TTS.

## Defects
| # | Sev | Backend | Frame(s) | What a player sees | Class |
|---|---|---|---|---|---|
| D1 | blocker (for the evidence of step 8/9) | both | 08-impression-and-socket, 09-before-fit, 09-after-fit | No socket or relief is visible anywhere. The "block" is a plain brown box seen from above and behind, with the player clipped into its edge. before-fit and after-fit look the same apart from wildlife movement. No cliff wall is in view, so "below Bandiagara" cannot be seen. A player cannot compare the impression with a socket from these pictures. | product (no readable socket at player zoom) and/or harness framing; the picture cannot prove the match |
| D2 | nonblocking | both | 06-upstream-river-0/14/27, 07-return-river-0/14/27, 08-downstream-river-0/17/34 | All three frames of each "continuous route" set come from one position and are about 0.6 s apart. They differ only in zoom (upstream) or not at all. The date does not change until the next step. No travel along the Niger and no flow direction is shown, so a follower cannot see the upstream search or the downstream destination. | harness framed the wrong moment (all subjects share one lat/lon) |
| D3 | nonblocking | both | 07-answer-sounding | The answer paper is already open and the journal entry is already being written. The chief and drummer "sounding" is not captured. By the receipt the frame fell 6.1 s (WebGPU) / 5.8 s (WebGL) after plan start. The last strike ended at 3.2 s, and the paper appeared at 3.2 s, which is correct behaviour. | harness framed the wrong moment |
| D4 | nonblocking | both | 05-chief-walks-out, 07-chief-walks-out | Almost black-brown screen showing a faint light shaft, plus a toast. The chief is not visible. It looks like the camera is inside an unlit hut interior. | subject missing; probably camera placement or timing (settle:false), but an unlit interior also looks wrong to a human |
| D5 | cosmetic-but-real | both | 04-saved-glossary, 04-chief-indoors-invitation/-reading, 04-paper-edited/-cleared (WebGL) | When the speaker is close, the word tag grows to about 1000×480 px. It covers the top HUD bar, sits behind the journal and paper, and stays visible under open dialogs. | product (world label not size-clamped) |
| D6 | cosmetic-but-real | both | 08-impression-and-socket, 09-*, 06-upstream-river-14 (WebGL biggest) | The place label ("Bandiagara", "Bambara Village") is huge and clipped at the top edge. It overlaps the HUD bar and health bar, and it collides with the "Discovered" and success toasts. On WebGL it also covers the graphics notice, so all three texts become unreadable. | product (label scale/overlap) |
| D7 | cosmetic-but-real | both | 09-success-toast, 09-after-fit | The player-visible toast reads "Dummy message: the puzzle of this proof of concept is solved." | product text (placeholder wording; check whether it is intentional) |
| D8 | cosmetic-but-real | WebGL | 04-*, 05-*, 07-*, 08-*, 09-* | The compatibility notice never goes away, and the journal panel covers its "Got it" button. The "Chief" nameplate covers the date, money and time in the HUD in 05-errand-sounding/-paper/-unknown-errand. | product (HUD overlap) |
| D9 | cosmetic-but-real | WebGPU | 05-chief-walks-out | The toast overlaps the journal title ("ournal"). | product (HUD overlap) |
| D10 | cosmetic | both | 06-find-journal, 06-excavated-find | The excavation entry is captured mid-handwriting ("Four words, and they were an…"), so the find text cannot be read in the picture. The .txt has it in full. | harness framed the wrong moment |
| D11 | cosmetic | both | 06-separate-boulder | The monolith stands on its tip on two pebbles and looks balanced or propped rather than grounded. | product (look) |
| D12 | cosmetic | text | journal "Into the Water" | EN mentions crocodiles and DE does not ("mühelos und sicher darüber"). This is outside the chain but is an EN/DE content mismatch. | product text |

Other notes:
- errand-sounding shows the "Space — Ask the chief for his message" prompt while the drums are sounding. It is harmless but possibly premature.
- The seal simile "the way a seal takes a signet" / "wie ein Siegel ein Petschaft abnimmt" is inverted: a seal impression is taken from a signet.

## Can a player follow the clue?
The text alone carries it. "against the current / water / a rock / dig" and the journal ("I followed the water against its own pull…") give the upstream search. "water / river + with the current" and "This time I followed the water the way it wants to go" give the downstream destination. The pictures do not show either route (D2), and they do not show the socket that the clay should match (D1).
