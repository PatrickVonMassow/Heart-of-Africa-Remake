# The Heart of Africa — Remake: Design

This document describes the target state of a modern indie remake. It is based on the game mechanics of the original (see "The Heart of Africa — Complete Game Mechanics"); this document adopts those systems and fixes the decisions made for the remake.

---

## 1. Technical Framework Architecture

- Implemented as a web application with Three.js under React Three Fiber.
- Two presentation modes (§2): 3D bird's-eye view for the journey through Africa, first-person view inside settlements.

---

## 2. Perspectives and Camera

**Bird's-eye view (journey through Africa).**
Navigation across the continent works as in the original from a bird's-eye view, but the surroundings are rendered as 3D graphics (terrain, rivers, vegetation, landmarks). The camera follows the player character from above. Visible is a section of the map — the character's field of view, i.e. the surroundings of the current position within Africa.

**First-person view (settlements).**
On entering a village or a port city, the game switches to the first-person view. The settlement is walkable: you walk through it and to its buildings, buy and sell goods there (§9), and hold an audience with the chief in a village (§12).

**Switching (walk in, walk out).**
Entering and leaving a settlement happen purely through movement, without a dedicated key. In the bird's-eye view, walking onto a settlement's position enters it and switches to the first-person view. Inside, walking beyond the settlement's walkable edge leaves it and switches back to the bird's-eye view with the field of view around the current position — there is no exit archway and no "leave" key. Likewise the enterable buildings (trade, service and audience buildings) are opened by walking up against their entrance door, the same deliberate opening the inhabitants use; no key press is required. Only the village elder is addressed with the interaction key.

**Graphics and atmosphere.**
Villages and their inhabitants are styled typically for their region (building style, clothing, vegetation matching desert, savanna, jungle, highlands, lakes/rift). Port cities appear wealthier (solid, larger buildings, busy activity), villages closer to nature (simple, region-typical dwellings). The presentation creates a fitting atmosphere for each settlement and region.

**Surroundings panorama (first-person).**
The background of the first-person view plausibly matches the landscape one would see at this spot in the bird's-eye view: the real map terrain around the settlement's position is rendered as a distant panorama — mountains and ridges, river courses, lakes and the sea appear where they actually lie, in their biome colors, with exaggerated relief so they read at person scale. Distant wildlife moves through the panorama: far-off, region-typical animals (elephants, giraffes, zebras in the savanna; antelope near the desert) drift slowly as silhouettes beyond the settlement edge.

**Lively, densely built settlements (first-person).**
Settlements do not read as a sparse cluster of a few functional buildings but as believably inhabited communities. The presentation effort inside settlements is considerably higher:

- Considerably more buildings than the functional ones (§9): besides the enterable trade, service and audience buildings there stands a clear majority of purely residential and auxiliary buildings — dwellings, granaries, animal pens, workshops, tents, storage buildings — which the player cannot enter. Density, size gradation and arrangement are region-typical (see "Graphics and atmosphere", §4.5) and procedurally varied per settlement (§18); port cities are built more densely and more massively than villages.
- Streets and paths open up the settlement: a recognizable path network connects buildings, squares and the settlement edge. Material and routing match the region (dusty tracks, stamped clay paths, busy harbor lanes). The paths structure the settlement and guide the movement of both player and inhabitants.
- The inhabitants visibly go about their business and move believably through the settlement: they walk along the paths, linger and work at squares (§19 village and market life), and enter and leave the dwellings in which they live. They thus do not appear as static props but as part of a living everyday routine — the settlement must recognizably feel "inhabited".
- The functional, enterable buildings remain clearly recognizable despite the denser fabric and stand out from the non-enterable buildings (§17: highlighting of the important buildings).
- Collision inside settlements: buildings and solid objects (huts, granaries, tents, fences, trees, rocks, fire pit and the like) are physically impenetrable. Neither the player character nor the inhabitants walk through them; movement slides sideways along obstacles instead of stopping dead. The collision clearance is large enough that the camera never clips into a building even when pressing against walls or corners — the player must never see the inside of a building from outside. The inhabitants avoid obstacles on their ways or at least never remain permanently stuck on them. Paths, squares and the accesses to the enterable buildings always remain walkable.
- Inhabitants enter their dwellings: the entrance door is the one deliberate opening in the otherwise impenetrable buildings — an inhabitant returning home visibly walks up against the entrance door, slips through it and disappears inside the dwelling, and later steps out through the same door again. The player cannot use the dwellings' doors; the non-functional buildings stay non-enterable for the player. The functional, enterable buildings, by contrast, are opened by the player the same way: walking against their entrance door opens the trade or audience window (see §2 "Switching").

