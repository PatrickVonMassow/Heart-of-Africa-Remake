// Central game state (zustand). Holds the run seed, player resources, journal,
// travel position, place/audience state and win condition.

import { create } from 'zustand'
import { balance, prices, START_FOOD_DAYS, START_GIFTS, START_MONEY } from '../config/balance'
import type { LatLon, Material, RegionId } from '../world/geo'
import { PLACES, REGION_VALUES, latLonToWorld, placeById, regionAt, worldToLatLon } from '../world/geo'
import { isBlocked, sampleTerrain } from '../world/terrain'
import { mulberry32 } from '../world/noise'
import { WATERFALLS } from '../world/data/landmarks'
import { lakeDistance, riverDistance, riverFlow } from '../world/geoIndex'
import { rollEvent, resolveEvent, type EventContext, type EventKind, type EventOutcome } from '../systems/events'
import { movementPenalty } from '../systems/movement'
import {
  LANDMARK_POINTS, TREASURE_IDS, ferryCost, ferryDays, generateTreasureSites, treasureBid, treasureBuyPrice,
  type TreasureId, type TreasureSite,
} from '../systems/economy'
import { ELEPHANT_GRAVEYARD } from '../world/data/landmarks'
import { UNSPECIFIC_WORDS } from '../world/lore'
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

export const EQUIPMENT_IDS: EquipmentId[] = ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen', 'map', 'canoe']

/** Item kinds movable between the pack and a camp cache (design.md §6). */
export type ItemKind = 'equipment' | 'gift' | 'treasure'

/** Contents of a camp cache (design.md §6). */
export interface ItemBag {
  equipment: Partial<Record<EquipmentId, number>>
  gifts: Partial<Record<Material, number>>
  treasures: Partial<Record<TreasureId, number>>
}

export function emptyBag(): ItemBag {
  return { equipment: {}, gifts: {}, treasures: {} }
}

export function bagItemCount(bag: ItemBag): number {
  const sum = (r: Partial<Record<string, number>>) => Object.values(r).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0
  return sum(bag.equipment) + sum(bag.gifts) + sum(bag.treasures)
}

/** A free camp pitched in the open (design.md §6): X on the map, lootable. */
export interface FreeCamp {
  id: number
  lat: number
  lon: number
  items: ItemBag
  /** Looted camps reveal their fate when the traveler returns. */
  looted: boolean
}

export interface JournalEntry {
  id: number
  /** In-game day index the entry was written. */
  day: number
  title: TextRef
  text: TextRef
  kind: 'event' | 'hint' | 'info'
  /** Optional hand-sketch illustration (design.md §19). */
  sketch?: SketchId
  /** Wound level of the writing hand at the time (design.md §16). */
  wounds?: 0 | 1 | 2
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
  /** A settlement just left (design.md §2): re-entry is suppressed until the
   *  traveller clears it, so walking straight back does not re-enter at once. */
  reentrySuppressedId: string | null
  /** Travel position in world units. */
  pos: { x: number; z: number }
  /** In-game days since 1. Januar 1890 (fractional). */
  day: number
  money: number
  /** Provisions in days. */
  foodDays: number
  gifts: Record<Material, number>
  equipment: Partial<Record<EquipmentId, number>>
  /** Treasure finds carried along (design.md §8). */
  treasures: Record<TreasureId, number>
  /** Buried treasure caches, procedural per run (design.md §18). */
  treasureSites: TreasureSite[]
  /** Ivory pieces still recoverable at the elephant graveyard (§4.4). */
  graveyardIvoryLeft: number
  /** Standing bazaar quotes per treasure at the current port, so re-offering
   * after a decline shows the same price (design.md §10); cleared on leaving. */
  bazaarQuotes: Partial<Record<TreasureId, number>>
  /** Discoveries awaiting their bounty at the next port visit (§10). */
  pendingBounties: Array<{ kind: 'village' | 'landmark'; id: string }>
  landmarksSeen: string[]
  /** Villages that already reacted to a visibly carried valuable (§8). */
  valuableShown: Record<string, boolean>
  /** Settlements whose buildings are highlighted after a gift (§17). */
  orientationGiven: Record<string, boolean>
  journal: JournalEntry[]
  journalOpen: boolean
  /** Health points (design.md §6); 0 = death of the character. */
  health: number
  afflictions: Afflictions
  /** Days of desert-free travel left until sun blindness heals. */
  sunblindRecovery: number
  /** Accumulated days of thirst (empty canteen) until dehydration (§6). */
  dryDays: number
  /** Days accumulated toward the current wound stage healing on its own
   *  (design.md §6): while fed, a severe wound subsides to a light one and a
   *  light wound closes — medicine stays the instant cure. */
  woundHealDays: number
  /** Canteen water level 0..1 (design.md §6); only meaningful with a canteen. */
  canteenFill: number
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
  /** "Honored Friend" standing per region (design.md §12). */
  honoredFriend: Partial<Record<RegionId, boolean>>
  /** Regions whose friend status was forfeited by a robbery — for good. */
  friendForfeited: Partial<Record<RegionId, boolean>>
  /** Regions antagonized by a hut robbery: no huts, no hints (§12). */
  regionRobbed: Partial<Record<RegionId, boolean>>
  /** Per village: in-game day until which it stays hostile (§12 expulsion). */
  hostileUntil: Record<string, number>
  /** Day of the last near-death aid delivery (§12), for the cooldown. */
  lastFriendAidDay: number
  /** Free camps pitched in the open (design.md §6): lootable item caches. */
  freeCamps: FreeCamp[]
  /** Safe village caches per village id (design.md §6, needs Honored Friend). */
  villageCamps: Record<string, ItemBag>
  /** Per region: the village whose people knows the location hint (§13.3). */
  knowingVillages: Record<RegionId, string>
  /** Regions whose knowing chief already gave his raw hint. */
  hintsGiven: Partial<Record<RegionId, boolean>>
  /** Regions whose raw hint has been deciphered into a decoded entry. */
  decodedGiven: Partial<Record<RegionId, boolean>>
  /** Regions whose direction system has been learned from an elder (§13.2). */
  languagesLearned: Partial<Record<RegionId, boolean>>
  /** Villages whose chief already shared his unspecific knowledge. */
  unspecificGiven: Record<string, boolean>
  /** Regions whose revered gift an elder has revealed (§8). */
  giftLoreGiven: Partial<Record<RegionId, boolean>>
  graveLatLon: LatLon
  victory: boolean
  /** Short-lived HUD message. */
  toast: string | null
  foodWarned: boolean
  foodOutWarned: boolean
  /** Movement-penalty types already announced in the journal (design.md §11):
   *  each is journaled once, then only the status-bar hint carries it. */
  penaltyJournaled: { jungle: boolean; water: boolean; mountain: boolean; canoeOnLand: boolean }
  /** First-time danger warnings already given (design.md §14): each danger
   *  situation is announced once with advice on how to protect against it. */
  dangerWarned: { unarmed: boolean; desert: boolean; water: boolean; wetland: boolean }
  hasCheckpoint: boolean
  /** Bumped by the debug menu when mutating the balance object. */
  balanceVersion: number

  // Actions
  moveTravel: (dirX: number, dirZ: number, dt: number) => void
  /** Passive river-current drift, applied every travel frame (design.md §11). */
  driftCurrent: (dt: number) => void
  enterPlace: (id: string) => void
  leavePlace: () => void
  buy: (good: EquipmentId | 'food' | Material) => void
  /** Sell a piece of gear for the settlement's currency (money in a port,
   * gifts in a village; design.md §9/§10). */
  sellItem: (id: EquipmentId) => void
  /** Bazaar (design.md §10): offer a treasure — the merchant names a bid. */
  offerTreasure: (treasure: TreasureId) => void
  acceptBid: () => void
  declineBid: () => void
  buyTreasure: (treasure: TreasureId) => void
  /** Travel agency (design.md §10): passage to another port city. */
  bookFerry: (destId: string) => void
  giveGift: (material: Material) => void
  talkToVillager: () => void
  /** Present a carried valuable to a village — provokes the §8 reaction. */
  presentValuable: (treasure: TreasureId) => void
  /** Rob the hut with a rifle (design.md §12) — permanent regional loss. */
  robVillage: () => void
  /** Pitch a camp in the open, or reopen the one nearby (design.md §6). */
  pitchOrOpenCamp: () => void
  /** Open the village cache — requires "Honored Friend" (design.md §6). */
  openVillageCamp: () => void
  /** Move one item from the pack into the open camp dialog's cache. */
  campStore: (kind: ItemKind, id: string) => void
  /** Take one item back out of the cache (capacity permitting). */
  campTake: (kind: ItemKind, id: string) => void
  /** Write the decoded version of a region's hint once language + hint meet. */
  revealDecoded: (region: RegionId) => void
  dig: () => void
  /** Health per travelled day; exposed for the event engine and tests. */
  tickHealth: (dayDelta: number, terrain: string, lat: number, lon: number) => void
  /** Random events per travelled day (design.md §14). */
  tickEvents: (dayDelta: number, terrain: string, lat: number, lon: number) => void
  /** Debug/testing (design.md §21): fire one event immediately. */
  debugTriggerEvent: (kind: EventKind) => void
  /** Deadline check per travelled day (design.md §5). */
  tickDeadline: (day: number) => void
  applyEventOutcome: (outcome: EventOutcome) => void
  /** Resolve a fall while climbing a mountain without a rope (design.md §11). */
  applyMountainFall: () => void
  debugTriggerMountainFall: () => void
  /** Walking into a wandering predator triggers its attack (design.md §14/§19):
   *  every bird's-eye predator (lion, cheetah, leopard, hyena), not only the lion. */
  predatorContact: (predator: 'lion' | 'cheetah' | 'leopard' | 'hyena') => void
  useMedicine: () => void
  /** A successor continues from the last checkpoint (design.md §18). */
  successorTakeOver: () => boolean
  /** Debug/testing: set an affliction directly (events trigger them in play). */
  debugSetAffliction: (kind: keyof Afflictions, value: boolean | 0 | 1 | 2) => void
  addEntry: (title: TextRef, text: TextRef, kind?: JournalEntry['kind'], sketch?: SketchId) => void
  setJournalOpen: (open: boolean) => void
  setToast: (msg: string | null) => void
  saveCheckpoint: () => void
  /** Load a port-visit snapshot; the latest without an index (design.md §18). */
  loadCheckpoint: (index?: number) => boolean
  newGame: () => void
  bumpBalance: () => void
  debugSet: (patch: Partial<Pick<GameState, 'money' | 'foodDays' | 'day' | 'health'>>) => void
  debugAddGift: (material: Material) => void
  debugAddEquipment: (item: EquipmentId) => void
  debugAddTreasure: (treasure: TreasureId) => void
  /** Debug (design.md §21): set the total gift count directly. */
  debugSetGiftTotal: (total: number) => void
  /** Debug (design.md §21, F3): full loadout — all gear/gifts/treasures,
   * money/food maxed, full health, no afflictions; capacity raised to fit. */
  debugFullLoadout: () => void
  /** Debug (design.md §21, F4): toggle the canoe in and out of the pack. */
  debugToggleCanoe: () => void
  debugJumpTo: (lat: number, lon: number) => void
}

