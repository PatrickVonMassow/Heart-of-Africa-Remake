# Acceptance evidence (CLAUDE.md §7.1)

For each acceptance criterion the full chain of proof: which check, which file, which
screenshot. Moved out of CLAUDE.md because that file is loaded at EVERY session start
and these chains were the larger part of it, while they are needed at a closing and at
a tag. The wording is moved verbatim; numbering and conditions are as they stood in
§7.1. A criterion and its evidence section change in the SAME commit.

---

## 2. Two perspectives.

Verifiable: an automated
run walks into a place and presses SPACE to enter it, stands at a
building's door and presses SPACE to enter it, and walks past the
settlement edge to leave (no key); walking a door WITHOUT a key does not
enter; on entering, no HUD control (button/input) retains focus
(`scripts/verify/flow.mjs`); the settlement-entry candidate + SPACE gate,
the water guard and the discovery-gated enter-hint name (`?` for an
undiscovered place, the name for a discovered one) are pure-tested
(`src/scenes/travel/settlementEntry.test.ts`), with `flow.mjs` live-checking
that an undiscovered village's enter hint shows no proper name while Cairo's
names it. The leave transition stays FLUID: the
travel scene's shared materials/meshes survive remounts as module
singletons (surgical dispose opt-outs — a full remount used to re-link
the whole travel program set synchronously, freezing the main thread
10-16 s after several visits), gated in `scripts/verify/polish.mjs`
(leave after several settlement visits completes in under 3 s).

## 3. World model.

Verifiable: near
a border, `.region-label` elements name both regions on their sides;
undiscovered `.map-label` elements read their localized kind placeholder
("Unknown village"/"Unknown mountain", point 318), a visited place (Cairo)
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

## 4. Movement and time.

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

## 5. Port city.

Verifiable: `scripts/verify/flow.mjs` asserts the
buy price cells share a column and, in the bazaar, the buy prices and
sell names each share a left edge (`src/ui/Dialogs.test.tsx` pins the
name/price grid cells on the sell, bazaar and ferry lists);
`src/state/store.economy.test.ts` asserts selling gear in a port pays
money.

## 6. Village and cultural contact.

Verifiable:
`src/state/store.economy.test.ts` buys food in a village against gifts
(money untouched), refuses a purchase without gifts, and sells gear for
gifts; `src/ui/Dialogs.test.tsx` prices village goods in gifts, not
money.

## 7. Language/direction system.

Verifiable: `src/state/store.hints.test.ts` covers all five
regions, the retroactive deciphering (either order) and the gift lore;
`src/i18n/i18n.test.ts` the in-world words in the language files.
## 8. Chronicle/journal.

Verifiable: `src/i18n/villages.test.ts` asserts one
distinct, markup-clean text per village in both languages, and
`src/state/store.travel.test.ts` that the entry carries its people.

## 9. Status bar.

Verifiable: the hint element is a descendant
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

## 10. Goal scaffolding.

Verifiable:
`src/state/store.hints.test.ts` asserts that the deciphered latitude
and longitude equal the actual grave position and that non-knowing
chiefs point to the knowing people; `scripts/verify/flow.mjs` plays
the full loop (gift → lesson → deciphered latitude, the East leg for
the longitude, then the dig).

## 12. Atmosphere.

