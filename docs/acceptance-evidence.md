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
move on open ocean (mid-Atlantic, every direction blocked) is refused
with the blocking notice, while a step into the boundary from a coastal
pocket slides along it instead of stopping dead
(`src/systems/movement.test.ts`, `src/state/store.travel.test.ts`); a move onto a
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
the traveller (`scripts/verify/enrichments.mjs`, judged against the DRAWN
body). That body is where the collider is: the herd render stamps every
animal with the instance matrix it writes, and the circle is derived from
that matrix alone — centre and radius identical to the drawn instance for
every species, scale and pose, following a mover frame by frame, and
absent for a body the pass did not draw
(`src/scenes/travel/animalBodies.test.ts`). Staged live with the largest
render offset — the drink walk, which draws the body ~7.8 units from the
animal's own spot — driving at the drawn body stops the traveller at
exactly body radius + player radius (1.200) while driving through the
behaviour spot beside it is free (0.02), and the collider query reports
one circle at the drawn body and none at that spot
(`scripts/verify/enrichments.mjs`, point 378; the same staging on the old
collider inverted both: 0.109 into the drawn body, blocked at 1.200 on the
empty ground beside it — the user's report in numbers). The swept obstacle
resolve is pure-tested incl. the no-tunnelling case and the
away/tangent moves from a resting contact staying free
(`src/systems/movement.test.ts`). A settlement's footprint collides the
same way (point 299): swept over the WHOLE place roster, a walk into any
place from any side is caught at the near edge with no tunnelling and
stays there frame after frame, while a step from inside the footprint
outward is never blocked — the one-way rule that keeps a debug jump, a
resumed snapshot or an older save from stranding the traveller inside a
wall; the collider stays inside the enter radius (so the "Space to enter"
prompt is armed where it stops him) and inside the river clearance every
place keeps (so a passing canoe is not deflected), and no two places'
enter radii overlap (`src/scenes/travel/settlementEntry.test.ts`). Live,
walking into a village stops the traveller at exactly the collision radius
(1.50 of the 2.5 enter radius, closest approach sampled per frame) with
the enter prompt still armed, and Space enters from there
(`scripts/verify/flow.mjs`). The Red Sea cut and world trim are
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

THE CHIEF'S MESSAGE ON THE DRUMS (§13.4, docs/communication-poc-spec.md,
point 486). Asked for at the audience — in his village alone, and only once a
culturally correct gift has earned his trust (the §12 condition every hint
stands under) — the chief has his drummer beat out GO_THERE · RIVER · FOLLOW ·
UPSTREAM · BIG_ROCK · THERE · DIG on two drums: the large low one for `ba`, the
small high one for `BA`, the hand falling and the head dipping on the drum that
sounds. The sequences are never re-authored: the message is a list of CONCEPT
ids whose atoms come from the lexicon and whose timing is the same phrase plan a
villager speaks with, so one constant pause separates the concepts and nothing
else encodes anything. When the last beat has fallen the concepts enter the
heard memory like any speech and the message stands on paper with the player's
own reading over each, every one clickable — and edited straight in the memory
the journal's observation section edits, so the two are one note. It reopens
from the journal for the rest of the run.
Verifiable: pure Vitest. `src/communication/drumMessage.test.ts` proves the
drummed sequence equals the spoken one concept for concept, the pause between
concepts constant (and following the calibratable pace/pause), and the strike
the drummer's hands show ordered and silent between beats;
`src/ui/DrumMessage.test.tsx` that a reading edited at the drums reads back in
the journal and the journal's reads back at the drums, that the display reopens
however often it is closed, that the drums teach nothing until their last beat,
and that no other people's chief sends the message;
`src/state/store.communication.test.ts` that the message is recorded once, keeps
the day and note of a concept already heard in the village, and travels with the
checkpoint.

THE ERRAND'S END (docs/communication-poc-spec.md, point 487). Understood, the
message sends the traveller out of the village: in the BIRD'S-EYE view, up the
Niger, to the erratic on its bank, where the shovel he already carries recovers
what lies buried at its foot. The dig check reads `communicationRockSite` — the
one function the renderer places the block from — so the spot the picture shows
and the spot that yields are the same value, and a dig anywhere else yields the
ordinary nothing. The find rides OUTSIDE the inventory capacity: it is a puzzle
token, not trade goods, so a full pack can never strand the errand. Carried back
into the chief's own village it is laid in his hands, and that hand-over is what
solves the puzzle — he answers with BIG_ROCK · DIG · HERE, three concepts the
village has already taught, recorded like any other speech of his people and
shown with the player's OWN notes over them. Nothing is translated for him,
here least of all.
Verifiable: pure Vitest. `src/world/communicationRock.test.ts` sweeps the seeds
for the dig reach covering the drawn block and nothing off it, and for one run's
boulder not answering for another's; `src/communication/chiefReply.test.ts` that
the acknowledgment introduces no concept the village does not teach and speaks
the lexicon's own atoms; `src/state/store.rockArtefact.test.ts` the dig branch,
the once-only ground, the full pack, the hand-over guards (wrong place, wrong
mode, nothing dug up, twice), the chronicle in both languages with its markup,
and the checkpoint round trip incl. a snapshot from before the boulder was dug.
In the browser, `scripts/verify/world.mjs` drives the whole loop against the
placement the SCENE drew (`window.__communicationRock`): a dig clear of the
erratic recovers nothing, a dig at it recovers the artefact and journals it, and
the hand-over in the village closes the loop — green on both backends.

## 8. Chronicle/journal.

Verifiable: `src/i18n/villages.test.ts` asserts one
distinct, markup-clean text per village in both languages, and
`src/state/store.travel.test.ts` that the entry carries its people.

