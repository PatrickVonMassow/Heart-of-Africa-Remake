// WHICH gather failure is allowed to clear the render gate (H4, review finding
// F1). The refactor for the preflight had wrapped the WHOLE gathering in a catch
// that re-baselined, so any transient failure — an `index.lock` collision, a
// throwing ownership probe — permanently cleared a pending, unverified gate, and
// a non-owner session could overwrite the owner's baseline. Fail-open ONCE had
// become fail-open forever.
//
// The rule these tests pin: exactly one error source (the baseline↔HEAD diff)
// raises BaselineDiffError and re-baselines; every other source raises a plain
// error, which the Stop hook lets fall through to its outer catch — stop allowed,
// state untouched, gate still pending on the next turn.
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import {
  BaselineDiffError,
  commitMissing,
  gatherRenderVerifyInputs,
  incompleteClosureDraft,
  openIncompleteRuns,
} from './render-verify-guard.mjs'
import { incompleteClosureFor, runIdentity } from './render-verify-core.mjs'

const boom = (what) => () => {
  throw new Error(`${what} exploded`)
}

/** A working set of dependencies; each test breaks exactly one of them. */
const okDeps = () => ({
  heldByOther: () => false,
  revParseHead: () => 'headsha',
  branchOf: () => 'feat/x',
  readState: () => ({ clearedHeads: { 'feat/x': 'basesha' }, runs: [] }),
  diffRenderPaths: () => ({ paths: ['src/render/a.ts'], base: 'basesha' }),
  changeTimeOf: () => 1000,
  // Default: the baseline really is gone, so a diff failure re-baselines. The
  // transient case sets this false — see the pair of tests below.
  baselineGone: () => true,
  // The work order, from which the chargeable points come (point 550).
  workOrder: () => '- [ ] 506. an open point\n- [x] 387. a finished one',
})

const gatherWith = (broken) =>
  gatherRenderVerifyInputs({ sessionId: 'sid', deps: { ...okDeps(), ...broken } })

describe('gatherRenderVerifyInputs — the happy path it must keep', () => {
  it('hands evaluate() the head, baseline, pending paths and change time', () => {
    const g = gatherWith({})
    expect(g.applicable).toBe(true)
    expect(g.inputs).toEqual({
      head: 'headsha',
      clearedHead: 'basesha',
      changedRenderPaths: ['src/render/a.ts'],
      latestChangeAt: 1000,
      runs: [],
      deferral: undefined,
      openPoints: [506],
    })
  })

  it('hands evaluate() the OPEN points only — a ticked one can charge nothing (point 550)', () => {
    expect(gatherWith({}).openPoints).toEqual([506])
  })

  it('charges nothing when the work order cannot be read, rather than widening the gate', () => {
    const g = gatherWith({ workOrder: boom('readTasksAll') })
    expect(g.applicable).toBe(true)
    expect(g.inputs.openPoints).toEqual([])
  })

  it('stands down for a non-owner session — and says WHY, without a head to write', () => {
    const g = gatherWith({ heldByOther: () => true })
    expect(g.applicable).toBe(false)
    expect(g.cause).toBe('not-lock-owner')
    // No head: the Stop hook only advances a baseline when it got one, so a
    // stood-down session cannot touch the owner's state.
    expect(g.head).toBeUndefined()
  })

  it('reports the bootstrap case with a head, so the first run can baseline', () => {
    const g = gatherWith({ readState: () => ({}) })
    expect(g.applicable).toBe(false)
    expect(g.head).toBe('headsha')
    expect(g.why).toMatch(/no verified baseline/)
  })

  it('does not date a change when nothing render-relevant is pending', () => {
    const g = gatherWith({
      diffRenderPaths: () => ({ paths: [], base: 'basesha' }),
      changeTimeOf: boom('latestChangeAt'),
    })
    expect(g.inputs.latestChangeAt).toBe(0)
  })
})

