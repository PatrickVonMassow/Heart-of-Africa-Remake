// Debug menu (design.md §21, F1): runtime tuning of the balance values used
// by the POC plus the game-language selector (design.md §17.7: English is the
// default game language, German the alternative). Implemented only as far as
// the POC systems require (CLAUDE.md §8).
//
// STRUCTURE (design.md §21.3, point 393). The ~130 controls are not one flat
// run: each sits in a named, collapsible GROUP chosen by what a person is doing
// when he opens the menu — not by which balance object the value happens to
// live in. Every group starts collapsed; an opened one is remembered in the UI
// store for the session (`debugGroupsOpen`). A FILTER field at the top narrows
// the WHOLE menu to the controls whose label matches what is typed, across all
// groups at once, and clearing it restores the remembered collapse state.
//
// A collapsed group keeps its controls in the DOM (hidden), so the filter can
// search every label and an external driver (the verify suites) can still reach
// a control without first opening its group.

import { Fragment, useState, type ReactNode } from 'react'
import { balance } from '../config/balance'
import { clampWander } from '../render/edgeBand'
import { clampIrregularity } from '../render/groundStains'
import { refreshAmbienceVolume } from '../systems/ambience'
import { totalGifts, useGame, type EquipmentId } from '../state/store'
import { EVENT_KINDS, type EventKind } from '../systems/events'
import { debugEventGroups, fireDebugEvent, sortByLabel } from '../systems/debugEvents'
import { jumpTargetPlaceId } from '../systems/jumpTargets'
import { TREASURE_IDS, type TreasureId } from '../systems/economy'
import { useUi } from '../state/ui'
import type { DetailLevel } from '../config/quality'
import { startBenchmarkSafely } from '../systems/startBenchmark'
import { PLACES, type Material } from '../world/geo'
import {
  CULTURAL_LANDMARKS,
  ELEPHANT_GRAVEYARD,
  MOUNTAINS,
  NATURAL_SITES,
  WATERFALLS,
} from '../world/data/landmarks'
import { LAKES } from '../world/data/lakes'
import { DICTIONARIES, LANGUAGES, useLocale, useStrings } from '../i18n'
import type { Strings } from '../i18n/types'
import { DEBUG_GROUP_ORDER, matchesDebugFilter, type DebugGroupId } from './debugMenuGroups'

/** The debug-section keys whose value really is a plain label string (the
 *  section also holds a few nested groups). */
type DebugLabelKey = {
  [K in keyof Strings['debug']]: Strings['debug'][K] extends string ? K : never
}[keyof Strings['debug']]

/** One control row: the localized label the filter matches on, and its node. */
type DebugRow = { label: string; node: ReactNode }

const EQUIPMENT_IDS: EquipmentId[] = ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen', 'canoe']
const MATERIALS: Material[] = ['gold', 'silver', 'emerald', 'copper', 'ivory']

/** Labeled dropdown that fires an action on pick and snaps back to the placeholder. */
function ActionSelect({
  label,
  placeholder,
  options,
  onPick,
}: {
  label: string
  placeholder: string
  options: Array<{ value: string; label: string }>
  onPick: (value: string) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value)
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

/** Like ActionSelect but the options are split into <optgroup>s. */
function GroupedActionSelect({
  label,
  placeholder,
  groups,
  onPick,
}: {
  label: string
  placeholder: string
  groups: Array<{ label: string; options: Array<{ value: string; label: string }> }>
  onPick: (value: string) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value)
        }}
      >
        <option value="">{placeholder}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/**
 * Every calibratable value of the children's game of tag (design.md §19.10,
 * point 480/351), in the order the mechanic reads: how many play, the paces, the
 * reserve rates and its two thresholds, the distances the decisions turn on, and
 * the shaping values. A table rather than twenty hand-written fields — the
 * completeness is then visible at a glance, which is the point of the rule that
 * every balance value is debug-editable.
 */
