# Backlog (non-blocking)

Collected findings that did not pass the intake rule of CLAUDE.md §2 (user
decision 01.09.2026): no reproducible player impact, no security or data risk,
no real blockade, and not a deletion/simplification. Nothing here gates a merge,
a landing, or the closing; entries are batched, deduplicated, and revisited only
when their area is touched anyway or a triage says otherwise.

Format: one line per finding — `- YYYY-MM-DD <source> — <finding>`.

<!-- entries -->
- 2026-07-14 memory r3f-clock-deprecation-watch — the dev console warns `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` (three r185+). It comes from @react-three/fiber v9's internal render-loop Clock, not from this project's code. On a dependency-maintenance pass, check whether a newer @react-three/fiber has migrated its loop to `THREE.Timer`; if so, update and confirm the warning is gone. No change in this repository is expected.
- 2026-09-01 cross-vendor review of point 1036 (GPT-5.6 Sol, merge-with-fixes) — the spawned status regression in `scripts/guard-hooks.test.mjs` covers the ordinary finding path, not the `report-gap` path: no case arranges a gap state and asserts that the findings still print above the gap report. No player impact and no blockade — the composed printing is covered by reading, the gap arrangement is expensive to build in a temp repo.
