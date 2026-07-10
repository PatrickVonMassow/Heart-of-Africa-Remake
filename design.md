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

### 2.3 Switching (walk in, walk out)

Entering and leaving a settlement happen purely through movement, without a dedicated key:

- In the bird's-eye view, walking onto a settlement's position enters it and switches to the first-person view.
- Inside, walking beyond the settlement's walkable edge leaves it and switches back to the bird's-eye view with the field of view around the current position — there is no exit archway and no "leave" key.
- To avoid an accidental bounce straight back in, a settlement just left is briefly closed to re-entry: walking directly back toward it does not re-enter it. Re-entry re-arms only once the traveller has moved clear of the settlement (a short clearance beyond the enter radius, a calibratable balance value); after that, walking back onto its position enters it again as usual.
- Likewise the enterable buildings (trade, service and audience buildings) are opened by walking up against their entrance door, the same deliberate opening the inhabitants use; no key press is required. Only the village elder is addressed with the interaction key.

### 2.4 Graphics and atmosphere

Villages and their inhabitants are styled typically for their region (building style, clothing, vegetation matching desert, savanna, jungle, highlands, lakes/rift). Port cities appear wealthier (solid, larger buildings, busy activity), villages closer to nature (simple, region-typical dwellings). The presentation creates a fitting atmosphere for each settlement and region.

### 2.5 Surroundings panorama (first-person)

The background of the first-person view plausibly matches the landscape one would see at this spot in the bird's-eye view:

- The real map terrain around the settlement's position is rendered as a distant panorama — mountains and ridges, river courses, lakes and the sea appear where they actually lie, in their biome colors, with exaggerated relief so they read at person scale.
- The relief is capped so that even a mountainous surrounding (e.g. the Atlas behind Berber Village) reads as a distant range on the horizon rather than looming up and arcing over the camera; the panorama surface is drawn double-sided so steep far slopes never show as dark overhanging gaps.
- Distant wildlife moves through the panorama: far-off, region-typical animals (elephants, giraffes, zebras in the savanna; antelope near the desert) drift slowly as silhouettes beyond the settlement edge.

### 2.6 Lively, densely built settlements (first-person)

Settlements do not read as a sparse cluster of a few functional buildings but as believably inhabited communities. The presentation effort inside settlements is considerably higher:

- Considerably more buildings than the functional ones (§9): besides the enterable trade, service and audience buildings there stands a clear majority of purely residential and auxiliary buildings — dwellings, granaries, animal pens, workshops, tents, storage buildings — which the player cannot enter. Density, size gradation and arrangement are region-typical (see §2.4, §4.5) and procedurally varied per settlement (§18); port cities are built more densely and more massively than villages.
- Streets and paths open up the settlement: a recognizable path network connects buildings, squares and the settlement edge. Material and routing match the region (dusty tracks, stamped clay paths, busy harbor lanes). The paths structure the settlement and guide the movement of both player and inhabitants.
- The inhabitants visibly go about their business and move believably through the settlement: they walk along the paths, linger and work at squares (§19.10 village and market life), and enter and leave the dwellings in which they live. They thus do not appear as static props but as part of a living everyday routine — the settlement must recognizably feel "inhabited".
- The functional, enterable buildings remain clearly recognizable despite the denser fabric and stand out from the non-enterable buildings (§17: highlighting of the important buildings).
- Collision inside settlements: buildings and solid objects (huts, granaries, tents, fences, trees, rocks, fire pit and the like) are physically impenetrable. Neither the player character nor the inhabitants walk through them; movement slides sideways along obstacles instead of stopping dead. The collision clearance is large enough that the camera never clips into a building even when pressing against walls or corners — the player must never see the inside of a building from outside. The inhabitants avoid obstacles on their ways or at least never remain permanently stuck on them. Paths, squares and the accesses to the enterable buildings always remain walkable.
- Inhabitants enter their dwellings: the entrance door is the one deliberate opening in the otherwise impenetrable buildings — an inhabitant returning home visibly walks up against the entrance door, slips through it and disappears inside the dwelling, and later steps out through the same door again. The player cannot use the dwellings' doors; the non-functional buildings stay non-enterable for the player. The functional, enterable buildings, by contrast, are opened by the player the same way: walking against their entrance door opens the trade or audience window (see §2.3).
- Every building is oriented so that its entrance door is reachable — the door opens onto free ground (a path, square or open lane), not against a neighbouring wall, a fence without a gap, or the settlement edge. This holds for the inhabitant-only dwellings as much as for the functional buildings: each resident must be able to stand at its own door to enter and leave. The procedural layout rotates a building when its natural facing would seal the door, and keeps every door's approach clear of later-placed objects.

