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
```

The TypeScript build must pass without errors. `npm run build` is part of
acceptance (§7).

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

The POC counts as fulfilled when all points verifiably hold. Details per
`design.md`; only the verifiable condition is stated here.

1. **Build/start.** `npm install`, `npm run dev` and `npm run build` run
   without errors. The application loads without console errors.
2. **Two perspectives.** Bird's-eye view (3D travel across the continent)
   and first-person view (walkable settlement) exist, and switching between
   them works when entering/leaving a settlement. Entering and leaving
   happen through movement alone (`design.md` §2 "Switching"): walking onto
   a settlement's position enters it; walking beyond the settlement's edge
   leaves it — there is no exit archway and no enter/leave key. The
   enterable buildings likewise open by walking against their entrance door;
   only the elder keeps the interaction key. A settlement just left is briefly
   closed to re-entry (`design.md` §2): walking straight back does not
   re-enter it; re-entry re-arms only once the traveller has moved clear of it
   (a calibratable clearance beyond the enter radius). Verifiable: an automated
   run walks into a place and into a building's door and enters both, and walks
   past the settlement edge to leave, without any key press; standing on the
   just-left marker does not re-enter until the traveller has moved clear
   (`scripts/verify/flow.mjs`).
3. **World model.** Fixed geographic locations of the landscape elements per
   `design.md`; the concrete appearance must be graphically elaborate,
   Africa must be depicted in detail and authentically, and the outlines of
   all land and continent regions must be fine-grained, including the
   courses of the rivers. Coordinates (latitude/longitude in degrees) are
   not shown permanently; they are read out on demand via the position
   query (`design.md` §17, pt. 30). Research what the exact geography of Africa was at
   the end of the 19th century. All 10 port cities, 22 peoples, 17 rivers
   and every landmark from `design.md` must be implemented. The region
   borders carry the localized region name on each side of the line, both
   on the exploration map and in the bird's-eye view (`design.md` §3).
   Verifiable: near a border, `.region-label` elements name both regions
   on their sides (`scripts/verify/enrichments.mjs`).
4. **Movement and time.** The character moves in the bird's-eye view; date
   and provisions advance with the journey (calendar display, start 1890 per
   `design.md`). Sea water enclosed by the continent's outline (bays,
   gulfs) is swimmable like inland water; the open ocean beyond the
   outline blocks movement (`design.md` §11). Mountain terrain is
   climbable without a rope (`design.md` §7/§11) but slower and dangerous:
   the traveler is warned at the ascent, and each stretch on the rock
   risks a fall that wounds lightly or severely and can cost a carried
   item; with the rope in hand the climb is safe and faster. Verifiable:
   an automated move on enclosed sea advances the position, a move on
   open ocean is refused with the blocking notice, a move onto a mountain
   without a rope advances (with the warning) while the rope makes it
   faster, and a forced fall wounds the traveler and can drop an item
   (`scripts/verify/enrichments.mjs`). Any active movement penalty shows
   its reason (`design.md` §11): while a terrain slows the traveler and
   the relieving hand object is not held (jungle→machete, water→canoe,
   mountain→rope), the top-right status area names the cause and the
   remedy — the slowdown is never silent. The first time each of the three
   is met it is also announced once in the journal (both languages, voice
   markup); every later encounter of that kind is carried only by the
   status-bar hint, and the once-per-type flag travels with the checkpoint.
   Verifiable: the penalty mapping
   is pure-tested for each terrain, the top-right HUD hint appears in
   jungle without a machete and clears once the machete is in hand, and a
   first jungle entry adds exactly one journal warning while a later entry
   adds none (`scripts/verify/enrichments.mjs`).
5. **Port city.** At least Cairo as the enterable starting port with trade
   (buying equipment, provisions and gifts for `$`). Entering triggers the
   automatic checkpoint (simplified saving is sufficient). The buy dialog
   lays the goods out as a table — name, a right-justified price column and
   the buy action — so the prices align down the column (`design.md` §9);
   every trade dialog also buys gear back for the local currency (money in
   a port). Verifiable: `scripts/verify/flow.mjs` asserts the price cells
   share a column (aligned left edges); `scripts/verify/economy.mjs`
   asserts selling gear in a port pays money.
6. **Village and cultural contact.** At least one enterable village with a
   chief's hut. A culturally correct gift to the chief unlocks a hint — not
   mere observation: the gift is the condition. Villages also carry a
   trading post that barters the baseline goods (food, medicine, machete,
   shovel, rope, canteen) for gifts and buys gear back for gifts — money
   has no value there (`design.md` §6/§9). Verifiable: `scripts/verify/
   economy.mjs` buys food in a village against gifts (money untouched),
   refuses a purchase without gifts, and sells gear for gifts.
7. **Language/direction system.** The full system of `design.md` §13 is
   implemented: every region has its own direction words (§13.2 — the
   fixed Nivera, koko/Katula/Phuthswama/Mimbumi, Relolo/Dethamee, the
   Utomba- and season-based systems) and a village elder who teaches
   them; the §13.2 glossary names (Mongdamara, Lastwana, Unumpara, Gumba
   lu Untoba …) appear inside the hints; hints combine landmark,
   direction word and coordinate (§13.1). A chief's raw hint is written
   in the region's own words and turns into a deciphered journal entry
   as soon as the region's language has been learned — in either order
   (lesson before or after the hint). A second elder talk reveals what
   the region reveres (§8). Verifiable: `scripts/verify/hints.mjs`
   covers all five regions, the retroactive deciphering, the gift lore
   and the in-world words in the rendered journal.
8. **Chronicle/journal.** A journal exists, grows automatically on events
   and stores hints. The handwritten entry may be simplified in the POC
   (plain text suffices; the animated handwriting is not acceptance-
   relevant).
9. **Status bar.** Date, funds, provisions, gifts, hand item and current
   region are displayed. Coordinates are not shown permanently (removed on
   user request); transient status hints (e.g. the movement-penalty reason,
   pt. 4) render as a right-aligned item inside the status bar itself, not in
   a separate panel floating over the scene. Verifiable: the hint element is a
   descendant of `.status-bar` and its box stays within the bar's box
   (`scripts/verify/enrichments.mjs`).
10. **Goal scaffolding.** A procedurally placed goal (the tomb) exists;
    digging it up with the shovel at the site triggers the victory state.
    The site is triangulated from several hints (`design.md` §13.3): per
    region exactly one (seeded) knowing people reveals its component —
    the North's chief the latitude, the East's the longitude, the other
    regions narrowing statements — while every other chief offers only
    unspecific knowledge (Oz Oz …) that points to the region's knowing
    people. Verifiable: `scripts/verify/hints.mjs` asserts that the
    deciphered latitude and longitude equal the actual grave position
    and that non-knowing chiefs point to the knowing people;
    `scripts/verify/flow.mjs` plays the full loop (gift → lesson →
    deciphered latitude, the East leg for the longitude, then the dig).
11. **Game graphics.** The visual presentation must be appealing and
    elaborate at AAA level and replace the POC's former schematic look.
    This includes smoothing the geometry of the continent and the rivers,
    which previously showed visible steps.
12. **Atmosphere.** The atmosphere elements from `design.md` are
    implemented — specifically "## 19. Atmosphere and Immersion" and the
    "**Graphics and atmosphere.**" passage in "## 2. Perspectives and
    Camera". This includes the decorative predator hunt (`design.md` §19):
    each hunt a region-appropriate predator appears — lion everywhere,
    cheetah and hyena on the eastern/southern plains, leopard in the wooded
    west/centre — and takes prey from its own food web (predator → grazer →
    grassland: lion/hyena the big grazers, cheetah/leopard the smaller game),
    with only the lion attacking the player on contact (§14). The predator
    approaches from a random direction (the chase runs any which way,
    not always toward the same corner), takes varied, region-appropriate
    prey (zebra, wildebeest, antelope or warthog per the region's ~1890
    fauna — wildebeest and warthog are savanna species that also roam
    as ambient herds), and the fleeing prey weaves left and
    right to shake it, while the predator pursues with a limited turn rate but
    is faster and closes in; after the catch the lion visibly feeds on the
    carcass (lowered, rhythmically tearing head movements, red spreading
    stain beneath the prey), the carcass shrinks away piece by piece, and
    once it is consumed the lion moves on. Further animal interactions
    hold: elephants move as herds — members keep together and roam as a
    group (rarely alone), only ever forward and turning in gentle arcs
    (no sharp turns/strafing), staying on savanna/forest; they do not hunt,
    but a smaller animal in the herd's path is trampled (dead on the ground
    over a red stain). Other animals dodge an elephant only at the last
    moment (and a touch slower than it), so a head-on herd still tramples
    one now and then. Prey scatters from an active lion, vultures circle a
    kill, shore-near animals periodically walk to the water and drink,
    grazers dip their heads on open land. The open landscape is dressed
    with region-typical period elements (baobabs, termite mounds, kopjes,
    dead trees, papyrus belts along water; `design.md` §19). The elephant
    graveyard (`design.md` §4.4) is dressed so it reads at a glance: a
    field of fallen, bleached elephant carcasses with ivory tusks and
    bones strewn over a pale bone-littered patch. Verifiable:
    automated checks force the feed state (carcass, head animation, stain,
    leave phase), provoke a trampling via an injected elephant, prove an
    elephant herd roams together (its centre moves, it stays clustered, and
    it turns only in gentle arcs) and that prey ignore a distant elephant
    but dart away from a close one (last-moment dodge), assert that lion hunts run in varied
    directions (low mean-resultant length across hunts) with a weaving prey
    (its heading oscillates around straight-away), that the lion takes more
    than one kind of prey and every hunted species fits the region's pool,
    prove the zoom-aware
    streaming despawn (an animal survives a tile-boundary crossing while in
    view, despawns once well outside it, and a wider zoom keeps animals the
    default view would have dropped), that a non-lion (trampled) carcass
    draws a vulture that lands and consumes it until it is removed, that
    carcasses left far off-screen are culled while a visible one is kept (so
    kills stay bounded and never stall the frame loop), that more than one
    kind of predator hunts and every predator/prey pairing fits the region
    and the predator's food web, that prey flee a predator smoothly without
    teleporting (no single-frame jump), and
    assert the graveyard's carcass/tusk/bone counts via the dev hook with a
    screenshot (`scripts/verify/settings.mjs`, `scripts/verify/enrichments.mjs`).
13. **Real geodata.** The passage "**Real geodata and terrain rendering.**"
    in "## 3. World Model and Map" (`design.md`) is implemented: elevation
    relief from a real DEM (tile-based, LOD-streamed), coasts/rivers/lakes
    from vector data in their ~1890 state without visible raster steps,
    ground rendered via biome-based PBR texture splatting with detail
    normal maps. The borders between the landscape types (desert/savanna/
    jungle) meander rather than following straight region or threshold lines:
    the coordinates that decide the biome are domain-warped by a
    low-frequency noise field before classification (raw coordinates still
    drive elevation, rivers and coasts). Verifiable: screenshots of the Nile
    delta, a rift edge and a coastline show smooth, real courses and textured
    ground instead of vertex colors; a pure-threshold biome edge (the south
    desert) is sampled across latitudes and its longitude varies rather than
    running straight (`scripts/verify/enrichments.mjs`); the geodata
    preprocessing is reproducibly documented in the repository.
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
    refraction) are named as open items (see pt. 32).
15. **Lively, densely built settlements.** The passage "**Lively, densely
    built settlements (first-person).**" in "## 2. Perspectives and Camera"
    (`design.md`) is implemented: the first-person view shows far more
    buildings than just the functional ones — additional non-enterable
    dwellings and outbuildings in region-typical, procedurally varied
    density — a recognizable street/path network, and inhabitants who move
    believably through the settlement, entering and leaving their homes.
    The enterable functional buildings remain clearly highlighted.
    Settlement size mirrors real ~1890 importance (`design.md` §4.1):
    major cities are markedly larger than small stations. Villages show
    the life vignettes of `design.md` §19 (conversing pairs, fire tender,
    cooking runs from the huts, grain pounding, drummer, well with water
    carrier), and the first-person background is a panorama of the real
    surrounding map landscape (`design.md` §2). Verifiable: screenshots of
    a port city and a village show dense building fabric with paths and
    several non-functional buildings; inhabitants move about and use their
    dwellings; Cairo's walkable radius and dwelling count exceed Boma's;
    the backdrop mesh is present; the application loads without console
    errors (`scripts/verify/enrichments.mjs`).
16. **Collision inside settlements.** The collision point of the passage
    "**Lively, densely built settlements (first-person).**" (`design.md`
    §2) is implemented: neither the player character nor the inhabitants
    pass through buildings or solid objects inside settlements (huts,
    fences, trees, rocks, fire pit); movement slides along obstacles;
    inhabitants never get permanently stuck; the accesses to the enterable
    buildings and the settlement exit remain reachable. Rectangular
    buildings collide as oriented boxes (exact corners, no gaps), and the
    clearance keeps the camera's near plane out of every wall — pressing
    against a building must never show its inside. Inhabitants enter and
    leave their dwellings through the entrance door (`design.md` §2); the
    player cannot. Verifiable: an automated run steers the player character
    against building walls and corners and proves it keeps positive
    clearance; an observed inhabitant transitions walk → inside at its
    dwelling and out again; interaction with all functional buildings
    remains possible; the application runs without console errors.
17. **Localization.** The game is fully playable in English as well as
    German (`design.md` §17): all player-visible text comes from the
    language files, the debug menu switches the language at runtime
    (default: English), journal entries are stored language-neutrally and
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
    shaping the delivery (pauses, pace, loudness, punctuation). A newly
    appearing entry starts its narration automatically, without a click;
    while the browser's autoplay policy blocks audio (before the first
    user gesture), the narration of the newest entry — at game start the
    departure entry — is deferred to that first gesture instead of being
    dropped. Verifiable: spot check of both language files for markers;
    journal screenshot free of visible tags; starting narration produces
    audio without console errors; adding an entry switches its read-aloud
    control into the speaking state without a click; the start entry
    narrates on the first gesture (`scripts/verify/voice.mjs`). The open
    journal never freezes the game (`design.md` §16): the character keeps
    moving in both perspectives while the journal is open and while an
    entry narrates; only modal dialogs block movement. Verifiable: with the
    journal open at game start, driving movement still advances the player
    position (`scripts/verify/voice.mjs`). German read-aloud stays an open
    item until a German-capable voice exists.
20. **Comfort and audio settings.** The control/audio calibration holds:
    mouse-look sensitivity defaults to 0.0011 rad/px (half the former
    value), walk speed inside settlements to 10 m/s (raised from 7.5 by
    later user calibration), strafing and walking backward inside
    settlements move at 80 % of the forward speed (a diagonal is never
    faster than straight; `design.md` §2),
    the first-person eye height is 1.5 m, and a single ambience volume
    (default 0.1) scales the whole soundscape together — the noise beds
    (wind/surf/murmur), their gust/swell modulation and the proximity
    animal calls. Nearby wildlife in the bird's-eye view is heard: an
    animal's own call (elephant trumpet, lion roar, grazer bark, wading
    flock) rises as the player draws near and fades once it is left behind
    (`design.md` §19), all under that one volume. The overland travel speed
    default is lowered 30 % (to 5.6) for a calmer pace, and the terrain
    relief items are tunable as factors (`design.md` §11): a canoe speed-up
    factor for water and penalty factors for the jungle without a machete
    and the mountains without a rope. Mouse sensitivity, walk
    speed, the strafe/backward factor, the ambience volume, the travel speed
    and these three terrain factors are adjustable at runtime in the debug
    menu (`design.md` §21)
    in both languages; the bird's-eye mouse-wheel zoom is always active
    (0.25x-4x), with a debug checkbox gating zoom-out beyond the default
    distance (without it, zoom-out stops at factor 1; disabling clamps a
    wider view back); the debug menu additionally offers dropdown selectors
    for jump-to (ports/villages, the elephant graveyard and the
    tomb)/equipment/gifts, a read-only display of the active render
    backend, and
    the journal do-not-disturb option (`design.md` §16; also toggled with
    F2) under which new entries neither open the journal nor auto-narrate
    but stay readable on manual open. Debug shortcut keys (`design.md` §21):
    F1 opens the menu, F2 the do-not-disturb toggle, F3 grants the full
    loadout — all gear/treasures, 100000 gifts/dollars/provisions, full
    health and no afflictions, with the inventory capacity raised to fit —
    and F4 toggles the canoe in and out of the pack.
    Verifiable: `scripts/verify/settings.mjs` asserts the defaults
    (including the single ambience volume 0.1, the 5.6 travel speed and the
    canoe/jungle/mountain factors), the
    eye height, the 80 % strafe/backward factor (exact via the pure
    velocity helper, plus an in-scene smoke check that both directions
    move), the canoe and jungle factor fields edit at runtime, the F3 full
    loadout, the F4 canoe toggle, the Tab journal toggle
    (opens/closes without shifting focus onto a control, and does not
    toggle while a debug field is focused; `design.md` §17), the working debug-menu
    controls in both languages, that a nearby animal raises its proximity
    call and it fades once the player leaves, and the lion-feed depiction
    (pt. 12); `scripts/verify/enrichments.mjs` asserts
    the zoom gate, the dropdowns and the renderer row;
    `scripts/verify/collision.mjs` additionally proves corner clearance at
    box buildings and an inhabitant re-entering its dwelling (pt. 16);
    `scripts/verify/voice.mjs` proves the automatic narration of a new
    entry (pt. 19). Modal windows and full-screen overlays always render
    above the in-scene floating labels (`design.md` §17): the modal layer
    sits above the drei `<Html>` label z-index range so a dialog is never
    obscured by a building/place label. Verifiable: with a settlement
    label hit-tested on top, opening a modal makes the dialog the topmost
    element at that point (`scripts/verify/enrichments.mjs`).
21. **Water realism.** The visual part of the passage "**Water, current
    and waterfalls.**" in `design.md` §11 is implemented: rivers lie in
    beds carved relative to the local relief and their surfaces descend
    monotonically from source to mouth (no sea-level canyons); the surface
    is calm with a visible downstream current that strengthens at rapids
    and waterfalls; the five waterfall landmarks show white cascades with
    plunge-pool foam; rivers rising in open land show a spring; lakes have
    flat surfaces at their local shore height. Verifiable:
    `scripts/verify/enrichments.mjs` asserts 5 cascades, at least one
    spring and 8 lake surfaces via the dev hook; screenshots of the Nile,
    Victoria Falls and Lake Victoria (71-73) show the courses. Being swept
    over falls is gameplay since pt. 23 (waterfall-sweep event). The
    current's effect on movement is implemented too: while on a river the
    flow sweeps the traveller downstream every frame (a passive drift, so
    moving with the current is faster and against it slower), scaled by the
    nearest river segment's downstream direction and a strength that rises
    close to the waterfalls (calibratable balance values: `currentDrift`,
    `currentWaterfallBoost`, `currentWaterfallRadius`). The drift covers real
    distance, so it advances time and provisions (and ticks health/deadline)
    exactly as water travel over that distance would — never free movement.
    Verifiable:
    `scripts/verify/enrichments.mjs` asserts an idle traveller on a river is
    swept downstream, that the drift near a waterfall exceeds the
    unboosted drift, and that being swept consumes time and provisions.
22. **Health and afflictions.** `design.md` §6/§15 is implemented: a
    health pool is drained by starvation and by the afflictions fever
    (delirium: temporarily uncontrolled steering), dehydration (sets in
    automatically after sustained dry desert travel without a canteen —
    a balance value; rivers and lakes in reach count as drinking and
    reset the thirst, so following a river never triggers it: drift and
    speed loss),
    sun blindness (view narrowed to a glaring veil; heals only outside
    the desert) and wounds (light/severe); medicine is taken from the
    inventory bar and cures fever and wounds; health regenerates while
    fed and affliction-free. At zero health the expedition is lost: the
    journal falls silent and a remains report naming the cause of death
    appears instead (§15), from which a successor can continue at the
    last checkpoint. The health query (H) reports state and afflictions,
    vultures circle at poor condition (§19), and health/afflictions are
    part of the checkpoint. All drains/thresholds are balance values
    adjustable in the debug menu, which also toggles afflictions for
    testing. Verifiable: `scripts/verify/health.mjs` asserts defaults,
    dehydration onset/recovery, regeneration, fever drain and medicine
    cure, the sun-blindness veil and its recovery, vultures, the H query
    and the death/successor flow.
23. **Random events.** `design.md` §14 is implemented as a hidden per-day
    roll while travelling, modulated by terrain and state: wild-animal
    attacks (lions, leopards, snakes — lions with the highest risk of a
    fatal outcome), robber attacks (money theft; a rifle deters, in hand
    almost always), crocodile attacks in water (the machete always helps,
    the rifle only from the canoe — otherwise it is wet and useless),
    fever in wetlands, sun blindness and sandstorms (time loss) in the
    desert, being swept over a waterfall (wounds + loss of a large part
    of the inventory) and grim discoveries (remains with a few dollars).
    Outcomes follow the §7/§14 protection rules (rifle > machete, in hand
    > carried), wounds/afflictions feed the health system (pt. 22), fatal
    attacks end in the remains report, and every event is told through a
    journal entry in both languages with voice markup (§16). Rates are
    balance values, calibrated low so events are rare (the per-day base
    rates were reduced by a factor of five from the earlier calibration);
    the debug menu can toggle the events and trigger each
    kind directly (`design.md` §21). Beyond the hidden roll, walking into
    one of the wandering bird's-eye lions directly triggers a lion attack
    (same protection/outcome rules, rate-limited by the event cooldown and
    suppressed with the random-event system). Verifiable:
    `scripts/verify/events.mjs` asserts the reduced rates, the protection
    ordering (pure functions), deterministic outcome mapping, the
    consequences of each trigger, a fatal attack, autonomous firing while
    travelling, silence when disabled, and that pinning the lion on the
    player triggers a lion attack.
24. **Deadline and successor.** `design.md` §5/§18 is implemented: the
    expedition runs against a multi-year deadline (balance value, ~5
    years) with staged messages — a first warning at 60 % and a final
    warning at 85 % of the granted time, each exactly once, as journal
    entries in both languages — and is recalled (defeat overlay, journal
    silent) when the deadline expires; no successor then. When the
    character dies (pt. 22), a successor takes over instead: he resumes
    at the last checkpoint, loses a configured number of days, silently
    inherits the already-passed warning stage and opens his part of the
    journal with a takeover entry. Verifiable:
    `scripts/verify/expedition.mjs` asserts the staged warnings (exactly
    once each), the expiry defeat without successor, and the
    death-to-successor flow including the day penalty and takeover entry.
25. **Trade economy.** `design.md` §8/§9/§10 is implemented: treasure
    finds (gold, silver, emerald, copper, ivory, statue) are inventory
    items, recovered by shovel from procedurally buried caches (one per
    region plus a statue site, placed anew each run) and from the limited
    ivory supply of the elephant graveyard, where each dig frees a random
    haul averaging ~5 pieces (capped by the remaining supply and free space);
    the inventory has a capacity
    (balance value) — buying or digging beyond it is refused, the debug
    menu edits capacity and gift count (§21), and debug item adds raise
    the capacity automatically when overfilling; ports contain the bazaar
    and the travel agency (§9); the bazaar trades treasures with the
    offer → bid → accept/decline mechanic, regional value factors
    (revered fetches more, rejected materials are refused) and a buy/sell
    spread — continent-wide arbitrage; a bazaar bid is a standing per-port
    quote (re-offering the same treasure after a decline shows the
    identical price; the quote clears on leaving the port); the travel agency sells ferry
    passages between all ports with distance-based fare and duration,
    which makes Zanzibar reachable; discovery bounties for first-visited
    villages and sighted landmarks are credited on the next port visit
    via a journal entry; a valuable carried visibly in hand triggers the
    positive or negative village reaction of the §8 matrix. Every
    settlement — port and village — offers at least the baseline goods
    (food, machete, shovel, medicine) and buys gear back; the currency is
    money in ports and gifts in native villages, where a trading post
    barters the baseline goods for gifts (money is worthless there). All new
    texts exist in both languages with voice markup. Verifiable:
    `scripts/verify/economy.mjs` asserts the capacity refusal and
    auto-raise, the regional bid ordering and rejection, the stable
    re-offer quote (identical price across re-offers, cleared on leaving
    the port), the ferry to Zanzibar (fare, days, checkpoint), the bounty
    crediting, the graveyard's random ivory haul (range 1..9, mean ~5) and
    its cap by the remaining supply, digging a treasure cache and
    the statue site, both valuable reactions, the baseline goods in every
    settlement, buying food in a village against gifts (money untouched),
    the no-gifts refusal, and selling gear for gifts (village) or money
    (port).
26. **Standing with the natives.** `design.md` §12/§7 is implemented: a
    rifle carried in hand inside a village makes the inhabitants flee
    (they vanish indoors) and blocks the audience and the elder talk; a
    rejected gift means hostility and expulsion — the traveler is thrown
    out of the village, goodwill resets and the chief refuses audiences
    for a hostility period (balance value); repeated correct
    satisfaction of a chief (goodwill threshold via revered gifts)
    bestows "Honored Friend" for the whole region, announced by a pledge
    journal entry. The status protects near the region's villages:
    animal and robber attacks end at most lightly injured with a rescue
    journal entry naming the people, near-death travelers receive food
    and medicine from hurrying villagers (cooldown), and the region's
    villages hand out provisions and medicine free of charge. Drawing
    the rifle inside a chief's hut robs the village (loot up to the pack
    limit): the whole region is antagonized permanently — no audiences,
    no elder talks, no hints — and the "Honored Friend" status is
    forfeited irretrievably and cannot be re-earned. All new texts exist
    in both languages with voice markup. Verifiable:
    `scripts/verify/reputation.mjs` asserts the rifle blockade, the
    hostility/expulsion and its wear-off, the friend pledge (exactly
    once), the capped attack outcomes with rescue entries, the
    near-death aid, the free village supplies, and the permanent
    robbery consequences including the forfeited friendship.
27. **Camps (item caches).** `design.md` §6/§17 is implemented: in the
    bird's-eye view a free camp can be pitched anywhere in the open (C;
    a nearby existing camp is reopened instead) holding any number of
    inventory items — equipment, gifts and treasures move between pack
    and cache (taking back respects the inventory capacity; an emptied
    hand item is put away, which covers leaving the canoe behind). Each
    free camp is marked with an X on the exploration map and a pole
    marker in the bird's-eye view. A stocked free camp risks being
    looted per travelled day (balance value); the loss is revealed by a
    journal entry when the traveler returns. In villages of a region
    with "Honored Friend" standing, C opens the safe village cache
    whose items never disappear; without the standing the cache is
    refused, and a robbery in the region irretrievably destroys the
    region's village caches. All new texts exist in both languages with
    voice markup. Verifiable: `scripts/verify/camps.mjs` asserts
    pitching and reopening, storing/taking incl. the capacity refusal
    and the hand-item put-away, the loot-and-discover flow with its
    journal entry, the map X, the friend gate on village caches, their
    persistence, and their destruction by the robbery.
28. **Full saving and loading.** `design.md` §18 is implemented: every
    port visit stores its own snapshot (a placeholder cap keeps only the
    most recent ones); on loading, an overview of all port visits
    appears as a table with one row per visit — port city, in-game
    date, money, food, gifts and health state — from which the player
    picks the state to continue from; manual saving stays omitted. A
    legacy single-slot checkpoint migrates as one table row. The
    successor (pt. 24) continues to resume from the latest snapshot.
    All menu texts exist in both languages. Verifiable:
    `scripts/verify/saveload.mjs` asserts one snapshot per port visit,
    the table columns incl. the health state, resuming an older visit
    restores that state, the successor uses the latest snapshot, and
    the legacy migration.
29. **Animated handwriting.** `design.md` §16 is implemented: a newly
    appearing journal entry does not show as finished text but is
    visibly written into the book — the text reveals stroke by stroke
    in a handwritten style behind a moving hand holding the pen (a
    click finishes the entry immediately). The hand shows the wound
    level recorded when the entry was written: unhurt skin, a marked
    hand at light wounds, a bloody hand at severe wounds — and an entry
    written by a wounded hand permanently carries blood traces on the
    page, stronger at severe wounds. A dead character writes no entry
    (the remains report takes over, pt. 22). Entries appearing under
    do-not-disturb (§16) are written silently without the animation.
    The journal keeps the newest content in view (`design.md` §15): a new
    entry scrolls the view to the bottom, and while an entry writes in the
    view follows the growing text down so the appearing strokes stay
    visible. Verifiable: `scripts/verify/handwriting.mjs` asserts the
    growing reveal with the hand element, the wound classes on the hand,
    the persistent blood traces, the click-to-finish, the clean final text
    (no markup, full length), the silent do-not-disturb path, and that an
    overflowing journal auto-scrolls down to the still-writing entry.
30. **Gamepad and position query.** The `design.md` §17 controls hold
    for the gamepad too: the left stick moves the character in both
    perspectives (merged with WASD), the right stick turns the
    first-person view, and the buttons map onto the existing key
    handlers (A interact, B close, X dig, Y journal (Tab), LB map, RB camp,
    Select position query, Start debug menu) via synthetic key events —
    no second input path. Only standard-mapped pads are read, and a
    connected pad steers only after a deliberate input (button press or
    full stick push): idle axis drift of wheels, flight sticks or worn
    pads must never move or turn the game on its own. The position
    query (§17) reports the current coordinates and region as a
    localized toast on P (coordinates are no longer shown permanently, so
    this query is the way to read them). Verifiable: `scripts/verify/gamepad.mjs` injects a
    virtual gamepad and asserts that pre-engagement axis drift moves
    nothing, stick travel movement, right-stick turning in the
    first-person view, the A-button interaction and Y-button journal
    toggle, and the position-query toast in both languages.
31. **Settlement orientation and panorama wildlife.** Two `design.md`
    §17/§2 polish features hold: after the first accepted gift in a
    settlement the natives provide orientation — the important,
    enterable buildings carry a pulsing marker from then on (persisted
    per settlement, announced by a localized toast); and distant
    wildlife moves through the first-person surroundings panorama —
    region-typical, slowly drifting silhouettes (elephants, giraffes,
    zebras in the savanna; antelope near the desert) beyond the
    settlement edge. Verifiable: `scripts/verify/polish.mjs` asserts no
    markers before and markers after the gift plus the toast, their
    persistence across re-entry, and the panorama wildlife count via
    the dev hook, with a screenshot of the highlighted village.
32. **Render pipeline upgrades — open.** TRAA, screen-space reflections
    and true water refraction (`design.md` §2) remain an OPEN item. A
    first implementation was reverted: the headless verification runs
    on the WebGL 2 fallback only (Chromium gets no WebGPU without a
    display), so the WebGPU-only TRAA/SSR branch went untested and
    rendered a black scene on real hardware; three r185's SSRNode
    additionally emits invalid GLSL on WebGL 2 (upstream). The item
    needs a WebGPU-capable verification path (or a supervised manual
    test loop) before another attempt; until then AA relies on the
    render pass' MSAA and reflections on the IBL environment.

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
