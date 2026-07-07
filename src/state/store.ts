// Central game state (zustand). Holds the run seed, player resources, journal,
// travel position, place/audience state and win condition.

import { create } from 'zustand'
import { balance, prices, START_FOOD_DAYS, START_GIFTS, START_MONEY } from '../config/balance'
import type { LatLon, Material, RegionId } from '../world/geo'
import { REGION_VALUES, latLonToWorld, placeById, regionAt, worldToLatLon } from '../world/geo'
import { isBlocked, sampleTerrain } from '../world/terrain'
import { mulberry32 } from '../world/noise'
import { WATERFALLS } from '../world/data/landmarks'
import { riverDistance } from '../world/geoIndex'
import { rollEvent, resolveEvent, type EventContext, type EventKind, type EventOutcome } from '../systems/events'
import type { SketchId } from '../journal/sketches'
import { getStrings, type TextRef } from '../i18n'
import { stripVoiceMarkup } from '../journal/voiceMarkup'
import { useUi } from './ui'

export type EquipmentId =
  | 'shovel'
  | 'rope'
  | 'machete'
  | 'rifle'
  | 'medicine'
  | 'canteen'
  | 'map'
  | 'canoe'

export interface JournalEntry {
  id: number
  /** In-game day index the entry was written. */
  day: number
  title: TextRef
  text: TextRef
  kind: 'event' | 'hint' | 'info'
  /** Optional hand-sketch illustration (design.md §19). */
  sketch?: SketchId
}

export type GameMode = 'travel' | 'place'

/** Afflictions (design.md §6): alter controls/vision and drain health. */
export interface Afflictions {
  fever: boolean
  dehydration: boolean
  sunblind: boolean
  /** 0 = none, 1 = light, 2 = severe. */
  wounds: 0 | 1 | 2
}

export type DeathCause = 'starvation' | 'fever' | 'dehydration' | 'sunblind' | 'wounds' | 'eaten'

/** Coarse condition for display and the vulture signal (design.md §6/§19). */
export function healthState(health: number): 'healthy' | 'weakened' | 'poor' {
  if (health < balance.health.poorThreshold) return 'poor'
  return health < 75 ? 'weakened' : 'healthy'
}

export interface GameState {
  seed: number
  mode: GameMode
  placeId: string | null
  /** Travel position in world units. */
  pos: { x: number; z: number }
  /** In-game days since 1. Januar 1890 (fractional). */
  day: number
  money: number
  /** Provisions in days. */
  foodDays: number
  gifts: Record<Material, number>
  equipment: Partial<Record<EquipmentId, number>>
  handItem: EquipmentId | null
  journal: JournalEntry[]
  journalOpen: boolean
  /** Health points (design.md §6); 0 = death of the character. */
  health: number
  afflictions: Afflictions
  /** Days of desert-free travel left until sun blindness heals. */
  sunblindRecovery: number
  /** Days until the next random event may roll (design.md §14 spam guard). */
  eventCooldown: number
  /** Deadline warning stage already announced (design.md §5): 0, 1 or 2. */
  deadlineWarned: number
  /** Set when the expedition is lost (design.md §15/§18). */
  defeat: 'death' | 'deadline' | null
  deathCause: DeathCause | null
  /** Region the player is currently in (travel mode). */
  region: RegionId
  visitedRegions: RegionId[]
  visitedPlaces: string[]
  /** Audience state per village. */
  /** Explored map cells for the self-drawing map (design.md §19). */
  explored: Record<string, true>
  goodwill: Record<string, number>
  reveredGiftGiven: Record<string, boolean>
  chiefHintGiven: boolean
  languageHintGiven: boolean
  graveLatLon: LatLon
  victory: boolean
  /** Short-lived HUD message. */
  toast: string | null
  foodWarned: boolean
  foodOutWarned: boolean
  hasCheckpoint: boolean
  /** Bumped by the debug menu when mutating the balance object. */
  balanceVersion: number