Verifiable (`scripts/verify/settings.mjs`,
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
  predator smoothly without teleporting (no single-frame jump). The
  AMBIENT herds match the region too (point 208 A2): the visible
  grazer seeded on a savanna cell is drawn from that region's
  `REGION_PREY` pool, so no giraffe/zebra/wildebeest stands as
  "scenery" where every other rule calls it foreign — pure-tested via
  `ambientSavannaSpecies` in
  `src/scenes/travel/wildlifeBehavior.test.ts`.
- Streaming: the zoom-aware despawn holds (an animal survives a
  tile-boundary crossing while in view, despawns once well outside
  it, and a wider zoom keeps animals the default view would have
  dropped) — with the scripted predator obeying the same ring: after
  feeding it walks off and is removed only beyond it, and a strayed
  chase aborts the same way. The walk-off is COAST-SAFE (point 188): it
  holds a sticky escape-corridor heading (longest clear land corridor,
  outward-biased — never the raw seaward radial that shuttled it on the
  beach), and past the calibratable `balance.hunt.leaveOvertimeSeconds` a
  still-ringbound predator retires the moment it is OFF the rendered
  frame (frustum-projected, never a radius) — so a coast pocket can
  never pin it pacing forever; a staged coastal leave resolving is gated
  in `scripts/verify/enrichments.mjs`, the corridor pick pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts`. A settlement's bird's-eye vicinity is
  never empty (point 102): where the normal spawn falls short, the
  region-typical presence within `balance.panoramaWildlife.vicinityRadius`
  of a settlement is seeded up to `.vicinityMinAnimals` — verified
  in `scripts/verify/enrichments.mjs` (after leaving Cairo, at least
  the minimum region-typical grazers stand within the radius via
  `__wildlife`, deterministic under the fixed seed). No GROUND animal
  pops into view (point 165): the guarantee-seeders placed standing
  animals at the frame edge where they popped; they now place OUTSIDE
  the rendered frame, projecting each candidate through the live camera
  (the true frustum, not an assumed 100×zoom radius — the point-172
  lesson) via a shared `isOnScreen` the travel scene installs — the
  vicinity seeder prefers an off-screen land spot (`pickOffscreenLandAnchor`,
  pure-tested in `src/scenes/travel/wildlifeBehavior.test.ts`), the
  dry-shore seeder only seeds a bank while it is off-screen; a driven
  pass at the ACHIEVABLE zoom 0.5 (plus a zoom-out) asserts NO animal
  appears inside the frame — projected via `__camera.onScreen` — the
  frame it joins the herds (`scripts/verify/enrichments.mjs`).
- Vultures, remnants and carcass bounds: a non-lion (trampled)
  carcass draws a vulture that lands and consumes it until it is
  removed — the vulture spawning beyond the zoom-aware view ring and
  flying in (no popping in), flying off after the meal and despawning
  only well outside the view, and the kill-circling flock flying the
  same in/out pattern; a finished hunt leaves a small prey remnant at
  the kill site which the ALREADY CIRCLING kill flock then descends
  on and finishes — the ground scavenger never takes a flocked kill's
  scrap (and a feed that ends without a kill leaves none); a DRIVE-OFF
  (the parent repels the predator, no kill) draws NO flock — the flock
  is keyed on the feed or a real remnant, never on the predator's
  walk-off alone, so the birds never land over a rescue that killed
  nothing (point 162, `killFlockActive` pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts`, live drive-off check in
  `scripts/verify/enrichments.mjs`); carcasses
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
  between an approaching predator and its calf. A CALIBRATABLE FRACTION
  of each herd group are calves (point 169, `balance.family.calfFraction`,
  debug-editable), each linked to its own distinct parent — count =
  clamp(round(fraction·n), 1, floor(n/2)), pure-tested via
  `calvesForGroup` in `src/scenes/travel/wildlifeBehavior.test.ts` and
  live-verified (a higher fraction yields strictly more juveniles) in
  `scripts/verify/enrichments.mjs`. A juvenile whose parent dies is
  ADOPTED (§19.8, point 262): the nearest eligible adult within the
  calibratable `balance.family.adoptionRadius` takes it on, so the
  §19.8 dramas recur for the new pairing instead of leaving an inert
  orphan. Eligible is a live, same-species, non-predator adult that is
  neither the juvenile itself, nor the killer that just took the
  parent, nor already raising a live calf (the 1:1 relation cap) —
  `findAdopter`/`isPredatorSpecies` pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts` (nearest pick, the
  radius as the gate, each exclusion, and a homogeneous predator pool
  finding no adopter). Calf predation
  (§19.8): a caught calf struggles alive (no stain or shrink) for a
  few seconds before the kill, a parent that reaches the predator is
  eaten in the calf's place while the calf escapes, a parent that
  only got close by the window's end is eaten alongside the calf, and
  the full LionHunt path runs a calf down and catches it (the parent
  held out of shielding reach) — with the hunted calf visibly fleeing
  the chase (slower than its hunter) instead of standing at its
  parent, steering around a coast or river the way every mover does
  rather than pinning on the waterline (point 157: the flee routes
  through `calfFleeStep`/`deflectedStep`, a dead-end left for the catch
  to resolve; pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts`), and a parent in reach
  holding itself between hunter and
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
  an open-ocean cell — and, outside the §19.8 water dramas, the wading
  flamingos, a CAUGHT victim at the waterline and a purposeful CROSSING
  (point 192), on any river/lake water cell — is set back to the nearest
  land; the point-192 water rule holds — SUPERSEDED as a TARGET by the
  §19.5 revision of 25.07.2026 (water is for crossing, not for lingering;
  a FLIGHT is never restricted by river or lake at all), which this
  paragraph will state once that lands: what follows pins what is BUILT
  today, per the §7.1 convention — an animal may CROSS a river/lake
  (chest-deep on the rendered sheet, seasonal wade speed,
  `balance.waterCross.*` calibratable, hard resolve deadline) and a prey
  boxed against the water by a predator or an oncoming elephant flees
  INTO it — the crossingTarget pick refuses the ocean and over-wide
  channels (pure-tested), and a staged crossing swims the channel and
  lands in `scripts/verify/enrichments.mjs`; the scripted walk-off deflects along the coast
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
  and vegetation read a spatially smoothed per-position greenness
  field — the ground samples it per VERTEX through baked seasonUV
  texture coordinates, the vegetation reads a per-INSTANCE seasonTint
  the CPU BAKES at each rebuild for its COLOUR, while the dry-season crown
  COLLAPSE rides the crown mesh's own INSTANCE MATRIX (point 175: reading a
  per-instance attribute in the flora's vertex stage raced its rebuild
  re-upload on the WebGPU backend and made the crowns jitter and float while
  driving; the instance matrix is the stable transform path — re-uploaded at
  the same rebuilds without position jitter — so the crown geometry is split
  from the trunk (`splitFoliage`) and its matrix carries the collapse,
  leaving only the imperceptibly-racing colour on the attribute; the CPU
  collapse/sprout maths mirror the shader in `seasonTint.ts`) —
  zone borders read as
  ~2-degree gradients (a border texel lies strictly between its
  sides), ground flora (bush/grass/papyrus, foliage class 2) sprouts
  from the soil while tree crowns keep the bare-branch collapse, and
  the field is a pure function of the calendar (all pure-tested in
  `src/render/seasonField.test.ts`, `src/render/flora.test.ts` and the
  collapse maths in `src/render/seasonTint.test.ts`);
  live, walking changes neither the field nor the slot greens (the
  witness of the point-151 "flying plants" bug), the flora at the
  reported spots stands stable, and the dry-season crown collapse actually
  applies on the crown matrix with the debug toggle gating it — the WebGPU
  jitter it replaced is not reproducible headless, but the collapse wiring is
  (`__vegetation.crownCollapse`, `scripts/verify/enrichments.mjs`); and
  the dressing no longer JUMPS while driving (points 164 + 171): a probe
  traced the remaining jump to the streaming, not the season — the flora
  rebuilt a fixed neighbourhood on every chunk crossing, so its edge
  popped. 164 moved the edge to a CIRCLE, but sized it to an ASSUMED view
  of 100×zoom and still popped at a wide zoom; 171 found by the PICTURE
  that the real visible limit is the camera FRUSTUM (the fog is pushed to
  the horizon at a wide zoom, so fog.far is not it either), and now draws
  the circle to a generous fog.far + margin CAPPED radius that always
  exceeds the frustum, so the edge sits beyond the rendered frame at any
  zoom — with the per-chunk fill running NEAREST-FIRST so the instance
  buffer covers the nearest, on-screen plants first and drops only the
  farthest, off-screen ones, and a rebuild firing only past a hysteresis
  step (a back-and-forth no longer re-pops; the rebuild compares the SPAWN
  RADIUS not the raw fog far, so clearView's horizon lerp triggers no
  storm). The rules are pure-tested in
  `src/scenes/travel/floraStreaming.test.ts`, and a driven pass PROJECTS
  each plant to the screen and asserts ZERO appear inside the frame while
  driving at an ACHIEVABLE zoom (0.5), the F3 report zoom (1.5) and wider
  (2.2) in `scripts/verify/enrichments.mjs`;
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
  `scripts/verify/enrichments.mjs`); a THUNDERSTORM (point 166) fires
  lightning FLASHES with a delayed THUNDER (1-4 s) as a pair, gated like
  the hail (heavy storm only, never rainless, deterministic, a minority of
  storm days) and visible in both the bird's-eye and the settlement view —
  the gate and the delay band pure-tested (`thunderstormAt`,
  `thunderDelaySeconds` in `src/systems/season.test.ts`), the live flash
  pulse and the fired thunder gated in `scripts/verify/enrichments.mjs`
  (screenshot 134);
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
  §14.2 event. The gripped lunge carries a HARD RELEASE DEADLINE
  (`balance.crocodile.gripSeconds`, debug-editable, above the ~5 s
  struggle window) so a victim that VANISHES mid-grip (streamed out,
  taken by another system) never pins the crocodile — the §19.8
  "every started drama resolves" rule / invariant I4 (point 186,
  pure-tested via `crocodileGripExpired`). Live in
  `scripts/verify/enrichments.mjs`: hidden -> lunge -> catch, the
  three family endings, the vanish -> deadline release, and lion-hunt
  independence, with screenshots 129/130.
