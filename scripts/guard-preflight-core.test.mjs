// The guard preflight (point 365 D): does it report what a guard WOULD do,
// without running the guard — and does it keep sharing the wrapper's input
// gathering? The second half is the load-bearing one: the cores are pure, but
// each wrapper does the I/O, and a reimplementation of that gathering would
// drift and hand back a false "clean". These tests fail if anyone replaces a
// wrapper's gather step with a local copy.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ACTIONS,
  CAUSE,
  STATUS,
  formatPreflightReport,
  isKnownAction,
  normaliseVerdict,
  runPreflight,
  selectGuards,
  summarise,
  unregisteredStopHooks,
  wiredStopHookIds,
} from './guard-preflight-core.mjs'
import { GUARDS, resolveSessionId, unregisteredHooks } from './guard-preflight.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
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
import { green } from './dashboard-guard-fixtures.mjs'

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

  it('does NOT call a lock stand-down "not-applicable" when the session is unknown', () => {
    // Without a session id, heldByOtherLiveOwner('') calls the OWNING session a
    // stranger, and four guards then read as cleanly inapplicable for the very
    // session that owns the batch. That is a false all-clear, so it is UNKNOWN.
    const guard = {
      id: 'lock-keyed',
      gather: () => ({ applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }),
      decide: () => ({ block: true }),
    }
    const blind = runPreflight([guard], { sessionId: '', sessionKnown: false })
    expect(blind[0].status).toBe(STATUS.unknown)
    expect(blind[0].reason).toMatch(/no session id available/)

    const known = runPreflight([guard], { sessionId: 'sid-1', sessionKnown: true })
    expect(known[0].status).toBe(STATUS.skip)
    expect(known[0].reason).toBe('another live session owns the batch lock')
  })

  it('keeps an unrelated stand-down not-applicable even with an unknown session', () => {
    const guard = { id: 'paused', gather: () => ({ applicable: false, why: 'the batch is paused' }), decide: () => ({}) }
    expect(runPreflight([guard], { sessionKnown: false })[0].status).toBe(STATUS.skip)
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

  it('knows "answer" — the moment BEFORE the closing reply — as the whole chain', () => {
    // The doubled-message bug (point 403) is a turn that composed its reply and
    // then had to write a second one. Asking here costs a process run; being
    // told afterwards costs the user a duplicate.
    expect(isKnownAction('answer')).toBe(true)
    expect(selectGuards(guards, 'answer')).toHaveLength(3)
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

  it('says outright that an unjudged guard is not cleared by the report', () => {
    const text = formatPreflightReport([
      { id: 'lock-keyed', status: STATUS.unknown, reason: 'no session id available' },
    ])
    expect(text).toMatch(/UNJUDGED/)
    expect(text).toMatch(/--session/)
    // "nothing would block" must not read as an all-clear next to an unknown.
    expect(text).toMatch(/does not clear them/)
  })

  // A summary that reads clean while the report judged nothing is the defect,
  // not the wording: it is the sentence a session acts on (point 437 E).
  it('refuses to read as an all-clear while a guard went NOT JUDGED', () => {
    const text = formatPreflightReport([
      { id: 'b-guard', status: STATUS.clean, reason: '' },
      { id: 'net-guard', status: STATUS.notJudged, reason: 'its verdict needs the network' },
    ])
    expect(text).not.toContain('No registered guard would block right now.')
    expect(text).toMatch(/not an all-clear/)
    expect(text).toMatch(/NOT JUDGED here/)
    expect(text).toContain('net-guard')
  })

  it('refuses to read as an all-clear while a wired hook is unregistered', () => {
    const text = formatPreflightReport([{ id: 'b-guard', status: STATUS.clean, reason: '' }], {
      unregistered: ['forgotten-guard'],
    })
    expect(text).not.toContain('No registered guard would block right now.')
    expect(text).toMatch(/DRIFT:/)
    expect(text).toContain('forgotten-guard')
  })

  it('still says so plainly when the whole chain was judged and is clean', () => {
    const text = formatPreflightReport([{ id: 'b-guard', status: STATUS.clean, reason: '' }], {
      unregistered: [],
    })
    expect(text).toContain('No registered guard would block right now.')
  })
})

describe('the wired Stop chain, read from the settings', () => {
  const settings = {
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'node scripts/a-guard.mjs' }, { command: 'node scripts/b-guard.mjs' }] },
        { hooks: [{ command: 'node scripts\\c-guard.mjs' }] },
      ],
      PreToolUse: [{ hooks: [{ command: 'node scripts/pre-guard.mjs' }] }],
    },
  }

  it('lists the Stop hooks as preflight ids, and only those', () => {
    expect(wiredStopHookIds(settings)).toEqual(['a-guard', 'b-guard', 'c-guard'])
  })

  it('de-duplicates a hook wired twice', () => {
    const twice = { hooks: { Stop: [{ hooks: [{ command: 'node scripts/a-guard.mjs' }, { command: 'node scripts/a-guard.mjs' }] }] } }
    expect(wiredStopHookIds(twice)).toEqual(['a-guard'])
  })

  it('is total on rubbish — it must never invent a drift finding', () => {
    expect(wiredStopHookIds(undefined)).toEqual([])
    expect(wiredStopHookIds({})).toEqual([])
    expect(wiredStopHookIds({ hooks: { Stop: 'nonsense' } })).toEqual([])
    expect(wiredStopHookIds({ hooks: { Stop: [{ hooks: [{ command: 'echo hi' }] }] } })).toEqual([])
  })

  it('names the wired hooks no registered guard covers', () => {
    const guards = [{ id: 'a-guard' }, { id: 'c-guard' }]
    expect(unregisteredStopHooks(wiredStopHookIds(settings), guards)).toEqual(['b-guard'])
  })

  it('reports nothing when the registry is complete', () => {
    const guards = [{ id: 'a-guard' }, { id: 'b-guard' }, { id: 'c-guard' }]
    expect(unregisteredStopHooks(wiredStopHookIds(settings), guards)).toEqual([])
  })

  it('is total on rubbish', () => {
    expect(unregisteredStopHooks()).toEqual([])
    expect(unregisteredStopHooks('nonsense', null)).toEqual([])
  })
})

