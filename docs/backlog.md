# Backlog (non-blocking)

Collected findings that did not pass the intake rule of CLAUDE.md §2 (user
decision 01.09.2026): no reproducible player impact, no security or data risk,
no real blockade, and not a deletion/simplification. Nothing here gates a merge,
a landing, or the closing; entries are batched, deduplicated, and revisited only
when their area is touched anyway or a triage says otherwise.

Format: one line per finding — `- YYYY-MM-DD <source> — <finding>`.

<!-- entries -->
- 2026-09-06 point 689 WebGPU proof runs (`world`, feat/689 at 49df5fb3d) — the two talus-foot
  checks ("the use key at the talus foot fits the impression and solves the puzzle", "a second
  press at the spent socket answers like a wrong place") went red in 3 of 6 runner attempts
  across three sittings (05.09. 23:51 run 1, 06.09. 00:24 run 2, 06.09. 04:34 run 2), always
  both together and always after the wrong-place press had passed, and green in 8 of 8 attempts
  afterwards (3 section-only, 3 full standalone, 2 runner). The runner discards the suite's
  `console errors:` detail, so no attempt recorded what the press said, the mode, or an open
  dialog; the branch now prints that detail on the FAIL line itself. Not reproducible, no player
  impact; revisit with the next red's detail line.
- 2026-07-14 memory r3f-clock-deprecation-watch — the dev console warns `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` (three r185+). It comes from @react-three/fiber v9's internal render-loop Clock, not from this project's code. On a dependency-maintenance pass, check whether a newer @react-three/fiber has migrated its loop to `THREE.Timer`; if so, update and confirm the warning is gone. No change in this repository is expected.
- 2026-09-01 cross-vendor review of point 1036 (GPT-5.6 Sol, merge-with-fixes) — the spawned status regression in `scripts/guard-hooks.test.mjs` covers the ordinary finding path, not the `report-gap` path: no case arranges a gap state and asserts that the findings still print above the gap report. No player impact and no blockade — the composed printing is covered by reading, the gap arrangement is expensive to build in a temp repo.
- 2026-09-03 point 688 picture verification (WebGL 2) — the `speech-hypothesis` section's "the speaking figure itself stands in the frame, under its note (point 485)" reported 5 of 8 frames off (body at 821,761 against a label bottom at 691) on one WebGL 2 polish pass, and passed on the retry and on a fresh first-try run of the same suite at the same HEAD. No reproduction in three passes, no WebGPU sighting, and nothing in the diff touches the label's placement. Worth a look the next time that section is worked: the rotation suggests the label is measured before it has settled, not that it sits wrong.
- 2026-09-03 F6 "BalancierendeFelsen" (seed 516331552, bambara-village, WebGPU) — beside the
  balancing play rocks the frame shows a white quadruped floating above the open water in the
  middle distance, feet off the surface; the report's wildlife section lists 0 animals in
  radius, so the floater sits outside it or is place dressing. Worth a look when wildlife
  anchoring is next worked; archive: local/incoming-f6/BalancierendeFelsen/.
- 2026-09-03 polish frames, both backends (verification/111-village-season-wet.png) — among the
  thin rain streaks one oversized billboard renders as a solid vertical pillar (WebGPU) or a
  broad translucent band (WebGL 2), roughly a hut wide and half the frame tall. Likely a rain
  particle whose scale or near-camera clamp misses; purely aesthetic, no check judges it.
- 2026-09-03 Sol lane down provider-side: the ChatGPT Codex backend answers 404 on
  /backend-api/codex/responses for every request — valid login, any model id, with and
  without -m; the last successful Sol ledger entry is 02.09. ~14:07. A CLI update
  0.147.0→0.153.0 changed nothing and `review-sol --probe` still passes, so the id
  handling is fine and the outage is on the provider. Confirmed 03.09. ~17:10: BOTH
  vendors had incidents on their status pages (user), Anthropic threw 529 Overloaded on
  Opus in the same window, and fresh community reports matched the exact Codex 404.
  Effect: the OpenAI-lane commands exit 3. User decision 03.09.2026: do NOT take
  the §6 same-vendor fallback for this — wait until the providers recover; the work goes
  to the top models. No repo defect; re-probe with a minimal `ask-astra --kind explain`
  before routing OpenAI-lane work. CLOSED 05.09.2026: `codex exec -m gpt-6-astra` answers
  over provider `openai`, and the lane moved to GPT-6 Astra with that measurement.
- 2026-09-04 `mechanism-review.mjs --record` prints the wrong reason when `--model-at`
  is not anchored. The reviewer identity check wants a timestamp that lands on an actual
  `message.model` row of the session transcript; a freshly generated `new Date()` is a
  little later than the last written row and is rejected — but the refusal is the same
  text it prints when the two flags are MISSING ("pass --model-at <ISO> and
  --model-transcript <session.jsonl>"), so the obvious reading is "the flags did not
  arrive" and the same wrong value gets retried. `checkAuthorshipFile` itself returns a
  clean `agreement` for the anchored timestamp, so only the message is wrong. Cost three
  attempts while recording the point-1051 review; the working call reads the anchor out
  of the transcript's last model-bearing row first. Non-blocking: the gate stands down
  under the 01.09. decision, and the record went through once anchored.
- 2026-09-05 session-death hunt — `scripts/finding.mjs --record` appends its MEMORY.md index line
  with `appendFileSync` and no leading newline; when the index has no trailing newline (the
  doc-budget count keeps it that way) the line glues onto the last entry. Cosmetic, fixed by
  hand once; a `\n`-guard before the append would end it.
- 2026-09-05 session-death hunt — `.claude/session-process.json` (the claude-ancestor cache the
  emergency strike reads as its target list) holds 93 entries, most for pids long dead, some
  keyed by fixture ids (`x`, `answer-test-session`, `tool-output-interception-test`) that tests
  wrote into the live file. No harm now that the tests are pinned, but a live registry that
  tests can write is the shape that made 05.09. possible; worth a sweep and a fixture path.
- 2026-09-05 four abandoned feature branches and their worktrees survive their points.
  Measured on main: `feat/834-durable-authoring-lane` (122 commits ahead, last 24.08.) belongs
  to a point that was CUT that same day into 889–895 and landed instead through
  `feat/834-takeover-drills` (merge b8f169f73), so its branch is dead work still holding a
  worktree; `feat/847-brevity-guard-gaps` (17 commits, last 23.08.) belongs to a point that is
  still OPEN, so its work is unmerged rather than dead; `feat/901-superseded-ci-run` and
  `feat/1049-queue-order-rule` each carry a single "Record hostile-test authoring commission"
  commit and nothing else. Nothing is lost — everything is committed and on a branch — but the
  five live worktrees are what makes `batch-doctor --gate` report every unit run INCONCLUSIVE
  under load, which is how they were found. Non-blocking, and deliberately NOT acted on here:
  deleting 847's branch would discard work for an open point, and the "merge ends the branch"
  rule says nothing about a branch whose point was cut. Whoever picks this up decides per
  branch, and asks before any deletion.
