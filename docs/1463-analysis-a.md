--- Opus 5.5 said ---
# Point 1463: blind analysis (analyst A)

**Basis.** Everything here comes from `local/1463/raw-material.md`. For every point I had only the title. For every backlog entry I had only the heading and first body line. Verdicts rest on that, and anything title-derived is marked *(est.)*. No part of the pack is marked TRUNCATED. Some first lines are cut mid-sentence by the extraction itself, for example §6's last entry and the `tool-output-shell.mjs` header.

---

## Q1: The zero-base minimum

Each item answers one risk that still exists.

| # | Need | Minimum mechanism | Own code |
|---|---|---|---|
| M1 | Build, lint, typecheck (src **and** tests), unit | GitHub Actions jobs, plain `npm` steps | 0 (workflow YAML) |
| M2 | Nothing red reaches `main` | Branch protection on `main` with required checks M1, M3, M4. Auto-delete head branches. Land via PR | 0 |
| M3 | Browser suites on WebGPU + WebGL2, picture check | Keep the `scripts/verify` harness (63,222 lines, outside this cut), `verify-bringup`, `verify-host-setup.sh`. Run locally on the GPU host. A small `verify:both` posts commit statuses `verify-webgpu` / `verify-webgl2` via `gh api` | ~50 lines *(est.)* |
| M4 | Cross-vendor review | One review command: send the PR diff to the other vendor, print the verdict, post commit status `cross-review`. Findings become PR comments with "require conversation resolution" | <600 lines *(est., from 5,420 today)* |
| M5 | One batch writer at a time (the e9407cae incident) | OS `flock -n` around `claude -p` under a systemd timer or cron | ~20 lines shell *(est.)* |
| M6 | Deploy and release | Existing Pages workflow plus `build-info.mjs`. Tag by hand after green checks (`gh release`) | 68 |
| M7 | Container egress | Devcontainer firewall init script holding the allowlist in one place | existing image script |
| M8 | Permissions | Declarative `permissions.allow/deny` in `.claude/settings.json`, no hooks | 0 |
| M9 | Game asset/perf tools | build-geodata, png, textureFields, generate-*-textures, blender, villager/build, perf-*, probe-label-fusion, check-deployed-benchmark, section-tag-core | ~2.3k (non-test, measured headers) |

Context management, session handover and subagent worktrees are covered by the harness itself (compaction, `isolation`), so none of them belongs in the minimum.

**Infrastructure today vs. after:**
- Today: 257,166 lines outside verify, of which 122,796 are tests. The game is 132,050 lines.
- After: roughly 3k own lines outside verify *(est.)*, about 1% of today.

---

## Q2: Inventory by pillar

Refusals are the measured §3 counts, which the pack itself calls approximate. Open points use the groups G1–G8 from Q4b. Backlog entries are numbered B1–B109 in §6 order.

