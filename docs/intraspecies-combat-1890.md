# Intraspecific Combat in the Game's African Fauna (design.md §19; TASKS point 264)

Research basis for the intraspecies-combat mechanic: which of the game's rendered
animals realistically fight **members of their own species**, what triggers it,
what the fight physically looks like, and how often it kills. Written before any
code so the mechanic is built from a researched per-species table rather than
applied to every animal alike. Sibling of `docs/climate-1890.md` and
`docs/peoples-1890.md`.

The point is discrimination, not spectacle: hippos and rutting/musth megafauna
have genuinely lethal same-species fights; most antelope rut-clashes are
**ritualised** and end without a wound; herd grazers under a harem stallion, the
solitary cats, and the birds each fight in their own register and at their own
lethality. A mechanic that made every zebra duel to the death, or made two
gazelles gore each other, would be as wrong as one that let none of them fight.

The animals covered are exactly those the game renders (`src/render/fauna.ts`
build functions, keyed to `src/scenes/travel/wildlifeBehavior.ts` `PreyKind` /
`PredatorKind`): **elephant, giraffe, zebra, antelope/gazelle, wildebeest,
warthog, lion, cheetah, leopard, hyena, crocodile, flamingo, vulture, plover**,
plus the grazer **calves/juveniles** and the village **goat**. Hippopotamus and
buffalo are covered on the task's request but are **not currently in the rendered
roster** — flagged as such so the mechanic does not reference an absent species.

Evidence markers, as in the sibling docs:

| Marker | Meaning |
| --- | --- |
| **FIELD** | direct field observation / behavioural ethology of the wild species |
| **REVIEW** | secondary synthesis (species accounts, wildlife references) |
| **CAPTIVE** | documented in captivity; wild pattern inferred |
| **GAP** | not well documented — do not over-assert |

The zoology below is stable on a century scale (the mechanisms — territoriality,
dominance hierarchies, rut, musth — are not 1890-specific), so unlike the climate
doc there is no modern-vs-period caveat; the ~1890 framing is only the game's,
and every species named here was present in sub-Saharan Africa then.

---

## 1. The four drivers, in brief

Intraspecific fighting across African fauna resolves to a small set of drivers.
Each game species is mapped to one (or none) in §2.

- **Territorial.** Defence of a fixed space and the resources/mates in it.
  Common in solitary cats (leopard, male cheetah coalitions), male crocodiles at
  breeding grounds, and the *lekking* antelope bulls (wildebeest, gazelle) that
  hold a patch of ground. Ranges from pure ritual (gazelle border display) to
  lethal (leopard).
- **Dominance / rut.** Contests over rank in a hierarchy or over oestrous
  females in a breeding season. The classic ungulate register: giraffe
  *necking*, zebra stallion clashes, warthog boar shoving. Mostly settled by
  assessment or submission; lethal only at the tail.
- **Musth (elephants only).** A periodic hormonal state in bulls, with a large
  testosterone rise and heightened aggression; a musth bull will fight other
  bulls for access to females, and these clashes can kill.
- **Resource.** Contest over food or a nest/den without a defended territory —
  the vulture scrum at a carcass, flamingo bill-fencing over feeding/nest space.
  Almost never lethal by design: the animals cannot afford self-injury.

A cross-cutting principle governs lethality: animals that depend on being
un-injured to survive (solitary hunters that must hunt, scavengers that must
range) **de-escalate** — most encounters are bluff, teeth-baring, posture — and
turn lethal only when neither yields. Megaherbivores and harem-holders, whose
whole reproductive payoff rides on one contest, escalate hardest.

---

## 2. Per-species table