Every walkable place is journaled on its first entry (point 394):
`src/i18n/arrival.test.ts` is the completeness gate — it walks every
entry in `PLACES` (ports, villages, the Giza monument site, and
whatever kind is added next), resolves the reference
`src/journal/arrival.ts` names for each situation the place can reach,
and fails when one has no text of its own in EITHER language, when two
places share a text, or when the markup does not strip to well-formed
prose; the same suite holds each modelled transition's return text
distinct per direction. `src/state/store.arrival.test.ts` proves the
rule in the store: the first entry is written exactly once per place
(port vignette, monument entry, village vignette), a re-entry writes a
return entry only when the situation moved and stays silent otherwise
(a later port entry reporting only its checkpoint), the entries are
stored as language-neutral key+params that render in both languages,
and the arrival state survives the checkpoint — including a legacy
snapshot, whose villages keep their entry while the known-from-start
ports re-earn theirs. The situations themselves are pure and pinned in
`src/systems/placeSituation.ts` with `src/systems/rinderpest.test.ts`
(the village plague phase; the Nile flood at Giza and Berbera's fair
season are exercised through the two suites above).

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

Hold-Ctrl naming (§17.8, point 342). Verifiable, pure: the qualifies
predicate sweeps the FULL rosters — every fauna species in
(`src/scenes/travel/animalBodies.ts`), every flora/dressing species out
(`src/scenes/travel/floraSpecies.ts`), every map point out, a concealed
crocodile out while hidden and in once it lunges; the text composition
sweeps every (kind x age x state) in both languages and pins "Adult
giraffe" / "Dead giraffe calf" / "Erwachsene Giraffe" / "Totes
Giraffen-Jungtier" plus the feminine/neuter/masculine trio that proves
the gender is applied; the nearest-N cap keeps the nearest and drops the
farthest (`src/systems/actorLabels.test.ts`). The subjects and the
frustum: registered sources and marked scene objects report only what is
drawn (`src/scenes/actorLabelSource.test.ts`), and the shared projection
rejects a point behind the camera as well as one outside the frame
(`src/scenes/travel/frameVisibility.test.ts`). Component: the layer
mounts on Ctrl down, is gone on keyup, is cleared by a blur or a hidden
tab with no keyup at all, re-syncs from the next input event, speaks the
selected language and honours `balance.labelOverlay.maxLabels`
(`src/scenes/ActorLabels.test.tsx`). Live, both backends: holding Ctrl
labels the animals in view with every label on an ON-SCREEN subject
(projected through the live camera) and no plant named, and the release
clears every one — `scripts/verify/enrichments.mjs`
(`147-ctrl-actor-labels.png`) for the bird's-eye view and
`scripts/verify/polish.mjs` (`148-ctrl-actor-labels-village.png`) for
the settlement.

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
  (carcass, head animation, the blood soaked into the ground, leave
  phase) and provoke a trampling via an injected elephant. The stain is
  a property OF the ground on its own ragged outline (§19.5, points
  267/323): `scripts/verify/enrichments.mjs` shoots the same relief with
  and without it at a reachable zoom and measures the soaked pool
  CONTIGUOUS across every row and column — no see-through hole — with
  screenshot 137 as the crop a human judges the shape by;
  `src/render/groundStains.test.ts` pins the outline itself (its radius
  swings with the bearing by a bounded but clearly non-zero amount, no
  two seeds draw the same contour, none is circular, the swing is
  hard-capped whatever the debug menu sets, and the falloff still
  decreases outward along every bearing, so a ragged rim can never open
  a hole inside the pool).
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
- Intraspecies combat (§19.17, point 264): the researched per-species
  table, the disposition roll, the opponent pick, the converge-vs-hunt
  decision, the catch/drive-off/deadline resolution and the size-weighted
  lethal-vs-ritual outcome are all pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts` (a fighting species fights,
  a Tier C bird never does, a ritual species can never leave a carcass —
  not even when the outcome is forced — and every bout resolves on its
  clock); the live drive is gated by the `intraspecies-fight` section of
  `scripts/verify/enrichments.mjs`, which stages a zebra pair, watches it
  converge and clash, and asserts BOTH endings: exactly one death whose
  body is an ORDINARY carcass the ground scavenger works (`lionFed`
  false), and the ritual clash that releases both alive on cooldown —
  neither ending leaving a body on water (point 312). The debug
  dropdown's own entry is checked in the same section (point 258).
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
  finding no adopter). A SEPARATED juvenile's bond resolves the same
  way (§19.8, point 341): the streaming cull and the carcass removal
  sever the parent↔child link on both sides, so no survivor holds a
  removed animal and no calf walks to a phantom parent, and a young
  out of reach of a living parent past the calibratable
  `balance.family.reunionSeconds` has its bond released to this same
  adoption — `severFamilyLinks`/`tickFamilySeparation` pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts` (both link directions,
  the exact window boundary, the clock reset inside the follow radius,
  the freeze inside a running ending, the resolved calf's adoption and
  its parentless ending where no adult is eligible) and staged live in
  `scripts/verify/enrichments.mjs`. An ORPHAN MOURNS before it plays
  again (§19.8, point 369): only a parent that DIED opens the
  calibratable `balance.family.mourningSeconds` window — a bond that
  merely resolved is not grieved — and for its length the juvenile
  keeps to the spot its parent fell and does not gambol, while the
  adoption changes WHO it follows and not its demeanour and every
  danger response overrides the watch;
  `orphanMourns`/`tickMourning`/`calfMayPlay`/`juvenileAnchor`
  pure-tested in `src/scenes/travel/wildlifeBehavior.test.ts` (the
  death-only trigger against the separated and streamed-out endings,
  the play gate shut for the whole window and open after it, the
  adoption running its own clock, a second bereavement, the flight
  still resolving while mourning, and the always-resolving window) and
  staged live in `scripts/verify/enrichments.mjs` (the subdued calf
  beside the body over a whole play cycle, the release back into play,
  and a predator staged mid-window still making it run). Calf predation
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
  (both live in `scripts/verify/enrichments.mjs`). The drama reads its
  own UNSLACKED current (`dramaCurrent`): the point-316 sea-mouth slack
  is the TRAVELLER's rule (§21) and had tamed the swollen current under
  every calf the rains drifted into a river's last reach, which the
  staged lower-Nile drift replays at rule level against the real river
  in `src/scenes/travel/wildlifeBehavior.test.ts` — both season endings,
  with the slack pinned as the traveller's alone. Elephant
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
  lives in `docs/design-reference.md` §19.15. The
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
  WHAT "HIDDEN" AND "STRIKING" MEAN AS A MEASUREMENT (point 382): both
  are read through `scripts/verify/animalShare.mjs` — the share of a
  rect whose colour sits further from that frame's OWN water colour
  than a fixed multiple of the water's OWN spread — so the verdict
  survives any change of brightness, exposure, backend or zoom. Measured
  over twelve repeats of the staging on a quiet machine (eight on
  WebGL 2, four on WebGPU, agreeing to within the run-to-run noise) plus
  three full suite runs: striking body 0.303-0.316 against its 0.10 bar,
  hidden body 0-0.00046 against 0.02, eye knobs 0.108-0.119 against
  0.02, the water floor 0-0.00257. The old absolute delta over the same
  fifteen frames read 37.5-45.7 against its bar of 45 and landed on the
  passing side exactly once — the same undisputed picture, the verdict
  decided by which side of a hand-set number an average fell on.
  The criterion is fed the HIDDEN frame as
  well and asserted to say no, so the teeth are proven per run and not
  merely claimed; the rule is pure-tested in `animalShare.test.mjs`. It
  replaced an absolute channel delta against a hand-set 45 that read
  44.2 and 44.6 in one evening on a picture nobody disputed.
  THE KILL GOES INTO THE WATER (point 383, user-reported from the
  deployed build): the seizure hands over to a DRAG leg — the
  crocodile hauls its catch back to the water it lunged from
  (`balance.crocodile.dragSpeed`/`dragSeconds`, debug-editable), and
  the feeding grip begins only once its body centre AND the jaws lie
  on water. The pair's placement is the crocodile's from the seizure
  until the carcass is gone, so the body dissolves in the river beside
  it and never on the bank, and a keeper's vigil stands at the
  waterline its calf was seized from. Pure-tested in
  `src/scenes/travel/wildlifeBehavior.test.ts` (`crocodileHaulStep` /
  `crocodileFeedPairValid`): a sweep of bank strikes over a plain bank
  and the widened river band ends with both bodies on water within one
  body length, the PRE-FIX placement is asserted to FAIL that rule,
  the haul always terminates (I4) and resumes when a debug-edited
  river width moves the water out from under a feeding pair. The rule
  is armed in-game as the `croc-feeds-in-water` assert, so any suite
  catches a regression. Live in `scripts/verify/enrichments.mjs`: a
  staged feed whose terrain is read back under BOTH bodies through
  struggle, kill and sink, with screenshot 383.
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

