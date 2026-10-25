ask-lane: asking GPT-6.1 Sol (effort high) for a enumerate — 192834 characters of material …
--- GPT-6.1 Sol said ---
**1. MEASUREMENT**

**0) After 1443**

There are **zero complete post-1443 cycles in the supplied material**. The stated completion is approximately 25 October, 23:27 local time; the dated activity journal ends at 22:38 UTC, approximately eleven minutes later.

Post-1443 cloud authors running alongside local acceptance, hours per landed point, and the improvement caused by 1443 are **not measurable from the material**. No such cloud start is recorded after completion; that does not establish that none occurred.

The remote snapshot contains one remaining feature branch, `1347-garment-rebuild`, against `POOL_CAP = 3`. That establishes nominal remote branch headroom, not complete occupancy: local branches, parked-branch records and the promised `batch-in-flight --status` output are absent. Draining the pool is 1443’s work and should not be repeated here.

Before 1443, one cloud author is directly evidenced: point 1440’s session creation on 24 October at 04:41:36 +02:00. Its merge followed **77.62 minutes** later. The three-second creation command measures submission, not authoring. Neither sustained cloud concurrency nor overlap with local acceptance is established.

**a) Historical wall-clock allocation**

I selected the last **25 distinct merge-backed point IDs**, ending with 1297. This includes 26 merge events because 1413 merged twice. The window starts immediately after the preceding merge, 1409:

- Start: **21 October, 19:02:52 UTC**.
- End: **25 October, 22:05:29 UTC**.
- Elapsed: **99.0436 hours**.
- Historical cadence: **3.9617 hours per distinct merge-backed point**, or **6.06 per wall-clock day**.

These are merge-backed point counts. Direct-main administrative closures such as 1443 require separate accounting; this is not a complete count of all completed work-order points.

The defensible hour allocation is below. Completed verification intervals receive time first; their overlaps count once. Everything else remains unresolved. Durations are approximate because the supplied run durations are rounded.

| Exclusive allocation | Hours | Interpretation |
|---|---:|---|
| Completed local verification intervals with nonzero exit | 16.80 | Includes suites, picture-producing runs, diagnostics and repeats that cannot be separated |
| Completed exit-zero verification intervals, excluding overlap with the preceding row | 2.75 | Includes successful repeats; does not establish complete point acceptance |
| Authoring outside those intervals | Not measurable | Included in unresolved time below |
| Waiting for review outside those intervals | Not measurable | Included in unresolved time below |
| Reruns after red | Not separately measurable | Recorded execution already occupies the first two rows; intervening diagnosis is unresolved |
| Picture judgment/check time | Not separately measurable | Some capture execution is above; separate judgment timestamps are absent |
| Handover/boundary time | Not measurable | Included in unresolved time below |
| Time with no live owner | Not measurable | Included in unresolved time below |
| **Unresolved remainder, assigned once** | **79.49** | Contains the unseparated phases above and unfinished verification |
| **Total** | **99.04** | No interval counted twice |

The window contains **121 completed verification records**: 30 exit-zero, 61 exit-one and 30 exit-two. Their summed execution is **19.7067 run-hours**; their wall-clock union is **19.5513 hours**. Summing them without removing overlap would double-count approximately **9.32 minutes**.

Another **six records remain `running/-` with duration `0.0`**. Their actual durations are unknown, not zero. Consequently, 19.55 hours is the observed completed-run footprint, not total local verification time.

Per-point spans follow. The cadence column partitions the window by successive distinct points’ final listed merges. Branch age is first listed branch commit to final listed merge; it is **not authoring duration** and must not be added across points.

| Point | Cadence interval, hours | Branch age, hours |
|---|---:|---:|
| 1410 | 1.460 | 2.578 |
| 1411 | 1.635 | 4.232 |
| 1421 | 1.463 | 0.311 |
| 1413 | 0.761 | 0.446 |
| 1412 | 0.562 | 0.035 |
| 1407 | 3.039 | 1.957 |
| 1393 | 2.992 | 38.514 |
| 1402 | 3.245 | 18.775 |
| 1403 | 7.231 | 6.306 |
| 1404 | 9.238 | 8.308 |
| 1426 | 1.343 | 0.867 |
| 1424 | 7.346 | 6.522 |
| 1405 | 5.627 | 12.071 |
| 1430 | 2.019 | 0.590 |
| 1431 | 0.492 | 0.003 |
| 1439 | 4.854 | 0.053 |
| 1438 | 1.668 | 0.157 |
| 1440 | 1.964 | 1.157 |
| 1441 | 3.683 | 0.290 |
| 1442 | 21.409 | 21.076 |
| 1446 | 4.813 | 4.033 |
| 1414 | 1.997 | 37.713 |
| 1432 | 3.477 | 41.213 |
| 1333 | 5.812 | 124.449 |
| 1297 | 0.914 | 484.258 |

