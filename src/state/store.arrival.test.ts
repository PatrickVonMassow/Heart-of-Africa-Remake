// Arrival journaling of every walkable place (design.md §16, CLAUDE.md §7.1
// pt. 8, point 394): the FIRST entry into a first-person scene always writes an
// entry — port, village and monument site alike — and a later entry writes one
// only when the modelled situation moved. The village half of the rule (the
// rinderpest phase, point 170) keeps its own cases in store.travel.test.ts;
// this file covers the rule itself, the port and monument texts, and the
// entries' survival through the checkpoint and the language switch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance, START_YEAR } from '../config/balance'
import { g, freshGame, withWorld } from '../test/store'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import { resolveText } from '../i18n'
import { placeSituationAt } from '../systems/placeSituation'
import { placeById } from '../world/geo'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

const entriesWithKey = (key: string, place?: string) =>
  g().journal.filter(
    (e) =>
      typeof e.text === 'object' &&
      e.text.key === key &&
      (place === undefined || e.text.params?.place === place),
  )

/** Day of the year 1890 on which the given place stands in `situation`. */
function dayIn(placeId: string, situation: string): number {
  const place = placeById(placeId)
  for (let day = 0; day <= 2200; day += 5) {
    if (placeSituationAt(place, day, START_YEAR) === situation) return day
  }
  throw new Error(`${placeId} never reaches ${situation}`)
}

describe('first entry into any walkable place (point 394)', () => {
  it('a port writes its own arrival vignette exactly once; a later entry reports only the checkpoint', () => {
    g().enterPlace('zanzibar')
    expect(entriesWithKey('journal.portFirstVisit').length).toBe(1)
    expect(entriesWithKey('journal.portArrival').length).toBe(0)

    g().leavePlace()
    g().enterPlace('zanzibar')
    expect(entriesWithKey('journal.portFirstVisit').length).toBe(1) // never twice
    expect(entriesWithKey('journal.portArrival').length).toBe(1) // the checkpoint notice
  })

  it('the monument site is journaled on entry — the gap point 394 was opened for', () => {
    g().enterPlace('giza')
    const entries = entriesWithKey('journal.monumentFirstVisit')
    expect(entries.length).toBe(1)
    expect(typeof entries[0].text === 'object' && entries[0].text.params?.place).toBe('giza')
    // Unchanged situation on a re-entry → silent (a monument has no checkpoint).
    g().leavePlace()
    g().enterPlace('giza')
    expect(entriesWithKey('journal.monumentFirstVisit').length).toBe(1)
    expect(entriesWithKey('journal.monumentReturn').length).toBe(0)
  })

  it('a village writes its people vignette once, and Cairo — begun in, never arrived at — gets its own on the first walk in', () => {
    g().enterPlace('maasai-village')
    expect(entriesWithKey('journal.villageFirstVisit').length).toBe(1)
    // The run opens INSIDE Cairo without an arrival: entering it writes the
    // city's vignette rather than nothing at all.
    g().leavePlace()
    g().enterPlace('cairo')
    const cairo = entriesWithKey('journal.portFirstVisit')
    expect(cairo.length).toBe(1)
    expect(typeof cairo[0].text === 'object' && cairo[0].text.params?.place).toBe('cairo')
  })
})