The contrast between the wealthy, busy port city and the nature-bound village is reinforced by this denser, livelier presentation.

### 2.7 Lighting and post-processing pipeline

Image quality rests not only on geometry and material quality but on a full lighting and post-processing chain:

- Image-based lighting: an HDRI sky serves as the environment light source (IBL) for physically plausible material reflections; the visible sky follows a physically grounded atmosphere/scattering model instead of a simple gradient, consistent with the sun position.
- Shadows via cascaded shadow maps (high resolution near the camera, soft edges), tuned for both perspectives.
- Post-processing: screen-space ambient occlusion (SSAO/GTAO), bloom, temporal anti-aliasing, filmic tone mapping with color grading; a subtle vignette and depth of field are permissible but must not reduce the readability of the map view.
- Water: screen-space reflections, refraction with depth-dependent absorption (shallow water lighter/greener, deep water dark blue), a wave field (e.g. Gerstner) and foam along shores and wave crests.
- Distance fog is replaced by — or combined with — the atmospheric scattering; the regional climate moods of §19 remain as a modulation on top.

---

## 3. World Model and Map

### 3.1 Fixed geography, procedural variation

- Fixed continent of Africa: the geographic location of all landscape elements (coasts, rivers, jungle, mountains, lakes, landmarks, settlement sites) is fixed. The concrete appearance of the landscape, and the look of the villages including the distribution of their huts, are however determined procedurally in every playthrough (§18). In addition, movable goals (the tomb, buried treasures) are placed anew each game.
- The world reproduces Africa geographically authentically as it was in the year 1890. The real landmarks of §4.4 lie at their correct geographic positions.

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
Masai, Bantu, Zulu, Bushmen, Batwa, Lunda, Pygmies, Swahili, Somali, Hausa, Mongo, Sidamo, Banda, Nubians, Tuareg, Berbers, Bombara, Mandingo, Bemba, Bambundu, Uganda, Fang.

### 4.3 Rivers (17)
Basis of the direction/location hints (mouth/source); navigable by canoe.
Blue Nile, Nile, White Nile, Jubba, Ruvuma, Zambezi, Limpopo, Vaal, Orange, Sankuru, Kasai, Ubangi, Congo, Benue, Volta, Niger, Senegal. Each river has one named source and one named mouth location.

### 4.4 Landmarks
Lakes (Lake Chad, Lake Tana, Lake Albert, Lake Edward, Lake Victoria, Lake Rudolf, Lake Tanganyika, Lake Nyasa), mountains (Toubkal, Emi Koussi, Kilimanjaro, Mount Kenya, Mount Elgon and others), waterfalls (Stanley, Livingstone, Kabalega, Victoria, Augrabies Falls). Special site: the Elephant Graveyard (valuable ivory) — recognizable at a glance in the bird's-eye view by a field of fallen, bleached elephant carcasses and ivory tusks and bones strewn across a pale, bone-littered patch of ground. Digging it with the shovel frees a random haul of ivory each time — a rolled amount averaging about five pieces — drawn from the site's limited supply until the bones hold no more.

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

### 6.1 Resources

- Currency: \$ (means of payment in the port cities). Starting capital \$250. Used for: equipment, provisions, ferries, gifts; income through sales and discovery bounties.
- Provisions (food): consumed per time step; can be bought.
- Water: the canteen holds a fill level (a percentage). It refills to full at fresh water (river, lake, swimmable sea), drains slowly on land — faster in the desert — and, once empty, thirst builds and then health drops. The inventory bar shows the fill and warns as it runs low (glow yellow below 20 %, red below 5 %, blinking when empty). It protects against dehydration in the desert only while it still holds water.
- Gifts: trade goods for chiefs; they create goodwill and unlock hints. They are also the means of payment in the native villages (money has no value there).
- Item effects are possession-based: a piece of equipment in the inventory acts on its own — there is no "taking an object in hand". What is carried (§7) decides terrain mobility (§11), protection in events (§14) and treasure recovery; consumables and tools are used by clicking them in the inventory bar (medicine cures, the map opens the exploration overview, the shovel digs).

### 6.2 Afflictions and healing

Afflictions alter controls/vision and can be fatal:

- Fever/illness (mainly in wetlands) → temporarily uncontrolled movement.
- Dehydration (desert without water) → drift; avoidable with a filled canteen.
- Sun blindness (desert) → restricted vision, can end fatally — the canteen does not help against it; recovery only outside the desert.
- Wounds (animals/robberies) — wounds also mend on their own while the traveler is fed: a severe wound subsides to a light one and a light wound closes over days (calibratable), so recovery without medicine is possible; medicine remains the instant cure.
- Medicine cures fever and wounds.
- Loss of the expedition → a successor takes over.

