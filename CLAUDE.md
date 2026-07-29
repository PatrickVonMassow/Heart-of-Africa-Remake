# CLAUDE.md — Build Order: POC "The Heart of Africa" (Modern Remake)

This file governs the agentic build. It contains the tech stack, commands,
scope guardrails, acceptance criteria and the self-verification procedure.
It is binding.

---

## 1. Goal of This Run

A runnable **proof of concept** of the modern remake. The POC must
demonstrate the game's core gameplay loop, not deliver the complete game.

`design.md` in the project root is authoritative for all design questions.
`design.md` is the sole source of the target state. If this file and
`design.md` contradict each other: `design.md` determines the *what* (game
content), this file determines the *how* (build, stack, POC scope). Design
content is referenced here, not duplicated.

---

## 2. Scope Guardrails (binding)

- **Single-player.** No multiplayer, no netcode, no roles, no
  synchronization. Should multiplayer concepts appear in prompts or
  elsewhere, they are not to be implemented.
- **No onboarding system.** No tutorial layer, no lowering of the entry
  barrier, no guided introduction. The language/direction system remains an
  in-game mechanic as specified in `design.md`.
- **No reintroduction of previously removed systems.** No multiplayer or
  onboarding building blocks, no design extensions beyond `design.md`. If a
  *design* concept is missing, it is not to be invented but flagged as an
  open item.
- **Balance values by educated guess.** Concrete numeric values (prices,
  provision/consumption rates, event probabilities, speed factors) are
  required for a playable result and are calibrated freely per `design.md`
  §14. If a value is missing from `design.md`, a justified starting value
  must be set. Rules:
  - Values that `design.md` states concretely (e.g. starting money $250,
    start in Cairo / 1890) must not be overridden.
  - All estimated values are bundled centrally in one place (e.g.
    `src/config/balance.ts`), not scattered across the code, and commented
    as calibratable.
  - Each of these values must be adjustable at runtime via the debug menu
    (`design.md` §21), as far as the respective system exists in the POC.
    The debug menu is the intended fine-tuning tool.
- **POC scope.** Only the acceptance criteria listed under §7 are the
  target. Everything beyond them is explicitly outside this run (§8).

---

## 3. Tech Stack

- Vite (build tool, dev server)
- React + TypeScript
- three.js
- @react-three/fiber
- @react-three/drei

**Renderer: WebGPU primary, automatic WebGL 2 fallback.** The goal is to use
modern hardware; the project targets current browsers and benefits from
WebGPU. Requirements:

- Import from `three/webgpu`; in R3F v9 create the renderer via the async
  `gl` prop factory and await `renderer.init()`. The WebGPURenderer falls
  back to WebGL 2 automatically when WebGPU is unavailable; this fallback is
  the defined escape hatch, not a rebuild. When it happens, a dismissible
  in-game notice tells the player the game is running in WebGL 2
  compatibility mode (localized like all player-visible text).
- Shaders in TSL (Three Shading Language), not raw GLSL or WGSL. TSL
  compiles renderer-agnostically for both backends and avoids a second code
  path.
- No Chrome-only code. If the WebGPU path gets stuck during the run, fall
  back to plain WebGL and record that as an open item instead of blocking
  the run.

**Journal read-aloud: kokoro-js.** The journal's speech output (design.md
§15) uses the Kokoro TTS model via the `kokoro-js` package, fully
in-browser. The model runs in a Web Worker (`src/journal/ttsWorker.ts`) so
synthesis never blocks the game loop — the main thread only posts a text
segment and plays back the returned PCM. The engine runs the onnxruntime
WebGPU compute path (fp32, distinct from the three.js renderer's WebGPU) on
Chromium and the WASM path (q8) everywhere else — the device is decided on
the main thread and passed to the worker. WebGPU is chosen because it
synthesizes FASTER THAN REALTIME, giving a fast, gapless read-aloud (user
decision, point 117). Its one cost is the cold model load, whose onnxruntime
init briefly saturates the GPU process (~15 s, no frames): the game
therefore PRE-WARMS the model at start (`warmupSpeech`, ~1.2 s after mount)
so that one stall happens up front rather than at the first narration. The
WASM fallback never touches the GPU process and keeps the game rendering
through its cold load; the headless verification forces WASM (no WebGPU
adapter) via the `window.__ttsForceWasm` dev hook, and `scripts/verify/
voice.mjs` gates that fallback path's liveness with an rAF probe. (History:
point 100 had made the engine WASM-only to avoid the WebGPU cold-load
freeze; point 117 reversed that on the user's decision — the smooth WebGPU
voice is worth the one-time, front-loaded stall.) The model weights are
streamed from the Hugging Face CDN on first use and cached by the browser;
they are not part of the repository or the bundle. The TTS stack (worker
included) is loaded lazily and must never enter the eagerly loaded startup
chunks. Kokoro has no German voice, so read-aloud is English-only for now
(open item for German); the voice markup is written for both languages
regardless.

No additional runtime dependencies without necessity. Every added dependency
must be justified in its commit.

---

## 4. Project Structure

```
project-root/
├── CLAUDE.md          (this file)
├── design.md          (target state; §19.14/§19.15/§21.2 → docs/design-reference.md)
├── package.json
├── index.html
├── vite.config.ts
├── public/
└── src/
    ├── App.tsx        (entry; renderer setup, scene switch, HUD)
    ├── main.tsx
    └── ...            (game code goes here)
```

`design.md` is never modified unilaterally. When the user requests a change,
however, `design.md` and this file are updated along with the code — wherever
the change touches design content or the build order — so both documents
always describe the current target state. `node_modules/` stays out of
version control (the Vite `.gitignore` covers this).

Game code is organized by topic (e.g. `src/world/`, `src/scenes/travel/`,
`src/scenes/place/`, `src/journal/`, `src/systems/`, `src/render/`,
`src/state/`, `src/i18n/`, `src/config/`, `src/ui/`). No monolith file.

---

## 5. Commands

```
npm install            # dependencies
npm run dev            # dev server (usually http://localhost:5173)
npm run build          # production build (must pass without errors)
npm run preview        # check the production build locally
npm run test:unit      # fast Vitest layer (jsdom): logic, store, HUD components
npm run test:small     # build + lint + vitest, then the SMALL everyday browser gate
npm run test:large     # full regression (build + lint + vitest + EVERY browser suite + preview)
npm test               # == test:large (the full LARGE regression)
```

The browser regression splits into two tiers (§7.2 / point 173): a
SMALL everyday gate (`npm run test:small` — the fast, low-flake core suites) and
the LARGE set (`npm test` / `npm run test:large` — every suite plus the prod
preview). Per change, pick Vitest-only / Vitest+SMALL / Vitest+LARGE at your
discretion; the **closing cycle (§7.2) always runs Vitest+LARGE**. The suite→tier
map lives in `scripts/verify/run-all.mjs` and `scripts/verify/README.md`.

The TypeScript build must pass without errors. `npm run build` is part of
acceptance (§7).

**Test architecture (hybrid).** The regression is split so the bulk runs in
seconds and cannot flicker on browser timing: a fast, deterministic **Vitest**
layer (jsdom, no browser) in `src/**/*.test.ts[x]` covers all pure logic, store
transitions and HTML-HUD component classes/text; the **Playwright** scripts in
`scripts/verify/*.mjs` keep only what genuinely needs a real browser (the
three.js scene + RAF wildlife, real layout geometry, canvas/WebGL init,
pointer-lock, TTS audio, the §7.2 acceptance screenshots and one end-to-end core
flow). **Every future feature must add a test on the appropriate layer(s)** —
prefer Vitest for anything assertable without a browser; use Playwright only for
the scene/geometry/CSS/audio/screenshot cases. The full strategy and the
old→new coverage map live in `scripts/verify/README.md`.

---

## 6. Working Method

- Work incrementally: small, topically well-scoped commits, one self-contained
  unit each. Prerequisite is an initialized git repository with an initial
  commit of the scaffold, `design.md` and `CLAUDE.md`; if none exists, run
  `git init` first and create that initial commit.