| Species | Fights? | Driver | Typical form | Lethality | Who fights |
| --- | --- | --- | --- | --- | --- |
| **Elephant** | **Yes** | Musth / dominance | Head-on charge, locking and wrestling tusks/trunks, shoving; loser chased and tusked in the rump | **Sometimes** — usually settled, but musth clashes can kill one or (rarely) both bulls | Adult bulls, esp. in musth |
| **Hippopotamus** *(not rendered)* | **Yes** | Territorial (males) | Gaping-jaw threat, then slashing with enlarged lower canines/tusks | **Often** — among the most lethal ungulate fights; deep tusk wounds, some fatal | Dominant / rival adult males |
| **Buffalo** *(not rendered)* | **Yes** | Dominance / rut | Head-on horn-and-boss clash, pushing | **Sometimes** — heavy boss cushions most blows; occasional fatal goring | Adult bulls in the rut |
| **Giraffe** | **Yes** | Dominance (rut) | *Necking*: bulls stand side-by-side and swing the neck to strike the rival's body/legs with the ossiconed skull as a club | **Rare** — mostly bruising; a knockout or (rarely) a broken bone / death at high intensity | Adult bulls |
| **Zebra** | **Yes** | Dominance / harem | Rearing, neck-biting, powerful hind-leg kicks; fights to steal or hold a harem | **Sometimes** — usually non-fatal but genuinely savage; bitten-off tails, broken bones, occasional death | Stallions (harem males, rival bachelors) |
| **Wildebeest** | **Yes** | Territorial (lek) / rut | Drop to the knees forehead-down, clash horns and heads at territory borders | **Rare** — ritualised border contests; injury uncommon | Territorial bulls in the rut |
| **Antelope / gazelle** | **Yes (ritualised)** | Territorial / rut | Mock rushes without contact, parallel grazing display, brief horn-sparring | **Rare** — border rituals largely have no victor and no wound; escalated clashes uncommon | Territorial males |
| **Warthog** | **Yes** | Dominance (mating) | Boars rush and ram heads/upper tusks; facial warts pad the blows | **Rare** — blunt upper-tusk shoving; serious wounds from the lower tusks are uncommon | Boars in mating contests |
| **Lion** | **Yes** | Territorial / pride takeover | Coalition-vs-coalition clashes: posturing, roaring, swatting, biting; takeover of a pride | **Often** — resident males mortally wounded in takeovers; associated cub-killing by incoming males | Adult males (coalitions); females mainly defending cubs |
| **Cheetah** | **Yes** | Territorial (male coalitions) | Coalition defends a territory; intruding males attacked, bites to the anogenital area | **Sometimes** — rare but real deaths of intruders / even a coalition's own leader | Male coalition members vs intruder males |
| **Leopard** | **Yes** | Territorial | Solitary males clash where ranges overlap; often bluff (baring teeth, growling), sometimes full grappling | **Sometimes** — an estimated notable fraction (~15–20% by some accounts) of serious male fights prove fatal | Adult males |
| **Hyena** | **Yes** | Dominance (clan) / den | Clan rank aggression; fatal neonatal sibling aggression; occasional infanticide at communal dens | **Sometimes** — rank fights rarely kill adults, but sibling aggression and cub-killing are lethal | Both sexes (female-dominant clans); cubs at birth |
| **Crocodile** | **Yes** | Territorial (breeding) | Males defend breeding grounds; biting, pushing, wrestling in shallow water | **Sometimes** — combat between equals is relatively rare but can seriously wound | Dominant / rival males in the dry-season breeding period |
| **Flamingo** | **Yes (minor)** | Resource (feeding/nest) | Threat display (neck extended, wings out), *bill-fencing* — jabbing bills | **Rare→none** — squabbles, not fights; near-zero lethality | Any adult, esp. crowded feeding / nesting |
| **Vulture** | **Yes (minor)** | Resource (carcass) | Size/age dominance hierarchy at a carcass; displacing postures, brief pecking scuffles | **None (effectively)** — squabbles broken up fast; injury avoided | Any bird at a carcass; large/old dominate |
| **Plover (lapwing)** | **Yes** | Territorial (nest) | Loud alarm, swooping display; spur-winged species carry carpal wing-spurs | **Rare→none** — mostly bluff swooping; contact rare | Nesting adults, both sexes |
| **Grazer calf / juvenile** | **No (play only)** | — | Sparring/play-fighting; no true contest | **None** | Young — excluded from real combat |
| **Goat** *(village)* | (Yes in reality) | Dominance | Head-butting | Rare | — *Domestic dressing; out of scope for the wild mechanic* |

