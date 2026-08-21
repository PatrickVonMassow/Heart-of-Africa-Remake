// PRE-CALL CONTEXT ADMISSION — the pure arithmetic shared by every fence call.
//
// The transcript reading is one completed API call behind the operation being
// judged. A pending-debit ledger therefore carries projected growth until a
// newer complete reading includes it. The handover reserve is withheld before
// the first ordinary call, and every non-exempt call with a measured kind cost
// is judged against the same remainder — reads included.
import {
  expandSegments,
  gitSubcommand,
  headAndArgs,
  segmentInvokesScript,
} from './command-classify-core.mjs'
import { CALL_KINDS, callKind, summarizeSeries } from './context-incidents-core.mjs'
import { classifyFenceCall } from './context-fence-core.mjs'
import {
  CONTEXT_CEILING_TOKENS,
  CONTEXT_HANDOVER_RESERVE_TOKENS,
} from './context-watermark-core.mjs'

/**
 * Control operations whose output is bounded by construction. This is an
 * enumerated set, not "everything which is not a start": an ordinary Read or
 * shell call never becomes exempt merely because the old fence allowed it.
 * Point 597 enforces the output bounds; until then these are the exact assumed
 * bounded controls named by the work order.
 */
export const BOUNDED_CONTROL_OPERATIONS = Object.freeze({
  'git-commit': Object.freeze({
    reason: 'commit output is the bounded repository receipt for work already completed',
  }),
  'git-push': Object.freeze({
    reason: 'push output is the bounded remote receipt for work already completed',
  }),
  board: Object.freeze({
    reason: 'board calls return a bounded bookkeeping receipt',
  }),
  'board-publish': Object.freeze({
    reason: 'board publication returns a bounded transport receipt',
  }),
  'focus-stamp': Object.freeze({
    reason: 'focus set/confirm returns one bounded stamp receipt',
  }),
  boundary: Object.freeze({
    reason: 'the boundary is the reserved, bounded exit path',
  }),
})

const CONTROL_SCRIPTS = Object.freeze({
  board: ['board.mjs'],
  'board-publish': ['board-publish.mjs'],
  boundary: ['batch-boundary.mjs'],
})

function boundedSegmentId(segment) {
  const { head, args } = headAndArgs(segment)
  if (head === 'git') {
    const sub = gitSubcommand(segment)
    if (sub === 'commit') return 'git-commit'
    if (sub === 'push') return 'git-push'
  }
  for (const [id, scripts] of Object.entries(CONTROL_SCRIPTS)) {
    if (segmentInvokesScript(segment, scripts)) return id
  }
  if (segmentInvokesScript(segment, ['focus.mjs'])) {
    const words = (args ?? []).map((arg) => String(arg?.text ?? arg))
    if (words.some((word) => word === 'set' || word === 'confirm')) return 'focus-stamp'
  }
  return null
}

/**
 * Return the bounded controls performed by a shell call, or null. Every real
 * segment must be bounded: `git commit && npm test` is an admitted test call,
 * not a commit exemption covering the rest of the line.
 */
export function boundedControlCall({ toolName = '', command = '' } = {}) {
  if (!['Bash', 'PowerShell'].includes(String(toolName))) return null
  const segments = expandSegments(String(command ?? ''))
  if (!segments.length) return null
  const ids = segments.map(boundedSegmentId)
  if (ids.some((id) => !id)) return null
  const unique = [...new Set(ids)]
  return {
    ids: unique,
    reasons: unique.map((id) => BOUNDED_CONTROL_OPERATIONS[id].reason),
  }
}

/** Point 742's p90 cost for one kind, read from its series summary. */
export function seriesKindCost(series, kind) {
  let byKind = series?.byKind
  if (!Array.isArray(byKind) && Array.isArray(series?.records)) {
    byKind = summarizeSeries(series.records).byKind
  } else if (!Array.isArray(byKind) && Array.isArray(series)) {
    byKind = summarizeSeries(series).byKind
  }
  const row = Array.isArray(byKind) ? byKind.find((entry) => entry?.kind === kind) : null
  return typeof row?.p === 'number' && Number.isFinite(row.p) && row.p > 0
    ? Math.ceil(row.p)
    : null
}

/** The identity of the complete API reading a pending debit belongs to. */
export function readingIdentity(reading) {
  if (!reading || typeof reading.tokens !== 'number' || !Number.isFinite(reading.tokens) || reading.tokens <= 0) {
    return null
  }
  return `${reading.tokens}:${typeof reading.at === 'number' && Number.isFinite(reading.at) ? reading.at : ''}`
}

export function emptyPendingLedger(sessionId = '') {
  return {
    v: 1,
    sessionId: String(sessionId ?? ''),
    readingId: null,
    readingTokens: null,
    pendingDebit: 0,
    unknownTypeCostFirings: 0,
  }
}

/**
 * Carry debits while the reading is unchanged; clear them when the next
 * complete reading arrives, because its measured input now includes the calls
 * previously represented by those projections. A session change always starts
 * a new ledger.
 */
