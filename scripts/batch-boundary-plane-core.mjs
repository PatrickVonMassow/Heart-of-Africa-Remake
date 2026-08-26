// DURABLE TWO-PHASE BOUNDARY — ordered-work step 7. The older session-boundary
// core owns context/point cards; this core owns the daemon-backed batch proof.
import { landingAllowsBoundary } from './batch-landing-core.mjs'

export const DURABLE_BOUNDARY_PREPARE_V = 1

export function durablePrepareVerdict({ daemon, state, landingStage = null, bookkeeping, board, queue, checkpoint } = {}) {
  const refusals = []
  if (daemon?.ok !== true || daemon?.journalVerdict !== 'ok') refusals.push('daemon health or journal is not green')
  if (state?.journalVerdict !== 'ok' || state?.snapshotSealed !== true) refusals.push('durable state is not replayable and sealed')
  const landing = landingAllowsBoundary({ stage: landingStage })
  if (!landing.ok) refusals.push(landing.reason)
  if (bookkeeping?.clean !== true) refusals.push('bookkeeping is not complete: the coordinator worktree is dirty')
  if (board?.updated !== true || board?.readable !== true) refusals.push('the board update is missing or unreadable')
  if (queue?.ok !== true) refusals.push(`the authorized queue is invalid${queue?.reason ? `: ${queue.reason}` : ''}`)
  if (checkpoint?.ok !== true || checkpoint?.verdict !== 'ready') refusals.push('the checkpoint barrier is not ready')
  return refusals.length ? { ok: false, verdict: 'refused', refusals } : { ok: true, verdict: 'prepared' }
}

export function durablePrepareReceipt({ batchId, sessionId, fence, requestId, at, evidence } = {}) {
  if (![batchId, sessionId, requestId].every((value) => typeof value === 'string' && value)) return { ok: false, reason: 'prepare receipt names batch, session and request' }
  if (!Number.isInteger(fence) || fence < 1 || !Number.isFinite(at)) return { ok: false, reason: 'prepare receipt names fence and time' }
  const verdict = durablePrepareVerdict(evidence)
  if (!verdict.ok) return verdict
  return { ok: true, receipt: Object.freeze({ v: DURABLE_BOUNDARY_PREPARE_V, kind: 'boundary-prepare', batchId, sessionId, fence, requestId, at, checkpointRequestId: evidence.checkpoint.requestId }) }
}

export function durableCommitVerdict({ prepared, batchId, sessionId, fence, snapshot, marker = null } = {}) {
  if (!prepared || prepared.v !== DURABLE_BOUNDARY_PREPARE_V || prepared.kind !== 'boundary-prepare') return { ok: false, reason: 'no usable durable prepare receipt' }
  if (prepared.batchId !== batchId || prepared.sessionId !== sessionId || prepared.fence !== fence) return { ok: false, reason: 'the prepare receipt belongs to another batch, session, or fence' }
  if (snapshot?.ok !== true || snapshot?.snapshot?.batchId !== batchId) return { ok: false, reason: 'the sealed resume snapshot is missing or belongs to another batch' }
  if (marker) {
    const same = marker.kind === 'durable-batch-boundary' && marker.batchId === batchId && marker.fence === fence && marker.requestId === prepared.requestId
    if (!same) return { ok: false, reason: 'another boundary marker already stands' }
    return { ok: true, alreadyCommitted: true }
  }
  return { ok: true, alreadyCommitted: false }
}

export function durableBoundaryMarker({ prepared, daemonReceipt } = {}) {
  if (!prepared || daemonReceipt?.ok !== true) return { ok: false, reason: 'a boundary marker needs prepare and daemon receipts' }
  return { ok: true, marker: Object.freeze({ v: 1, kind: 'durable-batch-boundary', phase: 'committed', batchId: prepared.batchId, sessionId: prepared.sessionId, fence: prepared.fence, requestId: prepared.requestId, checkpointRequestId: prepared.checkpointRequestId, daemonGeneration: daemonReceipt.daemonGeneration ?? null, at: prepared.at }) }
}

export function durablePostCommitMutation({ marker, sessionId, fence } = {}) {
  if (marker?.kind === 'durable-batch-boundary' && marker.phase === 'committed' && marker.sessionId === sessionId && marker.fence === fence) {
    return { ok: false, reason: `coordinator fence ${fence} is sealed; post-commit mutation is forbidden` }
  }
  return { ok: true }
}
