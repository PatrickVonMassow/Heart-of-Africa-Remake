# Blind-parallel records — cutting the per-turn document floor (work-order point 757)

**STATUS — the analysis is CLOSED, only the execution is left.** The divergent stage
(list-A, list-B) and the counted merge (`union.json`, 66 entries, every input entry
accounted for) are FINISHED and may not be re-run: no session re-opens a blind half, and
no session re-merges. What remains of point 757 is the EXECUTION — apply `union.json`
entry by entry, each cut landing in the same commit as its twin, with the account naming
a destination for every rule that moves. The five entries flagged DROPPED-NEEDS-RULING
(U6, U45 part 1, U48, U55, U65) are OUT OF SCOPE for the execution: they are questions
standing before the user, and their rules stay untouched until he answers.

The four-eyes DIVERGENT stage of 20.08.2026 that decided what leaves the three documents
loaded into every session and every subagent before any work begins. CLAUDE.md §6 form:
two blind halves from the same inputs, then a counted merge by a third model that wrote
neither list.

The floor this stage exists to lower, measured from session transcripts
(`input_tokens + cache_read + cache_creation` of the FIRST assistant response of a freshly
cleared session): **57,970 tokens** for this session, and 57.9k–58.1k across the ten
sessions before it. Of that, ~19k are our own documents — `CLAUDE.md` 46,854 B,
`MEMORY.md` 16,801 B, the global `~/.claude/CLAUDE.md` 5,093 B — and the remaining ~42k is
the harness system prompt plus tool schemas, which we do not control.

- `instruction.md` — the task both halves worked under: the measured floor, the three
  cutting axes with the criterion each cut is judged by, the list of all 39 wired guards
  the pointer-instead-of-paragraph axis needs, and the demand that nothing leaves without
  an account.
- `list-A.md` — half A by Claude Opus 5, 60 entries, with repo read access for verifying
  that a guard it proposed to lean on really fires.
- `list-B.md` — half B by GPT-5.6 Sol, 59 entries, verbatim as `ask-sol.mjs` returned it.
- `decide.txt` — what `blind-merge.mjs --a --b` computed: 0 identical pairs and **1,891
  candidate pairs out of 3,540 possible**. That ranking is noise on this material, because
  every entry shares the same vocabulary of axes, guard names and word counts; the merge
  instruction says so and sends the third model through both lists in full instead. Worth
  keeping as the record of a measurement the similarity heuristic cannot serve.
- `merge-instruction.md` — the merge task: pair by meaning rather than wording, keep
  whatever only one model saw, prefer the safer account where the two disagree,
  consolidate the invented destination files into the smallest set that holds everything,
  and correct any entry that would reduce an UNARMED guard's rule to a bare pointer.
- `union.json` — the counted union by Fable 5, the model that wrote neither list: **66
  entries; 60 A + 59 B → 96 merged, 15 only A, 8 only B, every input entry accounted for**,
  verified by `blind-merge.mjs --union`.

## What the merge decided

Three new destination files hold everything that moves: `docs/batch-owner-runbook.md`
(axis b — the batch-owner machinery no subagent ever needs), `docs/tts-architecture.md`
and `docs/render-architecture.md` (axis c — the why-history behind §3).

One correction the merge made against a half: the context fence's rule must NOT become a
bare pointer. `CONTEXT_FENCE_MODE_DEFAULT` is `'observe'` in
`scripts/context-watermark-core.mjs`, so the fence currently refuses nothing, and axis (a)
only licenses a pointer where the guard genuinely prevents the violation. Both the Opus
half and the merge verified that independently; the Sol half had proposed the pointer.

Five entries are flagged **DROPPED-NEEDS-RULING** — they are questions for the user, not
cuts any session may make on its own: retiring §3's "if WebGPU gets stuck, fall back to
plain WebGL" escape hatch; the §9 graphics detail-level closing reminder the user asked
for deliberately although a unit test already proves it; the dead `tasks-time-tracking`
memory; four checkpoint-tied memory entries whose checkpoints may be spent; and emptying
the user's own private global `CLAUDE.md` entirely.
