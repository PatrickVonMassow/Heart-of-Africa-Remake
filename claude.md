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
in-browser (WebGPU when available, WASM fallback). The model weights are
streamed from the Hugging Face CDN on first use and cached by the browser;
they are not part of the repository or the bundle. The TTS stack is loaded
lazily via dynamic import and must never enter the eagerly loaded startup
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
├── design.md          (target state; updated on user change requests)
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

Game code is organized by topic (e.g. `src/world/`, `src/places/`,
`src/journal/`, `src/systems/`, `src/ui/`). No monolith file.

---

## 5. Commands

```
npm install            # dependencies
npm run dev            # dev server (usually http://localhost:5173)
npm run build          # production build (must pass without errors)
npm run preview        # check the production build locally
```

The TypeScript build must pass without errors. `npm run build` is part of
acceptance (§7).

---

## 6. Working Method

- Work incrementally: small, topically well-scoped commits. Commit after
  each self-contained system. Prerequisite is an initialized git repository
  with an initial commit of the scaffold, `design.md` and `CLAUDE.md`; if
  none exists, run `git init` first and create that initial commit. No
  automatic push to a remote.
- **Language.** All player-visible text (UI, chronicle, messages) is served
  from the language files (`design.md` §17): German is the default game
  language, English is available, and the structure must make further
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
  markup; the read-aloud pipeline (parser → TTS text → audio,
  `src/journal/voiceMarkup.ts` → `src/journal/speech.ts`) turns it into
  prosody. This rule applies to German too, even while no German TTS voice
  exists yet.
- Keep comments brief and factual. Mark placeholder values as such.
- After each major system, run the self-verification (§7.2) and record the
  result.
- When the design is unclear, do not guess: leave an open item in the code
  (`// OPEN: …`) and in a list at the end of the run.

---

## 7. Acceptance

### 7.1 Acceptance Criteria (POC target)

The POC counts as fulfilled when all points verifiably hold. Details per
`design.md`; only the verifiable condition is stated here.

1. **Build/start.** `npm install`, `npm run dev` and `npm run build` run
   without errors. The application loads without console errors.
2. **Two perspectives.** Bird's-eye view (3D travel across the continent)
   and first-person view (walkable settlement) exist, and switching between
   them works when entering/leaving a settlement.
3. **World model.** Fixed geographic locations of the landscape elements per
   `design.md`; the concrete appearance must be graphically elaborate,
   Africa must be depicted in detail and authentically, and the outlines of
   all land and continent regions must be fine-grained, including the
   courses of the rivers. A coordinate display (latitude/longitude in
   degrees) is present. Research what the exact geography of Africa was at
   the end of the 19th century. All 10 port cities, 22 peoples, 17 rivers
   and every landmark from `design.md` must be implemented.
4. **Movement and time.** The character moves in the bird's-eye view; date
   and provisions advance with the journey (calendar display, start 1890 per
   `design.md`).
5. **Port city.** At least Cairo as the enterable starting port with trade
   (buying equipment, provisions and gifts for `$`). Entering triggers the
   automatic checkpoint (simplified saving is sufficient).
6. **Village and cultural contact.** At least one enterable village with a
   chief's hut. A culturally correct gift to the chief unlocks a hint — not
   mere observation: the gift is the condition.
7. **Language/direction system.** The region's direction/language system
   (Nivera/koko/Katula per `design.md`) is implemented rudimentarily: at
   least one hint can be decoded and translated into a target direction/
   position.
8. **Chronicle/journal.** A journal exists, grows automatically on events
   and stores hints. The handwritten entry may be simplified in the POC
   (plain text suffices; the animated handwriting is not acceptance-
   relevant).
9. **Status bar.** Date, funds, provisions, gifts, hand item and current
   region are displayed.
10. **Goal scaffolding.** A procedurally placed goal (the tomb) exists;
    digging it up with the shovel at the site triggers the victory state.
    Full triangulation of several hints is not required in the POC — a
    single decoded hint leading to the site suffices.
11. **Game graphics.** The visual presentation must be appealing and
    elaborate at AAA level and replace the POC's former schematic look.
    This includes smoothing the geometry of the continent and the rivers,
    which previously showed visible steps.
12. **Atmosphere.** The atmosphere elements from `design.md` are
    implemented — specifically "## 19. Atmosphere and Immersion" and the
    "**Graphics and atmosphere.**" passage in "## 2. Perspectives and
    Camera".
13. **Real geodata.** The passage "**Real geodata and terrain rendering.**"
    in "## 3. World Model and Map" (`design.md`) is implemented: elevation
    relief from a real DEM (tile-based, LOD-streamed), coasts/rivers/lakes
    from vector data in their ~1890 state without visible raster steps,
    ground rendered via biome-based PBR texture splatting with detail
    normal maps. Verifiable: screenshots of the Nile delta, a rift edge and
    a coastline show smooth, real courses and textured ground instead of
    vertex colors; the geodata preprocessing is reproducibly documented in
    the repository.
