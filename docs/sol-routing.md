# Sol routing — moving read-only work between the two vendors

Work-order point 654. We pay two vendors whose allowances run out at different
times. This is the lever that shifts load towards OpenAI **before** the
Anthropic volume is nearly spent, rather than at the last percent.

It is deliberately cheap, and the reason it is cheap is the one rule everything
here rests on: **Sol authors nothing.** No commit carries its trailer, so the
author allowlist (`scripts/model-guard-core.mjs`), the `commit-msg` hook and the
model guard are untouched, and none of the auditability machinery a role swap
would need is required. The moment Sol authors, all of that becomes necessary —
that is part B of the point, and it is not built.

## The switch

```
node scripts/sol-share.mjs --status          # what goes where right now, in one line
node scripts/sol-share.mjs --more            # one step towards Sol
node scripts/sol-share.mjs --less            # one step back towards Claude
node scripts/sol-share.mjs --set prefer-sol  # or default, or claude-only
```

| setting | review | diagnose · audit · enumerate · explain |
| --- | --- | --- |
| `claude-only` | Claude | Claude |
| `default` | GPT-5.6 Sol | Claude |
| `prefer-sol` | GPT-5.6 Sol | GPT-5.6 Sol |

`default` is today's behaviour and changes nothing. `prefer-sol` hands every
read-only kind to Sol. `claude-only` is the escape hatch for the other
direction — when the ChatGPT side is the scarce one — and it stops the review
path too: `review-sol.mjs` then sends nothing at all and hands the review to a
Claude reviewer that authored none of the range, with **no verdict**, which is
the honest state (Sol has not seen the change).

The setting lives in the **main checkout's** `.claude/sol-share.json`, which is
git-ignored: it is this machine's operator state, and a delegated agent working
in a worktree resolves the same file through git's common dir, so it reads the
setting the user actually flipped. A missing or broken file degrades to
`default` with the problem named — it can never take down the work that asked.

While the setting is off its default, the board's footer says so, so nobody
wonders why a diagnosis came back in another voice.

## Asking Sol

```
node scripts/ask-sol.mjs --kind diagnose  --brief "why did the place suite go red?" \
     --log /tmp/place.log --diff main..HEAD
node scripts/ask-sol.mjs --kind audit     --brief "…" --file src/world/river.ts
node scripts/ask-sol.mjs --kind enumerate --brief "…"        # a blind-parallel half
node scripts/ask-sol.mjs --kind explain   --brief "…" --file scripts/board-core.mjs
```

Anything piped on stdin is material too. Nothing is fetched by the model: this
container cannot create user namespaces, so codex's sandbox launcher kills every
command the model would run — the material therefore travels **with** the
request, and what does not fit the budget is cut visibly.

Four kinds, all pure text:

- **diagnose** — name the cause of a red from log plus diff. Ends in a
  `CAUSE:`/`EVIDENCE:` pair.
- **audit** — the enumerating plausibility and bug-finding sweeps. One finding
  per line, `A<n> | <file> | <the defect>`.
- **enumerate** — risk, test-case and option lists: a **divergent** stage, so
  Sol writes its own complete list from a blank page, numbered
  `B<n> | <file> | <the item>` — the very form `scripts/blind-merge.mjs` counts,
  so the half drops straight into the merge accounting CLAUDE.md §6 demands.
- **explain** — what a subsystem does, where something is handled. Prose.

Where the switch routes a kind to Claude, the command refuses (exit 3) unless
`--anyway` is given: the point of the switch is that nobody spends the scarce
allowance out of habit.

**An answer nobody gave is never reported as an answer.** A failed run, an answer
without its shape, and a model that says it could not see the material all end
the same way — one line naming the cause, the work handed back to the Claude
chain, exit 3. A caller can therefore tell "Sol answered" from "Sol did not"
without reading prose.

## What is never routed, at any setting

- Authoring a commit — the trailer names an author, and only the allowlist may.
- Driving the browser suites and **judging the picture**.
- The landing (`scripts/land-point.mjs`) and the main session's bookkeeping.

That last share answers to *reduction* (the point boundary, the brief), not to a
change of vendor.

## What the measurement says it is worth

`node scripts/measure-task-cost.mjs` now splits the verification phase into the
half that needs this machine or a pair of eyes and the half that is pure text.
Measured over 47,258 turns from 391 transcripts (03.–11.08.2026, weighted):

| | share |
| --- | --- |
| verification, of the whole spend | 41.9 % |
| — harness (runs a suite) | 46.0 % of it |
| — text (reads a log, a script, a report) | 41.8 % of it |
| — eyes (looks at a frame) | 7.5 % of it |
| — authoring (edits the verification code) | 4.7 % of it |

So the routable text half is **17.5 % of the entire spend**, and 40.7 % of the
delegated agents' own verification — which is what makes part A worth having and
what any decision about part B should be argued against.