Additional limits on interpretation:

- **91/121 completed commands exited nonzero**, but these are not 91 distinct regressions or wasted reruns: baseline comparisons, known charged reds and diagnostics occur in the material.
- Point 1405 has **27 completed records totalling 158.4 minutes**; 1432 has **19 totalling 116.1 minutes**. The material does not identify which repetitions a final-author checkpoint would have prevented.
- The hourly summaries omit **13 hours**, from 24 October 12:00 UTC through 25 October 00:59 UTC. Missing events do not prove thirteen ownerless hours.
- Repeated handovers, owner releases, recovery attempts and distinct session counts are not durations or counts of simultaneously productive workers.
- Review log mtimes and filenames do not supply review start times. Even a named review declaration, such as 1297’s eleven-minute declaration, does not establish exclusive owner waiting.
- Old branches create substantial carry-in. Landing 1297 after a 484-hour branch age cannot demonstrate a fast authoring cycle or the effect of the new mode.

**b) What can overlap, and its limits**

| Overlap | Supported conclusion | Limit established by the material |
|---|---|---|
| Cloud authoring another point during local acceptance | Existing runbook explicitly permits it; 1440 proves a submitted cloud session subsequently reached a merge | Sustainable concurrency and resulting throughput are not measurable |
| Local authors working independently outside acceptance windows | Declarations name three authors for 1409/1410/1411 and two for 1424/1405 | These declarations do not establish productive concurrency, machine safety or speedup |
| Browser suites/picture capture alongside another local heavy job | Unsafe as the operating default | On 23 October, 1424’s 04:59:58 UTC run overlaps 1405’s 05:02:04 run; both exited nonzero, although contention is not proven causal |
| Lightweight preparation or remote review during acceptance | Already permitted | It must not start a local agent, browser or Vitest workload that destroys the quiet window |
| Landing, board publication and ownership changes | Remain serial | One owner; board calls race when concurrent |

The runbook reports approximately **20% suite slowdown under load**, a **55-minute whole polish pass**, and **119-minute full LARGE**. The machine snapshot has **16 CPUs, 15 GiB RAM and 1 GiB swap used**. It contains no historical CPU, memory, GPU or pressure trace, so a safe maximum of two or more local heavy jobs cannot be derived.

A defensible **initial trial** is one cloud author and one local heavy job, with zero other local agents during quiet acceptance. One cloud author is the largest directly evidenced cloud deployment in this material; one local heavy job follows the existing quiet-machine evidence. These are conservative trial bounds, **not measured optimal capacities**.

Local acceptance’s successful service rate, owner context capacity and the queue’s available disjoint work are **not measurable**. The supplied code checks named paths, but actual candidate specifications and changed-file sets are absent.

**c) Existing obstructions and mechanisms**

- **Pool occupancy:** five branches against cap three was the stated obstruction. 1443 addressed it; retain the cap until post-1443 evidence justifies anything else.
- **Pool-as-target:** the core describes three as both ceiling and target. Demanding three occupied lanes can contradict acceptance-paced commissioning and manufacture a ready backlog.
- **Quiet-window wording:** “start no other local agent” does not itself drain an already-running local author’s build or tests. Quietness must cover existing work too.
- **Queue admission and overlap:** use the existing recorded queue override for a justified independent candidate. No evidence supports removing queue order or file isolation.
- **Routing:** `lane-routing: default` selects the authoring vendor role; `cloud-switch: ON` selects execution locality. Changing to `prefer-cross` is not demonstrated to solve a cloud commissioning problem.
- **Repeated acceptance:** final-author gating and invalidated-check-only reruns already exist. Their compliance and savings are unmeasured; enforce the procedure before adding another guard.
- **Boundary and waiting:** forty-five-minute delegated leases appear alongside declared approximately ninety-minute runs and documented 119-minute work. Duration mismatch is a coordination risk; it is not proof that a particular run was killed.
- **Launcher:** there are **seven explicit “despite a live owner” absolute-deadline messages**. They do not prove two writers actually ran, but additional authoring must not amplify uncertain ownership. The launcher deadline fix already has its own queued point.
- **Bookkeeping:** eight listed main-push log files have mtimes between 23 October 20:23 and 21:45 UTC. This establishes repeated publication activity, not its exclusive cost or avoidability.
- **Incomplete implementation evidence:** `batch-in-flight-core.mjs` ends mid-comment, and `commission-guard.mjs`, despite its “full” label, ends mid-function/string. Both are **TRUNCATED**. The admission tail, cloud-command coverage and full lower-bound decision cannot be audited here. The supplied status block also omits `batch-in-flight --status`.

