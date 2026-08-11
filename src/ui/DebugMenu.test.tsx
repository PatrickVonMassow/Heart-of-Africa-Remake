// Debug menu HUD component (CLAUDE.md §7.1 pt. 17/20, design.md §21/§17). Ports
// the DebugMenu asserts of settings.mjs, i18n.mjs and enrichments.mjs into React
// Testing Library checks (jsdom, no browser): localized field labels in both
// languages, the language selector and its switch, live edits writing through to
// the balance singleton, and the presence of the renderer row and the
// jump-to/equipment/gift dropdown selectors. The acceptance screenshots, the
// user-select computed-style checks and the in-scene effects stay in Playwright.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebugMenu } from './DebugMenu'
import { DEBUG_GROUP_ORDER, matchesDebugFilter, type DebugGroupId } from './debugMenuGroups'
import { balance } from '../config/balance'
import { EDGE_BAND_MAX_WANDER_M } from '../render/edgeBand'
import { STAIN_MAX_IRREGULARITY } from '../render/groundStains'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { freshGame, withWorld, useGame } from '../test/store'
import { MOUNTAINS } from '../world/data/landmarks'
import { latLonToWorld, placeById } from '../world/geo'
import { EVENT_KINDS } from '../systems/events'
import {
  DRAMA_PREFIX,
  EVENT_PREFIX,
  HAZARD_PREFIX,
  WILDLIFE_DRAMA_KINDS,
  setWildlifeDramaTrigger,
} from '../systems/debugEvents'

withWorld()

// The debug menu edits mutate the shared balance singleton; capture the
// defaults so each test restores them (deterministic, no cross-test bleed).
const DEFAULTS = {
  travelSpeed: balance.travelSpeed,
  mouseSensitivity: balance.mouseSensitivity,
  lookPitchLimitDeg: balance.lookPitchLimitDeg,
  ambienceVolume: balance.ambienceVolume,
  footstepVolume: balance.footstepVolume,
  ambientVolume: balance.ambientVolume,
  walkerUnstuckSeconds: balance.walkerUnstuckSeconds,
  unstuck: { ...balance.unstuck },
  tag: { ...balance.villageLife.tag },
  childSpeech: { ...balance.villageLife.childSpeech },
  adultErrands: { ...balance.villageLife.adultErrands },
  separation: { ...balance.villageLife.separation },
  startupFreezeBudgetMs: balance.startup.pictureFreezeBudgetMs,
  labelOverlayMax: balance.labelOverlay.maxLabels,
  birdsongVolume: balance.birdsongVolume,
  speechVolume: balance.communication.speechVolume,
  surfNearRadius: balance.surf.nearRadius,
  surfCutoff: balance.surf.cutoff,
  canoeSpeedup: balance.canoeSpeedup,
  riverWidthFactor: balance.river.widthFactor,
  riverMouthSlackDeg: balance.river.mouthSlackDeg,
  canteenCapacity: balance.health.canteenCapacity,
  vigilPredatorDelay: balance.vigil.predatorDelay,
  rescueBurst: balance.family.rescueBurst,
  calfFraction: balance.family.calfFraction,
  calfFollowRadius: balance.family.followRadius,
  calfGambolRange: balance.family.gambolRange,
  calfGambolBout: balance.family.gambolBoutSeconds,
  juvenilePreyBias: balance.family.juvenilePreyBias,
  juvenileDrinkCrocBias: balance.family.juvenileDrinkCrocBias,
  calfAdoptionRadius: balance.family.adoptionRadius,
  calfEscapeSeconds: balance.family.escapeSeconds,
  calfReunionSeconds: balance.family.reunionSeconds,
  fightDispositionRate: balance.fight.dispositionRate,
  fightClashSeconds: balance.fight.clashSeconds,
  fightClashIntensity: balance.fight.clashIntensity,
  fightLethalityScale: balance.fight.lethalityScale,
  crocStrikeRadius: balance.crocodile.strikeRadius,
  crocAmbushBankBand: balance.crocodile.ambushBankBand,
  crocMouthOffset: balance.crocodile.mouthOffsetLocal,
  wetGroundStrength: balance.season.wetGroundStrength,
  edgeBandWidth: balance.placeEdgeBand.widthM,
  edgeBandWander: balance.placeEdgeBand.wanderM,
  edgeBandStrength: balance.placeEdgeBand.strength,
  bankWadeDepth: balance.bankWadeDepth,
  bloodStainSize: balance.bloodStain.sizeScale,
  bloodStainIrregularity: balance.bloodStain.irregularity,
  placeStrafeFactor: balance.placeStrafeFactor,
  inventoryCapacity: balance.inventoryCapacity,
  randomEventsEnabled: balance.randomEventsEnabled,
  showHiddenObjects: balance.showHiddenObjects,
}

/** The DebugMenu renders nothing until the UI store's debug flag is open. */
function openDebug(): void {
  if (!useUi.getState().debugOpen) useUi.getState().toggleDebug()
}

/** Find the numeric field whose wrapping label carries the given text. */
function numberField(labelText: string): HTMLInputElement {
  const rows = [...document.querySelectorAll('.debug-menu label')]
  const row = rows.find((r) => r.textContent?.includes(labelText))
  const input = row?.querySelector('input[type="number"]') as HTMLInputElement | null
  if (!input) throw new Error(`no numeric field for label "${labelText}"`)
  return input
}

/** The debug-menu <select> that offers an <option> with the given value. */
function selectWithOption(value: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll('.debug-menu select')].find((s) =>
    [...(s as HTMLSelectElement).options].some((o) => o.value === value),
  ) as HTMLSelectElement | undefined
}

/** The language-selector button carrying the given text (as i18n.mjs matches it). */
function languageButton(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('.debug-menu button')].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement | undefined
}

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  openDebug()
})