OPEN: tree-climbing-to-flee remains to be implemented (§9 open item);
and the one seasonal-dress reading the research allows but the
figures cannot yet show — a wrap worn DIFFERENTLY in the cold rather
than in greater number (§19.13). (The former "additional new
species/birds" item is now CLOSED: point 130's crocodile, point 145b's
ground-nesting plover with its chicks and point 145c's lion cub joined
the roster beyond the original fauna and the grazer calves.)

## 13. Real geodata.

Verifiable: screenshots of the Nile delta,
a rift edge and a coastline show smooth, real courses and textured
ground instead of vertex colors; a pure-threshold biome edge (the
south desert) is sampled across latitudes and its longitude varies
rather than running straight (`scripts/verify/enrichments.mjs`); the
geodata preprocessing is reproducibly documented in the repository.

## 14. Lighting and post-processing pipeline.

Verifiable: screenshots of both
perspectives show the active effects; the application runs without
console errors on both the WebGPU and WebGL 2 paths; the remaining
simplification (true water refraction) is named as an open item (see
pt. 32; SSR was tried and removed).

## 15. Lively, densely built settlements.

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
angle bounded), and the backdrop relief shades SMOOTH per §2.5 — no
flat facets: the material stays non-flat-shaded and the heightfield
holds its raised sampling floors with the resolution-independent
inner-rim taper (`src/scenes/place/backdrop.test.ts`); the
application loads without console errors
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
geometry backdrop (`scripts/verify/polish.mjs`, screenshot 99). THREE
gates keep that band honest, and every one of them applies to EVERY
place kind: the band/no-band decision runs through one rule
(`panoramaBandShown`) keyed on a map TOTAL over `PlaceKind` — and
`PlaceKind` is derived from the `PLACE_KINDS` value list — so a fourth
kind cannot compile until it has been decided about, nor slip the kind
sweeps in the tests (point 335; the monument site of point 273 was the
late third kind that made the question worth pinning). Freshness: the
capture is a module
singleton that OUTLIVES its visit, so the store's `enteredFromTravel`
(true only for an enter out of the bird's-eye view; false on a
place→place enter, a ferry passage, a resumed snapshot and while
travelling) decides whether it may be shown at all, without which a
place captured earlier in the run wrongly re-showed its stale band
(pure-tested in `src/state/store.travel.test.ts`). Completeness in
TIME: the capture never fires before the terrain around the capture
point is COMMITTED to the scene (point 227) — the first travel frame
after leaving a settlement runs before the streamed chunk meshes
mount, and a capture that frame baked a TERRAINLESS band (only water
sheets, landmarks and markers) which a re-entry drew over the backdrop
as a hard grey horizon line with a thin blue-grey water band below it.
The gate covers the whole chunk RING around the capture point
(`PANORAMA_CHUNK_RADIUS`, one inside the travel scene's own streaming
radius so it stays satisfiable), not just the centre chunk.
Completeness in SPACE (point 335): the capture camera's far plane is
clipped to that ring's reach (`panoramaCaptureFar`). It used to look
900 world units out while terrain streams to ~144, and the sea plane,
river ribbons and lake sheets have no such bound — so everything past
the window baked in FLOATING with no ground behind it, and the place
scene drew a hard, flat grey/silver strip lying ABOVE the band's own
horizon with the backdrop's relief showing through the transparent gap
over and under it (the reported Giza picture; worst on an open desert
plateau, but present at Cairo too). Both gates and the kind rule are
pure-tested in
`src/scenes/travel/panoramaMath.test.ts` — including the monument
witness: Giza entered from travel with an uncommitted chunk shows NO
band. Live: the leave-capture's band is checked to bake the surrounding
terrain (bottom-quarter opacity), and at the Giza site the band is
asserted to hold no floating strip over a HOLE in its surroundings —
per pixel row, a column's opaque rows must form ONE run, which real
surroundings always do and the far-field artefact never did
(`scripts/verify/polish.mjs`, screenshots 141); the §4.4 port skyline landmarks
hold — Cape Town mounts the Table Mountain massif (`__placeSkyline`,
its flat wide profile pure-tested in `src/render/landmarks.test.ts`),
Cairo mounts the Giza pyramids as its western skyline (point 82) —
the field's Sphinx modelled as a recognizable couchant lion under the
nemes (proportions and part count pure-tested via `buildSphinx` in
`src/render/landmarks.test.ts`; travel-scale screenshot 103) — and
Timbuktu builds the Djinguereber mosque as a collidable dwelling
(`scripts/verify/polish.mjs`, screenshots 96/97/100); and the Giza
plateau is an ENTERABLE first-person monument site (§4.4, point 273):
its own map point south-west of Cairo, known from the start and reached
with the SPACE use key like a settlement (the enter candidate + the
Giza-vs-Cairo disc separation pure-tested in
`src/scenes/travel/settlementEntry.test.ts`), where the traveller walks
AROUND the three great pyramids and the sand-buried Sphinx as giant
COLLIDABLE monuments on a bare desert disc — the layout, the collidable
masses, a clear spawn standpoint, the Giza-vs-Meroë slope contrast and
the ~1890 casing cues (blunt Khufu, Khafre's pale cap, Menkaure's
granite skirt, the buried Sphinx) pure-tested in
`src/scenes/place/gizaSite.test.ts` — which also sweeps the sparse
Thomas-Cook-era ambient anchors (guides, cameleer, donkey-boy,
tourists) for a free standing spot they can also leave — and the live
enter-with-SPACE, the three pyramids + buried Sphinx rendering, the
collidable-and-no-trade/elder site and the warm desert-sand ground
gated in `scripts/verify/polish.mjs` (screenshot 139);
the same period casing cap and half-buried Sphinx carry into Cairo's
western skyline (point 82). The §19.10
campfire can CAST SHADOWS (point 289, level-driven per point 276 part B):
the fire light renders a cube shadow map (remounted on the variant, also
behind the global shadow switch), with an invisible player-body proxy so
the viewer occludes the firelight too. The graphics quality level drives
it — OFF on low, the 256² variant on medium (the default), the softer
512² variant on high — and a debug allow-flag still tunes it off within a
level. The measured cost was ~+1.5 ms headless (six extra cube-face
passes; map resolution nearly free); the medium default is priced on the
user's real hardware.
Verifiable: with the toggle ON the ground directly behind a fire-ring
stone reads measurably darker in pixels than its lit twin at the same
radius, and with it OFF that contrast stays flat
(`scripts/verify/polish.mjs`, screenshot 138, both backends); the
toggle default and write-through are pure-tested
(`src/state/ui.test.ts`, `src/ui/DebugMenu.test.tsx`).

