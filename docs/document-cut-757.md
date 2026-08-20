# Account — cutting the per-turn document floor

The counted blind merge in `docs/blind-757/union.json` authorized these cuts.
Each line names what left an always-loaded document and its surviving authority.
The five entries awaiting the user's ruling — U6, U45 part 1, U48, U55 and U65
— remain unchanged in substance and are therefore not cut entries below.

## The two floors, both now measured

Two floors are involved here and they are NOT interchangeable. Both are the
first assistant message of a real transcript, summed as `input_tokens +
cache_read_input_tokens + cache_creation_input_tokens`, taken before that
session's first tool call.

FLOOR owner :: 20.08.2026 :: `~/.claude/projects/-workspace-hoa/3141e458-63d3-4825-81bf-f135a96a50b4.jsonl`
:: `2 + 22,579 + 21,034 = 43,615`

FLOOR subagent :: 20.08.2026 :: `~/.claude/projects/-workspace-hoa--claude-worktrees-agent-a3d55aa0d296e011a/ffafb607-4609-4d8c-8ac9-49fc0bd74ea4.jsonl`
:: `2 + 21,417 + 18,118 = 39,537`

The owner reading is the one point 757 owed and point 761 took: the first
batch-owner session started after the cut landed, reading its own transcript.
The subagent reading stays exactly where it was, and it is the SUBAGENT floor,
not a second opinion on the owner's — a delegated agent carries neither the
SessionStart batch-resume output nor the owner runbook this cut newly serves to
the lock holder.

The useful number is the gap between them: an owner session pays four thousand
and seventy-eight tokens more than a subagent for the same documents. The
SessionStart hook output and the owner runbook are the largest known part of
that gap and the only part this cut changed — but they are not established as
all of it. The two sessions also differ in their first prompt and their working
directory, and nothing here compares their harness build or tool schemas, so the
gap is an upper bound on what the hook and the runbook cost, not a measurement
of it.

## What the cut actually saved

Against the pre-cut owner baseline of 57,970 the measured owner floor of 43,615
is a saving of 14,355 tokens per turn, and the comparison is finally like for
like: owner against owner. Point 757 estimated a yield of 4-6k and a resulting
floor near 55-57k, so the executed cut beat its own estimate roughly threefold.
The estimate was low because it assumed a quarter of the documents could go; the
cut removed 45,682 of 68,748 bytes, two thirds of them.

That 14,355 does not all recur, and the reconciliation says why:

- ~11.4k is the removed document text itself — 45,682 bytes at the ~4 bytes per
  token these files run at.
- ~2.1k is an artefact of THIS session and will not repeat in the same form: the
  SessionStart hook printed 10,394 bytes, more than the harness carries inline,
  so it delivered a ~2 KB preview plus a file pointer and the remaining ~8,346
  bytes arrived as a tool result AFTER the floor was taken. An owner session
  whose hook output fits inline reads a floor near 45.7k, not 43,615. This is
  the mechanism open point 597 is about.
- ~850 tokens are RESIDUAL and the missing information is named: the 57,970
  baseline was read from a different session, and the harness system prompt and
  tool schemas — the ~42k share we do not control — need not have been
  byte-identical between the two readings. Nothing in this repository records
  that share per session, so the residual cannot be closed from here.

So the durable recurring saving is ABOUT 11.4k tokens per turn — the removed
document text, and nothing else that is affirmatively attributed. It is not
12.3k: subtracting only the truncation artefact from 14,355 would quietly bank
the ~850 residual as if it had been explained. The honest statement is 11.4k
attributed, with an upper bound of 12.3k that holds only if the residual turns
out to be document-related too, which nothing here shows.

Two claims here are ATTRIBUTED, not measured, and are marked so on purpose. The
first is the hook-and-runbook share of the gap, bounded above; that is why it is
written as a bound. What the tests DO establish is the two things that could
otherwise be faked: each reading's session KIND, from two independent signals
that must agree — the working directory, since a delegated author runs in an
isolation worktree and the owner in the main checkout, and the batch-resume
prompt — and its FRESHNESS, so neither can be a transcript from before the cut.
No test weighs the hook's share against the other differences. The second
attributed claim is the ~4 bytes per token these documents run at, a ratio taken
from their character counts rather than a tokenizer reading. Both would need a
per-session record of the harness share to become measurements, and that record
does not exist.

## Ceilings confirmed against the landed files

Measured 20.08.2026 on merged `main` with `measure()` from
`scripts/doc-budget-core.mjs` — the guard's OWN tokenizer, not `wc`, because a
ceiling is only confirmed against the counter that enforces it.
`evaluateDocBudgets()` reports no findings, so all three hold.

