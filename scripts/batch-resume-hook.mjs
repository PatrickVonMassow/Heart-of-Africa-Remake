// SessionStart hook: auto-resume the TASKS.md batch (user mandate 2026-07-14 —
// the batch must complete autonomously; no session may sit idle waiting for a
// "continue"). Prints the resume instruction only while TASKS.md still has
// unticked points AND this session actually WINS the batch ownership:
//   - a user PAUSE marker (.claude/batch-paused) suppresses auto-resume entirely
//     until an explicit go;
//   - ownership goes through the ATOMIC acquire in scripts/batch-singleton.mjs
//     (hard singleton, 24.07.2026): a lock held by a LIVE owner — liveness by
//     heartbeat AND a real OS pid check, so a mid-long-tool-call session reads
//     alive — can never be taken over, and two racing starters resolve to
//     exactly one winner. The loser gets an explicit STAND-DOWN instruction.
//   - a session spawned by the OS launcher converts the launcher's
//     'pending-spawn' lock to itself (pid-bound + one-shot authorization) —
//     it never overrides a live lock (the old unconditional claim was the
//     e9407cae incident's second hole).
// It also records this TOP-LEVEL session id for the parallel-session detector
// (subagents never fire SessionStart, so they can never be flagged).
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  acquire,
  convertPendingSpawn,
  readOwnerLock,
  noteTopLevelSession,
  findClaudeAncestor,
  probePid,
} from './batch-singleton.mjs'
import { readClaim, clearClaim, maxAgeMs } from './batch-claim.mjs'
import { assessClaim } from './batch-claim-core.mjs'
import { isPaused, pauseReason } from './batch-lock.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Where git stands: current branch + whether a merge is half-done. A resumed
 *  session must know this — a crash can leave a stale feature branch or a
 *  conflicted index checked out (feature-branch workflow). Empty on any git
 *  failure (never blocks the hook). */
function gitStanding() {
  try {
    const g = (args) =>
      execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    const branch = g(['rev-parse', '--abbrev-ref', 'HEAD'])
    let merging = false
    try {
      const p = g(['rev-parse', '--git-path', 'MERGE_HEAD'])
      merging = existsSync(isAbsolute(p) ? p : join(REPO_ROOT, p))
    } catch {
      /* unknown merge state — report just the branch */
    }
    return (
      `Git: on branch "${branch}"` +
      (merging
        ? ' — a MERGE IS IN PROGRESS (conflicted/half-done index): resolve and finish it, or abort it, FIRST.'
        : '.')
    )
  } catch {
    return ''
  }
}

// One-shot marker the OS launcher writes when it spawns a session to take over
// a DEAD batch. It merely helps BIND the spawned session to the launcher's
// pending-spawn lock — it never overrides a live lock (the atomic acquire
// remains the only way to ownership).
const AUTH_PATH = fileURLToPath(new URL('../.claude/autostart-authorized.json', import.meta.url))
function autostartAuthorization(nowMs) {
  try {
    const m = JSON.parse(readFileSync(AUTH_PATH, 'utf8'))
    if (m && typeof m.at === 'number' && nowMs - m.at < 10 * 60 * 1000) return m
  } catch {
    /* none */
  }
  return null
}
function clearAuthorized() {
  try {
    rmSync(AUTH_PATH)
  } catch {
    /* already gone */
  }
}

// SessionStart hooks receive a JSON payload on stdin ({ session_id, source, … }).
// A missing id falls back to a fresh random id, which errs toward NOT resuming
// (an unknown session can never own the lock → it stands down).
let sessionId = randomUUID()
try {
  const parsed = JSON.parse(readFileSync(0, 'utf8'))
  if (typeof parsed.session_id === 'string' && parsed.session_id) sessionId = parsed.session_id
} catch {
  // no/!JSON stdin — keep the random fallback
}

// Record this top-level session for the parallel-session detector.
noteTopLevelSession(sessionId)

