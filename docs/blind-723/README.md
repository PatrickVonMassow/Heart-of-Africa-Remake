# Blind-parallel records — queue-head re-judgment (work-order point 723)

The four-eyes DIVERGENT stage of 18.08.2026 that re-judged the queue head (points up to
and including 597) before it is worked. CLAUDE.md §6 form: two blind halves from the same
inputs, then a counted merge by a third model that wrote neither list.

- `instruction.md` — the task both halves worked under (dispositions, binding constraints,
  output format).
- The shared material (queue order, archive tail, 60 main commits, scripts listing, the 14
  verbatim specs) was cut from TASKS.md at main `737f31b8` (lines 98–771) and is
  reproducible from git; it is not duplicated here (~76 KB).
- `list-A-raw.md` — half A verbatim as GPT-5.6 Sol returned it (15 entries; Sol ignored
  the assigned `A` prefix and labelled its entries `B*`).
- `list-A.md` — half A with the ids mechanically relabelled `B*`→`A*`; no other change.
- `list-B.md` — half B by Claude Opus 5 (18 entries, repo read access for verification).
- `decide.txt` — what `scripts/blind-merge.mjs --a --b` computed: 0 identical pairs,
  18 candidate pairs.
- `merge-instruction.md` — the merge task handed to the third model.
- `union.json` — the counted union by Fable 5 (17 entries; accounting verified by
  `blind-merge.mjs`: 15 A + 18 B → 17 union entries, 31 merged, 0 only A, 2 only B,
  every input entry accounted for).
- `head-order.md` — the resolved head order and the one-line resolution of each conflict.

The outcome was applied to TASKS.md in the same stretch of work (see the commits that
added this directory and restructured the queue head).