afterEach(() => {
  balance.travelSpeed = DEFAULTS.travelSpeed
  balance.mouseSensitivity = DEFAULTS.mouseSensitivity
  balance.lookPitchLimitDeg = DEFAULTS.lookPitchLimitDeg
  balance.ambienceVolume = DEFAULTS.ambienceVolume
  balance.footstepVolume = DEFAULTS.footstepVolume
  balance.ambientVolume = DEFAULTS.ambientVolume
  balance.walkerUnstuckSeconds = DEFAULTS.walkerUnstuckSeconds
  Object.assign(balance.unstuck, DEFAULTS.unstuck)
  Object.assign(balance.villageLife.tag, DEFAULTS.tag)
  Object.assign(balance.villageLife.childSpeech, DEFAULTS.childSpeech)
  Object.assign(balance.villageLife.adultErrands, DEFAULTS.adultErrands)
  Object.assign(balance.villageLife.separation, DEFAULTS.separation)
  balance.startup.pictureFreezeBudgetMs = DEFAULTS.startupFreezeBudgetMs
  balance.labelOverlay.maxLabels = DEFAULTS.labelOverlayMax
  balance.birdsongVolume = DEFAULTS.birdsongVolume
  balance.communication.speechVolume = DEFAULTS.speechVolume
  balance.surf.nearRadius = DEFAULTS.surfNearRadius
  balance.surf.cutoff = DEFAULTS.surfCutoff
  balance.canoeSpeedup = DEFAULTS.canoeSpeedup
  balance.river.widthFactor = DEFAULTS.riverWidthFactor
  balance.river.mouthSlackDeg = DEFAULTS.riverMouthSlackDeg
  balance.health.canteenCapacity = DEFAULTS.canteenCapacity
  balance.vigil.predatorDelay = DEFAULTS.vigilPredatorDelay
  balance.family.rescueBurst = DEFAULTS.rescueBurst
  balance.family.calfFraction = DEFAULTS.calfFraction
  balance.family.followRadius = DEFAULTS.calfFollowRadius
  balance.family.gambolRange = DEFAULTS.calfGambolRange
  balance.family.gambolBoutSeconds = DEFAULTS.calfGambolBout
  balance.family.juvenilePreyBias = DEFAULTS.juvenilePreyBias
  balance.family.juvenileDrinkCrocBias = DEFAULTS.juvenileDrinkCrocBias
  balance.family.adoptionRadius = DEFAULTS.calfAdoptionRadius
  balance.family.escapeSeconds = DEFAULTS.calfEscapeSeconds
  balance.family.reunionSeconds = DEFAULTS.calfReunionSeconds
  balance.fight.dispositionRate = DEFAULTS.fightDispositionRate
  balance.fight.clashSeconds = DEFAULTS.fightClashSeconds
  balance.fight.clashIntensity = DEFAULTS.fightClashIntensity
  balance.fight.lethalityScale = DEFAULTS.fightLethalityScale
  balance.crocodile.strikeRadius = DEFAULTS.crocStrikeRadius
  balance.crocodile.ambushBankBand = DEFAULTS.crocAmbushBankBand
  balance.crocodile.mouthOffsetLocal = DEFAULTS.crocMouthOffset
  balance.season.wetGroundStrength = DEFAULTS.wetGroundStrength
  balance.placeEdgeBand.widthM = DEFAULTS.edgeBandWidth
  balance.placeEdgeBand.wanderM = DEFAULTS.edgeBandWander
  balance.placeEdgeBand.strength = DEFAULTS.edgeBandStrength
  balance.bankWadeDepth = DEFAULTS.bankWadeDepth
  balance.bloodStain.sizeScale = DEFAULTS.bloodStainSize
  balance.bloodStain.irregularity = DEFAULTS.bloodStainIrregularity
  balance.placeStrafeFactor = DEFAULTS.placeStrafeFactor
  balance.inventoryCapacity = DEFAULTS.inventoryCapacity
  balance.randomEventsEnabled = DEFAULTS.randomEventsEnabled
  balance.showHiddenObjects = DEFAULTS.showHiddenObjects
  useUi.setState({ debugGroupsOpen: [] })
  useLocale.getState().setLang('en')
  useUi.getState().setTraaEnabled(true)
  useUi.getState().setWebglFallback(false)
  useUi.getState().setShadowsEnabled(true)
  useUi.getState().setGroundDebugFlat(false)
  useUi.getState().setSeasonCollapseEnabled(true)
  useUi.getState().setWheelZoomEnabled(false)
  useUi.getState().setInvertLook(true)
  useUi.getState().setJournalDnd(false)
  if (useUi.getState().debugOpen) useUi.getState().toggleDebug()
})

describe('DebugMenu localization (settings.mjs de/en label checks)', () => {
  it('renders the English field labels', () => {
    render(<DebugMenu />)
    expect(screen.getByText(en.debug.title)).toBeInTheDocument()
    expect(screen.getByText(en.debug.mouseSensitivity)).toBeInTheDocument()
    expect(screen.getByText(en.debug.lookPitchLimit)).toBeInTheDocument()
    expect(screen.getByText(en.debug.invertLook)).toBeInTheDocument()
    expect(screen.getByText(en.debug.ambienceVolume)).toBeInTheDocument()
    expect(screen.getByText(en.debug.travelSpeed)).toBeInTheDocument()
  })

  it('renders the German field labels after a runtime language switch', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    expect(screen.getByText(de.debug.mouseSensitivity)).toBeInTheDocument()
    expect(screen.getByText(de.debug.lookPitchLimit)).toBeInTheDocument()
    expect(screen.getByText(de.debug.invertLook)).toBeInTheDocument()
    expect(screen.getByText(de.debug.ambienceVolume)).toBeInTheDocument()
    // The English labels are gone once German is active.
    expect(screen.queryByText(en.debug.mouseSensitivity)).not.toBeInTheDocument()
  })
})

describe('DebugMenu language selector (i18n.mjs)', () => {
  it('shows the Sprache/Language selector with Deutsch and English buttons', () => {
    // Rendered in German so the current-language (Deutsch) button is disabled
    // and the "English" button is the actionable one — as in i18n.mjs.
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    expect(screen.getByText(de.debug.language)).toBeInTheDocument()
    expect(languageButton(de.languageName)).toBeDefined()
    expect(languageButton(en.languageName)).toBeDefined()
  })

  it('clicking the English button switches the locale back to English', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    const englishBtn = languageButton(en.languageName)
    expect(englishBtn).toBeDefined()
    fireEvent.click(englishBtn as HTMLButtonElement)
    // getStrings/useLocale now report English (i18n.mjs "English button clicked").
    expect(useLocale.getState().lang).toBe('en')
    // The menu re-renders in English ("Back to English via debug menu").
    expect(screen.getByText(en.debug.language)).toBeInTheDocument()
    expect(screen.getByText(en.debug.cash)).toBeInTheDocument()
  })
})

