# How Africa Communicated around 1890 (design.md §13.4)

Research basis for the future communication/hint mechanic: what encoded-meaning
systems really existed in the game's world, how each of them encoded, and where.
Written BEFORE the mechanic is decided (TASKS/design.md §13.4), so the design
can follow the history instead of inventing it. Sibling of `climate-1890.md`
and `peoples-1890.md`, and held to the same standard: sourced, with the
evidence quality marked per claim, and gaps stated rather than filled.

Evidence markers: **PERIOD** (pre-1910 eyewitness) · **MODERN** (present-day
scholarship) · **RETRO-APPLIED** (later fieldwork projected back onto 1890,
e.g. Carrington 1949) · **CONTESTED** · **GAP**.

---

## 1. The design-decisive question first: code or language?

The whole point of a Chants-of-Sennaar-like mechanic is that meaning can be
*inferred from observed use*. A fixed lookup table ("three beats = north")
cannot be inferred, only memorised — a decoder ring. So the first question put
to every system was: is it composable, with genuine ambiguity?

**The literature itself draws exactly this distinction.** Stern (1957, *American
Anthropologist* 59:487–506) separates **abridging systems** — phonologically
related to the spoken language; the instrument emulates the speech — from
**lexical ideographs**, which "arbitrarily signify words, phrases, or perhaps
concepts" with no phonological basis. Carrington (1949) already made the same
cut in period-adjacent terms, explicitly contrasting the Kele drum *language*
against peoples "who use a **code** rather than a drum language"
([Carrington 1949, full text](https://missiology.org.uk/pdf/e-books/carrington_j-f/talking-drums-of-africa_carrington.pdf))
— RETRO-APPLIED. ⚠️ James (2021) notes the two poles are endpoints of a
continuum in practice ([Frontiers](https://www.frontiersin.org/journals/communication/articles/10.3389/fcomm.2021.653268/full)).

**The answer for the famous systems: a language operated in formulas.**

- **Mechanism:** drum speech reproduces the **tone and rhythm** of real
  utterances in a tonal language; vowels and consonants are discarded entirely.
  Kele *asoŋa* 'he has come' is drummed as its tone sequence L H L H —
  "simply following the tonal pattern of the word" (Carrington 1949, p. 32) —
  RETRO-APPLIED.
- **The ambiguity is real and quantified:** in the Yakusu mission dictionary
  ~130 Kele nouns share one drum pattern and >200 another (Carrington p. 32).
- **The resolution is enphrasing:** every short word is drummed inside a fixed
  longer phrase whose *total* tonal shape is unique. Carrington's own examples
  (pp. 33–34): *songe* 'moon' → "the moon looks down at the earth"; *kɔkɔ*
  'fowl' → "the fowl, the little one which says kiokio". **The stock phrase is
  not noise around the signal — the stock phrase IS the signal**, and that is
  precisely what makes the system learnable by observation.
- **Generativity is genuine but contested in scope.** For: drummers audibly
  compose (Carrington p. 53); drum names are compositional and novel names are
  coined for novel people (pp. 40–42); the Sambla balafon rendered *elicited,
  arbitrary* sentences — and in doing so **overturned the analyst's own
  published phonology** (McPherson: Seenku turned out to have four tones, not
  three), which no fixed signal-set could do
  ([McPherson](https://bpb-us-e1.wpmucdn.com/sites.dartmouth.edu/dist/5/444/files/2020/10/Talking-balafon-of-the-Sambla-revised-small.pdf))
  — MODERN. Against: everyday use "appears in brief, mostly predictable verbal
  exchanges" (James 2021); communities split into a small skilled tier and a
  majority who **memorise common phrases** — i.e. most people really do run a
  decoder ring; only specialists have the language. **Verdict: productive in
  competence, formulaic in performance.**
- ⚠️ **The famous "8× redundancy" figure is not a finding.** It appears in
  Gleick (*The Information*) without a citation, is absent from Carrington's
  book, and Carrington's own worked example measures ≈3.8×. Wikipedia repeats
  Gleick; Dyson restates Wikipedia. Several-fold expansion is well supported;
  the number 8 is folklore — CONTESTED.

**For the game, this shape is ideal:** a player first meets stereotyped
formulas (inferable from context, like Chants of Sennaar), and the formulas are
*not arbitrary* — they decompose into the tone-and-rhythm of real words, so
cracking the mapping yields real generative power. Surface: decoder ring.
Underneath: a language.

**The learning constraint that shapes the fiction:** drum speech is parasitic
on the spoken tongue. Lokele boys got drum names at five or six, competence
came years after speech, and "it would be impossible to learn the drum language
without thorough knowledge of the corresponding oral language" — Carrington was
"the first European to learn a drum language", **in the 1940s**
([Wikipedia](https://en.wikipedia.org/wiki/John_F._Carrington)) — RETRO-APPLIED.
A player cannot learn the drums *first*; the drum is the *proof* of having
understood the tongue. Design accordingly.

**And the period position is a gift:** every source that explains the
*mechanism* is 1944 or later. Pre-1910 eyewitnesses attest the *effect* —
Stanley 1885 (PERIOD): the drums "convey language as clear to the initiated as
vocal speech"; Lloyd 1899 (PERIOD): a message 100 miles in under two hours —
but none the how. (The lone early exception on tone: Whitehead's *Bobangi
Grammar*, 1893.) **In 1890 the mechanism was genuinely un-decoded by
outsiders. A player inferring it from observation occupies exactly the
epistemic position a European really had in 1890.** The mechanic is
period-accurate in its very form.

---

## 2. Sound systems and where they lived

| System | Peoples | Where | Encoding |
| --- | --- | --- | --- |
| Hourglass **pressure drum** (dùndún, bàtá) | Yoruba | Nigeria/Benin | gradient pitch follows 3-tone speech |
| **Paired pegged drums** (atumpan) | Akan | Ghana | two tones = two drums |
| **Horn ensemble** (ntahera, hocket) | Asante | Ghana | speech contours on ivory trumpets, melody split across players |
| **Balafon** (xylophone) | Sambla, N. Toussian | SW Burkina Faso | FOUR tone levels + contours — the richest channel |
| **Slit gong** (boungu) | Kele/Lokele | Congo R., Kisangani–Isangi (~0.5N 24–25E) | two tones = the two lips of the log |
| **Membrane drums** | Bulu | Cameroon | 10–15 miles at night vs 3–4 by day |
| **Whistled speech** (tonal type) | Moba, Mooré, Gurunsi, Lele, Banen, Bench, Ari, Ewe, Jóola | Sahel savanna, Cameroon forest, Ethiopian Omo valleys, Casamance | same abstraction as the drums: tone + rhythm |
| **Whistled speech** (formant type) | **Tashlhiyt/Tamazight Berber** | **Moroccan High Atlas** | vowel/consonant timbre as pitch — carries a NON-tonal language |

Load-bearing details:

- **The Sambla balafon is the strongest single model for a learnable in-game
  language** — four tone levels (a channel rich enough to actually crack),
  demonstrated generativity, a documented specialist/listener split, and it is
  played **in the open at social events**, i.e. learnable by observation
  ([Dartmouth](https://linguistics.dartmouth.edu/news/2016/09/talking-xylophones-musical-language-sambla))
  — MODERN. The Congo slit drum's fame is largely an artefact of Carrington's
  single career, not of being the best case.
- **Whistling and drumming are the same system in different media** across the
  tonal zone (both transmit the tone melody; Meyer 2015). One invented tonal
  language per zone could surface as drum, balafon *and* whistle — historically
  defensible and a strong unifier.
- **Speed/range:** relay ~100 miles in an hour; a single slit gong 5–11 km;
  whistling typically 1–2 km (record ~8 km, La Gomera); night doubles drum
  range — all MODERN/RETRO-APPLIED.
- ⚠️ The **"jungle drums" cliché is wrong twice**: the most sophisticated
  surrogate is a *savanna xylophone*, and a Kele drum is unintelligible to a
  Yoruba speaker — it is phonology, not a pan-African bush telegraph.
- **Whistled inventory quality** (Meyer 2015, the authoritative map): attested
  in Africa are Moba, Mooré, Jóola, Bench, Ari, Banen, Lele, Gurunsi, Ewe,
  Tamazight/Tashlhiyt; **reported-only** (thin): Bafia, Bape, Tshi/Twi, Marka,
  Bobo, Birifor, Yoruba; **no evidence**: Bulu, Dogon, Tuareg, whistled
  Igbo/Efik. Plus the recent southern find: **whistled TshiVenda** (Venda,
  northern South Africa; one-sentence Kirby mention 1937, documented 2023) —
  MODERN. Intelligibility is sentence-level and context-driven: isolated
  syllables ~57 %, sentences in context ~95–100 % (Meyer ch. 8.3).
- **Not a code:** Meyer is emphatic that whistled speech is a **speech
  register** — fluent whistlers "can effectively whistle any type of dialogue",
  novel sentences included. ⚠️ Caveat: eroded remnant practice and the sung
  courtship mode ARE formulaic; and semi-whistlers handle only canonical
  exchanges — MODERN.

### 2.1 The negatives, verified deliberately

- **North Africa/Sahara: NO drummed or horn speech — but the negative is not
  total.** No talking drum exists among Arabic, Berber or Tuareg speakers (the
  standard surveys carry no North African entry at all). The structural reason
  is real but not absolute: Arabic and Berber are non-tonal, so a drum has no
  lexical pitch melody to copy — yet **Wolof sabar drumming proves a non-tonal
  language *can* be drummed** (strokes correlate with vowel quality; Winter
  2014, Ros 2021), so the absence is "strongly disfavoured plus a working
  alternative", not impossibility. The alternative was institutional: the
  **barīd** relay post and fast courier dromedaries (PERIOD). The Tuareg tende
  is a women's musical drum, never a signal. **And the surprise: North Africa
  DOES have a speech surrogate — whistled Berber in the High Atlas**, the
  formant type, documented by peer-reviewed fieldwork (Meyer/Ridouane et al.
  2015–2019) — MODERN; ⚠️ its *antiquity* is asserted only journalistically,
  and no pre-1910 attestation exists — GAP. (Silbo Gomero: the pre-conquest
  *practice* is PERIOD-attested from 1402, but whistled *Guanche* was never
  recorded; the Berber-descent story is a plausible, Meyer-endorsed inference,
  not fact — CONTESTED.)
- **East Africa, the Horn and the Swahili coast are genuinely outside the
  belt.** Swahili **lost lexical tone** (one of the few Bantu languages that
  did), and every famous instrument resolves to regalia or fanfare: the coastal
  **siwa** horns herald state occasions (PERIOD-attested as regalia); the
  Ethiopian **negarit** is a proclamation kettledrum — ⚠️ its name derives from
  Amharic "to speak", a false friend that spawned the "Ethiopian talking drum"
  meme; Amharic is non-tonal and the drum announces THAT a proclamation
  happens, never its content; the **meleket** trumpet likewise. Buganda's
  **mujaguzo** royal drums are a *named-signal repertoire* — 93 drums, each
  occasion its own fixed rhythm (Roscoe 1911, PERIOD) — a closed codebook, not
  a language. And the celebrated **amadinda xylophone does NOT speak**: its
  melodies are tone-*constrained* by known song texts, and the "inherent
  patterns" evoke free associations in listeners — the opposite of decoding.
  ⚠️ The circulating sentence "in Central and East Africa drum patterns
  represent the tones of the language" carries no source and names no East
  African group — treat as unsupported. GAP: Oromo (tonal) was not settled
  either way.
- **Southern Africa: thin.** Nguni music is vocal/choral; no drum surrogate
  found; the one live wire is whistled TshiVenda (above).

---

## 3. Visual and graphic systems

| System | Verdict | In use 1890? |
| --- | --- | --- |
| **Nsibidi** (Cross River: Ejagham, Efik, Igbo, Ibibio) | between code and language: composable ideograms, polysemy, a determinative, deixis — but **no syntax, no phonology** | almost certainly (first documented 1904–1911) |
| **Tifinagh** (Tuareg) | full alphabet of a real language, thin corpus (graffiti, love verse, puzzles) | yes — PERIOD (Duveyrier 1864) |
| **Ajami / Arabic script** (Hausa, Fulfulde, Wolof, Swahili …) | full written languages | yes — the dominant visible writing of 1890 Africa |
| **Ge'ez/Amharic script** (Ethiopia) | full script; clerical minority literacy (the *debtera* class) | yes — PERIOD |
| **Vai syllabary** (Liberia) | full invented syllabary | yes — spreading ("by the end of the 19th century most of them were using it") |
| **Adinkra** (Asante) | **CODE**: symbol→proverb lookup, no combination rules; the macro-signal is cloth COLOUR | yes (1817 artefact), inside the elite→popular transition |
| **Àrokò** (Yoruba object messages) | code with heavy pragmatics | yes |
| **Zulu/Nguni beadwork** | code, locally variable; ⚠️ "readable love letter" is romanticised — the colour-code detail is 20th-c. ethnography | yes, and *new* then (late-19th-c. trade beads) |
| **Scarification** (Yoruba ila, Igbo ichi, Dinka) | identity badge, fixed lookup | yes |
| **Luba lukasa** memory board | mnemonic for initiated performers, not readable | yes — initiatory |
| **San rock art** | already **historical** by 1890 — Bleek/Lloyd's informants no longer painted | landscape trace, not a live system |

Nsibidi deserves the detail, because it is the best visual fit and the most
delicate:

- **PERIOD-attested mechanics** (Macgregor 1909, Dayrell 1910/11, Talbot 1912):
  signs combine into "short stories" with **no ordering** ("all the signs in a
  collection have to be interpreted before the meaning is plain"); one sign
  carries several senses; a **determinative** exists (the whip sign means "Ekpe
  runner" only with the Ekpe sign attached); **deixis** is real (the same sign
  drawn on the ground by a man means *his own* wife is with child). It crossed
  **mutually unintelligible languages** — meaning without phonology.
- **Two tiers, both PERIOD-attested:** a public tier "known to most of the
  natives" (tattoos, road signs, love matters) and society-specific signs
  enforced by fines. ⚠️ The "Ekpe monopoly" is a modern simplification —
  several societies used it, and women appear among the period informants
  (Maxwell's original 24 signs came from a woman; one informant's mother ran a
  nsibidi school).
- ⚠️ **Anachronism watch:** first European documentation is **1904** (Maxwell),
  not earlier; deep-antiquity claims ("600 CE") harden what the archaeology
  only hedges; the 1849 teaching cloth is hearsay.
- **ETHICAL FLAG, precise:** Ekpe is a living, prestigious institution. What is
  genuinely restricted today is narrower than folklore says (certain ancestor
  motifs; the performed formulas), and initiated scholars note the signs "have
  not always been as secretive" — **1890 nsibidi was less locked down than
  today's**. The sharpest guidance comes from an initiate's own teacher, who
  objected that rendering nsibidi "as merely a text of signs and their
  meanings makes it everything it is not — static." **A literal decoder-ring
  treatment of real nsibidi is the exact falsification its own custodians
  reject. The game should build an INVENTED system on its mechanics, never
  transcribe the real one.** The same rule, for the same reasons, protects the
  lukasa (initiatory) and the funerary weight of adinkra.
- Other anachronisms: **Bamum script is 1896+** — inside the play window but
  after the start, and far east of it; Neo-Tifinagh letterforms are 1970s+;
  the "Adinkra Alphabet" is from 2015; most circulating adinkra meanings are
  Rattray **1927** (RETRO-APPLIED).

---

## 4. The zones the systems actually form — and a proposal

**The systems do not follow the game's five bands.** The controlling variable
for sound surrogates is the **tonal Niger-Congo language zone** — Senegal
through the Guinea coast and Nigeria down into the Congo basin — cutting
straight across any west/central line. Ajami runs as a horizontal Sahel belt
and then down the *east* coast. Ethiopia is its own literate island. "No
satisfying explanation currently exists" for the surrogate distribution
(James 2021) — but the observed clustering is stark and usable.

What the evidence supports as **communication zones** (a proposal for the
region question of design.md §13.4 — fewer than today's five, per the user's
preference; the decision is the user's):

1. **The script North** (Sahara + Mediterranean fringe + Horn/Swahili coast
   arguably): meaning lives in WRITING — Tifinagh graffiti and short verse,
   Ajami/Arabic letters and ledgers, couriers instead of sound. Learnable as:
   recognising an alphabet, then inferring words of an unknown language from
   known letters (the "Ajami intermediate state": the player recognises the
   script but not the tongue). The High Atlas whistling is available as a
   mountain-shepherd niche.
2. **The tonal West+Centre** (Sahel savanna through the forest): ONE invented
   tonal language surfacing in several media — balafon in the savanna, slit
   gong in the forest, whistling in between, enphrased stock formulas
   throughout. This zone carries the Chants-of-Sennaar heart of the mechanic.
3. **The ideographic Cross-River pocket** (could fold into 2 as its coastal
   south-east): an invented nsibidi-like tiered ideography — public tier
   learnable by observation, restricted tier gated by trust/initiation, which
   maps beautifully onto the game's existing gift/friendship systems.
4. **The signal East+South**: fanfares, named-drum repertoires, bead colour
   codes, object messages — honest CODES, learnable as codes, and a deliberate
   mechanical contrast (here a lookup table is the historically accurate
   answer, and the "aha" is realising the mujaguzo-like drums will never say
   anything new).

That is four zones, or three if 3 folds into 2. Each is *invented but shaped
like* its historical models, per §13.4's standard — and each teaches
differently, which keeps five-times-the-same-puzzle off the table.

---

## 4.9 The pre-1910 eyewitness record, settled — the West-African strand

The hypothesis is CONFIRMED for the Anglophone record, with page-level reads of
the period volumes: 19th-century observers recorded THAT the drums speak, and
misexplained HOW. Nobody joined the two halves before 1900.

- **Bowdich 1819** (PERIOD) comes closest first, on **horns**: chiefs' horn
  flourishes are "adapted to short sentences, which are always recognised…
  the King's horns uttered, 'I pass all Kings in the world'" — and "**the words
  of some of these sentences are almost expressible by the notes of the
  horns**" (p. 362). He reports; he does not explain.
- **Ellis 1887** (PERIOD, the era's high-water mark, pp. 326–328): "to a native
  … **the drum can and does speak, the sounds produced from it forming words,
  and the whole measure or rhythm a sentence**… The language of the drums is as
  well understood as that which they use in their daily life." He even records
  the two drums "pitched a note or two higher" — and then explains everything
  as **rhythm**: "an entire stranger to the locality can at once translate the
  rhythm into words." The fact affirmed, the mechanism misattributed.
- **The tragedy of Christaller** (PERIOD): his Twi grammar (1875) and
  dictionary (1881) contain a complete **tonal phonology** (~200 tone entries)
  and rich drum terminology — including the gloss "*kantamanto*, the 'language'
  of the drum of the chieftain of Aburi" — side by side in one man's books,
  **never joined**.
- **Kingsley 1897/99** (PERIOD): names "talking-drums" as a familiar object and
  confesses defeat — "the attempt to understand which has taken up much of my
  time, and led me into queer company"; "**it can talk as well as the human
  tongue**." Wonder without mechanism.
- **Silent negatives** (PERIOD, checked by full-text grep): Reade 1863, Ellis's
  own Ewe (1890) and Yoruba (1894) volumes, and Nassau 1904 contain **no**
  drum-signalling analysis at all.
- **The mechanism enters via German mission linguistics** on the Duala and Ewe
  — Betz 1898 (partial, sceptical; ⚠️ read bibliographically only), Westermann
  1907, Witte 1910 — and enters English with **Rattray 1916**: drum-talking is
  "an attempt to **imitate by means of two drums (a 'male' and a 'female') set
  in different keys the exact sound or words of the human voice**", completed
  in **Rattray 1923**: "the explanation… is afforded by the fact that Ashanti
  is a **tonic language**." Even then, Rattray notes, the public still believed
  it worked "on the Morse principle — it is always 'the Morse principle'."
- Carrington's own verdict on the era (RETRO-APPLIED): a prominent 19th-century
  linguist collected Duala drum words, compared them with speech, and concluded
  "these signals have not the slightest resemblance with the spoken language" —
  **he was holding the tone syllables in his hand and missed it.**

**For the game this hardens §1's conclusion into datable texture:** an 1890
traveller can *know that* the drums talk (Ellis was in print since 1887), can
own the two facts that would solve it (Christaller's tone marks; the two-pitch
drums), and still stand thirty years short of the answer. That is a puzzle the
player gets to beat the record at.

## 5. Gaps and unread sources
- Sebeok & Umiker-Sebeok 1976 (the 1,456-page survey **with distribution
  maps**) — not accessible online; the single best next source for the zone
  map.
- Stern 1957 — paywalled; quoted here via James 2021.
- Goldie's 1862 Efik dictionary entry for "nsibidi" — would be the hard
  pre-1890 attestation; unverified.
- Duveyrier's exact 1864 statements on Tifinagh use and on women — his script
  knowledge is confirmed; the specifics are unquoted.
- Oromo (tonal, Horn) — no surrogate attested and none denied; unresolved.
- The speechsurrogates.org database rendered empty to the crawlers — worth a
  manual browser visit.
