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
// gated. A subagent is not exempt by that rule — its tool calls carry the PARENT
// session id, so it is judged like the owner (four-eyes review, 27.07.2026) —
// but a WORKTREE-ISOLATED one is (point 440): its checkout path says what the
// session id cannot, and the deny it used to eat was one it could never act on.
// A subagent running in the main tree still gets the deny, and its text still
// tells it to repeat the call, which the once-per-turn stand-down lets through.
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
import { heldByOtherLiveOwner, withdrawHandover, touchHandover, renewLease, readFence } from './batch-singleton.mjs'
import { fenceDecision } from './batch-lease-core.mjs'
import { handoverSurvivesCall, describeWithdrawalTrigger, hookCallTimestamp } from './batch-boundary-core.mjs'
import { publishCapability } from './board-currency-core.mjs'
import { evaluate, isWorktreeCheckout } from './board-first-core.mjs'

const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

/**
 * The transport this session may publish through (point 400, delta B/D). The
 * pages transport is a SCRIPT, not a tool binding, so it is available to every
 * session — headless successors included, which is the mode the whole point was
 * written for. The deny may therefore escalate everywhere: there is no longer a
 * session that could be blocked without a remedy it can run.
 */
const TRANSPORT = 'pages'

/** State + focus + the registered board's current hash, content and paths. */
function gather() {
  const state = readJson(STATE_PATH)
  const boardFile = state && state.dashboardPath ? resolve(REPO_ROOT, state.dashboardPath) : null
  const present = boardFile && existsSync(boardFile)
  const repoHash = present ? sha256File(boardFile) : null
  const boardPaths = [state && state.dashboardPath, state && state.scratchpadPath].filter(Boolean)
  // The board's CONTENT (point 470): the no-work claim is read from it. An
  // unreadable board yields null, which the core treats as "no claim" — the
  // fail-open direction, so a missing board never costs a call.
  let boardHtml = null
  try {
    if (present) boardHtml = readFileSync(boardFile, 'utf8')
  } catch {
    /* unreadable → no claim */
  }
  return { state, focus: readJson(FOCUS_PATH), repoHash, boardPaths, boardHtml }
}

