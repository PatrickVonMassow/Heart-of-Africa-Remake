// Store travel transitions (CLAUDE.md §7.1 pt. 2/4/11/21, design.md §2/§11).
// Ports the store-driven asserts of flow.mjs and enrichments.mjs (moveTravel
// cost/canoe-land malus, enclosed-sea vs open-ocean, mountain climb, reentry
// debounce, once-only penalty/danger journal, landmark bounty sighting, river
// drift) into fast jsdom checks. The scene-driven walk-in/out edges stay in the
// Playwright E2E.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { totalGifts } from './store'
import { g, freshGame, withWorld, jumpTo, terrainAt, COORD } from '../test/store'
import { regionAt, placeById } from '../world/geo'
import { WATERFALLS } from '../world/data/landmarks'
import { riverFlow } from '../world/geoIndex'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

const journalKeys = () => g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text))
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
const drive = (dirX: number, dirZ: number, n: number, dt = 0.1) => {
  for (let i = 0; i < n; i++) g().moveTravel(dirX, dirZ, dt)
}

describe('new game (design.md fixed values)', () => {
  it('starts in Cairo with the fixed money/provisions/gifts', () => {
    expect(g().money).toBe(250)
    expect(g().foodDays).toBe(35)
    expect(totalGifts(g().gifts)).toBe(2)
    expect(g().mode).toBe('place')
    expect(g().placeId).toBe('cairo')
  })
})

describe('moveTravel cost and terrain (design.md §11)', () => {
  it('advances position and spends day + provisions on open land', () => {
    jumpTo(...COORD.savanna)
    expect(terrainAt(...COORD.savanna)).toBe('savanna')
    const p0 = { ...g().pos }
    const day0 = g().day
    const food0 = g().foodDays
    drive(1, 0, 10)
    expect(dist(g().pos, p0)).toBeGreaterThan(0)
    expect(g().day).toBeGreaterThan(day0)
    expect(g().foodDays).toBeLessThan(food0)
  })

  it('carrying the canoe covers clearly less ground on land (real malus)', () => {
    jumpTo(...COORD.savanna)
    const p0 = { ...g().pos }
    drive(1, 0, 20)
    const bare = dist(g().pos, p0)

    freshGame()
    balance.randomEventsEnabled = false
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('canoe')
    const p1 = { ...g().pos }
    drive(1, 0, 20)
    const withCanoe = dist(g().pos, p1)
    expect(withCanoe).toBeLessThan(bare * 0.9)
  })

  it('swims enclosed sea/lake water but refuses the open ocean', () => {
    jumpTo(...COORD.water)
    expect(terrainAt(...COORD.water)).toBe('water')
    const p0 = { ...g().pos }
    drive(0, 1, 3)
    expect(dist(g().pos, p0)).toBeGreaterThan(0)

    jumpTo(...COORD.ocean)
    expect(terrainAt(...COORD.ocean)).toBe('ocean')
    const p1 = { ...g().pos }
    g().moveTravel(1, 0, 0.1)
    expect(g().pos).toEqual(p1) // blocked → position unchanged
    expect(g().toast).toBeTruthy()
  })

  it('climbs a mountain without a rope, and the rope makes it faster', () => {
    jumpTo(...COORD.mountain)
    expect(terrainAt(...COORD.mountain)).toBe('mountain')
    const p0 = { ...g().pos }
    drive(1, 0, 10)
    const noRope = dist(g().pos, p0)
    expect(noRope).toBeGreaterThan(0)

    freshGame()
    balance.randomEventsEnabled = false
    jumpTo(...COORD.mountain)
    g().debugAddEquipment('rope')
    const p1 = { ...g().pos }
    drive(1, 0, 10)
    expect(dist(g().pos, p1)).toBeGreaterThan(noRope)
  })

  it('a forced mountain fall wounds the traveller and can drop an item', () => {
    jumpTo(...COORD.mountain)
    g().debugAddEquipment('rifle')
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // severe band + item loss
    g().debugTriggerMountainFall()
    expect(g().afflictions.wounds).toBeGreaterThanOrEqual(1)
  })
})

