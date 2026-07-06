// Trade and audience dialogs (design.md §9/§10/§12). All player-visible
// text comes from the language files (design.md §17 localization).

import { useGame, priceOfGood, type EquipmentId } from '../state/store'
import { useUi, type BuildingType } from '../state/ui'
import { placeById, type Material } from '../world/geo'
import { balance } from '../config/balance'
import { useStrings } from '../i18n'
import type { Strings } from '../i18n/types'

type Good = EquipmentId | 'food' | Material

const MATERIALS: Material[] = ['gold', 'silver', 'emerald', 'copper', 'ivory']

const BUILDING_GOODS: Record<Exclude<BuildingType, 'chief'>, Good[]> = {
  shop: ['medicine', 'map', 'gold', 'silver', 'emerald', 'copper', 'ivory'],
  weapons: ['rifle', 'machete'],
  tools: ['shovel', 'rope', 'canteen'],
  market: ['canoe', 'food'],
}

function goodName(t: Strings, g: Good): string {
  if (g === 'food') return t.dialogs.foodItem
  if ((MATERIALS as string[]).includes(g)) return t.dialogs.gift(t.gifts[g as Material])
  return t.equipment[g as EquipmentId]
}

function TradeDialog({ building }: { building: Exclude<BuildingType, 'chief'> }) {
  const t = useStrings()
  const money = useGame((s) => s.money)
  const buy = useGame((s) => s.buy)
  const setDialog = useUi((s) => s.setDialog)

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{t.buildings[building]}</h3>
        <p className="flavor">{t.dialogs.tradeGreeting}</p>
        <div className="row"><span>{t.dialogs.cash}</span><span className="price">{Math.floor(money)} $</span></div>
        {BUILDING_GOODS[building].map((g) => (
          <div className="row" key={g}>
            <span>{goodName(t, g)}</span>
            <span className="price">{priceOfGood(g)} $</span>
            <button className="hud-button" onClick={() => buy(g)} disabled={money < priceOfGood(g)}>
              {t.dialogs.buy}
            </button>
          </div>
        ))}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.dialogs.leave}</button>
        </div>
      </div>
    </div>
  )
}

function AudienceDialog() {
  const t = useStrings()
  const placeId = useGame((s) => s.placeId)
  const gifts = useGame((s) => s.gifts)
  const goodwill = useGame((s) => s.goodwill)
  const giveGift = useGame((s) => s.giveGift)
  const chiefHintGiven = useGame((s) => s.chiefHintGiven)
  const setDialog = useUi((s) => s.setDialog)
  if (!placeId) return null
  const place = placeById(placeId)
  const gw = goodwill[placeId] ?? 0

  const mood =
    gw >= balance.goodwillForHint ? t.dialogs.moodHigh : gw > 0 ? t.dialogs.moodMid : t.dialogs.moodLow
  const peopleName = place.peopleId ? t.peoples[place.peopleId] : t.places[place.id]

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{t.dialogs.audienceTitle(peopleName)}</h3>
        <p className="flavor">{t.dialogs.audienceIntro(mood)}</p>
        {chiefHintGiven && <p className="flavor">{t.dialogs.chiefDone}</p>}
        {MATERIALS.map((m) => (
          <div className="row" key={m}>
            <span>{t.gifts[m]} ({t.dialogs.stock(gifts[m])})</span>
            <button className="hud-button" onClick={() => giveGift(m)} disabled={gifts[m] <= 0}>
              {t.dialogs.give}
            </button>
          </div>
        ))}
        {/* OPEN: which gift the region reveres must be discovered by the player
            (design.md §8); no in-game reveal beyond the chief's reaction. */}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.dialogs.endAudience}</button>
        </div>
      </div>
    </div>
  )
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  if (!dialog) return null
  if (dialog.kind === 'audience') return <AudienceDialog />
  return <TradeDialog building={dialog.building as Exclude<BuildingType, 'chief'>} />
}
