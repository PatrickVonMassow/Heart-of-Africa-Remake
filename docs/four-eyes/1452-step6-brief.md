# 1452 step 6: implementation brief (cloud author)

Branch `feat/1452-throughput-parallelism` (already exists, pushed). Work ON it; never merge.
Spec: `node scripts/point-brief.mjs 1452` (step 6 and the step-8 guardrails). Inputs, all tracked:
- the approved plan `docs/four-eyes/1452-union-r1.json` (step 4 re-check APPROVE; the `entries`
  carry each id's verdict and knob, `objections` the answered objections);
- the measured verdicts `docs/1452-step5-measurement.md`: M1 ACCEPTED (one cross-vendor review
  may run beside a browser suite), M2 REJECTED (no build/lint/unit gate beside a browser suite),
  M3 REJECTED (one browser suite at a time);
- the step-1 inventory `docs/1452-throughput-inventory.md`.

Do:
1. `docs/batch-owner-runbook.md`: record the new bounds from M1–M3 with their numbers and a
   pointer to the measurement doc; write the adopted practice entries (U1, U3, U4, U8, U12, U14,
   U15, U17) as short binding runbook rules where the runbook does not already say them; the
   rejected candidates (U5, U7, U9, U10, U11) get one line each with the reason, so they are not
   re-proposed without new data. DAEMON_POOL_CAP / POOL_CAP stay unchanged (no measurement
   supports a change).
2. Code entries, each with a Vitest case at the right layer: U13 (autostart liveness re-tune),
   U16 (switch off the point-427 lower-bound check in `scripts/pool-cap-independent.mjs`),
   U24 (block-end regex in `openPointSpecs`), and U2 only if its entry says it can be done
   without a new measurement; otherwise leave U2 as a recorded open item.
3. Fix the inventory critiques U28–U34 in `docs/1452-throughput-inventory.md` (numbers only).

Constraints: infrastructure freeze (CLAUDE.md §2) — no new guards, ledger fields, routers or
workflow abstractions; re-tune, simplify or switch off only. Measure doc ceilings with
`scripts/doc-budget-core.mjs` before growing CLAUDE.md or the runbook. English in code/docs.
Commit at every self-contained step, push the branch after every commit, trailer
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit messages describe the change
and never name a point number. Before handing over: `npm run build`, `npm run lint`,
`npm run test:unit` on the branch; hand over the pushed sha, those three results and open issues.
Escalate an ambiguous entry instead of guessing.
