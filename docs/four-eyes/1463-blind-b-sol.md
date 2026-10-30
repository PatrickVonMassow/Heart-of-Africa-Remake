--- GPT-6.1 Sol said ---
The evidence supports deleting the autonomous operating system around the game while retaining—and repairing—the ordinary development and verification pipeline.

This is an analysis of the supplied pack, not a verification of the repository’s current implementation. References below use the pack’s section numbers and unique titles because source line numbers were not supplied. Sections 4–7 contain titles or first-line excerpts, often cut mid-sentence; section 5 omits 518 of its 778 candidate closed points. There is no literal `TRUNCATED` marker, but these are incomplete records. I do not infer missing implementation details.

**Measured baseline and limits**

| Measure | Result |
|---|---:|
| Infrastructure scripts outside `scripts/verify` | 257,166 lines, including 122,796 test lines |
| Game source | 132,050 lines |
| Infrastructure/game source ratio, excluding browser harness | 1.95× |
| All scripts, including browser harness | 320,388 lines; 2.43× game source |
| `batch` + `board` + `mechanism` families | 94,701 lines, including tests |
| Listed open points in section 4 | 368 |
| Approximate Stop-hook error occurrences in section 3 | 10,122, including 160 without a script name |
| Two board-first PreToolUse message heads | 5,329 occurrences |
| Candidate closed infrastructure-like points described | 260 of 778 |

These are source size and recorded refusal counts, not measurements of wasted time. Refusals can enforce useful requirements, and the transcript extraction can double-count reminders. The stronger evidence is the explicitly contradictory requirements and damage to running verification.

**Minimum operating model**

The minimum is:

- A reproducible dependency install, build, lint, unit tests, and the applicable TypeScript checks.
- Browser verification on **both WebGPU and WebGL2**, with the actual backend confirmed.
- Pictures of the tested game revision, checked for subject, visibility, rendering completeness, and plausibility.
- A reviewer from the other vendor seeing the complete relevant change, with outstanding required fixes resolved.
- Normal Git branches and merges, with required CI checks on the candidate being landed.
- A release/deployment workflow when publishing is requested.

This needs test code, a browser runner, artifacts, and a short contribution/release procedure. It does not inherently need autonomous ownership, board state, model routing, context admission, mandatory turn-end writing, or an append-only review bureaucracy.

The pack does not show the actual CI configuration, package scripts, or branch protection. The platform replacements below are proposals, not claims that those protections are already configured.

**Mechanism inventory and disposition**

Family sizes below are measured section-1 totals, including tests. They are **not additive deletion estimates**: several decisions split a family between retained and removed responsibilities.

