# CLAUDE.md — POC "The Heart of Africa" (Modern Remake): session rules

## 1. Goal of This Run

Build a runnable modern-remake POC of the core gameplay loop, not the complete
game. `design.md` = target state; this file = build and verification policy.

## 2. Scope Guardrails (binding)

- Single-player only: no multiplayer, netcode, roles, or synchronization.
- No onboarding, tutorial, guided introduction, or lowered entry barrier.
- Do not invent or reintroduce systems absent from `design.md`; record a
  missing design concept as an open item.
- Supply playable numeric values by educated guess under `design.md` §14,
  without overriding stated values. Put estimates, marked calibratable, in
  `src/config/balance.ts`, not throughout the code.
- §7.1 is an acceptance checklist, never a work-start gate; progress = playable
  game output (user decision 01.09.2026).
- **Infrastructure freeze (user decision 01.09.2026):** no new guards, ledger
  fields, routers, review planners, or workflow abstractions. Fix infrastructure
  only for a reproducible current-game blockade or a possible false approval;
  defer the rest. Switch off an obstructing rule; do not rebuild it.
- **Finding intake (user decision 01.09.2026):** a work-order point only for
  reproducible player impact, security/data risk, a real blockade, or a
  deletion/simplification. Otherwise collect in non-blocking `docs/backlog.md`;
  close duplicates without new machinery.

## 3. Tech Stack

- **WebGPU primary, automatic WebGL 2 fallback;** import `three/webgpu`, use
  TSL (no raw GLSL/WGSL), no Chrome-only game behavior. Fallback notice:
  localized and dismissible. Mechanics: `docs/render-architecture.md`.
- **Journal read-aloud:** `kokoro-js` in a Web Worker; lazy-loaded outside
  startup chunks; currently English-only. Mechanics: `docs/tts-architecture.md`.
- Add no runtime dependency without necessity and justify each one in its
  commit.

## 4. Project Structure

A requested design change updates `design.md`, this file where it changes the
build order, and the code together. Organize game code by topic under `src/`;
do not create a monolith.

## 5. Commands

Choose covering tier suites by changed behavior (`scripts/verify/tiers.mjs`).
Run both-backend LARGE once per bundle and at closing.

Every feature adds a right-layer test: Vitest (jsdom) for browserless logic,
state, and HUD; Playwright only for scene, geometry, CSS/layout, audio,
screenshots, and end-to-end. Strategy and suite map: `scripts/verify/README.md`.

## 6. Working Method

- Each point: `feat/<point>-<slug>` from `main`; small atomic self-contained
  commits; push every commit and report a failed push. Merge only complete,
  tier-green and picture-checked: both backends when `isBackendSensitivePath`
  applies, one otherwise. Re-test conflicts that touched code.
- **The merge ends the branch:** remove its local branch, remote branch, and
  worktree. `branch-hygiene-guard` is the backstop.
- Small cross-cutting bookkeeping may land on `main`; a larger mechanism is
  delegated to its own isolated worktree.
- `TASKS.md` is main-only: append there, tick only after merge, and move closed
  points verbatim to `docs/tasks-archive.md`. Consumers needing open and closed
  work use `scripts/tasks-source.mjs`.
- Land via `node scripts/land-point.mjs <N> --model <m>`; its post-merge gate is
  mandatory. Keep branches short; re-verify after a substantial `main` sync.
  Owner operation: `docs/batch-owner-runbook.md`.
- A delegated author runs `node scripts/point-brief.mjs <N>`, may read named
  sections on demand, and escalates an ambiguous or insufficient brief instead
  of guessing. Regenerate a brief from an older revision.
- Daemon-owned durable Astra authors survive handover; session-bound Agent-tool
  children block it. Delegates test, commit, push, and never merge.
- Context fence (preventive text, not a pointer): at its refusal mark start no
  agents, suites, points, or authoring; finishing, reading, and the boundary
  stay allowed. Past 122k it refuses while the launcher is armed.
  Mechanics: `docs/batch-owner-runbook.md`.
- **Model policy.** GPT-6 Astra authors difficult/complex/error-prone/HIGH
  points; Opus 5.5 authors points whose verification is the work; Fable 5.1
  authors tagged points and router escalations; an unreachable Astra lane
  authors on Opus 5.5. Review is cross-vendor, never by an author of the range
  (`scripts/review-astra.mjs` for Claude work, Claude for Astra work).
  `node scripts/fable-switch.mjs --status` alone decides Fable authoring,
  serving, commit trailers, and blind merging; a serving model outside its
  chain pauses the batch. Every commit names its author model in a
  `Co-Authored-By` trailer; a cross-vendor reviewer goes only in a distinct
  `Reviewed-By: <allowed model> <model vendor no-reply address>` trailer.
