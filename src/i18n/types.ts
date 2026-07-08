// Contract for the game's language files (design.md §17: English default,
// German, easily extensible). Every player-visible string lives here; both
// dictionaries must implement this interface, so adding or changing a text
// in only one language fails the build.

import type { DeathCause, EquipmentId } from '../state/store'
import type { TreasureId } from '../systems/economy'
import type { Material, RegionId } from '../world/geo'
import type { BuildingType } from '../state/ui'
import type { SketchId } from '../journal/sketches'

/** Params for journal text templates (values are ids or numbers). */
export type TextParams = Record<string, string | number>

export interface Strings {
  /** BCP-47-ish tag, e.g. "de", "en". */
  lang: string
  /** Language name shown in the debug menu selector. */
  languageName: string

  months: string[]
  /** Full in-game date, e.g. "3. Januar 1890" / "January 3, 1890". */
  formatDate(day: number, startYear: number): string
  /** Coordinate line for the status bar. */
  formatLatLon(lat: number, lon: number): string
  /** Locale decimal formatting with one fraction digit. */
  formatDecimal(value: number): string

  regions: Record<RegionId, string>
  /** Animal names used in event entries (design.md §14). */
  animals: { lion: string; leopard: string; snake: string; crocodile: string }
  places: Record<string, string>
  peoples: Record<string, string>
  landmarks: Record<string, string>
  rivers: Record<string, string>
  equipment: Record<EquipmentId, string>
  gifts: Record<Material, string>
  /** Treasure finds/valuables (design.md §8). */
  treasures: Record<TreasureId, string>
  buildings: Record<BuildingType, string>
  sketches: Record<SketchId, string>

  status: {
    date: string
    cash: string
    provisions: string
    provisionsWeeks(weeks: string): string
    gifts: string
    hand: string
    handEmpty: string
    region: string
  }

  /** Health query and affliction names (design.md §6/§17). */
  health: {
    states: { healthy: string; weakened: string; poor: string }
    fever: string
    dehydration: string
    sunblind: string
    woundsLight: string
    woundsSevere: string
    /** Toast for the health query (H), e.g. "I feel weakened (fever)." */
    report(state: string, afflictions: string[]): string
  }

  hud: {
    journalToggle: string
    mapToggle: string
    handTooltip: string
    medicineTooltip: string
    /** Shown when the renderer fell back from WebGPU to WebGL 2. */
    webglFallback: string
    webglFallbackDismiss: string
    /** Frame counter label, e.g. "62 FPS". */
    fps(fps: number): string
    /** Reason shown while a terrain slowdown is active (design.md §11). */
    movementPenalty: { jungle: string; water: string; mountain: string }
  }

  prompts: {
    digHere: string
    interact(label: string): string
    /** Near a pitched camp (design.md §6). */
    openCamp: string
  }

  labels: {
    talkToElder: string
    oldMan: string
    graveDebug: string
    /** Marker label of a pitched free camp (design.md §6). */
    camp: string
  }

  journalPanel: {
    title: string
    close: string
    readAloud: string
    stopReading: string
    voiceLoading: string
    voiceError: string
  }

  mapOverlay: {
    title: string
    explored(region: string, percent: number): string
    close: string
  }

  /** Tabular load menu of all port visits (design.md §18). */
  loadMenu: {
    title: string
    port: string
    health: string
    resume: string
    back: string
  }

  toasts: {
    oceanBlocked: string
    /** Warning when starting to climb a mountain without a rope (design.md §11). */
    mountainNoRopeWarn: string
    boughtFood: string
    bought(name: string): string
    inHand(name: string): string
    handsFree: string
    notEnoughMoney: string
    digNoShovel: string
    villagerNod: string
    journalDndOn: string
    journalDndOff: string
    /** Debug F3: full loadout granted. */
    debugLoadout: string
    /** Debug F4: canoe added/removed. */
    debugCanoeOn: string
    debugCanoeOff: string
    noMedicine: string
    medicineNotNeeded: string
    /** Inventory capacity reached (design.md §6). */
    inventoryFull: string
    /** A landmark discovery registered for the bounty (design.md §10). */
    discovered(name: string): string
    sold(name: string, amount: number): string
    /** Sold a piece of gear for gifts in a village (design.md §9). */
    soldForGifts(name: string, count: number): string
    /** Not enough gifts to pay in a village (gifts are the local currency). */
    notEnoughGifts: string
    /** The bazaar refuses a regionally rejected material (design.md §10). */
    bazaarRejected(name: string): string
    graveyardEmpty: string
    /** Standing gates (design.md §12). */
    villagersFlee: string
    chiefHostile: string
    regionShunned: string
    /** Camps (design.md §6). */
    campPitched: string
    campNeedsFriend: string
    /** Position query (design.md §17), e.g. via P or the gamepad. */
    positionReport(coords: string, region: string): string
    /** A gift unlocked the settlement orientation (design.md §17). */
    orientationGained: string
  }

