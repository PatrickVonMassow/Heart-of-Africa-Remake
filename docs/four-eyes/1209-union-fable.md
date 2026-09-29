--- Fable 5.1 said ---
Two notes before the merge.

- **Output shape:** the question asks for one JSON object and the wrapper asks for `B<n> | <file> | <item>` lines at the end, so I deliver both. Line `B<n>` is union entry `U<n>` for n = 1–225; `B226`–`B235` are items neither list wrote down.
- **Limits:** no part of the two lists is marked TRUNCATED. The underlying bundle, CLAUDE.md, MEMORY.md and hook sources are not attached, so every "keep" or "reword" is judged against the lists' descriptions, not the original wording. No switch for hiding skills, agents or connectors is verified here.

{"mergedBy":"Fable 5.1","entries":[
{"id":"U1","from":["A:D-CLAUDE-1-1","B115"],"defect":"CLAUDE.md §1 goal — reword — both agree; wording: 'Build a runnable modern-remake POC of the core loop, not the complete game. design.md = target; this file = build/verification policy.'"},
{"id":"U2","from":["A:D-CLAUDE-2-1","B116"],"defect":"CLAUDE.md §2 single-player only — keep — A keep vs B reword; B's wording saves nothing over an already terse bullet and a rewrite only risks drift."},
{"id":"U3","from":["A:D-CLAUDE-2-2","B117"],"defect":"CLAUDE.md §2 no onboarding/tutorial — keep — A keep vs B reword; B itself calls it already compact."},
{"id":"U4","from":["A:D-CLAUDE-2-3","B118"],"defect":"CLAUDE.md §2 no invented systems, missing concept = open item — keep — A keep vs B reword; no evidenced saving from rewording."},
{"id":"U5","from":["A:D-CLAUDE-2-4","B119"],"defect":"CLAUDE.md §2 numeric guesses in src/config/balance.ts — keep — A keep vs B reword; B's text names design.md §14 and 'never override stated values', so the current bullet must keep both clauses if it has them (original not attached)."},
{"id":"U6","from":["A:D-CLAUDE-2-5","B120"],"defect":"CLAUDE.md §2 §7.1 checklist not gate — reword — wording: '§7.1 is an acceptance checklist, never a work-start gate; progress = playable output (01.09.2026).' Date suffix kept from A because it marks a user decision."},
{"id":"U7","from":["A:D-CLAUDE-2-6","B121"],"defect":"CLAUDE.md §2 infrastructure freeze — reword — wording: 'Infrastructure freeze: no new guards, ledger fields, routers, review planners, or workflow abstractions. Fix infrastructure only for a reproducible current-game blockade or possible false approval; defer the rest. Switch off obstructing rules; do not rebuild them. (user decision, date suffix)'"},
{"id":"U8","from":["A:D-CLAUDE-2-7","B122"],"defect":"CLAUDE.md §2 finding intake — reword — wording: 'Finding points only for reproducible player impact, security/data risk, real blockade, or deletion/simplification. Otherwise collect in non-blocking docs/backlog.md; close duplicates without new machinery.'"},
{"id":"U9","from":["A:D-CLAUDE-3-1","B123"],"defect":"CLAUDE.md §3 render backends — reword — wording: 'WebGPU primary, automatic WebGL 2 fallback; import three/webgpu, use TSL, no Chrome-only game behavior. Fallback notice: localized and dismissible. Mechanics: docs/render-architecture.md.'"},
{"id":"U10","from":["A:D-CLAUDE-3-2","B124"],"defect":"CLAUDE.md §3 kokoro-js read-aloud — reword (B) over move-to-docs (A) — a bare pointer would remove the three binding constraints from the fixed file; wording: 'Journal TTS: kokoro-js in a Web Worker; lazy-load outside startup chunks; currently English-only. Mechanics: docs/tts-architecture.md.'"},
{"id":"U11","from":["A:D-CLAUDE-3-3","B125"],"defect":"CLAUDE.md §3 runtime dependency needs justification — keep — A keep vs B reword; already one line."},
{"id":"U12","from":["A:D-CLAUDE-4-1","A:D-CLAUDE-4-2","B126"],"defect":"CLAUDE.md §4 design change updates design.md + CLAUDE.md + code; organize by topic — keep — B folds both bullets into one line of the same length; no evidenced saving."},
{"id":"U13","from":["A:D-CLAUDE-5-1","B127"],"defect":"CLAUDE.md §5 tier suites / LARGE per bundle — keep — A keep vs B reword; cadence (once per bundle and at closing) must stay."},
{"id":"U14","from":["A:D-CLAUDE-5-2","B128"],"defect":"CLAUDE.md §5 Vitest vs Playwright layering — reword — wording: 'Each feature adds the right-layer test: Vitest/jsdom for browserless logic/state/HUD; Playwright only for scene, geometry, CSS/layout, audio, screenshots, end-to-end. Map: scripts/verify/README.md.'"},
{"id":"U15","from":["A:D-CLAUDE-6-1","B129"],"defect":"CLAUDE.md §6 branch workflow — reword — wording: 'Each point: feat/<point>-<slug> from main; small atomic self-contained commits; push every commit and report push failure. Merge only complete, tier-green and picture-checked: both backends when isBackendSensitivePath applies, one otherwise. Retest code conflicts.'"},
{"id":"U16","from":["A:D-CLAUDE-6-2","B130"],"defect":"CLAUDE.md §6 merge ends the branch — keep — A keep vs B reword; the cleanup set (local branch, remote branch, worktree) and the branch-hygiene-guard backstop must stay."},
{"id":"U17","from":["A:D-CLAUDE-6-3","B131"],"defect":"CLAUDE.md §6 bookkeeping on main, mechanism in worktree — keep — A keep vs B reword; no saving shown."},
{"id":"U18","from":["A:D-CLAUDE-6-4","B132"],"defect":"CLAUDE.md §6 TASKS.md main-only — keep — A keep vs B reword; mutation order and tasks-source.mjs consumer path stay."},
{"id":"U19","from":["A:D-CLAUDE-6-5","B133"],"defect":"CLAUDE.md §6 landing — reword (B) over move-to-runbook (A) — 'gate mandatory' and 're-verify after sync' bind delegates too, not only the owner; wording: 'Land via node scripts/land-point.mjs <N> --model <m>; post-merge gate is mandatory. Keep branches short; reverify after substantial main sync. Owner procedure: docs/batch-owner-runbook.md.'"},
{"id":"U20","from":["A:D-CLAUDE-6-6","B134"],"defect":"CLAUDE.md §6 delegated author uses point-brief — keep — A keep vs B reword; regenerate-stale and escalate clauses must stay."},
{"id":"U21","from":["A:D-CLAUDE-6-7","B135"],"defect":"CLAUDE.md §6 durable Astra authors — reword — B's line keeps the handover semantics that A's pointer would hide; wording: 'Daemon-owned durable Astra authors survive handover; session-bound Agent children block it. Delegates test, commit, push; never merge.'"},
{"id":"U22","from":["A:D-CLAUDE-6-8","B136"],"defect":"CLAUDE.md §6 context fence — reword (B) over move-to-runbook (A) — in observe mode the guard refuses nothing, so this text is the only thing that acts; wording: 'Context fence: at its refusal mark start no agents, suites, points, or authoring; finishing, reading and boundary remain allowed. Default observe refuses nothing until arming lands. Mechanics: docs/batch-owner-runbook.md.'"},
{"id":"U23","from":["A:D-CLAUDE-6-9","B137"],"defect":"CLAUDE.md §6 model policy — reword — both agree on content; bullets: 'Astra authors difficult/complex/error-prone/HIGH points; Opus 5.5 authors verification-as-work; Fable 5.1 authors tagged/escalated points; unreachable Astra falls back to Opus 5.5. Review cross-vendor, never by a range author (review-astra.mjs for Claude work, Claude for Astra work). fable-switch.mjs --status alone decides Fable authoring/serving/trailer/blind-merge; serving outside its chain pauses the batch. Commits: author-model Co-Authored-By; optional distinct reviewer Reviewed-By, never reviewer Co-Authored-By.' Model version names must match fable-switch, see U46."},
{"id":"U24","from":["A:D-CLAUDE-6-10","B138"],"defect":"CLAUDE.md §6 four eyes, two modes — keep — A keep vs B reword; A calls it terse already, B's text is no shorter."},
{"id":"U25","from":["A:D-CLAUDE-6-11","B139"],"defect":"CLAUDE.md §6 player text from language files, code English — keep — A keep vs B reword; no saving shown."},
{"id":"U26","from":["A:D-CLAUDE-6-12","B140"],"defect":"CLAUDE.md §6 journal §15 markup — reword (B) over move-to-docs (A) — one line keeps the duty visible to whoever writes journal text; wording: 'Every en/de journal text carries design.md §15 emotional markup; display strips it, TTS converts it to prosody. Mechanics: docs/tts-architecture.md.'"},
{"id":"U27","from":["A:D-CLAUDE-6-13","B141"],"defect":"CLAUDE.md §6 small command output, blocked action = project command — keep — A keep vs B reword; this bullet is the reason the duplicate memory line can leave the index (U54)."},
{"id":"U28","from":["A:D-CLAUDE-6-14","B142"],"defect":"CLAUDE.md §6 settled judgment / VDZK authorization — reword for length only — wording: 'Execute settled judgments. Confirm outward-facing/hard-to-reverse steps unless durably authorized. A stated recommendation on a Von-dir-zu-klären card authorizes decision, execution and recorded what/why/veto-effect closure, except tags, publishes, force-pushes, user-data deletions and unrecommended genuine choices. Report failures, skips and verified outcomes faithfully.' Every exception kept."},
{"id":"U29","from":["A:D-CLAUDE-6-15","B143"],"defect":"CLAUDE.md §6 comments brief, // OPEN: — keep — A keep vs B reword; no saving shown."},
{"id":"U30","from":["A:D-CLAUDE-7.1-0","B144"],"defect":"CLAUDE.md §7.1 introduction — reword — it becomes the pointer that replaces the title list (U31); wording: 'POC checklist, not a gate: numbered conditions in docs/acceptance-criteria-detail.md; matching evidence in docs/acceptance-evidence.md. Preserve numbers and update affected copies together.'"},
{"id":"U31","from":["A:D-CLAUDE-7.1-L","B145","B146","B147","B148","B149","B150","B151","B152","B153","B154","B155","B156","B157","B158","B159","B160","B161","B162","B163","B164","B165","B166","B167","B168","B169","B170","B171","B172","B173","B174","B175","B176"],"defect":"CLAUDE.md §7.1 the 32 criterion titles — move-to-docs/acceptance-criteria-detail.md — both agree; no criterion DROPPED, numbers 1–32 stay, criterion 7 details (six tonal words, bank/work teaching, silent tag) and criterion 28 saving/loading stay in the destination; do not append a second inventory if it already holds the titles. Precondition from A: if any test pins the list in CLAUDE.md, keep it there."},
{"id":"U32","from":["A:D-CLAUDE-7.2-1","B177"],"defect":"CLAUDE.md §7.2 build+lint always, unit per change, audit on lockfile — keep — A keep vs B reword; conflict with memory lint-and-cve-clean-always (audit after every change, U126) is unresolved and must not be settled by a rewrite."},
{"id":"U33","from":["A:D-CLAUDE-7.2-2","B178"],"defect":"CLAUDE.md §7.2 player-reachable states, screenshot declares subject — keep — A keep vs B reword; no saving shown."},
{"id":"U34","from":["A:D-CLAUDE-7.2-3","B179"],"defect":"CLAUDE.md §7.2 backend lanes — reword — wording: 'Daily browser lane: WebGPU; LARGE adds full WebGL 2 regression. Every suite asserts requested backend; touch/voice use WebGL 2. WebGL-2-only defects may wait until next LARGE. Operation: scripts/verify/README.md.'"},
{"id":"U35","from":["A:D-CLAUDE-7.2-4","B180"],"defect":"CLAUDE.md §7.2 red run closes only by fix/charge/new point, retry SUSPECT — keep — A keep vs B reword; tension with memory process-scoped-regression is flagged in U135."},
{"id":"U36","from":["A:D-CLAUDE-7.2-5","B181"],"defect":"CLAUDE.md §7.2 dev-mode invariant assertions — keep — A keep vs B reword; 'should' strength stays as written."},
{"id":"U37","from":["A:D-CLAUDE-7.2-6","B182"],"defect":"CLAUDE.md §7.2 before-answering duties — reword (B) over move-to-runbook (A) — A's one-liner invents an owner-only scope the source does not state; wording: 'Before answering: BOARD published/current/concise/single-topic, decisions visible; BATCH advancing within model/context/CI/branch/timestamp/retro rules; WORK ORDER order/spec/split/budgets valid; FINDINGS durably filed; required render/mechanism PROOF supplied. ci-status-guard waits for concluded green CI on every pushed ref. Hook authority: .claude/settings.json.'"},
{"id":"U38","from":["A:D-CLAUDE-7.2-7","B183"],"defect":"CLAUDE.md §7.2 pre-action hooks are pointers — reword (B) over cut (A) — not DROPPED; it names which guard owns which duty before the first refusal; wording: 'Before first mutation, board-first-guard requires current published focus. closing-guard owns §9; npm-install-installed versioned hooks own commit/push syntax.'"},
{"id":"U39","from":["A:D-CLAUDE-7.2-8","B184"],"defect":"CLAUDE.md §7.2 guard-preflight before governed action — keep — A keep vs B reword; command form node scripts/guard-preflight.mjs --for <action> --session <id> must stay."},
{"id":"U40","from":["A:D-CLAUDE-7.2-9","B185"],"defect":"CLAUDE.md §7.2 picture stability before golden-image use — reword (B) over move-to-docs (A) — wording: 'No screenshot-metric golden-image shortcut until picture-stability.mjs <suite> reports STABLE. Verdicts: docs/picture-check-levers.md.'"},
{"id":"U41","from":["A:D-CLAUDE-7.2-10","B186"],"defect":"CLAUDE.md §7.2 fix deviations, never report unfulfilled as fulfilled — keep — A keep vs B reword; no saving shown."},
{"id":"U42","from":["A:D-CLAUDE-9-1","B187"],"defect":"CLAUDE.md §9 closing report contents — keep — A keep vs B reword; every report component stays."},
{"id":"U43","from":["A:D-CLAUDE-9-2","B188"],"defect":"CLAUDE.md §9 CLOSING_STEPS / closing-guard — reword (B) over move-to-runbook (A) — wording: 'Closing order: CLOSING_STEPS in scripts/closing-guard-core.mjs; drive --status then --step <id> --evidence <proof>. closing-guard blocks governed tags/delivery ticks until complete; tag scope: docs/batch-owner-runbook.md#release-and-closing.'"},
{"id":"U44","from":["A:D-CLAUDE-9-3","B189"],"defect":"CLAUDE.md §9 code freeze during closing — keep — A keep vs B reword; it binds delegates (no landing)."},
{"id":"U45","from":["B114"],"defect":"CLAUDE.md title/headings — reword — only B; wording '# HoA POC — session rules'; section numbers and §7.1 anchors must stay stable because other files reference them."},
{"id":"U46","from":["B294"],"defect":"Cross-source model/context conflicts — keep as open item — only B; Fable 5 vs 5.1, hard-coded chain vs fable-switch, 150k vs 122k/150k, heartbeat timing; link authorities, do not invent a merged rule."},
{"id":"U47","from":["B295"],"defect":"Cross-source workflow-scope conflicts — keep as open item — only B; condensation must not pick a side between the conflicting sources."},
{"id":"U48","from":["B296"],"defect":"Release vs poc distinction — keep — only B; generic 'all tags need approval' wording must not erase the requested-poc exception; applied in U62."},
{"id":"U49","from":["A:D-MEM-HEADER","B190"],"defect":"MEMORY.md header — reword (B) over keep (A) — needed because entries move out; wording: '# Session memory' plus one line 'Role/task details: [context-details.md](context-details.md) — owner, QA, release, environment, research.'"},
{"id":"U50","from":["A:D-MEM-vscode-restart-kills-the-container","B191"],"defect":"memory vscode-restart-kills-the-container — move-to-context-details.md — A's cut-index would orphan the leaf; move keeps it reachable."},
{"id":"U51","from":["A:D-MEM-commit-proxy-misses-unlanded-work","B192"],"defect":"memory commit-proxy-misses-unlanded-work — move-to-context-details.md (B) over keep (A) — relevant only during usage accounting."},
{"id":"U52","from":["A:D-MEM-measure-dont-assume","B193"],"defect":"memory measure-dont-assume — reword — wording: '[measure-dont-assume.md] Measure machine/repo/game state this turn before asserting it; include reading time.'"},
{"id":"U53","from":["A:D-MEM-check-for-an-existing-branch-first","B194"],"defect":"memory check-for-an-existing-branch-first — reword — wording: '[check-for-an-existing-branch-first.md] Before starting a point, list worktrees and branches; board/TASKS omit live authors.'"},
{"id":"U54","from":["A:D-MEM-blocked-action-find-the-project-command","B195"],"defect":"memory blocked-action-find-the-project-command — move-to-context-details.md — rule stays in CLAUDE.md §6 (U27); move rather than cut-index so the leaf stays linked."},
{"id":"U55","from":["A:D-MEM-boundary-marker-is-fragile","B196"],"defect":"memory boundary-marker-is-fragile — keep in index, terse (A) over move (B) — costly when missed and the SessionStart boundary text shrinks (U159); wording: '[boundary-marker-is-fragile.md] Boundary last, bare commands; any later repository action invalidates it.'"},
{"id":"U56","from":["A:D-MEM-protected-paths-always-prompt","B197"],"defect":"memory protected-paths-always-prompt — keep in index, terse (A) over move (B) — it governs the settings/hook edits this cut list causes; wording: '[protected-paths-always-prompt.md] Settings/hook edits are attended-only; versioned core.hooksPath.'"},
{"id":"U57","from":["A:D-MEM-use-1890-valid-names","B198"],"defect":"memory use-1890-valid-names — reword — wording: '[use-1890-valid-names.md] Game place/landmark/settlement names must be valid in 1890.'"},
{"id":"U58","from":["A:D-MEM-bug-reports-land-in-local","B199"],"defect":"memory bug-reports-land-in-local — move-to-context-details.md — both take it off the index; move keeps the leaf linked."},
{"id":"U59","from":["A:D-MEM-fable-sparingly","B200"],"defect":"memory fable-sparingly — keep in index, terse (A) over move (B) — routing decisions occur in any owner turn; wording: '[fable-sparingly.md] Fable is scarce and non-default; participation per fable-switch --status.'"},
{"id":"U60","from":["A:D-MEM-provider-volume-strategy","B201"],"defect":"memory provider-volume-strategy — move-to-context-details.md (B) over keep (A) — quota measurement is a distinct activity with a natural lookup moment."},
{"id":"U61","from":["A:D-MEM-github-token","B202"],"defect":"memory github-token — reword — wording: '[github-token.md] .secrets/github-token: use only for requested GitHub changes; export GH_TOKEN; never print.'"},
{"id":"U62","from":["A:D-MEM-tags-only-on-request","B204"],"defect":"memory tags-only-on-request — reword (B's separate line) over A's merged release line — A's merge erases the poc exception; wording: '[tags-only-on-request.md] Version/release tags require explicit approval for that tag; a cut vX.Y is frozen. poc exception: owner runbook.'"},
{"id":"U63","from":["A:D-MEM-version-release-process","B205"],"defect":"memory version-release-process — move-to-context-details.md (B) over merge-into-one-line (A) — keeps 'new demo: Maximum QA first' and the separate requested-poc operation."},
{"id":"U64","from":["A:D-MEM-speak-as-part-of-the-team","B203"],"defect":"memory speak-as-part-of-the-team — reword — wording: '[speak-as-part-of-the-team.md] Project rules/mistakes: say wir/unser.'"},
{"id":"U65","from":["A:D-MEM-watch-for-aesthetic-oddities","B206"],"defect":"memory watch-for-aesthetic-oddities — keep in index, terse (A) over move (B) — applies whenever any screenshot is judged; wording: '[watch-for-aesthetic-oddities.md] Judge whether the picture looks right to a person, not only whether it functions.'"},
{"id":"U66","from":["A:D-MEM-webgpu-testable-headless","B207"],"defect":"memory webgpu-testable-headless — move-to-context-details.md (B) over keep (A) — CLAUDE.md §7.2 already makes WebGPU the everyday lane; keep it next to the contradicting leaf (U67)."},
{"id":"U67","from":["A:D-MEM-verify-default-zoom-and-webgpu","B208"],"defect":"memory verify-default-zoom-and-webgpu — move-to-context-details.md (B) over keep (A) — its frontmatter claim that headless WebGPU is impossible contradicts U66; flag the conflict, keep the zoom rule."},
{"id":"U68","from":["A:D-MEM-track-permission-prompts","B209"],"defect":"memory track-permission-prompts — reword — wording: '[track-permission-prompts.md] Preserve maximally broad whole-tool allowances, including Bash, in both settings scopes; never narrow/tidy them.'"},
{"id":"U69","from":["A:D-MEM-implementation-sections-current","B210"],"defect":"memory implementation-sections-current — reword — wording: '[implementation-sections-current.md] Climate/people rendering changes update research→game records in the same commit; see leaf for targets.' Index targets and frontmatter targets differ; unresolved."},
{"id":"U70","from":["A:D-MEM-push-to-main-directly-is-fine","B211"],"defect":"memory push-to-main-directly-is-fine — reword — wording: '[push-to-main-directly-is-fine.md] Direct push to main is fine; do not request a PR.' B's qualifier 'authorized owner automation' is not evidenced in the inputs and is left out."},
{"id":"U71","from":["A:D-MEM-language-german","B212"],"defect":"memory language-german — reword — wording: '[language-german.md] User replies: Deutsch, Du; code/commits: English.'"},
{"id":"U72","from":["A:D-MEM-commit-message-no-point-number","B213"],"defect":"memory commit-message-no-point-number — reword — wording: '[commit-message-no-point-number.md] Commit messages describe changes; no work-order point number.'"},
{"id":"U73","from":["A:D-MEM-bundle-names","B214"],"defect":"memory bundle-names — reword — wording: '[bundle-names.md] With the user, use German bundle names; letters are internal IDs.'"},
{"id":"U74","from":["A:D-MEM-verify-suites-need-a-quiet-machine","B215"],"defect":"memory verify-suites-need-a-quiet-machine — keep in index, terse (A) over move (B) — every authoring session schedules suites; wording: '[verify-suites-need-a-quiet-machine.md] Suites need a quiet host; check load before classifying rotating failures (Speichermessung).'"},
{"id":"U75","from":["A:D-MEM-findings-carrier","B216"],"defect":"memory findings-carrier — reword — wording: '[findings-carrier.md] Owner drains via scripts/finding.mjs; non-owner user orders use --request.' The carrier body never goes into session context."},
{"id":"U76","from":["A:D-MEM-residuals-hide-defects","B217"],"defect":"memory residuals-hide-defects — reword — wording: '[residuals-hide-defects.md] Accept a residual only when genuinely missing information is named.'"},
{"id":"U77","from":["A:D-MEM-workflows-token-budget","B218"],"defect":"memory workflows-token-budget — reword — wording: '[workflows-token-budget.md] Keep fan-outs small; estimate/warn and obtain approval for large ones; verify inline and collect results, not transcripts.'"},
{"id":"U78","from":["A:D-MEM-release-order-communication-first","B219"],"defect":"memory release-order-communication-first — move-to-context-details.md (B) over reword (A) — index and frontmatter state different priorities and stale point numbers; both versions are preserved there."},
{"id":"U79","from":["A:D-MEM-village-moves-allowed","B220"],"defect":"memory village-moves-allowed — move-to-context-details.md (B) over keep (A) — domain permission with a natural lookup moment."},
{"id":"U80","from":["A:D-MEM-closing-runs","B221"],"defect":"memory closing-runs — move-to-context-details.md (B) over keep (A) — owner closing only; keeps autonomous-closing authorization and Closing-last rule."},
{"id":"U81","from":["A:D-MEM-saves-are-irrelevant-in-the-poc","B222"],"defect":"memory saves-are-irrelevant-in-the-poc — reword — wording: '[saves-are-irrelevant-in-the-poc.md] Save changes owe no migration; report a break in one line.' Criterion 28 stays (U31)."},
{"id":"U82","from":["A:D-MEM-effort-high-for-implementation","B223"],"defect":"memory effort-high-for-implementation — reword — both agree; wording: '[effort-high-for-implementation.md] All work: Medium; never High/xhigh.' The filename contradicts its content; renaming is out of scope."},
{"id":"U83","from":["A:D-MEM-overshoot-needs-a-brake","B224"],"defect":"memory overshoot-needs-a-brake — move-to-context-details.md (B) over keep (A) — incident lesson; next to the freeze it must not read as authority to build a brake."},
{"id":"U84","from":["A:D-MEM-analysis-and-execution-in-one-go","B225"],"defect":"memory analysis-and-execution-in-one-go — reword in index (A) over move (B) — behavioural trigger with no lookup moment; wording: '[analysis-and-execution-in-one-go.md] Never park a verdict; queue it first and hand it over.' Frontmatter's narrower condition stays in the leaf; it does not override a read-only analysis."},
{"id":"U85","from":["A:D-MEM-forensics-need-a-command","B226"],"defect":"memory forensics-need-a-command — move-to-context-details.md (B) over keep (A) — under the freeze it must not read as an order to build tooling."},
{"id":"U86","from":["A:D-MEM-rider-point-fold-and-push","B227"],"defect":"memory rider-point-fold-and-push — move-to-context-details.md — move over cut-index; index says fold-point --none, frontmatter says --delivered; record both, nominate neither."},
{"id":"U87","from":["A:D-MEM-vdzk-carrier-from-sdk-sessions","B228"],"defect":"memory vdzk-carrier-from-sdk-sessions — move-to-context-details.md — move over cut-index; role-specific workaround."},
{"id":"U88","from":["A:D-MEM-handing-over-is-not-stopping","B229"],"defect":"memory handing-over-is-not-stopping — reword in index (A) over move (B) — trigger word arrives in chat without warning; wording: '[handing-over-is-not-stopping.md] abgeben = transfer to successor, never pause/stop; batch stops only on explicit order ([batch-stops-only-on-explicit-order.md]).'"},
{"id":"U89","from":["A:D-MEM-no-standstill-decide-and-record","B230"],"defect":"memory no-standstill-decide-and-record — keep in index, terse (A) over move (B) — it decides behaviour at the moment of doubt; wording: '[no-standstill-decide-and-record.md] Self-recover; decide and record for veto on the board; no waiting decision card.'"},
{"id":"U90","from":["A:D-MEM-drills-must-call-the-thing","B231"],"defect":"memory drills-must-call-the-thing — move-to-context-details.md (B) over keep (A) — mechanism testing is rare under the freeze."},
{"id":"U91","from":["A:D-MEM-split-a-point-that-will-not-converge","B232"],"defect":"memory split-a-point-that-will-not-converge — keep in index, terse (A) over move (B) — authorization needed when stuck; wording: '[split-a-point-that-will-not-converge.md] Split a stuck point autonomously; no confirmation needed.'"},
{"id":"U92","from":["A:D-MEM-session-cwd-stays-in-main-tree","B233"],"defect":"memory session-cwd-stays-in-main-tree — reword — wording: '[session-cwd-stays-in-main-tree.md] Main-session shell cwd: /workspace/hoa; worktree cwd misleads Stop guards.' Scope versus worktree delegates is unresolved (U47)."},
{"id":"U93","from":["A:D-MEM-no-invented-user-instructions","B234"],"defect":"memory no-invented-user-instructions — reword — wording: '[no-invented-user-instructions.md] Scoped remarks are not standing orders; quote users verbatim only.'"},
{"id":"U94","from":["A:D-MEM-a-question-is-only-a-question","B235"],"defect":"memory a-question-is-only-a-question — reword — wording: '[a-question-is-only-a-question.md] Chat questions neither claim nor stop/change the batch unless explicitly requested.'"},
{"id":"U95","from":["A:D-MEM-stop-refusal-is-addressed-to-me","B236"],"defect":"memory stop-refusal-is-addressed-to-me — reword — wording: '[stop-refusal-is-addressed-to-me.md] On Stop refusal, remeasure blocking state; never repeat the same refused answer.'"},
{"id":"U96","from":["A:D-MEM-detach-long-running-landings","B237"],"defect":"memory detach-long-running-landings — move-to-context-details.md — move over cut-index; keeps setsid and the prose-every-third-turn cadence."},
{"id":"U97","from":["A:D-MEM-umsteuerung-vereinfachungsplan","B238"],"defect":"memory umsteuerung-vereinfachungsplan — keep in index, terse (A) over move (B) — keyword-triggered lookup only works from the loaded index; wording: '[umsteuerung-vereinfachungsplan.md] Umsteuerung: 01.09 nine-point plan, recorded state and veto paths.'"},
{"id":"U98","from":["A:D-MEM-main-push-runs-the-full-gate","B239"],"defect":"memory main-push-runs-the-full-gate — reword — wording: '[main-push-runs-the-full-gate.md] Main push runs build+lint+audit+unit; never push main during a browser picture run.'"},
{"id":"U99","from":["A:D-MEM-feature-tests-before-regression","B240"],"defect":"memory feature-tests-before-regression — reword — wording: '[feature-tests-before-regression.md] Debug with the feature's own test; full regression once at the end for evidence.'"},
{"id":"U100","from":["A:D-MEM-only-one-head-session","B241"],"defect":"memory only-one-head-session — reword — wording: '[only-one-head-session.md] This chat is the only head session; all others are headless; never route the user through them.'"},
{"id":"U101","from":["B242"],"defect":"memory leaf always-prep-during-waits — keep on demand — only B; not in the index, no fixed load."},
{"id":"U102","from":["B243"],"defect":"memory leaf arm-dormant-guards-attended — keep on demand — only B; historical status, no authorization to arm."},
{"id":"U103","from":["B244"],"defect":"memory leaf audit-205-decisions — keep on demand — only B; zero fixed load."},
{"id":"U104","from":["B245"],"defect":"memory leaf audit-with-model-diversity — keep on demand — only B."},
{"id":"U105","from":["B246"],"defect":"memory leaf batch-autonomy-hardened — keep on demand — only B; no new hardening authorized."},
{"id":"U106","from":["B247"],"defect":"memory leaf batch-dashboard-artifact — keep on demand — only B; it is the target of the shrunk board reminder (U155) and must keep the full procedure."},
{"id":"U107","from":["B248"],"defect":"memory leaf batch-stops-only-on-explicit-order — keep on demand — only B; linked from the index line in U88."},
{"id":"U108","from":["B249"],"defect":"memory leaf board-cli-is-not-parallel-safe — keep on demand — only B."},
{"id":"U109","from":["B250"],"defect":"memory leaf board-transport-not-private — keep on demand — only B."},
{"id":"U110","from":["B251"],"defect":"memory leaf brief-driven-delegation — keep on demand — only B."},
{"id":"U111","from":["B252"],"defect":"memory leaf bundle-first-not-new-point — keep on demand — only B; scope versus append-each-defect wording unresolved."},
{"id":"U112","from":["B253"],"defect":"memory leaf chat-timestamp — keep on demand — only B; policy source behind the shrunk timestamp hook (U153)."},
{"id":"U113","from":["B254"],"defect":"memory leaf claude-71-reference-not-duplicate — keep on demand — only B; supports U31."},
{"id":"U114","from":["B255"],"defect":"memory leaf container-work-is-mine — keep on demand — only B."},
{"id":"U115","from":["B256"],"defect":"memory leaf dashboard-all-open-points-in-queue — keep on demand — only B; conflict with U117 unresolved."},
{"id":"U116","from":["B257"],"defect":"memory leaf dashboard-card-single-topic — keep on demand — only B."},
{"id":"U117","from":["B258"],"defect":"memory leaf dashboard-multiple-now-cards — keep on demand — only B; do not weaken to reconcile U115."},
{"id":"U118","from":["B259"],"defect":"memory leaf dashboard-no-auto-open — keep on demand — only B."},
{"id":"U119","from":["B260"],"defect":"memory leaf dashboard-vdzk-only-decisions — keep on demand — only B."},
{"id":"U120","from":["B261"],"defect":"memory leaf doc-budget-shorten-dont-raise — keep on demand — only B; it limits every move-to-docs action in this list."},
{"id":"U121","from":["B262"],"defect":"memory leaf english-no-germanisms — keep on demand — only B; applies to the new hook wordings."},
{"id":"U122","from":["B263"],"defect":"memory leaf hand-over-at-the-watermark — keep on demand — only B; 150k vs 122k/150k disagreement flagged (U46)."},
{"id":"U123","from":["B264"],"defect":"memory leaf hard-cases-go-to-sol — keep on demand — only B."},
{"id":"U124","from":["B265"],"defect":"memory leaf hybrid-test-architecture — keep on demand — only B."},
{"id":"U125","from":["B266"],"defect":"memory leaf journal-voice-markup — keep on demand — only B."},
{"id":"U126","from":["B267"],"defect":"memory leaf lint-and-cve-clean-always — keep on demand — only B; its audit-after-every-change wording conflicts with §7.2 (U32), unresolved."},
{"id":"U127","from":["B268"],"defect":"memory leaf maximal-delegation — keep on demand — only B; after U158 this leaf is the delegation source besides CLAUDE.md."},
{"id":"U128","from":["B269"],"defect":"memory leaf model-diverse-by-criticality — keep on demand — only B."},
{"id":"U129","from":["B270"],"defect":"memory leaf never-stop-the-batch — keep on demand — only B; tension with no-standstill (U89) flagged."},
{"id":"U130","from":["B271"],"defect":"memory leaf new-tasks-append-and-defer — keep on demand — only B; tension with U84 (queue verdict first) unresolved."},
{"id":"U131","from":["B272"],"defect":"memory leaf no-other-window-to-close — keep on demand — only B."},
{"id":"U132","from":["B273"],"defect":"memory leaf parallel-session-root-cause — keep on demand — only B; 'being built' status is historical."},
{"id":"U133","from":["B274"],"defect":"memory leaf pgrep-waiters-match-themselves — keep on demand — only B."},
{"id":"U134","from":["B275"],"defect":"memory leaf point-boundary-always-autonomous — keep on demand — only B."},
{"id":"U135","from":["B276"],"defect":"memory leaf process-scoped-regression — keep on demand — only B; 'flake-retry' conflicts with retry-covers-nothing (U35)."},
{"id":"U136","from":["B277"],"defect":"memory leaf push-after-every-commit — keep on demand — only B."},
{"id":"U137","from":["B278"],"defect":"memory leaf queue-order-fixes-before-finders — keep on demand — only B."},
{"id":"U138","from":["B279"],"defect":"memory leaf regression-tiers — keep on demand — only B."},
{"id":"U139","from":["B280"],"defect":"memory leaf retrospective-currency-mechanism — keep on demand — only B."},
{"id":"U140","from":["B281"],"defect":"memory leaf serving-model-watch — keep on demand — only B."},
{"id":"U141","from":["B282"],"defect":"memory leaf sol-authors-by-default — keep on demand — only B; ended emergency, explains supersession."},
{"id":"U142","from":["B283"],"defect":"memory leaf sort-visuals-into-detail-levels — keep on demand — only B."},
{"id":"U143","from":["B284"],"defect":"memory leaf stay-within-project-dir — keep on demand — only B."},
{"id":"U144","from":["B285"],"defect":"memory leaf tasks-spec-final-state-only — keep on demand — only B."},
{"id":"U145","from":["B286"],"defect":"memory leaf test-coverage-err-on-more — keep on demand — only B."},
{"id":"U146","from":["B287"],"defect":"memory leaf test-realistic-zoom — keep on demand — only B."},
{"id":"U147","from":["B288"],"defect":"memory leaf update-docs-on-change-requests — keep on demand — only B."},
{"id":"U148","from":["B289"],"defect":"memory leaf user-orders-go-through-the-carrier — keep on demand — only B."},
{"id":"U149","from":["B290"],"defect":"memory leaf verify-before-merge-not-after — keep on demand — only B."},
{"id":"U150","from":["B291"],"defect":"memory leaf verify-gui-on-both-backends — keep on demand — only B; scope versus isBackendSensitivePath (U15) flagged."},
{"id":"U151","from":["B292"],"defect":"memory leaf verify-owner-really-dead — keep on demand — only B."},
{"id":"U152","from":["B293"],"defect":"memory leaf withdraw-claim-when-leaving — keep on demand — only B."},
{"id":"U153","from":["A:C-H1","B78"],"defect":"UserPromptSubmit berlin-timestamp.cjs — shrink — both agree; A's English line is chosen because it keeps the re-measure command and hook strings are code; wording: 'Turn start **<stamp>** (Berlin). Lead the reply with it; if tools ran, re-measure right before answering, never extrapolate: <node -e … command>'. User-scope file, attended edit."},
{"id":"U154","from":["A:C-H2a","B80"],"defect":"[context-level] header-suffix line — keep — both agree; an unknown count stays shown as unknown."},
{"id":"U155","from":["A:C-H2b","B79"],"defect":"[dashboard-reminder] owner board paragraph — shrink — both agree; wording: '[board] Batch state changed → update the board first (node scripts/board.mjs <cmd>); procedure: memory batch-dashboard-artifact; last edit ~N min ago.' Full paragraph only on state the hook already has; build no new detector (U170)."},
{"id":"U156","from":["A:C-H2c","B81"],"defect":"stand-down text — reword — already conditional; owner sessions get no stand-down line; wording: '[batch-singleton] STAND DOWN: another live session holds the batch — no batch work, no merge to main, no TASKS/board edit; answer normally.'"},
{"id":"U157","from":["A:C-H2d","B82"],"defect":"[context-ceiling] notice — keep — both agree; one-shot and conditional; body not supplied, so no replacement text."},
{"id":"U158","from":["A:C-H3a","B83","B84"],"defect":"SessionStart batch-resume first paragraph — shrink — both agree; only measured live facts, never hard-coded point numbers or counts; restated policy replaced by pointers to CLAUDE.md §6/§9 and docs/batch-owner-runbook.md; target under 2 KB so the whole text reaches context. Precondition: each removed paragraph must exist in the pointer target first (U127)."},
{"id":"U159","from":["A:C-H3b"],"defect":"SessionStart POINT BOUNDARY paragraph — reword — only A; keep one stretch per session, batch-boundary.mjs --prepare/--commit (+ --context), adopt transferred declaration first (batch-in-flight.mjs --status/--adopt); drop the history sentences."},
{"id":"U160","from":["A:C-H3c","B85","B86","B87","B88","B89","B90","B91"],"defect":"SessionStart owner-only runbook dump (~9 KB) — move-to-docs/batch-owner-runbook.md — both agree; one line: 'Owner runbook: docs/batch-owner-runbook.md (read before dispatching); applies only to the proven batch owner.' Never inject it into a delegate or stand-down session; B's six section anchors must be checked to exist before they are cited."},
{"id":"U161","from":["A:C-H4","B92","B93","B94","B95","B96","B97","B98","B99","B100"],"defect":"PreToolUse guards — keep — both agree; silent on allow; refusal bodies were not supplied so none is rewritten; context fence stays in observe."},
{"id":"U162","from":["A:C-H5","B101","B102","B103","B104"],"defect":"PostToolUse lock-heartbeat notices — keep — B103's 'shrink' asks only that the dispossession notice stay one-shot, which A records as already true."},
{"id":"U163","from":["B105"],"defect":"PostToolUse prep-arm-hook.mjs — keep — only B; empty in the normal case; predicate and body not supplied."},
{"id":"U164","from":["B106"],"defect":"Project Stop guards (29) — keep — only B; identities and bodies not supplied, so no per-guard rewrite is claimed."},
{"id":"U165","from":["A:C-H6a","B107"],"defect":"Stop 'BATCH DASHBOARD NOT REGISTERED' refusal — shrink — both agree; at most two lines: what is missing plus the one command; general board policy leaves the refusal."},
{"id":"U166","from":["A:C-H6b","B108"],"defect":"Stop 'DO NOT STOP THE BATCH' refusal — shrink — both agree; print the count and the first 3 points, not all 430 numbers; keep the authorized boundary/stop distinction; never emit it in stand-down sessions."},
{"id":"U167","from":["A:C-H6c","B109","B111"],"defect":"Stop chat-timestamp refusals — keep (A) over shrink (B) — fires only on violation and hands the exact corrected line; B's one-liners drop that line and add no comparison detail, which makes a repeated refusal likelier."},
{"id":"U168","from":["B110"],"defect":"Stop batch-waiting message — keep — only B proposes shrink without a body or predicate in the inputs; no rewrite without the text."},
{"id":"U169","from":["B112"],"defect":"Hook coverage limit — keep as accounting note — only B; 358/358 empty allows prove normal-path silence only and count as no saving."},
{"id":"U170","from":["B113"],"defect":"Hook conditioning limit — keep as constraint — only B; use only state a hook already has; no detector, cache, latch or guard; it bounds U155 and U158."},
{"id":"U171","from":["A:B-PERM","B2","B3"],"defect":"Whole-tool allows and settings files — keep — both agree; never narrow; no .mcp.json, enabledPlugins or settings.local.json is created; any cut that would need an allow narrowed is void."},
{"id":"U172","from":["A:B-PLUGIN-MKT","B4"],"defect":"Marketplace claude-plugins-official — keep — both agree; nothing enabled, no context cost."},
{"id":"U173","from":["A:B-MCP-DOCS","B5","B58","B59","B60","B61","B62","B63","B64","B65","B77"],"defect":"claude.ai Claude Docs connector, 8 deferred tools and instructions block (~732 tokens) — cut (A) over keep (B) — largest single surface item, no rule depends on it, the board is GH Pages; account-level and reversible, so it is an attended user action; count the saving only after a fresh-session measurement, else record 'not switchable from project settings'."},
{"id":"U174","from":["A:B-MCP-DRIVE","B6","B66","B67","B68","B69","B70","B71","B72","B73","B74","B75","B76"],"defect":"claude.ai Google Drive, 11 deferred tools — cut (A) over keep (B) — B's research use is a possibility, not a recorded use; same attended account action and measurement condition as U173."},
{"id":"U175","from":["A:B-MCP-GMAIL","B7"],"defect":"claude.ai Gmail (unauthenticated) — cut — both agree; its auth notice costs text in subagents."},
{"id":"U176","from":["A:B-MCP-GCAL","B8"],"defect":"claude.ai Google Calendar (unauthenticated) — cut — both agree."},
{"id":"U177","from":["A:B-SK-NOTE","B9"],"defect":"Synced anthropic-skills are account-level — keep as constraint — both agree; where no supported setting hides a skill, record 'not switchable from project settings' and count no saving."},
{"id":"U178","from":["A:B-SK-sketch","B10"],"defect":"skill sketch — keep — both agree; user order."},
{"id":"U179","from":["A:B-SK-artifact-design","B12"],"defect":"skill artifact-design — keep — both agree."},
{"id":"U180","from":["A:B-SK-artifact-diagramming","B13"],"defect":"skill artifact-diagramming — keep — both agree."},
{"id":"U181","from":["A:B-SK-artifact-capabilities","B14"],"defect":"skill artifact-capabilities — keep (B) over cut (A) — A keeps the ArtifactData/ArtifactComments tools (U210), so cutting their guidance would leave a half surface."},
{"id":"U182","from":["A:B-SK-dataviz","B11"],"defect":"skill dataviz — cut (A) over keep (B) — B itself notes the unusually long description; reports and board are tables/text; no rule depends on it; only if a supported switch exists."},
{"id":"U183","from":["A:B-SK-update-config","B15"],"defect":"skill update-config — keep — both agree."},
{"id":"U184","from":["A:B-SK-keybindings-help","B16"],"defect":"skill keybindings-help — cut (A) over keep (B) — no project rule or workflow touches keybindings; only if a supported switch exists."},
{"id":"U185","from":["A:B-SK-code-review","B17"],"defect":"skill code-review — keep — both agree."},
{"id":"U186","from":["A:B-SK-simplify","B18"],"defect":"skill simplify — keep (B) over cut (A) — deletion/simplification is an explicit finding class (U8), so non-use is not evidenced."},
{"id":"U187","from":["A:B-SK-fewer-permission-prompts","B19"],"defect":"skill fewer-permission-prompts — cut — both agree; its allowlist workflow contradicts the whole-tool allows; this is the only DROPPED procedure in the whole list (U222)."},
{"id":"U188","from":["A:B-SK-loop","B20"],"defect":"skill loop — keep — both agree."},
{"id":"U189","from":["A:B-SK-schedule","B21"],"defect":"skill schedule — cut (A) over keep (B) — the project records the cloud switch as off and schedules locally; only if a supported switch exists."},
{"id":"U190","from":["A:B-SK-claude-api","B22"],"defect":"skill claude-api — keep — both agree."},
{"id":"U191","from":["A:B-SK-workflow-authoring","B23"],"defect":"skill workflow-authoring — keep — both agree."},
{"id":"U192","from":["A:B-SK-run","B24"],"defect":"skill run — keep — both agree."},
{"id":"U193","from":["A:B-SK-init","B25"],"defect":"skill init — cut (A) over keep (B) — CLAUDE.md exists and is budget-governed, which B concedes; only if a supported switch exists."},
{"id":"U194","from":["A:B-SK-security-review","B26"],"defect":"skill security-review — keep — both agree."},
{"id":"U195","from":["A:B-SK-docs","B27"],"defect":"skill anthropic-skills:docs — cut (A) over keep (B) — coupled to the Docs connector cut in U173; account-level, attended."},
{"id":"U196","from":["A:B-SK-docx","B28"],"defect":"skill anthropic-skills:docx — cut (A) over keep (B) — B concedes no Word deliverables; account-level, attended."},
{"id":"U197","from":["A:B-SK-import-memory","B29"],"defect":"skill anthropic-skills:import-memory — cut (A) over keep (B) — memory is kept by hand; account-level, attended."},
{"id":"U198","from":["A:B-SK-morning","B30"],"defect":"skill anthropic-skills:morning — cut (A) over keep (B) — B calls it a strong unused candidate; account-level, attended."},
{"id":"U199","from":["A:B-SK-pdf","B31"],"defect":"skill anthropic-skills:pdf — keep (B) over cut (A) — the project does 1890 source research where PDF sources are plausible; one listing line."},
{"id":"U200","from":["A:B-SK-pptx","B32"],"defect":"skill anthropic-skills:pptx — cut (A) over keep (B) — no decks; account-level, attended."},
{"id":"U201","from":["A:B-SK-skill-creator","B33"],"defect":"skill anthropic-skills:skill-creator — keep (B) over cut (A) — A's reason is 'rare and attended', which is use, not non-use; the sketch skill is maintained."},
{"id":"U202","from":["A:B-SK-xlsx","B34"],"defect":"skill anthropic-skills:xlsx — cut (A) over keep (B) — no spreadsheets; account-level, attended."},
{"id":"U203","from":["A:B-AG-claude","B35"],"defect":"agent claude — keep — both agree."},
{"id":"U204","from":["A:B-AG-general-purpose","B38"],"defect":"agent general-purpose — keep — both agree."},
{"id":"U205","from":["A:B-AG-Explore","B37"],"defect":"agent Explore — keep — both agree."},
{"id":"U206","from":["A:B-AG-Plan","B39"],"defect":"agent Plan — keep — both agree."},
{"id":"U207","from":["A:B-AG-trivial-task","B41"],"defect":"project agent trivial-task — keep — both agree."},
{"id":"U208","from":["A:B-AG-claude-code-guide","B36"],"defect":"agent claude-code-guide — keep (B) over cut (A) — hook, harness and SDK questions are recurring project work."},
{"id":"U209","from":["A:B-AG-statusline-setup","B40"],"defect":"agent statusline-setup — cut (A) over keep (B) — the header suffix comes from a hook, not from this agent; only if a per-agent deny hides it without touching a whole-tool allow; else record 'not switchable'."},
{"id":"U210","from":["A:B-DT-Artifact","B42","B43"],"defect":"deferred tools ArtifactComments, ArtifactData — keep — both agree."},
{"id":"U211","from":["A:B-DT-Cron","B44","B45","B46"],"defect":"deferred tools CronCreate/Delete/List — keep — both agree."},
{"id":"U212","from":["A:B-DT-DesignSync","B47"],"defect":"deferred tool DesignSync — keep (B) over cut (A) — a deferred name costs about 5 tokens; a deny line would buy nothing measurable."},
{"id":"U213","from":["A:B-DT-Worktree","B48","B49"],"defect":"deferred tools EnterWorktree/ExitWorktree — keep — both agree; keep the pair together."},
{"id":"U214","from":["A:B-DT-Monitor","B50"],"defect":"deferred tool Monitor — keep — both agree."},
{"id":"U215","from":["A:B-DT-NotebookEdit","B51"],"defect":"deferred tool NotebookEdit — keep — both agree; in the whole-tool allow list."},
{"id":"U216","from":["A:B-DT-PushNotification","B52"],"defect":"deferred tool PushNotification — keep — both agree."},
{"id":"U217","from":["A:B-DT-RemoteTrigger","B53"],"defect":"deferred tool RemoteTrigger — keep (B) over cut (A) — saving is about 5 tokens; the cloud switch already governs its use."},
{"id":"U218","from":["A:B-DT-SendMessage/TaskStop","B54","B55"],"defect":"deferred tools SendMessage, TaskStop — keep — both agree."},
{"id":"U219","from":["A:B-DT-Web","B56","B57"],"defect":"deferred tools WebFetch, WebSearch — keep — both agree."},
{"id":"U220","from":["B1"],"defect":"Evidence boundary — keep as constraint — only B; no invocation history, hook source or memory bodies were supplied, so every cut is 'no rule or workflow depends on it', not 'measured unused'."},
{"id":"U221","from":["B297"],"defect":"Accounting baseline — keep — only B; 22,709-token shared prefix and ~18,180-token session subtotal are distinct; characters are not tokens; on-demand leaves are not fixed load."},
{"id":"U222","from":["B298"],"defect":"Dropped-rules register — keep, updated — DROPPED: only the fewer-permission-prompts allowlist procedure (U187). No CLAUDE.md, memory, acceptance, permission or hook rule is dropped; A's single rule cut (§7.2 pre-action pointers) is reversed in U38."},
{"id":"U223","from":["B299"],"defect":"Tool-surface saving estimate — shrink, to be re-derived — B's near-zero figure assumed Docs/Drive kept; with U173–U176 and the skill cuts the saving rises only where a switch proves to work; nothing counts before a fresh-session measurement."},
{"id":"U224","from":["B300"],"defect":"Hook-text saving estimate — shrink — B's 450–550 tokens per prompt and 700–800 per session stand as targets; the persisted 14.7 KB SessionStart output is not fixed load."},
{"id":"U225","from":["B301"],"defect":"CLAUDE.md/MEMORY.md saving estimate — shrink, lower than B's — this merge keeps more rule text in CLAUDE.md and 9 more index lines than B, so B's 1,900–2,800 tokens is an upper bound; measure, do not estimate."}
]}

