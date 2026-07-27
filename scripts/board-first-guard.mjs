#!/usr/bin/env node
// BOARD-FIRST gate — thin fail-OPEN I/O wrapper around the pure core
// (board-first-core.mjs). The project's first PreToolUse board enforcer.
//
// REGISTRATION (.claude/settings.json is a protected path — the main session
// wires it): one entry per state-changing tool matcher under `PreToolUse`:
//
//   { "matcher": "Edit|Write|NotebookEdit|Agent|Bash|PowerShell",
//     "hooks": [{ "type": "command", "command": "node scripts/board-first-guard.mjs" }] }
//
// Modes:
//   1. PreToolUse HOOK: reads the tool call on stdin and DENIES the FIRST
//      state-changing call of a turn while the board does not yet describe the
//      work that is starting (see board-first-core.mjs for the rule and the
//      escape path). Any internal error → ALLOW.
//   2. `--status`: what the gate would say right now, without a tool call.
//
// Ownership-aware like every guard since the hard singleton: a session that does
// not own the live batch lock has no board duty (this also exempts subagents,
// which carry their own session id), and a paused batch is never gated.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  REPO_ROOT,
  STATE_PATH,
  FOCUS_PATH,
  readJson,
  mergeState,
  sha256File,
} from './dashboard-state.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { evaluate } from './board-first-core.mjs'

const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

/** State + focus + the registered board's current hash and paths. */
function gather() {
  const state = readJson(STATE_PATH)
  const boardFile = state && state.dashboardPath ? resolve(REPO_ROOT, state.dashboardPath) : null
  const repoHash = boardFile && existsSync(boardFile) ? sha256File(boardFile) : null
  const boardPaths = [state && state.dashboardPath, state && state.scratchpadPath].filter(Boolean)
  return { state, focus: readJson(FOCUS_PATH), repoHash, boardPaths }
}

// ---- CLI: --status --------------------------------------------------------
if (process.argv.includes('--status')) {
  const { state, focus, repoHash, boardPaths } = gather()
  const verdict = evaluate({
    toolName: 'Write',
    filePath: 'src/example.ts',
    state,
    focus,
    repoHash,
    boardPaths,
  })
  const turn = Number(state && state.turnStartedAt)
  const armed = Number.isFinite(turn) && turn > 0
  console.log(`turn started   : ${armed ? new Date(turn).toISOString() : '<no stamp — gate inactive>'}`)
  console.log(
    `fired this turn: ${!armed ? 'n/a' : Number(state.boardFirstFiredAt ?? 0) >= turn ? 'yes (stood down)' : 'no'}`,
  )
  console.log(`verdict for a mutating call: ${verdict.block ? 'DENY' : 'allow'}`)
  if (verdict.block) console.log(verdict.reason)
  process.exit(0)
}

// ---- PreToolUse hook mode -------------------------------------------------
try {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    process.exit(0) // no stdin → nothing to guard
  }
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  if (!payload) process.exit(0)
  if (existsSync(PAUSE)) process.exit(0)
  if (heldByOtherLiveOwner(payload.session_id || '')) process.exit(0)

  const input = payload.tool_input ?? {}
  const { state, focus, repoHash, boardPaths } = gather()
  const decision = evaluate({
    toolName: payload.tool_name,
    command: input.command,
    filePath: input.file_path ?? input.notebook_path,
    state,
    focus,
    repoHash,
    boardPaths,
  })
  if (decision.block) {
    // Record that the gate fired, so it denies AT MOST ONCE per turn — a session
    // that ignores it must never be locked out of working.
    try {
      mergeState({ boardFirstFiredAt: Date.now() })
    } catch {
      /* best effort — a failed write only means the gate may fire again */
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: decision.reason,
        },
      }),
    )
  }
  process.exit(0)
} catch {
  process.exit(0) // fail-open: never trap the session on a guard bug
}