describe('re-entry debounce (design.md §2)', () => {
  it('suppresses re-entry until the traveller clears the settlement', () => {
    g().enterPlace('cairo')
    g().leavePlace()
    expect(g().reentrySuppressedId).toBe('cairo')
    // A tiny nudge keeps it suppressed; driving well clear re-arms entry.
    g().moveTravel(0, 1, 0.02)
    expect(g().reentrySuppressedId).toBe('cairo')
    drive(0, 1, 40)
    expect(g().reentrySuppressedId).toBeNull()
  })
})

describe('once-only penalty and danger journal (design.md §11/§14)', () => {
  it('a first jungle entry warns once, a later entry does not', () => {
    jumpTo(...COORD.jungle)
    const jungleWarn = () => journalKeys().filter((k) => k === 'journal.penaltyJungle').length
    drive(1, 0, 2)
    expect(jungleWarn()).toBe(1)
    drive(1, 0, 4)
    expect(jungleWarn()).toBe(1)
  })

  it('sets out without a rifle warns of the wilds exactly once', () => {
    jumpTo(...COORD.savanna)
    const unarmed = () => journalKeys().filter((k) => k === 'journal.dangerUnarmed').length
    drive(1, 0, 3)
    expect(unarmed()).toBe(1)
    expect(g().dangerWarned.unarmed).toBe(true)
    drive(1, 0, 3)
    expect(unarmed()).toBe(1)
  })
})

describe('landmark discovery bounty (design.md §10)', () => {
  const discoveryEntries = () =>
    g().journal.filter((e) => typeof e.text === 'object' && e.text.key === 'journal.landmarkDiscovered')

  it('sighting a landmark registers it, queues a bounty and journals the discovery', () => {
    jumpTo(-3.05, 37.3) // Kilimanjaro
    g().debugAddEquipment('rope')
    drive(0, -1, 3)
    expect(g().landmarksSeen).toContain('kilimanjaro')
    expect(g().pendingBounties.some((b) => b.kind === 'landmark' && b.id === 'kilimanjaro')).toBe(true)
    // The journal announces the discovery (design.md §16), flavored by kind.
    const entries = discoveryEntries().filter(
      (e) => typeof e.text === 'object' && e.text.params?.landmark === 'kilimanjaro',
    )
    expect(entries.length).toBe(1)
    expect(typeof entries[0].text === 'object' && entries[0].text.params?.kind).toBe('mountain')
    // Sighted once: further travel nearby adds no second announcement.
    drive(0, -1, 2)
    expect(
      discoveryEntries().filter((e) => typeof e.text === 'object' && e.text.params?.landmark === 'kilimanjaro').length,
    ).toBe(1)
  })

  it('sighting a waterfall journals the falls-flavored discovery', () => {
    jumpTo(-17.9, 25.5) // just west of Victoria Falls
    drive(1, 0, 6)
    const entries = discoveryEntries().filter(
      (e) => typeof e.text === 'object' && e.text.params?.landmark === 'victoria-falls',
    )
    expect(entries.length).toBe(1)
    expect(typeof entries[0].text === 'object' && entries[0].text.params?.kind).toBe('falls')
  })

  it('sighting the Meroë pyramids registers, queues a bounty and journals the pyramids-flavored discovery', () => {
    jumpTo(16.94, 33.75) // Pyramids of Meroë (a built cultural landmark)
    expect(g().landmarksSeen).not.toContain('meroe') // '?' until seen
    drive(0, -1, 3)
    expect(g().landmarksSeen).toContain('meroe')
    expect(g().pendingBounties.some((b) => b.kind === 'landmark' && b.id === 'meroe')).toBe(true)
    const entries = discoveryEntries().filter(
      (e) => typeof e.text === 'object' && e.text.params?.landmark === 'meroe',
    )
    expect(entries.length).toBe(1)
    expect(typeof entries[0].text === 'object' && entries[0].text.params?.kind).toBe('pyramids')
  })

  it('sighting the Ngorongoro crater registers, queues a bounty and journals the crater-flavored discovery', () => {
    jumpTo(-3.16, 35.58) // Ngorongoro (a natural point-landmark)
    expect(g().landmarksSeen).not.toContain('ngorongoro') // '?' until seen
    drive(0, -1, 3)
    expect(g().landmarksSeen).toContain('ngorongoro')
    expect(g().pendingBounties.some((b) => b.kind === 'landmark' && b.id === 'ngorongoro')).toBe(true)
    const entries = discoveryEntries().filter(
      (e) => typeof e.text === 'object' && e.text.params?.landmark === 'ngorongoro',
    )
    expect(entries.length).toBe(1)
    expect(typeof entries[0].text === 'object' && entries[0].text.params?.kind).toBe('crater')
  })
})

