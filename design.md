# The Heart of Africa — Remake: Design

This document describes the target state of a modern indie remake. It is based on the game mechanics of the original (see "The Heart of Africa — Complete Game Mechanics"); this document adopts those systems and fixes the decisions made for the remake.

Contents: §1 Technical framework · §2 Perspectives and camera · §3 World model and map · §4 Settlements · §5 Time and calendar · §6 Resources and conditions · §7 Equipment · §8 Valuables and the value matrix · §9 Building types · §10 Trade and economy · §11 Terrain and movement · §12 Audience with the chief · §13 Language and hint system · §14 Random events · §15 Chronicle/journal · §16 Presentation of events · §17 User interface · §18 Victory/defeat, saving · §19 Atmosphere and immersion · §20 Core gameplay loop · §21 Debug menu

---

## 1. Technical Framework Architecture

- Implemented as a web application with Three.js under React Three Fiber.
- Two presentation modes (§2): 3D bird's-eye view for the journey through Africa, first-person view inside settlements.

---

## 2. Perspectives and Camera

### 2.1 Bird's-eye view (journey through Africa)

Navigation across the continent works as in the original from a bird's-eye view, but the surroundings are rendered as 3D graphics (terrain, rivers, vegetation, landmarks). The camera follows the player character from above. Visible is a section of the map — the character's field of view, i.e. the surroundings of the current position within Africa.

### 2.2 First-person view (settlements)

On entering a village or a port city, the game switches to the first-person view. The settlement is walkable: you walk through it and to its buildings, buy and sell goods there (§9), and hold an audience with the chief in a village (§12).

Walking speed: inside settlements, walking forward is fastest; strafing sideways and walking backward move at a reduced factor of the forward speed (a calibratable value, default 80 %, adjustable in the debug menu §21). A diagonal is never faster than walking straight.

Walk feel: the first-person walk reads as a person, not a floating camera. The velocity carries inertia — it eases up to speed and settles back to a stop rather than snapping (separate accelerate/settle time constants). While moving, the camera has a subtle head bob (a vertical rise-and-fall at twice the step rate, plus a half-rate lateral sway forming a gentle figure-eight), both scaling with speed so they fade to nothing on stopping; strafing leans the view into a small roll (a few degrees at most), smoothed and zero at rest; and standing still keeps a barely-perceptible idle sway so the camera never freezes dead. Each footstep plays a short procedural sound whose timbre matches the surface underfoot (softer on open ground, firmer on a lane/stone path), through the single ambience volume (§21). All of this is CAMERA/feel only: the head bob never shifts the logical position used for interaction, doors or the leave-radius, and it is calibratable in the debug menu (§21). (Walk speed itself is unchanged — 10 m/s, §21.)

### 2.3 Switching (walk in, walk out)

Entering and leaving a settlement happen purely through movement, without a dedicated key:

- In the bird's-eye view, walking onto a settlement's position enters it and switches to the first-person view.
- Inside, walking beyond the settlement's walkable edge leaves it and switches back to the bird's-eye view with the field of view around the current position — there is no exit archway and no "leave" key.
- A settlement just left stays closed to re-entry until the traveller has moved clear of it (a calibratable clearance beyond the enter radius), so leaving never bounces straight back in.
- A settlement is not auto-entered while the traveller is on a water cell: even with the village-river clearance of §4.2, a riverside village's enter radius can touch the water, and canoeing a river must never drift him in by accident. He enters by stepping onto land.
- The §4.2 clearances scale with the river width (point 156): however wide the calibratable band is set, a village keeps its full hut footprint dry, a port keeps its rendered cluster out of the band (while still sitting AT the river), and every landmark field clears it by its own radius — only the Okavango's fan stays in the water, because flooding is its identity.
- Enterable buildings (trade, service and audience buildings) open by walking against their entrance door — the same deliberate opening the inhabitants use, no key press. Only the village elder is addressed with the interaction key.

### 2.4 Graphics and atmosphere

Villages and their inhabitants are styled typically for their region (building style, clothing, vegetation matching desert, savanna, jungle, highlands, lakes/rift). Port cities appear wealthier (solid, larger buildings, busy activity), villages closer to nature (simple, region-typical dwellings). The presentation creates a fitting atmosphere for each settlement and region.

### 2.5 Surroundings panorama (first-person)

The background of the first-person view plausibly matches the landscape one would see at this spot in the bird's-eye view:

- The real map terrain around the settlement's position is rendered as a distant panorama — mountains and ridges, river courses, lakes and the sea appear where they actually lie. On entering from the bird's-eye view, the surroundings are CAPTURED from the travel scene itself at the settlement's position (a 360° horizon band, direction-true: what was just seen beside the marker stands on the first-person horizon), with the symbolic travel-scale dressing (hill-sized trees, animals, markers) left out and the sky carved away so the place's own dome shows through. Without a live travel scene (loading a snapshot, a ferry arrival) the geometry backdrop stands alone as the fallback — its relief SHADED as terrain: steep faces mix toward bare, structured rock that catches the light — never a flat vertex-color wash.
- The relief is capped so that even a mountainous surrounding (e.g. the Atlas behind Berber Village) reads as a distant range on the horizon rather than looming over the camera. The panorama surface is drawn double-sided so steep far slopes never show as dark overhanging gaps. The relief shades SMOOTH — interpolated vertex normals, never flat per-face shading — and its heightfield is sampled finely enough that mountain and dune ridges read as a continuous silhouette, not stepped polygon planes.
- Distant wildlife moves through the panorama: far-off, region-typical animals (elephants, giraffes, zebras in the savanna; antelope near the desert) drift slowly as silhouettes well beyond the settlement edge. They read as FAR animals, not looming monuments: pushed far out on their ring and their size capped so each subtends only a couple of degrees, and hazed toward the sky-horizon tone (atmospheric perspective) rather than a flat near-black blob. They stand on the VISIBLE horizon line — with a captured surroundings band active (below) that is the band's horizon line, without one it is the backdrop relief — so they never float above a dip, sink into a ridge, or get clipped to a black back-sliver behind the settlement ground's horizon edge. Their species are the region's own bird's-eye pool, so the two views agree.
- The drifting silhouettes never cross a FIXED skyline landmark. Each settlement that mounts a distant monument on its horizon (Cairo's Giza pyramids, Cape Town's Table Mountain) excludes the azimuth arc that monument occupies — its bearing from the town centre plus a clearance margin around its footprint — and any silhouette drifting into that arc is simply dropped (fewer animals is fine); it is never drawn crossing the pyramids. An in-town building on the horizon (e.g. Timbuktu's mosque) is NOT a skyline landmark — a silhouette passing behind town buildings is a normal depth relationship, not a crossing, so it is not excluded.
- The bird's-eye vicinity of a settlement is never empty: the first-person panorama shows life, so the overland view around the same spot must too. Wherever the normal streaming spawn produces fewer than a small minimum of region-typical animals within a radius of a settlement (about one and a half times the near view), that presence is topped up with additional seeded herds — but only the shortfall, never on top of an already-populated vicinity. Seeded animals are ordinary animals in every other respect (seed-deterministic placement, the region's species pool, normal streaming despawn, the same spacing and count limits) and keep a clearance from the point where the traveller re-enters the overland view, so he never materialises inside a herd. The seeder also places its group OUTSIDE the rendered frame (point 165) — it projects each candidate spot through the live bird's-eye camera and prefers an off-screen one (the vicinity radius reaches past the frame at the default zoom), so a guaranteed herd is already standing there when the spot scrolls into view rather than popping in under a watching eye; the dry-season shore gathering does the same, seeding a bank only while it is off-screen. (Full individual consistency between the decorative first-person silhouettes and the live bird's-eye simulation is deliberately NOT attempted — the two are separate systems.)

### 2.6 Lively, densely built settlements (first-person)

Settlements do not read as a sparse cluster of a few functional buildings but as believably inhabited communities. The presentation effort inside settlements is considerably higher:

