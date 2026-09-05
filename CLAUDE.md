# CLAUDE.md — Build Order: POC "The Heart of Africa" (Modern Remake)

## 1. Goal of This Run

Build a runnable proof of concept of the modern remake that demonstrates the
core gameplay loop, not the complete game. `design.md` is authoritative for
the target state; this file governs how it is built and verified.

## 2. Scope Guardrails (binding)

- Single-player only: no multiplayer, netcode, roles, or synchronization.
- No onboarding, tutorial, guided introduction, or lowered entry barrier.
- Do not invent or reintroduce systems absent from `design.md`; record a
  missing design concept as an open item.
- Supply playable numeric values by educated guess under `design.md` §14,
  without overriding stated values. Put estimates, marked calibratable, in
  `src/config/balance.ts`, not throughout the code.
- §7.1 is the acceptance checklist, no longer a gate (user decision 01.09.2026):
  no criterion blocks beginning other work, and progress is judged by playable
  game output, not by checklist completion.
- **Infrastructure freeze (user decision 01.09.2026).** Add no new guards,
  ledger fields, routers, review planners, or workflow abstractions. An
  infrastructure defect is worked on only when it reproducibly blocks current
  game work or permits a false approval; everything else waits. A rule that is
  in the way is switched off, not rebuilt.
- **Finding intake (user decision 01.09.2026).** A finding becomes a work-order
  point only for reproducible player impact, a security or data risk, a real
  blockade, or when the point deletes or simplifies something. Everything else
  goes to `docs/backlog.md` (non-blocking, collected, never a gate); duplicates
  are closed, not re-mechanized.

## 3. Tech Stack

- **WebGPU primary, automatic WebGL 2 fallback.** Import from `three/webgpu`;
  use TSL rather than raw GLSL/WGSL; do not make game behavior Chrome-only.
  Show a localized, dismissible compatibility notice on fallback. Mechanics:
  `docs/render-architecture.md`.
- **Journal read-aloud:** `kokoro-js` in a Web Worker, lazy-loaded, absent from
  startup chunks, currently English-only. Mechanics: `docs/tts-architecture.md`.
- Add no runtime dependency without necessity and justify each one in its
  commit.

## 4. Project Structure

A requested design change updates `design.md`, this file where it changes the
build order, and the code together. Organize game code by topic under `src/`;
do not create a monolith.

## 5. Commands

Choose Vitest-only, SMALL, or LARGE by the changed behavior; the tier map is
`scripts/verify/tiers.mjs`. The closing always runs LARGE.

Use Vitest (jsdom) for logic, state, and HUD behavior assertable without a
browser; use Playwright only for scene, geometry, CSS/layout, audio, screenshot,
and end-to-end behavior. Every feature adds a test on the right layer. Full
strategy and suite map: `scripts/verify/README.md`.

## 6. Working Method

- Each work-order point uses its own `feat/<point>-<slug>` branch from `main`,
  in small self-contained commits. Commit atomically and push after every
  commit; report a failed push. Merge only when complete and test-green, with
  the rendered picture checked on both backends for a backend-sensitive change
  and one otherwise (`isBackendSensitivePath`). Re-test conflicts that touched
  code.
- **The merge ends the branch:** remove its local branch, remote branch, and
  worktree. `branch-hygiene-guard` is the backstop.
- Small cross-cutting bookkeeping may land on `main`; a larger mechanism is
  delegated to its own isolated worktree.
- `TASKS.md` is main-only: append there, tick only after merge, and move closed
  points verbatim to `docs/tasks-archive.md`. Consumers needing open and closed
  work use `scripts/tasks-source.mjs`.
- Land through `node scripts/land-point.mjs <N> --model <m>`; its gate is
  mandatory after every merge. Keep branches short, and verify again after syncing
  substantial `main` changes. Owner operation: `docs/batch-owner-runbook.md`.
- A delegated author runs `node scripts/point-brief.mjs <N>`, may read named
  sections on demand, and escalates an ambiguous or insufficient brief instead
  of guessing. Regenerate a brief from an older revision.
- Durable Astra authors are daemon-owned and survive handover; Agent-tool children stay session-bound and block it. Delegates test, commit, push, and never merge.
- The context fence remains preventive text, not a pointer: at its refusal mark
  do not begin agents, suites, points, or authoring; finish/reading/boundary
  remain allowed. It currently defaults to `observe` and refuses nothing until
  its arming point lands. Owner mechanics: `docs/batch-owner-runbook.md`.
