// THE ORIGIN LINE of a board card: when a point was filed and by whom.
// Pure core (Vitest: scripts/board-origin-core.test.mjs); the git read lives in
// scripts/board-origin.mjs.
//
// Sources, in this order: the point's own `Source:` line in the work order or
// its archive; otherwise the commit that first added the point's header line to
// TASKS.md; otherwise the line says the origin is unknown — never a guess.
//
// A referenced point is written as a bare number ("beim Abarbeiten von 1234"):
// the card-topic guard reads "Punkt N" as a foreign-point reference.
import { parsePointBlocks } from './criticality-review-guard-core.mjs'
import { summaryPoint, unwrapCardHeaderGroups } from './board-core.mjs'

/** The board is German; the English set is kept beside it so a switch is one constant. */
export const ORIGIN_TEXT = {
  de: {
    filed: 'Eingestellt:',
    unknown: 'Herkunft unbekannt',
    byUnknown: 'Urheber unbekannt',
    user: 'durch Benutzeranfrage',
    userBug: 'durch Fehlerbericht des Benutzers',
    agent: 'durch Agenten',
    working: (n) => `durch Agenten, der beim Abarbeiten von ${n} auf das Problem gestoßen ist`,
    review: (n) => `durch Agenten beim Review von ${n}`,
    covering: (n) => `durch Agenten im Deckungslauf von ${n}`,
    split: (n) => `durch Agenten, abgespalten von ${n}`,
  },
  en: {
    filed: 'Filed:',
    unknown: 'Origin unknown',
    byUnknown: 'author unknown',
    user: 'by user request',
    userBug: 'by user bug report',
    agent: 'by an agent',
    working: (n) => `by an agent while working on ${n}`,
    review: (n) => `by an agent reviewing ${n}`,
    covering: (n) => `by an agent in the covering run of ${n}`,
    split: (n) => `by an agent, split from ${n}`,
  },
}

export const BOARD_LANG = 'de'

/** Each point's `Source:` text (first one in its block), keyed by number. */
export function sourceLines(text) {
  const out = new Map()
  for (const block of parsePointBlocks(String(text ?? '').replace(/\r\n/g, '\n'))) {
    const m = /^\s*Source:\s*(.+)$/m.exec(block.body)
    if (m && !out.has(block.n)) out.set(block.n, m[1].trim())
  }
  return out
}

/** The first date in a text as { d, m, y } (DD.MM.YYYY or YYYY-MM-DD), or null. */
export function firstDate(text) {
  const s = String(text ?? '')
  const de = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(s)
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s)
  const atDe = de ? de.index : Infinity
  const atIso = iso ? iso.index : Infinity
  if (atDe === Infinity && atIso === Infinity) return null
  return atDe < atIso ? { d: Number(de[1]), m: Number(de[2]), y: Number(de[3]) } : { d: Number(iso[3]), m: Number(iso[2]), y: Number(iso[1]) }
}

/** TT.MM.JJ */
export function shortDate(date) {
  if (!date) return ''
  const two = (n) => String(n).padStart(2, '0')
  return `${two(date.d)}.${two(date.m)}.${two(date.y % 100)}`
}

/**
 * Who filed a point, read from a `Source:` text:
 * { by: 'user' | 'userBug' | 'agent', context: null | { type, point } }.
 */
export function classifySource(text) {
  const s = String(text ?? '')
  if (/\buser bug report\b/i.test(s)) return { by: 'userBug', context: null }
  if (/\buser(?:-approved)? (?:request|order)\b|\buser request\b|^user\b/i.test(s)) return { by: 'user', context: null }
  const at = (re, type) => {
    const m = re.exec(s)
    return m ? { type, point: Number(m[1]) } : null
  }
  const context =
    at(/\bsplit (?:from|of) point (\d+)/i, 'split') ||
    at(/\breview (?:of|on) (?:point )?(\d+)/i, 'review') ||
    at(/\bcovering\b.*?\bpoint (\d+)/i, 'covering') ||
    at(/\b(\d{2,})(?: landing)? session\b/i, 'working') ||
    at(/\bfeat\/(\d+)-/i, 'working') ||
    at(/\bpoint (\d+)/i, 'working')
  return { by: 'agent', context }
}

/**
 * Who filed a point, read from the commit that added it: user only when the
 * subject says so, agent when it names a split or a finding, otherwise unknown.
 */
