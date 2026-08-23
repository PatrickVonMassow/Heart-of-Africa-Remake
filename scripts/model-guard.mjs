// Stop hook (point 309): catch a silently DEGRADED serving model at its FIRST
// commit. On 24.07.2026 the session degraded to Haiku 4.5 unnoticed and merged
// three defective deliveries in 14 minutes; no config review could have caught
// it live, but every commit records its author model in the Co-Authored-By
// trailer. Any commit after the committed baseline authored by a model outside
// the user's allowlist (Opus 5 / Opus 4.8 / Fable 5 / GPT-5.6 Sol — Sonnet and
// Haiku are NOT acceptable) transfers the batch to the next recorded allowed
// lane. That fresh lane verifies the trailers; the suspect never advances its
// own baseline.
//
// Decision logic: model-guard-core.mjs (pure, Vitest-covered). This wrapper
// gathers `git log` output and is fail-OPEN — an internal error never traps
// the session. While a clocked handoff probe is parked in .claude/batch-paused
// the guard stands down; the launcher removes that record when the probe is due.
// Manual drive: node scripts/model-guard.mjs --status
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
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
import { currentFableState } from './fable-switch.mjs'
import { servingRoute } from './fable-switch-core.mjs'
import { readTranscriptMessages } from './authorship-check-core.mjs'
import { modelHandoffDecision } from './model-handoff-core.mjs'
import { handoverAndRequest } from './batch-boundary.mjs'
import { writeJsonAtomic, writeTextAtomic } from './atomic-write.mjs'
import { formatPauseRecord, PAUSE_TYPES } from './batch-pause-core.mjs'

const BASELINE = repoPath('.claude/model-guard-baseline.json')
const PAUSE = repoPath('.claude/batch-paused')
const HANDOFF = repoPath('.claude/model-guard-handoff.json')

// Git parses a literal comma as the next pretty-format option delimiter, so
// `separator=,` means an EMPTY separator. Encode it to keep distinct trailer
// values distinct for `splitTrailerField` in the decision core.
export const RECENT_LOG_FORMAT = '%H|%cI|%(trailers:key=Co-Authored-By,valueonly,separator=%x2C)'

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
      `git log --all --since="48 hours ago" --format="${RECENT_LOG_FORMAT}"`,
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
    fableState: currentFableState(),
  }
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused', inputs }
  return { applicable: true, inputs }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function hookPayload() {
  if (process.stdin.isTTY) return {}
  try { return JSON.parse(readFileSync(0, 'utf8')) ?? {} } catch { return {} }
}

function transcriptModel(path) {
  if (!path) return ''
  try {
    return readTranscriptMessages(readFileSync(path, 'utf8')).messages.filter((message) => !message.sidechain).at(-1)?.model ?? ''
  } catch {
    return ''
  }
}

if (isMainModule(import.meta.url)) {
  try {
    // The main path uses the SAME gather step the preflight does — recomputing
    // the log and the baseline here would let the two drift apart with nothing
    // to notice it (the identity test can only see a shared function).
    const gathered = gatherModelGuardInputs()
    const { log, baselineMs: baseline, backupRefs, fableState } = gathered.inputs
    if (!fableState.ok && !gathered.applicable) {
      if (process.argv[2] === '--status') console.log(JSON.stringify({ applicable: false, fableProblem: fableState.problem }, null, 2))
      process.exit(0)
    }
    if (!fableState.ok && gathered.applicable) {
      if (process.argv[2] === '--status') {
        console.error(`model-guard: ${fableState.problem}`)
        process.exit(1)
      }
      process.stdout.write(JSON.stringify({ decision: 'block', reason: `SERVING-MODEL TRIPWIRE: ${fableState.problem}` }))
      process.exit(0)
    }
    const hits = findForbiddenCommits(log, baseline, fableState)
    const unidentified = findUnidentifiedCommits(log, baseline, fableState)
    if (process.argv[2] === '--status') {
      console.log(
        JSON.stringify({ baseline: new Date(baseline).toISOString(), hits, unidentified, backupRefs }, null, 2),
      )
      process.exit(0)
    }
    if (hits.length && gathered.applicable) {
      const payload = hookPayload()
      const sessionId = String(payload.session_id ?? payload.sessionId ?? '').trim()
      const currentModel = transcriptModel(payload.transcript_path ?? payload.transcriptPath)
      const handoff = modelHandoffDecision({
        hits,
        unidentified,
        state: readJson(HANDOFF),
        route: servingRoute(fableState),
        sessionId,
        currentModel,
        baselineMs: baseline,
      })
      const list = hits.map((h) => `${h.sha.slice(0, 7)} (${h.trailer})`).join(', ')
      if (handoff.action === 'verify') {
        writeJsonAtomic(BASELINE, {
          since: new Date(handoff.verifiedThrough).toISOString(),
          note: `${handoff.verifiedBy} verified the forbidden trailer handoff: ${list}`,
        })
        rmSync(HANDOFF, { force: true })
        await notify('MODEL HANDOFF VERIFIED', `${handoff.verifiedBy} verified ${list}; the model-guard baseline advanced on proof.`, 'high', { recurring: true })
      } else if (handoff.action === 'probe') {
        writeJsonAtomic(HANDOFF, handoff.state)
        writeTextAtomic(PAUSE, formatPauseRecord({
          reason: `serving-model handoff probe: ${handoff.reason}`,
          type: PAUSE_TYPES.AUTOMATIC,
          cause: 'serving-model',
          pausedAt: Date.now(),
          retryAfter: handoff.retryAfter,
        }))
        await notify('FORBIDDEN MODEL — CLOCKED PROBE', `${list}. ${handoff.reason}`, 'high', { alertClass: 'forbidden-serving-model', recurring: true })
      } else if (handoff.action === 'handoff') {
        writeJsonAtomic(HANDOFF, handoff.state)
        const transferred = handoverAndRequest({ sid: sessionId, point: null })
        if (transferred?.handed && transferred?.successor?.requested) {
          await notify('FORBIDDEN MODEL — TRUSTED HANDOFF', `${list}. ${handoff.reason}`, 'high', { alertClass: 'forbidden-serving-model', recurring: true })
        } else {
          process.stdout.write(JSON.stringify({
            decision: 'block',
            reason: `${formatForbiddenReason(hits, { backupRefs, alsoUnidentified: unidentified, fableState })}\n` +
              `The trusted handoff could not start (${transferred?.reason ?? transferred?.successorFailure ?? 'unknown failure'}).`,
          }))
        }
      } else {
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: `${formatForbiddenReason(hits, { backupRefs, alsoUnidentified: unidentified, fableState })}\n${handoff.reason}`,
        }))
      }
    } else if (unidentified.length && gathered.applicable) {
      // The UNNAMED case: blocking, but resolvable in-session from the
      // transcripts — no ntfy, no pause file, no user interruption owed.
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: formatUnidentifiedReason(unidentified, { backupRefs, fableState }) }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`model-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