describe('DebugMenu editable fields write through to balance (settings.mjs fillField)', () => {
  const editable: Array<{ label: string; read: () => number; value: number }> = [
    { label: en.debug.mouseSensitivity, read: () => balance.mouseSensitivity, value: 0.002 },
    // The vertical look clamp (point 392), calibratable like its siblings.
    { label: en.debug.lookPitchLimit, read: () => balance.lookPitchLimitDeg, value: 70 },
    { label: en.debug.ambienceVolume, read: () => balance.ambienceVolume, value: 0.5 },
    { label: en.debug.footstepVolume, read: () => balance.footstepVolume, value: 3 },
    { label: en.debug.ambientVolume, read: () => balance.ambientVolume, value: 0.3 },
    // The inhabitant unstuck window (point 155).
    { label: en.debug.walkerUnstuck, read: () => balance.walkerUnstuckSeconds, value: 8 },
    // The PLAYER's escape from a wedge (work-order 604): when he counts as
    // stuck, and how far the search for free ground reaches.
    { label: en.debug.unstuckStallSeconds, read: () => balance.unstuck.stallSeconds, value: 5 },
    { label: en.debug.unstuckSearchRadius, read: () => balance.unstuck.searchRadius, value: 20 },
    // The children's game of tag (point 480/351): a pace, a threshold and a
    // distance, one from each family of the chase's calibration.
    { label: en.debug.tagSprintSpeed, read: () => balance.villageLife.tag.sprintSpeed, value: 4.5 },
    { label: en.debug.tagBreakOff, read: () => balance.villageLife.tag.breakOff, value: 0.25 },
    { label: en.debug.tagPressure, read: () => balance.villageLife.tag.pressureDistance, value: 7 },
    { label: en.debug.tagPlayRadius, read: () => balance.villageLife.tag.playRadius, value: 12 },
    // What the children SAY at that game (point 481): the rate of the staged
    // situations, the life of the action that follows and the refusal chance.
    { label: en.debug.childSpeechInterval, read: () => balance.villageLife.childSpeech.intervalSeconds, value: 9 },
    { label: en.debug.childSpeechAction, read: () => balance.villageLife.childSpeech.actionSeconds, value: 7 },
    { label: en.debug.childSpeechRefusal, read: () => balance.villageLife.childSpeech.refusalChance, value: 0.5 },
    // What the ADULTS do at their errands (point 483): the rate, the two dwell
    // times and the size of the group that runs them.
    { label: en.debug.adultErrandInterval, read: () => balance.villageLife.adultErrands.intervalSeconds, value: 12 },
    { label: en.debug.adultErrandDwell, read: () => balance.villageLife.adultErrands.dwellSeconds, value: 8 },
    { label: en.debug.adultErrandDig, read: () => balance.villageLife.adultErrands.digSeconds, value: 12 },
    { label: en.debug.adultErrandCount, read: () => balance.villageLife.adultErrands.villagerCount, value: 6 },
    // The body every inhabitant presents to every other, and its damping (point
    // 578): the radius, the dead band, the stiffness, the cap and the wedge window.
    { label: en.debug.separationRadius, read: () => balance.villageLife.separation.bodyRadius, value: 0.3 },
    { label: en.debug.separationSlop, read: () => balance.villageLife.separation.slop, value: 0.02 },
    { label: en.debug.separationStiffness, read: () => balance.villageLife.separation.stiffness, value: 0.4 },
    { label: en.debug.separationSpeed, read: () => balance.villageLife.separation.maxSpeed, value: 1.5 },
    { label: en.debug.separationWedge, read: () => balance.villageLife.separation.wedgeSeconds, value: 2 },
    // The loading picture's freeze budget the startup gate binds (point 337).
    { label: en.debug.startupFreezeBudget, read: () => balance.startup.pictureFreezeBudgetMs, value: 6000 },
    // How many hold-Ctrl labels may stand at once (point 342).
    { label: en.debug.labelOverlayMax, read: () => balance.labelOverlay.maxLabels, value: 12 },
    // Per-source birdsong volume and the coastal surf fade bounds (point 153).
    { label: en.debug.birdsongVolume, read: () => balance.birdsongVolume, value: 0.5 },
    { label: en.debug.surfNearRadius, read: () => balance.surf.nearRadius, value: 0.8 },
    { label: en.debug.surfCutoff, read: () => balance.surf.cutoff, value: 5 },
    // Village speech (design.md §13.4/§21.2): pace, phrase pause and the short
    // hearing range with its falloff sharpness.
    { label: en.debug.speechSyllable, read: () => balance.communication.syllableSeconds, value: 0.45 },
    { label: en.debug.speechPhrasePause, read: () => balance.communication.phrasePauseSeconds, value: 1.4 },
    { label: en.debug.speechHearingRadius, read: () => balance.communication.hearingRadius, value: 14 },
    { label: en.debug.speechHearingFalloff, read: () => balance.communication.hearingFalloff, value: 12 },
    // How long the player's reading stands over the speaker's head (point 485).
    { label: en.debug.speechLabelSeconds, read: () => balance.communication.labelSeconds, value: 4 },
    // The speech's own level (point 577) — the slider the player lacked when he
    // silenced the syllables trying to lift them over the drums.
    { label: en.debug.speechVolume, read: () => balance.communication.speechVolume, value: 0.8 },
    { label: en.debug.canoeSpeedup, read: () => balance.canoeSpeedup, value: 5 },
    // Nested balance field (balance.health.canteenCapacity).
    { label: en.debug.canteenCapacity, read: () => balance.health.canteenCapacity, value: 600 },
    // Build-time geometry value (point 136): the edit persists in balance and
    // applies on the next reload — the write-through is what the menu owes.
    { label: en.debug.riverWidthFactor, read: () => balance.river.widthFactor, value: 2 },
    { label: en.debug.riverMouthSlackDeg, read: () => balance.river.mouthSlackDeg, value: 0.9 },
    // The vigil's predator draw delay (design.md §19.8, point 121 (f)).
    { label: en.debug.vigilPredatorDelay, read: () => balance.vigil.predatorDelay, value: 20 },
    // The parental rescue burst (design.md §19.8, point 127).
    { label: en.debug.rescueBurst, read: () => balance.family.rescueBurst, value: 3 },
    // The juvenile fraction per herd (design.md §19, point 169).
    { label: en.debug.calfFraction, read: () => balance.family.calfFraction, value: 0.4 },
    // The calf leash, play range and bout length (design.md §19.8, §21.2).
    { label: en.debug.calfFollowRadius, read: () => balance.family.followRadius, value: 7 },
    { label: en.debug.calfGambolRange, read: () => balance.family.gambolRange, value: 15 },
    { label: en.debug.calfGambolBout, read: () => balance.family.gambolBoutSeconds, value: 10 },
    // Juvenile-prey preferences (design.md §19.8/§19.16, point 245).
    { label: en.debug.juvenilePreyBias, read: () => balance.family.juvenilePreyBias, value: 0.9 },
    { label: en.debug.juvenileDrinkCrocBias, read: () => balance.family.juvenileDrinkCrocBias, value: 8 },
    // The orphan adoption radius (design.md §19.8/§21.2, point 262).
    { label: en.debug.calfAdoptionRadius, read: () => balance.family.adoptionRadius, value: 25 },
    // The freed calf's escape run before it may be adopted (design.md §19.8/§21.2, point 311).
    { label: en.debug.calfEscapeSeconds, read: () => balance.family.escapeSeconds, value: 9 },
    // The separation window after which a juvenile's bond resolves (design.md §19.8/§21.2, point 341).
    { label: en.debug.calfReunionSeconds, read: () => balance.family.reunionSeconds, value: 60 },
    // Intraspecies combat (design.md §19.17, point 264): the calibratable
    // rate, the clash window, the clash pose intensity and the lethality scale all edit while the game runs.
    { label: en.debug.fightDispositionRate, read: () => balance.fight.dispositionRate, value: 0.05 },
    { label: en.debug.fightClashSeconds, read: () => balance.fight.clashSeconds, value: 8 },
    { label: en.debug.fightClashIntensity, read: () => balance.fight.clashIntensity, value: 0 },
    { label: en.debug.fightLethalityScale, read: () => balance.fight.lethalityScale, value: 0 },
    // The crocodile's bank strike radius (design.md §19.16, point 130).
    { label: en.debug.crocStrikeRadius, read: () => balance.crocodile.strikeRadius, value: 8 },
    // The broadened waterline ambush band and the mouth anchor (points 275/268).
    { label: en.debug.crocAmbushBankBand, read: () => balance.crocodile.ambushBankBand, value: 3 },
    { label: en.debug.crocMouthOffset, read: () => balance.crocodile.mouthOffsetLocal, value: 1.4 },
    // The wet-ground strength (design.md §19.13, point 225).
    { label: en.debug.wetGroundStrength, read: () => balance.season.wetGroundStrength, value: 0.5 },
    // The settlement edge painted on the ground (design.md §2.6, point 352/488).
    { label: en.debug.edgeBandWidth, read: () => balance.placeEdgeBand.widthM, value: 4.5 },
    { label: en.debug.edgeBandWander, read: () => balance.placeEdgeBand.wanderM, value: 0.4 },
    { label: en.debug.edgeBandStrength, read: () => balance.placeEdgeBand.strength, value: 0.6 },
    // How far the traveller wades into a settlement's river (work-order 584).
    { label: en.debug.bankWadeDepth, read: () => balance.bankWadeDepth, value: 1.1 },
    // The blood patches' size and ragged outline (design.md §19.5, point 323).
    { label: en.debug.bloodStainSize, read: () => balance.bloodStain.sizeScale, value: 1.4 },
    { label: en.debug.bloodStainIrregularity, read: () => balance.bloodStain.irregularity, value: 0.3 },
  ]

  it.each(editable)('editing "$label" updates the balance singleton at runtime', ({ label, read, value }) => {
    render(<DebugMenu />)
    const input = numberField(label)
    fireEvent.change(input, { target: { value: String(value) } })
    expect(read()).toBe(value)
  })
})