## 16. Collision inside settlements.

Verifiable: an automated
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

## 17. Localization.

Verifiable: screenshots of the status bar, journal, a trade
dialog and the map in both languages; no hardcoded player-visible
strings outside the language files (spot check); the application runs
without console errors in both languages.

## 19. Journal voice markup and read-aloud.

Verifiable: spot check of both language files for
markers; journal screenshot free of visible tags; starting narration
produces audio without console errors; adding an entry switches its
read-aloud control into the speaking state without a click; the start
entry narrates on the first gesture; with the journal open at game
start, driving movement still advances the player position
(`scripts/verify/voice.mjs` — the voice and handwriting suites replay
the TTS assets from the git-ignored local `.cache/tts/` cache, so the
regression is CDN-independent); pressing SPACE at a hut door with the journal
forced open still enters the building (`scripts/verify/flow.mjs`); with
the journal open, the `.journal` panel's bottom edge sits above the
`.map-toggle` and `.journal-toggle` button tops and its right edge
keeps a gap to the screen edge (`scripts/verify/enrichments.mjs`).

## 20. Comfort and audio settings.

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

## 21. Water realism.

Verifiable: `scripts/verify/enrichments.mjs` asserts 5 cascades, at
least one spring and 8 lake surfaces, that no river has an interior
gap and no river surface is buried, that every lake surface clears its
interior bed, that the Nile is a single continuous strip, that a long
driven canoe passage down the Nile stays on water the whole way (the
point-136 playability claim), that a canoe-less swimmer floats
chest-deep ON the lake sheet — never on the carved bed below it
(point 152, checked mid-Lake-Edward via `__player`,
screenshot 125), and — pure — that the densified courses
hold the bounded turn angle with every control point anchored, that on
the real DEM every river plans as ONE strip with every land point
drawn, every sea-mouth ribbon bridges past its last land point into
the sea, and no water-typed terrain stands above the rendered row
anywhere across the band — with the pre-211b flat row reproduced at
Cairo as the notch's regression witness
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