**2. PROPOSALS**

P1 | docs/batch-owner-runbook.md | Measure at least one complete post-1443 cycle under the existing mode before changing it, recording cloud concurrency during local acceptance and hours per uniquely closed point; the attachment contains zero such cycles, so close as a recorded finding if 1443 alone already meets the goal.
P2 | procedure | Start any needed changed-mode trial with at most 1 submitted/running cloud author, including sessions whose branch is not visible yet, subject to the existing branch cap; 1440 is the only directly evidenced cloud author and reached merge 77.62 minutes after submission, while higher sustainable concurrency is not measurable.
P3 | docs/batch-owner-runbook.md | Limit local heavy jobs to 1 and other local agents to 0 throughout browser, unit-gate and picture windows, draining or checkpointing existing local workloads first; outside those windows allow at most 1 local author alongside cloud work when files and slots permit, treating this as a trial because overlapping browser records and the documented approximately 20% slowdown do not establish a higher safe bound.
P4 | scripts/commission-guard.mjs | KEEP: POOL_CAP 3 as the open-branch ceiling and existing LAND/PARK remedies; the measured five-branch obstruction belongs to 1443, and no evidence supports raising the ceiling.
P5 | scripts/batch-in-flight-core.mjs | Replace unconditional pressure to fill all 3 lanes with acceptance-paced refill: permit at most 1 completed successor waiting for acceptance, and allow unused slots while that successor exists or quietness prevents local work; the cap currently doubles as a target although successful acceptance throughput is unmeasured.
P6 | commission-guard / independentOpenPoints | KEEP: queue admission, recorded per-point overrides and worktree/file isolation; choose only ready points with checked prerequisites and compare their files against every occupied lane, because the attachment supplies neither a disjoint candidate inventory nor evidence that path-name matching alone is sufficient.
P7 | cloud-switch / lane-routing | KEEP: cloud-switch ON and lane-routing default for the initial measurement; one real cloud submission succeeded under the available setup, while vendor-role routing is not execution locality and no measured result supports changing both together.
P8 | docs/batch-owner-runbook.md / scripts/land-point.mjs | KEEP: final-author acceptance, exact pushed-SHA build/lint/Vitest receipts, covering local browser tiers, required backend picture checks, cross-vendor review and mandatory post-merge landing gate; repeat pre-acceptance work only when its evidence is missing or invalidated, since cloud green is not browser evidence and 91 completed local commands exited nonzero.
P9 | procedure | After 1 diagnostic repeat of an unchanged SHA/backend/failure signature, stop identical retries until diagnosis, a relevant change or a documented changed condition supplies a reason; 1405 consumed 158.4 recorded minutes across 27 completed runs, without evidence that blind repetition improved acceptance.
P10 | run-wait / batch-in-flight / boundary procedure | KEEP run-wait and STALLED/TIMEOUT diagnosis, but transfer command, SHA, backend, process identity and progress-backed lease together across boundaries and renew leases from observed progress; forty-five-minute declarations coexist with approximately ninety-minute declared runs and documented 119-minute work.
P11 | scripts/batch-in-flight.mjs --status | Use 1 existing status command as the short inventory of cloud session IDs, local agents, suites, point, purpose, stage and owner; extend only its existing declaration/reporting fields if necessary, because its actual output and cloud visibility are absent from the attachment.
P12 | docs/batch-owner-runbook.md | Coalesce routine retrospective, guide-attestation and queue-rank maintenance into 1 coherent boundary bookkeeping commit/push when their requirements permit, preserving required user-order publication receipts; eight main-push log files in 82 minutes identify repeated publication but not its avoidable duration.
P13 | ownership fence / batch-boundary / queued launcher deadline fix | KEEP 1 owner, serial landing, point-boundary sessions, adoption and context handover; reconcile every transferred job before refill and leave the already-queued launcher deadline repair in its own point, since seven live-owner deadline messages establish a risk but not proven duplicate writers.
P14 | docs/batch-owner-runbook.md | Merge, approve and record the measured bounds and an explicit successor-adoption switch-over, replacing superseded dispatch text; run the next points in that mode and record at least 1 complete post-landing cycle against the post-1443 baseline, reporting shorter hours per unique closure or the measured reason it failed.
P15 | cloud-switch / procedure | Commission only bounded successors that available local acceptance can plausibly land, retain at most 1 completed waiting successor, and revisit the switch by 05.11.2026 08:59 MEZ; the expiry is known but remaining credit, acceptance capacity and a numeric spending budget are not measurable.
P16 | changed decision logic / Vitest | Add Vitest coverage in the same change for any modified refill or admission decisions, including cap 3, one-ready-successor backpressure, unknown evidence and boundary adoption; keep scheduling changes procedural where possible because the infrastructure freeze favors simplifying existing mechanisms.