| Pillar | Families (files/lines incl. tests) | Built for | Risk still there? | Refusals | Open pts / backlog | Collides with |
|---|---|---|---|---|---|---|
| **P1 Batch autonomy**: lock, singleton, lease, launcher, daemon, autostart, boundary, claim, doctor, emergency, in-flight, standstill, Windows tasks, alert ladder, child retry | batch 119/58,730 · detached 4/2,298 · alert 4/1,647 · child 4/1,526 · windows 3/899 · window 2/613 · session 5/528 · active 2/504 · durable 2/325 ≈ **67.1k** | Parallel sessions (24.07), dead batch (22.07), session boundary (27.07) | Two writers: yes, M5 covers it. Dead batch: timer covers it. Boundary: harness covers it | batch-progress 1,382 · MAIN WRITE REFUSED 304 · OWNERSHIP STAND-DOWN ≥96 (listed rows) · FENCED OUT 4 · BOUNDARY COMMITTED 416 + ≥80 | G1 55 / 17 | P2, P3 (board claims), P6 (doctor vs live runs: 1467, 1150), P5, chat (1328, 728) |
| **P2 Context**: fence, watermark, budget, ceiling, overshoot series, handover attribution, cost measures | context 20/6,822 · handover 13/1,991 · measure 12/4,520 ≈ **13.3k** | Context overshoot (700, 742) | No. The harness compacts context | WATERMARK 252 + BOUNDARY 416 (shared with P1) | G2 20 / 0 | Every Stop guard (755, 751), session end (881), board card (1020) |
| **P3 Board/chat/queue**: board, dashboard, chat, queue, decision cards, vdzk, request deposit, focus, user gate | board 48/21,435 · dashboard 25/7,115 · chat 18/6,886 · queue 11/7,743 · decision 4/1,880 · vdzk 4/980 · request 3/1,298 · user 5/1,745 · defer 2/532 · focus/notify/publish ≈ **50.0k** | User visibility and phone channel (16.07–29.07 mandates) | Partly: the user reaching the batch. GitHub Issues and notifications cover it | BOARD FIRST 2,909 · BOARD CLAIMS NOTHING 2,420 · dashboard Stops 1,828 · decision-card 497 · queue-order 232 · request-approval ≥446 ≈ **8.3k** | G3 45 / 8 | Worktrees/delegates (899, 910), fence (1020, 1042), landing (937, 976, 1100), ownership (1361) |
| **P4 Lanes/delegation**: routing, switches, author delegate, ask-lane, cloud switch, commission guard, blind merge | lane 8/2,108 · author 7/4,483 · ask 4/1,614 · cloud 3/653 · commission 2/1,030 · blind 4/1,814 ≈ **11.7k** | Scarce-model routing (654, 667) | No | COMMISSIONING … ANSWERS TO NOTHING ≥26 | within G4 / 4 | Model tripwire (1461), share switch (1369), local regression (1231), board-first (899) |
| **P5 Four-eyes gates + model policy**: mechanism gate, criticality gate, review material, authorship, model tripwire, trailers, rule fingerprints | mechanism 15/14,536 · criticality 4/3,327 · review 2/3,101 · authorship 5/659 · model 9/3,244 · cut 4/1,478 · settled 3/242 ≈ **26.6k** | Unreviewed mechanisms (377), silent model degradation (309) | Review: yes, M4 covers it. Degradation: no own mechanism needed | model-guard 70. Mechanism gate shows 0 in §3 (see A3) | G4 56 / 4 | Lanes (1008), trailers (888, 982), worktrees (922), the planner/recorder pair (915) |
| **P6 Render-verify + charges + waits**: guard, red charge ledger, recorder, throttle probe, wait lease/marker/guard, prep | render 9/13,609 · wait 11/2,048 · throttle 3/1,178 · picture 3/376 · declared 2/234 · prep 4/211 ≈ **17.7k** | Render change landed without both backends (22.07) | Yes, M3 covers it with no ledger | render-verify 495 · WAIT NEVER RETURNS 342 · POLLING 318 · prep 125 ≈ **1.3k** | G6 18 / 15 | Doctor (1467), worktrees (558), board (1100), closing (B96) |
| **P7 Landing/CI/closing**: land-point, worktree cleanup, branch hygiene, closing guard, fold, pre-push, CI guard, push-arrival, commit-scope, deploy watchdog, pages unblock | land 6/4,860 · worktree 9/3,044 · branch 3/922 · closing 6/2,252 · fold 3/1,304 · pre 3/2,093 · ci 9/5,256 · push 4/322 · commit 3/616 · deploy 3/847 · pages 4/812 ≈ **22.3k** | Red main (464), stale branches, stale site (528) | Yes, M1, M2, M6 cover it | ci-status 1,189 · push-arrival 1,078 · SLOT NOT FREE 62 · branch-hygiene 36 · CLOSING INCOMPLETE 8 ≈ **2.4k** | G7 21 / ≈3 (inside the guards row) | Delegated authors (803, 805, 852, 955), worktrees (1096, 1226) |
| **P8 Findings carrier + work-order machinery** | findings 8/2,688 · finding 2/877 · carrier 7/1,391 · bundle 3/1,385 · tasks 7/1,022 · point 6/4,525 · stash 3/427 ≈ **12.3k** | "No user order is ever lost" (21.10) | Yes. Covered by committing the order on receipt (TASKS.md line or Issue) | findings-guard 614 · tasks guards 16 | G8 13 / 2 | Stand-down (1186, B16), fence (1305) |
| **P9 Guard meta, rules, docs, timestamps, tooling glue**: guard-health/preflight/registration/compatibility, rule-echo/review, guide/doc/retro/timestamp guards, command classifier, tool-output budget, path-scope, permission autogrant, container-ask, clear-claim, help, module-link, assertionHealth, audit | guard 21/5,289 · rule 10/1,854 · command 2/1,527 · guide 3/1,915 · doc 4/1,491 · retro 5/1,588 · timestamp 4/1,075 · tool 10/1,233 · path 3/1,099 · container 4/1,286 · clear 3/937 · help/cli/module/permission/assertionHealth/audit ≈1.1k ≈ **20.4k** | Each guard was one lesson. The meta-guards exist only because the guards exist; `guard-compatibility-core` says so outright: "NO TWO GUARDS MAY JOINTLY DEMAND AND FORBID ONE ACTION" | Meta-guards: no. Lessons belong as short CLAUDE.md text | timestamp 1,159 · retro 1,143 · doc-budget 41 · rule-review 27 · guide 25 · path 7 · container 5 | G5 51 / 11 | Fence (755), boundary (1291), ownership (1054), cloud clone (1426) |
| **P10 Firewall** | firewall 7/2,543 | Container egress | Yes, M7 covers it | n/a | 658, 827 (kept) | Cloud reviewer cut off (827) |

