import { describe, expect, it } from 'vitest'
import {
  CLAIM_CLEAN_TURN_LIMIT,
  REPAIR_COMMIT_ORDINARY_MAX,
  advanceClaimSurvival,
  detectRepairLoop,
  guardMechanisms,
  latestAssistantTurnKey,
} from './handover-repair-loop-core.mjs'

const CLEAR = 'scripts/clear-claim-guard.mjs'
const CORE = 'scripts/clear-claim-guard-core.mjs'
const TEST = 'scripts/clear-claim-guard.test.mjs'

// The point's shared fixture: the claim recorded at 08:32 survived at least
// seven clean tool-response turns, while the owner produced the landing commit
// plus the seven repair commits named in the work order. Some commits touch only
// core/test or registration beside the wrapper; all belong to the same family.
const MEASURED_20_AUGUST = Object.freeze({
  claimKey: 'd5fcb9cf:2026-08-20T06:32:00.000Z',
  turns: ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5', 'turn-6', 'turn-7'],
  commits: [
    { sha: 'fdd8c394', at: '10:37', paths: [CORE, TEST] },
    { sha: '0f025d89', at: '10:27', paths: [CORE, CLEAR, TEST] },
    { sha: '25d1c3e7', at: '10:19', paths: [CORE, CLEAR, TEST] },
    { sha: '28c8e63d', at: '09:44', paths: [CORE, CLEAR, TEST] },
    { sha: '19efc9d5', at: '09:32', paths: [CORE, CLEAR, TEST] },
    { sha: 'a8f13c0d', at: '09:23', paths: [CORE, CLEAR, TEST] },
    {
      sha: '1ce35aef',
      at: '09:15',
      paths: [CLEAR, 'scripts/guard-preflight.mjs', 'scripts/guard-preflight-core.test.mjs'],
    },
    {
      sha: '99f467c6',
      at: '08:29',
      paths: [CLEAR, CORE, TEST, '.claude/settings.json', 'TASKS.md'],
    },
  ],
})

describe('claim survival across clean owner turns', () => {
  it('reports at the bounded clean turn and only once', () => {
    let state
    const reports = []
    for (const turnKey of MEASURED_20_AUGUST.turns) {
      const result = advanceClaimSurvival({
        state,
        claimKey: MEASURED_20_AUGUST.claimKey,
        turnKey,
        verdict: 'release',
        ownsBatch: true,
      })
      state = result.state
      if (result.report) reports.push(result.count)
    }
    expect(reports).toEqual([CLAIM_CLEAN_TURN_LIMIT])
    expect(state.cleanTurns).toBe(7)
  })

  it('does not count parallel tool calls from the same assistant response', () => {
    const first = advanceClaimSurvival({
      claimKey: 'claim-a',
      turnKey: 'message-a',
      verdict: 'release',
      ownsBatch: true,
    })
    const duplicate = advanceClaimSurvival({
      state: first.state,
      claimKey: 'claim-a',
      turnKey: 'message-a',
      verdict: 'release',
      ownsBatch: true,
    })
    expect(duplicate.count).toBe(1)
    expect(duplicate.report).toBe(false)
  })

  it('counts no dirty turn and stands down for non-owners and pauses', () => {
    const dirty = advanceClaimSurvival({
      claimKey: 'claim-a',
      turnKey: 'message-a',
      verdict: 'wait',
      ownsBatch: true,
    })
    expect(dirty.count).toBe(0)
    expect(advanceClaimSurvival({ ...dirty, ownsBatch: false }).state.cleanTurns).toBe(0)
    expect(advanceClaimSurvival({ ...dirty, ownsBatch: true, paused: true }).state.cleanTurns).toBe(0)
  })

  it('extracts one stable key for streamed rows and ignores torn JSONL', () => {
    const transcript = [
      JSON.stringify({ type: 'assistant', uuid: 'row-a', message: { id: 'msg-a' } }),
      '{torn',
      JSON.stringify({ type: 'user', uuid: 'row-b', message: { id: 'not-assistant' } }),
      JSON.stringify({ type: 'assistant', uuid: 'row-c', message: { id: 'msg-b' } }),
    ].join('\n')
    expect(latestAssistantTurnKey(transcript)).toBe('msg-b')
    expect(latestAssistantTurnKey('not json')).toBe('')
  })
})

describe('consecutive repairs of one guard mechanism', () => {
  it('reports the measured 20.08 sequence once, with its visible count', () => {
    const first = detectRepairLoop({ commits: MEASURED_20_AUGUST.commits })
    expect(first).toMatchObject({
      report: true,
      count: 8,
      mechanism: 'clear-claim-guard',
    })
    const nextTurn = detectRepairLoop({ commits: MEASURED_20_AUGUST.commits, state: first.state })
    expect(nextTurn.report).toBe(false)

    const ninth = {
      sha: 'later-fix',
      paths: [CORE],
    }
    expect(
      detectRepairLoop({ commits: [ninth, ...MEASURED_20_AUGUST.commits], state: first.state }).report,
    ).toBe(false)
  })

  it('leaves the measured ordinary range alone and reports the fifth commit', () => {
    const ordinary = MEASURED_20_AUGUST.commits.slice(0, REPAIR_COMMIT_ORDINARY_MAX)
    expect(detectRepairLoop({ commits: ordinary }).report).toBe(false)
    expect(detectRepairLoop({ commits: MEASURED_20_AUGUST.commits.slice(0, 5) })).toMatchObject({
      report: true,
      count: 5,
    })
  })

  it('normalises wrapper, core and test paths into one family', () => {
    expect(guardMechanisms([CLEAR, CORE, TEST, 'scripts/guard-preflight.mjs'])).toEqual([
      'clear-claim-guard',
    ])
  })

  it('breaks the run on a commit that does not touch the mechanism', () => {
    const commits = [
      ...MEASURED_20_AUGUST.commits.slice(0, 3),
      { sha: 'queue-work', paths: ['src/game.ts'] },
      ...MEASURED_20_AUGUST.commits.slice(3),
    ]
    expect(detectRepairLoop({ commits })).toMatchObject({ report: false, count: 3 })
  })
})
