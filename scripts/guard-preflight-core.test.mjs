// The guard preflight (point 365 D): does it report what a guard WOULD do,
// without running the guard — and does it keep sharing the wrapper's input
// gathering? The second half is the load-bearing one: the cores are pure, but
// each wrapper does the I/O, and a reimplementation of that gathering would
// drift and hand back a false "clean". These tests fail if anyone replaces a
// wrapper's gather step with a local copy.
import { describe, it, expect } from 'vitest'
import {
  ACTIONS,
  STATUS,
  formatPreflightReport,
  isKnownAction,
  normaliseVerdict,
  runPreflight,
  selectGuards,
  summarise,
} from './guard-preflight-core.mjs'
import { GUARDS } from './guard-preflight.mjs'
import { isMainModule } from './is-main.mjs'

import { gatherDashboardInputs } from './dashboard-guard.mjs'
import { gatherTasksSpecInputs } from './tasks-spec-guard.mjs'
import { gatherTasksArchiveInputs } from './tasks-archive-guard.mjs'
import { gatherQueueOrderInputs } from './queue-order-guard.mjs'
import { gatherDocBudgetInputs } from './doc-budget-guard.mjs'
import { gatherModelGuardInputs } from './model-guard.mjs'
import { gatherRenderVerifyInputs } from './render-verify-guard.mjs'
import { evaluate as tasksSpecEvaluate } from './tasks-spec-guard-core.mjs'
import { evaluate as queueOrderEvaluate } from './queue-order-guard-core.mjs'
import { evaluate as dashboardEvaluate } from './dashboard-guard-core.mjs'
import { evaluate as renderVerifyEvaluate } from './render-verify-core.mjs'
import { findForbiddenCommits } from './model-guard-core.mjs'

/** A guard whose gathering and decision are visible to the test. */
const fakeGuard = (id, gathered, verdict, calls = []) => ({
  id,
  gather: (opts) => {
    calls.push({ id, opts })
    return gathered
  },
  decide: (inputs) => verdict(inputs),
})

describe('runPreflight', () => {
  it('reports a state a guard WOULD block on, without the guard running', () => {
    // The decide step is the guard's own pure core; nothing here executes the
    // wrapper, writes state or ends a turn.
    const results = runPreflight([
      fakeGuard('x-guard', { applicable: true, inputs: { bad: true } }, ({ bad }) => ({
        block: bad,
        reason: 'X is out of sync',
      })),
    ])
    expect(results).toEqual([{ id: 'x-guard', status: STATUS.block, reason: 'X is out of sync' }])
  })

  it('reports clean on a good state', () => {
    const results = runPreflight([
      fakeGuard('x-guard', { applicable: true, inputs: { bad: false } }, ({ bad }) => ({
        block: bad,
        reason: '',
      })),
    ])
    expect(results).toEqual([{ id: 'x-guard', status: STATUS.clean, reason: '' }])
  })

  it('reports not-applicable with the wrapper’s own reason when a guard stands down', () => {
    const results = runPreflight([
      { id: 'y-guard', gather: () => ({ applicable: false, why: 'the batch is paused' }), decide: () => ({ block: true }) },
    ])
    expect(results).toEqual([{ id: 'y-guard', status: STATUS.skip, reason: 'the batch is paused' }])
  })

  it('passes the session id into the gather step — the guards key on it', () => {
    const calls = []
    runPreflight([fakeGuard('z-guard', { applicable: true, inputs: {} }, () => ({ block: false }), calls)], {
      sessionId: 'sid-1',
    })
    expect(calls).toEqual([{ id: 'z-guard', opts: { sessionId: 'sid-1' } }])
  })

  it('never lets one broken guard cost the run', () => {
    const results = runPreflight([
      {
        id: 'boom',
        gather: () => {
          throw new Error('git exploded')
        },
        decide: () => ({ block: false }),
      },
      fakeGuard('ok', { applicable: true, inputs: {} }, () => ({ block: false })),
    ])
    expect(results[0]).toEqual({ id: 'boom', status: STATUS.error, reason: 'git exploded' })
    expect(results[1].status).toBe(STATUS.clean)
  })
})

