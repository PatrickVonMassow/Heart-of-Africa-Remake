// Decision-logic sweep of the closing-completeness guard (closing-guard-core):
// the version-tag command detector, the per-commit step accounting, and the
// top-level allow/deny — including totality on malformed input (the wrapper's
// fail-open depends on the core never throwing).
import { describe, it, expect } from 'vitest'
import {
  CLOSING_STEPS,
  STEP_IDS,
  isVersionTagCommand,
  missingSteps,
  evaluate,
} from './closing-guard-core.mjs'

/** A closing-state with the given step ids marked done (with evidence) for `commit`. */
function stateWith(commit, ids) {
  const steps = {}
  for (const id of ids) steps[id] = { evidence: `did ${id}` }
  return { commit, steps }
}
const ALL_IDS = CLOSING_STEPS.map((s) => s.id)
const HEAD = 'abc123def456'

describe('constants', () => {
  it('has a non-empty canonical checklist and a matching id set', () => {
    expect(CLOSING_STEPS.length).toBeGreaterThanOrEqual(8)
    expect(STEP_IDS.size).toBe(CLOSING_STEPS.length)
    // the cleanup steps that distinguish a closing from a regression MUST be present
    for (const id of ['large-regression', 'dead-code', 'stale-doc', 'stale-comment', 'md-audit'])
      expect(STEP_IDS.has(id)).toBe(true)
    // every step has a title
    for (const s of CLOSING_STEPS) expect(typeof s.title).toBe('string')
  })
})

describe('isVersionTagCommand', () => {
  it('matches creating/moving a version tag or poc', () => {
    expect(isVersionTagCommand('git tag -a v0.2 -m "demo" HEAD')).toBe(true)
    expect(isVersionTagCommand('git tag v1.0')).toBe(true)
    expect(isVersionTagCommand('git tag -f -a poc -m "mirror"')).toBe(true)
  })
  it('matches pushing a version tag or poc, and bulk tag pushes', () => {
    expect(isVersionTagCommand('git push origin v0.2')).toBe(true)
    expect(isVersionTagCommand('git push origin poc --force')).toBe(true)
    expect(isVersionTagCommand('git push origin --tags')).toBe(true)
    expect(isVersionTagCommand('git push --follow-tags origin main')).toBe(true)
    expect(isVersionTagCommand('git push origin v12.34')).toBe(true)
  })
  it('does NOT match ordinary git work or non-version tags', () => {
    expect(isVersionTagCommand('git push origin main')).toBe(false)
    expect(isVersionTagCommand('git commit -m "v0.2 is coming"')).toBe(false) // message mention only
    expect(isVersionTagCommand('git tag')).toBe(false)
    expect(isVersionTagCommand('git tag -l')).toBe(false)
    expect(isVersionTagCommand("git tag -l 'v*'")).toBe(false) // a glob list, not a vX.Y token
    expect(isVersionTagCommand('git tag release-candidate')).toBe(false)
    expect(isVersionTagCommand('git status')).toBe(false)
    expect(isVersionTagCommand('npm run build')).toBe(false)
  })
  it('does NOT match a version/poc token that lives in a COMMIT MESSAGE of a compound push (regression: this blocked its own commit)', () => {
    expect(isVersionTagCommand('git commit -m "the v0.2 / poc release notes" && git push origin main')).toBe(false)
    expect(isVersionTagCommand("git commit -m 'move poc to v0.3' ; git push origin main")).toBe(false)
    // the exact heredoc shape used to commit the guard itself
    expect(
      isVersionTagCommand('git add x\ngit commit -q -m "$(cat <<\'EOF\'\nmentions v0.2 and poc in the body\nEOF\n)"\ngit push origin main 2>&1 | tail -1'),
    ).toBe(false)
    // a refspec that merely starts with poc / looks version-ish is not the tag
    expect(isVersionTagCommand('git push origin poctest')).toBe(false)
    expect(isVersionTagCommand('git push origin feature/v2-work')).toBe(false)
  })
  it('is total on non-string input', () => {
    expect(isVersionTagCommand(null)).toBe(false)
    expect(isVersionTagCommand(undefined)).toBe(false)
    expect(isVersionTagCommand(42)).toBe(false)
    expect(isVersionTagCommand({})).toBe(false)
  })
})

