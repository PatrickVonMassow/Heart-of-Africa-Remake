# List A — keep/cut list for the fixed context load (author: Claude Opus 5.5, blind half)

Actions: keep | cut | move-to-<doc> | reword | shrink. "cut-index" = the memory file stays, only its MEMORY.md index line goes (reachable via `grep -l <word> memory/`).

## (b) Tool surface

| ID | Item | Action | Reason |
|---|---|---|---|
| B-MCP-DOCS | claude.ai Claude Docs connector (8 deferred tools + ~1.9k-char instructions block every session) | cut | No project workflow uses Claude Docs; the board is GH-Pages HTML (`board-publish.mjs`). Account-level: disable via project `env` `ENABLE_CLAUDEAI_MCP_SERVERS=false` if the harness honours it; verify with a fresh-session reading, else record "not switchable from project settings". |
| B-MCP-DRIVE | claude.ai Google Drive (11 deferred tools) | cut | Unused by any script or memory; same switch as B-MCP-DOCS. |
| B-MCP-GMAIL | claude.ai Gmail (unauthenticated; notice text in sessions) | cut | Unused; its auth notice costs text in every subagent. Same switch. |
| B-MCP-GCAL | claude.ai Google Calendar (unauthenticated) | cut | Unused; same switch. |
| B-PLUGIN-MKT | marketplace claude-plugins-official, no plugin enabled | keep | Contributes nothing to context; nothing to disable. |
| B-SK-sketch | project skill sketch | keep | User order 21.09.2026. |
| B-SK-artifact-design | artifact-design | keep | Required by sketch/Artifact publishing. |
| B-SK-artifact-diagramming | artifact-diagramming | keep | Sketch plan views. |
| B-SK-artifact-capabilities | artifact-capabilities | cut | No project page uses runtime capabilities (board is GH Pages). |
| B-SK-dataviz | dataviz | cut | No charts in the batch workflow; reports are tables/text. |
| B-SK-update-config | update-config | keep | Settings/hook edits (attended) use it. |
| B-SK-keybindings-help | keybindings-help | cut | Headless batch; never used. |
| B-SK-code-review | code-review | keep | Claude reviews Astra-authored work. |
| B-SK-simplify | simplify | cut | Review goes through the project's cross-vendor path; unused. |
| B-SK-fewer-permission-prompts | fewer-permission-prompts | cut | Permissions are deliberately whole-tool broad (memory track-permission-prompts); the skill would narrow/allowlist. |
| B-SK-loop | loop | keep | Polling waits (Monitor/Cron) may use it. |
| B-SK-schedule | schedule | cut | Cloud agents; CLOUD SWITCH OFF, launcher schedules locally. |
| B-SK-claude-api | claude-api | keep | Model ids/pricing questions recur (model policy, quota). |
| B-SK-workflow-authoring | workflow-authoring | keep | Workflow fan-outs are used (memory workflows-token-budget). |
| B-SK-run | run | keep | Launching the app for checks. |
| B-SK-init | init | cut | CLAUDE.md exists and is governed; `init` would violate its budget. |
| B-SK-security-review | security-review | keep | Security risk is a finding-intake class (CLAUDE §2). |
| B-SK-docs | anthropic-skills:docs | cut | No Claude Docs use (see B-MCP-DOCS). |
| B-SK-docx | anthropic-skills:docx | cut | No Word files. |
| B-SK-import-memory | anthropic-skills:import-memory | cut | Never used. |
| B-SK-morning | anthropic-skills:morning | cut | Not a project workflow. |
| B-SK-pdf | anthropic-skills:pdf | cut | No PDFs in the project. |
| B-SK-pptx | anthropic-skills:pptx | cut | No decks. |
| B-SK-skill-creator | anthropic-skills:skill-creator | cut | Skill authoring is rare and attended. |
| B-SK-xlsx | anthropic-skills:xlsx | cut | No spreadsheets. |
| B-SK-NOTE | synced anthropic-skills:* are account-level | note | If no project setting can hide synced/built-in skills, record each cut as "not switchable from project settings" rather than inventing a mechanism. |
| B-AG-claude | agent claude | keep | Default FleetView agent. |
| B-AG-general-purpose | general-purpose | keep | Delegation. |
| B-AG-Explore | Explore | keep | Read-only fan-out. |
| B-AG-Plan | Plan | keep | Occasional design planning. |
| B-AG-trivial-task | project agent trivial-task | keep | Project-defined delegation lane. |
| B-AG-claude-code-guide | claude-code-guide | cut | Harness questions are rare; costs a long listing line every session. Built-in: cut only if a project deny hides it without narrowing a whole-tool allow; else keep. |
| B-AG-statusline-setup | statusline-setup | cut | Never used headless; same constraint as above. |
| B-DT-Artifact | ArtifactComments, ArtifactData | keep | Sketch artifacts. |
| B-DT-Cron | CronCreate/Delete/List | keep | loop skill. |
| B-DT-DesignSync | DesignSync | cut | No design-system work. |
| B-DT-Worktree | EnterWorktree/ExitWorktree | keep | Worktree-isolated delegation. |
| B-DT-Monitor | Monitor | keep | Wait-until loops (foreground sleep blocked). |
| B-DT-NotebookEdit | NotebookEdit | keep | In the whole-tool allow list; names cost ~5 tokens. |
| B-DT-PushNotification | PushNotification | keep | agentPushNotifEnabled. |
| B-DT-RemoteTrigger | RemoteTrigger | cut | Cloud switch off. |
| B-DT-SendMessage/TaskStop | SendMessage, TaskStop | keep | Agent control. |
| B-DT-Web | WebFetch, WebSearch | keep | In allow list; research. |
| B-PERM | whole-tool allows (user + project) | keep | Memory track-permission-prompts: never narrow. |

