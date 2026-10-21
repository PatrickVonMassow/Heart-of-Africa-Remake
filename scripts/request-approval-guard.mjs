#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) guard: a chat session deposits a request through
// `finding.mjs --request` only after the user approved exactly that request.
//
// On 03.10.2026 a session deposited a request quoting the user's REPORT of a
// problem as if it were approval of the solution — the rule of memory
// `solutions-need-user-approval` broken. The user ordered: "Stelle erstmal
// sicher, dass es nicht mehr passiert, dass diese Freigaberegel verletzt wird."
// This guard is a deliberate exception to the infrastructure freeze of
// 01.09.2026, by that user order of 03.10.2026.
//
// The rule lives in request-approval-guard-core.mjs (pure, Vitest-covered):
// the deposit carries `--approved "<verbatim user words>"`, an assistant TEXT
// reply showed the request's title, and a LATER real human message contains
// the quote. A transcript with no real human message (headless/launcher
// session) passes. This wrapper reads the hook payload and its
// `transcript_path` (JSONL). A request deposit whose transcript cannot be read
// is DENIED (loud), and so is a garbled payload or any guard error during
// evaluation (fail closed, 17.10.2026); an empty stdin (manual run) is a no-op.
//
// WHAT IS JUDGED is decided TEXTUALLY and fail-closed: a command whose loose
// view (quotes, backslashes, `$` removed) mentions `finding.mjs` or `--request`
// is a possible deposit. Unless it is one plain canonical line it is denied in
// a chat session; a canonical one has every `--request` judged as a deposit
// needing its own approval, one without a readable title denied. The guard keeps
// a cooperative session from forgetting the rule; it is no shell parser and
// does not try to win against an adversary.
// ACCEPTED FALSE POSITIVE: a command that merely MENTIONS
// `finding.mjs … --request` (echo, grep, a test name) is judged as well. The
// way out is to rephrase the command.
//
// KNOWN GAP: a batch-owner session appending a point directly to TASKS.md from
// a chat discussion is not covered; there the memory rule alone applies.
//
// Deliberately NOT gated on the batch lock or `.claude/batch-paused`: the
// sessions this guard exists for are exactly the non-owner chat windows.
//
// Manual check:
//   node scripts/request-approval-guard.mjs --check '<command>' [--transcript <path.jsonl>] [--powershell]
//
// NOT REGISTERED with guard-preflight.mjs, for the reason firewall-guard.mjs
// gives: it judges a command that does not exist until the tool call is made.
import { readFileSync } from 'node:fs'
import { evaluate, isPossibleDeposit, parseTranscript, shellOf } from './request-approval-guard-core.mjs'
import { isMainModule } from './is-main.mjs'

export const GUARDED_TOOLS = new Set(['Bash', 'PowerShell'])

/** The command out of a PreToolUse payload, or '' when there is none to judge. */
export function commandFrom(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (!GUARDED_TOOLS.has(payload.tool_name)) return ''
  const command = payload.tool_input && payload.tool_input.command
  return typeof command === 'string' ? command : ''
}

/**
 * The transcript as `{ entries, malformed }` (see parseTranscript), or null when
 * the file cannot be read at all.
 */
export function readTranscript(path) {
  if (typeof path !== 'string' || !path) return null
  try {
    return parseTranscript(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** The hook's verdict for a parsed payload: the deny output object, or null to allow. */
export function hookDecision(payload) {
  const command = commandFrom(payload)
  const shell = shellOf(payload && payload.tool_name)
  if (!command || !isPossibleDeposit(command, shell)) return null
  const transcript = readTranscript(payload.transcript_path)
  const verdict = evaluate({ command, shell, entries: transcript && transcript.entries, malformed: transcript ? transcript.malformed : 0 })
  if (!verdict.block) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: verdict.reason,
    },
  }
}

/** A deny output object naming why the guard could not judge the call. */
function denyFor(why) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `request-approval-guard could not judge this call (${why}), so it is denied (fail closed). Repeat the call; if it keeps failing, report the guard error.`,
    },
  }
}

/**
 * The hook's stdout for raw stdin text: '' to allow, else the deny JSON. Empty
 * stdin (a manual run) allows, whitespace does not; a garbled payload or an evaluation error denies.
 * REQUEST_APPROVAL_GUARD_TEST_THROW forces the error path for the spawned test
 * — it can only deny, never allow.
 */
export function hookOutput(stdinText, decide = hookDecision) {
  if (stdinText === '') return ''
  let payload
  try {
    payload = JSON.parse(stdinText)
  } catch (e) {
    return JSON.stringify(denyFor(`garbled hook payload: ${e && e.message}`))
  }
  try {
    if (process.env.REQUEST_APPROVAL_GUARD_TEST_THROW) throw new Error('forced test error')
    const decision = decide(payload)
    return decision ? JSON.stringify(decision) : ''
  } catch (e) {
    return JSON.stringify(denyFor(`evaluation error: ${e && e.message}`))
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const checkAt = process.argv.indexOf('--check')
    if (checkAt >= 0) {
      const command = process.argv[checkAt + 1] ?? ''
      const tAt = process.argv.indexOf('--transcript')
      const shell = shellOf(process.argv.includes('--powershell') ? 'PowerShell' : 'Bash')
      if (!isPossibleDeposit(command, shell)) {
        console.log('request-approval-guard: OK (not a request deposit)')
      } else if (tAt < 0) {
        console.log('request-approval-guard: a possible request deposit — pass --transcript <path.jsonl> to judge its approval')
      } else {
        const transcript = readTranscript(process.argv[tAt + 1])
        const verdict = evaluate({ command, shell, entries: transcript && transcript.entries, malformed: transcript ? transcript.malformed : 0 })
        console.log(verdict.block ? `WOULD DENY (${verdict.id}):\n\n${verdict.reason}` : 'request-approval-guard: OK')
      }
      process.exit(0)
    }

    process.stdout.write(hookOutput(process.stdin.isTTY ? '' : readFileSync(0, 'utf8')))
    process.exit(0)
  } catch (e) {
    // A --check run only reports; a hook run that cannot read stdin denies.
    console.error(`request-approval-guard error: ${e && e.message}`)
    if (!process.argv.includes('--check')) process.stdout.write(JSON.stringify(denyFor(`stdin unreadable: ${e && e.message}`)))
    process.exit(0)
  }
}
