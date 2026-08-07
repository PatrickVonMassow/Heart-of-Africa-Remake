// WHAT A SESSION THAT DID NOT GET THE BATCH IS TOLD — the deciding half of
// scripts/batch-resume-hook.mjs's stand-down branch. PURE: no I/O, no clock.
//
// WHY THIS EXISTS AT ALL (four-eyes review, 29.07.2026 — the worst finding of
// the message-watcher review). That branch had exactly ONE message, written when
// the only way to reach it was "another window holds the lock". Two situations
// now reach it that the text is wrong about:
//
//   1. THE MESSAGE RESPONDER (point 407). The watcher wakes a session for ONE
//      chat message under a bounded claim, and that session correctly fails to
//      acquire the lock — so it was told "do NOT edit TASKS.md", which is a
//      direct contradiction of the one duty it was woken for: appending an
//      instruction as a work-order point. An instruction from the phone would be
//      read, obeyed into silence, and lost. That is worse than the fifteen-minute
//      wait the watcher removes.
//   2. NO LOCK AT ALL. With a claim reserving the batch and no owner on disk, the
//      old text still asserted "another session OWNS the batch lock (session
//      unknown, pid unknown, heartbeat 0 min ago) and its liveness check passed".
//      Every clause of that is false in that state, and a session that reads an
//      obviously wrong description of its situation learns to discount the whole
//      message — including the parts that are true.
//
// So the branch now NAMES its situation first and speaks to it. The rule is
// pure and tested here; the hook only gathers the state and prints the result.
import { CLAIM_BY } from './chat-watcher-core.mjs'
import { CLAIM_MAX_AGE_MS } from './batch-claim-core.mjs'

/**
 * How the SessionStart text opens: how much is open, and the one point the
 * session will actually carry (point 440).
 *
 * IT USED TO ENUMERATE EVERY OPEN NUMBER — 118 of them, 588 measured characters
 * of the hook's 4035, injected at every session start. Since the point boundary
 * (27.07.2026) a session carries ONE stretch of work and ends, so 117 of those
 * numbers were never acted on; and a bare number tells nothing anyway — the
 * spec behind it comes from `point-brief.mjs`, which is the pointer this hands
 * over instead. The board's Warteschlange, which DOES have to list them all,
 * builds its own list from the work order (`board-queue.mjs import`).
 */
/** At most a handful of numbers, then a count — the headline may not grow with the queue. */
const namedFew = (nums, max = 6) =>
  nums.length > max ? `${nums.slice(0, max).join(', ')} and ${nums.length - max} more` : nums.join(', ')

/**
 * What a session is told when NOTHING is workable because every remaining point
 * waits on the user (point 450). The batch is not finished and it is not idle —
 * it is blocked on one person, and a silent start would read as "done".
 */
export function allGatedMessage(gated = []) {
  const waiting = (gated ?? []).map(Number).filter(Number.isFinite)
  return (
    `[batch-resume] Every remaining work-order point WAITS ON THE USER (${waiting.length}: ${namedFew(waiting)}). ` +
    'There is no next point to start — do NOT begin one. Check that each has its "Von dir zu klären" card on the ' +
    'board (node scripts/defer-for-user.mjs --list for the recorded reasons); when an answer arrives, ' +
    'node scripts/defer-for-user.mjs --clear <N> puts that point back at the head of the queue.'
  )
}

export function openPointsHeadline(openNumbers = [], { gated = [] } = {}) {
  const nums = (openNumbers ?? []).map(Number).filter(Number.isFinite)
  const waiting = (gated ?? []).map(Number).filter(Number.isFinite)
  const head = nums[0]
  return (
    `[batch-resume] TASKS.md has ${nums.length} open point(s); the first in work-order ` +
    `order is ${head ?? 'none'}` +
    (head === undefined ? '. ' : ` (node scripts/point-brief.mjs ${head} for its spec; TASKS.md for the rest). `) +
    // THE GATED POINTS ARE NAMED, NOT OFFERED (point 450). A fresh session must
    // not pick up a point that cannot proceed without an answer — but it must
    // know one is waiting, or it would read the shorter queue as progress.
    (waiting.length
      ? `${waiting.length} further point(s) WAIT ON THE USER and are skipped: ${namedFew(waiting)} — ` +
        'do not start them (node scripts/defer-for-user.mjs --list for the recorded reasons; ' +
        '--clear <N> when the answer arrives, which puts the point back at the head of the queue). '
      : '')
  )
}

