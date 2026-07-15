# Seasonal Climate of Africa around 1890 (design.md §19 seasons/weather)

Research basis for the season/weather model: what the climate in each region of
the game world really did through the year at the time the game is set. Written
before any code (TASKS point 120 step (a)) so the model is reviewable against
sources rather than invented. Sibling of `scripts/README.md`, which documents the
geodata the terrain itself is built from.

**The honest caveat, stated once and meant throughout:** most month ranges below
are *modern* climate normals applied backwards to 1890. That is defensible — the
mechanisms (the rain belt, the monsoon, the winter-rain regimes) are stable on a
century scale — but it is not period observation, and each section says which it
is. Where genuine 1890-era data exists it is marked ✅ and preferred.

---

## 1. Three findings that override the modern mental image

These change the world design, so they come first.

### 1.1 The Sahel around 1890 was WET, not dry ✅

The game window (1890 + ~5 years) sits *inside* a documented humid period,
roughly **1870–1895**. The Sahel was "as rainy as or even more rainy than during
the 1950s and 1960s"; the drying that produced the famous droughts began around
**1895** — at the very end of the window. The great Sahel droughts (1910s,
1968–73, 1983–84) are all *later*.

Consequence: the Sahel must render **greener and wetter than any modern
reference image**, and **Lake Chad must be huge** — ~28,000 km² in the 19th
century, overflowing into the Bahr el-Ghazal, versus <1,500 km² by 2000. The
game already places Lake Chad; its extent should match the period, not today.

- Atlantic Control of the Late Nineteenth-Century Sahel Humid Period, *J. Climate*
  31(20), 2018 — https://journals.ametsoc.org/view/journals/clim/31/20/jcli-d-18-0148.1.xml
- Droughts in the Sahel — https://en.wikipedia.org/wiki/Droughts_in_the_Sahel
- Lake Chad — https://www.britannica.com/place/Lake-Chad

### 1.2 The equatorial glaciers were 8–12× today's ✅

Kilimanjaro, Mount Kenya and the Rwenzori stood near their Little Ice Age
maximum. Against the first reliable survey (~1900) they retain today: Kilimanjaro
**8.6 %**, Mount Kenya **4.2 %**, Rwenzori **5.8 %**.

| Massif | ~1900 baseline | 2021/22 | Loss |
| --- | --- | --- | --- |
| Kilimanjaro | **11.40 km²** (Klute survey 1912) | 0.98 km² | ~91 % |
| Mount Kenya | **1.64 km²** (1899) | 0.069 km² | ~96 % |
| Rwenzori | **6.5 or 7.5 km²** (Abruzzi 1906, disputed) | 0.38 km² | ~94 % |

For 1890 itself the honest bracket is **~12–20 km² on Kilimanjaro** (the often
quoted "20 km² in 1880" is Osmaston's *reconstruction* from moraines, not a
measurement; Meyer's "32 km²" of 1889 is an eyeball estimate that almost
certainly counts seasonal snow). Anything pre-1912 carries ±50 %.

Period texture worth having: Meyer made the first ascent **6 October 1889** — one
year before the game starts — and his 1891 account has the caldera ice falling
"as a mighty cascade into the great western fissure". His 1898 map shows that
connection **gone**: the break-up happened *inside the game window*, in the early
1890s. Rwenzori: Stanley sighted the range **24 May 1888**, and it is
permanently cloud-wrapped — he had walked past it for months without seeing it.

- Cullen et al. 2013, *The Cryosphere* 7:419 (read in full; the 1912–2011 series)
  — https://tc.copernicus.org/articles/7/419/2013/
- Hinzmann, Prinz et al. 2024, *Env. Res.: Climate*
  — https://iopscience.iop.org/article/10.1088/2752-5295/ad1fd7

Note the *cause* of the retreat, which is counter-intuitive: it began ~1880 and
was triggered by a **drop in moisture**, not warming — the decades before 1880
were very humid, with high lakes and extensive ice. So 1890 sits right at the
start of the East African drying: the ice is still vast but visibly going.

### 1.3 The era's defining disaster is a disease, not weather