Sex/age note running through the table: intraspecific combat is overwhelmingly an
**adult-male** behaviour for the ungulates and cats (rut, harem, territory,
musth). The exceptions are hyenas (female-dominant clans; lethal aggression
appears even among neonates) and the birds (both sexes defend nests/feeding
space). **Herd grazer females and juveniles do not stage lethal same-species
fights** — a design cue that the mechanic should key on males.

---

## 3. Species that do NOT fight intraspecifically in a normally-lethal way

Flagged explicitly so the mechanic excludes or de-rates them:

- **Antelope / gazelle** — border contests are **ritualised**; the display often
  has "no victor" and no wound. Include only as a low-rate, **non-lethal**
  sparring flavour, never a kill.
- **Wildebeest** — likewise ritualised horn-clashing at territory edges; injury
  uncommon. Low-rate, drive-off only.
- **Warthog** — blunt shoving padded by facial warts; serious injury rare.
  Drive-off only.
- **Flamingo, vulture, plover** — resource/nest squabbles and threat displays,
  **not** duels; effectively **zero** lethality. If represented at all, as brief
  displacement animations, never a fight-to-injury.
- **Calves / juveniles** — play only; **excluded** from the combat mechanic
  entirely (they are already the protected young of the §19.8 family dramas).
- **Grazer females** generally — not contest-fighters; the mechanic should not
  seed a "wants to fight" disposition on them.

---

## 4. Implementation guidance for the mechanic (point 264)

A clean recommendation for the later build step — not a code spec. Two axes: does
the species carry a **"wants to fight"** disposition at all, and if so is its
resolution **drive-off-heavy** or **genuinely lethal**. Rates are rough guidance
(calibratable balance values, editable in the debug menu like every other rate).

**Tier A — carry the disposition, genuinely lethal (rare fatal outcome).** These
are the species where a same-species fight can end in a carcass entering the
existing carcass/scavenger system (§19). Keep the fatal branch **rare** and the
drive-off/submission branch dominant, mirroring the §19.8 `parentAttackOutcome`
three-way (take / drive-off / kill) architecture so a fight resolves cleanly and
never pins two actors.

- **Elephant** (musth bulls) — lowest rate, highest drama; a kill is a rare
  crowning outcome. Gate on adult bulls; a musth flag if the season/state model
  supports it.
- **Hippopotamus** *(only if added to the roster)* — the **most** lethal of the
  set; male territorial. Currently absent, so no mechanic unless rendered.
- **Lion** (male coalitions / pride takeover) — territorial; the takeover is the
  natural lethal case. Gate on adult males; ties naturally to the existing
  pride/hunt systems.
- **Zebra** (harem stallions) — savage but usually non-fatal; rare death.
- **Leopard**, **cheetah** (male coalitions) — solitary/coalition territorial;
  de-escalation-heavy with a real but uncommon fatal tail. Both are already
  region-gated predators (`REGION_PREDATORS`), so seed the disposition only where
  they roam.

**Tier B — carry the disposition, drive-off only (no kill branch).** A visible
contest that resolves with one animal yielding and moving off; **no** carcass.

- **Wildebeest**, **antelope/gazelle** — ritualised rut/territory clashes; adult
  males, low rate, always a submission/withdrawal outcome. This is the largest
  "looks like a fight, isn't lethal" bucket and is worth including precisely
  because omitting it would make the plains feel emptier than they are.