## 22. Health and afflictions.

Verifiable:
`src/state/store.health.test.ts` asserts defaults, dehydration
onset/recovery, the canteen fill draining away from water, emptying
into thirst then health loss, and refilling at FRESH water only — the
salt sea neither refills it nor clears thirst (point 208 A4) —
regeneration, fever drain and medicine cure, the staged natural wound
healing (light heals fed, severe eases to light, starving blocks it)
and the death/successor flow; `src/ui/Hud.test.tsx` the sun-blindness
veil and its recovery and the remains/defeat overlay;
`scripts/verify/health.mjs` the vultures circling at poor condition;
`scripts/verify/enrichments.mjs` that a severe wound shows on the
bird's-eye figure (`__player.wounds`) and clears when healed
(screenshot 90).

## 23. Random events.

Verifiable:
`src/systems/events.test.ts` asserts the reduced rates, the
protection ordering (pure functions), deterministic outcome mapping
and the plains-predator danger order (cheetah < leopard < hyena <
lion) with the lion's wider fatal band; that a predator event fires
only where that species roams the region (point 208 A3 — no hyena
attack in a hyena-less region) and that the protection rules match the
text (point 208 A5 — a snakebite is not weapon-mitigated; the machete
always lowers the crocodile chance, even from the canoe);
`src/state/store.events.test.ts` the consequences of each trigger, a
fatal attack, autonomous firing while travelling, silence when
disabled, and the canoe-aware water warning firing — once — without
the advising text; `scripts/verify/events.mjs` that pinning a lion —
and a hyena — on the player in the scene triggers that predator's
attack; `scripts/verify/enrichments.mjs` asserts each first-time
danger warning fires exactly once and marks its flag.