## (c) Hook texts

| ID | Hook text | Action | One-line form / condition for full text |
|---|---|---|---|
| C-H1 | UserPromptSubmit berlin-timestamp.cjs (678 chars, every prompt) | shrink | One line: `Turn start **<stamp>** (Berlin). Lead the reply with it; re-measure if tools ran: <node -e … command>`. Drop the explanation ("reading taken NOW… ages… guard compares exactly… over-estimated"): timestamp-guard's refusal carries it. User-scope file (~/.claude/hooks) — attended edit. |
| C-H2a | [context-level] header-suffix line | keep | Already one line. |
| C-H2b | [dashboard-reminder] owner board paragraph (~850 chars, every prompt) | shrink | One line: `[board] Batch state changed → update the board first (node scripts/board.mjs <cmd>); structure: memory batch-dashboard-artifact; last edit ~N min ago.` Full paragraph only when the dashboard-guard last refused this session (existing state) — otherwise its content lives in memory batch-dashboard-artifact. |
| C-H2c | stand-down text (non-owner only) | reword | Already conditional; terse: `[batch-singleton] STAND DOWN: another live session holds the batch — no batch work, no merge to main, no TASKS/board edit; answer normally.` |
| C-H2d | [context-ceiling] notice | keep | Already one-shot and conditional. |
| C-H3a | SessionStart batch-resume first paragraph (~5.8k chars) | shrink | Keep only live facts (open count, first point, serving chain from fable-switch, cloud switch, branch, launcher/lock evidence, "you hold the batch lock"). Replace restated MODEL POLICY, feature-branch workflow, MAXIMAL DELEGATION, CLOSING FREEZE with one pointer each to CLAUDE.md §6/§9 and docs/batch-owner-runbook.md. Target < 2 KB so the whole text lands in context instead of a persisted-output preview. |
| C-H3b | SessionStart POINT BOUNDARY paragraph | reword | Keep: one stretch per session; `batch-boundary.mjs --prepare/--commit` (+ `--context`); adopt transferred declaration first (`batch-in-flight.mjs --status/--adopt`). Drop the history ("user 27.07.2026, two-phase since point 675", launcher explanation). |
| C-H3c | SessionStart owner-only runbook dump (~9 KB) | move-to-docs/batch-owner-runbook.md | Replace with one line `Owner runbook: docs/batch-owner-runbook.md (read before dispatching)`. The file already exists verbatim; today only a 2 KB preview reaches context anyway, so the dump is paid as a later file read. |
| C-H4 | PreToolUse guards | keep | Silent on allow (358/358). |
| C-H5 | PostToolUse lock-heartbeat notices | keep | Already one-shot and recorded. |
| C-H6a | Stop "BATCH DASHBOARD NOT REGISTERED" refusal (2,753 chars, repeated) | shrink | ≤ 2 lines: what is missing + the one command. Fires only on violation, but repeated 6× in one session. |
| C-H6b | Stop "DO NOT STOP THE BATCH" refusal (2,563 chars; lists 430 point numbers) | shrink | Print the count and first 3 points, not the whole list. |
| C-H6c | Stop chat-timestamp refusal (771–873) | keep | Hands the exact line; already short enough. |

