// Pure core of the DERIVED QUEUE (point 400, delta C). Side-effect free, so the
// Vitest layer can sweep every rule without a filesystem
// (scripts/board-queue-core.test.mjs).
//
// WHY THIS EXISTS. The board's footer has been DERIVED since point 371
// (`refreshFooter` + `parseTasks`), and it went stale on 28.07.2026 for one
// reason only: the board HTML was hand-edited past that pipeline. The queue
// section had never been derived at all — it was maintained by hand, card by
// card, against a work order that changes several times a day. Three cards were
// missing from the published board for up to 25 minutes.
//
// So the queue becomes a PROJECTION, not a document:
//
//     TASKS.md (which points are open)  +  board-queue.json (prose and order)
//                              ↓  buildQueueSection
//                        the Warteschlange HTML
//
// TWO WRITERS ON ONE HTML IS THE TRAP. A generator that re-adds a card for a
// point already promoted to the now-section trips the double-listing invariant
// (4b) of dashboard-guard-core, and the guard is right to block: the reader
// would see one point as simultaneously in progress and waiting. The generator
// therefore takes an EXCLUDE set — every point the other sections already
// claim — and the caller derives it from the live document rather than from
// memory.
//
// A POINT WITH NO PROSE YET GETS A STUB, NEVER NOTHING. Silence would drop the
// point off the board entirely, which is the exact failure this point exists to
// end. The stub names the point (headline read from the work order) and says
// plainly that it has no description yet. Because `auditDashboard` demands a
// "~<n> h" estimate on every queue card, the stub carries an EXPLICIT
// unestimated marker that the audit accepts by name — otherwise the stub would
// block `--synced` and create the very block loop this design exists to
// prevent.

import { parseTasks, QUEUE_STUB_BODY, QUEUE_STUB_META, TRANSLITERATION_STEMS } from './dashboard-guard-core.mjs'
import { normaliseLineEndings } from './board-core.mjs'
import { FINDER_POINTS, RELEASE_TAG_POINT } from './queue-order-guard-core.mjs'

// The stub meta is DEFINED beside the audit rule that exempts it and re-exported
// here: two copies of that string would be a block loop waiting to happen.
export { QUEUE_STUB_BODY, QUEUE_STUB_META }

/** Where the queue's prose and order live (git-ignored, like the board itself). */
export const QUEUE_DATA_PATH = '.claude/board-queue.json'

/** The command that gives a card a German title — named by every report below. */
export const TITLE_CMD = 'node scripts/board-queue.mjs set <N> --title --text-stdin'

/** …and the one that gives it an estimate. */
export const ESTIMATE_CMD = 'node scripts/board-queue.mjs set <N> --estimate "~2 h"'


/** Minimal HTML escaping for text that goes into a card. */
export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * The one-line headline of each point in the work order, keyed by number. Used
 * for a stub card's title, so a point with no board prose is still NAMED rather
 * than reduced to its number.
 *
 * The cut is deliberately blunt — up to the first sentence end or bracket, hard
 * capped — because a work-order point opens with its title and continues into a
 * paragraph; taking the whole line would put a spec on the board.
 */