The **rinderpest panzootic** rages across East/Central/West Africa 1890–95,
killing 80–90 % of cattle and much wild buffalo, giraffe and wildebeest — under
clear skies. It reached Ethiopia ~1888, the Senegal River by August 1891, and
**halted at the Zambezi until 1896**: southern Africa stays clean for the whole
window. It is out of scope for a *weather* model, but it is the reason the era's
famines are not drought stories, and it must not be modelled as one.

- https://en.wikipedia.org/wiki/1890s_African_rinderpest_epizootic

---

## 2. The rain belt — and three traps that break a naive model

The backbone: the rain belt follows the sun, reaching **~15°N in July** and
**~5°S in January**, over Africa extending to ~20°S in late austral summer. Do
not implement it naively:

**Trap 1 — the convergence line and the rain sit at different latitudes.** Over
West Africa the Intertropical Discontinuity reaches 17–23°N in August, but the
rain lags **100–250 km south** of it for the 1 mm/day edge and **400+ km south**
for real rain (>3–4 mm/day). Driving rain off "ITCZ latitude" **rains on the
Sahara every August**. Offset the rainband south of the convergence line.

**Trap 2 — East Africa is not ITCZ-driven at all.** Nicholson (2018) holds the
classic explanation "not tenable" and distinguishes the tropical rainbelt from
the ITCZ, which "can markedly differ". **Hard-code East Africa's observed
bimodal MAM/OND calendar** rather than deriving it from a latitude sweep; the
derivation is physically wrong and yields wrong months.

**Trap 3 — the Congo Air Boundary** is a separate, sharp dryline where Atlantic
westerlies meet Indian Ocean easterlies, running SW–NE across tropical East
Africa (Aug–Oct, central Angola to western Zambia). Rainfall differs vastly
across a couple of hundred kilometres. Optional, but a cheap dramatic feature.

- https://journals.ametsoc.org/view/journals/clim/23/14/2010jcli3277.1.pdf (the lag)
- https://journals.ametsoc.org/view/journals/bams/99/2/bams-d-16-0287.1.xml (Nicholson 2018)
- https://journals.ametsoc.org/view/journals/clim/32/23/jcli-d-19-0437.1.xml (CAB)

---

## 3. Seasonal regimes by zone

Month ranges are modern normals unless marked ✅. The game's regions
(`regionAt()`, `src/world/geo.ts`) each span many degrees of latitude, so the
model must key on **(date, latitude, longitude)** — a per-region constant would
be wrong in every region.

| Zone | Wet months | Peak | Dry months | Annual mm |
| --- | --- | --- | --- | --- |
| Mediterranean coast (>~31°N, coastal) | Sep–May, core **Nov–Mar** | Nov–Dec | **Jun–Aug** | Algiers 600; Alexandria 235 |
| **Cairo (30.05°N)** — Saharan, not Mediterranean | trace only | Mar | **Jun–Sep = 0.0** | **~25** |
| N. Sahara (~25–30°N) | **Oct–Apr** (winter regime) | — | Jul–Sep | fringe 100–250; core ≤10 |
| S. Sahara (~20–25°N) | **Jul–Sep** (summer regime) | Aug | Oct–Apr | fringe 100–250; core ≤10 |
| Sahel 16–18°N | **Jul–Aug** only | Aug | Sep–Jun | <200–300 |
| Sahel 13–16°N (Khartoum) | **Jun/Jul–Sep** | **Aug** | Oct–May | ~254 |
| Sahel 10–12°N | **Jun–Sep/Oct** | Aug | Nov–May | 400–600 |
| Guinea coast 4–7°N (6°W–2°E) | **Apr–Jul** + **Sep–Nov** | Jun / Oct | **Aug** (little dry season) + Dec–Mar | ~730 (Accra) |
| West coast 8–10°N (10–15°W) | **Apr/May–Oct/Nov** (unimodal!) | Jul–Sep | Dec–Mar | up to 4000 |
| Congo 5°N–5°S | **Mar–May** + **Sep–Nov** | Apr / Oct | *none — rain every month* | ~1900 |
| Congo >5°N | **Jun–Sep** (unimodal) | Jul | **Jan–Mar** | 1500–2000 |
| East African rift | **Mar–May** (*masika*) + **Oct–Dec** (*vuli*) | Apr / Nov | Jan–Feb, Jun–Sep | varies |
| Ethiopian highlands | **Jun–Sep** (*kiremt*) + **Feb–May** (*belg*) | Jul–Aug | **Oct–Jan** (*bega*) | kiremt = 65–95 % of annual |
| Southern plateau / Kalahari | **Oct–Apr**, core **Nov–Mar** | **Jan–Feb** | Apr/May–Oct, core Jun–Aug | 750–1250 |
| **The Cape (~−34°)** | **Apr–Oct** — *opposite to the rest of the south* | Jun–Jul | Nov–Mar | ~75 % of annual in the wet season |