**Shader programs off the startup critical path (point 337).** three.js links a
render pipeline synchronously the first frame each material combination is
drawn, so the scene's ~62 startup pipelines froze the picture — on WebGL 2 a
blocked main thread for 21 s inside two animation frames, on WebGPU a perfectly
free thread (worst stall 1.0 s) with nothing PAINTED for 12.4 s. Both backends
already carry the asynchronous half (`KHR_parallel_shader_compile` /
`createRenderPipelineAsync`) and `Renderer._renderObjectDirect` already SKIPS an
object whose pipeline is not ready; three.js only ever reaches that half from
`compileAsync()`, which the render loop never calls. Handing the render path the
promise array switches it over (`src/render/asyncPipelines.ts`). On WebGL 2 that
alone only moves the cost — ANGLE defers the real compile to a program's first
USE — so the linked programs' completions are additionally released one per
animation frame, which is what keeps the frames painting (worst unpainted gap
8.5 s → 1.8 s; two per frame measured worse). Neither remaining standstill is a
shader compile any more.

Measured before/after, both backends, re-run 27.07.2026 on a quiet machine
(3 % CPU, no parallel agents) against the dev server, "before" being the same
build with the fix switched off through `__asyncPipelinesOff`:

| Backend | before | after | budget |
|---|---|---|---|
| WebGL 2 | 17 532 ms | 2 682 ms (1 064 ms on a second run) | 4 000 ms |
| WebGPU | 6 747 ms | 1 354 ms | 4 000 ms |

The attribution split is what makes the WebGPU row worth reading: at 6 747 ms
its blocked thread was 542 ms and its longest animation frame 654 ms — the
picture was unpainted for the whole 6.7 s while the thread stayed free. That is
the shape a liveness-only metric excuses and this gate does not. 61–64 pipelines
went async per run, 0 dropped, and the screenshot shows the settled scene
complete (buildings, flora, shadows, HUD, journal) — no object is missing, so
nothing regressed at first frame.