- **Warthog** — boar shoving; drive-off only.
- **Giraffe** — necking; predominantly drive-off, with only a rare stagger/knock.
  Could sit at the top of Tier B or the bottom of Tier A; recommend **Tier B with
  a very rare injury** rather than a routine kill.
- **Crocodile** — male breeding-ground territorial; drive-off with occasional
  wounding. Already water-only and region-gated (§19.16); seed only on males in
  the dry-season breeding window if the model tracks it, else at a low flat rate.
- **Hyena** — clan rank aggression is mostly drive-off among adults; the lethal
  hyena cases (neonatal sibling aggression, den infanticide) are **not** the
  adult-duel the mechanic is about — recommend **drive-off only** for the ambient
  mechanic and leave the darker cases out of scope.

**Tier C — exclude (display only or nothing).**

- **Flamingo, vulture, plover** — resource/nest squabbles; if shown at all, as
  brief displacement/threat displays with **no** combat resolution and **no**
  lethality. Recommend leaving them out of the fight mechanic proper.
- **Calves / juveniles** — **excluded**; they are protected young elsewhere.
- **Grazer females** — no disposition.
- **Goat** — domestic village dressing, outside the wild-fauna mechanic.

**Cross-cutting rules to carry over from §19:**

- Seed the disposition on **adult males** for the ungulates and cats (the table's
  "who fights" column); do not seed it on females or young.
- Respect the region pools — a fight can only involve two animals of a species the
  region actually holds (`REGION_PREY` / `REGION_PREDATORS`), the same gate the
  hunt and ambient-herd systems already use (point 208 A2/A3).
- Reuse the "every started drama resolves" invariant (I4, point 186): a fight
  needs a hard resolution deadline so a fighter that streams out or is claimed by
  another drama never leaves its opponent pinned.
- A lethal Tier-A outcome should drop the loser into the **ordinary carcass
  system** (dead, not owned by a hunt), worked by the existing vultures/scavengers
  — not a bespoke body path.
- Keep base rates **low** (rare, like the random-event and hunt rates) and all of
  them **debug-editable** per CLAUDE §2 / §21.

---

## 5. Sources

Species behaviour references and field/secondary accounts consulted (the pattern
of the sibling docs — species accounts plus behavioural studies):

