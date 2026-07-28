<img width="1168" height="784" alt="The Heart of Africa — Modern Remake" src="https://github.com/user-attachments/assets/07cc05d9-7a8d-427c-88a7-adbd0ea372cf" />

# The Heart of Africa — Modern Remake

PoC playable directly in the browser at:  
<https://patrickvonmassow.github.io/Heart-of-Africa-Remake/poc/>

A single-player 3D remake of the 1985 exploration classic *The Heart of
Africa* — Ozark Softscape's follow-up to *The Seven Cities of Gold* (1984) —
built as a web application. You start in Cairo in 1890 with $250 and a journal,
and travel across a geographically authentic Africa in search of a lost tomb:
trading in port cities and decoding direction hints given in the regions' own language system.

If you remember *The Seven Cities of Gold*, you know the DNA: the same design
team, and the same loop of walking into an unmapped continent, watching the map
fill itself in behind you, and getting along — or not — with the peoples who
already live there. Where that game had the Americas, this one has Africa.

## Screenshots

<table>
  <tr valign="top">
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/ded4dedd-3b13-46e3-b09a-983bbe3178fa" alt="Inside a village" width="100%"><br>
      <strong>Village.</strong> Procedurally varied dwellings, inhabitants going about their routines.
    </td>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/1cff2bc4-3579-499f-b6e8-9a2e4b4f4038" alt="Inside a port city" width="100%"><br>
      <strong>Port city.</strong> Trade, equipment, gifts and treasure prices.
    </td>
  </tr>
  <tr valign="top">
    <td>
      <img src="https://github.com/user-attachments/assets/4f2b165f-9cfb-4de6-8517-bc1ce19af9de" alt="Coastal dunes seen from the travel view" width="100%"><br>
      <strong>Coastal dunes.</strong> Real elevation data, cascaded shadows, wildlife herds on the move.
    </td>
    <td>
      <img src="https://github.com/user-attachments/assets/7a936324-3c3e-47d0-bd7b-4be9e55d9742" alt="Savanna seen from the travel view" width="100%"><br>
      <strong>Savanna.</strong> Biome-based terrain texturing and ambient wildlife.
    </td>
  </tr>
</table>

## Gameplay

- **Two perspectives.** A 3D bird's-eye view for the journey across the
  continent, and a first-person view inside walkable settlements; the game
  switches between them when entering or leaving a settlement.
- **Living world.** Ten port cities, 22 peoples, 17 rivers and real landmarks
  at their correct 1890 positions; the map is trimmed to the walkable continent
  (the world ends at the African Red Sea coast). Settlements are densely built
  and inhabited: procedurally varied dwellings, street networks, and villagers
  who go about their routines, with full player/NPC collision. Ambient wildlife
  streams with the journey — grazing herds that raise calves, predator hunts
  with regional food webs, elephant herds, vultures and shore life.
- **Trade and cultural contact.** Buy equipment, provisions and gifts in port
  cities; a culturally correct gift to a village chief unlocks a hint. Bazaars
  pay regional prices for treasure finds (continent-wide arbitrage), travel
  agencies sell ferry passages, and discovery bounties arrive at the next port
  as telegraphic transfers.
- **Language and direction system.** Hints are given in the regional
  Nivera/koko/Katula system and must be decoded into bearings and positions.
- **Survival.** Provisions, a canteen with a draining water level, and a health
  pool worn down by starvation, fever, dehydration, sun blindness and wounds;
  medicine cures, fresh water and rest restore.
- **An authentic 1890 climate and its people.** Every place runs its own
  researched seasonal calendar — the Sahel's humid-period rains, the
  harmattan's dust pall, the October Nile flood and the Okavango's inverted
  July flood, snow only on the peaks that really carried it — and the
  inhabitants answer it as the period sources describe: six peoples
  put on a documented seasonal garment (rank-gated where the record says so),
  while for the rest the season shows in the fire, the market and who is
  away with the herds.
- **Journal.** A chronicle that grows automatically with events and stores
  decoded hints, language-neutrally, re-rendered in the selected language.
  Every English entry can be read aloud in-browser
  via the Kokoro TTS model, with emotional voice markup shaping the delivery.
- **Saving and controls.** Automatic checkpoints on every port visit with a
  tabular load overview.
- **The goal.** A procedurally placed tomb triangulated from regional hints;
  digging at the right spot with the shovel wins the game.

### Audio

