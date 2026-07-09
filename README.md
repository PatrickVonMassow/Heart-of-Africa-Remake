<img width="1168" height="784" alt="Grok 1" src="https://github.com/user-attachments/assets/4ee7611d-eb48-458f-8689-38f59a48cd15" />

# The Heart of Africa — Modern Remake

A single-player 3D remake of the 1985 exploration classic *The Heart of Africa*,
built as a web application. You start in Cairo in 1890 with $250 and a journal,
and travel across a geographically authentic Africa in search of a lost tomb —
trading in port cities, offering culturally appropriate gifts to village chiefs,
and decoding direction hints given in the regions' own language system.

This repository contains the proof of concept: the core gameplay loop end to
end, not the complete game. `design.md` is the authoritative design document;
`CLAUDE.md` defines the POC scope, acceptance criteria and build rules.

## Gameplay

- **Two perspectives.** A 3D bird's-eye view for the journey across the
  continent, and a first-person view inside walkable settlements; the game
  switches between them when entering or leaving a settlement.
- **Living world.** Ten port cities, 22 peoples, 17 rivers and real landmarks
  at their correct 1890 positions. Settlements are densely built and inhabited:
  procedurally varied dwellings, street networks, and villagers who go about
  their routines, with full player/NPC collision.
- **Trade and cultural contact.** Buy equipment, provisions and gifts in port
  cities; a culturally correct gift to a village chief unlocks a hint.
- **Language and direction system.** Hints are given in the regional
  Nivera/koko/Katula system and must be decoded into bearings and positions.
- **Survival.** Provisions, a canteen with a draining water level, and a health
  pool worn down by starvation, fever, dehydration, sun blindness and wounds;
  medicine cures, fresh water and rest restore.
- **Hazards.** Hidden per-day events while travelling — animal and robber
  attacks, crocodiles, fever, sandstorms, waterfall sweeps — and wandering
  predators (lion, cheetah, leopard, hyena) that attack on contact. Equipment
  protects by mere possession; a multi-year deadline and a successor on death
  keep the expedition finite.
- **Journal.** A chronicle that grows automatically with events and stores
  decoded hints, language-neutrally, re-rendered in the selected language. Every
  English entry can be read aloud in-browser via the Kokoro TTS model, with
  emotional voice markup shaping the delivery.
- **The goal.** A procedurally placed tomb triangulated from regional hints;
  digging at the right spot with the shovel wins the game.

## Tech stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- [three.js](https://threejs.org/) via [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) and [drei](https://github.com/pmndrs/drei)
- **WebGPU renderer with automatic WebGL 2 fallback** — shaders are written in
  TSL (Three Shading Language) so one code path serves both backends
- [zustand](https://github.com/pmndrs/zustand) for game state
- [oxlint](https://oxc.rs/) for linting

Rendering features include real-DEM terrain with biome-based PBR texture
splatting, hand-authored ~1890 hydrology vectors, a physically grounded
scattering sky with IBL, cascaded shadows, SSAO, bloom, filmic tone mapping,
and water with a wave field, depth-dependent absorption and shore foam.

## Getting started

Requires Node.js ≥ 20.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
```

Other scripts:

```sh
npm run build      # type-check + production build (must pass clean)
npm run preview    # serve the production build locally
npm run lint       # oxlint (zero errors/warnings required)
npm audit          # zero known vulnerabilities required
npm test           # full headless regression (boots dev + preview servers)
```

The game starts in English by default; German can be selected at runtime via
the debug menu (F1). All player-facing text lives in `src/i18n/` — adding a
language means adding one file.

## Geodata

The terrain uses real elevation data. The runtime assets in `public/geodata/`
are generated reproducibly (no npm dependencies) by the scripts in
[`scripts/`](scripts/README.md):

```sh
node scripts/build-geodata.mjs              # DEM from public Terrarium tiles
node scripts/generate-terrain-textures.mjs  # tileable ground textures
```

## Project structure

```
design.md            authoritative design document (do not modify)
CLAUDE.md            POC scope, acceptance criteria, build rules
scripts/             reproducible geodata preprocessing
public/geodata/      generated DEM + terrain textures
verification/        acceptance-criteria screenshot evidence
src/
├── config/          central balance values (runtime-tunable via debug menu)
├── i18n/            language files (de, en) and localization runtime
├── journal/         journal sketches
├── render/          sky, water, materials, flora/fauna, post effects
├── scenes/travel/   bird's-eye view: terrain, climate, wildlife
├── scenes/place/    first-person view: settlements, inhabitants, collision
├── state/           game and UI state (zustand)
├── systems/         input, ambience
├── ui/              HUD, status bar, journal panel, map, dialogs, debug menu
└── world/           geography, geodata sampling, hydrology, terrain model
```

## Status

All 32 acceptance criteria of `CLAUDE.md` §7.1 are implemented; screenshot
evidence lives in `verification/`. Known simplifications (e.g. no TAA, no true
screen-space reflections, English-only journal read-aloud) are recorded as open
items in the code (`// OPEN:`). The full headless regression runs with
`npm test`.
