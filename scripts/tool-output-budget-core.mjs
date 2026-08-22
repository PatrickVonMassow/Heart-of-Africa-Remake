// Pure output-budget logic for the PreToolUse interception in
// path-scope-guard.mjs. Process execution and log writes live in
// tool-output-budget.mjs; this module only turns captured text into the bounded
// text that may re-enter a session.
//
// The error constants come from the 22.08.2026 reading of finished, non-zero
// run records under local/: 12 readable error logs, median 2,153 characters,
// p95/max 56,359. A 64 KiB first-cause maximum therefore keeps that measured
// p95 whole. The 96 KiB error channel is eight times the ordinary channel and
// leaves room for further distinct-cause excerpts without opening an unbounded
// path.

export const ORDINARY_OUTPUT_BUDGET = 12 * 1024
export const ERROR_OUTPUT_BUDGET = 96 * 1024
export const FIRST_CAUSE_HARD_MAX = 64 * 1024
export const DISTINCT_CAUSE_EXCERPT = 6 * 1024
export const PER_CALL_MAX_CHARS = ERROR_OUTPUT_BUDGET

// Constructed so the linter does not mistake an intentional ESC matcher for an
// accidental control character embedded in a regex literal.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
const FAILURE_START = /^\s*(?:FAIL\s{2,}|[×✕]\s+)(\S.*)$/

const cleanPath = (path) => String(path || 'the captured log').replace(/[\r\n]/g, ' ').slice(0, 300)

/** The one supported route back to captured detail. It is line-bounded even
 * when the caller supplies no grep. */
export function logQuery(logPath) {
  return `node scripts/verify/run-logged.mjs --show ${cleanPath(logPath)} --tail 120`
}

function omissionNotice(omitted, logPath, what = 'CHARACTERS FROM THE MIDDLE') {
  return `[tool-output budget: OMITTED ${omitted} ${what}; full output: ${logQuery(logPath)}]`
}

/**
 * Keep BOTH ends of text and replace only its middle. The assertion/error is
 * normally at the head and the summary at the tail. The notice participates in
 * the budget, and reports the exact number of source characters it replaced.
 */
export function cutMiddle(text, maxChars, { logPath = '' } = {}) {
  const source = String(text ?? '')
  if (source.length <= maxChars) return { text: source, omitted: 0, cut: false }
  if (!Number.isInteger(maxChars) || maxChars < 512) throw new RangeError('a middle-cut budget must be at least 512 characters')

  let omitted = source.length - maxChars
  let notice = omissionNotice(omitted, logPath)
  let headChars = 0
  let tailChars = 0
  // The omitted count changes the notice width at powers of ten. Converge on
  // the count represented by the final head/tail allocation.
  for (let i = 0; i < 6; i++) {
    const available = maxChars - notice.length - 2 // the two framing newlines
    if (available < 2) throw new RangeError('the log pointer does not fit in the middle-cut budget')
    headChars = Math.ceil(available / 2)
    tailChars = Math.floor(available / 2)
    omitted = source.length - headChars - tailChars
    const next = omissionNotice(omitted, logPath)
    if (next === notice) break
    notice = next
  }
  const rendered = `${source.slice(0, headChars)}\n${notice}\n${source.slice(-tailChars)}`
  return { text: rendered, omitted, cut: true }
}

function failureName(line) {
  const match = FAILURE_START.exec(String(line ?? '').replace(ANSI, ''))
  return match ? match[1].trim() : null
}

