// Jump-to classification (design.md §21.3): EVERY entry of the debug menu's
// picker is either an enterable place — entered on the jump, in the
// first-person view — or a bird's-eye target. The sweep below rebuilds the
// picker's groups from the same sources DebugMenu reads, so a new named map
// point cannot slip in unclassified.
import { describe, it, expect } from 'vitest'
import { jumpTargetPlaceId } from './jumpTargets'
import { PLACES } from '../world/geo'
import { CULTURAL_LANDMARKS, MOUNTAINS, NATURAL_SITES, WATERFALLS } from '../world/data/landmarks'
import { LAKES } from '../world/data/lakes'

// The picker's values, group by group (DebugMenu jumpGroups).
const PICKER = {
  ports: PLACES.filter((p) => p.kind === 'port').map((p) => p.id),
  villages: PLACES.filter((p) => p.kind === 'village').map((p) => p.id),
  monuments: PLACES.filter((p) => p.kind === 'monument').map((p) => p.id),
  mountains: MOUNTAINS.map((m) => m.id),
  waterfalls: WATERFALLS.map((w) => w.id),
  lakes: LAKES.map((l) => l.id),
  cultural: CULTURAL_LANDMARKS.map((c) => c.id),
  natural: NATURAL_SITES.map((n) => n.id),
  other: ['#graveyard', '#grave'],
}

describe('jumpTargetPlaceId (design.md §21.3)', () => {
  it('classifies every settlement and monument site as enterable', () => {
    for (const id of [...PICKER.ports, ...PICKER.villages, ...PICKER.monuments]) {
      expect(jumpTargetPlaceId(id)).toBe(id)
    }
    expect(PICKER.ports.length).toBe(10)
    expect(PICKER.villages.length).toBe(22)
    expect(PICKER.monuments).toEqual(['giza'])
  })

  it('leaves every landmark, the graveyard and the tomb a bird\'s-eye jump', () => {
    const birdsEye = [
      ...PICKER.mountains,
      ...PICKER.waterfalls,
      ...PICKER.lakes,
      ...PICKER.natural,
      ...PICKER.other,
      // The cultural landmarks EXCEPT Giza, which is the same site as the
      // enterable monument map point (geo.ts landmarkLabelHiddenByMapPoint).
      ...PICKER.cultural.filter((id) => id !== 'giza'),
    ]
    for (const id of birdsEye) expect(jumpTargetPlaceId(id)).toBeNull()
    expect(birdsEye.length).toBeGreaterThan(20)
  })

  it('enters Giza from the cultural group too — one site, one behaviour', () => {
    expect(PICKER.cultural).toContain('giza')
    expect(jumpTargetPlaceId('giza')).toBe('giza')
  })

  it('classifies EVERY picker entry (no unclassified value)', () => {
    const all = Object.values(PICKER).flat()
    expect(new Set(all).size).toBeGreaterThan(0)
    for (const v of all) {
      const r = jumpTargetPlaceId(v)
      expect(r === null || r === v).toBe(true)
    }
  })

  it('is null for an unknown value', () => {
    expect(jumpTargetPlaceId('nowhere')).toBeNull()
    expect(jumpTargetPlaceId('')).toBeNull()
  })
})
