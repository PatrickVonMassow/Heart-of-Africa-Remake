// THE LEASE AND THE FENCE — pure decision core (layer 1 of
// docs/batch-resilience.md §3). Side-effect free, so the Vitest layer can sweep
// every rule without a filesystem (scripts/batch-lease-core.test.mjs). The I/O
// lives in scripts/batch-singleton.mjs (lock + fence file) and in
// scripts/board-first-guard.mjs (the one PreToolUse chokepoint).
//
// WHY (the night of 29./30.07.2026): work stopped at 21:50 and the state at
// 04:19 was byte-for-byte the same. Every layer could OBSERVE the stall while
// none could ACT, and where authority existed a condition kept it from reaching.
// The answer is not a better observer but a LEASE: ownership of the batch ends by
// arithmetic, at a moment both sides can compute from the same numbers, with no
// probe, no judgement and no condition in between.
//
// THREE RULES THIS MODULE ENCODES
//
// 1. RENEWAL IS PRE-, NEVER POST-ToolUse. The existing heartbeat fires AFTER a
//    call returns, so a lease renewed by it would have to outlive the longest
//    single call — and this repository legitimately runs 30-40 minute suites and
//    has recorded 87 minutes of silence with work advancing. Renewing BEFORE the
//    long call keeps the window short and the reader side pure arithmetic.
//
// 2. THE FENCE IS NOT IN THE LOCK FILE. `acquire` DELETES the lock on a takeover
//    and a corrupt one reads as null, so a high-water mark kept there would be
//    lost exactly when it matters and a fresh start at fence=1 would re-admit the
//    old owner's writes. It lives in its own never-deleted, monotonic, max-wins
//    file; the lock carries only a COPY of its holder's number, which lets a
//    deleted fence file be re-seeded upward rather than downward.
//
// 3. A SESSION IS ONLY EVER FENCED OUT BY ITS OWN RECORD. Staleness is
//    `heldFence < currentFence` for a session that DEMONSTRABLY held a fence.
//    A session that never held one is never blocked — an attended window, a
//    fresh clone, a session that never drove the batch. Being wrong toward
//    "allow" costs a stale board; being wrong toward "deny" costs a block-loop,
//    which this project has already paid ~30 turns for once.

import { shellSegments, isMutatingSegment } from './board-first-core.mjs'

/**
 * HOW LONG ONE RENEWAL BUYS.
 *
 * SIXTY MINUTES, and the size follows from rule 1 above: because the lease is
 * renewed BEFORE a call rather than after it, the window must OUTLIVE the longest
 * legitimate single tool call — the thing the demolished `WEDGED_MS` valve was
 * calibrated against from this project's own 43 transcripts / 32 440 tool calls
 * (p99 8.9 min · p99.9 10.0 min · longest undeclared unattended call 27.8 min),
 * plus the longest declared one, the LARGE browser regression at 30-40 minutes.
 * With renewals at most `LEASE_RENEW_INTERVAL_MS` apart the guaranteed coverage
 * is 55 minutes: ~2.0x the longest measured undeclared call and 1.4x the LARGE
 * regression. Below that a running verification could lose the batch mid-run,
 * which docs/batch-resilience.md §5 forbids outright.
 *
 * It stays far under the demolished four-hour valve, and the ladder above it is
 * monotone: the external GitHub-Actions watcher judges repository OUTPUT at 120
 * minutes, so the local arithmetic always acts first.
 */
export const LEASE_MS = 60 * 60 * 1000

/**
 * The lease is rewritten at most this often. WITHOUT this the lock file would be
 * written twice per tool call (PreToolUse renewal + PostToolUse heartbeat) on the
 * hot path — and this exact file has a measured failure mode there: on
 * 28.07.2026 three writes within milliseconds produced `EPERM … rename
 * batch-lock.json.tmp -> batch-lock.json` five times, because a real-time scanner
 * holds the target of the rename. The defence adopted then was to write the lock
 * LESS; a renewal on every call would undo it.
 */
export const LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000

/** How many past fence holders the fence file remembers. Bounded on purpose: the
 *  file is never deleted, so an unbounded list would grow for the life of the
 *  repository. Twenty-four covers days of takeovers; beyond it a session reads as
 *  "never held a fence", which is the fail-OPEN direction. */
export const FENCE_HOLDER_HISTORY = 24