const TAG_FIELDS: ReadonlyArray<{
  key: keyof typeof balance.villageLife.tag
  label: DebugLabelKey
  step: number
  min: number
  max?: number
}> = [
  { key: 'childCount', label: 'tagChildCount', step: 1, min: 0 },
  { key: 'sprintSpeed', label: 'tagSprintSpeed', step: 0.1, min: 0.1 },
  { key: 'runnerBoost', label: 'tagRunnerBoost', step: 0.02, min: 1 },
  { key: 'trotFactor', label: 'tagTrotFactor', step: 0.02, min: 0.01, max: 1 },
  { key: 'recoverFactor', label: 'tagRecoverFactor', step: 0.02, min: 0.01, max: 1 },
  { key: 'floorFactor', label: 'tagFloorFactor', step: 0.02, min: 0.01, max: 1 },
  { key: 'drainPerSecond', label: 'tagDrain', step: 0.02, min: 0 },
  { key: 'recoverPerSecond', label: 'tagRecover', step: 0.01, min: 0 },
  { key: 'breakOff', label: 'tagBreakOff', step: 0.05, min: 0, max: 1 },
  { key: 'resume', label: 'tagResume', step: 0.05, min: 0, max: 1 },
  { key: 'pressureDistance', label: 'tagPressure', step: 1, min: 0 },
  { key: 'chaseReach', label: 'tagReach', step: 1, min: 0 },
  { key: 'commitDistance', label: 'tagCommit', step: 0.5, min: 0 },
  { key: 'catchDistance', label: 'tagCatch', step: 0.1, min: 0 },
  { key: 'targetSwitchMargin', label: 'tagSwitchMargin', step: 0.5, min: 0 },
  { key: 'immunitySeconds', label: 'tagImmunity', step: 0.2, min: 0 },
  { key: 'resolveCapSeconds', label: 'tagResolveCap', step: 5, min: 1 },
  { key: 'idleSeconds', label: 'tagIdle', step: 1, min: 0 },
  { key: 'trendTau', label: 'tagTrendTau', step: 0.1, min: 0.05 },
  { key: 'trendEnter', label: 'tagTrendEnter', step: 0.02, min: 0 },
  { key: 'trendLeave', label: 'tagTrendLeave', step: 0.02, min: 0 },
  { key: 'variation', label: 'tagVariation', step: 0.05, min: 0, max: 0.9 },
  { key: 'unstuckSeconds', label: 'tagUnstuck', step: 0.5, min: 0.1 },
  { key: 'leanAtSprint', label: 'tagLean', step: 0.02, min: 0 },
  { key: 'turnRate', label: 'tagTurnRate', step: 0.2, min: 0.1 },
  { key: 'playRadius', label: 'tagPlayRadius', step: 1, min: 2 },
]

/**
 * Every calibratable value of what the children SAY at that game (work-order
 * point 481): how often a situation is staged, how long its following action
 * runs, and how readily a call is refused. Same table shape as the chase's, for
 * the same reason — the completeness is visible at a glance.
 */
const CHILD_SPEECH_FIELDS: ReadonlyArray<{
  key: keyof typeof balance.villageLife.childSpeech
  label: DebugLabelKey
  step: number
  min: number
  max?: number
}> = [
  { key: 'intervalSeconds', label: 'childSpeechInterval', step: 0.5, min: 0.5 },
  { key: 'intervalSpread', label: 'childSpeechSpread', step: 0.05, min: 0, max: 1 },
  { key: 'actionSeconds', label: 'childSpeechAction', step: 0.5, min: 0.5 },
  { key: 'actionPace', label: 'childSpeechPace', step: 0.1, min: 0.1 },
  { key: 'refusalChance', label: 'childSpeechRefusal', step: 0.05, min: 0, max: 1 },
  { key: 'replySeconds', label: 'childSpeechReply', step: 0.5, min: 0 },
]

/**
 * Every calibratable value of what the ADULTS do at their errands (work-order
 * point 483): how often one is staged, how long a villager stays where it was
 * sent, how long a bout of digging lasts, and how many villagers are out on
 * errands at all. Same table shape as the two above, for the same reason.
 */
