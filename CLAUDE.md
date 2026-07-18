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
   them happens through movement alone per `design.md` §2.3. In
   particular: buildings open by walking against their door and only the
   elder keeps the interaction key. A just-left settlement stays closed to
   re-entry until the traveller has moved clear (a calibratable clearance
   beyond the enter radius). A settlement is not auto-entered while the
   traveller is on a water cell, so a river passage never pulls him in.
   Entering focuses the controls without an extra click per `design.md`
   §17.5 (HUD buttons blurred; mouse-look engages on entry from the walk-in
   keypress, with the click as fallback). Verifiable: an automated run
   walks into a place and into a building's door and enters both, and walks
   past the settlement edge to leave, without any key press; standing on
   the just-left marker does not re-enter until the traveller has moved
   clear; on entering, no HUD control (button/input) retains focus
   (`scripts/verify/flow.mjs`). The leave transition stays FLUID: the
   travel scene's shared materials/meshes survive remounts as module
   singletons (surgical dispose opt-outs — a full remount used to re-link
   the whole travel program set synchronously, freezing the main thread
   10-16 s after several visits), gated in `scripts/verify/polish.mjs`
   (leave after several settlement visits completes in under 3 s).
3. **World model.** The fixed, authentic ~1890 geography of `design.md`
   §3.1/§3.2 — researched against the real end-of-19th-century state —
   with all 10 port cities, 22 peoples, 17 rivers and every landmark of
   §4, graphically elaborate with fine-grained land outlines and river
   courses. Region borders carry the localized region name on each side of
   the line in both views (§3.2); map-point labels are discovery-gated
   (§17.2); coordinates are read out on demand via the position query
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
   all of them; screenshots 126/127). Verifiable: near
   a border, `.region-label` elements name both regions on their sides;
   undiscovered `.map-label` elements read "?", a visited place (Cairo)
   shows its name, and sighting a landmark reveals its name; the opened
   exploration map's explored area reads lighter (cleared) than the
   unexplored area (under fog) with a screenshot (92)
   (`scripts/verify/enrichments.mjs`); inside a settlement the map opens
   as a town plan naming the functional buildings instead of the atlas
   (`src/ui/MapOverlay.test.tsx`; `scripts/verify/polish.mjs`,
   screenshot 98); the opened map sits bottom-left clear of the inventory
   bar and the bottom-right buttons and shows a live "you are here" marker
   in both the atlas and the town plan (§19.11) — the marker presence and
   position pure-tested in `src/ui/MapOverlay.test.tsx`, the bottom-left
   placement, non-overlap and both markers live-checked in
   `scripts/verify/enrichments.mjs`; all 22 villages hold the river
   clearance while the Nubian village stays riverside on the Nile
   (`src/world/world.test.ts`); the map's region-name anchors sit once per
   region on that region's own land and far enough apart that the names
   cannot collide (`src/ui/mapLayout.test.ts`).
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
   only the large solid dressing collides, and its collider is DERIVED
   from the same `placedFloraAt` placement the renderer draws, so an
   unrendered/suppressed plant can never leave a phantom collider,
   point 129).
   Verifiable: an automated move on enclosed sea advances the position; a
   move on open ocean is refused with the blocking notice; a move onto a
   mountain without a rope advances (with the warning) while the rope
   makes it faster, and a forced fall wounds the traveler and can drop an
   item. The penalty mapping is pure-tested for each terrain (incl. the
   canoe-on-land penalty on every land type). A canoe run on savanna
   covers clearly less ground than without it (the land malus is real,
   not just a hint). The centred status-bar hint appears in jungle without a
   machete and clears once the machete is in the pack; a first jungle
   entry adds exactly one journal warning while a later entry adds none.
   With a canoe in the pack the explorer rides it on a water tile
   (`__player.canoeing`) but drags it on a land tile (`__player.carrying`),
   and removing the canoe clears both; the float height clears the rendered
   ribbon across every river channel — incl. cross-sloping and confluence
   stretches — and the lake sheets
   (`src/scenes/travel/waterSurface.test.ts`). The dragged hull lies on the
   terrain (its far end resting just above its own ground sample, pose
   clamped — `__player.drag` in `scripts/verify/enrichments.mjs`), and the
   trailer/pose behaviour matrix — following the walked path, swinging
   clear of stones, animals and settlement edges, slope and cross-slope
   profiles, and the water-edge rule (the dragged hull never pierces the
   rendered water sheet: rope rotation to land, spit shortening) — is
   pure-tested (`src/scenes/travel/canoeDrag.test.ts`). Driving straight into a pinned
   animal blocks the traveller at its body edge without ever entering it,
   and steering away afterwards moves him clear — a collision never pins
   the traveller (`scripts/verify/enrichments.mjs`); the swept obstacle
   resolve is pure-tested incl. the no-tunnelling case and the
   away/tangent moves from a resting contact staying free
   (`src/systems/movement.test.ts`). The Red Sea cut and world trim are
   pure-tested at the acceptance coordinates: mid Red Sea, Sinai, the
   Arabian peninsula and the Gulf of Aden are blocked ocean (Sinai/Arabia
   trimmed in the DEM, so no land route rounds the Red Sea; shallow sea
   northeast of the boundary reads as deep open ocean); foreign land
   (southern Spain, Sicily, Crete, the Canaries, the Comoros … and the
   unreachable Madagascar) samples as ocean while the game's reachable
   islands stay land; no trimmed texel borders kept land outside the Suez
   isthmus gate (no ocean scrap juts into the coast); the Nile delta and
   the African Red Sea coast stay walkable land; nearshore sea swims
   while far-offshore sea blocks even inside the hull (the margin edits
   at runtime); the Mediterranean blocks everywhere — off the delta, off
   Alexandria, in the Sidra bight — regardless of the swim margin; and
   the hull rules for the open Atlantic and the Mozambique channel are
   unchanged (`src/world/redSea.test.ts`).
5. **Port city.** At least Cairo as the enterable starting port with trade
   (buying equipment, provisions and gifts for `$`). Entering triggers the
   automatic checkpoint (`design.md` §18; simplified saving is
   sufficient). Buy AND sell dialogs (shop buy-back, bazaar buy/sell,
   ferry) use the same aligned price-table layout and buy gear back for the
   local currency per §9. Verifiable: `scripts/verify/flow.mjs` asserts the
   buy price cells share a column and, in the bazaar, the buy prices and
   sell names each share a left edge (`src/ui/Dialogs.test.tsx` pins the
   name/price grid cells on the sell, bazaar and ferry lists);
   `src/state/store.economy.test.ts` asserts selling gear in a port pays
   money.