- A clear majority of the buildings is non-functional: dwellings, granaries, animal pens, workshops, tents and storage buildings the player cannot enter, beside the enterable trade, service and audience buildings (§9). Density, size gradation and arrangement are region-typical (§2.4, §4.5) and procedurally varied per settlement (§18); port cities build denser and more massively than villages.
- A recognizable path network connects buildings, squares and the settlement edge, in region-typical material and routing (dusty tracks, stamped clay paths, busy harbor lanes); it structures the settlement and guides player and inhabitants.
- Buildings line implicit streets rather than scattering freely. Port cities grow an organic, period-appropriate lane network — winding alleys and small irregular squares, explicitly not a rectangular grid — and every building fronts its lane with the door side: each door is reachable directly from a lane, every window keeps a clear line outward (no wall pressed against a neighbour's), and no building stands on a lane. Villages do NOT use the port fabric: each people follows its own period-accurate organising principle per §4.5 (researched against the ~1890 record), from ring plans around a cattle enclosure to a single cleared street to dispersed camps without any lane at all.
- Every surface carries believable micro-structure at first-person eye height — never a flat color wash: the ground shows grain, ripples and pebble relief (trodden paths worn smoother than the surroundings), and the building materials (plaster, mud daub, thatch, wood) show real relief the light reacts to, with a darkened base course and faint weather run-off streaks on the walls. The micro-structure comes from reproducibly generated, tileable baked textures (albedo + normal maps at millimetre grain, world-space triplanar mapping, two blended scales against visible tiling repetition): their mip chain band-limits the detail with distance — near surfaces stay sharp, far surfaces calm down for the temporal anti-aliasing — instead of hand-tuned distance fades.
- The inhabitants visibly go about their business: they walk the paths, linger and work at squares (§19.10), and enter and leave the dwellings they live in — not static props but a living everyday routine. The settlement must recognizably feel "inhabited".
- The functional, enterable buildings stay clearly recognizable within the denser fabric (§17: highlighting of the important buildings).
- Collision: buildings and solid objects (huts, granaries, tents, fences, trees, rocks, the fire pit) are impenetrable to player and inhabitants alike; movement slides along obstacles instead of stopping dead. The clearance keeps the camera out of every wall — pressing against a building never shows its inside. Inhabitants avoid obstacles or at least never remain permanently stuck; paths, squares and the accesses to the enterable buildings always stay walkable. No inhabitant spawns or walks into a pocket it cannot leave: every walker target sits on ground with a clear standing circle and at least one open escape direction against the full collider set (stall boards and rocks included), and a walker that does end up physically pinned is quietly nudged to the nearest free spot after a short calibratable window (inhabitants only, never the player).
- The entrance door is the one deliberate opening in the otherwise impenetrable buildings: an inhabitant returning home visibly walks up against its door, slips through, and later steps out the same way. The player opens the functional buildings exactly like that (§2.3) but cannot use the dwellings' doors — non-functional buildings stay closed to him.
- Every door opens onto reachable free ground (a path, square or open lane) — never against a neighbouring wall, a gapless fence or the settlement edge — so each resident can stand at its own door. The procedural layout rotates a building whose natural facing would seal its door and keeps every door's approach clear of later-placed objects.

### 2.7 Lighting and post-processing pipeline

Image quality rests not only on geometry and material quality but on a full lighting and post-processing chain:

- Image-based lighting: an HDRI sky serves as the environment light source (IBL) for physically plausible material reflections; the visible sky follows a physically grounded atmosphere/scattering model instead of a simple gradient, consistent with the sun position.
- Shadows via cascaded shadow maps (high resolution near the camera, soft edges), tuned for both perspectives.
- Post-processing: screen-space ambient occlusion (SSAO/GTAO), bloom, temporal anti-aliasing, filmic tone mapping with color grading; a subtle vignette and depth of field are permissible but must not reduce the readability of the map view.
- Water: refraction with depth-dependent absorption (shallow water lighter/greener, deep water dark blue), a wave field (e.g. Gerstner) and foam along shores and wave crests; sky reflections come from the image-based lighting. (Screen-space reflections were integrated once and removed again — with the bird's-eye camera never at grazing angles and the first-person scenes having no water or gloss, no in-game situation makes them read; revisit only if the camera or scene content changes.)
- Distance fog is replaced by — or combined with — the atmospheric scattering; the regional climate moods of §19 remain as a modulation on top.

---

## 3. World Model and Map

### 3.1 Fixed geography, procedural variation

- Fixed continent of Africa: the geographic location of all landscape elements (coasts, rivers, jungle, mountains, lakes, landmarks, settlement sites) is fixed. The concrete appearance of the landscape, and the look of the villages including the distribution of their huts, are however determined procedurally in every playthrough (§18). In addition, movable goals (the tomb, buried treasures) are placed anew each game.
- The world reproduces Africa geographically authentically as it was in the year 1890. The real landmarks of §4.4 lie at their correct geographic positions.
- The world ends at the African Red Sea coast: the Red Sea, Sinai and the Arabian peninsula are not part of the map. Northeast of a boundary running slightly seaward of that coast — from the Mediterranean across the Suez isthmus, down the Red Sea to Bab-el-Mandeb and out along the Gulf of Aden past the Horn — there is only open, impassable ocean (§11.2), rendered as sea like the rest of the water around the continent.
- More generally, only the game's own land masses are rendered: the continent and its reachable ~1890 islands (Zanzibar, Pemba, Bioko). Real-data land outside them — southern Europe, Anatolia, foreign islands, and the unreachable Madagascar — is trimmed from the map material to open sea; no land is visible outside the walkable continent, in the rendered world and on the exploration map alike.

### 3.2 Regions, terrain types and coordinates

- Five regions, each with its own landscape, its own peoples and its own value profile: North (desert/Sahara), West (savanna), Central (jungle/Congo basin), East (mountains/lakes/rift), South (high plateau). The boundaries between the regions are visible in the game: as subtle dashed ink lines on the exploration map and as dashed ground markings over land in the bird's-eye view. Along the borders, the name of the region is shown on its respective side of the line (localized), both on the map and in the bird's-eye view.
- Terrain types: ocean, coast, desert, savanna/open land, jungle/grassland, mountains, water (river/lake).
- Coordinate system: position in degrees ("latitude … degrees north/south", "longitude … degrees west/east"). This system is the basis of the hints (§13). It is not shown permanently on screen; the current coordinates are read out on demand via the position query (§17).

### 3.3 Real geodata and terrain rendering

The landscape rendering is based on real geodata rather than purely synthetic noise:

- Elevation relief from a real digital elevation model (DEM, e.g. SRTM or Copernicus GLO-90), preprocessed into elevation tiles and streamed at runtime with levels of detail (LOD) around the player character. Characteristic relief forms (rift escarpments, high plateaus, dune fields, river valleys) are recognizable.
- Coast, river and lake courses from real vector data (e.g. Natural Earth, HydroSHEDS), adjusted to their ~1890 state (for instance the large Lake Chad outline, no modern reservoirs). The courses are smooth and fine-grained; visible raster steps on coasts and banks must not occur.
- Ground rendering via biome-based texture splatting with PBR materials (sand, savanna grass, laterite, rock, rainforest floor) and detail normal maps (triplanar) instead of plain vertex colors.
- The borders between the landscape types (desert, savanna, jungle) meander naturally rather than following straight region or threshold lines: the coordinates that decide the biome are domain-warped by a low-frequency noise field before classification, so a jungle or desert edge weaves across the map (the raw coordinates still drive elevation, rivers and coasts — the real geography).
- The procedural per-run variation (§18) remains: it affects vegetation distribution, village layouts and movable goals — not the real geography, which is identical in every playthrough.

---

## 4. Settlements

### 4.1 Port Cities (10)
Resupply, trade, ferries, discovery bounties; automatic saving (checkpoint).
Cairo (northeast corner; always the starting city), Tangier (northwest coast), Khartoum (northeastern interior), St. Louis (west coast), Timbuktu (western interior), Lagos (Gulf of Guinea), Boma (Congo mouth), Berbera (Horn of Africa), Zanzibar (east coast), Cape Town (southern tip).

**Settlement size and character.**
The size of a settlement in the game mirrors its real importance at the end of the 19th century: major cities (Cairo, Zanzibar, Cape Town) are markedly larger — a wider walkable area, more building blocks and streets, more warehouses and market stalls, denser crowds, and a landmark tower on the skyline; towns (Tangier, Khartoum, St. Louis, Timbuktu, Lagos) are mid-sized; small stations (Boma, Berbera) stay modest. Port cities and the large interior towns must read clearly differently from villages: stone/adobe blocks, street grids, harbor trade and paid labor versus the villages' organic hut clusters, kinship compounds and subsistence life.

### 4.2 Peoples (22)
Carriers of the hints and of regional trade. Region assignment see §4.5.
Maasai, Pedi, Zulu, San, Wayeyi, Lunda, Mbuti, Swahili, Somali, Hausa, Mongo, Sidama, Banda, Nubians, Tuareg, Berbers, Bambara, Mandinka, Bemba, Bambundu, Baganda, Fang.

Each people's village sits at its ~1890 heartland, and every village keeps a small minimum clearance to river water: its footprint never reaches into a river, so a canoe passage carries the traveller past a riverside village instead of into its huts. Ports are exempt — they sit on coasts and river banks by design.

### 4.3 Rivers (17)
Basis of the direction/location hints (mouth/source); navigable by canoe.
Blue Nile, Nile, White Nile, Jubba, Ruvuma, Zambezi, Limpopo, Vaal, Orange, Sankuru, Kasai, Ubangi, Congo, Benue, Volta, Niger, Senegal. Each river has one named source and one named mouth location.

### 4.4 Landmarks
Lakes (Lake Chad, Lake Tana, Lake Albert, Lake Edward, Lake Victoria, Lake Rudolf, Lake Tanganyika, Lake Nyasa), mountains (Toubkal, Emi Koussi, Kilimanjaro, Mount Kenya, Mount Elgon and others), waterfalls (Stanley, Livingstone, Kabalega, Victoria, Augrabies Falls), and natural point-landmarks (the Ngorongoro Crater, the smoking Ol Doinyo Lengai — the Maasai "mountain of God", active in the period —, the Okavango Delta and the Sudd papyrus swamp), each sighted and journaled like the other landmarks with a kind-flavored discovery entry. Special site: the Elephant Graveyard (valuable ivory) — recognizable at a glance in the bird's-eye view by fallen, bleached elephant carcasses and ivory tusks and bones strewn across a pale patch of ground. Each dig with the shovel frees a random ivory haul (averaging about five pieces) from the site's limited supply, until the bones hold no more. Passing elephant herds mourn here (§19.8, point 126).

Built cultural landmarks — the game's structures among the otherwise natural landmarks: the Nubian pyramids of Meroë (kingdom of Kush), the great pyramids of Giza with the Sphinx — depicted as a recognizable couchant lion: fore paws stretched forward, raised haunches, tail, and the head under the trapezoid nemes headdress — (Old-Kingdom Egypt, just west of Cairo across the Nile — they also stand as Cairo's western first-person skyline, like Table Mountain behind Cape Town), Great Zimbabwe, the rock-hewn churches of Lalibela, the coastal ruins of Kilwa Kisiwani, the towering stelae of Aksum (an Aksumite kingdom that struck its own coinage and traded across the Red Sea), the Gondarine castles of Fasil Ghebbi (imperial Ethiopia) and the Dogon cliff dwellings of the Bandiagara escarpment (built above the older Tellem sites), each at its real ~1890 position and existing by 1890. These are sighted and journaled like the natural landmarks (§10), but their discovery entry frames each as an achievement of an African civilisation — evidence of an African polity's own history, never a European "find" (§16).

Two further landmarks live in their port's first-person scene rather than on the travel map (a map marker would duplicate the port marker): Table Mountain stands as a flat-topped massif skyline behind Cape Town, and the Djinguereber mosque (the authentic 1327 Sudano-Sahelian mud landmark, standing in for the excluded 1907 Djenné mosque) rises inside Timbuktu's town fabric — buttressed mud walls and a pyramidal toron-studded minaret, impenetrable like every building (§2.6).

### 4.5 Region Assignment
| Region | Landscape | Peoples |
|---|---|---|
| North | Desert/Sahara | Tuareg, Berbers, Nubians |
| West | Savanna | Hausa, Mandinka, Fang, Bambara |
| Central | Jungle/Congo basin | Mongo, Mbuti, Banda, Bambundu, Lunda |
| East | Mountains/lakes/rift | Maasai, Swahili, Somali, Sidama, Baganda |
| South | High plateau | Wayeyi, Bemba, Pedi, Zulu, San |

**Village organising principles (~1890, researched).** Small native villages
read noticeably differently from the ports: they follow the spatial pattern
their people actually used at the end of the 19th century — mostly no street
network at all — instead of a shared template. Each people maps to one of
seven researched plans:

| Plan | Historical pattern | Peoples |
|---|---|---|
| `ring` | Central Cattle Pattern / Maasai enkang: huts on a ring around the central cattle enclosure inside a perimeter fence; thorn rings carry extra gates (one per family head), the chief's great hut sits opposite the south gate | Zulu, Pedi, Bemba, Maasai, Somali |
| `street` | Congo-basin street village (documented pre-colonially, e.g. Schweinfurth 1870): ONE cleared, swept axis with two facing house rows and a palaver shelter at its edge | Mongo, Banda, Bambundu, Lunda, Fang |
| `compound` | Sahel compound architecture (Hausa *gida*): walled family enclosures around a central meeting ground, granaries inside, lanes to each compound entrance | Hausa, Mandinka, Bambara, Sidama, Baganda |
| `scatter` | Dispersed camp: loose family groups of tents or small huts with irregular spacing, no lanes, no shared fence; Tuareg camps add a thornbrush goat pen | Tuareg, Mbuti, Wayeyi, San |
| `ksar` | Fortified North-African block: small flat-roofed houses packed on narrow winding lanes inside a stone perimeter wall with one south gate; the communal agadir tower rises near the centre | Berbers |
| `riverstrip` | Nile fellah strip: flat-roofed houses banding one river-parallel lane just above the flood line, a short cross alley to the common ground | Nubians |
| `coastrow` | Swahili rural mji: rectangular gable houses in a double row along one sandy shore path under palms | Swahili |

Post-1900 patterns (corrugated iron, gridded "chief's line" rows, colonial
resettlement) are deliberately absent. The generator's geometric parameters
are calibratable stylizations of the researched ranges, not measured
invariants.

---

## 5. Time and Calendar

- Months (displayed, written out in the selected game language): January through December, with the year (start 1890).
- Time advances through travel and actions; long distances and difficult terrain cost more time.
- A multi-year deadline, communicated through staged messages: progress/reward on discovery, first warning, second warning, deadline expiry (defeat).

### 5.1 TEMPORARY: the deadline is suspended, the calendar stops at 31.12.1895

**Current state, on the user's instruction (16.07.2026) — not the target state.**
While the game is developed and its seasons tested, the expedition must not end
on time: the deadline of §5 is switched OFF (`balance.deadline.enabled`, false
in the shipped config), so no recall and no staged warnings fire. Instead the
calendar has a **ceiling**: time runs to **31 December 1895** — the end of the
game's window — and stands still there. Every path that advances the day
(travel, river drift, ferry passages, event losses) stops at that same wall, so
the date can never leave the window whatever the player does.

The mechanism itself is intact and stays tested: `store.expedition.test.ts`
enables the flag and asserts the §5 warnings, the expiry defeat and the §18
successor flow exactly as before, so the day the suspension is lifted the
behaviour returns unchanged. Flipping `deadline.enabled` back to true is the
whole of the revert.


---

## 6. Resources and Conditions

### 6.1 Resources

- Currency: \$ (means of payment in the port cities). Starting capital \$250. Used for: equipment, provisions, ferries, gifts; income through sales and discovery bounties.
- Provisions (food): consumed per time step; can be bought. The POC ships a relaxed exploration preset (user calibration 15.07.2026): the default consumption rate is ZERO — provisions do not drain unless the rate is raised in the debug menu (§21.2); the mechanic itself stays fully implemented.
- Water: the canteen holds a fill level (a percentage). It refills to full at FRESH water (river, lake) only — salt water is not drinkable, so the sea never refills it or quenches thirst even where the coast is swimmable (point 208 A4) — drains on land — faster in the desert — and, once empty, thirst builds and then health drops. In the relaxed exploration preset both drain rates default to ZERO (debug-editable, §21.2); the thirst mechanics stay fully implemented. The inventory bar shows the fill and warns as it runs low (glowing yellow and blinking below a third, red below 5 %, still blinking when empty). It protects against dehydration in the desert only while it still holds water.
- Gifts: trade goods for chiefs; they create goodwill and unlock hints. They are also the means of payment in the native villages (money has no value there).
- A new expedition sets out fully equipped (relaxed exploration preset): one each of shovel, rope, machete, rifle, medicine and a FULL canteen; only the canoe remains a purchase. Starting capital stays \$250 and the start stays Cairo 1890 (fixed values). The inventory bar lists gear alphabetically by the localized item name (re-sorting on a language switch), treasures after gear.
- Item effects are possession-based: a piece of equipment in the inventory acts on its own — there is no "taking an object in hand". What is carried (§7) decides terrain mobility (§11), protection in events (§14) and treasure recovery; consumables and tools are used by clicking them in the inventory bar (medicine cures, the shovel digs). The map is NOT an inventory item: it is always available from its own button in the bottom-right button row (left of the journal button, §17.4) and the M key, opening the exploration overview — inside a settlement the place plan (§7/§19.11).

### 6.2 Afflictions and healing

Afflictions alter controls/vision and can be fatal:

- Fever/illness (mainly in wetlands) → temporarily uncontrolled movement.
- Dehydration (desert without water) → drift; avoidable with a filled canteen.
- Sun blindness (desert) → restricted vision, can end fatally — the canteen does not help against it; recovery only outside the desert.
- Wounds (animals/robberies) — wounds also mend on their own while the traveler is fed: a severe wound subsides to a light one and a light wound closes over days (calibratable), so recovery without medicine is possible; medicine remains the instant cure. A wound also shows on the traveler's bird's-eye figure, scaling with severity: a bandaged head for a light wound, a bloodied head and shoulders for a severe one. The writing hand shows it too (§16.3).
- Medicine cures fever and wounds.
- Loss of the expedition → a successor takes over.

### 6.3 Camps (item caches)

Inventory caches relieve the limited inventory and allow, for instance, leaving the canoe behind when moving away from waterways (on land it causes a speed penalty, §7, §11).

- Free camp: in the bird's-eye view a camp can be pitched anywhere in the open (near an existing camp, that camp is reopened instead of pitching a second), holding any number of inventory items. It is marked with an X on the exploration map and a pole marker in the bird's-eye view. Such a camp can however be looted while the traveler is away; the loss is revealed by a journal entry when he returns — items stored there are not safe.
- Village camp: once you are an "Honored Friend" (§12) in a native village, you may store any number of inventory items there at any time; they never disappear. If however you forfeit that standing in this region through a robbery (§12), the items stored there are irretrievably lost.

---

## 7. Equipment and Effects

| Item | Effect |
|---|---|
| Rope | Safe, faster ascent in the mountains. Mountains can also be climbed without a rope, but slower and dangerously: after a warning, every stretch on the rock risks a fall that wounds the traveler (light or severe) and can tear a carried item loose |
| Machete | Crossing jungle/dense grassland; also offers protection against animal attacks, though weaker than the rifle |
| Shovel | Digging up treasures and the tomb at marked sites |
| Rifle | Hunting and defense; carried in the pack it offers the strongest protection against animal and robber attacks on land — stronger than the machete (§14) — and enables the robbery of a chief's hut (with a permanent reputation loss in the region, §12) |
| Medicine | Cures fever/illness and wounds; used by clicking it in the inventory bar |
| Gifts | Trade goods for chiefs (goodwill, hints) |
| Canteen | Holds a fill level; refills at fresh water, drains on land (faster in the desert); protects against dehydration in the desert while it holds water (not against sun blindness) |
| Canoe | Fast, safe travel on rivers/lakes (the rifle also stays usable there); on land it slows the traveler markedly (a hint names it). Without a canoe, water is slower, more exposed to the current and to crocodiles. Its depiction in the bird's-eye view makes the state legible: travelling water the explorer sits in the canoe (riding on the surface, paddling); on land he drags it along behind him — the hull trails the walked path like a trailer, lies on the terrain (pitching down to where its far end rests on the ground, rolling slightly on cross-slopes) and swings clear of stones, trees, animals and settlement edges instead of clipping through them; at a bank it stays on the land side — the rope rotates to land at full length (or shortens on a spit narrower than the rope), so the dragged hull never pierces a river, lake or sea surface |

Core rule: items act by possession alone, never "in hand" (§6.1); the table above carries the per-item effects. The map is NOT among these items: it is always available (from a bottom-right button and the M key, §17.4), opening the exploration overview — and inside a settlement a PLAN OF THE PLACE instead: the walkable area with every functional (enterable) building marked and named (localized), dwellings as unlabelled context and the lanes sketched, in the same worn-paper style (§19.11).

---

## 8. Valuables and the Culture/Value Matrix

Treasure finds/valuables: gold, ivory, silver, copper, emerald, statue.

Core principle: the value of an object depends on region/culture. What a region reveres fetches much there; what it rejects is not bought or provokes hostility. This forces continent-wide arbitrage trading.

| Region | High value / revered | Rejected / dangerous |
|---|---|---|
| North | Gold, emeralds | Silver |
| West | Ivory | Emerald |
| Central | Silver | Gold |
| South | Copper, emeralds | Ivory |
| East | Emeralds | Copper |

A visibly carried valuable triggers a positive or negative reaction depending on the region.

**A DELIBERATE HOMAGE CARVE-OUT (point 208 B3).** This value matrix, the `$`
currency, Khartoum standing as a welcoming ~1890 port (in reality the Mahdiyya
held it 1885–98 and the city lay abandoned in favour of Omdurman), and the §13.2
regional-direction glossary are inherited from the 1985 original game and are
FIXED here on purpose. They are not held to the ~1890 accuracy standard that
governs the climate, peoples, dress, ecology and panzootic — the game keeps them
as a homage to its ancestor. This is the third deliberate carve-out from the
accuracy principle, alongside the §19.8 grief and the §19.13 exaggeration;
recorded here so nobody later "corrects" it toward historical accuracy. (§13.2's
glossary is doubly provisional — it is also the placeholder under review in
§13.4.)

---

## 9. Building Types and Functions

Villages and port cities contain various building types. In the first-person view they are enterable. In a buy dialog the goods are laid out as a table: item name, the price aligned in its own right-justified column, and the buy action — so the prices read straight down the column. Every trade dialog also offers to buy the traveler's gear back, paid in the settlement's currency.

Every settlement — port city or native village — offers at least the baseline goods for purchase: food, a machete, a shovel and medicine. In port cities the currency is money; in native villages it is gifts (money is worthless there, design.md §6), and a village trading post barters these goods for gifts. Selling gear likewise yields money in a port and gifts in a village.

| Building | Function |
|---|---|
| General store | Sells medicine, gifts |
| Travel agency | Ticket sales: passage to another port city |
| Bazaar | Buying and selling of treasure finds |
| Weapons hut | Sells rifle, machete |
| Tool hut | Sells shovel, rope, canteen |
| Market hut | Sells canoe, food |
| Village trading post | Village only: barters the baseline goods (food, medicine, machete, shovel, rope, canteen) for gifts, and buys gear back for gifts |
| Chief's hut | Village only: audience with the chief to obtain hints |

---

## 10. Trade and Economy

- Places of trade: see §9.
- Means of payment: in port cities trade uses money, in native villages gifts (trade goods).
- Bazaar (treasure finds): offer an item → the merchant names a bid → accept or decline. If the item does not fit the regional value profile, it is rejected. The bid is a standing quote for that port: declining and re-offering the same item shows the identical price, not a freshly haggled one. The quote expires only on leaving the port (a different port haggles anew).
- Price logic: a base price per good; treasure finds additionally carry a regional factor and a buy/sell spread. Profit comes from regional arbitrage.
- Ferries (travel agency): passage between ports for a fee; saves time compared to overland travel.
- Discovery bounty: money for reported discoveries (new villages, landmarks), credited on the next port visit as a telegraphic transfer; the chronicle entry names the discoveries and the amount. The first sighting of a landmark is itself a journal moment, with its own entry flavored by what was found — a mountain rising against the sky, a thundering waterfall, a sea-like lake, the elephant graveyard. Entry HEADINGS are specific too: a sighting heads with the landmark's name shaped by its kind, and a dug find heads with the treasure's name — never a generic one-size title like "A Discovery".

---

## 11. Terrain and Movement

| Terrain | Relieving item | Without / with |
|---|---|---|
| Desert | Canteen (with water) | without water: dehydration (drift), speed loss; with a filled canteen: no dehydration. Sun blindness threatens regardless; the canteen does not help against it |
| Jungle | Machete | without: nearly impassable; with: traversable |
| Mountains | Rope | without: passable but slow and dangerous — the traveler is warned, then risks a fall on the rock (a light or severe wound, possibly losing a carried item); with: safe and faster |
| River/lake | Canoe | with: fast, safe water travel; carried on any land (desert/savanna/jungle/mountain): marked speed penalty |
| Savanna/open | Rifle (outside villages) | without: higher robbery risk |
| Dig site | Shovel | without: no find; with (click the shovel): dig it up |

Movement happens in the bird's-eye view; the terrain is rendered in 3D, the controls remain top-down oriented.

The traveller has a body in the bird's-eye view: he collides with the large, solid dressing (trees and boulder piles) and with the wildlife (§19) — a fast step is caught at the obstacle's near edge, and movement slides along it. Small dressing (bushes, reeds, termite mounds, loose rocks, dead trees) and carcasses stay passable. Collision is DERIVED from the same placement the renderer draws, so a plant that is not drawn — suppressed near a channel, or absent for any reason — never leaves an invisible collider (the guarantee that closed the "blocked by nothing" reports).

### 11.1 Visible slowdown reason

Whenever the current terrain slows the traveler and the relieving item is not carried — dense jungle without a machete, water without a canoe, mountain rock without a rope, or the canoe carried across any land (dead weight on desert, savanna, jungle and mountain alike) — the bird's-eye view shows a short hint naming the cause and the relieving item. A movement penalty is never silent.

The first encounter of each penalty type is additionally announced once in the journal (a short entry naming the terrain and the missing item); every later encounter of that kind is carried by the status-bar hint alone. The per-type "already announced" flag travels with the checkpoint.

### 11.2 Movement boundary

Movement is restricted to the continent and its inland waters (rivers, lakes). Sea within the continent's outline — bays, gulfs and straits cutting into the landmass — counts as inland water and can be swum or crossed by canoe like a river or lake; the open ocean beyond is not navigable, so the continent cannot be left.

Two seas are never inland water regardless of the outline: everything northeast of the African Red Sea coast (the Red Sea cut of §3.1) and the Mediterranean off the entire northern coast (Alexandria, the Nile delta, the Gulf of Sidra …) are open, impassable ocean, with no swimmable band. The other bays keep their outline treatment unchanged.

Even inside the outline, swimmable sea reaches only a short band off the coast (a calibratable balance value, debug menu §21); further out the open ocean blocks — there is no swimming far out to sea.

### 11.3 Water, current and waterfalls

Current and gameplay:

- Waters carry a current, which is especially strong in the immediate surroundings of waterfalls (§4.4).
- Moving with the current is faster, against it slower; even an idle traveller on a river is carried downstream. The drift covers real distance and therefore consumes time and provisions like any water travel — the current never moves the traveller for free.
- There is a risk of being swept over the falls — with injuries and the loss of a large part of the inventory.
- Water can also be crossed without a canoe, but slower, more exposed to the current, and at risk of a crocodile attack (injury or death). Out of the canoe the rifle gets wet and is useless — only a machete reduces the risk; in the canoe it stays dry and works as usual. Visually the swimmer floats ON the rendered water surface, chest-deep with a slow swim bob (point 152) — never walking the carved bed under the sheet, however deep it lies (Lake Edward's rift bed made the difference plain).

Visual water realism:

- Water follows the map's height profile: rivers lie in beds carved into the local relief, their surface just above the bed along the whole course, reading as one continuous, unbroken ribbon that descends from source to mouth — never sea-level canyons through the highlands, never buried where the ground rises.
- Width and course (a deliberate inaccuracy, like the §19.8 grief carve-out): rivers render WIDER than strictly to scale — a playability trade (user decision, 16.07.2026), because canoe navigation on the true width kept slipping the traveller onto land mid-passage. The widening is a calibratable balance factor over the 0.17° base half-width, and the carved bed, the rendered ribbon and the settlement clearances all follow the same widened value. The course itself runs SMOOTH: the sparse ~1890 source polylines are interpolated through a centripetal spline shared by the terrain carve, the ribbon and the water mask, so no control point turns in a hard corner and the three can never diverge.
- A stray point that the biome map misclassifies as sea mid-river is bridged rather than tearing the ribbon. At the true mouth the ribbon carries a short way past the coast contour into the receiving sea shelf, so river and sea read as one continuous water body — no beach strip between the ribbon's end and the sea; only the open sea beyond it ends the ribbon.
- No water body carries an interior notch: where the channel runs along a side-sloping bank, the water surface locally rises so the carved bed stays submerged across the channel's whole width — carved ground never pokes through the rendered sheet (the reported cut-out in the Nile at Cairo).
- The surface itself is calm (only slight movement, no ocean-style wave field) with a recognizable downstream current (drifting streaks) that visibly accelerates at rapids and waterfalls.
- Waterfalls (§4.4) are rendered as white cascades with plunge-pool foam and mist; rivers that rise in open land show a spring at their source.
- Lakes are flat surfaces at their local shore height, laid just above the highest point of their carved bed — the bed never shows through the water sheet.
- Further realism measures: foam along river banks, depth-tinted beds, glossy sky reflections on open water and a subdued ocean swell. Bank foam appears only at REAL banks: where a ribbon edge lies inside the joined water body — a confluence, a lake mouth, the sea — it is masked, so no shoreline ever draws across open water.

---

## 12. Audience with the Chief

Access to hints leads through the chiefs, in the chief's hut of a village (first-person view). Procedure:
1. Enter the village.
2. Visit the chief's hut, audience.
3. Present a culturally fitting gift → goodwill.
4. With sufficient goodwill: a hint about the tomb/treasure (into the chronicle, §15).
5. Wrong behavior: hostility, expulsion.

**Hostility.**
A rejected gift means hostility and expulsion: the traveler is thrown out of the village, accumulated goodwill resets, and the chief refuses further audiences for a hostility period (a calibratable balance value) before relations can be rebuilt.

**Honored Friend.**
Satisfying a chief correctly repeatedly bestows the status of "Honored Friend" for all villages of his region. The bestowal is journaled: an entry in which the chief pledges his people's protection. A robbery forfeits the status irretrievably.

Effect: near the region's native villages the natives protect the traveler from animal and robber attacks (§14) — he is at most lightly injured; close to death, inhabitants hurry over with food, water or medicine; and in the region's villages he always receives food, water and medicine free of charge. Each such event is journaled, typically like "I was attacked by lions. A group of the … people rushed to my aid at once and saved me from the attack. I was only lightly injured."

**Robbery and reputation.**
With a rifle in the pack, the chief's audience offers to rob the hut — behind a deliberate safety confirmation (a warning naming the consequences, confirm/cancel), because the deed is irreversible. The haul is deliberately rich — a large sum of money, trade goods up to the pack limit, and provisions — so a robbery can genuinely pay off despite its cost; the chronicle reports exactly what was taken. It permanently antagonizes all villages of the region (no hut enterable, no more hints) and irretrievably forfeits the "Honored Friend" status including its protection.

---

## 13. Language and Hint System

The game's core puzzle: determine the site from the natives' direction and location statements. Understanding the language is part of the game.

### 13.1 Hint Construction
Hints combine landmark + direction + coordinates, e.g. "the area around [place]", "[river] mouth"/"[river] source", combined with north/south/east/west and "latitude/longitude … degrees". Reference points are not only rivers but also lakes, mountains and waterfalls. Landmarks are rivers, cities, peoples, lakes, mountains and waterfalls.

### 13.2 Regional Direction Systems
Every region expresses directions differently; the player must decipher each system:
- North: direction relative to the origin of the wind; "Nivera" = north.
- West: "koko" = north, "Katula" = east, "Phuthswama" = south, "Mimbumi" = west.
- Central: directions relative to "Utomba".
- South: seasons as directions — summer = north, winter = south, spring = east, autumn = west.
- East: relative to "Odabi"; "Relolo" = north, "Dethamee" = south.

Glossary (landmarks in the local tongue): El Mora Levimara / Mongdamara (Congo), Lastwana (Zambezi), Gumba lu Untoba (Victoria Falls), Unumpara (Kilimanjaro), Galumba / Ut-hu Manbwama (elephants), Oz Oz / Oink Oink / Auke Auke (unspecific knowledge).

A village elder teaches the region's direction words; a second talk with the elder reveals what the region reveres (§8). A chief's raw hint is recorded in the journal in the region's own words and turns into a deciphered entry as soon as the region's language has been learned — in either order (lesson before or after the hint), so an undeciphered hint is decoded retroactively.

### 13.3 Cascade and Time Limit
Per region exactly one knowing people (seeded anew each run) reveals the region's component of the site: the North's chief the latitude, the East's the longitude, the other regions narrowing statements. Every other chief offers only unspecific knowledge (Oz Oz …) that points toward the region's knowing people. Several hints are triangulated into the exact position of the tomb.

### 13.4 OPEN: the communication mechanic is not yet decided

**§13.1–13.3 above describe what is BUILT, not the target state.** Understanding the inhabitants is meant to become a central mechanic of the game rather than a vocabulary list handed over by an elder, and the mechanic that carries it is still an open design question. Nothing in §13.1–13.3 should be treated as settled, and nothing should be built on top of it until this is decided.

Rough direction (first thoughts, deliberately not yet binding):

- **Learning, not being told.** Today the elder simply teaches the region's direction words and the hint decodes. The intent is that the player must *work out* what the inhabitants mean — by observing them, by interacting, by seeing a word used in a situation whose meaning is obvious, and by testing a guess and being wrong. The reference point is **Chants of Sennaar**: meaning is inferred from context and confirmed by use, and the player's own understanding is the progression, not an inventory flag.
- **One invented language per region**, each **invented but resting on real local and historical practice** — the same standard the world's geography and peoples are held to (§3.1, §16). The research comes first and the language follows from it: where a region really communicated in a particular form, the invented language takes that form. Example (the user's, and it is a real West African practice): if the research shows that **talking drums** carried messages across West Africa, then the West's language is a drum-signal language the player must learn to hear.
- **Consequence for §13.2's glossary:** the current word lists are placeholders from the original game, not researched material. They are likely to be replaced wholesale rather than extended.
- **Consequence for §13.3:** the knowing-people cascade may survive as the *structure* of who holds which part of the answer, but its delivery — an elder's lesson, a raw hint decoded retroactively — belongs to the old mechanic and is under review with it.

**This section is the flag CLAUDE.md §2 requires: the concept is missing, so it is recorded as an open item rather than invented.** It needs (a) research into how each region really communicated around 1890, in the manner of `docs/climate-1890.md` and `docs/peoples-1890.md`, and (b) a decision on the mechanic itself, before any implementation point can be written.

**(a) is DONE: `docs/communication-1890.md`.** Its load-bearing findings: drum speech is a real language operated in stock formulas (tone + rhythm of actual utterances, ambiguity resolved by enphrasing — the stock phrase IS the signal, which is exactly what makes it learnable by observation); whistling and drumming are the same abstraction in different media across the tonal Niger-Congo zone; the Sambla balafon (four tone levels, played openly at social events) is a better model than the famous Congo drum; nsibidi supplies the visual counterpart (composable ideograms, no syntax, a public tier and a restricted tier — but the game must build an INVENTED system on its mechanics, never transcribe the real one, per its own custodians); North and East Africa genuinely lack sound surrogates (scripts and couriers in the north, fanfares and named-signal repertoires in the east — an honest mechanical contrast, not a gap to fill); and in 1890 the mechanism was un-decoded by outsiders, so a player inferring it occupies the exact epistemic position of a European of that year. The document closes with a concrete ZONE PROPOSAL (three or four communication zones instead of today's five regions) — **the zone cut and the mechanic itself remain the user's decision (b).**

**Until then, §13.1–13.3 is NOT a constraint on other work.** It is placeholder machinery awaiting replacement, so disturbing it is not a reason to compromise a change elsewhere — do not bend an accurate implementation to protect the elder's lesson, the glossary or the knowing-people cascade. (Being *free* to disturb it is not licence to leave the suite red: if a change breaks `store.hints.test.ts`, adjust the test to the new truth or state plainly that the point knowingly leaves it broken.) **The moment the new mechanic is decided and built, that reverses: it then becomes load-bearing and must be protected like any other system.**

---

## 14. Random Events

Hidden triggering per time step/region/condition.

### 14.1 Event kinds

- Wild-animal attacks (lions, cheetahs, leopards, hyenas and snakes): an attack can injure or kill. Danger order: lion (most likely to kill) > hyena > leopard > cheetah (rarely presses an attack home). Against the stalking predators a rifle or machete in the pack lowers the risk, the rifle more; a SNAKEBITE strikes from cover and is not mitigated by a carried weapon (point 208 A5). A predator only attacks where its species actually roams the region (point 208 A3). The chronicle reports the outcome in sentences like "I was attacked by lions.", "I escaped.", "I used the rifle." or "I was lightly injured.". Beyond the hidden roll, walking into a wandering predator in the bird's-eye view (§19) directly triggers that predator's attack (same outcome rules and protection).
- Robber attacks: can injure and steal inventory items. As with animal attacks, a machete lowers the risk, a rifle more so.
- Protection through "Honored Friend": near the villages of a region where you hold this status, the natives rush to help during animal and robber attacks; you can then at most be lightly injured (§12).
- Crocodile attacks in water: moving through water, a crocodile may attack and injure or eat you. The machete ALWAYS helps against a crocodile — out of the canoe AND from it (machete-in-canoe is strictly safer than the canoe alone, point 208 A5) — while the rifle works from the canoe alone (§11.3).
- Current at waterfalls: near waterfalls the strong current can sweep the character over — with injuries and the loss of a large part of the inventory (§11).
- Illness/fever (climate/region dependent) → affliction (§6).
- Fever delirium → temporarily uncontrolled movement.
- Desert dangers: dehydration (avoidable with a filled canteen) and sun blindness (recovery only outside the desert, §6).
- Weather (e.g. sandstorm with loss of visibility).
- Finding caches/camps/remains.

### 14.2 Item protection

The fitting piece of equipment in the pack helps during events. Protection
sources: weapons against animal/robber attacks per §7/§14.1 (rifle >
machete; against crocodiles per §11.3), medicine as the instant cure
(§6.2), the canteen against dehydration (§6.1).

### 14.3 Calibration

Concrete probabilities are calibrated freely for balance. They are tuned to keep events rare, so the journey is only occasionally interrupted. In the relaxed exploration preset the random-event system is OFF by default; the debug menu's toggle (§21.3) switches it on at runtime, and the direct triggers stay available either way. The first-time danger warnings (§14.4) are not random events and stay active.

### 14.4 First-time danger warnings

The first time the traveller meets a danger situation, the journal warns of it once and names how to guard against it — a foresightful hint, not a reaction to an event that already struck (distinct from the movement-penalty hints of §11, which concern slowdown, not danger).

- A warning never advises what is already in use: whoever crosses the first water with a canoe in the pack is told the crocodiles lurk but that the canoe keeps them out of reach — not to get one.
- Each warning fires only on its first occurrence (the "already warned" flags travel with the checkpoint, like the §11 announcements) and is written in both languages with voice markup (§15).
- The situations covered: setting out into the wilds without a rifle (wild-animal attacks — the rifle is the strongest protection, better than a machete); the first desert stretch (dehydration and sun blindness — a filled canteen holds off the thirst, only leaving the desert cures the blindness); the first passage through water (crocodiles — a canoe carries safely and keeps the rifle dry, otherwise only the machete helps); the first fever-prone jungle (fever — medicine cures it).

---

## 15. Chronicle / Journal

An automatically growing narrative chronicle of the journey, written in the selected game language (English by default, German available, §17). Functions: mood carrier and store of the collected hints. Entries are produced from templates with places/directions inserted, and from events.

### 15.1 Tone and immersion

The journal is the central means of creating immersion: many events are never seen, only experienced as text — comparable to reading a novel. The entries are therefore always written vividly and express, depending on the situation, fascination with the new, drama, bewilderment, misgivings, hope and the like. The text building blocks from which entries are assembled must already be written with this vividness — in every supported language.

### 15.2 Emotional voice markup

The journal text building blocks are stored in every language file with a lightweight internal markup language that describes the emotional delivery: mood spans (`[awe]…[/awe]`, `[whisper]…[/whisper]`, `[excited]…[/excited]`, `[somber]…[/somber]`, `[weary]…[/weary]`, `[fear]…[/fear]`), word emphasis (`[emph]…[/emph]`), display-only passages (`[mute]…[/mute]`, e.g. meta notes like "(Checkpoint saved)") and beat markers (`[pause]`, `[breath]`). The tags are additive: stripping them must always leave well-formed prose, and the display pipeline shows only the stripped text — markers are never visible to the player.

**Every journal text — existing and future, in every language — is written with these emotion markers.**

### 15.3 Read-aloud (TTS)

- For speech output the pipeline is parser → TTS text → audio: the parser converts the markup into prosody (real pauses, punctuation shaping such as "…" for hesitation or "!" for excitement, and per-passage speaking speed and loudness) so that "Today… at last. I have found the temple." sounds different from the same words read flatly.
- Journal entries are narrated with the Kokoro TTS model running in the browser — the synthesis runs off the main thread (in a Web Worker) so it never stalls the game while a voice is being generated, especially the heavier first-time model load.
- A new entry is read aloud automatically (no click required). While the browser's autoplay policy still blocks audio, the narration is deferred, not dropped: the newest entry (at game start, the departure entry) starts narrating with the first user gesture.
- Every entry additionally offers a read-aloud control to replay or stop the narration.
- Kokoro currently provides no German voice, so narration is available in English only; German texts nevertheless carry the exact same markers so a German-capable voice can be plugged in later (open item).

### 15.4 Following the newest entry

The journal always keeps the newest content in view. When an entry is added the view scrolls to the bottom, and while an entry is being written in stroke by stroke (§16) the view follows the growing text down so the appearing strokes never scroll out of sight.

### 15.5 Entering a new region

On first entering a new region, the journal opens, announces the region and shows an entry describing the traveler's fascination with this region and its peculiarities.

### 15.6 Death of the character

A dead character can write no more journal entries. Instead of an entry, a report appears that the explorer's remains have been found — a gruesome sight that hints at the cause of death (for instance, that he was eaten by lions).

---

## 16. Presentation of Events

Events (animal and robber attacks, chiefs' hints, status changes and the like, §14) are not staged as separate scenes. The player learns of them because the journal opens automatically and a new entry appears.

The entries read like the moment they record: the first visit to a village is told through that people's own ~1890 way of life — every village carries its own historically grounded vignette (the indigo-veiled Tuareg, the Hausa dye pits, the Maasai cattle ring, the Swahili coral-stone lanes …), never a shared boilerplate.

The rinderpest years are DATE-DEPENDENT (point 133; research: `docs/peoples-1890.md` §5): the great panzootic 1888–1897 is the game's own window, and the first-visit vignette reads the plague phase of the visit date. A Maasai village met in 1890 shows the pleuropneumonia-thinned herds of a still-standing world; met in 1891–92 it stands in the emutai — devastated but INHABITED (the enkang kept its core), with Baumann's own 1892 words carried verbatim in the German text; met from 1893 it lives in the famine's aftermath, its cattle-loan fabric torn. The Sidama highlands sit inside the Kifu Qen famine through 1892 and in its aftermath after; the Nubian vignette stands in Sanat Sitta's wake for the whole window. Accuracy guards hold throughout: the camel peoples (Somali, Tuareg) lose no herds — camels are immune — the cattle-less Bemba know only game depletion, southern Africa stays clean until the Zambezi crossing of March 1896, and no rinderpest→dress-change link is asserted. The phase itself is the pure `rinderpestPhase` model (§19.13 seasons plumbing pattern), observable via dev hook and steered through the §21.1 date jumps.

RETURN VISITS (point 170): the vignette is not only a first-visit entry. When a village whose SITUATION has changed since it was last journaled is entered again, a NEW entry is written that describes ONLY the change — in a shocked, aghast register ("I came back to find the kraals empty"), never a re-description of the whole place. The change that matters in the game's window is the rinderpest phase: a Maasai enkang first met in 1890 and returned to in 1892 or 1893, or a Sidama highland met in the Evil Days and seen again in their aftermath, earns its own transition vignette (per people and from→to phase, both languages, voice markup). The game remembers the phase last journaled per village (saved with the checkpoint) and stays silent when nothing changed or when the people carries no plague model — so the entry never spams. The structure is generic, so other future "situation" drivers can hook into the same return-entry path.

### 16.1 Non-modal journal

- The opened journal does not freeze the game: the character keeps moving in both perspectives while the journal is open and even while an entry is being read aloud — reading and narration never halt travel.
- Only the modal dialogs (trade, audience, camp and the like) block movement.
- Walking a building's entrance door open (§2) therefore works with the journal open too — the book closes as the building's modal appears; an auto-opened journal never leaves a hut unenterable.

### 16.2 Do not disturb

Players who do not want to be interrupted can turn the automatic presentation off (POC: debug-menu checkbox, also toggled with F2): with the option active, new entries neither open the journal nor start their narration — they are written silently and remain fully readable (and narratable) when the journal is opened manually. Turning the option off restores the automatic behavior.

### 16.3 Animated handwriting

- The entry does not appear as finished text but is visibly written into the book in handwriting by a hand that clearly grips a pen, the nib meeting the line at the growing end of the text.
- If the character is injured, the injuries are visible on the writing hand, at a recognizable severity: with a severe injury the hand is bloody, with lighter injuries correspondingly less marked. Example: the entry "I was attacked by lions and severely wounded." is written by a bloody hand.
- An entry written by a bloody hand accordingly contains traces of blood — rendered as irregular spattered droplets with satellite specks and a run-off drip, so they read as blood rather than tidy dots.
- If the character can no longer write (death), the handwritten entry is omitted; instead the report about the found remains appears (§15).

---

## 17. User Interface

### 17.1 Bird's-eye HUD

- Field of view of the surroundings; status bar with date, funds, provisions, gifts and the current region (no hand-object slot — item effects are possession-based, §6/§7). Each stat is led by a narrow, expedition-styled SYMBOL instead of its word (the localized word remains as the tooltip/accessible label), and the date reads compactly as DD.MM.YYYY.
- The coordinates are not shown permanently; they are read out on demand via the position query.
- Transient status hints — e.g. the reason for a movement penalty (§11) — appear CENTRED inside the status bar itself (in the row with date/funds/region), not in a separate panel floating over the scene.
- The inventory bar shows the carried items; clickable ones act on click (medicine cures, the shovel digs), the canteen shows its fill level, and treasures presented to a village trigger the §8 reaction.
- An item that is currently in use lights up (glows) in the inventory bar: the relief item countering the present terrain (the canoe on water, the machete in the jungle, the rope on a mountain) and medicine while a curable affliction (fever or a wound) is active — so the player sees at a glance which piece of equipment is doing its work right now.
- A health bar sits INSIDE the status bar at its right end — where the journal panel can never cover it: a filled bar that is green at full health and shades ever redder toward zero, so the condition reads at a glance without the health query; below a third of full health it BLINKS for attention (like the canteen's low-fill blink). To its left, the currently active afflictions (fever, dehydration, sun blindness, wounds) show as small badges. The detailed state stays on the health query (H).
- Further functions: chronicle, position query, health query, and pitch camp (§6). The bottom-right button row holds, left to right, the CAMP button, the MAP button and the JOURNAL button. The map button is always present (the map is no longer an inventory item, §7) and opens the exploration overview / place plan. The camp button appears only where a camp can actually be pitched (§6.3): in the open bird's-eye world always, inside a settlement only in a village whose region holds "Honored Friend" — hidden in ports and non-friend villages, exactly matching the C key so button and key never disagree.

### 17.2 Discovery-gated labels

Map-point labels are gated by discovery: the floating name of a settlement or a natural landmark (village, waterfall, mountain, lake, river) appears only once the traveller has discovered it — a place once it has been visited, a landmark once it has been sighted (the same sighting that earns its discovery bounty, §10). Until then the point carries a muted "?" as its label instead of the name. The exploration overview likewise draws only the places already visited.

### 17.3 First-person UI

First-person view (settlements): walkable space, interaction prompts at buildings/persons, trade and dialog windows. A gift to a native additionally provides an orientation over the settlement's buildings, with the important, enterable buildings highlighted.

### 17.4 Layering

Modal windows (trade, audience, bazaar, travel agency, camp caches) and the full-screen overlays (start/load, victory, defeat) always render on top of everything else in the scene, including the floating building and place labels. A modal is never obscured by an in-world label. The chronicle/journal panel (docked on the right) keeps a small gap to the right screen edge and ends above the bottom-right button row (camp / map / journal), so those buttons are never covered.

### 17.5 Controls and focus

- Controls suitable for mouse/keyboard and gamepad. The chronicle/journal is opened and closed with the Tab key (gamepad: Y). Tab's default focus cycling is suppressed while playing so it does not shift focus onto UI controls; inside form controls (debug-menu fields, dialog inputs) Tab still navigates between them normally.
- Gamepad: the left stick moves the character in both perspectives (merged with WASD), the right stick turns the first-person view, and the buttons map onto the existing key handlers (A interact, B close, X dig, Y journal, LB map, RB camp, Select position query, Start debug menu) — a single input path, no second one. Only standard-mapped pads are read, and a connected pad steers only after a deliberate input (a button press or a full stick push): idle axis drift of wheels, flight sticks or worn pads must never move or turn the game on its own.
- Touch / tablet: a third input source beside keyboard and gamepad, with zero change to desktop play. It is a *feel* layer, not a rules change — walk/travel speeds, look sensitivity and every gameplay value stay exactly as on the desktop. On-screen controls appear only once the layer arms, and it arms solely on the first real touch of the app (the same deliberate-input idea as the gamepad guard); a desktop — even a touch-screen laptop that is never touched — stays pixel-identical and shows nothing. A virtual stick at the bottom-left drives movement (merged with WASD/gamepad exactly like the left stick); the right screen half is a drag surface that turns the first-person view through the same look sensitivity as the mouse, and a two-finger pinch there zooms the bird's-eye view through the same clamp and debug unlock as the mouse wheel. The interaction prompt becomes tappable — a tap dispatches the very key it names, so there is still one input path, not a second. The camp/journal/map controls stay ordinary buttons. With the layer active the HUD honours the device safe-area insets and tightens on short viewports. Arming the layer also applies a mobile quality preset — temporal anti-aliasing and screen-space ambient occlusion off, half-resolution shadow maps — each of which the debug menu (§21.3) can re-enable individually. The preset is a performance default tied to the touch layer, never to user-agent sniffing.
- Entering a settlement puts the focus straight on the controls: any lingering HUD button is blurred so the keyboard controls the character at once, and mouse-look (pointer lock) engages straight away — the walk-in keypress carries the user activation the browser requires. A modal dialog releases the lock so its buttons stay clickable (Escape releases it too); where a browser refuses the un-clicked request, a deliberate click on the view remains as the fallback. Mouse-look is never grabbed while a full-screen overlay is up (the initial checkpoint-load choice, defeat or victory): the cursor is needed to click it.
- The GUI is a game surface, not a document: text in the interface cannot be selected/highlighted. Only editable form controls (debug-menu fields, dialog inputs) keep normal text selection.

### 17.6 Renderer notice

If the renderer has to fall back from WebGPU to WebGL 2 compatibility mode, a dismissible notice informs the player at startup.

### 17.7 Game languages

English (default) and German. The language can be switched at runtime (POC: via the debug menu, §21). All player-visible text — UI, chronicle, dialogs, names of places and landmarks — is served from language files; adding a further language must require nothing beyond a new language file. Every future addition or change to game text must always be made for both languages; translations are written for their context, not literally. Proper names are localized where established exonyms exist (e.g. "Kairo"/"Cairo", "Kilimandscharo"/"Kilimanjaro"). Journal texts additionally carry the emotional voice markup (§15) in every language; it is stripped before display and never shown to the player.

---

## 18. Victory/Defeat, Procedural Placement, Saving

- Victory: find and recover the procedurally placed tomb in time.
- Defeat: deadline expiry or loss of the expedition (→ successor). On deadline expiry the expedition is recalled (defeat overlay, the journal falls silent); there is no successor then.
- Successor: when the character dies, a successor takes over instead. He resumes at the most recent checkpoint, loses a configured number of days (balance value), silently inherits the already-passed deadline warning stage, and opens his part of the journal with a takeover entry.
- Procedural per game: the position of the tomb and of caches, the concrete appearance of the landscape, and the look of the villages including the distribution of their huts. The geographic location of the landscape elements (jungle, mountains, rivers etc.) remains fixed. Special find sites: the Elephant Graveyard, camps/caches.
- Saving: automatic on visiting a port city. The port cities act as checkpoints; manual saving is omitted.
- Loading: on loading, an overview of all port visits appears as a table with one row per visit. Shown are port city, date (in-game), money, food, gifts and health state; from these the player picks the state to continue from.

| Port city | Date | Money | Food | Gifts | Health |
|---|---|---|---|---|---|
| Cairo | Jan 3, 1890 | \$250 | 5 weeks | 2 | healthy |

---

## 19. Atmosphere and Immersion

Complementary elements that reinforce the feeling of Africa, mostly without new mechanics. The wildlife interactions of §19.2–§19.8 are ambient scenery: they run without influence on the player — with the single exception that walking into a wandering predator triggers its attack (§14).

### 19.1 Soundscape and proximity calls

- Regional soundscape and dynamic music: distinct sound worlds per region (savanna insects and vastness, jungle with birds and monkeys, desert wind, drums near villages). Changes on region transitions and on perspective switches.
- On top of the regional bed, nearby wildlife is heard for what it is: an animal in the bird's-eye view near the traveller sounds its own call — an elephant trumpets, a hunting lion roars, grazers bark and snort, a wading flamingo flock chatters — growing louder as the player draws close and fading once it is left behind. These proximity calls count as ambience and are scaled by the single ambience volume along with the rest of the soundscape.
- The ocean surf is coastal, not a global bed: its loudness fades with the distance to the nearest coast — full within a near radius of the shore, silent at and beyond a calibratable cutoff, smooth between — so it is heard along the sea and in seaside ports but falls away as the traveller moves inland (both radius and cutoff are debug-editable balance values, §21). Beyond the single master ambience volume, individual sources can be turned down on their own through per-source volume sliders in the debug menu — at minimum the birdsong has one (§21).

### 19.2 Living wildlife and streaming

- Living wildlife as scenery: non-threatening animals in the field of view (elephant herds, giraffes, grazing herds of zebra, wildebeest, antelope and warthog on the savanna, flamingos at the lakes). Purely visual, anchoring place and region; the animals also interact with one another (say, a lion bringing down a grazer).
- The scenery streams with the journey: an animal is removed only once it is clearly outside the field of view — how far that reaches follows the bird's-eye zoom (zooming out keeps animals the default view would have dropped) — and an animal merely crossing a tile boundary while on screen is never culled.
- The hunting predator obeys the same rule: a finished hunt trots off away from the traveller and leaves the stage only well beyond the visible surroundings, and a strayed hunt ends the same way — no animal vanishes in sight.
- Scripted walks obey the same land rule: a predator's walk-off after a kill (or an aborted chase) deflects along the coastline instead of trotting into the open ocean; boxed in on a spit it turns back inland — it never swims and never vanishes in sight.
- The one exception is a dead animal, which dissolves on screen (eaten by lion or vulture) rather than popping away; a carcass left far off screen, out of the single scavenger's reach, is instead culled silently, so kills never pile up without bound and choke the frame loop.

### 19.3 The predator hunt

- The lion is not the only hunter: each hunt fields a region-appropriate predator of ~1890 Africa — the lion everywhere, cheetah and spotted hyena on the open eastern and southern plains, the leopard in the wooded west and centre — taking prey from its own food web: predator → grazer → grassland.
- The big predators (lion, hyena) bring down the large grazers (wildebeest, zebra); the lighter cats (cheetah, leopard) take the smaller, faster game (antelope, warthog). A hunt's prey is the predator's scheme intersected with what the region actually holds.
- Every wandering predator attacks the player on contact (§14), rate-limited by the event cooldown, with the §14 danger order (lion > hyena > leopard > cheetah, which is timid toward people) and protection rules (§7/§14). Away from a contact the predators remain scenery.
- The predator closes in from a random direction, so hunts run any which way across the plain. The fleeing prey weaves left and right to shake the hunter, which pursues with a limited turning rate (sharp cuts throw it wide) yet is faster and closes in over time.
- Brought-down prey is visibly fed on (the predator stands over the carcass with lowered, rhythmically tearing head movements, a red stain spreading beneath) while the carcass shrinks away piece by piece.
- The kill is not stripped bare: a small remnant stays beside the stain when the predator walks off, and the vultures that circled the kill all along descend and finish it themselves — starting as soon as the predator has cleared the site (a dozen strides away), not only once its walk-off has left the whole view. No new scavenger flies in for a flocked kill; the lone ground scavenger serves only carcasses without a circling flock (e.g. trampled animals).

### 19.4 Elephants and trampling

- Elephants roam as herds (rarely seen alone) on suitable ground — savanna and forest, where elephants occurred at the end of the 19th century, not the open desert — on a slow amble that only ever moves forward and turns in gentle arcs (no sharp turns, strafing or backing up).
- They do not hunt; a smaller animal is trampled only if it is in the herd's path, and stays dead over a red stain like a lion kill.
- Other animals dodge an elephant only at the last moment and a touch slower than it, so a head-on herd still tramples one now and then. A fleeing animal holds one steady escape direction — the combined push of every nearby elephant — rather than jittering between two of them.

### 19.5 Bodies and movement discipline

- Every animal carries one persistent visible facing that all behaviors merely steer at a capped turn rate — the body never whips around when a behavior starts, ends or changes: the dodge disengages only well past its trigger ring, a finished flight leaves the animal facing where it ran, an elephant always faces its line of travel.
- The animals have bodies: herd members spawn with natural spacing, no animal stands in or walks through another, and overlapping animals part at once. The one designed exception is the elephant trample itself.
- Prey animals (zebras, wildebeest, antelopes, warthogs, giraffes) flee a hunting or feeding predator smoothly — accumulated movement, never a sudden jump to a new spot.
- Every blood stain is laid into the local slope of the ground (never a horizontal disc that rising terrain slices into a half-moon).
- No animal ever strays into the impassable open ocean (§11): scripted prey balks at the waterline, and any animal that ends up on open-ocean ground — pushed, fleeing or dodging — is set back to the nearest land at once.
- Rivers and lakes are different from the sea (user revision, point 192): animals never spawn or idle in them, but they MAY cross them on purpose — swimming chest-deep on the rendered water at the seasonal wade speed to a far bank within a calibratable reach — and a prey animal boxed against the water by a predator or an oncoming elephant flees INTO it rather than be taken or trampled; the hunter does not follow into the deep. A crossing always resolves (it lands, or the deadline grounds it). The §19.8 water dramas (drowning, rescue, the crocodile) keep their own rules on top.

### 19.6 Vultures and carcasses

- Vultures gather and circle above a lion kill.
- A carcass the predator did not eat — a trampled animal, any other death — is not left lying forever: a vulture flies in, lands and feeds, and the carcass shrinks away the same way a lion kill dissolves. Feeding birds stand ON the ground under their own feet — ONE shared rule for the kill flock and the lone ground scavenger (point 128): each landed bird lifts with the slope beside the carcass onto its own ground, hovering high enough to clear its pecking body, so no vulture ever sinks into rising ground; falling ground never pulls a bird down.
- No vulture ever pops into or out of the picture: every flight — lone scavenger and flocks alike — appears beyond the visible surroundings (however far the current zoom reaches), flies in, and once its reason has passed flies off and vanishes only well outside the view again.
- No GROUND animal pops into the picture either (point 165): the chunk streaming spawns beyond the view, and the guarantee-seeders (§2.5 settlement vicinity, the dry-season shore gathering) place their groups outside the rendered frame — judged by projecting the spot through the live camera, the true frustum, not an assumed radius — so a herd is already standing where it belongs when that ground scrolls into view. Where a guarantee could only be met in view, the animal walks in from outside rather than appearing.
- If the character is in poor health (§6), vultures circle above and follow them for a while — an atmospheric signal without its own mechanics.

### 19.7 Shore and grazing life

- Animals living near a river or lake periodically walk to the shore, drink and return to the herd — only to the water's EDGE (the bank), never into the channel; grazing species dip their heads into the grass on open land; flamingos wade in the shallows.
- Some shore visitors go beyond drinking and bathe — a low, splashing wallow one small wade past the bank into the shallow edge, still never mid-channel.
- Apart from the water dramas (§19.8), the wading flamingos and the crocodile (§19.16 — the water IS its home), no animal ever STANDS in river or lake water: like the open-sea backstop (§19.5), an animal that ends up on a water cell is set back to the nearest land. Channels also stay clear of solid dressing — reeds hug the waterline, but no tree or boulder stands in or hard against the water where it would block a canoe passage (§11).

### 19.8 Family life in the herds

- A herd raises juveniles (small calves or foals) that keep close to a parent and nurse beside it. A calibratable fraction of each herd group are calves (point 169 — a group of eight raises about two, a group of four one), each linked to its OWN distinct parent so the family dramas happen more often; the count is capped at half the group so every calf keeps a parent of its own. The young reads as young beyond mere size — a baby schema: a proportionally larger head on a shorter neck, a shorter, rounder body on relatively long, thin legs, none of the adult ornaments (no horns, tusks, beard or mane; the elephant calf with stubby trunk and smaller ears, the giraffe calf with a much shorter neck).
- The parent defends its young in stages. A predator merely closing on the calf finds the parent moving between them: it stands off just in front of the calf, facing the danger down instead of fleeing. When a hunt targets the calf itself, the calf bolts and — slower than its hunter — is visibly run down in the open, while the parent runs as a living shield on the escape line, holding itself between hunter and young: a hunter that closes in reaches the parent first and takes it in the calf's place, and the calf escapes uncaught.
- If the shield is out of position and the calf is caught, it is not killed at once: it struggles alive for a few seconds (no wound or bloodstain yet) while the parent rushes the predator. A parent that reaches the predator within that window is taken in the calf's place and the calf gets up and escapes; a parent that only got close by the struggle's end is dragged down and eaten alongside the calf.
- The rescue burst (point 127): a parent racing to save its young runs on adrenaline — one calibratable factor over its ordinary walking pace drives all four rescue moves (the charge at the predator, the living shield, the guard step between danger and calf, the wade to a struggling calf), clearly faster than the same animal ever roams or grazes. Only genuine rescues burst: the grief drives — the vigil walk, the trample-throw, the waterfall plunge — save nobody and keep their own unhurried or death-bound pace. The burst is balanced so the drama survives it: the hunter still meets the shield, the too-late death stays reachable, and IN THE WATER the same swollen current that can drown the calf brakes its rescuer (the burst divided by the seasonal flow factor) — however hard the parent sprints, the rains' drowning drama of point 122 remains possible.
- Calves are playful: on their own rhythm they break into short gambolling hop-bouts around the parent. At a shore a bout can carry a calf into open water, where it struggles and drifts with the current; the parent wades in, pulls it out on reach, and the two walk back to the bank.
- The season decides the water's mercy (point 122): the rains swell the current (a calibratable factor over the local wetness), the dry season tames it. In calm water an unaided animal eventually clambers out exhausted on its own; in a swollen current the self-rescue never comes — any animal the current carries too long DROWNS (a calibratable window, ~30 s), so a rescue can genuinely fail (the calf carried past its parent's reach) and a rescuing parent that wades too long drowns beside its calf. The river takes every drowned body: it sinks and nothing scavenges it, like the waterfall victims.
- Near a waterfall the current keeps its menace (§11) for the animals too: calf or parent in its reach is swept over the falls to its death — and a parent follows a swept calf, plunging after it and dying with it.
- Elephant mourning (point 126): a herd whose path brings it near the elephant graveyard (§4.4) turns aside, walks to the bones in its own gentle arcs and stands over them with lowered, searching heads — a vigil, not a sacrifice: elephants mourn and move on after a calibratable while, and a herd mourns a visit only once. The same vigil holds around a dead herd-mate, should one ever fall; no death path exists for elephants themselves.
- Revenge (point 146) completes §19.8's actual grammar — SURRENDER / RESCUE / REVENGE: a parent whose calf is already dead and who attacks anyway rolls on the same rule at a higher bar. Killing is strictly harder than driving off for every pairing; the relative-strength gate means the antelope kills nothing, a zebra can kill a hyena, a warthog can kill the cheetah documented to yield to it — and NOTHING kills a lion, structurally, because §19's drama depends on the lion staying frightening. On a kill the hunt ends where it stands, the predator falls as an ordinary carcass that the vultures and scavengers work exactly like any zebra — an image the game never showed before — and the unwounded parent simply walks back to its herd: it fought, so it holds no vigil. Kill chances default LOW; being eaten remains the common ending.
- The rescue may succeed — grief never does (point 125): a parent that ATTACKS the hunter rolls for its life on a legible rule, the product of its weapon and the predator's willingness to yield. Both orderings are structural: for any parent the chance rises as the predator gets lighter along §14.1's tested danger order (cheetah < leopard < hyena < lion — the cheetah famously abandons rather than risk injury), and for any predator it rises with the parent's weapon (giraffe > zebra > wildebeest/warthog > antelope; the numbers carry their behavioural grounding as recorded comments). A successful defence ends the hunt through the ordinary walk-off — no stain, no carcass, the family rejoins its herd; a failed roll is today's sacrifice. THE LINE: a parent that SURRENDERS never rolls — the vigil, the trample-throw and the waterfall plunge stay chosen deaths (points 119/121/134), while an attacking parent rolls whether its calf is alive (rescue, here) or dead (revenge, point 146). It is not the calf's pulse that decides; it is whether the animal fights or gives itself.
- The giraffe mother's kick (point 124): giraffes are prey to the LION alone — no cheetah, leopard or hyena takes one — and a giraffe parent that reaches the hunter does not die by default: with a high, calibratable chance it DRIVES THE HUNT OFF, rearing into a visible hind-leg strike while the lion walks away and the freed calf rejoins it. The danger stays real: a failed kick falls back to the ordinary sacrifice, and the mire/vigil deaths remain deliberate (no kick there). The per-species defence chance is the shared mechanic point 125 generalises; here only the giraffe carries a non-default value.
- The vigil at the carcass (point 121): a parent that was still clear of the predator when its caught calf's struggle ended does not resume grazing — it walks to the carcass and stands vigil over it, facing its young. No vulture lands and no ground scavenger commits while the keeper stands (the flock keeps circling), and — a deliberate user decision in §19.8's established register of grief unto death — the keeper never flees anything: the carcass itself DRAWS a predator (region-appropriate, spawning beyond the view ring and walking in, on a calibratable delay), and the parent lets it come, taken at the spot where its young fell through the ordinary hunt kill. If nothing comes, the vigil ends on its calibratable window or when the carcass is gone, and the parent rejoins its herd — a chosen death, never a stuck animal.
- The drying waterhole (point 123, documented dry-season behaviour): in the dry season a shrinking lake bank turns to mud, and a gambol bout that ends there can mire a calf — it struggles in place, cannot free itself, and does not drift. Its parent will not leave: it stands vigil beside the stuck calf while the herd moves on, and it does not flee the predators the last water draws. A hunt that finds the pair takes the calf AND the vigil parent at the waterhole — the mud never frees the calf for the sacrifice escape. If no predator comes, the mud releases the calf after a calibratable window: the drama always resolves.
- The crocodile's ambush at the bank (§19.16) feeds the same family grammar: the seized victim struggles through the same window, the parent's charge rolls the same defence, and the sacrifice and too-late endings hold at the waterline.
- The same grief drives a parent whose calf is trampled underfoot by an elephant (§19.4): it does not dodge the herd like ordinary prey but throws itself before the elephant's moving feet — not the spot where its calf fell — and is trampled too, dying beside its young. Unlike the living shield against a hunter, this saves nobody: the calf is already dead and both are lost. Should the herd be gone before the parent arrives, the grief passes and it rejoins its own.
- The burning grass (point 145a) — and the cause is HUMAN. In the cured dry-season grass of the Sahel and congo-north belts the inhabitants fire the steppe, as Dybowski watched at the game's own latitude and Park saw from the Gambia ("the plains and mountains … variegated with lines of fire"): a fire line walks downwind across the savanna, leaving a blackened band that smoulders and fades. A calf standing in the line's path is caught by it and struggles; the parent goes in after it — a surrender of the grief family below, at its own pace, never the rescue burst. Every other drama in §19.8 has a natural cause — lion, river, elephant; this one alone is set by human hands, without the player doing anything. The fire is strictly seasonal (never the Congo, never a rainless zone, never the rains — the pure gate is tested) and it never touches the traveller: any player-facing fire would be a §14 design decision, deliberately not invented here.
- The broken wing (point 145b) — the one sacrifice that is a LIE. Ground-nesting plovers live on the open savanna with nest and chicks; a threat that comes close to the nest — the traveller, or a hunting predator — is not fled but deceived: the parent drags itself conspicuously away in front of it, one wing trailed as if broken, luring the threat from the nest, and past a safe distance it "recovers" and flies home in a low arc. Unlike every other §19.8 drama the bird does not throw itself in — it offers its body as bait, with a real chance of getting away with it; only near a predator can the lie fail at the recovery moment, and the traveller never harms a bird. The act always resolves (the point-118 lesson), and the pure trigger, heading, resolve and taken rules are boundary-tested.
- The lioness defends her cub (point 145c) — the apex predator read from the OTHER side. The lion has been nothing but a threat — to the traveller and to every grazer family; here it is a mother. A lioness and her cub are seeded on the open savanna only where a hyena hunt is possible (the eastern and southern plains, where hyenas roam), and a hyena that hunts the cub meets her defence. Structurally this is not a new mechanic bolted on: it runs through the ONE hunt state (the single global hunt, here a hyena chasing the cub) and the ONE parent-defence matrix — the lioness reaches the shared resolution core the way every parent does, so her shield, charge, drive-off, kill and (rarely) sacrifice-and-vigil are the same code the grazers use. What differs is only the weapon: a mother lion dominates a lone hyena (the strongest defence in the game — she routs it almost always, kills it sometimes, and loses the cub only rarely), so the scene reads as the hyena's daring and the lioness's power rather than a fair contest. The cub is drawn on the same baby schema as the grazer calves (larger head, shorter neck and body, leggy stance, and none of the adult mane). It is deliberately NOT one of the hunted grazer species: the prey behaviours (gambolling into water, fleeing, being seeded as region-typical game) never touch the lion — only the defence core does. The drama always resolves (the point-118 lesson).
- THE ONE DELIBERATE INACCURACY (point 134 — standing user exception, 16.07.2026: "Die Elterntiere sollen sich nach wie vor freiwillig wie gehabt ohne Wehr in den Tod stürzen, wenn ihre Jungtiere gestorben sind."): the three grief-unto-death drives — the waterfall plunge, the trample-throw and the carcass vigil — are ONE family, and they stay. Real ungulates bolt from a charging predator; the game's bereaved parents do not, on purpose: this is §19.8's established emotional grammar, and an animal that fled at the last moment would be the odd one out among the three, not the realistic one. Everything else in this world — climate, peoples, dress, the panzootic, village placement — is to be as accurate as the research allows; this is the single carve-out (see also the licence note in §19.13), recorded here where the behaviour is specified so nobody later "corrects" it toward realism. In code the exception is structural: the surrender branches never roll the §19.8 defence, by construction and comment.

### 19.16 The crocodile — the ambush from the water

- Crocodiles live in the rivers and lakes themselves — ~1890 the Nile crocodile and its western kin inhabited every major African system (the Nile, Niger and Senegal, the Congo basin, the eastern lakes, the Zambezi south), so crocodile water exists in every region; the waterless desert simply has none. A crocodile only ever exists ON water cells, exempt from the §19.5 no-standing-in-water rule like the wading flamingos.
- Hidden, it lies submerged with only the eye knobs and snout tip above the surface — nearly invisible, and never mistakable for a floating carcass. It waits; it does not roam.
- The ambush: an animal that comes to the bank to drink (the §19.7 shore visit) inside the calibratable strike radius triggers the lunge — a fast, short, VISIBLE burst out of the water, never a teleport. A missed lunge slinks back under and the wait resumes.
- The drama reuses §19.8's grammar without a second copy: the seized victim struggles through the SAME few-seconds window at the waterline, a charging parent that arrives in time is taken in its place (the calf escapes), one that only got close is taken alongside it, and the parent's attack rolls the same legible defence — a strong parent can drive the crocodile off its victim, but NOTHING kills the armoured ambusher (structurally, like the lion). A crocodile kill leaves no carcass on the bank: it drags the body under, and the river keeps it — no vulture ever lands for it.
- The seizure ALWAYS resolves (the §19.8 rule): the grip carries a hard release deadline beyond the victim's struggle window, so a victim that vanishes mid-grip — streamed out of view, or taken by another system — can never pin the crocodile; it lets go and submerges.
- The traveller who walks into a crocodile is attacked through the §14.2 event rules unchanged: the machete always protects, the rifle only from the canoe.

### 19.9 Climate and landscape dressing

- Climate and environmental look: region-typical atmosphere such as heat shimmer in the desert, humid haze in the jungle and clear air in the highlands. Purely visual.
- **Seasons (see §19.13):** the region look above is the dry-season baseline; the seasonal weather modulates it through the year.
- Rich, region-typical landscape dressing in the bird's-eye view: beyond the base vegetation, the land is dotted with period-appropriate elements of its region — baobabs, termite mounds, kopjes (granite boulder piles) and occasional dead trees in the savanna, bare trees at the desert edge, papyrus and reed belts along rivers and lake shores. The open land must not read as barren.

### 19.10 Village and market life (first-person)

Inhabitants at everyday activities (cooking, weaving, livestock, playing children). Pure animation; makes settlements feel alive and underlines the contrast between the wealthy port city and the nature-bound village. Beyond lone activities, the inhabitants interact with each other and with the props, in ways fitting late-19th-century life in their region: pairs stand together in conversation, gesturing; a fire tender kneels at the fire pit stoking the embers; an inhabitant fetches a food bundle from its hut, cooks it over the fire and carries it back; grain is pounded with pestle and mortar; a drummer visibly plays the drums heard in the village soundscape; and water is drawn at the village well, with a carrier walking the jar home. Such vignettes are to be extended over time rather than reduced.

### 19.11 Journal illustrations and self-drawing map

- Illustrated journal entries: occasional hand sketches (an animal, a landmark, a face) beside the text, matching the handwritten presentation (§16).
- Exploration map: the map reads as an engraved atlas plate of ~1890 (in the manner of the period atlases of George Philip or Johnston) on worn paper. Its conventions: a graticule with degree numbers inside a piano-key border; water in blue ink (rivers, lakes, fine coastal hatching fading seaward) against sepia land ink; hachure marks for explored mountains; each region's name exactly ONCE in spaced capitals across its heartland (never repeated along the borders); sighted landmarks (§17.2) named in small italics; a title cartouche with subtitle and a scale bar in English miles; a compass rose; and the visited-place and camp markers. The paper itself is aged: fold creases, faint ring stains, darkened corners. It is discovery-gated: the whole chart lies under a cloudy fog of war and each explored area clears a soft window through it, so the inked geography shows only where the traveller has been — only the plate furniture (frame, graticule numbers, cartouche, region names, borders) prints over the fog. The opened map (the continental atlas and, inside a settlement, the town plan) sits BOTTOM-LEFT with a margin to the screen edge and clear above the inventory bar — the mirror of the journal panel's bottom-right placement (§17.4) — capped in size so it never reaches the bottom-right buttons. The CURRENT PLAYER POSITION shows in both modes as a "you are here" marker (an ink dot with a fine pulsing ring): on the atlas at the traveller's projected coordinates, on the town plan at the first-person position within the settlement, updated live. Fits the exploration overview (§17).

### 19.12 No day/night cycle

There is no day/night cycle: game time runs in fast-forward (about five years of expedition over great distances); a real-time daily cycle would create constant switches and needlessly prolong a game.

---

### 19.13 Seasons and weather

The date drives the seasons, and each place shows the weather that was typical for it at that time of year — grounded in the researched ~1890 climate (`docs/climate-1890.md`), not in a generic wet/dry toggle. The model derives a wetness from the calendar date and the place (latitude, longitude, elevation): the Sahel's single summer rains peaking in August, the double rains of the equator, the Cape's winter rain opposite the plateau, the Ethiopian highlands' kiremt — and Cairo effectively rainless the year round. Deliberately encoded rather than left to intuition: rain does NOT follow the sun's convergence line (the real rainband lags far south of it), East Africa's bimodal calendar is stated outright, and the Sahel reads WET, because 1890 sits inside the 1870–1895 humid period. Snow can exist only where it really occurred — the exact massifs and ranges are pinned under "The ice of 1890" below; no settlement qualifies, so no village ever shows snow on the ground.

In the bird's-eye view the wet season closes the sight lines (fog pulls in and grays toward overcast), dims the sunlight to an overcast level, and rains visibly — wind-slanted streaks around the traveller. The dry season is the unchanged §19.9 baseline, and the zoomed-out debug view stays season-free like it stays haze-free. Crossing a climate-zone border, the weather EASES across it rather than snapping on within a stride: the traversal wetness that drives rain, fog, sun-dim and overcast is sampled through the SAME spatially-smoothed zone-weight field the greenness uses (point 167), so a border reads as a ~2-degree gradient in both the ground and the weather, and the two can never disagree there. This is display smoothing only — each zone's researched wet season (§19.14) stays exact, and a settlement (which sits at one coordinate) is unaffected.

The land itself follows the season: the ground and the foliage bleach toward straw in the dry season and deepen to green in the rains — only the greenery moves (rock, sand and trunks stay put), and the deserts, being rainless year round, never leave their neutral look. The season belongs to the PLACE, not to the traveller (point 151): every patch of ground and every plant reads its own position's climate from a shared, spatially smoothed greenness field, so climate-zone borders blend over a couple of degrees instead of flipping at a line, and nothing in view shifts merely because the traveller moves. Where flora appears with the season, the transition has a shape: tree crowns bare and re-leaf on their trunks, while ground flora — bushes, grass, papyrus — sprouts from the soil and withdraws into it, never floating in. The wildlife follows it too: in the dry season a wider shore catchment draws the animals in from farther out to the remaining water, so the shrinking rivers and lakes visibly concentrate life.

The first-person settlements follow the season as well — the whole of it, not a fragment. Each derives the weather from its OWN coordinates (the bird's-eye weather is not carried in — it would be a stale reading of wherever the traveller last stood). The rains gray the sky dome, thicken its cloud deck, gray the fog onto the §2.5 backdrop, dim the sun and sky light, **rain visibly** (a near-vertical eye-height field, distinct from the bird's-eye's tilted streaks — a plumb streak seen from above is nearly edge-on, so the two are calibrated apart), and **bleach the ground and flora toward straw or deepen them to green** with the same relative-per-zone tint the bird's-eye view uses. A desert port stays rainless in every month (Cairo is hyper-arid). The sky is dimmed together with the light on purpose — a dimmed sun under a bright blue sky reads as a bug, not as rain — and the §19.10 firelight, being a fixed point light, carries visibly further under the overcast sun.

The inhabitants dress for the season, but only where the period record supports it (`docs/peoples-1890.md` §7): the seasonal signal is usually NOT an extra coat — across the sources the answer to cold is fire, shelter and architecture, and where a garment answers it is one already on the body worn differently. Exactly six of the game's peoples change with the season, each on its own driver (cold, harmattan or karif, in part gated by RANK — the cold being a class experience where it is felt at all); the per-people table — garment, rendering, driver, gate and source — lives in §19.15, the peoples implementation record. The other sixteen peoples wear the same dress the year round, deliberately and on the record, not for want of building it. OPEN: the "worn differently" reading beyond the Somali head-muffle (a wrap drawn tight, pulled over the shoulders) the primitive figures cannot yet show. Like all of §19 this is ambience and touches no mechanic (whether weather should ever affect movement/health is an OPEN design question, deliberately not invented).

**The climate states are deliberately EXAGGERATED (user decision, 16.07.2026).** The game renders abstract and stylised, so the seasons need not be subtly realistic: they may be laid on a little thickly — kitschy, even — so that the player recognises them at a glance. This is a licence about the DEPICTION, not about the facts: the model underneath stays keyed to the researched ~1890 climate above, and a season is still shown only where and when it really occurred. What is exaggerated is how loudly a real state is stated, never whether it is stated at all — a Congo that has no dry season still gets none, and the Sahara still never greens. The licence exists because the honest measurement said it was needed: with the restrained calibration, stepping through the months read as nothing but a change in brightness (the ground's green excess moved 41 to 45 across the Sahel's entire year), which is a failure to communicate a fact, not a virtue of restraint. This is the second deliberate carve-out from the accuracy principle, alongside the §19.8 grief; like that one, it is recorded so that nobody later "corrects" it.

**The season reaches the people (point 142).** The settlements live by the researched calendar, not just under it: in a people's away season part of its adults are gone — the Maasai at the dry-season highland camps (the period-sourced, counter-intuitive direction), the Tuareg on the autumn caravan, the Sahel farmers out at the field huts in the rains — while the children and the elder remain ("a camp of women, children and elders"); the sedentary Bemba and Lunda never thin, deliberately. The village fire burns harder where the season is cold or dust-chilled, compounding the firelight that already carries further under the overcast. And the market has a season: the Sahel stall's grain shrinks in the hungry rains — the hungry season IS the rainy season, the research's best-verified finding — and refills at the October harvest. OPEN: the indoor/outdoor night reading (needs a day/night cycle) and the fishing seasons (a research gap).

**The ice of 1890, and hail (point 141).** Permanent ice caps exactly the three massifs that really carried glaciers in 1890 — Kilimanjaro, Mount Kenya and the Rwenzori, at 8–12× today's extent — and the four famous near misses stay deliberately bare, each for its researched reason: Mount Elgon (the highest African mountain completely free of glaciation), Ras Dashen (Ethiopia's rain is summer, so the high ground is dry when it is cold), Mount Cameroon (occasional dusting, no cap) and Emi Koussi (snow about once in seven years). Seasonal snow whitens only the two ranges that really take it: the High Atlas (Nov–Apr, its line sinking as the winter deepens) and the Drakensberg (Jun–Aug). At low altitude the one white the ground may ever show is HAIL — rare, deterministic, only inside a genuinely heavy wet-season storm, and gone with it; savanna snow remains physically impossible and never appears.

**Thunderstorms (point 166).** Where a genuinely heavy storm stands, it also THUNDERS: lightning FLASHES brighten the sky and the scene light for a moment, and each flash is answered a distance-plausible 1–4 s later by a rolling THUNDERCLAP — a flash-and-thunder PAIR, never a silent flash. It is gated exactly like the hail (only inside heavy wet-season rain, so a rainless or dry-season zone never thunders; deterministic per day and cell; a minority of storm days — more often than hail, since thunder rides most heavy tropical rain), and it reads the same way in BOTH the bird's-eye and the settlement view, each at its own place's weather. The thunder plays under the single ambience volume (silent at 0). The traveller is never harmed by lightning — any gameplay strike would be a §14 event decision, deliberately not invented, exactly like the fire rule.

**The harmattan (point 140).** From late November to mid-March, worst in January, the Sahel and Guinea belt stand under the dust wind: the sky loses its blue into a milky, whitish-ochre pall (never the wet grey — dust is not cloud), the sight lines close harder than under rain, the noon sun shows "of a mild red" through it (Dobson 1781), and — deliberately, because the research says the intuition is backwards — the sunsets are MUTED, not spectacular: "sunrises and sunsets lose their lustre; haloes may disappear altogether." The dust season is the dry season, so the pall and the rains never stand over one place together.

**The Okavango inversion (point 139).** The delta floods in the middle of its own dry season: the Angolan summer rains arrive half a year late down the Cubango and Cuito, so the water peaks in June–August exactly when Botswana's sky is at its driest, and recedes as the local rains begin. This is deliberate and period-sourced (Andersson gives the months; Livingstone deduced the remote origin from the water's clarity — "this is the dry season… the water being so pure"), so it must never be "corrected" into flooding with the local rains. The delta landmark's water fan swells and shrinks with that pulse. The 1850s Ngami-area peoples explained the flood as a distant northern chief throwing a man into the stream each year — directionally true knowledge in mythic form, and exactly this game's theme (recorded for §13/§16 use).

**The Nile flood (point 138).** The Nile of 1890 is unregulated (the first Aswan dam is 1898), and the game runs its cycle: the river rises from early June and crests in **October at Cairo** — at a place where it never rains, because the water is the Ethiopian kiremt arriving weeks late down the Blue Nile. The model therefore keys on the highland SOURCE with a ~two-month lag, never on local rain, and the rendered ribbon and the canoe's float height read one shared rise (a calibratable balance value scales it). The rise is vertical only — the ribbon keeps its width, so the flood never reaches ground the low-water river does not already border, and the riverside Nubian village keeps its §4.2 clearance by construction. OPEN option, deliberately not taken: measuring the clearance against the flood maximum instead, which would let the crest visibly lap at the village edge.

A single balance value scales the whole seasonal look (0 disables it), and the debug menu can force dry season, transition or rainy season for testing (§21).

### 19.14 Research → game: the climate implementation record

Where the findings of the climate research (`docs/climate-1890.md`) actually
reached the game. STANDING RULE (user, 17.07.2026): this record — and its
sibling §19.15 — stays current whenever the climate or people rendering
changes; the research documents point here. Code sources of truth:
`src/systems/season.ts` (the model), `src/render/seasonField.ts` (the
per-position field), `src/scenes/travel/Climate.tsx` and
`src/scenes/place/PlaceScene.tsx` (the display); verification lives in
`src/systems/season.test.ts` and the pixel/live blocks of
`scripts/verify/enrichments.mjs` and `scripts/verify/polish.mjs`.

| Research finding (§) | In the game | Verified by |
|---|---|---|
| Zone geography incl. the traps (§1–§2): the Gabon coast has a HARD Jun–Sep dry season; the Horn runs Swayne's four seasons; Cairo is functionally Saharan | `climateZoneAt` rule boxes with the `atlantic-equatorial` zone (added when a sweep caught the Fang village classified into the Sahara) and the `horn` zone (added when the Somali village fell to the Congo fallback); `isHyperArid` keeps Cairo and the Libyan Desert rainless in every month | every settlement swept into a plausible zone, live; Cairo asserted dry across all 12 REAL months |
| The Sahel was WET 1870–1895 (§1.1) | the Sahel month profile carries the humid-period rains inside the game's 1890–1895 window | `season.test.ts` pins the humid-period wetness |
| Relative greening: the Serengeti greens on less water than the Congo (§4) | the wetness/greenness split — `wetnessAt` (absolute, zone-capped: fog/rain) vs `floraGreennessAt` (relative per zone: flora/ground tint) | the pixel pairs 115/116 measure the SCREEN on real months |
| The harmattan pall, with the counter-intuitive muted halo (§4) | its own driver `harmattanAt` (Nov–mid-Mar, Sahel band): the dome whitens toward dust on its own axis, the noon sun reddens, the halo is MUTED, sight lines close harder than rain | the halo pin is a pure test; live Sahel Jan/Aug, screenshot 121 |
| The Somali karif wind (docs/peoples-1890.md §2/§7) | `karifAt` (Jul–Sep, Horn, altitude-gated) drives the tobe-over-the-head dress and the harder village fire | pure boundary tests; live dress checks, screenshot 113 |
| Ice caps exactly three massifs; Elgon, Ras Dashen, Cameroon, Emi Koussi are bare (§5) | per-massif DEM-adapted ice lines (`inIceMassif`), naive global snow line removed; seasonal snow only Atlas (Feb) and Drakensberg (Jul) | the massif list swept pure AND live over terrain colours; Atlas pixel fraction, screenshot 122 |
| Hail belongs to heavy storms, not to a season (§5) | deterministic `hailAt` — only inside a heavy-rain cell, rare, hashed per day and 2° cell | pure sweep (never in a rainless zone) plus the live radial whitening |
| Thunder answers lightning, never a silent flash (point 166) | `thunderstormAt` gate (heavy storm only, hashed per day/cell) + `thunderDelaySeconds` (1–4 s); flash brightens the scene light in both views, thunder one-shot under the ambience volume | pure sweep (heavy storm only, delay band) plus the live flash-and-thunder check |
| The Nile crests at Cairo in October, fed by the kiremt two months upstream (§6) | the flood is REMOTE-FED: keyed on the Ethiopian source with a 62-day lag, never on local rain; the ribbon and the canoe float height read ONE rise | pure: crest in October while Cairo's local wetness is 0; live at Aswan, screenshots 117/118 |
| The Okavango floods in the LOCAL dry season (§6) | the same lag abstraction, 180 days from the Angolan rains — the delta fan is fullest in July | pure both directions; live fan scale, screenshots 119/120 |
| Seasons must be of the PLACE (a consequence of all of the above) | the season FIELD: a blurred zone-weight texture sampled per ground vertex and baked per plant (point 175: a per-instance value, not a per-frame texture sample, so the crowns stay stable on WebGPU), so zone borders are ~2° gradients and nothing follows the traveller; settlements derive weather from their OWN coordinates | the flying-plants witness (field identical while the player moves); polish settlement blocks |

**The deliberate exaggeration.** §19.13 carries the user's licence:
the climate states may read a little kitschy so they are legible at a glance —
the straw/green flora recolour is deliberately stronger than photometric
reality, because three rounds of uniform-level checks once passed while the
player saw nothing. The standard since then is the picture: real months,
pixels, no override.

**What was NOT implemented, on purpose.** The known unknowns of
`docs/climate-1890.md` §8 stay out of the game (nothing invented); the
further-accuracy options of its §7 (e.g. measuring the village clearance at
flood maximum) are recorded as open options here, not silently taken.

### 19.15 Research → game: the peoples implementation record

This record states where the findings of the peoples research
(`docs/peoples-1890.md` §2 and §7) actually reached the game — one row per
region whose look the game now varies, with the affected settlements and the
exact rendering. The STANDING RULE of §19.14 applies to this record too: it
stays current whenever the people rendering changes; the research documents
point here. The source of truth in code is
`src/systems/dress.ts` (the rules), `src/systems/season.ts` (the three
drivers) and `src/scenes/place/` (the figures); the live proof is
`scripts/verify/polish.mjs` (screenshots 112/113).

| Region | Settlements (alphabetical) | Implemented aspect (the research finding) | In-game rendering | Driver · gate · source |
|---|---|---|---|---|
| North — Ahaggar Sahara | Tuareg Village | The wealthier men wear the **bernus** cloak against the freezing caravan nights (Barth's chief envied his; the village sits at 2110 m) | A shoulder cloak on roughly a third of the figures — the settlement palette's first cloth marks the notables — while the rest stand bare at the fire; the elder is always cloaked | `coldnessAt` · rank-gated · Barth (period, seasonality inferred from indicia) |
| West — Hausa Sahel | Hausa Village | "Only the wealthier amongst them can afford the **zenne** or shawl, thrown over the shoulder like the plaid of the Highlanders" — worn against the harmattan dawn cold, not a calendar | The same notable third gains the shoulder shawl exactly while the harmattan blows (late November to mid-March) and sheds it in the rains | `harmattanAt` · rank-gated · Barth (period, verbatim) |
| East — Somali Haud | Somali Village | "In cold weather the head is muffled up in it after the fashion of an Algerian 'burnouse'" — the **tobe** drawn over the head in the karif wind | A SHAPE change, not a colour: the figure's head disappears under the drawn-up wrap through the July–September karif | `karifAt` · everyone · Swayne 1895 (period, on this people in the game's own decade) |
| South — Zululand | Zulu Village | The greased **isipuku** ox-hide cloak, "worn by day in cold weather as a cloak by males and females" | Shoulder cloaks on all figures on cold highveld days | `coldnessAt` · everyone · Mayr 1907 (period, the one unambiguous case) |
| South — Kalahari | San Village | The **‡nau** skin cloak, closed "über beiden Schultern… unter dem Kinn zusammengeknüpft" in the cold configuration | Shoulder cloaks on cold nights' days — the cold Kalahari IS dressed, one of the two named traps resolved on evidence | `coldnessAt` · everyone · Passarge (period; weather link via Andersson's identical garment class) |
| South — Okavango | Wayeyi Village | The light **caross** "which they accommodate to the body according to the state of the weather" | Shoulder cloaks following the cold season | `coldnessAt` · everyone · Andersson 1856 (period, verbatim — the only case needing no inference) |

**What the table deliberately leaves out — and why that is a finding.** The
other sixteen peoples change NOTHING with the season, however cold their
ground gets: the research found no period evidence of a garment put on
seasonally, and the two named traps stay resolved as researched — the Pedi
highveld crosses the cold threshold but is NOT dressed (the famous blanket
belongs to the Basotho, a people the game lacks: "Lesotho is not Zululand"),
and the Sahel harmattan wrap beyond the Hausa zenne was ruled EVIDENCE
ABSENT — do not invent. Where the seasonal claims found were 20th-century
tourism copy (Tuareg), they were discarded.

**Where the season shows instead of on the body.** The inversion found in
`docs/peoples-1890.md` §7 — across seven period observers, not one describes
a person putting ON a seasonal garment; the signal is displaced onto fire,
hut, week and landscape — is implemented as exactly that displacement (TASKS
point 142):

- **Fire:** every village fire burns visibly harder under the place's own
  cold, harmattan or karif (`fireBlaze`, live-checked: the Tuareg January
  fire at 1.5× against the seasonless Congo basin's 1.04×).
- **Presence:** the transhumant peoples thin in their away season while the
  children and the elder remain — Maasai (dry-season herding camps), Tuareg
  (caravan months), and the Sahel farm peoples Bambara, Hausa and Mandinka
  (rains in the fields); the sedentary Bemba never thin, and that negative
  is asserted in the tests.
- **Market:** the Sahel stall's grain mound shrinks through the hungry rains
  and refills at the harvest — the best-evidenced finding of
  `docs/peoples-1890.md` §3.1 (the hungry season is the RAINS, not the dry).

**The burning of the steppe (point 145a; `docs/peoples-1890.md` §7.4).** The
grass fire is a season phenomenon before it is a drama: it exists only where
the grass has CURED — the Sahel and congo-north belts in their dry season
(`grassFireEligible`, pure-tested: never the Congo, never a rainless desert,
never the rains) — and its blackened band is the landscape Dybowski described,
"the whole landscape with an aspect of mourning".

**The rinderpest years (point 133; `docs/peoples-1890.md` §5).** The
panzootic reaches the game as a date-dependent vignette phase, not a dress
change: `rinderpestPhase` (src/systems/rinderpest.ts, pure-tested) maps
people and date to clean/preDamaged/struck/aftermath — Maasai pre-damaged
1890, struck 1891–92 (the German struck text carries Baumann 1894:31–32
verbatim), aftermath after; Sidama struck through the Kifu Qen to 1892;
Nubians in Sanat Sitta's wake all window; Zulu/Pedi/San clean until the
boundary-exact March 1896; the camel peoples never (FAO immunity); the
cattle-less Bemba never (tsetse belt — game depletion, a texture). §16
carries the vignette wiring; no rinderpest→dress link is asserted (evidence
absent — only the buffalo-hide shield supply collapse is sourced, kept as
texture). The wildlife toll (Baumann: "nicht nur Rinder, sondern auch
Büffel, Gnus und Antilopen") lies on the ground in the STRUCK years: within
the struck village's radius the chunk spawn seeds dead wildebeest and
antelope on ANY nearby land — not only savanna, so the rocky Maasailand
(Kilimanjaro/Meru) shows it too — worked by the ordinary scavenger/vulture
systems, and visible at the standard bird's-eye zoom (point 168) without
travelling out to wider country.
- **Rank as class experience:** the gate keys on the settlement palette's
  first cloth, so about a third of the figures carry the plaid while the
  rest stand bare at the fire — Barth's class split, not a uniform issue.

**The open edge.** The one reading the research allows but the figures
cannot yet show: a wrap worn DIFFERENTLY in the cold (drawn tight, closed
under the chin) rather than in greater number — recorded as §19.13's open
line. And the seasonal DRESS is only for peoples with period evidence;
everything else here (fire, presence, market) runs for every settlement from
its own coordinates.

## 20. Core Gameplay Loop

1. Port city (first-person): buy equipment, gifts, weapons, canteen, rope, canoe, provisions; possibly take a ferry. Entering the port city saves automatically (checkpoint).
2. Head for a region (bird's-eye view, 3D); carry the terrain-appropriate item.
3. Enter a village (first-person): visit the chief's hut.
4. Culturally correct gift → hint into the chronicle.
5. Decipher the region's language/direction system, decode the hint, determine the target position.
6. Travel to the target position, mind the terrain items, dig with the shovel → treasure.
7. Sell treasure finds region-wisely at the bazaar.
8. Manage health and time.
9. Turn discoveries into money at the ports.
10. Triangulate several hints → find the tomb → victory.

---

## 21. Debug Menu

A debug menu opened with F1. All settings take effect immediately on the running game; no restart needed.

### 21.1 Shortcut keys

- **F1** opens/closes the debug menu.
- **F2** toggles the journal do-not-disturb option (§16).
- **F3** grants the full loadout: every piece of equipment, all treasure types, 100000 gifts, 100000 dollars and 100000 provisions, full health, a full canteen and no afflictions (fever/dehydration/sun blindness/wounds cleared). The inventory capacity is raised to fit everything, and the extended zoom of §21.4 is unlocked along with it.
- **F4** toggles the canoe in and out of the pack (for quickly testing water travel and the on-land penalty).
- **`+` and `-` step the year**, inside the game's window 1890..1895, keeping the month and day; at either end they do nothing (there is no 1889 and no 1896). The numpad's `+`/`-` work too, on any layout.
- **The number row jumps the months** (for stepping through the seasons of §19.13): the twelve adjacent keys left to right — on a German keyboard `1 2 3 4 5 6 7 8 9 0 ß ´` — jump to January … December of the CURRENT in-game year, landing mid-month. The year is deliberately kept, so stepping the seasons never ends the expedition. Bound to the physical keys of the row, so the same twelve keys work on any layout.

### 21.2 Tunable values

- Walking speed of the player character inside settlements (villages and port cities).
- Walking speed of the player character outside settlements (travel across the continent; the default overland pace is calibrated on the calm side).
- Movement-factor tuning for the terrain relief items (§11): the factor by which a canoe speeds up water travel, and the penalty factors by which the jungle without a machete and the mountains without a rope slow the traveller.
- The swimmable coastal band width (§11.2): how far off the coast the sea can be swum before the open ocean blocks.
- Mouse-look sensitivity in the first-person view.
- Ambience volume (default 0.1): one control for the whole soundscape — the noise beds (wind, surf, crowd murmur), their gust/swell modulation and the proximity animal calls all scale together.
- Speed of food consumption while walking; at 0 the food supply lasts forever.
- Days of provisions one purchased food unit grants (§9; four weeks by default).
- Speed of the canteen's water consumption per travelled day, split into the land rate and the (faster) desert rate (§6), and the canteen's capacity — a full canteen lasts capacity ÷ consumption travelled days.
- Natural wound-healing durations (§6): the days until a light wound closes on its own and until a severe wound eases to a light one.
- Strength of the seasonal weather look (§19; 0 disables it, 1 full, default 1).
- Input fields for cash, gifts and food.
- Input field for the inventory capacity.

### 21.3 Toggles, tools and view

- Checkbox: random events can occur (§14), on by default.
- One button per kind of random event (§14) to trigger it immediately.
- Checkbox: show all hidden objects (position of treasure/tomb, caches etc.), off by default.
- Checkbox: frame counter (FPS display in the corner of the screen), on by default.
- Checkbox: do not disturb with journal entries (§16), off by default; also toggled with F2. New entries then neither open the journal nor auto-narrate.
- Checkbox: temporal anti-aliasing (TRAA, §2.7), on by default; when off, anti-aliasing falls back to the render pass' multisampling.
- Instant jump to any NAMED map point via a dropdown selector: ports, villages, mountains, waterfalls, lakes, the built cultural landmarks and the natural sites, plus the elephant graveyard and the tomb. The entries are grouped by category (in that order) and sorted alphabetically by their localized name within each group.
- Add any item to the inventory, via dropdown selectors (equipment, gifts); if this overfills the inventory, the inventory capacity increases automatically to match.
- Season selector for testing (§19): the seasonal weather follows the calendar by default and can be forced to dry season, transition or rainy season.
- Language selector for the game language (English/German; default English, §17).
- Read-only display of the active render backend (WebGPU, or WebGL 2 after the fallback of §1).

### 21.4 Zoom

- Mouse-wheel zoom in the bird's-eye view is always available (zooming in well below and — when unlocked — well beyond the default camera distance, far enough to take in the whole continent).
- Checkbox: allow zooming out beyond the default level, off by default; without it, zooming out stops at the default distance, and disabling the checkbox clamps a wider view back to it. Zoomed-in views are never reset.
- In the zoom range only the unlock reaches, no haze is shown: the fog recedes to the horizon and the ground haze fades out (both return as the zoom drops back); out there a coarse far-terrain sheet depicts the land beyond the detailed surroundings, and the sea lies glassy calm.
- Walking while zoomed out keeps the picture consistent: the sea surface stays aligned with the land, the far sheet matches the detailed ground's tone (it bakes in the ground textures' mean response), and beyond a zoom threshold the chunk-bound dressing (trees, rocks …) hides — it only ever surrounds the traveller and would otherwise read as a dressed rectangle on the sheet; it returns as the zoom drops back. The dressing streams zoom-aware: every plant within a generous circle — the scene fog far plus a margin, capped for cost — is drawn, a radius that always EXCEEDS the camera frustum, so the streaming edge sits beyond the rendered frame and a plant never appears in sight at any zoom (point 171 corrected an earlier version that sized the circle to an assumed view of 100×zoom and popped at a wide zoom, where the ground is visible far past that — the real limit is the frustum, since the fog is pushed to the horizon at a wide zoom). The per-chunk fill runs nearest-first, so the instance buffer covers the nearest, on-screen plants first and drops only the farthest, off-screen ones rather than fraying a ragged edge into view. The placement is rebuilt only once the traveller has moved a hysteresis step — so driving back and forth across a chunk boundary no longer makes the far plants jump in and out (point 164). The guarantee is verified by the PICTURE: plants are projected to the screen and none may appear inside the frame while driving.
- The sea reads as plain ocean out to the widest view's horizon: beyond the elevation dataset's edge the water renders as uniform deep ocean (never clamped edge streaks or false shallow blocks), and open-sea land trimmed from the map (§3.1) lies under the same deep tone. Trimmed scraps right at a kept shore (coastal spits, lagoon bars) instead blend into the local shelf depth — the coastal depth tint stays a smooth shallow-to-deep gradient with no dark holes where the dataset's spits were removed.
- Leaving the zoomed view for a settlement never harms the first-person picture: walls and objects render correctly at close range.