export function parseTaskTitles(text, { maxLength = 90 } = {}) {
  const titles = {}
  if (typeof text !== 'string') return titles
  // LINE ENDINGS NORMALISED FIRST (point 439, root cause found 30.07.2026). The
  // pattern below is anchored with `$`, and `.` never matches a `\r`: on a
  // checkout where TASKS.md carries CRLF, `split('\n')` leaves a trailing `\r` on
  // every line and this function returned ZERO titles — silently. The fallback
  // chain in `queueEntries` then landed on its LAST rung, and the user read a run
  // of cards saying "444 Punkt 444, 445 Punkt 445 …" on his phone. The middle
  // rung had never carried anything on such a checkout; only cards whose title
  // had been hand-written into the data file looked right.
  for (const line of normaliseLineEndings(text).split('\n')) {
    const m = line.match(/^- \[[ x]\] (\d+)\.\s*(.+)$/)
    if (!m) continue
    let title = m[2].trim()
    const cut = title.search(/\s\(|\s[—–]\s|(?<=[a-zäöüß])\.\s/u)
    if (cut > 12) title = title.slice(0, cut)
    if (title.length > maxLength) title = `${title.slice(0, maxLength - 1).trimEnd()}…`
    titles[Number(m[1])] = title.replace(/[\s.;:,—–-]+$/u, '')
  }
  return titles
}

/**
 * IS THIS CARD TITLE STILL THE WORK ORDER'S? (point 439)
 *
 * The fallback chain `entry.title || titles[point] || "Punkt N"` stays — a
 * nameless card is worse — but it may no longer pass unnoticed. The work-order
 * headline is ENGLISH by rule (`tasks-md-english`) and written in capitals, so
 * every appended point reached the German board shouting in the one language the
 * board is not written in; the user asked TWICE why. On 30.07.2026 eight of 77
 * cards stood that way.
 *
 * The comparison is against the PARSED HEADLINE, never a language heuristic: a
 * German title that merely resembles the headline is not reported, and one that
 * IS the headline is — whoever wrote it. That also keeps the same predicate
 * usable on a board read back from HTML, where provenance is no longer visible.
 */
export function isUntranslatedTitle(title, point, titles = {}) {
  const t = String(title ?? '').trim()
  if (!t) return true
  const n = Number(point)
  if (t === `Punkt ${n}`) return true
  const headline = String(titles?.[n] ?? '').trim()
  return headline !== '' && t === headline
}

/** The points whose rendered card still carries the work order's own headline. */
export function untranslatedTitlePoints(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e?.untranslated).map((e) => e.point)
}

/**
 * The points whose card carries the named "no estimate yet" marker (point 439).
 *
 * `auditDashboard` accepts `QUEUE_STUB_META` BY NAME, which is right — it must
 * not deadlock against a card only the generator can produce — but it meant an
 * unestimated card passed for ever: sixteen appended points sat in that hole at
 * once and nothing said so. The stub stays legitimate; it is now REPORTED.
 */
export function unestimatedPoints(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => String(e?.meta ?? '').trim() === QUEUE_STUB_META)
    .map((e) => e.point)
}

/** Undo the escaping `renderQueueCard` applied, so a title read back compares. */
const unesc = (text) =>
  String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * The same two reports, taken from a BOARD rather than from the data — what the
 * publish check reads, so a session cannot publish an untranslated title without
 * being told even when the queue was not rebuilt in this turn.
 */
export function boardTitleReport(html, titles = {}) {
  const { points } = importQueueFromHtml(html)
  const untranslated = []
  const unestimated = []
  for (const [key, entry] of Object.entries(points)) {
    const n = Number(key)
    if (isUntranslatedTitle(unesc(entry.title), n, titles)) untranslated.push(n)
    if (!entry.estimate) unestimated.push(n)
  }
  const asc = (a, b) => a - b
  return { untranslated: untranslated.sort(asc), unestimated: unestimated.sort(asc) }
}

/**
 * A card-writing command may never STORE a command-line flag as prose (point
 * 439) — the defect that put a literal `--text-stdin` on six live cards. The
 * check sits at the store boundary, so no CLI can route around it; a text that
 * legitimately begins with a single dash is untouched, and a `--` separator on
 * the CLI strips the flag marker before the value ever gets here.
 */
export function assertNotFlagValue(value, field) {
  const t = String(value ?? '').trim()
  if (/^--/.test(t)) {
    throw new Error(
      `board-queue: refusing to store the flag "${t.split(/\s+/)[0]}" as a card's ${field} — ` +
        'pass the text itself (--text-stdin pipes it in), or put a text that really starts with a dash after a bare "--".',
    )
  }
  return value
}

/**
 * A card body as the list of paragraphs it renders to. Accepts a single string
 * (one paragraph) or an array of them, and drops anything empty.
 *
 * The array form exists because the derived queue could only ever emit ONE <p>,
 * while the hand-kept board it replaced carried two or three per card — and the
 * conciseness guard flags exactly the long unbroken paragraph that collapsing
 * them produces. A body restored from the old board would have tripped the guard
 * it was restored to satisfy.
 */
