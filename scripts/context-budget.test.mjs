import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { admitContextCall, readPendingLedger } from './context-budget.mjs'
import { issueContextPermit } from './context-fence-permit.mjs'

const roots = []
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true })
})

const fixture = () => {
  const root = mkdtempSync(resolve(tmpdir(), 'hoa-context-budget-state-'))
  roots.push(root)
  return {
    ledgerPath: resolve(root, 'ledger.json'),
    ledgerLockPath: resolve(root, 'ledger.lock'),
    permitPaths: {
      path: resolve(root, 'permit.json'),
      pendingPath: resolve(root, 'permit-pending.json'),
      recordPath: resolve(root, 'permits.jsonl'),
      lockPath: resolve(root, 'permit.lock'),
    },
  }
}
const SERIES = { byKind: [{ kind: 'read', p: 10 }, { kind: 'agent', p: 20 }] }
const call = (overrides = {}) => ({
  sessionId: 's',
  point: 745,
  reading: { tokens: 100, at: 1 },
  ceiling: 140,
  handoverReserve: 10,
  series: SERIES,
  toolName: 'Read',
  toolInput: { file_path: 'large.log' },
  caller: { toolName: 'Read', filePath: 'large.log' },
  toolUseId: 'tool-1',
  ...overrides,
})

describe('admitContextCall runtime transaction', () => {
  it('serializes every admitted call into the pending ledger', () => {
    const paths = fixture()
    expect(admitContextCall(call({ mode: 'armed' }), paths)).toMatchObject({ block: false })
    expect(admitContextCall(call({ mode: 'armed', toolUseId: 'tool-2' }), paths)).toMatchObject({ block: false })
    expect(admitContextCall(call({ mode: 'armed', toolUseId: 'tool-3' }), paths)).toMatchObject({ block: false })
    expect(readPendingLedger(paths.ledgerPath, 's').pendingDebit).toBe(30)
    expect(admitContextCall(call({ mode: 'armed', toolUseId: 'tool-4' }), paths)).toMatchObject({
      block: true,
      decision: { remainingBeforeCall: 0 },
    })
    expect(readPendingLedger(paths.ledgerPath, 's').pendingDebit).toBe(30)
  })

  it('observation mode books an operation it would have refused', () => {
    const paths = fixture()
    const result = admitContextCall(call({ mode: 'observe', reading: { tokens: 125, at: 1 } }), paths)
    expect(result).toMatchObject({ block: false, observed: true, permitted: false })
    expect(result.ledger.pendingDebit).toBe(10)
  })

  it('an armed refusal consumes one matching permit and books the admitted operation', () => {
    const paths = fixture()
    issueContextPermit(
      { sessionId: 's', point: 745, reason: 'finish once', maxTokens: 10 },
      { ...paths.permitPaths, now: () => 1_000, id: () => 'p', head: () => 'abc' },
    )
    const admittedPaths = { ...paths, permitPaths: { ...paths.permitPaths, now: () => 1_001 } }
    const result = admitContextCall(call({ mode: 'armed', reading: { tokens: 125, at: 1 } }), admittedPaths)
    expect(result).toMatchObject({ block: false, observed: true, permitted: true })
    expect(result.ledger.pendingDebit).toBe(10)
    expect(admitContextCall(call({ mode: 'armed', reading: { tokens: 125, at: 1 }, toolUseId: 'tool-2' }), admittedPaths)).toMatchObject({
      block: true,
      permitted: false,
    })
  })

  it('counts an unknown classified start even when armed mode refuses it', () => {
    const paths = fixture()
    const result = admitContextCall(call({ mode: 'armed', series: { byKind: [] }, toolName: 'Agent', toolInput: {} }), paths)
    expect(result).toMatchObject({ block: true, decision: { unknownTypeCost: true } })
    expect(result.ledger.unknownTypeCostFirings).toBe(1)
    expect(result.ledger.pendingDebit).toBe(0)
  })

  it('replays the reduced 19.08 session at the first unaffordable call and never refuses its exit', () => {
    const replay = JSON.parse(readFileSync(
      resolve(process.cwd(), 'scripts', 'fixtures', 'context-budget-2026-08-19-replay.json'),
      'utf8',
    ))
    const paths = fixture()
    const decisions = []
    for (const apiCall of replay.calls) {
      for (const operation of apiCall.operations) {
        const result = admitContextCall({
          sessionId: replay.source.sessionId,
          point: 745,
          reading: { tokens: apiCall.tokens, at: Date.parse(apiCall.at) },
          ceiling: 150_000,
          handoverReserve: 28_000,
          series: replay.series,
          mode: 'armed',
          toolName: operation.toolName,
          toolInput: operation.toolInput,
          caller: { toolName: operation.toolName, ...operation.toolInput },
          toolUseId: operation.id,
        }, paths)
        decisions.push({ ...operation, state: result.decision.state, block: result.block })
      }
    }

    expect(replay.source).toMatchObject({
      sessionId: '63489989-2725-4d31-9914-c9dac17b4280',
      date: '2026-08-19',
      handoverTokens: 311_039,
    })
    expect(decisions.find((entry) => entry.block)?.id).toBe('36.2')
    expect(decisions.filter((entry) => entry.block).map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['36.2', '128.1', '141.1']),
    )
    const exits = decisions.filter((entry) => entry.exit)
    expect(exits.map((entry) => entry.id)).toEqual(['135.1', '182.1', '201.1', '216.1', '229.1', '231.1'])
    expect(exits.every((entry) => entry.state === 'exempt' && entry.block === false)).toBe(true)
    expect(decisions.filter((entry) => entry.block && entry.exit)).toEqual([])
  })
})