**Measured totals (§3):**
- Stop-hook blocks: **≈10,122** across 1,360 transcripts. Of these, 160 have no script name.
- PreToolUse: the top ten heads alone give **≈7,454**.
- Of all these blocks, only render-verify (495) and the CI/push family enforce a game-relevant gate. Everything else enforces the infrastructure on itself.

---

## Q3: Cause count

| Set | Total | Caused by a mechanism (no game cause) | …of which collisions between ≥2 mechanisms *(est., title-based)* | Suite/harness defect | Game |
|---|---|---|---|---|---|
| Open, infra-like bundles (§4) | 368 (+1 = 1463) | **279 (76%)** | ≈70 | ≈72 | ≈16 (mis-binned, see A9) |
| Closed, the 260 listed (§5) | 260 | ≈230 *(est.)* | ≈50 *(est.)*, e.g. 1433, 1413, 1409/1410, 1364, 1350, 1366, 1357, 1248, 1241, 1207, 1150, 1133, 1090, 1088, 1053, 1008, 966, 958, 955, 945, 944, 935, 923, 918, 907, 897, 885, 852, 812, 805, 801, 800, 795, 793, 792, 787, 771, 770, 751, 731, 1305, 1426, 1451 | ≈25 | ≈5 |
| Backlog §6 | 109 | 58 (of 76 infra entries) | ≈17 (B16, B17, B26, B32/B47, B53, B54, B60, B61, B66, B83, B85, B91, B95, B96, B97, B104, B106) | 18 | 33 game entries |
| Carrier §7, last 160 | 160 | ≈95 *(est.)*. 22 of them are "batch-doctor secured unattributed work-order changes" alone, a doctor ↔ work-order loop | — | ≈30 | ≈35 |

**Reading:** roughly three in four infrastructure items exist only because the infrastructure exists. About a quarter of those are two mechanisms blocking each other, which is the "real blockades" the user named.

---

## Q4a: Delete/replace list