- **Feature-branch workflow (user decision 22.07.2026).** Each TASKS point is
  developed on its OWN feature branch (`feat/<point>-<slug>`), branched from
  `main`. Commit atomically AND immediately push the BRANCH after every commit
  (durability — nothing stays only local, nothing is lost if a session dies;
  a failed push is reported, never skipped silently). A RESCUE commit — work
  committed because a session or agent was killed mid-build — carries
  `[skip ci]` in its SUBJECT plus a `Rescue: <what was interrupted>` trailer
  (user 28.07.2026): it is no claim of completeness, and a red CI run on such a
  branch state MAILS the repository owner. Durability is untouched — the commit
  still exists and still pushes; only the run is skipped, and the NEXT commit,
  the one that finishes the work, runs CI normally. The `commit-msg` hook
  refuses each half without the other. Merge to `main` ONLY when
  the point is COMPLETE and verified — tests green on both layers AND, for a
  render/GUI change, the rendered picture checked: on BOTH backends where the
  change can render differently on each, and on ONE where it cannot — a DOM-only
  change under `src/ui/` draws identically whichever renderer holds the canvas,
  so the second inspection buys nothing (user 26.07.2026; the classification is
  `isBackendSensitivePath` in `scripts/render-verify-core.mjs`, and the guard
  demands accordingly). On merge,
  resolve any conflict CAREFULLY so nothing breaks, and RE-TEST (re-run the
  relevant regression) whenever a conflict touched real code. `main` therefore
  always reflects finished, verified work — it is the deployed branch (the
  GH-Pages root builds from `main`; the `/poc/` deploy builds from the immutable
  `poc` TAG, not from main). CROSS-CUTTING changes that
  are not a single feature — guards, docs, the progress dashboard, workflow/
  process files — are committed directly to `main` (a feature branch for each
  would be needless ceremony). Use worktree isolation for parallel file-mutating
  agents so their branches never collide in one tree.
- **Feature-branch process rules (bind the workflow; verified against the
  automation 22.07.2026).**
  - `TASKS.md` is **main-only**. Feature branches NEVER edit it. New points are
    appended on `main`; the `[ ]→[x]` tick happens on `main` at (or immediately
    after) the merge — never on the branch. This keeps the working-tree TASKS.md
    the guards/dashboard/resume-hook read consistent with the dashboard on every
    branch, and avoids TASKS.md merge conflicts on every point.
  - **The work order is split (user 26.07.2026).** `TASKS.md` carries the OPEN
    points plus its framing sections; a point that is ticked MOVES, verbatim and
    with its number, into `docs/tasks-archive.md`. The reason is cost: three
    quarters of the file were finished work that every turn carried along.
    Consumers that only ask "what is still to do" read `TASKS.md`; the ones that
    must recognise a point as CLOSED read both through `scripts/tasks-source.mjs`
    (`readTasksAll`). The split is enforced by `tasks-archive-guard` — a tick left
    in place, an open point stranded in the archive, or a point present in both
    files blocks the turn end.
  - After EVERY merge to `main` — conflict or not — run the fast gate
    (`npm run test:unit` + build + lint) before moving on; two points that
    auto-merge cleanly can still break together. On a conflict that touched real
    code, additionally re-run the relevant browser regression.
  - Keep branches SHORT. If `main` moved substantially, merge `main` INTO the
    branch before the final verify, and run that verify on the synced state, so
    what is verified is what lands.
  - **Release/tag mechanism (binding, user decision 24.07.2026).** Creating a
    version tag (`vX.Y`) is a delivery, and every delivery obeys the same rules:
    1. **Full closing run FIRST.** The complete closing cycle (§7.2 / Maximum-QA
       Phase 8 — LARGE regression on BOTH backends, flake-free) must be green on
       the exact commit to be tagged. No tag on an unclosed state.
    2. **User approval FIRST.** Tagging/publishing is outward-facing — it happens
       ONLY after the user's explicit go for that specific tag (per
       `tags-only-on-request`). "The current state is fine, you may tag" is such a
       go.
    3. **`poc` mirrors the newest version tag.** On every new `vX.Y` tag, MOVE the
       `poc` tag to the SAME commit, so `poc` is always identical to the newest
       version, playable at `…/Heart-of-Africa-Remake/poc/`. Both `/vX.Y/` and
       `/poc/` are served (the deploy workflow enumerates every `v*` tag + `poc`
       dynamically — no workflow edit per release).
    4. The `/poc/` (and `/vX.Y/`) rebuild does NOT trigger on a tag push — after
       moving/creating the tags, run the deploy via `workflow_dispatch` (or ensure
       a `main` push lands AFTER the tag moves), else the deploy builds the old
       tag. Then VERIFY the `/poc/` and `/vX.Y/` URLs serve the new state.
  - **User-facing judgment is always against DEPLOYED `main`, never a branch.**
    The user tests only the GH-Pages URL (which serves `main`) — never a feature
    branch, never a local checkout. So a render/GUI fix that needs the user's
    AESTHETIC sign-off ("is it bright/smooth/right ENOUGH?") is MERGED to `main`
    as soon as it is test-green AND I have verified on BOTH backends that it is a
    correct improvement (not broken/worse); completeness = my verification, the
    user's aesthetic "good enough?" is a SEPARATE follow-up asked against the
    deployed result. A "Von dir zu klären" render card must therefore point at
    the deployed `main` state — never ask the user to judge unmerged branch work.
    (If a change genuinely needs the user's eyes BEFORE it is safe to land, that
    is the rare exception: set up a branch-preview deploy rather than merge
    unverified.)
- **Maximal delegation (user decision 22.07.2026, permanent process).** The main
  session delegates the MAXIMUM to subagents so as little as possible bottlenecks
  at it. Each open TASKS point is implemented by a WORKTREE-ISOLATED subagent on
  its own `feat/<point>-<slug>` branch (gates green, branch pushed, NOT merged by
  the agent — the main session merges); a POOL of such agents runs in PARALLEL on
  NON-OVERLAPPING files. Infra, guard, doc and dashboard-restructure work too.
  What stays at the main session: the picture-verification on BOTH backends, the
  serial merge → fast-gate → tick → deploy → cleanup, and the Artifact publish
  (URL-bound).
- **Delegation brief instead of a reading assignment (point 365).** A delegated
  agent receives its point as a BRIEF: `node scripts/point-brief.mjs <N>` prints
  the spec verbatim, the design.md sections it cites, one identifying line per
  cross-referenced point, and a REFERENCE MAP naming where every `§` resolved.
  Measured, that is ~1.8k tokens median against ~108k for reading TASKS.md and
  design.md whole — and it does not grow with the queue, because the parsing
  happens in a subprocess. The prompt carries the brief and forbids wholesale
  reads; a NAMED section may be read on demand, and an insufficient brief is
  ESCALATED, not guessed around. The brief FAILS LOUDLY on a reference that
  resolves nowhere, and where one section number exists in two documents it
  prints BOTH — no resolver can decide that, so the reader is told. Every brief
  carries the revision it was cut from; regenerate rather than reuse an old one.
- **Context boundary at a point boundary (users 27./28.07.2026).** 87–94 % of
  the spend sat above 150k context — one session carried point after
  point. A batch session ENDS at its boundary, and the boundary is
  TAKEN: after merge and tick run `node scripts/batch-boundary.mjs
  <point>` and stop. `batch-progress-guard` BLOCKS a stop that closed a point
  without that marker, allows one only against the work order and an armed
  `HoA-Batch-Autostart`, then marks the lock HANDED OVER so the launcher spawns
  the successor — five hours were lost to a session that stopped holding it.
  Attended, ask for `/clear`. The "cheaper model" idea stays REJECTED.
  THE WAY BACK (28.07.2026): a returning window runs `node
  scripts/batch-claim.mjs --session <id>` (the stand-down prints it filled in);
  the owner sees it at its next hook, finishes — never mid-merge, never with an
  agent or a verification running — releases, and the same command takes it. A
  claim expires, a dead claimant's is ignored, one session ever wins.
  A MESSAGE WAKES IT TOO (29.07.2026): `scripts/chat-watcher.mjs` subscribes to
  the chat inbox and spawns a light responder — only with no live owner and no
  honoured claim, under a bounded claim and the launcher's own stops; the
  launcher tick supervises it.