| ID | Mechanism, measured cost and original incident | Disposition, remaining risk and collisions |
|---|---|---|
| **D1** | CI/local Git enforcement: `ci` 5,256 lines; `pre` 2,093; `push` 322; `commit` 616. Headers identify the fast push gate, noticing red CI, and proving push arrival. Section 3 records 1,189 CI-status and 1,078 push-arrival blocks. | **REPLACE-BY required CI and protected merges.** Retain build, lint, unit tests and test type-checking as real checks. Remove turn-end CI policing and repeated local gate chains. Existing failures include red type-checks reaching main (909, 948), inconsistent local gates (924), and stale/superseded CI classifications (919; closed 901). |
| **D2** | Game browser suites and harness: 153 files, 63,222 lines. Real risks are demonstrated by empty pictures, wrong subjects, device loss and backend-specific reds: 507, 574, 620, 1175, 1192. | **KEEP, simplify and repair.** Require explicit suite selection, actual backend identity, an owned server, readiness-based capture, useful logs and run-specific artifacts. Keep both backends. Do not replace game verification with infrastructure attestations. |
| **D3** | Render gate/evidence machinery: `render` 13,609 lines; `picture` 376. Section 3 records 495 render-verify blocks. The family contains the Stop guard, recorder and red-charge ledger. | **DELETE the Stop gate and red-charge waiver system; REPLACE-BY ordinary test results and artifacts.** Retain only the small evidence functionality D2 needs. Charges currently collide with check identity, backend scope, point state and landing: 643, 668, 990, 992, 1015, 1035. Failing tests remain failures; removing charge bookkeeping does not clear them. |
| **D4** | Review machinery: `mechanism` 14,536; `criticality` 3,327; `cross` 5,420; `review` 3,101; `blind` 1,814; `authorship` 659 lines. It was built for independent review and authorship proof. | **REPLACE-BY a complete cross-vendor review attached to the change. DELETE custom coverage ledgers, attribution planners, criticality gates, receipt grammars and first-person-answer filters.** Independent review remains necessary. Its machinery creates impossible clearances (887, 975), planner/recorder disagreement (915), retroactive rejection of 216 reviews (916), and rejection treated as coverage (1030). Retain explicit review scope and required fixes, addressing 972 and 956. |
| **D5** | Model and lane orchestration: `author` 4,483; `lane` 2,108; `model` 3,244; `ask` 1,614; `cloud` 653 lines. Routing, escalation, delegated authoring and serving-model policy are described in the headers. | **DELETE.** Select the author and the other-vendor reviewer directly through the available execution interface. No demonstrated game requirement needs repository model switches. Collisions include routing to an unavailable lane (678, 1369), local switch state misjudging cloud clones (1461), and model trailers changing review eligibility (888). Preserve pending work before retiring sessions or switches. |
| **D6** | Board/dashboard: `board` 21,435; `dashboard` 7,115 lines, plus active-work/focus projections. The original concern was trustworthy progress reporting. Section 3 contains 5,329 board-first PreToolUse occurrences and 1,853 dashboard-related Stop errors. | **DELETE the board, publication, projections, edit locks, heartbeat, queue presentation and all board duties.** Use ordinary issues/PRs and concise session updates. Reporting remains useful; authoritative board state does not. Collisions include delegated worktree lockouts (899, 910), unreachable completion cards (976), and writes required after context admission forbids them (1020). |
| **D7** | Autonomous batch runtime: `batch` 58,730 lines; `lock` 660; `launcher` 319; `detached` 2,298; `windows` 899; `child` 1,526; `alert` 1,647. The singleton header names the parallel-session incident; other headers describe resurrection and recovery. Section 3 records 1,382 batch-progress blocks. | **DELETE the batch owner, leases, singleton, daemon, autostart, doctor, emergency ladder, journal, checkpoints, adoption/reconciliation, scheduled resurrection and supervision.** A game build does not need autonomous resurrection. Use CI for jobs that must outlive an interactive session. Collisions include takeover from working owners, stale liveness, lost work and killed verification: 660, 823, 908, 1188, 1467 and section 7’s doctor incidents. |
| **D8** | Context/handover enforcement: `context` 6,822; `handover` 1,991; `clear` 937; `session` 528; `cut` 1,478 lines. These attempted to bound context use and enforce handover. Section 3 shows 416 committed-boundary and 252 watermark refusals among the displayed heads. | **DELETE fences, admission transactions, permits, watermark enforcement, compulsory boundary cards and handover accounting.** Use the execution environment’s context controls and a plain written handoff when needed. Collisions are explicit in 755, 756, 881, 1020 and 1291. Reduced mandatory reading is the simpler response to a large fixed context load. |
| **D9** | Custom communication and user-decision control: `chat` 6,886; `request` 1,298; `decision` 1,880; `user` 1,745; `vdzk` 980; `defer` 532 lines. Built to deliver phone messages, route decisions and avoid unnecessary user waits. Decision-card guard: 497 recorded Stop errors. | **DELETE custom chat watcher/responder, decision cards, approval-deposit parser, decision rotation and typed parking system.** Use the normal conversation and issue/PR interfaces. Respecting user decisions remains necessary. The custom path creates non-owner deadlocks (1361), ordinary-command refusals (1373), and chat responders holding the batch lock (1328). |
| **D10** | Work tracking/intake: `queue` 7,743; `point` 4,525; `findings` 2,688; `finding` 877; `carrier` 1,391; `fold` 1,304; `bundle` 1,385; `tasks` 1,022; `commission` 1,030 lines. Built to preserve findings, rank work and enforce task completion. Findings guard: 614 recorded blocks; queue-order guard: 232. | **REPLACE-BY one work register, preferably ordinary issues, with Git commits/PRs as delivery evidence. DELETE carrier reconciliation/bells, ranking gates, commissioning gates, point-proof policing and generated queue projections.** Preserve every unresolved instruction and useful finding first. Carrier/task disagreement is itself recorded in 765 and 960; repeated rescue entries in section 7 demonstrate that record count is not incident count. |
| **D11** | Documentation/rule enforcement: `doc` 1,491; `guide` 1,915; `retro` 1,588; `rule` 1,854; `timestamp` 1,075; `closing` 2,252 lines. Built against document growth, drift, stale retrospectives and missing reply stamps. Timestamp plus retrospective guards account for 2,302 recorded Stop errors. | **DELETE document ceilings, retrospective currency, guide brevity, rule echo/review, timestamp and ceremonial closing guards.** Keep a short build/test/release guide and relevant game specifications. Preserve historical documents as history, without requiring live currency. Collisions include guide lessons that cannot fit (1095), document parsers coupled to cuts (950), and exit work forbidden by the context fence (1291). |
| **D12** | Landing/worktree controls: `land` 4,860; `worktree` 3,044; `branch` 922; `commit` 616; `stash` 427 lines. Built to land verified points and prevent destructive cleanup. | **REPLACE-BY normal Git/PR landing and native worktree operations.** Preserve native lock protection and check for unmerged/uncommitted work before removal. Delete pool-slot accounting, point ticks, model trailers and board-driven landing. Real stranded work remains in 807, 824 and 906; cleanup must not discard it. |
| **D13** | Enforcement of enforcement: `guard` 5,289 lines, including inventory, health, registration, compatibility and preflight. Built to find inert or contradictory guards. | **DELETE after their consumers are removed.** The need to predict or reconcile guards disappears with those guards. Existing contradictions are directly recorded in 853 and 873. Use normal import/type checks and tests for remaining programs rather than a second guard architecture. |
| **D14** | Wait/process controls: `wait` 2,048; `declared` 234; `prep` 211 lines, plus pause/resume helpers. Built to prevent endless polling and distinguish progress from hangs. Section 3 shows 342 “wait can never return” and 318 polling refusals. | **REPLACE-BY process handles, cancellation and evidence-based test/job timeouts. DELETE wait leases, wait markers, wait-command hooks and waiting-time preparation duties.** Preserve accurate timeout/error propagation in D2. Healthy runs falsely called hung remain a real defect (1099); a global ownership/lease registry is unnecessary. |
| **D15** | Shell/permission interception: `command` 1,527; `path` 1,099; `tool` 1,233; `firewall` 2,543; `permission` 209; `container` 1,286 lines. Built to classify writes, control scope, cap output and protect firewall changes. | **REPLACE-BY environment permissions, sandboxing and host-managed networking. DELETE shell tokenizers, auto-grant hooks and repository firewall mutation gates.** Keep a small explicit log-spill utility only if still useful. Classifier collisions are recorded in closed 907/879 and open 1373; cloud portability failed in closed 1426. Preserve the genuine host-network configuration concerns in 658 and 827. |
| **D16** | Build/assets/shared utilities: geodata and revision builders; Blender/villager pipeline; texture generators/core; PNG codec; dependency/tool/path/atomic-write helpers. Individual sizes and purposes are listed in section 1. | **KEEP the tools required to reproduce game assets or run the retained pipeline.** Keep shared helpers only while a retained consumer needs them. Their original incidents are not all supplied; that is not evidence that they are useless. No replacement framework is justified. |
| **D17** | Deployment: `deploy` 847; `pages` 812 lines, plus build revision and deployment checks. Built for stale sites and stuck deployments. | **REPLACE-BY a normal CI deployment workflow with visible status and deployed revision.** Delete autonomous stale-site polling and launcher escalation. Publishing remains a real responsibility: 528 and 663 survive as workflow/reliability defects, without requiring a daemon. |
| **D18** | Cost/calibration/standstill machinery: `measure` 4,520 lines; queue calibration within `queue`; standstill/activity reporting within `batch`. Built to explain slow throughput and scheduling estimates. | **DELETE recurring infrastructure accounting and routing calibration.** Retain the supplied measurements as historical evidence. Section 4 itself records broken journal sequencing, quadratic classification and misleading reports (815, 817, 818). No minimum game workflow requires those systems. |
| **D19** | One-time, retired and discovery material: stash sweep, cut attestations, takeover/escape/chaos drills, legacy dashboard transport, generated command index and helper discovery. Headers explicitly identify several as one-time or legacy. | **DELETE executable leftovers after preserving useful historical evidence.** Remove the command index rather than repairing its source-harvest parser (850; section 6 closing cleanup). Remove associated scheduler entries and configuration references with the implementation. |
| **D20** | Tests and optional game diagnostics: 279 non-verify test files, 122,796 lines; performance probes and stability/load measurements. | **DELETE tests whose only subject is a deleted mechanism; KEEP game tests and tests of the remaining runner.** Keep game-performance probes for targeted diagnosis, without making them standing gates. Repair retained tests that depend on ambient history, external files or wall-clock luck. Do not retain an obsolete mechanism merely because it has many tests. |

