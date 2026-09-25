# Point 659 picture review: steps 1-3 (Claude reviewer)

Play-throughs: WebGPU `communication-webgpu-1790297789751-*` (words first), WebGL 2 `communication-webgl-1790296797094-*` (message first).
Method: all 30 PNGs read at full resolution before opening the receipt. The receipt was used only to confirm frame labels, and one source comment (loomWork.ts header) to check the loom's intent. I did not read docs/communication-playthrough.md.
Prefixes below: GPU = webgpu-...751, GL = webgl-...094.

## Per-frame verdicts

| Frame | GPU | GL |
|---|---|---|
| 01-entry | OK. Village plaza, fire, river on the horizon. "0 FPS" badge (first frame). | OK. The fallback notice is shown and dismissible. |
| 01-adult-talk | OK. Two adults with "BA-ba-BA-ba ???" above them. The note is large and covers the hut roof. | OK. An adult with a hoe beside an earth mound behind the fence, note above her. The mound makes DIG guessable. |
| 02-child-call | **FAIL (subject).** The note floats small at the hut edge. The speaking child can't be found: hidden behind the hut or fence, or a speck. The river and one rock are visible far off. | **FAIL (subject).** Same: the note hangs in mid-air above the fence with no body under it. |
| 02-run-upstream | Partial. Both rocks and the river are shown. The group with the note "ba-ba-BA-BA" stands at the RIGHT rock, one child at the left. The figures are about 30 px tall, so running can't be told apart from standing. | Same composition and the same limits. |
| 02-run-downstream | Partial. The group with "BA-BA-ba-ba" is at the LEFT rock. The upstream/downstream reversal can be read from the pair of frames, not from either one alone. | Same. A pale animal behind the right rock appears to stand ON the rock (depth ambiguity, cosmetic). |
| 02-stationary-rock-touch | **FAIL.** The camera is almost inside the rock. The note is clipped off the left edge ("ba-BA", "meaning"). No child and no hand in the picture. | **FAIL.** Same. The clipped note also covers the Canteen/Rifle HUD buttons. |
| 02-off-game-climb | **FAIL (subject).** A child stands in FRONT of a dark rock, feet on the ground, and the body overlaps the rock face. Nobody is on the rock. No river (correct for an off-game rock). | **FAIL.** A child stands BESIDE the rock and a second child is in the foreground. Nobody climbs. |
| 03-empty-jar | Weak. The carrier (maroon) holds an orange jar under the shelter while another adult pounds a mortar. You can't see that the jar is empty. | Weak. Camera jammed behind the carrier (orange). Jar at knee height. |
| 03-dipping-jar | Weak. The carrier stands on the bank with the jar at her feet on the sand. The jar is not in the water, so it reads as waiting, not dipping. | Same. |
| 03-full-jar-set-down | OK. Three jars on a stand with a blue water surface, clearly full. The carrier can't be identified, and these jars are dark brown while the carried jar was orange, so the link is weak. | OK (same). Villagers at mid-distance hover slightly: their shadow blobs sit below the cone bases (cosmetic). |
| 03-dig-invitation | Weak. The note is very large (about 50 % of the width) and covers the scene. The camera sits inside the crowd, with huge heads in the foreground. The speaker can't be told apart. | OK. Two adults with hoes and the note above them. Readable. |
| 03-paired-dig | Weak. One adult pushes a stick into a round slatted disc (it reads as a lid, basket or drum, not soil). "Paired" is not visible. A brown blob fills the bottom-centre foreground. | Better. Two hoes meet in the slatted disc. Still no open earth. |
| 03-finished-work | **FAIL (result).** Tools gone and a row of five dark clods beside the same disc. No pit, post or planting a player would recognise. The note still says ???. | **FAIL (result).** The tools are gone and nothing else changed. The disc is identical to paired-dig. No visible result at all. |
| 03-loom-upstream | OK-ish. Weaver at the warp in the foreground. The helper carries a bundle on the LEFT. River and rock behind. The note "ba-ba-BA-BA" covers the middle. | **FAIL (subject).** No note in the picture. The helper is cut off at the left edge. There's nothing to tie a word to. |
| 03-loom-downstream | OK-ish. The helper is on the RIGHT with the bundle and the note "BA-BA-ba-ba", but the note covers the helper's head. | OK-ish. Same. The note is very large. |

