// A start graphics level chosen from the URL for one load (design.md §21.1).
// `?quality=low|medium|high` on any deployment URL opens the session at that
// level, so a link handed to someone whose hardware is known already fits it.
// Same idiom as `?lang` (startLang.ts) and `?bench` (startBenchmark.ts); it
// lives here rather than beside benchmarkFromUrl because state/ui.ts seeds its
// initial state from it and startBenchmark.ts imports state/ui.ts.
// Pure: no store, no window. The caller passes the search string.

import { DETAIL_LEVELS, WEAK_ADAPTER_RULES, type DetailLevel } from './quality'

export const QUALITY_PARAM = 'quality'

/** A detail level (case-insensitive), or null so an unknown, empty or missing
 *  value leaves the ordinary default standing. A repeated parameter reads its
 *  first occurrence, like every other URLSearchParams.get caller here. */
export function startQualityFromUrl(search: string): DetailLevel | null {
  const value = new URLSearchParams(search).get(QUALITY_PARAM)?.toLowerCase()
  return DETAIL_LEVELS.find((level) => level === value) ?? null
}

/** Whether the first start should treat this adapter as weak (point 1562).
 *  A rule fires on the active backend's own name; only a `readsProbe` rule
 *  also looks at the probed WebGL name (see WeakAdapterRule). */
export function isWeakAdapter(adapter: string, dpr: number, rules = WEAK_ADAPTER_RULES, probed = ''): boolean {
  return rules.some((r) => {
    if (!r.pattern.test(adapter)) return false
    const probe = r.readsProbe ? probed : ''
    if (r.unless?.test(`${adapter} | ${probe}`)) return false
    return dpr >= (r.minDpr ?? 0)
  })
}

/** The level a first start without a URL-given or player-chosen level opens
 *  at: LOW on a weak adapter, MEDIUM (the ordinary default) otherwise. */
export function startDetailLevelForAdapter(adapter: string, dpr: number, probed = ''): DetailLevel {
  return isWeakAdapter(adapter, dpr, WEAK_ADAPTER_RULES, probed) ? 'low' : 'medium'
}
