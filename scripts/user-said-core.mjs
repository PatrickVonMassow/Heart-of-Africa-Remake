// WHAT THE USER SAID, AND WHEN — the pure half of scripts/user-said.mjs.
//
// WHY THIS EXISTS. On 20.08.2026 the user asked why an answered question was
// still on the board. Answering it needed four timestamps: when the question was
// asked, when he answered, when the card was published, when it was republished.
// Nothing in this repository reads the session transcripts, so the search ran as
// hand-written node one-liners that printed raw conversation prose — about 25k
// tokens pulled into a context that every later reply re-sends. The answer was
// four lines long. That ratio is the defect this file removes.
//
// THE RULE IT SERVES: a recurring lookup becomes a command with COMPACT output —
// one line per hit, the full text only for the hit that matters. A tool that
// prints everything is the context dump it was meant to replace, so truncation
// is on by default and `--full` is the deliberate exception.
//
// WHAT COUNTS AS A HUMAN MESSAGE is the whole difficulty. A transcript's `user`
// entries are mostly NOT the user: tool results, hook context, IDE notices and
// slash-command echoes all arrive wearing the same role. Only entries the harness
// itself marks `origin.kind === 'human'` are his words, and even those carry
// harness wrappers that say nothing about what he wanted. Both filters are here,
// with the fixtures that pin them.

/** Harness-generated text that arrives inside a genuine human turn. */
export const NOISE_PREFIXES = [
  '<ide_opened_file>',
  '<ide_selection>',
  '<local-command-caveat>',
  '<command-name>',
  '<command-message>',
  '<local-command-stdout>',
  '<system-reminder>',
]

/** The transcript directory the harness uses for a working directory. */
export function projectDirName(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-')
}

/** Pull the plain text out of a message, ignoring tool results and images. */
export function extractText(message) {
  const content = message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** True for an entry that carries words the user actually typed. */
export function isHumanEntry(entry) {
  if (entry?.type !== 'user') return false
  if (entry?.isSidechain) return false
  if (entry?.origin?.kind !== 'human') return false
  const text = extractText(entry.message)
  if (!text) return false
  return !NOISE_PREFIXES.some((prefix) => text.startsWith(prefix))
}

/** One transcript line → a row, or null when the line is not the user speaking. */
export function parseLine(line, fallbackSessionId = '') {
  if (!line || !line.trim()) return null
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }
  if (!isHumanEntry(entry)) return null
  const at = Date.parse(entry.timestamp ?? '')
  return {
    at: Number.isNaN(at) ? null : at,
    session: String(entry.sessionId ?? fallbackSessionId).slice(0, 8),
    text: extractText(entry.message),
  }
}

/**
 * `--since` accepts an ISO stamp, a relative age (`90m`, `6h`, `2d`) or a clock
 * time (`07:31`) that means today in the caller's zone. Anything else is an
 * error rather than a silent "no filter" — a since that quietly does nothing is
 * how a search reports "he never said it".
 */
export function parseSince(value, now = Date.now()) {
  if (value == null || value === '') return null
  const relative = /^(\d+)\s*([mhd])$/i.exec(String(value).trim())
  if (relative) {
    const scale = { m: 60_000, h: 3_600_000, d: 86_400_000 }[relative[2].toLowerCase()]
    return now - Number(relative[1]) * scale
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim())
  if (clock) {
    const day = new Date(now)
    day.setHours(Number(clock[1]), Number(clock[2]), 0, 0)
    return day.getTime()
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) throw new Error(`--since: not a time: ${value}`)
  return parsed
}

/** Filter and order the rows: oldest first, newest kept when `last` cuts. */
export function selectEntries(entries, { grep = null, since = null, session = null, last = 20 } = {}) {
  const pattern = grep ? new RegExp(grep, 'i') : null
  const kept = entries.filter((row) => {
    if (!row) return false
    if (pattern && !pattern.test(row.text)) return false
    if (since != null && (row.at == null || row.at < since)) return false
    if (session && !row.session.startsWith(session)) return false
    return true
  })
  kept.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  return last > 0 ? kept.slice(-last) : kept
}

/** One row, one line — newlines collapsed so a paragraph cannot break the table. */
export function formatEntry(row, { width = 120, full = false, timeZone = 'Europe/Berlin' } = {}) {
  const stamp = row.at == null
    ? '  ??.??. ??:??'
    : new Intl.DateTimeFormat('de-DE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone,
      }).format(new Date(row.at)).replace(', ', ' ')
  const flat = row.text.replace(/\s+/g, ' ').trim()
  const body = full || flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`
  return `${stamp} · ${row.session} · ${body}`
}
