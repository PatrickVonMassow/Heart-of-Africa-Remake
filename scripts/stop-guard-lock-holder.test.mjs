// Stop guards that impose BATCH DUTIES apply only to the session holding the
// batch lock (`ownsLock(sessionId).mine`). Measured 21.10.2026: with the lock
// free or dead, `heldByOtherLiveOwner` read "nobody else" and two chat sessions
// were held in endless Stop loops by duties that were never theirs.
//
// Each gather runs against a fixture lock through the REAL `ownsLock` (only its
// lock path and process ancestry are pinned), with git, network and file writes
// recorded, so a stand-down that did any of that work fails here.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync as realWriteFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const fixture = vi.hoisted(() => ({ lockPath: '', ancestor: null, calls: [] }))

vi.mock('./batch-singleton.mjs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ownsLock: (sessionId, opts = {}) =>
      actual.ownsLock(sessionId, { ...opts, lockPath: fixture.lockPath, ancestor: fixture.ancestor }),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal()
  const blocked = (name) => (...args) => {
    fixture.calls.push(`${name} ${String(args[0]).slice(0, 60)}`)
    throw new Error(`${name} is blocked in this test`)
  }
  return {
    ...actual,
    exec: blocked('exec'),
    execSync: blocked('execSync'),
    execFile: blocked('execFile'),
    execFileSync: blocked('execFileSync'),
    spawn: blocked('spawn'),
    spawnSync: blocked('spawnSync'),
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  const recorded = (name) => (...args) => {
    fixture.calls.push(`${name} ${String(args[0])}`)
    return actual[name](...args)
  }
  const fs = {
    ...actual,
    // A paused batch would stand every guard down first and hide the ownership answer.
    existsSync: (p) => (String(p).endsWith('batch-paused') ? false : actual.existsSync(p)),
    writeFileSync: recorded('writeFileSync'),
    renameSync: recorded('renameSync'),
    mkdirSync: recorded('mkdirSync'),
    appendFileSync: recorded('appendFileSync'),
    rmSync: recorded('rmSync'),
    unlinkSync: recorded('unlinkSync'),
  }
  return { ...fs, default: fs }
})

const { gatherPushArrivalInputs } = await import('./push-arrival-guard.mjs')
const { gatherCiStatusInputs } = await import('./ci-status-guard.mjs')
const { gatherDashboardInputs } = await import('./dashboard-guard.mjs')
const { gatherDashboardIntegrityInputs } = await import('./dashboard-integrity-guard.mjs')
const { gatherDecisionCardCondition } = await import('./decision-card-guard.mjs')
const { gatherRetroCurrencyInputs } = await import('./retro-currency-guard.mjs')
const { gatherDashboardSyncInputs } = await import('./dashboard-sync.mjs')
const { gatherDashboardConcisenessInputs } = await import('./dashboard-conciseness-guard.mjs')
const { gatherDashboardCardTopicInputs } = await import('./dashboard-card-topic-guard.mjs')
const { gatherQueueOrderInputs } = await import('./queue-order-guard.mjs')
const { gatherPrepInputs } = await import('./prep-guard.mjs')
const { gatherBundleFirstInputs } = await import('./bundle-first-guard.mjs')
const { gatherGuideBrevityInputs } = await import('./guide-brevity-guard.mjs')
const { gatherRuleReviewInputs } = await import('./rule-review-guard.mjs')
const { gatherGuardHealthInputs } = await import('./guard-health-guard.mjs')
const { gatherBranchHygiene } = await import('./branch-hygiene-guard.mjs')
const { gatherTasksSpecInputs } = await import('./tasks-spec-guard.mjs')
const { gatherRenderVerifyInputs } = await import('./render-verify-guard.mjs')

const dir = mkdtempSync(join(tmpdir(), 'stop-guard-lock-holder-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const ME = 'session-me'
const NOW = Date.now()
const DEAD_PID = 2 ** 22 + 4321 // above Linux pid_max: never a live process
const lockFile = (name, body) => {
  const path = join(dir, name)
  realWriteFileSync(path, typeof body === 'string' ? body : JSON.stringify(body))
  return path
}
const lockOf = (sessionId, pid) => ({ sessionId, claimedAt: NOW, pid, pidStartedAt: NOW - 1000 })

/** The ownership situations; `owner` is what the guard must conclude. */
const SITUATIONS = [
  { name: 'no lock', lock: null, sessionId: ME, owner: false },
  { name: 'unreadable lock', lock: '{not json', sessionId: ME, owner: false },
  { name: 'dead foreign owner', lock: lockOf('other', DEAD_PID), sessionId: ME, owner: false },
  { name: 'live foreign owner', lock: lockOf('other', process.pid), sessionId: ME, owner: false },
  { name: 'missing session id', lock: lockOf(ME, process.pid), sessionId: '', owner: false },
  { name: 'own lock', lock: lockOf(ME, process.pid), sessionId: ME, owner: true },
  {
    // A compaction renamed the session; the lock still names the old id but
    // the same claude process — ownership by process identity stays.
    name: 'process identity (compaction)',
    lock: lockOf('pre-compaction-id', process.pid),
    sessionId: ME,
    ancestor: { pid: process.pid, startedAt: NOW - 1000 },
    owner: true,
  },
]

function arrange(situation, index) {
  fixture.lockPath = situation.lock === null ? join(dir, `absent-${index}.json`) : lockFile(`lock-${index}.json`, situation.lock)
  fixture.ancestor = situation.ancestor ?? null
  fixture.calls.length = 0
}

let fetchSpy
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    fixture.calls.push('fetch')
    throw new Error('network is blocked in this test')
  })
  return () => fetchSpy.mockRestore()
})