## 24. Deadline and successor.

Verifiable: `src/state/store.expedition.test.ts`
asserts the staged warnings (exactly once each), the expiry defeat
without successor, and the death-to-successor flow including the day
penalty and takeover entry; `src/ui/Hud.test.tsx` the recalled-defeat
overlay without a successor button.
## 25. Trade economy.

Verifiable:
`src/state/store.economy.test.ts` (with the pure pricing/ferry/site
helpers in `src/systems/economy.test.ts`) asserts the capacity
refusal and auto-raise, the regional bid ordering and rejection, the
stable re-offer quote (identical price across re-offers, cleared on
leaving the port), the ferry to Zanzibar (fare, days, checkpoint),
the bounty crediting, that the known-from-start set is exactly the ten
ports plus the Giza monument site, that such a place is discovered from
the start and credits no bounty for itself while an ordinary village
still discovers and bounties, the graveyard's random ivory haul (range 1..9,
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
treasure's name (§10); `scripts/verify/enrichments.mjs` that all EIGHT cultural
landmarks of §4.4 mount on the travel map (`__culturalLandmarks` — Giza
among them, and it ADDITIONALLY stands as Cairo's first-person skyline
and as the walkable monument site, pt. 15) and all four natural sites
(`__naturalSites`) mount in the scene, render a non-black frame at
their coordinates and reveal their label on sighting (screenshots 91,
94, 95).

