// Health bar (design.md §17.1): a filled bar that is green at full health and
// shades ever redder toward zero, with the active afflictions shown as badges
// to its left (fever, dehydration, sun blindness, wounds). Lives inside the
// status bar's right end, so the journal panel can never cover it.

import { useGame } from '../state/store'
import { balance } from '../config/balance'
import { useStrings } from '../i18n'

export function HealthBar() {
  const t = useStrings()
  const health = useGame((s) => s.health)
  const afflictions = useGame((s) => s.afflictions)
  const frac = Math.max(0, Math.min(1, health / balance.health.max))
  // Hue sweeps green (120°) → red (0°) as health drops, so the colour reads
  // the condition at a glance without needing the H query.
  const hue = Math.round(120 * frac)
  const badges = [
    afflictions.fever ? t.health.fever : null,
    afflictions.dehydration ? t.health.dehydration : null,
    afflictions.sunblind ? t.health.sunblind : null,
    afflictions.wounds === 1 ? t.health.woundsLight : afflictions.wounds === 2 ? t.health.woundsSevere : null,
  ].filter((x): x is string => x !== null)
  return (
    <div className="health-status">
      {badges.map((label) => (
        <span key={label} className="affliction-badge">
          {label}
        </span>
      ))}
      <div className="health-bar" title={t.hud.healthBar} aria-label={t.hud.healthBar}>
        <div
          className="health-bar-fill"
          data-hue={hue}
          style={{ width: `${frac * 100}%`, background: `hsl(${hue}, 68%, 44%)` }}
        />
      </div>
    </div>
  )
}
