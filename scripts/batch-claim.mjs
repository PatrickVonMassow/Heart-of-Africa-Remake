// TAKING THE BATCH BACK INTO THE WINDOW THE USER IS SITTING AT (point 395,
// user 28.07.2026) — the IO half. The decision logic is pure in
// scripts/batch-claim-core.mjs; this module only reads/writes the claim file,
// probes the claimant's process and the git state, and calls the ONE atomic
// acquire that ownership is ever gained through. CLI:
//
//   node scripts/batch-claim.mjs --session <id> [--why "<text>"]
//                                     claim the batch — or take it, if it is free
//   node scripts/batch-claim.mjs --status      who holds it, what is pending, how old
//   node scripts/batch-claim.mjs --withdraw --session <id>   never mind
//
// THE SESSION ID is the one thing this command cannot find out for itself: a CLI
// has no hook payload. `scripts/batch-resume-hook.mjs` prints the whole command
// with this window's id already in it when it stands a session down, which is the
// exact moment the returning user reads — so the id is handed over rather than
// looked up.
//
// Claiming is IDEMPOTENT and the same command is also the "next check": run it
// again and it acquires the moment the owner has released. That is deliberate —
// the user says nothing but "I am back", and the session runs one command until
// it reports that it owns the batch.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import {
  acquire,
  findClaudeAncestor,
  ourClaudeProcess,
  probePid,
  readOwnerLock,
  release,
  statePathsFor,
  assessOwner,
  bootTimeMs,
  LOCK_PATH,
  CLAIM_PATH,
} from './batch-singleton.mjs'
import {
  assessClaim,
  claimWriteDecision,
  describeClaim,
  ownerIsHolding,
  releaseDecision,
  CLAIM_MAX_AGE_MS,
  GIT_STATE_UNVERIFIABLE,
} from './batch-claim-core.mjs'

export { CLAIM_PATH }

/** The calibratable maximum age, HOA_CLAIM_MAX_MIN in minutes. Read here, not in
 *  the core, so the decision function stays pure and testable. */
export function maxAgeMs(env = process.env) {
  const raw = Number(env.HOA_CLAIM_MAX_MIN)
  return Number.isFinite(raw) && raw > 0 ? raw * 60 * 1000 : CLAIM_MAX_AGE_MS
}

export function readClaim(path = CLAIM_PATH) {
  try {
    const c = JSON.parse(readFileSync(path, 'utf8'))
    return c && typeof c === 'object' ? c : null
  } catch {
    return null
  }
}

export function writeClaim(claim, path = CLAIM_PATH) {
  writeJsonAtomic(path, claim)
}

export function clearClaim(path = CLAIM_PATH) {
  try {
    rmSync(path, { force: true })
    return true
  } catch {
    return false
  }
}

/**
 * A git operation that must NOT be cut in half: a merge, a cherry-pick, a rebase
 * or a conflicted index. Returns its name, `null` when the checkout is clean, or
 * `GIT_STATE_UNVERIFIABLE` when the probe could not find out — this is one input
 * to a guard, never a reason to fail one, so it still never throws.
 *
 * THE THIRD ANSWER IS THE POINT. It used to fail to `null`, which
 * `releaseDecision` reads as "nothing half-done" — so a probe that timed out
 * under load (8 s, on the machine that is busy enough to time out) released the
 * batch MID-MERGE, the one outcome this family exists to prevent. "I could not
 * look" is now its own verdict and waits, bounded by the claim's own expiry.
 *
 * `--git-path` rather than a hard-coded `.git/…`, so it is right inside a
 * worktree too (where `.git` is a file pointing elsewhere).
 */
export function gitOperationInProgress({ cwd = REPO_ROOT } = {}) {
  const git = (args) =>
    execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    for (const [file, label] of [
      ['MERGE_HEAD', 'merge'],
      ['CHERRY_PICK_HEAD', 'cherry-pick'],
      ['REVERT_HEAD', 'revert'],
      ['REBASE_HEAD', 'rebase'],
    ]) {
      const p = git(['rev-parse', '--git-path', file])
      if (existsSync(isAbsolute(p) ? p : join(cwd, p))) return label
    }
    // An unmerged index outlives MERGE_HEAD in some repair states, and it is
    // exactly as bad a moment to walk away from.
    if (git(['ls-files', '--unmerged']).length > 0) return 'unresolved-conflict'
    return null
  } catch {
    return GIT_STATE_UNVERIFIABLE
  }
}

