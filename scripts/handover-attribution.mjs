// Fail-open runtime recorder for the outgoing boundary and successor ramp.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'
import { gatherWatermark } from './context-watermark.mjs'
import {
  HANDOVER_ATTRIBUTION_STATUS,
  HANDOVER_ATTRIBUTION_V,
  addHandoverAttributionCheckpoint,
  beginHandoverAttribution,
  exitStageForCall,
  rampStageForCall,
} from './handover-attribution-core.mjs'

export const HANDOVER_ATTRIBUTION_STATE_PATH = repoPath('.claude/handover-attribution.json')
export const HANDOVER_ATTRIBUTION_SERIES_PATH = repoPath('.claude/handover-attribution.jsonl')
export const AUTOSTART_LAST_PATH = repoPath('.claude/autostart-last.json')

export function readHandoverAttributionState(path = HANDOVER_ATTRIBUTION_STATE_PATH) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return value?.v === HANDOVER_ATTRIBUTION_V ? value : null
  } catch {
    return null
  }
}

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function persist(result, {
  statePath = HANDOVER_ATTRIBUTION_STATE_PATH,
  seriesPath = HANDOVER_ATTRIBUTION_SERIES_PATH,
  append = appendFileSync,
  makeDir = mkdirSync,
  write = writeJsonAtomic,
  say = console.error,
} = {}) {
  if (!result?.state) return { written: false, reason: 'invalid', state: null, record: null }
  if (!result.record) return { written: true, reason: 'already-recorded', state: result.state, record: null }
  try {
    makeDir(dirname(seriesPath), { recursive: true })
    append(seriesPath, `${JSON.stringify(result.record)}\n`)
    write(statePath, result.state)
    return { written: true, reason: 'recorded', ...result }
  } catch (error) {
    say(`WARNING: handover stage ${result.record.stage} could not be attributed (${error?.message ?? error}); the boundary stands.`)
    return { written: false, reason: 'write-failed', ...result, error }
  }
}

function reading({ sessionId, transcriptPath = '' } = {}) {
  const measured = gatherWatermark({ sid: sessionId, transcriptPath })
  return {
    tokens: measured.state === 'unreadable' ? null : measured.tokens,
    transcript: measured.transcript ?? String(transcriptPath ?? ''),
  }
}

/** The existing Stop refusal is the zero point for the outgoing exit. */
export function noteHandoverAttributionDemand(input = {}, {
  read = readHandoverAttributionState,
  ...io
} = {}) {
  try {
    return persist(beginHandoverAttribution({ ...input, current: read(io.statePath) }), io)
  } catch (error) {
    io.say?.(`WARNING: the handover attribution baseline failed (${error?.message ?? error}); the boundary stands.`)
    return { written: false, reason: 'read-failed', state: null, record: null, error }
  }
}

function noteCheckpoint(input, { read = readHandoverAttributionState, ...io } = {}) {
  try {
    const state = read(io.statePath)
    return persist(addHandoverAttributionCheckpoint({ state, ...input }), io)
  } catch (error) {
    io.say?.(`WARNING: handover stage ${input.stage} could not be attributed (${error?.message ?? error}); the boundary stands.`)
    return { written: false, reason: 'read-failed', state: null, record: null, error }
  }
}

export function noteHandoverAttributionPrepare(input = {}, io = {}) {
  const { read = readHandoverAttributionState, ...writes } = io
  try {
    let state = read(writes.statePath)
    const sid = String(input.sessionId ?? '').trim()
    if (!state || state.predecessorSessionId !== sid || state.status === HANDOVER_ATTRIBUTION_STATUS.COMPLETE) {
      // A directly invoked prepare has no observed Stop refusal. Record that
      // missing baseline explicitly instead of losing the whole boundary run.
      const begun = beginHandoverAttribution({
        sessionId: sid,
        tokens: null,
        at: input.at,
        cause: input.cause,
        point: input.point,
        transcript: input.transcript,
      })
      const persisted = persist(begun, writes)
      state = persisted.state
    }
    return persist(addHandoverAttributionCheckpoint({
      state,
      ...input,
      side: 'exit',
      stage: 'exit.prepare',
      status: HANDOVER_ATTRIBUTION_STATUS.PREPARED,
    }), writes)
  } catch (error) {
    writes.say?.(`WARNING: handover stage exit.prepare could not be attributed (${error?.message ?? error}); the boundary stands.`)
    return { written: false, reason: 'read-failed', state: null, record: null, error }
  }
}

