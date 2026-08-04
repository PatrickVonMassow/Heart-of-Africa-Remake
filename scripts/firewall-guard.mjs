#!/usr/bin/env node
// PreToolUse(Bash) guard: no live firewall command is typed by hand.
//
// On 04.08.2026 the session ran `sudo /usr/local/bin/init-firewall.sh` through
// the Bash tool. The script flushes every chain and destroys the ipset at the
// top while the default policies stay DROP, so the container is sealed for its
// whole runtime — and the tool's two-minute default timeout killed it mid-flush.
// No network, no way to ask for help, ConnectionRefused. This guard makes that
// command unreachable by hand and names the two safe routes in its place:
// `scripts/firewall-allow.mjs` (additive, cannot seal) and
// `scripts/firewall-rebuild.mjs` (detached, watchdogged).
//
// The decision logic lives in firewall-guard-core.mjs (pure, Vitest-covered).
// This wrapper only reads the hook payload and is fail-OPEN: no stdin, garbled
// JSON, a wrong tool, any throw at all → allow. A guard bug must never be able
// to stop a session from working, and the only thing at stake in a miss is one
// risky command.
//
// Manual check (and the four-eyes review's way in):
//   node scripts/firewall-guard.mjs --check 'sudo iptables -F'
//
// NOT REGISTERED with guard-preflight.mjs, deliberately: every guard there is
// asked "would you block me right now?" from a gather step that reads the
// WORKING STATE. This one judges a command that does not exist until the tool
// call is made, so its gather step could only ever return "not applicable" — the
// same reason closing-guard.mjs and board-first-guard.mjs are absent from that
// list. `--check` is the ahead-of-time question here.
import { readFileSync } from 'node:fs'
import { evaluate } from './firewall-guard-core.mjs'
import { isMainModule } from './is-main.mjs'

/**
 * The tools whose payload carries a shell command. PowerShell is included for
 * the same reason closing-guard covers it — the Windows host runs the same
 * repository, even though the firewall itself is a Linux-container concern.
 */
export const GUARDED_TOOLS = new Set(['Bash', 'PowerShell'])

/**
 * The command out of a PreToolUse payload, or '' when there is none to judge.
 * Deliberately NOT gated on the batch lock or `.claude/batch-paused`, unlike the
 * Stop-chain guards: those stand down so a session that does not drive the batch
 * is not judged on the batch's state. A sealed container is not a bookkeeping
 * rule — it kills whichever session runs the command, owner or not, paused or
 * not. There is nothing here that a stand-down would make fair.
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
      const verdict = evaluate({ command: process.argv[checkAt + 1] ?? '' })
      console.log(verdict.block ? `WOULD DENY (${verdict.id}):\n\n${verdict.reason}` : 'firewall-guard: OK')
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

    const verdict = evaluate({ command })
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
    console.error(`firewall-guard error (allowing the call): ${e && e.message}`)
    process.exit(0)
  }
}
