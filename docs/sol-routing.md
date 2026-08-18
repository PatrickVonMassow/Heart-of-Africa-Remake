# Sol routing — moving work between the two vendors

Work-order points 654 and 667. We pay two vendors whose allowances run out at
different times. This is the lever that shifts load towards OpenAI **before**
the Anthropic volume is nearly spent, rather than at the last percent.

Point 654 built the cheap half: the READ-ONLY kinds, where Sol authored nothing
and no commit carried its trailer, so the author allowlist, the `commit-msg`
hook and the model guard could all stay as they were. That half is described
first below, and it is unchanged.

Point 667 built the other half, because the read-only lever had reached its
maximum while the largest single item of the spend — the AUTHORING of delegated
points, ~58 % of the weighted total — was still entirely Anthropic's. Sol now
authors suitable points, under a role swap that keeps four eyes: **where Sol
authors, Claude reviews, runs the suites, judges the picture and lands.** Every
point still has two vendors on it and neither model reviews its own work. See
[Authoring](#authoring-point-667) for what that costs and what it does not buy.

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
setting the user actually flipped. It can never take down the work that asked: a
**missing** file is `default` (nothing was ever set), while a file that is there
but **unusable** — unreadable, empty from a torn write, or holding something that
is not a setting — falls back to `claude-only`, and so does any unrecognised
value anywhere. Falling back to `default` instead would let a corrupted
`claude-only` state quietly resume spending the allowance the operator had moved
away from. That fallback is not neutral, and it does not pretend to be: a
corrupted `prefer-sol` state lands on the vendor THAT operator was sparing. There
is no setting that spends nothing on both, so the narrow claim is the honest one
— nothing goes to the SECOND vendor, and the work stays where it would be without
the switch at all. Every consumer prints the problem, and the board note and the
brief line SAY that the setting is a fallback rather than a choice, so it gets
repaired instead of lived with.

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
  per line, `A<n> | <file> | <the defect>`, or the single line `NO FINDINGS: …`
  when the sweep found none — a clean audit is an answer, not a failure.
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
without reading prose. For the same reason a request whose material could not be
read at all is refused before it is sent (exit 2): an unreadable file travels as
"(could not be read: …)", and that is text a model will answer *about* — a shaped
answer about nothing. A read that failed is named even when the rest went
through.

## Authoring (point 667)

```
node scripts/author-sol.mjs --routing --all        # which lane owns each open point, and why
node scripts/author-sol.mjs --routing --point 651  # one point
node scripts/author-sol.mjs --point 651            # author it here, on this branch
node scripts/author-sol.mjs --point 651 --dry-run  # the prompt and the argv, nothing spent
node scripts/author-sol.mjs --point 651 --findings f.md   # the second leg: answer the review
```

<!-- rule:model-policy@05eaa324 -->
**The cut is a function, not a taste.** `scripts/author-routing-core.mjs` reads
the point's own text: the hard cases (difficult, complex, error-prone, or tagged
HIGH criticality) go **straight to Sol** (user 18.08.2026 — they used to be held
back for Opus 5, and before that routed to Fable), and so does everything
mechanical and mid-difficulty. What stays with the main session is a point whose
VERIFICATION is the work and that nothing marks hard — the picture is judged
here whoever authored the code, so a hard picture point is Sol's too. The CUT
reaches Fable by ONE route only, `--reworked`; a lane tag or an explicit
override is the operator's own decision, below. Measured over the whole open queue on
18.08.2026, before and after the change: **203 points → 120 Sol / 0 Fable / 83
main session**, against 65 / 0 / 138 the day before. A point may
override the function with `Author lane: sol|fable|opus` **on a line of its
own** in its spec; `--reworked` says Sol has already been round this point and
the review still found problems, which sends it to Fable whatever the text says.

**The lane runs like any delegated agent**: an isolated worktree, its own
`feat/` branch, the point handed over as a BRIEF rather than a reading
assignment, and a commit per self-contained step. The child is given no
credential, so the WRAPPER pushes for it — every two minutes while the run
continues and again when it ends. That is a **residual, not compliance**: §6
says immediately, and a container dying inside those two minutes loses exactly
what the rule protects; it is the smallest gap available without handing a push
token to a run that has no sandbox.

The author runs the three cheap gates on its own work (`test:unit`, `build`,
`lint`) and must name each of them in its closing report — a gate it does not
name is read as one it did not run. What it does **not** do is verify: the
browser suites, the picture and the verdict are the reviewer's, which re-runs
the gates rather than believing the report. It merges nothing.