  // Actions
  moveTravel: (dirX: number, dirZ: number, dt: number) => void
  enterPlace: (id: string) => void
  leavePlace: () => void
  buy: (good: EquipmentId | 'food' | Material) => void
  takeInHand: (item: EquipmentId | null) => void
  giveGift: (material: Material) => void
  talkToVillager: () => void
  dig: () => void
  /** Health per travelled day; exposed for the event engine and tests. */
  tickHealth: (dayDelta: number, terrain: string) => void
  /** Random events per travelled day (design.md §14). */
  tickEvents: (dayDelta: number, terrain: string, lat: number, lon: number) => void
  /** Debug/testing (design.md §21): fire one event immediately. */
  debugTriggerEvent: (kind: EventKind) => void
  /** Deadline check per travelled day (design.md §5). */
  tickDeadline: (day: number) => void
  applyEventOutcome: (outcome: EventOutcome) => void
  useMedicine: () => void
  /** A successor continues from the last checkpoint (design.md §18). */
  successorTakeOver: () => boolean
  /** Debug/testing: set an affliction directly (events trigger them in play). */
  debugSetAffliction: (kind: keyof Afflictions, value: boolean | 0 | 1 | 2) => void
  addEntry: (title: TextRef, text: TextRef, kind?: JournalEntry['kind'], sketch?: SketchId) => void
  setJournalOpen: (open: boolean) => void
  setToast: (msg: string | null) => void
  saveCheckpoint: () => void
  loadCheckpoint: () => boolean
  newGame: () => void
  bumpBalance: () => void
  debugSet: (patch: Partial<Pick<GameState, 'money' | 'foodDays' | 'day' | 'health'>>) => void
  debugAddGift: (material: Material) => void
  debugAddEquipment: (item: EquipmentId) => void
  debugJumpTo: (lat: number, lon: number) => void
}

// v2: entries are language-neutral TextRefs only (plain-string journal
// entries from pre-localization v1 checkpoints are no longer supported).
const CHECKPOINT_KEY = 'hoa-checkpoint-v2'

/** Cell size of the exploration grid for the self-drawing map (design.md §19). */
export const EXPLORE_CELL_DEG = 0.5

export function exploreCellKey(lat: number, lon: number): string {
  return `${Math.floor(lon / EXPLORE_CELL_DEG)}|${Math.floor(lat / EXPLORE_CELL_DEG)}`
}

/**
 * Mark the 3×3 cells around a position as explored (the traveller's sight
 * radius). Returns a new map when something changed, else null.
 */
function withExplored(
  explored: Record<string, true>,
  lat: number,
  lon: number,
): Record<string, true> | null {
  const cx = Math.floor(lon / EXPLORE_CELL_DEG)
  const cy = Math.floor(lat / EXPLORE_CELL_DEG)
  let out: Record<string, true> | null = null
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = `${cx + dx}|${cy + dy}`
      if (!explored[key]) {
        out ??= { ...explored }
        out[key] = true
      }
    }
  }
  return out
}

// Sketch shown with the "new region" journal entry (design.md §19).
const REGION_SKETCHES: Record<RegionId, SketchId> = {
  north: 'palm',
  west: 'acacia',
  central: 'bird',
  east: 'mountain',
  south: 'antelope',
}

/** Place the grave procedurally per run: desert north of the Nubian village. */
function generateGrave(seed: number): LatLon {
  const rand = mulberry32(seed ^ 0x9e3779b9)
  for (let i = 0; i < 200; i++) {
    const lat = 24 + rand() * 3.5
    const lon = 29 + rand() * 4
    const t = sampleTerrain(lat, lon, seed)
    if (t.type === 'desert' || t.type === 'savanna') {
      // Round to 0.1° so the hint coordinates match exactly.
      return { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 }
    }
  }
  return { lat: 25.5, lon: 30.5 } // fallback, always desert
}