The contrast between the wealthy, busy port city and the nature-bound village is reinforced by this denser, livelier presentation.

**Lighting and post-processing pipeline.**
Image quality rests not only on geometry and material quality but on a full lighting and post-processing chain:

- Image-based lighting: an HDRI sky serves as the environment light source (IBL) for physically plausible material reflections; the visible sky follows a physically grounded atmosphere/scattering model instead of a simple gradient, consistent with the sun position.
- Shadows via cascaded shadow maps (high resolution near the camera, soft edges), tuned for both perspectives.
- Post-processing: screen-space ambient occlusion (SSAO/GTAO), bloom, temporal anti-aliasing, filmic tone mapping with color grading; a subtle vignette and depth of field are permissible but must not reduce the readability of the map view.
- Water: screen-space reflections, refraction with depth-dependent absorption (shallow water lighter/greener, deep water dark blue), a wave field (e.g. Gerstner) and foam along shores and wave crests.
- Distance fog is replaced by — or combined with — the atmospheric scattering; the regional climate moods of §19 remain as a modulation on top.

---

## 3. World Model and Map

- Fixed continent of Africa: the geographic location of all landscape elements (coasts, rivers, jungle, mountains, lakes, landmarks, settlement sites) is fixed. The concrete appearance of the landscape, and the look of the villages including the distribution of their huts, are however determined procedurally in every playthrough (§18). In addition, movable goals (the tomb, buried treasures) are placed anew each game.
- The world reproduces Africa geographically authentically as it was in the year 1890. The real landmarks of §4.4 lie at their correct geographic positions.
- Five regions, each with its own landscape, its own peoples and its own value profile: North (desert/Sahara), West (savanna), Central (jungle/Congo basin), East (mountains/lakes/rift), South (high plateau). The boundaries between the regions are visible in the game: as subtle dashed ink lines on the exploration map and as dashed ground markings over land in the bird's-eye view. Along the borders, the name of the region is shown on its respective side of the line (localized), both on the map and in the bird's-eye view.
- Terrain types: ocean, coast, desert, savanna/open land, jungle/grassland, mountains, water (river/lake).
- Coordinate system: position in degrees, displayed as "latitude … degrees north/south" and "longitude … degrees west/east". This system is also the basis of the hints (§13).

**Real geodata and terrain rendering.**
The landscape rendering is based on real geodata rather than purely synthetic noise:

- Elevation relief from a real digital elevation model (DEM, e.g. SRTM or Copernicus GLO-90), preprocessed into elevation tiles and streamed at runtime with levels of detail (LOD) around the player character. Characteristic relief forms (rift escarpments, high plateaus, dune fields, river valleys) are recognizable.
- Coast, river and lake courses from real vector data (e.g. Natural Earth, HydroSHEDS), adjusted to their ~1890 state (for instance the large Lake Chad outline, no modern reservoirs). The courses are smooth and fine-grained; visible raster steps on coasts and banks must not occur.
- Ground rendering via biome-based texture splatting with PBR materials (sand, savanna grass, laterite, rock, rainforest floor) and detail normal maps (triplanar) instead of plain vertex colors.
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
Masai, Bantu, Zulu, Bushmen, Batwa, Lunda, Pygmies, Swahili, Somali, Hausa, Mongo, Sidamo, Banda, Nubians, Tuareg, Berbers, Bombara, Mandingo, Bemba, Bambundu, Uganda, Fang.

### 4.3 Rivers (17)
Basis of the direction/location hints (mouth/source); navigable by canoe.
Blue Nile, Nile, White Nile, Jubba, Ruvuma, Zambezi, Limpopo, Vaal, Orange, Sankuru, Kasai, Ubangi, Congo, Benue, Volta, Niger, Senegal. Each river has one named source and one named mouth location.