const ADULT_ERRAND_FIELDS: ReadonlyArray<{
  key: keyof typeof balance.villageLife.adultErrands
  label: DebugLabelKey
  step: number
  min: number
  max?: number
}> = [
  { key: 'intervalSeconds', label: 'adultErrandInterval', step: 0.5, min: 0.5 },
  { key: 'intervalSpread', label: 'adultErrandSpread', step: 0.05, min: 0, max: 1 },
  { key: 'dwellSeconds', label: 'adultErrandDwell', step: 0.5, min: 0 },
  { key: 'digSeconds', label: 'adultErrandDig', step: 0.5, min: 0 },
  { key: 'errandSeconds', label: 'adultErrandLife', step: 5, min: 1 },
  { key: 'pace', label: 'adultErrandPace', step: 0.1, min: 0.1 },
  { key: 'villagerCount', label: 'adultErrandCount', step: 1, min: 0, max: 12 },
]

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={Number.isInteger(value) ? value : Number(value.toFixed(3))}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
      />
    </label>
  )
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function DebugMenu() {
  const t = useStrings()
  const lang = useLocale((s) => s.lang)
  const setLang = useLocale((s) => s.setLang)
  const open = useUi((s) => s.debugOpen)
  const groupsOpen = useUi((s) => s.debugGroupsOpen)
  const fpsVisible = useUi((s) => s.fpsVisible)
  const seasonWetnessOverride = useUi((s) => s.seasonWetnessOverride)
  const speechConceptLabels = useUi((s) => s.speechConceptLabels)
  const setSpeechConceptLabels = useUi((s) => s.setSpeechConceptLabels)
  // The graphics allow-flags (traa/ssao/shadowMapHalf/shadows/fireShadows) live
  // in the store but are no longer exposed in this menu (design.md §21.3, point
  // 276 correction) — the graphics section is a single detail-level dropdown.
  const detailLevel = useUi((s) => s.detailLevel)
  const groundDebugFlat = useUi((s) => s.groundDebugFlat)
  const seasonCollapseEnabled = useUi((s) => s.seasonCollapseEnabled)
  const invertLook = useUi((s) => s.invertLook)
  const wheelZoomEnabled = useUi((s) => s.wheelZoomEnabled)
  const webglFallback = useUi((s) => s.webglFallback)
  const journalDnd = useUi((s) => s.journalDnd)
  const bump = useGame((s) => s.bumpBalance)
  useGame((s) => s.balanceVersion)
  const game = useGame()
  const [filter, setFilter] = useState('')

  if (!open) return null

  // Jump-to targets (design.md §21.3, point 98): every NAMED map point,
  // grouped by category in a fixed order and sorted alphabetically by the
  // localized name within each group. `jumpCoords` resolves the picked value
  // back to coordinates; the tomb stays a placeholder resolved at pick time
  // (its position is per-run).
  const jumpCoords = new Map<string, { lat: number; lon: number }>()
  const namedGroup = <T,>(
    items: readonly T[],
    toEntry: (it: T) => { value: string; label: string; lat: number; lon: number },
  ) => {
    const options = items.map((it) => {
      const { value, label, lat, lon } = toEntry(it)
      jumpCoords.set(value, { lat, lon })
      return { value, label }
    })
    return sortByLabel(options, lang)
  }
  jumpCoords.set('#graveyard', { lat: ELEPHANT_GRAVEYARD.lat, lon: ELEPHANT_GRAVEYARD.lon })
  const jumpGroups = [
    { label: t.debug.jumpGroups.ports, options: namedGroup(PLACES.filter((p) => p.kind === 'port'), (p) => ({ value: p.id, label: t.places[p.id], lat: p.lat, lon: p.lon })) },
    { label: t.debug.jumpGroups.villages, options: namedGroup(PLACES.filter((p) => p.kind === 'village'), (p) => ({ value: p.id, label: t.places[p.id], lat: p.lat, lon: p.lon })) },
    { label: t.debug.jumpGroups.monuments, options: namedGroup(PLACES.filter((p) => p.kind === 'monument'), (p) => ({ value: p.id, label: t.places[p.id], lat: p.lat, lon: p.lon })) },
    { label: t.debug.jumpGroups.mountains, options: namedGroup(MOUNTAINS, (m) => ({ value: m.id, label: t.landmarks[m.id], lat: m.lat, lon: m.lon })) },
    { label: t.debug.jumpGroups.waterfalls, options: namedGroup(WATERFALLS, (w) => ({ value: w.id, label: t.landmarks[w.id], lat: w.lat, lon: w.lon })) },
    { label: t.debug.jumpGroups.lakes, options: namedGroup(LAKES, (l) => ({ value: l.id, label: t.landmarks[l.id], lat: l.center[1], lon: l.center[0] })) },
    { label: t.debug.jumpGroups.cultural, options: namedGroup(CULTURAL_LANDMARKS, (c) => ({ value: c.id, label: t.landmarks[c.id], lat: c.lat, lon: c.lon })) },
    { label: t.debug.jumpGroups.natural, options: namedGroup(NATURAL_SITES, (n) => ({ value: n.id, label: t.landmarks[n.id], lat: n.lat, lon: n.lon })) },
    {
      label: t.debug.jumpGroups.other,
      options: sortByLabel(
        [
          { value: '#graveyard', label: t.landmarks['elephant-graveyard'] },
          { value: '#grave', label: t.debug.grave },
        ],
        lang,
      ),
    },
  ]

  // Event-trigger targets (design.md §21.3, point 258): the §19.8/§19.16
  // wildlife dramas, the §14 random events and the §11 traveller hazards, in
  // the jump-to dropdown's grouped + alphabetically sorted structure.
  const stageGroups = debugEventGroups(
    {
      groups: t.debug.stageGroups,
      drama: t.debug.dramaNames,
      event: t.debug.eventNames,
      hazard: t.debug.hazardNames,
    },
    lang,
  )

  const set = <K extends keyof typeof balance>(key: K, v: (typeof balance)[K]) => {
    balance[key] = v
    bump()
  }

  // --- Row builders -------------------------------------------------------
  const num = (label: string, value: number, onChange: (v: number) => void, step?: number): DebugRow => ({
    label,
    node: <NumberField label={label} value={value} onChange={onChange} step={step} />,
  })
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void): DebugRow => ({
    label,
    node: <CheckField label={label} checked={checked} onChange={onChange} />,
  })
  const custom = (label: string, node: ReactNode): DebugRow => ({ label, node })

  const tableRows = <T extends { label: DebugLabelKey; step: number; min: number; max?: number }>(
    fields: readonly T[],
    read: (f: T) => number,
    write: (f: T, v: number) => void,
  ): DebugRow[] =>
    fields.map((f) =>
      num(t.debug[f.label], read(f), (v) => {
        write(f, Math.min(f.max ?? Infinity, Math.max(f.min, v)))
        bump()
      }, f.step),
    )

  // --- The groups ---------------------------------------------------------
  // Assignment rule (design.md §21.3): a value sits where a person TUNING it
  // would look, not where its balance object lives.
  const groupRows: Record<DebugGroupId, DebugRow[]> = {
    movement: [
      num(t.debug.walkSpeed, balance.placeWalkSpeed, (v) => set('placeWalkSpeed', v), 0.5),
      num(t.debug.strafeFactor, balance.placeStrafeFactor, (v) => set('placeStrafeFactor', Math.max(0, v)), 0.05),
      // Settlement collision (design.md §11): a SHARE of the enter radius, so
      // the "Space to enter" prompt can never arm inside the collider — 1 is
      // the ceiling the resolver clamps to anyway.
      num(t.debug.placeCollisionFactor, balance.placeCollisionFactor,
        (v) => set('placeCollisionFactor', Math.max(0, Math.min(1, v))), 0.05),
      num(t.debug.mouseSensitivity, balance.mouseSensitivity, (v) => set('mouseSensitivity', Math.max(0, v)), 0.0002),
      // Vertical look (design.md §17.5/§21.2, point 392): the clamp in degrees
      // from the horizon, and the inversion — checked by default.
      num(t.debug.lookPitchLimit, balance.lookPitchLimitDeg, (v) => set('lookPitchLimitDeg', Math.max(0, v)), 5),
      check(t.debug.invertLook, invertLook, (v) => useUi.getState().setInvertLook(v)),
      // The §21.4 zoom unlock is a control, not a graphics setting.
      check(t.debug.wheelZoom, wheelZoomEnabled, (v) => useUi.getState().setWheelZoomEnabled(v)),
    ],
    travel: [
      num(t.debug.travelSpeed, balance.travelSpeed, (v) => set('travelSpeed', v), 0.5),
      num(t.debug.daysPerUnit, balance.daysPerUnit, (v) => set('daysPerUnit', Math.max(0, v)), 0.05),
      num(t.debug.canoeSpeedup, balance.canoeSpeedup, (v) => set('canoeSpeedup', Math.max(1, v)), 0.25),
      num(t.debug.junglePenalty, balance.junglePenalty, (v) => set('junglePenalty', Math.max(1, v)), 0.1),
      num(t.debug.mountainPenalty, balance.mountainPenalty, (v) => set('mountainPenalty', Math.max(1, v)), 0.1),
      num(t.debug.oceanSwimMargin, balance.oceanSwimMarginDeg, (v) => set('oceanSwimMarginDeg', Math.max(0, v)), 0.1),
      // The waters the journey crosses belong with the journey, not with the
      // traveller's canteen. Build-time values (ribbon/bed/mask geometry are
      // module singletons): the edit persists in balance and applies on the
      // next reload.
      num(t.debug.riverWidthFactor, balance.river.widthFactor,
        (v) => { balance.river.widthFactor = Math.max(0.5, v); bump() }, 0.1),
      num(t.debug.riverMouthSlackDeg, balance.river.mouthSlackDeg,
        (v) => { balance.river.mouthSlackDeg = Math.max(0, v); bump() }, 0.1),
    ],
    survival: [
      num(t.debug.foodPerDay, balance.foodPerDay, (v) => set('foodPerDay', Math.max(0, v))),
      num(t.debug.foodUnitDays, balance.foodUnitDays, (v) => set('foodUnitDays', Math.max(1, v)), 1),
      num(t.debug.foodDays, game.foodDays, (v) => game.debugSet({ foodDays: Math.max(0, v) }), 7),
      num(t.debug.canteenDrain, balance.health.canteenDrainPerDay,
        (v) => { balance.health.canteenDrainPerDay = Math.max(0, v); bump() }, 0.1),
      num(t.debug.canteenDesertDrain, balance.health.canteenDesertDrainPerDay,
        (v) => { balance.health.canteenDesertDrainPerDay = Math.max(0, v); bump() }, 0.1),
      num(t.debug.canteenCapacity, balance.health.canteenCapacity,
        (v) => { balance.health.canteenCapacity = Math.max(1, v); bump() }, 100),
      num(t.debug.woundHealLight, balance.health.woundHealLightDays,
        (v) => { balance.health.woundHealLightDays = Math.max(0.5, v); bump() }, 1),
      num(t.debug.woundHealSevere, balance.health.woundHealSevereDays,
        (v) => { balance.health.woundHealSevereDays = Math.max(0.5, v); bump() }, 1),
      num(t.debug.health, Math.round(game.health),
        (v) => game.debugSet({ health: Math.max(0, Math.min(balance.health.max, v)) }), 10),
      check(t.health.fever, game.afflictions.fever, (v) => game.debugSetAffliction('fever', v)),
      check(t.health.sunblind, game.afflictions.sunblind, (v) => game.debugSetAffliction('sunblind', v)),
      check(t.health.woundsSevere, game.afflictions.wounds === 2,
        (v) => game.debugSetAffliction('wounds', v ? 2 : 0)),
    ],
    wildlife: [
      // The staging dropdown lives here rather than under the random events:
      // it is the ONLY way to watch a §19.8/§19.16 drama, which is what a
      // person opening this group came for.
      custom(t.debug.stageEvent, (
        <GroupedActionSelect
          label={t.debug.stageEvent}
          placeholder={t.debug.choose}
          groups={stageGroups}
          onPick={(v) => {
            const missing = fireDebugEvent(v, {
              randomEvent: (k: EventKind) => game.debugTriggerEvent(k),
              mountainFall: () => game.debugTriggerMountainFall(),
            })
            // Never a silent no-op: an unmeetable precondition says what is
            // missing (design.md §21.3).
            if (missing) game.setToast(t.debug.stageFailures[missing])
          }}
        />
      )),
      num(t.debug.drownSeconds, balance.waterDrama.drownSeconds,
        (v) => { balance.waterDrama.drownSeconds = Math.max(1, v); bump() }, 5),
      num(t.debug.wetFlowFactor, balance.waterDrama.wetFlowFactor,
        (v) => { balance.waterDrama.wetFlowFactor = Math.max(0, v); bump() }, 0.1),
      num(t.debug.vigilPredatorDelay, balance.vigil.predatorDelay,
        (v) => { balance.vigil.predatorDelay = Math.max(0, v); bump() }, 1),
      num(t.debug.rescueBurst, balance.family.rescueBurst,
        (v) => { balance.family.rescueBurst = Math.max(1, v); bump() }, 0.1),
      num(t.debug.calfFraction, balance.family.calfFraction,
        (v) => { balance.family.calfFraction = Math.max(0, Math.min(1, v)); bump() }, 0.05),
      num(t.debug.calfFollowRadius, balance.family.followRadius,
        (v) => { balance.family.followRadius = Math.max(0.5, v); bump() }, 0.2),
      num(t.debug.calfGambolRange, balance.family.gambolRange,
        (v) => { balance.family.gambolRange = Math.max(0.5, v); bump() }, 0.5),
      num(t.debug.calfGambolBout, balance.family.gambolBoutSeconds,
        (v) => { balance.family.gambolBoutSeconds = Math.max(0.5, v); bump() }, 0.5),
      // Juvenile-prey preferences (design.md §19.8, point 245).
      num(t.debug.juvenilePreyBias, balance.family.juvenilePreyBias,
        (v) => { balance.family.juvenilePreyBias = Math.max(0, Math.min(1, v)); bump() }, 0.05),
      num(t.debug.juvenileDrinkCrocBias, balance.family.juvenileDrinkCrocBias,
        (v) => { balance.family.juvenileDrinkCrocBias = Math.max(1, v); bump() }, 0.5),
      num(t.debug.calfAdoptionRadius, balance.family.adoptionRadius,
        (v) => { balance.family.adoptionRadius = Math.max(0, v); bump() }, 1),
      num(t.debug.calfEscapeSeconds, balance.family.escapeSeconds,
        (v) => { balance.family.escapeSeconds = Math.max(0, v); bump() }, 0.5),
      num(t.debug.calfReunionSeconds, balance.family.reunionSeconds,
        (v) => { balance.family.reunionSeconds = Math.max(0, v); bump() }, 1),
      num(t.debug.calfMourningSeconds, balance.family.mourningSeconds,
        (v) => { balance.family.mourningSeconds = Math.max(0, v); bump() }, 1),
      // Intraspecies combat (design.md §19.17, point 264).
      num(t.debug.fightDispositionRate, balance.fight.dispositionRate,
        (v) => { balance.fight.dispositionRate = Math.max(0, Math.min(1, v)); bump() }, 0.005),
      num(t.debug.fightDispositionInterval, balance.fight.dispositionInterval,
        (v) => { balance.fight.dispositionInterval = Math.max(0.5, v); bump() }, 1),
      num(t.debug.fightSeekRadius, balance.fight.seekRadius,
        (v) => { balance.fight.seekRadius = Math.max(1, v); bump() }, 2),
      num(t.debug.fightContactRadius, balance.fight.contactRadius,
        (v) => { balance.fight.contactRadius = Math.max(0.5, v); bump() }, 0.2),
      num(t.debug.fightDriveOffDistance, balance.fight.driveOffDistance,
        (v) => { balance.fight.driveOffDistance = Math.max(1, v); bump() }, 2),
      num(t.debug.fightApproachSeconds, balance.fight.approachSeconds,
        (v) => { balance.fight.approachSeconds = Math.max(1, v); bump() }, 1),
      num(t.debug.fightClashSeconds, balance.fight.clashSeconds,
        (v) => { balance.fight.clashSeconds = Math.max(0.5, v); bump() }, 0.5),
      num(t.debug.fightClashIntensity, balance.fight.clashIntensity,
        (v) => { balance.fight.clashIntensity = Math.max(0, v); bump() }, 0.1),
      num(t.debug.fightApproachBurst, balance.fight.approachBurst,
        (v) => { balance.fight.approachBurst = Math.max(1, v); bump() }, 0.1),
      num(t.debug.fightQuarryFleeFactor, balance.fight.quarryFleeFactor,
        (v) => { balance.fight.quarryFleeFactor = Math.max(0.1, Math.min(1, v)); bump() }, 0.05),
      num(t.debug.fightLethalityScale, balance.fight.lethalityScale,
        (v) => { balance.fight.lethalityScale = Math.max(0, v); bump() }, 0.1),
      num(t.debug.fightCooldownSeconds, balance.fight.cooldownSeconds,
        (v) => { balance.fight.cooldownSeconds = Math.max(0, v); bump() }, 5),
      num(t.debug.crocStrikeRadius, balance.crocodile.strikeRadius,
        (v) => { balance.crocodile.strikeRadius = Math.max(0.5, v); bump() }, 0.5),
      num(t.debug.crocAmbushBankBand, balance.crocodile.ambushBankBand,
        (v) => { balance.crocodile.ambushBankBand = Math.max(0, v); bump() }, 0.5),
      num(t.debug.crocMouthOffset, balance.crocodile.mouthOffsetLocal,
        (v) => { balance.crocodile.mouthOffsetLocal = Math.max(0, v); bump() }, 0.05),
      num(t.debug.crocDragSpeed, balance.crocodile.dragSpeed,
        (v) => { balance.crocodile.dragSpeed = Math.max(0.5, v); bump() }, 0.5),
      num(t.debug.crocDragSeconds, balance.crocodile.dragSeconds,
        (v) => { balance.crocodile.dragSeconds = Math.max(0.5, v); bump() }, 0.5),
      num(t.debug.crocGripSeconds, balance.crocodile.gripSeconds,
        (v) => { balance.crocodile.gripSeconds = Math.max(0.5, v); bump() }, 0.5),
      num(t.debug.crocDriveOffRest, balance.crocodile.driveOffRestSeconds,
        (v) => { balance.crocodile.driveOffRestSeconds = Math.max(0, v); bump() }, 1),
      num(t.debug.huntLeaveOvertime, balance.hunt.leaveOvertimeSeconds,
        (v) => { balance.hunt.leaveOvertimeSeconds = Math.max(5, v); bump() }, 5),
      num(t.debug.waterCrossMax, balance.waterCross.maxUnits,
        (v) => { balance.waterCross.maxUnits = Math.max(0, v); bump() }, 1),
      num(t.debug.waterCrossChance, balance.waterCross.chance,
        (v) => { balance.waterCross.chance = Math.max(0, Math.min(1, v)); bump() }, 0.05),
      // The feeding stain the kill leaves on the ground (design.md §19.5).
      num(t.debug.bloodStainSize, balance.bloodStain.sizeScale,
        (v) => { balance.bloodStain.sizeScale = Math.max(0, v); bump() }, 0.1),
      num(t.debug.bloodStainIrregularity, balance.bloodStain.irregularity,
        (v) => { balance.bloodStain.irregularity = clampIrregularity(v); bump() }, 0.05),
    ],
    // The village-life levers (chase, children's speech, adult errands) have
    // no home among the §21.3 categories, and they are neither wildlife nor
    // movement — a person tuning them is watching a SETTLEMENT.
    settlement: [
      num(t.debug.walkerUnstuck, balance.walkerUnstuckSeconds,
        (v) => set('walkerUnstuckSeconds', Math.max(0.5, v)), 1),
      // The settlement edge painted on the ground (design.md §2.6).
      num(t.debug.edgeBandWidth, balance.placeEdgeBand.widthM,
        (v) => { balance.placeEdgeBand.widthM = Math.max(0.2, v); bump() }, 0.5),
      num(t.debug.edgeBandWander, balance.placeEdgeBand.wanderM,
        (v) => { balance.placeEdgeBand.wanderM = clampWander(v, balance.placeEdgeBand.widthM); bump() }, 0.1),
      num(t.debug.edgeBandStrength, balance.placeEdgeBand.strength,
        (v) => { balance.placeEdgeBand.strength = Math.max(0, Math.min(1, v)); bump() }, 0.1),
      // How far into a settlement's river the traveller wades before the
      // bird's-eye view takes the river over (work-order 584). It moves the
      // walkable region on the water, so the layout is rebuilt with it.
      num(t.debug.bankWadeDepth, balance.bankWadeDepth,
        (v) => { balance.bankWadeDepth = Math.max(0, v); bump() }, 0.1),
      // Village speech (design.md §13.4/§21.2): the pace of the syllables, the
      // pause between the atoms of a phrase and the short, sharply falling
      // hearing range.
      num(t.debug.speechSyllable, balance.communication.syllableSeconds,
        (v) => { balance.communication.syllableSeconds = Math.max(0.05, v); bump() }, 0.05),
      num(t.debug.speechPhrasePause, balance.communication.phrasePauseSeconds,
        (v) => { balance.communication.phrasePauseSeconds = Math.max(0, v); bump() }, 0.1),
      num(t.debug.speechHearingRadius, balance.communication.hearingRadius,
        (v) => { balance.communication.hearingRadius = Math.max(0, v); bump() }, 1),
      num(t.debug.speechHearingFalloff, balance.communication.hearingFalloff,
        (v) => { balance.communication.hearingFalloff = Math.max(0, v); bump() }, 2),
      // How long the player's reading stands over the speaker's head (point 485).
      num(t.debug.speechLabelSeconds, balance.communication.labelSeconds,
        (v) => { balance.communication.labelSeconds = Math.max(0, v); bump() }, 0.2),
      // DEBUG VIEW (user 09.08.2026): the concept behind each utterance instead
      // of its syllables and the player's guess — and every speaker labelled,
      // not only the ones already heard. It answers "did that situation stage
      // the concept it meant to?", which no in-game view may ever answer.
      check(t.debug.speechConceptLabels, speechConceptLabels, setSpeechConceptLabels),
      // The children's game of tag (design.md §19.10, point 480/351).
      ...tableRows(TAG_FIELDS, (f) => balance.villageLife.tag[f.key], (f, v) => { balance.villageLife.tag[f.key] = v }),
      // What the children SAY at that game (point 481).
      ...tableRows(CHILD_SPEECH_FIELDS, (f) => balance.villageLife.childSpeech[f.key],
        (f, v) => { balance.villageLife.childSpeech[f.key] = v }),
      // What the ADULTS do at their errands (point 483).
      ...tableRows(ADULT_ERRAND_FIELDS, (f) => balance.villageLife.adultErrands[f.key],
        (f, v) => { balance.villageLife.adultErrands[f.key] = v }),
    ],
    weather: [
      custom(t.debug.season, (
        <label>
          <span>{t.debug.season}</span>
          <select
            value={seasonWetnessOverride === null ? 'auto' : String(seasonWetnessOverride)}
            onChange={(e) => {
              const v = e.target.value
              useUi.getState().setSeasonWetnessOverride(v === 'auto' ? null : Number(v))
            }}
          >
            <option value="auto">{t.debug.seasonAuto}</option>
            <option value="0">{t.debug.seasonDry}</option>
            <option value="0.5">{t.debug.seasonMid}</option>
            <option value="1">{t.debug.seasonWet}</option>
          </select>
        </label>
      )),
      num(t.debug.seasonStrength, balance.season.weatherStrength,
        (v) => { balance.season.weatherStrength = Math.max(0, Math.min(1, v)); bump() }, 0.1),
      num(t.debug.wetGroundStrength, balance.season.wetGroundStrength,
        (v) => { balance.season.wetGroundStrength = Math.max(0, Math.min(1, v)); bump() }, 0.1),
      // The dry-season crown collapse (§19.13): a SEASON switch, even though
      // it isolates a rendering half — it is the season a tester is forcing.
      check(t.debug.foliageCollapse, seasonCollapseEnabled,
        (v) => useUi.getState().setSeasonCollapseEnabled(v)),
    ],
    economy: [
      num(t.debug.cash, game.money, (v) => game.debugSet({ money: v }), 10),
      num(t.debug.giftsTotal, totalGifts(game.gifts), (v) => game.debugSetGiftTotal(v), 1),
      num(t.debug.inventoryCapacity, balance.inventoryCapacity,
        (v) => set('inventoryCapacity', Math.max(1, Math.round(v))), 1),
      // What is dug up and what a hint costs are the other half of the trade.
      num(t.debug.digRadius, balance.digRadius, (v) => set('digRadius', v), 0.5),
      num(t.debug.goodwillForHint, balance.goodwillForHint, (v) => set('goodwillForHint', v), 1),
      custom(t.debug.addEquipment, (
        <ActionSelect
          label={t.debug.addEquipment}
          placeholder={t.debug.choose}
          options={EQUIPMENT_IDS.map((e) => ({ value: e, label: t.equipment[e] }))}
          onPick={(v) => game.debugAddEquipment(v as EquipmentId)}
        />
      )),
      custom(t.debug.addGift, (
        <ActionSelect
          label={t.debug.addGift}
          placeholder={t.debug.choose}
          options={MATERIALS.map((m) => ({ value: m, label: t.gifts[m] }))}
          onPick={(v) => game.debugAddGift(v as Material)}
        />
      )),
      custom(t.debug.addTreasure, (
        <ActionSelect
          label={t.debug.addTreasure}
          placeholder={t.debug.choose}
          options={TREASURE_IDS.map((id) => ({ value: id, label: t.treasures[id] }))}
          onPick={(v) => game.debugAddTreasure(v as TreasureId)}
        />
      )),
    ],
    events: [
      check(t.debug.randomEvents, balance.randomEventsEnabled, (v) => set('randomEventsEnabled', v)),
      custom(t.debug.triggerEvent, (
        <ActionSelect
          label={t.debug.triggerEvent}
          placeholder={t.debug.choose}
          options={EVENT_KINDS.map((k) => ({ value: k, label: t.debug.eventNames[k] ?? k }))}
          onPick={(v) => game.debugTriggerEvent(v as (typeof EVENT_KINDS)[number])}
        />
      )),
    ],
    graphics: [
      // The graphics section is a SINGLE detail-level dropdown (design.md
      // §21.3, point 276 correction). The per-setting graphics allow-flags
      // (TRAA, SSAO, half/full shadows, campfire shadows) are no longer
      // exposed here — they stay internal, set by the touch quality preset
      // (§17.5) and the F8 benchmark, and combined by the effective* selectors.
      custom(t.debug.detailLevel, (
        <label>
          <span>{t.debug.detailLevel}</span>
          <select
            value={detailLevel}
            onChange={(e) => useUi.getState().setDetailLevel(e.target.value as DetailLevel)}
          >
            <option value="low">{t.debug.detailLow}</option>
            <option value="medium">{t.debug.detailMedium}</option>
            <option value="high">{t.debug.detailHigh}</option>
          </select>
        </label>
      )),
      check(t.debug.flatGround, groundDebugFlat, (v) => useUi.getState().setGroundDebugFlat(v)),
      num(t.debug.startupFreezeBudget, balance.startup.pictureFreezeBudgetMs,
        (v) => { balance.startup.pictureFreezeBudgetMs = Math.max(100, v); bump() }, 250),
      num(t.debug.labelOverlayMax, balance.labelOverlay.maxLabels,
        (v) => { balance.labelOverlay.maxLabels = Math.max(0, Math.round(v)); bump() }, 4),
      num(t.debug.ambienceVolume, balance.ambienceVolume, (v) => {
        set('ambienceVolume', Math.max(0, v))
        refreshAmbienceVolume()
      }, 0.05),
      num(t.debug.footstepVolume, balance.footstepVolume, (v) => {
        set('footstepVolume', Math.max(0, v))
        refreshAmbienceVolume()
      }, 0.1),
      num(t.debug.ambientVolume, balance.ambientVolume, (v) => {
        set('ambientVolume', Math.max(0, v))
        refreshAmbienceVolume()
      }, 0.05),
      num(t.debug.birdsongVolume, balance.birdsongVolume, (v) => {
        set('birdsongVolume', Math.max(0, v))
        refreshAmbienceVolume()
      }, 0.1),
      num(t.debug.surfNearRadius, balance.surf.nearRadius,
        (v) => { balance.surf.nearRadius = Math.max(0, v); bump() }, 0.1),
      num(t.debug.surfCutoff, balance.surf.cutoff,
        (v) => { balance.surf.cutoff = Math.max(0.1, v); bump() }, 0.5),
    ],
    jump: [
      custom(t.debug.jumpTo, (
        <GroupedActionSelect
          label={t.debug.jumpTo}
          placeholder={t.debug.choose}
          groups={jumpGroups}
          onPick={(v) => {
            if (v === '#grave') {
              game.debugJumpTo(game.graveLatLon.lat, game.graveLatLon.lon)
              return
            }
            // An enterable target is ENTERED (design.md §21.3): a settlement or
            // the Giza monument site lands the traveller inside it in the
            // first-person view; everything else stays a bird's-eye jump.
            const placeId = jumpTargetPlaceId(v)
            if (placeId) {
              game.debugJumpToPlace(placeId)
              return
            }
            const c = jumpCoords.get(v)
            if (c) game.debugJumpTo(c.lat, c.lon)
          }}
        />
      )),
    ],
    tools: [
      custom(t.debug.renderer, (
        <label>
          <span>{t.debug.renderer}</span>
          {/* Proper names, not localized. */}
          <span>{webglFallback ? 'WebGL 2' : 'WebGPU'}</span>
        </label>
      )),
      // Starting the benchmark must not depend on a function key (point 280):
      // on many keyboards F8 needs Fn and never reaches the page at all. This
      // button is the entry point the user is actually pointed at.
      custom(t.debug.benchmarkStart, (
        <label>
          <span>{t.debug.benchmarkStart}</span>
          <span>
            <button onClick={() => void startBenchmarkSafely()}>{t.benchmark.title}</button>
          </span>
        </label>
      )),
      // The language selector is a testing tool here, not a game setting.
      custom(t.debug.language, (
        <label>
          <span>{t.debug.language}</span>
          <span>
            {LANGUAGES.map((l) => (
              <button key={l} disabled={l === lang} onClick={() => setLang(l)}>
                {DICTIONARIES[l].languageName}
              </button>
            ))}
          </span>
        </label>
      )),
      check(t.debug.fpsCounter, fpsVisible, (v) => useUi.getState().setFpsVisible(v)),
      check(t.debug.showHidden, balance.showHiddenObjects, (v) => set('showHiddenObjects', v)),
      check(t.debug.journalDnd, journalDnd, (v) => useUi.getState().setJournalDnd(v)),
    ],
  }
  const groups = DEBUG_GROUP_ORDER.map((id) => ({ id, title: t.debug.groups[id], rows: groupRows[id] }))

  const filtering = filter.trim().length > 0
  const shown = groups
    .map((g) => ({ ...g, rows: filtering ? g.rows.filter((r) => matchesDebugFilter(r.label, filter)) : g.rows }))
    .filter((g) => !filtering || g.rows.length > 0)

  return (
    <div className="debug-menu">
      <h3>{t.debug.title}</h3>

      <label className="debug-filter">
        <span>{t.debug.filter}</span>
        <input
          type="text"
          value={filter}
          placeholder={t.debug.filterHint}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>

      {filtering && shown.length === 0 && <p className="debug-empty">{t.debug.filterEmpty}</p>}

      {shown.map((g) => {
        // A filter shows what it found; otherwise the remembered collapse state
        // decides. Collapsed rows stay in the DOM so the filter can search them.
        const isOpen = filtering || groupsOpen.includes(g.id)
        return (
          <div className="debug-group" key={g.id}>
            <button
              type="button"
              className="debug-group-head"
              aria-expanded={isOpen}
              onClick={() => useUi.getState().toggleDebugGroup(g.id)}
            >
              <span className="debug-group-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <span className="debug-group-title">{g.title}</span>
            </button>
            <div className="debug-group-body" hidden={!isOpen}>
              {g.rows.map((r, i) => (
                <Fragment key={`${g.id}-${i}-${r.label}`}>{r.node}</Fragment>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
