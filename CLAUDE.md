# CLAUDE.md — Build Order: POC "The Heart of Africa" (Modern Remake)

This binding file governs the agentic build: scope, stack, commands, acceptance,
and verification.

---

## 1. Goal of This Run

Build a runnable proof of concept of the modern remake that demonstrates the
core gameplay loop, not the complete game. `design.md` is authoritative for
the target state; this file governs how it is built and verified.

---

## 2. Scope Guardrails (binding)

- Single-player only: no multiplayer, netcode, roles, or synchronization.
- No onboarding, tutorial, guided introduction, or lowered entry barrier.
- Do not invent or reintroduce systems absent from `design.md`; record a
  missing design concept as an open item.
- Supply playable numeric values by educated guess under `design.md` §14,
  without overriding stated values. Put estimates, marked calibratable, in
  `src/config/balance.ts`, not throughout the code.
- Only §7 is in scope. Do not begin multiplayer, onboarding, full balance
  calibration, or anything else beyond it until §7.1 is fully met.

---

## 3. Tech Stack

- Vite; React + TypeScript; three.js; React Three Fiber; drei.
- **WebGPU primary, automatic WebGL 2 fallback.** Import from `three/webgpu`;
  use TSL rather than raw GLSL/WGSL; do not make game behavior Chrome-only.
  Show a localized, dismissible compatibility notice on fallback. Mechanics:
  `docs/render-architecture.md`.
- If WebGPU gets stuck during the run, fall back to plain WebGL and record an
  open item instead of blocking the run.
- **Journal read-aloud:** `kokoro-js` in a Web Worker; WebGPU on Chromium and
  WASM elsewhere; pre-warmed, lazy-loaded, absent from startup chunks, and
  currently English-only. Mechanics: `docs/tts-architecture.md`.
- Add no runtime dependency without necessity and justify each one in its
  commit.

---

## 4. Project Structure

`design.md` points to `docs/design-reference.md` for its extracted reference
sections. A requested design change updates `design.md`, this file where it
changes the build order, and the code together.

Organize game code by topic under `src/`; do not create a monolith.

---

## 5. Commands

```
npm install
npm run dev
npm run build
npm run preview
npm run test:unit
npm run test:small
npm run test:large
npm test
```

Choose Vitest-only, SMALL, or LARGE by the changed behavior; the closing always
runs LARGE. The tier map is `scripts/verify/tiers.mjs`.

Use Vitest (jsdom) for logic, state, and HUD behavior assertable without a
browser; use Playwright only for scene, geometry, CSS/layout, audio, screenshot,
and end-to-end behavior. Every feature adds a test on the right layer. Full
strategy and suite map: `scripts/verify/README.md`.

---

## 6. Working Method

- Work in small, self-contained commits.
- Each work-order point uses its own `feat/<point>-<slug>` branch from `main`.
  Commit atomically and push after every commit; report a failed push. The
  versioned commit hook owns rescue-commit syntax. Merge only when complete and
  test-green, with the rendered picture checked on both backends for a
  backend-sensitive change and one otherwise
  (`isBackendSensitivePath`). Re-test conflicts that touched code.
- **The merge ends the branch:** remove its local branch, remote branch, and
  worktree. `branch-hygiene-guard` is the backstop.
- Small cross-cutting bookkeeping may land on `main`; delegate larger
  mechanisms to an isolated worktree. `worktree-reminder` enforces isolation
  before an agent starts.
- `TASKS.md` is main-only: append there, tick only after merge, and move closed
  points verbatim to `docs/tasks-archive.md`. Consumers needing open and closed
  work use `scripts/tasks-source.mjs`.
- Land through `node scripts/land-point.mjs <N> --model <m>`; its gate is
  mandatory after every merge. Keep branches short and verify again after
  syncing substantial `main` changes. Owner operation:
  `docs/batch-owner-runbook.md`.
- A delegated author runs `node scripts/point-brief.mjs <N>`, may read named
  sections on demand, and escalates an ambiguous or insufficient brief instead
  of guessing. Regenerate a brief from an older revision.
