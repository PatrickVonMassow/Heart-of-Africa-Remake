# Generic model lanes — blind design half A (Claude Opus 5.5)

Inputs: the point's spec text and `docs/model-lanes-inventory-1393.md`. Written before
half B was commissioned; half B never saw this file.

## Lane record and the one data module

- **A1 — `scripts/model-lanes.mjs` holds a frozen `LANES` array; one record per lane:**
  `{ role, vendor, display, trailerName, id, retired, familyWords, runtime, effort,
  scarce, cliKeys }`. `role` is the stable key consumers use (`main`, `main-fallback`,
  `scarce`, `cross`); `vendor` is an opaque string (`anthropic`, `openai`) that consumers
  only compare; `display` is the short name (`Opus 5.5`, `GPT-6.1 Sol`); `trailerName` is
  what a `Co-Authored-By` line carries (`Claude Opus 5.5`, `GPT-6.1 Sol`); `id` is the model
  id handed to the runtime (`claude-opus-5-5[1m]`, `gpt-6.1-sol`); `retired` lists every
  former display name and id of the lane; `familyWords` are the words the guard recognises
  the lane by (`opus`; `fable`; `sol`, `astra`); `runtime` is `claude` or `codex`; `effort`
  is the reasoning effort the lane is addressed with; `scarce` marks switch-gated lanes;
  `cliKeys` are the accepted `--model`/`--lane` spellings, including the old ones
  (`astra`, `fable`, `opus`, `opus48`) so a typed habit keeps working.
- **A2 — The same module holds the vendor table and the non-lane recognisers:** `VENDORS`
  `{ <vendor>: { address, markerWords, addressDomain } }` (commit address
  `noreply@anthropic.com` / `noreply@openai.com`, marker words for vendor detection),
  `FOREIGN_FAMILY_WORDS` (sonnet, haiku, gemini, grok, llama, …: recognised as models but
  never authors), and `RUNTIMES` `{ codex: { bin, homeEnv: 'CODEX_HOME' }, claude: { bin } }`.
  `model-guard-core`'s `MODEL_FAMILY_WORD` and `MODEL_VENDOR_ADDRESS` are built from these.
- **A3 — Helpers exported beside the data, all pure:** `lane(role)` (throws on unknown role),
  `laneOf(name)` (resolves display, trailerName, id, retired name, or family word + version
  to a record, else `null`), `vendorOf(name)` (lane vendor, else marker/address detection
  over `VENDORS`, else `'unknown'`; contradictory markers stay `'unknown'` as today),
  `trailerFor(role)` (the full `Co-Authored-By` value), `sameLane(a, b)`, `laneByCliKey(key)`,
  `authorRoles()` (roles allowed to author; the scarce lane only while its switch is on).
- **A4 — Constants named by role, derived from records, for the few consumers that want a
  string:** `MAIN_MODEL`, `MAIN_MODEL_ID`, `MAIN_TRAILER_NAME`, `MAIN_FALLBACK_MODEL(_ID)`,
  `SCARCE_MODEL(_ID)`, `CROSS_MODEL(_ID)`, `CROSS_EFFORT`. No `ASTRA_*`, `FABLE_*`, `OPUS_*`,
  `OPENAI_*`, `CODEX_*`, `CLAUDE_MODEL` remains in consumer code. `fable-switch-core.mjs`
  loses its identity block entirely; it does not re-export.

## Rename map

- **A5 — Scripts (with their `-core`, `-cli.test`, `-core.test` and other test siblings):**
  `fable-switch(-core).mjs` → `lane-switch(-core).mjs`; `astra-share(-core).mjs` →
  `lane-routing(-core).mjs`; `review-astra(-core).mjs` → `cross-review(-core).mjs`;
  `ask-astra(-core).mjs` → `ask-lane(-core).mjs`; `author-astra(-core).mjs` →
  `author-delegate(-core).mjs` with `--lane <role>` (default `cross`);
  `author-fable.mjs` is deleted (it is a 10-line call of `runAuthoringCli({ authorLane:
  'fable' })`, now `author-delegate.mjs --lane scarce`); `author-fable-core.mjs` →
  `author-delegate-claude-core.mjs` (the claude-runtime half of the authoring wrapper,
  named by runtime role, not by model).
