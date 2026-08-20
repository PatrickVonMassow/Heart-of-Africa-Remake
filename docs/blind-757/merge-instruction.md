# The merge task — work-order point 757

You are the THIRD model. You wrote NEITHER of the two lists, which is exactly why the
merge is yours: a merge is the one place in the four-eyes procedure where a finding can
disappear without a trace, and the errors of a fold are one-sided. Collapsing two entries
that were not the same LOSES a cut silently; keeping two apart that were the same costs
one duplicated line of work. So when in doubt, keep them apart.

## What the two lists are

Two models — Claude Opus 5 (list A, 60 entries) and GPT-5.6 Sol (list B, 59 entries) —
each produced a COMPLETE list of cuts for the three documents that are loaded into every
session and every subagent before any work begins:

- `CLAUDE.md` — the project build order, 786 lines / 6,585 words
- `MEMORY.md` — the user's auto-memory index, 88 entries
- `global-CLAUDE.md` — the user's private global instructions, 78 lines

Neither saw the other's list. The task both worked under is `instruction.md` in this
directory — read it, because the three cutting axes it defines are the vocabulary both
lists use:

- **axis (a)** a rule a GUARD enforces gets a pointer, not a paragraph — staggered by
  firing time: a PreToolUse guard refuses *before* the action, so its rule is safe as a
  bare pointer; a Stop-chain rule fires at the turn END and can be violated for a whole
  turn first, so those keep the text that prevents the violation.
- **axis (b)** role-specific content (the batch-owner machinery) leaves the always-loaded
  file for a document the SessionStart hook serves to the owner alone.
- **axis (c)** the why-history — measurements, dates, incident narratives — moves to a
  read-on-demand document; the binding sentence stays.

## What you produce

`union.json` in this directory:

```json
{
  "mergedBy": "Fable 5",
  "entries": [
    { "id": "U1", "from": ["A1", "B4"], "defect": "the merged cut, in one line" }
  ]
}
```

- ONE entry per cut KEPT.
- `from` names every input entry it stands for. **Every one of the 119 input ids must
  appear in exactly one `from` array.** That is the arithmetic that proves nothing was
  dropped, and `scripts/blind-merge.mjs --union` checks it.
- `defect` states the cut the way the executing session will act on it: WHAT text goes,
  WHICH axis, and the ACCOUNT — `MOVED -> <destination file>`, `COVERED -> <guard name>`,
  or `DROPPED -> <needs the user's ruling, and why>`.

## The judgments only you can make

1. **Pair by MEANING, not by wording.** `decide.txt` ranks 1,891 candidate pairs — that
   ranking is nearly useless here, because every entry shares the same vocabulary
   ("axis", "covered by", "cut ~N words"). IGNORE the ranking and read both lists in
   full. Two entries are the same cut only when they remove the SAME TEXT from the SAME
   SECTION.
2. **Where the two disagree about an account, say so in the `defect` line and pick the
   safer one.** Safer means: COVERED only where the guard genuinely fires *before* the
   violation or the rule is cheap to re-learn; otherwise MOVED. A rule neither guard nor
   destination catches must not be silently dropped.
3. **Where one list proposes something the other did not, KEEP IT.** An entry only one
   model saw is precisely what this stage exists to produce — it is not weaker evidence.
4. **Flag every `DROPPED-NEEDS-RULING` clearly.** Those become questions for the user,
   not cuts the executing session may make on its own.
5. **Judge the destinations.** Several entries name files that do not exist yet
   (`docs/tts-architecture.md`, `docs/render-architecture.md`, an owner-only batch
   document). Consolidate: propose the SMALLEST set of new destination files that holds
   everything, and name each destination explicitly in the `defect` lines that use it. A
   destination invented once per entry is how a cut becomes twelve new files.
6. **Watch for one contradiction across the two lists.** List A entry A21 warns that the
   context fence is currently in `observe` mode and refuses nothing, so its rule must NOT
   become a bare pointer until the point that arms it lands. Any entry — from either list
   — that would reduce an unarmed guard's rule to a pointer must be corrected to keep its
   preventive text. Check the mode claim yourself before acting on it.

Do not edit any document. Your output is `union.json` and nothing else.
