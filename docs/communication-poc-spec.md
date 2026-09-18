# The communication PoC (design.md §13.4)

The user's decisions of 13.08.2026 replace the former eleven-word teaching
design. The playable slice has one six-word tonal language, two teaching
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
another valid word. At length four this rule produces eight sequences. Six are
used and two remain reserved. Length three produces only four parity
sequences and cannot hold the language.

A word carries at least one syllable of each tone. Four identical strikes are
the least hearable thing the drums can beat, and the message opens on RIVER, so
the two single-tone sequences are never words.

The direction words are exact tonal reversals. They are the mirror pair the
player is meant to notice. The four-word chief's message is sixteen syllables,
short enough to compare with a written note.

## The lexicon

The registry lives in `src/communication/lexicon.ts` and is keyed by lect so a
second region can add its own entry without changing consumers.

| Concept | Sequence | Meaning in the teaching |
|---|---|---|
| RIVER | `ba-BA-ba-BA` | the watercourse |
| UPSTREAM | `ba-ba-BA-BA` | against the current |
| DOWNSTREAM | `BA-BA-ba-ba` | with the current; the mirror of UPSTREAM |
| ROCK | `BA-ba-ba-BA` | a class of thing, not one named boulder |
| DIG | `ba-BA-BA-ba` | digging |
| CHIEF | `BA-ba-BA-ba` | the village's head man |

Reserved and unused: the two single-tone sequences `ba-ba-ba-ba` and
`BA-BA-BA-BA`. CHIEF took the last spare mixed sequence, RIVER's tonal mirror,
so all six words now fall into three mirror pairs — RIVER/CHIEF,
UPSTREAM/DOWNSTREAM and ROCK/DIG. UPSTREAM and DOWNSTREAM remain the
only pair the player hears AS a pair — they are announced against each other in
the same round of the bank game, while CHIEF is only ever said alone, by the
drummer pointing at the hut.

CHIEF is taught the way every other word is: the use key at the drummer while
the chief is in his hut makes him point his arm at the chief's hut and say it,
within the same hearing range, with the same overhead note and the same guess
dialog. Nothing translates it.

ROCK must transfer between instances: the player learns it from the play rocks
in the village and applies it to the boulder upstream. It never means "the big
rock" or the name of one unique landmark.

## How it sounds and carries

A syllable is a sample, low for `ba` and high for `BA`, differing in pitch
alone. An utterance plays all four syllables at a constant pace. A phrase uses
one constant pause between atoms and no other structure.

CALL and TALK are utterance registers with separate reach, loudness and falloff. RIVER calls, direction announcements and arrival ROCK use CALL; taps, off-game boulders and all ordinary speech use TALK. TALK retains 10 m; CALL uses 34 m, 1.25 times the source level and falloff 4. The rock-to-spectator distance is about 22 m, but the shipped Mandinka opening RIVER caller was measured at 32.64 m from that stand. The full-round tests measure each received call at at least 20% before its loudness multiplier. Sound, memory, gestures and label interaction share each register’s hard boundary. The adult/child separation budget remains 10 m.

## Panning and mixing

Compensated panning preserves the mono sum and never reduces stereo power.
Speech has its own volume, 3 since 18.09.2026 — 1.5 times the former 2, on the
user's instruction. Falloff 4 carries 73.5% at 3 m and 20% at the 10 m rim.
Including the louder child synthesis and panned channel required reducing the
envelope peak from 1.8 to 0.85: the conservative mixed-output bound fell from
1.780 to 0.977, speech at 3 m and the rim remains louder.

The chief's drum message carries its own level, `communication.drumMessagePeak`,
2.5 times the 1.8 that used to sit as a literal in `drumMessagePlan`. The two
raises put the conservative mixed-output bound back over full scale: 1.336 with
the debug drum bed and 1.242 without it, 2.52 dB and 1.88 dB over. Nothing in
the graph absorbs that — there is no master limiter — so point 1156 carries it.
The measured factors are not to be scaled back to hide the overage.

## The speech floor

One situation speaks at a time within the player's earshot. Its word and visible
consequence finish before another situation speaks, and a ready continuation
keeps precedence. A silent walk, a child's ear or an occupied dig site yields
after the consequence window. Work can continue in several places; a pair's
existence alone never owns the village's speech for its entire task lifetime.
An assigned dig site stays with its pair until the bout ends, including their
walk there, so two pairs cannot arrive at one hole and block each other's word.

