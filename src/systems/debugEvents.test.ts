// Debug event trigger (design.md §21.3, point 258): the entry registry, the
// grouped + alphabetically sorted dropdown structure, the pure precondition
// locator and the routing of a picked entry to its trigger. Everything here is
// browser-free; the staged dramas themselves live in the travel scene.
import { describe, it, expect, afterEach } from 'vitest'
import {
  DRAMA_PREFIX,
  EVENT_PREFIX,
  HAZARD_PREFIX,
  TRAVELLER_HAZARD_KINDS,
  WILDLIFE_DRAMA_KINDS,
  debugEventGroups,
  fireDebugEvent,
  nearestStagingSpot,
  setWildlifeDramaTrigger,
  sortByLabel,
  triggerWildlifeDrama,
  type DebugEventLabels,
  type WildlifeDramaKind,
} from './debugEvents'
import { EVENT_KINDS } from './events'
import { en } from '../i18n/en'
import { de } from '../i18n/de'

afterEach(() => setWildlifeDramaTrigger(null))

const labelsFor = (dict: typeof en): DebugEventLabels => ({
  groups: dict.debug.stageGroups,
  drama: dict.debug.dramaNames,
  event: dict.debug.eventNames,
  hazard: dict.debug.hazardNames,
})

describe('sortByLabel', () => {
  it('orders alphabetically by localized label without mutating the input', () => {
    const input = [
      { value: 'c', label: 'Zebra' },
      { value: 'a', label: 'Antilope' },
      { value: 'b', label: 'Ökosystem' },
    ]
    const sorted = sortByLabel(input, 'de')
    expect(sorted.map((o) => o.value)).toEqual(['a', 'b', 'c'])
    expect(input.map((o) => o.value)).toEqual(['c', 'a', 'b'])
  })
})

describe('debugEventGroups', () => {
  it('groups the entries by category in a fixed order', () => {
    const groups = debugEventGroups(labelsFor(en), 'en')
    expect(groups.map((g) => g.label)).toEqual([
      en.debug.stageGroups.wildlife,
      en.debug.stageGroups.random,
      en.debug.stageGroups.hazards,
    ])
    expect(groups[0].options).toHaveLength(WILDLIFE_DRAMA_KINDS.length)
    expect(groups[1].options).toHaveLength(EVENT_KINDS.length)
    expect(groups[2].options).toHaveLength(TRAVELLER_HAZARD_KINDS.length)
  })

  it('prefixes each value with its category so one <select> stays unambiguous', () => {
    const groups = debugEventGroups(labelsFor(en), 'en')
    expect(groups[0].options.every((o) => o.value.startsWith(DRAMA_PREFIX))).toBe(true)
    expect(groups[1].options.every((o) => o.value.startsWith(EVENT_PREFIX))).toBe(true)
    expect(groups[2].options.every((o) => o.value.startsWith(HAZARD_PREFIX))).toBe(true)
    const values = groups.flatMap((g) => g.options.map((o) => o.value))
    expect(new Set(values).size).toBe(values.length)
  })

  it.each([
    ['en', en, 'en'],
    ['de', de, 'de'],
  ] as const)('sorts every group alphabetically by the %s label', (_name, dict, lang) => {
    for (const g of debugEventGroups(labelsFor(dict), lang)) {
      const labels = g.options.map((o) => o.label)
      const expected = [...labels].sort((a, b) => a.localeCompare(b, lang))
      expect(labels).toEqual(expected)
    }
  })

  it('labels every entry from the language file in both languages', () => {
    for (const dict of [en, de]) {
      for (const g of debugEventGroups(labelsFor(dict), 'en')) {
        for (const o of g.options) {
          expect(o.label.length).toBeGreaterThan(0)
          // A missing translation would fall back to the raw kind id.
          expect(o.label).not.toBe(o.value.split(':')[1])
        }
      }
    }
  })

  it('names every drama and hazard kind in both languages', () => {
    for (const dict of [en, de]) {
      for (const k of WILDLIFE_DRAMA_KINDS) expect(dict.debug.dramaNames[k]).toBeTruthy()
      for (const k of TRAVELLER_HAZARD_KINDS) expect(dict.debug.hazardNames[k]).toBeTruthy()
    }
  })
})