| id | Mechanism | Verdict |
|---|---|---|
| **D1** | P1 batch autonomy: all `batch-*`, launcher, daemon, autostart, singleton, lease, claim, boundary, emergency, standstill, in-flight, reconcile, resume, pause, Windows tasks, window-hide, alert ladder, child-retry, detached-*, session-death, active-work-source, durable-lane-flag, quota/pause drills. Hooks: SessionStart `batch-resume-hook`, SessionEnd `lock-release-hook`, PostToolUse `lock-heartbeat-hook`, Stop `batch-progress-guard`, `clear-claim-guard` | **REPLACE-BY** M5: `flock` + systemd timer/cron running `claude -p`. Batch state lives in TASKS.md. Deletes ≈67k lines |
| **D2** | `batch-doctor*`, `stash-sweep*` (one-time, done 22.10), `repository-integrity` | **DELETE**. It fires almost daily, creates rescue branches nobody reads, and kills live LARGE runs (1467, 1150, B91) |
| **D3** | P2 context: fence, watermark, budget, permit, incidents, ceiling, attended notice, handover-*, `measure-context-cost`, `measure-task-cost`, `measure-point-cost`, `measure-picture-cost` | **DELETE**. Harness compaction covers it |
| **D4** | P3 board/dashboard/chat/queue/decision/vdzk/request/focus/user-gate/defer/notify/publish/`dashboard-publish` (already LEGACY). Hooks: UserPromptSubmit `dashboard-reminder-hook`, the six dashboard Stop guards, `decision-card-guard`, `queue-order-guard`, PreToolUse `board-first-guard`, `request-approval-guard` | **DELETE**. Optional REPLACE-BY GitHub Issues for user orders and decisions, plus GitHub mobile notifications *(fit est.)* |
| **D5** | P4 lanes: lane-routing/switch, author-delegate/routing, ask-lane, cloud-switch, commission-guard, model-handoff, worktree-reminder, blind-merge | **DELETE**. One Claude author, the other vendor reviews (M4) |
| **D6** | P5 gates: mechanism-review (all 15), criticality-review (Stop hook already "SWITCHED OFF"), review-material-core, authorship-check, model-trailer-gate, cut-account, settled-rulings, rule-echo fingerprints | **DELETE** |
| **D7** | `cross-review(-core)`, `model-lanes.mjs` | **KEEP, shrink** (M4). Posts commit status `cross-review` as a required check |
| **D8** | `model-guard` (Stop) | **DELETE**. 70 blocks. Caused 1461, 1426, 875, 854. The author model is recorded in a commit trailer, unpoliced |
| **D9** | P6 render-verify guard, recorder, state, **charge ledger** (2,208 lines), throttle-probe, picture-stability, wait-lease/marker/command-guard, declared-wait, prep-guard, prep-arm-hook, run-wait hang detector | **REPLACE-BY** M3. A red is red: fix it, or skip the check in the suite source with a point reference. A self-hosted runner is **not** recommended: the repo is public via Pages, and GitHub advises against self-hosted runners on public repos |
| **D10** | P7 land-point, land-cleanup, worktree-cleanup, branch-hygiene, closing-guard, fold-point, pre-push-gate, ci-status-guard, ci-gate-verdict, ci-failure-cause, push-arrival-guard, commit-scope-guard, git hooks (commit-msg, pre-commit, pre-push), `enable-hooks` | **REPLACE-BY** M1 + M2. Plain workflow jobs, branch protection, `gh pr merge --auto`, auto-delete branches |
| **D11** | `worktree-bootstrap` | **REPLACE-BY** `npm ci` in the worktree |
| **D12** | P8 findings carrier, finding.mjs, findings-guard, carrier-*, findings-request, bundle-first-guard, tasks-archive/spec guards, tasks-source, point-brief, point-proof-guard, queue-rank | **REPLACE-BY** "commit the user order or finding as a TASKS.md/backlog line in the same turn", or an Issue |
| **D13** | P9 meta-guards and docs guards: guard-health/preflight/registration/inventory/compatibility/duty, mandatory-duty, rule-review, rule-echo, guide-brevity, doc-budget, doc-corpus, retro-*, timestamp-guard, `hooks/check-reply-timestamp.cjs`, container-ask, command-classify, tool-output-*, help/cli-usage/command-index, assertionHealth | **DELETE**. Keep only the user-global `berlin-timestamp.cjs` injection if the user still wants stamps (user scope, 36 lines) |
| **D14** | `path-scope-guard`, `permission-autogrant` (PermissionRequest hook) | **REPLACE-BY** M8 declarative permissions. A hook that auto-grants permissions is harder to audit than an allowlist |
| **D15** | `firewall-guard`, `firewall-rebuild`, `firewall-allow` | **REPLACE-BY** one allowlist in the devcontainer init script (M7). The guard goes |
| **D16** | `module-link-check` + fixtures | **REPLACE-BY** eslint `import/named` / tsc `checkJs` |
| **D17** | `audit-check` | **REPLACE-BY** Dependabot + `npm audit --audit-level=high` CI step |
| **D18** | `deploy-staleness`, `pages-deploy-unblock` | **DELETE**. The Pages workflow's own failure notification covers it |
| **D19** | `scripts/verify/docs.mjs` (doc-pointer suite; 857, 776) | **DELETE** *(est.: only its pointer role is visible)* |
| **D20** | Utilities: repo-paths, local-bin, atomic-write, git-tracked, is-main, main-checkout-core, settled-ruling-core | **DELETE** with their dependents. **KEEP** whatever the verify harness imports. Check with `grep` at S9 |
| **D21** | Infra docs: batch-autonomy (3,270), handover-architecture (986), lane-routing, batch-resilience, batch-singleton-analysis, batch-owner-runbook, command-index, criticality-review, guard-memory-audit, rule-corpus-audit, standstill-analysis-809, stash-sweep-2026-10-22, context-cut-list/-load-1209, document-cut-757, harness-primitives-evaluation, model-lanes-*-1393 (4), 1308/1452/1455 docs (7), point-cost-report, picture-check-cost/-levers | **DELETE**. Keep host-environment and wsl-vm-recovery (host GPU) and all game docs |
| **D22** | `docs/tasks-archive.md` (35,214 lines) | **DELETE** (git history is the archive). `TASKS.md` loses the 279 obsolete points |
| **D23** | CLAUDE.md (197) + memory index | **REWRITE** to the zero-base rules M1–M8. Lessons stay as prose, not as enforcers |
| **D24** | KEEP: verify harness, verify-bringup, verify-host-setup.sh, build-info, section-tag-core, all game tools (M9) | **KEEP**. They answer a game need |

---

## Q4b: Open infrastructure points from §4 (368 numbers + 1463)

**1463**: this analysis. It closes when S12 lands.

**Obsolete: yes (279)**

