// One grammar for point ownership recovered from FREE dashboard title text.
// Structured `.num` fields are machine-written and unambiguous; title text is
// prose, so dates, times, years and counts need a single provenance-aware gate.

const asKnownSet = (knownPoints) =>
  knownPoints instanceof Set ? knownPoints : new Set(Array.isArray(knownPoints) ? knownPoints : [])

/** Uncapped point numbers in a machine-written `.num` field. */
export function pointNumbersFromChip(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return []
  return String(raw)
    .split(/[+·/\s]+/)
    .map((part) => part.match(/^(\d+)(?:[a-z]+)?$/i))
    .filter(Boolean)
    .map((match) => Number(match[1]))
}

/**
 * Point ownership at the start of FREE title text.
 *
 * A single point needs the board's legacy dash/colon separator. A compound run
 * (`287+288`, `121, 130 und 146`) is already explicit ownership and may flow
 * straight into its label, matching the sync guard's established title form.
 * The sync guard additionally opts into `allowUnseparatedSingle` for its older
 * `306 Closing…` titles; keeping that exception here lets the consumer retain
 * its compatibility contract without growing another numeric parser.
 * A four-digit token is ambiguous with a year and therefore counts only when
 * `knownPoints` proves that exact TASKS point. Other lengths stay uncapped.
 *
 * Returns both the accepted points and the end of the numeric prefix so callers
 * that also need the label do not grow a second number regex.
 */
export function pointOwnershipFromTitle(raw, options = {}) {
  if (typeof raw !== 'string') return { points: [], prefixEnd: 0 }
  const title = raw.trimStart()
  const known = asKnownSet(options?.knownPoints)
  const points = []
  let cursor = 0
  let compoundNeedsTitleSeparator = false

  const takeNumber = () => {
    const match = title.slice(cursor).match(/^(\d+)(?![\w%.]|:\d|-\d)/)
    if (!match) return false
    points.push(Number(match[1]))
    cursor += match[0].length
    return true
  }

  if (!takeNumber()) return { points: [], prefixEnd: 0 }
  for (;;) {
    const separator = title.slice(cursor).match(/^\s*(?:[+·/,&]|und)\s*/i)
    if (!separator) break
    if (/^(?:,|&|und)$/i.test(separator[0].trim())) compoundNeedsTitleSeparator = true
    const beforeSeparator = cursor
    cursor += separator[0].length
    if (!takeNumber()) {
      cursor = beforeSeparator
      break
    }
  }

  const titleSeparator = title.slice(cursor).match(/^\s*(?:[—–]|:(?!\d))\s*/)
  if (points.length === 1 && !titleSeparator && options?.allowUnseparatedSingle !== true) {
    return { points: [], prefixEnd: 0 }
  }
  if (points.length > 1 && compoundNeedsTitleSeparator && !titleSeparator) {
    return { points: [], prefixEnd: 0 }
  }
  if (titleSeparator) cursor += titleSeparator[0].length

  const accepted = [...new Set(points)].filter((point) => String(point).length !== 4 || known.has(point))
  return { points: accepted, prefixEnd: accepted.length ? raw.length - title.length + cursor : 0 }
}

/** Every checkbox point, including DEFERRED ones, for title provenance. */
export function taskPointNumbers(text) {
  const points = new Set()
  if (typeof text !== 'string') return points
  for (const line of text.split('\n')) {
    const match = line.match(/^- \[[ x]\] (\d+)\./)
    if (match) points.add(Number(match[1]))
  }
  return points
}