The original incidents for many minor helpers are not available beyond a header. Their cost is measured, but their historical justification cannot be reconstructed reliably. The decisions above therefore distinguish required build/verification utilities from infrastructure that exists to operate other infrastructure.

**Cause count**

An interaction here means that one infrastructure component’s state, output or requirement conflicts with another component or its Git/verification execution path. Mere infrastructure size, an ordinary game bug, and a wholly internal implementation bug are not sufficient.

The following are **auditable lower bounds from the visible records**, not estimates of the unseen population:

| Register | Interaction records identifiable from the supplied text |
|---|---:|
| Open section-4 points | **64** |
| Shown closed section-5 points | **75** |
| Section-6 backlog entries | **16** |
| Recent section-7 carrier entries | **12** |

The **139 point records** counted are:

- Open: 899, 888, 898, 738, 660, 814, 705, 791, 552, 520, 668, 670, 683, 696, 704, 724, 728, 962, 755, 756, 765, 766, 803, 823, 825, 830, 841, 845, 849, 851, 853, 856, 871, 873, 875, 878, 881, 908, 910, 922, 915, 916, 937, 942, 949, 950, 975, 976, 998, 1005, 1020, 1025, 1042, 1054, 1096, 1179, 1235, 1289, 1291, 1328, 1361, 1369, 1461, 1467.
- Closed: 1426, 1410, 1409, 1408, 1372, 1371, 1368, 1367, 1366, 1364, 1350, 1349, 1305, 1248, 1241, 1207, 1193, 1162, 1161, 1150, 1147, 1091, 1090, 1088, 1040, 1036, 1034, 1019, 1018, 1008, 1002, 988, 983, 982, 979, 977, 966, 957, 955, 953, 945, 944, 935, 928, 923, 921, 918, 903, 897, 885, 880, 879, 870, 858, 854, 852, 846, 835, 821, 820, 816, 805, 801, 800, 795, 793, 792, 787, 784, 783, 780, 773, 769, 751, 731.

The **16 backlog records** are the entries covering: wrong carrier path; non-owner request-file deadlock; two polish runs tearing each other up; false handover claim; dashboard worktree refusal; parked branches counted alive; queue rebuild overwriting prose; unit run reading outside checkouts; `--agent-check` treating suite output as life; section runs overwriting full-pass pictures; render guard blocking harness-only files; doctor stashing live frames; chat responder trapped in batch guards; bookkeeping invalidating closing; standstill watchdog firing during declared LARGE; claimant losing the released lock.

The **12 carrier records** are: cloud clone blocked by its own guards (22 October); chat `/clear` taking the lock; watermark refusing the bundle line needed to push; advisories blocking board publication (23 October); duplicate local/cloud author commissioning (26 October); the two cloud-switch/tripwire records (27 October); doctor quarantine aborting LARGE; doctor’s two-hour threshold shorter than LARGE; superseded CI handed off as red (29 October); Stop guards requiring main mutations during LARGE; board showing no running work during LARGE (30 October).