- **Four eyes has two modes.** Divergent work runs blind-parallel from identical
  inputs, then a third model merges and counts ids through `scripts/blind-merge.mjs`.
  Convergent work reviews the artefact before its rationale. Prefer cross-vendor
  pairs; record and decorrelate a weaker same-model fallback.
- All player-visible text comes from language files: English default, German
  available, both changed together, further languages requiring only a file.
  Code, identifiers, labels, comments, and filenames are English.
- Every en/de journal text carries the `design.md` §15 emotional markup;
  display strips it, read-aloud turns it into prosody
  (`docs/tts-architecture.md`).
- Answer repository questions with small command output. A blocked action means
  find the project command; never route the user through manual container work.
- Act on settled judgment. Confirm outward-facing or hard-to-reverse steps
  unless durably authorized: a stated recommendation on a “Von dir zu klären”
  card authorizes its decision, execution, and recorded closure (what, why,
  veto effect), except tags, publishes, force-pushes, user-data deletions, and
  unrecommended genuine choices. Report failures, skips, and verified outcomes
  faithfully.
- Keep comments brief and factual; mark placeholders. When design is unclear,
  do not guess: add `// OPEN: …` and report it at the run end.

## 7. Acceptance

### 7.1 Acceptance Criteria (POC target)

Conditions and evidence share each criterion’s number in
`docs/acceptance-criteria-detail.md` and `docs/acceptance-evidence.md`;
affected copies change together.

1. **Build/start.**
2. **Two perspectives.**
3. **World model.**
4. **Movement and time.**
5. **Port city.**
6. **Village and cultural contact.**
7. **Language and communication.** Six tonal words, bank/work teaching, silent tag.
8. **Chronicle/journal.**
9. **Status bar.**
10. **Goal scaffolding.**
11. **Game graphics.**
12. **Atmosphere.**
13. **Real geodata.**
14. **Lighting and post-processing.**
15. **Lively settlements.**
16. **Settlement collision.**
17. **Localization.**
18. **Lint and dependency hygiene.**
19. **Journal voice/read-aloud.**
20. **Comfort and audio settings.**
21. **Water realism.**
22. **Health and afflictions.**
23. **Random events.**
24. **Deadline and successor.**
25. **Trade economy.**
26. **Standing with the natives.**
27. **Camps.**
28. **Saving/loading.**
29. **Animated handwriting.**
30. **Gamepad and position query.**
31. **Orientation and panorama wildlife.**
32. **Render pipeline upgrades.**

### 7.2 Self-Verification (mandatory)

- Run build and lint always, unit tests for every change, and
  `scripts/audit-check.mjs` when the lockfile changes. Use the §5 test layer and
  browser tier that can assert the changed behavior.
- Test player-reachable states and judge visibility by the rendered projection,
  never an assumed radius. Every screenshot declares and contains its actual
  world/local/place/HUD/general subject at the shutter.
- Everyday browser lane: WebGPU; LARGE adds the full WebGL 2 regression lane.
  Every browser suite asserts the requested backend; touch/voice use WebGL 2.
  A WebGL-2-only defect may wait until the next LARGE. Operation:
  `scripts/verify/README.md`.
- A red run closes only when its cause is fixed, charged to its owning point, or
  filed as a new point. A retry is SUSPECT and covers nothing.
- Dev-mode invariant assertions should turn every test and manual session into
  a detector. Fail soft for environment/staging transients and loud for product
  defects.
- **Before answering:** BOARD published/current/concise/single-topic with all
  decisions visible; BATCH advancing within model/context/CI/branch/timestamp/
  retrospective rules; WORK ORDER order/spec/split/budgets valid; each FINDING
  durably filed; required render/mechanism PROOF supplied. `ci-status-guard`
  waits for concluded green CI on every pushed ref. Hook inventory:
  `.claude/settings.json`.
- Pre-action hooks are pointers: `board-first-guard` requires a current,
  published focus before the first mutation; `closing-guard` owns §9; the
  versioned hooks installed by `npm install` own commit and push syntax.
- Before a governed action run `node scripts/guard-preflight.mjs --for <action>
  --session <id>`. Perform routine duties first and answer last.
- No screenshot-metric golden-image shortcut until
  `scripts/picture-stability.mjs <suite>` reports STABLE; verdicts:
  `docs/picture-check-levers.md`.
- Fix deviations; never paper them over or report an unfulfilled criterion as
  fulfilled.

## 9. Closing the Run

Report fulfilled §7.1 criteria with screenshot evidence, collected
`// OPEN: …` items, simplifications, and placeholder values; add no silent
extension.

Closing order: `CLOSING_STEPS` in `scripts/closing-guard-core.mjs`; drive it
with `--status`, then `--step <id> --evidence "<proof>"`. `closing-guard` denies
a tag or delivery-point tick until it is complete.

Freeze code during closing: merge or park in-flight branches first, land no
agent work during the run, and resume only after it completes. Owner procedure:
`docs/batch-owner-runbook.md`.