describe('missingSteps — per-commit accounting', () => {
  it('is empty only when EVERY step is recorded for THIS commit', () => {
    expect(missingSteps(stateWith(HEAD, ALL_IDS), HEAD)).toEqual([])
  })
  it('reports the steps not yet recorded', () => {
    const partial = ALL_IDS.slice(0, 3)
    const missing = missingSteps(stateWith(HEAD, partial), HEAD).map((s) => s.id)
    expect(missing).not.toContain(partial[0])
    expect(missing).toContain('md-audit')
    expect(missing.length).toBe(CLOSING_STEPS.length - 3)
  })
  it('counts NOTHING when the state is for a different commit (a stale closing)', () => {
    expect(missingSteps(stateWith('other-commit', ALL_IDS), HEAD).length).toBe(CLOSING_STEPS.length)
  })
  it('counts nothing on null/empty state', () => {
    expect(missingSteps(null, HEAD).length).toBe(CLOSING_STEPS.length)
    expect(missingSteps({ commit: HEAD, steps: {} }, HEAD).length).toBe(CLOSING_STEPS.length)
  })
  it('ignores a step with blank/absent evidence and unknown step ids', () => {
    const s = { commit: HEAD, steps: { 'dead-code': { evidence: '   ' }, 'bogus-step': { evidence: 'x' }, 'stale-doc': {} } }
    const missing = missingSteps(s, HEAD).map((x) => x.id)
    expect(missing).toContain('dead-code') // blank evidence → not done
    expect(missing).toContain('stale-doc') // no evidence → not done
  })
  it('is total on malformed input', () => {
    expect(() => missingSteps('garbage', HEAD)).not.toThrow()
    expect(() => missingSteps({ commit: HEAD, steps: 'x' }, HEAD)).not.toThrow()
    expect(missingSteps({ commit: HEAD, steps: null }, null).length).toBe(CLOSING_STEPS.length)
  })
})

describe('evaluate — allow/deny', () => {
  it('allows any command that is not a version-tag act', () => {
    expect(evaluate({ command: 'git push origin main', state: null, headSha: HEAD }).block).toBe(false)
  })
  it('BLOCKS a version tag while the closing is incomplete, naming the missing steps', () => {
    const r = evaluate({ command: 'git tag -a v0.3 -m x', state: stateWith(HEAD, ['large-regression']), headSha: HEAD })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLOSING INCOMPLETE/)
    expect(r.reason).toMatch(/dead-code/)
    expect(r.reason).toMatch(/md-audit/)
  })
  it('BLOCKS a poc push on an incomplete closing', () => {
    expect(evaluate({ command: 'git push origin poc --force', state: null, headSha: HEAD }).block).toBe(true)
  })
  it('ALLOWS the tag once every step is recorded for the tagged commit', () => {
    expect(evaluate({ command: 'git tag -a v0.3 -m x', state: stateWith(HEAD, ALL_IDS), headSha: HEAD }).block).toBe(false)
  })
  it('BLOCKS when the complete state is for a DIFFERENT commit (fresh closing required)', () => {
    expect(evaluate({ command: 'git push origin v0.3', state: stateWith('older', ALL_IDS), headSha: HEAD }).block).toBe(true)
  })
  it('is total: malformed input never throws and fails OPEN', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ command: 42, state: {}, headSha: null }).block).toBe(false)
    expect(evaluate({ command: 'git tag v0.2', state: 'garbage', headSha: HEAD }).block).toBe(true) // garbage state → nothing done → block
  })
})