| document | landed | ceiling | headroom |
| --- | --- | --- | --- |
| `CLAUDE.md` | 332 lines / 2,091 words / 17,255 B | 334 / 2,095 | 2 lines, 4 words |
| `MEMORY.md` | 47 lines / 708 words / 5,590 B | 47 / 710 | 0 lines, 2 words |
| global `CLAUDE.md` | 6 lines / 33 words / 236 B | 6 / 36 | **0 lines**, 3 words |

They hold, but two of them hold with nothing to spare, and that is the finding
this confirmation produced. The ceilings were set from figures taken BEFORE the
merge — the code comments in `scripts/doc-budget-core.mjs` still said MEMORY.md
had landed at 45 lines / 700 words and the global stub at five lines, where the
landed files measure 46 / 710 and six. Those comments are corrected in the same
commit as this table. The ceilings themselves are NOT raised here: `MEMORY.md`
is designed to gain one index line per new memory, and at zero word headroom the
next one blocks the guard, so the budget needs a decision rather than a quiet
widening. That is filed as its own work-order point.

TWO OF THESE ROWS HAVE SINCE MOVED, and the table follows the LIVING file rather
than freezing the merge-day reading, because the unit case measures what the
files hold today. `MEMORY.md` stood at 710 words on merge day; on 20.08.2026 a
later session executed the ruled cut of the time-tracking entry and wrote others,
and the count moved twice within the hour — the row above is a reading taken at
07:33 that day, not the merge-day one.
The global stub is GONE: the user released it in the same ruling and it was
deleted on 20.08.2026 (backup `local/global-CLAUDE-before-deletion-20-08-2026.md`),
so its row is history and `doc-budget-guard` simply skips a budget whose file no
longer exists. Note what this costs: pinning the table to a live index that gains
a line per memory means every memory written reddens the case until the table is
restated. That coupling belongs to the budget decision and is recorded there.

## The cut entries

