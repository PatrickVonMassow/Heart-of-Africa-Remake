// Decision-logic sweep of the tasks-spec Stop-hook guard (tasks-spec-guard-core):
// the iterative-trail marker scan over OPEN TASKS points (memory
// tasks-spec-final-state-only), the ticked-point exemption, wrapped-line and
// case-insensitive matching, the calibration guards against known-legit spec
// language, and totality on malformed input (the wrapper's fail-open depends on
// the core never throwing).
import { describe, it, expect } from 'vitest'
import {
  TRAIL_MARKERS,
  parsePointBlocks,
  findTrailMarker,
  specTrailOffenders,
  evaluate,
} from './tasks-spec-guard-core.mjs'

const CLEAN_POINT =
  '- [ ] 300. DEBUG EVENT-TRIGGER DROPDOWN. Add a dropdown selector to the debug\n' +
  '  menu, modelled on the jump-to menu: grouped by category, alphabetically\n' +
  '  sorted, firing each drama via its existing entry point. Localized labels in\n' +
  '  both languages. VERIFIABLE: DebugMenu.test.tsx renders the grouped entries.\n'

const TRAIL_POINT =
  '- [ ] 301. DEBUG EVENT TRIGGERS. Instead of the earlier per-event buttons the\n' +
  '  menu now uses one dropdown; the rest of the spec is unchanged.\n'

describe('parsePointBlocks', () => {
  it('splits numbered checklist blocks with their continuation lines, open and ticked', () => {
    const blocks = parsePointBlocks(CLEAN_POINT + '\n- [x] 299. Done thing.\n  Its tail line.\n')
    expect(blocks.map((b) => [b.point, b.open])).toEqual([
      [300, true],
      [299, false],
    ])
    expect(blocks[0].text).toContain('jump-to menu')
    expect(blocks[1].text).toContain('Its tail line')
  })

  it('ignores unnumbered checklist lines and is total on malformed input', () => {
    expect(parsePointBlocks('- [ ] no number here\n  tail\n')).toEqual([])
    expect(parsePointBlocks(undefined)).toEqual([])
    expect(parsePointBlocks(12345)).toEqual([])
  })
})

describe('findTrailMarker', () => {
  it('finds a trail phrase case-insensitively', () => {
    expect(findTrailMarker('This point WAS ORIGINALLY a button row.')).toBe('was originally')
  })

  it('finds a phrase wrapped across an indented continuation line', () => {
    expect(findTrailMarker('the menu, originally\n  planned as buttons, is a dropdown')).toBe('originally planned')
  })

  it('does not flag clean final-state spec language', () => {
    expect(findTrailMarker(CLEAN_POINT)).toBeNull()
    // legitimate baseline-vs-target framing must stay allowed
    expect(findTrailMarker('Currently the code attempts ignition once per cooldown; change it to fire on demand.')).toBeNull()
    // replacing CODE is not a spec trail ("structurally supersedes the hand-tuned fades")
    expect(findTrailMarker('this structurally supersedes the hand-tuned near/far fades')).toBeNull()
    expect(findTrailMarker(null)).toBeNull()
  })

  it('flags the trail forms of supersession and German trail phrasing', () => {
    expect(findTrailMarker('this SUPERSEDES the two static hypotheses above')).toBe('this supersedes')
    expect(findTrailMarker('the old rule is now superseded by an explicit user decision')).toBe('superseded by')
    expect(findTrailMarker('Der Punkt war ursprünglich als Buttons gedacht.')).toBe('war ursprünglich')
  })

  it('flags the rename and user-change revision trails (the point-174/224 traps)', () => {
    expect(findTrailMarker('Tag the demo build v0.3 (RENAMED FROM v0.2).')).toBe('renamed from')
    expect(findTrailMarker('this checkpoint publishes as v0.2 — user change 23.07.2026')).toBe('user change')
    expect(findTrailMarker('der Release wurde von v0.2 UMBENANNT IN v0.3')).toBe('umbenannt in')
  })

  it('keeps legitimate who/when attribution clean (not a revision trail)', () => {
    expect(findTrailMarker('DEMO CHECKPOINT (user request 22.07.2026): tag v0.2 at /v0.2/.')).toBeNull()
    expect(findTrailMarker('Feature-branch workflow (user decision 22.07.2026).')).toBeNull()
    expect(findTrailMarker('SPACE is the new use key (user 23.07.2026).')).toBeNull()
  })
})

describe('specTrailOffenders', () => {
  it('flags an open point with a trail phrase and reports the phrase', () => {
    expect(specTrailOffenders(TRAIL_POINT)).toEqual([{ point: 301, phrase: 'instead of the earlier' }])
  })

  it('does not flag a clean open point', () => {
    expect(specTrailOffenders(CLEAN_POINT)).toEqual([])
  })

  it('exempts ticked points — only open specs are enforced', () => {
    const ticked = TRAIL_POINT.replace('- [ ] 301.', '- [x] 301.')
    expect(specTrailOffenders(ticked)).toEqual([])
  })

  it('handles a mixed file: only the trailing open point is reported', () => {
    const md = '- [x] 100. Superseded by point 30 (living shield).\n' + CLEAN_POINT + TRAIL_POINT
    expect(specTrailOffenders(md)).toEqual([{ point: 301, phrase: 'instead of the earlier' }])
  })
})

describe('evaluate', () => {
  it('blocks with a message naming the point, the phrase and the rule', () => {
    const r = evaluate({ tasksMd: TRAIL_POINT })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('301')
    expect(r.reason).toContain("'instead of the earlier'")
    expect(r.reason).toContain('tasks-spec-final-state-only')
    expect(r.reason).toContain('REWRITTEN COMPLETELY')
  })

  it('allows a clean file and is total on malformed input', () => {
    expect(evaluate({ tasksMd: CLEAN_POINT })).toEqual({ block: false, reason: '' })
    expect(evaluate({})).toEqual({ block: false, reason: '' })
    expect(evaluate()).toEqual({ block: false, reason: '' })
    expect(evaluate({ tasksMd: 42 })).toEqual({ block: false, reason: '' })
  })
})

describe('TRAIL_MARKERS calibration', () => {
  it('contains only lowercase whole phrases (the scan lowercases the haystack)', () => {
    for (const m of TRAIL_MARKERS) {
      expect(m).toBe(m.toLowerCase())
      expect(m.trim()).toBe(m)
    }
  })

  it('has no overly broad single-word English markers', () => {
    // A bare "instead"/"changed"/"update" would false-block routine specs.
    for (const banned of ['instead', 'changed', 'update', 'revised', 'supersedes', 'superseded', 'formerly']) {
      expect(TRAIL_MARKERS).not.toContain(banned)
    }
  })
})
