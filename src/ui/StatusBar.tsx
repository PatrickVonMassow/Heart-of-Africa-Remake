// Status bar (design.md §17 / CLAUDE.md §7.1.9): date, money, provisions,
// gifts, current region — each led by a narrow expedition-styled SYMBOL
// instead of a word (the localized word stays as the tooltip/aria label).
// Transient status hints render in the bar's CENTRE, and the health bar with
// its affliction badges sits at the bar's right end, where the journal panel
// can never cover it. The permanent coordinate display and the "in hand" item
// were removed (design.md §17/§11); coordinates are read on demand via the
// position query (P).

import type { ReactNode } from 'react'
import { useGame, totalGifts } from '../state/store'
import { START_YEAR } from '../config/balance'
import { useStrings } from '../i18n'
import { useUi } from '../state/ui'
import { movementPenalty } from '../systems/movement'
import { worldToLatLon } from '../world/geo'
import { sampleTerrain } from '../world/terrain'
import { HealthBar } from './HealthBar'

/**
 * Movement-penalty hint (design.md §11/§17): while travelling, when the current
 * terrain slows the traveller (a missing relief item, or the canoe on land) it
 * names the cause and remedy. Rendered inside the status bar's centre slot so
 * it reads as part of the bar rather than a panel floating over the scene.
 */
function MovementPenalty() {
  const t = useStrings()
  const mode = useGame((s) => s.mode)
  const pos = useGame((s) => s.pos)
  const equipment = useGame((s) => s.equipment)
  const seed = useGame((s) => s.seed)
  const dialog = useUi((s) => s.dialog)
  if (mode !== 'travel' || dialog) return null
  const ll = worldToLatLon(pos.x, pos.z)
  const reason = movementPenalty(sampleTerrain(ll.lat, ll.lon, seed).type, equipment)
  if (!reason) return null
  return <span className="movement-penalty">{t.hud.movementPenalty[reason]}</span>
}

// Narrow line-drawn symbols in the HUD's engraved style (stroke currentColor,
// tinted by .stat-icon). Each stat keeps its localized word as title/aria.
const icon = (children: ReactNode) => (
  <svg className="stat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    {children}
  </svg>
)
const CalendarIcon = () =>
  icon(
    <>
      <rect x="2" y="3.5" width="12" height="10" rx="1" />
      <path d="M2 6.5h12M5 1.8v3M11 1.8v3" />
    </>,
  )
const CoinsIcon = () =>
  icon(
    <>
      <ellipse cx="8" cy="4.6" rx="5" ry="2.1" />
      <path d="M3 4.6v3.2c0 1.16 2.24 2.1 5 2.1s5-.94 5-2.1V4.6M3 7.8V11c0 1.16 2.24 2.1 5 2.1s5-.94 5-2.1V7.8" />
    </>,
  )
const SackIcon = () =>
  icon(
    <>
      <path d="M6 3.2h4l1.4 2.2c1.2 1.8 1.9 3.3 1.9 4.9 0 2.3-2.4 3.6-5.3 3.6s-5.3-1.3-5.3-3.6c0-1.6.7-3.1 1.9-4.9L6 3.2Z" />
      <path d="M5.6 3.2h4.8M6.6 1.6l.7 1.6M9.4 1.6l-.7 1.6" />
    </>,
  )
const GiftIcon = () =>
  icon(
    <>
      <rect x="2.5" y="6" width="11" height="8" rx="0.8" />
      <path d="M2.5 9h11M8 6v8M8 6C6 6 4.4 4.9 4.4 3.7 4.4 2.8 5.1 2.2 6 2.2c1.3 0 2 1.5 2 3.8Zm0 0c2 0 3.6-1.1 3.6-2.3 0-.9-.7-1.5-1.6-1.5-1.3 0-2 1.5-2 3.8Z" />
    </>,
  )
const CompassIcon = () =>
  icon(
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M10.6 5.4 9 9l-3.6 1.6L7 7l3.6-1.6Z" />
    </>,
  )

export function StatusBar() {
  const t = useStrings()
  const day = useGame((s) => s.day)
  const money = useGame((s) => s.money)
  const foodDays = useGame((s) => s.foodDays)
  const gifts = useGame((s) => s.gifts)
  const region = useGame((s) => s.region)
  const mode = useGame((s) => s.mode)
  const placeId = useGame((s) => s.placeId)

  const weeks = t.formatDecimal(foodDays / 7)
  const placeName = mode === 'place' && placeId ? t.places[placeId] : null

  const stat = (label: string, iconEl: ReactNode, value: string) => (
    <span className="stat" title={label} aria-label={label}>
      {iconEl}
      {value}
    </span>
  )

  return (
    <div className="status-bar">
      <div className="status-stats">
        {stat(t.status.date, <CalendarIcon />, t.formatDateShort(day, START_YEAR))}
        {stat(t.status.cash, <CoinsIcon />, `${Math.floor(money)} $`)}
        {stat(t.status.provisions, <SackIcon />, t.status.provisionsWeeks(weeks))}
        {stat(t.status.gifts, <GiftIcon />, `${totalGifts(gifts)}`)}
        {stat(t.status.region, <CompassIcon />, `${t.regions[region]}${placeName ? ` · ${placeName}` : ''}`)}
      </div>
      <div className="status-hints">
        <MovementPenalty />
      </div>
      <div className="status-health">
        <HealthBar />
      </div>
    </div>
  )
}
