// Pure arithmetic for the measured handover cap: first refusal to committed boundary.
import { CONTEXT_HANDOVER_RESERVE_TOKENS } from './context-watermark-core.mjs'

export const HANDOVER_BUDGET_RECORD_V = 1

const positive = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

/** Preserve the first measured refusal for one owner session. PURE. */
export function handoverBudgetStart({ current = null, sessionId = '', tokens = null, at = Date.now() } = {}) {
  const sid = String(sessionId ?? '').trim()
  const reading = positive(tokens)
  if (!sid || reading === null) return null
  if (
    current?.v === HANDOVER_BUDGET_RECORD_V &&
    current.sessionId === sid &&
    positive(current.startTokens) !== null
  ) {
    return current
  }
  return {
    v: HANDOVER_BUDGET_RECORD_V,
    sessionId: sid,
    startTokens: reading,
    startedAt: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
  }
}

/** Measure a completed exit against the reserved cap. PURE. */
export function handoverBudgetCompletion({
  start = null,
  sessionId = '',
  tokens = null,
  at = Date.now(),
  cause = null,
  point = null,
  transcript = '',
  cap = CONTEXT_HANDOVER_RESERVE_TOKENS,
} = {}) {
  const sid = String(sessionId ?? '').trim()
  const beginning = positive(start?.startTokens)
  const ending = positive(tokens)
  const limit = positive(cap)
  if (
    !sid ||
    start?.v !== HANDOVER_BUDGET_RECORD_V ||
    start.sessionId !== sid ||
    beginning === null ||
    ending === null ||
    ending < beginning ||
    limit === null
  ) {
    return null
  }
  const costTokens = ending - beginning
  const overrunTokens = Math.max(0, costTokens - limit)
  return {
    v: HANDOVER_BUDGET_RECORD_V,
    sessionId: sid,
    cause: cause ?? null,
    point: Number.isInteger(Number(point)) && Number(point) > 0 ? Number(point) : null,
    transcript: String(transcript ?? ''),
    startTokens: beginning,
    endTokens: ending,
    costTokens,
    capTokens: limit,
    exceeded: overrunTokens > 0,
    overrunTokens,
    startedAt: Number.isFinite(Number(start.startedAt)) ? Number(start.startedAt) : null,
    completedAt: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
  }
}