Verifiable: `scripts/verify/startup.mjs` runs a tick train and a painted-frame
train from document start, attributes the stalls with the point-304 module
(`scripts/verify/liveness.mjs`) and gates their MAXIMUM against the balance value
`balance.startup.pictureFreezeBudgetMs` (debug-editable, `design.md` §21.2) —
reporting the attribution split rather than subtracting it, because the
frame-covered part is exactly how a busy renderer would hide this stall;
`STARTUP_STALL_SELFTEST=1` restores the blocking path via the dev hook
`__asyncPipelinesOff` and proves the gate still bites — it went red on both
backends at the "before" figures above, while the attributed block stayed at
0.3–0.5 s, which is exactly the number that must NOT be the one gated.
Screenshot `verification/142-startup-picture-live.png`.
The wiring — which calls are diverted, that three.js's own `compileAsync` is left
alone, the one-per-frame release, its bookkeeping and the drop of a completion
whose pipeline was released meanwhile — is pure-tested in
`src/render/asyncPipelines.test.ts`, the budget field's write-through in
`src/ui/DebugMenu.test.tsx`.

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
view shows the captured, direction-true surroundings: each sector is
shot square and copied to its own band column (`sectorRect`), the
buffer therefore holds every direction where its own camera looked
(`directionToU`/SECTOR_COMPASS, pure-tested in
`src/scenes/travel/panoramaMath.test.ts`), the horizon cylinder
samples that column unmirrored, and a magenta probe injected due west
of the capture point proves the rendered horizon compass-true
seed-independently — the measurement that also settled the mirror
which had been calibrated against a band drawn but wrongly cut, every
sector covering the full width (point 545, WebGL 2: the
pillar lands at u 0.875, dead centre of the west-looking slice); a
direct place-to-place enter falls back to the
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
its own map point west of Cairo across the Nile, known from the start and
reached with the SPACE use key like a settlement (the enter candidate + the
Giza-vs-Cairo disc separation pure-tested in
`src/scenes/travel/settlementEntry.test.ts`); the plateau is ONE site with
ONE position — map point and §4.4 cultural landmark both derive from
`src/world/data/gizaPlateau.ts`, which is why the bird's-eye view no longer
labels Giza twice — and ONE label, the map point's, suppressed on the
landmark by shared IDENTITY rather than by proximity
(`landmarkLabelHiddenByMapPoint`, the equal coordinate and the
never-otherwise sweep pure-tested in `src/world/world.test.ts`); BOTH halves
are known from the start (§17.2, point 338), so a fresh game has Giza in
`landmarksSeen`, it earns neither a discovery bounty nor a first-sighting
entry while an ordinary landmark still earns both, and a legacy save
migrates to include it (`src/state/store.economy.test.ts`,
`src/state/store.saveload.test.ts`); where the traveller walks
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
western skyline (point 82).
The walkable ground of an OPEN-PLAIN place reaches to where the picture
stops offering ground (point 390): at Giza the desert runs unbroken to the
horizon, so a 60 m disc ended the world ~18 m past the outermost mass, in
flat empty sand. MEASURED against the drawn surroundings — 720 azimuths at
eye height on the real geodata — the backdrop ground stays open land out to
its own outer edge (340) over the western and southern half, breaks at 191
on the median azimuth, and has exactly ONE seed-independent near break: the
Nile's water band at 76, in the eastern arc. The backdrop's relief is no
target, being a compressed miniature anchored to the disc edge, so it begins
immediately past the plate at ANY radius. The binding limit is therefore the
§2.5 panorama band: the disc takes the LARGEST radius that still leaves the
outermost drifting silhouette in front of it (`openPlainWalkRadius` in
`src/scenes/place/backdrop.ts`, derived from `PANORAMA_RADIUS` — 98 m, with
~56 m of open desert past the monuments), the arrival distance keeps its own
value (`spawnZ`) so the approach view of the pyramid row does not widen with
the disc, and the ground disc's segment count follows its edge so the chord
never grows into the straight ground line of point 381. The site carries no
flora, no lanes and nine fixed ambient anchors, and its tuft scatter is
count-fixed, so nothing on the disc scales with the radius.
Verifiable: the sweep, the derivation, its maximality, the preserved
arrival distance and the desert left past the monuments are pure-tested in
`src/scenes/place/gizaSite.test.ts`; the point-381 seam rules are swept at
the new disc radius and the chord bound pinned in
`src/scenes/place/backdrop.test.ts`; and the picture — from beside the
monument row looking outward and from the walkable edge, ground running to
where the backdrop takes over — is gated in `scripts/verify/polish.mjs`
(screenshots 390-giza-sand-open / 390-giza-sand-edge, both backends). The
outward standpoint is deliberately NOT the geometric centre: Khafre stands
on (0, 0), so a camera there is inside the pyramid.
The §19.10
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

The inhabitants have ARMS, and gesture with them (point 479). The figure
carries two shoulder-pivoted arms with hands in the existing primitive style,
and the children — the figures that RUN — carry legs whose swing rides the
DISTANCE they cover at their own short-legged cadence, the same
distance-driven gait the fauna and the §2.5 silhouettes walk on. Four gestures
read at conversational distance: BECKON (the arm scoops toward the speaker),
POINT (one held aim at a visible spot or person), REFUSE (both arms out, the
trunk shaking) and INDICATE A DIRECTION (the arm sweeps out onto a bearing and
holds). None of them explains itself — there is no label and no caption; the
gesture is the body half of a situation whose other half is what happens next.
The driving layer owns ONE `GestureState` per figure and the figure advances
it, so two gestures can never run on one body, and the same ref is what the
speaking layer takes over when it arrives. The added geometry carries its
per-level entry (`figureLimbSegments`, 5 / 8 / 12).
Verifiable: the state machine is pure-tested — every kind's duration bounded,
one kind per figure at every instant, the pose beginning and ending exactly at
rest with no frame-to-frame jump, each kind visibly away from rest and
distinguishable from the other three, and the arm maths cross-checked against a
real `THREE.Object3D` with `YXZ` Euler order so the module and the renderer
cannot drift (`src/render/gesture.test.ts`); the limb proportions and the
scene's use of the shared constants and the quality lever in
`src/render/figures.test.ts`; and the rendered poses are photographed at
conversational distance on a ray-probed clear standpoint, with the live gesture
sampled across frames — every gesture ends by itself, none overruns its own
duration, the conversing pair takes turns and a figure between gestures stands
exactly at rest (`scripts/verify/polish.mjs`, screenshots
479-gesture-beckon / -point / -refuse / -indicate).

