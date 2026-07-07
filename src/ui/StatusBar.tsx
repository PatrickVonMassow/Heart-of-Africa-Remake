// Status bar (design.md §17 / CLAUDE.md §7.1.9): date, money, provisions,
// gifts, hand item, current region — plus the coordinate display. All labels
// come from the language files (design.md §17 localization).

import { useGame, totalGifts, handItemName } from '../state/store'
import { placeById, worldToLatLon } from '../world/geo'
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
  const pos = useGame((s) => s.pos)
  const mode = useGame((s) => s.mode)
  const placeId = useGame((s) => s.placeId)

  const coords =
    mode === 'place' && placeId
      ? { lat: placeById(placeId).lat, lon: placeById(placeId).lon }
      : worldToLatLon(pos.x, pos.z)

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
      <span className="spacer" />
      <span className="stat coords">{t.formatLatLon(coords.lat, coords.lon)}</span>
    </div>
  )
}