describe('return entry only on a CHANGED situation (point 394)', () => {
  it('Giza: crossing the Nile flood writes one return entry, an unchanged season none', () => {
    const low = dayIn('giza', 'lowWater')
    const flood = dayIn('giza', 'flood')
    g().debugSet({ day: low })
    g().enterPlace('giza')
    expect(entriesWithKey('journal.monumentReturn').length).toBe(0)

    g().leavePlace()
    g().debugSet({ day: flood })
    g().enterPlace('giza')
    const after = entriesWithKey('journal.monumentReturn')
    expect(after.length).toBe(1)
    const params = typeof after[0].text === 'object' ? after[0].text.params : undefined
    expect(params?.fromSituation).toBe('lowWater')
    expect(params?.toSituation).toBe('flood')

    // Same flood state again → silent, so the entry never spams.
    g().leavePlace()
    g().enterPlace('giza')
    expect(entriesWithKey('journal.monumentReturn').length).toBe(1)
  })

  it('Berbera: the fair season turning writes a return entry instead of the checkpoint boilerplate', () => {
    g().debugSet({ day: dayIn('berbera', 'fair') })
    g().enterPlace('berbera')
    expect(entriesWithKey('journal.portFirstVisit').length).toBe(1)

    g().leavePlace()
    g().debugSet({ day: dayIn('berbera', 'deserted') })
    g().enterPlace('berbera')
    const after = entriesWithKey('journal.portReturn')
    expect(after.length).toBe(1)
    expect(typeof after[0].text === 'object' && after[0].text.params?.toSituation).toBe('deserted')
    // The generic checkpoint notice does not double up beside it.
    expect(entriesWithKey('journal.portArrival').length).toBe(0)
  })

  it('a port with no modelled situation never writes a return entry, however long the run', () => {
    g().enterPlace('lagos')
    g().leavePlace()
    g().debugSet({ day: 1500 })
    g().enterPlace('lagos')
    expect(entriesWithKey('journal.portReturn').length).toBe(0)
    expect(entriesWithKey('journal.portArrival').length).toBe(1)
  })
})

describe('arrival entries are language-neutral records (design.md §17.7)', () => {
  it('a port and a monument entry render in both languages from the stored key+params', () => {
    g().enterPlace('timbuktu')
    g().leavePlace()
    g().enterPlace('giza')
    for (const entry of [
      entriesWithKey('journal.portFirstVisit')[0],
      entriesWithKey('journal.monumentFirstVisit')[0],
    ]) {
      expect(typeof entry.text).toBe('object') // stored as a reference, not prose
      const enText = resolveText(en, entry.text)
      const deText = resolveText(de, entry.text)
      expect(enText.length).toBeGreaterThan(80)
      expect(deText.length).toBeGreaterThan(80)
      expect(enText).not.toBe(deText)
    }
  })
})

describe('the arrival state travels with the checkpoint (design.md §18)', () => {
  it('a loaded snapshot does not re-journal a place already arrived at', () => {
    g().enterPlace('berbera') // ports save a checkpoint on entry
    expect(entriesWithKey('journal.portFirstVisit').length).toBe(1)
    expect(g().enteredPlaces).toContain('berbera')
    g().leavePlace()

    expect(g().loadCheckpoint()).toBe(true)
    expect(g().enteredPlaces).toContain('berbera')
    expect(g().placeSituations.berbera).toBeTruthy()
    // Resuming and walking back in reports the checkpoint, never a second
    // arrival — the place counts as arrived at across the save.
    g().enterPlace('berbera')
    expect(entriesWithKey('journal.portFirstVisit').length).toBe(1)
    expect(entriesWithKey('journal.portArrival').length).toBe(1)
  })

  it('a legacy snapshot without the arrival state keeps its villages and re-earns its ports', () => {
    // A save from before point 394: only visitedPlaces, which holds the
    // known-from-start ports whether or not they were ever walked into.
    g().enterPlace('cairo')
    g().saveCheckpoint()
    const raw = JSON.parse(localStorage.getItem('hoa-checkpoints-v1') ?? '[]')
    const legacy = raw[raw.length - 1]
    delete legacy.enteredPlaces
    delete legacy.placeSituations
    legacy.visitedPlaces = [...legacy.visitedPlaces, 'maasai-village']

    freshGame() // clears storage: the legacy snapshot is planted afterwards
    localStorage.setItem('hoa-checkpoints-v1', JSON.stringify([legacy]))
    expect(g().loadCheckpoint()).toBe(true)
    // The village was genuinely entered → keeps its first-visit entry.
    expect(g().enteredPlaces).toContain('maasai-village')
    // The port sat in the discovery list from the outset → its arrival is
    // still owed rather than silently lost.
    expect(g().enteredPlaces).not.toContain('zanzibar')
    g().enterPlace('zanzibar')
    expect(entriesWithKey('journal.portFirstVisit', 'zanzibar').length).toBe(1)
  })
})