/** Every recognisable failing test name, in source order, once. */
export function failingTestNames(text) {
  const seen = new Set()
  const names = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const name = failureName(line)
    if (name && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

function signatureOf(block) {
  const lines = String(block ?? '').replace(ANSI, '').split(/\r?\n/)
  if (failureName(lines[0])) lines.shift()
  return lines.join('\n').trim().replace(/[ \t]+/g, ' ')
}

/**
 * Failure reporters put each case behind a `FAIL  …` / `× …` header. Those
 * headers are deliberately excluded from the signature: twenty cases with the
 * identical assertion and stack are one distinguishable cause, while all
 * twenty names remain in the digest's failing-test line.
 *
 * Output without such headers is one cause. Exact repeated paragraphs are the
 * fallback for tools which repeat a stack but print no test header.
 */
export function distinctErrorCauses(text) {
  const source = String(text ?? '')
  const lines = source.split(/\r?\n/)
  const starts = []
  for (let i = 0; i < lines.length; i++) if (failureName(lines[i])) starts.push(i)

  let blocks
  let signatureBlocks
  if (starts.length > 0) {
    blocks = starts.map((start, i) => lines.slice(i === 0 ? 0 : start, starts[i + 1] ?? lines.length).join('\n'))
    signatureBlocks = starts.map((start, i) => lines.slice(start, starts[i + 1] ?? lines.length).join('\n'))
  } else {
    const paragraphs = source.split(/\r?\n\s*\r?\n/).filter((part) => part.trim())
    const counts = new Map()
    for (const paragraph of paragraphs) {
      const signature = signatureOf(paragraph)
      counts.set(signature, (counts.get(signature) ?? 0) + 1)
    }
    const hasRepeat = [...counts.values()].some((count) => count > 1)
    blocks = hasRepeat ? paragraphs : [source]
    signatureBlocks = blocks
  }

  const bySignature = new Map()
  for (let i = 0; i < blocks.length; i++) {
    const signature = signatureOf(signatureBlocks[i]) || '(empty error output)'
    const prior = bySignature.get(signature)
    if (prior) {
      prior.occurrences += 1
      continue
    }
    bySignature.set(signature, { text: blocks[i], signature, occurrences: 1 })
  }
  return [...bySignature.values()]
}

function boundedNames(names, logPath) {
  if (names.length === 0) return { text: 'failing tests: (no test-name marker found)', cuts: [] }
  const rendered = `failing tests (${names.length}): ${names.join(' | ')}`
  // Names normally stay whole, but they cannot be the one unbounded field in a
  // hard-maximum digest. If their aggregate exceeds 10 KiB, preserve names at
  // both ends and spend the middle on an exact omission count plus the same
  // selective spill-log pointer as every other cut. `result.names` and the
  // captured log retain the complete list.
  const bounded = cutMiddle(rendered, 10 * 1024, { logPath })
  return { text: bounded.text, cuts: bounded.cut ? [bounded] : [] }
}

/**
 * Collapse repetition first, then protect the first distinct cause, then spend
 * the remaining generous error budget on bounded excerpts of later causes.
 */
export function budgetErrorOutput(text, { logPath = '', command = '' } = {}) {
  const source = String(text ?? '')
  const causes = distinctErrorCauses(source)
  const names = boundedNames(failingTestNames(source), logPath)
  const lines = [
    `── tool error digest ── ${String(command || 'command').slice(0, 240)}`,
    `captured ${source.length} characters → ${cleanPath(logPath)}`,
    names.text,
  ]
  const cuts = [...names.cuts]

  const first = causes[0] ?? { text: '', occurrences: 1 }
  lines.push(`── first distinct cause (${first.occurrences} occurrence${first.occurrences === 1 ? '' : 's'}) ──`)
  const firstBounded = cutMiddle(first.text, FIRST_CAUSE_HARD_MAX, { logPath })
  lines.push(firstBounded.text)
  if (firstBounded.cut) cuts.push(firstBounded)
  if (first.occurrences > 1) lines.push(`[collapsed ${first.occurrences - 1} repeated occurrence(s) with the same signature]`)

  let rendered = lines.join('\n')
  let omittedDistinct = 0
  let omittedChars = 0
  for (let i = 1; i < causes.length; i++) {
    const cause = causes[i]
    const bounded = cutMiddle(cause.text, DISTINCT_CAUSE_EXCERPT, { logPath })
    const section = [
      `── distinct cause ${i + 1} (${cause.occurrences} occurrence${cause.occurrences === 1 ? '' : 's'}; bounded excerpt) ──`,
      bounded.text,
      ...(cause.occurrences > 1 ? [`[collapsed ${cause.occurrences - 1} repeated occurrence(s) with the same signature]`] : []),
    ].join('\n')
    // Reserve enough for a final omission notice if the remaining distinct
    // causes no longer fit. Nothing already admitted is cut to make room.
    if (rendered.length + 1 + section.length <= ERROR_OUTPUT_BUDGET - 512) {
      rendered += `\n${section}`
      if (bounded.cut) cuts.push(bounded)
    } else {
      omittedDistinct += 1
      omittedChars += cause.text.length
    }
  }

  if (omittedDistinct > 0) {
    const notice = omissionNotice(omittedChars, logPath, `CHARACTERS ACROSS ${omittedDistinct} FURTHER DISTINCT CAUSE(S)`)
    rendered += `\n${notice}`
    cuts.push({ cut: true, omitted: omittedChars, text: notice })
  }

  // The fixed prefix (including a pathological command/path) is bounded above,
  // and first/further sections reserve room, so this is an invariant rather
  // than a last-minute truncation that could cut the protected first cause.
  if (rendered.length > ERROR_OUTPUT_BUDGET) {
    throw new Error(`error digest exceeded its ${ERROR_OUTPUT_BUDGET}-character hard maximum`)
  }
  return { text: rendered, cuts, causes, names: failingTestNames(source), rawChars: source.length }
}

export function budgetOrdinaryOutput(text, { logPath = '' } = {}) {
  const bounded = cutMiddle(String(text ?? ''), ORDINARY_OUTPUT_BUDGET, { logPath })
  return { text: bounded.text, cuts: bounded.cut ? [bounded] : [], rawChars: String(text ?? '').length }
}

/** The single public decision: an exit failure gets the separate error channel. */
export function budgetToolOutput({ text = '', exitCode = 0, logPath = '', command = '' } = {}) {
  const result = exitCode === 0
    ? budgetOrdinaryOutput(text, { logPath })
    : budgetErrorOutput(text, { logPath, command })
  if (result.text.length > PER_CALL_MAX_CHARS) throw new Error('tool output escaped the per-call maximum')
  return result
}
