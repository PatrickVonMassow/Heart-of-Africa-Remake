# Account — cutting the per-turn document floor

The counted blind merge in `docs/blind-757/union.json` authorized these cuts.
Each line names what left an always-loaded document and its surviving authority.
The five entries awaiting the user's ruling — U6, U45 part 1, U48, U55 and U65
— remain unchanged in substance and are therefore not cut entries below.

The freshly cleared interactive-session floor measured 57,970 tokens before
and 39,867 after against the 55–57k target. The after record is the first
assistant message of transcript `c20e6534-94f0-4773-bb57-f058bdf32cec`:
`input_tokens 2 + cache_read_input_tokens 0 + cache_creation_input_tokens
39,865`. The harness and tool schemas still dominate; this is a recurring
document saving, not a different order of magnitude.

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
- `MEMORY.md` :: U51 findings-carrier path derivation and workflow :: MOVED -> /home/node/.claude/projects/-workspace-hoa-/memory/findings-carrier.md
- `MEMORY.md` :: U52 project-path index duplicate :: COVERED -> path-scope-guard
- `MEMORY.md` :: U52 container-work index duplicate :: COVERED -> container-ask-guard
- `MEMORY.md` :: U52 chat-timestamp index duplicate :: COVERED -> timestamp-guard
- `MEMORY.md` :: U52 board-card index duplicates :: COVERED -> dashboard-card-topic-guard
- `MEMORY.md` :: U52 queue and bundle index duplicates :: COVERED -> queue-order-guard
- `MEMORY.md` :: U52 preparation index duplicate :: COVERED -> prep-guard
- `MEMORY.md` :: U52 retrospective index duplicate :: COVERED -> retro-currency-guard
- `MEMORY.md` :: U53 second copies of project policy rules :: DROPPED -> user ruling 20.08.2026: project CLAUDE.md is their single binding copy
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