The gap after a word is a CONSEQUENCE WINDOW rather than plain silence: the next
word waits until the previous word's effect was visible — the invited adult sets
off, the dispatched carrier leaves. Silence teaches nothing; the visible
consequence is the lesson.

The floor measures at the player's ear, at each register's own reach rather than
a flat radius, so a village out of earshot keeps talking and acceptance criterion
15 is not paid for a confusion that never reaches the player.

Turn-taking is FIRST COME, FIRST SPOKEN among audible exchanges. Granting the
floor in villager order starves whichever pair the loop reaches late: measured
over 180 s at six villagers, one pair spoke exactly once in the whole run,
because the bound forced its word out one step before its task expired. Two
rules keep that from returning. A word whose moment has NOT come — a pair still
walking to its site owes its DIG but cannot yet say it — takes no turn from
anybody, through either the waiting queue or an existing situation's precedence.
A previously queued word that stops being ready keeps its deadline but yields
its turn. A ready continuation never queues behind the waiter it is blocking;
doing so deadlocks both. Reserving the floor for silent situations instead held
water dispatch and the bank's call for the full 240 s backstop in the browser.

A QUEUED WORD NEVER EXPIRES. The hold is not a scheduling knob but a
stuck-situation backstop, calibratable and derived: strictly longer than the
longest situation a healthy village produces and strictly shorter than the
errand's own kill time. The unit test measures that maximum over every shipped
village layout rather than restating it, so the number fails the day village
timing grows past it. The hold is additionally capped by the owning task's
remaining life, because a flat hold protects nothing about a word queued late in
a task's life — the task would die first, tripping the very assertion the floor
exists to stop. The invariant, binding on every deferral here: NO WORD IS EVER
STILL OWED WHEN ITS TASK EXPIRES.

At the bound the bound WINS and the overrun is reported LOUDLY. The two rules
only look contradictory: a situation still standing at that point has outlived
its own maximum, so its exchange is no longer legible to anybody, and letting the
queued word through costs no clarity that was still there. The word is spoken AND
the forcing is reported as a defect naming the situation that overran. A word
held past its hold is a defect, never an exemption — the hush that causes a
deferral no longer excuses the lost word.

THE FLOOR CLEARS WHAT THE FLOOR RAISED. One village word at a time is the
floor's own rule, so the word it grants takes the previous village note down and
forgets that speaker's figure with it. A note raised OUTSIDE the floor is not the
floor's to clear: the chief's answer to the player stands for as long as it was
given, however much the village says meanwhile. Taking every note down instead
left the chief's head bare the moment any villager spoke, which the picture check
caught.

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
downstream, in the play rocks' own size. The runners gather at one, the
catcher waits at the other, the direction is announced before each run, the
catcher steps to his stone, LAYS HIS HAND ON IT and names `ROCK` while everybody
holds at the stones, whoever reaches the far rock calls `ROCK`, and whoever is
caught drops out where he stands. Sides swap every run, so the announced word alternates by construction.
When no free runner is left, the caught children stay crouched for a readable
ending before everybody rises and walks back toward the roaming quarter.

Three readings are closed deliberately. `ROCK` cannot be learned as "made it",
because the catcher taps his own rock and names it at the start of a run with
nobody arriving, and because a child climbs an ordinary scattered boulder in the
village — no part of the game — and names that while the group roams.

THE HAND IS ON THE STONE WHILE THE WORD FALLS. The tap is a CONTACT, not a
gesture toward a stone: before he speaks, the tapper walks from his waiting
station to the rock, leans in and reaches until his hand rests on the drawn
flank, and he holds that pose for the whole tap interval. The contact is solved
against what the picture draws — the play rock's own mesh at its own instance
scale and yaw — rather than against a nominal radius, so a stone built wider or
narrower keeps the hand on its surface. Where the walk to the stone is blocked,
the run opens SILENTLY: no word is spoken from the air. (The stone's collider is
therefore what it occupies where bodies are, not its widest overhang: a ring
drawn at a boulder's broadest point fences off exactly the ground the child has
to reach it from.)
The river visibly flows, so `UPSTREAM`/`DOWNSTREAM` correlate with the current
for a player who watches the water.

Every utterance falls at a fixed point of the round — the opening call, the
direction announcement, the catcher's tap and the arrival. Each is one atom from the
same lexicon, heard through the same range rule as any other village speech. The
phase lengths, the stage's distances and the extra berth the children give the
traveller are calibratable under `balance.villageLife.bankGame`.

