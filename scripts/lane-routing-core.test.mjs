// THE SWITCH HAS TO BE HONEST ABOUT WHERE WORK GOES (point 654). Its failure modes, each
// pinned below:
//   - a setting that routes work to the cross lane without saying so, or says so without routing it;
//   - `--more` wrapping around at an end, which would move load to the very vendor the
//     user was trying to spare;
//   - a broken state file taking the whole path down, or degrading in the SPENDING
//     direction instead of the safe one;
//   - a stale board note surviving a setting change, so the board says one thing while
//     the switch does another;
//   - a consumer keeping its own copy of the table instead of asking this core.
import { describe, it, expect } from 'vitest'
import { KINDS as ASK_KINDS } from './ask-lane-core.mjs'
import { CROSS, LEGACY, MAIN, SCARCE } from './model-lanes.mjs'
import {
  DEFAULT_SETTING,
  KINDS,
  KIND_NOTES,
  NEVER_ROUTED,
  SAFE_SETTING,
  SETTINGS,
  SETTING_NOTES,
  OUTAGE_PROBE_MS,
  afterLaneRun,
  applyFooterNote,
  boardNoteSegment,
  effectiveRoute,
  fallbackLine,
  briefLine,
  kindsToLane,
  normaliseSetting,
  readSetting,
  routeFor,
  routingTable,
  settingOrSafe,
  settingPathFrom,
  statusLine,
  step,
  writeState,
} from './lane-routing-core.mjs'

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const legacySettingFor = (setting) => Object.keys(LEGACY.routingSettings).find((key) => LEGACY.routingSettings[key] === setting)

describe('the settings themselves', () => {
  it('are ordered from the least cross-lane work to the most, with the default in the middle', () => {
    expect(SETTINGS).toEqual(['main-only', 'default', 'prefer-cross'])
    expect(DEFAULT_SETTING).toBe('default')
    for (const s of SETTINGS) expect(SETTING_NOTES[s]).toBeTruthy()
    expect(NEVER_ROUTED.length).toBeGreaterThan(0)
  })

  it('carry every kind that can actually be routed, and no kind nothing can', () => {
    // `author` joined the table when scripts/author-delegate.mjs made it routable
    // (point 667) — the switch's biggest lever, and the reason it exists.
    expect(KINDS).toEqual(['review', ...ASK_KINDS, 'author'])
    for (const kind of KINDS) expect(KIND_NOTES[kind]).toBeTruthy()
  })

  // U9: the older spellings are READ (a stored state keeps routing as it did) but never
  // written and never accepted as a setting to set.
  it('reads an older stored spelling through LEGACY, but takes none as a setting to write', () => {
    expect(readSetting(JSON.stringify({ setting: legacySettingFor('main-only') }))).toMatchObject({ setting: 'main-only', corrupt: false })
    expect(readSetting(JSON.stringify({ setting: legacySettingFor('prefer-cross') }))).toMatchObject({ setting: 'prefer-cross', corrupt: false })
    expect(normaliseSetting(legacySettingFor('prefer-cross'))).toBeNull()
    expect(() => writeState(legacySettingFor('main-only'))).toThrow()
  })

  it('takes only a real setting, whatever the casing and the spacing', () => {
    expect(normaliseSetting(' Prefer-Cross ')).toBe('prefer-cross')
    expect(normaliseSetting('cross')).toBeNull()
    expect(normaliseSetting(undefined)).toBeNull()
  })
})

