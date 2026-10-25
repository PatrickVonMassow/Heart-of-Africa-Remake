ask-lane: asking Fable 5.1 (effort medium) for a audit — 63130 characters of material …
--- Fable 5.1 said ---
Merging the two blind halves by meaning, resolving the three disagreements against the measured numbers, then listing defects I found in the halves themselves.

```json
{
  "mergedBy": "Fable 5.1",
  "entries": [
    { "id": "U1", "from": ["A1","B2","B15"], "defect": "Bound: at most 1 concurrently submitted or running cloud author (counted from submission, not branch visibility), plus at most 1 completed successor waiting for acceptance. Resolution against A's 2: the only measured cloud cycle (1440) landed 1.3 h after submission while acceptance-only game points averaged 3.05 h (1414 2.0, 1432 3.5, 1333 5.8, 1297 0.9), so one author already outproduces acceptance ~2.3x; a second author only lengthens the ready queue, and every branch that waited >1 day (1297, 1333, 1414, 1432) needed post-sync rework, wasting credit that expires 05.11.2026. Raise to 2 only if the measured cycle shows an acceptance window opening with no ready successor." },
    { "id": "U2", "from": ["A2","B4"], "defect": "KEEP POOL_CAP 3 and commission-guard's existing LAND/PARK remedies; slot math is 1 branch in acceptance + 1 cloud/ready + the open 1347. 1347 (idle since 21.10) is parked through the existing park record only if the measured cycle shows its slot blocking a commissioning; the drain itself is 1443's work and is not repeated." },
    { "id": "U3", "from": ["A3","B1","B6"], "defect": "Switch-over resolved: write the numeric bound now and run the first post-1443 cycle under it; since the runbook already permitted cloud authoring during acceptance and only lacked a number (A31), that cycle is both the 1443 baseline B asks for and the trial. From the first point after 1444: at the start of each acceptance window, if no completed successor waits, commission the next ready, file-disjoint queue point via the existing cloud-switch/author-delegate path and declare it in batch-in-flight; file-disjointness is checked with the existing independentOpenPoints against every occupied lane. The bound is procedural because commission-guard counts branches, not sessions, so no new guard is possible or needed." },
    { "id": "U4", "from": ["A4","B7"], "defect": "KEEP cloud-switch ON and lane-routing default for the measured cycle (vendor role and execution locality are different axes, and A28 shows the local main-chain authors were fallbacks after 4/4 failed non-main starts). The cycle records for each authoring delegation where it ran; if a delegation runs locally while the switch is ON, fix that decision in author-delegate with Vitest, after reading the complete (untruncated) code." },
    { "id": "U5", "from": ["A5","B3"], "defect": "Bound: 1 local heavy job (browser suite, unit gate, picture check or local author running Vitest) and 0 other local agents during acceptance windows, draining or checkpointing already-running local authors first; outside windows at most 1 local author alongside cloud work. Derivation: 15 GB RAM with 12 GB available and swap in use, the 23.10 suite-memory-wall record, the ~20 % suite slowdown under load, and the single overlapped-suite sample (23.10 04:59/05:02Z) where both runs went red." },
    { "id": "U6", "from": ["A6","B9"], "defect": "Section re-runs: after one repeat of an unchanged SHA, section, backend and failure signature, stop re-running and diagnose (a relevant commit or a recorded changed condition reopens the budget). Repeats cost 8.2 h; 1405 had 27 completed runs for 158.4 min and 1404 about 20 repeats." },
    { "id": "U7", "from": ["A7"], "defect": "Red-charging: when a red is already charged to an open point and main is unchanged for that section, reuse the recorded main run instead of re-proving it on main (1.4 h measured). Procedural change; Vitest only if a script makes this decision." },
    { "id": "U8", "from": ["A8","B12"], "defect": "Coalesce retrospective-fingerprint, guide-attest and queue-rank refreshes into one bookkeeping commit/push per point boundary, keeping required user-order publication receipts. Resolution against A's once-per-day: the rule demanding the refresh is not located in the material and A's own risk notes guards may go red, so per-boundary is the simplification that is safe to apply now. About 45 of 191 main commits were refreshes, pushes ~10 min apart." },
    { "id": "U9", "from": ["A9"], "defect": "Ask the user to keep the WSL2 host awake: 13.6 h (24.10 11:40Z to 25.10 01:17Z, launcher 'not moved' with heartbeat-predates-boot restart) exceeds all suite repeats combined; outside the batch's control, recorded as a request." },
    { "id": "U10", "from": ["A10","B13"], "defect": "KEEP batch-boundary, ownership fence, single owner and serial landing; reconcile every transferred job before any refill; the launcher deadline repair stays in its own queued point. 1440 landed without a point boundary and 1.7 h of stall-only journal followed." },
    { "id": "U11", "from": ["A11","B10"], "defect": "KEEP run-wait and STALLED/TIMEOUT handling; treat any running/- hang as STALLED and never re-await it. Simplify, not extend: declare delegated leases at the known suite duration (119 min full LARGE, 55 min polish pass) in the existing declaration field instead of 45 min, and carry command, SHA and backend in the same declaration across boundaries. Confirm in the cycle that the 4.0 h of WebGPU hangs no longer occur after 1446." },
    { "id": "U12", "from": ["A12","B8"], "defect": "KEEP unchanged: land-point.mjs, local browser tier suites, picture check on both backends where isBackendSensitivePath applies, cross-vendor review, exact pushed-SHA receipts and local Vitest (cloud-clone-only Vitest reds exist, parked 24.10 06:25). Cloud green never stands in; pre-acceptance work is repeated only when its evidence is missing or invalidated." },
    { "id": "U13", "from": ["A13"], "defect": "KEEP author-routing-core ('verification is the work'): cloud authors only first implementations; picture fix loops stay local." },
    { "id": "U14", "from": ["A14","B11"], "defect": "The single 'what runs where' command is batch-in-flight --status, listing cloud session ids, local agents, suites, point, purpose, stage and owner; commission-guard --status stays the pool view. Resolution: batch-in-flight already holds per-job declarations, while commission-guard counts branches and cannot see a session before its branch appears. Both outputs are absent from the material; if a field is missing, extend only the existing declaration fields, with Vitest." },
    { "id": "U15", "from": ["A15","B14"], "defect": "Measured cycle: after landing, run batch-standstill-report.mjs over the next 5 landed points or 48 h, whichever is later, against the baseline 3.37 h per landed point excluding host-down (game points 5.0 h, process points 1.8 h); record per point the cloud sessions active during acceptance, where each delegation ran, waiting successors and repeats. Success is a lower mean per distinct landed point; otherwise name the class that absorbed the gain. One cycle is observation, not causal proof, and carry-in (1297 484 h, 1333 124 h branch age) is excluded from authoring time." },
    { "id": "U16", "from": ["A16"], "defect": "KEEP launcher stalled-no-progress as telemetry but do not count process-exit events as session loss in measurements (see A23)." },
    { "id": "U17", "from": ["B5"], "defect": "No code change to batch-in-flight-core refill: the written bound (1 cloud author, 1 waiting successor) supersedes any fill-to-cap wording, and the cap is a ceiling, not a target. The excerpt is TRUNCATED, so whether the core actually commissions automatically is unknown; revisit only after reading the full file." },
    { "id": "U18", "from": ["B16"], "defect": "Vitest in the same change for any decision logic actually modified (author-delegate locality under cloud-switch ON, a batch-in-flight status field); none for procedural rules. Prefer none, per the infrastructure freeze." },
    { "id": "U19", "from": ["A17"], "defect": "FINDING: the owner note's 'no landing 24.10 09:40 to 25.10 02:17' ends at the launcher takeover; the next landing is the 1442 merge at 25.10 06:04:44+01:00, a 21.4 h gap." },
    { "id": "U20", "from": ["A18"], "defect": "FINDING: 'roughly 12 h no live owner' understates it; journal and launcher are silent 24.10 12Z to 25.10 00Z, the launcher reports 833/848 min unmoved, and heartbeat-predates-boot restarts at 24.10 10Z and 11Z are omitted." },
    { "id": "U21", "from": ["A19"], "defect": "FINDING: 1393 is listed as a game point but feat/1393-generic-model-lanes is infrastructure." },
    { "id": "U22", "from": ["A20"], "defect": "FINDING: the cited 1442 '9/23 frames' log (mtime 24.10 10:52Z) is not the last run; later runs exist on 25.10 (01:26, 01:46, 02:32, 03:40Z, last 51.6 min exit 1) and the log content is not attached." },
    { "id": "U23", "from": ["A21"], "defect": "FINDING: the 1443 premise that commission-guard refused every cloud lane contradicts the material: 1440's cloud lane started with 5 feat branches open and 1442/1446 were cut with >=5 open; the park/override record and --status output are absent." },
    { "id": "U24", "from": ["A22"], "defect": "FINDING: feat/1413 is merged twice (22.10 01:56 and 02:21 CEST), so 'last 25 merges' are 24 distinct points." },
    { "id": "U25", "from": ["A23"], "defect": "FINDING: process-exit stalled-no-progress repeats up to 8x for a session that keeps working (6ad6d4, 0893e1 emits delegated-start 6 min after its 'exit'), so the event is not a process exit." },
    { "id": "U26", "from": ["A24"], "defect": "FINDING: the launcher names 'fresh-heartbeat' as an inactivity cause and many 'taking over' lines have no following RESUMING spawn." },
    { "id": "U27", "from": ["A25"], "defect": "FINDING: 1440 merged 24.10 03:59Z with no point-boundary handover; 04:35 to 06:14Z shows only stall flags." },
    { "id": "U28", "from": ["A26"], "defect": "FINDING: feat/1402 has no verify-run record and feat/1403 has only two non-zero WebGPU runs, yet both merged; browser-suite gate evidence is not in the material." },
    { "id": "U29", "from": ["A27"], "defect": "FINDING: six runs remain running/- with 0.0 duration and no terminal receipt, hiding about 4 h from duration sums." },
    { "id": "U30", "from": ["A28"], "defect": "FINDING: the three astra author logs are exactly 483 B and the cross author log 499 B, 1412's start and finish share one startedAt, and 1409/1424 fell back to main-chain authors within minutes, so non-main authoring starts appear to have failed 4/4 (content not attached)." },
    { "id": "U31", "from": ["A29"], "defect": "FINDING: code/test changes landed directly on main outside land-point (24.10 01:56, 02:31, 06:07; 25.10 18:04) with no visible review evidence." },
    { "id": "U32", "from": ["A30"], "defect": "FINDING: lane-routing says 'author -> the main chain' while cloud-switch says authoring runs in the CLOUD; 7 local vs 1 cloud authoring since switch-on and nothing in the material resolves which applies." },
    { "id": "U33", "from": ["A31"], "defect": "FINDING: runbook line 60 'pace cloud authoring to what local acceptance can land' states no number, so it cannot be followed or measured." },
    { "id": "U34", "from": ["A32"], "defect": "FINDING: 191 non-merge commits against 25 merges in 98 h, about 45 of them fingerprint/guide-attest refreshes, main pushes about 10 min apart." },
    { "id": "U35", "from": ["A33"], "defect": "FINDING: the material header promises batch-in-flight --status output but none is included, and commission-guard --status is absent, so one-command visibility is unverifiable." },
    { "id": "U36", "from": ["A34"], "defect": "FINDING: TRUNCATED material: commission-guard.mjs ends mid-comment, batch-in-flight-core.mjs ends mid-word, lane-routing.md ends at a stray backtick, launcher lines are cut at about 100 chars; admission tail and cloud-command coverage cannot be audited." }
  ]
}
```

