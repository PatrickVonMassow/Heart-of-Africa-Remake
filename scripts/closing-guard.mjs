#!/usr/bin/env node
// Closing-completeness guard — thin fail-OPEN I/O wrapper + CLI around the pure
// core (closing-guard-core.mjs). Two modes:
//
//  1. PreToolUse(Bash) HOOK (wired in .claude/settings.json): reads the tool
//     call on stdin; if the command creates or pushes a version tag (vX.Y) or
//     the `poc` tag and the closing for the current HEAD is INCOMPLETE, it
//     DENIES the tool call with the list of missing steps. Any internal error →
//     ALLOW (fail-open: a guard bug must never trap a release).
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
import { CLOSING_STEPS, STEP_IDS, evaluate, missingSteps } from './closing-guard-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_PATH = resolve(REPO_ROOT, '.claude', 'closing-state.json')

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
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
  const missing = missingSteps(readState(), head)
  const done = CLOSING_STEPS.length - missing.length
  console.log(`Closing checklist for HEAD ${head.slice(0, 12)}: ${done}/${CLOSING_STEPS.length} done`)
  const missingIds = new Set(missing.map((s) => s.id))
  for (const s of CLOSING_STEPS) console.log(`  [${missingIds.has(s.id) ? ' ' : 'x'}] ${s.id} — ${s.title}`)
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
  state.steps[id] = { evidence: evidence.trim() }
  writeState(state)
  const missing = missingSteps(state, head)
  console.log(`Recorded "${id}" for HEAD ${head.slice(0, 12)}. ${CLOSING_STEPS.length - missing.length}/${CLOSING_STEPS.length} done.`)
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
  if (!payload || (payload.tool_name !== 'Bash' && payload.tool_name !== 'PowerShell')) process.exit(0)
  const command = payload.tool_input && payload.tool_input.command
  const decision = evaluate({ command, state: readState(), headSha: headSha() })
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