export function noteHandoverAttributionCommit(input = {}, io = {}) {
  return noteCheckpoint({
    ...input,
    side: 'exit',
    stage: 'exit.commit',
    status: HANDOVER_ATTRIBUTION_STATUS.COMMITTED,
  }, io)
}

/** Timestamp the owning successor at SessionStart, after ownership is proven. */
export function noteHandoverAttributionSuccessorStart(input = {}, {
  read = readHandoverAttributionState,
  readAutostart = () => readJson(AUTOSTART_LAST_PATH),
  readTokens = reading,
  ...io
} = {}) {
  try {
    let state = read(io.statePath)
    const sid = String(input.sessionId ?? '').trim()
    if (
      !sid ||
      !state ||
      state.status !== HANDOVER_ATTRIBUTION_STATUS.COMMITTED ||
      state.predecessorSessionId === sid
    ) return { written: false, reason: 'no-committed-handover', records: [] }

    const at = typeof input.at === 'number' && Number.isFinite(input.at) ? input.at : Date.now()
    const fresh = state.destination === 'fresh-session'
    const transcriptPath = String(input.transcript ?? input.transcriptPath ?? '')
    const measured = fresh ? (readTokens({ sessionId: sid, transcriptPath }) ?? {}) : {}
    const launch = fresh ? (input.launch ?? readAutostart()) : null
    const spawnAt =
      typeof launch?.at === 'number' && launch.at >= state.committedAt && launch.at <= at
        ? launch.at
        : null
    const records = []
    const save = (checkpoint) => {
      const result = persist(addHandoverAttributionCheckpoint({ state, ...checkpoint }), io)
      if (result.state) state = result.state
      if (result.record) records.push(result.record)
      return result
    }
    save({
      sessionId: state.predecessorSessionId,
      side: 'idle',
      stage: fresh ? 'idle.launcher' : 'idle.claim-reservation',
      at: spawnAt ?? at,
      readingRequired: false,
      metadata: fresh
        ? { spawnAt, spawnToken: launch?.spawnToken ?? null, spawnReading: spawnAt === null ? 'missing' : 'measured' }
        : { destination: state.destination ?? null },
    })
    const result = save({
      sessionId: sid,
      side: 'ramp',
      stage: 'ramp.session-start',
      tokens: fresh ? measured.tokens : null,
      baseline: fresh,
      at,
      transcript: measured.transcript ?? transcriptPath,
      status: HANDOVER_ATTRIBUTION_STATUS.RAMPING,
      metadata: { freshSession: fresh },
    })
    return { written: result.written, reason: result.reason, records }
  } catch (error) {
    io.say?.(`WARNING: successor start could not be attributed (${error?.message ?? error}); the boundary stands.`)
    return { written: false, reason: 'read-failed', records: [], error }
  }
}

/**
 * Attribute one completed tool call. Before commit it is an exit checkpoint;
 * after commit another owning session begins the ramp and the first work call
 * seals it. All writes are evidence-only and fail open.
 */
