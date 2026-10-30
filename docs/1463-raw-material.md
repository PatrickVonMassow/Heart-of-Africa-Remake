# Raw material for point 1463 — zero-based infrastructure simplification (pack built 2026-10-30T18:30:55.808Z, HEAD 752112147)

## 0. The task (identical for both blind analysts; neither sees the other's work)

Repository: a single-player browser game POC (three.js/WebGPU, TypeScript, Vite, Vitest, Playwright) built
by AI coding agents in an autonomous batch. Over months the agents built a large infrastructure around
the game: scripts/ (guards, hooks, lanes, locks, ledgers, board, daemon, launcher), hooks in
.claude/settings.json, and their docs. The user ordered (28.10.2026): "drastic" simplification from a zero
base — including deleting whole pillars without replacement (e.g. lane routing, batch lock, board,
daemon) and deleting numerous open infrastructure points. Limits on new points were rejected as symptom
treatment; the cause is the infrastructure's own complexity. Under a 01.09.2026 "infrastructure freeze"
mechanisms kept colliding and producing "real blockades", each a regular fix.

Analysis questions:
1. Zero base: what minimum does the game need to be built, verified and landed safely (build, lint,
   unit tests, browser suites on both backends WebGPU + WebGL2, picture check, cross-vendor review,
   landing)? Everything beyond it must justify its existence.
2. Inventory of every mechanism (pillar/family level is fine where individual files belong together):
   the incident it was built for and whether that risk still exists; its cost (lines, refusals in the
   session transcripts, points it caused — count the docs/backlog.md findings and findings-carrier
   entries too, not only work-order points); which other mechanisms it collides with.
3. Cause count over closed and open infrastructure points AND the backlog findings: how many arose from
   interaction between mechanisms rather than from a game problem.
4. Result:
   a. a delete/replace list (standard tools such as GitHub CI and branch protection instead of own guards
      where that fits) — per mechanism: DELETE / REPLACE-BY <x> / KEEP (with reason);
   b. for every open infrastructure point listed in section 4 the verdict "obsolete: yes/no" with a
      short reason (ranges/groups are fine where the reason is the same, but every number must be
      covered);
   c. for every infrastructure entry in docs/backlog.md (section 6) the verdict "obsolete: yes/no" with
      reason; a non-obsolete one that shows a real defect of the REMAINING infrastructure is named;
   d. a teardown order in small steps such that the game stays buildable, testable and landable after
      every step.

Output format: Markdown. Give every proposed action a stable id (D1, D2 … for delete/replace items,
S1, S2 … for teardown steps) so a third model can merge two analyses by id. State measured numbers
from this pack, mark estimates as estimates. Be drastic where the evidence supports it; keep only what
answers a still-existing risk the zero base cannot cover more simply.


## 1. Size
- scripts/ outside scripts/verify: 660 files, 257166 lines (tests included: 279 test files, 122796 lines)
- scripts/verify (game browser suites + their harness): 153 files, 63222 lines
- src/ (the game): 475 files, 132050 lines
- docs/: 83 entries; TASKS.md 16085 lines; docs/tasks-archive.md 35214 lines; CLAUDE.md 197 lines

### Script families (first name segment): files / lines incl. tests
batch 119/58730 · board 48/21435 · mechanism 15/14536 · render 9/13609 · queue 11/7743 · dashboard 25/7115 · chat 18/6886 · context 20/6822 · cross 6/5420 · guard 21/5289 · ci 9/5256 · land 6/4860 · point 6/4525 · measure 12/4520 · author 7/4483 · criticality 4/3327 · model 9/3244 · review 2/3101 · worktree 9/3044 · findings 8/2688 · firewall 7/2543 · detached 4/2298 · closing 6/2252 · lane 8/2108 · pre 3/2093 · wait 11/2048 · handover 13/1991 · guide 3/1915 · decision 4/1880 · rule 10/1854 · blind 4/1814 · user 5/1745 · alert 4/1647 · ask 4/1614 · retro 5/1588 · command 2/1527 · child 4/1526 · doc 4/1491 · cut 4/1478 · carrier 7/1391 · bundle 3/1385 · fold 3/1304 · request 3/1298 · container 4/1286 · tool 10/1233 · throttle 3/1178 · path 3/1099 · timestamp 4/1075 · commission 2/1030 · tasks 7/1022 · vdzk 4/980 · clear 3/937 · branch 3/922 · windows 3/899 · finding 2/877 · deploy 3/847 · pages 4/812 · lock 3/660 · authorship 5/659 · cloud 3/653 · commit 3/616 · window 2/613 · repository 2/607 · defer 2/532 · session 5/528 · build 3/511 · active 2/504 · perf 5/500 · local 2/482 · repo 2/438 · stash 3/427 · picture 3/376 · textureFields 1/357 · git 2/352 · durable 2/325 · push 4/322 · launcher 2/319 · atomic 2/317 · verify 2/300 · four 1/293 · design 1/291 · module 6/287 · check 3/270 · probe 1/251 · settled 3/242 · declared 2/234 · stop 1/219 · help 3/213 · prep 4/211 · permission 3/209 · publish 2/176 · blender 1/174 · cli 2/161 · assertionHealth 2/159 · png 1/138 · focus 1/134 · failure 1/132 · pause 1/126 · resume 1/125 · notify 1/121 · stage 1/112 · cachekeys 1/109 · audit 1/108 · attended 2/96 · deps 2/95 · main 2/93 · quota 1/83 · generate 2/53 · enable 1/38 · recommendation 1/38 · berlin 1/36 · is 1/35 · mandatory 1/31 · event 1/30 · section 1/25