describe('DebugMenu numeric clamps (design.md §21, point 173)', () => {
  it('clamps a negative strafe/backward factor to zero', () => {
    render(<DebugMenu />)
    const input = numberField(en.debug.strafeFactor)
    fireEvent.change(input, { target: { value: '-5' } })
    expect(balance.placeStrafeFactor).toBe(0)
  })

  it('caps the settlement edge wander so the painted edge cannot lie', () => {
    render(<DebugMenu />)
    fireEvent.change(numberField(en.debug.edgeBandWander), { target: { value: '99' } })
    expect(balance.placeEdgeBand.wanderM).toBeLessThanOrEqual(EDGE_BAND_MAX_WANDER_M)
    expect(balance.placeEdgeBand.wanderM).toBeLessThan(balance.placeEdgeBand.widthM / 2)
  })

  it('caps the blood stain outline swing so the contour cannot fold through itself', () => {
    render(<DebugMenu />)
    fireEvent.change(numberField(en.debug.bloodStainIrregularity), { target: { value: '9' } })
    expect(balance.bloodStain.irregularity).toBe(STAIN_MAX_IRREGULARITY)
    fireEvent.change(numberField(en.debug.bloodStainIrregularity), { target: { value: '-3' } })
    expect(balance.bloodStain.irregularity).toBe(0)
  })

  it('rounds the inventory capacity and floors it at 1 (the only rounding field)', () => {
    render(<DebugMenu />)
    const input = numberField(en.debug.inventoryCapacity)
    fireEvent.change(input, { target: { value: '3.7' } })
    expect(balance.inventoryCapacity).toBe(4)
    fireEvent.change(input, { target: { value: '-5' } })
    expect(balance.inventoryCapacity).toBe(1)
  })
})

describe('DebugMenu remaining boolean toggles write through (design.md §21, point 173)', () => {
  it('random events and hidden objects (balance singleton) toggle on click', () => {
    render(<DebugMenu />)
    // freshGame() (beforeEach) forces randomEventsEnabled true for the store
    // suites' survival mechanics — reflect that starting state, then toggle
    // both ways.
    const events = screen.getByText(en.debug.randomEvents).closest('label')?.querySelector('input') as HTMLInputElement
    expect(events.checked).toBe(true)
    fireEvent.click(events)
    expect(balance.randomEventsEnabled).toBe(false)
    fireEvent.click(events)
    expect(balance.randomEventsEnabled).toBe(true)

    const hidden = screen.getByText(en.debug.showHidden).closest('label')?.querySelector('input') as HTMLInputElement
    expect(hidden.checked).toBe(false)
    fireEvent.click(hidden)
    expect(balance.showHiddenObjects).toBe(true)
    fireEvent.click(hidden)
    expect(balance.showHiddenObjects).toBe(false)
  })

  it('flat ground, wheel zoom and journal do-not-disturb (UI store) toggle on click', () => {
    render(<DebugMenu />)
    const flat = screen.getByText(en.debug.flatGround).closest('label')?.querySelector('input') as HTMLInputElement
    expect(flat.checked).toBe(false)
    fireEvent.click(flat)
    expect(useUi.getState().groundDebugFlat).toBe(true)

    // Point 175 diagnostic: the dry-season foliage collapse defaults on and
    // toggles off through the store (isolates the WebGPU flora deformation).
    const foliage = screen.getByText(en.debug.foliageCollapse).closest('label')?.querySelector('input') as HTMLInputElement
    expect(foliage.checked).toBe(true)
    fireEvent.click(foliage)
    expect(useUi.getState().seasonCollapseEnabled).toBe(false)

    const wheel = screen.getByText(en.debug.wheelZoom).closest('label')?.querySelector('input') as HTMLInputElement
    expect(wheel.checked).toBe(false)
    fireEvent.click(wheel)
    expect(useUi.getState().wheelZoomEnabled).toBe(true)

    const dnd = screen.getByText(en.debug.journalDnd).closest('label')?.querySelector('input') as HTMLInputElement
    expect(dnd.checked).toBe(false)
    fireEvent.click(dnd)
    expect(useUi.getState().journalDnd).toBe(true)
  })

  it('the inverted vertical look ships CHECKED and toggles both ways (point 392)', () => {
    render(<DebugMenu />)
    const invert = screen.getByText(en.debug.invertLook).closest('label')?.querySelector('input') as HTMLInputElement
    // Checked by DEFAULT: the store field itself is inverted, the checkbox only
    // reports it — nothing flips the sense somewhere else.
    expect(invert.checked).toBe(true)
    expect(useUi.getState().invertLook).toBe(true)
    fireEvent.click(invert)
    expect(useUi.getState().invertLook).toBe(false)
    fireEvent.click(invert)
    expect(useUi.getState().invertLook).toBe(true)
  })

  // Work-order 601: outside fullscreen nothing can stop Ctrl+W from closing the
  // tab, so the hold key of the §17.8 name labels is the player's to move.
  it('the hold-key picker ships on Ctrl and rebinds, in both languages', () => {
    useUi.setState({ labelModifier: 'ctrl' })
    const { unmount } = render(<DebugMenu />)
    const picker = () => screen.getByText(en.debug.labelModifier).closest('label')?.querySelector('select') as HTMLSelectElement
    expect(picker().value).toBe('ctrl') // design.md §17.8 states Ctrl
    // Every offered option, and a safe one among them.
    expect([...picker().options].map((o) => o.value)).toEqual(['ctrl', 'shift', 'alt'])
    fireEvent.change(picker(), { target: { value: 'shift' } })
    expect(useUi.getState().labelModifier).toBe('shift')
    unmount()

    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    const german = screen.getByText(de.debug.labelModifier).closest('label')?.querySelector('select') as HTMLSelectElement
    expect(german.value).toBe('shift')
    expect([...german.options].map((o) => o.textContent)).toEqual([
      de.debug.labelModifierCtrl, de.debug.labelModifierShift, de.debug.labelModifierAlt,
    ])
    fireEvent.change(german, { target: { value: 'ctrl' } })
    expect(useUi.getState().labelModifier).toBe('ctrl')
    useLocale.getState().setLang('en')
  })

  it('the graphics-level picker writes through to the store (design.md §21, point 276)', () => {
    useUi.setState({ detailLevel: 'medium', ssaoEnabled: true, shadowsEnabled: true })
    render(<DebugMenu />)
    const picker = screen.getByText(en.debug.detailLevel).closest('label')?.querySelector('select') as HTMLSelectElement
    expect(picker.value).toBe('medium')
    fireEvent.change(picker, { target: { value: 'high' } })
    expect(useUi.getState().detailLevel).toBe('high')
    // Picking a level must not clobber the individual debug flags (read derived).
    expect(useUi.getState().ssaoEnabled).toBe(true)
    expect(useUi.getState().shadowsEnabled).toBe(true)
    fireEvent.change(picker, { target: { value: 'low' } })
    expect(useUi.getState().detailLevel).toBe('low')
  })
})

// The graphics section is now a SINGLE detail-level dropdown (design.md §21.3,
// point 276 correction). The per-setting graphics allow-flags (TRAA, SSAO,
// half/full shadows, campfire shadows) are no longer exposed in the menu — they
// remain internal, driven by the touch preset (§17.5) and the F8 benchmark.
describe('DebugMenu graphics section = only the detail-level dropdown (design.md §21.3, point 276)', () => {
  it('exposes NO per-setting graphics checkbox — no TRAA, SSAO, half-shadow, shadows or campfire-shadow control', () => {
    render(<DebugMenu />)
    expect(screen.queryByText(en.debug.traa)).toBeNull()
    expect(screen.queryByText(en.debug.ssao)).toBeNull()
    expect(screen.queryByText(en.debug.shadowMapHalf)).toBeNull()
    expect(screen.queryByText(en.debug.shadows)).toBeNull()
    expect(screen.queryByText(en.debug.fireShadows)).toBeNull()
    // The single dropdown is present.
    const picker = screen.getByText(en.debug.detailLevel).closest('label')?.querySelector('select')
    expect(picker).not.toBeNull()
  })

  it('selecting each level (low/medium/high) writes detailLevel through — English', () => {
    useLocale.getState().setLang('en')
    useUi.setState({ detailLevel: 'medium' })
    render(<DebugMenu />)
    const picker = screen.getByText(en.debug.detailLevel).closest('label')?.querySelector('select') as HTMLSelectElement
    fireEvent.change(picker, { target: { value: 'low' } })
    expect(useUi.getState().detailLevel).toBe('low')
    fireEvent.change(picker, { target: { value: 'high' } })
    expect(useUi.getState().detailLevel).toBe('high')
    fireEvent.change(picker, { target: { value: 'medium' } })
    expect(useUi.getState().detailLevel).toBe('medium')
  })

  it('selecting each level writes detailLevel through — German, and no graphics checkbox is shown', () => {
    useLocale.getState().setLang('de')
    useUi.setState({ detailLevel: 'medium' })
    render(<DebugMenu />)
    expect(screen.queryByText(de.debug.traa)).toBeNull()
    expect(screen.queryByText(de.debug.ssao)).toBeNull()
    expect(screen.queryByText(de.debug.shadowMapHalf)).toBeNull()
    const picker = screen.getByText(de.debug.detailLevel).closest('label')?.querySelector('select') as HTMLSelectElement
    fireEvent.change(picker, { target: { value: 'low' } })
    expect(useUi.getState().detailLevel).toBe('low')
    fireEvent.change(picker, { target: { value: 'high' } })
    expect(useUi.getState().detailLevel).toBe('high')
  })
})