**The sandbox is off, and it has to be.** This container cannot create
unprivileged user namespaces, so codex's bubblewrap launcher dies before any
command of the model's runs — `codex sandbox read-only -- echo hi` prints the
bwrap error and nothing else. A reviewer works around that by having its
material fed to it; an author that cannot run `git commit` cannot author. So the
run uses `--dangerously-bypass-approvals-and-sandbox`, whose own documentation
names the condition we are in ("intended solely for running in environments that
are externally sandboxed").

What is still done is **hygiene, not containment**, and the difference is worth
stating plainly: the child's environment is stripped of everything that reads
like a credential (`childEnv`), and the run is refused outright unless it is on
a `feat/` branch in a worktree that is not the main checkout, with a clean tree.
**The residual, named rather than implied:** inside this container the run has
the filesystem access this session has — it can read `.secrets/`, use a
credential helper and push, and no regex over environment names prevents any of
that. What the stripping buys is that nothing leaks by *accident*: a token in
the environment is spent by any command that happens to look there, a token in a
file is spent only by a run that goes for it deliberately. The container is the
trust boundary; if that is not enough for a piece of work, that work is not this
lane's. Afterwards the wrapper checks that the run ended on the branch it
started on, because commits made elsewhere cannot be attributed to the point.

**Nothing is taken on trust afterwards.** What counts is what is in git — the
commits that appeared, their trailers, the tree left behind — never the run's
own account of itself. A run that reports success and committed nothing is
reported as having authored nothing.

## What is never routed, at any setting

- A point whose verification is the work, unless its spec marks it hard — since
  18.08.2026 a hard or critical point is Sol's whatever else it says (the
  routing function decides, and `--anyway` is the deliberate override).
- REVIEWING what Sol itself authored — no model reviews its own work, so
  `review-sol.mjs` refuses such a range before it spends a call on it.
- Driving the browser suites and **judging the picture**.
- The landing (`scripts/land-point.mjs`) and the main session's bookkeeping.

That last share answers to *reduction* (the point boundary, the brief), not to a
change of vendor.

## What the measurement says it is worth

`node scripts/measure-task-cost.mjs` now splits the verification phase into the
half that needs this machine or a pair of eyes and the half that is pure text.
Measured over 47,863 turns from 391 transcripts (03.–12.08.2026, weighted):

| | share |
| --- | --- |
| verification, of the whole spend | 41.5 % |
| — text (reads a log, a script, a report) | 48.0 % of it |
| — harness (runs a suite) | 39.4 % of it |
| — eyes (looks at a frame) | 7.8 % of it |
| — authoring (edits the verification code) | 4.7 % of it |
| — unclear (never guessed into a half) | 0.1 % of it |

So the routable text half is **19.9 % of the entire spend**, and 46.6 % of the
delegated agents' own verification. That is what makes part A worth having, and
what any decision about part B should be argued against.

Eight classification errors were found by the cross-vendor review rounds of
this very branch and are fixed in these figures: an unplaceable call used to be
dropped instead of voting (so a turn that read one log and did one unplaceable
thing read as wholly routable); `node --check` on a verify script counted as a
suite run; the exception for it was asked of the WHOLE shell line, so a line that
checked a file and then ran the suite read as text (each segment votes now, and a
run always wins); a frame in any format other than PNG counted as text rather than
as a picture; and a frame saved to the scratchpad and then looked at got no vote
at all, so the turn's other, textual call carried its whole share; a SEARCH for a
runner word (`rg playwright …`) counted as a run, because a reader's arguments name
whatever it is looking for, and a runner word inside a QUOTED search pattern was
split out of it and matched as a command; and any image file counted as
verification wherever it lay, so editing an asset in `src/` did too — every frame
this project takes is written under `verification/` by the shutter, so nothing was
lost by scoping it there. The `unclear` row exists so the
residue is visible rather than distributed.

## The first real run

Not a stub: `scripts/review-sol-cli.test.mjs` was reproduced red on this branch —
18 of 19 cases failing — and the run went

```
node scripts/ask-sol.mjs --kind diagnose \
     --brief "…18 of 19 cases fail. The attached log is the full run and the attached
               patch is the only uncommitted change in the tree. Name the single cause." \
     --log <the 44 kB run log> --log <the working-tree patch> --file scripts/review-sol.mjs --anyway
```

69,179 characters of material, answered in 9 s:

> **CAUSE:** The patch removed `sol-share.mjs` and its dependencies from the test
> fixture's `SCRIPT_FILES`, so the copied fixture cannot load `review-sol.mjs`.
> **EVIDENCE:** The diff deletes `'sol-share.mjs'` from `SCRIPT_FILES`;
> `review-sol.mjs` imports `currentSetting` from `'./sol-share.mjs'`; every failure
> reports `ERR_MODULE_NOT_FOUND` for `/tmp/.../repo/scripts/sol-share.mjs`.

Which is the cause, exactly — the same one that had actually cost a turn earlier
in the build.
