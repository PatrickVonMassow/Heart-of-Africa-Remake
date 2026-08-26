import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evaluate,
  EXPECTED_PATH,
  formatVerdict,
  registeredIdsFromSource,
  STAGED_PATH_ARGS,
  touchesGuardWiring,
} from './guard-registration-core.mjs'

const wire = (...ids) => ({
  hooks: {
    Stop: [{ hooks: ids.map((id) => ({ command: `node "$CLAUDE_PROJECT_DIR/scripts/${id}.mjs"` })) }],
  },
})

const registry = (...ids) =>
  ['export const GUARDS = [', ...ids.map((id) => `  {\n    id: '${id}',\n  },`), ']', ''].join('\n')

const expected = (...ids) => `export const EXPECTED_GUARD_IDS = ${JSON.stringify(ids)}\n`

function expectUnreadableRegistry(source, registeredId) {
  const settingsJson = JSON.stringify(wire(registeredId, 'plain-guard'))
  const changed = evaluate({
    paths: ['scripts/guard-preflight.mjs'],
    settingsJson,
    preflightSource: source,
    expectedSource: expected(registeredId, 'plain-guard'),
  })
  expect(changed).toMatchObject({
    block: true,
    registryUnreadable: true,
    unregistered: [],
    why: 'this commit makes the GUARDS registry unreadable',
  })

  const unchanged = evaluate({
    paths: ['.claude/settings.json'],
    settingsJson,
    preflightSource: source,
    expectedSource: expected(registeredId, 'plain-guard'),
  })
  expect(unchanged.block).toBe(false)
  expect(unchanged.unregistered).toEqual([])
  expect(unchanged.why).toContain('no registry found')
}