Deliberately still open. The 1985 original's score is not used here in any
form, and no placeholder music has been dropped in either — the sound design
deserves to be decided rather than defaulted into. Ideas and collaborators
welcome; see [Contact](#contact).

## Tech stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- [three.js](https://threejs.org/) via [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) and [drei](https://github.com/pmndrs/drei)
- **WebGPU renderer with automatic WebGL 2 fallback** — shaders are written in
  TSL (Three Shading Language) so one code path serves both backends
- [zustand](https://github.com/pmndrs/zustand) for game state
- [kokoro-js](https://github.com/hexgrad/kokoro) for the in-browser journal
  read-aloud (lazy-loaded, synthesized in a Web Worker)
- [oxlint](https://oxc.rs/) for linting

Rendering features include real-DEM terrain with biome-based PBR texture
splatting, hand-authored ~1890 hydrology vectors, a physically grounded
scattering sky with IBL, cascaded shadows, SSAO, TRAA, bloom, filmic tone
mapping, and water with a wave field, depth-dependent absorption and shore
foam.

## Getting started

Requires Node.js ≥ 20.

```
npm install
npm run dev        # dev server at http://localhost:5173
```

Other scripts:

```
npm run build      # type-check + production build (must pass clean)
npm run preview    # serve the production build locally
npm run lint       # oxlint (zero errors/warnings required)
npm audit          # zero known vulnerabilities required
npm run test:unit  # fast Vitest layer (jsdom): logic, store, HUD components
npm run test:small # everyday gate: Vitest + the core browser suites (no preview)
npm test           # full (LARGE) headless regression: every suite + preview
```

The game starts in English by default; German can be selected at runtime via
the debug menu (F1). All player-facing text lives in `src/i18n/` — adding a
language means adding one file.

## Geodata

The terrain uses real elevation data. The runtime assets in `public/geodata/`
are generated reproducibly (no npm dependencies) by the scripts in
[`scripts/`](scripts/README.md):

```
node scripts/build-geodata.mjs              # DEM from public Terrarium tiles
node scripts/generate-terrain-textures.mjs  # tileable terrain textures (bird's-eye)
node scripts/generate-surface-textures.mjs  # tileable settlement surfaces (first-person)
```

At load time the DEM is trimmed to the game world: only land connected to the
game's own land masses is kept, so Sinai, Arabia, southern Europe, foreign
islands and the unreachable Madagascar render as open sea
(`src/world/redSea.ts`); `dem.png` itself stays untouched.

## Project structure

```
design.md            authoritative design document (do not modify)
CLAUDE.md            POC scope, acceptance criteria, build rules
scripts/             geodata preprocessing + headless verification (scripts/verify/)
public/geodata/      generated DEM + terrain textures
verification/        acceptance-criteria screenshot evidence
src/
├── config/          central balance values (runtime-tunable via debug menu)
├── i18n/            language files (de, en) and localization runtime
├── journal/         journal sketches, voice markup, in-browser TTS read-aloud
├── render/          sky, water, materials, flora/fauna, post effects
├── scenes/travel/   bird's-eye view: terrain, climate, wildlife
├── scenes/place/    first-person view: settlements, inhabitants, collision
├── state/           game and UI state (zustand)
├── systems/         input, movement, events, economy, ambience
├── ui/              HUD, status bar, journal panel, map, dialogs, debug menu
└── world/           geography, geodata sampling, hydrology, terrain model
```

`design.md` is the authoritative design document; `CLAUDE.md` defines the POC
scope, acceptance criteria and build rules.

## Status

This repository contains the **proof of concept**: the core gameplay loop is not fully developed.

The full headless regression runs with `npm test` — a fast Vitest (jsdom) layer
plus 15 Playwright browser suites; the test strategy and coverage map live in
[`scripts/verify/README.md`](scripts/verify/README.md).

## Credits

### The original game

*The Heart of Africa* (1985) was created by **Ozark Softscape** and published
by **Electronic Arts**. It was the follow-up to *The Seven Cities of Gold*
(1984).

- **Dan Bunten** (later Dani Bunten Berry) — design and programming
- **David Warhol** — music and sound effects
- **Electronic Arts** — publisher

This remake exists because that game was worth remembering. All credit for the
concept, the design and the original score belongs to the people above.

### This remake

Designed by **Patrick von Massow**. Source code, assets and text in this
repository are original work unless noted otherwise.

### Data and libraries

- Elevation data derived from public **Terrarium** terrain tiles
- Hydrology and place-name research from public-domain and openly licensed
  period sources
- See [Tech stack](#tech-stack) for the open-source libraries this project
  depends on; each remains under its own license

## Legal

This is a **non-commercial fan project**, made as a tribute. It is not
affiliated with, endorsed by, or connected to Electronic Arts Inc., Ozark
Softscape, or any rights holder of the original game.

- No code, graphics, audio, text or other assets from the 1985 original are
  used, extracted or redistributed here. Everything in this repository was
  built from scratch.
- *The Heart of Africa*, *The Seven Cities of Gold* and all related names and
  marks are the property of their respective owners. They are used here only to
  identify the work this project pays tribute to — nominative use, no claim of
  ownership implied.
- Nothing here is sold, monetised, or offered in exchange for payment,
  donations or advertising revenue, and there is no intention to do so.
- Depictions of 1890s Africa, its peoples and the colonial-era framing of the
  original are treated as historical subject matter, researched from period and
  scholarly sources. Where the original's assumptions have not aged well, this
  project tries to do better rather than reproduce them.

If you hold rights to the original work and object to anything in this
repository, open an issue or contact the author and it will be addressed
promptly.

Own code released under the [MIT License](LICENSE).

## Contact

Questions, corrections, period sources, or an interest in the audio side:
open an [issue](https://github.com/PatrickVonMassow/Heart-of-Africa-Remake/issues)
or get in touch directly.