/**
 * Everything a caller needs about the claim, gathered. Cheap in the common case:
 * with no claim file on disk it returns before any probe runs, so an ordinary
 * turn end pays nothing for this.
 *
 * `ownerLock` lets the OWNER pass its own lock as the process identity — that is
 * what makes a compaction-renamed owner recognise its own claim instead of
 * releasing the batch to itself, and it costs no ancestor walk.
 */
export function gatherClaim(
  sid,
  { now = Date.now(), lockPath = LOCK_PATH, env = process.env, ownerLock = undefined, ancestor = undefined } = {},
) {
  const path = statePathsFor(lockPath).claimPath
  const claim = readClaim(path)
  if (!claim) return { claim: null, honour: false, mine: false, reason: 'no-claim', ageMs: null, claimantSid: null }
  let identity = ancestor
  if (identity === undefined) {
    const lock = ownerLock === undefined ? null : ownerLock
    identity =
      lock && typeof lock.pid === 'number' && lock.sessionId === sid
        ? { pid: lock.pid, startedAt: lock.pidStartedAt ?? null }
        : ourClaudeProcess(sid, { lockPath })
  }
  const lock = ownerLock === undefined ? readOwnerLock(lockPath) : ownerLock
  // IS THERE ANYBODY TO WAIT FOR (point 434 (6a))? While a LIVE SESSION owner
  // holds the lock the claim does not age out under that owner's own long turns;
  // with nobody holding, the take-up window applies again so an untaken claim can
  // never leave the batch ownerless. The predicate is `ownerIsHolding` — lock
  // existence alone would also match the launcher's pending-spawn placeholder
  // (four-eyes review, finding 1).
  const ownerHolding = ownerIsHolding({
    lock,
    claimantSid: claim.sessionId,
    alive: lock
      ? assessOwner(lock, { now, bootTime: bootTimeMs(), probe: lock.pid ? probePid(lock.pid) : null }).alive === true
      : false,
  })
  const assessment = assessClaim({
    claim,
    sid,
    ancestor: identity,
    ownerSid: lock?.sessionId ?? '',
    ownerHolding,
    now,
    maxAgeMs: maxAgeMs(env),
    probePid,
  })
  return { claim, ...assessment }
}

/** Mark the claim RELEASED: the hand-over HAPPENED, and from that moment the
 *  record is spent (point 434 (6c) — `assessClaim` reads it as absent). The lock
 *  is free, so the claiming window takes it by re-running its own command, and
 *  nothing releases to this record a second time or keeps standing down for it.
 *  Only ever called by the releasing owner; best effort — the release itself is
 *  what matters, and an unstamped claim still ends inside its take-up window. */
export function markClaimReleased(claim, { path = CLAIM_PATH, now = Date.now(), by = '' } = {}) {
  try {
    if (!claim || typeof claim !== 'object') return false
    writeJsonAtomic(path, { ...claim, releasedAt: now, releasedBy: by || null })
    return true
  } catch {
    return false
  }
}

/**
 * HAND THE BATCH BACK to the claiming window: release the lock, and stamp the
 * claim ONLY if that release actually happened.
 *
 * The order matters and so does the gate. `release` answers false when the lock
 * does not name this session — already released, taken over, or gone — and a
 * stamp written anyway tells the claiming window "the batch was freed for you"
 * on the word of a session that freed nothing. The two lines live together here
 * rather than in the Stop guard so the pairing is testable at all.
 *
 * Returns { released, stamped }; never throws — this runs inside a guard.
 */
export function handBackToClaimant(
  sid,
  claim,
  { lockPath = LOCK_PATH, path = statePathsFor(lockPath).claimPath, now = Date.now() } = {},
) {
  let released = false
  try {
    released = release(sid, lockPath) === true
  } catch {
    released = false
  }
  return { released, stamped: released ? markClaimReleased(claim, { path, now, by: sid }) : false }
}