These sum to **167 record occurrences**, **not 167 distinct incidents**. Registers overlap, some titles describe the same failure, and section 7 contains exact repeated rescue records. A complete distinct-incident count cannot be established from this pack. Nor is 778 a clean denominator: section 5 explicitly warns that older `?` entries may be game points. Extrapolating the recent sample would be unsupported.

**Verdicts for every section-4 point**

“Obsolete: yes” means the original infrastructure repair is unnecessary once its mechanism is removed. It does **not** mean the reported incident was harmless or already fixed. Preserve work and evidence before closing those tasks.

“Obsolete: no” preserves the underlying requirement or defect; it does not endorse the originally proposed implementation. Historical titles need confirmation before further repair.

| Points | Obsolete | Reason |
|---|---|---|
| **1463, 1474** | **no** | This simplification and its backlog coverage remain the active work. |
| **200, 456, 460, 498, 507, 510, 514, 518, 521, 532, 558, 563, 564, 567, 568, 570, 574, 615, 620, 622, 626, 627, 642, 647, 857, 926, 939, 948, 949, 951, 968, 991, 996, 1011, 1012, 1026, 1043, 1044, 1050, 1062, 1068, 1074, 1078, 1099, 1102, 1114, 1115, 1119, 1120, 1123, 1171, 1172, 1175, 1177, 1187, 1192, 1203, 1222, 1223, 1224, 1225, 1244, 1253, 1267, 1268, 1269, 1270, 1292, 1296, 1300, 1381, 1382, 1460, 1466, 1468, 1469, 1470, 1471, 1472** | **no** | These concern the remaining browser/unit pipeline, trustworthy results, artifact survival, backend coverage, actual failures or verification cost. Resolve through D1–D3/D14/D20; do not preserve the old guards to solve them. |
| **699, 733, 927, 1009, 1447** | **no** | Game/UI/runtime or user bug-report defects survive infrastructure deletion. In particular, settlement resource accumulation (1447) is not cured by deleting batch machinery. |
| **455, 464, 528, 658, 663, 827, 851, 886, 909, 1079** | **no** | Unexplained unit reds, missing checks, deployment reliability, network configuration, CI cancellation and dependency defects still matter. For 455/886, identify the affected retained test before deciding whether deleting its subject resolves it. |
| **956, 972** | **no** | Required review fixes must be resolved, and omitted files must reach the reviewer. These are defects in review completeness, even after the custom ledger goes. |
| **531, 607, 619** | **no** | Game specification/acceptance evidence must describe the actual game. Removing documentation guards does not make inaccurate evidence correct. |
| **807, 824, 906, 917, 1096, 1226** | **no** | Existing recoverable work and safe worktree/branch handling remain obligations. Handle with D12’s simpler workflow, not a replacement cleanup daemon. |
| **184, 203, 205, 207, 285, 303, 330** | **no** | These include game quality, plausibility, visual/liveness, leak and regression assurance. Retain useful game scope; do not expand them into standing infrastructure. |
| **309, 333, 422, 448, 449, 451, 457, 463, 465, 467, 468, 471, 491, 495, 497, 504, 508, 511, 520, 529, 533, 534, 535, 536, 537, 538, 552, 553, 554, 559, 560, 561, 591, 596, 599, 602, 609, 616, 617, 621, 625, 630, 632, 635, 636, 637, 638, 639, 643, 646, 652, 660, 664, 665, 668, 670, 677, 678, 683, 696, 704, 705, 706, 708, 710, 715, 719, 722, 724, 728, 729, 735, 736, 738, 739, 741, 746, 747** | **yes** | These repair, extend, audit or account for the retired model, board, batch, context, review-gate, charge, document or work-order systems. D4–D19 supersede their original machinery. |
| **750, 754, 755, 756, 759, 760, 762, 763, 764, 765, 766, 767, 774, 777, 778, 785, 786, 791, 797, 798, 799, 802, 803, 804, 806, 810, 814, 815, 817, 818, 819, 822, 823, 825, 826, 830, 831, 832, 833, 836, 837, 838, 839, 841, 842, 845, 849, 850, 853, 855, 856, 867, 868, 869, 871, 872, 873, 875, 876, 877, 878, 881, 882, 883, 887, 888, 896, 898, 899, 900, 904, 905, 908, 910, 911, 912, 914, 915, 916, 919, 920, 922, 924, 929, 930, 931, 932, 933, 934, 937, 940, 942** | **yes** | Same reason: their specific malfunctioning machinery is removed. In particular, obsolete guard tests and custom import witnesses need no repair once their subjects are deleted. Ordinary checks still cover retained code under D1/D20. |
| **950, 952, 954, 959, 960, 961, 962, 964, 965, 970, 974, 975, 976, 978, 980, 981, 984, 986, 987, 989, 990, 992, 994, 995, 997, 998, 999, 1000, 1001, 1004, 1005, 1006, 1007, 1010, 1014, 1015, 1017, 1020, 1021, 1022, 1023, 1024, 1025, 1027, 1028, 1029, 1030, 1032, 1035, 1039, 1042, 1048, 1049, 1054, 1055, 1059, 1060, 1071, 1084, 1095, 1097, 1098, 1100, 1101, 1111, 1122, 1153, 1179, 1188, 1189, 1214, 1231, 1235, 1261, 1289, 1291, 1304, 1328, 1361, 1369, 1373, 1436, 1461, 1467** | **yes** | Same reason. Preserve any actual failing test result separately from its obsolete charge/owner/card obligation. For example, 1467 ends by removing doctor quarantine, not by teaching the doctor another LARGE exception. |