14. **Lighting and post-processing pipeline.** The passage "**Lighting and
    post-processing pipeline.**" in "## 2. Perspectives and Camera"
    (`design.md`) is implemented: image-based environment lighting (IBL), a
    sky from a physically grounded scattering model consistent with the sun
    position, cascaded shadows in the bird's-eye view, screen-space AO,
    bloom, filmic tone mapping with color grading and a subtle vignette,
    plus water with a wave field, depth-dependent absorption (real
    bathymetry) and foam along shores and wave crests. Verifiable:
    screenshots of both perspectives show the active effects; the
    application runs without console errors on both the WebGPU and WebGL 2
    paths; simplifications (e.g. TAA, true screen-space reflection/
    refraction) are named as open items.
15. **Lively, densely built settlements.** The passage "**Lively, densely
    built settlements (first-person).**" in "## 2. Perspectives and Camera"
    (`design.md`) is implemented: the first-person view shows far more
    buildings than just the functional ones — additional non-enterable
    dwellings and outbuildings in region-typical, procedurally varied
    density — a recognizable street/path network, and inhabitants who move
    believably through the settlement, entering and leaving their homes.
    The enterable functional buildings remain clearly highlighted.
    Verifiable: screenshots of a port city and a village show dense
    building fabric with paths and several non-functional buildings;
    inhabitants move about and use their dwellings; the application loads
    without console errors.
16. **Collision inside settlements.** The collision point of the passage
    "**Lively, densely built settlements (first-person).**" (`design.md`
    §2) is implemented: neither the player character nor the inhabitants
    pass through buildings or solid objects inside settlements (huts,
    fences, trees, rocks, fire pit); movement slides along obstacles;
    inhabitants never get permanently stuck; the accesses to the enterable
    buildings and the settlement exit remain reachable. Verifiable: an
    automated run steers the player character against a building and proves
    it stays outside the collision radius; interaction with all functional
    buildings remains possible; the application runs without console
    errors.
17. **Localization.** The game is fully playable in English as well as
    German (`design.md` §17): all player-visible text comes from the
    language files, the debug menu switches the language at runtime
    (default: German), journal entries are stored language-neutrally and
    re-render in the selected language, and proper names of places and
    landmarks are localized (e.g. "Kairo"/"Cairo",
    "Kilimandscharo"/"Kilimanjaro"). Adding another language must require
    only a new language file. Verifiable: screenshots of the status bar,
    journal, a trade dialog and the map in both languages; no hardcoded
    player-visible strings outside the language files (spot check); the
    application runs without console errors in both languages.
18. **Lint and dependency hygiene.** The codebase is free of linter
    findings and known vulnerabilities: `npm run lint` (oxlint) reports
    zero errors and zero warnings, and `npm audit` reports zero
    vulnerabilities (CVEs) in the dependency tree. This holds not only at
    acceptance but after **every** change; both checks are part of the
    self-verification (§7.2). If a vulnerability has no upstream fix, it
    is recorded as an open item with its advisory ID instead of being
    ignored silently.
19. **Journal voice markup and read-aloud.** All journal texts in both
    language files carry the emotional voice markup (`design.md` §15); the
    UI never shows a marker; in the English version every journal entry can
    be read aloud via the in-browser Kokoro TTS, with the markup audibly
    shaping the delivery (pauses, pace, loudness, punctuation). Verifiable:
    spot check of both language files for markers; journal screenshot free
    of visible tags; starting narration produces audio without console
    errors. German read-aloud stays an open item until a German-capable
    voice exists.

### 7.2 Self-Verification (mandatory)

After completion and after every major system:

- Run `npm run build` and confirm it passes without errors.
- Run `npm run lint` and `npm audit` and confirm both are clean (zero
  lint errors/warnings, zero vulnerabilities) per §7.1 point 18.
- Start the dev server and verify via headless screenshot (e.g. Playwright)
  that the affected view renders without console errors.
- Store screenshots of each core view (bird's-eye view, port city,
  village/chief's hut, opened journal) and check them against the criteria
  of §7.1.
- Fix deviations, do not paper over them. An unfulfilled criterion is
  reported as such.

---

## 8. Explicitly Outside This Run

- Multiplayer in any form.
- Onboarding, tutorials, lowering of the entry barrier.
- Animated handwritten journal entries with blood traces (§16 `design.md`).
- Full balance calibration; a debug menu (§21 `design.md`) beyond what §2
  and the verification require. (Audio, dynamic music and ambient wildlife
  were formerly listed here; they became part of the target via criterion
  §7.1 pt. 12 and are implemented.)
- A tabular load menu beyond the simple checkpoint.

These points are not to be started, not even partially, as long as the
acceptance criteria of §7.1 are not fully met.

---

## 9. Closing the Run

At the end:

- Confirm which criteria of §7.1 are fulfilled, with screenshot evidence.
- List the collected open items (`// OPEN: …`).
- Name the simplifications made and the placeholder values set.
- No silent extensions beyond §7.1.
