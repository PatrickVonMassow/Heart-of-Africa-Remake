// CHECKPOINT BARRIER — ordered-work step 6. A checkpoint is transferable only
// when the worker binds its acknowledgment to the request and affirmatively
// reports a clean committed SHA that reached the remote.

export const CHECKPOINT_RECOVERY_CHOICES = Object.freeze(['wait', 'cancel', 'drain'])
export const DEFAULT_CHECKPOINT_TIMEOUT_MS = 3 * 60 * 1000

const present = (value) => typeof value === 'string' && value.length > 0
const oid = (value) => typeof value === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value)

export function createCheckpointBarrier({ requestId, lanes = [], requestedAt, timeoutMs = DEFAULT_CHECKPOINT_TIMEOUT_MS, fence } = {}) {
  if (!present(requestId)) return { ok: false, reason: 'a checkpoint request has a stable request id' }
  if (!Number.isFinite(requestedAt)) return { ok: false, reason: 'a checkpoint request has a finite request time' }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { ok: false, reason: 'a checkpoint timeout is positive and finite' }
  if (!Number.isInteger(fence) || fence < 1) return { ok: false, reason: 'a checkpoint request records its coordinator fence' }
  if (!Array.isArray(lanes)) return { ok: false, reason: 'checkpoint lanes are an array' }
  const ids = lanes.map((lane) => typeof lane === 'string' ? lane : lane?.attemptId)
  if (ids.some((id) => !present(id)) || new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'checkpoint lanes have unique stable attempt ids' }
  }
  return {
    ok: true,
    barrier: Object.freeze({ requestId, requestedAt, deadlineAt: requestedAt + timeoutMs, fence, lanes: Object.freeze(ids), acknowledgments: Object.freeze({}) }),
  }
}

/** Duplicate identical acknowledgment is idempotent. A different second answer
 * is refused: an acknowledgment is evidence, not mutable status. */
export function acknowledgeCheckpoint(barrier, acknowledgment) {
  if (!barrier || !present(barrier.requestId)) return { ok: false, reason: 'no usable checkpoint barrier' }
  const ack = acknowledgment && typeof acknowledgment === 'object' ? acknowledgment : {}
  if (ack.requestId !== barrier.requestId) return { ok: false, reason: `acknowledgment belongs to request ${String(ack.requestId)}, not ${barrier.requestId}` }
  if (!barrier.lanes.includes(ack.attemptId)) return { ok: false, reason: `attempt ${String(ack.attemptId)} was not asked to checkpoint` }
  if (!Number.isFinite(ack.acknowledgedAt)) return { ok: false, reason: 'the acknowledgment has no finite time' }
  const normalized = Object.freeze({
    requestId: ack.requestId,
    attemptId: ack.attemptId,
    acknowledgedAt: ack.acknowledgedAt,
    sha: ack.sha ?? null,
    committed: ack.committed === true,
    pushed: ack.pushed === true,
    clean: ack.clean === true,
    pushError: present(ack.pushError) ? ack.pushError : null,
    late: ack.acknowledgedAt > barrier.deadlineAt,
  })
  const existing = barrier.acknowledgments[ack.attemptId]
  if (existing) {
    return JSON.stringify(existing) === JSON.stringify(normalized)
      ? { ok: true, alreadyAcknowledged: true, barrier }
      : { ok: false, reason: `attempt ${ack.attemptId} already acknowledged this request with different evidence` }
  }
  return { ok: true, barrier: Object.freeze({ ...barrier, acknowledgments: Object.freeze({ ...barrier.acknowledgments, [ack.attemptId]: normalized }) }) }
}

export function checkpointBarrierVerdict(barrier, { now } = {}) {
  if (!barrier || !Array.isArray(barrier.lanes) || !Number.isFinite(now)) return { ok: false, verdict: 'invalid', reason: 'a barrier verdict needs the barrier and a finite clock' }
  const blocked = []
  const pending = []
  for (const attemptId of barrier.lanes) {
    const ack = barrier.acknowledgments?.[attemptId]
    if (!ack) {
      if (now <= barrier.deadlineAt) pending.push({ attemptId })
      else blocked.push({ attemptId, reason: 'checkpoint timeout', transferable: false, choices: CHECKPOINT_RECOVERY_CHOICES })
      continue
    }
    const transferable = ack.committed === true && ack.pushed === true && ack.clean === true && oid(ack.sha) && ack.late !== true && !ack.pushError
    if (!transferable) {
      const reason = ack.late ? 'late acknowledgment after checkpoint timeout'
        : ack.pushError ? `push failed: ${ack.pushError}`
          : !ack.committed ? 'work was not committed'
            : !ack.pushed ? 'commit was not pushed'
              : !ack.clean ? 'worktree was not clean after push'
                : 'acknowledgment carries no full commit SHA'
      blocked.push({ attemptId, reason, transferable: false, choices: CHECKPOINT_RECOVERY_CHOICES })
    }
  }
  if (blocked.length) return { ok: false, verdict: 'blocked', requestId: barrier.requestId, blocked, pending }
  if (pending.length) return { ok: false, verdict: 'waiting', requestId: barrier.requestId, pending }
  return { ok: true, verdict: 'ready', requestId: barrier.requestId, acknowledgments: barrier.acknowledgments }
}

/** Translate the daemon's worker acknowledgments into the same fail-closed
 * verdict used by persisted barriers. */
export function daemonCheckpointVerdict({ requestId, answers = [] } = {}) {
  if (!present(requestId) || !Array.isArray(answers)) return { ok: false, verdict: 'invalid', reason: 'the daemon checkpoint reply is unusable' }
  const blocked = answers.filter((answer) => answer?.acknowledged !== true || answer?.transferable !== true || !oid(answer?.sha)).map((answer) => ({
    attemptId: answer?.attemptId ?? null,
    reason: answer?.acknowledged !== true ? 'checkpoint timeout' : answer?.pushedOk !== true ? 'push failed' : answer?.dirty === true ? 'dirty worktree' : 'checkpoint evidence incomplete',
    transferable: false,
    choices: CHECKPOINT_RECOVERY_CHOICES,
  }))
  return blocked.length ? { ok: false, verdict: 'blocked', requestId, blocked } : { ok: true, verdict: 'ready', requestId, answers }
}
