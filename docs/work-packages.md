# Work packages (bundles)

**ONE BRANCH PER POINT, not per bundle** (user decision 30.07.2026). The original
rule read "a bundle is ONE branch, ONE verification and ONE regression round".
The user weighed it and decided against, on two grounds that hold: the regression
is already SCOPED per change — a scripts- or docs-only point runs the Vitest layer
and nothing else, so the "saved round" it would buy is two minutes — and a whole
bundle on one branch lands every one of its features in a single merge, which is
neither reviewable nor attributable when one of them is wrong.

**THE BUNDLE SAVES NEITHER TIME NOR TOKENS — say so, do not re-derive it.** The
scheme was cut on 29.07.2026 with a saving as its stated purpose ("n points cost
one verification round together and n apart"), and by 30.07.2026 the user had
taken that claim apart, step by step, and it does not survive:

- The regression is SCOPED per change, so a scripts- or docs-only member's
  "shared round" is a two-minute Vitest run.
- Nothing is carried between two points of a bundle: each goes to a
  worktree-isolated agent with a fresh context and a brief, and the main session
  hands over at every point boundary. The "related code stays fresh" line that
  stood here was simply wrong.
- The one real carry — handing the next point to the agent that already has the
  files open, as with 439 → 452 — is possible only on FILE OVERLAP, and it is
  fenced in by point 471 (full brief closing the previous point, one commit per
  point, no third point in one context, dropped if reused work draws more review
  findings). What is left of the saving is small and deliberately capped.

So the grouping is kept for what it actually does, and the savings argument is
retired:

- **The ORDER** is the priority ranking. Nothing more.
- **The COLLISION MAP.** The split follows SHARED FILES, so it says which points
  must NOT run in parallel. Two points in the same bundle that touch the same
  module go on ONE branch — one commit each — because parallel agents would
  otherwise overwrite each other. That is the only case where a branch carries
  more than one point.
- **NOT the board.** The queue was grouped by bundle on 30.07.2026 and the user had
  it taken back out the same evening (point 472): a flat queue IS the working order,
  read top to bottom, while a grouped one is not — the pool draws its three slots
  from different groups. The grouping cost clarity instead of adding it. The bundle
  is never rendered.

The collision map is the only one of the two that is load-bearing, and it is a
HAND-MAINTAINED APPROXIMATION of something measurable: which points touch the same
files. Deriving it instead of curating it would make the grouping both cheaper and
harder to get wrong — an open thread, not a decision taken.

Where the heavy verification really is per-branch expensive — the render bundles,
whose points need the browser suites on both backends — the saving is taken at the
END: several finished per-point branches merge, and ONE regression runs over the
merged result. That saving is real and is the only sizeable one left, but it comes
from BATCHING THE MERGE, not from the bundle — any set of finished branches can be
merged together, related or not.

AND UNTIL POINT 471 LANDS THE SCHEME COSTS TIME. The order walks the bundles
strictly in sequence while a bundle's members are, by construction, the points that
cannot run beside each other — so the leading bundle can feed one agent while two
of three slots stand idle. That is not a small residual; it is the largest single
effect the bundling currently has on wall-clock, and its sign is negative.

Bundles A–J were agreed with the user on 29.07.2026. K, L and M were cut the same
evening for the open points the original scheme never covered, under the user's
standing authority over the bundling ("Mache die Bündelung und Reihenfolge so, wie
du sie für gut hältst"). The scheme had drifted within an hour of being written —
it covered 53 of 91 open points, listed one already-closed point, and nothing
compared it against the work order. Hence the property to preserve:

> **Every open point in `TASKS.md` appears in exactly one bundle here, or in the
> unbundled list below.** A new point joins a bundle when it is appended.

**Every bundle is SPOKEN by its name, never by its letter** (user 30.07.2026: "Die
Buchstaben sagen nichts aus"). The name is what goes into a chat answer, a board
card and a point text; the letter survives only as this table's internal id, so the
point texts written before the naming stay valid. A newly cut bundle gets its name
in the same moment — a letter alone is not a complete definition. The German name is
the one the user reads (memory `bundle-names`, retrospective §3.66).

## The bundles

| Name | Id | What it is | Points |
|---|---|---|---|
| **Dorfleben** | A | Village life | 648, 350, 351, 356, 357, 359, 360, 394, 578, 653, 680, 681, 682, 686, 687, 688, 689, 690, 691, 692, 694, 698 (648 first — the user is blocked on it) |
| **Wetter & Wasser** | B | Weather, ground and water surface | 314, 320, 321, 323, 348, 353, 354, 358, 384, 385, 500, 501, 522, 523, 548, 603 |
| **Siedlungsgeometrie** | C | Settlement geometry | 299, 349, 352, 380, 415, 428, 581, 583, 604, 611 |
| **Sonne & Himmel** | D | Sun and sky | 343, 344, 345, 346 |
| **Monumente** | E | Monument sites | 315, 379, 391 |
| **Tierverhalten** | F | Animal behaviour | 265, 269, 312, 362, 363, 364, 414, 565, 575, 725 |
| **Kadaver & Geier** | G | Carrion, vultures, staging | 319, 322, 326, 327, 328, 336, 453 |
| **Chat & Tafel** | H | Chat and board | 440, 451, 465, 467, 473, 539, 491, 508, 520, 621, 625, 664, 665, 699, 704, 705, 706, 713, 720, 728, 730, 731 — the rest landed 30.07.2026 (308, 410, 411, 416, 421, 423, 424, 430, 435, 436, 441, 439, 452, 472, 470) |
| **Session- & Repo-Hygiene** | I | Session, pool and repo hygiene | 401, 434, 461, 462, 463, 471, 553, 554, 556, 629, 646, 649, 614, 660, 676, 683, 696, 708, 710, 724, 733, 734 (646 is the doctor-side twin of 629 — the same deletion reached by a different route; 649 holds the holes the fifth review found in 629's own lock protocol; 553 is 373's measured successor lever; 556 is the lease half of the same singleton family) — the rest landed 30.07.2026 (329, 396, 399, 409, 426, 427, 429, 431, 433, 458) and 08.08.2026 (373) |
| **Modell & Wächter** | J | Model and guard chain | 309, 355, 397, 425, 437, 438, 457, 468, 534, 535, 536, 537, 538, 540, 560, 561, 613, 630, 631, 632, 634, 638, 639, 640, 726, 495, 497, 542, 559, 596, 598, 599, 609, 650, 652, 669, 677, 678, 693, 715, 718, 722, 729, 735, 736, 737 (534–538 are the audit findings of point 297 — worked BEFORE the rest of the bundle, because they decide what the four-eyes gate and the review schedule see at all) |
| **Testinfrastruktur** | K | Test and verification infrastructure | 295, 330, 387, 418, 455, 456, 460, 464, 466, 532, 549, 557, 563, 564, 566, 567, 568, 569, 570, 571, 572, 573, 574, 641, 642, 647, 498, 506, 507, 510, 514, 518, 521, 552, 558, 595, 597, 615, 620, 622, 626, 627, 643, 668, 670, 695 (564/566/567 all came out of the point-342 verification: what a red is believed to mean, what a repair costs, and what a killed session leaves running) |
| **Dokumentation** | L | Docs and knowledge transfer | 303, 333, 422, 555, 645, 511, 512, 531, 607, 619 — the rest landed 30.07.2026 (459) |
| **Steuerung & Performance** | M | Controls and performance | 310, 342, 347, 551, 618 |
| **Urlaubsfestigkeit** | N | Unattended operation for a fortnight — recovery from a failure at ANY moment, quota waiting, the boot path, the readiness check and the chaos drill that proves it | 442, 443, 444, 445, 446, 447, 448, 449, 450, 533, 562, 612, 504, 515, 517, 528, 616, 617, 658, 663, 716, 719 |
| **Kommunikation** | O | The communication PoC: the tonal language, who speaks it, where it is spoken, what the player may write down | 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 519, 659 (480 IS point 351 and 488 IS point 352, pulled forward — they close together); and the PLAY-SESSION findings of 09.08.2026: 587, 577, 586, 580, 582, 588, 576, 585, 584, 579, and of 10.08.2026: 605 |

**Urlaubsfestigkeit** was cut on 30.07.2026 on the user's demand that the batch be
worked for two weeks without them, surviving an outage of Claude, of their internet
or of the machine at any moment — "auch mitten in einer kritischen Aktion". Two
decisions bound it: **no cloud worker** (so a dead machine or a fortnight-long
outage of the user's line stays an accepted residual — no local layer can cover it),
and **no pacing** — a quota block is retried until budget returns instead of being
spread out. Its order inside the bundle is 442 first (largest lever, smallest
change) and 449 last, because the drill is what makes the others more than a claim.

**Not bundled**, each for its own reason:

- **184, 200, 203, 205, 207** — the big audits. They sweep the whole codebase and would
  swallow any bundle they were put in.
- **174, 224** — releases, gated on a full closing run rather than on a branch.
- **635, 636, 637** — the release machinery the user asked for on 11.08.2026: the queue cut
  into release blocks, a block that closes and tags itself, and a board that can be
  rearranged by hand. Built under the assurance regime of 639.
- **633** — the release's own closing run: two regressions with the blind-parallel cleanup
  between them. Not a bundle member; it IS the gate 174 waits on.
- **285**.
- **393** — sequenced behind 264, so it moves with that point rather than with a
  bundle.
- **529** — confined to the protected user configuration outside the repository.
- **591** — checks rule compliance across the whole repository.
- **602** — inventories unused mechanisms repository-wide.

## Order of work

**THE RULE IS THE GOAL, NOT THE LIST** (user 04.08.2026): what ranks first is the
communication PoC being FINISHED as fast as possible. That pulls forward not only
its own twelve points but anything that raises the rate at which they can be
worked — the second backend lane (493) is the first such case, because without it
every picture check of the feature crawls. A point that makes the PoC land sooner
belongs at the top even when it is not part of the PoC.

**Kommunikation first** (user 03.08.2026, restated 04.08.2026): the communication
PoC outranks the whole queue — it is the feature the game is being built toward,
and the user asked for it before everything else. Its own build order is the wave
plan in TASKS.md (wave 1: 477 · 482 · 479), chosen so no two parallel agents own
the same file. **493 runs alongside it**, not after: the second backend lane is
what lets the wave's render points be merged under the both-backend rule at all.
THIS PARAGRAPH IS THE QUEUE'S ORDER — when it disagreed with TASKS.md between the
03. and the 04.08.2026, the queue kept feeding infrastructure while the point the
user had put first sat at position 60 (that is what the flat list is read as).

**URLAUBSFESTIGKEIT NOW LEADS, AHEAD OF THE PLAY SESSION** (user 10.08.2026: "Das darf
niemals passieren. Ich muss mehrere Tage am Stück weg sein dürfen und mich darauf verlassen
können, dass die Batch abgearbeitet wird."). The batch had stood idle for half an hour that
morning with nothing broken — a correct handover that no successor picked up — and the
bundle meant to prevent exactly that was sitting behind everything, because the flat list in
TASKS.md never carried the ranking this file declares. So the queue now opens with
562 · 533 · 612 · 448 · 449, and 613 rides with them because it blocks every delegating turn.
The 09.08.2026 play-session findings follow IMMEDIATELY behind and keep their precedence over
the rest — an unattended batch that cannot run works on nothing at all, so this is a
prerequisite for that work rather than a replacement of it. If the user wants the play-session
defects back in front, that is his call and the board asks it.

**THE 09.08.2026 PLAY SESSION OUTRANKS EVERYTHING, AND ITS MERGES ARE BATCHED**
(user 09.08.2026). The user played the deployed build and reported thirteen defects
and two extensions, almost all of them in the communication PoC. They lead the queue,
ahead of every other bundle including the infrastructure above — his words: "vor allem
anderen in der Queue".

He also asked for them to be worked and TESTED TOGETHER rather than one by one, and
that is taken the way this document already settled on 30.07.2026, NOT by putting the
bundle on one branch (point 471's rule stands: one branch per point) and NOT by
grouping the queue (point 472 took that back out the same evening). It is taken at the
MERGE, which is where the only real saving of the scheme sits: the finished per-point
branches of a package are merged TOGETHER and ONE both-backend regression runs over
the merged result. Five acceptance runs instead of thirteen, without reopening either
decision.

The packages, cut by what ONE acceptance run can judge — re-cut them as further
reports arrive rather than letting a package grow past its own acceptance:

**FIVE THROUGHPUT POINTS OVERTAKE THE COMMUNICATION BUGS** (user 10.08.2026, his
reasoning: a lever that makes every following point cheaper may well deliver the deferred
bugs EARLIER, not later). Ranked by their own measured shares, the head of the queue is
now 604 (the fatal one, already in flight), then **593 → 594 → 592 → 595 → 598**, and the
09.08. bugs follow.

- **593** first because it is the cheapest thing on the list — one binding paragraph in
  two prompts — and it pays from the next agent onwards: search and read alone are 25.1 %
  of the weighted spend, and 15.2 % of all output re-read what could not have changed.
- **594** because bookkeeping is 26.0 % of the weighted spend and 37.5 % of the machine
  hours, and it falls on the MAIN session — the one serial point every other point passes
  through, which spends 62.3 % of its own cost on it.
- **592** because waiting is the largest single lever measured: 10.9 % polling plus 3.6 %
  idling, ≈ 18.7 machine-hours in the measured window.
- **595** because verification is 47 % of the cost and the ladder bites exactly where the
  deferred bugs bleed — the render points that need a picture on both backends.
- **598** immediately after 595, not on its own merit (≈ 2 % of a median point) but
  because it is what ROUTES the ladder to the agents: 595's cheapest rung exists today and
  no brief mentions it, which is how it stayed unused for a month.

Left where they are: **597** (bounded output — real and compounding, the next candidate
if this batch pays off), **596** (it reduces the variance of the tail, not the average)
and **599** (pure measurement — it judges the others, it saves nothing itself).

**FOUR OF THE 09.08. POINTS DROP BEHIND 602** (user 10.08.2026): 581 (the faint
settlement boundary), 601 (Ctrl+W closing the browser), 600 (the unlabelled attacking
lion) and 603 (the ground's micro-detail) now sit AFTER 602. His reason, and it is the
ranking rule of this document applied by him: none of them is needed for the
communication mechanic, and none of them makes a following point cheaper — so neither
of the two things that pull work forward applies to them.

**AND THE 10.08.2026 SESSION LEADS THAT** (user 10.08.2026). He played the deployed
build again and reported two things. Being STUCK (604) goes to the front of the whole
queue, ahead of the 09.08. packages: with saving tied to port visits, a wedged traveller
loses the expedition, and no other defect on the list can end a session that way. The
speech volume (605) joins Ton, where it belongs — it is the same complaint as 577 seen
from the player's side, the control being unfindable rather than absent.

| Package | Points | The one acceptance |
|---|---|---|
| Festhängen | 604 | one walk into the reported wedge |
| Ton | 577, 587, 605 | one listening pass |
| Lehrtext erreicht den Spieler | 580, 582, 586, 588 | one live session in the village |
| Figuren | 576, 578 | one picture check |
| Ufer & Welt | 583, 584, 585, 581 | one walk along the bank and the boundary |
| Journal | 579 | HUD only, no scene |

Festhängen leads, then Ton: a session that cannot be continued makes every other
judgment moot, and after it, while the syllables are a squawk and the speech sits behind
a control nobody finds, nothing about the language can be judged at all.

**THE RANKING AS IT STANDS (user 10.08.2026).** The goal is the communication PoC in
a usable state and then **v0.3**, and the order serves that goal:

1. **Throughput and token cost first** — anything that measurably lowers what a point
   costs or raises the rate at which the queue is worked, including the measured batch
   STALLS out of Urlaubsfestigkeit (a batch that stands still has throughput zero).
   The remaining absence-hardening is insurance rather than a lever and follows later.
2. **The communication mechanic**, until the PoC is usable — that is what the release
   is for.
3. **The critical bugs**: anything that ends the player's session, loses the
   expedition, or voids a verification.
4. **v0.3 with the full closing** (dead code, stale docs and the `.md` audit included).
   It is gated on 2 and 3 ONLY. Features do not gate it.
5. **Everything else** — the visible-defect bundles, **Tierverhalten → Sonne & Himmel →
   Steuerung & Performance → Dokumentation** — and the big audits last.

Infrastructure leads because every later bundle is verified through it: the board
must tell the truth, the session handover must hold, the guard chain must actually
fire, and a red suite must mean a defect rather than machine load. Fixing those
first pays for itself in every bundle after — and the night of 29.07.2026 lost
hours to exactly those four failing at once.
