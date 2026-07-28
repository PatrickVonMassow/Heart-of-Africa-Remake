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
// not own the live batch lock has no board duty, and a paused batch is never
// gated. NOTE: a subagent is NOT exempt by that rule — its tool calls carry the
// PARENT session id, so it is judged like the owner (four-eyes review,
// 27.07.2026). The deny text therefore tells a subagent to simply repeat the
// call: the gate fires at most once per turn, so the repeat goes through.
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
import { heldByOtherLiveOwner, withdrawHandover, touchHandover } from './batch-singleton.mjs'
import { handoverSurvivesCall } from './batch-boundary-core.mjs'
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
  // PIGGY-BACKED, and deliberately: WITHDRAW a batch handover before the tool
  // runs (point 388). If this session marked the lock handed-over at a boundary
  // and is nevertheless about to act — a later Stop hook blocked the turn end,
  // or a delegated agent woke it — then it is still working and the successor
  // must not be spawned beside it. The PostToolUse heartbeat withdraws the
  // handover too, but only AFTER the call returns, and the first call after such
  // a block can be a 40-minute verification (four-eyes review, finding 1). This
  // hook lives here rather than in one of its own because .claude/settings.json
  // is a protected path an unattended session cannot extend, and this matcher
  // already covers every state-changing tool. Never blocks, never throws.
  //
  // …but NOT for work the Stop chain itself demanded (live finding 2,
  // 28.07.2026). Publishing the board, recording a mechanism review or touching
  // the work order's own entry is part of ENDING, not of carrying on, and
  // withdrawing on those rounds un-took every handover the guard had just
  // written. The closing set is deliberately narrow and everything outside it
  // withdraws — a wrongly withdrawn boundary costs one command, a wrongly kept
  // one lets a successor spawn beside a working session.
  try {
    const call = payload.tool_input ?? {}
    const keep = handoverSurvivesCall({
      toolName: payload.tool_name,
      filePath: call.file_path ?? call.notebook_path,
      command: call.command,
    })
    if (keep.survives) touchHandover(payload.session_id || '')
    else withdrawHandover(payload.session_id || '')
  } catch {
    /* best effort — a lock we cannot write is not this gate's problem */
  }
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
    //
    // The deny is emitted ONLY if that record was written. If the state file is
    // readable but unwritable, the release could never be recorded and every
    // mutating call would be denied for the rest of the turn — and the remedy
    // itself needs that same file (the publish hash is written there), so the
    // session could not even satisfy the gate. Failing OPEN on an unwritable
    // state is the only honest direction (four-eyes review, 27.07.2026).
    //
    // The stamp is clamped to the turn's start: a backward wall-clock step (an
    // NTP correction) would otherwise leave `fired < turnStartedAt`, which reads
    // as "not yet fired" for the rest of the turn while a fresh focus stamp is
    // equally in the past — armed with no way to disarm.
    let released = false
    try {
      mergeState({ boardFirstFiredAt: Math.max(Date.now(), Number(state && state.turnStartedAt) || 0) })
      released = true
    } catch {
      /* unwritable state — fall through to allow */
    }
    if (!released) process.exit(0) // unwritable state → allow, never trap the turn
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
