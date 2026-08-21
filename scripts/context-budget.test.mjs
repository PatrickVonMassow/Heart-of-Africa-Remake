import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { admitContextCall, contextLedgerPath, inspectContextCall, readPendingLedger } from './context-budget.mjs'
import { issueContextPermit } from './context-fence-permit.mjs'
import { CONTEXT_SESSION_CLASS } from './session-context-ceiling-core.mjs'

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
const SERIES = { byKind: [{ kind: 'browser-suite', p: 10 }, { kind: 'read', p: 10 }, { kind: 'agent', p: 20 }] }
const call = (overrides = {}) => ({
  sessionId: 's',
  point: 745,
  reading: { tokens: 100, at: 1 },
  ceiling: 140,
  handoverReserve: 10,
  series: SERIES,
  toolName: 'Bash',
  toolInput: { command: 'npm test' },
  caller: { toolName: 'Bash', command: 'npm test' },
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

  it.each(Object.values(CONTEXT_SESSION_CLASS))('a permit admits exactly one refused %s call', (sessionClass) => {
    const paths = fixture()
    issueContextPermit(
      { sessionId: 's', point: 745, reason: 'one emergency call', maxTokens: 10 },
      { ...paths.permitPaths, now: () => 1_000, id: () => `p-${sessionClass}`, head: () => 'abc' },
    )
    const admittedPaths = { ...paths, permitPaths: { ...paths.permitPaths, now: () => 1_001 } }
    expect(admitContextCall(call({
      sessionClass,
      mode: 'armed',
      reading: { tokens: 125, at: 1 },
    }), admittedPaths)).toMatchObject({ block: false, permitted: true })
    expect(admitContextCall(call({
      sessionClass,
      mode: 'armed',
      reading: { tokens: 125, at: 1 },
      toolUseId: 'tool-2',
    }), admittedPaths)).toMatchObject({ block: true, permitted: false })
  })

  it('books a large read even when it cannot fit, but never refuses it', () => {
    const paths = fixture()
    const result = admitContextCall(call({
      mode: 'armed',
      reading: { tokens: 125, at: 1 },
      toolName: 'Read',
      toolInput: { file_path: 'large.log' },
      caller: { toolName: 'Read', filePath: 'large.log' },
    }), paths)
    expect(result).toMatchObject({
      block: false,
      observed: false,
      sessionPolicy: { conversationSafe: true },
      decision: { fits: false, kind: 'read' },
      ledger: { pendingDebit: 10 },
    })
  })

  it('keeps inherited parent and subagent pending debits in separate ledgers', () => {
    const paths = fixture()
    const base = resolve(dirname(paths.ledgerPath), 'legacy-ledger.json')
    const ownerId = 'parent-session'
    const agentId = `${ownerId}:agent:agent-a`
    const ownerPaths = { ...paths, ledgerPath: contextLedgerPath(ownerId, base) }
    const agentPaths = { ...paths, ledgerPath: contextLedgerPath(agentId, base) }
    expect(admitContextCall(call({ sessionId: ownerId, mode: 'armed' }), ownerPaths).ledger.pendingDebit).toBe(10)
    expect(admitContextCall(call({ sessionId: agentId, mode: 'armed' }), agentPaths).ledger.pendingDebit).toBe(10)
    expect(admitContextCall(call({ sessionId: ownerId, mode: 'armed', toolUseId: 'owner-2' }), ownerPaths).ledger.pendingDebit).toBe(20)
    expect(readPendingLedger(agentPaths.ledgerPath, agentId).pendingDebit).toBe(10)
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
        decisions.push({
          ...operation,
          state: result.decision.state,
          block: result.block,
          conversationSafe: result.sessionPolicy.conversationSafe,
        })
      }
    }

    expect(replay.source).toMatchObject({
      sessionId: '63489989-2725-4d31-9914-c9dac17b4280',
      date: '2026-08-19',
      handoverTokens: 311_039,
    })
    expect(decisions.find((entry) => entry.block)?.id).toBe('36.2')
    expect(decisions.filter((entry) => entry.block).map((entry) => entry.id)).toEqual(['36.2', '141.1'])
    expect(decisions.find((entry) => entry.id === '128.1')).toMatchObject({
      toolName: 'Read',
      state: 'insufficient',
      block: false,
      conversationSafe: true,
    })
    const exits = decisions.filter((entry) => entry.exit)
    expect(exits.map((entry) => entry.id)).toEqual(['135.1', '182.1', '201.1', '216.1', '229.1', '231.1'])
    expect(exits.every((entry) => entry.state === 'exempt' && entry.block === false)).toBe(true)
    expect(decisions.filter((entry) => entry.block && entry.exit)).toEqual([])
  })
})

describe('inspectContextCall status projection', () => {
  it('quotes the same pending debit its own arithmetic used', () => {
    const paths = fixture()
    admitContextCall(call({ mode: 'observe' }), paths)
    const seen = inspectContextCall(call(), { ledgerPath: paths.ledgerPath })
    expect(seen.ledger.pendingDebit).toBe(10)
    expect(seen.decision.pendingDebit).toBe(10)
    expect(seen.decision.handoverReserve).toBe(10)
    expect(seen.decision.remainingBeforeCall).toBe(140 - 100 - 10 - 10)
  })

  it('books nothing — a status call must not spend the budget it reports', () => {
    const paths = fixture()
    admitContextCall(call({ mode: 'observe' }), paths)
    inspectContextCall(call(), { ledgerPath: paths.ledgerPath })
    inspectContextCall(call(), { ledgerPath: paths.ledgerPath })
    expect(readPendingLedger(paths.ledgerPath, 's').pendingDebit).toBe(10)
  })
})
