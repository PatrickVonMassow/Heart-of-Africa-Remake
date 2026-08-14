# The communication PoC (design.md §13.4)

The user's decisions of 13.08.2026 replace the former eleven-word teaching
design. The playable slice has one five-word tonal language, two teaching
places, and a four-word message. The child tag situations and the adult errand
catalogue from the former design are not part of this version.

This document is the reference the work-order points 686–692 cite; it states
what those decisions left to the build, so the points that carry the rebuild
cannot each invent their own answer. It replaces the version the finished points
477–488 were built against, which described the eleven-word design.

## What the player does

In one village of the tonal West/Centre belt the player watches and listens.
The inhabitants speak atomic utterances built from one syllable in two tones,
and the player works out their meanings from visible situations. The new
teaching is divided between the children's bank game, including the village's
play rocks, and the adults' water and digging work. Those situations are built
in their own work-order points; the removed catalogues are not substitutes for
them.

Later the chief sends a message on two drums in the same language. The player
must read it well enough to follow the river upstream, find a rock outside the
village, and dig there. Nothing hands the player a translation. The journal is
only a place for the player's own guesses, and the game never judges them.

## The two tones

`ba` is the low syllable and `BA` the high one. An utterance is an atomic
four-syllable sequence: the game never parses it into smaller meanings, and no
loudness, tempo, rhythm, or syllable length carries meaning.

A phrase is an ordered list of atoms separated by the same constant pause the
drums use. Each atom is observed and recorded separately.

## Why four syllables

Every valid sequence has an even number of high tones. Any two such sequences
differ in at least two positions, so one misheard tone cannot turn one word into
another valid word. At length four this rule produces eight sequences. Five are
used and three remain reserved. Length three produces only four parity
sequences and cannot hold the five-word language.

The direction words are exact tonal reversals. They are the mirror pair the
player is meant to notice. The four-word chief's message is sixteen syllables,
short enough to compare with a written note.

## The lexicon

The registry lives in `src/communication/lexicon.ts` and is keyed by lect so a
second region can add its own entry without changing consumers.

| Concept | Sequence | Meaning in the teaching |
|---|---|---|
| RIVER | `ba-ba-ba-ba` | the watercourse |
| UPSTREAM | `ba-ba-BA-BA` | against the current |
| DOWNSTREAM | `BA-BA-ba-ba` | with the current; the mirror of UPSTREAM |
| ROCK | `BA-ba-ba-BA` | a class of thing, not one named boulder |
| DIG | `ba-BA-BA-ba` | digging |

Reserved and unused: `ba-BA-ba-BA`, `BA-ba-BA-ba`, `BA-BA-BA-BA`.

ROCK must transfer between instances: the player learns it from the play rocks
in the village and applies it to the boulder upstream. It never means "the big
rock" or the name of one unique landmark.

## How it sounds and carries

A syllable is a sample, low for `ba` and high for `BA`, differing in pitch
alone. An utterance plays all four syllables at a constant pace. A phrase uses
one constant pause between atoms and no other structure.

Speech falls off sharply and is silent outside the hearing radius. The same
range decision governs sound, observation, overhead note, and gesture: unheard
speech teaches nothing and is not silently mimed. Pace, pause, radius, and
falloff remain calibratable under `balance.communication.*`.

## The children's game at the bank

The children play ONE game, at the river bank, and it teaches four of the five
words without a staged lesson (work-order 687). They roam their own quarter out
of earshot of the adults; at the end of that phase one of them calls `RIVER`,
points at the water and the group runs to the bank, and that caller is the first
catcher. Two rocks stand at the ends of a stretch of bank, one upstream and one
downstream, in the teaching stone's own size. The runners gather at one, the
catcher waits at the other, the direction is announced before each run, whoever
reaches the far rock calls `ROCK`, and whoever is caught drops out where he
stands until the run ends. Sides swap every run, so the announced word alternates
by construction, and the cycle ends when no free runner is left.

Three readings are closed deliberately. `ROCK` cannot be learned as "made it",
because the catcher taps his own rock and names it at the start of a run with
nobody arriving, and because a child climbs an ordinary scattered boulder in the
village — no part of the game — and names that while the group roams.
`UPSTREAM`/`DOWNSTREAM` cannot be learned as "to the far rock" or as left/right,
because the group's parting walk along the bank is announced with the opposite
word from wherever it stands, with no rock as its target. And the river visibly
flows, so the pair correlates with the current for a player who watches the
water.

Every utterance falls at a fixed point of the round — the opening call, the
direction announcement, the catcher's tap, the arrival, the parting call — and
none of them takes a child out of the game or slows it. Each is one atom from the
same lexicon, heard through the same range rule as any other village speech. The
phase lengths, the stage's distances and the extra berth the children give the
traveller are calibratable under `balance.villageLife.bankGame`.

## The message

`RIVER · UPSTREAM · ROCK · DIG`

The large low drum speaks `ba`; the small high drum speaks `BA`. The message is
four concepts, sixteen strikes, three equal inter-word pauses, and no other
structure. Afterwards it is displayed with the player's own reading over each
element. Those readings are the journal notes themselves and remain editable.

The message is asked for at the chief's audience, in his village alone, after a
culturally correct gift earns his trust. It is recorded as heard only after the
last beat and can then be reopened from the journal.

## Where the digging happens

The target rock stands outside the village at the river and is reached in the
bird's-eye view. The player travels upstream, digs at the rendered site, returns
the recovered artefact to the chief, and completes the puzzle. The village's
play rocks teach a category that applies to this separate boulder.

The artefact remains a single quest object: it is not trade stock, does not use
pack capacity, and cannot be sold. The chief's acknowledgement uses only ROCK
and DIG from the same language.

## Save compatibility

This change deliberately invalidates saved heard-utterance readings. The
sequence length changed, six concepts disappeared, and BIG_ROCK became ROCK, so
old utterance keys no longer identify the current inventory. No migration is
provided: saving is disabled for this PoC and no serious run depends on those
readings. The save/load implementation itself remains intact.
