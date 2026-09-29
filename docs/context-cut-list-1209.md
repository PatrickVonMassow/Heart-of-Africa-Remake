# Context-load cut list — merged result of the blind-parallel stage

Four-eyes divergent stage for the smaller-context-load point. Both halves were written blind from one identical input bundle (CLAUDE.md, MEMORY.md with every memory file frontmatter, the enabled tool surface, every hook text with its firing condition, and the task statement). Baseline: `docs/context-load-1209.md`.

- List A: Claude Opus 5.5 — `docs/four-eyes/1209-blind-a-opus55.json` (verbatim `.md` beside it)
- List B: GPT-6 Astra — `docs/four-eyes/1209-blind-b-astra.json` (verbatim `.md` beside it)
- Merged by: Fable 5.1 (wrote neither half; selected by `fable-switch.mjs --status`) — `docs/four-eyes/1209-union.json`, raw answer `1209-union-fable.md`
- Count (`blind-merge.mjs --union`): 159 A + 301 B entries → 225 union entries (392 of the 460 input entries merged, 1 only A, 67 only B): every input entry accounted for.

This list is the input for the implementation; it changes no file by itself. `move-to-context-details.md` is list B’s proposed destination for session-rare detail; the implementer fixes its final path (an existing linked doc is preferred over a new one).

## Dropped rules

- **Dropped:** the `fewer-permission-prompts` skill’s allowlist procedure (U187) — it contradicts the deliberately whole-tool-broad permissions (memory `track-permission-prompts`).
- **Not dropped (reversed in the merge):** CLAUDE.md §7.2 “Pre-action hooks are pointers” — list A proposed cutting it, the merge keeps it reworded (U38).
- No other CLAUDE.md, memory, acceptance, permission or hook rule is dropped; every other change is keep, move or reword with meaning kept (U222).

## Changes (every non-keep union entry)