**3. RISKS**

| Proposal | What it could break or conceal |
|---|---|
| P1 | One baseline cycle can delay change and remains too small to establish a stable rate. |
| P2 | One cloud author may underuse credit; counting branches alone could accidentally admit a second session before its branch appears. |
| P3 | Conservative local limits may reduce useful overlap; an existing agent that continues building can silently invalidate quietness. |
| P4 | The remaining 1347 branch still consumes capacity unless legitimately parked; excessive parking could hide unfinished obligations. |
| P5 | Backpressure can starve acceptance if refill starts too late; incomplete status can miscount ready work. |
| P6 | Named files can miss indirect dependencies; queue overrides can erode user priority if their reasons are weak. |
| P7 | Current routing may be slower or costlier than another setting; that comparison remains unmeasured. |
| P8 | SHA changes or incomplete invalidation can reuse stale evidence; known reds must retain their existing ownership and landing treatment. |
| P9 | A retry limit can interrupt legitimate nondeterminism investigation; permit reasoned diagnostic experiments without treating repeats as acceptance. |
| P10 | Lease renewal without real progress could preserve a hung process; incomplete transfer can duplicate or orphan work. |
| P11 | A concise inventory can conceal unknown states; declarations must not be presented as measured liveness. |
| P12 | Coalescing can delay user-order durability or stale-source checks; their required publication ordering must survive. |
| P13 | An unrepaired launcher deadline can still disrupt adoption; removing recovery indiscriminately could leave genuine crashes unattended. |
| P14 | Carry-in, easier points or early-exiting red suites can mimic improvement; one cycle satisfies observation, not causal proof. |
| P15 | Too little commissioning wastes expiring credit; too much leaves an acceptance backlog that cannot land. |
| P16 | Tests can certify an invented interpretation of truncated code; inspect the complete implementation before changing its decisions. |

