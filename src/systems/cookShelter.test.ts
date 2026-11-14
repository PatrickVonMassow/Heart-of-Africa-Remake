import { beforeAll, describe, expect, it } from 'vitest'
import { FIRE_RAIN_DECISIONS, fireHasCookShelter, fireRainBehaviour, yardFireOut } from './cookShelter'
import { rainAmount, wetnessAt } from './season'
import { balance, START_YEAR } from '../config/balance'
import { PLACES } from '../world/geo'
import { elevationAt } from '../world/geodata'
import { setupGeodata } from '../test/geodata'
import { buildRiverBank } from '../scenes/place/riverBank'
import { PLACE_RADIUS } from '../scenes/place/placeRadius'

describe('fireHasCookShelter (point 256 — the cook-shelter is people-gated on the research roster)', () => {
  it('shows the canopy for the compound/kitchen-structure peoples (peoples-1890 §9.4)', () => {
    for (const id of ['baganda', 'hausa', 'bambara', 'mandinka', 'bemba', 'lunda', 'swahili']) {
      expect(fireHasCookShelter(id), id).toBe(true)
    }
  })

  it('hides the canopy for the dome-dwellers (their accurate answer is the indoor hearth, §9.5)', () => {
    for (const id of ['zulu', 'maasai', 'mbuti', 'san']) {
      expect(fireHasCookShelter(id), id).toBe(false)
    }
  })

  it('hides the canopy for the Fang (closed bark-walled house, indoor hearth)', () => {
    expect(fireHasCookShelter('fang')).toBe(false)
  })

  it('does not assume a canopy for the GAP peoples (§9.4 "do not assume")', () => {
    for (const id of ['mongo', 'banda', 'bambundu', 'wayeyi', 'somali', 'sidama']) {
      expect(fireHasCookShelter(id), id).toBe(false)
    }
  })

  it('leaves the effectively-rainless desert points without a canopy (moot)', () => {
    for (const id of ['tuareg', 'nubians', 'berbers']) {
      expect(fireHasCookShelter(id), id).toBe(false)
    }
  })

  it('returns false for an unknown or missing people id', () => {
    expect(fireHasCookShelter(undefined)).toBe(false)
    expect(fireHasCookShelter('')).toBe(false)
    expect(fireHasCookShelter('atlantis')).toBe(false)
  })

  it('only ever names real game peoples (no phantom roster entries)', () => {
    // Every id the predicate accepts must correspond to a village people the game has.
    const gamePeople = new Set(PLACES.filter((p) => p.kind === 'village').map((v) => v.peopleId))
    for (const id of ['baganda', 'hausa', 'bambara', 'mandinka', 'bemba', 'lunda', 'swahili']) {
      expect(gamePeople.has(id), id).toBe(true)
    }
  })
})

// Point 348: every people has a DECIDED rain behaviour for its village fire.
describe('the village fire in the rain (point 348)', () => {
  const ROSTER = [...new Set(PLACES.filter((p) => p.kind === 'village').map((p) => p.peopleId).filter((id): id is string => !!id))]

  beforeAll(async () => {
    await setupGeodata()
  })

  it.each(ROSTER)('%s has a decided rain behaviour with its evidence', (id) => {
    const d = FIRE_RAIN_DECISIONS[id]
    expect(d, `${id}: nobody decided this people's fire in the rain`).toBeTruthy()
    expect(['shelter', 'indoor', 'open', 'moot']).toContain(d.behaviour)
    expect(d.evidence.length).toBeGreaterThan(2)
  })

  it('decides about no people the game does not have', () => {
    for (const id of Object.keys(FIRE_RAIN_DECISIONS)) expect(ROSTER, id).toContain(id)
  })

  it('the canopy follows the decision exactly', () => {
    for (const id of ROSTER) expect(fireHasCookShelter(id), id).toBe(FIRE_RAIN_DECISIONS[id].behaviour === 'shelter')
  })

  it('the Zulu keep the hearth indoors (Grout 1864) — the screenshot case', () => {
    expect(fireRainBehaviour('zulu')).toBe('indoor')
  })

  it('the threshold lies below the wet-season peak of every indoor village, so the answer shows without a forced season', () => {
    for (const p of PLACES.filter((q) => q.kind === 'village' && q.peopleId && FIRE_RAIN_DECISIONS[q.peopleId].behaviour === 'indoor')) {
      let peak = 0
      for (let day = 0; day < 366; day += 2) peak = Math.max(peak, rainAmount(wetnessAt(day, p.lat, p.lon, START_YEAR, elevationAt(p.lat, p.lon)), balance.season.weatherStrength))
      expect(peak, p.id).toBeGreaterThan(balance.fire.indoorRainThreshold)
    }
  })

  it('a moot people really never sees rain at its village', () => {
    for (const p of PLACES.filter((q) => q.kind === 'village' && q.peopleId && FIRE_RAIN_DECISIONS[q.peopleId].behaviour === 'moot')) {
      for (let day = 0; day < 366; day += 3) {
        const wet = wetnessAt(day, p.lat, p.lon, START_YEAR, elevationAt(p.lat, p.lon))
        expect(rainAmount(wet, 1), `${p.id} day ${day}`).toBe(0)
      }
    }
  })

  it('an indoor people\'s yard fire is out under rain past the threshold and lit again when it passes', () => {
    const th = balance.fire.indoorRainThreshold
    expect(yardFireOut('zulu', 0)).toBe(false)
    expect(yardFireOut('zulu', th * 0.99)).toBe(false)
    expect(yardFireOut('zulu', th)).toBe(true)
    expect(yardFireOut('zulu', 1)).toBe(true)
    // Deterministic: the same rain sequence gives the same states, and the
    // fire is lit again the moment the rain drops back.
    const seq = [0, th * 0.5, 0.5, 1, 0.6, th * 0.5, 0]
    const a = seq.map((r) => yardFireOut('mbuti', r))
    expect(seq.map((r) => yardFireOut('mbuti', r))).toEqual(a)
    expect(a).toEqual([false, false, true, true, true, false, false])
  })

  it('only indoor peoples ever put the yard fire out', () => {
    for (const id of ROSTER) {
      expect(yardFireOut(id, 1), id).toBe(FIRE_RAIN_DECISIONS[id].behaviour === 'indoor')
    }
    expect(yardFireOut(undefined, 1)).toBe(false)
  })

  it('follows a debug edit of the threshold', () => {
    const was = balance.fire.indoorRainThreshold
    try {
      balance.fire.indoorRainThreshold = 0.9
      expect(yardFireOut('zulu', 0.5)).toBe(false)
      balance.fire.indoorRainThreshold = 0.1
      expect(yardFireOut('zulu', 0.5)).toBe(true)
    } finally {
      balance.fire.indoorRainThreshold = was
    }
  })

  it('no indoor people has a riverside fishers\' fire, so a village never keeps two answers', () => {
    for (const p of PLACES.filter((q) => q.kind === 'village' && q.peopleId && FIRE_RAIN_DECISIONS[q.peopleId].behaviour === 'indoor')) {
      expect(buildRiverBank(p, PLACE_RADIUS), p.id).toBeFalsy()
    }
  })
})
