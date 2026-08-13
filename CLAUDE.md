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
§15) uses the Kokoro TTS model via the `kokoro-js` package, fully in-browser,
in a Web Worker (`src/journal/ttsWorker.ts`) so synthesis never blocks the
game loop — the main thread only posts a text segment and plays back the
returned PCM. The engine runs the onnxruntime WebGPU compute path (fp32,
distinct from the three.js renderer's WebGPU) on Chromium and the WASM path
(q8) everywhere else; the device is decided on the main thread and passed to
the worker. WebGPU is chosen because it synthesizes FASTER THAN REALTIME,
giving a fast, gapless read-aloud (user decision, point 117 — it reversed
point 100's WASM-only engine, do not revert it). Its one cost is the cold
load, whose onnxruntime init saturates the GPU process (~15 s, no frames), so
the game PRE-WARMS the model at start (`warmupSpeech`, ~1.2 s after mount)
and that stall happens up front rather than at the first narration. The WASM
fallback never touches the GPU process and keeps the game rendering through
its cold load; the headless verification forces it via the
`window.__ttsForceWasm` dev hook, and `scripts/verify/voice.mjs` gates that
path's liveness with an rAF probe. The weights stream from the Hugging Face
CDN on first use and are browser-cached — not part of the repository or the
bundle. The TTS stack (worker included) loads lazily and must never enter the
eagerly loaded startup chunks. Kokoro has no German voice, so read-aloud is
English-only for now (open item for German); the voice markup is written for
both languages regardless.

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
map is `scripts/verify/tiers.mjs` (§7.2).

**Test architecture (hybrid).** The regression is split so the bulk runs in
seconds and cannot flicker on browser timing: a fast, deterministic **Vitest**
layer (jsdom, no browser) in `src/**/*.test.ts[x]` covers all pure logic, store
transitions and HTML-HUD component classes/text; the **Playwright** scripts in
`scripts/verify/*.mjs` keep only what genuinely needs a real browser (the
three.js scene + RAF wildlife, real layout geometry, canvas/WebGL init,
pointer-lock, TTS audio, the §7.2 acceptance screenshots and one end-to-end core
flow). **Every future feature must add a test on the appropriate layer(s)**:
Vitest for anything assertable without a browser, Playwright only for the
scene/geometry/CSS/audio/screenshot cases. The full strategy and the old→new
coverage map live in `scripts/verify/README.md`.

---

## 6. Working Method

- Work incrementally: small, topically well-scoped commits, one self-contained
  unit each.
- **Feature-branch workflow (user decision 22.07.2026).** Each TASKS point is
  developed on its OWN feature branch (`feat/<point>-<slug>`), branched from
  `main`. Commit atomically AND immediately push the BRANCH after every commit
  (durability — nothing stays only local, nothing is lost if a session dies;
  a failed push is reported, never skipped silently). A RESCUE commit — work
  committed because a session or agent was killed mid-build — carries
  `[skip ci]` in its SUBJECT plus a `Rescue: <what was interrupted>` trailer
  (user 28.07.2026): it is no claim of completeness, and its red CI run would
  alert on a state nobody claims is done. Durability is untouched: it still
  pushes, only that run is skipped, and the NEXT commit — the one that finishes
  the work — runs CI normally. The `commit-msg` hook refuses each half without
  the other. Merge to `main` ONLY when
  the point is COMPLETE and verified — tests green on both layers AND, for a
  render/GUI change, the rendered picture checked: on BOTH backends where the
  change can render differently on each, and on ONE where it cannot — a DOM-only
  change under `src/ui/` draws identically whichever renderer holds the canvas,
  so the second inspection buys nothing (user 26.07.2026; the classification is
  `isBackendSensitivePath` in `scripts/render-verify-core.mjs`, and the guard
  demands accordingly). On merge, resolve any conflict CAREFULLY, and RE-TEST the
  relevant regression whenever a conflict touched real code. THE MERGE ENDS THE
  BRANCH — local, remote AND its worktree — or the debris of 28.07.2026 returns
  (31 of 36 remote branches already contained in `main`);
  `branch-hygiene-guard` is only the backstop. `main` therefore
  always reflects finished, verified work — it is the deployed branch (the
  GH-Pages root builds from `main`; the `/poc/` deploy builds from the immutable
  `poc` TAG, not from main). CROSS-CUTTING changes that
  are not a single feature — guards, docs, the progress dashboard, workflow/
  process files — are committed directly to `main` while they stay SMALL (a
  feature branch for each would be needless ceremony). BEYOND a small commit —
  a new mechanism, a multi-file guard rebuild — such a change is DELEGATED to a
  worktree agent like any point (measured 30.07.2026: of 60 first-parent commits
  on `main`, 42 were main-only bookkeeping and the 9 delegable ones all small).
  What genuinely stays here is the ARMING in `.claude/settings.json`
  or the git hooks, which needs an attended session, and the bookkeeping. Use
  worktree isolation for parallel file-mutating agents so their branches never
  collide in one tree.
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
  - **The landing is ONE command.** `node scripts/land-point.mjs <N> --model <m>`
    drives merge (`--no-ff`), fast gate, tick, archive move, the tick COMMIT and the
    push of main, board publish and worktree cleanup — one verdict per step. It
    STOPS at the first red, leaves no half state and bypasses no guard. The gate is
    mandatory after EVERY merge — clean auto-merges still break together.
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
- **Maximal delegation (user 22.07.2026, permanent).** The main session delegates
  the MAXIMUM so as little as possible bottlenecks there. Each open TASKS point
  goes to a WORKTREE-ISOLATED subagent on its own `feat/<point>-<slug>` branch
  (gates green, branch pushed, NOT merged); a POOL of THREE runs in PARALLEL on
  NON-OVERLAPPING files, and the cap is also a TARGET: while the queue holds an
  independent point, a free slot owes a reason (`--slots-free`). Infra and doc
  work too. What stays here: picture-verification on BOTH backends, the serial
  landing (`land-point.mjs`) and deploy, and the Artifact publish (URL-bound).
- **Delegation brief instead of a reading assignment (point 365).** A delegated
  agent receives its point as a BRIEF: `node scripts/point-brief.mjs <N>` prints
  the spec verbatim, the design.md sections it cites, one identifying line per
  cross-referenced point, and a REFERENCE MAP naming where every `§` resolved.
  Measured: ~1.8k tokens median against ~108k for reading TASKS.md and design.md
  whole, and it does not grow with the queue. The prompt carries the brief and forbids wholesale
  reads; a NAMED section may be read on demand, and an insufficient brief is
  ESCALATED, not guessed around. The brief FAILS LOUDLY on a reference that
  resolves nowhere, and where one section number exists in two documents it
  prints BOTH — no resolver can decide that, so the reader is told. Every brief
  carries the revision it was cut from; regenerate rather than reuse an old one.
- **Context boundary at a point boundary (users 27./28.07.2026).** 87–94 % of
  the spend sat above 150k context, one session carrying point after
  point. A batch session ENDS at its boundary, and the boundary is
  TAKEN: after merge and tick run `node scripts/batch-boundary.mjs
  <point>` and stop. `batch-progress-guard` BLOCKS a stop that closed a point
  without that marker, allows one only against the work order and an armed
  launcher (`scripts/batch-launcher.mjs --start` on Linux, the
  `HoA-Batch-Autostart` task on Windows), then marks the lock HANDED OVER so
  it spawns the successor.
  Attended, ask for `/clear`. OWNERSHIP IS A LEASE (30.07.2026): `leaseUntil` on
  the lock, renewed BEFORE each call; an owner that stops renewing stops owning
  the batch. A PreToolUse fence then refuses it merge/push, the tick, the board
  publish and `dashboard-state.json`.
  THE WAY BACK (28.07.2026): a returning window runs `node
  scripts/batch-claim.mjs --session <id>`; the owner sees it at its next hook,
  finishes — never mid-merge, never with an agent or a verification running —
  releases, and the same command takes it. A claim expires, a dead claimant's
  is ignored, one session wins.
  A MESSAGE WAKES IT TOO (29.07.2026): `scripts/chat-watcher.mjs` spawns a light
  responder from the chat inbox — only with no live owner and no honoured claim,
  under a bounded claim; the launcher tick supervises it.
- **Model policy (users 25.07.–13.08.2026, points 309/624/667). AUTHOR AND REVIEWER ARE
  SEPARATE ROLES, AND AUTHORING HAS TWO LANES.** ANTHROPIC: **Opus 5**, then **Fable
  5**, then **Opus 4.8** — the chain `scripts/batch-autostart.mjs` launches. **FABLE 5
  AUTHORS THE HARD CASES** (12.08.2026): difficult, complex or error-prone work goes to
  Fable FROM THE START, and Opus work MOVES there once Sol still finds problems after a
  re-work. OPENAI: **GPT-5.6 Sol** AUTHORS the MECHANICAL and MID-DIFFICULTY points
  (13.08.2026) — never a hard case, never one whose verification IS the work. REVIEWERS:
  the OTHER vendor, never an author of the range —
  Sol at effort HIGH on Claude's work; where SOL authored, CLAUDE reviews, runs the
  suites, judges the picture and lands. Reviews run through `node
  scripts/review-sol.mjs`, never a hand-typed `codex` line: it names the cause, hands
  the review on and records who ran it. Sonnet and Haiku are NOT acceptable: a degraded
  session is a capability breach; the batch STOPS. Every commit NAMES its author model
  in a `Co-Authored-By` trailer the `commit-msg` hook enforces;
  `scripts/model-guard-core.mjs` holds the
  AUTHOR allowlist (`ALLOWED`) and `scripts/model-guard.mjs` blocks the turn end on any
  commit after its baseline authored outside it: HARD on a NAMED forbidden model
  (pause), resolvably on an UNNAMED one, which transcripts settle.
- **The four-eyes principle has TWO MODES, chosen by the STAGE (user
  25.07.2026). This is its normative wording; everywhere else refers here.** A
  DIVERGENT stage — what could go wrong, which cases to test, which designs are
  possible — runs BLIND PARALLEL: both models work from the same inputs to their
  own complete result, neither seeing the other's until both are done; the two
  are then merged BY MEANING, keeping both wherever it is unclear that one
  subsumes the other and dropping none for being unusual. The reason is
  anchoring: a reviewer handed a finished list CHECKS THAT LIST and names far
  less than from a blank page, wrong where the risk is the item nobody thought
  of. THE MERGE, where a finding vanishes silently, GOES TO THE MODEL THAT WROTE
  NEITHER LIST and is COUNTED (user 11.08.2026): every entry carries an id and
  the union accounts for each — `only A`, `only B`, `merged with <id>` — via
  `scripts/blind-merge.mjs`; `mechanism-review.mjs --merged-by` names the merger
  and refuses either author unless only two models existed. A CONVERGENT stage —
  is this diff correct, does it match its spec, is this measurement sound —
  judges ONE artefact, which cannot be produced twice; it keeps the ORDINARY
  REVIEW, refined only in that the reviewer reads the ARTEFACT before the
  author's rationale, so that cannot anchor it either. Two sets are worth what
  their errors are UNCORRELATED, so CROSS-VENDOR
  is the default pairing (the reviewers above); two blind runs of ONE model are
  the WEAKER fallback, recorded as such and DECORRELATED BY FRAMING (a hostile
  tester), since a re-run varies least where the model is confidently blind. The
  generative stage runs twice, so ~2× there, and applies where four-eyes already
  applies by the criticality triage, not everywhere.
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
- **Answer from the repository, never from the user (points 365/3.57).** A question
  about the repository is answered by a command whose OUTPUT is small — a count, a
  section, a brief — never by lifting a whole file into a context. A BLOCKED action
  means the wrong path, not a missing permission: find the project's own command
  before routing the user through steps he must perform by hand.
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

**The full criteria live in `docs/acceptance-criteria-detail.md`** (user
08.08.2026), under the SAME numbers, the way nos. 20 and 21 already read: a
criterion here keeps its number, its title, one short acceptance condition and
its two pointers, while its COMPLETE wording — every rule it demands and every
TEMPORARY/SUPERSEDED/OPEN notice hanging off it — stands there verbatim and is
what governs when the criterion is worked on or closed. Same reason as the
evidence chains beside it: this file is sent with every turn of every session,
that detail is needed at the work and at the closing. A criterion and its
detail section change in the SAME commit.

1. **Build/start.** `npm install`, `npm run dev` and `npm run build` run
   without errors. The application loads without console errors.

2. **Two perspectives.** Bird's-eye view (3D travel across the continent) and
   first-person view (walkable settlement) exist; switching between them is
   movement-based, confirmed with the SPACE use key, per `design.md` §2.3.
   Detail: docs/acceptance-criteria-detail.md §2.
   Evidence: docs/acceptance-evidence.md §2.

3. **World model.** The fixed, authentic ~1890 geography of `design.md`
   §3.1/§3.2 holds — all 10 port cities, 22 peoples, 17 rivers and every §4
   landmark, with discovery-gated labels (§17.2) and the §19.11 exploration
   map.
   Detail: docs/acceptance-criteria-detail.md §3.
   Evidence: docs/acceptance-evidence.md §3.

4. **Movement and time.** The character moves in the bird's-eye view and date
   and provisions advance with the journey (calendar display, start 1890); the
   boundary, penalty, item-effect and collision rules of `design.md`
   §11.1/§11.2 hold.
   Detail: docs/acceptance-criteria-detail.md §4.
   Evidence: docs/acceptance-evidence.md §4.

5. **Port city.** At least Cairo as the enterable starting port with trade
   (buying equipment, provisions and gifts for `$`), the automatic checkpoint
   on entry (`design.md` §18) and the aligned buy/sell dialogs of §9.
   Detail: docs/acceptance-criteria-detail.md §5.
   Evidence: docs/acceptance-evidence.md §5.

6. **Village and cultural contact.** At least one enterable village with a
   chief's hut where a culturally correct gift — not mere observation — is the
   condition for a hint (`design.md` §12), and a trading post that barters for
   gifts, not money (§9).
   Detail: docs/acceptance-criteria-detail.md §6.
   Evidence: docs/acceptance-evidence.md §6.

7. **Language and communication.** The tonal village speech of `design.md`
   §13.4 is implemented — heard, guessed at, never translated — beside the
   §13.1–13.3 direction words, glossary and retroactively deciphered hints,
   which still stand.
   Detail: docs/acceptance-criteria-detail.md §7.
   Evidence: docs/acceptance-evidence.md §7.

8. **Chronicle/journal.** A journal exists, grows automatically on events and
   stores hints (`design.md` §15), and every walkable place is journaled on
   its first entry in its own ~1890 voice (§16).
   Detail: docs/acceptance-criteria-detail.md §8.
   Evidence: docs/acceptance-evidence.md §8.

9. **Status bar.** Date, funds, provisions, gifts and current region are
   displayed per `design.md` §17.1 — no hand-item slot, no permanent
   coordinates — with the health bar and its affliction badges inside the
   bar's right end.
   Detail: docs/acceptance-criteria-detail.md §9.
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
    implemented: the ambient wildlife of §19.2–§19.8, §19.9's climate and
    landscape dressing, §2.4's "Graphics and atmosphere" and §4.4's
    elephant-graveyard dressing.
   Detail: docs/acceptance-criteria-detail.md §12.
   Evidence: docs/acceptance-evidence.md §12.

13. **Real geodata.** The real-geodata terrain rendering of `design.md` §3.3
    is implemented (DEM relief, ~1890 vector coasts/rivers/lakes without
    raster steps, biome-based PBR splatting).
   Detail: docs/acceptance-criteria-detail.md §13.
   Evidence: docs/acceptance-evidence.md §13.

14. **Lighting and post-processing pipeline.** The pipeline of `design.md`
    §2.7 is implemented (IBL, physically grounded sky, cascaded shadows,
    screen-space AO, bloom, filmic tone mapping, the water feature set), and
    its shader programs build OFF the startup critical path.
   Detail: docs/acceptance-criteria-detail.md §14.
   Evidence: docs/acceptance-evidence.md §14.

15. **Lively, densely built settlements.** The dense, lively settlements of
    `design.md` §2.6/§4.1/§19.10 and the §2.5 surroundings panorama are
    implemented — ports on an organic lane network, every village on its
    people's ~1890 organising principle (§4.5).
   Detail: docs/acceptance-criteria-detail.md §15.
   Evidence: docs/acceptance-evidence.md §15.

16. **Collision inside settlements.** The collision rules of `design.md` §2.6
    hold: oriented building boxes, a swept move that stops and slides at the
    first collider, the camera's near plane out of every wall, and no
    inhabitant ever stuck.
   Detail: docs/acceptance-criteria-detail.md §16.
   Evidence: docs/acceptance-evidence.md §16.

17. **Localization.** The game is fully playable in English as well as German
    per `design.md` §17.7, every player-visible text coming from the language
    files and another language requiring only a new file.
   Detail: docs/acceptance-criteria-detail.md §17.
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

19. **Journal voice markup and read-aloud.** The voice markup and read-aloud
    of `design.md` §15.2/§15.3 hold — every journal text carries the markers,
    the UI shows none, English entries auto-narrate via the in-browser Kokoro
    TTS — and the journal is non-modal (§16.1).
   Detail: docs/acceptance-criteria-detail.md §19.
   Evidence: docs/acceptance-evidence.md §19.

20. **Comfort and audio settings.** The control, audio, zoom and debug-menu
    calibration of `design.md` §2.2/§21 holds, every value editable while the
    game runs in both languages, with the §21.1 shortcuts — F6 the bug report,
    F8 the benchmark, F9 the graphics detail level.
   Detail: docs/acceptance-criteria-detail.md §20.
   Evidence: docs/acceptance-evidence.md §20.

21. **Water realism.** The water realism of `design.md` §11.3 holds — rivers
    in carved beds as one continuous ribbon, flat lakes, five foaming
    waterfalls — and the current pushes the traveller downstream over real
    distance without ever HOLDING him (§11.2).
   Detail: docs/acceptance-criteria-detail.md §21.
   Evidence: docs/acceptance-evidence.md §21.

22. **Health and afflictions.** The health system of `design.md` §6 is
    implemented: a health pool drained by starvation and the §6.2 afflictions,
    medicine and staged natural healing, regeneration, and the remains report
    with the successor on death.
   Detail: docs/acceptance-criteria-detail.md §22.
   Evidence: docs/acceptance-evidence.md §22.

23. **Random events.** `design.md` §14 is implemented as a hidden per-day roll
    while travelling — the §14.1 event kinds, the §14.2 item protection, the
    §14.4 first-time warnings and the §19.3 direct predator attack — off by
    default in the relaxed preset.
   Detail: docs/acceptance-criteria-detail.md §23.
   Evidence: docs/acceptance-evidence.md §23.

24. **Deadline and successor.** The multi-year deadline of `design.md` §5/§18
    is implemented (balance value, ~5 years) with its staged journal warnings,
    the recall on expiry and the §18 successor flow on death.
   Detail: docs/acceptance-criteria-detail.md §24.
   Evidence: docs/acceptance-evidence.md §24.

25. **Trade economy.** `design.md` §8/§9/§10 is implemented: treasure caches
    and ivory hauls, the capacity-limited inventory, the bazaar, the ferry
    passages, discovery bounties and first-sighting entries, and every
    settlement's baseline goods.
   Detail: docs/acceptance-criteria-detail.md §25.
   Evidence: docs/acceptance-evidence.md §25.

26. **Standing with the natives.** The reputation system of `design.md` §12 is
    implemented: hostility and expulsion on a rejected gift, the "Honored
    Friend" status with its regional protections, and the robbery with its
    permanent consequences.
   Detail: docs/acceptance-criteria-detail.md §26.
   Evidence: docs/acceptance-evidence.md §26.

27. **Camps (item caches).** The camps of `design.md` §6.3 are implemented:
    free camps pitched with C in the open with their per-day looting risk, and
    persistent village caches gated by "Honored Friend".
   Detail: docs/acceptance-criteria-detail.md §27.
   Evidence: docs/acceptance-evidence.md §27.

28. **Full saving and loading.** The port-snapshot saving and tabular load
    overview of `design.md` §18 are implemented — one snapshot per port visit,
    the overview table, manual saving omitted.
   Detail: docs/acceptance-criteria-detail.md §28.
   Evidence: docs/acceptance-evidence.md §28.

29. **Animated handwriting.** The animated handwriting of `design.md` §16.3 is
    implemented (stroke-by-stroke reveal behind the pen hand, click-to-finish,
    the wound level on the hand), and the journal keeps the newest content in
    view per §15.4.
   Detail: docs/acceptance-criteria-detail.md §29.
   Evidence: docs/acceptance-evidence.md §29.

30. **Gamepad and position query.** The gamepad controls of `design.md` §17.5
    hold (sticks merged with WASD and the first-person turn, mapped through
    synthetic key events), and the position query reports coordinates and
    region as a localized toast on P.
   Detail: docs/acceptance-criteria-detail.md §30.
   Evidence: docs/acceptance-evidence.md §30.

31. **Settlement orientation and panorama wildlife.** The gift-unlocked
    building orientation of `design.md` §17.3 holds, as does the §2.5 panorama
    wildlife — region-typical silhouettes drifting beyond the settlement edge,
    standing on the drawn ground and walking forward.
   Detail: docs/acceptance-criteria-detail.md §31.
   Evidence: docs/acceptance-evidence.md §31.

32. **Render pipeline upgrades.** TRAA, screen-space reflections and true
    water refraction (`design.md` §2.7) were rebuilt in small backend-neutral
    steps: step 1 (TRAA) is done and on by default, SSR was delivered and then
    removed, true refraction stays OPEN.
   Detail: docs/acceptance-criteria-detail.md §32.
   Evidence: docs/acceptance-evidence.md §32.

### 7.2 Self-Verification (mandatory)

After completion and after every major system:

- Run `npm run build` (no errors) and `npm run lint` always, plus
  `node scripts/audit-check.mjs` whenever the lockfile moved (nothing else moves
  that tree); all clean, per §7.1 point 18.
- Run `npm run test:unit` (the fast Vitest layer) green, adding or extending a
  test there for the changed logic/store/HUD.
- Verify the affected view headlessly (Playwright): it renders without console
  errors, and the core-view screenshots (bird's-eye, port city, village/chief's
  hut, opened journal) hold against §7.1. `npm test` chains all of it (§5).
- **Test at in-game-achievable conditions (point 172).** A verification must
  exercise a feature at a state the player can actually reach — for the
  bird's-eye zoom that is the NON-DEBUG range 0.125–0.5 (default 0.5), never a
  debug-only wide zoom unless the check tests that feature itself. Judge "is it
  in view" by PROJECTING the point to the rendered frame
  (`__camera.onScreen`/`ndc`), never by an assumed radius (100×zoom, fog.far, a
  fixed distance): clearView pushes the fog to the horizon at a wide zoom, so a
  green assertion against a radius can hide a bug the player sees (164/171).
- **A frame must show what its name claims (point 375).** The same projection
  decides at the SHUTTER: every frame declares its subject — a place/landmark
  (`world`), something inside a settlement (`local`/`place`), a HUD element, or
  explicitly a `general` view WITH its reason — and
  `scripts/verify/frameSubject.mjs` refuses to write a frame whose subject is not
  in the picture, naming what was found instead. Two `world` runs on identical
  code had photographed different places, both exiting 0. A unit-layer gate fails
  on any screenshot written outside the shutter.
- **Backend coverage is UNIVERSAL where it is possible (point 204).** WebGPU is
  the player's backend and WebGL 2 the shipped fallback, so both are verified:
  - Every browser suite launches through `launchVerifyBrowser()` and asserts the
    backend it got (`assertBackend`, right after the `window.__renderer` wait): a
    `VERIFY_GL=webgpu` run that fell back to WebGL 2, or a `webgl` run that came
    up on WebGPU, FAILS LOUD. Only `docs` (pure Node) and `preview` (production
    build, where `__renderer` is dev-only) are exempt.
  - The everyday lane is WEBGPU, the player's backend (user 09.08.2026): unpinned,
    the SMALL tier and a bare suite filter run there — every one-backend defect on
    record showed on WebGPU, never on WebGL 2 alone. WebGL 2 is the REGRESSION lane
    a LARGE covers (no `VERIFY_GL` pinned): the whole LARGE on WebGL 2 with
    preflight and preview, then the render suites on WebGPU. `touch`/`voice` are
    ROUTED to WebGL 2 wherever picked (headless WebGPU cannot drive them), never
    dropped from a tier.
    RESIDUAL: a WebGL-2-only regression surfaces only at the next LARGE.
  - The suite→tier→backend map is the pure `scripts/verify/tiers.mjs`, pinned by
    `tiers.test.mjs` in the Vitest layer; change it and
    `scripts/verify/README.md` together.
- **The Stop chain gates the turn end, not only the test run.** Beyond the
  suites, Stop hooks (authoritative list: `.claude/settings.json`) BLOCK a turn
  end while the working state contradicts a standing rule — "enforce, don't
  remind", each adopted after a reminder failed. **This paragraph names FAMILIES,
  not guards**: the enumeration that stood here had drifted four wired guards
  behind (30.07.2026). The families: the BOARD (published,
  concise, one topic per card, consistent with the real state, every decision
  asked of the user standing as a card); the BATCH (no idle wait or idle stop,
  the §6 model allowlist — a named breach pauses, an unnamed author is looked
  up — a red CI, a branch already contained in `main`, the retrospective's
  currency, the chat timestamp); the WORK ORDER (queue order, final-state-only specs,
  the open/archived split, the measured doc ceilings in
  `scripts/doc-budget-core.mjs`); the FINDING (a turn that investigated and left
  nothing durable, and a carrier the owner has not drained); and the
  PROOF (`render-verify-guard` for a
  render-set change on both backends where they can differ, and
  `mechanism-review-guard`, which lets no new or changed guard, gate or hook end
  a turn without the OTHER model's recorded review —
  `scripts/mechanism-review.mjs --record`). One is worth naming exactly:
  `ci-status-guard` watches EVERY ref the repository PUSHED, not just the
  session's HEAD (that blindness left 26 red runs on `main` unseen for three
  weeks), and demands a CONCLUDED green run for that sha; an unfinished one
  WAITS. Versioned git hooks (`scripts/git-hooks/`, wired by `npm
  install`) refuse a stray file, a trailer naming no model, a rescue commit that
  would mail the user, and a push CI would reject. Separately, PreToolUse hooks run `closing-guard` (§9),
  which denies a version tag until every closing step is recorded, and
  `board-first-guard`, which fires BEFORE the work, not at the turn end (the
  Stop chain lets the board lag an hour): a turn's FIRST state-changing call is
  denied while no `focus set|confirm` postdates the turn stamp, the board is
  unpublished, or the OPEN-POINT SET changed without a publish since (`publishDue`)
  — never a read, its remedy commands or a board-file edit, and at most ONCE per
  turn. It binds EVERY session (point 400): `scripts/board-publish.mjs` publishes
  from a SCRIPT, so the headless successor can too; the check reads that PAGE, and
  `batch-autostart.mjs` alerts when it is behind. It runs BACK too
  (`scripts/chat-core.mjs`): the launcher polls the chat each tick, handing on
  what VERIFIES as untrusted input, not authorization.
  Every one is fail-OPEN (a guard bug cannot trap the session) with a pure,
  Vitest-covered core.
- **Ask the guards BEFORE the action, and answer LAST (points 365/403).** Before
  an action a guard governs, `node scripts/guard-preflight.mjs --for <action>
  --session <id>` reports read-only whether one would block — advisory; the guard
  stays authoritative, and a blocked turn produces nothing (one loop cost ~30
  turns). The turn's END is such an action (`--for answer`): routine duties (focus
  confirm, board publish/attest, the boundary) FIRST, the closing reply LAST, once
  the chain would pass. Blocked anyway, the next message names what was fixed in
  one sentence.