### 6.3 Camps (item caches)

Inventory caches relieve the limited inventory and allow, for instance, leaving the canoe behind when moving away from waterways (on land it causes a speed penalty, §7, §11).

- Free camp: in the bird's-eye view a camp can be pitched anywhere in the open, holding any number of inventory items. It is marked with an X on the map. Such a camp can however be looted; items stored there are not safe.
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
| Map | Orientation aid; clicking it in the inventory bar opens the exploration overview |
| Canoe | Fast, safe travel on rivers/lakes (the rifle also stays usable there); on land it slows the traveler markedly (a hint names it). Without a canoe, water is slower, more exposed to the current and to crocodiles |

Core rule: a carried item acts by mere possession — it decides terrain mobility and treasure recovery, and a weapon (rifle or machete) in the pack protects against wild-animal attacks, the rifle more strongly than the machete (§14). There is no "in hand" state.

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

Villages and port cities contain various building types. In the first-person view they are enterable. In a buy dialog the goods are laid out as a table: item name, the price aligned in its own right-justified column, and the buy action — so the prices read straight down the column. Every trade dialog also offers to buy the traveler's gear back, paid in the settlement's currency.

Every settlement — port city or native village — offers at least the baseline goods for purchase: food, a machete, a shovel and medicine. In port cities the currency is money; in native villages it is gifts (money is worthless there, design.md §6), and a village trading post barters these goods for gifts. Selling gear likewise yields money in a port and gifts in a village.

| Building | Function |
|---|---|
| General store | Sells medicine, gifts, map |
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
- Discovery bounty: money is paid for reported discoveries (new villages, landmarks). It is credited on the next port visit as a telegraphic transfer waiting at the port, and the chronicle entry names exactly which discoveries earned it and the amount. The discovery itself is a journal moment too: the first sighting of a landmark is announced with its own entry, flavored by what was found — a mountain rising against the sky, a thundering waterfall, a sea-like lake, the elephant graveyard.

---

## 11. Terrain and Movement

| Terrain | Relieving item | Without / with |
|---|---|---|
| Desert | Canteen (with water) | without water: dehydration (drift), speed loss; with a filled canteen: no dehydration. Sun blindness threatens regardless; the canteen does not help against it |
| Jungle | Machete | without: nearly impassable; with: traversable |
| Mountains | Rope | without: passable but slow and dangerous — the traveler is warned, then risks a fall on the rock (a light or severe wound, possibly losing a carried item); with: safe and faster |
| River/lake | Canoe | with: fast, safe water travel; carried on any land (desert/savanna/jungle/mountain): marked speed penalty |
| Savanna/open | Rifle (outside villages) | without: higher robbery risk. Carrying the canoe here slows travel |
| Dig site | Shovel | without: no find; with (click the shovel): dig it up |

Movement happens in the bird's-eye view; the terrain is rendered in 3D, the controls remain top-down oriented.

### 11.1 Visible slowdown reason

Whenever the current terrain slows the traveler and the relieving item is not carried — dense jungle without a machete, water without a canoe, mountain rock without a rope, or the canoe carried across any land (it is dead weight on land — desert, savanna, jungle and mountain alike) — the bird's-eye view shows a short hint that names the cause and the item that would relieve it. A movement penalty is never silent; the player can always see why progress is slow and which item to pack.

The very first time each of these slowdowns is met, it is also announced once in the journal (a short entry naming the terrain and the missing item); every later encounter of that same kind is carried only by the standing status-bar hint, so the chronicle is not filled with repetitions. The "first time" is remembered per penalty type and travels with the checkpoint.

### 11.2 Movement boundary

Movement is restricted to the continent and its inland waters (rivers, lakes). Sea water that lies within the continent's outline — bays, gulfs and straits cutting into the landmass — counts as inland water and can be swum through (or crossed by canoe) like a river or lake. The open ocean beyond the continent's outline is not navigable; the continent cannot be left.

### 11.3 Water, current and waterfalls

Current and gameplay:

- Waters carry a current, which is especially strong in the immediate surroundings of waterfalls (§4.4).
- Moving with the current is faster, against it slower, and even an idle traveller on a river is carried downstream. Because the drift covers real distance, it consumes time and provisions exactly as travelling that stretch of water would — the current never moves the traveller for free.
- There is a risk of being swept over the falls — with injuries and the loss of a large part of the inventory.
- You can also move through water without a canoe, but you are slower and more exposed to the current. There is additionally the risk of being attacked by a crocodile and being injured or eaten. Without a canoe the rifle gets wet in the water and is then useless; only a machete reduces the risk. In the canoe the rifle stays dry and works as usual.