## MERGED PLAN

Replaces "Throughput with cloud authoring" in docs/batch-owner-runbook.md.

**Throughput with cloud authoring (1444)**

Baseline (window 1410 merge to 1443 close, 97.95 h, 25 distinct landed points): 3.92 h per landed point, 3.37 h excluding the 13.6 h host-down stretch. Game points mean 5.0 h, process points about 1.8 h. Measured losses not cured by parallelism: host down 13.6 h, suite repeats 8.2 h, hung WebGPU runs 4.0 h, main re-proofs 1.4 h. No complete post-1443 cycle exists yet.

**Bounds**
- Cloud authors: at most **1** submitted or running at a time (count from submission, not branch visibility). Derivation: 1440 landed 1.3 h after submission; acceptance-only game points took 3.05 h (2.0, 3.5, 5.8, 0.9). One author outruns acceptance; a second only ages branches, and all four branches that waited over a day needed post-sync rework. Raise to 2 only if a measured acceptance window opens with no ready successor.
- Completed successors waiting for acceptance: at most **1**. POOL_CAP 3 stays the branch ceiling, never a target.
- Local heavy jobs: **1**. During browser, unit-gate and picture windows: 0 other local agents, running local authors drained or checkpointed first. Outside windows: at most 1 local author. Derivation: 12 of 15 GB RAM available with swap in use, the 23.10 suite-memory-wall record, the 20 % suite slowdown under load, both overlapped suite runs on 23.10 red.
- Credit: commission only successors that acceptance can land before 05.11.2026; revisit cloud use by that date.