- Delegated authors work on their own branch, test, commit, push, and do not
  merge. `commission-guard` owns pool capacity; dispatcher-only work is served
  to the owner from `docs/batch-owner-runbook.md`.
- The context fence remains preventive text, not a pointer: at its refusal mark
  do not begin agents, suites, points, or authoring; finish/reading/boundary
  remain allowed. It currently defaults to `observe` and refuses nothing until
  its arming point lands. Owner boundary, lease, claim, launcher, watcher, and
  in-flight adoption mechanics live in `docs/batch-owner-runbook.md`.
- **Model policy.** GPT-5.6 Sol authors difficult, complex, error-prone, and
  HIGH-criticality points; Opus 5 authors points whose verification is the work.
  Fable 5 is the escalation only after five unsuccessful review rounds. Review
  is cross-vendor and never by an author of the range: Sol reviews Claude work
  through `scripts/review-sol.mjs`, Claude reviews Sol work. Serving fallback
  is Opus 5 → Fable 5 → Opus 4.8; Sonnet, Haiku, and any other serving model
  pause the batch. Every commit names its author model in a
  `Co-Authored-By` trailer.
- **Four eyes has two modes.** A divergent stage runs blind-parallel from the
  same inputs, each model producing a complete result before either sees the
  other. A third model merges by meaning and counts every id through
  `scripts/blind-merge.mjs`. A convergent stage reviews one artefact after
  reading it before the author's rationale. Use cross-vendor pairs by default;
  record a same-model fallback as weaker and decorrelate its framing.
- All player-visible text comes from language files: English default, German
  available, both changed together, further languages requiring only a file.
  Code, identifiers, labels, comments, and filenames are English.
- Every journal text in both languages carries the `design.md` §15 emotional
  markup; display strips it and read-aloud turns it into prosody. Mechanics:
  `docs/tts-architecture.md`.
- Answer repository questions with small command output. A blocked action means
  find the project command; never route the user through manual container work.
- Act on settled judgment. Confirm before outward-facing or hard-to-reverse
  steps unless durably authorized. Report failures, skips, and verified outcomes
  faithfully.
- Keep comments brief and factual; mark placeholders. When design is unclear,
  do not guess: add `// OPEN: …` and report it at the run end.

---

## 7. Acceptance

### 7.1 Acceptance Criteria (POC target)

Each criterion keeps one acceptance condition here. Its complete requirements
and evidence live under the same number in
`docs/acceptance-criteria-detail.md` and `docs/acceptance-evidence.md`;
change all affected copies in one commit.

1. **Build/start.** Install, dev, and production build run without errors; the
   application loads without console errors.
   Detail: `docs/acceptance-criteria-detail.md` §1. Evidence: `docs/acceptance-evidence.md` §1.

2. **Two perspectives.** Bird's-eye travel and walkable first-person settlement
   views exist and switch through movement plus the SPACE use key.
   Detail: `docs/acceptance-criteria-detail.md` §2. Evidence: `docs/acceptance-evidence.md` §2.

3. **World model.** The fixed ~1890 geography, settlements, peoples, rivers,
   landmarks, discovery labels, and exploration map of §3, §4, §17.2, and §19.11 hold.
   Detail: `docs/acceptance-criteria-detail.md` §3. Evidence: `docs/acceptance-evidence.md` §3.

4. **Movement and time.** Travel advances the date and provisions and obeys
   `design.md` §11.1/§11.2 boundary, penalty, item, and collision rules.
   Detail: `docs/acceptance-criteria-detail.md` §4. Evidence: `docs/acceptance-evidence.md` §4.

5. **Port city.** Cairo is an enterable start with §9 trade and the §18 entry
   checkpoint.
   Detail: `docs/acceptance-criteria-detail.md` §5. Evidence: `docs/acceptance-evidence.md` §5.

6. **Village and cultural contact.** A village has a gift-gated chief hint and
   a barter-only trading post under `design.md` §§9/12.
   Detail: `docs/acceptance-criteria-detail.md` §6. Evidence: `docs/acceptance-evidence.md` §6.

7. **Language and communication.** The §13 direction, tonal speech, glossary,
   deciphering, and message-driven drummer rules hold.
   Detail: `docs/acceptance-criteria-detail.md` §7. Evidence: `docs/acceptance-evidence.md` §7.

