// Store camp/item-cache transitions (CLAUDE.md §7.1 pt. 27, design.md §6/§17).
// Ports the store-driven asserts of camps.mjs (pitch/reopen a free camp,
// store/take respecting capacity, the canoe put-away, per-day looting with the
// campLooted journal entry, the Honored-Friend village-cache gate, cache
// persistence and its destruction by a regional robbery) into fast jsdom
// checks. The DOM-only assert (the .map-overlay X marker canvas) stays in the
// Playwright E2E; the freeCamps state that drives it is covered here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { usedInventory, bagItemCount } from './store'
import { useUi } from './ui'
import { getStrings } from '../i18n'
import { g, freshGame, withWorld, jumpTo, useGame, COORD } from '../test/store'

withWorld()

// Balance fields mutated by these tests (and by raiseCapacityIfNeeded); restored
// after each test so no mutation leaks between cases.
const DEFAULT_CAPACITY = balance.inventoryCapacity
const DEFAULT_LOOT = balance.camps.lootChancePerDay

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
  useUi.getState().setDialog(null) // the UI store is not reset by newGame
})
afterEach(() => {
  balance.randomEventsEnabled = true
  balance.inventoryCapacity = DEFAULT_CAPACITY
  balance.camps.lootChancePerDay = DEFAULT_LOOT
  vi.restoreAllMocks()
})

const journalKeys = () => g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text))
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
const drive = (dirX: number, dirZ: number, n: number, dt = 0.1) => {
  for (let i = 0; i < n; i++) g().moveTravel(dirX, dirZ, dt)
}

describe('free camps: pitching (design.md §6)', () => {
  it('pitches a free camp in the open and opens its dialog', () => {
    jumpTo(...COORD.savanna)
    expect(g().freeCamps).toHaveLength(0)
    g().pitchOrOpenCamp()
    expect(g().freeCamps).toHaveLength(1)
    const camp = g().freeCamps[0]
    // The camp records a map position (source of the X marker) and starts empty.
    expect(camp.looted).toBe(false)
    expect(typeof camp.lat).toBe('number')
    expect(typeof camp.lon).toBe('number')
    expect(bagItemCount(camp.items)).toBe(0)
    const dialog = useUi.getState().dialog
    expect(dialog?.kind).toBe('camp')
    if (dialog?.kind === 'camp') expect(dialog.scope).toBe('free')
  })

  it('reopens a nearby camp on C instead of duplicating it', () => {
    jumpTo(...COORD.savanna)
    g().pitchOrOpenCamp()
    expect(g().freeCamps).toHaveLength(1)
    useUi.getState().setDialog(null)
    g().pitchOrOpenCamp() // C again, still standing on the camp
    expect(g().freeCamps).toHaveLength(1) // reopened, not duplicated
    expect(useUi.getState().dialog?.kind).toBe('camp')
  })
})

describe('free camps: storing and taking (design.md §6)', () => {
  it('moves items pack→cache and back', () => {
    jumpTo(...COORD.savanna)
    g().debugAddGift('gold')
    g().debugAddTreasure('silver')
    g().pitchOrOpenCamp()
    g().campStore('gift', 'gold')
    g().campStore('treasure', 'silver')
    // The pack is emptied, the cache holds them.
    expect(g().gifts.gold).toBe(0)
    expect(g().treasures.silver).toBe(0)
    expect(g().freeCamps[0].items.gifts.gold).toBe(1)
    expect(g().freeCamps[0].items.treasures.silver).toBe(1)
    // Taking one back returns it to the pack and clears the cache slot.
    g().campTake('gift', 'gold')
    expect(g().gifts.gold).toBe(1)
    expect(g().freeCamps[0].items.gifts.gold ?? 0).toBe(0)
  })

  it('a full pack refuses to take from the cache', () => {
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('canoe')
    g().pitchOrOpenCamp()
    g().campStore('equipment', 'canoe')
    expect(g().equipment.canoe ?? 0).toBe(0)
    // Clamp capacity to exactly what the pack already holds → no room for a take.
    balance.inventoryCapacity = usedInventory(g())
    g().campTake('equipment', 'canoe')
    expect(g().equipment.canoe ?? 0).toBe(0) // refused
    expect(g().toast).toBeTruthy()
    // With room the canoe returns.
    balance.inventoryCapacity = 40
    g().campTake('equipment', 'canoe')
    expect(g().equipment.canoe ?? 0).toBe(1)
    expect(g().freeCamps[0].items.equipment.canoe ?? 0).toBe(0)
  })
})