**Switch-over**
From the first point after 1444 lands: when a local acceptance window opens and no completed successor is waiting, commission the next ready, file-disjoint queue point through the existing cloud-switch and author-delegate path, declare it in batch-in-flight, then continue acceptance. File-disjointness is checked by the existing independentOpenPoints against every occupied lane. Successors are adopted at the point boundary as today. No new guard: the bound lives in this section and in the declaration.

**Switched off or simplified**
- The unnumbered "pace cloud authoring" prose, replaced by the bounds above.
- Section re-runs: one repeat of an unchanged SHA, section, backend and failure signature, then diagnose.
- Main re-proof of a red already charged to an open point with main unchanged for that section: reuse the recorded main run.
- Fingerprint, guide-attest and queue-rank refreshes: one bookkeeping commit and push per point boundary, user-order receipts preserved.
- Delegated lease declarations: use the known suite duration (119 min full LARGE, 55 min polish) instead of 45 min, same declaration field.
- Host: the user is asked to keep the WSL2 host awake.

**Kept**
POOL_CAP 3 and commission-guard admission with LAND/PARK; cloud-switch ON and lane-routing default; author-routing-core (cloud authors first implementations only, picture fix loops local); quiet acceptance windows; batch-boundary, ownership fence, single owner, serial landing; run-wait with any running/- hang treated as STALLED and not re-awaited; land-point.mjs, local tier suites, picture check on both backends, cross-vendor review, local Vitest. Cloud green never stands in for a browser suite. The launcher deadline repair stays in its own point.