Notes that matter for implementation:

- **Cairo is not Mediterranean.** The game starts there. At ~25 mm/yr it is
  Saharan: **June–September are absolutely rainless**. A latitude gate at 32°N
  would wrongly exclude Alexandria (31.2°N, 235 mm) while a "north = winter rain"
  rule would wrongly rain on Cairo. The gradient is brutal — 235 mm to 25 mm
  across ~1.2° of latitude. Use ~31°N **plus coastal proximity**, not a bare
  parallel.
- **The Sahara is not uniformly rainless, and splits north/south:** winter rain
  (Mediterranean cyclones) in the north, summer rain (the rain belt) in the
  south, both possible May–June. But ~31 % of it gets ≤10 mm/yr and a ~1 M km²
  eastern zone averages ~0.5 mm/yr — effectively rainless for years.
  ⚠️ That seasonality rests on only 4 years of satellite data (1998–2001).
- **The Sahel's latitude gradient is the main signal:** the season runs 4–5
  months in the south, 1–2 months at 16–18°N; onset ~early May at 8–10°N,
  mid/late June at 10–12°N, mid-July to early August above 12°N. ~90 % of the
  rain falls Jun–Sep, peaking August.
- **The Guinea "August break" must be gated by LONGITUDE, not latitude** — it is
  driven by coastal upwelling, is strongest ~4–7°N between ~6°W and 2°E, and
  fades east of the Niger. ⚠️ Sources genuinely disagree (2–3 weeks vs ~2
  months). Recommended: an August-centred *relative minimum* in that box.
  Note the country Guinea (10–15°W) is **unimodal** and not this regime at all.
- **The Congo is bimodal only between ~5°N and 5°S**, unimodal at both ends, and
  the equatorial belt has **no dry month**. ⚠️ It is Africa's worst-gauged basin;
  1890 ground truth is essentially nil.
- **Ethiopia has two competing season schemes.** Use the meteorological one
  (belg Feb–May, kiremt Jun–Sep, bega Oct–Jan) for rainfall; the traditional
  four-season calendar (kiremt, *mekher* Sep–Nov, bega, belg) is the more
  period-authentic naming if the game ever says a season out loud.
- **The Cape is the one zone with real 1890 data** ✅ — the South African
  Astronomical Observatory series runs continuously from **1841**. Mean onset 13
  April, cessation 18 October. The 19th century had **longer, earlier-starting
  wet seasons** than today, with ~10 % more rain. Model Cape Town slightly wetter
  with a slightly longer, earlier season than modern normals.
  — https://cp.copernicus.org/articles/18/2463/2022/

---

## 4. The harmattan

**Months:** core **late November → mid-March**, worst in **January**.
**Extent:** ~**5°N to ~20°N** in winter — and its southern limit *is* the
convergence line sweeping south, so the dust front and the ITD are the same
thing. Dust reaches Cape Verde (~570 km offshore) routinely and settles on ships'
decks — usable on an 1890 sea approach.

**What it looks like — the useful part:** West African meteorology formally
classifies the haze, which gives ready-made rendering thresholds:

| Class | Visibility |
| --- | --- |
| Thick dust haze | **≤ 1,000 m** |
| Light dust haze | **5,000–10,000 m** |

So "harmattan haze" means **~1–10 km visibility**, the severe end comparable to
heavy fog and able to block the sun for days.

**Colour: render it red-ochre and DIMMING at ground level.** The period source is
explicit — the 1911 Britannica has "a high dense haze of **red dust which
darkens the air**"; Mungo Park (1799) has "a thick smoky haze; through which the
sun appears of a dull red colour". Modern satellite descriptions ("yellow",
"brown") look at the plume from above; a ground observer looks *through* it.
Dense harmattan is **not a glow**.

