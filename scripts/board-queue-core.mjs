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

import { parseTasks, QUEUE_STUB_META } from './dashboard-guard-core.mjs'
import { FINDER_POINTS, RELEASE_TAG_POINT } from './queue-order-guard-core.mjs'

// The stub meta is DEFINED beside the audit rule that exempts it and re-exported
// here: two copies of that string would be a block loop waiting to happen.
export { QUEUE_STUB_META }

/** Where the queue's prose and order live (git-ignored, like the board itself). */
export const QUEUE_DATA_PATH = '.claude/board-queue.json'

/** The body a point gets while nobody has written one. */
export const QUEUE_STUB_BODY =
  'Noch keine Beschreibung auf dem Board — der Punkt steht im Arbeitsauftrag. ' +
  'Text setzen: node scripts/board.mjs queue <N> "<Text>".'

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
  for (const line of text.split('\n')) {
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
    points[n] = { title: str(value.title), body: str(value.body), estimate: str(value.estimate) }
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
    out.push({
      point,
      title: entry.title || titles[point] || `Punkt ${point}`,
      body: entry.body || QUEUE_STUB_BODY,
      meta: entry.estimate || QUEUE_STUB_META,
      stub,
    })
  }
  return out
}

/** One card, in exactly the markup the board guard's parsers read. */
export function renderQueueCard({ point, title, body, meta }) {
  return (
    `<details>\n  <summary><span class="num">${Number(point)}</span><span class="t">${esc(title)}</span>` +
    `<span class="right"><span class="meta">${esc(meta)}</span></span></summary>\n` +
    `  <div class="body">\n    <p>${esc(body)}</p>\n  </div>\n</details>\n`
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
 * `exclude` must already hold every point the other sections claim — see the
 * two-writers note at the head of this file.
 */
export function buildQueueSection(html, { open = [], data = null, exclude = [], titles = {} } = {}) {
  const doc = String(html ?? '')
  const { from, end } = queueSectionBounds(doc)
  const entries = queueEntries({ open, data, exclude, titles })
  return { html: `${doc.slice(0, from)}\n${renderQueueCards(entries)}${doc.slice(end)}`, entries }
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

/** The open points of a work-order text — the projection's other input. */
export function openPointsOf(tasksText) {
  return parseTasks(String(tasksText ?? '')).open
}