B1 | docs/batch-owner-runbook.md | Post-1443 has zero complete observed cycles; cloud/local overlap and hours per landed point are not measurable, so neither success nor residual bottlenecks can yet be attributed to 1443.
B2 | main merge history | The selected 25 distinct merge-backed points contain 26 merges over 99.0436 hours, yielding 3.9617 hours per point and 6.06 per day; duplicate 1413 merges and direct-main closures require distinct accounting.
B3 | local/verify-logs/*.run.json | Exclusive observed allocation is approximately 16.80 hours of nonzero verification, 2.75 hours of other completed verification and 79.49 unresolved hours; authoring, review, reruns, picture judgment, boundaries and owner absence cannot be separately timed.
B4 | local/verify-logs/*.run.json | There are 121 completed records and six unfinished duration-zero records; summed completed execution is 19.7067 hours but its union is 19.5513 hours, so summation double-counts approximately 9.32 minutes.
B5 | main merge history | First-commit-to-merge spans are branch ages rather than authoring time; 1297 carries 484.258 hours and 1333 carries 124.449 hours, making carry-in a material threat to throughput comparisons.
B6 | .claude/batch-activity.jsonl | Hourly event counts do not establish worker durations or concurrency, and the thirteen absent hourly bins do not establish thirteen ownerless hours.
B7 | local/1440-cloud-author.log | One cloud session is directly evidenced and merged 77.62 minutes after submission; three-second CLI completion is submission latency and proves neither authoring duration nor sustained cloud concurrency.
B8 | scripts/batch-in-flight-core.mjs / scripts/commission-guard.mjs | Both supplied code excerpts are TRUNCATED, and batch-in-flight status output is missing; full admission behavior, cloud visibility and actual current occupancy cannot be audited.
B9 | docs/batch-owner-runbook.md | P1: Measure at least one complete unchanged-mode post-1443 cycle before intervention and close with a recorded finding if 1443 alone already meets the goal.
B10 | procedure | P2: Trial at most one submitted/running cloud author, counting sessions before branch visibility and respecting cap three; higher sustainable concurrency is not measurable.
B11 | docs/batch-owner-runbook.md | P3: Trial one local heavy job, zero other local agents during quiet acceptance and at most one local author outside it; drain existing workloads before acceptance because start-only wording leaves a quietness gap.
B12 | scripts/commission-guard.mjs | P4 KEEP: Retain POOL_CAP three and existing LAND/PARK remedies without repeating 1443’s pool drain or claiming evidence for a larger ceiling.
B13 | scripts/batch-in-flight-core.mjs | P5: Simplify the fill-to-three target into acceptance-paced refill with at most one completed waiting successor and an explicit valid reason for unused slots.
B14 | commission-guard / independentOpenPoints | P6 KEEP: Retain queue admission, recorded overrides and worktree/file isolation, checking prerequisites and overlap against all occupied lanes rather than trusting named paths alone.
B15 | cloud-switch / lane-routing | P7 KEEP: Measure with cloud ON and routing default; vendor selection and cloud execution are different decisions and changing both would confound the baseline.
B16 | docs/batch-owner-runbook.md / scripts/land-point.mjs | P8 KEEP: Preserve final-SHA receipts, local browser tiers, required backend pictures, cross-vendor review and mandatory landing gates while avoiding only missing-evidence-free, non-invalidated duplicate checks.
B17 | procedure | P9: Permit one unchanged-condition diagnostic repeat, then require diagnosis, a relevant change or a recorded changed condition before repeating the same failure again.
B18 | run-wait / batch-in-flight / boundary procedure | P10: Keep bounded waiting and terminal diagnosis, transferring complete job identity and renewing leases only from observed progress across session boundaries.
B19 | scripts/batch-in-flight.mjs --status | P11: Make one existing short status output identify every cloud session, local agent and suite with point and purpose, preserving unknown states and adding no orchestration layer.
B20 | docs/batch-owner-runbook.md | P12: Coalesce compatible routine bookkeeping into one boundary commit/push while preserving user-order publication receipts and mandatory source checks.
B21 | ownership fence / batch-boundary / queued launcher deadline fix | P13 KEEP: Preserve single ownership, serial landing, point boundaries and adoption; reconcile transferred jobs before refill and keep the already-queued launcher repair separate.
B22 | docs/batch-owner-runbook.md | P14: Record an approved merged replacement plan, switch successors through existing adoption, and measure at least one complete post-landing cycle against the post-1443 baseline without treating one cycle as causal proof.
B23 | cloud-switch / procedure | P15: Pace credit spending to landable bounded successors, retain at most one completed waiting successor and revisit cloud use by 05.11.2026 08:59 MEZ; remaining credit and spending capacity are not measurable.
B24 | changed decision logic / Vitest | P16: Test changed refill or admission decisions with Vitest, including cap three, one-ready-successor backpressure, unknown evidence and boundary adoption, after inspecting the complete implementation.
--- end ---

ask-lane: GPT-6.1 Sol (effort high) answered the enumerate in 449s — 24 entries
  B1 | docs/batch-owner-runbook.md | Post-1443 has zero complete observed cycles; cloud/local overlap and hours per landed point are not measurable, so neither success nor residual bottlenecks can yet be attributed to 1443.
  B2 | main merge history | The selected 25 distinct merge-backed points contain 26 merges over 99.0436 hours, yielding 3.9617 hours per point and 6.06 per day; duplicate 1413 merges and direct-main closures require distinct accounting.
  B3 | local/verify-logs/*.run.json | Exclusive observed allocation is approximately 16.80 hours of nonzero verification, 2.75 hours of other completed verification and 79.49 unresolved hours; authoring, review, reruns, picture judgment, boundaries and owner absence cannot be separately timed.
  B4 | local/verify-logs/*.run.json | There are 121 completed records and six unfinished duration-zero records; summed completed execution is 19.7067 hours but its union is 19.5513 hours, so summation double-counts approximately 9.32 minutes.
  B5 | main merge history | First-commit-to-merge spans are branch ages rather than authoring time; 1297 carries 484.258 hours and 1333 carries 124.449 hours, making carry-in a material threat to throughput comparisons.
  B6 | .claude/batch-activity.jsonl | Hourly event counts do not establish worker durations or concurrency, and the thirteen absent hourly bins do not establish thirteen ownerless hours.
  B7 | local/1440-cloud-author.log | One cloud session is directly evidenced and merged 77.62 minutes after submission; three-second CLI completion is submission latency and proves neither authoring duration nor sustained cloud concurrency.
  B8 | scripts/batch-in-flight-core.mjs / scripts/commission-guard.mjs | Both supplied code excerpts are TRUNCATED, and batch-in-flight status output is missing; full admission behavior, cloud visibility and actual current occupancy cannot be audited.
  B9 | docs/batch-owner-runbook.md | P1: Measure at least one complete unchanged-mode post-1443 cycle before intervention and close with a recorded finding if 1443 alone already meets the goal.
  B10 | procedure | P2: Trial at most one submitted/running cloud author, counting sessions before branch visibility and respecting cap three; higher sustainable concurrency is not measurable.
  B11 | docs/batch-owner-runbook.md | P3: Trial one local heavy job, zero other local agents during quiet acceptance and at most one local author outside it; drain existing workloads before acceptance because start-only wording leaves a quietness gap.
  B12 | scripts/commission-guard.mjs | P4 KEEP: Retain POOL_CAP three and existing LAND/PARK remedies without repeating 1443’s pool drain or claiming evidence for a larger ceiling.
  B13 | scripts/batch-in-flight-core.mjs | P5: Simplify the fill-to-three target into acceptance-paced refill with at most one completed waiting successor and an explicit valid reason for unused slots.
  B14 | commission-guard / independentOpenPoints | P6 KEEP: Retain queue admission, recorded overrides and worktree/file isolation, checking prerequisites and overlap against all occupied lanes rather than trusting named paths alone.
  B15 | cloud-switch / lane-routing | P7 KEEP: Measure with cloud ON and routing default; vendor selection and cloud execution are different decisions and changing both would confound the baseline.
  B16 | docs/batch-owner-runbook.md / scripts/land-point.mjs | P8 KEEP: Preserve final-SHA receipts, local browser tiers, required backend pictures, cross-vendor review and mandatory landing gates while avoiding only missing-evidence-free, non-invalidated duplicate checks.
  B17 | procedure | P9: Permit one unchanged-condition diagnostic repeat, then require diagnosis, a relevant change or a recorded changed condition before repeating the same failure again.
  B18 | run-wait / batch-in-flight / boundary procedure | P10: Keep bounded waiting and terminal diagnosis, transferring complete job identity and renewing leases only from observed progress across session boundaries.
  B19 | scripts/batch-in-flight.mjs --status | P11: Make one existing short status output identify every cloud session, local agent and suite with point and purpose, preserving unknown states and adding no orchestration layer.
  B20 | docs/batch-owner-runbook.md | P12: Coalesce compatible routine bookkeeping into one boundary commit/push while preserving user-order publication receipts and mandatory source checks.
  B21 | ownership fence / batch-boundary / queued launcher deadline fix | P13 KEEP: Preserve single ownership, serial landing, point boundaries and adoption; reconcile transferred jobs before refill and keep the already-queued launcher repair separate.
  B22 | docs/batch-owner-runbook.md | P14: Record an approved merged replacement plan, switch successors through existing adoption, and measure at least one complete post-landing cycle against the post-1443 baseline without treating one cycle as causal proof.
  B23 | cloud-switch / procedure | P15: Pace credit spending to landable bounded successors, retain at most one completed waiting successor and revisit cloud use by 05.11.2026 08:59 MEZ; remaining credit and spending capacity are not measurable.
  B24 | changed decision logic / Vitest | P16: Test changed refill or admission decisions with Vitest, including cap three, one-ready-successor backpressure, unknown evidence and boundary adoption, after inspecting the complete implementation.
B exit 0
