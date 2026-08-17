// Stop hook (point 309): catch a silently DEGRADED serving model at its FIRST
// commit. On 24.07.2026 the session degraded to Haiku 4.5 unnoticed and merged
// three defective deliveries in 14 minutes; no config review could have caught
// it live, but every commit records its author model in the Co-Authored-By
// trailer. Any commit after the committed baseline authored by a model outside
// the user's allowlist (Opus 5 / Opus 4.8 / Fable 5 / GPT-5.6 Sol — Sonnet and
// Haiku are NOT acceptable) blocks the turn end with a pause instruction and
// pings ntfy.
//
// Decision logic: model-guard-core.mjs (pure, Vitest-covered). This wrapper
// gathers `git log` output and is fail-OPEN — an internal error never traps
// the session. While .claude/batch-paused exists the guard stands down, so a
// degraded session that has PAUSED (the demanded reaction) is not block-looped.
// Manual drive: node scripts/model-guard.mjs --status
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import {
  backupRefsIn,
  findForbiddenCommits,
  findUnidentifiedCommits,
  formatForbiddenReason,
  formatUnidentifiedReason,
} from './model-guard-core.mjs'
import { notify } from './notify.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

const BASELINE = repoPath('.claude/model-guard-baseline.json')
const PAUSE = repoPath('.claude/batch-paused')

/** Baseline timestamp; self-arms to NOW on first run so historic degraded
 *  commits (the acknowledged 24.07 incident) never re-trigger. `arm: false` reads
 *  the same value without WRITING it: the read-only preflight may report, but it
 *  must not decide the moment the guard's baseline is pinned. (It would pin it
 *  EARLIER, which hides fewer commits, not more — so the harm is the surprise
 *  write, not a missed detection.) */
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
      { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' },
    )
  } catch {
    return ''
  }
}

/** The pre-rewrite refs `git filter-branch` leaves behind. They are read here
 *  because `recentLog()` reads `--all`, which includes them: a trailer already
 *  rewritten keeps being reported from its backup until the ref is deleted. */
function backupRefListing() {
  try {
    return execSync('git for-each-ref --format="%(refname)" refs/original', {
      windowsHide: true,
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
  } catch {
    return ''
  }
}

/**
 * The guard's I/O half — the git log window, the baseline and the backup refs —
 * exported so the preflight (point 365 D) judges from the SAME gathering rather
 * than a second copy of it. The ntfy ping and the block text stay in the main
 * path below: a read-only preflight must not notify.
 */
export function gatherModelGuardInputs({ arm = true } = {}) {
  // The inputs are gathered either way so `--status` can still report on a paused
  // batch; `applicable` is what tells a caller whether the guard has duty here.
  const inputs = {
    log: recentLog(),
    baselineMs: baselineMs({ arm }),
    backupRefs: backupRefsIn(backupRefListing()),
  }
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused', inputs }
  return { applicable: true, inputs }
}

if (isMainModule(import.meta.url)) {
  try {
    // The main path uses the SAME gather step the preflight does — recomputing
    // the log and the baseline here would let the two drift apart with nothing
    // to notice it (the identity test can only see a shared function).
    const gathered = gatherModelGuardInputs()
    const { log, baselineMs: baseline, backupRefs } = gathered.inputs
    const hits = findForbiddenCommits(log, baseline)
    const unidentified = findUnidentifiedCommits(log, baseline)
    if (process.argv[2] === '--status') {
      console.log(
        JSON.stringify({ baseline: new Date(baseline).toISOString(), hits, unidentified, backupRefs }, null, 2),
      )
      process.exit(0)
    }
    if (hits.length && gathered.applicable) {
      // The NAMED breach: the alarm the guard was built for. Ping and pause.
      const list = hits.map((h) => `${h.sha.slice(0, 7)} (${h.trailer})`).join(', ')
      await notify('FORBIDDEN MODEL', `Non-allowlisted model commit(s): ${list} — pausing the batch`, 'high')
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason: formatForbiddenReason(hits, { backupRefs, alsoUnidentified: unidentified }),
        }),
      )
    } else if (unidentified.length && gathered.applicable) {
      // The UNNAMED case: blocking, but resolvable in-session from the
      // transcripts — no ntfy, no pause file, no user interruption owed.
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: formatUnidentifiedReason(unidentified, { backupRefs }) }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`model-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