8. **Chronicle/journal.** The §15 journal grows on events/hints and records each
   walkable place in its own ~1890 voice.
   Detail: `docs/acceptance-criteria-detail.md` §8. Evidence: `docs/acceptance-evidence.md` §8.

9. **Status bar.** The §17.1 localized date, resources, region, health, and
   affliction HUD holds without permanent coordinates or a hand slot.
   Detail: `docs/acceptance-criteria-detail.md` §9. Evidence: `docs/acceptance-evidence.md` §9.

10. **Goal scaffolding.** Several knowing-people hints triangulate a procedural
    tomb whose shovel dig triggers victory.
    Detail: `docs/acceptance-criteria-detail.md` §10. Evidence: `docs/acceptance-evidence.md` §10.

11. **Game graphics.** Presentation is appealing and elaborate at AAA level,
    with smooth continent and river geometry rather than the schematic look.
    Detail: `docs/acceptance-criteria-detail.md` §11. Evidence: `docs/acceptance-evidence.md` §11.

12. **Atmosphere.** The wildlife, climate, landscape, graphics, and
    elephant-graveyard atmosphere of §§2.4/4.4/19 holds.
    Detail: `docs/acceptance-criteria-detail.md` §12. Evidence: `docs/acceptance-evidence.md` §12.

13. **Real geodata.** §3.3 DEM relief, period vector water/coasts, and
    biome-based PBR terrain are implemented.
    Detail: `docs/acceptance-criteria-detail.md` §13. Evidence: `docs/acceptance-evidence.md` §13.

14. **Lighting and post-processing.** The §2.7 pipeline and water features hold,
    with shaders compiling off the startup critical path.
    Detail: `docs/acceptance-criteria-detail.md` §14. Evidence: `docs/acceptance-evidence.md` §14.

15. **Lively settlements.** Dense ports/villages follow §2.5, §2.6, §4.1, §4.5,
    and §19.10 scale, life, lanes, and period organizing principles.
    Detail: `docs/acceptance-criteria-detail.md` §15. Evidence: `docs/acceptance-evidence.md` §15.

16. **Settlement collision.** §2.6 swept/sliding collision, camera clearance,
    exact building bounds, and unstuck inhabitants hold.
    Detail: `docs/acceptance-criteria-detail.md` §16. Evidence: `docs/acceptance-evidence.md` §16.

17. **Localization.** The game is fully playable in English and German under
    §17.7, with all visible text in language files.
    Detail: `docs/acceptance-criteria-detail.md` §17. Evidence: `docs/acceptance-evidence.md` §17.

18. **Lint and dependency hygiene.** Lint has no findings and the audit has no
    unrecorded vulnerability after every change.
    Detail: `docs/acceptance-criteria-detail.md` §18. Evidence: `docs/acceptance-evidence.md` §18.

19. **Journal voice/read-aloud.** §§15.2–15.3/16.1 markup, stripped display,
    English Kokoro narration, and non-modal journal hold.
    Detail: `docs/acceptance-criteria-detail.md` §19. Evidence: `docs/acceptance-evidence.md` §19.

20. **Comfort and audio settings.** §§2.2/21 controls, audio, zoom, debug
    calibration, localization, and F6/F8/F9 shortcuts hold.
    Detail: `docs/acceptance-criteria-detail.md` §20. Evidence: `docs/acceptance-evidence.md` §20.

21. **Water realism.** §11.3 continuous rivers/lakes/waterfalls and §11.2
    downstream push without holding the traveller hold.
    Detail: `docs/acceptance-criteria-detail.md` §21. Evidence: `docs/acceptance-evidence.md` §21.

22. **Health and afflictions.** §6 health, starvation, afflictions, medicine,
    healing, regeneration, death report, and successor hold.
    Detail: `docs/acceptance-criteria-detail.md` §22. Evidence: `docs/acceptance-evidence.md` §22.

23. **Random events.** §14 travel rolls, protections/warnings, predator attack,
    and relaxed-preset default hold.
    Detail: `docs/acceptance-criteria-detail.md` §23. Evidence: `docs/acceptance-evidence.md` §23.

