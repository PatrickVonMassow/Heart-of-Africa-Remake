// Contract for the game's language files (design.md §17: German default,
// English, easily extensible). Every player-visible string lives here; both
// dictionaries must implement this interface, so adding or changing a text
// in only one language fails the build.

import type { EquipmentId } from '../state/store'
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
  places: Record<string, string>
  peoples: Record<string, string>
  landmarks: Record<string, string>
  rivers: Record<string, string>
  equipment: Record<EquipmentId, string>
  gifts: Record<Material, string>
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

  hud: {
    journalToggle: string
    mapToggle: string
    handTooltip: string
    /** Shown when the renderer fell back from WebGPU to WebGL 2. */
    webglFallback: string
    webglFallbackDismiss: string
    /** Frame counter label, e.g. "62 FPS". */
    fps(fps: number): string
  }

  prompts: {
    enterPlace(name: string): string
    digHere: string
    interact(label: string): string
  }

  labels: {
    talkToElder: string
    oldMan: string
    leavePlace: string
    graveDebug: string
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

  toasts: {
    oceanBlocked: string
    boughtFood: string
    bought(name: string): string
    inHand(name: string): string
    handsFree: string
    notEnoughMoney: string
    digNoShovel: string
    villagerNod: string
  }

  dialogs: {
    tradeGreeting: string
    cash: string
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
  }

  overlays: {
    title: string
    victoryText(days: number): string
    newExpedition: string
    checkpointFound: string
    loadCheckpoint: string
  }

  debug: {
    title: string
    language: string
    travelSpeed: string
    walkSpeed: string
    foodPerDay: string
    daysPerUnit: string
    digRadius: string
    goodwillForHint: string
    randomEvents: string
    showHidden: string
    fpsCounter: string
    cash: string
    foodDays: string
    jumpTo: string
    grave: string
    addEquipment: string
    addGift: string
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
      language: string
      victory: string
      foodLow: string
      foodOut: string
    }
    start: string
    regionEntry(p: TextParams): string
    portArrival(p: TextParams): string
    villageFirstVisit(p: TextParams): string
    giftRevered(p: TextParams): string
    giftNeutral: string
    giftRejected(p: TextParams): string
    languageHint: string
    chiefHint(p: TextParams): string
    digNothing: string
    victory(p: TextParams): string
    foodLow: string
    foodOut: string
  }
}