// --- CLI -----------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
  }
  const has = (name) => argv.includes(name)
  const sid = flag('--session') ?? ''
  const now = Date.now()
  const usage =
    'usage: node scripts/batch-claim.mjs --session <id> [--why "<text>"] | --status | --withdraw --session <id>'
  const fail = (msg) => {
    console.error(msg)
    process.exit(1)
  }
  const needSid = () => {
    if (sid) return
    fail(
      'this command needs the id of the session that is claiming: --session <id>. It cannot be looked up — ' +
        'a CLI gets no hook payload. The SessionStart message that stood this session down printed the whole ' +
        `command with the id already in it; scroll up to it, or read it from the transcript.\n${usage}`,
    )
  }

  const lock = readOwnerLock()
  const ownerAlive = lock
    ? assessOwner(lock, { now, bootTime: bootTimeMs(), probe: lock.pid ? probePid(lock.pid) : null })
    : { alive: false, reason: 'no-lock' }

  const holdingFor = (other) =>
    ownerIsHolding({ lock, claimantSid: other?.sessionId ?? '', alive: ownerAlive.alive === true })

  if (has('--status')) {
    const claim = readClaim()
    const view = assessClaim({
      claim,
      sid,
      ownerSid: lock?.sessionId ?? '',
      ownerHolding: holdingFor(claim),
      now,
      maxAgeMs: maxAgeMs(),
      probePid,
    })
    console.log(
      JSON.stringify(
        {
          owner: lock ? { sessionId: lock.sessionId, pid: lock.pid ?? null, claimedAt: lock.claimedAt } : null,
          ownerAlive,
          claim,
          assessment: view,
          gitOperation: gitOperationInProgress(),
          maxAgeMs: maxAgeMs(),
        },
        null,
        2,
      ),
    )
    if (!claim) console.log(`\nNo claim pending. ${lock && ownerAlive.alive ? `The batch is held by ${lock.sessionId}.` : 'The batch is unclaimed.'}\n${usage}`)
    else if (view.honour) {
      console.log(
        `\nA claim is PENDING: ${describeClaim(view)}. ` +
          (lock && ownerAlive.alive
            ? `The owner (${lock.sessionId}) releases at its next CLEAN turn end — not mid-merge and not while a ` +
              'delegated agent or a verification is still running. While it holds the lock this claim does NOT ' +
              'age out; it ends when the claiming window closes.'
            : 'No live owner holds the batch — re-run the claim with --session <id> and it is yours at once. ' +
              `Do not wait: with no owner to wait for the claim is honoured only for ${Math.round(maxAgeMs() / 60000)} ` +
              'min from when it was RECORDED, and then the ordinary handover takes over so the batch is never ' +
              'left ownerless.'),
      )
    } else if (view.reason === 'released') {
      console.log(
        `\nThe batch was ALREADY RELEASED for ${view.claimantSid} (this record is spent, point 434). The lock is ` +
          'free: run `node scripts/batch-claim.mjs --session <id>` to take it. Nothing reserves it any more — ' +
          'if the launcher got there first, claim again against the new owner.',
      )
    } else console.log(`\nThe recorded claim is NOT honoured (${view.reason}) — it changes nothing.`)
    process.exit(0)
  }

  if (has('--withdraw')) {
    needSid()
    const claim = readClaim()
    const view = assessClaim({ claim, sid, ancestor: findClaudeAncestor(), now, maxAgeMs: maxAgeMs(), probePid })
    if (!claim) console.log('nothing to withdraw — no claim is recorded.')
    else if (!view.mine) fail(`the pending claim belongs to ${view.claimantSid ?? 'another session'}, not to you. Nothing withdrawn.`)
    else {
      clearClaim()
      console.log('claim withdrawn — the owning session keeps the batch.')
    }
    process.exit(0)
  }

  if (argv.length === 0 || (!has('--session') && !has('--status'))) fail(usage)
  needSid()

  // 1. IS IT FREE? With no live owner the claim is satisfied AT ONCE — there is
  //    nobody to wait for. `acquire` is the only door to ownership and its
  //    test-and-set is what makes two racing windows resolve to exactly one.
  const acq = acquire(sid)
  if (acq === 'acquired' || acq === 'mine') {
    const pending = readClaim()
    const ours = assessClaim({ claim: pending, sid, ancestor: findClaudeAncestor(), now, maxAgeMs: maxAgeMs(), probePid })
    if (ours.mine || !pending) clearClaim()
    console.log(
      `THE BATCH IS YOURS. This session (${sid}) now owns .claude/batch-lock.json${
        acq === 'mine' ? ' (it already did)' : ''
      }. Work here: the PostToolUse heartbeat keeps the lock fresh, batch-progress-guard drives this session ` +
        'and every other window stands down. When you are finished for now, either take a point boundary ' +
        '(`node scripts/batch-boundary.mjs <point>`) so the launcher brings up a fresh session, or release it ' +
        'by hand (`node scripts/batch-singleton.mjs release`).',
    )
    process.exit(0)
  }

  // 2. Somebody live holds it → record the claim. The owner sees it at its next
  //    Stop hook and releases at the first clean moment.
  const ancestor = findClaudeAncestor()
  if (!ancestor || typeof ancestor.pid !== 'number' || typeof ancestor.startedAt !== 'number') {
    fail(
      'the claude process behind this session could not be identified (pid and start time), so a later probe ' +
        'could not tell this window from a stranger that inherited its pid — and a claim nobody can verify ' +
        'must not move the batch. Nothing recorded. Ask the user to release the lock by hand instead: ' +
        '`node scripts/batch-singleton.mjs release`, then re-run this command.',
    )
  }
  const existing = readClaim()
  const write = claimWriteDecision({
    existing,
    sid,
    ancestor,
    ownerHolding: holdingFor(existing),
    now,
    maxAgeMs: maxAgeMs(),
    probePid,
  })
  if (write.action === 'refuse') {
    fail(
      `session ${write.claimantSid} claimed the batch ${Math.round((write.ageMs ?? 0) / 60000)} min ago and that ` +
        'claim is still live, so this one would be a second window pulling the batch two ways. Exactly one ' +
        'session drives. Wait for it to expire, or have that window run `--withdraw`. Nothing recorded.',
    )
  }
  const claim = {
    v: 1,
    sessionId: sid,
    pid: ancestor.pid,
    pidStartedAt: ancestor.startedAt,
    at: now,
    why: flag('--why') ?? null,
  }
  writeClaim(claim)
  const check = releaseDecision({
    assessment: { honour: true, reason: 'honour' },
    inFlightLive: false,
    gitOperation: gitOperationInProgress(),
  })
  const mins = Math.round(maxAgeMs() / 60000)
  console.log(
    `CLAIM RECORDED. The batch is held by session ${lock?.sessionId ?? 'unknown'} (pid ${lock?.pid ?? 'unknown'}, ` +
      `${ownerAlive.reason}). It sees this claim at its next turn end and releases the lock at the first CLEAN ` +
      'moment — never mid-merge, never with a delegated agent still building or a verification running, so ' +
      'nothing it is doing gets cut in half.' +
      (check.verdict === 'wait'
        ? check.reason === 'git-state-unverifiable'
          ? ' (The git state of this checkout could not be read just now, so the owner waits rather than risk ' +
            'releasing mid-merge.)'
          : ` (A ${check.reason.replace(/^git-/, '')} is in progress in this checkout right now.)`
        : '') +
      ` Re-run \`node scripts/batch-claim.mjs --session ${sid}\` to take the batch once it is free — the same ` +
      'command claims and takes. WHILE THAT OWNER LIVES the claim does NOT age out (point 434): it holds for as ' +
      'long as THIS window is open and is ignored outright the moment it closes, so a long verification in the ' +
      'other session can no longer let the takeover lapse unnoticed. WITH NO LIVE OWNER it is honoured for ' +
      `${mins} min from NOW — the moment it was recorded — and then the ordinary handover takes over rather than ` +
      'leaving the batch ownerless. And once the owner has RELEASED for it the claim is spent: the lock is free ' +
      'and the first window to acquire wins, so re-run this command AT ONCE when the release is reported; if the ' +
      'launcher got there first, claim again against the new owner.',
  )
}