function startState(seed: number) {
  const cairo = placeById('cairo')
  const pos = latLonToWorld(cairo.lat, cairo.lon)
  return {
    seed,
    mode: 'place' as GameMode,
    placeId: 'cairo',
    pos,
    day: 0,
    money: START_MONEY,
    foodDays: START_FOOD_DAYS,
    // Start gifts (design.md §18 table: 2) — neutral copper trinkets.
    gifts: { gold: 0, silver: 0, emerald: 0, copper: START_GIFTS, ivory: 0 } as Record<Material, number>,
    equipment: {} as Partial<Record<EquipmentId, number>>,
    handItem: null,
    journal: [
      { id: 1, day: 0, title: { key: 'journal.titles.departure' }, text: { key: 'journal.start' }, kind: 'event' as const, sketch: 'harbor' as SketchId },
    ],
    journalOpen: true,
    health: balance.health.max,
    afflictions: { fever: false, dehydration: false, sunblind: false, wounds: 0 as const },
    sunblindRecovery: 0,
    eventCooldown: 0,
    deadlineWarned: 0,
    defeat: null,
    deathCause: null as DeathCause | null,
    region: 'north' as RegionId,
    visitedRegions: ['north' as RegionId],
    visitedPlaces: ['cairo'],
    explored: withExplored({}, cairo.lat, cairo.lon) ?? {},
    goodwill: {},
    reveredGiftGiven: {},
    chiefHintGiven: false,
    languageHintGiven: false,
    graveLatLon: generateGrave(seed),
    victory: false,
    toast: null,
    foodWarned: false,
    foodOutWarned: false,
    balanceVersion: 0,
  }
}

/** Event context from the current situation (design.md §14). */
function buildEventContext(
  s: Pick<GameState, 'equipment' | 'handItem'>,
  terrain: string,
  lat: number,
  lon: number,
): EventContext {
  const inWater = terrain === 'water' || terrain === 'ocean'
  const nearWaterfall = WATERFALLS.some((w) => Math.hypot(w.lat - lat, w.lon - lon) < 0.35)
  const wetland = terrain === 'jungle' || riverDistance(lat, lon, 0.2) < 0.12
  return { terrain, inWater, nearWaterfall, wetland, hand: s.handItem, equipment: s.equipment }
}

let nextEntryId = 2

function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