- **A6 — Identifiers:** codex-runtime functions are named by what they do for a runtime,
  not by the product: `codexArgs` → `execReviewArgs`, `authoringCodexArgs` →
  `execAuthoringArgs`, `runCodex` → `runExecRuntime`, `parseCodexTranscript` →
  `parseRolloutTranscript`, `listCodexRollouts` → `listRollouts`, `codexTokens` →
  `rolloutTokens`; `recordAstraRun`/`afterAstraRun` → `recordCrossRun`/`afterCrossRun`;
  `astraAuthored` → `crossAuthored`; `kindsToAstra` → `kindsToCross`; `isOpenAiLane` →
  `isCrossLane`; `fableIsOn`, `fableRefusalReason`, `fableStateAtCommit`,
  `fableAuthoringOutcome`, `currentFableState` → `scarceIsOn`, `scarceRefusalReason`,
  `scarceStateAtCommit`, `scarceAuthoringOutcome`, `currentSwitchState`;
  `FABLE_ESCALATION_ROUNDS` → `SCARCE_ESCALATION_ROUNDS` (its one `src/` test consumer follows).
- **A7 — Environment variables:** `ASTRA_SHARE_FILE` → `LANE_ROUTING_FILE`, `FABLE_SWITCH_FILE`
  → `LANE_SWITCH_FILE`, `FABLE_SWITCH_SET_BY` → `LANE_SWITCH_SET_BY`, `REVIEW_ASTRA_STATE_DIR`
  → `CROSS_REVIEW_STATE_DIR`, `MEASURE_CODEX_SESSIONS_DIR` → `MEASURE_ROLLOUT_SESSIONS_DIR`.
  `CODEX_HOME` is the external CLI's own contract and stays, but only as the
  `RUNTIMES.codex.homeEnv` datum.
- **A8 — Routing setting values:** `claude-only | default | prefer-astra` become
  `main-only | default | prefer-cross`. Handover reasons `astra-authored |
  astra-unavailable` become `cross-authored | cross-unavailable`; route outcome
  `astra-unavailable` likewise.

## Retired names and legacy reads

- **A9 — Landed trailers keep verifying through `retired`:** the cross lane record carries
  `retired: ['GPT-6 Astra', 'GPT-5.6 Sol', 'gpt-6-astra', 'gpt-5.6-sol']` and
  `familyWords: ['sol', 'astra']`; `laneOf('GPT-6 Astra')` and `laneOf('GPT-5.6 Sol')` both
  answer the cross lane. The model-guard allowlist is derived from `familyWords` of the
  authoring lanes, so its patterns stay exactly as broad as today (`opus`, `astra|sol`,
  switch-gated `fable`).
- **A10 — Self-review ban treats the cross lane's three names as ONE identity:** `sameModel`
  keeps family+version semantics for main lanes (so Opus 4.8 may still review Opus 5.5 work,
  as the fallback chain requires), but answers `true` whenever both names resolve through
  `laneOf` to the same lane record by an explicit name (display, trailerName, id, retired).
  `GPT-6.1 Sol` vs `GPT-6 Astra` is therefore one model; `Opus 5.5` vs `Opus 4.8` stays two.
  Historical Opus names (`Opus 5`, `Claude Opus 5`) are NOT put into the main lane's
  `retired`, because that would turn recorded Opus 5.5-reviews-Opus-5 pairs into self-reviews
  retroactively.