6. **Village and cultural contact.** At least one enterable village with a
   chief's hut; a culturally correct gift is the condition for a hint —
   not mere observation (`design.md` §12). The village trading post
   barters the baseline goods for gifts and buys gear back for gifts —
   money has no value there (§9). Verifiable:
   `src/state/store.economy.test.ts` buys food in a village against gifts
   (money untouched), refuses a purchase without gifts, and sells gear for
   gifts; `src/ui/Dialogs.test.tsx` prices village goods in gifts, not
   money.
7. **Language/direction system.** The full system of `design.md` §13 is
   implemented: the regional direction systems and glossary names of
   §13.2, taught by the village elder (a second talk reveals what the
   region reveres, §8); hints combine landmark, direction word and
   coordinate (§13.1); a raw hint deciphers retroactively in either order
   (§13.2). Verifiable: `src/state/store.hints.test.ts` covers all five
   regions, the retroactive deciphering (either order) and the gift lore;
   `src/i18n/i18n.test.ts` the in-world words in the language files.
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
   the movement-penalty reason, pt. 4) render CENTRED inside the status
   bar itself, not in a separate floating panel; each stat is led by its
   symbol with the localized word as tooltip and the date reads
   DD.MM.YYYY; the inventory item currently in use glows, and the health
   bar with its affliction badges sits inside the bar's right end per
   §17.1 (never covered by the journal). Verifiable: the hint element is a descendant
   of `.status-bar`, its box stays within the bar's box and it sits at
   the bar's centre; each stat carries its localized title and a
   `.stat-icon` while the date renders DD.MM.YYYY
   (`src/ui/StatusBar.test.tsx`, `src/i18n/i18n.test.ts`); the
   `.health-bar-fill` lives inside `.status-bar`
   (`src/ui/StatusBar.test.tsx`); the health bar hugs the status bar's
   right edge with the affliction badges to its left
   (`scripts/verify/enrichments.mjs`), and a canoe on
   water / medicine while afflicted gains `.inv-active` while an idle item
   does not (`scripts/verify/enrichments.mjs`); the `.health-bar-fill` is
   full-width green at full health and shrinks/reddens toward zero, the
   bar blinks (`.health-low`) below a third of max health and stops
   above it, the canteen blinks (`.canteen-blink`) below a third of its
   fill (§6.1), and an
   `.affliction-badge` renders left of the bar for each active affliction
   (`src/ui/Hud.test.tsx`). The map is NOT an inventory item (point 93):
   the bottom-right button row holds camp / map / journal in that order,
   the always-present MAP button opens the overview without any
   possession check, and the CAMP button shows only where a camp can be
   pitched (§6.3: travel always, a friend village inside a settlement,
   never a port — one `canCampHere` predicate for the button and the C
   key). A legacy save carrying the removed map item loads with it
   stripped. Verifiable: `src/ui/Hud.test.tsx` (map button left of
   journal, camp shown/hidden per mode, `canCampHere` pure);
   `src/ui/Dialogs.test.tsx` (no map good in any shop listing);
   `src/state/store.saveload.test.ts` (legacy map-item strip);
   `scripts/verify/enrichments.mjs` (button-row order + non-overlap).