describe('DebugMenu season selector (design.md §19/§21, point 120c)', () => {
  it('renders the localized selector, defaulting to the calendar', () => {
    render(<DebugMenu />)
    const row = screen.getByText(en.debug.season).closest('label')
    const sel = row?.querySelector('select') as HTMLSelectElement | null
    expect(sel).not.toBeNull()
    expect(sel?.value).toBe('auto')
    expect(useUi.getState().seasonWetnessOverride).toBeNull()
  })

  it('forcing the rainy season writes through to the UI store, and back to auto', () => {
    render(<DebugMenu />)
    const row = screen.getByText(en.debug.season).closest('label')
    const sel = row?.querySelector('select') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: '1' } })
    expect(useUi.getState().seasonWetnessOverride).toBe(1)
    fireEvent.change(sel, { target: { value: '0' } })
    expect(useUi.getState().seasonWetnessOverride).toBe(0)
    fireEvent.change(sel, { target: { value: 'auto' } })
    expect(useUi.getState().seasonWetnessOverride).toBeNull()
  })

  it('the weather-strength field edits the balance value, clamped to 0..1', () => {
    render(<DebugMenu />)
    const row = screen.getByText(en.debug.seasonStrength).closest('label')
    const input = row?.querySelector('input[type="number"]') as HTMLInputElement
    expect(Number(input.value)).toBe(1)
    fireEvent.change(input, { target: { value: '0.4' } })
    expect(balance.season.weatherStrength).toBeCloseTo(0.4)
    fireEvent.change(input, { target: { value: '9' } })
    expect(balance.season.weatherStrength).toBe(1)
    balance.season.weatherStrength = 1
  })
})


describe('DebugMenu renderer row and dropdown selectors (enrichments.mjs)', () => {
  it('shows the read-only renderer row with the active backend', () => {
    render(<DebugMenu />)
    expect(screen.getByText(en.debug.renderer)).toBeInTheDocument()
    // The backend value depends on the live render backend, absent in jsdom
    // (webglFallback defaults to false → WebGPU); assert the row shows one of
    // the two labels rather than a specific one.
    const rendererRow = screen.getByText(en.debug.renderer).closest('label')
    expect(rendererRow?.textContent).toMatch(/WebGPU|WebGL 2/)
  })

  it('offers at least three dropdown selectors (jump-to / equipment / gift)', () => {
    render(<DebugMenu />)
    expect(document.querySelectorAll('.debug-menu select').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(en.debug.jumpTo)).toBeInTheDocument()
    expect(screen.getByText(en.debug.addEquipment)).toBeInTheDocument()
    expect(screen.getByText(en.debug.addGift)).toBeInTheDocument()
  })

  it('the equipment and gift dropdowns list their items', () => {
    render(<DebugMenu />)
    // Equipment select carries a machete option; gift select a copper option.
    expect(selectWithOption('machete')).toBeDefined()
    expect(selectWithOption('copper')).toBeDefined()
  })
})

describe('DebugMenu jump-to covers every named map point (design.md §21.3, point 98)', () => {
  const jumpSelect = () => selectWithOption('kilimanjaro') as HTMLSelectElement
  const groupLabels = () => [...jumpSelect().querySelectorAll('optgroup')].map((g) => g.label)
  const optionsOf = (groupLabel: string) => {
    const grp = [...jumpSelect().querySelectorAll('optgroup')].find((g) => g.label === groupLabel)
    return [...(grp?.querySelectorAll('option') ?? [])].map((o) => o.textContent ?? '')
  }

  it('offers a named entry from every category plus the graveyard and grave', () => {
    render(<DebugMenu />)
    const values = [...jumpSelect().options].map((o) => o.value)
    for (const v of ['cairo', 'nubian-village', 'giza', 'kilimanjaro', 'victoria-falls', 'lake-victoria', 'meroe', 'ngorongoro', '#graveyard', '#grave']) {
      expect(values, v).toContain(v)
    }
  })

  it('groups the entries into optgroups in the fixed category order', () => {
    render(<DebugMenu />)
    expect(groupLabels()).toEqual([
      en.debug.jumpGroups.ports,
      en.debug.jumpGroups.villages,
      en.debug.jumpGroups.monuments,
      en.debug.jumpGroups.mountains,
      en.debug.jumpGroups.waterfalls,
      en.debug.jumpGroups.lakes,
      en.debug.jumpGroups.cultural,
      en.debug.jumpGroups.natural,
      en.debug.jumpGroups.other,
    ])
  })

  it('sorts each group alphabetically by localized name in English', () => {
    render(<DebugMenu />)
    const mountains = optionsOf(en.debug.jumpGroups.mountains)
    expect(mountains.length).toBeGreaterThan(1)
    expect([...mountains].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(mountains)
  })

  it('sorts each group alphabetically by localized name in German', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    const lakes = optionsOf(de.debug.jumpGroups.lakes)
    expect(lakes.length).toBeGreaterThan(1)
    expect([...lakes].sort((a, b) => a.localeCompare(b, 'de'))).toEqual(lakes)
  })

  it('jumps to the picked point coordinates', () => {
    render(<DebugMenu />)
    fireEvent.change(jumpSelect(), { target: { value: 'kilimanjaro' } })
    const k = MOUNTAINS.find((m) => m.id === 'kilimanjaro')!
    const expected = latLonToWorld(k.lat, k.lon)
    const pos = useGame.getState().pos
    expect(pos.x).toBeCloseTo(expected.x, 4)
    expect(pos.z).toBeCloseTo(expected.z, 4)
  })

  it('ENTERS an enterable target: a picked village lands in the first-person view (point 299)', () => {
    render(<DebugMenu />)
    fireEvent.change(jumpSelect(), { target: { value: 'maasai-village' } })
    expect(useGame.getState().mode).toBe('place')
    expect(useGame.getState().placeId).toBe('maasai-village')
    // The bird's-eye position is set too, so leaving puts the traveller where
    // the jump landed him rather than back at the old spot.
    const v = placeById('maasai-village')
    const expected = latLonToWorld(v.lat, v.lon)
    useGame.getState().leavePlace()
    const pos = useGame.getState().pos
    expect(Math.hypot(pos.x - expected.x, pos.z - expected.z)).toBeLessThan(balance.placeEnterRadius + 1)
  })

  it('leaves a non-enterable target a bird\'s-eye jump (a mountain stays in travel)', () => {
    render(<DebugMenu />)
    fireEvent.change(jumpSelect(), { target: { value: 'kilimanjaro' } })
    expect(useGame.getState().mode).toBe('travel')
    expect(useGame.getState().placeId).toBeNull()
  })

  it('jumps to the grave, resolved at pick time from the per-run placeholder (point 173)', () => {
    render(<DebugMenu />)
    fireEvent.change(jumpSelect(), { target: { value: '#grave' } })
    const grave = useGame.getState().graveLatLon
    const expected = latLonToWorld(grave.lat, grave.lon)
    const pos = useGame.getState().pos
    expect(pos.x).toBeCloseTo(expected.x, 4)
    expect(pos.z).toBeCloseTo(expected.z, 4)
  })
})

