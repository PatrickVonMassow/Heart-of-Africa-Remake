# Criticality triage and the model-diverse review

Work-order point 298. The standing rule and the mechanism that enforces it.

## The rule

Before building a feature or a point, assess **difficulty × criticality**. A
change that **must always work** is **HIGH-criticality**: a guard or gate, the
batch singleton and its lock, save/load, the deadline, anything load-bearing for
the whole system or hard to reverse.

A HIGH item gets a **model-diverse review** — either

- the primary model (Opus 5) builds and **Fable 5 reviews the PLAN before and the
  RESULT after** ("is it truly safe, does it work in ALL cases, are there
  negative side effects?"), or
- Fable builds and Opus cross-checks.

The value of the second model is its *different* blind spots, so it is never the
same model twice. Difficulty alone is not a reason to hand work to Fable — that
is the separate model policy in CLAUDE.md §6.

**Merge and tick only when the review is green.**

## The tag convention

Every new work-order point carries one line, anywhere in its block:

```
Criticality: low|med|high (one-line rationale)
```

The reader (`criticalityOf` in `scripts/criticality-review-guard-core.mjs`) is
deliberately forgiving in three ways learned from the real corpus: the tag may
sit mid-line, `medium` is accepted as `med`, and the **last** real tag in a block
wins. A tag inside quotation marks is skipped — point 298's own spec quotes the
convention it defines, and reading that as a tag would judge a point by a
sentence *about* tags.

An **untagged or malformed** tag reads as *not gated*. That is the fail-open
direction on purpose: the several hundred points that predate the convention
carry no tag, and a gate that fired on all of them would be switched off within
a day. The tag is therefore a claim the spec makes, not a lock the guard picks —
which is why the guard's refusal says *correct the point, not the ledger*.

## What enforces it

`scripts/criticality-review-guard.mjs` (Stop hook, pure core +
`criticality-review-guard-core.test.mjs`, fail-open) blocks the turn end when a
point tagged HIGH is ticked without an **answered** review by a different model.

It stands down for a paused batch, for a session that does not own the batch
lock, and on any branch other than `main` — TASKS.md is main-only and the tick
happens on main (CLAUDE.md §6), so judging a feature branch's copy of the work
order would only re-report main's own, already-cleared ticks.

The baseline is per branch and self-arms at the fork point on first run: points
ticked before the gate existed owe nothing.

### Answered, not merely recorded

Measured 30.07.2026: a delegated agent spawned its Fable-5 reviewer in the
background and then stopped. The review landed in the parent session minutes
later with verdict `do-not-merge` and two blockers — one of which would have
reddened main's unit gate the moment the branch merged. **The branch looked
reviewed and was not.**

So this gate counts a review only where its findings were acted on:

| ledger state for the point                                   | verdict |
|--------------------------------------------------------------|---------|
| no record                                                     | BLOCK   |
| record against a commit not in this history                   | BLOCK   |
| record by the same model that authored the work               | BLOCK   |
| lone `do-not-merge` **or** `merge-with-fixes`                 | BLOCK   |
| refusal, then `merge` for a **later, descendant** commit      | allow   |
| refusal, then `merge` for the **same** commit                 | BLOCK   |
| `merge` by a different model                                  | allow   |

The `merge-with-fixes` row is deliberately stricter than the MECHANISM gate
beside it (`mechanism-review-core.mjs`), where that verdict clears: there the
fixes still sit in a diff someone reads, here the point is being declared
finished.

## Recording a review

One ledger and one command serve both four-eyes gates, so a guard change that
also closes a high point is recorded **once**:

```sh
node scripts/mechanism-review.mjs --record <sha> --point <N> --model "Fable 5" \
    --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>" \
    --mode <review|blind-parallel> [--framing "<one line>"]
```

- `--point <N>` is what this gate looks for; without it the record still serves
  the mechanism gate, which selects by file path.
- `--mode` names which half of the four-eyes principle the verdict covers
  (CLAUDE.md §6) and has **no default**: a convergent `review` judges one
  artefact, `blind-parallel` covers a divergent step both models worked
  through without seeing each other's result. `--framing` records how a second
  blind run by the *same* model was decorrelated and belongs to
  `blind-parallel` alone.
- Rows written before the mode flag existed carry none. They stay valid — the
  gates never required it of a record they read, only of one they write.
- The ledger `.claude/mechanism-reviews.jsonl` is **tracked in git**: the review
  happens on a branch and the gate bites in the session that ticks it, so the
  record must make that journey. Commit it with the change it judges.
- A self-review is refused at the command *and* re-checked at the gate — the
  ledger is a file anyone can hand-edit, and a self-review in it is worse than an
  empty ledger, because the gate then reads green.

Inspect the gate with `node scripts/criticality-review-guard.mjs --status`, or
ask it before the action with
`node scripts/guard-preflight.mjs --for tick --session <id>`.

## Wiring

The guard needs one line in `.claude/settings.json`'s `Stop` chain:

```json
{ "type": "command", "command": "node scripts/criticality-review-guard.mjs" }
```

Until that line exists, the guard is recorded in `INTENTIONALLY_DORMANT`
(`scripts/guard-health-core.mjs`) with its reason — the settings file is a
protected path that always prompts, so the arming belongs to an attended session.
**Remove that entry in the same commit that adds the hook line**, or the corpus
keeps reporting a live guard as dormant.