- **Model policy (user decision 25.07.2026, points 309 + the role revision).**
  ONLY three models may author work on this project, each with its own role:
  **Opus 5** is the WORKER at any difficulty; **Fable 5** is used ONLY for the
  four-eyes principle (one model plans and/or builds, the other reviews) or as
  the first fallback; **Opus 4.8** is the last fallback. The fallback chain is
  Opus 5 → Fable 5 → Opus 4.8, and `scripts/batch-autostart.mjs` launches
  accordingly. DIFFICULTY IS NOT A REASON to hand work to Fable — since version 5
  Opus is equally capable there, and a second model's value lies in its different
  blind spots, which only a REVIEW realises. Sonnet and Haiku are NOT acceptable,
  and a session silently degraded to one is a capability breach: the batch STOPS
  rather than runs on it. Every commit records its author model in the `Co-Authored-By`
  trailer, so the rule is machine-checkable; `scripts/model-guard-core.mjs`
  holds the allowlist (`ALLOWED`) and the Stop hook
  `scripts/model-guard.mjs` blocks the turn end on any commit after its
  baseline authored outside it. (History: on 24.07.2026 a session degraded
  to Haiku 4.5 unnoticed and merged three defective deliveries in 14
  minutes; no config review could have caught it live, the commit trailers
  could.)
- **Language.** All player-visible text (UI, chronicle, messages) is served
  from the language files (`design.md` §17): English is the default game
  language, German is available, and the structure must make further
  languages easy to add. **Every future addition or change to game text must
  always be made for both languages (German and English).** English texts
  are written for their context, not as literal translations. Code is
  English throughout: all identifiers (variables, functions, types, file and
  directory names), all constant/label values, and all comments are English.
  The only exception is the translated string values inside the language
  files themselves.
- **Voice markup.** Every journal text — existing and future, in both
  languages — is written with the emotional voice markup of `design.md`
  §15 (`[awe]`, `[whisper]`, `[excited]`, `[somber]`, `[weary]`, `[fear]`,
  `[emph]`, `[mute]`, `[pause]`, `[breath]`). The tags are additive:
  stripping them must leave well-formed prose. Display always strips the
  markup; the read-aloud pipeline (parser → TTS text → worker synthesis →
  audio, `src/journal/voiceMarkup.ts` → `src/journal/speech.ts` →
  `src/journal/ttsWorker.ts`) turns it into
  prosody. This rule applies to German too, even while no German TTS voice
  exists yet.
- **Let a subprocess answer, never the context (point 365, generalised).** A question
  about the repository is answered by a command whose OUTPUT is small — a count, a
  section, a brief — never by lifting a whole file into a context. The brief is this
  rule applied to work orders.
- Keep comments brief and factual. Mark placeholder values as such.
- After each major system, run the self-verification (§7.2) and record the
  result.
- When the design is unclear, do not guess: leave an open item in the code
  (`// OPEN: …`) and in a list at the end of the run.

---

## 7. Acceptance

### 7.1 Acceptance Criteria (POC target)

The POC counts as fulfilled when all points verifiably hold. The design
content itself lives in `design.md` (referenced by section, not repeated
here); each point states the acceptance condition it must meet.

**The evidence chains live in `docs/acceptance-evidence.md`** (user 26.07.2026),
under the SAME numbers: which test, which file, which screenshot proves each
criterion. They were moved verbatim, not rewritten — this file is loaded at
every session start and those chains were the larger half of it, while they are
needed at the closing and at a tag. A criterion here therefore states WHAT must
hold and points at its proof; when a criterion changes, its evidence section
changes with it in the same commit.

1. **Build/start.** `npm install`, `npm run dev` and `npm run build` run
   without errors. The application loads without console errors.
2. **Two perspectives.** Bird's-eye view (3D travel across the continent)
   and first-person view (walkable settlement) exist; switching between
   them is movement-based, confirmed with the SPACE use key, per `design.md`
   §2.3. In particular: functional buildings are entered with the SPACE use
   key while standing at their door (door proximity shows the prompt and arms
   the key — merely walking into the door no longer enters), and the elder is
   addressed with the same use key. Settlement entry from the bird's-eye view
   is likewise movement-based but confirmed with SPACE: within the enter
   radius the localized hint "Space to enter <name>" shows (the map name-label
   hidden while it does) and a SPACE press enters; reaching the radius alone
   never enters. The hint honours the §17.2 discovery gate (point 287): an
   UNDISCOVERED settlement's name stays hidden — the hint reads its localized
   KIND placeholder ("Unknown village", matching its map label; point 318) until
   the place is discovered, while a known-from-start port always names itself. The accidental-entry debounce/clearance is removed (no
   just-left re-entry lock, no move-clear timing). A SPACE press while the
   traveller is on a water cell still does not enter, so a river passage never
   pulls him in. Entering focuses the controls without an extra click per
   `design.md` §17.5 (HUD buttons blurred; mouse-look engages on entry from
   the SPACE keypress, with the click as fallback).
   Evidence: docs/acceptance-evidence.md §2.

3. **World model.** The fixed, authentic ~1890 geography of `design.md`
   §3.1/§3.2 — researched against the real end-of-19th-century state —
   with all 10 port cities, 22 peoples, 17 rivers and every landmark of
   §4, graphically elaborate with fine-grained land outlines and river
   courses. Region borders carry the localized region name on each side of
   the line in both views (§3.2); map-point labels are discovery-gated
   (§17.2) EXCEPT the known-from-start places of §17.2 — the ten port
   cities and the Giza monument site (point 273) — which show their names
   from the outset (never a kind placeholder), a legacy save migrating
   to mark them discovered (§3.2/§17.2, point 288); coordinates are read
   out on demand via the position query
   (§3.2, pt. 30), never shown permanently. The exploration map is
   implemented per §19.11 (an engraved ~1890 atlas plate on worn paper —
   graticule, blue water ink, hachures, each region named once in spaced
   capitals — under a fog of war that each explored area clears a window
   through). Every village
   keeps the small minimum river-water clearance of §4.2 (its footprint
   never reaches into a river) — the clearances SCALE with the
   calibratable river width (point 156): ports stay AT the river per the
   §4.2 exemption but their rendered cluster clears the band by its own
   smaller footprint margin, and every landmark (cultural fields, natural
   sites except the flooding Okavango, the elephant graveyard) auto-clears
   at build time by its field radius — Khartoum at the widened confluence
   and the Sudd were the reported cases (`src/world/world.test.ts` sweeps
   all of them; screenshots 126/127).
   Evidence: docs/acceptance-evidence.md §3.

4. **Movement and time.** The character moves in the bird's-eye view; date
   and provisions advance with the journey (calendar display, start 1890) —
   in the relaxed exploration preset (`design.md` §6.1) the provision and
   canteen drain RATES default to zero, so the date advances while stocks
   drain only once a non-zero rate is set in the debug menu.
   The movement boundary, Red Sea cut, Mediterranean always-blocked rule
   and world trim of `design.md` §11.2/§3.1 hold. So do the ropeless
   mountain climb with its warning and fall risk (§7/§11), the visible
   movement-penalty reason incl. the canoe-on-land penalty and its
   once-per-type journal announcement (§11.1, both languages, voice
   markup, flag in the checkpoint), possession-based item effects incl.
   the canoe ride/drag depiction (§6.1/§7), and the bird's-eye collision
   with trees and animals (§11/§19 — a fast step is caught at the near
   edge with no tunnelling; small dressing and carcasses stay passable —
   only the large solid dressing collides. EVERY collider here is DERIVED
   from the placement the renderer DRAWS — the plant's `placedFloraAt`, the
   animal's own instance matrix, never its behaviour spot, which the render
   offsets leave a body-width or more away — so nothing unrendered leaves a
   phantom collider, points 129/378).
   Evidence: docs/acceptance-evidence.md §4.

5. **Port city.** At least Cairo as the enterable starting port with trade
   (buying equipment, provisions and gifts for `$`). Entering triggers the
   automatic checkpoint (`design.md` §18; simplified saving is
   sufficient). Buy AND sell dialogs (shop buy-back, bazaar buy/sell,
   ferry) use the same aligned price-table layout and buy gear back for the
   local currency per §9.
   Evidence: docs/acceptance-evidence.md §5.

