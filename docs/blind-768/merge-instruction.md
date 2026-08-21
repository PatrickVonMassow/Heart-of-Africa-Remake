# TASK — merge the two blind halves into one counted union

Two models produced complete keep/drop lists over `CLAUDE.md` from the same
instruction (`docs/blind-768/instruction.md`), neither seeing the other's. List A
(A1–A60) is the Claude Opus 5 half, list B (B1–B56) the GPT-5.6 Sol half.

**DECORRELATED MERGE FRAMING** (a same-model fallback, recorded as weaker: the merging
model selected by `node scripts/fable-switch.mjs --status` is the one that wrote list B):
reconstruct the union from the two numbered evidence lists and their invariants; do NOT
reuse the framing, ordering, or categories of Sol's own half. Read list A first and in
full.

## How to decide a disagreement

- The three admissible grounds for dropping a rule are: (1) a GUARD already enforces
  it — admissible **only with the guard's actual assertion checked**; (2) the rule is
  stated more precisely elsewhere; (3) no agent would break it without the line.
- **A CHECKED GUARD ASSERTION BEATS AN UNCHECKED ONE.** List B repeatedly says "the
  guard ground is unavailable without inspecting X" — that is honest, and it means B
  did not rule the ground out, it declined to use it. Where list A names the script,
  the function or the message that does the refusing, that check stands.
- **STAGGER BY FIRING TIME.** A PreToolUse guard refuses BEFORE the act, so its rule is
  safe as a bare pointer. A Stop-chain guard fires at the TURN END, so a session can
  violate that rule for a whole turn first — those keep the preventive sentence. The
  wired chains, measured 21.08.2026: PreToolUse — board-first-guard, worktree-reminder,
  commission-guard, path-scope-guard, point-proof-guard, context-fence-guard,
  closing-guard, firewall-guard. Stop — model-guard, push-arrival-guard, dashboard-guard,
  prep-guard, batch-progress-guard, render-verify-guard, mechanism-review-guard,
  criticality-review-guard, queue-order-guard, tasks-spec-guard, tasks-archive-guard,
  doc-budget-guard, bundle-first-guard, rule-echo-guard, dashboard-conciseness-guard,
  dashboard-card-topic-guard, dashboard-integrity-guard, ci-status-guard, timestamp-guard,
  retro-currency-guard, guide-brevity-guard, rule-review-guard, findings-guard,
  decision-card-guard, container-ask-guard, clear-claim-guard, branch-hygiene-guard,
  guard-health-guard, dashboard-sync.
- **A STANDING USER RULING WINS OVER BOTH HALVES.** One is in play: the §3 bullet "if
  WebGPU gets stuck during the run, fall back to plain WebGL and record an open item"
  is U6 of work-order point 763, already ruled for removal by the user on 20.08.2026.
  A11 proposes the drop; B11 argues to keep it without knowing the ruling. The ruling
  decides it.
- **A HARD CONSTRAINT WINS OVER A SAVING.** §7.1's `N. **Title.**` shape and numbering,
  the §5 test-layer rule, and the §6 model-policy paragraph's exact wording are fixed.

## The one question you must answer with a NUMBER, not a preference

A58 (Opus) says the session-only remainder after the cut is roughly 240 words out of
~1,180 and a split into an agent-facing core and a session part does NOT pay. B56 (Sol)
says the remainder is roughly 700 words out of ~1,250–1,300 and it DOES pay. Both cannot
be right. Take the union you just built, add up the words of the lines that survive and
are marked session-only, and say which estimate the arithmetic supports. Put the answer
in the union entry that folds A58 and B56, and state the measured number in its `defect`
line. The split is built only if the remainder still pays after the cut.

## Output — JSON only, nothing else

```
{ "mergedBy": "GPT-5.6 Sol",
  "entries": [ { "id": "U1", "from": ["A1","B1"], "defect": "<the merged decision: SECTION | KEEP/DROP/SHORTEN | agent-facing/session-only | what is done and why, one line>" } ] }
```

**EVERY id A1–A60 and B1–B56 must appear in exactly one entry's `from`.** An entry only
one half found is a union entry with a single `from` — that is what this stage exists to
produce, and it is not a reason to leave it out. The count is checked mechanically and
a missing id fails the merge.