B1 | CLAUDE.md | U1 [A:D-CLAUDE-1-1, B115] §1 goal — reword
B2 | CLAUDE.md | U2 [A:D-CLAUDE-2-1, B116] single-player only — keep
B3 | CLAUDE.md | U3 [A:D-CLAUDE-2-2, B117] no onboarding/tutorial — keep
B4 | CLAUDE.md | U4 [A:D-CLAUDE-2-3, B118] no invented systems — keep
B5 | CLAUDE.md | U5 [A:D-CLAUDE-2-4, B119] numeric guesses in balance.ts — keep, §14 and never-override clauses must stay
B6 | CLAUDE.md | U6 [A:D-CLAUDE-2-5, B120] §7.1 checklist not gate — reword with date suffix
B7 | CLAUDE.md | U7 [A:D-CLAUDE-2-6, B121] infrastructure freeze — reword, all clauses kept
B8 | CLAUDE.md | U8 [A:D-CLAUDE-2-7, B122] finding intake — reword
B9 | CLAUDE.md | U9 [A:D-CLAUDE-3-1, B123] render backends — reword plus pointer
B10 | CLAUDE.md | U10 [A:D-CLAUDE-3-2, B124] kokoro-js TTS — reword one line, not move
B11 | CLAUDE.md | U11 [A:D-CLAUDE-3-3, B125] runtime dependency justification — keep
B12 | CLAUDE.md | U12 [A:D-CLAUDE-4-1, A:D-CLAUDE-4-2, B126] design-change sync and topic organisation — keep
B13 | CLAUDE.md | U13 [A:D-CLAUDE-5-1, B127] tier suites / LARGE per bundle — keep
B14 | CLAUDE.md | U14 [A:D-CLAUDE-5-2, B128] Vitest vs Playwright — reword plus pointer
B15 | CLAUDE.md | U15 [A:D-CLAUDE-6-1, B129] branch workflow — reword
B16 | CLAUDE.md | U16 [A:D-CLAUDE-6-2, B130] merge ends the branch — keep
B17 | CLAUDE.md | U17 [A:D-CLAUDE-6-3, B131] bookkeeping on main — keep
B18 | CLAUDE.md | U18 [A:D-CLAUDE-6-4, B132] TASKS.md main-only — keep
B19 | CLAUDE.md | U19 [A:D-CLAUDE-6-5, B133] land-point.mjs, mandatory gate, re-verify — reword, not move
B20 | CLAUDE.md | U20 [A:D-CLAUDE-6-6, B134] delegated author point-brief — keep
B21 | CLAUDE.md | U21 [A:D-CLAUDE-6-7, B135] durable Astra authors, delegates never merge — reword keeping handover semantics
B22 | CLAUDE.md | U22 [A:D-CLAUDE-6-8, B136] context fence preventive text — reword, not move
B23 | CLAUDE.md | U23 [A:D-CLAUDE-6-9, B137] model policy — reword as bullets
B24 | CLAUDE.md | U24 [A:D-CLAUDE-6-10, B138] four eyes two modes — keep
B25 | CLAUDE.md | U25 [A:D-CLAUDE-6-11, B139] player text in language files — keep
B26 | CLAUDE.md | U26 [A:D-CLAUDE-6-12, B140] journal §15 markup — reword one line, not move
B27 | CLAUDE.md | U27 [A:D-CLAUDE-6-13, B141] small output, blocked action = project command — keep
B28 | CLAUDE.md | U28 [A:D-CLAUDE-6-14, B142] settled judgment / VDZK authorization — reword for length, all exceptions kept
B29 | CLAUDE.md | U29 [A:D-CLAUDE-6-15, B143] comments brief, // OPEN: — keep
B30 | CLAUDE.md | U30 [A:D-CLAUDE-7.1-0, B144] §7.1 introduction — reword into the pointer
B31 | CLAUDE.md → docs/acceptance-criteria-detail.md | U31 [A:D-CLAUDE-7.1-L, B145–B176] 32 criterion titles — move, none dropped, keep if a test pins the list
B32 | CLAUDE.md | U32 [A:D-CLAUDE-7.2-1, B177] build/lint/unit/audit cadence — keep, audit conflict open
B33 | CLAUDE.md | U33 [A:D-CLAUDE-7.2-2, B178] player-reachable states, screenshot subject — keep
B34 | CLAUDE.md | U34 [A:D-CLAUDE-7.2-3, B179] backend lanes — reword plus pointer
B35 | CLAUDE.md | U35 [A:D-CLAUDE-7.2-4, B180] red run closure, retry SUSPECT — keep
B36 | CLAUDE.md | U36 [A:D-CLAUDE-7.2-5, B181] dev invariant assertions — keep
B37 | CLAUDE.md | U37 [A:D-CLAUDE-7.2-6, B182] before-answering duties — reword, not move
B38 | CLAUDE.md | U38 [A:D-CLAUDE-7.2-7, B183] pre-action hooks are pointers — reword, A's cut reversed
B39 | CLAUDE.md | U39 [A:D-CLAUDE-7.2-8, B184] guard-preflight — keep
B40 | CLAUDE.md | U40 [A:D-CLAUDE-7.2-9, B185] picture stability before golden image — reword one line, not move
B41 | CLAUDE.md | U41 [A:D-CLAUDE-7.2-10, B186] fix deviations, no false fulfilment — keep
B42 | CLAUDE.md | U42 [A:D-CLAUDE-9-1, B187] closing report contents — keep
B43 | CLAUDE.md | U43 [A:D-CLAUDE-9-2, B188] CLOSING_STEPS / closing-guard — reword, not move
B44 | CLAUDE.md | U44 [A:D-CLAUDE-9-3, B189] code freeze during closing — keep
B45 | CLAUDE.md | U45 [B114] title — reword, anchors stable
B46 | CLAUDE.md; hooks; memory | U46 [B294] model/context cross-source conflicts — keep open
B47 | CLAUDE.md; hooks; memory | U47 [B295] workflow-scope cross-source conflicts — keep open
B48 | CLAUDE.md; hooks; memory | U48 [B296] release vs poc distinction — keep
B49 | MEMORY.md | U49 [A:D-MEM-HEADER, B190] header — reword plus link to context-details.md
B50 | MEMORY.md | U50 [A:D-MEM-vscode-restart-kills-the-container, B191] — move to context-details.md
B51 | MEMORY.md | U51 [A:D-MEM-commit-proxy-misses-unlanded-work, B192] — move to context-details.md
B52 | MEMORY.md | U52 [A:D-MEM-measure-dont-assume, B193] — reword
B53 | MEMORY.md | U53 [A:D-MEM-check-for-an-existing-branch-first, B194] — reword
B54 | MEMORY.md | U54 [A:D-MEM-blocked-action-find-the-project-command, B195] — move to context-details.md
B55 | MEMORY.md | U55 [A:D-MEM-boundary-marker-is-fragile, B196] — keep in index, terse
B56 | MEMORY.md | U56 [A:D-MEM-protected-paths-always-prompt, B197] — keep in index, terse
B57 | MEMORY.md | U57 [A:D-MEM-use-1890-valid-names, B198] — reword
B58 | MEMORY.md | U58 [A:D-MEM-bug-reports-land-in-local, B199] — move to context-details.md
B59 | MEMORY.md | U59 [A:D-MEM-fable-sparingly, B200] — keep in index, terse
B60 | MEMORY.md | U60 [A:D-MEM-provider-volume-strategy, B201] — move to context-details.md
B61 | MEMORY.md | U61 [A:D-MEM-github-token, B202] — reword
B62 | MEMORY.md | U62 [A:D-MEM-tags-only-on-request, B204] — reword as own line with poc exception pointer
B63 | MEMORY.md | U63 [A:D-MEM-version-release-process, B205] — move to context-details.md
B64 | MEMORY.md | U64 [A:D-MEM-speak-as-part-of-the-team, B203] — reword
B65 | MEMORY.md | U65 [A:D-MEM-watch-for-aesthetic-oddities, B206] — keep in index, terse
B66 | MEMORY.md | U66 [A:D-MEM-webgpu-testable-headless, B207] — move to context-details.md
B67 | MEMORY.md | U67 [A:D-MEM-verify-default-zoom-and-webgpu, B208] — move to context-details.md, conflict flagged
B68 | MEMORY.md | U68 [A:D-MEM-track-permission-prompts, B209] — reword
B69 | MEMORY.md | U69 [A:D-MEM-implementation-sections-current, B210] — reword, target discrepancy open
B70 | MEMORY.md | U70 [A:D-MEM-push-to-main-directly-is-fine, B211] — reword without B's added qualifier
B71 | MEMORY.md | U71 [A:D-MEM-language-german, B212] — reword
B72 | MEMORY.md | U72 [A:D-MEM-commit-message-no-point-number, B213] — reword
B73 | MEMORY.md | U73 [A:D-MEM-bundle-names, B214] — reword
B74 | MEMORY.md | U74 [A:D-MEM-verify-suites-need-a-quiet-machine, B215] — keep in index, terse
B75 | MEMORY.md | U75 [A:D-MEM-findings-carrier, B216] — reword
B76 | MEMORY.md | U76 [A:D-MEM-residuals-hide-defects, B217] — reword
B77 | MEMORY.md | U77 [A:D-MEM-workflows-token-budget, B218] — reword
B78 | MEMORY.md | U78 [A:D-MEM-release-order-communication-first, B219] — move to context-details.md, both versions preserved
B79 | MEMORY.md | U79 [A:D-MEM-village-moves-allowed, B220] — move to context-details.md
B80 | MEMORY.md | U80 [A:D-MEM-closing-runs, B221] — move to context-details.md
B81 | MEMORY.md | U81 [A:D-MEM-saves-are-irrelevant-in-the-poc, B222] — reword
B82 | MEMORY.md | U82 [A:D-MEM-effort-high-for-implementation, B223] — reword
B83 | MEMORY.md | U83 [A:D-MEM-overshoot-needs-a-brake, B224] — move to context-details.md
B84 | MEMORY.md | U84 [A:D-MEM-analysis-and-execution-in-one-go, B225] — reword in index, English
B85 | MEMORY.md | U85 [A:D-MEM-forensics-need-a-command, B226] — move to context-details.md
B86 | MEMORY.md | U86 [A:D-MEM-rider-point-fold-and-push, B227] — move to context-details.md, flag discrepancy recorded
B87 | MEMORY.md | U87 [A:D-MEM-vdzk-carrier-from-sdk-sessions, B228] — move to context-details.md
B88 | MEMORY.md | U88 [A:D-MEM-handing-over-is-not-stopping, B229] — reword in index with batch-stops link
B89 | MEMORY.md | U89 [A:D-MEM-no-standstill-decide-and-record, B230] — keep in index, terse
B90 | MEMORY.md | U90 [A:D-MEM-drills-must-call-the-thing, B231] — move to context-details.md
B91 | MEMORY.md | U91 [A:D-MEM-split-a-point-that-will-not-converge, B232] — keep in index, terse
B92 | MEMORY.md | U92 [A:D-MEM-session-cwd-stays-in-main-tree, B233] — reword
B93 | MEMORY.md | U93 [A:D-MEM-no-invented-user-instructions, B234] — reword
B94 | MEMORY.md | U94 [A:D-MEM-a-question-is-only-a-question, B235] — reword
B95 | MEMORY.md | U95 [A:D-MEM-stop-refusal-is-addressed-to-me, B236] — reword
B96 | MEMORY.md | U96 [A:D-MEM-detach-long-running-landings, B237] — move to context-details.md
B97 | MEMORY.md | U97 [A:D-MEM-umsteuerung-vereinfachungsplan, B238] — keep in index, terse
B98 | MEMORY.md | U98 [A:D-MEM-main-push-runs-the-full-gate, B239] — reword
B99 | MEMORY.md | U99 [A:D-MEM-feature-tests-before-regression, B240] — reword
B100 | MEMORY.md | U100 [A:D-MEM-only-one-head-session, B241] — reword
B101 | memory/always-prep-during-waits.md | U101 [B242] — keep on demand
B102 | memory/arm-dormant-guards-attended.md | U102 [B243] — keep on demand
B103 | memory/audit-205-decisions.md | U103 [B244] — keep on demand
B104 | memory/audit-with-model-diversity.md | U104 [B245] — keep on demand
B105 | memory/batch-autonomy-hardened.md | U105 [B246] — keep on demand
B106 | memory/batch-dashboard-artifact.md | U106 [B247] — keep on demand, target of the board reminder
B107 | memory/batch-stops-only-on-explicit-order.md | U107 [B248] — keep on demand
B108 | memory/board-cli-is-not-parallel-safe.md | U108 [B249] — keep on demand
B109 | memory/board-transport-not-private.md | U109 [B250] — keep on demand
B110 | memory/brief-driven-delegation.md | U110 [B251] — keep on demand
B111 | memory/bundle-first-not-new-point.md | U111 [B252] — keep on demand
B112 | memory/chat-timestamp.md | U112 [B253] — keep on demand
B113 | memory/claude-71-reference-not-duplicate.md | U113 [B254] — keep on demand
B114 | memory/container-work-is-mine.md | U114 [B255] — keep on demand
B115 | memory/dashboard-all-open-points-in-queue.md | U115 [B256] — keep on demand
B116 | memory/dashboard-card-single-topic.md | U116 [B257] — keep on demand
B117 | memory/dashboard-multiple-now-cards.md | U117 [B258] — keep on demand
B118 | memory/dashboard-no-auto-open.md | U118 [B259] — keep on demand
B119 | memory/dashboard-vdzk-only-decisions.md | U119 [B260] — keep on demand
B120 | memory/doc-budget-shorten-dont-raise.md | U120 [B261] — keep on demand
B121 | memory/english-no-germanisms.md | U121 [B262] — keep on demand
B122 | memory/hand-over-at-the-watermark.md | U122 [B263] — keep on demand
B123 | memory/hard-cases-go-to-sol.md | U123 [B264] — keep on demand
B124 | memory/hybrid-test-architecture.md | U124 [B265] — keep on demand
B125 | memory/journal-voice-markup.md | U125 [B266] — keep on demand
B126 | memory/lint-and-cve-clean-always.md | U126 [B267] — keep on demand, audit conflict open
B127 | memory/maximal-delegation.md | U127 [B268] — keep on demand
B128 | memory/model-diverse-by-criticality.md | U128 [B269] — keep on demand
B129 | memory/never-stop-the-batch.md | U129 [B270] — keep on demand
B130 | memory/new-tasks-append-and-defer.md | U130 [B271] — keep on demand
B131 | memory/no-other-window-to-close.md | U131 [B272] — keep on demand
B132 | memory/parallel-session-root-cause.md | U132 [B273] — keep on demand
B133 | memory/pgrep-waiters-match-themselves.md | U133 [B274] — keep on demand
B134 | memory/point-boundary-always-autonomous.md | U134 [B275] — keep on demand
B135 | memory/process-scoped-regression.md | U135 [B276] — keep on demand, retry conflict flagged
B136 | memory/push-after-every-commit.md | U136 [B277] — keep on demand
B137 | memory/queue-order-fixes-before-finders.md | U137 [B278] — keep on demand
B138 | memory/regression-tiers.md | U138 [B279] — keep on demand
B139 | memory/retrospective-currency-mechanism.md | U139 [B280] — keep on demand
B140 | memory/serving-model-watch.md | U140 [B281] — keep on demand
B141 | memory/sol-authors-by-default.md | U141 [B282] — keep on demand
B142 | memory/sort-visuals-into-detail-levels.md | U142 [B283] — keep on demand
B143 | memory/stay-within-project-dir.md | U143 [B284] — keep on demand
B144 | memory/tasks-spec-final-state-only.md | U144 [B285] — keep on demand
B145 | memory/test-coverage-err-on-more.md | U145 [B286] — keep on demand
B146 | memory/test-realistic-zoom.md | U146 [B287] — keep on demand
B147 | memory/update-docs-on-change-requests.md | U147 [B288] — keep on demand
B148 | memory/user-orders-go-through-the-carrier.md | U148 [B289] — keep on demand
B149 | memory/verify-before-merge-not-after.md | U149 [B290] — keep on demand
B150 | memory/verify-gui-on-both-backends.md | U150 [B291] — keep on demand
B151 | memory/verify-owner-really-dead.md | U151 [B292] — keep on demand
B152 | memory/withdraw-claim-when-leaving.md | U152 [B293] — keep on demand
B153 | ~/.claude/hooks/berlin-timestamp.cjs | U153 [A:C-H1, B78] per-prompt timestamp text — shrink to A's English line with the command
B154 | scripts/dashboard-reminder-hook.mjs | U154 [A:C-H2a, B80] context-level header line — keep
B155 | scripts/dashboard-reminder-hook.mjs | U155 [A:C-H2b, B79] owner board paragraph — shrink to one line
B156 | scripts/dashboard-reminder-hook.mjs | U156 [A:C-H2c, B81] stand-down text — reword terse, non-owner only
B157 | scripts/dashboard-reminder-hook.mjs | U157 [A:C-H2d, B82] context-ceiling notice — keep
B158 | scripts/batch-resume-hook.mjs | U158 [A:C-H3a, B83, B84] SessionStart first paragraph — shrink to live facts plus pointers, under 2 KB
B159 | scripts/batch-resume-hook.mjs | U159 [A:C-H3b] SessionStart POINT BOUNDARY paragraph — reword, drop history
B160 | scripts/batch-resume-hook.mjs; docs/batch-owner-runbook.md | U160 [A:C-H3c, B85–B91] owner runbook dump — replace with one pointer line
B161 | .claude/settings.json PreToolUse guards | U161 [A:C-H4, B92–B100] — keep, silent on allow
B162 | scripts/lock-heartbeat-hook.mjs | U162 [A:C-H5, B101–B104] heartbeat notices — keep
B163 | scripts/prep-arm-hook.mjs | U163 [B105] — keep
B164 | .claude/settings.json Stop hooks | U164 [B106] 29 project Stop guards — keep
B165 | Stop dashboard refusal | U165 [A:C-H6a, B107] BATCH DASHBOARD NOT REGISTERED — shrink to two lines
B166 | Stop batch-progress refusal | U166 [A:C-H6b, B108] DO NOT STOP THE BATCH — shrink to count plus first 3 points
B167 | ~/.claude/hooks/check-reply-timestamp.cjs | U167 [A:C-H6c, B109, B111] timestamp refusals — keep
B168 | Stop batch-waiting message | U168 [B110] — keep, no body supplied
B169 | hook inventory | U169 [B112] coverage limit — keep as accounting note
B170 | hook inventory | U170 [B113] conditioning limit — keep as constraint
B171 | .claude/settings.json; ~/.claude/settings.json | U171 [A:B-PERM, B2, B3] whole-tool allows — keep
B172 | plugin marketplace registration | U172 [A:B-PLUGIN-MKT, B4] — keep
B173 | claude.ai account connectors | U173 [A:B-MCP-DOCS, B5, B58–B65, B77] Claude Docs connector, tools, instructions — cut, attended, measured
B174 | claude.ai account connectors | U174 [A:B-MCP-DRIVE, B6, B66–B76] Google Drive — cut, attended, measured
B175 | claude.ai account connectors | U175 [A:B-MCP-GMAIL, B7] Gmail — cut
B176 | claude.ai account connectors | U176 [A:B-MCP-GCAL, B8] Google Calendar — cut
B177 | ~/.claude/skills/synced | U177 [A:B-SK-NOTE, B9] account-level skills constraint — keep
B178 | .claude/skills/sketch | U178 [A:B-SK-sketch, B10] — keep
B179 | skill listing | U179 [A:B-SK-artifact-design, B12] — keep
B180 | skill listing | U180 [A:B-SK-artifact-diagramming, B13] — keep
B181 | skill listing | U181 [A:B-SK-artifact-capabilities, B14] — keep
B182 | skill listing | U182 [A:B-SK-dataviz, B11] — cut if switchable
B183 | skill listing | U183 [A:B-SK-update-config, B15] — keep
B184 | skill listing | U184 [A:B-SK-keybindings-help, B16] — cut if switchable
B185 | skill listing | U185 [A:B-SK-code-review, B17] — keep
B186 | skill listing | U186 [A:B-SK-simplify, B18] — keep
B187 | skill listing | U187 [A:B-SK-fewer-permission-prompts, B19] — cut, DROPPED procedure
B188 | skill listing | U188 [A:B-SK-loop, B20] — keep
B189 | skill listing | U189 [A:B-SK-schedule, B21] — cut if switchable
B190 | skill listing | U190 [A:B-SK-claude-api, B22] — keep
B191 | skill listing | U191 [A:B-SK-workflow-authoring, B23] — keep
B192 | skill listing | U192 [A:B-SK-run, B24] — keep
B193 | skill listing | U193 [A:B-SK-init, B25] — cut if switchable
B194 | skill listing | U194 [A:B-SK-security-review, B26] — keep
B195 | ~/.claude/skills/synced | U195 [A:B-SK-docs, B27] — cut, coupled to the Docs connector
B196 | ~/.claude/skills/synced | U196 [A:B-SK-docx, B28] — cut
B197 | ~/.claude/skills/synced | U197 [A:B-SK-import-memory, B29] — cut
B198 | ~/.claude/skills/synced | U198 [A:B-SK-morning, B30] — cut
B199 | ~/.claude/skills/synced | U199 [A:B-SK-pdf, B31] — keep
B200 | ~/.claude/skills/synced | U200 [A:B-SK-pptx, B32] — cut
B201 | ~/.claude/skills/synced | U201 [A:B-SK-skill-creator, B33] — keep
B202 | ~/.claude/skills/synced | U202 [A:B-SK-xlsx, B34] — cut
B203 | agent listing | U203 [A:B-AG-claude, B35] — keep
B204 | agent listing | U204 [A:B-AG-general-purpose, B38] — keep
B205 | agent listing | U205 [A:B-AG-Explore, B37] — keep
B206 | agent listing | U206 [A:B-AG-Plan, B39] — keep
B207 | .claude/agents/trivial-task.md | U207 [A:B-AG-trivial-task, B41] — keep
B208 | agent listing | U208 [A:B-AG-claude-code-guide, B36] — keep
B209 | agent listing | U209 [A:B-AG-statusline-setup, B40] — cut if a per-agent deny hides it
B210 | deferred tools | U210 [A:B-DT-Artifact, B42, B43] ArtifactComments, ArtifactData — keep
B211 | deferred tools | U211 [A:B-DT-Cron, B44, B45, B46] — keep
B212 | deferred tools | U212 [A:B-DT-DesignSync, B47] — keep
B213 | deferred tools | U213 [A:B-DT-Worktree, B48, B49] — keep
B214 | deferred tools | U214 [A:B-DT-Monitor, B50] — keep
B215 | deferred tools | U215 [A:B-DT-NotebookEdit, B51] — keep
B216 | deferred tools | U216 [A:B-DT-PushNotification, B52] — keep
B217 | deferred tools | U217 [A:B-DT-RemoteTrigger, B53] — keep
B218 | deferred tools | U218 [A:B-DT-SendMessage/TaskStop, B54, B55] — keep
B219 | deferred tools | U219 [A:B-DT-Web, B56, B57] — keep
B220 | local/1209/bundle.md | U220 [B1] evidence boundary — keep as constraint
B221 | local/1209/bundle.md | U221 [B297] accounting baseline — keep
B222 | proposed cut list | U222 [B298] dropped-rules register — only the fewer-permission-prompts procedure is dropped
B223 | savings estimate, tool surface | U223 [B299] — re-derive after measurement
B224 | savings estimate, hook texts | U224 [B300] — B's targets stand
B225 | savings estimate, CLAUDE.md/MEMORY.md | U225 [B301] — B's figure is an upper bound
B226 | project settings env | NEW: A's switch ENABLE_CLAUDEAI_MCP_SERVERS=false is all-or-nothing, so B's mix (keep Docs/Drive, cut Gmail/Calendar) cannot be produced by it; a per-connector cut needs an account disconnect
B227 | claude.ai account | NEW: connector and synced-skill cuts are account-wide and reach the user's other projects; each needs the user's attended decision
B228 | ~/.claude/hooks/*.cjs; memory directory | NEW: both timestamp hooks and the memory directory lie outside the repository, so edits there have no branch, CI or git rollback; copy the current files before overwriting
B229 | hook scripts and their tests | NEW: A names a test-pin check only for the §7.1 list; the same check is owed for every shrunk hook string and for any refusal matched by text
B230 | hook scripts | NEW: B's proposed hook lines are German while hook strings are code; the chosen wordings are English
B231 | memory/context-details.md | NEW: only MEMORY.md is loaded by the harness; an owner session will read context-details.md at start, so moved lines save tokens only in non-owner sessions unless that file is read by topic
B232 | memory/context-details.md | NEW: neither list checks whether any script or guard requires every leaf to be linked from MEMORY.md itself; verify before moving 22 entries
B233 | local/1209 measurement | NEW: neither list defines the acceptance reading: re-measure a fresh session's fixed load after the changes against the recorded baseline (commit 9d25e9fd3) and report the difference per part
B234 | scripts/batch-resume-hook.mjs | NEW: neither list states the order of work for the SessionStart shrink: confirm each removed paragraph exists in its pointer target before deleting it from the hook
B235 | local/1209/list-b.txt; this answer | NEW: list B's ids (B1–B301) and this answer's required line ids (B1–B235) share one namespace; the next merger must key on the JSON 'from' fields, not on the line numbers
--- end ---

ask-astra: Fable 5.1 (effort medium) answered the enumerate in 448s — 235 entries
  B1 | CLAUDE.md | U1 [A:D-CLAUDE-1-1, B115] §1 goal — reword
  B2 | CLAUDE.md | U2 [A:D-CLAUDE-2-1, B116] single-player only — keep
  B3 | CLAUDE.md | U3 [A:D-CLAUDE-2-2, B117] no onboarding/tutorial — keep
  B4 | CLAUDE.md | U4 [A:D-CLAUDE-2-3, B118] no invented systems — keep
  B5 | CLAUDE.md | U5 [A:D-CLAUDE-2-4, B119] numeric guesses in balance.ts — keep, §14 and never-override clauses must stay
  B6 | CLAUDE.md | U6 [A:D-CLAUDE-2-5, B120] §7.1 checklist not gate — reword with date suffix
  B7 | CLAUDE.md | U7 [A:D-CLAUDE-2-6, B121] infrastructure freeze — reword, all clauses kept
  B8 | CLAUDE.md | U8 [A:D-CLAUDE-2-7, B122] finding intake — reword
  B9 | CLAUDE.md | U9 [A:D-CLAUDE-3-1, B123] render backends — reword plus pointer
  B10 | CLAUDE.md | U10 [A:D-CLAUDE-3-2, B124] kokoro-js TTS — reword one line, not move
  B11 | CLAUDE.md | U11 [A:D-CLAUDE-3-3, B125] runtime dependency justification — keep
  B12 | CLAUDE.md | U12 [A:D-CLAUDE-4-1, A:D-CLAUDE-4-2, B126] design-change sync and topic organisation — keep
  B13 | CLAUDE.md | U13 [A:D-CLAUDE-5-1, B127] tier suites / LARGE per bundle — keep
  B14 | CLAUDE.md | U14 [A:D-CLAUDE-5-2, B128] Vitest vs Playwright — reword plus pointer
  B15 | CLAUDE.md | U15 [A:D-CLAUDE-6-1, B129] branch workflow — reword
  B16 | CLAUDE.md | U16 [A:D-CLAUDE-6-2, B130] merge ends the branch — keep
  B17 | CLAUDE.md | U17 [A:D-CLAUDE-6-3, B131] bookkeeping on main — keep
  B18 | CLAUDE.md | U18 [A:D-CLAUDE-6-4, B132] TASKS.md main-only — keep
  B19 | CLAUDE.md | U19 [A:D-CLAUDE-6-5, B133] land-point.mjs, mandatory gate, re-verify — reword, not move
  B20 | CLAUDE.md | U20 [A:D-CLAUDE-6-6, B134] delegated author point-brief — keep
  B21 | CLAUDE.md | U21 [A:D-CLAUDE-6-7, B135] durable Astra authors, delegates never merge — reword keeping handover semantics
  B22 | CLAUDE.md | U22 [A:D-CLAUDE-6-8, B136] context fence preventive text — reword, not move
  B23 | CLAUDE.md | U23 [A:D-CLAUDE-6-9, B137] model policy — reword as bullets
  B24 | CLAUDE.md | U24 [A:D-CLAUDE-6-10, B138] four eyes two modes — keep
  B25 | CLAUDE.md | U25 [A:D-CLAUDE-6-11, B139] player text in language files — keep
  B26 | CLAUDE.md | U26 [A:D-CLAUDE-6-12, B140] journal §15 markup — reword one line, not move
  B27 | CLAUDE.md | U27 [A:D-CLAUDE-6-13, B141] small output, blocked action = project command — keep
  B28 | CLAUDE.md | U28 [A:D-CLAUDE-6-14, B142] settled judgment / VDZK authorization — reword for length, all exceptions kept
  B29 | CLAUDE.md | U29 [A:D-CLAUDE-6-15, B143] comments brief, // OPEN: — keep
  B30 | CLAUDE.md | U30 [A:D-CLAUDE-7.1-0, B144] §7.1 introduction — reword into the pointer
  B31 | CLAUDE.md → docs/acceptance-criteria-detail.md | U31 [A:D-CLAUDE-7.1-L, B145–B176] 32 criterion titles — move, none dropped, keep if a test pins the list
  B32 | CLAUDE.md | U32 [A:D-CLAUDE-7.2-1, B177] build/lint/unit/audit cadence — keep, audit conflict open
  B33 | CLAUDE.md | U33 [A:D-CLAUDE-7.2-2, B178] player-reachable states, screenshot subject — keep
  B34 | CLAUDE.md | U34 [A:D-CLAUDE-7.2-3, B179] backend lanes — reword plus pointer
  B35 | CLAUDE.md | U35 [A:D-CLAUDE-7.2-4, B180] red run closure, retry SUSPECT — keep
  B36 | CLAUDE.md | U36 [A:D-CLAUDE-7.2-5, B181] dev invariant assertions — keep
  B37 | CLAUDE.md | U37 [A:D-CLAUDE-7.2-6, B182] before-answering duties — reword, not move
  B38 | CLAUDE.md | U38 [A:D-CLAUDE-7.2-7, B183] pre-action hooks are pointers — reword, A's cut reversed
  B39 | CLAUDE.md | U39 [A:D-CLAUDE-7.2-8, B184] guard-preflight — keep
  B40 | CLAUDE.md | U40 [A:D-CLAUDE-7.2-9, B185] picture stability before golden image — reword one line, not move
  B41 | CLAUDE.md | U41 [A:D-CLAUDE-7.2-10, B186] fix deviations, no false fulfilment — keep
  B42 | CLAUDE.md | U42 [A:D-CLAUDE-9-1, B187] closing report contents — keep
  B43 | CLAUDE.md | U43 [A:D-CLAUDE-9-2, B188] CLOSING_STEPS / closing-guard — reword, not move
  B44 | CLAUDE.md | U44 [A:D-CLAUDE-9-3, B189] code freeze during closing — keep
  B45 | CLAUDE.md | U45 [B114] title — reword, anchors stable
  B46 | CLAUDE.md; hooks; memory | U46 [B294] model/context cross-source conflicts — keep open
  B47 | CLAUDE.md; hooks; memory | U47 [B295] workflow-scope cross-source conflicts — keep open
  B48 | CLAUDE.md; hooks; memory | U48 [B296] release vs poc distinction — keep
  B49 | MEMORY.md | U49 [A:D-MEM-HEADER, B190] header — reword plus link to context-details.md
  B50 | MEMORY.md | U50 [A:D-MEM-vscode-restart-kills-the-container, B191] — move to context-details.md
  B51 | MEMORY.md | U51 [A:D-MEM-commit-proxy-misses-unlanded-work, B192] — move to context-details.md
  B52 | MEMORY.md | U52 [A:D-MEM-measure-dont-assume, B193] — reword
  B53 | MEMORY.md | U53 [A:D-MEM-check-for-an-existing-branch-first, B194] — reword
  B54 | MEMORY.md | U54 [A:D-MEM-blocked-action-find-the-project-command, B195] — move to context-details.md
  B55 | MEMORY.md | U55 [A:D-MEM-boundary-marker-is-fragile, B196] — keep in index, terse
  B56 | MEMORY.md | U56 [A:D-MEM-protected-paths-always-prompt, B197] — keep in index, terse
  B57 | MEMORY.md | U57 [A:D-MEM-use-1890-valid-names, B198] — reword
  B58 | MEMORY.md | U58 [A:D-MEM-bug-reports-land-in-local, B199] — move to context-details.md
  B59 | MEMORY.md | U59 [A:D-MEM-fable-sparingly, B200] — keep in index, terse
  B60 | MEMORY.md | U60 [A:D-MEM-provider-volume-strategy, B201] — move to context-details.md
  B61 | MEMORY.md | U61 [A:D-MEM-github-token, B202] — reword
  B62 | MEMORY.md | U62 [A:D-MEM-tags-only-on-request, B204] — reword as own line with poc exception pointer
  B63 | MEMORY.md | U63 [A:D-MEM-version-release-process, B205] — move to context-details.md
  B64 | MEMORY.md | U64 [A:D-MEM-speak-as-part-of-the-team, B203] — reword
  B65 | MEMORY.md | U65 [A:D-MEM-watch-for-aesthetic-oddities, B206] — keep in index, terse
  B66 | MEMORY.md | U66 [A:D-MEM-webgpu-testable-headless, B207] — move to context-details.md
  B67 | MEMORY.md | U67 [A:D-MEM-verify-default-zoom-and-webgpu, B208] — move to context-details.md, conflict flagged
  B68 | MEMORY.md | U68 [A:D-MEM-track-permission-prompts, B209] — reword
  B69 | MEMORY.md | U69 [A:D-MEM-implementation-sections-current, B210] — reword, target discrepancy open
  B70 | MEMORY.md | U70 [A:D-MEM-push-to-main-directly-is-fine, B211] — reword without B's added qualifier
  B71 | MEMORY.md | U71 [A:D-MEM-language-german, B212] — reword
  B72 | MEMORY.md | U72 [A:D-MEM-commit-message-no-point-number, B213] — reword
  B73 | MEMORY.md | U73 [A:D-MEM-bundle-names, B214] — reword
  B74 | MEMORY.md | U74 [A:D-MEM-verify-suites-need-a-quiet-machine, B215] — keep in index, terse
  B75 | MEMORY.md | U75 [A:D-MEM-findings-carrier, B216] — reword
  B76 | MEMORY.md | U76 [A:D-MEM-residuals-hide-defects, B217] — reword
  B77 | MEMORY.md | U77 [A:D-MEM-workflows-token-budget, B218] — reword
  B78 | MEMORY.md | U78 [A:D-MEM-release-order-communication-first, B219] — move to context-details.md, both versions preserved
  B79 | MEMORY.md | U79 [A:D-MEM-village-moves-allowed, B220] — move to context-details.md
  B80 | MEMORY.md | U80 [A:D-MEM-closing-runs, B221] — move to context-details.md
  B81 | MEMORY.md | U81 [A:D-MEM-saves-are-irrelevant-in-the-poc, B222] — reword
  B82 | MEMORY.md | U82 [A:D-MEM-effort-high-for-implementation, B223] — reword
  B83 | MEMORY.md | U83 [A:D-MEM-overshoot-needs-a-brake, B224] — move to context-details.md
  B84 | MEMORY.md | U84 [A:D-MEM-analysis-and-execution-in-one-go, B225] — reword in index, English
  B85 | MEMORY.md | U85 [A:D-MEM-forensics-need-a-command, B226] — move to context-details.md
  B86 | MEMORY.md | U86 [A:D-MEM-rider-point-fold-and-push, B227] — move to context-details.md, flag discrepancy recorded
  B87 | MEMORY.md | U87 [A:D-MEM-vdzk-carrier-from-sdk-sessions, B228] — move to context-details.md
  B88 | MEMORY.md | U88 [A:D-MEM-handing-over-is-not-stopping, B229] — reword in index with batch-stops link
  B89 | MEMORY.md | U89 [A:D-MEM-no-standstill-decide-and-record, B230] — keep in index, terse
  B90 | MEMORY.md | U90 [A:D-MEM-drills-must-call-the-thing, B231] — move to context-details.md
  B91 | MEMORY.md | U91 [A:D-MEM-split-a-point-that-will-not-converge, B232] — keep in index, terse
  B92 | MEMORY.md | U92 [A:D-MEM-session-cwd-stays-in-main-tree, B233] — reword
  B93 | MEMORY.md | U93 [A:D-MEM-no-invented-user-instructions, B234] — reword
  B94 | MEMORY.md | U94 [A:D-MEM-a-question-is-only-a-question, B235] — reword
  B95 | MEMORY.md | U95 [A:D-MEM-stop-refusal-is-addressed-to-me, B236] — reword
  B96 | MEMORY.md | U96 [A:D-MEM-detach-long-running-landings, B237] — move to context-details.md
  B97 | MEMORY.md | U97 [A:D-MEM-umsteuerung-vereinfachungsplan, B238] — keep in index, terse
  B98 | MEMORY.md | U98 [A:D-MEM-main-push-runs-the-full-gate, B239] — reword
  B99 | MEMORY.md | U99 [A:D-MEM-feature-tests-before-regression, B240] — reword
  B100 | MEMORY.md | U100 [A:D-MEM-only-one-head-session, B241] — reword
  B101 | memory/always-prep-during-waits.md | U101 [B242] — keep on demand
  B102 | memory/arm-dormant-guards-attended.md | U102 [B243] — keep on demand
  B103 | memory/audit-205-decisions.md | U103 [B244] — keep on demand
  B104 | memory/audit-with-model-diversity.md | U104 [B245] — keep on demand
  B105 | memory/batch-autonomy-hardened.md | U105 [B246] — keep on demand
  B106 | memory/batch-dashboard-artifact.md | U106 [B247] — keep on demand, target of the board reminder
  B107 | memory/batch-stops-only-on-explicit-order.md | U107 [B248] — keep on demand
  B108 | memory/board-cli-is-not-parallel-safe.md | U108 [B249] — keep on demand
  B109 | memory/board-transport-not-private.md | U109 [B250] — keep on demand
  B110 | memory/brief-driven-delegation.md | U110 [B251] — keep on demand
  B111 | memory/bundle-first-not-new-point.md | U111 [B252] — keep on demand
  B112 | memory/chat-timestamp.md | U112 [B253] — keep on demand
  B113 | memory/claude-71-reference-not-duplicate.md | U113 [B254] — keep on demand
  B114 | memory/container-work-is-mine.md | U114 [B255] — keep on demand
  B115 | memory/dashboard-all-open-points-in-queue.md | U115 [B256] — keep on demand
  B116 | memory/dashboard-card-single-topic.md | U116 [B257] — keep on demand
  B117 | memory/dashboard-multiple-now-cards.md | U117 [B258] — keep on demand
  B118 | memory/dashboard-no-auto-open.md | U118 [B259] — keep on demand
  B119 | memory/dashboard-vdzk-only-decisions.md | U119 [B260] — keep on demand
  B120 | memory/doc-budget-shorten-dont-raise.md | U120 [B261] — keep on demand
  B121 | memory/english-no-germanisms.md | U121 [B262] — keep on demand
  B122 | memory/hand-over-at-the-watermark.md | U122 [B263] — keep on demand
  B123 | memory/hard-cases-go-to-sol.md | U123 [B264] — keep on demand
  B124 | memory/hybrid-test-architecture.md | U124 [B265] — keep on demand
  B125 | memory/journal-voice-markup.md | U125 [B266] — keep on demand
  B126 | memory/lint-and-cve-clean-always.md | U126 [B267] — keep on demand, audit conflict open
  B127 | memory/maximal-delegation.md | U127 [B268] — keep on demand
  B128 | memory/model-diverse-by-criticality.md | U128 [B269] — keep on demand
  B129 | memory/never-stop-the-batch.md | U129 [B270] — keep on demand
  B130 | memory/new-tasks-append-and-defer.md | U130 [B271] — keep on demand
  B131 | memory/no-other-window-to-close.md | U131 [B272] — keep on demand
  B132 | memory/parallel-session-root-cause.md | U132 [B273] — keep on demand
  B133 | memory/pgrep-waiters-match-themselves.md | U133 [B274] — keep on demand
  B134 | memory/point-boundary-always-autonomous.md | U134 [B275] — keep on demand
  B135 | memory/process-scoped-regression.md | U135 [B276] — keep on demand, retry conflict flagged
  B136 | memory/push-after-every-commit.md | U136 [B277] — keep on demand
  B137 | memory/queue-order-fixes-before-finders.md | U137 [B278] — keep on demand
  B138 | memory/regression-tiers.md | U138 [B279] — keep on demand
  B139 | memory/retrospective-currency-mechanism.md | U139 [B280] — keep on demand
  B140 | memory/serving-model-watch.md | U140 [B281] — keep on demand
  B141 | memory/sol-authors-by-default.md | U141 [B282] — keep on demand
  B142 | memory/sort-visuals-into-detail-levels.md | U142 [B283] — keep on demand
  B143 | memory/stay-within-project-dir.md | U143 [B284] — keep on demand
  B144 | memory/tasks-spec-final-state-only.md | U144 [B285] — keep on demand
  B145 | memory/test-coverage-err-on-more.md | U145 [B286] — keep on demand
  B146 | memory/test-realistic-zoom.md | U146 [B287] — keep on demand
  B147 | memory/update-docs-on-change-requests.md | U147 [B288] — keep on demand
  B148 | memory/user-orders-go-through-the-carrier.md | U148 [B289] — keep on demand
  B149 | memory/verify-before-merge-not-after.md | U149 [B290] — keep on demand
  B150 | memory/verify-gui-on-both-backends.md | U150 [B291] — keep on demand
  B151 | memory/verify-owner-really-dead.md | U151 [B292] — keep on demand
  B152 | memory/withdraw-claim-when-leaving.md | U152 [B293] — keep on demand
  B153 | ~/.claude/hooks/berlin-timestamp.cjs | U153 [A:C-H1, B78] per-prompt timestamp text — shrink to A's English line with the command
  B154 | scripts/dashboard-reminder-hook.mjs | U154 [A:C-H2a, B80] context-level header line — keep
  B155 | scripts/dashboard-reminder-hook.mjs | U155 [A:C-H2b, B79] owner board paragraph — shrink to one line
  B156 | scripts/dashboard-reminder-hook.mjs | U156 [A:C-H2c, B81] stand-down text — reword terse, non-owner only
  B157 | scripts/dashboard-reminder-hook.mjs | U157 [A:C-H2d, B82] context-ceiling notice — keep
  B158 | scripts/batch-resume-hook.mjs | U158 [A:C-H3a, B83, B84] SessionStart first paragraph — shrink to live facts plus pointers, under 2 KB
  B159 | scripts/batch-resume-hook.mjs | U159 [A:C-H3b] SessionStart POINT BOUNDARY paragraph — reword, drop history
  B160 | scripts/batch-resume-hook.mjs; docs/batch-owner-runbook.md | U160 [A:C-H3c, B85–B91] owner runbook dump — replace with one pointer line
  B161 | .claude/settings.json PreToolUse guards | U161 [A:C-H4, B92–B100] — keep, silent on allow
  B162 | scripts/lock-heartbeat-hook.mjs | U162 [A:C-H5, B101–B104] heartbeat notices — keep
  B163 | scripts/prep-arm-hook.mjs | U163 [B105] — keep
  B164 | .claude/settings.json Stop hooks | U164 [B106] 29 project Stop guards — keep
  B165 | Stop dashboard refusal | U165 [A:C-H6a, B107] BATCH DASHBOARD NOT REGISTERED — shrink to two lines
  B166 | Stop batch-progress refusal | U166 [A:C-H6b, B108] DO NOT STOP THE BATCH — shrink to count plus first 3 points
  B167 | ~/.claude/hooks/check-reply-timestamp.cjs | U167 [A:C-H6c, B109, B111] timestamp refusals — keep
  B168 | Stop batch-waiting message | U168 [B110] — keep, no body supplied
  B169 | hook inventory | U169 [B112] coverage limit — keep as accounting note
  B170 | hook inventory | U170 [B113] conditioning limit — keep as constraint
  B171 | .claude/settings.json; ~/.claude/settings.json | U171 [A:B-PERM, B2, B3] whole-tool allows — keep
  B172 | plugin marketplace registration | U172 [A:B-PLUGIN-MKT, B4] — keep
  B173 | claude.ai account connectors | U173 [A:B-MCP-DOCS, B5, B58–B65, B77] Claude Docs connector, tools, instructions — cut, attended, measured
  B174 | claude.ai account connectors | U174 [A:B-MCP-DRIVE, B6, B66–B76] Google Drive — cut, attended, measured
  B175 | claude.ai account connectors | U175 [A:B-MCP-GMAIL, B7] Gmail — cut
  B176 | claude.ai account connectors | U176 [A:B-MCP-GCAL, B8] Google Calendar — cut
  B177 | ~/.claude/skills/synced | U177 [A:B-SK-NOTE, B9] account-level skills constraint — keep
  B178 | .claude/skills/sketch | U178 [A:B-SK-sketch, B10] — keep
  B179 | skill listing | U179 [A:B-SK-artifact-design, B12] — keep
  B180 | skill listing | U180 [A:B-SK-artifact-diagramming, B13] — keep
  B181 | skill listing | U181 [A:B-SK-artifact-capabilities, B14] — keep
  B182 | skill listing | U182 [A:B-SK-dataviz, B11] — cut if switchable
  B183 | skill listing | U183 [A:B-SK-update-config, B15] — keep
  B184 | skill listing | U184 [A:B-SK-keybindings-help, B16] — cut if switchable
  B185 | skill listing | U185 [A:B-SK-code-review, B17] — keep
  B186 | skill listing | U186 [A:B-SK-simplify, B18] — keep
  B187 | skill listing | U187 [A:B-SK-fewer-permission-prompts, B19] — cut, DROPPED procedure
  B188 | skill listing | U188 [A:B-SK-loop, B20] — keep
  B189 | skill listing | U189 [A:B-SK-schedule, B21] — cut if switchable
  B190 | skill listing | U190 [A:B-SK-claude-api, B22] — keep
  B191 | skill listing | U191 [A:B-SK-workflow-authoring, B23] — keep
  B192 | skill listing | U192 [A:B-SK-run, B24] — keep
  B193 | skill listing | U193 [A:B-SK-init, B25] — cut if switchable
  B194 | skill listing | U194 [A:B-SK-security-review, B26] — keep
  B195 | ~/.claude/skills/synced | U195 [A:B-SK-docs, B27] — cut, coupled to the Docs connector
  B196 | ~/.claude/skills/synced | U196 [A:B-SK-docx, B28] — cut
  B197 | ~/.claude/skills/synced | U197 [A:B-SK-import-memory, B29] — cut
  B198 | ~/.claude/skills/synced | U198 [A:B-SK-morning, B30] — cut
  B199 | ~/.claude/skills/synced | U199 [A:B-SK-pdf, B31] — keep
  B200 | ~/.claude/skills/synced | U200 [A:B-SK-pptx, B32] — cut
  B201 | ~/.claude/skills/synced | U201 [A:B-SK-skill-creator, B33] — keep
  B202 | ~/.claude/skills/synced | U202 [A:B-SK-xlsx, B34] — cut
  B203 | agent listing | U203 [A:B-AG-claude, B35] — keep
  B204 | agent listing | U204 [A:B-AG-general-purpose, B38] — keep
  B205 | agent listing | U205 [A:B-AG-Explore, B37] — keep
  B206 | agent listing | U206 [A:B-AG-Plan, B39] — keep
  B207 | .claude/agents/trivial-task.md | U207 [A:B-AG-trivial-task, B41] — keep
  B208 | agent listing | U208 [A:B-AG-claude-code-guide, B36] — keep
  B209 | agent listing | U209 [A:B-AG-statusline-setup, B40] — cut if a per-agent deny hides it
  B210 | deferred tools | U210 [A:B-DT-Artifact, B42, B43] ArtifactComments, ArtifactData — keep
  B211 | deferred tools | U211 [A:B-DT-Cron, B44, B45, B46] — keep
  B212 | deferred tools | U212 [A:B-DT-DesignSync, B47] — keep
  B213 | deferred tools | U213 [A:B-DT-Worktree, B48, B49] — keep
  B214 | deferred tools | U214 [A:B-DT-Monitor, B50] — keep
  B215 | deferred tools | U215 [A:B-DT-NotebookEdit, B51] — keep
  B216 | deferred tools | U216 [A:B-DT-PushNotification, B52] — keep
  B217 | deferred tools | U217 [A:B-DT-RemoteTrigger, B53] — keep
  B218 | deferred tools | U218 [A:B-DT-SendMessage/TaskStop, B54, B55] — keep
  B219 | deferred tools | U219 [A:B-DT-Web, B56, B57] — keep
  B220 | local/1209/bundle.md | U220 [B1] evidence boundary — keep as constraint
  B221 | local/1209/bundle.md | U221 [B297] accounting baseline — keep
  B222 | proposed cut list | U222 [B298] dropped-rules register — only the fewer-permission-prompts procedure is dropped
  B223 | savings estimate, tool surface | U223 [B299] — re-derive after measurement
  B224 | savings estimate, hook texts | U224 [B300] — B's targets stand
  B225 | savings estimate, CLAUDE.md/MEMORY.md | U225 [B301] — B's figure is an upper bound
  B226 | project settings env | NEW: A's switch ENABLE_CLAUDEAI_MCP_SERVERS=false is all-or-nothing, so B's mix (keep Docs/Drive, cut Gmail/Calendar) cannot be produced by it; a per-connector cut needs an account disconnect
  B227 | claude.ai account | NEW: connector and synced-skill cuts are account-wide and reach the user's other projects; each needs the user's attended decision
  B228 | ~/.claude/hooks/*.cjs; memory directory | NEW: both timestamp hooks and the memory directory lie outside the repository, so edits there have no branch, CI or git rollback; copy the current files before overwriting
  B229 | hook scripts and their tests | NEW: A names a test-pin check only for the §7.1 list; the same check is owed for every shrunk hook string and for any refusal matched by text
  B230 | hook scripts | NEW: B's proposed hook lines are German while hook strings are code; the chosen wordings are English
  B231 | memory/context-details.md | NEW: only MEMORY.md is loaded by the harness; an owner session will read context-details.md at start, so moved lines save tokens only in non-owner sessions unless that file is read by topic
  B232 | memory/context-details.md | NEW: neither list checks whether any script or guard requires every leaf to be linked from MEMORY.md itself; verify before moving 22 entries
  B233 | local/1209 measurement | NEW: neither list defines the acceptance reading: re-measure a fresh session's fixed load after the changes against the recorded baseline (commit 9d25e9fd3) and report the difference per part
  B234 | scripts/batch-resume-hook.mjs | NEW: neither list states the order of work for the SessionStart shrink: confirm each removed paragraph exists in its pointer target before deleting it from the hook
  B235 | local/1209/list-b.txt; this answer | NEW: list B's ids (B1–B301) and this answer's required line ids (B1–B235) share one namespace; the next merger must key on the JSON 'from' fields, not on the line numbers