## 26. Standing with the natives.

Verifiable: `src/state/store.reputation.test.ts`
asserts a rifle in the pack does not block the elder talk or
audience, the hostility/expulsion and its wear-off, the friend pledge
(exactly once), the capped attack outcomes with rescue entries, the
near-death aid, the free village supplies, the rich
money/gifts/provisions haul, and the permanent robbery consequences
including the forfeited friendship, and the goal-orphan warning
predicate (point 208 A7 — `robWouldOrphanGoal` fires for a
coordinate-bearing region, North or East, whose hint is not yet
learned, and clears once it is); `src/ui/Dialogs.test.tsx` the
confirmation gate on the Rob button.

## 27. Camps (item caches).

Verifiable:
`src/state/store.camps.test.ts` asserts pitching and reopening,
storing/taking incl. the capacity refusal and the canoe put-away, the
loot-and-discover flow with its journal entry, the friend gate on
village caches, their persistence, and their destruction by the
robbery (the map X rides on the covered `freeCamps` state).

## 28. Full saving and loading.

Verifiable:
`src/state/store.saveload.test.ts` asserts one snapshot per port
visit, resuming an older visit restores that state, the successor
using the latest snapshot, and the legacy migration;
`src/ui/Hud.test.tsx` the table columns incl. the health state.
## 29. Animated handwriting.

Verifiable: `scripts/verify/handwriting.mjs` asserts
the growing reveal with the hand element, the wound classes on the
hand, the persistent blood traces, the click-to-finish, the clean
final text (no markup, full length), the silent do-not-disturb path,
and that an overflowing journal auto-scrolls down to the still-writing
entry.

## 30. Gamepad and position query.

Verifiable: `scripts/verify/gamepad.mjs` injects a
virtual gamepad and asserts that pre-engagement axis drift moves
nothing, stick travel movement, right-stick turning in the
first-person view, the A-button interaction (mapped to the SPACE use key)
and Y-button journal toggle, and the position-query toast in both languages.
The touch/tablet layer of `design.md` §17.5 (point 84) holds as a
third input source with zero change to desktop play: a virtual stick,
a right-half look/steer drag surface with two-finger pinch zoom, a
tappable interaction prompt (dispatching the key it names — one input
path), the deliberate-input guard that arms the layer only on the
first real touch, and the touch-tied mobile quality preset — FOUR
levers written by `activateTouch`: TRAA off, SSAO off, half-resolution
sun shadows and campfire shadows off, tied to the touch layer and
never to user-agent sniffing. They are internal store fields, no
longer per-setting debug-menu checkboxes (point 276): the graphics
section is the single detail-level dropdown, and the preset stays a
SUBSET of low. Verifiable: the stick/pinch/latch math is
pure-tested (`src/systems/touchInput.test.ts`); `src/ui/Hud.test.tsx`
that `touchActive: false` renders no `.touch-controls` while
`touchActive: true` mounts the stick and look surface and makes the
prompt a tappable button firing the SPACE use key; `src/state/ui.test.ts` that
`activateTouch` arms the layer with the preset and is idempotent (a
debug re-enable is not clobbered); `src/ui/DebugMenu.test.tsx` the
localized graphics detail-level dropdown writing `detailLevel` through to
the store (the per-setting graphics allow-flags the touch preset sets —
TRAA, SSAO, half sun shadows, campfire shadows — are internal store
fields, no longer surfaced as debug-menu checkboxes after the point-276
declutter);
`scripts/verify/touch.mjs` (a `hasTouch` context, real CDP touch
events) that no overlay shows before the first touch, the first touch
mounts it and applies the preset, the stick walks the character (and
releasing it settles), a right-half drag turns the first-person yaw,
tapping the prompt addresses the elder, and a two-finger pinch changes
the bird's-eye zoom — all without console errors.