**One command**
`batch-in-flight --status` is the inventory of cloud session ids, local agents, suites, point, purpose, stage and owner; `commission-guard --status` is the pool view. If a field is missing, extend only existing declaration fields.

**Measured cycle after landing**
Run `batch-standstill-report.mjs` over the next 5 landed points or 48 h, whichever is later. Record per point: cloud sessions active during acceptance, where each delegation ran, waiting successors, repeats. Success: mean below 3.37 h per distinct landed point excluding host-down (game below 5.0 h, process below 1.8 h). Otherwise name the class that absorbed the gain. If this first cycle already meets the goal, that measurement is the recorded finding and no further change follows. One cycle is observation, not proof; branch age is not authoring time.

## DECISION LOGIC CHANGES

None planned. Two conditional changes, each only if the measured cycle or the untruncated code shows the defect, each with Vitest in the same change:

- `scripts/author-delegate.mjs` (locality decision): if a delegation runs locally while cloud-switch is ON, make it honour the switch.
- `scripts/batch-in-flight.mjs --status`: if cloud session ids or wiring state are missing from the output, add that field to the existing report.

No change to `batch-in-flight-core.mjs` refill or `commission-guard.mjs` admission.

A1 | FULL ANSWER A, Proposals P1 (LIST A A1) | Derivation inverted: a 1.3 h cloud cycle against 3.05 h acceptance means one author already outproduces acceptance ~2.3x, so a second author adds queue not throughput; Step 0 also says the 1.3 h sample "does not transfer to game points" yet P1 derives the bound from it.
A2 | FULL ANSWER A, Proposals P3 (LIST A A3) | Enforcement via commission-guard's free-slot reason cannot bound cloud authors because the guard counts open branches and a cloud session has no branch until it pushes (B P2), so the stated enforcement is empty.
A3 | FULL ANSWER A, Step a "Fastest stretch" | "9 merges in about 11 h (21.10 17:19Z to 22.10 03:58Z)" starts before A's own window (1410 merge 20:30Z) and counts the duplicated 1413 merge, so the stretch is outside the measured set.
A4 | LIST A A18 | "833/848 min unmoved (≈13.6–14 h)" is 13.9–14.1 h; the 13.6 h figure is the separate 24.10 11:40Z to 25.10 01:17Z span in the table, so two different measurements are conflated.
A5 | FULL ANSWER B, trailing id list B1–B24 | B's own list renumbers findings and proposals (trailing B2 is the merge-history count, B9–B24 are P1–P16) while LIST B's B1–B16 are P1–P16; the labels disagree, and this merge used LIST B.
A6 | FULL ANSWER B, P5 vs B8/P16 | P5 prescribes modifying batch-in-flight-core refill logic while B8 and P16 declare that file TRUNCATED and require inspecting it first; the "cap doubles as target" premise rests on the cut excerpt.
A7 | LIST A A7, A14 | "cover with Vitest" is demanded for a runbook procedure and a status line with no function named; Vitest applies only if a script makes the decision, so the tests cannot be specified from the material.
--- end ---