10. **Goal scaffolding.** A procedurally placed goal (the tomb) exists;
    digging it up with the shovel at the site triggers the victory state.
    The site is triangulated from several hints via the knowing-people
    cascade of `design.md` §13.3. Verifiable:
    `src/state/store.hints.test.ts` asserts that the deciphered latitude
    and longitude equal the actual grave position and that non-knowing
    chiefs point to the knowing people; `scripts/verify/flow.mjs` plays
    the full loop (gift → lesson → deciphered latitude, the East leg for
    the longitude, then the dig).
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
    at a glance). Verifiable (`scripts/verify/settings.mjs`,
    `scripts/verify/enrichments.mjs`), by topic:
    - Feeding and trampling: automated checks force the feed state
      (carcass, head animation, stain in the local ground slope, leave
      phase) and provoke a trampling via an injected elephant.
    - Elephant herds and the dodge: an elephant herd roams together (its
      centre moves, it stays clustered, it turns only in gentle arcs);
      prey ignore a distant elephant but dart away from a close one
      (last-moment dodge) while holding one steady escape direction
      rather than oscillating ~90° between two flanking herd-mates — with
      the RENDERED facing itself sampled under the universal turn cap
      through engage and disengage (no snap when a flight ends), a
      tailing elephant unable to flap the dodge at its ring (exit
      hysteresis), and an elephant's facing tracking its roam heading.
    - Hunt variety: lion hunts run in varied directions (low
      mean-resultant length across hunts) with a weaving prey (its
      heading oscillates around straight-away); the lion takes more than
      one kind of prey and every hunted species fits the region's pool;
      more than one kind of predator hunts and every predator/prey
      pairing fits the region and the predator's food web; prey flee a
      predator smoothly without teleporting (no single-frame jump).
    - Streaming: the zoom-aware despawn holds (an animal survives a
      tile-boundary crossing while in view, despawns once well outside
      it, and a wider zoom keeps animals the default view would have
      dropped) — with the scripted predator obeying the same ring: after
      feeding it walks off and is removed only beyond it, and a strayed
      chase aborts the same way. A settlement's bird's-eye vicinity is
      never empty (point 102): where the normal spawn falls short, the
      region-typical presence within `panoramaVicinityRadius` of a
      settlement is seeded up to `panoramaVicinityMinAnimals` — verified
      in `scripts/verify/enrichments.mjs` (after leaving Cairo, at least
      the minimum region-typical grazers stand within the radius via
      `__wildlife`, deterministic under the fixed seed).
    - Vultures, remnants and carcass bounds: a non-lion (trampled)
      carcass draws a vulture that lands and consumes it until it is
      removed — the vulture spawning beyond the zoom-aware view ring and
      flying in (no popping in), flying off after the meal and despawning
      only well outside the view, and the kill-circling flock flying the
      same in/out pattern; a finished hunt leaves a small prey remnant at
      the kill site which the ALREADY CIRCLING kill flock then descends
      on and finishes — the ground scavenger never takes a flocked kill's
      scrap (and a feed that ends without a kill leaves none); carcasses
      left far off-screen are culled while a visible one is kept (kills
      stay bounded and never stall the frame loop); a landed bird stands
      on ITS OWN ground (point 128) — one shared rule (`landedBirdY`,
      positive-only slope lift plus a hover clearing the pecking body)
      for the kill flock AND the lone ground scavenger, pure-tested in
      `src/scenes/travel/wildlifeBehavior.test.ts`, with the clearance
      metric covering both systems and gated strictly above zero — incl.
      a staged scavenger meal on the steepest nearby rise
      (`scripts/verify/enrichments.mjs`).
    - Calves and family life: herds raise young that keep close to a
      parent — rendered through their own baby-schema build
      (proportionally larger head, shorter neck/body, leggy stance, no
      adult ornaments; pure-tested in `src/render/fauna.test.ts`,
      live-checked via the calf meshes) — and a parent moves to interpose
      between an approaching predator and its calf. Calf predation
      (§19.8): a caught calf struggles alive (no stain or shrink) for a
      few seconds before the kill, a parent that reaches the predator is
      eaten in the calf's place while the calf escapes, a parent that
      only got close by the window's end is eaten alongside the calf, and
      the full LionHunt path runs a calf down and catches it (the parent
      held out of shielding reach) — with the hunted calf visibly fleeing
      the chase (slower than its hunter) instead of standing at its
      parent, and a parent in reach holding itself between hunter and
      calf (living shield) over visible real time until the hunter takes
      it in the calf's place before any catch. The rescue burst (§19.8,
      point 127): all four rescue drives (charge, shield, guard, wade)
      run at ONE burst-derived speed — the ordinary walk times the
      calibratable `balance.family.rescueBurst` — while the grief drives
      (vigil walk, trample-throw, waterfall plunge) keep their own
      speeds, and in the water the wade is braked by the seasonal flow
      factor (`wadeSpeed`) so the point-122 drowning drama stays
      reachable; pure-tested in
      `src/scenes/travel/wildlifeBehavior.test.ts` (derivation, floor,
      the burst outrunning walk, hunter and fleeing calf) and
      live-measured in `scripts/verify/enrichments.mjs` (a charging
      parent's sampled speed clearly beats its walk). Calf water drama (§19.8):
      calves gambol in visible hop-bouts that orbit the parent without
      trembling — the leashed scamper, the clamped body-separation force
      and the blended idle-shuffle offset are pure-tested
      (`src/scenes/travel/wildlifeBehavior.test.ts`) and a playing calf's
      step direction is live-checked against sawtoothing
      (`scripts/verify/enrichments.mjs`); a calf on open water starts a
      struggle and its parent wades in, pulls it out and both return to
      the bank alive — in CALM water: the drown/self-rescue fate is
      season-gated (point 122; pure-tested in
      `src/scenes/travel/wildlifeBehavior.test.ts`, the balance values
      debug-editable): in the forced rains a calf in a strong mid-channel
      current drowns (dead, sinking, never rescued or scavenged) while the
      SAME setup in the dry season still clambers out alive, and a rescuing
      parent that wades a swollen current too long drowns beside its calf
      (both live in `scripts/verify/enrichments.mjs`); elephant
      mourning (point 126): a herd entering the graveyard's calibratable
      radius turns aside in its own gentle arcs (the universal turn cap
      holds), stands over the bones with lowered searching heads for the
      window, and moves on — once per visit (pure-tested predicate,
      boundary-exact; hard deadline so no herd is ever pinned), the same
      vigil generalised over a dead herd-mate, with the live behaviour
      (close, hold, release) and screenshot 128 in
      `scripts/verify/enrichments.mjs`; revenge (point
      146): the outcome helper is THREE-way (taken / driven off / KILLED) —
      killChance <= defendChance swept over every pair, no prey ever kills
      a lion (swept), the antelope kills nothing (swept), a slain predator
      enters the ordinary carcass system (dead, not lionFed, worked by the
      scavengers like any zebra) while the unwounded parent rejoins its
      herd with no vigil (kill and vigil are structurally exclusive);
      the lioness defends her cub (point 145c): the apex predator read from
      the other side — a lioness with a cub is seeded on savanna only where
      hyenas roam, and a hyena hunt on the cub resolves through the ONE
      shared core (FAMILY_DEFEND_SPECIES reaches the lioness without the prey
      loops; no second hunt state — the points 121(f)/130/146 architecture
      line) and the ONE parentAttackOutcome matrix, with preyWeapon.lion 2.0
      capping defendChance-vs-hyena at 0.95 (she routs it, sometimes kills it
      ~0.22, rarely loses the cub 0.05 — pure-tested) and the cub built on the
      baby schema (`buildLionCub`, pure-tested with the grazer calves); live
      (`scripts/verify/enrichments.mjs`) a forced hyena-vs-cub hunt drives off
      and the drama RESOLVES — cub freed, lioness alive, hunt left (screenshot
      133);
      the defence matrix
      (point 125): the parent-reaches-predator outcome is the product of
      prey weapon and predator flight-willingness (pure-tested: strictly
      ordered along §14.1's danger order for every prey AND along the
      reasoned weapon ranking for every predator, capped 0.95, missing
      species never defend, giraffe-vs-lion 0.75 clearly above
      antelope-vs-lion 0.125), applied at the charge AND shield
      resolutions with the hunt's actual predator — and the surrender
      branches (vigil, trample grief, waterfall plunge, mired) never roll,
      by construction and comment; the giraffe kick
      (point 124): giraffes are lion-only prey in the food web (pure-tested:
      present in no other predator's list, huntable exactly in their own
      regions — and the calf-hunt predator pick now filters by the victim's
      species, so no region-foreign or web-foreign pairing can arise), and a
      giraffe parent reaching the hunter drives the hunt off with the
      calibratable `parentDefense` chance (deterministic per-event roll,
      pure-tested boundary; visible hind-leg kick pose; the lion leaves via
      the ordinary walk-off) while a failed roll keeps today's sacrifice
      (live in `scripts/verify/enrichments.mjs`); the vigil at the
      carcass (point 121): a too-late parent walks to its eaten calf and
      HOLDS there (pure-tested landing block: no vulture lands, no ground
      scavenger commits while a live keeper stands within the radius), it
      flees nothing by recorded user decision, the carcass DRAWS a
      region-appropriate predator that spawns beyond the view ring (spawn
      geometry pure-tested) and takes the keeper through the existing hunt
      kill — the single global hunt is claimed only from idle, never
      clobbered — and with no predator drawn the vigil expires and the
      parent rejoins alive (all live in `scripts/verify/enrichments.mjs`);
      the drying
      waterhole (point 123): a dry-season lake bank can MIRE a calf on a
      bout ending there (pure-tested roll: only at the bank, only under
      the dryness threshold, exact boundaries), the calf struggles in
      place, its parent stands vigil beside it and flees no predator, the
      hunt's target bias finds the pair (a mired calf is always preferred)
      and takes BOTH — the mud never frees the calf for the sacrifice
      escape — while an unfound calf is released after the calibratable
      window (all live in `scripts/verify/enrichments.mjs`); in the water inside a waterfall's reach a calf is
      swept over and dies with its parent plunging after it, and a
      rescuing parent wading into the falls' reach is swept over itself
      while its calf survives. Calf trample grief (§19.8): a calf
      trampled by an elephant takes its parent with it — the parent does
      not dodge the herd but closes on the elephant's feet and is
      trampled too, dead over its own stain (`scripts/verify/
      enrichments.mjs`); the grief always resolves rather than chasing a
      target that cannot trample it — the nearest-living-elephant choice
      returning null with none left is pure-tested in
      `src/scenes/travel/wildlifeBehavior.test.ts`, which also pins that
      the charge reaches a walking elephant well inside the grief window.
    - Bodies and boundaries: the §19.5 body separation holds — streamed
      animals keep their body spacing after spawn (no two inside one
      another) and an animal placed onto another parts from it within
      moments, while the elephant trample remains possible; an animal on
      an open-ocean cell — and, outside the §19.8 water dramas and the
      wading flamingos, on any river/lake water cell — is set back to
      the nearest land; the scripted walk-off deflects along the coast
      instead of entering the ocean (the step rule pure-tested in
      `src/scenes/travel/wildlifeBehavior.test.ts`, the coast walk
      live-gated in `scripts/verify/enrichments.mjs`) (no animal strays into the impassable sea or
      stands in a channel, and the scripted hunt's prey balks at the
      waterline); drinkers walk only to the bank and bathers one wade
      past it (the bank-targeting rules pure-tested in
      `src/scenes/travel/waterEdgeRules.test.ts`, the standing rule
      live-checked in `scripts/verify/enrichments.mjs`); solid dressing
      keeps clear of the channels while reed belts hug the waterline
      (same rules module); some shore visitors bathe (wade in) beyond
      merely drinking.
    - Graveyard: the carcass/tusk/bone counts are asserted via the dev
      hook with a screenshot.
    - Weather, verified as CORRECT and VISIBLE (§19.13, point 147): every
      village and port is swept through `climateZoneAt` and asserted into a
      plausible zone with a real wet season (the check that would have caught
      the Fang-in-the-Sahara and Somali-in-the-Congo model bugs — no tropical
      settlement bone dry all year); and the season is measured in PIXELS, not
      the tint uniform — a savanna spot's ground differs on screen between its
      driest and wettest REAL month while the Congo (no dry season) does not,
      with a human-viewable screenshot pair (115/116). The standard is the
      picture, not "the tests pass": three rounds of uniform-level checks once
      passed while the player saw nothing (`scripts/verify/enrichments.mjs`).
    - Seasons and weather (§19.13): the wetness model is pure-tested
      against the researched ~1890 climate (`docs/climate-1890.md`) —
      Cairo rainless year round, no Sahara rain, the Sahel wet inside the
      1870-1895 humid period, East Africa bimodal, the Cape opposite the
      plateau, and the Ethiopian highlands keyed on ELEVATION rather than
      a lat/lon box (the below-sea-level Danakil is not highland) — as
      are the display curves (fog, rain, sun dim, sky overcast) and the
      §21.1 month/year jumps with their 1890-1895 clamp
      (`src/systems/season.test.ts`). Live: in the bird's-eye view the
      rains close the fog, dim the sun and rain visibly while the debug
      zoom stays season-free, the flora/ground bleach to straw and deepen
      to green, and the dry season's wider shore catchment gathers the
      animals at the remaining water (`scripts/verify/enrichments.mjs`).
      The season is the PLACE's, never the traveller's (point 151): ground
      and vegetation sample a spatially smoothed per-position greenness
      field through baked seasonUV coordinates — zone borders read as
      ~2-degree gradients (a border texel lies strictly between its
      sides), ground flora (bush/grass/papyrus, foliage class 2) sprouts
      from the soil while tree crowns keep the bare-branch collapse, and
      the field is a pure function of the calendar (all pure-tested in
      `src/render/seasonField.test.ts` and `src/render/flora.test.ts`);
      live, walking changes neither the field nor the slot greens (the
      witness of the point-151 "flying plants" bug) and the flora at the
      reported spots stands stable (`scripts/verify/enrichments.mjs`); and
      the dressing no longer JUMPS while driving (point 164): a probe traced
      the remaining jump to the streaming, not the season — the flora
      rebuilt a fixed neighbourhood on every chunk crossing, so its edge
      popped, worst at a wide zoom where it sat in view. It now streams
      zoom-aware like the wildlife — every plant within a CIRCLE of viewR +
      margin is drawn (edge always beyond the view) and a rebuild fires only
      past a hysteresis step (a back-and-forth no longer re-pops), the rules
      pure-tested in `src/scenes/travel/floraStreaming.test.ts` and a driven
      pass asserting zero in-view toggles across chunk crosses in
      `scripts/verify/enrichments.mjs`;
      the season reaches the people (§19.13, point 142): a transhumant
      village thins in its away season while children and elder remain
      (Maasai July 2 walkers vs April 5, live) and the sedentary Bemba
      never thin (asserted); the village fire burns harder under the
      place's own cold/harmattan/karif; the Sahel stall's grain shrinks in
      the hungry rains and refills at the harvest — pure-tested in
      `src/systems/seasonalLife.test.ts`, live in `scripts/verify/polish.mjs`;
      the ice of 1890 (§19.13, point 141) caps exactly the three glaciated
      massifs while the four named near misses stay bare — the list swept in
      a pure test (`inIceMassif`) AND live over the terrain colours; the
      High Atlas whitens in February and bares in July (pixel-fraction
      check, screenshot 122); hail fires only inside a heavy storm, never
      in a rainless zone (swept over the whole window), rarely, and
      deterministically (`src/systems/season.test.ts`,
      `scripts/verify/enrichments.mjs`);
      the harmattan (§19.13, point 140) palls the Sahel from late November
      to mid-March — the dome whitens toward dust (its own axis, not the
      wet gray), the noon sun reddens, the HALO IS MUTED (the researched,
      counter-intuitive half, pinned as a pure test in
      `src/systems/season.test.ts`) and the sight lines close harder than
      under rain — live-checked in the Sahel across January/August
      (`scripts/verify/enrichments.mjs`, screenshot 121);
      inside a settlement the season is derived from the PLACE's own
      coordinates and dims the sun and sky light, grays the dome, thickens
      the cloud deck, RAINS (a near-vertical eye-height field, calibrated
      apart from the bird's-eye's tilted streaks) and bleaches/greens the
      ground and flora with the shared per-zone tint — so the §19.10
      firelight carries further under the overcast and a desert port
      (Cairo) stays rainless in every month, all live-checked via
      `__placeSeason`/`__placeDress` in `scripts/verify/polish.mjs`
      (screenshots 110/111/114). The inhabitants' seasonal dress is
      evidence-gated per `docs/peoples-1890.md` §7: SIX peoples change on
      their own driver — the three drivers being cold, harmattan and
      karif, two of the six gated by rank — while the other sixteen stay
      bare however cold their ground gets, the cold being a class
      experience where it is felt at all; the per-people garment mapping
      lives in `design.md` §19.15. The
      per-people mapping, the three drivers, the rank gate and the two
      named traps (the San's cold Kalahari IS dressed on Passarge's
      evidence; the Pedi highveld crosses the threshold and is NOT, the
      blanket being a people the game lacks) are pure-tested in
      `src/systems/dress.test.ts`; the live half is `__placeDress` in
      `scripts/verify/polish.mjs` (screenshots 112/113).

    - The crocodile ambush (§19.16, point 130): crocodiles exist only ON
      river/lake water in every region's home systems (pure-tested:
      water-only placement, the five-region list, the boundary-exact lunge
      trigger, and that NOTHING kills a crocodile — structurally zero like
      the lion — while a strong parent can drive it off); hidden it sinks
      to the eye knobs, the lunge is a visible burst, the seized victim
      struggles through the SHARED §19.8 window (rescue, sacrifice and
      too-late all resolve against the crocodile via `caughtBy`, never
      touching the scripted lion hunt), a kill sinks (the river keeps the
      body — no bank carcass, no vulture), the strike radius is
      debug-editable, and walking into one routes through the unchanged
      §14.2 event. Live checks and screenshots pending in
      `scripts/verify/enrichments.mjs` (hidden -> lunge -> catch, the
      three family endings, lion-hunt independence).
    OPEN: tree-climbing-to-flee remains to be implemented (§9 open item);
    and the one seasonal-dress reading the research allows but the
    figures cannot yet show — a wrap worn DIFFERENTLY in the cold rather
    than in greater number (§19.13). (The former "additional new
    species/birds" item is now CLOSED: point 130's crocodile, point 145b's
    ground-nesting plover with its chicks and point 145c's lion cub joined
    the roster beyond the original fauna and the grazer calves.)
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
    console errors on both the WebGPU and WebGL 2 paths; the remaining
    simplification (true water refraction) is named as an open item (see
    pt. 32; SSR was tried and removed).
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
    Verifiable: the layout invariants are pure-tested across every place and
    several seeds (`src/scenes/place/layout.test.ts`: door reachable with no
    corner squeeze, window clearance between all building bodies, no
    building standing on a lane, winding port lanes with a square and six
    lane-fronting trade houses, each village matching its plan, the spawn
    corridor clear, Cairo outscaling Boma); the town-plan screenshots show
    the fabric difference (98 masai ring, 101 street village, 102 Cairo
    lanes, `scripts/verify/polish.mjs`); screenshots of a port city and a village show
    dense building fabric with paths and several non-functional buildings;
    inhabitants move about and use their dwellings; Cairo's walkable
    radius and dwelling count exceed Boma's; the backdrop mesh is present
    and Berber Village's backdrop stays a low horizon range (max elevation
    angle bounded); the application loads without console errors
    (`scripts/verify/enrichments.mjs`); the first-person ground clears a
    measured edge-energy bar (Laplacian of a ground crop,
    `scripts/verify/settings.mjs`) and the settlement materials sample the
    baked tileable surface maps (albedo + normal, reproducibly generated by
    `scripts/generate-surface-textures.mjs`, mip/anisotropy sampler state)
    and wire both a color and a micro-relief normal node — the fields'
    exact tileability, the normal-map normalisation and the mid-brightness
    albedo pure-tested in `src/render/surfaceTextures.test.ts`, the wiring
    and sampler state in `src/render/materials.test.ts`; the close-range
    primitives (figure bodies/heads, hut roofs and domes, granaries,
    mortar/pestle and stall goods) hold their tessellation floors so no
    facets read at eye height (`src/render/figures.test.ts`); the mid-distance ground is
    temporally stable under TRAA with a static camera (min frame diff
    gated, `scripts/verify/settings.mjs`) and no panorama silhouette
    stands sunken below the settlement ground plane — the clamp and the
    backdrop heightfield bounds pure-tested in
    `src/scenes/place/backdrop.test.ts`, the live standing heights via
    the dev hook (`scripts/verify/polish.mjs`); the §2.5 travel-scene panorama holds — entering from the bird's-eye
    view shows the captured, direction-true surroundings: the band stores
    content at the NEGATED bearing (empirical convention, pinned via the
    Giza measurement and pure-tested as bufferU/SECTOR_COMPASS in
    `src/scenes/travel/panoramaMath.test.ts`), the horizon cylinder
    samples the mirrored column, and a magenta probe injected due west
    of the capture point proves the rendered horizon compass-true
    seed-independently; a direct place-to-place enter falls back to the
    geometry backdrop (`scripts/verify/polish.mjs`, screenshot 99); the §4.4 port skyline landmarks
    hold — Cape Town mounts the Table Mountain massif (`__placeSkyline`,
    its flat wide profile pure-tested in `src/render/landmarks.test.ts`),
    Cairo mounts the Giza pyramids as its western skyline (point 82) —
    the field's Sphinx modelled as a recognizable couchant lion under the
    nemes (proportions and part count pure-tested via `buildSphinx` in
    `src/render/landmarks.test.ts`; travel-scale screenshot 103) — and
    Timbuktu builds the Djinguereber mosque as a collidable dwelling
    (`scripts/verify/polish.mjs`, screenshots 96/97/100).
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
    small invisible correction, never the player. Verifiable: an automated
    run steers the player character against building walls and corners and
    proves it keeps positive clearance; an observed inhabitant transitions
    walk → inside at its dwelling and out again; interaction with all
    functional buildings remains possible; every dwelling door (port and
    village) has a collision-free standpoint inside the walkable area; the
    spawn-freedom helpers (`spawnPointFree`/`nudgeToFree`) are pure-tested
    (`src/scenes/place/collision.test.ts`) and every place's errand points
    sweep spawn-free across seeds (`src/scenes/place/layout.test.ts`); live,
    no walker stays pinned past the window (`scripts/verify/collision.mjs`);
    the application runs without console errors (`scripts/verify/collision.mjs`).
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
    the journal open), and the panel ends above the camp/map/journal toggles
    per §17.4. German read-aloud stays an open item until a German-capable
    voice exists. Verifiable: spot check of both language files for
    markers; journal screenshot free of visible tags; starting narration
    produces audio without console errors; adding an entry switches its
    read-aloud control into the speaking state without a click; the start
    entry narrates on the first gesture; with the journal open at game
    start, driving movement still advances the player position
    (`scripts/verify/voice.mjs` — the voice and handwriting suites replay
    the TTS assets from the git-ignored local `.cache/tts/` cache, so the
    regression is CDN-independent); walking into a hut door with the journal
    forced open still opens the building (`scripts/verify/flow.mjs`); with
    the journal open, the `.journal` panel's bottom edge sits above the
    `.map-toggle` and `.journal-toggle` button tops and its right edge
    keeps a gap to the screen edge (`scripts/verify/enrichments.mjs`).
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
    always active (0.25x-16x) starting at the closer default 0.5. A debug
    checkbox gates zoom-out beyond that default (disabling clamps a wider
    view back to it), and the unlocked range reaches a whole-continent
    view per §21.4. The camera near plane snaps back to the first-person
    default the moment another scene takes the shared camera — entering a
    settlement straight out of the debug zoom must never clip hut walls.
    The debug menu offers the §21.3 dropdown selectors
    (jump-to: every named map point — ports, villages, mountains,
    waterfalls, lakes, cultural landmarks, natural sites, the elephant
    graveyard and the tomb — grouped by category and alphabetically
    sorted per group (`src/ui/DebugMenu.test.tsx`); equipment; gifts),
    the read-only render-backend row and the journal
    do-not-disturb option (§16.2; also F2); the §21.1 shortcuts hold (F1
    menu, F2 do-not-disturb, F3 full loadout — all gear/treasures, 100000
    gifts/dollars/provisions, full health, full canteen, no afflictions,
    capacity raised to fit, the extended zoom unlocked, and the travel
    speed set to 25 for fast test traversal (point 154) — F4 canoe
    toggle); the canteen's consumption
    rates and capacity are editable (§21.2), as is the parental rescue
    burst (`balance.family.rescueBurst`, §19.8 pt. 12 — the field's
    write-through pinned in `src/ui/DebugMenu.test.tsx`). Modal windows and full-screen
    overlays always render above the in-scene floating labels (§17.4).
    Verifiable, by suite:
    - `scripts/verify/settings.mjs`: the defaults (including the single
      ambience volume 0.1, the 5.6 travel speed, the canoe speed-up
      factor 3, the jungle/mountain factors and the canteen capacity
      500), the eye height, the 80 % strafe/backward factor (exact via
      the pure velocity helper, plus an in-scene smoke check that both
      directions move), the canoe and jungle factor fields editing at
      runtime, the F3 full loadout, the F4 canoe toggle, the Tab journal
      toggle (opens/closes without shifting focus onto a control, and
      does not toggle while a debug field is focused; `design.md` §17.5),
      the working debug-menu controls in both languages, a nearby
      animal's proximity call rising and fading once the player leaves,
      the coastal surf fade (point 153): the surf layer gain is >0 at the
      shore and EXACTLY 0 far inland, and the birdsong slider scales that
      source's gain (the fade curve `coastSurfGain` pure-tested in
      `src/systems/ambience.test.ts`, the birdsong/surf-bound debug
      write-through in `src/ui/DebugMenu.test.tsx`); the lion-feed
      depiction (pt. 12), and the first-person walk feel
      (point 97): while holding forward the camera y bobs off the 1.5 m
      eye height and settles back to it at rest, and a footstep fires with
      a surface class (`window.__walkFeel`). The walk-feel math — velocity
      inertia, step-phase/footstep crossings, the speed-scaled bob and the
      strafe-roll sign/clamp — is pure-tested in
      `src/systems/walkFeel.test.ts`; the bob is camera-only and never
      moves the logical position (interaction/door/leave-radius).
    - `scripts/verify/enrichments.mjs`: the zoom gate, at the zoom cap
      the built and visible far sheet, a fog far plane beyond 2000 and
      haze opacity ~0 with a screenshot (87), during a zoomed walk the
      water plane's scale uniform tracking its mesh scale (no sea/land
      drift) and the chunk-bound dressing hidden, the reversion at zoom 1
      (haze, far sheet and dressing), the dropdowns, the renderer row,
      and that with a settlement label hit-tested on top, opening a modal
      makes the dialog the topmost element at that point. The far sheet's
      chunk-matched ground tone is pure-tested in
      `src/scenes/travel/farColor.test.ts`, the F3 zoom unlock in
      `src/ui/Hud.test.tsx`.
    - `scripts/verify/collision.mjs`: corner clearance at box buildings
      and an inhabitant re-entering its dwelling (pt. 16).
    - `scripts/verify/voice.mjs`: the automatic narration of a new entry
      (pt. 19).
