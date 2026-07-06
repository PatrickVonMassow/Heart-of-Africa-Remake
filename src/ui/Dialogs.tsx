// Trade and audience dialogs (design.md §9/§10/§12).

import { useGame, priceOfGood, EQUIPMENT_NAMES, GIFT_NAMES, type EquipmentId } from '../state/store'
import { useUi, type BuildingType } from '../state/ui'
import { placeById, type Material } from '../world/geo'
import { balance } from '../config/balance'

type Good = EquipmentId | 'food' | Material

const BUILDING_GOODS: Record<Exclude<BuildingType, 'chief'>, Good[]> = {
  shop: ['medicine', 'map', 'gold', 'silver', 'emerald', 'copper', 'ivory'],
  weapons: ['rifle', 'machete'],
  tools: ['shovel', 'rope', 'canteen'],
  market: ['canoe', 'food'],
}

const BUILDING_TITLES: Record<Exclude<BuildingType, 'chief'>, string> = {
  shop: 'Laden',
  weapons: 'Waffenhütte',
  tools: 'Geräte-Hütte',
  market: 'Markthütte',
}

function goodName(g: Good): string {
  if (g === 'food') return 'Proviant (1 Woche)'
  if (g in GIFT_NAMES) return `Gabe: ${GIFT_NAMES[g as Material]}`
  return EQUIPMENT_NAMES[g as EquipmentId]
}

function TradeDialog({ building }: { building: Exclude<BuildingType, 'chief'> }) {
  const money = useGame((s) => s.money)
  const buy = useGame((s) => s.buy)
  const setDialog = useUi((s) => s.setDialog)

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{BUILDING_TITLES[building]}</h3>
        <p className="flavor">„Willkommen, Reisender! Sieh dich um — beste Ware, ehrliche Preise."</p>
        <div className="row"><span>Kasse</span><span className="price">{Math.floor(money)} $</span></div>
        {BUILDING_GOODS[building].map((g) => (
          <div className="row" key={g}>
            <span>{goodName(g)}</span>
            <span className="price">{priceOfGood(g)} $</span>
            <button className="hud-button" onClick={() => buy(g)} disabled={money < priceOfGood(g)}>
              Kaufen
            </button>
          </div>
        ))}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>Verlassen (Esc)</button>
        </div>
      </div>
    </div>
  )
}

function AudienceDialog() {
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
    gw >= balance.goodwillForHint
      ? 'Das Oberhaupt betrachtet dich mit großem Wohlwollen.'
      : gw > 0
        ? 'Das Oberhaupt wirkt dir gegenüber freundlich gesinnt.'
        : 'Das Oberhaupt mustert dich abwartend.'

  const materials = Object.keys(GIFT_NAMES) as Material[]

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Audienz beim Oberhaupt der {place.people ?? place.name}</h3>
        <p className="flavor">
          Im Halbdunkel der Chefhütte sitzt das Oberhaupt auf geschnitzten Hölzern. {mood}
        </p>
        {chiefHintGiven && (
          <p className="flavor">„Ich habe dir gesagt, was ich weiß. Möge dein Weg gesegnet sein."</p>
        )}
        {materials.map((m) => (
          <div className="row" key={m}>
            <span>{GIFT_NAMES[m]} (Vorrat: {gifts[m]})</span>
            <button className="hud-button" onClick={() => giveGift(m)} disabled={gifts[m] <= 0}>
              Überreichen
            </button>
          </div>
        ))}
        {/* OPEN: which gift the region reveres must be discovered by the player
            (design.md §8); no in-game reveal beyond the chief's reaction. */}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>Audienz beenden (Esc)</button>
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