export function classifyCommit(subject) {
  const s = String(subject ?? '')
  if (/\buser(?:'s)? (?:request|order|bug report)s?\b|\buser orders?\b|\bBenutzer/i.test(s)) return { by: 'user', context: null }
  const split = /\bsplit\b.*?\bpoint (\d+)/i.exec(s)
  if (split) return { by: 'agent', context: { type: 'split', point: Number(split[1]) } }
  if (/^split\b|\bfinding|\bfound\b/i.test(s)) return { by: 'agent', context: null }
  return { by: null, context: null }
}

/**
 * Parse `git log --reverse --format='@@C %H %cs %s' -U0 -- TASKS.md` into the
 * FIRST commit adding each point header: Map<n, { sha, date, subject }>.
 * `skip` holds commits whose additions are not real (a shallow clone's
 * grafted root shows the whole file as added).
 */
export function firstAdditions(logText, { skip = new Set() } = {}) {
  const out = new Map()
  let commit = null
  for (const line of String(logText ?? '').split('\n')) {
    const c = /^@@C ([0-9a-f]+) (\d{4}-\d{2}-\d{2}) ?(.*)$/.exec(line)
    if (c) {
      commit = skip.has(c[1]) ? null : { sha: c[1], date: c[2], subject: c[3] }
      continue
    }
    const p = /^\+- \[[ x]\] (\d+)\./.exec(line)
    if (p && commit && !out.has(Number(p[1]))) out.set(Number(p[1]), commit)
  }
  return out
}

/**
 * One point's origin: { date, by, context, from: 'source' | 'commit' | null }.
 * A `Source:` line without a date borrows the commit's date when there is one.
 */
export function originOf(point, { sources = new Map(), additions = new Map() } = {}) {
  const src = sources.get(point)
  const added = additions.get(point)
  const commitDate = added ? firstDate(added.date) : null
  if (src) return { ...classifySource(src), date: firstDate(src) ?? commitDate, from: 'source' }
  if (added) return { ...classifyCommit(added.subject), date: commitDate, from: 'commit' }
  return { by: null, context: null, date: null, from: null }
}

/** The rendered line, e.g. "Eingestellt: 18.11.26 durch Benutzeranfrage". */
export function originLine(origin, lang = BOARD_LANG) {
  const t = ORIGIN_TEXT[lang] ?? ORIGIN_TEXT.de
  const o = origin ?? {}
  if (!o.date && !o.by) return t.unknown
  let who = t.byUnknown
  if (o.by === 'user') who = t.user
  else if (o.by === 'userBug') who = t.userBug
  else if (o.by === 'agent') who = o.context && t[o.context.type] ? t[o.context.type](o.context.point) : t.agent
  const date = shortDate(o.date)
  if (!date) return `${t.filed} ${who}`
  return o.by ? `${t.filed} ${date} ${who}` : `${t.filed} ${date}, ${who}`
}

const ORIGIN_P_RE = /\n?[ \t]*<p class="origin">[\s\S]*?<\/p>/g
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Put the origin line under the description of every numbered card: before the
 * status divider, or at the end of the body when the card has none. Idempotent:
 * an existing origin line is replaced. Cards without a numeric chip and cards
 * whose point `originFor` does not know (returns undefined) are left alone.
 */
export function renderCardOrigins(html, originFor, lang = BOARD_LANG) {
  return String(html ?? '').replace(
    /(<summary>([\s\S]*?)<\/summary>\s*<div class="body">)([\s\S]*?)(\n[ \t]*<hr class="split">|\s*<\/div>)/g,
    (whole, head, summary, body, tail) => {
      const { chip } = summaryPoint(unwrapCardHeaderGroups(summary))
      if (chip == null) return whole
      const origin = originFor(Number(chip))
      if (origin === undefined) return whole
      const kept = body.replace(ORIGIN_P_RE, '').replace(/\s+$/, '')
      return `${head}${kept}\n    <p class="origin">${escapeText(originLine(origin, lang))}</p>${tail}`
    },
  )
}

/** The `Source:` line a newly deposited point carries, e.g. for a user request. */
export function sourceLineFor({ kind, at = new Date(), session = '' } = {}) {
  const d = at instanceof Date ? at : new Date(at)
  const two = (n) => String(n).padStart(2, '0')
  const stamp = `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`
  const who = kind === 'request' ? 'user request' : 'agent finding'
  return `Source: ${who} of ${stamp} via the findings carrier${session ? ` (session ${session})` : ''}.`
}

/** A spec with a `Source:` line appended — unless it already carries one. */
export function withSourceLine(spec, line) {
  const s = String(spec ?? '')
  if (/^\s*Source:/m.test(s)) return s
  return `${s.replace(/\s+$/, '')}\n${line}\n`
}
