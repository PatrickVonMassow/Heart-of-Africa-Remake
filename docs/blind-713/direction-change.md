# Point 713 — direction change after the fifth review round (19.08.2026)

Handed to whoever picks the point up next. The branch is
`feat/713-now-section-derived`, last pushed commit `907ee98a`; every review round
is recorded in `.claude/mechanism-reviews.jsonl` under point 713.

## Why the direction changed

Five cross-vendor rounds came back `do-not-merge`. Five of the seventh round's
findings — one of them rated critical — all hit the same place: the logic that
GUESSES which point an evidence item belongs to when a strand exits. Each round
closed one edge and opened the next (path convention, filesystem error codes, ref
normalisation, remote-tracking refs).

MEASURED on the live `.claude/batch-in-flight.json`: evidence items carry no
`point` field at all — the WRITE side never sets one. That is the root. Because
the mapping is never recorded, the exit has to guess, and every heuristic grows a
new edge.

## The direction

1. The WRITE side records `point` on every evidence item (`batch-in-flight.mjs
   --waiting-on` and every other write path). The mapping is known there and
   needs no probe.
2. The READ side migrates a legacy declaration ONCE: what it already resolves is
   persisted as `point` at the next write. After that the legacy shape is gone.
3. The EXIT filters on the recorded `point` alone. `evidenceGone`,
   `fsErrorProvesAbsence`, `pointOfWorktreePath`, `branchEvidenceGone` and the
   lstat/show-ref probes are removed WITHOUT replacement — that drops four of the
   five findings with no substitute logic.
4. An item that stays unattributable after the migration is neither guessed at nor
   silently dropped: the read side reports it loudly and the way out is the
   existing human command `batch-in-flight.mjs --clear`, named in the message.
   That answers "evidence without path or ref is a permanent wedge": a command
   solves it, and because a human types it, nothing vanishes unseen.

`point` on an evidence item is not a second record of what is in flight — it is
the normalisation of the same one, so the point's own constraint holds.

## What stays real work (fifth round, pass 2)

- `reconcileNowProjection` (board-core.mjs) drops the standalone idle card with
  `return ''`, discarding the authored handover text and the queue card with it.
  The idle→active transition must CARRY the written prose over, and the test must
  assert the surviving text rather than its disappearance.
- `nowSectionSlice` falls back to the WHOLE document when the now-section heading
  is missing. The render then treats everything as the now-section (deleting cards
  from foreign sections, inserting stubs outside any section) and
  `compareNowProjection` blesses that result through the same fallback — so the
  publish preflight, which must fail CLOSED, is open. A missing section must
  refuse, not guess.

## Note for the successor

A subagent does NOT survive the end of its session. The author working on this
direction when the watermark fired was lost with it, exactly as the previous
session's author was. Only pushed commits carry over — check the branch tip
before assuming any of the above is already built.