export const STAND_DOWN_KINDS = Object.freeze({
  /** THIS session is the responder the watcher woke for a chat message. */
  RESPONDER: 'responder',
  /** Another session is that responder; this one is an ordinary bystander. */
  OTHER_RESPONDER: 'other-responder',
  /** A live owner holds the lock — the original, and still the common, case. */
  LIVE_OWNER: 'live-owner',
  /** Nobody owns the lock, but a claim reserves it for a window — either still
   *  pending, or already released for it and held while that window lives. */
  RESERVED: 'reserved',
  /** The acquire simply lost and no lock is readable — say so plainly. */
  UNKNOWN: 'unknown',
})

/**
 * WHICH STAND-DOWN IS THIS? PURE.
 *
 * `ancestorPid` is the pid of the claude process THIS session runs under. It is
 * what distinguishes "I am the responder" from "a responder is running" — the
 * claim records the responder's pid, and nothing else in the payload can tell
 * the two apart (the claim's session id is synthetic and never equals a real
 * one; see the note on `classifyParallel` in scripts/chat-watcher-core.mjs).
 */
export function standDownKind({ lock = null, claim = null, claimHonoured = false, ancestorPid = null } = {}) {
  if (claimHonoured && claim && claim.by === CLAIM_BY) {
    const responderPid = Number(claim.responderPid)
    if (Number.isInteger(responderPid) && responderPid > 0 && responderPid === Number(ancestorPid)) {
      return STAND_DOWN_KINDS.RESPONDER
    }
    return STAND_DOWN_KINDS.OTHER_RESPONDER
  }
  if (lock && typeof lock.claimedAt === 'number') return STAND_DOWN_KINDS.LIVE_OWNER
  if (claimHonoured) return STAND_DOWN_KINDS.RESERVED
  return STAND_DOWN_KINDS.UNKNOWN
}

/**
 * The one line every non-responder stand-down ends with: how the user takes the
 * batch into THIS window. Printed with the session id already in it, because a
 * CLI gets no hook payload and this is the one place it is known.
 *
 * IT NAMES THE CLOCK (point 434 (6), 30.07.2026). The old text said "re-running
 * the SAME command takes it" and stopped there — it never mentioned that a claim
 * ages at all, so a returning session claimed once, waited, and never learned why
 * nothing happened. Both halves of the rule are now stated: while the owner still
 * holds the lock the claim does not age (it lives as long as this window does),
 * and once the lock is free it only reserves the batch for the take-up window,
 * after which the ordinary handover takes over. `takeUpMin` is the take-up
 * window in minutes, injected so this stays pure.
 *
 * AND IT NO LONGER SENDS THE USER INTO A RACE (point 461). It used to end "the
 * first window to acquire wins, so re-run the command AT ONCE" — which was true,
 * and which the user LOST by six minutes on 30.07.2026 while the releasing session
 * itself took the lock back. The released claim now holds the freed lock for its
 * claimant, so the text says what is actually reserved and what ends it.
 */
function wayBack(sessionId, takeUpMin) {
  return (
    'THE WAY BACK: if the user says they are back and want the batch worked HERE, run ' +
    `\`node scripts/batch-claim.mjs --session ${sessionId}\` — that claims the batch, the owning session ` +
    'releases it at its next CLEAN turn end (never mid-merge, never with a delegated agent or a ' +
    'verification still running), and re-running the SAME command takes it. Nothing else is needed from ' +
    'the user. THE CLOCK, stated rather than hidden: while a LIVE owner holds the lock the claim does NOT ' +
    'expire — it holds for as long as THIS window is open and is ignored the moment it closes. With NO live ' +
    `owner it is honoured for ${takeUpMin} min FROM WHEN IT WAS RECORDED, and after that the ordinary handover ` +
    'takes over so the batch is never left ownerless. Once the owner has RELEASED for it the claim can never be ' +
    'honoured a second time, but the freed lock stays RESERVED for this window while it is open — no launcher ' +
    `tick and no other session takes it at a turn end — for up to ${takeUpMin} min from the release. Re-run the command ` +
    'within that window; miss it and the ordinary handover applies, and you simply claim again against the new ' +
    'owner. To inspect: `node scripts/batch-claim.mjs --status`.'
  )
}

/** The ordinary stand-down body: not the worker, touch nothing. */
const NOT_THE_WORKER =
  'STAND DOWN: this session is NOT the batch worker. Do NOT ' +
  'run batch actions, do NOT merge to main, do NOT edit TASKS.md or the dashboard. Answer the ' +
  'user normally. '