describe('normaliseVerdict', () => {
  it('understands every verdict shape the guard cores use', () => {
    expect(normaliseVerdict({ block: true, reason: 'a' })).toEqual({ block: true, reason: 'a' })
    expect(normaliseVerdict({ decision: 'block', reason: 'b' })).toEqual({ block: true, reason: 'b' })
    expect(normaliseVerdict({ decision: 'allow' }).block).toBe(false)
    expect(normaliseVerdict({ block: false, reason: '' }).block).toBe(false)
    expect(normaliseVerdict([{ sha: 'x' }]).block).toBe(true)
    expect(normaliseVerdict([]).block).toBe(false)
    expect(normaliseVerdict('a finding').block).toBe(true)
    expect(normaliseVerdict('').block).toBe(false)
  })

  it('treats an unknown shape as clean rather than inventing a block', () => {
    expect(normaliseVerdict(undefined).block).toBe(false)
    expect(normaliseVerdict({ whatever: 1 }).block).toBe(false)
  })

  it('names a missing reason instead of printing an empty block', () => {
    expect(normaliseVerdict({ block: true }).reason).toMatch(/no reason given/)
  })
})

describe('selectGuards', () => {
  const guards = [{ id: 'model-guard' }, { id: 'dashboard-guard' }, { id: 'doc-budget-guard' }]

  it('narrows to the guards an action governs', () => {
    expect(selectGuards(guards, 'merge').map((g) => g.id)).toEqual(['model-guard', 'doc-budget-guard'])
  })

  it('takes every guard for a turn end and for an unknown action', () => {
    expect(selectGuards(guards, 'turn-end')).toHaveLength(3)
    expect(selectGuards(guards, 'nonsense')).toHaveLength(3)
    expect(isKnownAction('turn-end')).toBe(true)
    expect(isKnownAction('nonsense')).toBe(false)
  })

  it('only names guards that are actually registered', () => {
    const registered = new Set(GUARDS.map((g) => g.id))
    for (const [action, ids] of Object.entries(ACTIONS)) {
      for (const id of ids ?? []) expect(registered, `${action} names ${id}`).toContain(id)
    }
  })
})

describe('formatPreflightReport', () => {
  const results = [
    { id: 'a-guard', status: STATUS.block, reason: 'first line of the refusal\nand its detail' },
    { id: 'b-guard', status: STATUS.clean, reason: '' },
    { id: 'c-guard', status: STATUS.skip, reason: 'the batch is paused' },
    { id: 'd-guard', status: STATUS.error, reason: 'git exploded' },
  ]

  it('gives one line per guard, then the full reason of what would block', () => {
    const text = formatPreflightReport(results, { action: 'tick' })
    expect(text).toContain('would a guard block "tick"')
    for (const r of results) expect(text).toContain(r.id)
    expect(text).toContain('1 guard(s) WOULD BLOCK: a-guard')
    expect(text).toContain('and its detail')
    expect(text).toMatch(/could not be evaluated/)
  })

  it('says so plainly when nothing would block, and stays advisory', () => {
    const text = formatPreflightReport([{ id: 'b-guard', status: STATUS.clean, reason: '' }])
    expect(text).toContain('No registered guard would block right now.')
    expect(text).toMatch(/ADVISORY/)
    expect(text).toMatch(/the guard itself|each guard itself/)
  })

  it('shortens a long reason to its first line for the overview', () => {
    expect(summarise('  \n first line \n second')).toBe('first line')
    expect(summarise('x'.repeat(400)).length).toBe(220)
  })
})