## (d) CLAUDE.md

| ID | Content | Action | Reason / terse wording |
|---|---|---|---|
| D-CLAUDE-1-1 | Goal of this run | reword | "POC of the core loop, not the full game; design.md = target, this file = how." |
| D-CLAUDE-2-1 | Single-player only | keep | Terse already. |
| D-CLAUDE-2-2 | No onboarding/tutorial | keep | |
| D-CLAUDE-2-3 | No invented systems; missing concept = open item | keep | |
| D-CLAUDE-2-4 | Numeric guesses in src/config/balance.ts | keep | |
| D-CLAUDE-2-5 | §7.1 checklist, not a gate | reword | "§7.1 is a checklist, never a gate; progress = playable output (01.09.2026)." |
| D-CLAUDE-2-6 | Infrastructure freeze | reword | Keep all three clauses; drop "(user decision …)" prose into a date suffix. |
| D-CLAUDE-2-7 | Finding intake | reword | Same meaning, bullet form. |
| D-CLAUDE-3-1 | WebGPU primary / WebGL 2 fallback | reword | Keep the four constraints, drop explanation; pointer render-architecture.md. |
| D-CLAUDE-3-2 | kokoro-js read-aloud | move-to-docs/tts-architecture.md | Needed only in TTS work; keep a 1-line pointer "TTS: docs/tts-architecture.md". |
| D-CLAUDE-3-3 | No runtime dependency without justification | keep | |
| D-CLAUDE-4-1 | Design change updates design.md + CLAUDE.md + code together | keep | |
| D-CLAUDE-4-2 | Organize by topic, no monolith | keep | |
| D-CLAUDE-5-1 | Tier suites / LARGE per bundle | keep | |
| D-CLAUDE-5-2 | Vitest vs Playwright layering | reword | One line + pointer scripts/verify/README.md. |
| D-CLAUDE-6-1 | feat branch, atomic commit + push, merge when green, picture on both backends if backend-sensitive | reword | Terse bullets, meaning unchanged. |
| D-CLAUDE-6-2 | Merge ends the branch | keep | |
| D-CLAUDE-6-3 | Bookkeeping on main, mechanism in worktree | keep | |
| D-CLAUDE-6-4 | TASKS.md main-only, tick after merge, archive, tasks-source.mjs | keep | |
| D-CLAUDE-6-5 | Land via land-point.mjs; gate mandatory; re-verify after sync | move-to-docs/batch-owner-runbook.md | Owner-only operation (runbook already states it); keep 1-line "Land only via land-point.mjs (owner)". |
| D-CLAUDE-6-6 | Delegated author uses point-brief, escalates | keep | Every delegate needs it. |
| D-CLAUDE-6-7 | Durable Astra authors daemon-owned; delegates never merge | reword | Keep "Delegates test, commit, push, never merge"; move daemon/handover detail to runbook. |
| D-CLAUDE-6-8 | Context fence preventive text, observe mode | move-to-docs/batch-owner-runbook.md | Runbook already states it (observe, refuses nothing); no behaviour for other sessions. |
| D-CLAUDE-6-9 | Model policy | reword | Keep lanes, cross-vendor review, fable-switch as sole answer, unreachable Astra → Opus, Co-Authored-By model, Reviewed-By trailer; bullet form. |
| D-CLAUDE-6-10 | Four eyes two modes | keep | Terse already. |
| D-CLAUDE-6-11 | Player text from language files; code English | keep | |
| D-CLAUDE-6-12 | Journal §15 markup | move-to-docs/tts-architecture.md | Needed only when writing journal text; 1-line pointer stays. |
| D-CLAUDE-6-13 | Small command output; blocked action = project command | keep | |
| D-CLAUDE-6-14 | Act on settled judgment; confirm outward/irreversible; VDZK authorization and its exceptions | keep | Reword only for length; every exception kept. |
| D-CLAUDE-6-15 | Comments brief; `// OPEN:` | keep | |
| D-CLAUDE-7.1-0 | Criteria share numbers with detail/evidence docs | keep | |
| D-CLAUDE-7.1-L | The 32 criterion titles | move-to-docs/acceptance-criteria-detail.md | Titles already live there with their conditions; keep a 1-line pointer. CHECK: tests over CLAUDE.md may pin the list — keep if a test requires it. |
| D-CLAUDE-7.2-1 | Build + lint always, unit per change, audit on lockfile | keep | |
| D-CLAUDE-7.2-2 | Player-reachable states; screenshot declares subject | keep | |
| D-CLAUDE-7.2-3 | WebGPU everyday lane; LARGE adds WebGL 2; backend assert | reword | Pointer scripts/verify/README.md. |
| D-CLAUDE-7.2-4 | Red run closes only by fix/charge/new point; retry SUSPECT | keep | |
| D-CLAUDE-7.2-5 | Dev-mode invariant assertions | keep | |
| D-CLAUDE-7.2-6 | Before answering: board, batch, work order, finding, proof; ci-status-guard; hook inventory | move-to-docs/batch-owner-runbook.md | Owner duties enforced by Stop guards; delegates stand down. Keep 1 line "Owner: Stop guards own the before-answer duties (.claude/settings.json)". |
| D-CLAUDE-7.2-7 | Pre-action hooks are pointers | cut | DROPPED as restatement: the hooks themselves refuse with their text; no behaviour depends on this sentence. |
| D-CLAUDE-7.2-8 | guard-preflight before a governed action; routine duties first | keep | |
| D-CLAUDE-7.2-9 | Picture stability before golden-image use | move-to-docs/picture-check-levers.md | Needed only in picture work. |
| D-CLAUDE-7.2-10 | Fix deviations; never report unfulfilled as fulfilled | keep | |
| D-CLAUDE-9-1 | Closing report contents | keep | |
| D-CLAUDE-9-2 | CLOSING_STEPS / closing-guard mechanics | move-to-docs/batch-owner-runbook.md | Runbook already carries it verbatim. |
| D-CLAUDE-9-3 | Code freeze during closing | keep | Also in runbook, but binds delegates (no landing). |

