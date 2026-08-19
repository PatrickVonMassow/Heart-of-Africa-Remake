// THE BOUNDARY'S SIDE OF THE OVERSHOOT SERIES (point 742).
//
// The boundary printed its distance to the ceiling and forgot it, so after the
// context fence was armed nobody could say whether overshoots still happened.
// It now appends an incident record — and THE HANDOVER MATTERS MORE THAN THE
// BOOKKEEPING: a boundary that failed because a JSONL append failed would strand
// the batch, which is a far worse defect than a missing record. These cases pin
// that the record is taken on the SAME condition the printed note uses, against
// the cost CEILING, and that nothing it can do reaches the caller.
import { describe, it, expect } from 'vitest'
import { boundaryContextDistanceNote, recordBoundaryOvershoot } from './batch-boundary.mjs'
import { CONTEXT_CEILING_TOKENS, CONTEXT_MARGIN_TOKENS } from './context-watermark-core.mjs'
import { shouldRecordIncident } from './context-incidents-core.mjs'

const capture = (fn) => {
  const said = []
  const log = console.log
  console.log = (msg) => said.push(String(msg))
  try {
    return { result: fn(), said: said.join('\n') }
  } finally {
    console.log = log
  }
}

describe('recordBoundaryOvershoot — measured against the cost ceiling', () => {
  it('hands the recorder the ceiling, the margin and what the session was doing', () => {
    const seen = []
    recordBoundaryOvershoot({
      tokens: 311_039,
      cause: 'point',
      sid: 'sid-1',
      point: 742,
      transcript: '/tmp/t.jsonl',
      note: (opts) => {
        seen.push(opts)
        return { written: true }
      },
    })
    expect(seen[0]).toMatchObject({
      tokens: 311_039,
      sessionId: 'sid-1',
      point: 742,
      cause: 'point',
      transcriptPath: '/tmp/t.jsonl',
      // The overshoot is judged against the COST CEILING, never the lower
      // admission trigger — admission and overshoot are two different questions.
      ceiling: CONTEXT_CEILING_TOKENS,
      margin: CONTEXT_MARGIN_TOKENS,
    })
  })

  it('THE CARE: a throwing recorder cannot fail the boundary', () => {
    const { result, said } = capture(() =>
      recordBoundaryOvershoot({
        tokens: 311_039,
        cause: 'context',
        sid: 'sid-2',
        note: () => {
          throw new Error('the series file is a directory')
        },
      }),
    )
    expect(result).toMatchObject({ written: false, reason: 'write-failed' })
    expect(said).toMatch(/WARNING/)
    expect(said).toMatch(/the boundary stands/)
  })
})

describe('ONE condition, two consumers', () => {
  const record = (tokens) =>
    shouldRecordIncident({ tokens, ceiling: CONTEXT_CEILING_TOKENS, margin: CONTEXT_MARGIN_TOKENS })

  it('inside the stated margin: no printed note, no record', () => {
    const tokens = CONTEXT_CEILING_TOKENS + CONTEXT_MARGIN_TOKENS
    expect(boundaryContextDistanceNote(tokens)).toBeNull()
    expect(record(tokens)).toBe(false)
  })

  it('beyond it: the note is owed AND the incident is recorded', () => {
    const tokens = CONTEXT_CEILING_TOKENS + CONTEXT_MARGIN_TOKENS + 1
    expect(boundaryContextDistanceNote(tokens)).toMatch(/PAST THE/)
    expect(record(tokens)).toBe(true)
  })

  it('an UNMEASURED boundary owes the note but records nothing — a record is a measurement', () => {
    expect(boundaryContextDistanceNote(null)).toMatch(/NO CONTEXT READING/)
    expect(record(null)).toBe(false)
  })
})
