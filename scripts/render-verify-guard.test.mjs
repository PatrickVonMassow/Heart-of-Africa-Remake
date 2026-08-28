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
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BaselineDiffError,
  commitMissing,
  gatherRenderVerifyInputs,
  incompleteClosureDraft,
  crashClosureDraft,
  openIncompleteRuns,
  openCrashedRuns,
  closureArgs,
  retainedClosures,
  isoText,
} from './render-verify-guard.mjs'
import { incompleteClosureFor, crashClosureFor, runIdentity } from './render-verify-core.mjs'

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
  guardDuty: ({ sessionId }) => ({ closed: false, successor: 'the successor session', sessionId }),
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
      sessionId: 'sid',
      fence: { closed: false, successor: 'the successor session', sessionId: 'sid' },
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
  // THE MARKER AS IT WAS REALLY WRITTEN TO DISK, in both shapes (review
  // finding, 28.08.2026: the fixture carried the new `kind` AND the legacy key,
  // so it satisfied both branches at once and proved neither). The records this
  // path exists for are the LEGACY ones — a plain `check` under the stable key,
  // which is what the recorder wrote before the cap was removed — while the
  // `truncated` kind is what a record would carry had it been written after it.
  const marker = (kind) => ({ name: "115 further result line(s) exceeded the capture cap — this run's reds were NOT all read", key: 'capture-truncated', kind, point: null })
  const LEGACY_MARKER = marker('check')
  const MODERN_MARKER = marker('truncated')
  // Not a record shape but a BRANCH probe: a marker recognised by its kind
  // alone, so the two halves of isTruncationEntry are told apart.
  const KIND_ONLY = { name: 'lines were dropped', key: 'a key nothing special', kind: 'truncated', point: null }
  const truncatedWith = (marker) => (at) => ({
    backend: 'webgpu',
    suite: 'settings',
    at,
    exit: 1,
    reds: [marker],
  })
  const truncated = truncatedWith(LEGACY_MARKER)
  const ordinary = (at) => ({ backend: 'webgpu', suite: 'polish', at, exit: 1, reds: [{ name: 'a real red', kind: 'check', point: null }] })

  // THE ONE DOOR NO TEST WENT THROUGH (review finding, 28.08.2026): every case
  // handed the draft a ready string, so the argv parsing was unexercised — and
  // it treated the NEXT FLAG as a value, which turned an evidence-less
  // invocation into a signed record whose written reason was "--run".
  it('refuses to read a following FLAG as a value, so an evidence-less sign-off is refused', () => {
    expect(closureArgs(['webgpu/startup', '--evidence', '--run', 'abc123'])).toEqual({
      selector: 'webgpu/startup',
      evidence: '',
      at: '',
      run: 'abc123',
    })
    // Refused where it counts: the draft sees no evidence and writes nothing.
    const r = truncated(1500)
    const args = closureArgs(['webgpu/settings', '--evidence', '--at', '1500'])
    const draft = incompleteClosureDraft({ runs: [r] }, args)
    expect(draft.closure).toBeUndefined()
    expect(draft.error).toMatch(/--evidence .* is required/)
    // And an ordinary invocation still reads exactly as before.
    expect(closureArgs(['webgpu/settings', '--evidence', 'the kept log stops mid-line', '--at', '1500'])).toEqual({
      selector: 'webgpu/settings',
      evidence: 'the kept log stops mid-line',
      at: '1500',
      run: '',
    })
    // An evidence text that reads like the selector does not steal it.
    expect(closureArgs(['--evidence', 'webgpu/settings', 'webgpu/settings']).selector).toBe('webgpu/settings')
  })

  // A run that BOTH crashed and truncated was excluded from this list forever,
  // because the raw record still says `crashed` (review finding, 28.08.2026).
  // Its lost lines could then be reached by no signature at all.
  it('offers the incomplete route once the CRASH has been signed off', () => {
    const both = { ...truncated(1500), crashed: true }
    const crashClosure = { run: runIdentity(both), backend: 'webgpu', suite: 'settings', at: 1500, evidence: 'the kept log shows the browser died' }
    // Unsigned: the crash outranks it and no incomplete closure is offered.
    expect(openIncompleteRuns({ runs: [both] })).toEqual([])
    // Signed: the lost recording is what is left, and it can be signed for.
    const open = openIncompleteRuns({ runs: [both], crashClosures: [crashClosure] })
    expect(open.map((r) => r.at)).toEqual([1500])
    const draft = incompleteClosureDraft(
      { runs: [both], crashClosures: [crashClosure] },
      { selector: 'webgpu/settings', evidence: 'the capture was cut where the process died' },
    )
    expect(draft.closure?.run).toBe(runIdentity(both))
  })

  it('reads BOTH recorded marker shapes — and the kind on its own', () => {
    for (const [what, make] of [
      ['legacy', truncatedWith(LEGACY_MARKER)],
      ['modern', truncatedWith(MODERN_MARKER)],
      ['kind only', truncatedWith(KIND_ONLY)],
    ]) {
      const r = make(1500)
      expect(openIncompleteRuns({ runs: [r] }).map((x) => x.at), what).toEqual([1500])
      const draft = incompleteClosureDraft({ runs: [r] }, { selector: 'webgpu/settings', evidence: 'the kept log stops mid-line' })
      expect(draft.closure?.run, what).toBe(runIdentity(r))
    }
  })

  // "One signature per run" is one signature per recorded CONTENT, and the two
  // coincide for anything a lane can really produce (review question,
  // 28.08.2026): runIdentity hashes the whole record, so two runs that really
  // happened differ in it and are refused as two judgments; a record written
  // twice is one measurement and takes one disposition. The hash is a 128-bit
  // truncated SHA-256, so "differ" holds with overwhelming probability
  // rather than with certainty — the residual is stated at the signing site.
  it('signs two DIFFERENT open runs apart, and the same content once', () => {
    const a = truncated(1500)
    const b = truncated(1600)
    expect(runIdentity(a)).not.toBe(runIdentity(b))
    const two = incompleteClosureDraft({ runs: [a, b] }, { selector: 'webgpu/settings', evidence: 'e' })
    expect(two.closure).toBeUndefined()
    expect(two.error).toMatch(/matches 2 open incomplete recordings/)
    expect(two.choices).toHaveLength(2)
    // The same content twice is ONE identity and one signature — and that one
    // signature closes both copies, because they are the same measurement.
    const twice = incompleteClosureDraft({ runs: [a, { ...a }] }, { selector: 'webgpu/settings', evidence: 'e' })
    expect(twice.error).toBeUndefined()
    expect(twice.closure.run).toBe(runIdentity(a))
    expect(openIncompleteRuns({ runs: [a, { ...a }], incompleteClosures: [twice.closure] })).toEqual([])
  })

  // A SIGNATURE MUST NOT BE UNDONE BY BOOKKEEPING (review finding, 28.08.2026).
  // The cap evicted closures in SIGNING order while runs are evicted in
  // RECORDING order, so a run still inside the window could lose its closure
  // and silently reappear as an open, unsigned recording.
  it('keeps the closure of a run the window still holds, whenever it was signed', () => {
    const runs = Array.from({ length: 40 }, (_, i) => truncated(1000 + i))
    const sign = (r) => ({ run: runIdentity(r), backend: 'webgpu', suite: 'settings', at: 1, evidence: 'no browser on this host' })
    // Signed newest first, the other thirty-nine afterwards — an ordinary
    // session that worked through the backlog after dealing with today's run.
    const newest = runs[39]
    const closures = [newest, ...runs.slice(0, 39)].map(sign)
    // A forty-first run is recorded and signed: the RUN window drops the oldest
    // run, so its closure is the one that can lift nothing any more.
    const later = truncated(2000)
    const window_ = [...runs.slice(1), later]
    const kept = retainedClosures([...closures, sign(later)], window_)
    expect(kept).toHaveLength(40)
    expect(kept.some((c) => c.run === runIdentity(newest))).toBe(true)
    expect(kept.some((c) => c.run === runIdentity(runs[0]))).toBe(false)
    // What that is FOR: no run of the window turns back into an open one.
    expect(openIncompleteRuns({ runs: window_, incompleteClosures: kept })).toEqual([])
    // Under the cap nothing is evicted at all, whatever a closure names.
    const few = [sign(runs[0]), sign(truncated(9999))]
    expect(retainedClosures(few, window_)).toEqual(few)
  })

  it('lists the truncated runs and nothing else', () => {
    const open = openIncompleteRuns({ runs: [truncated(1500), ordinary(1600), { backend: 'webgl', suite: 'x', at: 1700, exit: 0 }] })
    expect(open.map((r) => r.at)).toEqual([1500])
  })

  // The sign-off may only be OFFERED where it would lift something (round 5,
  // finding 6). A truncated run that also CRASHED stays `red` (a crash outranks
  // everything, and no INCOMPLETE signature lifts it — since the sixth round it
  // belongs to the --crashed route instead), and a truncated `--section` probe
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

    // WHAT THE HUMAN IS TOLD ABOUT AN UNDATED RUN (review finding, 28.08.2026).
    // Matching one was covered; the line the sign-off and --status PRINT about
    // it was not — and `Number(null)` is 0, so it claimed the run happened at
    // 1970-01-01T00:00:00.000Z, a measurement nobody ever took.
    it('renders a run with no readable stamp as undated, not as the epoch', () => {
      const undated = { backend: 'webgpu', suite: 'settings', exit: 1, reds: [LEGACY_MARKER] }
      const draft = incompleteClosureDraft({ runs: [undated] }, signed)
      expect(draft.error).toBeUndefined()
      expect(draft.closure.at).toBeNull()
      expect(isoText(draft.closure.at)).toBe('undated')
      expect(isoText(undefined)).toBe('undated')
      // A real stamp still reads as its time, and an unreadable one shows
      // itself instead of being rendered into a date.
      expect(isoText(1500)).toBe('1970-01-01T00:00:01.500Z')
      expect(isoText('whenever')).toBe('t=whenever')
      expect(isoText(Number.MAX_SAFE_INTEGER)).toMatch(/^t=/)
    })

    it('is total on a missing state and missing options', () => {
      expect(() => incompleteClosureDraft(null, null)).not.toThrow()
      expect(incompleteClosureDraft(null, null).error).toMatch(/--evidence/)
      expect(incompleteClosureDraft(null, signed).error).toMatch(/no OPEN incomplete recording/)
    })
  })
})

