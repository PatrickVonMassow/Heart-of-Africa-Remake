# MEASURED STATE — Heart of Africa batch board, 17.08.2026

## What the user said (verbatim, German)
19:59: »Die Sektion Woran ich gerade arbeite ist leer. Soll das so sein?«
20:07: »Lege einen neuen Punkt an, um das Problem mit dem inkonsistenten Dashboard zu beheben.«

## The board
A GitHub-Pages page the user reads to follow long-running autonomous batch work (often from his
phone). It has a BINDING four-section structure that must not be restructured. The sections are
"Woran ich gerade arbeite" (now), "Von dir zu klären" (decisions the user must make),
"Warteschlange" (queue) and an "Erledigt"/archive part. Cards are German prose written for a
reader, not for a builder. The file `.batch-dashboard.html` in the repo root is edited through
`scripts/board.mjs` / `scripts/board-queue.mjs` and published by `scripts/board-publish.mjs` to an
orphan `board` branch (force-pushed, no history).

## The observation
- 19:59 — the now-section was EMPTY.
- 20:07 — the published board (`board 2026-08-17T17:57:23.052Z`) carried exactly ONE now-card:
    point 700, meta "19:57 · ~21:57", body "Stand 19:57 Letzte Buchhaltung: Ich ziehe die
    Einsteiger-Anleitung auf den neuen Stand nach und uebergebe dann."
- At that same moment `node scripts/batch-in-flight.mjs --status` declared THREE strands, all
  pushed, none merged:
    (1) point 700, feat/700-context-fence@4f988b03 — fourth cross-review and landing open
    (2) point 697, feat/697-goat-foot-planting@82b9bdf1 — counter-read, both-backend picture
        check and landing open
    (3) point 711, feat/711-deploy-retry@808b76a — built, gates green, counter-read and landing
        open
  with `evidence` entries of kind `branch` and `worktree`, and a `slotsFree` note.
- Nine `feat/*` branches stood open in the repository at the time.

## Rules already in force (do not re-invent, do not contradict)
- Memory rule `dashboard-multiple-now-cards`: ONE now-card PER point in active work; never the
  same point in two sections.
- Memory rule `dashboard-card-single-topic`: each card speaks strictly about its own point
  (guard-enforced).
- Memory rule `board-cli-is-not-parallel-safe`: never two `board.mjs` calls in one tool block —
  they raced and tore the file's section structure.
- The Warteschlange is already a PROJECTION: since points 590/608 it renders from the work
  order's own sequence read through `tasks-source.mjs`; the former hand-kept `order` array is
  gone, and a guard blocks a published sequence that disagrees.
- Open point 491 records what a projection cost once: `board.mjs queue <N> "<text>"` wrote the
  rendered card into the HTML alone, and the next `board-queue.mjs` run reverted 13 cards to
  stub bodies — authored German prose was destroyed and was recoverable only by luck.
- Open point 700 carries an UNDECIDED clause: `scripts/board-core.test.mjs` ("promotes, returns,
  archives and answers without a new violation") goes RED with `dup-in-section` as soon as the
  board carries an UNNUMBERED handover card instead of a numbered now-card — the audit simulates
  "the now-card back into the queue" and finds no now-card to move. It is green again the moment
  a numbered card stands there. Because the pre-push gate runs the unit layer, every commit is
  refused from the moment a session prepares its handover.
- Every Stop guard in this project stands down for a session that does not own the batch lock
  (`heldByOtherLiveOwner`) and for a paused batch (`.claude/batch-paused`), and fails OPEN on its
  own error. Decision logic is PURE and Vitest-covered in a `*-core.mjs`; the wrapper is thin I/O.
- Existing board guards enforce: conciseness, one topic per card, no false "done" claims, queue
  completeness, and the queue's agreement with the work order. (State for yourself whether any of
  them already covers the observation above.)

## The house style for a work-order point
A point states the DEFECT with its measurement, then `FINAL STATE:` as the target state only (no
"first wrong, then corrected" trail), then `VERIFIABLE:` naming the concrete test cases, then a
`Criticality:` line and a `Bundle:` line. It is implementation-ready: an agent must be able to
build it from the spec alone.