describe('nearestStagingSpot', () => {
  it('takes the centre itself when it already satisfies the precondition', () => {
    const spot = nearestStagingSpot(10, -4, () => true, { maxRadius: 20 })
    expect(spot).toEqual({ x: 10, z: -4 })
  })

  it('returns null when nothing in range satisfies it (→ the toast)', () => {
    expect(nearestStagingSpot(0, 0, () => false, { maxRadius: 30, ringStep: 5 })).toBeNull()
  })

  it('finds the nearest qualifying ring, not a far one', () => {
    // Only a disc around (0, 40) qualifies; a probe must land inside it and
    // must not report anything closer to the origin.
    const ok = (x: number, z: number) => Math.hypot(x - 0, z - 40) < 6
    const spot = nearestStagingSpot(0, 0, ok, { maxRadius: 100, ringStep: 4 })
    expect(spot).not.toBeNull()
    expect(ok(spot!.x, spot!.z)).toBe(true)
    expect(Math.hypot(spot!.x, spot!.z)).toBeGreaterThan(30)
    expect(Math.hypot(spot!.x, spot!.z)).toBeLessThanOrEqual(46)
  })

  it('honours minRadius so a drama never stages on top of the traveller', () => {
    const spot = nearestStagingSpot(0, 0, () => true, { maxRadius: 60, ringStep: 5, minRadius: 18 })
    expect(spot).not.toBeNull()
    expect(Math.hypot(spot!.x, spot!.z)).toBeGreaterThanOrEqual(18)
  })

  it('is deterministic — the same world gives the same spot', () => {
    const ok = (x: number, z: number) => x > 12 && z > 0
    const a = nearestStagingSpot(0, 0, ok, { maxRadius: 80, ringStep: 4 })
    const b = nearestStagingSpot(0, 0, ok, { maxRadius: 80, ringStep: 4 })
    expect(a).toEqual(b)
  })

  it('never probes beyond the given radius', () => {
    const seen: number[] = []
    nearestStagingSpot(0, 0, (x, z) => {
      seen.push(Math.hypot(x, z))
      return false
    }, { maxRadius: 25, ringStep: 5 })
    expect(Math.max(...seen)).toBeLessThanOrEqual(25 + 1e-6)
  })
})

describe('fireDebugEvent', () => {
  const spy = () => {
    const calls: string[] = []
    return {
      calls,
      actions: {
        randomEvent: (k: string) => calls.push(`event:${k}`),
        mountainFall: () => calls.push('hazard:mountainFall'),
      },
    }
  }

  it('routes a random-event entry to the §14 trigger', () => {
    const s = spy()
    expect(fireDebugEvent(`${EVENT_PREFIX}snakeBite`, s.actions)).toBeNull()
    expect(s.calls).toEqual(['event:snakeBite'])
  })

  it('routes the hazard entry to the mountain fall', () => {
    const s = spy()
    expect(fireDebugEvent(`${HAZARD_PREFIX}mountainFall`, s.actions)).toBeNull()
    expect(s.calls).toEqual(['hazard:mountainFall'])
  })

  it('routes a drama entry to the registered scene trigger', () => {
    const staged: WildlifeDramaKind[] = []
    setWildlifeDramaTrigger((k) => {
      staged.push(k)
      return null
    })
    const s = spy()
    expect(fireDebugEvent(`${DRAMA_PREFIX}grassFire`, s.actions)).toBeNull()
    expect(staged).toEqual(['grassFire'])
    expect(s.calls).toEqual([])
  })

  it('passes the scene trigger’s missing precondition back to the caller', () => {
    setWildlifeDramaTrigger(() => 'noWater')
    expect(fireDebugEvent(`${DRAMA_PREFIX}crocodileAmbush`, spy().actions)).toBe('noWater')
  })

  it('reports noScene while no travel scene is mounted', () => {
    expect(triggerWildlifeDrama('grassFire')).toBe('noScene')
    expect(fireDebugEvent(`${DRAMA_PREFIX}grassFire`, spy().actions)).toBe('noScene')
  })

  it('has a localized toast for every failure the triggers can report', () => {
    const failures = ['noScene', 'noSavanna', 'noWater', 'noPrey', 'noCalf', 'noCub', 'noElephant']
    for (const dict of [en, de]) {
      for (const f of failures) expect(dict.debug.stageFailures[f]).toBeTruthy()
    }
  })
})