// --- The event-trigger dropdown (design.md §21.3, point 258) ----------------
// The §19.8/§19.16 wildlife dramas, the §14 random events and the §11 hazard
// fired on demand, in the jump-to dropdown's grouped + alphabetically sorted
// structure. The staged dramas themselves need the travel scene; asserted here
// is the wiring — grouping, localization, dispatch and the missing-precondition
// toast that keeps a trigger from ever being a silent no-op.
describe('DebugMenu event-trigger dropdown (design.md §21.3, point 258)', () => {
  const stageSelect = () => selectWithOption(`${DRAMA_PREFIX}grassFire`) as HTMLSelectElement
  const stageGroupLabels = () => [...stageSelect().querySelectorAll('optgroup')].map((g) => g.label)
  const stageOptionsOf = (groupLabel: string) => {
    const grp = [...stageSelect().querySelectorAll('optgroup')].find((g) => g.label === groupLabel)
    return [...(grp?.querySelectorAll('option') ?? [])].map((o) => o.textContent ?? '')
  }

  afterEach(() => setWildlifeDramaTrigger(null))

  it('carries its own labelled selector beside the existing dropdowns', () => {
    render(<DebugMenu />)
    expect(screen.getByText(en.debug.stageEvent)).toBeInTheDocument()
    expect(stageSelect()).toBeDefined()
  })

  it('groups the entries by category in the fixed order', () => {
    render(<DebugMenu />)
    expect(stageGroupLabels()).toEqual([
      en.debug.stageGroups.wildlife,
      en.debug.stageGroups.random,
      en.debug.stageGroups.hazards,
    ])
  })

  it('offers every wildlife drama, every random event and the mountain fall', () => {
    render(<DebugMenu />)
    const values = [...stageSelect().options].map((o) => o.value)
    for (const k of WILDLIFE_DRAMA_KINDS) expect(values, k).toContain(`${DRAMA_PREFIX}${k}`)
    for (const k of EVENT_KINDS) expect(values, k).toContain(`${EVENT_PREFIX}${k}`)
    expect(values).toContain(`${HAZARD_PREFIX}mountainFall`)
  })

  it('sorts each group alphabetically by localized name in English', () => {
    render(<DebugMenu />)
    const dramas = stageOptionsOf(en.debug.stageGroups.wildlife)
    expect(dramas.length).toBeGreaterThan(1)
    expect(dramas).toContain(en.debug.dramaNames.grassFire)
    expect([...dramas].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(dramas)
  })

  it('renders localized labels and sorts alphabetically in German', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    expect(screen.getByText(de.debug.stageEvent)).toBeInTheDocument()
    expect(stageGroupLabels()).toEqual([
      de.debug.stageGroups.wildlife,
      de.debug.stageGroups.random,
      de.debug.stageGroups.hazards,
    ])
    const dramas = stageOptionsOf(de.debug.stageGroups.wildlife)
    expect(dramas).toContain(de.debug.dramaNames.grassFire)
    expect([...dramas].sort((a, b) => a.localeCompare(b, 'de'))).toEqual(dramas)
  })

  it('dispatches the picked drama to the registered scene trigger', () => {
    const staged: string[] = []
    setWildlifeDramaTrigger((k) => {
      staged.push(k)
      return null
    })
    render(<DebugMenu />)
    fireEvent.change(stageSelect(), { target: { value: `${DRAMA_PREFIX}crocodileAmbush` } })
    expect(staged).toEqual(['crocodileAmbush'])
    expect(useGame.getState().toast).toBeNull()
  })

  it('toasts the missing precondition instead of failing silently', () => {
    setWildlifeDramaTrigger(() => 'noWater')
    render(<DebugMenu />)
    fireEvent.change(stageSelect(), { target: { value: `${DRAMA_PREFIX}crocodileAmbush` } })
    expect(useGame.getState().toast).toBe(en.debug.stageFailures.noWater)
  })

  it('toasts the missing precondition in German too', () => {
    useLocale.getState().setLang('de')
    setWildlifeDramaTrigger(() => 'noSavanna')
    render(<DebugMenu />)
    fireEvent.change(stageSelect(), { target: { value: `${DRAMA_PREFIX}grassFire` } })
    expect(useGame.getState().toast).toBe(de.debug.stageFailures.noSavanna)
  })

  it('says so when no travel scene is mounted (no registered trigger)', () => {
    render(<DebugMenu />)
    fireEvent.change(stageSelect(), { target: { value: `${DRAMA_PREFIX}grassFire` } })
    expect(useGame.getState().toast).toBe(en.debug.stageFailures.noScene)
  })

  it('fires a §14 random event through the store trigger', () => {
    render(<DebugMenu />)
    const before = useGame.getState().journal.length
    fireEvent.change(stageSelect(), { target: { value: `${EVENT_PREFIX}snakeBite` } })
    expect(useGame.getState().journal.length).toBeGreaterThan(before)
  })

  it('fires the ropeless mountain fall through the store trigger', () => {
    render(<DebugMenu />)
    const before = useGame.getState().journal.length
    fireEvent.change(stageSelect(), { target: { value: `${HAZARD_PREFIX}mountainFall` } })
    expect(useGame.getState().journal.length).toBeGreaterThan(before)
  })
})

// --- The menu's STRUCTURE (design.md §21.3, point 393) ----------------------
// The ~130 controls sit in named, collapsible groups under a filter field. The
// risk the restructuring carries is a control silently going missing, so the
// completeness test below is a PIN: it names every control and the group it
// belongs to, and compares that against what the menu actually renders — in
// both directions, so neither a dropped nor an unannounced control passes. It
// is the same shape as the QUALITY_PRESETS completeness gate.