## (d) MEMORY.md index

| ID | Action | Reason / terse wording |
|---|---|---|
| D-MEM-vscode-restart-kills-the-container | cut-index | Forensics only; not needed every session. |
| D-MEM-commit-proxy-misses-unlanded-work | keep | |
| D-MEM-measure-dont-assume | keep | |
| D-MEM-check-for-an-existing-branch-first | keep | |
| D-MEM-blocked-action-find-the-project-command | cut-index | Duplicates CLAUDE §6 "blocked action means find the project command". |
| D-MEM-boundary-marker-is-fragile | keep | Owner, but costly when missed. |
| D-MEM-protected-paths-always-prompt | keep | |
| D-MEM-use-1890-valid-names | keep | |
| D-MEM-bug-reports-land-in-local | cut-index | Situational (only when an F6 archive arrives). |
| D-MEM-fable-sparingly | keep | |
| D-MEM-provider-volume-strategy | keep | |
| D-MEM-github-token | keep | |
| D-MEM-speak-as-part-of-the-team | keep | |
| D-MEM-tags-only-on-request | reword | Merge with version-release-process into one line: "Release: closing → approval → vX.Y tag → poc → publish; tag only on explicit approval; a cut version is frozen". |
| D-MEM-version-release-process | reword | Merged into the line above. |
| D-MEM-watch-for-aesthetic-oddities | keep | |
| D-MEM-webgpu-testable-headless | keep | |
| D-MEM-verify-default-zoom-and-webgpu | keep | |
| D-MEM-track-permission-prompts | keep | |
| D-MEM-implementation-sections-current | keep | |
| D-MEM-push-to-main-directly-is-fine | keep | |
| D-MEM-language-german | keep | |
| D-MEM-commit-message-no-point-number | keep | |
| D-MEM-bundle-names | keep | |
| D-MEM-verify-suites-need-a-quiet-machine | keep | |
| D-MEM-findings-carrier | keep | |
| D-MEM-residuals-hide-defects | keep | |
| D-MEM-workflows-token-budget | keep | |
| D-MEM-release-order-communication-first | reword | Drop point numbers that go stale ("closing 633, tag 174") only if the file carries them; else keep. |
| D-MEM-village-moves-allowed | keep | |
| D-MEM-closing-runs | keep | |
| D-MEM-saves-are-irrelevant-in-the-poc | keep | |
| D-MEM-effort-high-for-implementation | reword | Mixed German fragment; "Effort: Medium everywhere, never High/xhigh". |
| D-MEM-overshoot-needs-a-brake | keep | |
| D-MEM-analysis-and-execution-in-one-go | reword | English only: "never park a verdict; queue it first and hand it over". |
| D-MEM-forensics-need-a-command | keep | |
| D-MEM-rider-point-fold-and-push | cut-index | Situational (rider points only). |
| D-MEM-vdzk-carrier-from-sdk-sessions | cut-index | Situational (SDK sessions answering VDZK only). |
| D-MEM-handing-over-is-not-stopping | reword | Merge with batch-stops-only-on-explicit-order pointer into one line; meaning kept. |
| D-MEM-no-standstill-decide-and-record | keep | |
| D-MEM-drills-must-call-the-thing | keep | |
| D-MEM-split-a-point-that-will-not-converge | keep | |
| D-MEM-session-cwd-stays-in-main-tree | keep | |
| D-MEM-no-invented-user-instructions | keep | |
| D-MEM-a-question-is-only-a-question | reword | English line; meaning kept. |
| D-MEM-stop-refusal-is-addressed-to-me | keep | |
| D-MEM-detach-long-running-landings | cut-index | Owner landing only; move pointer to docs/batch-owner-runbook.md ("Dispatch and landing"). |
| D-MEM-umsteuerung-vereinfachungsplan | keep | Keyword-triggered plan status. |
| D-MEM-main-push-runs-the-full-gate | reword | English line; keep "never push during a picture run". |
| D-MEM-feature-tests-before-regression | keep | |
| D-MEM-only-one-head-session | keep | |
| D-MEM-HEADER | "# Memory Index" header | keep | |