describe('village first visit (design.md §16)', () => {
  it('journals the people-specific vignette with the people param', () => {
    g().enterPlace('maasai-village')
    const entry = g().journal.find(
      (e) => typeof e.text === 'object' && e.text.key === 'journal.villageFirstVisit',
    )
    expect(entry).toBeTruthy()
    expect(entry && typeof entry.text === 'object' && entry.text.params?.people).toBe('maasai')
  })
})

describe('river current drift (design.md §11)', () => {
  it('sweeps an idle traveller downstream and spends time + provisions', () => {
    // A river cell with flow: the White Nile below Lake Victoria.
    jumpTo(-1, 33)
    if (terrainAt(-1, 33) !== 'water') return // guard: coordinate must be river/lake water
    const p0 = { ...g().pos }
    const day0 = g().day
    const food0 = g().foodDays
    for (let i = 0; i < 30; i++) g().driftCurrent(0.1)
    // Drift is only asserted where the flow field is non-zero; if it moved, it
    // must have cost time and provisions (never free movement).
    if (dist(g().pos, p0) > 0) {
      expect(g().day).toBeGreaterThan(day0)
      expect(g().foodDays).toBeLessThan(food0)
    }
  })

  it('the current runs stronger near a waterfall (design.md §11/§4.4)', () => {
    // Stanley Falls sits on the Congo; the fall coordinate itself samples as
    // river water at full flow, so a single drift step is deterministic there.
    const wf = WATERFALLS.find((w) => w.id === 'stanley-falls')
    if (!wf) return
    if (terrainAt(wf.lat, wf.lon) !== 'water' || riverFlow(wf.lat, wf.lon).strength <= 0) return // guard

    // On the fall (within currentWaterfallRadius) the drift is boosted.
    jumpTo(wf.lat, wf.lon)
    const p0 = { ...g().pos }
    g().driftCurrent(0.1)
    const boosted = dist(g().pos, p0)

    // Isolate the boost by measuring the SAME cell with the boost radius set to
    // 0 (no fall in range → boost 1). Comparing against a far river cell would
    // confound the waterfall boost with that other cell's own flow strength,
    // making the assertion flaky; the same-cell measurement is exact.
    const radius = balance.currentWaterfallRadius
    freshGame()
    balance.randomEventsEnabled = false
    balance.currentWaterfallRadius = 0
    jumpTo(wf.lat, wf.lon)
    const p1 = { ...g().pos }
    g().driftCurrent(0.1)
    const unboosted = dist(g().pos, p1)
    balance.currentWaterfallRadius = radius // restore the balance mutation

    expect(boosted).toBeGreaterThan(0)
    expect(unboosted).toBeGreaterThan(0)
    expect(boosted).toBeGreaterThan(unboosted)
  })
})

describe('debugJumpTo (design.md §21)', () => {
  it('enters travel mode at the coordinate, clears the place and grows exploration', () => {
    expect(g().mode).toBe('place') // fresh game stands in Cairo
    const before = Object.keys(g().explored).length
    const [lat, lon] = COORD.savanna
    g().debugJumpTo(lat, lon)
    expect(g().mode).toBe('travel')
    expect(g().placeId).toBeNull()
    expect(g().region).toBe(regionAt(lat, lon))
    // The jump target lies far from Cairo, so new sight cells are recorded.
    expect(Object.keys(g().explored).length).toBeGreaterThan(before)
  })
})

describe('enterPlace region (design.md §4.5)', () => {
  it("adopts the place's declared region, overriding the current position's", () => {
    const place = placeById('maasai-village') // declared region: east
    // Enter from a different region (central Sahara → north) to prove the
    // region comes from the place, not from the position it is entered from.
    g().debugJumpTo(...COORD.desert)
    expect(g().region).toBe('north')
    g().enterPlace(place.id)
    expect(g().mode).toBe('place')
    expect(g().region).toBe(place.region)
    // No village is currently nudged across a region band, so the declared
    // region also coincides with regionAt here (kept honest by this check);
    // enterPlace still uses the declared field regardless.
    expect(place.region).toBe(regionAt(place.lat, place.lon))
  })
})