/** The gather's answer, or the error it threw once past the gate. */
async function run(gather, situation) {
  try {
    return await gather(situation.sessionId, situation)
  } catch (error) {
    return { threw: error }
  }
}

const isOwnershipStandDown = (r) => r?.applicable === false && r.cause === 'not-lock-owner'

/** One describe per switched guard: every non-owner situation stands down with
 *  no git, network or write; the owner passes the gate. */
function describeLockHolderOnly(name, gather) {
  describe(`${name} applies only to the batch-lock holder`, () => {
    SITUATIONS.forEach((situation, index) => {
      it(`${situation.name} → ${situation.owner ? 'applicable' : 'not applicable, no work'}`, async () => {
        arrange(situation, index)
        const result = await run(gather, situation)
        if (situation.owner) {
          expect(isOwnershipStandDown(result), JSON.stringify(result)).toBe(false)
        } else {
          expect(result).toMatchObject({ applicable: false, cause: 'not-lock-owner' })
          expect(result.why).toBe('this session does not hold the batch lock')
          expect(fixture.calls).toEqual([])
        }
      })
    })
  })
}

describeLockHolderOnly('push-arrival-guard', (sessionId) => gatherPushArrivalInputs({ sessionId }))
// The owner case runs read-only so passing the gate can never write CI state;
// the stand-down cases run the Stop hook's own (writing) mode.
describeLockHolderOnly('ci-status-guard', (sessionId, { owner }) => gatherCiStatusInputs({ sessionId, readOnly: owner }))

describeLockHolderOnly('dashboard-guard', (sessionId) => gatherDashboardInputs({ sessionId }))
describeLockHolderOnly('dashboard-integrity-guard', (sessionId) => gatherDashboardIntegrityInputs({ sessionId }))
describeLockHolderOnly('retro-currency-guard', (sessionId) => gatherRetroCurrencyInputs({ sessionId }))
// The board is handed in, so the owner case needs no checkout board.
describeLockHolderOnly('decision-card-guard', (sessionId) =>
  gatherDecisionCardCondition({ sessionId, dashboardExists: true, dashboardHtml: '<html></html>' }),
)

// The further batch-duty Stop guards: board, queue, work order, prep, rule and
// guide upkeep, guard health, branch hygiene and the render-verify gate.
describeLockHolderOnly('dashboard-sync', (sessionId) => gatherDashboardSyncInputs({ sessionId }))
describeLockHolderOnly('dashboard-conciseness-guard', (sessionId) => gatherDashboardConcisenessInputs({ sessionId }))
describeLockHolderOnly('dashboard-card-topic-guard', (sessionId) => gatherDashboardCardTopicInputs({ sessionId }))
describeLockHolderOnly('queue-order-guard', (sessionId) => gatherQueueOrderInputs({ sessionId }))
describeLockHolderOnly('prep-guard', (sessionId) => gatherPrepInputs({ sessionId }))
describeLockHolderOnly('bundle-first-guard', (sessionId) => gatherBundleFirstInputs({ sessionId }))
describeLockHolderOnly('guide-brevity-guard', (sessionId) => gatherGuideBrevityInputs({ sessionId }))
describeLockHolderOnly('rule-review-guard', (sessionId) => gatherRuleReviewInputs({ sessionId }))
describeLockHolderOnly('guard-health-guard', (sessionId) => gatherGuardHealthInputs({ sessionId }))
describeLockHolderOnly('branch-hygiene-guard', (sessionId) => gatherBranchHygiene({ sessionId }))
describeLockHolderOnly('tasks-spec-guard', (sessionId) => gatherTasksSpecInputs({ sessionId }))
describeLockHolderOnly('render-verify-guard', (sessionId) => gatherRenderVerifyInputs({ sessionId }))

describe('decision-card-guard Stop hook', () => {
  // The hook body runs only as a script, so its order is pinned on the source:
  // the ownership exit precedes every state read and write, and no non-owner
  // branch survives behind it (measured 21.10.2026 17:04: card reviews were
  // demanded from a chat session while another session held the batch).
  const source = readFileSync(resolve(process.cwd(), 'scripts', 'decision-card-guard.mjs'), 'utf8')
  const hook = source.slice(source.indexOf('if (isMainModule(import.meta.url))'))

  it('leaves before any state work unless this session holds the lock', () => {
    const exit = hook.indexOf('if (!ownsLock(sessionId).mine) process.exit(0)')
    expect(exit).toBeGreaterThan(0)
    for (const work of ['readDecisionCardState()', 'writeDecisionCardState(', 'readVdzkAnswers()', 'writeVdzkAnswers(']) {
      expect(exit, work).toBeLessThan(hook.indexOf(work))
    }
    expect(source).not.toMatch(/heldByOtherLiveOwner|nonOwner/)
  })
})

describe('the harness', () => {
  it('really intercepts git work once a guard passes the gate', async () => {
    arrange(SITUATIONS.find((s) => s.name === 'own lock'), 'harness')
    gatherPushArrivalInputs({ sessionId: ME })
    expect(fixture.calls.some((c) => c.startsWith('execSync git'))).toBe(true)
  })
})

describe('push-arrival-guard --status stays diagnostic', () => {
  it('answers for a non-owner when ownership is ignored', async () => {
    arrange(SITUATIONS[0], 'status')
    expect(gatherPushArrivalInputs({ sessionId: ME, ignoreOwnership: true }).applicable).toBe(true)
  })
})