export function paragraphs(value) {
  // A BLANK LINE INSIDE A STRING SPLITS IT (point 469). Text arrives here from
  // stdin as one string; taking it whole pressed every card into a single
  // 70-word block, which is what the conciseness guard rejects and what the
  // user reads as a wall. The author's own blank line is the paragraph break —
  // no other separator is invented.
  const one = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const split = (v) => (typeof v === 'string' ? v.split(/\r?\n[ \t\r]*\n+/) : [v])
  const list = (Array.isArray(value) ? value : [value])
    .flatMap(split)
    .map(one)
    .filter(Boolean)
  return list.length ? list : null
}

/**
 * Bring a stored data file into a shape the renderer can trust. Everything is
 * optional and everything hostile is dropped: this file is hand-editable and a
 * torn or half-typed one must degrade to stubs, never throw inside a hook.
 */
export function normaliseQueueData(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const order = []
  for (const n of Array.isArray(src.order) ? src.order : []) {
    const v = Number(n)
    if (Number.isInteger(v) && v > 0 && !order.includes(v)) order.push(v)
  }
  const points = {}
  const entries = src.points && typeof src.points === 'object' ? src.points : {}
  for (const [key, value] of Object.entries(entries)) {
    const n = Number(key)
    if (!Number.isInteger(n) || n <= 0 || !value || typeof value !== 'object') continue
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    points[n] = { title: str(value.title), body: paragraphs(value.body), estimate: str(value.estimate) }
  }
  return { order, points }
}

/**
 * The order the cards are rendered in.
 *
 * Three rules, applied in this order:
 *   1. points the data lists explicitly keep that order (the queue order is a
 *      judgment, and the work order's numbering is not it);
 *   2. anything unlisted is APPENDED, ascending — a new point joins at the end,
 *      which is where the append-and-defer rule puts it anyway;
 *   3. the bug-FINDING / QA points, and the release tag last of all, are moved
 *      to the BACK. That rule (memory queue-order-fixes-before-finders) is
 *      enforced by queue-order-guard at turn end; satisfying it by CONSTRUCTION
 *      means a newly appended fix can never trip it.
 */
