// Trade and audience dialogs (design.md §9/§10/§12). All player-visible
// text comes from the language files (design.md §17 localization).

import { useState } from 'react'
import {
  EQUIPMENT_IDS, bagItemCount, emptyBag, giftPriceOfGood, priceOfGood, totalGifts,
  useGame, VILLAGE_TRADE_GOODS,
  type EquipmentId, type ItemBag, type ItemKind,
} from '../state/store'
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
  const gifts = useGame((s) => s.gifts)
  const equipment = useGame((s) => s.equipment)
  const placeId = useGame((s) => s.placeId)
  const buy = useGame((s) => s.buy)
  const sellItem = useGame((s) => s.sellItem)
  const setDialog = useUi((s) => s.setDialog)

  // Currency depends on the settlement: money in ports, gifts in native
  // villages (design.md §9/§10). Villages offer the baseline goods only.
  const inVillage = placeId ? placeById(placeId).kind === 'village' : false
  const goods: Good[] = inVillage ? [...VILLAGE_TRADE_GOODS] : BUILDING_GOODS[building]
  const giftsOnHand = totalGifts(gifts)
  const priceOf = (g: Good) => (inVillage ? giftPriceOfGood(g as EquipmentId | 'food') : priceOfGood(g))
  const priceLabel = (g: Good) => (inVillage ? t.dialogs.priceGifts(priceOf(g)) : `${priceOf(g)} $`)
  const affordable = (g: Good) => (inVillage ? giftsOnHand >= priceOf(g) : money >= priceOf(g))
  const sellLabel = (id: EquipmentId) =>
    inVillage
      ? t.dialogs.priceGifts(balance.village.sellGifts)
      : `${Math.max(1, Math.floor(priceOfGood(id) * balance.economy.equipmentSellFactor))} $`
  const ownedGear = EQUIPMENT_IDS.filter((e) => (equipment[e] ?? 0) > 0)

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{t.buildings[building]}</h3>
        <p className="flavor">{inVillage ? t.dialogs.tradeGreetingVillage : t.dialogs.tradeGreeting}</p>
        <div className="row">
          <span>{inVillage ? t.dialogs.giftsHeld : t.dialogs.cash}</span>
          <span className="price">{inVillage ? giftsOnHand : `${Math.floor(money)} $`}</span>
        </div>
        {/* Prices aligned in a table (name / price / action columns). */}
        <div className="trade-grid buy-grid">
          {goods.map((g) => (
            <div className="trade-row" key={g}>
              <span className="trade-name">{goodName(t, g)}</span>
              <span className="price">{priceLabel(g)}</span>
              <button className="hud-button" onClick={() => buy(g)} disabled={!affordable(g)}>
                {t.dialogs.buy}
              </button>
            </div>
          ))}
        </div>
        {/* Sell gear for the local currency (design.md §9). */}
        {ownedGear.length > 0 && (
          <>
            <p className="flavor">{t.dialogs.sellHeader}</p>
            <div className="trade-grid sell-grid">
              {ownedGear.map((e) => (
                <div className="trade-row" key={`sell-${e}`}>
                  <span className="trade-name">{t.equipment[e]} ({t.dialogs.stock(equipment[e] ?? 0)})</span>
                  <span className="price">{sellLabel(e)}</span>
                  <button className="hud-button" onClick={() => sellItem(e)}>{t.dialogs.sell}</button>
                </div>
              ))}
            </div>
          </>
        )}
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
  const hasRifle = useGame((s) => (s.equipment.rifle ?? 0) > 0)
  const robVillage = useGame((s) => s.robVillage)
  const setDialog = useUi((s) => s.setDialog)
  const [confirmingRob, setConfirmingRob] = useState(false)
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
        {/* Safety confirmation before the robbery (design.md §12): the deed is
            irreversible, so it takes a deliberate second confirmation. */}
        {confirmingRob && (
          <div className="rob-confirm">
            <p className="flavor danger-text">{t.dialogs.robConfirm}</p>
            <div className="actions">
              <button className="hud-button danger" onClick={robVillage}>{t.dialogs.robConfirmYes}</button>
              <button className="hud-button" onClick={() => setConfirmingRob(false)}>{t.dialogs.robCancel}</button>
            </div>
          </div>
        )}
        <div className="actions">
          {hasRifle && !confirmingRob && (
            // With a rifle in the pack the audience can be turned into a
            // robbery — a permanent regional reputation loss (design.md §12).
            <button className="hud-button danger" onClick={() => setConfirmingRob(true)}>{t.dialogs.rob}</button>
          )}
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
        {owned.length > 0 && (
          <div className="trade-grid offer-grid">
            {owned.map((id) => (
              <div className="trade-row" key={`sell-${id}`}>
                <span className="trade-name">{t.treasures[id]} ({t.dialogs.stock(treasures[id])})</span>
                <button className="hud-button" onClick={() => offerTreasure(id)}>{t.dialogs.offer}</button>
              </div>
            ))}
          </div>
        )}
        <p className="flavor">{t.dialogs.bazaarBuy}</p>
        <div className="trade-grid buy-grid">
          {TREASURE_IDS.map((id) => {
            const price = treasureBuyPrice(id, region)
            if (price === null) return null // rejected material: not stocked here
            return (
              <div className="trade-row" key={`buy-${id}`}>
                <span className="trade-name">{t.treasures[id]}</span>
                <span className="price">{price} $</span>
                <button className="hud-button" onClick={() => buyTreasure(id)} disabled={money < price}>
                  {t.dialogs.buy}
                </button>
              </div>
            )
          })}
        </div>
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
        <div className="trade-grid ferry-grid">
          {destinations.map((dest) => {
            const cost = ferryCost(from, dest)
            return (
              <div className="trade-row" key={dest.id}>
                <span className="trade-name">{t.dialogs.passage(t.places[dest.id], ferryDays(from, dest))}</span>
                <span className="price">{cost} $</span>
                <button className="hud-button" onClick={() => bookFerry(dest.id)} disabled={money < cost}>
                  {t.dialogs.book}
                </button>
              </div>
            )
          })}
        </div>
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.dialogs.leave}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Camp cache (design.md §6): move items between the pack and a free camp
 * (lootable) or a village cache (safe, Honored Friend privilege).
 */