### 4.4 Landmarks
Lakes (Lake Chad, Lake Tana, Lake Albert, Lake Edward, Lake Victoria, Lake Rudolf, Lake Tanganyika, Lake Nyasa), mountains (Toubkal, Emi Koussi, Kilimanjaro, Mount Kenya, Mount Elgon and others), waterfalls (Stanley, Livingstone, Kabalega, Victoria, Augrabies Falls). Special site: the Elephant Graveyard (valuable ivory).

### 4.5 Region Assignment
| Region | Landscape | Peoples |
|---|---|---|
| North | Desert/Sahara | Tuareg, Berbers, Nubians, Bombara |
| West | Savanna | Hausa, Mandingo, Fang |
| Central | Jungle/Congo basin | Mongo, Pygmies, Banda, Bambundu, Lunda |
| East | Mountains/lakes/rift | Masai, Swahili, Somali, Sidamo, Uganda |
| South | High plateau | Batwa, Bemba, Bantu, Zulu, Bushmen |

---

## 5. Time and Calendar

- Months (displayed, written out in the selected game language): January through December, with the year (start 1890).
- Time advances through travel and actions; long distances and difficult terrain cost more time.
- A multi-year deadline, communicated through staged messages: progress/reward on discovery, first warning, second warning, deadline expiry (defeat).

---

## 6. Resources and Conditions

- Currency: \$ (means of payment in the port cities). Starting capital \$250. Used for: equipment, provisions, ferries, gifts; income through sales and discovery bounties.
- Provisions (food): consumed per time step; can be bought.
- Water: the canteen is always full and protects against dehydration in the desert.
- Gifts: trade goods for chiefs; they create goodwill and unlock hints. They are also the means of payment in the native villages (money has no value there).
- The object held "in hand": the central interaction variable for terrain mobility (§11), the behavior of the natives (§12) and treasure recovery.

Afflictions (alter controls/vision, can be fatal): fever/illness (mainly in wetlands) → temporarily uncontrolled movement; dehydration (desert without water) → drift, avoidable with a filled canteen; sun blindness (desert) → restricted vision, can end fatally — the canteen does not help against it, recovery only outside the desert; wounds (animals/robberies). Medicine cures fever and wounds. Loss of the expedition → a successor takes over.

**Camps (item caches).**
Inventory caches relieve the limited inventory and allow, for instance, leaving the canoe behind when moving away from waterways (on land it causes a speed penalty, §7, §11).

Free camp: in the bird's-eye view a camp can be pitched anywhere in the open, holding any number of inventory items. It is marked with an X on the map. Such a camp can however be looted; items stored there are not safe.

Village camp: once you are an "Honored Friend" (§12) in a native village, you may store any number of inventory items there at any time; they never disappear. If however you forfeit that standing in this region through a robbery (§12), the items stored there are irretrievably lost.

---

## 7. Equipment and Effects

| Item | Effect |
|---|---|
| Rope | Ascent in the mountains; no mountain pass without a rope |
| Machete | Crossing jungle/dense grassland; also offers protection against animal attacks, though weaker than the rifle |
| Shovel | Digging up treasures and the tomb at marked sites |
| Rifle | Hunting and defense; offers the strongest protection against animal attacks on land — stronger than the machete (§14). Carried in hand it makes villagers flee and enables robberies in huts — with a permanent reputation loss in the settlement (§12) |
| Medicine | Cures fever/illness |
| Gifts | Trade goods for chiefs (goodwill, hints) |
| Canteen | Always full; protects against dehydration in the desert (not against sun blindness) |
| Map | Orientation aid |
| Canoe | Fast travel on rivers/lakes; carried on land = speed penalty |

Core rule: the held object simultaneously decides terrain mobility, the reaction of the natives and treasure recovery. If it is a weapon (rifle or machete), holding it in hand additionally increases protection against wild-animal attacks, with the rifle protecting more strongly than the machete (§14).

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

---

## 9. Building Types and Functions

Villages and port cities contain various building types. In the first-person view they are enterable.

