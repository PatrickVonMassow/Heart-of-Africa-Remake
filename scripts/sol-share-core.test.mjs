// THE SWITCH HAS TO BE HONEST ABOUT WHERE WORK GOES (point 654). Its failure modes, each
// pinned below:
//   - a setting that routes work to Sol without saying so, or says so without routing it;
//   - `--more` wrapping around at an end, which would move load to the very vendor the
//     user was trying to spare;
//   - a broken state file taking the whole path down, or degrading in the SPENDING
//     direction instead of the safe one;
//   - a stale board note surviving a setting change, so the board says one thing while
//     the switch does another;
//   - a consumer keeping its own copy of the table instead of asking this core.
import { describe, it, expect } from 'vitest'
import { KINDS as ASK_KINDS } from './ask-sol-core.mjs'
import {
  DEFAULT_SETTING,
  KINDS,
  KIND_NOTES,
  NEVER_ROUTED,
  SAFE_SETTING,
  SETTINGS,
  SETTING_NOTES,
  applyFooterNote,
  boardNoteSegment,
  briefLine,
  kindsToSol,
  normaliseSetting,
  readSetting,
  routeFor,
  routingTable,
  settingPathFrom,
  statusLine,
  step,
  writeState,
} from './sol-share-core.mjs'

describe('the settings themselves', () => {
  it('are ordered from the least Sol to the most, with the default in the middle', () => {
    expect(SETTINGS).toEqual(['claude-only', 'default', 'prefer-sol'])
    expect(DEFAULT_SETTING).toBe('default')
    for (const s of SETTINGS) expect(SETTING_NOTES[s]).toBeTruthy()
    expect(NEVER_ROUTED.length).toBeGreaterThan(0)
  })

  it('carry every kind ask-sol can actually do, and no kind nothing can route', () => {
    expect(KINDS).toEqual(['review', ...ASK_KINDS])
    for (const kind of KINDS) expect(KIND_NOTES[kind]).toBeTruthy()
  })

  it('takes only a real setting, whatever the casing and the spacing', () => {
    expect(normaliseSetting(' Prefer-Sol ')).toBe('prefer-sol')
    expect(normaliseSetting('sol')).toBeNull()
    expect(normaliseSetting(undefined)).toBeNull()
  })
})

describe('routing', () => {
  it('sends only the review to Sol at the default — today’s behaviour, unchanged', () => {
    expect(routeFor('review', 'default')).toBe('sol')
    for (const kind of ASK_KINDS) expect(routeFor(kind, 'default')).toBe('claude')
  })

  it('sends every read-only kind to Sol at prefer-sol', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'prefer-sol')).toBe('sol')
    expect(kindsToSol('prefer-sol')).toEqual(KINDS)
  })

  it('sends NOTHING to Sol at claude-only — the reviews included, that being the point', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'claude-only')).toBe('claude')
    expect(kindsToSol('claude-only')).toEqual([])
  })

  it('answers `claude` for an unknown kind and an unknown setting rather than throwing', () => {
    expect(routeFor('author', 'prefer-sol')).toBe('claude')
    expect(routeFor('diagnose', 'whatever')).toBe('claude')
  })

  it('offers the whole table, so no consumer has to keep its own copy', () => {
    const table = routingTable('prefer-sol')
    expect(table.map((r) => r.kind)).toEqual(KINDS)
    for (const row of table) expect(row.to).toBe('sol')
  })
})

describe('stepping the ladder', () => {
  it('moves one setting per step, in both directions', () => {
    expect(step('default', 'more')).toMatchObject({ to: 'prefer-sol', changed: true })
    expect(step('default', 'less')).toMatchObject({ to: 'claude-only', changed: true })
    expect(step('claude-only', 'more')).toMatchObject({ to: 'default', changed: true })
  })

  it('stops at each end instead of wrapping around to the opposite vendor', () => {
    expect(step('prefer-sol', 'more')).toMatchObject({ to: 'prefer-sol', changed: false, atEnd: true })
    expect(step('claude-only', 'less')).toMatchObject({ to: 'claude-only', changed: false, atEnd: true })
  })

  it('starts from the default when the state says something unusable, and refuses a non-direction', () => {
    expect(step('nonsense', 'more').from).toBe('default')
    expect(() => step('default', 'sideways')).toThrow()
  })
})

