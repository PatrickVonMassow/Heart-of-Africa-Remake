import { describe, expect, it } from 'vitest'
import {
  HANDOVER_ATTRIBUTION_STATUS,
  addHandoverAttributionCheckpoint,
  beginHandoverAttribution,
  exitStageForCall,
  rampStageForCall,
} from './handover-attribution-core.mjs'

const SID = 'outgoing-752'

function fixtureBoundaryRun() {
  const records = []
  let result = beginHandoverAttribution({ sessionId: SID, tokens: 100_000, at: 1_000, cause: 'point', point: 752 })
  records.push(result.record)
  let state = result.state
  const step = (input) => {
    result = addHandoverAttributionCheckpoint({ state, ...input })
    state = result.state
    records.push(result.record)
  }
  step({ sessionId: SID, side: 'exit', stage: 'exit.prepare', tokens: 101_000, at: 2_000, status: HANDOVER_ATTRIBUTION_STATUS.PREPARED })
  step({ sessionId: SID, side: 'exit', stage: 'exit.board-card', tokens: 102_500, at: 3_500 })
  step({ sessionId: SID, side: 'exit', stage: 'exit.board-publish', tokens: 103_000, at: 4_000 })
  step({ sessionId: SID, side: 'exit', stage: 'exit.commit', tokens: 104_000, at: 5_000, status: HANDOVER_ATTRIBUTION_STATUS.COMMITTED })
  step({ sessionId: SID, side: 'idle', stage: 'idle.launcher', at: 6_500, readingRequired: false })
  step({ sessionId: 'successor-752', side: 'ramp', stage: 'ramp.session-start', tokens: 0, at: 7_000, status: HANDOVER_ATTRIBUTION_STATUS.RAMPING })
  step({ sessionId: 'successor-752', side: 'ramp', stage: 'ramp.queue', tokens: 8_000, at: 8_000 })
  step({ sessionId: 'successor-752', side: 'ramp', stage: 'ramp.brief', tokens: 10_000, at: 9_000 })
  step({ sessionId: 'successor-752', side: 'ramp', stage: 'ramp.first-work-call', tokens: 11_500, at: 10_000, status: HANDOVER_ATTRIBUTION_STATUS.COMPLETE })
  return { records, state }
}

describe('per-step handover attribution', () => {
  it('a fixture boundary run yields one reading per stage, with elapsed time beside it', () => {
    const { records, state } = fixtureBoundaryRun()
    expect(records.map((record) => record.stage)).toEqual([
      'exit.boundary-demanded', 'exit.prepare', 'exit.board-card', 'exit.board-publish', 'exit.commit',
      'idle.launcher', 'ramp.session-start', 'ramp.queue', 'ramp.brief', 'ramp.first-work-call',
    ])
    expect(records.slice(1).map((record) => record.elapsedMs)).toEqual([1_000, 1_500, 500, 1_000, 1_500, 500, 1_000, 1_000, 1_000])
    expect(records.filter((record) => record.reading === 'measured').map((record) => record.tokenDelta)).toEqual([
      1_000, 1_500, 500, 1_000, 8_000, 2_000, 1_500,
    ])
    expect(records.find((record) => record.stage === 'idle.launcher')).toMatchObject({
      reading: 'not-applicable', tokens: null, tokenDelta: null,
    })
    expect(state.status).toBe(HANDOVER_ATTRIBUTION_STATUS.COMPLETE)
  })

  it('reports a missing stage reading and a falling reading instead of silently omitting them', () => {
    const begun = beginHandoverAttribution({ sessionId: SID, tokens: 100, at: 1 })
    const missing = addHandoverAttributionCheckpoint({
      state: begun.state, sessionId: SID, side: 'exit', stage: 'exit.prepare', tokens: null, at: 2,
    })
    expect(missing.record).toMatchObject({ reading: 'missing', missingReading: 'stage-token-reading', tokens: null, tokenDelta: null })
    const falling = addHandoverAttributionCheckpoint({
      state: begun.state, sessionId: SID, side: 'exit', stage: 'exit.prepare', tokens: 99, at: 2,
    })
    expect(falling.record).toMatchObject({ reading: 'missing', missingReading: 'token-reading-decreased', tokens: 99, tokenDelta: null })
  })

  it('does not move the baseline when the same refusal repeats', () => {
    const begun = beginHandoverAttribution({ sessionId: SID, tokens: 100, at: 1 })
    expect(beginHandoverAttribution({ current: begun.state, sessionId: SID, tokens: 120, at: 2 })).toEqual({
      state: begun.state,
      record: null,
    })
  })
})

describe('boundary-call classification', () => {
  it.each([
    ['node scripts/board.mjs none', 'exit.board-card'],
    ['node scripts/board-publish.mjs', 'exit.board-publish'],
    ['node scripts/guard-preflight.mjs --for answer', 'exit.preflight'],
    ['node scripts/batch-in-flight.mjs --status', 'exit.carrier'],
    ['git status --short', 'exit.bookkeeping-call'],
  ])('attributes %s to %s', (command, stage) => {
    expect(exitStageForCall({ command })).toBe(stage)
  })

  it('leaves prepare to the CLI and identifies a failed commit attempt', () => {
    expect(exitStageForCall({ command: 'node scripts/batch-boundary.mjs --prepare 752' })).toBeNull()
    expect(exitStageForCall({ command: 'node scripts/batch-boundary.mjs --commit 752' })).toBe('exit.commit-attempt')
  })
})

describe('successor ramp classification', () => {
  it.each([
    ['node scripts/batch-in-flight.mjs --adopt', '', 'ramp.adoption'],
    ['node scripts/board-first-guard.mjs --status', '', 'ramp.board-first'],
    ['node scripts/point-brief.mjs 752', '', 'ramp.brief'],
    ['rg -n "^- \\[ \\]" TASKS.md', '', 'ramp.queue'],
    ['git status --short --branch', '', 'ramp.orientation'],
    ['', '/workspace/hoa/TASKS.md', 'ramp.queue'],
    ['npm run test:unit', '', 'ramp.first-work-call'],
  ])('classifies command %s and path %s as %s', (command, filePath, stage) => {
    expect(rampStageForCall({ command, filePath })).toBe(stage)
  })
})