export function queueOrder(open, data) {
  const { order } = normaliseQueueData(data)
  const wanted = (Array.isArray(open) ? open : []).map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const set = new Set(wanted)
  const listed = order.filter((n) => set.has(n))
  const unlisted = wanted.filter((n) => !listed.includes(n)).sort((a, b) => a - b)
  const all = [...new Set([...listed, ...unlisted])]
  const rank = (n) => (n === RELEASE_TAG_POINT ? 2 : FINDER_POINTS.has(n) ? 1 : 0)
  return all
    .map((n, i) => ({ n, i, rank: rank(n) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.n)
}

/**
 * The cards to render: every OPEN point that no other section already claims,
 * in queue order, each with its prose or an explicit stub.
 *
 * `exclude` is the double-listing guard (invariant 4b): the caller passes the
 * points the now-cards, "Von dir zu klären" and Erledigt already hold.
 */
export function queueEntries({ open = [], data = null, exclude = [], titles = {} } = {}) {
  const { points } = normaliseQueueData(data)
  const skip = new Set((Array.isArray(exclude) ? exclude : [...exclude]).map(Number))
  const out = []
  for (const point of queueOrder(open, data)) {
    if (skip.has(point)) continue
    const entry = points[point] ?? { title: null, body: null, estimate: null }
    const stub = !entry.body
    const title = entry.title || titles[point] || `Punkt ${point}`
    out.push({
      point,
      title,
      body: entry.body ?? [QUEUE_STUB_BODY],
      meta: entry.estimate || QUEUE_STUB_META,
      stub,
      // The fallback is still TAKEN — it is no longer taken SILENTLY.
      untranslated: isUntranslatedTitle(title, point, titles),
    })
  }
  return out
}

// ---- the pending requests of other windows (point 462) ---------------------
//
// A window the user is talking to but which does not hold the batch deposits a
// finished spec in the findings carrier. It cannot publish the board — the lease
// fence refuses a non-owner exactly that — so the card is rendered HERE, by the
// owner's queue rebuild, and the user sees his instruction arrived and where it
// stands without asking.

/** How many pending requests the card names before it says "and n more". */
export const REQUEST_CARD_MAX = 5

/** The card's title — no leading number, so no parser reads it as a point. */
export const REQUEST_CARD_TITLE = 'Anfragen aus anderen Fenstern'

/** ae/oe/ue back to ä/ö/ü, but ONLY in a word the audit's stem list flags. */
const UMLAUT = { ae: 'ä', oe: 'ö', ue: 'ü' }
export function repairTransliteration(word) {
  const w = String(word ?? '')
  if (!TRANSLITERATION_STEMS.some((stem) => w.toLowerCase().includes(stem))) return w
  return w.replace(/[AaOoUu][eE]/g, (digraph) => {
    const letter = UMLAUT[digraph.toLowerCase()]
    return /[A-Z]/.test(digraph[0]) ? letter.toUpperCase() : letter
  })
}

/**
 * A deposit's title, made safe for a board card.
 *
 * The title is written in another window, by another session, and lands on a
 * card the OWNER then publishes — so a title carrying a file path, a `§` or a
 * point reference would block the owner's turn end on the conciseness and
 * card-topic guards, for text it never wrote. Neutralising it here keeps the
 * meaning readable and the guards satisfied by construction.
 */
export function boardSafeTitle(title, { maxLength = 60 } = {}) {
  let t = String(title ?? '').replace(/\s+/g, ' ').trim()
  const stem = (path) => (path.split('/').pop() ?? path).replace(/\.[a-z]+$/i, '')
  // A TITLE IS THE ONE FIELD THAT TRAVELS AS AN ARGUMENT (four-eyes finding 2,
  // Fable 5): the depositing window is told its umlauts do not survive a Windows
  // shell, so it writes "fuer"/"pruefen" — and the board audit rejects exactly
  // that, on the OWNER's turn, for text it never wrote. The repair is applied
  // only to the words the audit's own stem list flags, so ordinary German
  // ("Steuerung", "Aequator") is untouched.
  t = t.replace(/[A-Za-zÄÖÜäöüß]+/g, repairTransliteration)
  t = t
    .replace(/\b(?:src|scripts|docs)\/[\w./-]+/g, (m) => stem(m))
    .replace(/\b[\w-]+\.(?:mjs|cjs|ts|tsx|js|md)\b/g, (m) => stem(m))
    .replace(/§\s*/g, 'Abschnitt ')
    .replace(/\b[0-9a-f]{7,40}\b/g, (m) => (/\d/.test(m) ? 'Rev.' : m))
    .replace(/\b(punkt|point)\s+(\d{1,3})\b/gi, '$1 Nr. $2')
    .replace(/\((\d{2,3})\)/g, '[Nr. $1]')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > maxLength ? `${t.slice(0, maxLength - 1).trimEnd()}…` : t
}

/**
 * The card naming the pending requests, or '' when none wait (an empty card
 * would be a permanent fixture saying nothing, and the audit refuses an empty
 * body anyway). The meta is the named "no estimate yet" marker: a deposit that
 * has not become a point cannot carry a duration, and the audit accepts that
 * marker by name.
 */
export function renderRequestsCard(requests, { max = REQUEST_CARD_MAX } = {}) {
  const list = (Array.isArray(requests) ? requests : []).filter((r) => r && r.title)
  if (!list.length) return ''
  const shown = list.slice(0, max)
  const day = (at) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(at ?? ''))
    return m ? `${m[3]}.${m[2]}.` : ''
  }
  const body = [
    list.length === 1
      ? 'Eine Anfrage wartet darauf, in den Arbeitsauftrag übernommen zu werden.'
      : `${list.length} Anfragen warten darauf, in den Arbeitsauftrag übernommen zu werden.`,
    ...shown.map((r) => {
      const when = day(r.at)
      const mark = r.route === 'vdzk' ? ' — braucht deine Entscheidung' : ''
      return `${when ? `${when} ` : ''}${boardSafeTitle(r.title)}${mark}`
    }),
  ]
  if (list.length > shown.length) body.push(`… und ${list.length - shown.length} weitere.`)
  return (
    `<details>\n  <summary><span class="num">✳</span><span class="t">${esc(REQUEST_CARD_TITLE)}</span>` +
    `<span class="right"><span class="meta">${esc(QUEUE_STUB_META)}</span></span></summary>\n` +
    `  <div class="body">\n${body.map((p) => `    <p>${esc(p)}</p>\n`).join('')}  </div>\n</details>\n`
  )
}