const RESUME_BODY =
  'Continue the batch autonomously per CLAUDE.md/TASKS.md — feature-branch workflow ' +
  '(§6): each point on its OWN feat/<point>-<slug> branch off main; implement -> docs -> ' +
  'tests -> atomic commit + push the BRANCH after every commit; merge to main ONLY when the ' +
  'point is complete + verified (tests green; render/GUI changes picture-checked on BOTH ' +
  'backends); TASKS.md is MAIN-only — tick the point on main at the merge; cross-cutting ' +
  'changes (guards, docs, dashboard, process files) go directly to main. MAXIMAL ' +
  'DELEGATION (user decision 22.07.2026): delegate implementation AND infra/guard/doc/' +
  'dashboard work to parallel WORKTREE-ISOLATED subagents on NON-OVERLAPPING files — with ' +
  'OPUS 5, per the model policy stated below; Fable only reviews or stands in ' +
  '(each point on its own branch, gates green, pushed, not merged by the agent); the main ' +
  'session keeps only the picture-verification on both backends, the serial merge -> ' +
  'fast-gate -> tick -> deploy -> cleanup, and the Artifact publish. Every defect the user ' +
  'reports on the deployed build during the batch is APPENDED as its own implementation-ready ' +
  'TASKS point (append-and-defer) on main and delegated in turn — never fixed ad hoc or ' +
  'dropped; the agent pool is capped at AT MOST 3 concurrent agents (user 26.07.2026 — ' +
  'parallel strands multiply the RATE of consumption and the throughput together, not ' +
  'the cost per finished point; the real surcharge is rework where two strands touch the ' +
  'same code); throttle DOWN further if the report volume ' +
  'threatens context (user grant 22.07.2026), never up, and delegate tightly-coupled ' +
  'same-file points TOGETHER on ONE branch sequentially so shared files never collide. ' +
  'CLOSING FREEZE (user decision 22.07.2026): during a closing run the code is FROZEN — ' +
  'no parallel agent work lands/merges while the closing runs; merge or park in-flight ' +
  'branches first, resume the pool only after. ' +
  'POINT BOUNDARY (user 27.07.2026): the context is the batch\'s dominant cost, so a session ' +
  'carries ONE stretch of work, not point after point. Once the merged-and-ticked point is done ' +
  'AND no delegated agent is still in flight (let the pool drain — ending mid-flight throws its ' +
  'work away), run `node scripts/batch-boundary.mjs <point>` and END THE SESSION instead of ' +
  'starting the next point here. The OS task HoA-Batch-Autostart brings up a fresh session and ' +
  'this hook re-orients it; batch-progress-guard permits that stop only against a verifiably ' +
  'closed point and an armed launcher, and blocks every other end as before. ' +
  'First check git status AND the checked-out branch above for work already underway, and ' +
  'do not double-start regressions. This session now holds the batch lock ' +
  '(.claude/batch-lock.json); the PostToolUse heartbeat keeps it fresh while you work.'