// --- The lease -----------------------------------------------------------------

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * WHEN DOES THIS LOCK'S OWNERSHIP END? PURE.
 *
 * A lock written by a build that predates the lease carries no `leaseUntil`, and
 * it MUST NOT need a migration step somebody has to remember: the session that
 * merges this code is a live owner holding exactly such a lock. So a missing
 * `leaseUntil` reads as an IMPLICIT lease of `claimedAt + leaseMs` — the same
 * shape the demolished age valve had, expressed as the one number everything
 * else now compares against. Its first PreToolUse call writes a real one.
 *
 * Returns epoch ms, or null when the lock carries no usable timestamp at all
 * (then no lease statement can be made and the caller must not invent one).
 */
export function leaseUntilOf(lock, { leaseMs = LEASE_MS } = {}) {
  if (!lock || typeof lock !== 'object') return null
  const explicit = num(lock.leaseUntil)
  if (explicit !== null) return explicit
  const claimed = num(lock.claimedAt)
  return claimed === null ? null : claimed + leaseMs
}

/**
 * HAS THE LEASE RUN OUT? PURE ARITHMETIC, AND DELIBERATELY NOTHING ELSE.
 *
 * There is NO probing at this door (docs/batch-resilience.md §3, layer 1). The
 * first revision of that design let a declared in-flight wait extend the lease
 * "while the declared work is provably moving", which put the judgement straight
 * back in. Declared work extends the lease by WRITING a longer `leaseUntil`; the
 * reader only compares two numbers.
 *
 * An unreadable lease is NOT expired — a lock we cannot understand must never
 * cost a live owner the batch.
 */
export function leaseExpired(lock, { now, leaseMs = LEASE_MS } = {}) {
  const until = leaseUntilOf(lock, { leaseMs })
  const t = num(now)
  if (until === null || t === null) return false
  return t > until
}

/**
 * MAY THIS RENEWAL BE SKIPPED? PURE. See `LEASE_RENEW_INTERVAL_MS`: the renewal
 * is on the per-tool-call path, and the lock is a file this project has already
 * been bitten for writing too often. A lease with more than
 * `leaseMs - renewIntervalMs` left is fresh enough; anything else is rewritten,
 * including a lock that carries no explicit lease yet.
 */
export function shouldRenewLease({ lock, now, leaseMs = LEASE_MS, renewIntervalMs = LEASE_RENEW_INTERVAL_MS } = {}) {
  const t = num(now)
  if (t === null) return false
  if (!lock || typeof lock !== 'object') return false
  const explicit = num(lock.leaseUntil)
  if (explicit === null) return true // never leased → write one now
  return explicit - t < leaseMs - renewIntervalMs
}

/** The lock as it reads after a renewal. PURE — the caller does the writing.
 *  Nothing else on the lock is touched: `claimedAt` in particular stays where it
 *  was, because bumping it here would silently withdraw a taken handover. */
export function renewedLock(lock, { now, leaseMs = LEASE_MS } = {}) {
  const t = num(now)
  if (!lock || typeof lock !== 'object' || t === null) return lock
  return { ...lock, leaseUntil: t + leaseMs }
}

// --- The fence -----------------------------------------------------------------
//
// (`renewalDecision`, which needs both halves, sits below the fence section.)

/** The fence file's shape, normalised. An unreadable file yields fence 0 and no
 *  holders, i.e. "nothing known" — which blocks nobody. */
export function normaliseFence(state) {
  const s = state && typeof state === 'object' ? state : {}
  const fence = num(s.fence)
  const holders = Array.isArray(s.holders) ? s.holders : []
  return {
    fence: fence !== null && fence > 0 ? Math.floor(fence) : 0,
    holder: typeof s.holder === 'string' ? s.holder : '',
    holders: holders
      .filter((h) => h && typeof h.sessionId === 'string' && num(h.fence) !== null)
      .map((h) => ({ sessionId: h.sessionId, fence: Math.floor(h.fence), at: num(h.at) ?? 0 })),
  }
}

/**
 * THE NEXT FENCE NUMBER. PURE, MONOTONIC, MAX-WINS.
 *
 * `priorFence` is the number carried by the lock being replaced. It is what makes
 * the mark survive its own file: delete `batch-fence.json` and the next acquire
 * still seeds from the outgoing owner's copy, so the counter can never be reset
 * to a value that would re-admit a dispossessed session's writes
 * (docs/batch-resilience.md §8, "a fence file that was deleted does not lower the
 * high-water mark").
 */
export function nextFence({ fenceState, priorFence } = {}) {
  const cur = normaliseFence(fenceState).fence
  const prior = num(priorFence)
  return Math.max(cur, prior !== null && prior > 0 ? Math.floor(prior) : 0) + 1
}

/** The fence file as it reads after granting `fence` to `sessionId`. PURE.
 *  Max-wins: a grant can never lower the mark, even if a caller passes an old
 *  number. */
