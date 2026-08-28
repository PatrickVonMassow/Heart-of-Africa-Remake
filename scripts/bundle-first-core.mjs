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
// AND EXACTLY ONE HOME, both directions. The document says "exactly one", and
// the guard long checked only that a point had AT LEAST one: the memberships
// were unioned, so a point standing in two bundles could never fail. That was
// the only safe reading while the reader guessed numbers out of prose, because
// another bundle's prose naming a point placed it there; with marked
// references the membership is canonical and the second direction is checked
// too (round-ten review finding on point 1003).
//
// FAIL DIRECTION: allow. An unreadable or restructured work-packages file, an
// empty work order, any throw — all allow. The wrapper is fail-open on top.
import { parseOpenPoints } from './queue-order-guard-core.mjs'

/** The heading that opens the bundle table, and the one that closes the section. */
export const BUNDLES_HEADING = '## The bundles'
export const UNBUNDLED_MARKER = '**Not bundled**'

/**
 * THE CELL MARKS ITS REFERENCES (point 1003). A point number in a bundle's
 * Points cell or in a "Not bundled" bullet counts as a reference only where it
 * is written `#123`. Everything else in the cell is prose the reader does not
 * look at, whatever it contains.
 *
 * WHY THE PROSE IS NOT READ AT ALL. The reader used to take every 1-to-4-digit
 * token in the whole cell and subtract known date shapes first. Four
 * cross-vendor review rounds refused that on 28.08.2026 (`4c4b61f`, `0e52672`,
 * `9ff620f`, `11f3163`), and each round closed the form the round before had
 * named and earned a new one: a bare year deleted real point numbers, a bounded
 * leading day swallowed the number standing in front of a month name, and what
 * remained was inherent — a four-digit QUANTITY in prose counts as a point, and
 * any date form the strip list does not know leaves its numbers behind. A
 * regular expression over prose cannot tell a reference from a measurement, so
 * the CELL says which numbers are references and the reader stops guessing.
 * With the guessing gone the strip list and the digit bound go with it: a
 * reference is `#` and any run of digits, of any length.
 *
 * A LEADING LIST WOULD NOT HAVE BEEN ENOUGH (five-round review finding): a cell
 * that OPENS with `2026-08-28` or `1440 px` opens with digits, so a
 * position-based rule places 2026 and 1440. The marker sits ON the reference
 * itself and has no such edge.
 */
