// Debug menu (design.md §21, F1): runtime tuning of the balance values used
// by the POC plus the game-language selector (design.md §17.7: English is the
// default game language, German the alternative). Implemented only as far as
// the POC systems require (CLAUDE.md §8).

import { balance } from '../config/balance'
import { clampWander } from '../render/edgeBand'
import { refreshAmbienceVolume } from '../systems/ambience'
import { totalGifts, useGame, type EquipmentId } from '../state/store'
import { EVENT_KINDS, type EventKind } from '../systems/events'
import { debugEventGroups, fireDebugEvent, sortByLabel } from '../systems/debugEvents'
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

/** The debug-section keys whose value really is a plain label string (the
 *  section also holds a few nested groups). */
type DebugLabelKey = {
  [K in keyof Strings['debug']]: Strings['debug'][K] extends string ? K : never
}[keyof Strings['debug']]

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

export function DebugMenu() {
  const t = useStrings()
  const lang = useLocale((s) => s.lang)
  const setLang = useLocale((s) => s.setLang)
  const open = useUi((s) => s.debugOpen)
  const fpsVisible = useUi((s) => s.fpsVisible)
  const seasonWetnessOverride = useUi((s) => s.seasonWetnessOverride)
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

  return (
    <div className="debug-menu">
      <h3>{t.debug.title}</h3>

      <label>
        <span>{t.debug.renderer}</span>
        {/* Proper names, not localized. */}
        <span>{webglFallback ? 'WebGL 2' : 'WebGPU'}</span>
      </label>

      {/* Starting the benchmark must not depend on a function key (point 280):
          on many keyboards F8 needs Fn and never reaches the page at all. This
          button is the entry point the user is actually pointed at. */}
      <label>
        <span>{t.debug.benchmarkStart}</span>
        <span>
          <button onClick={() => void startBenchmarkSafely()}>{t.benchmark.title}</button>
        </span>
      </label>

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

      <NumberField label={t.debug.travelSpeed} value={balance.travelSpeed} step={0.5}
        onChange={(v) => set('travelSpeed', v)} />
      <NumberField label={t.debug.walkSpeed} value={balance.placeWalkSpeed} step={0.5}
        onChange={(v) => set('placeWalkSpeed', v)} />
      <NumberField label={t.debug.strafeFactor} value={balance.placeStrafeFactor} step={0.05}
        onChange={(v) => set('placeStrafeFactor', Math.max(0, v))} />
      <NumberField label={t.debug.walkerUnstuck} value={balance.walkerUnstuckSeconds} step={1}
        onChange={(v) => set('walkerUnstuckSeconds', Math.max(0.5, v))} />
      <NumberField label={t.debug.startupFreezeBudget} value={balance.startup.pictureFreezeBudgetMs} step={250}
        onChange={(v) => { balance.startup.pictureFreezeBudgetMs = Math.max(100, v); bump() }} />
      <NumberField label={t.debug.mouseSensitivity} value={balance.mouseSensitivity} step={0.0002}
        onChange={(v) => set('mouseSensitivity', Math.max(0, v))} />
      {/* Vertical look (design.md §17.5/§21.2, point 392): the clamp in degrees
          from the horizon, and the inversion — checked by default. */}
      <NumberField label={t.debug.lookPitchLimit} value={balance.lookPitchLimitDeg} step={5}
        onChange={(v) => set('lookPitchLimitDeg', Math.max(0, v))} />
      <label>
        <span>{t.debug.invertLook}</span>
        <input
          type="checkbox"
          checked={invertLook}
          onChange={(e) => useUi.getState().setInvertLook(e.target.checked)}
        />
      </label>
      <NumberField label={t.debug.ambienceVolume} value={balance.ambienceVolume} step={0.05}
        onChange={(v) => {
          set('ambienceVolume', Math.max(0, v))
          refreshAmbienceVolume()
        }} />
      <NumberField label={t.debug.footstepVolume} value={balance.footstepVolume} step={0.1}
        onChange={(v) => {
          set('footstepVolume', Math.max(0, v))
          refreshAmbienceVolume()
        }} />
      <NumberField label={t.debug.ambientVolume} value={balance.ambientVolume} step={0.05}
        onChange={(v) => {
          set('ambientVolume', Math.max(0, v))
          refreshAmbienceVolume()
        }} />
      <NumberField label={t.debug.birdsongVolume} value={balance.birdsongVolume} step={0.1}
        onChange={(v) => {
          set('birdsongVolume', Math.max(0, v))
          refreshAmbienceVolume()
        }} />
      <NumberField label={t.debug.surfNearRadius} value={balance.surf.nearRadius} step={0.1}
        onChange={(v) => { balance.surf.nearRadius = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.surfCutoff} value={balance.surf.cutoff} step={0.5}
        onChange={(v) => { balance.surf.cutoff = Math.max(0.1, v); bump() }} />
      {/* Village speech (design.md §13.4/§21.2): the pace of the syllables, the
          pause between the atoms of a phrase and the short, sharply falling
          hearing range. The voices sit under the ambience volume above. */}
      <NumberField label={t.debug.speechSyllable} value={balance.communication.syllableSeconds} step={0.05}
        onChange={(v) => { balance.communication.syllableSeconds = Math.max(0.05, v); bump() }} />
      <NumberField label={t.debug.speechPhrasePause} value={balance.communication.phrasePauseSeconds} step={0.1}
        onChange={(v) => { balance.communication.phrasePauseSeconds = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.speechHearingRadius} value={balance.communication.hearingRadius} step={1}
        onChange={(v) => { balance.communication.hearingRadius = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.speechHearingFalloff} value={balance.communication.hearingFalloff} step={2}
        onChange={(v) => { balance.communication.hearingFalloff = Math.max(0, v); bump() }} />
      {/* How long the player's reading stands over the speaker's head (point 485). */}
      <NumberField label={t.debug.speechLabelSeconds} value={balance.communication.labelSeconds} step={0.2}
        onChange={(v) => { balance.communication.labelSeconds = Math.max(0, v); bump() }} />
      {/* The children's game of tag (design.md §19.10, point 480/351): every
          pace, rate, distance and threshold of the chase, so the whole mechanic
          can be tuned by eye while a village runs. */}
      {TAG_FIELDS.map(({ key, label, step, min, max }) => (
        <NumberField
          key={key}
          label={t.debug[label]}
          value={balance.villageLife.tag[key]}
          step={step}
          onChange={(v) => {
            balance.villageLife.tag[key] = Math.min(max ?? Infinity, Math.max(min, v))
            bump()
          }}
        />
      ))}
      <NumberField label={t.debug.foodPerDay} value={balance.foodPerDay}
        onChange={(v) => set('foodPerDay', Math.max(0, v))} />
      <NumberField label={t.debug.canteenDrain} value={balance.health.canteenDrainPerDay} step={0.1}
        onChange={(v) => { balance.health.canteenDrainPerDay = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.canteenDesertDrain} value={balance.health.canteenDesertDrainPerDay} step={0.1}
        onChange={(v) => { balance.health.canteenDesertDrainPerDay = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.canteenCapacity} value={balance.health.canteenCapacity} step={100}
        onChange={(v) => { balance.health.canteenCapacity = Math.max(1, v); bump() }} />
      <NumberField label={t.debug.woundHealLight} value={balance.health.woundHealLightDays} step={1}
        onChange={(v) => { balance.health.woundHealLightDays = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.woundHealSevere} value={balance.health.woundHealSevereDays} step={1}
        onChange={(v) => { balance.health.woundHealSevereDays = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.daysPerUnit} value={balance.daysPerUnit} step={0.05}
        onChange={(v) => set('daysPerUnit', Math.max(0, v))} />
      <NumberField label={t.debug.foodUnitDays} value={balance.foodUnitDays} step={1}
        onChange={(v) => set('foodUnitDays', Math.max(1, v))} />
      <NumberField label={t.debug.canoeSpeedup} value={balance.canoeSpeedup} step={0.25}
        onChange={(v) => set('canoeSpeedup', Math.max(1, v))} />
      <NumberField label={t.debug.junglePenalty} value={balance.junglePenalty} step={0.1}
        onChange={(v) => set('junglePenalty', Math.max(1, v))} />
      {/* Build-time value (ribbon/bed/mask geometry are module singletons):
          the edit persists in balance and applies on the next reload. */}
      <NumberField label={t.debug.riverWidthFactor} value={balance.river.widthFactor} step={0.1}
        onChange={(v) => { balance.river.widthFactor = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.riverMouthSlackDeg} value={balance.river.mouthSlackDeg} step={0.1}
        onChange={(v) => { balance.river.mouthSlackDeg = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.drownSeconds} value={balance.waterDrama.drownSeconds} step={5}
        onChange={(v) => { balance.waterDrama.drownSeconds = Math.max(1, v); bump() }} />
      <NumberField label={t.debug.wetFlowFactor} value={balance.waterDrama.wetFlowFactor} step={0.1}
        onChange={(v) => { balance.waterDrama.wetFlowFactor = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.vigilPredatorDelay} value={balance.vigil.predatorDelay} step={1}
        onChange={(v) => { balance.vigil.predatorDelay = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.rescueBurst} value={balance.family.rescueBurst} step={0.1}
        onChange={(v) => { balance.family.rescueBurst = Math.max(1, v); bump() }} />
      <NumberField label={t.debug.calfFraction} value={balance.family.calfFraction} step={0.05}
        onChange={(v) => { balance.family.calfFraction = Math.max(0, Math.min(1, v)); bump() }} />
      <NumberField label={t.debug.calfFollowRadius} value={balance.family.followRadius} step={0.2}
        onChange={(v) => { balance.family.followRadius = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.calfGambolRange} value={balance.family.gambolRange} step={0.5}
        onChange={(v) => { balance.family.gambolRange = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.calfGambolBout} value={balance.family.gambolBoutSeconds} step={0.5}
        onChange={(v) => { balance.family.gambolBoutSeconds = Math.max(0.5, v); bump() }} />
      {/* Juvenile-prey preferences (design.md §19.8, point 245). */}
      <NumberField label={t.debug.juvenilePreyBias} value={balance.family.juvenilePreyBias} step={0.05}
        onChange={(v) => { balance.family.juvenilePreyBias = Math.max(0, Math.min(1, v)); bump() }} />
      <NumberField label={t.debug.juvenileDrinkCrocBias} value={balance.family.juvenileDrinkCrocBias} step={0.5}
        onChange={(v) => { balance.family.juvenileDrinkCrocBias = Math.max(1, v); bump() }} />
      <NumberField label={t.debug.calfAdoptionRadius} value={balance.family.adoptionRadius} step={1}
        onChange={(v) => { balance.family.adoptionRadius = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.calfEscapeSeconds} value={balance.family.escapeSeconds} step={0.5}
        onChange={(v) => { balance.family.escapeSeconds = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.calfReunionSeconds} value={balance.family.reunionSeconds} step={1}
        onChange={(v) => { balance.family.reunionSeconds = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.calfMourningSeconds} value={balance.family.mourningSeconds} step={1}
        onChange={(v) => { balance.family.mourningSeconds = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.crocStrikeRadius} value={balance.crocodile.strikeRadius} step={0.5}
        onChange={(v) => { balance.crocodile.strikeRadius = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.crocAmbushBankBand} value={balance.crocodile.ambushBankBand} step={0.5}
        onChange={(v) => { balance.crocodile.ambushBankBand = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.crocMouthOffset} value={balance.crocodile.mouthOffsetLocal} step={0.05}
        onChange={(v) => { balance.crocodile.mouthOffsetLocal = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.crocDragSpeed} value={balance.crocodile.dragSpeed} step={0.5}
        onChange={(v) => { balance.crocodile.dragSpeed = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.crocDragSeconds} value={balance.crocodile.dragSeconds} step={0.5}
        onChange={(v) => { balance.crocodile.dragSeconds = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.crocGripSeconds} value={balance.crocodile.gripSeconds} step={0.5}
        onChange={(v) => { balance.crocodile.gripSeconds = Math.max(0.5, v); bump() }} />
      <NumberField label={t.debug.crocDriveOffRest} value={balance.crocodile.driveOffRestSeconds} step={1}
        onChange={(v) => { balance.crocodile.driveOffRestSeconds = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.huntLeaveOvertime} value={balance.hunt.leaveOvertimeSeconds} step={5}
        onChange={(v) => { balance.hunt.leaveOvertimeSeconds = Math.max(5, v); bump() }} />
      <NumberField label={t.debug.waterCrossMax} value={balance.waterCross.maxUnits} step={1}
        onChange={(v) => { balance.waterCross.maxUnits = Math.max(0, v); bump() }} />
      <NumberField label={t.debug.waterCrossChance} value={balance.waterCross.chance} step={0.05}
        onChange={(v) => { balance.waterCross.chance = Math.max(0, Math.min(1, v)); bump() }} />
      <NumberField label={t.debug.seasonStrength} value={balance.season.weatherStrength} step={0.1}
        onChange={(v) => { balance.season.weatherStrength = Math.max(0, Math.min(1, v)); bump() }} />
      <NumberField label={t.debug.wetGroundStrength} value={balance.season.wetGroundStrength} step={0.1}
        onChange={(v) => { balance.season.wetGroundStrength = Math.max(0, Math.min(1, v)); bump() }} />
      <NumberField label={t.debug.edgeBandWidth} value={balance.placeEdgeBand.widthM} step={0.5}
        onChange={(v) => { balance.placeEdgeBand.widthM = Math.max(0.2, v); bump() }} />
      <NumberField label={t.debug.edgeBandWander} value={balance.placeEdgeBand.wanderM} step={0.1}
        onChange={(v) => { balance.placeEdgeBand.wanderM = clampWander(v, balance.placeEdgeBand.widthM); bump() }} />
      <NumberField label={t.debug.edgeBandStrength} value={balance.placeEdgeBand.strength} step={0.1}
        onChange={(v) => { balance.placeEdgeBand.strength = Math.max(0, Math.min(1, v)); bump() }} />
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
      <NumberField label={t.debug.mountainPenalty} value={balance.mountainPenalty} step={0.1}
        onChange={(v) => set('mountainPenalty', Math.max(1, v))} />
      <NumberField label={t.debug.oceanSwimMargin} value={balance.oceanSwimMarginDeg} step={0.1}
        onChange={(v) => set('oceanSwimMarginDeg', Math.max(0, v))} />
      <NumberField label={t.debug.digRadius} value={balance.digRadius} step={0.5}
        onChange={(v) => set('digRadius', v)} />
      <NumberField label={t.debug.goodwillForHint} value={balance.goodwillForHint} step={1}
        onChange={(v) => set('goodwillForHint', v)} />

      <label>
        <span>{t.debug.randomEvents}</span>
        <input
          type="checkbox"
          checked={balance.randomEventsEnabled}
          onChange={(e) => set('randomEventsEnabled', e.target.checked)}
        />
      </label>
      <label>
        <span>{t.debug.showHidden}</span>
        <input
          type="checkbox"
          checked={balance.showHiddenObjects}
          onChange={(e) => set('showHiddenObjects', e.target.checked)}
        />
      </label>
      <label>
        <span>{t.debug.fpsCounter}</span>
        <input
          type="checkbox"
          checked={fpsVisible}
          onChange={(e) => useUi.getState().setFpsVisible(e.target.checked)}
        />
      </label>
      {/* The graphics section is a SINGLE detail-level dropdown (design.md
          §21.3, point 276 correction). The per-setting graphics allow-flags
          (TRAA, SSAO, half/full shadows, campfire shadows) are no longer
          exposed here — they stay internal, set by the touch quality preset
          (§17.5) and the F8 benchmark, and combined by the effective* selectors. */}
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
      <label>
        <span>{t.debug.flatGround}</span>
        <input
          type="checkbox"
          checked={groundDebugFlat}
          onChange={(e) => useUi.getState().setGroundDebugFlat(e.target.checked)}
        />
      </label>
      <label>
        <span>{t.debug.foliageCollapse}</span>
        <input
          type="checkbox"
          checked={seasonCollapseEnabled}
          onChange={(e) => useUi.getState().setSeasonCollapseEnabled(e.target.checked)}
        />
      </label>
      <label>
        <span>{t.debug.wheelZoom}</span>
        <input
          type="checkbox"
          checked={wheelZoomEnabled}
          onChange={(e) => useUi.getState().setWheelZoomEnabled(e.target.checked)}
        />
      </label>
      <label>
        <span>{t.debug.journalDnd}</span>
        <input
          type="checkbox"
          checked={journalDnd}
          onChange={(e) => useUi.getState().setJournalDnd(e.target.checked)}
        />
      </label>

      <div className="section">
        <NumberField label={t.debug.cash} value={game.money} step={10}
          onChange={(v) => game.debugSet({ money: v })} />
        <NumberField label={t.debug.foodDays} value={game.foodDays} step={7}
          onChange={(v) => game.debugSet({ foodDays: Math.max(0, v) })} />
        <NumberField label={t.debug.giftsTotal} value={totalGifts(game.gifts)} step={1}
          onChange={(v) => game.debugSetGiftTotal(v)} />
        <NumberField label={t.debug.inventoryCapacity} value={balance.inventoryCapacity} step={1}
          onChange={(v) => set('inventoryCapacity', Math.max(1, Math.round(v)))} />
        <NumberField label={t.debug.health} value={Math.round(game.health)} step={10}
          onChange={(v) => game.debugSet({ health: Math.max(0, Math.min(balance.health.max, v)) })} />
        <label>
          <span>{t.health.fever}</span>
          <input type="checkbox" checked={game.afflictions.fever}
            onChange={(e) => game.debugSetAffliction('fever', e.target.checked)} />
        </label>
        <label>
          <span>{t.health.sunblind}</span>
          <input type="checkbox" checked={game.afflictions.sunblind}
            onChange={(e) => game.debugSetAffliction('sunblind', e.target.checked)} />
        </label>
        <label>
          <span>{t.health.woundsSevere}</span>
          <input type="checkbox" checked={game.afflictions.wounds === 2}
            onChange={(e) => game.debugSetAffliction('wounds', e.target.checked ? 2 : 0)} />
        </label>
      </div>

      <div className="section">
        <GroupedActionSelect
          label={t.debug.jumpTo}
          placeholder={t.debug.choose}
          groups={jumpGroups}
          onPick={(v) => {
            if (v === '#grave') {
              game.debugJumpTo(game.graveLatLon.lat, game.graveLatLon.lon)
              return
            }
            const c = jumpCoords.get(v)
            if (c) game.debugJumpTo(c.lat, c.lon)
          }}
        />
        <ActionSelect
          label={t.debug.addEquipment}
          placeholder={t.debug.choose}
          options={EQUIPMENT_IDS.map((e) => ({ value: e, label: t.equipment[e] }))}
          onPick={(v) => game.debugAddEquipment(v as EquipmentId)}
        />
        <ActionSelect
          label={t.debug.triggerEvent}
          placeholder={t.debug.choose}
          options={EVENT_KINDS.map((k) => ({ value: k, label: t.debug.eventNames[k] ?? k }))}
          onPick={(v) => game.debugTriggerEvent(v as (typeof EVENT_KINDS)[number])}
        />
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
        <ActionSelect
          label={t.debug.addGift}
          placeholder={t.debug.choose}
          options={MATERIALS.map((m) => ({ value: m, label: t.gifts[m] }))}
          onPick={(v) => game.debugAddGift(v as Material)}
        />
        <ActionSelect
          label={t.debug.addTreasure}
          placeholder={t.debug.choose}
          options={TREASURE_IDS.map((id) => ({ value: id, label: t.treasures[id] }))}
          onPick={(v) => game.debugAddTreasure(v as TreasureId)}
        />
      </div>
    </div>
  )
}
