// Pure decision core of the bundle-first Stop-hook guard (bundle-first-guard.mjs
// is the thin fail-open wrapper).
//
// THE RULE, until now memory only (`bundle-first-not-new-point`): a new finding
// JOINS AN EXISTING BUNDLE POINT, and a standalone point is the exception. The
// bundling itself lives in `docs/work-packages.md`, whose own text states the
// property this guard makes true:
//
//   "Every open point in TASKS.md appears in exactly one bundle here, or in the
//    unbundled list below. A new point joins a bundle when it is appended."
//
// WHY A GUARD AND NOT A REMINDER. The scheme was written on 29.07.2026 and had
// drifted WITHIN THE HOUR — it covered 53 of 91 open points and listed one
// already-closed point — because nothing compared it against the work order.
// That is the same failure class the whole guard chain exists for: a rule that
// lives only as prose is a rule nobody checks. So the check runs at the turn
// end, over the FULL open set rather than only over the newest point: a point
// that silently left a bundle is caught by exactly the same comparison as one
// that never joined.
//
// WHAT COUNTS AS PLACED: a number in a bundle row's Points cell, or a number in
// the "Not bundled" list. Listing in that list IS the exemption — the section's
// own heading carries the reasons ("each for its own reason"), and demanding
// prose per bullet would make the guard block on a formatting nicety instead of
// on the drift it exists to catch.
//
// FAIL DIRECTION: allow. An unreadable or restructured work-packages file, an
// empty work order, any throw — all allow. The wrapper is fail-open on top.
import { parseOpenPoints } from './queue-order-guard-core.mjs'

/** The heading that opens the bundle table, and the one that closes the section. */
export const BUNDLES_HEADING = '## The bundles'
export const UNBUNDLED_MARKER = '**Not bundled**'

/** Dates (`30.07.2026`) carry numbers that are not point numbers. */
const stripDates = (s) => String(s ?? '').replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, ' ')

/** Point numbers in a cell or bullet: 1–3 digits, dates removed first. */
export function numbersIn(text) {
  const out = []
  for (const m of stripDates(text).matchAll(/\b(\d{1,3})\b/g)) out.push(Number(m[1]))
  return out
}

/**
 * The bundles as `[{ name, id, points }]`, in document order. A row is a bundle
 * row when it has the table's five pipes and its id cell is a single letter —
 * the header and its separator therefore drop out by shape, not by counting.
 */
export function parseBundles(md) {
  const text = String(md ?? '')
  const at = text.indexOf(BUNDLES_HEADING)
  if (at < 0) return []
  const section = text.slice(at)
  const end = section.indexOf(UNBUNDLED_MARKER)
  const body = end < 0 ? section : section.slice(0, end)
  const bundles = []
  for (const line of body.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 6) continue
    const [, name, id, , points] = cells
    if (!/^[A-Z]$/.test(id)) continue
    bundles.push({ name: name.replace(/\*/g, '').trim(), id, points: new Set(numbersIn(points)) })
  }
  return bundles
}

/** The deliberately unbundled points, with the bullet each was read from. */
export function parseUnbundled(md) {
  const text = String(md ?? '')
  const at = text.indexOf(UNBUNDLED_MARKER)
  if (at < 0) return { points: new Set(), bullets: [] }
  const rest = text.slice(at)
  const nextHeading = rest.indexOf('\n## ')
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading)
  const points = new Set()
  const bullets = []
  for (const line of section.split('\n')) {
    const m = line.match(/^[-*]\s+(.+)$/)
    if (!m) continue
    // Both spellings the section uses: the bold `- **285** — reason` and the
    // plain `- 285 — reason`. Reading only the bold one would leave a plainly
    // written exemption unread, and its point would report as drift — a false
    // block, which is the one thing this guard may not do.
    const rest = m[1].trim()
    const bold = rest.match(/^\*\*([^*]+)\*\*([\s\S]*)$/)
    const plain = bold ? null : rest.match(/^([0-9][0-9,\s]*)([\s\S]*)$/)
    const shape = bold || plain
    if (!shape) continue
    const nums = numbersIn(shape[1])
    if (!nums.length) continue
    for (const n of nums) points.add(n)
    bullets.push({ points: nums, reason: shape[2].replace(/^[\s—–.-]+/, '').trim() })
  }
  return { points, bullets }
}

/** Open points that appear in no bundle and in no "Not bundled" bullet. */
export function unplacedPoints(openSet, bundles, unbundled) {
  const open = openSet instanceof Set ? openSet : new Set()
  const placed = new Set(unbundled instanceof Set ? unbundled : [])
  for (const b of bundles || []) for (const n of b.points) placed.add(n)
  return [...open].filter((n) => !placed.has(n)).sort((a, b) => a - b)
}

/** The remedy sentence, one copy, so the guard and its `--status` agree. */
export function bundleRemedy(missing) {
  return (
    `place ${missing.length === 1 ? 'it' : 'them'} in the bundle whose files ${missing.length === 1 ? 'it' : 'they'} ` +
    'touch (the table under "## The bundles" in docs/work-packages.md — the split follows SHARED FILES, so the ' +
    'bundle says which points must not run in parallel), or add it to the "Not bundled" list with the reason it ' +
    'stands alone. Then re-run: node scripts/bundle-first-guard.mjs --status'
  )
}

/** How many unplaced points the block message names before it truncates. */
export const MAX_NAMED = 40

/** Top-level decision on the two raw file contents. Total: any bad input → allow. */
export function evaluate({ tasksMd, workPackagesMd } = {}) {
  try {
    if (typeof workPackagesMd !== 'string' || !workPackagesMd.trim()) return { block: false, reason: '' }
    const bundles = parseBundles(workPackagesMd)
    // No parseable bundle table means the document was restructured, not that
    // every point is unbundled. A guard must never block on its own parse miss.
    if (!bundles.length) return { block: false, reason: '' }

    const open = parseOpenPoints(tasksMd)
    if (open.size === 0) return { block: false, reason: '' }

    const { points: unbundled } = parseUnbundled(workPackagesMd)
    const missing = unplacedPoints(open, bundles, unbundled)
    if (!missing.length) return { block: false, reason: '' }

    const named = missing.slice(0, MAX_NAMED).join(', ')
    const more = missing.length > MAX_NAMED ? ` … and ${missing.length - MAX_NAMED} more` : ''
    return {
      block: true,
      missing,
      reason:
        `BUNDLE MEMBERSHIP DRIFTED: ${missing.length} open point(s) appear in no bundle of ` +
        `docs/work-packages.md and in no "Not bundled" entry — ${named}${more}. A new finding JOINS an ` +
        'existing bundle (memory bundle-first-not-new-point); a standalone point is the exception, and the ' +
        'bundle scheme is only worth having while it matches the open set — it drifted within an hour of ' +
        `being written because nothing compared the two. So: ${bundleRemedy(missing)}`,
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must not depend on luck
  }
}
