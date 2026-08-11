#!/usr/bin/env node
// Closing-completeness guard — thin fail-OPEN I/O wrapper + CLI around the pure
// core (closing-guard-core.mjs). Two modes:
//
//  1. PreToolUse HOOK (wired in .claude/settings.json for the shell tools AND
//     the editing tools): reads the tool call on stdin and DENIES it while the
//     closing for the current HEAD is INCOMPLETE, if the call is either
//       - a command creating or pushing a version tag (vX.Y) or the `poc` tag, or
//       - a work-order edit TICKING a point whose spec delivers a closing (the
//         point-224 shape) — the machine-readable "the closing is done" claim.
//     Any internal error → ALLOW (fail-open: a guard bug must never trap a
//     release, and it must never trap the work order either).
//
//  2. CLI, to drive the checklist as you complete a closing:
//       node scripts/closing-guard.mjs --status
//       node scripts/closing-guard.mjs --step <id> --evidence "<proof>"
//       node scripts/closing-guard.mjs --reset            # start a fresh closing
//
// The checklist state lives in .claude/closing-state.json, keyed to the exact
// commit — a closing is per-commit, so a new tagged commit needs a fresh pass.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AFTER_CLEANUP_STEP_ID, CLOSING_STEPS, STEP_IDS, evaluate, isVersionTagCommand, missingSteps, mayTickPoint } from './closing-guard-core.mjs'
import { readTasksAll } from './tasks-source.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_PATH = resolve(REPO_ROOT, '.claude', 'closing-state.json')

/** The tools whose calls can be a release act: the shells tag, the editors tick. */
const GUARDED_TOOLS = new Set(['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** The whole work order (open + archive). Unreadable → '' , which gates nothing. */
function readTasks() {
  try {
    return readTasksAll()
  } catch {
    return ''
  }
}

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/**
 * The commit times the ORDER check needs (point 631): the `regression-after-
 * cleanup` evidence may name the commit its run covered instead of a date, and
 * only git knows when that commit was made. Resolved HERE because the core
 * reads nothing. Only a well-formed sha is ever handed to git, and every failure
 * (unknown commit, no repository) simply leaves the entry out.
 */
function commitTimesFor(state) {
  const out = {}
  try {
    const evidence = state && state.steps && state.steps[AFTER_CLEANUP_STEP_ID] && state.steps[AFTER_CLEANUP_STEP_ID].evidence
    if (typeof evidence !== 'string') return out
    for (const m of evidence.matchAll(/\b[0-9a-f]{7,40}\b/gi)) {
      const sha = m[0].toLowerCase()
      if (sha in out) continue
      try {
        const at = execSync(`git show -s --format=%cI ${sha}`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        if (at) out[sha] = at
      } catch {
        /* not a commit in this repository — the core falls back to the record time */
      }
    }
  } catch {
    /* a resolver failure must never block the guard */
  }
  return out
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n')
  } catch {
    /* ignore — CLI convenience only */
  }
}

// ---- CLI mode -------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? (argv[i + 1] ?? '') : undefined
}

if (argv.includes('--status')) {
  const head = headSha()
  const state = readState()
  const missing = missingSteps(state, head, { commitTimes: commitTimesFor(state) })
  const done = CLOSING_STEPS.length - missing.length
  console.log(`Closing checklist for HEAD ${head.slice(0, 12)}: ${done}/${CLOSING_STEPS.length} done`)
  const notes = new Map(missing.map((s) => [s.id, s.note || '']))
  for (const s of CLOSING_STEPS) {
    console.log(`  [${notes.has(s.id) ? ' ' : 'x'}] ${s.id} — ${s.title}`)
    if (notes.get(s.id)) console.log(`      RECORDED BUT OUT OF ORDER — ${notes.get(s.id)}`)
  }
  if (missing.length === 0) console.log('ALL closing steps recorded — a version tag is permitted.')
  process.exit(0)
}

if (argv.includes('--reset')) {
  writeState({ commit: headSha(), steps: {}, resetAt: null })
  console.log(`Closing state reset for HEAD ${headSha().slice(0, 12)} — all steps cleared.`)
  process.exit(0)
}

if (argv.includes('--step')) {
  const id = flag('--step')
  const evidence = flag('--evidence')
  if (!STEP_IDS.has(id)) {
    console.error(`Unknown closing step "${id}". Valid: ${[...STEP_IDS].join(', ')}`)
    process.exit(1)
  }
  if (!evidence || !evidence.trim()) {
    console.error(`--evidence "<what you did / the proof>" is required (a step counts only with evidence).`)
    process.exit(1)
  }
  const head = headSha()
  let state = readState()
  if (!state || typeof state !== 'object' || state.commit !== head) state = { commit: head, steps: {} }
  if (!state.steps || typeof state.steps !== 'object') state.steps = {}
  // The record time is what the ORDER check reads (point 631): it dates every
  // cleanup step, so the second regression can be judged against the youngest.
  state.steps[id] = { evidence: evidence.trim(), at: new Date().toISOString() }
  writeState(state)
  const missing = missingSteps(state, head, { commitTimes: commitTimesFor(state) })
  console.log(`Recorded "${id}" for HEAD ${head.slice(0, 12)}. ${CLOSING_STEPS.length - missing.length}/${CLOSING_STEPS.length} done.`)
  for (const s of missing) if (s.note) console.log(`"${s.id}" does NOT count — ${s.note}`)
  if (missing.length) console.log(`Still missing: ${missing.map((s) => s.id).join(', ')}`)
  else console.log('ALL closing steps recorded — a version tag is now permitted.')
  process.exit(0)
}

// ---- PreToolUse hook mode -------------------------------------------------
// Read the tool call, decide allow/deny. Fail-OPEN on ANYTHING.
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
  if (!payload || !GUARDED_TOOLS.has(payload.tool_name)) process.exit(0)
  const toolInput = payload.tool_input
  const command = toolInput && toolInput.command
  // The work order is read ONLY when the payload could carry a tick — every
  // other call (the overwhelming majority) costs no file read at all.
  const mayTick = mayTickPoint(payload.tool_name, toolInput)
  const tasksText = mayTick ? readTasks() : ''
  const state = readState()
  // Resolving a commit costs a git spawn, so it happens only for a call that
  // can be a release act at all — the same two the core judges, asked exactly
  // rather than by a cheaper guess that could drop the anchor and weaken the
  // order check into the record-time fallback.
  const couldBlock = mayTick || isVersionTagCommand(command)
  const decision = evaluate({ command, state, headSha: headSha(), toolName: payload.tool_name, toolInput, tasksText, commitTimes: couldBlock ? commitTimesFor(state) : null })
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
} catch {
  process.exit(0) // fail-open: never trap the session on a guard bug
}
