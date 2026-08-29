#!/usr/bin/env node
// Create one short-lived, session-bound, point-bound, single-use context permit.
import { issueContextPermit } from './context-fence-permit.mjs'

const argv = process.argv.slice(2)
const value = (flag) => {
  const at = argv.indexOf(flag)
  return at >= 0 ? argv[at + 1] : undefined
}
const known = new Set(['--session', '--point', '--reason', '--max-tokens'])
const unknown = argv.filter((arg, index) => arg.startsWith('--') && (!known.has(arg) || index === argv.length - 1))

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('node scripts/context-fence-override.mjs --session <id> --point <N> --reason "<why>" --max-tokens <n>')
  process.exit(0)
}
if (unknown.length) {
  console.error(`context-fence-override: unknown or valueless argument(s): ${unknown.join(', ')}`)
  process.exit(2)
}

try {
  const permit = issueContextPermit({
    sessionId: value('--session'),
    point: value('--point'),
    reason: value('--reason'),
    maxTokens: value('--max-tokens'),
  })
  console.log(
    `context permit ${permit.id} issued once for session ${permit.sessionId}, point ${permit.point}, ` +
      `up to ${permit.maxTokens} projected tokens; expires ${new Date(permit.expiresAt).toISOString()}.`,
  )
} catch (error) {
  console.error(`context-fence-override REFUSED: ${error?.message ?? error}`)
  process.exit(1)
}
