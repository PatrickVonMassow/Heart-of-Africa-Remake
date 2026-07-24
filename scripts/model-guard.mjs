// Stop hook (point 309): catch a silently DEGRADED serving model at its FIRST
// commit. On 24.07.2026 the session degraded to Haiku 4.5 unnoticed and merged
// three defective deliveries in 14 minutes; no config review could have caught
// it live, but every commit records its author model in the Co-Authored-By
// trailer. Any commit after the committed baseline carrying a Haiku-class
// trailer blocks the turn end with a pause instruction and pings ntfy.
//
// Decision logic: model-guard-core.mjs (pure, Vitest-covered). This wrapper
// gathers `git log` output and is fail-OPEN — an internal error never traps
// the session. While .claude/batch-paused exists the guard stands down, so a
// degraded session that has PAUSED (the demanded reaction) is not block-looped.
// Manual drive: node scripts/model-guard.mjs --status
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findDegradedCommits } from './model-guard-core.mjs'
import { notify } from './notify.mjs'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO_ROOT = R('..')
const BASELINE = R('../.claude/model-guard-baseline.json')
const PAUSE = R('../.claude/batch-paused')

/** Baseline timestamp; self-arms to NOW on first run so historic degraded
 *  commits (the acknowledged 24.07 incident) never re-trigger. */
function baselineMs() {
  try {
    const t = Date.parse(JSON.parse(readFileSync(BASELINE, 'utf8')).since)
    if (!Number.isNaN(t)) return t
  } catch {
    /* fall through to self-arm */
  }
  try {
    writeFileSync(BASELINE, JSON.stringify({ since: new Date().toISOString() }, null, 2) + '\n')
  } catch {
    /* fail open */
  }
  return Date.now()
}

function recentLog() {
  try {
    return execSync(
      'git log --all --since="48 hours ago" --format="%H|%cI|%(trailers:key=Co-Authored-By,valueonly,separator=,)"',
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
  } catch {
    return ''
  }
}

try {
  const hits = findDegradedCommits(recentLog(), baselineMs())
  if (process.argv[2] === '--status') {
    console.log(JSON.stringify({ baseline: new Date(baselineMs()).toISOString(), hits }, null, 2))
    process.exit(0)
  }
  if (hits.length && !existsSync(PAUSE)) {
    const list = hits.map((h) => `${h.sha.slice(0, 7)} (${h.trailer})`).join(', ')
    await notify('DEGRADED MODEL', `Haiku-class commit(s) detected: ${list} — pausing the batch`, 'high')
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          `SERVING-MODEL TRIPWIRE: commit(s) ${list} carry a Haiku-class co-author trailer — ` +
          'the session is degraded. Do NOT continue batch work: create .claude/batch-paused ' +
          '(reason: degraded serving model) and stop. Only after the user has confirmed a ' +
          'full-strength model may .claude/model-guard-baseline.json be advanced past these commits.',
      }),
    )
  }
  process.exit(0)
} catch (e) {
  console.error(`model-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