try {
  const tasks = readFileSync(new URL('../TASKS.md', import.meta.url), 'utf8')
  // Unticked point lines, MINUS the ones the user explicitly deferred: a point
  // line carrying a `DEFERRED` marker is excluded from the batch and must never
  // auto-resume (2026-07-15 fix — the exclusion travels in TASKS.md itself).
  const openLines = tasks.split('\n').filter((l) => /^- \[ \] \d+\./.test(l))
  const open = openLines.filter((l) => !/\bDEFERRED\b/.test(l))
  if (open.length === 0) {
    // Nothing actionable — the batch is finished, or every remaining point is
    // user-deferred. Start silently either way.
  } else {
    const nums = open.map((l) => l.match(/\d+/)[0]).join(', ')
    // Model policy (point 309, user 25.07.2026): the 24.07 session silently
    // degraded to Haiku and wrecked three points — name the ALLOWLIST at every
    // session start; the model-guard Stop hook enforces it at the first
    // forbidden commit.
    const header =
      `[batch-resume] TASKS.md has ${open.length} open point(s): ${nums}. ` +
      'MODEL POLICY (25.07.2026): Opus 5 is the WORKER at any difficulty; the fallback chain ' +
      'is Opus 5 -> Fable 5 -> Opus 4.8. Fable is used ONLY for four-eyes review (one model ' +
      'plans/builds, the other checks) or as that fallback — never because a task looks hard. ' +
      'Sonnet, Haiku and every other model are NOT acceptable: if the serving model is not one ' +
      'of the three, do NOT work — create .claude/batch-paused (reason: forbidden serving ' +
      'model) and send an ntfy alert via scripts/notify.mjs instead.'
    const now = Date.now()
    if (isPaused()) {
      const why = pauseReason()
      console.log(
        `${header} The batch is PAUSED by the user (.claude/batch-paused${why ? `: ${why}` : ''}). ` +
          'Do NOT auto-resume — wait for an explicit go from the user. When the user ' +
          'says to continue, clear the pause marker (scripts/batch-lock.mjs clearPaused, ' +
          'or delete .claude/batch-paused) before resuming.',
      )
    } else {
      // A RESERVATION (point 395): the user claimed the batch back into the window
      // they are sitting at. A freshly started session — most of all one the OS
      // launcher spawned — must NOT take the lock the owner is about to release
      // for that window, or the claim would hand the batch straight back to a
      // headless successor. Only a live, unexpired claim by a session that is not
      // THIS one reserves; the walk that establishes our own identity is paid for
      // only when a claim file actually exists.
      const claim = readClaim()
      const reservation = claim
        ? assessClaim({
            claim,
            sid: sessionId,
            ancestor: findClaudeAncestor(),
            now,
            maxAgeMs: maxAgeMs(),
            probePid,
          })
        : { honour: false, mine: false, claimantSid: null }

      // Ownership: pending-spawn conversion first (launcher-spawned session),
      // then the ordinary atomic acquire. NO path overrides a live lock.
      const auth = autostartAuthorization(now)
      let ownership = 'none'
      const lock = readOwnerLock()
      if (!reservation.honour) {
        if (lock && lock.kind === 'pending-spawn') {
          if (convertPendingSpawn(sessionId, { authorized: !!auth })) ownership = 'acquired-spawn'
        }
        if (ownership === 'none') {
          const r = acquire(sessionId)
          if (r === 'acquired' || r === 'mine') ownership = r
        }
      }
      if (auth) clearAuthorized()
      // The claim has done its job the moment its own window owns the batch.
      if (reservation.mine && (ownership === 'acquired' || ownership === 'mine')) clearClaim()

      if (ownership === 'acquired-spawn') {
        console.log(
          `${header} ${gitStanding()} Resumed by the OS autostart launcher (the previous owner was ` +
            `provably dead). ${RESUME_BODY} ` +
            'Read the handoff memory resume-184-qa-framework first. Do NOT idle-stop ' +
            '(the batch-progress-guard enforces this).',
        )
      } else if (ownership === 'acquired' || ownership === 'mine') {
        console.log(
          `${header} ${gitStanding()} Standing user instruction: continue the batch autonomously, ` +
            `point by point, then the Closing steps — without waiting for the user to say ` +
            `"continue". ${RESUME_BODY}`,
        )
      } else {
        const cur = readOwnerLock()
        const ageMin = cur ? Math.round((now - cur.claimedAt) / 60000) : 0
        // THE WAY BACK (point 395). The stand-down is right, but for years it was
        // also a dead end: the user returns to this window, says "I am back", and
        // there was nothing to do but kill the other session's lock by hand. The
        // command below is printed WITH this session's id already in it, because a
        // CLI gets no hook payload and this is the one place the id is known.
        console.log(
          `${header} But another session OWNS the batch lock (session ${cur ? cur.sessionId : 'unknown'}, ` +
            `pid ${cur && cur.pid ? cur.pid : 'unknown'}, heartbeat ${ageMin} min ago, .claude/batch-lock.json) ` +
            'and its liveness check passed. STAND DOWN: this session is NOT the batch worker. Do NOT ' +
            'run batch actions, do NOT merge to main, do NOT edit TASKS.md or the dashboard. Answer the ' +
            'user normally. THE WAY BACK: if the user says they are back and want the batch worked HERE, run ' +
            `\`node scripts/batch-claim.mjs --session ${sessionId}\` — that claims the batch, the owning session ` +
            'releases it at its next CLEAN turn end (never mid-merge, never with a delegated agent or a ' +
            'verification still running), and re-running the SAME command takes it. Nothing else is needed from ' +
            'the user. To inspect first: `node scripts/batch-claim.mjs --status`.' +
            (reservation.honour
              ? ` NOTE: session ${reservation.claimantSid} has already claimed the batch — do not claim over it.`
              : ''),
        )
      }
    }
  }
} catch {
  // No TASKS.md — nothing to resume; stay silent.
}