describe('the state file', () => {
  it('reads a written state back', () => {
    const state = writeState('prefer-sol', { now: 1_700_000_000_000, by: 'test' })
    expect(readSetting(JSON.stringify(state))).toMatchObject({ setting: 'prefer-sol', changedAt: 1_700_000_000_000, changedBy: 'test', problem: '' })
  })

  it('reads an ABSENT file as the default — nothing was ever set', () => {
    expect(readSetting(null)).toMatchObject({ setting: 'default', problem: '', corrupt: false })
    expect(readSetting('')).toMatchObject({ setting: 'default', corrupt: false })
  })

  // Cross-vendor review, 12.08.2026: falling back to `default` meant a CORRUPTED
  // `claude-only` state quietly began sending reviews to Sol again — fail-open in exactly
  // the direction this switch exists to prevent.
  it('reads a BROKEN file as the setting that spends nothing, and names the problem', () => {
    expect(readSetting('{not json')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('{not json').problem).toMatch(/not JSON/)
    expect(readSetting('{"setting":"sol-only"}')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('{"setting":"sol-only"}').problem).toMatch(/not one of/)
    expect(SAFE_SETTING).toBe('claude-only')
    for (const kind of KINDS) expect(routeFor(kind, SAFE_SETTING)).toBe('claude')
    expect(readSetting('{"setting":"prefer-sol","changedAt":"soon"}').changedAt).toBeNull()
  })

  it('refuses to write a setting that is not one', () => {
    expect(() => writeState('sol-only')).toThrow()
  })

  it('lives in the MAIN checkout, so a worktree agent reads the setting the user flipped', () => {
    expect(settingPathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/agent-a1')).toBe('/workspace/hoa/.claude/sol-share.json')
    expect(settingPathFrom('', '/workspace/hoa')).toBe('/workspace/hoa/.claude/sol-share.json')
  })
})

describe('what it says', () => {
  it('states in ONE line what goes where', () => {
    const line = statusLine('default')
    expect(line.split('\n')).toHaveLength(1)
    expect(line).toMatch(/to GPT-5\.6 Sol: review/)
    expect(line).toMatch(/to Claude: diagnose/)
    expect(statusLine('claude-only')).toMatch(/to GPT-5\.6 Sol: nothing/)
    expect(statusLine('prefer-sol')).toMatch(/to Claude: nothing/)
  })

  it('tells a delegated agent what to hand over, at every setting', () => {
    expect(briefLine('prefer-sol')).toMatch(/ask-sol\.mjs/)
    expect(briefLine('prefer-sol')).toMatch(/diagnose/)
    expect(briefLine('claude-only')).toMatch(/do NOT call/)
    expect(briefLine('default')).toMatch(/reviews go to GPT-5\.6 Sol/)
    for (const s of SETTINGS) expect(briefLine(s)).toBeTruthy()
  })
})

describe('the board note', () => {
  const footer = (inner) => `<main>x</main><footer>${inner}</footer>`

  it('says nothing at the default — a note that is always there is one nobody reads', () => {
    expect(boardNoteSegment('default')).toBe('')
    const html = footer('Stand: 11.08.2026 · 3 offene Punkte')
    expect(applyFooterNote(html, 'default')).toBe(html)
  })

  it('names a non-default setting in the board’s own language', () => {
    expect(applyFooterNote(footer('Stand: 11.08.2026 · 3 offene Punkte'), 'prefer-sol')).toContain(
      'Sol-Routing: prefer-sol — Diagnose, Audit, Aufzählungen und Erklärungen laufen über GPT-5.6 Sol',
    )
    expect(applyFooterNote(footer('Stand: x'), 'claude-only')).toContain('Sol-Routing: claude-only')
  })

  it('replaces a stale note rather than stacking one on the other', () => {
    const once = applyFooterNote(footer('Stand: x · 3 offene Punkte'), 'prefer-sol')
    const twice = applyFooterNote(once, 'claude-only')
    expect(twice.match(/Sol-Routing:/g)).toHaveLength(1)
    expect(twice).toContain('claude-only')
    expect(applyFooterNote(twice, 'default')).not.toMatch(/Sol-Routing/)
  })

  it('keeps the footer’s own segments, and leaves a board without a footer alone', () => {
    const out = applyFooterNote(footer('Stand: x · 3 offene Punkte · lädt sich alle 30 s selbst neu.'), 'prefer-sol')
    expect(out).toContain('3 offene Punkte')
    expect(out).toContain('lädt sich alle 30 s selbst neu.')
    expect(applyFooterNote('<main>no footer</main>', 'prefer-sol')).toBe('<main>no footer</main>')
  })
})
