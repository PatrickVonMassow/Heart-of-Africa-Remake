# TASK — produce a COMPLETE cut list for three always-loaded documents

You are one half of a BLIND-PARALLEL analysis. Another model is producing its own
complete list from the same inputs, right now, and neither of you sees the other's
until both are done. So: do NOT hedge, do NOT leave anything out because it "might
be covered". Your list must stand alone as a complete answer.

## The problem, measured 20.08.2026

A freshly cleared session of this project stands at ~58,000 tokens BEFORE its first
tool call. Of that, ~19k are our own documents:

- `CLAUDE.md` (the project's build order) — 46,854 B, 786 lines, 6,585 words (~12k tokens)
- `MEMORY.md` (the user's auto-memory index) — 16,801 B, 100 lines, 2,133 words (~4.3k tokens)
- the global `~/.claude/CLAUDE.md` (user's private global instructions) — 5,093 B, 78 lines, 752 words (~1.3k tokens)
- the SessionStart hook output — ~1.4k tokens

The remaining ~42k is the harness system prompt plus tool schemas, which we do not
control. Realistic yield: 4–6k tokens of the ~19k, giving a floor near 52–54k.

This floor is paid by EVERY turn of EVERY session AND by every delegated subagent,
which inherits the same documents. It is the cheapest recurring saving in the project.

## The three cutting axes — each is the criterion your cut is judged by

### a. A RULE WITH A GUARD GETS A POINTER, NOT A PARAGRAPH

39 guards are wired in `.claude/settings.json` (28 Stop, 11 PreToolUse, measured
20.08.2026). Nearly everything §6 and §7.2 explain in prose is ENFORCED by one of
them. The guard is the authority; the prose is a second copy paid for every turn.

The wired guards are:

- **SessionStart (1):** batch-resume-hook.mjs
- **SessionEnd (1):** lock-release-hook.mjs
- **UserPromptSubmit (1):** dashboard-reminder-hook.mjs
- **Stop (28):** model-guard, push-arrival-guard, dashboard-guard, prep-guard,
  batch-progress-guard, render-verify-guard, mechanism-review-guard,
  criticality-review-guard, queue-order-guard, tasks-spec-guard,
  tasks-archive-guard, doc-budget-guard, bundle-first-guard, rule-echo-guard,
  dashboard-conciseness-guard, dashboard-card-topic-guard,
  dashboard-integrity-guard, ci-status-guard, timestamp-guard,
  retro-currency-guard, guide-brevity-guard, rule-review-guard, findings-guard,
  decision-card-guard, container-ask-guard, branch-hygiene-guard,
  guard-health-guard, dashboard-sync
- **PreToolUse (11):** board-first-guard, worktree-reminder, commission-guard,
  path-scope-guard, point-proof-guard, context-fence-guard, closing-guard (×3),
  firewall-guard (×2)
- **PostToolUse (3):** prep-arm-hook (×2), lock-heartbeat-hook
- **PermissionRequest (1):** permission-autogrant

**STAGGER BY FIRING TIME — never flat.** A **PreToolUse** guard refuses BEFORE the
action, so its rule is safe as a bare pointer: the session cannot violate it even
once. A **Stop-chain** rule fires at the turn END, and a session can violate it for
a whole turn first — that costs the turn — so those KEEP the text that prevents the
violation. Every cut you propose on this axis must NAME the guard that covers it and
say which chain it hangs in.

### b. ROLE-SPECIFIC CONTENT LEAVES THE ALWAYS-LOADED FILE

The batch-operation machinery — boundary, lease, claim, launcher, chat-watcher,
in-flight adoption — binds ONLY the batch owner, yet is inherited in full by every
delegated subagent that never touches it. It moves into a document the SessionStart
hook serves to the OWNER, the way `scripts/point-brief.mjs` already serves TASKS.md
and design.md instead of shipping them whole.

### c. THE WHY-HISTORY MOVES, THE RULE STAYS

Measurements, dates and incident narratives ("42 of 60 first-parent commits", "31 of
36 remote branches", "87–94 % of the spend", "a session ran to 434k on 17.08.") are
needed when a rule is DISPUTED, not on every turn. They go to a read-on-demand
document; the binding sentence stays.

## Additional targets

**MEMORY.md returns to its own rule, "one line per entry: the hook only."** Measured:
88 entries in 16,801 B, ~191 B per entry, longest 854 B. Entries marked DEAD / ENDED /
CORRECTED / DEAD IN PRACTICE are DELETED. Entries that only restate a rule CLAUDE.md
already binds are DROPPED rather than paid for twice every turn.

**The global `~/.claude/CLAUDE.md` is cut like the rest.** The user ruled 20.08.2026:
»Ich habe keine anderen Projekte. Mache alles so, wie es für dieses am besten passt.«
The cross-project caveat is VOID — this repository is its only reader. Triage it once:
- what the project's own CLAUDE.md already says more precisely (test layers, commit
  hygiene, model diversity, the progress board) → **DELETED**, not paid for twice;
- what is genuinely user-level and NOT in the project file → **MOVES INTO** the
  project file at its right section;
- what neither binds nor informs → **GONE**.

## Hard constraints

- **NOTHING LEAVES WITHOUT AN ACCOUNT.** Every rule you cut is accounted for as
  MOVED (to a named destination), COVERED (by a named guard), or DROPPED (which
  needs the user's explicit ruling — so propose it, flagged).
- `design.md` content authority is untouchable (CLAUDE.md §1: design.md is the sole
  source of the target state). Do not propose cutting design.md.
- No new runtime dependency. This is documents, budgets and one hook path.
- The §7.1 acceptance criteria list (1–32) already went through this treatment in
  point 555: each keeps its number, title, one short condition and two pointers,
  with the full wording in `docs/acceptance-criteria-detail.md`. Judge whether that
  cut went far enough, but do not undo it.

## What you return

A COMPLETE list. Each entry on ONE line, in exactly this form:

```
<id> | <file> | <what to cut and how it is accounted for, in one sentence>
```

- `<id>` — your list letter plus a number. Use **A1, A2, A3…** if you are the
  Opus 5 half; **B1, B2, B3…** if you are the GPT-5.6 Sol half. (Your launcher tells
  you which you are.)
- `<file>` — `CLAUDE.md`, `MEMORY.md`, or `global-CLAUDE.md`.
- The sentence must name the SECTION being cut, the AXIS (a/b/c or memory/global),
  the ACCOUNT (moved to X / covered by guard Y / dropped-needs-ruling), and an
  ESTIMATED SAVING in words.

Output ONLY those lines — no preamble, no summary, no markdown table, no code fence.
Aim for completeness over brevity: 25–60 entries is the expected range. An entry the
other model did not think of is exactly what this stage exists to produce.