describe('routing', () => {
  it('sends review and enumerate to the cross lane at default, keeping the other kinds on the main chain', () => {
    expect(routeFor('review', 'default')).toBe('cross')
    expect(routeFor('enumerate', 'default')).toBe('cross')
    for (const kind of ['diagnose', 'audit', 'explain', 'author']) expect(routeFor(kind, 'default'), kind).toBe('main')
    expect(kindsToLane('cross', 'default')).toEqual(['review', 'enumerate'])
    expect(kindsToLane('main', 'default')).toEqual(['diagnose', 'audit', 'explain', 'author'])
    expect(kindsToLane('scarce', 'default')).toEqual([])
    expect(() => kindsToLane('nobody', 'default')).toThrow()
  })

  it('sends every read-only kind to the cross lane at prefer-cross', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'prefer-cross')).toBe('cross')
    expect(kindsToLane('cross', 'prefer-cross')).toEqual(KINDS)
  })

  it('sends NOTHING to the cross lane at main-only — the reviews included, that being the point', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'main-only')).toBe('main')
    expect(kindsToLane('cross', 'main-only')).toEqual([])
  })

  // Audit finding, 12.08.2026: an unknown setting used to route as the DEFAULT, and the
  // default sends reviews to the cross lane — so a garbled value spent the second vendor's
  // allowance. The old case only asked about `diagnose`, whose default route is the main chain
  // anyway, and so proved nothing.
  it('routes an unknown setting as the SAFE one — the review included, which is where it hid', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'whatever'), kind).toBe('main')
    expect(routeFor('review', 'whatever')).toBe('main')
    expect(routeFor('review', undefined)).toBe('main')
    expect(settingOrSafe('whatever')).toBe(SAFE_SETTING)
    expect(settingOrSafe('prefer-cross')).toBe('prefer-cross')
  })

  it('answers `main` for an unknown kind rather than throwing', () => {
    expect(routeFor('landing', 'prefer-cross')).toBe('main')
    expect(routeFor('', 'prefer-cross')).toBe('main')
  })

  it('routes AUTHORING only at prefer-cross — the lane the operator can turn off', () => {
    // The whole cross-lane authoring hangs off this row (point 667): at the two
    // lower settings the work stays on the main chain, exactly as it did before.
    expect(routeFor('author', 'prefer-cross')).toBe('cross')
    expect(routeFor('author', 'default')).toBe('main')
    expect(routeFor('author', 'main-only')).toBe('main')
    // …and an unusable state falls back to the setting that spends nothing new.
    expect(routeFor('author', 'garbled')).toBe('main')
  })

  it('offers the whole table, so no consumer has to keep its own copy', () => {
    const table = routingTable('prefer-cross')
    expect(table.map((r) => r.kind)).toEqual(KINDS)
    for (const row of table) expect(row.to).toBe('cross')
  })
})

describe('stepping the ladder', () => {
  it('moves one setting per step, in both directions', () => {
    expect(step('default', 'more')).toMatchObject({ to: 'prefer-cross', changed: true })
    expect(step('default', 'less')).toMatchObject({ to: 'main-only', changed: true })
    expect(step('main-only', 'more')).toMatchObject({ to: 'default', changed: true })
  })

  it('stops at each end instead of wrapping around to the opposite vendor', () => {
    expect(step('prefer-cross', 'more')).toMatchObject({ to: 'prefer-cross', changed: false, atEnd: true })
    expect(step('main-only', 'less')).toMatchObject({ to: 'main-only', changed: false, atEnd: true })
  })

  it('starts from the default when the state says something unusable, and refuses a non-direction', () => {
    expect(step('nonsense', 'more').from).toBe(SAFE_SETTING)
    expect(() => step('default', 'sideways')).toThrow()
  })
})

