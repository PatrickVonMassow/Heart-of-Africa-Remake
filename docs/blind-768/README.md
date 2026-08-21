# Blind-parallel records — cutting `CLAUDE.md` to its binding sentences (work-order point 768)

**STATUS — the analysis is CLOSED.** The divergent stage (`list-A.md`, `list-B.md`) and
the counted merge (`union.json`, 56 entries, 116 input ids all accounted for) are
FINISHED and may not be re-run: no session re-opens a blind half, and no session
re-merges. `instruction.md` is what both halves received; `merge-instruction.md` is what
the merging model received.

The four-eyes DIVERGENT stage of 21.08.2026 that decided what leaves the file every
session and every delegated subagent loads before it does anything. CLAUDE.md §6 form:
two blind halves from the same inputs, then a counted merge by a model that wrote
neither list — here a same-model fallback, recorded as weaker, with the decorrelated
framing the merge command generates.

| | |
| --- | --- |
| list A | Claude Opus 5 — 60 entries |
| list B | GPT-5.6 Sol — 56 entries |
| merge | GPT-5.6 Sol (same-model fallback, `mechanism-review.mjs --mode blind-parallel`) |
| accounting | 60 A + 56 B → 56 union entries (112 merged, 3 only A, 1 only B) |
| result | `CLAUDE.md` 333 lines / 2,095 words → 188 / 1,294 by the budget tokenizer |

## The standard every surviving line was judged by

The user's own test case: §2 forbids multiplayer — would an agent, WITHOUT that line,
start building multiplayer unasked? A rule left only on one of three grounds: a GUARD
already enforces it, with that guard's actual assertion checked; it is stated more
precisely elsewhere; or no agent would break it without the line.

The staggering by firing time decided most of §6 and §7.2. A **PreToolUse** guard
refuses BEFORE the act, so its rule is safe as a bare pointer — `worktree-reminder`,
`commission-guard` and `closing-guard` each took a rule out of the file that way. A
**Stop-chain** guard fires at the TURN END, so a session can violate its rule for a
whole turn first: `branch-hygiene-guard`, `tasks-archive-guard`, `container-ask-guard`
and `render-verify-guard` all kept their preventive sentence for that reason.

## The four disagreements the stage settled

- **§3, the stuck-WebGPU escape clause.** A11 drop, B11 keep. The standing user ruling
  U6 of point 763 decides it; the clause is gone, and point 763 must not do it twice.
- **§9, the graphics-detail paragraph.** A55 drop with the assertion checked, B54 keep
  with the ground declared unavailable. `closing-guard` is PreToolUse and denies a
  version tag until `CLOSING_STEPS` entry `graphics-detail-doc` is recorded, so the
  checked ground stands.
- **§6, the worktree and pool bullets.** Same shape: checked PreToolUse assertions
  against an honest "unavailable without inspecting the guard".
- **The SPLIT question, answered with arithmetic.** A58 measured the session-only
  remainder at ~240 words and said a split does not pay; B56 measured ~700 and said it
  does. The merge counted the surviving session-only lines at **317 words**, so the file
  is NOT split into an agent-facing core and a session part. The earlier split proposal
  was justified by a 61.6-KB file with a ~19-KB agent core; that ratio no longer exists,
  and a second document would cost a second budget, a heading sweep and a new way for a
  rule to land in neither half.

## What the convergent review sent back

The cut was then reviewed by the other vendor, artefact before rationale, and came back
`do-not-merge` twice with eight findings in total. Two of them changed what this stage
had decided:

- **U25 is REVERSED.** The union removed "delegate larger mechanisms to an isolated
  worktree" on the ground that `worktree-reminder` refuses an unisolated agent start.
  It does — but a session doing the mechanism work ITSELF, on `main`, starts no agent,
  so the guard never fires and the rule had no enforcer. That is precisely the unchecked
  guard claim point 764 exists to stop, arriving from the other direction: the assertion
  was real, it just did not cover the rule. The rule is back, without the pointer.
- **U53 is NOT APPLIED.** Removing the `## 7. Acceptance` heading contradicts U8 in the
  same union, which keeps "§7 is in scope" as a pointer, and §7.2 is mandatory — so a
  scope line naming §7.1 alone puts self-verification out of scope. The heading stays
  and §2 keeps §7.

The other findings were mechanism defects rather than cut decisions: the prose check's
fence, code-span and marker handling, the §-citation extractor reading only the first
number of `§§8–10`, and a criteria assertion loose enough to stay green through the loss
of eleven criteria.

## The one union entry deliberately not applied

**U36** would have removed "Act on settled judgment. Confirm before outward-facing or
hard-to-reverse steps unless durably authorized." from §6, keeping only the faithful
reporting sentence. It was not applied, for two reasons. That bullet sits inside the
text `scripts/rule-echo-core.mjs` fingerprints as `rule:model-policy` — the source runs
from the model-policy bullet to the next blank line — so touching it would mark twelve
stamped files stale over a rule that did not change. And the ground the merge gave was
"baseline agent behaviour", the weakest of the three, for a rule about irreversible
outward-facing acts.

Two things follow from that, both open: the `rule:model-policy` source should stop at
the next bullet (`until` is already supported by the registry) so an unrelated §6 edit
stops staling twelve files, and U36 can then be applied or dropped on its own merits.