  dialogs: {
    tradeGreeting: string
    /** Trader greeting in a native village (gifts as currency, design.md §9). */
    tradeGreetingVillage: string
    cash: string
    /** Gifts on hand, the currency label in a village trade dialog. */
    giftsHeld: string
    /** A price expressed in gifts, e.g. "2 gifts". */
    priceGifts(n: number): string
    /** Sell section header and button (design.md §9). */
    sellHeader: string
    sell: string
    buy: string
    leave: string
    foodItem: string
    gift(name: string): string
    audienceTitle(people: string): string
    audienceIntro(mood: string): string
    moodHigh: string
    moodMid: string
    moodLow: string
    chiefDone: string
    give: string
    stock(n: number): string
    endAudience: string
    /** Draw the rifle and rob the hut (design.md §12). */
    rob: string
    /** Bazaar (design.md §10): bid flow on offered treasures. */
    bazaarGreeting: string
    bazaarSell: string
    bazaarBuy: string
    offer: string
    bid(name: string, amount: number): string
    accept: string
    decline: string
    /** Travel agency (design.md §10): ferry passages between ports. */
    agencyGreeting: string
    passage(dest: string, days: number): string
    book: string
    /** Camp caches (design.md §6). */
    campTitle: string
    villageCampTitle: string
    campHint: string
    villageCampHint: string
    campPack: string
    campContents: string
    campEmpty: string
    campStore: string
    campTake: string
  }

  overlays: {
    title: string
    victoryText(days: number): string
    /** Report about the explorer's remains (design.md §15). */
    remainsReport(cause: string, days: number): string
    deathCauses: Record<DeathCause, string>
    deadlineExpired(days: number): string
    /** Button: a successor takes over from the last checkpoint (§18). */
    successor: string
    newExpedition: string
    checkpointFound: string
    loadCheckpoint: string
  }

  debug: {
    title: string
    /** Read-only display of the active render backend (WebGPU/WebGL 2). */
    renderer: string
    language: string
    travelSpeed: string
    walkSpeed: string
    strafeFactor: string
    mouseSensitivity: string
    ambienceVolume: string
    foodPerDay: string
    daysPerUnit: string
    digRadius: string
    goodwillForHint: string
    randomEvents: string
    triggerEvent: string
    eventNames: Record<string, string>
    showHidden: string
    fpsCounter: string
    health: string
    wheelZoom: string
    journalDnd: string
    cash: string
    foodDays: string
    jumpTo: string
    /** Placeholder entry of the debug dropdowns. */
    choose: string
    grave: string
    addEquipment: string
    addGift: string
    addTreasure: string
    giftsTotal: string
    inventoryCapacity: string
  }

  /**
   * Journal entry templates, addressed by key from stored TextRefs so that
   * entries re-render in the currently selected language. Bodies carry the
   * emotional voice markup (src/journal/voiceMarkup.ts, design.md §15) in
   * every language; it is stripped for display and drives the read-aloud.
   */
  journal: {
    titles: {
      departure: string
      region(p: TextParams): string
      arrival(p: TextParams): string
      village(p: TextParams): string
      audience: string
      mistake: string
      chiefHint: string
      decoded: string
      unspecific: string
      giftLore: string
      language(p: TextParams): string
      victory: string
      foodLow: string
      foodOut: string
      dehydration: string
      recovery: string
      healthPoor: string
      attack: string
      robbery: string
      fever: string
      sunblind: string
      sandstorm: string
      sweptAway: string
      /** Warning entry on climbing a mountain without a rope (design.md §11). */
      mountainClimb: string
      /** A fall while climbing without a rope (design.md §11). */
      mountainFall: string
      discovery: string
      deadline1: string
      deadline2: string
      successor: string
      treasure: string
      bounty: string
      ferry: string
      valuableReaction: string
      friend: string
      rescue: string
      friendSupplies: string
      robberyCommitted: string
      campLooted: string
    }
    start: string
    regionEntry(p: TextParams): string
    portArrival(p: TextParams): string
    villageFirstVisit(p: TextParams): string
    giftRevered(p: TextParams): string
    giftNeutral: string
    giftRejected(p: TextParams): string
    /** Elder lesson on the region's direction system (design.md §13.2). */
    languageLesson(p: TextParams): string
    /** Raw location hint in the region's own words (design.md §13.1/13.3). */
    hintRaw(p: TextParams): string
    /** Deciphered version once the language is learned. */
    hintDecoded(p: TextParams): string
    /** Unspecific knowledge pointing to the knowing people (§13.3). */
    unspecific(p: TextParams): string
    /** What the region reveres (design.md §8), told by an elder. */
    giftLore(p: TextParams): string
    digNothing: string
    victory(p: TextParams): string
    foodLow: string
    foodOut: string
    dehydrationOn: string
    dehydrationOver: string
    sunblindOver: string
    medicineUsed: string
    healthPoor: string
    animalAttack(p: TextParams): string
    robbery(p: TextParams): string
    feverOn: string
    sunblindOn: string
    sandstorm: string
    sweptAway: string
    /** Climbing a mountain without a rope: warning and the fall (design.md §11). */
    mountainNoRope: string
    mountainFall: string
    mountainFallItem: string
    findRemains(p: TextParams): string
    deadline1: string
    deadline2: string
    successor: string
    /** A buried treasure cache dug up (design.md §8/§18). */
    treasureFound(p: TextParams): string
    /** Ivory recovered at the elephant graveyard (design.md §4.4). */
    ivoryFound: string
    /** Discovery bounties credited at a port (design.md §10). */
    bounty(p: TextParams): string
    /** Ferry passage between two ports (design.md §10). */
    ferry(p: TextParams): string
    /** Reactions to a visibly carried valuable (design.md §8). */
    valuableRevered(p: TextParams): string
    valuableRejected(p: TextParams): string
    /** "Honored Friend" (design.md §12): pledge, rescues, aid, supplies. */
    friendPledge(p: TextParams): string
    friendRescue(p: TextParams): string
    friendRescueRobbers(p: TextParams): string
    friendAid(p: TextParams): string
    friendSupplies(p: TextParams): string
    /** A hut robbery at rifle point (design.md §12). */
    robberyCommitted(p: TextParams): string
    /** A looted free camp, discovered on return (design.md §6). */
    campLooted: string
  }
}