- Elephant musth & bull combat — [Musth, Wikipedia](https://en.wikipedia.org/wiki/Musth); [How do elephants fight?, Tsavo Trust](https://tsavotrust.org/how-do-elephant-fight/); [Elephant musth guide, Fascinating Africa](https://fascinatingafrica.com/elephant-musth-guide/)
- Hippopotamus territorial tusk-fighting — [Hippopotamus, A-Z Animals](https://a-z-animals.com/animals/hippopotamus/); [Why hippo battles are among the most brutal, A-Z Animals](https://a-z-animals.com/articles/why-hippo-battles-are-among-the-most-brutal-in-nature/)
- Giraffe necking — [Giraffe necking: two males brawl until one quits, A-Z Animals](https://a-z-animals.com/articles/giraffe-necking-two-males-brawl-until-one-quits/); [The giraffe neck evolved for sexual combat, Nautilus](https://nautil.us/the-giraffe-neck-evolved-for-sexual-combat-238492)
- Zebra stallion fights — [Why do zebras fight?, Londolozi](https://blog.londolozi.com/2023/01/26/why-do-zebras-fight/); [The darker side of the zebra, Sabi Sabi](https://www.sabisabi.com/discover/topics/the-darker-side-of-the-zebra)
- Wildebeest territorial/rut behaviour — [Territorial behaviour of the black wildebeest (journal PDF)](https://journals.co.za/doi/pdf/10.10520/AJA00445096_276); [Wildebeest facts, Natural Habitat Adventures](https://www.nathab.com/know-before-you-go/african-safaris/east-africa/wildlife-guide/wildebeest)
- Thomson's gazelle ritualised territorial display — [Thomson's gazelle, Wikipedia](https://en.wikipedia.org/wiki/Thomson%27s_gazelle); [Thomson's gazelle, Mpala Live field guide](https://www.mpalalive.org/field_guide/view/thomsons_gazelle/1000)
- Warthog boar contests — [Warthog, National Geographic Kids](https://kids.nationalgeographic.com/animals/mammals/facts/warthog); [Why do warthogs have warts?, HowStuffWorks](https://animals.howstuffworks.com/mammals/warthog-warts.htm)
- Lion coalition fights & pride takeover — [The truth about lions, Smithsonian](https://www.smithsonianmag.com/science-nature/the-truth-about-lions-11558237/); [Retaliatory killing … lion male coalitions, PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0272272)
- Cheetah coalition territoriality — [Cheetah territory, Better Planet Education](https://betterplaneteducation.org.uk/factsheets/cheetah-territory); [All-male cheetah pack kill leader, Newsweek](https://www.newsweek.com/all-male-cheetah-pack-kill-leader-bloody-coup-1677919)
- Leopard territorial fights — [When male leopards fight for territory, Londolozi](https://blog.londolozi.com/2019/08/31/male-leopards-fighting/); [Watch: male leopards battle over territory, Earth Touch](https://www.earthtouchnews.com/natural-world/animal-behaviour/watch-male-leopards-battle-it-out-over-territory/)
- Spotted hyena clan/neonatal aggression — [Fatal sibling aggression in neonatal spotted hyenas, Science](https://www.science.org/doi/10.1126/science.2024122); [Female hyenas kill cubs in their own clans, Science News](https://www.sciencenews.org/article/female-hyena-moms-kill-cubs-own-clans); [Spotted hyena behavior & ecology, San Diego Zoo](https://ielc.libguides.com/sdzg/factsheets/spottedhyena/behavior-ecology)
- Nile crocodile breeding-territory combat — [Courtship and mating of the Nile crocodile, Brill (PDF)](https://brill.com/view/journals/amre/12/1/article-p39_5.pdf); [Crocodile behavior: communication, feeding, mating, Facts and Details](https://factsanddetails.com/asian/cat68/sub434/entry-9277.html)
- Flamingo bill-fencing / dominance — [American flamingo, Animal Diversity Web](https://animaldiversity.org/accounts/Phoenicopterus_ruber/); [Evidence of a dominance hierarchy in captive Caribbean flamingos, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0376635714000771)
- Vulture carcass dominance hierarchy — [Larger size and older age confer competitive advantage: dominance hierarchy within European vulture guild, Scientific Reports](https://www.nature.com/articles/s41598-020-59387-4); [Research review: larger/older vultures most dominant at carcasses, Vulture Conservation Foundation](https://4vultures.org/blog/research-review-new-study-illustrates-how-larger-vulture-species-and-older-individuals-are-most-dominant-when-competing-at-carcasses/)
- Lapwing/plover territorial nest defence — [Plovers and lapwings (Charadriidae), Encyclopedia.com](https://www.encyclopedia.com/environment/encyclopedias-almanacs-transcripts-and-maps/plovers-and-lapwings-charadriidae); [Spur-winged lapwing, Grokipedia](https://grokipedia.com/page/Spur-winged_lapwing)

## 6. Known unknowns — do not invent these

- Exact per-species **fatal-fight frequencies** in the wild: most are reported
  qualitatively ("rare", "sometimes", "can be fatal"), not as rates. The rates in
  §4 are game-calibration guidance, not measured field values — keep them
  debug-editable and do not present them as data.
- Whether the game's generic **"antelope/gazelle"** should follow the ritualised
  *Thomson's gazelle* register or a more escalated one (some larger bovids fight
  harder). The roster models a generic small bovid; Tier B (ritualised, non-lethal)
  is the safest default.
- Crocodile combat **seasonality** in-game: real fights concentrate in the
  dry-season breeding window, but the game's crocodile model may not track a
  breeding state — if not, a low flat rate is the fallback.