// v2: entries are language-neutral TextRefs only (plain-string journal
// entries from pre-localization v1 checkpoints are no longer supported).
const LEGACY_CHECKPOINT_KEY = 'hoa-checkpoint-v2'
// Full save system (design.md §18): one snapshot per port visit, listed in
// the tabular load menu. A single legacy snapshot migrates as one entry.
const CHECKPOINTS_KEY = 'hoa-checkpoints-v1'
/** Kept port-visit snapshots (placeholder cap protecting localStorage). */
const MAX_CHECKPOINTS = 25

/** Snapshot list from storage; migrates the legacy single-slot key. */
function readCheckpoints(): Array<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(CHECKPOINTS_KEY)
    if (raw) return JSON.parse(raw)
    const legacy = localStorage.getItem(LEGACY_CHECKPOINT_KEY)
    if (legacy) return [JSON.parse(legacy)]
  } catch {
    // Unreadable storage counts as no checkpoints.
  }
  return []
}

/** Row data for the load menu (design.md §18 table). */
export interface CheckpointMeta {
  index: number
  placeId: string
  day: number
  money: number
  foodDays: number
  gifts: number
  health: number
}

export function listCheckpoints(): CheckpointMeta[] {
  return readCheckpoints().map((snap, index) => ({
    index,
    placeId: (snap.placeId as string) ?? 'cairo',
    day: (snap.day as number) ?? 0,
    money: (snap.money as number) ?? 0,
    foodDays: (snap.foodDays as number) ?? 0,
    gifts: totalGifts((snap.gifts as Record<Material, number>) ?? { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0 }),
    health: (snap.health as number) ?? balance.health.max,
  }))
}

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

/**
 * Per region, one people knows the location hint (design.md §13.3); the
 * knowing village is picked per run from the region's villages.
 */
function pickKnowingVillages(seed: number): Record<RegionId, string> {
  const rand = mulberry32((seed ^ 0x517a7e) >>> 0)
  const out = {} as Record<RegionId, string>
  for (const region of ['north', 'west', 'central', 'east', 'south'] as RegionId[]) {
    const villages = PLACES.filter((p) => p.kind === 'village' && p.region === region)
    out[region] = villages[Math.floor(rand() * villages.length)].id
  }
  return out
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
    reentrySuppressedId: null,
    pos,
    day: 0,
    money: START_MONEY,
    foodDays: START_FOOD_DAYS,
    // Start gifts (design.md §18 table: 2) — neutral copper trinkets.
    gifts: { gold: 0, silver: 0, emerald: 0, copper: START_GIFTS, ivory: 0 } as Record<Material, number>,
    equipment: {} as Partial<Record<EquipmentId, number>>,
    treasures: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0, statue: 0 } as Record<TreasureId, number>,
    treasureSites: generateTreasureSites(seed),
    graveyardIvoryLeft: balance.economy.graveyardIvory,
    bazaarQuotes: {},
    pendingBounties: [] as Array<{ kind: 'village' | 'landmark'; id: string }>,
    landmarksSeen: [] as string[],
    valuableShown: {} as Record<string, boolean>,
    orientationGiven: {} as Record<string, boolean>,
    journal: [
      { id: 1, day: 0, title: { key: 'journal.titles.departure' }, text: { key: 'journal.start' }, kind: 'event' as const, sketch: 'harbor' as SketchId },
    ],
    journalOpen: true,
    health: balance.health.max,
    afflictions: { fever: false, dehydration: false, sunblind: false, wounds: 0 as const },
    sunblindRecovery: 0,
    dryDays: 0,
    woundHealDays: 0,
    canteenFill: 1,
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
    honoredFriend: {} as Partial<Record<RegionId, boolean>>,
    friendForfeited: {} as Partial<Record<RegionId, boolean>>,
    regionRobbed: {} as Partial<Record<RegionId, boolean>>,
    hostileUntil: {} as Record<string, number>,
    lastFriendAidDay: -9999,
    freeCamps: [] as FreeCamp[],
    villageCamps: {} as Record<string, ItemBag>,
    knowingVillages: pickKnowingVillages(seed),
    hintsGiven: {} as Partial<Record<RegionId, boolean>>,
    decodedGiven: {} as Partial<Record<RegionId, boolean>>,
    languagesLearned: {} as Partial<Record<RegionId, boolean>>,
    unspecificGiven: {} as Record<string, boolean>,
    giftLoreGiven: {} as Partial<Record<RegionId, boolean>>,
    graveLatLon: generateGrave(seed),
    victory: false,
    toast: null,
    foodWarned: false,
    foodOutWarned: false,
    penaltyJournaled: { jungle: false, water: false, mountain: false, canoeOnLand: false },
    dangerWarned: { unarmed: false, desert: false, water: false, wetland: false },
    balanceVersion: 0,
  }
}

/**
 * Nearest village whose region holds "Honored Friend" (design.md §12);
 * null when none lies within the protection radius.
 */
function nearestFriendVillage(
  lat: number,
  lon: number,
  honoredFriend: Partial<Record<RegionId, boolean>>,
): (typeof PLACES)[number] | null {
  let best: (typeof PLACES)[number] | null = null
  let bestDist = balance.reputation.friendProtectRadiusDeg
  for (const p of PLACES) {
    if (p.kind !== 'village' || !honoredFriend[p.region]) continue
    const d = Math.hypot(p.lat - lat, p.lon - lon)
    if (d <= bestDist) {
      best = p
      bestDist = d
    }
  }
  return best
}

/** Event context from the current situation (design.md §14). */
function buildEventContext(
  s: Pick<GameState, 'equipment' | 'honoredFriend'>,
  terrain: string,
  lat: number,
  lon: number,
): EventContext {
  const inWater = terrain === 'water' || terrain === 'ocean'
  const nearWaterfall = WATERFALLS.some((w) => Math.hypot(w.lat - lat, w.lon - lon) < 0.35)
  const wetland = terrain === 'jungle' || riverDistance(lat, lon, 0.2) < 0.12
  const protectedByFriends = nearestFriendVillage(lat, lon, s.honoredFriend) !== null
  return { terrain, inWater, nearWaterfall, wetland, protectedByFriends, equipment: s.equipment }
}

let nextEntryId = 2

function newSeed(): number {
  // Dev-only deterministic seed via ?seed=<n> for reproducible layout tests.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const p = new URLSearchParams(window.location.search).get('seed')
    if (p !== null && /^\d+$/.test(p)) return Number(p) >>> 0
  }
  return Math.floor(Math.random() * 0xffffffff)
}

/** Carried item count against the inventory capacity (design.md §6). */
export function usedInventory(
  s: Pick<GameState, 'equipment' | 'gifts' | 'treasures'>,
): number {
  const eq = Object.values(s.equipment).reduce((a, b) => a + (b ?? 0), 0)
  const gi = Object.values(s.gifts).reduce((a, b) => a + b, 0)
  const tr = Object.values(s.treasures).reduce((a, b) => a + b, 0)
  return eq + gi + tr
}

