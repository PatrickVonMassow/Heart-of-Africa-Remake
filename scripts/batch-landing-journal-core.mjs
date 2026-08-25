// CRASH-RECOVERABLE SERIAL LANDING — the remainder of ordered-work step 9.
import { LANDING_STAGES, landingCrashDecision } from './batch-landing-core.mjs'

export const LANDING_EVIDENCE_STAGES = Object.freeze(LANDING_STAGES.slice(1))
const oid = (value) => typeof value === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value)
const present = (value) => typeof value === 'string' && value.length > 0

export function createLandingTransaction({ landingId, batchId, pointId, branch, candidateSha, targetSha, baseSha, actor, fence, at } = {}) {
  if (![landingId, batchId, pointId, branch, actor].every(present)) return { ok: false, reason: 'a landing names stable landing, batch, point, branch, and actor identities' }
  if (![candidateSha, targetSha, baseSha].every(oid)) return { ok: false, reason: 'candidate, target, and base are full object ids' }
  if (!Number.isInteger(fence) || fence < 1 || !Number.isFinite(at)) return { ok: false, reason: 'a landing records its coordinator fence and start time' }
  return { ok: true, transaction: Object.freeze({
    v: 1, landingId, batchId, pointId, branch, candidateSha, targetSha, baseSha,
    actor, fence, stage: 'candidate', stages: Object.freeze({ candidate: Object.freeze({ at, candidateSha, targetSha, baseSha }) }),
  }) }
}

function evidenceVerdict(stage, evidence, transaction) {
  if (!evidence || typeof evidence !== 'object' || !Number.isFinite(evidence.at)) return { ok: false, reason: `${stage} evidence has a finite time` }
  if (stage === 'diff-review') {
    if (evidence.complete !== true || !present(evidence.reviewer) || evidence.source !== 'main-session') return { ok: false, reason: 'diff review is completed by the main-session reviewer' }
  } else if (stage === 'gates') {
    for (const gate of ['build', 'lint', 'test:unit']) if (evidence[gate]?.verdict !== 'green') return { ok: false, reason: `${gate} is not recorded green` }
  } else if (stage === 'picture-webgpu' || stage === 'picture-webgl2') {
    const backend = stage === 'picture-webgpu' ? 'webgpu' : 'webgl2'
    if (evidence.backend !== backend || evidence.verdict !== 'pass' || evidence.source !== 'main-session' || !present(evidence.artifactPath) || !/^[0-9a-f]{64}$/.test(evidence.artifactHash ?? '')) {
      return { ok: false, reason: `${backend} needs a main-session pass with artifact path and SHA-256 hash` }
    }
  } else if (stage === 'merge') {
    if (!oid(evidence.mergeSha) || !present(evidence.publicationId)) return { ok: false, reason: 'merge records its SHA and publication id' }
  } else if (stage === 'bookkeeping') {
    if (evidence.complete !== true || !oid(evidence.commitSha)) return { ok: false, reason: 'bookkeeping records its committed SHA' }
  } else if (stage === 'board') {
    if (evidence.published !== true || !/^[0-9a-f]{64}$/.test(evidence.boardHash ?? '')) return { ok: false, reason: 'board records its published content hash' }
  } else if (stage === 'landed') {
    if (!oid(evidence.mergeSha ?? transaction.stages?.merge?.mergeSha)) return { ok: false, reason: 'landed retains a proven merge SHA' }
  }
  return { ok: true }
}

export function advanceLanding(transaction, stage, evidence) {
  const current = LANDING_STAGES.indexOf(transaction?.stage)
  const next = LANDING_STAGES.indexOf(stage)
  if (current < 0 || next < 0) return { ok: false, reason: 'the landing stage is unknown' }
  if (next === current) {
    return JSON.stringify(transaction.stages?.[stage]) === JSON.stringify(evidence)
      ? { ok: true, alreadyRecorded: true, transaction }
      : { ok: false, reason: `${stage} is already recorded with different evidence` }
  }
  if (next !== current + 1) return { ok: false, reason: `landing must advance one stage (${transaction.stage} -> ${LANDING_STAGES[current + 1]}), not ${stage}` }
  const checked = evidenceVerdict(stage, evidence, transaction)
  if (!checked.ok) return checked
  return { ok: true, transaction: Object.freeze({ ...transaction, stage, stages: Object.freeze({ ...transaction.stages, [stage]: Object.freeze({ ...evidence }) }) }) }
}

export function landingReadyToMerge({ transaction, branchSha, targetSha, currentFence } = {}) {
  if (transaction?.stage !== 'picture-webgl2') return { ok: false, reason: `landing evidence stops at ${transaction?.stage ?? 'nothing'}; both picture judgments must precede merge` }
  if (transaction.candidateSha !== branchSha) return { ok: false, rework: true, reason: 'the candidate branch moved after review; restart evidence on the new SHA' }
  if (transaction.targetSha !== targetSha || transaction.baseSha !== targetSha) return { ok: false, rework: true, reason: 'the serial landing base is stale; revalidate and repeat affected judgments' }
  if (transaction.fence !== currentFence) return { ok: false, reason: 'the landing transaction belongs to a fenced coordinator epoch' }
  return { ok: true }
}

export function landingLockVerdict({ existing = null, claimant = null, ownerLive = null } = {}) {
  if (!claimant?.landingId || !claimant?.sessionId || !Number.isInteger(claimant?.fence)) return { ok: false, reason: 'the landing-lock claimant names landing, session, and fence' }
  if (!existing) return { ok: true, action: 'acquire' }
  if (existing.landingId === claimant.landingId && existing.sessionId === claimant.sessionId && existing.fence === claimant.fence) return { ok: true, action: 'resume' }
  return { ok: false, reason: ownerLive === true ? `landing lock is held by live transaction ${existing.landingId}` : `landing lock is stranded by ${existing.landingId}; reconcile it before another landing`, recovery: landingCrashDecision({ stage: existing.stage ?? 'candidate' }) }
}

export function recoverLanding(transaction) {
  const decision = landingCrashDecision({ stage: transaction?.stage })
  return decision.ok ? { ...decision, landingId: transaction.landingId, preservedEvidence: transaction.stages } : decision
}
