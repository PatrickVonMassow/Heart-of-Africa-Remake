// Status bar (design.md §17 / CLAUDE.md §7.1.9): date, money, provisions,
// gifts, hand item, current region — plus the coordinate display.

import { useGame, formatDate, totalGifts, EQUIPMENT_NAMES } from '../state/store'
import { REGION_NAMES, formatLatLon, placeById, worldToLatLon } from '../world/geo'

export function StatusBar() {
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

  const weeks = (foodDays / 7).toFixed(1).replace('.', ',')
  const placeName = mode === 'place' && placeId ? placeById(placeId).name : null

  return (
    <div className="status-bar">
      <span className="stat"><b>Datum</b> {formatDate(day)}</span>
      <span className="stat"><b>Kasse</b> {Math.floor(money)} $</span>
      <span className="stat"><b>Proviant</b> {weeks} Wochen</span>
      <span className="stat"><b>Gaben</b> {totalGifts(gifts)}</span>
      <span className="stat"><b>In der Hand</b> {handItem ? EQUIPMENT_NAMES[handItem] : '—'}</span>
      <span className="stat"><b>Region</b> {REGION_NAMES[region]}{placeName ? ` · ${placeName}` : ''}</span>
      <span className="spacer" />
      <span className="stat coords">{formatLatLon(coords)}</span>
    </div>
  )
}
