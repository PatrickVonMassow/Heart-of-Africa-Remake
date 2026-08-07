#!/usr/bin/env node
// POINT-PROOF gate (work-order point 437 C) — thin fail-OPEN I/O wrapper + CLI
// around the pure core (point-proof-core.mjs).
//
// A point's own acceptance condition was enforced by nothing: `closing-guard`
// gates a version tag and the single tick that claims a closing, and no guard
// ever read a point's OWN "counts as delivered when …". A point could therefore
// be ticked because it FELT finished. A point that wants better writes one
// machine-readable line:
//
//     PROOF: node scripts/measure-context-cost.mjs --since 2026-07-01
//
// and this gate refuses its `[ ]`→`[x]` tick until that run is recorded FOR THE
// CURRENT HEAD. The line is OPT-IN, so the existing corpus is untouched.
//
// Two modes:
//   1. PreToolUse HOOK (Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell):
//      reads the tool call on stdin and DENIES a tick whose proof is missing.
//   2. CLI, to drive it as the proof is produced:
//        node scripts/point-proof-guard.mjs --status
//        node scripts/point-proof-guard.mjs --ran <N> --evidence "<result>"
//
// WHERE IT STANDS DOWN, and why each one:
//   - .claude/batch-paused exists              (the batch is not running)
//   - another live session owns the batch lock (subagents must not be judged;
//     a worktree agent never ticks — TASKS.md is main-only)
//
// FAIL-OPEN EVERYWHERE: any throw allows the call, and an UNREADABLE ledger
// allows too. A ledger that is merely absent is NOT unreadable — that is
// "nothing recorded yet", which is precisely what must block.
//
// The ledger lives in .claude/point-proof-runs.json, keyed by point and pinned
// to the exact commit, like .claude/closing-state.json beside it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { mayTickPoint } from './closing-guard-core.mjs'
import { evaluate, proofCommandsFor } from './point-proof-core.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/** The run ledger. Local bookkeeping of what this tree has actually run. */
export const RUNS_PATH = repoPath('.claude/point-proof-runs.json')

/** The tools whose calls can carry a tick — the same set closing-guard guards. */
const GUARDED_TOOLS = new Set(['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/**
 * The ledger, and whether it could be READ at all.
 *
 * The distinction is the fail-open direction the point asks for: a file that is
 * not there yet means nothing has been recorded (and a tick must block), while a
 * file that exists and cannot be parsed or read means this guard does not know —
 * and a guard that does not know must not block.
 */
export function readRuns() {
  if (!existsSync(RUNS_PATH)) return { readable: true, runs: {} }
  try {
    const parsed = JSON.parse(readFileSync(RUNS_PATH, 'utf8'))
    const runs = parsed && typeof parsed === 'object' ? (parsed.runs ?? {}) : {}
    return { readable: true, runs: runs && typeof runs === 'object' ? runs : {} }
  } catch {
    return { readable: false, runs: {} }
  }
}

function writeRuns(runs) {
  mkdirSync(dirname(RUNS_PATH), { recursive: true })
  writeFileSync(RUNS_PATH, `${JSON.stringify({ runs }, null, 2)}\n`)
}

/** The whole work order (open + archive). Unreadable → '', which gates nothing. */
function readTasks() {
  try {
    return readTasksAll()
  } catch {
    return ''
  }
}

/** Every point that carries a proof line, with its commands. */
export function pointsWithProof(tasksText) {
  const out = []
  for (const m of String(tasksText ?? '').matchAll(/^- \[( |x)\] (\d+)\./gm)) {
    const n = Number(m[2])
    const commands = proofCommandsFor(n, tasksText)
    if (commands.length) out.push({ point: n, done: m[1] === 'x', commands })
  }
  return out
}

/** Would this guard stand down right now? */
function standDown(sessionId) {
  if (existsSync(PAUSE)) return 'the batch is paused'
  if (heldByOtherLiveOwner(sessionId)) return 'another live session owns the batch lock'
  return ''
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? (argv[i + 1] ?? '') : undefined
  }

  // ---- CLI: report ---------------------------------------------------------
  if (argv.includes('--status')) {
    const head = headSha()
    const { readable, runs } = readRuns()
    const tasksText = readTasks()
    const owed = pointsWithProof(tasksText)
    console.log(`point proofs at HEAD ${head.slice(0, 12)}${readable ? '' : ' (LEDGER UNREADABLE — the gate stands down)'}`)
    if (!owed.length) console.log('  no point in the work order carries a PROOF line')
    for (const p of owed) {
      const entry = runs[String(p.point)]
      const fresh = entry && entry.commit === head && String(entry.evidence ?? '').trim()
      console.log(`  [${fresh ? 'x' : ' '}] point ${p.point}${p.done ? ' (ticked)' : ''}`)
      for (const cmd of p.commands) console.log(`        PROOF: ${cmd}`)
      if (entry) console.log(`        recorded at ${String(entry.commit ?? '').slice(0, 12)}: ${entry.evidence ?? ''}`)
    }
    process.exit(0)
  }

  // ---- CLI: record ---------------------------------------------------------
  if (argv.includes('--ran')) {
    const n = Number(flag('--ran'))
    const evidence = String(flag('--evidence') ?? '').trim()
    if (!Number.isInteger(n) || n <= 0) {
      console.error('usage: node scripts/point-proof-guard.mjs --ran <point number> --evidence "<result>"')
      process.exit(1)
    }
    if (!evidence) {
      console.error('--evidence "<the measured result, one line>" is required — a run counts only with its result.')
      process.exit(1)
    }
    const commands = proofCommandsFor(n, readTasks())
    if (!commands.length) {
      console.error(
        `point ${n} carries no PROOF line, so there is nothing to record. Add the line to the point ` +
          'first, or tick it as any ordinary point.',
      )
      process.exit(1)
    }
    const { readable, runs } = readRuns()
    if (!readable) {
      console.error(`refusing to overwrite an unreadable ledger at ${RUNS_PATH} — repair or delete it first.`)
      process.exit(1)
    }
    const head = headSha()
    runs[String(n)] = { commit: head, commands, evidence, atIso: new Date().toISOString() }
    writeRuns(runs)
    console.log(`recorded the proof run for point ${n} at HEAD ${head.slice(0, 12)}:\n  ${evidence}`)
    for (const cmd of commands) console.log(`  covers: ${cmd}`)
    process.exit(0)
  }

  // ---- PreToolUse hook -----------------------------------------------------
  try {
    let payload = null
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      process.exit(0) // no/non-JSON stdin → nothing to guard
    }
    if (!payload || !GUARDED_TOOLS.has(payload.tool_name)) process.exit(0)
    if (standDown(payload.session_id || '')) process.exit(0)

    const toolInput = payload.tool_input
    // The work order is read ONLY when the payload could carry a tick — every
    // other call (the overwhelming majority) costs no file read at all.
    if (!mayTickPoint(payload.tool_name, toolInput)) process.exit(0)

    const { readable, runs } = readRuns()
    const decision = evaluate({
      toolName: payload.tool_name,
      toolInput,
      tasksText: readTasks(),
      runs,
      ledgerReadable: readable,
      headSha: headSha(),
    })
    if (decision.block) {
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
  } catch (e) {
    console.error(`point-proof-guard error (allowing the call): ${e && e.message}`)
    process.exit(0)
  }
}
