// Debug menu (design.md §21, F1): runtime tuning of the balance values used
// by the POC. Implemented only as far as the POC systems require (CLAUDE.md §8).

import { balance } from '../config/balance'
import { useGame, EQUIPMENT_NAMES, GIFT_NAMES, type EquipmentId } from '../state/store'
import { useUi } from '../state/ui'
import { PLACES, type Material } from '../world/geo'

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
  const open = useUi((s) => s.debugOpen)
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
      <h3>Debug-Menü (F1)</h3>

      <NumberField label="Tempo außerorts" value={balance.travelSpeed} step={0.5}
        onChange={(v) => set('travelSpeed', v)} />
      <NumberField label="Tempo innerorts" value={balance.placeWalkSpeed} step={0.5}
        onChange={(v) => set('placeWalkSpeed', v)} />
      <NumberField label="Nahrungsverbrauch/Tag (0 = ewig)" value={balance.foodPerDay}
        onChange={(v) => set('foodPerDay', Math.max(0, v))} />
      <NumberField label="Tage pro Wegeinheit" value={balance.daysPerUnit} step={0.05}
        onChange={(v) => set('daysPerUnit', Math.max(0, v))} />
      <NumberField label="Grabe-Radius" value={balance.digRadius} step={0.5}
        onChange={(v) => set('digRadius', v)} />
      <NumberField label="Wohlwollen für Hinweis" value={balance.goodwillForHint} step={1}
        onChange={(v) => set('goodwillForHint', v)} />

      <label>
        <span>Zufallsereignisse (POC: keine implementiert)</span>
        <input
          type="checkbox"
          checked={balance.randomEventsEnabled}
          onChange={(e) => set('randomEventsEnabled', e.target.checked)}
        />
      </label>
      <label>
        <span>Versteckte Objekte anzeigen</span>
        <input
          type="checkbox"
          checked={balance.showHiddenObjects}
          onChange={(e) => set('showHiddenObjects', e.target.checked)}
        />
      </label>

      <div className="section">
        <NumberField label="Kontostand ($)" value={game.money} step={10}
          onChange={(v) => game.debugSet({ money: v })} />
        <NumberField label="Nahrung (Tage)" value={game.foodDays} step={7}
          onChange={(v) => game.debugSet({ foodDays: Math.max(0, v) })} />
      </div>

      <div className="section">
        <div>Springe zu:</div>
        {PLACES.map((p) => (
          <button key={p.id} onClick={() => game.debugJumpTo(p.lat, p.lon)}>{p.name}</button>
        ))}
        <button onClick={() => game.debugJumpTo(game.graveLatLon.lat, game.graveLatLon.lon)}>
          Grab
        </button>
      </div>

      <div className="section">
        <div>Ausrüstung hinzufügen:</div>
        {(Object.keys(EQUIPMENT_NAMES) as EquipmentId[]).map((e) => (
          <button key={e} onClick={() => game.debugAddEquipment(e)}>{EQUIPMENT_NAMES[e]}</button>
        ))}
      </div>

      <div className="section">
        <div>Gabe hinzufügen:</div>
        {(Object.keys(GIFT_NAMES) as Material[]).map((m) => (
          <button key={m} onClick={() => game.debugAddGift(m)}>{GIFT_NAMES[m]}</button>
        ))}
      </div>
    </div>
  )
}