- **G1, batch/session/handover machinery (D1/D2), 55:** 1048, 898, 868, 760, 738, 739, 719, 660, 696, 814, 871, 1020, 1024, 1025, 1027, 1042, 504, 463, 455, 533, 448, 449, 616, 617, 646, 798, 806, 815, 817, 818, 823, 831, 841, 849, 904, 908, 911, 912, 964, 994, 1055, 1059, 1071, 1097, 1099, 1122, 1123, 1179, 1188, 1189, 1235, 1289, 1328, 1361, 1467. 1361 also duplicates the closed 1364.
- **G2, context/measurement (D3), 20:** 746, 759, 553, 932, 764, 747, 750, 797, 785, 621, 755, 756, 881, 997, 596, 599, 1084, 855, 498, 559. 932 is already stale: the fence refuses, 252 times per §3.
- **G3, board/chat/queue/decision/request (D4), 45:** 899, 1049, 706, 705, 665, 777, 664, 635, 638, 637, 465, 467, 471, 491, 508, 520, 451, 554, 799, 704, 728, 819, 822, 838, 869, 877, 883, 929, 930, 931, 934, 937, 940, 952, 954, 959, 965, 976, 978, 989, 1005, 1100, 1153, 1261, 1304.
- **G4, four-eyes gates/ledger/trailers/model tripwire/lanes/cloud (D5, D6, D8), 56:** 1436, 1461, 900, 896, 887, 888, 867, 735, 736, 778, 457, 309, 330 (fold the assurance need into 303), 625, 678, 722, 729, 767, 804, 824, 825, 826, 830, 836, 837, 839, 856, 872, 875, 905, 906, 914, 915, 916, 922, 933, 942, 956 (becomes PR conversation resolution), 962, 970, 972, 974, 975, 984, 986, 987, 998, 999, 1001, 1006, 1007, 1014, 1028, 1030, 1231, 1369. 896 and 836 name scripts no longer in §1.
- **G5, guards, rules, memory, docs governance (D13, D14, D19, D23), 51:** 762, 715, 630, 632, 511, 602, 333, 535, 536, 537, 538, 609, 495, 497, 529, 591, 652, 677, 683, 754, 763, 766, 802, 832, 833, 842, 845, 850, 853, 857, 873, 876, 882, 910, 949, 950, 961, 980, 981, 1021, 1022, 1023, 1032, 1039 (superseded by 1463), 1054, 1095, 1098, 1111 (also duplicates the closed 1199), 1214, 1291, 1373.
- **G6, charges/recorder/run records (D9), 18:** 558, 564, 615, 643, 668, 670, 968, 990, 991, 992, 995, 996, 1000, 1010, 1015, 1017, 1035, 1120.
- **G7, landing/CI guard/closing/branch pool/deploy watchdog (D10, D18), 21:** 708, 791, 807, 639, 636, 552, 464, 528, 560, 561, 647, 724, 803, 810, 878, 917, 919, 924, 1096, 1101, 1226.
- **G8, carrier/work-order machinery (D12), 13:** 1060, 710 *(est.)*, 774, 534, 468, 741, 765, 786, 920, 960, 1004, 1029, 1474 (answered by this analysis).

**Obsolete: no (88)**

- **Kept-harness defects. These are real defects of the remaining infrastructure:**
  - 622 + 1192 (duplicates): an empty run reports green, and unknown flags run.
  - 510: re-target to the harness. A run must fail when its backend is unconfirmed.
  - 574: the harness must own its port.
  - 567, 1074: a run dies with its session. Run detached with a timeout.
  - 460, 1044: crashes must keep their stack.
  - 507: a lost device must fail loudly.
  - 1177: the exit status after an exception.
- **CI/config defects of what remains:**
  - 909 + 948 (duplicates): tests need typecheck in CI (M1).
  - 851: the workflow concurrency group.
  - 663: the deploy download.
  - 1079: dependency upgrade.
  - 658, 827: firewall (M7).
- **Suite checks and flakes that would still be red under the zero base:** 642, 568, 1068, 1026 (re-scope: both backends only for render-touching diffs), 518, 200, 532, 514, 521, 563, 570, 620, 626, 627, 926, 939, 951, 1011 (the console errors are real, drop the charge wording), 1043, 1050 *(re-check whether still red)*, 1078, 1102, 1114, 1115, 1119, 1172, 1175, 1187, 1203, 1222, 1223, 1224, 1225, 1244, 1253, 1267, 1268, 1269, 1270, 1292, 1296, 1300, 1381, 1382, 1460, 1466, 1468, 1469, 1470, 1471, 1472.
- **Game points mis-binned as infrastructure:** 699, 733, 1062, 1447, 927, 1009, 1012 *(est.: perf tooling)*, 1171.
- **Game QA and game docs:** 184, 203, 205, 207, 285, 303, 422 (the guide is a user document; only its guard goes), 531, 607 *(est.)*, 619.
- **Unclear owner:** 456, 886. Both become obsolete if their test file belongs to a script deleted in S3–S10. Re-check at that step.

Tally: 279 + 88 + 1 = 368 + 1463.

---

## Q4c: Infrastructure entries of docs/backlog.md (§6)

Positions B1–B109 follow §6 order.

**Game entries, not infrastructure (33):** B3–B11, B13, B14, B15, B22, B24, B25, B29, B37, B39, B43, B48, B57, B58, B69, B75, B80, B81, B84, B100–B103, B105, B108.

**Obsolete: yes (58)**

