// THE SWITCH HAS TO BE HONEST ABOUT WHERE WORK GOES (point 654). Its failure modes, each
// pinned below:
//   - a setting that routes work to Astra without saying so, or says so without routing it;
//   - `--more` wrapping around at an end, which would move load to the very vendor the
//     user was trying to spare;
//   - a broken state file taking the whole path down, or degrading in the SPENDING
//     direction instead of the safe one;
//   - a stale board note surviving a setting change, so the board says one thing while
//     the switch does another;
//   - a consumer keeping its own copy of the table instead of asking this core.
import { describe, it, expect } from 'vitest'
import { KINDS as ASK_KINDS } from './ask-astra-core.mjs'
import {
  DEFAULT_SETTING,
  KINDS,
  KIND_NOTES,
  NEVER_ROUTED,
  SAFE_SETTING,
  SETTINGS,
  SETTING_NOTES,
  OUTAGE_PROBE_MS,
  afterAstraRun,
  applyFooterNote,
  boardNoteSegment,
  effectiveRoute,
  fallbackLine,
  briefLine,
  kindsToAstra,
  normaliseSetting,
  readSetting,
  routeFor,
  routingTable,
  settingOrSafe,
  settingPathFrom,
  statusLine,
  step,
  writeState,
} from './astra-share-core.mjs'

describe('the settings themselves', () => {
  it('are ordered from the least Astra to the most, with the default in the middle', () => {
    expect(SETTINGS).toEqual(['claude-only', 'default', 'prefer-astra'])
    expect(DEFAULT_SETTING).toBe('default')
    for (const s of SETTINGS) expect(SETTING_NOTES[s]).toBeTruthy()
    expect(NEVER_ROUTED.length).toBeGreaterThan(0)
  })

  it('carry every kind that can actually be routed, and no kind nothing can', () => {
    // `author` joined the table when scripts/author-astra.mjs made it routable
    // (point 667) — the switch's biggest lever, and the reason it exists.
    expect(KINDS).toEqual(['review', ...ASK_KINDS, 'author'])
    for (const kind of KINDS) expect(KIND_NOTES[kind]).toBeTruthy()
  })

  it('takes only a real setting, whatever the casing and the spacing', () => {
    expect(normaliseSetting(' Prefer-Astra ')).toBe('prefer-astra')
    expect(normaliseSetting('astra')).toBeNull()
    expect(normaliseSetting(undefined)).toBeNull()
  })
})

describe('routing', () => {
  it('sends review and enumerate to Astra at default, keeping the other kinds with Claude', () => {
    expect(routeFor('review', 'default')).toBe('astra')
    expect(routeFor('enumerate', 'default')).toBe('astra')
    for (const kind of ['diagnose', 'audit', 'explain', 'author']) expect(routeFor(kind, 'default'), kind).toBe('claude')
    expect(kindsToAstra('default')).toEqual(['review', 'enumerate'])
  })

  it('sends every read-only kind to Astra at prefer-astra', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'prefer-astra')).toBe('astra')
    expect(kindsToAstra('prefer-astra')).toEqual(KINDS)
  })

  it('sends NOTHING to Astra at claude-only — the reviews included, that being the point', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'claude-only')).toBe('claude')
    expect(kindsToAstra('claude-only')).toEqual([])
  })

  // Audit finding, 12.08.2026: an unknown setting used to route as the DEFAULT, and the
  // default sends reviews to Astra — so a garbled value spent the second vendor's
  // allowance. The old case only asked about `diagnose`, whose default route is Claude
  // anyway, and so proved nothing.
  it('routes an unknown setting as the SAFE one — the review included, which is where it hid', () => {
    for (const kind of KINDS) expect(routeFor(kind, 'whatever'), kind).toBe('claude')
    expect(routeFor('review', 'whatever')).toBe('claude')
    expect(routeFor('review', undefined)).toBe('claude')
    expect(settingOrSafe('whatever')).toBe(SAFE_SETTING)
    expect(settingOrSafe('prefer-astra')).toBe('prefer-astra')
  })

  it('answers `claude` for an unknown kind rather than throwing', () => {
    expect(routeFor('landing', 'prefer-astra')).toBe('claude')
    expect(routeFor('', 'prefer-astra')).toBe('claude')
  })

  it('routes AUTHORING only at prefer-astra — the lane the operator can turn off', () => {
    // The whole OpenAI authoring lane hangs off this row (point 667): at the two
    // lower settings the work stays with Claude, exactly as it did before.
    expect(routeFor('author', 'prefer-astra')).toBe('astra')
    expect(routeFor('author', 'default')).toBe('claude')
    expect(routeFor('author', 'claude-only')).toBe('claude')
    // …and an unusable state falls back to the setting that spends nothing new.
    expect(routeFor('author', 'garbled')).toBe('claude')
  })

  it('offers the whole table, so no consumer has to keep its own copy', () => {
    const table = routingTable('prefer-astra')
    expect(table.map((r) => r.kind)).toEqual(KINDS)
    for (const row of table) expect(row.to).toBe('astra')
  })
})

