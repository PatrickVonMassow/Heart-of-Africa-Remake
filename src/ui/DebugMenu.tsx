// Debug menu (design.md §21, F1): runtime tuning of the balance values used
// by the POC plus the game-language selector (design.md §17: German default,
// English). Implemented only as far as the POC systems require (CLAUDE.md §8).

import { balance } from '../config/balance'
import { refreshAmbienceVolume } from '../systems/ambience'
import { totalGifts, useGame, type EquipmentId } from '../state/store'
import { EVENT_KINDS } from '../systems/events'
import { TREASURE_IDS, type TreasureId } from '../systems/economy'
import { useUi } from '../state/ui'
import { PLACES, type Material } from '../world/geo'
import { ELEPHANT_GRAVEYARD } from '../world/data/landmarks'
import { DICTIONARIES, LANGUAGES, useLocale, useStrings } from '../i18n'

const EQUIPMENT_IDS: EquipmentId[] = ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen', 'map', 'canoe']
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
  const wheelZoomEnabled = useUi((s) => s.wheelZoomEnabled)
  const webglFallback = useUi((s) => s.webglFallback)
  const journalDnd = useUi((s) => s.journalDnd)
  const bump = useGame((s) => s.bumpBalance)
  useGame((s) => s.balanceVersion)
  const game = useGame()

  if (!open) return null

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
      <NumberField label={t.debug.mouseSensitivity} value={balance.mouseSensitivity} step={0.0002}
        onChange={(v) => set('mouseSensitivity', Math.max(0, v))} />
      <NumberField label={t.debug.ambienceVolume} value={balance.ambienceVolume} step={0.05}
        onChange={(v) => {
          set('ambienceVolume', Math.max(0, v))
          refreshAmbienceVolume()
        }} />
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
        <ActionSelect
          label={t.debug.jumpTo}
          placeholder={t.debug.choose}
          options={[
            ...PLACES.map((p) => ({ value: p.id, label: t.places[p.id] })),
            { value: '#graveyard', label: t.landmarks['elephant-graveyard'] },
            { value: '#grave', label: t.debug.grave },
          ]}
          onPick={(v) => {
            if (v === '#grave') game.debugJumpTo(game.graveLatLon.lat, game.graveLatLon.lon)
            else if (v === '#graveyard') game.debugJumpTo(ELEPHANT_GRAVEYARD.lat, ELEPHANT_GRAVEYARD.lon)
            else {
              const p = PLACES.find((pl) => pl.id === v)
              if (p) game.debugJumpTo(p.lat, p.lon)
            }
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