/** Journal title/body/toast keys for each movement-penalty type (design.md §11). */
type PenaltyToast = 'penaltyJungle' | 'penaltyWater' | 'mountainNoRopeWarn' | 'penaltyCanoeLand'
const PENALTY_JOURNAL: Record<'jungle' | 'water' | 'mountain' | 'canoeOnLand', { title: string; body: string; toast: PenaltyToast }> = {
  jungle: { title: 'journal.titles.penaltyJungle', body: 'journal.penaltyJungle', toast: 'penaltyJungle' },
  water: { title: 'journal.titles.penaltyWater', body: 'journal.penaltyWater', toast: 'penaltyWater' },
  mountain: { title: 'journal.titles.mountainClimb', body: 'journal.mountainNoRope', toast: 'mountainNoRopeWarn' },
  canoeOnLand: { title: 'journal.titles.penaltyCanoeLand', body: 'journal.penaltyCanoeLand', toast: 'penaltyCanoeLand' },
}

// First-time danger warnings (design.md §14): the first time the traveller
// meets a danger situation, the journal warns of it and how to guard against
// it. Each fires once (dangerWarned travels with the checkpoint).
type DangerKey = 'unarmed' | 'desert' | 'water' | 'wetland'
const DANGER_JOURNAL: Record<DangerKey, { title: string; body: string }> = {
  unarmed: { title: 'journal.titles.dangerUnarmed', body: 'journal.dangerUnarmed' },
  desert: { title: 'journal.titles.dangerDesert', body: 'journal.dangerDesert' },
  water: { title: 'journal.titles.dangerWater', body: 'journal.dangerWater' },
  wetland: { title: 'journal.titles.dangerWetland', body: 'journal.dangerWetland' },
}