Coverage: **114 “no” + 254 “yes” = all 368 listed points**, with no point assigned twice.

**Section-6 infrastructure backlog verdicts**

The following table includes infrastructure and verification-evidence entries, including borderline cases where the observed symptom may be in the game. Titles are shortened only enough to identify the supplied heading. Grouped entries receive the same verdict individually.

| Reference | Backlog heading(s) | Obsolete | Reason / remaining defect |
|---|---|---|---|
| B1 | “The give’s second evidence frame is aimed by construction…” | **yes** | The heading explicitly says **FIXED 08.09.2026**. Preserve the historical lesson; no open repair follows from this excerpt. |
| B2 | “Point 1064’s cross-vendor review covers only half its files” | **no** | Incomplete review remains a defect under D4. Verify whether the other half was subsequently reviewed. |
| B3 | “Der dokumentierte Pfad des Findings-Traegers ist der falsche…” | **yes** | D10 removes the carrier and its owner-specific path. Migrate unresolved contents first. |
| B4 | “Punkt 1070: der Autoren-Screenshot ist bei 4 FPS aufgenommen…” | **no** | Evidence quality and label placement remain relevant to the picture check. |
| B5 | “Der sanktionierte Nicht-Owner-Weg ist unbenutzbar…”; “Gegenbeleg: am 06.09. gingen drei --request-Uebergaben…” | **yes** | D7/D9/D10 remove owner-only request delivery. Preserve the counterexample as evidence that the historical behavior was conditional, not universally impossible. |
| B6 | “A verification frame passed with nothing drawn in it”; “The flow suite’s chief frame may claim a pairing…” | **no** | False visual acceptance remains a D2/D3 defect. |
| B7 | “The polish suite’s recorded cost is a quarter…”; “The polish runtime expectation is a quarter…” | **no** | The remaining runner must not advertise or derive timeouts from false expectations. These appear to describe the same 5m41s expectation; link them rather than count them as independent causes. |
| B8 | “Infrastructure grew threefold while the game stood still” | **yes** | Historical diagnosis supporting teardown, not a separate mechanism repair. The excerpt cuts off the later line count, so “threefold” cannot be independently recomputed here. |
| B9 | “The LARGE run … started on a machine that was not quiet” | **no** | Performance evidence needs its load conditions recorded. Ordinary correctness tests should be made robust to expected load rather than universally demanding silence. |
| B10 | “A red first backend lane ends the LARGE run…” | **no** | The runner must still obtain/report both required backend results. |
| B11 | “The polish retry hangs after a red…” | **no** | Remove compulsory retries, but retain the obligation that the remaining runner terminates and reports failures correctly. |
| B12 | “The beginner guide has no room left…”; “The beginner guide is missing the ceiling…” | **yes** | D11 removes budget/currency enforcement and the mandatory lesson treadmill. |
| B13 | “Two polish runs on one checkout tear each other up” | **no** | Run isolation is a concrete defect in the retained harness. |
| B14 | “The guard’s own unit file sits close enough…”; “A unit test spends twenty seconds reading the live review history” | **yes** | D4/D20 remove the review guard and its ambient-history tests. |
| B15 | “`run-logged.mjs --help` starts a full LARGE…”; “`--help` startet auf den beiden schwersten Einstiegen…” | **no** | Remaining runner CLIs must parse help and invalid options before starting expensive work. Check overlap before creating separate repairs. |
| B16 | “`wait-lease --status` calls a dead run’s lease running” | **yes** | D14 deletes the lease registry. |
| B17 | “The fill frame’s camera picks a side without checking it” | **no** | Subject/framing validation remains necessary. |
| B18 | “A run the operator ends himself is recorded as a CRASHED RUN” | **no** | The remaining runner should distinguish cancellation from crash. |
| B19 | “A `--section` run pays a cold browser…” | **no** | A measured retained-runner cost: 110 seconds is supplied for the example. Optimization is optional; this does not justify a resident daemon. |
| B20 | “`polish --section=adult-errands` fails … earshot boundary”; “Das Wasserpaar findet im ersten Anlauf nicht zusammen”; “`polish` adult-errands: … akzeptiert veraltete Hooks” | **no** | Remaining capture/readiness or game-behavior defects. The stale-hook entry reports **2 of 4** runs; do not treat a retry’s success as clearance. |
| B21 | “The `settlement-fabric` frames shoot before the scene has drawn” | **no** | Readiness must precede capture. |
| B22 | “First-person ground micro-detail fails on both `main` and every branch” | **no** | A retained check or product defect; deletion of infrastructure does not decide which. |
| B23 | “What the closing regression actually costs…” | **no** | The **161 minutes across twelve suite runs** remains useful evidence about retained verification. It is not a mandate for another accounting system. |
| B24 | “The handover card claims nothing is running while an adopted run runs” | **yes** | D7/D8 remove adoption and dictated handover cards. |
| B25 | “Der Saum-Test des Erdhaufens beweist die Saumschließung nicht” | **no** | A game unit test that fails to establish its claimed property remains defective under D20. |
| B26 | “Erledigt-Karten … pauschal ausstehende Abschlussarbeiten” | **yes** | Board completion templates disappear under D6. |
| B27 | “Lebendigkeit wird aus der Buchhaltung abgeleitet…” | **yes** | Batch liveness and resurrection disappear under D7. |
| B28 | “Ein vom Nutzer erlassenes Closing kostet dreizehn … Verzichtsbuchungen” | **yes** | D11 removes the ceremonial closing/waiver machinery. |
| B29 | “Der deckende Lauf stirbt mit seinem Arbeitsverzeichnis” | **no** | Test execution and artifacts must survive ordinary workspace handling. |
| B30 | “Der Bildschirm-Wächter verweigert jeden Zug … Arbeitsverzeichnis” | **yes** | D6 deletes the dashboard Stop guard. |
| B31 | “Die Wartehilfe erklärt einen gesunden Bild-Lauf für hängend”; “Der Hänge-Detektor liest die Polish-Suite falsch…” | **no** | False hang detection remains a runner defect if the helper survives. Replace the detection basis under D14. |
| B32 | “Der batch-resume-Kopf nach /clear … eingefroren” | **yes** | D7 removes resume-header injection. |
| B33 | “Die Fehlerquote des Wasserauftrags ist nicht gemessen” | **no** | The game claim remains unmeasured. The excerpt explicitly says code-derived and no sweep; no failure-rate estimate is justified. |
| B34 | “Der 45-Minuten-Riegel je Suite steht unter dem gemessenen Band” | **no** | Remaining suite timeouts need evidence. The excerpt says this threshold had not yet fired; do not report it as an observed kill. |
| B35 | “Geparkte Zweige zählen als lebende Agentenlanes” | **yes** | D7 removes the doctor’s liveness oracle. |
| B36 | “Ein festgefahrener Lauf kann von fremden Bildern am Leben gehalten werden” | **no** | A retained runner must attribute progress to its own run. |
| B37 | “Eine Marke, deren Besitzer sich mitten im Lauf ändert, bleibt stehen” | **no** | Until the marker’s implementation is identified, retain the run-cleanup defect; D14 may eliminate it by removing the marker. |
| B38 | “Zehn Prüfrunden an einem Punkt: die Abbruchentscheidung” | **yes** | Historical process evidence, not a new escalation/abort mechanism. D4 removes the round-management machinery. |
| B39 | “Der Warteschlangen-Neubau überschreibt die Prosa…” | **yes** | D6/D10 remove generated queue cards. |
| B40 | “Der Arbeitsbaum eines beauftragten Agenten sieht den Fehlerbericht nicht” | **no** | A reviewer/author must receive the material needed to reproduce a bug. Artifact accessibility survives lane deletion. |
| B41 | “Der Unit-Lauf liest eine Datei außerhalb jedes Checkouts…” | **no** | Non-hermetic retained tests remain defective. Identify the test; delete it only if its entire subject is retired. |
| B42 | “Die i18n-Suite meldet ‘0 pass, 0 fail’, obwohl sie prüft” | **no** | Result accounting in the retained harness is wrong. |
| B43 | “Die Laufprotokolle eines Branches sterben gar nicht mit seinem Worktree” | **yes** | This is counterevidence to a proposed repair’s premise. Preserve it and verify current artifact location rather than implementing another relocation system. |
| B44 | “Fünf `feat/`-Branches überleben ihren Merge, zwei … ungemergter Arbeit” | **no** | D12 must reconcile and preserve the two branches’ unmerged work before cleanup. |
| B45 | “Die Lastmessung starb mit der Sitzung…” | **no** | A retained measurement must finish reliably. CI or an explicitly managed process suffices; no batch daemon is required. |
| B46 | “Der Doktor hat keine Prüfung für seine eigene Pfadliste” | **yes** | D7 removes the doctor. |
| B47 | “Ein laufender beauftragter Autor ist in keiner Wiederaufnahme-Prüfung sichtbar”; “`--agent-check` urteilt ‘alive’ auf Dateien … beendete Suite” | **yes** | D5/D7 remove delegated-run adoption and the liveness oracle. |
| B48 | “Ein `--section`-Lauf überschreibt die Vollpass-Bilder…” | **no** | Artifact contamination is a concrete defect in the remaining picture pipeline. |
| B49 | “Fünf verwaiste Autor-Arbeitsbäume…”; “Fünf verwaiste Worktrees, einer … offener Punkt” | **no** | Reconcile actual work before cleanup. Different dates do not prove these are distinct sets of five. |
| B50 | “render-verify-guard blockt auf testreinen Harness-Dateien” | **yes** | D3 removes the render Stop guard. Retained tests still need appropriate verification. |
| B51 | “Der Retry-Takt der automatischen Pause kennt keinen Nutzer-Halt” | **yes** | D7 removes automatic pause/restart. Preserve explicit user stop instructions during teardown. |
| B52 | “Board card titles keep a hold marker…” | **yes** | Board titles disappear under D6. |
| B53 | “Communication route: two framing weaknesses seen in round 7” | **no** | Retained game-picture evidence needs the framing weaknesses resolved. |
| B54 | “CI flake: batch-daemon M40 lease-fence test”; “CI flake: batch-daemon cancel-attempt journals a stale pushed SHA” | **yes** | D7/D20 delete the daemon and its tests. |
| B55 | “Board liveness: running verification unattributed on Windows” | **yes** | D6 removes board liveness attribution. |
| B56 | “Doctor quarantine stash sweeps a live run’s frames” | **yes** | Remove the destructive doctor path under D7; preserve the current run first. |
| B57 | “Blind-reviewer net rejects complete enumerations” | **yes** | D4 removes answer-shape regex policing. Review completeness remains necessary. |
| B58 | “Closing 633 cleanup: 1011 backlog decisions” | **no** | The 1,011 underlying union entries are not supplied. Their collective obsolescence cannot be determined from this heading. Preserve the payload for item-level disposition; do not count them as 1,011 proven infrastructure defects. |
| B59 | “Chat responder holds the batch lock and loops…” | **yes** | D7/D9 remove both the lock and custom responder. |
| B60 | “Bookkeeping commits on main invalidate the running closing regression” | **yes** | D11 removes the custom closing guard. D1–D3 still need results tied to the tested candidate; no blanket exemption for arbitrary infrastructure changes follows. |
| B61 | “The standstill watchdog fires during a declared LARGE wait” | **yes** | D7/D18 remove standstill supervision. |
| B62 | “`awk` is classified as a read…” | **yes** | D15 removes the shell classifier. Environment permissions remain the boundary. |
| B63 | “Decision-log rotation retry: text identity cannot tell every twin…” | **yes** | D6/D9 remove the decision log and its rotation. |
| B64 | “Board reads ‘BATCH STEHT’ while the owner is landing” | **yes** | D6 removes the board and its liveness claim. |
| B65 | “A live claimant loses the released lock after the 30-minute pick-up cap” | **yes** | D7 removes claims and timed lock transfer. |
| B66 | “Near/far speech-note judge trusts CSS no product path writes” | **no** | A retained check is proving behavior through an artificial state the game does not produce. |
| B67 | “WebGL 2 fish-fire frame draws no ground or river” | **no** | A real rendering/evidence defect remains, despite the reported **39 FPS**. Frame rate is not visual correctness. |
| B68 | “v0.3.1 closing cleanup (1462, docs part 1)” | **no, pending full payload** | The visible command-index source-harvest defect becomes obsolete under D19. The remaining cleanup contents are not supplied, so the whole entry cannot be closed on that basis. |