describe('free camps: storing the canoe drops its land penalty (design.md §6/§11)', () => {
  it('leaves the canoe behind so land travel speeds back up', () => {
    // Baseline: canoe in the pack → the land malus shortens the stretch.
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('canoe')
    const p0 = { ...g().pos }
    drive(1, 0, 20)
    const withCanoe = dist(g().pos, p0)

    // Store the canoe in a camp, then travel the same stretch canoe-free.
    freshGame()
    balance.randomEventsEnabled = false
    useUi.getState().setDialog(null)
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('canoe')
    g().pitchOrOpenCamp()
    g().campStore('equipment', 'canoe')
    expect(g().equipment.canoe ?? 0).toBe(0) // left behind in the cache
    expect(g().freeCamps[0].items.equipment.canoe).toBe(1)
    const p1 = { ...g().pos }
    drive(1, 0, 20)
    const stored = dist(g().pos, p1)
    expect(stored).toBeGreaterThan(withCanoe) // penalty dropped
  })
})

describe('free camps: looting (design.md §6)', () => {
  it('loots a stocked camp over a travelled day and reveals it on return', () => {
    jumpTo(...COORD.savanna)
    g().debugAddGift('gold')
    g().debugAddTreasure('silver')
    g().pitchOrOpenCamp()
    g().campStore('gift', 'gold')
    g().campStore('treasure', 'silver')
    expect(bagItemCount(g().freeCamps[0].items)).toBeGreaterThan(0)
    useUi.getState().setDialog(null)

    // Force the per-day loot roll and travel a short stretch off the camp.
    balance.camps.lootChancePerDay = 10000
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    for (let i = 0; i < 6; i++) g().moveTravel(0, -1, 0.05)

    expect(g().freeCamps).toHaveLength(0) // looted camp removed on return
    expect(journalKeys()).toContain('journal.campLooted')
    // The stored goods are gone with the camp.
    expect(g().gifts.gold).toBe(0)
    expect(g().treasures.silver).toBe(0)
  })
})

describe('village caches: Honored Friend privilege (design.md §6/§12)', () => {
  it('refuses the village cache without the friend standing', () => {
    g().enterPlace('nubian-village')
    g().openVillageCamp()
    expect(useUi.getState().dialog).toBeNull()
    expect(g().toast).toBeTruthy() // campNeedsFriend
  })

  it('opens the safe cache for an Honored Friend and keeps items across visits', () => {
    g().enterPlace('nubian-village')
    useGame.setState({ honoredFriend: { north: true } })
    g().openVillageCamp()
    const dialog = useUi.getState().dialog
    expect(dialog?.kind).toBe('camp')
    if (dialog?.kind === 'camp') expect(dialog.scope).toBe('village')

    g().debugAddGift('emerald')
    g().campStore('gift', 'emerald')
    expect(g().villageCamps['nubian-village']?.gifts.emerald).toBe(1)

    // Persistence across leaving and re-entering the village.
    useUi.getState().setDialog(null)
    g().leavePlace()
    g().enterPlace('nubian-village')
    g().openVillageCamp()
    expect(g().villageCamps['nubian-village']?.gifts.emerald).toBe(1)
    g().campTake('gift', 'emerald')
    expect(g().gifts.emerald).toBeGreaterThanOrEqual(1)
  })
})

describe('village caches: a regional robbery destroys them (design.md §6/§12)', () => {
  it('robVillage wipes the region\'s village caches for good', () => {
    g().enterPlace('nubian-village')
    useGame.setState({ honoredFriend: { north: true } })
    g().openVillageCamp()
    g().debugAddGift('emerald')
    g().campStore('gift', 'emerald')
    expect(g().villageCamps['nubian-village']?.gifts.emerald).toBe(1)

    useUi.getState().setDialog(null)
    g().debugAddEquipment('rifle')
    g().robVillage()

    expect(g().villageCamps['nubian-village']).toBeUndefined()
    expect(g().regionRobbed.north).toBe(true)
  })

  it('openVillageCamp refuses with the regionShunned toast, even for a still-marked friend', () => {
    // A robbed region always clears honoredFriend in the real robVillage() flow
    // (store.reputation.test.ts covers that forfeiture); setting both flags
    // directly isolates that the shunned check in openVillageCamp is checked
    // BEFORE the friend-status gate, not merely that the friendship is gone.
    g().enterPlace('nubian-village')
    useGame.setState({ honoredFriend: { north: true }, regionRobbed: { north: true } })
    g().setToast(null)
    g().openVillageCamp()
    expect(useUi.getState().dialog).toBeNull()
    expect(g().toast).toBe(getStrings().toasts.regionShunned)
  })

  it('a robbed region stays shunned for openVillageCamp after the real robbery flow', () => {
    g().enterPlace('nubian-village')
    useGame.setState({ honoredFriend: { north: true } })
    g().debugAddEquipment('rifle')
    g().robVillage() // robs the north region and expels the traveller

    g().enterPlace('tuareg-village') // same north region, still shunned
    g().setToast(null)
    g().openVillageCamp()
    expect(useUi.getState().dialog).toBeNull()
    expect(g().toast).toBe(getStrings().toasts.regionShunned)
  })
})