### Every non-test infrastructure script: path · lines · first header comment
- active-work-source.mjs · 131 · Thin I/O adapter for the board's authoritative active-point projection.
- alert-escalation-core.mjs · 334 · THE ESCALATION LADDER (point 434, the remainder of part 1) — the pure half.
- alert-escalation.mjs · 335 · THE ESCALATION LADDER (point 434, remainder of part 1) — the I/O half.
- ask-lane-core.mjs · 419 · THE READ-ONLY PATH TO THE CROSS LANE, GENERALISED BEYOND REVIEWS (point 654, A1).
- ask-lane.mjs · 301 · ASK A LANE FOR PURE TEXT WORK (work-order point 654, A1). `--lane <role>` picks the lane
- assertionHealth.mjs · 70 · Pure detector for assertions whose outcome is FIXED (mostly: that cannot fail).
- atomic-write.mjs · 108 · Atomic JSON writes that survive a Windows moment (point 388, first live
- attended-context-notice.mjs · 46 · Durable once-per-session state for the attended context-ceiling notice.
- audit-check.mjs · 108 · Dependency audit gate (CLAUDE.md §7.1 pt.18). `npm audit` fails the whole run
- author-delegate-core.mjs · 811 · THE AUTHORING LANES' WRAPPER, decided (point 667). Pure half. rule:model-policy@740d83c2
- author-delegate.mjs · 1059 · THE COMMAND THAT LETS AN OUTSIDE LANE AUTHOR A POINT (work-order point 667):
- author-routing-core.mjs · 573 · WHICH AUTHORING LANE A POINT GOES TO (point 667). rule:model-policy@740d83c2
- authorship-check-core.mjs · 278 · PROVE WHO WROTE AN ARTEFACT FROM THE SESSION TRANSCRIPT (point 840).
- authorship-check-io.mjs · 40 · Filesystem adapter shared by every permission path that verifies authorship.
- authorship-check.mjs · 92 · Check an artefact's claimed author against per-message session metadata.
- batch-activity-journal-core.mjs · 114 · The batch activity journal's stable vocabulary and record validation.
- batch-activity-journal.mjs · 145 · Append-only, cross-process batch activity journal.
- batch-adoption-core.mjs · 161 · THE ADOPTION RECORD AND ITS AGREEMENT PROBE — step 4 of the "Ordered work" in
- batch-attempt-lease-core.mjs · 569 · THE ATTEMPT LEASE — step 4 of the "Ordered work" in docs/handover-architecture.md
- batch-autostart-core.mjs · 1644 · HOW THE LAUNCHER SPAWNS A SESSION — the pure half of scripts/batch-autostart.mjs.
- batch-autostart.mjs · 2019 · OS-scheduler launcher (user mandate 22.07.2026) — resurrects a DEAD batch when
- batch-baseline-core.mjs · 96 · Pure reconstruction of today's-path baseline from measured repository history.
- batch-baseline.mjs · 81 · Record one immutable UTC baseline day from today's-path measured history.
- batch-board-core.mjs · 63 · READ-ONLY PROGRESS-BOARD PROJECTION — ordered-work step 10. Pure: it projects
- batch-board.mjs · 42 · Read-only projection of durable batch state for the progress board.
- batch-boundary-core.mjs · 1263 · Pure core of the AUTONOMOUS SESSION BOUNDARY (user 27.07.2026).
- batch-boundary-plane-core.mjs · 51 · DURABLE TWO-PHASE BOUNDARY — ordered-work step 7. The older session-boundary
- batch-boundary-plane.mjs · 71 · 
- batch-boundary.mjs · 1178 · The autonomous session boundary (point 373, user 27.07.2026) — the IO half.
- batch-checkpoint-core.mjs · 98 · CHECKPOINT BARRIER — ordered-work step 6. A persisted barrier counts a
- batch-checkpoint.mjs · 56 · 
- batch-claim-core.mjs · 598 · TAKING THE BATCH BACK INTO THE WINDOW THE USER IS SITTING AT (point 395,
- batch-claim.mjs · 469 · TAKING THE BATCH BACK INTO THE WINDOW THE USER IS SITTING AT (point 395,
- batch-context-samples.mjs · 72 · Independent context measurements for the durable-lane trial.
- batch-daemon-core.mjs · 291 · THE DAEMON'S DECISION CORE — step 3 of the "Ordered work" in
- batch-daemon-drill.mjs · 810 · THE DRILL THAT REPRODUCES THE REAL REGRESSION — docs/handover-architecture.md,
- batch-daemon-failure-drills.mjs · 69 · The bounded failure matrix for ordered-work step 12. Each scenario exercises
- batch-daemon.mjs · 1312 · THE OS LAUNCHER DAEMON — step 3 of the "Ordered work" in
- batch-dispatch-core.mjs · 185 · BOUNDED DISPATCH AND BACKPRESSURE — ordered-work step 5 in
- batch-dispatch.mjs · 91 · Thin dispatcher: read the main-session-authorized queue, decide from daemon
- batch-doctor-core.mjs · 712 · Decision logic for the batch doctor (scripts/batch-doctor.mjs): after a
- batch-doctor-states.mjs · 724 · THE TORN STATES A KILL LEAVES BEHIND (point 443) — the filesystem half.
- batch-doctor.mjs · 574 · Batch doctor (user mandate 24.07.2026): after a parallel-session incident the
- batch-emergency-core.mjs · 253 · THE INDEPENDENT TOTAL-WEDGE DECISION (point 947) — the pure half. It judges
- batch-emergency-drill.mjs · 342 · CHAOS DRILL for point 1048, union entry U21 — the two measured wedges of
- batch-emergency.mjs · 257 · Independent last-resort lane for a total batch wedge. It is invoked hourly
- batch-handover-observe-core.mjs · 341 · Pure core of the END-TO-END HANDOVER OBSERVATION (point 388).
- batch-handover-observe.mjs · 114 · READ-ONLY observer for the end-to-end handover (point 388). It gathers the
- batch-in-flight-core.mjs · 2542 · DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026) —
- batch-in-flight.mjs · 2074 · DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026) —
- batch-landing-core.mjs · 69 · THE LANDING JOURNAL'S STAGES AND CRASH RULE — the slice of step 9 that step 8
- batch-landing-journal-core.mjs · 74 · CRASH-RECOVERABLE SERIAL LANDING — the remainder of ordered-work step 9.
- batch-landing-journal.mjs · 55 · 
- batch-launcher-core.mjs · 273 · Pure core of the LAUNCHER, on both hosts (point 474, user 03.08.2026).
- batch-launcher.mjs · 668 · THE LINUX LAUNCHER (point 474, user 03.08.2026) — a self-scheduling daemon.
- batch-lease-core.mjs · 1061 · THE LEASE AND THE FENCE — pure decision core (layer 1 of
- batch-lock.mjs · 123 · Batch PAUSE state + legacy lock reader.
- batch-metric-events.mjs · 33 · Production bridge from measured operations to the daemon's fenced journal.
- batch-metrics-core.mjs · 91 · UNBIASED DURABLE-LANE METRICS — ordered-work step 11. All operational events
- batch-metrics.mjs · 84 · Seal inputs, record independent context samples, and reconstruct trial metrics.
- batch-owner-work.mjs · 64 · THE OWNER'S CORROBORATION, GATHERED ONCE FOR EVERY DOOR (four-eyes review of
- batch-ownership-core.mjs · 454 · THE OWNERSHIP VERDICT — ONE function, and deliberately only one (point 612,
- batch-pause-core.mjs · 379 · EVERY PARK CARRIES A RESTART CLOCK (point 445, out of the fortnight-alone review).
- batch-pause.mjs · 109 · Deliberate writer for an allowed batch stop.
- batch-progress-guard.mjs · 960 · Stop hook (user mandate 22.07.2026): GUARANTEE the batch never idle-stops.
- batch-reconcile-core.mjs · 334 · SUCCESSOR RECONCILIATION — step 8 of the "Ordered work" in
- batch-reconcile.mjs · 394 · EVIDENCE GATHERING FOR SUCCESSOR RECONCILIATION — step 8 of the "Ordered
- batch-resume-hook-core.mjs · 494 · WHAT THE SESSION-START HOOK SAYS — the deciding half of
- batch-resume-hook.mjs · 525 · SessionStart hook: auto-resume the TASKS.md batch (user mandate 2026-07-14 —
- batch-schema-core.mjs · 960 · THE DURABLE LANE'S SCHEMAS AND INVARIANTS — step 1 of the "Ordered work" in
- batch-singleton-race-worker.mjs · 28 · Test worker for the batch-singleton race tests: attempts one atomic acquire
- batch-singleton.mjs · 2600 · HARD batch singleton (user mandate 24.07.2026, after the e9407cae incident:
- batch-standstill-core.mjs · 388 · 
- batch-standstill-inputs.mjs · 418 · 
- batch-standstill-report.mjs · 170 · 
- batch-state-core.mjs · 321 · THE DURABLE STATE STORE'S DECISION CORE — step 2 of the "Ordered work" in
- batch-state.mjs · 458 · THE DURABLE STATE STORE'S I/O — step 2 of the "Ordered work" in
- batch-trial.mjs · 95 · The measured verdict is the only path in this command that enables the lane.
- blender.mjs · 174 · A PINNED, HEADLESS BLENDER FOR THE ASSET PIPELINE — one idempotent command.
- blind-merge-core.mjs · 460 · Pure accounting for the MERGE of a blind-parallel four-eyes stage (point 634).
- blind-merge.mjs · 415 · The command that MERGES a blind-parallel four-eyes stage — cheaply, and then
- board-archive-rotate.mjs · 57 · Keeps the board's Erledigt section and its decision log at their caps (point
- board-core.mjs · 3430 · Pure half of the board command (point 372): the card edits, plus the footer,
- board-currency-core.mjs · 527 · Pure core of the BOARD-CURRENCY chain (point 400). Side-effect free, so the
- board-distribution-core.mjs · 147 · THE "VERTEILUNG" LINE OF EVERY WORK CARD — pure core.
- board-distribution.mjs · 101 · THE "VERTEILUNG" GATHERER — reads git and the review ledger for the publish
- board-edit-core.mjs · 129 · Dependency-injected controller for a board edit. The core owns no direct I/O,
- board-edit-lock.mjs · 88 · Cross-process serialization for the board's read-modify-write commands.
- board-first-core.mjs · 511 · Pure decision core of the BOARD-FIRST gate (board-first-guard.mjs is the thin
- board-first-guard.mjs · 563 · BOARD-FIRST gate — thin fail-OPEN I/O wrapper around the pure core
- board-heartbeat-core.mjs · 156 · Pure core of the IN-TURN BOARD HEARTBEAT (point 848). Side-effect free, so the
- board-heartbeat.mjs · 256 · The I/O half of the IN-TURN BOARD HEARTBEAT (point 848). The rules live in
- board-liveness-core.mjs · 274 · THE BOARD'S OWN LIVENESS AND PROGRESS LINES — pure core.
- board-liveness.mjs · 144 · THE READER SIDE OF THE BOARD'S LIVENESS AND PROGRESS LINES.
- board-probe-core.mjs · 196 · THE BOARD REACHABILITY PROBE — pure decision core (point 562).
- board-publish.mjs · 533 · THE BOARD TRANSPORT (point 400, delta D) — the board goes live from a script,
- board-queue-core.mjs · 1090 · Pure core of the DERIVED QUEUE (point 400, delta C). Side-effect free, so the
- board-queue.mjs · 294 · THE QUEUE GENERATOR (point 400, delta C) — rebuild the Warteschlange from the
- board-refresher-core.mjs · 107 · The board's self-refresh, as VERSIONED source (point 419 b).
- board-remedy.mjs · 60 · The board's remedy text, in ONE place (point 435).
- board-state-core.mjs · 145 · DERIVED BATCH STATE FOR THE BOARD (point 749).
- board-state.mjs · 86 · THE READER SIDE OF THE DERIVED BOARD STATE (point 749).
- board-structure-core.mjs · 385 · Is the board still STRUCTURALLY intact? (28.07.2026 — three breakages in one
- board-watchdog.mjs · 187 · THE BOARD WATCHDOG (point 400, delta E) — one tick of "is the live board
- board.mjs · 750 · Point 372 — one command for the board instead of six.
- branch-hygiene-core.mjs · 269 · A MERGED BRANCH MUST NOT SURVIVE ITS MERGE — the pure decision half
- branch-hygiene-guard.mjs · 235 · Stop hook: A MERGED BRANCH MUST NOT SURVIVE ITS MERGE. The decision logic is
- build-geodata.mjs · 287 · Geodata preprocessing (design.md §3 "Real geodata and terrain rendering").
- build-info.mjs · 68 · THE REVISION MARKER THE BUILT SITE CARRIES — pure (no I/O), Vitest-covered
- bundle-first-core.mjs · 339 · Pure decision core of the bundle-first Stop-hook guard (bundle-first-guard.mjs
- bundle-first-guard.mjs · 88 · Stop hook: the BUNDLE-FIRST rule (memory `bundle-first-not-new-point`). A new finding joins an existing bundle
- carrier-bell-core.mjs · 100 · THE FINDINGS CARRIER BELL — the deciding half. PURE: no I/O and no clock of
- carrier-reconcile-core.mjs · 263 · Pure layer of the carrier's PROOF and RECONCILIATION (no user order is ever lost).
- carrier-reconcile-fixture.mjs · 58 · Test fixture (Vitest only): a throwaway main checkout with a bare origin, so the
- carrier-reconcile.mjs · 247 · IO layer of the carrier's proof (see carrier-reconcile-core.mjs for the why).
- chat-core.mjs · 699 · THE CHAT CHANNEL'S DECIDING HALF — pure, no I/O; `now` defaults to Date.now()
- chat-delivery-core.mjs · 201 · PER-TOOL-CALL DELIVERY — the deciding half. PURE: no I/O, no clock of its own.
- chat-inbox.mjs · 303 · ONE TICK OF "HAS THE USER WRITTEN ANYTHING" — the reader half of the channel.
- chat-reply.mjs · 160 · THE WRITER HALF — an agent reply on its way to the phone.
- chat-secret.mjs · 113 · THE SHARED SECRET OF THE CHAT CHANNEL — read it, or make one.
- chat-spool.mjs · 384 · THE SPOOL AS A DIRECTORY — one file per message, and why it is not one file.
- chat-watcher-core.mjs · 603 · THE MESSAGE WAKES THE MACHINE — stage 3 of the board chat, deciding half.
- chat-watcher-fingerprint.mjs · 49 · The chat watcher's code fingerprint, read from disk. Imported FIRST by
- chat-watcher.mjs · 734 · THE MESSAGE WAKES THE MACHINE — stage 3 of the board chat, the IO half.
- check-deployed-benchmark.mjs · 45 · Prove the F8 benchmark reached the DEPLOYED build (point 277). The dev hooks
- child-retry-core.mjs · 568 · LAYER 5 — RETRY A CHILD, NOT AN OUTAGE (point 434 part 3), the decision half:
- child-retry.mjs · 347 · LAYER 5 — RETRY A CHILD, NOT AN OUTAGE (point 434 part 3), the I/O half.
- ci-failure-cause-core.mjs · 411 · WHERE a red CI run's cause lies — pure (classifyFailureCause never throws), Vitest-covered in
- ci-gate-verdict-core.mjs · 200 · Pure decision logic of the CI gate verdict step (point 513, user decision
- ci-gate-verdict.mjs · 102 · The CI gate's verdict step (point 513). Runs INSIDE the GitHub runner, after
- ci-status-guard-core.mjs · 1180 · Pure decision logic for the CI-status Stop hook (ci-status-guard.mjs).
- ci-status-guard.mjs · 1046 · Stop hook (user mandate 22.07.2026): GUARANTEE the batch assistant notices
- clear-claim-guard-core.mjs · 256 · A REPLY MAY NOT INVITE A CLEAR WHILE THIS SESSION STILL CLAIMS THE BATCH.
- clear-claim-guard.mjs · 197 · Stop hook: refuse a turn that invites a `/clear` while this session still
- cli-usage.mjs · 67 · The usage text of the commands that used to answer `--help` with something
- closing-guard-core.mjs · 757 · Pure decision logic of the closing-completeness guard (closing-guard.mjs is
- closing-guard.mjs · 160 · Closing-completeness guard — thin fail-OPEN I/O wrapper + CLI around the pure
- closing-reply-core.mjs · 145 · "A blocked turn is ACKNOWLEDGED, not repeated" — the pure half of the
- cloud-switch-core.mjs · 230 · The cloud offload switch (point 1230, user 28.09.2026): when ON, Claude-lane authoring
- cloud-switch.mjs · 190 · The only writer for the cloud offload switch (point 1230).
- command-classify-core.mjs · 940 · DOES THIS COMMAND CHANGE ANYTHING? — the ONE classifier the PreToolUse gates
- commission-guard.mjs · 526 · THE COMMISSIONING GUARD (point 712) — thin fail-OPEN I/O around two pure
- commit-scope-guard-core.mjs · 271 · Pure decision core for the commit-scope guard (user 25.07.2026).
- commit-scope-guard.mjs · 68 · Wrapper for the commit-scope guard (user 25.07.2026). Two modes, one guard:
- container-ask-guard-core.mjs · 487 · Pure decision core of the container-ask Stop-hook guard
- container-ask-guard.mjs · 113 · Stop hook (user 04.08.2026, memory container-work-is-mine): the outgoing
- context-budget-core.mjs · 347 · PRE-CALL CONTEXT ADMISSION — the pure arithmetic shared by every fence call.
- context-budget.mjs · 141 · Runtime transaction for pre-call context admission. Pure arithmetic lives in
- context-fence-core.mjs · 958 · THE CONTEXT FENCE (point 700) — the call classification, pure.
- context-fence-guard.mjs · 414 · THE CONTEXT FENCE (point 700) — thin fail-OPEN I/O wrapper around the pure
- context-fence-override.mjs · 37 · Create one short-lived, session-bound, point-bound, single-use context permit.
- context-fence-permit-core.mjs · 123 · The emergency context permit, pure validation and record shaping.
- context-fence-permit.mjs · 188 · Durable, single-use context permit IO. The live permit and its pending result
- context-incidents-core.mjs · 678 · THE CONTEXT-OVERSHOOT SERIES (point 742) — the pure half.
- context-incidents.mjs · 335 · THE CONTEXT-OVERSHOOT SERIES (point 742) — the IO half plus the ONE command
- context-watermark-core.mjs · 196 · THE CONTEXT WATERMARK (point 675, defeat 3) — the decision half, pure.
- context-watermark.mjs · 166 · THE CONTEXT WATERMARK (point 675, defeat 3) — the IO half. The decision is
- criticality-review-guard-core.mjs · 622 · Pure decision core of the CRITICALITY four-eyes gate (work-order point 298).
- criticality-review-guard.mjs · 993 · Stop hook (work-order point 298), SWITCHED OFF (see below): it once refused a
- cross-review-core.mjs · 1112 · Pure decision core of the CROSS-VENDOR four-eyes review (work-order point 624).
- cross-review.mjs · 1474 · THE ONE COMMAND FOR A CROSS-VENDOR FOUR-EYES REVIEW (work-order point 624).
- cut-account-attest.mjs · 177 · Preserve the floor witnesses while the platform's expiring transcript exists.
- cut-account-core.mjs · 384 · Pure parser and judge for the CUT ACCOUNT of work-order point 757, plus the
- dashboard-card-topic-guard-core.mjs · 183 · Pure decision logic of the dashboard-card-topic Stop-hook guard
- dashboard-card-topic-guard.mjs · 58 · Stop hook (user mandate 23.07.2026): GUARANTEE each batch-dashboard card
- dashboard-conciseness-guard-core.mjs · 180 · Pure decision logic of the dashboard-conciseness Stop-hook guard
- dashboard-conciseness-guard.mjs · 63 · Stop hook (user mandate 23.07.2026): GUARANTEE the batch dashboard's now/
- dashboard-guard-core.mjs · 1115 · Pure decision logic of the dashboard Stop-hook guard (dashboard-guard.mjs is
- dashboard-guard-fixtures.mjs · 113 · Shared fixtures for the dashboard Stop-hook guard: a VALID board in the real
- dashboard-guard.mjs · 364 · Stop hook (user mandate 21.07.2026, hardened 22.07.2026): GUARANTEE the batch
- dashboard-integrity-guard-core.mjs · 463 · Pure decision logic of the dashboard-INTEGRITY Stop-hook guard
- dashboard-integrity-guard.mjs · 128 · Stop hook (user mandate 22.07.2026): the dashboard must be TRUSTABLE, not
- dashboard-point-reader-core.mjs · 90 · One grammar for point ownership recovered from FREE dashboard title text.
- dashboard-publish.mjs · 115 · LEGACY (claude.ai artifact, retired 29.07.2026) — the board's transport is
- dashboard-reminder-core.mjs · 183 · The text the UserPromptSubmit hook injects into every user prompt of the batch
- dashboard-reminder-hook.mjs · 197 · UserPromptSubmit hook (user mandate 16.07.2026, after repeated dashboard
- dashboard-state.mjs · 94 · Shared state I/O for the dashboard-currency toolchain (the dashboard guards,
- dashboard-sync-core.mjs · 341 · Pure decision logic of the dashboard SYNC Stop-hook guard (dashboard-sync.mjs
- dashboard-sync.mjs · 135 · Stop hook (point 308, user mandate): the »Woran ich gerade arbeite« card must
- decision-card-guard-core.mjs · 721 · THE CHAT IS AN INBOX, NOT A NOTICE-BOARD — pure decision half of the Stop hook
- decision-card-guard.mjs · 397 · Stop hook (point 421, user ruling 29.07.2026): a request for a user DECISION
- decision-log-core.mjs · 128 · MEASURED EXPIRY FOR AUTOMATIC DECISIONS (point 936).
- declared-wait.mjs · 100 · THE WAIT DECLARED BY THE COMMAND THAT WAITS (point 1308, U5).
- defer-for-user.mjs · 331 · DEFER ONE NARROW CONFIRMATION — advisory questions are decided and recorded.
- deploy-staleness-core.mjs · 285 · IS THE DEPLOYED SITE STILL THE COMMIT `main` STANDS AT? — pure decision logic
- deploy-staleness.mjs · 281 · THE STALE-SITE WATCHDOG (point 528) — one tick of "does the deployed site
- deps-preflight.mjs · 53 · A ONE-LINE DIAGNOSIS INSTEAD OF "'tsc' is not recognized" (point 429, bonus).
- detached-agent.mjs · 482 · THE COMMON WORKER CONTRACT — step 3 of the "Ordered work" in
- detached-escape-drill.mjs · 683 · WHY A CHILD DIES WITH THE SESSION THAT SPAWNED IT — measured, not argued.
- doc-budget-core.mjs · 881 · Pure decision core for the document-budget guard (user 26.07.2026).
- doc-budget-guard.mjs · 46 · Stop hook: the constantly-read documents stay within their budgets
- doc-corpus.mjs · 45 · The documents a work-order `§` may point at (point 365 A).
- durable-lane-flag-core.mjs · 141 · THE ACTIVATION FLAG OF THE DURABLE AUTHORING LANE, and the interlock that keeps
- enable-hooks.mjs · 38 · Wire the versioned git hooks (point 302). Runs from package.json's `prepare`
- finding.mjs · 508 · Record a finding so it outlives the session that made it.
- findings-core.mjs · 618 · Pure decision core of the findings-durability check.
- findings-fixtures.mjs · 449 · Cut the findings-guard's calibration fixtures out of the REAL transcript corpus,
- findings-guard.mjs · 171 · Stop hook: a finding must not die with the session that made it.
- findings-paths.mjs · 88 · Where the findings carrier lives, and who owns the batch.
- findings-request-core.mjs · 406 · Pure layer of the carrier's REQUEST kind (point 462).
- firewall-allow.mjs · 379 · ADDITIVE allowlist top-up for the dev container's egress firewall.
- firewall-guard-core.mjs · 431 · Pure decision core of the firewall guard (firewall-guard.mjs is the thin
- firewall-guard.mjs · 91 · PreToolUse(Bash) guard: no live firewall command is typed by hand.
- firewall-rebuild.mjs · 497 · DETACHED rebuild of the dev container's egress firewall, with a fail-OPEN
- focus.mjs · 134 · Declare/confirm the CURRENT work focus — the primitive the dashboard Stop
- fold-point-core.mjs · 411 · FOLDING A POINT AWAY, as pure decisions (point 614).
- fold-point.mjs · 379 · FOLD A POINT AWAY — tick, archive move and Erledigt card in one command (point 614).
- generate-surface-textures.mjs · 28 · Generates the tileable settlement-surface textures (albedo + normal map)
- generate-terrain-textures.mjs · 25 · Generates the tileable PBR ground textures (albedo + normal map) used by
- git-tracked.mjs · 139 · Is a path a TRACKED, CLEAN repository artefact?
- guard-compatibility-core.mjs · 108 · NO TWO GUARDS MAY JOINTLY DEMAND AND FORBID ONE ACTION (point 1048, union
- guard-duty-core.mjs · 26 · Pure scope shared by Stop guards that impose WORK rather than merely inspect
- guard-duty.mjs · 9 · The ONE I/O reading for mandatory Stop-guard scope. Guards pass the result to
- guard-health-core.mjs · 598 · Pure decision core of the guard-health check.
- guard-health-guard.mjs · 215 · Stop hook: no enforcer may sit in the tree unable to fire.
- guard-inventory-core.mjs · 265 · Pure core of the guard/memory INVENTORY — the mechanical first step of the
- guard-inventory.mjs · 111 · The enumerating half of the periodic guard & memory audit (point 297).
- guard-preflight-core.mjs · 365 · Pure core of the guard preflight (point 365 D, user 26.07.2026).
- guard-preflight-expected.mjs · 39 · The guards the preflight is expected to register.
- guard-preflight.mjs · 454 · "Would a guard block me right now?" — asked BEFORE the action, not at the
- guard-registration-core.mjs · 241 · PURE core of the guard-registration check (20.08.2026).
- guard-registration-guard.mjs · 54 · Wrapper for the guard-registration check (pre-commit). The decision is pure
- guide-brevity-core.mjs · 1302 · Pure decision core of the guide-brevity guard.
- guide-brevity-guard.mjs · 78 · Stop hook: the beginner's guide may not grow back into a project chronicle.
- handover-attribution-core.mjs · 256 · Pure state machine for token- and elapsed-time attribution across one handover.
- handover-attribution.mjs · 300 · Fail-open runtime recorder for the outgoing boundary and successor ramp.
- handover-budget-core.mjs · 73 · Pure arithmetic for the measured handover cap: first refusal to committed boundary.
- handover-budget.mjs · 70 · Fail-open runtime evidence for the measured handover cap and its overruns.
- handover-card-contract.mjs · 16 · The one valid handover-card answer when the work order has no open point.
- handover-repair-loop-core.mjs · 159 · Pure decisions for the two feedback loops measured on 20.08.2026.
- handover-repair-loop.mjs · 237 · I/O half for the claim-survival and guard-repair observers. It is called by
- help-core.mjs · 102 · ONE INDEX OVER EVERY TOP-LEVEL scripts/*.mjs COMMAND — the pure half of scripts/help.mjs.
- help.mjs · 49 · FIND A REPOSITORY COMMAND WITHOUT LISTING EVERY SCRIPT — the I/O half.
- hooks/berlin-timestamp.cjs · 36 · UserPromptSubmit hook (user-global): inject the current Europe/Berlin timestamp
- hooks/check-reply-timestamp.cjs · 83 · Stop hook (user-global, soft enforcement): after each turn, check whether the
- is-main.mjs · 35 · Was this module started directly, or imported? (point 365 D)
- land-cleanup-core.mjs · 411 · WHICH WORKTREE MAY THE LANDING DELETE? PURE (point 629).
- land-point-core.mjs · 649 · THE LANDING CHAIN, as pure decisions (point 594).
- land-point.mjs · 1464 · LAND A FINISHED POINT — the whole chain, one command (point 594).
- lane-routing-core.mjs · 468 · THE SWITCH THAT MOVES WORK BETWEEN THE MAIN CHAIN AND THE CROSS LANE (point 654,
- lane-routing.mjs · 218 · THE SWITCH THAT MOVES WORK TOWARDS THE CROSS LANE (work-order point 654, A2; widened by 667).
- lane-switch-core.mjs · 340 · The per-lane switch decisions (may a lane be used at all), plus the
- lane-switch.mjs · 127 · The only writer for the shared per-lane switch decisions.
- launcher-stall-core.mjs · 155 · Pure decision core of the launcher's OWN stall alarm (point 859).
- local-bin.mjs · 191 · WHERE A LOCALLY INSTALLED TOOL ACTUALLY IS — one resolver, not five copies.
- lock-heartbeat-hook.mjs · 386 · PostToolUse hook (matcher: every tool). Duties, each isolated and never
- lock-release-hook.mjs · 30 · SessionEnd hook: when a session ends (the user closes the VS Code window /
- main-checkout-core.mjs · 45 · The one answer to "is there a different, main checkout behind this tree?".
- mandatory-duty-core.mjs · 31 · Pure scope shared by Stop guards that impose WORK rather than merely inspect
- measure-context-cost-core.mjs · 370 · WHAT THE POINT BOUNDARY WAS SUPPOSED TO BUY (point 373, acceptance condition:
- measure-context-cost.mjs · 268 · DID THE POINT BOUNDARY ACTUALLY BUY ANYTHING (point 373)? The IO half.
- measure-picture-cost.mjs · 257 · Measures what ONE rendered-picture check costs (work-order point 361, measure phase).
- measure-point-cost-core.mjs · 673 · COST PER FINISHED POINT (work-order point 701), pure parsing and aggregation.
- measure-point-cost.mjs · 414 · REPEATABLE COST PER FINISHED POINT (work-order point 701), IO wrapper.
- measure-task-cost-core.mjs · 745 · WHERE THE TIME AND THE TOKENS OF ONE TASK ACTUALLY GO (point 572, phase 1). The
- measure-task-cost.mjs · 285 · WHERE THE TIME AND THE TOKENS OF ONE TASK GO (point 572, phase 1). The IO half.
- mechanism-review-core.mjs · 2432 · Pure decision core of the four-eyes gate for MECHANISMS (point 377).
- mechanism-review-guard-gap-core.mjs · 371 · THE REVIEW-GAP RULING (point 714): what the mechanism gate does while a
- mechanism-review-guard-gap.mjs · 313 · THE REVIEW-GAP MEASUREMENT (point 714) — the impure half of the ruling whose
- mechanism-review-guard.mjs · 967 · Stop hook (point 377): the four-eyes rule for a MECHANISM gets its own
- mechanism-review-merge-core.mjs · 107 · SAFE THREE-WAY MERGE FOR THE APPEND-ONLY REVIEW LEDGER.
- mechanism-review-merge.mjs · 20 · Git merge driver for .claude/mechanism-reviews.jsonl.
- mechanism-review-range-core.mjs · 631 · Pure planning core for end-state mechanism reviews.
- mechanism-review.mjs · 1602 · The record half of the four-eyes gate on mechanisms (point 377).
- model-guard-core.mjs · 775 · Pure decision core of the serving-model tripwire (point 309). rule:model-policy@740d83c2
- model-guard.mjs · 228 · Stop hook (point 309): catch a silently DEGRADED serving model at its FIRST
- model-handoff-core.mjs · 208 · Pure state machine for a forbidden-serving-model handoff.
- model-lanes.mjs · 384 · THE ONE PLACE THAT NAMES CONCRETE MODELS. rule:model-policy
- model-trailer-gate.mjs · 57 · The commit-msg gate on author and reviewer MODEL trailers (points 397 b / 425 a / 982).
- module-link-check.builtin-fixture.mjs · 7 · FIXTURE, never loaded by anything that runs: `readFileSyc` is a typo, and
- module-link-check.default-fixture.mjs · 7 · FIXTURE, never loaded by anything that runs: `module-link-check.mjs` has no
- module-link-check.fixture.mjs · 8 · FIXTURE, never imported by anything that runs. It reproduces the exact defect
- module-link-check.mjs · 143 · DO A MODULE'S NAMED IMPORTS ACTUALLY EXIST? (22.08.2026)
- module-link-check.unresolvable-fixture.mjs · 7 · FIXTURE, never loaded by anything that runs: the target does not exist at all.
- notify.mjs · 121 · Out-of-band notification channel (scarce-lane audit finding D — the design could
- pages-deploy-unblock-core.mjs · 208 · Pure decision logic for clearing a stuck GitHub Pages deployment
- pages-deploy-unblock.mjs · 227 · Clear a stuck GitHub Pages deployment — the handle the repository did not
- path-scope-core.mjs · 513 · Pure decision core of the path-scope guard (path-scope-guard.mjs is the thin
- path-scope-guard.mjs · 147 · PreToolUse guard: the project works inside a named set of directories, and a
- pause-retry-drill.mjs · 126 · THE RESTART-CLOCK DRILL (point 445).
- perf-bench.mjs · 240 · Bird's-eye framerate benchmark + CONFIG SWEEP (point 276).
- perf-bisect.sh · 44 · Measure one commit's bird's-eye frame cost in the throwaway bench worktree
- perf-breakdown.mjs · 112 · Per-object triangle breakdown of the bird's-eye frame (point 276). Walks the
- perf-lod-experiment.sh · 38 · Measure one terrain-LOD variant in the bench worktree (point 276). The
- perf-structure.mjs · 66 · Structural frame-load probe (point 276): what the renderer actually SUBMITS
- permission-autogrant-core.mjs · 100 · Pure core of the permission auto-grant (see scripts/permission-autogrant.mjs).
- permission-autogrant.mjs · 45 · PermissionRequest hook: grants what the harness would otherwise ask the user about.
- picture-stability-core.mjs · 97 · Pure decision logic of the capture-stability probe (picture-stability.mjs is
- picture-stability.mjs · 133 · Capture-stability probe (point 361): run one verify suite TWICE on identical
- png.mjs · 138 · Minimal dependency-free PNG codec for the geodata preprocessing scripts.
- point-brief-core.mjs · 1744 · Pure core of the point brief (point 365 A, user 26.07.2026).
- point-brief.mjs · 257 · I/O wrapper for the point brief (point 365 A): print ONE ready delegation
- point-proof-core.mjs · 199 · Pure decision core of the POINT-PROOF gate (work-order point 437 C).
- point-proof-guard.mjs · 213 · POINT-PROOF gate (work-order point 437 C) — thin fail-OPEN I/O wrapper + CLI
- pre-push-gate-core.mjs · 727 · Pure decision logic of the pre-push gate (point 302): which checks a push
- pre-push-gate.mjs · 343 · Pre-push wrapper for the fast gate (point 302). Reads git's pre-push stdin,
- prep-arm-hook.mjs · 50 · PostToolUse[Bash|PowerShell] hook (user mandate 21.07.2026): AUTO-ARM the waiting-time
- prep-guard-core.mjs · 39 · Pure decision core of the waiting-time prep guard (user mandate 21.07.2026;
- prep-guard.mjs · 91 · Stop hook (user mandate 21.07.2026): GUARANTEE waiting-time prep. Mirrors the
- probe-label-fusion.mjs · 251 · DOES THE DRAWN LABEL MATCH THE DECLUTTER'S MODEL? (point 1067)
- publish-outcome-core.mjs · 89 · Point 399 — did the publish actually SUCCEED?
- push-arrival-core.mjs · 93 · Pure decision core of the push-arrival guard (rule audit 25.07.2026, priority
- push-arrival-guard.mjs · 99 · Stop hook (rule audit 25.07.2026, mechanism #1): a turn may not end while
- queue-calibration-core.mjs · 1344 · WHAT A QUEUE CARD PROMISES, MEASURED AGAINST WHAT THE WORK TOOK (point 730).
- queue-calibration.mjs · 458 · THE QUEUE'S ESTIMATES, MEASURED AGAINST THE BATCH THAT LANDS THEM (point 730).
- queue-order-guard-core.mjs · 457 · Pure decision logic of the queue-order Stop-hook guard (queue-order-guard.mjs
- queue-order-guard.mjs · 138 · Stop hook (user mandate 22.07.2026): GUARANTEE the batch rules the assistant
- queue-rank-core.mjs · 1072 · THE APPEND GATE (point 590) — an appended point is ranked deliberately — and
- queue-rank.mjs · 405 · THE APPEND GATE (point 590) AND THE RELEASE BOUNDARY (point 789) — the CLI.
- quota-drill.mjs · 83 · THE FAKE-SIGNATURE DRILL (point 444, 30.07.2026).
- render-verify-charges.mjs · 2208 · THE RED CHARGE LEDGER — which currently-known red belongs to which OPEN
- render-verify-core.mjs · 2168 · Pure decision logic of the render-verify Stop-hook guard
- render-verify-guard.mjs · 1096 · Stop hook (user mandate 22.07.2026): GUARANTEE that no GUI/rendering/shader
- render-verify-recorder.mjs · 891 · Mechanical evidence that a verify suite REALLY ran on a given renderer
- render-verify-state.mjs · 69 · Shared state I/O for the render-verify (both-backends) toolchain
- repo-paths.mjs · 173 · Repo paths that follow the checkout the process was GIVEN.
- repository-integrity.mjs · 224 · 
- request-approval-guard-core.mjs · 420 · Pure decision core of request-approval-guard.mjs: may this command deposit a
- request-approval-guard.mjs · 153 · PreToolUse(Bash|PowerShell) guard: a chat session deposits a request through
- resume-batch.mjs · 125 · THE SUCCESSOR'S STARTUP — step 8 of the "Ordered work" in
- retro-core.mjs · 622 · Pure logic of the retrospective-currency toolchain: the sources fingerprint,
- retro-currency-guard.mjs · 137 · Stop hook: GUARANTEE the retrospective document
- retro-refresh.mjs · 81 · Refresh the retrospective's auto-generated section
- retro-sources.mjs · 135 · Shared fs/git source collector for the retrospective-currency toolchain
- review-material-core.mjs · 1489 · WHAT A REVIEW ROUND ACTUALLY CARRIED — the material budget, its accounting,
- rule-echo-core.mjs · 431 · WHEN A RULE CHANGES, EVERY PLACE THAT RESTATES IT MUST CHANGE WITH IT.
- rule-echo-guard.mjs · 153 · Stop hook: a rule that moved drags its restatements with it (user 17.08.2026).
- rule-echo.mjs · 179 · THE COMMAND BESIDE THE RULE-ECHO GUARD (user 17.08.2026).
- rule-review-core.mjs · 149 · Pure decision core of the rule-corpus review guard.
- rule-review-guard.mjs · 81 · Stop hook: the rule corpus gets read through periodically, not when someone
- rule-review-state.mjs · 58 · Where the rule-review bookkeeping lives, and how the corpus is counted.
- rule-review.mjs · 92 · Attestation CLI for the periodic rule-corpus review.
- section-tag-core.mjs · 25 · The tag a browser suite appends to a result line so a failing check names the
- session-context-ceiling-core.mjs · 128 · SESSION CLASS POLICY FOR THE CONTEXT CEILING (point 748) — pure.
- session-death-core.mjs · 62 · Pure reading of "why did the interactive session die" out of the batch
- session-death.mjs · 80 · "Why did the interactive session die?" — the recurring lookup as a command
- settled-owner-rulings.mjs · 53 · The single tracked register of owner decisions that must not be put back to
- settled-ruling-core.mjs · 91 · 
- stash-sweep-core.mjs · 136 · Pure layer of the ONE-TIME STASH SWEEP (no user order is ever lost, 21.10.2026).
- stash-sweep.mjs · 184 · ONE-TIME STASH SWEEP (no user order is ever lost, 21.10.2026) — the IO half.
- tasks-archive-guard-core.mjs · 168 · Pure decision core for the tasks-archive guard (user 26.07.2026).
- tasks-archive-guard.mjs · 38 · Stop hook: the work order stays split — TASKS.md open, docs/tasks-archive.md
- tasks-source.mjs · 89 · One place that knows the work order is stored in TWO files (user 26.07.2026).
- tasks-spec-guard-core.mjs · 263 · Pure decision logic of the tasks-spec Stop-hook guard (tasks-spec-guard.mjs
- tasks-spec-guard.mjs · 141 · Stop hook: GUARANTEE the tasks-spec-final-state-only rule the assistant broke
- textureFields.mjs · 357 · Shared texture-baking core: periodic (tileable) noise fields, the material
- throttle-probe-core.mjs · 372 · IS THIS CHECK LOAD-DEPENDENT? — the pure half of the throttle probe (point 640).
- throttle-probe.mjs · 451 · THE THROTTLE PROBE (point 640) — answer "was that red just load?" with a
- timestamp-guard-core.mjs · 282 · Pure decision logic of the timestamp Stop-hook guard (timestamp-guard.mjs):
- timestamp-guard.mjs · 149 · Stop hook (user mandate 23.07.2026, ninth escalation of the chat-timestamp
- timestamp-race-fixture.mjs · 134 · Builder for scripts/fixtures/timestamp-guard-302ms-race.json — the replay of
- tool-output-budget-core.mjs · 221 · Pure output-budget logic for the PreToolUse interception in
- tool-output-budget-launch.mjs · 164 · Launch boundary for tool-output-budget.mjs. A budget worker which cannot be
- tool-output-budget.mjs · 119 · Generic spill-to-log runner used by the path-scope PreToolUse hook. The hook
- tool-output-intercept-core.mjs · 128 · Pure PreToolUse input rewriting for the large producers named by the output
- tool-output-log-retention.mjs · 39 · Retention for the tool-output budget's spill logs. Every captured producer
- tool-output-shell.mjs · 14 · always PowerShell on win32) without
- user-gate-core.mjs · 805 · THE TYPED USER GATE — advice continues; only a real confirmation waits.
- user-said-core.mjs · 151 · WHAT THE USER SAID, AND WHEN — the pure half of scripts/user-said.mjs.
- user-said.mjs · 123 · WHAT THE USER SAID, AND WHEN — the CLI half. Rationale: scripts/user-said-core.mjs.
- vdzk-admissibility-core.mjs · 152 · WHAT MAY STAND UNDER "VON DIR ZU KLÄREN". PURE.
- vdzk-answer.mjs · 210 · Carrier for an answer written into a session that may not edit the board.
- verify-bringup.mjs · 110 · Host bring-up for the browser verification (point 475): `npm run verify:bringup`.
- verify-host-setup.sh · 190 · Bring this host's picture verification up to BOTH backends and onto the real GPU.
- villager/build.mjs · 156 · THE VILLAGER ASSET PIPELINE — one command reproduces public/models/villager*.glb.
- wait-command-core.mjs · 128 · THE WAIT THAT CAN NEVER RETURN (point 1048, union entry U14) — the pure half.
- wait-command-guard.mjs · 81 · PreToolUse(Bash, PowerShell) guard: no hand-rolled wait for a process (point 1048).
- wait-lease-core.mjs · 367 · ONE WAIT PER SESSION AND RUN (point 1048, union entries U11, U12, U13) - the
- wait-lease.mjs · 285 · THE WAIT REGISTRY (point 1048, union entries U11, U12, U13) - the IO half.
- wait-marker-core.mjs · 163 · THE WAIT MARKER A HOOK SETS (point 592) — the pure decision half.
- wait-marker.mjs · 156 · THE WAIT MARKER A HOOK SETS (point 592) — the IO half.
- window-hide-core.mjs · 322 · NO CONSOLE WINDOW MAY STEAL THE USER'S FOCUS (point 401, user report 28.07.2026:
- windows-task-core.mjs · 326 · THE BOOT PATH ON THE WINDOWS HOST, the mutual watch between the two
- windows-task-watch.mjs · 160 · THE MUTUAL WATCH between the two Windows scheduled tasks (point 447).
- windows/stage-host-commands.mjs · 112 · Stages the Windows host commands where the user can actually run them.
- worktree-bootstrap-core.mjs · 88 · WHAT A FRESH AGENT WORKTREE OWES ITS GATES — the decision, pure.
- worktree-bootstrap.mjs · 93 · GIVE A FRESH AGENT WORKTREE ITS DEPENDENCIES — one command, idempotent.
- worktree-cleanup-core.mjs · 500 · AN AGENT'S CLEANUP MUST NOT REACH OUTSIDE ITS WORKTREE — the pure half
- worktree-cleanup.mjs · 830 · THE ONE WAY AN AGENT WORKTREE IS REMOVED (point 429). The decision logic is
- worktree-reminder-core.mjs · 50 · Pure decision logic of the worktree-reminder PreToolUse hook
- worktree-reminder.mjs · 36 · PreToolUse hook (matcher: Agent): remind the session to use isolated git

## 2. Hooks in .claude/settings.json (event / matcher / command)
- SessionStart [] node scripts/batch-resume-hook.mjs
- SessionEnd [] node scripts/lock-release-hook.mjs
- UserPromptSubmit [] node scripts/dashboard-reminder-hook.mjs
- Stop [] node scripts/model-guard.mjs
- Stop [] node scripts/push-arrival-guard.mjs
- Stop [] node scripts/dashboard-guard.mjs
- Stop [] node scripts/prep-guard.mjs
- Stop [] node scripts/batch-progress-guard.mjs
- Stop [] node scripts/render-verify-guard.mjs
- Stop [] node scripts/mechanism-review-guard.mjs
- Stop [] node scripts/criticality-review-guard.mjs
- Stop [] node scripts/queue-order-guard.mjs
- Stop [] node scripts/tasks-spec-guard.mjs
- Stop [] node scripts/tasks-archive-guard.mjs
- Stop [] node scripts/doc-budget-guard.mjs
- Stop [] node "$CLAUDE_PROJECT_DIR/scripts/bundle-first-guard.mjs"
- Stop [] node "${CLAUDE_PROJECT_DIR:-.}/scripts/rule-echo-guard.mjs"
- Stop [] node scripts/dashboard-conciseness-guard.mjs
- Stop [] node scripts/dashboard-card-topic-guard.mjs
- Stop [] node scripts/dashboard-integrity-guard.mjs
- Stop [] node scripts/ci-status-guard.mjs
- Stop [] node scripts/timestamp-guard.mjs
- Stop [] node scripts/retro-currency-guard.mjs
- Stop [] node scripts/guide-brevity-guard.mjs
- Stop [] node scripts/rule-review-guard.mjs
- Stop [] node scripts/findings-guard.mjs
- Stop [] node scripts/decision-card-guard.mjs
- Stop [] node scripts/container-ask-guard.mjs
- Stop [] node "$CLAUDE_PROJECT_DIR/scripts/clear-claim-guard.mjs"
- Stop [] node scripts/branch-hygiene-guard.mjs
- Stop [] node scripts/guard-health-guard.mjs
- Stop [] node scripts/dashboard-sync.mjs
- PreToolUse [Edit|Write|MultiEdit|NotebookEdit|Agent|Bash|PowerShell] node scripts/board-first-guard.mjs
- PreToolUse [Agent] node scripts/worktree-reminder.mjs
- PreToolUse [Agent|Task|Bash|PowerShell] node "$CLAUDE_PROJECT_DIR/scripts/commission-guard.mjs"
- PreToolUse [Bash|PowerShell|Read|Edit|Write|MultiEdit|NotebookEdit|Glob|Grep] node "$CLAUDE_PROJECT_DIR/scripts/path-scope-guard.mjs"
- PreToolUse [Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell] node "$CLAUDE_PROJECT_DIR/scripts/point-proof-guard.mjs"
- PreToolUse [Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Bash|PowerShell|Read] node "$CLAUDE_PROJECT_DIR/scripts/context-fence-guard.mjs"
- PreToolUse [Bash] node scripts/closing-guard.mjs
- PreToolUse [PowerShell] node scripts/closing-guard.mjs
- PreToolUse [Edit|Write|MultiEdit|NotebookEdit] node scripts/closing-guard.mjs
- PreToolUse [Bash] node "$CLAUDE_PROJECT_DIR/scripts/wait-command-guard.mjs"
- PreToolUse [PowerShell] node "$CLAUDE_PROJECT_DIR/scripts/wait-command-guard.mjs"
- PreToolUse [Bash] node scripts/firewall-guard.mjs
- PreToolUse [PowerShell] node scripts/firewall-guard.mjs
- PreToolUse [Bash|PowerShell] node "$CLAUDE_PROJECT_DIR/scripts/request-approval-guard.mjs"
- PostToolUse [Bash] node scripts/prep-arm-hook.mjs
- PostToolUse [PowerShell] node scripts/prep-arm-hook.mjs
- PostToolUse [] node scripts/lock-heartbeat-hook.mjs
- PermissionRequest [] node "$CLAUDE_PROJECT_DIR/scripts/permission-autogrant.mjs"
Git hooks (core.hooksPath scripts/git-hooks): commit-msg, pre-commit, pre-push

## 3. Refusals measured in all 1360 session transcripts (approximate; a rendered reminder may double-count)
### Stop-hook blocking errors per script
1433 scripts/dashboard-guard.mjs
   1382 scripts/batch-progress-guard.mjs
   1189 scripts/ci-status-guard.mjs
   1159 scripts/timestamp-guard.mjs
   1143 scripts/retro-currency-guard.mjs
   1078 scripts/push-arrival-guard.mjs
    614 scripts/findings-guard.mjs
    497 scripts/decision-card-guard.mjs
    495 scripts/render-verify-guard.mjs
    282 scripts/dashboard-integrity-guard.mjs
    232 scripts/queue-order-guard.mjs
    160 
    125 scripts/prep-guard.mjs
     70 scripts/model-guard.mjs
     49 scripts/dashboard-card-topic-guard.mjs
     41 scripts/doc-budget-guard.mjs
     39 scripts/dashboard-sync.mjs
     36 scripts/branch-hygiene-guard.mjs
     27 scripts/rule-review-guard.mjs
     25 scripts/guide-brevity-guard.mjs
     25 scripts/dashboard-conciseness-guard.mjs
     15 scripts/tasks-archive-guard.mjs
      5 scripts/container-ask-guard.mjs
      1 scripts/tasks-spec-guard.mjs
### PreToolUse refusals by message head (top 70 of 138)
   2909 BOARD FIRST — the board must describe the work BEFORE it s
   2420 THE BOARD CLAIMS NOTHING IS RUNNING — and this call would 
    416 THE BOUNDARY IS COMMITTED (the context watermark) — `batch
    352 request-approval-guard (non-canonical): this command may dep
    342 THIS WAIT CAN NEVER RETURN. The loop searches for 
    318 POLLING FOR A PROCESS IS NOT HOW THIS REPOSITORY WAITS. A lo
    304 MAIN WRITE REFUSED — this session holds no batch lock. The
    252 PAST THE CONTEXT WATERMARK, NEW WORK IS DENIED (point 700): 
     83 request-approval-guard (no-proposal): no assistant reply in 
     58 A SLOT IS NOT FREE UNTIL ITS BRANCH IS GONE: 3 open feat/* b
     18 BATCH OWNERSHIP STAND-DOWN — another live session (fcb781a
     12 BATCH OWNERSHIP STAND-DOWN — another live session (1438395
     10 BATCH OWNERSHIP STAND-DOWN — another live session (0d6d5da
      8 CLOSING INCOMPLETE — refusing to create/push a version tag
      7 PATH OUT OF SCOPE. This call reaches a place the project doe
      6 THE BOUNDARY IS COMMITTED (point 1368) — `batch-boundary.m
      6 THE BOUNDARY IS COMMITTED (point 1121) — `batch-boundary.m
      6 BATCH OWNERSHIP STAND-DOWN — another live session (6e1bed4
      6 BATCH OWNERSHIP STAND-DOWN — another live session (4b0a3d9
      6 BATCH OWNERSHIP STAND-DOWN — another live session (3650ab0
      6 BATCH OWNERSHIP STAND-DOWN — another live session (2f18ce5
      4 request-approval-guard (no-approved): the deposit 
      4 THE BOUNDARY IS COMMITTED (point 1403) — `batch-boundary.m
      4 THE BOUNDARY IS COMMITTED (point 1307) — `batch-boundary.m
      4 THE BOUNDARY IS COMMITTED (point 1305) — `batch-boundary.m
      4 THE BOUNDARY IS COMMITTED (point 1272) — `batch-boundary.m
      4 FENCED OUT — this session no longer owns the batch. It hel
      4 COMMISSIONING POINT 1317 ANSWERS TO NOTHING: the work order 
      4 COMMISSIONING POINT 1297 ANSWERS TO NOTHING: the work order 
      4 COMMISSIONING POINT 1288 ANSWERS TO NOTHING: the work order 
      4 COMMISSIONING POINT 1241 ANSWERS TO NOTHING: the work order 
      4 COMMISSIONING POINT 1213 ANSWERS TO NOTHING: the work order 
      4 BATCH OWNERSHIP STAND-DOWN — another live session (ff4a240
      4 BATCH OWNERSHIP STAND-DOWN — another live session (cac94d2
      4 BATCH OWNERSHIP STAND-DOWN — another live session (4dc5437
      4 BATCH OWNERSHIP STAND-DOWN — another live session (37e0c2b
      4 A SLOT IS NOT FREE UNTIL ITS BRANCH IS GONE: 4 open feat/* b
      3 request-approval-guard (no-title): a --request in this comma
      3 COMMISSIONING POINT 1432 ANSWERS TO NOTHING: the work order 
      3 COMMISSIONING POINT 1414 ANSWERS TO NOTHING: the work order 
      2 request-approval-guard could not judge this call (stdin unre
      2 request-approval-guard (no-approval-after-proposal): no real
      2 THE BOUNDARY IS COMMITTED (point 174) — `batch-boundary.mj
      2 THE BOUNDARY IS COMMITTED (point 1464) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1459) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1433) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1426) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1421) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1418) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1414) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1413) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1407) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1404) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1374) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1372) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1364) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1363) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1354) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1353) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1350) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1348) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1342) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1331) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1329) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1318) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1315) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1313) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1311) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1294) — `batch-boundary.m
      2 THE BOUNDARY IS COMMITTED (point 1293) — `batch-boundary.m

## 4. Open work-order points: 475; per bundle: Session- & Repo-Hygiene 148 · Testinfrastruktur 84 · Modell & Wächter 60 · Dorfleben 48 · Chat & Tafel 34 · Urlaubsfestigkeit 19 · Tierverhalten 15 · Wetter & Wasser 13 · ? 12 · Dokumentation 9 · Kadaver & Geier 7 · Siedlungsgeometrie 7 · Steuerung & Performance 6 · Monumente 4 · Sonne & Himmel 4 · Kommunikation 3 · unbundled 2
### Open points in infrastructure-like bundles (number · bundle · title)
- 1463 · Session- & Repo-Hygiene · Drastic zero-based simplification of the whole infrastructure, analysed six-eyes with final cross-vendor check
- 1436 · Session- & Repo-Hygiene · Evidence that a cloud-authored point landed under the cloud gate flow
- 642 · Testinfrastruktur · Every check that can be load-proof is made load-proof, and the rest says so (user
- 568 · Testinfrastruktur · The polish water-sameness check rotates its verdict (measured 09.08.2026 by
- 1461 · Session- & Repo-Hygiene · Cloud author clones judge the scarce lane OFF and stop on the serving-model tripwire
- 1068 · Session- & Repo-Hygiene · WebGL 2's polish run reds once on the children-motion check, and the red has no owner
- 1048 · Urlaubsfestigkeit · The batch crawled through the night while every safeguard reported health:
- 1060 · Session- & Repo-Hygiene · Seven findings of 05.09.2026 that the carrier held while the batch stood still.
- 1049 · Chat & Tafel · A user front-order and the communication-first rule both failed to order the
- 1026 · Testinfrastruktur · LARGE pays for a second backend pass on every change, including the ones that
- 746 · Session- & Repo-Hygiene · A point is not begun that cannot finish under the ceiling (19.08.2026, the same
- 759 · Session- & Repo-Hygiene · The context fence's worktree stand-down never fires, so every delegated agent is
- 553 · Session- & Repo-Hygiene · An explicit context budget per point, and a written handoff when it is spent
- 932 · Session- & Repo-Hygiene · The context fence has stood in observe mode for six days with no visible arming point
- 899 · Chat & Tafel · `board-first-guard` locks a delegated author out of its own worktree. MEASURED
- 900 · Modell & Wächter · The review recorder answers a failed identity check with the advice to do what was
- 898 · Session- & Repo-Hygiene · The pause file and the in-flight declaration stayed per checkout after the lock and the
- 896 · Modell & Wächter · `review-sol.mjs` swallows an unknown flag and spends a real cross-vendor pass on it.
- 886 · Session- & Repo-Hygiene · A unit case fails on the first run after every push, because a network probe inside it
- 887 · unbundled · Part of the durable-lane branch can be cleared by no reviewer, so the point cannot land
- 888 · unbundled · Naming the cross-vendor reviewer in a commit trailer silently removes those files from
- 867 · Urlaubsfestigkeit · An exhausted vendor allowance parks its point on a probe, not on the user. Point 861's
- 868 · Urlaubsfestigkeit · The Windows launcher can be re-armed without an attended session. Point 861's inventory
- 708 · Session- & Repo-Hygiene · Only the landing is one command; the beginning and the turn's end are hand-driven chains
- 764 · Session- & Repo-Hygiene · The chat header's context reading is required by nothing, and six replies proved it
- 762 · Session- & Repo-Hygiene · The memory index has no line of headroom, so the next memory blocks the guard
- 760 · Urlaubsfestigkeit · The launcher's own CLI can lose its native binary, and the arming probe cannot see it
- 747 · Session- & Repo-Hygiene · The ceiling is recalibrated from a series, and gives ground back only against
- 750 · Session- & Repo-Hygiene · A session that dies without a boundary leaves no reading, so the overshoot series
- 738 · Session- & Repo-Hygiene · The lease fence does not know the fold command, so a dispossessed session can still
- 739 · Session- & Repo-Hygiene · Taking the batch is fenced by the HANDOVER mark, so a window can take it with a third
- 735 · Modell & Wächter · The mechanism gate fires on a TOUCH, where it was built for a CHANGE (user
- 596 · Modell & Wächter · The tail is visible while it runs (point 572's measure 6). A point's running
- 715 · Modell & Wächter · The staged rewiring of the hook paths is finished, and the check accepts the defaulted
- 719 · Urlaubsfestigkeit · The Stop chain fires ONCE per headless batch session, so every guard whose
- 660 · Session- & Repo-Hygiene · One session, two identities: the fence locks out the session that is working
- 663 · Urlaubsfestigkeit · The deploy dies on a frozen tag's flaky download (measured 12.08.2026, twice on
- 814 · Session- & Repo-Hygiene · The dictated handover card claims nothing is running while a delegated authoring run
- 807 · Session- & Repo-Hygiene · Pushed work for an open point can lie on a branch that nothing points at, and the next
- 736 · Modell & Wächter · The escalation lane has no way back DOWN, so one point sits on the scarcest model
- 797 · Session- & Repo-Hygiene · The watermark only speaks at the END of the turn, so it warns after the expensive turn
- 798 · Session- & Repo-Hygiene · The doctor's quarantine says nothing about having swept away a finished finding, and its
- 799 · Chat & Tafel · `watcherSupervision` can no longer return `stop`, but the launcher still handles it and the
- 710 · Session- & Repo-Hygiene · The remaining forty-five sequences of the multi-step analysis are worked into the
- 706 · Chat & Tafel · The queue commands lose the card text one way and re-write a blocked one the other
- 705 · Chat & Tafel · The board is republished once per guard correction, instead of once at the end
- 665 · Chat & Tafel · Every board card names its problem before its status — and a mechanism enforces it
- 778 · Modell & Wächter · Answer the cross-vendor review of the suspended Fable escalation (GPT-5.6 Sol,
- 777 · Chat & Tafel · A decision card published after its answer arrived is never retired (measured
- 774 · Session- & Repo-Hygiene · `bundle-first-guard --status` reports a stand-down that does not apply to the session
- 664 · Chat & Tafel · The estimate on the board expires unseen, and every card says "stand" twice (user
- 791 · Session- & Repo-Hygiene · A user's waiver of the closing has to be typed thirteen times, and once it has to sound
- 658 · Urlaubsfestigkeit · The egress allowance must survive a container restart and the hours after it (user
- 630 · Modell & Wächter · A shell write into `.claude/` raises a prompt in the user's VS Code window
- 632 · Modell & Wächter · A lesson counts as served the moment its enforcer is named — not when it stands
- 639 · Modell & Wächter · The assurance regime for the release machinery (user 11.08.2026: "Das Ganze ist
- 635 · ? · The queue is cut into releases, and the cut is data (user 11.08.2026, sketching
- 636 · ? · A finished block closes and tags itself (user 11.08.2026: "Du sollst diese
- 638 · Modell & Wächter · A ticket I open myself gets its urgency decided, not its default (user
- 637 · ? · The board becomes a place to decide, not only to read (user 11.08.2026: "Drag &
- 456 · Testinfrastruktur · The test that is only green in the side tree (retrospective §3.68, 30.07.2026;
- 558 · Testinfrastruktur · A verify run taken in a worktree is destroyed with the worktree (measured
- 574 · Testinfrastruktur · A bare verify script photographs whatever server holds port 5173 (found
- 567 · Testinfrastruktur · A killed session leaves its verify run behind, and nothing stops it
- 599 · Modell & Wächter · Measure what the cache and the calendar hide (point 572's measure 9). Two
- 511 · Dokumentation · The memory index still carries what thirty guards now enforce
- 471 · Session- & Repo-Hygiene · The work order starves the pool it is supposed to feed (user 30.07.2026, drawn
- 552 · Testinfrastruktur · The CI guard replays a frozen reason and sends the reader at a green run
- 460 · Testinfrastruktur · A red verification must be diagnosable without re-running it (30.07.2026; bundle
- 504 · Urlaubsfestigkeit · Every batch owner is dispossessed at half an hour of age
- 463 · Session- & Repo-Hygiene · Two liveness readings the forced handover proved wrong (30.07.2026, both
- 554 · Session- & Repo-Hygiene · The chat watcher leaks orphans the supervision cannot see (measured
- 455 · Testinfrastruktur · A red that load did not explain (30.07.2026, measured: `batch-doctor --gate` called
- 602 · ? · What else did we build and never use? (user 09.08.2026, on learning that the
- 528 · Urlaubsfestigkeit · The deploy that never reaches a runner leaves the site stale, and point
- 507 · Testinfrastruktur · A lost WebGPU device ends the run quietly and the picture black
- 464 · Testinfrastruktur · A red unit layer reached `main` through the pre-push gate (user 30.07.2026:
- 457 · Modell & Wächter · A recorded "do not merge" must not satisfy the gate (retrospective §3.67,
- 510 · Testinfrastruktur · The render-verify core counts a run that never confirmed its backend
- 518 · Testinfrastruktur · The shutter judges its aim before the wait and never re-judges (found
- 533 · Urlaubsfestigkeit · What brings the container back after a host reboot (found 07.08.2026 while
- 448 · Urlaubsfestigkeit · One command that says "ready for a fortnight alone" (30.07.2026; bundle
- 449 · Urlaubsfestigkeit · The chaos drill — kills at random moments (user 30.07.2026: "Beachte, dass ein
- 200 · ? · Verify-script robustness pass — fix the 26 wall-clock/radius
- 309 · Modell & Wächter · Serving-model degradation: repair + tripwire (user 25.07.2026). REPAIR: the
- 333 · Dokumentation · Why the docs drift — and a mechanism against it (root-cause analysis
- 422 · Dokumentation · The beginner guide is full, and four lessons are still outside it
- 451 · Chat & Tafel · The reply that sent its own flag (user 30.07.2026: "Was ist mit dem Chat los?" —
- 465 · Chat & Tafel · A now-card outlives the session that wrote it (user 30.07.2026, from the board
- 531 · Dokumentation · The spec documents still describe the old bird's-eye collision (found
- 532 · Testinfrastruktur · The collision suite counts a different number of checks every run
- 534 · Modell & Wächter · One project-slug resolver, and a finding recorded from a worktree survives
- 535 · Modell & Wächter · One definition of what counts as a mechanism, and it reaches the hooks
- 536 · Modell & Wächter · The two wired enforcers no selector reaches get conventional names
- 537 · Modell & Wächter · The untested-guard ratchet is ratcheted, and the real debt named
- 538 · Modell & Wächter · Two memories that describe mechanisms that are gone
- 607 · Dokumentation · The evidence for criterion 20 names a control count that is two dozen short
- 609 · Modell & Wächter · The proof guard is built, taught and wired to nothing (found 10.08.2026 by the
- 467 · Chat & Tafel · The versioned board refresher reaches no reader (30.07.2026, found by the agent
- 468 · Modell & Wächter · The same blind parse sits in two more readers of the work order (30.07.2026,
- 491 · Chat & Tafel · Queue prose written only into the HTML is lost on the next rebuild
- 495 · Modell & Wächter · A versioned git hook without its executable bit is silently inert
- 497 · Modell & Wächter · The German-language rule has no mechanism at all, and the audit
- 498 · Testinfrastruktur · What the software second lane costs the full regression, measured
- 508 · Chat & Tafel · Each now-card is judged by its own number (measured 05.08.2026, bundle
- 514 · Testinfrastruktur · The compatibility lane has two reds the WebGL lane does not (measured
- 520 · Chat & Tafel · The board demands a time it gives no way to write (found 05.08.2026
- 521 · Testinfrastruktur · The enrichment suite aims by stopwatch and aborts before its own
- 529 · ? · A Stop hook in the user scope now enforces what a project guard
- 559 · Modell & Wächter · The time-tracking mandate is abolished, its useful half kept (user decision
- 560 · Modell & Wächter · The only active channel for a red branch run is not configured (measured
- 561 · Modell & Wächter · The silenced branch gate has three blind spots (four-eyes review of point 513
- 563 · Testinfrastruktur · The tag frame's new readability judge has three soft spots (four-eyes
- 564 · Testinfrastruktur · "Candidate real failure" is asserted with confidence the run did not earn
- 570 · Testinfrastruktur · The children-photographable check reds on the pinned world (measured
- 591 · ? · Does the project still obey its own rules? A full adherence audit (user
- 303 · Dokumentation · Code review of all changes since v0.1 — validate every test is still valid (user
- 285 · ? · Hunt accumulation bugs and memory leaks — a repeatable Fable analysis
- 330 · Testinfrastruktur · Full post-degradation assurance pass (user 25.07.2026, after three separate
- 205 · ? · A world & functionality plausibility audit — a third audit kind beyond
- 203 · ? · Extend 184 — a systematic visual + liveness bug-finder (user request
- 207 · ? · Additional finding methods that complement the existing audits (Pillar
- 184 · ? · Pre-tag hardening — a much stronger, systematic quality pass to reach a
- 615 · Testinfrastruktur · The not-run gate is disarmed by a comment, and the bootstrap skips its own
- 616 · Urlaubsfestigkeit · The idle modes point 612 does not reach (blind-parallel enumeration by both
- 617 · Urlaubsfestigkeit · An owner that works once and then idles still holds the batch for an hour
- 619 · Dokumentation · The dressing pair no longer gestures, and design.md says so (user decision
- 620 · Testinfrastruktur · A frame passes its checks while showing nothing at all (measured 10.08.2026
- 621 · Chat & Tafel · A ceiling raise is no longer a question for the user (user decision
- 622 · Testinfrastruktur · A verify run that ran nothing reports green, and an unknown flag runs
- 625 · Chat & Tafel · The same defect was built twice, in parallel (measured 11.08.2026, 00:12).
- 626 · Testinfrastruktur · The boulder's proof proves the wrong thing (four-eyes review by GPT-5.6 Sol of
- 627 · Testinfrastruktur · The Victoria Falls frame photographs somewhere else (measured 11.08.2026 on
- 643 · Testinfrastruktur · A red is released by the wrong proof: the suite passed, not the check (found by
- 646 · Session- & Repo-Hygiene · The repo doctor is the second door into the same disaster (found 11.08.2026 by the
- 647 · Testinfrastruktur · A full-suite red on the 629 branch whose test nobody can name (11.08.2026, 18:03,
- 652 · Modell & Wächter · The session may not assert a state it did not measure, and is handed the facts it
- 668 · Testinfrastruktur · The landing gate proves the charges only while the point is still open (measured
- 670 · Testinfrastruktur · A filtered gate chain destroys the evidence its own suspect record demands (measured
- 677 · Modell & Wächter · A guard run by hand hangs forever on its own stdin (measured 13.08.2026, 19:20). The
- 678 · Modell & Wächter · A lane is routed to when it has nothing left, and what dies there is rescued by hand
- 683 · Session- & Repo-Hygiene · The seal lets the work order through, because it classifies by target (Sol's
- 696 · Session- & Repo-Hygiene · A handed-over session kept writing, and the successor was told it was dead (measured
- 699 · Chat & Tafel · An actor label is drawn through the landmark label behind it (seen 17.08.2026 in the
- 704 · Chat & Tafel · The board defeats every cache, so a reader who reloads is rate-limited out of it
- 722 · Modell & Wächter · The mechanism gate's HISTORICAL backlog on main is worked off with the rebuilt planner.
- 724 · Session- & Repo-Hygiene · A feature branch fully contained in a SIBLING branch keeps eating a pool slot
- 728 · Chat & Tafel · The chat responder answers while a session owns the batch, and answers one message
- 729 · Modell & Wächter · A truthful "5 skipped" reads as a failed gate (found by the point 727 run,
- 962 · Modell & Wächter · The readiness check charges a delegated lane with the main commits its own brief told it
- 741 · Session- & Repo-Hygiene · A carrier entry carries its writer's situation as though it were the finding's own
- 754 · Session- & Repo-Hygiene · The rule corpus carries twenty-three measured defects, four of them in code that
- 755 · Session- & Repo-Hygiene · Three more mandatory Stop guards demand at the exit what the context fence forbids,
- 756 · Session- & Repo-Hygiene · The context fence reads the BODY of a heredoc as a command and denies the board card
- 763 · Session- & Repo-Hygiene · Three of the five ruled document cuts are still standing in the documents
- 765 · Session- & Repo-Hygiene · A finding whose target point is already archived counts itself as delivered
- 766 · Session- & Repo-Hygiene · The lesson register cannot be kept for the last two dozen lessons, and the document
- 767 · Session- & Repo-Hygiene · The five-round escalation covers commissions only, so the batch's own work can never
- 785 · Session- & Repo-Hygiene · The chat header's context reading is wrong exactly where it is read most — at the start
- 786 · Session- & Repo-Hygiene · A tick is not a delivery, and nothing in the work order tells the two apart — so every
- 802 · Session- & Repo-Hygiene · The design.md budget still owes the user a yes he withdrew ten days earlier
- 803 · Session- & Repo-Hygiene · The push gate runs the full unit layer while an authoring agent holds the same machine
- 804 · Session- & Repo-Hygiene · Merge attribution survives only while the merged parent stays in the analysed commit set
- 806 · Session- & Repo-Hygiene · The repair-loop bound speaks on the ninth commit, one minute after the human already
- 810 · Session- & Repo-Hygiene · Sixteen candidate defects in the CI guard and the launcher, found by the blind half of
- 815 · Session- & Repo-Hygiene · The standstill classifier scales quadratically with the journal it reads, and the
- 817 · Session- & Repo-Hygiene · The activity journal's tail read can hand out a sequence number twice, and appends onto
- 818 · Session- & Repo-Hygiene · The standstill report blanks or mislabels the very time it exists to measure (found
- 819 · Session- & Repo-Hygiene · The queue's front block predates the ranking gate and was never cleared, so 34 points
- 822 · Session- & Repo-Hygiene · A now-card names the mechanism instead of the problem, and outlives its own landing
- 823 · Session- & Repo-Hygiene · The parallel-session detector counts the predecessor that has just handed over, and a
- 824 · Session- & Repo-Hygiene · A killed authoring run strands uncommitted work that nothing drains, and the handover
- 825 · Session- & Repo-Hygiene · The criticality gate demands a receipt that no command writes (measured 21.08.2026,
- 826 · Session- & Repo-Hygiene · The criticality gate measures coverage against the reviewed sha, never against the
- 827 · Session- & Repo-Hygiene · The firewall that cuts Sol off is the image's copy, and nothing compares it with the
- 830 · Session- & Repo-Hygiene · The model-policy fingerprint swallows the rest of §6, so seven unrelated rules cannot be
- 831 · Session- & Repo-Hygiene · The launcher's singleton is the RECORD, so a live daemon the record does not name is
- 832 · Session- & Repo-Hygiene · The ratchet holds against today's ceiling, not against the one it replaced — and three
- 833 · Session- & Repo-Hygiene · The timestamp guard's own test loses a minute race under load. MEASURED 22.08.2026:
- 836 · Session- & Repo-Hygiene · `author-sol` reports every run as a PROBLEM as soon as the test line says "skipped"
- 837 · Session- & Repo-Hygiene · The four-eyes gate on `main` has been standing open on a suspended demand, and the debt
- 838 · Chat & Tafel · Point 834's estimate is 1.8x the whole programme it is the front stage of, and the 676
- 839 · Session- & Repo-Hygiene · The four-eyes gate on main has become unresolvable, and it refuses every turn end
- 841 · Session- & Repo-Hygiene · The parallel-session detector counts a stood-down chat session as a second batch worker
- 842 · Session- & Repo-Hygiene · The link witness still has three routes to a clean pass over a real link failure
- 845 · Session- & Repo-Hygiene · A unit test pins the size of a file that lives outside the repository, so an unrelated
- 849 · Session- & Repo-Hygiene · The parallel-session alert fires on the retired predecessor that already handed over.
- 850 · Session- & Repo-Hygiene · The generated command index publishes commands nobody can run, and its own test
- 851 · Session- & Repo-Hygiene · Re-running a cancelled CI run cancels the newer commit's run on the same branch.
- 853 · Session- & Repo-Hygiene · The guard preflight names a remediation that cannot clear its own block. MEASURED
- 855 · Session- & Repo-Hygiene · The confirming review of the budget fixes names two test gaps its verdict leaves owed.
- 856 · Session- & Repo-Hygiene · The review planner reads a reviewer credit as authorship and calls the commit unreviewable.
- 857 · Testinfrastruktur · The docs suite's acceptance-pointer checks match nothing and fail vacuously. MEASURED
- 869 · Chat & Tafel · The board command cannot be run from a session that has no `CLAUDE_SESSION_ID`. MEASURED
- 871 · Session- & Repo-Hygiene · The boundary's dictated handover card claims nothing is running while it transfers a live
- 872 · Modell & Wächter · A merge's conflict resolution is still attributed to the side it merged, not to the model
- 873 · Modell & Wächter · `guard-preflight` predicts a block where `mechanism-review-guard` rules a review gap, and
- 875 · Modell & Wächter · A corrupt Fable-switch file makes the whole tree uncommittable, and the gate that does
- 876 · Modell & Wächter · Guard-health reads absence and measurement failure as one state, and clears a dead
- 877 · Modell & Wächter · The urgency parser reads negation by proximity and takes a question for a claim.
- 878 · Session- & Repo-Hygiene · A proven red CI verdict is thrown away by a lock timeout, and the guard's own tests
- 881 · Session- & Repo-Hygiene · Armed, the context fence would refuse the very commands that end a session — and on a
- 882 · Session- & Repo-Hygiene · Deleting a governed document disables its budget, and a misspelled ceiling disables half
- 883 · Modell & Wächter · The queue's urgency baseline proves membership and stops there. MEASURED 24.08.2026 by
- 904 · Session- & Repo-Hygiene · Three findings the whole-range review found in the landed attempt lease. MEASURED
- 905 · Modell & Wächter · The Git-only point-file fallback re-lists every merge on main once per review row.
- 906 · Session- & Repo-Hygiene · The delegated author's interim push cannot recover a branch it rewrote itself, and its
- 908 · Session- & Repo-Hygiene · The parallel-session detector counts the session's OWN declared authoring
- 909 · Session- & Repo-Hygiene · The test type-check has been red on main for a week, and no gate that runs says
- 910 · Session- & Repo-Hygiene · A session working in a worktree is blocked by `dashboard-guard` with a repair
- 922 · Session- & Repo-Hygiene · A worktree working directory makes the four-eyes gate report a missing baseline it
- 911 · Session- & Repo-Hygiene · The escape drill's "launcher's shape" is a comment, not a coupling, and the
- 912 · Session- & Repo-Hygiene · An interrupted takeover drill leaves its daemon and its sandbox behind, and the
- 914 · Modell & Wächter · A multi-pass review's diffstat is pass-scoped while its manifest swears it is
- 915 · Modell & Wächter · The review planner names a reviewer the recorder then refuses, so a multi-group pass
- 916 · Modell & Wächter · A tightened ledger row contract was applied to the whole PAST, so 216 recorded reviews
- 917 · Modell & Wächter · A closed point's branch and worktree outlived its merge, and the guard that should
- 919 · Modell & Wächter · A sha whose ref has already moved on is reported as a red CI verdict, and
- 920 · Session- & Repo-Hygiene · Appending a work-order point is hand work, so it can take a number that is already
- 924 · Session- & Repo-Hygiene · The pre-push fast gate calls `test:unit` red where the same command, in the same tree
- 926 · Testinfrastruktur · The world suite's Victoria Falls frame misses its subject, and it has been red for
- 927 · Testinfrastruktur · The F6 bug report hands the user an archive WITHOUT the picture. MEASURED
- 929 · Session- & Repo-Hygiene · The board's core hardens against damaged and hand-edited input — the remainder of the
- 930 · Chat & Tafel · A now-card removed by the projection takes its handwritten text with it — the one
- 931 · Session- & Repo-Hygiene · A machine ranking that parks a high-criticality point stays invisible to the user
- 933 · Session- & Repo-Hygiene · A commit subject naming a review pass index goes stale the moment the split is recut
- 934 · Session- & Repo-Hygiene · The dependency mechanism is built as the smaller core Sol's review prescribes, not as
- 937 · Chat & Tafel · After a landing the board's closing state is unreachable, and it blocks the branch
- 939 · Session- & Repo-Hygiene · The 19.08. `webgpu/startup` red is a dev-server transient with no owner (measured
- 940 · Chat & Tafel · The derived state card is authenticated by a shape that is not the writer's (cross-vendor
- 942 · Modell & Wächter · The criticality gate's second way out has no command that writes it (measured 26.08.2026
- 948 · Testinfrastruktur · A red vitest type-check reached `main` and blocked every tier for every point (measured
- 949 · Testinfrastruktur · A module that resolves repository paths from `import.meta.url` sends a fixture's reads
- 950 · Dokumentation · A documentation cut and the guard that parses that documentation must land in one commit
- 951 · Testinfrastruktur · Three verification suites navigated into a 90 MB CDN download, and one of them died
- 952 · Chat & Tafel · The board-layout suite measures a COPY of the board stylesheet, so the pressure it calls
- 954 · Chat & Tafel · The board header's outer groups still never break, so a phone squeezes the title while
- 956 · Urlaubsfestigkeit · A merge-with-fixes verdict leaves its named fix owed, and nothing tracks it (measured
- 959 · Chat & Tafel · A done card reports the last run's start and end, so a point worked over several
- 960 · Session- & Repo-Hygiene · A filed finding is never checked against the work order, so with 313 open points the
- 961 · Session- & Repo-Hygiene · The `commit-msg` hook checks two properties of a message and not its SHAPE, so a body
- 964 · Urlaubsfestigkeit · The launcher's stalled-writer recovery is unreachable, so only a DECLARED delegate can
- 965 · Chat & Tafel · The closing card the board's own refusal prescribes cannot reach the page. MEASURED
- 968 · Testinfrastruktur · A render path that can never cover itself keeps the picture gate shut. MEASURED
- 970 · Modell & Wächter · Canonical model trailers are not enforced at commit time. MEASURED 27.08.2026, 14:14, in
- 972 · Session- & Repo-Hygiene · A file cut from the review material reaches no manifest, so the reviewer reports its
- 974 · Session- & Repo-Hygiene · The criticality gate charges a high-criticality point with every file that landed near
- 975 · Session- & Repo-Hygiene · A four-eyes debt whose fix comes from the other vendor can be cleared by nobody.
- 976 · Chat & Tafel · A point landed by the command loses every route to its own Erledigt card. MEASURED
- 978 · Chat & Tafel · `done` accepts an empty card text and publishes the internal focus note instead.
- 980 · Dokumentation · The retrospective hands out the same section number to several lessons. MEASURED
- 981 · Session- & Repo-Hygiene · Fifteen rule-corpus findings of the 28.08.2026 cross-vendor review are recorded and
- 984 · Modell & Wächter · Every landing writes its tick commit with the author model at the wrong vendor address.
- 986 · Modell & Wächter · The criticality gate charges a point for every main commit that landed beside it.
- 987 · Modell & Wächter · A verified Claude review receipt with no text result is blamed on the wrong model.
- 989 · Chat & Tafel · A current-work card's ESTIMATE has no board command, so changing it costs two focus
- 990 · Session- & Repo-Hygiene · A red charge cannot verify the ROOT its downstream sentence points back to.
- 991 · Session- & Repo-Hygiene · A run record has no identity of its own, so indistinguishable records share one
- 992 · Session- & Repo-Hygiene · The compatibility-lane console charge is not scoped to the lane it was measured on.
- 994 · Session- & Repo-Hygiene · A writer veto with a known expiry does not wake the launcher when it expires, and never
- 995 · Session- & Repo-Hygiene · Three charge-ledger entries cannot be narrowed to the failure mode their own evidence
- 996 · Session- & Repo-Hygiene · A result line arriving as malformed bytes is stored under a name the suite never
- 997 · Session- & Repo-Hygiene · The queue order for the context work rests on three readings that do not carry it, and
- 998 · Session- & Repo-Hygiene · The mechanism gate bills a merged contribution PER COMMIT, so a long branch owes
- 999 · Modell & Wächter · The review ledger's physical order does not follow its `at` stamps, so a reader that
- 1000 · Session- & Repo-Hygiene · Two waved-red cases still construct a console identity the recorder cannot mint, and
- 1001 · Modell & Wächter · The Sol authoring lane judges commits it only MERGED IN as its own lane's work.
- 1004 · Session- & Repo-Hygiene · Nineteen review rounds settled the bundle reader and left five findings standing,
- 1005 · Session- & Repo-Hygiene · Bookkeeping without a point has no card, and `board-first-guard` locks the owner out
- 1006 · Session- & Repo-Hygiene · A later same-vendor clearance over the same files silently displaces the earlier
- 1007 · Session- & Repo-Hygiene · The durable lane's measured trial is run, and its verdict decides the switch (split
- 1009 · Session- & Repo-Hygiene · The benchmark run borrows the world and never gives it back, and it leaves `Math.random`
- 1010 · Session- & Repo-Hygiene · The Ctrl-label fusion check names a point that is closed, so its red has no owner
- 1011 · Session- & Repo-Hygiene · The WebGPU compatibility lane throws five console errors in every run that no charge
- 1012 · Session- & Repo-Hygiene · The measurement runs demand GPU timestamps from an adapter that has none (measured
- 1014 · Session- & Repo-Hygiene · The Anthropic share of the batch has no lever left except ending the session (user
- 1015 · Session- & Repo-Hygiene · Half the red-charge table still names a check by its prefix and excuses whatever
- 1017 · Testinfrastruktur · A charge is scoped to the lane it was first measured on, so the same red needs a
- 1020 · Chat & Tafel · The handover card is judged for length only after the fence has forbidden changing
- 1021 · Session- & Repo-Hygiene · A stale chat timestamp still costs the user a second message — nine guard blocks in one
- 1022 · Testinfrastruktur · The brevity guard raises its own ceiling to admit the document it is measuring
- 1023 · Testinfrastruktur · A refusal that reprints its whole inventory bills the blocked session for the size of
- 1024 · Chat & Tafel · The handover card claims a standstill while transferable work is still building
- 1025 · Urlaubsfestigkeit · A delegate the boundary named only in prose vetoes its own successor, and the batch
- 1027 · Urlaubsfestigkeit · A launcher that needed two seconds to write its record is disowned forever, and every
- 1028 · Modell & Wächter · An examination recorded at the old round-4 boundary suppresses the round-9 examination
- 1029 · Session- & Repo-Hygiene · The bundle table's shared-file exclusions are one-sided, so the half that reads the
- 1030 · Modell & Wächter · A refusal is consumed as coverage: a recorded `do-not-merge` CLEARS the very file it
- 1032 · Session- & Repo-Hygiene · A blocking Stop guard can refuse the same finding forever, and every refusal spends a
- 1039 · Session- & Repo-Hygiene · The run is redirected: freeze, intake rule, and the checklist that stops gating
- 1035 · Testinfrastruktur · The charge ledger landed with six named findings against it, and two of them widen
- 1042 · Session- & Repo-Hygiene · The context handover cannot be recorded while another session holds a now-card.
- 1043 · Testinfrastruktur · The speech-label check stands on one figure, and that figure is a coin toss.
- 1044 · Testinfrastruktur · A crashed suite's stack is swallowed before any log can keep it, so the sign-off
- 1050 · Session- & Repo-Hygiene · Two picture checks went red on the polish lane in one night and neither has an
- 1054 · Session- & Repo-Hygiene · A content guard demands a write from a session that no guard lets write
- 1055 · Session- & Repo-Hygiene · A killed board writer keeps the board's edit lock, and the next three board
- 1059 · Session- & Repo-Hygiene · Every context boundary kills the interactive session with exit code 143 and
- 1071 · Urlaubsfestigkeit · The prepared container-restart path is deployed on the host and proven without an
- 1074 · Testinfrastruktur · A long verify run dies with the session that started it (measured twice on
- 733 · Session- & Repo-Hygiene · The loading picture freezes about twice as long as its own budget allows (measured
- 1062 · Testinfrastruktur · The position query stops answering after a language switch, and no gamepad
- 1078 · Testinfrastruktur · The one solvable puzzle of the PoC fails its own check about half the time, and
- 1079 · Testinfrastruktur · The only fix for a live vitest advisory is a semver-major jump, and the
- 1084 · Testinfrastruktur · The planning price that was only ever meant to size a wait also
- 1095 · Testinfrastruktur · The guide's ceiling equals its size, so the review that demands a new lesson
- 1096 · Session- & Repo-Hygiene · The landing's cleanup keeps every branch alive while any detached worktree
- 1097 · Session- & Repo-Hygiene · A pause the session wrote itself holds the batch forever and is booked as user
- 1098 · Session- & Repo-Hygiene · Half the memory rules are stated but never loaded (measured 11.09.2026).
- 1099 · Session- & Repo-Hygiene · The wait calls a healthy picture run hung after a quarter of its normal length
- 1100 · Session- & Repo-Hygiene · A verification for a just-landed point can publish no board at all (measured
- 1101 · Session- & Repo-Hygiene · A runner-only script answers "CI gate passed" to a question nobody asked
- 1102 · Testinfrastruktur · The drum picture is aimed by stopwatch and fires after the message has ended.
- 1111 · Testinfrastruktur · Two cases in `scripts/mechanism-review-guard.test.mjs` run 19.4 s against a 20 s
- 1114 · Testinfrastruktur · Repair pre-existing settings check: first-person ground shows micro-detail
- 1115 · Testinfrastruktur · Repair pre-existing enrichments check: the streamed dressing does not grow over
- 1119 · Testinfrastruktur · Repair the arriving runner's contact hold, which reds under load and passes on a
- 1120 · Testinfrastruktur · The baseline classification reads the branch under load and the baseline after it, so
- 1122 · Session- & Repo-Hygiene · A third session-death class is undocumented, so every recurrence is re-derived from
- 1123 · Session- & Repo-Hygiene · When the batch owner dies mid-verification its run keeps going and nobody harvests the
- 1153 · Session- & Repo-Hygiene · A landed point's board bookkeeping has a door that locks behind it, and the
- 1171 · Session- & Repo-Hygiene · A bank-game unit test runs into its 20-second timeout on CI and blocks every main
- 1188 · Session- & Repo-Hygiene · A daemon checkpoint acknowledges one SHA while another is what actually landed, and
- 1172 · Testinfrastruktur · The dig-pair picture check finds no adults at all at the shutter and reds the whole
- 1175 · Testinfrastruktur · A children's frame can pass green with no child in it: the shutter tests projection,
- 1177 · Testinfrastruktur · Every full polish run is recorded as died of an uncaught exception after its own
- 1179 · Testinfrastruktur · A session that is waiting cannot declare its wait while it does closing work, and
- 1187 · Testinfrastruktur · The weaver's hand check rotates: it reds inside the pass and greens on its own
- 1189 · Modell & Wächter · The parallel alert re-raises itself from a stale reading and blocks the session
- 1192 · Modell & Wächter · A verification run that ran no suite is RED, never GREEN.
- 1203 · Testinfrastruktur · The voice suite reds on a network hiccup at huggingface.co.
- 1214 · Modell & Wächter · Apply the rule-review findings of 25.09.2026 (deletions and contradiction fixes).
- 1222 · Testinfrastruktur · The WebGPU world suite no longer aborts on a click the dialog backdrop intercepts.
- 1223 · Testinfrastruktur · The WebGPU polish suite finishes inside its wall timeout.
- 1224 · Testinfrastruktur · The Victoria Falls enrichment frame shows its subject on WebGPU.
- 1225 · Testinfrastruktur · The place-scene unit tests pass in a full unit run under load.
- 1226 · Session- & Repo-Hygiene · Worktree cleanup refuses a locked registered worktree without an expectation.
- 1231 · Modell & Wächter · Cloud authoring may run during a local regression once the cloud offload switch is ON and proven
- 1235 · Modell & Wächter · Stop guards trap a releasing session while the free lock is reserved for a claimant
- 1244 · Testinfrastruktur · 648-village-children misses its subject off the bottom edge only inside a whole polish pass
- 1253 · Testinfrastruktur · Picture sections that set a game condition by knob need a player-path counterpart
- 1261 · Chat & Tafel · Let the answering window remove an answered board card; drop point 1240
- 1267 · Testinfrastruktur · The speech-inaudible assert reads a stale speech bus at the end of a drum message
- 1268 · Testinfrastruktur · The bank game's announcing child is read without its pointing arm
- 1269 · Testinfrastruktur · The tag beat's side-on standpoint search finds every stand occluded
- 1270 · Testinfrastruktur · The two-close-speakers shot finds no pair whose tails sit on their own anchors on WebGL 2
- 1289 · Session- & Repo-Hygiene · Stop guards keep binding a session whose lock was released to a reserved claimant
- 1291 · Session- & Repo-Hygiene · retro-currency-guard deadlocks a session after a committed context boundary
- 1292 · Testinfrastruktur · The pounding check counts two strikes against three heard thuds on WebGL 2
- 1296 · Testinfrastruktur · The full world suite crashes on WebGPU at the rock-relief click behind an open dialog
- 1300 · Testinfrastruktur · The loom station and the mute-shore boatman reading are red in polish-villagers independent of any branch
- 1304 · Session- & Repo-Hygiene · A request whose open questions read "none" is queued, not turned into a decision card
- 1328 · Session- & Repo-Hygiene · A chat-answer session recorded as batch-lock holder cannot end
- 1361 · Session- & Repo-Hygiene · decision-card-guard deadlocks a non-owner session's Stop by demanding a vdzk-keep the ownership guard refuses
- 1369 · Modell & Wächter · Astra routing sends a point the share switch then refuses to commission
- 1373 · Modell & Wächter · The approval guard refuses ordinary commands that merely contain quotes or operators
- 1381 · Testinfrastruktur · The canoe-fish check sees its third fish hidden by an unnamed BoxGeometry on WebGL 2
- 1382 · Testinfrastruktur · The WebGPU polish-villagers suite finishes inside its wall timeout.
- 1447 · Session- & Repo-Hygiene · Every settlement visit leaves its render pipelines and heap behind
- 1460 · Session- & Repo-Hygiene · Covering enrichments suite run on both backends for the two suite fixes of 27.10.2026
- 1466 · Testinfrastruktur · Ctrl actor labels fuse over most frames in a whole polish-speech run on WebGL 2
- 1467 · Testinfrastruktur · batch-doctor quarantine-stash aborts a live LARGE run
- 1468 · Testinfrastruktur · Traveller head-height check at low detail reads just above its bound
- 1469 · Testinfrastruktur · Load-sensitive waits in touch virtual-stick and the enrichments river-mouth hygiene step
- 1470 · Testinfrastruktur · Caught-child frame of the bank game finds no shot inside its window in a whole run
- 1471 · Testinfrastruktur · Moving capture of the turning errand adult reads it walking on between frames 1 and 2
- 1472 · Testinfrastruktur · Continuous route's downstream step finds no route from a water standpoint near Bandiagara
- 1474 · Session- & Repo-Hygiene · Backlog-Befunde zur Infrastruktur in die Analyse und das Obsolet-Urteil von 1463 einbeziehen

## 5. Closed points (docs/tasks-archive.md): 983; per bundle: ? 455 · Dorfleben 139 · Session- & Repo-Hygiene 115 · Modell & Wächter 59 · Testinfrastruktur 56 · Chat & Tafel 39 · Urlaubsfestigkeit 28 · Kommunikation 24 · unbundled 19 · Steuerung & Performance 17 · Tierverhalten 12 · Siedlungsgeometrie 9 · Dokumentation 7 · Wetter & Wasser 4
### The 260 most recent closed infrastructure-like points of 778 (number · title; '?'-bundle points are older unbundled ones and may be game points)
- 1465 · Clear the uncharged WebGPU reds of polish-speech before the v0.3.1 closing
- 1464 · Clear the uncharged reds of the v0.3.1 closing regression
- 1462 · Release v0.3.1: tag the current main state as v0.3.1 and poc and publish both
- 1459 · Launcher successor decision "registered-writer-live" ignores bookkeeping files under .claude/
- 1455 · Run two browser suites at once when the measured pair gain holds, judged by acceptance throughput (six eyes)
- 1452 · Raise batch throughput through measured parallelisation, cloud authors included, without losing quality (six eyes)
- 1451 · Cloud clone reds tooling Vitest files that pass locally
- 1446 · The full polish-villagers WebGPU run loses Chrome's GPU process inside villager-dress
- 1445 · The launcher's absolute deadline counts dead time before a fresh owner and tries to take the batch from a working sessio
- 1444 · Raise the batch's working pace through measured cloud use and parallelisation (local included), without overloading the 
- 1443 · Close the open branches first: 1441, 1442, then 1414, 1432, 1333, 1297; park 1347
- 1442 · polish-villagers villager-dress hangs on WebGPU in its cost probe
- 1441 · Launcher-daemon HANGING-send test reddens fast gates under load
- 1440 · Board work cards show who built and reviewed a point, and where
- 1439 · Claude-lane authoring delegations really start as cloud sessions
- 1438 · Route mid-difficulty points to the Claude lane while the cloud credit lasts
- 1437 · Remove the settled queueing-feedback card from the board
- 1433 · A chat session's /clear converts the successor's pending spawn and takes the batch lock
- 1431 · Hand the throughput working instruction to the batch-owning session
- 1430 · Cloud authoring sessions deliver build, lint and Vitest green
- 1429 · Reconcile the nine open branches and eight worktrees with the work order
- 1426 · Make the cloud clone able to work: path-scope, request-approval-guard and model-guard stop blocking it
- 1421 · Lower the OpenAI reasoning effort from high to medium
- 1413 · An empty transcript right after /clear must not take a free batch lock at turn end
- 1411 · Main-write guard: do not classify pure read commands as writes
- 1410 · Board-first: the board duty applies only to the lock holder
- 1409 · Stop guards apply only to the holder of the batch lock
- 1408 · Request-approval guard: let pure read pipelines through a fail-closed allowlist
- 1407 · No user instruction is ever lost: tick the carrier only after commit, the doctor stashes no task files, reconcile the ca
- 1406 · Rank the five user-report points of 21.10.2026 ahead of 1347
- 1394 · Board cards keep the German description and drop the title from the status
- 1393 · Generic model lanes; the cross-vendor lane switches to GPT-6.1
- 1390 · Board cards need a short title and a body
- 1389 · Tag main as poc and publish it at /Heart-of-Africa-Remake/poc/
- 1388 · Request-approval guard stops refusing ordinary read commands
- 1372 · The approval guard treats a bash -c wrapper around a deposit as canonical
- 1371 · The approval guard's hook wrapper allows a call when the payload is unreadable or evaluation throws
- 1370 · The approval guard misses a deposit whose script name or flag bash assembles by expansion
- 1368 · A quoted heredoc fed to a shell still hides a request deposit from the approval guard
- 1367 · The request-approval guard's tokenizer still misses three deposit shapes
- 1366 · Manual batch release leaves the writer active, so the launcher vetoes every successor
- 1365 · The approval guard ignores user approvals that arrive during a running turn
- 1364 · Guard deadlock: decision-card-guard demands vdzk-keep, the batch stand-down refuses it to a non-owner session
- 1363 · Board: the description survives landing (the projection discards the now card)
- 1358 · CI guard: a red run charged to a parked point reports instead of blocking
- 1357 · Launcher takeover from a live owner crashes on a missing start reservation
- 1356 · Bounded waits: owner polling loops on a build log need a timeout and a stall report
- 1351 · The batch is paused only on the user's explicit stop order
- 1350 · The decision-card guard deadlocks a stand-down chat session
- 1349 · The CI status guard reports a red feature-branch run as green
- 1308 · Cut LLM round-trips spent on bookkeeping rituals, analysed six-eyes with final cross-vendor check
- 1307 · Point 1294: commission its author now, in parallel with the current queue
- 1306 · Carry the wrongly blocked round-trip simplification into the work order now and pull 1305 forward
- 1305 · Deferring a carrier request at the context watermark must not mark it blocked
- 1303 · Board cards keep the original start time and show dates for long spans
- 1302 · Board cards: separate description section from implementation status
- 1299 · Findings carrier appends keep each entry on its own line
- 1298 · Board now-card stub keeps the point's name
- 1288 · Carry a card decision from the head session to the batch owner
- 1281 · Enforce user approval before a chat session deposits a request
- 1279 · Route pure read and search delegations to the Explore agent
- 1259 · The river-bank frame loses its subject off the bottom edge on WebGPU every pass
- 1248 · The supervisor's immediate successor spawn ignores a pending batch claim when the owner exits
- 1247 · A user request waits in the carrier for hours because the request gate never fires
- 1241 · Creating an author worktree reloads the page under a RUNNING picture run and kills it
- 1232 · A receipt re-judges across a render-neutral commit, so only the missing backends run again
- 1230 · A recorded cloud offload switch moves Claude-lane authoring into cloud sessions.
- 1216 · The board-layout check judges the live board's card titles and reds on content.
- 1209 · Every session starts and runs on a smaller fixed context load.
- 1207 · The stand-down fence refuses writes outside the checkout, so the documented request handoff cannot be used.
- 1206 · Route blind-parallel enumerate halves to Astra at the default share setting, then switch to default.
- 1204 · Arm the handover watermark so it refuses instead of observing.
- 1201 · The production build is judged by a picture, not only by the dev server.
- 1200 · The `poc` tag names the current `main` state and /poc/ serves it.
- 1199 · The mechanism-review gather test stops timing out the unit gate.
- 1198 · The adult-errands picture section ends with a verdict instead of a crash.
- 1196 · A cheap section run can accept a charge for a known foreign red.
- 1195 · The board says by itself that the batch is standing.
- 1194 · An Astra outage falls back to Opus 5.5 by itself.
- 1193 · A session that is standing down cannot stop the batch.
- 1186 · A standing-down session can file a finding without evading the guard (user order
- 1185 · The decision protocol gets its own collapsed board section with an archive
- 1181 · Three hundred and thirteen tooling tests pay for a browser they never open, and
- 1180 · The unit layer builds the same ninety-nine villages some twelve thousand times,
- 1178 · The unit gate's 25-minute ceiling is eaten again, and a job timeout is the worst
- 1165 · The document-cut account stands on session transcripts the platform deletes after
- 1162 · A landed render change carries no covering picture, and blocks every merge
- 1161 · The timestamp nudge fires after every reply that used a tool, because the hook
- 1159 · The run's start language can be chosen from the URL, exactly as the start
- 1154 · The core-loop flow suite still expects the start kit that was removed on
- 1150 · The doctor's quarantine takes the frames away from a RUNNING picture run
- 1147 · The render window has stood open since point 1141's landing, and every landing
- 1145 · A frame-subject miss KILLS the whole run instead of failing one check, and two
- 1142 · The picture check's coverage record dies with the worktree it was earned in
- 1141 · The settlement edge band cannot be measured at the maasai village: the same
- 1137 · The picture gate is unusable: a suite never gets past the dev server.
- 1136 · A rung that saw nothing gives no all-clear: a subject-dependent check names how
- 1135 · The verification run stops repeating itself: one pass per suite, no automatic
- 1134 · The full regression becomes the BUNDLE's gate, not the feature's (user order
- 1133 · A commissioned authoring run dies with the session that started it, and takes
- 1130 · The eight `Entscheidungsprotokoll:` cards under "Von dir zu klären" read short and
- 1129 · `polish` is split by theme, so a red costs only its own theme (split out of
- 1128 · The bank round's roaming replay is sized to what it costs today, not to a
- 1127 · A check that declares itself non-predictive still reds the pass and blocks a
- 1126 · The full proof runs once, and a red repeats only its own rung (user 14.09.2026,
- 1121 · The river-bank frame aims at a drifting fleck and shoots six frames later
- 1118 · The board's currency check is blind to everything but the set of open point numbers
- 1116 · Repair pre-existing crossbrowser check: chromium-mobile no console errors on
- 1113 · A whole-suite run pays for its known reds twice, and the second pass learns nothing.
- 1104 · One ordinary point burns three hours of suite wall clock, and the regression it
- 1091 · The landing publishes the board after its own tick, and the publisher rightly
- 1090 · A writing verification run passes for a live author and no successor starts
- 1089 · Charge a LARGE red that does not touch the point's diff to its own point
- 1088 · The unit teardown aborts a run on a foreign worktree's commit (user 10.09.2026).
- 1086 · The cheap rung is skipped, and only the expensive one is enforced.
- 1083 · The verification plan quotes July prices, so a four-hour check reads as normal
- 1077 · The Astra lane is routed on paper and almost never authored (measured
- 1075 · A unit test measures a file OUTSIDE the repository, so writing a memory reddens
- 1069 · The WSL VM dies in the GPU passthrough driver during browser suites, and nothing
- 1067 · Ctrl labels fuse DEEPLY in the village crowd on WebGL 2, and no charge covers it
- 1061 · Sol retires: the OpenAI lane is GPT-6 Astra from here on (user 05.09.2026).
- 1053 · A session the user opened for something else silently becomes the batch owner
- 1041 · The Fable lane is nailed to one version, so a newer Fable never reaches us.
- 1040 · The 1036 lane's CI is red: `mechanism-review.mjs --list` is killed by a signal
- 1038 · The launcher's writer probe cannot ever call a feature writer dead, so one dead
- 1037 · The daemon drill claims it left nothing alive, but it only ASKS and never waits
- 1036 · The four-eyes ledger on `main` cannot reach green from where the merge-authorship
- 1034 · The four-eyes gate prints a repair command its own planner refuses (measured
- 1033 · The free lock lands silently in the window the user is sitting at (measured
- 1031 · Three red families of the WebGPU lane have no owner, and one of them is a charged red
- 1019 · A do-not-merge verdict spreads to every contribution that touched the same file, so
- 1018 · The recorder knows which section a red came from and throws it away, so the reader
- 1016 · Four runs that REPORTED their reds are recorded as crashes, and a crash can be
- 1008 · The review router and the review ledger each forbid what the other requires, so two
- 1003 · The bundle membership check reads point numbers out of free prose, and no date filter
- 1002 · A legitimate verification run longer than an hour now earns an emergency strike.
- 993 · A run that crashed but exited 0 is recorded as fully clean and COVERS a backend.
- 988 · Every second landing hand-resolves the same conflict in the append-only review ledger.
- 985 · Looking at a delegated worktree resets its liveness clock, so a dead author reads as alive.
- 983 · One file-scoped pass record turns every earlier cross-vendor review in its range into a
- 982 · The reviewer trailer §6 allows cannot be told from an author trailer, so naming a
- 979 · The mechanism gate holds a `do-not-merge` that no command it offers can answer, and it
- 977 · The four-eyes fallback names a reviewer no command can start. MEASURED 27.08.2026,
- 973 · The beginner guide owes today's cut-material lesson, and its currency was attested by
- 971 · The delivered-hypothesis lesson landed with its rule unenforced. The cross-vendor
- 969 · The card header is rejected a FOURTH time, and point 967 closed without the approval its
- 967 · The card header's portrait stacking now reads worse than what it replaced — third round.
- 966 · The unit suite run from a linked worktree writes into the LIVE repository. MEASURED
- 963 · A dashboard card header still does not wrap its two side columns (user 27.08.2026,
- 958 · The independent emergency lane reads a session's own tool calls as batch progress, so a
- 957 · The four-eyes gate's baseline can outrun every review that could clear it, so the gate
- 955 · The unit gate refuses while a delegated author commits, so the push gate goes red for no
- 953 · A red CI run whose job never STARTED is unclassified, and it blocks the turn end until a
- 947 · Blind four-eyes sweep of every way the batch can still stop, plus a double-safety
- 946 · A VDZK card still parks an owner-decidable question; admissibility gets the point-864
- 945 · A dead owner beside a live delegate wedges resurrection into the runaway pause. MEASURED
- 944 · The launcher starts the batch session inside a point worktree, so the board bookkeeping
- 943 · The unreviewed four-eyes backlog is worked off as one pulled-forward point. The
- 941 · Only the middle column of a dashboard card header wraps (user, board chat, 26.08.2026
- 936 · A decision log on the board has no end but the user's veto (the user asked on
- 935 · The derived state card blocks the board the moment nothing is running (MEASURED
- 928 · The sanctioned reviewer trailer takes the commit's reviewer away (measured 26.08.2026
- 925 · The durable lane is built but neither measured nor journalled, and its failure
- 923 · The preflight and the four-eyes gate return opposite verdicts for the same HEAD, so
- 921 · An era rule turns correctly recorded do-not-merge rows into hand-written ones, and the
- 918 · The durable lane's activation interlock takes the drain's word for it, and the drain
- 913 · The takeover drill's negative control intermittently reports a THIRD failed check, and
- 907 · An interpreter fed from a here-document or a pipe hides its writes from the main-write
- 903 · A point the serving session authored itself can never satisfy the criticality gate's
- 902 · A stated recommendation on a board card is a decision I may carry out. MEASURED
- 901 · A superseded CI run is reported as a failure and buys a whole session as its repair
- 897 · Two batch sessions ran at once, because the start decision reads the lock only at start.
- 895 · Fenced discovery, adoption, reconciliation, and the slice of landing they need. CUT OUT
- 894 · The daemon, its control plane, and how a worker escapes the session that spawned it.
- 893 · Attempt leases and epoch fencing. CUT OUT OF POINT 834 (see 890 for the cut and its
- 892 · The durable state store and its journal. CUT OUT OF POINT 834 (see 890 for the cut and
- 891 · The durable lane's schemas, invariants and the flag that keeps it dark. CUT OUT OF
- 890 · The handover architecture document is read as the spec it is, before its code lands.
- 889 · The four-eyes ledger repair lands on its own, and carries the fold that authorized the
- 885 · A delegated agent swallows the user's chat message, and the backstop cannot see that it
- 884 · Two dated fuses in the board and guide guards. MEASURED 24.08.2026 by the cross-vendor
- 880 · The four-eyes duty can be cleared without an independent review, six measured ways.
- 879 · `--help` and eight git subcommands walk straight through the main-write fence. MEASURED
- 874 · The batch's death oracle reports a dead authoring run as alive, because a fresh branch
- 870 · A merge's unattributed conflict resolution makes its files permanently unreviewable, and
- 866 · A spent failure ladder keeps probing instead of ending on a person. Point 861's inventory
- 865 · A pause record without a clock must prove it came from the user. Point 861's inventory rows
- 864 · An advisory question parks its point; only a true confirmation may. Point 861's inventory
- 863 · The two-trailer wrapper test can stay green while the second trailer is never judged.
- 862 · The criticality gate reads an EMPTY authorship as model diversity. FOUND 23.08.2026 by
- 861 · Every state that parks the batch on the user gets a recovery path or a recorded default.
- 860 · The alert ladder's last rung pauses the batch, which is now the forbidden outcome. The
- 859 · A standstill cannot announce itself: a sick container hangs every tick and no alert
- 858 · Twelve model-policy restatements went stale when the reviewer-trailer sentence landed.
- 854 · The serving-model tripwire reads two co-author trailers as one unknown model. MEASURED
- 852 · A landing gate cannot run while another author lane commits. MEASURED 23.08.2026,
- 848 · The board can freeze for hours while a single-turn batch session works, because every
- 847 · The brevity guard has four ways past it, all found by one cross-vendor reading (GPT-5.6
- 846 · The router can send a point to the Fable lane, but nothing can commission it there
- 844 · The board never shows how risky a point is (user request 22.08.2026, 21:19: "Reihe ein
- 843 · A ruling the owner already gave is asked again, because the only place it lives is a
- 840 · A model label passes as proof of authorship, and authorship decides who may merge
- 835 · The output budget kills every command it intercepts when `CLAUDE_PROJECT_DIR` is unset
- 834 · The drills prove the takeover on the real path, and only then may the dark lane be
- 829 · The calibration suite measures the repository it is running in, so it goes red for the
- 828 · `chat-reply.mjs` publishes an unrecognised flag AS the message, so a reply to the user
- 821 · The main-write fence judges the session, not the target path, so an unlocked session
- 820 · The criticality gate cannot be cleared by the review shape the tooling produces, so
- 816 · Point 809 is ticked while no cross-vendor review of the merged branch is recorded, and
- 813 · A session that dies inside the CI wait leaves the batch idle, because the wait lives
- 812 · A live writer process vetoes the launcher by merely existing, and an idle editor window
- 811 · The handover travels by the 900-second scheduler tick, so every point pays scheduler
- 809 · The batch stands still between points, and no command can say which standstill was
- 808 · A session that dies inside the CI wait leaves the batch idle for up to an hour
- 805 · The push gate reads a delegated author's own commit as a red
- 801 · THE UNIT SUITE DESTROYS THE REPOSITORY IT IS RUN IN — it force-moved `refs/heads/main`
- 800 · The boundary hands out a handover text "verbatim", and the board's own publish gate
- 796 · "Authored NOTHING" was said over 118 finished lines lying in the tree (measured
- 795 · The launcher judges liveness by the LOCK, so it started a second batch session beside a
- 794 · The user ruled on the guide's size budget: raise the ceiling, drop no pitfall
- 793 · A paused batch locks out the one message that ends the pause (measured 20.08.2026, 21:28).
- 792 · The Fable switch judges the PAST: flipping it off turned thirty-four legal commits into a
- 790 · The handover card names the session id from BEFORE the `/clear`, so the reader looks for a
- 789 · A point the machine files itself is ranked by its urgency, and only a high one
- 788 · Whether Fable is used at all is a decision in one place, flipped by one command, and
- 787 · The handover card that `batch-boundary` dictates verbatim is refused by the board's own
- 784 · A trailer-less merge commit is permanently unreviewable, and it stops the review planner
- 783 · The four-eyes gate on the morning's guards cannot be satisfied by EITHER vendor, so it
- 782 · Answer the cross-vendor review of the morning's three guard mechanisms (GPT-5.6 Sol,
- 781 · Two exported `mainCheckoutFrom` helpers disagree about what `null` means, and the next
- 780 · `scripts/author-sol.mjs` cannot record a commission from a worktree, so the delegated
- 779 · Three repeated questions have no command, so each one is paid as a context dump
- 776 · `scripts/verify/docs.mjs` is RED on `main`, and two of its three pointer rules pass
- 775 · Answer the cross-vendor review of the commit-time guard registration (GPT-5.6 Sol,
- 773 · `cut-account-core.test.mjs` is red in every worktree and green only in the main
- 772 · An owner session repaired its own mechanism for two hours and never handed over
- 771 · The claim guard was narrowed until it catches almost nothing (measured 20.08.2026,
- 770 · The context watermark watches the batch role, so an interactive session runs past it
- 769 · The timestamp guard can judge an intermediate narration line and demand a stamp that was
- 768 · Cut CLAUDE.md to its binding sentences and make the cut hold (user instruction
- 761 · The owner session's own floor after the document cut is still unmeasured
- 758 · The context fence observes instead of refusing until the consumption-reducing points
- 757 · Cut the per-turn document floor: CLAUDE.md, MEMORY.md and the global CLAUDE.md
- 753 · The authoring routing counts almost no unsuccessful review rounds, so the Fable
- 752 · The handover's exit and ramp are unattributed, so its acceleration is guesswork
- 751 · The turn-end gate and the context fence contradict each other, so a session past the
- 749 · The machine files its own status reports as user decisions, and the user keeps
- 748 · The attended window is fenced by nothing, and it is the largest remaining source
- 745 · One remaining-budget function, asked before the call rather than after it (user
- 744 · Leaving is the most expensive step of a session, and nobody has measured it
- 743 · The watermark is set where its own arithmetic holds (user 19.08.2026, on being
- 742 · The context overshoot is measured once and then forgotten, so nobody can tell whether
- 740 · Every chat answer carries the session's CONTEXT LEVEL beside the timestamp (user
- 737 · The review's pass plan cuts per COMMIT and file, so a diff that fits in one round is
- 734 · A run whose reds exceed the capture cap can never be closed, so it blocks the render
- 732 · No browser suite can run on this host, so every picture check and the closing are
- 731 · The boundary prints a handover text the board gate refuses (measured 19.08.2026 at the
- 730 · The board's queue estimates are calibrated for a slower batch than the one running
- 727 · A repeated review round is re-framed, and the spec is examined before the lane escalates
- 726 · Fable is escalated to only after FIVE unsuccessful review rounds, and that number

## 6. docs/backlog.md sections (heading · first body line)
- The give's second evidence frame is aimed by construction, not by rule (measured 07.09.2026, FIXED 08.09.2026) — `150-artefact-chiefs-answer` in `scripts/verify/polish.mjs` stepped the camera back seven
- Point 1064's cross-vendor review covers only half its files (07.09.2026) — GPT-6 Astra reviewed pass 1/2 of `cd0418380` — `PlaceScene.tsx`, `chiefMeeting.ts`,
- Richtungsansage des Ufer-Spiels bleibt außer Hörweite (07.09.2026) — Die Runde sagt vor jedem Lauf an (bankGame.ts announceRun, lueckenlos, da der Lauf auf s.direction!==null wartet), aber 
- Rate-Einladung ist in der Konzept-Ansicht unsichtbar (07.09.2026) — Die Einladung 'Space – Bedeutung raten' haengt am Sprechzettel (SpeechLabelCard.tsx: targeted && !conceptLabels) und ist
- stallSeconds der Erwachsenen-Errands wird nirgends gelesen (07.09.2026) — balance.villageLife.adultErrands.stallSeconds (20 s, 'kein Fortschritt -> Errand loslassen', Punkt 586) ist im Interface
- Wasserholen der Erwachsenen ist ein Kreislauf ohne Ziel (07.09.2026) — Nutzer-Meldung 07.09.2026: 'Die Erwachsenen scheinen zum Selbstzweck Wasser zu holen. Sie laufen damit ein paar Meter Ri
- NUTZER-AUFTRAG 07.09.2026: Brunnen komplett aus dem Dorf entfernen (07.09.2026) — EINGEREIHT als Punkt 1092 (10.09.2026), dort in der Fas — Nutzer-Auftrag, priorisiert, Begruendung Kommunikationsmechanik: 'Zudem macht der Brunnen in dem Dorf ohnehin wenig Sinn
- NUTZER-AUFTRAG 07.09.2026: eigener spaeterer Task fuer das Clipping von Lebens-Requisiten (07.09.2026) — EINGEREIHT als Punkt 1093 (10.09 — Nutzer-Auftrag: 'reihe einen weiteren Task fuer das Clipping-Problem ein, der spaeter erledigt wird' — also NICHT priori
- Clipping trifft die Kommunikationslehre nicht — 1045 tut es (07.09.2026) — Frage des Nutzers 07.09.2026: betrifft das Clipping ausser dem Brunnen auch anderes, das fuer die Kommunikationsmechanik
- Bank game: the direction call never reaches the documented spectator stand (07.09.2026) — Measured 07.09.2026 (discussion only, no code change). The children's bank game announces the run direction at the START
- Village speech has no stereo bearing, and the hush flag is both cause and exemption (07.09.2026) — Measured 07.09.2026 (discussion only, no code change). TWO things found while checking whether the adults' hush could be
- Der dokumentierte Pfad des Findings-Traegers ist der falsche — der Owner liest eine leere Datei (07.09.2026) — Gemessen 07.09.2026 18:50. Der Batch-Owner-Runbook (docs/batch-owner-runbook.md, Abschnitt 'Board and owner-only operati
- Punkt 1070: der Autoren-Screenshot ist bei 4 FPS aufgenommen und das CHIEF-Label sitzt ueber dem Huettendach (07.09.2026) — Gemessen 07.09.2026 am committeten verification/151-chief-beside-his-drummer.png des Zweigs feat/1070-chief-to-drummer (
- User decision 07.09.2026: stereo panner for village speech, and higher pitches for children (07.09.2026) — Operator decision during the bank-game hearing discussion, verbatim: 'Okay, dann brauchen wir einen StereoPanner. Zudem 
- Die Hush-Begruendung der Ufer-Karte traegt nicht: hushed haengt an der Kindernaehe, nicht an der Ruf-Tragweite (07.09.2026) — Gemessen 07.09.2026 19:15 beim Ausformulieren der sechs Karten-Aspekte. Die Karte 'Ufer-Ansage' begruendet Aspekt 4 (Ver
- Der sanktionierte Nicht-Owner-Weg ist unbenutzbar: --request verlangt eine Datei, und der Stand-down verbietet jede Datei (07.09.2026) — Gemessen 07.09.2026 19:10-19:12. Situation: Der Nutzer erteilte in DIESEM Fenster einen Arbeitsauftrag (sechs Aspekte de
- Gegenbeleg: am 06.09. gingen drei --request-Uebergaben aus einem Nicht-Owner-Fenster gegen einen LEBENDEN Owner durch (07.09.2026) — Gemessen 07.09.2026 19:20 auf Nachfrage des Nutzers ('Bisher konntest du doch immer Specs ohne Batch uebergeben, oder?')
- A verification frame passed with nothing drawn in it (measured 08.09.2026) — The 07.09.2026 22:21 picture run refreshed `verification/52-collision-port-wall.png` and drew it
- The polish suite's recorded cost is a quarter of what it measures (measured 08.09.2026) — `run-wait.mjs --await` announces `expected 5m 41s` for the `polish` suite and declares the wait
- The flow suite's chief frame may claim a pairing its village does not show (measured 08.09.2026) — `verification/04-chief-outside-his-hut.png` is declared "the chief standing beside his drummer,
- Infrastructure grew threefold while the game stood still (measured 08.09.2026) — Line counts on `main`, taken from the git history: `scripts/` went 97,542 lines (06.08.) →
- The play rock's measured radius is an upper bound, not the surface (measured 08.09.2026) — `playRockSurface.ts` bins each triangle EDGE's crossing of a ring height by bearing and keeps
- The polish runtime expectation is a quarter of the measured one (measured 08.09.2026) — `run-wait.mjs --plan polish` promises 5m 41s and 21 frames; the constant behind it
- The play rock's binned radius is a circumscribed bound, not its surface (measured 08.09.2026) — `playRockSurface.measure` keeps, per 11.25° bin, the LARGEST radius at which an edge of the
- The clothing research carries adults, not children (discussion 08.09.2026, no code change) — The user asked whether the village figures have a sex. They do not: `child` and `villager`
- The LARGE run of 08.09.2026 started on a machine that was not quiet — The quiet-machine check of the 1065 LARGE run reported MACHINE NOT QUIET at the shutter: a
- A red first backend lane ends the LARGE run, so the second lane never runs — Read on 08.09.2026 while reporting progress: with the WebGL 2 lane near its end and three suites
- The polish retry hangs after a red, and its expected runtime is stale — Measured 08.09.2026. After a red first attempt, `run-all` started the prescribed retry (point
- The scattered boulders are far darker than the play rocks — Seen on the picture evidence `187-child-on-the-boulder` (09.09.2026, both backends): the stone
- The beginner guide has no room left for a new lesson — Reviewing `docs/analysis_de/vibe-coding-anleitung.md` against the sources of 09.09.2026, one
- Two polish runs on one checkout tear each other up (09.09.2026) — Non-blocking, collected. On 09.09.2026 two `polish` runs were started 7.3 s
- The guard's own unit file sits close enough to the per-test cap to red under load (measured 10.09.2026) — Non-blocking, collected — and a near relative of the entry above. `scripts/mechanism-review-guard.test.mjs`
- `run-logged.mjs --help` starts a full LARGE run instead of printing help (measured 10.09.2026) — Non-blocking, collected — and the third relative of the two entries above, all of them a run paid
- `wait-lease --status` calls a dead run's lease running (measured 10.09.2026) — Non-blocking, collected. `node scripts/wait-lease.mjs --status` reported three leases as `running`
- The fill frame's camera picks a side without checking it (09.09.2026) — Non-blocking, collected. The frame of the water carrier now stands square to
- A run the operator ends himself is recorded as a CRASHED RUN (11.09.2026) — Non-blocking, collected. `render-verify-guard` keeps a list of runs that "died
- The tagged child's head flattens with its crouch (11.09.2026) — Non-blocking, collected; target point 687. `PlaceLife.tsx` squats a tagged child
- A `--section` run pays a cold browser and dev-server boot every time (11.09.2026) — Measured on point 1085: `verify polish --section=adult-errands` takes 110 s, of
- A teaching arrival outside the player's earshot shows nothing at all (11.09.2026) — Measured while landing point 1110. A runner that arrives, reaches the stone and
- `polish --section=adult-errands` fails at exactly the earshot boundary (11.09.2026) — Seen once in the WebGL 2 pass of point 1110, green on the retry and green on
- The `settlement-fabric` frames shoot before the scene has drawn (11.09.2026) — Measured while investigating point 1103, which this finding voided. The two
- First-person ground micro-detail fails on both `main` and every branch (12.09.2026) — `settings --section=ground-detail` fails its edge-energy check on WebGL 2 with a laplacian
- LOW now allocates a velocity attachment it never reads (12.09.2026) — Point 1112's repair keeps the scene MRT identical in every mode, so the LOW graphics
- What the closing regression actually costs, measured at one point (12.09.2026) — Measured across point 1112's twelve suite runs (161 min of suite wall clock): the cheap
- The handover card claims nothing is running while an adopted run runs (12.09.2026) — `scripts/batch-boundary-core.mjs` ends every boundary card with "Hier läuft nichts weiter.",
- The beginner guide is missing the ceiling a green run cannot show (13.09.2026) — The retrospective's newest lesson of the same evening (§3.270) has no counterpart in
- A unit test spends twenty seconds reading the live review history (14.09.2026) — `scripts/mechanism-review-guard.test.mjs` has two cases that scan the REAL review
- Der Saum-Test des Erdhaufens beweist die Saumschließung nicht (14.09.2026) — `src/scenes/place/digSpoilGeometry.test.ts` prüft, dass die Vertex-Positionen des
- Erledigt-Karten des Boards behaupten pauschal ausstehende Abschlussarbeiten (14.09.2026) — Über die Erledigt-Sektion läuft die Schablone „dieser Punkt ist zusammengeführt und
- Lebendigkeit wird aus der Buchhaltung abgeleitet statt am Prozess gemessen (14.09.2026) — Zwei Ausprägungen derselben Abkürzung an einem Vormittag, beide an der laufenden
- Ein vom Nutzer erlassenes Closing kostet dreizehn einzelne Verzichtsbuchungen (14.09.2026) — Beim `poc`-Tag vom 14.09.2026 hat der Nutzer den Closing-Durchlauf ausdrücklich
- Das Wasserpaar findet im ersten Anlauf nicht zusammen (14.09.2026) — Der Abschnittslauf `polish --section=adult-errands` auf WebGL 2 färbte im ERSTEN
- Der deckende Lauf stirbt mit seinem Arbeitsverzeichnis (15.09.2026) — Die beiden deckenden `polish`-Läufe für Punkt 1127 liefen im Arbeitsverzeichnis
- Der Bildschirm-Wächter verweigert jeden Zug, wenn die Sitzung im Arbeitsverzeichnis steht (15.09.2026) — Der Stop-Wächter liest `.claude/dashboard-state.json` AUS DEM VERZEICHNIS, in dem
- Die Wartehilfe erklärt einen gesunden Bild-Lauf für hängend (15.09.2026) — `run-wait.mjs --await` meldet "HUNG" und rät zum Abbruch, sobald ein Lauf das
- Der batch-resume-Kopf nach /clear ist auf den Sitzungsbeginn eingefroren (15.09.2026) — Gemessen 15.09.2026, 12:08–12:12: Die `SessionStart:clear`-Zeile meldete „402
- Vier Ortsmarken stapeln sich am Kilimandscharo (15.09.2026) — Beim Nachhalten der aufgefrischten Abnahmebilder gesehen, WebGL-2-Spur,
- Die Fehlerquote des Wasserauftrags ist nicht gemessen (15.09.2026) — Aus dem Code des 1131-Zweigs abgeleitet, kein Sweep gefahren: Die Blockade am
- Der 45-Minuten-Riegel je Suite steht unter dem gemessenen Band (16.09.2026) — Aus Punkt 1137 mitgemessen, noch nie ausgelöst: `run-all.mjs` tötet eine Suite
- Geparkte Zweige zählen als lebende Agentenlanes (16.09.2026) — `batch-doctor --gate` hat am 16.09. ein rotes `npm run test:unit` als
- Ein festgefahrener Lauf kann von fremden Bildern am Leben gehalten werden (16.09.2026) — Aus fünf Prüfrunden zu Punkt 1137, von GPT-6 Astra gefunden und nicht
- Eine Marke, deren Besitzer sich mitten im Lauf ändert, bleibt stehen (16.09.2026) — Aus der zehnten Prüfrunde zu Punkt 1137, von GPT-6 Astra gefunden und bewusst
- Zehn Prüfrunden an einem Punkt: die Abbruchentscheidung (16.09.2026) — Punkt 1137 hat zehn kreuzverlagerte Prüfrunden durchlaufen; jede fand etwas
- `--help` startet auf den beiden schwersten Einstiegen einen vollen Prüflauf (16.09.2026) — Beim Bearbeiten von Punkt 1137 selbst aufgelaufen: `node
- Der Warteschlangen-Neubau überschreibt die Prosa der aktuellen Karte (16.09.2026) — `node scripts/board-queue.mjs` baut die Warteschlange aus dem Arbeitsauftrag neu — und ersetzt
- Der Arbeitsbaum eines beauftragten Agenten sieht den Fehlerbericht nicht (16.09.2026) — Der Auftrag zu Punkt 1138 nennt `local/ErwachseneEingeklemmt.zip` als das zu messende Bild —
- Der Unit-Lauf liest eine Datei außerhalb jedes Checkouts und stirbt an ihr (17.09.2026) — Der Bildlauf zu Punkt 1045 starb nach 7m 04s in der Unit-Stufe, ohne ein
- Die i18n-Suite meldet „0 pass, 0 fail", obwohl sie prüft (17.09.2026) — Im Beweislauf zu Punkt 1140 meldete `scripts/verify/i18n.mjs` auf WebGPU als
- Das Steuerkreuz wählt einen Inventarplatz, den nichts benutzen kann (17.09.2026) — Punkt 1140 gibt dem Gamepad Zugang zur Inventarleiste: Steuerkreuz links und
- Der Hänge-Detektor liest die Polish-Suite falsch, die erst am Ende schreibt (17.09.2026) — Gemessen 17.09.2026 (Befund aus dem Träger, 17:40): `run-wait --await` erklärte
- Die Laufprotokolle eines Branches sterben gar nicht mit seinem Worktree (18.09.2026) — Gemessen 18.09.2026 beim Bau von Punkt 1134. Der Punkt bestellt, die `run.json`
- Fünf `feat/`-Branches überleben ihren Merge, zwei davon mit ungemergter Arbeit — Gemessen 18.09.2026 auf `main` d8e1e6129. `git worktree list` und `git branch`
- Die Lastmessung starb mit der Sitzung, die sie gestartet hatte — Gemessen 18.09.2026. `scripts/throttle-probe.mjs polish --section=children-motion
- Der Doktor hat keine Prüfung für seine eigene Pfadliste (20.09.2026) — `scripts/batch-doctor.mjs` las die Pfade seiner schmutzigen Dateien mit einem festen
- Der Zeigersperr-Beobachter bleibt über sein Zeitfenster hinaus scharf (21.09.2026) — Die Erholung in `src/scenes/place/pointerLock.ts` (Punkt 1158) hält ihre Absicht
- Ein laufender beauftragter Autor ist in keiner Wiederaufnahme-Prüfung sichtbar (21.09.2026) — Die Batch-Wiederaufnahme las `scripts/focus.mjs show` („1158: returned to queue"),
- `--agent-check` urteilt „alive" auf Dateien, die eine beendete Suite geschrieben hat (21.09.2026) — Im selben Vorgang meldete `node scripts/batch-in-flight.mjs --agent-check --worktree
- Ein `--section`-Lauf überschreibt die Vollpass-Bilder mit Kaltstart-Bildern (21.09.2026) — `npm test -- polish --section=speech-guess` schrieb `verification/148-speech-guess-invitation.png`
- Fünf verwaiste Autor-Arbeitsbäume stehen ohne Eintrag irgendwo (21.09.2026) — Nachdem der Neubau von Punkt 1158 genau an dieser Blindheit lag, wurde der Bestand gemessen:
- Ein Hafenkind trat einmal auf der Stelle — und nur einmal (21.09.2026) — Beim Landen von Punkt 690 las der `children-motion`-Abschnitt auf WebGL 2 in Kairo das
- Die Spiegelregel der Trommelsprache ist nicht eindeutig: RIVER und CHIEF (21.09.2026) — Aus einer Nutzerfrage: Wird die Bedeutung der hohen und tiefen BA-Folgen je Spielstart neu
- Fünf verwaiste Worktrees, einer davon ein offener Punkt (22.09.2026) — Gemessen 22.09.2026 11:12: `git worktree list` zeigt neben dem Haupt-Checkout fünf
- render-verify-guard blockt auf testreinen Harness-Dateien (22.09.2026) — Gemessen 22.09.2026: Der Guard blockt das Zugende für `src/scenes/place/layoutHarness.ts` und
- Die Webstuhl-Hilfsperson hat keine Arbeitsanimation, und beide Kettenenden sehen gleich aus (22.09.2026) — Aus der Nutzermeldung vom 22.09.2026: „Das mit dem Weben funktioniert. Allerdings finde ich nicht
- Der Retry-Takt der automatischen Pause kennt keinen Nutzer-Halt (22.09.2026) — Gemessen am 22.09.2026 zwischen 20:52 und 20:58. Der Nutzer hatte die Batch
- `polish` adult-errands: die Montage-Wartebedingung akzeptiert veraltete Hooks (22.09.2026) — Gemessen beim Bildnachweis von Punkt 1184 auf WebGPU: In 2 von 4 Läufen der
- Board card titles keep a hold marker after the point resumes — Found 25.09.2026 (board chat). The queue card for point 659 still read
- Communication route: two framing weaknesses seen in round 7 — Found 26.09.2026 in the point-659 route evidence (`communication-webgpu-1790372136841-*`).
- CI flake: batch-daemon M40 lease-fence test — Found 26.09.2026 on main `22f10b130` (CI run 36199903308, job fast (1)):
- Board liveness: running verification unattributed on Windows — Found 26.09.2026 in the round-2 review of the board-liveness point (feat/1195, `903cb438e`):
- Doctor quarantine stash sweeps a live run's frames — Found 26.09.2026 during the closing LARGE: `scripts/batch-doctor.mjs` quarantines with
- Blind-reviewer net rejects complete enumerations — Found 27.09.2026 during closing 633's blind cleanup: `BLIND_FIRST_PERSON` in
- Closing 633 cleanup: 1011 backlog decisions — The blind-parallel cleanup of closing 633 decided 1011 union entries as `backlog` (no player
- CI flake: batch-daemon cancel-attempt journals a stale pushed SHA — Found 28.09.2026 on main `54bd6bb37` (CI run 36413079847, job fast (1)):
- Chat responder holds the batch lock and loops in batch stop guards — Found 28.09.2026 15:39 (finding 89f6e96d): a `claude -p` responder session (one chat message, lock
- Bookkeeping commits on main invalidate the running closing regression — Found 28.09.2026 during closing 633: `closing-guard-core` requires the second LARGE to name
- The standstill watchdog fires during a declared LARGE wait — Found 29.09.2026 during closing 633: at 01:54 the watchdog reported "the batch has not moved
- `awk` is classified as a read, so its program can write unguarded — Found 29.09.2026 in review of point 1207: `directSegmentIntent` classifies
- Decision-log rotation retry: text identity cannot tell every twin from a retry — Found 29.09.2026 in the fifth cross-vendor round of point 1185 (GPT-6 Astra, receipt
- Mid-lake animal keeps a crossing target at its own position — Found 29.09.2026 while fixing point 1234 (unreactive calf). An animal in open water with no
- Calf play bout falls into the river readily near a bend — Found 29.09.2026 in the WebGL 2 run of point 1234. A calf whose parent stands across the
- Sketch: dugout canoe as a second upstream/downstream teaching picture — Discussion sketch of 29.09.2026 (https://claude.ai/artifact/JS3wieo3W3zLxtNBZMtyAD), not a
- Speaking cue on the figure itself: examined and not built — Examined 29.09.2026 with the speech-label tails and receding older labels. A figure could show
- Board reads "BATCH STEHT" while the owner is landing (30.09.2026) — Lock heartbeat seen frozen since the claim while the owner session was landing a point; the board
- Speech bubble crosses the viewport edge (30.09.2026) — In the 1245 upstream-word frame (boat stand) the net man's head sits at the left picture edge and
- A live claimant loses the released lock after the 30-minute pick-up cap (01.10.2026) — From closing 1248: on 30.09.2026 the lock released to c3fd94cf was taken by the regular launcher
- Near/far speech-note judge trusts CSS no product path writes (03.10.2026) — GPT-6 Astra's confirming pass on point 1271 (f1b7fe7, merge-with-fixes) names two
- WebGL 2 fish-fire frame draws no ground or river (03.10.2026) — From the picture check of 1273 at 0711a3c25: on WebGL 2 (39 FPS) the new frame
- v0.3.1 closing cleanup (1462, docs part 1) — - `scripts/help-core.mjs` usage harvest picks up source fragments as usage text (`docs/command-index.md` rows ask-lane `

## 7. Findings carrier (incident record): 1020 entries, 1011 closed. Most recent 160 titles:
- [x] 2026-10-21 [request] · queued 1415 @037c9d05968c ~c200037d · Bug-report state dump captures the live place-scene runtime
- [x] 2026-10-21 Main pre-push unit gate went red under parallel load with no test name kept
- [x] 2026-10-21 Six user bug reports 21.10.2026 (Bambara village, seed 3318564123) awaiting approval
- [x] 2026-10-21 [request] · queued 1416 @037c9d05968c ~f6238d82 · Villagers at the fish-drying rack jitter in place
- [x] 2026-10-21 [request] · queued 1417 @037c9d05968c ~6689e95d · Fish-handling woman only rocks the fish, which clips through her 
- [x] 2026-10-21 [request] · queued 1418 @037c9d05968c ~ff0fcfdf · Villager walks into stacked baskets; baskets have no collision
- [x] 2026-10-21 [request] · queued 1419 @037c9d05968c ~bf1d181f · Village goats have no collision (walk through posts and figures)
- [x] 2026-10-21 [request] · queued 1420 @037c9d05968c ~e60ee253 · Running children float: flight phase too long, gravity feels low
- [x] 2026-10-21 [request] · queued 1395 @037c9d05968c ~bd8d6dab · Attach bug report 2 (pointing squat and low aim) to point 1395
- [x] 2026-10-21 [request] · queued 1393 @037c9d05968c ~33777692 · Move point 1393 directly after point 1407
- [x] 2026-10-21 [request] · queued 1421 @037c9d05968c ~7e1c8fb1 · Lower the OpenAI reasoning effort from high to medium
- [x] 2026-10-21 [request] · queued 1393 @037c9d05968c ~33777692 · Amend 1393: OpenAI lane reasoning effort back to high
- [x] 2026-10-22 Einsteiger-Leitfaden: Unit-Schicht kann unter Last am Zeitlimit flackern
- [x] 2026-10-22 Beginner guide: pitfall for orders ticked before push
- [x] 2026-10-22 mechanism-review-guard --status passes on a git ENOBUFS crash
- [x] 2026-10-22 batch-launcher-daemon test 'a HANGING send loses to its budget' timed out under load
- [x] 2026-10-22 Backlog from 1393 review: unlocked lane-switch read-modify-write; criticality fixture same-vendor review; cross-rev
- [x] 2026-10-22 Rule-echo: nine repo files still stamped model-policy@2f245cec after 1393
- [x] 2026-10-22 1402 picture check: rear leg still flickers at low frame rate
- [x] 2026-10-22 1402: knee pops at lift-off — trailing leg held straight, then snaps into clip swing
- [x] 2026-10-22 Villager knee pops when a walker leaves the walk gait in a corner
- [x] 2026-10-22 Villager heel strike stops the swinging foot dead; flat foot drops its kept heading in sharp curves
- [x] 2026-10-22 1402 interleave test lacks a guard that a toe-release frame occurred
- [x] 2026-10-22 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-22T10-29-34-086Z-2407799
- [x] 2026-10-22 Water jar jumps from hip to shoulder within a few frames
- [x] 2026-10-22 Cloud-Probe nie über claude --cloud versucht
- [x] 2026-10-22 Cloud-Klon blockiert an eigenen Guards
- [x] 2026-10-22 [request] · queued 1426 @1be310350ab1 ~acd49063 · Cloud-Klon arbeitsfähig machen: path-scope, request-approval-guar
- [x] 2026-10-22 Cloud-Karten aufräumen und Nutzerschritt als Karte
- [x] 2026-10-22 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-22T22-20-47-931Z-1306245
- [x] 2026-10-22 polish-villagers full pass hits the 45-min wall with a 7.9 GB renderer
- [x] 2026-10-23 Retro-Abschnitt: Wächter kannten nur eine Maschine (1426)
- [x] 2026-10-23 Boulder-Frame weiß ausgewaschen bei grünen Checks (mögliche Falschfreigabe)
- [x] 2026-10-23 Läufer wird durch Separation mit 2,4 m/s rückwärts geschoben
- [x] 2026-10-23 1424-Bild: Kind steht vermutlich in der Kamera (187-child-on-the-boulder)
- [x] 2026-10-23 1424: Ufer-Spiel-Abschnitt rot auf dem Branch (tippende Hand)
- [x] 2026-10-23 Bank-game hands stand off their stones on main
- [x] 2026-10-23 [request] · executed on main @657b243bd · Cloud-Probe aufzeichnen und Cloud-Schalter einschalten
- [x] 2026-10-23 Cloud-Probe: Markerformat hostname ohne Doppelpunkt wird nicht erkannt
- [x] 2026-10-23 Model-Wächter: verifizierte Baseline bleibt einschließlich und trippt denselben Commit erneut
- [x] 2026-10-23 [request] · queued 1429 @24d0fb882ffb ~8e4a129a · Die 9 Branches und 8 Worktrees mit TASKS.md abgleichen
- [x] 2026-10-23 [request] · queued 1430 @24d0fb882ffb ~3750bdd3 · Die Cloud-Sessions liefern Build, Lint und Vitest grün ab
- [x] 2026-10-23 [request] · queued 1431 @24d0fb882ffb ~d81f98e0 · Arbeitsanweisung an die Session übergeben, die den Batch hält
- [x] 2026-10-23 [request] · queued 1432 @24d0fb882ffb ~c92dc70e · Der Task-Walker nimmt seine Kopflast mit den Händen ab und setzt 
- [x] 2026-10-23 Chat-Session holt beim /clear den Batch-Lock und blockiert die kopflose Batch
- [x] 2026-10-23 Ursache Lock-Diebstahl: authorized-Marker umgeht Pid-Pruefung bei pending-spawn
- [x] 2026-10-23 Water carrier's report gesture points through a villager standing at the table
- [x] 2026-10-23 batch-launcher-daemon HANGING-send test times out under the full unit run
- [x] 2026-10-23 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-23T17-27-01-991Z-706083
- [x] 2026-10-23 [request] · queued 1437 @130fa624a49c ~5eb6d330 · Karte Rückmeldung beim Einreihen vom Board entfernen
- [x] 2026-10-23 [request] · queued 1438 @46d732587641 ~45e0b847 · Mittelschwere Punkte während des Cloud-Guthabens an den Claude-St
- [x] 2026-10-23 Agent isolation remote falls back to a local worktree in this session
- [x] 2026-10-23 User-approved request: dashboard card section Verteilung (queue right after the cloud fix)
- [x] 2026-10-23 Watermark deadlock: unpushed main commit needs a bundle line the watermark denies
- [x] 2026-10-23 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-23T22-42-48-350Z-2554426
- [x] 2026-10-23 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-23T22-42-48-350Z-2554426
- [x] 2026-10-23 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-23T22-42-48-350Z-2554426
- [x] 2026-10-23 New undici advisories block every push (board publish included)
- [x] 2026-10-24 Cloud clone reds 10 Vitest cases that pass locally
- [x] 2026-10-24 [request] · queued 1443 @3c2ff119e0a6 ~37b7f21a · Close the open branches first: 1441, 1442, then 1414, 1432, 1333,
- [x] 2026-10-24 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-24T09-01-02-867Z-3005
- [x] 2026-10-25 [request] · queued 1444 @3d747a29e6e2 ~02ffdb3d · Raise the batch's working pace through measured cloud use and par
- [x] 2026-10-25 [request] · queued 1444 @3d747a29e6e2 ~02ffdb3d · Raise the batch's working pace through measured cloud use and par
- [x] 2026-10-25 [request] · queued 1445 @3d747a29e6e2 ~623b3d25 · The launcher's absolute deadline counts dead time before a fresh 
- [x] 2026-10-25 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-25T06-49-37-559Z-1008105
- [x] 2026-10-25 Villager canoe third fish hidden behind unnamed box
- [x] 2026-10-25 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-25T11-26-38-672Z-2040935
- [x] 2026-10-25 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-25T11-26-38-672Z-2040935
- [x] 2026-10-25 Launcher daemon reads as unknown after clock drift past the 2 s pid tolerance
- [x] 2026-10-25 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-25T12-43-33-179Z-2357149
- [x] 2026-10-25 WebGPU water stand: report pointing check saw only 5 held frames
- [x] 2026-10-25 Unclassified red: filmed errand adult walks on between moving-capture frames 1 and 2
- [x] 2026-10-25 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-25T18-22-01-565Z-3665759
- [x] 2026-10-25 WebGL 2 village walk: arm swing check fails on gait gaps
- [x] 2026-10-25 WebGL 2 canoe: children hidden from behind the upstream rock
- [x] 2026-10-25 Backlog: two WebGL 2 villager reds from the 1333 run
- [x] 2026-10-26 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-26T00-00-34-802Z-568312
- [x] 2026-10-26 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-26T02-01-29-880Z-1087083
- [x] 2026-10-26 enrichments WebGPU: two calf-in-river reds owned by no open point
- [x] 2026-10-26 batch-doctor fires almost daily and leaves rescue branches nobody inspects
- [x] 2026-10-26 village-walk gait gaps redden on WebGPU too (1 of 3 narrow rungs)
- [x] 2026-10-26 polish-villagers runs die without the exception text
- [x] 2026-10-26 Rack women's eating gesture lifts the hand over the head instead of to the mouth
- [x] 2026-10-26 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-26T15-56-21-772Z-3657904
- [x] 2026-10-26 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-26T18-09-42-184Z-4092020
- [x] 2026-10-26 Launcher took the batch lock from a live owner judged pid-reused
- [x] 2026-10-26 [request] · queued 1452 @224ed4783681 ~c5760b76 · Raise batch throughput through measured parallelisation, cloud au
- [x] 2026-10-26 [request] · queued 1452 @224ed4783681 ~c5760b76 · Addendum to the batch-throughput request: start now on the partia
- [x] 2026-10-26 Rack eating test green while the picture shows the fish above the head
- [x] 2026-10-26 [request] · queued 1452 @88b7b6e32ad6 ~c5760b76 · Owner hint: accept 1418 during the 1452 analysis so it carries th
- [x] 2026-10-26 Owner commissioned a duplicate local author on a point whose cloud author already had the fix request
- [x] 2026-10-26 WebGL 2 adult-errands section rotates one uncharged red per run
- [x] 2026-10-27 polish-speech speech-distance-scale crashes in the figureScreen hook
- [x] 2026-10-27 [request] · queued 1455 @40cd77d524c6 ~f698d280 · Run two browser suites at once when the measured pair gain holds,
- [x] 2026-10-27 polish-villagers: two unowned intermittent reds (canoe unloader squat, river-bank foam drift)
- [x] 2026-10-27 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-27T12-36-02-350Z-3408241
- [x] 2026-10-27 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-27T15-44-56-106Z-3729893
- [x] 2026-10-27 Cloud clone tripwire judges the scarce lane OFF for lack of local switch state
- [x] 2026-10-27 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-27T18-12-46-363Z-96713
- [x] 2026-10-27 Cloud delegate clones judge the scarce lane OFF and trip the model tripwire on authorized Fable commits
- [x] 2026-10-27 [request] · queued 1308 @c7e5563a015b ~fb6e723c · Punkt 1308 in der Arbeitsreihenfolge direkt vor Punkt 1347 einrei
- [x] 2026-10-27 [request] · queued 642 @c7e5563a015b ~a7b1bdc4 · Punkte 642, 568, 1456 und 1202 nach 1308 und vor 1347 einreihen
- [x] 2026-10-27 [request] · queued 1459 @c7e5563a015b ~ebaa2946 · Launcher-Sperre registered-writer-live zählt Verwaltungsdateien u
- [x] 2026-10-27 Main-Push der 1081-Aufteilung (9e537a4a7, nur TASKS.md) am Unit-Gate zweimal rot
- [x] 2026-10-27 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-27T23-20-32-630Z-1078322
- [x] 2026-10-27 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-27T23-20-32-630Z-1078322
- [x] 2026-10-27 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-27T23-20-32-630Z-1078322
- [x] 2026-10-28 Charge CI run 40626999014 to point 1454
- [x] 2026-10-28 Enrichments covering run owed on both backends
- [x] 2026-10-28 1308 blind analyses A and B in flight
- [x] 2026-10-28 1308 blind analyses A and B are done
- [x] 2026-10-28 1308 analysis B saw a truncated corpus
- [x] 2026-10-28 CI red on feat/1454-jog-stance 246b51a (run 40670490523)
- [x] 2026-10-28 1308: reviewed and fixed, confirming Sol passes then landing
- [x] 2026-10-28 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-28T15-20-16-360Z-3509348
- [x] 2026-10-28 [request] · queued 1462 @1d00e9993dd4 ~8818145a · Release v0.3.1: tag the current main state as v0.3.1 and poc and 
- [x] 2026-10-28 [request] · queued 1463 @1d00e9993dd4 ~5340255c · Drastic zero-based simplification of the whole infrastructure, an
- [x] 2026-10-28 ci-status-guard reports run 40713828399 as failure while GitHub reports success
- [x] 2026-10-28 Point 1454: orphaned villager build stopped for the v0.3.1 closing
- [x] 2026-10-28 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-28T21-32-25-335Z-373257
- [x] 2026-10-28 CI unit shards red on parked branch feat/1454-jog-stance (bc2b576, run 40713828399)
- [x] 2026-10-29 The touch stick keeps the traveller walking after it is lifted
- [x] 2026-10-29 The world suite aborts on a click that a dialog backdrop intercepts
- [x] 2026-10-29 The speech note sits below the speaking figure's body instead of above it
- [x] 2026-10-29 An archived calf crossing outside every threat ring lands on mountain terrain
- [x] 2026-10-29 From the plaza the village loom station stands too small on screen
- [x] 2026-10-29 From behind the upstream rock most of the children's game is hidden
- [x] 2026-10-29 The mute shore scene and the water stand table stay red on a quiet machine
- [x] 2026-10-29 The dipping jar's mouth stops a hair above the water surface
- [x] 2026-10-29 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-29T01-44-07-803Z-846397
- [x] 2026-10-29 Cloud author for 1464 ended without a commit
- [x] 2026-10-29 A superseded (cancelled) CI run is handed off as RED
- [x] 2026-10-29 Point 1464 handover: polish-speech full WebGPU red after the skinned-head tip fix
- [x] 2026-10-29 Uncharged WebGPU reds in polish-speech block the v0.3.1 closing
- [x] 2026-10-29 Point 1465 also owes whole touch and enrichments runs on WebGL 2
- [x] 2026-10-29 Crashed polish-speech runs of 29.10.2026 await a whole run on both backends
- [x] 2026-10-29 Point 1395 spec should name the two chief-to-drummer checks it now owns
- [x] 2026-10-29 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-29T07-13-00-913Z-2290645
- [x] 2026-10-29 1466 charge does not account the webgl polish-speech red of 06:32:59
- [x] 2026-10-29 Board tools cannot write the Erledigt card for a landed point
- [x] 2026-10-29 ask-lane rejects the (none) answer a blind brief prescribes
- [x] 2026-10-29 ask-lane rejects answer prefixes other than B
- [x] 2026-10-29 batch-doctor quarantine-stash aborts a live LARGE run
- [x] 2026-10-29 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-29T19-13-26-207Z-3844971
- [x] 2026-10-29 [request] · queued 1462 @d6fe67e7cb27 ~8818145a · 1462: Abschlussreihenfolge für v0.3.1 nach den Entscheidungen vom
- [ ] 2026-10-29 [request] · appending 1474 · 1463: Backlog-Befunde zur Infrastruktur in die Analyse und das Obsolet-Urteil einbezie
- [ ] 2026-10-29 [request] · pending · Cloud-Schalter bleibt an bis zum ausdrücklichen Nutzerbefehl: Ablauf-Hinweis vom 05.11. und R
- [x] 2026-10-29 Doctor kills a live LARGE once its owner session has ended: STRAY_MIN_AGE_MS (2 h) is shorter than one LARGE
- [x] 2026-10-30 touch virtual-stick red only in the whole suite: lifting the stick stops the walk (order-dependent, uncharged)
- [x] 2026-10-30 enrichments crashed in the closing LARGE (river-mouth hygiene waitForFunction timeout, enrichments.mjs:1245) but ra
- [x] 2026-10-30 Traveller head-height check at low detail reads 1.352-1.356 m against its < 1.35 m bound
- [x] 2026-10-30 Touch virtual-stick stop check red once under load
- [ ] 2026-10-30 Stop-Guards verlangen main-Mutationen während eines laufenden Abschluss-LARGE
- [x] 2026-10-30 Abschluss-LARGE v0.3.1 auf d6fe67e7c: zwei nicht zugeordnete Rote auf WebGL 2
- [ ] 2026-10-30 Abschluss-LARGE v0.3.1 WebGPU auf aed84aa2f: ein nicht zugeordnetes Rot (communication continuous-route)
- [ ] 2026-10-30 Board zeigt keine laufende Arbeit, obwohl der Abschluss-LARGE läuft
- [ ] 2026-10-30 Lokaler main-Commit 9a6b92d (Punkt 1474) ist nicht gepusht
- [ ] 2026-10-30 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-30T17-28-53-077Z-2139385
- [ ] 2026-10-30 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-30T17-28-53-077Z-2139385
- [ ] 2026-10-30 batch-doctor secured unattributed work-order changes on rescue/doctor-2026-10-30T17-28-53-077Z-2139385

## 8. docs/ files with line counts
1131-water-errand.md 89 · 1308-merged-plan.md 296 · 1452-step5-measurement.md 98 · 1452-throughput-inventory.md 217 · 1455-step1-eval-a.md 203 · 1455-step1-eval-b.md 103 · 1455-step2-merged-plan.md 304 · 1455-step4-log.md 122 · 205-world-accuracy-findings.md 847 · acceptance-criteria-detail.md 583 · acceptance-evidence.md 2108 · backlog.md 2236 · batch-autonomy.md 3270 · batch-owner-runbook.md 327 · batch-resilience.md 642 · batch-singleton-analysis.md 257 · catcher-station-replay.md 65 · climate-1890.md 375 · command-index.md 382 · communication-1890.md 346 · communication-playthrough.md 355 · communication-poc-spec.md 479 · communication-rebuild-sweep.md 44 · context-cut-list-1209.md 252 · context-load-1209.md 95 · criticality-review.md 160 · design-reference.md 223 · document-cut-757.md 266 · fauna-behaviour-1890.md 1243 · giza-1890.md 352 · graphics-detail-levels.md 256 · guard-memory-audit.md 178 · hand-stone-contact.md 161 · handover-architecture.md 986 · harness-primitives-evaluation.md 190 · host-environment.md 187 · intraspecies-combat-1890.md 338 · lane-routing.md 411 · maximum-qa.md 265 · model-lanes-design-a-1393.md 169 · model-lanes-design-b-1393.md 109 · model-lanes-inventory-1393.md 629 · model-lanes-merge-1393.md 90 · natural-villager-motion-concept.md 478 · peoples-1890.md 2911 · perf-276-findings.md 230 · perf-277-user-hardware.md 78 · perf-driving-hitches.md 303 · picture-check-cost.md 505 · picture-check-levers.md 497 · point-cost-report.md 67 · render-architecture.md 36 · rule-corpus-audit.md 325 · standstill-analysis-809.md 56 · stash-sweep-2026-10-22.md 303 · tasks-archive.md 35214 · tts-architecture.md 28 · work-packages.md 275 · wsl-vm-recovery.md 126