#!/usr/bin/env node
// PreToolUse(Bash) guard: no hand-rolled wait for a process (point 1048).
//
// On 02./03.09.2026 the owning session spawned a background watcher of the form
// `while pgrep -f "npm exec vitest" >/dev/null; do sleep 30; done` at every
// wake-up. Each watcher's own command line contains the pattern, so the probe
// matched the watcher itself and the loop could never end; ten stood at 01:00
// and the batch advanced nothing for 107 minutes while every monitor was green.
// `scripts/verify/run-wait.mjs --await` was already THE blocking wait — nothing
// refused the alternative. This guard refuses it.
//
// The decision logic lives in wait-command-core.mjs (pure, Vitest-covered).
// This wrapper only reads the hook payload and is fail-OPEN: no stdin, garbled
// JSON, a wrong tool, any throw at all → allow. A guard bug must never stop a
// session from working, and the only thing at stake in a miss is one bad wait.
//
// Manual check (and the four-eyes review's way in):
//   node scripts/wait-command-guard.mjs --check 'while pgrep -f "x"; do sleep 1; done'
//
// NOT REGISTERED with guard-preflight.mjs, for the same reason firewall-guard is
// absent: it judges a command that does not exist until the tool call is made,
// so an ahead-of-time gather step could only ever answer "not applicable".
// `--check` is the ahead-of-time question here.
import { readFileSync } from 'node:fs'
import { isMainModule } from './is-main.mjs'
import { judgeWaitCommand } from './wait-command-core.mjs'

/** The tools whose payload carries a shell command. PowerShell is included
 *  because the Windows host runs the same repository and the same rule. */
export const GUARDED_TOOLS = new Set(['Bash', 'PowerShell'])

/**
 * The command out of a PreToolUse payload, or '' when there is none to judge.
 * Deliberately NOT gated on the batch lock or `.claude/batch-paused`: a wait
 * that can never return wedges whichever session typed it, owner or not.
 */
export function commandFrom(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (!GUARDED_TOOLS.has(payload.tool_name)) return ''
  const command = payload.tool_input && payload.tool_input.command
  return typeof command === 'string' ? command : ''
}

if (isMainModule(import.meta.url)) {
  try {
    const checkAt = process.argv.indexOf('--check')
    if (checkAt >= 0) {
      const verdict = judgeWaitCommand(process.argv[checkAt + 1] ?? '')
      console.log(verdict.allowed ? 'wait-command-guard: OK' : `WOULD DENY (${verdict.kind}):\n\n${verdict.message}`)
      process.exit(0)
    }

    let payload = null
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      process.exit(0) // no/garbled stdin (manual run) — nothing to judge
    }

    const command = commandFrom(payload)
    if (!command) process.exit(0)

    const verdict = judgeWaitCommand(command)
    if (!verdict.allowed) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: verdict.message,
          },
        }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`wait-command-guard error (allowing the call): ${e && e.message}`)
    process.exit(0)
  }
}
