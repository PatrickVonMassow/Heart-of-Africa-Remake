# Raw blind halves of four-eyes stages

A blind-parallel stage (CLAUDE.md §6) is only auditable while **both raw halves still
exist**. The merged union alone cannot be re-merged, re-counted or re-reviewed: a reader
can no longer tell what either model actually wrote, and a dropped or re-worded entry
leaves no trace. This directory is where the raw halves live so that stays possible.

**Rule: a blind stage files its two halves here in the same commit as its union.** Both
the machine-readable `.json` (the exact `blind-merge.mjs` input: `id`, `file`, `defect`)
and the model's output verbatim as `.md`. Neither `local/` nor a session scratchpad is a
record — both are untracked and one of them is wiped by a reboot.

## Counting a union against its halves

    node scripts/blind-merge.mjs --a docs/four-eyes/<stage>-blind-a-<model>.json \
                                 --b docs/four-eyes/<stage>-blind-b-<model>.json \
                                 --union <union.json> --merged-by "<third model>"

## Stage 676 — durable authoring workers and a short-lived coordinator (13.08.2026)

The union is `docs/handover-architecture.md`; work-order points 676 and 834 build from it.

| Half | Model | Entries | File |
|---|---|---|---|
| A | Fable 5 | 14 | `676-blind-a-fable5.json` / `.md` |
| B | GPT-5.6 Sol | 56 | `676-blind-b-sol.json` / `.md` |

RECOVERED on 22.08.2026 from the origin session's scratchpad and `local/`, both of them
untracked; the halves had never been versioned, which is why the rule above now exists.

**The provenance of `docs/handover-architecture.md` names the wrong author for half A.**
It says list A is "by Claude (Opus 5)" and offers Fable 5 as the untainted third model.
The origin session's own commands say otherwise, verbatim: it wrote
`# Proposal A — Fable 5, written 13.08.2026 before seeing any other proposal`, and handed
the merge to Sol as `LIST A (14 entries, written blind by Fable 5)`. Half A is Fable 5's.

That mistake inverts the remedy the document prescribes for itself. Fable 5 wrote half A
and cannot merge; Sol wrote half B and did merge, which is the recorded deviation. The
model that wrote **neither** half is Claude (Opus 5) — so the re-merge is valid work for
Claude, and does not wait on the Fable switch.
