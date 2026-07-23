# Geriatric Fauna: ageing, elderly behaviour and natural death (design.md §19)

Research basis for the **elderly-animal** mechanic: which of the game's rendered
animals realistically show old age, what an aged wild elephant / ungulate / big
cat actually **looks like** and **does** differently, and whether death of old
age — including the "elephant seeks water and dies there" pattern behind the
graveyard folklore — has a real biological kernel. Written before any code so the
mechanic is built from a researched per-species table rather than applied to
every animal alike. Sibling of `docs/intraspecies-combat-1890.md`,
`docs/climate-1890.md` and `docs/peoples-1890.md`.

The animals covered are those the game renders (`src/render/fauna.ts`, keyed to
`src/scenes/travel/wildlifeBehavior.ts` `PreyKind` / `PredatorKind`): **elephant,
giraffe, zebra, antelope/gazelle, wildebeest, warthog, lion, leopard, cheetah,
hyena, crocodile**. Buffalo is covered on the task's request because it is the
textbook old-solitary-male case, and flagged as **not currently in the rendered
roster**. Birds (vulture, flamingo, plover) and the grazer calves are not
plausible elderly subjects and are treated only where they bear on the dying
sequence (vultures).

The zoology below is stable on a century scale — molar wear, actuarial
senescence, dominance turnover and the bachelor-bull pattern are mechanisms, not
1890-specific facts — so, as in the combat doc, there is no modern-vs-period
split for the biology itself; the ~1890 framing is only the game's, and every
species named was present in sub-Saharan Africa then. The one genuinely
period-loaded item is the **graveyard folklore** (§4), which is treated as
folklore.

Evidence markers, extending the sibling docs' discipline:

| Marker | Meaning |
| --- | --- |
| **FIELD** | direct field observation / behavioural ethology of the wild species |
| **REVIEW** | secondary synthesis (species accounts, wildlife references, ageing guides) |
| **INFERRED** | reasoned from general mammalian biology; **not** directly attested for this species — treat as a hypothesis |
| **MYTH** | folklore, explicitly **not** supported by evidence — recorded to be marked as such, not built as fact |
| **GAP** | not well documented — do not over-assert |

The accuracy bar is the sibling docs': a hedged answer beats a confident wrong
one, myth is labelled myth, and inference is labelled inference.

---

## 1. What actually makes a wild animal look and act old

Two mechanisms drive almost everything below, and it is worth stating them once:

- **Tooth wear as the pacemaker of senescence.** In herbivores especially, the
  cheek teeth are a fixed capital that grinds down over a lifetime; when grinding
  efficiency falls the animal cannot extract enough energy, body condition
  collapses, and it dies — often of malnutrition rather than of any single named
  disease. This "dental senescence" is well established in wild ungulates: in roe
  deer, tooth wear is a direct correlate of weight loss
  ([Frontiers in Zoology, tooth wear & weight loss in roe deer](https://link.springer.com/article/10.1186/s12983-021-00433-w);
  [same, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8454088/)) — FIELD;
  in red deer, molar height declines with age and the wear rate is
  measurable and sex-dependent
  ([Nussey et al. 2007, J. Animal Ecology, red deer tooth wear & late-life reproduction](https://besjournals.onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-2656.2007.01212.x);
  [Loe et al. 2003, Oecologia, Norwegian red deer tooth wear](https://link.springer.com/article/10.1007/s00442-003-1192-9))
  — FIELD. The **elephant** is the extreme case of the same mechanism (§4).
- **Dominance turnover.** Prime adults win contests; past prime, an individual
  loses rank, loses fights, and in the social ungulates and cats is pushed out of
  the breeding core to the demographic edge — where predators take it. This is a
  behavioural, not merely cosmetic, ageing signal, and it is what makes an old
  animal *readable at a distance in the game* even before you can see a worn tooth.

Both produce the same downstream, renderable picture: an animal that is **thinner,
slower, more angular, off on its own, and easier to catch.** The species differ
in *how* they get there and in which cues are legible enough to draw.

---

## 2. Visible senescence cues — what reads as "old"

### 2.1 Ungulates (zebra, wildebeest, antelope/gazelle, giraffe, warthog, buffalo)

The legible cues, ranked by how well they render at the game's bird's-eye scale:

- **Body condition — the strongest cue.** An old ungulate losing the dental
  battle is **thin**: ribs, shoulder blade (scapular spine) and hip bones (pin
  bones) stand out, the topline hollows, and the belly tucks up. This follows
  directly from the tooth-wear→weight-loss link above (roe/red deer, FIELD;
  general to grinding herbivores by the same mechanism — INFERRED for the African
  species specifically, but the mechanism is not species-bound).
- **Sway-back / dropped topline.** A concave (sagging) spine and prominent
  withers/hips is the classic aged-equine silhouette and reads instantly on a
  zebra; it comes from muscle and connective-tissue loss over the back. Directly
  attested in domestic equids; **INFERRED** for wild zebra by homology — mark as
  inference, but it is a low-risk, high-legibility cue.
- **Duller, rougher, greyer coat.** Loss of coat gloss and condition, greying
  around the muzzle/face, a staring (rough, un-sleek) coat. General mammalian
  ageing; **REVIEW/INFERRED** for the specific species. Grey muzzle is a real,
  commonly-noted cue in aged mammals.
- **Worn / broken horns, tusks, teeth.** Buffalo bulls' bosses and horn tips
  wear and splinter with age (a standard field ageing cue for "dagga boys",
  below); warthog tusks chip; giraffe ossicones bald on top from a life of
  necking. **REVIEW.** At bird's-eye scale only the *silhouette* of a worn/broken
  horn is legible; tooth wear is not.
- **Gait — stiffer, slower, occasional limp.** Reduced speed and stamina and a
  stiffer stride are consistent with condition loss and old joints; a visible
  favouring/limp is plausible for an arthritic or old-injury animal. **INFERRED**
  as a species-specific claim; the *slower* part is the one to lean on because it
  is also behaviourally load-bearing (§3, §5).

**Legibility verdict for the game:** render old ungulates by (1) a **leaner,
more angular body** (the dominant cue), (2) a **sway-backed / dropped topline**,
(3) a **duller, greyer coat tint**, and optionally (4) **slower, stiffer
movement**. Horn/tusk wear is a nice-to-have silhouette detail. Do **not** rely
on tooth wear as a visual — it is the *cause*, not something the player can see.

### 2.2 Elephant

The elephant has the richest and most iconic set of legible old-age cues:

- **Worn or broken tusks** — a life of digging, stripping bark and fighting
  chips, cracks and blunts the tusks; very old bulls often carry asymmetric,
  broken or worn-down ivory. **REVIEW.**
- **Sunken temples and hollowing above the eyes / at the cheeks** as fat and
  muscle are lost — the "gaunt old elephant" look. **REVIEW/INFERRED.**
- **Prominent spine, shoulder blades and hips; loose, deeply wrinkled, sagging
  skin;** a generally **bonier frame.** **REVIEW.**
- **Large, ragged, more heavily notched/torn ears** and heavy overall wear.
  **REVIEW.**
- **Slower, more deliberate gait.** **INFERRED** (consistent with §4's
  end-of-life decline).

The **invisible but decisive** cue is the sixth molar wearing out (§4) — not
renderable, but it is the thing that *drives* the elephant's death and its move
to water.

### 2.3 Big cats and hyena (lion, leopard, cheetah, hyena)

Lions are the best-documented and give a template. Wildlife-ageing guides
converge on a small set of traits, of which several are legible:

- **Nose pigmentation darkens/greys with age** — a bright-pink young nose becomes
  mottled and grey; this is a standard field ageing criterion
  ([Lion Landscapes, Ageing Lions](https://www.lionlandscapes.org/ageing-lions);
  [Panthera, How to Age a Lion](https://panthera.org/blog-post/how-age-lion);
  [Panthera Field Notes / Miller, Medium](https://medium.com/panthera-field-notes/how-to-age-a-lion-ae3ed281b908))
  — FIELD/REVIEW.
- **Mane** (males) **darkens then thins** in old age — full-and-dark at prime,
  thin-haired in elders ([Lion Landscapes](https://www.lionlandscapes.org/ageing-lions);
  [Londolozi, How Old is That Lion?](https://blog.londolozi.com/2020/12/03/how-old-is-that-lion-part-1/))
  — REVIEW.
- **Teeth stain yellow and wear/break; jowls slacken and the lower lip sags;
  facial scarring accumulates** ([Lion Landscapes](https://www.lionlandscapes.org/ageing-lions);
  [Lion Aging Guide, Univ. Minnesota / Packer lab, PDF](https://cbs.umn.edu/sites/cbs.umn.edu/files/migrated-files/downloads/Lion_Aging_Guide-1.pdf))
  — REVIEW. Broken canines are a real, often-fatal handicap for an obligate
  killer.
- **Body condition falls** — an old, pushed-out male loses condition and looks
  gaunt and scarred; the wild male lifespan is short and the end is a visible
  wasting (§3.3).

For **leopard, cheetah, hyena** the specific ageing literature is thinner: greying
muzzle, dental wear/breakage, scarring and condition loss are the same
mammalian-carnivore cues (spotted hyenas in particular carry heavy tooth wear and
fracture from bone-cracking — REVIEW, from the carnivore dentition literature),
but a species-by-species legible-cue list is a **GAP**. For the game, treat the
three as **the lion template minus the mane**: greyer muzzle, more scars, leaner
frame, slower.

### 2.4 Crocodile

**GAP / not recommended.** Crocodiles are indeterminate/very slow growers with no
tidy external ageing cues at rendering distance, and they are already a
water-only ambush actor (§19.16). No elderly variant is proposed (§6).

---

## 3. Behavioural shifts with age

This is the load-bearing half for gameplay, because behaviour reads at a glance
where a worn tooth does not. Weighed per pattern:

### 3.1 The old solitary male — real, but species-specific

The "old bull turns solitary and gets picked off" image is **true for some
species and false-by-conflation for others.** Get this right per species:

- **Buffalo — the textbook case, strongly supported.** Old bulls past breeding
  are ousted from / drop out of the breeding herds and live alone or in tiny
  bachelor knots — the **"dagga boys"** — worn-horned, bald-patched, scarred, and
  **notably more vulnerable to lions** without the herd's collective defence,
  though they often shadow the herd's edge for exactly that protection
  ([African Dagga Boys](https://africandaggaboys.com/blog/dagga-boys);
  [Game Hunting Safaris, Dagga Boys](https://gamehuntingsafaris.com/knowledge-base/resources/dagga-boys-cape-buffalo);
  [Kapama, Dagga Boys](https://kapama.com/rangerblog/dagga-boys/);
  [Sun Safaris, why buffalo are dangerous](https://blog.sunsafaris.com/2018/04/the-buffalo-is-the-most-dangerous-of-the-big-five-heres-why/))
  — FIELD/REVIEW. Buffalo is **not rendered**, so this is the archetype to *port
  onto rendered species*, not to build directly.
- **Lion (males) — real, but it is prime-rival eviction, not merely "old age".**
  Males are driven from the pride by younger rivals (typically around ~8 years),
  then live as nomads at high risk — wounded, exhausted, hunting alone (which
  lions are bad at), preyed on by hyenas and other lions, and wasting toward death
  ([Scientific American, the short brutal life of a male lion](https://www.scientificamerican.com/article/the-fast-furious-and-brutally-short-life-of-an-african-male-lion/);
  [EWASH, male lions without a pride](https://www.ewash.org/what-happens-to-male-lions-without-a-pride))
  — REVIEW. Genuinely old survivors (e.g. the ~19-year-old Loonkiito, frail and
  wandering into a village for food) are the exception
  ([NBC News, Kenya lions](https://www.nbcnews.com/news/world/herders-kenya-kill-10-lions-countrys-oldest-rcna84389))
  — REVIEW.
- **Elephant (males) — DO NOT copy the buffalo pattern; it is the opposite.**
  Adult male elephants are *already* largely solitary or in loose bachelor
  associations as a normal life stage from puberty (~12–15 yr) — leaving the natal
  family is routine, not an old-age eviction — and **old bulls retain high status,
  not low:** they lead movements, moderate younger males, and are social
  repositories; musth secretion actually *strengthens into the 40s and then
  declines*
  ([Tsavo Trust, why males leave the herd](https://tsavotrust.org/why-do-male-elephants-leave-the-herd/);
  [Tsavo Trust, bachelor groups](https://tsavotrust.org/why-do-male-elephants-form-bachelor-groups/);
  [Africa Geographic, importance of bull elephants](https://africageographic.com/stories/bull-elephants-their-importance-as-individuals-in-elephant-societies/);
  [SeaWorld, elephant behavior](https://seaworld.org/animals/all-about/elephants/behavior/);
  [Wildlife SOS, musth](https://news.wildlifesos.org/everything-you-need-to-know-about-musth/))
  — REVIEW. So an old elephant's distinctive behaviour is **not** ostracism; it is
  the **dental decline and the move to water** (§4). Do not render "old elephant
  cast out of the herd."
- **Zebra, wildebeest, antelope/gazelle — weaker / partial.** Harem and
  territorial *males* that lose their harem or territory to a prime rival drift
  into bachelor groups (documented in the combat doc's dominance material), and
  any old, condition-poor grazer of either sex tends to fall to the **rear/edge of
  the herd**, which is precisely where predators cut — the classic "the old and
  the sick get taken" selection. But a strong "expelled solitary elder" is **not**
  the usual picture for the small/medium grazers the way it is for buffalo; over-
  rendering lone old zebras would be an overreach. **INFERRED / partial** — prefer
  "lags at the herd edge, easier to catch" over "lives alone."
- **Giraffe, warthog, cheetah, leopard, hyena — GAP** for a specific elderly-
  sociality claim. Leopards are solitary anyway; cheetah males may hold coalitions;
  hyena rank is clan-based. Do not assert an age-specific social shift for these.

### 3.2 Reduced speed, stamina and withdrawal from contests — well supported

Across all species, the safe, evidence-consistent behavioural shifts are:

- **Slower, less enduring movement** (condition loss + old joints) — INFERRED but
  low-risk and behaviourally central.
- **Withdrawal from intraspecific dominance contests / losing them.** An aged male
  no longer wins the rut/harem/pride fights of `intraspecies-combat-1890.md`; he
  stops contesting or loses when he does. This dovetails exactly with the combat
  doc: the elderly flag should make a male **decline or lose** those contests
  rather than start them. FIELD-consistent (turnover is why prime males hold the
  breeding core).
- **Increased vulnerability to predation** — the through-line of §3.1: thinner,
  slower, edge-of-herd or solitary animals are the ones predators select. This is
  the single most game-relevant behavioural consequence.

### 3.3 The end state — visible decline before death

For predators specifically, the end is a **wasting**: the ousted, injured, or
old-and-toothless cat cannot secure enough food, loses condition, and dies of
starvation/malnutrition compounded by injury — a *gradual* decline, not a sudden
event (Scientific American / EWASH above; general to the dental-senescence
mechanism for herbivores in §1). This is the biological warrant for a **rendered
dying process** rather than an instant despawn (§5).

---

## 4. Natural death of old age, and the "elephant graveyard"

This is the flagship question, so it gets its own section and an explicit
myth/reality split.

### 4.1 The molar biology (the real kernel)

An elephant does not have one set of grinding teeth but **six successive sets of
cheek molars that erupt and are pushed forward and shed across life**, roughly the
last coming into wear in the animal's 40s and worn out around **60–70**; after the
sixth set there is **no replacement**
([Tsavo Trust, how elephant teeth work](https://tsavotrust.org/how-do-african-elephant-teeth-work/);
[Save the Elephants, ageing from teeth (PDF)](https://www.savetheelephants.org/wp-content/uploads/2016/11/2005teethimpressions.pdf))
— REVIEW/FIELD. Maximum lifespan in a long-studied wild population is estimated at
**~74 years from tooth wear**
([Lee et al., PMC4748003, longevity & senescence in wild female elephants](https://pmc.ncbi.nlm.nih.gov/articles/PMC4748003/))
— FIELD (note: that paper studies reproductive senescence and uses tooth wear for
*ageing*, not to argue a death mechanism; cite it only for the longevity/tooth-
wear figure). When the last molars fail, the elephant can no longer grind coarse
grasses, bark and roots, loses condition, and **dies of starvation/malnutrition**
— which is described as the primary cause of death in old wild elephants (multiple
secondary accounts; REVIEW).

### 4.2 The near-water death — REAL basis

Because soft, water-rich forage (marsh and aquatic plants, soft new growth) is far
easier for worn dentition to process, **old, dentally-failing elephants shift
toward swamps, rivers and wetlands**, linger there on soft vegetation, and
frequently **die in those same places** — so bones do genuinely tend to
concentrate near water
([Elephant Sands, graveyard myth vs reality](https://elephantsands.com/elephant-graveyard-myth-vs-reality/);
[Biology Insights, do elephants have graveyards](https://biologyinsights.com/do-elephants-have-graveyards-the-scientific-truth/);
[HowStuffWorks, are there really elephant graveyards](https://animals.howstuffworks.com/animal-facts/are-there-really-elephant-graveyards.htm);
[Discover Wildlife, elephant graveyards](https://www.discoverwildlife.com/animal-facts/mammals/elephant-graveyards))
— REVIEW. Two other real clustering forces reinforce it: in **drought** many weak
animals die around the last shrinking water source, and bones simply **accumulate
at the water/shade/mineral sites where old animals congregate**
([Wikipedia, Elephants' graveyard](https://en.wikipedia.org/wiki/Elephants%27_graveyard))
— REVIEW.

### 4.3 The mass "graveyard" — MYTH

The idea of a **designated cemetery** that elephants purposefully travel to when
they sense death is **folklore with no supporting evidence**; Wikipedia states
plainly "there is no evidence in support of the existence of the elephants'
graveyard," and the observed bone clusters are explained by the ordinary causes
in §4.2 (death near water/soft forage, drought die-offs, long-term accumulation),
not by a death-instinct pilgrimage
([Wikipedia](https://en.wikipedia.org/wiki/Elephants%27_graveyard);
[Elephant Sands](https://elephantsands.com/elephant-graveyard-myth-vs-reality/))
— **MYTH**. (Elephants *do* show real interest in and investigation of the bones
of their dead — that part is genuine — but that is not a cemetery, and it is a
separate behaviour.)

**Game reconciliation.** The game already *has* an elephant graveyard as a
§4.4 landmark — a piece of deliberate, licensed folklore/atmosphere, not a
truth-claim. This research neither requires nor recommends removing it. What it
recommends is that the **mechanism** the game builds be the *real* one: an old,
dentally-failing elephant **drifts to water and dies there**, and the graveyard
landmark can be framed as *where those water-side deaths have accumulated* — which
is exactly the real-world explanation, so the folklore landmark and the accurate
mechanic can coexist honestly.

### 4.4 Vultures and the dying animal

Do vultures gather around a visibly weak/dying animal *before* death? The honest
verdict is **partly true, partly embellished:**

- **Embellished:** the popular image of vultures *patiently circling a doomed
  animal waiting for it to expire* is largely a myth — soaring vultures are mostly
  riding thermals to search a wide area, not orbiting one victim, and they key
  primarily on **death** and on the activity of other scavengers/predators
  ([Live Science, why do vultures circle](https://www.livescience.com/animals/birds/why-do-vultures-circle);
  [Slate, vultures know where animals go to die](https://slate.com/technology/2014/02/vultures-know-where-animals-go-to-die-feeding-strategies-by-season.html))
  — REVIEW.
- **Real:** vultures **do** detect and respond to **downed, distressed or injured**
  animals, gather **very fast** once one bird descends (others pile in within
  minutes), and typically **perch in nearby trees and wait/assemble before
  committing to feed** — hovering/gathering vultures are a well-known field signal
  of a dead *or downed/injured* animal
  ([MDC, vulture facts](https://mdc.mo.gov/wildlife/wildlife-facts/bird-facts/vulture-facts);
  [Avian Report, black vulture food habits](https://avianreport.com/black-vulture-food-habits/))
  — REVIEW.

So a **renderable, defensible** sequence is: as an animal becomes visibly weak,
vultures begin to **gather and circle/perch nearby**, and they **descend once it
goes down**. This is also exactly what the game already does at pt. 22 (vultures
circle a traveller in poor condition) — the elderly mechanic can reuse that
system as a stylised-but-grounded death omen.

---

## 5. A realistic, renderable dying sequence

Synthesising §3.3, §4 and §4.4 into stages the engine can drive (the biology is
progressive decline, not a switch — so stage it):

1. **Aged (chronic).** The animal carries the elderly appearance (§2) and
   behaviour (§3): leaner, greyer, slower, edge-of-herd or solitary (per species),
   declines/loses intraspecies contests, and is preferentially targeted by
   predators. It can persist in this state a long time. **Most old animals die
   here — taken by a predator — and never reach stage 2.**
2. **Failing (terminal, natural death only).** Condition crosses a threshold
   (the dental/starvation endpoint, or the elephant's molar failure): movement
   slows further, feeding falters, the animal drifts toward water (elephants
   especially, §4.2), and **vultures begin to gather/circle** (§4.4).
3. **Collapse.** The animal goes down and dies — dropping into the game's
   **ordinary carcass system** (not a bespoke body path), where vultures **descend**
   and the existing scavenger/vulture logic consumes it. For an elephant, the death
   site is at/near water and can feed the §4.4 graveyard framing (bones/tusks
   accumulate there).

This maps cleanly onto systems the game already owns: the carcass/vulture
pipeline, the "every started drama resolves" invariant (I4, point 186 — a dying
animal that streams out or is claimed by a predator must resolve, never pin), and
the poor-condition vulture omen of pt. 22.

---

## 6. Recommendation — per species-group, concrete in-game traits

**Scope:** apply the elderly variant to the species where it reads and is
supported. Keep every rate/threshold a low, **debug-editable** balance value
(CLAUDE §2 / §21), respect the region pools (`REGION_PREY` / `REGION_PREDATORS`,
point 208 A2/A3) so an elderly individual only appears where its species lives,
and route every natural death through the **ordinary carcass system**.

| Species-group | Elderly variant? | Visual cues to render | Behaviour set | Dies of old age? |
| --- | --- | --- | --- | --- |
| **Elephant** | **Yes (flagship)** | worn/broken tusks, sunken temples, gaunt/bony frame, sagging wrinkled skin, ragged ears, slower gait | keeps normal high status (NOT ousted); when *failing*, drifts to water/soft forage and slows | **Yes** — molar-failure wasting → **dies at/near water** → feeds §4.4 graveyard framing |
| **Grazers: zebra, wildebeest, antelope/gazelle** | **Yes** | leaner/angular body, sway-backed dropped topline, duller greyer coat; worn horns (silhouette) | slower; lags at **herd rear/edge**; old males lose harem/territory and drift to bachelor; **preferentially targeted by predators**; declines/loses intraspecies contests | **Rarely** — usually taken by a predator first; a low natural-death rate is fine |
| **Giraffe** | **Yes (light)** | leaner frame, duller coat, balded/worn ossicone tops | slower; loses necking contests; more catchable | Rarely (predator-taken first) |
| **Warthog** | **Yes (light)** | leaner, duller, worn/chipped tusks | slower; loses boar shoving; more catchable | Rarely |
| **Buffalo** *(not rendered)* | archetype only | worn/splintered horns & boss, bald scarred hide, gaunt | **dagga-boy**: ousted, solitary/bachelor, shadows herd edge, **very predator-vulnerable** | Sometimes — port this pattern onto rendered species, don't build directly |
| **Lion** | **Yes** | greyer/mottled nose, **thinning mane** (males), yellow/worn/broken teeth (implied), slack jowls/sagging lip, scars, gaunt | ousted male → nomad, hunts poorly alone, high risk; declines pride contests | **Yes** — wasting/starvation end (a rendered decline) |
| **Leopard, cheetah, hyena** | **Yes (light, = lion minus mane)** | greyer muzzle, more scars, leaner, worn teeth (implied) | slower, more catchable, withdraws from contests | Low natural-death rate; usually predator/rival end |
| **Crocodile** | **No** (§2.4) | — | — | No |
| **Vulture / flamingo / plover / calves** | **No** | — | — | No (vultures act *on* the dying animal, §4.4) |

### 6.1 Implementation brief — elderly grazers & cats (the common path)

- **Appearance schema:** add an `elderly` build flag to the fauna builders that
  applies (a) a leaner/angular body scale, (b) for quadruped grazers a sway-backed
  topline tweak, (c) a duller/greyer coat tint, and (for males where it applies)
  worn-horn/thin-mane variants. All cosmetic; no new mesh topology required.
- **Behaviour:** an elderly individual moves at a reduced speed factor
  (`balance.elderly.speedFactor`, debug-editable); it **declines or loses**
  intraspecific contests from `intraspecies-combat-1890.md` (never initiates as a
  prime male would); it biases to the **herd edge/rear**; and it is a **preferred
  predator target** (raise its selection weight in the hunt's target pick). Reuse
  the region pools so it only spawns where the species lives.
- **Natural death:** a **low** per-day natural-death roll (`balance.elderly.deathRate`,
  debug-editable) that, when it fires, runs the §5 stage 2→3 sequence: slow →
  vultures gather (reuse the pt. 22 poor-condition vulture omen) → collapse into
  the **ordinary carcass system**. Most elderly animals should be **predator-taken
  before** this fires — that is realistic and keeps the natural-death event rare.
- **Invariant:** honour I4 (point 186) — a dying animal claimed by a predator or
  streamed out must resolve, never pin; give the dying sequence a hard deadline.

### 6.2 Implementation brief — elderly elephant (the flagship, distinct path)

- **Appearance:** `elderly` elephant build = worn/broken tusks, sunken temples,
  gaunt bony frame, sagging skin, ragged ears, slower gait.
- **Behaviour — DO NOT ostracise it.** An old bull keeps normal herd/solitary
  status (adult male elephants are already solitary/bachelor by life stage; old
  bulls are high-status, §3.1). The distinctive elderly behaviour is the **terminal
  drift to water**: when the elephant crosses the failing threshold it **slows and
  heads for the nearest river/lake/soft-forage water cell** and lingers.
- **Natural death & graveyard:** on reaching water in the failing state (or after
  a debug-editable window), it **dies at/near the water** into the ordinary carcass
  system; vultures gather then descend (§4.4). This is the *real* mechanism behind
  the folklore — so wire the death site to reinforce the existing §4.4 **elephant
  graveyard** landmark (bones/tusks accumulating at water-side death sites) rather
  than inventing a pilgrimage to a fixed cemetery (that pilgrimage is **myth**, §4.3).
- **Rates:** elephant natural death is the *showpiece* but must stay rare —
  low `balance.elderly.elephant.deathRate`, all thresholds debug-editable.

---

## 7. Further fitting geriatric traits the research surfaced

- **Broken canine = a real death sentence for a cat** — a legitimate, grounded
  reason an old lion/leopard starves; could flavour a natural-death journal entry.
- **Grey muzzle** is the single cheapest cross-species "old" tint and applies to
  every mammal here.
- **Drought concentration** (§4.2) — old/weak animals dying around the last water
  in the dry season — dovetails with the existing seasonal shore-catchment system
  (§19.13) and would make elderly deaths cluster believably at water in the dry
  season without new machinery.
- **Elephants investigating their dead** is real (distinct from the graveyard
  myth) and would be an evocative, accurate atmosphere beat if the game ever wants
  it — but it is a *separate* behaviour, out of scope here; flagged, not specced.

---

## 8. Known unknowns — do not invent these

- **Species-specific legible ageing cues for leopard, cheetah, hyena, giraffe,
  warthog** beyond the general mammalian set — **GAP**. The recommendation treats
  them as "the lion/ungulate template," which is a reasoned default, not attested
  per species.
- **Sway-back in wild zebra** is **INFERRED** from domestic-equine homology, not a
  cited wild-zebra observation.
- **Whether small/medium grazers truly go solitary in old age** — the evidence
  supports "falls to the herd edge / predator-taken," not "lives alone like a
  dagga boy." Do not over-render lone old zebras/gazelles.
- **Natural-death rates** are game-calibration guesses, not measured field rates —
  keep them debug-editable and never present them as data (as in the combat doc).
- **Exact age thresholds** for the "failing" stage per species — the elephant has
  a real figure (~60–70 yr molar failure); the others do not have a clean number
  and should be modelled by a **condition threshold**, not an age counter.

---

## 9. Sources

Elephant molars, senescence & longevity:
- [Tsavo Trust — How do African elephant teeth work?](https://tsavotrust.org/how-do-african-elephant-teeth-work/)
- [Save the Elephants — Estimating age from teeth (PDF)](https://www.savetheelephants.org/wp-content/uploads/2016/11/2005teethimpressions.pdf)
- [Lee, Fishlock, Webber, Moss & Poole — Longevity & senescence in wild female African elephants, PMC4748003](https://pmc.ncbi.nlm.nih.gov/articles/PMC4748003/)

Elephant graveyard — folklore vs reality:
- [Wikipedia — Elephants' graveyard](https://en.wikipedia.org/wiki/Elephants%27_graveyard)
- [Elephant Sands — Elephant graveyard: myth vs reality](https://elephantsands.com/elephant-graveyard-myth-vs-reality/)
- [Biology Insights — Do elephants have graveyards?](https://biologyinsights.com/do-elephants-have-graveyards-the-scientific-truth/)
- [HowStuffWorks — Are there really elephant graveyards?](https://animals.howstuffworks.com/animal-facts/are-there-really-elephant-graveyards.htm)
- [Discover Wildlife — Elephant graveyards](https://www.discoverwildlife.com/animal-facts/mammals/elephant-graveyards)

Elephant bull sociality & musth (why old bulls are NOT ousted):
- [Tsavo Trust — Why do male elephants leave the herd?](https://tsavotrust.org/why-do-male-elephants-leave-the-herd/)
- [Tsavo Trust — Why do male elephants form bachelor groups?](https://tsavotrust.org/why-do-male-elephants-form-bachelor-groups/)
- [Africa Geographic — Bull elephants, importance as individuals](https://africageographic.com/stories/bull-elephants-their-importance-as-individuals-in-elephant-societies/)
- [SeaWorld — All about elephants: behavior](https://seaworld.org/animals/all-about/elephants/behavior/)
- [Wildlife SOS — Everything about musth](https://news.wildlifesos.org/everything-you-need-to-know-about-musth/)

Buffalo "dagga boys" — old solitary males:
- [African Dagga Boys — The truth behind the name](https://africandaggaboys.com/blog/dagga-boys)
- [Game Hunting Safaris — Dagga boys](https://gamehuntingsafaris.com/knowledge-base/resources/dagga-boys-cape-buffalo)
- [Kapama — Dagga boys](https://kapama.com/rangerblog/dagga-boys/)
- [Sun Safaris — Why buffalo is the most dangerous of the Big Five](https://blog.sunsafaris.com/2018/04/the-buffalo-is-the-most-dangerous-of-the-big-five-heres-why/)

Lion ageing cues & nomad decline:
- [Lion Landscapes — Ageing Lions](https://www.lionlandscapes.org/ageing-lions)
- [Panthera — How to Age a Lion](https://panthera.org/blog-post/how-age-lion)
- [Panthera Field Notes (Miller) — How to Age a Lion](https://medium.com/panthera-field-notes/how-to-age-a-lion-ae3ed281b908)
- [Londolozi — How Old is That Lion? Part 1](https://blog.londolozi.com/2020/12/03/how-old-is-that-lion-part-1/)
- [Univ. Minnesota / Packer lab — Lion Aging Guide (PDF)](https://cbs.umn.edu/sites/cbs.umn.edu/files/migrated-files/downloads/Lion_Aging_Guide-1.pdf)
- [Scientific American — The fast, furious, brutally short life of a male lion](https://www.scientificamerican.com/article/the-fast-furious-and-brutally-short-life-of-an-african-male-lion/)
- [EWASH — What happens to male lions without a pride](https://www.ewash.org/what-happens-to-male-lions-without-a-pride)
- [NBC News — 10 lions killed in Kenya (Loonkiito, ~19 yr)](https://www.nbcnews.com/news/world/herders-kenya-kill-10-lions-countrys-oldest-rcna84389)

Ungulate dental senescence / tooth wear ↔ body condition:
- [Frontiers in Zoology — Tooth wear as a correlate of weight loss in roe deer](https://link.springer.com/article/10.1186/s12983-021-00433-w)
- [Same, PMC8454088](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8454088/)
- [Nussey et al. 2007, J. Animal Ecology — Red deer tooth wear & late-life reproduction](https://besjournals.onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-2656.2007.01212.x)
- [Loe et al. 2003, Oecologia — Norwegian red deer tooth wear](https://link.springer.com/article/10.1007/s00442-003-1192-9)

Vultures & dying/downed animals:
- [Live Science — Why do vultures circle?](https://www.livescience.com/animals/birds/why-do-vultures-circle)
- [Slate — Vultures know where animals go to die](https://slate.com/technology/2014/02/vultures-know-where-animals-go-to-die-feeding-strategies-by-season.html)
- [Missouri Dept. of Conservation — Vulture facts](https://mdc.mo.gov/wildlife/wildlife-facts/bird-facts/vulture-facts)
- [Avian Report — Black vulture food habits](https://avianreport.com/black-vulture-food-habits/)

---
---

# Bird flight, escape and aerial predators (design.md §19)

A second, self-contained fauna-behaviour research topic hosted in this file
(the geriatric research above is §§1–9; this is a distinct study, so it carries
its own section numbering B1–B6 and its own sources). Written before any code so
the **bird-flight-escape** and **aerial-predator** mechanics are built from a
researched per-species/per-region table rather than by assumption. It reuses the
**FIELD / REVIEW / INFERRED / MYTH / GAP** marker discipline defined in the
table near the top of this file, and the same accuracy bar: a hedged answer
beats a confident wrong one, myth is labelled myth, inference is labelled
inference.

The birds the game renders today are **ground / shore / scavenger** types:
**vultures** (soaring scavengers), a **ground-nesting plover with chicks**,
**shore/wading birds (flamingos)**, and **general small grazing-area birds**.
The two mechanics under study are: (1) making flight-capable prey birds **escape
ground predators and large mammals by flying off**, and (2) adding
**region-appropriate aerial predators (raptors) that hunt birds** — but only
where realistic. The ornithology below is stable on a century scale (flight
mechanics, raptor hunting modes, predator–prey aerodynamics are mechanisms, not
1890-specific facts); every species named was present in its African range in
the ~1890 wild state, so — as in the geriatric study — there is no
modern-vs-period split for the biology, only the game's ~1890 framing. Modern
ornithology is used for the biology and cited honestly.

---

## B1. Bird flight escape — do prey birds fly off, and is the "caught only on the ground" model right?

**The core model the game proposes — "a ground predator can only catch a bird it
surprises still on the ground (a late take-off), not one already airborne" — is
a sound first-order abstraction of a real principle.** REVIEW/INFERRED (it is a
game abstraction of well-attested biology, not a single cited law):

- For nearly all **volant** (flight-capable) birds, the primary escape from a
  terrestrial predator **is flight** — taking to the air is the decisive
  advantage a bird has over a ground hunter
  ([Birdfact — how birds avoid predators](https://www.birdfact.com/articles/how-do-birds-avoid-predators);
  [Stanford — Raptor Hunting](https://web.stanford.edu/group/stanfordbirds/text/uessays/uRaptor_Hunting.html))
  — REVIEW.
- Ground predators evolved **stealth and surprise precisely because they cannot
  catch a flying bird**; the vulnerability window is therefore **on the ground
  and during take-off** — exactly the game's model
  ([Birdful — how birds survive predators](https://www.birdful.org/how-do-birds-survive-predators/))
  — REVIEW. Ground/brush birds (grouse, francolins, quail — the gamebird build)
  **burst-flush** explosively off the ground thanks to low wing loading, and
  small birds launch to flight in milliseconds
  ([Birdful — can birds take off from the ground](https://www.birdful.org/can-birds-take-off-from-the-ground/))
  — REVIEW. So "already airborne = safe from the ground predator; the danger is
  the **late** take-off" is a defensible rule.

**Nuances that the model must respect:**

- **Flightless birds run and kick — they do NOT fly.** The ostrich cannot fly;
  it escapes by **running** (~70 km/h) and delivers a dangerous **kick** in
  defence. INFERRED/REVIEW (textbook ratite biology). *No ostrich is in the
  rendered roster today* — flagged as the archetype **if a flightless bird is
  ever added**: give it run/kick, never fly-to-escape.
- **The nest is the exception to "just fly away."** Ground-nesters cannot abandon
  eggs/immobile chicks by flying, so they switch to **active nest defence**:
  loud alarm-calling, **low swooping/mobbing** attacks with the feet, and the
  classic **broken-wing distraction display** that lures a predator away
  ([Johnston & Jeff — ground-nesting birds](https://johnstonandjeff.co.uk/ground-nesting-birds/);
  [EarthLife — lapwings](https://earthlife.net/lapwings/);
  [Behavioral Ecology — distraction behaviour & nest survival](https://academic.oup.com/beheco/article/28/1/260/2453523);
  [Cornell — Piping Plover life history](https://www.allaboutbirds.org/guide/Piping_Plover/lifehistory))
  — FIELD/REVIEW.
- **Chicks and eggs can be caught; the incubating adult can be surprised at the
  nest.** Precocial wader/plover chicks cannot yet fly and instead **crouch,
  freeze and rely on camouflage**; eggs are cryptic; and an adult flushed **late
  off the nest** is the very "surprised on the ground" case
  ([EarthLife — lapwings](https://earthlife.net/lapwings/))
  — FIELD/REVIEW.
- **A laborious take-off is a longer vulnerable window.** Big, heavy waterbirds
  (flamingos) need a **running start** across water/ground before they are
  airborne — a real, extended "late take-off" exposure that raptors and eagles
  exploit at colonies (§B2). INFERRED from flight-mechanics + the colony-
  predation records below.

**Which game bird types fly to escape vs. don't:**

| Game bird | Flies to escape a ground predator? | Model |
| --- | --- | --- |
| **Small grazing-area birds** | **Yes** — fast burst launch | Airborne = safe from ground hunters; catchable only on a surprised/late take-off |
| **Flamingo (shore/wading)** | **Yes**, but with a **laborious running take-off** | Give it a slower escape flush → a real vulnerable window; the main threat is aerial (fish eagle / falcon), §B2 |
| **Ground-nesting plover — ADULT** | **Yes**, and additionally **mobs / broken-wing displays** at the nest | Flies off normally; at the nest switches to active defence rather than fleeing |
| **Ground-nesting plover — CHICKS / eggs** | **No** — chicks **crouch/freeze**, eggs are cryptic | Catchable by a ground predator; parent defends via distraction, not flight |
| **Vulture** | Flies, but **not a prey subject** — huge soaring scavenger | Not a fly-to-escape target; leave as-is |
| **(Ostrich — not in roster)** | **No — runs and kicks** | The flightless archetype if ever added; never fly-to-escape |

---

## B2. Aerial predators (raptors) that take birds — hunting modes and per-region table

Bird-hunting raptors fall into **three attack modes**, and the distinction is
what decides whether a "surprise from above the prey doesn't see in time" is
realistic for a given species:

1. **STOOP / DIVE from height (the peregrine style).** The raptor climbs **above**
   its prey, then plunges in a near-vertical high-speed dive to strike a bird
   **in flight** from above. This is the mode for which "attack from above,
   unseen in time" is **literally accurate**: high-speed cinematography and
   physics simulation confirm the peregrine ascends, tucks and stoops at
   200+ mph, striking from above with the dive itself maximising catch success
   against agile prey and giving the element of surprise
   ([PLOS Comput. Biol. — physics of peregrine stoops (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5896925/);
   [Physics World — falcon dive forces](https://physicsworld.com/a/falcons-high-speed-dive-generates-forces-needed-to-catch-agile-prey/);
   [Audubon — why peregrines are so deadly](https://www.audubon.org/news/research-reveals-exactly-why-peregrine-falcons-are-so-deadly);
   [Stanford — Raptor Hunting](https://web.stanford.edu/group/stanfordbirds/text/uessays/uRaptor_Hunting.html))
   — FIELD/REVIEW. **Falcons** (peregrine, barbary, lanner, taita) and two
   **bird-hunting eagles** (Ayres's hawk-eagle, African hawk-eagle) use it.
2. **TAIL-CHASE / AMBUSH FROM COVER (the accipiter style).** The hawk waits on a
   **concealed perch**, then bursts out in a fast, agile **level dash** and
   tail-chases the prey, often into cover. The surprise is **from concealment at
   the prey's own level**, NOT from high above — so a stoop-from-the-sky model is
   *wrong* for these species
   ([Peregrine Fund — Gabar Goshawk](https://peregrinefund.org/explore-raptors-species/hawks/gabar-goshawk);
   [avibirds — Black Sparrowhawk](https://avibirds.com/black-sparrowhawk/);
   [Britannica — sparrowhawk](https://www.britannica.com/animal/sparrowhawk))
   — FIELD/REVIEW. **Accipiters** (black sparrowhawk, African goshawk, gabar
   goshawk, the small sparrowhawks/shikra) use it.
3. **LOW QUARTERING / SURFACE SNATCH (harriers; fish eagle at colonies).** True
   harriers **quarter low** over ground and reeds and flush/grab small birds and
   nestlings; the African fish eagle **snatches waterbirds (incl. flamingos)
   from the water surface** in a fast low glide. Surprise from **low and fast**,
   not from height ([SafariBookings — African Fish Eagle facts](https://www.safaribookings.com/blog/5-fascinating-facts-about-the-african-fish-eagle);
   [A-Z Animals — African Fish Eagle](https://a-z-animals.com/animals/african-fish-eagle/))
   — REVIEW (harrier quartering is general/REVIEW here, not deeply sourced —
   treat as the lighter recommendation).

**Is "surprise from above the prey doesn't see in time" realistic?** **Yes for
the falcon guild and the two bird-hunting hawk-eagles** (mode 1) — that is
exactly the peregrine stoop, and Ayres's hawk-eagle uses a "falcon-like highly
aerial method... stoops to intercept [birds] in mid-air"
([Wikipedia — Ayres's hawk-eagle](https://en.wikipedia.org/wiki/Hieraaetus_ayresii);
[Peregrine Fund — Ayres's Hawk-eagle](https://peregrinefund.org/explore-raptors-species/eagles/ayres-hawk-eagle);
[animalia — African hawk-eagle (stooping flight)](https://animalia.bio/african-hawk-eagle))
— FIELD/REVIEW. **No** for the accipiters (surprise is from cover, not height)
and the harriers/fish eagle (low, not high).

### B2.1 Per-region aerial-predator table (game regions: North / West / Central / East / South)

Assigns each raptor to the game's five regions with its typical **prey birds**
and **attack mode**. Ranges are REVIEW from the species accounts cited; a species
listed in a region means it realistically occurs and hunts birds there in the
~1890 wild state. Where a range edge is uncertain it is marked.

| Region | Aerial predator | Prey birds it takes | Attack mode |
| --- | --- | --- | --- |
| **North** (Sahara/Maghreb/Nile) | **Barbary falcon** | doves, larks, migrant passerines, small waders | **STOOP** — takes birds mid-flight at high speed in semi-desert ([earthlife](https://earthlife.net/barbary-falcons/); [europeanraptors](https://europeanraptors.org/barbary-falcon/)) |
| | **Peregrine falcon** (resident + migrant) | pigeons, doves, waders, ducks | **STOOP** |
| | **Lanner falcon** | doves, larks, small–medium birds, gamebirds | **STOOP + level chase** ([Peregrine Fund — Lanner](https://peregrinefund.org/explore-raptors-species/falcons/lanner-falcon)) |
| | **Eleonora's falcon** (coastal/island, seasonal) | **migrating passerines over the sea** | mostly **level manoeuvring**, also climbs/dives ([Animal Diversity Web](https://animaldiversity.org/accounts/Falco_eleonorae/); [Behav. Ecol. aerial hunting](https://academic.oup.com/beheco/article/12/2/150/239902)) |
| | **Bonelli's eagle** (Atlas/Maghreb) | gamebirds, pigeons, medium birds (+ mammals) | fast **dashing** attack ([Wikipedia](https://en.wikipedia.org/wiki/Bonelli's_eagle)) |
| **West** (Sahel/Guinea savanna & forest) | **Peregrine**, **Lanner** | doves, small birds, gamebirds | **STOOP** (Lanner also level chase) |
| | **African hawk-eagle** | francolins, guineafowl, doves (gamebirds) | **STOOP/dash**, often cooperative pairs ([animalia](https://animalia.bio/african-hawk-eagle)) |
| | **Ayres's hawk-eagle** | doves, pigeons, small birds | **STOOP / aerial intercept** (bird specialist) |
| | **Black sparrowhawk**, **African goshawk**, **Gabar goshawk** | doves, pigeons, weavers, waxbills, small birds | **AMBUSH from cover + tail-chase** ([Peregrine Fund — African Goshawk](https://peregrinefund.org/explore-raptors-species/hawks/african-goshawk)) |
| | **African fish eagle** (rivers) | ducks, waterbirds snatched from surface | **low glide snatch** |
| **Central** (Congo forest & clearings) | **Ayres's hawk-eagle** | forest doves/pigeons, small birds | **STOOP / aerial intercept** |
| | **African goshawk**, **Black sparrowhawk** | forest doves, pigeons, small birds | **AMBUSH from cover** (canopy favours ambush over the open stoop) |
| | **African fish eagle** (rivers/lakes) | waterbirds from the surface | **low glide snatch** |
| | *(deep-forest raptor specialists — GAP, not named to avoid over-assertion)* | — | — |
| **East** (Rift, savanna, soda lakes) | **Peregrine**, **Lanner** | doves, gamebirds, small–medium birds | **STOOP** (Lanner also level chase) |
| | **Taita falcon** (cliffs, **rare/localised**) | swifts, doves, small birds | **STOOP** |
| | **African hawk-eagle**, **Ayres's hawk-eagle** | francolins, guineafowl, doves, pigeons | **STOOP/dash** |
| | **Black / African / Gabar goshawks** | doves, pigeons, small birds | **AMBUSH from cover + tail-chase** |
| | **African fish eagle** | **flamingos** & waterbirds at soda lakes (Nakuru/Bogoria) | **low glide snatch** ([SafariBookings](https://www.safaribookings.com/blog/5-fascinating-facts-about-the-african-fish-eagle); [A-Z Animals](https://a-z-animals.com/animals/african-fish-eagle/)) |
| | *(wintering harriers — quarter low over wetlands, lighter/REVIEW)* | small birds, nestlings | **LOW QUARTER** |
| **South** (highveld, bushveld, Cape, wetlands) | **Peregrine**, **Lanner**, **Taita** (rare) | doves, gamebirds, small–medium birds | **STOOP** |
| | **African hawk-eagle**, **Ayres's hawk-eagle** | francolins, guineafowl, doves, pigeons | **STOOP/dash** |
| | **Black sparrowhawk** (very characteristic), **Gabar / African goshawk** | doves, pigeons, small birds | **AMBUSH from cover + tail-chase** |
| | **African marsh harrier** (wetlands, lighter/REVIEW) | small birds, nestlings | **LOW QUARTER** |
| | **African fish eagle** | ducks, waterbirds from the surface | **low glide snatch** |

**Reading of the table for the game:** the **stoop guild** (falcons + Ayres's/
African hawk-eagle) is the one that fits a dramatic dive-from-above; it spans
**all five regions** (with Barbary/Eleonora's/Bonelli's the North-only
additions, and the hawk-eagles absent from the deep North desert). The
**ambush/tail-chase guild** (accipiters) spans West/Central/East/South and is
the accurate model wherever there is cover. The **fish eagle** is the honest way
to give **flamingos** an aerial predator (surface snatch), and is the standout
East-African soda-lake fact.

---

## B3. Flight-height layering and the stoop-dive mechanic — is it plausible, and should the game build it?

**Is it plausible that prey fly in a lower band while a raptor attacks from a
higher one?** For the **falcon guild, yes and it is well-supported** — the
peregrine literally **climbs above its prey and stoops down** on it, and the
physics of the high-speed near-vertical dive are exactly why the attack works
([PLOS Comput. Biol. (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5896925/);
[Physics World](https://physicsworld.com/a/falcons-high-speed-dive-generates-forces-needed-to-catch-agile-prey/))
— FIELD/REVIEW. The prey side is symmetric: smaller birds **out-climb** larger
predators, so **climbing is a common escape**, and prey near cover **dive to
shelter**; level tail-chases usually favour the falcon
([Behav. Ecol. — aerial hunting & escape strategies](https://academic.oup.com/beheco/article/12/2/150/239902);
[Behav. Ecol. — escape tactics, ecology & aerodynamics](https://academic.oup.com/beheco/article/21/1/16/179705))
— REVIEW. So a **vertical layering** (raptor high → prey lower → dive) is
biologically real for falcons, **not** a myth.

**But the engineering question is separate from the biology.** The game's birds
are currently simple ground/shore actors with no altitude dimension. Building a
**true 3D flight-height simulation** — persistent altitude bands for every bird,
a raptor circling above, a physically-modelled stoop — is heavy machinery for a
niche interaction, and **the majority of the region table (accipiters, harriers,
fish eagle) does not use height at all** — they ambush from cover or snatch low.

**Verdict — build the stoop, but not a full flight-height physics layer.** The
dive-from-above is well-supported enough that it should **not** be discarded for
the falcon guild — but it should be built as a **scripted "descend-and-strike"
attack event** (the raptor enters from high/off the top of the frame, plunges on
the airborne prey, strikes, and the drama resolves), **not** as a persistent
altitude coordinate simulated for every bird. For the **accipiter/harrier/fish-
eagle majority**, model an **air-catch tail-chase / low ambush** instead — that
is the accurate mode for them and is simpler. If the team wants only **one**
mechanic across all raptors, keep the simpler **air-catch chase** and merely
render the falcon's approach as a steep dive — do **not** invest in a full
flight-height level system.

---

## B4. Recommendation and implementation brief

**Per-region aerial-predator recommendation (short):**
- **North:** Barbary falcon + Peregrine + Lanner (all **stoop**); Eleonora's
  falcon as a seasonal **coastal** migrant-hunter; Bonelli's eagle (dash) in the
  Atlas. No hawk-eagles in the deep desert.
- **West:** Peregrine/Lanner (stoop) + African & Ayres's hawk-eagle (stoop/dash,
  gamebirds & doves) + black/African/gabar goshawk (**ambush**) + fish eagle on
  rivers.
- **Central (forest):** ambush dominates — African goshawk + black sparrowhawk;
  Ayres's hawk-eagle for the aerial intercept in clearings; fish eagle on the
  rivers. (Deep-forest specialists left as a GAP.)
- **East:** Peregrine/Lanner (+ rare Taita) stoop; African & Ayres's hawk-eagle;
  goshawks ambush; and the signature **African fish eagle taking flamingos** at
  the soda lakes.
- **South:** Peregrine/Lanner (+ rare Taita) stoop; African & Ayres's hawk-eagle;
  black sparrowhawk very characteristic (ambush); African marsh harrier over
  wetlands (light); fish eagle.

**Verdict on the stoop-dive-from-above:** **BUILD IT** for the **falcon guild +
Ayres's/African hawk-eagle** — the evidence (peregrine stoop physics, Ayres's
falcon-like mid-air intercept) is **strong, not thin** — but build it as a
**scripted descend-and-strike event, NOT a full 3D flight-height/altitude-band
simulation**. Use an **air-catch tail-chase / low ambush** for the accipiters,
harriers and fish eagle (their accurate mode). Do **not** simulate persistent
per-bird altitude.

**Implementation brief (docs-only spec; no code here):**
1. **Fly-to-escape flag** on volant prey birds: small grazing-area birds and
   flamingos flee a nearby ground predator/elephant by **taking off**; once
   airborne they are safe from that ground hunter. The ground predator catches
   only a bird **surprised late on the ground** (a short take-off window).
2. **Flamingo** gets a **laborious take-off** (running start → a longer
   vulnerable window), and its real threat is aerial (fish eagle / falcon).
3. **Plover keeps its ground-nester rules:** adult **flies + mobs / broken-wing
   distraction** at the nest; **chicks crouch/freeze** and eggs are cryptic and
   **catchable**; the incubating adult can be surprised at the nest. Do **not**
   give the plover a plain flee-only escape.
4. **Ostrich stays flightless if ever added:** run + kick, never fly-to-escape
   (not in the current roster — flagged only).
5. **Aerial predators seeded per the §B2.1 region table**, respecting the
   region pools so a raptor only appears where it realistically hunts; each
   carries its **attack mode** (stoop vs ambush vs low snatch).
6. **Stoop guild** (peregrine/barbary/lanner/taita + Ayres's/African hawk-eagle):
   a scripted **descend-and-strike** on an **airborne** prey bird — enters from
   high, plunges, strikes, resolves; prey may escape by **out-climbing** or
   **diving to cover**.
7. **Ambush guild** (accipiters) and **fish eagle/harrier:** an **air-catch
   tail-chase / low surface-snatch / low quarter** — surprise from cover or from
   low, **no** dive-from-height. Fish eagle is the way to give **flamingos** an
   aerial predator.
8. **Reuse existing invariants:** route any kill through the ordinary carcass
   system where applicable, and honour the "every started drama resolves" rule
   (I4, point 186) with a hard deadline so a stoop/chase that loses its target
   (streamed out, prey reaches cover) always resolves and never pins.
9. **All rates/thresholds** (stoop trigger radius, take-off window, escape
   chance, per-region raptor spawn weights) stay **low, debug-editable** balance
   values (CLAUDE §2/§21).
10. **Do NOT build** a 3D flight-height/altitude-band system — the stoop is a
    scripted trajectory, not a simulated altitude.

---

## B5. Known unknowns — do not invent these

- **Exact ~1890 range edges** per raptor per game region are REVIEW from modern
  species accounts; treat the table as "realistically occurs and hunts birds
  here," not as a surveyed distribution. Range-uncertain entries (Taita rare;
  Eleonora's coastal/seasonal; harriers) are marked.
- **True harriers' low-quartering** on small birds is asserted at REVIEW level
  from general raptor behaviour, not a deep per-species source in this pass —
  the lighter recommendation. (Do not confuse the true harriers, *Circus*, with
  the **African harrier-hawk**, *Polyboroides*, a canopy/cliff nest-raider — a
  different bird, deliberately not used here.)
- **Deep-forest Central-African raptor specialists** are a **GAP** — left
  unnamed rather than over-asserted; Ayres's hawk-eagle, African goshawk and
  black sparrowhawk are the well-sourced Central choices.
- **Peregrine resident vs. migrant status** in sub-Saharan Africa (resident
  *F. p. minor* plus Palearctic migrants) is REVIEW; the game only needs
  "present and hunts birds," which holds.
- **Escape probabilities, take-off windows and stoop trigger radii** are
  game-calibration guesses, not measured field rates — keep them debug-editable
  and never present them as data.

---

## B6. Sources

Bird flight escape / take-off / ground-predator surprise:
- [Birdfact — How do birds avoid predators?](https://www.birdfact.com/articles/how-do-birds-avoid-predators)
- [Birdful — How do birds survive predators?](https://www.birdful.org/how-do-birds-survive-predators/)
- [Birdful — Can birds take off from the ground?](https://www.birdful.org/can-birds-take-off-from-the-ground/)
- [Stanford — Raptor Hunting (stoop vs tail-chase; accipiter surprise)](https://web.stanford.edu/group/stanfordbirds/text/uessays/uRaptor_Hunting.html)

Peregrine stoop / high-speed dive physics:
- [PLOS Computational Biology — physics-based simulations of peregrine stoops (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5896925/)
- [Physics World — falcon's high-speed dive generates the forces to catch agile prey](https://physicsworld.com/a/falcons-high-speed-dive-generates-forces-needed-to-catch-agile-prey/)
- [Audubon — research reveals why peregrine falcons are so deadly](https://www.audubon.org/news/research-reveals-exactly-why-peregrine-falcons-are-so-deadly)
- [Forbes — how peregrines manoeuvre at nearly 225 mph](https://www.forbes.com/sites/fionamcmillan/2018/04/13/falcon-attack-how-peregrine-falcons-maneuver-at-nearly-225-mph/)

Aerial hunting & escape strategy (stoop vs level chase; out-climbing):
- [Behavioral Ecology — Predator versus prey: aerial hunting & escape strategies in birds](https://academic.oup.com/beheco/article/12/2/150/239902)
- [Behavioral Ecology — Predator escape tactics: ecology & aerodynamics](https://academic.oup.com/beheco/article/21/1/16/179705)

Ground-nester (plover/lapwing) nest defence, distraction & chick crouch:
- [Johnston & Jeff — Ground-nesting birds](https://johnstonandjeff.co.uk/ground-nesting-birds/)
- [EarthLife — Lapwings](https://earthlife.net/lapwings/)
- [Behavioral Ecology — Deceiving predators: distraction behaviour & nest survival](https://academic.oup.com/beheco/article/28/1/260/2453523)
- [Cornell Lab — Piping Plover life history](https://www.allaboutbirds.org/guide/Piping_Plover/lifehistory)

Falcons (peregrine, barbary, lanner, eleonora's) & bird-hunting eagles:
- [Peregrine Fund — Lanner Falcon](https://peregrinefund.org/explore-raptors-species/falcons/lanner-falcon)
- [EarthLife — Barbary Falcon](https://earthlife.net/barbary-falcons/)
- [European Raptors — Barbary Falcon](https://europeanraptors.org/barbary-falcon/)
- [Animal Diversity Web — Eleonora's falcon](https://animaldiversity.org/accounts/Falco_eleonorae/)
- [Wikipedia — Bonelli's eagle](https://en.wikipedia.org/wiki/Bonelli's_eagle)
- [Wikipedia — Ayres's hawk-eagle](https://en.wikipedia.org/wiki/Hieraaetus_ayresii)
- [Peregrine Fund — Ayres's Hawk-eagle](https://peregrinefund.org/explore-raptors-species/eagles/ayres-hawk-eagle)
- [animalia — African hawk-eagle (stooping flight, gamebirds)](https://animalia.bio/african-hawk-eagle)

Accipiters (ambush from cover / tail-chase):
- [Peregrine Fund — Gabar Goshawk](https://peregrinefund.org/explore-raptors-species/hawks/gabar-goshawk)
- [Peregrine Fund — African Goshawk](https://peregrinefund.org/explore-raptors-species/hawks/african-goshawk)
- [avibirds — Black Sparrowhawk](https://avibirds.com/black-sparrowhawk/)
- [Britannica — Sparrowhawk](https://www.britannica.com/animal/sparrowhawk)
- [Kruger Park Birding — Goshawks & Sparrowhawks](https://birding.krugerpark.co.za/birding-in-kruger-raptor-hawks.html)

Fish eagle & flamingo/waterbird predation:
- [SafariBookings — 5 facts about the African Fish Eagle](https://www.safaribookings.com/blog/5-fascinating-facts-about-the-african-fish-eagle)
- [A-Z Animals — African Fish Eagle](https://a-z-animals.com/animals/african-fish-eagle/)
- [Peregrine Fund — African Fish-eagle](https://peregrinefund.org/explore-raptors-species/eagles/african-fish-eagle)