describe('GATHER-STEP REUSE (the drift guard)', () => {
  // The point of these: the preflight must call the WRAPPER's gather step. If a
  // future change reimplements the gathering inside the preflight, the identity
  // check below fails — which is the whole intent.
  const byId = Object.fromEntries(GUARDS.map((g) => [g.id, g]))

  it('registers every guard whose wrapper exports a gather step', () => {
    expect(Object.keys(byId).sort()).toEqual(
      [
        'dashboard-guard',
        'doc-budget-guard',
        'model-guard',
        'queue-order-guard',
        'render-verify-guard',
        'tasks-archive-guard',
        'tasks-spec-guard',
      ].sort(),
    )
  })

  it('uses the wrappers’ OWN gather functions, not a copy', () => {
    expect(byId['dashboard-guard'].gather).toBe(gatherDashboardInputs)
    expect(byId['tasks-spec-guard'].gather).toBe(gatherTasksSpecInputs)
    expect(byId['tasks-archive-guard'].gather).toBe(gatherTasksArchiveInputs)
    expect(byId['queue-order-guard'].gather).toBe(gatherQueueOrderInputs)
    expect(byId['doc-budget-guard'].gather).toBe(gatherDocBudgetInputs)
    expect(byId['render-verify-guard'].gather).toBe(gatherRenderVerifyInputs)
    // model-guard is wrapped only to pass arm:false (no baseline write from a
    // read-only run); the wrapper's function must still be the one called.
    expect(byId['model-guard'].gather.toString()).toContain('gatherModelGuardInputs')
    expect(typeof gatherModelGuardInputs).toBe('function')
  })

  it('uses the CORES’ own decide functions, not a copy', () => {
    expect(byId['dashboard-guard'].decide).toBe(dashboardEvaluate)
    expect(byId['tasks-spec-guard'].decide).toBe(tasksSpecEvaluate)
    expect(byId['queue-order-guard'].decide).toBe(queueOrderEvaluate)
    expect(byId['render-verify-guard'].decide).toBe(renderVerifyEvaluate)
    // The two formatter-wrapped ones must still route through the core.
    expect(byId['tasks-archive-guard'].decide.toString()).toContain('evaluateTasksArchive')
    expect(byId['doc-budget-guard'].decide.toString()).toContain('evaluateDocBudgets')
    expect(byId['model-guard'].decide.toString()).toContain('findForbiddenCommits')
    expect(typeof findForbiddenCommits).toBe('function')
  })

  it('holds each gather step to the applicable/inputs contract on the REAL repo', () => {
    for (const guard of GUARDS) {
      const gathered = guard.gather({ sessionId: 'preflight-test' })
      expect(gathered, guard.id).toBeTruthy()
      if (gathered.applicable === false) expect(typeof gathered.why, guard.id).toBe('string')
      else expect(typeof gathered.inputs, guard.id).toBe('object')
    }
  })

  it('runs against the real repo without an error status', () => {
    // A wrapper that throws on import or on gathering would show up here — and
    // an `error` row is exactly the false-confidence case this must not have.
    const results = runPreflight(GUARDS, { sessionId: 'preflight-test' })
    expect(results.filter((r) => r.status === STATUS.error)).toEqual([])
    expect(results.map((r) => r.id)).toEqual(GUARDS.map((g) => g.id))
  })
})

describe('isMainModule', () => {
  // Explicit URLs, not this file's own: under Vitest `import.meta.url` is not a
  // file: URL at all, which is precisely why the wrappers may not derive paths
  // from it (see repo-paths.mjs).
  const url = 'file:///C:/repo/scripts/some-guard.mjs'

  it('is false when the module was imported (the wrappers depend on this)', () => {
    expect(isMainModule(url, 'C:/repo/node_modules/vitest/dist/cli.mjs')).toBe(false)
    expect(isMainModule(url, undefined)).toBe(false)
    expect(isMainModule(undefined, 'C:/repo/scripts/some-guard.mjs')).toBe(false)
  })

  it('is true for the entry script, by path or by file name', () => {
    expect(isMainModule(url, 'C:/repo/scripts/some-guard.mjs')).toBe(true)
    // Forgiving on purpose: a false negative would silently disable a Stop hook.
    expect(isMainModule(url, 'D:/another/checkout/scripts/some-guard.mjs')).toBe(true)
  })

  it('does not throw on a non-file module url (the Vitest case)', () => {
    expect(() => isMainModule('/not/a/url', 'C:/repo/scripts/x.mjs')).not.toThrow()
    expect(isMainModule('/not/a/url', 'C:/repo/scripts/x.mjs')).toBe(false)
  })
})
