# design.md — reference records (read on demand)

Three blocks of `design.md` live here, **verbatim and under their own original
section numbers** (moved 27.07.2026, work-order point 367). They are reference
material a reader looks up when the work touches them, not target state read at a
glance, and together they were a tenth of the design document every other section
had to be read past. The split is the one that already worked for the acceptance
criteria's evidence chains (`docs/acceptance-evidence.md`, 26.07.2026): the numbers
do not change, `design.md` keeps a numbered pointer at each old place, and nothing
was reformulated on the way.

- **§19.14** — Research → game: the climate implementation record.
- **§19.15** — Research → game: the peoples implementation record.
- **§21.2** — The debug menu's tunable values.

The STANDING RULE of §19.14/§19.15 is unchanged by the move: both records stay
current in the SAME commit as any climate or people rendering change, and §21.2
stays current with the debug menu. `design.md` remains the sole source of the
target state — this file is part of it, one document further out.

---

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
| Zone geography incl. the traps (§1–§2): the Gabon coast has a HARD Jun–Sep dry season; the Horn runs Swayne's four seasons; Cairo is functionally Saharan | `climateZoneAt` rule boxes with the `atlantic-equatorial` zone (added when a sweep caught the Fang village classified into the Sahara) and the `horn` zone (added when the Somali village fell to the Congo fallback); `isHyperArid` keeps Cairo, the Libyan Desert and the west-coast Benguela fog deserts (the Namib and its Angolan Namibe/Iona continuation — a longitudinal exception the latitude-only rain curve cannot express) rainless in every month | every settlement swept into a plausible zone, live; Cairo asserted dry across all 12 REAL months; the coastal-desert grid asserted dry with the wet interior spared |
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

---

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

---

### 21.2 Tunable values

Every estimated balance value is editable here as a number field — that is the
binding contract of the calibration rule (all estimated values live centrally and
are adjustable at runtime). The complete set, grouped as the menu presents it:

**Movement and controls**

- Walking speed of the player character inside settlements (villages and port cities).
- Walking speed of the player character outside settlements (travel across the continent; the default overland pace is calibrated on the calm side).
- The strafe/backward factor (§2.2): the fraction of the forward speed at which the character sidesteps or walks backward, so a diagonal is never faster than straight ahead.
- Mouse-look sensitivity in the first-person view.
- The vertical look clamp in degrees from the horizon (§17.5): how far up and down the first-person view may pitch. It is calibratable, but structurally capped just short of vertical, so no value entered here can turn the world over.
- The inhabitant unstuck window (§2.6): the seconds a settlement walker may stay physically pinned before it is nudged to free ground.

**Loading** (§2.7)

- The loading picture's freeze budget in milliseconds: how long the picture may stand still while the game starts up. The verification binds this value, counting the WHOLE standstill — both a blocked main thread and a renderer stuck inside one long frame — so a busy renderer cannot excuse a freeze the player plainly sees.

**Audio** (§19.1)

- Ambience volume (default 0.1): the master control for the whole soundscape — the noise beds (wind, surf, crowd murmur), their gust/swell modulation and the proximity animal calls all scale under it.
- Per-source volumes sitting over that master: footsteps, the general ambient bed and the birdsong.
- The coastal surf fade: the near radius within which the surf plays at full gain and the cutoff distance from the coast beyond which it is exactly silent, so the sea is heard at the shore and in seaside ports but never inland.

**Provisions, water and health** (§6)

- Speed of food consumption while walking; at 0 the food supply lasts forever.
- Days of provisions one purchased food unit grants (§9; four weeks by default).
- Days of travel one unit of distance costs (the calendar's advance per travelled unit).
- Speed of the canteen's water consumption per travelled day, split into the land rate and the (faster) desert rate, and the canteen's capacity — a full canteen lasts capacity ÷ consumption travelled days.
- Natural wound-healing durations: the days until a light wound closes on its own and until a severe wound eases to a light one.
- The traveller's current health, for putting him directly into any condition.

**Terrain and water** (§11)

- Movement-factor tuning for the terrain relief items: the factor by which a canoe speeds up water travel, and the penalty factors by which the jungle without a machete and the mountains without a rope slow the traveller.
- The swimmable coastal band width (§11.2): how far off the coast the sea can be swum before the open ocean blocks.
- The river width factor (§11.3): rivers are drawn wider than scale for canoe playability, and carved bed, ribbon, water mask and every clearance derive from this one value. It is a BUILD-time value — the edit persists and takes effect on the next reload.
- The river mouth's slack water (§11.3): how far up its course a river that empties into the sea runs out of current. Like the width factor it is a BUILD-time value — the flow field bakes the ramp per course segment, so the edit takes effect on the next reload.

**Seasons and weather** (§19.13)

- Strength of the seasonal weather look (0 disables it, 1 full, default 1).
- Strength of the wet-ground darkening under rain.

**Wildlife dramas** (§19.8)

- Herd family-drama values: the parental rescue burst factor, the calf fraction per herd group, the calf leash/play/hop-bout values, the juvenile-prey and drinking-juvenile crocodile preferences, and the orphan adoption radius — the reach within which the nearest eligible adult adopts a juvenile whose parent has died (point 262), so the §19.8 dramas recur for the new pairing — and the escape run of a calf freed by its parent's sacrifice (point 311), the window during which that adoption keeps off so the freed young actually flees the predator. Added by the §19.8 dramas above: the mid-channel crocodile weighting for a swimming calf (point 362), the lameness chance and its healing window (point 363), the flood's scale on the drama current (point 364), and the separation window (point 341) after which a juvenile out of reach of its parent has the bond released to that adoption.
- The vigil delay: the seconds a parent may stand over its eaten calf before the carcass draws a predator to the keeper.
- The water dramas: the seconds a current may carry an animal before it drowns, and the factor by which the rains swell that current.
- The predator walk-off overtime (§19.2): how long a leaving predator may stay ring-bound before it retires the moment it is off the rendered frame.
- Water crossing (§19.5): the widest channel a ROAMING animal will swim rather than turn from, and how often a water-blocked roam crosses instead of turning aside. Neither value governs a flight — a fleeing animal is never held back by the water.

**The crocodile** (§19.16)

- The strike radius that triggers the lunge, the bank band within which a waterline prey is a legal target, the local mouth offset at which the seized victim is held, the hard grip release deadline (so a vanished victim never pins the ambusher) and the rest period a driven-off crocodile keeps to its water.

**Expedition state and economy**

- Input fields for cash, gifts and food.
- Input field for the inventory capacity.
- The dig radius (§18): how close to the buried site a dig with the shovel must be to succeed.
- The goodwill points a chief requires before he parts with the location hint (§12/§13).

---