Other section-6 entries concern gameplay, animation, communication design, geometry, clipping or user feature requests. They receive no infrastructure-obsolescence dismissal. For example, deleting the board cannot resolve water errands without a purpose, missing speech bearing, play-rock geometry, or a child’s flattened head.

**Teardown order**

Each step is independently reviewable. Its completion condition is that the retained build/test/landing path still works; this does not require rerunning every expensive suite after every documentation-only removal. Changes to the game, browser runner, backend selection or picture evidence require the corresponding verification on both backends.

| ID | Small step and completion condition |
|---|---|
| **S1** | **Preserve current work and evidence** before D6–D12. Inventory active verification processes, uncommitted changes, unpushed commits, rescue branches and unresolved carrier instructions. Section 7 specifically names unpushed `9a6b92d` and repeated rescue `2026-10-30T17-28-53-077Z-2139385`. Do not invoke doctor quarantine or force-delete worktrees to prepare this inventory. |
| **S2** | **Establish D1–D4’s ordinary landing path alongside the old one.** Confirm the actual install/build/lint/unit/type-check commands, both backend commands, picture artifacts and complete cross-vendor review procedure. Establish a known tested candidate. Configure required platform checks before relying on their replacement of local guards. |
| **S3** | **Remove mandatory turn-end duties** under D6/D8/D9/D11: dashboard, progress, timestamp, retrospective, guide, decision-card, prep and similar content-writing Stop hooks. Update their binding instructions in the same change. A normal session must be able to finish without manufacturing bookkeeping writes. |
| **S4** | **Remove PreToolUse workflow gates** under D6/D8/D10/D13/D15: board-first, ownership write restrictions, point proof, context admission and request-deposit parsing. Keep execution-environment permissions. Ordinary reads, edits and worktree work must no longer depend on batch/board state. |
| **S5** | **Retire D7’s external launch paths.** Stop scheduled resurrection, launcher/daemon supervision, watcher wakeups and emergency recovery while preserving legitimate running verification. Confirm that ending a session cannot spawn a successor or trigger quarantine. Then remove their hooks and implementations. |
| **S6** | **Retire D5’s lane and model machinery.** Drain or recover already commissioned work first. Remove switches, routers, tripwires and model-trailer dependencies together. Confirm that cloud/local work can use the same ordinary checks without local switch-state assumptions. |
| **S7** | **Replace review bookkeeping under D4.** Attach complete review scope and outstanding fixes to each live change, then remove ledger gates, receipt writers, merge drivers and attribution planners. Confirm that an independent reviewer can review the complete candidate without an impossible authorship constraint. |
| **S8** | **Simplify D2/D3/D14’s runner.** Remove Stop enforcement, charge accounting, wait registries and mandatory retry loops. Preserve explicit suites/backends, cancellation, logs and run-specific pictures. Verify help/invalid-option behavior, nonempty execution, backend confirmation and both-backend completion. |
| **S9** | **Migrate unresolved work once under D10**, then remove carrier/queue/commissioning/fold/proof systems. Apply the 368 point verdicts above and individual backlog dispositions. Preserve unknown B58/B68 payloads rather than bulk-closing them. Retire board publishing, edit locks and chat transport under D6/D9. |
| **S10** | **Simplify landing and deployment under D12/D17.** Remove board/tick/model-trailer side effects from landing. Preserve native worktree locks and unmerged work. Confirm a normal PR can pass required checks, merge and publish the intended revision. |
| **S11** | **Remove enforcement residue under D11/D13/D18/D19/D20.** Delete unused guards, tests, fixtures, scheduler/config references, generated command index and compulsory document accounting. Keep short executable instructions and historical records without live currency requirements. Run the retained checks after dependency removal. |
| **S12** | **Validate the resulting minimal workflow.** Build, lint, unit/type-check, run the browser suites on both backends, inspect production-build pictures, obtain complete cross-vendor review and land through the ordinary path. Confirm that no deleted hook, scheduler or shared-state file is needed. Any remaining failure becomes a defect in the game or this small retained pipeline, rather than justification for rebuilding a pillar. |