21. **Water realism.** The visual water realism of `design.md` §11.3 is
    implemented (rivers in carved beds rendering as one continuous,
    unbroken ribbon descending from source to mouth, bridged stray sea
    points, a calm surface with a visible current strengthening at rapids
    and falls, five white waterfall cascades with plunge-pool foam,
    springs in open land, flat lake surfaces just above their carved
    beds), the §11.3 width/course rule (rivers wider than scale via the
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
    Verifiable: `scripts/verify/enrichments.mjs` asserts 5 cascades, at
    least one spring and 8 lake surfaces, that no river has an interior
    gap and no river surface is buried, that every lake surface clears its
    interior bed, that the Nile is a single continuous strip, that a long
    driven canoe passage down the Nile stays on water the whole way (the
    point-136 playability claim), that a canoe-less swimmer floats
    chest-deep ON the lake sheet — never on the carved bed below it
    (point 152, checked mid-Lake-Edward via `__player`,
    screenshot 125), and — pure — that the densified courses
    hold the bounded turn angle with every control point anchored
    (`src/scenes/travel/riverSmoothness.test.ts`) while the width factor
    widens the sampled water span (`src/world/world.test.ts`), and that
    confluence edges are bank-masked (the Nile tributaries report interior
    edges, the masking stays local) via the dev hook — the interior-edge
    rule itself pure-tested in `src/scenes/travel/riverBanks.test.ts`; screenshots of the Nile, Victoria Falls and Lake Victoria
    (71-73) show the courses; an idle traveller on a river is swept
    downstream, the drift near a waterfall exceeds the unboosted drift,
    and being swept consumes time and provisions. The Nile flood (§19.13,
    point 138) holds: the flood model is remote-fed and pure-tested (it
    crests in October while Cairo's local wetness is 0, rises from June,
    and the source's kiremt is already falling as the crest still rises —
    `src/systems/season.test.ts`); live, the Aswan reach reads visibly
    higher in October than in April via `__rivers.surfaceAt`/`floodRise`
    (read through the app's dev hook, never a dynamic import — HMR hands a
    fresh module instance whose flood state is untouched), and the ribbon
    continuity and never-buried invariants are re-asserted AT flood peak
    (`scripts/verify/enrichments.mjs`, screenshots 117/118). The Okavango
    inversion (§19.13, point 139) holds: the delta floods in the LOCAL dry
    season — pure-tested in both directions (July flood > 0.8 while local
    wetness < 0.1; low in December as the local rains fall) and without
    leaking into normal rivers (the Zambezi keeps its January, the Nile its
    October); live, the delta's water fan reads visibly fuller in July than
    in January via `__naturalSites.deltaFlood`/`deltaWaterScale`
    (screenshots 119/120).
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
    debug menu, which also toggles afflictions for testing. Verifiable:
    `src/state/store.health.test.ts` asserts defaults, dehydration
    onset/recovery, the canteen fill draining away from water, emptying
    into thirst then health loss, and refilling at fresh water,
    regeneration, fever drain and medicine cure, the staged natural wound
    healing (light heals fed, severe eases to light, starving blocks it)
    and the death/successor flow; `src/ui/Hud.test.tsx` the sun-blindness
    veil and its recovery and the remains/defeat overlay;
    `scripts/verify/health.mjs` the vultures circling at poor condition;
    `scripts/verify/enrichments.mjs` that a severe wound shows on the
    bird's-eye figure (`__player.wounds`) and clears when healed
    (screenshot 90).
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
    the §14.4 first-time danger warnings stay active either way. Verifiable:
    `src/systems/events.test.ts` asserts the reduced rates, the
    protection ordering (pure functions), deterministic outcome mapping
    and the plains-predator danger order (cheetah < leopard < hyena <
    lion) with the lion's wider fatal band;
    `src/state/store.events.test.ts` the consequences of each trigger, a
    fatal attack, autonomous firing while travelling, silence when
    disabled, and the canoe-aware water warning firing — once — without
    the advising text; `scripts/verify/events.mjs` that pinning a lion —
    and a hyena — on the player in the scene triggers that predator's
    attack; `scripts/verify/enrichments.mjs` asserts each first-time
    danger warning fires exactly once and marks its flag.
24. **Deadline and successor.** The multi-year deadline of `design.md`
    §5/§18 is implemented (balance value, ~5 years) with staged journal
    warnings at 60 % and 85 % of the granted time — each exactly once, in
    both languages — the recall on expiry (defeat overlay, journal silent,
    no successor), and the §18 successor flow on death (pt. 22): resume at
    the last checkpoint, day penalty, silently inherited warning stage,
    takeover entry. Verifiable: `src/state/store.expedition.test.ts`
    asserts the staged warnings (exactly once each), the expiry defeat
    without successor, and the death-to-successor flow including the day
    penalty and takeover entry; `src/ui/Hud.test.tsx` the recalled-defeat
    overlay without a successor button.
    TEMPORARY (`design.md` §5.1, user 16.07.2026): the deadline is
    SUSPENDED in the shipped config (`balance.deadline.enabled` false) —
    the expedition never ends on time; instead the calendar STOPS at
    31.12.1895, the end of the game's window, at every day-advancing path.
    The mechanism stays implemented and tested (the tests enable the flag),
    so lifting the suspension is a one-value revert. Do not delete the
    deadline code, and do not "fix" the tests by dropping the flag.
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
    landmark, both languages, voice markup) — including the eight built
    cultural landmarks of §4.4 (Meroë, Giza, Great Zimbabwe, Lalibela,
    Kilwa, Aksum, Gondar, Bandiagara), framed as African achievements, and the
    four natural point-landmarks (Ngorongoro, Ol Doinyo Lengai, Okavango,
    Sudd); the valuable-presentation
    reactions of the §8 matrix; and the baseline goods in every settlement
    with money in ports and gifts in villages (§9). All new texts exist in
    both languages with voice markup. Verifiable:
    `src/state/store.economy.test.ts` (with the pure pricing/ferry/site
    helpers in `src/systems/economy.test.ts`) asserts the capacity
    refusal and auto-raise, the regional bid ordering and rejection, the
    stable re-offer quote (identical price across re-offers, cleared on
    leaving the port), the ferry to Zanzibar (fare, days, checkpoint),
    the bounty crediting, the graveyard's random ivory haul (range 1..9,
    mean ~5) and its cap by the remaining supply, digging a treasure
    cache and the statue site, both valuable reactions, the baseline
    goods in every settlement, buying food in a village against gifts
    (money untouched), the no-gifts refusal, and selling gear for gifts
    (village) or money (port); `src/ui/JournalPanel.test.tsx` the
    telegraphic-transfer report naming the discoveries;
    `src/state/store.travel.test.ts` asserts the landmark-sighting entry
    with its kind for a mountain, a waterfall, the Meroë pyramids (kind
    `pyramids`) and the Ngorongoro crater (kind `crater`) and that it
    fires only once;
    `src/i18n/i18n.test.ts` that each cultural landmark and natural site
    has a localized name and a dedicated discovery flavor in both
    languages, that the sighting entry's heading names the site
    (kind-shaped, markup-free) and that a dug find heads with the
    treasure's name (§10); `scripts/verify/enrichments.mjs` that all seven travel-map
    cultural landmarks (`__culturalLandmarks` — Giza is the eighth of §4.4
    but mounts as Cairo's skyline, pt. 15) and all four natural sites
    (`__naturalSites`) mount in the scene, render a non-black frame at
    their coordinates and reveal their label on sighting (screenshots 91,
    94, 95).
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
    voice markup. Verifiable: `src/state/store.reputation.test.ts`
    asserts a rifle in the pack does not block the elder talk or
    audience, the hostility/expulsion and its wear-off, the friend pledge
    (exactly once), the capped attack outcomes with rescue entries, the
    near-death aid, the free village supplies, the rich
    money/gifts/provisions haul, and the permanent robbery consequences
    including the forfeited friendship; `src/ui/Dialogs.test.tsx` the
    confirmation gate on the Rob button.
27. **Camps (item caches).** The camps of `design.md` §6.3 are
    implemented: free camps pitched (or reopened nearby) with C in the
    open, holding any number of inventory items (taking back respects the
    inventory capacity; storing the canoe leaves it behind, dropping its
    land penalty), marked with the map X and the bird's-eye pole marker,
    with the per-day looting risk (balance value) revealed by a journal
    entry on return; village caches gated by "Honored Friend", persistent,
    and irretrievably destroyed by a robbery in the region. All new texts
    exist in both languages with voice markup. Verifiable:
    `src/state/store.camps.test.ts` asserts pitching and reopening,
    storing/taking incl. the capacity refusal and the canoe put-away, the
    loot-and-discover flow with its journal entry, the friend gate on
    village caches, their persistence, and their destruction by the
    robbery (the map X rides on the covered `freeCamps` state).
28. **Full saving and loading.** The port-snapshot saving and tabular load
    overview of `design.md` §18 are implemented — one snapshot per port
    visit (a placeholder cap keeps only the most recent ones), the
    overview table with port city, in-game date, money, food, gifts and
    health state, manual saving omitted. A legacy single-slot checkpoint
    migrates as one table row; the successor (pt. 24) resumes from the
    latest snapshot. All menu texts exist in both languages. Verifiable:
    `src/state/store.saveload.test.ts` asserts one snapshot per port
    visit, resuming an older visit restores that state, the successor
    using the latest snapshot, and the legacy migration;
    `src/ui/Hud.test.tsx` the table columns incl. the health state.
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
    The touch/tablet layer of `design.md` §17.5 (point 84) holds as a
    third input source with zero change to desktop play: a virtual stick,
    a right-half look/steer drag surface with two-finger pinch zoom, a
    tappable interaction prompt (dispatching the key it names — one input
    path), the deliberate-input guard that arms the layer only on the
    first real touch, and the touch-tied mobile quality preset (TRAA/SSAO
    off, half-resolution shadows, each debug-re-enablable — never
    user-agent sniffing). Verifiable: the stick/pinch/latch math is
    pure-tested (`src/systems/touchInput.test.ts`); `src/ui/Hud.test.tsx`
    that `touchActive: false` renders no `.touch-controls` while
    `touchActive: true` mounts the stick and look surface and makes the
    prompt a tappable button firing the E key; `src/state/ui.test.ts` that
    `activateTouch` arms the layer with the preset and is idempotent (a
    debug re-enable is not clobbered); `src/ui/DebugMenu.test.tsx` the
    localized SSAO and half-shadow checkboxes writing through to the store;
    `scripts/verify/touch.mjs` (a `hasTouch` context, real CDP touch
    events) that no overlay shows before the first touch, the first touch
    mounts it and applies the preset, the stick walks the character (and
    releasing it settles), a right-half drag turns the first-person yaw,
    tapping the prompt addresses the elder, and a two-finger pinch changes
    the bird's-eye zoom — all without console errors.
31. **Settlement orientation and panorama wildlife.** The gift-unlocked
    building orientation of `design.md` §17.3 holds (pulsing markers on
    the important, enterable buildings after the first accepted gift,
    persisted per settlement, announced by a localized toast), as does the
    §2.5 panorama wildlife (region-typical silhouettes drifting beyond the
    settlement edge — far and small, hazed toward the sky, standing on the
    VISIBLE horizon line rather than a monument looming or clipping to a
    black sliver; points 92/94; their species the region's own bird's-eye
    pool and never crossing a fixed skyline landmark, point 102).
    Verifiable: `scripts/verify/polish.mjs`
    asserts no markers before and markers after the gift plus the toast,
    their persistence across re-entry, and the panorama wildlife count via
    the dev hook, with a screenshot of the highlighted village; plus that
    every silhouette reads small (bounded subtended angle), is hazed (not
    flat black), stands at/above the ground plane without a capture, and
    sits on the band's horizon line (`|y − visibleY|` bounded) with a
    capture active — the sizing/haze math pure-tested in
    `src/scenes/place/panoramaWildlife.test.ts`; and that in Cairo no
    visible silhouette's azimuth lies inside the Giza skyline span
    (`__placeSkylineExclusion`/`__placePanoramaWildlifeInfo`, point 102),
    the azimuth-exclusion helper (span from placement, margin, inside/
    outside with ±π wrap-around) pure-tested in the same file.
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
    step 1). True water refraction remains OPEN. Verifiable:
    `scripts/verify/settings.mjs` toggles TRAA at runtime, asserts a
    non-black frame without console errors on the WebGL 2 path (with
    screenshot 69), and gates the rebuild leak on a flat renderer texture
    count across repeated toggle cycles; `src/ui/DebugMenu.test.tsx`
    asserts the localized TRAA checkbox (default on) writing through to
    the UI store.

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
