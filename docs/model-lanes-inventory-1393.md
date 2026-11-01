# Model-lanes inventory (rebuild: generic model lanes)

Measured on `feat/1393-generic-model-lanes` at base 79db567fd, 20.10.2026.
Search pattern (case-sensitive alternation):
`Astra|ASTRA|astra|Fable|FABLE|fable|Opus|OPUS|opus|GPT-|gpt-|OpenAI|OPENAI|openai|Codex|codex|CODEX|\bSol\b|Sonnet|Haiku`.
Totals: scripts/ 236 files / 3698 lines (131 non-test, 105 test); docs/ 111 files /
2501 lines; .claude/ 6 files / 2725 lines (ledgers); CLAUDE.md 7 lines; src/ 32
files (historical attribution comments, game prose, one routing test).

## I1. Model identities today (scripts/fable-switch-core.mjs, lines 10-25)

| constant | value | role it plays |
|---|---|---|
| `CLAUDE_MODEL` | `Claude Opus 5.5` | main chain, trailer display |
| `OPUS_MODEL` | `Opus 5.5` | main chain short name |
| `OPUS_MODEL_ID` | `claude-opus-5-5[1m]` | main chain model id |
| `OPUS_FALLBACK_MODEL` / `_ID` | `Opus 4.8` / `claude-opus-4-8[1m]` | fallback when the main id is refused |
| `FABLE_MODEL` / `_ID` | `Fable 5.1` / `claude-fable-5-1` | scarce lane (switch-gated), merger |
| `ASTRA_MODEL` / `_ID` | `GPT-6 Astra` / `gpt-6-astra` | OpenAI lane (reviews, enumerate, author) |

Retired names still carried by landed trailers and ledgers: `GPT-5.6 Sol`
(OpenAI lane until 05.09.2026), `Opus 5`, `Claude Opus 5`, `Fable 5`,
`claude-opus-5[1m]`. Related variables (not ids): `ASTRA_REASONING_EFFORT`, `ASTRA_MODEL_NAME`
(second copy of the display name), `CODEX_BIN`, `CODEX_HOME`.

## I2. Vendor-named scripts (file: lines)

- Switch: `fable-switch.mjs` 83, `fable-switch-core.mjs` 324 (+ `-cli`/`-core` tests).
  State file `.claude/fable-switch.json` in the MAIN checkout; env `FABLE_SWITCH_FILE`,
  `FABLE_SWITCH_SET_BY`.
- Routing: `astra-share.mjs` 203, `astra-share-core.mjs` 444 (+ tests). State file
  `.claude/astra-share.json`, settings values `claude-only | default | prefer-astra`
  (persisted), env `ASTRA_SHARE_FILE`.
- Ask: `ask-astra.mjs` 273, `ask-astra-core.mjs` 428 (+ tests); `--model fable|astra`,
  kinds `enumerate|diagnose|audit|explain|author`.
- Review: `review-astra.mjs` 1433, `review-astra-core.mjs` 1070 (+ cli/contribution/plan/core
  tests, ~2700 lines); env `REVIEW_ASTRA_STATE_DIR`; outage outcomes `astra-unavailable`.
- Authoring: `author-astra.mjs` 1066, `author-astra-core.mjs` 690 (+ cli/core/session tests);
  `author-fable.mjs` 10, `author-fable-core.mjs` 55 (+ tests); `author-routing-core.mjs`
  (+ `.d.mts`) with `FABLE_ESCALATION_ROUNDS`, route ids `astra-authored`, `sol-authored`.
- Vendor-neutral names but vendor-specific contents: `model-guard-core.mjs` (127 hits:
  `ALLOWED` regex `astra|sol`, `FABLE_ALLOWED`, `MODEL_FAMILY_WORD`,
  `MODEL_VENDOR_ADDRESS` = anthropic|openai), `model-trailer-gate.mjs`,
  `authorship-check-core.mjs` (Codex rollout transcripts), `mechanism-review-core.mjs`
  (84 hits; reviewer model/vendor fields), `measure-point-cost(-core).mjs` (Codex token
  parsing, `MEASURE_CODEX_SESSIONS_DIR`), `context-fence-core.mjs`, `blind-merge.mjs`,
  `batch-boundary(-core).mjs`, `user-gate-core.mjs`, `durable-lane-flag-core.mjs`.

## I3. Vendor-named exported identifiers (scripts/)

