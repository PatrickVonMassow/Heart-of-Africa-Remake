# Reorder dispositions of point 1560 (20.11.2026)

Split from 1557. Measured on `main` 1c45b7014.

## 1013 — cheetah hunting in central Africa: closed, delivered by 1063

- Run: `npm test -- enrichments --section=predator-food-web`, WebGPU (RTX 4070 Ti,
  ANGLE/D3D12), log `local/verify-logs/2026-11-20T14-52-32-200-enrichments.log`:
  4 pass, 0 fail, 0 console errors; `every predator fits the region and period`
  green (at least 6 hunts, no predator mismatch).
- Scene-state check, no frame: the section writes no screenshot.
- 1063 delivered 1013's final state: the hunt records `startRegion`,
  `pickHuntSpecies` casts for it, and both fit checks ask the start region
  (stated in the check's comment) and log border crossings separately.

## 1059, 1289, 1328 — not reproduced; stay in `docs/backlog.md`

1558 moved all three to the backlog on 20.11.2026, after 1560 was written, so
none of them can move "behind 1555" (1555 is closed too).

- 1059 (exit 143 at a context boundary): `.claude/batch-launcher.log` shows no
  exit 143 and no SIGTERM ending; the last launcher ticks (20.11.2026, 14:38 and
  14:51 UTC) finished with exit 0, and the session before this one handed over
  cleanly (`ownership ENDED (handed-over)`).
- 1289 / 1328 (Stop guards binding a released or answer-only session): the
  findings carrier has one related report since the split was planned —
  17.11.2026, session 53e40336, Stop guards re-firing after a committed context
  boundary, already filed in the backlog — and none from 18.11 to 20.11.2026.
  This session started with the lock assessed inactive (`handed-over`), so the
  previous holder ended. Not reproduced, so they are not merged into one point.

## 1516 + 551 — one point (551); 1215 stays separate

Both describe the movement-penalty hint (`.status-hints` in
`src/ui/StatusBar.tsx`, e.g. the canoe hint) drawn over status-bar text: 551
over the region name, 1516 over the compass heading. Their remedies conflict:
1516 moves the hint below the bar, 551 keeps it centred inside the bar and hides
any permanent element it overlaps for the hint's lifetime. Acceptance criterion
9 (`docs/acceptance-criteria-detail.md`) requires transient status hints to
render centred inside the status bar, so 551's remedy holds. 551 takes 1516's
evidence (frames 131-burning-grass and 327-vulture-cluster-one-flock, heading
text) and its layout check, restated as "the hint's box intersects no visible
status-bar text box"; 1516 closes as a duplicate of 551.