/** One card, in exactly the markup the board guard's parsers read. */
export function renderQueueCard({ point, title, body, meta }) {
  return (
    `<details>\n  <summary><span class="num">${Number(point)}</span><span class="t">${esc(title)}</span>` +
    `<span class="right"><span class="meta">${esc(meta)}</span></span></summary>\n` +
    `  <div class="body">\n${(paragraphs(body) ?? [QUEUE_STUB_BODY])
      .map((p) => `    <p>${esc(p)}</p>\n`)
      .join('')}  </div>\n</details>\n`
  )
}

/** The whole Warteschlange body, cards only — the section wrapper is the caller's. */
export function renderQueueCards(entries) {
  return (Array.isArray(entries) ? entries : []).map(renderQueueCard).join('')
}

/** Where the Warteschlange section's card list begins and ends in the board. */
export function queueSectionBounds(html) {
  const doc = String(html ?? '')
  const head = '<summary><h2>Warteschlange</h2></summary>'
  const at = doc.indexOf(head)
  if (at < 0) throw new Error('board: Warteschlange section not found')
  const from = at + head.length
  const nextSect = doc.indexOf('<details class="sect">', from)
  const end = nextSect < 0 ? doc.length : doc.lastIndexOf('\n</details>', nextSect)
  return { from, end: end < from ? doc.length : end }
}

/**
 * Replace the Warteschlange section with the projection of `data` over the work
 * order. Returns the new document; the caller decides whether to write it.
 *
 * ONE FLAT LIST (point 472). Point 452 had grouped the cards by bundle; within
 * the hour the reasoning had collapsed and the user took it back out: a flat
 * queue IS the working order, read top to bottom, while a grouped one is not,
 * because the agent pool draws its three slots from different bundles. The
 * bundle survives as the internal collision map and as the priority ranking in
 * `docs/work-packages.md` — it is never rendered.
 *
 * `exclude` must already hold every point the other sections claim — see the
 * two-writers note at the head of this file.
 *
 * `requests` are the deposits of other windows (point 462); they render as ONE
 * card at the end of the section. Because the whole section is rewritten here,
 * a request that has since been queued disappears from the board on the next
 * rebuild without anything having to remember it.
 */
export function buildQueueSection(html, { open = [], data = null, exclude = [], titles = {}, requests = [] } = {}) {
  const doc = String(html ?? '')
  const { from, end } = queueSectionBounds(doc)
  const entries = queueEntries({ open, data, exclude, titles })
  const cards = `${renderQueueCards(entries)}${renderRequestsCard(requests)}`
  return { html: `${doc.slice(0, from)}\n${cards}${doc.slice(end)}`, entries }
}

/**
 * Seed the data file from a board that still carries a hand-written queue — the
 * one-time migration, so the transition to the generator does not throw the
 * existing prose away. Reads only the Warteschlange section.
 */