Constants: `ASTRA_MODEL`, `ASTRA_MODEL_ID`, `ASTRA_MODEL_NAME`, `ASTRA_REASONING_EFFORT`,
`ASTRA_TRAILER`, `FABLE_MODEL`, `FABLE_MODEL_ID`, `FABLE_TRAILER`, `FABLE_ESCALATION_ROUNDS`,
`OPUS_MODEL`, `OPUS_MODEL_ID`, `OPUS_FALLBACK_MODEL`, `OPUS_FALLBACK_MODEL_ID`,
`CLAUDE_MODEL`, `CODEX_BIN`, `CODEX_HOME`.
Functions: `runCodex`, `codexArgs`, `authoringCodexArgs`, `codexTokens`,
`parseCodexTranscript`, `listCodexRollouts`, `recordAstraRun`, `afterAstraRun`,
`astraAuthored`, `kindsToAstra`, `isOpenAiLane`, `fableIsOn`, `fableRefusalReason`,
`fableStateAtCommit`, `fableAuthoringOutcome`, `currentFableState`.
One consumer outside scripts/: `src/config/fableEscalationDoc.test.ts` imports
`FABLE_ESCALATION_ROUNDS`.

## I4. Environment variables

`ASTRA_SHARE_FILE`, `FABLE_SWITCH_FILE`, `FABLE_SWITCH_SET_BY`, `REVIEW_ASTRA_STATE_DIR`,
`CODEX_HOME` (the Codex CLI's own variable — external contract), `MEASURE_CODEX_SESSIONS_DIR`.

## I5. Persisted data carrying model or vendor names (must stay readable)

- `.claude/fable-switch.json` (untracked, main checkout): `{state, reason, setBy, changedAt}`.
- `.claude/astra-share.json` (untracked): `{setting: claude-only|default|prefer-astra, ...}`.
- `.claude/mechanism-reviews.jsonl` (tracked ledger): `model: "GPT-6 Astra"`,
  `claimedModel`, `authoredBy` trailers — historical, append-only.
- `.claude/model-guard-baseline.json`: prose note naming Opus 5 / GPT-5.6 Sol.
- `docs/point-cost-ledger.json`, `docs/four-eyes/*.json`, `docs/blind-*/`: historical records.
- Landed commit trailers: `Co-Authored-By: GPT-6 Astra <noreply@openai.com>`,
  `GPT-5.6 Sol`, `Claude Opus 5`, `Claude Fable 5(.1)`, `Reviewed-By: ...`.

## I6. Policy text and hooks

- CLAUDE.md §6 lines 72-83: "Daemon-owned durable Astra authors", "GPT-6 Astra authors
  difficult/complex/error-prone/HIGH points; Opus 5.5 authors ...; Fable 5.1 authors tagged
  points ...; an unreachable Astra lane authors on Opus 5.5 ... (`scripts/review-astra.mjs`
  for Claude work, Claude for Astra work). `node scripts/fable-switch.mjs --status` alone
  decides Fable authoring ..."
- `.claude/settings.json`: NO hook or permission names a vendor-named script; the hooks
  `model-guard.mjs`, `mechanism-review-guard.mjs`, `criticality-review-guard.mjs`,
  `rule-review-guard.mjs` are already role-named. No attended settings edit is owed by
  the renames.
- Operational docs naming old scripts: `docs/astra-routing.md` (79), `docs/batch-owner-runbook.md`
  (6), `scripts/verify/README.md` (2), `docs/command-index.md` (14), `docs/batch-autonomy.md`
  (13), `docs/handover-architecture.md` (36), `docs/four-eyes/README.md` (10),
  `docs/criticality-review.md`, `docs/picture-check-levers.md`, `docs/maximum-qa.md`.
- Historical docs (records, not consumers): `docs/tasks-archive.md`, `docs/blind-*/`,
  `docs/four-eyes/<point>-*`, `docs/analysis_de/`, `docs/communication-review-659/`,
  `docs/point-cost-*`, `docs/backlog.md` entries, `docs/rule-corpus-audit.md`.
- Memory entries (outside the repo) naming old scripts: `MEMORY.md`,
  `effort-high-for-implementation.md`, `fable-sparingly.md`, `findings-carrier.md`,
  `hard-cases-go-to-sol.md`, `serving-model-watch.md` (ask-astra, astra-share(-core),
  author-astra, fable-switch(-core), review-astra(-core)).

### I7. Per-file occurrence counts — non-test scripts (file:lines matching)

```
scripts/model-guard-core.mjs:127
scripts/review-astra.mjs:124
scripts/review-astra-core.mjs:124
scripts/author-astra.mjs:90
scripts/mechanism-review-core.mjs:84
scripts/author-routing-core.mjs:66
scripts/astra-share-core.mjs:63
scripts/ask-astra.mjs:60
scripts/fable-switch-core.mjs:59
scripts/mechanism-review.mjs:37
scripts/measure-point-cost.mjs:37
scripts/author-astra-core.mjs:36
scripts/ask-astra-core.mjs:36
scripts/astra-share.mjs:35
scripts/context-fence-core.mjs:33
scripts/batch-boundary-core.mjs:26
scripts/user-gate-core.mjs:23
scripts/measure-point-cost-core.mjs:22
scripts/blind-merge.mjs:21
scripts/batch-boundary.mjs:20
scripts/render-verify-charges.mjs:18
scripts/model-guard.mjs:17
scripts/batch-in-flight.mjs:16
scripts/batch-in-flight-core.mjs:15
scripts/fable-switch.mjs:13
scripts/batch-resume-hook.mjs:13
scripts/verify/polish-villagers.mjs:12
scripts/mechanism-review-guard.mjs:12
scripts/land-point.mjs:12
scripts/authorship-check-core.mjs:12
scripts/mechanism-review-range-core.mjs:11
scripts/verify/run-logged.mjs:10
scripts/point-brief-core.mjs:10
scripts/fixtures/timestamp-guard-302ms-race.json:10
scripts/fixtures/criticality-point-769.json:10
scripts/batch-autostart-core.mjs:9
scripts/author-fable-core.mjs:9
scripts/rule-echo-core.mjs:8
scripts/verify/run-all.mjs:7
scripts/model-trailer-gate.mjs:7
scripts/findings-fixtures.mjs:7
scripts/defer-for-user.mjs:7
scripts/verify/labelFusion.mjs:6
scripts/verify/board-layout.mjs:6
scripts/guard-preflight.mjs:6
scripts/fold-point.mjs:6
scripts/firewall-allow.mjs:6
scripts/dashboard-sync-core.mjs:6
scripts/container-ask-guard-core.mjs:6
scripts/batch-autostart.mjs:6
scripts/author-fable.mjs:6
scripts/verify/run-record.mjs:5
scripts/review-material-core.mjs:5
scripts/render-verify-core.mjs:5
scripts/findings-fixtures.json:5
scripts/detached-agent.mjs:5
scripts/context-fence-guard.mjs:5
scripts/command-classify-core.mjs:5
scripts/point-brief.mjs:4
scripts/criticality-review-guard.mjs:4
scripts/commission-guard.mjs:4
scripts/chat-watcher.mjs:4
scripts/batch-claim-core.mjs:4
scripts/author-routing-core.d.mts:4
scripts/verify/world.mjs:3
scripts/verify/collision.mjs:3
scripts/launcher-stall-core.mjs:3
scripts/guide-brevity-core.mjs:3
scripts/findings-request-core.mjs:3
scripts/dashboard-guard-core.mjs:3
scripts/context-incidents-core.mjs:3
scripts/board-queue-core.mjs:3
scripts/board-publish.mjs:3
scripts/board-core.mjs:3
scripts/batch-launcher.mjs:3
scripts/verify/run-wait-core.mjs:2
scripts/verify/polish-speech.mjs:2
scripts/verify/polish-settlement.mjs:2
scripts/verify/baseline-classify-core.mjs:2
scripts/verify/README.md:2
scripts/permission-autogrant-core.mjs:2
scripts/module-link-check.mjs:2
scripts/mechanism-review-guard-gap.mjs:2
scripts/land-point-core.mjs:2
scripts/guard-health-core.mjs:2
scripts/fixtures/point-cost/codex-ask.jsonl:2
scripts/findings-core.mjs:2
scripts/finding.mjs:2
scripts/doc-budget-core.mjs:2
scripts/detached-escape-drill.mjs:2
scripts/criticality-review-guard-core.mjs:2
scripts/cloud-switch.mjs:2
scripts/closing-guard-core.mjs:2
scripts/board-heartbeat.mjs:2
scripts/board-heartbeat-core.mjs:2
scripts/batch-singleton.mjs:2
scripts/batch-daemon-core.mjs:2
scripts/wait-lease.mjs:1
scripts/verify/sections.mjs:1
scripts/verify/run-wait.mjs:1
scripts/verify/report.mjs:1
scripts/verify/report-archive-names.mjs:1
scripts/verify/polish-children.mjs:1
scripts/verify/enrichments.mjs:1
scripts/vdzk-admissibility-core.mjs:1
scripts/repository-integrity.mjs:1
scripts/render-verify-guard.mjs:1
scripts/queue-rank-core.mjs:1
scripts/queue-order-guard-core.mjs:1
scripts/pause-retry-drill.mjs:1
scripts/path-scope-guard.mjs:1
scripts/notify.mjs:1
scripts/handover-attribution-core.mjs:1
scripts/fold-point-core.mjs:1
scripts/fixtures/point-cost/codex-unrelated.jsonl:1
scripts/fixtures/point-cost/codex-review.jsonl:1
scripts/fixtures/point-cost/codex-author.jsonl:1
scripts/durable-lane-flag-core.mjs:1
scripts/dashboard-sync.mjs:1
scripts/dashboard-guard.mjs:1
scripts/closing-reply-core.mjs:1
scripts/board-queue.mjs:1
scripts/board-first-guard.mjs:1
scripts/batch-state.mjs:1
scripts/batch-progress-guard.mjs:1
scripts/batch-pause-core.mjs:1
scripts/batch-lock.mjs:1
scripts/batch-launcher-core.mjs:1
scripts/batch-daemon-drill.mjs:1
scripts/batch-claim.mjs:1
scripts/authorship-check.mjs:1
```

### I8. Per-file occurrence counts — test files (scripts/ and src/)

```
scripts/mechanism-review-core.test.mjs:208
scripts/model-guard-core.test.mjs:197
scripts/review-astra-cli.test.mjs:153
scripts/mechanism-review-cli.test.mjs:151
scripts/review-astra-core.test.mjs:122
scripts/author-routing-core.test.mjs:96
scripts/fable-switch-core.test.mjs:83
scripts/astra-share-core.test.mjs:75
scripts/mechanism-review-range-core.test.mjs:65
scripts/ask-astra-cli.test.mjs:61
scripts/blind-merge-core.test.mjs:56
scripts/blind-merge-cli.test.mjs:48
scripts/mechanism-review-guard.test.mjs:45
scripts/author-astra-core.test.mjs:43
scripts/author-astra-cli.test.mjs:42
scripts/context-fence-core.test.mjs:41
scripts/render-verify-core.test.mjs:39
scripts/astra-share-cli.test.mjs:38
scripts/authorship-check-core.test.mjs:35
scripts/author-fable-cli.test.mjs:32
scripts/batch-in-flight-core.test.mjs:28
scripts/batch-boundary-core.test.mjs:26
scripts/ask-astra-core.test.mjs:26
scripts/request-approval-guard-core.test.mjs:23
scripts/point-brief-core.test.mjs:20
scripts/measure-point-cost.test.mjs:20
scripts/author-fable-core.test.mjs:19
scripts/criticality-review-guard.test.mjs:18
scripts/model-trailer-gate.test.mjs:17
scripts/measure-point-cost-core.test.mjs:17
scripts/review-astra-plan.test.mjs:16
scripts/author-astra-session.test.mjs:15
scripts/rule-echo-core.test.mjs:14
scripts/model-handoff-core.test.mjs:14
scripts/batch-autostart-core.test.mjs:14
scripts/criticality-review-guard-core.test.mjs:13
scripts/four-eyes-artefacts.test.mjs:12
scripts/fable-switch-cli.test.mjs:12
src/config/fableEscalationDoc.test.ts:11
scripts/land-point-runner.test.mjs:8
scripts/git-tracked.test.mjs:8
scripts/land-point-core.test.mjs:7
scripts/fold-point-core.test.mjs:7
scripts/dashboard-sync-core.test.mjs:7
src/scenes/place/inhabitantBodies.test.ts:5
scripts/verify/run-all.test.mjs:5
scripts/user-gate-core.test.mjs:5
scripts/guard-hooks.test.mjs:5
scripts/context-fence-guard.test.mjs:5
scripts/commission-guard.test.mjs:5
scripts/closing-guard-core.test.mjs:5
scripts/verify/run-record.test.mjs:4
scripts/verify/run-logged.test.mjs:4
scripts/review-material-core.test.mjs:4
scripts/review-astra-contribution.test.mjs:4
scripts/help-core.test.mjs:4
scripts/guide-brevity-core.test.mjs:4
scripts/findings-request-core.test.mjs:4
scripts/failure-lane-retry-drill.test.mjs:4
scripts/context-incidents-core.test.mjs:4
scripts/command-classify-core.test.mjs:4
src/scenes/place/tagShuffle.boundary.test.ts:3
scripts/verify/labelFusion.test.mjs:3
scripts/verify/baseline-classify.test.mjs:3
scripts/vdzk-admissibility-core.test.mjs:3
scripts/queue-rank-core.test.mjs:3
scripts/cloud-switch-core.test.mjs:3
scripts/board-queue-core.test.mjs:3
scripts/board-heartbeat.test.mjs:3
scripts/batch-resume-hook-core.test.mjs:3
scripts/batch-claim-core.test.mjs:3
scripts/authorship-check-cli.test.mjs:3
src/systems/mixLimiter.test.ts:2
src/scenes/place/wedgeCarve.test.ts:2
src/scenes/place/tagShuffle.bankRound.test.ts:2
scripts/verify/run-wait-core.test.mjs:2
scripts/verify/polishJarCoverage.test.mjs:2
scripts/verify/ladder-core.test.mjs:2
scripts/verify/childMotionMetric.test.mjs:2
scripts/queue-order-guard-core.test.mjs:2
scripts/point-proof-core.test.mjs:2
scripts/guard-health-core.test.mjs:2
scripts/firewall-allow.test.mjs:2
scripts/container-ask-guard-core.test.mjs:2
scripts/commit-scope-guard-core.test.mjs:2
scripts/board-heartbeat-core.test.mjs:2
scripts/board-core.test.mjs:2
scripts/batch-state.test.mjs:2
scripts/batch-lease-core.test.mjs:2
src/systems/pursuit.test.ts:1
src/systems/appearance.test.ts:1
src/systems/ambience.test.ts:1
src/scenes/place/tagGame.test.ts:1
src/scenes/place/routing.test.ts:1
src/scenes/place/looseRocks.test.ts:1
src/scenes/place/loom.test.ts:1
src/scenes/place/lifeSpots.test.ts:1
src/scenes/place/groundScatter.test.ts:1
src/scenes/place/bankStage.test.ts:1
src/scenes/place/FisheryNetMan.test.tsx:1
scripts/verify/sections.test.mjs:1
scripts/verify/run-wait.test.mjs:1
scripts/timestamp-guard.test.mjs:1
scripts/render-verify-recorder.test.mjs:1
scripts/render-verify-guard.test.mjs:1
scripts/guard-preflight-core.test.mjs:1
scripts/findings-fixtures.test.mjs:1
scripts/findings-core.test.mjs:1
scripts/finding-request-cli.test.mjs:1
scripts/durable-lane-flag-core.test.mjs:1
scripts/doc-budget-core.test.mjs:1
scripts/defer-for-user-cli.test.mjs:1
scripts/decision-card-guard-core.test.mjs:1
scripts/cut-account-core.test.mjs:1
scripts/context-incidents.test.mjs:1
scripts/closing-reply-core.test.mjs:1
scripts/board-heartbeat-wiring.test.mjs:1
scripts/batch-state-durability.test.mjs:1
scripts/batch-singleton-core.test.mjs:1
scripts/batch-pause-core.test.mjs:1
scripts/batch-launcher-daemon.test.mjs:1
scripts/batch-autonomy-inventory.test.mjs:1
```

### I9. Literal model-name strings in scripts/ (count, quoted literal)

```
    154 'GPT-5.6 Sol'
    137 'Claude Opus 5'
     67 'Opus 5'
     57 'Fable 5.1'
     47 'Fable 5'
     44 'GPT-6 Astra'
     21 'Claude Opus 5 <noreply@anthropic.com>'
     20 'claude-fable-5-1'
     16 'Claude Fable 5.1'
     15 'gpt-6-astra'
     15 'Opus 4.8'
     13 'claude-opus-5'
     11 'claude-opus-4-8[1m]'
     10 'Claude Opus 4.8'
     10 'Claude Haiku 4.5 <noreply@anthropic.com>'
      8 'Claude Fable 5'
      7 'Claude Fable 5.1 <noreply@anthropic.com>'
      5 'claude-haiku-4-5'
      5 'claude-fable-5'
      5 'Claude Haiku 4.5 <x@y>'
      4 'claude-opus-5[1m]'
      4 'claude-haiku-4-5-20251001'
      4 'Claude Sonnet 5 <noreply@anthropic.com>'
      4 'Claude Sonnet 5 / Claude Opus 5 <x@y>'
      4 'Claude Opus 4.8 <noreply@anthropic.com>'
      3 'Claude Opus 5 (1M context) <noreply@anthropic.com>'
      3 'Claude Opus 4.8 (1M context) <noreply@anthropic.com>'
      3 'Claude Fable 5 <noreply@anthropic.com>'
      2 'gpt-5.6-sol'
      2 'claude-opus-5-20260801'
      2 'claude-opus-4-8'
      2 'GPT-7 Astra'
      2 'Claude Opus 5 <a@b>; Claude Fable 5 <c@d>'
      2 'Claude Opus 5 <a@b>'
      2 'Claude Opus 5 / Claude Fable 5.1 <x@y>'
      2 'Claude Opus 5 (1M, extended) <a@x>'
      2 'Claude Opus 5 (1M context)'
      2 'Claude Opus 5 (1M context <a@x>,Claude Haiku 4.5 <b@x>,Claude Opus 5 (1M context) <c@x>'
      2 'Claude Opus 4.8 <a@x>,Claude Haiku 4.5 <b@x>'
      2 'Claude Nano 6 <noreply@anthropic.com>'
      2 'Claude Haiku 4.5'
      2 'Claude Fable 5.1 <x@y>'
      1 'gpt-does-not-exist-9.9'
      1 'claude-opus-5-5[1m]'
      1 'Opus 5.5'
      1 'Claude Sonnet 5'
      1 'Claude Sonnet 5 (fable fallback) <noreply@anthropic.com>'
      1 'Claude Opus 5.5'
      1 'Claude Opus 5 and GPT-5.6 Sol <x@y>'
      1 'Claude Opus 5 [Sonnet 5] <x@y>'
      1 'Claude Opus 5 [1m <a@x>,Claude Haiku 4.5 <b@x>,Claude Opus 5 [1m] <c@x>'
      1 'Claude Opus 5 GPT-5'
      1 'Claude Opus 5 <x@y>'
      1 'Claude Opus 5 <build@astra.example>'
      1 'Claude Opus 5 <a@x>;Claude Fable 5.1 <b@x>'
      1 'Claude Opus 5 <a@x>,Claude Fable 5.1 <b@x>'
      1 'Claude Opus 5 <a@x>,Claude <b@x>'
      1 'Claude Opus 5 <a@x>'
      1 'Claude Opus 5 <a@x(,Claude Haiku 4.5 <b@x>'
      1 'Claude Opus 5 / Claude Haiku 4.5 <x@y>'
      1 'Claude Opus 5 (x <a@x>;Claude Haiku 4.5 <b@x>;Claude Fable 5.1 (y) <c@x>'
      1 'Claude Opus 5 (Haiku 4.5) <x@y>'
      1 'Claude Opus 5 (1M, extended) <noreply@anthropic.com>'
      1 'Claude Opus 5 (1M'
      1 'Claude Opus 5 (1M context) <x@y>'
      1 'Claude Opus 4.8 <a@x>,Claude Fable 5.1 <b@x>'
      1 'Claude Haiku 4.5, opus-equivalent <noreply@anthropic.com>'
      1 'Claude Haiku 4.5 (opus mode) <x@y>'
      1 'Claude Haiku 4.5 (opus mode) <noreply@anthropic.com>'
      1 'Claude Haiku 4'
      1 'Claude Fable 5 <c@d>'
```

### I10. Vendor/model-named quoted ids in scripts/ (count, literal)

```
     90 'astra'
     49 'prefer-astra'
     41 'fable'
     29 'opus'
     28 'codex'
     22 'openai'
     22 'anthropic'
     13 'sol'
      8 'sol-authored'
      8 'astra-authored'
      6 'review-astra'
      6 'author-astra'
      5 'astra-unavailable'
      5 'ask-astra'
      3 'sole'
      3 'codex-batches'
      3 'author-fable'
      3 'astra-share'
      2 'sol-only'
      2 'astra-only'
      1 'sol-work'
      1 'sol-unavailable'
      1 'sol-turn'
      1 'review-astra-cli-'
      1 'last-fable'
      1 'hoa-fable-switch-'
      1 'hoa-astra-share-'
      1 'first-opus'
      1 'fable-work'
      1 'fable-switch'
      1 'fable-run'
      1 'codex-home'
      1 'bulk-sol'
      1 'astra-was-not-an-author'
      1 'astra-turn'
      1 'astra-authorship-requires-role-swap'
```

### I11. docs/ — per-file counts

```
docs/tasks-archive.md:588
docs/blind-633/B.txt:582
docs/blind-633/A.txt:537
docs/blind-757/decide.txt:88
docs/astra-routing.md:79
docs/analysis_de/retrospektive-zusammenarbeit.md:59
docs/backlog.md:40
docs/handover-architecture.md:36
docs/blind-633/decisions/c01.json:34
docs/four-eyes/676-provenance.md:28
docs/point-cost-ledger.json:27
docs/blind-633/decisions/c06.json:22
docs/rule-corpus-audit.md:20
docs/blind-633/decisions/c04.json:19
docs/analysis_de/durchsatz-analyse.md:18
docs/blind-633/parts-manifest.json:17
docs/point-cost-report.md:14
docs/four-eyes/1209-blind-b-astra.md:14
docs/command-index.md:14
docs/blind-633/decisions/c05.json:14
docs/batch-autonomy.md:13
docs/four-eyes/1209-union-fable.md:11
docs/peoples-1890.md:10
docs/four-eyes/README.md:10
docs/four-eyes/1316-provenance.md:10
docs/four-eyes/713-union.json:9
docs/blind-633/decisions/c13.json:9
docs/four-eyes/713-provenance.md:8
docs/four-eyes/1209-blind-b-astra.json:8
docs/four-eyes/1209-blind-a-opus55.json:7
docs/context-cut-list-1209.md:7
docs/blind-633/decisions/c12.json:7
docs/natural-villager-motion-concept.md:6
docs/four-eyes/676-union.json:6
docs/four-eyes/676-blind-b-sol.md:6
docs/four-eyes/676-blind-b-sol.json:6
docs/four-eyes/659-provenance.md:6
docs/four-eyes/1209-union.json:6
docs/four-eyes/1209-blind-a-opus55.md:6
docs/blind-768/merge-instruction.md:6
docs/batch-owner-runbook.md:6
docs/blind-757/README.md:5
docs/picture-check-cost.md:4
docs/maximum-qa.md:4
docs/four-eyes/1316-union.json:4
docs/blind-723/merge-instruction.md:4
docs/four-eyes/676-blind-a-opus5.md:3
docs/document-cut-757.md:3
docs/blind-768/README.md:3
docs/blind-757/union.json:3
docs/blind-757/list-B.md:3
docs/blind-723/README.md:3
docs/blind-713/round-9-findings.txt:3
docs/blind-1287/dispositions.md:3
docs/work-packages.md:2
docs/picture-check-levers.md:2
docs/multistep-analysis-17-08/multistep-union.json:2
docs/four-eyes/676-blind-a-opus5.json:2
docs/four-eyes/1048-blind-a-opus5.md:2
docs/document-cut-757-evidence/owner.json:2
docs/criticality-review.md:2
docs/communication-review-659/findings-round-7.md:2
docs/communication-review-659/findings-round-6.md:2
docs/communication-review-659/findings-round-5.md:2
docs/communication-review-659/findings-round-4.md:2
docs/communication-review-659/findings-round-3.md:2
docs/blind-768/union.json:2
docs/blind-768/instruction.md:2
docs/blind-757/merge-instruction.md:2
docs/blind-757/list-A.md:2
docs/blind-723/list-A-raw.md:2
docs/blind-659/point.txt:2
docs/blind-633/decisions/c03.json:2
docs/blind-1287/B.txt:2
docs/blind-1287/A.txt:2
docs/blind-1048/material.md:2
docs/analysis_de/lesson-mechanisms.md:2
docs/research/natural-villager-motion.md:1
docs/multistep-analysis-17-08/multistep-B.md:1
docs/four-eyes/947-union.json:1
docs/four-eyes/947-blind-b-sol.json:1
docs/four-eyes/947-blind-a-opus5.json:1
docs/four-eyes/713-blind-b-sol.json:1
docs/four-eyes/713-blind-a-opus5.json:1
docs/four-eyes/659-blind-b-astra.json:1
docs/four-eyes/659-blind-a-opus55.json:1
docs/four-eyes/633-union.json:1
docs/four-eyes/633-blind-b-opus55.json:1
docs/four-eyes/633-blind-a-astra.json:1
docs/four-eyes/1316-blind-b-astra.md:1
docs/four-eyes/1316-blind-b-astra.json:1
docs/four-eyes/1316-blind-a-opus55.md:1
docs/four-eyes/1316-blind-a-opus55.json:1
docs/four-eyes/1048-union.json:1
docs/four-eyes/1048-blind-b-sol.md:1
docs/four-eyes/1048-blind-b-sol.json:1
docs/four-eyes/1048-blind-a-opus5.json:1
docs/communication-review-659/findings-round-2.md:1
docs/communication-review-659/audio-and-teaching-order.md:1
docs/blind-947/material.md:1
docs/blind-757/instruction.md:1
docs/blind-723/union.json:1
docs/blind-713/round-6-findings.txt:1
docs/blind-659/union.json:1
docs/blind-659/material.md:1
docs/blind-633/decisions/c14.json:1
docs/blind-633/decisions/c02.json:1
docs/blind-1287/union.json:1
docs/blind-1287/count.txt:1
docs/blind-1287/B.json:1
docs/blind-1287/A.json:1
```

### I12. src/ — non-test mentions (all are historical attribution comments or game prose)

```
src/config/balance.ts:2457: * search (GPT-6 Astra, 04.10.2026) found a dated figure for any of them.
src/config/balance.ts:2466:   *  record gives no population-wide date (Astra B44), so it is rank-gated. */
src/i18n/en.ts:875:      'Cairo, January 1890. [excited]Today my expedition begins.[/excited] With 250 dollars in my pocket, a bundle of trade gifts, and more h
src/scenes/place/PlaceScene.tsx:2712:    // one, and its shutter then gated the near one alone (GPT-5.6 Sol, first
src/scenes/place/tagShuffleHarness.ts:181:  // (GPT-5.6 Sol, first cross-vendor round, D10).
src/scenes/place/tagShuffleHarness.ts:372:  // (GPT-5.6 Sol, first cross-vendor round, D9).
src/scenes/place/inhabitantBodies.ts:243: * (GPT-5.6 Sol, 12.08.2026). The wanted point used to be returned unchanged,
src/scenes/place/inhabitantBodies.ts:266:  // SAMPLES (GPT-5.6 Sol, 12.08.2026, both findings): a step whose endpoint
src/scenes/place/inhabitantBodies.ts:463:  // ONE MOVEMENT BUDGET PER BODY PER FRAME (GPT-5.6 Sol, 12.08.2026). Every sweep
src/scenes/place/PlaceLife.tsx:307:  // frame below would skip him for good (GPT-6 Astra review, pass 5).
src/scenes/place/PlaceLife.tsx:326:  // frozen mid-stride (GPT-6 Astra review, second round).
src/scenes/place/PlaceLife.tsx:3986:  // the bank stage off entirely went by as success (GPT-5.6 Sol, first
src/scenes/place/riverBank.ts:297: * (GPT-5.6 Sol, first cross-vendor round, D3/D7).
src/scenes/place/looseRocks.ts:104:  // would never run in the game at all (GPT-6 Astra, cross-vendor review of
src/scenes/place/adultWork.ts:695:    // 1125, GPT-6 Astra cross-vendor round). Gating the pose on the working rim
src/scenes/place/layout.ts:1926:   * inside the children's earshot (GPT-5.6 Sol, first cross-vendor round, A4).
src/scenes/place/layout.ts:1937:   * three — could not (GPT-5.6 Sol, confirming round, hearing separation).
src/scenes/place/layout.ts:2144:    // ground that is standable (GPT-5.6 Sol, first cross-vendor round, B4).
src/scenes/place/layout.ts:2449:      // (GPT-6 Astra review, pass 7).
src/scenes/place/loom.ts:344:  // (GPT-6 Astra review, pass 8).
src/scenes/place/placeFigure.tsx:121:   * to indicate the river (GPT-5.6 Sol, first cross-vendor round, C2). The arm
src/systems/pursuit.ts:338:      // A THIRD CURE FAMILY WAS MEASURED AND REJECTED TOO (Sol re-review +
src/systems/appearance.ts:184:      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('small boys: no age-specific source (Astra B3, §8.3)'))],
src/systems/appearance.ts:329:      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('pre-initiation dress needs a passage (Astra B31, §8.3)'))],
src/systems/appearance.ts:339:      child: [layer('hip', 'loinFlap', 'hide', C.hide, 'waist', G('pre-initiation dress needs a passage (Astra B31, §8.3)'))],
src/systems/appearance.ts:492:      child: [layer('torso', 'shirt', 'cotton', C.cotton, 'chest', G('one universal age rule unsupported (Astra B19)'))],
src/systems/appearance.ts:505:      child: [childHip('skirtShort', 'cotton', C.indigo), childBeads('one universal age rule unsupported (Astra B19)')],
src/world/communicationRock.ts:204: *  missed (four-eyes review by GPT-5.6 Sol, 11.08.2026).
```