6. **Village and cultural contact.** At least one enterable village with a
   chief's hut; a culturally correct gift is the condition for a hint —
   not mere observation (`design.md` §12). The village trading post
   barters the baseline goods for gifts and buys gear back for gifts —
   money has no value there (§9).
   Evidence: docs/acceptance-evidence.md §6.

7. **Language/direction system.** The full system of `design.md` §13 is
   implemented: the regional direction systems and glossary names of
   §13.2, taught by the village elder (a second talk reveals what the
   region reveres, §8); hints combine landmark, direction word and
   coordinate (§13.1); a raw hint deciphers retroactively in either order
   (§13.2).
   OPEN (`design.md` §13.4): this criterion pins what is BUILT, not the
   target state. Understanding the inhabitants is to become a central
   mechanic — learned by observing and testing rather than handed over by
   an elder, with one invented-but-researched language per region (a
   Chants-of-Sennaar-like direction; e.g. a West African drum-signal
   tongue). The mechanic is undecided and needs its own research pass
   first, so §13.2's glossary and §13.3's delivery are placeholders under
   review. Do not build on them — and do not PROTECT them either: until
   the new mechanic is settled, disturbing this system is not a reason to
   compromise a change elsewhere. Once it IS settled and built, it becomes
   load-bearing like any other system.
   Evidence: docs/acceptance-evidence.md §7.

8. **Chronicle/journal.** A journal exists, grows automatically on events
   and stores hints (`design.md` §15); plain text suffices here (the
   animated handwriting is pt. 29). First village visits are journaled
   through that people's own ~1890 vignette (§16), never a shared
   boilerplate.
   Evidence: docs/acceptance-evidence.md §8.

9. **Status bar.** Date, funds, provisions, gifts and current region are
   displayed per `design.md` §17.1 — no hand-item slot, no permanent
   coordinates (removed on user request); transient status hints (e.g.
   the movement-penalty reason, pt. 4) render CENTRED inside the status
   bar itself, not in a separate floating panel; each stat is led by its
   symbol with the localized word as tooltip and the date reads
   DD.MM.YYYY; the inventory item currently in use glows, and the health
   bar with its affliction badges sits inside the bar's right end per
   §17.1 (never covered by the journal).
   Evidence: docs/acceptance-evidence.md §9.

10. **Goal scaffolding.** A procedurally placed goal (the tomb) exists;
    digging it up with the shovel at the site triggers the victory state.
    The site is triangulated from several hints via the knowing-people
    cascade of `design.md` §13.3.
   Evidence: docs/acceptance-evidence.md §10.

11. **Game graphics.** The visual presentation must be appealing and
    elaborate at AAA level and replace the POC's former schematic look.
    This includes smoothing the geometry of the continent and the rivers,
    which previously showed visible steps.
