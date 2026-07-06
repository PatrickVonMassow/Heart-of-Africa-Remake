// Debug menu (design.md §21, F1): runtime tuning of the balance values used
// by the POC plus the game-language selector (design.md §17: German default,
// English). Implemented only as far as the POC systems require (CLAUDE.md §8).

import { balance } from '../config/balance'
import { useGame, type EquipmentId } from '../state/store'
import { useUi } from '../state/ui'
import { PLACES, type Material } from '../world/geo'
import { DICTIONARIES, LANGUAGES, useLocale, useStrings } from '../i18n'

const EQUIPMENT_IDS: EquipmentId[] = ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen', 'map', 'canoe']
const MATERIALS: Material[] = ['gold', 'silver', 'emerald', 'copper', 'ivory']

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
      <NumberField label={t.debug.foodPerDay} value={balance.foodPerDay}
        onChange={(v) => set('foodPerDay', Math.max(0, v))} />
      <NumberField label={t.debug.daysPerUnit} value={balance.daysPerUnit} step={0.05}
        onChange={(v) => set('daysPerUnit', Math.max(0, v))} />
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

      <div className="section">
        <NumberField label={t.debug.cash} value={game.money} step={10}
          onChange={(v) => game.debugSet({ money: v })} />
        <NumberField label={t.debug.foodDays} value={game.foodDays} step={7}
          onChange={(v) => game.debugSet({ foodDays: Math.max(0, v) })} />
      </div>

      <div className="section">
        <div>{t.debug.jumpTo}</div>
        {PLACES.map((p) => (
          <button key={p.id} onClick={() => game.debugJumpTo(p.lat, p.lon)}>{t.places[p.id]}</button>
        ))}
        <button onClick={() => game.debugJumpTo(game.graveLatLon.lat, game.graveLatLon.lon)}>
          {t.debug.grave}
        </button>
      </div>

      <div className="section">
        <div>{t.debug.addEquipment}</div>
        {EQUIPMENT_IDS.map((e) => (
          <button key={e} onClick={() => game.debugAddEquipment(e)}>{t.equipment[e]}</button>
        ))}
      </div>

      <div className="section">
        <div>{t.debug.addGift}</div>
        {MATERIALS.map((m) => (
          <button key={m} onClick={() => game.debugAddGift(m)}>{t.gifts[m]}</button>
        ))}
      </div>
    </div>
  )
}