| Pillar | Entries | Reason |
|---|---|---|
| P1 batch | B45 (handover card), B50 (liveness from bookkeeping), B56 (resume header frozen), B60 (parked branches as live lanes), B72 (branches survive merge; reconciled by closed 1429), B74 (doctor path list), B76, B77 (agent liveness), B79 + B82 (duplicates: orphan worktrees), B85 (pause retry ignores user halt), B89, B94 (daemon CI flakes), B91 (doctor quarantine; = 1467), B95 (chat responder holds lock), B97 (standstill watchdog vs declared wait), B106 (claimant loses lock) | D1/D2 |
| P3 board | B16, B17 (request path vs stand-down), B49 (Erledigt cards), B65 (queue rebuild), B87 (hold marker), B90 (board liveness), B99 (decision-log rotation), B104 (BATCH STEHT while landing) | D4 |
| P4/P5 review, lanes | B2 (review covers half the files of 1064), B63 (ten review rounds), B66 (delegate worktree lacks `local/` file), B92 (blind-reviewer net) | D5/D6. M4 reviews the whole PR diff |
| P9 guards, docs, closing | B30, B46 (guide budget), B32 + B47 (duplicates: guard test near cap; = 1111), B51 (13 waiver bookings; = 791), B54 (dashboard guard in worktree; = 910), B67 (unit run reads outside checkout; = 845), B83 (render guard on harness-only files), B96 (bookkeeping commits invalidate closing), B98 (awk classified as read), B109 (help-core usage harvest) | D10/D13 |
| P6 charges, waits, run records | B1 (marked FIXED), B19 + B23 (duplicates: polish cost a quarter), B26 (quiet-machine check), B28 (retry hangs; retry removed by 1135), B34 (wait-lease status), B36 (operator-ended run recorded as crash), B44 (closing cost measured), B53 (covering run dies with worktree), B55 + B70 (hang detector), B61, B62 (wait markers), B71 (run records), B73 (throttle probe died with session) | D9 |
| P8 carrier | B12 (documented carrier path is wrong), B93 (closing 633: 1011 backlog decisions as bookkeeping; the contents of those 1011 entries cannot be judged from the pack) | D12 |
| Meta | B21 (infrastructure grew threefold) | Answered by 1463 |

**Obsolete: no (18).** Entries marked † are real defects of the remaining infrastructure (the kept verify harness):

- † **B18** A frame passed with nothing drawn (= open 620): the harness needs an empty-frame assertion.
- † **B20** The flow suite's chief frame claims a pairing the picture does not prove.
- † **B27** A red first backend ends the run, so the second backend never runs. `run-all` must always run both backends.
- † **B31** Two runs on one checkout tear each other up. The harness needs a per-checkout run lock or separate output directories.
- † **B33 + B64** (duplicates): `--help` starts a full run. Entry points must reject unknown flags (= 622).
- † **B59** The 45-minute per-suite kill sits below the measured runtime (cf. 1223, 1382, and carrier "7.9 GB renderer at 45-min wall").
- † **B68** The i18n suite reports "0 pass, 0 fail" while it checks: result counting is broken (= 1192 family).
- † **B78** A `--section` run overwrites full-pass verification PNGs with cold-start ones.
- † **B107** The near/far judge trusts CSS no product path writes, so the check proves nothing.
- B35, B40, B41, B42 (= 1114), B52, B86, B88: individual check aim or flake defects. Fix them in the suites.
- B38: a `--section` run pays a cold boot. This is efficiency only, optional.

Tally: 33 + 58 + 18 = 109.

---

## Q4d: Teardown order

After every step, the step's PR must show build, lint, typecheck, unit and both browser backends green (one smoke suite per backend). The step is reviewed via M4. `package.json` scripts and `vitest` globs that reference deleted files are edited in the same step.

- **S1 Quiesce.**
  - Disable the OS scheduler entries (Linux launcher/daemon, both Windows tasks) and the chat watcher.
  - Copy the 9 open carrier rows (§7) into TASKS.md.
  - Inspect the `rescue/doctor-2026-10-30T17-28-53-077Z-2139385` branch.
  - Confirm that 9a6b92d is on `origin/main`.
  - No code deleted yet.
- **S2 Stand up the replacement.**
  - CI jobs M1, including typecheck of tests.
  - Branch protection on `main` (required: M1), auto-delete branches.
  - From here on, landing means PR merge. `land-point` is dead.
- **S3 Unhook.**
  - Empty `.claude/settings.json` hooks: all 29 Stop, all PreToolUse, PostToolUse, SessionStart/End, UserPromptSubmit, PermissionRequest.
  - Add M8 permissions.
  - Unset `core.hooksPath`; remove `enable-hooks` from `prepare`.
  - This is the largest relief: ≈17k refusals per corpus disappear. The game is untouched.
- **S4** Delete D1 and D2 (batch, doctor, daemon, launcher, Windows). Install M5 if the unattended mode is still wanted.
- **S5** Delete D4 (board/chat/queue). Check first that the Pages workflow does not publish board files alongside the game.
- **S6** Delete D3 (context/handover/measure).
- **S7 Review.**
  - Shrink D7 to M4 and post the `cross-review` status.
  - Delete D5, D6, D8.
  - Add `cross-review` to the required checks.
- **S8 Verification.**
  - Add `verify:both` posting `verify-webgpu` and `verify-webgl2` statuses, and make them required.
  - Delete D9.
  - Every red that was "charged" becomes a fix or an explicit skip with a point reference in the suite.
  - Fix the † harness defects B27 and B59 first, so the required check is trustworthy.