- **Screenshot diffing is NOT available as a shortcut (point 361).** Every
  pixel-metric shortcut was replayed against the bugs the picture caught and
  REJECTED: two runs of one suite on identical code move 11–98 % of a frame,
  the smallest real defect 0.75 %. No golden-image gate until
  `node scripts/picture-stability.mjs <suite>` reports STABLE (verdicts:
  `docs/picture-check-levers.md`).
- **A red closes by a CAUSE, never by a later green (point 640).** Three closings
  only: the cause is named and fixed; it is CHARGED to the open point that owns it
  (`scripts/render-verify-charges.mjs`); or it becomes an open point. "It passed
  on the retry" is none — the retry stays, but that run is recorded SUSPECT and
  covers nothing; `--defer` WAIVES one on the record, it does not close it. Is it
  load? MEASURE: `node scripts/throttle-probe.mjs <suite> --section=<name> --runs
  8` reruns it pinned to one core and reports the skew rate.
- Fix deviations, never paper over them; an unfulfilled criterion is
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
- **Closing completeness is ENFORCED, not remembered (users 24.07./11.08.2026, points
  306/631).** A closing is a SEQUENCE, not a set: LARGE regression, then the legacy
  cleanup of ALL code and documents as a BLIND-PARALLEL four-eyes stage (§6), then
  a SECOND LARGE regression after the last cleanup commit — and only then the user's go
  for the tag. v0.2 skipped the cleanup; a skipped second regression tags untested
  changes. The checklist is machine-readable in `scripts/closing-guard-core.mjs`
  (`CLOSING_STEPS`) and its ORDER is checked: the `regression-after-cleanup` evidence
  must NAME the tagged commit or a time after the cleanup. A PreToolUse guard
  (`scripts/closing-guard.mjs`) DENIES a version tag (created, pushed, `poc` moved) AND
  the tick of a point that itself delivers one, until EVERY step is recorded for
  that commit. Drive it: `--status`, then `--step <id> --evidence "<proof>"`; a step a
  feature needs is added to `CLOSING_STEPS`, which tightens the gate.
- **Graphics detail-level doc current (user 24.07.2026).** Confirm
  `docs/graphics-detail-levels.md` still matches `QUALITY_PRESETS`
  (`src/config/quality.ts`); `src/config/qualityDoc.test.ts` proves it on every
  `npm run test:unit`, and the closing names it anyway, deliberately.

**Closing freeze (user decision 22.07.2026).** The code is FROZEN while a
closing runs: no agent work may land or merge, else the closing does not test
the FINAL state. Stop spawning agents, let in-flight branches merge or park
them; run the closing on the frozen `main`; resume the pool only AFTER it
completes.
