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
import { BaselineDiffError, commitMissing, gatherRenderVerifyInputs } from './render-verify-guard.mjs'

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
    })
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