Three authoritative optical rules, all cheap to implement:

- Haze scatters all wavelengths roughly equally → **the sky loses its blue and
  goes whitish/grey**.
- A "milky pall that masks distant views".
- **Sunrises and sunsets lose their lustre; haloes may disappear altogether** —
  i.e. *mute* the sunset, against the intuitive "dust = spectacular sunset".

**Humidity/temperature:** ⚠️ the famous "RH under 5 %" is uncited. Honest values:
**RH ~15–25 % in the Sahel** (vs 50–70 % wet season), diurnal swing 15–20 °C.
The hot-vs-cold contradiction in the sources is real and resolvable: it is **cold
at dawn and hot by afternoon — the swing is the phenomenon**.

**Period voice** ✅ — Dobson's 1781 Royal Society paper is the primary source and
is quotable verbatim: "A fog or haze is one of the peculiarities which always
accompanies the Harmattan. The gloom occasioned by this fog is so great, as
sometimes to make even near objects obscure." / "The sun, concealed the greatest
part of the day, appears only about a few hours about noon, and then of a mild
red." / "No dew falls during the continuance of the harmattan." He also records
that it *stops epidemics* — the wind that dried out the fever coast — and gives
the etymology (Fante *aherramantah*, "to blow" + "grease", from the fat the
inhabitants rub on their skin against it; the 1911 Britannica repeats the
practice). The word has been English since 1671: an 1890 traveller says it
without explanation.
⚠️ The "doctor" nickname is **not attested in any period source** found; do not
use it as period voice.

- Dobson 1781, *Phil. Trans.* 71:46–57 (full OCR)
  — https://archive.org/download/bim_eighteenth-century_philosophical-transactio_royal-society-great-bri_1781_71/bim_eighteenth-century_philosophical-transactio_royal-society-great-bri_1781_71_djvu.txt
- Mungo Park 1799 — https://www.gutenberg.org/cache/epub/74976/pg74976.txt
- 1911 Britannica — https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Harmattan
- Anuforom 2007 (the haze classes, the latitudinal gradient)
  — https://www.sciencedirect.com/science/article/abs/pii/S1352231007006991

**The dust source is inside the game world:** the Bodélé Depression (~17°N 18°E,
north-east of Lake Chad) is the largest single dust source on Earth — ~50 % of
Saharan dust, emitting on 40 % of winter days.

**Not to be confused with the haboob** (Sudan/Sahel): a *summer* dust storm at
the **onset of the rains**, May–September, a wall of dust 1,000–2,000 m high
advancing at up to 70 km/h, visibility to zero, lasting up to 6½ hours, ~24/year
around Khartoum. Two different dust phenomena in two opposite seasons.

---

## 5. Snow and ice — where it genuinely occurs

**The governing number: the equatorial snow/ice equilibrium line is
4,500–4,800 m**, and the annual mean 0 °C isotherm sits at ~4,750 m. Below that
there is no permanent snow anywhere on the equator, in this era or any near it.

**Permanent ice — only three massifs, all >4,400 m:**

| Massif | Coords | Summit |
| --- | --- | --- |
| Kilimanjaro | 3.08°S, 37.35°E | 5,895 m |
| Mount Kenya | 0.15°S, 37.31°E | 5,199 m |
| Rwenzori | 0.39°N, 29.87°E | 5,109 m |

In 1890 model these at LIA extent (§1.2): Kilimanjaro's cap mostly **above
5,700 m** but reaching **~4,600 m** on the S/SW/W flanks (Meyer already blamed
"the unequal distribution of moisture on the northern and southern sides");
Mount Kenya with a *dozen real glaciers* down to ~4,600–4,700 m, not today's
patches; Rwenzori with **six+ glaciated peaks**, not today's three.

**Seasonal snow — only outside the tropics:**

| Massif | Coords | Months | Snowline |
| --- | --- | --- | --- |
| High Atlas / Toubkal (4,167 m) | 31.06°N, 7.92°W | **Nov–Apr**, harshest Feb–Mar; bare Jul–Aug | continuous >~2,800 m; settles to 1,400 m |
| Drakensberg (3,482 m) | ~29.4°S, 29.5°E | **Jun–Aug** (austral winter) | regular >2,000 m |

