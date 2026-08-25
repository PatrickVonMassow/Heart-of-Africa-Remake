import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  noteHandoverAttributionCommit,
  noteHandoverAttributionDemand,
  noteHandoverAttributionPrepare,
  noteHandoverAttributionSuccessorStart,
  observeHandoverAttributionCall,
} from './handover-attribution.mjs'

const OLD = 'outgoing-752'
const NEXT = 'successor-752'

function memoryIo() {
  let state = null
  const lines = []
  const warnings = []
  return {
    get state() { return state },
    lines,
    warnings,
    io: {
      read: () => state,
      write: (_path, value) => { state = value },
      append: (_path, line) => lines.push(JSON.parse(line)),
      makeDir: () => {},
      say: (line) => warnings.push(line),
    },
  }
}

describe('live handover attribution', () => {
  it('records every exit and ramp stage through the first work-bearing call', () => {
    const memory = memoryIo()
    expect(noteHandoverAttributionDemand(
      { sessionId: OLD, tokens: 100_000, at: 1_000, cause: 'point', point: 752, transcript: '/old.jsonl' },
      memory.io,
    ).written).toBe(true)
    noteHandoverAttributionPrepare(
      { sessionId: OLD, tokens: 101_000, at: 2_000, transcript: '/old.jsonl', destination: 'fresh-session' },
      memory.io,
    )
    const observeExit = (command, tokens, now) => observeHandoverAttributionCall(
      { session_id: OLD, transcript_path: '/old.jsonl', tool_name: 'Bash', tool_input: { command } },
      { ...memory.io, ownsBatch: true, now, readTokens: () => ({ tokens, transcript: '/old.jsonl' }) },
    )
    observeExit('node scripts/board.mjs none', 102_000, 3_000)
    observeExit('node scripts/board-publish.mjs', 103_000, 4_000)
    noteHandoverAttributionCommit(
      { sessionId: OLD, tokens: 104_000, at: 5_000, transcript: '/old.jsonl', destination: 'fresh-session' },
      memory.io,
    )
    noteHandoverAttributionSuccessorStart(
      { sessionId: NEXT, at: 6_500, launch: { at: 6_000, spawnToken: 'spawn-1' } },
      memory.io,
    )

    const observeRamp = (command, tokens, now) => observeHandoverAttributionCall(
      { session_id: NEXT, transcript_path: '/next.jsonl', tool_name: 'Bash', tool_input: { command } },
      {
        ...memory.io,
        ownsBatch: true,
        now,
        readTokens: () => ({ tokens, transcript: '/next.jsonl' }),
      },
    )
    observeRamp('git status --short --branch', 8_000, 7_000)
    observeRamp('node scripts/point-brief.mjs 753', 10_000, 8_000)
    observeRamp('npm run test:unit', 11_500, 9_000)

    expect(memory.lines.map((line) => line.stage)).toEqual([
      'exit.boundary-demanded', 'exit.prepare', 'exit.board-card', 'exit.board-publish', 'exit.commit',
      'idle.launcher', 'ramp.session-start', 'ramp.orientation', 'ramp.brief', 'ramp.first-work-call',
    ])
    expect(new Set(memory.lines.map((line) => line.recordId)).size).toBe(memory.lines.length)
    expect(memory.lines.find((line) => line.stage === 'idle.launcher')).toMatchObject({
      elapsedMs: 1_000,
      reading: 'not-applicable',
      metadata: { spawnAt: 6_000, spawnReading: 'measured', spawnToken: 'spawn-1' },
    })
    expect(memory.lines.find((line) => line.stage === 'ramp.orientation')).toMatchObject({
      elapsedMs: 500, tokens: 8_000, tokenDelta: 8_000, reading: 'measured',
    })
    expect(memory.lines.find((line) => line.stage === 'ramp.session-start')).toMatchObject({ elapsedMs: 500 })
    expect(memory.state).toMatchObject({ status: 'complete', successorSessionId: NEXT })
  })

  it('is wired at the demand, both boundary phases, and the existing all-tools hook', () => {
    const source = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')
    const progress = source('./batch-progress-guard.mjs')
    const boundary = source('./batch-boundary.mjs')
    const heartbeat = source('./lock-heartbeat-hook.mjs')
    const resume = source('./batch-resume-hook.mjs')
    expect(progress).toMatch(/block-take-boundary[\s\S]*noteHandoverAttributionDemand/)
    expect(progress).toMatch(/block-context-handover[\s\S]*noteHandoverAttributionDemand/)
    expect(boundary.match(/noteHandoverAttributionPrepare\(/g)).toHaveLength(2)
    expect(boundary.match(/noteHandoverAttributionCommit\(/g)).toHaveLength(2)
    expect(boundary.match(/at: committedMarker\.at/g)).toHaveLength(2)
    expect(heartbeat).toMatch(/observeHandoverAttributionCall\(data, \{ ownsBatch: ownsBatch && !attributionPaused/)
    expect(resume).toMatch(/ownsBatch\(ownership\)[\s\S]*noteHandoverAttributionSuccessorStart/)
  })

  it('reports an unavailable claim-window baseline rather than inventing its token cost', () => {
    const memory = memoryIo()
    noteHandoverAttributionDemand({ sessionId: OLD, tokens: 100, at: 1, cause: 'context' }, memory.io)
    noteHandoverAttributionPrepare({ sessionId: OLD, tokens: 110, at: 2 }, memory.io)
    noteHandoverAttributionCommit(
      { sessionId: OLD, tokens: 120, at: 3, destination: 'claiming-window' },
      memory.io,
    )
    observeHandoverAttributionCall(
      { session_id: NEXT, tool_name: 'Edit', tool_input: { file_path: '/workspace/hoa/src/App.tsx' } },
      { ...memory.io, ownsBatch: true, now: 10, readTokens: () => ({ tokens: 5_000, transcript: '/claim.jsonl' }) },
    )
    expect(memory.lines.slice(-3)).toMatchObject([
      { stage: 'idle.claim-reservation', elapsedMs: 7, reading: 'not-applicable' },
      { stage: 'ramp.session-start', reading: 'missing', missingReading: 'stage-token-reading' },
      { stage: 'ramp.first-work-call', reading: 'missing', missingReading: 'stage-token-baseline' },
    ])
    expect(memory.state.status).toBe('complete')
  })

  it('keeps a directly invoked prepare but reports that its demand baseline was not observed', () => {
    const memory = memoryIo()
    noteHandoverAttributionPrepare(
      { sessionId: OLD, tokens: 110, at: 2, cause: 'point', point: 752 },
      memory.io,
    )
    expect(memory.lines).toMatchObject([
      { stage: 'exit.boundary-demanded', reading: 'missing', missingReading: 'boundary-demand-token-reading' },
      { stage: 'exit.prepare', reading: 'missing', missingReading: 'stage-token-baseline' },
    ])
    expect(memory.state).toMatchObject({ status: 'prepared', cause: 'point', point: 752 })
  })

  it('stands down for a non-owner and never lets an unwritable series break the boundary', () => {
    const memory = memoryIo()
    noteHandoverAttributionDemand({ sessionId: OLD, tokens: 100, at: 1 }, memory.io)
    expect(observeHandoverAttributionCall(
      { session_id: OLD, tool_name: 'Bash', tool_input: { command: 'git status' } },
      { ...memory.io, ownsBatch: false },
    )).toMatchObject({ written: false, reason: 'not-owner', records: [] })
    expect(() => noteHandoverAttributionPrepare(
      { sessionId: OLD, tokens: 110, at: 2 },
      { ...memory.io, append: () => { throw new Error('series unavailable') } },
    )).not.toThrow()
    expect(memory.warnings.join('\n')).toMatch(/WARNING.*boundary stands/)
  })
})
