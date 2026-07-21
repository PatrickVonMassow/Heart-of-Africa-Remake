import { describe, expect, it } from 'vitest'
import {
  CARRION_RADIUS_DEG,
  rinderpestCarrionActive,
  rinderpestPhase,
  rinderpestPhaseAtDay,
  villageSituationChanged,
} from './rinderpest'

// The date table of point 133 (research: docs/peoples-1890.md §5): the game's
// window IS the panzootic, and the phase is a pure function of people + date.
describe('rinderpestPhase (design.md §16/§19.13, point 133)', () => {
  it('1890: Maasailand is pre-damaged (pleuropneumonia 1883-87), rinderpest not yet arrived', () => {
    expect(rinderpestPhase('maasai', 1890, 1)).toBe('preDamaged')
    expect(rinderpestPhase('maasai', 1890, 12)).toBe('preDamaged')
  })

  it('1891-92: the emutai strikes Maasailand (rinderpest 1891, smallpox 1892)', () => {
    expect(rinderpestPhase('maasai', 1891, 1)).toBe('struck')
    expect(rinderpestPhase('maasai', 1892, 3)).toBe('struck') // Baumann stood in it, March 1892
    expect(rinderpestPhase('maasai', 1893, 1)).toBe('aftermath')
    expect(rinderpestPhase('maasai', 1895, 12)).toBe('aftermath')
  })

  it('the Sidama sit inside the Kifu Qen famine from the very start', () => {
    expect(rinderpestPhase('sidama', 1890, 1)).toBe('struck')
    expect(rinderpestPhase('sidama', 1892, 12)).toBe('struck')
    expect(rinderpestPhase('sidama', 1893, 1)).toBe('aftermath')
  })

  it('the Sudan is one year past Sanat Sitta — aftermath for the whole window', () => {
    for (const y of [1890, 1892, 1895]) expect(rinderpestPhase('nubians', y, 6)).toBe('aftermath')
  })

  it('southern Africa is clean until the Zambezi crossing of March 1896 — boundary exact', () => {
    for (const p of ['zulu', 'pedi', 'san']) {
      expect(rinderpestPhase(p, 1890, 1)).toBe('clean')
      expect(rinderpestPhase(p, 1895, 12)).toBe('clean')
      expect(rinderpestPhase(p, 1896, 2)).toBe('clean') // February 1896: not yet
      expect(rinderpestPhase(p, 1896, 3)).toBe('struck') // Bulawayo, 3 March 1896
      expect(rinderpestPhase(p, 1897, 1)).toBe('struck')
    }
  })

  it('the camel peoples are never struck at all — camels are immune (FAO)', () => {
    for (const p of ['somali', 'tuareg']) {
      for (const y of [1890, 1891, 1893, 1896, 1897]) {
        expect(rinderpestPhase(p, y, 6)).toBe('clean')
      }
    }
  })

  it('the day glue maps the calendar day to the same phases', () => {
    // 1890 start (day 0) vs mid-1891 (day ~540) from START_YEAR 1890.
    expect(rinderpestPhaseAtDay('maasai', 0, 1890)).toBe('preDamaged')
    expect(rinderpestPhaseAtDay('maasai', 540, 1890)).toBe('struck')
    expect(rinderpestPhaseAtDay('zulu', 540, 1890)).toBe('clean')
  })

  it('carrion dresses only STRUCK Maasailand, boundary-exact on the radius', () => {
    expect(rinderpestCarrionActive('struck', 1.0)).toBe(true)
    expect(rinderpestCarrionActive('struck', CARRION_RADIUS_DEG)).toBe(true)
    expect(rinderpestCarrionActive('struck', CARRION_RADIUS_DEG + 0.01)).toBe(false)
    expect(rinderpestCarrionActive('preDamaged', 1.0)).toBe(false) // 1890: living herds, no plague toll yet
    expect(rinderpestCarrionActive('aftermath', 1.0)).toBe(false) // the bones are gone with the years
    expect(rinderpestCarrionActive('clean', 1.0)).toBe(false)
  })

  it('the cattle-less Bemba and every unlisted people carry no phase', () => {
    expect(rinderpestPhase('bemba', 1891, 6)).toBe('clean') // tsetse belt: no herds to lose
    expect(rinderpestPhase('maasai' + 'x', 1891, 6)).toBe('clean')
    expect(rinderpestPhase('baganda', 1891, 6)).toBe('clean') // the cattle blow fell on Bunyoro/Nkore, not banana-based Buganda
  })
})

describe('villageSituationChanged (return-vignette predicate, point 170)', () => {
  it('fires only when a KNOWN stored phase differs from the current one', () => {
    expect(villageSituationChanged('preDamaged', 'struck')).toBe(true)
    expect(villageSituationChanged('struck', 'aftermath')).toBe(true)
    expect(villageSituationChanged('preDamaged', 'aftermath')).toBe(true)
    // Unchanged → silent.
    expect(villageSituationChanged('struck', 'struck')).toBe(false)
    expect(villageSituationChanged('aftermath', 'aftermath')).toBe(false)
    // No stored phase (never journaled / legacy) → silent, not a spurious entry.
    expect(villageSituationChanged(undefined, 'struck')).toBe(false)
  })

  it('a non-rinderpest people keeps a constant phase, so it never re-fires', () => {
    // Its phase is 'clean' at every visit → stored === current → false, by
    // construction, across the whole 1890-1895 window.
    const start = 1890
    for (const day of [0, 400, 1000, 2000]) {
      const p = rinderpestPhaseAtDay('tuareg', day, start)
      expect(villageSituationChanged(p, rinderpestPhaseAtDay('tuareg', day + 365, start))).toBe(false)
    }
  })
})