export function grantedFenceState({
  fenceState,
  sessionId,
  fence,
  now,
  historyLimit = FENCE_HOLDER_HISTORY,
} = {}) {
  const cur = normaliseFence(fenceState)
  const sid = typeof sessionId === 'string' ? sessionId : ''
  const n = Math.max(cur.fence, num(fence) ?? 0)
  const at = num(now) ?? 0
  const holders = [...cur.holders.filter((h) => h.sessionId !== sid), ...(sid ? [{ sessionId: sid, fence: n, at }] : [])]
  return {
    v: 1,
    fence: n,
    holder: sid || cur.holder,
    at,
    holders: holders.slice(-Math.max(1, historyLimit)),
  }
}

/** The highest fence this session was ever granted, or null if it never held one. */
export function fenceHeldBy(fenceState, sessionId) {
  const sid = typeof sessionId === 'string' ? sessionId : ''
  if (!sid) return null
  const cur = normaliseFence(fenceState)
  let best = null
  for (const h of cur.holders) {
    if (h.sessionId === sid && (best === null || h.fence > best)) best = h.fence
  }
  return best
}

/**
 * IS THIS SESSION'S FENCE STALE? PURE.
 *
 * Stale means: it HELD a fence and the mark has moved past it — i.e. somebody
 * else took the batch in the meantime. Three non-obvious consequences, each
 * deliberate:
 *   - a session that never held a fence is NEVER stale (`held === null`), so the
 *     gate cannot fire on a window that has nothing to do with the batch;
 *   - a compaction, which mints a new session id under the same process, leaves
 *     the NEW id unknown → not stale, and the OLD id at `held === current` →
 *     also not stale. Ownership by process is unaffected by the fence;
 *   - a missing or unreadable fence file yields current 0 and no holders, so
 *     nothing is stale. A fence we cannot read must never block anybody.
 */
export function fenceStatus({ fenceState, sessionId } = {}) {
  const cur = normaliseFence(fenceState)
  const held = fenceHeldBy(fenceState, sessionId)
  return { current: cur.fence, held, stale: held !== null && cur.fence > held }
}

/**
 * MAY THIS SESSION RENEW ITS LEASE? PURE. The whole PreToolUse renewal rule in
 * one function, so the hook file only does I/O.
 *
 * A STALE FENCE REFUSES THE RENEWAL (docs/batch-resilience.md §8, "a renewal
 * under a stale fence is refused"). Without that clause a woken owner whose lock
 * somehow still named it would renew its way back into a live lease and start
 * writing again beside the successor — the fence would then merely have recorded
 * the takeover instead of enforcing it.
 *
 * Returns { renew, reason } — the reason is for the log, never for a decision.
 */
export function renewalDecision({
  lock,
  sessionId,
  fenceState,
  now,
  leaseMs = LEASE_MS,
  renewIntervalMs = LEASE_RENEW_INTERVAL_MS,
} = {}) {
  if (!lock || typeof lock !== 'object') return { renew: false, reason: 'no-lock' }
  const sid = typeof sessionId === 'string' ? sessionId : ''
  if (!sid || lock.sessionId !== sid) return { renew: false, reason: 'not-owner' }
  if (fenceStatus({ fenceState, sessionId: sid }).stale) return { renew: false, reason: 'fence-stale' }
  if (!shouldRenewLease({ lock, now, leaseMs, renewIntervalMs })) return { renew: false, reason: 'still-fresh' }
  return { renew: true, reason: 'renewed' }
}

// --- The chokepoint ------------------------------------------------------------

/** Scripts whose whole job is to publish the board the user reads. */
const BOARD_PUBLISH_SCRIPTS = ['board-publish.mjs', 'dashboard-publish.mjs', 'board.mjs']

/** Scripts that MERGE `.claude/dashboard-state.json` as their normal operation. */
const DASHBOARD_STATE_SCRIPTS = ['focus.mjs', 'dashboard-sync.mjs', 'board-queue.mjs']

/** The work order and its archive — the tick and the archive move. */
const TASKS_FILES = ['TASKS.md', 'tasks-archive.md']

const hasScript = (segment, names) =>
  names.some((n) => segment.includes(`scripts/${n}`) || segment.includes(`scripts\\${n}`))

/** `git merge` / `git push` in verb position, so `git log --merges` is not a hit. */
const GIT_SHARED_HISTORY = /\bgit\s+(?:-[^\s]+\s+(?:[^\s-][^\s]*\s+)?)*(merge|push)\b/

const asPosix = (p) => String(p ?? '').replace(/\\/g, '/')