A1 | local/1463/raw-material.md | §4 point 755 explicitly records mandatory Stop guards demanding exit work that the context fence forbids; points 881, 1020 and 1291 record further exit/fence contradictions.
A2 | local/1463/raw-material.md | §3 records 5,329 approximate refusals across the two board-first message heads; §4 points 899 and 910 identify board/dashboard enforcement locking legitimate worktree authors out.
A3 | local/1463/raw-material.md | §7 “Doctor kills a live LARGE…” states that STRAY_MIN_AGE_MS is two hours, shorter than LARGE; “batch-doctor quarantine-stash aborts a live LARGE run” records destructive recovery interfering with verification.
A4 | local/1463/raw-material.md | §4 points 915, 975 and 1030 record a planner naming a reviewer the recorder rejects, review debt nobody can clear, and do-not-merge being consumed as coverage.
A5 | local/1463/raw-material.md | §4 points 620, 622, 1175 and 1192 identify false verification success from empty pictures, missing subjects or execution that ran no suite.
A6 | local/1463/raw-material.md | §4 point 574 says a bare verify script photographs whichever server owns port 5173; §6 “Ein --section-Lauf überschreibt die Vollpass-Bilder…” records contamination of full-pass evidence.
A7 | local/1463/raw-material.md | §4 points 909 and 948 record red test type-checking reaching main despite the existing gates, so the enforcement stack did not cover a required verification layer.
A8 | local/1463/raw-material.md | §6 “run-logged.mjs --help starts a full LARGE…” and “--help startet auf den beiden schwersten Einstiegen…” identify informational CLI requests starting expensive verification.
A9 | local/1463/raw-material.md | §6 “Point 1064’s cross-vendor review covers only half its files” and §4 point 972 identify incomplete review material despite the extensive review machinery.
A10 | local/1463/raw-material.md | §4 point 1461 and §7’s 27 October cloud-tripwire entries show authorized cloud clones being rejected because local lane-switch state is absent.
A11 | local/1463/raw-material.md | §7 repeats identical doctor rescue records, including three occurrences of rescue/doctor-2026-10-30T17-28-53-077Z-2139385, so carrier-entry totals cannot be treated as distinct incident totals.
A12 | local/1463/raw-material.md | §5 supplies only 260 of 778 candidate closed points, §6 supplies only headings/first lines and hides the 1,011 union-entry payload, and §7 supplies recent titles; an exact complete historical cause count is unsupported by this pack.
--- end ---