describe('a gather that cannot judge', () => {
  it('reads as NOT JUDGED, never as clean', () => {
    const guard = {
      id: 'net-guard',
      gather: () => ({ applicable: false, cause: CAUSE.notJudged, why: 'needs the network' }),
      decide: () => ({ block: false }),
    }
    const [r] = runPreflight([guard], { sessionId: 's' })
    expect(r.status).toBe(STATUS.notJudged)
    expect(r.status).not.toBe(STATUS.clean)
    expect(r.reason).toBe('needs the network')
  })

  it('leaves an ordinary stand-down reading not-applicable', () => {
    const guard = {
      id: 'paused-guard',
      gather: () => ({ applicable: false, why: 'the batch is paused' }),
      decide: () => ({ block: false }),
    }
    expect(runPreflight([guard], { sessionId: 's' })[0].status).toBe(STATUS.skip)
  })
})

describe('resolveSessionId (F4)', () => {
  const noLock = () => null

  it('prefers an explicit --session over everything else', () => {
    expect(resolveSessionId(['--session', 'sid-cli'], { CLAUDE_SESSION_ID: 'sid-env' }, () => ({ sessionId: 'sid-lock' }))).toEqual(
      { sessionId: 'sid-cli', source: '--session', sessionKnown: true },
    )
  })

  it('ignores a --session with no value, rather than swallowing the next flag', () => {
    expect(resolveSessionId(['--session', '--json'], {}, noLock).sessionKnown).toBe(false)
  })

  it('falls back to the environment, then to the batch lock’s own owner', () => {
    expect(resolveSessionId([], { CLAUDE_SESSION_ID: 'sid-env' }, noLock).source).toBe('CLAUDE_SESSION_ID')
    const fromLock = resolveSessionId([], {}, () => ({ sessionId: 'sid-lock' }))
    expect(fromLock).toEqual({ sessionId: 'sid-lock', source: 'batch lock owner', sessionKnown: true })
  })

  it('reports the session as UNKNOWN rather than inventing an empty one', () => {
    expect(resolveSessionId([], {}, noLock)).toEqual({ sessionId: '', source: null, sessionKnown: false })
    expect(resolveSessionId([], {}, () => {
      throw new Error('torn lock file')
    }).sessionKnown).toBe(false)
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
        'batch-progress-guard',
        'branch-hygiene-guard',
        'ci-status-guard',
        'container-ask-guard',
        'criticality-review-guard',
        'dashboard-card-topic-guard',
        'dashboard-conciseness-guard',
        'dashboard-guard',
        'dashboard-integrity-guard',
        'dashboard-sync',
        'decision-card-guard',
        'doc-budget-guard',
        'findings-guard',
        'guard-health-guard',
        'guide-brevity-guard',
        'mechanism-review-guard',
        'model-guard',
        'prep-guard',
        'push-arrival-guard',
        'queue-order-guard',
        'render-verify-guard',
        'retro-currency-guard',
        'rule-review-guard',
        'tasks-archive-guard',
        'tasks-spec-guard',
        'timestamp-guard',
      ].sort(),
    )
  })

  // THE DRIFT ITSELF (point 437 E). The list above is a second copy of the truth;
  // this reads the AUTHORITATIVE chain. Until 07.08.2026 fourteen wired Stop
  // hooks sat outside the registry, so the preflight said nothing about them
  // while they would block — and §7.2 tells the session to preflight and answer
  // LAST, which turns a false clean into the answer-twice loop the tool exists
  // to prevent.
  it('covers EVERY Stop hook wired in .claude/settings.json', () => {
    const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8'))
    const wired = wiredStopHookIds(settings)
    expect(wired.length, 'no Stop hooks found in .claude/settings.json').toBeGreaterThan(5)
    expect(
      unregisteredStopHooks(wired, GUARDS),
      'these Stop hooks are wired but registered with no gather/decide pair — the preflight would ' +
        'report nothing about them. Register each in guard-preflight.mjs (a gather that honestly ' +
        'reports "not judged" counts).',
    ).toEqual([])
  })

  it('finds no drift through the wrapper the CLI uses either', () => {
    expect(unregisteredHooks(GUARDS)).toEqual([])
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

  it('has each wrapper’s MAIN path go through its own gather step too (F5)', () => {
    // A source-shape check, deliberately: a main path that recomputes its inputs
    // still produces the right answer today, so no behavioural test can see the
    // divergence — only that the two halves would drift apart tomorrow. The
    // spawned-hook tests in guard-hooks.test.mjs cover the behaviour.
    const src = (name) => readFileSync(resolve(process.cwd(), 'scripts', name), 'utf8')
    const mainOf = (name) => src(name).slice(src(name).indexOf('isMainModule(import.meta.url)'))
    for (const [file, gather] of [
      ['model-guard.mjs', 'gatherModelGuardInputs'],
      ['dashboard-guard.mjs', 'gatherDashboardInputs'],
      ['tasks-spec-guard.mjs', 'gatherTasksSpecInputs'],
      ['queue-order-guard.mjs', 'gatherQueueOrderInputs'],
      ['tasks-archive-guard.mjs', 'gatherTasksArchiveInputs'],
      ['doc-budget-guard.mjs', 'gatherDocBudgetInputs'],
      ['render-verify-guard.mjs', 'gatherRenderVerifyInputs'],
    ]) {
      expect(mainOf(file), `${file} main path must call ${gather}`).toContain(`${gather}(`)
    }
    // The one that had a second copy: no direct call to either input source left.
    const modelMain = mainOf('model-guard.mjs')
    expect(modelMain).not.toMatch(/\brecentLog\(/)
    expect(modelMain).not.toMatch(/\bbaselineMs\(/)
  })

  // The two REAL-REPO checks below walk real git history, and one of them —
  // mechanism-review-guard — costs a `git show` per commit between its review
  // baseline and HEAD. On a branch carrying several unreviewed mechanism commits
  // that is seconds rather than milliseconds (measured 1.8 s → 4.8 s on a
  // three-commit guard branch), so the default 5 s budget makes these tests fail
  // for the state of the checkout rather than for a defect. The generous timeout
  // is the fail-soft; what they assert is unchanged.
  const REAL_REPO_TIMEOUT_MS = 30_000

  /**
   * THE ID THESE TWO RUN UNDER (point 434 (8), four-eyes re-check, SHOULD-FIX 2).
   *
   * `preflight-test` is a RESERVED probe id since the parallel-alarm fix, and every
   * ownership door now answers "not mine" for it — which is right, but it means the
   * five ownership-gated gathers would take their stand-down branch here and these
   * two tests would stop exercising the full gather path, precisely for the owner's
   * own suite run that used to reach it. So the REAL owner's id is used when there
   * is one: ownership then resolves `via: 'session-id'` with `restamp: false`, so
   * the gathers stay applicable and NOTHING is written. With no lock on disk the
   * probe id is the fallback, and the contract assertions hold either way.
   */
  const realRepoSid = () => readOwnerLock()?.sessionId ?? 'preflight-test'

  it(
    'holds each gather step to the applicable/inputs contract on the REAL repo',
    () => {
      for (const guard of GUARDS) {
        const gathered = guard.gather({ sessionId: realRepoSid() })
        expect(gathered, guard.id).toBeTruthy()
        if (gathered.applicable === false) expect(typeof gathered.why, guard.id).toBe('string')
        else expect(typeof gathered.inputs, guard.id).toBe('object')
      }
    },
    REAL_REPO_TIMEOUT_MS,
  )

  it(
    'runs against the real repo without an error status',
    () => {
      // A wrapper that throws on import or on gathering would show up here — and
      // an `error` row is exactly the false-confidence case this must not have.
      const results = runPreflight(GUARDS, { sessionId: realRepoSid() })
      expect(results.filter((r) => r.status === STATUS.error)).toEqual([])
      expect(results.map((r) => r.id)).toEqual(GUARDS.map((g) => g.id))
    },
    REAL_REPO_TIMEOUT_MS,
  )
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

describe('the focus reconcile, asked BEFORE the closing reply', () => {
  // The user's own example of the doubled message: a prompt arrives, the reply
  // is composed, dashboard-guard demands the pivot reconcile, the demand is met
  // and the turn has to end with a SECOND message. The reconcile arms on EVERY
  // user prompt, so this is the common case and not a corner — which makes the
  // preflight's ability to name it BEFORE the reply is written load-bearing.
  //
  // Wired the way the real tool is: the registered dashboard-guard entry's OWN
  // decide step, never a local copy of the verdict logic.
  const dashboardGuard = GUARDS.find((g) => g.id === 'dashboard-guard')
  const preflightFor = (inputs) =>
    runPreflight([
      {
        id: dashboardGuard.id,
        gather: () => ({ applicable: true, inputs }),
        decide: dashboardGuard.decide,
      },
    ])

  it('reports the reconcile as a would-block while the pivot check is unmet', () => {
    const [result] = preflightFor(green({ pending: { sessionId: 'sess-a', at: 1500 } }))
    expect(result.status).toBe(STATUS.block)
    expect(result.reason).toMatch(/FOCUS RECONCILE REQUIRED/)
    expect(result.reason).toMatch(/focus\.mjs confirm/)
  })

  it('names it in the report, with the remedy readable rather than summarised away', () => {
    const report = formatPreflightReport(
      preflightFor(green({ pending: { sessionId: 'sess-a', at: 1500 } })),
      { action: 'answer' },
    )
    expect(report).toMatch(/would a guard block "answer" right now\?/)
    expect(report).toMatch(/1 guard\(s\) WOULD BLOCK: dashboard-guard/)
    expect(report).toMatch(/focus\.mjs confirm/)
  })

  it('goes silent once the focus was confirmed (the marker cleared)', () => {
    const [result] = preflightFor(green({ pending: null }))
    expect(result.status).toBe(STATUS.clean)
    expect(result.reason).toBe('')
    expect(formatPreflightReport([result], { action: 'answer' })).toMatch(
      /No registered guard would block right now\./,
    )
  })

  it("does not report ANOTHER session's pivot check as this session's duty", () => {
    const [result] = preflightFor(green({ pending: { sessionId: 'sess-b', at: 1500 } }))
    expect(result.status).toBe(STATUS.clean)
  })
})
