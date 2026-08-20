# TASKS — sequential feature batch

The OPEN work order. A ticked point moves, verbatim and with its number, into
`docs/tasks-archive.md`; `tasks-archive-guard` blocks a tick left behind here.
States are `[ ]` open and `[x]` done — nothing in between.

**Where the rules live.** The build, the test tiers, the branch/merge workflow
and the closing cycle are in CLAUDE.md (§5, §6, §7.2, §9), not here. The WORKING
ORDER is the dashboard's Warteschlange, held by `queue-order-guard`; ordering prose
here went stale describing finished points, and a second place for one fact is
the drift this project keeps paying for.

This file and every entry in it are written in English. Point titles use sentence case rather than full uppercase;
acronyms and individual emphasised words may stay capitalised. Commit messages never reference the point number.

**A point may state its acceptance condition machine-readably**, because prose
alone let a point be ticked for feeling finished. A body line beginning `PROOF:`
names a command; the tick is refused until it has run at the CURRENT HEAD
(`node scripts/point-proof-guard.mjs --ran <N> --evidence "<result>"`; `--status`
lists what is outstanding). Opt-in, EVERY such line demanded, and one inside a
code span or quotes — as here — is prose, not a demand.

## Regression command

```sh
npm run test:unit   # fast layer (jsdom) — always
npm run test:small  # + the everyday browser gate
npm test            # LARGE: build → lint → vitest → every suite → preview
```

Per point: build + lint + audit + the whole Vitest layer, plus the browser suites
the diff touches. LARGE is mandatory on a scene core (TravelScene/Wildlife/
PlaceScene, the renderer/post pipeline, store.ts), at every ~4th point as a
collective gate, before every closing, and whenever a flake retry failed twice.

Diff → browser-suite mapping: `src/i18n/` → i18n · store/systems logic → Vitest
only (flow if the core loop is touched) · `src/scenes/place/` → collision,
polish, settings · `src/scenes/travel/` → enrichments, events, health ·
`src/render/` → settings, enrichments, polish · `src/ui/` → i18n, enrichments,
settings, flow · journal/TTS → voice, handwriting · `src/world/` → world,
enrichments · `scripts/verify/X.mjs` → X itself · `*.md` → docs. When unsure,
include the suite.

Flake policy: if exactly ONE suite fails on a check from this list — its only
home — rerun that suite standalone once; green counts and is noted in the tick,
red twice is a real investigation. The list: the movement 0.00 m read, the bathe
probability, TTS timing, the calf-sacrifice behaviour window, frame-starved
screenshot probes, the spawn body-spacing settle window. WATCHDOG: if this
scoping ever lets through a bug a full run would have caught, report it to the
user at once and the policy is reconsidered.

**Every point adds a test on the appropriate layer** — Vitest for anything
assertable without a browser, a browser suite only for the
scene/RAF/geometry/CSS/audio/screenshot cases (`scripts/verify/README.md`).

On failure after correction attempts: STOP, report, do not build on a broken base.
Tests are never weakened; a red run is fixed in the production code.

**Where doc updates go (user 26.07.2026):** CLAUDE.md §7.1 states WHAT must hold,
`docs/acceptance-evidence.md` proves it under the same number. A changed or added
behaviour updates BOTH in one commit; a point that only adds a test touches the
evidence alone. Older specs saying "CLAUDE.md §7.1" mean both halves.

## Work packages (bundles)

Open points are worked in BUNDLES: one branch, one verification, one regression
round, a commit per member point. `docs/work-packages.md` is the table — which
point sits where, what stays unbundled, in what order. Every open point appears
there exactly once; a new point joins a bundle when appended.

## Checklist

THE ORDER OF THIS RELEASE (user 12.08.2026, stated repeatedly and forgotten as often):
everything that touches the COMMUNICATION MECHANIC comes FIRST — the mechanic itself, the
proof text that signs it off, and the bugs that keep the user from ever reaching it in play —
then point 633 (the closing run), then point 174 (the tag). A newly appended point of that
kind is MOVED to the front in the same turn that files it; leaving it where append-and-defer
put it is the mistake this line exists to stop.
- [ ] 757. Cut the per-turn document floor: CLAUDE.md, MEMORY.md and the global CLAUDE.md
  (user 20.08.2026, queue FIRST). MEASURED 20.08.2026 from a session's own transcript: the
  FIRST response of a freshly cleared session already stood at 61,372 tokens, before a single
  tool call. Of that, ~19k are our own documents — CLAUDE.md 46,796 B (~12k tokens), MEMORY.md
  16,801 B (~4.3k), the global CLAUDE.md 5,093 B (~1.3k), the SessionStart hook ~1.4k — while
  the remaining ~42k are the harness system prompt and the tool schemas, which we do not
  control. That floor is what strands the batch: four sessions in a row stood at 85,225 /
  83,079 / 86,416 tokens before their first own work, against a trigger of 82,000, and had to
  hand over without beginning a point. Raising the trigger to 110,000 treats one end of that
  arithmetic; this point treats the other, and only this one gives the working window back
  rather than moving it. It is also the cheapest recurring saving in the project: the floor is
  paid by EVERY turn of EVERY session AND by every delegated subagent, which inherits the same
  documents. Realistic yield 4-6k of the ~19k, so a floor near 55-57k. That does not change the
  order of magnitude — the ~42k harness share dominates — and the point must not claim
  otherwise.
  FINAL STATE:
  - THE ANALYSIS RUNS BLIND PARALLEL, THE MERGE GOES TO THE THIRD MODEL (user 20.08.2026).
    Opus 5 and GPT-5.6 Sol each produce a COMPLETE cut list from the same inputs, neither
    seeing the other's until both are done; FABLE 5, which wrote neither, merges them, COUNTED
    through `scripts/blind-merge.mjs` — every entry carries an id and the union accounts for
    each as `only A`, `only B` or `merged with <id>` — and `mechanism-review.mjs --merged-by`
    records the merger. This deliberately spends the scarcest pool: with three models available
    the merge rule demands one that authored neither list, and Fable is the only legal merger.
    Naming that here is the justification the Fable lane requires.
  - THE EXECUTION IS PART OF THIS POINT, not a successor (the lesson of point 614). The point
    is not done when the verdict exists; it is done when the documents HOLD the cut and the
    measured floor has fallen.
  - THREE CUTTING AXES, each stated as the criterion the cut is judged by:
    a. A RULE WITH A GUARD GETS A POINTER, NOT A PARAGRAPH. 39 guards are wired in
       `.claude/settings.json` (28 Stop, 11 PreToolUse; measured 20.08.2026), and nearly
       everything §6 and §7.2 explain in prose is enforced by one of them — the board (5
       guards), the TASKS split, spec form, queue order, bundles, model policy, picture
       verification, mechanism review, CI, the doc ceilings, the context fence, findings, the
       closing, timestamps, branch hygiene. The guard is the authority; the prose is a second
       copy paid for every turn. STAGGERED BY FIRING TIME, never flat: a PreToolUse guard
       refuses BEFORE the action, so its rule is safe as a pointer; a Stop-chain rule fires at
       the turn END, and a session can violate it for a whole turn first — that costs the turn,
       so those keep the text that prevents the violation, and each such decision names the
       guard that covers it.
    b. ROLE-SPECIFIC CONTENT LEAVES THE ALWAYS-LOADED FILE. The batch-operation machinery —
       boundary, lease, claim, launcher, chat-watcher, in-flight adoption — binds ONLY the
       batch owner, yet is inherited in full by every delegated subagent that never touches it.
       It moves into a document the SessionStart hook serves to the OWNER, the way
       `point-brief.mjs` already serves TASKS.md and design.md instead of shipping them whole.
    c. THE WHY-HISTORY MOVES, THE RULE STAYS — the grip point 555 used on §7.1. Measurements,
       dates and incident narratives ("42 of 60 first-parent commits", "31 of 36 remote
       branches", "87-94 % of the spend") are needed when a rule is DISPUTED, not on every
       turn; they go to a read-on-demand document and the binding sentence stays.
  - NOTHING LEAVES WITHOUT AN ACCOUNT. Every rule cut from CLAUDE.md is accounted for the way
    blind-merge accounts for findings: MOVED to a named destination, COVERED by a named guard,
    or DROPPED on the user's explicit ruling. The account is written down and is what the
    cross-vendor review reads — a rule that vanishes silently is a rule nobody enforces.
  - MEMORY.md RETURNS TO ITS OWN RULE, "one line per entry: the hook only". Measured
    20.08.2026: 88 entries in 16,801 B, ~191 B per entry, longest 854 B. Entries marked DEAD /
    ENDED / CORRECTED / DEAD IN PRACTICE are deleted, and entries that only restate a rule
    CLAUDE.md already binds are dropped rather than paid for twice on every turn.
  - THE GLOBAL CLAUDE.md IS CUT LIKE THE REST (user 20.08.2026: »Ich habe keine anderen
    Projekte. Mache alles so, wie es für dieses am besten passt«). The cross-project caveat is
    void — this repository is its only reader — so it is optimised for THIS project without a
    second ruling. Its content is triaged once: what the project's own CLAUDE.md already says
    more precisely (test layers, commit hygiene, model diversity, the progress board) is
    DELETED rather than paid for twice on every turn; what is genuinely user-level and not in
    the project file MOVES INTO the project file at its right section; what neither binds nor
    informs goes. The account above covers these rules too. SAME FOR MEMORY.md, which lives at
    the same user level: it is optimised for this project alone, since no other reader exists.
  - THE CEILINGS FALL WITH THE CUT. `scripts/doc-budget-core.mjs` lowers `maxLines`/`maxWords`
    for every cut file to what the cut achieved, with the reason written there. Left at the old
    figures the cut simply refills — that file's own history records exactly this happening
    after point 555.
  VERIFIABLE: the floor is MEASURED, not counted in lines. The FIRST response of a freshly
  cleared session is read from its transcript before and after the cut (`input_tokens +
  cache_read + cache_creation`), and both figures are recorded beside the target.
  `doc-budget-guard` is green at the lowered ceilings, and a Vitest case fails when a rule
  named in the account has no destination.
  CONSTRAINTS: no new runtime dependency — this is documents, budgets and one hook path; the
  cut must not touch design.md's content authority (§1: design.md is the sole source of the
  target state); the model policy of §6 governs the authoring lane, and the roles named above
  (Opus 5 and Sol blind, Fable merging) are the user's explicit instruction of 20.08.2026,
  which overrides the ordinary Fable-is-the-escalation rule for the MERGE role only.
  Criticality: high — binding documents are being cut, which is why the analysis is
  blind-parallel, the merge goes to a third model and the review is cross-vendor.
  Bundle: Session- & Repo-Hygiene.

- [ ] 614. Re-run the four-eyes work-order cleanup FROM SCRATCH, and execute it in the same
  point (user 19.08.2026: »Dann schmeiße die Ergebnisse von 614 weg und fange nochmal komplett
  neu mit der Analyse mit Vier Augen an. Setze die dieses Mal auch direkt vollständig um.«).
  WHY FROM SCRATCH RATHER THAN EXECUTING WHAT WAS FOUND: the 10.08.2026 verdict was never
  executed, and a stocktaking spoils while the stock moves. MEASURED 19.08.2026: of its 42
  named points 35 are still open, but two of its seven merges are dead (569+606 → 573 and
  608 → 590 all landed), one contradiction may have been decided one-sidedly when 612 landed,
  and 77 of today's 208 open points — 37 % — were appended after it and were never analysed.
  The cost driver is READING the work order (690 KB), which a delta run over the 77 new points
  pays almost in full, so a fresh run costs little more and leaves no item needing a
  "does this still hold?" pass. The old verdict is NOT deleted from history — it stands in
  this file's git history — but it is NOT an input: a model handed a finished list checks that
  list instead of seeing afresh (CLAUDE.md §6, the anchoring reason blind-parallel exists).
  FINAL STATE:
  - THE ANALYSIS IS RUN BLIND PARALLEL over the CURRENT open set, by two models that do not
    see each other's result and do not see the 10.08. verdict. Same input, each a complete
    result of its own: duplicates to merge, specs no longer valid as written, contradictions
    between points, and points whose work is already delivered.
  - THE MERGE GOES TO A THIRD MODEL that wrote neither list and is COUNTED through
    `scripts/blind-merge.mjs`: every entry carries an id and the union accounts for each as
    `only A`, `only B` or `merged with <id>`. `mechanism-review.mjs --merged-by` records who
    merged and refuses either author.
  - THE OLD VERDICT IS RECONCILED AFTERWARDS, NEVER BEFORE. Once the new union stands, the
    10.08. verdict is compared against it and every item the new run did NOT find is listed
    with a verdict: still true (then it is a MISS of the new run and is carried), or overtaken.
    The miss count is reported — it measures the analysis itself.
  - THE EXECUTION IS PART OF THIS POINT, not a successor. The point is not done when the
    verdict exists; it is done when `TASKS.md` and `docs/work-packages.md` HOLD it: every merge
    performed with the survivor carrying the merged point's unique clauses, every invalid spec
    re-cut to what remains, every contradiction resolved by one owner, every delivered point
    ticked and archived. Nothing is deleted without its content landing somewhere.
  - `docs/work-packages.md` IS RECONCILED IN THE SAME PASS. Measured 19.08.2026:
    `bundle-first-guard --status` reports 108 open points in no bundle, against the 52 the
    10.08. reading found and the 29 the document's own text claims, and its newest bundle rows
    stop around 726. Back-fill the missing points AND either restore the "every open point
    appears exactly once" rule or withdraw it in CLAUDE.md, so the paragraph and the table
    agree.
  - THE RUN NAMES ITS OWN WINDOW so the next reader knows what it covered: the open-point count
    and the HEAD it was cut from, recorded with the verdict.
  VERIFIABLE: the counted union exists with a named merger who authored neither list; the
  reconciliation against the 10.08. verdict is recorded with its miss count; after the pass
  every merged point is gone from `TASKS.md` with its unique clauses present in the survivor;
  `tasks-archive-guard`, `queue-order-guard` and `bundle-first-guard --status` are clean; and
  the open count drops by the number of merges and ticks made.
  A FOLD ALSO NEEDS A WAY ONTO THE BOARD (measured 13.08.2026): a point filed and folded within
  the hour can be ticked and archived, but NO board command can give it the Erledigt card the
  dashboard audit then demands — `done` needs a now-card, `promote` needs a queue card, and the
  queue is derived from the OPEN work order the point has just left. The only way out was
  `--waive-audit`, which bypasses the audit rather than satisfying it. This point is where the
  folds happen, so it carries the fold's own board path: one command that ticks, archives and
  writes the Erledigt card naming the point the content went to.
  A CAP PER POINT FALLS OUT OF THIS CUT. Measured 20.08.2026: TASKS.md holds 223 open points
  in 745,837 B, ~3,340 B per point on average, while the largest stand far above it — 184 with
  22,754 B, 203 with 15,811, 692 with 15,379, 687 with 13,165, 200 with 12,420. `point-brief.mjs`
  pays that spec IN FULL at EVERY delegation; 22,754 B are ~5,800 tokens for a single point.
  `scripts/doc-budget-core.mjs` so far budgets TASKS.md deliberately in the PREAMBLE only,
  because a line limit on the whole file would punish appending — a cap per POINT does not have
  that side effect and hits exactly the swollen umbrella points. The cap is MEASURED FROM THE
  RESULT of this cut and not set beforehand, the same mechanism with which doc-budget-core
  lowered the CLAUDE.md ceiling to the size reached after point 555; a point that genuinely
  needs more raises it with a written reason, a longer retelling of the same does not. NOT TO
  BE CHANGED: the archive `docs/tasks-archive.md` stays unbudgeted — reference, read only on
  demand, costing nothing per turn. VERIFIABLE: `doc-budget-guard` green at the measured cap,
  plus a Vitest case that goes red on a point above it.
  QUEUE RANK 2, directly behind point 757 (user 20.08.2026): 223 open points with duplicates
  make every brief generation and every queue reading more expensive, and 614 is the only point
  that cuts that set.
  Criticality: high — it rewrites the work order itself, several points at once, and a merge
  that drops a clause loses work no test would miss. The blind-parallel find, the third-model
  merge and the counted union are the assurance; the execution is checked point by point
  against the union before anything is deleted.
  Bundle: Session- & Repo-Hygiene.

- [ ] 744. Leaving is the most expensive step of a session, and nobody has measured it
  (19.08.2026). Every token spent on the handover is a token subtracted from the working
  window: the trigger of point 743 is literally the ceiling minus the cost of leaving, so this
  cost sets how much work a session can do at all. Measured once, badly: 27,336 tokens between
  the fence's first refusal and the committed boundary — and that measurement is CONTAMINATED,
  because two gates contradicted each other inside it. `batch-boundary.mjs --prepare --context`
  prints the handover card and demands it VERBATIM ("… und sie nimmt den nächsten Punkt der
  Warteschlange auf"), while `board.mjs none` refuses exactly that text because the unnumbered
  card must NAME the point the batch picks up next; on top of that, `none` refuses while any
  now-card still stands, so the point must be sent back to the queue first — three steps the
  template does not name, at the most expensive moment of the session.
  FINAL STATE: the template produces a text that ALREADY names the point the successor picks
  up and ALREADY names sending the now-card back as its first step, so the printed sequence
  passes both gates as printed; and the boundary is then measured across three clean
  handovers, the result recorded beside `CONTEXT_TRIGGER_TOKENS`: the clean figure REPLACES the
  contaminated 27,336 in that constant's arithmetic comment, and the trigger is recomputed from
  it. (Point 743 split the former `CONTEXT_WATERMARK_TOKENS` into `CONTEXT_CEILING_TOKENS` and
  `CONTEXT_TRIGGER_TOKENS`; the old name exists nowhere in the code any more.)
  THIS IS A FUNCTIONAL CHANGE, not bookkeeping (GPT-5.6 Sol, audit 19.08.2026): it must not be
  filed under "measurement only", and the measurement is worthless until it lands, because the
  contradiction is inside every reading taken before it.
  THE HANDOVER GETS A MECHANICAL CAP, not only a measurement (GPT-5.6 Sol, review 19.08.2026:
  three readings and their spread still establish no maximum, and point 745 reserves a number
  it can only trust if something enforces it). The boundary path's own inputs and outputs pass
  point 597's budget like everything else, and the cap is the constant point 745 reserves from
  the session's first call onward. An overrun is not silently swallowed: the boundary still
  COMPLETES — the handover is the one path that must never fail — but records that it exceeded
  its cap, so the reserve is corrected from evidence rather than from hope.
  THE GAP CARD MAY NAME THE BATCH'S NEXT POINT, and that is the FIRST part of this point, not
  a detail of it (GPT-5.6 Sol, audit 19.08.2026, finding A10; verified against the source in
  the same session). The two sanctioned mechanisms are made consistent in ONE change, and the
  GUARD is the side that gives: `dashboard-card-topic-guard` learns exactly one exception —
  the boundary gap card written by `board.mjs done <n> --none` and `board.mjs none` MAY name
  the point the batch takes up next, because that point is the batch's own DESTINATION, not a
  foreign reference. The comment at `scripts/batch-boundary-core.mjs:874-882` ("IT NAMES NO
  POINT NUMBER (point 439)") is rewritten in the SAME commit to carry the new rule and why
  439's reason no longer holds, so the next reader is not sent back into the resolved
  contradiction.
  THE EXCEPTION IS NARROW, or it becomes the hole the topic guard was built against: it holds
  for the gap card alone, and inside it for the ONE number that is the batch's next point. A
  second point number in that card, and any foreign point number in any other card, still
  block as before.
  THE ALTERNATIVE IS NAMED AND REJECTED so it is not re-litigated: leaving the card numberless
  and letting the successor derive its point from the queue keeps the guard untouched but
  defeats this point's purpose — the printed sequence would again need interpretation at the
  most expensive moment of the session, which is the cost this point was written to remove.
  VERIFIABLE: a Vitest case driving the printed template through the board gate's own
  validator and asserting it is accepted unchanged; a case asserting the template names both
  the point and the queue-return step; a case where the same gap card names a SECOND point
  number and is still refused; a case where a normal (non-gap) card naming a foreign point
  still blocks; a case that the rewritten source comment and the guard agree, so the two
  cannot drift apart again; a case proving the boundary completes even when it
  overruns its cap AND that the overrun is recorded; and the three recorded handover
  measurements with their spread, not only their mean.
  Criticality: high — it sits on the handover path, the one path that must never fail, and its
  failure mode is the measured one: a session that can neither hand over nor stop; every
  change here is fail-open or it is wrong.
  Bundle: Session- & Repo-Hygiene.

- [ ] 597. Large tool output never enters the context whole (point 572's measure 7). The
  bound `scripts/verify/run-logged.mjs` already applies to verify runs extends to the other
  big producers: `git diff` (`--stat` first), `grep` (`-c` or a head bound), file reads
  (`offset`/`limit` instead of a whole file), `npm ls`, `gh run view`.
  IT IS ENFORCED, NOT PRACTISED (user 19.08.2026, on GPT-5.6 Sol's audit of the
  context-ceiling programme). A rule that is followed cannot bound an input-dependent output:
  the same 40,000-token jump the ceiling must survive comes back the moment one call is made
  the way it always was. So every tool output passes a BUDGET with spill-to-log, and what
  stands in the context is what fits, never what the producer chose to print.
  THE INTERCEPTION POINT IS NAMED, or this stays a rule wearing a mechanism's clothes
  (GPT-5.6 Sol, review 19.08.2026: naming `run-logged.mjs` leaves a direct `git diff`, `grep`,
  file read, `npm ls` or `gh run view` entirely unbudgeted, and those are exactly the calls
  the point lists). The budget therefore sits in the PreToolUse chain, where every tool call
  passes whether or not it went through a project script, and the point names that hook and
  its file. A producer that bypasses it is a defect the tests must catch, not a caller's
  discipline.
  THE ON-DEMAND PATH IS NAMED, not reinvented: `node scripts/verify/run-logged.mjs --show
  <log>` already hands back the run when the digest is not enough, but it is narrowed to
  SELECTIVE, line-bounded or paginated queries — a full `--show` reloads the very 40,000
  tokens the budget just prevented and would make the overview call a net loss. What must
  NOT be adopted is the tempting inverse either: a runner that returns only the names of
  failing suites by default.
  THE ERROR CHANNEL IS BOUNDED TOO, AND THESE FOUR CONDITIONS ARE HOW. An unbounded channel
  defeats any ceiling, but a truncated cause forces a re-run, and one browser-suite re-run
  costs a multiple of what the cut saved — the house rule "a red closes by a CAUSE, never by
  a later green" exists because that already hurt. Each condition is binding:
  1. ERRORS HAVE THEIR OWN, GENEROUS BUDGET, separate from the ordinary output budget and a
     multiple of it. It exists to catch the outlier, not to discipline the normal case.
     MEASURED 19.08.2026 over the 124 log files under `local/`: median 3,197 characters,
     p95 36,118, max 158,017 — the typical output is tiny and the top 5 % is the whole
     problem, so a generous budget almost never binds. The number itself is set from the same
     measurement taken over ERROR outputs specifically, not over all logs.
  2. REPETITION IS CUT, CONTENT IS NOT. A large error output is almost never one long cause;
     it is one cause repeated — identical stacks across twenty cases, a diff per assertion, a
     retry printing everything three times. Collapsing by SIGNATURE removes most of the volume
     and loses no distinguishable cause. This cut runs FIRST, and often it is the only one
     needed.
  3. THE FIRST DISTINCT CAUSE IS NEVER CUT SHORT OF ITS OWN HARD MAXIMUM. It enters the
     context whole up to a cap that is generous by the p95 measurement above and far larger
     than any real assertion-plus-stack, and beyond that cap it spills to log with condition 4's
     notice. "Never cut" without a maximum is the one hole through which a single output can
     still exceed the ceiling (GPT-5.6 Sol, review 19.08.2026), and the maximum is what makes
     the channel bounded while still fitting every cause anyone has actually needed to read.
     Further occurrences of the same signature collapse to a count; further DISTINCT causes get
     a bounded excerpt with a pointer to the full text.
  4. CUT FROM THE MIDDLE, NEVER THE HEAD OR THE TAIL, and never silently. The assertion and
     the stack top are at the head, the summary at the tail — a naive head bound loses the
     summary and a tail bound loses the assertion. Every cut states in the context how much
     was omitted and how to fetch it.
  So the rule is: error output is never cut SILENTLY, never cut BEFORE its first distinct
  cause, and never cut at HEAD or TAIL — and every failing test keeps its name.
  THE POINT SPLITS AT ITS DEPENDENCY, and the ceiling-relevant half is what stands at the front
  of the queue (GPT-5.6 Sol, review 19.08.2026). The OUTPUT BUDGET and the error channel above
  depend on nothing and are what points 743 and 745 consume, so they are built first. The
  standing-load paragraph below is CONDITIONAL on point 599's cache reading, and 599 stands far
  back in the work order — that half waits for it and does not hold up the budget.
  MEASURED TARGET: a 10k output entering a point's context at response 20 is re-read by
  its remaining ~218 responses at 218k weighted, ten responses' worth; the trade pays up
  to a follow-up-query rate of ~85 %.
  THE STANDING LOAD IS THE SAME ARITHMETIC ON A LARGER SCALE: 1k of permanently carried
  text costs 3.27 M per window, so CLAUDE.md alone (~11.4k tokens) is ~4.2 % of it, and
  per-turn injected text that CHANGES additionally breaks the cache prefix. So: a hook that
  succeeded says nothing, and the per-turn injections are audited. CONDITIONAL on point
  599's cache reading, and it cuts TEXT only — never a duty that is enforced rather than
  remembered.
  VERIFIABLE (the error channel): a Vitest case per condition — a twenty-fold repeated stack
  collapsing to one cause plus a count; a first distinct cause surviving whole against a budget
  far below its size; a first distinct cause LARGER than its own hard maximum, spilling to log
  with its notice; a second distinct cause surviving as a bounded excerpt WITH its pointer;
  a middle cut that keeps both the head assertion and the tail summary; and a case asserting no
  cut is ever written without its omission notice.
  VERIFIABLE (the interception): a case per named producer — a direct `git diff`, `grep`, file
  read, `npm ls` and `gh run view` — proving each is budgeted without having been routed
  through a project script, and one asserting that NO admitted output, error output included,
  can exceed the per-call maximum. That is the case which proves a bound rather than a habit.
  Criticality: medium — the real risk is cutting an error message, which the four conditions
  bound rather than exclude, and the budget now denies output instead of advising against it.
  NOT ON ITS BRANCH 17.08.2026: `feat/595-598-verification-ladder-brief` is named for this point
  but contains NOTHING of it — measured by reading the whole net diff. It must be built, here or
  on its own branch; the shared branch lands 595 and 598 alone.

- [ ] 745. One remaining-budget function, asked before the call rather than after it (user
  19.08.2026: "'Passt das, was ich jetzt anfange, überhaupt noch unter die Decke' klingt nach
  der richtigen Frage, anstatt an einem willkürlichen Punkt zuzumachen"). The fence
  (`scripts/context-fence-core.mjs`) asks BACKWARDS — "is the measurement already past the
  mark?" — so the growth that pushed it there has already been paid when it answers. It
  already classifies exactly the expensive kinds of call (agent spawn, browser suite,
  delegated ask, authoring, a direct verify call); what it does not do is ask whether THIS
  call still fits.
  FINAL STATE: one function answers every admission question from the same numbers — ceiling,
  current reading, the type cost of this call from point 742's series, the cost of leaving
  from point 744 — and the fence refuses when the remainder cannot hold the call plus the
  handover. The separately derived global trigger of point 743 is SUBSUMED by it and removed
  in the same commit rather than kept beside it: two estimates of the same quantity can
  disagree, and then the stricter one is doing nothing while the looser one decides
  (GPT-5.6 Sol, audit 19.08.2026). What remains beside the function is the ceiling and one
  conservative emergency brake.
  THE READING LAGS BY ONE TURN, and the function must carry that: `parseContextTokens` sums
  the input and cache tokens of the LAST api event, so it contains neither the current
  assistant output and its tool arguments nor the tool result about to arrive (verified in the
  code 19.08.2026). The remainder is therefore reduced by a reserve for all three before the
  comparison; a check that trusts the raw reading is systematically too permissive.
  THE FAIL DIRECTIONS ARE THREE, NOT ONE, and mixing them is the way this point does damage:
  an UNREADABLE measurement keeps failing OPEN and loudly, exactly as today — a guard that
  denied on an assumption would break the measurement rule; a call that is not classified as a
  START stays allowed, so no exit path, commit, push, board or boundary call can ever be
  refused; and only a call ALREADY classified as a start, whose type cost is unknown, is
  treated conservatively. That conservative branch COUNTS how often it fires, because a
  silent brake that defers work nobody sees is worse than the overshoot it prevents.
  EVERY CONTEXT-GROWING CALL IS ADMITTED AGAINST THE SAME BUDGET, not only the ones today's
  fence classifies as a START (GPT-5.6 Sol, review 19.08.2026: a session that never issues a
  `START_SCRIPTS` command, or that grows purely through reads, crosses the ceiling with the
  whole programme built). The exemption is therefore not "everything except starts" but
  "control operations whose output is BOUNDED BY CONSTRUCTION" — a commit, a push, a board
  call, a focus stamp, the boundary — and each of those is exempt because point 597's budget
  caps what it can return, not because of what it is called. A large READ is not a control
  operation and is admitted like any other growth.
  THE LAG IS A LEDGER, NOT A RESERVE (GPT-5.6 Sol, review 19.08.2026). Subtracting a
  statistical reserve cannot bound anything, and it is spent TWICE when one assistant turn
  makes several tool calls against the same stale reading. So the function keeps a per-turn
  PENDING DEBIT: every admitted call books its projected cost immediately, the remainder is
  computed as reading minus outstanding debits, and the debits are reconciled against the
  actual growth when the next complete reading arrives. A reading that has not moved is
  therefore not free budget.
  THE HANDOVER IS RESERVED BEFORE ANY WORK, not admitted at zero (GPT-5.6 Sol, review
  19.08.2026): point 744's mechanically capped handover cost is subtracted from the remainder
  from the session's first call onward, so the exit is always affordable and never has to be
  waved through. "Exit-path calls are always allowed" then stops being a hole and becomes a
  consequence — the budget for them was never lent out.
  THE EMERGENCY LEVER LIVES HERE, because this point owns the admission decision (user
  19.08.2026: prevention by default, "mit einem Notfall-Hebel, der das erlaubt, wenn es gar
  nicht anders geht"). It is a PERMIT, not a switch: `context-fence-override.mjs --session
  <id> --point <N> --reason "<why>" --max-tokens <n>` writes a short-lived, session-bound,
  point-bound, SINGLE-USE permit that the fence consumes atomically for exactly one otherwise
  refused operation. An append-only record stores timestamp, session, point, repository head,
  the reading, the projected cost, the reason, the caller and the ACTUAL result, so a lever
  pulled often is visible as a pattern rather than as a habit. An environment variable or a
  persistent "off" state is explicitly NOT this lever: it would not be deliberate and it would
  not be once. The same permit is what points 748 and 746 honour, so there is one lever and
  not three.
  VERIFIABLE: Vitest over the pure function — a call that fits, one that does not, one whose
  type cost is unknown, an unreadable reading (allowed), an exit-path call at zero remaining
  budget (allowed), and a case proving the lag reserve is subtracted; a case where three calls
  in one turn against an unmoved reading are each debited rather than each granted the same
  remainder; a case proving the handover reserve is subtracted from the first call onward; and
  over the permit — consumed exactly once, refused for another session, another point or after
  expiry, and every use recorded. AND AN END-TO-END CASE THROUGH THE REAL HOOK, not only the
  pure function: `context-fence-guard.mjs` is armed in `.claude/settings.json` (measured
  19.08.2026), so a fixture command must be shown actually intercepted — a decision function
  nobody calls prevents nothing. Plus a replay against
  the transcript of the 19.08.2026 session showing at which call it would have refused, and
  that none of the refusals is an exit path.
  THE RESIDUAL IS NAMED WITH ITS SIDE, because "never" is a claim this point cannot honestly
  make (GPT-5.6 Sol, review 19.08.2026, and it is right): while an UNREADABLE measurement fails
  open, a session whose transcript cannot be parsed is ungoverned, and that branch stays open
  deliberately — denying on an assumption breaks the measurement rule and would be the worse
  failure. So the claim is: with the budget enforced, the ledger booking every admitted call,
  the output cap in place and the handover reserved, the only remaining path across the ceiling
  is an unreadable reading — and THAT is what the incident record of point 742 exists to count.
  If it turns out to fire, closing it is a point of its own, not a silent tightening here.
  Criticality: high — it decides what may run at all, and its failure mode is a session that
  locks itself out of its own exit.
  Bundle: Session- & Repo-Hygiene.

- [ ] 746. A point is not begun that cannot finish under the ceiling (19.08.2026, the same
  user decision as 745, applied one level up). `commission-guard` already answers whether a
  point may be opened — the pool cap and the queue order — and it is the natural place for the
  second question: does the expected context cost of THIS point still fit in what is left? A
  point begun at the end of a session is cut in half mid-work, and the halves cost more than a
  fresh session would have.
  FINAL STATE: the guard refuses to commission a point whose expected context cost exceeds the
  remaining budget of point 745's function, and names the fresh session as the remedy.
  THE ESTIMATOR IS THE HARD PART AND IS NAMED, not assumed: `measure-point-cost.mjs` reports
  BILLED tokens per landed point, which is a different quantity from context growth and must
  not be substituted for it. The estimate comes from point 742's series, aggregated per POINT
  CLASS, and a class with too few readings counts as unknown.
  WHAT "UNKNOWN" DECIDES IS SPELLED OUT, because an expectation that decides nothing is not a
  safety mechanism (GPT-5.6 Sol, review 19.08.2026): an unknown class is commissioned only
  against a FULL remaining budget — the guard treats it as the most expensive class it has
  ever measured — and a point whose class stays unknown after enough attempts is flagged for
  classification rather than admitted by default.
  A POINT TOO LARGE FOR ANY SESSION MUST NOT BE DEFERRED FOREVER (GPT-5.6 Sol, audit
  19.08.2026): where the expected cost exceeds a FULL fresh session's window, the guard does
  not refuse indefinitely but demands the point be CUT — and that demand is recorded on the
  point, so a systematically oversized point becomes visible instead of quietly sinking down
  the queue. THAT DEMAND IS A PREREQUISITE, not a note: while it stands unanswered the point
  cannot be commissioned, and it is answered by the point actually being split — otherwise a
  recorded demand is exactly the "we wrote it down" that changes nothing. The emergency permit
  of point 745 is the one way past it, and it is recorded like every other use of the lever.
  VERIFIABLE: Vitest over the decision — a point that fits, one that does not, one of unknown
  class, and one larger than a whole fresh window (decomposition demanded, not refusal); and a
  replay over the last twenty landed points showing which would have been deferred and which
  cut.
  Criticality: medium — it delays work rather than corrupting it, but a wrong estimator
  delays it invisibly.
  Bundle: Session- & Repo-Hygiene.

- [ ] 759. The context fence's worktree stand-down never fires, so every delegated agent is
  fenced against its PARENT session's context (measured 20.08.2026 by the agent on point 758).
  `scripts/context-fence-guard.mjs` exits early when `isWorktreeCheckout(REPO_ROOT)` holds — the
  stand-down that is supposed to keep the fence off subagents. But the harness runs the hook from
  the MAIN checkout, so `REPO_ROOT` is always the main tree and that exit is unreachable. The
  agent's tool calls carry the PARENT session's id, therefore match the owner lock, and are then
  judged against the PARENT SESSION'S TRANSCRIPT — a reading that has nothing to do with the
  agent's own context. The counter-check was taken: the guard's copy inside the worktree admits
  exactly the payload the live hook had refused.
  THE COST IS ON THE RECORD, from the day it was found: the agent could not start `node
  scripts/author-sol.mjs` (refused at 112k–156k against the 110,000 mark), so Claude Opus 5
  authored point 758 itself instead of GPT-5.6 Sol; and `review-sol.mjs` sits in the same
  `START_SCRIPTS` set, so the cross-vendor review was unreachable from the worktree too. That is
  the model policy and the four-eyes principle of CLAUDE.md §6 disabled at once, by a guard whose
  stand-down was written precisely to prevent it, and it hits EVERY worktree agent.
  IT IS MASKED, NOT FIXED, BY POINT 758: with the fence in its default observation mode nothing
  is refused today, so this defect is invisible until the fence is re-armed. Re-arming is a
  condition inside point 747, and this point is a PRECONDITION of it — arming the fence again
  while the stand-down is unreachable restores the blockade in full.
  FINAL STATE: the stand-down no longer hangs on `REPO_ROOT` but on the CALLING tree — the tool
  call's working directory, and failing that the agent session's own identity — so a call made
  from a worktree stands down while the owner session's own calls stay fenced. The fence never
  judges one session's calls against another session's transcript: where the caller cannot be
  identified, it stands down rather than fencing on the wrong reading, because a refusal taken
  from a foreign measurement is worse than a missed one.
  VERIFIABLE: Vitest over the pure core — an agent call whose working directory lies in
  `.claude/worktrees/` is admitted while the identical payload from the owner session in the main
  tree is refused (the case must fail against today's code, or it proves nothing); a call with no
  identifiable tree stands down; and the armed-mode refusal of the owner session is unchanged.
  Criticality: medium — it refuses nothing while the fence observes, but it silently voids the
  model policy the moment the fence is armed. A guard change is a mechanism, so it needs the
  other model's recorded review before it lands.
  Bundle: Session- & Repo-Hygiene.

- [ ] 747. The ceiling is recalibrated from a series, and gives ground back only against
  evidence (19.08.2026). Point 743 buys safety with a small working window, and that price is
  meant to be temporary: once the output budget of 597 caps the largest single jump and point
  744 has made leaving cheap, the same ceiling tolerates a HIGHER trigger — roughly 125,000 on
  today's numbers — and the working window nearly doubles at unchanged safety. The temptation
  is to raise it after a quiet stretch, which is exactly when the evidence is weakest.
  FINAL STATE: a raise is admissible only when all of these hold, and the commit that raises
  it records each: a MINIMUM SAMPLE of handovers measured AFTER 597 landed; the decision taken
  on an upper QUANTILE of the per-kind growth rather than a mean; a stated safety margin on
  top; a cap on how far one step may move the value; and an AUTOMATIC ROLLBACK to the previous
  value on any recorded overshoot of the ceiling.
  THE ROLLBACK IS A SECOND LINE, NOT THE PREVENTION, and this point says so rather than
  letting the word "automatic" imply otherwise (GPT-5.6 Sol, review 19.08.2026). It reacts
  only to overshoots that were RECORDED, and point 742 names its own blind spots — a session
  that dies without a boundary writes nothing, and a crossing under the stated margin writes
  nothing either. So the rollback fires after the ceiling has already been broken, and it
  exists to stop a bad raise from standing, not to keep the ceiling. What keeps the ceiling is
  points 745 and 597.
  WHY THE SAMPLE IS NOT ENOUGH BY ITSELF (GPT-5.6 Sol, audit 19.08.2026): handovers taken
  under the new, lower trigger are CENSORED — they cannot show a jump the trigger already
  prevented — so a quiet series is evidence about the trigger, not about the jump. The
  quantile is therefore read per call KIND from point 742's series, which is not censored,
  rather than from the handover totals.
  VERIFIABLE: Vitest over the raise decision — too small a sample, a mean that would pass
  where the quantile fails, a step larger than the cap, and a recorded overshoot triggering
  the rollback; plus a dry run over whatever series exists at the time, printing the value it
  would propose and the value it refuses.
  THE SERIES HAS ITS FIRST MEMBERS, and they say the trigger had been set below the floor
  (measured 19./20.08.2026). Three consecutive fresh sessions stood at 85,225 / 83,079 / 86,416
  tokens after their orientation turn against a trigger of 82,000 and had to hand over without
  starting a single point; the cause is the 61,372-token start floor standing before the first
  tool call, which point 757 cuts. The trigger was lifted to 110,000 as an INTERIM value on
  20.08.2026 (`CONTEXT_TRIGGER_TOKENS`, commit e650c0f6; ceiling unchanged at 150,000), and this
  point replaces that interim value with one derived from the series.
  THE TRIGGER IS ANCHORED AT THE CEILING, NEVER AT THE FLOOR (user 20.08.2026, 01:28). Floor and
  safety distance are independent: the floor sets the SIZE of the working window, the distance
  the SAFETY before the ceiling — so a falling floor must widen the window without the distance
  being touched, and the trigger must not travel with the floor. It is therefore ceiling minus
  the measured EXIT COST in tokens (point 744, attributed per step by 752) minus an upper
  QUANTILE of the per-call-kind jump from point 742's series. The quantile is CORRECTED FOR THE
  NUMBER OF ADMISSIONS: the fence prices one jump per admission, but a session with a low floor
  makes many, and over n draws from the same distribution the probability that one breaks the
  ceiling is 1-(1-p)^n — so for at most 1 % overshoot per SESSION each single admission needs the
  quantile 1-0.01/n, or the window is budgeted in ADMISSIONS instead of tokens.
  A FLOOR RULE binds every future value from below: the trigger is never set under the measured
  start cost plus a margin, because it otherwise fires before a session can work and turns the
  batch into a chain of handovers. The commit that moves the value records both measurements.
  THE CEILING IS BROKEN INSIDE AN ADMITTED UNIT, not between two, and neither the absolute nor
  the remaining-distance formulation covers that: the fence checks at admission, and a unit that
  keeps reading afterwards (suite output, whole files) grows unchecked. This point therefore also
  delivers (a) a RE-CHECK DURING the unit whose only permitted continuation is "finish and hand
  over", and which may never refuse the handover itself, and (b) a CAP PER UNIT — a tail nobody
  cuts cannot be paid for with a quantile. That cap is the same measure that lowers the
  orientation share of the floor (carrier only via `--status`/grep, no point-brief in the main
  session, the board by targeted excerpt: 22-25k of the four stranded sessions' context was pure
  orientation) and that point 597 already knows for tool output.
  THE MEASURED REACH OF THE FENCE stands beside the value, because it decides what a stranded
  session may still do: beyond the mark `scripts/context-fence-core.mjs` refuses only START work
  (agents, browser suites, author-sol/review-sol, batch-claim without `--status`/`--withdraw`)
  and writes to the authoring targets (TASKS.md, the archive, CLAUDE.md, design.md, docs/*.md,
  memory/); reads, commit, push, merge, `land-point.mjs`, the board, the boundary and the fast
  gates stay open, `context-watermark-core.mjs` is itself no authoring target, and
  `HOA_CONTEXT_TRIGGER_TOKENS` is the code-free lever.
  RE-ARMING IS ITS OWN, LATER STEP and is a CONDITION of this point (user 20.08.2026, 01:34):
  the fence is relaxed to observation until the consumption-reducing points have LANDED (point
  758 carries that relaxation), and only then is the start floor MEASURED ANEW and the threshold
  computed from the then-valid measurement. Arming it before those points existed was the wrong
  decision this condition takes back.
  Criticality: low — it only moves a number, and its dangerous direction (raising too far) is
  the one the rollback covers.
  Bundle: Session- & Repo-Hygiene.

- [ ] 752. The handover's exit and ramp are unattributed, so its acceleration is guesswork
  (measured 19.08.2026, 20:35, over 43 handovers since 18.08.: sources `.claude/boundary.log`
  HANDOVER markers, `.claude/autostart.log` spawns, commit timestamps, deduplicated by session
  id within 60 min). Marker → launcher spawns successor: median 0.0 min, p90 0.1, max 65.
  Spawn → successor's first commit: median 6.3, p90 14.9, max 91. Last commit old → first
  commit new: median 12.7, p90 47.8, max 100; of that the outgoing session's tail median 6.1,
  p90 11.8. The mechanism is not the delay — the spawn follows the marker in under a second.
  What costs is the sequence of model turns on both sides: the exit (now-card back to the
  queue, board publish, handover card, carrier drain, `--prepare`, `--commit`) and the ramp
  (board-first duties, adopting in-flight work, reading the queue, cutting and reading the
  brief). WHAT THAT MEASUREMENT CANNOT DO, and why this point starts with attribution (GPT-5.6
  Sol, audit 19.08.2026, findings A7/A14/A17/A18/A19): it reports elapsed MINUTES and therefore
  cannot price tokens, cannot show that the six exit steps dominate, and uses "first commit" as
  a proxy for productive work, which reading, analysis and uncommitted implementation all
  precede. The 60-minute deduplication also suppressed the very retry burst under study, and of
  the 29- and 65-minute outliers roughly 25 and 35 minutes stay undecomposed. So the numbers
  establish that a gap EXISTS and roughly how large it is, not what it is made of. Handover
  cost and context ceiling multiply: a lower trigger means more handovers, and each pays the
  startup load of a fresh session before its first useful turn.
  FINAL STATE, in two stages, because building the levers before the attribution would spend
  the session's scarcest budget on a guess:
  1. THE BOUNDARY PATH IS ATTRIBUTED IN TOKENS, PER STEP, not in minutes. Point 744 already
     measures the exit as one number; this splits that number: every stage of
     `--prepare`/`--commit` and the successor's first turn up to its first work-bearing call
     carries its own reading, so "which step dominates" is settled by evidence. Elapsed time is
     recorded BESIDE it, never instead of it: idle stretches (the claiming reservation, the
     launcher's tick cadence) are real throughput loss that no token count shows, and they are
     reported separately so neither hides the other.
  2. ONLY WHAT THE ATTRIBUTION SHOWS DOMINANT IS THEN BUILT. The candidates, each with the
     bound that makes it safe:
     a. ONE EXIT COMMAND (`batch-boundary.mjs --leave`) driving the bookkeeping the way
        `land-point.mjs` drives the landing — one verdict per step, stopping at the first red.
        It is IDEMPOTENT AND RESUMABLE: each step records its own completion, a re-run
        continues where it stopped, and no board edit or carrier drain is ever performed twice.
        It PRESERVES THE TWO-PHASE INVARIANT rather than collapsing it: `--prepare` still
        proves fresh bookkeeping, `--commit` remains the LAST repository action, and a guard
        that demands remedial work between them still gets its chance. Fail-open like the rest
        of the boundary: it COMPLETES even when it overruns its cap, and records the overrun.
     b. THE LAUNCHER DOES MECHANICAL RAMP WORK ONLY WHERE THE DESTINATION IS ALREADY DECIDED.
        An honoured claim redirects a handover to a claiming window
        (`resolveBoundaryDestination`), so nothing — focus, board card, adoption — is
        pre-assigned while that redirect is still possible; where it is not, the launcher
        discharges the board-first duties before the model's first turn.
     c. THE BRIEF TRAVELS IN THE SPAWN PROMPT ONLY WITH A FRESHNESS CHECK. It names the
        revision it was cut from, and the successor REGENERATES instead of trusting it when
        head, queue rank or claim moved in between. This shifts the brief's token cost rather
        than removing it, which is the honest claim.
     d. RETRY IS BOUNDED WITH A DEFINED TERMINAL BEHAVIOUR. After the second failed boundary
        attempt the session stops retrying: it completes the handover fail-open, records the
        overrun and alerts. It never loops (the 18 markers in four minutes) and never strands
        the batch. Where point 751 already removes a cause of that loop, this is folded into
        751 rather than duplicated.
  3. SCOPE, STATED SO IT IS NOT MISCOUNTED: these are THROUGHPUT measures, not ceiling safety.
     The ceiling is held by point 597 (capped tool inputs and outputs) and point 745 (the
     prospective budget asked before the call). Nothing here may be subtracted from the trigger
     arithmetic of 743, and no turn-count saving may be treated as a token bound — one uncapped
     40,000-token response crosses the ceiling however few turns it took.
  VERIFIABLE: Vitest over the per-step attribution record (a fixture boundary run yields one
  reading per stage, and a missing reading is reported rather than silently absent); a case that
  `--leave` re-run after an interrupted step completes without repeating the finished ones; a
  case that it still completes when a step overruns, WITH the overrun recorded; a case that no
  pre-assignment happens while a claim can still be honoured; a case that a stale brief is
  regenerated; and a case that the retry bound terminates in a completed handover rather than a
  loop.
  Criticality: medium — every change touches the handover path, where fail-open is the rule;
  the attribution stage itself is low risk and is what the rest is decided from.
  RANK: after the ceiling programme (743, 742, 744, 597, 745, 746, 747), i.e. directly
  following 747. The ceiling mechanisms bound the damage, this one buys throughput, and its own
  first stage depends on 744's corrected exit path.
  Bundle: Session- & Repo-Hygiene.

- [ ] 753. The authoring routing counts almost no unsuccessful review rounds, so the Fable
  escalation never fires (measured 19.08.2026, 21:06 and again 21:33 on point 751). The first
  reading printed "0 unsuccessful review round(s), 0 fresh attempt(s)" and "round history: no
  unsuccessful reviews recorded" while point 751 stood in its THIRD do-not-merge round; the
  second, one round later, printed 1 — against four recorded do-not-merge reviews. CLAUDE.md §6
  makes Fable 5 the escalation "REACHED ONLY AFTER FIVE UNSUCCESSFUL REVIEW ROUNDS", and
  `scripts/author-routing-core.mjs` makes that cut from the recorded review history. A count
  that lags the real rounds can never reach five, so a point loops on one author indefinitely —
  which is the cost the memory `commit-proxy-misses-unlanded-work` names as the most expensive
  thing there is: a grinding, never-landing point has no commits and shows up in no proxy.
  FINAL STATE: the round count `author-routing-core.mjs` reads is the number of do-not-merge
  reviews recorded for that point, whatever wrote them. Where `review-sol.mjs` writes a verdict
  and where the routing reads it are the SAME record, keyed on something every recorded round
  carries — a review handed to a fallback model, a review recorded from a worktree and a review
  of a range rather than a single sha all count, because each of them is a round the point did
  not pass. A verdict the routing cannot key is reported as unkeyable at recording time, not
  dropped silently.
  VERIFIABLE: Vitest over the routing's counter — a fixture history of four recorded
  do-not-merge verdicts yields four, a fifth crosses into the Fable lane, a clean verdict does
  not count, and a verdict missing the key is refused at recording time with the missing part
  named; plus a case over the real 751 history asserting the count equals the recorded rounds.
  Criticality: medium — nothing breaks visibly; the failure is a point that never escalates and
  keeps consuming rounds on one author.
  Bundle: Session- & Repo-Hygiene.

- [ ] 748. The attended window is fenced by nothing, and it is the largest remaining source
  (measured 19.08.2026 ON THE SESSION THAT WROTE THIS PROGRAMME). Every guard in this project,
  the context fence included, STANDS DOWN for a session that does not own the batch lock —
  correctly, because a subagent must not be judged by the batch's rules. But an attended chat
  window is not a subagent, and it is not the batch worker either: it falls through the same
  hole. This session sat at 265,517 tokens, 115,517 past the mark, having handed the batch over
  an hour earlier, and nothing refused it a single call. Points 742 to 747 govern the batch and
  would leave this untouched, so the "share of usage above 150k" they are meant to remove would
  keep being fed from here.
  FINAL STATE: NO SESSION CLASS IS EXEMPT FROM THE CEILING; what differs between the three is
  the REMEDY, not whether the budget applies (GPT-5.6 Sol, review 19.08.2026 — an exempt
  subagent is a whole class of sessions with no ceiling at all, and a subagent is exactly what
  the expensive work runs in). All three are admitted through point 745's prospective budget,
  so the decision is "does this call still fit", not "are we already past the mark" — denial
  after the mark detects the condition one call too late. The remedies:
  a SUBAGENT past its budget is refused the call and told to return what it has, because it has
  a caller who can carry on; the BATCH OWNER is taken over the boundary as points 745 and 743
  describe; an ATTENDED MAIN WINDOW cannot take a boundary, because a person is talking to it,
  so its refusal names `/clear` and nothing else. That is the same remedy point 542 already
  wired for `batch-claim.mjs`, applied
  to the window rather than to one command, and it rests on the same user decision (19.08.2026:
  "Bevor die Batch geholt wird, den Benutzer zu clear auffordern und danach zu weiter oder so").
  In all three, point 745's emergency permit is the one deliberate way through.
  THE FENCE MUST NOT SILENCE THE CONVERSATION: reads, answers, commits and pushes stay allowed
  in every case — a window that cannot answer the person in front of it is worse than an
  expensive one. A large READ is admitted against the budget like any other growth; what is
  never refused is the ANSWER.
  HOW THE THREE ARE TOLD APART is the real work of this point and must not be guessed: the
  subagent case is what today's `heldByOtherLiveOwner` conflates with the attended one, and
  getting it wrong either fences every subagent or fences nothing. The point NAMES the identity
  signal it uses — what a subagent process carries that a main window does not — rather than
  leaving it to the implementation, because fixtures for a pure three-way decision prove the
  decision and not the classification (GPT-5.6 Sol, review 19.08.2026).
  VERIFIABLE: Vitest over the three-way decision with a fixture per case — subagent past its
  budget (refused, return-what-you-have named), batch owner past it (refused, boundary named),
  attended window past it (refused, `/clear` named), and each of them within budget (allowed);
  a case per class proving an ANSWER is never refused; a case proving the permit lets exactly
  one refused call through in each class; a classification case per real session shape, driven
  from the signal the point names rather than from a hand-built fixture; plus a replay
  against this session's own transcript showing the calls it would have refused and confirming
  no answer, read, commit or push is among them.
  Criticality: high — it extends a denying mechanism to a session a human is using, so a false
  deny is felt immediately by the user rather than by a batch nobody watches.
  Bundle: Session- & Repo-Hygiene.

- [ ] 749. The machine files its own status reports as user decisions, and the user keeps
  having to clear them out (user 19.08.2026, 18:59, on the card "Batch pausiert: Alarm blieb
  unbeantwortet": "Ich habe schon wieder so eine pathologische Karte unter 'Von dir zu klären'
  … Das ist nicht meine Zuständigkeit. Da kann ich nichts machen. Löse das selbst."). The rule
  is settled and enforced elsewhere: "Von dir zu klären" holds ONLY genuine user decisions.
  Two scripts break it from the machine side — `scripts/alert-escalation.mjs:166` posts
  "Batch pausiert: Alarm blieb unbeantwortet" and `scripts/child-retry.mjs:284` posts "Batch
  pausiert: Umgebungsausfall", both through `board.mjs vdzk-add`. Neither asks the user to
  DECIDE anything: the first reports that an ntfy alert went unanswered and the batch paused
  itself, the second that the environment failed. Both close with an instruction the user
  cannot carry out ("prüfen, was die Meldung ausgelöst hat"), and both resolve by themselves
  when the restart clock expires — so the card outlives the condition it describes.
  FINAL STATE:
  - Neither script writes to the decision section. A paused batch and an environment outage
    are STATE, and they are shown where the board already shows state; the ntfy alert stays
    as it is, since that is the channel built for reaching the user.
  - A decision card is admissible from an automated path only when it names a choice the user
    alone can make, and it names the options. Where a script has no such choice to offer, the
    board API refuses the card rather than accepting it — the same shape as the existing card
    gates, so the rule is enforced instead of remembered.
  - A card whose condition has resolved does not have to be removed by hand: a status the
    board derives is re-derived, and the pause state disappears from the board when the pause
    file does.
  VERIFIABLE: Vitest over the refusal — an automated card without a named choice is rejected
  and the message names the state section as the right place; a genuine decision card with
  options is accepted; and a case over each of the two call sites asserting they no longer
  reach `vdzk-add`. Plus a case that the board's rendered pause state disappears once
  `.claude/batch-paused` is gone.
  Criticality: medium — it touches the alert path, which must keep reaching the user; the
  change removes a board card, never a notification.
  Bundle: Chat & Tafel.

- [ ] 750. A session that dies without a boundary leaves no reading, so the overshoot series
  under-counts exactly where it matters most (GPT-5.6 Sol, review of the context-ceiling
  programme, 19.08.2026; point 742 names this residual and expressly does not claim it). The
  incident record of point 742 is written by `batch-boundary.mjs --commit --context`. A session
  that crashes, is killed with the container, or simply stops answering never reaches that call
  — and a session that died is more likely to have been an expensive one, so the missing
  readings are biased toward the large end. Point 747's rollback then reacts only to what was
  recorded, and reads a quiet series as evidence of safety.
  FINAL STATE: the reading is derived at SESSION START from the PREDECESSOR's transcript, not
  only at the predecessor's exit. A session that comes up finds the last complete api usage
  event of the session before it, and if that reading crossed the ceiling with no incident
  record for it, writes the record then — same shape, same series, marked as reconstructed
  rather than self-reported, so the two are never confused when the series is read.
  IT MUST NOT DELAY THE START. The reconstruction is bounded work over one file and fails
  SILENTLY into "no reading" rather than holding up a session that has work to do; a startup
  path that can block on bookkeeping is a worse defect than the under-count it closes.
  VERIFIABLE: Vitest over the reconstruction — a predecessor that exited cleanly (nothing
  written, the boundary already recorded it), one that died above the ceiling (a reconstructed
  record), one that died below it (nothing), one whose transcript is unreadable (no reading, no
  throw), and a case proving a reconstructed record is distinguishable from a self-reported one
  in the series the reading command prints.
  Criticality: low — it only writes a record, and it sits on the startup path, where its one
  real risk is delaying a session rather than corrupting anything.
  Bundle: Session- & Repo-Hygiene.

- [ ] 738. The lease fence does not know the fold command, so a dispossessed session can still
  rewrite the work order (measured 19.08.2026 while building `scripts/fold-point.mjs`).
  `fenceGuardedAction` in `scripts/batch-lease-core.mjs` names only `land-point.mjs` in
  `LANDING_SCRIPTS`. A session whose batch lease has run out is therefore refused a bare `git
  push`, a `TASKS.md` edit, the tick and every `board.mjs` call — but NOT `node
  scripts/fold-point.mjs <N> --into <M>`, which ticks a point, moves it into the archive,
  publishes the board and commits. That is exactly the hole the fence exists to close, and it
  opened the moment a second command learned to land work.
  FINAL STATE: the fence names EVERY command that lands work, not one of them, and the list is
  derived from or pinned against what the repository actually has — a third landing command may
  not silently reopen the hole. A dispossessed session running the fold command is refused with
  the same message the tick already gives it.
  VERIFIABLE: a Vitest case per landing command proving the fence refuses it without the lease
  and allows it with one, plus a check that fails when a command that mutates the work order is
  missing from the list.
  Criticality: medium — nothing is lost while one session owns the batch, but two owners writing
  the work order is the state the lease was built to make impossible.
  Bundle: Session- & Repo-Hygiene.

- [ ] 739. Taking the batch is fenced by the HANDOVER mark, so a window can take it with a third
  of its context already spent (measured 19.08.2026, 18:39). `batch-claim.mjs` is in the context
  fence's `START_SCRIPTS` and `CLEAR_FIRST_SCRIPTS` (`scripts/context-fence-core.mjs`), so the
  fence does refuse a claim past the mark and names `/clear` — that part works. But the mark it
  refuses against is the 150000-token HANDOVER watermark, and a window that claims the batch at
  101487 tokens is below it and passes. The user caught that one by hand ("Damit hättest du
  direkt einen schlechten Start"); the mechanism did not.
  WHY TWO NUMBERS, NOT ONE. The 150000 mark answers "when must a RUNNING session hand over?" — a
  session with work in flight. Taking the batch asks the opposite question: "how fresh must a
  worker be to START one?", and a fresh worker should begin near zero. One number cannot serve
  both without being wrong at one end.
  FINAL STATE: the claim path is fenced against its OWN threshold, separate from the handover
  watermark, and the refusal names the remedy (`/clear`, then claim). THE NUMBER IS MEASURED
  BEFORE IT IS SET: what starting context did the sessions that actually LANDED points run with?
  A number picked from taste would be the same guess this point exists to replace.
  VERIFIABLE: Vitest over the pure decision — a claim below the claim threshold passes, one above
  it is refused with the remedy named, and the handover watermark keeps its own behaviour
  unchanged; plus the measurement recorded with the chosen number.
  Criticality: medium — it costs a whole session's quality when it fires, and this incident is the
  FIRST recorded recurrence after the fence was armed (Sol's audit of 19.08. refused the larger
  proposal for lack of exactly this evidence, so it belongs in that series).
  Bundle: Session- & Repo-Hygiene.

- [ ] 736. The escalation lane has no way back DOWN, so one point sits on the scarcest model
  for good (measured 19.08.2026 from the harness transcripts under
  `/home/node/.claude/projects/-workspace-hoa`, window since 18.08. 19:00). Fable ran 1137 turns
  for 164.9M cache-read tokens: point 713 (escalation authoring, six Fable agents, rounds 3 to 8)
  95.1M = 58 %; point 712 (escalated after four do-not-merge rounds) 35.0M = 21 %; two
  batch-serving sessions that came up on Fable instead of Opus 5 33.3M = 18 %. Escalation
  authoring is 79 % of the Fable spend and ONE open point is 58 % of it. WHY THE COMMIT COUNT
  HIDES IT: read from the `Co-Authored-By` trailers Fable has zero commits on 19.08., which reads
  as "the spend stopped". It did not — point 713 NEVER LANDED, so its Fable work appears in no
  commit on `main`. The commit proxy misses exactly the most expensive case there is: a grinding
  escalation that never lands. THE DEFECT IS IN THE LANE, NOT IN THE REVIEWING.
  `scripts/author-routing-core.mjs` line 445 decides `rounds >= FABLE_ESCALATION_ROUNDS → fable`
  off a MONOTONE counter; round counts never fall, so a point escalated once stays on the
  scarcest model forever, however far it has converged. And 713 IS converging: round 6 returned
  do-not-merge only, round 7 two merge-with-fixes beside two do-not-merge, round 8 one merge, two
  merge-with-fixes and one do-not-merge, with the findings growing narrower and staying real
  (round 8: three coverage gaps in one test file, one error path after the write). Round 8's work
  is "add three test cases and close a fail-open path" — that does not need the escalation lane.
  Point 726 rules WHEN the escalation engages and nothing rules the way back; point 596 (the
  cost-tail hook at three times the median) touches the theme, is open, and does not cover it.
  FINAL STATE:
  - NOTHING HERE LETS A POINT LAND WITH OPEN GAPS. The lane decides WHICH MODEL writes the next
    round, never whether the findings must be answered. A do-not-merge stays a do-not-merge on
    every lane.
  - THE LANE FALLS BACK WHEN THE POINT CONVERGES. The routing reads the TREND of the recorded
    verdicts, not only their count: a point whose rounds are moving from do-not-merge toward
    merge-with-fixes and merge drops back to a cheaper lane, so the scarcest pool carries the
    hard rounds and not the tail. The trend is read from the recorded review verdicts
    (`.claude/mechanism-reviews.jsonl`), so a session that ran none of the earlier rounds sees
    the same number.
  - AT A ROUND THRESHOLD THE POINT REACHES A DECISION, NEVER AN AUTOMATIC ABORT (the wording of
    point 596 is the model). Three answers are offered and the one taken is recorded with the
    point: re-cut it smaller, staff it differently, or deliberately continue. 713 entered its
    first review with 17 files and 1155 lines and is judged in 4 to 6 passes; a smaller cut would
    have converged in fewer rounds, so re-cutting is the first answer offered, not the last.
  - SPEND IS MEASURED IN TOKENS, NOT COMMITS. The check that answers "what has this point cost"
    reads the transcripts, because an unlanded point produces no commit and the commit proxy
    reports zero for the most expensive case. Where the transcripts are unavailable that is
    reported as unmeasured, never as zero.
  - AN OPERATOR CAN OVERRIDE THE LANE ABOVE THE THRESHOLD, and today nobody can. MEASURED
    19.08.2026: `node scripts/author-sol.mjs --routing --point 713` answers `point 713 → fable`
    at 18 unsuccessful rounds, and there is NO hand route around it. `authorLaneFor` tests
    `tag === fable` first, then `rounds >= FABLE_ESCALATION_ROUNDS → fable`, and only THEN
    `if (tag)` for the ordinary lanes — so an `Author lane: opus` in the point's own spec does
    not bite once the boundary is passed, and the comment there says so outright. The only
    parameter that wins is `authorLaneFor`'s `override` argument, which no CLI sets:
    `--anyway` in `author-sol.mjs` only bypasses the refusal to write a point assigned to
    someone else, not the lane decision. An explicit tag or an explicit switch must therefore
    beat the escalation boundary, so the next case does not wait for a mechanism to be built.
    This is its own gap beside the monotone counter, and it is why nothing can take 713 off the
    scarcest model until this point ships.
  VERIFIABLE: Vitest over the pure routing decision — a point with a flat do-not-merge trend
  stays escalated, a point whose recorded verdicts improve falls back to the cheaper lane, a
  point at the threshold returns the decision with all three answers and never an abort, a
  point whose ledger holds rounds from several sessions counts them all, and a case that FAILS
  if the counter is fed commits instead of review records; plus a fixture proving an unlanded
  point reports its measured token spend rather than zero.
  Criticality: high — it governs how the scarcest model pool is spent, and its absence has
  already put 58 % of a week's volume into a single point that never landed.
  THE SERVING FALLBACK IS NOT PART OF THIS POINT — it is decided and correct. The 18 % above is
  not escalation at all and not an exhausted quota either: measured from both transcripts, the
  switch reads verbatim `Switched to Fable 5 due to high demand for Opus 5 (1M context)` with
  `trigger: overloaded`, so it is capacity overload. The user decided it on 19.08.2026: »Dieser
  Fallback ist nur theoretisch … dann sollte auf ein Modell im gleichen Haus zurückgefallen
  werden — also Fable — damit ein eventuelles Review noch aus einem anderen Haus kommt.« Keeping
  the author at Anthropic is exactly what keeps the cross-vendor review with Sol, so the fallback
  target stays `claude-fable-5` and nothing here changes it. UNMEASURED RESIDUE, recorded so it
  is not lost and not acted on: the overload was on `claude-opus-5[1m]` while another session ran
  247 turns on plain `claude-opus-5` at the same time. If the non-1M variant has capacity in such
  a moment, "plain Opus 5 first, then Fable" would hold the user's same-house rule and spare the
  Fable pool — a hypothesis from one observation, and the CLI takes only one `--fallback-model`,
  so it would need a mechanism rather than the flag.
  Bundle: Modell & Wächter.
- [ ] 735. The mechanism gate fires on a TOUCH, where it was built for a CHANGE (user
  19.08.2026, reading the board: the user saw four-eyes on over half the cards and asked whether
  so many points are judged critical). They are not. MEASURED 19.08.2026 over the 71 points
  landed since 01.08.: 56 carry a review record (79 %), but only 16 of those reviews come
  from a criticality decision — 38 were demanded by `mechanism-review-guard`, which is
  NAME-based (`scripts/*-guard*.mjs`, `*-gate*.mjs`, anything beside one by stem,
  `scripts/git-hooks/*`, plus the named exceptions in MECHANISM_EXTRA) and asks nothing about
  what the diff does. 40 of the 71 points (56 %) touch such a path, while the criticality tags
  across all 156 tagged points read 41 high (26 %), 86 medium, 29 low. The gate was written
  when a guard change was the exception; the queue is now mostly guard work, so the exception
  became the rule and a comment line in a guard file costs a full cross-model round.
  FINAL STATE:
  - THE GATE ASKS WHETHER THE DIFF CAN CHANGE BEHAVIOUR, not only which file it sits in. The
    path rule stays the entry condition and is not widened or narrowed; a NEW, pure classifier
    beside it decides whether the changed HUNKS in a mechanism file are review-worthy. Only
    changes that provably cannot alter what the mechanism decides are exempt: comment- and
    JSDoc-only hunks, pure whitespace/formatting, and a test file that only ADDS cases. Any
    deletion or weakening in a test file, any change to an assertion, and every hunk of
    executable code stay review-worthy — a weakened test is exactly the failure the gate exists
    to catch, so a test file is never exempt as a class.
  - A MIXED DIFF IS REVIEW-WORTHY. One executable hunk anywhere in the point's mechanism files
    puts the whole point back under the full gate; the exemption is all-or-nothing per point,
    never per file, so nothing lands by being bundled with a comment fix.
  - THE EXEMPTION IS RECORDED, NOT SILENT. A point cleared this way writes a record naming
    every mechanism file it touched and why each was exempt, through the existing
    `mechanism-review.mjs --record` path with its own verdict value, so the ledger keeps
    answering "was this mechanism reviewed" and a later reader sees the gate was asked and
    answered rather than absent.
  - THE RULE IS PROVEN AGAINST HISTORY BEFORE IT IS ARMED. One command replays the classifier
    over every commit the ledger already judged and reports how many recorded do-not-merge
    verdicts sat on a diff the new rule would have exempted. That number must be ZERO; a single
    real finding on an exempt diff refutes the rule, and the point then narrows the exemption
    rather than accepting the loss. The replay's output is committed as the evidence.
  VERIFIABLE: Vitest over the pure classifier with recorded fixtures — a comment-only hunk in a
  guard core (exempt), an added test case (exempt), a deleted assertion (review-worthy), a
  one-character change inside an executable line (review-worthy), a diff mixing a comment fix
  with an executable hunk (review-worthy as a whole), and a rename that moves executable code
  between mechanism files (review-worthy); the history replay reports zero missed findings; and
  the guard's own change carries the cross-model review it demands of everything else.
  Criticality: high — this loosens a safety gate that exists because the pre-push gate once
  went live unreviewed. The saving is real but bounded and must not be overstated: cross-vendor
  review rounds measured 0.5 % of the tokens in the ten-point cost ledger, so the gain is fewer
  Sol rounds and shorter wall clock per point, NOT a large token saving, and it does not touch
  the Fable pool at all (Fable ran 0 reviews this week; its volume is authoring).
  Bundle: Modell & Wächter.
- [ ] 737. The review's pass plan cuts per COMMIT and file, so a diff that fits in one round is
  split into thirteen (measured 19.08.2026 while commissioning point 730's fourth round). The net
  diff `main...feat/730-measured-queue-estimates` is 103,576 characters and fits TWICE into the
  200,000-character budget of a single round. `scripts/review-sol.mjs` nevertheless reports
  1,226,989 characters of "outstanding material" and demands THIRTEEN passes, because it cuts by
  (commit × file) contribution rather than by file: `scripts/queue-calibration.mjs` alone stands in
  passes 3, 6, 7, 8, 9, 11, 12 and 13 — the same current file content eight times over, because
  eight commits touched it. A CONVERGENT review judges ONE artefact (CLAUDE.md §6), and the
  intermediate state of a commit that a later commit overwrote is not an artefact of its own: it
  no longer exists in the range's end state and nothing can be merged from it. THE COST IS NOT
  THEORETICAL: point 730 must go to the SCARCEST model, because Sol wrote its last three commits
  under a hostile-tester commission and may not review its own work — so the explosion buys
  thirteen Fable passes for a diff that fits in one round, at the exact moment the Fable pool is
  the constraint point 736 measures.
  FINAL STATE:
  - THE PLAN CUTS BY FILE OVER THE RANGE'S END STATE, never by commit contribution. A pass carries
    the CURRENT content of its files plus the range's net diff for exactly those files, so the
    number of passes is bounded by the size of the changed files and not by how many commits
    touched them. A file whose end state equals main's is not material at all and is dropped
    with that reason named.
  - NOTHING IS REVIEWED LESS. Every changed file still appears in exactly one pass and the
    coverage line still accounts for each; the saving comes only from not re-reading a file once
    per commit. A file too large for one pass is still split, and that split is reported as it is
    today.
  - A RECORDED PASS CLEARS WHAT IT READ, in the terms of the new cut: a pass records the files it
    covered and the end-state sha it covered them at, so a later commit to one of those files owes
    a new pass for THAT FILE and not for the whole range. The existing per-commit clearing is
    replaced, not kept beside it.
  - THE PLAN SAYS WHAT IT DROPPED. Where the new cut removes material the old one would have sent,
    the plan names it and why — an end state identical to the base, an intermediate state
    superseded within the range — so no reader mistakes a smaller plan for a narrower review.
  VERIFIABLE: Vitest over the pure planner — a range where eight commits touch one file yields ONE
  pass for that file; a file reverted to its base state within the range is dropped with its
  reason; a file larger than the budget still splits; the coverage accounting still reaches 100 %
  of the changed files; and the recorded-pass clearing owes a new pass after a later commit to a
  covered file but not after a commit that touched only other files. Plus the real proof: point
  730's plan falls from thirteen passes to one or two.
  Criticality: medium — it changes no player-visible behaviour, but it multiplies the cost of
  every review of a long-lived branch and it spends that multiple on the scarcest pool.
  Bundle: Modell & Wächter.
- [ ] 734. A run whose reds exceed the capture cap can never be closed, so it blocks the render
  set forever (measured 19.08.2026 while landing point 732). `render-verify-guard` blocked with
  12 unexplained red runs, the oldest from 17.08.2026 — `webgpu/enrichments` from 08:25 on, and
  two `webgpu/settings` runs carrying 10 and 11 unaccounted reds. Those two say verbatim:
  `115 further result line(s) exceeded the capture cap — this run's reds were NOT all read`.
  THAT IS THE TRAP. Point 640 gives a red exactly three ways to close: name and fix its CAUSE,
  CHARGE it to the open point that owns it, or make it an open point. All three require knowing
  WHAT the red was — and a run that never recorded its reds cannot supply that, by construction.
  Such a run is therefore unclosable, and because the guard's window is "since the last render
  edit", it blocks EVERY later change to the render set indefinitely. The only way past it is the
  hand-written `--defer`, which is precisely the "gate routinely overridden by hand" that the
  charge ledger (point 550) was built to abolish. It was deferred on 19.08.2026 with that reason
  named, so point 732 could land; the defer is a logged exception, not a pass.
  FINAL STATE:
  - THE CAP CANNOT PRODUCE AN UNCLOSABLE RUN. Either a run that would truncate its result lines
    FAILS LOUDLY as an incomplete recording rather than half-recording itself, or the cap stops
    applying to RED lines — they are the few lines whose loss costs everything, and a run's reds
    are bounded by its checks, not by its chatter. Which of the two is chosen is decided by
    measurement of how large a real red set actually gets, not by taste.
  - AN ALREADY-BROKEN RUN HAS A NAMED WAY OUT that is not a silent waiver: a run whose reds are
    provably unrecorded is closable AS THAT — recorded as an incomplete recording, with the
    evidence, so it stops blocking without ever being mistaken for a green.
  - THE GUARD SAYS WHICH IT IS. Today it reports "unexplained red" for a run that has no
    explanation to give, which sends the reader hunting for a defect that was never captured. An
    incomplete recording must be named as one, distinct from a red nobody has explained yet.
  VERIFIABLE: Vitest over the pure decision — a run whose result lines hit the cap is classified
  as an incomplete recording and not as an unexplained red; a genuinely unexplained red still
  blocks; a closed incomplete recording no longer blocks a later render edit. Plus the real proof:
  the 17.08. runs stop blocking without a `--defer`.
  Criticality: medium — it blocks no player-visible behaviour, but it disarms the gate that keeps
  the picture honest, and a gate whose only exit is a hand waiver decays into a formality.
  Bundle: Session- & Repo-Hygiene.

- [ ] 733. The loading picture freezes about twice as long as its own budget allows (measured
  19.08.2026, 13:50 and 13:51, the first two runs after point 732 brought the picture lane back).
  MEASURED, twice, on `feat/732-verify-gpu-backend` at b2f6f5f5, backend WebGPU, frame written
  1/1: the `startup` suite's assertion "the loading picture never freezes longer than the balance
  budget (4000 ms, design.md §21.2)" fails with a worst standstill of 7632 / 8167 / 7833 / 7801 ms
  across the two runs' two sections — roughly 2x the budget. The breakdown is the same every time:
  blocked thread ~3.3 s, inside ONE animation frame ~2.3 s, unpainted ~7.8 s.
  IT IS NOT LOAD, and that was checked rather than assumed: the four readings sit within 7 % of
  each other across two runs at load average 3.1–4.7, where a load artefact scatters. It is also
  not new breakage — it is newly VISIBLE: the lane could not run on this host at all until 732, so
  this assertion had never been evaluated here.
  WHAT IS NOT YET KNOWN, and is the first half of the work: whether the freeze belongs to the APP
  (startup work on the main thread) or to the BACKEND the lane now uses. Point 732 restored the
  picture through ANGLE's surfaceless EGL route, and the WebGPU lane rides a COMPATIBILITY adapter
  there; a compat adapter's shader compilation could plausibly own the 2.3 s inside one frame. The
  two are distinguished by MEASUREMENT before anything is changed — the same run on the WebGL 2
  lane, and against the deployed build the user actually plays, decides which it is. Naming the
  wrong half here would rebuild the wrong thing.
  FINAL STATE:
  - THE CAUSE IS NAMED with a measurement that separates app from backend, and the answer is
    written down where the next reader finds it — including the case "the budget is right and the
    app is too slow" and the case "this backend cannot meet a budget written for another one",
    which have different remedies.
  - THE STANDSTILL COMES UNDER THE §21.2 BUDGET on the lane the player uses, or the budget is
    re-derived FROM A MEASUREMENT on the backends we actually ship and design.md §21.2 moves with
    it in the same commit. The budget is not simply raised to whatever the current number is: it
    is a promise to the player about the loading picture, so a raise needs the reason a player
    would accept.
  - THE 2.3 s INSIDE ONE ANIMATION FRAME is accounted for by name. A single frame holding the main
    thread that long is the sharpest clue in the reading and the most likely single cause.
  VERIFIABLE: `node scripts/verify/run-logged.mjs --suites startup` green on BOTH backends, and
  the measurement that separated app from backend recorded with its numbers, so a later regression
  can be compared against it rather than re-argued.
  Criticality: medium — it fails no player-visible correctness rule and the game does start, but
  it is a §21.2 promise the build currently breaks by 2x, and it keeps the `startup` suite red,
  which is the suite every other run is judged beside.
  Bundle: Session- & Repo-Hygiene.

- [ ] 730. The board's queue estimates are calibrated for a slower batch than the one running
  (user 19.08.2026, reading the live board: »Seit den Umstellungen gestern scheint die
  Abarbeitung der Punkte schneller zu laufen als bisher. Die Schätzungen der zukünftigen Tasks
  sind daher vermutlich übertrieben lange. Prüfe das und überarbeite sie wo notwendig.«).
  MEASURED 19.08.2026 from the first-parent merges: the eleven points landed between 623
  (18.08., 20:23) and 701 (19.08., 11:55) took 15.5 h of wall clock — one landing every ~1.4 h —
  against 32.1 h for the eight before them (628 → 623), one every ~4.0 h. The 316 cards in
  `.claude/board-queue.json` carry a median estimate of 3 h and a mean of 3.0 h, 952 h in total,
  and not one of them was derived from a measurement. An estimate is DEFINED in
  `scripts/dashboard-guard-core.mjs` as the time by which the work is VISIBLY DONE — merged,
  verified, board updated — so it is a falsifiable promise to the reader, and it is currently
  wrong in one direction for the whole queue.
  FINAL STATE:
  - THE CALIBRATION IS MEASURED, NOT GUESSED. One command reads the landed points out of git and
    reports, as a DISTRIBUTION rather than an average, the actual elapsed time per point (the
    branch's first commit to the TICK that marks the landing) beside the estimate that point's
    card carried, plus the queue-drain cadence (tick to tick), which is the smaller number
    whenever the pool ran several points at once. The two are reported separately and never
    averaged into one figure. BOTH ENDPOINTS ARE THE TICK, not the merge, and that is the whole
    of it: the estimate promises the time by which the work is VISIBLY DONE, and gate, picture
    check and board update all sit AFTER the merge. Measuring to the merge would calibrate the
    promise against a moment the reader never sees.
  - THE READING IS SPLIT BY WHAT ACTUALLY DISTINGUISHES A POINT — its criticality tag, whether it
    was delegated or authored in the main session, and whether a picture verification was part of
    it. A single global correction factor is adopted ONLY if the measurement shows the classes do
    not differ; otherwise each class carries its own.
  - THE STORED ESTIMATES ARE REWRITTEN FROM THAT READING for every open point, as a machine step
    over `.claude/board-queue.json` through the existing `board-queue.mjs set <N> --estimate`
    path, never a hand pass over 200 cards. What it wrote is printed per card, so the change is
    reviewable in one screen, and a card whose class has NO landed comparable keeps its estimate
    with that reason named rather than being moved on a guess.
  - A NEW CARD INHERITS THE MEASURED DEFAULT: filing a point without an estimate takes the
    measured median of its class, and the existing "no estimate yet" marker stays for the case
    where no class fits.
  - THE READING STAYS REPEATABLE. Re-run later, the same command says whether the estimates still
    match the batch's speed, so the NEXT shift is noticed rather than assumed; every run names
    the measurement window it used.
  VERIFIABLE: the command runs on the real merge history and prints the per-point
  estimate-versus-actual distribution and the cadence beside it; after the rewrite no estimate in
  `.claude/board-queue.json` contradicts the measurement by more than the reported spread; Vitest
  over the pure comparison, the class split and the rewrite plan with recorded fixtures —
  including a case where the classes differ enough that a single global factor is REFUSED, and a
  case where a class has no landed comparable and its cards keep their estimate with a named
  reason.
  A MEASUREMENT OF THE SPEED-UP ITSELF ALREADY EXISTS — take it as the starting point rather
  than raising it again (measured 19.08.2026 from the merge history and
  `.claude/mechanism-reviews.jsonl`). Not only the cadence moved: the per-point branch runtime
  collapsed, 6.4/12.9/17.3/29.4/31.9 h on 17.–18.08. against 0.2–1.3 h on 19.08. Parallelism is
  NOT the cause — the 19.08. points ran with FEWER concurrent branches. The cause is the review
  loop: 86 do-not-merge against 26 merge on 18.08., while every point landed on 19.08. cleared in
  ONE round, and those 18.08. rejections were MECHANICAL rather than substantive (the ledger
  quotes "files listed in the diffstat were not included"). The break sits exactly at 19.08.
  03:26, where points 714 → 717 → 684 fixed the review material.
  TWO CONFOUNDERS THAT BIND THIS POINT: the window is n=8, all process/infrastructure points of
  middling size with NO render point carrying a picture check in it — the picture lane was broken
  and unnoticed until 19.08. (points 732/733) — so the factor must NOT be carried over to render
  points; and point 713 still stands at 14 do-not-merge, so the loop is not universally healed.
  Both belong in the reading as named limits, not as a footnote.
  Criticality: medium — nothing in the code depends on an estimate, but the board is what the
  user plans by, and a queue that promises 952 h for work running at three times that speed
  misinforms every reading of it.
  Bundle: Chat & Tafel.

- [ ] 713. The board's now-section answers to nothing, so it stood empty while three strands were
  in flight (user 17.08.2026, reading the live board: »Die Sektion Woran ich gerade arbeite ist
  leer. Soll das so sein?«; and at 20:07: »Lege einen neuen Punkt an, um das Problem mit dem
  inkonsistenten Dashboard zu beheben.«). MEASURED the same evening, twice: at 19:59 the section was
  EMPTY while three points were in flight; at 20:07 the published board carried exactly ONE card —
  point 700 — while the owner's own in-flight declaration named THREE handed-over strands, all
  pushed and none merged (700 `feat/700-context-fence@4f988b03`, 697
  `feat/697-goat-foot-planting@82b9bdf1`, 711 `feat/711-deploy-retry@808b76a`). The board understated
  the live state by two of three points, and the reader it is written for concluded that nothing was
  running — which is worse than a stale card, because a wrong emptiness reads as "the batch stopped".
  THE GAP IS A MISSING TIE, NOT A FORGOTTEN EDIT. The rule already exists (memory
  `dashboard-multiple-now-cards`: one now-card PER point in active work) and the board guards already
  enforce conciseness, one topic per card, honest done-claims, queue completeness and the queue's
  agreement with the work order. NONE of them looks at the now-section's COMPLETENESS, and nothing
  compares it against the in-flight declaration — the one record that already knows what is being
  worked, by branch and worktree evidence. The queue was single-sourced by points 590/608; this
  section is the last part of the board with no source but a hand.
  FINAL STATE:
  - THE SET OF NOW-CARDS IS DERIVED, THE PROSE IS AUTHORED — the same split the Warteschlange already
    uses. A render reads the in-flight declaration (its `evidence` branches and worktrees, and the
    open `feat/<N>-…` branches) and makes the section carry exactly one card per point in active
    work: it CREATES a stub card for a point that has none and REMOVES one whose point is no longer
    in flight. The card's text stays written by hand.
  - AN EXISTING CARD'S PROSE SURVIVES THE RENDER — point 491's lesson applied before it can be
    repeated: a projection that regenerates the section must never blank text a session wrote, and a
    render that would drop prose refuses or restores it. A created card is a STUB that says it needs
    its text, so an unwritten card is visibly unwritten rather than silently empty.
  - AN EMPTY SECTION IS EITHER TRUE OR BLOCKED. While anything is in flight, an empty now-section
    blocks the turn end, naming the missing point numbers. When genuinely nothing is in flight, the
    section SAYS so in one card, so the reader can tell "nothing is running" from "nobody wrote it" —
    today those two look identical, and the user read the second as the first.
  - THE HANDOVER STATE GETS ITS ANSWER, which point 700's spec leaves open: the unnumbered handover
    card is legitimate BESIDE the numbered cards, never instead of them. That also settles the red it
    names — `scripts/board-core.test.mjs` ("promotes, returns, archives and answers without a new
    violation") fails with `dup-in-section` only when the unnumbered card stands ALONE, and under this
    rule a numbered card always stands there while work is in flight. Point 700's clause is answered
    here rather than decided twice, and is struck from its spec in the commit that lands this.
  - WHICH now-card the focus points at is decided, not left to insertion order. Measured 17.08.2026,
    with two legitimate now-cards standing (700 and 697): `board.mjs now` PREPENDS, while the focus
    reconciliation reads the FIRST card in the section — so opening a second strand silently moved the
    focus to it, `board.mjs focus 700` answered `the dashboard now-card is titled 697`, and the only
    way to point the focus back at the older strand was to reorder the two cards by hand in the file.
    A rule that sanctions several now-cards must let the focus name WHICH of them it means: the
    reconciliation matches the declared focus against ANY now-card present, and the section's order is
    the render's to decide (the focused strand first), never a side effect of which card was touched
    last.
  - The check STANDS DOWN for a session that does not own the batch lock (`heldByOtherLiveOwner`) and
    for a paused batch (`.claude/batch-paused`), and fails OPEN on its own error. The decision logic
    is pure and lives beside the board's other cores; the wrapper stays thin I/O.
  CONSTRAINTS: the BINDING four-section structure of the board is not touched (memory
  `batch-dashboard-artifact`) — this point changes what FILLS the now-section, never the sections
  themselves. No second record of what is in flight: the declaration from `scripts/batch-in-flight.mjs`
  is the source and nothing new is hand-maintained beside it. The board CLI is not parallel-safe
  (memory `board-cli-is-not-parallel-safe`), so the render must never run concurrently with another
  `board.mjs` call and this point must not introduce a path that does.
  VERIFIABLE: pure Vitest over the real 17.08.2026 state — a declaration naming 700/697/711 against a
  section holding only 700 is reported incomplete and names 697 and 711; an empty section with those
  three in flight blocks; an empty section with nothing in flight is accepted only with the explicit
  "nothing running" card; a render creates the two missing stubs without touching 700's prose; a
  render that would blank existing prose refuses; a card for a point no longer in flight is removed;
  the unnumbered handover card beside a numbered one passes and alone does not; a non-owner session
  and a paused batch are waved through.
  A SECOND, BLIND SPECIFICATION EXISTS and is owed a counted merge BEFORE this point is built (user
  17.08.2026: »Lasse Sol das auch nochmal blind spezifizieren.«). Both halves stand in
  `docs/blind-713/` (list-a, Opus 5, 14 entries; list-b, Sol, 21 entries; material.md, the shared
  input; rescued from git-ignored `local/` on 18.08.2026, point 723's U16) and `blind-merge.mjs`
  reports 0 identical against 56 candidate pairs. Per CLAUDE.md §6 the
  merge goes to a model that wrote NEITHER list and is recorded with `--union … --merged-by`, every
  entry accounted for. Four of Sol's entries CONTRADICT the wording above and the merge decides them,
  it does not average them: only the structured record may create a card (a `feat/<N>` branch absent
  from it creates none); the empty state is a parser-distinct NON-card element rather than a "nothing
  running" card, which also keeps the duplicate audit honest; the exact-set check runs at PUBLISH
  time as one serialized operation, with a failed publish a named non-zero obligation; and the split
  failure mode — the Stop hook fails OPEN, the publish preflight fails CLOSED, because no publication
  beats a knowingly false board. Sol also rates the point CRITICAL against the MEDIUM-HIGH below.
  Criticality: MEDIUM-HIGH for the user-facing half of the batch — this section is what the user reads
  to know whether anything is happening at all, and it told him the opposite of the truth. Both a
  guard core and the board render change, so the other model's recorded review is required before the
  merge (`mechanism-review-guard`).
  Bundle: Chat & Tafel.

- [ ] 705. The board is republished once per guard correction, instead of once at the end
  (measured 17.08.2026). One session published the whole board about a dozen times in fifty
  minutes, and that is not carelessness but the design. `scripts/board.mjs` couples the card
  edit and the publish into one step — its `edit()` applies the transform, rotates the archive
  and publishes — and there is no edit-without-publish mode at all. The guard chain then
  multiplies it: `board-first-guard`, `dashboard-guard`'s focus reconcile,
  `dashboard-conciseness-guard`, `dashboard-card-topic-guard` and `queue-order-guard` each
  demanded a correction one after another, and every correction was another publish plus another
  commit on `refs/heads/board`.
  WHAT THIS POINT IS NOT: it is not the cause of the HTTP 429 that took the board offline the
  same day. That was measured separately and is a READ limit on `raw.githubusercontent.com`
  covering the whole repository — `main/README.md` and `main/package.json`, which nobody
  published, answered 429 in the same minute as `board/board.html`. Publishing pushes to
  `github.com` and spends none of that quota. The reading side is point 704's subject; this
  point stands on its own cost — a dozen full-board publishes per session, each one a commit,
  a push and a model call in a context that is already large.
  FINAL STATE:
  - `board.mjs` gains a staged mode in which several card edits accumulate in the file and the
    publish is one explicit closing step. The one-shot form stays the default for a single edit,
    so no caller has to learn a new protocol for the common case.
  - The board checks run TOGETHER against the FILE before that one publish, so every objection
    appears in one pass instead of one per turn. `guard-preflight.mjs` already does nearly this —
    it named all three board guards in a single call — so the staged publish asks it, rather than
    discovering the guards one refusal at a time.
  - A ceiling on publishes per turn that ABORTS LOUDLY when it is reached, naming what was
    published and what was refused. A rate that silently keeps writing is how the quota was spent
    without anyone noticing.
  VERIFIABLE: Vitest over the staged controller — several edits accumulate with no publish, the
  closing step publishes once, the ceiling aborts on the publish past the limit and names both
  sides; plus a driven run of the sequence that produced this finding (a card edit that five
  guards object to in turn) ending with exactly one publish.
  Criticality: medium — it spends a shared quota the user's only window depends on, and the
  failure is invisible to the session that causes it.
  Bundle: Chat & Tafel.

- [ ] 708. Only the landing is one command; the beginning and the turn's end are hand-driven chains
  (analysed 17.08.2026 against the code). The project knows the pattern: `land-point.mjs` drives 15
  steps — merge, gate, tick, archive, push, board, cleanup — as ONE command, and CLAUDE.md calls it
  out as "The landing is ONE command". What was bundled is the RARE, dangerous end. What runs MANY
  times per point stayed unbundled, and four gaps were measured:
  (1) THE SESSION BOUNDARY prints a card it could set itself — `batch-boundary.mjs` composes the text
  via `boundaryCardText`, imports `PUBLISH_CMD` and has `execFileSync`, but neither puts the card up
  nor publishes; that cost three refused `--commit` runs in one day (card missing, card naming no
  point, card byte-identical inside the same minute) plus a correction for card brevity. THE TWO
  SIDES ALSO CONTRADICT EACH OTHER, measured 19.08.2026 at the boundary of point 726: `--prepare`
  prints its card text as "take this text verbatim" and states that it names NO point number ON
  PURPOSE, while `board.mjs none` REFUSES exactly that text ("its reason must NAME the point the
  batch picks up next"). A session that follows the printed instruction verbatim is blocked, and
  the only reason this one was not is that `board.mjs done <N> --none` had already put a
  point-naming card up a step earlier. So the command that owns the card must own its WORDING too:
  one text, satisfying the gate that judges it, rather than two mechanisms disagreeing about what
  the handover card must say.
  (2) FILING A POINT is about ten calls with no helper at all: append to TASKS.md, `tasks-spec-guard`,
  `tasks-archive-guard`, `doc-budget-guard`, commit, push, `board-queue set` for title, body and
  estimate, render the queue, publish the board, `queue-rank --ranked`. No script in the tree appends
  a point, and `queue-order-guard` blocks the turn end when the ranking step is missing — so the chain
  is MANDATORY and still unbundled. It ran three times in one day.
  (3) HANDING A POINT OUT is three calls with no helper: `git worktree add -b feat/<n>-<slug>`,
  `worktree-bootstrap.mjs`, `author-sol.mjs --point` — and `author-sol` explicitly demands an existing
  worktree and branch. There are 15 bundled steps for the END and none for the BEGINNING.
  (4) THE TURN'S END has no command at all: `focus set`, `board-publish`, `dashboard-guard --synced`,
  `board.mjs attest`, `guard-preflight`. `attest` bundles three of them, but neither the publish nor
  the focus, and `batch-progress-guard` alone names seven different commands across its remedies.
  FINAL STATE: one command per sequence, built like `land-point.mjs` — fixed order, one verdict per
  step, STOPS at the first red, leaves no half state and bypasses no guard. Built in this order, by
  how often each runs: (2) file a point, (4) end the turn, (1) take the boundary, (3) hand a point out.
  Each carries a `--dry` that prints the plan without touching anything, as the landing does.
  BUILD NOTES (18.08.2026, point 723's counted union U6/U7): the end-turn command ADOPTS point
  705's staged board mode — one combined guard pass and exactly ONE checked publish — and never
  re-implements them; 705 lands first, dependency-ordered. And the file-a-point command must not
  paper over point 706's silent argument loss: it issues the three well-formed board-queue calls,
  or lands 706's parser refusal first if that proves trivial.
  VERIFIABLE: Vitest over each sequence's pure plan — the step list, the stop-at-first-red behaviour
  and the `--dry` output; plus one driven run per command against a fixture repository, ending in the
  state the hand-driven chain produced.
  Criticality: medium — it is the per-point overhead of every session, and each hand-driven chain is
  a place a step gets forgotten.
  Bundle: Session- & Repo-Hygiene.

- [ ] 553. An explicit context budget per point, and a written handoff when it is spent
  (08.08.2026, chosen BY MEASUREMENT as point 373 requires — the closing measurement is
  recorded in `docs/batch-autonomy.md`, "The closing measurement under the built levers").
  THE STATE THE MEASUREMENT LEAVES: under the boundary and the bounded verify digest the
  rate is 0.988 %/h in the honest full scope (1.091 %/h top-level only), against the
  ~0.6 %/h that fits the weekly quota — about 1.6× the ceiling, so a further lever is owed.
  WHY THIS LEVER AND NOT THE OTHERS, from the same figures: 62 % of the counted turns and
  58 % of the weighted spend come from DELEGATED-AGENT transcripts, so option (b) — moving
  the reading-heavy part of a point into an agent — only RELOCATES the cost unless the
  agent's own context is bounded too, and option (a), a boundary at a bundle member, cuts
  where the bundle scheme no longer claims a saving (`docs/work-packages.md`). Option (c)
  cuts inside both, which is why it is the one built here.
  WHAT IS BUILT: a context budget that is MEASURED, not estimated, and that applies to the
  main session AND to a delegated agent.
  (a) THE BUDGET IS READ FROM THE SAME PLACE THE MEASUREMENT IS — the turn's context size,
  derived by the pure core `scripts/measure-context-cost-core.mjs` already uses, so a
  second accounting is never invented. A calibratable ceiling per point sits with the other
  batch constants, and the shipped starting value is justified against the measured
  distribution (median peak 153k, p90 307k in the full scope), not guessed.
  (b) THE HANDOFF IS WRITTEN, NOT IMPLIED. On crossing the ceiling mid-point the session
  writes a handoff — what the point is, what is done, what the next session must do first,
  the branch and the last commit — through a command (`scripts/point-handoff.mjs`) that
  owns the file's shape, and ENDS. `batch-resume-hook` hands the successor that handoff the
  way it hands a fresh session the work order, so the successor resumes the POINT rather
  than re-deriving it. A handoff that names no branch or no next action is refused at the
  writing, not discovered at the reading.
  (c) A DELEGATED AGENT OBEYS THE SAME CEILING. Its brief carries the budget, and an agent
  that spends it returns its handoff as its report instead of building on; the parent
  re-delegates from that handoff. An agent silently continuing past the ceiling is the case
  that makes the whole lever cosmetic, so the parent CHECKS the returned report against the
  agent's own transcript size rather than trusting the claim.
  (d) `batch-progress-guard` LEARNS THE THIRD LEGAL STOP. Ending is already legal at a
  closed point with an armed launcher; a spent budget with a written handoff and an armed
  launcher joins it. Every other stop stays illegal, so the guard can never be talked into
  an idle stop by writing a handoff for work that was never started.
  (e) AN ORPHANED BRANCH IS SURFACED, NOT LEFT TO CHANCE. The handoff covers the session
  that hands over deliberately; it does nothing for the agent that dies without one, and
  that is the case that actually cost work. MEASURED 19.08.2026 09:20 on `main`, by a
  resuming session that ran `git worktree list` on a hunch — the same hunch that first
  found the problem on 11.08.: SEVEN feature branches carry commits `main` does not
  contain, with no process behind any of them — `feat/687-roam-bound-fixes` (45),
  `feat/687-bank-game` (35), `feat/713-now-section-derived` (25), `feat/686-five-word-lexicon`
  (14), `feat/595-598-verification-ladder-brief` (6), `feat/336-croc-staging` (5),
  `feat/581-settlement-boundary-contrast` (3). Nothing reports them, so the work reads as
  untouched from the work order while it sits built in the tree. THE SECOND COST IS THE
  DELEGATION: every point disjoint enough to fill a free pool slot is one of these
  branches, so a free slot cannot be filled by a fresh agent at all — it needs a careful
  REVIVAL (merge `main` in, verify on the synced state, land) that nobody is prompted to
  do. So the resume path REPORTS every branch that has commits `main` does not contain and
  no live agent behind it, with its point, its last commit and its age, exactly as it
  reports the work order, and names the revival as the action; and a branch whose work has
  landed under another number is ENDED at that landing rather than left to be re-triaged.
  VERIFIABLE by Vitest on the pure core — an orphan is listed, a branch with a live agent
  is not, a contained branch is not — plus the resume hook printing it.
  MEASURE THE RESULT, as 373 did and on the same tool: `node scripts/measure-context-cost.mjs`
  for a full day after the lever lands, in BOTH scopes, against the 0.988 %/h this point
  starts from and the 0.6 %/h that fits. The point counts as delivered when the rate is
  measured and reported honestly — met or not — never when the mechanism merely runs.
  VERIFIABLE: pure Vitest on the decision core — a session under the ceiling continues; one
  over it with a written handoff and an armed launcher may stop; one over it with NO handoff
  blocks; a handoff missing its branch or its next action is refused; an unreadable
  transcript ALLOWS the stop (fail-open, as every guard here). Live: one point actually
  handed over mid-way and finished by the successor from the handoff alone.
  MECHANISM REVIEW REQUIRED (CLAUDE.md §7.2): this changes a guard.
  FOLDED IN FROM POINT 572 (measure 10, "the window boundary inside a point"): that
  proposal is this lever, differing only in the cut TRIGGER and in demanding a pilot, so
  it is decided HERE rather than appended as a second owner. THE TRIGGER QUESTION: cut at
  every green, pushed commit, or at the measured context ceiling this point already
  defines? Whichever is chosen, it is PILOTED on ONE point and MEASURED against the median
  (`measure-task-cost.mjs --tasks`) before any rollout, and the rollout is a separate
  decision taken on that measurement. ACCEPTANCE: a session after a cut continues WITHOUT
  ASKING A QUESTION — if that does not hold, the pilot is reported as FAILED rather than
  tuned. Measured target: context per response is a median of 190k and re-read context is
  75.8 % of the weighted spend; a cut every ~60 responses would put the mean context near
  73k. This is the one measure on the list that can silently lower work quality — what an
  agent has learned and not written down is lost at the cut — which is why it is piloted
  and measured rather than adopted.
  FOLDED IN FROM POINT 662 (18.08.2026, point 723's counted union U11 — the boundary without a
  tick; user 12.08.2026: "Außerdem ist der Kontext dieser Session wieder ziemlich groß geworden.
  Hättest du in der Zwischenzeit nicht mal an eine andere übergeben können? So bekommen wir das
  sonst nie in den Griff."). The boundary duty was keyed to a TICKED point, so a point landing in
  halves or a day of review rounds on one branch never produced a tick — one session carried the
  batch ~14 hours and >150k context while every rule held, and the 656 landing WAS a tickable
  boundary the session ignored. The merged final state keeps both of 662's demands under THIS
  point's measured budget: (1) after any MERGE to main (ticked or not) with no delegated agent in
  flight, `batch-progress-guard` demands the boundary exactly as it does after a tick — a merge
  is a clean handover point by definition; (2) the held-too-long ceiling IS the measured context
  ceiling this point already defines — 662's "hours or landed merges, not tokens the scripts
  cannot read" premise went stale when point 700's fence made the context measurable — and past
  it the guard refuses "continue the next queue item" while allowing the boundary path. Attended
  sessions ask for /clear at the same moments. VERIFIABLE (beside the cases above): a merge
  without a tick and no agent in flight demands the boundary; under the ceiling it does not; the
  ceiling case refuses the continue-path and allows the boundary path.
  Criticality: high — this is the batch's dominant running cost, and a lever that reports
  a saving it did not make is worse than none: it retires the question. The measurement is
  therefore part of the delivery, not a follow-up.
  AND IT BINDS THE ATTENDED SESSION, NOT ONLY A DELEGATED POINT (measured 10.08.2026).
  One attended session absorbed SIX separate user requests plus the two full reports of a
  blind-parallel analysis in a SINGLE stretch — a dashboard question that grew into a
  re-ranking, a release re-gating, a work-order cleanup and five branch landings. Nothing
  stopped it, because every existing ceiling is written for a delegated point and the
  boundary rule fires only at a CLOSED point, which an attended session in the middle of a
  conversation never reaches. FINAL STATE: the same budget mechanism counts an attended
  session's spend, and on crossing the ceiling the Stop chain requires ONE of two answers
  before the turn may end — the written handoff and a boundary, or a stated reason why this
  stretch must continue (a merge in flight, a user waiting on this very answer). A NEW topic
  that is not a continuation of the current one may not be started past the ceiling; it is
  APPENDED to the work order and taken by the next session. The ceiling is measured, not
  guessed: it is derived from the same recorded spend this point already reads.

- [ ] 596. The tail is visible while it runs (point 572's measure 6). A point's running
  cost is measurable DURING the point, not only after it: a hook reports when a branch
  passes three times the median (≈ 17 M weighted), and that report is a DECISION point —
  re-cut, re-staff, or continue deliberately — never an automatic abort. In the same
  mechanism, an agent that has run the same browser suite red three times STOPS, writes a
  diagnosis of what is red and what was tried, and escalates instead of looping.
  MEASURED TARGET: 10 of 64 points carry 48.8 % of the point-assigned cost, the costliest
  single point 15.8 % of it with 89.0 % of that in verification.
  THE DIAGNOSIS MUST LAND WHERE THE SUCCESSOR LOOKS — on the work order or the board, not
  only inside the agent's report, which nobody reads again. Otherwise the next attempt is
  the same attempt.
  THE AUTOMATIC ABORT IS REFUSED, and the refusal is recorded here so it is not proposed a
  fourth time: a hard turn cap or a four-hour timeout discards work that may be nearly done
  AND pays a second 5.0 M build socle against a 5.82 M median point; its progress metric
  ("share of tests passed") is a proxy, and judging by a proxy is the one thing this project
  does not trade. Our tail points were expensive because the work was hard — the costliest
  carried 89 % verification — not because a loop ran away.
  A WALL-CLOCK TRIGGER may join the token trigger once point 599 delivers an honest calendar
  decomposition; until then there is no honest wall-clock per point to trigger on.
  A SILENT RUN IS THE THIRD TRIGGER, AND IT IS THE ONE THAT ACTUALLY BLED (measured
  13.08.2026, ~09:00). On point 657 the third measurement recording produced NO BYTE of
  output from 02:32 onwards, and the owning session waited on it in 30-second polls past
  09:00 — six and a half hours spent on a task that was already dead. Nothing puts a
  DEADLINE on a background recording, nothing harvests a task that stopped writing, and the
  hand-over the board card itself promised ("should the agent fail again, the fallback model
  takes it") had no enforcer behind it. So: a delegated run that has written nothing for
  longer than a calibratable silence window is REPORTED as stalled at the next hook (with
  its task id, its last output time and its point), the owner is handed the two legal moves
  — re-run or hand to the fallback model — and the stall lands where the successor looks,
  on the work order or the board, exactly as the red-three-times diagnosis does. This is NOT
  the refused automatic abort: nothing is killed on a timer, the silence is only made
  VISIBLE, because the cost here was not the dead task but the six hours nobody was told.
  Point 567 (remains of killed runs) owns the reaping; this point owns the report.
  Criticality: medium — a cap that let a red state pass as green would be worse than the
  cost it saves, so the escalation path is the mechanism and the abort is not.
  NOT ON ITS BRANCH 17.08.2026: `feat/595-598-verification-ladder-brief` is named for this point
  but contains NOTHING of it — measured by reading the whole net diff. It must be built, here or
  on its own branch; the shared branch lands 595 and 598 alone.

- [ ] 706. The queue commands lose the card text one way and re-write a blocked one the other
  (measured 17.08.2026 against the code and the stored state, while filing points). `parseSetArgs`
  in `scripts/board-queue-core.mjs` treats `--title`/`--estimate` as a MODE switch and pushes every
  following argument into THAT bucket (`buckets[field].push(a)`). So `set 702 --estimate "~2 h"
  "<prose>"` files the prose under `estimate`, where `setQueueEntry` discards it while normalising —
  what remains stored is `~2 h`, and the card text was never there. The command reported `estimate
  for point 702 stored` and said nothing about the swallowed argument. The cost is not only the lost
  text: it forces three calls per card (title, body, estimate) instead of the ONE the usage line
  offers, and with the edit-publish coupling each of those was another publish.
  FINAL STATE:
  - An argument the parser does not use as what the caller plainly meant is REFUSED LOUDLY instead
    of dropped: text after `--estimate` that does not read as a duration aborts and names the right
    order. The same holds for `--title` followed by more than a title.
  - The success line names EVERY field it set, so a missing one is visible in the output.
  - `queue <N>` on a point that IS the standing now-card does not silently empty the now section.
    Measured 17.08.2026: refreshing the stale queue text of the point in active work moved the card
    OUT of "Woran ich gerade arbeite" and reported `700 returned to the queue`, leaving that section
    blank — the exact state point 713 exists to prevent — and the next `now <N>` then failed with
    `no queue card for point 700`, because the round trip had consumed the queue card the command
    reads from. Either the queue text of a point in active work is editable WITHOUT unseating its
    now-card, or the attempt is refused and names `status <N>` as the way to restate it; a command
    that moves a card between sections says which section it left.
  - The REBUILD does not write a card the card guard then blocks. Measured 17.08.2026: a queue
    rebuild regenerates every card body from the work-order spec, and a spec that names another
    point therefore lands in the card verbatim — `dashboard-card-topic-guard` blocked the turn end
    on a cross-point sentence the rebuild had just written, and the hand-fix in the board file
    survives only until the next rebuild. The generator strips or rewrites the cross-point passage
    the way the guard demands, so a rebuilt board is publishable without a hand pass.
  VERIFIABLE: Vitest over `parseSetArgs` with exactly this call — the mixed form refused with the
  correct order named, the well-formed three-field call accepted, and the success line listing each
  field it wrote; plus a case that renders a spec naming another point and asserts the generated
  card body passes the card-topic rule; plus a case that edits the queue text of the point holding
  the now-card and asserts the now section still holds it afterwards.
  PLACEMENT AND SUBSUMPTION (18.08.2026, point 723's counted union U8/U17): moved behind the
  token-reduction levers on the user's 17.08 word (token reduction outranks low bookkeeping), and
  point 713 lands first — its derived now-section re-creates the card `queue <N>` unseats, so the
  third bullet shrinks to a regression test once 713 is in; the parser and rebuild-card halves
  stay this point's own work.
  Criticality: low — one command's argument handling, but it silently discards the user-visible
  text of a board card.
  Bundle: Chat & Tafel.

- [ ] 710. The remaining forty-five sequences of the multi-step analysis are worked into the
  order, bundle-first (the blind-parallel stage of 17.08.2026, run on the user's instruction).
  The union in `docs/multistep-analysis-17-08/multistep-union.json` holds 57 accounted entries
  (rescued from git-ignored `local/` on 18.08.2026, point 723's U16); its six priority findings
  already resolve to points 700, 701, 705, 707 and 708, but 45 entries named only by Sol's list
  stand nowhere in the work order, each with its own defect line.
  FINAL STATE:
  - Every union entry is either MAPPED to a standing point (named in the mapping), FILED into an
    existing bundle per bundle-first (a new point only where no bundle fits), or REJECTED with a
    one-line reason. The mapping is committed under `docs/` so it survives the checkout.
  - The analysis artefacts (lists A and B and the union) move with it into the repository, since
    they are now the evidence a committed mapping cites.
  - Priority follows the user's instruction of 17.08.2026: process cleanup, redundant consumption
    and session sizes first; nothing is filed as a feature point.
  VERIFIABLE: the committed mapping accounts for all 57 ids — a Vitest case over the mapping file
  checks the id set against the union and fails on an unaccounted entry.
  Criticality: low — it is bookkeeping over an existing analysis, but losing it silently would
  discard a paid-for four-eyes stage.
  Bundle: Session- & Repo-Hygiene.

- [ ] 595. The verification ladder (point 572's measure 5). While a render point is still
  being FIXED, only the cheapest covering suite runs, on the everyday WebGPU lane; the
  full proof — both backends where they can differ, LARGE where the change warrants it —
  runs exactly ONCE, on the EXACT MERGE CANDIDATE — `main` merged into the branch, the tree
  that will land — with the recorded `git HEAD` of that run as the evidence that the verified
  tree IS the merged one. Nothing enforces or measures that today. The expensive browser
  suites abort at the FIRST failure during that iteration (a red run is never credited
  anyway) and run to completion only for the final proof. The rule is a brief building block
  for render points, so it is applied rather than remembered.
  A RED IS A RED. No "critical versus cosmetic" class is introduced to decide what may be
  aborted on — the classification buys nothing here, because an iteration run is not credited
  either way, and it would open the door to waving a red through.
  THE SHARED FINAL RUN IS ALREADY DECIDED, and this point must not be read as contradicting
  it: `docs/work-packages.md` settled that several FINISHED per-point branches may be merged
  together and ONE regression run over the merged result — "the only sizeable saving left".
  What that shared run may replace is the repeated full REGRESSION. The both-backend PICTURE
  proof stays on the branch, BEFORE the merge, exactly as it is today; merging first to
  verify afterwards cost about thirty turns of a block-loop on 24.07.2026.
  THE UNIT LAYER HAS THE SAME LADDER: `vitest --changed` or a path filter and
  `tsc --incremental` are legal WHILE REPAIRING, and an incremental green is never an
  acceptance — the full fast gate stays the proof. One rule covering both layers, not two
  half-rules.
  MEASURED TARGET: verification is 47.0 % of the weighted spend and 37.4 % of the machine
  hours, the ten costliest points hold 64.4 % of all point-assigned verification tokens,
  and eight of ten recorded `enrichments` runs failed while still writing all 37 frames at
  951–1029 s each.
  THE LADDER'S CHEAPEST RUNG ALREADY EXISTS AND IS UNUSED (user question 09.08.2026: "Und
  die neuen Möglichkeiten für differenziertes Testen durch 566 werden auch inzwischen bei
  den Feature- und Bugtests eingesetzt?"). Point 566 built `--section=<name>`, and
  `enrichments` declares nine of them; the resolver, the PARTIAL marking and the refusal to
  count a partial run as coverage all work. CHECKED 09.08.2026: nothing routes anyone to
  it. It appears in `scripts/verify/README.md` and in `tiers.mjs`, in no delegation brief,
  in no agent prompt and in no rule text — the three agents commissioned that same evening
  were not told about it either — and the recorded render-verify runs contain no partial
  run at all. So the ladder's bottom rung is not a thing to invent here; it is a built
  tool to PUT IN THE PATH. This point therefore also: (a) makes `--section` the stated
  iteration rung for a render point in the delegation brief's building block, so an agent
  reaches for it before replaying a whole pass; (b) SECTIONS the remaining render suites,
  which 566 deferred ("enrichments first, then the other render suites"); and (c) states
  in the same building block that the final proof is whole-suite, so the cheap rung can
  never be mistaken for the acceptance.
  WORK FOR 595–598 ALREADY STANDS ON A BRANCH (11.08.2026). A session that died left
  `feat/595-598-verification-ladder-brief` PUSHED at 0d555552 — four commits plus a merge of
  `origin/main`, covering all four points — with its worktree
  `.claude/worktrees/agent-a7b6ba2cc654e6411` still in the tree. It was never reported,
  verified or landed. Whoever takes these points STARTS FROM THAT BRANCH and verifies it
  against the specs here; rebuilding from scratch throws away finished work. Cleaning that
  worktree away before the branch has been judged is what point 629 exists to prevent.
  Criticality: medium — it reorders the proof but must not dilute it; the both-backend
  picture proof stays exactly as binding as it is today.
  BRANCH STATE 17.08.2026: `feat/595-598-verification-ladder-brief` DELIVERS this point and is
  synced with main, gates green, pushed (five conflicts resolved, the real one in
  `scripts/verify/world.mjs` where main's point-585 check was kept verbatim). What it still owes
  before it can land: the both-backend picture proof — nine render-relevant suites were
  re-sectioned and `world.mjs` gained conflict-resolved code, and only ONE cheap browser suite
  (`health`, WebGPU) has been run on the merged state. The branch carries 596 and 597 in its
  NAME only; see their entries.

- [ ] 598. The brief orients in the code, not only in the spec (point 572's measure 8).
  The delegation brief carries a GENERATED orientation: the paths the specification itself
  names, and a per-directory line of responsibility derived from the tree and its file
  headers. It is marked as a HINT, never as an instruction ("the specification names these
  paths", not "change these files"), and it is generated on every run so it cannot go
  stale.
  AND IT NAMES THE PLANNED CHECK: which suite, and which `--section` of it, will verify this
  point — derived from the diff→suite mapping and the ladder rung, generated like the rest so
  it cannot go stale, and marked as a hint like the path list. This is the cheapest possible
  answer to what the ladder point found: a rung that is built and routed to nobody gets used
  when it stands in the artefact the agent reads FIRST, not in a rule it must remember.
  MEASURED TARGET: search/read is 25.2 % of the weighted spend and the first responses of
  a delegated agent are almost always search; five saved responses per point is ~2 % of a
  median point.
  NOT THE OPPOSITE DIRECTION: shrinking the brief was weighed and rejected on the arithmetic.
  Removing 1.5k tokens saves ~35.7k weighted per point, while a single reference the agent
  must then look up costs 22.9k — it breaks even at 1.5 extra lookups and goes negative
  after. The brief is 1.9 % of the spend and exists to avoid the ~108k wholesale read.
  Criticality: low — a wrong list would misdirect, which generation-from-the-tree and the
  hint framing address.
  BRANCH STATE 17.08.2026: `feat/595-598-verification-ladder-brief` DELIVERS this point and is
  synced with main, gates green, pushed (five conflicts resolved, the real one in
  `scripts/verify/world.mjs` where main's point-585 check was kept verbatim). What it still owes
  before it can land: the both-backend picture proof — nine render-relevant suites were
  re-sectioned and `world.mjs` gained conflict-resolved code, and only ONE cheap browser suite
  (`health`, WebGPU) has been run on the merged state. The branch carries 596 and 597 in its
  NAME only; see their entries.

- [ ] 581. The settlement boundary is too faint, and its slider is already at the ceiling
  (user 09.08.2026, F6 report `local/bugreports/DorfgrenzeSchlechtErkennbar.zip`: "Die
  Dorfgrenze ist zu schlecht erkennbar. Der Kontrast muss höher sein"). MEASURED from his
  state: `placeEdgeBand` stands at the shipped defaults, `widthM: 3`, `wanderM: 0.9`,
  `strength: 1` — and `strength` is documented as "0 (invisible) .. 1 (the full per-kind
  look)". He is therefore already looking at the STRONGEST edge the game can draw, and it
  is not enough. This is not a calibration miss: there is no knob left to turn, so the
  per-kind look itself carries too little contrast against the ground it sits on.
  FINAL STATE: the boundary READS at a glance from inside the settlement, at the walking
  pace and eye height the player actually has, in every settlement kind and on the ground
  colours they stand on — the Bambara village's pale sand is the case that failed, so it
  is the case that must be shown to work. The contrast comes from the band's own design
  (value against the surrounding ground, not hue alone — the report is from a sand-on-sand
  village), and it stays a give-way rather than becoming a painted stripe: the §2.6 look
  is a threshold the player reads, not a fence. `strength: 1` remains the full look, so
  the ceiling moves with the design rather than being raised past it.
  VERIFIABLE: the PICTURE decides, since the complaint is legibility — a first-person
  frame from inside the settlement at the boundary in at least the Bambara village and
  one contrasting settlement kind, on BOTH backends, judged by looking. Plus a pure test
  pinning the contrast the design settles on (the band's value against the sampled ground
  value stays above the chosen minimum for every settlement kind), so a later ground or
  palette change cannot quietly erase it again.
  Criticality: medium — the boundary is what tells the player where the settlement ends
  and the bird's-eye view resumes; §2.6 and criterion 15 both rest on it being legible.

- [ ] 336. The whole crocodile staging family is fragile — rebuild it, not one case
  AT A TIME (escalated 25.07.2026 after four consecutive runs each failed a DIFFERENT
  crocodile check). History: the lunge case was found resting on an unpinned
  assumption (its red turned out to be machine load, proven by a quiet-machine
  repeat) and was pinned; the next run failed the TOO-LATE case, where the parent
  arrived in time after all and the crocodile took it instead of the calf; that was
  pinned too; the next run failed the VANISH case with gripped:false — the crocodile
  never seized at all (diag: drink true, dist 0.1, crocLunge false). Fixing one case
  per run is a treadmill: the family shares one `crocDrama` helper whose five modes
  each depend on a different implicit precondition (a distance, an arrival time, a
  drink state, a lunge that must fire), and every one of them is a separate way for
  the staging to miss while the GAME behaves correctly.
  DO INSTEAD — one rebuild of the helper: (a) every mode states its preconditions
  EXPLICITLY and asserts them before measuring, so a miss reports "staging did not
  reach its precondition" instead of accusing the product; (b) every mode pins its
  outcome roll (rescue, lunge and too-late now do; vanish and sacrifice must too);
  (c) the seizure itself is established deterministically — poll for the grip with a
  generous sim budget and FAIL THE STAGING, not the behaviour, if it never happens;
  (d) each mode gets its own tiny setup helper instead of one branching function, so
  a change to one ending cannot shift another's timing (the point-311 lesson at test
  level). VERIFIABLE: enrichments green on BOTH backends THREE times in a row on a
  quiet machine — the flake-free bar the closing gate needs; a staging miss produces
  a distinct, self-naming failure message; the five §19.16 endings still each assert
  their real outcome (no masking). RELATED: this is the concrete first slice of point
  200's flake work, and point 294's auto-classification would have labelled all four
  reds "staging, not product" without a manual repeat each time.

- [ ] 715. The staged rewiring of the hook paths is finished, and the check accepts the defaulted
  anchor (measured 18.08.2026 against `scripts/guard-health-core.mjs` and `.claude/settings.json`).
  39 of the 41 hook entries stand as `node scripts/<x>.mjs` — cwd-relative — so a session whose
  working directory is not the repository root gets a non-blocking `Cannot find module` and the hook
  is silently dead while its rule still counts as covered.
  WHAT THIS IS NOT, recorded because I first filed it as one: this is NOT a check that certifies what
  it condemns. `RELATIVE_WIRING_ROLLOUT` in `guard-health-core.mjs` records every one of those 39 as
  the deliberate, staged rollout of point 438 — `.claude/settings.json` is a protected path, so each
  line is rewired by an ATTENDED session, the pilot (`lock-heartbeat-hook`) first and verified from a
  cwd outside the repo root, and a name leaves the list in the SAME commit that anchors its line. A
  newly wired hook that is neither anchored nor recorded is reported at once, which is exactly what
  happened to `rule-echo-guard`. So `guard-health`'s OK is honest, and what remains is not a blind
  check but an UNFINISHED rollout plus one gap in what the check recognises. I had confirmed Sol's
  count of 39 and inferred its conclusion without reading the rollout record — the count was right
  and the reading was wrong.
  FINAL STATE:
  - The rollout is CARRIED TO ITS END: every hook line is anchored and `RELATIVE_WIRING_ROLLOUT` is
    empty, each removal in the same commit as its anchoring, in the attended sessions the record
    itself prescribes. Until then the list stays the honest statement of what is left.
  - The DEFAULTED anchor form is recognised as anchored — `${CLAUDE_PROJECT_DIR:-.}/scripts/x.mjs`,
    which is the anchored path when the variable is set and degrades to the relative one when it is
    not, never worse than the bare form (whose unset expansion `/scripts/x.mjs` resolves nowhere from
    any cwd). DONE 18.08.2026 in `refAnchoring`, with the malformed-default case pinned as relative.
  VERIFIABLE: Vitest — a settings file with one unrecorded relative entry among anchored ones is
  reported; a name left in the rollout after its line was anchored is reported as a stale record; the
  defaulted form counts as anchored and a malformed default does not; and `RELATIVE_WIRING_ROLLOUT`
  being empty leaves the audit clean.
  NOTE ON EXECUTION: `.claude/settings.json` is a protected path whose edits prompt, so the remaining
  rewiring needs attended sessions and cannot be delegated to a headless batch run.
  ATTENDED-GATED (18.08.2026, point 723's counted union U10, a declared refinement of the user's
  18.08 ranking): placed behind the user's block — attended-only by this spec's own execution
  note, it must not jam the headless picker's front slots; a headless session skips it, an
  attended session takes it from here.
  Criticality: medium — the rollout is recorded and progressing, so nothing is silently uncovered;
  what is left is finishing it, not repairing a blind check.
  Bundle: unbundled (guard hygiene).

- [ ] 686. The taught language is five concepts, and the chief's message is four of them (user
  13.08.2026, playing the deployed communication slice).
  The user played the deployed communication slice on 13.08.2026 with the debug
  switch "Speech: show concepts instead of syllables" on and could learn nothing:
  "Ich erkenne da kein Fangspiel … Das Herumschicken wirkt wie zum Selbstzweck
  eingeführt", and about the adults "Selbst wenn ich diese Übersetzungen sehe,
  erkenne ich keinen Sinn hinter den Handlungen." The evening's conversation
  diagnosed the cause — the design taught eleven concepts through situations
  forced onto a game that cannot carry them — and rebuilt the whole slice around
  five words, two teaching places and one game per settlement kind. This point is
  one of six that carry that rebuild; they are specified together and read
  together.

  The six specifications were reviewed cross-vendor before filing (GPT-5.6 Sol at
  effort high, 13.08.2026, verdict do-not-merge on the first draft): it found two
  outright contradictions and, more valuable, three wrong readings a player could
  learn and still finish the puzzle with. What stands here is the corrected state.
  The taught language is FIVE concepts, and the chief's message is four of them.

  Final state:

  1. `src/communication/lexicon.ts` carries exactly `RIVER`, `UPSTREAM`,
     `DOWNSTREAM`, `ROCK`, `DIG` — no other concept exists in it. `ROCK` must read as
     a class of thing, not as the name of one boulder, because the player learns it
     on the village's play rocks and applies it to the boulder upstream.
  2. `SEQUENCE_LENGTH` BECOMES 4 (user 13.08.2026, replacing the five of
     11.08.2026, whose reason — eleven words in a four-syllable space — is gone).
     The inventory rule stands: any two utterances differ in at least TWO
     syllables, which is exactly the even-number-of-highs constraint the design
     already uses. Length 4 under that rule offers EIGHT sequences; five are used
     and three stay reserved. Length 3 would offer only four and is therefore ruled
     out. `UPSTREAM`/`DOWNSTREAM` stay exact tonal mirrors of each other — reversal
     preserves the parity, so the pair exists at length 4 — and that pair is the
     one the player is meant to notice; the other former mirror pairs go with their
     concepts. The chief's message thereby runs 16 syllables instead of 35, which
     is the length a player can still hold in his head while he compares it with
     what he wrote down.
  3. The drum message (`src/communication/drumMessage.ts`) is
     `RIVER · UPSTREAM · ROCK · DIG`.
  4. Every use of a removed concept goes with it, ersatzlos: the twelve situations
     of `src/scenes/place/childSituations.ts` and the errand catalogue of
     `src/scenes/place/adultErrands.ts` that speak them, the glossary/journal/i18n
     strings naming them in BOTH languages, and their tests. What replaces them is
     built in the two points that follow this one (children's bank game, adults'
     water and digging), and THE BATCH HAS DECIDED, ON A MEASUREMENT, THAT THIS
     POINT LANDS WITH THE CHILDREN'S GAME AND NOT BEFORE (14.08.2026): emptying
     the child situations takes the children's steering with it, and the shipped
     bambara village then shuffles 0.42 % of its judged time against the 0.25 %
     gate — the user's own "Kind zittert auf der Stelle herum", which `main` is
     green on today. The branch stays open until the game is back rather than
     deploying that regression; the code on it builds, lints and plays without
     errors, which is what a merge of it alone was required to prove.
  5. `docs/communication-poc-spec.md` and design.md §13.4 are rewritten to the five
     words and the new teaching places in the same commit.
  7. THE LEFTOVERS THE CROSS-VENDOR REVIEW FOUND ARE CLOSED (Opus 5 on
     `main..44f37c6a`, 14.08.2026, verdict merge-with-fixes; the lexicon core itself
     it verified correct and genuinely pinned — recomputed distances, the mirror and
     the sixteen-strike message all hold). None of these is optional:
     - THE PLAYER-VISIBLE ONES FIRST, in BOTH languages: the drum journal entry
       still says "Seven words, each of five beats" / "Sieben Wörter zu je fünf
       Schlägen" (`en.ts:1057`/`de.ts:1069`), the drum panel hint still says "Seven
       words, one after another" (`en.ts:279`/`de.ts:281`), and two further entries
       (`en.ts:1059`/`de.ts:1071`, `en.ts:1061`/`de.ts:1073`) describe an errand and
       children's speech that no longer exist. Item 4 named the i18n strings and no
       i18n file was touched.
     - `scripts/verify/settings.mjs` and `scripts/verify/polish.mjs` still hard-code
       FIVE-syllable literals. The heard store is string-keyed, so those suites still
       pass — which is the defect: the browser gate proves the audio path for a shape
       the game can no longer produce and covers the shipped four-syllable utterance
       nowhere.
     - The point-589 speech-silence alarms are DEAD: `watchProducer`'s only remaining
       caller is the tag round, `adultErrands.ts` carries an unstepped watch, and yet
       `balance.ts` documents both alarms and the debug menu still ships both sliders
       in both languages. Either the alarms are re-armed for the rounds that do speak,
       or the controls and their documentation go with them — no dead slider.
     - `docs/acceptance-evidence.md` still describes the eleven-word state while §7's
       criterion detail was corrected; the two contradict each other and must move
       together.
     - `RIVER` is four identical low strikes. Six of the eight even-parity sequences
       carry BOTH tones and only five words are needed, so the "at least one syllable
       of each tone" rule is restored and `RIVER` takes a mixed-tone sequence: the
       least hearable word in the inventory is not the one the whole message opens on.
     - The persisted-readings break of item 6 is STATED IN A COMMIT, not only in the
       spec document.

  Test: the Vitest layer pins the five concepts, the two-syllable minimum distance
  over the whole inventory, the mirror of the direction pair, and the message's
  exact composition. No test may still reference a removed concept.

  6. THE PERSISTED READINGS BREAK, AND THAT IS ACCEPTED. Renaming `BIG_ROCK` and
     dropping six concepts invalidates the heard-utterance memory in existing
     saves. No migration is written and none is owed (user 13.08.2026: the save
     feature is switched off and nobody plays a serious run in this PoC). The break
     is stated in the commit and in the spec document; the save/load CODE stays
     intact.
  Constraints:
  - This is the FOUNDATION of the rebuild; the five following points assume it.
  - Difficulty medium: mechanical in shape, but it touches the lexicon, the
    message, both language files and every test that names a concept.
  - SEQUENCE_LENGTH is 4 by the user's decision of 13.08.2026; do not carry the
    five of 11.08.2026 forward, and do not go below 4 (three syllables cannot hold
    five words at the required distance).
  Quotes:
  Nutzer, 13.08.2026 21:06: »Dafür brauchen wir nur RIVER, UPSTREAM, BIG_ROCK und DIG, würde ich sagen. Die Konzepte GO_THERE, FOLLOW und THERE sind nicht notwendig, oder?«
  Nutzer, 13.08.2026 21:43: »Wir brauchen also RIVER, UPSTREAM, DOWNSTEAM, ROCK (das ist besser als BIG_ROCK, weil wir den Findling sowieso kleiner machen wollen) und DIG.«
  Nutzer, 13.08.2026 23:38: »Stimmt, fünf Silben sind dann wohl nicht mehr notwendig.«
  Refs: src/communication/lexicon.ts, src/communication/drumMessage.ts, src/scenes/place/childSituations.ts, src/scenes/place/adultErrands.ts, docs/communication-poc-spec.md, design.md 13.4
  Bundle: Dorfleben.

- [ ] 687. The village children play one game at the bank, and it teaches four words (user
  13.08.2026, playing the deployed communication slice).
  The user played the deployed communication slice on 13.08.2026 with the debug
  switch "Speech: show concepts instead of syllables" on and could learn nothing:
  "Ich erkenne da kein Fangspiel … Das Herumschicken wirkt wie zum Selbstzweck
  eingeführt", and about the adults "Selbst wenn ich diese Übersetzungen sehe,
  erkenne ich keinen Sinn hinter den Handlungen." The evening's conversation
  diagnosed the cause — the design taught eleven concepts through situations
  forced onto a game that cannot carry them — and rebuilt the whole slice around
  five words, two teaching places and one game per settlement kind. This point is
  one of six that carry that rebuild; they are specified together and read
  together.

  The six specifications were reviewed cross-vendor before filing (GPT-5.6 Sol at
  effort high, 13.08.2026, verdict do-not-merge on the first draft): it found two
  outright contradictions and, more valuable, three wrong readings a player could
  learn and still finish the puzzle with. What stands here is the corrected state.
  The village children play ONE game at the river bank, and it teaches four of the
  five words without a single staged lesson.

  Final state:

  1. THE CYCLE. The children roam their own quarter of the village, out of earshot
     of the adults. At the end of that phase one of them calls `RIVER`, points at
     the water, and the whole group runs to the bank — the caller is the first
     catcher. A CYCLE is: that call, then runs until no runner is left free, then
     the group walks back and roams again. Phase lengths are balance values,
     debug-editable; the roaming phase is short (order of a minute) so a visiting
     player does not miss the call that opens the cycle.
  2. THE GAME. Two rocks stand on the bank, one upstream, one downstream, in the
     CURRENT teaching-stone size (scale 2.4) — they are run-to targets and must be
     recognisable from the far end of the stretch. The runners gather at one rock,
     the catcher waits at the other. Before each run one of them announces the
     direction — `UPSTREAM` or `DOWNSTREAM` — and the whole group sets off that way
     while the catcher comes to meet them. Whoever reaches the far rock calls
     `ROCK`.
  3. THE RUN'S STATE MACHINE, stated exactly, because half of it decides what the
     picture shows:
     - A run ENDS when every runner has either touched the far rock or been tagged.
     - A tagged runner drops out where he stands, in an UNMISTAKABLE out-of-play
       posture (crouched, arms folded — never confusable with a walking child), and
       holds it until the run ends.
     - Between runs the dropped-out children WALK to the catchers' side; from the
       next run on they tag as well. Only catchers tag.
     - Sides swap every run: the survivors now start where they arrived, so the
       announced direction alternates by construction.
     - The cycle ends when no free runner is left.
  4. THE THREE WRONG READINGS ARE CLOSED — this is the part the cross-vendor review
     (GPT-5.6 Sol, 13.08.2026) blocked the earlier draft on, and none of it is
     optional:
     - `ROCK` must not be learnable as "base", "goal" or "made it". Two guards: the
       catcher taps his rock and names it at the start of a run, with nobody
       arriving; and during the ROAMING phase a child climbs one of the ordinary
       scattered boulders in the village and names it — a rock that is no part of
       the game at all.
     - `UPSTREAM`/`DOWNSTREAM` must not be learnable as "to the far rock" or as
       left/right. Guard: when the group breaks up at the end of a cycle it walks
       off ALONG the bank and one child announces that walk with the opposite word,
       from wherever the group happens to stand and with no rock as its target.
       The words therefore appear once per cycle detached from the two rocks.
     - Corroboration the world already offers: the river visibly flows, so the two
       words correlate with the current for a player who watches the water.
  5. NOTHING IS STAGED. There is no situation catalogue any more. Every utterance
     falls at a fixed point of the round — the opening call, the direction
     announcement, the arrival, the catcher's tap, the parting call — and not one
     of them takes a child out of the game or slows it.
  6. THE STAGE, in numbers rather than adjectives: the stretch between the rocks is
     stated in world units, chosen so both rocks are inside the frame from the
     start line at the default field of view and the stated reference viewport, and
     the lane is at least three walker diameters wide so a child can pass an adult
     or the traveller without being pushed into the water or a wall. The numbers
     stand in the layout comment with the measurement that produced them.
  7. THE TRAVELLER IS AN OBSTACLE, NEVER A STOP. Children steer round the player
     and round any villager and keep playing; a game that halts when the player
     steps in would never be seen. They give the STRANGER a WIDER berth than a
     villager — one extra radius, calibratable — so they visibly swerve rather than
     brush past him.
  8. Every utterance is one atom, read from the same lexicon as everything else.
  9. THE THREE CHILD-MOTION PINS THE VOCABULARY POINT LOOSENED ARE RESTORED AND
     RE-MEASURED (measured 14.08.2026 on `feat/686-five-word-lexicon`). Emptying
     the child situations took the children's steering with it, and
     `src/scenes/place/tagShuffle.test.ts` measured the cost: bambara-village at
     seed 2972259115 shuffles 0.42 % of its judged time over 60 s against the
     0.25 % gate, the progress watch fires twice over 90 s where once was enough,
     and the constructed pen stops producing the symptom at 0.65 m (6.7 % shuffled,
     82.3 % of the trace still judged — the gate passing a wedged child). The
     interim run is 120 s, the exact rescue pin is `toBeGreaterThan(0)` and the
     pen is 0.6 m; each site names the number it held. This point puts the 60 s,
     the exact `toBe(1)` and the 0.65 m yard back, and states the re-measurement
     in the same commit. A pin that cannot be restored is a finding, not a value
     to re-tune.
 10. THE CROSS-VENDOR REVIEW'S FINDINGS ARE ANSWERED (GPT-5.6 Sol at effort high on
     `44f37c6a..9598673d`, 14.08.2026, verdict DO-NOT-MERGE). Each is fixed or
     refuted with evidence, and the ones that are fixed are pinned by a test that
     would fail without the fix:
     - THE CYCLE CAN NEVER END. `endRun` promotes only children already `out`, and
       the sole cycle exit is "no free runner left", so a sequence of runs in which
       nobody is tagged repeats run/regroup forever. The roaming phase then never
       returns — and with it neither the boulder that teaches `ROCK` off the game nor
       the opening `RIVER` call. The round needs a guaranteed elimination or an
       explicit cycle backstop, and a test that drives a no-tag run to termination.
     - THE CATCHER'S TAP CAN FALL AFTER SOMEBODY ARRIVES. The tap and the direction
       announcement are QUEUED and drained one per `utteranceGapSeconds`, so the tap
       is emitted at least one gap into the run — which is exactly the "made it"
       reading item 4 forbids. Every utterance that item 5 fixes to a moment of the
       round is emitted AT that moment or not at all.
     - THE OFF-GAME `ROCK` GUARD IS SILENTLY ABANDONED when the roaming goal runs
       long (`namedBoulder` is set true without anyone speaking), `BankStage.boulder`
       is nullable, and no code makes the child climb. The guard either fires every
       roaming phase or the settlement has no bank round; a cycle without the boulder
       utterance is a failing test, not an accepted case.
     - THE BODY SEPARATION MOVES CROUCHED CHILDREN. `separateGroup` and
       `absorbSeparation` run unconditionally after the round's own step, so a tagged
       child can be pushed while it is meant to hold its posture, and can be pushed
       inside the traveller's berth because the round's obstacle check has already
       finished. The pure test asserts immobility on a path the game does not take —
       the integration path is what must be pinned.
     - THREE ASSERTIONS PIN NOTHING and are replaced by ones that bite:
       `expect(free).toBeGreaterThanOrEqual(0)` is tautological, `expect(pace)
       .toBeGreaterThanOrEqual(Math.min(paceBefore, pace))` is always true, and
       `expect(nearest).toBeGreaterThan(berth * 0.9)` permits ten percent penetration
       of the very radius it guards and never compares against the ordinary villager's.
     - The re-pen construction of item 9 was NOT judged (it fell outside the reviewed
       range), so the re-review covers it: the guard was loosened from demanding a
       clear r+1.6 m yard to only refusing to leave a sibling in the wall band, and
       that must be shown to be a correction rather than a weakening.
 11. THE CARVE REMOVAL IS GATED PER CHILD, IN EVERY RIVER VILLAGE (cross-vendor
     finding, GPT-5.6 Sol at effort high on `59740c15..206ae092`, 18.08.2026,
     verdict merge-with-fixes; counted and confirmed before filing).
     `src/scenes/place/PlaceLife.tsx` takes `buildWedgeCarve` off EVERY bank phase
     (`const carve = stage ? () => false : …`), on the measured ground that at the
     verification's own seed the only route from the children's quarter to the bank
     ran through one carved wedge — with the carve the group stood in a pocket and
     never reached the water. That reason stands. What is missing is the gate on
     its cost: a roaming child is steered LOCALLY, so with the carve gone nothing
     keeps an individual child out of a dead-end wedge. The per-child measure that
     would catch it — "the children never shuffle on the spot", which reads
     `worstShare` and `leastJudged` off the WORST child — runs over
     `bambara-village@2972259115`, `maasai-village@42` and `swahili-village@99`,
     and the last two stand on no river, so they never play this round at all. The
     round's own cross-layout test asserts stations reachable, both rocks stood at,
     one rock touched and one run-phase crossing — never per-child progress. Three
     of the four river layouts are therefore ungated. FINAL STATE: the per-child
     shuffle measure runs over the bank-round replay in all four river villages
     (`bambara@42`, `bambara@2972259115`, `nubian@42`, `mandinka@99`), gating
     `worstShare` and `leastJudged` there as the shuffle pin does, and the measured
     numbers are stated at the site. Restoring the carve for the locally steered
     phases is the alternative and is second choice: it puts back a wall the
     measurement showed was in the wrong place, so it may only be taken if the
     measure cannot be made to hold.

  Test: Vitest over a replayed cycle — the phases alternate; the caller becomes the
  first catcher; the direction alternates with the side swap; `ROCK` occurs once
  without an arrival and once outside the game; a direction word occurs once with
  no rock as its target; the run and cycle end exactly as §3 says; no utterance
  reduces a playing child's pace; a tagged child holds the posture and only moves
  between runs. A browser section judges the picture: both rocks in frame from the
  start line, and a player standing in the lane is walked around while play goes on.
  Constraints:
  - Depends on the five-concept lexicon (the vocabulary point).
  - The old tag round (chaser, flight, role handover) is NOT deleted — it moves to
    the port cities in its own point. Keep the reusable parts.
  - The stuck/trembling child (carrier findings on 666) is a SEPARATE defect; this
    point must not be measured on a group whose children are wedged.
  - Difficulty high: this is a new round structure plus layout work, and the
    picture decides.
  Quotes:
  Nutzer, 13.08.2026 22:24: »Am Fluss gibt es am einen Ende und am anderen einen großen Felsen. Die Kinder spielen "Wer hat Angst vorm weißen Hai?" … Schaffen es, rufen sie beim Ankommen ROCK. Bevor sie losrennen, kündigen sie ihre Richtung an: flussaufwärts oder flussabwärts … Wer erwischt wurde, bleibt stehen. Dann beginnt eine neue Runde mit Seitentausch und die vorher vom Fänger erwischten Spieler gehören jetzt zu seinem Team.«
  Nutzer, 13.08.2026 22:36: »Die Kinder spielen nicht permanent … Irgendwann ruft eines RIVER und zeigt auf den Fluss. Dann laufen alle dort hin und spielen das Spiel. Das Kind, das RIVER gerufen hat, ist dann zu Beginn der Fänger.«
  Nutzer, 13.08.2026 23:11: »Man sollte meinen, dass die Kinder etwas Angst/Respekt vor mir als fremder Erwachsener haben, anstatt mich fast umzurennen.«
  Refs: src/scenes/place/tagGame.ts, src/scenes/place/childSituations.ts, src/scenes/place/PlaceLife.tsx, src/scenes/place/lifeSpots.ts, src/scenes/place/layout.ts, src/config/balance.ts
  Bundle: Dorfleben.

- [ ] 688. The adults teach water and digging by doing their own work (user 13.08.2026, playing
  the deployed communication slice).
  The user played the deployed communication slice on 13.08.2026 with the debug
  switch "Speech: show concepts instead of syllables" on and could learn nothing:
  "Ich erkenne da kein Fangspiel … Das Herumschicken wirkt wie zum Selbstzweck
  eingeführt", and about the adults "Selbst wenn ich diese Übersetzungen sehe,
  erkenne ich keinen Sinn hinter den Handlungen." The evening's conversation
  diagnosed the cause — the design taught eleven concepts through situations
  forced onto a game that cannot carry them — and rebuilt the whole slice around
  five words, two teaching places and one game per settlement kind. This point is
  one of six that carry that rebuild; they are specified together and read
  together.

  The six specifications were reviewed cross-vendor before filing (GPT-5.6 Sol at
  effort high, 13.08.2026, verdict do-not-merge on the first draft): it found two
  outright contradictions and, more valuable, three wrong readings a player could
  learn and still finish the puzzle with. What stands here is the corrected state.
  The adults teach `RIVER` and `DIG` by doing their own work, and they never stand
  at the bank.

  Final state:

  1. WATER. One adult sets off from the village toward the water with an EMPTY jar,
     says `RIVER` as he goes, and walks out of the settlement down the water path.
     Another comes back UP that path with a FULL jar carried in the head-load pose,
     and says `RIVER` on arriving. Both utterances fall in the village, at the head
     of the path — never at the bank, so no adult voice is ever inside the
     children's earshot. The two together fix the word on the PLACE: once it is a
     destination, once an origin, and only the water is common to both. Jar and
     head-load pose already exist (`TaskWalker`'s jar; the porters' head-carry).
  2. DIGGING, AND THE WORD SITS ON THE STROKE. At the village's work sites an adult
     digs visibly and says `DIG` AS HE STRIKES — not before, not while walking
     there. The second situation is another digger at another site doing the same
     while a second villager, unbidden, joins in. No adult ever CALLS another over
     with `DIG`: a word spoken to summon somebody teaches "come" or "help" at least
     as well as "dig". Two situations, one atom each, both spoken at the moment the
     ground is worked.
  3. EVERYTHING ELSE GOES. The old errand catalogue — the sendings, the callings
     back, the mirrored upstream/downstream walks, every errand that ended in a
     villager standing still — is deleted. The direction words are the children's
     now.
  4. THE WORK SITES LEAVE THE MIDDLE. The three dig sites (store pit, post hole,
     turned patch) are placed where such work belongs — at a compound edge, beside
     a lane, at the edge of the worked ground — never on the open central ground.
  5. THE TEACHING ROCKS ARE LAYOUT. The two rocks of the children's game stand on
     the bank, one upstream and one downstream of the descent, in the current
     teaching-stone size; the old single stone in the village centre is gone. The
     WATER PATH meets the bank OUTSIDE the stretch between them, so the water
     carrier never crosses the running lane. A settlement with no bank carries
     neither rocks nor the children's bank game; its adults keep only `DIG`, and
     its children play the SILENT tag game the ports have (see the port point), so
     no settlement is ever left without a children's game.
  6. The three areas — village core (adults), children's roaming quarter, bank
     stage — each clear the others by at least the hearing radius. Where a layout
     cannot give all three, the ADULTS are moved, not the children: their words do
     not depend on where they stand, the children's do.

  Test: Vitest over the layout — the rocks lie on the bank on either side of the
  descent, the water path meets the bank outside the stretch, no dig site lies on
  the central ground, the three areas clear each other by the hearing radius, and
  the placement is stable for a seed. Vitest over the adult situations — two for
  each word, one atom each, the digging ones ending in the dig pose. Picture check
  on both backends.
  Constraints:
  - Depends on the five-concept lexicon; pairs with the children's bank game (the
    rocks it places are that game's stage).
  - No new prop model is required: the jar and the head-load pose exist. A fish was
    considered and dropped — a net cannot be drawn in this stylised look.
  - `RIVER` may be read by the player as "water"; that is acceptable and was
    decided by the user — "Wasser, aufwärts, Fels, graben" leads to the same place.
  Quotes:
  Nutzer, 13.08.2026 22:42: »Insgesamt sagen mir die Erwachsenen mit nur einem Wort bisher zu wenig. Vielleicht können sie auch noch irgendwie RIVER benutzen.«
  Nutzer, 13.08.2026 22:48: »Ein Krug fände ich schon in Ordnung. Wenn der Spieler dann RIVER als WATER interpretiert, wäre das für die Botschaft des Häuptlings nicht schlimm.«
  Nutzer, 13.08.2026 20:46: »Der Lehrstein soll flussaufwärts wandern. Ein großer Felsbrocken mitten im Dorf macht keinen Sinn - ebensowenig, wie dort zugraben.«
  Refs: src/scenes/place/adultErrands.ts, src/scenes/place/PlaceLife.tsx (TaskWalker, HEAD_CARRY_POSE), src/scenes/place/layout.ts (teachingStone, digSites), src/scenes/place/riverBank.ts
  Bundle: Dorfleben.

- [ ] 689. The chief speaks from the first minute, and pays in a direction and a mould (user
  13.08.2026, playing the deployed communication slice).
  The user played the deployed communication slice on 13.08.2026 with the debug
  switch "Speech: show concepts instead of syllables" on and could learn nothing:
  "Ich erkenne da kein Fangspiel … Das Herumschicken wirkt wie zum Selbstzweck
  eingeführt", and about the adults "Selbst wenn ich diese Übersetzungen sehe,
  erkenne ich keinen Sinn hinter den Handlungen." The evening's conversation
  diagnosed the cause — the design taught eleven concepts through situations
  forced onto a game that cannot carry them — and rebuilt the whole slice around
  five words, two teaching places and one game per settlement kind. This point is
  one of six that carry that rebuild; they are specified together and read
  together.

  The six specifications were reviewed cross-vendor before filing (GPT-5.6 Sol at
  effort high, 13.08.2026, verdict do-not-merge on the first draft): it found two
  outright contradictions and, more valuable, three wrong readings a player could
  learn and still finish the puzzle with. What stands here is the corrected state.
  The chief speaks to anyone from the first minute, and what he gives back for the
  buried thing is a direction and a mould.

  Final state:

  1. NO PRECONDITION. The audience and the drummed message need no gift, no trust,
     no "Honored Friend" — the player may ask from his first visit. The only thing
     between him and the message is that he does not know the words. Every gate on
     the message is removed (it was a placeholder from an early version).
  2. THE MESSAGE stays as the vocabulary point defines it: `RIVER · UPSTREAM ·
     ROCK · DIG`, drummed, never translated, reopenable from the journal with the
     player's own readings.
  3. THE REWARD. When the traveller hands over what he dug up at the boulder
     upstream, the chief answers with `RIVER · DOWNSTREAM` — the direction, nothing
     else. The phrase says WHERE and no more; what to do there is carried by the
     mould alone. Nothing may be read into the ABSENCE of `DIG`: silence teaches
     nothing, so no meaning is assigned to it anywhere in the design. The old
     acknowledgment `BIG_ROCK · DIG · HERE` is gone with the concepts it used.
  4. THE MOULD. With it he hands over, wordlessly, one item: DE "Tonabdruck eines
     Felsens", EN "Clay Impression of a Rock". It rides OUTSIDE the pack capacity
     and cannot be traded, like the buried thing before it. There is no item
     picture in this game, so the NAME and the JOURNAL carry it: the entry at the
     handover describes what the traveller sees — a flat back, a hollowed face, a
     form that wants to go INTO something, not onto it — in the ~1890 voice with
     the §15 markup, in both languages. That is his own observation, not a
     translation of the chief's speech, so the no-translation rule stands.
  5. BANDIAGARA. Downstream lie the cliffs. At the TALUS FOOT — not in the cliff-
     face niches, which are Tellem burial and granary places (docs/205-world-
     accuracy-findings.md A18) — the mould fits its socket. Using it there with the
     use key, within the same kind of radius the digging uses, fires a dummy
     success message: the PoC puzzle is solved. The message is localized in both
     languages.
  6. IT IS A SMALL SYSTEM, NOT A ONE-OFF. An item carries a FORM ID, a place
     carries the matching SOCKET, and the use key at proximity resolves them. The
     state rules are part of the system, not left to the first caller:
     - the traveller may carry several forms; the socket picks the one that MATCHES
       it and ignores the rest, so nothing has to be "selected" first;
     - a socket is either open or spent; a spent one answers like a wrong place;
     - a form is NOT consumed — it stays in the pack, so a second visit is never a
       dead end;
     - the spent state is part of the saved game like any other world state;
     - a use at a wrong or spent place answers with a sentence in the traveller's
       voice ("the rock here has no such hollow") rather than with silence — that
       is how the player learns the rule for the next lock.
     A pyramid or the Sphinx must later be a data line, not a new mechanism.

  Test: Vitest — the message needs no gift/reputation state; the reward phrase is
  exactly `RIVER · DOWNSTREAM`; the mould is outside capacity and untradeable; the
  form/socket resolution succeeds only within the radius at the talus foot and
  answers with the miss sentence elsewhere; the success message exists in both
  languages. One browser flow proves the handover and the use at the cliff.
  Constraints:
  - Depends on the five-concept lexicon.
  - The goal boulder of src/world/communicationRock.ts is untouched.
  - Do not let the item name or the journal entry say "cliff" — it must say an
    impression of A ROCK. The direction comes from the word, the place from the
    player putting the two together.
  - The framing is a token of goodwill from one people to the next (the §13.3 chain
    of knowing people), never a looted sacred object, and nothing is opened in a
    burial niche.
  Quotes:
  Nutzer, 13.08.2026 21:22: »Das mit dem Vertrauen raus - das war nur ein Platzhalter einer frühen Version … Man soll von Anfang an jeder Zeit mit dem Häuptling reden können - nur versteht man ihn nicht, wenn man nicht von den Kindern und den Erwachsenen die Sprache gelernt hat.«
  Nutzer, 13.08.2026 21:22: »Wie wäre damit, dass er einem etwas und dieses Mal nur flussabwärts (bisher wurde nur flussaufwärts verwendet) sagt? Flussabwärts kommt man zu Bandiagara. Wenn man dort den neuen Gegenstand benutzt, erscheint eine Dummy-Erfolgsmeldung, die besagt, dass man das Rätsel des PoCs gelöst hat.«
  Nutzer, 13.08.2026 21:37: »Der Gegenstand soll sozusagen ein Negativ zu einem Stück von der Felswand sein. Drückt man ihn dagegen, löst das irgendetwas aus - ein Bisschen Zak McKracken Vibes. Auf ähnliche Art könnte man später vielleicht in einem Pyramide oder in die Sphinx gelangen.«
  Nutzer, 13.08.2026 22:59: »Der Häuptling sagt zur Belohnung nicht nur DOWNSTREAM, sondern RIVER DOWNSTREAM. Nur dieses Mal kein DIG.«
  Refs: src/communication/chiefReply.ts, src/state/store.ts (rockArtefact), src/ui/Dialogs.tsx, src/world/data/landmarks.ts (bandiagara), docs/205-world-accuracy-findings.md A18
  Bundle: Dorfleben.

- [ ] 690. The classic game of tag moves to the port cities, and is silent there (user
  13.08.2026, playing the deployed communication slice).
  The user played the deployed communication slice on 13.08.2026 with the debug
  switch "Speech: show concepts instead of syllables" on and could learn nothing:
  "Ich erkenne da kein Fangspiel … Das Herumschicken wirkt wie zum Selbstzweck
  eingeführt", and about the adults "Selbst wenn ich diese Übersetzungen sehe,
  erkenne ich keinen Sinn hinter den Handlungen." The evening's conversation
  diagnosed the cause — the design taught eleven concepts through situations
  forced onto a game that cannot carry them — and rebuilt the whole slice around
  five words, two teaching places and one game per settlement kind. This point is
  one of six that carry that rebuild; they are specified together and read
  together.

  The six specifications were reviewed cross-vendor before filing (GPT-5.6 Sol at
  effort high, 13.08.2026, verdict do-not-merge on the first draft): it found two
  outright contradictions and, more valuable, three wrong readings a player could
  learn and still finish the puzzle with. What stands here is the corrected state.
  The classic game of tag survives — in the PORT CITIES and in any village without
  a bank, and it is silent wherever it runs.

  Final state:

  1. The round that exists today — one child is IT, the group flees, the child that
     is caught takes over the role, with its stamina, its break-offs and its
     body-avoidance — is kept and becomes the PORT settlements' children's game. It
     is the game the user asked for originally and it works; only the teaching
     layer bolted onto it was wrong.
  2. Wherever this game runs the children DO NOT SPEAK. There is no lect to learn
     in a port, and syllables that mean nothing anywhere would only mislead.
  3. WHICH SETTLEMENT PLAYS WHAT, with no gap and no overlap:
     - a village WITH a bank: the bank game, and only that;
     - a village WITHOUT a bank: this silent tag game, and only that;
     - a port: this silent tag game, and only that.
     No settlement ever runs two children's games at once.
  4. The children of a port (and of a bankless village) get their own play ground,
     derived like the village one and clearing that settlement's own vignettes by
     the hearing radius.

  Test: Vitest over the three settlement cases of §3 — each stages exactly one
  game, the bank game only where a bank exists, and the tag game speaks nothing.
  The existing children-motion gate keeps running against this game wherever it is
  staged.
  Constraints:
  - Depends on the children's bank game only in so far as the two must not both
    run in one settlement.
  - The stuck/trembling child of the user's two bug reports lives in exactly this
    steering. It MOVES WITH the game to the ports, so it must be cured at its cause
    (carrier findings on 666) — otherwise the next report says "a child is stuck in
    the harbour".
  Quotes:
  Nutzer, 13.08.2026 22:59: »Es ist schade, dass damit das bisherige Fangspiel, bei dem einer Fänger ist, die Gruppe vor ihm wegrennt und ein gefangenes Kind die Fängerrolle übernimmt, komplett wegfällt. Das würde ich zusätzlich als anderes Spiel beibehalten - allerdings nicht für die Dörfer, weil das sonst zu unübersichtlich wird, wenn zwei verschiedene Spiele parallel laufen. Aber in den Hafenstädten können die Kinder dieses klassische Fangspiel spielen.«
  Refs: src/scenes/place/tagGame.ts, src/scenes/place/PlaceLife.tsx, src/scenes/place/lifeSpots.ts
  Bundle: Dorfleben.

- [ ] 691. A guess is entered with space, and the nearer thing wins (user 13.08.2026, playing
  the deployed communication slice).
  The user played the deployed communication slice on 13.08.2026 with the debug
  switch "Speech: show concepts instead of syllables" on and could learn nothing:
  "Ich erkenne da kein Fangspiel … Das Herumschicken wirkt wie zum Selbstzweck
  eingeführt", and about the adults "Selbst wenn ich diese Übersetzungen sehe,
  erkenne ich keinen Sinn hinter den Handlungen." The evening's conversation
  diagnosed the cause — the design taught eleven concepts through situations
  forced onto a game that cannot carry them — and rebuilt the whole slice around
  five words, two teaching places and one game per settlement kind. This point is
  one of six that carry that rebuild; they are specified together and read
  together.

  The six specifications were reviewed cross-vendor before filing (GPT-5.6 Sol at
  effort high, 13.08.2026, verdict do-not-merge on the first draft): it found two
  outright contradictions and, more valuable, three wrong readings a player could
  learn and still finish the puzzle with. What stands here is the corrected state.
  A guess is entered with SPACE, the use key — the mouse click goes, and the use
  key has ONE candidate list.

  Final state:

  1. The reading dialog for a heard utterance opens with SPACE on the targeted
     speaker. The left-click path on the canvas is removed, together with the
     pointer-lock release it needed only so the dialog could receive keys
     (src/scenes/place/SpeechLabels.tsx).
  2. ONE CANDIDATE SET FOR THE USE KEY. Everything SPACE can mean in a settlement —
     a hut door, a speaker's utterance, a dig site, the chief, a form socket — is
     collected as candidates with a distance from the player and a range of its
     own. The nearest candidate IN range wins; a tie holds the standing pick the
     way the speech target already does (TARGET_HOLD), so the choice cannot flicker
     between two things a step apart. Distances are measured on the ground plane in
     place units for every candidate, so they are comparable at all.
  3. THE PROMPT SHOWS WHAT SPACE WILL ACTUALLY DO. The highlight and the on-screen
     hint belong to the WINNING candidate — when the door wins, the speaker's note
     carries no invitation, and the door's hint is shown instead. A prompt that
     offers something SPACE will not do is a bug, not a detail.
  4. `src/communication/speechTarget.ts` keeps deciding WHICH speaker is the
     speaker candidate; it simply no longer decides what SPACE does.
  5. On-screen hints and both language files say SPACE, never "click".

  Test: Vitest over the candidate arbitration — nearer door wins, nearer speaker
  wins, a candidate out of its own range never wins, the tie holds its standing
  pick, and the prompt named by the arbitration is the one the winner owns. A
  browser check opens a guess with SPACE and proves no mouse handler is left on the
  canvas.
  Constraints:
  - Independent of the rest of the rebuild; it can land on its own.
  - Small and mechanical — a good fit for the OpenAI lane.
  Quotes:
  Nutzer, 13.08.2026 22:59: »Eine Änderung an der Bedienung: Anstatt per Klicken eine Interpretation für etwas Gesagtes festlegen zu können, soll das per SPACE passieren. Das ist ja die Benutzen-Taste. Zusätzlich jetzt Klicken einzuführen war nur unnötig umständlich.«
  Nutzer, 13.08.2026 23:13: »Vorfahrt hat, was dem Spieler näher ist.«
  Refs: src/scenes/place/SpeechLabels.tsx, src/communication/speechTarget.ts, src/ui/Dialogs.tsx, src/i18n/de.ts, src/i18n/en.ts
  Bundle: Dorfleben.

- [ ] 692. Every document describes the rebuilt communication mechanic, not the old one (user
  13.08.2026, playing the deployed communication slice).
  The rebuild changes what the mechanic IS, and the documents are what the next
  session, the next agent and the closing run read as the target state. A sweep on
  13.08.2026 found more than twenty places still specifying the superseded design —
  the eleven-word lexicon, the twelve-situation catalogue, the mirrored bank
  errands, the gift-gated message, the seven-concept sentence, the `BIG_ROCK · DIG ·
  HERE` reply, the mouse click — and design.md §13.4 still calls the whole mechanic
  "not yet decided". Left standing, every one of them is a trap for whoever builds
  or judges the slice next.
  Every document that describes the communication mechanic describes the REBUILT
  one — no sentence of the superseded design is left standing anywhere.

  This point is the documentation half of the rebuild. It lands WITH (or
  immediately after) the five build points; a repository whose design documents
  still specify eleven concepts, a gift-gated message and a click interaction while
  the code does something else is worse than either state alone.

  Final state, document by document. The list below was produced by a cross-vendor
  sweep (GPT-5.6 Sol at effort high, 13.08.2026) over the spec document, design.md
  §13, CLAUDE.md §7.1 and the acceptance detail, with every offending line quoted;
  each item states what must happen to it. Work it as a checklist — an item is done
  when the quoted sentence no longer exists in that form.
  1. **Blocking — the commit does not address the communication rebuild at all.** The diffstat contains only `docs/analysis_de/vibe-coding-anleitung.md`; none of the communication design, acceptance, implementation, localization, journal, or test files changes. Consequently every contradiction below survives unchanged, and none of the six specifications’ required tests is added.

  2. **`docs/communication-poc-spec.md` still declares the superseded brief authoritative.**  
     Quote: “The user's brief of 03.08.2026 answers the open question…” and “This document is the reference the work-order points 477–488 cite”.  
     Action: rewrite the document’s status and provenance around the new six-point design; the old work-order reference becomes obsolete.

  3. **Its phrase examples use removed concepts.**  
     Quote: “a known movement call AND the river utterance”, “dig + here”.  
     Action: rewrite using surviving phrases, such as `RIVER · DOWNSTREAM`; `HERE` must disappear.

  4. **The five-syllable rationale is still based on eleven words.**  
     Quotes:

     - “Eleven concepts need eleven sequences.”
     - “Eleven words in a four-syllable space…”
     - “Eleven of the fifteen are used and four stay reserved.”
     - “the chief's message runs thirty-five syllables instead of twenty-eight.”
     - “it is on the board as a decision the user may reverse.”

     Action: rewrite for five used sequences, ten available/reserved sequences, and a four-atom/twenty-syllable message. Keeping `SEQUENCE_LENGTH` 5 and the two-syllable minimum distance is no longer an open decision.

  5. **The lexicon registry still contains all six concepts that must be removed.**  
     Quotes: the rows for `COME`, `GO_THERE`, `HERE`, `THERE`, `FOLLOW`, and `NO`.  
     Action: delete those rows and every dependent reference.

  6. **The rock concept still has the obsolete name.**  
     Quote: “| BIG_ROCK | `BA-ba-ba-ba-BA` | framed by two highs — a solid block |”.  
     Action: rename it to `ROCK` everywhere; it is a class, not one named boulder.

  7. **The reserved-sequence registry reflects the eleven-word inventory.**  
     Quote: “Reserved and unused: `ba-BA-ba-ba-BA`, `BA-BA-ba-BA-BA`, `BA-ba-BA-BA-BA`, `BA-BA-BA-ba-BA`.”  
     Action: rewrite after removing six words; their sequences become unused too.

  8. **Three obsolete mirror pairs remain part of the design.**  
     Quote: “All four opposite pairs are exact mirror images: come reversed is go, here reversed is there, follow reversed is no, upstream reversed is downstream.”  
     Action: delete the first three pairs and re-scope the explanation exclusively to `UPSTREAM`/`DOWNSTREAM`.

  9. **The old child/adult teaching split remains verbatim.**  
     Quote: “The children, at their game of tag, teach the six general concepts: COME, GO_THERE, FOLLOW, HERE, THERE, NO. The adults… teach… RIVER, UPSTREAM, DOWNSTREAM, BIG_ROCK, DIG.”  
     Action: rewrite: bank-game children teach `RIVER`, `UPSTREAM`, `DOWNSTREAM`, and `ROCK`; adults teach `RIVER` and `DIG`.

  10. **The three staged contrast lessons are wholly obsolete.**  
      Quotes:

      - “Three pairs need a deliberately staged contrast…”
      - “COME against FOLLOW…”
      - “GO_THERE against THERE…”
      - “BIG_ROCK against UPSTREAM…”

      Action: delete this catalogue and replace it with the organic guards against the three wrong readings specified for the bank game.

  11. **The hearing/layout section still depends on the deleted situation and errand systems.**  
      Quote: “It is one decision for the children's situations and the adults' errands alike”.  
      Action: re-scope to the bank game, adult water/dig work, and silent tag.

  12. **The child layout still describes the old bounded tag chase as the village teaching game.**  
      Quote: “the children's play ground is DERIVED (`childPlayGround`…) as the largest disc…” and “The chase is bounded by that ground”.  
      Action: re-scope this derived ground to ports and bankless villages’ silent tag. A bank village instead needs the roaming quarter and measured two-rock bank stage, with all three areas separated from adult speech.

  13. **The chief’s message is still the old seven-concept sentence.**  
      Quotes:

      - “Go to the river. Follow it upstream. Dig at the big rock.”
      - “`GO_THERE · RIVER · FOLLOW · UPSTREAM · BIG_ROCK · THERE · DIG`”
      - “Seven concepts…”

      Action: replace with exactly `RIVER · UPSTREAM · ROCK · DIG`, four atoms.

  14. **The chief’s message is still gift/trust-gated.**  
      Quote: “only once a culturally correct gift has earned his trust — the §12 condition every hint in the game stands under.”  
      Action: delete the gift, trust, and honored-friend precondition; the chief must be available from the first visit.

  15. **Adults are still assigned bank-based direction lessons.**  
      Quote: “the village keeps its own reachable bank, because that is where the adults teach RIVER, UPSTREAM and DOWNSTREAM by pointing at real water.”  
      Action: rewrite. Adults never stand at the bank and teach no directions; water carriers say `RIVER` at the village end of the path, while children teach both directions.

  16. **Returning the buried item is still described as the puzzle’s endpoint.**  
      Quote: “He travels back to the village and hands what he dug up to the chief. That solves the puzzle.”  
      Action: rewrite: the handover yields `RIVER · DOWNSTREAM` and the mould; the puzzle ends only when the mould is used at the matching talus-foot socket below Bandiagara.

  17. **The old acknowledgment remains explicit.**  
      Quote: “the chief's answer is a PHRASE… `BIG_ROCK · DIG · HERE`”.  
      Action: delete and replace with exactly `RIVER · DOWNSTREAM`, plus the wordless “Tonabdruck eines Felsens” / “Clay Impression of a Rock” reward and its journal observation.

  18. **The old single teaching-stone transfer remains.**  
      Quote: “BIG_ROCK is therefore taught on a SMALL boulder visible from the village, and the target upstream is a LARGER one further away”.  
      Action: rewrite for `ROCK`, the two current-size bank game rocks, the separate ordinary scattered boulder named during roaming, and the upstream target boulder.

  19. **`design.md` §13.4 still calls the mechanic undecided.**  
      Quotes:

      - “OPEN: the communication mechanic is not yet decided”
      - “Rough direction (first thoughts, deliberately not yet binding)”
      - “the zone cut and the mechanic itself remain the user's decision”
      - “It needs… a decision on the mechanic itself, before any implementation point can be written.”
      - “Until then…”

      Action: rewrite §13.4 as the decided five-word mechanic. The zone cut may remain open, but the village mechanic may not.

  20. **`design.md` still specifies mouse-click entry.**  
      Quote: “the NEAREST speaker's note invites a click, and that click opens a modal”.  
      Action: replace with SPACE/use-key candidate arbitration; remove the canvas click and its pointer-lock-release dependency.

  21. **`design.md` still treats the new mechanic’s eventual landing as hypothetical.**  
      Quote: “The moment the new mechanic is decided and built, that reverses”.  
      Action: replace with a present-tense load-bearing description once the rebuild lands.

  22. **CLAUDE.md criterion 6 can still be read as imposing the old gift gate on the communication hint.**  
      Quote: “a culturally correct gift — not mere observation — is the condition for a hint”.  
      Action: re-scope explicitly to other cultural-contact hints, if that criterion remains; it must exclude the rebuilt chief audience and drum message.

  23. **CLAUDE.md criterion 7 still delegates its definition to the obsolete §13.4 text.**  
      Quote: “The tonal village speech of `design.md` §13.4 is implemented”.  
      Action: rewrite the criterion or its referenced section so acceptance pins the five concepts, new teaching systems, ungated message/reward, and SPACE interaction.

  24. **`docs/acceptance-criteria-detail.md` §6 repeats the ambiguous old gate.**  
      Quote: “a culturally correct gift is the condition for a hint”.  
      Action: re-scope it so it cannot govern this communication message.

  25. **Acceptance detail §7 explicitly accepts the eleven-word lexicon.**  
      Quote: “the Bambara village speaks eleven concepts as five-syllable tone words”.  
      Action: rewrite to exactly five concepts and record the accepted persisted-reading break.

  26. **Acceptance detail §7 explicitly accepts the deleted teaching catalogues.**  
      Quote: “The children's tag teaches six concepts and the adults' errands five more, look-alikes apart”.  
      Action: delete/rewrite for the children’s bank cycle, adults’ two water and two dig situations, and silent tag only in ports or bankless villages.

  27. **Acceptance detail §7 still accepts mouse clicking.**  
      Quote: “is written by clicking him (`speechLabel`, `speechTarget`, `src/ui/SpeechGuess.tsx`)”.  
      Action: rewrite for SPACE and the unified use-candidate list; `speechTarget` should choose only the speaker candidate.

  28. **Acceptance detail §7 still accepts the gift-gated seven-word message and old reply.**  
      Quote: “On earned trust the chief drums a seven-concept message (`drumMessage`); the artefact dug at the erratic it names is answered untranslated (`chiefReply`).”  
      Action: rewrite for the ungated four-word message, exact two-word reply, mould handover, and Bandiagara socket conclusion.

  29. **Acceptance detail §7 declares the obsolete implementation load-bearing.**  
      Quote: “What is built is load-bearing.”  
      Action: rewrite to identify the rebuilt systems; it must not protect the eleven-word catalogue implementation.

  30. **Open point 672 contains one dependency on the old chief response.**  
      Quote: “`playDrumMessage` and the chief's answer keep working exactly as they do”.  
      Action: re-scope this to preserve message/reward playback after the response becomes `RIVER · DOWNSTREAM`; it cannot require the old acknowledgment to remain unchanged. The ambient-silence and synchronized-drummer subject itself remains valid.

  31. **Open point 659 records an obsolete intermediate teaching-stone design.**  
      Quote: “the teaching stone becomes small and moves to the bank upstream”.  
      Action: rewrite for two current-size bank rocks, one upstream and one downstream, and deletion of the old single central stone.

  32. **Open point 659 understates the new reply and reward.**  
      Quote: “the chief's answer is replaced by DOWNSTREAM plus an object that leads to the Bandiagara escarpment.”  
      Action: rewrite to the exact phrase `RIVER · DOWNSTREAM` and name the clay impression/form-and-socket system. The point’s whole-chain review remains valid and should stay on hold until the rebuild lands.

  33. **No attached OPEN work-order point has a subject that becomes wholly obsolete.** Points 672 and 673 still apply to the rebuilt audio, and 659 explicitly resumes against the new chain. Only the stale clauses identified above require rewriting; the other attached open points concern unrelated release/process defects.

  Three notes on that list:

  - Its item 4 says the syllable length stays five. It does NOT: the user decided on
    13.08.2026 that four syllables suffice once eleven words became five (eight
    sequences exist at length 4, five are used, three reserved). The documents are
    rewritten to FOUR, and the chief's message to 16 syllables.

  - Item 1 is an artefact of how the sweep was run (it was handed a commit that had
    nothing to do with the rebuild) and is NOT a finding — ignore it.
  - Items 30 to 32 concern OPEN work-order points, not documents; they are filed
    separately as a finding and are not part of this point.

  Beyond the checklist, two things this point owes on its own:

  - `design.md` §13.4 stops calling the mechanic undecided and states it in the
    present tense as the decided five-word design (the ZONE cut may remain open —
    only the village mechanic is decided).
  - The persisted-reading break is recorded in one line where the acceptance detail
    claims what the slice guarantees (user 13.08.2026: saves are irrelevant in this
    PoC, no migration is owed).

  Test: the Vitest layer already pins the lexicon and the message; this point adds
  the document check it can carry — no design or acceptance document may name a
  removed concept (`COME`, `GO_THERE`, `FOLLOW`, `HERE`, `THERE`, `NO`,
  `BIG_ROCK`), and `docs/communication-poc-spec.md` and design.md §13.4 must agree
  with `ConceptId` and `DRUM_MESSAGE` on which words exist.
  Constraints:
  - design.md is never changed unilaterally — but this change IS the user's request
    of 13.08.2026, so design.md and CLAUDE.md move with the code, per CLAUDE.md §4.
  - Land with or right after the five build points, never long before them.
  - Rewrite to the FINAL state only; no "was X, now Y" trail in the documents.
  Quotes:
  Nutzer, 13.08.2026 23:32: »Lasse nochmal Sol prüfen, dass nicht noch irgendwo Reste der Spezifikation der bisher geplanten Kommunikationsmechanik stehen.«
  Refs: docs/communication-poc-spec.md, design.md 13.4, CLAUDE.md 7.1 criteria 6 and 7, docs/acceptance-criteria-detail.md 6 and 7, docs/acceptance-evidence.md 7
  Bundle: Dorfleben.

- [ ] 659. The whole communication chain, played through and judged by what reaches the
  PLAYER — A SIX-EYES ALL-ROUND REVIEW.
  ON HOLD (user 13.08.2026, 22:25: »Stoppe 659 erstmal — der macht erstmal keinen Sinn, wenn wir
  jetzt die Mechanik umbauen.«). This point must NOT be started while the communication rebuild
  is unlanded: it would play through and judge a state that will no longer exist. It keeps its
  number and its full spec below, sits BEHIND the rebuild points in the queue, and is resumed
  the moment the rebuild has landed — where it matters MORE than before, because it is then the
  proof that the NEW chain reaches the player. What is being rebuilt (conversation with the user
  on the evening of 13.08.2026; each part arrives as its own point): the vocabulary shrinks to
  FIVE words (RIVER, UPSTREAM, DOWNSTREAM, ROCK instead of BIG_ROCK, DIG), with COME, NO, HERE,
  GO_THERE, FOLLOW and THERE dropped; the trust/gift prelude goes, and the chief speaks from the
  start; the children teach ROCK/UPSTREAM/DOWNSTREAM through ONE running game between two rocks
  on the bank (the situation catalogue is dropped outright), the adults only RIVER and DIG; the
  two rocks in TODAY'S size stand on the bank, one upstream and one downstream, while the old
  stone in the village middle goes; and the chief's answer is exactly RIVER DOWNSTREAM plus the
  clay impression carried by the mould/impression system.
  (original spec, user 12.08.2026: "Danach will ich endlich mal
  erfolgreich die ganze Kette der Kommunikationsmechanik in diesem Dorf durchspielen können,
  ohne bei jedem Schritt sofort auf blockierende Bugs zu stoßen, obwohl du bereits mehrfach
  getestet und nachgebessert hast. Die QS war bei diesem Feature bisher offensichtlich völlig
  unzureichend."). THE RECORD BEARS HIM OUT: every part of this feature passed its own tests
  and the player still could not get through it, and the cross-vendor review of the children's
  proof needed four rounds before the proof could see the symptom at all (points 648, 656,
  657). What failed was not any single check but the SHAPE of the checking: partial chains
  verified in isolation, each green, with nobody walking the whole way as a player.

  THE METHOD IS SIX EYES, and the user named the three pairs (12.08.2026): the ENUMERATING half
  — what can break, what a player must be able to do, which step could silently not arrive —
  is collected BLIND PARALLEL by FABLE 5 and GPT-5.6 SOL, neither seeing the other's list, and
  OPUS 5 merges the two into one counted union, accounting for every entry as `only A`, `only B`
  or `merged with <id>` (`scripts/blind-merge.mjs`, `mechanism-review.mjs --merged-by`). That is
  the CLAUDE.md §6 rule with the models we actually have: the merger wrote neither list. The
  JUDGING half — does this play-through really work — is convergent and keeps the ordinary
  cross-vendor review, the reviewer reading the artefact before the author's rationale.

  WHAT IS COVERED — the whole chain a player walks, not its parts:
  1. Arriving in the village and HEARING the speech: the syllables are actually audible at the
     shipped defaults over drums and ambience, measured on the audio path, not merely "the call
     was made".
  2. The children's staged situations and the adults' errands: from the scene alone, can a
     player recognise WHAT is being expressed — the gesture, the object, the direction — or
     only that something was said?
  3. The guess: hypothesis label, the invitation, the dialog, and what the journal keeps of it.
  4. The chief: the culturally correct gift, his reply, and the hint it yields.
  5. The direction words, the glossary and the retroactive deciphering in either order.
  6. Search, excavation and the return — the goal chain to the victory state.

  HOW IT IS JUDGED: by what ARRIVES. Every step is played through as a player plays it — one
  continuous session per run, not a per-check probe — on BOTH backends, and each step is judged
  by the rendered picture, by the sound measured where it leaves the audio path, and by the text
  actually shown. A step that works internally but does not reach the player is a DEFECT, and
  the report says which of the two it was.

  THREE CAUSES ARE ALREADY NAMED AND MUST BE FIXED HERE, not merely re-measured (user
  observation on the deployed build, 13.08.2026, with the debug switch "language: show terms
  instead of syllables" ON — the adults' actions make no sense even WITH the words visible):
  1. THE TEACHING ROCK STANDS IN THE MIDDLE OF THE VILLAGE, NOT AT THE RIVER. `layout.ts` places
     it 6.5–13.6 m from the village centre on the golden-angle sweep, while
     `docs/communication-poc-spec.md` (rule 3) says "The rock lies upstream". Document and code
     contradict each other, and for the player it is a purposeless boulder on the village square
     that everyone walks to — and it is NOT the rock of the chief's drum message.
  2. THE ERRANDS HAVE NO VISIBLE PURPOSE. `walkToTarget`/`walkToSpeaker`/`followToTarget` end in
     standing about (`dwellSeconds` 6): nobody carries anything, fetches anything or works. Only
     the three DIG errands end in visible work. A word cannot be inferred from an errand that
     produces no result.
  3. THERE IS NO TEACHING ORDER. `ErrandView` knows villagers and geography, not what the player
     has already heard. The spec's method ("leaves exactly one unknown") presumes the six
     children's terms are already learned, and nothing enforces or encourages that — so the
     player hears two unknowns at once.
  ALSO OBSERVED, to be judged in the same pass: upstream and downstream are barely
  distinguishable at the bank ("recognisable with a lot of goodwill"), and the errand sequence
  reads as a fixed loop (a fair queue over few fillable errands).
  VERIFIABLE: a complete play-through of the chain from entering the village to the victory
  state, with no blocking defect, evidenced by the frames of each step, an audio measurement at
  the shipped defaults, and the journal it wrote; the three causes above demonstrably closed —
  the rock upstream and consistent with the spec document, every errand ending in a visible
  result, and a teaching order that does not present two unknowns at once; every further defect
  found is listed with its severity and either fixed here or filed as its own point, and the
  blocking ones are fixed before this point is ticked. The enumerating lists, their merge and the
  counted union are recorded.
  Criticality: high — this is the feature the release exists for, and the user is the one who
  keeps hitting the bugs.
  Bundle: Verständigung.

- [ ] 719. The Stop chain fires ONCE per headless batch session, so every guard whose
  stated effect is "blocks the turn end" is in truth a session-END guard for the
  one session that does the work (measured 18.08.2026, 15:1x).

  MEASURED, on the live owner d559dcb0 which had then been running 8 hours:
  `.claude/dashboard-state.json` holds `turnStartedAtBySession[d559dcb0] =
  18.08. 07:17:32` — its session start, unchanged since. The only Stop-hook
  record that session ever wrote is `.claude/decision-card-guard-state.json` at
  07:23:39; nothing after it. A `claude -p` session has one prompt and one long
  answer, so the Stop chain has one moment to run, at the end. Everything the
  chain enforces is therefore enforced once, hours after the state it judges came
  about. The visible cost that day: eight findings-carrier entries waited up to
  9.5 hours while `findings-core.mjs` line 373 (`ownsBatch && carrierPending > 0`)
  would have blocked every one of them — the rule was right, the hook never ran.

  FINAL STATE:

  1. THE FIRING RATE IS MEASURED, NOT ESTIMATED. `node scripts/stop-chain-audit.mjs`
     reports, per batch session of the last N days: session start and end, how
     often the Stop chain actually ran, and the longest stretch between two runs.
     It reads what already exists — the per-session turn stamps in
     `.claude/dashboard-state.json`, the timestamps every guard state file writes,
     and the session transcripts — and states per guard whether it ran once, never
     or repeatedly. A guard whose state file carries no per-session timestamp is
     reported as UNMEASURABLE by name rather than counted as silent: the audit's
     own blind spots are part of its output.

  2. EVERY WIRED STOP GUARD GETS A VERDICT, in a table in
     `docs/guard-enforcement-timing.md`: does its rule need to hold DURING the run
     (then its enforcement must move to a hook that fires during the run —
     PostToolUse, as `lock-heartbeat-hook.mjs` already does), or is the end of the
     work genuinely the only moment it can judge (then it stays, and the doc says
     why). The verdict is written per guard, never per family, because the families
     mix both kinds.

  3. THREE ARE DECIDED FIRST, because their lateness is already on record: the
     findings drain (this measurement), the board currency (the 25-minute window of
     28.07.2026 that produced `board-first-guard`), and the model allowlist (a
     forbidden author is worth catching at the commit, not eight hours later).

  4. WHAT MOVES, MOVES ONCE. A rule relocated to a during-the-run hook is REMOVED
     from the Stop chain in the same commit, so no rule is enforced twice with two
     different verdicts, and the fail-open wrapper and the pure Vitest-covered core
     stay as they are.

  5. THE SESSION LENGTH IS THE OTHER LEVER AND IS NAMED, NOT SILENTLY PREFERRED.
     If the audit shows the chain runs once per session as a rule, then a shorter
     session is the alternative fix — the context boundary already ends sessions at
     a point boundary. The point states which lever it chose for each guard and why;
     it does not have to choose the same one for all of them.

  VERIFIABLE: `node scripts/stop-chain-audit.mjs` runs against the recorded
  sessions of the last seven days and prints a per-session count plus a per-guard
  verdict; `npm run test:unit` covers its pure core, including a session with one
  run, a session with many, and a guard whose state carries no timestamp.
  `docs/guard-enforcement-timing.md` lists every guard wired in
  `.claude/settings.json`, and a unit test fails when a guard is wired without an
  entry there.

  Criticality: high — it is not one broken guard but the question of whether the
  Stop chain, this project's main enforcement surface, reaches the session that
  does the work at all. The four-eyes mechanism review applies.

  Bundle: unbundled (batch autonomy).

- [ ] 720. The findings carrier rings through the delivery that already runs on every tool
  call, instead of waiting for a turn end the batch owner does not have (user
  18.08.2026, 15:16).

  WHY HERE AND NOT A NEW CHANNEL. A stood-down window — the one the user talks to,
  and the one that therefore finds most of what he asks about — can write to the
  carrier and to nothing else. On 18.08. eight entries waited there up to 9.5
  hours. The transport was never the problem: `deliverPendingMessages()` in
  `scripts/chat-spool.mjs` already puts text into the owner's context on EVERY tool
  call, through `scripts/lock-heartbeat-hook.mjs` (PostToolUse, `*`), and the
  inbound chat leg is a live subscription that spooled the user's 14:30:45 message
  at 14:30:46. What is missing is that the carrier has no bell on that path. A
  SECOND message kind or a second transport was considered and rejected: it would
  split findings across two stores and re-open the signature and identity question
  that makes the chat inbox unusable for a session (an inbox envelope carries a
  direction and an HMAC, no sender, so anything a session posts there arrives as
  the user's own words).

  FINAL STATE:

  1. `deliverPendingMessages` gains a SECOND SOURCE beside the chat spool: when the
     reading session OWNS the batch and the carrier holds waiting entries, the
     delivery emits ONE line — the count, the oldest entry's timestamp, its title,
     and the drain command (`node scripts/finding.mjs --drain`). It reads the
     carrier through `parseCarrier`/`carrierPath`; it never writes to it, and the
     drain stays `finding.mjs --drained "<title>"`.

  2. ZERO BYTES WHILE NOTHING WAITS. The token rule the chat delivery already holds
     applies unchanged: an empty carrier produces empty stdout, because injected
     context is re-sent with every later request of the session.

  3. ONE INTERRUPTION PER CALL. A tool call that already delivers a chat message
     does not also ring the carrier bell — the user's own words go first, and the
     bell rides the next call.

  4. IT DOES NOT NAG. The line is emitted at most once per REMINDER_INTERVAL
     (15 minutes, one constant, in the pure core) and again immediately whenever
     the waiting count RISES, so a new finding is announced at once while an
     ignored one does not repeat every second.

  5. IT FOLLOWS THE PAUSE DECISION, WHATEVER IT BECOMES. Today
     `deliverPendingMessages` returns '' while the batch is paused. That
     suppression is itself under review (a pause is when an instruction matters
     most); the bell inherits whatever that review decides rather than carving out
     its own exception.

  6. NON-OWNERS SEE NOTHING. The carrier is drained by the owner alone, so a
     stood-down window is never told about entries it may not act on.

  VERIFIABLE: Vitest over the pure decision core — waiting entries plus ownership
  yields one line; an empty carrier yields ''; a non-owner yields ''; a call that
  carries a chat message yields the chat message only; a second call inside the
  interval yields ''; a risen count yields the line again. And the process-level
  shape in the manner of `scripts/chat-delivery-hook.test.mjs`: `node
  scripts/lock-heartbeat-hook.mjs` against an isolated temp repo writes the exact
  `hookSpecificOutput` envelope, and writes nothing at all for an empty carrier.

  Criticality: medium — it delivers no verdict of its own and cannot block work; it
  makes an existing, already-enforced duty visible while it can still be done. Its
  fail direction is silence, which is today's state.

  Bundle: Chat & Tafel.

- [ ] 515. The parallel-session detector counts a placeholder owner as a second
  SESSION (measured 05.08.2026). The batch PAUSED ITSELF at 13:06 because the
  alert "PARALLEL batch sessions" had gone five times unanswered. The alert was
  FALSE. `.claude/batch-lock.json` carried the placeholder `x` as its `sessionId`
  (still visible as `sessionIdBefore`, restamped 12:07). The detector compares the
  lock's owner id against the observed session ids; a placeholder matches no real
  id, so EVERY live session read as an additional one. The log proves it twice
  over: `08:06 owner=x plus 45289138-…`, `11:06 owner=x plus 52543006-…` — two
  different "second" ids against the same placeholder owner, and on both occasions
  exactly ONE claude process was running (pid 1470, the very pid the lock names).
  The cost is not the alert but the escalation: a self-pause that only a human can
  lift, on evidence that was never there.
  FINAL STATE:
  1. A lock whose `sessionId` is not a valid session id counts as owner UNKNOWN,
     never as a foreign owner. The detector may then report "owner unknown"; it may
     not report parallel sessions.
  2. A session whose pid equals the lock's pid is NEVER a second session, whatever
     the ids say — the pid is the stronger evidence and settles it first.
  3. Both cases are covered by Vitest in the pure decision core.
  4. The escalation chain itself stays untouched: five unanswered alerts still
     pause the batch. The point removes the false alert, never the response to a
     real one.
  5. A self-pause no longer writes a card into "Von dir zu klären" (user
     05.08.2026: "das liegt nicht in meiner Hand. Analysiere und behebe du das").
     That section holds GENUINE user decisions only; diagnosing a pause and
     lifting it is the session's own work. The pause is instead reported where the
     session's own state is reported — the now-card — so the reader sees it
     without being asked to act on it.
  WHERE THE PLACEHOLDER COMES FROM, MEASURED 05.08.2026 21:08 — the point above
  treats it as weather; it is written by our own code. `ownsLock(sessionId)`
  (`scripts/batch-singleton.mjs`) RESTAMPS the lock's `sessionId` to whatever id
  the CALLER passed as soon as process ancestry proves the lock belongs to this
  process tree. Any caller reaching it with a throwaway id — `--session x` through
  `resolveSessionId` — therefore renames a LIVE owner's lock to that id, which is
  exactly the `sessionIdBefore: <real id>` / `sessionId: "x"` pair both incidents
  left behind. `isProbeSessionId` is the only filter and does not recognise a bare
  placeholder.
  WHAT IT COST TODAY, and why item 2 above is not enough on its own: the renamed
  owner could no longer prove itself either, because `ownsLock` with the REAL id
  then answered `pid-reused` — point 504's drifting start-time compare, on the same
  lock, in the same minute. The live session was fenced out of its OWN batch (no
  merge, no push, no tick) with two delegated agents still building, and the claim
  path could not resolve it: the owner that must honour a claim at its next clean
  moment IS that fenced session, so the handover deadlocks. Ownership was restored
  by writing the recorded `sessionIdBefore` back by hand — the repair the toolchain
  does not offer.
  6. A RESTAMP DEMANDS A PLAUSIBLE SESSION ID. `ownsLock` renames a lock only for
     an id of the shape a real session carries; a placeholder, a probe id or an
     empty string leaves the recorded owner untouched and answers the ownership
     question without writing. Renaming a lock is a side effect of asking a
     question, so the question must be safe to ask.
  7. AN OWNER HOLDING THE LOCK'S PID HAS A SUPPORTED WAY BACK. Where the lock's
     `pid` is this very process (argv and session match) but the id no longer does,
     one command re-stamps it — `node scripts/batch-doctor.mjs --repair` treats it
     as a torn state and names it in its verdict, rather than reporting "consistent"
     as it did today. Hand-editing the lock is then never the only path.
  8. A SESSION THE SINGLETON ITSELF STOOD DOWN IS NOT A PARALLEL BATCH SESSION
     (measured 18.08.2026 from `.claude/autostart.log`). At 09:18Z and 12:18Z the
     detector reported "PARALLEL SESSIONS DETECTED: owner=d559dcb0 plus 7fe2e051"
     — 7fe2e051 being the user's ATTENDED chat window, which the singleton had put
     on STAND DOWN and which ran read-only measurements all day: no merge, no
     tick, no batch action of any kind. Here the COUNT was right and the JUDGEMENT
     wrong: the detector cannot see that it silenced one of the two itself. Five
     unanswered alerts then paused the batch at 14:18; the restart clock lifted it
     at 14:48. So a session carrying the stand-down note and no mutating action
     since counts as attended-observing — no alert, no escalation. The alarm for a
     genuinely second WORKING session is untouched. This branch is separate from
     items 1/2 above: those answer the placeholder owner, this one answers a real
     second process.
  9. A PAUSED BATCH STILL DELIVERS THE USER'S WORDS (measured 18.08.2026 15:0x,
     and it is the same incident's second half). The instruction "714: authoring
     lane Sol from now on" was sent at 14:30:45 and lay in the spool at 14:30:46 —
     the inbound leg is a live subscription and was one second fast — yet it
     reached the owner only around 14:49. Cause, at two places:
     `scripts/lock-heartbeat-hook.mjs` calls `deliverPendingMessages({ ownsBatch,
     paused })`, which returns '' while the batch is paused, and the launcher
     additionally stopped the watcher at 14:33 ("chat watcher: stopped (paused)").
     That is the wrong direction: a paused batch is exactly when an instruction
     matters most — lift the pause, do X first, stop Y — and the pause card asks
     the user to act in the same breath. FINAL STATE: the per-tool-call delivery
     keeps running while the batch is paused (the suppression was token thrift for
     an idle session, not correctness), and the watcher is NOT stopped by a pause —
     or, if it must stop for resource reasons, the launcher poll replaces it for
     the pause's duration and the pause card names the delay that then applies.
  VERIFIABLE: a lock carrying a placeholder id plus one live session produces no
  parallel-session alert in the pure core's tests, and the same setup replayed
  against the real detector stays silent; a Vitest case pins that the pause path
  writes no "Von dir zu klären" card; a placeholder id passed to `ownsLock` leaves
  the lock's recorded owner byte-identical while a real id still restamps; the
  doctor reports the pid-mine/id-foreign lock as torn and repairs it; a stood-down
  session with no mutating action since the note raises no parallel-session alert
  while a second WORKING session still does; and the pure core answers "paused
  plus a waiting message" with delivery rather than silence.

- [ ] 660. One session, two identities: the fence locks out the session that is working
  (measured 12.08.2026, 18:02-18:20). The launcher spawned session 6cd11926 at 17:57 (fence
  281), which took the batch and worked. At 18:02 the identity 986df9ff claimed the same batch
  (fence 282) — the SAME process id 1020, i.e. the same OS process under the session id it was
  RESUMED from. From then on the PreToolUse fence read 6cd11926 and refused push, merge, tick
  and board publish, while the PostToolUse heartbeat wrote the lease as 986df9ff — the working
  session was locked out of exactly the four paths that make its work durable, with no second
  window in existence that could have released it, and batch-claim waiting on a turn end of
  that same process. Two commits sat local-only until the next session pushed them, and a
  delegated agent's report carried the confusion ("the batch was handed over mid-task, the
  fence refuses the push").
  FINAL STATE: the fence and the lock/heartbeat read the SAME identity source, so a session can
  never fence itself out. Concretely: one function answers "which session id is this process",
  used by the fence, the heartbeat, batch-claim and the guards alike; a resume that changes the
  session id either carries the fence forward or re-fences under the new id in the same step;
  and a fence naming a session whose pid equals the CURRENT process is treated as OUR OWN, never
  as a foreign owner. VERIFIABLE: a Vitest over the identity function pins the resumed-session
  case (same pid, different id) as self, and a replayed fence/heartbeat sequence from this
  incident's timestamps ends with the working session allowed to push.
  Criticality: high — it silently strands finished work locally, which is the one state nothing
  can rescue.
  Bundle: unbundled (infrastructure).

- [ ] 663. The deploy dies on a frozen tag's flaky download (measured 12.08.2026, twice on
  run 31636330165). The GH-Pages deploy rebuilds EVERY version tag on every `main` push, and
  the frozen v0.2 tree's `onnxruntime-node` postinstall downloads a GPU tarball from GitHub
  releases at install time — that download ECONNRESET twice, so a pure network flake in a
  FROZEN tree blocked the whole deploy, including the fresh `main` build, and the CI gate held
  every turn end behind it.
  FINAL STATE: a tag whose content cannot change does not re-run a network-dependent install
  on every deploy. Either the workflow caches each tag's built `dist/` keyed by the tag sha
  (build once, reuse forever — a frozen tag's site is immutable by definition), or at least
  caches its `node_modules`/npm cache so the flaky postinstall runs rarely; plus one automatic
  retry around the per-tag install step. A tag build that still fails must name the tag and
  not take main's own deploy down with it where the workflow can publish partially.
  VERIFIABLE: the workflow run shows the cache hit for an unchanged tag (no onnxruntime
  download in the log), and a forced cache miss still succeeds via the retry.
  Criticality: medium — it stalls every landing behind a dice roll on a runner's network.
  Bundle: unbundled (infrastructure).

- [ ] 664. The estimate on the board expires unseen, and every card says "stand" twice (user
  13.08.2026: "Wieso ist die Endzeitschätzung der Karten wieder so veraltet? Ich denke, dagegen
  gibt es einen Mechanismus. Außerdem steht inzwischen immer 2x Stand drin - z. B. Stand 04:48
  Stand 04:49"). Two defects in the board, both MEASURED on the published page at 07:42 on
  13.08.2026.
  
  FIRST, THE STALE ESTIMATE. The mechanism the user remembers exists — `etaStatus` in
  `scripts/dashboard-guard-core.mjs` with `ETA_MARGIN_MIN` 15, read by the `eta` rule
  (`dashboard-guard-core.mjs`) and by `scripts/batch-in-flight-core.mjs` — but it speaks ONLY at
  the owning session's TURN END, so it says nothing while that session sits inside one long turn,
  and nothing at all once the session stalls or dies. Measured: the two now-cards read
  `22:59 · ~06:30` and `23:00 · ~05:30` while the clock read 07:42 — 72 and 132 minutes past,
  with no turn end in between. Point 411 already shifted the comparison forward by a margin for
  exactly this reason; the margin cannot help when nothing ticks. THE FIX MUST NOT DEPEND ON A
  SESSION: the promised end travels to the reader as DATA on the card (a `data-eta` attribute
  beside the rendered meta, written by `renderQueueCard`/`setCardStatus` from the same parse
  `etaMinutes` performs), and the board's own viewer script — which already runs in the reader's
  browser and whose clock always ticks (`scripts/board-refresher-core.mjs`) — renders an expired
  promise AS expired ("seit 1 h überfällig", German like the rest of the board), so the phone
  never shows a promise the page itself knows is gone. The session-side rule STAYS as it is; it
  is the second line, not the first. Additionally the launcher tick (`scripts/batch-autostart.mjs`,
  which already compares the published page against the repository) reports a card past its
  margin, so an owner that is alive is told before the reader notices.
  
  SECOND, THE DOUBLED STAMP. `renderCardBody` (`scripts/board-core.mjs`) prepends
  `<span class="stamp">Stand HH:MM</span>` to the first paragraph, while sessions additionally
  type "Stand HH:MM:" at the start of the text they hand in — the live board shows
  `<p><span class="stamp">Stand 04:48</span> Stand 04:49: Nach einer halben Stunde …</p>`, and the
  two times differ, so the reader cannot tell which one is the card's. `renderCardBody` therefore
  STRIPS a leading `Stand HH:MM` (with an optional trailing colon, dash or period) from the text
  it is given, and when that stripped time is LATER than the stamp it was called with, that time
  becomes the stamp — the writer's own reading is the more recent one and must not be silently
  discarded. One stamp per card, always, whichever way the text was written.
  
  TESTS: Vitest cases in `scripts/board-core.test.mjs` for the strip (leading stamp with and
  without colon, a later and an earlier one, prose that merely CONTAINS "Stand" mid-sentence,
  which must survive untouched) and in `scripts/board-refresher-core.test.mjs` for the
  viewer-side overdue rendering (before the end, inside the margin, hours past, and across
  midnight — `etaMinutes` already lifts a wrapped end onto the card's day and the viewer must use
  that same function, not a second parser). A rule in `scripts/dashboard-guard-core.mjs` refuses a
  card body whose first paragraph still opens with a second `Stand HH:MM`, so the strip cannot
  quietly stop working.
  
  THIRD, THE ESCALATION CARD THAT OUTLIVES ITS PAUSE. Measured 17.08.2026 on the live board: the
  watchdog writes a "Von dir zu klären" card when it pauses the batch after unanswered alerts, and
  nothing withdraws that card when the pause ends. The card still told the reader the batch was
  paused and asked him to lift it while `.claude/batch-paused` was gone and the batch was running;
  it surfaced only because the card-topic guard tripped over an unrelated cross-point reference in
  it. A card whose premise is a FILE withdraws itself when that file goes: the writer records the
  premise on the card, and the same publish path that renders the board drops a card whose premise
  no longer holds, so no reader is asked to act on a state that has passed. TESTS: cases in
  `scripts/board-core.test.mjs` for a premise-bearing card kept while its file exists, dropped once
  it is gone, and an ordinary question card — which carries no premise — never touched.

- [ ] 665. Every board card names its problem before its status — and a mechanism enforces it
  (user 12.08.2026, 23:21–23:24, asking about the 641 now-card).
  
  MEASURED 12.08.2026 23:24 on the published board: the 641 now-card body reads, in full,
  "Der Zweig zum ungeklärten Rot am Giza-Rand liegt seit einer gestorbenen Sitzung gebaut,
  aber ungeprüft im Baum. Ein zweites Modell nimmt ihn auf, urteilt zuerst über den
  erreichten Stand und schließt das Rot über eine benannte Ursache — nicht über einen
  späteren grünen Lauf. Berührt keine Datei der Kinder-Kur." — pure fix status. A reader
  cannot tell WHAT the unexplained red is (the `polish` suite's Giza settlement-edge
  picture check reds on WebGPU in one of three full runs; nobody knows the cause yet).
  The user had to ask in chat what the point is about; the board exists so he never has to.
  
  FINAL STATE:
  1. IMMEDIATE REPAIR: the 641 card (and any other card currently in the same state) is
     rewritten so its body OPENS with one sentence saying what the point is about, in
     terms the user recognises — the problem, not the branch state — with the status
     following. For 641 that sentence is roughly: "Der Bildcheck am Giza-Siedlungsrand
     (gefegter Boden messbar dunkler als das offene Land) wird auf WebGPU sporadisch rot,
     Ursache unbekannt."
  2. THE RULE: every card on the board — now-cards, queue cards, decision cards alike —
     opens with WHAT the point is about before any status. A body consisting only of
     status prose is not a valid card.
  3. THE MECHANISM (the user's explicit demand: "vor allem, dass es eine Mechanik dafür
     braucht, damit das nicht wieder passiert" — enforce, don't remind): the check must be
     STRUCTURAL, not a prose heuristic. The suggested shape — the author decides the final
     design, under mechanism review as usual: `board.mjs`'s card-writing commands take the
     problem statement as its own REQUIRED field, stored distinctly in the card structure;
     the renderer places it as the body's opening; a card whose problem field is missing,
     empty, or identical to its status text is REFUSED at write time, and the board guard
     in the Stop chain blocks a publish containing such a card (same family as the
     one-topic-per-card guard). Cards already published get a migration pass that fills
     the field from TASKS.md's point titles/first lines where possible and flags the rest.
  
  VERIFIABLE: Vitest over the board core — writing a card without the problem field (or
  with an empty one, or one equal to the status) is refused; the guard core flags a
  published card missing it; and the live board shows the 641 card opening with its
  problem sentence.
  
  Criticality: medium — the board is the user's only window into the batch; a status-only
  card hides what the work is FOR, and this is the second card-content rule that had to be
  retrofitted (after one-topic-per-card), so the class needs a structural gate, not
  another reminder.

- [ ] 669. A working author's pushes run CI over, and the supervisor pays for it (measured
  13.08.2026 on BOTH author lanes). `scripts/author-sol.mjs` pushes the working branch every ~2
  minutes so a dying run loses nothing. Every push starts a CI run, and the workflow's
  `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true` kills the previous one:
  twelve minutes into the run the branch carried three runs, two `cancelled` and one in
  progress, and NONE green. The SAME evening the same thing was measured on the CLAUDE lane,
  where nothing pushes on a timer: a worktree agent committing and pushing at every
  self-contained step — which CLAUDE.md §6 demands, because an uncommitted block is the one
  state nothing can rescue — blocked the supervising session's turn end three times in a row,
  each time for a commit in the middle of an unfinished point. Two consequences, both real:
  `ci-status-guard` can never find a concluded green run on that branch while the author works,
  and Actions minutes are spent on runs nobody reads. Measured again 19.08.2026 with TWO author
  lanes in flight at once: three consecutive runs ended `cancelled` because the next checkpoint
  overtook them, and while two lanes push in turn SOME run is always unconcluded — so the block
  is not repeated but CONTINUOUS, and it grows with the agent pool rather than with the point.
  FINAL STATE, and it has two halves because the two lanes fail for different reasons:
  (1) THE TIMER LANE. `author-sol.mjs`'s interim pushes are what CLAUDE.md §6 already calls a
  RESCUE commit — work committed because the run may die, no claim of completeness — so they are
  written as one: `[skip ci]` in the SUBJECT plus a `Rescue: <what the author was in the middle
  of>` trailer, which the `commit-msg` hook already demands in that pairing. The run's FINAL
  commit — the one that claims the work is done — carries neither and goes through CI normally,
  so the branch ends with exactly one meaningful run. If the author produces no final commit (it
  died), the branch is left with only skipped runs, which is honest: nobody claims that state is
  done.
  (2) THE SUPERVISOR'S GATE. A Claude agent's per-step commits are NOT rescue commits and must
  keep their CI — but they are not the supervisor's business either. `ci-status-guard` therefore
  gates the turn end on `main` and on any branch OFFERED FOR LANDING, and reports — without
  blocking — a branch whose author is still declared in flight. A branch stops being exempt the
  moment its author's declaration ends, so nothing lands on an unproven run.
  VERIFIABLE: Vitest over the commit-message builder (an interim commit carries both halves, the
  final commit neither, and a run that dies leaves no commit claiming completeness); Vitest over
  the guard's branch selection (main always gates, a landing candidate gates, a branch with a
  live author reports only, and it gates again once that author is gone); plus the next live run
  of EACH lane — the Sol lane showing ONE concluded CI run instead of a cancelled chain, the
  Claude lane showing a supervising session whose turn ends are not held by its agent.
  Criticality: medium — it does not corrupt work, but it blocks the supervising session's turn
  ends, which is how the batch stalls.

- [ ] 633. The release's closing run — two regressions with the cleanup between them (user
  11.08.2026, splitting point 174: "Dafür scheint mir die Schätzung von 1 h viel zu wenig
  zu sein"). 174 carried the whole release in one card estimated at ~1 h, which was true
  when it meant "tag and publish" and is false now that the closing run hangs off it.
  Measured on this tree: one LARGE regression is ~42 min of runtime (the SMALL tier ~8),
  and it is run TWICE with "flake-free" allowing repeats; the cleanup reads 761 code files
  / ~240k lines and 39 documents / ~534k words, and it is read TWICE because both models
  read blind of each other. So the work is a day or two, and it is not the tagging. This
  point IS that work; 174 keeps the irreversible last hour.
  ORDER: it runs AFTER point 631 (which anchors the sequence in the closing checklist) and
  AFTER 634, so its cleanup already merges through the third model, and BEFORE 174. Running it before 631 would prove nothing — nothing would hold the order of
  its own steps.
  FINAL STATE, in this order, each step recorded through `scripts/closing-guard.mjs --step`:
  1. FIRST full LARGE regression on BOTH backends at the HEAD to be released, flake-free,
     plus lint and the dependency audit.
  2. THE CLEANUP, as a BLIND-PARALLEL four-eyes stage (CLAUDE.md §6): GPT-5.6 Sol and
     Opus 5 work from the same inputs — the whole of `src/`, `scripts/` and every `.md` —
     to their own COMPLETE list of legacy cruft (dead code, stale docs, stale comments,
     contradictory or orphaned prose), NEITHER seeing the other's result before both are
     done. The two lists are then merged into a union deduplicated BY MEANING, keeping
     both readings wherever it is unclear that one subsumes the other, MARKING what only
     one side found, and dropping nothing for being unusual. Every entry is then decided:
     removed, kept with a written reason, or filed as its own point.
  3. SECOND full LARGE regression on BOTH backends, at a HEAD that includes the last
     cleanup commit — this is the run 631's order check measures.
  4. The remaining §9 steps: implementation sections, the graphics-detail doc, the §7.1
     acceptance criteria with evidence, open items, simplifications.
  THEN 174 takes over: report "ready to tag" and wait for the user's go.
  VERIFIABLE: `node scripts/closing-guard.mjs --status` shows every step recorded with its
  evidence, the second regression's evidence naming a commit younger than the youngest
  cleanup commit; both regression runs green on both backends; and the cleanup's union
  documented with, per entry, which model found it and what was decided.
  Criticality: HIGH — it is what the tag certifies, and v0.2 shipped with these steps
  skipped.

- [ ] 174. Tag the demo build `v0.3` and publish it at
  https://patrickvonmassow.github.io/Heart-of-Africa-Remake/v0.3/.
  GATE (user 10.08.2026, replacing the 19.07.2026 wording): v0.3 no longer waits for
  EVERY open bugfix — that gate was unreachable and pushed the release out
  indefinitely. What must be closed is exactly two classes:
  1. the CRITICAL bugs (the tier-c block at the head of the work order — anything that
     ends the player's session, loses the expedition, or voids a verification), and
  2. everything on the COMMUNICATION MECHANIC, until the PoC is in a usable state —
     that is the release's purpose.
  Everything else — visuals, ambience, wildlife, the big audits — ships AFTER v0.3.
  AND THE USER MUST HAVE GOT THROUGH THE MECHANIC ONCE (his decision 11.08.2026, 19:16:
  "Wir sind weit von einem brauchbaren Stand der Kommunikationsmechanik entfernt. Wenn die
  gemeldeten Bugs behoben sind, kann ich überhaupt mal anfangen, das eigentliche Feature zu
  testen."). Green gates are not enough: as long as the reported defects keep him from
  reaching the communication mechanic at all, nobody has tested what this release exists
  for. So the gate also requires one completed play-through of the mechanic on the
  deployed `main`, by the user. This tightens condition 2 above, it does not replace it.
  THE CLOSING RUN IS ITS OWN POINT (user 11.08.2026, on the estimate: the ~1 h here was
  true when this meant "tag and publish"). The SEQUENCE is binding and runs BEFORE this
  point: full LARGE regression on both backends → the blind-parallel four-eyes cleanup of
  legacy in ALL code and ALL documents (CLAUDE.md §6, closing step
  `cleanup-blind-parallel`) → a SECOND full LARGE regression after the last cleanup commit
  (`regression-after-cleanup`) → and only THEN the user's go for the tag. Point 633 carries
  that run; point 631 anchored the order in the closing checklist, which refuses a tag
  while the second regression does not stand after the cleanup. What
  remains here is the irreversible last hour: the tag, the `poc` move, the deploy and the
  check that the URLs serve the new state. No tag is cut on an unclosed state: this point
  is never ticked without a complete closing run recorded at the very HEAD that carries
  the tag, so the checklist gate holds here as much as it holds on 633.
  FINAL TAG HELD FOR THE USER. The tag and the /v0.3/ publish are the one
  irreversible, outward-facing step: do ALL the work up to it, then report "ready to
  tag" and WAIT for the user's explicit go for that tag (`tags-only-on-request`).
  When it comes, tag `v0.3` at that HEAD, MOVE the `poc` tag to the same commit, and
  run the deploy via `workflow_dispatch` — the Pages workflow enumerates every `v*`
  tag plus `poc` dynamically, but a tag push alone does not trigger it. Then VERIFY
  that /v0.3/ and /poc/ serve the new state, and FREEZE the tag: it is never
  re-pointed.

- [ ] 453. What is the lion eating? (user bug report 30.07.2026,
  `local/WasFrisstDerLoewe.zip`, seed 1608676381, east region at the river, WebGPU/high:
  "Er scheint zu fressen und die Geier kreisen, aber ich sehe keine Beute"; bundle Kadaver &
  Geier). In the frame the lion stands head-down in its feeding pose, vulture shadows circle
  over the ground — and there is no prey body anywhere. Two candidates, both consistent with
  the code: (a) the carcass was consumed (`carcassSeconds` reached 0 and it was removed) while
  the feeding pose and the vulture staging carry on — a state that does not clear when its
  subject disappears; (b) what remains is the prey remnant of `Wildlife.tsx` (the scrap left at
  the kill site), which renders as a small white sphere and reads to a human as nothing at all.
  Find out which by reproducing from the seed, then fix so that the picture always answers the
  question: while a predator feeds, something recognisable as prey lies under it; when the
  carcass is gone, the pose and the vultures end with it.
  VERIFIABLE: Vitest on the behaviour — a predator's feeding state cannot outlive its carcass,
  and a remnant that keeps vultures on station is itself renderable; plus a browser frame from
  that seed showing predator and prey together, on both backends.

- [ ] 658. The egress allowance must survive a container restart and the hours after it (user
  12.08.2026: "Das ist auch schon zum zweiten Mal passiert. Sorge dafür, dass das den
  Container-Neustart überlebt. Deine bisherige Maßnahme scheint also nicht wirksam gewesen zu
  sein."). MEASURED, and confirmed independently by GPT-5.6 Sol at effort high (diagnose,
  12.08.2026): the container's egress allowance is an ipset of RESOLVED IP LITERALS, written
  once by `.devcontainer/init-firewall.sh` at container start. `api.openai.com` is in that
  domain list, so the boot run is not what is missing — the addresses behind that name ROTATE,
  and the set keeps the snapshot. `api.github.com` survives because GitHub publishes CIDRs and
  the script adds those. The periodic top-up that was meant to re-resolve never ran once (fixed
  12.08.2026 in `scripts/batch-autostart.mjs`: a missing pid file on a fresh container threw out
  of the whole block), and even now it runs on the launcher's 15-minute tick.
  MEASURED AGAIN 17.08.2026, 09:50, AND ONE SENTENCE ABOVE IS WRONG: the boot run IS part of
  what is missing. Every Sol call failed, and the cause was not rotation — `chatgpt.com`,
  `auth.openai.com` and `api.openai.com` were absent from the set ENTIRELY. `postStartCommand`
  runs `/usr/local/bin/init-firewall.sh`, the copy baked into the IMAGE on 04.08.2026, whose
  domain list predates those three names; the repository's `.devcontainer/init-firewall.sh` has
  carried them since 10.08.2026 and nothing installs it, so only a container REBUILD would ever
  pick them up while every ordinary restart drops the lane again. Repaired for this container
  with `node scripts/firewall-allow.mjs` (additive, no flush). The cost is not only the outage:
  with Sol unreachable `review-sol.mjs` hands the review to the Anthropic chain and
  `ask-sol.mjs` exits 3 — each correct alone, together they move the whole load back onto the
  scarcer pool and SUSPEND the two-vendor policy of CLAUDE.md §6 without anyone deciding to.
  FINAL STATE: a cross-vendor review, a model call or a package fetch never fails on a stale
  allowance, on a container that has just come up or one that has run for a day. Concretely:
  1. The refresh is TTL-AWARE, not tick-shaped: it re-resolves at about half the shortest TTL
     of the names it holds (single-digit minutes for these hosts, not 15), with jitter.
  2. It is ARMED BY THE CONTAINER'S OWN START, not by whoever happens to open a session — the
     same boot path that arms the batch launcher, so a restart restores it unattended.
  3. It does not GROW without bound: the dynamic names live in their own set, refreshed by
     generation or by entry timeout, so a day of rotation does not leave a day of addresses
     standing. The static, published-CIDR names stay where they are.
  4. Every failure is LOUD, never skipped: the refresher not starting or dying, `sudo -n`
     refused, the set missing, DNS returning nothing, an insert failing, or the post-refresh
     probe still unreachable. A DNS failure keeps the last entries for a bounded grace period
     and is reported as a failure, never as a successful refresh.
  5. THE LIST THE CONTAINER BOOTS FROM IS THE REPOSITORY'S (17.08.2026). A domain added to
     `.devcontainer/init-firewall.sh` takes effect on the NEXT restart with no image rebuild —
     either the start path installs that file over the image copy, or it reads the domain list
     from the checkout. A name that is in the repository's list but not in the running set is
     itself one of the loud failures of (4).
  6. A session LEARNS OF THE CUT-OFF BEFORE IT WASTES A CALL ON IT: the batch's start-up check
     reports the OpenAI lane as unreachable, names `node scripts/firewall-allow.mjs` as the
     repair, and says what it costs in policy terms — while it holds, cross-vendor review is
     unavailable and authoring cannot go to Sol, so the §6 split is suspended, not ignored. It
     REPORTS; it never repairs the firewall unasked.
  NOT IN SCOPE, recorded so it is not re-derived: name-based matching in netfilter itself does
  not exist — a hostname in a rule is resolved once into literals. The only real name policy is
  a DNS-coupled set (dnsmasq `ipset=`/`nftset=` populating the set as answers are issued) or an
  egress proxy that enforces CONNECT/SNI; both need the privileged startup lifecycle to recreate
  them, which is why (2) is the load-bearing half. Sol's full answer, with its judgement of /24
  widening (worse than exact refresh: 256 addresses per answer, unrelated CDN tenants, and the
  present OUTPUT rule permits every port to them), is the design input.
  VERIFIABLE: a restart of the container, then a probe of `api.openai.com` immediately and again
  after the rotation window that broke it twice — both reachable with no manual step; the
  refresher's own log shows the re-resolves; a forced DNS failure produces the loud report and
  keeps the grace-period entries; and a unit test pins the schedule and the failure reports.
  Criticality: high — it takes out the cross-vendor review the four-eyes rule depends on, and it
  did so twice unnoticed.
  Bundle: unbundled (infrastructure).

- [ ] 642. Every check that can be load-proof is made load-proof, and the rest says so (user
  11.08.2026: "Was ist mit dem Problem, dass nicht alle Tests Last-resistent sind? … Das muss
  nicht mehr vor der 0.3 passieren, aber möglichst bald danach"). The rebuild that replaced
  wall-clock waits with waiting on the app's own state was applied CASE BY CASE, never swept:
  measured 11.08.2026, the bird's-eye half of the Ctrl-label check had taken the one-moment
  snapshot on 08.08., the settlement half never did, and the same defect reappeared there
  three days later. Nothing forbids the pattern, so the next one will appear again.
  THE TWO KINDS MUST BE SEPARATED, because "no test may fail from load" is only half
  achievable and pretending otherwise would produce a green that means nothing:
  1. A STATE check — does this exist, is it drawn there, does the label read that — CAN be
     made load-proof, and must be: poll on the app's own frames or state until the answer is
     stable, read every side of a comparison in ONE evaluation, never compare two separate
     round trips. Sweep every `scripts/verify/*.mjs` for the pattern and fix each site.
  2. A TIMING check — frame budget, animation smoothness, how long a step takes — is
     load-sensitive BY NATURE. It is not made load-proof; it is RECOGNISED: under load its
     verdict does not count as evidence (the runner already prints exactly that) and it is
     reported as UNMEASURED rather than red, so a loaded machine can never manufacture a
     failure nor hide one.
  3. A GATE keeps the pattern out: a pure test over the verify sources refuses a comparison
     assembled from two separate `page.evaluate` calls. The agent that found this case left
     the gate undone on purpose and asked for the decision — this point is the decision.
  THE NAMED CASES the sweep starts from, all three measured on `polish` (12.08.2026): the
  goat's planted foot and "fire shadows ON" both red on WebGL 2 at 00:34, taken while a
  WebGPU `polish` run and two building agents shared the machine, and both green on the same
  commit at 05:50 on a quiet one; the water rim's "handover zone" red once at 05:36 and green
  on its own retry. Each must come out of the sweep classified — repaired as a state check,
  or declared timing and reported UNMEASURED under load.
  VERIFIABLE: the sweep names every site it changed and every one it deliberately left,
  with which kind it is; the gate fails on a re-introduced two-round-trip comparison and
  passes on the fixed shape; and the throttle probe of point 640 shows 0/8 skew for each
  repaired state check that previously skewed.
  Criticality: HIGH — a suite that can fail from load makes every red arguable, which is the
  door point 640 closes from the other side.

- [ ] 630. A shell write into `.claude/` raises a prompt in the user's VS Code window
  (measured twice 11.08.2026 — once by a delegated agent, once by a direct probe; user
  requirement the same day: "Es dürfen niemals Rückfragen hier in VS Code kommen"). THE
  RULE, as measured: a write by SHELL REDIRECTION into `.claude/` raises the harness
  permission prompt regardless of our settings. `echo probe > local/perm-probe.txt` runs
  through unasked; the identical line against `.claude/perm-probe.txt` asks. Both settings
  files already allow Bash as a WHOLE tool with `defaultMode: dontAsk`, so the prompt comes
  from a protection layer ABOVE the allowlist and cannot be switched off by an entry in it
  (the five narrow entries in `.claude/settings.local.json` are the trace of earlier
  clicks, not the cause). Node scripts writing the SAME files through `fs` — `board.mjs`,
  `board-queue.mjs`, `batch-*.mjs`, `queue-rank.mjs` — never ask; not once across a whole
  night.
  FINAL STATE, without editing `settings.json` (editing it would itself raise the prompt):
  the PreToolUse chain already holds two guards on the Bash tool (`closing-guard.mjs`,
  `firewall-guard.mjs`). One of them gains a check that DENIES a shell line carrying a
  redirection, a `cp`/`mv`/`tee`/`sed -i` or an `rm` into `.claude/`, with a reason naming
  the right way instead — the project script that owns that file, or the Write tool. A
  hook's deny arrives BEFORE the prompt, so it turns a question to the user into an
  instruction to the agent. Separately, no test may write its state into `.claude/`: it
  goes to a temporary directory passed by environment variable, the way
  `decision-card-guard` already does with `DECISION_CARD_GUARD_STATE` — that is exactly
  what the point-590 agent got stuck on.
  VERIFIABLE: Vitest cases over the pure matcher — each of the write forms above against
  `.claude/` is denied with the naming reason, a read (`cat`, `grep`, `node … --status`)
  and every write outside `.claude/` passes untouched, and a `.claude` substring inside an
  unrelated word or path does not trip it; plus a test-hygiene case that no test writes
  into `.claude/`.
  THE CAUSE IS MEASURED (11.08.2026, and it is NOT the protection layer this point assumed).
  Two further prompts hit the user at 19:18–19:22 while he wanted to be away from the machine
  — an `Edit` on the memory carrier and `rm -f .claude/batch-paused` — so the permission mode
  was raised to `bypassPermissions` in BOTH settings layers, with the dangerous-mode
  acceptance flag already set. Prompts kept coming anyway. The session transcript settles why:
  this window's stored `permissionMode` is `acceptEdits` — 27 occurrences, no other value.
  `permissions.defaultMode` supplies the mode only to a session that HAS none; a session
  resumed with `--resume` carries the mode it was created with, and `acceptEdits`
  auto-approves Edit/Write while PROMPTING for Bash. That is exactly the split the user saw,
  and it explains the earlier reading too: our own Node scripts write through `fs` inside
  tools that `acceptEdits` grants, while every shell line goes to the prompt.
  SO THE ORIGINAL DIAGNOSIS WAS WRONG in its mechanism — the trigger is not the `.claude/`
  path, it is the tool CLASS under the session's mode. What survives is the requirement: no
  prompt may reach that window. Since no settings key reaches a running session's stored
  mode, the grant must happen where the prompt is raised — a `PermissionRequest` hook
  (`scripts/permission-autogrant.mjs`), which fires only once the harness is about to ask and
  therefore cannot overrule the PreToolUse guards, since a denied call never gets that far.
  That hook is BUILT and wired; what remains of this point is the second half below (no test
  writes its state into `.claude/`) plus a re-measurement of the path rule itself, now that
  the mode is known to confound every earlier reading of it.
  Criticality: high — the user has forbidden prompts in that window outright, and a prompt
  in an unattended session is a stall nobody is there to clear. Bundle: Modell & Wächter.

- [ ] 632. A lesson counts as served the moment its enforcer is named — not when it stands
  (user 11.08.2026: "Lehren sind schön und gut, aber es muss sichergestellt werden, dass sie
  auch eingehalten werden." MEASURED against the directory `docs/analysis_de/lesson-mechanisms.md`,
  107 lessons: 53 class 1 (an existing enforcer widened), 30 class 2 (a new enforcer), 24
  class 3 (a stated gap). But 29 entries name a REMAINDER that is not enforced today, mostly
  in the words "until point NNN is built, nothing protects against this pattern" — and 9 of
  the 12 points they name are still OPEN (602, 609, 553, 558, 560, 561, 629, 630, 631); only
  573, 612 and 572 are built. So the 1/2/3 classification measures the DECISION about an
  enforcer, not its EXISTENCE, and the check that forces the decision — `scripts/retro-core.test.mjs`
  — is satisfied as soon as the line is written. That is exactly what the user saw.)
  FINAL STATE:
  1. EVERY DIRECTORY ENTRY CARRIES A MACHINE-READABLE ENFORCEMENT STATE — `named`, `built`
     or `none` (a deliberate gap) — and, where it is `named`, the work-order point number
     that would build it.
  2. `built` IS NOT BELIEVED FROM PROSE. A check in the fast layer derives it from the TICK
     of the named point in the work order (`scripts/tasks-source.mjs` `readTasksAll`, so an
     archived point counts as closed), and FAILS when an entry claims `built` while its
     point is still open.
  3. A REPORT, NOT A BLOCKER, MAKES THE AGE VISIBLE. The closing run and the batch day's
     first turn list every lesson whose enforcer has been merely `named` for more than a
     calibratable N days, with its age and its point number. That number is the one nobody
     sees today.
  4. A REPEAT PULLS THE POINT FORWARD. The queue ranking moves such a point up as soon as
     the SAME mistake occurs a second time: the repetition is the evidence that the gap is
     expensive.
  EXPLICITLY NOT a blocking guard on the mere EXISTENCE of a gap. An honestly named gap is
  better than an invented cover (retrospective §3.32), and a gate on it would teach us to
  stop naming gaps at all.
  VERIFIABLE: Vitest over the directory parser and the tick derivation — an entry claiming
  `built` against an open point fails, the same entry against a ticked point passes, an
  archived point counts as ticked, and a `named` entry older than N days appears in the
  report with the right age; plus the report's own output asserted on a fixture directory.
  Criticality: high — it decides whether our whole apparatus of lessons takes effect or
  merely records.

- [ ] 639. The assurance regime for the release machinery (user 11.08.2026: "Das Ganze ist
  ein kritischer neuer Mechanismus … Überlege, ob du die drei verfügbaren Modelle hier noch
  intensiver zur gegenseitigen Absicherung einsetzen kannst … Der Umbau hat daher maximale
  Kritikalität und muss entsprechend gründlich verifiziert werden, bevor er scharfgeschaltet
  wird"). Points 635–638 decide, unattended and daily, WHAT is worked and WHAT is tagged. A
  fault there does not crash — it quietly works the wrong thing, or freezes a tag on a state
  nobody closed. This point is the regime those four are built under; it is written once
  here instead of four times, and each of them names it.
  IT RUNS FIRST AND ALONGSIDE, NEVER AFTER (user 11.08.2026: "Das Problem an diesem Vorgehen
  ist, dass der Punkt erst ganz am Ende steht und bis dahin schon einige Zeit lang die
  anderen Änderungen scharfgeschaltet sind"). He is right, and the correction is not to
  hurry this point but to bind it to each step: the hazard enumeration happens BEFORE the
  first line of 635, the differential harness is written WITH the deciding core rather than
  after it, and NOTHING of 635–638 is ARMED until its instrument here has been applied to
  it. Where an instrument is still owed, the mechanism ships report-only — it says what it
  would do and does nothing, which cannot cause the chaos an armed wrong decision would.
  FINAL STATE — five instruments, each answering a different failure:
  1. THREE-WAY HAZARD ENUMERATION, BLIND. Before a line is written, all THREE models — Opus
     5, GPT-5.6 Sol, Fable 5 — answer the same question from the same inputs and see none of
     the others' answers: what can go wrong with this mechanism, which state makes it act
     wrongly, what does it do on a torn file, a half-ticked block, two sessions at once? The
     three lists are merged by the model that wrote NONE of them, by the accounting of point
     634 (every input entry findable in the union). The union IS the test list; nothing is
     dropped for sounding unlikely.
  2. DIFFERENTIAL IMPLEMENTATION OF THE DECIDING CORE. The pure function that answers "is
     this block finished, and what follows" is written TWICE, independently, from the same
     spec by two different models, and a fuzz harness runs both over thousands of generated
     states — blocks with holes, ticks out of order, missing records, duplicates. ANY
     disagreement is a finding to be settled before either version ships. This is the one
     instrument that finds what all three models were confidently wrong about together,
     because it compares behaviour instead of opinions.
  3. ADVERSARIAL PASS ON THE ACTING HALF. A model that neither built nor reviewed the
     tagging gets one brief: make it tag a state that is not closed. Whatever it finds is a
     defect, not a scenario.
  4. SHADOW BEFORE ARMED. 636 runs report-only through at least one real release, and its
     proposals are compared by hand with what a human would have cut. Arming is a separate,
     recorded step.
  5. EVERY RULE THESE POINTS INTRODUCE SHIPS WITH ITS ENFORCER (user 11.08.2026: "Die
     Einhaltung sollen auch durch Mechanismen zugesichert werden"). Each of 635–638 carries
     a table — rule, and where it is enforced: a guard, a test in the fast layer, or
     explicitly NONE with the reason. A rule whose enforcer column is empty blocks the tick.
     This is the lesson of point 632 applied to its own construction: a rule that exists
     only as prose is a rule nobody keeps, and "the enforcer is named" is not the same as
     "the enforcer stands", so the column names the FILE that enforces it, not an intention.
     The hard cases are known in advance and none may end as prose: the tag acts only on a
     recorded complete closing; arming a mechanism out of shadow mode is a RECORDED step and
     the acting path refuses without that record; the backlog cannot be deleted; a point
     belongs to exactly one block; an intent from the page is refused unless it is signed.
  6. THE FOUR-EYES RECORD PER POINT. Each of 635–638 carries its own recorded review by a
     model that did not author it, and none is ticked on a `do-not-merge` or an unanswered
     `merge-with-fixes` — the criticality gate already enforces exactly this, and 636 is
     MAXIMUM, so it also carries the adversarial pass above.
  VERIFIABLE: the union of the three hazard lists exists with its accounting; the
  differential harness runs in the fast layer and reports zero disagreements over its
  generated corpus; the adversarial brief and its answer are recorded; the shadow log of one
  release exists and was compared; and `node scripts/criticality-review-guard.mjs --status`
  is clean for all four points.
  Criticality: MAXIMUM — it is the assurance the other four are trusted on.

- [ ] 635. The queue is cut into releases, and the cut is data (user 11.08.2026, sketching
  the board: "Unterteilung der Warteschlange in Releases … für jedes Release eines und
  unten ein Abschnitt Backlog"). Today the scope of a release is PROSE inside point 174 —
  nothing can check whether a point belongs to v0.3, and nothing tells the batch where one
  release ends and the next begins. As data it becomes what the whole release mechanism
  stands on: the block boundary IS the moment the closing run and the tag fall due (631/633).
  FINAL STATE:
  1. A point's release is a STORED ASSIGNMENT — one small tracked file, point number to
     block ("v0.3", "v0.4", or the backlog). NOT a second order: the sequence WITHIN a block
     stays derived from `TASKS.md`, exactly as points 590/608 established, because a second
     hand-kept list is the defect those points removed and the user saw twice.
  2. The board renders one collapsible section PER BLOCK, top to bottom, ending in "Backlog
     (bisher in keinem Release eingeplant)" — named so it reads as "not yet scheduled",
     never as "unimportant", or work quietly dies there. Each block header carries its count
     and the sum of its estimates ("Release 0.4 — 12 Punkte, ~40 h"), so an unrealistic cut
     is visible at a glance.
  3. `queue-order-guard` learns blocks: the rendered sequence must equal block order first,
     then the work order's sequence inside each block. Every open point sits in exactly one
     block; a point in none is REPORTED (the backlog is a decision, not a default).
  4. The work order names the block per point — one line, so the assignment survives without
     the board and a brief can carry it.
  5. BLOCKS ARE CREATED, DELETED AND ORDERED BY THE USER (his addition, 11.08.2026). Their
     sequence is STORED, never sorted by version number: he must be able to slip a "0.4.1"
     between 0.4 and 0.5, and no ordering rule derived from the name can be trusted to do
     that. Deleting an EMPTY block is immediate; deleting one that still holds points warns
     first, and on confirmation its points move to the TOP of the backlog IN THEIR ORDER —
     they were ranked against each other once, and that ranking is not thrown away because
     the block around them went.
  6. THE BACKLOG CANNOT BE DELETED. It is where a point goes when it belongs nowhere else,
     and a queue without it would have to invent one.
  EVERY RULE ABOVE SHIPS WITH ITS ENFORCER, in the table point 639 demands — a guard, a
  test, or an explicit "none" with its reason. A rule left as prose does not count as
  delivered.
  VERIFIABLE: Vitest over the pure derivation — a point in no block is reported; a block
  order that disagrees with the render blocks; the within-block sequence follows TASKS.md;
  a deleted block's points arrive at the top of the backlog in their old order; a block
  inserted between two others keeps the stored sequence; the backlog cannot be removed; an
  unreadable assignment file fails OPEN (no guard may trap a session). Plus the real
  board rendered from the live work order, with the current v0.3 set taken from point 174.
  Criticality: HIGH — every later release step reads this cut. Verified under the regime of
  point 639.

- [ ] 636. A finished block closes and tags itself (user 11.08.2026: "Du sollst diese
  Release-Blöcke von oben nach unten abarbeiten. Am Ende jedes Blocks soll automatisch der
  übliche Release-Abschluss passieren … Das Taggen auf die Release-Version kannst du
  selbständig immer direkt machen und es unter …/VERSION/ veröffentlichen"). This is the
  point that ACTS on its own, so it is the one that can do lasting damage: a tag is frozen
  and never re-pointed.
  IT NEEDS 631, 634 and 633 FIRST — the order check, the third-model merge and the closing
  run itself. Armed before them it would tag a state whose cleanup came after its only
  green regression.
  FINAL STATE:
  1. WHEN THE LAST POINT OF A BLOCK IS TICKED, the closing run of 633 is DUE, and the batch
     may not start the next block before it is recorded complete.
  2. THE VERSION TAG BECOMES OURS TO CUT. The standing rule — no tag without the user's
     explicit go — is SOFTENED by his decision of 11.08.2026, and everywhere it is written:
     `CLAUDE.md` §6 (release mechanism), the memory rule `tags-only-on-request`,
     `scripts/closing-guard-core.mjs` and every remedy text repeating it. The new rule:
     `vX.Y` is cut and published at `…/vX.Y/` WITHOUT asking, but ONLY on a HEAD whose
     closing run is recorded complete — the checklist gate stays exactly as binding, it
     merely stops waiting for a human sentence.
  3. `poc` STAYS THE USER'S. It moves only on his explicit go for that version, because that
     is the address he tests as "the current state".
  4. SHADOW FIRST, ACT SECOND. The mechanism ships REPORT-ONLY: it names the tag it WOULD
     cut, on which HEAD, from which recorded evidence, and does nothing. It is armed only
     after it has been right about a real release without acting. A frozen tag on a bad
     state cannot be repaired, so the cheap insurance is taken.
  EVERY RULE ABOVE SHIPS WITH ITS ENFORCER, in the table point 639 demands — a guard, a
  test, or an explicit "none" with its reason. A rule left as prose does not count as
  delivered.
  VERIFIABLE: Vitest over the pure decision — a block with an open point is not finished; a
  finished block with an incomplete closing record yields NO tag and names what is missing;
  a complete record yields exactly one tag proposal with its HEAD; `poc` never appears in an
  automatic proposal. Plus the shadow log of one real release, compared by hand against what
  a human would have cut.
  Criticality: MAXIMUM — it acts unattended and its mistakes are permanent. Verified under
  the regime of point 639.

- [ ] 638. A ticket I open myself gets its urgency decided, not its default (user
  11.08.2026: "Wenn du selbständig neue Tickets anlegst, bewerte deren Dringlichkeit …
  Wenn du unsicher bist, lege mir eine Karte unter 'Von dir zu klären' an. Das muss
  zuverlässig verankert sein"). Append-and-defer puts every new point LAST — the right
  default for a wish, the wrong one for a defect that breaks what the current release
  promises. The difference is exactly what the author knows while writing and forgets an
  hour later.
  FINAL STATE:
  1. OPENING A POINT ANSWERS ONE QUESTION: does it break something the CURRENT block
     promises (→ into that block, at the position its urgency earns), is it ordinary work
     (→ a later block), or is it not urgent (→ the backlog)? The answer is recorded WITH the
     point, in one line, so a placement can be read back and challenged.
  2. UNSURE IS AN ANSWER, and it has a destination: a "Von dir zu klären" card naming the
     point, the two placements considered and what makes it doubtful. Never a silent
     default.
  3. IT IS ENFORCED, not remembered: a new point carrying no placement decision blocks the
     turn end, the way the work-order guards already block an unranked append. Rule and
     enforcer land together — the lesson of point 632 is that a named enforcer is not one.
  VERIFIABLE: Vitest — a new point with no recorded placement blocks; each of the three
  placements passes; "unsure" passes only with a matching board card; the check fails OPEN
  on unreadable input. Plus a replay over the points opened on 10./11.08.2026, which must
  reproduce their actual placement or name the disagreement.
  Criticality: HIGH — it decides what is worked next, silently and every day. Verified under
  the regime of point 639.

- [ ] 637. The board becomes a place to decide, not only to read (user 11.08.2026: "Drag &
  Drop von Punkten in der Warteschlange … So kann ich selbstständig solche Änderungen
  vornehmen, ohne immer über dich gehen zu müssen").
  FINAL STATE:
  1. A card can be dragged WITHIN a block and BETWEEN blocks. On touch — the user reads the
     board on his phone in portrait — every drag has a MENU equivalent ("nach Release 0.4",
     "ganz nach oben"); dragging is the desktop path, tapping the mobile one.
  2. THE PAGE CANNOT WRITE INTO THE REPOSITORY, and the design says so rather than
     pretending otherwise: a move emits a SIGNED intent over the transport the chat already
     uses (`scripts/chat-core.mjs` — signed, verified, replay-proof; anything unsigned,
     stale or already seen is dropped). A session applies it: a move between blocks rewrites
     the assignment of 635, a move within a block moves the point's block in `TASKS.md`.
  3. THE LATENCY IS VISIBLE. A moved card reads "vorgemerkt" until a session has applied it,
     with the time it was requested. Without that the user drags, sees nothing happen, and
     drags again — the failure mode of every optimistic interface that is not one.
  4. BLOCKS THEMSELVES ARE MANAGED FROM THE BOARD, by the same signed path: create a block,
     rename it, move it in the sequence (a "0.4.1" slipped between 0.4 and 0.5), delete it.
     Deleting a block that still holds cards asks first and says how many it would move;
     confirmed, its points land at the TOP of the backlog in their old order. The backlog
     offers no delete at all.
  5. An intent that cannot be applied (the point was ticked meanwhile, the block is gone) is
     REPORTED on the board, never silently dropped.
  EVERY RULE ABOVE SHIPS WITH ITS ENFORCER, in the table point 639 demands — a guard, a
  test, or an explicit "none" with its reason. A rule left as prose does not count as
  delivered.
  VERIFIABLE: Vitest over the pure intent handling — an unsigned or replayed intent is
  refused; an intent naming a ticked point is reported; a valid between-block intent yields
  exactly one assignment change and no reordering; a within-block intent yields exactly one
  work-order move. Plus one real drag applied end to end, and the mobile menu exercised in
  the browser layer.
  Criticality: HIGH — it writes into the work order from a public page. Verified under the
  regime of point 639.

- [ ] 456. The test that is only green in the side tree (retrospective §3.68, 30.07.2026;
  bundle Testinfrastruktur). Two blockers of one day shared a cause: a test passed because a
  git-ignored file is ABSENT in the agent's worktree while it exists in the main tree — it
  measured its environment, not the behaviour, and would have gone red on the merge. Add a
  pure hygiene gate in the Vitest layer, after the pattern of this project's completeness
  gates (`src/config/quality.test.ts`): a test file must have its paths INJECTED and may not
  read a real repository path — `.claude/`, a git-ignored path, an absolute path into the
  checkout. Existing offenders are either fixed or listed in an explicit, justified allowlist,
  so the gate starts green and cannot be "fixed" by growing that list silently.
  VERIFIABLE: the gate's own tests (a compliant file passes, each forbidden shape fails, an
  allowlisted file passes with its reason present); `npm run test:unit` stays green.
  THE SAME CLASS FROM THE OTHER SIDE (measured 10.08.2026): `scripts/worktree-bootstrap.mjs`
  answered "NONE — this checkout already has node_modules" for a `node_modules/` that held
  exactly `.tmp`, `.vite` and `.vite-temp` — no package, no `.bin`. The brief calls that
  script the FIRST command in a new worktree, so its verdict is read as "set up". Commands
  still ran, but only because the worktrees sit INSIDE the main checkout and Node resolution
  walks up into it; anything that probes a PATH instead of resolving — the
  `<root>/node_modules/.bin/oxlint` shape point 606 replaced in `scope.test.mjs` — missed,
  and its red read as a defect in the change under test.
  ALSO IN FINAL STATE: the presence check requires a real dependency (a package directory or
  `.bin`), never a directory Vite created, and the verdict NAMES where the resolution
  actually lands. VERIFIABLE additionally: a fixture worktree whose `node_modules` holds only
  cache directories is reported as NOT bootstrapped and is linked.

- [ ] 558. A verify run taken in a worktree is destroyed with the worktree (measured
  08.08.2026 at the merge of point 549; bundle Testinfrastruktur). The render-verify
  ledger lives at `.claude/render-verify-state.json`, and `scripts/repo-paths.mjs`
  resolves `REPO_ROOT` from the SCRIPT's own location — so a suite run inside a git
  worktree writes its record into THAT worktree, never into the main tree, and
  `scripts/worktree-cleanup.mjs` deletes it with the directory. The cost is exact: the
  three WebGPU `polish` runs that proved point 549 on its branch were gone the moment
  the branch's worktree was cleaned, and `render-verify-guard` — correctly, by what it
  can see — demanded the WebGPU suite again on `main`, ~15 minutes more for a picture
  already taken. CLAUDE.md §6 delegates every point to a WORKTREE-isolated agent, so
  this hits EVERY delegated render point: the agent's own backend evidence never
  reaches the guard that asks for it, and the session either re-runs it or writes a
  deferral for a run that actually happened.
  FINAL STATE: a verify run records where the guard reads it — one ledger per
  REPOSITORY, not per working tree. The ledger path resolves against the git COMMON
  directory (`git rev-parse --git-common-dir`, whose parent is the main tree) instead
  of the script's own path, so a run inside a worktree lands in the main tree's
  `.claude/render-verify-state.json` and survives the cleanup. Each record NAMES the
  tree and the commit it was taken on, so a branch run is distinguishable from a main
  run, and the guard's coverage question is unchanged — was this backend proven since
  the last render-file edit — with no new exemption. Every other `.claude/` state a
  worktree agent WRITES and the main session later READS is checked in the same pass
  and either moved to the common directory or documented as deliberately per-tree.
  ONE SUCH SITE IS ALREADY MEASURED (20.08.2026, by the agent on point 758):
  `scripts/finding.mjs` derives the carrier path from `REPO_ROOT` as well, so a finding
  recorded inside a worktree lands in a worktree-scoped directory that no session reads
  and that the worktree cleanup deletes with the directory — the agent's finding on the
  CLAUDE.md follow-up was lost exactly that way and survived only through its closing
  report. A delegated agent therefore has NO working channel for a finding except the
  report, which is the one thing the carrier exists to replace. It moves to the common
  directory with the ledger.
  VERIFIABLE: a Vitest case pins the resolution in both directions — with a `.git`
  FILE pointing at a worktree gitdir the ledger path comes out in the MAIN tree, with
  an ordinary `.git` directory it is unchanged (the case must fail against today's
  code, or it proves nothing); a run recorded from a worktree is found by
  `coveringRun` in the main tree after that worktree is removed; and a finding recorded
  from a worktree is listed by `finding.mjs --drain` in the main tree.
  Criticality: medium — no product defect, but it voids the evidence of every
  delegated render point silently, which pushes the session toward re-running or
  deferring what was already proven.

- [ ] 574. A bare verify script photographs whatever server holds port 5173 (found
  09.08.2026 during the point-264 picture check; it had already invalidated one accepted
  picture acceptance before anyone noticed).
  `scripts/verify/enrichments.mjs` — and every suite that reads it — falls back to
  `BASE_URL ?? 'http://localhost:5173/'`. Run standalone, as the repair loop and every
  delegation brief tell an agent to do, the suite attaches to whatever dev server happens
  to be listening on that port. On 09.08.2026 that was a leftover server from an abandoned
  worktree, serving code from BEFORE the fix under test: every check passed, every frame
  looked plausible, and the picture that was accepted showed the OLD build. `run-all.mjs`
  cannot hit this — it starts its own server on a free port in its own working directory —
  so the trap sits exactly on the path taken when someone is iterating fast.
  FINAL STATE: a suite started without a server of its own REFUSES to run rather than
  guessing a port. The fallback to a hard-coded 5173 is removed; with no `BASE_URL` the
  suite either starts its own dev server (preferred — the repair loop stays one command)
  or exits naming the command that does. Where a server IS supplied, the suite asserts
  before its first screenshot that the server it reached serves THIS working tree — a
  build stamp the dev server exposes and the suite compares against the checkout it runs
  from — so an attached-to-the-wrong-server run dies loudly instead of photographing a
  stranger.
  SECOND WAY A FRAME PROVES NOTHING: IT IS EMPTY (found 11.08.2026, landing point 610).
  The collision suite rewrote `verification/52-collision-port-wall.png` as an ENTIRELY
  BLACK picture on the WebGPU lane — 23 KB against 657 KB, nothing in it but the HUD bar,
  where the frame is named for the port wall the camera is pressed against — and the run
  exited 0 with the shutter (`scripts/verify/frameSubject.mjs`) raising nothing. The same
  frame on the WebGL 2 lane shows the lit wall, so the picture proof was void on exactly
  the lane the player uses. The shutter projects the SUBJECT into the frame and asks
  whether it is in view; it never asks whether anything was DRAWN, and an empty picture
  answers "in view" as readily as a full one.
  FINAL STATE: the shutter refuses a frame with nothing drawn in it, on the same footing
  as one whose subject is out of view and with the same loud message — judged by what the
  renderer reports for the frame it just wrote (draw calls / triangles, the reading
  `sceneReady` already takes), never by file size. WHY the WebGPU lane draws that wall
  black while WebGL 2 draws it lit is ESTABLISHED as part of this, not guessed: either the
  player standing at a wall sees black on his own backend — a game defect, which then gets
  its own point — or the headless WebGPU lane cannot draw that view, which the deferral
  path must then say out loud instead of writing a frame.
  VERIFIABLE: pure Vitest for the refusal (no BASE_URL and no own server → a non-zero exit
  naming the remedy, never a run), for the stamp comparison (a mismatched stamp fails) and
  for the empty-frame refusal (a renderer reading of zero drawn geometry → no frame
  written, remedy named); plus the real proof — a suite pointed at a server from a
  DIFFERENT checkout must fail, where today it passes green, and the black port-wall frame
  must be refused where today it is written.
  Criticality: high — it does not break the game, but it silently voids the picture
  proof, which is the one check this project cannot replace with a test.

- [ ] 567. A killed session leaves its verify run behind, and nothing stops it
  (measured 09.08.2026, 00:12–00:14, on the resumption after the point-342 session died;
  bundle Testinfrastruktur). The dead session's `run-all polish enrichments` (pid 1641328)
  was still running nine minutes later, together with its Vite dev server and its headless
  Chrome, and it competed for the machine with the run the successor had just started.
  That is precisely the load that makes the software WebGPU lane report rate checks as
  product defects (points 506/564), so the successor's first evidence was worthless before
  it was read.
  TWO MECHANISMS LOOKED AND BOTH LET IT PASS:
  (a) `batch-doctor` ran first and reported `strayProcesses=0`. Its stray probe judges the
      MAIN checkout, and every one of these processes was launched from an agent WORKTREE
      (`.claude/worktrees/…`), so the one mechanism whose whole job is to mend a torn tree
      before work resumes did not see the loudest torn thing in it.
  (b) The point-296 quiet-machine check DID see them — it named all three by pid with
      "FROM THIS CHECKOUT" and the sentence "a forgotten dev server has already cost a whole
      unit run" — but only as a WARNING, after the run had already started, and its remedy
      (`--on-load=defer`) has to be passed BEFORE the run by someone who already knows. So
      the check that found the problem also let the tainted run proceed.
  FINAL STATE:
  1. `batch-doctor`'s stray probe covers EVERY checkout of this repository — the main tree
     and every registered worktree — so a verify run, dev server or automation browser from
     any of them is a stray. `--repair` ends them, logged by pid and command like every
     other repair, because an owner that is provably dead cannot own a process either.
  2. The quiet-machine check ACTS on its own finding: leftovers belonging to this project
     (a verify suite, a Vite server, an automation browser) are not a warning but a HALT —
     the run stops before its first frame, naming the pids and the one command that clears
     them. A run started against known self-inflicted load produces evidence nobody may use,
     which is worse than no run.
  3. The halt is overridable for the case where the leftovers are deliberate
     (`--on-load=proceed`), and an overridden run is marked in its output as taken under
     known load, so its timing verdicts are never later read as clean.
  VERIFIABLE: pure Vitest — the stray probe returns a worktree-launched verify process for a
  repository whose worktree list contains it, and `--repair` plans its termination; the
  quiet-machine verdict is HALT for a self-owned leftover, PROCEED for an unrelated busy
  machine, and PROCEED-MARKED under the override, with the pids named in every case.
  Criticality: medium, frequency HIGH (every killed session can leave one behind).

- [ ] 599. Measure what the cache and the calendar hide (point 572's measure 9). Two
  measurements the throughput analysis needed and did not have, delivered together because
  both are pure readings of data we already keep.
  (a) CACHE-PREFIX HYGIENE: plot `cache_creation` against `cache_read` per response over a
      session and name the spikes — a high write share in the MIDDLE of a session points
      at a per-turn change early in the prompt, a spike after a gap points at TTL expiry
      (a 42-min run without intervening turns costs ~0.23 M weighted on the next turn).
  (b) CALENDAR DECOMPOSITION: split the git span first-branch-commit → merge into
      building, verifying and waiting-for-the-merge, from named timestamps, and compute the
      CRITICAL PATH — machine hours are not calendar hours while three agents run in
      parallel, and that conversion is where our own ranking table slipped.
  (c) THE RUN RECORD MUST NAME THE STATE IT RAN ON. `recordRun` in
      `scripts/render-verify-recorder.mjs` stores backend, suite, exit, screenshots and reds
      — and neither the `git HEAD` nor the TREE HASH. So the two questions that would decide
      a verification memo cannot be asked at all: how often did the identical check run twice
      on an identical tree, and how often did a final proof run on a tree that differs from
      the one that was merged. Both fields are added, and the grouping by
      `(treeHash, suite, backend, tier)` becomes a reading. Nothing is BUILT on the answer
      until the answer exists — a cached green standing in for a real rendered result is the
      forbidden proxy, which is why the memo itself stays unbuilt.
  (d) THE RUN RECORD MUST NAME THE MACHINE IT RAN ON. `scripts/verify/machine-load-core.mjs`
      already computes a quiet/busy/loaded verdict and `run-all.mjs` already probes it — the
      verdict is simply not stored. Stored, it turns "browser reds correlate with load" from
      an anecdote into a measurement (first attempt against retry, by load level), and that
      decides whether the answer is a new semaphore or simply making the EXISTING
      `--on-load=defer` the default for browser suites. Widening what exists beats building.
  (e) THE PICTURE-READING PATTERN IS COUNTED BEFORE IT IS CHANGED: how many responses read a
      `verification/*.png`, how many images each carried, what share of a picture check that
      is. A proposal to view several frames per turn is worth up to ~1.58 M per backend per
      check IF frames are read one at a time today — which nobody has measured, and an
      earlier reading points the other way. If the count is low the idea dies for free. Were
      it ever acted on: frames stay full-resolution and individually attached, groups stay
      small, and this never becomes a contact sheet or a downscale.
  (f) GUARD TELEMETRY: which guard blocks how often, and what a blocked turn cost.
  Every reading joins `scripts/measure-task-cost.mjs`, and that tool becomes a RECORDED
  step of the closing cycle (`CLOSING_STEPS`), so every structural measure gets its
  before/after instead of a feeling.
  IT RUNS EARLY IN THIS SERIES, not late: four separate decisions now wait on it — the
  verification memo, the merge-candidate proof, the load semaphore and the frame-reading
  change — plus the machine-versus-calendar correction. A measurement that gates four
  judgments belongs before them, not after.
  Criticality: low — pure measurement; it changes no behaviour, and it is the precondition
  for judging the remaining structural levers.

- [ ] 512. The build order is paid again by every subagent (user decision
  05.08.2026 on the card "Bauanleitung für Subagenten aufteilen?"). Measured:
  `CLAUDE.md` is 61.6 KB — §1–5 8.0 KB, §6 13.6 KB, §7 37.5 KB (of which §7.2 is
  7.4 KB), §9 2.0 KB — and every delegated agent receives all of it, though a
  building agent never touches the 32 acceptance criteria, the batch handover, the
  board rules, the model policy or the release mechanics. An agent-facing core is
  ~19 KB, so ~68 % of the rule document falls away per agent.
  FINAL STATE:
  1. `CLAUDE.md` keeps ONE binding text and gains a declared SPLIT: the
     agent-facing core (goal, scope guardrails, stack, structure, commands, the
     working rules a builder obeys — commits, branch discipline, language, voice
     markup, test layers — and §7.2 self-verification) and the session part (batch
     ownership and handover, board, delegation machinery, model policy, release
     and closing). Neither is a summary of the other: every rule lives in exactly
     one of them, and nothing is dropped.
  2. Delegated agents receive the core only. The mechanism is the one that already
     exists for this purpose — the point brief (`scripts/point-brief.mjs`) — so a
     builder gets brief + core and no longer the whole document.
  3. A rule that moves keeps its enforcement: any guard, hook or test that reads
     `CLAUDE.md` by section is updated in the same commit, and the doc-budget
     entries follow the split.
  4. The session part stays the authority for a session that OWNS the batch, so
     nothing about the batch, the board or a release becomes less binding.
  VERIFIABLE: a delegated agent's prompt carries the core and not the session
  part; `scripts/point-brief.mjs` names which document it assumes; every rule of
  the old file is findable in exactly one of the two halves (a test sweeps the
  section headings for coverage and for duplication).

- [ ] 511. The memory index still carries what thirty guards now enforce
  (measured 05.08.2026 on the user's question about context cost). The numbers
  first, so the effort goes where the cost is: the memory INDEX is 13.2 KB / 86
  lines (~3.3k tokens) per session and the 74 entry files load only on recall,
  while `CLAUDE.md` is 61.6 KB (~15k tokens) and is paid AGAIN by every subagent —
  ~82 % of the session floor against the index's ~16 %, and the floor multiplies
  per agent. Splitting `CLAUDE.md` is the real lever, is the user's call and is
  published as the decision card "Bauanleitung für Subagenten aufteilen?"; this
  point does the part that needs no decision.
  FINAL STATE:
  1. Every memory entry whose rule is ENFORCED by an armed guard is retired from
     the index, its content living on wherever the guard documents itself. An
     entry stays when it carries a JUDGEMENT a guard cannot make (taste, history,
     a user ruling) — the test is "would a session behave differently without it,
     given the guard already fires?".
  2. `docs/rule-corpus-audit.md` records the measurement above and each retirement
     with its enforcing guard, so the next audit starts from evidence.
  VERIFIABLE: the index names no entry whose whole content is an armed guard's
  rule; the audit doc lists each retired entry beside the guard that replaced it.

- [ ] 471. The work order starves the pool it is supposed to feed (user 30.07.2026, drawn
  from the branch-per-point ruling: "Dann sollte die aktuelle Abarbeitungsreihenfolge dahingend
  optimiert werden, dass sie den potenziellen Vorteil der Bündel optimal nutzt"; bundle
  Session- & Repo-Hygiene). With one branch per point settled, a bundle's remaining value is
  its ORDER and its COLLISION MAP — and those two pull in opposite directions, which nothing
  in the order accounts for. A bundle is defined BY SHARED FILES, so its members are precisely
  the points that CANNOT run beside each other. "Order of work" in `docs/work-packages.md` is a
  strict bundle-after-bundle ranking, so a pool of three drawing from the top of it can be fed
  by ONE agent whenever the leading bundle's points collide — the cap becomes 1 of 3 without
  anything reporting it. The three slots ran full on 30.07.2026 only because that evening's
  points happened to come from three different bundles.
  FINAL STATE: the picker takes the next point from each of the top N DISTINCT bundles rather
  than the top N points, so the leading bundle contributes one agent and the next ones fill the
  remaining slots; the ranking in `docs/work-packages.md` stays the PRIORITY and is not
  reordered by the picker. Two points that must share a branch (same files, per point 452's
  grouping) count as ONE slot. Where the top bundles are not file-disjoint from each other, the
  ranking itself is adjusted so that they are — the priority order decides WHICH bundles lead,
  the disjointness decides only their arrangement among near-equals.
  THE NEXT-UP LINE IS NOT PART OF THIS POINT ANY MORE. It was added here when the queue was
  grouped and the next point had disappeared behind a collapsed bundle; the grouping was taken back
  out the same evening (point 472), so the first card of the flat queue names it again and a
  separate line would only be a second place for the same fact to go stale.
  THE REUSE IS NARROW AND IT IS THE RISKY HALF (user 30.07.2026: "Das klingt riskant, weil sein
  Kontext dann noch mit den Anforderungen des vorherigen Punktes verwaessert ist." — correct, and it
  bounds the rule rather than cancelling it). CONDITIONS, all of them: reuse ONLY when the next point
  touches files the running agent already holds — the case where a fresh agent would both re-read
  them and collide on the branch; the follow-up arrives as a FULL brief, the same document a fresh
  agent would get, opening with the explicit statement that the previous point's requirements are
  CLOSED and bind nothing here; one commit per point, so the diff stays attributable; and the
  four-eyes review reads the DIFF, never the agent's account of it. A third point in one context is
  not taken — after two the agent is done and the next goes to a fresh one, because the token saving
  shrinks with every reuse while the bleed risk does not.
  AND IT IS WATCHED, not assumed: the reuse is recorded per point, and if a reused agent's work
  draws more review findings than a fresh one's over the next ten points, the rule is dropped rather
  than defended. That comparison is part of what the reporting command prints.
  AND THE STORED ORDER IS NOT THE DOCUMENTED ONE (measured 30.07.2026, right after the flat queue
  came back). The queue renders from a hand-curated order array in the board data, and that array
  predates the ranking in docs/work-packages.md: the first card is 440 while the documented working
  order opens with Urlaubsfestigkeit. So the flat list reads as an order and is not the one the work
  is actually taken in — the same lie the grouping was reverted for, one layer down. The order the
  queue renders must BE the picker's order, derived from the documented ranking, never a second
  hand-kept list that can drift from it.
  WHAT THE DRIFT COST, measured 04.08.2026: the user's brief of 03.08.2026 put the communication
  PoC before the whole queue, and the session wrote that priority into TASKS.md as PROSE ("gives
  every point here PRIORITY over the rest of the queue") at 01:29. No picker reads prose. The
  ranking in docs/work-packages.md still opened with Urlaubsfestigkeit and the stored order still
  led with 440, so every successor session that night re-oriented from the queue, took its top and
  spent the hours until 09:21 on test infrastructure while the twelve points the user had put first
  sat at queue position 60. A declared priority that only the reader can see is not a priority.
  SO, in addition: a priority declared in the work order must be MACHINE-READ into the ranking, and
  a guard must fail when the two disagree — the declaration, the ranking and the stored order are
  one statement or the turn does not end.
  MEASURED, not asserted: the point is delivered when a command reports, for the current work
  order, how many agents the top of the queue can actually feed, and that figure is 3 (or the
  reason it cannot be). `--slots-free` already demands a reason for an idle slot; this makes
  the ORDER answer for it instead of the session.
  VERIFIABLE: pure cases on the picker — a leading bundle of colliding points yields one
  candidate and the next bundles fill the rest; a file-disjoint pair inside one bundle still
  yields two; the priority ranking is never violated by the disjointness rule; and the
  reporting command's figure matches the picker's own answer on the real work order.

Feature: the communication PoC. Reference: docs/communication-poc-spec.md, which
carries the lexicon, the staged contrasts and the decisions the brief left open.
The user's brief of 03.08.2026 gives every point here PRIORITY over the rest of
the queue.

Build order, chosen so no two parallel agents own the same file:
  wave 1  477 (src/communication) · 482 (src/world, place layout) · 479 (the figure)
  wave 2  478 (speech, needs 477) · 484 (journal, needs 477) · 488 (edge, needs 482)
  wave 3  480 (tag game, needs 479) · 485 (labels, needs 484)
  wave 4  481 (children teach) · 483 (adults teach)
  wave 5  486 (drums) · 487 (digging)

- [ ] 552. The CI guard replays a frozen reason and sends the reader at a green run
  (measured 07.08.2026, cost two turns of false search; bundle Testinfrastruktur).
  `ci-status-guard` caches its verdict per sha in `.claude/ci-status-guard-state.json`
  and re-asks GitHub every `RECHECK_MS`. The VERDICT is re-derived correctly — a sha
  whose runs are still pending stays `pending`. The REASON TEXT is not: it is written
  once, when the sha first goes pending, and replayed on every later block. Tonight it
  named `Deploy to GitHub Pages` run 31219906237 three times in a row as "still
  running" while that run had already concluded `success` minutes earlier and the only
  unfinished run was `CI`. Both statements the guard made were individually true —
  something was still running, and that run had once been running — but together they
  point the reader at a green run and hide the red one. Two turns went into querying the
  named run and confirming it was fine.
  FINAL STATE: the reason travels with the verdict. When a cached entry is re-checked,
  the text is re-derived from the runs that are pending AT THAT MOMENT, so it names a
  run that is genuinely unfinished; a cached reason is never re-emitted after its own
  re-check. Where several runs are pending, the message says how many and names them
  rather than picking one silently. The caching itself stays as it is — this is not a
  reason to ask GitHub more often.
  VERIFIABLE: Vitest on the pure core — an entry cached as pending against run A, then
  re-checked in a world where A concluded green and B is still running, reports B and
  not A; an entry re-checked with nothing pending stops blocking; the message for two
  pending runs names both. Plus a case pinning that no API call is added by the change.
  SECOND HALF, SAME GUARD (measured 11.08.2026): the guard watches EVERY pushed ref, and
  a ref a delegated agent is still BUILDING ON can never satisfy it. While one agent
  worked, its branch took a push every few minutes; GitHub's concurrency group cancels
  the in-progress run on each new push, so the branch presented `cancelled, cancelled,
  cancelled, queued` — never a CONCLUDED run. The main session's turn end was blocked
  four times in ~25 minutes, each block answered by a blocking wait that returned
  "cancelled" and taught nothing. The rule is right where it came from (26 red runs on
  `main` unseen for three weeks) and wrong here: an agent's intermediate commit is not a
  state anybody claims is done — the same reasoning that gives a RESCUE commit
  `[skip ci]` — and the state that must be green is the one `land-point.mjs` re-tests at
  the merge anyway.
  FINAL STATE, second half: (a) a CANCELLED run is never read as pending. A run that
  GitHub stopped because a newer push arrived is a known, harmless outcome, so the guard
  judges the NEWEST run per (ref, workflow) and names that cause where an older one was
  cancelled. (b) A ref carrying a
  LIVE delegated agent — the liveness probe of `scripts/batch-in-flight.mjs` already
  exists and is already consulted at the landing — does not BLOCK on an unfinished run;
  it is REPORTED as still building and judged when the agent reports. (c) A genuinely RED
  run blocks in EVERY case, agent alive or not: this must not become a way to push red
  work past the gate by keeping an agent running.
  VERIFIABLE, second half: Vitest over the pure core — a ref whose newest run was
  cancelled by a newer push does not block; a ref with a live agent and a pending run
  reports instead of blocking; the SAME ref with no live agent still blocks; a red run
  blocks with the agent alive. Plus the transcript case: four consecutive blocks naming
  cancelled runs produce one "still building" line instead.
  Criticality: low-medium — the gate's decision was right every time, so nothing unsafe
  landed. What it cost is trust and turns: a guard whose stated reason does not survive
  a check is one the next reader starts arguing with instead of obeying, and one that
  cannot be satisfied at all is one the next session looks for a way around.

- [ ] 460. A red verification must be diagnosable without re-running it (30.07.2026; bundle
  K). `runSuite` in `scripts/verify/run-all.mjs` captures each suite's complete output, prints
  only the verdict line plus, on a failure, the `FAIL`/`ERR:` lines and a hardcoded 12-line
  tail — and then DISCARDS the rest. So the context is already bounded; what is missing is the
  EVIDENCE. Diagnosing a red suite today means running it again, and a browser suite on two
  backends is the most expensive wall-clock item we have.
  FINAL STATE: `runSuite` — and the preview and cross-browser paths — writes each suite's
  complete captured output to `local/verify-logs/<run-stamp>/<suite>-<backend>.log` (`local/`
  is git-ignored) and prints that path beside the verdict line, so a session reads the tail of
  a NAMED file instead of re-running the suite. The failure tail length becomes calibratable
  (`VERIFY_FAIL_TAIL`, default the current 12) and applies to EVERY failure, not only a crash.
  What must NOT change: the SUITES' own stdout stays full — the runner parses `^PASS`/`^FAIL`
  counts, `console errors: (\d+)` and `failedChecks` out of it, and condensing the suites
  rather than the runner would blind exactly that parsing. A suite invoked DIRECTLY (`node
  scripts/verify/render.mjs`, the render-verify-guard's per-backend runs) is out of scope; the
  documented route for a condensed run is the runner's filter form, and
  `scripts/verify/README.md` says so. NOT the mechanism: a context compaction — a lossy
  summary of guard, lease and focus state is exactly what the point boundary was built to
  avoid.
  VERIFIABLE: the pure shaping (verdict line, the path line, the calibratable tail length,
  what a green versus a red suite prints) is covered in the Vitest layer; the live path is
  proven by an existing browser suite run writing its log file.
  PRIORITY: behind 458 and 459 — it is a wall-clock and diagnosis saving, not the context
  saving it was drafted for.

- [ ] 504. Every batch owner is dispossessed at half an hour of age
  (measured 04.08.2026, 18:50Z and root-caused at 19:00Z). The autostart launcher
  logged "owner provably dead (pid-reused) — taking over" and spawned a second
  session while the owner it judged dead was ALIVE and mid-work: it was running a
  browser suite for the point-499 classification and its own dev server was
  serving. Fifteen minutes earlier the SAME pid had read "owner alive". Nothing
  about the process changed — only the pid-reuse verdict did.
  ROOT CAUSE, MEASURED: the DERIVED pid start time drifts against the RECORDED
  one. Probing the owner's pid five times with the repo's own `probePid` returned
  `startedAt` 1785867604027–604031 while the lock recorded 1785867601073 for that
  very process — ~2.96 s apart, past the fixed `PID_START_TOLERANCE_MS = 2000`
  (`scripts/batch-doctor-core.mjs`). The probe derives the start time from a
  boot-time base (uptime/btime) that walks against the wall clock in this WSL2
  container, so the gap GROWS with the owner's age: at 15 minutes the drift was
  ~1 s and the tick read "pid-alive", at 30 minutes it was ~3 s and the same tick
  read "pid-reused". This is systematic, not a one-off — it dispossesses EVERY
  owner on EVERY long point, and it is exactly the double session the hard
  singleton of 24.07.2026 exists to prevent. Two browser-suite runs on one
  machine also invalidate every timing measurement the batch takes.
  FINAL STATE:
  1. PID identity is no longer judged by comparing two start times read from
     clocks that drift apart. Either both are re-derived from ONE reading at
     compare time, or identity is keyed on a drift-free handle (`/proc/<pid>`
     inode plus an argv match), or the tolerance grows with the owner's age.
     Whichever is chosen is written down with the measurement that justifies it.
  2. A "pid-reused" verdict against a pid whose `/proc` entry still names the
     SAME argv and session is not believed. The takeover additionally requires
     the corroborating signals the tick already reads — declared work advancing,
     heartbeat age — before it dispossesses an owner.
  3. A Vitest case feeds a DRIFTING clock base and proves a live owner of any age
     is never read as recycled; a genuinely recycled pid must still be caught, so
     the test covers both directions.
  REPRODUCED ON A SECOND OWNER (05.08.2026, 20:37): the launcher spawned session
  e3f5442b against the LIVE owner 7c21e596 (pid 2257916, 30:44 of age, eight
  running child shells including a browser suite in a worktree). Measured on the
  spot: the in-flight declaration recorded `pidStartedAt` 1785953215453 while
  `probePid` returned 1785953218212 for the same pid at that moment — 2759 ms
  apart, past the same fixed 2000 ms tolerance, on the same drift curve (~1 s at
  15 min, ~3 s at 30 min). The intruder stood down without touching the batch, so
  the damage stayed at one duplicated session; the drift is confirmed systematic
  and owner-independent.
  REPRODUCED A THIRD TIME, AND THIS ONE COST WORK (08.08.2026, 19:55:22Z): the
  launcher logged the same "owner provably dead (pid-reused)" against pid 1055612,
  which was ALIVE and mid-verification — the second-backend `polish` run for point
  342, started 86 s earlier, with its dev server serving. The dispossessed session
  took its point-556 notice and stood down correctly, so the stand-down half works;
  the run it was in the middle of died with it and had to be repeated.
  AND IT PROVES POINT 556 DOES NOT COVER THIS DOOR: `leaseTakeoverDecision` — the
  corroboration that refuses to dispossess a live owner whose declared work is
  advancing — was never reached, because "pid-reused" resolves to `provably dead`,
  which the tick ranks AHEAD of the lease branch. The owner had a valid declared
  wait on its worktree at that moment and it changed nothing. Clause 2 below is
  therefore about the DEAD door specifically: its corroboration must sit on the
  pid-identity verdict itself, not only on the lease path 556 hardened.
  A FOURTH TIME, AND THE STAND-DOWN HALF FAILED TOO (18.08.2026, 02:27:02Z): the
  launcher spawned session 2f6ba837 against the LIVE owner 967c5fb6 (pid 4186031,
  started 02:03:54Z, 23 minutes of age — the drift curve reaches the fixed
  tolerance sooner than the half hour this point is named for). What is NEW is what
  followed: the dispossessed owner did NOT stand down. Its authoring agent pushed
  b7bd085e to `feat/714-review-material-budget` at 02:33:17Z, six minutes after the
  successor had taken the lock, and the owner's process was still alive at
  02:36:41Z. In the 05.08 and 08.08 occurrences the stand-down contained the damage
  to one duplicated session; here both sessions worked the SAME branch.
  THE COST IS A LOST REVIEW ROUND, which is the expensive kind: the successor was
  running the four-pass cross-vendor round of point 714 against the head it had
  frozen (fb983984), and the foreign commit moved that head mid-round — the SECOND
  consecutive round on that point to be taken against a head that walked underneath
  it, and precisely the defect point 714 exists to mechanise. `batch-doctor.mjs
  --gate` reported `ownerAlive=true` and `consistent` throughout, so the doctor does
  not see this shape as damage.
  Clause 2's corroboration must therefore be joined by a clause 4: a takeover that
  turns out to have dispossessed a LIVE owner is detected AFTERWARDS as well —
  a second session's commit or push onto a branch the current owner has declared
  in flight is an alarm, not a routine event.
  The drift-free handle of clause 1 has a concrete candidate on this host: identity
  as (`/proc/sys/kernel/random/boot_id`, `starttime` jiffies from `/proc/<pid>/stat`)
  — both boot-domain, so the wall clock never enters the comparison. Measured while
  writing this: `processStartTime` computes `Date.now() - (uptime - starttime/HZ)`,
  and the uptime-derived boot instant stood 0.9 s from the `btime`-derived one on a
  quiet machine — under the 2000 ms tolerance at that moment, but on the same curve.
  VERIFIABLE: the unit layer pins both directions against a drifting base, and a
  batch owner older than an hour is still read as alive by
  `node scripts/batch-doctor.mjs` on this host.

- [ ] 517. The lease-expiry takeover ignores an honoured claim (measured
  05.08.2026). The launcher tick took the batch from session 91c1ac42 after 67
  minutes without a lease renewal (LEASE EXPIRED) and spawned a FRESH headless
  successor, although a claim from the user's own window d68e8df9 had stood since
  14:14 with `honour: true` — the same tick had still respected that claim at
  12:36Z ("reserved — the user is working in that window"). The boundary path knows
  the CLAIMING_WINDOW target (`boundaryHandover` in `scripts/batch-boundary.mjs`);
  the lease-expiry path in `scripts/batch-launcher-core.mjs` does not, and spawns a
  successor unconditionally. The consequence is that a user who wants to take over
  WITHOUT forcing anything can wait arbitrarily long: the batch moves from session
  to session past him.
  FINAL STATE:
  1. On lease expiry the launcher reads the claim state before it decides. With an
     HONOURED claim standing, the lock is RELEASED and RESERVED for the claiming
     window instead of being handed to a new successor — the same target the
     boundary path already resolves.
  2. Both paths reach that decision through ONE shared function, so a future change
     cannot fix one and leave the other behind; the boundary path keeps its current
     behaviour byte for byte.
  3. A claim that is expired, or whose claimant is dead, still yields a successor —
     the reservation follows the claim's own `honour` verdict, nothing else.
  4. The reservation is bounded: a claiming window that never takes the lock does
     not stall the batch forever, and what the bound is, is stated where the
     reservation is written.
  MEASURED AGAIN ON A SECOND TRIGGER (06.08.2026, 02:22Z): the same tick took the
  batch from session 898cbf40 with "LEASE EXPIRED — has not renewed for 55 min", in
  the same breath as its own reading "declared work advancing — branch
  refs/heads/feat/483-adults-teach-landscape — tip 2 min old; worktree … active 0 min
  ago". The owner was alive and stayed alive: two minutes AFTER the takeover it
  started a `polish` run that rewrote 34 verification frames inside the very worktree
  the new owner was merging from. The lease renews BEFORE each call, so an owner that
  legitimately WAITS inside ONE long call — on a delegated agent, on a browser suite —
  cannot renew at all; the in-flight declaration exists to hold the lock for exactly
  that case, but it lapses after 45 minutes and nothing extends it while its own
  evidence is still moving. The lease arithmetic itself is not in question (user
  30.07.2026) — what is missing is a renewal that runs OUTSIDE the blocked session.
  FINAL STATE (continued):
  5. The launcher tick, which already re-reads a declaration's evidence every cycle,
     EXTENDS the lease while that evidence is provably advancing, and stops the
     moment it is not. Ownership therefore stays arithmetic — a standstill still
     loses the batch, because quiet evidence renews nothing — but a wait that is
     genuinely working keeps it however long the call runs. The 45-minute lapse
     remains the backstop for a declaration whose evidence went quiet.
  6. Items 1 and 5 are the same decision and reach it through the shared function of
     item 2: one place decides what an expired lease means.
  VERIFIABLE: pure Vitest on the launcher's decision (lease expired + honoured claim
  → reserve, never spawn; lease expired + no claim → spawn; lease expired + expired
  claim → spawn; the bound elapses → spawn; lease expired + a declaration whose
  evidence still advances → renew, never spawn; lease expired + a declaration whose
  evidence has gone quiet → spawn), and the boundary path's existing tests stay green
  unchanged.

- [ ] 463. Two liveness readings the forced handover proved wrong (30.07.2026, both
  observed while taking the batch back by force; bundle Session- & Repo-Hygiene).
  PART A — A KILLED OWNER READS AS ALIVE FOR FIVE MINUTES. `assessOwner`
  (`scripts/batch-singleton.mjs`) returns `fresh-heartbeat` for any heartbeat younger than
  `DEAD_CONFIRM_MS` WITHOUT probing the pid, so a stopped owner keeps the batch for up to
  five minutes and the claimant is told, wrongly, that a live session holds it. FINAL STATE:
  when the lock carries a pid and a start time, a fresh heartbeat is confirmed by the same
  identity probe the claim path already uses; a heartbeat that is fresh but whose process is
  provably gone reads as DEAD at once. The generous window stays for a lock WITHOUT a usable
  pid (a legacy or foreign-host lock), where the probe cannot decide — that is what the
  window was for.
  PART B — A GUARD THAT DOES NOT STAND DOWN. `scripts/guide-brevity-guard.mjs` checks only
  `.claude/batch-paused`; it has no `heldByOtherLiveOwner` stand-down, and it blocked the
  turn end of a session that did NOT own the batch over doc debt the OWNER had just committed.
  The house rule is that every guard stands down for a non-owner and for a paused batch.
  FINAL STATE: the guard stands down like the others. IN THE SAME POINT, sweep the guard
  directory for the same omission — a guard is either wired with the stand-down or is
  deliberately global with the reason written beside it — and record the sweep's result in
  the commit message, so this is a one-off audit rather than a recurring surprise.
  VERIFIABLE: the pure layer covers both — a fresh heartbeat with a dead pid assessed as
  dead, a fresh heartbeat without a pid still assessed alive, and the guard's stand-down for
  a non-owner; the sweep is evidenced by the commit message naming every guard checked.

- [ ] 554. The chat watcher leaks orphans the supervision cannot see (measured
  08.08.2026 on a quiet machine, while point 309's regression ran). `pgrep -f
  chat-watcher.mjs` returns TEN live processes — the oldest running since 04.08.,
  three days — while `.claude/chat-watcher.json` names exactly one (pid 2861724).
  `watcherSupervision()` (scripts/chat-watcher-core.mjs) decides purely from that
  ONE recorded pid: alive → `none`, otherwise → `start`. A watcher that is not (or
  no longer) the one in the pidfile is therefore INVISIBLE to it and is never
  stopped, and every start that overwrites the pidfile orphans its predecessor for
  good. The drift hypothesis from `verify-owner-really-dead` was MEASURED and
  RULED OUT: `probePid(2861724).startedAt` deviates 231 ms from the recorded
  `pidStartedAt` against a 2000 ms `WATCHER_PID_TOLERANCE_MS`, so the supervision
  reads its own pidfile process as live and correctly starts no second one — the
  orphans are residue of earlier runs, not of the running tick.
  WHY IT MATTERS: each orphan holds its own ntfy subscription and can spawn a
  responder on one chat message — the multiple-answer failure the singleton work
  exists to prevent. It is latent, not cosmetic.
  FINAL STATE: the supervision judges the process POPULATION, not one recorded pid.
  It enumerates the live watchers by their command line (the `pgrep`-shaped probe
  the singleton family already uses), keeps the pidfile's process when that one is
  genuinely alive, elects exactly one survivor when it is not, and STOPS every
  other. Liveness stays by IDENTITY, never by bare existence, so a recycled pid is
  never killed for inheriting a number. A paused batch still stops all of them.
  SEPARATE AND COSMETIC, same file, fix it in passing: every line in
  `.claude/chat-watcher.log` is written TWICE, with identical millisecond and
  identical sessionId — one process writing twice, because stdout and stderr share
  one fd (`stdio: ['ignore', out, out]`, scripts/batch-autostart.mjs:390) and the
  logger emits on both. One line per event.
  VERIFIABLE: pure Vitest on the decision core with the enumeration injected — two
  live watchers plus a pidfile naming one yields `stop` for the other and `none`
  for the recorded one; a pidfile naming a DEAD pid beside two live ones elects one
  and stops the rest; a recycled pid (existence yes, start time outside tolerance)
  is never stopped as if it were ours; `paused` stops all; an empty population
  yields `start`. Plus a live check: after one launcher tick, `pgrep -fc
  chat-watcher.mjs` is 1, and the log carries each event once.
  IT STOPPED BEING LATENT (08.08.2026, 08:05): the user reported receiving the SAME
  answer seven times in a row for a reply this session sent exactly once. Eleven
  watchers were live at that moment. Ten were stopped by hand to end the user-visible
  spam, which is remediation and not the fix — the supervision that let them
  accumulate is unchanged, and a fresh tick spawns another whenever the pidfile's
  process is not the one it finds.
  Criticality: raised to HIGH — no longer a latent risk but a fault the user sees,
  and it reaches him directly rather than through the build.

- [ ] 455. A red that load did not explain (30.07.2026, measured: `batch-doctor --gate` called
  a real unit-test failure INCONCLUSIVE because of "1 live agent worktree", and that worktree
  had last been written the previous evening; bundle Testinfrastruktur). The load excuse is
  right in principle (retrospective §3.22/§3.48) and was wrong here: it downgraded a genuine
  red — the retro ledger demanding entries for three lessons — to "repeat later", which
  unattended means the batch runs on a red tree for hours. A worktree only counts as LIVE
  evidence of load when something has recently been WRITTEN in it (the probe of point 434
  already dates an agent by its edits — reuse it, do not build a second one), and the verdict
  names its evidence: which worktree, how old its newest edit, what CPU was measured. A stale
  worktree directory is debris (443) and never an excuse.
  THE SAME EXCUSE FROM THE PROCESS SIDE (11.08.2026, measured): the quiet-machine check of the
  verify runner counted the BATCH SESSION ITSELF as "another verify/browser suite run" — its
  evidence line named `pid 1373729: /usr/local/share/npm-global/bin/claude -p Autonome
  Batch-Wiederaufnahme …`, because the session's own prompt text contains the verify script
  names and the probe matches the whole command line. Unattended that is total: every run of an
  autonomous session declares itself loaded, so every red it takes is "not authoritative" by
  house rule. A process counts as load only when it IS a suite (its argv NAMES a
  `scripts/verify/` entry point as the program, not inside a prompt), and the session's own
  process and its descendants never count as load against themselves.
  VERIFIABLE: Vitest on the pure verdict — a red beside a worktree whose newest edit is hours
  old is BROKEN, not inconclusive; a red beside a worktree edited a minute ago stays
  inconclusive; the reason string names the deciding measurement. Plus, on the process probe: a
  `claude -p "<prompt naming scripts/verify/run-all.mjs>"` argv is NOT load, a real
  `node scripts/verify/run-all.mjs polish` argv IS, and the session's own pid never counts.

- [ ] 602. What else did we build and never use? (user 09.08.2026, on learning that the
  section runner of point 566 has never been used once: "Dass du 566 nicht eingesetzt
  hast, ist aber fatal und legt eine grundsätzliche Lücke auf. Lege einen weiteren Punkt
  an, um zu prüfen, ob es noch weitere Mechanismen gibt, die du gebaut hast, um Dinge zu
  verbessern, aber dann nie eingesetzt. Und überlege, ob es eine Möglichkeit gibt, sowas in
  Zukunft zu verhindern."). THE KNOWN CASE: 566 built `--section=<name>`, `enrichments`
  declares nine sections, the resolver and the PARTIAL marking work — and it appears in the
  verify README and in `tiers.mjs` and NOWHERE ELSE. No delegation brief, no agent prompt,
  no rule text names it; no recorded run is partial; the three agents commissioned the
  evening this was found were not told about it either. It was BUILT but never ROUTED, and
  nothing noticed for a day.
  THIS IS A DIFFERENT AXIS FROM POINT 591. That audit asks whether the practice obeys the
  written rules. This one asks a question no rule covers: which delivered CAPABILITIES are
  never exercised? A capability nobody was told about breaks no rule — it simply sits
  there, and every guard in the house stays green.
  PART ONE — THE SWEEP. Enumerate what was delivered as an improvement and ask, per entry,
  for EVIDENCE OF USE: the CLI flags and options of `scripts/**`, the debug-menu levers,
  the dev hooks (`window.__*`), the verify runner's modes and tiers, the recorded
  registers, and every helper a rule or brief was supposed to route work through. Evidence
  means a recorded run, a log line, a register entry, a commit that invoked it, or a
  document that puts it in someone's path — NOT the fact that it exists and is tested. Its
  own tests do not count: 566's resolver is Vitest-covered and was still never used.
  Each finding is classified: USE IT (route it, and say where), RETIRE IT (delete the
  capability and its tests — an unused mechanism is carrying cost), or KEEP UNUSED with a
  written reason (a fallback for a case that has not occurred is legitimately idle).
  PART TWO — THE PREVENTION, which is the half the user asked for. Three parts, in
  ascending cost:
  1. ROUTED IS PART OF DELIVERED. A point that builds a capability names, in the same
     commit, the place that makes someone reach for it — the delegation-brief building
     block, a rule line, a runner default, a printed hint at the moment of the expensive
     alternative. Building without routing is half a delivery, and this is the cheapest of
     the three because it costs one sentence at the time the author still knows where the
     capability belongs.
  2. EVERY CAPABILITY DECLARES ITS USAGE SIGNAL. At delivery, the point states what would
     PROVE the capability is being used — a counter, a recorded run, a log line, a register
     entry. A capability whose use cannot be observed is not finished, because nobody can
     ever answer the question the user just asked without reading the whole repository.
  3. A PERIODIC UNUSED REPORT, and deliberately a REPORT, not a block: a command lists the
     declared capabilities whose usage signal has not fired since delivery, past a grace
     period. It runs in the closing cycle, where a slow question belongs. It does not block
     a turn — an idle fallback is not a defect, and a gate that fired on one would teach
     everyone to declare no signal at all.
  DELIVERABLE: `docs/unused-mechanisms-audit.md` — the sweep with its evidence per entry
  and the three classes, plus what was routed on the spot; everything larger becomes its
  own appended point, ranked deliberately. The prevention's three parts land as rule text
  and as the report command, and the rule text is the part that must not be skipped.
  METHOD: the sweep is a DIVERGENT, ENUMERATING stage — "what did we build that nobody
  uses" is exactly the question where a reviewer handed a list checks that list — so it
  runs BLIND PARALLEL across both models and the two results are merged by MEANING
  (CLAUDE.md §6). The prevention's design is convergent and takes the ordinary review.
  Criticality: HIGH — every unused mechanism was paid for twice: once when it was built,
  and again in every hour it would have saved and did not.

- [ ] 603. The ground's micro-detail sits just under its own bar, and nobody owns it
  (measured 10.08.2026 during the acceptance of the play-session packages; the triage point
  of 04.08.2026 named this failure and closed without giving it an owner). The `settings`
  check `first-person ground shows micro-detail (edge energy)` reads a Laplacian mean of
  1.08–1.09 against a bar of 1.1 — red twice in a row on a QUIET machine, and
  `baseline-classify` against the pre-merge commit calls it PRE-EXISTING / stale
  assumption. It has therefore been red for days while every run charged it to "known",
  which is precisely how a check stops being evidence.
  WHAT MAKES IT WORTH A POINT rather than a threshold nudge: 1.08 against 1.1 is not a
  wrong number, it is a number without a verdict. Either the ground genuinely lost the
  grain that acceptance criterion 15 demands at eye height, or the crop the check measures
  no longer contains the surface it was written for. On 04.08.2026 the same check read 0.00
  with AND without the graphics card, which proved it was not the hardware and left the
  question open.
  FINAL STATE, decided BY THE PICTURE and never by the number (the triage point's own
  rule): take the frame the check measures at the current head, look at it, and say which
  of the two it is. If the ground lost its relief, that is a render defect and is fixed. If
  the check crops somewhere the relief never was, the CHECK is corrected — with the reason
  written into it — and never by lowering the bar until it passes. Whichever it is, the
  check goes green on a quiet machine twice in a row, or it is deleted with its reason.
  UNTIL THEN this point is where that red is charged, so an acceptance run can state its
  reds honestly instead of carrying an unowned one.
  Criticality: medium — no crash and nothing the player reports, but an unowned red inside
  the everyday gate is a hole in the one signal every other point is judged by.

- [ ] 528. The deploy that never reaches a runner leaves the site stale, and point
  526 IS UNPROVEN ON THE LIVE PATH (measured 06.08.2026, immediately after 526
  merged). Point 526's VERIFIABLE demands, besides its Vitest layer, ONE REAL
  DEPLOY RUN proving a commit still reaches the live site. That proof could not be
  taken: from 15:35 UTC GitHub Actions was degraded — two runs died in `Set up
  job` with `Failed to resolve action download info. Error: Internal Server
  Error` / `Service Unavailable`, `workflow_dispatch` answered HTTP 500, and the
  one run whose build succeeded (31117749040) had its `deploy` job cancelled at
  16:15:56 UTC with ZERO steps recorded, 15.5 minutes after becoming eligible —
  it never got a runner. What 526 DID prove against a real red run is its
  classifier: `classifyFailureCause` read run 31116867124 as `external` with the
  remedy naming the unblock command, so item 4 holds. Items 1, 2 and 5 — the
  cancel-and-retry inside a run that actually executes — remain unexercised.
  Consequence meanwhile: `main` stands at ee125053 while the site still serves
  c728c816, so the user judges render work against a stale build.
  The classifier half was BUILT the same evening, on `main`, because the guard was
  holding the session over a red no push could clear: a failed job that executed
  no step of ours now reads as external — but only where the failing workflow's
  OWN file is proven unchanged since its last green run, since a broken `uses:`
  or `runs-on` dies in the same shape and IS ours; such a red no longer blocks the
  turn end, it re-alerts hourly instead, and the waiver is judged against EVERY
  red on the commit so one outage cannot excuse another workflow's real failure.
  Two-pass Fable review recorded. What that leaves is below.
  FINAL STATE:
  1. The live proof of 526 is taken: one deploy run whose `deploy` job really
     executes, whose `Verdict` step prints its explicit line, and after which the
     served site matches `main`. Recorded in `docs/acceptance-evidence.md` beside
     the criterion it belongs to.
  2. It is settled by measurement whether the deploy job's own
     `timeout-minutes: 25` contributed to the cancellation (the 15.5-minute gap
     says it did not, but the value was chosen without this failure in view);
     the value is either justified in a comment or corrected.
  3. A deploy that never reached the site is NOTICED without a human looking:
     the batch learns that the served build lags `main`, names both revisions,
     and retries once GitHub answers again — the site being stale is the fault
     that matters, not the run being red. This is the item the outage showed to
     matter most: every alarm the project has fires on a RED RUN, and none on a
     site that quietly serves yesterday.
  4. The reviewer's two recorded residuals are closed or written off with a
     reason: a workflow byte-identical to its last green run can still be broken
     from outside (a retired `runs-on` image, a yanked action tag), which the
     "untouched" proof reads as an outage though only a push fixes it; and
     `fetchJobs` walks only the first 30 jobs of a run.
  VERIFIABLE: pure Vitest on the stale-site comparison (served revision vs
  `main`) and on the two residuals of item 4, plus the one real deploy run of
  item 1 with its run id recorded.

- [ ] 507. A lost WebGPU device ends the run quietly and the picture black
  (measured 05.08.2026, both quiet runs of `invariants` on the software WebGPU
  lane). The suite ends `2 pass, 0 fail` with 9 and 2 console errors —
  `AbortError: Failed to execute 'mapAsync' on 'GPUBuffer': A valid external
  Instance reference no longer exists`, `THREE.WebGPURenderer: WebGPU Device
  Lost: Reason: unknown`, `OperationError: Instance dropped in popErrorScope`.
  The checks after the loss never run at all; only the console-error gate turns
  the suite red, so the count reads like a partial pass and the loss itself is
  named nowhere. The same loss in the shipped game is what point 493 photographed
  on the mispinned lane: a black canvas behind a live HUD.
  FINAL STATE:
  1. The renderer NOTICES a lost device: `device.lost` is awaited, and the loss
     goes to the dev-mode assert channel with its reason, so every test run and
     every manual session detects it at the moment it happens.
  2. A suite whose device dies FAILS AT THE LOSS, naming it, instead of reporting
     the checks it managed before — a check count that stops early may never read
     as a pass.
  3. The player is told rather than left with a black picture: a lost device
     raises the same localized, dismissible notice path as the WebGL 2 fallback
     (both languages, from the language files), naming that the picture stopped
     and what to do — never a silent black canvas behind a live HUD.
  4. Whether the loss is the software lane's device giving up under a long run or
     a teardown racing an in-flight readback is decided BY THE EVIDENCE the first
     step now produces, and the answer is written into
     `docs/host-environment.md`'s lane section.
  VERIFIABLE: a Vitest case proves the loss handler fires the assert and the
  localized notice from a simulated `device.lost` in both languages; a browser
  case proves a suite that loses its device reports the loss as its failure
  rather than a truncated pass; and `VERIFY_GL=webgpu npm test -- invariants`
  either completes on this host or names the device loss as its verdict.

- [ ] 519. The journal's handwriting exists only on the author's own machine
  (measured 05.08.2026 while verifying point 394 in this Linux container). The
  journal's handwritten look (§16/§16.3, acceptance criterion 29) is asked for by
  NAME alone: `font-family: 'Segoe Script', 'Bradley Hand', 'Comic Sans MS',
  cursive` (`src/index.css:700`, and the observation input at :885). All three are
  HOST fonts — Segoe Script ships with Windows, Bradley Hand with macOS, Comic Sans
  with neither Linux nor Android. Where none is installed the browser falls back to
  the generic `cursive`, which on this host resolves to DejaVu Sans: an upright
  sans-serif. The chronicle then reads as plain text, the stroke-by-stroke reveal
  writes in that plain text, and the whole conceit of a hand-written journal is gone
  — for every player not on Windows or macOS, and for every verification frame
  captured off such a host (which is why frames 81/82/83 regenerated in a container
  are weaker evidence than the Windows-captured originals).
  FINAL STATE: the handwriting SHIPS WITH THE GAME instead of being borrowed from
  the host. One open-licence handwriting face is self-hosted as an `@font-face`
  from a repository-local woff2 (subset to the characters the two language files
  actually use, German umlauts and ß included), declared FIRST in both stacks with
  today's host fonts kept behind it and generic `cursive` last. It loads from the
  bundle like every other asset — never from a CDN, so the game's own look never
  needs a network — and the licence text travels with the file. Its size is stated
  in the commit that adds it, per the dependency-justification rule.
  VERIFIABLE: pure Vitest that both stacks name the bundled family first and that an
  `@font-face` rule defines it from a repository-local path (no `http(s):` source);
  and a browser check on this container — which has none of the three system fonts —
  that the journal's rendered text is actually drawn in the bundled face
  (`document.fonts.check`) and measures a different width from the generic fallback,
  so a silent fallback fails loudly instead of quietly producing plain text.
  Screenshot 81 refreshed on the bundled face.

- [ ] 551. The transient status hint is drawn on top of the region name (seen
  07.08.2026 in the verification frames `121-harmattan-pall-january.png` and
  `122-atlas-snow-february.png`, WebGL 2, and reproducible in every frame the
  enrichments suite writes while the canoe hint stands). The centred hint "The canoe is
  dead weight on land and slows me — better left in a camp for long overland stretches."
  and the region name occupy the SAME strip of the status bar, and both are drawn: the
  frames read "Westcanoe is dead weight …" and "Northanoe is dead weight …", the region
  word running into the hint's first word. It is not a clipping artefact — the hint's
  own bordered box sits over an unhidden label.
  Acceptance criterion 9 (`CLAUDE.md` §7.1) puts BOTH there on purpose: the region is a
  permanent stat and the hint renders "CENTRED inside the status bar itself, not in a
  separate floating panel". So the collision is by construction, and the fix belongs on
  the hint's side, not by moving it back out into a panel.
  FINAL STATE: while a transient hint stands, the status bar YIELDS the strip it needs —
  whatever permanent element the hint would overlap is hidden for its lifetime (not
  faded, not shifted under it) and comes back unchanged when the hint expires. The hint
  keeps its centred position and its box. Which elements can be yielded is decided by
  measured overlap, not by a hard-coded guess about which stat sits where.
  VERIFIABLE: a Vitest case on the HUD component — with a hint active, the overlapped
  permanent element is not rendered, and after the hint expires it is back; plus a
  browser frame showing the hint over a status bar with no text behind it. Both
  languages, since the German hint has a different width.
  Criticality: medium — nothing breaks, but it is the first thing in the picture a reader
  sees as sloppy, and it is in every screenshot the suites write.

- [ ] 464. A red unit layer reached `main` through the pre-push gate (user 30.07.2026:
  "Sorge dafür, dass das sicher nicht mehr passiert."; bundle Testinfrastruktur). CI run 30555562185 on
  `main`, commit `4d580957`, failed at step `npm run test:unit` — the guide-brevity audit,
  because that commit pushed `docs/analysis_de/vibe-coding-anleitung.md` over its budget. The
  commit four minutes later paid for it, so the red was brief, but it MAILED the repository
  owner and it is the second such report in one day. The pre-push gate exists precisely to
  make this impossible, and on the same afternoon it PROVED it can fail closed (it refused a
  push of this session's with "unit ran an unreadable file count … nothing was compared").
  So the defect is not "the gate is missing" but "the gate's verdict is not binding".
  THE PATH IS MEASURED, not guessed (11.08.2026, the same failure a second time): the push of
  `7eb2076f` turned `main` red at `npm run test:unit` and mailed the owner, and the red is
  `scripts/retro-core.test.mjs` — two freshly written retrospective sections without an entry
  in the lesson-mechanism ledger. Reproduced locally on that exact commit: 1 failed, 52
  passed. The gate let it through because it REUSED an older unit verdict:
  `.claude/pre-push-gate-state.json` names its last unit run at 2026-08-11T03:56Z with 9660
  tests while CI ran 9685, so no fresh run was recorded for this push, and the gate's own line
  ("unit ran N — the same N files as the last green run") says why: the reuse is keyed on the
  SET OF TEST FILES, which does not change when a test reads a DOCUMENT that did. That is the
  same blind spot `isProseOnlyPath` deliberately avoids elsewhere — a prose commit is not
  test-neutral when a test asserts about the prose.
  SO THE FIX HAS TWO HALVES: the reuse key must cover every input a test READS, not only the
  test files themselves (in doubt, run — a reused verdict is only ever an optimisation), and
  the verdict must be bound to the sha as below.
  FINAL STATE, whichever path it was: a push of `main` carries a RECORDED gate verdict — the
  HEAD sha it was computed for, the suite counts, the verdict — and a push whose recorded
  verdict does not belong to the exact sha being pushed is REFUSED, not warned about. An
  internal error in the gate refuses the push as well: this is the one guard in the project
  that must fail CLOSED, because the thing on the other side is a red `main` and a mail to
  the user. `--no-verify` is refused for `main` the same way.
  VERIFIABLE: the pure layer covers the verdict record (accepted for the matching sha,
  refused for a different one, refused when absent, refused on an internal error), and a live
  push attempt on a deliberately red tree is refused.

- [ ] 457. A recorded "do not merge" must not satisfy the gate (retrospective §3.67,
  30.07.2026 — three cases in one morning, one of which would have turned `main` red; bundle
  Modell & Wächter). `scripts/mechanism-review-guard.mjs` asks WHETHER the other model's review
  is recorded, not WHAT it says: an agent started its review in the background, finished before
  the verdict returned, and the branch looked reviewed. Make polarity and order part of the
  condition — a verdict of "do not merge" or "with corrections" no longer satisfies the gate;
  only a LATER verdict on a LATER commit does. Second half in the delegation brief
  (`scripts/point-brief.mjs`), at the line where the commit-per-step rule already lives:
  whoever commissions a review stays in the turn until it is back.
  SECOND SOURCE OF THE SAME JUDGMENT (measured 11.08.2026 on point 640, which the gate
  refused while every review it asked for existed). "Later" is decided by TWO facts: the
  clearing commit must DESCEND from the refused one, and the clearing row must be RECORDED
  after it. The first is a property of the code and is sound. The second is a property of
  when somebody typed the command — and an agent that reviews all round and writes its rows
  in one batch at the end can write them in any order. Here the closing `merge` landed in
  the ledger six seconds BEFORE the refusal it answers, so the gate reported "a later merge
  exists, but not for a LATER commit" about a commit that demonstrably descends from it, and
  the point could not be ticked until the row was written again.
  FINAL STATE for it: the descent test decides alone where it can. Where the clearing
  commit descends from the refused one, the review IS the answer, whatever order the rows
  reached the file — record time only breaks a tie the code cannot (two records against the
  SAME commit, where nothing changed between them, which is the case the rule was built
  for). The refusal the gate prints names which of the two facts is missing, so the reader
  is not sent to look for a fix that was already made.
  VERIFIABLE: Vitest on the decision — a negative verdict blocks, a positive one on an OLDER
  commit blocks, a positive one on the current commit passes; a positive one on a DESCENDANT
  commit passes even when its record timestamp precedes the refusal's; two records on the
  SAME commit still block; the brief's text is pinned by its existing test.

- [ ] 510. The render-verify core counts a run that never confirmed its backend
  (four-eyes review of point 505's gate change, 05.08.2026 — the reviewer cleared
  that change and left these three beside it).
  FINAL STATE:
  1. `coveringRun` (`scripts/render-verify-core.mjs`) counts a run only when it
     also CONFIRMED its backend. Today it reads the exit code alone, so a run that
     never reached `assertBackend` covers — and since that call is what writes the
     feature level, such a run carries neither signal and still passes. Vitest
     pins both directions.
  2. `coveringRun(runs, b, since, null)` no longer throws: the options default
     catches `null` as well as `undefined`, or the totality test stops claiming
     more than holds. The outer guard catches it fail-open today, so this is
     honesty about the core's contract, not a live defect.
  3. The CLOSING (§9) demands a core-level WebGPU sighting once per release, so a
     compatibility-level lane never becomes the sole WebGPU evidence for a tag.
     The turn gate stays level-agnostic — demanding core there would hard-block
     every render change on a host whose only adapter is compat (point 505).
  VERIFIABLE: Vitest — an unasserted run never covers, an asserted one does, and
  the options default survives `null`; `scripts/closing-guard-core.mjs` carries the
  core-level step and `--status` lists it.

- [ ] 518. The shutter judges its aim before the wait and never re-judges (found
  05.08.2026 while closing point 489). `captureFrame` checks that the frame's
  declared subject is in the picture, and only THEN waits up to 120 s for the scene
  to finish drawing. Nothing re-judges the aim afterwards. Where the camera drifts
  during that wait, the frame is written with its subject out of view while the
  shutter reports it was in view — precisely the class of defect points 375 and 489
  exist to prevent. The drift is not hypothetical: the Nile current carries the
  traveller downstream for as long as he stands in the river (CLAUDE.md §7.1 pt. 21),
  which is why frames 117/118 had to be re-aimed immediately before each shot rather
  than once at the start.
  FINAL STATE:
  1. The subject check runs AGAIN after the readiness wait, immediately before the
     shutter opens, and that second reading is the one that decides. A frame whose
     subject left the picture during the wait FAILS LOUDLY, naming what was found
     instead — the same message the first check already produces.
  2. The re-probe costs nothing where nothing moved: it is the existing projection
     read, not a second settle.
  3. The re-aim that points 117/118 carry today is no longer the mechanism that
     keeps a drifting frame honest — it may stay as an aim, but the guarantee comes
     from the shutter.
  TWO MORE FINDINGS FROM THE FOUR-EYES REVIEW OF 489 (Fable 5, 05.08.2026, verdict
  merge-with-fixes — they belong here because they are the same gate and the same
  file, and one verification round should close all three):
  4. STILLNESS CONFLATES FINISHED WITH NOT-RENDERING. The readiness verdict reads
     only the draw-call and triangle counts, so a render loop that has STALLED
     freezes them exactly as a finished scene does — and the shutter opens on a
     half-built frame. The wait must additionally demand that the frame counter is
     ADVANCING, so "the numbers stopped moving" can only mean the scene settled,
     never that drawing stopped.
  5. THE QUIET WINDOW HAS ALMOST NO MARGIN. `quietMs` is 5 s against a plateau
     measured at 4 s — one second of reserve on the host the wait was written for,
     and this is the class of value that a slower host eats first. Set it from the
     measured plateau with a stated factor, calibratable like every other such
     value, rather than as a bare constant. The blank-frame FLOOR is re-measured in
     the same pass: `sceneReady-core.mjs` states blank frames stand at 5.5k
     triangles while `world.mjs` measured blank washes at 14–16k against a 20k
     floor — two comments in the same change contradict each other, and the
     surviving one is whichever the measurement supports.
  6. `settle: false` IS UNREACHABLE FOR EVERY KIND BUT `world`.
     `normaliseDeclaration` (`scripts/verify/frameSubject-core.mjs`) keeps the
     `settle` field only for `world` frames and drops it silently for `general`,
     `local` and `place`, so those can never ask for the drawn-only mode. The
     measured consequence is in `scripts/verify/visualsweep.mjs`: its filmstrip
     frames are `general` frames taken WHILE THE TRAVELLER DRIVES AWAY — the motion
     IS the strip — and they now serve the full stand-still wait, which under
     continuous streaming risks the 120 s timeout and in any case destroys the
     1.8 s cadence the strip exists for. The mode must be reachable from every kind
     whose frame can legitimately photograph a moment, and a dropped field must
     never be the silent answer.
  7. AN ELEMENT FRAME PHOTOGRAPHS THE WHOLE SCENE WITH NO WAIT AT ALL (measured
     05.08.2026 on the point-394 branch: `verification/81-handwriting.png` showed a
     BLACK settlement — no ground, no buildings, only floating labels — while the
     same suite's later frame drew Cairo's alley completely; reproduced on a quiet
     machine, so it is systematic, not load). `sceneReadyMode`
     (`scripts/verify/sceneReady-core.mjs`) returns `'none'` for every
     `kind: 'element'` frame, on the reasoning that a DOM subject is complete the
     moment it is on screen — but `captureFrame` then takes a FULL-PAGE screenshot
     unless the declaration carries `clip` or `locator`, so the whole 3-D scene
     behind the element is photographed with no readiness wait at all. Measured
     across `scripts/verify/*.mjs`: 22 element frames, 21 of them full-page, none
     using the `sceneReady: true` escape hatch. The mode must follow the CAPTURE,
     not the subject: an element frame that writes the full page serves the same
     stand-still wait as any other scene frame, and only a clipped or locator-bound
     capture keeps the no-wait mode. `scripts/verify/sceneReady.test.mjs` pins the
     current rule (its "its subject is DOM" case) and changes with it.
     REPRODUCED ON `main` (05.08.2026 21:25, both backends green): a plain `flow`
     run rewrote `verification/02-port-cairo-trade.png` with the settlement behind
     the trade dialog BLACK, where the committed frame shows Cairo's alley. So this
     is not one branch's accident — every element frame in the set is one slow load
     away from photographing an empty world, and the eight frames that run rewrote
     were restored rather than committed.
  8. NOTHING EVER ASKS WHETHER THE CANVAS DREW (found 09.08.2026 by the four-eyes
     review of point 566). A `place` or `local` frame proves its subject through the
     DOM labels, and those labels sit in the HUD layer — they are on screen whether
     or not the scene behind them rendered. Measured: that branch rewrote
     `verification/77-enrich-village-life.png` from a Maasai village (huts, fire,
     inhabitants, 669 KB) to a BLACK canvas carrying only the HUD and the Market
     Hut / Chief's Hut / Elder labels (31 KB), and the shutter opened on it and
     exited 0. Item 7 closes the no-wait path that produces such a frame; this item
     closes the ACCEPTANCE of one, which is the half that makes it evidence.
     FINAL STATE: any capture that includes the canvas additionally requires the
     canvas to have DRAWN — the written frame is sampled and REFUSED when one colour
     occupies more than a calibratable share of it (start at 98 %: a rendered
     African scene never approaches that, while a black or single-wash canvas
     exceeds it immediately). The refusal names the dominant colour and its share,
     in the same voice as the subject refusal. A frame that legitimately photographs
     a near-uniform picture declares that intent explicitly rather than being
     exempted by kind, so the exemption is visible in the declaration and not a
     silent property of the mode. A clipped or locator-bound capture that never
     includes the canvas is out of scope.
     CORROBORATED 09.08.2026 by running each `enrichments` section alone: the fault
     is not one frame and not only BLACK. `88-canoe-ride.png` collapsed 993 KB → 47 KB
     as a uniform GREY HAZE at 11 FPS, `104-region-border-river.png` 1.39 MB → 51 KB
     as a black canvas carrying only the HUD and its "Unknown waterfall"/"Unknown
     lake" labels — both accepted, both exit 0. Most such captures pass `settle:
     false`, whose readiness mode requires only THAT a picture exists. This is why
     the measure is colour DOMINANCE and not file size: on identical code one
     section's frame moved 261 KB ↔ 662 KB between two runs, so size decides
     nothing and a reviewer must open the image.
  The re-probe of item 1 applies in the STAND-STILL mode only: the drawn-only wait
  is near zero, and re-probing there would add flake on exactly the fast-moving
  subjects that mode serves. The stale comment in `frameSubject.mjs` claiming
  nothing moves the camera during the wait is corrected in the same commit — commit
  `02be8c7d` already falsifies it. The Vitest gap the review names is closed with
  it: the readiness mode is currently tested on hand-built objects only, never
  through `normaliseDeclaration`, which is what hid item 6.
  VERIFIABLE: pure Vitest on the shutter's decision (subject in view before AND
  after → written; in view before, gone after → refused with the second reading in
  the message; a frame that needs no readiness wait behaves exactly as today; a
  canvas-bearing frame whose picture is one colour past the share is refused naming
  that colour, while a rendered frame and a declared near-uniform one pass; a
  full-page element frame serves the stand-still wait while a clipped or
  locator-bound one does not), and live the two Aswan frames stay green.

- [ ] 565. A drinking wildebeest calf stands buried in the ground
  (caught 08.08.2026, 19:xx, by the in-game anchoring tripwire on the `enrichments`
  WebGL 2 lane). The dev-mode assert fired: `animal-buried — wildebeest bodyY=1.09
  ground=1.82 y=1.82 young=false bathe=false drink=true dodge=false hop=false
  chunk=14,1 shoreSeed=false parent=false child=true dPlayer=14`. The body sits 0.73
  BELOW the terrain the same frame samples under it, and it is not a one-frame
  transient: the assert only speaks on the SECOND consecutive violating visit
  (`floatStrike >= 2`, ~13 frames apart), so this animal stood buried for at least two
  assert visits while the player was 14 units away — in view.
  IT IS NOT THE LABEL LAYER'S DOING: the run that caught it carried point 342's change
  to `Wildlife.tsx`, but that change only READS `a.drawn` and pushes to an array; the
  assert dates from 21.07.2026 and the anchoring code it watches is untouched. Treat it
  as a pre-existing defect the tripwire surfaced, not a regression — but CONFIRM that on
  `main` before fixing, because a confirmation is one run and a wrong assumption is a
  rebuild.
  THE LEAD THE DUMP GIVES: `drink=true` and `child=true` with `bathe=false`. The drink
  cycle lowers the body toward the water, and a CALF carries a smaller `scale`, which
  shrinks the assert's own tolerance (`ground - 0.75 * a.scale`) at the same time as the
  drink pose lowers the body — so the pair is the suspect, not either alone. `y` equals
  `ground` exactly (1.82), so the ANCHOR is right and it is the body offset below it
  that is wrong.
  FINAL STATE: a drinking animal of any age keeps its body above its own ground sample
  for the whole drink cycle, at every scale the herds spawn; the tripwire stays armed and
  unchanged (it is the detector, not the thing to tune away); and if the drink pose
  legitimately needs to dip lower than the current tolerance, the tolerance is derived
  from the pose rather than widened flat.
  VERIFIABLE: a Vitest case over the drink-pose body offset sweeps the full scale range
  the herds use, at both ages, and asserts the offset never falls below the ground
  sample; `enrichments` runs on both backends without the `animal-buried` assert firing.

- [ ] 522. The burning grass does not burn (observed 05.08.2026 while closing point
  323). `verification/131-burning-grass.png` is the frame that proves the §19.9
  bush fire, and no fire is visible in it to the eye — the frame passes its checks
  and shows dry grass. Either the dressing does not draw at the moment the shutter
  opens (the fire is a moving effect and the frame may catch it between states), or
  it draws too faintly to read at that distance and zoom, or the check measures
  something the picture does not show. This is exactly the "looks-wrong-but-passes"
  class: a green check standing in front of an invisible feature.
  FINAL STATE: the fire READS in the frame a human looks at — flame and smoke
  visible at the zoom the criterion is judged at — and the check that guards it
  measures the drawn fire (pixels of flame/smoke in the frame region), not a state
  flag beside it. If the effect turns out to be drawing correctly and only the
  frame's aim or moment is wrong, the aim is fixed and the finding recorded as
  such; a feature that cannot be seen is not delivered either way.
  VERIFIABLE: the refreshed frame 131 shows the fire to a human on both backends,
  and its check fails when the fire is switched off in the debug menu — proving the
  check reads the picture rather than the intent.

- [ ] 523. The panorama leave-capture comes out empty, and two checks on `main`
  HAVE BEEN RED FOR IT (measured 05.08.2026 while closing point 480, on BOTH
  backends, and classified PRE-EXISTING on `main` by
  `node scripts/verify/baseline-classify.mjs polish --ref origin/main`). The two
  failing checks are `the leave capture bakes the surrounding terrain into the band
  (point 227)` and `the band is compass-true`. The numbers name the cause rather
  than a threshold: the leave-capture reads OPAQUE 0.000 with 0 px west and 0 px
  east — it captures NOTHING, so both checks judge an empty image and neither can
  pass. Whatever the band looks like in the game, its evidence has been absent long
  enough that a red on `main` stopped being noticed, which is exactly the state
  point 387 exists to end.
  FINAL STATE: the leave-capture produces a non-empty image again — the cause is
  found and named (a capture taken before the panorama is drawn, a target that
  moved, or a capture path that silently yields a blank surface), not worked around
  by lowering the opacity floor. Both checks then judge a real picture and pass on
  both backends. If the capture legitimately cannot run headless on one backend,
  that is a recorded deferral naming the backend, never a quiet skip.
  VERIFIABLE: `polish` green on WebGL 2 and WebGPU on a quiet machine, with the
  leave-capture's opacity and its west/east pixel counts printed in the run so an
  empty capture can never again read as a threshold miss; plus a pure test that the
  check FAILS on an all-transparent capture instead of reporting a band verdict.

- [ ] 500. The leave capture bakes a terrainless band on a slow host
  (measured 04.08.2026 during the point-499 triage, 3 of 3 runs). The `polish`
  check on the maasai-village leave capture reads the bottom quarter of the
  panorama backdrop as opaque 0.000 — the captured band carries no terrain at
  all. This is NOT the fixed-wait class the triage closed: the capture fires as
  the travel scene MOUNTS, so no amount of waiting afterwards can change what it
  photographed. The cause named by the reading is `panoramaCaptureReady`, which
  gates on terrain chunks being COMMITTED rather than on their being DRAWABLE —
  on the fast Windows host the two coincide, on this one they do not.
  FINAL STATE:
  1. The capture gate holds until the surrounding terrain actually RENDERS, not
     until its chunks exist. The condition is read from what the renderer draws,
     never from a chunk count or a wall-clock allowance.
  2. Point 227's grey-horizon symptom cannot return on a slow host: the check
     that caught this stays, and is not weakened.
  3. A capture that would still be unready at its deadline says so — a black or
     terrainless band is never written silently.
  VERIFIABLE: the `polish` leave-capture check passes three consecutive runs on
  the container host, and the same run on the WebGPU (software) lane; the
  captured band is inspected as a PICTURE once, not only as a number.

- [ ] 501. The compass probe pillar never reaches the panorama band
  (measured 04.08.2026 during the point-499 triage, 3 of 3 runs). The `polish`
  orientation check reads west 0 px / east 0 px for its DEV probe pillar, while
  the water fractions of the SAME capture became non-zero once the scene was
  built — so the capture happens, but the pillar is not in it. The unverified
  suspicion the triage recorded: `hasPanoramaCapture` short-circuits a
  re-capture, so the check's `delete window.__placePanorama` clears the hook but
  not the cached capture, and the pillar is added to a capture that is never
  taken again.
  FINAL STATE:
  1. The suspicion is CONFIRMED OR REFUTED first, at the code, before anything
     is changed — a fix built on the wrong cause is the more expensive mistake.
  2. Either the probe reliably enters the capture it is set up for, or the
     orientation is measured another way that does not depend on injecting
     geometry into a cached capture. Whichever is chosen is written down with
     its reason.
  VERIFIABLE: the `polish` compass check passes three consecutive runs and fails
  when the panorama orientation is deliberately inverted — a check that cannot
  fail proves nothing.

- [ ] 321. Grass fire reads wrong on every count (user 25.07.2026 with screenshot:
  the burning-grass event shows a column of flat orange blocks — no recognizable
  FIRE FRONT, "strange waves" that make no sense, and the burn SCARS do not read as
  burnt ground). Rebuild the §14/§19 grass-fire depiction: (a) a readable FRONT — a
  curved, advancing line of flame with a bright leading edge and smoke rising
  behind it, not a stack of quads; (b) identify and drop/rework whatever produces
  the wave artefact (likely the animated flame sheet's UV/vertex wobble read at
  bird's-eye distance); (c) BURN SCARS that read as burnt earth — dark, sooty
  ground tint following the terrain like the point-267 blood tint, with soft
  irregular edges, not orange blocks. Calibratable extent/speed under balance,
  quality entries for all three levels. VERIFIABLE: pure tests for the front
  geometry (advancing line, bounded curvature, scar polygon trailing the front) and
  the scar tint sampling; live check that the front's leading pixels read clearly
  brighter/warmer than the trailing scar and the scar clearly DARKER than unburnt
  savanna; screenshot 131 refreshed and judged on BOTH backends.

- [ ] 319. Crocodile kill aftermath: prey dissolves without sink or visible scavenger
  (user 25.07.2026: a crocodile seized an animal, the crocodile disappeared at some
  point, and the prey then kept slowly dissolving — possibly "eaten" with no vulture
  visible). Per §19.16 a crocodile KILL must SINK — the river keeps the body, no
  bank carcass, no vulture; a slow in-place dissolve with no visible actor matches
  NO legitimate path. INVESTIGATE the victim's state machine after the croc leaves:
  every crocodile exit path (kill → sink; grip-deadline release → victim freed
  ALIVE; croc streamed out by the view ring mid-drama) must leave the victim in a
  consistent, VISIBLE state — either sinking (kill) or alive and walking (release);
  the carcass-shrink animation must only ever run with a visible feeding/scavenging
  actor present (lion feed, vulture flock, ground scavenger), never as an invisible
  decay. Likely suspects to check: the caught victim being handed to the ordinary
  land-carcass system when the grip ends instead of the sink path, and the shrink
  timer running detached from any feeder. VERIFIABLE: pure tests over the croc exit
  paths (kill/sink, deadline-release/alive, ring-despawn — victim state asserted
  for each); an enrichments stage reproducing the reported sequence (catch → croc
  leaves → victim must either sink or stand up, and NO shrink without an actor —
  add a dev-assert for "shrinking carcass has no feeder" so every session detects
  it); both backends.

- [ ] 326. A parent dies with no visible cause after a crocodile kill (user
  25.07.2026: crocodile took a calf, crocodile gone, the parent stood at the death
  spot and simply fell over dead — reading as suicide). Every §19.8 death must have
  a VISIBLE cause on screen (a predator that reaches it, a trample, a drowning, a
  fall). Audit the vigil/grief paths against the crocodile case: a parent standing
  vigil after a crocodile kill either is taken by a VISIBLE predator (the point-121f
  draw that spawns beyond the ring and walks in) or survives and rejoins — never
  dies in place with no actor. Add a dev-assert "death without a visible cause"
  covering every death path so the class is caught in every session. Related to
  point 319. VERIFIABLE: pure test enumerating the death causes, each setting a
  cause field; the assert fires on a synthetic causeless death; a staged
  croc-kill-then-vigil ends in one of the two legitimate outcomes; both backends.

- [ ] 314. Drifting pale patches on water (user 25.07.2026, screenshot: bird's-eye at
  a river mouth near the ocean — two elongated pale/greenish patches ON the water
  surface near the shore, which MOVE/CHANGE as the traveller walks; "immer noch
  gelegentlich", i.e. the class was seen before). DIAGNOSE BY THE PICTURE first
  (drive the reported shore on both backends, screenshot series), then root-cause —
  candidate hypotheses to check, not to assume: (1) shore/crest foam sampled in a
  non-world-anchored space so the mask swims with the camera; (2) the far-sheet vs
  near-water overlap at the coast (zoom-gated far sheet showing through); (3) the
  point-211 ribbon-row lift re-evaluating per terrain-chunk LOD so lifted rows pop
  as chunks stream (matches "changes while walking"); (4) foam from the river mouth
  bridge (MOUTH_BRIDGE) rows extending into the shelf. FIX the identified cause; the
  §11.3 continuity/never-buried/mouth-bridge invariants stay green. VERIFIABLE: a
  driven enrichments check at the reported spot asserts the water pixels stay
  stable while the traveller moves (frame-diff over the water region bounded, on
  BOTH backends), plus the screenshot pair before/after; pure test for whichever
  sampling rule was wrong.

- [ ] 575. The animals carry no pelt pattern and no face (found 09.08.2026 by the
  point-264 control frame, which photographed two zebras at the player's own zoom).
  `ZEBRA_SPEC` paints the body `#d8d4cc` and the head `#9a958c`, flat and untextured —
  a zebra with NO STRIPES. At the reachable bird's-eye zoom (0.125–0.5, default 0.5) the
  animal reads as a uniform light capsule; nothing identifies the species, and two of them
  side by side read as one pale bar. The point-264 control frame
  (`verification/148a-intraspecies-clash-pose-off.png`) is the evidence. By inspection the
  same holds for the other `buildQuadruped` species — this is the shared model, not one
  animal.
  FINAL STATE: every ambient species is IDENTIFIABLE at the zoom the player uses. The
  zebra carries stripes, and each other species the audit finds unmarked carries the
  marking that identifies it (giraffe patches, the darker mane and cape where the species
  has one). The pattern is applied so it survives being small — the silhouette and the
  large-scale bands do the work, fine texture does not — and it is procedural/TSL rather
  than an added texture asset, so it costs no download and stays backend-neutral. Faces
  get whatever minimum reads at distance and no more. The cost is measured before and
  after, and the feature is sorted into the three detail levels with its
  `QUALITY_PRESETS` entries and the matching row in `docs/graphics-detail-levels.md`.
  VERIFIABLE: a frame per treated species at zoom 0.5, judged by looking — the species is
  recognisable — plus the before/after cost measurement, on both backends.
  Criticality: medium — it is the visual identity of every animal in the bird's-eye view,
  and acceptance criterion 11 (no schematic look) speaks to exactly this.

- [ ] 533. What brings the container back after a host reboot (found 07.08.2026 while
  merging point 447; bundle Urlaubsfestigkeit). Point 447 hardened the WINDOWS boot path —
  `HoA-Batch-Autostart` with an at-logon trigger, plus `HoA-Batch-Watchdog` watching it —
  and its measurements date from 30.07.2026, when the batch still ran on that host. Since
  03.08.2026 it runs inside the LINUX container (`docs/host-environment.md`), where the
  launcher is the daemon `scripts/batch-launcher.mjs`, which lives and dies with the
  container. A Windows reboot therefore takes the batch down, and the hardened task then
  starts a launcher on a host the work no longer runs on: a GREEN boot path over a dead
  batch, which is exactly the silent failure the bundle exists to remove.
  ESTABLISH FIRST, DO NOT ASSUME: what starts the container today (Docker Desktop autostart,
  a WSL distro, the devcontainer CLI, a task) and whether the launcher daemon comes up with
  it. The answer is RECORDED in `docs/host-environment.md` under the launcher row, which
  today names the two launchers side by side without saying which one is live.
  DELIVER: (a) the Windows setup script of point 447 gains an idempotent, dry-runnable step
  that brings the CONTAINER up at logon/boot and starts the launcher daemon inside it —
  same conventions as `scripts/windows/setup-boot-path.ps1` (elevated once, "Nothing
  changed" on a second run, definitions exported to `local/`); (b) `windows-task-watch.mjs`
  checks the CONTAINER and the daemon, not only the two tasks, because a task that runs and
  starts nothing must not report green; (c) the readiness command of point 448 gains that
  line with its remedy.
  VERIFIABLE: Vitest on the pure parts (the probe verdicts, the idempotency decision, the
  green-over-dead case failing). The live acceptance is one elevated run on the Windows host
  and one real reboot, recorded as evidence — the container path cannot be proven from
  inside the container, and point 449's drill is where it is exercised afterwards.

- [ ] 448. One command that says "ready for a fortnight alone" (30.07.2026; bundle
  Urlaubsfestigkeit). Before an absence, nothing today reports whether the chain is intact —
  and the failures that hurt most are the silent ones. `scripts/vacation-ready.mjs` answers it
  in one read-only run, each line PASS/WARN/FAIL with the remedy: both scheduled tasks present,
  enabled, last result 0; `AutoAdminLogon` set; free disk space above a threshold; the GitHub
  PAT valid with its REMAINING LIFETIME (a token that expires mid-absence fails every push
  from then on, silently — warn below 30 days); the Claude authentication present and not due
  to expire; the guard chain answering (`guard-preflight` clean); the GitHub watchdog workflow
  enabled and its last run green; no stale park file; the doctor's verdict consistent; no
  worktree debris; and the date of the last chaos drill (449) with a warning when it predates
  the last change to the resilience layers.
  VERIFIABLE: Vitest on the pure verdict assembly (one case per line, PASS/WARN/FAIL and the
  overall exit code — 0 only when nothing is FAIL) with every probe injected; one live run
  against the real machine as the acceptance evidence.

- [ ] 449. The chaos drill — kills at random moments (user 30.07.2026: "Beachte, dass ein
  Ausfall eines Elements zu jedem beliebigen Zeitpunkt passieren kann - auch mitten in einer
  kritischen Aktion von dir"; bundle Urlaubsfestigkeit). Everything in this bundle is a claim
  until an outage has been survived under observation, and the lesson of 30.07.2026 is exactly
  that a designed handover still failed in practice. `scripts/chaos-drill.mjs` kills the batch
  owner at a RANDOM moment inside a chosen critical action — during a merge, during a push,
  during a browser verification, during the tick in TASKS.md, during a board publish — and
  then asserts, without human help: the tree returns to a consistent state, the launcher
  starts a successor, the successor works, and the interrupted point is correctly still OPEN
  (the transaction property: the tick on `main` is the commit point, so nothing half-done can
  count as done). It runs each action several times with different timings, writes a report per
  run to `local/`, and records the date the readiness check (448) reads.
  VERIFIABLE: the drill itself is the verification — one green report per critical action, plus
  Vitest for its pure parts (the kill-moment plan, the verdict assembly). A drill that cannot
  produce a verdict FAILS rather than passing quietly.

- [ ] 200. Verify-script robustness pass — fix the 26 wall-clock/radius
  findings in the test scripts (Pillar-2 group E; exact list in the 184 log:
  20 in enrichments, plus polish 270, settings 183/277, flow 242, voice 56,
  touch 75). Two patterns, both established: (1) render-loop behaviours polled
  on the SIM clock (__pollSim/__sleepSim/simTime) or on the check's OWN
  condition — never a fixed wall wait (the point-177 class; the elephant-roam
  and lion-feed flakes were exactly this); (2) "in view / beyond the ring"
  judged by __camera.onScreen/ndc projection — never an assumed radius (the
  point-172 class), with checks that TEST a radius-feature keeping the radius
  but saying so. Work file-by-file, run each touched suite after its change
  (both backends for the WebGPU-lane suites; touch/voice webgl-only), and
  fold the result into the final-closing 3× flake-free gate — this point IS
  the systematic version of the one-off de-flakes done so far (some findings
  may already be partly fixed, e.g. settings 277: verify against HEAD first).
  PROGRESS 21.07.2026: converted the six named non-enrichments waits (commit
  7ed3c56) + six enrichments family/predator/scavenge/rescue STAGING settles to
  __sleepSim (5127afa, af4533f) — all touched suites green.
  MEASURED 09.08.2026 (closing point 566, WebGL 2): the residue is a ROTATING
  SINGLE failure, and it is what makes the suite unable to produce a clean run on
  demand. Six runs of `enrichments` on byte-identical product code (`src/` did not
  change) gave one fully green 251/251 and five runs of 249–250 pass with 1–2 red
  — never the same check twice: "prey squeezed against a bank flees ALONG it"
  (pt. 201; the failing sample ended `onWater:true`, path 8.2 / net 6.2, against
  11.3 / 11.3 when it passes), "holding Ctrl names the animals in view" (pt. 342;
  `0 animals of 1 labels`), "a calf out of reach past the reunion window is handed
  to the adoption" (pt. 341; `separated:false`) and "a predator staged during the
  window still makes the calf RUN" (pt. 369; `fleeBefore 5 == fleeAfter 5`). The
  runner's own classifier called both double-reds a LOAD/FLAKE signature, and a
  baseline run of the CURRENT checks against the pre-566 tree reproduced the same
  instability — so these are the suite's own staging, not a product defect and not
  the sectioning. Each is a STAGING settle of exactly the two patterns above; fixing
  them is what makes a green run repeatable rather than lucky.
  AND THEY ARE NAMED BUT NOT CHARGED (found 09.08.2026 while preparing point 309).
  The measurement above pins each rotating red to an OPEN point (201, 342, 341, 369),
  but `scripts/render-verify-charges.mjs` holds exactly ONE entry (point 506, polish,
  goat walker) and none of these four. `render-verify-core`'s `runVerdict` counts a
  run as covering only when EVERY red is charged to an open point, so an `enrichments`
  run comes back UNACCOUNTED even though its reds are measured, owned and understood.
  The cost is exact: point 309's one remaining gate is a green LARGE run, and that gate
  cannot be reached by waiting for a quiet machine — the run would have to come up clean
  on the one-in-six chance the measurement recorded.
  DECIDE, DO NOT DRIFT: either these four staging settles are fixed here (the point's
  own job, and the honest fix), or the four reds are CHARGED to their points in the
  ledger the mechanism provides for exactly this case. Charging is legitimate — it is
  what the ledger is for — but it silences the checks, so it is a deliberate decision
  written down with its reason, never a quiet workaround. Whichever is chosen, 309 stops
  waiting on a green that cannot arrive.
  PROGRESS 21.07.2026 (evening): three more increments, each validated green +
  pushed — (1) FAIL-SOFT against a whole-run ABORT (7360b62): a rare mid-check
  scene remount briefly nulls window.__wildlife; a non-optional herdsRef access
  threw an UNCAUGHT error that killed the entire run and DEFEATED the auto-retry
  (a crash on attempt 1 + any rotating flake on attempt 2 = double failure). The
  collision-drive loops now optional-chain the hook and __pollSim wraps its
  doneFn in try/catch — a crash becomes at worst one recoverable check miss. This
  was the key structural win: the suite now reaches green via retry-cushioning as
  designed. (2) Canoe/swim staging settles -> condition polls (same commit).
  (3) The collision drive-in/escape loops bound by SIM time with a wall cap
  (79ff2cb) — a wall-timed window ran too few frames under load (escaped 0 vs
  5.3). NEXT / NOT YET DONE (a flood-convergence batch was tried and REVERTED
  unvalidated — do it right): replace the long weather blend waits
  (waitForTimeout 4000-4500, "blends at 0.02/frame": Nile flood ~5047, Okavango
  ~5090, harmattan ~5119) with a convergence poll — BUT settle on the value the
  CHECK ACTUALLY READS, not just the blend driver: the harmattan check reads
  __climate.fog().far, which LAGS __climate.dust() by its own fog blend, so
  settling on dust() returned before fogFar closed and the Jan<Aug assertion
  failed (161 vs 153). Settle on fogFar (and for the Nile settle on surfaceAt,
  for the Okavango on deltaWaterScale — whatever the check compares), or poll
  until ALL read values are stable. Speeds up every run ~15-20 s AND de-flakes.
  FLAKE SITES OBSERVED IN THE 25.07 CLOSING RUNS (three LARGE runs, quiet machine — each
  red was a DIFFERENT check, which is the signature of rotating flakiness rather than a
  regression): flow fails its FIRST navigation on a cold dev server in every one of the
  three runs (0 pass / exit 1, the networkidle wait) and passes on retry — the most
  reproducible site and the best next fix; collision once (19/20); enrichments twice, at
  DIFFERENT checks — the point-267 blood-stain-on-a-slope check (holeFraction 0 but the
  blob/soak counts short) and the point-278 dressing-growth check reporting samples
  [0,0,0,0,0], i.e. a measurement that collected NOTHING rather than a real growth
  reading (the same class as points 292/334/304 — the check, not the product). Fix these
  four first: they are what stands between the suite and the flake-free closing gate.
  REMAINING drama flakes still rotating (cushioned by the retry, to root-cause
  for the closing's strict 3x gate): point-102 vicinity count, plover 145b,
  calf-play, parent-guards-calf, the crocodile-spawn cluster. NEW SITES seen in
  the 25.07 quiet-machine LARGE (point-309 re-validation): flow's FIRST
  navigation `networkidle` wait times out on a cold dev server (failed twice in
  the LARGE, then 31/31 green on an isolated retry — wait for the app's own
  ready signal instead of networkidle); rotating one-off reds in enrichments:
  the crocodile eye-knobs check (274), the STAGED parent-sacrifice calfFreed
  flag, and the 121f drawn-predator (each red exactly once across two tries).
  PROGRESS 22.07: the lone-scavenger-185 landing is now DETERMINISTIC (commit
  f76dc3d) — before polling, remove other carcasses from its target pool + shove
  nearby live animals clear + commit the bird to the injected carcass. CLOSING
  NOTES for the others (do NOT repeat these dead ends): (a) the vicinity-102
  budget must NOT simply be widened — MORE sim time lets the seeded grazers
  WANDER out of the leave-point radius (the code comment says exactly this), so a
  bigger budget is counterproductive; fix by counting from the settlement ANCHOR
  (where the seeder guarantees the min) or by pinning the count to the immediate
  post-leave moment. (b) calf-play (samples:0): a calf gambols only ~25% duty
  (GAMBOL 4s/16s) AND canPlay needs no active lion + calf near its parent (not
  play-locked) + a CALF_HUNT_SPECIES; force a young calf beside its parent with
  playLock cleared so it stays play-eligible through the poll. (c) plover-145b
  (dead:true): the bird dies before its broken-wing act — keep it alive / force
  its lure state. TRIPWIRE-TRANSIENT
  ROBUSTNESS (for the closing's 3× flake-free): the point-203A anchoring tripwire
  intermittently fires ONE console-error per several enrichments runs on a rare
  1-frame anchoring transient at a state transition — observed a floating
  wildebeest and a buried shore-seeded drinker at the waterline, different each
  run, none reproducible, imperceptible at 60 fps. The tripwire samples per
  frame, so it catches the single transition frame before the next frame
  corrects. FIX for the closing: make the tripwire tolerate a 1-frame transient
  — only console.error when the SAME animal violates on 2+ consecutive
  assert-visits (a per-animal strike counter), so a persistent float (a real
  bug) still fails loudly while a one-frame spawn/drink/shore-seed transition
  does not. Do this as part of the closing prep so the LARGE gate can reach 3×
  clean.
  OBSERVED 22.07 (a WebGL enrichments run during the 210b work): 207 pass, 2 fail,
  0 console-errors — both KNOWN rotating staging flakes, cushioned by the retry:
  (1) plover-145b again `dead:true` (the bird died before its broken-wing act —
  the documented cause above); (2) the point-129 witness "a tree contact blocks
  the entry but leaves N/S/W free" with `reached:false` (minDist 1.41, N/S/W all
  ~2.2-2.4 free) — a NEW entry for the rotating-flake list: the driven post-
  collision move did not COMPLETE in the frames allotted (the 200 SIM-clock class,
  not a real collision bug — the free directions are all open). ADD to the
  closing root-cause set: poll the point-129 driven move on the SIM clock / its
  own arrival condition rather than a fixed frame budget. The point-102 vicinity
  check (this session's anchor fix) PASSED first try, confirming that fix.
  OBSERVED 24.07 (a WebGL enrichments run under CPU overload during the 278
  verify): the point-121 check "a feed that ends without a kill leaves no remnant"
  failed `{deadBefore:4,deadAfter:5,calfAlive:true}` — a NEW rotating-flake entry.
  It counts GLOBAL dead animals over a 2.5-sim-second window during which OTHER
  dramas keep running, so any unrelated concurrent predation in that window fails
  it even though the STAGED feed left the calf alive and no remnant. Confirmed a
  load flake, not a real bug: the same check PASSED on a quiet-machine re-run
  (222 pass, 0 fail). ROOT-CAUSE FIX for the closing: scope the assertion to the
  staged feed — count only deaths of the feed's own actors (or freeze other hunts
  for the window), not the global dead-count, so a concurrent drama can't fail it.
  LESSON reinforced (memory `verify-suites-need-a-quiet-machine`): never run a
  verify suite while a worktree agent builds — evaluate a red only on a quiet box.
  OBSERVED 05.08.2026 (a WebGL enrichments run on the Linux container host, while
  closing point 489): first try 243 pass / 2 fail at the point-119 trampling and the
  point-128 scavenger-drama checks, green on retry (245/0) — neither in that diff's
  touch set, so a THIRD and FOURTH rotating site on this host. The same day, under
  load, the point-278 dressing-growth check read `{samples:[0,0,0,0,0]}` — the
  `__sleepSim(6)` settle elapsed with too few frames for the streamer to populate the
  desert anchor, so `liveInstances()` legitimately read 0; on a quiet machine the same
  check reads `{samples:[18,18,18,18,18]}` and passes. That is this point's pattern (1)
  exactly: a streaming behaviour measured against a settle rather than against its own
  condition. Fix it by polling until the anchor's instance count is non-zero, not by
  lengthening the settle.
  MEASURED AGAIN 17.08.2026 ON MAIN, and it is no longer only a branch's problem: the same
  check read `{samples:[0,0,0,0,0]}` TWICE in one enrichments run on a feature branch and
  then again on plain `main` in a section-only run — same numbers every time, no rotation.
  Two agents were building during all three, so the quiet-machine reading that would tell
  the known load flake apart from a DEAD streamer is still owed, and it is the deciding
  measurement: `{samples:[18,…]}` confirms the flake and the poll fix above, another
  `{samples:[0,…]}` on a quiet box means the desert anchor streams nothing at all any more,
  which is a player-visible regression of the §19.9 dressing and belongs in its own point
  rather than here. Take that reading before touching the check.

- [ ] 309. Serving-model degradation: repair + tripwire (user 25.07.2026). REPAIR: the
  late-evening session of 24.07 ran silently on Haiku 4.5 (proven by the Co-Authored-By
  commit trailers) and merged three deliveries that missed their specs; main is RESTORED
  to the last pre-degradation state fd85464 on every touched path — the placebo
  proximity-call fix incl. its assert-nothing tests (expect(true)) reverted (292
  reopens), the unwired detect-load stub removed (296 reopens), the rubber-stamp
  guard-chain audit removed (297 reopens), the load-corrupted verification PNGs
  restored, the three TASKS ticks undone — while the legitimately recorded
  .claude/closing-state.json is kept; the load-tainted working-tree churn (PNGs, retro
  appendix, ineffective settings additionalDirectories, untracked pre-push stub) and the
  unauthorized local .git/hooks/pre-push are discarded. MODEL ALLOWLIST (user
  25.07.2026): ONLY Opus 5 (default), Opus 4.8 (fallback when Opus 5 is unavailable)
  and Fable 5 (occasional four-eyes work) may run the batch — Sonnet, Haiku and every
  other model are NOT acceptable; if the policy cannot be held, the batch STOPS. The
  batch autostart therefore launches `--model claude-opus-5[1m] --fallback-model
  claude-opus-4-8[1m]` (flag verified against the bundled CLI). TRIPWIRE
  (mechanism-first): a Stop-hook guard (pure core scripts/model-guard-core.mjs +
  fail-open wrapper scripts/model-guard.mjs, wired FIRST in the Stop chain) parses the
  recent commits' Co-Authored-By trailers; any commit after the committed baseline
  (.claude/model-guard-baseline.json) authored by a Claude model OUTSIDE the allowlist
  BLOCKS the turn end with a pause-the-batch instruction and pings ntfy — a degraded
  session is caught at its FIRST commit, and an unknown future model name fails
  closed. The guard stands down while .claude/batch-paused exists (no block loop once
  paused); the batch-resume hook names the allowlist on every session start.
  VERIFIABLE: model-guard-core Vitest sweep (trailer parse incl. malformed lines,
  allowlist pass for Opus 5/Opus 4.8/Fable 5 variants, breach for Haiku AND Sonnet AND
  unknown models, mixed-co-author flagging, human co-authors and merge commits
  ignored, baseline cutoff boundary, empty log); the repaired state passes the full
  LARGE regression on a quiet machine (both backends), which also re-validates the
  four Opus points merged before the degradation (262/273/293/305).
  WHAT THE PROOF STILL COSTS (measured 08.08.2026, after point 549 landed). The repair and
  the tripwire are complete and in `main`; only the regression proof is outstanding. 549
  settled the WebGL 2 half — three consecutive `polish` runs came out clean with no retry —
  so a LARGE now REACHES the WebGPU half, which it never did before. There it will report
  one red: `settlement walker (goat)` passed one of three runs, needed the retry in the
  second and failed both attempts of the third at worst foot/body travel 1.929–2.318. That
  is the software lane's throughput, charged to point 506 in `render-verify-charges.mjs`,
  not a product defect. So take this proof either after 506 lands, or with that one red
  recorded as the charge it is — never as a clean both-backend LARGE.

- [ ] 312. Animals are water-shy, not water-barred (user 25.07.2026, revising the
  point-192 rule; former point 324 is folded in here). The rule was read far too
  strictly: "animals must not stand around in water" — so that a canoe passage stays
  clear — hardened into "water is off limits to them". What the player sees is a
  fleeing animal PRESSING against the waterline or skating along the bank hunting for
  a way around, instead of simply swimming across; and a calf swept into the water
  sticking at the bank so its drama never plays out.
  THE RULE IS STATED IN ONE PLACE — design.md §19.5. This point BUILDS it; do not
  restate it elsewhere.
  (a) NO SPAWN, NO LINGERING — unchanged, and the reason the rule exists. An animal
  never spawns in water and never idles, grazes, rests or waits in it; one that comes
  to rest on water makes for the nearest bank. A channel the player canoes must never
  be blocked by a parked animal. This half must stay demonstrably intact — and it is
  what ENDS every water passage: the moment a flight stops, the animal turns for the
  NEAREST bank and SWIMS out under its own power. It is never snapped back onto land,
  which is how the old setback behaved; shyness must read as shyness, not as a
  teleport.
  (b) CROSSING IS ORDINARY: a ROAMING animal may take on a channel rather than turn
  from it, governed by the calibratable `balance.waterCross.*` (width, readiness).
  (c) FLIGHT IS UNRESTRICTED. Fleeing anything — a predator, an oncoming elephant, the
  traveller, fire — the animal enters the water the moment its escape leads there: no
  dead-end precondition, no pressure radius, no width limit, no chance roll.
  CONCRETELY: the along-shore deflection (`deflectedStep`) applies to the OCEAN edge
  ONLY, so a flight meeting a river or lake goes IN rather than sliding along the bank.
  A juvenile returning to its parent (§19.8) moves under the same freedom.
  (d) A WATER DRAMA OWNS ITS ACTOR (the folded 324): while a §19.8 water drama runs —
  the swept calf, the wading rescuer, a crocodile's victim — no leave-the-water rule
  may pull the animal out. The exemption keys on the DRAMA STATE, not on the species.
  (e) TWO INVARIANTS UNTOUCHED: the open sea of §11 stays the world's edge (the ocean
  setback is exactly as it is), and every water passage RESOLVES — a bank is reached or
  the deadline grounds the animal there (invariant I4), so nothing swims forever.
  ANCHORS: `fleeCrossing`, `crossingTarget`, `deflectedStep` and the water setback in
  `src/scenes/travel/wildlifeBehavior.ts`, with their call sites in
  `src/scenes/travel/Wildlife.tsx` (the three flight sources — predator flee, elephant
  dart, player-shy — and the calf follow branch); `waterEdgeRules.ts` holds the
  drinker/bather bank targeting, which does NOT change.
  WHAT SHRINKS RATHER THAN GROWS: the boxed-trigger machinery this point once called
  for (a pressure radius, a boxed-persistence hysteresis, a crossing chance for
  flights) is NOT to be built — under (c) a flight needs no trigger at all. Add no
  balance values for it.
  DOCS in the same commit: design.md §19.5 already states the target; CLAUDE.md §7.1
  point 12 currently carries a forward-pointer at the superseded claim and must be
  rewritten to the built state when this lands, dropping that pointer.
  VERIFIABLE: pure — a flight step whose heading meets river or lake water is NOT
  deflected along the bank, while the same step at an ocean edge still is; a roaming
  crossing still honours its width and readiness values while a flight ignores both; a
  drama-flagged animal is setback-exempt while its drama runs and subject to it again
  afterwards; an idle animal that ends up on water heads for the nearest bank. Live
  (`scripts/verify/enrichments.mjs`, both backends): an elephant driven at a grazer on
  a STRAIGHT bank — where an along-shore slide IS available — sends it into the water
  and out the far side; an animal the PLAYER drives into a river and then leaves alone
  is out of the water within moments — swimming to the nearest bank, its path sampled
  so it is a swim and not a jump; the staged swept calf reaches mid-channel and its
  drama resolves; and across a driven pass no animal is found standing in a channel, so
  the canoe lane stays clear.

- [ ] 333. Why the docs drift — and a mechanism against it (root-cause analysis
  25.07.2026, user question "where does all this drift come from — were there
  problems before the degraded session too?"). ANSWER: yes, and it has nothing to do
  with that session. Measured on the four features merged after v0.2: 262 touched
  design.md (+2 lines) and NOT CLAUDE.md; 273 touched both (+17/+2) but only ADDED
  its new paragraphs and left the five older places that state the now-false "ten
  ports"; 293 touched design.md and the detail-level doc but not CLAUDE.md §7.1; 305
  touched ONLY docs/graphics-detail-levels.md — the one doc with a SYNC TEST
  (src/config/qualityDoc.test.ts) — and left design.md §2.7/§21/§21.3 stating the
  opposite. The pattern is exact: a doc gets updated where a MECHANISM demands it or
  where the author is already writing; a fact that lives REDUNDANTLY in several
  places drifts in all the copies nobody was editing. The deeper cause is the
  redundancy itself — "the ten port cities" is asserted in five places, LOW's shadow
  behaviour in four. BUILD: (a) a pure DOC-FACT guard that pins the small set of
  facts stated redundantly across design.md/CLAUDE.md against the CODE that owns
  them (known-from-start count from `KNOWN_FROM_START_PLACES`, per-level quality
  values from `QUALITY_PRESETS`, the debug jump-to category list from the menu's own
  groups, the balance-value names the docs cite) — it fails when a doc's number
  disagrees with the code's, like qualityDoc.test.ts already does for one doc; (b) a
  merge-time check that a feature commit touching a §7.1-covered system also touched
  the doc section that covers it, or says why not; (c) reduce the redundancy where
  possible — one authoritative statement per fact, referenced elsewhere (the
  §7.1-references-design.md convention already exists; apply it to the drifted
  facts). METHOD: model-diverse (a second model reviews the fact inventory for
  completeness — an incomplete inventory is the failure mode). VERIFIABLE: the guard
  fails on each of point 332's real drifts when they are re-introduced, and passes
  on the corrected docs; the fact inventory is listed in the guard's header.
  SCOPE WIDENED (user 25.07.2026: "establish mechanisms that make such
  inconsistencies and redundancies impossible in future"): the point delivers a
  STANDING regime, not a one-off sweep. (d) SINGLE SOURCE OF TRUTH as the primary
  cure: for every fact the audit found duplicated, ONE place states it and the
  others reference that place — CLAUDE.md §7.1 already follows this convention
  toward design.md (§7.1 cites sections instead of repeating content, per the
  claude-71-reference-not-duplicate rule) and it is simply not applied to counts,
  defaults and enumerations; extend it there, and where a doc must restate a value
  for readability, mark it as derived and cover it by (a). (e) A DUPLICATION
  DETECTOR that fails when a NEW redundant statement of a covered fact appears
  (a count/keybinding/default that the inventory owns showing up in a second
  place), so the redundancy cannot creep back after (c) removed it. (f) The
  merge-time check of (b) becomes part of the standing gate, not a review step:
  a commit that changes a fact-owning constant must touch the doc that owns the
  fact, or state why not. (g) The regime is documented in CLAUDE.md §4 (docs
  conventions) so a future contributor — human or model — finds the rule where the
  documents themselves are described. ACCEPTANCE for the whole point: re-running
  the 25.07 coherence audit against the finished state reports no drift and no
  new duplication, and each mechanism fails on a deliberately re-introduced
  violation.
  GUARD INVENTORY (from the 25.07 forensic sweep — build these checks in this
  order, best value first; the ENUMERATION checks alone would have caught 6 of the
  11 older drifts): (1) design.md §21.2's tunable list vs the debug menu's own
  number fields; (2) design.md §21.3's toggle/tool list vs the menu's checkboxes
  and selects; (3) the jump-to category list (design.md §21.3 + CLAUDE.md §7.1
  pt 20) vs the menu's groups; (4) the touch-preset lever list (design.md §17.5 +
  §7.1 pt 30) vs `activateTouch`; (5) docs/peoples-1890.md's village coordinates vs
  `VILLAGE_HEARTLANDS`; (6) the known-from-start set (five doc sites) vs
  `KNOWN_FROM_START_PLACES`; (7) the F-key roster vs the HUD's key handling.
  Then the COUNTS, each owned by one code constant: ports/peoples/rivers,
  waterfalls/lakes, cultural landmarks/natural sites, village plans, ice massifs,
  seasonal-dress peoples, benchmark configs, quality levels. Then the DEFAULTS the
  docs quote (walk speed, strafe factor, ambience volume, starting money, start
  date and the 1890-1895 window, ivory range, shadow-map sizes, level default and
  cycle order, the F3 loadout numbers, the thunder delay band).
  TWO FURTHER ROOT CAUSES the sweep exposed, to be addressed by the regime:
  (i) a DOC AUDIT WITHOUT A CODE CHECK can make drift WORSE — a 17.07 docs-only
  audit rewrote a terse correct line into an elaborate false one; every doc audit
  must therefore verify against the CODE, never against neighbouring prose;
  (ii) docs get written against the TASKS SPEC rather than the shipped code — the
  cited `panoramaVicinityRadius` never existed in any commit, it came from a spec
  draft; a doc's symbol citations must be checked against the code that shipped.

- [ ] 347. The starting quality level from the URL (user 25.07.2026; design.md §21.1
  states the target). `?quality=low|medium|high` on any deployment URL — the GH-Pages
  root, `/poc/`, a `/vX.Y/` folder — opens the session at that level, so a link handed
  to someone whose hardware is known already fits it. Case-insensitive; an unknown,
  empty or missing value leaves the ordinary default (`medium`) standing without any
  player-visible complaint.
  FOLLOW THE EXISTING IDIOM, do not invent a second one: a PURE parse function beside
  `benchmarkFromUrl` (`src/systems/startBenchmark.ts`) taking the raw `location.search`
  and returning a `DetailLevel | null`, with the call site applying it.
  APPLY IT BEFORE THE FIRST FRAME, not after mount. `detailLevel` is NOT persisted
  today (no localStorage in `src/state/ui.ts`), so this is purely the initial value —
  but setting it from an effect after the first render would draw a frame at medium and
  then rebuild the whole post chain and shadow maps, a visible hitch on exactly the
  weak hardware the low link is meant for. Seed the store's initial state from the URL.
  AND IT DECIDES DOWNLOADS, not just looks. Level-gated ASSETS — the horizon maps of
  point 346 are the first, several megabytes of them — must see the URL level before
  they decide whether to fetch. A `?quality=low` link that still pulls the high-level
  assets and then ignores them would defeat its own purpose on the exact connection it
  was sent to. Whichever of the two points lands second must verify this pairing:
  loading with `?quality=low` issues NO request for a level-gated asset.
  DELIBERATELY UNCHANGED: the touch preset (§17.5) still applies its own subset-of-low
  flags when the touch layer arms, even if the URL asked for high. That is the existing
  rule — the preset is tied to the touch layer, not to a guess about the device — and a
  URL parameter is not a reason to break it. Do not "fix" this.
  NO TOAST. F9 announces a CHANGE; a URL-set level is the session's starting default
  and announces nothing.
  VERIFIABLE: pure — the parser sweeps the three level names, mixed case, an unknown
  value, an empty search, a search carrying other parameters (`?bench=short&quality=low`
  in either order), and a repeated parameter, returning null wherever the value is not
  a level. Component/live — a page loaded with `?quality=low` has the low preset in
  effect on its FIRST rendered frame (assert through an effective selector, e.g. sun
  shadows off, not the raw field), `?quality=high` likewise, and no console errors.
  DOCS: design.md §21.1 already states it; name the parameter in the README's play
  links if that file lists them, so the shareable form is discoverable.

- [ ] 422. The beginner guide is full, and today's lesson has nowhere to go
  (29.07.2026, found while doing the guide review the currency guard demands).
  `docs/analysis_de/vibe-coding-anleitung.md` sits at EXACTLY its budget — measured
  13.08.2026, 415 lines of 415 and 3677 words of 3677 (`scripts/guide-brevity-core.mjs`).
  The gate is right to hold it there: a beginner guide that grows without bound stops being
  read. But it means the guide can no longer absorb a new lesson at all, and the currency
  guard will keep asking for one — two mechanisms pulling opposite ways, with no path
  through. THREE lessons are now waiting, and each is a pitfall in the guide's own form:
  (A) changing WHERE or HOW something is delivered does not carry the old path's guarantees
  along, and what no test pins falls away SILENTLY — the page still loads, the tests stay
  green, only a promise no longer holds. Point 419 measured four such losses from one move.
  Its special case: logic living in a file version control does not track, which no test and
  no second model can see.
  (B) a mechanism defeats itself as soon as the rule is followed exactly (13.08.2026,
  retrospective §3.116): the handover's own prescribed follow-up counts as work and deletes
  the marker it just wrote — three times in one day — and a guard asked by hand, as the rule
  demands, blocks forever on an stdin that only the automatic call supplies. The test question
  belongs in the guide: what happens when someone follows the instruction to the letter, and
  what when they additionally invoke it by hand?
  (C) two rules block each other, so the helper can neither act nor stop (19.08.2026, the
  mechanism half is point 751): what one rule demands at the exit is what another forbids,
  and the helper repeats the same refusal instead of getting out. Its prompt: every lock
  needs an exit no other rule takes back — and if you find yourself repeating, that
  repetition IS the finding, not the answer. The entry is owed in FOUR lines: written out
  once, it cost 5 lines and 79 words over the budget and was taken back out because
  `guide-brevity-core.test.mjs` was the unit layer's only red and blocked every push — which
  is this point's forcing function doing its job, not a reason to skip the lesson. The
  reverted wording stands verbatim in commit 9b484e41 and is the draft to fold in, not to
  invent a second time.
  DECIDE AND DO, in this order: (1) read the guide whole and judge which existing entry is
  now the WEAKEST — the budget is a forcing function, so a new lesson earns its place by
  displacing one, not by widening the frame; (2) for (C) the cheapest displacement is
  already identified: MERGE it into the existing »Die Grenze spricht erst beim Aufhören«
  bullet, which is the same subject seen from the other side, and pay for the merged entry
  by tightening ~40 words of the neighbouring bullets; (3) only if genuinely nothing is
  weaker and nothing merges, raise both budgets deliberately in `guide-brevity-core.mjs`
  with the justification in the same commit, the way the doc-budget ceilings are raised —
  this is the LAST resort, not the first; (4) either way the new pitfall goes in with its
  prompt, in the guide's established form.
  VERIFIABLE: `scripts/guide-brevity-core.test.mjs` stays green (the real guide inside its
  budget), the guide contains the new pitfall, and `node scripts/retro-refresh.mjs
  --guide-reviewed` is re-attested afterwards.
  NOTE: the guide currency was attested on 29.07. against the sources of that day; the
  review found this gap and could not close it, which is what this point exists for.

- [ ] 438. The project hooks cannot fire outside the repo root (29.07.2026, measured in a
  `/doctor` run and reviewed by the second model; bundle Modell & Wächter). All 31 project hooks in
  `.claude/settings.json` are wired RELATIVELY (`node scripts/x.mjs`), so a session whose cwd
  is not the repo root loses the WHOLE guard chain to a non-blocking `Cannot find module` —
  silently, because a non-blocking hook error produces no notice. MEASURED over 46 transcripts
  (06.–29.07.): session 8210a7ce 99 failures against 11 successes, 830a6878 44/51, f8c46e2f
  43/245, 68c8c394 12/81, plus two worktree sessions. The failing cwds are the memory
  directory, `hoa/local`, `~/.claude`, a second checkout, and removed agent worktrees; most
  frequent are lock-heartbeat 45×, prep-arm 28×, closing-guard 26×, board-first-guard 20×,
  every Stop guard 4×. THE PROOF OF CAUSE: the two USER-scope hooks are wired ABSOLUTELY and
  never failed. The four-eyes review confirmed the damage — a guard blocks via stdout JSON
  with EXIT 0, so a crash (exit 1) is non-blocking and THE VETO IS LOST: a crashed
  `closing-guard` would have let a version tag through.
  STATE 07.08.2026: the DETECTOR is built, reviewed over three rounds and on `main` —
  `guard-health-core.mjs` judges each hook row's anchoring, `--wiring` prints every
  replacement line, and `RELATIVE_WIRING_ROLLOUT` ratchets in both directions (a new
  relative hook is a finding, and so is a record whose line is already anchored). What is
  OWED is the rewiring itself: all 39 hook lines are still relative, and editing
  `.claude/settings.json` needs an ATTENDED session. Measured from a foreign cwd with real
  spawns: the relative form dies with `Cannot find module`, the anchored form fires, and the
  `node -e` bootstrap fires only when it splices the path into `argv[1]`.
  THE ROLLOUT, in the shape that review left it, and in this order:
  (a) PILOT ONE harmless high-frequency hook (`lock-heartbeat-hook`) on
  `node "$CLAUDE_PROJECT_DIR/scripts/…"` and verify it in a NEW session from a non-root cwd
  (settings need a session restart) — only then the other 30. Never all at once: a failed
  expansion would disable all 31 silently.
  (b) Keep a shell-agnostic fallback ready (a `node -e` bootstrap reading
  `process.env.CLAUDE_PROJECT_DIR`). A hardcoded absolute path is the LAST resort only —
  `.claude/settings.json` is committed and would then bind every checkout.
  (c) The new check belongs in `guard-health-core.mjs`, which already audits "can it fire at
  all", but it needs STRUCTURED input: `wiringText()` hands it settings plus active git hooks
  as one blob, and `scripts/git-hooks/pre-push`+`commit-msg` are relative ON PURPOSE (git
  guarantees the repo root), so a naive check would accuse them.
  (d) The switch CHANGES WORKTREE SEMANTICS — a worktree agent would run the MAIN tree's
  guards against main-tree state instead of its own toothless checkout copies. That is
  better, but it is a deliberate decision and belongs in the commit message, not in a silent
  side effect.
  (e) The removed-worktree class is NOT fixed by this (a dead cwd kills the spawn itself) and
  stays with the worktree-hygiene work.
  VERIFIABLE: pure Vitest on the wiring audit — a relatively wired project hook is reported, a
  `$CLAUDE_PROJECT_DIR`-anchored one is not, the two git hooks are never accused, and an
  unreadable settings file allows (fail-open). Live: one new session started from a non-root
  cwd shows the piloted hook firing where it previously failed.
  ATTENDED ONLY: `.claude/settings.json` always raises a permission prompt. MECHANISM REVIEW
  REQUIRED (CLAUDE.md §7.2).
  DOCS in the same commit: `docs/batch-autonomy.md` where the guard chain is described, and
  CLAUDE.md §7.2 only if the families it names change.

- [ ] 451. The reply that sent its own flag (user 30.07.2026: "Was ist mit dem Chat los?" —
  two agent messages on the board read literally `--text-stdin`; bundle Chat & Tafel).
  `scripts/board.mjs` accepts `--text-stdin` for German prose; `scripts/chat-reply.mjs` does
  NOT — it joins `process.argv.slice(2)` into the message, so the flag itself was published as
  the answer, twice, and the user's real replies never arrived. Fix both halves: accept
  `--text-stdin` with the same meaning as in `board.mjs`, and REFUSE any unknown `--flag`
  loudly (exit 1, naming it) instead of sending it as text — a send that silently publishes an
  option is worse than no send. Check the sibling writers for the same shape while there.
  VERIFIABLE: Vitest on the argument parsing — `--text-stdin` reads stdin, an unknown flag
  exits non-zero and posts nothing, a plain text argument still works, and a text that merely
  BEGINS with a dash is still sendable (via stdin), so the guard cannot swallow legitimate
  prose.

- [ ] 465. A now-card outlives the session that wrote it (user 30.07.2026, from the board
  screenshot: "'Gerade keine laufende Arbeit' ist auch nicht wirklich wahr … beim nächsten
  Mal wird es wieder so eine geben, oder?"; bundle Chat & Tafel). After the forced handover the
  stopped session's card "Gerade keine laufende Arbeit" (17:09) still stood in "Woran ich
  gerade arbeite" BESIDE the new session's card, so the board claimed work and no work at
  once. It was removed by hand — which is the defect: a now-card is written by a session and
  cleared by NOBODY when that session dies or loses the batch.
  FINAL STATE: a now-card carries the session that wrote it. At publish time a card counts as
  ORPHANED when its session no longer holds the batch lock, or when its stamp predates the
  current owner's `acquiredAt`; an orphaned card is REMOVED rather than left standing, and
  the publish gate refuses a board that still shows one — the same shape as its existing
  refusal of a board missing a card for an open point. The board must rather refuse itself
  than show something false; that is the property this and point 439 (a card title falling
  silently back to "Punkt N") have in common.
  ALSO IN THIS POINT, same gate, same reason (user 11.08.2026, asked TWICE within one
  evening): a now-card must carry an END-TIME ESTIMATE beside its start stamp, the way
  `20:59 · ~23:59` already reads. The card for point 648 stood for over an hour with a bare
  start time, and the user had to ask what it would cost him — a board he must ask about is
  not a board he can glance at. The publish gate refuses a now-card whose meta field carries
  no `~<end>`, so the omission cannot recur silently; the estimate is the session's judgment
  and may be restated as it learns, but it may not be absent.
  VERIFIABLE: the pure layer covers orphan detection (foreign session, stamp older than the
  current acquisition, own live card kept), the missing-estimate refusal (a card with only a
  start stamp is rejected, one with `start · ~end` passes) and the gate's refusal; a live
  handover leaves no stale card behind.

- [ ] 466. The doc verification checks a sentence the README no longer has (30.07.2026,
  found by the agent that shrank the always-loaded instruction file; reproduced on unmodified
  `main`, so it is PRE-EXISTING and was not caused by that work; bundle Testinfrastruktur).
  `scripts/verify/docs.mjs` fails two checks — "README states an acceptance-criteria count"
  and "README count matches CLAUDE.md §7.1" — because the README no longer carries the
  "All N acceptance criteria" phrase the check greps for. A verification that is red for a
  reason nobody is fixing trains everyone to ignore it, which is the failure mode that let a
  red run sit unnoticed for three weeks before.
  FINAL STATE: decide it in the commit and act, do not silence it — either the README carries
  the count again (and the check keeps it honest), or the two checks go and their intent is
  written into the commit message. Whichever way, `node scripts/verify/docs.mjs` exits 0 on a
  clean `main`.
  IN THE SAME POINT: `docs.mjs` gains the `Detail:` pointer check that mirrors its existing
  `Evidence:` checks — every acceptance criterion whose detail was moved out must resolve to
  a real section in `docs/acceptance-criteria-detail.md`, so the move can never rot the way an
  unchecked pointer does. That is a gate change and therefore needs the other model's recorded
  review before it lands (`mechanism-review-guard`).
  VERIFIABLE: `docs.mjs` green on `main`; the pure layer covers the pointer check against a
  present, a missing and a misspelled detail section.

- [ ] 531. The spec documents still describe the old bird's-eye collision (found
  06.08.2026 while closing point 299, escalated by the building agent rather than
  guessed around). Point 299 added a settlement footprint to the bird's-eye
  collision and made a debug jump to an enterable place ENTER it, but two spec
  passages still describe the state before it: `design.md` §11 names the bird's-eye
  colliders as "trees and animals" only, and §21.3 describes the jump-to picker as
  landing in the bird's-eye view in every case. `CLAUDE.md` §7.1 point 4 repeats the
  same "trees and animals" wording. The evidence chain
  (`docs/acceptance-evidence.md` §4) was updated with the point and is correct — it
  is only the two spec files that lag.
  WHY IT WAS NOT DONE IN THE SAME COMMIT, which is the rule: both files sit AT their
  measured ceilings in `scripts/doc-budget-core.mjs` (CLAUDE.md 8991 of 8992 words,
  design.md 28164 of 28171), so the ~70 words the correction needs do not fit.
  FINAL STATE: `design.md` §11 names the settlement footprint among the bird's-eye
  colliders with its one-way rule, §21.3 states that a jump to an ENTERABLE target
  enters it while a jump to any other target stays a bird's-eye jump, and
  `CLAUDE.md` §7.1 point 4 matches. The words are won back by TIGHTENING prose in
  the same two files — per the standing rule a blocked budget means shorten or
  merge, and raising a ceiling is the last resort and needs the user's agreement.
  If no tightening of comparable value is found, the point ESCALATES the ceiling
  question to the user instead of silently raising it.
  VERIFIABLE: `node scripts/doc-budget-core.mjs` (or the doc-budget guard) green
  with both passages present; `scripts/verify/docs.mjs` green; a grep for "trees and
  animals" finds no bird's-eye collision passage that omits the settlement.

- [ ] 532. The collision suite counts a different number of checks every run
  (found 07.08.2026 while merging point 349). Three runs of `collision` against the
  SAME tree (`main` 72fe646a) reported 19, 24 and 25 checks: the 24-check run failed
  `PoC village: the teaching stone is in the layout — null` on both its try and its
  retry, the 19-check run never ran that check at all and went green, and WebGPU
  reported 25 green. So a green `collision` run does not prove the coverage the
  previous green run had, and a real teaching-stone defect disappears by itself on
  the next run. This is the class of the closed point 404 — a passing count over a
  set that silently shrank — one suite further on, and it defeats the flake policy
  too: "the same check failed twice" cannot be judged when the check is not always
  asked.
  FINAL STATE:
  1. The suite's check SET is deterministic: the same tree asks the same questions
     every run, on both backends. Whatever the suite currently picks procedurally —
     the evidence points at WHICH settlement it reaches for, and whether that one
     happens to carry a teaching stone — is chosen from a pinned seed or iterated in
     full, not sampled.
  2. A check that cannot run REPORTS that it did not run, as a named skip with its
     reason. A silently absent check is the defect here; a loud skip is not.
  3. The run's summary states the expected check count beside the actual one and
     FAILS when they differ, so a shrunken set is a red rather than a smaller green.
     Where the count is legitimately variable, the pinned expectation says so with
     its range and its reason.
  4. SETTLE THE TEACHING STONE FIRST, because the answer decides (1): is the stone
     optional in the PoC village by design, or was it missing when the 24-check run
     read `null`? If it is genuinely sometimes absent, the check states the
     precondition and skips loudly per (2); if it must always be there, the null is
     a product bug and is fixed here.
  VERIFIABLE: pure Vitest over the suite's check registry where the choice is
  derivable, plus three consecutive `collision` runs on a quiet machine — WebGL 2 and
  WebGPU — reporting the SAME check count, and a deliberately removed check turning
  the run red instead of shrinking it.

- [ ] 534. One project-slug resolver, and a finding recorded from a worktree survives
  (guard/memory audit 07.08.2026, findings 1/3/6 — `docs/guard-memory-audit.md`).
  MEASURED: `findings-paths.projectSlug` maps the repo path to the memory directory with a
  bare `replace(/[^A-Za-z0-9]/g,'-')` while `retro-sources.defaultMemoryDir` strips the
  trailing dash and lowercases a drive letter. `REPO_ROOT` ends in a separator, so the two
  answer DIFFERENTLY — `-workspace-hoa-` against `-workspace-hoa` — and both directories
  exist on disk: 74 memories plus `MEMORY.md` in one, the findings carrier ALONE in the
  other. `memoryIndexPath()` therefore points at a `MEMORY.md` that is not there, so
  `ensureIndexed()` in `finding.mjs` takes its catch branch on EVERY call and has never
  linked the carrier; the index line that reaches it was written by hand. On Windows the
  same split reads `C--…` against `c--…`.
  SECOND HALF, same resolver: `carrierPath()` derives from the CHECKOUT path, so a finding
  recorded from `…/.claude/worktrees/agent-XXXX/` writes a carrier of that worktree's own,
  which the owner's `--drain` never reads and which dies with the worktree. Worktree agents
  are the project's principal finders under maximal delegation, so this is the common case,
  not the edge one. `retro-sources` already refuses LOUDLY on this defect class.
  DELIVER: (a) ONE resolver — `retro-sources`' form is the correct one (it matches the
  directory the harness really writes) and `findings-paths` imports it instead of restating
  it; (b) `carrierPath()` NORMALISES a worktree checkout to its main one (the shape
  `memoryDirVariants` already uses) and REFUSES loudly rather than writing when it still
  cannot resolve; (c) the existing carrier file is moved to the resolved directory and
  `ensureIndexed()` links it for real; (d) `MEMORY.md`'s carrier pointer stops naming a
  literal Windows path — which no longer exists on this Linux host — and names the COMMAND
  that prints the path instead, so it cannot go stale on the next host.
  VERIFIABLE: pure Vitest — the two resolvers answer identically for a path with and without
  a trailing separator and for a Windows drive letter; a worktree path normalises to its main
  checkout; an unresolvable path throws rather than writing; `ensureIndexed()` links into a
  real index. Live: a finding recorded from a worktree is read by `--drain` in the main tree.
  Criticality: high (the carrier is the only thing that outlives a finding session).

- [ ] 535. One definition of what counts as a mechanism, and it reaches the hooks
  (guard/memory audit 07.08.2026, findings 2/5). CLAUDE.md §7.2 states that
  `mechanism-review-guard` "lets no new or changed guard, gate or HOOK end a turn without
  the OTHER model's recorded review". `isMechanismPath` matches `-guard`/`-gate` and
  `scripts/git-hooks/*` only, so EIGHT wired enforcers stand outside it — `batch-resume-hook`,
  `dashboard-reminder-hook`, `lock-heartbeat-hook`, `lock-release-hook`, `prep-arm-hook`,
  `dashboard-sync`, `worktree-reminder` and their cores. `dashboard-reminder-hook` is the file
  `HIGH_FREQUENCY_FIRST` names FIRST, its text replayed at every prompt, and it can be
  rewritten today with no second pair of eyes.
  The same disagreement runs one layer down: `rule-review-state.countCorpusEntries` counts
  `/-(guard|hook)\.mjs$/` while `guard-health-core.ENFORCER_RE` includes `-gate`, so
  `model-trailer-gate.mjs` and `pre-push-gate.mjs` are outside the corpus the review SCHEDULE
  watches — its growth trigger cannot see that class grow at all.
  DELIVER: (a) WIDEN `isMechanismPath` to `-hook` — the file's own comment already argues the
  name-based reach, so this is a one-line, reviewable edit; CLAUDE.md is NOT weakened to match
  the code; (b) `countCorpusEntries` imports `ENFORCER_RE` instead of restating it, as
  `guard-inventory-core` already does. The count moves 107 → 109, so the review attestation is
  RE-RECORDED in the same commit or the schedule reads the change as growth.
  A THIRD SHAPE, met 09.08.2026 while closing point 566: a gate need not be a `.mjs` enforcer
  at all. Arming `no-undef`/`no-var` over `scripts/**/*.mjs` in `.oxlintrc.json` created a gate
  that now refuses commits through `npm run lint` in CI, the fast gate and the pre-push hook —
  and `isMechanismPath` matches neither a `.json` config nor `scripts/verify/*`, so nothing
  fired. The review happened because §6 was obeyed by hand, and it returned
  `merge-with-fixes` on four confirmed defects, one of which let the very bug the gate exists
  to kill return undetected. So the reach must also cover WHAT A GATE IS WIRED THROUGH, not
  only what a file is called: at minimum the lint/audit configuration the gate commands read
  (`.oxlintrc.json`, and the `test`/`lint` script definitions in `package.json`).
  VERIFIABLE: pure Vitest — a `-hook` path is a mechanism path and a `-hook` change with no
  review record BLOCKS; an `.oxlintrc.json` rule change likewise BLOCKS unreviewed; the corpus
  count matches `guard-inventory`'s enforcer count on the real tree.
  Criticality: high (it decides what the four-eyes gate sees at all).

- [ ] 536. The two wired enforcers no selector reaches get conventional names
  (guard/memory audit 07.08.2026, finding 4). `dashboard-sync.mjs` (Stop) and
  `worktree-reminder.mjs` (PreToolUse/Agent) enforce real rules with pure cores, but their
  names end in none of `-guard`/`-gate`/`-hook`. So `guard-health` never asks whether they are
  still wired or tested, `countCorpusEntries` never counts them, and the four-eyes gate passes
  over them. Nothing is broken TODAY — which is the finding: were either unwired tomorrow, no
  check would say so.
  DELIVER: rename to `dashboard-sync-guard.mjs` and `worktree-reminder-hook.mjs` (cores and
  tests with them) in ONE commit together with their `.claude/settings.json` lines, so the
  chain is never half-renamed. ATTENDED: the settings file always prompts, so this point is
  worked in an attended session, not by a delegated agent.
  VERIFIABLE: `node scripts/guard-inventory.mjs` reports `unconventional 0`, `guard-health`
  lists both, and the corpus count rises by two — with the attestation re-recorded in the same
  commit as in point 535. Criticality: medium.

- [ ] 537. The untested-guard ratchet is ratcheted, and the real debt named
  (guard/memory audit 07.08.2026, finding 8). `KNOWN_UNTESTED` records seven enforcers as
  lacking a tested core and states the list "can only shrink — remove a name the moment its
  core gains a test". Judged by the module's OWN `tested` rule, four now pass:
  `batch-progress-guard`, `batch-resume-hook`, `dashboard-reminder-hook`, `lock-heartbeat-hook`.
  The list overstates the debt by more than half, and a standing amnesty nobody re-reads is
  how the real debt hides.
  DELIVER: delete those four names; keep `lock-release-hook`, `prep-guard` and `prep-arm-hook`
  — which has no local import at all — each with its debt named in one line. Add the ratchet's
  own check: a name whose core IS tested fails the gate instead of sitting there.
  VERIFIABLE: pure Vitest — a tested core still listed in `KNOWN_UNTESTED` FAILS; the three
  remaining names pass; the list cannot grow without a written reason. Criticality: medium.

- [ ] 538. Two memories that describe mechanisms that are gone
  (guard/memory audit 07.08.2026, findings 7/10). `chat-timestamp` — 7.7 KB, the project's
  third-largest memory, loaded every session — states that `dashboard-reminder-hook.mjs` emits
  the timestamp obligation as its first and last line, "(Zeilen 66 und 131)". Point 440 took
  that out, and the hook now says the OPPOSITE in its own header: the rule is not stated there,
  `timestamp-guard` blocks the turn. The RULE is live; only its stated mechanism is wrong.
  And the memory index calls `pending-queue-work-29-07` a "CARRIER for findings not yet in
  TASKS.md" with the instruction "delete the file once they are filed" — the file has been
  marked DRAINED since 30.07.2026 and deliberately survives, because it holds the one thing a
  work-order point cannot: what a `/doctor` run rejected ON PURPOSE. The index line orders the
  deletion of exactly that record.
  DELIVER: (a) `chat-timestamp` corrected to the layers that are live (the user-scope hook plus
  `timestamp-guard`) and its nine-escalation history cut to the surviving rule — a memory that
  cites LINE NUMBERS drifts by construction, so it cites the file's statement instead; (b) the
  index line for `pending-queue-work-29-07` rewritten to what the file now is, a record of
  rejected options that is not to be re-analysed, with the deletion instruction removed.
  VERIFIABLE: no runtime invariant — this is corpus hygiene. The proof is that neither memory
  names a mechanism the tree does not have; check each claim against the code that owns it.
  Criticality: low, frequency HIGH (both texts load every session).

- [ ] 607. The evidence for criterion 20 names a control count that is two dozen short
  (found while delivering point 605). `docs/acceptance-evidence.md` §20 states that the
  completeness test pins "132 controls"; the debug menu now carries 158. The number was
  right when it was written and has not been maintained since, which makes the evidence
  chain read as current while it is not.
  FINAL STATE: the count is not written in prose at all. §20 names the TEST that pins the
  completeness (which is what actually holds the property) and states the count only
  where a machine keeps it true — or, if the number stays in the document, the sync test
  that already guards `docs/graphics-detail-levels.md` gains the same duty for this
  figure, so a drifted count fails the unit layer instead of quietly aging. The rest of
  `docs/acceptance-evidence.md` is swept for the same class of hand-maintained number in
  the same commit.
  VERIFIABLE: Vitest — the guard fails on a deliberately wrong count and passes on the
  real one; `npm run test:unit` green.
  Criticality: low — a documentation defect, but in the file the closing run reads as
  proof.

- [ ] 609. The proof guard is built, taught and wired to nothing (found 10.08.2026 by the
  second model while clearing point 594). `scripts/point-proof-guard.mjs` refuses the tick of
  a point whose `PROOF:` line has not run at the current HEAD — the mechanism exists, has a
  register, a `--status` and a CLI, and point 594 just taught it to recognise the landing
  command. It has NO hook entry in `.claude/settings.json`. Its PreToolUse mode therefore
  never runs: no `PROOF:` line has ever been demanded of anyone, and 594's teaching bites
  only once somebody arms it. This is the retrospective's lesson "built, tested, documented — and
  put in nobody's way" again, in the one family whose whole purpose is to be in the way.
  FINAL STATE:
  1. The guard is ARMED in `.claude/settings.json`, in the PreToolUse chain beside the other
     tick gates, and a run proves it fires: a point carrying a `PROOF:` line cannot be ticked
     until its command has run at HEAD, and one without such a line is untouched.
  2. WIRING IS ATTENDED WORK — `.claude/settings.json` prompts on every edit, so this point is
     done in a session with the user present, not by a delegated agent.
  3. THE CLASS, NOT THE CASE: every guard the repository ships is checked for the same gap.
     `scripts/guard-inventory-core.mjs` already knows the inventory — it gains the question
     "is this guard reachable from the settings chain at all?", and an unwired guard is named
     loudly rather than counted as present. `guard-health-guard` carries the verdict, so the
     next one cannot sit unwired for a month.
  VERIFIABLE: Vitest — the inventory check fails on a fixture whose guard has no hook entry
  and passes when it has one; plus the recorded live proof of 1, since an armed hook is the
  one thing the unit layer cannot demonstrate about the real settings file.
  Criticality: medium — nothing the player sees, but it is a gate everyone believed was
  closed, and the belief is what made it worth nothing.

- [ ] 611. The fence test tolerates what it claims to forbid (four-eyes finding on point
  604, 10.08.2026). `src/scenes/place/layout.test.ts:664` asserts that no dwelling grows
  through a fence with `toBeGreaterThan(-0.5)`, while the worst real case — the tuareg
  camp's tent through its own windbreak — measures -0.463 m: 3.7 cm of headroom, no comment
  naming what is tolerated, and a test name that claims more than it enforces. The measured
  field (second model, 10.08.2026): tuareg -0.463, maasai +0.04, somali +0.06, pedi +0.12,
  zulu +0.17. They are open wedge corners rather than closed pockets — a player backs out
  the way he came — which is why 604 shipped without them, but a silent threshold is how
  the next real crossing arrives unnoticed.
  FINAL STATE: either the tuareg camp is seated so its tent clears its windbreak like every
  other plan, or the tolerated case is NAMED in the test — the specific plan, the measured
  value and why an open corner is acceptable — with the threshold set just past the named
  case rather than at a round number, so a NEW crossing fails even while the old one stands.
  The other four plans are asserted positive, not merely above -0.5.
  VERIFIABLE: Vitest — the named case passes, a deliberately worsened plan fails, and the
  four clear plans are held above zero.
  Criticality: low — nothing traps the player today, but the assertion is the one thing
  standing between a future crossing and the picture.

- [ ] 467. The versioned board refresher reaches no reader (30.07.2026, found by the agent
  that fixed the refresh stealing the chat's focus; bundle Chat & Tafel). Two halves of one
  hole. (a) `scripts/board-refresher-core.mjs` exports `refresherScript()` /
  `REFRESHER_SOURCE`, but NO production script imports them — neither `scripts/board.mjs` nor
  `scripts/board-publish.mjs` touches the module; the script text that actually runs lives
  literally inside `.batch-dashboard.html`, and a SECOND, DIVERGED hand-copy sits in
  `origin/board:board.html`, where it does not even dispatch the `hoa-board-swapped` event the
  chat re-injection is documented to ride on. So a fix made in the versioned source reaches
  nobody, and the two copies drift with nothing comparing them. (b) The module's own comment
  claims `structureViolations` refuses a board that does not carry the versioned script — it
  contains no such check, so the promise "versioned, therefore it cannot break silently" is
  not held by anything.
  FINAL STATE: ONE source of the refresher script, injected by the publish path, so what the
  reader runs is what the repository versions; the diverged copy in the `board` branch is
  produced by that path rather than maintained by hand; and the structure check the comment
  promises either EXISTS and fails a board whose script does not match the versioned source,
  or the comment goes. The `hoa-board-swapped` dispatch must be present in whatever the reader
  actually runs.
  VERIFIABLE: a Vitest case asserting the published board's script is byte-identical to
  `REFRESHER_SOURCE`, one asserting the structure check refuses a board carrying a foreign or
  absent script, and one covering the event dispatch. Plus one published board reviewed by
  eye — a swap must still re-inject the chat.

- [ ] 468. The same blind parse sits in two more readers of the work order (30.07.2026,
  named by the agent that fixed the board's title parse; bundle Modell & Wächter). The defect
  shape of point 439 — a `$`-anchored line pattern applied to `split('\n')` output, which
  matches NOTHING when the file arrives with CRLF because `.` does not match `\r` and `$` does
  not stand before it — was found in two further readers that were NOT in that point's file
  scope: `parsePointSpecs` in `scripts/dashboard-integrity-guard-core.mjs` (its whole spec map
  comes back empty, so every per-point check silently passes on nothing — observed live on
  30.07.2026, when it reported 96 queue cards as "point does not exist") and
  `processTaskPoints` in `scripts/retro-core.mjs`. Two more carry the same shape but are
  LF-fed by construction today (`retro-core.mjs` around line 94,
  `batch-handover-observe-core.mjs` around line 52) — a construction, not a guarantee.
  The line endings on disk were normalised on 30.07.2026, so the symptom is gone; the READERS
  are still one bad checkout away from it, and the class is retrospective §3.72: over a
  known non-empty source, an empty parse is a FINDING, not an answer.
  FINAL STATE: every reader of the work order tolerates both line-ending forms, and the two
  guard-side readers REPORT an empty parse over a non-empty file instead of passing. A sweep
  names every remaining instance of the shape in `scripts/` and either fixes it or records why
  it cannot arrive with CRLF. Both files are guard cores, so the other model's recorded review
  is required before the merge (`mechanism-review-guard`).
  VERIFIABLE: one Vitest case per fixed reader whose fixture text carries CRLF explicitly (a
  fixture written with `\n` passes before the fix and proves nothing), plus one asserting the
  empty-parse report fires for a non-empty source.

- [ ] 491. Queue prose written only into the HTML is lost on the next rebuild
  (measured 04.08.2026, and it cost the German text of thirteen cards). The
  Warteschlange is a PROJECTION: `scripts/board-queue.mjs` renders it from
  `.claude/board-queue.json`. But `node scripts/board.mjs queue <N> "<text>"`
  writes the rendered card into `.batch-dashboard.html` ALONE, and nothing writes
  it back to the data file. So the German titles, estimates and prose of points
  477–489 stood correctly on the board and evaporated at the first
  `board-queue.mjs` run — the board reverted to the work order's English
  headlines and "Noch keine Beschreibung auf dem Board". They were recoverable
  only because the previous publish commit was still reachable on the board
  branch; one more publish would have made the loss permanent.
  FINAL STATE:
  1. Whatever writes a queue card writes the DATA file, exactly as `board.mjs
     title` already does for titles ("the Warteschlange is a projection, so a
     title that lived only in the HTML would evaporate on the next rebuild" — the
     comment is right, and `queue` is the case it does not cover).
  2. A rebuild that would DROP prose or a title an existing card carries refuses,
     or restores it from the HTML first. A projection may narrow the board's
     content silently only where the work order genuinely says less.
  3. `board-queue.mjs` reports what it changed per card, not only the totals: the
     run that destroyed thirteen cards printed "queue rebuilt … 109 card(s)" and
     a hint listing them as "no prose yet", which reads like a state, not a loss.
  VERIFIABLE: pure Vitest — a card written through `board.mjs queue` survives a
  rebuild; a rebuild that would blank an existing card's prose is refused or
  restores it; the report names the cards it emptied.

- [ ] 495. A versioned git hook without its executable bit is silently inert
  (found 04.08.2026). `scripts/git-hooks/pre-push` was committed 100644. Git for
  Windows runs a hook whichever mode it carries, so the gate worked on the old
  host and fell silent the moment the working copy moved to Linux — the only
  trace was one hint line inside a SUCCESSFUL push ("hook was ignored because
  it's not set as executable"), which no gate reads. The bit is restored, so this
  point is not the fix but the MECHANISM that keeps the next hook from repeating
  it: `scripts/enable-hooks.mjs` already wires `core.hooksPath` on every
  `npm install` and is the one place that knows the hook directory.
  FINAL STATE:
  1. `enable-hooks.mjs` also ensures every file directly under
     `scripts/git-hooks/` is executable for the user on POSIX — `chmod` the
     working file AND `git update-index --chmod=+x` where the INDEX mode is
     644, so a fresh clone gets it too rather than needing the same repair.
     Windows has no such mode; the step is skipped there, not faked.
  2. It stays FAIL-OPEN and quiet, like the rest of that script: a read-only
     checkout, a tarball without `.git`, a hook directory that does not exist —
     each leaves the install green. Only a mode it actually changed is reported,
     one line per file, so a silent repair cannot pass for "nothing was wrong".
  3. The DETECTION half widens the enforcer built for exactly this question:
     `guard-health-guard` ("no enforcer may sit in the tree unable to fire")
     already reads the active hook directory, but only its CONTENT. It also
     judges the arming — a hook in the active directory without the executable
     bit is a finding like an unwired guard, reported the same way, on POSIX
     only. Widening it, not a sibling guard beside it.
  4. A Vitest case pins both decisions: given a listing of hook files with their
     modes, which need a chmod, and which count as unable to fire. Pure
     functions, so no test touches a real repository.
  VERIFIABLE: `npm run test:unit` covers both decision functions, including the
  no-op case, a 644 hook, a non-POSIX platform and an unreadable directory;
  `git ls-files -s scripts/git-hooks/` reports 100755 for every hook; and
  `node scripts/guard-health-guard.mjs --status` names a hook whose bit was
  removed.

- [ ] 497. The German-language rule has no mechanism at all, and the audit
  PASSED IT ANYWAY (user 04.08.2026: "Warum schreibst du die ganze Zeit auf
  Englisch? Klappt der Mechanismus nicht? Falls ja, klappen vielleicht auch
  andere Mechanismen nicht."). Answers to the user are German (memory
  `language-german`); on 04.08.2026 a whole session narrated in English and
  nothing objected. The reason is not a broken enforcer but a MISSING one: the
  rule lives only in a memory line. Its neighbour proves the point — the
  chat-timestamp rule carries an injection hook AND a blocking Stop guard
  (`timestamp-guard.mjs`) that reads the outgoing reply, and it has not slipped
  once. `docs/rule-corpus-audit.md` row A25 nevertheless records
  `language-german` as "OK" with an EMPTY finding column, because that audit
  asked whether each rule's TEXT was current, never whether anything MEASURES
  it. `guard-health-guard` has the same blind spot from the other side: it
  proves every wired enforcer can fire (32 of 32 today) and says nothing about a
  rule that never got one.
  FINAL STATE:
  1. A Stop-chain guard judges the LANGUAGE of the turn's outgoing answer and
     blocks a reply whose prose is not German. It rides the layer that already
     works for the stamp: the same reply text `timestamp-guard` reads, a pure
     decision core, Vitest-covered, fail-OPEN on any internal error, standing
     down for a session that does not own the batch lock and for a paused batch.
  2. The decision is made on PROSE ONLY, so the code rules stay untouched: fenced
     code blocks, inline code spans, file paths, identifiers, commit subjects,
     command output and quoted English source text are stripped before judging.
     A German sentence naming English identifiers passes; an English sentence of
     narration does not. The verdict is a stopword-ratio decision over what
     remains, with a minimum word count below which it abstains rather than
     guesses — an abstain is an allow.
  3. The remedy line says what to do rather than scolding: write the answer in
     German, code and commits stay English, and it names `language-german`.
  4. The DETECTION half closes the audit's blind spot rather than adding a
     sibling to it: `docs/rule-corpus-audit.md` gains a WHAT-MEASURES-THIS axis,
     filled for every row — an enforcer name, a test, or "nothing". Every row
     that reads "nothing" is either given a mechanism or recorded as
     deliberately unenforced WITH the reason, the way A19
     (`english-no-germanisms`) already is. A25 becomes the worked example.
  VERIFIABLE: pure Vitest over the decision core — an English narration
  paragraph is blocked; a German answer containing English identifiers, paths,
  a fenced diff and a quoted English error message passes; a two-word answer
  abstains; the guard allows on any internal error and when the session does not
  own the lock. `node scripts/guard-health-guard.mjs --status` still reports
  every enforcer wired with the new one counted, and no row in
  `docs/rule-corpus-audit.md` is left with an empty measured-by cell.

- [ ] 498. What the software second lane costs the full regression, measured
  (user 04.08.2026, asking against the open decision "Zweite Bahn läuft in
  Software — reicht das?"). Point 493 restored both lanes and measured ONE
  suite: `flow` runs 58 s on the hardware WebGL lane and 3 min 41 s on the
  software WebGPU lane, a factor of 3.8. What nobody has measured is the number
  the user actually decides on — the WHOLE regression. A LARGE run is two passes
  (the full set on WebGL 2 with preflight and prod preview, then every suite
  except `touch`/`voice` on WebGPU), so the software lane is not a small tail:
  it is a second near-complete pass at software speed. The pre-container figure
  on record is "30–40 minutes" (`docs/batch-resilience.md`), taken on Windows
  where BOTH passes had the GPU.
  FINAL STATE:
  1. One LARGE run on `main` is timed end to end, and the two passes are timed
     SEPARATELY — the WebGL pass and the WebGPU pass — because only the split
     shows what the software lane costs and what the GPU gained.
  2. `docs/host-environment.md` records all of it beside the existing per-suite
     figures: the two pass durations, the total, the 30–40 min Windows baseline
     it is compared against, and the date and machine state of the run (a
     measurement taken under a running agent pool is worth less, and says so).
  3. The comparison is stated HONESTLY in both directions: the WebGL pass is
     faster than it was on Windows, the WebGPU pass slower, and the answer to
     "is the total worse than before" follows from the measured numbers rather
     than from the factor 3.8 extrapolated.
  4. The measured total is carried onto the open decision card, so the user
     decides against a number rather than an estimate.
  5. THE MACHINE STATE IS PART OF THE NUMBER (user 05.08.2026). The host carried
     other load through the morning, so a run taken then is a SECURED UPPER BOUND
     and is labelled as one wherever it is written down. An upper bound settles
     the question only while it stays BELOW the 30–40 min Windows baseline; above
     it, the run is repeated on a quiet machine before any verdict is drawn.
  6. The software-lane premise is gone (point 505): the WebGPU pass now draws on
     the card at 0.73× the WebGL lane's rate rather than the software lane's 0.26,
     so the factor 3.8 is history and the measurement records what REPLACED it.
  VERIFIABLE: `docs/host-environment.md` names both pass durations, the total
  and the baseline with its date; the run's own log is quoted for each figure;
  and no figure in that section is an extrapolation — every one is a wall-clock
  reading of a run that happened.

- [ ] 506. The software lane reddens at checks it cannot draw fast enough to
  ANSWER (measured 05.08.2026, 01:50–03:40, on a machine with no second verify
  run — the quiet repeat point 499 asked for). Four checks fail on the software
  WebGPU lane and pass, measured, on the hardware WebGL 2 lane, and every one of
  them is a rate the lane cannot deliver rather than a broken product:
  `polish` "settlement walker (goat): the planted foot holds its ground spot"
  reports MEASURED NOTHING — 1 usable stance interval where it needs 3, against
  23 intervals with a worst travel of 0.337 on the WebGL lane; `polish` "the dry
  settlement season reading settles before it is read — after 60176 ms";
  `settings` "a footstep fires with a surface class while walking (point 97)",
  twice, green on WebGL; and `benchmark` dies outright with
  `page.waitForFunction: Timeout 300000ms exceeded` (`benchmark.mjs:89`) because
  its fixed 864-frame route cannot finish in software. `docs/host-environment.md`
  already states the underlying fact — SwiftShader draws roughly one frame per
  second, so "a green run there proves nothing about timing" — but nothing acts
  on it, so every run shows red for it and a real regression would hide in that
  noise.
  COLLISION CARRIES TWO MORE OF THE SAME (measured 05.08.2026, three runs on the
  software lane, green on WebGL 2): "inhabitant walked out and re-entered its
  dwelling through the door — no walk→inside transition observed" and "no inhabitant
  stays pinned past the unstuck window", the latter reporting `"ok":true` beside
  `anyMoved:false` — it FAILS while its rule holds, because at roughly one frame per
  second nothing moves far enough inside the observation window to measure. That is
  the MEASURED-NOTHING signature, and a check that reports a rule as broken while
  saying the rule held is the worst kind of red: it reads as a product defect.
  IT IS NOT ONLY REDS: on 05.08.2026 `VERIFY_GL=webgpu run-all polish` ran 27
  minutes in a synced branch, printed nothing after "starting dev server", wrote no
  frame at all and had to be killed, while `world collision` had passed on the same
  lane minutes earlier. So the lane can also HANG, and while it does, no figure or
  settlement point has a second backend at all — every such merge then owes a loud
  deferral instead of a picture.
  THE GOAT CHECK NOW ROTATES ON THAT LANE INSTEAD OF STANDING RED (measured 08.08.2026,
  three WebGPU `polish` runs after point 549 rebuilt its sampling): it passed one run,
  needed the retry in the second, and failed BOTH attempts of the third — worst foot/body
  travel 2.016, 2.318 and 1.929 against an unchanged bar of 0.25, over 19–27 stance
  intervals with unbroken stances of 103–117 frames. At roughly one frame per second such
  a stance spans a minute and a half of world time, in which the goat plainly walks: the
  figure measures the lane, not the foot. The same check reads 0.047–0.059 on WebGL 2. A
  rotating red is worse than a standing one — it is the shape that teaches a reader to
  wave the lane's reds off — and only the skip of FINAL STATE 2 removes it.
  FINAL STATE:
  1. The run MEASURES the lane's delivered frame rate once, from the running
     page, and reports it in the run header — every verdict below names the lane
     it was taken on rather than assuming one.
  2. A check whose subject is a RATE or a wall-clock budget (stance intervals per
     walk, a settle deadline, the fixed-frame benchmark route) declares the
     throughput it needs. Below it the check SKIPS, naming the measured figure
     and that the lane cannot answer it; it never reds and never passes silently.
  3. NO product threshold moves. The skip is a property of the lane; on a lane
     that meets the throughput the identical check runs unchanged and must still
     fail on a real regression.
  4. Lane skips are counted in the run summary, so a lane that skips half a suite
     can never be mistaken for a green both-backend verification — what the §7.2
     both-backend rule counts is what actually RAN.
  VERIFIABLE: on this host `VERIFY_GL=webgpu npm test -- polish settings
  benchmark` ends green with exactly those four checks reported as lane skips
  naming the measured frame rate, while `VERIFY_GL=webgl` runs all four for real;
  a Vitest case pins the pure skip decision (needed vs measured throughput) in
  both directions, including that a hardware lane never skips.

- [ ] 508. Each now-card is judged by its own number (measured 05.08.2026, bundle
  Chat & Tafel). `parseNowCard` in `scripts/queue-order-guard-core.mjs` cuts the
  WHOLE "Woran ich gerade arbeite" section out as ONE text and files it under the
  FIRST card's number. Several now-cards at once are explicitly allowed (one per
  point in active work), so every word in any of them is charged to the first: today
  "Fertig ist der Weltteil" in the 482 card blocked the turn end with the message
  that the 485 card claimed completion, and the topic guard reported 482 for a
  cross-reference that stood in a different card. A guard that names the wrong card
  sends the session to edit correct text, which is worse than not firing.
  FINAL STATE:
  1. The section is split per `<details class="now">`, and every now-card is judged
     against its OWN point number — by the done-claim check, the card-topic check
     and the conciseness check alike.
  2. A card without a recognisable number is reported as such, never silently
     merged into its neighbour.
  3. The guards keep failing open on an unparseable board.
  VERIFIABLE: pure Vitest on a board with three now-cards where only the SECOND
  carries a done-claim, a cross-point mention and an over-long paragraph — each
  finding must name the second card's point, and a single-now-card board must behave
  exactly as it does today.

- [ ] 514. The compatibility lane has two reds the WebGL lane does not (measured
  05.08.2026 on `main`, both lanes run minutes apart on the same machine, right
  after the lane moved onto the card in point 505). `enrichments` on the WebGPU
  compatibility lane died twice for different reasons — run 1 after 157 green
  checks with `page.evaluate: TypeError: Cannot read properties of undefined
  (reading 'herdsRef')`, i.e. `window.__wildlife` was gone at the moment of
  access; run 2 with `frame 72-water-victoria-falls — its subject is not in the
  rendered picture`. The SAME suite on WebGL 2, twice, showed neither: 244 pass
  and only the measures-nothing dressing flake point 200 already lists. The lane
  is now the project's second evidence lane, so its own faults have to be
  separated from the product's.
  FINAL STATE:
  1. Each of the two is CLASSIFIED, on a quiet machine, as either a lane fault or
     a product defect — the suspicion is recorded so nobody re-derives it: the
     dev hook is deleted on unmount and the compat lane builds the scene on a
     different schedule, so the access may fall into a window the suite does not
     wait through; and the falls frame may sit differently because compat forces
     MSAA off.
  2. What turns out to be the suite's own timing is fixed at the READINESS, not
     with a longer wait: the access waits for the hook the same way the boot
     sequence does.
  3. What turns out to be a product difference between the feature levels is
     stated in `docs/host-environment.md`, so a reader knows which lane can carry
     which verdict.
  4. Nothing here weakens the shutter: a frame whose subject is not in the picture
     stays a failure — the point fixes the cause, never the assertion.
  5. `settings` belongs to the same classification (measured 06.08.2026, twice):
     on the compatibility lane every check that switches TRAA OFF fails, because
     the MSAA path it falls back to cannot exist there — `RGBA16Float does not
     support multisampling` arrives as an uncaptured GPUValidationError and the
     scene then renders black (mean 2.2). WebGL 2 passes the same suite 52/0
     minutes apart. If that is structural, the host-environment section says so
     and the lane's verdict for MSAA checks is recorded as unavailable rather
     than red.
  6. IT IS NO LONGER ONE SUITE'S PROBLEM (09.08.2026, two delegated agents
     independently, on different branches and on the merge-base): the same
     `RGBA16Float does not support multisampling` and the same black frames now
     stand between every RENDER point and its merge, because CLAUDE.md §6 demands
     the picture proof on BOTH backends where they can differ. `baseline-classify`
     labels 16 of 17 `settings` failures pre-existing, WebGL 2 passes the same tree
     59/1 with no console error — so the product is not what is red, the lane is.
     Until this point closes, a render package can be verified on WebGL 2 and its
     WebGPU half is OWED, and that owing is stated at the merge rather than passed
     over in silence. This is what raises the point's urgency; it changes nothing
     about what it must deliver.
  7. A SECOND, CHEAPER DEFECT OF THE SAME FAMILY, found while chasing the first:
     `bootGame` in `scripts/verify/_boot.mjs` calls `webglLaunchOptions` WITHOUT the
     environment, so the Gallium pin never lands and any probe built on that boot
     renders a BLACK canvas while the real suites render the game. It cost one agent
     two probe runs and it is exactly the shape that gets misread as a product
     defect. Fixed here, with a pure test that the boot's launch options carry the
     pin.
  VERIFIABLE: `enrichments` and `settings` run green twice in a row on the
  compatibility lane on a quiet machine, or the host-environment section names the
  difference that makes it structurally impossible there. Plus: a probe built on
  `bootGame` renders the scene, not a black canvas.

- [ ] 520. The board demands a time it gives no way to write (found 05.08.2026
  while closing point 394). `dashboard-guard` refuses the turn end when a
  current-work card's estimate is less than 15 minutes away (`now-eta-soon`) and
  instructs "give each a realistic new `~HH:MM`" — but `scripts/board.mjs` has no
  command that writes one: `status`, `title`, `now`, `queue` and `done` all leave
  the card's `<span class="meta">` untouched, and `promote` takes a times argument
  only when a card is first raised out of the queue. The only remaining way is to
  hand-edit `.batch-dashboard.html` — precisely the act that, per the comment on
  `setCardTitle` in `scripts/board-core.mjs` (point 439), once wrote CRLF into the
  file and crashed `attest`. A guard that names a remedy the toolchain cannot
  perform sends every session down that path.
  FINAL STATE: `node scripts/board.mjs eta <point> "~HH:MM"` rewrites ONLY the
  estimate half of that card's meta span (the start time stays as it is), refuses
  a point that has no current-work card and a time that is not in the board's
  `~HH:MM` shape, and publishes like every other editing command — so the loop
  stays "one editing command, then `attest`". The guard message names this command
  instead of describing the edit.
  VERIFIABLE: pure Vitest on the rewrite (the estimate changes, the start time and
  the body do not; an unknown point and a malformed time both throw; the file is
  written with LF endings whatever it held before), plus a case that the
  `now-eta-soon` remedy text names the new command.

- [ ] 521. The enrichment suite aims by stopwatch and aborts before its own
  EVIDENCE (found 05.08.2026 while closing point 323). `scripts/verify/
  enrichments.mjs` jumps the traveller with `debugJumpTo` — which sets the
  POSITION instantly while the travel camera SPRINGS toward it — and then waits a
  fixed 1500 ms before shooting. Whether the camera has arrived is therefore a
  question of frame rate: on a loaded machine, or on the slower backend, it has
  not, and `72-water-victoria-falls` fails "subject not in the picture". The
  failure is not cosmetic — it ABORTS the run before frame 137, the picture the
  blood-stain criterion is judged by, so a green product looks red and its evidence
  never gets taken. Measured: four such aborts on WebGPU under load, 245/245 green
  on the same tree once the machine quietened.
  FINAL STATE: the wait after a jump POLLS the camera having arrived — the spring's
  own settle, read through the existing `window.__camera` projection the shutter
  already uses — instead of counting milliseconds, with a stated timeout that fails
  with the measured distance still to go. `scripts/verify/fixedWaits.test.mjs`
  already forbids fixed waits in the verify scripts; this one survives because it
  is written as a bare `waitForTimeout` the rule's pattern misses, so the rule is
  widened to catch it in the same pass.
  THE SAME CLASS IN `polish`, measured 06.08.2026 while closing point 480: the tag
  frame's standpoint took FOUR iterations to find (a tree and an empty paddock, two
  children behind an adult, a hut wall filling the screen), and a fresh run on the
  other backend still wrote a frame with the chase pair NOT in it while every tag
  check passed — so the aim is fragile in both suites, and a frame can miss its
  subject without anything failing. The frame that carries the criterion is
  additionally shot from beside a hut whose unlit side fills the picture's left
  quarter: legible, but the standpoint is chosen by luck rather than by a rule.
  The aim therefore belongs where the shutter can judge it — the subject
  declaration (§7.2, point 375) names the PAIR, and the shutter refuses the frame
  when it is not drawn, instead of the script hunting for a standpoint by hand.
  VERIFIABLE: pure Vitest that the fixed-wait rule flags this shape, and the
  enrichments suite green on BOTH backends on a machine that is deliberately busy;
  for the tag frame, a run whose standpoint misses the pair FAILS instead of
  writing the frame.
  FOLDED IN FROM POINT 572 (measure 11, "the capture is deterministic, or the attempt is
  abandoned"): the settled camera is this point's own subject, so the rest of that measure
  is delivered here rather than by a second owner of the capture path. Beyond the poll,
  the PRNG is seeded and the timestep fixed exactly as in the F8 benchmark, and
  `node scripts/picture-stability.mjs` is RE-MEASURED afterwards — point 375's shutter
  closed part of this and the stability has not been re-measured since. The extension
  carries its own ABORT criterion: if the noise floor does not fall below the smallest
  real defect (0.75 %), the investment is written off and recorded as such in
  `docs/picture-check-levers.md`, which is a result, not a failure. Nothing diff-based is
  enabled by this point itself.

- [ ] 529. A Stop hook in the user scope now enforces what a project guard
  ALREADY HARD-BLOCKS (measured 06.08.2026 while taking the turn-cost inventory).
  `~/.claude/hooks/check-reply-timestamp.cjs` is registered as a Stop hook in the
  user scope and checks the chat timestamp — the same rule
  `scripts/timestamp-guard.mjs` blocks the turn end on, hard. It therefore buys
  nothing and costs one node process at every turn end. ATTENDED ONLY: removing it
  edits `~/.claude/settings.json`, a protected path that always prompts, so no
  headless session can do it.
  FINAL STATE: the `check-reply-timestamp.cjs` Stop-hook registration is gone from
  the user-scope settings, and the file with it; one turn end is measured before
  and after to show the saved spawn. `~/.claude/hooks/berlin-timestamp.cjs` STAYS —
  since the point-440 cut it is the only injected statement of the timestamp rule,
  and the versioned copy lives at `scripts/hooks/berlin-timestamp.cjs`.
  VERIFIABLE: a reply written without the stamp is still refused (timestamp-guard
  blocks it) after the removal, and the Stop chain's process count drops by one.

- [ ] 548. The panorama band's two review observations (second model, 07.08.2026; it
  judged BOTH as non-blocking and asked for them as their own point rather than as
  argument). (a) THE ONCE-PER-SESSION CAPTURE TARGETS DO NOT SURVIVE A RENDERER
  RECREATION. `src/scenes/travel/panoramaCapture.ts` holds `targets` module-global, and
  the band is GPU-initialised by one clearing pass on whichever renderer was live at the
  FIRST capture. `WebGLTextureUtils.copyTextureToTexture` destructures the destination's
  `textureGPU` with no lazy init, so a NEW renderer — a context loss, a canvas remount —
  would copy into an uninitialised texture and the empty band of point 545 returns
  SILENTLY, with every check green. Unreachable today (one renderer per app lifetime,
  context loss unhandled app-wide), which is why it is low: the capture is no worse off
  than the rest of the game. Remedy: re-run the band's init clear when the renderer
  identity changes, and pin the identity check in the pure layer.
  (b) THE ENTER-SIDE FIRST-CAPTURE STALL HAS NO BUDGET GATE. `withSynchronousPipelineCompile`
  costs a measured ~3.4 s in ONE frame for the first capture on the slow WebGL 2 lane
  (~0.2–0.4 s warm, none on WebGPU), and it lands on the APPROACH into a settlement —
  a path every player on the fallback backend takes. Point 96's fluidity check bounds
  the LEAVE only (`scripts/verify/polish.mjs`), and the capture fires outside its
  measured window, so nothing today would notice that cost growing. It is bounded,
  once per session and honestly documented — a hitch, not a hole — but this project
  enforces rather than remembers. Remedy: a measured budget on the enter transition
  the way `balance.startup.pictureFreezeBudgetMs` bounds the startup standstill,
  calibratable and debug-editable like its sibling.
  FINAL STATE: a renderer recreated mid-session gets a correctly initialised band rather
  than a silently empty one, and the enter-side capture stall is bounded by a check that
  fails when it grows.
  VERIFIABLE: a Vitest case for the renderer-identity re-init, and a browser check that
  measures the ENTER transition the way point 96 measures the leave.
  Criticality: low — neither is reachable or harmful today; both are the kind of thing
  that stays invisible until the day it is not.

- [ ] 559. The time-tracking mandate is abolished, its useful half kept (user decision
  08.08.2026, answering the board card "Zeiterfassung in der Arbeitsordnung: abschaffen
  oder wiederbeleben?"; bundle Arbeitsordnung). The rule mandated 14.07.2026 prescribes
  four point states — `[ ]` untouched, `[*]` in progress, `[~]` implemented but
  regression pending, `[x]` done — and under every ticked point a `(track: start →
  finish, minutes, ~tokens, model, effort)` line. Measured 27.07.2026 and again on
  08.08.2026: the two intermediate states appear NOWHERE in the work order, and the
  tracking line stands 0 times among the open points and 32 times in the archive, the
  last of them mid-July. The rule is loaded into every session as the memory entry
  `tasks-time-tracking` and has not been followed for three weeks; no guard enforces
  it. The user chose the recommended option — ABOLISH the prescriptive half rather than
  revive it with a mechanism, because what is actually read is the per-card ESTIMATE on
  the board, and that survives without the bookkeeping.
  FINAL STATE: the memory entry prescribes nothing any more. Deleted from it: the four
  checkbox states with every instruction to set `[*]`/`[~]`, and the `(track: …)` line
  with its start/finish/minutes/token/model fields and the 85/15 input-output token
  heuristic. KEPT, as the entry's whole remaining content: ETA calibration — dashboard
  finish estimates are stated at the CATEGORY MEDIAN (small/logic 25–50 min,
  scene/behaviour 60–100 min, minus ~10–15 min under the scoped regression process),
  they LEARN from what points actually took, and an ETA refresh rides on a publish that
  happens anyway instead of causing one. The entry is renamed and re-described to match
  what it now says — it is no longer about tracking — its `MEMORY.md` index line
  rewritten with it, and any `[[tasks-time-tracking]]` link updated.
  `docs/rule-corpus-audit.md` records it as DECIDED-ABOLISHED with this date and the
  user's ruling, not as an open question. The 32 historical `(track: …)` lines in
  `docs/tasks-archive.md` STAY untouched — they record what happened, and rewriting
  history buys nothing. Nothing is added in exchange: no guard, no hook, no substitute
  field. (The answered board card was already taken off "Von dir zu klären" on
  08.08.2026 — a decided question does not wait there for its point to land.)
  VERIFIABLE: a repository-wide search for `(track:` finds hits ONLY in
  `docs/tasks-archive.md` and in the audit documents that count them — never in
  `TASKS.md`, and nowhere as an instruction; a search for the `[*]`/`[~]` states finds
  no rule text demanding them; the rewritten memory entry names no obligation, and
  `MEMORY.md` holds exactly one line for it under its new name. `npm run test:unit` and
  the doc-budget guard stay green (the change only shortens).
  Criticality: low — process hygiene. A rule that formally binds every session while
  nobody follows it teaches that the rule corpus may be ignored, and that cost is
  charged to every other rule.

- [ ] 560. The only active channel for a red branch run is not configured (measured
  08.08.2026 during the live proof of point 513; bundle Modell & Wächter). The CI
  workflow has always carried an ntfy alert step for a failed run, and that step has
  never fired: the probe run reported `NTFY_TOPIC secret not set — skipping the failure
  alert`. While a red `feat/**` run still mailed the owner, the dead step cost nothing —
  the mail was the signal. Point 513 deliberately removed that mail, and what remains for
  a red branch run is the commit status: a PASSIVE mark somebody must go and look at. So
  today a branch gate can fail and nothing at all leaves the repository.
  FINAL STATE: a failed CI gate reaches the owner over ntfy on EVERY ref where it is not
  the mail's job — that is, on `feat/**`, where 513 silenced the mail — and stays silent
  where a green run makes it noise. The repository secret `NTFY_TOPIC` is set from the
  topic the repository already uses (`.claude/ntfy-topic`, the same topic
  `scripts/notify.mjs` posts to, so the owner's existing subscription receives it), and
  the workflow step that reads it is confirmed to fire. Setting a repository SECRET is a
  configuration change on the user's GitHub account, so it is done with his go, not
  silently; if he declines, the point closes by RECORDING that a red branch run has no
  active channel — never by leaving the doc claiming one.
  VERIFIABLE: a deliberately red push to a throwaway `feat/` branch delivers an ntfy
  message naming the ref and the failed step, and the same push on a green state delivers
  none; `scripts/verify/README.md`'s notification section names the channel that actually
  carries a branch failure.
  Criticality: medium — it is the difference between a silent failure and a noticed one,
  and it only became live with 513.

- [ ] 561. The silenced branch gate has three blind spots (four-eyes review of point 513
  by Fable 5, 08.08.2026; bundle Modell & Wächter). Point 513 deliberately makes a red
  `feat/**` run conclude `success` so it stops mailing the owner. The consequence was
  measured, not guessed: the GitHub jobs API reports the failed step's conclusion as
  `success` too, so NO reader of a run's conclusion can recover the truth — only the
  commit status `ci/gate (branch)` carries it. Three holes follow, and none of them is a
  defect of 513's decision.
  FINAL STATE, three parts:
  (a) THE MERGE READS THE BRANCH GATE. `scripts/ci-status-guard.mjs` judges run
      conclusions, so it no longer blocks a turn end on a red branch gate — which is what
      the user chose ("red on a branch is expressly normal"). The residual risk is
      specific: a failure that only the CI host reproduces — the Ubuntu-only class the
      30.07.2026 lesson was written about — now rides a branch to the merge unseen and
      surfaces afterwards as a MAILING red on `main`. So the branch gate is read where it
      still matters: before a merge to `main`, the branch head's `ci/gate (branch)` commit
      status must be green, and a red one blocks the merge with the failing step named.
      Turn ends on a branch stay unblocked.
  (b) A FAILURE BEFORE THE VERDICT STEP IS NOT A GREEN. `checkout` and `setup-node` carry
      no `id`, so if one fails soft on a branch, every later step — including
      `node scripts/ci-gate-verdict.mjs`, whose file was never checked out — fails soft,
      every output stays empty and the run reports a clean green with no status, no summary
      and no alert. Rare (GitHub-infra transients only) and therefore cheap to close: the
      verdict invocation gets a shell fallback that emits `failed=true` plus a
      `verdict-unavailable` step name when the script cannot run at all.
  (c) THE UNUSED FIELD GOES. `ci-gate-verdict-core.mjs` computes `protectedRef` from the
      imported `PROTECTED_REF` and pins it in tests, but nothing consumes it — the mail
      decision is `!isSoftRun(…)`, which is correctly BROADER (tags, dispatch, PRs). An
      unread field that looks authoritative is what a later reader will reach for. Drop it
      with its pins, or consume it and say where.
  ALSO RECORDED, no work: a job-level failure (the 15-minute `timeout-minutes`, a dead
  runner) fails past every `continue-on-error`, concludes `failure` and still mails. That
  is the safer direction for a hang and stays as it is — the docs simply do not claim
  otherwise.
  VERIFIABLE: (a) a merge attempt with a red `ci/gate (branch)` on the branch head is
  refused and names the failed step, a green one passes, and a turn end on that same red
  branch is NOT blocked; (b) a workflow run whose verdict script is unavailable reports
  `failed=true` with `verdict-unavailable`; (c) a repository-wide search finds no reader of
  `protectedRef`. Pure Vitest for each.
  Criticality: medium — (a) is the one that can let a real regression reach `main`.

- [ ] 563. The tag frame's new readability judge has three soft spots (four-eyes
  review of point 524 by the second model, 08.08.2026, verdict merge; bundle
  Testinfrastruktur). `scripts/verify/tagFrameReading.mjs` decides whether the
  village-tag evidence frame readably shows both children, and it was accepted as
  correct — its 67 px floor is genuinely derived from the figure's own geometry and
  its Vitest pin goes red without a browser. Three findings are recorded rather than
  fixed in that merge, because none of them is the failure the point closed and each
  needs its own measurement.
  FINAL STATE:
  1. THE OCCLUSION BAND STILL ADMITS A HUGGING OCCLUDER. A hit is counted as the
     child itself while it lies within ±15 % of the child's distance, so a surface
     roughly 0.8 m in front of the pair at a 5.5 m stand reads as the child at every
     sample: `occluded` stays 0 and `confirmed` reaches 5 while a human sees a rock.
     The probe names what it hit (`hitName`), and the verdict uses that name — a
     sample confirms the child only when the thing hit IS the child — so the distance
     band stops being the sole evidence of identity.
  2. THE FLOOR IS TIED TO A GEOMETRY NOTHING PINS. `KID_HEIGHT` and `KID_BODY_WIDTH`
     mirror the rendered figure (`src/scenes/place/PlaceLife.tsx`, `src/render/
     figures.ts`) by hand; a future change to the figure silently invalidates the
     derived 67 px without any test noticing. A Vitest sync test derives both from
     the figure source and fails when they drift apart — the same shape as the
     existing quality-doc sync test.
  3. A RED RUN NAMES THE WRONG STANDPOINT. In `scripts/verify/polish.mjs` the
     diagnostic calls its report the "best read" while the variable it prints is
     overwritten by every failing bearing, so a red run hands the reader the LAST
     bearing tried instead of the best one seen — the reader then investigates a
     standpoint that was never the near miss. The reported reading is the best one
     by the judge's own ranking, or the message says plainly that it is the last.
  VERIFIABLE: pure Vitest — a reading whose confirming hits are all a foreign object
  is rejected (1); the sync test fails on a deliberately altered figure constant (2);
  the diagnostic picks the best of a series of failing readings, not the last (3).
  No browser run is needed for any of the three.

- [ ] 564. "Candidate real failure" is asserted with confidence the run did not earn
  (measured 08.08.2026, 18:22Z). The retry classifier calls a check that fails in BOTH
  runs a "CANDIDATE REAL FAILURE" and names the diff words it touches — here `polish`
  "settlement walker (goat): the planted foot holds its ground spot (point 300)", twice,
  with the note "[touches the diff: goat, foot, hold, point]" against a change that only
  attached a metadata field to that group. Re-run on a quiet machine 100 minutes later,
  same code: `polish` 164 pass, 0 fail, FIRST try. The failure was machine load, and the
  classifier had already said so in its own log — the point-296 quiet-machine check ran
  at the top of that same run and reported "MACHINE STATE UNKNOWN: GPU load NOT measured
  (no GPU busy counter on this host)". The two verdicts never meet.
  WHY THE HEURISTIC IS WRONG HERE, precisely: it reads a repeated failure as evidence of
  a real defect because a FLAKE is assumed to rotate. Load does not rotate — a check that
  measures a RATE (frames, stance intervals, settling) fails deterministically for as long
  as the machine is busy, so the very checks most likely to be load-victims are the ones
  the heuristic is most confident about. The diff-word match compounds it: matching on
  "goat, foot, hold, point" against a spec that contains those words is a coincidence
  detector, not evidence.
  FINAL STATE:
  1. The classifier's verdict CARRIES the machine reading it was made under. Where the
     quiet-machine check reported UNKNOWN or LOADED, a twice-failing check is reported as
     UNDECIDED — "failed twice, but the machine could not be shown to be quiet; re-run on
     a quiet machine before believing this" — never as a candidate real failure.
  2. The rate-sensitive checks are MARKED as such where they are defined (the same set
     point 506 already names for the software lane), and the classifier says so when one
     of them is the twice-failing check.
  3. The diff-word match is reported as what it is: a word overlap, not a causal link. It
     may not appear at all in an UNDECIDED verdict, where it reads as corroboration.
  VERIFIABLE: pure Vitest over the classifier — the same twice-failed input yields
  CANDIDATE REAL FAILURE under a measured-quiet machine and UNDECIDED under an unknown or
  loaded one; a rate-marked check is named as rate-sensitive in the verdict; and the
  diff-word list is absent from an UNDECIDED verdict.

- [ ] 568. The polish water-sameness check rotates its verdict (measured 09.08.2026 by
  the agent delivering point 557, on WebGL 2, with the world seed pinned to 42 at the
  launcher; bundle Testinfrastruktur). Step 13.8 of `polish` — "the water beyond the
  plate's rim is the SAME water as the water at the bank (≤ 12/255)" — went RED on the
  first run with samples 13.8, 12.1 and 19.3 straddling the limit, and fully GREEN on a
  second run at the IDENTICAL commit and the IDENTICAL seed (164 PASS, 0 FAIL). The seed
  work is not the cause: `polish` was seeded 42 before and after, so the world it walked
  was the same both times. What rotates therefore sits BELOW the layout — the water
  shading itself, or the moment the sample is taken.
  WHY IT MATTERS BEYOND THE FLAKE: point 549 pinned the seed precisely so a red could be
  believed. A check that still rotates on a fixed world is the next layer of the same
  problem, and it sits on the everyday gate where it costs a rerun every time.
  FINAL STATE: the cause is IDENTIFIED before anything is tuned — the two candidates are
  a genuine frame-timing dependence (the sample taken before the water material has
  settled, in which case the check polls on the app's own clock rather than a fixed
  wait) and a real shading seam at the plate rim that only sometimes exceeds the
  tolerance (in which case it is a PRODUCT defect and the check is right to fire). The
  tolerance is NOT widened to make the red go away until it is established which of the
  two it is; if it is the product, the water fix comes first and the check stays.
  VERIFIABLE: the check runs ten times on the pinned seed with the same verdict every
  time, and whichever cause was found is named in the commit message with its evidence.
  Criticality: medium — it does not itself hide a product defect, but it may BE one, and
  it erodes the trust in a red that point 549 was built to restore.

- [ ] 570. The children-photographable check reds on the pinned world (measured
  09.08.2026 on `main` at 3e33ff83, WebGL 2, immediately after point 557 pinned the world
  seed at the launcher; bundle Testinfrastruktur). `polish`'s check "the game is
  photographable: both children read whole, apart and at least 67 px tall, unoccluded,
  WITH the village behind them (point 524)" went RED. Point 524 is CLOSED, so this red
  belongs to nobody: it is either a regression against a criterion the project already
  accepted, or a check that was never stable and only looked stable because every run
  walked a different world.
  WHAT THE EVIDENCE SAYS SO FAR: the point-557 agent ran `polish` twice on the same
  change and this check passed BOTH times; the first run on `main` failed it. So it is
  not simply "the pinned world puts the children out of view" — that would fail every
  time. Two candidates remain: a genuine intermittency in where the children are placed
  or when the frame is taken, and a load sensitivity (the failing run shared the machine
  with a finishing agent).
  FINAL STATE: the cause is ESTABLISHED before anything is tuned — run the check ten
  times on the pinned seed on a QUIET machine and record how many pass. If it fails
  consistently, the children's placement regressed against point 524 and the PRODUCT is
  fixed; if it rotates, it joins the staging-settle family of point 200 and is fixed the
  same way (poll on the app's own clock, never a fixed wait). The threshold (67 px,
  unoccluded, village behind) is NOT relaxed to make the red go away — it is the wording
  point 524 was accepted against.
  MEASURED FURTHER THE SAME MORNING, and it shifts the odds: across four `polish` runs on
  09.08.2026 the suite failed with THREE DIFFERENT pairs of checks and passed twice — the
  children pair, then the water check alone, then two `giza (wet)` checks, then two clean
  runs (WebGL 2 exit 0, WebGPU exit 0 on the retry). So the children check is most likely
  another member of the rotating staging family of point 200 rather than a regression
  against point 524. It is NOT ruled out — the ten-run measurement below still decides —
  but expect the staging fix, not a product fix.
  VERIFIABLE: ten consecutive runs on the pinned seed with the same verdict, and the
  cause named in the commit message with its evidence.
  Criticality: medium — it may be a real regression against a closed criterion, and until
  it is owned it blocks every render-set change from ever recording a covering run.

- [ ] 265. Elderly (geriatric) animal variants — an OLD version of each suitable
  species, visibly aged AND behaviourally distinct, plus natural death of old age
  (user 23.07.2026). PRIORITY/POSITION: queued BEFORE point 203 (do this content
  feature before the 203 visual bug-finder). RESEARCH FIRST (a standalone Fable pass,
  no code, safe to run in parallel): realistic geriatric APPEARANCE and BEHAVIOUR for
  the game's fauna (the savanna grazers, elephants, the predators) and a realistic
  natural-DEATH process — recorded, cited, in a new `docs/fauna-behaviour-1890.md`
  (matching the citation/marker discipline of `docs/peoples-1890.md`; if a fauna doc
  already exists, extend it). What to establish: the visible senescence cues (thinner/
  sway-backed body, duller/greyer or worn coat, prominent shoulder/hip bones, worn or
  broken tusks and sunken temples on old elephants, a stiffer/limping gait); the
  behavioural shifts (moves slower; old males ousted from the herd and turning
  SOLITARY — the classic old buffalo/elephant bull; withdrawal from intraspecies
  contests: an elder no longer INITIATES a §264 fight and always LOSES to a younger
  adult, fleeing an impending conspecific conflict); and the real basis for a
  "dying" pattern (an old elephant's last molars wear out, so it seeks soft forage
  near water/marsh and dies there — the grounded kernel the §4.4 "elephant graveyard"
  folklore romanticizes; vultures do gather around a visibly dying/weak animal). Add
  any further fitting, game-appropriate geriatric traits the research turns up. BUILD
  (per the research): (a) APPEARANCE — an elderly-adult build schema analogous to the
  point-169 baby schema (`buildLionCub`/the grazer calves) in `src/render/fauna.ts`
  (`buildElderly*`/an age flag on the adult build): clearly-old cues per the research,
  pure-tested for its proportions/part markers like the calf schema. (b) BEHAVIOUR —
  pure helpers in `src/scenes/travel/wildlifeBehavior.ts`: an elderly adult moves at a
  calibratable reduced speed factor, never initiates §264 intraspecies combat and
  ALWAYS loses to a younger adult (the §264/§125 outcome matrix returns the elder as
  loser; the elder flees an impending conspecific conflict), and — for GRAZERS and
  the big cats (NOT elephants) — an ousted old male withdraws from the herd/pride and
  turns solitary (per `docs/fauna-behaviour-1890.md`: old elephant BULLS keep high
  status, so no ostracism for them; the crocodile gets NO elderly variant — no legible
  aged cues). (c) NATURAL DEATH — an elderly animal occasionally dies with NO external
  cause, at a calibratable low rate; the DYING PROCESS is depicted (`Wildlife.tsx` + a
  pure state helper): the animal slows progressively, the §19.6/§22 poor-condition
  vultures GATHER over it and descend as it collapses (the ground-truth reuse of the
  pt-22 omen — the "patient circling of a doomed animal" is embellished, so key the
  flock on the distressed/downed animal, not a long pre-death circle), it falls dead,
  and the vultures consume it through the existing carcass system. An ELEPHANT that
  begins dying instead drifts toward WATER (its worn last molars can no longer grind
  coarse forage, so it seeks soft riverside/aquatic vegetation) and dies THERE — the
  REAL mechanic per the research; the §4.4 elephant graveyard is framed as WHERE these
  water-side deaths accumulate (folklore landmark + accurate mechanic coexisting), and
  the mass death-pilgrimage is MYTH and is NOT built. (d) CALIBRATION — the elderly fraction of adults, the elderly speed
  factor, the natural-death rate, and the dying-slowdown duration are `balance.ts`
  values, debug-editable (§21). Ties to point 264 (the elder always loses a fight),
  point 169 (the analogous age schema), §4.4 (the graveyard death) and §19.6 (the
  vultures). VERIFIABLE: pure tests (`src/render/fauna.test.ts` — the elderly schema's
  aged proportions/markers, built alongside the calves; `src/scenes/travel/
  wildlifeBehavior.test.ts` — elderly speed factor strictly below the adult, elder
  never initiates and always loses §264 combat, the natural-death roll boundaries, the
  dying-slowdown curve, and the elephant-dying-target picking the graveyard); a live
  check in `scripts/verify/enrichments.mjs` (a forced elderly natural death: slows →
  vultures circle → falls → consumed; a dying elephant heads to the graveyard) with a
  screenshot, picture-verified on BOTH backends. DOCS: `docs/fauna-behaviour-1890.md`
  (research, in the SAME branch/commit as the build it informs), design.md §19 (a new
  subsection: elderly variants, their behaviour, natural death and the elephant
  graveyard death), the balance values. Any new sighting/death journal text in BOTH
  languages with voice markup. NOTE: heavy `wildlifeBehavior.ts`/`Wildlife.tsx`/
  `fauna.ts`/`balance` overlap — do NOT delegate the BUILD concurrently with another
  wildlife point; the RESEARCH half and the pure schema/behaviour helpers (in new
  files) can start in parallel, the scene wiring waits for the wildlife cluster to be
  free. Implementation-ready.

- [ ] 269. Birds flee by flying + region-appropriate aerial predators (research-gated)
  (user 23.07.2026). Two linked additions, BOTH gated on a Fable research pass first.
  (A) FLIGHT-CAPABLE BIRDS ESCAPE BY FLYING: every bird species that can fly gets a
  GROUND (perched/sitting/feeding) state and an IN-AIR (flying) state; when it flees a
  ground predator (or an approaching elephant) it TAKES OFF and flies, which puts it
  OUT OF REACH of ground predators and elephants (they can no longer catch it in the
  air). A ground predator can catch a bird ONLY if it SURPRISES it while the bird is
  still ON THE GROUND (took off too late) — an airborne bird is safe from ground
  hunters. So the existing bird fauna (the shore/scavenger birds, the plover, vultures,
  etc.) needs the ground↔air state and a takeoff-on-flee transition.
  (B) AERIAL PREDATORS (research settled — docs/fauna-behaviour-1890.md §B): add
  region-appropriate FLYING predators (raptors) that hunt prey birds and catch them IN
  THE AIR, per the researched per-region table (§B2.1): falcons (peregrine/lanner/
  barbary) and the two hawk-eagles (African, Ayres's) attack by a STOOP/DESCEND, while
  the accipiter/harrier/fish-eagle majority use an air-catch tail-chase or an ambush
  from cover (no height). The stoop is BUILT — but as a SCRIPTED "descend-and-strike"
  EVENT (the raptor enters high, plunges onto a flying bird, strikes, resolves), NOT a
  persistent 3D flight-height simulation (the research explicitly warns against a full
  altitude-band layer, since most raptors don't use height). So there is at most a
  simple two-state high/low for the stoop event itself, not a per-bird altitude field.
  RESEARCH FIRST (Fable pass, docs-only, extend `docs/fauna-behaviour-1890.md`): which
  African raptors/aerial hunters (~1890, by region) take BIRDS as prey; their hunting
  mode (stoop/dive vs. tail-chase), typical prey birds, whether flight-height layering
  and a surprise-from-above are realistic, and whether "a ground predator only gets a
  bird caught on the ground" matches real behaviour. Produce a cited per-region aerial-
  predator + prey-bird table with the same PERIOD/INFERRED/MYTH markers, and a short
  "Implementation brief" (§B4 — already delivered; the research half is DONE). BUILD
  (after the wildlife cluster is free): the bird ground/air state machine +
  takeoff-on-flee (pure flee helpers in `src/scenes/travel/wildlifeBehavior.ts`, wired
  in `src/scenes/travel/Wildlife.tsx`) — with the researched fly/no-fly split (small
  birds and flamingos fly to escape, the flamingo with a laborious running take-off as
  a vulnerable window; plover CHICKS crouch/freeze and can be caught, the adult flies
  and does the broken-wing distraction); the aerial-predator species (build in
  `src/render/fauna.ts`, seeded from a new region-keyed aerial-predator pool per §B2.1)
  with an air-catch tail-chase for the ambush guild and the SCRIPTED descend-and-strike
  for the falcon/hawk-eagle guild; ground predators lose the airborne target. Reuse the
  existing hunt/flee/carcass machinery; every started drama resolves (I4). All
  calibratable (takeoff trigger distance, the stoop's high/low band, dive chance/speed,
  aerial-hunt rate) and debug-editable. VERIFIABLE: pure tests — a fleeing bird
  transitions to air and a ground predator's reach excludes an airborne bird while a
  still-grounded (surprised) one is catchable; the aerial predator's air-catch and (if
  built) the height-gated dive; region pools sane. Live check / screenshot: a forced
  ground-predator approach makes birds take off and escape, and (if built) an aerial
  predator stoops on a flying bird — on BOTH backends. DOCS: `docs/fauna-behaviour-1890.md`
  (research); design.md §19 (bird flight escape + aerial predators). Any new
  sighting/journal text both languages with voice markup. NOTE: wildlife-render/behaviour
  cluster (Wildlife.tsx/wildlifeBehavior.ts/fauna.ts) — the RESEARCH runs in parallel
  now; the BUILD waits for the cluster to be free and does NOT run concurrently with
  another Wildlife.tsx point. Implementation-ready once the research lands.

- [ ] 310. Low-preset performance pass for two opposite devices (user 25.07.2026,
  recalibrated 06.08.2026). LOW must run WELL on a weak Windows desktop AND on the
  Galaxy S25 — one preset, two opposite bottlenecks, which is the whole difficulty
  of this point.
  INPUTS — REAL F8 REPORTS. `local/hoa-bench-2026-08-03-webgpu-kohler.json` (WEAK
  Windows desktop, AMD RDNA-3, WebGPU with real GPU timestamps, production build
  2b6b417, 2195x1235 at dpr 1.75, deposited by the user 06.08.2026) is what this
  point is CALIBRATED against, being the slowest machine measured. It is NOT the
  user's own PC — that one runs MEDIUM acceptably, and its occasional stutter is
  explicitly not part of this point. `local/samsung-s25-bench.json` (Galaxy S25,
  Adreno 8xx) is the second target. `local/m1pro-bench.json` is CONTEXT ONLY: it
  predates the LOW preset and its absolute GPU milliseconds aggregate passes — judge
  that machine on its FRAME series and on ratios between its own configs.
  NO SECOND RUN IS AVAILABLE (user 06.08.2026): the weak PC is a third party's and
  cannot be re-measured, so plan no step that needs a fresh run on a user machine.
  Everything needed is in the deposited report — real GPU timestamps, eleven
  ablation configs, per-system triangle and mesh counts per phase.
  WHAT THE TWO DEVICES SAY.
  - DESKTOP: the default (medium) preset is unplayable — 17.9 / 12.7 / 13.1 fps at a
    GPU median of 45.22 / 68.35 / 65.93 ms. LOW holds 60 fps with almost no headroom
    in the desert: GPU median 14.81 ms of the 16.70 ms budget (89 %), 95th-percentile
    frame 33.7 ms — every twentieth frame is dropped. Savanna 8.65 ms, driving
    9.63 ms (p95 frame 33.1 ms); CPU 5.20 / 7.70 / 6.80 ms.
  - S25: LOW GPU 9.83 / 8.72 / 6.95 ms against a CPU of 8.70 / 7.50 / 7.60 ms. The
    CPU sits AS HIGH AS the GPU, so a pixel cut alone buys the phone little — this is
    where the behaviour-throttling and instance-count levers pay.
  THE DECISIVE READING — THE LOW FRAME IS PIXEL-BOUND, NOT TRIANGLE-BOUND. At LOW the
  desert draws 542,748 triangles in 55 calls for 14.81 ms while the savanna draws
  1,008,904 triangles in 58 calls for 8.65 ms: nearly double the geometry at 58 % of
  the cost. The ablations agree — from dpr 1.75 to dpr 1 the pixel count falls 3.06x
  and the GPU time 2.77x / 2.91x / 3.10x, almost exactly in step. This governs the
  ORDER of the delivery: the dpr cap is the primary lever, and the triangle levers
  below must never be reported as the fix for the desert phase, whose share figures
  are shares of TRIANGLES, never of milliseconds. The constant 425,118-triangle /
  180-mesh system is 78 % of the desert frame at LOW on this second device and
  backend too, and travel-dressing is 53 % of the savanna frame (531,058 tris),
  matching the S25.
  SALVAGED IDEA (25.07, from the retired `feat/276-wildlife-lod` branch — see point
  329): throttling the BEHAVIOUR updates of off-screen animals cuts the driving
  frame cost. The branch itself was retired unmerged (219 commits behind main, its
  three files moved on 16/9/1 commits since), but the lever is sound and belongs
  here: update animals outside the rendered frame at a reduced rate (projected via
  the shared `isOnScreen`, never an assumed radius — the point-172 rule), keeping
  every §19 drama deadline in sim time so no drama stalls. Judge it on the CPU
  series, where both devices sit at 5-9 ms at LOW.
  DIAGNOSIS DONE (25.07, main session): the unnamed 425k system IS the river/lake
  water geometry — `src/scenes/travel/Rivers.tsx` mounts the ribbon mesh and every
  lake sheet with NO `name` prop (around the `<mesh geometry={geometry}
  material={riverMat}>` / lake map), so `groupKey` in src/systems/benchmark.ts falls
  back to the material name `MeshStandardNodeMaterial`; the courses are global and
  biome-independent, which explains the constant count in every phase. Deliver:
  (a) NAME those groups (and any other unnamed one) so the F8 report attributes
  every system, (b) a LOW flora/dressing DENSITY lever (calibratable
  instance-count factor on top of the existing floraFogFactor radius cut — the §19.9
  dressing keeps reading as savanna, only thinner), (c) a LOW geometry lever for the
  identified 425k-tris system (e.g. coarser river-ribbon tessellation on LOW if it is
  the water — every §11.3 continuity/never-buried invariant must keep passing), (d) a
  calibratable `dprCap` BELOW 1 on LOW itself (starting value 0.8 = 0.64x the pixels,
  which projects the desert's 14.81 ms near 9.5 ms) — the primary lever, not a
  last resort, and the touch preset stays a SUBSET of low. EVERY new lever gets
  entries in ALL THREE QUALITY_PRESETS levels (the src/config/quality.test.ts
  completeness gate and the docs/graphics-detail-levels.md sync test enforce this),
  stays debug-tunable within its level, and reads through the point-276
  effective-selector pattern. The delivery must move BOTH the pixel cost and the
  CPU/instance cost: a LOW that only cuts dpr fixes the desktop and leaves the phone
  where it is. VERIFIABLE: pure tests for each new preset key; the §11.3/§19 suites
  stay green at LOW (ribbon continuity, dressing-streaming no-pop projection checks);
  picture checked on BOTH backends at LOW; and the price check in this order —
  FIRST hardware-independent arithmetic against the deposited numbers (the rendered
  pixel count and the per-system triangles the new levers remove, with the desert's
  14.81 ms projected to 10 ms or below by the measured pixel-to-time
  proportionality), THEN a before/after F8 run of the SAME three phases at LOW on the
  project's own verification host, whose absolute milliseconds mean nothing but whose
  RELATIVE drop must confirm the projection rather than contradict it — without a
  visual regression the user rejects.

- [ ] 315. The sphinx is rebuilt from scratch, far more elaborate (user 28.07.2026,
  superseding every earlier display report about it — the flicker, the shape and the
  half-buried read are all answered by the new model, not by patching the old one). The
  user's verdict on the deployed build: "die Darstellung der Sphinx gefällt mir allgemein
  nicht … man kann sie kaum als Sphinx erkennen", and the screenshot shows why — a stack
  of plain boxes with a slab on top, reading as a gate or a table, at a monument every
  player recognises on sight. The FIRST-PERSON view is what matters most; the bird's-eye
  landmark and the §2.5 skyline silhouette are named as "auch nicht schön" and are part of
  the same job.
  THE TARGET: a Great Sphinx that is recognisable at a glance from any standpoint a player
  can reach, and worth walking up to — a couchant lion body with the forepaws stretched
  forward, a human head in the nemes headdress with its brow band and the folded lappets
  falling to the chest, the broken nose and the missing beard of the real monument, the
  chest between the paws, and the weathered horizontal banding of the limestone courses.
  It is the one built landmark in the game with a FACE; it must not be the crudest.
  ACCURACY AND RECOGNISABILITY, and how to hold both: `docs/giza-1890.md` records the
  ~1890 state — the body buried to the shoulders, only head, neck and upper back standing
  clear, which is exactly what makes the current model unreadable. Do NOT dig it out; the
  period state is researched and stands. Buy the recognisability from DETAIL and from the
  drift's own shape instead: the emergent head carries the nemes, the face and the neck at
  a resolution that reads from across the site, and the sand mound is modelled as a body
  UNDER sand — a long couchant swell with the shoulders' shape showing through and the
  back ridge breaking the surface — rather than a heap beside a box. A player who has
  never seen the site must be able to say "that is the Sphinx"; a player who knows it must
  find the 1890 burial line where the photographs put it. If, once built, those two
  genuinely cannot be reconciled, say so with the pictures rather than quietly abandoning
  either — the choice is then the user's.
  ALL THREE SCALES, one model, three levels of detail: (a) FIRST-PERSON at the site, the
  full model; (b) the BIRD'S-EYE landmark, seen from above and far — the silhouette from
  that angle is what carries it, so the paws, the body swell and the head must be
  distinguishable at the travel scale rather than a lump; (c) the §2.5 SKYLINE silhouette
  from Cairo (point 82), where only the outline exists and it must still read as a
  crouching figure with a raised head. Derive them from ONE definition so the three cannot
  drift apart, the way the Giza plateau's two records did (point 338).
  COST IS PART OF THE JOB: the site model may be elaborate, but it is drawn every frame at
  a place the player stands in. Sort it into the quality levels like every other optical
  feature (§21, `QUALITY_PRESETS` in `src/config/quality.ts`) — a fuller mesh on high, a
  reduced one on low — and report the measured frame cost at the site on BOTH backends at
  LOW and at MEDIUM. A level that cannot afford the full mesh gets the reduced one, named
  and tested, never a silent downgrade.
  WHAT THIS REPLACES: the old spec asked for a mound envelope and blamed a coplanar sheet
  for a flicker at the body's base. Both die with the old geometry — but the flicker is
  still the sharpest acceptance signal available, so the live check MOVES the camera
  rather than taking one still, and no z-offset may be used to hide a fight that the new
  model should not have.
  VERIFIABLE: pure Vitest on the shared definition — the three levels of detail come from
  one source, the burial line matches the documented ~1890 state, head and upper back
  stand clear of the drift while every other body part sits below it, the drift's
  footprint does not exceed the body's by more than its skirt, and the collidable mass
  still matches the drawn body (point 378's rule). Live on BOTH backends: a screenshot SET
  from several standpoints inside the site — face on, in profile, from behind, and one low
  enough to look along the drift — plus the bird's-eye landmark and the Cairo skyline
  frame, judged by the picture; and a moving-camera pass that shows no flicker anywhere on
  the model.
  DOCS in the same commit: `docs/acceptance-evidence.md` §15/§25 gain the chain, and
  `docs/graphics-detail-levels.md` the new per-level entries.

- [ ] 391. The Giza monuments stand at a monumental scale in the first-person view (user
  28.07.2026). Standing on the plateau, the pyramids and the Sphinx must read as GIANTS —
  markedly larger than today, so that a person at their foot is a speck against them. The
  stated reason is a planned later feature and belongs in the record: the user intends a
  secret entrance, found by deciphering hints from inhabitants, that leads into a further
  first-person scene INSIDE the monument, where more clues to the treasure wait. Entering
  is only plausible if the outside is big enough to hold an inside. THAT FEATURE IS NOT
  BUILT HERE — this point delivers the scale it needs, nothing more; no entrance, no
  interior scene, no hint chain.
  WHAT TO CHANGE: the site-scale geometry in `src/scenes/place/gizaSite.ts` (the pyramid
  cones and the Sphinx). Take the REAL proportions as the yardstick — the Great Pyramid
  stood ~146 m tall on a ~230 m base, the Sphinx ~20 m tall and ~73 m long — and state in
  the commit what fraction of real scale the site now uses and why. The eye height is
  1.5 m (§20), so the numbers decide the feeling: from the base, the apex must be far
  above the top of the frame at the default field of view.
  WHAT IT COLLIDES WITH, and none of it may be broken quietly:
  · the WALKABLE RADIUS (point 390) — bigger monuments need more ground to be seen from,
    and both points touch the same site. Work them on ONE branch, 390 first: the radius is
    measured against what the picture offers, and the picture changes here.
  · the SPHINX MODEL (point 315) — same file, same monument. Whichever lands second
    rebases on the first; do not build the new Sphinx twice at two sizes.
  · the COLLIDERS must follow the drawn masses, not the old ones (point 378's rule: the
    collider is derived from the placement the renderer draws). This is a REPORTED bug the
    user ruled belongs here rather than in a point of its own (dump
    `hoa-state-2026-07-29-4196407680`, Giza, WebGPU, medium: the traveller walks into the
    pyramid). Root cause, already measured — do not re-analyse: `gizaColliders`
    (`src/scenes/place/gizaSite.ts`) uses only the cone footprint
    (`pyramidFootprint` = base/√2), while the DRAWN masses reach further —
    Khafre's bedrock plinth to 1.14·base and Menkaure's granite skirt to 1.02·base
    (`gizaSitePyramidParts` in `src/render/landmarks.ts`).
  · the PLACE MAP inside Giza is EMPTY (second dump, same seed, `mapOpen: true`,
    `mode: place (giza)`), and it is fixed here. Measured cause: `MapOverlay`'s `PlacePlan`
    (`src/ui/MapOverlay.tsx`) draws the layout's buildings, dwellings and lanes, but
    `buildGizaLayout` leaves `interactives`/`dwellings`/`paths`/`rocks` empty — the
    monuments exist ONLY as colliders, which the plan does not read. Fix it GENERICALLY
    over `layout.colliders`, so a future monument-like place inherits a drawn plan instead
    of the same blank sheet, with a Vitest case that the Giza plan is non-empty.
  · the BACKDROP and panorama (points 181/381) — a taller monument may now rise past the
    ground line the silhouettes stand on; the seam checks in
    `src/scenes/place/backdrop.test.ts` must still hold.
  · the BIRD'S-EYE landmark and the Cairo SKYLINE (point 82) are a DIFFERENT scale and are
    NOT enlarged by this point — check that they are unchanged, and say so.
  VERIFIABLE: pure Vitest on the site geometry — the pyramid height and base, and the
  Sphinx length, sit at the stated fraction of the real proportions, and the collider set
  matches the drawn masses. Live on BOTH backends: a first-person frame from the base of
  the great pyramid looking up (the apex out of frame is the point), one from the site
  centre showing all three, and one at the Sphinx — judged by the picture, plus the
  measured frame cost at LOW and MEDIUM.
  DOCS in the same commit: design.md §4.4 states the monumental first-person scale and
  names the planned interior as an OPEN idea, not a promise. design.md sits at its
  measured ceiling, so the sentence is paid for by a measured raise with its justification
  in `scripts/doc-budget-core.mjs`, or by shortening elsewhere — the guard decides, not a
  round number.

- [ ] 320. Springs as real 3D bubbling water (user 25.07.2026: the springs still
  read as a mere symbol — animated now, but flat; they should LOOK like a spring
  with water bubbling three-dimensionally). Rework the §11.3 spring depiction at
  travel scale into a small 3D water feature. ANCHOR (25.07, main session): the
  current spring is built in `src/scenes/travel/Rivers.tsx` as a stack of FLAT discs
  — circle meshes rotated `-Math.PI / 2` (the pool, a damp-ground ring and the
  animated ripple), which is exactly why it reads as a symbol however it animates.
  Replace that stack with: a low dome/upwelling mesh whose
  surface visibly bubbles (TSL displacement/normal animation — renderer-agnostic,
  both backends), a bright welling centre with concentric ripple rings, a small
  wet pool/outflow meeting the terrain (no floating disc, no billboard), sized to
  read at the default zoom 0.5 without dominating. Calibratable size/intensity
  under balance (debug-editable); quality-level entries for ALL THREE
  QUALITY_PRESETS (the completeness gate enforces this) — LOW may use a cheaper
  variant but the feature stays visible. VERIFIABLE: the existing "at least one
  spring" check extended: the spring mesh is 3D (non-flat bounding box), its
  surface animates over sim time (vertex/pixel delta between two sampled frames at
  the spring, both backends), and it sits ON the terrain (no gap/clip at the rim —
  ray/heights check); screenshot pair added to the §7.2 evidence set; the picture
  judged on BOTH backends per the render rule.

- [ ] 322. Staged-event failures are easy to miss (user 25.07.2026: staging "calf
  mired at waterfall" appeared to do nothing; the user later suspected an unseen
  error message). Make every debug stage/trigger outcome UNMISSABLE: a persistent,
  clearly styled result banner — success names what was staged and where, failure
  names the missing precondition in plain language ("no waterfall within reach —
  jump to a waterfall first") — staying until dismissed or superseded, both
  languages. Also RE-CHECK the mired-at-waterfall staging itself against a
  realistic debug session: if its precondition search radius is too small, widen it
  or teleport-stage like the other dramas. VERIFIABLE: pure test of the
  outcome→message mapping (every stageable event has success AND failure text in
  both languages, no silent path); settings.mjs live-checks the banner on an unmet
  precondition and a successful stage; both languages.

- [ ] 327. Two nearby carcasses must share one vulture flock (user 25.07.2026: a
  second flock spawns and the two overlap). Give the §19.6 flock a claim over a
  carcass CLUSTER: a new carcass within a calibratable radius of a flock's current
  target joins that flock's queue instead of drawing a second flock, and the flock
  works them in turn, leaving only when the cluster is done. No two flocks may be
  active within the cluster radius. VERIFIABLE: pure test of the cluster claim (a
  carcass inside joins, one outside draws its own flock; boundary exact); live
  check with two staged carcasses close together — exactly one flock, both eaten,
  no overlap; both backends.

- [ ] 328. Vultures do not visibly land (user 25.07.2026: "they seem to fly one
  moment and stand the next — is there a landing at all?"). Add a real landing
  approach to the §19.6 flock AND the lone ground scavenger: a descending glide
  along the approach heading with slowing forward speed, a flare with raised wings
  just before touchdown, then the standing pose — over a calibratable window long
  enough to read at bird's-eye distance; likewise a visible take-off (run/flap into
  the climb) instead of an instant switch to flight. VERIFIABLE: pure test of the
  landing profile (height decreases monotonically to the landed height across the
  window, forward speed decreases, the flare pose fires in the last phase); live
  check that a landing bird's sampled height passes through intermediate values (no
  single-frame snap) while the point-128 "stands on its own ground" clearance still
  holds; screenshot of the flare; both backends.

- [ ] 343. The sun stands where it really stood — elevation from date and latitude
  (user 25.07.2026; design.md §2.7 states the target). Today `SUN_DIR` is a hard
  constant in BOTH scenes — `[0.5, 0.62, 0.38]` in `src/scenes/travel/TravelScene.tsx`
  and `[0.52, 0.68, 0.34]` in `src/scenes/place/PlaceScene.tsx`, an elevation of ~45°
  for the whole continent and the whole five-year window. The season only dims and
  reddens it. That is why the relief reads flat: at that angle a 3000 m massif throws
  ~3 km of shadow, about ONE DEM texel.
  TARGET: derive the sun's elevation and azimuth from the real solar geometry —
  declination from the DATE (the same date that drives §19.13) and the traveller's own
  LATITUDE — at a FIXED local solar hour. There is no time of day in this game and
  none is being added; the hour is a calibratable constant, `balance.sun.hour`,
  DEFAULT 16:00. That default is load-bearing and must not be "tidied" to noon: at
  local noon the sun stands 90° over the equator in March and 83° over Cairo in June,
  which casts no usable shadow at all, while at 16:00 the elevation runs about 7°-37°
  across the entire map and year (Cairo 37° June / 11° December, Cape Town 9° in its
  June winter). One hour later breaks it — at 17:00 the Cape sun in June is BELOW the
  horizon, and a fixed hour must never put the sun under the horizon anywhere in the
  world window (lat -37..38, all 365 days).
  ONE DEFINITION, READ BY BOTH SCENES. The two constants above are not merely stale,
  they DISAGREE (~45° against ~48°) — the same sun stands at two heights depending on
  which view holds the camera. The derivation therefore lands in ONE place that travel
  and settlement both read; neither scene keeps a sun of its own, or they drift apart
  again the first time one of them is touched.
  EVERYTHING THE SUN FEEDS MUST FOLLOW IT, or the picture contradicts itself: the
  directional light AND its shadow camera in both scenes, the sky dome's disc and halo
  (`src/render/sky.tsx`, whose `sunDirection` must keep agreeing with the light — its
  own comment says so), and the baked environment light
  (`createEnvironmentTexture`/`IBL_SUN` in `src/render/Effects.tsx`), re-derived when
  the date or the position changes and NEVER per frame.
  THE SETTLEMENT IS THE STRICTER OF THE TWO (user 28.07.2026). Point 344's eye
  adaptation and sun glare build DIRECTLY on this angle, and at eye height a wrong sun
  is not a subtlety — it decides whether the traveller is dazzled turning west, and
  where every wall's shadow falls in a lane he walks through. The settlement sun is
  therefore derived from the SETTLEMENT's own latitude and the current date, never from
  a scene default, and the acceptance below judges it at eye height.
  AND THE JOURNEY MUST SHOW IT (user 28.07.2026). The bird's-eye view is where the
  change becomes legible: walking the continent from the Mediterranean to the Cape at
  one date, the shadows must visibly turn and lengthen as the latitude runs out — and
  the same place in June and in December must not look alike. A sun that is merely
  CORRECT per frame but whose change no traveller notices misses the point of this
  ticket; the live acceptance therefore measures a TRAVERSE, not only a single spot.
  THE SKY PRESETS ARE THE REAL WORK, not the arithmetic. They are authored for a high
  sun; a low sun under an unchanged noon-blue dome reads as a bug — the same failure
  the overcast handling already guards against (a dimmed sun under a bright blue sky,
  sky.tsx). The horizon must warm and redden as the sun drops. Judge this by the
  PICTURE on both backends, not by the uniform.
  WATCH THE SHADOW QUALITY at the low end: cascaded shadow maps degrade at grazing sun
  angles (long shadows, peter-panning, cascade seams). If the 7° end proves ugly, clamp
  the elevation used for the SHADOW camera to a calibratable floor while the visible
  sun keeps its true angle — and record that as a deliberate divergence, never silently.
  NOT A QUALITY LEVER: this is world model like the seasons and applies at EVERY
  graphics level. It adds no per-frame cost and gets no `QUALITY_PRESETS` key.
  DEBUG: the sun direction stays inspectable and the hour editable in the debug menu
  (§21.2), so a tester can walk the whole range without waiting for a date.
  VERIFIABLE: pure (`src/systems/`) — declination and hour angle produce the known
  elevations above (Cairo June/December, the equator at equinox, Cape Town June), the
  hemispheres invert across the year, and a SWEEP over the full world bounds × all 365
  days asserts the sun never falls to or below the horizon at the default hour (the
  17:00 counter-case is pinned as the witness that the bound is real); the azimuth is
  westerly in the afternoon for both hemispheres; and a NORTH-SOUTH SWEEP at one date
  returns a monotonically changing elevation, so the traverse below has something to
  show. Live (`scripts/verify/enrichments.mjs` + `polish.mjs`, BOTH backends,
  screenshots): the same place rendered in June and in December differs measurably in
  pixels and in shadow direction; a TRAVERSE of at least three widely separated
  latitudes at one date yields shadows whose measured direction and length differ
  between the stops — the check the user's "you should notice it while walking" asks
  for; inside a settlement, at EYE HEIGHT, the shadows agree with the sky-dome sun disc
  rather than pointing elsewhere; no console errors.
  DOCS: design.md §2.7 already states it; CLAUDE.md §7.1 point 14 gains the built
  behaviour when this lands.

- [ ] 344. Eye adaptation and sun glare, highest quality level (user 25.07.2026;
  design.md §2.7 states the target). BUILDS ON POINT 343 — before the sun is low there
  is nothing to be dazzled by, and with a 50° vertical field of view the first-person
  camera sees roughly -25°..+25°, so the 16:00 sun (6.7°..37°) sits IN FRAME whenever
  the traveller turns west over most of the map and year. Both halves belong in ONE
  point: they share the same tuning pass over the same image, and building them apart
  would mean turning the same dial twice.
  (a) EYE ADAPTATION — the effect the player reads as high dynamic range. The exposure
  follows the frame's mean luminance (from the HDR buffer's mip chain, not a CPU
  readback): facing the sun darkens the scene, turning into a lane's shade opens it up
  again. The range is BOUNDED and calibratable around today's fixed
  `toneMappingExposure` of 1.05 (`src/App.tsx`) — `balance.exposure.*`,
  debug-editable — and the two directions have their own time constants (brightening
  fast, darkening slow, as an eye does). A bounded controller, never free-running.
  FIRST PERSON ONLY. The bird's-eye view keeps its fixed exposure: design.md §2.7
  forbids post-processing that costs the map view its readability, and a map whose
  brightness breathes while driving is precisely that. This is a rule, not a
  performance choice — do not "unify" the two scenes.
  (b) GLARE. The sun disc in `src/render/sky.tsx` (`disc = pow(s, 1200) * 3.0`) must
  sit clearly above the bloom threshold so it blooms on its own, plus the upstream
  `three/addons/tsl/display/LensflareNode.js` WITH an occlusion test: a hut wall or
  roof edge moving in front of the sun kills the glare in the same frame. Without that
  test the flare survives its occluder and reads as a sticker on the lens — the single
  detail that separates a convincing glare from a cheap one.
  QUALITY: highest level only, with entries for all three levels in `QUALITY_PRESETS`
  (`src/config/quality.ts`) and `docs/graphics-detail-levels.md` updated in the same
  commit — the completeness gate and the doc-sync test both fail otherwise.
  ESTIMATED COST ~0.3-0.8 ms; the real number comes from F8 on the user's hardware.
  VERIFIABLE: pure — the exposure controller maps luminance to a target within its
  clamp, converges from both directions, honours its asymmetric time constants and
  cannot run away from a black or a blown-out frame; the preset completeness and doc
  sync cover the new keys. Live (BOTH backends, screenshots): in a settlement facing
  the sun the rendered frame's mean brightness FALLS within a bounded number of frames
  and recovers when the traveller turns away — measured in PIXELS, never in the
  uniform (the §7.2 lesson that three rounds of uniform-level checks once passed while
  the player saw nothing); the glare is present with the sun in the open and gone with
  a building between; and in the bird's-eye view a driven pass leaves the exposure
  UNCHANGED, which is the readability guard's own witness.
  DOCS: design.md §2.7 already states it; CLAUDE.md §7.1 point 14 gains the built
  behaviour when this lands.

- [ ] 345. Sun shafts through what stands in the way, highest quality level (user
  25.07.2026). With the low afternoon sun of point 343, a palm crown, a roof edge, the
  Djinguereber minaret or the Giza pyramids finally have something to cast shafts
  through. Wire the upstream `three/addons/tsl/display/GodraysNode.js`
  (`godrays(depthNode, camera, light)`) into the post chain in `src/render/Effects.tsx`
  beside the existing GTAO/bloom/TRAA nodes.
  FIRST PERSON ONLY, and for a reason worth writing down: screen-space godrays need
  the light IN the frame, and the bird's-eye camera looks ~60° down while the sun
  stands at most 37° up — it is never in that frame. Wiring the pass there would cost
  milliseconds for an effect nobody can see. Do not enable it in the travel scene.
  QUALITY: highest level only, entries for all three levels in `QUALITY_PRESETS` plus
  `docs/graphics-detail-levels.md` in the same commit.
  THIS ONE IS PRICED BEFORE IT IS KEPT. It is the only effect in this family with a
  real per-pixel cost (estimated +1.5-3 ms; on the measured S25 baseline of ~12.6 ms
  GPU that is +12-25 %). Run F8 on the user's hardware BEFORE and AFTER on the same
  build and record both digests in the commit. If the cost is not worth the picture,
  the point is closed by REMOVING the pass and recording the measurement — that is a
  legitimate outcome, exactly as the SSR removal was, and it must not drag point 344
  with it.
  VERIFIABLE: pure — the preset completeness gate and the doc-sync test cover the new
  key; the pass is absent from the travel scene's chain by construction. Live (BOTH
  backends, screenshots): in a settlement with the sun behind a roof edge, the pixels
  along the sun direction brighten measurably against the same frame with the level
  stepped down — judged on the image, not on the flag; no console errors; the F8
  before/after numbers are recorded.

- [ ] 346. Horizon maps baked from the DEM — self-shadowing and sky occlusion at
  PLANETARY RANGE (user 25.07.2026; design.md §2.7 states the target). A new offline
  step beside `scripts/build-geodata.mjs` measures, per DEM texel, the HORIZON ANGLE —
  how high the land rises around that point — and the terrain shader reads it. Two
  effects out of one bake: the land SHADES ITSELF far beyond any shadow map's reach,
  and every hollow sees less sky than the ridge above it and is lit accordingly.
  IT ONLY PAYS BECAUSE OF POINT 343, and depends on it: at the old fixed ~45° sun a
  3000 m massif threw ~3 km of shadow, about one DEM texel. At the 16:00 sun's low end
  (~9°) the same massif throws ~19 km — nearly seven texels, visible terrain shading
  across the view.
  THE ALGORITHM IS THE WHOLE FEASIBILITY QUESTION. Naive ray marching is 8.8 M texels ×
  directions × ~100 steps ≈ billions of samples and is not an option in Node. Use the
  standard horizon SWEEP (per direction, march the grid line by line keeping a monotone
  stack of candidate horizons), which is linear in texels — seconds, not hours. Pin the
  sweep against a brute-force reference on a SMALL patch in the tests: that comparison
  is what proves the fast path correct.
  ONLY SIX DIRECTIONS ARE NEEDED, and the reason is worth keeping: because the hour is
  FIXED (point 343), the sun's azimuth never leaves a 74° westerly arc — 233°..307°
  over the entire map and every day of the year. Bake that arc at ~15° steps (6 slices)
  plus ONE direction-averaged sky-occlusion channel; a full circle would be wasted
  storage. The fragment interpolates between the two slices bracketing the current
  azimuth.
  IF THE DEBUG HOUR LEAVES THE ARC (the `balance.sun.hour` field of point 343 is
  editable), the shading must CLAMP to the nearest baked slice and say so through the
  dev channel — never silently shade from the wrong direction. Pure-test that clamp.
  ASSET BUDGET, to be settled by the PICTURE and recorded: 7 channels (6 + occlusion)
  in two RGBA textures. At half DEM resolution (1460×1500, ~6 km per texel) that is
  ~17.5 MB raw, roughly 5-9 MB as PNG; at quarter resolution ~4.4 MB raw, ~1.3-2.2 MB.
  Start at half, and drop to quarter if the download budget bites — today's whole
  `dem.png` is 6 MB, so this may not dwarf it. Horizon angles are low-frequency and a
  soft, kilometre-scale shadow edge is physically right, so a coarse map is not a
  compromise in the way a coarse shadow map would be.
  SCOPE: the bird's-eye TERRAIN only. Settlements have their own local scene and ground
  and are untouched.
  QUALITY: on at MEDIUM and HIGH, off at LOW — and at low the extra textures are NOT
  FETCHED at all, since the runtime cost is one texture lookup but the download and
  video memory are what a weak device actually cannot afford. Entries for all three
  levels in `QUALITY_PRESETS` plus `docs/graphics-detail-levels.md` in the same commit.
  THE FETCH IS GATED ON THE EFFECTIVE LEVEL, not merely the use of the result: at low
  the request is never issued, so a `?quality=low` link (point 347) costs the player
  those megabytes NOTHING — the whole reason that link exists. The gate must therefore
  sit at the request, never at "load it and ignore it". Two consequences to build for:
  the load is LAZY and keyed on the level, and RAISING the level at runtime (F9, the
  debug picker) fetches the maps then and applies them when they arrive, without
  blocking the frame or stalling the level switch. Pure-test both directions — no
  request at low, exactly one request when the level rises, and none again on a second
  rise.
  DOCS: design.md §2.7 already states it; the preprocessing must be documented
  reproducibly like the existing geodata pipeline (§7.1 point 13), and CLAUDE.md §7.1
  point 14 gains the built behaviour when this lands.
  VERIFIABLE: pure — the sweep matches a brute-force horizon reference on a small
  synthetic patch (a cone, a ridge, a flat plain: a flat plain yields horizon 0 in
  every direction, a wall yields the analytic angle); the azimuth arc actually covers
  every (latitude, day) the game can produce, with a case just outside it clamping and
  reporting; sky occlusion is monotone (a pit is more occluded than the ridge beside
  it); the preset completeness and doc-sync gates cover the new keys. Live
  (`scripts/verify/enrichments.mjs`, BOTH backends, screenshots): at a massif with the
  low-sun date, the ground on the sun-facing side reads measurably brighter in PIXELS
  than the ground in its lee at the same elevation band, and that contrast is FLAT with
  the quality level stepped to low — the effect is judged on the image, never on the
  flag; no console errors; the build step is reproducible from a clean checkout.

- [ ] 348. The village fire in the rain (user 25.07.2026, screenshot: the Zulu village
  under visible rain, the §19.10 fire burning uncovered in the open with the
  inhabitants standing around it as if the weather were not happening). Point 142
  already made the fire answer to a place's own COLD, harmattan and karif; RAIN is the
  driver it never got, and rain is the one that contradicts the picture outright — an
  open fire in the open does not burn through a downpour.
  TWO MORE FAULTS IN THE SAME OBJECT, reported 27.07.2026 with a screenshot of the
  Mbuti village under rain, and they must be fixed WITH the rain behaviour rather than
  after it — a shrinking flame that keeps them would only shrink the fault:
  (a) THE FLAME FLOATS. A fire reduced by the weather still stands ON the ground: its
  base sits in the hearth, on the fire pit's own surface, at every size the rain rule
  produces. Whatever scales it must scale it about its base, not its centre — check the
  full range the rule can reach, including the smallest, because the gap grows as the
  flame shrinks.
  (b) THE VILLAGERS WALK THROUGH IT. The fire needs a collider — the user's own
  suggestion, and the right one: the hearth plus a calibratable clearance radius
  (a `balance` value, debug-editable) joins the settlement's collider set, so inhabitants
  path AROUND it and the player cannot stand in the flames either. The §2.6 rule that no
  walker may be trapped applies: adding an obstacle in the middle of a yard must not
  strand anyone, so the errand-target validation runs against the widened set.
  VERIFIABLE for both: pure Vitest — the flame's base stays at hearth height across the
  whole scale range (the floating case fails before the fix), and the hearth collider is
  in the set every walker path is validated against, with no walker target left inside
  it; live, one first-person frame in the rain showing flame on ground, and a walker
  observed pathing around the hearth rather than through it.
  RESEARCH FIRST, then build — this is a people question, not a graphics question.
  Establish from `docs/peoples-1890.md` (extending it where it is silent) where each
  people's cooking fire actually SAT around 1890: a hearth inside the dwelling, a
  roofed cooking shelter beside it, or an open yard fire. The Zulu case in the
  screenshot is the likely "hearth inside the hut" reading, but it must be confirmed
  rather than assumed, and the answer will differ by people.
  THEN THE BEHAVIOUR, decided per people from that evidence — the §19.13 dress rule is
  the model to follow (six peoples change their dress on real evidence, sixteen do not;
  a blanket rule for all would be the invention this project refuses): under rain past
  a calibratable intensity, a village either shelters its fire under a structure that
  people REALLY built there, or the yard fire is out and the life vignette moves under
  cover — inhabitants inside or under the eaves, the fire relit when the rain passes.
  DO NOT put a generic canopy over every village fire. A shelter that no one there
  built is the same class of error as a garment no one there wore.
  KEEP: the point-142 cold/harmattan/karif behaviour, and the §19.10 vignette's normal
  dry-weather life, entirely unchanged.
  DOCS in the same commit: design.md §19.10 and §19.13 gain the rain driver;
  `docs/peoples-1890.md` gains the hearth/shelter evidence AND its implementation
  section is updated in the same commit (the standing rule that research and the game
  table never drift apart).
  VERIFIABLE: pure — every people in the roster has a DECIDED rain behaviour (the sweep
  fails on a people nobody decided about, exactly as the dress sweep does); the rain
  threshold is a calibratable, debug-editable value and the transition is deterministic;
  a village whose people keep an indoor hearth shows no yard fire under rain, and lights
  it again when the rain stops. Live (`scripts/verify/polish.mjs`, BOTH backends,
  screenshot): the Zulu village forced into heavy rain shows the decided state rather
  than an uncovered burning fire, and the same village in dry weather is unchanged from
  today.

- [ ] 350. The kneeling villager is a squashed villager (user 25.07.2026, deployed
  build: a figure in the Zulu village alternates between normal and visibly FLATTENED).
  ROOT CAUSE, already located: `Figure` in `src/scenes/place/PlaceLife.tsx` fakes
  kneeling with a NON-UNIFORM vertical squash — `scale={[scale, scale * (kneel ? 0.75 :
  1), scale]}` (line ~60) on top of a shortened body cone (`bodyH = kneel ? 0.55 : 1.0`).
  The squash applies to the WHOLE figure, the head included, so the head reads as a
  flattened ellipsoid: kneeling shortens the legs, it does not compress the skull. And
  the alternation the user sees is `TaskWalker` (line ~496) swapping the standing and
  kneeling groups by VISIBILITY when it starts and ends its work at the well — an
  instant pop between two different-looking figures.
  TARGET: a kneeling pose built from PROPORTIONS, not from a vertical scale. The lower
  body folds (a shorter, wider base) and the whole figure sits lower, while the head and
  every other part keep their true shape — the group's scale stays UNIFORM. And the
  transition reads as a movement rather than a swap: the figure lowers into the pose and
  rises out of it over a short, calibratable time, so no frame shows one figure replaced
  by another. Every user of `kneel` gets it — the cook, the fire tender and the errand
  walker at the well.
  VERIFIABLE: pure (`src/render/figures.test.ts` or a test beside it) — the kneeling
  build applies no non-uniform scale (x, y and z factors equal) and its head radius
  matches the standing figure's, while the pose is genuinely lower (a bounded overall
  height reduction); the standing build is unchanged. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): across the frames in which a
  task walker starts and finishes its work, no single frame changes the figure's
  rendered height by more than the transition's per-frame step — the pop is what the
  check is for.

- [ ] 353. Sheltered ground stays less wet (user 25.07.2026). In the rain the whole
  settlement floor darkens uniformly, so the earth under a roof overhang or a tree crown
  soaks exactly like the open yard. Make wetness SPATIAL — and less, not none: ground
  under cover reads drier than the open ground around it, but never bone dry, because
  wind-blown rain and splash reach under every eave (the user's own correction, and the
  realistic reading).
  WHY IT IS CHEAP, and the reason to build it this way: a settlement's roofs and trees
  do not move. The coverage is therefore computed ONCE when the place is built — a
  shelter mask over the ground disc, derived from the layout's known building footprints
  with their roof overhangs and the tree crown radii — not per frame and not per fragment
  against a list of obstacles. Prefer that CPU bake over a top-down depth pass: it needs
  no extra render target, and it is pure-testable, which a GPU pass is not.
  THE COMBINATION: the existing global ground wetness (`setGroundWetness` /
  `groundWetnessFactor`, wired through `src/render/seasonTint.ts` and the season module)
  is multiplied by the mask through a calibratable `balance.rain.shelterStrength` that is
  strictly BELOW full, so full cover reduces the wetness without ever reaching zero.
  Edges are soft — a hard-edged dry disc under a tree would look worse than the uniform
  wetness it replaces.
  THE DRIP LINE, if it comes cheap: just OUTSIDE the eaves the runoff makes a band
  WETTER than the open ground. It is the detail that sells the whole effect, and it is
  the same mask read at its gradient. Calibratable; drop it rather than fake it.
  KEEP: dry weather completely unchanged — with no rain the mask must make NO visible
  difference anywhere.
  A USEFUL BY-PRODUCT to note in the commit: this same mask answers "is this spot under
  cover", which is what point 348 needs to move village life under a roof.
  NO QUALITY KEY: a one-time bake plus a texture lookup in a material already drawn, like
  point 352 — record the reasoning rather than adding a lever for nothing.
  VERIFIABLE: pure — the mask built from a layout with one hut is high under the roof
  footprint, falls off across a soft margin and is zero well outside it; a tree crown
  produces the same under its radius; the combined wetness at full shelter is strictly
  between zero and the open-ground value (the "less wet, not dry" rule, boundary-tested),
  and equals the open value everywhere when the shelter strength is zero. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): in a village forced into
  rain, a ground crop under a hut's eaves reads measurably lighter in PIXELS than a crop
  in the open yard, while in dry weather the two crops match — judged on the image, not
  on the uniform.

- [ ] 354. Rain falls from a bright blue sky in the settlement (user 25.07.2026,
  deployed build: the Zulu village on 03.01.1890 — high summer rains — with clear rain
  streaks against an almost cloudless blue dome). Under rain the sky must read heavy.
  THE MECHANISM EXISTS AND IS WIRED, which is what makes this worth a careful look
  rather than a quick tint: `PlaceScene.tsx` computes `skyOvercastParams(wet, strength)`
  each frame and calls `setSkyOvercast(grayMix, cloudBoost)`, and the parameters are
  substantial at that date — `grayMix = 0.75 × wetness × weatherStrength`, with the same
  wetness that is visibly producing the rain streaks. So the numbers say overcast while
  the picture says blue. DIAGNOSE WHERE THE VALUE IS LOST before changing any constant:
  candidates are the uniform not reaching the PLACE dome's material instance (the travel
  dome and the settlement dome are separate mounts), `balance.season.weatherStrength`
  sitting low, the gray being mixed under a base colour that dominates it, or the cloud
  deck not thickening at all — the screenshot shows essentially no cloud despite a
  `cloudBoost` of the same magnitude. Name the actual cause in the commit.
  THE TEST DID NOT CATCH IT, AND THAT IS THE SECOND HALF OF THIS POINT. The settlement
  season checks in `scripts/verify/polish.mjs` assert on the VALUES behind
  `__placeSeason()` — "the rains gray the settlement dome and thicken its cloud deck"
  compares numbers, not pixels. They are green while the player sees a blue sky. This is
  the exact failure the project already recorded once for the seasons (point 147: three
  rounds of uniform-level checks passed while the player saw nothing), and the remedy is
  the one that worked there — MEASURE THE PICTURE. Replace or supplement those
  assertions with a pixel comparison of the same sky region in a dry month and in a wet
  month at the SAME settlement, the way the travel ground already proves its season
  (screenshots 115/116). A parameter assertion may stay as a supporting check; it may not
  be the evidence.
  KEEP: the dry-season sky unchanged, the §19.13 thunderstorm flash and the harmattan
  dust dome (their own axis, not the wet gray) untouched, and the rain streaks as they
  are — the streaks are not the complaint.
  VERIFIABLE: pure — `skyOvercastParams` keeps its curve (already tested); a new test
  pins whatever wiring turns out to be broken, so it cannot silently return. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshots): a crop of the SKY above the
  horizon at one settlement is measurably darker and less saturated in its wet month
  than in its dry month, and the difference is large enough that a person would call it
  overcast; the existing dry-month picture is unchanged.

- [ ] 356. The inhabitants notice the traveller (user 25.07.2026). Today they do not:
  in `src/scenes/place/PlaceLife.tsx` the player appears ONLY as a collision radius, so
  a settlement is a diorama that happens to be occupied. Being SEEN is the strongest
  signal that a place is inhabited, and for a European walking into an African village
  in 1890 it is also the historically obvious reaction.
  TARGET: within a calibratable notice radius an inhabitant turns its head — the whole
  figure's facing, since these figures have no separate head — toward the traveller for
  a few seconds, then returns to its errand. Children break off what they are doing and
  stare a moment longer; the goats shy a step away. Everyone keeps their task: this is a
  glance, never a state that stops the village.
  RULES THAT KEEP IT FROM BECOMING CREEPY OR MECHANICAL: a cooldown per inhabitant so
  the same figure does not track the player continuously; a cap on how many notice at
  once (a whole village turning in unison reads as a horror film, not a place); the turn
  rides the existing capped turn rate rather than snapping; and a drama or errand that
  must not be interrupted (the elder in an audience, a walker inside a building) is
  exempt. Values in `balance.villageLife.*`, debug-editable.
  VERIFIABLE: pure — the notice predicate fires inside the radius and not outside,
  respects the cooldown, and never selects more than the cap; the resulting facing is a
  bounded step toward the player, never a snap. Live (`scripts/verify/polish.mjs`, BOTH
  backends, screenshot): walking past a group, at least one inhabitant's yaw turns
  measurably toward the player and returns afterwards, while the errands continue.
  DOCS: design.md §19.10 gains the glance beside the existing village vignettes.

- [ ] 357. The village sounds inhabited (user 25.07.2026). Checked: the settlement
  soundscape in `src/systems/ambience.ts` runs exactly ONE layer for a village —
  `setTarget('drums', 0.5)`. No voices, no pestle, no goats, no fire. Sound carries
  "inhabited" further than any visual, and its absence is not noticed until it is there.
  TARGET, as layers over the existing master ambience volume (§20), each with its own
  calibratable level like `balance.birdsongVolume`: a low murmur of VOICES at
  conversational distance; the thud of the mortar, timed to the pestle that is already
  animated rather than looping free; goats; and the fire's crackle rising as the
  traveller nears the fire ring (the §19.1 proximity model already exists for animal
  calls — reuse it, do not build a second one).
  THE VOICES STAY WORDLESS, and that is a decision, not a shortcut: the language
  mechanic of §13.4 is explicitly undecided and under review, so anything resembling
  speech would commit the game to an answer this point has no business giving. A murmur
  commits to nothing and can be replaced when §13 is settled.
  KEEP: the drums as they are, the port and travel soundscapes untouched, and the single
  master volume in charge of everything (§20).
  VERIFIABLE: pure (`src/systems/ambience.test.ts`) — each new layer's gain follows its
  own slider and the master, is zero outside a village, and the fire layer rises and
  falls with distance across a swept range. Live (`scripts/verify/settings.mjs`): inside
  a village the new layers are audible in the graph's gain values and fall silent when
  the master is muted; no console errors.
  DOCS: design.md §19.10/§20 name the village layers.

- [ ] 358. Smoke over the fire, dust under the feet (user 25.07.2026). A thin smoke
  column drifting from the §19.10 fire reads as "someone lives here" from further away
  than any figure does, and dust kicked up where a walker crosses dry ground makes the
  ground feel walked on rather than walked over.
  TARGET: a slow, thin smoke plume above the fire that leans with a calibratable drift
  and thins with height; and a small, short-lived dust puff at a walker's feet on DRY
  ground only. Both tie into what already exists: the smoke thins or gutters under rain
  the way the fire itself already answers to weather (point 142), and the dust is
  suppressed once the ground is wet (the wetness the season already drives, and the
  sheltered-ground mask of point 353 where that lands first).
  QUALITY: declare all three levels in `QUALITY_PRESETS` with the doc kept in sync —
  this is the kind of small optical addition the §21 convention exists for. Keep it
  cheap: a handful of soft billboards, not a particle system with a budget.
  VERIFIABLE: pure — the plume's drift and thinning are a function of height and the
  weather factor, and the dust predicate is false on wet ground and true on dry; the
  preset completeness and doc-sync gates cover the new keys. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshots): above the fire the pixels
  differ from the same crop with the effect disabled, in dry weather a walking
  inhabitant raises visible dust and in rain it does not.
  DOCS: design.md §19.10.

- [ ] 359. The cattle peoples' kraal is empty (user 25.07.2026, from the Zulu village
  screenshot: the enclosure stands there with nothing in it — `PlaceLife.tsx` puts GOATS
  in a pen, cattle do not exist). For a Zulu umuzi the cattle enclosure is not scenery
  but the centre of the homestead, and an empty one is a conspicuous absence.
  EVIDENCE FIRST, as with every people question here: establish from
  `docs/peoples-1890.md` which of the 22 peoples kept CATTLE around 1890 and in what
  arrangement — a central kraal, a herd out at pasture, none at all — and extend the
  research section where it is silent. The cattle-less peoples (the Bemba among them,
  per the existing rinderpest text) get NO cattle; the camel peoples keep camels.
  THEN THE HERD, and this is what makes it more than decoration: the game already models
  the great rinderpest panzootic of 1888-1897 (`rinderpestPhase`, docs/peoples-1890.md
  §5) and already tells it in the first-visit vignettes. The kraal must agree with that
  text — full in 1890, devastated from 1891/92, slowly recovering afterwards, with the
  phase read from the VISIT DATE exactly as the vignette reads it. A village whose
  journal entry speaks of the emutai while its kraal stands full would contradict itself.
  KEEP: the goats and their pen as they are; the §19.10 life, the layout and the
  colliders otherwise untouched; cattle are collidable like any other solid body.
  VERIFIABLE: pure — every people resolves to a decided cattle arrangement (the sweep
  fails on an undecided one, as the dress sweep does); the herd size falls across the
  rinderpest phases for a cattle people and stays zero for a cattle-less one, boundary-
  tested at the phase dates; the animals stay inside the pen and out of its fence. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the Zulu kraal holds cattle
  in 1890 and visibly fewer in 1893, and the Bemba village has none in either year.
  DOCS in the same commit: design.md §19.10 and the implementation section of
  `docs/peoples-1890.md` (the standing rule that research and game table never drift).

- [ ] 360. The inhabitants take notice of each other (user 25.07.2026). Every villager
  runs its errand alone: they pass within a metre of one another and nothing happens.
  A place where nobody acknowledges anybody reads as a set of independent machines
  sharing a courtyard.
  TARGET, three encounters built on what already exists in `src/scenes/place/
  PlaceLife.tsx`:
  (a) A MEETING. Two walkers whose paths cross stop for a few seconds, turn to face each
  other, exchange a small lean — the figures have no arms to raise, so the greeting is
  carried by facing, a brief bow-like lean and the pause itself — and then go on.
  (b) A HANDOVER. The errand walkers already carry a `bundle` or a `jar`; sometimes a
  meeting passes that load to the other, who carries it onward to ITS destination. The
  object must visibly change owner — one carrier, then the other, never two or none.
  (c) A GATHERING. More than one figure at the fire at the same time rather than the
  lone tender: two or three around it, one of them kneeling. This DEPENDS ON POINT 350 —
  the kneeling pose must be a real pose before several figures use it, or the gathering
  multiplies a visibly squashed figure.
  RULES: a meeting always ends (a window, then both resume — the house rule that nothing
  started runs forever); a pair that has just met is not eligible again for a cooldown,
  or two figures will greet each other in a loop; a meeting never begins where the pair
  would stand inside a collider or block a doorway; and the errands still COMPLETE — the
  village must not become a place where everyone chats and nothing arrives.
  KEEP: the point-155 guarantees (clear standing circle, escape direction, the pinned-
  walker nudge) and the ordinary errand rhythm as the backbone.
  VERIFIABLE: pure — the partner choice takes an available walker within the radius and
  never one already in an encounter or inside a building; the handover moves the load
  exactly once (source empty, target carrying); the meeting window expires
  deterministically and the cooldown blocks an immediate repeat. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): over a sampled interval at
  least one pair meets, both yaws turn toward each other, they part, and the errand
  targets are still reached afterwards; no walker is left standing past its window.
  DOCS: design.md §19.10 beside the existing village vignettes.

- [ ] 362. The crossing turned back — the crocodile takes a calf mid-channel
  (user 26.07.2026; design.md §19.8 states the target). Two systems exist and have
  never met: the purposeful water crossing (`crossingTarget`/`shouldStartCrossing`
  in `src/scenes/travel/wildlifeBehavior.ts`, point 192) and the crocodile ambush
  (§19.16, `crocodileTargetWeight` and the hunt core). Join them into the one scene
  §19.8 is missing — a family in open water.
  A CROSSING TAKES THE FAMILY. When a parent with a living calf starts a crossing,
  the calf enters with it and swims at its flank (the existing leash, at the wade
  speed both already use); the pair is one crossing, not two. A calf alone never
  starts one.
  THE AMBUSH FIRES MID-CHANNEL. The crocodile's target weighting, today biased to
  drinkers and juveniles AT the bank, gains the swimming calf as its strongest
  case — a calibratable weight beside the existing ones (§21.2, debug-editable).
  THE REVERSAL IS THE PICTURE. On the seizure the parent turns round — against the
  direction the rest of the herd is taking — and swims back. Its heading reversal
  goes through the ordinary capped turn rate (§19.5: no body ever whips round), and
  the rest of the herd does NOT turn: it completes the crossing and walks up the far
  bank. That contrast is what the scene is for; a verification that cannot see it is
  not passing.
  THE ENDINGS ARE THE EXISTING ONES, not new: the return is a RESCUE, so it takes
  the rescue burst braked by `seasonFlowFactor` (`wadeSpeed`) and rolls the SAME
  §19.8 defence matrix used at the waterline — drive-off, taken-in-the-calf's-place,
  or too late. NO vigil exists here (the water takes the body, §19.8); a too-late
  parent makes the NEAREST bank and rejoins its herd. Every branch resolves on a
  bank — reuse the crossing deadline so nothing is left swimming (§19.5).
  ANCHORS: `src/scenes/travel/wildlifeBehavior.ts` (crossing, crocodile weighting,
  defence resolution, `wadeSpeed`), `src/scenes/travel/Wildlife.tsx` ~2373–2500
  (the water-drama frame code and its `seasonFlowFactor` calls) and ~3855 (the
  crossing swim speed), `src/config/balance.ts` `waterDrama`, `src/i18n/{de,en}.ts`
  for the debug label.
  VERIFIABLE: pure (`wildlifeBehavior.test.ts`) — a parent's crossing takes its calf
  and only its calf; the mid-channel weight beats the bank cases; the reversal
  respects the turn cap; each defence outcome reaches a terminal state and a
  too-late parent ends on a bank, never in the channel; no branch can leave the
  water-drama state set past the deadline. Live (`scripts/verify/wildlife.mjs`, ONE
  backend — this is behaviour, not shading; the reversal is judged on the recorded
  positions plus one screenshot): a seeded crossing produces a herd that finishes
  while one animal reverses.
  DOCS: design.md §19.8 + §21.2 already state it; add the balance value's comment
  and the acceptance-evidence line under §12.

- [ ] 363. The straggler — a lame calf the herd leaves behind (user 26.07.2026;
  design.md §19.8 states the target). Every §19 drama is fast: a charge, a seizure,
  a plunge. This one is slow, and nothing is scripted to kill — it is the only
  scene in the game whose tension is WAITING.
  THE LAMENESS. With a calibratable chance (§21.2, debug-editable) a calf that
  SURVIVES a hunt — the parent drove the predator off (points 124/125/145c), or the
  chase simply broke off — is left lame: a calibratable speed penalty for a
  calibratable healing window. Keep the chance low; a drive-off that always cost
  something would turn the successful defence into a second sacrifice.
  THE HERD DRAWS AWAY. A lame calf cannot hold the group pace, and its parent does
  not leave it (the §19.8 constant, already implemented for the mire vigil of point
  123 — reuse that stay-behind, do not write a second one). The herd keeps its
  ordinary roaming; the pair simply falls behind and stands alone in the open.
  NO PREDATOR IS SENT. Do not spawn or steer one. The existing juvenile hunt bias
  now has an easier target because the pair is isolated and slow; that is the whole
  mechanism. If a hunt does find them the ORDINARY grammar runs (shield, charge,
  roll) — the parent does not surrender, because nothing has died.
  IT ALWAYS RESOLVES (the point-118 lesson): on the healing window the limp ends and
  the pair rejoins the herd; a streamed-away herd is the adoption/regroup case that
  already exists. A lame calf must never be left permanently detached.
  ANCHORS: `src/scenes/travel/wildlifeBehavior.ts` (the hunt outcome/drive-off
  resolution, the mire stay-behind, the leash and group pacing), `Wildlife.tsx` for
  the per-frame speed, `src/config/balance.ts` `waterDrama`'s neighbourhood (add the
  values beside the family-drama block), `src/i18n/{de,en}.ts` labels.
  VERIFIABLE: pure — the lameness fires only after a SURVIVED hunt and only on its
  chance; the penalty applies to the calf and the parent's stay-behind mirrors it;
  the pair falls measurably behind a roaming herd; the window heals and the pair
  rejoins; no state leaves a calf detached past the window. Live
  (`scripts/verify/wildlife.mjs`, ONE backend): with the chance forced to 1 a
  post-hunt pair is measurably behind the herd's centroid and later back with it.
  DOCS: design.md §19.8 + §21.2 already state it; balance comments and the
  acceptance-evidence line under §12.

- [ ] 364. The flood swells the drama current — and can take a calf at the crest
  (user 26.07.2026; design.md §19.8 states the target). This point fixes a real
  inconsistency first and adds a drama second; both land together.
  THE BUG. `seasonFlowFactor(CURRENT_WEATHER.wetness, dryFlowFactor, wetFlowFactor)`
  (Wildlife.tsx ~2373/2466/2485/3855) keys the drama current on LOCAL wetness alone.
  The game's own flood model is deliberately REMOTE-fed (design.md §19.9, points
  138/139): the Nile crests at Cairo in October where it never rains, and the
  Okavango peaks in July inside Botswana's dry season. So today the water dramas run
  at their dry-season gentlest exactly when the modelled river is at its most
  dangerous. THE FIX: the effective factor is the HIGHER of the wetness-fed factor
  and a flood-fed one — `nileFloodAt`/`okavangoFloodAt` (`src/systems/season.ts`)
  scaled by a calibratable balance value (§21.2, debug-editable) — so the crest
  swells the current, shortens the self-rescue and brakes the rescue burst through
  the paths that already read the factor. Wire it in ONE place (a helper beside
  `seasonFlowFactor`) so no call site can be forgotten.
  THE DRAMA. At a swollen crest a crossing (point 362) can lose the calf to the
  CURRENT rather than to a crocodile: it is carried downstream past its parent's
  reach, and the parent turns downstream after it — a rescue on the same rolls and
  the same brake, which the point-122 drowning window may end for BOTH. This is the
  existing drowning drama reached by a new road, not a new death: reuse
  `drownSeconds`/`drownFlowThreshold` unchanged.
  WHAT MUST NOT CHANGE: the flood stays VERTICAL (§19.9) — no ground becomes water,
  no §4.2 village clearance moves, the ribbon keeps its width. Only the force
  changes. A test must pin that.
  SEQUENCING: 362 lands first (this point's drama rides its crossing); the flow-factor
  fix is independent and may land even if 362 slips.
  ANCHORS: `src/systems/season.ts` (`nileFloodAt`, `okavangoFloodAt`),
  `src/scenes/travel/wildlifeBehavior.ts` (`seasonFlowFactor`, `wadeSpeed`, the
  drowning core ~1745), `Wildlife.tsx` at the four call sites above,
  `src/config/balance.ts` `waterDrama`, `src/i18n/{de,en}.ts`.
  VERIFIABLE: pure — at Cairo in October (wetness 0) the effective factor is
  significantly above the dry floor and near the wet case, while a rainless
  non-flood day stays at the floor; the Okavango does the same in July; the factor
  is never LOWER than today's wetness-fed value anywhere (a pure sweep over the
  year × both systems); the drowning window and threshold are untouched; the flood
  changes no water mask, ribbon width or clearance (assert against the existing
  world sweep). Live (`scripts/verify/wildlife.mjs`, ONE backend): at the October
  crest a seeded crossing is visibly carried downstream and its rescue is slower
  than the same seed in the dry season.
  DOCS: design.md §19.8 + §21.2 already state it; balance comments and the
  acceptance-evidence line under §12.

- [ ] 379. Abu Simbel becomes a walkable site (user 27.07.2026; a FEATURE, and the user's
  own instruction is that the open DEFECTS come first — it waits behind them). The world carries
  eight built cultural landmarks (Meroë, Giza, Great Zimbabwe, Lalibela, Kilwa, Aksum,
  Gondar, Bandiagara) and four natural ones; the rock temples of Abu Simbel are absent,
  and they belong: in 1890 they stood — cleared of sand by Belzoni in 1817 and a fixed
  point of every Nile journey — at the Nubian reach the traveller passes on the way
  south, in their ORIGINAL place beside the river (the 1960s relocation is far outside
  this game's window, so the site sits at the historical coordinates, not the modern
  ones).
  IT IS ENTERABLE, LIKE THE PYRAMIDS (user 27.07.2026): the traveller walks up to it in
  the bird's-eye view and enters with SPACE, exactly as point 273 made the Giza monument
  site walkable — the same enter radius, the same discovery gate, the same non-overlap
  rule against every other place's enter disc, and a first-person site the player can
  cross. Point 273 is the pattern to follow rather than a second mechanism to invent;
  read what it built before designing anything.
  ONE PLACE, ONE LABEL — do not repeat the Giza mistake (user 27.07.2026). Making the
  pyramids walkable left the site defined TWICE, as a cultural landmark AND as a map
  point, so the bird's-eye view carries two overlapping names for one thing (that is
  work-order point 338, still open). Abu Simbel is entered into the world ONCE, in
  whichever of the two forms carries an enterable site, and it must NOT also stand as a
  second definition. Point 338 decides which form survives for Giza; this point follows
  that decision rather than inventing a third arrangement — and if 338 is still open
  when this is built, it is fixed FIRST, because building a second double label while
  the first is being removed is the same defect twice.
  VERIFIABLE for that half: a pure test asserting the site appears EXACTLY ONCE across
  the landmark and map-point definitions, and one bird's-eye frame at in-game zoom
  showing a single label.
  BUILD THE REST AS THE OTHER EIGHT ARE BUILT, not as a special case: an entry in
  `src/world/data/landmarks.ts` with its ~1890-correct coordinates, the field radius and
  water clearance the §4.2 sweep in `src/world/world.test.ts` applies to every landmark,
  a localized name in BOTH language files, a first-sighting journal entry in the §10
  kind-flavoured shape (both languages, §15 voice markup, once per landmark), the
  discovery bounty, and the debug-menu jump-to entry in its alphabetical place.
  THE FRAMING IS THE §4.4 ONE: an African achievement seen by a traveller, not a
  curiosity. Four colossal seated figures cut from the cliff face, a smaller temple
  beside them, the river below — the entry says what the traveller SEES and what it
  meant, in the register the other seven use.
  RESEARCH BEFORE PLACING: confirm the coordinates and the 1890 state against
  `docs/peoples-1890.md` (it already mentions the site) and the sources that document
  the other landmarks; if the research contradicts anything here, the research wins and
  the point is corrected rather than forced.
  VERIFIABLE: the existing landmark sweeps in `src/world/world.test.ts` cover it
  automatically once it is in the data (clearance, no overlap, the label rules); add the
  i18n completeness case both languages already have, and the first-sighting entry test
  beside the other landmarks'. One bird's-eye screenshot at in-game zoom showing the
  site labelled where it belongs on the Nile.
  DOCS in the same commit: `design.md` §4.4 (the landmark list is design content — this
  is a genuine addition and pays its measured words), CLAUDE.md §7.1 pt 25 where the
  eight are enumerated, and the evidence section.

- [ ] 380. The surroundings show the neighbour that is really there (user 27.07.2026,
  reported from the deployed build). Standing at the Giza monument site the traveller
  does NOT see Cairo on the horizon, while standing in Cairo he does see the pyramids —
  and in 1890 the two are barely fifteen kilometres apart, in flat desert, in plain
  view of each other. The asymmetry is the report; the rule it breaks is §2.5, which
  promises the surroundings panorama of the real map landscape.
  DIAGNOSE BEFORE BUILDING, because the two directions probably have DIFFERENT causes:
  the backdrop band (`src/scenes/place/backdrop.ts`) is built from `sampleTerrain`
  alone — relief, no settlements and no monuments — so it cannot be what shows the
  pyramids from Cairo; that view is far more likely Cairo's own local dressing. Confirm
  which mechanism draws each side before deciding where the fix belongs. A fix in the
  wrong one produces a pyramid that hangs in the sky, which is exactly the class points
  92/94/181 already paid for.
  THE TARGET: a settlement or monument that is genuinely within sight distance reads on
  the horizon from the other, at the right BEARING and the right apparent size, sitting
  on the ground the backdrop draws (`panoramaStandY`/`discHorizonY`, the point-181
  footing rule) — never floating, never a black sliver. Sight distance is a
  calibratable balance value, debug-editable, and the rule is symmetric by construction
  rather than by two hand-written cases.
  SCOPE HONESTLY: if the research shows the general case (every neighbouring place
  within sight) costs far more than the Giza↔Cairo pair the user reported, say so with
  the measured reason and deliver the general mechanism only if it is affordable —
  a hard-coded pair is NOT an acceptable substitute, because the next pair reopens it.
  VERIFIABLE: pure Vitest on the bearing/size/footing computation for a neighbour at a
  given distance (present within sight, absent beyond it, correct bearing on both
  sides — the symmetry pinned as a property, not as two examples); plus one Playwright
  frame from each side, judged by PROJECTING the neighbour into the picture per §7.2,
  never by an assumed radius.
  ORDER: point 381 (the torn seam at that very site) is FIXED FIRST — adding a
  neighbour to a horizon that is itself broken would build on sand.
  DOCS in the same commit: `design.md` §2.5 (what the panorama shows is design content)
  and CLAUDE.md §7.1 pt 31 with its evidence section.

- [ ] 384. Rain that touches the world — wet ground, impacts, lit drops (user 27.07.2026,
  after looking at the settlement rain on the deployed build: "the rain is simply painted
  over the picture — it has no effect on the optics at all"). Measured against the code,
  that reading is nearly right: `src/scenes/place/PlaceRain.tsx` draws 700 instanced
  quads in an UNLIT `MeshBasicNodeMaterial` of one constant colour (0.66/0.72/0.8), fog
  off, depth-write off, inside a 15-unit column centred on the eye. The streaks do stand
  in the world and are occluded by huts — but nothing else in the scene knows it is
  raining. This point closes that gap with the three cheapest steps, in the order of
  effect per cost; point 385 carries the two dearer ones.
  (1) WET SURFACES — the biggest gain for the least work, and it needs no new particle.
  A single scene-wide wetness value (the place's own `rainAmount`, already computed)
  drives the existing materials: roughness down, albedo slightly darkened, specular
  response up, so ground, roofs and walls go dark and glossy and the village fire
  reflects in the wet earth. Sheltered ground is EXEMPT — work-order point 353 owns that
  rule; this point must not fight it, so read it first and drive both from one value.
  (2) THE RAIN REACHES THE GROUND, AND ARRIVES. Today the column is a fixed box around
  the head and drops recycle at its lower edge — which is why the player sees them stop
  in mid-air. A drop ends at the GROUND under it (the terrain/settlement height at its
  own x/z), and its end is an IMPACT: a short-lived, small ring or splash quad at that
  spot, alpha-fading, instanced like the drops themselves. On water the impact is a
  ring; on dust it is a puff — one shape parameterised, not two systems.
  (3) LIT DROPS INSTEAD OF ONE FLAT COLOUR. A streak's brightness follows the sun/sky
  direction and the view angle, so it reads bright against a dark hut and nearly
  vanishes against a bright sky, and the drops of one gust no longer look identical.
  QUALITY LEVELS ARE PART OF THE POINT, not an afterthought (§21 convention): every new
  lever gets a low/medium/high entry in `QUALITY_PRESETS` (`src/config/quality.ts`) and a
  row in `docs/graphics-detail-levels.md` — the completeness gate in
  `src/config/quality.test.ts` fails otherwise. Rain that costs frames on LOW is a
  regression, so low keeps the plain streaks and the wetness value at most; impacts and
  lit drops are medium/high.
  BOTH BACKENDS, ONE PATH: TSL only, no WebGPU-only branch (CLAUDE.md §3) — the
  reverted TRAA attempt is the precedent for what a second code path costs.
  VERIFIABLE: pure Vitest on the wetness mapping (dry → today's values, wet → the
  darkened/glossier set, sheltered ground unchanged) and on the impact placement (a
  drop's end equals the ground height under it, never the column's lower edge); the
  quality-preset completeness and doc-sync gates green; live, one first-person frame in
  the rain on BOTH backends showing wet ground and drops that arrive, judged by the
  picture, plus the §21 detail levels stepped through without a red.
  DOCS in the same commit: design.md §19.13 (what rain does to the picture is design
  content), `docs/graphics-detail-levels.md`, and CLAUDE.md §7.1 pt 12 with its evidence
  section.

- [ ] 385. Rain with depth and weather — layers, streak shape, dimmed sun (user
  27.07.2026; the second half of the rain work, deliberately LAST in the queue, after
  point 379). Point 384 makes the rain touch the world; this makes the rain itself read
  as weather rather than as particles.
  (4) DEPTH INSTEAD OF ONE CURTAIN: two or three layers at different distances and
  speeds, with the streak LENGTH following the drop's velocity relative to the camera
  and soft, faded ends rather than hard rectangles. That is the classic way volume is
  suggested without more particles — the count stays where it is or falls.
  (5) THE WEATHER CHANGES THE LIGHT: while it rains the sun is damped, the haze rises
  and the view distance shortens, so a downpour looks like one from inside a hut as well
  as from the open. This is where the rain stops being an overlay: the scene gets darker
  and flatter, and the fire is suddenly the brightest thing in the village.
  BOUNDARY: the blue sky under rain is work-order point 354 and stays there — this point
  changes the LIGHT, not the sky dome, and the two must be built so neither undoes the
  other. Read 354 before starting; if it is still open when this begins, say in the
  commit how the two interact.
  QUALITY LEVELS, as in 384: every lever gets its low/medium/high entry and its doc row;
  the layered rain and the light damping are medium/high, low keeps one layer and the
  undimmed sun.
  BOTH BACKENDS, ONE PATH: TSL only, no backend branch.
  VERIFIABLE: pure Vitest on the layer/velocity mapping (streak length follows relative
  speed; a stalled camera does not stretch a drop) and on the light damping (rain 0 →
  today's sun and haze exactly; rain 1 → the damped set; monotone in between); live, one
  first-person frame per backend in the open and one from under a roof, judged by the
  picture, at each detail level.
  DOCS in the same commit: design.md §19.13, `docs/graphics-detail-levels.md`, CLAUDE.md
  §7.1 pt 12 and its evidence section.

- [ ] 414. The bird's-eye animals get the walk the settlement ones have (29.07.2026,
  user asked after seeing the settlement gait: "could this walk be carried over to the
  bird's-eye view?"). Yes — and the hard part is already built and tested. `src/render/
  fauna.ts` carries the whole derivation as pure functions: `footReach`, `strideLength`,
  `gaitCadence`, `isStance`, `gaitFootFraction`, `gaitPhase`, `legSwingAngle`,
  `gaitBodyLift`, `groundPitch`, `footBodyOffset`, `seatFootOnGround`. The settlement
  walkers, the panorama silhouettes and the goats all read it. `src/scenes/travel/
  Wildlife.tsx` reads NONE of it — measured: no reference to any of those names. Its
  animals carry only a grazing-shuffle phase, so a walking herd slides.
  WHAT IS ACTUALLY MISSING is not the maths but the BODY: the travel animals are drawn
  from `animalBodies.ts` without pivoted legs, and they are INSTANCED (19 instanced
  meshes in `Wildlife.tsx`) because a bird's-eye frame holds far more animals than a
  settlement. So this point is a rendering-cost question wearing an animation costume,
  and it must be answered in that order:
  1. Give the travel bodies pivoted legs from the SAME part description the settlement
     bodies use, so one definition drives both and they cannot drift apart (the §300
     lesson, and the reason the panorama and the village already agree).
  2. Drive them from the SAME distance-driven phase — the animal's own travelled arc,
     never a wall clock — so a faster animal steps faster and a standing one stands
     still, exactly as the settlement does today.
  3. MEASURE before deciding the scope: extra per-leg instance matrices at herd scale
     are the cost, and this project has the instrument for it (F8, the in-game
     benchmark, on the user's own hardware — the headless machine's numbers are not the
     player's). If the full articulation is too dear at distance, degrade by DISTANCE
     rather than by dropping the feature: articulated near the traveller, the cheaper
     body-lift-only cue further out, nothing at the horizon — and say where each band
     begins.
  4. SORT IT INTO THE THREE QUALITY LEVELS (`QUALITY_PRESETS`, the §21 convention): the
     completeness gate fails a new optical feature that lacks low/medium/high entries,
     and `docs/graphics-detail-levels.md` is updated in the same commit.
     THE LEVEL IS THE PRIMARY AXIS, decided by the user 29.07.2026: HIGH always carries
     the walk, LOW never does, and MEDIUM is decided BY THE MEASUREMENT of step 3 — it
     gets the walk if the F8 numbers on the user's own hardware show it comfortably
     inside the frame budget, and stays without it if they do not. Do not guess that
     value: run the benchmark, put the two rows (medium with and without) in the point's
     record, and let them decide. The distance banding of step 3 is then a refinement
     INSIDE a level that carries the feature, not a substitute for the level split.
  NOT IN SCOPE: foot-on-ground seating for bird's-eye animals. The settlement needed it
  because a silhouette stands on compressed backdrop relief; at travel distance the
  terrain under a walking animal is near-flat per stride, and seating every foot of a
  herd is exactly the cost this point is trying to contain. Revisit only if the picture
  shows floating feet.
  VERIFIABLE: pure Vitest — a travel animal's stride advances with the distance it
  covered (not with elapsed time), a standing animal's phase does not move, and the
  cadence differs between a long-legged and a short-legged species; plus the
  `QUALITY_PRESETS` completeness test and the doc-sync test. Live (`scripts/verify/`,
  BOTH backends): a herd photographed twice a stride apart shows moved legs, and the F8
  report's per-system triangle/draw-call rows are attached to the point so the cost is
  on the record.
  DOCS in the same commit: design.md §19 where the wildlife is described, and
  `docs/graphics-detail-levels.md`.

- [ ] 415. The Tuareg tent reads as a heap of sand (29.07.2026, user in the Tuareg
  village, North: "what are these cones supposed to be? Sand piles? They look more like
  mini tents"). They ARE tents — `Tent` in `PlaceScene.tsx` is a single
  `coneGeometry(r·1.25, h)` in the cloth material, a 0.45-unit pole and a small dark
  entrance flap. Standing on pale sand in the pale cloth colour, a smooth tall cone
  reads as a dune, and the flap is far too small to say otherwise. The user's reaction
  is the correct one: nothing in the shape says "someone lives here".
  THE REAL FORM IS ALMOST THE OPPOSITE, and it is what makes it readable: a Tuareg tent
  (ehen) of that period is LOW and WIDE, not tall and pointed — mats or hides stretched
  over an arched wooden frame, dark against the sand, with the long side open toward the
  lee and the frame's poles and guy lines visible. Height well under a standing person,
  width several times the height. RESEARCH IT FIRST against `docs/peoples-1890.md`
  (Tuareg material is in §2.4 and §7.2) and record what the sources support before
  modelling; where the evidence is thin, say so in the point rather than inventing
  detail — the accuracy principle of this project applies to dwellings as much as to
  clothing, and the guide's own rule is that a real system is never faked.
  WHAT TO BUILD: replace the cone for the NORTH dwelling kind with the arched form —
  a low curved shell, dark mat/hide colouring against the light ground, an open side,
  and the frame legible at eye height (design.md §2.6 asks for structure and weathering
  at eye height, which a smooth cone cannot carry). Keep it cheap: this is a village
  dressing element and appears many times.
  CHECK THE OTHER PEOPLES' TENTS at the same time: the `tent` kind is also used to dress
  the market in other regions. Those are trade awnings, not dwellings, and must not
  inherit the desert form — say which shape each use gets.
  VERIFIABLE: pure Vitest on the geometry description (the north dwelling is wider than
  it is tall, and the market awning is not the same part), plus the existing layout
  tests. Live (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the Tuareg
  village photographed at eye height — the tents must be distinguishable from the ground
  by colour as well as by shape, which is exactly what fails today.
  DOCS in the same commit: `docs/peoples-1890.md` §8 (the research-to-game table) gains
  the dwelling row for the Tuareg, per the standing rule that the implementation
  sections move with the rendering.

- [ ] 428. The walkable ground meets the panorama at a visible step (29.07.2026, found by
  the picture check of the vertical look, on BOTH backends). Standing at the settlement's
  walkable edge and looking DOWN over it — a view the game only gained with the vertical
  look — the walkable disc and the backdrop relief behind it read as TWO surfaces, not one
  ground: a straight horizontal brightness step runs across the whole frame where they
  meet, the backdrop side markedly darker, and the seam itself is faintly stepped in
  short straight segments rather than following the terrain. Evidence:
  `verification/145-look-down-disc-edge.png`, recorded on WebGL 2 and on WebGPU (the step
  is on both, the shading difference is larger on WebGPU).
  WHAT IS ALREADY TRUE AND MUST STAY: point 381 closed the HOLE at that edge — outside the
  disc the backdrop never sinks below the ground plane and a ring is pinned on the disc
  edge — and CLAUDE.md §7.1 pt 31 states the ground meets the panorama "with no edge, no
  unlit face and no hole". That criterion was verified from an eye-level horizon, where
  the seam sits at the vanishing line and cannot be seen; the pitch put it in frame. So
  this is not a regression of 381 but the rest of its own criterion, and 381's geometry
  fix is not to be undone.
  TARGET: from any position and any pitch the walkable ground and the backdrop read as ONE
  continuous ground — no tonal step at the seam beyond what the terrain itself explains,
  and no straight-segment rim. Find WHICH of the two the step belongs to before changing
  either: compare the two surfaces' shading inputs (do both take the same sun direction,
  the same IBL/ambient term, the same tone mapping stage, and does the backdrop get the
  biome splat the disc gets, or a flat fallback colour?), and check whether the point-381
  ring is drawn in its own tone rather than the disc's. A material/lighting mismatch is
  the likely cause; a geometry gap is not — the picture shows contact, not a crack.
  VERIFIABLE: Vitest in `src/scenes/place/backdrop.test.ts` — the disc and the backdrop
  resolve the same lighting inputs at coincident points on the seam, so a future change
  that gives one of them its own term FAILS. Live in `scripts/verify/polish.mjs`: from the
  disc edge looking down, scan a vertical pixel column across the seam IN THE ONE FRAME
  and assert the luminance step at the contact stays under a calibratable threshold — a
  within-frame measure, never a cross-run image diff (point 361 forbids the latter). Both
  backends, judged by the picture: the same frame must show one ground.
  DOCS in the same commit: the evidence section `docs/acceptance-evidence.md` §31 records
  the pitched-view check beside the existing eye-level one.

- [ ] 591. Does the project still obey its own rules? A full adherence audit (user
  09.08.2026: "Wir scheinen so einige unserer eigenen Projektregeln zu verletzen. Lege
  auch einen Task an, der ein Review des ganzen Projekts macht, um zu prüfen, ob es noch
  mehr in der Richtung gibt"). THIS IS A DIFFERENT AXIS FROM POINT 307. That audit
  (`docs/rule-corpus-audit.md`, 27.07.2026) judged the rules AGAINST EACH OTHER —
  duplication, contradiction, dead entries. This one judges the rules against REALITY: for
  every written rule, does the repository, the mechanism set and the daily practice
  actually comply? The two cases that prompted it both passed 307 untouched, because
  neither is a defect IN a rule: the board sorted its queue from a hand-kept array while
  the work order was declared the single home of the order (point 590), and the play
  session found twelve accepted points broken against the "judge by the real signal" rule
  CLAUDE.md §7.2 has stated since the beginning (point 589).
  SCOPE — the whole corpus, each part named so none is silently skipped: `CLAUDE.md`;
  `design.md`'s process sections; the `TASKS.md` preamble; `docs/work-packages.md`;
  `scripts/verify/README.md`; the project memories and their index; the derived advice
  documents in `docs/analysis_de/`; and the user-global `~/.claude/CLAUDE.md`, which 307
  named as a gap and did not judge.
  METHOD — THIS IS A DIVERGENT STEP, so it runs BLIND PARALLEL, not as a review (CLAUDE.md
  §6): both models work from the same corpus to their own complete finding list, neither
  seeing the other's, and the two are merged into a union deduplicated BY MEANING, keeping
  both wherever it is unclear that one subsumes the other and marking what only one found.
  A reviewer handed a finished list checks that list, and the whole risk here is the
  violation nobody thought to look for.
  EVERY FINDING CARRIES ITS EVIDENCE — the rule text quoted, and the artefact, command
  output or commit that contradicts it. A suspicion without both is not a finding.
  EVERY FINDING IS THEN CLASSIFIED, because "we broke a rule" is not yet a decision:
    (a) THE RULE IS RIGHT, THE PRACTICE IS WRONG → repair the practice, and where the
        breach could recur silently, name the enforcer that would have caught it;
    (b) THE PRACTICE IS RIGHT, THE RULE IS STALE → change the rule, in the document that
        owns it, so the corpus stops describing a past state;
    (c) THE RULE IS UNENFORCEABLE OR DEAD → abolish it the way point 559 abolished the
        time-tracking mandate. A rule that formally binds every session while nobody
        follows it teaches that the corpus may be ignored, and that cost is charged to
        every other rule.
  ONE CUT MUST BE MADE EXPLICITLY: list every rule whose ONLY enforcement is memory — no
  guard, no gate, no hook, no test. That list is the audit's most valuable single output,
  because it is exactly the set that can drift without anything going red, and it is where
  both of today's cases sat.
  DELIVERABLE: `docs/rule-adherence-audit.md` — the findings with evidence and class, the
  memory-only list, and what was repaired on the spot. Everything not repairable in the
  audit itself becomes an appended point, ranked deliberately (point 590's rule), NOT a
  paragraph in a document nobody re-reads.
  VERIFIABLE: every finding names a rule location and a contradicting artefact that can be
  re-checked by a command; the memory-only list is reproduced by a repeatable search over
  the enforcer set; and the two known cases (589, 590) appear in the audit, since an audit
  that misses the findings that triggered it has not covered its own ground.
  Criticality: HIGH — an unnoticed breach means a rule is believed to be in force while it
  is not, which is worse than having no rule: nobody looks again.

The eight points below are the third deliverable of point 572 — the throughput analysis
of 09.08.2026 — which was ticked without them. `docs/analysis_de/durchsatz-analyse.md` §6
states them in their final form and ranks them; they are appended here in that order. The
three further measures of that section are NOT points: measure 4 folds into 569, measure
10 into 553 and measure 11 into 521, each recorded in the point it belongs to, because a
second owner for one defect is how two half-fixes get built.

THEY WERE THEN CHECKED AGAINST THREE EXTERNAL ANALYSES (Deepseek, Gemini and ChatGPT, given
the same repository documents; `local/Optimierungen.md`), blind-parallel by two models per
CLAUDE.md §6. RESULT: not one external proposal earned a point of its own — a point costs
about 5.0 M weighted to run, and every genuinely new item saves less than that, so each was
folded into the owner it belongs to and the specs above carry them. What the outside eyes
DID deliver: the largest single uncaptured pot (15.2 % of all output spent re-asking exactly
identical questions, now in 593), a defect in our own ranking table (machine time was sold
as calendar time, corrected in 593 and measured by 599), and the discovery that our run
records name neither the tree nor the machine a run happened on — which is why two of the
proposals could not even be decided (599 c/d). Everything else was already covered, already
built, or already rejected on our own measurements. THE ORDER CHANGED with it: 593 runs
first because it is the only member with zero build cost, 599 moved forward because four
later decisions wait on its readings, and the ladder (595) now precedes the landing command
(594) — verification is 47 % of the spend against bookkeeping's 26 %, and a rule is cheaper
to land than a mechanism that needs a review.

- [ ] 303. Code review of all changes since v0.1 — validate every test is still valid (user
  24.07.2026). QUEUE POSITION: the NEXT task after 224. Stale tests keep surfacing only as
  incidental findings (today alone: a strict type-check, heavy fuzz timeouts, and checks that
  ASSUMED pre-276 defaults — SSAO on, campfire shadows off — so they measured the wrong
  state; worst case is a check that stays GREEN while the feature is broken). Do a SYSTEMATIC
  review of the ENTIRE diff since the `v0.1` tag (code AND tests): for each area, does the
  test still assert what it claims, at a REACHABLE state, judged by the REAL signal — or has
  a later change made it stale / tautological / always-green? Focus classes: checks that
  assume a default a later point changed (the point-276 default flips are the template),
  pixel/screenshot thresholds calibrated against a since-changed look, and invariants a
  refactor turned into no-ops. Fix or re-validate each finding. METHOD: a COMBINATION of
  Opus 5 and Fable 5 (model-diverse review, the point-298 spirit) — the two models review the
  diff independently and cross-check findings. START ONLY AFTER the user's VS Code restart
  (so it runs on Opus 5). ANCHORS: `git diff v0.1..HEAD`, all `src/**/*.test.ts[x]` and
  `scripts/verify/*.mjs`. VERIFIABLE: a written report per reviewed area with a verdict
  (valid / stale→fixed), each stale test fixed with its correction. No player-visible text.

- [ ] 285. Hunt accumulation bugs and memory leaks — a repeatable Fable analysis
  (user 24.07.2026, learning from point 278: a fixed anchor drew ever more animals
  because streamed wildlife re-seeded on every return without releasing the
  re-homed originals — an UNBOUNDED growth that a normal test never caught because
  it only checks one moment, not a trend). Establish a proactive, REPEATABLE method
  — like point 205 is for world plausibility — that finds this whole bug class
  before the user does. Use MODEL DIVERSITY: a thorough FABLE analysis (different
  eyes than the Opus authors, per the audit rule), delivered in TWO prongs.
  PRONG A — CODE REVIEW for the leak/accumulation classes: resources created but
  never disposed (three.js geometries/materials/textures/render targets, instanced
  buffers — `renderer.info.memory` should be flat at a fixed state); growing
  collections never pruned (module-level Map/Set/array caches, the `refineCache`/
  `chunkLatestKey`/`spawnedChunks`-style maps, event/subscription registries);
  streaming or respawn that re-adds without truncating the previous fill (the 278
  class — re-seed keyed on distance while a re-homed entity outlives its key);
  React effects whose cleanup is missing or wrong (listeners, RAF, timers,
  observers); per-frame allocations that feed GC pressure. Produce a findings list,
  each with the file/line and the mechanism.
  PRONG B — RUNTIME TESTS that catch a TREND, not a moment: a reusable probe/harness
  (build on `scripts/perf-breakdown.mjs` + the point-277 count probes) that drives
  the real game over TIME — repeated jumps/round-trips between anchors, long driving,
  repeated place enter/leave (scene mount/unmount) cycles — and asserts that the
  measured quantities CONVERGE rather than grow: scene-graph triangle/mesh counts
  per system, `renderer.info.memory.geometries`/`.textures`, `performance.memory`
  JS heap (Chromium), instanced counts, and listener counts. A monotonic rise beyond
  a small tolerance over N cycles is a finding. Make it a script that can be re-run
  each release (a `scripts/verify/leaks.mjs` or a documented harness), on BOTH
  backends where the metric is backend-relevant.
  DELIVERABLE: the findings (evidence = the growth curve per finding), ranked by
  severity; propose fixes. Land the clear, self-contained fixes as their own atomic
  commits/points; file the larger ones as follow-up TASKS points. VERIFY each fix
  the point-278 way — a pure convergence test that FAILS on the old behaviour and a
  live trend check. DOCS: record the method and the run recipe (design.md where a
  system changes, plus a short `docs/leak-hunt.md` or a section in
  `docs/perf-276-findings.md`). This is analysis-first: diagnose and propose before
  changing load-bearing streaming/render code. Budget the fan-out (per the
  workflows-token-budget rule) — scope Prong A inline first, then run Prong B's
  harness. Implementation-ready.

- [ ] 330. Full post-degradation assurance pass — nothing new starts until this is
  100 % green (user 25.07.2026, after three separate leftovers were found by chance:
  the board's broken umlauts, the board's inconsistency, and a whole night's work
  sitting unpushed on a feature branch). The user's verdict on the cleanup so far:
  incomplete. Do ALL of the following, in this order, and report each with evidence:
  (A) COMPLETENESS — prove that every piece of work exists on GitHub `origin/main`:
  no local commit ahead of origin (`git rev-list --count origin/main..HEAD` == 0 on
  every checkout), no stash, no untracked-but-wanted file, no remote branch holding
  work that main lacks, and the working tree clean; the deployed page builds from
  that same commit. (B) RESIDUE HUNT — sweep for further traces of the degraded
  session beyond the three already found: re-run the mojibake detector over EVERY
  text file in the repo (not just the board), diff main against the pre-degradation
  commit fd85464 file-by-file and justify every remaining difference, check for
  orphaned/never-referenced files added that evening, stale `.claude` state, and any
  test whose assertions cannot fail (the `expect(true)` class) anywhere in the
  suite. (C) FEATURE AUDIT SINCE v0.2 — for EVERY feature merged after the v0.2 tag
  (bafd9b2, 24.07 21:15): 262 orphan adoption, 273 walkable Giza site, 293 benchmark
  low-preset profiling, 305 LOW sun-shadows-off, 306 closing-completeness guard, 308
  dashboard-sync guard, 309 model tripwire, 313 dashboard consistency audit — judge
  the IMPLEMENTATION for plausibility (does it do what its spec claims, at the state
  a player/operator actually reaches?) and the TESTS for validity (would each test
  FAIL if the feature were reverted? does it assert the real signal or a proxy?).
  Use model diversity: a different model than the author reviews. (D) GREEN PROOF —
  a FULL CLOSING RUN, not merely a regression (user 25.07.2026: "the closing
  contains a full regression anyway"): all eleven steps of `scripts/closing-guard-core.mjs`
  (`CLOSING_STEPS`), driven with `node scripts/closing-guard.mjs --status` and
  `--step <id> --evidence "<proof>"` per step — the LARGE regression on a QUIET
  machine on BOTH backends being one of them, plus lint/audit, the dead-code,
  stale-doc, stale-comment and .md audits, the research-doc implementation
  sections, the graphics-detail-level doc, the §7.1 acceptance confirmation, the
  open-items list and the simplifications list. CLOSING FREEZE applies (CLAUDE.md
  §9): no parallel agent work may land while it runs — the in-flight bug agents
  must be merged or parked FIRST, and the closing then runs on the frozen main.
  Any red is either fixed or recorded as a known, justified exception with the
  user's ruling. (E) COHERENCE —
  does everything still fit together (user 25.07.2026)? Cross-check, for the whole
  current state: design.md and CLAUDE.md §7.1 against what the code actually does
  (every feature merged since v0.2 must be described where the docs describe its
  system, and no doc may still pin behaviour the code has left behind); the
  implementations against their tests (every §7.1 "Verifiable" clause names a test
  that exists and still asserts that clause); the research docs' implementation
  sections (peoples-1890 §8, climate-1890 §9, graphics-detail-levels) against the
  code they mirror; the dashboard against TASKS.md (already guarded — confirm the
  guard covers what the 25.07 audit found by hand); and the memory corpus against
  the rules actually in force. VERIFIABLE: a written report per section with the
  commands run and their output; the tick happens only when (D) is genuinely green
  and (E) reports no unexplained mismatch.

  PROGRESS 25.07 (main session): (A) done — 0 local commits ahead of origin/main,
  clean tree, no work-bearing remote branch left (13 fully-merged ones deleted on
  GitHub), the two remaining stashes identified as deliberately parked older work
  (a dead-session perf-bench edit 23.07, a picture-rejected coast attempt 22.07 —
  both pre-degradation, left untouched). (B) partly done — a repo-wide sweep of
  2305 text files found NO double-encoded text outside this guard's own source
  (a self-reference: the detector flagged the damaged sequences quoted in its own
  comment; rewritten so it no longer quotes them), and NO assertion-free test: the
  five candidates the sweep flagged all assert through helper functions
  (`fired()`, `foliageOf()`, `expectRise()`), i.e. scanner false positives. Still
  open in (B): the file-by-file diff against fd85464 and the orphaned-file check.
  (B) COMPLETED 25.07: the file-by-file diff against fd85464 (excluding the
  screenshots) shows 16 differences, every one of them accounted for as today's own
  work — the model tripwire, the dashboard audit, the guard wirings, the two
  analysis docs, the queued points and the deliberately kept closing-state; nothing
  unexplained remains. The orphan scan over all 61 scripts found exactly one never
  imported file, `scripts/check-deployed-benchmark.mjs`, which is a deliberate
  manual tool (documented "Usage:" header, point 277) and not debris. A
  model-diverse review of the two guard commits merged this morning
  (closing-guard fixes + dashboard-sync wiring) additionally verified: the reverted
  Haiku files are byte-identical to the pre-degradation state, the three stub files
  are absent, no merge artefacts remain, and the retained closing-state cannot
  pre-satisfy the tag gate (it is keyed to a different commit; `--status` reports
  0/11 at HEAD). That review's own findings are queued as point 331.

- [ ] 205. A world & functionality plausibility audit — a third audit kind beyond
  code bugs (Pillar 2) and visual/behaviour bugs (203): does the world and its
  functionality make SENSE and COHERE, not just work? (user request 20.07.2026:
  there may be systems that work but are pointless, useless, or run counter to
  others.) For EACH system/feature — walk design.md's feature list AND the §7.1
  acceptance systems — ask:
   (1) PURPOSE: does it make sense in-world (~1890 Africa) AND as a mechanic, and
       would a player grasp why it exists?
   (2) USE: does it actually affect the game loop, or is it dead weight nobody
       engages — a building you enter for nothing, an item never needed, a stat
       shown but never decisive, a mechanic with no consequence?
   (3) COHERENCE: does it CONTRADICT or undercut another system — one rewards what
       another punishes, two overlapping mechanics that only confuse, a shortcut
       that trivialises a challenge?
   (4) SETTING FIT: consistent with the researched ~1890 world + design.md intent
       (no anachronism; plausible geography, ecology, economy)?
   (5) WORTH: does it earn its complexity, or add surface without depth?
  WORLD PLAUSIBILITY specifically: the ECOLOGY (every predator has prey and every
  prey a plausible predator in its own region; the herds/dramas are ecologically
  sensible), the ECONOMY (trade is meaningful — goods have a use, prices force
  decisions, the ferry/bazaar/village-barter each have a reason, the money-vs-gifts
  split coheres), EXPLORATION (each region/landmark has a reason to visit; the goal
  is reachable, motivated, and the hint cascade truly leads there), SURVIVAL
  (provisions/health/afflictions create real decisions, not noise), and the
  CROSS-SYSTEM loop (exploration → language → hints → goal; reputation → access;
  economy → equipment → capability) actually holds together.
  RESEARCH-BACKED WORLD ACCURACY (added per user 23.07.2026): beyond coherence,
  run a RESEARCH pass over EVERY concrete element of the game world and check it
  against the ACTUAL ~1890 record — verified against real sources, NOT free
  invention. The trigger/exemplar: the Great Sphinx of Giza was BURIED TO THE
  SHOULDERS in sand until the 1920s excavation, so a ~1890 depiction must show it
  sand-buried — yet it was built free-standing (fixed within the walkable-pyramids
  scene, point 273). That is a case of insufficient prior research, and the concern
  generalises: sweep the whole world for the same class of error — each landmark
  and monument (its real ~1890 state of construction/ruin/burial), each people's
  material culture and settlement form, the flora/fauna ranges, the rivers/lakes/
  ice, the trade goods and their period plausibility, place names and their 1890
  forms — asking for EACH: is this accurate for the EPOCH (~1890, not modern, not
  ancient), the REGION, and the SEASON as depicted? Flag every anachronism or
  unresearched guess with the correct researched state and a source. This is
  ANALYSIS + PROPOSALS ONLY — change nothing now; because the world keeps evolving
  until 205 runs, fold this research into 205's pass then so the latest state is
  audited. Most findings are design judgments for the USER; clear objective
  inaccuracies (a monument in the wrong physical state for 1890, an anachronistic
  good, a mis-dated name) are filed. A model-diverse (Fable) research lens is
  welcome within the point-200 token limits.
  METHOD: system-by-system + the cross-system matrix, and PLAY the loop end to end
  asking "why am I doing this / does it matter". OUTPUT: unlike the mechanical
  audits, most findings here are DESIGN JUDGMENTS — design.md is authoritative and
  design changes are the USER's call — so each is written up and DISCUSSED WITH THE
  USER, not autonomously "fixed". Only clear OBJECTIVE incoherences (a predator
  with no prey in a region, an item with literally no effect, two directly
  contradictory rules) get filed as points; the rest are a design conversation. A
  model-diverse pass is welcome (a Fable lens on "does this cohere") within the
  point-200 token limits.

- [ ] 203. Extend 184 — a systematic visual + liveness bug-finder (user request
  20.07.2026: "Bugs wie die … sollten leicht für dich zu finden sein … Kannst
  du 184 dahingehend erweitern, dass es selbst viel mehr Bugs in der Richtung
  findet?"). ROOT CAUSE of the miss: the invariant harness checks POSITIONS
  (I1 pop-in / I5 ocean / I6 interpenetration), but the whole recurring class
  the user keeps stumbling on is either RENDERED-GEOMETRY-vs-terrain (187 croc
  submerged, 202 vultures clipping, 190 Lake Edward floating, 185 scavenger,
  196 drinkers) or LIVENESS (188 predator pacing, 201 calf stuck, 193 idle
  standoff, 191 foreign family) — neither systematically swept. THREE additions,
  all cost-light (NO agent fan-out — pure/live checks + me inspecting
  screenshots in the main loop; the point-200 token concern applies):
  (A) ANCHORING INVARIANT — the highest-value one. A render hook exposes, per
  rendered animal/bird/prop each frame, its world (x,z), the LOWEST point of its
  POSED+SCALED mesh (bounding-box min-y after the live pitch/roll/scale — for a
  bird that means the pecking head and the spread wing tips), and a support
  point. A driven sweep over all regions asserts for every rendered thing: its
  lowest point is NOT below the sampled ground at its footprint (no clip — sample
  under the wing/limb EXTENTS, not just the centre), it is NOT far above the
  ground with nothing under it (no float), and a water-dweller sits at the
  rendered water SURFACE (no submerge/hover). This single check catches
  187/202/190/185/196 and their future recurrences.
  (B) LIVENESS INVARIANT — the deferred I3/I4 generalised. Over a long driven +
  staged observation, track each actor's position and state; flag any actor in a
  LIVE state (a hunt mode, a leave, a chase-victim, a caught, a finished feed)
  whose position is FROZEN (variance ~0) or OSCILLATING (paces a short segment)
  past a calibratable deadline, and any predator within touch range of LIVE prey
  where for a window neither engages nor flees. Catches 188/201/193 and kin.
  Extend (A) to STATIC water bodies too: every lake sheet / marsh fan sits at or
  just above its own bed and no edge vertex hangs over the lower neighbouring
  terrain (retro-catches 190 Lake Edward, 189 Sudd) — the same geometry-vs-terrain
  idea applied to the placed water, swept over all 8 lakes + the natural sites.
  (C) VISUAL SCREENSHOT SWEEP + INSPECTION — the catch-all for what the
  invariants do not anticipate, done the way the USER finds them but
  exhaustively: drive to a diverse set of spots and STAGE each drama (hunt,
  rescue, crocodile, trample, drink, flood, each biome/season), screenshot each,
  and VISUALLY inspect every image for anomalies (buried / floating / overlapping
  / mis-posed / wrong-looking things). Each anomaly → verify against the code →
  file a real one as its own point + fix. Keep a checklist of scenes so the sweep
  is repeatable and grows.
  KEEP THE VIRTUAL EYES OPEN FOR "LOOKS-WRONG" ODDITIES (user directive
  21.07.2026): the inspection must catch not only functional bugs but things that
  are functionally FINE yet look WEIRD to a human eye — the aesthetic/plausibility
  class the user keeps spotting: the stepped coastline (209), the sea-arm poking
  into the desert (210), a river that stops short of the sea with a beach gap or a
  notch punched in the water (211), and any similar "it works but it's ugly/odd"
  artefact (jagged edges, seams, holes, mismatched scale/colour, an object that
  reads wrong even though nothing errors). These pass every functional check, so
  ONLY the eye finds them — treat "does this look right to a human?" as a
  first-class question on every frame, and file each real one as its own point.
  (D) CROSS-SYSTEM / TARGETING SANITY — the class where a reaction or event fires
  for the WRONG actor or situation (derived from the past reports 162 a flock
  descends on a family the parent just SAVED, 168 carrion not shown when it
  should be, 191 a foreign family chases the hunter, 194 the lion claims the
  crocodile's prey). Invariant: every emergent system OWNS a unique actor (no two
  claim one — the 194 seam), and every reaction is KEYED to its correct trigger
  (only the victim's OWN parent charges/shields; a kill-flock forms only over a
  real feed or remnant; a scavenger commits only to an unowned carcass). Track,
  each frame, the (system → actor) map and the (reaction → trigger) link across a
  driven + staged run and assert no shared claim and no mismatched reaction.
  (E) VISIBLE-EFFECT / "the picture, not the uniform" — the point-147 lesson made
  a standing check (three rounds of uniform-level checks once passed while the
  player saw NOTHING; also 143 rain inside a settlement, 144 plants change,
  164/167 season/rain transitions): for each state toggle (season month, rain,
  flood, harmattan, fire, dress, dry-season bleach) assert the RENDERED frame
  changes measurably in PIXELS between the two states at a spot that should show
  it, AND that the state does NOT leak where it must not (no rain in a rainless
  desert, the season is the PLACE's not the traveller's). Pixel-diff based, a
  small fixed scene set. Retro-catches the whole "passes numerically, invisible
  on screen" family.
  (C) IS THE PRIMARY NET, NOT A FALLBACK (user insight 20.07.2026: "Es kann nicht
  sein, dass ich eine Minute zufällig drauf los laufe und mir direkt mehrere Bugs
  ins Auge springen, obwohl du gerade eine aufwändige Härtung vorgenommen hast").
  The invariants only find what I THOUGHT to check; the game is visual + emergent,
  so the reliable net is to LOOK at it the way the user does — but exhaustively.
  Make (C) a DENSE, standing, repeatable sweep: a grid of locations (each biome,
  each named place + landmark, coasts, river banks, lakes, the graveyard) × a set
  of staged situations (each drama, drink/bathe, flood, fire, each season/weather).
  CRITICAL (user 20.07.2026): a jump to a spot is only the POSITIONING — most bugs
  appear only while MOVING and OVER TIME (pop-in, plants jumping, the predator
  pacing, the calf snagging while it flees, streaming/edge artefacts). So at each
  spot DRIVE (hold a walk, and also a longer traverse across the region) and
  capture a FILMSTRIP of frames along the path, and LET the emergent dramas play
  out — capture a temporal SEQUENCE over several seconds, not one static shot. The
  static shot serves only the anchoring class; the driven filmstrip + the drama
  sequence are what catch the movement/emergent bugs. I VISUALLY inspect every
  frame (and the frame-to-frame deltas) for anything that looks off, logging each
  anomaly. Aim for the coverage a human would need hours of play to hit.
  TIME AXIS (user 20.07.2026): the sweep also varies the CALENDAR — MONTHS and
  YEARS (1890-1895) — and checks the weather/season effects AND THEIR TRANSITIONS
  are correct at the right place: harmattan Sahel Jan-Mar vs Aug, Atlas snow Feb
  vs Jul, the Nile flood crest Oct vs low Apr (at Aswan), the Okavango flood in
  the local-dry Jul vs Jan, equatorial ice, hail only in a heavy storm, the
  rinderpest years vs a clear year, the dry-season bleach vs the wet green, and
  the border-easing of rain (167). Sample intelligently — each feature at its
  PEAK month and an OFF month at its OWN location, plus a couple of stepped
  transitions to see the ease-in — not the full month×place cross product.
  BACKEND AXIS: run the whole sweep on BOTH WebGL2 AND the real WebGPU (the
  system-Chrome lane) — some visual bugs are WebGPU-ONLY (175 crown jitter, 181
  silhouette float) and never show on the headless WebGL2 path the first pass
  used.
  FULL DIMENSION SET (thought through 20.07.2026 — the sweep varies ALL of these,
  sampled intelligently, not the full cross product):
   1. LOCATION (biome, named place, coast, river bank, lake, landmark, graveyard).
   2. SITUATION/EVENT (each drama: hunt/rescue/sacrifice/crocodile/trample/vigil;
      drink & bathe; the weather events: flood, fire, hail, lightning).
   3. MONTH (season/weather + the transitions between them).
   4. YEAR 1890-1895 (rinderpest years, the deadline stages, the flood cycle).
   5. BACKEND (WebGL2 + real WebGPU).
   6. MOVEMENT (static vs a driven filmstrip — the movement/streaming bugs).
   7. ZOOM — the big one: the pop-in / streaming / far-sheet / haze / flora-edge
      class is ZOOM-DEPENDENT (164/171/172/183). Sample the achievable 0.25 & 0.5
      AND the unlocked wide debug zooms up to the whole-continent view; a bug at a
      wide zoom is invisible at 0.5 and vice versa.
   8. SCENE/PERSPECTIVE — the other big one: everything so far is the bird's-eye
      TRAVEL scene, but the FIRST-PERSON SETTLEMENTS are a whole scene with their
      own classes (walker stuck 155/198, collision/clipping into walls 16, dense
      building fabric, inhabitants using dwellings, the §2.5 panorama + its
      wildlife 181, the skyline landmarks). Sweep each port + a sample of villages:
      walk around inside, press against walls, watch the inhabitants and the
      panorama. Also the bird's-eye ⇄ settlement TRANSITION.
   9. PLAYER STATE — the rendered traveller changes: canoe RIDDEN on water vs
      DRAGGED on land, the wound on the figure by severity, swimming chest-deep,
      the item-in-use glow, afflictions. Sweep the canoe on water AND land, a
      wounded figure, a swim.
   10. TIME OF DAY / SUN — if the sky/sun varies within a day (verify), sweep the
      lighting extremes; else note it is fixed.
   11. TRAVEL DIRECTION / CAMERA HEADING — the panorama capture is bearing-
      dependent (82/99); drive several headings.
  The two most important additions are ZOOM (7) and the SETTLEMENT scene (8) —
  neither was in the first pass, and both hide whole bug families.
  SAMPLING METHOD (user 20.07.2026 — the dimensions span a huge space that can
  only be grazed; a principled sample beats a sparse grid). Three ideas combined:
   • SPLIT BY COST. The automated invariants (A/B/D/E/F-N) are CHEAP (pass/fail,
     no human) — run them on a DENSE sample (many location×time×zoom points, even
     thousands). The VISUAL inspection (C) is EXPENSIVE (my eyes) — sample it
     SPARSELY but smartly, and reserve extra visual budget for wherever an
     invariant already flags something. This alone reallocates most of the space
     to the cheap axis.
   • TARGETED for CAUSALLY-LOCATED effects. Weather/season/flood/dress/rinderpest
     do not need a cross product — each effect lives at KNOWN coordinates. Drive
     the effect→coordinate map from docs/climate-1890.md and design.md §19.13:
     each effect at its PEAK month + an OFF month + one stepped TRANSITION, at its
     OWN place. Exact and complete for that family, ~40 cases, no combinatorics.
   • PAIRWISE (2-wise) COVERING ARRAY for the GENERIC dimensions (location,
     movement, zoom, backend, scene, player-state, heading). Empirically the large
     majority of bugs are triggered by ONE factor or the interaction of TWO — a
     covering array that hits every PAIR of dimension-values needs only ~dozens of
     cases (generate with IPOG/AETG-style greedy), not the full product, yet
     catches all 1- and 2-factor interactions. Generate the array in the finder.
   • RISK-WEIGHTED + ADAPTIVE on top. Over-sample the known-hot regions (coasts,
     water edges, the dramas, the exact user-reported spots) and the
     recently-CHANGED code; and DENSIFY around any anomaly a pass turns up (an
     invariant flag or a visual hunch) — a second, finer sample in that slice.
   NET: dense-cheap invariants + a pairwise+targeted+risk visual sample (~100-150
   inspected scenarios) + adaptive follow-up — good coverage at a feasible cost,
   instead of a false-comfort sparse grid. This is the honest answer to "why did a minute of walking beat
  the hardening"; A/B/D/E are the cheap automated first pass under it.
  MORE INVARIANT CLASSES (derived by thinking through what else can look wrong —
  the cheap automated complements to the visual sweep):
   - (F) FACING/ORIENTATION: a moving animal's rendered facing tracks its
     velocity (no walking backwards/sideways); a figure/sign/door faces a sane
     direction (doors already checked — extend to animals + props).
   - (G) SCALE/PROPORTION: every rendered thing is within its species/type size
     band; a calf is smaller than its parent; no giant/tiny outlier; a landmark's
     apparent size is plausible.
   - (H) STATIC-OBJECT OVERLAP: no two solid statics interpenetrate (buildings,
     rocks, large flora, props, landmark meshes) and no label overlaps a monument
     — the I6 idea applied to the non-animal scene.
   - (I) MATERIAL/COLOUR: no pure-black or magenta (missing-texture) pixels where
     geometry renders; no z-fight flicker on a static camera (temporal diff);
     colour plausible per biome (no snow in the desert, no bone-dry tropics).
   - (K) WATER CONTINUITY/FLOW: rivers stay one unbroken descending ribbon (no
     gap, no uphill run, flow direction matches the descent) — extend the pt-21
     checks with a monotonic-descent + flow-direction assertion.
   - (N) TELEPORT/FROZEN: no rendered thing jumps > a threshold in one frame (the
     179/183 tunneling/pop class, generalised); a MOVING animal's animation phase
     advances (no frozen T-pose).
  BUILD ORDER: (A) first (retro-catches the most, cheap), then (B), (D), (E), the
  cheap extras (F/G/H/I/K/N) as they fit, and (C) the dense visual sweep as the
  standing pre-closing pass — run the WHOLE finder before the final closing.
  Across all classes this would have caught the great majority of the past
  emergent-scene reports without the user ever seeing them. Run the whole finder BEFORE the final
  closing so the batch of finds is fixed in one push. Each real find is its own
  atomic point/commit. Docs: CLAUDE §7.2 gains the anchoring + liveness invariant
  suites; this is the pillar the harness was missing.
  DONE (A) 21.07.2026 — the anchoring tripwire is BUILT and it immediately paid
  for itself. Implementation: a throttled (~1/13 per frame) dev-only assert in
  the wildlife render loop compares each rendered body's height against the
  terrain sampled at its OWN anchor (a.x/a.z), tolerances −0.75·scale/+2.5·scale
  (buried/floating), exemptions exactly mirroring the water-sweep's drama locks
  (plus drink until 196) so scripted poses are never flagged; violations go
  through the 207(i) devAssert channel and fail ANY suite. A `grounded` gate
  (set on the animal's first water-sweep visit, which now HARD-sets the standing
  height instead of easing) keeps test-staged injections with hard-coded y from
  false-firing before their first sweep correction. WHAT IT CAUGHT (the real
  class bug, fixed in the same commit): movers carried STALE standing heights —
  every follow/flee/dodge/guard/charge/vigil step updated x/z but not y, so
  on any slope the whole background herd slowly sank into (or floated off) the
  earth as it drifted; the worst case was the ordinary calf-follow step (every
  background calf tails its parent). Fixed by making EVERY mover carry its own
  ground height (land only — water occupants belong to their dramas), including
  the two sweep-skipped rescue-parent walks (the land approach to a calf in the
  water and the escort back), and by refreshing the locally captured render
  height in the same frame a correction lands (no one-frame buried render on a
  long-dt hitch). Proof: enrichments 207 pass / 0 fail / 0 console-errors with
  the tripwire armed; build+lint+vitest+audit clean. (B)-(N) and the visual
  sweep (C) remain open above.

- [ ] 207. Additional finding methods that complement the existing audits (Pillar
  2 code, 203 visual/behaviour, 205 plausibility) and together lift coverage
  sharply (user request 20.07.2026). The existing net is designed-scenario
  invariants + an inspected visual sweep + static review; these orthogonal METHODS
  raise sensitivity a lot:
   (i) [DONE 21.07.2026] IN-GAME INVARIANT ASSERTIONS — built as
     src/systems/devAssert.ts (dev-only, per-code rate limit, console.error so
     EVERY suite's console-error gate fails on a violation, window.__assertLog
     for probes; 3 pure tests). First invariants live, piggybacked on the
     water-sweep slice at no extra pass: finite positions, the crossing/caught/
     croc-grip deadlines (I4 made loud). Proven silent across two full
     enrichments runs (207/0 incl. every staged drama). Extend the invariant
     set opportunistically as systems change. ORIGINAL: the biggest force-multiplier. Instrument the
     game code with DEV-MODE assertions that fire the MOMENT a rule breaks,
     ANYWHERE (no animal rendered below its ground; no NaN/Infinity position;
     every started drama carries a deadline; a lake sheet never below its bed;
     herd counts within bounds; nothing on impassable ocean). One __assert channel
     to the console → every test run AND every manual play session becomes a
     detector, not just where a test happens to look. Turns silent corruption
     loud. DO THIS FIRST — it multiplies every other test's and the user's own
     play's sensitivity at once.
   (ii) GOLDEN-IMAGE DIFFERENTIAL — cheap automated visual regression: bake a
     baseline of the 203 sweep frames; future runs DIFF against them and flag any
     unintended pixel change. A no-inspection alarm that a fix did not break the
     look elsewhere; complements the inspection-heavy sweep.
   (iii) PROPERTY FUZZING + DISTRIBUTION CHECKS — random-sample the state space
     (positions, months, states) and run the cheap invariants on thousands of
     random states (edge cases the designed grid misses); over a long run collect
     distributions (hunt directions, calf ratios, drama outcomes, spawn counts)
     and assert they are not degenerate (the 135/169 variety class).
   (iv) SOAK / ENDURANCE — fast-forward a LONG sim run with the invariants +
     assertions live, watching for leaks, herd ballooning, drama accumulation,
     slowdown, drift (bugs that only surface after long play, e.g. the 186 pin).
   (v) METAMORPHIC RELATIONS — checks needing no golden reference: a round trip
     A→B→A returns to the same state; the same scene at two zooms shows the same
     animals; month X and X+12 look the same; leave-and-re-enter is stable.
   (vi) AUTOMATED PLAYER-JOURNEY across seeds/strategies — extend the one E2E flow
     to many, asserting the goal stays reachable, the hint cascade always leads
     there, no softlock, the deadline beatable.
   (vii) CONSOLE/TELEMETRY MINING — scan every run's console for warnings / NaN /
     shader-recompile / dropped-frame / THREE-deprecation noise, fail on new ones.
  BUILD ORDER: (i) then (ii) first (highest leverage), the rest layer in over the
  finder. These join 203/204/205 as the pre-tag quality framework.

- [ ] 184. Pre-tag hardening — a much stronger, systematic quality pass to reach a
  high-confidence bug-free state before the final closing run and the v0.2 tag.
  User decision 19.07.2026, after a cluster of elementary-functionality bugs kept
  surfacing in play (178 vultures pop in; 179 a lion tunnels through parent + calf;
  180 elephants wedge at a shore; 181 skyline fauna float; 183 animals pop into the
  frame while driving) DESPITE point 173's quality push. Runs AFTER the individual
  fixes 178-183 and hunts what remains.
  EXECUTION (user-approved 19.07.2026): run 184 with ULTRACODE (multi-agent
  Workflow orchestration) on OPUS 4.8, effort HIGH — xhigh for the design/audit
  phase (the invariant-harness architecture and the five-class sweeps), high for
  implementation; trivial mechanical sub-stages (the WebGL2 smoke scaffold, blunt
  test skeletons) may drop to a cheaper model / low effort via per-agent override.
  The audit sweeps and the adversarial finding-verification are the reasoning heart
  — keep those on Opus 4.8. First step is the WebGPU lane (Pillar 3); it may be
  pulled forward if needed to verify a play-test fix (e.g. 181's likely
  WebGPU-specific float).
  WHY 173 DID NOT CATCH THESE — the gap 184 must close: 173 hunted PURE-LOGIC test
  gaps and added ~90 VITEST tests. Vitest runs in jsdom — no 3D scene, no camera,
  no RAF wildlife, no rendering — so it is STRUCTURALLY BLIND to this whole class
  (pop-in, float, wedge, tunnel, unresolved drama), which lives only in the live
  browser scene. 173 ran the EXISTING Playwright checks (and tiered them) but added
  NO systematic, world-wide, CONTINUOUS invariant sweep; the existing browser
  checks assert SPECIFIC scenarios at SPECIFIC spots, and some measure by PROXY (a
  radius, a wall-clock wait) so they stay GREEN while the player sees a bug (183:
  the point-165 check is green at its Maasai spot while the real pop is elsewhere).
  And nobody ran ADVERSARIAL PLAY across the world — exactly how the user found
  them. So 184 attacks the LIVE-SCENE / EMERGENT / VISUAL layer systematically, not
  with more pure-logic tests. THREE PILLARS:
  PILLAR 1 — a CONTINUOUS-INVARIANT "long adversarial play" harness (the core new
  work; a new LARGE-tier suite, e.g. scripts/verify/invariants.mjs). ONE Playwright
  session drives a LONG scripted traversal that crosses EVERY region and biome
  (debugJumpTo between region waypoints, then drive with KeyW + turns while
  SWEEPING THE FULL STANDARD ZOOM RANGE 0.25-0.5 — both the closest 0.25 and the
  widest-standard 0.5, and points between — NEVER a debug wide zoom. BINDING (user
  19.07.2026): everything must work across the WHOLE standard-mode zoom range; a
  green result at only one level, or at a debug zoom, does not count — that
  praxisfremd-zoom testing is exactly what hid bugs the player saw (183). If point
  182 lands first, the standard range starts at 0.125), forces BOTH dry and wet
  seasons at each, enters/leaves
  several settlements, drives river corridors (the Nile end to end), and provokes
  the dramas (inject predators/calves/crocodiles as the existing checks do). EVERY
  FRAME it evaluates GLOBAL INVARIANTS over the live state
  (__wildlife/__camera/__player/__vegetation/__rivers), judged by PROJECTION
  (__camera.onScreen/ndc) and the SIM CLOCK (simTime), and FAILS with full context
  {simTime, invariant, species, pos, ndc} on the FIRST violation:
    I1 NO POP-IN — every animal is off-screen the frame it first joins the herds,
       land AND river, achievable zoom (178/183 class).
    I2 NO FLOAT — every rendered figure / silhouette / landed bird / dragged hull
       foot-y is at its ground/horizon anchor, |delta| bounded (181/128 class).
    I3 NO WEDGE — no animal/inhabitant with a move target stays within epsilon of
       its position past a bounded stuck window (180/155 class).
    I4 NO UNRESOLVED DRAMA — every started drama (caught calf, lunge, charge,
       vigil, mourning, trample, plunge) resolves within its window (179/121 class).
    I5 NO ANIMAL ON IMPASSABLE WATER/OCEAN outside the sanctioned water dramas.
    I6 NO BODY INTERPENETRATION beyond the design.md 19.5 separation threshold.
    I7 NO PREDATOR TUNNELING — a predator that reaches its victim resolves
       (catch/contact/drive-off), never passes through, dt-robust at a big clamped
       dt (179 class).
    Each invariant is ALSO a PURE predicate unit-tested in Vitest with crafted
    states, so the rule itself is testable and the live pass only wires it to the
    scene.
  PILLAR 2 — a SYSTEMATIC CODE AUDIT of the five recurring failure classes, run as
  SEVERAL PARALLEL SUBAGENT SWEEPS (the 173 analysis pattern, aimed at the
  scene/emergent layer), each READING its area and reporting findings WITH CODE
  EVIDENCE: (A) every spawn/despawn/seed/stream path gated by an ASSUMED RADIUS
  (viewR / fog.far / 100x-zoom / a hard-coded distance) instead of the projected
  frustum; (B) every wedge/pin site (water, terrain corners, buildings, props,
  bodies, settlement edges); (C) every ground/horizon anchor (feet vs centre,
  slope/scale lift, with/without a capture); (D) every catch/charge/lunge/
  swept-resolve for dt-tunneling and non-resolution; (E) every live check in
  scripts/verify/*.mjs judging "in view" by a radius or waiting by wall-clock
  instead of projection/sim-clock. Each confirmed finding is fixed and covered by a
  Pillar-1 invariant or a pure test; a non-trivial one may become its own TASKS
  point + atomic commit; small ones fixed inline. LOG every finding.
  MODEL MIX (user decision, 20.07.2026): run the audit sweeps with a MIX of Opus 4.8
  AND Fable 5 agents (Workflow `opts.model: 'opus'` / `'fable'`) — NOT for a proven
  Fable capability edge (unverified, its name hints at a different specialisation) but
  for MODEL DIVERSITY: the code was written mostly by Opus, so a different-model auditor
  carries different blind spots and catches what the author-model is systematically
  blind to. Distribute the five sweeps (A-E) across both models; where budget allows,
  double-cover a sweep with one agent of each so the two lenses overlap on the same area.
  PILLAR 3 — an AUTOMATED WEBGPU LANE (the headless-WebGPU breakthrough,
  19.07.2026 — this replaces the old "manual checklist because headless can't do
  WebGPU"). PROVEN: WebGPU IS testable headless AND autonomously — launch SYSTEM
  Chrome (Playwright channel:'chrome') with --headless=new + --enable-unsafe-webgpu
  + --enable-gpu and navigate to a localhost (SECURE-CONTEXT) page; the game then
  runs on the REAL WebGPU backend (measured: __renderer.backend.isWebGPUBackend =
  true, webglFallback = false, a correct ~548 KB scene screenshot, ZERO console
  errors, on the NVIDIA GPU, no window). The old belief was a Playwright
  BUNDLED-Chromium limitation (its headless requestDevice fails), not a principle.
  BUILD a WebGPU LANE into the verify harness — a launcher switch: bundled-chromium
  / WebGL2 (as today) PLUS system-Chrome / WebGPU — and run the Pillar-1 invariant
  harness AND the acceptance screenshots on the WebGPU backend, ASSERTING the
  backend really is WebGPU (isWebGPUBackend, never a silent fallback). This catches
  the WebGPU-ONLY classes autonomously: the point-175 crown jitter, the reverted
  TRAA/SSR black-screen (pt.32), any backend-specific race. Keep the WebGL2 lane
  too (the game ships both). This is the FIRST step of 184 — Pillars 1-2 gain their
  real teeth once the invariants run on the actual WebGPU backend the player uses;
  and as the lane's own proof, try to REPRODUCE point 175's jitter headless on it.
  A tiny manual note remains only for what even the WebGPU lane cannot see (a
  subjective look call). Caveat: needs a real GPU + Chrome (present on the user's
  machine); flag if a GPU-less CI would fall back.
  BUILD NOTE (scoped 20.07.2026, from the harness): all ~15 verify suites currently
  launch their OWN browser with the identical line `const browser = await
  chromium.launch({ args: ['--enable-unsafe-webgpu','--use-angle=d3d11','--enable-gpu']
  })` — Playwright's BUNDLED Chromium, which silently runs WebGL2 headless despite the
  flags. So the lane is a small, mechanical refactor: (1) add scripts/verify/_browser.mjs
  exporting `launchVerifyBrowser()` that reads an env switch (e.g. VERIFY_GL) — 'webgpu'
  -> `chromium.launch({ channel:'chrome', args:['--headless=new','--enable-unsafe-webgpu',
  '--enable-gpu'] })`, 'webgl' -> today's bundled line — plus `assertBackend(page,'webgpu')`
  reading `window.__renderer.backend.isWebGPUBackend` and THROWING on a silent fallback
  (the guardrail); (2) replace each suite's launch line with the helper and call
  assertBackend right after the game first loads (after the initial waitForFunction
  (window.__game)); (3) in run-all.mjs (launchServer is at ~line 102) loop the suite runs
  over the backend dimension per the TIER DESIGN below and set VERIFY_GL. Do NOT hand-edit
  15 files ad hoc at the end of a session — this is Pillar 3's structured job (validate
  WebGPU-headless holds under FULL-suite load + determinism first, per conditions a-c).
  PROGRESS (20.07.2026, commit 4cc4049): step (1) DONE — scripts/verify/_browser.mjs
  built with launchVerifyBrowser (VERIFY_GL webgpu=system-Chrome+--headless=new /
  webgl=bundled+ANGLE, default webgl during roll-in) + assertBackend (throws on a
  silent fallback via __renderer.backend.isWebGPUBackend). Step (2) STARTED — settings.mjs
  is the first converted suite and the lane is PROVEN END-TO-END: settings runs the FULL
  suite on the REAL WebGPU backend under system Chrome (webgl default 30/0 unchanged;
  VERIFY_GL=webgpu ran with assertBackend confirming WebGPU — no silent fallback). FIRST
  CATCH (the lane's value shown immediately): under WebGPU the 5 lion-feed checks fail
  with ALL-ZERO animation values (head pitch 0, prey-side 0, stain scale 1.0) — the
  render loop is still cold in the checks' wall-clock window (WebGPU shader compile), a
  TEST-ROBUSTNESS gap (the point-177 sim-clock discipline not yet applied to settings'
  feeding block), NOT a game bug (the feed plays on real WebGPU hardware). REMAINING:
  make the timing-sensitive checks WebGPU-robust (wait for the render loop to warm /
  sim-clock the sampling), convert the other suites the same way, wire run-all.mjs's
  tiers over the backend dimension, then flip the default per conditions a-c. This is
  the flagship's determinism work — continue with fresh focus, not rushed.
  PROGRESS 2 (20.07.2026): the feed catch CLASSIFIED as TIMING and fixed WebGPU-robust
  (poll for the depiction; commit a10607f) — settings 30/0 on BOTH backends. Then the
  four biggest/most-diverse suites are on the lane: settings (first-person), enrichments
  (wildlife — 202/0 on WebGPU FIRST TRY, the point-177 sim-clock already hardens it,
  commit 7d48fb6), flow (core loop — 32/0 on WebGPU) and collision (settlement, commit
  6a12035). collision surfaced 8 more timing-class catches: 7 EJECTIONS (push from a
  collider centre to the surface) starved by a fixed pushFrames on the slower WebGPU
  frames — fixed with a poll-based pushUntilClear (webgl 20/0, webgpu ejections pass).
  The PATTERN is now clear and repeatable: render-loop-driven behaviour read via a
  fixed wall-clock window fails on WebGPU's colder/slower headless frames; the fix is
  always to POLL for the behaviour (never a bigger fixed wait — a naive settle bump to
  fix the 8th catch, the chief-hut door LATCH re-arm, let a walker drift onto a door
  standpoint and flaked webgl, so it was reverted). OPEN Pillar-3 items: (i) the
  collision operable check needs a proper latch-aware / walker-robust poll rework so
  the chief-hut door opens on WebGPU without perturbing webgl (currently webgpu 19/20);
  (ii) convert the remaining 9 suites (events/health/voice/i18n/polish/gamepad/
  handwriting/touch/preview) applying the same poll pattern to any timing-class catch;
  (iii) wire run-all.mjs's tiers over the backend dimension; (iv) flip the default per
  conditions a-c. The lane itself is comprehensively PROVEN; the rest is the systematic
  grind — fresh focus.
  PROGRESS 3 (20.07.2026, commits 4c41447 + 2b16df0): ALL 12 DEV SUITES converted to
  the lane (settings/enrichments/flow/collision/events/health/polish/voice/i18n/
  gamepad/handwriting/touch — only preview, the prod-build suite, is left). webgl green
  across all (the default is unchanged). On WebGPU: settings/enrichments/flow/events/
  health/i18n GREEN; the timing-class catches fixed via the poll pattern were the feed,
  the 7 collision ejections and the vulture-circling check. The remaining WebGPU
  catches are ALL the SAME timing class and now clearly a SYSTEMATIC rework rather than
  one-offs: (a) the input-driven suites gamepad (5)/touch (3)/voice (1)/handwriting
  read moved 0.00 / yaw 0.00 / hang because synthetic input -> render-loop movement is
  not processed in a fixed wall-clock window on the slower/colder WebGPU headless
  cadence — every such check must POLL for the movement/yaw/interaction to happen; (b)
  the collision operable chief-hut door (latch re-arm — a naive fixed-settle bump
  traded it for a webgl walker-drift flake, so it needs a latch-aware/walker-robust
  poll); (c) the polish "direct enter falls back" capture reads active true and STAYS
  true past a 15 s poll — a DEEPER, non-timing WebGPU finding (a panorama capture
  persists on a direct place->place enter on WebGPU where WebGL2 falls back), to be
  investigated (real capture-caching difference vs a test-ordering artifact). NEXT
  (the flagship's core, fresh/deliberate — ideally the Ultracode workflow the user
  approved for 184): (1) systematically poll-ify the input/RAF checks + the operable
  rework; (2) investigate the polish capture finding; (3) convert preview + wire the
  run-all tiers over the backend dimension + flip the default; (4) Pillar 1 (the
  continuous-invariant harness) and Pillar 2 (the audit sweeps) — still untouched, the
  bulk of 184's original scope. The WebGPU lane (Pillar 3's foundation) is DONE and
  PROVEN; what remains is the methodical determinism rework + Pillars 1-2.
  PROGRESS 4 (20.07.2026, commits 83f7682 + b45ade8): the SIMPLE timing class is now
  fixed and its poll pattern proven — gamepad's 5 input checks (stick/yaw/journal/
  interact) were poll-ified with two reusable helpers, holdAxesUntil (hold a stick and
  poll the check's own condition, then centre) and pulseButtonUntil (pulse a button on
  clean edges until its effect lands), and gamepad is now 9/0 on BOTH backends;
  handwriting's WebGPU HANG (a bare .entry.writing click waiting on actionability) was
  removed with a force+timeout+catch click (now 9/1, was a hang). But the OTHER input/
  RAF suites turned out to be DEEPER, system-Chrome-specific findings, NOT the simple
  timing class (a poll fix for touch made it WORSE and was reverted): (a) touch — the
  CDP Input.dispatchTouchEvent injection produces NO movement at all under system
  Chrome + WebGPU (holding the finger through a 15 s poll still read moved 0.0), so it
  is a CDP-touch/system-Chrome incompatibility, not frame starvation; (b) voice — the
  Kokoro TTS never reaches the speaking state under system-Chrome-WebGPU, so its
  300000 ms speak-state waits hang the suite; (c) handwriting's click-to-finish still
  fails (9/10); plus the earlier (d) collision operable chief-hut latch (19/20) and (e)
  polish capture-persistence. These five are genuine investigations (system-Chrome CDP/
  TTS quirks vs real issues), NOT quick polls — do them deliberately, not rushed. So
  the honest 184 state: Pillar 3's lane + the tractable timing-class rework are DONE;
  the deeper findings (a-e), preview + the tier wiring + default flip, and Pillars 1
  (invariant harness) and 2 (Ultracode audit) — the bulk of 184's original scope —
  remain, best as a fresh/deliberate effort.
  PROGRESS 5 (20.07.2026, commit 50ea09d): preview (the prod-build suite) routed
  through launchVerifyBrowser too — ALL 15 verify suites now use the shared lane
  launcher; the webgl default is byte-identical so the normal regression is unchanged
  (preview has no DEV __renderer, so no assertBackend — its WebGPU validation goes with
  the tier wiring). READ-ONLY PREP for the touch finding (a): the virtual stick
  (src/ui/TouchControls.tsx) drives movement through POINTER events — onStickDown does
  setPointerCapture(pointerId) and records the origin, onStickMove fires setTouchStick
  ONLY when `stickPointer.current === e.pointerId`. So the likely reason CDP touch
  produces no movement under system-Chrome-WebGPU is a pointer-synthesis difference:
  the touchStart/touchMove may synthesise INCONSISTENT pointerIds (so onStickMove's id
  guard rejects the move), or setPointerCapture rejects the synthetic id, or the hit
  test misses .touch-stick. Confirming needs LIVE instrumentation on system Chrome
  (log the pointerId/target reaching onStickDown vs onStickMove) — not a read-only
  deduction and not a blind poll; do it deliberately.
  PROGRESS 6 (20.07.2026): tried the live pointer diagnostic but run-all.mjs FILTERS a
  suite's stdout to the PASS/FAIL lines, so a console.log('PTRDIAG …') is dropped —
  seeing it needs a DIRECT run against a standalone dev server (extra plumbing). The
  KEY insight makes that unnecessary for the resolution, though: the exact pointerId
  cause does not change the outcome. touch's arm TAP (touchStart+End) works but its
  stick/drag (touchStart+MOVE) does not, and voice's TTS never reaches the speak state
  — both are system-Chrome-HEADLESS limitations (CDP touchMove/pointer-capture and the
  Kokoro WASM speak-state), not game bugs. RESOLUTION (a user tier-design call, flagged
  in the dashboard's "Von dir zu klären"): run touch + voice WebGL2-ONLY and the other
  13 on WebGPU+WebGL2 — legitimate under condition (a) (the WebGL2 fallback is tested
  regardless), but it DEVIATES from "GROSS = all suites on both backends", so it needs
  the user's ok (or the alternative: a deliberate workaround — synthetic pointer events
  for touch, an alternative TTS speak detection for voice). This resolves findings (a)
  touch and (b) voice into a tier decision; (c) handwriting click-finish, (d) collision
  operable latch, (e) polish capture-persistence remain smaller investigations.
  DIRECTION (user 19.07.2026, "run all browser regression on WebGPU?"): make
  WebGPU the PRIMARY/default browser-regression lane — it matches what the player
  runs and catches the WebGPU-only class across the WHOLE suite, not just a special
  test. THREE conditions before flipping the default: (a) KEEP a WebGL2 lane — the
  game ships the WebGL2 fallback for WebGPU-less hardware (CLAUDE §3), so it must
  not go untested (at least a smoke subset every run, the full suite periodically);
  (b) VALIDATE DETERMINISM FIRST — a backend switch shifts every check's render/RAF
  timing profile (incl. the ~15 s WebGPU cold-load stall, App.tsx), and since 177
  is entirely about timing determinism, confirm all ~200 checks stay green AND
  flake-free on WebGPU across several runs before defaulting, or a new flake source
  replaces the old; (c) MEASURE THE COST — the per-launch WebGPU cold-load slows
  the regression; quantify it and, if steep, keep the fast WebGL2 lane for the
  quick everyday gate and run WebGPU on the LARGE tier. Also revisit the
  __ttsForceWasm hook (CLAUDE §3): with a real WebGPU device present, decide
  whether the voice suite still forces WASM (the render-WebGPU vs onnxruntime-
  WebGPU GPU-process contention, point 117) or exercises the WebGPU voice path.
  TIER DESIGN (user 19.07.2026): SMALL runs the current small-tier suite set (point
  173's fast low-flake subset — same suites, same count) on WEBGPU, plus one WebGL2
  SMOKE test (init + a render screenshot + one core flow, so a grossly broken
  fallback is caught). LARGE runs ALL browser suites on BOTH backends — once on
  WebGPU, once on WebGL2 — plus the prod preview. Vitest stays the fast
  backend-independent inner loop. Prerequisites: 177's determinism landed and the
  suites proven green AND flake-free on WebGPU; measure the per-launch cold-load
  cost. Updates CLAUDE §5, scripts/verify/run-all.mjs and scripts/verify/README.md;
  the suite→tier map is unchanged — each tier gains a backend dimension.
  ACCEPTANCE: (1) the invariant suite (Pillar 1) exists, covers I1-I7 across the
  WHOLE standard-mode zoom range (0.25-0.5, both ends, NEVER a debug zoom — the
  user's binding 19.07.2026 addition specifically for 184), and is GREEN across at
  least THREE consecutive LARGE runs with NO rotating flakes (sim-clock/projection
  throughout); (2) every audit finding (Pillar 2) is fixed
  and regression-covered; (3) the full LARGE regression is green 3x flake-free; (4)
  the WebGPU lane (Pillar 3) runs the invariant harness AND the acceptance
  screenshots on the REAL WebGPU backend (isWebGPUBackend asserted, no silent
  fallback) and is green, with any residual manual-only item named; (5) a written
  summary of what was
  audited, found, fixed and the residual risk. Only THEN the final closing run,
  then the v0.2 tag (174). Docs: quality/process point; adds a CLAUDE 7.1 verifiable
  line for the new invariant suite and updates the CLAUDE 5/7.2 test architecture;
  the 172/177 disciplines. (Requested 19.07.2026 — "be significantly more
  thorough"; gates v0.2 together with 178-183.)
  PILLAR-2 FINDING LOG (read phase complete, harvested 20.07.2026; full "why"
  texts in the workflow journal wf_716721d3-a95). 51 deduped findings; the
  agent-verify phase was stopped on the user's token concern — each finding is
  verified INLINE at fix time instead. Disposition: 3 filed individually
  (Wildlife 736 → 187 croc-under-surface; Wildlife 3454 → 194 claim-steal;
  Wildlife 3614 → 188 leave-no-deadline, matches the user's ocean-pacing
  report); game-code groups → 195 (radius-not-frustum spawn/despawn: Wildlife
  3441, 3386, 1462+1465, 1084, 3432 + wildlifeBehavior 628, 282), 196
  (bed/ground-anchor depictions: Wildlife 2806, 2751, 2282, 913), 197
  (drama-state exclusions/gating: Wildlife 2091+2092, 3048, 2056, 2136, 1978,
  3340), 198 (PlaceLife 764 nudge failure), 199 (canoeDrag 152 pitch-clamp
  drift); the 26 verify-SCRIPT robustness findings (wall-clock/radius in
  enrichments 753, 928, 946, 969, 1058, 1092, 1141, 1146, 1292, 1671+1690,
  1973, 2375, 3027, 4071, 4102, 4182, 4544, 4611, 4756, 5335; polish 270;
  settings 183, 277; flow 242; voice 56; touch 75) → 200.

- [ ] 224. Confirm the v0.2 checkpoint is served (re-cut 10.08.2026 from the
  four-eyes work-order analysis; the original demanded work that is already done).
  The checkpoint itself SHIPPED: `git tag` carries `v0.2` at `bafd9b25` (24.07.2026),
  the `poc` tag has since moved on, and the Pages workflow enumerates every `v*` tag
  plus `poc` dynamically (`.github/workflows/deploy-pages.yml`) rather than through the
  hard-coded tag loop this point described. The tick was evidently lost in the
  24./25.07.2026 degradation repair.
  WHAT REMAINS: confirm that /v0.2/ and /poc/ both resolve and serve their frozen
  builds, then close this point. The v0.2 tag is FROZEN and is never re-pointed
  (`tags-only-on-request`) — this point may not cut, move or re-cut any tag.
  VERIFIABLE: two HTTP 200s with the expected build stamp, recorded in the closing
  evidence.
  Criticality: low — bookkeeping on a delivery that already happened.

- [ ] 615. The not-run gate is disarmed by a comment, and the bootstrap skips its own
  LOCKFILE CHECK (four-eyes review of the landed point 573 by the second model,
  10.08.2026, verdict merge-with-fixes; both defects live-verified by the reviewer, not
  argued). Point 573 closed the false green where a spawn that never ran was read as
  "the linter rejected". Two holes remain in the mechanisms it delivered:
  1. `establishesRun` (`scripts/verify/spawnAssertion.mjs`) matches its RUN_ESTABLISHERS
     against the UNMASKED case text, while every other match in that module runs over
     `maskCode` output — the module's own rule that a string must never be mistaken for
     code. So a COMMENT naming the helper disarms the gate: a case that asserts a
     non-zero exit as a rejection, with `// TODO: route this through didRun once the
     helper lands` above it, yields zero findings. Two further spellings of the same
     defect also slip past: `expect(r.status !== 0).toBe(true)` (the boolean wrap) and
     `expect(r.status).toBe(1)` (the literal code).
     FINAL STATE: run-establishment is decided over MASKED text like every other match in
     the module, and the boolean-wrap and literal-non-zero spellings are recognised as
     the same assertion as `not.toBe(0)`. The alias and wrapper cases
     (`const { status: verdict } = spawnSync(…)`) stay outside the gate's reach and are
     NAMED as its documented limit rather than silently missed.
  2. `planBootstrap`'s `hasOwnDeps` short-circuit (`scripts/worktree-bootstrap-core.mjs`)
     returns "this checkout already has node_modules" BEFORE the lockfile hash is
     compared, so a worktree whose lockfile has since diverged — by its own change or by
     merging main's — keeps running its gates against the donor's dependency tree. That
     is precisely what the plan's own `lockDiffers` reason exists to prevent.
     FINAL STATE: the lockfile hash is compared whenever a linked or installed
     `node_modules` is already present, and a divergence installs for real instead of
     proceeding. A DANGLING link (the donor's tree deleted) is relinked or installed
     rather than throwing a bare EEXIST, and its message names the remedy.
  VERIFIABLE: pure Vitest — the comment-disarmed snippet above, the boolean wrap and the
  literal non-zero each produce a finding; a case that genuinely establishes the run
  produces none; and the plan for a present-but-diverged lockfile is "install", for a
  dangling link "relink or install", both with their reason. Plus the real proof for the
  bootstrap half: a worktree bootstrapped, its lockfile then changed, re-bootstrapped,
  and the resulting tree is the one its own lockfile describes.
  Criticality: medium — both halves restore a signal the fast layer is believed to give
  and does not, which is the same failure class point 573 was opened for.

- [ ] 616. The idle modes point 612 does not reach (blind-parallel enumeration by both
  models, 10.08.2026 — CLAUDE.md §6 divergent stage; merged by meaning, and every item
  below is evidenced in `.claude/batch-launcher.log` or in the code it names). Point 612
  binds OWNERSHIP to work. Three further channels can hold the batch still while nothing
  is broken, each with a longer observed stall than the one 612 repairs:
  1. A CLAIM RESERVES WITHOUT WORKING. `assessClaim` honours a takeover claim for as long
     as its claimant's pid provably lives, and a window's pid lives for days — observed:
     `skip: session … has CLAIMED the batch 132 min ago`. FINAL STATE: the same idle
     arithmetic 612 applies to ownership applies to a claim — a claimant that shows no
     owner-attributable activity within the idle window stops reserving. One decision
     function owns both verdicts, so the two can never disagree.
  2. NOBODY WATCHES THE LAUNCHER. The daemon has no supervisor: its only arming path is
     the CLI `--start`, and it supervises the chat watcher rather than the other way
     round. If it dies while a headless owner runs and that owner then crashes without a
     boundary, no tick ever comes and the batch is orphaned until a human opens a window.
     FINAL STATE: a second, dumb leg — the chat watcher and every session-start hook
     re-arm a dead launcher, which `--start` already tolerates being called on a live one.
     One process death may not orphan the batch.
  3. AN EXTERNAL-INFRA PAUSE HAS NO CLOCK. A board page unreachable behind its CDN and a
     starved Actions runner both escalate to a deliberate pause that no clock ever ends —
     observed twice, and `skip: batch is paused with no restart clock` 21 times. The pause
     is right; parking forever is not, because the cause is external and transient by
     nature. FINAL STATE: an infrastructure pause carries a probe-and-resume clock and
     retries hourly; a pause whose cause is a DECISION (a degraded serving model, an open
     user question) stays clockless as it is today.
  WHAT STAYS THE NAMED RESIDUAL, deliberately not engineered at: an exhausted usage quota,
  a genuine user decision, and a container that is down — none is reachable from inside the
  repository, and the first two are correct behaviour rather than a defect.
  VERIFIABLE: pure Vitest per part (a claim without owner-attributable activity stops
  reserving at the window boundary while a working one does not; the re-arm is idempotent
  against a live launcher and starts a dead one; an infrastructure pause yields a next-probe
  time while a decision pause yields none), plus the chaos drill of point 449 gaining a case
  that kills the launcher and asserts the next session re-arms it.
  Criticality: high for unattended operation — each of the three has already cost more
  standing-still time than the failure 612 repairs.

- [ ] 617. An owner that works once and then idles still holds the batch for an hour
  (four-eyes finding on point 612, 10.08.2026, recorded with its merge verdict). Point 612
  binds ownership to work, but its idle window only reaches a session that has completed
  NO call since taking the lock (`workedSinceClaim === false`). That restriction is right
  as far as it goes — the literal rule would dispossess a session in the middle of a
  30–40-minute regression, and each dispossession spawns a successor beside a working
  owner, which is the 24.07.2026 double-spawn as an everyday event. What it leaves open is
  the point's own sentence, "it either works or it releases": an owner that completes one
  call and then goes quiet keeps the batch for the full lease.
  FINAL STATE: idleness is decided by two facts instead of one — silence longer than the
  window AND no call in flight. The second needs its own stamp: `leaseUntil` cannot serve,
  because a declared wait extends it by up to four hours, so a renewal timestamp is written
  where the call actually renews and the idle verdict reads THAT. A session inside a long
  call is never dispossessed; a session that finished its last call and went quiet is, at
  the window. The decision stays in the one ownership function point 612 built, so no
  second arithmetic can disagree with it.
  VERIFIABLE: pure Vitest — a long call in flight holds the lock past the window; the same
  session with the call finished loses it at the window; a declared wait still holds; the
  boundary cases exactly at the window; and the renewal stamp is written by the real hook
  path, not only by the test.
  Criticality: high — it is the batch's ownership arithmetic, and getting it wrong either
  strands the queue or produces two live owners.

- [ ] 618. A modified key still does two things at once outside the calendar row
  (four-eyes finding on point 601, 10.08.2026, recorded with its merge verdict). Point 601
  closed this defect class for the calendar keys: a chord the game hands back to the browser
  must not ALSO run the game's own handler, or one press does two things and the game's half
  is silent. The reviewer found the class survives in three places 601 did not reach, all of
  them pre-existing.
  FINAL STATE:
  1. `onTab` in `src/ui/Hud.tsx` goes through the same modifier check as every other
     handler instead of bypassing `onKeyPress`. Today a windowed Ctrl+Tab switches the
     browser tab AND toggles the journal; Ctrl+Tab is not one of the three reserved chords
     the prevention path can swallow, so standing the handler down is the only cure.
  2. Meta counts as a modifier wherever Ctrl and Alt already do. On macOS the game acts on
     Cmd+G (dig), Cmd+C (pitch camp) and Cmd+M (map) while the browser or the OS runs its
     own command on the same press — the same one-press-two-things the point closed, and
     the comment in `src/systems/keyboardGuard.ts` claiming nothing a page does reaches
     these is true only of Cmd+W/T/N.
  3. The four YEAR-key registrations get the same test cover the month keys have. Removing
     their opt-in currently passes the suite, although Ctrl+NumpadAdd is a browser zoom the
     game deliberately hands back.
  VERIFIABLE: Vitest — Ctrl+Tab leaves the journal closed and the event unprevented, so the
  browser keeps its chord, while a plain Tab still toggles it; each of the Meta-modified
  game keys leaves its action untaken; and each of the four year keys is pinned in both
  directions, so removing an opt-in reds the suite.
  Criticality: medium — it takes no session down the way Ctrl+W did, but every instance is
  a silent state change the player did not ask for and cannot see the cause of.

- [ ] 619. The dressing pair no longer gestures, and design.md says so (user decision
  10.08.2026, answering the card the point-580 fix raised). The village's conversing pair
  is pure dressing that never utters anything, and since gestures were tied to speech
  behind the earshot gate it only stands, turns and shifts its weight. `design.md` §19.10
  still promises the older behaviour, and the user chose the simpler of the two ways
  offered: strike the gesturing rather than give the pair a voice.
  FINAL STATE: in `design.md` §19.10 the vignette reads "pairs stand together in
  conversation" — the ", gesturing" is struck, and nothing else in the sentence or the
  list around it changes. No code changes: the behaviour the line now describes is what
  already ships. The word count drops, so no budget question arises.
  VERIFIABLE: the phrase "in conversation, gesturing" no longer occurs in `design.md`, and
  the existing gesture tests stay green — the delivered behaviour is untouched, this point
  only makes the document describe it.
  Criticality: low — it is a documentation correction, but an uncorrected line is a
  standing invitation to "restore" a behaviour that was deliberately removed.

- [ ] 620. A frame passes its checks while showing nothing at all (measured 10.08.2026
  while landing point 588; bundle Testinfrastruktur). `VERIFY_GL=webgl node
  scripts/verify/run-all.mjs polish --section=speech-guess` passes all 11 checks and writes
  `148-speech-guess-invitation.png` / `149-speech-guess-dialog.png` showing the note and the
  dialog over PURE BLACK — no village, no sky. It is neither the host nor the change: the
  `villager-gestures` section on the SAME tree and the SAME backend draws the settlement in
  full, and `speech-guess` on WebGPU draws it in full. The section stages itself onto
  whichever object named `inhabitant` `scene.traverse` finds FIRST and teleports the player
  four units beside it; on the slower WebGL 2 lane (1–2 FPS) that pick is taken before the
  scene has settled, so the camera lands where it sees nothing. The frame-subject shutter
  (point 375) passed it, correctly by its own rule: the label's anchor DOES project into the
  frame. The subject was present; the world behind it was not.
  FINAL STATE:
  1. The `speech-guess` section stages only once the scene has SETTLED — the same
     "triangle count still moving" settle the worldmodel frames already use — and picks its
     figure deterministically rather than by traverse order, so the frame is the same
     picture on either backend.
  2. The shutter learns the second half of point 375's promise: a frame whose subject is in
     view but whose PICTURE is empty is refused, naming what it found. "Empty" is judged by
     the scene the frame claims (a `local`/`place` frame must have the settlement drawn),
     not by a pixel threshold — point 361 rejected pixel metrics as a gate, and this is a
     question about the scene graph, which the page can answer directly.
  VERIFIABLE: the section's two frames show the settlement on BOTH backends; a unit case
  over the shutter's pure core refuses a frame whose declared subject projects into an
  otherwise undrawn scene and accepts the same frame once the scene is drawn.
  Criticality: medium — nothing the player sees is broken, but a real regression in that
  view is invisible on the WebGL 2 lane for as long as this stands, which is the exact harm
  the picture check exists to prevent.

- [ ] 621. A ceiling raise is no longer a question for the user (user decision
  10.08.2026, via the board chat: "Frage mich in Zukunft allgemein nicht mehr bzgl.
  Anhebungen"; bundle Chat & Tafel). The measured doc ceilings in
  `scripts/doc-budget-core.mjs` currently have two ways out, and the second one —
  raising the limit — is written everywhere as needing the user's agreement, so a
  blocked addition can stall on a question. The user has withdrawn that requirement
  generally: the decision is ours to take.
  FINAL STATE:
  1. The rule reads: when a budget blocks an addition, SHORTEN or MERGE what is
     there; where no tightening of comparable value exists, RAISE the ceiling in the
     SAME commit and JUSTIFY the raise in that commit message. No user question, in
     either direction — the raise stays a deliberate, written act, it is simply not
     escalated.
  2. Point 531's spec drops its closing escalation clause ("the point ESCALATES the
     ceiling question to the user instead of silently raising it") and states the
     rule above instead; the rest of that point is untouched.
  3. Every place that repeats the old wording says the new one: the header of
     `scripts/doc-budget-core.mjs`, `docs/analysis_de/vibe-coding-anleitung.md`,
     `docs/analysis_de/lesson-mechanisms.md` §3.30 and the rule row in
     `docs/analysis_de/retrospektive-zusammenarbeit.md`. The 102-word raise in
     `scripts/doc-budget-core.mjs` still carries "NOT yet confirmed by the user"
     beside its value; that note goes with the rule it belongs to.
  VERIFIABLE: a grep for "user's agreement" / "Begründung anheben" / "ESCALATES the
  ceiling" finds no doc-budget occurrence that still routes a raise through the user;
  `node scripts/doc-budget-core.mjs` and `scripts/verify/docs.mjs` green.
  Criticality: low — a process rule, no player-visible behaviour.

- [ ] 622. A verify run that ran nothing reports green, and an unknown flag runs
  EVERYTHING (found 10.08.2026 while verifying point 592; bundle Prüfkosten).
  Two shapes of the same hole in `scripts/verify/tiers.mjs`' `parseArgs`, both
  reproduced today: `node scripts/verify/run-logged.mjs --help` sorted `--help`
  into `flags`, left `filter` empty and therefore started a FULL both-backends
  LARGE run (killed after it had booted); `node scripts/verify/run-all.mjs helth`
  intersected a typo'd suite name to the EMPTY set and printed `ALL GREEN — 0
  suites run` in under a second. The second is the dangerous one — it is a green
  verdict for a run that proved nothing, the failure class points 375 and 574
  exist for; the first only burns 42 minutes.
  FINAL STATE:
  1. An argument the runner does not know is REFUSED before anything is built or
     booted — an unknown flag and a filter token naming no suite each exit
     non-zero within a tenth of a second and name what does exist. The
     `--section` path's early validation in `run-all.mjs` is the model and the
     place to join.
  2. `--help` / `-h` prints the usage of `run-all.mjs` and of
     `scripts/verify/run-logged.mjs` and exits 0 WITHOUT running anything.
  3. A run whose chosen suite set is EMPTY is never GREEN: it exits non-zero and
     names the filter that matched nothing. "0 suites run" is a failure verdict.
  4. `scripts/verify/tiers.test.mjs` pins all three in the fast layer, including
     that a KNOWN flag (`--baseline`, `--section=…`, `--quiet`) still parses.
  VERIFIABLE: `node scripts/verify/run-all.mjs helth` exits non-zero naming the
  suites, `node scripts/verify/run-logged.mjs --help` prints usage and runs
  nothing, `npm run test:unit` green.
  Criticality: medium — it touches the argument path of every regression command,
  so a mistake there silences the whole gate; the other model's mechanism review
  applies.

- [ ] 625. The same defect was built twice, in parallel (measured 11.08.2026, 00:12).
  Point 590 ("THE BOARD'S QUEUE ORDER IS A SECOND COPY OF THE WORK ORDER, AND IT KEEPS
  DRIFTING", from the user's report of 09.08.) and point 608 ("THE BOARD'S ORDER IS
  HAND-KEPT AND DRIFTS FROM THE WORK ORDER", a finding of 10.08.) name ONE defect and
  demand ONE final state: the queue's order is derived from `TASKS.md` instead of the
  `order` array in `.claude/board-queue.json`. Two agents built it at the same time, on
  the SAME two files (`scripts/board-queue-core.mjs`, `scripts/queue-order-guard-core.mjs`),
  so the branches could never both land; one full agent run plus its own review was spent
  twice over. The duplication was visible in the two headlines, and two mechanisms let it
  through — the finding was opened as a NEW point while the user's report stood open
  (against `bundle-first`), and the free-slot check listed 608 as "independent of the
  running branches" while both rebuilt the same core.
  FINAL STATE:
  1. OPENING A POINT LOOKS FOR ITS TWIN. Recording a finding or appending a point reports
     the open points whose headline shares its distinctive terms, or whose spec names the
     same file, and asks the author to fold it in or to say in one line why it is genuinely
     separate. It never refuses — a false twin costs a sentence, a missed one costs a
     whole build.
  2. COMMISSIONING AN AGENT COMPARES FILES, NOT NUMBERS. The independence a free slot is
     judged by reads the FILES each candidate would touch — from the paths its spec names,
     and from those the running branches have already changed (`git diff --name-only
     main...<branch>`) — and a candidate that shares one is reported as OVERLAPPING rather
     than independent. `scripts/batch-in-flight-core.mjs` holds that judgment today and
     had it wrong.
  3. The resolution of the concrete case is not part of this point: 590 lands (it also
     covers the rank side and absorbs 608's duplicate check) and 608 is ticked as covered
     by it.
  VERIFIABLE: Vitest — two headlines sharing a distinctive term are reported as twins while
  two sharing only stop words are not; a candidate whose spec names a file a running branch
  changed is OVERLAPPING; one that names none is independent; the real 590/608 pair, as
  they stood on 11.08.2026, is reported as a twin AND as overlapping.
  Criticality: MEDIUM — no player-visible behaviour, but it wastes whole agent runs and
  produces branches that cannot both land.

- [ ] 626. The boulder's proof proves the wrong thing (four-eyes review by GPT-5.6 Sol of
  the landed point 585, 11.08.2026; two findings re-verified against the tree before
  filing). 585 stood the landmark erratic on the ground and was landed on a green picture
  — but its evidence does not hold what it claims, and a second defect class it fixed is
  untested:
  1. THE SEAT CHECK IS SELF-REFERENTIAL. `scripts/verify/world.mjs:154-174` calls the
     block "seated" when `r.y` equals `r.groundY` — both read from the SAME site object.
     That proves the SCENE COPIED the site's number, never that the block stands on the
     DRAWN terrain. It is exactly the proxy this project forbids (CLAUDE.md §7.2: judge by
     the rendered result, never by an assumed value). The check must read the height of the
     drawn mesh under the block's footprint — the vertices the bird's-eye mesh was built
     from — and compare THAT with the drawn base.
  2. A NEW TEST ASSERTS AGAINST AN OCEAN. `src/scenes/place/groundScatter.test.ts` never
     calls `setupGeodata()`, so its world is water everywhere — the trap 585's own report
     named for two other files, reproduced in the file it added. It loads the dataset, or
     it proves nothing about the shore rule.
  3. AND THE PLACEMENT STILL HAS EDGES the review named and nobody has refuted: the
     footprint is probed at 25 discrete points, so a wet or blocked sliver between them
     survives; an exhausted search returns the village coordinate WITHOUT proving it dry;
     and the all-water seed 4242 is returned wet with `communicationRock.test.ts:207-232`
     blessing it. Either each is genuinely unreachable in play — then the test says so in
     one line — or the search fails LOUDLY instead of returning a spot it cannot vouch for.
  VERIFIABLE: the seat check FAILS when the scene is made to draw the block a metre above
  its site (a deliberate regression, reverted), which the current check cannot detect;
  `groundScatter.test.ts` green with the geodata loaded; and a stated verdict per edge in 3.
  Criticality: HIGH — this is the landmark the communication goal is dug up at, and the
  check that was supposed to protect it does not.

- [ ] 627. The Victoria Falls frame photographs somewhere else (measured 11.08.2026 on
  `main` at 3f639f0d, after the point-585 landing; bundle Testinfrastruktur). `world`
  reds on ONE of its seven landmark frames: `15-worldmodel-victoria-falls — its subject is
  not in the rendered picture: off the left and bottom edge of the frame`. It survived the
  suite's own retry, and it is WEBGPU-ONLY: the same suite on WebGL 2, in the same sitting,
  writes all seven frames green — which is why the charge that accounts for it is scoped to
  that lane and a WebGL 2 red stays a real red. On the 585 branch the WebGPU run had passed
  minutes earlier, so it is either a genuine regression of the jump or a rotating timing
  failure, and which of the two is exactly what this point must settle. The six
  other landmarks (Khartoum, Lake Victoria, Kilimanjaro, the Congo mouth, Cape Town, Lake
  Chad) pass in the same run, so it is not the shutter and not the projection: those refuse
  correctly, which is why this was caught at all.
  FINAL STATE: the cause is NAMED with evidence — the jump to (-17.9, 25.9) not settling
  before the shutter opens, a camera clamp at that latitude, or a real placement change —
  and fixed at that cause. If it is timing, the frame waits on the STATE the jump reaches,
  never on a wall-clock; a fixed sleep is not an answer here (CLAUDE.md §7.2). The charge
  entry in `scripts/render-verify-charges.mjs` that currently accounts for this red goes
  when the point is ticked.
  VERIFIABLE: `world` green on BOTH backends, three runs each, the falls frame written and
  showing the falls; and the deliberate regression (a jump that does not settle) must make
  the check red again.
  Criticality: medium — it blocks no player, but an unaccounted red on `main` blinds the
  render gate for every later change.

- [ ] 643. A red is released by the wrong proof: the suite passed, not the check (found by
  GPT-5.6 Sol while reviewing point 640, and left standing there as a named boundary rather
  than smuggled into that point's scope). Point 640 settled how a red is CLOSED — cause,
  charge, or its own point. What it does not settle is how a red is RELEASED once recorded.
  Today the record releases a red when the red's own SUITE comes up covering on code newer
  than the red. That is one level too coarse: a suite holds many checks, so a deliberate
  no-op edit inside the render set plus one green run of that suite releases a red whose
  own check never ran again. The release then rests on the suite having passed, not on the
  thing that failed having passed.
  FINAL STATE: the record keeps a resolution history PER CHECK, not per suite — for each
  named check, the newest code it last passed on. A recorded red is released only when THAT
  CHECK passed on code newer than the red; a green run of its suite that did not exercise
  it leaves it standing, and the record says which check is still outstanding rather than
  reporting the suite as covering. A check that has been removed or renamed is reported as
  such, never treated as passed by absence.
  VERIFIABLE: Vitest over the pure core in `scripts/render-verify-core.mjs` — a red on
  check A is NOT released by a run in which only check B passed, is released by a run in
  which A passed on newer code, and a run whose check set no longer contains A reports A as
  vanished rather than covered; plus the concrete case that motivated it, a no-op render
  edit and one green suite run leaving the red standing.
  Criticality: medium — it does not let broken code land (the fast gate still runs), but it
  lets a red be signed off by evidence that never touched it, which is the same defect
  class point 640 closed from the other side. Bundle: Testinfrastruktur.

- [ ] 646. The repo doctor is the second door into the same disaster (found 11.08.2026 by the
  agent delivering point 629, and left to its own point rather than smuggled into that
  scope). Point 629 closes the LANDING's path to deleting a live agent's worktree.
  `scripts/batch-doctor.mjs`'s `remove-orphan-worktrees` reaches the same directories under
  `.claude/worktrees/` by a different route. It is the narrower door — it only removes
  directories git does NOT list, and it re-judges at execute time, so a REGISTERED live tree
  is skipped twice — but the hole is an UNREGISTERED live tree, and
  `scripts/batch-doctor-states.mjs` already names it in its own comment: "the registration is
  the ONLY shield a live agent's tree has here — the idle window does not help, because a
  directory's mtime never moves while the agent writes in its SUBdirectories." A
  `git worktree prune` that drops a record while an agent is still working in that tree
  produces exactly that state, and is a plausible path to the 11.08.2026 incident whose exact
  code path point 629 could not reconstruct.
  FINAL STATE: `remove-orphan-worktrees` proves liveness before it deletes, by the same
  standard point 629 establishes for the landing — git's own worktree lock, uncommitted
  content, and recent writes probed BELOW the directory rather than at it, with every
  unknown answering "keep and report" instead of "delete". An unregistered tree that cannot
  be proven dead is reported by name and left standing; the doctor says what it left and why,
  so a genuine orphan is still cleared by an operator who can see it.
  VERIFIABLE: Vitest over the pure selector — an unregistered but LIVE tree (locked, or
  dirty, or written to below its root) is reported and NOT removed; an unregistered tree
  provably dead by all three probes is removed; an unreadable probe answers keep, not delete;
  plus the mtime case the existing comment names, where the root's own timestamp is stale
  while a subdirectory is being written.
  A SECOND, SMALLER FALSE FINDING RIDES ALONG, and it has fired at least eleven times
  (measured 13.08.2026, 13:00, from the stash list). `.claude/queue-rank.json` is REWRITTEN by
  `queue-rank.mjs` on every session that lands or files a point — the `settled.at` stamp plus
  the points that moved — and nobody commits it, so the next session's doctor finds it dirty,
  cannot attribute it to an author, and quarantines it into a stash. The stash list carries
  that same quarantine for 04., 05. (twice), 06., 08. (twice), 09., 11. and 12.08. (twice).
  The cost is not the stash: it is that the ranking baseline starts every session STALE (today
  it was missing the point filed the evening before) and that a genuine finding has to be read
  past a standing false one.
  THE LOCK THAT MAKES IT UNFIXABLE IN PLACE: the file changes at the END of a session, exactly
  when the board card already reads "gerade keine laufende Arbeit" — and `board-first-guard`
  then refuses the `git add` that would save it. So the bookkeeping of a landed point cannot be
  committed at the moment it arises without first re-opening a card and closing it again.
  FINAL STATE, either: the LANDING writes the ranking into the tick commit (`land-point.mjs`
  already commits and pushes there, so nothing new has to be arranged), or the file is
  generated state and moves into `.gitignore` — and then the doctor must stop reading it as a
  foreign write. Either way the recurring false finding disappears and the baseline is current
  at the next start.
  VERIFIABLE: Vitest over the doctor's selector — a dirty `queue-rank.json` alone no longer
  plans a quarantine — plus a landing whose tick commit carries the ranking (or a repository
  where the file is untracked), proven by a second session starting with `queue-rank` reporting
  the baseline current.
  Criticality: high — same failure class as point 629 and the same cost: it destroys work
  that is already done, and it fires while the pool is busiest. Bundle: Session- & Repo-Hygiene.

- [ ] 647. A full-suite red on the 629 branch whose test nobody can name (11.08.2026, 18:03,
  on `feat/629-cleanup-spares-live-worktrees`). One test in a full `npm run test:unit` run
  failed; the run's output was truncated before the name was read, and no vitest report
  artifact is kept in the repository, so the test cannot be recovered from the run. It is
  filed rather than explained, because point 640 forbids the other closings: the same test
  set had been green four minutes earlier and has been green 5/5 since, and that covers
  nothing.
  THE ONE CANDIDATE, RECORDED AS A HYPOTHESIS AND NOT AS A CAUSE. In that same window the
  author found and fixed a genuine sub-millisecond `mtime` vs `Date.now()` race in a test he
  had just written (`f5a6feb8`, the index-refresh case). It is the only nondeterminism known
  to have been introduced in that window, so it is the first thing to test — but nothing ties
  it to the red beyond the coincidence of timing.
  FINAL STATE, TWO HALVES. (a) The red is named: either the candidate above is confirmed by
  reproducing a failure with the pre-`f5a6feb8` test and showing it absent after, or another
  cause is found; if neither is reachable, this point closes by RECORDING that the run is
  unrecoverable and naming what was changed so it cannot happen again. (b) The reason it is
  unrecoverable is removed: a full unit run keeps a machine-readable report of which tests
  failed (vitest's own reporter into a git-ignored path is enough), so the next red of this
  kind is answerable from the record instead of from memory. Half (b) is what makes half (a)
  the last time this question is unanswerable.
  VERIFIABLE: for (b), a deliberately failing test leaves its NAME in the report file and a
  green run leaves a report with no failures — pinned by a Vitest case over whatever pure
  part the wiring has, plus one real run. For (a), whichever of the two closings applies,
  recorded with its evidence.
  Criticality: medium — the red is on a branch, not on `main`, and the fast gate still stands
  between it and a landing; what makes it worth a point is that it could not be ANSWERED,
  which is the condition points 455, 640 and 643 all exist to end. Bundle: Testinfrastruktur.

- [ ] 650. A review's coverage is read along with its verdict (retrospective §3.110,
  11.08.2026). `scripts/review-sol.mjs` builds the reviewer's material from the whole
  commit range and stops at a cap; past it, files are dropped and the reviewer says so IN
  PROSE ("TRUNCATED/omitted"). Point 629 was reviewed five times and every single round
  reported `worktree-cleanup.mjs` and its test tail as unseen. Nobody acted on it for four
  rounds, and the first read of that file found a defect. An absent finding over material
  that was never delivered reads exactly like a clean verdict.
  THE MECHANISM EXISTS AND ONLY NEEDS WIDENING: `review-sol.mjs` already REFUSES to print a
  record command when the reviewed range is narrower than the sha being recorded — the same
  place decides here.
  FINAL STATE: the tool knows what it actually sent. It reports the coverage next to the
  verdict — how many files went in, which were dropped at the cap — and a verdict over
  truncated material is marked PARTIAL, both on screen and in the recorded ledger entry, so
  `.claude/mechanism-reviews.jsonl` can never carry an unqualified "merge" for a change the
  reviewer only half saw. A PARTIAL review does not satisfy the criticality gate on its own;
  the uncovered paths are named, and covering them — a second run scoped to the remainder,
  or a recorded human read — is what completes it. Since the cap bites hardest on the
  longest branches, the tool also SUGGESTS the narrower range when it truncates, which is
  what actually worked on 629 and again on 649 (11.08.2026: three whole-branch rounds all
  reported `worktree-cleanup.mjs` unseen; the range cut to the last two commits delivered
  it and both test files in full, and that round found two defects the wide ones could not).
  AND THE NARROW RANGE MUST BECOME RECORDABLE, which today it is not. The tool refuses a
  record command whenever the reviewed range is narrower than the sha — rightly, since a
  record at that sha clears every commit back to the merge base. But that leaves the only
  review that SAW the material with no ledger entry at all, so a real do-not-merge over the
  decisive files exists nowhere but in a session's memory. FINAL STATE: a narrow review is
  recorded AS narrow — the entry names the range it actually covered, and it clears exactly
  that range and nothing before it. A HIGH point is then cleared by a SET of recorded
  reviews that together cover the branch, not by one entry that claims more than any single
  run could see.
  VERIFIABLE: Vitest over the pure part — a reviewer output naming truncation yields a
  PARTIAL verdict and a ledger entry carrying that flag; a full-material review does not;
  a narrow review records with its range and clears only that range; and the criticality
  gate refuses a PARTIAL as the sole clearance for a HIGH point, but accepts a set of
  narrow reviews that jointly cover the branch.
  Criticality: medium — it does not break the product, but it decides how much a review is
  worth, and every HIGH point is signed off on one. Bundle: Modell & Wächter.

- [ ] 652. The session may not assert a state it did not measure, and is handed the facts it
  OTHERWISE GUESSES (user 11.08.2026, after five wrong assertions in one attended session:
  "your playing costs this machine nothing" — the container is WSL2 on the user's own host and
  shares CPU and GPU; `/poc/` offered as a test target — a frozen tag; "the machine is quiet" —
  a snapshot taken while `.claude/batch-in-flight.json` named three delegated agents building;
  "I must wait for the lock to file the finding" — the findings carrier needs no lock. Each was
  one command away from being right, and the user had to correct every one). USER, VERBATIM:
  "Aber der Container läuft doch auf meiner Maschine und nutzt dieselbe GPU. Wenn ich meine
  Maschine auslaste, bremst das auch den Container." — "Wieso ist die Maschine ruhig, wenn die
  andere Session noch arbeitet?" — "Wenn der Batch steht, worauf musst du dann warten, um das
  als Punkt in die Warteschlange zu legen?" — "Irgendwie war fast alles, was du in dieser
  Session erzählt hast, Unsinn." — "Kannst du bei allen fünf Fehlern durch einen Mechanismus
  sicherstellen, dass sie nicht mehr passieren?"
  
  FINAL STATE:
  
  1. A new Stop guard `scripts/state-claim-guard.mjs` over a pure core
     `scripts/state-claim-core.mjs` BLOCKS the turn end when the turn's answer asserts a
     machine/run state without a reading in the SAME turn. The core takes the answer text plus
     the turn's tool calls and returns the unsupported claims; it decides nothing about truth,
     only about whether a reading was taken.
     - CLAIM CLASSES, each with the readings that satisfy it (German AND English wording, since
       answers are German and code is English):
       * machine load / idleness ("ruhig", "keine Last", "läuft nichts", "keine Suite", "quiet",
         "idle", "nothing is running") → `uptime`, `ps`, `pgrep`, or `.claude/batch-in-flight.json`
       * batch ownership / lock ("Lock ist frei", "der Batch steht", "die andere Session arbeitet",
         "paused", "released") → `batch-claim.mjs --status`, `batch-lock.json`,
         `.claude/batch-paused`, `batch-in-flight.json`
       * CI / deploy verdict ("grün", "rot", "der Deploy steht", "green", "failing") →
         `gh run list`/`gh run view` in this turn, or a `ci-status-guard` reading
       * built-state claims about the game ("ist gebaut", "ist nur ein Platzhalter", "existiert
         nicht") → a read under `src/`, a `grep`/`ls` over `src/`, or a test run — a DOC read
         alone never satisfies this class, which is the §7 case that went wrong.
     - The block names the claim it found, the class, and the exact command that would satisfy
       it. One line per unsupported claim.
     - It binds EVERY session, INCLUDING one that is stood down or working while the batch is
       paused. This is a deliberate exception to the house rule that guards stand down for a
       non-owner: the guard governs the session's own assertions, not batch work, and the five
       failures happened in exactly such a session. It stays off for subagent transcripts, which
       produce no user-facing answer.
     - Fail-open like every guard: no transcript, an unreadable one or a core throw lets the turn
       end.
  
  2. The STAND-DOWN message (`scripts/batch-resume-hook-core.mjs`, `scripts/batch-singleton.mjs`)
     also names what REMAINS POSSIBLE without the lock, because today it lists only prohibitions
     and that is what produced the fourth error: securing a finding with
     `node scripts/finding.mjs --record`, reading anything, answering the user, and running
     `node scripts/guard-preflight.mjs`. It states in the same breath that `.claude/batch-paused`
     stops NEW work and the launcher spawn but never cuts a running agent or suite in half.
  
  3. `node scripts/guard-preflight.mjs --for finding` reports that recording a finding needs no
     lock and is allowed while paused.
  
  4. The SessionStart block carries HOUSE FACTS the session otherwise guesses after a `/clear`,
     every one DERIVED at hook time, none hard-coded and no network call:
     - that this container shares CPU and GPU with the user's own machine (derived from
       `/proc/version` naming WSL), so its own suites and the user's playing compete;
     - the deployed test URL — the GH-Pages root serving `main` — with `/poc/` named as the
       frozen tag that is NOT what the user tests (derived from the deploy workflow and the tag
       list, not written into the hook);
     - the command that reports the deployed commit and its CI verdict, so the session fetches
       it when it needs it instead of asserting it.
  
  VERIFIABLE: Vitest over both pure cores. The claim/evidence matrix runs every class twice —
  once with its reading in the turn, once without — and asserts block/pass and the named command;
  a claim backed only by a DOC read fails the built-state class; a missing or corrupt transcript
  passes (fail-open); a stood-down session is still bound; a subagent transcript is not. The
  message texts are asserted verbatim, and the derived house facts are tested against a fake
  `/proc/version` and a fake tag list rather than the live machine.
  
  CRITICALITY: HIGH (a guard). Needs the other model's recorded review per
  `scripts/mechanism-review.mjs --record` before it may end a turn, and the wiring in
  `.claude/settings.json` needs an attended session.

- [ ] 653. Every acceptance criterion's detail section is bound to the code it describes (user
  11.08.2026: "Ja, natürlich teste ich von der Kommunikationsmechanik nur den aktuellen Stand.
  Den habe ich ja selbst spezifiziert und dich bauen lassen und für den bauen wir bald die 0.3.
  Bevor die gebaut wird, will ich ihn testen."). MEASURED: `docs/acceptance-criteria-detail.md` §7 still describes the OLD
  placeholder — the village elder handing out a glossary and direction words, plus the §13.4
  notice that the real mechanic is undecided, "do not build on them — and do not PROTECT them
  either" — while the user's specified mechanic is built and deployed on `main`:
  `src/communication/` with `lexicon`, `speaking`, `heard`, `speechLabel`, `speechTarget`,
  `spokenGesture`, `drumMessage` and `chiefReply`, and the teaching adults and children of the
  Bambara village. That section is the text a closing and a version tag read as PROOF, so a
  stale one signs off a built mechanic as a placeholder and invites the next change to sacrifice
  it. Nothing in the repository notices, because no rule ties the section to the code.
  
  FINAL STATE:
  
  1. Every numbered section of `docs/acceptance-criteria-detail.md` carries a machine-readable
     header declaring the source paths it describes and the revision it was last checked
     against — the same shape the graphics-detail doc and the retrospective already use
     (`src/config/qualityDoc.test.ts`, `scripts/retro-currency-guard.mjs`).
  2. A Vitest FAILS when code under a declared path has moved since that revision, naming the
     section, the paths and the commits, so the section is re-read and re-stamped (or rewritten)
     in the same commit as the code change.
  3. A section that declares NO path fails as well: no silent exemption, and a criterion whose
     subject genuinely has no code (e.g. build/lint hygiene) declares that explicitly instead.
  4. §7 and its short form in `CLAUDE.md` §7.1 point 7 are brought to the built state as the
     first application, with what is REALLY still open from `design.md` §13.4 (the invented,
     researched language per region) left standing as a clearly bounded remainder; the evidence
     chain in `docs/acceptance-evidence.md` §7 points at the tests that actually cover
     `src/communication/`.
  
  VERIFIABLE: Vitest against a fixture — a section whose paths moved after its stamp fails, one
  whose paths did not passes, a pathless section fails, and a section naming a path that does
  not exist fails loudly rather than passing vacuously. The real repository run is the gate; the
  initial stamping pass is part of this point, so it lands green.
  
  Note the cost honestly: the path map is written once for all 32 criteria, and the mechanism
  catches "the text is STALE", not "the text is WRONG" — a section rewritten carelessly still
  passes. It would have caught this case, because `src/communication/` is young and the section
  is old.

- [ ] 668. The landing gate proves the charges only while the point is still open (measured
  13.08.2026 at the 657 landing). `land-point.mjs` runs its fast gate BEFORE the tick, so the
  charges rule of `scripts/render-verify-core.test.mjs` ("charges only points the work order
  still holds OPEN") is proven on a state where the landing point is still open — and turns red
  only at the main push, AFTER tick and archive move are committed locally. The chain then stops
  at "push" and leaves the tick unpushed; the repair (move the charge to its heir, as 666 was
  filed to receive 657's residual) is obvious but manual and after the fact.
  FINAL STATE: the tick step itself refuses to tick a point while any `RED_CHARGES` entry in
  `scripts/render-verify-charges.mjs` still names it, and the refusal names the remedy (move the
  charge to the heir point, or drop it with its evidence). A Vitest case pins the refusal (a
  charge on the landing point blocks the tick; a charge on any other point does not).
  Criticality: low — the defect is loud and self-explaining at the push; this removes the manual
  after-the-fact repair, nothing else.

- [ ] 670. A filtered gate chain destroys the evidence its own suspect record demands (measured
  13.08.2026 while verifying point 651). The gates were run as one chain whose suite call ended
  in `| grep -E "PASS|FAIL" | tail -2`. The suite went RED on its first attempt and green on the
  retry, so the harness recorded the run SUSPECT — correctly, per point 640, which then demands
  the red be closed by a NAMED CAUSE. The cause was unknowable: the filter had thrown away the
  first attempt's output, and `throttle-probe` cannot even be aimed, because it requires the
  `--section` of the check that reddened. A rule the house already holds ("a bundled shell chain
  must never hide its failing step", CLAUDE.md §6) had no mechanism, so it was broken by the
  session that wrote it down.
  FINAL STATE: a verification run's OWN output is never the thing that gets filtered. The suite
  runner writes its full output to a file under `local/` whatever the caller does with stdout —
  the caller may filter its console freely once the record on disk is complete — and the SUSPECT
  record names that file, so the next session reading "closed by a cause" has the cause to read.
  A Vitest case pins that the runner writes the log and that the suspect record carries its path.
  VERIFIABLE: the unit-layer case above, plus a live run whose retried suite leaves a readable
  first-attempt log naming the check that failed.
  Criticality: low — it costs a re-run, but it is the difference between closing a red by its
  cause and closing it by a green, which is exactly what point 640 forbids.

- [ ] 676. An authoring lane must survive the session that spawned it (specified 13.08.2026 by
  the blind-parallel four-eyes stage of CLAUDE.md §6; the counted union, the final proposal and
  the rejected alternatives are `docs/handover-architecture.md`). TWO RULES OF THIS HOUSE
  CONTRADICT EACH OTHER TODAY: the pool runs up to three authoring lanes, and the session hands
  over on context — but every lane a session spawned dies with that session, so a session that
  keeps the pool busy can hand over only by throwing its own work away. Point 675 closes the
  three MECHANICAL defeats of the handover on today's mechanics; this point builds the plane
  underneath, so that a lane stops belonging to a session at all.
  FIRST STEP, BEFORE ANY CODE: the merge of the two blind lists is RE-RUN by the model that wrote
  NEITHER of them. The recorded merge was performed by list B's author while a third model
  existed, which is exactly the anchoring the rule forbids; the deviation is named in the
  document, and inheriting it silently would make every entry below unaudited. The re-merge is
  recorded with `scripts/mechanism-review.mjs --merged-by` and may add, drop or re-word entries —
  what it settles is what this point implements.
  FINAL STATE, as the union settles it: authoring runs as DAEMON-OWNED detached workers under a
  model-neutral adapter (`scripts/detached-agent.mjs`) whose reference implementation is the
  already-detached `scripts/author-sol.mjs`; an Agent-tool child stays session-bound and is
  declared NON-transferable, blocking a boundary until it finishes or is safely stopped. The
  coordinator plane is short-lived and split into dispatcher and lander epochs, holding one
  renewable batch lease whose epoch FENCES every mutation, so two sessions can never adopt the
  same batch. Coordination state is an append-only checksummed journal beside the repository with
  an atomically replaced snapshot for fast resume, and every point carries an explicit state
  (queued, running, checkpointing, ready-for-review, landing, landed, failed, stalled,
  cancelled). A successor adopts supervision by STABLE JOB IDENTITY — never by process
  reparenting, never by PID alone — after reconciling every recorded lane against journal,
  worktrees and local/remote SHAs, and quarantining what it cannot prove. Refill comes only from
  a bounded, pre-authorized queue behind a global three-lane cap and a completed-review backlog
  limit, with a journalled REASON whenever three eligible lanes exist and fewer run. Landing stays
  serial behind a batch-wide landing lock with a crash-recoverable staged journal, and the
  main-session picture judgments are persisted as evidence a worker may never substitute.
  Drain-before-boundary REMAINS as the explicit degraded mode whenever any active lane is not
  transferable.
  BUILD IT IN THE UNION'S ORDER (schemas and invariants, durable store, daemon plus the Sol
  adapter, transferable declarations and fencing, bounded dispatch, checkpoint barrier, boundary,
  successor reconciliation, landing journal, board projection, metrics), each step green on the
  unit layer before the next, and roll out with the Sol adapter ALONE until the failure drills
  pass.
  VERIFIABLE: the unit cases the union names per step; the failure drills — worker crash, stall,
  push failure, dirty worktree, marker deletion, daemon restart, corrupt snapshot, PID reuse,
  duplicate coordinator, remote outage, checkpoint timeout — each run through the daemon's drill
  command; and a measured trial against a recorded baseline day, whose success needs ZERO safety
  incidents (no lost attempt, no duplicate writer, no overlapping lease, no silently missed
  boundary), a median handover context materially below baseline, and points landed per day no
  worse than baseline. Utilization is supporting evidence, never the acceptance test on its own.
  MECHANISM REVIEW REQUIRED (CLAUDE.md §7.2) per step, not once at the end.
  Criticality: high — it owns the batch's dominant cost and every lane's durability, and a defect
  here loses work rather than merely slowing it.

- [ ] 677. A guard run by hand hangs forever on its own stdin (measured 13.08.2026, 19:20). The
  house rule says to ASK THE GUARDS BEFORE THE ACTION (CLAUDE.md §7.2), and a session that does
  so directly — `node scripts/tasks-spec-guard.mjs` — never comes back: the wrapper reads the
  hook payload with `readFileSync(0, 'utf8')`, which BLOCKS while stdin is an open terminal or an
  inherited pipe, and the `try/catch` around it never runs because nothing ever throws. Two
  instances were found alive in this container, one of them 34 minutes old, both from a session
  that only wanted to check itself; the same shape sits in about 25 enforcers (`ci-status-guard`,
  `dashboard-guard`, `board-first-guard`, `closing-guard`, `queue-order-guard`, the batch guard
  and the rest). Under a Stop hook the payload always arrives, so the wiring is fine — it is the
  MANUAL run the rule itself prescribes that hangs, and `< /dev/null` makes the very same command
  exit 0 immediately.
  FINAL STATE: one shared helper reads the hook payload and returns EMPTY instead of blocking
  whenever stdin is not a readable, already-open non-TTY — a TTY, a closed descriptor or nothing
  attached all yield "no payload", which every caller already handles as a manual run. A bounded
  read guards the remaining case so an inherited-but-silent pipe cannot hang either. Every
  enforcer that reads stdin today uses it; none keeps a private copy.
  AN ABSENT PAYLOAD MUST NOT READ AS A FOREIGN SESSION (measured 19.08.2026, the second half of
  the same defect — there the handrail hangs, here it lies). `node
  scripts/mechanism-review-guard.mjs --status` answers "stands down: another live session owns the
  batch lock" while THIS session holds it: the wrapper takes the session id from the payload alone,
  so without one it is empty, and `heldByOtherLiveOwner('')` is TRUE. There is no `--session` flag
  and `CLAUDE_SESSION_ID` is not read, so only `echo {"session_id":"…"} | node …` tells the truth.
  The shared helper therefore falls back to the environment and to the lock when no payload
  arrives, a `--session` flag names the session explicitly, and the stand-down check distinguishes
  UNKNOWN from provably foreign — unknown may never stand a guard down. The same ~25 enforcers are
  affected.
  VERIFIABLE: a Vitest case per branch of the helper (TTY, closed stdin, valid JSON payload,
  non-JSON payload, an open pipe that never writes) proving it returns rather than blocks; a
  repository check that no enforcer calls `readFileSync(0, …)` outside the helper, so the shape
  cannot return; and a live manual run of two guards from an interactive shell, each returning
  its verdict.
  Criticality: medium — nothing is corrupted, but it burns a session's turn and leaves stuck
  processes behind, and it fires exactly on the session that follows the rule.

- [ ] 678. A lane is routed to when it has nothing left, and what dies there is rescued by hand
  (measured 13.08.2026, 20:0x, on point 675). The routing names Fable 5 as the ESCALATION lane for
  work Opus authored and Sol still rejects after a re-work (`scripts/author-routing-core.mjs`), and
  it does so without ever asking whether that lane still has volume. Today the Fable author built five commits of the
  handover mechanism, two cross-vendor review rounds deep, and was then terminated mid-answer by
  the provider's limit — with ELEVEN files uncommitted in its worktree, among them a recorded
  review. Nothing in the machinery noticed: the agent reported a failure, its worktree still held
  the work, and the only reason none of it was lost is that the supervising session opened that
  worktree and looked. Any escalation the routing names next walks into the same empty lane, so the
  same death stays queued.
  MEASURED AGAIN 17.08.2026, 23:1x–23:2x (read-only), and it moves the weight of this point from the
  routing table to the SERVING chain. Of 538 Fable commits, 491 sit directly on `main` — they come
  from the serving role, not from a delegation; of 268 point merges only 11 branches carry any Fable
  commit at all, and the `Author lane:` override appears 0× in the work order. The user's usage page
  shows SEPARATE weekly pools ("all models" 15 %, Fable 22 % after ~13 h), and the Fable share was
  spent in ONE block: a batch session committed as Fable 5 from 10:00 to 14:36, then as Opus 5 from
  15:13. CAUSE CANDIDATE, not proven: `buildSpawnArgs` (`scripts/batch-autostart-core.mjs`) starts
  EVERY session with `--model claude-opus-5[1m] --fallback-model claude-fable-5`, so a brief Opus 5
  outage at spawn puts a multi-hour session on the scarcest pool. The evidence gap is the load-bearing
  part: neither `.claude/autostart.log` nor `.claude/batch-launcher.log` records WHICH model a session
  runs on or whether the fallback fired — the commit trailers are the only trace, and they appear
  hours in. NARROWED 19.08.2026 by the user's ruling, which strikes the quota reading this point
  once carried: an exhausted Opus pool cannot leave a Fable pool standing, so QUOTA IS NOT A ROUTE
  to the fallback — `SPAWN_FALLBACK_MODEL` exists for UNREACHABILITY alone, and reordering the chain
  to save quota is ruled out. What survives is the OBSERVABILITY half, and it survives intact: no log
  records which model a session came up on, so the Fable block of 17.08. (10:00–14:36) still cannot
  be told apart from a hand-set model — the window that read it was on Fable because a VS Code
  setting said so, not because a fallback fired. Part (3) below is exactly that fix. Measured in the
  same reading, on what the lane is actually spent on: of 461 review records Fable is the MERGER in 3
  and the REVIEWER in 190, but every one of those falls on or before 13.08., when the cross-vendor
  rule moved reviewing to Sol. Classifying all 235 Fable commits since 01.08. by where they sit
  REVERSES the 17.08. weighting this point opens with: 179 of them (76 %) are on merged FEATURE
  branches, only 43 direct on `main`, and two points ate more than half — 714 with 87 and 700 with
  39. Under the current policy the serving share is the MINORITY and the escalation lane is the
  consumer, so the load-bearing fixes are the threshold and its round-level twin, not a reordered
  chain. The merger role consults no lane function and is untouched by either — it must stay that way.
  FINAL STATE, three halves from two incidents:
  (1) A LANE HAS AN AVAILABILITY SWITCH and the routing consults it, the way `scripts/sol-share.mjs`
  already gates the Sol lane. A lane marked unavailable does not receive work: the routing falls
  to the next model of the CLAUDE.md §6 chain and NAMES the fall in its verdict, so a session
  reading `--routing` sees "fable → opus 5, lane unavailable since <when>: <reason>" rather than a
  lane that will die on contact. Marking it is one command, and the mark carries a reason and a
  timestamp; nothing guesses a quota from the outside.
  (2) NO DELEGATED AUTHOR'S DEATH LEAVES UNCOMMITTED WORK. When a delegated author ends — finished,
  failed or killed — its worktree is INSPECTED before anything else happens to it: an uncommitted
  or unpushed state is committed as the RESCUE commit CLAUDE.md §6 already defines (`[skip ci]` in
  the subject, `Rescue: <what was interrupted>` trailer, the AUTHOR's model in the co-author line,
  never the supervisor's) and pushed, and only then may the worktree be removed. A worktree removal
  that would discard uncommitted work is REFUSED, naming what it holds.
  (3) A SESSION KNOWS AND RECORDS WHICH MODEL IT RUNS ON, at its start rather than hours later.
  The launcher logs the model it asked for AND the one the session came up on, so the fallback
  firing is visible in `.claude/autostart.log` instead of being reconstructed from commit trailers.
  A session that finds itself on the ESCALATION lane rather than the one the chain intended says so
  in its first turn and on the board, because a multi-hour run on the scarcest pool is a decision
  nobody made. The spawn's own fallback is therefore Opus 4.8, not Fable — the scarce lane is
  reached by escalation, never by an outage.
  VERIFIABLE: Vitest over the routing (an available lane keeps its work, an unavailable one falls
  to the next chain member with the reason in the verdict, and an unknown lane name is an error
  rather than a silent pass-through); Vitest over the rescue path (a dirty worktree produces a
  rescue commit with both halves and the author's model, a clean one produces nothing, an unpushed
  commit is pushed, and `worktree-cleanup` refuses a dirty tree); plus one observed delegated run
  that is killed mid-work and whose branch afterwards carries everything the worktree held; plus a
  case over the spawn arguments asserting the fallback is Opus 4.8 and that the launcher log names
  both the requested and the actual model.
  UNTIL IT IS BUILT, the rule is operational and stated by the user (13.08.2026, 19:55): NOTHING is
  delegated to Fable 5 while its quota is out — not authoring, not four-eyes review. A hard case
  needs no substitute lane for that, because a hard case is authored by Opus 5 and only ESCALATES to
  Fable when Sol still rejects the re-work; while the Fable quota is out, such work stays with Opus.
  That instruction is what half (1) mechanises, and it expires with the quota reset while the
  mechanism does not.
  Criticality: high — it is the only failure mode on record that can destroy finished work outright,
  and it fired today.

- [ ] 680. The bug report carries the settlement's life, not only the wildlife (measured
  13.08.2026 on the user's report "Kind hängt wieder fest", `local/KindHaengtWieder/`). The
  archive holds a picture, the game state, the balance and UI values — and a WILDLIFE section
  reading "0 animals, 0 carcasses, 0 flocks", because the report was taken inside a village.
  About the child the report is ABOUT, and about every other inhabitant, it holds nothing: no
  position, no state, no tag role, no errand. The one report kind a settlement produces is the
  one the dump cannot describe, so a stuck-inhabitant report can only ever be answered by trying
  to reproduce it from the seed.
  FINAL STATE: a new bounded `placeLife` section in the state JSON, built like
  `src/systems/wildlifeDump.ts` and named in the archive listing (`.txt`) in BOTH languages,
  written whenever the report is taken in `place` mode and absent otherwise. It holds, all in
  world coordinates so it can be replayed against the layout: every INHABITANT within a stated
  radius — kind (child / adult / porter / errand walker), position, velocity, pose, and for a
  child its tag role (chaser/target/free), whether it is pinned, the seconds without progress and
  how often the unstuck nudge fired on it this visit; for an adult the errand it is on (situation
  id, target place, arrived, remaining dwell). Beside them the TAG GAME state as `__placeTag`
  reports it (playing, chaser, target, tags, chaserFor), the errand scheduler state as
  `__placeErrands` reports it (staged counts, last situation, silence), and the settlement's
  teaching GEOGRAPHY: bank, upstream, downstream, the teaching stone and every dig site. Same
  bounding discipline as the wildlife section — a stated radius, a cap, and the count of what was
  left out.
  IT MUST WORK IN A PRODUCTION BUILD. `__placeTag` and `__placeErrands` are
  `import.meta.env.DEV`-gated (`src/scenes/place/PlaceLife.tsx`), so today they are absent from
  exactly the build the player reports from. The dump therefore reads the same state through a
  channel that SHIPS — a registered snapshot callback, not a debug hook — while the DEV hooks
  stay as they are for the headless suites, and production gains no debug surface beyond the
  snapshot the report itself reads. Nothing player-visible changes; the report grows by one
  section.
  VERIFIABLE: Vitest over the pure dump builder — a settlement view with more inhabitants than
  the cap yields the cap plus a correct left-out count, a child with a pinned state and a nudge
  count round-trips, and the section is absent in travel mode — plus the existing report test
  extended so the archive listing names the new section in both languages.
  AUTHOR: the OpenAI lane (Sol) fits — mechanical, bounded, and its verification is not the work.
  Criticality: medium — nothing is broken by its absence, but every stuck-inhabitant report the
  user sends is undiagnosable without it, and point 666 is waiting on exactly that.
  Bundle: Dorfleben.

- [ ] 681. The teaching stone stands on the bank upstream, and the ground work leaves the village middle (user 13.08.2026, playing the deployed state)
  User decision 13.08.2026, from playing the deployed state with the debug switch
  "Speech: show concepts instead of syllables" on: the errands taught him nothing.
  A boulder on the village square that everybody walks to for no reason, and people
  digging next to it, read as meaningless — and the settlement's rock is not the
  rock the chief's message means. docs/communication-poc-spec.md already assumes the
  stone lies upstream; only the code put it in the village (layout.ts placed it 6.5
  to 13.6 m from the village centre). This is cause (1) of the carrier finding "Die
  Erwachsenen-Botengaenge lehren nichts" (target 659); causes (2) and (3) — errands
  without a visible result, and no teaching order — stay with that finding.
  The teaching stone stands ON THE RIVER BANK UPSTREAM of the settlement, and the
  village's ground work no longer sits in the middle of the village.

  Final state:

  1. PLACEMENT. `layout.ts` places the teaching stone on the settlement's UPSTREAM
     bank stretch — on the open bank beside the water, clear of the wade depth and
     of every lane and compound, visible from the village and reachable on foot by
     an errand walker. It keeps its seeded, deterministic placement and its errand
     parking spot. A settlement with no bank carries no teaching stone (as it
     already carries no bank errands), and the two BIG_ROCK errands are then simply
     not castable.
  2. IT LOOKS LIKE WHAT THE MESSAGE MEANS. The stone is drawn as an upright erratic
     of the same shape family as the goal boulder of `src/world/communicationRock.ts`
     at settlement scale, so the object the word is learnt on is the same KIND of
     thing the chief's message points at.
  3. THE ROCK/DIRECTION DISCRIMINATOR IS REBUILT — this is why the old placement
     existed, so moving the stone must replace it, not drop it. With the stone on
     the upstream stretch, "go upstream" and "go to the rock" would otherwise be the
     same picture. Therefore:
     - At least one BIG_ROCK errand carries NO walk along the bank at all: it is
       spoken AT the stone and points at it ("BIG_ROCK + HERE"), with nobody walking
       the river.
     - At least one BIG_ROCK errand is walked STRAIGHT from the village to the
       stone, not along the bank, so the picture differs from the upstream errands
       in its path as well as its target.
     - The UPSTREAM errands target a bank point that is NOT the stone and far enough
       from it that the two destinations read as different places.
     - `involvesUpstream`, the catalogue's comments and `MIRRORED_ERRANDS` are
       brought in line, and the tests pin the new discriminator instead of the old.
  4. THE GROUND WORK MOVES OUT OF THE MIDDLE. The three dig sites (store pit, post
     hole, turned patch) are placed where such work belongs — at a compound edge,
     beside a lane, at the edge of the worked ground — never on the open central
     ground of the village, and never within a stated clearance of the teaching
     stone or of its parking spot. The drawn spoil and the digging stick stay as
     they are.
  5. DOCUMENTATION. `docs/communication-poc-spec.md` rule 3 is rewritten to the
     discriminator actually built (it currently states the premise "The rock lies
     upstream" while the code placed the stone in the village — the two must agree),
     and the placement comment in `layout.ts` says where the stone stands and why.
     If design.md §13.4 names the stone's location, it changes in the same commit.

  Test: Vitest over the layout — the stone lies on the upstream side of the bank,
  clear of lanes, compounds and water; no dig site lies within the central radius or
  within the stated clearance of the stone; the placement is stable for a seed.
  Vitest over `adultErrands` — at least one BIG_ROCK errand with no bank walk, at
  least one walked from the village, and the upstream targets distinct from the
  stone. Picture check on BOTH backends (a render-set change): the stone is visible
  from the village and reads as a rock by the water, and the dig sites read as work.
  CONSTRAINTS:
  - Difficulty is MEDIUM, not mechanical: placement geometry, the errand catalogue
    and their tests move together, and the picture decides. Route accordingly; the
    user's 13.08.2026 instruction allows Sol where Fable is unavailable.
  - Do not drop the contrast rule while moving the stone — the rule is the reason
    the old placement existed.
  - The goal boulder of src/world/communicationRock.ts is untouched: it stays the
    world-scale erratic ~1.6 to 2.4 degrees upstream on the Niger.
  - Settlements without a bank keep working, with no stone and no rock errands.
  QUOTED:
  Nutzer, 13.08.2026 20:46: »Der Lehrstein soll flussaufwärts wandern. Ein großer Felsbrocken mitten im Dorf macht keinen Sinn - ebensowenig, wie dort zugraben.«
  Nutzer, 13.08.2026 20:41 (die Beobachtung dahinter): »dann sagt er GO_THERE BIG_ROCK und zeigt in die Dorfmitte, wo der große Felsen liegt (warum auch immer) … sie bleiben am Felsbrocken stehen und machen nichts«

- [ ] 682. The children's game is a game of tag again, and the teaching rides on it (user 13.08.2026: »Beim Kinderspiel kann ich auch nichts lernen. Ich erkenne da kein Fangspiel.«)
  User, 13.08.2026, from playing the deployed state: "Beim Kinderspiel kann ich auch
  nichts lernen. Ich erkenne da kein Fangspiel." The children read as running about
  at random and calling out instructions that do not serve the game; the tag game
  that was there originally has been diluted by the situations added to teach COME,
  THERE, FOLLOW and the rest, and the sending about looks like an end in itself.
  Measured against the code: a situation is staged every 6 s (spread 0.35) and its
  action steers a child for 5 s at pace 1.6, while the chase runs at 3.4 (runner
  3.8); six of the twelve situations make a child stand still and four more walk it.
  With four children the teaching layer therefore occupies the group nearly all the
  time, which is exactly the picture the user describes.
  The children play a RECOGNISABLE game of tag again, and the teaching rides ON
  that game instead of replacing it.

  The rule the player must be able to read without a word of explanation: one child
  is IT and chases, the others flee, whoever is caught becomes IT. Everything the
  children say serves that picture or waits for a break in it.

  Final state:

  1. THE ROUND OUTRANKS THE SITUATION. While a round is running, only situations
     whose action is what the child would be doing ANYWAY may be staged: FOLLOW
     (the caller is fleeing and is followed), THERE (pointing at the chaser while
     fleeing), HERE (claimed at the moment of a catch), NO (a refusal, which costs
     no movement). The SENDING situations — COME's gathering, GO_THERE's errands —
     are staged in the BREAK between rounds, where children arranging themselves is
     exactly what a game of tag looks like.
  2. NO STAGED ACTION SLOWS A PLAYING CHILD. `actionPace` no longer overrides the
     chase: a fleeing or chasing child keeps its chase speed and the situation only
     chooses the DIRECTION where the chase leaves it free. An action that makes a
     child STAND (holdTheSpot, noOneMoves, refuserStaysPut) is cast only on a child
     that is not currently chasing or being chased.
  3. THE TEACHING HAS A DUTY CYCLE, AND IT IS BOUNDED. At most one situation runs
     in a group at a time, and over the played clock at most a stated fraction may
     carry a staged action — a balance value, debug-editable, starting at one third.
     Measured today: a situation every 6 s (spread 0.35) with a 5 s action over four
     children means the teaching layer is running almost continuously, half of the
     twelve situations make a child STAND STILL and four more walk it at pace 1.6
     against a chase speed of 3.4–3.8. That is why no game is visible.
  4. THE CATCH IS THE LOUDEST MOMENT. The catch and the handover of the role are
     staged so the rule reads: the caught child claims the spot (HERE), the new
     chaser is visibly the one just caught, and the others scatter. Nothing else is
     staged in the seconds around it.
  5. EVERY CONCEPT IS STILL TAUGHT. The six stay with the children and every one
     keeps at least two situations; what changes is WHEN they may be staged, not
     which they are. The look-alike rules of the catalogue (COME against FOLLOW,
     GO_THERE against THERE) hold unchanged.
  6. DOCUMENTATION. `docs/communication-poc-spec.md` and design.md §13.4 state the
     precedence — the round is the carrier, the teaching rides on it — in the same
     commit.

  Test: Vitest over a replayed round — no standing action is ever cast on a child
  in the chase; no staged action reduces a playing child's pace; the duty-cycle
  bound holds over a long replay; every concept is still staged at least twice.
  A live section in the browser layer reports, over a minute of play, the fraction
  of clock with a staged action, the number of catches, and the fraction of clock
  in which the chaser is actually pursuing — and fails when the game is not
  recognisable by those numbers.
  CONSTRAINTS:
  - This is a DESIGN change to §13.4's children's game, decided by the user; it is
    not a tuning pass. Difficulty medium-high: catalogue, scheduler, steering and
    the tests move together, and the picture decides.
  - Do not drop a concept to buy legibility — the six must still be learnable, and
    the catalogue's look-alike contrast rules stay.
  - The stuck/trembling child is a SEPARATE defect (carrier findings on 666); do not
    fold it in here, but the legibility gate must not be measured on a group whose
    children are wedged.
  QUOTED:
  Nutzer, 13.08.2026 20:51: »Beim Kinderspiel kann ich auch nichts lernen. Ich erkenne da kein Fangspiel. Für mich laufen die Kinder mehr oder weniger zufällig hin und her (wenn sie mal nicht festhängen) und werfen mit Anweisungen um sich, die dem Spiel nicht dienlich sind. Ursprünglich war es mal ein Fangspiel, bei dem einer die anderen fangen muss und der Gefangene dadurch zum Fänger wird. Durch die ganzen neuen Situationen, die zur Erklärung der Kommunikationskonzepte COME, THERE, FOLLOW, usw. hinzugekommen sind, ist das Kinderspiel völlig verwässert. Das Herumschicken wirkt wie zum Selbstzweck eingeführt und macht das Fangspiel nicht mehr erkennbar.«

- [ ] 683. The seal lets the work order through, because it classifies by target (Sol's
  closing review of point 675, 13.08.2026, the one finding left standing by decision). After
  `batch-boundary.mjs --commit` the marker is sealed and every further repository mutation is
  denied — except the closing set, which is a list of TARGETS rather than of operations, and
  that list carries `tasks.md` and `tasks-archive.md`. They belong there for a reason: a
  blocked Stop can demand the archive move or a tick of a session that has already committed,
  and denying it would restore exactly the loop the two-phase boundary was built to close. The
  cost is that the sealed session may still append a point, rewrite a spec or tick an
  unrelated point — real work, wearing the clothes of ending — and nothing says a word.
  FINAL STATE: the work-order files stay in the closing set, but what may be done to them
  after the seal is narrowed to the ENDING operations: the tick of the point the marker names
  and that point's move into the archive. A work-order mutation that touches any OTHER point —
  a new point appended, a spec edited, a foreign tick — is DENIED with the same loud refusal
  every other post-seal mutation gets, naming the point the marker covers and the point that
  was touched. The classification therefore stops being purely by target for these two files:
  the guard reads the diff it is about to allow. `batch-boundary-core.mjs` carries the rule
  beside `CLOSING_SET_FILES`, with the comment there stating what the narrowing buys and what
  it deliberately still permits.
  A SECOND HOLE IN THE SAME SEAL, measured 13.08.2026 at 22:2x, minutes after 675 landed: the
  parallel-session hook demanded a doctor run, the seal refused it and named the way out —
  `node scripts/batch-boundary.mjs --clear`. THAT VERY CALL was refused too, with the same
  message, for as long as it carried a pipe (`… | tail -4`); bare, it went through at once. The
  segment detection reads the pipe as work and so catches the ONE command its own message
  offers as the escape. A session that follows the message and pipes, as one does, is stuck: it
  can neither work nor withdraw the seal while a Stop hook blocks the session end — the very
  clamp 675 was built against, one level up. FINAL STATE for this half: `--clear` is ALWAYS
  exempt from the seal, however the call is packaged — bare, piped, behind a `cd`, inside an
  `&&` chain — and the refusal message says so.
  VERIFIABLE: Vitest over the narrowed rule — the marker's own tick and its archive move pass;
  an appended point, an edited spec and a foreign tick are each denied by name; a work-order
  edit BEFORE the seal is untouched; and a diff the guard cannot parse fails OPEN, as every
  guard here does.
  MECHANISM REVIEW REQUIRED (CLAUDE.md §7.2): it changes the boundary seal.
  Criticality: medium — the seal holds against every other mutation, so this is the last gap
  in it rather than an open door.

- [ ] 693. The author routing recommends a lane whose pool is empty (measured 14.08.2026,
  01:33–01:40, at the start of an autonomous batch session). `scripts/author-routing-core.mjs`
  routed point 666 to Fable 5 — "tagged HIGH criticality, a hard case by definition" — and the
  delegated Fable agent died on its FIRST API call with "You've reached your Fable 5 limit". The
  routing knows only the point's text; it cannot know that the lane it names has nothing left,
  so it keeps naming it and every delegation to that lane is wasted before it starts. The
  fallback chain then walks to the next Anthropic model, which is a spend nobody chose.
  ONE HALF IS ALREADY DONE (17.08.2026, commit "State all three authoring lanes where the
  routing is described"): the texts that contradicted each other about who authors what were
  corrected, and the shortage wording that lived only in a memory file is retired with the
  emergency itself. What is left is the pool state, which no text can carry.
  FINAL STATE:
  - The routing cut reads a recorded POOL STATE beside `sol-share.json`: a small operator file
    naming, per provider, that it is exhausted and the timestamp at which its allowance resets.
    A lane whose provider is recorded exhausted is never the printed recommendation — the next
    lane is named instead, WITH the reason, so the reader sees it was a substitution and not the
    ordinary cut.
  - A missing, unreadable or lapsed file means "nothing known", and routes exactly as today. The
    exhaustion may never be inferred from silence, and it expires on its own at the reset
    timestamp rather than needing anyone to remember to clear it.
  - An author or agent run that dies on a provider limit RECORDS that provider as exhausted
    before it exits, so the next session does not repeat the delegation that just failed.
  - The ordinary cut of `authorLaneFor` is UNCHANGED, as the user's ruling of 18.08.2026
    (commit c3256a50) left it: a hard marker or criticality HIGH answers Sol, ABOVE the
    verification lane, so the hard and critical points go there too; Opus 5 keeps the points
    whose VERIFICATION is the work and that nothing marks hard; Fable stays the escalation for
    work the review still rejects after a re-work. This point adds a veto on an empty lane, not a
    second opinion about difficulty.
  VERIFIABLE: Vitest cases over the pure core — exhausted lane never recommended and the
  substitution named in the reason; missing, corrupt and lapsed pool file → today's routing
  unchanged; a recorded exhaustion that has not lapsed → the next lane; plus one real
  `--routing` run whose printed reason names what it applied.
  MECHANISM REVIEW REQUIRED (CLAUDE.md §7.2): it changes which vendor authors, which is the
  decision the four-eyes principle rests on.
  Criticality: medium — it wastes a delegation per hard case whenever a pool runs dry, which is
  exactly when the batch can least afford one.

- [ ] 694. The children's accepted WebGL 2 composition needs a home that survives a tick
  (found 14.08.2026 by the cross-vendor review of point 666 — Claude Opus 5 on the Sol-authored
  branch — and verified against the mechanism itself, not argued). Point 666 answered the
  player-visible standstill with a behaviour fix and settled its REMAINING WebGL 2 red by its
  option (b): a charge in `scripts/render-verify-charges.mjs` naming the composition
  (`no child walks without getting anywhere`, worst child 3, 1.29 m walked inside 0.32 m, an
  expected live rate of one run in ten), narrowed to that backend and that measured detail.
  THAT ACCEPTANCE CANNOT SURVIVE ITS OWN POINT'S TICK, and the ledger says so in its own header:
  "The moment the owning point is ticked, its entries stop clearing anything" — pinned by
  `render-verify-core.test.mjs` ("charges only points the work order still holds OPEN"). MEASURED
  on the branch before the landing: point 666 chargeable while open, NOT chargeable once ticked,
  so `npm run test:unit` would have gone red on main the moment 666 was ticked and the accepted
  red would have been uncovered from that same moment — the state point 666 was filed to prevent
  (point 640). The charge was therefore re-pointed HERE at 666's landing, and this point owns the
  composition until it has a durable answer.
  AND THE SCOPE IT INHERITED IS ALREADY TOO NARROW, MEASURED THE SAME NIGHT (14.08.2026, 03:58,
  the `polish` re-run on main, c71d6780, WebGPU): `no child walks without getting anywhere` red
  at 0.29 % of the judged time — worst child 1 at 22.2 s, 1.42 m walked inside 0.31 m, 3 of 4664
  one-second windows, and 0.00 % in the 0.5 s bursts. That is the SAME composition, on the OTHER
  backend, at a DIFFERENT measurement, so the inherited entry — scoped to WebGL 2 and to the
  exact string "1.29 m walked inside 0.32 m" — covers neither. What the evidence does and does
  NOT say about the point-666 fix (sharpened by the cross-vendor review, 14.08.2026): point 666
  measured this same composition at 0.31 % on a live-cadence replay seed BEFORE that fix existed,
  so the composition PREDATES it and today's 0.29 % is of the same magnitude — but one prior
  severity value is not a band, no post-fix incidence RATE was measured, and this point may
  therefore not assume the fix left the rate untouched. Measuring that rate is part of the work.
  AND THE VEHICLE IT INHERITS ONLY WORKS FORWARD (measured 14.08.2026, 04:36, through the real
  parser and the real recorder path, pinned by a Vitest case): a suite prints `FAIL <name> —
  <detail>`, `failedChecks` parses the detail out, and `chargeReds` reads it and STAMPS the owner
  — so a `detailMatch` entry does fire while a run is being recorded. What the record then keeps
  is name/key/kind/point; the detail is DROPPED, and 0 of 99 recorded reds carry one. So the
  ledger's own promise — "it is CHARGED to the OPEN point that owns it; the charge counts at
  once, no re-run needed", and "THE CHARGE IS READ AS IT STANDS NOW, not as it stood when the run
  was recorded" — holds for a plain `match` and NOT for a `detailMatch`: a red that is already
  recorded can never be charged afterwards. That is why the WebGPU red above stayed unexplained
  after its entry was written, and why closing it needed a deferral plus a re-run rather than the
  charge the mechanism advertises. Fail-safe in direction (an unmatched red stays loudly
  uncharged, never blessed), and it is the FIRST thing this point repairs: a measurement must be
  chargeable AFTER the fact — the record carries what the rule reads — before any acceptance is
  written on top of it. TWO
  CONSEQUENCES BIND THE ANSWER BELOW: the acceptance is BACKEND-INDEPENDENT (the artefact is
  about the one-second window meeting a live dt cadence, not about a renderer), and an
  acceptance keyed to an exact measured number CANNOT work for a stochastic artefact — every
  run mints a new signature, so the entry would never match twice. What may be accepted is a
  SHAPE (a marginal exceedance of the gate by a single event), never a check-wide blanket: the
  defect this check was built for reads 1.5 %, 22 % and 99 %, orders of magnitude away.
  FINAL STATE, one of two, decided by measurement and not by preference:
  (a) THE MEASURE IS SHARPENED so a single legitimate event can no longer read as pacing — the
      one-second window is the suspect, the GATE stays untouched at 0.25 %, and the recorded
      PRE-CURE traces are re-read to prove the sharpened measure still goes RED on the defect it
      was built for. That proof is mandatory: a measure that no longer sees the original bug is
      worse than the red it silences. The charge entry leaves the ledger with the sharpening.
  (b) THE ACCEPTANCE IS MADE PERMANENT AND EXPLICIT — a vehicle for a known, justified,
      permanently accepted red, the way `scripts/audit-check.mjs`'s ALLOW map carries an
      advisory with no upstream fix: SEPARATE from the charge ledger, which is temporary by
      construction and expires with its point, and carrying the evidence, the measured rate and
      a dated justification. It stays as NARROW as the evidence allows — this backend, this
      check, this measured signature — so every other red of the same check stays unaccounted.
      The charge entry moves into that vehicle and leaves the ledger.
  VERIFIABLE: for (a), the sharpened measure re-read over BOTH the recorded pre-cure traces (must
  go red) and the post-cure traces on both backends (must go green); for (b), the permanent entry
  plus Vitest cases pinning that a red NOT of that signature is still uncovered AND that the entry
  does not expire with any point's tick — the failure this point exists to answer.
  Criticality: medium — no player sees it; what is at stake is that the release branch's last
  children red closes by a NAMED cause instead of by a retry (point 640).
  Bundle: Dorfleben.

- [ ] 695. The render gate is blocked by reds nobody can read (measured 14.08.2026, 04:20, on
  main at b4c0bc36, while closing point 666). `render-verify-guard` counts ELEVEN recorded runs
  in its window that failed with nothing to explain them, and they belong to no work this session
  did: `settings` on WebGPU (13.08.2026, 15:24 and 23:19-23:22, 18-19 reds each), `collision` on
  WebGPU (3 reds), `flow` on WebGPU ("the run ended in a crash, not in its own report") and
  `settings` on WebGL 2. Four of them carry a red that reads "103 further result line(s) exceeded
  the capture cap — this run's reds were NOT all read". THAT ONE IS THE MECHANISM'S OWN HOLE: a
  run whose reds were never all read can NEVER be charged, because a charge matches a red's
  printed name and the names do not exist — so way (2) and way (3) of point 640 are both closed
  for it, and only the loud deferral is left. It was deferred on 14.08.2026 to land point 666,
  which is the valve working as designed and no closing at all.
  FINAL STATE: the capture cap no longer produces an uncloseable red — a run that exceeds it
  records enough of EVERY red to be chargeable (or refuses to record a verdict at all, which is
  honest), and the eleven recorded reds above are each closed the way point 640 demands: cause
  named and fixed, charged to the open point that owns it, or filed as its own point. The reds
  that are real product defects (the WebGPU async render-pipeline console error, the TRAA/MSAA
  path, the first-person ground micro-detail — the last already owned by point 603) are named
  with the point that owns each.
  VERIFIABLE: a Vitest case over the recorder proving a run past the cap still carries a
  chargeable name for every red it reports, plus `node scripts/render-verify-guard.mjs --status`
  showing no unexplained run in the window on a quiet machine.
  Criticality: high — it is the release branch's picture gate: while it stands, every turn either
  blocks or waves reds through with a deferral, which is how a real regression slips past.
  Bundle: Werkzeug.

- [ ] 696. A handed-over session kept writing, and the successor was told it was dead (measured
  14.08.2026, 07:00-07:05, while resuming point 687). The SessionStart hook told the incoming
  session "the previous owner was provably dead" and handed it the batch lock at 06:56. The
  predecessor (pid 2380442, 1 h 25 min old) was alive and went on working: it committed into the
  SAME worktree at 06:59:30 and 07:04:22, after the lock had changed hands. It had already taken
  its point boundary and transferred its in-flight declaration — so it handed over AND kept
  going, and neither its own Stop guards nor the PreToolUse fence stopped its commit or its push.
  The cost was measurable within minutes: a delegated Sol run started by the new owner saw
  foreign commits appear in its own worktree mid-run, read the point as already implemented and
  authored nothing. Two writers in one worktree is the exact failure the hard singleton exists to
  prevent. Resolved by hand with `kill -TERM`; `batch-doctor --gate` then reported consistent.
  FINAL STATE: two holes are closed, and each is closed where it is, not by a reminder.
  (a) THE LIVENESS VERDICT. Whatever `provably dead` is computed from judged a process that was
  running and committing as dead. The probe is corrected so that a live pid that is still
  producing commits is NEVER judged dead, and the failure direction is stated: a wrong "alive"
  costs a delayed spawn, a wrong "dead" costs two writers — so the probe errs toward alive.
  (`verify-owner-really-dead` in the memory records the OPPOSITE drift on the same probe, a live
  owner declared pid-reused after ~30 min; both directions come out of one mechanism and are
  fixed together.)
  (b) THE FENCE. A session that does not hold the lock must not be able to commit or push in a
  repository worktree. The fence already refuses it merge, push of main, the tick, the board
  publish and `dashboard-state.json`; a branch commit and a branch push are added to what it
  refuses, so a session that has handed over cannot write even if it is still running.
  Additionally the handover ENDS the session it hands from: after `--commit`, a predecessor that
  is still alive is stopped rather than trusted to stop itself.
  (c) AN AUTHOR'S LIVENESS IS NOT A PROCESS QUESTION (measured 18.08.2026, 05:05-05:16). The
  harness runs a delegated agent IN-PROCESS, so the only OS trace it leaves is the transient
  shell of whatever command it happens to be running: `pgrep -P <session-pid>` returned no
  children twice and a full `/proc` cwd scan over the worktree found nothing, while that author
  committed five times between 05:09 and 05:14. On the resulting "both agents are dead" reading
  the successor rescue-committed the live author's in-flight edits in BOTH worktrees and
  dispatched a SECOND author onto one of them; only that agent's own detection of the live writer
  kept two authors out of one tree. So an AUTHOR is judged by what its WORK does over a sampled
  interval — a branch tip that advances, worktree mtimes that move, an unpushed commit that
  appears — never by the presence of a process, under the same err-toward-alive tie-break as (a).
  The judgment lives in the same pure core as (a), and both the rescue path and the dispatch path
  ask it before they touch a foreign worktree.
  VERIFIABLE: Vitest cases over the pure liveness core proving a running, recently-committing pid
  is judged alive and that the tie-break falls toward alive; a case over the fence proving a
  commit and a push are refused for a session without the lock; a case proving the boundary
  commit leaves no live predecessor behind; and, for (c), a case proving a worktree whose branch
  tip advanced inside the sample window is judged ALIVE with no process evidence at all, beside
  one proving a quiet worktree of an ended session is judged dead.
  Criticality: high — this is the singleton itself. While it holds wrong, every resumed session
  can silently share a worktree with its predecessor, and the damage (a lost delegated run) is
  invisible in git.
  Bundle: Session- & Repo-Hygiene.

- [ ] 698. The children cross the traveller's line too rarely for the picture the bank round
  PROMISES (measured 17.08.2026 on `feat/687-roam-bound-fixes`; the user decided the same day to
  land the round as it stands and calibrate the density here). The round's acceptance is that the
  children play PAST the traveller, and the check that claimed it counted a crossing over the
  WHOLE simulation — roaming, gathering, running, regrouping alike — so drift while roaming
  satisfied it. Counted only while the round is actually RUNNING, three of four measured cases
  show NO child crossing at all inside the old 200 s window; over 600 s the four cases reach
  2/3/1/4 of four children, with the FIRST crossing at 251 s, 81 s, 447 s and 228 s of game time
  (bambara@42, bambara@2972259115, nubian@42, mandinka@99). A player standing at the stretch's
  middle therefore waits minutes for the thing the round exists to show. The mechanic is sound —
  this is density, not correctness, which is why it is deferred rather than blocking.
  FINAL STATE:
  - A traveller standing at the middle of the stretch sees a child pass him within a SHORT,
    stated wait — set the target as a balance value and name it here when it is chosen (a first
    guess: a crossing within ~30 s in the median case, every case under a minute).
  - It is reached through the round's OWN calibratable numbers (run length, the pause between
    runs, how the catcher picks its target, where the group re-forms) — all of them balance
    values the debug menu already edits. No new mechanism, and the round's rules do not change.
  - The measurement is the phase-coupled one: crossings counted ONLY while the round runs. The
    figures above are the baseline this point improves on, and the new figures replace them in
    the test's comment when it lands.
  ALSO OPEN, FOUND IN THE SAME MEASUREMENT: at three of the four seeds every run ended as a full
  three-tag sweep — zero arrivals, zero regroup phases — so the arrival `ROCK` call and the
  multi-run cycle effectively never play there. Judge whether the dodge is doing its job before
  calibrating the density, because a round that always ends in a sweep is also a round whose
  length is decided by something other than the numbers above.
  VERIFIABLE: the phase-coupled Vitest measurement over the same four cases, asserting the chosen
  target rather than "greater than zero"; plus the browser section's traveller check, which must
  see a child pass inside its window rather than at the end of a long one.
  Criticality: medium — nothing is broken, but the round's whole purpose is a picture the player
  currently has to wait minutes for.
  Bundle: Dorfleben.

- [ ] 699. An actor label is drawn through the landmark label behind it (seen 17.08.2026 in the
  hold-Ctrl evidence frame `verification/147-ctrl-actor-labels.png`, on WebGL 2 and WebGPU
  alike, while judging the picture of the Ctrl layer's declutter). The declutter that point 628
  delivered keeps ACTOR labels apart from one another, and the picture proves it does. It does
  not know the OTHER label layer: the italic world labels of the discovery-gated map naming
  (`§17.2`). In the frame, the box `Adult giraffe` sits on top of `Unknown landmark` and cuts
  its last letters away — the same thing the player reported about two villagers, one layer
  further out. A zoomed crop is at `local/699-actor-over-landmark-label.png`.
  FINAL STATE:
  - The declutter reasons over EVERY drawn label box, not only the actor ones: a world label and
    an actor label that would overlap are separated by the same rule that separates two actor
    labels, and neither is drawn through the other.
  - Where they cannot both be placed, the ACTOR label yields — a world label names a place the
    player is navigating by, and it is the rarer of the two; a villager's name may wait a metre.
    If the measurement contradicts that ranking, say so and rank the other way, but rank it.
  - The measurement covers it: the sampled fusion check point 628 built (`scripts/verify/
    labelFusion.mjs`) takes the world labels into its rect set, so this defect fails a check
    rather than needing an eye. It must be shown to FAIL on today's code before it passes.
  VERIFIABLE: the fusion check extended and shown red on the current frame, green after; plus
  the picture — frame 147 with no box cutting into another, judged on both backends.
  Criticality: low — both labels stay half-readable and nothing is misnamed; it is the same
  visual untidiness one layer out, found while proving the layer below it correct.
  Bundle: Chat & Tafel.

- [ ] 704. The board defeats every cache, so a reader who reloads is rate-limited out of it
  (user 17.08.2026, with the screenshot: »Was ist denn mit dem Dashboard los?« — the page showed
  "Das Board konnte nicht geladen werden … (HTTP 429)", and the source URL opened directly
  answered `429: Too Many Requests`). Measured the same day from the container: the GitHub-Pages
  shell at `…/board/` answers 200, so the page itself is served; the CONTENT is fetched by the
  browser from `raw.githubusercontent.com`, and that host is what refuses. It is a rate limit,
  not an outage, and the page makes it easy to hit: `public/board/index.html` requests the
  content as `SOURCE + '?t=' + Date.now()` with `cache: 'no-store'`, so every single load is a
  fresh unauthenticated request, and the `max-age=300` the host serves can never help. A reader
  checking the board from a phone the way this one is meant to be checked spends the quota by
  design. The cache-busting was a deliberate choice for freshness, and freshness is worth
  keeping; what is not defensible is that the page has no answer when the host says no.
  FINAL STATE:
  - The viewer stops paying for a request it does not need: the content is fetched WITHOUT the
    cache-buster so the host's own five-minute freshness applies, and a reader who reloads
    inside that window is served from the cache instead of the quota. A deliberate refresh — the
    reader asking for the newest state — may still bypass it, so nothing becomes less current
    than a reader asks for.
  - A refusal is survived rather than displayed: on 429 the page retries with a backoff, and
    while it waits it shows the last board it successfully read, marked with the time that copy
    was taken. A stale board with an honest timestamp is worth more to the reader than an error
    page, and the current message already says the right thing — that no work has stopped — but
    it says it in front of nothing.
  - The last good copy survives a reload, kept beside the reader's open-card state, so the
    fallback also covers the case where the very first fetch of a session is the one refused.
  - The rate limit is separated from every other failure in what the page says: a 429 names the
    limit and when the page will try again; a genuine network failure keeps today's wording.
  VERIFIABLE: Vitest over the extracted viewer block, the way `chat-viewer.test.mjs` already
  extracts and runs one — a 429 answer produces the retry and the cached render, a 200 replaces
  it, a first-ever 429 with no cached copy still produces today's message; plus the page loaded
  twice inside five minutes making one request, not two.
  Criticality: medium — the board is the user's only window into the batch, and it currently
  goes blank exactly when he checks it often.
  Bundle: Chat & Tafel.

- [ ] 716. A session that loses the batch lock leaves its own subagent to die mid-step (measured
  18.08.2026: the point-714 agent was building in its worktree while its parent session stood down
  after the lock passed to a successor, and the successor's brief described that live agent as
  provably dead). The stand-down path takes no boundary: it neither transfers the running agent nor
  detaches it, so the agent keeps working for a session that no longer owns the batch, and whatever
  it holds uncommitted dies with the parent process. Today it survived only because the SUCCESSOR's
  agent noticed it was alive, waited it out and pushed its six commits — a rescue nobody designed
  and nothing guarantees. The reverse cost is on record too: the successor acted on "the previous
  owner was provably dead" while that owner's agent was writing files, which is how two strands come
  to edit one worktree.
  FINAL STATE:
  - A stand-down is a BOUNDARY, not an exit. A session that loses or releases the lock while an
    agent of its own is running takes the same two-phase handover a landed point takes: the running
    work is DECLARED with its branch, worktree and pushed checkpoints, and transferred to whoever
    owns the batch next — the mechanism `batch-in-flight.mjs --adopt` already provides, driven from
    the stand-down path rather than only from the boundary.
  - The claim that an owner is dead is MEASURED before it is stated, and the measurement covers the
    owner's CHILDREN: a live worktree, a branch tip that moved, a running process. `--agent-check`
    already judges exactly this and already refuses to declare a working agent dead; the stand-down
    and the successor's orientation must ASK it instead of concluding from the lock alone.
  - A successor's orientation never describes an unmeasured agent as dead. Where the state cannot be
    read, it says so and names what to probe — an honest unknown, since acting on a wrong death is
    what puts two writers in one tree.
  VERIFIABLE: Vitest over the pure core — a stand-down with a live declared agent produces a
  transfer rather than a silent exit; one with no agent produces today's plain stand-down; an
  adopting successor sees the transferred declaration; and a dead-owner verdict is refused while a
  child's worktree or branch tip is still moving.
  Criticality: high — it is the batch singleton's blind side, and both of its failure directions
  destroy work: an abandoned agent loses whatever it has not pushed, and a wrong death sends two
  sessions into one worktree.
  Bundle: unbundled (batch autonomy).

- [ ] 718. Point 714's authoring lane is GPT-5.6 Sol from here on, its review is Opus 5, and the
  round that was running when this was decided is its LAST (user 18.08.2026, 14:30). The point had
  gone through twelve rework rounds; the ruling ends the open-ended cycle, not the work. FINAL
  STATE: point 714 carries an `Author lane: Sol` tag, so `scripts/author-routing-core.mjs` routes it
  there whatever the cut would otherwise decide, and its review runs on the Anthropic side (Opus 5)
  per the cross-vendor rule of CLAUDE.md §6 — no Sol reading its own work, and no escalation to
  Fable for this point. The round in flight at the time of the ruling is the last one: when it comes
  back, 714 is verified against the evidence that round produced and LANDED once its gates are
  green. Findings that survive it do NOT open a thirteenth round — each is carried into point 717
  (the review-material tail) or filed as its own numbered point, and named on 714's record as
  deferred WITH its destination, so nothing vanishes at the cut-off.
  VERIFIABLE: the tag stands on 714 and a Vitest case pins that the routing cut returns the Sol lane
  for it; 714 is ticked with its round count stated and every surviving finding traceable to 717 or
  to a numbered point.
  Criticality: medium — a work-order ruling; no player-visible behaviour.
  Bundle: unbundled (review tooling).

- [ ] 722. The mechanism gate's HISTORICAL backlog on main is worked off with the rebuilt planner.
  Point 721 made the debt workable — every pass has an eligible reviewer by construction and a
  recorded pass advances the per-contribution baseline — but the reading itself is multi-session
  work nobody has run, and once 721's planner covered a range the point-714 gap clause stopped
  degrading the block: the gate hard-blocks every turn end for a debt no single session can clear.
  TWO ranges are therefore owed, each unblocked at the time by 721's rule 5 ("or the range is
  explicitly re-baselined with a written justification naming every file that re-baselining leaves
  unread"), each justification and full unread-file list living in
  `.claude/mechanism-review-baseline.json` beside the baseline it moved, and THIS point is both
  justifications' tracked half:
  - `762de1c..b8baae0` — five weeks of guard work; measured 18.08.2026 after 721 landed: 34
    outstanding passes, ~3.4M characters.
  - `53feef3..ee195c7` — point 712's own 46 commits; measured 18.08.2026, 22:55: 65 outstanding
    passes, ~9.8M characters over 16 files (40 to Sol, 25 to Opus 5) out of a 222k-character diff.
    That 44x multiplication is the material assembly re-reading a file's WHOLE content at every
    commit boundary that touched it, so seven mechanism files became 9.8M; point 717's tail is the
    fix, and until it lands any guard range past a handful of commits re-creates this debt. 712's
    substance had six cross-vendor rounds and its fixes are in the tree — what the ledger lacks is
    Sol's clearing read of the FIXED content at the boundaries its round-5/6 refusals named.
  FINAL STATE:
  - Every file the two re-baselines left unread is read in authorship-cut passes against its own
    range and recorded (`node scripts/review-sol.mjs --sha <head> --since <base>` plans them; the
    reviewer per pass is the planner's, cross-vendor by construction), or is explicitly
    retired here with a reason (a doc file whose content is not a mechanism — CLAUDE.md, TASKS.md,
    docs/tasks-archive.md and the analysis docs are candidates — may be retired as non-mechanism
    material once the material assembly can exclude it, see point 717's tail).
  - The pass records land in the tracked ledger like any others, so the per-contribution baseline
    carries the progress and a later range never re-demands what a pass cleared.
  - Point 700's clean re-review is the FIRST record this work produces where it is still owed when
    this point starts (721's rule 4 named it; if a session already cleared it, that is recorded and
    this item is done).
  VERIFIABLE: `node scripts/mechanism-review-guard.mjs --status` on main reports zero outstanding
  passes for the contributions of BOTH ranges, or names only contributions this point's spec
  retired with their reasons; the criticality gate holds no open finding for point 700.
  Criticality: high — it is the four-eyes principle's actual coverage of five weeks of guard work;
  a re-baseline that unblocked the batch is honest only while this reading is owed and scheduled.
  Author lane: Sol.
  Bundle: unbundled (review tooling).

- [ ] 724. A feature branch fully contained in a SIBLING branch keeps eating a pool slot
  (measured 19.08.2026 while commissioning point 717; bundle Session- & Repo-Hygiene). The
  commission guard refused the slot because SIX open `feat/*` branches stood against a pool cap of
  three. Two of them carried nothing of their own: `feat/687-bank-game` had ZERO commits that
  `feat/687-roam-bound-fixes` did not already contain, and `feat/686-five-word-lexicon`'s only
  unique commit was a merge of `main` into itself. ONE line of development was therefore occupying
  THREE of three slots, and the cap — which exists to bound parallel work — was being spent on
  debris instead. `branch-hygiene-guard` does not see it: it tests containment in `main`, and these
  were contained in a SIBLING that had not landed either. The remaining stale branches were 2040,
  430 and 424 commits behind `main`, so their landing cost grows daily — which is the case for
  naming a dead branch early rather than at the block two weeks later.
  FINAL STATE:
  - `branch-hygiene-guard` also tests PAIRWISE containment across the open `feat/*` set: a branch
    whose tip is an ancestor of another open branch's tip (`git rev-list --count <newer>..<older>`
    is 0) is named as debris, with the branch that contains it named beside it, so the reader can
    see at a glance that deleting it loses nothing. A branch whose only unique commits are merges
    OF `main` INTO ITSELF is reported the same way and for the same reason — it carries no
    authored work either.
  - The report is a NAMING, not a deletion: an unmerged branch is never removed by a guard. It is
    listed with the one command that retires it, and the `commission-guard` slot count reports it
    as debris where it appears, so a blocked commissioning says WHICH of the counted branches are
    duplicates rather than only that the count is too high.
  - The pairwise test runs on the branch tips only, never on their full histories, so the cost
    stays linear in the number of open branches.
  VERIFIABLE: Vitest on the pure core — two branch tips where one is an ancestor of the other yield
  a debris finding naming the container; a branch whose unique commits are merges of `main` into
  itself yields one too; two genuinely divergent branches yield none; and the slot count reports
  the debris subset. No guard deletes a branch in any case.
  Criticality: medium — it wastes the pool cap and hides real parallelism, but it destroys nothing.
  Bundle: Session- & Repo-Hygiene.

- [ ] 725. The goat's release frame may still teleport the foot, and the test measures around it
  (GPT-5.6 Sol, 19.08.2026, in a review round spent as point 684's demanded real over-limit run —
  so this is a REVIEW VERDICT on landed code, not a play-session observation, and it is UNVERIFIED:
  nobody has reproduced it). The verdict on commit 9c9425a, the goat foot-planting work of point
  697, reads: `src/render/fauna.ts` clears `contact` on release but returns only a clamped release
  pose, so on the next still-in-stance frame `previous === null` recaptures the procedural endpoint
  and reproduces the same ~0.46-leg one-frame jump the change set out to remove — one frame later.
  It names the test as measuring around it: the case in `src/render/fauna.test.ts` asserts that the
  fresh pose reaches its new contact but never compares it against the PRECEDING release-frame
  position, and `stance: pose.contact !== null` keeps that very frame out of `judgeStanceSlip`, so
  the suite goes green over the jump rather than over its absence. That is the "looks-wrong-but-
  passes" shape our own rules warn about, which is why it is filed rather than dropped.
  FINAL STATE:
  - THE MEASUREMENT DECIDES THE POINT, and it comes first: the foot position is sampled across the
    release frame and the two frames around it, on a real animation, and the frame-to-frame
    distance is compared against the same threshold `judgeStanceSlip` uses. The number is recorded
    in the point's closing note whichever way it falls — a point closed by "no jump was measured"
    is a legitimate close, and the recorded number is what makes it one.
  - IF THE JUMP IS REAL, the release frame carries the foot from its held contact to the
    procedural endpoint over the frames the gait allows, so no single frame moves it further than
    the walk itself does.
  - THE MEASUREMENT WINDOW COVERS THE RELEASE FRAME EITHER WAY. Whatever the first step measures,
    a frame excluded from `judgeStanceSlip` is a frame no invariant watches: the release frame
    enters the judged set, so a future regression there fails a suite instead of passing one.
  VERIFIABLE: Vitest over the pure pose logic — a sampled sequence across a release frame whose
  per-frame displacement stays within the gait's own step, and a synthetic sequence carrying an
  injected jump on exactly the release frame that FAILS, proving the window now covers it.
  Criticality: medium — it is one frame of one animal, but a test that measures around the very
  frame it was written for hides the next regression as reliably as this one.
  Bundle: Tierverhalten.


- [ ] 728. The chat responder answers while a session owns the batch, and answers one message
  three times (user 19.08.2026, 09:00, in the board chat: »Du hast bzg. 685 jetzt dreimal
  geantwortet.«). `scripts/chat-watcher.mjs` may spawn a light responder from the chat inbox
  ONLY when no session owns the batch and no claim is honoured (CLAUDE.md §6). Measured on this
  run: the ordinary delivery path applied that rule correctly — three later polls logged
  `{"decision":"skip","reason":"owner-live"}` — but the `defer-sweep` path did not consult it at
  all and logged `{"decision":"spawn","reason":"defer-expired"}` at 08:58:04Z while this session
  held `.claude/batch-lock.json` and was working. The spawned responder (pid 2957441, one
  message) then wrote THREE replies into the board chat within 90 s, each one a complete answer
  to the same message, with four `Execution error` lines between them in
  `.claude/chat-responder-run.log`.
  FINAL STATE:
  - THE OWNER CHECK IS ONE FUNCTION, ASKED BY EVERY SPAWN PATH. The condition "no live owner and
    no honoured claim" is applied where the responder is SPAWNED, not per call site, so a path
    added later inherits it. `defer-sweep` decides `skip` with the same reason string the polling
    path already logs.
  - A DEFERRED MESSAGE IS NOT LOST WHEN THE SPAWN IS SKIPPED. It stays pending for the owning
    session, which is the session that can act on it — the message that triggered this had to be
    carried into the work order by the owner anyway.
  - ONE MESSAGE, ONE REPLY. A responder run sends AT MOST ONE reply per message; a retry after an
    execution error resumes the run without re-sending what already went out, and a second send
    for a message already answered is refused at the reply layer rather than left to the run's
    own discipline. The receipt in `.claude/chat-reply-receipt.json` is what decides it.
  VERIFIABLE: Vitest over the pure spawn decision — every spawn path (poll, defer-sweep, and a
  synthetic third) returns `skip`/`owner-live` against a live lock, returns `spawn` without one,
  and a case FAILS if a path reaches the spawn without consulting the function; plus Vitest over
  the reply layer — a second send for an already-receipted message is refused, and a run
  interrupted by an execution error re-sends nothing.
  Criticality: medium — nothing is corrupted, but the user reads the duplicates, and a responder
  running beside a live owner writes to the same chat and carrier from two processes at once.
  Bundle: Chat & Tafel.

- [ ] 729. A truthful "5 skipped" reads as a failed gate (found by the point 727 run,
  19.08.2026, and older than it). `gatesProblem` in `scripts/author-sol-core.mjs` matches the
  word `skipped` with its NOT_GREEN pattern, so a Vitest summary that honestly reports skipped
  cases — which this suite always does — is classified as a non-green gate. Both of today's
  authoring runs tripped it while their gates were green, and the supervising session then looks
  for a cause that does not exist.
  FINAL STATE:
  - THE PATTERN MATCHES FAILURE, NOT ABSENCE. `gatesProblem` reads a gate as not green on the
    words that mean a failure; a summary line reporting skipped cases beside passing ones is
    green, and a gate that genuinely did not run stays reported as not run — the two are distinct
    verdicts and neither is folded into the other.
  VERIFIABLE: Vitest over `gatesProblem` with REAL summary text — a green run naming `5 skipped`
  is green, a run with a failed file is not green, and a gate that was never executed reports as
  not run; plus a case that FAILS if the pattern is widened back to any word containing "skip".
  Criticality: low — it misreports a green run as red, which costs a diagnosis, but it never
  passes a red one as green.
  Bundle: Modell & Wächter.


- [ ] 731. The boundary prints a handover text the board gate refuses (measured 19.08.2026 at the
  point 701 boundary). `scripts/batch-boundary.mjs --prepare` prints the handover card verbatim
  with the instruction to "take this text verbatim rather than writing it again" — the reason it
  exists is that a rewritten card drifts. That text names NO point number, and `board.mjs none`
  plus the publish gate REFUSE a handover card whose reason does not name the point the batch
  picks up next. So the verbatim paste is rejected and every boundary rewrites it by hand, which
  is exactly the drift the verbatim rule prevents; two mechanisms built for the same card
  disagree about what it must contain.
  FINAL STATE:
  - THE PRINTED TEXT SATISFIES THE GATE IT IS PRINTED FOR. `batch-boundary.mjs --prepare` reads
    the head of the open work order the same way the board's queue does and names that point in
    the handover text it prints, so the paste passes the publish gate unedited. Where no open
    point remains, it prints the wording the gate accepts for that case rather than a number that
    does not exist.
  - THE TEMPLATE NAMES EVERY STEP THE CARD NEEDS (measured 19.08.2026, 17:27, at a watermark
    handover). `board.mjs none` additionally refuses the card while a now-card stands, so the
    point has to be sent back to the queue first — three steps the printed template does not
    mention, at the most expensive place in the session: its end, above the watermark, where
    nothing new may begin. The printed handover therefore names sending the now-card back as its
    first step, and the way through is the template's, not a lucky combination of two texts.
  - THE AGREEMENT IS PINNED, NOT COINCIDENTAL. The gate's requirement and the boundary's text are
    checked against each other, so a later change to either side fails a test instead of
    surfacing at the next handover.
  VERIFIABLE: Vitest over the pure text builder — the produced handover reason satisfies the same
  predicate the publish gate applies, with a case for an empty queue and a case that FAILS if the
  point number is dropped from the text.
  Criticality: low — it costs one hand-rewrite per session boundary and risks the drift the
  verbatim rule was built to stop, but nothing is lost.
  Bundle: Chat & Tafel.

- [ ] 741. A carrier entry carries its writer's situation as though it were the finding's own
  (measured 19.08.2026, 18:47). The entry of 16:38 closed with "blocked until the batch is taken
  over (a claim stands, fb439a94 holds the lock)". Re-measured, that is not true any more and was
  never true of the WORK: the change touches `scripts/dashboard-reminder-hook.mjs` alone, that
  hook is already wired in `.claude/settings.json`, so there is no settings edit, no permission
  dialog and no reason for an attended session — and the named claim is gone (`batch-claim.mjs
  --status`: no-claim). The entry was not blocked; its WRITER was, because it did not hold the
  lock. The class is general: a carrier entry outlives the situation it was written in, and a
  statement about that situation is read as fact when the entry is finally drained — here it
  would have deferred a five-line hook change to an attended session for nothing.
  FINAL STATE: a blocking note on a carrier entry names WHOSE block it is and what it can be
  re-checked against (the lock holder, the file, the guard), or it is not written at all. The
  drain reads such a note as a HINT to verify, never as a precondition, and says so where it
  shows the entry.
  VERIFIABLE: Vitest over the record and the drain — an entry whose note names its holder and
  check re-reads as a hint; an entry with a bare "blocked" claim is refused at recording time
  with the missing part named.
  Criticality: low — nothing is lost, but the cost is silent and one-sided: work is deferred that
  nothing was stopping.
  Bundle: Session- & Repo-Hygiene.

- [ ] 754. The rule corpus carries twenty-three measured defects, four of them in code that
  cannot do what its own text promises (cross-vendor review by GPT-5.6 Sol, 19.08.2026, over
  the corpus injected into every prompt, every session start and every blocked turn end:
  `CLAUDE.md`, `MEMORY.md`, `scripts/dashboard-reminder-hook.mjs`,
  `scripts/batch-resume-hook.mjs`; each entry judged on the six axes of
  `scripts/rule-review.mjs`). The corpus ages like code but without a compiler — a stale rule
  says nothing and is obeyed anyway. FINAL STATE, in four groups; each fix is verified against
  the CODE, never against the neighbouring prose:
  A. THE FOUR THAT ARE INEFFECTIVE IN CODE, and therefore first.
     `batch-resume-hook.mjs` prints "a missing id errs toward NOT resuming", but after
     `randomUUID()` it still runs `noteTopLevelSession()` and, on a free lock, `acquire()` — the
     hook must abort before both when no session id was asserted. Its "pid-bound, one-shot
     authorization" is neither: `autostartAuthorization()` checks only the marker's AGE,
     `convertPendingSpawn()` receives a bare `!!auth`, and `clearAuthorized()` consumes a fresh
     marker even after a failed or foreign takeover — the marker is bound to session, pid and
     lock generation and cleared only after a matching successful conversion. The printed rule
     "if the serving model is not one of those three, do NOT work" cannot fire at all: the hook
     reads only session id and source from the payload, never the model, so it hands the batch
     lock to a forbidden model — the serving model is checked machine-side before `acquire()`
     or proven by a bound launcher marker. And `dashboard-reminder-hook.mjs` updates
     `turnStartedAtBySession` through an unguarded read-spread-merge, so parallel prompt hooks
     can drop each other's session keys — the write becomes atomic (a lock or one file per
     session), which is what "It binds EVERY session" claims.
  B. THE INJECTED RESUME TEXT CONTRADICTS THE RULES IT QUOTES. It demands "each point on its
     OWN branch" and later "tightly-coupled same-file points TOGETHER on ONE branch"; it says
     "cross-cutting changes go directly to main" where CLAUDE.md §6 allows that only while they
     stay SMALL and delegates the rest; it says every reported defect is APPENDED as its own
     point where the standing rule is that a finding JOINS an existing bundle first; and it
     echoes "every GUI/render fix verified on WebGPU AND WebGL2" where CLAUDE.md §6 exempts
     backend-insensitive paths by `isBackendSensitivePath`. Each is brought to the binding
     wording, with the exception stated where one exists.
  C. CLAUDE.md CONTRADICTS ITSELF IN SIX PLACES. §3 says the TTS worker means synthesis "never
     blocks the game loop" and then records ~15 s without frames at WebGPU init (the true claim
     is that no synthesis JS runs on the main thread). §7.1 no. 18 demands "zero
     vulnerabilities" while naming a tolerated high advisory (the condition is zero
     UNALLOWLISTED ones). "both checks after every change" contradicts §7.2, which asks
     `audit-check.mjs` only when the lockfile moved. "LARGE regression on BOTH backends" and
     "backend coverage is UNIVERSAL" contradict the LARGE lane defined below them (all suites on
     WebGL 2, render suites on WebGPU). "design.md is the sole source of the target state"
     contradicts §7.1, where `docs/acceptance-criteria-detail.md` holds the COMPLETE wording and
     "is what governs" — the rank between the two is stated. And criteria 1, 10 and 11 lack the
     "two pointers" the same section demands of every criterion, while no. 32 states a
     retrospective status ("SSR removed", "true refraction stays OPEN") where an acceptance
     criterion must state a checkable target.
  D. THE MEMORY INDEX CARRIES RULES THAT SAY THE OPPOSITE OF THEIR OWN TEXT. `Serving-model
     watch` lists GPT-5.6 Sol among the models that may RUN the batch, where it is an AUTHOR
     lane only; `Saves are irrelevant in the PoC` contradicts acceptance criterion 28;
     `Schlafende Guards` still names the context fence as unwired, though point 700 armed it;
     `New TASKS points: one point → one commit` contradicts the push-after-every-commit and
     rescue-commit rules (the surviving rule is one point per branch, atomic thematic commits);
     `Sol authors by default` and `WebGPU untestable headless` have titles that assert what
     their bodies deny; `TASKS time tracking` is dead in practice but stands as an active rule.
     Each is either corrected or marked `WITHDRAWN — <surviving insight>`; the index's own claim
     that retired entries were DELETED is dropped, because a deleted rule cannot be recognised
     as withdrawn by anyone reading the corpus.
  VERIFIABLE: Vitest for group A — a resume-hook run without an asserted session id acquires no
  lock, a stale or foreign authorization marker is not consumed, a payload naming a forbidden
  serving model is refused before the lock, and two concurrent reminder-hook writes preserve
  both session keys. Groups B–D are text: the check is that each named contradiction resolves to
  ONE wording, asserted where a guard already reads that text (`rule-echo`, the resume body, the
  doc budget), and `rule-review.mjs --status` shows the corpus reviewed at the resulting count.
  Criticality: high for group A — one of its four defects hands the batch lock to a model the
  policy forbids, which is the breach `model-guard` exists to catch after the fact; medium for
  the rest.
  Bundle: Session- & Repo-Hygiene.

- [ ] 755. Three more mandatory Stop guards demand at the exit what the context fence forbids,
  because point 751 scoped only the four it had measured (measured 19.08.2026, 22:0x, on the
  session that landed 751 itself at 173,544 tokens). After that landing `bundle-first-guard`
  demanded the freshly filed point 754 be placed in a bundle in `docs/work-packages.md`, and the
  fence DENIED that edit as "authoring a document section" — the same mutual block 751 removed,
  in a guard that does not consult the mechanism 751 built (`scopeMandatoryDuty` +
  `gatherGuardDutyContext` in `scripts/guard-duty-core.mjs`). `queue-order-guard` has the same
  shape: ranking an appended point moves TASKS.md blocks, which the fence denies, and only the
  `--ranked` escape let that session past. `retro-currency-guard` has it twice over: its refresh
  runs, but the German prose paragraph it then demands for a new problem class and the
  beginner-guide attestation are both authoring. `dashboard-conciseness-guard` is the harmless
  case and stays as it is — a card rewrite is board work, which the fence allows, and it passed.
  FINAL STATE: every MANDATORY Stop guard asks the fenced state through the ONE shared scope, so
  a fenced session's exit hangs on no duty it may no longer discharge; the duty is handed to the
  successor through the carrier instead, exactly as 751's clause 1 requires. The guards to scope
  are `bundle-first-guard`, `queue-order-guard` and `retro-currency-guard`.
  THE SECOND RECORDED INCIDENT OF THE SAME CLASS came 20.08.2026, 01:40, at 132,255 tokens, and
  it was `bundle-first-guard` again, identically: point 757 had just been filed, the guard
  demanded its bundle line in `docs/work-packages.md`, and the fence denied that edit. There is
  no way out inside the tool set — no bundle CLI exists, and the "Not bundled" list stands in the
  same file — so the point was left in no bundle and a later session had to write the line. Twice
  in twenty-four hours makes this defect systematic rather than incidental.
  VERIFIABLE: Vitest over each of the three guard cores — past the fence each returns the
  handover verdict rather than a block, and below it blocks exactly as today — plus one case
  that ENUMERATES the mandatory Stop guards from `.claude/settings.json` and fails if any of
  them reaches its verdict without consulting `scopeMandatoryDuty`, so the next guard added
  inherits the rule instead of repeating the defect.
  Criticality: medium — it cannot corrupt the repository, but it traps the exit of exactly the
  sessions that are already over their ceiling, which is where a trapped turn is most expensive.
  A guard change is a mechanism, so it needs the other model's recorded review before it lands.
  Bundle: Session- & Repo-Hygiene.

- [ ] 756. The context fence reads the BODY of a heredoc as a command and denies the board card
  that describes the successor's next step (measured 19.08.2026, 23:04, on the session handing
  over at the fence). A `board.mjs … --text-stdin` call fed from a heredoc was refused with
  "this call would START new work (delegating a new authoring run …)": the signature it matched
  stood ONLY inside the card text in the heredoc body, never on the command line, and the card
  merely described what the successor should do. The fence documents the opposite rule itself —
  "a call is judged SEGMENT BY SEGMENT on the command itself, never on what stands inside its
  quotes" — and a heredoc body is that same case, unhandled: `scripts/command-classify-core.mjs`
  contains no heredoc handling at all, so the body's lines reach `segmentStart` as though they
  were segments of the command. The consequence lands exactly where it hurts most: at the fence,
  where the handover card is worth the most, that card cannot name the successor's way. The
  workaround was a rewording that avoids command text, which loses the one thing the card is for.
  IT IS NOT THE FENCE'S DEFECT ALONE — the segmenter is shared, and a SECOND consumer shows the
  same misreading (measured 20.08.2026, 02:06, on the session that resumed the batch): a
  `board.mjs now --text-stdin` fed from a heredoc was refused by `board-first-guard`, which named
  the heredoc's first PROSE line as the segment that changes state. The fix therefore belongs
  where this point already puts it, in `scripts/command-classify-core.mjs`, and the tests must
  cover BOTH consumers — a case scoped to `context-fence-guard` alone would pass while
  `board-first-guard` still reads card prose as commands.
  FINAL STATE: the segmenter strips heredoc bodies before any classification. A redirection of
  the form `<<WORD`, `<<-WORD`, `<<'WORD'` or `<<"WORD"` consumes every following line up to its
  terminator (a tab-indented terminator for the `<<-` form), and those lines are removed from the
  segment stream; the redirection operator itself stays part of the segment it belongs to, so the
  command that OWNS the heredoc is still classified normally. A heredoc left unterminated
  consumes to end of input rather than falling back to line-by-line classification, because
  reading a body as commands is the defect. `<<<` (here-string) keeps its current handling as an
  ordinary word.
  VERIFIABLE: Vitest over the pure segmenter and through the fence core — the real 23:04 call
  (a `board.mjs --text-stdin` whose heredoc body NAMES an authoring run) is admitted; the same
  body's text placed on the command line is still denied; a heredoc-fed command that itself
  starts work is still denied on its own invocation; the `<<-` tab-indented terminator, a quoted
  terminator, an unterminated body and a here-string each hold their stated behaviour; and a
  case pinning that a segment following the heredoc's closing terminator is classified again.
  Criticality: medium — it cannot corrupt the repository, but it silently mis-reads quoted text
  as intent in the guard that governs what a session may still do, and its failure mode is a
  refusal nobody can distinguish from a real one. A guard change is a mechanism, so it needs the
  other model's recorded review before it lands.
  Bundle: Session- & Repo-Hygiene.

- [ ] 760. The launcher's own CLI can lose its native binary, and the arming probe cannot see it
  (measured 20.08.2026). The global `@anthropic-ai/claude-code` install stood with NO native
  binary: `claude --version` answered "native binary not installed", because npm 11 refuses a
  package's postinstall by default (`allow-scripts`) and the platform-optional package was
  therefore never fetched. The launcher spawns every successor session by invoking that CLI, so
  the batch would have died at the next handover in the quietest way it can die — the launcher
  reports ARMED, the owner releases the lock, and no successor ever comes up. The arming probe
  only asks whether the task is REGISTERED; nothing executes the CLI, so "armed" today means
  "the schedule exists", not "a session can still be started". It was repaired by hand
  (`npm install -g @anthropic-ai/claude-code-linux-x64`, then the package's own `install.cjs`),
  and the CLI answers again — but nothing would have reported it, and the same npm default will
  strip it again on the next global install.
  FINAL STATE: the launcher's readiness probe RUNS the CLI. `scripts/batch-launcher.mjs`
  (and the arming path in `scripts/batch-autostart.mjs`) invoke the configured spawn command with
  a harmless argument — `--version` is enough — under a short timeout, and treat a non-answer,
  a non-zero exit or the "native binary not installed" text as NOT ARMED. A launcher that is
  registered but cannot spawn reports `armed: false` with the CLI's own output as the reason, and
  raises the same hard alert a forbidden serving model raises (`scripts/notify.mjs`), because
  both are conditions under which the batch must stop rather than pretend to continue. The probe
  result is CACHED for a few minutes so the per-tick supervision does not pay for it every time.
  VERIFIABLE: Vitest over the pure probe core — a CLI that answers a version string is armed; a
  non-zero exit, an empty answer, a timeout and the literal "native binary not installed" each
  yield `armed: false` with the reason carried through; a cached result inside its window is not
  re-run and outside it is; and a probe that throws leaves the launcher's other state untouched
  (fail-open on the probe's own bug, never a false ARMED). One case pins that the alert path is
  reached exactly once per transition into the broken state, not on every tick.
  Criticality: high — it is the single point on which unattended continuation rests, its failure
  is silent, and the guard that would have caught it is the one being built. A mechanism, so it
  needs the other model's recorded review before it lands.
  Bundle: unbundled (batch autonomy).
