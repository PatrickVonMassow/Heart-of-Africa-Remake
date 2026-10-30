--- Fable 5.1 said ---
I'll merge the two blind analyses into one plan from the attached material only (sections 1–3, questions, analysis A, analysis B), resolve each disagreement with a reason, and close with the required JSON block and the findings lines.

# Point 1463, merge (third model: Fable 5.1)

Basis: only sections 1–3 of the raw pack are attached here. Sections 4–7 (point titles, backlog headings, carrier rows) reach me solely through what A and B quote. Where a verdict depends on a title neither analyst quotes, I say so and give the default rule I applied. Nothing is marked TRUNCATED; A20 notes that §6's last entry is cut mid-token.

## 1. Zero-base minimum (Q1)

Both analysts converge on the same seven needs. The one real difference is A's M5 (an `flock` around scheduled `claude -p`); I drop it, see M-D1.

| # | Need | Mechanism | Own code |
|---|---|---|---|
| Z1 | Install, build, lint, typecheck of src and tests, unit tests | GitHub Actions workflow | workflow YAML only |
| Z2 | Nothing red reaches `main`; one writer on `main` | Branch protection: required checks Z1, Z3, Z4; PRs only, no direct push; auto-delete head branches; `gh pr merge --auto` | 0 |
| Z3 | Browser suites on WebGPU and WebGL2, picture check | The kept `scripts/verify` harness run on the GPU host, one invocation per backend, each posting its own commit status; per-run artifact directory with pictures | ≈50 lines status posting (est., A) |
| Z4 | Cross-vendor review | One command: full PR diff plus artifact paths to the other vendor, verdict posted as status `cross-review`, findings as PR review comments, "require conversation resolution" on | <600 lines (est., A), down from 5,420 |
| Z5 | Release and deploy | Existing Pages workflow plus `build-info.mjs`; tag by hand after green | 68 (measured by A) |
| Z6 | No user order or finding lost | The order is committed as a TASKS.md line in the turn it arrives | 0 |
| Z7 | Container egress, permissions | Allowlist in the devcontainer init script; declarative `permissions.allow/deny` in `.claude/settings.json` | existing image script |
| Z8 | Game asset and perf tools | build-geodata, png, textureFields, generate-*-textures, blender, villager/build, perf-*, probe-label-fusion, check-deployed-benchmark, section-tag-core | ≈2.3k (A's header count) |

Limitation both analysts underplay: the Z3 statuses are posted from the GPU host by the author's own account, so they are self-attested. The independent check on pictures is the Z4 reviewer, who receives the artifact paths. Context management, handover and subagent worktrees are harness features and are not in the minimum (both agree).

## 2. Merged delete/replace/keep list

| id | from | Scope | Verdict | Reason and disagreement |
|---|---|---|---|---|
| M-D1 | AD1, BD7 | batch, lock, launcher, daemon, autostart, singleton, lease, claim, boundary, emergency, standstill, in-flight, reconcile, resume, pause, Windows tasks, window-hide, alert ladder, child retry, detached, session-death, active-work-source, durable-lane-flag, drills; hooks batch-resume, lock-release, lock-heartbeat, batch-progress-guard, clear-claim-guard (≈67k lines) | **DELETE** | Disagreement: A REPLACE-BY flock+cron, B DELETE. Resolved B. The e9407cae incident was two sessions writing `main`; under Z2 `main` is written only by the merge, so the lock protects nothing that remains. Zero own code beats 20 lines. A scheduled runner stays a user-scope choice outside this plan. |
| M-D2 | AD2, BD19 | batch-doctor, stash-sweep (one-time, done 22.10), repository-integrity, cut attestations, takeover/escape/chaos drills, legacy dashboard-publish, command index, helper discovery | **DELETE** | Agree. The doctor kills live LARGE runs (1467, 1150, B91) and writes triplicate rescue rows (A16, B's A11). |
| M-D3 | AD3, BD8, BD18 | context fence, watermark, budget, permit, ceiling, attended notice, handover-*, clear, session, cut, measure-*, queue calibration, standstill reporting | **DELETE** | Agree. Harness compaction covers context; measurements stay as history in git. |
| M-D4 | AD4, BD6, BD9 | board, dashboard, chat watcher/responder, decision cards, vdzk, request deposit, user gate, defer, focus, notify, publish; hooks dashboard-reminder, six dashboard Stop guards, decision-card-guard, board-first-guard, request-approval-guard | **DELETE** | Agree. Both name GitHub Issues/PRs as the user channel; no own code. The two board-first heads alone are 5,329 refusals (§3). |
| M-D5 | AD5, AD8, BD5 | lane routing/switch, author delegate, ask-lane, cloud switch, commission guard, model handoff, worktree-reminder, blind merge, model-guard, model-lanes.mjs | **DELETE** | Disagreement: A keeps `model-lanes.mjs` for cross-review (AD7), B deletes the whole `model` family. Resolved B: the review command names its reviewer model as one constant; the lane concept produced 678, 1369, 1461, so no lane table should survive. |
| M-D6 | AD6, AD7, BD4 | mechanism-review (15 files), criticality-review (Stop already "SWITCHED OFF"), review-material, authorship, model-trailer gate, cut-account, settled rulings, blind-reviewer net, rule-echo fingerprints; cross-review(-core) | **DELETE** all gates; **KEEP, shrink** cross-review to Z4 | Agree on substance. A's concrete enforcement (status `cross-review` required, conversation resolution) is adopted over B's "attached to the change" because branch protection enforces it with no own policing. |
| M-D7 | AD9, BD3, BD14 | render-verify guard, recorder, state, red-charge ledger (2,208 lines), throttle probe, picture-stability, wait lease/marker/command guard, declared wait, prep guard, prep-arm hook, run-wait hang detector | **REPLACE-BY** Z3 | Agree. A red is a fix or an explicit skip with a point reference in the suite. Disagreement on B's "retain small evidence functionality D2 needs": resolved by a grep at M-S8; only files imported by the harness survive. |
| M-D8 | AD24, BD2, BD20 | `scripts/verify` harness (63,222 lines), verify-bringup, verify-host-setup.sh, build-info, section-tag-core, game tools; game tests and runner tests | **KEEP and repair** | Agree. Tests whose only subject is a deleted mechanism go with it (BD20). Repairs listed in §5 (dagger entries). |
| M-D9 | AD20, BD16 | repo-paths, local-bin, atomic-write, git-tracked, is-main, main-checkout-core, settled-ruling-core, dependency/tool/path helpers | **KEEP only what a retained consumer imports**, delete the rest | Agree. Decided by grep from the harness at M-S9. |
| M-D10 | AD10, AD11, BD1, BD12 | land-point, land-cleanup, worktree-cleanup, worktree-bootstrap, branch-hygiene, closing guard, fold-point, pre-push gate, ci-status guard, ci-gate-verdict, ci-failure-cause, push-arrival guard, commit-scope guard, git hooks, enable-hooks, stash | **REPLACE-BY** Z1 + Z2; worktree bootstrap by `npm ci` | Disagreement: B wants a check for unmerged/uncommitted work before worktree removal kept. Resolved A (delete all own code): `git worktree remove` without `--force` and `git branch -d` already refuse on dirty or unmerged work, so native git carries B's duty. |
| M-D11 | AD12, AD22, BD10 | findings carrier, finding.mjs, findings-guard, carrier-*, findings-request, bundle-first guard, tasks-archive/spec guards, tasks-source, point-brief, point-proof guard, queue-rank, queue, point, fold, bundle, commission; docs/tasks-archive.md (35,214 lines) | **REPLACE-BY** Z6: one register, TASKS.md, order committed in the same turn | Disagreement: B prefers Issues, A TASKS.md. Resolved A: TASKS.md is already the register, needs no `gh` auth in every session, and works inside the firewall that cut off cloud tooling (827). tasks-archive.md is deleted; git history is the archive (B silent, no objection). |
| M-D12 | AD13, BD11, BD13 | guard-health/preflight/registration/inventory/compatibility/duty, mandatory-duty, rule-review, rule-echo, guide-brevity, doc-budget, doc-corpus, retro-*, timestamp-guard, check-reply-timestamp, container-ask, command-classify, tool-output-*, help/cli-usage/command-index, assertionHealth | **DELETE** | Agree. Disagreement on B's "keep a small log-spill utility if useful": resolved delete; `cmd > file 2>&1; tail file` does the same. Lessons become CLAUDE.md prose. |
| M-D13 | AD14, AD15, BD15 | path-scope guard, permission-autogrant, firewall guard/rebuild/allow | **REPLACE-BY** Z7 | Agree. An auto-grant hook is less auditable than a declarative allowlist. |
| M-D14 | AD18, BD17 | deploy-staleness, pages-deploy-unblock | **DELETE**; the existing Pages workflow stays (Z5) | Agree in substance; B's "normal CI deployment workflow" is the workflow A keeps in M6. |
| M-D15 | AD16, AD17 | module-link-check and fixtures, audit-check | **REPLACE-BY** eslint `import/named` / `tsc`, Dependabot plus `npm audit --audit-level=high` in CI | A only, B silent. Standard tooling, no own code. |
| M-D16 | AD19 | `scripts/verify/docs.mjs` (doc-pointer suite; 857, 776) | **DELETE** | A only (est.: only its pointer role visible). If at M-S8 it proves to check game docs the game reads, keep it in the harness. |
| M-D17 | AD21, AD23 | infrastructure docs (batch-autonomy 3,270, handover-architecture 986, lane-routing, runbooks, audits, 1308/1452/1455 docs, cost reports); CLAUDE.md (197) and memory index | **DELETE** docs; **REWRITE** CLAUDE.md to Z1–Z8 | Disagreement: B keeps historical docs "as history". Resolved A: git history holds them at zero cost, while docs in the tree get read and re-enacted (the context load of 1209). host-environment, wsl-vm-recovery and all game docs stay. |

## 3. Cause count (Q3), reconciled

The analysts measured two different things. A counted "exists only because the infrastructure exists" (broad) and estimated collisions. B enumerated point numbers where one mechanism's state or requirement conflicts with another (narrow, auditable floor). Both are kept, labelled.

| Register | Items | No game cause (A, title-based) | Interaction of ≥2 mechanisms (B, enumerated floor; A estimate) |
|---|---|---|---|
| Open §4 | 368 incl. 1463 | 279 (76%) | 64 (B); ≈70 (A est.) |
| Closed §5, shown | 260 of 778 | ≈230 (A est.) | 75 (B); ≈50 (A est.) |
| Backlog §6 | 109 | 58 of 76 infra entries | 16 (B); ≈17 (A) |
| Carrier §7, last 160 | 160 | ≈95 (A est.) | 12 (B) |

Reconciled reading: about three in four open infrastructure items have no game cause. Of the open items, at least 64 and at most about 70 are two mechanisms blocking each other. Over all four registers that is 167 record occurrences, not 167 distinct incidents (B): registers overlap, and the carrier writes one doctor rescue as three rows (A16). The closed set is a sample of 260 of 778, so no extrapolation to the full history is made.

## 4. Open-point verdicts

Both analysts cover the identical 368 numbers (A: 279 yes, 88 no, plus 1463; B: 254 yes, 114 no incl. 1463). They agree on 341 numbers. The 27 disagreements are listed individually below.

**Agreed obsolete: yes** (253 numbers): A's groups G1 batch, G2 context, G3 board/chat/queue, G4 gates/lanes/trailers, G5 guards/rules/docs, G6 charges, G7 landing/CI/closing, G8 carrier, minus the 26 numbers B contests (listed below). Duplicates among them close with their twin: 1361 (= closed 1364), 1111 (= closed 1199), 814/871/1024, 823/841/849/908/1189, 932 (fence already armed, 252 refusals in §3).

**Agreed obsolete: no** (87 numbers): the kept-harness defects 622 + 1192, 510, 574, 567, 1074, 460, 1044, 507, 1177; CI/config 909 + 948, 851, 663, 1079, 658, 827; the suite reds and flakes 642, 568, 1068, 1026 (re-scope to render-touching diffs), 518, 200, 532, 514, 521, 563, 570, 620, 626, 627, 926, 939, 951, 1011 (drop charge wording), 1043, 1050, 1078, 1102, 1114, 1115, 1119, 1172, 1175, 1187, 1203, 1222, 1223, 1224, 1225, 1244, 1253, 1267, 1268, 1269, 1270, 1292, 1296, 1300, 1381, 1382, 1460, 1466, 1468, 1469, 1470, 1471, 1472; mis-binned game points 699, 733, 1062, 1447, 927, 1009, 1012, 1171; game QA and docs 184, 203, 205, 207, 285, 303, 531, 607, 619; unclear test owners 456, 886 (decide at M-S9 by the test's subject); 1463 itself.

**Disagreements and resolution.** Default rule for the five numbers whose titles neither analyst quotes: a point that reports a red result or a lost artifact stays open as a harness defect with charge wording dropped; a point that only asks for bookkeeping closes. Where neither reason is visible I keep the point and re-triage at M-S10, because a wrongly kept point costs one line and a wrongly closed one loses a defect.

| Point | A | B | Resolved | Reason |
|---|---|---|---|---|
| 1474 | yes | no | **no**, closes at M-S12 with 1463 | It carries the backlog verdicts of this plan; the work is not done until the plan has landed. A treats 1463 the same way, so the two must match. |
| 956, 972 | yes | no | **yes** | B's duties (required fixes resolved, omitted files reach the reviewer) are exactly what "require conversation resolution" and a whole-diff review in M-D6 provide; B's own D4 says the replacement addresses them. |
| 464 | yes | no | **yes**, closes at M-S2 | 464 is the red-main incident (A's P7). Branch protection with required checks is its answer; nothing is left to do after M-S2. |
| 528 | yes | no | **no**, re-scoped | A stale site is user-visible. The fix is the Pages workflow failing loudly, a workflow setting, not a watchdog. Keep until that setting is verified at M-S9. |
| 1096, 1226 | yes | no | **yes** | Worktree and branch safety is covered by native git refusing dirty removals (M-D10); the existing orphan set is reconciled once at M-S1. |
| 807, 824, 906, 917 | yes | no | **no**, resolved by M-S1 | These name stranded work. Deleting a mechanism recovers no commit; the M-S1 inventory does, then the points close. |
| 1099 | yes | no | **yes** | The hang detector that misjudges healthy runs is deleted in M-D7 (both analysts delete the wait family). B's residual duty, honest timeouts, belongs to the harness fixes in §5. |
| 857 | yes | no | **yes** | A ties it to `scripts/verify/docs.mjs`, deleted in M-D16; B gives no point-specific reason. |
| 455 | yes | no | **no** | B names it an unexplained unit red; a red test is a defect regardless of which pillar filed it. |
| 330 | yes | no | **yes as a number** | Both keep the assurance need; it is folded into 303 at M-S10 so the register has one line per need. |
| 558, 564, 615, 968, 991, 996, 1120 | yes (charges/run records) | no (artifacts, reds) | **no**, re-scoped, charge wording dropped | Default rule above. Any whose title at M-S10 proves to concern only ledger bookkeeping closes there. |
| 498, 647, 949, 1123 | yes | no | **no**, re-triage at M-S10 | Titles not quoted by either analyst; default rule. |
| 422 | no | yes | **no** | A: the beginner guide is a user document, only its guard goes. B's reason (D11 deletes doc guards) does not reach the guide's content. |

Final count: obsolete yes 261, obsolete no 106, plus 1463 open = 368.

## 5. Backlog-entry verdicts

Ids are A's positions B1–B109 in §6 order. B's own numbering (B1–B68) is a different scheme and is mapped by heading here. Both analysts exclude the same 33 game entries (B3–B11, B13, B14, B15, B22, B24, B25, B29, B37, B39, B43, B48, B57, B58, B69, B75, B80, B81, B84, B100–B103, B105, B108); B marks several of them "no" as evidence-quality items, which is compatible: they stay.

**Agreed obsolete: yes** (48): B1 (marked FIXED), B12, B16, B17, B21, B30, B32, B34, B45, B46, B47, B49, B50, B51, B54, B56, B60, B63, B65, B71, B74, B76, B77, B83, B85, B87, B89, B90, B91, B92, B94, B95, B96, B97, B98, B99, B104, B106; A's remaining P1/P3/P9 entries in the same groups.

**Agreed obsolete: no** (18): dagger entries are real defects of the remaining infrastructure (the harness): † B18 (frame passed with nothing drawn, = 620), † B20 (flow chief frame claims an unproven pairing), † B27 (red first backend ends the run; both backends must always run), † B31 (two runs on one checkout collide; per-run output dirs), † B33 + B64 (`--help` starts a full run; reject unknown flags, = 622), † B59 (45-minute kill below measured runtime), † B68 (i18n reports 0/0 while checking), † B78 (`--section` overwrites full-pass PNGs), † B107 (near/far judge trusts CSS no product path writes); plus B35, B40, B41, B42 (= 1114), B52, B86, B88 (individual check aims and flakes) and B38 (cold boot per section run, optional).

**Disagreements and resolution**

| Entry | A | B | Resolved | Reason |
|---|---|---|---|---|
| B2 1064 review covers half its files | yes | no | **yes** | The defect is the deleted coverage ledger; M-D6 reviews the whole diff. The one-time question "was the other half ever reviewed" is an M-S1 inventory line. |
| B19 + B23 polish cost "a quarter" | yes | no | **no**, merged into † B59 | If the expectation feeds a suite timeout it is the same defect as B59, which both keep: timeouts re-derived from measured runtimes at M-S8. |
| B26 LARGE on a non-quiet machine | yes | no | **yes** | The throttle probe goes (M-D7); no standing gate depends on quietness. Perf runs are user-triggered diagnostics (Z8), not gates. |
| B28 polish retry hangs | yes | no | **yes** | A cites closed 1135 removing the retry; the hang path no longer exists. |
| B36 operator-ended run recorded as CRASHED | yes | no | **yes** | The classification lives in the deleted recorder; a cancelled process exits nonzero with no verdict file, which is enough. |
| B44 closing regression cost (161 min) | yes | no | **yes** | B names no action; the figure lives in git history and informs the B59 timeout fix. |
| B53 covering run dies with its worktree | yes | no | **yes** | The automation that removed worktrees under live runs (land-cleanup, doctor) is deleted; nothing remains to do it. |
| B55 + B70 hang detector misreads | yes | no (if helper survives) | **yes** | B's condition is met: both analysts delete the wait family. |
| B61 stuck run kept alive by foreign pictures | yes | no | **yes** | Progress attribution was the deleted detector's job; per-run output dirs (B31/B78 fix) remove the cause anyway. |
| B62 marker whose owner changes | yes | no (until marker identified) | **yes** | The wait marker is deleted in M-D7, which B's D14 also does. |
| B66 delegate worktree lacks the `local/` bug report | yes | no | **yes** | No delegated authors remain; the report belongs in the committed register (Z6), not an untracked file. |
| B67 unit run reads outside any checkout (= 845) | yes | no | **yes** | Both analysts mark open 845 obsolete; the test belongs to a deleted guard. B's "no" here contradicts B's own 845 verdict. |
| B72 feat branches survive merge, two unmerged | yes | no | **yes** | A cites closed 1429 as the reconciliation; residual risk is covered by the M-S1 branch inventory. |
| B73 load measurement died with the session | yes | no | **yes** | The throttle probe is deleted; a perf run is started detached by whoever runs it. |
| B79 + B82 orphan worktrees | yes | no | **no**, resolved at M-S1 | Reconciling actual work is a one-time action, then both entries close. |
| B93 closing 633: 1011 backlog decisions | yes | no, pending payload | **yes** | The entry is a product of the deleted closing ceremony; its 1011 items stay in docs/backlog.md untouched and nobody bulk-closes them. |
| B109 v0.3.1 closing cleanup (docs part 1) | yes | no, pending payload | **no** until read in full | Its first line is cut mid-token (A20); the visible command-index part is covered by M-D12, the rest is unknown. Re-read at M-S10. |

Final count: obsolete yes 53, no 23, game 33 = 109. The non-obsolete entries that show real defects of the remaining infrastructure are the nine dagger entries above plus B19/B23 via B59.

## 6. Merged teardown order

After every step, the step's PR passes Z1 in CI, both backend smoke suites on the GPU host, and a Z4 review. `package.json` scripts and vitest globs pointing at deleted files are edited in the same step.

| id | from | Step | Why this position |
|---|---|---|---|
| M-S1 | AS1, BS1 | **Quiesce and preserve.** Disable the Linux launcher/daemon scheduler entries, both Windows tasks and the chat watcher. Inventory running verification, uncommitted and unpushed work, feat/* branches with unmerged commits (B72, B79/B82, 807, 824, 906, 917), rescue branches (inspect `rescue/doctor-2026-10-30T17-28-53-077Z-2139385`), and confirm 9a6b92d is on `origin/main`. Copy the 9 open carrier rows into TASKS.md. Check B2's other half. No doctor quarantine, no force deletes, no code deleted. | Disagreement: B stops the schedulers only at BS5, after hooks are gone. Resolved first, because removing the lock heartbeat while the daemon still supervises leases is the stale-lease path that triggers quarantine (§7 doctor incidents). |
| M-S2 | AS2, BS2 | **Stand up the replacement.** CI workflow with install, build, lint, typecheck of src and tests, unit. Branch protection on `main`: required checks Z1, `verify-webgpu`, `verify-webgl2`, `cross-review`; conversation resolution; auto-delete branches; `gh pr merge --auto`. Add the status-posting wrapper (one invocation per backend) and the shrunk review command now, running next to the old gates. Land one trivial PR through the new path. | Disagreement: A makes the verify statuses required only at AS8. Resolved here, so that no step after unhooking lacks a render gate. Two separate backend invocations sidestep † B27 until it is fixed. |
| M-S3 | AS3, BS3, BS4 | **Unhook everything.** Empty the hooks in `.claude/settings.json` (29 Stop, 15 PreToolUse, 3 PostToolUse, SessionStart, SessionEnd, UserPromptSubmit, PermissionRequest). Add Z7 declarative permissions. Unset `core.hooksPath`, remove `enable-hooks` from `prepare`. Strip the hook-bound duties from CLAUDE.md in the same change. | Disagreement: B splits Stop (BS3) and PreToolUse (BS4). Resolved as one step: a half-removed set is the joint-demand-and-forbid case the meta-guards exist for (853, 873), and guard-health-guard would itself fail on the missing half. About 17.6k refusals per corpus disappear. |
| M-S4 | AS4, BS5 | **Delete the batch runtime**: M-D1, M-D2, their scheduler and config references. | Both agree batch goes before board, since the board reads lock state. No flock replacement (M-D1). |
| M-S5 | AS5 | **Delete board, chat, decisions, requests**: M-D4. First confirm the Pages workflow publishes no board files. | Disagreement: B retires board and chat at BS9. Resolved early: after M-S3 nothing writes the board, so it lies (B104 "BATCH STEHT"). The user ordered the board deleted without replacement. |
| M-S6 | AS6 | **Delete context, handover, measure**: M-D3. | Follows A; B has no separate step, its fence removal happened in M-S3. |
| M-S7 | AS7, BS6, BS7 | **Lanes and review.** Confirm from the M-S1 inventory that no commissioned work is pending, delete M-D5. Shrink cross-review to the Z4 command, delete the M-D6 gates. | Both put review before the runner. |
| M-S8 | AS8, BS8 | **Verification runner.** Delete M-D7. Make the harness entry points explicit: suite selection required, unknown flags rejected, empty run fails, backend confirmed, per-run artifact directory, both backends always run, timeouts from measured runtimes. This fixes † B18, B27, B31, B33/B64, B59, B68, B78, and 622/1192, 510, 574. Every former charge becomes a fix or an explicit skip with a point reference. Decide M-D16. | Both agree. |
| M-S9 | AS9, BS10 | **Landing, deploy, utilities.** Delete M-D10, M-D14, and the M-D9 utilities no retained file imports (grep from the harness). Verify the Pages workflow fails loudly (528, 663). Decide 456, 886 by their test subjects. | A and B agree on content; A's placement before the register step is kept so land-point's tick format need not be preserved during conversion. |
| M-S10 | AS10, BS9 | **Work register.** Delete M-D11 code. Convert TASKS.md: drop the 261 obsolete points, fold 330 into 303, re-triage 498, 647, 949, 1123 and 558, 564, 615, 968, 991, 996, 1120 by the charge-wording rule, read B109 in full. Delete tasks-archive.md. | Migration of open rows already happened in M-S1, so deletion here loses nothing. |
| M-S11 | AS11, BS11 | **Residue.** Delete M-D12, M-D13, M-D15; firewall allowlist in the devcontainer init only; delete tests and fixtures whose subject is gone (BD20), remaining scheduler and config references. | Both agree. |
| M-S12 | AS12, BS12 | **Docs and validation.** M-D17 rewrite. Full pass: build, lint, typecheck, unit, both backends with pictures, cross-review, PR merge, Pages deploy of the intended revision. Re-measure §1 line counts. Close 1463 and 1474. | Both agree; any remaining failure is a game or harness defect, not grounds for a new pillar. |

**Remaining safety duties and their cover**

| Duty | Mechanism | In force from |
|---|---|---|
| Nothing red on `main` | Branch protection, required Z1 checks | M-S2 |
| One writer on `main` | PR-only landing, no direct push | M-S2 |
| Both backends verified before landing | Required `verify-webgpu`, `verify-webgl2` statuses | M-S2 (trustworthy after M-S8 harness fixes) |
| Picture check | Per-run artifacts, inspected by author and Z4 reviewer | M-S2, per-run dirs from M-S8 |
| Cross-vendor review and required fixes | Required `cross-review` status, conversation resolution | M-S2 |
| No lost user order or finding | TASKS.md line committed in the same turn; M-S1 migration | M-S1 |
| Unmerged work not destroyed | M-S1 inventory; native `git worktree remove` / `branch -d` refusals | M-S1 |
| Container egress | Devcontainer allowlist | existing, single place from M-S11 |
| Permissions | Declarative settings | M-S3 |
| Correct deployed revision | Pages workflow plus build-info | existing |
| Context overflow | Harness compaction | harness |
| Reply timestamps, if still wanted | User-scope `berlin-timestamp.cjs` | user scope |

## 7. Id coverage

```json
{"mergedBy":"Fable 5.1","entries":[
{"id":"U1","from":["AD1","BD7"],"defect":"Batch autonomy runtime deleted; A's flock replacement dropped because PR-only landing already removes the two-writer risk"},
{"id":"U2","from":["AD2","BD19"],"defect":"Doctor, stash sweep, repository-integrity, drills, legacy and one-time leftovers deleted"},
{"id":"U3","from":["AD3","BD8","BD18"],"defect":"Context fence, handover, cost measurement, calibration and standstill reporting deleted"},
{"id":"U4","from":["AD4","BD6","BD9"],"defect":"Board, dashboard, chat, decision cards, request deposit and user gate deleted"},
{"id":"U5","from":["AD5","AD8","BD5"],"defect":"Lanes, delegation, cloud switch, model guard and model-lanes table deleted"},
{"id":"U6","from":["AD6","AD7","BD4"],"defect":"Four-eyes gates deleted; cross-review shrunk to one command posting a required status"},
{"id":"U7","from":["AD9","BD3","BD14"],"defect":"Render-verify guard, charge ledger, recorder, throttle probe and wait machinery replaced by per-backend verify statuses"},
{"id":"U8","from":["AD24","BD2","BD20"],"defect":"Verify harness, game tools, game tests and runner tests kept and repaired"},
{"id":"U9","from":["AD20","BD16"],"defect":"Shared utilities kept only where a retained consumer imports them"},
{"id":"U10","from":["AD10","AD11","BD1","BD12"],"defect":"Landing, CI guards, git hooks and worktree tooling replaced by CI, branch protection and native git"},
{"id":"U11","from":["AD12","AD22","BD10"],"defect":"Findings carrier, queue, point and tasks machinery replaced by TASKS.md as the single register; tasks-archive deleted"},
{"id":"U12","from":["AD13","BD11","BD13"],"defect":"Meta-guards, rule, doc, retro, timestamp, closing and tooling-glue guards deleted"},
{"id":"U13","from":["AD14","AD15","BD15"],"defect":"Path scope, permission autogrant and firewall guards replaced by declarative permissions and one allowlist"},
{"id":"U14","from":["AD18","BD17"],"defect":"Deploy watchdogs deleted; existing Pages workflow retained"},
{"id":"U15","from":["AD16","AD17"],"defect":"Module-link and audit checks replaced by eslint, tsc, Dependabot and npm audit"},
{"id":"U16","from":["AD19"],"defect":"Doc-pointer verify suite deleted unless it proves to check game docs"},
{"id":"U17","from":["AD21","AD23"],"defect":"Infrastructure docs deleted to git history; CLAUDE.md rewritten to the zero base"},
{"id":"U18","from":["AS1","BS1"],"defect":"Quiesce schedulers first and inventory work; B's later scheduler stop would race the doctor"},
{"id":"U19","from":["AS2","BS2"],"defect":"CI, branch protection and all required statuses including verify and review stood up before any unhooking"},
{"id":"U20","from":["AS3","BS3","BS4"],"defect":"All hooks removed in one step; B's split would leave a half-set that collides"},
{"id":"U21","from":["AS4","BS5"],"defect":"Batch runtime, doctor and scheduler references deleted"},
{"id":"U22","from":["AS5"],"defect":"Board and chat deleted early because nothing writes them after unhooking"},
{"id":"U23","from":["AS6"],"defect":"Context, handover and measurement deleted"},
{"id":"U24","from":["AS7","BS6","BS7"],"defect":"Lanes drained and deleted; review bookkeeping replaced by the shrunk cross-review"},
{"id":"U25","from":["AS8","BS8"],"defect":"Runner simplified and harness defects fixed; charges become fixes or explicit skips"},
{"id":"U26","from":["AS9","BS10"],"defect":"Landing, deploy and unused utilities deleted"},
{"id":"U27","from":["AS10","BS9"],"defect":"Carrier and queue code deleted; TASKS.md converted with the point verdicts"},
{"id":"U28","from":["AS11","BS11"],"defect":"Enforcement residue, dead tests and config references deleted"},
{"id":"U29","from":["AS12","BS12"],"defect":"Docs rewritten and the full minimal workflow validated on both backends; 1463 and 1474 close"}
]}
```

A1 | local/1463/analysis-a.md | P1 row "OWNERSHIP STAND-DOWN ≥96 (listed rows)": the §3 stand-down rows sum to 80 (18+12+10+6×4+4×4), not 96
A2 | local/1463/analysis-b.md | "1,853 dashboard-related Stop errors" does not match §3: the five dashboard-named Stop rows sum to 1,828
A3 | local/1463/analysis-a.md | Q4b tally "279 + 88 + 1 = 368 + 1463" is malformed, and the Q3 row "368 (+1 = 1463)" versus the Q4b header "368 numbers + 1463" disagree on whether 368 includes 1463 (it does)
A4 | local/1463/analysis-a.md | 1474 is marked obsolete "answered by this analysis" while 1463, in the same relation to the plan, stays open until S12
A5 | local/1463/analysis-b.md | Backlog row "Unit-Lauf liest eine Datei außerhalb jedes Checkouts" is "no", but open 845, which A identifies as the same defect, sits in B's "yes" range
A6 | local/1463/analysis-b.md | Backlog ids B1–B68 are B's own row numbers, not §6 positions, so they collide with A's B1–B109 (B's B16 is wait-lease, A's B16 is the request path) and cannot serve as merge ids
A7 | local/1463/analysis-b.md | S3/S4 remove the lock heartbeat, lock release and resume hooks while S5 stops the daemon/doctor only afterwards; §7's doctor incidents show stale leases trigger quarantine
A8 | local/1463/analysis-a.md | S3 unhooks render-verify-guard and the pre-push hook, but the both-backend statuses become required only at S8, leaving S3–S8 without any enforced render gate
A9 | local/1463/analysis-a.md | M5 (flock around `claude -p`) answers the two-writers-on-main incident that M2 (PR-only landing) already removes, so M5 is redundant with M2
A10 | local/1463/analysis-a.md | M3 posts `verify-webgpu`/`verify-webgl2` via `gh api` from the author's own account, so the "required check" is self-attested; the limitation is not stated
A11 | local/1463/analysis-a.md | rule-echo appears in both D6 ("rule-echo fingerprints") and D13 ("rule-echo"), so one mechanism carries two delete ids
A12 | local/1463/analysis-b.md | D7 proposes CI "for jobs that must outlive an interactive session" while D2 keeps both GPU backends and the pack shows no CI runner for them (verify-host-setup.sh), so the replacement for long verification runs is unsupported
A13 | local/1463/analysis-a.md | D9's reason against a self-hosted runner ("the repo is public via Pages") does not follow; nothing in the pack states the repository's visibility
A14 | local/1463/analysis-a.md | G1 (batch, D1/D2) lists 1020, 1024, 1025, 1027, 1042, which A's own P2 row and D3 attribute to context/handover; group attribution is inconsistent, verdict unaffected
--- end ---

ask-lane: Fable 5.1 (effort medium) answered the audit in 658s — 14 entries
  A1 | local/1463/analysis-a.md | P1 row "OWNERSHIP STAND-DOWN ≥96 (listed rows)": the §3 stand-down rows sum to 80 (18+12+10+6×4+4×4), not 96
  A2 | local/1463/analysis-b.md | "1,853 dashboard-related Stop errors" does not match §3: the five dashboard-named Stop rows sum to 1,828
  A3 | local/1463/analysis-a.md | Q4b tally "279 + 88 + 1 = 368 + 1463" is malformed, and the Q3 row "368 (+1 = 1463)" versus the Q4b header "368 numbers + 1463" disagree on whether 368 includes 1463 (it does)
  A4 | local/1463/analysis-a.md | 1474 is marked obsolete "answered by this analysis" while 1463, in the same relation to the plan, stays open until S12
  A5 | local/1463/analysis-b.md | Backlog row "Unit-Lauf liest eine Datei außerhalb jedes Checkouts" is "no", but open 845, which A identifies as the same defect, sits in B's "yes" range
  A6 | local/1463/analysis-b.md | Backlog ids B1–B68 are B's own row numbers, not §6 positions, so they collide with A's B1–B109 (B's B16 is wait-lease, A's B16 is the request path) and cannot serve as merge ids
  A7 | local/1463/analysis-b.md | S3/S4 remove the lock heartbeat, lock release and resume hooks while S5 stops the daemon/doctor only afterwards; §7's doctor incidents show stale leases trigger quarantine
  A8 | local/1463/analysis-a.md | S3 unhooks render-verify-guard and the pre-push hook, but the both-backend statuses become required only at S8, leaving S3–S8 without any enforced render gate
  A9 | local/1463/analysis-a.md | M5 (flock around `claude -p`) answers the two-writers-on-main incident that M2 (PR-only landing) already removes, so M5 is redundant with M2
  A10 | local/1463/analysis-a.md | M3 posts `verify-webgpu`/`verify-webgl2` via `gh api` from the author's own account, so the "required check" is self-attested; the limitation is not stated
  A11 | local/1463/analysis-a.md | rule-echo appears in both D6 ("rule-echo fingerprints") and D13 ("rule-echo"), so one mechanism carries two delete ids
  A12 | local/1463/analysis-b.md | D7 proposes CI "for jobs that must outlive an interactive session" while D2 keeps both GPU backends and the pack shows no CI runner for them (verify-host-setup.sh), so the replacement for long verification runs is unsupported
  A13 | local/1463/analysis-a.md | D9's reason against a self-hosted runner ("the repo is public via Pages") does not follow; nothing in the pack states the repository's visibility
  A14 | local/1463/analysis-a.md | G1 (batch, D1/D2) lists 1020, 1024, 1025, 1027, 1042, which A's own P2 row and D3 attribute to context/handover; group attribution is inconsistent, verdict unaffected