| Building | Function |
|---|---|
| General store | Sells medicine, gifts, map |
| Travel agency | Ticket sales: passage to another port city |
| Bazaar | Buying and selling of treasure finds |
| Weapons hut | Sells rifle, machete |
| Tool hut | Sells shovel, rope, canteen |
| Market hut | Sells canoe, food |
| Chief's hut | Village only: audience with the chief to obtain hints |

---

## 10. Trade and Economy

- Places of trade: see §9.
- Means of payment: in port cities trade uses money, in native villages gifts (trade goods).
- Bazaar (treasure finds): offer an item → the merchant names a bid → accept or decline. If the item does not fit the regional value profile, it is rejected.
- Price logic: a base price per good; treasure finds additionally carry a regional factor and a buy/sell spread. Profit comes from regional arbitrage.
- Ferries (travel agency): passage between ports for a fee; saves time compared to overland travel.
- Discovery bounty: money is transferred for reported discoveries (new villages, landmarks); credited on the next port visit.

---

## 11. Terrain and Movement

| Terrain | Hand object | Without / with |
|---|---|---|
| Desert | Canteen | without: dehydration (drift), speed loss; with a filled canteen: no dehydration. Sun blindness threatens regardless; the canteen does not help against it |
| Jungle | Machete | without: nearly impassable; with: traversable |
| Mountains | Rope | without: no ascent / risk of falling; with: passable |
| River/lake | Canoe | with: fast water travel; on land: speed penalty |
| Savanna/open | Rifle (outside villages) | without: higher robbery risk |
| Dig site | Shovel | without: no find; with: dig it up |

**Movement boundary.**
Movement is restricted to the continent and its inland waters (rivers, lakes). Sea water that lies within the continent's outline — bays, gulfs and straits cutting into the landmass — counts as inland water and can be swum through (or crossed by canoe) like a river or lake. The open ocean beyond the continent's outline is not navigable; the continent cannot be left.

**Water, current and waterfalls.**
Waters carry a current, which is especially strong in the immediate surroundings of waterfalls (§4.4). Moving with the current is faster, against it slower. There is a risk of being swept over the falls — with injuries and the loss of a large part of the inventory.

Visually, water follows the height profile of the map: rivers lie in beds carved into the local relief and their surface descends monotonically from source to mouth — never sea-level canyons through the highlands. The surface itself is calm (only slight movement, no ocean-style wave field) with a recognizable downstream current (drifting streaks) that visibly accelerates at rapids and waterfalls. Waterfalls (§4.4) are rendered as white cascades with plunge-pool foam and mist; rivers that rise in open land show a spring at their source. Lakes are flat surfaces at their local shore height. Further realism measures: foam along river banks, depth-tinted beds, glossy sky reflections on open water and a subdued ocean swell.

You can also move through water without a canoe, but you are slower and more exposed to the current. There is additionally the risk of being attacked by a crocodile and being injured or eaten. Without a canoe the rifle gets wet in the water and is then useless; only a machete reduces the risk. In the canoe the rifle stays dry and works as usual.

Movement happens in the bird's-eye view; the terrain is rendered in 3D, the controls remain top-down oriented.

---

## 12. Audience with the Chief

Access to hints leads through the chiefs, in the chief's hut of a village (first-person view). Procedure:
1. Enter the village (not with a visible rifle — otherwise flight/blockade).
2. Visit the chief's hut, audience.
3. Present a culturally fitting gift → goodwill.
4. With sufficient goodwill: a hint about the tomb/treasure (into the chronicle, §15).
5. Wrong behavior: hostility, expulsion.

**Honored Friend.**
If you satisfy a chief correctly repeatedly, he bestows the status of "Honored Friend". It applies to all villages of the respective region (North, West, Central, South, East). Like every event, the bestowal is communicated through the journal: a new entry opens in which the chief pledges that his people will protect the traveler from now on. Committing a robbery forfeits this status irretrievably.

Effect: in the immediate surroundings of the region's native villages, the natives protect the traveler from attacks by animals and robbers (§14); he can then at most be lightly injured. If he is close to death, inhabitants hurry over with food, water or medicine. In addition he always receives food, water and medicine free of charge in the villages of the region. Each such event is communicated via a journal entry. Typically an entry reads like "I was attacked by lions. A group of the … people rushed to my aid at once and saved me from the attack. I was only lightly injured."

