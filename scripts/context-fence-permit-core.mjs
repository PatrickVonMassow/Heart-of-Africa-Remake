// The emergency context permit, pure validation and record shaping.

export const CONTEXT_FENCE_PERMIT_VERSION = 1

const positiveInt = (value) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function buildContextPermit({
  id,
  sessionId,
  point,
  reason,
  maxTokens,
  head,
  now,
  ttlMs,
} = {}) {
  const session = String(sessionId ?? '').trim()
  const why = String(reason ?? '').trim()
  const pointNumber = positiveInt(point)
  const tokenLimit = positiveInt(maxTokens)
  const createdAt = Number(now)
  const ttl = positiveInt(ttlMs)
  if (!String(id ?? '').trim()) throw new Error('a permit id is required')
  if (!session) throw new Error('--session is required')
  if (pointNumber === null) throw new Error('--point must be a positive integer')
  if (!why) throw new Error('--reason is required')
  if (tokenLimit === null) throw new Error('--max-tokens must be a positive integer')
  if (!Number.isFinite(createdAt) || ttl === null) throw new Error('permit time is invalid')
  return {
    v: CONTEXT_FENCE_PERMIT_VERSION,
    id: String(id),
    status: 'issued',
    sessionId: session,
    point: pointNumber,
    reason: why,
    maxTokens: tokenLimit,
    head: String(head ?? '').trim() || null,
    issuedAt: createdAt,
    expiresAt: createdAt + ttl,
  }
}

/** A mismatch never consumes the permit; the intended operation may still use it. */
export function contextPermitDecision(permit, {
  sessionId,
  point,
  projectedCost,
  now = Date.now(),
} = {}) {
  if (!permit || typeof permit !== 'object' || permit.status !== 'issued') {
    return { use: false, reason: 'no-unused-permit' }
  }
  if (permit.sessionId !== String(sessionId ?? '')) return { use: false, reason: 'another-session' }
  if (permit.point !== positiveInt(point)) return { use: false, reason: 'another-point' }
  if (!(Number(now) < Number(permit.expiresAt))) return { use: false, reason: 'expired' }
  const projected = positiveInt(Math.ceil(Number(projectedCost)))
  if (projected === null) return { use: false, reason: 'no-projected-cost' }
  if (projected > permit.maxTokens) return { use: false, reason: 'cost-exceeds-permit' }
  return { use: true, reason: 'matched' }
}

export function consumedPermitRecord(permit, {
  at,
  reading,
  projectedCost,
  caller,
  toolUseId,
} = {}) {
  return {
    v: CONTEXT_FENCE_PERMIT_VERSION,
    event: 'consumed',
    permitId: permit.id,
    timestamp: new Date(at).toISOString(),
    sessionId: permit.sessionId,
    point: permit.point,
    repositoryHead: permit.head,
    reading: typeof reading?.tokens === 'number' ? reading.tokens : null,
    projectedCost,
    maxTokens: permit.maxTokens,
    reason: permit.reason,
    caller: caller ?? null,
    toolUseId: String(toolUseId ?? '').trim() || null,
    actualResult: null,
  }
}

export function permitResultRecord(pending, { at, response } = {}) {
  const value = response ?? null
  let rendered = ''
  try {
    rendered = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    rendered = '[unserializable tool response]'
  }
  const exitCode = value && typeof value === 'object'
    ? (value.exit_code ?? value.exitCode ?? value.status ?? null)
    : null
  const isError = value && typeof value === 'object'
    ? (value.is_error === true || value.isError === true)
    : false
  return {
    v: CONTEXT_FENCE_PERMIT_VERSION,
    event: 'result',
    permitId: pending.permitId,
    timestamp: new Date(at).toISOString(),
    sessionId: pending.sessionId,
    point: pending.point,
    toolUseId: pending.toolUseId ?? null,
    actualResult: {
      outcome: isError ? 'error' : 'completed',
      exitCode,
      responseChars: rendered.length,
      // The record remains short even before point 597 enforces tool-output
      // caps; this excerpt is evidence, not a second copy of the result.
      excerpt: rendered.slice(0, 500),
      truncated: rendered.length > 500,
    },
  }
}
