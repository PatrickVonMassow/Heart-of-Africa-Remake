# Batch standstill baseline (point 809)

## Live 14-day run

The command was run against the main checkout on 21 August 2026:

`node scripts/batch-standstill-report.mjs --repo /workspace/hoa --since 14d --threshold-min 20 --json`

Its UTC window was 2026-08-07T11:19:38.952Z through
2026-08-21T11:19:38.952Z (336 hours). Main had 1,117 first-parent commits and
184 consecutive-commit gaps of at least 20 minutes, totalling 874,126,000 ms
(242 h 48 m 46 s). The journal had zero genuine records because this mechanism
did not exist during that window; 260 transcript files and the other declared
legacy inputs were present.

Accordingly, all 1,209,600,000 wall-clock milliseconds classified as `unknown`.
That is the result, not a failed estimate: the old inputs cannot prove whether a
commit gap held foreground work, an agent, verification, waiting, or nobody.
Backfilling work from a heartbeat, transcript existence, commit gap, or living
pid would recreate the ambiguity this mechanism removes. No removal candidate
can honestly be ranked from the 14-day aggregate until the journal accumulates.

## Reproducible measured fixtures

`scripts/fixtures/standstill-four-day.json` preserves the measured four-day
slice: 588 commits over 345,272,000 ms (95 h 54 m 32 s), with 65 gaps at the
20-minute threshold totalling 175,522,000 ms (48 h 45 m 22 s, reported as 48.8
hours). Its class totals reconcile to the entire window, including unknown time;
the unit fixture reconstructs all 588 commit instants and checks the gap count,
duration, and exact wall-clock total.

The independently decomposed 21 August incident covers
2026-08-21T08:15:29Z–09:14:05Z exactly (58 m 36 s):

- 08:15:29–09:08:03, 52 m 34 s: `blocked-by-writer-veto`. Writer session
  `593e0d2f`, pid `2156063`, retained its veto until two hours after its last
  fenced operation at 07:08:03Z.
- 09:08:03–09:14:05, 6 m 02 s: `handover-transition`, the remaining scheduler
  delay before the successor claimed ownership.

Every millisecond appears once. The owner session's last transcript line at
08:15:29Z was inside CI wait run `32462093487`; it is evidence for the trigger
carried by point 813, but it is not double-counted over the writer-veto and
handover intervals. For this decomposed hour, point 812's veto is the largest
removable class, point 811 removes the remaining scheduler transition, and point
813 makes that CI wait durable. Population-wide sizing stays unknown until new
journal evidence exists.

## Threshold

Twenty minutes is retained because it is the threshold used by the original
65-gap/48.8-hour measurement and lies five minutes above the normal 15-minute
launcher tick. A smaller number would mix ordinary scheduler jitter into the
stall list and break comparison with the baseline.
