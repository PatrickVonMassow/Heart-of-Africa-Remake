// Layer 5 (point 434 part 3) — the I/O half. The decisions are proven in
// child-retry-core.test.mjs; what is proven HERE is that the file, git and env
// edges cannot turn a correct decision into a wrong one, and that a broken
// environment degrades instead of throwing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { POINT_TOKEN_CAP } from './child-retry-core.mjs'
import { readState, writeState, tokenCap, committedOnBranch, diagnoseBranch, logLine } from './child-retry.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-child-retry-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readState — a broken state file never stops the layer', () => {
  it('answers an empty state when the file does not exist', () => {
    // INDEPENDENCE: on the night of 29./30.07. the launcher log simply ENDED.
    // A layer that needs its own prior state to exist cannot act on the first
    // death of a fresh machine.
    expect(readState(join(dir, 'nope.json'))).toEqual({ deaths: [], points: {} })
  })

  it('answers an empty state on a half-written / corrupt document', () => {
    const p = join(dir, 'state.json')
    writeFileSync(p, '{"deaths": [{"sig')
    expect(readState(p)).toEqual({ deaths: [], points: {} })
  })

  it('answers an empty state when the file holds a non-object', () => {
    const p = join(dir, 'state.json')
    writeFileSync(p, '"paused"')
    expect(readState(p)).toEqual({ deaths: [], points: {} })
  })

  it('round-trips a written state', () => {
    const p = join(dir, 'state.json')
    writeState({ deaths: [], points: { 421: { retries: 1, tokens: 5 } } }, p)
    expect(readState(p).points[421]).toEqual({ retries: 1, tokens: 5 })
  })
})

describe('tokenCap — calibratable, but never by a nonsense value', () => {
  it('defaults to the core constant', () => {
    expect(tokenCap({})).toBe(POINT_TOKEN_CAP)
  })

  it('honours HOA_POINT_TOKEN_CAP', () => {
    expect(tokenCap({ HOA_POINT_TOKEN_CAP: '250000' })).toBe(250000)
  })

  it('ignores a non-numeric or non-positive override rather than capping at zero', () => {
    // Would have prevented: a typo in the environment silently refusing every
    // retry as "budget exhausted".
    expect(tokenCap({ HOA_POINT_TOKEN_CAP: 'lots' })).toBe(POINT_TOKEN_CAP)
    expect(tokenCap({ HOA_POINT_TOKEN_CAP: '0' })).toBe(POINT_TOKEN_CAP)
    expect(tokenCap({ HOA_POINT_TOKEN_CAP: '-5' })).toBe(POINT_TOKEN_CAP)
  })
})

describe('committedOnBranch — judged by OUTPUT, never by a log', () => {
  it('is false for a branch that does not exist', () => {
    expect(committedOnBranch('feat/does-not-exist-9f3a')).toBe(false)
  })

  it('is false when no branch was named', () => {
    expect(committedOnBranch(null)).toBe(false)
  })

  it('is false — never a throw — outside a git repository', () => {
    // Would have prevented: the whole retry command dying on a git edge and the
    // session getting no verdict at all.
    expect(committedOnBranch('main', { cwd: dir })).toBe(false)
  })

  it('sees the commits of a real branch, which is what makes the prompt say CONTINUE', () => {
    // The 30.07. layer-5b incident: a working agent declared dead because its
    // LOG was quiet while its branch had moved. Git activity is the evidence.
    expect(committedOnBranch('HEAD~1..HEAD')).toBe(false) // a range is not a branch → no claim
    expect(typeof committedOnBranch('HEAD')).toBe('boolean')
  })
})

describe('diagnoseBranch — terminal scheduling reads durable git evidence', () => {
  it('distinguishes a missing branch from an existing one', () => {
    expect(diagnoseBranch('feat/does-not-exist-9f3a')).toEqual({
      exists: false,
      committedSinceSpawn: false,
      branch: 'feat/does-not-exist-9f3a',
    })
    expect(diagnoseBranch('HEAD')).toMatchObject({ exists: true, branch: 'HEAD' })
  })

  it('fails closed to missing evidence outside a repository', () => {
    expect(diagnoseBranch('HEAD', { cwd: dir })).toEqual({ exists: false, committedSinceSpawn: false, branch: 'HEAD' })
  })
})

describe('the reason reaches the morning reader', () => {
  it('logLine appends a timestamped line', () => {
    const p = join(dir, 'child-retry.log')
    logLine('point 421 died: http-500 → retry', p)
    logLine('point 421 died: http-500 → outage-probe', p)
    const text = readFileSync(p, 'utf8')
    expect(text.split('\n').filter(Boolean)).toHaveLength(2)
    expect(text).toMatch(/outage-probe/)
  })

  it('logLine swallows an unwritable path instead of losing the decision with it', () => {
    // A silent recovery is forbidden, but so is a decision LOST because its log
    // could not be written.
    expect(() => logLine('x', join(dir, 'no-such-dir', 'a.log'))).not.toThrow()
  })

  it('exports no board writer at all any more (point 749)', async () => {
    // "Batch pausiert: Umgebungsausfall" used to be posted under "Von dir zu
    // klären", where it asked the user to check a machine-side outage and then
    // outlived the retry clock that cleared it. There is no writer left to call:
    // the pause marker and the retry state are the record, and the board derives
    // its state card from them.
    const module = await import('./child-retry.mjs')
    expect(Object.keys(module).filter((name) => /^board/.test(name))).toEqual([])
  })
})

describe('the CLI wires terminal decisions without a person-only exit', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts', 'child-retry.mjs'), 'utf8')

  it('persists the recovery record in the retry state and reaches no decision section', () => {
    expect(source).toMatch(/recordRecovery\(next, decision\)/)
    // Point 749: NO call site here may reach the user's decision section.
    expect(source).not.toMatch(/vdzk-add/)
    expect(source).not.toMatch(/boardCard\(/)
  })

  it('writes the outage pause with the decision clock, never a clockless marker', () => {
    expect(source).toMatch(/setPaused\(reason, \{ cause: 'outage', retryAfter: decision\.retryAt \}\)/)
    expect(source).not.toMatch(/outage-pause|NO-RETRY|by hand/)
  })

  it('turns an internal classifier error into a capped exchange record', () => {
    expect(source).toMatch(/fallbackRecoveryDecision\(\{/)
    expect(source).toMatch(/writeState\(recordRecovery\(readState\(\), decision\)\)/)
  })
})
