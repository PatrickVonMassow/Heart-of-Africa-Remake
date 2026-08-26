import { describe, expect, it } from 'vitest'
import { CONTEXT_HANDOVER_RESERVE_TOKENS } from './context-watermark-core.mjs'
import { noteHandoverBudgetStart, recordHandoverBudgetCompletion } from './handover-budget.mjs'

const SID = 'owner-744'
const start = { v: 1, sessionId: SID, startTokens: 111_000, startedAt: 1 }

describe('handover budget evidence is fail-open', () => {
  it('writes the first refusal once', () => {
    const written = []
    expect(noteHandoverBudgetStart(
      { sessionId: SID, tokens: 111_000, at: 1 },
      { path: '/runtime/start.json', read: () => null, write: (path, value) => written.push({ path, value }) },
    )).toMatchObject({ written: true, reason: 'recorded' })
    expect(written).toHaveLength(1)

    expect(noteHandoverBudgetStart(
      { sessionId: SID, tokens: 120_000, at: 2 },
      { path: '/runtime/start.json', read: () => start, write: () => { throw new Error('must not rewrite') } },
    )).toMatchObject({ written: true, reason: 'already-recorded', record: start })
  })

  it('completes an over-cap boundary and appends the overrun', () => {
    const lines = []
    const said = []
    const result = recordHandoverBudgetCompletion(
      { sessionId: SID, tokens: 111_000 + CONTEXT_HANDOVER_RESERVE_TOKENS + 7, cause: 'context', at: 2 },
      {
        read: () => start,
        makeDir: () => {},
        append: (_path, line) => lines.push(JSON.parse(line)),
        say: (line) => said.push(line),
      },
    )
    expect(result).toMatchObject({ written: true, reason: 'overrun' })
    expect(lines).toMatchObject([{ exceeded: true, overrunTokens: 7 }])
    expect(said.join('\n')).toContain('HANDOVER CAP EXCEEDED')
    expect(said.join('\n')).toContain('boundary stands')
  })

  it('never throws when even the overrun series is unwritable', () => {
    const said = []
    expect(() => recordHandoverBudgetCompletion(
      { sessionId: SID, tokens: 200_000 },
      {
        read: () => start,
        makeDir: () => {},
        append: () => { throw new Error('series is a directory') },
        say: (line) => said.push(line),
      },
    )).not.toThrow()
    expect(said.join('\n')).toMatch(/WARNING.*boundary stands/s)
  })
})