describe('which commits are judged', () => {
  it('includes deletions and both sides of renames in the staged paths', () => {
    expect(STAGED_PATH_ARGS).toContain('--no-renames')
    expect(STAGED_PATH_ARGS.some((arg) => arg.startsWith('--diff-filter'))).toBe(false)
  })

  it('judges a commit that touches the settings file', () => {
    expect(touchesGuardWiring(['.claude/settings.json'])).toBe(true)
  })

  it('judges a commit that touches any guard script', () => {
    expect(touchesGuardWiring(['scripts/clear-claim-guard.mjs'])).toBe(true)
    expect(touchesGuardWiring(['scripts/guard-preflight.mjs'])).toBe(true)
    expect(touchesGuardWiring(['scripts/guard-registration-core.mjs'])).toBe(true)
    expect(touchesGuardWiring([EXPECTED_PATH])).toBe(true)
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

  it('does not treat a commented-out entry or text inside a string as registered', () => {
    const source = [
      'export const GUARDS = [',
      "  // { id: 'commented-out-guard' },",
      `  { note: "id: 'string-only-guard'" },`,
      "  { id: 'registered-guard' },",
      ']',
    ].join('\n')
    expect(registeredIdsFromSource(source)).toEqual(['registered-guard'])
  })

  it('reads double-quoted ids', () => {
    expect(registeredIdsFromSource('export const GUARDS = [{ id: "double-quoted" }]')).toEqual([
      'double-quoted',
    ])
  })

  it('reports a spread registry element as unreadable instead of returning a partial list', () => {
    const source = [
      "const OTHER = [{ id: 'spread-guard' }]",
      "export const GUARDS = [...OTHER, { id: 'plain-guard' }]",
    ].join('\n')
    expectUnreadableRegistry(source, 'spread-guard')
  })

  it('reports an identifier-valued id as unreadable instead of returning a partial list', () => {
    const source = [
      "const NAME = 'named-guard'",
      "export const GUARDS = [{ id: NAME }, { id: 'plain-guard' }]",
    ].join('\n')
    expectUnreadableRegistry(source, 'named-guard')
  })

  it('reports a template-literal id as unreadable instead of returning a partial list', () => {
    const source = "export const GUARDS = [{ id: `template-guard` }, { id: 'plain-guard' }]"
    expectUnreadableRegistry(source, 'template-guard')
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
      expectedSource: expected('dashboard-guard'),
    })
    expect(verdict.block).toBe(true)
    expect(verdict.unregistered).toEqual(['clear-claim-guard'])
  })

  it('passes once the hook is registered', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json'],
      settingsJson: JSON.stringify(wire('dashboard-guard', 'clear-claim-guard')),
      preflightSource: registry('dashboard-guard', 'clear-claim-guard'),
      expectedSource: expected('dashboard-guard', 'clear-claim-guard'),
    })
    expect(verdict.block).toBe(false)
    expect(verdict.unregistered).toEqual([])
  })

  it('blocks a commit that wires a hook and empties GUARDS', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json', 'scripts/guard-preflight.mjs'],
      settingsJson: JSON.stringify(wire('clear-claim-guard')),
      preflightSource: registry(),
      expectedSource: expected('clear-claim-guard'),
    })
    expect(verdict.block).toBe(true)
    expect(verdict.unregistered).toEqual(['clear-claim-guard'])
  })

  it('does not judge a commit that touches no wiring, even with drift present', () => {
    const verdict = evaluate({
      paths: ['src/world/river.ts'],
      settingsJson: JSON.stringify(wire('clear-claim-guard')),
      preflightSource: registry('dashboard-guard'),
      expectedSource: expected('dashboard-guard'),
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
      expectedSource: expected('dashboard-guard'),
    })
    expect(verdict.block).toBe(false)
  })

  it('blocks when the commit itself makes the preflight registry unrecognisable', () => {
    const verdict = evaluate({
      paths: ['scripts/guard-preflight.mjs'],
      settingsJson: JSON.stringify(wire('clear-claim-guard')),
      preflightSource: 'export const SOMETHING_ELSE = []',
      expectedSource: expected('clear-claim-guard'),
    })
    expect(verdict.block).toBe(true)
    expect(verdict.why).toBe('this commit makes the GUARDS registry unreadable')
    expect(formatVerdict(verdict)).toContain('this commit makes the GUARDS registry unreadable')
  })

  it('judges nothing when it cannot reach an unchanged preflight registry', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json'],
      settingsJson: JSON.stringify(wire('clear-claim-guard')),
      preflightSource: '',
      expectedSource: expected('clear-claim-guard'),
    })
    expect(verdict.block).toBe(false)
  })

  it('blocks a hook registered in settings and GUARDS but absent from the expected list', () => {
    const verdict = evaluate({
      paths: ['.claude/settings.json', 'scripts/guard-preflight.mjs'],
      settingsJson: JSON.stringify(wire('dashboard-guard', 'new-guard')),
      preflightSource: registry('dashboard-guard', 'new-guard'),
      expectedSource: expected('dashboard-guard'),
    })
    expect(verdict.block).toBe(true)
    expect(verdict.unregistered).toEqual([])
    expect(verdict.absentFromExpected).toEqual(['new-guard'])
  })

  it('blocks a staged deletion or malformed expected-guard list', () => {
    const verdict = evaluate({
      paths: [EXPECTED_PATH],
      settingsJson: JSON.stringify(wire('dashboard-guard')),
      preflightSource: registry('dashboard-guard'),
      expectedSource: 'export const SOMETHING_ELSE = []',
    })
    expect(verdict).toMatchObject({ block: true, expectedUnreadable: true })
    expect(formatVerdict(verdict)).toContain('expected-guard list unreadable')
  })

  it('blocks an expected guard omitted from GUARDS even when it is not a Stop hook', () => {
    const verdict = evaluate({
      paths: ['scripts/guard-preflight.mjs'],
      settingsJson: JSON.stringify(wire('dashboard-guard')),
      preflightSource: registry('dashboard-guard'),
      expectedSource: expected('dashboard-guard', 'commission-guard'),
    })
    expect(verdict.block).toBe(true)
    expect(verdict.absentFromRegistry).toEqual(['commission-guard'])
  })

  it('blocks duplicate ids in either list', () => {
    const verdict = evaluate({
      paths: [EXPECTED_PATH],
      settingsJson: JSON.stringify(wire('dashboard-guard')),
      preflightSource: registry('dashboard-guard', 'dashboard-guard'),
      expectedSource: expected('dashboard-guard', 'dashboard-guard'),
    })
    expect(verdict).toMatchObject({
      block: true,
      duplicateExpected: ['dashboard-guard'],
      duplicateRegistry: ['dashboard-guard'],
    })
  })
})

describe('the refusal', () => {
  it('names every unregistered hook and the file that fixes it', () => {
    const text = formatVerdict({ unregistered: ['clear-claim-guard'] })
    expect(text).toContain('clear-claim-guard')
    expect(text).toContain('scripts/guard-preflight.mjs')
    expect(text).toContain(EXPECTED_PATH)
  })
})

// THE REPOSITORY ITSELF. Settings, GUARDS and the shared expected list must all
// describe the same checked-in chain.
describe('the real repository', () => {
  it('finds no drift in the checked-in state', () => {
    const root = process.cwd()
    const verdict = evaluate({
      paths: ['.claude/settings.json'],
      settingsJson: readFileSync(resolve(root, '.claude/settings.json'), 'utf8'),
      preflightSource: readFileSync(resolve(root, 'scripts/guard-preflight.mjs'), 'utf8'),
      expectedSource: readFileSync(resolve(root, EXPECTED_PATH), 'utf8'),
    })
    expect(verdict).toMatchObject({
      block: false,
      unregistered: [],
      absentFromExpected: [],
      absentFromRegistry: [],
      duplicateExpected: [],
      duplicateRegistry: [],
    })
  })
})