describe('the state file', () => {
  it('reads a written state back', () => {
    const state = writeState('prefer-cross', { now: 1_700_000_000_000, by: 'test' })
    expect(readSetting(JSON.stringify(state))).toMatchObject({ setting: 'prefer-cross', changedAt: 1_700_000_000_000, changedBy: 'test', problem: '' })
  })

  it('reads an ABSENT file as the default — nothing was ever set', () => {
    expect(readSetting(null)).toMatchObject({ setting: 'default', problem: '', corrupt: false })
    expect(readSetting(undefined)).toMatchObject({ setting: 'default', corrupt: false })
  })

  // Audit finding, 12.08.2026: an EMPTY file is not an absent one — it is what a torn
  // write leaves behind, and reading it as "never set" resumed spending on a state the
  // operator had chosen.
  it('reads an EMPTY file as broken, not as never-set', () => {
    expect(readSetting('')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('   \n').problem).toMatch(/EMPTY/)
  })

  // Same audit: `1e300` is finite and positive, and `new Date(1e300).toISOString()`
  // THROWS — taking down the status report of a switch that promises not to break its
  // caller.
  it('drops a timestamp no Date can hold, so the status report cannot crash on it', () => {
    expect(readSetting('{"setting":"prefer-cross","changedAt":1e300}').changedAt).toBeNull()
    expect(readSetting('{"setting":"prefer-cross","changedAt":-5}').changedAt).toBeNull()
    expect(readSetting('{"setting":"prefer-cross","changedAt":1700000000000}').changedAt).toBe(1_700_000_000_000)
  })

  // Cross-vendor review, 12.08.2026: falling back to `default` meant a CORRUPTED
  // `main-only` state quietly began sending reviews to the cross lane again — fail-open in exactly
  // the direction this switch exists to prevent.
  it('reads a BROKEN file as the setting that spends nothing, and names the problem', () => {
    expect(readSetting('{not json')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('{not json').problem).toMatch(/not JSON/)
    expect(readSetting('{"setting":"cross-only"}')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('{"setting":"cross-only"}').problem).toMatch(/not one of/)
    expect(SAFE_SETTING).toBe('main-only')
    for (const kind of KINDS) expect(routeFor(kind, SAFE_SETTING)).toBe('main')
    expect(readSetting('{"setting":"prefer-cross","changedAt":"soon"}').changedAt).toBeNull()
  })

  it('refuses to write a setting that is not one', () => {
    expect(() => writeState('cross-only')).toThrow()
  })

  it('lives in the MAIN checkout, so a worktree agent reads the setting the user flipped', () => {
    expect(settingPathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/agent-a1')).toBe('/workspace/hoa/.claude/lane-routing.json')
    expect(settingPathFrom('/workspace/hoa/.git', '/workspace/hoa')).toBe('/workspace/hoa/.claude/lane-routing.json')
    expect(settingPathFrom('', '/workspace/hoa')).toBe('/workspace/hoa/.claude/lane-routing.json')
    expect(settingPathFrom('/srv/hoa.git', '/workspace/hoa')).toBe('/workspace/hoa/.claude/lane-routing.json')
  })
})

describe('what it says', () => {
  it('states in ONE line what goes where', () => {
    const line = statusLine('default')
    expect(line.split('\n')).toHaveLength(1)
    expect(line).toBe(`lane-routing: default — to ${CROSS.displayName}: review, enumerate · to the main chain: diagnose, audit, explain, author`)
    expect(SETTING_NOTES.default).toContain('reviews and enumerate to the cross lane; diagnose, audit, explain and author to the main chain')
    expect(statusLine('main-only')).toContain(`to ${CROSS.displayName}: nothing`)
    expect(statusLine('prefer-cross')).toMatch(/to the main chain: nothing/)
  })

  // Audit finding, 12.08.2026: presented bare, a safe setting reads as the operator's
  // choice, and nobody repairs the file it actually came from.
  it('says when a setting is a FALLBACK rather than a choice — in the brief and on the board', () => {
    expect(briefLine({ setting: SAFE_SETTING, corrupt: true })).toMatch(/FALLBACK — the share state file is unusable/)
    expect(briefLine(SAFE_SETTING)).not.toMatch(/FALLBACK/)
    expect(boardNoteSegment({ setting: SAFE_SETTING, corrupt: true })).toMatch(/Notfall-Rückfall/)
    expect(boardNoteSegment(SAFE_SETTING)).not.toMatch(/Notfall/)
    expect(applyFooterNote('<footer>Stand: x</footer>', { setting: SAFE_SETTING, corrupt: true })).toMatch(/Notfall-Rückfall/)
    // …and a bare setting is still accepted, so no caller has to build a state object.
    expect(applyFooterNote('<footer>Stand: x</footer>', SAFE_SETTING)).not.toMatch(/Notfall/)
  })

  it('tells a delegated agent what to hand over, at every setting', () => {
    expect(briefLine('prefer-cross')).toMatch(/ask-lane\.mjs/)
    expect(briefLine('prefer-cross')).toMatch(/diagnose/)
    expect(briefLine('main-only')).toMatch(/do NOT call/)
    expect(briefLine('default')).toContain(`reviews and enumerate go to the cross lane (${CROSS.displayName})`)
    expect(briefLine('default')).toContain('ask-lane.mjs --lane cross --kind enumerate')
    expect(briefLine('prefer-cross')).toContain('ask-lane.mjs --lane cross --kind <kind>')
    expect(briefLine('default')).toContain('Diagnose, audit, explain and author stay with the main chain')
    expect(briefLine('default')).toContain('a blind audit half uses `--anyway`')
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
    expect(applyFooterNote(footer('Stand: 11.08.2026 · 3 offene Punkte'), 'prefer-cross')).toContain(
      `Lane-Routing: prefer-cross — Reviews, Autorschaft, Diagnose, Audit, Aufzählungen und Erklärungen laufen über ${CROSS.displayName}`,
    )
    expect(applyFooterNote(footer('Stand: x'), 'main-only')).toContain('Lane-Routing: main-only')
  })

  it('removes a note written under an earlier label, too', () => {
    const old = footer('Stand: x · Old-Routing: something stale')
    expect(applyFooterNote(old, 'default')).toBe(footer('Stand: x'))
  })

  it('replaces a stale note rather than stacking one on the other', () => {
    const once = applyFooterNote(footer('Stand: x · 3 offene Punkte'), 'prefer-cross')
    const twice = applyFooterNote(once, 'main-only')
    expect(twice.match(/Lane-Routing:/g)).toHaveLength(1)
    expect(twice).toContain('main-only')
    expect(applyFooterNote(twice, 'default')).not.toMatch(/Lane-Routing/)
  })

  it('keeps the footer’s own segments, and leaves a board without a footer alone', () => {
    const out = applyFooterNote(footer('Stand: x · 3 offene Punkte · lädt sich alle 30 s selbst neu.'), 'prefer-cross')
    expect(out).toContain('3 offene Punkte')
    expect(out).toContain('lädt sich alle 30 s selbst neu.')
    expect(applyFooterNote('<main>no footer</main>', 'prefer-cross')).toBe('<main>no footer</main>')
  })
})

describe('the measured outage fallback (point 1194)', () => {
  const now = Date.UTC(2026, 8, 23, 11, 0)
  const limit = { ok: false, kind: 'allowance-exhausted', cause: 'the allowance for this account is exhausted' }
  const text = 'working …\nERROR: You have hit your usage limit. Try again later.'
  const fellBack = afterLaneRun({ outcome: limit, text, kind: 'author', now })
  const state = { setting: 'prefer-cross', corrupt: false, fallback: fellBack.fallback }

  it('a limit signature yields the main chain plus a probe clock', () => {
    expect(fellBack.fellBack).toBe(true)
    expect(fellBack.fallback).toMatchObject({ outage: 'allowance-exhausted', kind: 'author', since: now, probeAt: now + OUTAGE_PROBE_MS, probes: 1 })
    expect(fellBack.fallback.signature).toMatch(/usage limit/)
    for (const kind of KINDS) expect(effectiveRoute(kind, state, now + 1).to, kind).toBe('main')
    expect(effectiveRoute('author', state, now + 1).fallback).toEqual(fellBack.fallback)
  })

  it('an unreachable vendor is an outage too, and a renewal keeps its start and counts the probe', () => {
    const again = afterLaneRun({ outcome: { ok: false, kind: 'unreachable' }, text: 'stream disconnected', previous: fellBack.fallback, now: now + OUTAGE_PROBE_MS + 5 })
    expect(again.fellBack).toBe(true)
    expect(again.fallback).toMatchObject({ outage: 'unreachable', since: now, probes: 2, probeAt: now + 2 * OUTAGE_PROBE_MS + 5 })
  })

  it('an ordinary authoring failure is NOT a fallback — it stays the point\'s red', () => {
    for (const kind of ['error-exit', 'timeout', 'no-verdict', 'login-expired', 'model-refused']) {
      const run = afterLaneRun({ outcome: { ok: false, kind }, text: 'tests failed', kind: 'author', now })
      expect(run.fellBack, kind).toBe(false)
      expect(run.fallback, kind).toBeNull()
    }
    expect(effectiveRoute('author', { setting: 'prefer-cross', fallback: null }, now).to).toBe('cross')
    // …and it leaves a standing record exactly as it was.
    expect(afterLaneRun({ outcome: { ok: false, kind: 'error-exit' }, previous: fellBack.fallback, now }).fallback).toEqual(fellBack.fallback)
  })

  // U15: the record belongs to the cross lane; a run of another lane does not touch it.
  it('takes the lane explicitly: only a cross-lane run moves the record', () => {
    expect(afterLaneRun({ role: 'main', outcome: limit, text, now })).toEqual({ fallback: null, fellBack: false })
    expect(afterLaneRun({ role: 'scarce', outcome: { ok: true }, previous: fellBack.fallback, now }).fallback).toEqual(fellBack.fallback)
    expect(afterLaneRun({ role: 'cross', outcome: limit, text, kind: 'author', now })).toEqual(fellBack)
    expect(() => afterLaneRun({ role: 'nobody', outcome: limit })).toThrow()
  })

  it('an expired probe returns routing to the operator setting, and a success lifts the record', () => {
    const later = now + OUTAGE_PROBE_MS
    expect(effectiveRoute('author', state, later)).toEqual({ to: 'cross', fallback: null })
    expect(effectiveRoute('review', { ...state, setting: 'default' }, later).to).toBe('cross')
    expect(effectiveRoute('author', { ...state, setting: 'main-only' }, now).to).toBe('main')
    expect(fallbackLine(state, later)).toBe('')
    expect(afterLaneRun({ outcome: { ok: true }, previous: fellBack.fallback, now: later })).toEqual({ fallback: null, fellBack: false })
  })

  it('--status, the brief and the board name the active fallback, and keep the operator setting', () => {
    expect(statusLine(state, now + 1)).toMatch(new RegExp(`^lane-routing: prefer-cross \\(outage FALLBACK until .+\\) — to ${escapeRe(CROSS.displayName)}: nothing`))
    const line = fallbackLine(state, now + 1)
    expect(line).toMatch(/FALLBACK ACTIVE/)
    expect(line).toMatch(/usage limit/)
    expect(line).toContain(`${MAIN.displayName} authors`)
    expect(line).toContain(`${SCARCE.displayName} reads ${MAIN.displayName} work, recorded as a fallback`)
    expect(line).toMatch(/`prefer-cross` stays/)
    expect(statusLine(state, now + OUTAGE_PROBE_MS)).not.toMatch(/FALLBACK/)
    const live = { ...state, fallback: { ...state.fallback, probeAt: Date.now() + 60_000 } }
    expect(briefLine(live)).toMatch(/FALLBACK ACTIVE/)
    expect(boardNoteSegment(live)).toMatch(/^Lane-Routing: Ausfall-Rückfall \(allowance-exhausted\)/)
    expect(applyFooterNote('<footer>a</footer>', live)).toMatch(/Ausfall-Rückfall/)
  })

  it('a state file carries the record through a read, and drops a malformed one', () => {
    const written = writeState('prefer-cross', { now, fallback: fellBack.fallback })
    expect(readSetting(JSON.stringify(written)).fallback).toEqual(fellBack.fallback)
    expect(readSetting(JSON.stringify({ ...written, fallback: { outage: 'error-exit', since: now, probeAt: now + 1 } })).fallback).toBeNull()
    expect(writeState('default', { now })).not.toHaveProperty('fallback')
  })
})
