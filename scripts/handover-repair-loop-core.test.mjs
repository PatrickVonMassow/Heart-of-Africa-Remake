import { describe, expect, it } from 'vitest'
import {
  CLAIM_CLEAN_TURN_LIMIT,
  REPAIR_COMMIT_ORDINARY_MAX,
  advanceClaimSurvival,
  detectRepairLoop,
  latestAssistantTurnKey,
  scriptMechanisms,
} from './handover-repair-loop-core.mjs'

const CLEAR = 'scripts/clear-claim-guard.mjs'
const CORE = 'scripts/clear-claim-guard-core.mjs'
const TEST = 'scripts/clear-claim-guard.test.mjs'

// The point's shared fixture: the claim recorded at 08:32 survived at least
// seven clean tool-response turns, while first-parent history records nine
// consecutive repair commits from 09:15 through 10:37. Some touch only core/test
// or registration beside the wrapper; all belong to the same family.
const MEASURED_20_AUGUST = Object.freeze({
  claimKey: 'd5fcb9cf:2026-08-20T06:32:00.000Z',
  turns: ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5', 'turn-6', 'turn-7'],
  commits: [
    { sha: 'fdd8c394', at: '10:37', paths: [CORE, TEST] },
    { sha: '0f025d89', at: '10:27', paths: [CORE, CLEAR, TEST] },
    { sha: '25d1c3e7', at: '10:19', paths: [CORE, CLEAR, TEST] },
    { sha: '72d832f3', at: '10:08', paths: [CORE, CLEAR, TEST] },
    { sha: 'c70f151c', at: '09:59', paths: [CORE, TEST] },
    { sha: '28c8e63d', at: '09:44', paths: [CORE, CLEAR, TEST] },
    { sha: '19efc9d5', at: '09:32', paths: [CORE, CLEAR, TEST] },
    { sha: 'a8f13c0d', at: '09:23', paths: [CORE, CLEAR, TEST] },
    {
      sha: '1ce35aef',
      at: '09:15',
      paths: [CLEAR, 'scripts/guard-preflight.mjs', 'scripts/guard-preflight-core.test.mjs'],
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
      if (result.report) reports.push([result.kind, result.count])
    }
    expect(reports).toEqual([['release', CLAIM_CLEAN_TURN_LIMIT]])
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
    let dirty
    for (const turnKey of ['message-a', 'message-b', 'message-c']) {
      dirty = advanceClaimSurvival({
        state: dirty?.state,
        claimKey: 'claim-a',
        turnKey,
        verdict: 'wait',
        ownsBatch: true,
      })
    }
    expect(dirty).toMatchObject({ count: 0, report: true, kind: 'reason' })
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

describe('consecutive repairs of one script mechanism', () => {
  it('reports the measured 20.08 sequence once, with its visible count', () => {
    const first = detectRepairLoop({ commits: MEASURED_20_AUGUST.commits })
    expect(first).toMatchObject({
      report: true,
      count: 9,
      mechanism: 'clear-claim-guard',
    })
    const nextTurn = detectRepairLoop({ commits: MEASURED_20_AUGUST.commits, state: first.state })
    expect(nextTurn.report).toBe(false)

    const laterRepair = {
      sha: 'later-fix',
      paths: [CORE],
    }
    expect(
      detectRepairLoop({ commits: [laterRepair, ...MEASURED_20_AUGUST.commits], state: first.state }).report,
    ).toBe(false)
  })

  it('leaves the measured ordinary range alone and reports the ninth commit', () => {
    const ordinary = MEASURED_20_AUGUST.commits.slice(0, REPAIR_COMMIT_ORDINARY_MAX)
    expect(detectRepairLoop({ commits: ordinary }).report).toBe(false)
    expect(detectRepairLoop({ commits: MEASURED_20_AUGUST.commits })).toMatchObject({
      report: true,
      count: 9,
    })
  })

  it('normalises plain, core, hook and test modules into one family', () => {
    expect(
      scriptMechanisms([
        'scripts/example.mjs',
        'scripts/example-core.mjs',
        'scripts/example-core.test.mjs',
        'scripts/example-hook.mjs',
        'scripts/example-hook.test.mjs',
        'scripts/example.test.mjs',
      ]),
    ).toEqual(['example'])
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