describe('ONLY the baseline diff may re-baseline (F1)', () => {
  it('raises BaselineDiffError when the baseline cannot be diffed against HEAD', () => {
    let caught
    try {
      gatherWith({ diffRenderPaths: boom('merge-base') })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BaselineDiffError)
    expect(caught.baseline).toBe('basesha')
    expect(caught.message).toMatch(/merge-base exploded/)
    // The main path keys on the type, so the name must stay stable too.
    expect(caught.name).toBe('BaselineDiffError')
  })

  it('does NOT raise BaselineDiffError when the diff fails but the baseline is STILL THERE', () => {
    // A spawn failure under machine load is not a vanished baseline. Re-baselining
    // on it would clear an unverified render change for good, so the gate must
    // survive the turn instead: a plain error, which the hook allows without a write.
    let caught
    try {
      gatherWith({ diffRenderPaths: boom('spawn EAGAIN'), baselineGone: () => false })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect(caught).not.toBeInstanceOf(BaselineDiffError)
    expect(String(caught.message)).toMatch(/spawn EAGAIN/)
  })

  // One case per remaining error source. Each of these used to re-baseline.
  for (const source of ['heldByOther', 'revParseHead', 'branchOf', 'readState', 'changeTimeOf']) {
    it(`does NOT raise BaselineDiffError when ${source} throws — the gate must survive`, () => {
      let caught
      try {
        gatherWith({ [source]: boom(source) })
      } catch (e) {
        caught = e
      }
      expect(caught, `${source} must still fail loudly`).toBeInstanceOf(Error)
      expect(caught, `${source} must not clear the gate`).not.toBeInstanceOf(BaselineDiffError)
      expect(caught.message).toContain(`${source} exploded`)
    })
  }
})

describe('the Stop hook re-baselines on that error and only that one', () => {
  // The hook's branch is `if (!(e instanceof BaselineDiffError)) throw e`, so the
  // decision reduces to the instanceof test — asserted here on both sides rather
  // than read out of the source.
  const wouldRebaseline = (e) => e instanceof BaselineDiffError

  it('re-baselines on an undiffable baseline', () => {
    expect(wouldRebaseline(new BaselineDiffError('abc123', new Error('gone')))).toBe(true)
  })

  it('leaves the state alone on every other failure', () => {
    expect(wouldRebaseline(new Error('index.lock: File exists'))).toBe(false)
    expect(wouldRebaseline(new TypeError('probe blew up'))).toBe(false)
    // A message that merely LOOKS like the diff failure must not count either.
    expect(wouldRebaseline(new Error('diff vs abc123 failed'))).toBe(false)
  })
})

// Point 734: which runs the `--incomplete` sign-off may see. It works on the
// state the guard reads, so a closure can only ever name a run that is really
// recorded and not already signed off.
describe('openIncompleteRuns — what the sign-off may close', () => {
  const truncated = (at) => ({
    backend: 'webgpu',
    suite: 'settings',
    at,
    exit: 1,
    reds: [{ name: "115 further result line(s) exceeded the capture cap — this run's reds were NOT all read", key: 'capture-truncated', kind: 'truncated', point: null }],
  })
  const ordinary = (at) => ({ backend: 'webgpu', suite: 'polish', at, exit: 1, reds: [{ name: 'a real red', kind: 'check', point: null }] })

  it('lists the truncated runs and nothing else', () => {
    const open = openIncompleteRuns({ runs: [truncated(1500), ordinary(1600), { backend: 'webgl', suite: 'x', at: 1700, exit: 0 }] })
    expect(open.map((r) => r.at)).toEqual([1500])
  })

  // The sign-off may only be OFFERED where it would lift something (round 5,
  // finding 6). A truncated run that also CRASHED stays `red` (a crash outranks
  // everything, and no signature lifts it), and a truncated `--section` probe
  // stays `partial` (it blocks nobody) — listing either as an open incomplete
  // recording had the CLI report "SIGNED OFF" on a closure that binds nothing.
  it('offers no closure for a truncated run that CRASHED, or for a truncated --section probe', () => {
    const crashed = { ...truncated(1500), crashed: true }
    const probe = { ...truncated(1600), partial: true, section: 'traa-toggle' }
    expect(openIncompleteRuns({ runs: [crashed, probe, truncated(1700)] }).map((r) => r.at)).toEqual([1700])
    // And the draft therefore refuses them by name, rather than signing.
    const draft = incompleteClosureDraft({ runs: [crashed] }, { selector: 'webgpu/settings', evidence: 'e' })
    expect(draft.closure).toBeUndefined()
    expect(draft.error).toMatch(/no OPEN incomplete recording/)
  })

  it('drops a run that is already signed off, and keeps the next one', () => {
    const one = truncated(1500)
    const state = {
      runs: [one, truncated(2500)],
      incompleteClosures: [{ run: runIdentity(one), backend: 'webgpu', suite: 'settings', at: 1500, evidence: 'no browser on this host' }],
    }
    expect(openIncompleteRuns(state).map((r) => r.at)).toEqual([2500])
  })

  it('is total on a missing or malformed state', () => {
    expect(openIncompleteRuns(null)).toEqual([])
    expect(openIncompleteRuns({ runs: 'nope' })).toEqual([])
    expect(() => openIncompleteRuns({ runs: [null, 7], incompleteClosures: 'nope' })).not.toThrow()
  })

  // WHAT THE COMMAND WOULD WRITE — the judgment, without a state file. It used
  // to stamp `at: Number(run.at)`: NaN for a record whose timestamp is
  // unreadable, so the command reported a SUCCESS and the matcher then refused
  // the closure it had just written (review, 19.08.2026).
  describe('incompleteClosureDraft — the signature the CLI would write', () => {
    const signed = { selector: 'webgpu/settings', evidence: 'the host has no browser (point 732)' }

    it('names the run by its stamp, and the closure it writes really MATCHES that run', () => {
      const run = truncated(1500)
      const draft = incompleteClosureDraft({ runs: [run] }, signed)
      expect(draft.error).toBeUndefined()
      expect(draft.closure.at).toBe(1500)
      expect(incompleteClosureFor(run, [draft.closure])).toEqual(draft.closure)
    })

    // A record whose `at` is unreadable but which began at a readable time is
    // still ONE identifiable run — the re-recording route already read it that
    // way, and the signature route refusing to left it closable by nothing.
    it('falls back to the start time, so a record with an unreadable `at` can still be signed for', () => {
      const run = { ...truncated(1500), at: undefined, startedAt: 1490 }
      const draft = incompleteClosureDraft({ runs: [run] }, signed)
      expect(draft.closure.at).toBe(1490)
      expect(incompleteClosureFor(run, [draft.closure])).toEqual(draft.closure)
    })

    // A record with NO readable stamp still has a CONTENT identity — under the
    // stamp scheme it was closable by nothing while the CLI reported success;
    // the hash names it like any other record (round 5, finding 5).
    it('signs a record with no readable timestamp by its content identity', () => {
      const run = { ...truncated(1500), at: 'soon', startedAt: null }
      const draft = incompleteClosureDraft({ runs: [run] }, signed)
      expect(draft.error).toBeUndefined()
      expect(draft.closure.run).toBe(runIdentity(run))
      expect(draft.closure.at).toBeNull()
      expect(incompleteClosureFor(run, [draft.closure])).toEqual(draft.closure)
    })

    // Two parallel runs can share a millisecond (finding 5): --at then matches
    // both, but their CONTENT differs, so --run separates what no stamp can —
    // and the one signature binds only the run it names.
    it('separates two runs that share a stamp by --run, and the signature binds only that one', () => {
      const a = truncated(1500)
      const b = { ...truncated(1500), screenshotCount: 3 }
      const state = { runs: [a, b] }
      const ambiguous = incompleteClosureDraft(state, { ...signed, at: '1500' })
      expect(ambiguous.error).toMatch(/matches 2 open incomplete recordings/)
      expect(ambiguous.choices).toHaveLength(2)
      const draft = incompleteClosureDraft(state, { ...signed, run: runIdentity(b) })
      expect(draft.error).toBeUndefined()
      expect(incompleteClosureFor(b, [draft.closure])).toEqual(draft.closure)
      expect(incompleteClosureFor(a, [draft.closure])).toBeNull()
    })

    it('refuses an empty evidence, an unnamed run, an unreadable --at and a selector that matches none', () => {
      const state = { runs: [truncated(1500)] }
      expect(incompleteClosureDraft(state, { ...signed, evidence: '  ' }).error).toMatch(/--evidence/)
      expect(incompleteClosureDraft(state, { ...signed, selector: '' }).error).toMatch(/name the run as/)
      expect(incompleteClosureDraft(state, { ...signed, at: 'whenever' }).error).toMatch(/is not a timestamp/)
      expect(incompleteClosureDraft(state, { ...signed, selector: 'webgl/settings' }).error).toMatch(/no OPEN incomplete recording/)
    })

    it('refuses an ambiguous selector, and offers each open run by its stamp', () => {
      const state = { runs: [truncated(1500), { ...truncated(2500), at: undefined, startedAt: 2500 }] }
      const draft = incompleteClosureDraft(state, signed)
      expect(draft.error).toMatch(/matches 2 open incomplete recordings/)
      expect(draft.choices).toHaveLength(2)
      // …and naming one of them by that stamp resolves it, undated record included.
      expect(incompleteClosureDraft(state, { ...signed, at: '2500' }).closure.at).toBe(2500)
    })

    it('is total on a missing state and missing options', () => {
      expect(() => incompleteClosureDraft(null, null)).not.toThrow()
      expect(incompleteClosureDraft(null, null).error).toMatch(/--evidence/)
      expect(incompleteClosureDraft(null, signed).error).toMatch(/no OPEN incomplete recording/)
    })
  })
})

// The probe runs a REAL git command, so it needs a real-git test: the injected
// `baselineGone` of the suite above cannot see a quoting bug in the command
// itself, and one slipped through exactly that gap (27.07.2026 — cmd.exe eats
// an unquoted `^`, so every existing baseline read as "gone").
describe('commitMissing runs a real git probe (no injection)', () => {
  it('says PRESENT for the current HEAD and GONE for a sha that does not exist', () => {
    const head = execSync('git rev-parse HEAD', { windowsHide: true, encoding: 'utf8' }).trim()
    expect(commitMissing(head)).toBe(false)
    expect(commitMissing('0'.repeat(40))).toBe(true)
  })
})
