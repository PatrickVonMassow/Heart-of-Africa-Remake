# Guard-chain & memory audit — the repeatable pass

The guard chain and the memory corpus are the project's immune system, and both
grow only by accretion: 37 wired hooks, 35 enforcer scripts, 74 memories. Nothing
ever forces a read of the whole set, so a rule that stopped being true keeps being
obeyed, and a check that stopped reaching its subject keeps reading as green. This
document is the pass that reads it (work-order point 297).

It does **not** open a second cadence. `rule-review-guard` already schedules the
review — owed 14 days after the last one or as soon as the corpus gained 10
entries (`scripts/rule-review-core.mjs`) — and `docs/rule-corpus-audit.md` is the
one-off full audit of 27.07.2026 that produced that guard. This is the mechanical
first step of that same review: enumerate before judging, so the pass starts from
the tree rather than from what someone remembers is in it.

## Running it

```
node scripts/guard-inventory.mjs                # counts + only what needs a decision
node scripts/guard-inventory.mjs --all          # every enforcer with its wiring and test
node scripts/guard-inventory.mjs --memories     # every memory with age and size
node scripts/guard-inventory.mjs --json         # the same, machine-readable
node scripts/guard-health-guard.mjs --status    # can every enforcer still FIRE?
node scripts/rule-review-guard.mjs --status     # is a review owed?
```

Then judge, on the six axes of `rule-review-core.mjs` (`AXES`) and in its
frequency order (`HIGH_FREQUENCY_FIRST`) — a wrong rule costs what it costs times
how often its text is put in front of the model. Two rules of this pass:

- **Resolve every claim to the code that owns the fact**, never to the neighbouring
  prose. Half the findings below are a document describing a mechanism correctly
  as it was built and wrongly as it now is.
- **A pass with no findings is a failed pass, not a clean corpus.** If nothing
  turned up, the claims were checked against each other instead of against the
  code. Age is *not* a finding: the ten memories untouched for three weeks are
  stable rules, and `--memories` reports age as data to look at, not as a verdict.

