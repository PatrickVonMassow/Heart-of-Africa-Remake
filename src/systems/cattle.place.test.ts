// The kraal herd a place shows on a visit day (work-order 359): the per-place
// glue the scene mounts with, at the dates the live picture check photographs.

import { describe, expect, it } from 'vitest'
import { START_YEAR, VILLAGE_CATTLE } from '../config/balance'
import { kraalHerdForPlace } from './cattle'

/** In-game day of the first of a month (the store's calendar unit). */
const dayOf = (year: number, month: number) => (Date.UTC(year, month - 1, 1) - Date.UTC(START_YEAR, 0, 1)) / 86400000

describe('kraalHerdForPlace', () => {
  it('the Zulu kraal holds the full herd in 1890 and still in 1893 — southern Africa is clean until 1896', () => {
    expect(kraalHerdForPlace('zulu-village', dayOf(1890, 6))).toBe(VILLAGE_CATTLE.fullHerd)
    expect(kraalHerdForPlace('zulu-village', dayOf(1893, 6))).toBe(VILLAGE_CATTLE.fullHerd)
  })

  it('the Maasai kraal holds cattle in 1890 and visibly fewer in 1893', () => {
    const y1890 = kraalHerdForPlace('maasai-village', dayOf(1890, 6))
    const y1893 = kraalHerdForPlace('maasai-village', dayOf(1893, 6))
    expect(y1890).toBeGreaterThan(0)
    expect(y1893).toBeLessThan(y1890)
  })

  it('the Bemba village has none in either year, and a place without a people none at all', () => {
    expect(kraalHerdForPlace('bemba-village', dayOf(1890, 6))).toBe(0)
    expect(kraalHerdForPlace('bemba-village', dayOf(1893, 6))).toBe(0)
    expect(kraalHerdForPlace('cairo', 0)).toBe(0)
  })
})
