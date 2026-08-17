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
  assessOwner,
  bootTimeMs,
  convertPendingSpawn,
  readOwnerLock,
  noteTopLevelSession,
  findClaudeAncestor,
  probePid,
  transitionOwnerSession,
} from './batch-singleton.mjs'
import { gatherOwnerWork } from './batch-owner-work.mjs'
import { readClaim, clearClaim, maxAgeMs } from './batch-claim.mjs'
import { assessClaim, ownerIsHolding, reservationDecision } from './batch-claim-core.mjs'
import { allGatedMessage, openPointsHeadline, standDownMessage } from './batch-resume-hook-core.mjs'
import { gatedPoints } from './user-gate-core.mjs'
import { MANDATE_MAX_AGE_MS, resumeRepairMandate } from './batch-doctor-core.mjs'
import { consumeMandateMarker } from './batch-doctor-states.mjs'
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
        windowsHide: true,
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

/** True for the three ownership values that mean "this session works the batch". */
function ownsBatch(ownership) {
  return ownership === 'acquired-spawn' || ownership === 'acquired' || ownership === 'mine'
}

/** The doctor's verdict on the tree this session woke up in (point 442).
 *
 *  PREFER THE LAUNCHER'S OWN READING. When a successor was just spawned, the
 *  launcher has already asked the doctor seconds ago and left the answer in
 *  `repo-mandate.json`; reusing it makes the common case free. The marker is
 *  one-shot and expires, so a stale one can never mandate anything.
 *
 *  Only without one does the hook ask itself, and then WITHOUT `--repair` and
 *  without `--gate`. Note what that does and does not mean (four-eyes review,
 *  finding 3): the doctor's AUTO level still runs, i.e. `git fetch origin main` and
 *  a strictly-behind fast-forward. That is deliberate and harmless — it is the same
 *  fast-forward a resuming session would do first anyway — but it is not "nothing",
 *  and the fetch is why the timeout allows for a slow network.
 *
 *  Never throws: an unrunnable doctor reports itself and `resumeRepairMandate` stays
 *  silent about it — the launcher's alert already carries that news, and a session
 *  cannot mend a broken doctor. */
const MANDATE_PATH = fileURLToPath(new URL('../.claude/repo-mandate.json', import.meta.url))