THE SETTLEMENT EDGE ON THE GROUND (§2.6, points 352/488): where the inhabited
ground ends, the swept, trodden earth gives way to open land across a soft band —
three terms of the ground material that is already drawn (a multiplicative
darkening of the compacted inside, its blotchy patch mottling faded out, its
micro-relief worn flatter), never a ring or a glow, and NO quality key, because a
term in a shaded material has no cost to switch off.
Verifiable: the band holds no radius of its own — `src/scenes/place/boundary.ts`
is the one boundary, the leave check asks it, and its per-angle sampling fills the
band's lookup, so a boundary that stops being a circle needs no second edit. The
pure tests BISECT the leave check and compare it with the radius the band draws
at, for every place in the roster at 32 bearings, follow a moved boundary,
reproduce a deliberately non-circular one, cover `PLACE_KINDS` totality, cap the
wander below both the honesty limit and the band's own half-width (so the true
line always lies inside the visible give-way), and prove the tone step is a RATIO
that survives both ends of the year against the real season curve
(`src/render/edgeBand.test.ts`); a source-level test refuses a second hand-rolled
distance-against-radius test in the scene (`src/scenes/place/boundary.test.ts`).
Live, the picture is measured by ATTRIBUTION rather than correlation — the
settlement's grass scatter also stops at the edge, so each of three ground crops
(5 m inside, at the boundary, 4 m outside, each placed by projecting the ground
point through the live place camera) is photographed with the edge drawn and again
with its calibratable strength at 0, and the RATIO of the two must fall inside,
half-fall at the boundary and be 1 outside — in a village, a port and at the
monument site, each in a dry and a wet month; walking straight out is then stepped
in the real walk loop and the place is left within 1.5 m of the drawn line
(`scripts/verify/polish.mjs`, screenshots 488-village-edge-band /
488-port-edge-band / 488-monument-edge-band).

THE CHILDREN PLAY A GAME OF TAG (§19.10, points 480/351). One of them is IT and
chases the others; whoever is caught becomes the new IT, and any number plays.
It is a CHASE, not a route — nothing here holds a ring, an orbit or a tour of
waypoints, because a path is periodic and the eye reads it within two passes.
STAMINA is what makes it legible: every child carries a sprint reserve, and the
pace it can hold is a continuous, monotone function of what is left in it — full
sprint while fresh, the shared floor only at empty — so a catch happens for a
reason the viewer can SEE rather than being cut short from outside. The CURVE
(what a child CAN do) and the two hysteresis thresholds (what it CHOOSES — press
on, or break off and recover) are kept apart, and the sprint is spent
deliberately: a runner presses only inside the pressure distance, a chaser only
while it is actually closing. The sprint reads THREE ways at once — the leg
cadence point 479 gave the children, the speed, and a forward lean eased in
proportion to the pace — so the reading survives at any distance the cadence no
longer resolves at. The steering is the wildlife's `deflectedStep`, not the
walker slide, so a chase continues past a hut corner instead of stopping against
it; the settlement reaches the chase as ONE predicate (colliders, the fire ring
and the walkable rim together). The pursue-and-evade half is a reusable helper
(`src/systems/pursuit.ts`), the round the module beside the scene
(`src/scenes/place/tagGame.ts`). All 24 values are calibratable
(`balance.villageLife.tag`) and debug-editable in both languages.
Verifiable: the pure layer pins the whole behaviour in 103 cases
(`src/systems/pursuit.test.ts`, `src/scenes/place/tagGame.test.ts`) — the curve
monotone, continuous and bounded in slope; a fresh runner strictly faster than a
fresh chaser and a spent one strictly slower; the reserve never outside its
bounds and never draining below the trot; the exhausted-forever regression
witness (a chase driven into the ground still recovers); both thresholds
boundary-tested; the immunity window boundary-exact against an instant re-tag,
pair-scoped, and cleared by a chained tag; one catch per step; the group
shrinking to two and to ONE, where a lone child idles rather than chasing
itself; a cornered runner caught rather than pinned; the traveller not a wall;
the walked distance the legs ride excluding a teleport nudge; and the armed
`devAssert` channel (point 207(i)) silent over a long healthy game while firing
on each of its five broken states. Live, the game is sampled over 90 seconds of
the game's OWN clock — never a frame count, which buys different amounts of game
per machine — and must show the chaser's identity changing, the gap to the quarry
rising and falling repeatedly, at least one child slowing to recover, headings
covering a wide spread rather than circling one centre, no child pinned, still
or outside the rim, and no tag assert fired; the frame is then taken from a
swept standpoint whose picture is MEASURED before the shutter opens
(`scripts/verify/tagFrameReading.mjs`, pinned by `tagFrameReading.test.mjs`):
each of the two children is projected feet-to-crown through the live camera and
must read at least 67 px tall — the height at which its 24 % head spans a
readable 16 px — must sit whole inside the inner 0.7 of the frame, and must be
ray-probed CLEAR at five heights up its own axis, with at least two samples
confirming the figure is drawn there; and at least two of the settlement's own
buildings must stand behind them (point 524 — a single chest-height ray had
passed a standpoint behind the boulder line where the rocks hid both children to
the shoulders, and the standpoint sweep now also tries 4.5 m, on the village side
of such an occluder; the standpoints fan out from the bearing that
looks INTO the village, and the shutter's subject is the child who is IT, never
the empty midpoint between the two), while the play ground itself is derived
against the built fabric (`src/scenes/place/lifeSpots.test.ts` pins that for
every shipped village) (`scripts/verify/polish.mjs`, screenshot
480-village-tag).