// ---- CLI: --status --------------------------------------------------------
if (process.argv.includes('--status')) {
  const { state, focus, repoHash, boardPaths, boardHtml } = gather()
  const verdict = evaluate({
    toolName: 'Write',
    filePath: 'src/example.ts',
    state,
    focus,
    repoHash,
    boardPaths,
    boardHtml,
    canPublish: publishCapability({ state, transport: TRANSPORT }).canPublish,
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
  const input0 = payload.tool_input ?? {}
  // PIGGY-BACKED FIRST, and it must be first: RENEW THE BATCH LEASE before the
  // tool runs (point 434, docs/batch-resilience.md §3 layer 1). The lease is what
  // makes ownership end by arithmetic, and it is renewed HERE — in PreToolUse —
  // rather than in the PostToolUse heartbeat, because that one fires when a call
  // RETURNS: a lease renewed there would have to outlive the longest single call,
  // and this repository legitimately runs 30-40 minute suites. Renewing before the
  // long call is exactly what keeps a running verification from being taken over
  // mid-run (docs/batch-resilience.md §5: "no window that kills a running
  // verification — that is what PreToolUse renewal is for").
  //
  // It rides in this hook for the same reason the handover withdrawal below does:
  // .claude/settings.json is a protected path an unattended session cannot extend,
  // and this matcher already covers every state-changing tool. Owner-guarded,
  // rate-limited and never throwing — `renewLease` reports rather than raises.
  try {
    renewLease(payload.session_id || '')
  } catch {
    /* a lease we cannot write costs the owner its window at worst; never a call */
  }
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
    const call = input0
    const keep = handoverSurvivesCall({
      toolName: payload.tool_name,
      filePath: call.file_path ?? call.notebook_path,
      command: call.command,
    })
    if (keep.survives) touchHandover(payload.session_id || '')
    else {
      // The triggering call goes into the record (point 426 (b)): a marker that
      // vanishes without a reason is rediscovered turn after turn.
      withdrawHandover(payload.session_id || '', {
        trigger: describeWithdrawalTrigger({
          toolName: payload.tool_name,
          filePath: call.file_path ?? call.notebook_path,
          command: call.command,
        }),
        // Point 396: a handover is not un-taken by a call that predates it.
        callAt: hookCallTimestamp(payload),
      })
    }
  } catch {
    /* best effort — a lock we cannot write is not this gate's problem */
  }
  if (existsSync(PAUSE)) process.exit(0)

  // ---- THE FENCE CHOKEPOINT (point 434, docs/batch-resilience.md §3 layer 1) --
  // It sits BEFORE the ownership stand-down below, and it has to: a session whose
  // fence is stale is by definition NOT the owner, so the ordinary
  // `heldByOtherLiveOwner` exit is exactly the door it would walk out of. The
  // narrowing that keeps this safe is different and stricter — it fires only for a
  // session that DEMONSTRABLY held a fence which has since been superseded. A
  // window that never drove the batch has no grant on record and can never be
  // blocked here, whatever it does.
  //
  // WHY ONE CHOKEPOINT AND NOT A CHECK PER PATH: the lock's own writers are
  // already sessionId-guarded and need nothing. The four paths that have no guard
  // at all — the work-order tick and archive move, `git merge`/`push`, the board
  // publish and `dashboard-state.json` — cannot each check for themselves, and
  // without this the fence would protect only the file that was already protected
  // while the woken owner still pushed to main.
  //
  // It cannot trap a session: it refuses four families of call and nothing else,
  // so reading, committing locally and finishing its own file work all continue —
  // and every OTHER guard stands down for a non-owner anyway, so the Stop chain
  // cannot demand of it the very publish this refuses.
  try {
    const fence = fenceDecision({
      fenceState: readFence(),
      sessionId: payload.session_id || '',
      toolName: payload.tool_name,
      command: input0.command,
      filePath: input0.file_path ?? input0.notebook_path,
    })
    if (fence.block) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: fence.reason,
          },
        }),
      )
      process.exit(0)
    }
  } catch {
    /* fail-OPEN: a fence we cannot read must never cost anybody a tool call */
  }

  if (heldByOtherLiveOwner(payload.session_id || '')) process.exit(0)

  // A DELEGATED AGENT HAS NO BOARD DUTY (point 440). It runs from its own
  // worktree under .claude/worktrees/, which is the one thing the inherited
  // session id cannot tell the gate — see isWorktreeCheckout. It is placed AFTER
  // the fence and the piggy-backed lease/handover work above, which must keep
  // running for every call, and before the board decision, which is the only
  // part an agent could not act on. Measured: 1058 characters of deny plus a
  // discarded tool call per agent, for a publish it is forbidden to make.
  if (isWorktreeCheckout(REPO_ROOT)) process.exit(0)

  const input = input0
  const { state, focus, repoHash, boardPaths, boardHtml } = gather()
  const decision = evaluate({
    toolName: payload.tool_name,
    command: input.command,
    filePath: input.file_path ?? input.notebook_path,
    state,
    focus,
    repoHash,
    boardPaths,
    boardHtml,
    canPublish: publishCapability({ state, sessionId: payload.session_id || '', transport: TRANSPORT }).canPublish,
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
    //
    // …EXCEPT for the point-470 claim deny (`recordFired === false`). That one
    // does not consume the stand-down and does not need it: its remedy is a
    // single board command, which this gate never blocks, and standing down
    // would leave "nothing is running" on the user's board for the rest of a
    // turn that demonstrably kept working. It therefore also needs no writable
    // state to be emitted safely.
    let released = decision.recordFired === false
    if (!released) {
      try {
        mergeState({ boardFirstFiredAt: Math.max(Date.now(), Number(state && state.turnStartedAt) || 0) })
        released = true
      } catch {
        /* unwritable state — fall through to allow */
      }
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