function readRepoVerdict(nowMs = Date.now()) {
  // One-shot, expiring, junk-proof — and now UNDER TEST (point 443 (h)): the read
  // and the deletion live in scripts/batch-doctor-states.mjs, the rule that judges
  // the bytes in batch-doctor-core.mjs, and both are swept by the Vitest layer.
  // They were hand-written here and covered by nothing.
  const m = consumeMandateMarker({ path: MANDATE_PATH, now: nowMs, maxAgeMs: MANDATE_MAX_AGE_MS })
  if (m.verdict === 'mandate' || m.verdict === 'clean') return { ran: m.ran, code: m.code }
  try {
    execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'batch-doctor.mjs')], {
      windowsHide: true,
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { ran: true, code: 0 }
  } catch (e) {
    if (e && typeof e.status === 'number') return { ran: true, code: e.status }
    return { ran: false, code: null }
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
let assertedSessionId = ''
let sessionSource = ''
try {
  const parsed = JSON.parse(readFileSync(0, 'utf8'))
  if (typeof parsed.session_id === 'string') assertedSessionId = parsed.session_id
  if (assertedSessionId) sessionId = assertedSessionId
  if (typeof parsed.source === 'string') sessionSource = parsed.source
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
  'dashboard work to parallel WORKTREE-ISOLATED subagents on NON-OVERLAPPING files — under ' +
  'the model policy stated below, so the hard cases go to Fable 5 from the start and the rest ' +
  'to Opus 5 (each point on its own branch, gates green, pushed, not merged by the agent); the main ' +
  'session keeps only the picture-verification on both backends, the serial merge -> ' +
  'fast-gate -> tick -> deploy -> cleanup, and the board publish. Every defect the user ' +
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
  'POINT BOUNDARY (user 27.07.2026, two-phase since point 675): the context is the batch\'s ' +
  'dominant cost, so a session carries ONE stretch of work, not point after point. Once the ' +
  'point you were landing is LANDED (merged and ticked), hand over: `node scripts/batch-boundary.mjs ' +
  '--prepare <point>`, its bookkeeping, then `--commit <point>` as the LAST repository action, and ' +
  'END THE SESSION instead of starting the next point here. A delegated author still building does ' +
  'NOT hold the boundary — with pushed checkpoints its declaration is transferred at the commit; ' +
  'a PREDECESSOR may equally have left one for YOU: if `node scripts/batch-in-flight.mjs --status` ' +
  'shows a transferred declaration, ADOPT it first (`node scripts/batch-in-flight.mjs --adopt`) and ' +
  'act on that work before taking a new point. The context watermark ends a session the same way ' +
  'even without a landed point (`--prepare --context` / `--commit --context`). The launcher brings ' +
  'up a fresh session and this hook re-orients it; batch-progress-guard permits the stop only ' +
  'against the verified condition and an armed launcher, and blocks every other end as before. ' +
  'First check git status AND the checked-out branch above for work already underway, and ' +
  'do not double-start regressions. This session now holds the batch lock ' +
  '(.claude/batch-lock.json); the PostToolUse heartbeat keeps it fresh while you work.'

try {
  const tasks = readFileSync(new URL('../TASKS.md', import.meta.url), 'utf8')
  // Unticked point lines, MINUS the ones the user explicitly deferred: a point
  // line carrying a `DEFERRED` marker is excluded from the batch and must never
  // auto-resume (2026-07-15 fix — the exclusion travels in TASKS.md itself).
  const openLines = tasks.split('\n').filter((l) => /^- \[ \] \d+\./.test(l))
  // …and MINUS the ones waiting on the user (point 450): a point that cannot
  // proceed without an answer is not the next point to start, so the session is
  // never pointed at it — but it is NAMED in the headline below, so a shorter
  // queue is not mistaken for progress.
  const undeferred = openLines.filter((l) => !/\bDEFERRED\b/.test(l))
  const gatedNums = [...gatedPoints(tasks)]
  const open = undeferred.filter((l) => !gatedNums.includes(Number(l.match(/\d+/)[0])))
  if (open.length === 0) {
    // Nothing actionable — the batch is finished, or every remaining point is
    // user-deferred. Start silently either way — EXCEPT when points wait on the
    // user (point 450, four-eyes review): that is the one state in which the
    // empty queue is the whole story, and silence would read as "finished".
    if (gatedNums.length) console.log(allGatedMessage(gatedNums))
  } else {
    const nums = open.map((l) => l.match(/\d+/)[0])
    // Model policy (point 309, user 25.07.2026): the 24.07 session silently
    // degraded to Haiku and wrecked three points — name the ALLOWLIST at every
    // session start; the model-guard Stop hook enforces it at the first
    // forbidden commit.
    const header =
      openPointsHeadline(nums, { gated: gatedNums }) +
      'MODEL POLICY (25.07.-13.08.2026, CLAUDE.md par.6): AUTHORING HAS THREE LANES. ' +
      'GPT-5.6 Sol authors the MECHANICAL and MID-DIFFICULTY points via ' +
      'scripts/author-sol.mjs; FABLE 5 authors the HARD cases — difficult, complex or ' +
      'error-prone — from the start, and takes over Opus work once Sol still finds problems ' +
      'after a re-work; OPUS 5 keeps what only the main session can finish, a point whose ' +
      'VERIFICATION is the work. scripts/author-routing-core.mjs makes the cut, and ' +
      'scripts/sol-share.mjs --status says what the switch routes right now. REVIEW is ' +
      'CROSS-VENDOR: Sol reads Anthropic-authored work (scripts/review-sol.mjs), Claude ' +
      'reads Sol-authored work, and no model reviews its own. ' +
      'THE SERVING MODEL of this session — the one running the batch — is Opus 5, then ' +
      'Fable 5, then Opus 4.8. Sonnet, Haiku and every other model are NOT acceptable: if ' +
      'the serving model is not one of those three, do NOT work — create ' +
      '.claude/batch-paused (reason: forbidden serving model) and send an ntfy alert via ' +
      'scripts/notify.mjs instead.'
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
      // A compaction is the one trusted transition event: ordinary guards can
      // prove process ownership, but may NEVER use an asserted payload id to
      // rename the lock. The transition itself rechecks the observed generation
      // and process under the takeover mutex. A refusal is loud and leaves the
      // prior owner intact; acquire below then merely acts with process permission.
      if (sessionSource === 'compact') {
        const observed = readOwnerLock()
        const transition = transitionOwnerSession(assertedSessionId, { lock: observed })
        if (!transition.transitioned && transition.reason !== 'already-current') {
          console.error(
            `[batch-resume] OWNER SESSION TRANSITION REFUSED (${transition.reason}); ` +
              `the lock still names ${observed?.sessionId || 'no owner'}.`,
          )
        }
      }
      // A RESERVATION (point 395): the user claimed the batch back into the window
      // they are sitting at. A freshly started session — most of all one the OS
      // launcher spawned — must NOT take the lock the owner is about to release
      // for that window, or the claim would hand the batch straight back to a
      // headless successor. Only a live, unexpired claim by a session that is not
      // THIS one reserves; the walk that establishes our own identity is paid for
      // only when a claim file actually exists.
      const claim = readClaim()
      // Resolved ONCE and reused: the stand-down below needs the same identity
      // to tell "I am the responder the watcher woke" from "some responder is
      // running", and the ancestor walk is the expensive half of this branch.
      const ancestor = claim ? findClaudeAncestor() : null
      // The lock is read BEFORE the claim is judged: whether a LIVE SESSION owner
      // still holds it decides whether the claim ages at all (point 434 (6a)) —
      // with somebody to wait for it does not, with nobody it is bounded by the
      // take-up window so an untaken claim can never leave the batch ownerless.
      // `ownerIsHolding` is the shared predicate: this hook runs in the session
      // the LAUNCHER just spawned, so the lock it finds is routinely the
      // launcher's own `pending-spawn` placeholder — reading that as an owner
      // would honour the claim for ever, stand this session down without
      // converting the spawn, and loop with the next tick (four-eyes review,
      // finding 1).
      const lock = readOwnerLock()
      const reservation = claim
        ? assessClaim({
            claim,
            sid: sessionId,
            ancestor,
            ownerSid: lock?.sessionId ?? '',
            ownerHolding: ownerIsHolding({
              lock,
              claimantSid: claim.sessionId,
              // WITH the owner's corroboration (point 556, four-eyes finding 2):
              // an expired lease that advancing work outvotes must read alive at
              // THIS door too, or a window opening during that state takes the
              // batch off a session that is mid-verification.
              alive: lock
                ? assessOwner(lock, {
                    now,
                    bootTime: bootTimeMs(),
                    probe: lock.pid ? probePid(lock.pid) : null,
                    work: gatherOwnerWork(lock, { now }),
                  }).alive === true
                : false,
            }),
            now,
            maxAgeMs: maxAgeMs(),
            probePid,
          })
        : { honour: false, mine: false, claimantSid: null }

      // Ownership: pending-spawn conversion first (launcher-spawned session),
      // then the ordinary atomic acquire. NO path overrides a live lock.
      const auth = autostartAuthorization(now)
      let ownership = 'none'
      // The same predicate the owner's Stop guard applies before ITS acquire, so
      // the rule lives in one place and cannot drift between the two doors.
      if (reservationDecision({ assessment: reservation }).acquire) {
        if (lock && lock.kind === 'pending-spawn') {
          if (convertPendingSpawn(sessionId, { authorized: !!auth })) ownership = 'acquired-spawn'
        }
        if (ownership === 'none') {
          const r = acquire(sessionId, { work: gatherOwnerWork(readOwnerLock(), { now: Date.now() }) })
          if (r === 'acquired' || r === 'mine') ownership = r
        }
      }
      if (auth) clearAuthorized()
      // The claim has done its job the moment its own window owns the batch.
      if (reservation.mine && (ownership === 'acquired' || ownership === 'mine')) clearClaim()

      // Point 442, the other side of the seam: the launcher repairs before it
      // spawns, and the session it spawned checks the same thing on arrival. Two
      // independent looks at one naht, because the one that fails is never the one
      // you expected — and only a session that OWNS the batch is told to repair,
      // so a stood-down window never starts mending a tree it may not touch.
      const mandate = ownsBatch(ownership) ? resumeRepairMandate(readRepoVerdict()) : null
      const repoLine = mandate ? ` ${mandate}` : ''
      if (ownership === 'acquired-spawn') {
        console.log(
          `${header} ${gitStanding()}${repoLine} Resumed by the OS autostart launcher (the previous owner was ` +
            `provably dead). ${RESUME_BODY} ` +
            'Do NOT idle-stop (the batch-progress-guard enforces this).',
        )
      } else if (ownership === 'acquired' || ownership === 'mine') {
        console.log(
          `${header} ${gitStanding()}${repoLine} Standing user instruction: continue the batch autonomously, ` +
            `point by point, then the Closing steps — without waiting for the user to say ` +
            `"continue". ${RESUME_BODY}`,
        )
      } else {
        // THE STAND-DOWN NAMES ITS SITUATION FIRST (four-eyes review 29.07.2026).
        // Four situations reach this branch and they need different words — most
        // of all the MESSAGE RESPONDER, which the single old text forbade the one
        // thing it was woken to do (append the user's instruction as a point), so
        // an instruction from the phone was read, obeyed into silence and lost.
        // The decision and every word of it are pure in batch-resume-hook-core.mjs.
        const stand = standDownMessage({
          sessionId,
          lock: readOwnerLock(),
          claim,
          // The same reading that decided the acquire two branches up: a released
          // claim still reserving the freed lock (point 461) is why this session
          // did not take it, so the stand-down must name that window rather than
          // fall back to "the acquire lost and no lock is readable".
          claimHonoured: reservationDecision({ assessment: reservation }).acquire === false,
          ancestorPid: ancestor?.pid ?? null,
          takeUpMs: maxAgeMs(),
          now,
        })
        console.log(`${header} ${stand.text}`)
      }
    }
  }
} catch {
  // No TASKS.md — nothing to resume; stay silent.
}