export function reconcilePendingLedger(ledger, { sessionId = '', reading = null } = {}) {
  const sid = String(sessionId ?? '')
  const base = ledger?.sessionId === sid ? { ...emptyPendingLedger(sid), ...ledger, sessionId: sid } : emptyPendingLedger(sid)
  const id = readingIdentity(reading)
  if (id === null) return { ledger: base, reconciled: false, actualGrowth: null }
  if (base.readingId === id) return { ledger: base, reconciled: false, actualGrowth: null }
  const priorTokens = typeof base.readingTokens === 'number' ? base.readingTokens : null
  return {
    ledger: {
      ...base,
      readingId: id,
      readingTokens: reading.tokens,
      pendingDebit: 0,
    },
    reconciled: base.readingId !== null,
    actualGrowth: priorTokens === null ? null : reading.tokens - priorTokens,
  }
}

/** Book one operation the current mode actually admits. */
export function bookPendingDebit(ledger, projectedCost) {
  const debit = typeof projectedCost === 'number' && Number.isFinite(projectedCost) && projectedCost > 0
    ? Math.ceil(projectedCost)
    : 0
  return { ...ledger, pendingDebit: Math.max(0, Number(ledger?.pendingDebit) || 0) + debit }
}

export function countUnknownTypeCost(ledger) {
  return {
    ...ledger,
    unknownTypeCostFirings: Math.max(0, Number(ledger?.unknownTypeCostFirings) || 0) + 1,
  }
}

/**
 * Does this call fit while preserving the exit? PURE.
 *
 * `series` is point 742's series (or its `summarizeSeries` result), and
 * `pendingDebit` is the reconciled per-reading ledger balance. The result's
 * `fits` is the arithmetic permit; observation/armed mode is deliberately a
 * caller concern.
 */
export function remainingBudgetDecision({
  ceiling = CONTEXT_CEILING_TOKENS,
  reading = null,
  series = null,
  handoverReserve = CONTEXT_HANDOVER_RESERVE_TOKENS,
  pendingDebit = 0,
  toolName = '',
  toolInput = null,
  resolvePath,
  isDirectory,
} = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const command = typeof input.command === 'string' ? input.command : ''
  const filePath = input.file_path ?? input.notebook_path
  const exempt = boundedControlCall({ toolName, command })
  const limit = typeof ceiling === 'number' && Number.isFinite(ceiling) && ceiling > 0
    ? ceiling
    : CONTEXT_CEILING_TOKENS
  const reserve = typeof handoverReserve === 'number' && Number.isFinite(handoverReserve) && handoverReserve >= 0
    ? handoverReserve
    : CONTEXT_HANDOVER_RESERVE_TOKENS
  const pending = typeof pendingDebit === 'number' && Number.isFinite(pendingDebit) && pendingDebit > 0
    ? pendingDebit
    : 0

  if (exempt) {
    return {
      state: 'exempt',
      fits: true,
      alert: false,
      book: false,
      exempt,
      kind: null,
      projectedCost: 0,
      remainingBeforeCall: null,
      remainingAfterCall: null,
      unknownTypeCost: false,
    }
  }

  const readingId = readingIdentity(reading)
  if (readingId === null) {
    return {
      state: 'unreadable',
      fits: true,
      alert: true,
      book: false,
      exempt: null,
      kind: null,
      projectedCost: null,
      remainingBeforeCall: null,
      remainingAfterCall: null,
      unknownTypeCost: false,
    }
  }

  const tool = String(toolName ?? '').trim()
  if (!tool) {
    return {
      state: 'unclassified',
      fits: true,
      alert: false,
      book: false,
      exempt: null,
      kind: null,
      projectedCost: null,
      remainingBeforeCall: limit - reading.tokens - pending - reserve,
      remainingAfterCall: null,
      unknownTypeCost: false,
    }
  }

  const kind = callKind({ name: tool, input })
  const measuredCost = seriesKindCost(series, kind)
  const start = classifyFenceCall({ toolName: tool, command, filePath, resolvePath, isDirectory })
  const unknownTypeCost = measuredCost === null && start.starts
  // One conservative emergency brake remains beside the measured arithmetic:
  // an already-classified START without a cost can consume the whole ceiling,
  // which cannot fit after the handover reserve and therefore refuses armed
  // mode. Unknown non-starts keep the explicit fail-open direction.
  const projectedCost = measuredCost ?? (unknownTypeCost ? limit : null)
  const remainingBeforeCall = limit - reading.tokens - pending - reserve

  if (projectedCost === null) {
    return {
      state: 'unclassified',
      fits: true,
      alert: false,
      book: false,
      exempt: null,
      kind,
      projectedCost: null,
      remainingBeforeCall,
      remainingAfterCall: null,
      unknownTypeCost: false,
    }
  }

  const remainingAfterCall = remainingBeforeCall - projectedCost
  return {
    state: remainingAfterCall >= 0 ? 'fit' : 'insufficient',
    fits: remainingAfterCall >= 0,
    alert: false,
    book: true,
    exempt: null,
    kind,
    projectedCost,
    remainingBeforeCall,
    remainingAfterCall,
    unknownTypeCost,
  }
}

export { CALL_KINDS }
