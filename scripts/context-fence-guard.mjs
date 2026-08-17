#!/usr/bin/env node
// THE CONTEXT FENCE (point 700) — thin fail-OPEN I/O wrapper around the pure
// core (context-fence-core.mjs).
//
// REGISTRATION (.claude/settings.json is a protected path — the main session
// wires it): one entry under `PreToolUse`, beside board-first-guard's. The
// matcher carries `Task` because AGENT_TOOLS classifies it as a spawn — the
// two must agree, or the fence never sees the very call it denies (Sol review
// of d0aebb6, finding 4):
//
//   { "matcher": "Edit|Write|NotebookEdit|Agent|Task|Bash|PowerShell",
//     "hooks": [{ "type": "command", "command": "node scripts/context-fence-guard.mjs" }] }
//
// Modes:
//   1. PreToolUse HOOK: reads the tool call on stdin, MEASURES the session's
//      context from its own transcript (the payload's transcript_path, else
//      located by session id) and DENIES a call that would START a new unit of
//      work while the measurement is past the watermark. Everything that
//      finishes the step in flight, and every read, passes untouched — the
//      fence ends a session, it never idles one. Any internal error → ALLOW.
//   2. `--status`: the current measurement and what a starting call would get.
//
// WHO IT BINDS: only the batch lock's OWNER. A session that does not own
// `.claude/batch-lock.json` has no batch to hand over and no `--prepare
// --context` it could run, so fencing it would trap it — it passes. A paused
// batch passes. A WORKTREE-ISOLATED delegated agent passes too (point 440's
// rule): its tool calls carry the PARENT session id, so the measurement would
// be the parent's expensive transcript while the agent's own context is small
// — the deny would hit exactly the worker the handover machinery keeps alive.
//
// THE DENY REPEATS, deliberately (unlike board-first's once-per-turn nudge):
// repeating the suite start is exactly what the measured session of 17.08.2026
// did for another hour. It cannot trap: the allowed set contains the whole
// exit (finish, board, boundary, end).
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { isWorktreeCheckout } from './board-first-core.mjs'
import { gatherWatermark } from './context-watermark.mjs'
import { contextFenceDecision } from './context-fence-core.mjs'

const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

// The verify-prefix rule judges SYMLINK spellings on their resolved target
// (Sol round 4: `verify-link -> scripts/verify` passed the lexical rule while
// running the fenced work). The guard injects the real resolver so the pure
// core never touches the disk; a path that does not exist answers null and is
// judged on its lexical shape — never an automatic accept.
const resolveRealPath = (p) => {
  try {
    return realpathSync(resolve(REPO_ROOT, p))
  } catch {
    return null
  }
}

// ---- CLI: --status --------------------------------------------------------
if (process.argv.includes('--status')) {
  const argv = process.argv.slice(2)
  const tIdx = argv.indexOf('--transcript')
  const sid = readOwnerLock()?.sessionId ?? ''
  const wm = gatherWatermark({ transcriptPath: tIdx >= 0 ? argv[tIdx + 1] ?? '' : '', sid })
  const starting = contextFenceDecision({ ...wm, toolName: 'Agent', resolvePath: resolveRealPath })
  console.log(JSON.stringify({ ownerSessionId: sid || null, ...wm }, null, 2))
  console.log(
    `verdict for a STARTING call (agent spawn, browser suite, work-order/doc/memory authoring): ${
      starting.block ? 'DENY' : 'allow'
    }`,
  )
  if (starting.block) console.log(starting.reason)
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
  if (isWorktreeCheckout(REPO_ROOT)) process.exit(0)
  const sid = payload.session_id || ''
  const lock = readOwnerLock()
  if (!sid || !lock || lock.sessionId !== sid) process.exit(0) // not the batch owner → no fence
  const wm = gatherWatermark({ transcriptPath: payload.transcript_path || '', sid })
  const input = payload.tool_input ?? {}
  const verdict = contextFenceDecision({
    ...wm,
    toolName: payload.tool_name,
    command: input.command,
    filePath: input.file_path ?? input.notebook_path,
    resolvePath: resolveRealPath,
  })
  if (verdict.block) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: verdict.reason,
        },
      }),
    )
  }
  process.exit(0)
} catch {
  process.exit(0) // fail-open: never trap the session on a guard bug
}
