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
| **Chat & Tafel** | H | Chat and board | 440, 451, 465, 467, 473, 539, 491, 508, 520, 621, 625, 664, 665, 699, 704, 705, 706, 713, 720, 728, 730, 731, 740, 749, 777, 793, 799, 800, 828 (793 is the deadlock between the pause and the chat watcher, found 20.08.2026 when the user's two answers sat unread for 19 minutes — it edits the watcher's wake decision, so it is not worked beside anything else that touches the chat path; 799 is the residue of that same change — a supervision answer that can no longer be returned, still promised in the comment and still handled by the launcher — so it edits the path 793 just touched and is read straight after it; 800 is the contradiction between the boundary's dictated handover card and the board's publish gate, which edits the board publish path this bundle owns, so it is not worked beside 787, which filed the same defect from the other side; 828 is the chat reply that published the name of its own flag instead of the answer, reported by the user on 22.08.2026 — it edits the same outward prose path this bundle owns and is the one point of it that stands before the release) — the rest landed 30.07.2026 (308, 410, 411, 416, 421, 423, 424, 430, 435, 436, 441, 439, 452, 472, 470) |
| **Session- & Repo-Hygiene** | I | Session, pool and repo hygiene | 401, 434, 461, 462, 463, 471, 553, 554, 556, 629, 646, 649, 614, 660, 676, 683, 696, 708, 710, 724, 733, 734, 738, 739, 741, 742, 743, 744, 745, 746, 747, 748, 750, 751, 752, 753, 754, 755, 756, 757, 758, 759, 761, 762, 763, 764, 765, 766, 767, 768, 769, 770, 771, 772, 773, 774, 775, 779, 780, 781, 782, 783, 784, 785, 786, 789, 790, 791, 795, 796, 797, 798, 801, 802, 803, 804, 805, 806, 807, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 830, 831, 832, 833 (833 is the timestamp guard’s own test losing a minute race under load — it spawns the real guard, which stamps the minute it runs in, then compares against a second stamp taken after the subprocess returned, so a rollover reds it at correct behaviour, measured 22.08.2026 inside the main push gate; it edits only that guard’s test file, so it collides with no other open point, and it stands behind the release because the machine filed it from its own gate run; 832 is the ratchet measured against today's ceiling instead of the one it replaced, plus three heuristic readers of the same guard that give both wrong answers — filed from the cross-vendor review of 768; it edits the doc-budget core 762 and 802 also own, so it is worked with them rather than beside them; 831 is the launcher singleton answered from a file — a live daemon the record does not name is invisible to `--status` and `--start` puts a second one beside it, measured by hand on 22.08.2026; it edits the launcher and the singleton probe that 795, 811 and 823 also own, so it is not worked beside them; 830 is the rule fingerprint that is wider than the rule — `rule:model-policy` runs seven bullets past the model policy because §6 has no blank line between its bullets, so editing a neighbouring rule stales twelve stamped files and point 768's counted merge already bent to it; it edits the rule-echo registry this bundle owns and the very §6 that 768 cut, so it is worked after that landing rather than beside it; 827 is the firewall drift measured 22.08.2026 — the container boots an image copy of the script whose repository twin is never executed, so it edits the devcontainer boot path and the additive top-up this bundle already owns, and it stands behind the release because the machine filed it out of a drained finding; 826 is the anchoring half of the same gate — the coverage 820 introduced is measured against the reviewed sha instead of the head being ticked, so a file added after the last review is never even asked about; it edits the very criticality-review core 820 rewrote and 825 rewrites next, so it is worked WITH 825 and never beside it; 825 is the same gate from the other side — its refusal text offers a findings-filed receipt that no command writes, so it edits the very criticality-review core 820 rewrites and is worked WITH 820, never beside it; 824 is the killed authoring run of 21.08.2026 whose uncommitted remains nothing drains and whose declaration keeps reporting it alive off a surviving wrapper process — it edits the in-flight declaration path 813 and 814 own and the authoring-start path 753, 780 and 796 touch, so it is not worked beside those; 823 is the parallel-session detector counting the predecessor that has just handed over, so a phantom pauses the whole batch — it edits the singleton classifier that 434, 556 and 795 also own and reads the launcher start decision 811 touches, so it is not worked beside them; 822 is the board defect of the same evening — a now-card that names only its mechanism and outlives the tick of its own point — so it edits the board card composer and the landing sequence that 434, 787 and 814 also own, and is not worked beside them; 821 is the main-write fence judging the session instead of the resolved target path, so an unlocked session cannot write its own scratchpad — it edits the same fence path 795 and 813 touch and is worked before anything that relies on a stand-down session recording work; 820 is the gate defect measured while landing 769 — the criticality gate rejects the scoped 1/1 review record `review-sol` normally produces, so every HIGH point blocks at its session's turn exit — so it edits the criticality-review core this bundle already owns and reads the review planner 783, 784 and 804 touch, and it is not worked beside those; the one-line floor fix was already implemented, reviewed and refused, and that refusal is written into its text; 819 is the invariant left over after the front-block clearance the user ordered on 21.08.2026 — it edits the very ranking core 789 built and the work order both of them write, so it is worked after 789's rule rather than beside it; 818 is the seven-defect answer of the same commissioned reading — the standstill report blanking or mislabelling the time it measures — so it edits the classifier and its inputs that 809 built and 815 also reads, and is worked after 817 and never beside 815; 817 is the append-path defect that the cross-vendor reading commissioned by 816 turned up — the activity journal can hand out a fenced sequence twice and weld two records into one line — so it edits the very journal core 809 built and 815 reads, and is worked strictly after 816 and never beside 815; 816 is the review debt that 809's landing left behind — a HIGH point ticked without a recorded verdict on its merged, mixed-authorship range — so it reads the very branch 809 produced and stands in front of the release because the criticality gate refuses every turn end until it is settled; 815 is the second finding of 21.08.2026's cross-vendor review of 809 — the standstill classifier's quadratic read path and the journal's missing retention — so it edits the very core 809 builds and is worked strictly after it, never beside it; 814 is the drained finding of 21.08.2026 — the boundary's dictated handover card claims nothing is running while it has just reported transferable delegated work — so it edits the boundary card composer that 790 and 800 also own and is not worked beside them; 811, 812 and 813 are the three proven levers cut out of 809’s merged spec — the handover that travels only by scheduler tick, the writer that vetoes by merely existing, and the CI wait that dies with its turn — so they edit the launcher start decision, the ownership fence and the CI-guard core that 809 only measures, and they are worked strictly after 809 and in that order; 810 is the unverified half of 809's four-eyes sweep — sixteen candidate defects in the CI guard and the launcher that the merge deliberately scoped out, so it edits the same two cores 809 rewrites and is worked strictly after it; 809 is the user's ranking decision of 21.08.2026 and stands at the very front of the queue — the batch's own standstill has never been measured, so it reads the gaps on main and classifies them before it removes any of them; it edits the launcher's start decision that 795 also touches and the wait path 744 and 752 measure, so it is worked before them and never beside them, and the stage-2c request of the folded point 808 is carried by 813; 807 is the branch nobody points at — pushed work for an open point that the brief and the commissioning step never mention, so it edits the point-brief and commission-guard paths this bundle already owns and is worked with 708, which builds the commissioning command it belongs in; 806 sharpens the repair-loop reading point 772 just landed — it edits the same detector and is worked after it, never beside it; 805 is the same push gate refusing for a second, unrelated reason — the integrity teardown reading a delegated author's own branch commit as repository damage — so it edits the gate path 803 owns and the fixture/integrity path 801 owns, and is worked with 803 rather than beside it; 804 is the gap the review of 784 left open — a merge loses its attribution as soon as its parent leaves the analysed set, and the `--since` narrowing the refusal advises is what causes it — so it edits the same review-planner core 783 and 784 own and is not worked beside them; 803 is the push gate running the full unit layer while a delegated author holds the same machine — it edits the git-hook path 801 also owns and it is measured against the delegated-authoring lanes 753 and 780 touch, so it is not worked beside those; 802 is the stale user-confirmation wording point 794's review found one file over — it edits the same doc-budget module 762 owns, so it is worked with 762 or after it, never beside it; 801 is the unit suite writing into the live repository — it moved main, set core.bare and left fixture branches behind, so it edits the test fixtures and the git-hook path this bundle already owns and is worked before anything that pushes; 798 is the same class as 796 one step earlier — a report that turns a finished delivery into a non-delivery, so the two are read together and it is not worked beside 796; 797 is the other half of 785 — the header figure is never refreshed during a turn, so it shares that path and is read beside it; 795 and 796 are the two findings of the 20.08.2026 night — the launcher that read a lock file as proof of life and started a second writer on main, and the authoring run that reported nothing authored over 118 finished lines — 795 edits the launcher and the ownership fence this bundle already holds, and 796 the authoring path 753 and 780 also touch, so neither is worked beside those; 738–748, 750–752 and 756–759 are the context-ceiling programme of 19./20.08.2026 — they share the fence, the watermark core and the boundary, so they are not worked in parallel; 757 cut the per-turn start floor the others measure against and 761 owes its measured proof, and 758 holds the fence in observation until it has; 762 is what 761's ceiling confirmation turned up and edits the same doc-budget module, so it does not run beside 761; 763 executes the three document cuts the user released that 757 could not take with it; 764 is the same cut's method failing — a rule deleted as guard-covered that no guard covered — and 765 the carrier defect that hid the ruling behind it, so both are read beside 763; 753 is the authoring-routing half of the same session economics; 771–775 are the findings of the 20.08.2026 morning — the claim guard narrowed until it caught nothing, an owner that repaired its own mechanism instead of handing over, a test red in every worktree, the status path that refuses the owner its own reading, and the owed answer to the commit-time registration review — and they name this bundle in their own text; 780 is the same morning's lane defect, found while commissioning 775 — the commission ledger cannot be written from an isolation worktree, which is where every delegated author works — so it is read beside 775 and touches the authoring path 753 also edits; 781 is the duplicated main-checkout helper that 773's fix must choose between, so it is settled before or with 773; 790 and 791 are the two findings of the 20.08.2026 evening — the dictated handover card naming a session id that died with a `/clear`, and the closing waiver that has to be typed thirteen times and once has to sound like a run — both edit the boundary and closing paths this bundle already holds, so they are read beside 787; 789 is the ranking rule for a point the MACHINE files — it extends the append gate of 590 and reads the release anchor the board queue owns, so it is not worked beside 787, which edits the same board path; 785 is the truth of the chat header's context reading, which shares the header path 764 enforces and is therefore read beside it; 787 is the contradiction between the boundary's dictated handover card and the board's publish gate, found at 782's own boundary — it edits the boundary and board paths 772 and 434 also touch, so it is not worked beside them; 786 is the same session's measurement defect one level up — a tick that hides whether a point was delivered or folded — and it reads the archive that 783 and 784 plan reviews over, so it is not worked beside them; 784 is the blockage 783 measured but deliberately did not widen itself to remove — it edits the same review-planner files, so it is not worked beside 783 and it is ranked early because every landing adds another trailer-less merge to the plan it refuses; 646 is the doctor-side twin of 629 — the same deletion reached by a different route; 649 holds the holes the fifth review found in 629's own lock protocol; 553 is 373's measured successor lever; 556 is the lease half of the same singleton family) — the rest landed 30.07.2026 (329, 396, 399, 409, 426, 427, 429, 431, 433, 458) and 08.08.2026 (373) |
| **Modell & Wächter** | J | Model and guard chain | 309, 355, 397, 425, 437, 438, 457, 468, 534, 535, 536, 537, 538, 540, 560, 561, 613, 630, 631, 632, 634, 638, 639, 640, 726, 495, 497, 542, 559, 596, 598, 599, 609, 650, 652, 669, 677, 678, 693, 715, 718, 722, 729, 735, 736, 737, 778, 788, 792 (792 is the switch of 788 judging the past — it edits the same guard core, so it is not worked beside anything else that touches it; 788 is the switch the user ordered on 20.08.2026 — one place decides whether Fable is used at all, and it edits the author routing, the model guard and the merge recorder that 778 answers the review of, so the two are not worked beside each other; 534–538 are the audit findings of point 297 — worked BEFORE the rest of the bundle, because they decide what the four-eyes gate and the review schedule see at all) |
| **Testinfrastruktur** | K | Test and verification infrastructure | 295, 330, 387, 418, 455, 456, 460, 464, 466, 532, 549, 557, 563, 564, 566, 567, 568, 569, 570, 571, 572, 573, 574, 641, 642, 647, 498, 506, 507, 510, 514, 518, 521, 552, 558, 595, 597, 615, 620, 622, 626, 627, 643, 668, 670, 695, 776, 829 (829 is the calibration suite that measures the repository it runs in — it reddened main on 22.08.2026 in a two-commit CI checkout that has no merge parents, and it edits the very suite 730 built, so it is worked after that and never beside it; 564/566/567 all came out of the point-342 verification: what a red is believed to mean, what a repair costs, and what a killed session leaves running) |
| **Dokumentation** | L | Docs and knowledge transfer | 303, 333, 422, 555, 645, 511, 512, 531, 607, 619, 794 (794 is the user's ruling of 20.08.2026 on the beginner guide's size budget — it edits the guide and its brevity ceilings, so it is not worked beside anything else that touches that document) — the rest landed 30.07.2026 (459) |
| **Steuerung & Performance** | M | Controls and performance | 310, 342, 347, 551, 618 |
| **Urlaubsfestigkeit** | N | Unattended operation for a fortnight — recovery from a failure at ANY moment, quota waiting, the boot path, the readiness check and the chaos drill that proves it | 442, 443, 444, 445, 446, 447, 448, 449, 450, 533, 562, 612, 504, 515, 517, 528, 616, 617, 658, 663, 716, 719, 760 |
| **Kommunikation** | O | The communication PoC: the tonal language, who speaks it, where it is spoken, what the player may write down | 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 519, 659 (480 IS point 351 and 488 IS point 352, pulled forward — they close together); and the PLAY-SESSION findings of 09.08.2026: 587, 577, 586, 580, 582, 588, 576, 585, 584, 579, and of 10.08.2026: 605 |

Point **809** now supplies the Session- & Repo-Hygiene bundle's shared measurement
layer: one append-only journal and one lock-free report classify new wall time
before 811, 812, and 813 change the handover tick, writer veto, and CI wait. Its
first 14-day run leaves the pre-journal past unknown instead of attributing work
from commit gaps; the reproduced 21.08 incident measures 52 m 34 s of writer veto
and 6 m 02 s of scheduler transition without double-counting the CI trigger.

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
- **174** — the release tag, gated on a full closing run rather than on a branch (224 stood here until the user withdrew it on 20.08.2026).
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
