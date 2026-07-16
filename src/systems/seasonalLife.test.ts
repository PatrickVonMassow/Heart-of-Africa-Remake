import { describe, expect, it } from 'vitest'
import { presenceAt } from './seasonalLife'
import { START_YEAR } from '../config/balance'

const on = (month: number, dayOfMonth: number): number =>
  (Date.UTC(START_YEAR, month - 1, dayOfMonth) - Date.UTC(START_YEAR, 0, 1)) / 86400000

describe('presenceAt (point 142 — "the young men are gone", and who never leaves)', () => {
  it('thins the Maasai village in the dry season — the PERIOD direction (Thomson)', () => {
    // "moving up from the plains to the highlands in the DRY season" — so the
    // village is emptier in July and full in the April rains.
    expect(presenceAt('maasai', on(7, 15), START_YEAR)).toBeLessThan(0.6)
    expect(presenceAt('maasai', on(4, 15), START_YEAR)).toBe(1)
  })

  it('sends the Tuareg men on the autumn caravan — a window that wraps the year end', () => {
    expect(presenceAt('tuareg', on(12, 15), START_YEAR)).toBeLessThan(0.8) // deep in the window
    expect(presenceAt('tuareg', on(1, 15), START_YEAR)).toBeLessThan(0.8) // still away past new year
    expect(presenceAt('tuareg', on(6, 15), START_YEAR)).toBe(1) // home in the summer
  })

  it('moves the Sahel farmers out to the field huts in the RAINS — the inverted intuition', () => {
    // Barth (PERIOD, §4.9): the rains empty the village toward the fields.
    for (const p of ['hausa', 'bambara', 'mandinka']) {
      expect(presenceAt(p, on(8, 15), START_YEAR)).toBeLessThan(0.8) // August: the rains
      expect(presenceAt(p, on(1, 15), START_YEAR)).toBe(1) // January: the dry village is full
    }
  })

  it('NEVER empties the sedentary peoples — the negative case, swept monthly', () => {
    // §4.0.5: "Bemba and Lunda are sedentary — no month empties them." The
    // mechanic must not become universal.
    for (let m = 1; m <= 12; m++) {
      expect(presenceAt('bemba', on(m, 15), START_YEAR)).toBe(1)
      expect(presenceAt('lunda', on(m, 15), START_YEAR)).toBe(1)
    }
  })

  it('leaves every unresearched people at full presence', () => {
    for (let m = 1; m <= 12; m++) {
      expect(presenceAt('zulu', on(m, 15), START_YEAR)).toBe(1)
      expect(presenceAt('not-a-people', on(m, 15), START_YEAR)).toBe(1)
    }
  })
})
