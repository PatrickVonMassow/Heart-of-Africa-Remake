# The communication PoC (design.md §13.4)

The user's brief of 03.08.2026 answers the open question of §13.4 for a first
playable slice: how a player comes to understand the people he meets. This
document is the reference the work-order points 477–488 cite; it states the
decisions the brief left to the build, so a dozen separate agents cannot each
invent their own.

The brief itself is the authority. Where this document and the brief disagree,
the brief wins and this document is wrong and must be corrected.

## What the player does

In one village of the tonal West/Centre belt he watches. The inhabitants speak
in short utterances built from a single syllable in two tones, and he works out
what a handful of them mean by seeing what happens around them. Later the chief
sends a message on two drums, in the same sequences, and the player has to read
it well enough to walk to a place he has never been told about in words and dig
there.

Nothing hands him a translation. The journal gives him a place to write down
what he believes, and the game never checks it.

## The two tones

`ba` is the low syllable, `BA` the high one. An utterance is a sequence of them
and nothing else. It carries at least one of each, it is unique, and it is
ATOMIC — the game never parses it into parts, and no loudness, tempo, rhythm or
syllable length means anything anywhere.

A PHRASE is an ordered list of atoms spoken one after another, separated by the
same constant pause the drums use. Villagers speak phrases when the brief asks
them to ("a known movement call AND the river utterance", "dig + here"). Each
atom in a phrase is observed on its own, and the overhead hypothesis label shows
one reading per atom, in order.

## Why five syllables, and not four

Eleven concepts need eleven sequences. Requiring one low and one high leaves
2^n − 2 of them: four syllables give 14, which is enough to COUNT but not enough
to HEAR. Eleven words in a four-syllable space mathematically force some pairs
to differ in a single syllable — a binary code of length four with every pair
two syllables apart holds at most eight words. A player who mishears one beat
would then hear a different, equally valid concept, and would be confidently
wrong rather than unsure.

Five syllables with an even number of highs gives fifteen sequences of which any
two differ in AT LEAST TWO syllables. One misheard beat can then never turn one
concept into another; it can only produce something that is no concept at all,
which the player notices. Eleven of the fifteen are used and four stay reserved.

The cost is length: the chief's message runs thirty-five syllables instead of
twenty-eight. That is the trade — a longer message against an unlearnable one —
and it is on the board as a decision the user may reverse.

## The lexicon

| Concept | Sequence | Shape |
|---|---|---|
| COME | `BA-BA-ba-ba-ba` | falling, toward the speaker |
| GO_THERE | `ba-ba-ba-BA-BA` | rising, away — the mirror of COME |
| HERE | `BA-ba-BA-ba-ba` | the near thing |
| THERE | `ba-ba-BA-ba-BA` | its mirror, the far thing |
| FOLLOW | `ba-BA-BA-ba-ba` | |
| NO | `ba-ba-BA-BA-ba` | its mirror |
| UPSTREAM | `ba-BA-BA-BA-BA` | rising against the current |
| DOWNSTREAM | `BA-BA-BA-BA-ba` | its mirror, falling with it |
| RIVER | `ba-BA-ba-BA-ba` | alternating, like the water |
| BIG_ROCK | `BA-ba-ba-ba-BA` | framed by two highs — a solid block |
| DIG | `BA-ba-ba-BA-ba` | |

Reserved and unused: `ba-BA-ba-ba-BA`, `BA-BA-ba-BA-BA`, `BA-ba-BA-BA-BA`,
`BA-BA-BA-ba-BA`.

All four opposite pairs are exact mirror images: come reversed is go, here
reversed is there, follow reversed is no, upstream reversed is downstream. That
is a reward for listening closely, never a requirement — every concept stays
learnable from its situations alone, and a player who never notices the symmetry
loses nothing.

## Who teaches what

The children, at their game of tag, teach the six general concepts: COME,
GO_THERE, FOLLOW, HERE, THERE, NO. The adults, at their errands in the village
and at the bank, teach the five the message needs on top: RIVER, UPSTREAM,
DOWNSTREAM, BIG_ROCK, DIG — and they use the children's concepts alongside them,
which is what lets the player isolate the new meaning from the known one.

Every concept appears in more than one situation. One situation would only teach
that an utterance belongs to a rule of the game.

Three pairs need a deliberately staged contrast, or they teach nothing:

- COME against FOLLOW. Both end with someone moving toward the speaker. The
  discriminator is that the caller of COME STANDS STILL and the caller of FOLLOW
  is running away. At least one COME must be spoken by a stationary child.
- GO_THERE against THERE. Both point at a distant spot. The discriminator is that
  GO_THERE is followed by the addressee walking there and THERE is not followed
  by movement at all. At least one THERE must be spoken with nobody moving after
  it.
- BIG_ROCK against UPSTREAM. The rock lies upstream, so an errand to the rock and
  an errand upstream look identical. At least one BIG_ROCK situation must carry
  no upstream walk — pointing at the rock from the bank, or an errand that starts
  there and comes back.

## How close you must stand

The utterances carry a short distance and fall off sharply. Among the children
the player hears the children; among the adults, the adults; in the middle of
the village, no permanent babble of both. The two groups are placed far enough
apart for that to hold.

## The message

> Go to the river. Follow it upstream. Dig at the big rock.

`GO_THERE · RIVER · FOLLOW · UPSTREAM · BIG_ROCK · THERE · DIG`

Seven concepts, a constant pause between them, and no other structure. The large
low drum speaks `ba`, the small high one `BA`, and the strike is visible on the
drum being played. Afterwards the message is shown with the player's own
hypothesis over each element, editable there — the same note the journal holds,
so the two can never drift apart. The display can be reopened, so a player who
forgets the message is not locked out of the feature.

## Where the digging happens

The rock stands at the bank a short way upstream, inside the village's walkable
area, and it is also a real feature of the bird's-eye world — the brief asks for
both ("in der Vogelperspektive sichtbar", "in kurzer Entfernung flussaufwärts").
The digging itself uses the shovel mechanic the game already has, at the spot the
renderer draws. This is a best guess where the brief is silent about the
perspective, and it is on the board as a decision the user may reverse.

## What is deliberately NOT decided here

The body representation and the exact gesture vocabulary are the build's to
choose, within the existing style (point 479). Which village is used is point
482's decision; the candidate is the Bambara village, whose Ségou heartland lies
on the Niger and whose people carry the balafon tradition the research names.