Visual water realism:

- Water follows the height profile of the map: rivers lie in beds carved into the local relief, and their surface sits just above that carved bed for the whole length of the river, so the water reads as one continuous, unbroken ribbon that descends overall from source to mouth (never sea-level canyons through the highlands, and never buried where the ground rises).
- A stray point that the biome map misclassifies as sea mid-river is bridged rather than tearing the ribbon; only the true mouth, where the river reaches the sea, ends it.
- The surface itself is calm (only slight movement, no ocean-style wave field) with a recognizable downstream current (drifting streaks) that visibly accelerates at rapids and waterfalls.
- Waterfalls (§4.4) are rendered as white cascades with plunge-pool foam and mist; rivers that rise in open land show a spring at their source.
- Lakes are flat surfaces at their local shore height, laid just above the highest point of their carved bed — the bed never shows through the water sheet.
- Further realism measures: foam along river banks, depth-tinted beds, glossy sky reflections on open water and a subdued ocean swell.

---

## 12. Audience with the Chief

Access to hints leads through the chiefs, in the chief's hut of a village (first-person view). Procedure:
1. Enter the village.
2. Visit the chief's hut, audience.
3. Present a culturally fitting gift → goodwill.
4. With sufficient goodwill: a hint about the tomb/treasure (into the chronicle, §15).
5. Wrong behavior: hostility, expulsion.

**Honored Friend.**
If you satisfy a chief correctly repeatedly, he bestows the status of "Honored Friend". It applies to all villages of the respective region (North, West, Central, South, East). Like every event, the bestowal is communicated through the journal: a new entry opens in which the chief pledges that his people will protect the traveler from now on. Committing a robbery forfeits this status irretrievably.

Effect: in the immediate surroundings of the region's native villages, the natives protect the traveler from attacks by animals and robbers (§14); he can then at most be lightly injured. If he is close to death, inhabitants hurry over with food, water or medicine. In addition he always receives food, water and medicine free of charge in the villages of the region. Each such event is communicated via a journal entry. Typically an entry reads like "I was attacked by lions. A group of the … people rushed to my aid at once and saved me from the attack. I was only lightly injured."

**Robbery and reputation.**
With a rifle in the pack, the chief's audience offers to rob the hut. Because the deed is irreversible, it takes a deliberate safety confirmation first (a warning naming the consequences, with a confirm/cancel choice). The haul is deliberately rich — a large sum of money, trade goods up to the pack limit, and provisions — so that a robbery can genuinely pay off despite its heavy cost; the chronicle reports exactly what was taken. This permanently antagonizes all villages of the region: afterwards no hut of the region can be entered anymore, and the chiefs give no more hints. A robbery also irretrievably forfeits the "Honored Friend" status — including its protection.

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

Hidden triggering per time step/region/condition.

### 14.1 Event kinds

- Wild-animal attacks (lions, cheetahs, leopards, hyenas and snakes): an attack can injure or kill. The predators differ in danger — the lion is the most likely to kill, then the hyena, then the leopard, and the cheetah is the least dangerous (it rarely presses an attack home). Carrying a rifle or machete in the pack lowers the risk — a rifle more than a machete. The chronicle reports the outcome in sentences like "I was attacked by lions.", "I escaped.", "I used the rifle." or "I was lightly injured.". Beyond the hidden roll, walking into any of the wandering predators in the bird's-eye view (§19) directly triggers that predator's attack (same outcome rules and protection).
- Robber attacks: can injure and steal inventory items. As with animal attacks, a machete lowers the risk, a rifle more so.
- Protection through "Honored Friend": near the villages of a region where you hold this status, the natives rush to help during animal and robber attacks; you can then at most be lightly injured (§12).
- Crocodile attacks in water: moving through water, a crocodile may attack and injure or eat you. Without a canoe the rifle gets wet and does not help — then only a machete lowers the risk; in the canoe the rifle works normally (§11).
- Current at waterfalls: near waterfalls the strong current can sweep the character over — with injuries and the loss of a large part of the inventory (§11).
- Illness/fever (climate/region dependent) → affliction (§6).
- Fever delirium → temporarily uncontrolled movement.
- Desert dangers: dehydration (avoidable with a filled canteen) and sun blindness (recovery only outside the desert, §6).
- Weather (e.g. sandstorm with loss of visibility).
- Finding caches/camps/remains.

### 14.2 Item protection

The fitting piece of equipment in the pack helps during events:

- Rifle or machete lower the risk of animal and robber attacks on land (a rifle more than a machete); the rifle deters thieves.
- Against crocodiles in water the machete always helps, a rifle only in the canoe (without a canoe it gets wet and fails).
- Medicine cures wounds and fever.
- The canteen protects against dehydration while it holds water (not against sun blindness).

### 14.3 Calibration

Concrete probabilities are calibrated freely for balance. They are tuned to keep events rare, so the journey is only occasionally interrupted (the POC's per-day base rates were lowered by a factor of five from an earlier, too-eventful calibration).

### 14.4 First-time danger warnings

The first time the traveller meets a danger situation, the journal warns of it once and names how to guard against it — a foresightful hint, not a reaction to an event that already struck.

- A warning never advises the traveller to use what they are already using: whoever crosses the first water with a canoe in the pack is told the crocodiles lurk but that the canoe keeps them out of reach, not to get one.
- Each warning fires only on its first occurrence (the "already warned" flags travel with the checkpoint, like the movement-penalty announcements of §11) and is written in both languages with voice markup (§15).
- The situations covered: setting out into the wilds without a rifle (wild-animal attacks — a rifle in the pack is the strongest protection, better than a machete); the first desert stretch (dehydration and sun blindness — a filled canteen holds off the thirst, and only leaving the desert cures the blindness); the first passage through water (crocodiles — a canoe carries the traveller across safely and keeps the rifle dry, otherwise only the machete helps); and the first fever-prone jungle (fever — medicine in the pack cures it).
- These proactive warnings are distinct from the movement-penalty hints of §11 (which concern slowdown, not attack or health danger).

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
- A newly appearing entry is read aloud automatically (no click required). While the browser's autoplay policy still blocks audio — before the first user gesture — the narration is not dropped but deferred: the newest entry (at game start, the departure entry) starts narrating with that first gesture.
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

The entries read like the moment they record: the first visit to a village is told through that people's own ~1890 way of life — every village carries its own historically grounded vignette (the indigo-veiled Tuareg, the Hausa dye pits, the Masai cattle ring, the Swahili coral-stone lanes …), never a shared boilerplate.

### 16.1 Non-modal journal

- The opened journal does not freeze the game: the character keeps moving in both perspectives while the journal is open and even while an entry is being read aloud — reading and narration never halt travel.
- Only the modal dialogs (trade, audience, camp and the like) block movement.
- Because the journal is non-modal, walking a building's entrance door open (§2) works with the journal open too — the door still enters and the book closes as the building's modal appears; the auto-opened journal never leaves a hut unenterable.

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

- Field of view of the surroundings; status bar with date, funds, provisions, gifts and the current region (no hand-object slot — item effects are possession-based, §6/§7).
- The coordinates are not shown permanently; they are read out on demand via the position query.
- The area freed at the top right of the status bar holds transient status displays — hints such as the reason for a movement penalty (§11) appear as a right-aligned item within the status bar itself (in the row with date/funds/region), not in a separate panel floating over the scene.
- The inventory bar shows the carried items; clickable ones act on click (medicine cures, the map opens the exploration overview, the shovel digs), the canteen shows its fill level, and treasures presented to a village trigger the §8 reaction.
- An item that is currently in use lights up (glows) in the inventory bar: the relief item countering the present terrain (the canoe on water, the machete in the jungle, the rope on a mountain) and medicine while a curable affliction (fever or a wound) is active — so the player sees at a glance which piece of equipment is doing its work right now.
- Further functions: chronicle, position query, health query, and pitch camp (§6, the camp button).

### 17.2 Discovery-gated labels

Map-point labels are gated by discovery: the floating name of a settlement or a natural landmark (village, waterfall, mountain, lake, river) appears only once the traveller has discovered it — a place once it has been visited, a landmark once it has been sighted (the same sighting that earns its discovery bounty, §10). Until then the point carries a muted "?" as its label instead of the name. The exploration overview likewise draws only the places already visited.

### 17.3 First-person UI

First-person view (settlements): walkable space, interaction prompts at buildings/persons, trade and dialog windows. A gift to a native additionally provides an orientation over the settlement's buildings, with the important, enterable buildings highlighted.

### 17.4 Layering

Modal windows (trade, audience, bazaar, travel agency, camp caches) and the full-screen overlays (start/load, victory, defeat) always render on top of everything else in the scene, including the floating building and place labels. A modal is never obscured by an in-world label. The chronicle/journal panel (docked on the right) does not extend to the bottom of the screen: it ends above the camp and journal buttons in the bottom corner, leaving a small gap, so those buttons are never covered.

### 17.5 Controls and focus

- Controls suitable for mouse/keyboard and gamepad. The chronicle/journal is opened and closed with the Tab key (gamepad: Y). Tab's default focus cycling is suppressed while playing so it does not shift focus onto UI controls; inside form controls (debug-menu fields, dialog inputs) Tab still navigates between them normally.
- Entering a settlement puts the focus straight on the controls: any lingering HUD button is blurred so the keyboard controls the character at once, without an extra click. Mouse-look (pointer lock) still engages on a deliberate click on the view — auto-capturing the cursor would make the non-modal journal and dialogs unclickable, so the lock stays an explicit choice.
- The GUI is a game surface, not a document: text in the interface cannot be selected/highlighted. Only editable form controls (debug-menu fields, dialog inputs) keep normal text selection.

### 17.6 Renderer notice

If the renderer has to fall back from WebGPU to WebGL 2 compatibility mode, a dismissible notice informs the player at startup.

### 17.7 Game languages

English (default) and German. The language can be switched at runtime (POC: via the debug menu, §21). All player-visible text — UI, chronicle, dialogs, names of places and landmarks — is served from language files; adding a further language must require nothing beyond a new language file. Every future addition or change to game text must always be made for both languages; translations are written for their context, not literally. Proper names are localized where established exonyms exist (e.g. "Kairo"/"Cairo", "Kilimandscharo"/"Kilimanjaro"). Journal texts additionally carry the emotional voice markup (§15) in every language; it is stripped before display and never shown to the player.

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

Complementary elements that reinforce the feeling of Africa, mostly without new mechanics. The wildlife interactions of §19.2–§19.8 are ambient scenery: they run without influence on the player — with the single exception that walking into a wandering predator triggers its attack (§14).

### 19.1 Soundscape and proximity calls

- Regional soundscape and dynamic music: distinct sound worlds per region (savanna insects and vastness, jungle with birds and monkeys, desert wind, drums near villages). Changes on region transitions and on perspective switches.
- On top of the regional bed, nearby wildlife is heard for what it is: an animal in the bird's-eye view near the traveller sounds its own call — an elephant trumpets, a hunting lion roars, grazers bark and snort, a wading flamingo flock chatters — growing louder as the player draws close and fading once it is left behind. These proximity calls count as ambience and are scaled by the single ambience volume along with the rest of the soundscape.

### 19.2 Living wildlife and streaming

- Living wildlife as scenery: non-threatening animals in the field of view (elephant herds, giraffes, and grazing herds of zebra, wildebeest, antelope and warthog on the savanna, flamingos at the lakes). Purely visual, anchoring place and region. The animals also interact with one another (say, a lion bringing down a grazer) — as ambient scenery.
- The scenery streams in and out with the journey: an animal is only removed once it is clearly outside the field of view, and how far that reaches is tied to the bird's-eye zoom (zooming out keeps animals alive that the default view would have dropped); an animal that merely passes across a tile boundary while still on screen is never culled.
- The hunting predator obeys the same rule: when its hunt is over it trots off away from the traveller and leaves the stage only well beyond the visible surroundings, and a hunt that strays likewise ends only past the view's edge — no animal vanishes in sight.
- The one exception is a dead animal, which — so its removal is not seen to pop away — dissolves on screen (eaten by lion or vulture) rather than vanishing; a carcass left far off the screen, which the single scavenger cannot reach in time, is instead culled silently, so kills never pile up without bound and choke the frame loop.

### 19.3 The predator hunt

- The lion is not the only hunter: each hunt a region-appropriate predator of ~1890 Africa appears — the lion everywhere, the cheetah and the spotted hyena on the open eastern and southern plains, the leopard in the wooded west and centre — and it takes prey from its own food web, so the whole forms a chain of predator → grazer → grassland.
- The big predators (lion, hyena) bring down the large grazers (wildebeest, zebra); the lighter cats (cheetah, leopard) take the smaller, faster game (antelope, warthog); and those grazers in turn feed on the grass they graze on the open land. Which prey a hunt takes is its predator's scheme intersected with what the region actually holds — wildebeest and zebra on the great eastern and southern plains, antelope and warthog more widely, with the arid north and the wooded west/centre offering a narrower range.
- Every one of these wandering predators attacks the player on contact (§14): walking into the active predator triggers its attack, rate-limited by the event cooldown. They differ in danger — the lion is the apex with the highest risk of a fatal outcome, then the hyena, then the leopard, and the cheetah is the least dangerous (timid toward people); the protection rules (§7/§14) apply to all of them. Away from a contact the predators remain scenery.
- The predator closes in on the prey from a random direction, so a hunt runs any which way across the plain rather than always toward the same corner; the fleeing prey does not run in a straight line but weaves left and right to try to shake the hunter, which pursues with a limited turning rate (sharp cuts throw it wide) yet is faster and closes in over time.
- When the predator has brought down prey, it visibly feeds on it (schematic: it stands over the fallen carcass with lowered, rhythmically tearing head movements, a red stain spreading beneath); the carcass shrinks away piece by piece while it eats.
- Yet the predator does not strip its kill bare: when it walks off, a small remnant of the prey stays behind at the site beside the stain, and the scavenger vulture later drops in on the scrap and finishes it.

### 19.4 Elephants and trampling

- Elephants move as herds — the members keep together and roam as a group (they are rarely seen alone), on a slow amble that only ever moves forward and changes direction in gentle arcs (no sharp turns, no strafing or backing up), staying on suitable ground (savanna and forest, where elephants occurred at the end of the 19th century, not the open desert).
- They do not hunt; a smaller animal is trampled only if it happens to be in the herd's path. A trampled animal stays dead on the ground over a red stain like a lion kill.
- Other animals try to get out of an elephant's way, but only at the last moment — they dart aside just before the herd reaches them and a touch slower than an elephant, so a head-on herd still tramples one now and then.
- A fleeing animal picks one steady escape direction — the combined push of every nearby elephant — rather than jittering back and forth between two of them.

### 19.5 Bodies and movement discipline

- Every animal carries one persistent visible facing that all its behaviors merely steer at a capped turn rate: the body never whips around when a behavior starts, ends or changes — the dodge disengages only well past its trigger ring, a finished flight leaves the animal facing where it ran, and an elephant always faces its line of travel.
- The animals have bodies: herd members spawn with natural spacing between them, and no animal stands in or walks through another — overlapping animals part at once. The one exception is the elephant trample itself, which by design walks straight over a too-slow smaller animal.
- Prey animals (zebras, wildebeest, antelopes, warthogs, giraffes) run away from a hunting or feeding predator — a smooth flight that accumulates into their movement, never a sudden jump to a new spot.
- Every blood stain is laid into the local slope of the ground (never as a horizontal disc that rising terrain slices into a half-moon).
- No animal ever strays into the impassable open ocean (§11): scripted prey balks at the waterline instead of fleeing into the sea, and any animal that ends up on open-ocean ground — pushed, fleeing or dodging — is set back to the nearest land at once.

### 19.6 Vultures and carcasses

- Vultures gather and circle above a lion kill.
- A carcass that was not eaten by the lion — a trampled animal, or any death other than being eaten — is not left lying forever: a vulture flies in, lands on it and feeds, and the carcass shrinks away piece by piece and is gone the same way a lion kill dissolves.
- No vulture ever pops into or out of the picture: every flight — the lone scavenger and the flocks over a kill or over an ailing traveller alike — appears beyond the visible surroundings (however far the current zoom reaches), flies in, and once its reason has passed flies off and vanishes only well outside the view again.
- Vultures at poor health: if the character is in poor health (§6), vultures circle above and follow them for a while — an atmospheric signal without its own mechanics.

### 19.7 Shore and grazing life

- Animals living near a river or lake periodically walk to the shore, lower their heads and drink before returning to the herd; grazing species dip their heads into the grass on open land; flamingos wade in the shallows.
- Beyond drinking, some shore visitors wade a little further into the shallow water and bathe — a low, splashing wallow rather than only lowering the head.

### 19.8 Family life in the herds

- A herd of several animals raises a juvenile (a small calf or foal) that keeps close to a parent and nurses beside it.
- When a predator closes on the young, its parent does not simply flee — it moves between the hunter and its calf to shield it, standing off just in front of the young and facing the danger down.
- When a hunt singles out the calf itself, the family does not stand frozen: the calf bolts and — slower than its hunter — is visibly run down in the open, while a parent runs alongside without ever abandoning it beyond a short escort distance; when the calf is seized, the parent therefore stands clear of, but near, the hunter.
- If the shield fails and a predator does catch a calf, the calf is not killed at once: it struggles for a few seconds first — no wound or bloodstain yet — and in that window its parents rush the predator. A parent that reaches it throws itself in and is taken in the calf's place, so the calf gets up and escapes; a parent that only gets close by the time the struggle ends is dragged down alongside the calf, and both are eaten.
- The calves are playful besides: on their own rhythm they break into short gambolling hop-bouts around the parent — and at a shore such a bout can carry a calf into the open water, where it struggles and drifts with the current. Its parent wades in after it, pulls it out on reach, and the two walk back to the bank together.
- The rivers keep their menace (§11) for the animals too: in the water close to one of the waterfalls, calf or parent is seized by the racing current and swept over the falls to its death — and a calf that goes over is followed by its parent, which plunges after it and dies with it.

### 19.9 Climate and landscape dressing

- Climate and environmental look: region-typical atmosphere such as heat shimmer in the desert, humid haze in the jungle and clear air in the highlands. Purely visual.
- Rich, region-typical landscape dressing in the bird's-eye view: beyond the base vegetation, the land is dotted with period-appropriate elements of its region — baobabs, termite mounds, kopjes (granite boulder piles) and occasional dead trees in the savanna, bare trees at the desert edge, papyrus and reed belts along rivers and lake shores. The open land must not read as barren.

### 19.10 Village and market life (first-person)

Inhabitants at everyday activities (cooking, weaving, livestock, playing children). Pure animation; makes settlements feel alive and underlines the contrast between the wealthy port city and the nature-bound village. Beyond lone activities, the inhabitants interact with each other and with the props, in ways fitting late-19th-century life in their region: pairs stand together in conversation, gesturing; a fire tender kneels at the fire pit stoking the embers; an inhabitant fetches a food bundle from its hut, cooks it over the fire and carries it back; grain is pounded with pestle and mortar; a drummer visibly plays the drums heard in the village soundscape; and water is drawn at the village well, with a carrier walking the jar home. Such vignettes are to be extended over time rather than reduced.

### 19.11 Journal illustrations and self-drawing map

- Illustrated journal entries: occasional hand sketches (an animal, a landmark, a face) beside the text, matching the handwritten presentation (§16).
- Self-drawing map: the map fills in while exploring as a hand-drawn sketch rather than mere fog removal; fits the exploration overview (§17).

### 19.12 No day/night cycle

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

### 21.1 Shortcut keys

- **F1** opens/closes the debug menu.
- **F2** toggles the journal do-not-disturb option (§16).
- **F3** grants the full loadout: every piece of equipment, all treasure types, 100000 gifts, 100000 dollars and 100000 provisions, full health, a full canteen and no afflictions (fever/dehydration/sun blindness/wounds cleared). The inventory capacity is raised to fit everything.
- **F4** toggles the canoe in and out of the pack (for quickly testing water travel and the on-land penalty).

### 21.2 Tunable values

- Walking speed of the player character inside settlements (villages and port cities).
- Walking speed of the player character outside settlements (travel across the continent; the default overland pace is calibrated on the calm side).
- Movement-factor tuning for the terrain relief items (§11): the factor by which a canoe speeds up water travel, and the penalty factors by which the jungle without a machete and the mountains without a rope slow the traveller.
- Mouse-look sensitivity in the first-person view.
- Ambience volume (default 0.1): one control for the whole soundscape — the noise beds (wind, surf, crowd murmur), their gust/swell modulation and the proximity animal calls all scale together.
- Speed of food consumption while walking; at 0 the food supply lasts forever.
- Speed of the canteen's water consumption per travelled day, split into the land rate and the (faster) desert rate (§6), and the canteen's capacity — a full canteen lasts capacity ÷ consumption travelled days.
- Natural wound-healing durations (§6): the days until a light wound closes on its own and until a severe wound eases to a light one.
- Input fields for cash, gifts and food.
- Input field for the inventory capacity.

### 21.3 Toggles, tools and view

- Checkbox: random events can occur (§14), on by default.
- One button per kind of random event (§14) to trigger it immediately.
- Checkbox: show all hidden objects (position of treasure/tomb, caches etc.), off by default.
- Checkbox: frame counter (FPS display in the corner of the screen), on by default.
- Checkbox: do not disturb with journal entries (§16), off by default; also toggled with F2. New entries then neither open the journal nor auto-narrate.
- Instant jump to any port city or village, the elephant graveyard, or the tomb, via a dropdown selector.
- Add any item to the inventory, via dropdown selectors (equipment, gifts); if this overfills the inventory, the inventory capacity increases automatically to match.
- Language selector for the game language (English/German; default English, §17).
- Read-only display of the active render backend (WebGPU, or WebGL 2 after the fallback of §1).

### 21.4 Zoom

- Mouse-wheel zoom in the bird's-eye view is always available (zooming in well below and — when unlocked — well beyond the default camera distance, far enough to take in the whole continent).
- Checkbox: allow zooming out beyond the default level, off by default; without it, zooming out stops at the default distance, and disabling the checkbox clamps a wider view back to it. Zoomed-in views are never reset.
- In the zoom range that only the unlock reaches (beyond the default distance) no haze is shown: the fog recedes to the horizon and the ground haze fades out, and both return as the zoom drops back; out there a coarse far-terrain sheet depicts the land beyond the detailed surroundings, and the sea lies glassy calm.
- Leaving the zoomed view for a settlement never harms the first-person picture: walls and objects render correctly at close range.