**Robbery and reputation.**
Taking the rifle in hand inside a hut lets you rob goods and take any quantity along. This permanently antagonizes all villages of the region: afterwards no hut of the region can be entered anymore, and the chiefs give no more hints. A robbery also irretrievably forfeits the "Honored Friend" status — including its protection.

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

### 13.3 Cascade and Time Limit
Per region, typically one people reveals the regional location hint; the others provide only unspecific knowledge. Several hints are triangulated into the exact position of the tomb.

---

## 14. Random Events

Hidden triggering per time step/region/condition:
- Wild-animal attacks (lions, leopards and snakes): an attack can injure or kill. With leopards the risk of severe injury or being eaten is lower than with lions. Carrying a rifle or machete lowers the risk — a rifle more than a machete; holding the weapon in hand lowers it further. The chronicle reports the outcome in sentences like "I was attacked by lions.", "I escaped.", "I used the rifle." or "I was lightly injured.".
- Robber attacks: can injure and steal inventory items. As with animal attacks, a machete lowers the risk, a rifle more so.
- Protection through "Honored Friend": near the villages of a region where you hold this status, the natives rush to help during animal and robber attacks; you can then at most be lightly injured (§12).
- Crocodile attacks in water: moving through water, a crocodile may attack and injure or eat you. Without a canoe the rifle gets wet and does not help — then only a machete lowers the risk; in the canoe the rifle works normally (§11).
- Current at waterfalls: near waterfalls the strong current can sweep the character over — with injuries and the loss of a large part of the inventory (§11).
- Illness/fever (climate/region dependent) → affliction (§6).
- Fever delirium → temporarily uncontrolled movement.
- Desert dangers: dehydration (avoidable with a filled canteen) and sun blindness (recovery only outside the desert, §6).
- Weather (e.g. sandstorm with loss of visibility).
- Finding caches/camps/remains.

Item help: the fitting piece of equipment helps during events, especially the one held in hand — rifle or machete lower the risk of animal and robber attacks on land (a rifle more than a machete; in hand more than merely carried); against crocodiles in water the machete always helps, a rifle only in the canoe (without a canoe it gets wet and fails); the rifle deters thieves; medicine cures wounds and fever; the canteen protects against dehydration (not against sun blindness).

Concrete probabilities are calibrated freely for balance.

---

## 15. Chronicle / Journal

An automatically growing narrative chronicle of the journey, written in the selected game language (English by default, German available, §17). Functions: mood carrier and store of the collected hints. Entries are produced from templates with places/directions inserted, and from events.

**Tone and immersion.**
The journal is the central means of creating immersion: many events are never seen, only experienced as text — comparable to reading a novel. The entries are therefore always written vividly and express, depending on the situation, fascination with the new, drama, bewilderment, misgivings, hope and the like. The text building blocks from which entries are assembled must already be written with this vividness — in every supported language.

**Emotional voice markup and read-aloud.**
The journal text building blocks are stored in every language file with a lightweight internal markup language that describes the emotional delivery: mood spans (`[awe]…[/awe]`, `[whisper]…[/whisper]`, `[excited]…[/excited]`, `[somber]…[/somber]`, `[weary]…[/weary]`, `[fear]…[/fear]`), word emphasis (`[emph]…[/emph]`), display-only passages (`[mute]…[/mute]`, e.g. meta notes like "(Checkpoint saved)") and beat markers (`[pause]`, `[breath]`). The tags are additive: stripping them must always leave well-formed prose, and the display pipeline shows only the stripped text — markers are never visible to the player.

For speech output the pipeline is parser → TTS text → audio: the parser converts the markup into prosody (real pauses, punctuation shaping such as "…" for hesitation or "!" for excitement, and per-passage speaking speed and loudness) so that "Today… at last. I have found the temple." sounds different from the same words read flatly. Journal entries are narrated with the Kokoro TTS model running in the browser: a newly appearing entry is read aloud automatically (no click required). While the browser's autoplay policy still blocks audio — before the first user gesture — the narration is not dropped but deferred: the newest entry (at game start, the departure entry) starts narrating with that first gesture. Every entry additionally offers a read-aloud control to replay or stop the narration. Kokoro currently provides no German voice, so narration is available in English only; German texts nevertheless carry the exact same markers so a German-capable voice can be plugged in later (open item).

