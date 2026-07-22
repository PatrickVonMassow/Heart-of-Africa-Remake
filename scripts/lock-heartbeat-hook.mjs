// PostToolUse hook: refresh the batch lock's claimedAt on every tool call, so a
// LIVE session's lock never goes stale mid-turn. The batch-progress-guard only
// refreshes it at turn-end; a long working turn (the norm under the anti-idle
// guard) would otherwise let the lock age past the OS autostart launcher's
// 12-min "alive" window, and the launcher would false-spawn a redundant session
// that — now that the launcher authorizes resumption — would actually take over
// and collide. A fresh lock keeps "stale lock == dead session" true. Never errors.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCK = fileURLToPath(new URL('../.claude/batch-lock.json', import.meta.url))
try {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
  lock.claimedAt = Date.now()
  writeFileSync(LOCK, JSON.stringify(lock, null, 2))
} catch {
  /* no lock yet, or unreadable — nothing to refresh */
}
process.exit(0)
