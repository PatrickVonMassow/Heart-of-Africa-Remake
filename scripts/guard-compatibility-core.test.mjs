import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handoverSurvivesCall } from './batch-boundary-core.mjs'
import {
  SEALED_BOUNDARY_CAUSE,
  SEALED_BOUNDARY_POSTURES,
  guardCompatibility,
  prescribedCommands,
  sealedBoundaryPosture,
} from './guard-compatibility-core.mjs'
import { repoPath } from './repo-paths.mjs'

const permitted = (command) => handoverSurvivesCall({ toolName: 'Bash', command }).survives === true

describe('the sealed-boundary posture of one guard', () => {
  it('clears a guard that stands down there, whatever it would otherwise prescribe', () => {
    expect(sealedBoundaryPosture({ standsDown: true, prescribes: ['sleep 90'], permitted }))
      .toMatchObject({ posture: SEALED_BOUNDARY_POSTURES.STANDS_DOWN, forbidden: [] })
  })

  it('clears a guard whose every remedy is part of ending', () => {
    expect(sealedBoundaryPosture({ prescribes: ['node scripts/board-publish.mjs'], permitted }).posture)
      .toBe(SEALED_BOUNDARY_POSTURES.PRESCRIBES_PERMITTED)
  })

  it('names the deadlock when a refusal prescribes what the boundary forbids', () => {
    // This is the measured 03.09.2026 pair, in miniature: the guard told the
    // session to wait, and waiting was the one thing the seal refused.
    const verdict = sealedBoundaryPosture({ prescribes: ['sleep 90'], permitted })
    expect(verdict.posture).toBe(SEALED_BOUNDARY_POSTURES.DEADLOCK)
    expect(verdict.forbidden).toEqual(['sleep 90'])
  })

  it('is total — missing fields, wrong types and a throwing predicate all answer', () => {
    expect(() => sealedBoundaryPosture()).not.toThrow()
    expect(sealedBoundaryPosture({ prescribes: null }).posture).toBe(SEALED_BOUNDARY_POSTURES.PRESCRIBES_PERMITTED)
    expect(sealedBoundaryPosture({ prescribes: ['x'], permitted: () => { throw new Error('boom') } }).forbidden)
      .toEqual([])
    expect(guardCompatibility(null).ok).toBe(true)
  })
})

describe('what a guard prescribes is read out of its own text', () => {
  it('finds this repository\'s commands in every wrapper form it is written in', () => {
    const source = [
      'run `node scripts/board-publish.mjs` first',
      'node "$CLAUDE_PROJECT_DIR/scripts/finding.mjs" --request',
      'node ${CLAUDE_PROJECT_DIR}/scripts/focus.mjs show',
      'node scripts/verify/run-wait.mjs',
      'then sleep 90 and look again',
    ].join('\n')
    expect(prescribedCommands(source)).toEqual([
      'node scripts/board-publish.mjs',
      'node scripts/finding.mjs',
      'node scripts/focus.mjs',
      'node scripts/verify/run-wait.mjs',
      'sleep 90',
    ])
  })

  it('ignores commands the boundary does not reason about, and is total', () => {
    expect(prescribedCommands('run git status, then npm run build')).toEqual([])
    expect(prescribedCommands()).toEqual([])
    expect(prescribedCommands(42)).toEqual([])
  })
})

// THE INVARIANT ITSELF, over the guards actually registered. The list is read
// from the settings file rather than kept here, so a NEW Stop guard is covered
// the moment it is registered.
describe('no registered Stop guard prescribes what a committed boundary forbids', () => {
  const settings = JSON.parse(readFileSync(repoPath('.claude/settings.json'), 'utf8'))
  const names = (settings.hooks?.Stop ?? []).flatMap((group) =>
    (group.hooks ?? []).map((hook) => hook.command?.match(/scripts[\\/]([A-Za-z0-9/_-]+\.mjs)/)?.[1]).filter(Boolean),
  )

  it('reads a non-empty list of Stop guards from the settings file', () => {
    expect(names.length).toBeGreaterThan(10)
    expect(names).toContain('ci-status-guard.mjs')
  })

  it('holds for every one of them', () => {
    const guards = names.map((name) => {
      let source = ''
      try {
        source = readFileSync(repoPath('scripts', name), 'utf8')
      } catch {
        source = '' // a guard whose file moved is a different test's problem
      }
      return {
        name,
        standsDown: source.includes(SEALED_BOUNDARY_CAUSE),
        prescribes: prescribedCommands(source),
      }
    })
    const verdict = guardCompatibility(guards, permitted)
    // The message carries the offending pairs, because "a guard deadlocks" is
    // useless without knowing which remedy the boundary refuses.
    expect(verdict.deadlocks.map((d) => `${d.guard}: ${d.forbidden.join(', ')}`)).toEqual([])
    expect(verdict.ok).toBe(true)
  })
})
