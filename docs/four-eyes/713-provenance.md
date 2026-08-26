# Provenance of the two blind halves of point 713

Filed after the fact, as `README.md` permits for a recovered stage. The stage itself ran
on 17./18.08.2026; the halves were rescued out of the git-ignored `local/` directory on
18.08.2026 (point 723, U16) into `docs/blind-713/`, and are filed here — as the JSON the
tooling reads plus the raw text verbatim — with this record.

## What backs each label

Neither half carries message-level metadata any more: the sessions that produced them
are gone, and the rescue copied the text without a transcript. The strongest surviving
evidence is the **work order's own contemporaneous statement**, written while both halves
existed and tracked in git ever since. Point 713 says, verbatim:

> A SECOND, BLIND SPECIFICATION EXISTS and is owed a counted merge BEFORE this point is
> built (user 17.08.2026: »Lasse Sol das auch nochmal blind spezifizieren.«). Both halves
> stand in `docs/blind-713/` (list-a, Opus 5, 14 entries; list-b, Sol, 21 entries;
> material.md, the shared input; rescued from git-ignored `local/` on 18.08.2026, point
> 723's U16)

- **Half A — Claude Opus 5.** `docs/blind-713/list-a.txt`, 14 entries, matching the count
  the work order names. The user's instruction quoted above asked Sol for the SECOND
  specification, which places the first with the session's own model, Opus 5.
- **Half B — GPT-5.6 Sol.** `docs/blind-713/list-b.txt`, 21 entries, again matching the
  recorded count, and the half the quoted instruction commissioned.

## The residual, stated rather than papered over

This is weaker than both kinds of evidence `README.md` describes: it is neither
`message.model` metadata nor a quoted delegation chain, but a tracked claim written by
the same session that wrote half A. It cannot be upgraded by re-reading anything that
still exists. It is recorded as what it is, and it is the reading the counted merge of
26.08.2026 rests on.

## Why the merge was folded a second time

`docs/blind-713/union.json` was committed on 19.08.2026 (`d7b84faa`) under a
`Co-Authored-By: GPT-5.6 Sol` trailer — an author of half B, which CLAUDE.md §6 forbids
for the fold. The union filed here was folded by Claude Fable 5, which wrote neither
half, and is the one the ledger counts.
