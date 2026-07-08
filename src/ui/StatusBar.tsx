// Status bar (design.md §17 / CLAUDE.md §7.1.9): date, money, provisions,
// gifts, hand item, current region. The permanent coordinate display was
// removed (design.md §17); coordinates are available on demand via the
// position query (P). All labels come from the language files.

import { useGame, totalGifts, handItemName } from '../state/store'
import { START_YEAR } from '../config/balance'
import { useStrings } from '../i18n'

export function StatusBar() {
  const t = useStrings()
  const day = useGame((s) => s.day)
  const money = useGame((s) => s.money)
  const foodDays = useGame((s) => s.foodDays)
  const gifts = useGame((s) => s.gifts)
  const handItem = useGame((s) => s.handItem)
  const region = useGame((s) => s.region)
  const mode = useGame((s) => s.mode)
  const placeId = useGame((s) => s.placeId)

  const weeks = t.formatDecimal(foodDays / 7)
  const placeName = mode === 'place' && placeId ? t.places[placeId] : null

  return (
    <div className="status-bar">
      <span className="stat"><b>{t.status.date}</b> {t.formatDate(day, START_YEAR)}</span>
      <span className="stat"><b>{t.status.cash}</b> {Math.floor(money)} $</span>
      <span className="stat"><b>{t.status.provisions}</b> {t.status.provisionsWeeks(weeks)}</span>
      <span className="stat"><b>{t.status.gifts}</b> {totalGifts(gifts)}</span>
      <span className="stat"><b>{t.status.hand}</b> {handItem ? handItemName(handItem) : t.status.handEmpty}</span>
      <span className="stat"><b>{t.status.region}</b> {t.regions[region]}{placeName ? ` · ${placeName}` : ''}</span>
    </div>
  )
}