**Every journal text — existing and future, in every language — is written with these emotion markers.**

**Entering a new region.**
On first entering a new region, the journal opens, announces the region and shows an entry describing the traveler's fascination with this region and its peculiarities.

**Death of the character.**
A dead character can write no more journal entries. Instead of an entry, a report appears that the explorer's remains have been found — a gruesome sight that hints at the cause of death (for instance, that he was eaten by lions).

---

## 16. Presentation of Events

Events (animal and robber attacks, chiefs' hints, status changes and the like, §14) are not staged as separate scenes. The player learns of them because the journal opens automatically and a new entry appears.

**Do not disturb.**
Players who do not want to be interrupted can turn the automatic presentation off (POC: debug-menu checkbox, also toggled with F2): with the option active, new entries neither open the journal nor start their narration — they are written silently and remain fully readable (and narratable) when the journal is opened manually. Turning the option off restores the automatic behavior.

The entry does not appear as finished text but is visibly written into the book in handwriting by a hand.

If the character is injured, the injuries are visible on the writing hand, at a recognizable severity: with a severe injury the hand is bloody, with lighter injuries correspondingly less marked. Example: the entry "I was attacked by lions and severely wounded." is written by a bloody hand. An entry written by a bloody hand accordingly contains traces of blood.

If the character can no longer write (death), the handwritten entry is omitted; instead the report about the found remains appears (§15).

---

## 17. User Interface

- Bird's-eye view: field of view of the surroundings; status bar with date, funds, provisions, gifts, hand object; display of the current region; coordinate display. Access to the chronicle and to objects (take an item in hand, view the map, take medicine). Further functions: position query, health query, pitch camp (§6), and an exploration overview showing how far the current region has been explored.
- First-person view (settlements): walkable space, interaction prompts at buildings/persons, trade and dialog windows. A gift to a native additionally provides an orientation over the settlement's buildings, with the important, enterable buildings highlighted.
- Controls suitable for mouse/keyboard and gamepad.
- If the renderer has to fall back from WebGPU to WebGL 2 compatibility mode, a dismissible notice informs the player at startup.
- **Game languages:** English (default) and German. The language can be switched at runtime (POC: via the debug menu, §21). All player-visible text — UI, chronicle, dialogs, names of places and landmarks — is served from language files; adding a further language must require nothing beyond a new language file. Every future addition or change to game text must always be made for both languages; translations are written for their context, not literally. Proper names are localized where established exonyms exist (e.g. "Kairo"/"Cairo", "Kilimandscharo"/"Kilimanjaro"). Journal texts additionally carry the emotional voice markup (§15) in every language; it is stripped before display and never shown to the player.

---

## 18. Victory/Defeat, Procedural Placement, Saving

- Victory: find and recover the procedurally placed tomb in time.
- Defeat: deadline expiry or loss of the expedition (→ successor).
- Procedural per game: the position of the tomb and of caches, the concrete appearance of the landscape, and the look of the villages including the distribution of their huts. The geographic location of the landscape elements (jungle, mountains, rivers etc.) remains fixed. Special find sites: the Elephant Graveyard, camps/caches.
- Saving: automatic on visiting a port city. The port cities act as checkpoints; manual saving is omitted.
- Loading: on loading, an overview of all port visits appears as a table with one row per visit. Shown are port city, date (in-game), money, food, gifts and health state; from these the player picks the state to continue from.

| Port city | Date | Money | Food | Gifts | Health |
|---|---|---|---|---|---|
| Cairo | Jan 3, 1890 | \$250 | 5 weeks | 2 | healthy |

---

## 19. Atmosphere and Immersion

Complementary elements that reinforce the feeling of Africa, mostly without new mechanics.

- Regional soundscape and dynamic music: distinct sound worlds per region (savanna insects and vastness, jungle with birds and monkeys, desert wind, drums near villages). Changes on region transitions and on perspective switches.
- Living wildlife as scenery: non-threatening animals in the field of view (elephant and ungulate herds, giraffes, zebras, flamingos at the lakes). Purely visual, anchoring place and region. The animals also interact with one another (say, a lion bringing down a zebra) — as ambient scenery without influence on the player. When a lion has brought down prey, it visibly feeds on it (schematic: the lion stands over the fallen carcass with lowered, rhythmically tearing head movements, a red stain spreading beneath); the carcass shrinks away piece by piece while the lion eats, and once it is fully consumed the lion walks off and the scene despawns — only the stain briefly remains. Further interactions among the animals: elephant herds wander slowly (elephants appear where they occurred at the end of the 19th century — savanna and forest, not the open desert), and a smaller animal caught under a wandering elephant is trampled — it stays dead on the ground over a red stain like a lion kill; prey animals (zebras, antelopes, giraffes) scatter away from a hunting or feeding lion; vultures gather and circle above a lion kill. The animals also interact with the landscape: animals living near a river or lake periodically walk to the shore, lower their heads and drink before returning to the herd; grazing species dip their heads into the grass on open land; flamingos wade in the shallows (existing).
- Vultures at poor health: if the character is in poor health (§6), vultures circle above and follow them for a while — an atmospheric signal without its own mechanics.
- Climate and environmental look: region-typical atmosphere such as heat shimmer in the desert, humid haze in the jungle and clear air in the highlands. Purely visual.
- Rich, region-typical landscape dressing in the bird's-eye view: beyond the base vegetation, the land is dotted with period-appropriate elements of its region — baobabs, termite mounds, kopjes (granite boulder piles) and occasional dead trees in the savanna, bare trees at the desert edge, papyrus and reed belts along rivers and lake shores. The open land must not read as barren.
- Village and market life in the first-person view: inhabitants at everyday activities (cooking, weaving, livestock, playing children). Pure animation; makes settlements feel alive and underlines the contrast between the wealthy port city and the nature-bound village. Beyond lone activities, the inhabitants interact with each other and with the props, in ways fitting late-19th-century life in their region: pairs stand together in conversation, gesturing; a fire tender kneels at the fire pit stoking the embers; an inhabitant fetches a food bundle from its hut, cooks it over the fire and carries it back; grain is pounded with pestle and mortar; a drummer visibly plays the drums heard in the village soundscape; and water is drawn at the village well, with a carrier walking the jar home. Such vignettes are to be extended over time rather than reduced.
- Illustrated journal entries: occasional hand sketches (an animal, a landmark, a face) beside the text, matching the handwritten presentation (§16).
- Self-drawing map: the map fills in while exploring as a hand-drawn sketch rather than mere fog removal; fits the exploration overview (§17).

There is no day/night cycle: game time runs in fast-forward (about five years of expedition over great distances); a real-time daily cycle would create constant switches and needlessly prolong a game.

---

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

- Walking speed of the player character inside settlements (villages and port cities).
- Walking speed of the player character outside settlements (travel across the continent).
- Mouse-look sensitivity in the first-person view.
- Volume of the ambience noise beds (wind, surf, crowd murmur; default 0.2 — a fifth of their original loudness).
- Volume of the gust/swell modulation riding on the noise beds (a separate loudness source; default 0.2).
- Speed of food consumption while walking; at 0 the food supply lasts forever.
- Checkbox: random events can occur (§14), on by default.
- One button per kind of random event (§14) to trigger it immediately.
- Checkbox: show all hidden objects (position of treasure/tomb, caches etc.), off by default.
- Checkbox: frame counter (FPS display in the corner of the screen), on by default.
- Mouse-wheel zoom in the bird's-eye view is always available (zooming in well below and — when unlocked — well beyond the default camera distance). Checkbox: allow zooming out beyond the default level, off by default; without it, zooming out stops at the default distance, and disabling the checkbox clamps a wider view back to it. Zoomed-in views are never reset.
- Checkbox: do not disturb with journal entries (§16), off by default; also toggled with F2. New entries then neither open the journal nor auto-narrate.
- Instant jump to any port city or the tomb, via a dropdown selector.
- Input fields for cash, gifts and food.
- Input field for the inventory capacity.
- Add any item to the inventory, via dropdown selectors (equipment, gifts); if this overfills the inventory, the inventory capacity increases automatically to match.
- Language selector for the game language (English/German; default English, §17).
- Read-only display of the active render backend (WebGPU, or WebGL 2 after the fallback of §1).
