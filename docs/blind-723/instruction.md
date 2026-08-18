# TASK — Re-judge the head of the work-order queue (point 723, blind-parallel half)

You are ONE half of a blind-parallel four-eyes stage (CLAUDE.md §6). The other model
produces its own judgment from the SAME material; neither sees the other's. Produce your
COMPLETE judgment — do not hedge toward consensus, and do not drop an unusual finding.

## Scope

The queue-head points, in their CURRENT work-order order (up to and including 597):

  623, 712, 713, 701, 707, 708, 705, 706, 710, 715, 662, 553, 596, 597

(Point 723 itself is the point being worked and is NOT part of the scope.)

## What to judge, per point

For EACH of the 14 points, exactly ONE entry with one disposition:

- KEEP — the point stands where it is; one-line reason why the place is sensible.
- MOVE — the point should move; name WHERE (before/after which point) and why.
- MERGE — the point should be merged into a NAMED sibling (specs unify final-state-only,
  the absorbed number retires to the archive with a pointer); say why the two are one work.
- DONE — the point is IN SUBSTANCE already delivered by work that landed since it was
  filed; NAME the evidence (which landed point / commit / script delivers it). Partial
  delivery is NOT done — say KEEP and note the delivered part instead.

Plus OPTIONAL extra entries (same line format, point column = "order") for cross-point
observations: ordering rationale across the whole head, bundle suggestions, a point that
subsumes another only partially, anything the per-point lines cannot carry.

## Binding constraints

- The user's same-day ranking (18.08.2026) is BINDING input: points 697, 703, 595/598,
  581, 336 stand DIRECTLY AFTER 597, reasoned "branches with started work falling behind
  main". You may propose refinements but not undo it — do not move anything behind them
  that the user pulled forward, and do not pull queue-head points past them without saying
  you are refining the user's ranking and why.
- Standing queue rules: known-bug fixes and requested extensions come before big
  finding/QA tickets; before the demo checkpoint the queue holds bugfixes and almost-done
  points first (v0.2 rule).
- A MERGE proposal must name a sibling INSIDE the scope or argue why an out-of-scope
  sibling is the right home.

## Output format (STRICT — it is machine-parsed)

One line per entry:

  <id> | <point number or "order"> | <DISPOSITION>: <one-line judgment with its reason/evidence>

Use your assigned id prefix (given in the request) with running numbers (e.g. A1..A16).
No prose outside the entry lines except a short header naming your model.