export function observeHandoverAttributionCall(hookInput = {}, {
  ownsBatch = false,
  now = Date.now(),
  read = readHandoverAttributionState,
  readTokens = reading,
  readAutostart = () => readJson(AUTOSTART_LAST_PATH),
  ...io
} = {}) {
  if (!ownsBatch) return { written: false, reason: 'not-owner', records: [] }
  const sid = String(hookInput.session_id ?? hookInput.sessionId ?? '').trim()
  if (!sid) return { written: false, reason: 'missing-session', records: [] }
  let state = read(io.statePath)
  if (!state || state.status === HANDOVER_ATTRIBUTION_STATUS.COMPLETE) {
    return { written: false, reason: 'no-active-handover', records: [] }
  }
  const transcriptPath = hookInput.transcript_path ?? hookInput.transcriptPath ?? ''
  const toolInput = hookInput.tool_input ?? hookInput.toolInput ?? {}
  const call = {
    toolName: hookInput.tool_name ?? hookInput.toolName ?? '',
    toolInput,
    command: toolInput.command ?? '',
    filePath: toolInput.file_path ?? toolInput.notebook_path ?? '',
  }
  let measured = null
  const measure = () => {
    if (measured === null) measured = readTokens({ sessionId: sid, transcriptPath }) ?? {}
    return measured
  }
  const records = []
  const save = (input) => {
    const result = persist(addHandoverAttributionCheckpoint({ state, ...input }), io)
    if (result.state) state = result.state
    if (result.record) records.push(result.record)
    return result
  }

  if (sid === state.predecessorSessionId) {
    if (state.status !== HANDOVER_ATTRIBUTION_STATUS.PREPARED) {
      return { written: false, reason: 'exit-not-prepared', records: [] }
    }
    const stage = exitStageForCall(call)
    if (!stage) return { written: false, reason: 'cli-recorded-prepare', records: [] }
    const reading = measure()
    const result = save({
      sessionId: sid,
      side: 'exit',
      stage,
      tokens: reading.tokens,
      at: now,
      transcript: reading.transcript ?? transcriptPath,
      metadata: { tool: call.toolName || null, command: call.command || null },
    })
    return { written: result.written, reason: result.reason, records }
  }

  if (state.status === HANDOVER_ATTRIBUTION_STATUS.COMMITTED) {
    const reading = measure()
    const fresh = state.destination === 'fresh-session'
    const launch = fresh ? readAutostart() : null
    const spawnAt =
      typeof launch?.at === 'number' && launch.at >= state.committedAt && launch.at <= now
        ? launch.at
        : null
    save({
      sessionId: state.predecessorSessionId,
      side: 'idle',
      stage: fresh ? 'idle.launcher' : 'idle.claim-reservation',
      at: spawnAt ?? now,
      readingRequired: false,
      metadata: fresh
        ? { spawnAt, spawnToken: launch?.spawnToken ?? null, spawnReading: spawnAt === null ? 'missing' : 'measured' }
        : { destination: state.destination ?? null },
    })
    save({
      sessionId: sid,
      side: 'ramp',
      stage: 'ramp.session-start',
      tokens: fresh ? reading.tokens : null,
      baseline: fresh,
      at: spawnAt ?? now,
      transcript: reading.transcript ?? transcriptPath,
      status: HANDOVER_ATTRIBUTION_STATUS.RAMPING,
      metadata: { freshSession: fresh },
    })
  }

  if (state.status !== HANDOVER_ATTRIBUTION_STATUS.RAMPING || state.successorSessionId !== sid) {
    return { written: records.length > 0, reason: 'successor-not-ramping', records }
  }
  const reading = measure()
  const stage = rampStageForCall(call)
  const result = save({
    sessionId: sid,
    side: 'ramp',
    stage,
    tokens: reading.tokens,
    at: now,
    transcript: reading.transcript ?? transcriptPath,
    status: stage === 'ramp.first-work-call' ? HANDOVER_ATTRIBUTION_STATUS.COMPLETE : HANDOVER_ATTRIBUTION_STATUS.RAMPING,
    metadata: { tool: call.toolName || null, command: call.command || null },
  })
  return { written: result.written, reason: result.reason, records }
}
