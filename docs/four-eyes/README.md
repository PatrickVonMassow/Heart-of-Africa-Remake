# Raw blind halves of four-eyes stages

A blind-parallel stage (CLAUDE.md §6) is only auditable while **both raw halves still
exist**. The merged union alone cannot be re-merged, re-counted or re-reviewed: a reader
can no longer tell what either model actually wrote, and a dropped or re-worded entry
leaves no trace. This directory is where the raw halves live so that stays possible.

**Rule: a blind stage files its two halves here in the same commit as its union.** Both
the machine-readable `.json` (the exact `blind-merge.mjs` input: `id`, `file`, `defect`)
and the model's output verbatim as `.md`. Neither `local/` nor a session scratchpad is a
record — both are untracked and one of them is wiped by a reboot.

**The halves must be TRACKED here for the tooling to trust them.** `blind-merge.mjs`
and `mechanism-review.mjs` decide the merger question — who wrote neither half — from
the `model` field of these files, but only when git tracks them; an arbitrary path is
written by whoever runs the command, and a caller who may write the halves could name
authors that leave itself untainted. Tracking does not make a half unforgeable. It
makes a forgery a commit somebody can read, which is the same footing as every other
claim in the ledger.

## Counting a union against its halves

    node scripts/blind-merge.mjs --a docs/four-eyes/<stage>-blind-a-<model>.json \
                                 --b docs/four-eyes/<stage>-blind-b-<model>.json \
                                 --union <union.json> --merged-by "<third model>"

## Stage 676 — durable authoring workers and a short-lived coordinator (13.08.2026)

The union is `docs/handover-architecture.md`; work-order points 676 and 834 build from it.

| Half | Model | Entries | File |
|---|---|---|---|
| A | Claude Opus 5 | 14 | `676-blind-a-opus5.json` / `.md` |
| B | GPT-5.6 Sol | 56 | `676-blind-b-sol.json` / `.md` |

RECOVERED on 22.08.2026 from the origin session's scratchpad and `local/`, both of them
untracked; the halves had never been versioned, which is why the rule above now exists.

**Half A's own heading says Fable 5 wrote it, and that is false** — the transcript
metadata says Claude Opus 5, and Fable had stopped serving nearly three hours before the
stage began. `676-provenance.md` carries the reading. A correction filed earlier on
22.08.2026 believed the label, renamed the half to Fable's and concluded that Claude was
free to merge; that correction is withdrawn.

The consequence is the one the architecture document already stated for itself: half A is
Claude's, half B is Sol's, and the model that wrote **neither** is Fable 5 — switched off.
No third model is available, so any re-merge is the weaker two-model fallback of
CLAUDE.md §6 and is recorded as such, with its framing decorrelated.