AT THAT GAME THE CHILDREN TEACH THE SIX GENERAL CONCEPTS (§13.4,
docs/communication-poc-spec.md, point 481). Twelve situations, two per concept:
one atomic utterance, the gesture the speaker makes while it says it, and the
ACTION that visibly follows — a child calls the others in (COME), sends one to a
named spot (GO_THERE), asks another along as it runs (FOLLOW), names where it
stands (HERE), points something out beyond the ground (THERE) and refuses (NO).
Nothing is ever translated: the meaning lives in what happens next. The two
look-alikes are staged apart, because otherwise they teach nothing — COME is
spoken by a child STANDING STILL against FOLLOW's caller running away, and THERE
by a child after whom NOBODY moves against GO_THERE, which always ends in the
addressee walking to the spot. The scheduler is a fair queue (the least-staged
castable situation goes next), so nothing starves inside a visit; a refusal is
offered out of turn as the answer to the call just spoken, and the freshly-tagged
child's HERE as a moment whose state is gone within seconds. The group plays on
its own ground — the largest disc on the bearing furthest from every fixed adult
vignette whose whole area still clears them by the §13.4 hearing radius — so
among the children the player hears the children and among the adults the adults.
The chase carries out what was said: the situation decides a runner's direction,
the chase keeps the collisions, the stamina and the floor pace, and between
rounds that claim is what moves anyone at all. Rate, action life, errand pace and
refusal chance are calibratable (`balance.villageLife.childSpeech`) and
debug-editable in both languages, as is the play radius.
Verifiable: pure Vitest on the catalogue and the scheduler
(`src/scenes/place/childSituations.test.ts`) — one atom per situation and it is
the concept's own; a gesture and a following action on every one; every concept
in more than one situation, and heard in at least two DIFFERENT ones over a
driven visit; every situation staged within a visit; both staged contrasts; the
refusals only ever as answers, cancelling what the child was told; the errands
really carried out and every one of them expiring. The separation rule is pinned
in `src/scenes/place/lifeSpots.test.ts` (every adult station outside the hearing
radius of the whole play ground, swept over the fire's position, shrinking rather
than giving up), and the chase's side of it in
`src/scenes/place/tagGame.test.ts` (a claim steers a runner and never the chaser,
the floor pace holds under any claim, the break moves only who was told to, and
the group stays inside an off-centre ground while the game still resolves).

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

The swept move and the fence panels (point 413) are pinned in the fast layer.
`src/scenes/place/collision.test.ts` holds the segment collider (the whole run
between two posts blocks; the push-out follows the WALL normal rather than a
post radius, which is where the reported "abrupt turn" came from) and the swept
`resolveMove` (a step across a panel stops at the near edge — the un-swept call,
kept for spawns and teleports, lands on the far side; ten collider widths still
stop at the near edge; sliding survives; an overlapping mover is still pushed
out; a gate stays passable; an over-long move is truncated, never tunnelled).
`src/scenes/place/layout.test.ts` sweeps every place and seed: neighbouring
panel colliders leave no opening as wide as an inhabitant, every gate stays
walkable, and every animal grazing anchor is spawn-free in every village.
`src/scenes/place/animalSpots.test.ts` pins the anchor validation, the herd's
mutual separation (two animals released onto one spot end apart) and the
reported case itself — an animal driven at a real village fence for 60 frames
never ends up on the far side; the pre-fix code ends 1.5 m inside in hausa-,
maasai- and tuareg-village, which is what makes that test a witness rather than
a restatement. Live: the goats in `scripts/verify/polish.mjs`.

The clearance holds UPWARD too (point 349): the rule kept the camera out of a
building's side, but a roof overhangs ground the player may stand on, and a
rondavel's thatch cone hangs its flat underside at ~1.3 m — under the 1.5 m eye,
so the near plane cut into it. `src/scenes/place/roofClearance.ts` carries the
roof geometry the renderer draws with (PlaceScene builds hut, shed and
cook-shelter meshes from those same constants) and derives each building's
stand-off from it. `src/scenes/place/roofClearance.test.ts` sweeps every place,
every building type and three seeds: no spot the player can stand on has less
than eye height + near-plane reach + margin overhead — and the witness replays
the same sweep against the pre-349 wall-only colliders, which finds the low
eaves again (48 973 sample points, worst 1.27 m), plus a deliberately lowered
rim on a roof that clears today. Live in `scripts/verify/polish.mjs`: the player
walks into the eaves of a hut in zulu-village and of a Cairo trade house under
the game's own resolver, and the rendered scene is asked what hangs over the eye
(`349-eaves-village`, `349-eaves-port`); the cook-shelter over the village fire
proves the eaves were not simply fenced off — it is still standable and still a
solid surface from below — and every thatch roof mesh draws both faces, so an
open dome hemisphere is no longer a back face one can see through.

