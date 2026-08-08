// The debug menu's structure (design.md §21.3, point 393): the ids of its
// collapsible control groups, the order they are rendered in, and the pure
// filter match. Kept out of DebugMenu.tsx so that file exports only its
// component (fast refresh) and so the filter can be tested without a render.

import type { Strings } from '../i18n/types'

/** The id of a collapsible control group; the localized names live in the
 *  language files under `debug.groups`. */
export type DebugGroupId = keyof Strings['debug']['groups']

/**
 * The fixed order the groups are rendered in — roughly the order a calibration
 * pass walks them: how the traveller moves, how the journey runs, how he
 * survives it, what lives around him, then the world's dressing, the trade, the
 * events, the presentation, and the two testing surfaces last.
 */
export const DEBUG_GROUP_ORDER: readonly DebugGroupId[] = [
  'movement',
  'travel',
  'survival',
  'wildlife',
  'settlement',
  'weather',
  'economy',
  'events',
  'graphics',
  'jump',
  'tools',
]

/**
 * Does a control's label match the filter query? A case-insensitive substring
 * match on the LOCALIZED label, so the same field is found under its English
 * and its German name. An empty (or blank) query matches everything, which is
 * what restores the full menu when the field is cleared.
 */
export function matchesDebugFilter(label: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return label.toLowerCase().includes(q)
}