export function importQueueFromHtml(html) {
  const doc = String(html ?? '')
  let section = ''
  try {
    const { from, end } = queueSectionBounds(doc)
    section = doc.slice(from, end)
  } catch {
    return { order: [], points: {} }
  }
  const order = []
  const points = {}
  for (const chunk of section.split(/<details\b/).slice(1)) {
    const summary = (chunk.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
    const num = summary.match(/class="num">\s*(\d+)\s*</)
    if (!num) continue
    const point = Number(num[1])
    const title = (summary.match(/class="t">([\s\S]*?)<\/span>/) ?? [])[1] ?? ''
    const metaRaw = (summary.match(/class="meta">([^<]*)</) ?? [])[1] ?? ''
    const body = ((chunk.match(/<div class="body[^"]*">([\s\S]*)$/) ?? [])[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    if (!order.includes(point)) order.push(point)
    points[point] = {
      title: title.trim() || null,
      body: body || null,
      estimate: metaRaw.trim() && metaRaw.trim() !== QUEUE_STUB_META ? metaRaw.trim() : null,
    }
  }
  return { order, points }
}

/** Write one point's prose into the data (returns a NEW object — pure). */
export function setQueueEntry(data, point, { title, body, estimate } = {}) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`board: not a point number: ${point}`)
  assertNotFlagValue(title, 'title')
  assertNotFlagValue(Array.isArray(body) ? body[0] : body, 'body')
  assertNotFlagValue(estimate, 'estimate')
  const { order, points } = normaliseQueueData(data)
  const prev = points[n] ?? { title: null, body: null, estimate: null }
  const pick = (next, old) => (typeof next === 'string' && next.trim() ? next.trim() : old)
  return {
    order: order.includes(n) ? order : [...order, n],
    points: {
      ...points,
      [n]: { title: pick(title, prev.title), body: pick(body, prev.body), estimate: pick(estimate, prev.estimate) },
    },
  }
}

/** The flag that fills ONE field from stdin, spelled as `board.mjs` spells it. */
export const SET_STDIN_FLAG = '--text-stdin'

/** Every flag `set` knows — named back at a caller that mistyped one. */
export const SET_FLAGS = Object.freeze(['--title', '--estimate', SET_STDIN_FLAG, '--'])

/**
 * Split `set`'s argv into its buckets (point 439). PURE, so the flag handling is
 * pinned by tests rather than by the shape of one `indexOf`.
 *
 *   set <N> "<text>"                    body from the argv
 *   set <N> --text-stdin                body from stdin
 *   set <N> --title --text-stdin        title from stdin (the umlaut-safe path)
 *   set <N> --estimate "~2 h"           estimate from the argv
 *   set <N> -- "-so beginnt der Text"   everything after `--` is literal text
 *
 * `stdinField` names which of the three the piped text fills; only one may claim
 * it, because silently picking would drop the other.
 */
export function parseSetArgs(rest) {
  const args = (Array.isArray(rest) ? rest : []).map((a) => String(a))
  const buckets = { body: [], title: [], estimate: [] }
  const out = { point: args[0], title: null, body: null, estimate: null, stdinField: null }
  let field = 'body'
  let literal = false
  for (const a of args.slice(1)) {
    if (!literal) {
      // A bare `--` ends the flags for the CURRENT field, so a text that begins
      // with a dash stays writable without a second command.
      if (a === '--') {
        literal = true
        continue
      }
      if (a === '--title' || a === '--estimate') {
        field = a.slice(2)
        continue
      }
      if (a === SET_STDIN_FLAG) {
        if (out.stdinField) throw new Error(`board-queue: ${SET_STDIN_FLAG} can fill only ONE field per call`)
        out.stdinField = field
        continue
      }
      if (a.startsWith('--')) {
        throw new Error(
          `board-queue: "${a}" is not a flag this command knows — it takes ${SET_FLAGS.join(', ')}. ` +
            'A card text that really starts with a dash goes after a bare "--".',
        )
      }
    }
    buckets[field].push(a)
  }
  for (const key of ['title', 'body', 'estimate']) {
    const joined = buckets[key].join(' ').trim()
    if (joined) out[key] = joined
  }
  return out
}

/** The open points of a work-order text — the projection's other input. */
export function openPointsOf(tasksText) {
  return parseTasks(String(tasksText ?? '')).open
}
