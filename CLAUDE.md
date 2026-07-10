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
segment and plays back the returned PCM. WebGPU is used only on Chromium
(the onnxruntime WebGPU compute path — distinct from the three.js renderer's
WebGPU — is unreliable on Firefox/Safari even where `navigator.gpu` exists),
and every other browser uses the WASM path; the device is decided on the main
thread and passed to the worker. The model weights are
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
npm run test:unit      # fast Vitest layer (jsdom): logic, store, HUD components
npm test               # full regression: build + lint + vitest, then browser suites
```

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

- Work incrementally: small, topically well-scoped commits. Commit after
  each self-contained system. Prerequisite is an initialized git repository
  with an initial commit of the scaffold, `design.md` and `CLAUDE.md`; if
  none exists, run `git init` first and create that initial commit.
  **Every commit is immediately pushed to the remote (`git push`).** If no
  remote is configured or the push fails, report that instead of skipping
  it silently.
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
here); each point states the verifiable acceptance condition and the
verify suite that proves it.

1. **Build/start.** `npm install`, `npm run dev` and `npm run build` run
   without errors. The application loads without console errors.
2. **Two perspectives.** Bird's-eye view (3D travel across the continent)
   and first-person view (walkable settlement) exist; switching between
   them happens through movement alone per `design.md` §2.3 (walk in /
   walk out, buildings open by walking against their door, only the elder
   keeps the interaction key, and a just-left settlement stays closed to
   re-entry until the traveller has moved clear — a calibratable clearance
   beyond the enter radius). Entering focuses the controls without an
   extra click per `design.md` §17.5 (HUD buttons blurred; pointer lock
   stays a deliberate click). Verifiable: an automated run walks into a
   place and into a building's door and enters both, and walks past the
   settlement edge to leave, without any key press; standing on the
   just-left marker does not re-enter until the traveller has moved clear;
   on entering, no HUD control (button/input) retains focus
   (`scripts/verify/flow.mjs`).
3. **World model.** The fixed, authentic ~1890 geography of `design.md`
   §3.1/§3.2 — researched against the real end-of-19th-century state —
   with all 10 port cities, 22 peoples, 17 rivers and every landmark of
   §4, graphically elaborate with fine-grained land outlines and river
   courses. Region borders carry the localized region name on each side of
   the line in both views (§3.2); map-point labels are discovery-gated
   (§17.2); coordinates are read out on demand via the position query
   (§3.2, pt. 30), never shown permanently. Verifiable: near a border,
   `.region-label` elements name both regions on their sides; undiscovered
   `.map-label` elements read "?", a visited place (Cairo) shows its name,
   and sighting a landmark reveals its name
   (`scripts/verify/enrichments.mjs`).
4. **Movement and time.** The character moves in the bird's-eye view; date
   and provisions advance with the journey (calendar display, start 1890).
   The movement boundary of `design.md` §11.2 holds (enclosed sea
   swimmable only within the calibratable coastal band, open ocean
   blocks, the Red Sea cut of §3.1/§11.2: everything northeast of the
   African Red Sea coast is blocked ocean, never inland water, and the
   §3.1 world trim: no land renders outside the game's land masses), as
   do the ropeless mountain climb with
   its warning and fall risk (§7/§11), the visible movement-penalty reason
   incl. the canoe-on-land penalty and its once-per-type journal
   announcement (§11.1, both languages, voice markup, flag in the
   checkpoint), and possession-based item effects (§6.1/§7 — no "in hand"
   state). Verifiable: an automated move on enclosed sea advances the
   position, a move on open ocean is refused with the blocking notice, a
   move onto a mountain without a rope advances (with the warning) while
   the rope makes it faster, and a forced fall wounds the traveler and can
   drop an item; the penalty mapping is pure-tested for each terrain
   (incl. the canoe-on-land penalty on every land type), a canoe run on
   savanna covers clearly less ground than without it (the land malus is
   real, not just a hint), the top-right HUD hint appears in jungle
   without a machete and clears once the machete is in the pack, and a
   first jungle entry adds exactly one journal warning while a later entry
   adds none (`scripts/verify/enrichments.mjs`); the Red Sea cut and
   world trim are pure-tested at the acceptance coordinates — mid Red
   Sea, Sinai, the Arabian peninsula and the Gulf of Aden are blocked
   ocean (Sinai/Arabia trimmed in the DEM, so no land route rounds the
   Red Sea; shallow sea northeast of the boundary reads as deep open
   ocean), foreign land (southern Spain, Sicily, Crete, the Canaries,
   the Comoros … and the unreachable Madagascar) samples as ocean while
   the game's reachable islands stay land,
   no trimmed texel borders kept land outside the Suez isthmus gate (no
   ocean scrap juts into the coast), the Nile delta and the African Red
   Sea coast stay walkable land, nearshore sea swims while far-offshore
   sea blocks even inside the hull (the margin edits at runtime), and
   the hull rules for the open Atlantic and the Mozambique channel are
   unchanged (`src/world/redSea.test.ts`).
5. **Port city.** At least Cairo as the enterable starting port with trade
   (buying equipment, provisions and gifts for `$`). Entering triggers the
   automatic checkpoint (`design.md` §18; simplified saving is
   sufficient). Buy dialogs use the aligned price-table layout and buy
   gear back for the local currency per §9. Verifiable:
   `scripts/verify/flow.mjs` asserts the price cells share a column
   (aligned left edges); `scripts/verify/economy.mjs` asserts selling gear
   in a port pays money.
6. **Village and cultural contact.** At least one enterable village with a
   chief's hut; a culturally correct gift is the condition for a hint —
   not mere observation (`design.md` §12). The village trading post
   barters the baseline goods for gifts and buys gear back for gifts —
   money has no value there (§9). Verifiable: `scripts/verify/economy.mjs`
   buys food in a village against gifts (money untouched), refuses a
   purchase without gifts, and sells gear for gifts.
7. **Language/direction system.** The full system of `design.md` §13 is
   implemented: the regional direction systems and glossary names of
   §13.2, taught by the village elder (a second talk reveals what the
   region reveres, §8); hints combine landmark, direction word and
   coordinate (§13.1); a raw hint deciphers retroactively in either order
   (§13.2). Verifiable: `scripts/verify/hints.mjs` covers all five
   regions, the retroactive deciphering, the gift lore and the in-world
   words in the rendered journal.
8. **Chronicle/journal.** A journal exists, grows automatically on events
   and stores hints (`design.md` §15); plain text suffices here (the
   animated handwriting is pt. 29). First village visits are journaled
   through that people's own ~1890 vignette (§16), never a shared
   boilerplate. Verifiable: `src/i18n/villages.test.ts` asserts one
   distinct, markup-clean text per village in both languages, and
   `src/state/store.travel.test.ts` that the entry carries its people.
9. **Status bar.** Date, funds, provisions, gifts and current region are
   displayed per `design.md` §17.1 — no hand-item slot, no permanent
   coordinates (removed on user request); transient status hints (e.g.
   the movement-penalty reason, pt. 4) render as a right-aligned item
   inside the status bar itself, not in a separate floating panel; the
   inventory item currently in use glows (§17.1). Verifiable: the hint
   element is a descendant of `.status-bar` and its box stays within the
   bar's box, and a canoe on water / medicine while afflicted gains
   `.inv-active` while an idle item does not
   (`scripts/verify/enrichments.mjs`).
10. **Goal scaffolding.** A procedurally placed goal (the tomb) exists;
    digging it up with the shovel at the site triggers the victory state.
    The site is triangulated from several hints via the knowing-people
    cascade of `design.md` §13.3. Verifiable: `scripts/verify/hints.mjs`
    asserts that the deciphered latitude and longitude equal the actual
    grave position and that non-knowing chiefs point to the knowing
    people; `scripts/verify/flow.mjs` plays the full loop (gift → lesson →
    deciphered latitude, the East leg for the longitude, then the dig).
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
    at a glance). Verifiable: automated checks force the feed state
    (carcass, head animation, stain in the local ground slope, leave
    phase), provoke a trampling via an injected elephant, prove an
    elephant herd roams together (its centre moves, it stays clustered,
    and it turns only in gentle arcs) and that prey ignore a distant
    elephant but dart away from a close one (last-moment dodge) while
    holding one steady escape direction rather than oscillating ~90°
    between two flanking herd-mates — with the RENDERED facing itself
    sampled under the universal turn cap through engage and disengage (no
    snap when a flight ends), a tailing elephant unable to flap the dodge
    at its ring (exit hysteresis), and an elephant's facing tracking its
    roam heading; assert that lion hunts run in varied directions (low
    mean-resultant length across hunts) with a weaving prey (its heading
    oscillates around straight-away), that the lion takes more than one
    kind of prey and every hunted species fits the region's pool; prove
    the zoom-aware streaming despawn (an animal survives a tile-boundary
    crossing while in view, despawns once well outside it, and a wider
    zoom keeps animals the default view would have dropped) — with the
    scripted predator obeying the same ring: after feeding it walks off
    and is removed only beyond it, and a strayed chase aborts the same
    way; that a non-lion (trampled) carcass draws a vulture that lands and
    consumes it until it is removed — with the vulture spawning beyond the
    zoom-aware view ring and flying in (no popping in), flying off after
    the meal and despawning only well outside the view, and the
    kill-circling flock flying the same in/out pattern; that a finished
    hunt leaves a small prey remnant at the kill site which the scavenger
    then finds and finishes (and a feed that ends without a kill leaves
    none); that carcasses left far off-screen are culled while a visible
    one is kept (so kills stay bounded and never stall the frame loop);
    that more than one kind of predator hunts and every predator/prey
    pairing fits the region and the predator's food web; that prey flee a
    predator smoothly without teleporting (no single-frame jump); that
    herds raise young that keep close to a parent and that a parent moves
    to interpose between an approaching predator and its calf; assert the
    calf predation of §19.8 — a caught calf struggles alive (no stain or
    shrink) for a few seconds before the kill, a parent that reaches the
    predator is eaten in the calf's place while the calf escapes, a parent
    that only got close by the window's end is eaten alongside the calf,
    and the full LionHunt path runs a calf down and catches it — with the
    hunted calf visibly fleeing the chase (slower than its hunter) instead
    of standing at its parent, and the escorting parent standing clear of,
    but near, the calf at the catch so the rescue charge is a visible run
    over real time; assert the calf water drama of §19.8 — calves gambol
    in visible hop-bouts, a calf on open water starts a struggle and its
    parent wades in, pulls it out and both return to the bank alive, in
    the water inside a waterfall's reach a calf is swept over and dies
    with its parent plunging after it, and a rescuing parent wading into
    the falls' reach is swept over itself while its calf survives; assert
    the animal body separation of §19.5 — streamed animals keep their body
    spacing after spawn (no two inside one another) and an animal placed
    onto another parts from it within moments, while the elephant trample
    remains possible; assert that an animal on an open-ocean cell is set
    back to the nearest land (no animal strays into the impassable sea,
    and the scripted hunt's prey balks at the waterline); that some shore
    visitors bathe (wade in) beyond merely drinking; and assert the
    graveyard's carcass/tusk/bone counts via the dev hook with a
    screenshot (`scripts/verify/settings.mjs`,
    `scripts/verify/enrichments.mjs`). OPEN: tree-climbing-to-flee and
    additional new species/birds beyond the existing roster and the added
    calves remain to be implemented (§9 open items).
13. **Real geodata.** The real-geodata terrain rendering of `design.md`
    §3.3 is implemented (DEM relief, ~1890 vector coasts/rivers/lakes
    without raster steps, biome-based PBR splatting, domain-warped
    meandering biome borders). Verifiable: screenshots of the Nile delta,
    a rift edge and a coastline show smooth, real courses and textured
    ground instead of vertex colors; a pure-threshold biome edge (the
    south desert) is sampled across latitudes and its longitude varies
    rather than running straight (`scripts/verify/enrichments.mjs`); the
    geodata preprocessing is reproducibly documented in the repository.
14. **Lighting and post-processing pipeline.** The pipeline of `design.md`
    §2.7 is implemented (IBL, physically grounded sky consistent with the
    sun, cascaded shadows in the bird's-eye view, screen-space AO, bloom,
    filmic tone mapping with color grading and a subtle vignette, and the
    water feature set: wave field, depth-dependent absorption over real
    bathymetry, shore/crest foam). Verifiable: screenshots of both
    perspectives show the active effects; the application runs without
    console errors on both the WebGPU and WebGL 2 paths; simplifications
    (e.g. TAA, true screen-space reflection/refraction) are named as open
    items (see pt. 32).
15. **Lively, densely built settlements.** `design.md` §2.6 (dense
    non-functional building fabric, a recognizable path network,
    inhabitants who believably use the settlement and their homes, clearly
    highlighted functional buildings), §4.1 (settlement size mirrors real
    ~1890 importance; enlarged ports outscale villages), §19.10 (the
    village life vignettes) and §2.5 (the surroundings panorama of the
    real map landscape, its relief capped and double-sided) are
    implemented. Verifiable: screenshots of a port city and a village show
    dense building fabric with paths and several non-functional buildings;
    inhabitants move about and use their dwellings; Cairo's walkable
    radius and dwelling count exceed Boma's; the backdrop mesh is present
    and Berber Village's backdrop stays a low horizon range (max elevation
    angle bounded); the application loads without console errors
    (`scripts/verify/enrichments.mjs`).
16. **Collision inside settlements.** The collision rules of `design.md`
    §2.6 are implemented (impenetrable buildings and solid objects,
    sliding movement, inhabitants never permanently stuck, reachable
    accesses and exits, inhabitants entering dwellings through their door
    while the player cannot, and every door oriented onto reachable free
    ground). Rectangular buildings collide as oriented boxes (exact
    corners, no gaps), and the clearance keeps the camera's near plane out
    of every wall — pressing against a building must never show its
    inside. Verifiable: an automated run steers the player character
    against building walls and corners and proves it keeps positive
    clearance; an observed inhabitant transitions walk → inside at its
    dwelling and out again; interaction with all functional buildings
    remains possible; every dwelling door (port and village) has a
    collision-free standpoint inside the walkable area; the application
    runs without console errors (`scripts/verify/collision.mjs`).
17. **Localization.** The game is fully playable in English as well as
    German per `design.md` §17.7 (all player-visible text from the
    language files, runtime language switch defaulting to English,
    language-neutral journal storage re-rendered on switch, localized
    proper names; another language must require only a new language
    file). Verifiable: screenshots of the status bar, journal, a trade
    dialog and the map in both languages; no hardcoded player-visible
    strings outside the language files (spot check); the application runs
    without console errors in both languages.
18. **Lint and dependency hygiene.** The codebase is free of linter
    findings and known vulnerabilities: `npm run lint` (oxlint) reports
    zero errors and zero warnings, and `npm audit` reports zero
    vulnerabilities (CVEs) in the dependency tree. This holds not only at
    acceptance but after **every** change; both checks are part of the
    self-verification (§7.2). If a vulnerability has no upstream fix, it
    is recorded as an open item with its advisory ID instead of being
    ignored silently.
19. **Journal voice markup and read-aloud.** The voice markup and
    read-aloud of `design.md` §15.2/§15.3 hold: every journal text in both
    language files carries the markers, the UI never shows one, English
    entries narrate via the in-browser Kokoro TTS with the markup shaping
    the delivery, a new entry auto-narrates without a click, and narration
    blocked by the autoplay policy is deferred to the first gesture
    instead of dropped. The journal is non-modal per §16.1 (movement
    continues, only modal dialogs block; walking a door open works with
    the journal open), and the panel ends above the camp/journal toggles
    per §17.4. German read-aloud stays an open item until a German-capable
    voice exists. Verifiable: spot check of both language files for
    markers; journal screenshot free of visible tags; starting narration
    produces audio without console errors; adding an entry switches its
    read-aloud control into the speaking state without a click; the start
    entry narrates on the first gesture; with the journal open at game
    start, driving movement still advances the player position
    (`scripts/verify/voice.mjs`); walking into a hut door with the journal
    forced open still opens the building (`scripts/verify/flow.mjs`); with
    the journal open, the `.journal` panel's bottom edge sits above the
    `.camp-toggle` and `.journal-toggle` button tops and its right edge
    keeps a gap to the screen edge (`scripts/verify/enrichments.mjs`).
20. **Comfort and audio settings.** The control/audio calibration holds:
    mouse-look sensitivity defaults to 0.0011 rad/px, walk speed inside
    settlements to 10 m/s, strafing and walking backward to 80 % of the
    forward speed (a diagonal is never faster than straight; `design.md`
    §2.2), the first-person eye height is 1.5 m, a single ambience volume
    (default 0.1) scales the whole soundscape incl. the §19.1 proximity
    calls (a nearby animal's own call rises and fades with distance), the
    overland travel speed defaults to 5.6 (calibrated calm), and the
    terrain relief items are tunable as factors (§11/§21.2). All of these
    are adjustable at runtime in the debug menu (§21) in both languages.
    The zoom behavior of §21.4 holds: the bird's-eye mouse-wheel zoom is
    always active (0.25x-16x) with a debug checkbox gating zoom-out beyond
    factor 1 (disabling clamps a wider view back), the unlocked range
    reaches a whole-continent view (coarse far-terrain sheet, glassy sea,
    fog receding to the horizon and ground haze fading, both returning as
    the zoom drops back), and the camera near plane snaps back to the
    first-person default the moment another scene takes the shared camera
    — entering a settlement straight out of the debug zoom must never clip
    hut walls. The debug menu offers the §21.3 dropdown selectors
    (jump-to: ports/villages, the elephant graveyard and the tomb;
    equipment; gifts), the read-only render-backend row and the journal
    do-not-disturb option (§16.2; also F2); the §21.1 shortcuts hold (F1
    menu, F2 do-not-disturb, F3 full loadout — all gear/treasures, 100000
    gifts/dollars/provisions, full health, full canteen, no afflictions,
    capacity raised to fit, and the extended zoom unlocked — F4 canoe
    toggle); the canteen's consumption
    rates and capacity are editable (§21.2). Modal windows and full-screen
    overlays always render above the in-scene floating labels (§17.4).
    Verifiable: `scripts/verify/settings.mjs` asserts the defaults
    (including the single ambience volume 0.1, the 5.6 travel speed, the
    canoe speed-up factor 3, the jungle/mountain factors and the canteen
    capacity 500), the eye height, the 80 % strafe/backward factor (exact
    via the pure velocity helper, plus an in-scene smoke check that both
    directions move), the canoe and jungle factor fields edit at runtime,
    the F3 full loadout, the F4 canoe toggle, the Tab journal toggle
    (opens/closes without shifting focus onto a control, and does not
    toggle while a debug field is focused; `design.md` §17.5), the working
    debug-menu controls in both languages, that a nearby animal raises its
    proximity call and it fades once the player leaves, and the lion-feed
    depiction (pt. 12); `scripts/verify/enrichments.mjs` asserts the zoom
    gate, at the zoom cap the built and visible far sheet, a fog far plane
    beyond 2000 and haze opacity ~0 with a screenshot (87), during a
    zoomed walk the water plane's scale uniform tracking its mesh scale
    (no sea/land drift) and the chunk-bound dressing hidden, the
    reversion at zoom 1 (haze, far sheet and dressing), the far sheet's
    chunk-matched ground tone (`src/scenes/travel/farColor.test.ts`,
    pure), the F3 zoom unlock (`src/ui/Hud.test.tsx`), the dropdowns, the
    renderer row, and that with a
    settlement label hit-tested on top, opening a modal makes the dialog
    the topmost element at that point; `scripts/verify/collision.mjs`
    additionally proves corner clearance at box buildings and an
    inhabitant re-entering its dwelling (pt. 16); `scripts/verify/
    voice.mjs` proves the automatic narration of a new entry (pt. 19).
21. **Water realism.** The visual water realism of `design.md` §11.3 is
    implemented (rivers in carved beds rendering as one continuous,
    unbroken ribbon descending from source to mouth, bridged stray sea
    points, a calm surface with a visible current strengthening at rapids
    and falls, five white waterfall cascades with plunge-pool foam,
    springs in open land, flat lake surfaces just above their carved
    beds), as is the current's effect on movement (§11.3): a passive
    downstream drift every frame, scaled by the nearest river segment's
    downstream direction and boosted near waterfalls (calibratable balance
    values: `currentDrift`, `currentWaterfallBoost`,
    `currentWaterfallRadius`), covering real distance so it advances time
    and provisions (and ticks health/deadline) — never free movement.
    Being swept over falls is gameplay via pt. 23 (waterfall-sweep event).
    Verifiable: `scripts/verify/enrichments.mjs` asserts 5 cascades, at
    least one spring and 8 lake surfaces, that no river has an interior
    gap and no river surface is buried, that every lake surface clears its
    interior bed, and that the Nile is a single continuous strip, via the
    dev hook; screenshots of the Nile, Victoria Falls and Lake Victoria
    (71-73) show the courses; an idle traveller on a river is swept
    downstream, the drift near a waterfall exceeds the unboosted drift,
    and being swept consumes time and provisions.
22. **Health and afflictions.** The health system of `design.md` §6 is
    implemented: a health pool drained by starvation and the afflictions
    of §6.2 (fever delirium, dehydration with the canteen fill mechanics
    and low-fill warnings of §6.1, sun blindness healing only outside the
    desert, light/severe wounds), medicine as the instant cure, the staged
    natural wound healing of §6.2 (calibratable, debug-editable day
    counts — a wound alone is never an unavoidable death), regeneration
    while fed and affliction-free, the remains report and successor on
    death (§15.6), the health query (H), and vultures circling at poor
    condition (§19.6); health/afflictions travel with the checkpoint; all
    drains/thresholds are balance values adjustable in the debug menu,
    which also toggles afflictions for testing. Verifiable:
    `scripts/verify/health.mjs` asserts defaults, dehydration
    onset/recovery, the canteen fill draining away from water, emptying
    into thirst then health loss, and refilling at fresh water,
    regeneration, fever drain and medicine cure (and
    `src/state/store.health.test.ts` the staged natural wound healing:
    light heals fed, severe eases to light, starving blocks it), the
    sun-blindness veil and its recovery, vultures, the H query and the
    death/successor flow.
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
    calibrated low so events are rare (§14.3); the debug menu can toggle
    the events and trigger each kind directly (§21.3). Verifiable:
    `scripts/verify/events.mjs` asserts the reduced rates, the protection
    ordering (pure functions), deterministic outcome mapping, the
    plains-predator danger order (cheetah < leopard < hyena < lion) with
    the lion's wider fatal band, the consequences of each trigger, a fatal
    attack, autonomous firing while travelling, silence when disabled, and
    that pinning a lion — and a hyena — on the player triggers that
    predator's attack; `scripts/verify/enrichments.mjs` asserts each
    first-time danger warning fires exactly once and marks its flag;
    `src/state/store.events.test.ts` asserts the canoe-aware water warning
    fires — once — and the advising text does not.
24. **Deadline and successor.** The multi-year deadline of `design.md`
    §5/§18 is implemented (balance value, ~5 years) with staged journal
    warnings at 60 % and 85 % of the granted time — each exactly once, in
    both languages — the recall on expiry (defeat overlay, journal silent,
    no successor), and the §18 successor flow on death (pt. 22): resume at
    the last checkpoint, day penalty, silently inherited warning stage,
    takeover entry. Verifiable: `scripts/verify/expedition.mjs` asserts
    the staged warnings (exactly once each), the expiry defeat without
    successor, and the death-to-successor flow including the day penalty
    and takeover entry.
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
    transfer whose journal entry names the discoveries and the amount, and
    kind-flavored first-sighting entries for landmarks (§10, once per
    landmark, both languages, voice markup); the valuable-presentation
    reactions of the §8 matrix; and the baseline goods in every settlement
    with money in ports and gifts in villages (§9). All new texts exist in
    both languages with voice markup. Verifiable:
    `scripts/verify/economy.mjs` asserts the capacity refusal and
    auto-raise, the regional bid ordering and rejection, the stable
    re-offer quote (identical price across re-offers, cleared on leaving
    the port), the ferry to Zanzibar (fare, days, checkpoint), the bounty
    crediting and its telegraphic-transfer report naming the discoveries,
    the graveyard's random ivory haul (range 1..9, mean ~5) and its cap by
    the remaining supply, digging a treasure cache and the statue site,
    both valuable reactions, the baseline goods in every settlement,
    buying food in a village against gifts (money untouched), the no-gifts
    refusal, and selling gear for gifts (village) or money (port);
    `src/state/store.travel.test.ts` asserts the landmark-sighting entry
    with its kind for a mountain and a waterfall and that it fires only
    once.
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
    voice markup. Verifiable: `scripts/verify/reputation.mjs` asserts a
    rifle in the pack does not block the elder talk or audience, the
    hostility/expulsion and its wear-off, the friend pledge (exactly
    once), the capped attack outcomes with rescue entries, the near-death
    aid, the free village supplies, the confirmation gate on the Rob
    button and the rich money/gifts/provisions haul, and the permanent
    robbery consequences including the forfeited friendship.
27. **Camps (item caches).** The camps of `design.md` §6.3 are
    implemented: free camps pitched (or reopened nearby) with C in the
    open, holding any number of inventory items (taking back respects the
    inventory capacity; storing the canoe leaves it behind, dropping its
    land penalty), marked with the map X and the bird's-eye pole marker,
    with the per-day looting risk (balance value) revealed by a journal
    entry on return; village caches gated by "Honored Friend", persistent,
    and irretrievably destroyed by a robbery in the region. All new texts
    exist in both languages with voice markup. Verifiable:
    `scripts/verify/camps.mjs` asserts pitching and reopening,
    storing/taking incl. the capacity refusal and the canoe put-away, the
    loot-and-discover flow with its journal entry, the map X, the friend
    gate on village caches, their persistence, and their destruction by
    the robbery.
28. **Full saving and loading.** The port-snapshot saving and tabular load
    overview of `design.md` §18 are implemented — one snapshot per port
    visit (a placeholder cap keeps only the most recent ones), the
    overview table with port city, in-game date, money, food, gifts and
    health state, manual saving omitted. A legacy single-slot checkpoint
    migrates as one table row; the successor (pt. 24) resumes from the
    latest snapshot. All menu texts exist in both languages. Verifiable:
    `scripts/verify/saveload.mjs` asserts one snapshot per port visit, the
    table columns incl. the health state, resuming an older visit restores
    that state, the successor uses the latest snapshot, and the legacy
    migration.
29. **Animated handwriting.** The animated handwriting of `design.md`
    §16.3 is implemented (stroke-by-stroke reveal behind the pen hand,
    click-to-finish, the wound level on the hand, persistent blood traces
    on pages written by a wounded hand, no entry for a dead character —
    the remains report takes over, pt. 22 — and silent writing under
    do-not-disturb, §16.2), and the journal keeps the newest content in
    view per §15.4. Verifiable: `scripts/verify/handwriting.mjs` asserts
    the growing reveal with the hand element, the wound classes on the
    hand, the persistent blood traces, the click-to-finish, the clean
    final text (no markup, full length), the silent do-not-disturb path,
    and that an overflowing journal auto-scrolls down to the still-writing
    entry.
30. **Gamepad and position query.** The gamepad controls of `design.md`
    §17.5 hold (left stick merged with WASD, right stick first-person
    turn, the button-to-key mapping via synthetic key events — no second
    input path — standard-mapped pads only, and the deliberate-input
    engagement guard against idle axis drift), and the position query
    (§17.1/§3.2) reports the current coordinates and region as a localized
    toast on P — the way to read coordinates, which are never shown
    permanently. Verifiable: `scripts/verify/gamepad.mjs` injects a
    virtual gamepad and asserts that pre-engagement axis drift moves
    nothing, stick travel movement, right-stick turning in the
    first-person view, the A-button interaction and Y-button journal
    toggle, and the position-query toast in both languages.
31. **Settlement orientation and panorama wildlife.** The gift-unlocked
    building orientation of `design.md` §17.3 holds (pulsing markers on
    the important, enterable buildings after the first accepted gift,
    persisted per settlement, announced by a localized toast), as does the
    §2.5 panorama wildlife (region-typical silhouettes drifting beyond the
    settlement edge). Verifiable: `scripts/verify/polish.mjs` asserts no
    markers before and markers after the gift plus the toast, their
    persistence across re-entry, and the panorama wildlife count via the
    dev hook, with a screenshot of the highlighted village.
32. **Render pipeline upgrades — open.** TRAA, screen-space reflections
    and true water refraction (`design.md` §2.7) remain an OPEN item. A
    first implementation was reverted: the headless verification runs on
    the WebGL 2 fallback only (Chromium gets no WebGPU without a display),
    so the WebGPU-only TRAA/SSR branch went untested and rendered a black
    scene on real hardware; three r185's SSRNode additionally emits
    invalid GLSL on WebGL 2 (upstream). The item needs a WebGPU-capable
    verification path (or a supervised manual test loop) before another
    attempt; until then AA relies on the render pass' MSAA and reflections
    on the IBL environment.

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
- Fix deviations, do not paper over them. An unfulfilled criterion is
  reported as such.

---

## 8. Explicitly Outside This Run

- Multiplayer in any form.
- Onboarding, tutorials, lowering of the entry barrier.
  (The animated handwriting with blood traces, formerly listed here,
  became part of the target via criterion §7.1 pt. 29.)
- Full balance calibration; a debug menu (§21 `design.md`) beyond what §2
  and the verification require. (Audio, dynamic music and ambient wildlife
  were formerly listed here; they became part of the target via criterion
  §7.1 pt. 12 and are implemented. The tabular load menu, formerly listed
  here too, became part of the target via criterion §7.1 pt. 28.)

These points are not to be started, not even partially, as long as the
acceptance criteria of §7.1 are not fully met.

---

## 9. Closing the Run

At the end:

- Confirm which criteria of §7.1 are fulfilled, with screenshot evidence.
- List the collected open items (`// OPEN: …`).
- Name the simplifications made and the placeholder values set.
- No silent extensions beyond §7.1.
