// Central game state (zustand). Holds the run seed, player resources, journal,
// travel position, place/audience state and win condition.

import { create } from 'zustand'
import { balance, prices, START_FOOD_DAYS, START_GIFTS, START_MONEY } from '../config/balance'
import type { LatLon, Material, RegionId } from '../world/geo'
import { REGION_VALUES, latLonToWorld, placeById, regionAt, worldToLatLon } from '../world/geo'
import { isBlocked, sampleTerrain } from '../world/terrain'
import { mulberry32 } from '../world/noise'
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
  addEntry: (title: TextRef, text: TextRef, kind?: JournalEntry['kind'], sketch?: SketchId) => void
  setJournalOpen: (open: boolean) => void
  setToast: (msg: string | null) => void
  saveCheckpoint: () => void
  loadCheckpoint: () => boolean
  newGame: () => void
  bumpBalance: () => void
  debugSet: (patch: Partial<Pick<GameState, 'money' | 'foodDays' | 'day'>>) => void
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
    if (s.mode !== 'travel' || s.victory) return
    const len = Math.hypot(dirX, dirZ)
    if (len === 0) return
    const cur = worldToLatLon(s.pos.x, s.pos.z)
    const here = sampleTerrain(cur.lat, cur.lon, s.seed)

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

    const speed = balance.travelSpeed / Math.max(0.25, cost)
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
      // OPEN: design.md defines no explicit starvation consequence for the POC
      // scope; provisions clamp at 0 and only a journal warning is issued.
      set({ foodOutWarned: true })
      get().addEntry({ key: 'journal.titles.foodOut' }, { key: 'journal.foodOut' })
    }
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
      visitedPlaces: s.visitedPlaces, goodwill: s.goodwill, reveredGiftGiven: s.reveredGiftGiven,
      chiefHintGiven: s.chiefHintGiven, languageHintGiven: s.languageHintGiven,
      graveLatLon: s.graveLatLon, foodWarned: s.foodWarned, foodOutWarned: s.foodOutWarned,
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