export const useGame = create<GameState>()((set, get) => ({
  ...startState(newSeed()),
  hasCheckpoint: typeof localStorage !== 'undefined' && localStorage.getItem(CHECKPOINT_KEY) !== null,

  addEntry: (title, text, kind = 'event', sketch) => {
    set((s) => ({
      journal: [...s.journal, { id: ++nextEntryId, day: Math.floor(s.day), title, text, kind, sketch }],
      // Do not disturb (design.md §16): entries appear silently; the journal
      // only opens automatically while the option is off.
      journalOpen: useUi.getState().journalDnd ? s.journalOpen : true,
    }))
  },

  setJournalOpen: (open) => set({ journalOpen: open }),
  setToast: (msg) => set({ toast: msg }),

  moveTravel: (dirX, dirZ, dt) => {
    const s = get()
    if (s.mode !== 'travel' || s.victory || s.defeat) return
    let len = Math.hypot(dirX, dirZ)
    if (len === 0) return
    const cur = worldToLatLon(s.pos.x, s.pos.z)
    const here = sampleTerrain(cur.lat, cur.lon, s.seed)

    // Afflicted steering (design.md §6): fever delirium turns movement
    // temporarily uncontrolled, dehydration makes the traveller drift.
    if (s.afflictions.fever) {
      const a = (Math.random() - 0.5) * Math.PI * 1.4
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      ;[dirX, dirZ] = [dirX * cos - dirZ * sin, dirX * sin + dirZ * cos]
    } else if (s.afflictions.dehydration) {
      const a = (Math.random() - 0.5) * Math.PI * 0.5
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      ;[dirX, dirZ] = [dirX * cos - dirZ * sin, dirX * sin + dirZ * cos]
    }
    len = Math.hypot(dirX, dirZ)

    // Terrain time-cost factor depends on terrain and hand item (design.md §11).
    const tc = balance.terrainCost
    let cost: number
    switch (here.type) {
      case 'desert':
        cost = tc.desert
        break
      case 'jungle':
        cost = s.handItem === 'machete' ? tc.jungleWithMachete : tc.jungle
        break
      case 'mountain':
        cost = s.handItem === 'rope' ? tc.mountainWithRope : tc.mountain
        break
      case 'water':
      // Enclosed sea water (design.md §11) is swum/crossed like inland water.
      case 'ocean':
        cost = s.handItem === 'canoe' ? tc.waterWithCanoe : tc.water
        break
      default:
        cost = tc.savanna
    }

    let speed = balance.travelSpeed / Math.max(0.25, cost)
    if (s.afflictions.dehydration) speed *= 0.7 // §11: speed loss in the desert
    const step = speed * dt
    const nx = s.pos.x + (dirX / len) * step
    const nz = s.pos.z + (dirZ / len) * step
    const next = worldToLatLon(nx, nz)
    const nextT = sampleTerrain(next.lat, next.lon, s.seed)
    if (isBlocked(nextT.type, next.lat, next.lon)) {
      set({ toast: getStrings().toasts.oceanBlocked })
      return
    }

    const dayDelta = step * balance.daysPerUnit * cost
    const foodDelta = dayDelta * balance.foodPerDay
    const newFood = Math.max(0, s.foodDays - foodDelta)
    const newDay = s.day + dayDelta

    const patch: Partial<GameState> = { pos: { x: nx, z: nz }, day: newDay, foodDays: newFood }

    const newRegion = regionAt(next.lat, next.lon)
    if (newRegion !== s.region) patch.region = newRegion
    const ex = withExplored(s.explored, next.lat, next.lon)
    if (ex) patch.explored = ex
    set(patch)

    if (!s.visitedRegions.includes(newRegion)) {
      set((st) => ({ visitedRegions: [...st.visitedRegions, newRegion] }))
      get().addEntry(
        { key: 'journal.titles.region', params: { region: newRegion } },
        { key: 'journal.regionEntry', params: { region: newRegion } },
        'event',
        REGION_SKETCHES[newRegion],
      )
    }
    if (!s.foodWarned && newFood < 7 && newFood > 0) {
      set({ foodWarned: true })
      get().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
    }
    if (!s.foodOutWarned && newFood === 0) {
      set({ foodOutWarned: true })
      get().addEntry({ key: 'journal.titles.foodOut' }, { key: 'journal.foodOut' })
    }

    get().tickHealth(dayDelta, here.type)
    get().tickEvents(dayDelta, here.type, next.lat, next.lon)
    get().tickDeadline(newDay)
  },

  /**
   * Multi-year deadline (design.md §5): staged warnings, defeat on expiry.
   */
  tickDeadline: (day: number) => {
    const s = get()
    if (s.defeat || s.victory) return
    const dl = balance.deadline
    if (day >= dl.days) {
      set({ defeat: 'deadline', journalOpen: false })
      return
    }
    if (s.deadlineWarned < 2 && day >= dl.days * dl.warning2) {
      set({ deadlineWarned: 2 })
      get().addEntry({ key: 'journal.titles.deadline2' }, { key: 'journal.deadline2' })
    } else if (s.deadlineWarned < 1 && day >= dl.days * dl.warning1) {
      set({ deadlineWarned: 1 })
      get().addEntry({ key: 'journal.titles.deadline1' }, { key: 'journal.deadline1' })
    }
  },

  successorTakeOver: () => {
    if (!get().loadCheckpoint()) return false
    const s = get()
    const day = s.day + balance.deadline.successorDayPenalty
    // Warnings already passed at the resumed date stay silent.
    const dl = balance.deadline
    const warned = day >= dl.days * dl.warning2 ? 2 : day >= dl.days * dl.warning1 ? 1 : 0
    set({ day, deadlineWarned: warned })
    get().addEntry({ key: 'journal.titles.successor' }, { key: 'journal.successor' })
    return true
  },

  tickEvents: (dayDelta, terrain, lat, lon) => {
    const s = get()
    if (s.defeat || s.victory || !balance.randomEventsEnabled) return
    if (s.eventCooldown > 0) {
      set({ eventCooldown: s.eventCooldown - dayDelta })
      return
    }
    const ctx = buildEventContext(s, terrain, lat, lon)
    const outcome = rollEvent(ctx, dayDelta, Math.random)
    if (!outcome) return
    set({ eventCooldown: balance.events.cooldownDays * (0.75 + Math.random() * 0.5) })
    get().applyEventOutcome(outcome)
  },

  /** Apply a resolved event to the state and report it (design.md §16). */
  applyEventOutcome: (o: EventOutcome) => {
    const s = get()
    const animal = o.kind === 'lionAttack' ? 'lion' : o.kind === 'leopardAttack' ? 'leopard' : o.kind === 'snakeBite' ? 'snake' : 'crocodile'
    switch (o.kind) {
      case 'lionAttack':
      case 'leopardAttack':
      case 'snakeBite':
      case 'crocodileAttack': {
        if (o.result === 'fatal') {
          set({ health: 0, defeat: 'death', deathCause: 'eaten', journalOpen: false })
          return
        }
        if (o.result === 'light') {
          set({ afflictions: { ...s.afflictions, wounds: Math.max(s.afflictions.wounds, 1) as 0 | 1 | 2 } })
        } else if (o.result === 'severe') {
          set({ afflictions: { ...s.afflictions, wounds: 2 } })
        }
        get().addEntry(
          { key: 'journal.titles.attack' },
          { key: 'journal.animalAttack', params: { animal, result: o.result } },
        )
        return
      }
      case 'robberAttack': {
        if (o.result === 'robbed') {
          set({ money: Math.max(0, s.money - (o.money ?? 0)) })
          if (Math.random() < 0.4) {
            set({ afflictions: { ...s.afflictions, wounds: Math.max(s.afflictions.wounds, 1) as 0 | 1 | 2 } })
          }
        }
        get().addEntry(
          { key: 'journal.titles.robbery' },
          { key: 'journal.robbery', params: { result: o.result, money: o.money ?? 0 } },
        )
        return
      }
      case 'fever': {
        if (s.afflictions.fever) return
        set({ afflictions: { ...s.afflictions, fever: true } })
        get().addEntry({ key: 'journal.titles.fever' }, { key: 'journal.feverOn' })
        return
      }
      case 'sunblindness': {
        if (s.afflictions.sunblind) return
        set({
          afflictions: { ...s.afflictions, sunblind: true },
          sunblindRecovery: balance.health.sunblindRecoveryDays,
        })
        get().addEntry({ key: 'journal.titles.sunblind' }, { key: 'journal.sunblindOn' })
        return
      }
      case 'sandstorm': {
        set({ day: s.day + (o.daysLost ?? 0.5) })
        get().addEntry({ key: 'journal.titles.sandstorm' }, { key: 'journal.sandstorm' })
        return
      }
      case 'waterfallSweep': {
        // Swept over the falls (design.md §11/§14): injuries and the loss
        // of a large part of the inventory.
        const gifts = { ...s.gifts }
        for (const k of Object.keys(gifts) as (keyof typeof gifts)[]) gifts[k] = Math.floor(gifts[k] / 2)
        const equipment = { ...s.equipment }
        const droppable = (Object.keys(equipment) as EquipmentId[]).filter((e) => e !== 'shovel' && (equipment[e] ?? 0) > 0)
        if (droppable.length > 0) {
          const drop = droppable[Math.floor(Math.random() * droppable.length)]
          equipment[drop] = (equipment[drop] ?? 1) - 1
        }
        set({
          gifts,
          equipment,
          foodDays: s.foodDays * 0.7,
          afflictions: { ...s.afflictions, wounds: Math.random() < 0.5 ? 2 : Math.max(s.afflictions.wounds, 1) as 0 | 1 | 2 },
          handItem: s.handItem === 'shovel' ? s.handItem : null,
        })
        get().addEntry({ key: 'journal.titles.sweptAway' }, { key: 'journal.sweptAway' })
        return
      }
      case 'findRemains': {
        set({ money: s.money + (o.money ?? 0) })
        get().addEntry(
          { key: 'journal.titles.discovery' },
          { key: 'journal.findRemains', params: { money: o.money ?? 0 } },
        )
        return
      }
    }
  },

  debugTriggerEvent: (kind) => {
    const s = get()
    if (s.defeat || s.victory) return
    const cur = worldToLatLon(s.pos.x, s.pos.z)
    const here = sampleTerrain(cur.lat, cur.lon, s.seed)
    const ctx = buildEventContext(s, here.type, cur.lat, cur.lon)
    get().applyEventOutcome(resolveEvent(kind, ctx, Math.random))
  },

  /**
   * Health per travelled day (design.md §6): dehydration follows from
   * desert travel without a canteen, afflictions and starvation drain
   * health, sun blindness heals only outside the desert, and at zero
   * health the expedition is lost (§15).
   */
  tickHealth: (dayDelta: number, terrain: string) => {
    const s = get()
    if (s.defeat) return
    const hb = balance.health
    const a = { ...s.afflictions }

    // Dehydration (§6): in the desert without a canteen; the canteen is
    // always full. Leaving the desert or owning a canteen ends it.
    const dehydrated = terrain === 'desert' && !(s.equipment.canteen && s.equipment.canteen > 0)
    if (dehydrated && !a.dehydration) {
      a.dehydration = true
      get().addEntry({ key: 'journal.titles.dehydration' }, { key: 'journal.dehydrationOn' })
    } else if (!dehydrated && a.dehydration) {
      a.dehydration = false
      get().addEntry({ key: 'journal.titles.recovery' }, { key: 'journal.dehydrationOver' })
    }

    // Sun blindness heals only outside the desert (§6).
    let sunblindRecovery = s.sunblindRecovery
    if (a.sunblind && terrain !== 'desert') {
      sunblindRecovery -= dayDelta
      if (sunblindRecovery <= 0) {
        a.sunblind = false
        get().addEntry({ key: 'journal.titles.recovery' }, { key: 'journal.sunblindOver' })
      }
    }

    let drain = 0
    if (s.foodDays <= 0) drain += hb.starvationDrain
    if (a.fever) drain += hb.feverDrain
    if (a.dehydration) drain += hb.dehydrationDrain
    if (a.sunblind) drain += hb.sunblindDrain
    if (a.wounds === 1) drain += hb.woundLightDrain
    if (a.wounds === 2) drain += hb.woundSevereDrain

    let health = s.health
    if (drain > 0) {
      health = Math.max(0, health - drain * dayDelta)
    } else if (s.foodDays > 0) {
      health = Math.min(hb.max, health + hb.regenPerDay * dayDelta)
    }

    const wasPoor = healthState(s.health) === 'poor'
    set({ health, afflictions: a, sunblindRecovery })
    if (!wasPoor && healthState(health) === 'poor' && health > 0) {
      get().addEntry({ key: 'journal.titles.healthPoor' }, { key: 'journal.healthPoor' })
    }

    if (health <= 0) {
      const cause: DeathCause = a.wounds === 2 ? 'wounds'
        : a.fever ? 'fever'
        : a.dehydration ? 'dehydration'
        : a.sunblind ? 'sunblind'
        : s.foodDays <= 0 ? 'starvation'
        : 'wounds'
      // Death (design.md §15): no more entries — the remains report takes
      // over in the defeat overlay.
      set({ defeat: 'death', deathCause: cause, journalOpen: false })
    }
  },

  useMedicine: () => {
    const s = get()
    if (s.defeat || s.victory) return
    const strings = getStrings()
    if (!s.equipment.medicine || s.equipment.medicine <= 0) {
      set({ toast: strings.toasts.noMedicine })
      return
    }
    if (!s.afflictions.fever && s.afflictions.wounds === 0) {
      set({ toast: strings.toasts.medicineNotNeeded })
      return
    }
    set({
      equipment: { ...s.equipment, medicine: s.equipment.medicine - 1 },
      afflictions: { ...s.afflictions, fever: false, wounds: 0 },
    })
    get().addEntry({ key: 'journal.titles.recovery' }, { key: 'journal.medicineUsed' })
  },

  debugSetAffliction: (kind, value) => {
    const s = get()
    const a = { ...s.afflictions, [kind]: value } as Afflictions
    const patch: Partial<GameState> = { afflictions: a }
    if (kind === 'sunblind' && value === true) patch.sunblindRecovery = balance.health.sunblindRecoveryDays
    set(patch)
  },

  enterPlace: (id) => {
    const s = get()
    const place = placeById(id)
    const first = !s.visitedPlaces.includes(id)
    set({
      mode: 'place',
      placeId: id,
      // Place membership defines the region shown/used while inside (§4.5).
      region: place.region,
      visitedPlaces: first ? [...s.visitedPlaces, id] : s.visitedPlaces,
      toast: null,
    })
    if (place.kind === 'port') {
      get().saveCheckpoint()
      get().addEntry(
        { key: 'journal.titles.arrival', params: { place: id } },
        { key: 'journal.portArrival', params: { place: id } },
        'event',
        'harbor',
      )
    } else if (first) {
      get().addEntry(
        { key: 'journal.titles.village', params: { place: id } },
        { key: 'journal.villageFirstVisit', params: { place: id } },
        'event',
        'hut',
      )
    }
  },

  leavePlace: () => {
    const s = get()
    if (!s.placeId) return
    const place = placeById(s.placeId)
    const p = latLonToWorld(place.lat, place.lon)
    // Re-enter offset south of the marker so the enter prompt does not retrigger.
    set({ mode: 'travel', placeId: null, pos: { x: p.x, z: p.z + balance.placeEnterRadius + 1.5 } })
  },

  buy: (good) => {
    const s = get()
    const price = priceOfGood(good)
    if (price === undefined || s.money < price) {
      set({ toast: getStrings().toasts.notEnoughMoney })
      return
    }
    if (good === 'food') {
      set({ money: s.money - price, foodDays: s.foodDays + 7, toast: getStrings().toasts.boughtFood })
    } else if (good === 'gold' || good === 'silver' || good === 'emerald' || good === 'copper' || good === 'ivory') {
      const m = good as Material
      set({
        money: s.money - price,
        gifts: { ...s.gifts, [m]: s.gifts[m] + 1 },
        toast: getStrings().toasts.bought(getStrings().gifts[m]),
      })
    } else {
      const e = good as EquipmentId
      set({
        money: s.money - price,
        equipment: { ...s.equipment, [e]: (s.equipment[e] ?? 0) + 1 },
        toast: getStrings().toasts.bought(getStrings().equipment[e]),
      })
    }
  },

  takeInHand: (item) => {
    const s = get()
    if (item !== null && !(s.equipment[item] ?? 0)) return
    set({ handItem: item, toast: item ? getStrings().toasts.inHand(getStrings().equipment[item]) : getStrings().toasts.handsFree })
  },

  giveGift: (material) => {
    const s = get()
    if (!s.placeId) return
    const place = placeById(s.placeId)
    if (place.kind !== 'village' || s.gifts[material] <= 0) return
    const values = REGION_VALUES[place.region]
    const gifts = { ...s.gifts, [material]: s.gifts[material] - 1 }
    const gw = s.goodwill[place.id] ?? 0

    if (values.rejected.includes(material)) {
      // OPEN: design.md §12 prescribes hostility/eviction on wrong behavior;
      // the POC simplifies this to a goodwill penalty plus journal entry.
      set({ gifts, goodwill: { ...s.goodwill, [place.id]: Math.max(0, gw - 2) } })
      get().addEntry({ key: 'journal.titles.mistake' }, { key: 'journal.giftRejected', params: { people: place.peopleId ?? place.id } })
      return
    }

    const revered = values.revered.includes(material)
    const gain = revered ? balance.goodwillRevered : balance.goodwillNeutral
    const newGw = gw + gain
    const reveredGiven = { ...s.reveredGiftGiven, [place.id]: (s.reveredGiftGiven[place.id] ?? false) || revered }
    set({ gifts, goodwill: { ...s.goodwill, [place.id]: newGw }, reveredGiftGiven: reveredGiven })

    if (revered) {
      get().addEntry({ key: 'journal.titles.audience' }, { key: 'journal.giftRevered', params: { people: place.peopleId ?? place.id } })
    } else {
      get().addEntry({ key: 'journal.titles.audience' }, { key: 'journal.giftNeutral' })
    }

    // The culturally correct (revered) gift is the hard condition for the hint
    // (CLAUDE.md §7.1.6), plus sufficient goodwill.
    if (!s.chiefHintGiven && reveredGiven[place.id] && newGw >= balance.goodwillForHint) {
      const g = get().graveLatLon
      set({ chiefHintGiven: true })
      get().addEntry(
        { key: 'journal.titles.chiefHint' },
        { key: 'journal.chiefHint', params: { lat: g.lat, lon: g.lon } },
        'hint',
        'compass',
      )
    }
  },

  talkToVillager: () => {
    const s = get()
    if (s.languageHintGiven) {
      set({ toast: getStrings().toasts.villagerNod })
      return
    }
    set({ languageHintGiven: true })
    get().addEntry({ key: 'journal.titles.language' }, { key: 'journal.languageHint' }, 'hint', 'face')
  },

  dig: () => {
    const s = get()
    if (s.mode !== 'travel' || s.victory) return
    if (s.handItem !== 'shovel') {
      set({ toast: getStrings().toasts.digNoShovel })
      return
    }
    const g = latLonToWorld(s.graveLatLon.lat, s.graveLatLon.lon)
    const d = Math.hypot(s.pos.x - g.x, s.pos.z - g.z)
    if (d <= balance.digRadius) {
      set({ victory: true })
      get().addEntry({ key: 'journal.titles.victory' }, { key: 'journal.victory', params: { day: s.day } }, 'event', 'grave')
    } else {
      // Journal texts carry voice markup; strip it for the plain toast.
      set({ toast: stripVoiceMarkup(getStrings().journal.digNothing) })
    }
  },

  saveCheckpoint: () => {
    const s = get()
    const snapshot = {
      seed: s.seed, placeId: s.placeId, pos: s.pos, day: s.day, money: s.money,
      foodDays: s.foodDays, gifts: s.gifts, equipment: s.equipment, handItem: s.handItem,
      journal: s.journal, region: s.region, visitedRegions: s.visitedRegions,
      health: s.health, afflictions: s.afflictions, sunblindRecovery: s.sunblindRecovery,
      visitedPlaces: s.visitedPlaces, goodwill: s.goodwill, reveredGiftGiven: s.reveredGiftGiven,
      chiefHintGiven: s.chiefHintGiven, languageHintGiven: s.languageHintGiven,
      graveLatLon: s.graveLatLon, foodWarned: s.foodWarned, foodOutWarned: s.foodOutWarned,
      deadlineWarned: s.deadlineWarned,
      explored: s.explored,
      nextEntryId,
    }
    try {
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(snapshot))
      set({ hasCheckpoint: true })
    } catch {
      // Storage unavailable (e.g. private mode) — checkpoint silently skipped.
    }
  },

  loadCheckpoint: () => {
    try {
      const raw = localStorage.getItem(CHECKPOINT_KEY)
      if (!raw) return false
      const snap = JSON.parse(raw)
      nextEntryId = snap.nextEntryId ?? 1000
      set({
        ...snap,
        explored: snap.explored ?? {},
        health: snap.health ?? balance.health.max,
        deadlineWarned: snap.deadlineWarned ?? 0,
        afflictions: snap.afflictions ?? { fever: false, dehydration: false, sunblind: false, wounds: 0 },
        sunblindRecovery: snap.sunblindRecovery ?? 0,
        defeat: null,
        deathCause: null,
        mode: 'place',
        victory: false,
        toast: null,
        journalOpen: false,
      })
      return true
    } catch {
      return false
    }
  },

  newGame: () => {
    nextEntryId = 2
    set({ ...startState(newSeed()) })
  },

  bumpBalance: () => set((s) => ({ balanceVersion: s.balanceVersion + 1 })),

  debugSet: (patch) => set(patch),

  debugAddGift: (material) =>
    set((s) => ({ gifts: { ...s.gifts, [material]: s.gifts[material] + 1 } })),

  debugAddEquipment: (item) =>
    set((s) => ({ equipment: { ...s.equipment, [item]: (s.equipment[item] ?? 0) + 1 } })),

  debugJumpTo: (lat, lon) => {
    const p = latLonToWorld(lat, lon)
    const ex = withExplored(get().explored, lat, lon)
    set({ mode: 'travel', placeId: null, pos: p, region: regionAt(lat, lon), ...(ex ? { explored: ex } : {}) })
  },
}))

/** Price lookup against the central config (config/balance.ts). */
export function priceOfGood(good: EquipmentId | 'food' | Material): number {
  switch (good) {
    case 'food': return prices.food
    case 'medicine': return prices.medicine
    case 'map': return prices.map
    case 'shovel': return prices.shovel
    case 'rope': return prices.rope
    case 'canteen': return prices.canteen
    case 'machete': return prices.machete
    case 'rifle': return prices.rifle
    case 'canoe': return prices.canoe
    case 'gold': return prices.giftGold
    case 'silver': return prices.giftSilver
    case 'emerald': return prices.giftEmerald
    case 'copper': return prices.giftCopper
    case 'ivory': return prices.giftIvory
  }
}

// Dev-only hook for the headless Playwright verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__game = useGame
}


/** Total gift count for the status bar. */
export function totalGifts(gifts: Record<Material, number>): number {
  return Object.values(gifts).reduce((a, b) => a + b, 0)
}
