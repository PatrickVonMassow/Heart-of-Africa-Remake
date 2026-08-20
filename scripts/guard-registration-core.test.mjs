import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evaluate,
  formatVerdict,
  registeredIdsFromSource,
  touchesGuardWiring,
} from './guard-registration-core.mjs'

const wire = (...ids) => ({
  hooks: {
    Stop: [{ hooks: ids.map((id) => ({ command: `node "$CLAUDE_PROJECT_DIR/scripts/${id}.mjs"` })) }],
  },
})

const registry = (...ids) =>
  ['export const GUARDS = [', ...ids.map((id) => `  {\n    id: '${id}',\n  },`), ']', ''].join('\n')

describe('which commits are judged', () => {
  it('judges a commit that touches the settings file', () => {
    expect(touchesGuardWiring(['.claude/settings.json'])).toBe(true)
  })

  it('judges a commit that touches any guard script', () => {
    expect(touchesGuardWiring(['scripts/clear-claim-guard.mjs'])).toBe(true)
    expect(touchesGuardWiring(['scripts/guard-preflight.mjs'])).toBe(true)
    expect(touchesGuardWiring(['scripts/guard-registration-core.mjs'])).toBe(true)
  })

  // The check taxes every commit it runs on, so a commit that cannot introduce
  // the drift is not asked about it at all.
  it('leaves every other commit alone', () => {
    expect(touchesGuardWiring(['src/world/river.ts', 'docs/design-reference.md'])).toBe(false)
    expect(touchesGuardWiring([])).toBe(false)
    expect(touchesGuardWiring(undefined)).toBe(false)
  })
})

describe('reading the registry as text', () => {
  it('reads the ids the GUARDS array registers', () => {
    expect(registeredIdsFromSource(registry('dashboard-guard', 'model-guard'))).toEqual([
      'dashboard-guard',
      'model-guard',
    ])
  })

  // The registry ends at the closing bracket; ids further down the file belong
  // to something else and must not count as registered.
  it('stops at the end of the array', () => {
    const source = `${registry('dashboard-guard')}\nconst OTHER = [{ id: 'not-a-guard' }]\n`
    expect(registeredIdsFromSource(source)).toEqual(['dashboard-guard'])
  })

  it('reports nothing for a source it does not recognise', () => {
    expect(registeredIdsFromSource('const x = 1')).toEqual([])
    expect(registeredIdsFromSource('')).toEqual([])
  })
})

describe('the verdict', () => {
  // THE 20.08.2026 REGRESSION, as it actually happened: clear-claim-guard was
  // wired as a Stop hook and left out of the registry. The commit was made, the
  // push was refused, main stood red and unpushed, and the other live session
  // declared itself blocked on it.
  it('blocks the commit that wires a Stop hook without registering it', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json', 'scripts/clear-claim-guard.mjs'],
      settingsJson: JSON.stringify(wire('dashboard-guard', 'clear-claim-guard')),
      preflightSource: registry('dashboard-guard'),
    })
    expect(verdict.block).toBe(true)
    expect(verdict.unregistered).toEqual(['clear-claim-guard'])
  })

  it('passes once the hook is registered', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json'],
      settingsJson: JSON.stringify(wire('dashboard-guard', 'clear-claim-guard')),
      preflightSource: registry('dashboard-guard', 'clear-claim-guard'),
    })
    expect(verdict.block).toBe(false)
    expect(verdict.unregistered).toEqual([])
  })

  it('does not judge a commit that touches no wiring, even with drift present', () => {
    const verdict = evaluate({
      paths: ['src/world/river.ts'],
      settingsJson: JSON.stringify(wire('clear-claim-guard')),
      preflightSource: registry('dashboard-guard'),
    })
    expect(verdict.block).toBe(false)
  })

  // FAIL OPEN on what it cannot read. A check that makes the tree uncommittable
  // because it failed to understand its own inputs is worse than the drift it
  // watches, and the pre-push gate still stands behind it.
  it('judges nothing when the settings file is unparseable', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json'],
      settingsJson: '{ not json',
      preflightSource: registry('dashboard-guard'),
    })
    expect(verdict.block).toBe(false)
  })

  it('judges nothing when the preflight source has no recognisable registry', () => {
    const verdict = evaluate({
      paths: ['scripts/guard-preflight.mjs'],
      settingsJson: JSON.stringify(wire('clear-claim-guard')),
      preflightSource: 'export const SOMETHING_ELSE = []',
    })
    expect(verdict.block).toBe(false)
  })
})

describe('the refusal', () => {
  it('names every unregistered hook and the file that fixes it', () => {
    const text = formatVerdict({ unregistered: ['clear-claim-guard'] })
    expect(text).toContain('clear-claim-guard')
    expect(text).toContain('scripts/guard-preflight.mjs')
    expect(text).toContain('scripts/guard-preflight-core.test.mjs')
  })
})

// THE REPOSITORY ITSELF. The two lists this check compares are the same pair
// the unit suite compares, so a green suite and a red check would mean one of
// them is reading the wrong thing.
describe('the real repository', () => {
  it('finds no drift in the checked-in state', () => {
    const root = process.cwd()
    const verdict = evaluate({
      paths: ['.claude/settings.json'],
      settingsJson: readFileSync(resolve(root, '.claude/settings.json'), 'utf8'),
      preflightSource: readFileSync(resolve(root, 'scripts/guard-preflight.mjs'), 'utf8'),
    })
    expect(verdict.unregistered, 'register these in scripts/guard-preflight.mjs').toEqual([])
  })
})