## 31. Settlement orientation and panorama wildlife.

Verifiable: `scripts/verify/polish.mjs`
asserts no markers before and markers after the gift plus the toast,
their persistence across re-entry, and the panorama wildlife count via
the dev hook, with a screenshot of the highlighted village; plus that
every silhouette reads small (bounded subtended angle), is hazed (not
flat black), and — the point-181 gate, measured on the RENDERED scene
rather than against the anchor constant that made the old
`|y − visibleY|` check pass while the picture was wrong — that the first
surface behind every silhouette's feet is no further away than the feet
themselves (`__placeRayHit`, run without a capture at the Maasai village
and WITH one at the Nubian village and in Cairo under the Giza skyline,
screenshot 136), and that each silhouette's stride phase advances in step
with the ground it covers — the same phase-per-unit-walked for all of them,
which a clock-driven bob could not produce (point 255) — and that every
visible silhouette WALKS FORWARD (its displacement over an interval projects
positively onto its facing, never backward — point 286); the stride pose and
its distance coupling, the forward-only facing derived from the ring velocity
(with the reverted π-off formula pinned as a regression witness) and the
scale-normalised gait distance pure-tested in
`src/scenes/place/panoramaWildlife.test.ts`, the ground-line math in
`src/scenes/place/backdrop.test.ts` (the sight-line geometry, the drop as
the viewer nears, relief-following on a dune, and both old failure modes
swept round Cairo); and that in Cairo no
visible silhouette's azimuth lies inside the Giza skyline span
(`__placeSkylineExclusion`/`__placePanoramaWildlifeInfo`, point 102),
the azimuth-exclusion helper (span from placement, margin, inside/
outside with ±π wrap-around) pure-tested in the same file.

## 32. Render pipeline upgrades.

Verifiable:
`scripts/verify/settings.mjs` toggles TRAA at runtime, asserts a
non-black frame without console errors on the WebGL 2 path (with
screenshot 69), and gates the rebuild leak on the renderer's texture
count RETURNING to its starting value across repeated toggle cycles.
That count is measured at a SETTLED state (point 334): a rebuild frees
the old post chain at commit while the new one allocates its render
targets only on the next RENDERED frame, and a headless page nothing
forces to paint drops to zero rAF ticks for seconds — read in that
window the count sits in a DIP with the whole post chain missing (33
instead of 47 in the bird's-eye view), which the old one-sided
baseline-vs-end comparison reported as a "+14 leak" on WebGPU while
WebGL 2, whose lane never quite reaches a frameless window, stayed
green. The gate therefore forces a frame and polls until the reading
repeats, is two-sided (a FALLING count fails as an untrustworthy
measurement instead of passing silently), and keeps a live-texture
registry so a real leak names its survivors by kind/size/format rather
than reporting two bare numbers; the verdict and breakdown rules are
the pure module `scripts/verify/textureLeak.mjs`, pinned by
`scripts/verify/textureLeak.test.mjs` in the Vitest layer.
`src/ui/DebugMenu.test.tsx`
asserts that the graphics-level dropdown drives TRAA via the preset —
TRAA on in medium/high, off in low (the individual TRAA checkbox was
removed from the debug menu with the point-276 declutter; the
`traaEnabled` store field remains, set internally by the touch preset
and the F8 benchmark). The post pipeline (TRAA, SSAO, bloom) reads its
enable through the graphics-level effective selectors (`effectiveTraa`
etc., pt. 20 / point 276): the level drives the post chain — SSAO on only
at high, TRAA + bloom off only on low — combined with the internal flags
without ever clobbering them; `settings.mjs` gates the F9 cycle and the
effective flips.

