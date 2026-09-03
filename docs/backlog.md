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