- `CLAUDE.md §1` :: U1 duplicate design-authority sentence :: DROPPED -> user ruling 20.08.2026: merge duplicate statements in place
- `CLAUDE.md §8` :: U2 duplicate outside-scope section :: DROPPED -> user ruling 20.08.2026: fold its only distinct condition into §2
- `CLAUDE.md §2` :: U3 duplicate debug-menu balance explanation :: DROPPED -> user ruling 20.08.2026: design.md §21 and criterion 20 remain authoritative
- `CLAUDE.md §3` :: U4 renderer rationale and modern-hardware history :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §3` :: U5 renderer initialization and fallback mechanics :: MOVED -> docs/render-architecture.md
- `CLAUDE.md §3` :: U7 TTS decision history, warm-up, caching and device mechanics :: MOVED -> docs/tts-architecture.md
- `CLAUDE.md §4` :: U8 derivable ASCII directory listing :: DROPPED -> user ruling 20.08.2026: a directory listing is not a rule
- `CLAUDE.md §4` :: U9 document synchronization elaboration :: COVERED -> rule-echo-guard
- `CLAUDE.md §5` :: U10 test architecture examples and coverage map :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §5` :: U11 duplicated regression-tier explanation :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §6` :: U12 dated feature-branch durability history :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §6` :: U13 rescue syntax and durability mechanics :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §6` :: U14 render-backend example and merge verification mechanics :: COVERED -> render-verify-guard
- `CLAUDE.md §6` :: U15 branch-debris incident and measurement :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §6` :: U16 cross-cutting commit measurement :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §6` :: U17 worktree-isolation elaboration :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U18 work-order split rationale and consumer mechanics :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §6` :: U19 landing-command step enumeration :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U20 release and tag operation :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U21 deployed-main judgment and preview exception :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U22 dispatcher pool and retained-duty mechanics :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U23 point-brief resolver mechanics and measurement :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U24 boundary, lease, claim, launcher and watcher operation :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U25 context-fence mode mechanics :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U26 model-routing operation and dated reversals :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U27 four-eyes rationale and cost history :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §6` :: U28 counted blind-merge operation :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §6` :: U29 voice-markup file chain :: MOVED -> docs/tts-architecture.md
- `CLAUDE.md §6` :: U30 repository-answer incident history :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §6` :: U31 duplicated self-verification reminder :: DROPPED -> user ruling 20.08.2026: §7.2 remains binding
- `CLAUDE.md §7.1` :: U32 acceptance-detail and evidence move rationale :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §7.1` :: U33 criteria 1, 10, 11 and 18 complete wording :: MOVED -> docs/acceptance-criteria-detail.md
- `CLAUDE.md §7.1` :: U34 criteria 2–9 and 12–31 enumerated requirements :: MOVED -> docs/acceptance-criteria-detail.md
- `CLAUDE.md §7.1` :: U35 criterion 32 delivery and removal history :: MOVED -> docs/acceptance-criteria-detail.md
- `CLAUDE.md §7.2` :: U36 build, lint, audit and suite-composition detail :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §7.2` :: U37 achievable-state numeric examples and projection rationale :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §7.2` :: U38 shutter mechanics and frame-subject incident :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §7.2` :: U39 backend launcher assertions and routing matrix :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §7.2` :: U40 Stop-chain inventory and incidents :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §7.2` :: U41 preflight loop measurement :: MOVED -> docs/rule-corpus-audit.md
- `CLAUDE.md §7.2` :: U42 screenshot replay measurements and rejected shortcut :: MOVED -> docs/picture-check-levers.md
- `CLAUDE.md §7.2` :: U43 red-run waiver and throttle-probe mechanics :: MOVED -> scripts/verify/README.md
- `CLAUDE.md §9` :: U44 closing sequence implementation and history :: MOVED -> docs/batch-owner-runbook.md
- `CLAUDE.md §9` :: U45 closing-freeze procedure :: MOVED -> docs/batch-owner-runbook.md
- `MEMORY.md` :: U46 ended Sol-default entry :: DROPPED -> user ruling 20.08.2026: delete entries marked ENDED
- `MEMORY.md` :: U47 dead halves of Fable and provider-volume entries :: DROPPED -> user ruling 20.08.2026: delete DEAD and ended clauses while keeping live hooks
- `MEMORY.md` :: U49 solved parallel-session incident :: MOVED -> docs/batch-singleton-analysis.md
- `MEMORY.md` :: U50 corrected WebGPU headless detail :: MOVED -> ~/.claude/projects/-workspace-hoa/memory/webgpu-testable-headless.md
- `MEMORY.md` :: U51 findings-carrier path derivation and workflow :: MOVED -> ~/.claude/projects/-workspace-hoa-/memory/findings-carrier.md
- `MEMORY.md` :: U52 project-path index duplicate :: COVERED -> path-scope-guard
- `MEMORY.md` :: U52 container-work index duplicate :: COVERED -> container-ask-guard
- `MEMORY.md` :: U52 chat-timestamp index duplicate :: COVERED -> timestamp-guard
- `MEMORY.md` :: U52 board-card index duplicates :: COVERED -> dashboard-card-topic-guard
- `MEMORY.md` :: U52 queue and bundle index duplicates :: COVERED -> queue-order-guard
- `MEMORY.md` :: U52 preparation index duplicate :: COVERED -> prep-guard
- `MEMORY.md` :: U52 retrospective index duplicate :: COVERED -> retro-currency-guard
- `MEMORY.md` :: U53 effort-high-for-implementation hook :: MOVED -> ~/.claude/projects/-workspace-hoa/memory/effort-high-for-implementation.md
- `MEMORY.md` :: U53 remaining second copies of project policy rules :: DROPPED -> user ruling 20.08.2026: project CLAUDE.md is their single binding copy
- `MEMORY.md` :: U54 batch-owner and board-operation hooks :: MOVED -> docs/batch-owner-runbook.md
- `MEMORY.md` :: U56 detail beyond each surviving one-line hook :: MOVED -> ~/.claude/projects/-workspace-hoa/memory/
- `MEMORY.md` :: U57 regrowth prevention and entry-length ceiling :: COVERED -> doc-budget-guard
- `MEMORY.md` :: U58 review and compaction provenance :: MOVED -> docs/rule-corpus-audit.md
- `global-CLAUDE.md` :: U59 cross-project adaptable-defaults caveat :: DROPPED -> user ruling 20.08.2026: this repository is the only reader
- `global-CLAUDE.md` :: U60 invariant assertions and transient-failure rule :: MOVED -> CLAUDE.md
- `global-CLAUDE.md` :: U61 work-order durability duplicate :: COVERED -> tasks-spec-guard
- `global-CLAUDE.md` :: U61 commit and documentation duplicates :: COVERED -> rule-echo-guard
- `global-CLAUDE.md` :: U62 progress-board duplicates :: COVERED -> dashboard-guard
- `global-CLAUDE.md` :: U63 model-diverse review rule :: MOVED -> CLAUDE.md
- `global-CLAUDE.md` :: U63 phased release QA rule :: MOVED -> docs/maximum-qa.md
- `global-CLAUDE.md` :: U63 fan-out budget rule :: MOVED -> ~/.claude/projects/-workspace-hoa/memory/workflows-token-budget.md
- `global-CLAUDE.md` :: U64 judgment, confirmation and faithful-reporting rules :: MOVED -> CLAUDE.md
- `CLAUDE.md §budgets` :: U66 every cut lands with its twin and lowered ceiling :: COVERED -> rule-echo-guard