12. **Atmosphere.** The atmosphere elements of `design.md` §19 are
    implemented — the ambient wildlife of §19.2–§19.8 (streaming and
    carcass discipline, the predator hunt with its food webs and feeding,
    elephant herds and trampling, movement discipline and body separation
    incl. the open-ocean backstop, vultures, shore and grazing life, and
    the herds' family life with calf predation and water drama), the
    climate and landscape dressing of §19.9, the "Graphics and atmosphere"
    section (§2.4), and the elephant-graveyard dressing of §4.4 (readable
    at a glance).
   SUPERSEDED AS A TARGET (user 25.07.2026, design.md §19.5): water is for
   crossing, not for lingering — a FLIGHT is never restricted by river or lake at
   all, and the §19.5 revision states it. What the evidence section pins is what
   is BUILT today, per the §7.1 convention.
   OPEN: tree-climbing-to-flee (§9 open item), and the one seasonal-dress reading
   the research allows but the figures cannot yet show — a wrap worn DIFFERENTLY
   in the cold rather than in greater number (§19.13).
   Evidence: docs/acceptance-evidence.md §12.

13. **Real geodata.** The real-geodata terrain rendering of `design.md`
    §3.3 is implemented (DEM relief, ~1890 vector coasts/rivers/lakes
    without raster steps, biome-based PBR splatting, domain-warped
    meandering biome borders).
   Evidence: docs/acceptance-evidence.md §13.

14. **Lighting and post-processing pipeline.** The pipeline of `design.md`
    §2.7 is implemented (IBL, physically grounded sky consistent with the
    sun, cascaded shadows in the bird's-eye view, screen-space AO, bloom,
    filmic tone mapping with color grading and a subtle vignette, and the
    water feature set: wave field, depth-dependent absorption over real
    bathymetry, shore/crest foam). Its shader programs build OFF the startup
    critical path: the first frames draw the ready set and the rest links
    behind them, so the loading picture stands still no longer than the
    calibratable `balance.startup.pictureFreezeBudgetMs`, which counts the
    WHOLE standstill — a renderer busy inside one long frame included.
   Evidence: docs/acceptance-evidence.md §14.


15. **Lively, densely built settlements.** `design.md` §2.6 (dense
    non-functional building fabric, a recognizable path network,
    surface micro-structure at eye height — ground grain/pebble relief,
    structured and weathered building materials — inhabitants who
    believably use the settlement and their homes, clearly
    highlighted functional buildings), §4.1 (settlement size mirrors real
    ~1890 importance; enlarged ports outscale villages), §19.10 (the
    village life vignettes) and §2.5 (the surroundings panorama of the
    real map landscape, its relief capped, double-sided and rock-shaded)
    are implemented, as is the §2.6 street rule: ports grow an organic lane
    network (winding alleys, small irregular squares — no grid) whose
    buildings front their lane with the door side, while every village
    follows its people's period-accurate ~1890 organising principle
    (design.md §4.5: ring/street/compound/scatter/ksar/riverstrip/coastrow).
   Evidence: docs/acceptance-evidence.md §15.

16. **Collision inside settlements.** The collision rules of `design.md`
    §2.6 are implemented (impenetrable buildings and solid objects,
    sliding movement, inhabitants never permanently stuck, reachable
    accesses and exits, inhabitants entering dwellings through their door
    while the player cannot, and every door oriented onto reachable free
    ground). Rectangular buildings collide as oriented boxes (exact
    corners, no gaps), and the clearance keeps the camera's near plane out
    of every wall — pressing against a building must never show its
    inside. No inhabitant spawns or walks into a pocket it cannot leave
    (point 155): every walker errand target is validated to have a clear
    standing circle AND an open escape direction against the FULL collider
    set (stall boards, rocks and props included, not only buildings) and
    nudged to the nearest free spot otherwise, and a walker physically
    pinned past a calibratable window (`balance.walkerUnstuckSeconds`,
    debug-editable) is teleport-nudged to free ground — inhabitants only, a
    small invisible correction, never the player.
   Evidence: docs/acceptance-evidence.md §16.

17. **Localization.** The game is fully playable in English as well as
    German per `design.md` §17.7 (all player-visible text from the
    language files, runtime language switch defaulting to English,
    language-neutral journal storage re-rendered on switch, localized
    proper names; another language must require only a new language
    file).
   Evidence: docs/acceptance-evidence.md §17.

18. **Lint and dependency hygiene.** The codebase is free of linter
    findings and known vulnerabilities: `npm run lint` (oxlint) reports
    zero errors and zero warnings, and `npm audit` reports zero
    vulnerabilities (CVEs) in the dependency tree. This holds not only at
    acceptance but after **every** change; both checks are part of the
    self-verification (§7.2). If a vulnerability has no upstream fix, it
    is recorded as an open item with its advisory ID instead of being
    ignored silently — the audit gate is `scripts/audit-check.mjs` (used by
    CI and the self-verification), which fails on any NEW advisory but
    tolerates the recorded, unfixable ones listed in its `ALLOW` map with a
    written justification. Currently accepted: GHSA-f88m-g3jw-g9cj (sharp/
    libvips, high, no upstream fix) — a transitive Node dependency of
    kokoro-js that is NOT in the browser bundle, so it is not exploitable in
    the shipped game.
19. **Journal voice markup and read-aloud.** The voice markup and
    read-aloud of `design.md` §15.2/§15.3 hold: every journal text in both
    language files carries the markers, the UI never shows one, English
    entries narrate via the in-browser Kokoro TTS with the markup shaping
    the delivery, a new entry auto-narrates without a click, and narration
    blocked by the autoplay policy is deferred to the first gesture
    instead of dropped. The journal is non-modal per §16.1 (movement
    continues, only modal dialogs block; entering a building with SPACE at its
    door works with the journal open), and the panel ends above the camp/map/journal toggles
    per §17.4. German read-aloud stays an open item until a German-capable
    voice exists.
   Evidence: docs/acceptance-evidence.md §19.

20. **Comfort and audio settings.** The control/audio calibration holds:
    mouse-look sensitivity defaults to 0.0011 rad/px, walk speed inside
    settlements to 10 m/s, strafing and walking backward to 80 % of the
    forward speed (a diagonal is never faster than straight; `design.md`
    §2.2), the first-person eye height is 1.5 m, a single ambience volume
    (default 0.1) scales the whole soundscape incl. the §19.1 proximity
    calls (a nearby animal's own call rises and fades with distance); the
    ocean surf is COASTAL (point 153): its gain fades with the distance to
    the nearest coast — full within a calibratable near radius, exactly 0 at
    and beyond a calibratable cutoff (`balance.surf.nearRadius`/`cutoff`) —
    so it is heard at the sea and in seaside ports but silent inland, and
    per-source volume sliders sit over the master volume (at least
    `balance.birdsongVolume` for the birdsong), all debug-editable; the
    overland travel speed defaults to 5.6 (calibrated calm), and the
    terrain relief items are tunable as factors (§11/§21.2). All of these
    are adjustable at runtime in the debug menu (§21) in both languages.
    The zoom behavior of §21.4 holds: the bird's-eye mouse-wheel zoom is
    always active (0.125x-16x) starting at the closer default 0.5. A debug
    checkbox gates zoom-out beyond that default (disabling clamps a wider
    view back to it), and the unlocked range reaches a whole-continent
    view per §21.4. The camera near plane snaps back to the first-person
    default the moment another scene takes the shared camera — entering a
    settlement straight out of the debug zoom must never clip hut walls.
    The debug menu offers the §21.3 dropdown selectors
    (jump-to: every named map point — ports, villages, monuments (point
    273), mountains, waterfalls, lakes, cultural landmarks, natural sites,
    the elephant graveyard and the tomb — grouped by category and alphabetically
    sorted per group (`src/ui/DebugMenu.test.tsx`); equipment; gifts),
    the read-only render-backend row and the journal
    do-not-disturb option (§16.2; also F2); the §21.1 shortcuts hold (F1
    menu, F2 do-not-disturb, F3 full loadout — all gear/treasures, 100000
    gifts/dollars/provisions, full health, full canteen, no afflictions,
    capacity raised to fit, the extended zoom unlocked, and the travel
    speed set to 25 for fast test traversal (point 154) — F4 canoe
    toggle — F6 the COMPLETE bug report in one keypress: a top-most modal
    with an autofocused description field and one download handing out
    picture, state JSON (complete state incl. balance and UI), overlay
    list and description as ONE zip named from the dump stem, the
    reproduction summary — seed, position, region, date, travel speed,
    graphics level — at the TOP of the JSON. The screenshot is read back
    INSIDE a rendered frame (no `preserveDrawingBuffer` — it would cost
    every player frame time) and holds the scene ALONE; labels and HUD are
    DOM and ride along in the overlay list, which the description file
    states; F5 stays the browser's reload (it fires before
    preventDefault can stop it, hence F6; the lower F-key that Windows Chrome
    binds to Caret-Browsing is likewise left to the browser) and F9 cycles the
    GRAPHICS QUALITY LEVEL — low / medium / high (design.md §2.7/§21, point 276
    part B),
    default MEDIUM. Each press steps DOWN one level, wrapping the bottom to
    the top: medium → low → high → medium. A `detailLevel` in `useUi` maps
    through the `QUALITY_PRESETS` registry (`src/config/quality.ts`) to a
    value for EVERY quality-relevant lever (dpr cap; SSAO/TRAA/bloom;
    sun-shadow on/off + map resolution 1024/2048/4096; campfire shadows +
    the 256²/512² soft variant; terrain refine; flora fog factor + cast
    shadow; haze/rain intensity; calm water; wildlife density); the render
    consumers read the current
    level through effective selectors (`effectiveSsao = QUALITY_PRESETS[
    detailLevel].ssao && ssaoEnabled`, etc.) that NEVER clobber the
    individual debug allow-flags — those still tune a feature within a level
    (unlike `activateTouch`, which keeps clobbering; the touch preset stays a
    SUBSET of low). SSAO is high-only; TRAA+bloom, SUN shadows and campfire
    shadows are all off on low — `QUALITY_PRESETS.low.sunShadows` is FALSE
    (point 305), so low casts no shadow passes at all and its 1024
    `sunShadowResolution` is only the ladder's floor, never rendered;
    the lever priority follows the real-hardware
    benchmark (point 277: fill-rate first — dpr, post — geometry last). A
    localized toast names the new level and a localized debug picker sets it.
    ENFORCEMENT: a pure completeness gate (`src/config/quality.test.ts`)
    asserts every level defines every quality key, so a new optical feature
    added without low/medium/high entries FAILS (the §21 sort-into-levels
    convention), and the per-level values are tabulated in
    `docs/graphics-detail-levels.md`, kept in sync with the registry by
    `src/config/qualityDoc.test.ts` (it fails if a preset value changes or a
    key is added without updating the doc). The preset reads per level, the F9
    cycle order and the completeness gate are pure-tested in
    `src/state/ui.test.ts` + `src/config/quality.test.ts` (with `floraFogFar`
    in `src/scenes/travel/floraStreaming.test.ts`), the F9 cycle +
    preventDefault + non-clobber in `src/ui/Hud.test.tsx`; the debug menu's
    graphics section is now a SINGLE localized detail-level dropdown — the
    per-setting graphics allow-flags (TRAA/SSAO/half/full/campfire shadows) are
    no longer exposed there but remain internal store fields for the touch
    preset and the F8 benchmark — asserted in `src/ui/DebugMenu.test.tsx`, and
    the live F9 cycle + effective flips in `scripts/verify/settings.mjs`;
    verifiable via `src/state/stateDump.test.ts` (the serialiser captures
    every data field, drops the actions, stays deterministic, the summary
    on top), `src/report/*.test.ts` (the zip an unzip accepts, the
    assembly, the overlay snapshot incl. the doubled-label witness),
    `src/ui/StateDump.test.tsx` (hidden by default, F6 opens with the field
    focused, the typed text reaches the archive, Esc closes leaving focus
    on no control, both languages, the F6 default prevented, F5 untouched)
    and `scripts/verify/report.mjs` (a live F6 run on BOTH backends whose
    PNG member is DECODED and must vary — a blank capture is a valid
    PNG) — F8 the in-game render benchmark (point 277), the one
    debug tool that SHIPS IN THE DELIVERED BUILD (the levers of point 276
    must be priced on the USER's hardware, not on the headless one), its
    runner LAZILY imported on the keypress so it stays out of the eager
    startup chunks: it sweeps the ten graphics configs of §21.1 over one
    identical route (dense savanna standing, empty desert standing,
    driving out of the savanna — the anchors of `scripts/perf-bench.mjs`)
    and DETERMINISTICALLY — a seeded PRNG installed over `Math.random` for
    the run, world seed/date/position/travel speed/zoom/journal and the
    event+deadline switches reset before every section, and a FIXED
    simulation timestep (1/60 s) stepped a FIXED number of frames, so the
    path and every roll repeat and only the measured wall-clock varies —
    then offers the report (environment incl. backend/adapter/build
    commit; per config THREE series — the REAL GPU time from the WebGPU
    backend's timestamp queries, the CPU time inside the frame and the
    wall-clock frame time, each median/p95/p99/max — plus fps,
    `renderer.info` draw calls/triangles and a scene-graph triangle count
    per system) as a downloadable JSON with a readable digest plus a copy
    button, behind a localized modal whose Esc aborts and restores every
    setting. The GPU series is the point: a page cannot disable vsync, so
    a config 40 % dearer on the GPU moves NEITHER a capped wall clock NOR
    the CPU time — exactly the geometry lever of point 276 would look
    free. Where timestamps are unavailable (WebGL 2, or an adapter
    without `timestamp-query`) the series is FLAGGED with its reason,
    never fabricated, and the report names which series is the
    trustworthy one (`headline`, in the digest and in the result panel).
    The sweep forces the HIGH level so every lever stays measurable; a
    FINAL profiling pass (point 293, `LOW_CONFIG_NAME`) then applies the
    actual LOW `QUALITY_PRESETS` values and reports, per route section at
    low, the per-system scene-graph triangle share, the draw calls and the
    same GPU/CPU/wall series — ranked most-expensive-first, with a digest
    line naming the top remaining cost centres ("at LOW the frame is
    dominated by: terrain 42 %, flora 28 % …") and a localized ranking in
    the result panel, so a player on a slow PC sees WHERE the cost still
    sits at low (design.md §21.1);
    verifiable via
    `src/systems/benchmark.test.ts` (sweep plan, route, fixed-timestep
    clock, statistics, breakdown, report shaping, and the low profile —
    `buildLowProfile` ranking only the low rows, null without them, and
    the digest lines),
    `src/ui/BenchmarkOverlay.test.tsx` (F8 starts the lazy runner and
    prevents the browser default, Esc aborts/closes, both languages) and
    `scripts/verify/benchmark.mjs` (a live `?bench=short` run: one row per
    config × phase, the progress modal, the GPU series measured on WebGPU
    and flagged-with-reason on WebGL 2, and every setting —
    `Math.random` included — restored afterwards)); the
    canteen's consumption
    rates and capacity are editable (§21.2), as is the parental rescue
    burst (`balance.family.rescueBurst`, §19.8 pt. 12 — the field's
    write-through pinned in `src/ui/DebugMenu.test.tsx`). Modal windows and full-screen
    overlays always render above the in-scene floating labels (§17.4).
   Evidence: docs/acceptance-evidence.md §20.

21. **Water realism.** The visual water realism of `design.md` §11.3 is
    implemented (rivers in carved beds rendering as one continuous,
    unbroken ribbon descending from source to mouth, bridged stray sea
    points, a calm surface with a visible current strengthening at rapids
    and falls, five white waterfall cascades with plunge-pool foam,
    springs in open land, flat lake surfaces just above their carved
    beds), the §11.3 mouth-junction and no-interior-notch rules (point
    211: a sea-mouth ribbon carries `MOUTH_BRIDGE` axis points past the
    coast contour into the receiving shelf, so no beach strip parts river
    and sea; and each ribbon row lifts via the shared
    `ribbonRowSurfaceAt` until every water-typed terrain sample across
    its own band sits below the sheet, so a cross-sloping bank's carved
    wedge can never poke a notch through the water — the reported Cairo
    cut-out; the canoe float reads the SAME lifted rows, one formula in
    `waterSurface.ts`), the §11.3 width/course rule (rivers wider than scale via the
    calibratable `river.widthFactor` balance value — carved bed, ribbon,
    water mask and clearances all derive from ONE width; the course
    interpolated through the shared centripetal spline so no source
    control point turns in a hard corner), as is the current's effect on
    movement (§11.3): a passive
    downstream drift every frame, scaled by the nearest river segment's
    downstream direction and boosted near waterfalls (calibratable balance
    values: `currentDrift`, `currentWaterfallBoost`,
    `currentWaterfallRadius`), covering real distance so it advances time
    and provisions (and ticks health/deadline) — never free movement.
    Being swept over falls is gameplay via pt. 23 (waterfall-sweep event).
   Evidence: docs/acceptance-evidence.md §21.

22. **Health and afflictions.** The health system of `design.md` §6 is
    implemented: a health pool drained by starvation and the afflictions
    of §6.2 (fever delirium, dehydration with the canteen fill mechanics
    and low-fill warnings of §6.1, sun blindness healing only outside the
    desert, light/severe wounds), medicine as the instant cure, the staged
    natural wound healing of §6.2 (calibratable, debug-editable day
    counts — a wound alone is never an unavoidable death), regeneration
    while fed and affliction-free, the remains report and successor on
    death (§15.6), the health query (H), the wound shown on the traveler's
    bird's-eye figure scaling with severity (§6.2), and vultures circling
    at poor condition (§19.6); health/afflictions travel with the
    checkpoint; all drains/thresholds are balance values adjustable in the
    debug menu, which also toggles afflictions for testing.
   Evidence: docs/acceptance-evidence.md §22.

23. **Random events.** `design.md` §14 is implemented as a hidden per-day
    roll while travelling, modulated by terrain and state: the event kinds
    of §14.1 (with the predator danger order cheetah < leopard < hyena <
    lion), the item-protection rules of §14.2 (by mere possession; rifle >
    machete; against crocodiles the machete always, the rifle only from
    the canoe), the first-time danger warnings of §14.4 (incl. the
    canoe-aware water warning that never advises what is already in use),
    and the direct attack on walking into a wandering bird's-eye predator
    (§19.3; same protection/outcome rules, rate-limited by the event
    cooldown and suppressed with the random-event system).
    Wounds/afflictions feed the health system (pt. 22), fatal attacks end
    in the remains report, and every event is told through a journal entry
    in both languages with voice markup (§16). Rates are balance values
    calibrated low so events are rare, and in the relaxed exploration
    preset the whole random-event system defaults to OFF (§14.3); the
    debug menu toggles it on and triggers each kind directly (§21.3), and
    the §14.4 first-time danger warnings stay active either way.
   Evidence: docs/acceptance-evidence.md §23.

24. **Deadline and successor.** The multi-year deadline of `design.md`
    §5/§18 is implemented (balance value, ~5 years) with staged journal
    warnings at 60 % and 85 % of the granted time — each exactly once, in
    both languages — the recall on expiry (defeat overlay, journal silent,
    no successor), and the §18 successor flow on death (pt. 22): resume at
    the last checkpoint, day penalty, silently inherited warning stage,
    takeover entry.
   TEMPORARY (`design.md` §5.1, user 16.07.2026): the deadline is
   SUSPENDED in the shipped config (`balance.deadline.enabled` false) —
   the expedition never ends on time; instead the calendar STOPS at
   31.12.1895, the end of the game's window, at every day-advancing path.
   The mechanism stays implemented and tested (the tests enable the flag),
   so lifting the suspension is a one-value revert. Do not delete the
   deadline code, and do not "fix" the tests by dropping the flag.
   Evidence: docs/acceptance-evidence.md §24.

25. **Trade economy.** `design.md` §8/§9/§10 is implemented:
    shovel-recovered treasure caches (one per region plus a statue site,
    placed anew each run) and the elephant graveyard's limited random
    ivory hauls (§4.4); the capacity-limited inventory (balance value —
    buying or digging beyond it is refused; the debug menu edits capacity
    and gift count and auto-raises on overfilling debug adds, §21); the
    bazaar with regional value factors, buy/sell spread and the standing
    per-port quote (§10); the travel agency's ferry passages between all
    ports with distance-based fare and duration (Zanzibar reachable);
    discovery bounties credited on the next port visit as a telegraphic
    transfer whose journal entry names the discoveries and the amount (the
    known-from-start places of §17.2 — the ten ports and the Giza monument
    site — earn no bounty for themselves, §17.2/point 288/point 273), and
    kind-flavored first-sighting entries for landmarks (§10, once per
    landmark, both languages, voice markup) — including the eight built
    cultural landmarks of §4.4 (Meroë, Giza, Great Zimbabwe, Lalibela,
    Kilwa, Aksum, Gondar, Bandiagara), framed as African achievements, and the
    four natural point-landmarks (Ngorongoro, Ol Doinyo Lengai, Okavango,
    Sudd); the valuable-presentation
    reactions of the §8 matrix; and the baseline goods in every settlement
    with money in ports and gifts in villages (§9). All new texts exist in
    both languages with voice markup.
   Evidence: docs/acceptance-evidence.md §25.

26. **Standing with the natives.** The reputation system of `design.md`
    §12 is implemented: hostility and expulsion on a rejected gift with
    the hostility period and its wear-off, the "Honored Friend" status
    with its pledge journal entry and regional protections (attack
    outcomes capped at lightly injured with rescue entries naming the
    people, near-death aid with cooldown, free village supplies), and the
    robbery behind a deliberate safety confirmation with its rich haul
    reported in the chronicle and its permanent regional consequences
    incl. the irretrievably forfeited friendship. Item effects are
    possession-based (§6.1/§7): merely carrying a rifle blocks no audience
    and scares no villager. All new texts exist in both languages with
    voice markup.
   Evidence: docs/acceptance-evidence.md §26.

27. **Camps (item caches).** The camps of `design.md` §6.3 are
    implemented: free camps pitched (or reopened nearby) with C in the
    open, holding any number of inventory items (taking back respects the
    inventory capacity; storing the canoe leaves it behind, dropping its
    land penalty), marked with the map X and the bird's-eye pole marker,
    with the per-day looting risk (balance value) revealed by a journal
    entry on return; village caches gated by "Honored Friend", persistent,
    and irretrievably destroyed by a robbery in the region. All new texts
    exist in both languages with voice markup.
   Evidence: docs/acceptance-evidence.md §27.

28. **Full saving and loading.** The port-snapshot saving and tabular load
    overview of `design.md` §18 are implemented — one snapshot per port
    visit (a placeholder cap keeps only the most recent ones), the
    overview table with port city, in-game date, money, food, gifts and
    health state, manual saving omitted. A legacy single-slot checkpoint
    migrates as one table row; the successor (pt. 24) resumes from the
    latest snapshot. All menu texts exist in both languages.
   TEMPORARY (user decision 24.07.2026): the LOAD side is SUSPENDED for the
   PoC — the startup "a saved game was found — load it?" prompt is disabled
   (`SAVE_LOAD_ENABLED = false` in `src/ui/Hud.tsx`), so every launch begins a
   fresh expedition with no popup. Saving still runs (the snapshots and the
   successor flow are untouched and tested), and re-enabling is the one-value
   flip. `scripts/verify/flow.mjs` asserts the inverse of the old behaviour:
   with a checkpoint seeded, NO start overlay appears and the game runs.
   Evidence: docs/acceptance-evidence.md §28.

29. **Animated handwriting.** The animated handwriting of `design.md`
    §16.3 is implemented (stroke-by-stroke reveal behind the pen hand,
    click-to-finish, the wound level on the hand, persistent blood traces
    on pages written by a wounded hand, no entry for a dead character —
    the remains report takes over, pt. 22 — and silent writing under
    do-not-disturb, §16.2), and the journal keeps the newest content in
    view per §15.4.
   Evidence: docs/acceptance-evidence.md §29.

30. **Gamepad and position query.** The gamepad controls of `design.md`
    §17.5 hold (left stick merged with WASD, right stick first-person
    turn, the button-to-key mapping via synthetic key events — no second
    input path — standard-mapped pads only, and the deliberate-input
    engagement guard against idle axis drift), and the position query
    (§17.1/§3.2) reports the current coordinates and region as a localized
    toast on P — the way to read coordinates, which are never shown
    permanently.
   Evidence: docs/acceptance-evidence.md §30.

31. **Settlement orientation and panorama wildlife.** The gift-unlocked
    building orientation of `design.md` §17.3 holds (pulsing markers on
    the important, enterable buildings after the first accepted gift,
    persisted per settlement, announced by a localized toast), as does the
    §2.5 panorama wildlife (region-typical silhouettes drifting beyond the
    settlement edge — far and small, hazed toward the sky, standing on the
    ground the frame DRAWS under them rather than a monument looming or
    clipping to a black sliver; points 92/94; their species the region's own
    bird's-eye pool and never crossing a fixed skyline landmark, point 102).
    The footing is the higher of the backdrop relief at the silhouette's own
    spot and the settlement's visible ground line — the sight line over the
    walkable ground disc's edge from the live camera (`panoramaStandY` /
    `discHorizonY`, point 181). The former EYE_HEIGHT anchor put NOTHING
    under the feet and, where relief rose, buried them. The gap it worked
    around is CLOSED (point 381): outside the disc the backdrop may rise but
    never sink below the ground plane, and a ring is pinned on the disc edge,
    so at any place the walkable ground meets the panorama with no edge, no
    unlit face and no hole.
    The silhouettes WALK rather than glide (point 255): built
    with pivoted legs, they swing them on the shared distance-driven gait phase
    (`gaitPhase`/`legSwingAngle`) fed by the arc they drift along their ring, so
    a faster one steps faster and a stalled one stands still — a wall-clock bob
    is never the driver, and at horizon range a body-level bob alone would move
    barely a pixel. They only ever walk FORWARD (point 286): the facing is
    DERIVED from the ring velocity tangent (`panoramaDriftYaw`, the codebase's
    atan2(vx,vz) convention the settlement goats face on), so a silhouette can
    never reverse — the former hand-written `−a + (drift>0 ? π : 0)` sat exactly
    π off the tangent and moonwalked every one — and the stride phase rides the
    arc expressed in the silhouette's OWN rendered frame (`panoramaGaitDistance`,
    the world arc ÷ its enlargement `scale`), so the leg cadence stays consistent
    with the rendered body's slow horizon crawl instead of flailing at the raw
    world-arc rate.
   Evidence: docs/acceptance-evidence.md §31.

32. **Render pipeline upgrades.** TRAA, screen-space reflections and true
    water refraction (`design.md` §2.7) were rebuilt in small
    backend-neutral steps with a supervised manual test loop: the headless
    verification runs on the WebGL 2 fallback only (Chromium gets no WebGPU
    without a display), so each step was confirmed on real hardware — the
    lesson from the reverted first attempt, whose WebGPU-only TRAA/SSR
    branch went untested and rendered a black scene. Step 1 is done and
    accepted: TRAA runs backend-neutrally (upstream `TRAANode`, velocity
    MRT, MSAA off), passed its manual WebGPU check (stable across repeated
    toggles after the pipeline-rebuild disposal fix, visually on par with
    4× MSAA) and is on by default; the debug checkbox (`design.md` §21.3)
    switches back to the render pass' MSAA. Step 2 (SSR: upstream
    `SSRNode`, metalness/roughness MRT, additive composite before the
    temporal resolve, WebGPU backend only) was delivered and went through
    its manual WebGPU check on 14.07.2026 — verdict: with the bird's-eye
    camera never at grazing angles and the first-person scenes having no
    water or gloss, no in-game situation makes SSR read, so by user
    decision it was REMOVED again (the pipeline reads exactly as after
    step 1). True water refraction remains OPEN.
   Evidence: docs/acceptance-evidence.md §32.

### 7.2 Self-Verification (mandatory)

After completion and after every major system:

- Run `npm run build` and confirm it passes without errors.
- Run `npm run lint` and `npm audit` and confirm both are clean (zero
  lint errors/warnings, zero vulnerabilities) per §7.1 point 18.
- Run `npm run test:unit` (the fast Vitest layer) and confirm it is green;
  add or extend a test there for the changed logic/store/HUD when applicable.
- Start the dev server and verify via headless screenshot (e.g. Playwright)
  that the affected view renders without console errors. `npm test` chains all
  of the above (build → lint → vitest → the browser suites → preview).
- Store screenshots of each core view (bird's-eye view, port city,
  village/chief's hut, opened journal) and check them against the criteria
  of §7.1.
- **Test at in-game-achievable conditions (point 172).** A verification must
  exercise a feature at a state the player can actually reach — for the
  bird's-eye zoom that is the NON-DEBUG range 0.125–0.5 (default 0.5), never a
  debug-only wide zoom, unless the check specifically tests the debug wide-zoom
  feature. Judge "is it in view" by PROJECTING the point to the rendered frame
  (`__camera.onScreen`/`ndc`), never by an assumed radius (100×zoom, fog.far, a
  hard-coded distance) — clearView pushes the fog to the horizon at a wide zoom,
  so no radius stands in for the picture. A green assertion against a computed
  radius can hide a real bug the player sees (points 164/171/172).
- **A frame must show what its name claims (point 375).** The same projection
  decides at the SHUTTER: every frame a verify script writes declares its
  subject — a place/landmark (`world`), something inside a settlement (`local`/
  `place`), a HUD element, or explicitly a `general` view WITH its reason — and
  the shutter (`scripts/verify/frameSubject.mjs`) refuses to write a frame whose
  subject is not in the picture, naming what was found instead. Two `world` runs
  on identical code had photographed different places, both exiting 0. A pure
  gate in the unit layer fails on any screenshot written outside the shutter.
- **Backend coverage is UNIVERSAL where it is possible (point 204).** WebGPU is
  the player's real backend and WebGL 2 the shipped fallback, so both are
  verified:
  - Every browser suite launches through `launchVerifyBrowser()` and asserts the
    backend it actually got (`assertBackend`, right after the `window.__renderer`
    wait). A `VERIFY_GL=webgpu` run that silently fell back to WebGL 2 — or a
    `webgl` run that came up on WebGPU — FAILS LOUD.
    The only exceptions are `docs` (pure Node, no browser) and
    `preview` (production build, where `__renderer` is dev-only).
  - A LARGE run (`npm test` / `npm run test:large`, no `VERIFY_GL` pinned) covers
    BOTH backends in one command: the whole LARGE on WebGL 2 (with preflight and
    prod preview), then the render suites on WebGPU. A pinned `VERIFY_GL`, the
    SMALL tier and a bare suite filter stay single-backend. `touch` and `voice`
    are the documented WebGL2-only skip (headless WebGPU drives neither the CDP
    touch events nor the TTS speak state; both were verified there).
  - The suite→tier→backend map is the pure module `scripts/verify/tiers.mjs`,
    pinned by `scripts/verify/tiers.test.mjs` in the Vitest layer; change it
    there and in `scripts/verify/README.md` together.
- **The Stop chain gates the turn end, not only the test run.** Beyond the
  suites, Stop hooks (authoritative list: `.claude/settings.json`) BLOCK a turn
  end while the working state contradicts a standing rule — "enforce, don't
  remind", each adopted after a reminder failed. Currently: `model-guard`
  (no commit authored outside the §6 model allowlist), `dashboard-guard`,
  `dashboard-conciseness-guard`, `dashboard-card-topic-guard` and
  `dashboard-integrity-guard` (the progress board is published, concise,
  one-topic-per-card and consistent with the real state), `prep-guard` (no
  idle wait while a background validation runs), `batch-progress-guard` (no
  idle stop without a boundary or wait), `render-verify-guard` (no
  render-set change — scene/shader/HUD, `src/world/` geometry, the browser
  suites — finished without the picture check, on both backends where they can
  differ), `mechanism-review-guard` (no new or changed
  guard, gate or git hook without a recorded review by the OTHER model —
  `scripts/mechanism-review.mjs --record`), `queue-order-guard`, `tasks-spec-guard` and `tasks-archive-guard`
  (the queue order, the final-state-only spec rule, and the open/archived split
  of the work order), `doc-budget-guard` (this file, design.md and the work
  order's preamble stay within measured ceilings; budgets and both honest exits
  in `scripts/doc-budget-core.mjs`), `commit-scope-guard` and `pre-push-gate`
  (versioned `scripts/git-hooks/`, wired by `npm install`: no stray file rides
  along, no rescue commit mails the user, no push lands a state CI would
  reject), `ci-status-guard` (a
  red CI is noticed), `timestamp-guard` (the chat timestamp) and
  `retro-currency-guard` (the retrospective stays current, each lesson carrying
  a mechanism decision: `docs/analysis_de/lesson-mechanisms.md`), followed
  by `dashboard-sync`. Separately, PreToolUse hooks run `closing-guard` (§9),
  which denies a version tag until every closing step is recorded, and
  `board-first-guard`, which fires BEFORE the work rather than at the turn end (the
  Stop chain lets the board lag an hour): a turn's FIRST state-changing call is
  denied while no `focus set|confirm` postdates the turn stamp, the board is
  unpublished, or the OPEN-POINT SET changed without a publish since (`publishDue`)
  — never a read, its remedy commands or a board-file edit, and at most ONCE per
  turn. It binds EVERY session (point 400): `scripts/board-publish.mjs` publishes
  from a SCRIPT, so the headless successor can too; the check reads that PAGE, and
  `batch-autostart.mjs` alerts when it is behind — the one layer still speaking
  while a session is wedged. It runs BACK too (`scripts/chat-core.mjs`,
  `docs/batch-autonomy.md`): the launcher polls the chat each tick and hands what
  VERIFIES on as untrusted input, never as authorization.
  Every one is fail-OPEN (an internal error allows the stop, so a guard bug
  cannot trap the session) with a pure, Vitest-covered decision core.
- **Ask the guards BEFORE the action, and answer LAST (points 365/403).** Before
  an action a guard governs, `node scripts/guard-preflight.mjs --for <action>
  --session <id>` reports read-only whether one would block — advisory; the guard
  stays authoritative, a blocked turn produces nothing, one loop cost ~30 turns.
  The turn's END is such an action (`--for answer`): routine duties (focus
  confirm, board publish/attest, the boundary) FIRST, the closing reply LAST,
  once the chain would pass. Blocked anyway, the next message names in one
  sentence what was fixed; re-answering is how the user got the same text twice.
- **Screenshot diffing is NOT available as a shortcut (point 361).** Every
  pixel-metric shortcut was replayed against the bugs the picture caught and
  REJECTED: two runs of one suite on identical code move 11–98 % of a frame,
  the smallest real defect 0.75 %. No golden-image
  gate until `node scripts/picture-stability.mjs <suite>` reports STABLE;
  verdicts in `docs/picture-check-levers.md`.
- Fix deviations, do not paper over them. An unfulfilled criterion is
  reported as such.

---

## 8. Explicitly Outside This Run

- Multiplayer in any form.
- Onboarding, tutorials, lowering of the entry barrier.
- Full balance calibration; a debug menu (§21 `design.md`) beyond what §2
  and the verification require.

These points are not to be started, not even partially, as long as the
acceptance criteria of §7.1 are not fully met.

---

## 9. Closing the Run

At the end:

- Confirm which criteria of §7.1 are fulfilled, with screenshot evidence.
- List the collected open items (`// OPEN: …`).
- Name the simplifications made and the placeholder values set.
- No silent extensions beyond §7.1.
- **Closing completeness is ENFORCED, not remembered (user decision 24.07.2026, point
  306).** A closing is more than the LARGE regression — the dead-code / stale-doc /
  stale-comment cleanup and the `.md` audit are what distinguish it (the v0.2 release
  skipped exactly these because they were tracked only by memory). The full closing
  checklist is machine-readable in `scripts/closing-guard-core.mjs` (`CLOSING_STEPS`),
  and a PreToolUse(Bash) guard (`scripts/closing-guard.mjs`) DENIES creating or pushing a
  version tag (or moving `poc`) until EVERY step is recorded done for the tagged commit.
  Drive it as you close: `node scripts/closing-guard.mjs --status`, then
  `--step <id> --evidence "<proof>"` per step. Adding an optical/systemic feature that
  needs a closing step adds it to `CLOSING_STEPS` (the gate tightens automatically).
- **Graphics detail-level doc current (user 24.07.2026).** Explicitly confirm
  `docs/graphics-detail-levels.md` still matches `QUALITY_PRESETS`
  (`src/config/quality.ts`). The `src/config/qualityDoc.test.ts` sync test
  enforces this on every `npm run test:unit` run — so a green regression already
  proves it — but the closing names it as a deliberate check so a doc drift can
  never slip past. If the presets changed, the doc must have changed with them.

**Closing freeze (user decision 22.07.2026).** During a closing run the code
is FROZEN: no parallel agent work may land or merge while the closing runs,
else the closing does not test the FINAL state. Before starting a closing
cycle, stop spawning agents and let all in-flight branches merge (or park
them); run the closing on the frozen `main`; resume the agent pool only
AFTER the closing completes.