// Point 734, sixth round: which runs the `--crashed` sign-off may see, and the
// signature it would write. The selection and binding rules are shared with the
// incomplete draft on purpose — these tests pin the family-specific halves.
describe('openCrashedRuns / crashClosureDraft — the crash sign-off', () => {
  const crashed = (at, overrides = {}) => ({ backend: 'webgpu', suite: 'startup', at, exit: 1, crashed: true, reds: [], ...overrides })
  const signed = { selector: 'webgpu/startup', evidence: 'local/verify-logs/…: SIGKILL at frame 3; the run wrote no report' }

  it('lists the crashed runs and nothing else — a crashed --section probe blocks nobody', () => {
    const probe = { ...crashed(1600), partial: true, section: 'boot' }
    const ordinary = { backend: 'webgpu', suite: 'polish', at: 1700, exit: 1, reds: [{ name: 'a real red', kind: 'check', point: null }] }
    expect(openCrashedRuns({ runs: [crashed(1500), probe, ordinary] }).map((r) => r.at)).toEqual([1500])
  })

  it('drops a run that is already signed off, and keeps the next one', () => {
    const one = crashed(1500)
    const state = {
      runs: [one, crashed(2500)],
      crashClosures: [{ run: runIdentity(one), backend: 'webgpu', suite: 'startup', at: 1500, evidence: 'the log shows the death' }],
    }
    expect(openCrashedRuns(state).map((r) => r.at)).toEqual([2500])
  })

  it('writes a closure that really MATCHES the run — and only that run', () => {
    const a = crashed(1500)
    const b = crashed(1500, { screenshotCount: 3 })
    const ambiguous = crashClosureDraft({ runs: [a, b] }, signed)
    expect(ambiguous.error).toMatch(/matches 2 open crashed runs/)
    expect(ambiguous.choices).toHaveLength(2)
    const draft = crashClosureDraft({ runs: [a, b] }, { ...signed, run: runIdentity(b) })
    expect(draft.error).toBeUndefined()
    expect(draft.closure.run).toBe(runIdentity(b))
    expect(crashClosureFor(b, [draft.closure])).toEqual(draft.closure)
    expect(crashClosureFor(a, [draft.closure])).toBeNull()
    // A crash closure carries no droppedLines — there is no fragment it keeps.
    expect(draft.closure.droppedLines).toBeUndefined()
  })

  it('refuses an empty evidence, an unnamed run and a selector that matches none', () => {
    const state = { runs: [crashed(1500)] }
    expect(crashClosureDraft(state, { ...signed, evidence: ' ' }).error).toMatch(/--evidence/)
    expect(crashClosureDraft(state, { ...signed, selector: '' }).error).toMatch(/name the run as/)
    expect(crashClosureDraft(state, { ...signed, selector: 'webgl/startup' }).error).toMatch(/no OPEN crashed run/)
  })

  // The families stay locked apart at the CLI too: each draft sees only its own
  // open set, so neither signature can ever be minted for the other's run.
  it('offers no crash closure for a truncated run that did not crash — and the reverse holds above', () => {
    const truncated = {
      backend: 'webgpu',
      suite: 'settings',
      at: 1500,
      exit: 1,
      reds: [{ name: "115 further result line(s) exceeded the capture cap — this run's reds were NOT all read", key: 'capture-truncated', kind: 'truncated', point: null }],
    }
    expect(crashClosureDraft({ runs: [truncated] }, { ...signed, selector: 'webgpu/settings' }).error).toMatch(/no OPEN crashed run/)
    expect(incompleteClosureDraft({ runs: [crashed(1500, { suite: 'settings' })] }, { ...signed, selector: 'webgpu/settings' }).error).toMatch(/no OPEN incomplete recording/)
  })

  it('is total on a missing state and missing options', () => {
    expect(() => crashClosureDraft(null, null)).not.toThrow()
    expect(crashClosureDraft(null, null).error).toMatch(/--evidence/)
    expect(openCrashedRuns(null)).toEqual([])
    expect(() => openCrashedRuns({ runs: [null, 7], crashClosures: 'nope' })).not.toThrow()
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

// THE STATUS COMMAND ITSELF, NOT A HELPER THAT RESEMBLES IT (review finding,
// 28.08.2026, round 13). `isoText` was covered while `--status` bypassed it: the
// open-broken lines read `r.at` without the `startedAt` fallback, and the recent-
// run table rendered `new Date(Number(r.at ?? 0))` directly — 1970 for a record
// that was never dated, and a thrown RangeError for one whose stamp is out of
// range, which aborts the WHOLE inspection just when it is needed. So this drives
// the real CLI over a real state file.
describe('render-verify-guard --status — what it prints about a run it cannot date', () => {
  const GUARD = join(process.cwd(), 'scripts', 'render-verify-guard.mjs')

  /** A throwaway checkout: HOA_REPO_ROOT points every path helper at it, so the
   *  real .claude/render-verify-state.json is never read or written. */
  const inTempRepo = (state) => {
    const root = mkdtempSync(join(tmpdir(), 'hoa-render-status-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, windowsHide: true })
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root'], { cwd: root, windowsHide: true })
      mkdirSync(join(root, '.claude'), { recursive: true })
      writeFileSync(join(root, '.claude', 'render-verify-state.json'), JSON.stringify(state))
      return execFileSync(process.execPath, [GUARD, '--status'], {
        cwd: root,
        env: { ...process.env, HOA_REPO_ROOT: root },
        encoding: 'utf8',
        windowsHide: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  /** The same throwaway checkout, but every argv is run in order against the
   *  REAL CLI and each output is returned. This is the only route that proves
   *  the signing commands work on the record shape the recorder writes today —
   *  the helper drafts are pure functions and cannot show that (review finding,
   *  28.08.2026, round 18). */
  const runCli = (state, argvs) => {
    const root = mkdtempSync(join(tmpdir(), 'hoa-render-cli-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, windowsHide: true })
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root'], { cwd: root, windowsHide: true })
      mkdirSync(join(root, '.claude'), { recursive: true })
      writeFileSync(join(root, '.claude', 'render-verify-state.json'), JSON.stringify(state))
      return argvs.map((argv) =>
        execFileSync(process.execPath, [GUARD, ...argv], {
          cwd: root,
          env: { ...process.env, HOA_REPO_ROOT: root },
          encoding: 'utf8',
          windowsHide: true,
        }),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  // THE RECORD SHAPE THE RECORDER WRITES TODAY, THROUGH THE REAL COMMAND
  // (review finding, 28.08.2026, round 18). Every incomplete fixture in this
  // suite carried the LEGACY synthetic marker in `reds`, while the recorder now
  // writes top-level `truncated`/`droppedLines` and may write no `reds` at all
  // on an exit-0 run — the shape point 734 itself introduced. Nothing drove the
  // real `--incomplete` command with it, so an unclosable current-shape record
  // would have passed this suite in silence.
  it('signs off a CURRENT-SHAPE exit-0 truncation through the real --incomplete command', () => {
    const record = { backend: 'webgpu', suite: 'settings', at: 1500, exit: 0, truncated: true, droppedLines: 115 }
    const [before, signed, after] = runCli({ runs: [record] }, [
      ['--status'],
      ['--incomplete', 'webgpu/settings', '--evidence', 'local/verify-logs/ holds the whole run; the flood was the dev server'],
      ['--status'],
    ])
    expect(before).toMatch(/INCOMPLETE RECORDING \(not an unexplained red\).*115 result line\(s\) dropped/)
    expect(signed).toMatch(/INCOMPLETE RECORDING SIGNED OFF: webgpu\/settings/)
    // Signed, it stops being listed as open — and never reads as a pass.
    expect(after).not.toMatch(/⚠ INCOMPLETE RECORDING \(not an unexplained red\)/)
    expect(after).toMatch(/signed-off incomplete recording: webgpu\/settings/)
  })

  it('signs off a CURRENT-SHAPE crashed run through the real --crashed command', () => {
    const record = { backend: 'webgpu', suite: 'startup', at: 1500, exit: 1, crashed: true, reds: [] }
    const [signed, after] = runCli({ runs: [record] }, [
      ['--crashed', 'webgpu/startup', '--evidence', 'local/verify-logs/ shows SIGKILL at frame 3; the run wrote no report'],
      ['--status'],
    ])
    expect(signed).toMatch(/CRASHED RUN SIGNED OFF: webgpu\/startup/)
    expect(after).not.toMatch(/⚠ CRASHED RUN \(not an unexplained red\)/)
    expect(after).toMatch(/signed-off crashed run: webgpu\/startup/)
  })

  const marker = { name: '115 further result line(s) exceeded the capture cap', key: 'capture-truncated', kind: 'check', point: null }

  it('says undated for a record with no stamp, and never prints the epoch', () => {
    const out = inTempRepo({
      runs: [
        { backend: 'webgpu', suite: 'settings', exit: 1, reds: [marker] },
        { backend: 'webgl', suite: 'startup', exit: 1, crashed: true, reds: [] },
      ],
    })
    expect(out).toMatch(/INCOMPLETE RECORDING \(not an unexplained red\)/)
    expect(out).toMatch(/CRASHED RUN \(not an unexplained red\)/)
    expect(out).toMatch(/@undated/)
    expect(out).not.toMatch(/1970-01-01/)
  })

  // THE PER-BACKEND LINE READS THE CLASSIFICATION THE GATE READS (review
  // finding, 28.08.2026, round 17). It used to call every unaccounted entry of
  // the last run an "unaccounted red" — the crash sentence and the
  // lost-recording sentence included, the two classes this point exists to tell
  // apart — and it consulted no signature, so a record already signed off was
  // reported as an open red for as long as it stayed the last run.
  it('names the last run by its own class, not as an unaccounted red', () => {
    const out = inTempRepo({
      runs: [
        { backend: 'webgpu', suite: 'startup', at: 1500, exit: 1, crashed: true, reds: [] },
        { backend: 'webgl', suite: 'settings', at: 1600, exit: 1, reds: [marker] },
      ],
    })
    expect(out).toMatch(/CRASHED RUN \(not an unexplained red\) in the last startup run/)
    expect(out).toMatch(/INCOMPLETE RECORDING \(not an unexplained red\) in the last settings run/)
    expect(out).not.toMatch(/unaccounted red in the last (startup|settings) run/)
  })

  it('stops reporting a signed-off record as an open red', () => {
    const crashed = { backend: 'webgpu', suite: 'startup', at: 1500, exit: 1, crashed: true, reds: [] }
    const out = inTempRepo({
      runs: [crashed],
      crashClosures: [
        {
          run: runIdentity(crashed),
          backend: 'webgpu',
          suite: 'startup',
          at: 1500,
          evidence: 'local/verify-logs/: SIGKILL at frame 3; the run wrote no report',
        },
      ],
    })
    expect(out).toMatch(/signed-off crashed run: webgpu\/startup/)
    expect(out).not.toMatch(/in the last startup run/)
  })

  // AND THE OPEN-CRASH PARAGRAPH DOES NOT CONTRADICT THE SIGN-OFF MESSAGE
  // (review finding, 28.08.2026, round 17). It said nothing in the run could be
  // explained or charged, while the sign-off says every red the run printed
  // before it died still blocks until it is fixed, charged or filed.
  it('says the crash carries no red, and that the reds it printed still close the ordinary ways', () => {
    const out = inTempRepo({
      runs: [{ backend: 'webgpu', suite: 'startup', at: 1500, exit: 1, crashed: true, reds: [] }],
    })
    expect(out).toMatch(/THE CRASH ITSELF carries no red anybody can own/)
    expect(out).toMatch(/PRINTED BEFORE it died was really observed and still closes those three/)
    expect(out).not.toMatch(/nothing in it can be explained or charged/)
  })

  // EVERY OPEN RECORD IS NAMED, not only the one behind an UNCOVERED backend
  // (review finding, 28.08.2026, round 18). The per-backend line is skipped the
  // moment a later run covers that backend — while the gate keeps blocking on
  // the earlier record all the same, so the inspection said "covered" about a
  // gate that was shut.
  it('names an open red that a later covering run hides from the per-backend line', () => {
    const out = inTempRepo({
      runs: [
        { backend: 'webgpu', suite: 'polish', at: 1500, exit: 1, reds: [{ name: 'a check nobody filed', kind: 'check', point: null }] },
        { backend: 'webgpu', suite: 'polish', at: 1600, exit: 0, asserted: true },
      ],
    })
    expect(out).toMatch(/covered by polish/)
    expect(out).toMatch(/unaccounted red: webgpu\/polish .* "a check nobody filed"/)
  })

  // AND EACH RECORD CLASS SAYS WHETHER IT BLOCKS RIGHT NOW. The two sign-off
  // families are deliberately window-free — a record that left the window lost
  // its blockage, never its obligation, and the CLI reads the same lists — so
  // the line owes the reader that difference instead of hiding it.
  it('says of each crashed record whether it is blocking now', () => {
    const out = inTempRepo({
      runs: [{ backend: 'webgpu', suite: 'startup', at: 1500, exit: 1, crashed: true, reds: [] }],
    })
    expect(out).toMatch(/CRASHED RUN \(not an unexplained red\).*BLOCKING NOW/)
  })

  it('falls back to startedAt where only that was measured', () => {
    const out = inTempRepo({
      runs: [{ backend: 'webgpu', suite: 'settings', startedAt: 1500, exit: 1, reds: [marker] }],
    })
    expect(out).toMatch(/@1970-01-01T00:00:01\.500Z/)
    expect(out).not.toMatch(/@undated/)
  })

  // The whole inspection used to die here: `new Date(out-of-range).toISOString()`
  // throws, and the recent-run table renders every record in the window.
  it('survives an unreadable stamp instead of aborting the inspection', () => {
    const out = inTempRepo({
      runs: [
        { backend: 'webgpu', suite: 'settings', at: Number.MAX_SAFE_INTEGER, exit: 1, reds: [marker] },
        { backend: 'webgl', suite: 'startup', at: 2000, exit: 0, asserted: true },
      ],
    })
    expect(out).toMatch(/t=9007199254740991/)
    // …and the run AFTER it is still printed, which is the point of surviving.
    expect(out).toMatch(/recent runs \(2 of 2\)/)
    expect(out).toMatch(/startup/)
  })
})