AND NO WEDGE IS FATAL (work-order 604). The control stands in `design.md` §17.5, paid
for at the ceiling by tightening three passages that stated the same rule twice. The collision rules keep him out of the
walls; the escape keeps him out of the gaps BETWEEN them, because the game saves
only on entering a port (design.md §18) and a traveller stuck in a village would
lose everything since the last harbour. The reported case (F6 report
`local/bugreports/HaengeFest.zip`, seed 1941555626, bambara-village) was
reproduced from the layout itself: the woven palisades of two neighbouring
Bambara compounds INTERSECTED, their panel colliders overlapping by 0.42 m
around (-12.7, 4.7) — two shallow arcs crossing leave a sliver with no free
ground at all, and the picture in the report is that sliver's tip. The layout
now keeps every compound ring a walkable corridor from its neighbours
(`src/scenes/place/layout.ts`), and `src/scenes/place/layout.test.ts` sweeps
every village and many seeds for a crossing pair — the same sweep finds the
reported one in the pre-fix code.

The escape itself is `src/systems/unstuck.ts`, pure and pinned by
`src/systems/unstuck.test.ts`: the stall detector fires on a held movement key
that gets nowhere, never on a man standing still and never on one creeping
forward, and clears the moment he moves; the outward search returns a spot no
collider contains, prefers the nearest, refuses a spot behind a wall and falls
back to the place's entry point when the radius holds nothing. Its four values
live in `balance.unstuck` with a debug row each (`src/ui/DebugMenu.test.tsx`).
Live in `scripts/verify/collision.mjs`: the traveller is set down in the
narrowest sliver a real village layout has, is proved unable to walk out of it,
presses U and both stands free and walks away — with the frame of the freed
position (`604-unstuck-freed`).

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
  moves the logical position (interaction/door/leave-radius). The
  VERTICAL look (point 392, `design.md` §17.5) is driven live in the
  same suite: real mousemove events carrying movementY through the
  production pointer-lock handler show the inverted default (mouse
  forward looks down), the gain against `balance.mouseSensitivity`,
  both clamp ends holding under a hostile repeat, the yaw untouched,
  the pitch arriving as the camera's YXZ X rotation with the 1.5 m
  eye height unchanged, and the inversion switched off through the
  store field the debug checkbox writes. Frames 143 (a roof line
  overhead), 144 (the ground at the traveller's feet) and 145 (the
  ground past the walkable disc edge, seen over it) each declare the
  world point they must show. The pure rules — accumulation, the
  clamp under any input sequence, the structural cap short of
  vertical, the gamepad axis reaching the same state, and the fixed
  order the bob (a position offset) composes with the pitch (a
  rotation) — are in `src/systems/lookPitch.test.ts`, the balance
  default in `src/config/balance.test.ts`, the store default and its
  toggle in `src/state/ui.test.ts`, the localized debug-menu clamp
  field and the checked-by-default "Invert mouse look" box in both
  languages in `src/ui/DebugMenu.test.tsx`, and the horizon seen over
  the whole pitch range — ground under every downward ray, band and
  then sky above — in `src/scenes/place/backdrop.test.ts`.
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
- The keyboard capture of work-order 601 (`design.md` §17.8): the
  chord set and the lock's state machine are pure-tested in
  `src/systems/keyboardGuard.test.ts` — a modifier chord on a key the
  game binds UNDER a modifier is prevented (Ctrl+W, +S, +P, +D, +A, +T,
  Alt+Arrow) and an unbound one (Ctrl+R, +I, F5) is not, nor the
  plain-bound calendar row, whose chords stay the browser's tab jumps
  and keyboard zoom (Ctrl+1–9, Ctrl +/−/0) while the LOCK still takes
  those keys; none of it inside a form control; the
  lock is requested once, only with fullscreen AND the pointer, with
  every bound code except Escape, released with either condition, and
  a missing or refusing API is never an error. The global keydown
  listener really applying the rule is asserted in
  `src/systems/input.test.ts` (Ctrl+W prevented AND still walking
  forward), and the WIRING in the shipped bundle — the document
  listeners and the request at the real transition — in the
  `keyboard-lock` section of `scripts/verify/settings.mjs`. The
  reserved chords themselves cannot be asserted from a test; the
  request is what is proved. Where the lock cannot reach — a windowed
  browser, or one without the API — the HOLD KEY is the player's:
  `src/state/ui.test.ts` pins the Ctrl default and the offered set,
  `src/ui/ctrlHold.test.ts` that the layer follows the rebound key,
  ignores the old one and clears a standing label when the key changes
  under it, and `src/ui/DebugMenu.test.tsx` the picker itself in both
  languages (shipped on Ctrl, writing through to the store).
- `scripts/verify/collision.mjs`: corner clearance at box buildings
  and an inhabitant re-entering its dwelling (pt. 16).
- `scripts/verify/voice.mjs`: the automatic narration of a new entry
  (pt. 19).
- The menu's STRUCTURE (`design.md` §21, point 393) is proved in
  `src/ui/DebugMenu.test.tsx`: a COMPLETENESS pin names all 163
  controls and the group each belongs to and compares that against the
  rendered menu in BOTH directions and in both languages — a dropped
  control fails, and so does one added without being named — plus every
  row carrying a real input/select/button, the eleven groups rendered
  in the order `src/ui/debugMenuGroups.ts` fixes, all collapsed at
  first, one opening on its header click and staying open across a
  close/reopen of the menu, and the filter narrowing across groups,
  restoring the full set and the remembered collapse when cleared,
  saying so when nothing matches, and matching the German labels once
  German is active. `matchesDebugFilter` is pure-tested beside them.