export function referenceList(text) {
  // THE MARKER OPENS WHERE A REFERENCE CAN OPEN, and the set of places is
  // NAMED rather than subtracted (review findings): the start of the cell, or
  // after whitespace, a comma, or the emphasis and grouping characters Markdown
  // puts in front of one — `(#12`, `**#12**`, `__#12__`, `*#12*`, `[#12`. Every
  // other neighbour makes it something else: `&#123;` is an entity, `/x#12` a
  // URL fragment, `](#12)` a link anchor, `` `#12` `` a code span, `\\#12` an
  // escape, `a#12` and `##12` neither. A blacklist would have to know every one
  // of those; the whitelist has to know only where a reference may stand.
  //
  // ONLY A RUN THAT COMES BACK UNCHANGED (round-eleven and round-twelve review
  // findings). "Any run of digits" is the contract, but `Number` collapses
  // everything past 2^53: `#9007199254740993` becomes `#9007199254740992`, so
  // two different references would read as one point and could be reported as a
  // point standing in two homes. Refusing every run above the safe range was the
  // wrong cut — it threw away `#9007199254740992`, which converts exactly, and a
  // legitimate home would have been reported missing. So the run is kept exactly
  // when the number spells it back: aliasing is impossible, and no reference that
  // survives the conversion is lost. Leading zeros are a spelling, not a
  // different number, and are normalised before the comparison.
  return [...String(text ?? '').matchAll(/(?<=^|[\s,([*_])(?<!\]\()#(\d+)(?![0-9A-Za-z#])/g)]
    .map((m) => ({ digits: m[1], value: Number(m[1]) }))
    // COMPARED AS INTEGERS, NOT AS TEXT (round-thirteen review finding): a
    // number's own spelling switches to exponential past 10^21, so a text
    // comparison threw away `#1000000000000000000000`, which converts exactly.
    // BigInt compares the values themselves and cares about neither the
    // notation nor a leading zero.
    .filter(({ digits, value }) => Number.isInteger(value) && BigInt(value) === BigInt(digits))
    .map(({ value }) => value)
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
    // `list` keeps the references IN ORDER and with their repeats, so a point
    // named twice in one cell is still two placements; `points` stays the set
    // every membership question is asked of.
    const list = referenceList(points)
    bundles.push({ name: name.replace(/\*/g, '').trim(), id, points: new Set(list), list })
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
  // A bullet's exemptions are its MARKED references, wherever in the bullet they
  // stand — the old reader had to know the two spellings the section happens to
  // use (`- **285** — reason` and `- 285 — reason`) and read a leading span, and
  // a third spelling would have gone unread and reported its point as drift. The
  // marker needs no spelling.
  // THE ENTRY IS NUMBERED WHERE IT STANDS (round-twelve review finding). A
  // duplicate is fixed by deleting one of two entries, so the number a message
  // prints has to be the bullet a reader counts in the document — not the
  // ordinal among the bullets that happened to parse, which shifts by one for
  // every prose bullet standing in front of it.
  let ordinal = 0
  for (const line of section.split('\n')) {
    // EVERY MARKDOWN BULLET, NOT THE TWO THIS SECTION HAPPENS TO USE
    // (round-thirteen review finding): `+` is a list marker like `-` and `*`,
    // and up to three spaces of indentation still opens a top-level item. A
    // bullet the reader does not see is a bullet whose exemption does not
    // count AND a bullet the numbering skips, so both halves ride on this line.
    const m = line.match(/^ {0,3}[-*+]\s+(.+)$/)
    if (!m) continue
    ordinal += 1
    const body = m[1].trim()
    const nums = referenceList(body)
    if (!nums.length) continue
    for (const n of nums) points.add(n)
    bullets.push({
      index: ordinal,
      points: nums,
      reason: body
        .replace(/^(?:\*\*)?#\d+(?:[,\s]+#\d+)*(?:\*\*)?/, '')
        .replace(/^[\s—–.-]+/, '')
        .trim(),
    })
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

/**
 * Open points with MORE THAN ONE home — the second half of the invariant this
 * document states about itself ("exactly once"), and the round-ten review
 * finding. `unplacedPoints` unions the memberships, so it can only ever see a
 * point with NO home: a point standing in two bundle rows, or in a bundle and
 * in "Not bundled", passed it silently and the guard reported no drift. While
 * the reader guessed numbers out of prose the union was the only safe reading,
 * because another bundle's prose naming a point would have placed it there;
 * marked references make the membership canonical, which makes the other half
 * checkable too.
 *
 * Each entry names WHERE the point stands, because a duplicate is fixed by
 * deleting one of the two references and the reader has to be told which two.
 */
export function duplicateHomes(openSet, bundles, unbundled) {
  const open = openSet instanceof Set ? openSet : new Set()
  const homes = new Map()
  const add = (n, home) => {
    if (!open.has(n)) return
    homes.set(n, [...(homes.get(n) ?? []), home])
  }
  // EVERY OCCURRENCE IS A PLACEMENT, not every container (round-eleven review
  // finding). Reading the bundle's SET and the exemption section's union made
  // two "Not bundled" bullets naming the same point — or one cell naming it
  // twice — read as a single placement, and left the message unable to say
  // which two entries to look at. So each occurrence is counted where it
  // stands, and each home names the entry a reader can go and delete.
  for (const b of bundles || []) for (const n of b.list ?? [...b.points]) add(n, b.id)
  const bullets = Array.isArray(unbundled?.bullets) ? unbundled.bullets : null
  if (bullets) {
    bullets.forEach((bullet, i) => {
      const where = `"Not bundled" bullet ${bullet.index ?? i + 1}`
      for (const n of bullet.points ?? []) add(n, where)
    })
  } else {
    const set = unbundled instanceof Set ? unbundled : unbundled?.points
    for (const n of set instanceof Set ? set : []) add(n, 'Not bundled')
  }
  return [...homes.entries()]
    .filter(([, where]) => where.length > 1)
    .map(([point, where]) => ({ point, homes: where }))
    .sort((a, b) => a.point - b.point)
}

/** The remedy for a point standing in two homes: one copy, same reason. */
export function duplicateRemedy(duplicates) {
  return (
    `delete the reference that does not belong, so ${duplicates.length === 1 ? 'it' : 'each of them'} stands in ` +
    'exactly one bundle row or in the "Not bundled" list — the split follows SHARED FILES, so two homes say two ' +
    'different things about what may run in parallel. Then re-run: node scripts/bundle-first-guard.mjs --status'
  )
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
    // The same holds for a PARTIAL restructure (review finding): with the
    // exemption marker renamed, the rows still parse while every exemption goes
    // unread, and each deliberately unbundled point would be reported as drift.
    // Half a document read is a parse miss too.
    if (!workPackagesMd.includes(UNBUNDLED_MARKER)) return { block: false, reason: '' }

    const open = parseOpenPoints(tasksMd)
    if (open.size === 0) return { block: false, reason: '' }

    const exemptions = parseUnbundled(workPackagesMd)
    const missing = unplacedPoints(open, bundles, exemptions.points)
    const duplicates = duplicateHomes(open, bundles, exemptions)
    if (!missing.length && !duplicates.length) return { block: false, reason: '' }

    const parts = []
    if (missing.length) {
      const named = missing.slice(0, MAX_NAMED).join(', ')
      const more = missing.length > MAX_NAMED ? ` … and ${missing.length - MAX_NAMED} more` : ''
      parts.push(
        `${missing.length} open point(s) appear in no bundle of docs/work-packages.md and in no ` +
        `"Not bundled" entry — ${named}${more}. A new finding JOINS an existing bundle (memory ` +
        'bundle-first-not-new-point); a standalone point is the exception, and the bundle scheme is only ' +
        'worth having while it matches the open set — it drifted within an hour of being written because ' +
        `nothing compared the two. So: ${bundleRemedy(missing)}`,
      )
    }
    if (duplicates.length) {
      const named = duplicates
        .slice(0, MAX_NAMED)
        .map((d) => `${d.point} (${d.homes.join(' and ')})`)
        .join(', ')
      const more = duplicates.length > MAX_NAMED ? ` … and ${duplicates.length - MAX_NAMED} more` : ''
      parts.push(
        `${duplicates.length} open point(s) stand in more than one home — ${named}${more}. The document ` +
        'states of itself that every open point appears there EXACTLY once, and two homes contradict each ' +
        `other about which points must not run in parallel. So: ${duplicateRemedy(duplicates)}`,
      )
    }
    return {
      block: true,
      missing,
      duplicates,
      reason: `BUNDLE MEMBERSHIP DRIFTED: ${parts.join(' ')}`,
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must not depend on luck
  }
}