- **A11 — Persisted values are read through retired maps and written in the new spelling:**
  `.claude/lane-routing.json` is read first, `.claude/astra-share.json` second; setting
  `claude-only` reads as `main-only`, `prefer-astra` as `prefer-cross`. The switch file is
  `.claude/lane-switch-<role>.json`; for role `scarce`, `.claude/fable-switch.json` is read when
  the new file is absent. Ledger handover reasons `astra-*` and `sol-*` map to `cross-*`
  (extending today's `RETIRED_HANDOVERS`). The recorded switch-fallback reason prefix
  (the `prefix` literal in `isSwitchFallbackReason`, scripts/fable-switch-core.mjs) stays recognised by `isSwitchFallbackReason` as a retired prefix; new rows
  use the role wording. These legacy literals live in `model-lanes.mjs` (`LEGACY` block).
- **A12 — No compatibility shim scripts under old names.** `.claude/settings.json` names
  none of them (inventory I6), so no hook breaks. Command parsers that classify a call by its
  script name (`batch-in-flight-core` `commissionTarget`, `context-fence-core`,
  `context-incidents-core`, `command-classify-core`) accept the new names and, for one
  release, the old ones too (a daemon started before the landing may still run them).

## Cross-vendor rule

- **A13 — One predicate:** `reviewIdentityProblem(reviewer, commit)` compares
  `vendorOf(reviewer)` with `vendorOf(author)` for every author; `'unknown'` on either side
  refuses as today. No consumer contains a vendor name; `modelVendor` in
  `mechanism-review-core` becomes a re-export of `vendorOf`. The reviewer chain for
  "work of vendor X" is `LANES.filter(l => l.vendor !== X)` ordered by a `reviewOrder`
  datum, so the review command picks "a lane of another vendor than the author" without
  knowing which vendor that is.
- **A14 — Fallback chains are role lists in data:** `REVIEW_CHAINS = { crossUnavailable:
  ['scarce', 'main', 'main-fallback'], crossAuthored: ['main', 'scarce', 'main-fallback'] }`
  and the merger roster likewise; consumers map roles to records.

## Policy text, docs, tests

- **A15 — CLAUDE.md §6** speaks of roles only: main chain, cross-vendor reviewer, scarce lane,
  and names the role-named scripts. The sentence "GPT-6 Astra authors
  difficult/complex/error-prone/HIGH points" is deleted; the policy line becomes: authoring
  follows `lane-routing`; review is cross-vendor by `cross-review.mjs`; `lane-switch.mjs
  --status` decides the scarce lane. Measured with `doc-budget-core.mjs`; must not grow.
- **A16 — Commit trailers keep real model names**, produced by `trailerFor(role)`; the
  `commit-msg` gate's suggestion text is generated from `LANES`.
- **A17 — Tests import lane data:** `lane('cross').trailerName`, `trailerFor('main')`,
  `lane('cross').retired[0]` etc. replace literals. Fixtures that exercise parsing of
  NON-lane or historical names (Haiku, Sonnet, `Claude Opus 5`, dated ids) take them from a
  `TEST_NAMES` export of `model-lanes.mjs`, so even fixture names have one home.
- **A18 — Operational docs follow the rename** (`astra-routing.md` → `lane-routing.md`,
  `batch-owner-runbook.md`, `scripts/verify/README.md`, `command-index.md`,
  `batch-autonomy.md`, `handover-architecture.md`, `four-eyes/README.md`). Historical
  records (`tasks-archive.md`, `blind-*/`, `four-eyes/<point>-*`, `analysis_de/`,
  ledgers, retrospectives) are not consumers and are left verbatim.
- **A19 — Comments:** current-state comments in touched files are rewritten to roles
  ("the cross lane"); historical attribution comments ("found by GPT-5.6 Sol, 12.08.")
  stay — they are provenance, not configuration. `src/` comments are all of this kind.

## Gate

- **A20 — The verifiable "no consumer names a concrete model" is a unit test**,
  `scripts/model-lanes.test.mjs`: (a) no file name under `scripts/` carries a vendor or model
  word; (b) with comments stripped, no `scripts/**/*.mjs` other than `model-lanes.mjs` contains
  a lane's display/trailer/id/retired string or a vendor-named identifier
  (`ASTRA_`, `FABLE_`, `OPUS_`, `OPENAI`, `CODEX_`, `Astra`, `Fable` in identifiers).
  Exceptions are an explicit, commented allowlist (historical JSON fixtures).

## Migration order

- **A21 —** (1) add `model-lanes.mjs` + its test with the new cross lane; make
  `fable-switch-core` import identities from it (green, no behaviour change except the
  cross id/name); (2) rename scripts family by family (`git mv` + import rewrite), one
  commit each, unit suite green after each; (3) rename identifiers/env vars; (4) move
  vendor detection and allowlist derivation to lane data; (5) persisted-value retired maps;
  (6) tests onto lane data; (7) hygiene test; (8) docs and CLAUDE.md; (9) gate + review.

## Risks

- **A22 — A running daemon or batch on `main`** invokes old script names until restarted
  after the landing; mitigated by A12 (classifiers accept both) — but a spawn of
  `scripts/author-astra.mjs` from an old daemon process fails once the file is gone. Owner
  must restart the daemon after landing.
- **A23 — Ledger compatibility:** every persisted string that changes spelling (settings,
  handover reasons, switch-fallback prefix, `astra-unavailable` outcomes) needs a retired read
  path, or a landed record stops verifying; covered by tests replaying real ledger rows.
- **A24 — The cross lane's new id is not proven by a unit test;** reachability still depends on
  the probe (`cross-review` probe receipt). The probe-receipt fingerprint changes with the id,
  so the first review after landing re-probes.
- **A25 — Size:** ~240 files touched; a merge conflict with concurrent `main` work is
  likely in tests. Keep commits per family so a rebase conflict stays local.
- **A26 — Memory entries** naming old scripts (`MEMORY.md`, `fable-sparingly.md`,
  `findings-carrier.md`, `hard-cases-go-to-sol.md`, `serving-model-watch.md`,
  `effort-high-for-implementation.md`) are outside the repo and must be updated by the owner.