/**
 * THE WHOLE STAND-DOWN MESSAGE. PURE — `now` is injected, nothing is read.
 *
 * Returns { kind, text }. The text is the body only; the hook prefixes its own
 * header (the open-point count and the model policy).
 */
export function standDownMessage({
  sessionId = '',
  lock = null,
  claim = null,
  claimHonoured = false,
  ancestorPid = null,
  takeUpMs = CLAIM_MAX_AGE_MS,
  now = Date.now(),
} = {}) {
  const kind = standDownKind({ lock, claim, claimHonoured, ancestorPid })
  const claimantSid = claim && typeof claim.sessionId === 'string' ? claim.sessionId : 'unknown'
  const takeUpMin = Math.max(1, Math.round((Number.isFinite(takeUpMs) && takeUpMs > 0 ? takeUpMs : CLAIM_MAX_AGE_MS) / 60000))
  const wayBackText = wayBack(sessionId, takeUpMin)

  if (kind === STAND_DOWN_KINDS.RESPONDER) {
    // The ONE stand-down that grants something. It is narrow on purpose: this
    // session exists to answer one message, and everything the batch does is
    // still forbidden to it.
    return {
      kind,
      text:
        'THIS SESSION IS A MESSAGE RESPONDER, not the batch worker. The chat watcher ' +
        '(scripts/chat-watcher.mjs) woke you for ONE message from the user and holds a bounded claim on ' +
        'the batch for your lifetime, which is why you do not and must not own .claude/batch-lock.json. ' +
        'YOU MAY: answer the message with `node scripts/chat-reply.mjs "…"` — always answer, even if only ' +
        'to confirm — and, if the message is an INSTRUCTION rather than a question, append it as one new ' +
        'implementation-ready point at the END of TASKS.md on main (append-and-defer, one atomic commit, ' +
        'then push) and name its number in the reply. That edit of TASKS.md is your duty here, not a ' +
        'violation of the main-only rule: appending on main IS the rule. ' +
        'YOU MAY NOT: work the queue, start or continue a point, merge anything, run a regression, ' +
        'delegate, touch the dashboard, or take the batch lock. Do not read the work order, design.md or ' +
        'the archive — a short question must not pay for a batch orientation. END the session as soon as ' +
        'the answer is sent; the launcher brings up a real batch session when one is due.',
    }
  }

  if (kind === STAND_DOWN_KINDS.OTHER_RESPONDER) {
    return {
      kind,
      text:
        `A message RESPONDER holds a bounded claim on the batch (claim ${claimantSid}, ` +
        'scripts/chat-watcher.mjs) while it answers one chat message, so the lock is reserved and this ' +
        `session cannot take it. ${NOT_THE_WORKER}The claim releases itself within minutes — it is bounded ` +
        `by the responder's lifetime and expires on its own. ${wayBackText}`,
    }
  }

  if (kind === STAND_DOWN_KINDS.RESERVED) {
    return {
      kind,
      text:
        `NO session owns the batch lock right now, but session ${claimantSid} has CLAIMED it ` +
        '(.claude/batch-claim.json) and that claim is still live, so taking the lock here would pull the ' +
        `batch out of the window it was reserved for. ${NOT_THE_WORKER}${wayBackText} ` +
        `NOTE: session ${claimantSid} has already claimed the batch — do not claim over it.`,
    }
  }

  if (kind === STAND_DOWN_KINDS.UNKNOWN) {
    // Honest about the one thing that is actually known: the acquire lost.
    return {
      kind,
      text:
        'The atomic acquire of the batch lock did NOT succeed here and no owner lock is readable — either ' +
        'another session claimed it in the race window, or the lock file could not be read. ' +
        `${NOT_THE_WORKER}${wayBackText}`,
    }
  }

  const ageMin = typeof lock?.claimedAt === 'number' ? Math.round((now - lock.claimedAt) / 60000) : 0
  return {
    kind,
    text:
      `But another session OWNS the batch lock (session ${lock?.sessionId ?? 'unknown'}, ` +
      `pid ${lock && lock.pid ? lock.pid : 'unknown'}, heartbeat ${ageMin} min ago, .claude/batch-lock.json) ` +
      `and its liveness check passed. ${NOT_THE_WORKER}${wayBackText}` +
      (claimHonoured ? ` NOTE: session ${claimantSid} has already claimed the batch — do not claim over it.` : ''),
  }
}