ask-lane: Fable 5.1 (effort medium) answered the audit in 334s — 7 entries
  A1 | FULL ANSWER A, Proposals P1 (LIST A A1) | Derivation inverted: a 1.3 h cloud cycle against 3.05 h acceptance means one author already outproduces acceptance ~2.3x, so a second author adds queue not throughput; Step 0 also says the 1.3 h sample "does not transfer to game points" yet P1 derives the bound from it.
  A2 | FULL ANSWER A, Proposals P3 (LIST A A3) | Enforcement via commission-guard's free-slot reason cannot bound cloud authors because the guard counts open branches and a cloud session has no branch until it pushes (B P2), so the stated enforcement is empty.
  A3 | FULL ANSWER A, Step a "Fastest stretch" | "9 merges in about 11 h (21.10 17:19Z to 22.10 03:58Z)" starts before A's own window (1410 merge 20:30Z) and counts the duplicated 1413 merge, so the stretch is outside the measured set.
  A4 | LIST A A18 | "833/848 min unmoved (≈13.6–14 h)" is 13.9–14.1 h; the 13.6 h figure is the separate 24.10 11:40Z to 25.10 01:17Z span in the table, so two different measurements are conflated.
  A5 | FULL ANSWER B, trailing id list B1–B24 | B's own list renumbers findings and proposals (trailing B2 is the merge-history count, B9–B24 are P1–P16) while LIST B's B1–B16 are P1–P16; the labels disagree, and this merge used LIST B.
  A6 | FULL ANSWER B, P5 vs B8/P16 | P5 prescribes modifying batch-in-flight-core refill logic while B8 and P16 declare that file TRUNCATED and require inspecting it first; the "cap doubles as target" premise rests on the cut excerpt.
  A7 | LIST A A7, A14 | "cover with Vitest" is demanded for a runbook procedure and a status line with no function named; Vitest applies only if a script makes the decision, so the tests cannot be specified from the material.
M exit 0
