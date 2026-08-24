# Raw blind halves of four-eyes stages

A blind-parallel stage (CLAUDE.md §6) is only auditable while **both raw halves still
exist**. The merged union alone cannot be re-merged, re-counted or re-reviewed: a reader
can no longer tell what either model actually wrote, and a dropped or re-worded entry
leaves no trace. This directory is where the raw halves live so that stays possible.

**Rule: a blind stage files its two halves here in the same commit as its union.** Both
the machine-readable `.json` — the exact `blind-merge.mjs` input, a top-level `model`
naming who wrote the half beside an `entries` array of `id`, `file`, `defect` — and the
model's output verbatim as `.md`. The `model` field is REQUIRED and not decoration: it
is the field the merger question is decided from, and a half without it names no author
the merger can be checked against. Neither `local/` nor a session scratchpad is a record
— both are untracked and one of them is wiped by a reboot.

**The halves must be TRACKED here for the tooling to trust them.** `blind-merge.mjs`
and `mechanism-review.mjs` decide the merger question — who wrote neither half — from
the `model` field of these files, but only when git tracks them; an arbitrary path is
written by whoever runs the command, and a caller who may write the halves could name
authors that leave itself untainted. Tracking does not make a half unforgeable. It
makes a forgery a commit somebody can read, which is the same footing as every other
claim in the ledger.

**And the `model` field is still only a claim — its durable backing is a tracked
provenance record.** Authorship is established by the metadata of the messages that
produced the text, which lives in unversioned transcripts and can be deleted. What that
metadata can look like differs by how the half was made, and the rule names both kinds:

- **A session-authored half** is proven by the `message.model` of the assistant message
  that wrote it — quoted with line, tool-call id and timestamp.
- **A delegated half** (another model run through a wrapper such as `ask-sol.mjs`) has no
  such message; its strongest existing evidence is the DELEGATION CHAIN quoted from the
  transcript — the commissioning tool call, the wrapper's banner naming the model it
  reached, the await on the answer artefact, and the step that parsed the entries out of
  it. This is weaker than message metadata — a wrapper banner is self-reported — and is
  recorded as the delegation it is, never upgraded to a message-level reading. Closing
  that residual (an attestation from the delegate's own side) is work-order point 880's.

A CONTESTED or after-the-fact label is settled only by a provenance record filed HERE
that quotes the applicable evidence verbatim, the way `676-provenance.md` does for both
676 halves. Once quoted into a tracked record, the reading survives transcript deletion.
The same-commit filing rule corroborates only what a trailer can say: the commit's
author-model trailer backs the half THAT SESSION'S MODEL wrote — it cannot vouch for the
other model's half, which always needs its own evidence of one of the two kinds above.

What the TOOLING checks against this rule, and what it cannot: `blind-merge.mjs` counts
only halves whose `model` field is committed, which makes every author claim a readable,
attributable commit — the auditability floor — and refuses everything below it. Whether
that committed claim is also TRUE is what the provenance record above answers, and a
reader who doubts a fold checks the record, not the field. The tooling cannot read
provenance prose; the floor it enforces is deliberately the strongest machine-checkable
one, and a `model` field that no route backs does not decide a CONTESTED merger
question — contesting it is exactly what filing a provenance record is for.

## Counting a union against its halves

    node scripts/blind-merge.mjs --a docs/four-eyes/<stage>-blind-a-<model>.json \
                                 --b docs/four-eyes/<stage>-blind-b-<model>.json \
                                 --union <union.json> --merged-by "<third model>"

## Stage 676 — durable authoring workers and a short-lived coordinator (13.08.2026)

The counted union of the halves is `676-union.json` — the 22.08.2026 third-model fold,
which superseded the two fallback folds. `docs/handover-architecture.md` embeds that
same union as its table (`scripts/four-eyes-artefacts.test.mjs` pins the two identical)
and wraps it in provenance, rejected alternatives and the ordered work; work-order
points 676 and 834 build from the architecture document, and where any older copy of
the union disagrees, `676-union.json` governs.

| Half | Model | Entries | File |
|---|---|---|---|
| A | Claude Opus 5 | 14 | `676-blind-a-opus5.json` / `.md` |
| B | GPT-5.6 Sol | 56 | `676-blind-b-sol.json` / `.md` |

RECOVERED on 22.08.2026 from the origin session's scratchpad and `local/`, both of them
untracked; the halves had never been versioned, which is why the rule above now exists.
Both labels are therefore after-the-fact, so `676-provenance.md` carries the
producing-message metadata for BOTH halves, as the rule above requires.

**Half A's own heading says Fable 5 wrote it, and that is false** — the transcript
metadata says Claude Opus 5, and Fable had stopped serving nearly three hours before the
stage began. `676-provenance.md` carries the reading. A correction filed earlier on
22.08.2026 believed the label, renamed the half to Fable's and concluded that Claude was
free to merge; that correction is withdrawn.

The consequence was the one the architecture document stated for itself: half A is Claude's,
half B is Sol's, and the model that wrote **neither** is Fable 5, then under the suspension that
had begun on 20.08.2026. While that suspension lasted no third model was available, so both folds
then on record were the
weaker two-model fallback of CLAUDE.md §6, recorded as such with the framing decorrelated: first
by Sol, then by Claude, each having written one half and each having read the other — more
independence than a single fallback fold, and still not a third model.

On 22.08.2026 at 18:14 the owner asked for the Fable suspension to be lifted and for four-eyes
stages to return to Sol and Opus 5 blind with Fable folding, expressly not to be implemented as
model rules before he has seen them. The owner flipped the switch at 18:26, and the same evening Fable 5
folded this stage blind from the two versioned halves — before reading either fallback union —
and landed the counted result as `676-union.json`, superseding both fallback folds. An earlier
line here claimed the owner had confirmed the fallback as the standing position; no such ruling
was given, and it is withdrawn.