/** Every control the menu owes, by group, as a dotted path into a dictionary. */
const EXPECTED_CONTROLS: Record<DebugGroupId, readonly string[]> = {
  movement: [
    'debug.walkSpeed', 'debug.strafeFactor', 'debug.placeCollisionFactor',
    'debug.mouseSensitivity', 'debug.lookPitchLimit',
    // The player's own escape from a wedge (work-order 604).
    'debug.unstuckStallDistance', 'debug.unstuckStallSeconds',
    'debug.unstuckSearchRadius', 'debug.unstuckSearchStep',
    'debug.invertLook', 'debug.wheelZoom',
    // The rebindable hold key for the §17.8 name labels (work-order 601).
    'debug.labelModifier',
  ],
  travel: [
    'debug.travelSpeed', 'debug.daysPerUnit', 'debug.canoeSpeedup', 'debug.junglePenalty',
    'debug.mountainPenalty', 'debug.oceanSwimMargin', 'debug.riverWidthFactor', 'debug.riverMouthSlackDeg',
  ],
  survival: [
    'debug.foodPerDay', 'debug.foodUnitDays', 'debug.foodDays', 'debug.canteenDrain',
    'debug.canteenDesertDrain', 'debug.canteenCapacity', 'debug.woundHealLight', 'debug.woundHealSevere',
    'debug.health', 'health.fever', 'health.sunblind', 'health.woundsSevere',
  ],
  wildlife: [
    'debug.stageEvent', 'debug.drownSeconds', 'debug.wetFlowFactor', 'debug.vigilPredatorDelay',
    'debug.rescueBurst', 'debug.calfFraction', 'debug.calfFollowRadius', 'debug.calfGambolRange',
    'debug.calfGambolBout', 'debug.juvenilePreyBias', 'debug.juvenileDrinkCrocBias',
    'debug.calfAdoptionRadius', 'debug.calfEscapeSeconds', 'debug.calfReunionSeconds',
    'debug.calfMourningSeconds',
    // Intraspecies combat (point 264).
    'debug.fightDispositionRate', 'debug.fightDispositionInterval', 'debug.fightSeekRadius',
    'debug.fightContactRadius', 'debug.fightDriveOffDistance', 'debug.fightApproachSeconds',
    'debug.fightClashSeconds', 'debug.fightClashIntensity', 'debug.fightApproachBurst', 'debug.fightQuarryFleeFactor',
    'debug.fightLethalityScale', 'debug.fightCooldownSeconds',
    'debug.crocStrikeRadius', 'debug.crocAmbushBankBand',
    'debug.crocMouthOffset', 'debug.crocDragSpeed', 'debug.crocDragSeconds', 'debug.crocGripSeconds',
    'debug.crocDriveOffRest', 'debug.huntLeaveOvertime', 'debug.waterCrossMax', 'debug.waterCrossChance',
    'debug.bloodStainSize', 'debug.bloodStainIrregularity',
  ],
  settlement: [
    'debug.walkerUnstuck', 'debug.edgeBandWidth', 'debug.edgeBandWander', 'debug.edgeBandStrength', 'debug.bankWadeDepth',
    'debug.separationRadius', 'debug.separationSlop', 'debug.separationStiffness',
    'debug.separationSpeed', 'debug.separationWedge',
    'debug.speechSyllable', 'debug.speechPhrasePause', 'debug.speechHearingRadius',
    'debug.speechHearingFalloff', 'debug.speechLabelSeconds', 'debug.speechLabelHeadroom',
    'debug.speechPitch', 'debug.speechPitchInterval',
    'debug.speechConceptLabels',
    'debug.tagChildCount', 'debug.tagSprintSpeed', 'debug.tagRunnerBoost', 'debug.tagTrotFactor',
    'debug.tagRecoverFactor', 'debug.tagFloorFactor', 'debug.tagDrain', 'debug.tagRecover',
    'debug.tagBreakOff', 'debug.tagResume', 'debug.tagPressure', 'debug.tagReach', 'debug.tagCommit',
    'debug.tagCatch', 'debug.tagSwitchMargin', 'debug.tagImmunity', 'debug.tagResolveCap',
    'debug.tagIdle', 'debug.tagTrendTau', 'debug.tagTrendEnter', 'debug.tagTrendLeave',
    'debug.tagVariation', 'debug.tagUnstuck', 'debug.tagSilence', 'debug.tagLean', 'debug.tagTurnRate',
    'debug.tagPlayRadius',
    'debug.childSpeechInterval', 'debug.childSpeechSpread', 'debug.childSpeechAction',
    'debug.childSpeechPace', 'debug.childSpeechRefusal', 'debug.childSpeechReply',
    'debug.childSpeechSilence',
    'debug.adultErrandInterval', 'debug.adultErrandSpread', 'debug.adultErrandDwell',
    'debug.adultErrandDig', 'debug.adultErrandLife', 'debug.adultErrandStall',
    'debug.adultErrandSilence', 'debug.adultErrandPace', 'debug.adultErrandCount',
  ],
  weather: ['debug.season', 'debug.seasonStrength', 'debug.wetGroundStrength', 'debug.foliageCollapse'],
  economy: [
    'debug.cash', 'debug.giftsTotal', 'debug.inventoryCapacity', 'debug.digRadius',
    'debug.goodwillForHint', 'debug.addEquipment', 'debug.addGift', 'debug.addTreasure',
  ],
  events: ['debug.randomEvents', 'debug.triggerEvent'],
  graphics: [
    'debug.detailLevel', 'debug.flatGround', 'debug.startupFreezeBudget', 'debug.labelOverlayMax',
    'debug.ambienceVolume',
    'debug.footstepVolume', 'debug.ambientVolume', 'debug.birdsongVolume', 'debug.speechVolume',
    'debug.surfNearRadius', 'debug.surfCutoff',
  ],
  jump: ['debug.jumpTo'],
  tools: [
    'debug.renderer', 'debug.benchmarkStart', 'debug.language', 'debug.fpsCounter',
    'debug.showHidden', 'debug.journalDnd',
  ],
}

/** Resolve a dotted label path against a language dictionary. */
function labelOf(dict: typeof en, path: string): string {
  const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict)
  if (typeof value !== 'string') throw new Error(`no label string at "${path}"`)
  return value
}

/** The group boxes the menu rendered, in order, with their row labels. */
function renderedGroups(): Array<{ title: string; open: boolean; labels: string[] }> {
  return [...document.querySelectorAll('.debug-menu .debug-group')].map((box) => {
    const head = box.querySelector('.debug-group-head') as HTMLButtonElement
    const body = box.querySelector('.debug-group-body') as HTMLElement
    const labels = [...body.children]
      .filter((el) => el.tagName === 'LABEL')
      .map((el) => el.querySelector('span')?.textContent ?? '')
    return {
      title: box.querySelector('.debug-group-title')?.textContent ?? '',
      open: head.getAttribute('aria-expanded') === 'true',
      labels,
    }
  })
}

/** Every control row currently in the menu (the filter row is not one). */
function renderedRowLabels(): string[] {
  return renderedGroups().flatMap((g) => g.labels)
}

/** The header button of the group with the given localized title. */
function groupHead(title: string): HTMLButtonElement {
  const head = [...document.querySelectorAll('.debug-menu .debug-group-head')].find(
    (b) => b.querySelector('.debug-group-title')?.textContent === title,
  )
  if (!head) throw new Error(`no group header "${title}"`)
  return head as HTMLButtonElement
}

function typeFilter(text: string): void {
  const input = document.querySelector('.debug-filter input') as HTMLInputElement
  fireEvent.change(input, { target: { value: text } })
}

describe('DebugMenu completeness: every control is present, in its group (point 393)', () => {
  const dicts = [['English', en], ['German', de]] as const

  it.each(dicts)('renders the groups in the fixed order — %s', (_name, dict) => {
    useLocale.getState().setLang(dict === de ? 'de' : 'en')
    render(<DebugMenu />)
    expect(renderedGroups().map((g) => g.title)).toEqual(
      DEBUG_GROUP_ORDER.map((id) => dict.debug.groups[id]),
    )
  })

  it.each(dicts)('renders EXACTLY the expected control set, group by group — %s', (_name, dict) => {
    useLocale.getState().setLang(dict === de ? 'de' : 'en')
    render(<DebugMenu />)
    const groups = renderedGroups()
    DEBUG_GROUP_ORDER.forEach((id, i) => {
      const expected = EXPECTED_CONTROLS[id].map((p) => labelOf(dict, p))
      // Set equality in BOTH directions: a dropped control fails, and so does
      // one added without being named here.
      expect(new Set(groups[i].labels), id).toEqual(new Set(expected))
      expect(groups[i].labels.length, id).toBe(expected.length)
    })
  })

  it('carries all 165 controls in total, and none twice', () => {
    render(<DebugMenu />)
    const labels = renderedRowLabels()
    const expected = DEBUG_GROUP_ORDER.flatMap((id) => EXPECTED_CONTROLS[id])
    expect(labels.length).toBe(expected.length)
    expect(labels.length).toBe(165)
    expect(new Set(labels).size).toBe(labels.length)
  })

  // Point 605: the speech level sat in the SETTLEMENT group while every other
  // level sat here, so a player who wanted the voices louder opened the sound
  // group, found no speech in it and reported that no such slider existed. The
  // rule that prevents the next one is not "speech is in graphics" but the
  // general one: a control whose effect is a volume lives with the volumes.
  it('keeps EVERY volume control in the graphics-and-sound group, and nowhere else (point 605)', () => {
    const isVolume = (path: string) => path.split('.').pop()?.endsWith('Volume') ?? false
    const volumes = DEBUG_GROUP_ORDER.flatMap((id) =>
      EXPECTED_CONTROLS[id].filter(isVolume).map((path) => ({ id, path })),
    )
    // The rule is worth nothing if it governs an empty set.
    expect(volumes.length).toBeGreaterThanOrEqual(5)
    expect(volumes.filter((v) => v.id !== 'graphics')).toEqual([])
    // …and the speech is one of them, by name — the control the report was about.
    expect(EXPECTED_CONTROLS.graphics).toContain('debug.speechVolume')
    // The expectation table is only a claim; the rendered menu is the fact. The
    // set-equality test above ties the two together, so asserting the rule here
    // and the rendering there proves it of the real menu.
    render(<DebugMenu />)
    const groups = renderedGroups()
    const graphics = groups[DEBUG_GROUP_ORDER.indexOf('graphics')]
    expect(graphics.labels).toContain(en.debug.speechVolume)
    for (const g of groups) {
      if (g === graphics) continue
      expect(g.labels, g.title).not.toContain(en.debug.speechVolume)
    }
  })

  // Its label must read as a volume, like its neighbours, in BOTH languages —
  // it is found by scanning the sound group for "volume"/"Lautstärke".
  it.each(dicts)('labels the speech level as a volume, in the wording family of its neighbours — %s', (_name, dict) => {
    const word = dict === de ? 'lautstärke' : 'volume'
    const neighbours = ['ambienceVolume', 'footstepVolume', 'ambientVolume', 'birdsongVolume'] as const
    for (const key of neighbours) expect(dict.debug[key].toLowerCase()).toContain(word)
    expect(dict.debug.speechVolume.toLowerCase()).toContain(word)
    // …and it still names the VILLAGE SPEECH, not a "voice" (point 577): the
    // journal read-aloud is the only other thing that speaks, and this is not it.
    expect(dict.debug.speechVolume.toLowerCase()).toContain(dict === de ? 'sprache' : 'speech')
  })

  it('gives every control a real input, select or button — no label without a control', () => {
    render(<DebugMenu />)
    const rows = [...document.querySelectorAll('.debug-menu .debug-group-body > label')]
    expect(rows.length).toBe(165)
    for (const row of rows) {
      const label = row.querySelector('span')?.textContent ?? '(none)'
      // The renderer row is the one deliberate read-only display (design.md §21.3).
      if (label === en.debug.renderer) continue
      expect(row.querySelector('input, select, button'), label).not.toBeNull()
    }
  })
})