- **S9** Delete D10, D11, D18 and the D20 utilities that are no longer imported (`grep` from the harness).
- **S10** Delete D12. Convert TASKS.md and drop the 279 obsolete points. Delete D22.
- **S11** Delete D13–D17 and D19. M7 firewall allowlist lives in one place.
- **S12** D21 docs, D23 rewrite of CLAUDE.md and memory. Re-measure the line counts of §1 and close 1463.

---

A1 | local/1463/raw-material.md | §3 Stop-hook table has a row `160 ` with no script name, so 160 blocks are unattributable to any mechanism
A2 | local/1463/raw-material.md | §1 `criticality-review-guard.mjs` header says "SWITCHED OFF", yet §2 still registers it as a Stop hook on every turn
A3 | local/1463/raw-material.md | §3 lists no refusals for six registered Stop hooks (mechanism-review, criticality-review, bundle-first, rule-echo, clear-claim, guard-health), while open point 839 says the four-eyes gate "refuses every turn end", so the refusal measurement is incomplete or 839 is stale
A4 | local/1463/raw-material.md | Open point 609 "The proof guard is built, taught and wired to nothing" contradicts §2, which wires `point-proof-guard.mjs` as a PreToolUse hook
A5 | local/1463/raw-material.md | Open points 896 (`review-sol.mjs`) and 836 (`author-sol`) name scripts absent from §1's "Every non-test infrastructure script" list, so both are stale
A6 | local/1463/raw-material.md | Open 1361 restates closed 1364 (decision-card-guard demands vdzk-keep, stand-down refuses it to a non-owner) almost verbatim, so it is a duplicate left open
A7 | local/1463/raw-material.md | Open 1111 (mechanism-review-guard test 19.4 s vs 20 s cap) duplicates closed 1199 "The mechanism-review gather test stops timing out the unit gate"
A8 | local/1463/raw-material.md | Open 932 "context fence has stood in observe mode" contradicts closed 1204 (arm the watermark) and §3's 252 "PAST THE CONTEXT WATERMARK, NEW WORK IS DENIED" refusals
A9 | local/1463/raw-material.md | §4 "infrastructure-like bundles" include plain game defects (699 label overdraw, 733 loading freeze, 1062 position query/gamepad, 1447 render pipelines and heap leak), which inflates the infra point count
A10 | local/1463/raw-material.md | §1 family table has families (four 1/293, design 1/291, stop 1/219, failure 1/132, cachekeys 1/109, recommendation 1/38, event 1/30) with no matching file in the list that claims "Every non-test infrastructure script", so that list is incomplete or the families are test-only and unexplained
A11 | local/1463/raw-material.md | §1's 257,166 "infrastructure" lines include game build and perf tools (build-geodata, png, textureFields, generate-*-textures, blender, villager/build, perf-*), so the infra size is overstated
A12 | local/1463/raw-material.md | §2 hook commands mix relative `node scripts/…` with `"$CLAUDE_PROJECT_DIR/scripts/…"`, so the relative ones resolve against the session cwd and break in worktrees or subdirectories (cf. open 715, 910, 922)
A13 | local/1463/raw-material.md | §1 keeps dead code in the tree: `dashboard-publish.mjs` "LEGACY … retired 29.07.2026", `stash-sweep.mjs` "ONE-TIME" (done 22.10, §8 stash-sweep-2026-10-22.md), and the switched-off criticality guard
A14 | local/1463/raw-material.md | §6 carries duplicate entries: polish cost "a quarter" twice, play-rock radius twice, orphan worktrees twice (21.09/22.09), `--help` starts a full run twice (10.09/16.09), mechanism-review-guard test near cap twice
A15 | local/1463/raw-material.md | §6 first entry is marked "FIXED 08.09.2026" but still stands in the backlog
A16 | local/1463/raw-material.md | §7 carrier records one doctor rescue as three identical rows (e.g. rescue/doctor-2026-10-23T22-42-48-350Z-2554426 ×3, …-10-27T23-20-32-630Z-1078322 ×3, …-10-30T17-28-53-077Z-2139385 ×3), so the carrier writes duplicates
A17 | local/1463/raw-material.md | §7 open row "[request] · appending 1474" is unticked although §4 already lists 1474 as an open point (queued in 9a6b92db1), so the carrier row was never closed after the append
A18 | local/1463/raw-material.md | §7 open row "Abschluss-LARGE v0.3.1 WebGPU … nicht zugeordnetes Rot (communication continuous-route)" is unticked while §4 already has its owner 1472 and §5 shows the release 1462 closed
A19 | local/1463/raw-material.md | §4 carries open duplicates that inflate the count: 622 and 1192 (empty run reads green), 909 and 948 (red test typecheck on main), 814/871/1024 (handover card claims nothing runs), 823/841/849/908/1189 (parallel-session detector)
A20 | local/1463/raw-material.md | §6 last entry's first body line is cut mid-token ("rows ask-lane `"), so that verdict rests on the heading alone
--- end ---

