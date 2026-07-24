# Point 205 — Research-backed world accuracy findings (~1890)

**Status: the research half; corrections land under TASKS point 279.** This
document is the research half of TASKS point 205 (the "RESEARCH-BACKED WORLD
ACCURACY" pass added 23.07.2026). Every finding below started as a *proposal* for
the user to rule on; the main session decides what, if anything, lands. Findings
that HAVE landed carry a **RESOLVED** note at the end of their section, naming
what was built — the finding text itself is left as written, so the record of
what the game did wrong stays readable.

**The trigger and the exemplar.** The Great Sphinx of Giza was buried to the
shoulders in wind-blown sand until Baraize's 1925–36 clearance, so a ~1890
depiction must show it half-buried — the game builds it fully exposed. This pass
sweeps the whole world for that *class* of error: things that look plausible to a
modern eye but were demonstrably different in 1890.

**Sibling docs.** `docs/giza-1890.md`, `docs/peoples-1890.md`,
`docs/climate-1890.md`, `docs/communication-1890.md`,
`docs/fauna-behaviour-1890.md` are the established fact base. This pass *extends*
them and flags where the game diverges from what they already say; it does not
contradict them anywhere. Where a sibling doc already settled a question, this
document cites it rather than re-researching.

### Confidence scale used below

| Mark | Meaning |
| --- | --- |
| **HIGH** | multiple independent sources, or a settled, well-documented fact |
| **MEDIUM** | one good source, or a sound inference from documented facts |
| **LOW** | plausible reading of thin evidence — treat as a hypothesis |
| **UNVERIFIED** | could not be established in this pass — explicitly NOT asserted |

Effort estimates are rough: **XS** ≈ under an hour, **S** ≈ a few hours,
**M** ≈ a day, **L** ≈ multiple days / needs its own TASKS point.

---

## A. Findings, ranked

### A1 — The Sphinx is fully exposed, in the travel landmark AND on Cairo's skyline · SEVERITY 1 · HIGH

**(1) What the game does.** `src/render/landmarks.ts` `buildSphinx()` (lines
110–155) builds the complete couchant lion — torso, both haunches, folded hind
legs, two stretched fore paws, tail, chest, nemes, head — all standing clear of
the ground. `buildGizaPyramids()` embeds it, and that geometry is mounted twice:
on the travel map (`src/scenes/travel/TravelScene.tsx` ~1929, key
`'giza-pyramids'`) and — at **13× scale** — as Cairo's western first-person
skyline (`src/scenes/place/PlaceScene.tsx:1060`,
`cairo: [{ build: buildGizaPyramids, x: -130, z: 10, scaleX: 13 }]`).

**(2) The record.** The Sphinx lay buried to the neck/shoulders through the whole
19th century. Caviglia cleared the chest in 1817 (re-covered), Mariette in 1853
(re-covered), and Maspero re-exposed and then **abandoned** the clearance in
1885–86 for want of funds. Only Émile Baraize's 1925–36 campaign freed the body,
paws and enclosure. Period photographs 1850s–1900s show exactly the
partly-emerged state. The nose was already gone. Sources are already collected in
this repo: `docs/giza-1890.md` §1.3, citing
[Great Sphinx of Giza (Wikipedia)](https://en.wikipedia.org/wiki/Great_Sphinx_of_Giza),
[Rare Historical Photos, Sphinx 1850–1940](https://rarehistoricalphotos.com/great-sphinx-giza-old-photographs/),
[Émile Baraize](https://en.wikipedia.org/wiki/%C3%89mile_Baraize) — PERIOD.

**(3) Confidence.** HIGH. This is the settled, load-bearing period fact and the
repo's own research doc already states it as a must-fix.

**(4) Proposed correction.** Bury the body: either sink the torso/paw/haunch/tail
parts below the ground plane and keep only chest-top, nemes and head above it, or
wrap a low sand apron around the body. Apply once inside `buildSphinx()` so both
mount points inherit it. Noseless face is a free extra at the skyline's 13×
scale. `docs/giza-1890.md` §6 already contains the implementation brief.

**(5) Effort.** **XS** for the geometry change; **S** including the
`landmarks.test.ts` part-count/pin update and a Cairo-skyline screenshot on both
backends.

**Note on ownership.** TASKS point 273 (walkable pyramids) is specced to fix this
"in BOTH the walkable site and the point-82 bird's-eye/skyline" — but 273 is a
v0.3 feature queued behind 224 and behind point 244. The *skyline/travel* half is
a standalone XS fix that need not wait for the walkable scene.

---

### A2 — Meroë's pyramids are built intact; in 1890 most had their tops blown off · SEVERITY 1 · HIGH

**(1) What the game does.** `src/render/landmarks.ts` `buildMeroePyramids()`
(lines 59–76) builds six clean, unbroken four-sided cones at height ≈ 2.6–3.2 ×
base (~69°, correctly steeper than Giza). Every pyramid has an intact sharp apex.

**(2) The record.** In **1834** the Italian treasure hunter **Giuseppe Ferlini**
dismantled the pyramid of Kandake Amanishakheto (Beg. N6) at Meroë, working down
from the top, and his find set off a wave of imitation. Lepsius recorded in 1844
that "the discovery of Ferlini is in everybody's head still, and has brought many
a pyramid to ruin"; the destruction is generally credited across **~40** Nubian
pyramids, whose tops were removed
([Giuseppe Ferlini, Wikipedia](https://en.wikipedia.org/wiki/Giuseppe_Ferlini);
[The Forgotten Pyramids of Sudan, JSTOR Daily](https://daily.jstor.org/forgotten-pyramids-sudan/);
[Roger Pearse on Ferlini](https://www.roger-pearse.com/weblog/2016/12/06/just-one-italian-the-pyramids-of-meroe-and-giuseppe-ferlini-their-destroyer/))
— MODERN scholarship on a documented period event. Whether Ferlini personally
demolished 40 or merely started the fashion is contested; **that the field stood
broken-topped by mid-century is not.** The modern reconstruction of the pointed
apexes is 20th-century work.

**(3) Confidence.** HIGH that the ~1890 field read as truncated/broken; MEDIUM on
what fraction — treat "most, not all" as the safe reading.

**(4) Proposed correction.** Give the majority of the six Meroë cones a
**truncated top** — cut the cone at ~0.75–0.9 of full height and cap it with a
small flat/rubbled slab — leaving one or two intact for contrast, plus a low
rubble mound at one base. Cheap: swap `ConeGeometry` for a `CylinderGeometry`
with a small top radius on the truncated ones. This *also* strengthens the
Giza-vs-Meroë read that `docs/giza-1890.md` §2 asks for. While in the file,
`docs/giza-1890.md` §2/§6 also asks for Meroë's **east-side offering chapels**,
which are still absent.

**(5) Effort.** **S** (geometry + test pin + a travel screenshot).

**RESOLVED (point 279b).** `MEROE_PYRAMIDS` in `src/render/landmarks.ts` now
carries a `standing` fraction per tomb: four of the six are cut at 0.55–0.72 of
their height by `brokenPyramid()` — the cone's own frustum, so the flanks keep
the steep Nubian slope — and finished with one still-standing corner above the
break, half-sunk loosened blocks along the rim and debris heaped at the foot.
Two are left whole for contrast, and the tallest of them still carries the
field's peak, so the "unmistakable at travel zoom" pin holds unchanged.
`landmarks.test.ts` pins the truncation both ways: most broken but not all,
none cut below half, and — over each broken tomb's own footprint — nothing
reaching its original apex, while an untouched one still does. Verified by the
picture at travel zoom on both backends. The east-side offering chapels
`docs/giza-1890.md` §2/§6 also asks for remain OPEN.

---

### A3 — Gondar is built as an intact castle; the Mahdists sacked and burned it in January 1888 · SEVERITY 1 · MEDIUM-HIGH

**(1) What the game does.** `src/render/landmarks.ts` `buildCastles()` (lines
270–296): a solid keep with an unbroken crenellated parapet (8 merlons), plus two
round corner towers each carrying an intact conical roof cap.

**(2) The record.** Mahdist forces captured and sacked Gondar in **January 1888**
— three years after Khartoum — burning most of its churches, killing priests and
enslaving inhabitants; Debre Berhan Selassie was the one major Gondarine church
to survive unscathed. Fasil Ghebbi itself "fell into ruins" as the city declined
through the 19th century; the standing restoration a visitor sees today is
mid-20th-century Italian/Haile Selassie work plus a 1999–2002 UNESCO campaign
([History of Gondar, Grokipedia](https://grokipedia.com/page/History_of_Gondar);
[Fasil Ghebbi, Ancient Origins](https://www.ancient-origins.net/ancient-places-africa/fasil-ghebbi-0016003);
[Visit Ethiopia, Gondar](https://www.visitethiopia.et/space/gondar-2)) — MODERN
on a period event. Also relevant: Gondarine tower roofs were largely gone by the
period; the conical caps the game renders are the restored state.

**(3) Confidence.** HIGH that Gondar was sacked in Jan 1888 and the compound was
ruinous in 1890. MEDIUM on exactly which structures were roofless in 1890 — I did
not find a per-building 1890 survey.

**(4) Proposed correction.** Read the compound as a **recently sacked ruin**, not
a maintained castle: break the parapet (drop 2–3 merlons, lower one), remove or
half-collapse **one** of the two conical roof caps, and put a low rubble/soot
tone on part of the keep. This is a ~10-line change to `buildCastles()`. A
stronger option — the discovery-journal text for Gondar naming the two-year-old
Mahdist burning — would make the period state *legible* rather than merely
visible, and fits the game's existing rinderpest/famine layer.

**(5) Effort.** **S** for the geometry; **+S** if the journal text is rewritten
(both languages, voice markup).

**RESOLVED (point 279c) — geometry only.** `buildCastles()` no longer builds a
solid keep. Four walls stand at uneven heights around a blackened, roofless
interior — the south wall breached to under half — under a parapet that is
gapped and uneven by construction (`GONDAR_PARAPET`, zeros where a merlon is
gone). Both conical caps are removed: the towers are open shells with a dark
hollow top and broken rim stubs, one standing lower than the other
(`GONDAR_TOWER_HEIGHTS`), and rubble lies at the foot of the breach. The stone
tone was darkened off the restored parapet grey. `landmarks.test.ts` pins the
ruin: merlons missing and the survivors uneven, nothing solid over the keep's
middle, and nothing over either tower axis beyond its own rim. Verified by the
picture at travel zoom on both backends. The STRONGER half of the proposal —
Gondar's discovery-journal entry naming the two-year-old Mahdist burning — is
NOT done and stays OPEN (it would need both languages with voice markup).

---

### A4 — Aksum's stelae field is inverted: three standing, one fallen · SEVERITY 2 · MEDIUM

**(1) What the game does.** `buildStelae()` (lines 239–266): **three** standing
tapered shafts of similar height (1.6–2.5 units) with rounded caps, plus one
fallen shaft and a stump.

**(2) The record.** Of the three great "royal" stelae, only **King Ezana's Stele**
(~21 m) was standing — it is "the largest of those that remain unbroken and is
the only one of the three major royal obelisks that was never broken". The 33 m
**Great Stele** collapsed in antiquity (coins beneath it date the fall to the
late 4th century) and lay broken in pieces; the 24 m **Obelisk of Axum** also lay
fallen — it was taken to Rome by the Italians in 1937 and only re-erected in 2008
([King Ezana's Stele, Wikipedia](https://en.wikipedia.org/wiki/King_Ezana%27s_Stele);
[Northern Stelae Park, Madain Project](https://madainproject.com/northern_stelae_park))
— FIELD/REVIEW. So the ~1890 field reads as **one lone giant standing among
fallen giants**, with a scatter of smaller, rough, undecorated stelae around it.

**(3) Confidence.** MEDIUM-HIGH on the standing/fallen split of the three great
stelae; MEDIUM on how many small stelae stood upright in 1890 (many did, but I
found no period count) — hence the correction below keeps some.

**(4) Proposed correction.** Rebalance the field: **one clearly tall** standing
stele (the game's tallest, made taller and more slender relative to the rest),
**two or three low rough** standing ones, and the **fallen giant made the biggest
object in the field** — currently the fallen piece (1.6 long) is smaller than the
standing shafts, which reads backwards. That single swap carries the historical
picture at zero extra geometry cost.

**(5) Effort.** **XS–S** (parameter reshuffle in `buildStelae()` plus a test pin).

---

### A5 — The Bemba village is built on the Central Cattle Pattern, but the Bemba kept no cattle · SEVERITY 2 · HIGH

**(1) What the game does.** `src/scenes/place/regionStyles.ts:66` maps
`bemba: 'ring'`, under the comment "South: the Central Cattle Pattern"; design.md
§4.5 defines `ring` as "huts on a ring around **the central cattle enclosure**
inside a perimeter fence". `src/scenes/place/layout.ts:65` builds a livestock pen
("kraal layouts") for that plan.

**(2) The record.** **This contradicts the repo's own research doc.**
`docs/peoples-1890.md` §5.1 states flatly: the Bemba "settled in a tsetse
fly-infested region, making it challenging to raise cattle" and lived by
*citemene* finger millet — "★ The Bemba premise collapses — they were NOT a
cattle people." Independently confirmed: "There was a general absence of cattle,
since this area was within the tsetse fly belt"; Bemba villages averaged **30–50
wattle-and-daub, thatched huts** whose nucleus was the headman's matrilocal
extended family
([Bemba, Encyclopedia.com](https://www.encyclopedia.com/social-sciences-and-law/anthropology-and-archaeology/people/bemba);
[Bemba, everyculture.com](https://www.everyculture.com/Africa-Middle-East/Bemba.html))
— MODERN.

**(3) Confidence.** HIGH that a central cattle kraal is wrong for the Bemba.
MEDIUM on the right replacement: a clustered hut village around an open central
space (the *insaka* shelter) is the defensible picture; a **stockade** is
attested for the Bemba's *victims* (Mambwe, Lungu) rather than for Bemba villages
themselves, so do **not** add one on this evidence.

**(4) Proposed correction.** Either (a) move `bemba` off `ring` to a plan without
a livestock pen — `compound` is the nearest existing fit, or a small new
`clustered` plan (huts loosely around an open central meeting ground, no kraal,
no perimeter fence); or (b) keep `ring` but make the central enclosure's content
plan-dependent so the Bemba ring encloses an open meeting ground / granaries
rather than cattle. Option (b) is less invasive and keeps the layout tests'
anchors. Also update design.md §4.5's plan table in the same commit.

**(5) Effort.** **S** for option (b); **M** for a new plan kind (option (a)),
because `layout.test.ts` sweeps every place across seeds.

---

### A6 — Giza's pyramids: no Khafre casing cap, no blunt Khufu apex, no Menkaure granite skirt · SEVERITY 2 · HIGH

**(1) What the game does.** `buildGizaPyramids()` builds three identical tawny
sharp-pointed cones differing only in size, all at the same `#c9a76a` tint.

**(2) The record.** `docs/giza-1890.md` §1.1–§1.2 (already in this repo, with
citations) establishes: all three lost their polished Tura-limestone casing to
centuries of quarrying, leaving stepped tawny cores; **Khufu's apex and top
courses are gone**, leaving a small flat platform, not a point; **Khafre alone
still carries a cap of original smooth casing near its apex** — the only
surviving casing on any Giza pyramid and "the single most useful visual cue on
the plateau"; **Menkaure's lower courses are cased in red Aswan granite**, a
darker band at the base — FIELD/REVIEW.

**(3) Confidence.** HIGH — this is the repo's own cited research, and none of the
three cues has been built.

**(4) Proposed correction.** Exactly `docs/giza-1890.md` §3: a short paler smooth
cone segment near Khafre's apex; a flat blunt top on Khufu; a darker granite band
at Menkaure's base. All three are cosmetic and change no footprint.

**(5) Effort.** **S**. Note this is *already inside* TASKS 273's scope, but like
A1 the travel/skyline half is independent of the walkable scene.

---

### A7 — "Kabalega Falls" is a 1970s renaming; in 1890 it is Murchison Falls · SEVERITY 2 · MEDIUM-HIGH

**(1) What the game does.** `src/world/data/landmarks.ts:47` and
`src/i18n/en.ts` (`'kabalega-falls': 'Kabalega Falls'`) name the White Nile falls
Kabalega. The other four waterfalls carry their **1890** names — Stanley (1877),
Livingstone, Victoria (1855), Augrabies — as do the lakes (Rudolf, named 1888 by
Teleki; Albert, Edward, Nyasa).

**(2) The record.** The falls were named **Murchison Falls** by Samuel Baker in
1864 after the RGS president; the Kabalega name (for the Bunyoro *omukama*
Kabalega/Kabarega) is a post-independence Ugandan renaming of the 1970s. In 1890
no map, traveller or journal would call them Kabalega — a Victorian explorer's
diary in particular would not.

**(3) Confidence.** MEDIUM-HIGH on the naming history; HIGH on the internal
**inconsistency** — the roster mixes one modern African renaming into four
period-European names, which is the objective part of the finding regardless of
which way it is resolved.

**(4) Proposed correction.** This is a **design judgment for the user**, not an
automatic fix, because the modern name may be a deliberate decolonising choice
consistent with §4.4's "never a European find" framing. Two coherent resolutions:
(a) **period-consistent** — rename to Murchison Falls for 1890; or (b)
**decolonised-consistent** — keep Kabalega and also revisit Stanley Falls
(→ Boyoma), Lake Rudolf (→ Turkana), Lake Nyasa (→ Malawi). What is not coherent
is the current mixture. Recommendation: (a), because the game's voice is an 1890
diary and every other name is already period-correct; the "African achievement"
framing in §4.4 lives in the *journal text*, where it belongs, not in the
toponymy.

**(5) Effort.** **XS** for (a) — id + two language files + the discovery text.
**S–M** for (b).

---

### A8 — The Wayeyi village is built as a dispersed camp; they were settled riverside villagers · SEVERITY 3 · MEDIUM

**(1) What the game does.** `regionStyles.ts:67` maps `wayeyi: 'scatter'` —
design.md §4.5 defines that as "loose family groups of tents or small huts with
irregular spacing, no lanes, no shared fence", the same plan as the Tuareg,
Mbuti and San.

**(2) The record.** The BaYei/Wayeyi migrated to the Okavango around the
mid-18th century and "established **more permanent settlements** in the vicinity
of the Okavango Delta, attracted by the Delta's rich aquatic environment" — a
mixed economy of millet/sorghum farming, fishing with basket traps and nets,
hunting, gathering and some pastoralism, navigating by **mekoro** dugout
([Okavango Delta Peoples of Botswana, CSU Fullerton](https://anthro.fullerton.edu/Okavango/bnr.html);
[Wayeyi, Minority Rights Group](https://minorityrights.org/communities/wayeyi/))
— MODERN. `docs/peoples-1890.md` §1 already recommended rewriting this village
"around the flood, fishing and the mekoro dugout", noting "the game already has a
canoe, which makes [it] cheap and rewarding".

**(3) Confidence.** MEDIUM-HIGH that `scatter` is the wrong form; MEDIUM on the
right one (no period village plan of a Wayeyi settlement was retrieved).

**(4) Proposed correction.** Move `wayeyi` off `scatter` to a **water-fronting
clustered village** — the existing `riverstrip` plan (houses banding one
water-parallel lane) is the closest fit and would need no new plan kind, with
**mekoro drawn up on the bank** as the signature dressing. This also finally
cashes the `docs/peoples-1890.md` §1 recommendation.

**(5) Effort.** **S** (plan remap + layout test sweep); **+S** for the canoe
dressing.

---

### A9 — Warthog is in the northern (Saharan) prey pool · SEVERITY 3 · MEDIUM

**(1) What the game does.**
`src/scenes/travel/wildlifeBehavior.ts:1792` — `north: ['antelope', 'warthog']`.
The `north` region (`geo.ts` `regionAt`) is everything at lat ≥ 17, i.e. the
whole Sahara plus Nubia, plus lat ≥ 14.5 east of lon 25.

**(2) The record.** The common warthog is a sub-Saharan savanna/grassland
species; it does not inhabit the Sahara proper. Its northern limit runs along the
Sahel, well south of most of the game's `north` band. The **antelope** half of
the pool is fine — addax, scimitar oryx and dorcas gazelle were all present in
the 1890 Sahara, and the desert antelopes were in fact still numerous then. The
`north` predator roster (`lion, cheetah, leopard`) is likewise good for 1890: the
Barbary lion survived in the Atlas into the 20th century, the Saharan cheetah and
the Atlas/Saharan leopard were both extant.

**(3) Confidence.** MEDIUM-HIGH on the warthog's range. **Mitigation already in
place:** `ambientSavannaSpecies()` only seeds on savanna cells, so a warthog
should not appear on Saharan sand; the exposure is via hunts and events keyed on
`REGION_PREY`/`REGION_PREDATORS` by region alone.

**(4) Proposed correction.** Lowest-cost: leave `REGION_PREY.north` as
`['antelope']` only, since the north's savanna cells are a thin Sahelian fringe
and the antelope covers them. If warthogs are wanted on that fringe, the honest
fix is a biome check rather than a region check — bigger, and probably not worth
it at this scale.

**(5) Effort.** **XS** for the pool edit; **+S** for the tests that sweep the
pools (`wildlifeBehavior.test.ts` asserts region/pool fit in several places).

---

### A10 — A lion can attack in the Congo rainforest · SEVERITY 3 · MEDIUM

**(1) What the game does.** `REGION_PREDATORS.central = ['lion', 'leopard']`, and
`src/systems/events.ts` gates a predator attack by **region** (point 208 A3's
shared roster) rather than by terrain. The `central` region spans lon 12–31.5 at
lat −12…7.5 — the Congo basin *and* its savanna fringes.

**(2) The record.** Lions are savanna/open-woodland animals and are absent from
closed rainforest; the Congo basin proper held leopard (and, in the game's
roster's absence, forest species) but not lion. Lions *were* present on the
region's southern and northern savanna margins, so the region entry is not simply
wrong — the **terrain** is what disambiguates.

**(3) Confidence.** MEDIUM-HIGH on the ecology; MEDIUM on how visible the bug is
in play, since the event system is off by default in the relaxed preset (§14.3).

**(4) Proposed correction.** Gate the predator pick on the **terrain type at the
event position** as well as the region: exclude `lion` (and `cheetah`, though it
is not in `central`) where the terrain samples jungle. This is a small addition
to the existing pure `events.ts` helper and is directly unit-testable, matching
the point-208 A3 pattern.

**(5) Effort.** **S**.

---

### A11 — Crocodiles range to the Egyptian Nile at Cairo · SEVERITY 3 · MEDIUM

**(1) What the game does.**
`src/scenes/travel/wildlifeBehavior.ts:1052` —
`CROCODILE_REGIONS = ['north', 'west', 'central', 'east', 'south']`, i.e. every
region's river/lake water, which includes the Nile beside Cairo and the delta.

**(2) The record.** Nile crocodiles historically ranged the whole Egyptian Nile
including the delta, but "before it was exterminated from the country in the
early part of the 20th century **it was limited in distribution to Upper Egypt**
(i.e., southern Egypt from Aswan to the Sudanese border)"; the lower-Nile and
delta populations disappeared gradually through the 19th century
([CITES CoP15 Prop. 9](https://cites.org/sites/default/files/eng/cop/15/prop/E-15-Prop-09.pdf);
[Nile Crocodile overview, ScienceDirect](https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/nile-crocodile))
— MODERN on the historical range. So in 1890 a crocodile at **Aswan and south**
is right; one at **Cairo** is a few decades late.

**(3) Confidence.** MEDIUM. The sources agree on the direction and on "Upper
Egypt only by the late 19th century", but I did not find a dated northern limit
for exactly 1890.

**(4) Proposed correction.** Optional and low-value: add a latitude cut for the
Egyptian Nile only (no crocodile north of ~lat 24, i.e. north of Aswan), leaving
every other region untouched. Given the uncertainty and the small payoff, "note
and leave" is a defensible outcome — but it is exactly the Sphinx class of
detail, so it is recorded.

**(5) Effort.** **XS–S**.

---

### A12 — Kilwa is rendered as post-and-lintel columns, not coral-rag domed bays · SEVERITY 3 · LOW-MEDIUM

**(1) What the game does.** `buildCoastalRuins()` (lines 205–235): a low
platform, four free-standing cylindrical columns of varied height, and a "broken
arch" made of two square pillars bridged by a sagging rectangular lintel — a
Greco-Roman ruin silhouette.

**(2) The record.** Kilwa Kisiwani's signature is the **Great Mosque**: "the
oldest standing mosque on the East African coast", built of coral rag, "with its
sixteen **domed and vaulted bays**", plus a great dome that was "the largest dome
in East Africa until the 19th century", and the Husuni Kubwa palace's stepped
court and octagonal bath. The site's ruins were and are heavily overgrown, with
baobabs standing among them
([Great Mosque of Kilwa, Wikipedia](https://en.wikipedia.org/wiki/Great_Mosque_of_Kilwa);
[Ruins of Kilwa, African World Heritage Sites](https://www.africanworldheritagesites.org/cultural-places/swahili-coast/ruins-of-kilwa.html))
— FIELD/REVIEW. The **columns are right** (the mosque's pillars carried the
domes); the trabeated lintel arch is the wrong grammar.

**(3) Confidence.** MEDIUM on the architectural read; LOW-MEDIUM on how much it
matters at travel-marker scale.

**(4) Proposed correction.** Replace the sagging lintel with **two or three low
hemispherical domes** on short walls (a `SphereGeometry` half, half-collapsed on
one) and keep the columns. Optionally add one baobab from `flora.ts` — the
overgrowth is period-true and reads instantly as "ruin".

**(5) Effort.** **S**.

---

### A13 — Timbuktu's coordinate and its "port" status · SEVERITY 4 · MEDIUM

**(1) What the game does.** `geo.ts:142` places `timbuktu` at 16.95 N, 3.00 W as
a `port` of size 2, and `data/rivers.ts` routes the Niger deliberately "south of
Timbuktu (16.77)" so the river band does not swallow the site.

**(2) The record.** Real Timbuktu is at **16.77 N, 3.00 W** — the game sits ~20 km
north of it (the comment in `rivers.ts` even cites the correct 16.77). Timbuktu
is **not on the Niger**: its river port is **Kabara**, ~8 km south, which is
where Boiteux's 1893 flotilla actually landed. In 1890 the city was in deep
decline from its medieval peak, dominated by Tuareg and under no European control
— the French took it in **December 1893** (Boiteux, then Bonnier and Joffre),
i.e. **inside the game's 1890–1895 window**
([Timbuktu, Britannica](https://www.britannica.com/place/Timbuktu-Mali);
[History of Timbuktu, Grokipedia](https://grokipedia.com/page/History_of_Timbuktu);
[Eugène Bonnier](https://en.wikipedia.org/wiki/Eug%C3%A8ne_Bonnier)) — MODERN.

**(3) Confidence.** HIGH on the coordinate and on Kabara; HIGH on the 1893 French
capture.

**(4) Proposed correction.** (i) Move the anchor to 16.77 N if the river
clearance still holds — the auto-clearance in `clearedOfRivers` will nudge it
anyway, so this is a one-number change with a test re-run. (ii) The French
capture is a *free* datable in-game event exactly like the rinderpest layer
(`src/systems/rinderpest.ts`) — December 1893 is reachable in a normal
playthrough. Worth proposing to the user as content, not as a fix.

**(5) Effort.** **XS** for (i); **M** for (ii) as a new date-state system.

---

### A14 — Berbera's seasonal fair is a strong, attested hook the seasonal system does not use · SEVERITY 4 (opportunity) · MEDIUM-HIGH

**(1) What the game does.** `berbera` is a static size-1 port. The seasonal-life
system (`src/systems/seasonalLife.ts`) already models per-people presence
(`presenceAt`) and market plenty (`marketPlentyAt`) — but for **villages**, not
ports; Berbera has no seasonal behaviour.

**(2) The record.** Berbera held an **annual fair between October and April**,
"among the most important commercial events of the east coast of Africa", drawing
Isaaq sub-clans, caravans from Harar and the interior, and Banyan merchants from
Porbandar, Mangalore and Bombay; the town swelled enormously in the trading
season (an 1833 figure of 70,000 people, 6,000 camels arriving in a day) and was
**largely deserted in the hot season**
([Berbera, kiddle/Wikipedia mirror](https://kids.kiddle.co/Berbera);
[Somaliland: The Ancient Fair Festival of Berbera, SII](https://sii1991.org/somaliland-the-ancient-fair-festival-of-berbera/))
— PERIOD/REVIEW. This dovetails with `docs/peoples-1890.md` §4.0.2, which already
has Swayne's 1895 **period** Somali season table, and with §7.1's *karif* driver
already implemented in `src/systems/dress.ts` (`somali`).

**(3) Confidence.** MEDIUM-HIGH. The Oct–April fair is well attested; the
population figures are 19th-century impressions, not counts — do not quote them
as data.

**(4) Proposed correction.** Extend `seasonalLife.ts` to ports: give Berbera a
`presenceAt`-style curve — busy Oct–Apr (more walkers, more stalls, fuller shop),
near-empty May–Sep. It reuses machinery that already exists and turns the
already-modelled *karif* season into something the player can *see*. Purely
additive; no existing behaviour changes.

**(5) Effort.** **M** (new port-side seasonal hook + unit tests + a
polish-screenshot pair).

---

### A15 — A German string in an English data file · SEVERITY 4 · HIGH (objective)

**(1) What the game does.** `src/world/data/rivers.ts:90` —
`mouthName: 'Zusammenfluss mit dem Oranje'` on the Vaal. Every other
`sourceName`/`mouthName` in the file is English, and the interface comment says
"technical English; localize via i18n when displayed". CLAUDE.md §6 requires all
constant values outside the language files to be English.

**(2) The record.** N/A — this is an internal-consistency defect, not a history
one. The correct value is "Confluence with the Orange".

**(3) Confidence.** HIGH.

**(4) Proposed correction.** Change the string; check nothing greps on it.

**(5) Effort.** **XS**.

---

### A16 — The missing 1890 megafauna: hippopotamus, buffalo, rhinoceros · SEVERITY 4 (scope) · HIGH

**(1) What the game does.** The fauna roster
(`src/scenes/travel/Wildlife.tsx:150`) is elephant, giraffe, zebra, wildebeest,
antelope, warthog, flamingo, crocodile, plover, plus lion/cheetah/leopard/hyena
and vultures, the lioness+cub and the ground-nesting plover.

**(2) The record.** The three animals every 1890 expedition account is full of —
**hippopotamus** (the standing hazard of every river crossing and canoe passage),
**African buffalo** (the classic dangerous game, and the species rinderpest
slaughtered at ~95 % in East Africa, already recorded in
`docs/peoples-1890.md` §5.1) and **rhinoceros** — are absent. The buffalo gap is
the sharpest, because the repo's own rinderpest research names buffalo as the
wildlife casualty and `rinderpest.ts` models the panzootic without the animal it
most visibly killed.

**(3) Confidence.** HIGH that they belong in a ~1890 African world; this is a
scope judgment, not an error.

**(4) Proposed correction.** A design conversation, not a fix. If one is added,
**buffalo** buys the most: it is prey in the existing food web (lion), it is a
plausible §14.1 danger-order entry, and it would let the rinderpest layer show
its wildlife half. **Hippopotamus** would be second — it directly threatens the
canoe, the game's most-used item, which no current animal does.

**(5) Effort.** **L** each (new fauna build, food-web entries, behaviour, event
entries, both languages).

---

### A17 — Great Zimbabwe reads as a maintained wall; in 1890 it was overgrown ruin · SEVERITY 4 · MEDIUM

**(1) What the game does.** `buildStoneCity()` (lines 159–176): a clean, evenly
segmented ~200° arc of wall at uniform height plus an intact conical tower.

**(2) The record.** The essentials are right — a great curved dry-stone enclosure
and a solid conical tower are exactly Great Zimbabwe, and the site was certainly
standing in 1890. But its state was **ruinous and overgrown**: Bent's 1891
excavation around the Conical Tower recorded "recent growth of vegetable matter"
and "indications of a Kaffir occupation of the place up to a very recent date"
([Bent's 1891 expedition, Zimbabwe Field Guide](https://zimfieldguide.com/masvingo/bent%E2%80%99s-archaeological-expedition-great-zimbabwe-1891-and-prominent-part-played-mabel-bent);
[James Theodore Bent, Britannica](https://www.britannica.com/biography/James-Theodore-Bent))
— PERIOD. Note the game window sits *exactly* on the site's most famous moment:
the BSAC Pioneer Column arrives September 1890 and Bent digs in 1891.

**(3) Confidence.** MEDIUM-HIGH on the overgrown/ruinous state; the current build
is not *wrong*, only too tidy.

**(4) Proposed correction.** Vary the wall-segment heights (some slumped, one
gap), and scatter two or three flora instances against the wall base — the same
one-line trick proposed for Kilwa. Optional.

**(5) Effort.** **XS–S**.

---

### A18 — Bandiagara: cliff-face dwellings are Tellem, and the 1890 "Bandiagara" is a different place · SEVERITY 4 · MEDIUM

**(1) What the game does.** `buildCliffDwellings()` (lines 300–326): a leaning
cliff slab with seven small flat-roofed boxes on two ledge heights on the face;
`landmarks.ts:129` puts it at 14.35 N, 3.40 W.

**(2) The record.** The structures **on the cliff face** are the older **Tellem**
dwellings/granaries (abandoned around the 15th–16th century); the Dogon of 1890
lived in villages at the **talus foot** below them, using the cliff niches mainly
as granaries and burial places. design.md §4.4 already says "built above the
older Tellem sites", so the game's own text knows this — the *render* shows only
the cliff-face half. Separately, in 1890 the **town of Bandiagara** (a different
site from the escarpment landmark) was the capital of the Toucouleur state under
Tidiani Tall, established 1864 — worth knowing so a journal text does not
describe an empty landscape.

**(3) Confidence.** MEDIUM-HIGH on the Tellem/Dogon split; MEDIUM on how much the
travel-scale silhouette should carry it.

**(4) Proposed correction.** Add two or three **larger huts at the foot of the
slab** (the living Dogon village) below the small cliff boxes, so the landmark
reads as "living village under abandoned cliff dwellings" rather than "people
living in the cliff". Cheap and it makes the design text and the render agree.

**(5) Effort.** **XS–S**.

---

## B. Checked and found CORRECT — do not re-check these

Recorded so the next pass does not redo this ground.

**Landmarks and monuments**
- **Lalibela** (`buildRockChurches`): rock-hewn cruciform church sunk into a
  trench in reddish tuff, at 12.03 N 39.04 E. Correct in form, material and
  1890 state — the churches were in continuous religious use, never a ruin. ✅
- **Meroë vs Giza slope contrast**: the code already encodes it correctly
  (Giza height ≈ 0.64·base ⇒ ~52°, Meroë ≈ 2.6–3.2·base-half ⇒ ~69°), matching
  `docs/giza-1890.md` §2. ✅ (The *chapels* and *truncation* are A2.)
- **Giza's layout**: three pyramids on the SW diagonal with Khufu largest in the
  NE, Sphinx east of Khafre facing east, the field just west of Cairo across the
  Nile. All correct. ✅
- **Table Mountain** (`buildTableMountain`): flat-topped massif with Devil's Peak
  east and Lion's Head west, behind Cape Town. Correct geography. ✅
- **Ol Doinyo Lengai smoking**: design.md §4.4 calls it "active in the period",
  and the record backs it — eruptions are recorded from **1880, 1882 and 1883**,
  with flows 1904–1910 and 1913–15
  ([Global Volcanism Program](https://volcano.si.edu/volcano.cfm?vn=222120);
  [VolcanoDiscovery, Lengai eruptions](https://www.volcanodiscovery.com/lengai-eruptions.html)).
  The smoke plume in `buildVolcano()` is period-correct. ✅
- **Elephant graveyard**: a genuine myth, but explicitly declared fictional in
  both design.md §4.4 and the data file's own comment. Not an accuracy defect. ✅

**Hydrography**
- **Lake Chad's large extent** (`data/lakes.ts`, "Normal Chad"): 19th-century
  observers (Denham, Barth, Rohlfs, Nachtigal) saw a great lake of ~**28,000 km²**
  in 1870, against 2,000–5,000 km² today. The drawn polygon (≈2.3° × 1.6°) is in
  that band. The comment is right and so is the geometry
  ([Lake Chad historical background, IRD](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/divers16-10/16175.pdf);
  [Lake Chad, Britannica](https://www.britannica.com/place/Lake-Chad)). ✅
- **No modern reservoirs** (no Volta, Kariba or Nasser) — correct and explicitly
  commented. ✅
- **River source/mouth names**: spot-checked and sound — Blue Nile from Lake
  Tana; White Nile from Ripon Falls (Speke, 1862); Nile to Rosetta; Congo from
  the Lualaba to **Banana** (the Free State's Atlantic port); Zambezi to
  **Chinde** (established 1889 as the British concession port — a notably good
  1890 choice); Jubba from the confluence at Dolo; Ubangi from the Uele/Mbomou
  confluence; Kasai from the Bié highlands; Senegal from the Fouta Djallon
  (Bafing); Volta from the Bobo-Dioulasso highlands; Benue from Adamawa;
  Limpopo from the Witwatersrand. ✅
- **Lake names**: Rudolf (Teleki, 1888), Albert (Baker, 1864), Nyasa, Tana,
  Victoria, Tanganyika, Edward — all period-current in 1890. ✅

**Ports** — all ten check out as 1890 places, with A13's caveat on Timbuktu and
the deliberate carve-out on Khartoum (§C):
- **Cairo** size 3: correct — by far the largest, under British occupation since
  1882. ✅
- **Zanzibar** size 3: correct — the richest East African entrepôt, and a British
  protectorate from November 1890 (Heligoland-Zanzibar Treaty). ✅
- **Cape Town** size 3: correct. ✅
- **Tangier** size 2: correct — independent Morocco, the diplomatic capital. ✅
- **St. Louis** size 2: correct — capital of French Senegal. ✅
- **Lagos** size 2: correct — a British colony since 1861. ✅
- **Boma** size 1: correct — capital of the Congo Free State 1886–1926, a small
  station. ✅
- **Berbera** size 1: correct as a base state, under British Somaliland
  protectorate treaties from 1884–88 (its seasonal swing is A14). ✅

**Equipment** — the whole roster is period-plausible for an 1890 expedition:
rope, machete (the period "matchet"/cutlass), shovel, rifle, medicine (quinine
is *the* 1890 expedition drug), canteen, canoe (dugout). Nothing anachronistic;
no "modern kit" slipped in. ✅

**Peoples/naming** — every category error `docs/peoples-1890.md` §1 flagged has
since been fixed in the code: `bantu`→`pedi`, `uganda`→`baganda`,
`pygmy`→`mbuti`, `bushmen`→`san`, `batwa`→`wayeyi`, `bombara`→`bambara` (moved to
the Ségou heartland 13.45 N 6.27 W), `mandingo`→`mandinka`, `masai`→`maasai`,
`sidamo`→`sidama` (the 1891-coined exonym correctly avoided). ✅

**Village plans (design.md §4.5)** — checked people by people; sound except A5
(Bemba) and A8 (Wayeyi). Specifically confirmed as good fits: `street` for Fang
and the Congo-basin peoples; `ring` for Maasai (enkang), Somali, Zulu and Pedi;
`riverstrip` for Nubians; `ksar` for Berbers; `coastrow` for Swahili; `scatter`
for Tuareg, Mbuti and San; `compound` for Hausa (*gida*). ✅

**Historical layers already modelled** — and modelled well:
`src/systems/rinderpest.ts` (panzootic 1888–97, camel-people immunity, the
Bemba's cattle-less exception, the Zambezi line at March 1896),
`src/systems/dress.ts` (six peoples, three drivers, rank gate),
`src/systems/seasonalLife.ts` (transhumant presence, market plenty). These are
research-grade and consistent with `docs/peoples-1890.md`. ✅

---

## C. Deliberately exempt — DO NOT "correct" these

design.md §8 carries an explicit **HOMAGE CARVE-OUT** (point 208 B3) that this
pass must respect. Recorded here so nobody re-files them as findings:

1. **The `$` currency.** Historically an 1890 expedition in Africa would deal in
   Maria Theresa thalers (Horn/Red Sea), Indian rupees (Zanzibar/East Africa),
   Egyptian piastres, francs, sterling, cowries and cloth — not dollars.
   **Exempt.** (START_MONEY = 250 is also design-fixed per CLAUDE.md §2.)
2. **The culture/value matrix, including emeralds.** For the record, since the
   question will recur: **emeralds were not an African trade good in 1890.** The
   ancient Egyptian mines at Wadi Sikait were long exhausted; Zambia's Kafubu
   emeralds were discovered only in **1928** (commercial production from the
   1970s), and Colombia was the world source
   ([Emeralds from the Kafubu Area, GIA](https://www.gia.edu/gems-gemology/summer-2005-emeralds-kafubu-zambia-zwaan);
   [Ancient Emerald Mines of Egypt, GIA](https://www.gia.edu/gia-news-research/historical-reading-ancient-emerald-mines-egypt)).
   The period-true gift economy was **merikani cloth, glass beads, brass/copper
   wire**, plus cowries and salt — European explorers' caravans budgeted in
   *yards of cloth*, not gems
   ([Hostage to Cloth: European Explorers in East Africa 1850–1890](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1679&context=tsaconf);
   [Beads, arms and cloth, Scroll.in](https://scroll.in/article/1089314/beads-arms-and-cloth-how-19th-century-african-consumers-shaped-global-trade)).
   **Exempt** — it is the 1985 original's matrix, kept on purpose.
3. **Khartoum as a welcoming ~1890 port.** The carve-out names this explicitly.
   For the record and confirmed independently: after 26 January 1885 "Khartoum
   was largely destroyed and abandoned", its survivors deported to the new
   Mahdist centre at **Omdurman**, and it was rebuilt only after the British
   reconquest in 1898
   ([Khartoum, Wikipedia](https://en.wikipedia.org/wiki/Khartoum);
   [Omdurman, Britannica](https://www.britannica.com/place/Omdurman)). A
   European walking into Mahdist Khartoum in 1890 to shop is impossible history.
   **Exempt.**
4. **The §13.2 direction/glossary words.** Exempt and separately provisional
   under design.md §13.4.

Two further declared carve-outs (§19.8 animal grief, §19.13 weather
exaggeration) were not re-examined here.

---

## D. Could not establish — explicitly NOT asserted

- **Thabana Ntlenyana** (`MOUNTAINS`, 29.47 S 29.27 E). Whether this peak was
  named or identified as southern Africa's highest in 1890 could not be
  established; the "highest peak" identification is generally credited to a
  mid-20th-century survey. It is not wrong to place the mountain — it existed —
  only possibly wrong to *name* it on an 1890 map. **UNVERIFIED**, low value.
- **"Alexander Bay"** as the Orange's mouth name in 1890. The settlement dates
  from the 1920s diamond rush, but the bay name may derive from Sir James
  Edward Alexander's 1830s expedition. Not resolved. **UNVERIFIED**, low value.
- **Exact 1890 roofing state of individual Fasil Ghebbi buildings** (A3). The
  sack and the general ruin are documented; a per-building 1890 survey was not
  retrieved.
- **Number of small Aksum stelae standing upright in 1890** (A4). The three great
  ones are documented; the smaller field is not, at this level.
- **The precise northern limit of the Nile crocodile in 1890** (A11). "Upper
  Egypt only by the late 19th century" is documented; a dated line is not.
- **1890 populations of the ports.** Various figures circulate but almost all are
  colonial estimates, not censuses; the game's `size` 1/2/3 tiers are defensible
  on *function and importance*, which is what design.md §4.1 actually asks for,
  so no numeric re-tiering is proposed.

---

## E. Summary

| Severity | Count | Findings |
| --- | --- | --- |
| **1 — Sphinx class** (objectively wrong physical state, highly visible) | 3 | A1 Sphinx, A2 Meroë, A3 Gondar |
| **2 — objectively wrong, moderately visible** | 4 | A4 Aksum, A5 Bemba kraal, A6 Giza cues, A7 Kabalega name |
| **3 — wrong fit, low visibility** | 5 | A8 Wayeyi plan, A9 Saharan warthog, A10 Congo lion, A11 Nile crocodile, A12 Kilwa arch |
| **4 — minor / naming / opportunity** | 6 | A13 Timbuktu, A14 Berbera fair, A15 German string, A16 megafauna, A17 Great Zimbabwe, A18 Bandiagara |

**Total: 18 findings.** Of these, **A1, A2, A3, A5, A6, A15** are the ones I would
act on without needing a design conversation — each is an objective error against
a documented record (A5 and A15 against the repo's *own* documents), and each is
XS–S effort. **A7, A13(ii), A14, A16** are design judgments for the user. The
rest are optional polish.

The single cheapest high-value change is **A1** — burying the Sphinx inside
`buildSphinx()` fixes the exemplar error in both views at once, and it does not
have to wait for the walkable-pyramids feature.