Side observations (all cosmetic):
- Cream quadrupeds stand in the river with their legs apparently on the surface. In GL run-downstream one appears to stand on top of a rock.
- The FPS badge reads 0 FPS on GPU entry.

## Named causes

**(1) Bank rocks: PASS on placement, FAIL on legibility of direction.**
- Both teaching rocks sit on the river bank, well away from the village middle, in run-upstream and run-downstream on both backends.
- A player can't tell upstream from downstream at the bank. The water streaks are horizontal and symmetric. There's no visible drift, wake or foam trail, and the two rocks look the same. The only cue is which rock the note-carrying group stands at, and that works only by comparing two frames.
- Flow direction can't be judged in a still. The video or the "-river-N" frame series has to show it, and I did not review those (out of scope).
- **Possible contradiction, needs confirmation.** In the run frames, UPSTREAM is the RIGHT rock. In the loom frames, the UPSTREAM helper walks LEFT. Both views look across the river from the same near bank. If the two cameras really face the same way, the two lessons put "upstream" on opposite screen sides, which teaches contradictory meanings. Please verify with the warp axis versus the bank-rock axis in world coordinates.

**(2) Every adult errand ends in a visible result: FAIL for the dig on both backends.**
- Water: PASS. Full jars are set on the stand, although "dipping" doesn't show the jar in the water.
- Dig: FAIL. finished-work shows no pit, post or planting. GL is unchanged apart from the vanished tools. GPU adds only a small row of clods.
- Loom: a helper with a bundle, going and coming. Its consequence was not shown within these frames. The header of `loomWork.ts` promises a growing woven strip, but it isn't visibly different between the two loom frames.

**Purposeless fixed loop?**
- The water errand reads as purposeful: set out, water, full jars.
- The dig reads as a fixed loop: same disc, same framing, tools appear and vanish, nothing changes.
- The loom reads as a helper shuttling back and forth. Without a visible product it's close to a loop.

## Defect list

| # | Severity | Backend | Frame | What a player sees | Kind |
|---|---|---|---|---|---|
| D1 | blocker (for cause 2) | both | 03-finished-work | Nothing was dug, set or planted. Tools simply vanish. | product defect: the result is missing or not recognisable. The harness framing is at the site. |
| D2 | nonblocking | both | 03-paired-dig | People "dig" into a slatted lid or basket, not soil. | product (the pit's look) |
| D3 | nonblocking | both | 02-stationary-rock-touch | Camera inside the rock, note clipped, no child or hand. GL: the note covers the HUD buttons. | harness framed the wrong moment/pose. The note clipping at the viewport edge is a product HUD issue. |
| D4 | nonblocking | both | 02-off-game-climb | A child stands next to or in front of the rock and never climbs. On GPU the body overlaps the rock. | product (the climb isn't posed, or it clips) or the harness shot before the climb; can't tell from the picture |
| D5 | nonblocking | both | 02-child-call | The note floats with no visible speaker. | harness (the speaker is occluded by the hut or fence) |
| D6 | nonblocking | GL | 03-loom-upstream | No note, helper cut off. | harness timing (outside the label's 2.6 s) |
| D7 | nonblocking (verify) | both | run-* vs loom-* | Upstream is on the right at the rocks and on the left at the loom. | possible product semantic defect |
| D8 | nonblocking | both | 02-run-* | No flow cue at the bank. Figures too small to read as running. | product (flow legibility) plus harness distance |
| D9 | cosmetic-but-real | both | 03-dipping-jar | The jar sits on the sand, not in the water. | product pose or harness timing |
| D10 | cosmetic-but-real | GPU | 03-dig-invitation, 01-adult-talk | The note is oversized and covers the scene. The camera is inside the crowd. | harness distance (the note scales with proximity) |
| D11 | cosmetic-but-real | both | river frames | Animals appear to stand on the water or on a rock. | product (depth or wading look) |
| D12 | cosmetic-but-real | both | 03-full-jar-set-down | The carried jar (orange) differs from the set-down jars (brown). | product |

Nothing rendered black or empty. There's no camera below the ground. The HUD overlaps only in D3 on GL.
