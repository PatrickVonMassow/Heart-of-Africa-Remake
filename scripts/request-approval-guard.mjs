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
// is DENIED (loud); any other guard error ALLOWS with a stderr note.
//
// KNOWN GAP: a batch-owner session appending a point directly to TASKS.md from
// a chat discussion is not covered; there the memory rule alone applies.
//
// Deliberately NOT gated on the batch lock or `.claude/batch-paused`: the
// sessions this guard exists for are exactly the non-owner chat windows.
//
// Manual check:
//   node scripts/request-approval-guard.mjs --check '<command>' [--transcript <path.jsonl>]
//
// NOT REGISTERED with guard-preflight.mjs, for the reason firewall-guard.mjs
// gives: it judges a command that does not exist until the tool call is made.
import { readFileSync } from 'node:fs'
import { evaluate, requestOf } from './request-approval-guard-core.mjs'
import { isMainModule } from './is-main.mjs'

export const GUARDED_TOOLS = new Set(['Bash', 'PowerShell'])

/** The command out of a PreToolUse payload, or '' when there is none to judge. */
export function commandFrom(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (!GUARDED_TOOLS.has(payload.tool_name)) return ''
  const command = payload.tool_input && payload.tool_input.command
  return typeof command === 'string' ? command : ''
}

/** Parsed transcript entries, or null when the file cannot be read. Bad lines are skipped. */
export function readTranscript(path) {
  if (typeof path !== 'string' || !path) return null
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const entries = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // a torn last line while the harness writes — skip it
    }
  }
  return entries
}

if (isMainModule(import.meta.url)) {
  try {
    const checkAt = process.argv.indexOf('--check')
    if (checkAt >= 0) {
      const command = process.argv[checkAt + 1] ?? ''
      const tAt = process.argv.indexOf('--transcript')
      if (!requestOf(command)) {
        console.log('request-approval-guard: OK (not a request deposit)')
      } else if (tAt < 0) {
        console.log('request-approval-guard: a request deposit — pass --transcript <path.jsonl> to judge its approval')
      } else {
        const verdict = evaluate({ command, entries: readTranscript(process.argv[tAt + 1]) })
        console.log(verdict.block ? `WOULD DENY (${verdict.id}):\n\n${verdict.reason}` : 'request-approval-guard: OK')
      }
      process.exit(0)
    }

    let payload = null
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      process.exit(0) // no/garbled stdin (manual run) — nothing to judge
    }

    const command = commandFrom(payload)
    if (!command || !requestOf(command)) process.exit(0)

    const verdict = evaluate({ command, entries: readTranscript(payload.transcript_path) })
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
  } catch (e) {
    console.error(`request-approval-guard error (allowing the call): ${e && e.message}`)
    process.exit(0)
  }
}
