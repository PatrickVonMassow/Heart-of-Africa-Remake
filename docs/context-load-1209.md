# Fixed context load of a fresh session — baseline (29.09.2026)

Baseline for the smaller-context-load work: what a fresh head session carries
before its first tool call, split by source. Every later saving is reported
against the totals here.

## Method

- **Real token total.** The first API call of a session reports
  `cache_read_input_tokens` (the prefix shared by all sessions) and
  `cache_creation_input_tokens` (everything session-specific). Read from the
  head-session transcripts under `~/.claude/projects/-workspace-hoa/*.jsonl`
  (first `assistant` record's `usage`).
- **Split by source.** The same transcript records every first-turn attachment
  (CLAUDE.md, MEMORY.md, skill listing, hook outputs, …) and the system-prompt
  snapshot. Their characters were counted; the measured session-specific token
  count was apportioned by one calibrated ratio (51,387 chars / 19,873 tokens =
  **2.59 chars/token**, wrapper markup included). A chars/4 column is given
  beside it. The per-source split is therefore an estimate; only the two totals
  are counted tokens.
- Reference session: `e91a9702` (launcher-started head session, 29.09.2026).
  Six further head sessions agree within ±150 tokens (session-specific part
  19,871–20,019; shared prefix 22,709 in six of eight, 22,633 and 25,301 in
  two sessions with a different tool set).

## Baseline table

| Source | Chars | ≈ tokens (chars/4) | ≈ tokens (calibrated) |
|---|---:|---:|---:|
| Built-in tool schemas + static system-prompt head (shared cached prefix) | n/a | — | **22,709 (counted)** |
| System prompt, session part (memory instructions, env, guidance) | 4,912 | 1,228 | 1,900 |
| Deferred-tool name listing | 950 | 238 | 367 |
| Agent-type listing | 2,880 | 720 | 1,114 |
| MCP server instructions (claude.ai Claude Docs) | 1,893 | 473 | 732 |
| Skill listing (project, user, synced claude.ai skills) | 12,944 | 3,236 | 5,006 |
| CLAUDE.md | 10,826 | 2,707 | 4,187 |
| MEMORY.md | 6,490 | 1,623 | 2,510 |
| SessionStart hook (`batch-resume-hook`, 2 KB preview of 14.7 KB) | 2,260 | 565 | 874 |
| UserPromptSubmit `berlin-timestamp.cjs` (user scope) | 678 | 170 | 262 |
| UserPromptSubmit `dashboard-reminder-hook` + context level | 943 | 236 | 365 |
| Misc (environment, model, session context, date, attribution, budget) | 2,234 | 559 | 864 |
| **Fixed load subtotal (session part, without the prompt)** | 47,010 | 11,753 | **18,180** |
| First user prompt (launcher text; not fixed load) | 4,377 | 1,094 | 1,693 |
| **First-call total (counted)** | | | **42,582** |

Fixed load of a fresh session before its first tool call:
**22,709 + ≈18,180 ≈ 40,900 tokens.**

## Per-turn and per-call repeats

| Hook | Fires on | Measured text |
|---|---|---|
| UserPromptSubmit `berlin-timestamp.cjs` + `dashboard-reminder-hook.mjs` | every user prompt | 1,621 chars ≈ 630 tokens per prompt (non-owner: stand-down text replaces the board paragraph) |
| PreToolUse guards (13 entries) | every matching tool call | 0 chars on allow (358 of 358 recorded calls in two sessions); text only on refusal |
| PostToolUse `lock-heartbeat-hook.mjs` | every tool call | 0 chars normally; one-shot notices (dispossession 831 chars, chat delivery, owner-loop) |
| PostToolUse `prep-arm-hook.mjs` | Bash | 0 chars recorded |
| Stop guards (29 project + 1 user) | every turn end | 0 on pass; refusal texts 300–2,750 chars (dashboard not registered 2,753; do-not-stop 2,563; timestamp 771–873) |

## What could not be measured

- **Tool schemas vs. static system head** inside the 22,709-token prefix: the
  transcript does not record the serialized tool schemas. Splitting it needs
  the token-counting API, and no `ANTHROPIC_API_KEY` is present in this
  environment.
- **Exact per-source tokens**: same cause; the calibrated column assumes one
  chars/token ratio for all sources.
- **Account-level connectors** (claude.ai Claude Docs, Google Drive, Gmail,
  Google Calendar) and synced claude.ai skills are not configured in any
  project or user file; their enablement lives in the claude.ai account. Only
  Claude Docs contributes instructions at start; Drive tools are deferred
  (names only), Gmail/Calendar are unauthenticated.

## Savings against this baseline (estimate)

Estimated the same way as the baseline: measured characters of the old and new
text, converted at 2.59 chars/token (chars/4 in brackets). No fresh-session
reading after the change exists yet; these are estimates, not counts.

| Step | Change | Saving |
|---|---|---|
| (b) tool surface | not applied — needs `.claude/settings.json` / account settings (attended-only) | 0 |
| (c) UserPromptSubmit board reminder (owner) | 944 → 518 chars per prompt | ≈165 (107) tokens per prompt |
| (c) UserPromptSubmit stand-down text | 302 → 241 chars per prompt | ≈24 (15) tokens per prompt |
| (c) UserPromptSubmit timestamp (user scope) | not applied — `~/.claude/hooks` is attended-only | 0 |
| (c) SessionStart batch-resume output | ≈14.7 KB → ≈3.3 KB (runbook pasted → pointer −9.7 KB; resume body 3,311 → 1,798; model policy 1,003 → 781) | at session start ≈0 while the harness still shows only a 2 KB preview; ≈4,400 (2,850) tokens whenever the full output is read |
| (c) Stop "do not stop the batch" refusal | ≈2,560 → ≈1,450 chars per firing | ≈430 (280) tokens per firing |
| (c) Stop "dashboard not registered" refusal | ≈2,750 → ≈330 chars per firing (open-point list capped at three) | ≈935 (605) tokens per firing |
| (d) CLAUDE.md / MEMORY.md condensation | not applied — CLAUDE.md and the user's memory need the user's own go-ahead | 0 |

Fixed-load saving of a fresh session so far: ≈0 of ≈40,900 tokens (the
applied steps are all per-prompt, per-firing or read-on-demand text). The
large fixed items (skill listing, connectors, CLAUDE.md, MEMORY.md) wait on the
attended steps.