describe('DebugMenu groups collapse and remember their state (point 393)', () => {
  it('starts with every group collapsed', () => {
    render(<DebugMenu />)
    const groups = renderedGroups()
    expect(groups.length).toBe(DEBUG_GROUP_ORDER.length)
    expect(groups.every((g) => !g.open)).toBe(true)
    for (const body of document.querySelectorAll('.debug-menu .debug-group-body')) {
      expect((body as HTMLElement).hidden).toBe(true)
    }
  })

  it('opens one group on its header click and leaves the others collapsed', () => {
    render(<DebugMenu />)
    fireEvent.click(groupHead(en.debug.groups.wildlife))
    expect(useUi.getState().debugGroupsOpen).toEqual(['wildlife'])
    const groups = renderedGroups()
    expect(groups.filter((g) => g.open).map((g) => g.title)).toEqual([en.debug.groups.wildlife])
  })

  it('closes an open group again on a second click', () => {
    render(<DebugMenu />)
    fireEvent.click(groupHead(en.debug.groups.economy))
    fireEvent.click(groupHead(en.debug.groups.economy))
    expect(useUi.getState().debugGroupsOpen).toEqual([])
    expect(renderedGroups().some((g) => g.open)).toBe(false)
  })

  it('remembers the opened group across a close/reopen of the whole menu', () => {
    const first = render(<DebugMenu />)
    fireEvent.click(groupHead(en.debug.groups.settlement))
    // F1 closes the menu (the component renders nothing), then opens it again.
    useUi.getState().toggleDebug()
    first.rerender(<DebugMenu />)
    expect(document.querySelector('.debug-menu')).toBeNull()
    useUi.getState().toggleDebug()
    first.rerender(<DebugMenu />)
    expect(renderedGroups().filter((g) => g.open).map((g) => g.title))
      .toEqual([en.debug.groups.settlement])
  })

  it('keeps a collapsed group\'s controls in the DOM, so nothing is unreachable', () => {
    render(<DebugMenu />)
    // Nothing opened: the whole set is still there (hidden), and a value still
    // writes through — the verify suites drive the controls this way.
    expect(renderedRowLabels().length).toBe(165)
    fireEvent.change(numberField(en.debug.travelSpeed), { target: { value: '9' } })
    expect(balance.travelSpeed).toBe(9)
    balance.travelSpeed = DEFAULTS.travelSpeed
  })

  it('names every group in German too', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    for (const id of DEBUG_GROUP_ORDER) {
      expect(screen.getByText(de.debug.groups[id]), id).toBeInTheDocument()
      expect(screen.queryByText(en.debug.groups[id]), id).toBeNull()
    }
  })
})

describe('DebugMenu filter narrows the whole menu (point 393)', () => {
  it('shows a labelled filter field above the groups', () => {
    render(<DebugMenu />)
    expect(screen.getByText(en.debug.filter)).toBeInTheDocument()
    const input = document.querySelector('.debug-filter input') as HTMLInputElement
    expect(input.placeholder).toBe(en.debug.filterHint)
  })

  it('narrows to the matching controls, across groups, regardless of collapse', () => {
    render(<DebugMenu />)
    typeFilter('canteen')
    const labels = renderedRowLabels()
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((l) => l.toLowerCase().includes('canteen'))).toBe(true)
    expect(labels).toContain(en.debug.canteenCapacity)
    // Only the groups that still hold a match are rendered, and they are open.
    expect(renderedGroups().every((g) => g.open && g.labels.length > 0)).toBe(true)
  })

  it('matches case-insensitively and leaves the remembered collapse alone', () => {
    render(<DebugMenu />)
    typeFilter('SURF')
    expect(renderedRowLabels()).toContain(en.debug.surfCutoff)
    expect(useUi.getState().debugGroupsOpen).toEqual([])
  })

  it('restores the full set — and the remembered collapse — when cleared', () => {
    render(<DebugMenu />)
    fireEvent.click(groupHead(en.debug.groups.tools))
    typeFilter('croc')
    expect(renderedRowLabels().length).toBeLessThan(149)
    typeFilter('')
    expect(renderedRowLabels().length).toBe(165)
    expect(renderedGroups().filter((g) => g.open).map((g) => g.title)).toEqual([en.debug.groups.tools])
  })

  it('says so when nothing matches instead of showing an empty menu', () => {
    render(<DebugMenu />)
    typeFilter('zzzz-no-such-control')
    expect(renderedGroups()).toEqual([])
    expect(screen.getByText(en.debug.filterEmpty)).toBeInTheDocument()
  })

  it('filters on the GERMAN labels once German is active', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    typeFilter('Fang')
    const labels = renderedRowLabels()
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((l) => l.toLowerCase().includes('fang'))).toBe(true)
    typeFilter('zzzz')
    expect(screen.getByText(de.debug.filterEmpty)).toBeInTheDocument()
  })

  it('a filtered control still writes through to balance', () => {
    render(<DebugMenu />)
    typeFilter('mouse')
    fireEvent.change(numberField(en.debug.mouseSensitivity), { target: { value: '0.004' } })
    expect(balance.mouseSensitivity).toBe(0.004)
  })
})

describe('matchesDebugFilter (pure)', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchesDebugFilter('Walk speed', '')).toBe(true)
    expect(matchesDebugFilter('Walk speed', '   ')).toBe(true)
  })

  it('matches a case-insensitive substring and rejects a non-match', () => {
    expect(matchesDebugFilter('Walk speed (in places)', 'SPEED')).toBe(true)
    expect(matchesDebugFilter('Walk speed (in places)', 'walk')).toBe(true)
    expect(matchesDebugFilter('Walk speed (in places)', 'crocodile')).toBe(false)
  })
})