ask-lane: GPT-6.1 Sol (effort high) answered the audit in 636s — 12 entries
  A1 | local/1463/raw-material.md | §4 point 755 explicitly records mandatory Stop guards demanding exit work that the context fence forbids; points 881, 1020 and 1291 record further exit/fence contradictions.
  A2 | local/1463/raw-material.md | §3 records 5,329 approximate refusals across the two board-first message heads; §4 points 899 and 910 identify board/dashboard enforcement locking legitimate worktree authors out.
  A3 | local/1463/raw-material.md | §7 “Doctor kills a live LARGE…” states that STRAY_MIN_AGE_MS is two hours, shorter than LARGE; “batch-doctor quarantine-stash aborts a live LARGE run” records destructive recovery interfering with verification.
  A4 | local/1463/raw-material.md | §4 points 915, 975 and 1030 record a planner naming a reviewer the recorder rejects, review debt nobody can clear, and do-not-merge being consumed as coverage.
  A5 | local/1463/raw-material.md | §4 points 620, 622, 1175 and 1192 identify false verification success from empty pictures, missing subjects or execution that ran no suite.
  A6 | local/1463/raw-material.md | §4 point 574 says a bare verify script photographs whichever server owns port 5173; §6 “Ein --section-Lauf überschreibt die Vollpass-Bilder…” records contamination of full-pass evidence.
  A7 | local/1463/raw-material.md | §4 points 909 and 948 record red test type-checking reaching main despite the existing gates, so the enforcement stack did not cover a required verification layer.
  A8 | local/1463/raw-material.md | §6 “run-logged.mjs --help starts a full LARGE…” and “--help startet auf den beiden schwersten Einstiegen…” identify informational CLI requests starting expensive verification.
  A9 | local/1463/raw-material.md | §6 “Point 1064’s cross-vendor review covers only half its files” and §4 point 972 identify incomplete review material despite the extensive review machinery.
  A10 | local/1463/raw-material.md | §4 point 1461 and §7’s 27 October cloud-tripwire entries show authorized cloud clones being rejected because local lane-switch state is absent.
  A11 | local/1463/raw-material.md | §7 repeats identical doctor rescue records, including three occurrences of rescue/doctor-2026-10-30T17-28-53-077Z-2139385, so carrier-entry totals cannot be treated as distinct incident totals.
  A12 | local/1463/raw-material.md | §5 supplies only 260 of 778 candidate closed points, §6 supplies only headings/first lines and hides the 1,011 union-entry payload, and §7 supplies recent titles; an exact complete historical cause count is unsupported by this pack.