export const useGame = create<GameState>()((set, get) => ({
  ...startState(newSeed()),
  hasCheckpoint: typeof localStorage !== 'undefined' && readCheckpoints().length > 0,

  addEntry: (title, text, kind = 'event', sketch) => {
    set((s) => ({
      // The wound level colors the writing hand and leaves blood traces on
      // the entry (design.md §16).
      journal: [...s.journal, { id: ++nextEntryId, day: Math.floor(s.day), title, text, kind, sketch, wounds: s.afflictions.wounds }],
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

    // Terrain time-cost factor depends on terrain and inventory (design.md §11):
    // the relieving items act by possession, not by being held in hand.
    const tc = balance.terrainCost
    const hasCanoe = (s.equipment.canoe ?? 0) > 0
    let cost: number
    switch (here.type) {
      case 'desert':
        cost = tc.desert
        break
      case 'jungle':
        cost = (s.equipment.machete ?? 0) > 0 ? tc.jungle : tc.jungle * balance.junglePenalty
        break
      case 'mountain':
        cost = (s.equipment.rope ?? 0) > 0 ? tc.mountain : tc.mountain * balance.mountainPenalty
        break
      case 'water':
      // Enclosed sea water (design.md §11) is swum/crossed like inland water.
      case 'ocean':
        cost = hasCanoe ? tc.water / balance.canoeSpeedup : tc.water
        break
      default: // savanna and the like
        cost = tc.savanna
    }
    // Carrying the canoe is dead weight on ANY land (design.md §11): a
    // multiplicative penalty on top of the terrain cost — desert, savanna,
    // jungle and mountain alike. Water is exempt (there the canoe speeds up).
    if (hasCanoe && here.type !== 'water' && here.type !== 'ocean') cost *= balance.canoeLandPenalty

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
    // Movement-penalty warning (design.md §11): the first time a missing item
    // slows the traveller — a machete in the jungle, a canoe in water, a rope
    // in the mountains — announce it once in the journal (with a toast); after
    // that the standing status-bar hint carries it silently.
    const penalty = movementPenalty(nextT.type, s.equipment)
    if (penalty && !s.penaltyJournaled[penalty]) {
      const j = PENALTY_JOURNAL[penalty]
      set({
        penaltyJournaled: { ...s.penaltyJournaled, [penalty]: true },
        toast: getStrings().toasts[j.toast],
      })
      get().addEntry({ key: j.title }, { key: j.body })
    }

    // First-time danger warnings (design.md §14): the first travel without a
    // rifle, the first desert, water and fever-prone jungle each warn once and
    // advise the protecting item. Kept separate from the mobility penalty above
    // (attack/health danger vs. slowdown).
    const warn = (key: DangerKey) => {
      const d = DANGER_JOURNAL[key]
      set((st) => ({ dangerWarned: { ...st.dangerWarned, [key]: true } }))
      get().addEntry({ key: d.title }, { key: d.body })
    }
    if (!s.dangerWarned.unarmed && (s.equipment.rifle ?? 0) <= 0) warn('unarmed')
    if (!s.dangerWarned.desert && nextT.type === 'desert') warn('desert')
    if (!s.dangerWarned.water && (nextT.type === 'water' || nextT.type === 'ocean')) {
      // The crocodile warning acknowledges a canoe already in the pack instead
      // of advising the traveller to use what they are already using (§14).
      if ((s.equipment.canoe ?? 0) > 0) {
        set((st) => ({ dangerWarned: { ...st.dangerWarned, water: true } }))
        get().addEntry({ key: DANGER_JOURNAL.water.title }, { key: 'journal.dangerWaterCanoe' })
      } else {
        warn('water')
      }
    }
    if (!s.dangerWarned.wetland && nextT.type === 'jungle') warn('wetland')

    const dayDelta = step * balance.daysPerUnit * cost
    const foodDelta = dayDelta * balance.foodPerDay
    const newFood = Math.max(0, s.foodDays - foodDelta)
    const newDay = s.day + dayDelta

    const patch: Partial<GameState> = { pos: { x: nx, z: nz }, day: newDay, foodDays: newFood }

    // Re-arm re-entry once the traveller has cleared the settlement just left
    // (design.md §2): they must move beyond the enter radius plus a margin.
    if (s.reentrySuppressedId) {
      const lp = latLonToWorld(placeById(s.reentrySuppressedId).lat, placeById(s.reentrySuppressedId).lon)
      if (Math.hypot(nx - lp.x, nz - lp.z) > balance.placeEnterRadius + balance.placeReentryMargin) {
        patch.reentrySuppressedId = null
      }
    }

    const newRegion = regionAt(next.lat, next.lon)
    if (newRegion !== s.region) patch.region = newRegion
    const ex = withExplored(s.explored, next.lat, next.lon)
    if (ex) patch.explored = ex
    set(patch)

    // Fall risk while climbing a mountain without a rope (design.md §7/§11):
    // a light or severe wound, and possibly the loss of a carried item. Gated
    // like the other random hazards so the deterministic suites stay stable.
    if (
      balance.randomEventsEnabled &&
      nextT.type === 'mountain' &&
      (s.equipment.rope ?? 0) <= 0 &&
      Math.random() < balance.mountainFall.chancePerDay * dayDelta
    ) {
      get().applyMountainFall()
    }

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

    // Free camps (design.md §6): a stocked camp risks being looted while
    // time passes; returning to a looted camp reveals the loss.
    if (s.freeCamps.length > 0) {
      let camps = get().freeCamps
      let changed = false
      camps = camps.map((c) => {
        if (!c.looted && bagItemCount(c.items) > 0 && Math.random() < balance.camps.lootChancePerDay * dayDelta) {
          changed = true
          return { ...c, looted: true, items: emptyBag() }
        }
        return c
      })
      const found = camps.find(
        (c) => c.looted && Math.hypot(c.lat - next.lat, c.lon - next.lon) <= balance.camps.campRadiusDeg,
      )
      if (found) {
        camps = camps.filter((c) => c.id !== found.id)
        changed = true
        get().addEntry({ key: 'journal.titles.campLooted' }, { key: 'journal.campLooted' })
      }
      if (changed) set({ freeCamps: camps })
    }

    // Discovery bounty (design.md §10): sighting a landmark registers the
    // discovery; the money is credited on the next port visit. The journal
    // announces every discovery (design.md §16), flavored by its kind.
    for (const lm of LANDMARK_POINTS) {
      if (Math.hypot(lm.lat - next.lat, lm.lon - next.lon) > balance.economy.discoverRadiusDeg) continue
      if (get().landmarksSeen.includes(lm.id)) continue
      set((st) => ({
        landmarksSeen: [...st.landmarksSeen, lm.id],
        pendingBounties: [...st.pendingBounties, { kind: 'landmark' as const, id: lm.id }],
        toast: getStrings().toasts.discovered(getStrings().landmarks[lm.id]),
      }))
      get().addEntry(
        { key: 'journal.titles.landmarkDiscovered', params: { landmark: lm.id, kind: lm.kind } },
        { key: 'journal.landmarkDiscovered', params: { landmark: lm.id, kind: lm.kind } },
      )
    }

    get().tickHealth(dayDelta, here.type, next.lat, next.lon)
    get().tickEvents(dayDelta, here.type, next.lat, next.lon)
    get().tickDeadline(newDay)
  },

  driftCurrent: (dt) => {
    const s = get()
    if (s.mode !== 'travel' || s.victory || s.defeat) return
    const ll = worldToLatLon(s.pos.x, s.pos.z)
    const ter = sampleTerrain(ll.lat, ll.lon, s.seed)
    // The current only sweeps while the traveller is on the water (design.md §11).
    if (ter.type !== 'water' && ter.type !== 'ocean') return
    const flow = riverFlow(ll.lat, ll.lon)
    if (flow.strength <= 0) return
    // Stronger near the waterfalls (design.md §11/§4.4).
    let boost = 1
    for (const wf of WATERFALLS) {
      const d = Math.hypot(ll.lat - wf.lat, ll.lon - wf.lon)
      if (d < balance.currentWaterfallRadius) {
        boost = Math.max(boost, 1 + (balance.currentWaterfallBoost - 1) * (1 - d / balance.currentWaterfallRadius))
      }
    }
    // Without a canoe the traveller is far more at the current's mercy; a canoe
    // rides it under control (design.md §11).
    const hasCanoe = (s.equipment.canoe ?? 0) > 0
    const susceptibility = hasCanoe ? 0.5 : 1.6
    const stepDeg = flow.strength * balance.currentDrift * boost * susceptibility * Math.min(dt, 0.1)
    const nlat = ll.lat + flow.dirLat * stepDeg
    const nlon = ll.lon + flow.dirLon * stepDeg
    const nt = sampleTerrain(nlat, nlon, s.seed)
    if (isBlocked(nt.type, nlat, nlon)) return // do not sweep into blocked open ocean
    const nw = latLonToWorld(nlat, nlon)
    // Being swept covers ground, so time and provisions advance too (design.md
    // §11): otherwise the current would move the traveller for free. The cost
    // matches water travel over the drifted distance.
    const driftDist = Math.hypot(nw.x - s.pos.x, nw.z - s.pos.z)
    const cost = hasCanoe ? balance.terrainCost.water / balance.canoeSpeedup : balance.terrainCost.water
    const dayDelta = driftDist * balance.daysPerUnit * cost
    const newDay = s.day + dayDelta
    set({
      pos: { x: nw.x, z: nw.z },
      day: newDay,
      foodDays: Math.max(0, s.foodDays - dayDelta * balance.foodPerDay),
    })
    // Passing time still drains/regenerates health and counts toward the
    // deadline while drifting (thirst resets since the traveller is on water).
    get().tickHealth(dayDelta, nt.type, nlat, nlon)
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
    const animal =
      o.kind === 'lionAttack' ? 'lion'
      : o.kind === 'cheetahAttack' ? 'cheetah'
      : o.kind === 'leopardAttack' ? 'leopard'
      : o.kind === 'hyenaAttack' ? 'hyena'
      : o.kind === 'snakeBite' ? 'snake'
      : 'crocodile'
    switch (o.kind) {
      case 'lionAttack':
      case 'cheetahAttack':
      case 'leopardAttack':
      case 'hyenaAttack':
      case 'snakeBite':
      case 'crocodileAttack': {
        if (o.result === 'fatal') {
          set({ health: 0, defeat: 'death', deathCause: 'eaten', journalOpen: false })
          return
        }
        if (o.result === 'light') {
          // A fresh wound restarts the natural-healing clock (design.md §6).
          set({ afflictions: { ...s.afflictions, wounds: Math.max(s.afflictions.wounds, 1) as 0 | 1 | 2 }, woundHealDays: 0 })
        } else if (o.result === 'severe') {
          set({ afflictions: { ...s.afflictions, wounds: 2 }, woundHealDays: 0 })
        }
        if (o.rescued) {
          // Natives of the friend region rushed to help (design.md §12).
          const cur = worldToLatLon(s.pos.x, s.pos.z)
          const village = nearestFriendVillage(cur.lat, cur.lon, s.honoredFriend)
          get().addEntry(
            { key: 'journal.titles.rescue' },
            { key: 'journal.friendRescue', params: { animal, people: village?.peopleId ?? '', result: o.result } },
          )
          return
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
            set({ afflictions: { ...s.afflictions, wounds: Math.max(s.afflictions.wounds, 1) as 0 | 1 | 2 }, woundHealDays: 0 })
          }
        }
        if (o.rescued) {
          const cur = worldToLatLon(s.pos.x, s.pos.z)
          const village = nearestFriendVillage(cur.lat, cur.lon, s.honoredFriend)
          get().addEntry(
            { key: 'journal.titles.rescue' },
            { key: 'journal.friendRescueRobbers', params: { people: village?.peopleId ?? '' } },
          )
          return
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
          woundHealDays: 0,
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

  applyMountainFall: () => {
    const s = get()
    const severe = Math.random() < balance.mountainFall.severeShare
    const wounds = (severe ? 2 : Math.max(s.afflictions.wounds, 1)) as 0 | 1 | 2
    // A fall may tear a carried item loose (not the shovel — the goal tool).
    const equipment = { ...s.equipment }
    let lostItem = false
    if (Math.random() < balance.mountainFall.itemLossChance) {
      const droppable = (Object.keys(equipment) as EquipmentId[]).filter(
        (e) => e !== 'shovel' && (equipment[e] ?? 0) > 0,
      )
      if (droppable.length > 0) {
        const drop = droppable[Math.floor(Math.random() * droppable.length)]
        equipment[drop] = (equipment[drop] ?? 1) - 1
        lostItem = true
      }
    }
    set({ afflictions: { ...s.afflictions, wounds }, equipment, woundHealDays: 0 })
    get().addEntry(
      { key: 'journal.titles.mountainFall' },
      { key: lostItem ? 'journal.mountainFallItem' : 'journal.mountainFall' },
    )
  },

  debugTriggerMountainFall: () => {
    if (get().defeat || get().victory) return
    get().applyMountainFall()
  },

  predatorContact: (predator) => {
    const s = get()
    // Touching a wandering predator counts as its attack (design.md §14/§19),
    // rate-limited by the shared event cooldown and suppressed with the
    // random-event system. Every predator attacks on contact, not just the lion.
    if (s.defeat || s.victory || !balance.randomEventsEnabled || s.eventCooldown > 0) return
    const kind: EventKind =
      predator === 'cheetah' ? 'cheetahAttack'
      : predator === 'leopard' ? 'leopardAttack'
      : predator === 'hyena' ? 'hyenaAttack'
      : 'lionAttack'
    const cur = worldToLatLon(s.pos.x, s.pos.z)
    const here = sampleTerrain(cur.lat, cur.lon, s.seed)
    const ctx = buildEventContext(s, here.type, cur.lat, cur.lon)
    set({ eventCooldown: balance.events.cooldownDays * (0.75 + Math.random() * 0.5) })
    get().applyEventOutcome(resolveEvent(kind, ctx, Math.random))
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
  tickHealth: (dayDelta: number, terrain: string, lat: number, lon: number) => {
    const s = get()
    if (s.defeat) return
    const hb = balance.health
    const a = { ...s.afflictions }

    // Water (§6/§11): fresh water in reach — travelling on water or along a
    // river or lake shore — counts as drinking, refilling the canteen and
    // resetting thirst. Away from it the canteen drains (slowly off the desert,
    // fast in it); once the reserve is empty, thirst builds up over sustained
    // travel before the dehydration affliction sets in, so bank flicker never
    // toggles it. Without a canteen there is no reserve, so thirst builds
    // whenever fresh water is out of reach.
    const hasCanteen = (s.equipment.canteen ?? 0) > 0
    const canDrink =
      terrain === 'water' ||
      terrain === 'ocean' ||
      riverDistance(lat, lon, 0.25) < 0.08 ||
      lakeDistance(lat, lon, 0.25) < 0.08
    let canteenFill = s.canteenFill
    let dryDays = s.dryDays
    if (canDrink) {
      canteenFill = 1
      dryDays = 0
    } else {
      if (hasCanteen) {
        const perDay = terrain === 'desert' ? hb.canteenDesertDrainPerDay : hb.canteenDrainPerDay
        const drainRate = perDay / hb.canteenCapacity // fraction of a full canteen per day
        canteenFill = Math.max(0, canteenFill - drainRate * dayDelta)
      }
      const reserve = hasCanteen ? canteenFill : 0
      dryDays = reserve <= 0 ? s.dryDays + dayDelta : 0
    }
    const dehydrated = dryDays >= hb.dehydrationOnsetDays
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

    // Natural wound healing (design.md §6): while fed, a severe wound
    // subsides to a light one and a light wound closes on its own — recovery
    // without medicine is possible, medicine stays the instant cure.
    let woundHealDays = s.woundHealDays
    if (a.wounds > 0 && s.foodDays > 0) {
      woundHealDays += dayDelta
      const stageDays = a.wounds === 2 ? hb.woundHealSevereDays : hb.woundHealLightDays
      if (woundHealDays >= stageDays) {
        woundHealDays = 0
        a.wounds = (a.wounds - 1) as 0 | 1 | 2
        get().addEntry(
          { key: 'journal.titles.recovery' },
          { key: a.wounds === 0 ? 'journal.woundHealed' : 'journal.woundEased' },
        )
      }
    } else if (a.wounds === 0) {
      woundHealDays = 0
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
    set({ health, afflictions: a, sunblindRecovery, dryDays, canteenFill, woundHealDays })
    if (!wasPoor && healthState(health) === 'poor' && health > 0) {
      get().addEntry({ key: 'journal.titles.healthPoor' }, { key: 'journal.healthPoor' })
    }

    // Close to death near a friend region's villages (design.md §12): the
    // inhabitants hurry over with food, water and medicine.
    if (health > 0 && healthState(health) === 'poor') {
      const rep = balance.reputation
      if (s.day - s.lastFriendAidDay >= rep.friendAidCooldownDays) {
        const cur = worldToLatLon(s.pos.x, s.pos.z)
        const village = nearestFriendVillage(cur.lat, cur.lon, s.honoredFriend)
        if (village) {
          set((st) => ({
            lastFriendAidDay: st.day,
            foodDays: Math.max(st.foodDays, 7),
            afflictions: { ...st.afflictions, fever: false, wounds: 0 },
          }))
          get().addEntry(
            { key: 'journal.titles.rescue' },
            { key: 'journal.friendAid', params: { people: village.peopleId ?? village.id } },
          )
          return
        }
      }
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
      // Every current place already sits in its declared region (place.region
      // === regionAt); this stays authoritative if a future place is off-band.
      region: place.region,
      visitedPlaces: first ? [...s.visitedPlaces, id] : s.visitedPlaces,
      // A first-visited village is itself a bounty-worthy discovery (§10).
      pendingBounties:
        first && place.kind === 'village'
          ? [...s.pendingBounties, { kind: 'village' as const, id }]
          : s.pendingBounties,
      // Fresh port, fresh bazaar quotes (design.md §10).
      bazaarQuotes: {},
      toast: null,
    })
    if (place.kind === 'port') {
      // Discovery bounties are paid out on reaching a port (design.md §10).
      const pending = get().pendingBounties
      if (pending.length > 0) {
        const e = balance.economy
        const amount = pending.reduce(
          (sum, b) => sum + (b.kind === 'village' ? e.bountyVillage : e.bountyLandmark),
          0,
        )
        // Pass the discovered ids (comma-joined, by kind) so the journal can
        // name exactly which discoveries earned the transfer (design.md §10).
        const villages = pending.filter((b) => b.kind === 'village').map((b) => b.id).join(',')
        const landmarks = pending.filter((b) => b.kind === 'landmark').map((b) => b.id).join(',')
        set((st) => ({ money: st.money + amount, pendingBounties: [] }))
        get().addEntry(
          { key: 'journal.titles.bounty' },
          { key: 'journal.bounty', params: { amount, count: pending.length, villages, landmarks } },
        )
      }
      get().saveCheckpoint()
      get().addEntry(
        { key: 'journal.titles.arrival', params: { place: id } },
        { key: 'journal.portArrival', params: { place: id } },
        'event',
        'harbor',
      )
    } else if (first) {
      // The first visit reads like the place (design.md §16): the entry is
      // people-specific, drawn from the village's ~1890 way of life.
      get().addEntry(
        { key: 'journal.titles.village', params: { place: id } },
        { key: 'journal.villageFirstVisit', params: { place: id, people: place.peopleId ?? '' } },
        'event',
        'hut',
      )
    }
    // Honored Friend (design.md §12): food, water and medicine free of
    // charge in every village of the region — granted when needed.
    if (place.kind === 'village' && s.honoredFriend[place.region]) {
      const rep = balance.reputation
      const st = get()
      const needsFood = st.foodDays < rep.friendVillageFoodDays
      const needsMedicine = (st.equipment.medicine ?? 0) === 0 && usedInventory(st) < balance.inventoryCapacity
      if (needsFood || needsMedicine) {
        set({
          foodDays: Math.max(st.foodDays, rep.friendVillageFoodDays),
          equipment: needsMedicine ? { ...st.equipment, medicine: 1 } : st.equipment,
        })
        get().addEntry(
          { key: 'journal.titles.friendSupplies' },
          { key: 'journal.friendSupplies', params: { people: place.peopleId ?? id } },
        )
      }
    }
  },

  /** Present a carried valuable to the villagers (design.md §8): once per
   *  village, a revered material creates goodwill, a rejected one costs it. */
  presentValuable: (treasure) => {
    const s = get()
    const place = s.placeId ? placeById(s.placeId) : null
    if (!place || place.kind !== 'village') return
    if ((s.treasures[treasure] ?? 0) <= 0) return
    const id = place.id
    if (s.valuableShown[id]) {
      set({ toast: getStrings().toasts.valuableAlreadyShown })
      return
    }
    const values = REGION_VALUES[place.region]
    const material = treasure === 'statue' ? null : treasure
    set((st) => ({ valuableShown: { ...st.valuableShown, [id]: true } }))
    if (material && values.rejected.includes(material)) {
      set((st) => ({ goodwill: { ...st.goodwill, [id]: Math.max(0, (st.goodwill[id] ?? 0) - 2) } }))
      get().addEntry(
        { key: 'journal.titles.valuableReaction' },
        { key: 'journal.valuableRejected', params: { people: place.peopleId ?? id, treasure } },
      )
    } else if (!material || values.revered.includes(material)) {
      set((st) => ({ goodwill: { ...st.goodwill, [id]: (st.goodwill[id] ?? 0) + 1 } }))
      get().addEntry(
        { key: 'journal.titles.valuableReaction' },
        { key: 'journal.valuableRevered', params: { people: place.peopleId ?? id, treasure } },
      )
    }
  },

  leavePlace: () => {
    const s = get()
    if (!s.placeId) return
    const place = placeById(s.placeId)
    const p = latLonToWorld(place.lat, place.lon)
    // Exit just past the enter radius so the enter prompt does not retrigger;
    // the exit point must stay inside the re-entry clearance
    // (placeEnterRadius + placeReentryMargin), or the debounce would re-arm
    // immediately. Bazaar quotes are per-port, so they expire on leaving
    // (design.md §10). Suppress re-entry until the traveller clears the
    // settlement, so walking straight back does not re-enter it (design.md §2).
    set({
      mode: 'travel',
      placeId: null,
      reentrySuppressedId: s.placeId,
      pos: { x: p.x, z: p.z + balance.placeEnterRadius + 0.5 },
      bazaarQuotes: {},
    })
  },

  buy: (good) => {
    const s = get()
    const place = s.placeId ? placeById(s.placeId) : null
    // Native villages trade in gifts, ports in money (design.md §9/§10).
    if (place?.kind === 'village') {
      const g = good as EquipmentId | 'food'
      const price = giftPriceOfGood(g)
      if (totalGifts(s.gifts) < price) {
        set({ toast: getStrings().toasts.notEnoughGifts })
        return
      }
      if (g !== 'food' && usedInventory(s) >= balance.inventoryCapacity) {
        set({ toast: getStrings().toasts.inventoryFull })
        return
      }
      const gifts = spendGifts(s.gifts, price)
      if (g === 'food') {
        set({ gifts, foodDays: s.foodDays + balance.foodUnitDays, toast: getStrings().toasts.boughtFood })
      } else {
        set({
          gifts,
          equipment: { ...s.equipment, [g]: (s.equipment[g] ?? 0) + 1 },
          toast: getStrings().toasts.bought(getStrings().equipment[g]),
        })
      }
      return
    }
    const price = priceOfGood(good)
    if (price === undefined || s.money < price) {
      set({ toast: getStrings().toasts.notEnoughMoney })
      return
    }
    // Inventory capacity (design.md §6): provisions travel outside the pack.
    if (good !== 'food' && usedInventory(s) >= balance.inventoryCapacity) {
      set({ toast: getStrings().toasts.inventoryFull })
      return
    }
    if (good === 'food') {
      set({ money: s.money - price, foodDays: s.foodDays + balance.foodUnitDays, toast: getStrings().toasts.boughtFood })
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

  sellItem: (id) => {
    const s = get()
    const place = s.placeId ? placeById(s.placeId) : null
    if (!place || (s.equipment[id] ?? 0) <= 0) return
    const nextCount = (s.equipment[id] ?? 0) - 1
    const equipment = { ...s.equipment, [id]: nextCount }
    if (place.kind === 'village') {
      // Villages pay in gifts of the material they value (design.md §9).
      const mat = REGION_VALUES[place.region].revered[0]
      const count = balance.village.sellGifts
      set({
        equipment,
        gifts: { ...s.gifts, [mat]: s.gifts[mat] + count },
        toast: getStrings().toasts.soldForGifts(getStrings().equipment[id], count),
      })
    } else {
      const amount = Math.max(1, Math.floor(priceOfGood(id) * balance.economy.equipmentSellFactor))
      set({
        equipment,
        money: s.money + amount,
        toast: getStrings().toasts.sold(getStrings().equipment[id], amount),
      })
    }
  },

  offerTreasure: (treasure) => {
    const s = get()
    if (!s.placeId || s.treasures[treasure] <= 0) return
    const region = placeById(s.placeId).region
    // Re-offering the same treasure at this port shows the standing quote, not
    // a freshly rolled one (design.md §10). The quote is cleared on leaving.
    const cached = s.bazaarQuotes[treasure]
    if (cached !== undefined) {
      useUi.getState().setBazaarBid({ treasure, amount: cached })
      return
    }
    const bid = treasureBid(treasure, region, Math.random)
    if (bid === null) {
      // Does not fit the regional value profile — refused (design.md §10).
      useUi.getState().setBazaarBid(null)
      set({ toast: getStrings().toasts.bazaarRejected(getStrings().treasures[treasure]) })
      return
    }
    set({ bazaarQuotes: { ...s.bazaarQuotes, [treasure]: bid } })
    useUi.getState().setBazaarBid({ treasure, amount: bid })
  },

  acceptBid: () => {
    const s = get()
    const bid = useUi.getState().bazaarBid
    if (!bid || s.treasures[bid.treasure] <= 0) return
    useUi.getState().setBazaarBid(null)
    set({
      money: s.money + bid.amount,
      treasures: { ...s.treasures, [bid.treasure]: s.treasures[bid.treasure] - 1 },
      toast: getStrings().toasts.sold(getStrings().treasures[bid.treasure], bid.amount),
    })
  },

  declineBid: () => useUi.getState().setBazaarBid(null),

  buyTreasure: (treasure) => {
    const s = get()
    if (!s.placeId) return
    const price = treasureBuyPrice(treasure, placeById(s.placeId).region)
    if (price === null) return
    if (s.money < price) {
      set({ toast: getStrings().toasts.notEnoughMoney })
      return
    }
    if (usedInventory(s) >= balance.inventoryCapacity) {
      set({ toast: getStrings().toasts.inventoryFull })
      return
    }
    set({
      money: s.money - price,
      treasures: { ...s.treasures, [treasure]: s.treasures[treasure] + 1 },
      toast: getStrings().toasts.bought(getStrings().treasures[treasure]),
    })
  },

  bookFerry: (destId) => {
    const s = get()
    if (!s.placeId || s.defeat || s.victory) return
    const from = placeById(s.placeId)
    const dest = placeById(destId)
    if (from.kind !== 'port' || dest.kind !== 'port' || from.id === dest.id) return
    const cost = ferryCost(from, dest)
    if (s.money < cost) {
      set({ toast: getStrings().toasts.notEnoughMoney })
      return
    }
    const days = ferryDays(from, dest)
    const p = latLonToWorld(dest.lat, dest.lon)
    // Passage fare includes board; provisions are not consumed (placeholder).
    set({ money: s.money - cost, day: s.day + days, pos: p })
    useUi.getState().setDialog(null)
    get().addEntry(
      { key: 'journal.titles.ferry' },
      { key: 'journal.ferry', params: { from: from.id, to: dest.id, days } },
      'event',
      'harbor',
    )
    get().enterPlace(dest.id)
    get().tickDeadline(get().day)
  },

  giveGift: (material) => {
    const s = get()
    if (!s.placeId) return
    const place = placeById(s.placeId)
    if (place.kind !== 'village' || s.gifts[material] <= 0) return
    // Standing guards (design.md §12): a robbed region shuns the traveler,
    // hostility must wear off.
    if (s.regionRobbed[place.region]) {
      set({ toast: getStrings().toasts.regionShunned })
      return
    }
    if ((s.hostileUntil[place.id] ?? 0) > s.day) {
      set({ toast: getStrings().toasts.chiefHostile })
      return
    }
    const values = REGION_VALUES[place.region]
    const gifts = { ...s.gifts, [material]: s.gifts[material] - 1 }
    const gw = s.goodwill[place.id] ?? 0

    if (values.rejected.includes(material)) {
      // Wrong behavior: hostility and expulsion (design.md §12).
      set({
        gifts,
        goodwill: { ...s.goodwill, [place.id]: 0 },
        hostileUntil: { ...s.hostileUntil, [place.id]: s.day + balance.reputation.hostilityDays },
      })
      get().addEntry({ key: 'journal.titles.mistake' }, { key: 'journal.giftRejected', params: { people: place.peopleId ?? place.id } })
      get().leavePlace()
      return
    }

    const revered = values.revered.includes(material)
    const gain = revered ? balance.goodwillRevered : balance.goodwillNeutral
    const newGw = gw + gain
    const reveredGiven = { ...s.reveredGiftGiven, [place.id]: (s.reveredGiftGiven[place.id] ?? false) || revered }
    set({ gifts, goodwill: { ...s.goodwill, [place.id]: newGw }, reveredGiftGiven: reveredGiven })

    // A gift to a native provides orientation over the settlement (§17):
    // from now on the enterable buildings are highlighted here.
    if (!s.orientationGiven[place.id]) {
      set({
        orientationGiven: { ...get().orientationGiven, [place.id]: true },
        toast: getStrings().toasts.orientationGained,
      })
    }

    // Repeated correct satisfaction bestows "Honored Friend" for the whole
    // region (design.md §12) — unless it was forfeited by a robbery.
    if (
      revered &&
      newGw >= balance.reputation.goodwillForFriend &&
      !s.honoredFriend[place.region] &&
      !s.friendForfeited[place.region]
    ) {
      set({ honoredFriend: { ...get().honoredFriend, [place.region]: true } })
      get().addEntry(
        { key: 'journal.titles.friend' },
        { key: 'journal.friendPledge', params: { people: place.peopleId ?? place.id, region: place.region } },
        'event',
        'face',
      )
    }

    if (revered) {
      get().addEntry({ key: 'journal.titles.audience' }, { key: 'journal.giftRevered', params: { people: place.peopleId ?? place.id } })
    } else {
      get().addEntry({ key: 'journal.titles.audience' }, { key: 'journal.giftNeutral' })
    }

    // The culturally correct (revered) gift is the hard condition for the
    // hint (CLAUDE.md §7.1.6), plus sufficient goodwill. Per region only the
    // knowing people reveals the location component; the other chiefs offer
    // unspecific knowledge and point to the knowing people (§13.3).
    if (reveredGiven[place.id] && newGw >= balance.goodwillForHint) {
      const region = place.region
      if (s.knowingVillages[region] === place.id) {
        if (!s.hintsGiven[region]) {
          set({ hintsGiven: { ...get().hintsGiven, [region]: true } })
          const g = get().graveLatLon
          get().addEntry(
            { key: 'journal.titles.chiefHint' },
            { key: 'journal.hintRaw', params: { region, lat: g.lat, lon: g.lon } },
            'hint',
            'compass',
          )
          get().revealDecoded(region)
        }
      } else if (!s.unspecificGiven[place.id]) {
        set({ unspecificGiven: { ...get().unspecificGiven, [place.id]: true } })
        const knowing = placeById(get().knowingVillages[region])
        const word = UNSPECIFIC_WORDS[(place.id.length + region.length) % UNSPECIFIC_WORDS.length]
        get().addEntry(
          { key: 'journal.titles.unspecific' },
          { key: 'journal.unspecific', params: { people: knowing.peopleId ?? knowing.id, word } },
          'hint',
        )
      }
    }
  },

  revealDecoded: (region) => {
    const s = get()
    if (s.decodedGiven[region] || !s.hintsGiven[region] || !s.languagesLearned[region]) return
    set({ decodedGiven: { ...s.decodedGiven, [region]: true } })
    const g = s.graveLatLon
    get().addEntry(
      { key: 'journal.titles.decoded' },
      { key: 'journal.hintDecoded', params: { region, lat: g.lat, lon: g.lon } },
      'hint',
      'compass',
    )
  },

  talkToVillager: () => {
    const s = get()
    if (!s.placeId) return
    const region = placeById(s.placeId).region
    // A robbed region shuns the traveler entirely (design.md §12).
    if (s.regionRobbed[region]) {
      set({ toast: getStrings().toasts.regionShunned })
      return
    }
    // First talk: the elder teaches the region's direction system (§13.2);
    // a second talk reveals what the region reveres (§8).
    if (!s.languagesLearned[region]) {
      set({ languagesLearned: { ...s.languagesLearned, [region]: true } })
      get().addEntry(
        { key: 'journal.titles.language', params: { region } },
        { key: 'journal.languageLesson', params: { region } },
        'hint',
        'face',
      )
      get().revealDecoded(region)
      return
    }
    if (!s.giftLoreGiven[region]) {
      set({ giftLoreGiven: { ...s.giftLoreGiven, [region]: true } })
      get().addEntry(
        { key: 'journal.titles.giftLore' },
        { key: 'journal.giftLore', params: { gift: REGION_VALUES[region].revered[0], region } },
      )
      return
    }
    set({ toast: getStrings().toasts.villagerNod })
  },

  robVillage: () => {
    const s = get()
    if (!s.placeId || s.defeat || s.victory) return
    const place = placeById(s.placeId)
    if (place.kind !== 'village' || (s.equipment.rifle ?? 0) <= 0) return
    const region = place.region
    const rep = balance.reputation
    // Loot at rifle point (design.md §12): a rich haul — cash, gifts as far as
    // the pack holds, and provisions — so the robbery can pay off despite the
    // permanent regional fallout.
    const space = Math.max(0, balance.inventoryCapacity - usedInventory(s))
    const lootMaterial = REGION_VALUES[region].revered[0]
    const lootGifts = Math.min(rep.robberyGifts, space)
    const lootMoney = rep.robberyMoney
    const lootFood = rep.robberyFoodDays
    set({
      money: s.money + lootMoney,
      gifts: { ...s.gifts, [lootMaterial]: s.gifts[lootMaterial] + lootGifts },
      foodDays: s.foodDays + lootFood,
      // The whole region is antagonized for good: no huts, no hints, and
      // the "Honored Friend" standing is forfeited irretrievably.
      regionRobbed: { ...s.regionRobbed, [region]: true },
      honoredFriend: { ...s.honoredFriend, [region]: false },
      friendForfeited: { ...s.friendForfeited, [region]: true },
    })
    // Village caches of the region are irretrievably lost (design.md §6).
    const villageCamps = { ...s.villageCamps }
    for (const p of PLACES) {
      if (p.kind === 'village' && p.region === region) delete villageCamps[p.id]
    }
    set({ villageCamps })
    useUi.getState().setDialog(null)
    // Report the haul so the player learns what the robbery yielded (design.md §12).
    get().addEntry(
      { key: 'journal.titles.robberyCommitted' },
      {
        key: 'journal.robberyCommitted',
        params: { people: place.peopleId ?? place.id, region, money: lootMoney, gifts: lootGifts, food: Math.round(lootFood) },
      },
    )
    get().leavePlace()
  },

  pitchOrOpenCamp: () => {
    const s = get()
    if (s.mode !== 'travel' || s.defeat || s.victory) return
    const cur = worldToLatLon(s.pos.x, s.pos.z)
    const near = s.freeCamps.find(
      (c) => !c.looted && Math.hypot(c.lat - cur.lat, c.lon - cur.lon) <= balance.camps.campRadiusDeg,
    )
    if (near) {
      useUi.getState().setDialog({ kind: 'camp', scope: 'free', campId: near.id })
      return
    }
    const id = s.freeCamps.reduce((m, c) => Math.max(m, c.id), 0) + 1
    set({
      freeCamps: [...s.freeCamps, { id, lat: cur.lat, lon: cur.lon, items: emptyBag(), looted: false }],
      toast: getStrings().toasts.campPitched,
    })
    useUi.getState().setDialog({ kind: 'camp', scope: 'free', campId: id })
  },

  openVillageCamp: () => {
    const s = get()
    if (s.mode !== 'place' || !s.placeId) return
    const place = placeById(s.placeId)
    if (place.kind !== 'village') return
    if (s.regionRobbed[place.region]) {
      set({ toast: getStrings().toasts.regionShunned })
      return
    }
    // The safe village cache is a privilege of the Honored Friend (§6/§12).
    if (!s.honoredFriend[place.region]) {
      set({ toast: getStrings().toasts.campNeedsFriend })
      return
    }
    useUi.getState().setDialog({ kind: 'camp', scope: 'village', placeId: place.id })
  },

  campStore: (kind, id) => {
    const s = get()
    const dialog = useUi.getState().dialog
    if (!dialog || dialog.kind !== 'camp') return
    const bag = campBagOf(s, dialog)
    if (!bag) return
    // Deduct one item from the pack into the camp cache.
    if (kind === 'equipment') {
      const e = id as EquipmentId
      if ((s.equipment[e] ?? 0) <= 0) return
      set({ equipment: { ...s.equipment, [e]: (s.equipment[e] ?? 0) - 1 } })
    } else if (kind === 'gift') {
      const m = id as Material
      if (s.gifts[m] <= 0) return
      set({ gifts: { ...s.gifts, [m]: s.gifts[m] - 1 } })
    } else {
      const t = id as TreasureId
      if (s.treasures[t] <= 0) return
      set({ treasures: { ...s.treasures, [t]: s.treasures[t] - 1 } })
    }
    writeCampBag(get, set, dialog, addToBag(bag, kind, id, 1))
  },

  campTake: (kind, id) => {
    const s = get()
    const dialog = useUi.getState().dialog
    if (!dialog || dialog.kind !== 'camp') return
    const bag = campBagOf(s, dialog)
    if (!bag || bagCount(bag, kind, id) <= 0) return
    if (usedInventory(s) >= balance.inventoryCapacity) {
      set({ toast: getStrings().toasts.inventoryFull })
      return
    }
    if (kind === 'equipment') {
      const e = id as EquipmentId
      set({ equipment: { ...s.equipment, [e]: (s.equipment[e] ?? 0) + 1 } })
    } else if (kind === 'gift') {
      const m = id as Material
      set({ gifts: { ...s.gifts, [m]: s.gifts[m] + 1 } })
    } else {
      const t = id as TreasureId
      set({ treasures: { ...s.treasures, [t]: s.treasures[t] + 1 } })
    }
    writeCampBag(get, set, dialog, addToBag(bag, kind, id, -1))
  },

  dig: () => {
    const s = get()
    if (s.mode !== 'travel' || s.victory) return
    if ((s.equipment.shovel ?? 0) <= 0) {
      set({ toast: getStrings().toasts.digNoShovel })
      return
    }
    const g = latLonToWorld(s.graveLatLon.lat, s.graveLatLon.lon)
    const d = Math.hypot(s.pos.x - g.x, s.pos.z - g.z)
    if (d <= balance.digRadius) {
      set({ victory: true })
      get().addEntry({ key: 'journal.titles.victory' }, { key: 'journal.victory', params: { day: s.day } }, 'event', 'grave')
      return
    }
    const cur = worldToLatLon(s.pos.x, s.pos.z)
    const digDeg = balance.digRadius / 10 // world units → degrees

    // Ivory at the elephant graveyard (design.md §4.4), a limited supply. Each
    // dig frees a random haul (uniform min..max, averaging ~5), capped by what
    // remains in the ground and by the free inventory space.
    if (Math.hypot(cur.lat - ELEPHANT_GRAVEYARD.lat, cur.lon - ELEPHANT_GRAVEYARD.lon) <= digDeg) {
      if (s.graveyardIvoryLeft <= 0) {
        set({ toast: getStrings().toasts.graveyardEmpty })
        return
      }
      const space = balance.inventoryCapacity - usedInventory(s)
      if (space <= 0) {
        set({ toast: getStrings().toasts.inventoryFull })
        return
      }
      const dig = balance.economy.graveyardIvoryPerDig
      const rolled = dig.min + Math.floor(Math.random() * (dig.max - dig.min + 1))
      const count = Math.max(1, Math.min(rolled, s.graveyardIvoryLeft, space))
      set({
        graveyardIvoryLeft: s.graveyardIvoryLeft - count,
        treasures: { ...s.treasures, ivory: s.treasures.ivory + count },
      })
      get().addEntry({ key: 'journal.titles.treasure', params: {} }, { key: 'journal.ivoryFound', params: { count } }, 'event')
      return
    }

    // Buried treasure caches (design.md §8/§18).
    const siteIndex = s.treasureSites.findIndex(
      (site) => !site.dug && Math.hypot(cur.lat - site.lat, cur.lon - site.lon) <= digDeg,
    )
    if (siteIndex >= 0) {
      const site = s.treasureSites[siteIndex]
      if (usedInventory(s) >= balance.inventoryCapacity) {
        set({ toast: getStrings().toasts.inventoryFull })
        return
      }
      set({
        treasureSites: s.treasureSites.map((x, i) => (i === siteIndex ? { ...x, dug: true } : x)),
        treasures: { ...s.treasures, [site.treasure]: s.treasures[site.treasure] + 1 },
      })
      get().addEntry(
        { key: 'journal.titles.treasure', params: { treasure: site.treasure } },
        { key: 'journal.treasureFound', params: { treasure: site.treasure } },
        'event',
      )
      return
    }

    // Journal texts carry voice markup; strip it for the plain toast.
    set({ toast: stripVoiceMarkup(getStrings().journal.digNothing) })
  },

  saveCheckpoint: () => {
    const s = get()
    const snapshot = {
      seed: s.seed, placeId: s.placeId, pos: s.pos, day: s.day, money: s.money,
      foodDays: s.foodDays, gifts: s.gifts, equipment: s.equipment,
      journal: s.journal, region: s.region, visitedRegions: s.visitedRegions,
      health: s.health, afflictions: s.afflictions, sunblindRecovery: s.sunblindRecovery,
      dryDays: s.dryDays, canteenFill: s.canteenFill, woundHealDays: s.woundHealDays,
      visitedPlaces: s.visitedPlaces, goodwill: s.goodwill, reveredGiftGiven: s.reveredGiftGiven,
      knowingVillages: s.knowingVillages, hintsGiven: s.hintsGiven, decodedGiven: s.decodedGiven,
      languagesLearned: s.languagesLearned, unspecificGiven: s.unspecificGiven, giftLoreGiven: s.giftLoreGiven,
      graveLatLon: s.graveLatLon, foodWarned: s.foodWarned, foodOutWarned: s.foodOutWarned,
      penaltyJournaled: s.penaltyJournaled,
      dangerWarned: s.dangerWarned,
      deadlineWarned: s.deadlineWarned,
      explored: s.explored,
      treasures: s.treasures, treasureSites: s.treasureSites, graveyardIvoryLeft: s.graveyardIvoryLeft,
      pendingBounties: s.pendingBounties, landmarksSeen: s.landmarksSeen, valuableShown: s.valuableShown,
      orientationGiven: s.orientationGiven,
      honoredFriend: s.honoredFriend, friendForfeited: s.friendForfeited, regionRobbed: s.regionRobbed,
      hostileUntil: s.hostileUntil, lastFriendAidDay: s.lastFriendAidDay,
      freeCamps: s.freeCamps, villageCamps: s.villageCamps,
      nextEntryId,
    }
    try {
      // One snapshot per port visit (design.md §18); the oldest fall away
      // once the placeholder cap is reached.
      const snaps = readCheckpoints()
      snaps.push(snapshot)
      if (snaps.length > MAX_CHECKPOINTS) snaps.splice(0, snaps.length - MAX_CHECKPOINTS)
      localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(snaps))
      set({ hasCheckpoint: true })
    } catch {
      // Storage unavailable (e.g. private mode) — checkpoint silently skipped.
    }
  },

  loadCheckpoint: (index?: number) => {
    try {
      const snaps = readCheckpoints()
      if (snaps.length === 0) return false
      // Without an index the latest snapshot loads (successor, design.md §18).
      const snap = snaps[index ?? snaps.length - 1] as Partial<GameState> & { nextEntryId?: number }
      if (!snap) return false
      nextEntryId = snap.nextEntryId ?? 1000
      set({
        ...snap,
        explored: snap.explored ?? {},
        health: snap.health ?? balance.health.max,
        penaltyJournaled: snap.penaltyJournaled ?? { jungle: false, water: false, mountain: false, canoeOnLand: false },
        dangerWarned: snap.dangerWarned ?? { unarmed: false, desert: false, water: false, wetland: false },
        deadlineWarned: snap.deadlineWarned ?? 0,
        knowingVillages: snap.knowingVillages ?? pickKnowingVillages(snap.seed ?? 0),
        hintsGiven: snap.hintsGiven ?? {},
        decodedGiven: snap.decodedGiven ?? {},
        languagesLearned: snap.languagesLearned ?? {},
        unspecificGiven: snap.unspecificGiven ?? {},
        giftLoreGiven: snap.giftLoreGiven ?? {},
        afflictions: snap.afflictions ?? { fever: false, dehydration: false, sunblind: false, wounds: 0 },
        sunblindRecovery: snap.sunblindRecovery ?? 0,
        dryDays: snap.dryDays ?? 0,
        woundHealDays: (snap as { woundHealDays?: number }).woundHealDays ?? 0,
        canteenFill: snap.canteenFill ?? 1,
        treasures: snap.treasures ?? { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0, statue: 0 },
        treasureSites: snap.treasureSites ?? generateTreasureSites(snap.seed ?? 0),
        graveyardIvoryLeft: snap.graveyardIvoryLeft ?? balance.economy.graveyardIvory,
        pendingBounties: snap.pendingBounties ?? [],
        landmarksSeen: snap.landmarksSeen ?? [],
        valuableShown: snap.valuableShown ?? {},
        orientationGiven: snap.orientationGiven ?? {},
        honoredFriend: snap.honoredFriend ?? {},
        friendForfeited: snap.friendForfeited ?? {},
        regionRobbed: snap.regionRobbed ?? {},
        hostileUntil: snap.hostileUntil ?? {},
        lastFriendAidDay: snap.lastFriendAidDay ?? -9999,
        freeCamps: snap.freeCamps ?? [],
        villageCamps: snap.villageCamps ?? {},
        defeat: null,
        deathCause: null,
        mode: 'place',
        victory: false,
        toast: null,
        journalOpen: false,
        reentrySuppressedId: null,
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

  debugAddGift: (material) => {
    raiseCapacityIfNeeded(get())
    set((s) => ({ gifts: { ...s.gifts, [material]: s.gifts[material] + 1 } }))
  },

  debugAddEquipment: (item) => {
    raiseCapacityIfNeeded(get())
    set((s) => ({ equipment: { ...s.equipment, [item]: (s.equipment[item] ?? 0) + 1 } }))
  },

  debugAddTreasure: (treasure) => {
    raiseCapacityIfNeeded(get())
    set((s) => ({ treasures: { ...s.treasures, [treasure]: s.treasures[treasure] + 1 } }))
  },

  debugFullLoadout: () => {
    const s = get()
    // All equipment and treasures, gifts and provisions to 100000, full
    // health and no afflictions (design.md §21, F3).
    const equipment: Partial<Record<EquipmentId, number>> = {}
    for (const e of EQUIPMENT_IDS) equipment[e] = 1
    const per = 20000
    const gifts: Record<Material, number> = { gold: per, silver: per, emerald: per, copper: per, ivory: per }
    const treasures = { ...s.treasures }
    for (const tr of TREASURE_IDS) treasures[tr] = Math.max(1, treasures[tr] ?? 0)
    const used = usedInventory({ equipment, gifts, treasures })
    if (balance.inventoryCapacity < used) balance.inventoryCapacity = used
    set({
      money: 100000,
      foodDays: 100000,
      health: balance.health.max,
      afflictions: { fever: false, dehydration: false, sunblind: false, wounds: 0 },
      sunblindRecovery: 0,
      dryDays: 0,
      woundHealDays: 0,
      canteenFill: 1, // F3 also tops up the canteen (design.md §21)
      equipment,
      gifts,
      treasures,
      toast: getStrings().toasts.debugLoadout,
    })
    get().bumpBalance()
  },

  debugToggleCanoe: () => {
    const s = get()
    if ((s.equipment.canoe ?? 0) > 0) {
      set({
        equipment: { ...s.equipment, canoe: 0 },
        toast: getStrings().toasts.debugCanoeOff,
      })
    } else {
      raiseCapacityIfNeeded(s)
      set({ equipment: { ...s.equipment, canoe: 1 }, toast: getStrings().toasts.debugCanoeOn })
    }
  },

  debugSetGiftTotal: (total) => {
    const s = get()
    const target = Math.max(0, Math.round(total))
    let diff = target - totalGifts(s.gifts)
    const gifts = { ...s.gifts }
    // Top up with neutral copper trinkets; drain from any stocked material.
    if (diff > 0) {
      gifts.copper += diff
    } else {
      for (const m of Object.keys(gifts) as Material[]) {
        const take = Math.min(gifts[m], -diff)
        gifts[m] -= take
        diff += take
        if (diff >= 0) break
      }
    }
    set({ gifts })
  },

  debugJumpTo: (lat, lon) => {
    const p = latLonToWorld(lat, lon)
    const ex = withExplored(get().explored, lat, lon)
    set({ mode: 'travel', placeId: null, pos: p, region: regionAt(lat, lon), ...(ex ? { explored: ex } : {}) })
  },
}))

/** Price lookup against the central config (config/balance.ts). */
/** Baseline goods every settlement offers for sale (design.md §9). */
export const VILLAGE_TRADE_GOODS: Array<EquipmentId | 'food'> = [
  'food', 'medicine', 'machete', 'shovel', 'rope', 'canteen',
]

/** Gift-currency price of a good in a native village (design.md §9/§10). */
export function giftPriceOfGood(good: EquipmentId | 'food'): number {
  return balance.village.giftPrices[good] ?? 1
}

/** Spend a number of gifts, cheapest material first, returning the new bag. */
function spendGifts(gifts: Record<Material, number>, n: number): Record<Material, number> {
  const order: Material[] = ['copper', 'silver', 'ivory', 'emerald', 'gold']
  const next = { ...gifts }
  let left = n
  for (const m of order) {
    const take = Math.min(next[m] ?? 0, left)
    next[m] -= take
    left -= take
    if (left <= 0) break
  }
  return next
}

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

// --- Camp cache helpers (design.md §6) --------------------------------------

type CampDialogRef =
  | { kind: 'camp'; scope: 'free'; campId: number }
  | { kind: 'camp'; scope: 'village'; placeId: string }

function campBagOf(
  s: Pick<GameState, 'freeCamps' | 'villageCamps'>,
  dialog: CampDialogRef,
): ItemBag | null {
  if (dialog.scope === 'free') return s.freeCamps.find((c) => c.id === dialog.campId)?.items ?? null
  return s.villageCamps[dialog.placeId] ?? emptyBag()
}

function bagCount(bag: ItemBag, kind: ItemKind, id: string): number {
  if (kind === 'equipment') return bag.equipment[id as EquipmentId] ?? 0
  if (kind === 'gift') return bag.gifts[id as Material] ?? 0
  return bag.treasures[id as TreasureId] ?? 0
}

function addToBag(bag: ItemBag, kind: ItemKind, id: string, delta: number): ItemBag {
  const next: ItemBag = { equipment: { ...bag.equipment }, gifts: { ...bag.gifts }, treasures: { ...bag.treasures } }
  if (kind === 'equipment') {
    const e = id as EquipmentId
    next.equipment[e] = Math.max(0, (next.equipment[e] ?? 0) + delta)
  } else if (kind === 'gift') {
    const m = id as Material
    next.gifts[m] = Math.max(0, (next.gifts[m] ?? 0) + delta)
  } else {
    const t = id as TreasureId
    next.treasures[t] = Math.max(0, (next.treasures[t] ?? 0) + delta)
  }
  return next
}

function writeCampBag(
  get: () => GameState,
  set: (p: Partial<GameState>) => void,
  dialog: CampDialogRef,
  bag: ItemBag,
): void {
  if (dialog.scope === 'free') {
    set({ freeCamps: get().freeCamps.map((c) => (c.id === dialog.campId ? { ...c, items: bag } : c)) })
  } else {
    set({ villageCamps: { ...get().villageCamps, [dialog.placeId]: bag } })
  }
}

/**
 * Debug adds bypass the capacity; if the pack would overfill, the capacity
 * grows automatically to match (design.md §21).
 */
function raiseCapacityIfNeeded(s: Pick<GameState, 'equipment' | 'gifts' | 'treasures'>): void {
  const used = usedInventory(s)
  if (used >= balance.inventoryCapacity) {
    balance.inventoryCapacity = used + 1
    useGame.getState().bumpBalance()
  }
}
