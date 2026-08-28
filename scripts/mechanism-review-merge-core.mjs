// SAFE THREE-WAY MERGE FOR THE APPEND-ONLY REVIEW LEDGER.
//
// A text or `union` driver cannot distinguish two legitimate appends from an
// edit to an existing review. This resolver can: each tip must contain the
// ancestor byte-for-byte as its prefix, followed only by complete JSONL rows.
// Only then are the appended raw rows unioned and ordered by their `at` stamps.
// The ancestor stays byte-for-byte first and in its recorded order: it is the
// history future append-only checks must continue to recognize. Raw spelling is
// retained throughout so the merge cannot rewrite evidence while parsing it.

export class LedgerMergeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LedgerMergeError'
  }
}

function rowsOf(text, side) {
  const source = String(text ?? '')
  if (!source) return []
  const rows = source.endsWith('\n') ? source.slice(0, -1).split('\n') : source.split('\n')
  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index]
    if (!line) throw new LedgerMergeError(`${side} line ${index + 1} is blank, not JSON`)
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      throw new LedgerMergeError(`${side} line ${index + 1} is not JSON: ${error.message}`)
    }
    if (!record || typeof record !== 'object' || Array.isArray(record) || !Number.isFinite(record.at)) {
      throw new LedgerMergeError(`${side} line ${index + 1} has no finite numeric "at" stamp`)
    }
  }
  return rows
}

function assertAppendOnly(base, tip, side) {
  if (tip.length < base.length) {
    throw new LedgerMergeError(`${side} deleted ${base.length - tip.length} ancestor row(s)`)
  }
  for (let index = 0; index < base.length; index += 1) {
    if (tip[index] !== base[index]) {
      throw new LedgerMergeError(`${side} modified or reordered ancestor line ${index + 1}`)
    }
  }
}

function rowCounts(rows) {
  const counts = new Map()
  for (const line of rows) counts.set(line, (counts.get(line) ?? 0) + 1)
  return counts
}

function maximumRowCounts(currentRows, otherRows) {
  const maximum = rowCounts(currentRows)
  for (const [line, count] of rowCounts(otherRows)) {
    maximum.set(line, Math.max(maximum.get(line) ?? 0, count))
  }
  return maximum
}

function rowsAtMaximumMultiplicity(currentRows, otherRows) {
  return [...maximumRowCounts(currentRows, otherRows)].flatMap(([line, count]) => Array(count).fill(line))
}

function assertUnionMultiplicity(outputRows, currentRows, otherRows) {
  const expected = maximumRowCounts(currentRows, otherRows)
  const actual = rowCounts(outputRows)
  if (
    actual.size !== expected.size ||
    [...expected].some(([line, count]) => actual.get(line) !== count)
  ) {
    throw new LedgerMergeError('internal error: the union has the wrong row multiplicity')
  }
}

/**
 * Resolve the three blobs Git hands to a custom merge driver.
 *
 * The returned text starts with the unchanged ancestor, followed by the union
 * of both appended tails. That union keeps the greater occurrence count from
 * either tip for every raw row, so shared appends collapse but repeated reviews
 * do not. Sorting applies only to those tails and uses the raw row as the
 * tie-breaker, so reversing ours/theirs cannot change the merge result when two
 * records have the same millisecond stamp.
 */
export function mergeMechanismReviewLedger({ ancestor = '', current = '', other = '' } = {}) {
  const baseRows = rowsOf(ancestor, 'ancestor')
  const currentRows = rowsOf(current, 'current tip')
  const otherRows = rowsOf(other, 'other tip')
  assertAppendOnly(baseRows, currentRows, 'current tip')
  assertAppendOnly(baseRows, otherRows, 'other tip')

  const appendedRows = rowsAtMaximumMultiplicity(
    currentRows.slice(baseRows.length),
    otherRows.slice(baseRows.length),
  )
  const records = appendedRows.map((line) => ({ line, at: JSON.parse(line).at }))
  records.sort((a, b) => a.at - b.at || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0))

  const outputRows = [...baseRows, ...records.map(({ line }) => line)]
  assertUnionMultiplicity(outputRows, currentRows, otherRows)
  return outputRows.length ? `${outputRows.join('\n')}\n` : ''
}