describe('stepping the ladder', () => {
  it('moves one setting per step, in both directions', () => {
    expect(step('default', 'more')).toMatchObject({ to: 'prefer-astra', changed: true })
    expect(step('default', 'less')).toMatchObject({ to: 'claude-only', changed: true })
    expect(step('claude-only', 'more')).toMatchObject({ to: 'default', changed: true })
  })

  it('stops at each end instead of wrapping around to the opposite vendor', () => {
    expect(step('prefer-astra', 'more')).toMatchObject({ to: 'prefer-astra', changed: false, atEnd: true })
    expect(step('claude-only', 'less')).toMatchObject({ to: 'claude-only', changed: false, atEnd: true })
  })

  it('starts from the default when the state says something unusable, and refuses a non-direction', () => {
    expect(step('nonsense', 'more').from).toBe(SAFE_SETTING)
    expect(() => step('default', 'sideways')).toThrow()
  })
})

describe('the state file', () => {
  it('reads a written state back', () => {
    const state = writeState('prefer-astra', { now: 1_700_000_000_000, by: 'test' })
    expect(readSetting(JSON.stringify(state))).toMatchObject({ setting: 'prefer-astra', changedAt: 1_700_000_000_000, changedBy: 'test', problem: '' })
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
    expect(readSetting('{"setting":"prefer-astra","changedAt":1e300}').changedAt).toBeNull()
    expect(readSetting('{"setting":"prefer-astra","changedAt":-5}').changedAt).toBeNull()
    expect(readSetting('{"setting":"prefer-astra","changedAt":1700000000000}').changedAt).toBe(1_700_000_000_000)
  })

  // Cross-vendor review, 12.08.2026: falling back to `default` meant a CORRUPTED
  // `claude-only` state quietly began sending reviews to Astra again — fail-open in exactly
  // the direction this switch exists to prevent.
  it('reads a BROKEN file as the setting that spends nothing, and names the problem', () => {
    expect(readSetting('{not json')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('{not json').problem).toMatch(/not JSON/)
    expect(readSetting('{"setting":"astra-only"}')).toMatchObject({ setting: SAFE_SETTING, corrupt: true })
    expect(readSetting('{"setting":"astra-only"}').problem).toMatch(/not one of/)
    expect(SAFE_SETTING).toBe('claude-only')
    for (const kind of KINDS) expect(routeFor(kind, SAFE_SETTING)).toBe('claude')
    expect(readSetting('{"setting":"prefer-astra","changedAt":"soon"}').changedAt).toBeNull()
  })

  it('refuses to write a setting that is not one', () => {
    expect(() => writeState('astra-only')).toThrow()
  })

  it('lives in the MAIN checkout, so a worktree agent reads the setting the user flipped', () => {
    expect(settingPathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/agent-a1')).toBe('/workspace/hoa/.claude/astra-share.json')
    expect(settingPathFrom('/workspace/hoa/.git', '/workspace/hoa')).toBe('/workspace/hoa/.claude/astra-share.json')
    expect(settingPathFrom('', '/workspace/hoa')).toBe('/workspace/hoa/.claude/astra-share.json')
    expect(settingPathFrom('/srv/hoa.git', '/workspace/hoa')).toBe('/workspace/hoa/.claude/astra-share.json')
  })
})

describe('what it says', () => {
  it('states in ONE line what goes where', () => {
    const line = statusLine('default')
    expect(line.split('\n')).toHaveLength(1)
    expect(line).toBe('astra-share: default — to GPT-6 Astra: review, enumerate · to Claude: diagnose, audit, explain, author')
    expect(SETTING_NOTES.default).toContain('reviews and enumerate to Astra; diagnose, audit, explain and author to Claude')
    expect(statusLine('claude-only')).toMatch(/to GPT-6 Astra: nothing/)
    expect(statusLine('prefer-astra')).toMatch(/to Claude: nothing/)
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
    expect(briefLine('prefer-astra')).toMatch(/ask-astra\.mjs/)
    expect(briefLine('prefer-astra')).toMatch(/diagnose/)
    expect(briefLine('claude-only')).toMatch(/do NOT call/)
    expect(briefLine('default')).toMatch(/reviews and enumerate go to GPT-6 Astra/)
    expect(briefLine('default')).toContain('ask-astra.mjs --kind enumerate')
    expect(briefLine('default')).toContain('Diagnose, audit, explain and author stay with Claude')
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
    expect(applyFooterNote(footer('Stand: 11.08.2026 · 3 offene Punkte'), 'prefer-astra')).toContain(
      'Astra-Routing: prefer-astra — Diagnose, Audit, Aufzählungen und Erklärungen laufen über GPT-6 Astra',
    )
    expect(applyFooterNote(footer('Stand: x'), 'claude-only')).toContain('Astra-Routing: claude-only')
  })

  it('replaces a stale note rather than stacking one on the other', () => {
    const once = applyFooterNote(footer('Stand: x · 3 offene Punkte'), 'prefer-astra')
    const twice = applyFooterNote(once, 'claude-only')
    expect(twice.match(/Astra-Routing:/g)).toHaveLength(1)
    expect(twice).toContain('claude-only')
    expect(applyFooterNote(twice, 'default')).not.toMatch(/Astra-Routing/)
  })

  it('keeps the footer’s own segments, and leaves a board without a footer alone', () => {
    const out = applyFooterNote(footer('Stand: x · 3 offene Punkte · lädt sich alle 30 s selbst neu.'), 'prefer-astra')
    expect(out).toContain('3 offene Punkte')
    expect(out).toContain('lädt sich alle 30 s selbst neu.')
    expect(applyFooterNote('<main>no footer</main>', 'prefer-astra')).toBe('<main>no footer</main>')
  })
})

describe('the measured outage fallback (point 1194)', () => {
  const now = Date.UTC(2026, 8, 23, 11, 0)
  const limit = { ok: false, kind: 'allowance-exhausted', cause: 'the ChatGPT allowance for this account is exhausted' }
  const text = 'working …\nERROR: You have hit your usage limit. Try again later.'
  const fellBack = afterAstraRun({ outcome: limit, text, kind: 'author', now })
  const state = { setting: 'prefer-astra', corrupt: false, fallback: fellBack.fallback }

  it('a limit signature yields the Claude lane plus a probe clock', () => {
    expect(fellBack.fellBack).toBe(true)
    expect(fellBack.fallback).toMatchObject({ outage: 'allowance-exhausted', kind: 'author', since: now, probeAt: now + OUTAGE_PROBE_MS, probes: 1 })
    expect(fellBack.fallback.signature).toMatch(/usage limit/)
    for (const kind of KINDS) expect(effectiveRoute(kind, state, now + 1).to, kind).toBe('claude')
    expect(effectiveRoute('author', state, now + 1).fallback).toEqual(fellBack.fallback)
  })

  it('an unreachable vendor is an outage too, and a renewal keeps its start and counts the probe', () => {
    const again = afterAstraRun({ outcome: { ok: false, kind: 'unreachable' }, text: 'stream disconnected', previous: fellBack.fallback, now: now + OUTAGE_PROBE_MS + 5 })
    expect(again.fellBack).toBe(true)
    expect(again.fallback).toMatchObject({ outage: 'unreachable', since: now, probes: 2, probeAt: now + 2 * OUTAGE_PROBE_MS + 5 })
  })

  it('an ordinary authoring failure is NOT a fallback — it stays the point\'s red', () => {
    for (const kind of ['error-exit', 'timeout', 'no-verdict', 'login-expired', 'model-refused']) {
      const run = afterAstraRun({ outcome: { ok: false, kind }, text: 'tests failed', kind: 'author', now })
      expect(run.fellBack, kind).toBe(false)
      expect(run.fallback, kind).toBeNull()
    }
    expect(effectiveRoute('author', { setting: 'prefer-astra', fallback: null }, now).to).toBe('astra')
    // …and it leaves a standing record exactly as it was.
    expect(afterAstraRun({ outcome: { ok: false, kind: 'error-exit' }, previous: fellBack.fallback, now }).fallback).toEqual(fellBack.fallback)
  })

  it('an expired probe returns routing to the operator setting, and a success lifts the record', () => {
    const later = now + OUTAGE_PROBE_MS
    expect(effectiveRoute('author', state, later)).toEqual({ to: 'astra', fallback: null })
    expect(effectiveRoute('review', { ...state, setting: 'default' }, later).to).toBe('astra')
    expect(effectiveRoute('author', { ...state, setting: 'claude-only' }, now).to).toBe('claude')
    expect(fallbackLine(state, later)).toBe('')
    expect(afterAstraRun({ outcome: { ok: true }, previous: fellBack.fallback, now: later })).toEqual({ fallback: null, fellBack: false })
  })

  it('--status, the brief and the board name the active fallback, and keep the operator setting', () => {
    expect(statusLine(state, now + 1)).toMatch(/^astra-share: prefer-astra \(outage FALLBACK until .+\) — to GPT-6 Astra: nothing/)
    const line = fallbackLine(state, now + 1)
    expect(line).toMatch(/FALLBACK ACTIVE/)
    expect(line).toMatch(/usage limit/)
    expect(line).toMatch(/Opus 5\.5 authors/)
    expect(line).toMatch(/Fable 5\.1 reads Opus 5\.5 work, recorded as a fallback/)
    expect(line).toMatch(/`prefer-astra` stays/)
    expect(statusLine(state, now + OUTAGE_PROBE_MS)).not.toMatch(/FALLBACK/)
    const live = { ...state, fallback: { ...state.fallback, probeAt: Date.now() + 60_000 } }
    expect(briefLine(live)).toMatch(/FALLBACK ACTIVE/)
    expect(boardNoteSegment(live)).toMatch(/^Astra-Routing: Ausfall-Rückfall \(allowance-exhausted\)/)
    expect(applyFooterNote('<footer>a</footer>', live)).toMatch(/Ausfall-Rückfall/)
  })

  it('a state file carries the record through a read, and drops a malformed one', () => {
    const written = writeState('prefer-astra', { now, fallback: fellBack.fallback })
    expect(readSetting(JSON.stringify(written)).fallback).toEqual(fellBack.fallback)
    expect(readSetting(JSON.stringify({ ...written, fallback: { outage: 'error-exit', since: now, probeAt: now + 1 } })).fallback).toBeNull()
    expect(writeState('default', { now })).not.toHaveProperty('fallback')
  })
})