ask-lane: Opus 5.5 (effort medium) answered the audit in 562s — 20 entries
  A1 | local/1463/raw-material.md | §3 Stop-hook table has a row `160 ` with no script name, so 160 blocks are unattributable to any mechanism
  A2 | local/1463/raw-material.md | §1 `criticality-review-guard.mjs` header says "SWITCHED OFF", yet §2 still registers it as a Stop hook on every turn
  A3 | local/1463/raw-material.md | §3 lists no refusals for six registered Stop hooks (mechanism-review, criticality-review, bundle-first, rule-echo, clear-claim, guard-health), while open point 839 says the four-eyes gate "refuses every turn end", so the refusal measurement is incomplete or 839 is stale
  A4 | local/1463/raw-material.md | Open point 609 "The proof guard is built, taught and wired to nothing" contradicts §2, which wires `point-proof-guard.mjs` as a PreToolUse hook
  A5 | local/1463/raw-material.md | Open points 896 (`review-sol.mjs`) and 836 (`author-sol`) name scripts absent from §1's "Every non-test infrastructure script" list, so both are stale
  A6 | local/1463/raw-material.md | Open 1361 restates closed 1364 (decision-card-guard demands vdzk-keep, stand-down refuses it to a non-owner) almost verbatim, so it is a duplicate left open
  A7 | local/1463/raw-material.md | Open 1111 (mechanism-review-guard test 19.4 s vs 20 s cap) duplicates closed 1199 "The mechanism-review gather test stops timing out the unit gate"
  A8 | local/1463/raw-material.md | Open 932 "context fence has stood in observe mode" contradicts closed 1204 (arm the watermark) and §3's 252 "PAST THE CONTEXT WATERMARK, NEW WORK IS DENIED" refusals
  A9 | local/1463/raw-material.md | §4 "infrastructure-like bundles" include plain game defects (699 label overdraw, 733 loading freeze, 1062 position query/gamepad, 1447 render pipelines and heap leak), which inflates the infra point count
  A10 | local/1463/raw-material.md | §1 family table has families (four 1/293, design 1/291, stop 1/219, failure 1/132, cachekeys 1/109, recommendation 1/38, event 1/30) with no matching file in the list that claims "Every non-test infrastructure script", so that list is incomplete or the families are test-only and unexplained
  A11 | local/1463/raw-material.md | §1's 257,166 "infrastructure" lines include game build and perf tools (build-geodata, png, textureFields, generate-*-textures, blender, villager/build, perf-*), so the infra size is overstated
  A12 | local/1463/raw-material.md | §2 hook commands mix relative `node scripts/…` with `"$CLAUDE_PROJECT_DIR/scripts/…"`, so the relative ones resolve against the session cwd and break in worktrees or subdirectories (cf. open 715, 910, 922)
  A13 | local/1463/raw-material.md | §1 keeps dead code in the tree: `dashboard-publish.mjs` "LEGACY … retired 29.07.2026", `stash-sweep.mjs` "ONE-TIME" (done 22.10, §8 stash-sweep-2026-10-22.md), and the switched-off criticality guard
  A14 | local/1463/raw-material.md | §6 carries duplicate entries: polish cost "a quarter" twice, play-rock radius twice, orphan worktrees twice (21.09/22.09), `--help` starts a full run twice (10.09/16.09), mechanism-review-guard test near cap twice
  A15 | local/1463/raw-material.md | §6 first entry is marked "FIXED 08.09.2026" but still stands in the backlog
  A16 | local/1463/raw-material.md | §7 carrier records one doctor rescue as three identical rows (e.g. rescue/doctor-2026-10-23T22-42-48-350Z-2554426 ×3, …-10-27T23-20-32-630Z-1078322 ×3, …-10-30T17-28-53-077Z-2139385 ×3), so the carrier writes duplicates
  A17 | local/1463/raw-material.md | §7 open row "[request] · appending 1474" is unticked although §4 already lists 1474 as an open point (queued in 9a6b92db1), so the carrier row was never closed after the append
  A18 | local/1463/raw-material.md | §7 open row "Abschluss-LARGE v0.3.1 WebGPU … nicht zugeordnetes Rot (communication continuous-route)" is unticked while §4 already has its owner 1472 and §5 shows the release 1462 closed
  A19 | local/1463/raw-material.md | §4 carries open duplicates that inflate the count: 622 and 1192 (empty run reads green), 909 and 948 (red test typecheck on main), 814/871/1024 (handover card claims nothing runs), 823/841/849/908/1189 (parallel-session detector)
  A20 | local/1463/raw-material.md | §6 last entry's first body line is cut mid-token ("rows ask-lane `"), so that verdict rests on the heading alone