Record the result with `node scripts/rule-review.mjs --reviewed --evidence "…"`
(the guard's attestation), and file each finding as a work-order point — the audit **reports**,
it never fixes in place, because a guard edited during the pass is a guard whose
review nobody did.

## Findings — pass of 07.08.2026 (`main` at `cb08895`, corpus 107)

10 findings: 2 contradictions, 3 ineffective mechanisms, 5 stale rules.
Measured clean: 0 orphaned enforcers, 0 dangling hook lines.

### Contradictions (a rule and the code disagree)

**1 · Two project-slug resolvers, and the findings carrier is in the wrong one.**
`findings-paths.projectSlug` maps the repo path to the memory directory with a
bare `replace(/[^A-Za-z0-9]/g,'-')`; `retro-sources.defaultMemoryDir` does the
same job but strips the trailing dash and lowercases the drive letter. `REPO_ROOT`
ends in a separator, so the two answer differently — `-workspace-hoa-` against
`-workspace-hoa` — and the inventory sees both directories: 74 memories and the
index in one, the findings carrier alone in the other. The consequence is not
cosmetic: `memoryIndexPath()` points at a `MEMORY.md` that does not exist, so
`ensureIndexed()` in `finding.mjs` silently takes its catch branch on every call
and has never linked the carrier — the index line that reaches it was written by
hand. On Windows the same split is `C--…` against `c--…`.
**Decision: MERGE into one resolver.** `retro-sources`' form is the correct one
(it matches the directory the harness really writes); `findings-paths` imports it
instead of restating it. Follow-up point.

**2 · The four-eyes gate does not reach hooks, though the rule says it does.**
CLAUDE.md §7.2 states `mechanism-review-guard` "lets no new or changed guard, gate
or **hook** end a turn without the OTHER model's recorded review".
`isMechanismPath` matches `-guard`/`-gate` and `scripts/git-hooks/*` only, so eight
wired enforcers are outside it — `batch-resume-hook`, `dashboard-reminder-hook`,
`lock-heartbeat-hook`, `lock-release-hook`, `prep-arm-hook`, `dashboard-sync`,
`worktree-reminder` and their cores. `dashboard-reminder-hook` is the very file
`HIGH_FREQUENCY_FIRST` names first, its text replayed at every prompt; it can be
rewritten today with no second pair of eyes.
**Decision: WIDEN `isMechanismPath` to `-hook`** (the file's own comment already
argues the name-based reach, so widening it is a one-line, reviewable edit) rather
than weaken CLAUDE.md. Follow-up point — not fixed here, because parallel points
touch these files and a mechanism must not change inside its own audit.

### Ineffective (the mechanism does not reach what it claims)

**3 · A finding recorded from a worktree is lost.** `carrierPath()` derives from
the checkout path, so from `…/.claude/worktrees/agent-XXXX/` it resolves to a
carrier of that worktree's own — measured, not inferred. Worktree agents are the
project's principal finders under maximal delegation, and the owner's `--drain`
never reads that file; it dies with the worktree. `retro-sources` already refuses
loudly on exactly this defect class; the carrier does not.
**Decision: NORMALISE the worktree path** to its main checkout (the shape in
`memoryDirVariants`), and refuse loudly rather than write, when it still cannot
resolve. Follow-up point, together with finding 1.

**4 · Two wired enforcers no by-name selector reaches.** `dashboard-sync.mjs`
(Stop) and `worktree-reminder.mjs` (PreToolUse/Agent) enforce real rules with pure
cores, but their names end in none of `-guard`/`-gate`/`-hook`. So `guard-health`
never asks whether they are wired or tested, `countCorpusEntries` never counts
them, and the four-eyes gate passes over them (finding 2). Nothing is broken
today — which is the point: if either were unwired tomorrow, no check would say so.
**Decision: RENAME to the convention** (`dashboard-sync-guard.mjs`,
`worktree-reminder-hook.mjs`) in one commit with their `.claude/settings.json`
lines. Attended, because the settings file always prompts. Follow-up point.

**5 · The corpus count and the health check disagree on what an enforcer is.**
`rule-review-state.countCorpusEntries` counts `/-(guard|hook)\.mjs$/`;
`guard-health-core.ENFORCER_RE` includes `-gate`. `model-trailer-gate.mjs` and
`pre-push-gate.mjs` are therefore outside the corpus the review schedule watches —
the growth trigger cannot see that class grow at all.
**Decision: MERGE onto one definition** — `countCorpusEntries` imports
`ENFORCER_RE`, as `guard-inventory-core` already does. Note the count moves 107 →
109, so the attestation must be re-recorded in the same commit. Follow-up point.

### Stale (no longer describes how the project works)

**6 · The index sends the reader to a Windows path.** `MEMORY.md` names the
carrier as `C:\Users\Patri\.claude\projects\C--Users-Patri-…\memory\`; the project
has run in a Linux container since 03.08.2026, where the file is under
`/home/node/.claude/projects/`. A session following the line literally finds
nothing. **Decision: REPLACE the literal path with the command that prints it**
(`node -e "import('./scripts/findings-paths.mjs').then(m=>console.log(m.carrierPath()))"`),
so it cannot go stale on the next host. Do it together with finding 1, whose fix
changes the answer.

**7 · The index describes a drained carrier as an undrained one.** It calls
`pending-queue-work-29-07` a "CARRIER for findings not yet in TASKS.md" and
instructs "delete the file once they are filed". The file itself is marked DRAINED
since 30.07.2026 and deliberately survives, holding the one thing a work-order
point cannot: what a `/doctor` run rejected on purpose. The index line orders the
deletion of exactly that record. **Decision: REWRITE the index line** to what the
file now is — a record of rejected options, do not re-analyse.

**8 · The untested-guard ratchet has not ratcheted.** `KNOWN_UNTESTED` records
seven enforcers as lacking a tested core and states it "can only shrink — remove a
name the moment its core gains a test". Judged by the module's own `tested` rule,
four now pass: `batch-progress-guard`, `batch-resume-hook`, `dashboard-reminder-hook`,
`lock-heartbeat-hook`. The list overstates the debt by more than half, and a
standing amnesty that is never re-read is how the real debt hides. Real remaining
debt: `lock-release-hook`, `prep-guard`, and `prep-arm-hook`, which has no local
import at all. **Decision: DELETE the four names**; keep the three with the debt
named. Follow-up point.

**9 · A mandate nobody follows, and the question is on no board.**
`tasks-time-tracking` (3.3 KB, loaded every session) mandates four point states
(`[ ] [*] [~] [x]`) and a `(track: …)` line per finished point. Measured: `(track:`
appears 32 times in the archive and **0** times in the open work order; `[*]`/`[~]`
appear **0** times anywhere. The index itself says "DEAD IN PRACTICE since mid-July,
awaiting the user's decision" — but no "Von dir zu klären" card exists, and neither
`decision-card-guard` nor `dashboard-vdzk` can catch that: both look at what this
session asked, never at a decision parked in a memory years of turns ago.
**Decision: RAISE it as a board decision card, then RETIRE the mandate half**,
keeping the ETA-calibration insight (estimate at the category median, learn from
actuals) which is live and unrelated. Follow-up point.

**10 · The project's third-largest memory asserts a mechanism that was removed.**
`chat-timestamp` (7.7 KB) states that `dashboard-reminder-hook.mjs` emits the
timestamp obligation as its first and last line, "(Zeilen 66 und 131)". Point 440
took it out; the hook now says the opposite in its own header — "The chat-timestamp
rule is NOT stated here (point 440) … `timestamp-guard` already BLOCKS the turn".
The rule itself is live; only its stated mechanism is wrong, in a memory loaded
every session. **Decision: CORRECT to the live layers** (user-scope hook +
`timestamp-guard`) and cut the nine-escalation history to the surviving rule. A
memory citing line numbers drifts by construction — cite the file's statement, not
its lines. Follow-up point.

### Checked and kept

- **0 orphans, 0 dangling lines.** All 35 enforcer-named scripts are reachable —
  32 through `.claude/settings.json`, 3 through `scripts/git-hooks/` — and every
  hook line names a file that exists. `INTENTIONALLY_DORMANT` is empty and stays so.
- **The review cadence is live.** Last attested 30.07.2026 at 107 entries by the
  second model; next owed 13.08.2026 or at 117 entries. This pass adds no schedule.
- **`webgpu-untestable-headless`** contradicts its own file name (WebGPU *is*
  testable headless). Accepted: the index line leads with the correction, and
  renaming would break inbound links silently — the trap `rule-corpus-audit` A65
  records. No action.
- **Memory age.** Ten memories untouched for ≥ 21 days, the oldest 30
  (`lint-and-cve-clean-always`). Each read; all still true. Kept.