function CampDialog({ scope, campId, placeId }: { scope: 'free' | 'village'; campId?: number; placeId?: string }) {
  const t = useStrings()
  const equipment = useGame((s) => s.equipment)
  const gifts = useGame((s) => s.gifts)
  const treasures = useGame((s) => s.treasures)
  const freeCamps = useGame((s) => s.freeCamps)
  const villageCamps = useGame((s) => s.villageCamps)
  const campStore = useGame((s) => s.campStore)
  const campTake = useGame((s) => s.campTake)
  const setDialog = useUi((s) => s.setDialog)

  const bag: ItemBag =
    scope === 'free'
      ? (freeCamps.find((c) => c.id === campId)?.items ?? emptyBag())
      : (villageCamps[placeId ?? ''] ?? emptyBag())

  const packRows: Array<{ kind: ItemKind; id: string; name: string; count: number }> = [
    ...EQUIPMENT_IDS.map((e) => ({ kind: 'equipment' as ItemKind, id: e, name: t.equipment[e], count: equipment[e] ?? 0 })),
    ...(Object.keys(gifts) as Material[]).map((m) => ({ kind: 'gift' as ItemKind, id: m, name: t.dialogs.gift(t.gifts[m]), count: gifts[m] })),
    ...TREASURE_IDS.map((id) => ({ kind: 'treasure' as ItemKind, id, name: t.treasures[id], count: treasures[id] })),
  ].filter((r) => r.count > 0)
  const bagRows: Array<{ kind: ItemKind; id: string; name: string; count: number }> = [
    ...EQUIPMENT_IDS.map((e) => ({ kind: 'equipment' as ItemKind, id: e, name: t.equipment[e], count: bag.equipment[e] ?? 0 })),
    ...(Object.keys(gifts) as Material[]).map((m) => ({ kind: 'gift' as ItemKind, id: m, name: t.dialogs.gift(t.gifts[m]), count: bag.gifts[m] ?? 0 })),
    ...TREASURE_IDS.map((id) => ({ kind: 'treasure' as ItemKind, id, name: t.treasures[id], count: bag.treasures[id] ?? 0 })),
  ].filter((r) => r.count > 0)

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{scope === 'free' ? t.dialogs.campTitle : t.dialogs.villageCampTitle}</h3>
        <p className="flavor">{scope === 'free' ? t.dialogs.campHint : t.dialogs.villageCampHint}</p>
        <p className="flavor">{t.dialogs.campPack}</p>
        {packRows.map((r) => (
          <div className="row" key={`p-${r.kind}-${r.id}`}>
            <span>{r.name} ({r.count})</span>
            <button className="hud-button" onClick={() => campStore(r.kind, r.id)}>{t.dialogs.campStore}</button>
          </div>
        ))}
        <p className="flavor">{bagItemCount(bag) > 0 ? t.dialogs.campContents : t.dialogs.campEmpty}</p>
        {bagRows.map((r) => (
          <div className="row" key={`c-${r.kind}-${r.id}`}>
            <span>{r.name} ({r.count})</span>
            <button className="hud-button" onClick={() => campTake(r.kind, r.id)}>{t.dialogs.campTake}</button>
          </div>
        ))}
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
  if (dialog.kind === 'camp') {
    return dialog.scope === 'free'
      ? <CampDialog scope="free" campId={dialog.campId} />
      : <CampDialog scope="village" placeId={dialog.placeId} />
  }
  return <TradeDialog building={dialog.building} />
}