- Every LEVEL is where a player looks for it, and the village speech is
  audible at the default mix (point 605). `src/ui/DebugMenu.test.tsx`
  pins the rule rather than the one control: every debug field whose id
  ends in `Volume` sits in the graphics-and-sound group and nowhere
  else (asserted over the completeness table AND on the rendered menu),
  and the speech row's label reads as a volume in the wording family of
  its neighbours in both languages while still naming the village
  speech. The DEFAULT (`balance.communication.speechVolume` 1.5, pinned
  in `src/config/balance.test.ts`) is calibrated on the audio graph:
  `src/systems/ambience.test.ts` measures, off the live nodes at the
  default balance, a syllable spoken beside the player against a
  village drum beat — 2.04× at the master's input — and that the
  loudest realistic moment (two close speakers, the drum bed, a
  footstep) reaches 0.62 of full scale, so nothing clips. The one
  factor the node graph does not carry, a syllable's ~2× synthesis
  gain, is measured on the rendered chain in
  `src/systems/ambience.speech.test.ts`.

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
(screenshots 119/120). The sea mouths hold no trap (point 316): EVERY
river that empties into the sea is swept cell by cell — from every
swimmable cell an exit path must exist on which the current never eats
more than half the swim speed — with the pre-316 funnel restored as the
sweep's own regression witness (it reproduces the reported Nile pocket),
the mouth-vs-confluence split and the slack ramp pure-tested in
`src/world/riverMouths.test.ts` and the sweep rule itself on hand-drawn
water fields in `src/systems/swimEscape.test.ts`; drift and swim speed
come from one shared formula (`src/systems/current.ts`), so the sweep
measures the world the player swims in. A swimmer set into the Nile
mouth notch works his way out in `src/state/store.travel.test.ts`, and
live the staged swim there drifts, slides along the coast where the
current would push into the blocked sea and gets back up the river alive
(`scripts/verify/enrichments.mjs`, screenshot 142).

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
swept round Cairo).

The slope-footing half of that gate is a SERIES, and it runs where the slope is
(point 412). It used to read one instant at the Maasai village and PASS while
reporting `slope over the wheelbase [0.00 x4]` and `pitch [0.000 x4]` — the
silhouettes there stand on the flat disc-horizon line, so the seating under test
never ran in the measured frame: a verdict without its population. It now
samples ~30 frames, counts the samples that stood on genuinely sloped ground and
judges only those, FAILING when that count is zero and naming the count. The
place is measured rather than assumed — `pedi-village` puts every stance sample
on a slope, `sidama-village` and `capetown` a smaller share, `maasai-village`
and `berber-village` 0.000 across 150 samples — and the PASS line names which
place supplied the population. The decision itself is the pure module
`scripts/verify/footingSeries.mjs`, pinned by
`scripts/verify/footingSeries.test.mjs`: an empty series, an all-flat series and
a too-thin sloped population each fail with their own reason, a mixed series is
judged on its sloped samples alone, and a sloped foot hanging off its ground
fails.

The seam that footing worked around is CLOSED (point 381). What tore it: the
backdrop's relief floor was a flat −6 while `backdropTaper` reaches 1 within
~40 % of the inner radius, so a surround sampling lower than the place centre
plunged six units within a few metres — and the eye's grazing line over the
ground-disc edge descends only `eyeHeight / (2 · discEdge)` per unit (≈0.01 at
the 74 m Giza plateau, the shallowest line being the one from the OPPOSITE rim).
The surface never met that line again inside `BACKDROP_OUTER`, so past the disc
rim nothing was drawn at all: the frame showed the disc's hard edge, then the
captured band's low rows and the sky behind them — the user's "pale slab with a
visible thickness in front of a dark, speckled wedge". Established by reading
the live mesh rather than the formula: per azimuth, does the surface ever rise
back into the sight line before the band? Before the fix it did not in 48/320
azimuths from Giza's centre and in 3–241/320 from the far rim at EVERY enterable
place — the condition is a wide disc plus a lower surround, never a site — and
after it in 0/320 everywhere, centre and rim alike (measured on the running
game, both figures).

Three parts, all in `src/scenes/place/backdrop.ts` and pinned by
`src/scenes/place/backdrop.test.ts`: `backdropSurfaceY` clamps the FALL at the
base curve (outside the disc the surroundings may rise but never sink below the
plane the player walks on — swept over disc radii 28–96, eye heights 1.2–1.9 and
six relief profiles, and against the REAL terrain at every place in `PLACES`),
carries no relief at all under the disc overhang (so a steep surround cannot push
the rim through the plate), and `backdropRingRadius` pins a mesh ring exactly on
the disc edge — the log ladder cleared it (74.4 against Giza's 74), so the strip
interpolated the join a third of a unit low. The walkable disc's `circleGeometry`
also gets `GROUND_DISC_SEGS` segments instead of 48: a 48-gon put 9.7 m straight
chords on the ground line of the largest disc, which from a few metres away IS a
hard straight edge. In the rendered frame, `scripts/verify/polish.mjs` sweeps the
elevation through the horizon at the Giza site from the centre and two rim
standpoints over 72 bearings and asserts the surfaces read
`ground-disc → landscape-backdrop → band/sky`, never disc → band or disc →
nothing (the meshes are named for it); screenshots 141-giza-horizon-1/2 are the
reported view, and 139-giza-walkable-site the site from the south. The point-181
gate above now reports `landscape-backdrop` as the surface behind every
silhouette's feet, and its `max()` no longer has to fire — pinned as such
(`onLine === 0`), so a reopened seam fails the pure layer too.

And that in Cairo no
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