24. **Deadline and successor.** §§5/18 deadline, warnings, recall, and successor
    flow hold.
    Detail: `docs/acceptance-criteria-detail.md` §24. Evidence: `docs/acceptance-evidence.md` §24.

25. **Trade economy.** §§8–10 treasure, capacity, bazaar, ferry, bounties,
    sightings, and settlement goods hold.
    Detail: `docs/acceptance-criteria-detail.md` §25. Evidence: `docs/acceptance-evidence.md` §25.

26. **Standing with the natives.** §12 hostility, expulsion, honored-friend
    protections, robbery, and lasting consequences hold.
    Detail: `docs/acceptance-criteria-detail.md` §26. Evidence: `docs/acceptance-evidence.md` §26.

27. **Camps.** §6.3 open camps/looting and honored-friend village caches hold.
    Detail: `docs/acceptance-criteria-detail.md` §27. Evidence: `docs/acceptance-evidence.md` §27.

28. **Saving/loading.** §18 port snapshots and tabular load overview hold, with
    no manual saving.
    Detail: `docs/acceptance-criteria-detail.md` §28. Evidence: `docs/acceptance-evidence.md` §28.

29. **Animated handwriting.** §16.3 reveal, finish interaction, wounded hand,
    and newest-content scrolling hold.
    Detail: `docs/acceptance-criteria-detail.md` §29. Evidence: `docs/acceptance-evidence.md` §29.

30. **Gamepad and position query.** §17.5 gamepad/keyboard merging and localized
    P-key position toast hold.
    Detail: `docs/acceptance-criteria-detail.md` §30. Evidence: `docs/acceptance-evidence.md` §30.

31. **Orientation and panorama wildlife.** §17.3 gift-unlocked orientation and
    §2.5 grounded, forward-walking panorama silhouettes hold.
    Detail: `docs/acceptance-criteria-detail.md` §31. Evidence: `docs/acceptance-evidence.md` §31.

32. **Render pipeline upgrades.** Backend-neutral TRAA remains default, SSR
    remains removed by user decision, and true refraction remains open.
    Detail: `docs/acceptance-criteria-detail.md` §32. Evidence: `docs/acceptance-evidence.md` §32.

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
- **Stop-family preventive rules stay here because they fire at turn end.**
  Before answering, make the BOARD published/current/concise/single-topic with
  all decisions visible; keep the BATCH advancing within model/context/CI/
  branch/timestamp/retrospective rules; keep WORK ORDER order/spec/split/budgets
  valid; durably file each FINDING; and supply required render/mechanism PROOF.
  `ci-status-guard` covers every pushed ref, waiting for concluded green CI.
  The authoritative hook inventory is `.claude/settings.json`.
- Pre-action hooks may be pointers: `board-first-guard` requires a current,
  published focus before the first mutation; `closing-guard` owns §9; the
  versioned hooks installed by `npm install` own commit and push syntax.
- Before a governed action run `node scripts/guard-preflight.mjs --for <action>
  --session <id>`. Perform routine duties first and answer last.
- Screenshot metrics are not a golden-image shortcut until
  `scripts/picture-stability.mjs <suite>` reports STABLE; verdicts:
  `docs/picture-check-levers.md`.
- Fix deviations; never paper them over or report an unfulfilled criterion as
  fulfilled.

---

## 9. Closing the Run

Report fulfilled §7.1 criteria with screenshot evidence, collected
`// OPEN: …` items, simplifications, and placeholder values; add no silent
extension.

`scripts/closing-guard-core.mjs` `CLOSING_STEPS` is the authoritative ordered
sequence and `closing-guard` denies a tag or delivery-point tick until it is
complete. Drive it with `--status`, then
`--step <id> --evidence "<proof>"`.

Confirm `docs/graphics-detail-levels.md` still matches `QUALITY_PRESETS`; the
unit test proves it and the closing deliberately names it.

Freeze code during closing: merge or park in-flight branches first, land no
agent work during the run, and resume only after it completes. Owner procedure:
`docs/batch-owner-runbook.md`.
