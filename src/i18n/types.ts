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
  /** Compact DD.MM.YYYY for the status bar (design.md §17.1). */
  formatDateShort(day: number, startYear: number): string
  /** Coordinate line for the status bar. */
  formatLatLon(lat: number, lon: number): string
  /** Locale decimal formatting with one fraction digit. */
  formatDecimal(value: number): string

  regions: Record<RegionId, string>
  /** Animal names used in event entries (design.md §14). */
  animals: { lion: string; cheetah: string; leopard: string; hyena: string; snake: string; crocodile: string }
  places: Record<string, string>
  peoples: Record<string, string>
  landmarks: Record<string, string>
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
    campToggle: string
    mapToggle: string
    /** Tooltip for a click-to-use item (medicine/map/shovel). */
    useTooltip: string
    /** Tooltip for a passive item whose effect follows possession. */
    passiveTooltip: string
    /** Tooltip for the canteen fill reading. */
    canteenTooltip: string
    /** Tooltip for presenting a valuable to a village. */
    presentTooltip: string
    /** Shown when the renderer fell back from WebGPU to WebGL 2. */
    webglFallback: string
    webglFallbackDismiss: string
    /** Frame counter label, e.g. "62 FPS". */
    fps(fps: number): string
    /** Label/tooltip for the bottom-left health bar (design.md §17.1). */
    healthBar: string
    /** Reason shown while a terrain slowdown is active (design.md §11). */
    movementPenalty: { jungle: string; water: string; mountain: string; canoeOnLand: string }
    /** Accessible labels for the on-screen touch controls (design.md §17.5). */
    touch: { moveStick: string; lookArea: string }
  }

  prompts: {
    interact(label: string): string
    /** Near a pitched camp (design.md §6). */
    openCamp: string
    /** Within a settlement's enter radius (design.md §2.3): press the use key
     *  (Space) to enter. `name` is the settlement's localized name. */
    enterPlace(name: string): string
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
    /** Continent name shown in the map's title cartouche. */
    continent: string
    /** Cartouche subtitle line, in the style of a period atlas plate. */
    subtitle: string
    /** Scale-bar caption (period atlases print "English Miles"). */
    scaleMiles: string
    explored(region: string, percent: number): string
    /** Header of the settlement plan the map shows while inside a place. */
    plan(place: string): string
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

  /** F5 state-dump popup (design.md §21.1): the full game state for bug reports. */
  stateDump: {
    title: string
    /** Save the JSON as a .json file. */
    download: string
    /** Copy the JSON to the clipboard. */
    copy: string
    /** Toast confirming the JSON went to the clipboard. */
    copied: string
    close: string
  }

  toasts: {
    oceanBlocked: string
    /** Warning when starting to climb a mountain without a rope (design.md §11). */
    mountainNoRopeWarn: string
    /** First-time movement-penalty warnings for jungle/water/canoe (design.md §11). */
    penaltyJungle: string
    penaltyWater: string
    penaltyCanoeLand: string
    /** A valuable was already presented to this village (design.md §8). */
    valuableAlreadyShown: string
    boughtFood: string
    bought(name: string): string
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
    /** Safety confirmation before the robbery, and its yes/cancel labels. */
    robConfirm: string
    robConfirmYes: string
    robCancel: string
    robOrphansGoal: string
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
    walkerUnstuck: string
    mouseSensitivity: string
    ambienceVolume: string
    footstepVolume: string
    ambientVolume: string
    birdsongVolume: string
    surfNearRadius: string
    surfCutoff: string
    foodPerDay: string
    canteenDrain: string
    canteenDesertDrain: string
    canteenCapacity: string
    /** Natural wound-healing durations (design.md §6/§21). */
    woundHealLight: string
    woundHealSevere: string
    daysPerUnit: string
    canoeSpeedup: string
    junglePenalty: string
    riverWidthFactor: string
    drownSeconds: string
    wetFlowFactor: string
    vigilPredatorDelay: string
    rescueBurst: string
    calfFraction: string
    calfFollowRadius: string
    calfGambolRange: string
    calfGambolBout: string
    crocStrikeRadius: string
    juvenilePreyBias: string
    juvenileDrinkCrocBias: string
    crocGripSeconds: string
    huntLeaveOvertime: string
    waterCrossMax: string
    waterCrossChance: string
    seasonStrength: string
    wetGroundStrength: string
    season: string
    seasonAuto: string
    seasonDry: string
    seasonMid: string
    seasonWet: string
    mountainPenalty: string
    foodUnitDays: string
    oceanSwimMargin: string
    digRadius: string
    goodwillForHint: string
    randomEvents: string
    triggerEvent: string
    eventNames: Record<string, string>
    showHidden: string
    fpsCounter: string
    /** TRAA toggle (design.md §2.7/§21), default on. */
    traa: string
    /** SSAO toggle (design.md §2.7); off in the touch quality preset (point 84). */
    ssao: string
    /** Half-size shadow maps toggle; on in the touch quality preset (point 84). */
    shadowMapHalf: string
    shadows: string
    flatGround: string
    /** Debug toggle for the dry-season flora deformation (point 175), default on. */
    foliageCollapse: string
    health: string
    wheelZoom: string
    journalDnd: string
    cash: string
    foodDays: string
    jumpTo: string
    /** optgroup labels of the jump-to dropdown (design.md §21.3). */
    jumpGroups: {
      ports: string
      villages: string
      mountains: string
      waterfalls: string
      lakes: string
      cultural: string
      natural: string
      other: string
    }
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
      villageReturn(p: TextParams): string
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
      /** First-time movement-penalty warnings (design.md §11). */
      penaltyJungle: string
      penaltyWater: string
      penaltyCanoeLand: string
      /** First-time danger warnings with protection advice (design.md §14). */
      dangerUnarmed: string
      dangerDesert: string
      dangerWater: string
      dangerWetland: string
      /** A fall while climbing without a rope (design.md §11). */
      mountainFall: string
      /** Sighting a landmark for the first time (design.md §10/§16):
       *  a kind-specific heading naming the landmark ("A Discovery" was
       *  too generic, user feedback). */
      landmarkDiscovered(p: TextParams): string
      discovery: string
      deadline1: string
      deadline2: string
      successor: string
      /** Digging a find: names the treasure, or the graveyard-ivory case. */
      treasure(p: TextParams): string
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
    villageReturn(p: TextParams): string
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
    /** Natural wound healing without medicine (design.md §6). */
    woundHealed: string
    woundEased: string
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
    /** First-time movement-penalty warnings for jungle/water/canoe (design.md §11). */
    penaltyJungle: string
    penaltyWater: string
    penaltyCanoeLand: string
    /** First-time danger warnings with protection advice (design.md §14). */
    dangerUnarmed: string
    dangerDesert: string
    dangerWater: string
    /** Water-warning variant when a canoe is already in the pack: it
     *  acknowledges the protection instead of advising it (design.md §14). */
    dangerWaterCanoe: string
    dangerWetland: string
    mountainFall: string
    mountainFallItem: string
    /** First sighting of a landmark (design.md §10/§16): the journal announces
     *  the discovery, flavored by its kind (mountain/falls/lake/grave). */
    landmarkDiscovered(p: TextParams): string
    findRemains(p: TextParams): string
    deadline1: string
    deadline2: string
    successor: string
    /** A buried treasure cache dug up (design.md §8/§18). */
    treasureFound(p: TextParams): string
    /** Ivory recovered at the elephant graveyard, a random haul (design.md §4.4). */
    ivoryFound(p: TextParams): string
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