- **Model policy.** GPT-6 Astra authors difficult, complex, error-prone, and
  HIGH-criticality points; Opus 5 authors points whose verification is the work.
  Fable 5.1 authors tagged points and router escalations. Review is cross-vendor and
  never by an author of the range: Astra reviews Claude work through
  `scripts/review-astra.mjs`, Claude reviews Astra work. `node
  scripts/fable-switch.mjs --status` is the sole answer whether Fable
  participates in authoring, serving, commit trailers, or blind merging.
  Serving models outside its reported chain pause the batch. Every commit names
  its author model in a `Co-Authored-By` trailer.
  A commit may name its cross-vendor reviewer in a distinct `Reviewed-By: <allowed model> <model vendor no-reply address>` trailer, never `Co-Authored-By`.
- **Four eyes has two modes.** Divergent work runs blind-parallel from identical
  inputs, then a third model merges and counts ids through `scripts/blind-merge.mjs`.
  Convergent work reviews the artefact before its rationale. Prefer cross-vendor
  pairs; record and decorrelate a weaker same-model fallback.
- All player-visible text comes from language files: English default, German
  available, both changed together, further languages requiring only a file.
  Code, identifiers, labels, comments, and filenames are English.
- Every journal text in both languages carries the `design.md` §15 emotional
  markup; display strips it and read-aloud turns it into prosody. Mechanics:
  `docs/tts-architecture.md`.
- Answer repository questions with small command output. A blocked action means
  find the project command; never route the user through manual container work.
- Act on settled judgment. Confirm before outward-facing or hard-to-reverse
  steps unless durably authorized: a stated recommendation on a “Von dir zu
  klären” card authorizes its decision, execution, and recorded closure (what,
  why, veto effect), except tags, publishes, force-pushes, user-data deletions,
  and unrecommended genuine choices. Report failures, skips, and verified
  outcomes faithfully.
- Keep comments brief and factual; mark placeholders. When design is unclear,
  do not guess: add `// OPEN: …` and report it at the run end.

## 7. Acceptance

### 7.1 Acceptance Criteria (POC target)

Each criterion keeps its number and title here; its condition and its evidence
live under the same number in `docs/acceptance-criteria-detail.md` and
`docs/acceptance-evidence.md`, and all affected copies change in one commit.

1. **Build/start.**
2. **Two perspectives.**
3. **World model.**
4. **Movement and time.**
5. **Port city.**
6. **Village and cultural contact.**
7. **Language and communication.**
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
- WebGPU is the everyday lane; LARGE adds the complete WebGL 2 regression lane.
  Every browser suite asserts the requested backend; touch/voice route to WebGL
  2. A WebGL-2-only defect may remain until the next LARGE. Full operation:
  `scripts/verify/README.md`.
- A red run closes only when its cause is fixed, charged to its owning point, or
  filed as a new point. A retry is SUSPECT and covers nothing.
- Dev-mode invariant assertions should turn every test and manual session into
  a detector. Fail soft for environment/staging transients and loud for product
  defects.
- **Before answering:** make the BOARD published/current/concise/single-topic
  with all decisions visible; keep the BATCH advancing within model/context/CI/
  branch/timestamp/retrospective rules; keep WORK ORDER order/spec/split/budgets
  valid; durably file each FINDING; and supply required render/mechanism PROOF.
  `ci-status-guard` covers every pushed ref, waiting for concluded green CI.
  The authoritative hook inventory is `.claude/settings.json`.
- Pre-action hooks are pointers: `board-first-guard` requires a current,
  published focus before the first mutation, `closing-guard` owns §9, and the
  versioned hooks installed by `npm install` own commit and push syntax.
- Before a governed action run `node scripts/guard-preflight.mjs --for <action>
  --session <id>`. Perform routine duties first and answer last.
- Screenshot metrics are not a golden-image shortcut until
  `scripts/picture-stability.mjs <suite>` reports STABLE; verdicts:
  `docs/picture-check-levers.md`.
- Fix deviations; never paper them over or report an unfulfilled criterion as
  fulfilled.

## 9. Closing the Run

Report fulfilled §7.1 criteria with screenshot evidence, collected
`// OPEN: …` items, simplifications, and placeholder values; add no silent
extension.

`scripts/closing-guard-core.mjs` `CLOSING_STEPS` is the authoritative ordered
sequence and `closing-guard` denies a tag or delivery-point tick until it is
complete. Drive it with `--status`, then
`--step <id> --evidence "<proof>"`.

Freeze code during closing: merge or park in-flight branches first, land no
agent work during the run, and resume only after it completes. Owner procedure:
`docs/batch-owner-runbook.md`.