## The adults' work

The adults teach RIVER through an errand ONE MAN ORDERS AND ANOTHER RUNS. At the
village water stand beside the fire, an adult turns to a free adult, says RIVER
and points at the river; the one addressed takes the empty jar, walks down the
water path and on past its landing to the waterline, stands ankle-deep and dips
the jar for a held moment. He carries the full jar back to the stand, sets it
down and says RIVER a second time to the man who sent him. It is ONE round trip
held by ONE carrier: the jar is empty on the way down and full only after the
dip, never flipped between two castings. Both utterances fall at the stand,
inside the village and clear of the children's bank game, and both wait while a
child is in earshot, exactly as the DIG utterances do. The stand holds a few
standing jars; a further delivery replaces the oldest, so the water needs no
consumer.

NO VILLAGER SPEAKS TO NOBODY. Every utterance has an addressee who reacts and a
consequence the player sees; the teaching comes from the act that follows the
word, never from a word spoken beside an act. With nobody free to send, the
order is not given at all, and the errand simply waits for the next round.

THE WATER READING IS ACCEPTED, NOT CLOSED. A player may read the second RIVER as
WATER. The chief's message carries just as well as `WATER · UPSTREAM · ROCK ·
DIG`, so the reading is left standing — unlike the three readings ROCK closes
deliberately.

DIG is said twice in each of two paired
bouts at different excavations: an initiator first walks to a free adult and
says it as an invitation, then both walk to the site, where the initiator says
it again before they dig together with tools in hand. A bout with no second
adult free is retried later, never performed alone. Both DIG utterances wait
while a child is in earshot, preserving the separation between the two teaching
groups. Each stroke changes the site by deepening the pit, growing the spoil
and throwing earth.

## The message

`RIVER · UPSTREAM · ROCK · DIG`

The large low drum speaks `ba`; the small high drum speaks `BA`. The message is
four concepts, sixteen strikes, three equal inter-word pauses, and no other
structure. Afterwards it is displayed with the player's own reading over each
element. Those readings are the journal notes themselves and remain editable.

The message is asked for OUTSIDE, in his village alone, and at the DRUMMER'S
side. The use key at the chief's hut brings the chief out of it — there is no
audience overlay — and he walks across the village to the drummer, taking his
stand abreast of the man and facing the way the drummer faces, so the traveller
can stand before the pair and see both from the front. Arrived, the use key at
either man sends the message. He stays a calibratable minute
(`balance.communication.chiefStaySeconds`), counted from his arrival and afresh
from every message, in which the same key beats it out again and the prompt
names that; then he walks home. Called on the way home — at him or at the
drummer — he turns round where he stands and the drums beat by themselves the
moment he is back beside them. Back in his hut, the key at the hut starts the
whole thing over; used while he is outside, the hut does nothing and offers no
prompt. Entering a settlement always finds him indoors: his walk is scene state
and is never saved. The message is recorded as heard only after the last beat
and can then be reopened from the journal.

## Where the digging happens

The target rock stands outside the village at the river and is reached in the
bird's-eye view. The player travels upstream, digs at the rendered site, returns
the recovered artefact to the chief, and completes the puzzle. The village's
play rocks teach a category that applies to this separate boulder.

The artefact remains a single quest object: it is not trade stock, does not use
pack capacity, and cannot be sold. From the moment the shovel reaches it, it is
an ITEM IN THE INVENTORY BAR under its own name, and it is given by USING it:
the traveller stands before the chief who has come out into the open, within the
give reach (`balance.communication.giveReach`), and activates the find in the
bar — a click, exactly as medicine and the shovel act. Only then is it laid in
his hands. Used anywhere else — no chief out in the open, or too far from him —
it hands nothing over and one toast says why, and the find stays in the pack.
The use key at his hut hands nothing over at all: it brings him out, and from
then on it is the key at either man — the chief or his drummer — that sends the
drums, while the hut itself answers nothing. His acknowledgement stands over his own head like
any other villager's word — it uses only ROCK and DIG from the same language.

Every later quest find brought to a chief follows the same rule: a found thing
is an inventory item, and giving it is using that item before him.

## Save compatibility

This change deliberately invalidates saved heard-utterance readings. The
sequence length changed, six concepts disappeared, and BIG_ROCK became ROCK, so
old utterance keys no longer identify the current inventory. No migration is
provided: saving is disabled for this PoC and no serious run depends on those
readings. The save/load implementation itself remains intact.
