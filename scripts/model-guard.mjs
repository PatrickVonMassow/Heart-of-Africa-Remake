// Stop hook (point 309): catch a silently DEGRADED serving model at its FIRST
// commit. On 24.07.2026 the session degraded to Haiku 4.5 unnoticed and merged
// three defective deliveries in 14 minutes; no config review could have caught
// it live, but every commit records its author model in the Co-Authored-By
// trailer. Any commit after the committed baseline authored by a model outside
// the user's allowlist (Opus 5 / Opus 4.8 / Fable 5 — Sonnet and Haiku are NOT
// acceptable) blocks the turn end with a pause instruction and pings ntfy.
//
// Decision logic: model-guard-core.mjs (pure, Vitest-covered). This wrapper
// gathers `git log` output and is fail-OPEN — an internal error never traps
// the session. While .claude/batch-paused exists the guard stands down, so a
// degraded session that has PAUSED (the demanded reaction) is not block-looped.
// Manual drive: node scripts/model-guard.mjs --status
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findForbiddenCommits } from './model-guard-core.mjs'
import { notify } from './notify.mjs'
import { isMainModule } from './is-main.mjs'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO_ROOT = R('..')
const BASELINE = R('../.claude/model-guard-baseline.json')
const PAUSE = R('../.claude/batch-paused')

/** Baseline timestamp; self-arms to NOW on first run so historic degraded
 *  commits (the acknowledged 24.07 incident) never re-trigger. `arm: false` reads
 *  without writing — the read-only preflight must not arm a baseline the guard
 *  itself has not armed yet, which would hide the very commits it looks for. */
function baselineMs({ arm = true } = {}) {
  try {
    const t = Date.parse(JSON.parse(readFileSync(BASELINE, 'utf8')).since)
    if (!Number.isNaN(t)) return t
  } catch {
    /* fall through to self-arm */
  }
  if (arm) {
    try {
      writeFileSync(BASELINE, JSON.stringify({ since: new Date().toISOString() }, null, 2) + '\n')
    } catch {
      /* fail open */
    }
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

/**
 * The guard's I/O half — the git log window and the baseline — exported so the
 * preflight (point 365 D) judges from the SAME gathering rather than a second
 * copy of it. The ntfy ping and the block text stay in the main path below: a
 * read-only preflight must not notify.
 */
export function gatherModelGuardInputs({ arm = true } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  return { applicable: true, inputs: { log: recentLog(), baselineMs: baselineMs({ arm }) } }
}

if (isMainModule(import.meta.url)) {
  try {
    const hits = findForbiddenCommits(recentLog(), baselineMs())
    if (process.argv[2] === '--status') {
      console.log(JSON.stringify({ baseline: new Date(baselineMs()).toISOString(), hits }, null, 2))
      process.exit(0)
    }
    if (hits.length && !existsSync(PAUSE)) {
      const list = hits.map((h) => `${h.sha.slice(0, 7)} (${h.trailer})`).join(', ')
      await notify('FORBIDDEN MODEL', `Non-allowlisted model commit(s): ${list} — pausing the batch`, 'high')
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason:
            `SERVING-MODEL TRIPWIRE: commit(s) ${list} carry a co-author trailer outside the model ` +
            'allowlist (only Opus 5, Opus 4.8 and Fable 5 may run the batch — Sonnet and Haiku are ' +
            'NOT acceptable; user policy 25.07.2026). Do NOT continue batch work: create ' +
            '.claude/batch-paused (reason: forbidden serving model) and stop. Only after the user ' +
            'has confirmed an allowed model may .claude/model-guard-baseline.json be advanced past ' +
            'these commits.',
        }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`model-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
