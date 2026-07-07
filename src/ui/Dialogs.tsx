// Trade and audience dialogs (design.md §9/§10/§12). All player-visible
// text comes from the language files (design.md §17 localization).

import { useGame, priceOfGood, type EquipmentId } from '../state/store'
import { useUi, type TradeBuilding } from '../state/ui'
import { PLACES, placeById, type Material } from '../world/geo'
import { ferryCost, ferryDays, treasureBuyPrice, TREASURE_IDS } from '../systems/economy'
import { balance } from '../config/balance'
import { useStrings } from '../i18n'
import type { Strings } from '../i18n/types'

type Good = EquipmentId | 'food' | Material

const MATERIALS: Material[] = ['gold', 'silver', 'emerald', 'copper', 'ivory']

const BUILDING_GOODS: Record<TradeBuilding, Good[]> = {
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

function TradeDialog({ building }: { building: TradeBuilding }) {
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
  const hintsGiven = useGame((s) => s.hintsGiven)
  const unspecificGiven = useGame((s) => s.unspecificGiven)
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
        {(hintsGiven[place.region] === true || unspecificGiven[place.id] === true) && (
          <p className="flavor">{t.dialogs.chiefDone}</p>
        )}
        {MATERIALS.map((m) => (
          <div className="row" key={m}>
            <span>{t.gifts[m]} ({t.dialogs.stock(gifts[m])})</span>
            <button className="hud-button" onClick={() => giveGift(m)} disabled={gifts[m] <= 0}>
              {t.dialogs.give}
            </button>
          </div>
        ))}
        {/* Which gift the region reveres is discoverable in play: the village
            elder reveals it on a second talk (design.md §8, journal.giftLore). */}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.dialogs.endAudience}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Bazaar (design.md §10): offer a treasure, the merchant names a bid to
 * accept or decline; items rejected by the region's value profile are not
 * traded. Buying treasures enables the continent-wide arbitrage (§8).
 */
function BazaarDialog() {
  const t = useStrings()
  const money = useGame((s) => s.money)
  const treasures = useGame((s) => s.treasures)
  const placeId = useGame((s) => s.placeId)
  const offerTreasure = useGame((s) => s.offerTreasure)
  const acceptBid = useGame((s) => s.acceptBid)
  const declineBid = useGame((s) => s.declineBid)
  const buyTreasure = useGame((s) => s.buyTreasure)
  const bid = useUi((s) => s.bazaarBid)
  const setDialog = useUi((s) => s.setDialog)
  if (!placeId) return null
  const region = placeById(placeId).region
  const owned = TREASURE_IDS.filter((id) => treasures[id] > 0)

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{t.buildings.bazaar}</h3>
        <p className="flavor">{t.dialogs.bazaarGreeting}</p>
        <div className="row"><span>{t.dialogs.cash}</span><span className="price">{Math.floor(money)} $</span></div>
        {bid && (
          <div className="row bazaar-bid">
            <span>{t.dialogs.bid(t.treasures[bid.treasure], bid.amount)}</span>
            <button className="hud-button" onClick={acceptBid}>{t.dialogs.accept}</button>
            <button className="hud-button" onClick={declineBid}>{t.dialogs.decline}</button>
          </div>
        )}
        {owned.length > 0 && <p className="flavor">{t.dialogs.bazaarSell}</p>}
        {owned.map((id) => (
          <div className="row" key={`sell-${id}`}>
            <span>{t.treasures[id]} ({t.dialogs.stock(treasures[id])})</span>
            <button className="hud-button" onClick={() => offerTreasure(id)}>{t.dialogs.offer}</button>
          </div>
        ))}
        <p className="flavor">{t.dialogs.bazaarBuy}</p>
        {TREASURE_IDS.map((id) => {
          const price = treasureBuyPrice(id, region)
          if (price === null) return null // rejected material: not stocked here
          return (
            <div className="row" key={`buy-${id}`}>
              <span>{t.treasures[id]}</span>
              <span className="price">{price} $</span>
              <button className="hud-button" onClick={() => buyTreasure(id)} disabled={money < price}>
                {t.dialogs.buy}
              </button>
            </div>
          )
        })}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.dialogs.leave}</button>
        </div>
      </div>
    </div>
  )
}

/** Travel agency (design.md §10): passage to another port city for a fee. */
function AgencyDialog() {
  const t = useStrings()
  const money = useGame((s) => s.money)
  const placeId = useGame((s) => s.placeId)
  const bookFerry = useGame((s) => s.bookFerry)
  const setDialog = useUi((s) => s.setDialog)
  if (!placeId) return null
  const from = placeById(placeId)
  const destinations = PLACES.filter((p) => p.kind === 'port' && p.id !== placeId)

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{t.buildings.agency}</h3>
        <p className="flavor">{t.dialogs.agencyGreeting}</p>
        <div className="row"><span>{t.dialogs.cash}</span><span className="price">{Math.floor(money)} $</span></div>
        {destinations.map((dest) => {
          const cost = ferryCost(from, dest)
          return (
            <div className="row" key={dest.id}>
              <span>{t.dialogs.passage(t.places[dest.id], ferryDays(from, dest))}</span>
              <span className="price">{cost} $</span>
              <button className="hud-button" onClick={() => bookFerry(dest.id)} disabled={money < cost}>
                {t.dialogs.book}
              </button>
            </div>
          )
        })}
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.dialogs.leave}</button>
        </div>
      </div>
    </div>
  )
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  if (!dialog) return null
  if (dialog.kind === 'audience') return <AudienceDialog />
  if (dialog.kind === 'bazaar') return <BazaarDialog />
  if (dialog.kind === 'agency') return <AgencyDialog />
  return <TradeDialog building={dialog.building} />
}