| ID | From | Item — action — reason / wording |
|---|---|---|
| U1 | A:D-CLAUDE-1-1, B115 | CLAUDE.md §1 goal — reword — both agree; wording: 'Build a runnable modern-remake POC of the core loop, not the complete game. design.md = target; this file = build/verification policy.' |
| U6 | A:D-CLAUDE-2-5, B120 | CLAUDE.md §2 §7.1 checklist not gate — reword — wording: '§7.1 is an acceptance checklist, never a work-start gate; progress = playable output (01.09.2026).' Date suffix kept from A because it marks a user decision. |
| U7 | A:D-CLAUDE-2-6, B121 | CLAUDE.md §2 infrastructure freeze — reword — wording: 'Infrastructure freeze: no new guards, ledger fields, routers, review planners, or workflow abstractions. Fix infrastructure only for a reproducible current-game blockade or possible false approval; defer the rest. Switch off obstructing rules; do not rebuild them. (user decision, date suffix)' |
| U8 | A:D-CLAUDE-2-7, B122 | CLAUDE.md §2 finding intake — reword — wording: 'Finding points only for reproducible player impact, security/data risk, real blockade, or deletion/simplification. Otherwise collect in non-blocking docs/backlog.md; close duplicates without new machinery.' |
| U9 | A:D-CLAUDE-3-1, B123 | CLAUDE.md §3 render backends — reword — wording: 'WebGPU primary, automatic WebGL 2 fallback; import three/webgpu, use TSL, no Chrome-only game behavior. Fallback notice: localized and dismissible. Mechanics: docs/render-architecture.md.' |
| U10 | A:D-CLAUDE-3-2, B124 | CLAUDE.md §3 kokoro-js read-aloud — reword (B) over move-to-docs (A) — a bare pointer would remove the three binding constraints from the fixed file; wording: 'Journal TTS: kokoro-js in a Web Worker; lazy-load outside startup chunks; currently English-only. Mechanics: docs/tts-architecture.md.' |
| U14 | A:D-CLAUDE-5-2, B128 | CLAUDE.md §5 Vitest vs Playwright layering — reword — wording: 'Each feature adds the right-layer test: Vitest/jsdom for browserless logic/state/HUD; Playwright only for scene, geometry, CSS/layout, audio, screenshots, end-to-end. Map: scripts/verify/README.md.' |
| U15 | A:D-CLAUDE-6-1, B129 | CLAUDE.md §6 branch workflow — reword — wording: 'Each point: feat/<point>-<slug> from main; small atomic self-contained commits; push every commit and report push failure. Merge only complete, tier-green and picture-checked: both backends when isBackendSensitivePath applies, one otherwise. Retest code conflicts.' |
| U19 | A:D-CLAUDE-6-5, B133 | CLAUDE.md §6 landing — reword (B) over move-to-runbook (A) — 'gate mandatory' and 're-verify after sync' bind delegates too, not only the owner; wording: 'Land via node scripts/land-point.mjs <N> --model <m>; post-merge gate is mandatory. Keep branches short; reverify after substantial main sync. Owner procedure: docs/batch-owner-runbook.md.' |
| U21 | A:D-CLAUDE-6-7, B135 | CLAUDE.md §6 durable Astra authors — reword — B's line keeps the handover semantics that A's pointer would hide; wording: 'Daemon-owned durable Astra authors survive handover; session-bound Agent children block it. Delegates test, commit, push; never merge.' |
| U22 | A:D-CLAUDE-6-8, B136 | CLAUDE.md §6 context fence — reword (B) over move-to-runbook (A) — in observe mode the guard refuses nothing, so this text is the only thing that acts; wording: 'Context fence: at its refusal mark start no agents, suites, points, or authoring; finishing, reading and boundary remain allowed. Default observe refuses nothing until arming lands. Mechanics: docs/batch-owner-runbook.md.' |
| U23 | A:D-CLAUDE-6-9, B137 | CLAUDE.md §6 model policy — reword — both agree on content; bullets: 'Astra authors difficult/complex/error-prone/HIGH points; Opus 5.5 authors verification-as-work; Fable 5.1 authors tagged/escalated points; unreachable Astra falls back to Opus 5.5. Review cross-vendor, never by a range author (review-astra.mjs for Claude work, Claude for Astra work). fable-switch.mjs --status alone decides Fable authoring/serving/trailer/blind-merge; serving outside its chain pauses the batch. Commits: author-model Co-Authored-By; optional distinct reviewer Reviewed-By, never reviewer Co-Authored-By.' Model version names must match fable-switch, see U46. |
| U26 | A:D-CLAUDE-6-12, B140 | CLAUDE.md §6 journal §15 markup — reword (B) over move-to-docs (A) — one line keeps the duty visible to whoever writes journal text; wording: 'Every en/de journal text carries design.md §15 emotional markup; display strips it, TTS converts it to prosody. Mechanics: docs/tts-architecture.md.' |
| U28 | A:D-CLAUDE-6-14, B142 | CLAUDE.md §6 settled judgment / VDZK authorization — reword for length only — wording: 'Execute settled judgments. Confirm outward-facing/hard-to-reverse steps unless durably authorized. A stated recommendation on a Von-dir-zu-klären card authorizes decision, execution and recorded what/why/veto-effect closure, except tags, publishes, force-pushes, user-data deletions and unrecommended genuine choices. Report failures, skips and verified outcomes faithfully.' Every exception kept. |
| U30 | A:D-CLAUDE-7.1-0, B144 | CLAUDE.md §7.1 introduction — reword — it becomes the pointer that replaces the title list (U31); wording: 'POC checklist, not a gate: numbered conditions in docs/acceptance-criteria-detail.md; matching evidence in docs/acceptance-evidence.md. Preserve numbers and update affected copies together.' |
| U31 | A:D-CLAUDE-7.1-L, B145, B146, B147, B148, B149, B150, B151, B152, B153, B154, B155, B156, B157, B158, B159, B160, B161, B162, B163, B164, B165, B166, B167, B168, B169, B170, B171, B172, B173, B174, B175, B176 | CLAUDE.md §7.1 the 32 criterion titles — move-to-docs/acceptance-criteria-detail.md — both agree; no criterion DROPPED, numbers 1–32 stay, criterion 7 details (six tonal words, bank/work teaching, silent tag) and criterion 28 saving/loading stay in the destination; do not append a second inventory if it already holds the titles. Precondition from A: if any test pins the list in CLAUDE.md, keep it there. |
| U34 | A:D-CLAUDE-7.2-3, B179 | CLAUDE.md §7.2 backend lanes — reword — wording: 'Daily browser lane: WebGPU; LARGE adds full WebGL 2 regression. Every suite asserts requested backend; touch/voice use WebGL 2. WebGL-2-only defects may wait until next LARGE. Operation: scripts/verify/README.md.' |
| U37 | A:D-CLAUDE-7.2-6, B182 | CLAUDE.md §7.2 before-answering duties — reword (B) over move-to-runbook (A) — A's one-liner invents an owner-only scope the source does not state; wording: 'Before answering: BOARD published/current/concise/single-topic, decisions visible; BATCH advancing within model/context/CI/branch/timestamp/retro rules; WORK ORDER order/spec/split/budgets valid; FINDINGS durably filed; required render/mechanism PROOF supplied. ci-status-guard waits for concluded green CI on every pushed ref. Hook authority: .claude/settings.json.' |
| U38 | A:D-CLAUDE-7.2-7, B183 | CLAUDE.md §7.2 pre-action hooks are pointers — reword (B) over cut (A) — not DROPPED; it names which guard owns which duty before the first refusal; wording: 'Before first mutation, board-first-guard requires current published focus. closing-guard owns §9; npm-install-installed versioned hooks own commit/push syntax.' |
| U40 | A:D-CLAUDE-7.2-9, B185 | CLAUDE.md §7.2 picture stability before golden-image use — reword (B) over move-to-docs (A) — wording: 'No screenshot-metric golden-image shortcut until picture-stability.mjs <suite> reports STABLE. Verdicts: docs/picture-check-levers.md.' |
| U43 | A:D-CLAUDE-9-2, B188 | CLAUDE.md §9 CLOSING_STEPS / closing-guard — reword (B) over move-to-runbook (A) — wording: 'Closing order: CLOSING_STEPS in scripts/closing-guard-core.mjs; drive --status then --step <id> --evidence <proof>. closing-guard blocks governed tags/delivery ticks until complete; tag scope: docs/batch-owner-runbook.md#release-and-closing.' |
| U45 | B114 | CLAUDE.md title/headings — reword — only B; wording '# HoA POC — session rules'; section numbers and §7.1 anchors must stay stable because other files reference them. |
| U49 | A:D-MEM-HEADER, B190 | MEMORY.md header — reword (B) over keep (A) — needed because entries move out; wording: '# Session memory' plus one line 'Role/task details: [context-details.md](context-details.md) — owner, QA, release, environment, research.' |
| U50 | A:D-MEM-vscode-restart-kills-the-container, B191 | memory vscode-restart-kills-the-container — move-to-context-details.md — A's cut-index would orphan the leaf; move keeps it reachable. |
| U51 | A:D-MEM-commit-proxy-misses-unlanded-work, B192 | memory commit-proxy-misses-unlanded-work — move-to-context-details.md (B) over keep (A) — relevant only during usage accounting. |
| U52 | A:D-MEM-measure-dont-assume, B193 | memory measure-dont-assume — reword — wording: '[measure-dont-assume.md] Measure machine/repo/game state this turn before asserting it; include reading time.' |
| U53 | A:D-MEM-check-for-an-existing-branch-first, B194 | memory check-for-an-existing-branch-first — reword — wording: '[check-for-an-existing-branch-first.md] Before starting a point, list worktrees and branches; board/TASKS omit live authors.' |
| U54 | A:D-MEM-blocked-action-find-the-project-command, B195 | memory blocked-action-find-the-project-command — move-to-context-details.md — rule stays in CLAUDE.md §6 (U27); move rather than cut-index so the leaf stays linked. |
| U57 | A:D-MEM-use-1890-valid-names, B198 | memory use-1890-valid-names — reword — wording: '[use-1890-valid-names.md] Game place/landmark/settlement names must be valid in 1890.' |
| U58 | A:D-MEM-bug-reports-land-in-local, B199 | memory bug-reports-land-in-local — move-to-context-details.md — both take it off the index; move keeps the leaf linked. |
| U60 | A:D-MEM-provider-volume-strategy, B201 | memory provider-volume-strategy — move-to-context-details.md (B) over keep (A) — quota measurement is a distinct activity with a natural lookup moment. |
| U61 | A:D-MEM-github-token, B202 | memory github-token — reword — wording: '[github-token.md] .secrets/github-token: use only for requested GitHub changes; export GH_TOKEN; never print.' |
| U62 | A:D-MEM-tags-only-on-request, B204 | memory tags-only-on-request — reword (B's separate line) over A's merged release line — A's merge erases the poc exception; wording: '[tags-only-on-request.md] Version/release tags require explicit approval for that tag; a cut vX.Y is frozen. poc exception: owner runbook.' |
| U63 | A:D-MEM-version-release-process, B205 | memory version-release-process — move-to-context-details.md (B) over merge-into-one-line (A) — keeps 'new demo: Maximum QA first' and the separate requested-poc operation. |
| U64 | A:D-MEM-speak-as-part-of-the-team, B203 | memory speak-as-part-of-the-team — reword — wording: '[speak-as-part-of-the-team.md] Project rules/mistakes: say wir/unser.' |
| U66 | A:D-MEM-webgpu-testable-headless, B207 | memory webgpu-testable-headless — move-to-context-details.md (B) over keep (A) — CLAUDE.md §7.2 already makes WebGPU the everyday lane; keep it next to the contradicting leaf (U67). |
| U67 | A:D-MEM-verify-default-zoom-and-webgpu, B208 | memory verify-default-zoom-and-webgpu — move-to-context-details.md (B) over keep (A) — its frontmatter claim that headless WebGPU is impossible contradicts U66; flag the conflict, keep the zoom rule. |
| U68 | A:D-MEM-track-permission-prompts, B209 | memory track-permission-prompts — reword — wording: '[track-permission-prompts.md] Preserve maximally broad whole-tool allowances, including Bash, in both settings scopes; never narrow/tidy them.' |
| U69 | A:D-MEM-implementation-sections-current, B210 | memory implementation-sections-current — reword — wording: '[implementation-sections-current.md] Climate/people rendering changes update research→game records in the same commit; see leaf for targets.' Index targets and frontmatter targets differ; unresolved. |
| U70 | A:D-MEM-push-to-main-directly-is-fine, B211 | memory push-to-main-directly-is-fine — reword — wording: '[push-to-main-directly-is-fine.md] Direct push to main is fine; do not request a PR.' B's qualifier 'authorized owner automation' is not evidenced in the inputs and is left out. |
| U71 | A:D-MEM-language-german, B212 | memory language-german — reword — wording: '[language-german.md] User replies: Deutsch, Du; code/commits: English.' |
| U72 | A:D-MEM-commit-message-no-point-number, B213 | memory commit-message-no-point-number — reword — wording: '[commit-message-no-point-number.md] Commit messages describe changes; no work-order point number.' |
| U73 | A:D-MEM-bundle-names, B214 | memory bundle-names — reword — wording: '[bundle-names.md] With the user, use German bundle names; letters are internal IDs.' |
| U75 | A:D-MEM-findings-carrier, B216 | memory findings-carrier — reword — wording: '[findings-carrier.md] Owner drains via scripts/finding.mjs; non-owner user orders use --request.' The carrier body never goes into session context. |
| U76 | A:D-MEM-residuals-hide-defects, B217 | memory residuals-hide-defects — reword — wording: '[residuals-hide-defects.md] Accept a residual only when genuinely missing information is named.' |
| U77 | A:D-MEM-workflows-token-budget, B218 | memory workflows-token-budget — reword — wording: '[workflows-token-budget.md] Keep fan-outs small; estimate/warn and obtain approval for large ones; verify inline and collect results, not transcripts.' |
| U78 | A:D-MEM-release-order-communication-first, B219 | memory release-order-communication-first — move-to-context-details.md (B) over reword (A) — index and frontmatter state different priorities and stale point numbers; both versions are preserved there. |
| U79 | A:D-MEM-village-moves-allowed, B220 | memory village-moves-allowed — move-to-context-details.md (B) over keep (A) — domain permission with a natural lookup moment. |
| U80 | A:D-MEM-closing-runs, B221 | memory closing-runs — move-to-context-details.md (B) over keep (A) — owner closing only; keeps autonomous-closing authorization and Closing-last rule. |
| U81 | A:D-MEM-saves-are-irrelevant-in-the-poc, B222 | memory saves-are-irrelevant-in-the-poc — reword — wording: '[saves-are-irrelevant-in-the-poc.md] Save changes owe no migration; report a break in one line.' Criterion 28 stays (U31). |
| U82 | A:D-MEM-effort-high-for-implementation, B223 | memory effort-high-for-implementation — reword — both agree; wording: '[effort-high-for-implementation.md] All work: Medium; never High/xhigh.' The filename contradicts its content; renaming is out of scope. |
| U83 | A:D-MEM-overshoot-needs-a-brake, B224 | memory overshoot-needs-a-brake — move-to-context-details.md (B) over keep (A) — incident lesson; next to the freeze it must not read as authority to build a brake. |
| U84 | A:D-MEM-analysis-and-execution-in-one-go, B225 | memory analysis-and-execution-in-one-go — reword in index (A) over move (B) — behavioural trigger with no lookup moment; wording: '[analysis-and-execution-in-one-go.md] Never park a verdict; queue it first and hand it over.' Frontmatter's narrower condition stays in the leaf; it does not override a read-only analysis. |
| U85 | A:D-MEM-forensics-need-a-command, B226 | memory forensics-need-a-command — move-to-context-details.md (B) over keep (A) — under the freeze it must not read as an order to build tooling. |
| U86 | A:D-MEM-rider-point-fold-and-push, B227 | memory rider-point-fold-and-push — move-to-context-details.md — move over cut-index; index says fold-point --none, frontmatter says --delivered; record both, nominate neither. |
| U87 | A:D-MEM-vdzk-carrier-from-sdk-sessions, B228 | memory vdzk-carrier-from-sdk-sessions — move-to-context-details.md — move over cut-index; role-specific workaround. |
| U88 | A:D-MEM-handing-over-is-not-stopping, B229 | memory handing-over-is-not-stopping — reword in index (A) over move (B) — trigger word arrives in chat without warning; wording: '[handing-over-is-not-stopping.md] abgeben = transfer to successor, never pause/stop; batch stops only on explicit order ([batch-stops-only-on-explicit-order.md]).' |
| U90 | A:D-MEM-drills-must-call-the-thing, B231 | memory drills-must-call-the-thing — move-to-context-details.md (B) over keep (A) — mechanism testing is rare under the freeze. |
| U92 | A:D-MEM-session-cwd-stays-in-main-tree, B233 | memory session-cwd-stays-in-main-tree — reword — wording: '[session-cwd-stays-in-main-tree.md] Main-session shell cwd: /workspace/hoa; worktree cwd misleads Stop guards.' Scope versus worktree delegates is unresolved (U47). |
| U93 | A:D-MEM-no-invented-user-instructions, B234 | memory no-invented-user-instructions — reword — wording: '[no-invented-user-instructions.md] Scoped remarks are not standing orders; quote users verbatim only.' |
| U94 | A:D-MEM-a-question-is-only-a-question, B235 | memory a-question-is-only-a-question — reword — wording: '[a-question-is-only-a-question.md] Chat questions neither claim nor stop/change the batch unless explicitly requested.' |
| U95 | A:D-MEM-stop-refusal-is-addressed-to-me, B236 | memory stop-refusal-is-addressed-to-me — reword — wording: '[stop-refusal-is-addressed-to-me.md] On Stop refusal, remeasure blocking state; never repeat the same refused answer.' |
| U96 | A:D-MEM-detach-long-running-landings, B237 | memory detach-long-running-landings — move-to-context-details.md — move over cut-index; keeps setsid and the prose-every-third-turn cadence. |
| U98 | A:D-MEM-main-push-runs-the-full-gate, B239 | memory main-push-runs-the-full-gate — reword — wording: '[main-push-runs-the-full-gate.md] Main push runs build+lint+audit+unit; never push main during a browser picture run.' |
| U99 | A:D-MEM-feature-tests-before-regression, B240 | memory feature-tests-before-regression — reword — wording: '[feature-tests-before-regression.md] Debug with the feature's own test; full regression once at the end for evidence.' |
| U100 | A:D-MEM-only-one-head-session, B241 | memory only-one-head-session — reword — wording: '[only-one-head-session.md] This chat is the only head session; all others are headless; never route the user through them.' |
| U153 | A:C-H1, B78 | UserPromptSubmit berlin-timestamp.cjs — shrink — both agree; A's English line is chosen because it keeps the re-measure command and hook strings are code; wording: 'Turn start **<stamp>** (Berlin). Lead the reply with it; if tools ran, re-measure right before answering, never extrapolate: <node -e … command>'. User-scope file, attended edit. |
| U155 | A:C-H2b, B79 | [dashboard-reminder] owner board paragraph — shrink — both agree; wording: '[board] Batch state changed → update the board first (node scripts/board.mjs <cmd>); procedure: memory batch-dashboard-artifact; last edit ~N min ago.' Full paragraph only on state the hook already has; build no new detector (U170). |
| U156 | A:C-H2c, B81 | stand-down text — reword — already conditional; owner sessions get no stand-down line; wording: '[batch-singleton] STAND DOWN: another live session holds the batch — no batch work, no merge to main, no TASKS/board edit; answer normally.' |
| U158 | A:C-H3a, B83, B84 | SessionStart batch-resume first paragraph — shrink — both agree; only measured live facts, never hard-coded point numbers or counts; restated policy replaced by pointers to CLAUDE.md §6/§9 and docs/batch-owner-runbook.md; target under 2 KB so the whole text reaches context. Precondition: each removed paragraph must exist in the pointer target first (U127). |
| U159 | A:C-H3b | SessionStart POINT BOUNDARY paragraph — reword — only A; keep one stretch per session, batch-boundary.mjs --prepare/--commit (+ --context), adopt transferred declaration first (batch-in-flight.mjs --status/--adopt); drop the history sentences. |
| U160 | A:C-H3c, B85, B86, B87, B88, B89, B90, B91 | SessionStart owner-only runbook dump (~9 KB) — move-to-docs/batch-owner-runbook.md — both agree; one line: 'Owner runbook: docs/batch-owner-runbook.md (read before dispatching); applies only to the proven batch owner.' Never inject it into a delegate or stand-down session; B's six section anchors must be checked to exist before they are cited. |
| U165 | A:C-H6a, B107 | Stop 'BATCH DASHBOARD NOT REGISTERED' refusal — shrink — both agree; at most two lines: what is missing plus the one command; general board policy leaves the refusal. |
| U166 | A:C-H6b, B108 | Stop 'DO NOT STOP THE BATCH' refusal — shrink — both agree; print the count and the first 3 points, not all 430 numbers; keep the authorized boundary/stop distinction; never emit it in stand-down sessions. |
| U173 | A:B-MCP-DOCS, B5, B58, B59, B60, B61, B62, B63, B64, B65, B77 | claude.ai Claude Docs connector, 8 deferred tools and instructions block (~732 tokens) — cut (A) over keep (B) — largest single surface item, no rule depends on it, the board is GH Pages; account-level and reversible, so it is an attended user action; count the saving only after a fresh-session measurement, else record 'not switchable from project settings'. |
| U174 | A:B-MCP-DRIVE, B6, B66, B67, B68, B69, B70, B71, B72, B73, B74, B75, B76 | claude.ai Google Drive, 11 deferred tools — cut (A) over keep (B) — B's research use is a possibility, not a recorded use; same attended account action and measurement condition as U173. |
| U175 | A:B-MCP-GMAIL, B7 | claude.ai Gmail (unauthenticated) — cut — both agree; its auth notice costs text in subagents. |
| U176 | A:B-MCP-GCAL, B8 | claude.ai Google Calendar (unauthenticated) — cut — both agree. |
| U182 | A:B-SK-dataviz, B11 | skill dataviz — cut (A) over keep (B) — B itself notes the unusually long description; reports and board are tables/text; no rule depends on it; only if a supported switch exists. |
| U184 | A:B-SK-keybindings-help, B16 | skill keybindings-help — cut (A) over keep (B) — no project rule or workflow touches keybindings; only if a supported switch exists. |
| U187 | A:B-SK-fewer-permission-prompts, B19 | skill fewer-permission-prompts — cut — both agree; its allowlist workflow contradicts the whole-tool allows; this is the only DROPPED procedure in the whole list (U222). |
| U189 | A:B-SK-schedule, B21 | skill schedule — cut (A) over keep (B) — the project records the cloud switch as off and schedules locally; only if a supported switch exists. |
| U193 | A:B-SK-init, B25 | skill init — cut (A) over keep (B) — CLAUDE.md exists and is budget-governed, which B concedes; only if a supported switch exists. |
| U195 | A:B-SK-docs, B27 | skill anthropic-skills:docs — cut (A) over keep (B) — coupled to the Docs connector cut in U173; account-level, attended. |
| U196 | A:B-SK-docx, B28 | skill anthropic-skills:docx — cut (A) over keep (B) — B concedes no Word deliverables; account-level, attended. |
| U197 | A:B-SK-import-memory, B29 | skill anthropic-skills:import-memory — cut (A) over keep (B) — memory is kept by hand; account-level, attended. |
| U198 | A:B-SK-morning, B30 | skill anthropic-skills:morning — cut (A) over keep (B) — B calls it a strong unused candidate; account-level, attended. |
| U200 | A:B-SK-pptx, B32 | skill anthropic-skills:pptx — cut (A) over keep (B) — no decks; account-level, attended. |
| U202 | A:B-SK-xlsx, B34 | skill anthropic-skills:xlsx — cut (A) over keep (B) — no spreadsheets; account-level, attended. |
| U209 | A:B-AG-statusline-setup, B40 | agent statusline-setup — cut (A) over keep (B) — the header suffix comes from a hook, not from this agent; only if a per-agent deny hides it without touching a whole-tool allow; else record 'not switchable'. |
| U222 | B298 | Dropped-rules register — keep, updated — DROPPED: only the fewer-permission-prompts allowlist procedure (U187). No CLAUDE.md, memory, acceptance, permission or hook rule is dropped; A's single rule cut (§7.2 pre-action pointers) is reversed in U38. |
| U223 | B299 | Tool-surface saving estimate — shrink, to be re-derived — B's near-zero figure assumed Docs/Drive kept; with U173–U176 and the skill cuts the saving rises only where a switch proves to work; nothing counts before a fresh-session measurement. |
| U224 | B300 | Hook-text saving estimate — shrink — B's 450–550 tokens per prompt and 700–800 per session stand as targets; the persisted 14.7 KB SessionStart output is not fixed load. |
| U225 | B301 | CLAUDE.md/MEMORY.md saving estimate — shrink, lower than B's — this merge keeps more rule text in CLAUDE.md and 9 more index lines than B, so B's 1,900–2,800 tokens is an upper bound; measure, do not estimate. |

## Kept unchanged

| ID | From | Item — reason |
|---|---|---|
| U2 | A:D-CLAUDE-2-1, B116 | CLAUDE.md §2 single-player only — keep — A keep vs B reword; B's wording saves nothing over an already terse bullet and a rewrite only risks drift. |
| U3 | A:D-CLAUDE-2-2, B117 | CLAUDE.md §2 no onboarding/tutorial — keep — A keep vs B reword; B itself calls it already compact. |
| U4 | A:D-CLAUDE-2-3, B118 | CLAUDE.md §2 no invented systems, missing concept = open item — keep — A keep vs B reword; no evidenced saving from rewording. |
| U5 | A:D-CLAUDE-2-4, B119 | CLAUDE.md §2 numeric guesses in src/config/balance.ts — keep — A keep vs B reword; B's text names design.md §14 and 'never override stated values', so the current bullet must keep both clauses if it has them (original not attached). |
| U11 | A:D-CLAUDE-3-3, B125 | CLAUDE.md §3 runtime dependency needs justification — keep — A keep vs B reword; already one line. |
| U12 | A:D-CLAUDE-4-1, A:D-CLAUDE-4-2, B126 | CLAUDE.md §4 design change updates design.md + CLAUDE.md + code; organize by topic — keep — B folds both bullets into one line of the same length; no evidenced saving. |
| U13 | A:D-CLAUDE-5-1, B127 | CLAUDE.md §5 tier suites / LARGE per bundle — keep — A keep vs B reword; cadence (once per bundle and at closing) must stay. |
| U16 | A:D-CLAUDE-6-2, B130 | CLAUDE.md §6 merge ends the branch — keep — A keep vs B reword; the cleanup set (local branch, remote branch, worktree) and the branch-hygiene-guard backstop must stay. |
| U17 | A:D-CLAUDE-6-3, B131 | CLAUDE.md §6 bookkeeping on main, mechanism in worktree — keep — A keep vs B reword; no saving shown. |
| U18 | A:D-CLAUDE-6-4, B132 | CLAUDE.md §6 TASKS.md main-only — keep — A keep vs B reword; mutation order and tasks-source.mjs consumer path stay. |
| U20 | A:D-CLAUDE-6-6, B134 | CLAUDE.md §6 delegated author uses point-brief — keep — A keep vs B reword; regenerate-stale and escalate clauses must stay. |
| U24 | A:D-CLAUDE-6-10, B138 | CLAUDE.md §6 four eyes, two modes — keep — A keep vs B reword; A calls it terse already, B's text is no shorter. |
| U25 | A:D-CLAUDE-6-11, B139 | CLAUDE.md §6 player text from language files, code English — keep — A keep vs B reword; no saving shown. |
| U27 | A:D-CLAUDE-6-13, B141 | CLAUDE.md §6 small command output, blocked action = project command — keep — A keep vs B reword; this bullet is the reason the duplicate memory line can leave the index (U54). |
| U29 | A:D-CLAUDE-6-15, B143 | CLAUDE.md §6 comments brief, // OPEN: — keep — A keep vs B reword; no saving shown. |
| U32 | A:D-CLAUDE-7.2-1, B177 | CLAUDE.md §7.2 build+lint always, unit per change, audit on lockfile — keep — A keep vs B reword; conflict with memory lint-and-cve-clean-always (audit after every change, U126) is unresolved and must not be settled by a rewrite. |
| U33 | A:D-CLAUDE-7.2-2, B178 | CLAUDE.md §7.2 player-reachable states, screenshot declares subject — keep — A keep vs B reword; no saving shown. |
| U35 | A:D-CLAUDE-7.2-4, B180 | CLAUDE.md §7.2 red run closes only by fix/charge/new point, retry SUSPECT — keep — A keep vs B reword; tension with memory process-scoped-regression is flagged in U135. |
| U36 | A:D-CLAUDE-7.2-5, B181 | CLAUDE.md §7.2 dev-mode invariant assertions — keep — A keep vs B reword; 'should' strength stays as written. |
| U39 | A:D-CLAUDE-7.2-8, B184 | CLAUDE.md §7.2 guard-preflight before governed action — keep — A keep vs B reword; command form node scripts/guard-preflight.mjs --for <action> --session <id> must stay. |
| U41 | A:D-CLAUDE-7.2-10, B186 | CLAUDE.md §7.2 fix deviations, never report unfulfilled as fulfilled — keep — A keep vs B reword; no saving shown. |
| U42 | A:D-CLAUDE-9-1, B187 | CLAUDE.md §9 closing report contents — keep — A keep vs B reword; every report component stays. |
| U44 | A:D-CLAUDE-9-3, B189 | CLAUDE.md §9 code freeze during closing — keep — A keep vs B reword; it binds delegates (no landing). |
| U46 | B294 | Cross-source model/context conflicts — keep as open item — only B; Fable 5 vs 5.1, hard-coded chain vs fable-switch, 150k vs 122k/150k, heartbeat timing; link authorities, do not invent a merged rule. |
| U47 | B295 | Cross-source workflow-scope conflicts — keep as open item — only B; condensation must not pick a side between the conflicting sources. |
| U48 | B296 | Release vs poc distinction — keep — only B; generic 'all tags need approval' wording must not erase the requested-poc exception; applied in U62. |
| U55 | A:D-MEM-boundary-marker-is-fragile, B196 | memory boundary-marker-is-fragile — keep in index, terse (A) over move (B) — costly when missed and the SessionStart boundary text shrinks (U159); wording: '[boundary-marker-is-fragile.md] Boundary last, bare commands; any later repository action invalidates it.' |
| U56 | A:D-MEM-protected-paths-always-prompt, B197 | memory protected-paths-always-prompt — keep in index, terse (A) over move (B) — it governs the settings/hook edits this cut list causes; wording: '[protected-paths-always-prompt.md] Settings/hook edits are attended-only; versioned core.hooksPath.' |
| U59 | A:D-MEM-fable-sparingly, B200 | memory fable-sparingly — keep in index, terse (A) over move (B) — routing decisions occur in any owner turn; wording: '[fable-sparingly.md] Fable is scarce and non-default; participation per fable-switch --status.' |
| U65 | A:D-MEM-watch-for-aesthetic-oddities, B206 | memory watch-for-aesthetic-oddities — keep in index, terse (A) over move (B) — applies whenever any screenshot is judged; wording: '[watch-for-aesthetic-oddities.md] Judge whether the picture looks right to a person, not only whether it functions.' |
| U74 | A:D-MEM-verify-suites-need-a-quiet-machine, B215 | memory verify-suites-need-a-quiet-machine — keep in index, terse (A) over move (B) — every authoring session schedules suites; wording: '[verify-suites-need-a-quiet-machine.md] Suites need a quiet host; check load before classifying rotating failures (Speichermessung).' |
| U89 | A:D-MEM-no-standstill-decide-and-record, B230 | memory no-standstill-decide-and-record — keep in index, terse (A) over move (B) — it decides behaviour at the moment of doubt; wording: '[no-standstill-decide-and-record.md] Self-recover; decide and record for veto on the board; no waiting decision card.' |
| U91 | A:D-MEM-split-a-point-that-will-not-converge, B232 | memory split-a-point-that-will-not-converge — keep in index, terse (A) over move (B) — authorization needed when stuck; wording: '[split-a-point-that-will-not-converge.md] Split a stuck point autonomously; no confirmation needed.' |
| U97 | A:D-MEM-umsteuerung-vereinfachungsplan, B238 | memory umsteuerung-vereinfachungsplan — keep in index, terse (A) over move (B) — keyword-triggered lookup only works from the loaded index; wording: '[umsteuerung-vereinfachungsplan.md] Umsteuerung: 01.09 nine-point plan, recorded state and veto paths.' |
| U101 | B242 | memory leaf always-prep-during-waits — keep on demand — only B; not in the index, no fixed load. |
| U102 | B243 | memory leaf arm-dormant-guards-attended — keep on demand — only B; historical status, no authorization to arm. |
| U103 | B244 | memory leaf audit-205-decisions — keep on demand — only B; zero fixed load. |
| U104 | B245 | memory leaf audit-with-model-diversity — keep on demand — only B. |
| U105 | B246 | memory leaf batch-autonomy-hardened — keep on demand — only B; no new hardening authorized. |
| U106 | B247 | memory leaf batch-dashboard-artifact — keep on demand — only B; it is the target of the shrunk board reminder (U155) and must keep the full procedure. |
| U107 | B248 | memory leaf batch-stops-only-on-explicit-order — keep on demand — only B; linked from the index line in U88. |
| U108 | B249 | memory leaf board-cli-is-not-parallel-safe — keep on demand — only B. |
| U109 | B250 | memory leaf board-transport-not-private — keep on demand — only B. |
| U110 | B251 | memory leaf brief-driven-delegation — keep on demand — only B. |
| U111 | B252 | memory leaf bundle-first-not-new-point — keep on demand — only B; scope versus append-each-defect wording unresolved. |
| U112 | B253 | memory leaf chat-timestamp — keep on demand — only B; policy source behind the shrunk timestamp hook (U153). |
| U113 | B254 | memory leaf claude-71-reference-not-duplicate — keep on demand — only B; supports U31. |
| U114 | B255 | memory leaf container-work-is-mine — keep on demand — only B. |
| U115 | B256 | memory leaf dashboard-all-open-points-in-queue — keep on demand — only B; conflict with U117 unresolved. |
| U116 | B257 | memory leaf dashboard-card-single-topic — keep on demand — only B. |
| U117 | B258 | memory leaf dashboard-multiple-now-cards — keep on demand — only B; do not weaken to reconcile U115. |
| U118 | B259 | memory leaf dashboard-no-auto-open — keep on demand — only B. |
| U119 | B260 | memory leaf dashboard-vdzk-only-decisions — keep on demand — only B. |
| U120 | B261 | memory leaf doc-budget-shorten-dont-raise — keep on demand — only B; it limits every move-to-docs action in this list. |
| U121 | B262 | memory leaf english-no-germanisms — keep on demand — only B; applies to the new hook wordings. |
| U122 | B263 | memory leaf hand-over-at-the-watermark — keep on demand — only B; 150k vs 122k/150k disagreement flagged (U46). |
| U123 | B264 | memory leaf hard-cases-go-to-sol — keep on demand — only B. |
| U124 | B265 | memory leaf hybrid-test-architecture — keep on demand — only B. |
| U125 | B266 | memory leaf journal-voice-markup — keep on demand — only B. |
| U126 | B267 | memory leaf lint-and-cve-clean-always — keep on demand — only B; its audit-after-every-change wording conflicts with §7.2 (U32), unresolved. |
| U127 | B268 | memory leaf maximal-delegation — keep on demand — only B; after U158 this leaf is the delegation source besides CLAUDE.md. |
| U128 | B269 | memory leaf model-diverse-by-criticality — keep on demand — only B. |
| U129 | B270 | memory leaf never-stop-the-batch — keep on demand — only B; tension with no-standstill (U89) flagged. |
| U130 | B271 | memory leaf new-tasks-append-and-defer — keep on demand — only B; tension with U84 (queue verdict first) unresolved. |
| U131 | B272 | memory leaf no-other-window-to-close — keep on demand — only B. |
| U132 | B273 | memory leaf parallel-session-root-cause — keep on demand — only B; 'being built' status is historical. |
| U133 | B274 | memory leaf pgrep-waiters-match-themselves — keep on demand — only B. |
| U134 | B275 | memory leaf point-boundary-always-autonomous — keep on demand — only B. |
| U135 | B276 | memory leaf process-scoped-regression — keep on demand — only B; 'flake-retry' conflicts with retry-covers-nothing (U35). |
| U136 | B277 | memory leaf push-after-every-commit — keep on demand — only B. |
| U137 | B278 | memory leaf queue-order-fixes-before-finders — keep on demand — only B. |
| U138 | B279 | memory leaf regression-tiers — keep on demand — only B. |
| U139 | B280 | memory leaf retrospective-currency-mechanism — keep on demand — only B. |
| U140 | B281 | memory leaf serving-model-watch — keep on demand — only B. |
| U141 | B282 | memory leaf sol-authors-by-default — keep on demand — only B; ended emergency, explains supersession. |
| U142 | B283 | memory leaf sort-visuals-into-detail-levels — keep on demand — only B. |
| U143 | B284 | memory leaf stay-within-project-dir — keep on demand — only B. |
| U144 | B285 | memory leaf tasks-spec-final-state-only — keep on demand — only B. |
| U145 | B286 | memory leaf test-coverage-err-on-more — keep on demand — only B. |
| U146 | B287 | memory leaf test-realistic-zoom — keep on demand — only B. |
| U147 | B288 | memory leaf update-docs-on-change-requests — keep on demand — only B. |
| U148 | B289 | memory leaf user-orders-go-through-the-carrier — keep on demand — only B. |
| U149 | B290 | memory leaf verify-before-merge-not-after — keep on demand — only B. |
| U150 | B291 | memory leaf verify-gui-on-both-backends — keep on demand — only B; scope versus isBackendSensitivePath (U15) flagged. |
| U151 | B292 | memory leaf verify-owner-really-dead — keep on demand — only B. |
| U152 | B293 | memory leaf withdraw-claim-when-leaving — keep on demand — only B. |
| U154 | A:C-H2a, B80 | [context-level] header-suffix line — keep — both agree; an unknown count stays shown as unknown. |
| U157 | A:C-H2d, B82 | [context-ceiling] notice — keep — both agree; one-shot and conditional; body not supplied, so no replacement text. |
| U161 | A:C-H4, B92, B93, B94, B95, B96, B97, B98, B99, B100 | PreToolUse guards — keep — both agree; silent on allow; refusal bodies were not supplied so none is rewritten; context fence stays in observe. |
| U162 | A:C-H5, B101, B102, B103, B104 | PostToolUse lock-heartbeat notices — keep — B103's 'shrink' asks only that the dispossession notice stay one-shot, which A records as already true. |
| U163 | B105 | PostToolUse prep-arm-hook.mjs — keep — only B; empty in the normal case; predicate and body not supplied. |
| U164 | B106 | Project Stop guards (29) — keep — only B; identities and bodies not supplied, so no per-guard rewrite is claimed. |
| U167 | A:C-H6c, B109, B111 | Stop chat-timestamp refusals — keep (A) over shrink (B) — fires only on violation and hands the exact corrected line; B's one-liners drop that line and add no comparison detail, which makes a repeated refusal likelier. |
| U168 | B110 | Stop batch-waiting message — keep — only B proposes shrink without a body or predicate in the inputs; no rewrite without the text. |
| U169 | B112 | Hook coverage limit — keep as accounting note — only B; 358/358 empty allows prove normal-path silence only and count as no saving. |
| U170 | B113 | Hook conditioning limit — keep as constraint — only B; use only state a hook already has; no detector, cache, latch or guard; it bounds U155 and U158. |
| U171 | A:B-PERM, B2, B3 | Whole-tool allows and settings files — keep — both agree; never narrow; no .mcp.json, enabledPlugins or settings.local.json is created; any cut that would need an allow narrowed is void. |
| U172 | A:B-PLUGIN-MKT, B4 | Marketplace claude-plugins-official — keep — both agree; nothing enabled, no context cost. |
| U177 | A:B-SK-NOTE, B9 | Synced anthropic-skills are account-level — keep as constraint — both agree; where no supported setting hides a skill, record 'not switchable from project settings' and count no saving. |
| U178 | A:B-SK-sketch, B10 | skill sketch — keep — both agree; user order. |
| U179 | A:B-SK-artifact-design, B12 | skill artifact-design — keep — both agree. |
| U180 | A:B-SK-artifact-diagramming, B13 | skill artifact-diagramming — keep — both agree. |
| U181 | A:B-SK-artifact-capabilities, B14 | skill artifact-capabilities — keep (B) over cut (A) — A keeps the ArtifactData/ArtifactComments tools (U210), so cutting their guidance would leave a half surface. |
| U183 | A:B-SK-update-config, B15 | skill update-config — keep — both agree. |
| U185 | A:B-SK-code-review, B17 | skill code-review — keep — both agree. |
| U186 | A:B-SK-simplify, B18 | skill simplify — keep (B) over cut (A) — deletion/simplification is an explicit finding class (U8), so non-use is not evidenced. |
| U188 | A:B-SK-loop, B20 | skill loop — keep — both agree. |
| U190 | A:B-SK-claude-api, B22 | skill claude-api — keep — both agree. |
| U191 | A:B-SK-workflow-authoring, B23 | skill workflow-authoring — keep — both agree. |
| U192 | A:B-SK-run, B24 | skill run — keep — both agree. |
| U194 | A:B-SK-security-review, B26 | skill security-review — keep — both agree. |
| U199 | A:B-SK-pdf, B31 | skill anthropic-skills:pdf — keep (B) over cut (A) — the project does 1890 source research where PDF sources are plausible; one listing line. |
| U201 | A:B-SK-skill-creator, B33 | skill anthropic-skills:skill-creator — keep (B) over cut (A) — A's reason is 'rare and attended', which is use, not non-use; the sketch skill is maintained. |
| U203 | A:B-AG-claude, B35 | agent claude — keep — both agree. |
| U204 | A:B-AG-general-purpose, B38 | agent general-purpose — keep — both agree. |
| U205 | A:B-AG-Explore, B37 | agent Explore — keep — both agree. |
| U206 | A:B-AG-Plan, B39 | agent Plan — keep — both agree. |
| U207 | A:B-AG-trivial-task, B41 | project agent trivial-task — keep — both agree. |
| U208 | A:B-AG-claude-code-guide, B36 | agent claude-code-guide — keep (B) over cut (A) — hook, harness and SDK questions are recurring project work. |
| U210 | A:B-DT-Artifact, B42, B43 | deferred tools ArtifactComments, ArtifactData — keep — both agree. |
| U211 | A:B-DT-Cron, B44, B45, B46 | deferred tools CronCreate/Delete/List — keep — both agree. |
| U212 | A:B-DT-DesignSync, B47 | deferred tool DesignSync — keep (B) over cut (A) — a deferred name costs about 5 tokens; a deny line would buy nothing measurable. |
| U213 | A:B-DT-Worktree, B48, B49 | deferred tools EnterWorktree/ExitWorktree — keep — both agree; keep the pair together. |
| U214 | A:B-DT-Monitor, B50 | deferred tool Monitor — keep — both agree. |
| U215 | A:B-DT-NotebookEdit, B51 | deferred tool NotebookEdit — keep — both agree; in the whole-tool allow list. |
| U216 | A:B-DT-PushNotification, B52 | deferred tool PushNotification — keep — both agree. |
| U217 | A:B-DT-RemoteTrigger, B53 | deferred tool RemoteTrigger — keep (B) over cut (A) — saving is about 5 tokens; the cloud switch already governs its use. |
| U218 | A:B-DT-SendMessage/TaskStop, B54, B55 | deferred tools SendMessage, TaskStop — keep — both agree. |
| U219 | A:B-DT-Web, B56, B57 | deferred tools WebFetch, WebSearch — keep — both agree. |
| U220 | B1 | Evidence boundary — keep as constraint — only B; no invocation history, hook source or memory bodies were supplied, so every cut is 'no rule or workflow depends on it', not 'measured unused'. |
| U221 | B297 | Accounting baseline — keep — only B; 22,709-token shared prefix and ~18,180-token session subtotal are distinct; characters are not tokens; on-demand leaves are not fixed load. |