**Model these as BARE — the near misses matter:**

- **Mount Elgon (4,321 m)** — the threshold case: the highest African mountain
  completely free of glaciation. Misses the equilibrium line by <200 m.
- **Simien / Ras Dashen (4,550 m)** — transient only, Dec–Feb above ~4,200 m; no
  glacier (Ethiopia's rain is summer, so the high ground is dry when it is cold).
  ✅ Fine period pedigree though: Henry Salt recorded snow on 9 April 1814.
- **Mount Cameroon (4,040 m)** — occasional dusting; **no snowcap**.
- **Tibesti / Emi Koussi (3,415 m)** — snow about once every seven years.

**✅ Savanna and lowland Africa never see snow — physically, not just rarely.**
Savanna sits 3–4 km below the equatorial freezing level, and Little Ice Age
cooling in tropical Africa is worth a few hundred metres of equilibrium-line
depression, nowhere near the 3,000 m required.

⚠️ **The trap that generates "it snowed in Kenya" reports is HAIL** — in 2017
villages at ~2,300–2,600 m went white and the press called it snow; the Kenya
Meteorological Department refused the label. If the game ever wants white ground
below 4,000 m in East Africa, **hail is the only defensible mechanism**, and it
lasts hours.

- USGS Prof. Paper 1386-G (the equilibrium line) — https://pubs.usgs.gov/pp/p1386g/africa.pdf
- Cullen et al. 2006, GRL (the 0 °C isotherm) — https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2006GL027084

---

## 6. Hydrological lag — the water features must not peak with the rain

Rivers and lakes lag rainfall by 1–3 months. Three cases the game already models
as landmarks:

- **The Nile flood** ✅ — no Aswan dam until 1898–1902, so in 1890 the **natural
  flood is in full effect**. Driven by the Ethiopian *kiremt* rains (Jun–Sep) via
  the Blue Nile and Atbara: the rise begins at Aswan in **early June**, peaks
  **mid-September at Aswan**, and the maximum reaches **Cairo in October**. The
  game starts in Cairo — this is the most visible annual cycle in the world.
- **Victoria Falls** — peaks **April**, lowest **Oct–Dec** (the Zambian side can
  run dry); spray rises 400 m+ and is visible 30 km away in high water. Lags the
  upstream rains by 2–3 months.
- **The Sudd** — Arabic for "barrier"; absorbs more than half the water it
  receives, expanding hugely in the **Jul–Dec** wet season. ⚠️ Sources disagree
  wildly on extent (30,000→57,000 km² vs 42,000→90,000).

Also worth knowing: **1878 produced the highest Lake Victoria level on record**,
and Aswan flows indicate high Lake Victoria levels in 1879 and 1895–97. 19th
century African conditions "were much more extreme than anything evident in the
modern record" (Nicholson).

---

## 7. If period accuracy is ever pushed further

The one genuine period dataset covering the whole continent is **Nicholson's 19th
Century African Instrumental and Documentary Precipitation Data** (NOAA NCEI,
free text): 1801–1900, **90 regions with lat/lon**, a −3…+3 wetness index, plus
monthly mm from 451 gauges — and its own documentation notes the data is
"particularly plentiful for the 1880s and 1890s". It is directly machine-readable
and maps onto exactly the (date, lat, lon) signature the model needs.

- https://www.ncei.noaa.gov/pub/data/paleo/historical/africa/africa2001precip.txt
- Nicholson et al., *BAMS* 2012 — https://journals.ametsoc.org/bams/article/93/8/1219/60246/

## 8. Known unknowns — do not invent these

- A year-by-year record of which *kiremt*/*belg* rains failed 1888–92. Sources
  say "drought" without seasonal resolution.
- Kilimanjaro's true 1880/1890 ice extent (20 km² reconstructed vs 32 km²
  eyeballed vs Cullen endorsing neither pre-1912).
- Rwenzori's 1906 extent (6.5 vs 7.5 km²; 20 vs 43 named glaciers) — different
  methods on identical source data.
- Harmattan wind speed and winter dust-layer depth.
