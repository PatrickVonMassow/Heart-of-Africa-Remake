// Pure state machine for token- and elapsed-time attribution across one handover.

export const HANDOVER_ATTRIBUTION_V = 1

export const HANDOVER_ATTRIBUTION_STATUS = Object.freeze({
  DEMANDED: 'demanded',
  PREPARED: 'prepared',
  COMMITTED: 'committed',
  RAMPING: 'ramping',
  COMPLETE: 'complete',
})

const tokenReading = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

const timestamp = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : Date.now()

const positivePoint = (value) => {
  const point = Number(value)
  return Number.isInteger(point) && point > 0 ? point : null
}

function firstRecord({ boundaryId, sessionId, tokens, at, cause, point, transcript }) {
  const reading = tokenReading(tokens)
  return {
    v: HANDOVER_ATTRIBUTION_V,
    boundaryId,
    predecessorSessionId: sessionId,
    sessionId,
    side: 'exit',
    stage: 'exit.boundary-demanded',
    ordinal: 1,
    at,
    elapsedMs: 0,
    tokens: reading,
    tokenDelta: null,
    reading: reading === null ? 'missing' : 'baseline',
    ...(reading === null ? { missingReading: 'boundary-demand-token-reading' } : {}),
    cause: cause ?? null,
    point: positivePoint(point),
    transcript: String(transcript ?? ''),
  }
}

/** Preserve the first demand for one predecessor; a later session starts a run. PURE. */
export function beginHandoverAttribution({
  current = null,
  sessionId = '',
  tokens = null,
  at = Date.now(),
  cause = null,
  point = null,
  transcript = '',
} = {}) {
  const sid = String(sessionId ?? '').trim()
  if (!sid) return null
  if (
    current?.v === HANDOVER_ATTRIBUTION_V &&
    current.predecessorSessionId === sid &&
    current.status !== HANDOVER_ATTRIBUTION_STATUS.COMPLETE
  ) {
    return { state: current, record: null }
  }
  const startedAt = timestamp(at)
  const boundaryId = `${sid}:${startedAt}`
  const reading = tokenReading(tokens)
  const record = firstRecord({ boundaryId, sessionId: sid, tokens, at: startedAt, cause, point, transcript })
  return {
    state: {
      v: HANDOVER_ATTRIBUTION_V,
      boundaryId,
      predecessorSessionId: sid,
      successorSessionId: null,
      cause: cause ?? null,
      point: positivePoint(point),
      status: HANDOVER_ATTRIBUTION_STATUS.DEMANDED,
      ordinal: 1,
      startedAt,
      lastAt: startedAt,
      lastSessionId: sid,
      lastTokens: reading,
      committedAt: null,
      destination: null,
    },
    record,
  }
}

/** Add one checkpoint and put elapsed time beside its token reading. PURE. */
export function addHandoverAttributionCheckpoint({
  state,
  sessionId = '',
  side,
  stage,
  tokens = null,
  at = Date.now(),
  transcript = '',
  readingRequired = true,
  status = null,
  destination,
  metadata = null,
} = {}) {
  const sid = String(sessionId ?? '').trim()
  const name = String(stage ?? '').trim()
  if (state?.v !== HANDOVER_ATTRIBUTION_V || !sid || !name || !['exit', 'idle', 'ramp'].includes(side)) return null

  const measuredAt = timestamp(at)
  const currentTokens = readingRequired ? tokenReading(tokens) : null
  const sameTokenSeries = state.lastSessionId === sid
  const previousTokens = sameTokenSeries ? tokenReading(state.lastTokens) : null
  let reading = 'not-applicable'
  let missingReading = null
  let tokenDelta = null
  if (readingRequired) {
    if (currentTokens === null) {
      reading = 'missing'
      missingReading = 'stage-token-reading'
    } else if (previousTokens === null) {
      reading = 'missing'
      missingReading = 'stage-token-baseline'
    } else if (currentTokens < previousTokens) {
      reading = 'missing'
      missingReading = 'token-reading-decreased'
    } else {
      reading = 'measured'
      tokenDelta = currentTokens - previousTokens
    }
  }

  const ordinal = Number(state.ordinal) + 1
  const record = {
    v: HANDOVER_ATTRIBUTION_V,
    boundaryId: state.boundaryId,
    predecessorSessionId: state.predecessorSessionId,
    sessionId: sid,
    side,
    stage: name,
    ordinal,
    at: measuredAt,
    elapsedMs: Math.max(0, measuredAt - timestamp(state.lastAt)),
    tokens: currentTokens,
    tokenDelta,
    reading,
    ...(missingReading ? { missingReading } : {}),
    cause: state.cause ?? null,
    point: positivePoint(state.point),
    transcript: String(transcript ?? ''),
    ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
  }
  const next = {
    ...state,
    ordinal,
    lastAt: measuredAt,
    ...(readingRequired ? { lastSessionId: sid, lastTokens: currentTokens } : {}),
    ...(status ? { status } : {}),
    ...(destination !== undefined ? { destination: destination ?? null } : {}),
  }
  if (status === HANDOVER_ATTRIBUTION_STATUS.COMMITTED) next.committedAt = measuredAt
  if (side === 'ramp') next.successorSessionId = sid
  return { state: next, record }
}

const commandOf = (call = {}) => String(call.command ?? call.toolInput?.command ?? '').replace(/\\/g, '/').toLowerCase()
const pathOf = (call = {}) =>
  String(call.filePath ?? call.toolInput?.file_path ?? call.toolInput?.notebook_path ?? '').replace(/\\/g, '/').toLowerCase()

/** Which outgoing bookkeeping step did a completed tool call carry? PURE. */
export function exitStageForCall(call = {}) {
  const command = commandOf(call)
  if (/batch-boundary\.mjs\s+--prepare\b/.test(command)) return null // the CLI records its own measured checkpoint
  if (/batch-boundary\.mjs\s+--commit\b/.test(command)) return 'exit.commit-attempt'
  if (/board-publish\.mjs\b/.test(command)) return 'exit.board-publish'
  if (/(?:^|\/)board\.mjs\b/.test(command)) return 'exit.board-card'
  if (/guard-preflight\.mjs\b/.test(command)) return 'exit.preflight'
  if (/batch-in-flight\.mjs\b/.test(command)) return 'exit.carrier'
  return 'exit.bookkeeping-call'
}

/** Mechanical ramp calls stay attributed until the first work-bearing call. PURE. */
export function rampStageForCall(call = {}) {
  const command = commandOf(call)
  const path = pathOf(call)
  if (/batch-in-flight\.mjs\b/.test(command)) return 'ramp.adoption'
  if (/(?:board-first|board-publish|dashboard|board)\S*\.mjs\b/.test(command)) return 'ramp.board-first'
  if (/point-brief\.mjs\b/.test(command) || /point-brief/.test(path)) return 'ramp.brief'
  if (/\btasks\.md\b|docs\/tasks-archive\.md/.test(command) || /\/(?:tasks\.md|tasks-archive\.md)$/.test(path)) return 'ramp.queue'
  if (
    /(?:^|(?:&&|\|\||;)\s*)git\s+(?:status|branch|rev-parse)\b/.test(command) ||
    /worktree-bootstrap\.mjs\b/.test(command)
  ) return 'ramp.orientation'
  return 'ramp.first-work-call'
}