## Dropped rules (not moved, not reworded)

1. D-CLAUDE-7.2-7 "Pre-action hooks are pointers: board-first-guard requires…, closing-guard owns §9, versioned hooks own commit/push syntax" — dropped as a restatement of what the hooks enforce themselves.
2. C-H1 explanatory sentences of the timestamp hook ("reading taken NOW… ages… guard compares exactly… over-estimated") — dropped; the re-measure instruction itself stays.
3. C-H3b history notes ("user 27.07.2026, two-phase since point 675", launcher description) — dropped as history, not rule.
No other rule is dropped; every other change moves or rewords with meaning kept.

## Rough savings (against docs/context-load-1209.md)

- (b) Connectors: ~730 (Docs instructions) + ~200 (deferred names) tokens; skills: 14 cuts ≈ 7 KB of 12.9 KB listing ≈ 2,700 tokens; agents: 2 cuts ≈ 1 KB ≈ 400 tokens. Only if switchable from project settings.
- (c) Per prompt: ~1,200 chars ≈ 450 tokens per user prompt; SessionStart ≈ 12 KB less text written (context saving ~0 today because only a 2 KB preview lands, but the persisted file read is avoided).
- (d) CLAUDE.md 10.8 → ~7 KB (≈ 1,400 tokens); MEMORY.md 6.5 → ~5 KB (≈ 600 tokens).
- Total fixed-load saving ≈ 6,000 tokens of ~40,900 (≈ 15 %), plus ~450 tokens per prompt.