/**
 * WHICH FENCE-GUARDED FAMILY DOES THIS TOOL CALL BELONG TO? PURE.
 *
 * Deliberately NOT "every state-changing call": these four are the paths that
 * have NO guard of their own today (docs/batch-resilience.md §3, layer 1). The
 * lock's own writers — heartbeat, markHandover, updateOwnLock, withdrawHandover,
 * clearOwnBoundary — are already sessionId-guarded and need nothing, and neither
 * does `batch-claim` (own expiry plus pid probe). Without this chokepoint the
 * fence would protect only the file that was already protected, and the woken
 * owner would still push to main.
 *
 * Returns null (not guarded) or { kind, what }.
 */
export function fenceGuardedAction({ toolName, command, filePath } = {}) {
  const tool = String(toolName ?? '')
  const path = asPosix(filePath)
  // A PATH ALONE IS NOT AN ACTION: `Read`, `Grep` and `Glob` carry file paths
  // too, and a gate that refuses to let a fenced-out session READ the work order
  // would tell it it is dispossessed by denying it the only way to find out.
  if (path && (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')) {
    if (TASKS_FILES.some((f) => path === f || path.endsWith(`/${f}`))) {
      return { kind: 'tasks', what: 'an edit of the work order (the tick / the archive move)' }
    }
    if (path.endsWith('dashboard-state.json')) {
      return { kind: 'dashboard-state', what: 'a write to .claude/dashboard-state.json' }
    }
  }
  if (tool !== 'Bash' && tool !== 'PowerShell') return null
  for (const segment of shellSegments(command)) {
    if (GIT_SHARED_HISTORY.test(segment)) {
      // A dispossessed session may still commit locally; what it may not do is
      // move shared history. `git push` is matched in every form rather than only
      // where "main" appears literally — `git push origin HEAD:main` names the
      // branch nowhere a regex can rely on, and the safe direction for a session
      // that has already lost the batch is not to write to the remote at all.
      return { kind: 'git-main', what: 'a `git merge` / `git push` (shared history)' }
    }
    if (hasScript(segment, BOARD_PUBLISH_SCRIPTS)) {
      return { kind: 'board-publish', what: 'a board publish' }
    }
    if (hasScript(segment, DASHBOARD_STATE_SCRIPTS)) {
      return { kind: 'dashboard-state', what: 'a merge into .claude/dashboard-state.json' }
    }
    if (/tasks-archive\.mjs|tasks-archive-guard\.mjs/.test(segment)) {
      return { kind: 'tasks', what: 'an archive move in the work order' }
    }
    if (TASKS_FILES.some((f) => segment.includes(f)) && isMutatingSegment(segment)) {
      return { kind: 'tasks', what: 'a write to the work order' }
    }
  }
  return null
}

/**
 * THE CHOKEPOINT'S VERDICT. PURE, and total by contract — the wrapper's
 * fail-open must not depend on luck.
 *
 * Returns { block, reason, kind }. It blocks only where ALL of these hold:
 *   - the batch is not paused,
 *   - this session demonstrably held a fence and the mark has moved past it,
 *   - and the call belongs to one of the four unguarded families.
 */
export function fenceDecision({ fenceState, sessionId, toolName, command, filePath, paused = false } = {}) {
  try {
    if (paused === true) return { block: false, reason: '', kind: null }
    const status = fenceStatus({ fenceState, sessionId })
    if (!status.stale) return { block: false, reason: '', kind: null }
    const action = fenceGuardedAction({ toolName, command, filePath })
    if (!action) return { block: false, reason: '', kind: null }
    return {
      block: true,
      kind: action.kind,
      reason:
        'FENCED OUT — this session no longer owns the batch. It held fence ' +
        `${status.held}; the batch has since been taken over and stands at fence ${status.current}. ` +
        `The call refused is ${action.what}.\n` +
        'This is not a permission problem and not a bug: the batch lease expired while this session was ' +
        'silent, another session took over, and two sessions writing the work order, the shared git ' +
        'history or the board is the incident the singleton exists to prevent (docs/batch-resilience.md ' +
        '§3, layer 1).\nWhat to do:\n' +
        '  - Do NOT merge, push, tick the work order or publish the board. The current owner does that.\n' +
        '  - Reads, local commits and everything outside those four paths are untouched.\n' +
        '  - To take the batch back through the sanctioned channel:\n' +
        '      node scripts/batch-claim.mjs --session <this session id>\n' +
        '  - `node scripts/batch-doctor.mjs` reports who owns it now.',
    }
  } catch {
    return { block: false, reason: '', kind: null }
  }
}
